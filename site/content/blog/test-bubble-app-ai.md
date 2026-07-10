---
title: Test a Bubble No-Code App With Plain-English Tests
description: "Learn how to test a Bubble app with plain-English AI tests that survive dynamic element IDs, generated DOM, and workflow reactivity."
date: 2026-06-08
category: guide
---

If you have ever tried to test a Bubble app with a traditional automation framework, you already know the pain: you open DevTools, you find a button, you copy the selector, and it looks like `div[id="uNQ0"] > div:nth-child(3) > button`. You write the test, it passes, you deploy a small change, and the ID becomes `uNQ7`. The test breaks even though nothing a user would notice actually changed. This guide shows a different approach to test a Bubble app, one where you describe intent in plain English and an AI agent drives a real browser to satisfy it, so the generated DOM stops being your problem.

Bubble is a genuinely powerful no-code platform. It builds a full single-page application out of your visual editor, wires up workflows, and serves reactive state without you writing a line of JavaScript. That power comes from a heavy code-generation layer, and that layer is exactly what makes conventional selector-based testing miserable. We will be honest about where Bubble's DOM fights you, honest about where an intent-based approach still needs help, and specific about the commands you run.

## Why testing a Bubble app is harder than it looks

Most tutorials treat "web app" as a single category. Bubble is not a hand-written React app with stable `data-testid` attributes that a developer chose on purpose. It is a runtime that compiles your editor design into HTML, and the identifiers it emits are an implementation detail of that compiler, not a contract you can rely on.

Three things make a Bubble app awkward to test with classic tooling:

**Dynamic, opaque element IDs.** Bubble assigns short generated IDs like `uNQ0aA` to elements. These are not meant to be human-readable and they are not guaranteed to be stable across edits, deploys, or even reorderings inside a group. A selector pinned to one of these is a time bomb.

**Deeply nested group structure.** The visual editor's groups, repeating groups, and floating groups become deeply nested `<div>` trees. A button you see as one clean control on screen might sit six or seven levels deep in the DOM, wrapped in layout containers that exist only to satisfy Bubble's responsive engine. CSS-path selectors down that tree are fragile by construction.

**Reactive, workflow-driven timing.** When a user clicks something in Bubble, a workflow fires. That workflow might run a search, update a data thing, show a group, and only then reveal the next control. There is rarely a clean "page loaded" signal. Traditional tests paper over this with hard-coded `sleep` calls, which are slow when they over-wait and flaky when they under-wait.

Put together, these three traits mean the effort to test a Bubble app with Selenium or a hand-written Playwright suite goes disproportionately into fighting the framework, not into checking that your product works.

## The intent-based alternative: describe what a user does

BrowserBash takes a different angle. Instead of selectors, you write a plain-English objective, and an AI agent reads the actual rendered page (its accessibility tree and visible text), decides which element matches your intent, and acts on it. You are describing what a human tester would do, not how the DOM is wired underneath.

Here is the simplest possible run against a Bubble app:

```bash
npm install -g browserbash-cli

browserbash run "Open https://my-app.bubbleapps.io, click the Log in button, \
  type test@example.com into the email field and hunter2 into the password field, \
  click Log in, then confirm the dashboard heading is visible" --agent
```

Notice what is absent. No `uNQ0` selectors. No XPath. No `waitForSelector`. The agent looks at the page the way a person would, finds the control labeled "Log in", and clicks it. When Bubble regenerates its IDs on your next deploy, the objective still reads "click the Log in button" and still works, because "Log in" is the visible label a user actually sees, and that is far more stable than the generated ID behind it.

The `--agent` flag emits NDJSON, one JSON event per line, which is what you want in CI or when an AI coding agent is orchestrating the run. You get a deterministic exit code too: 0 passed, 1 failed, 2 for an error or budget stop, 3 for timeout. No prose parsing.

### How intent survives Bubble's generated DOM

The reason this holds up is that the agent resolves elements at run time against the live page, not against a stored selector. Your `uNQ0` becoming `uNQ7` is invisible to the test because the test never referenced `uNQ0` in the first place. What the agent keys on is the semantic surface: the button text, the field label, the heading. Those come from your Bubble design decisions and change only when you deliberately rename them.

This is not magic and it is worth being precise about the mechanism. BrowserBash reads the page snapshot, hands the agent a view of the interactive elements and text, and the agent picks the match for your English instruction. If two buttons both say "Save", you disambiguate the same way you would tell a human colleague: "click the Save button in the settings panel". Good objectives read like good bug-repro steps.

## Writing your first Bubble test file

One-off `run` commands are great for exploring. For a suite you commit to your repo, you want Markdown test files. A `*_test.md` file is a title, a list of steps, and optional imports and variables. It lives next to your code, it reviews like prose in a pull request, and BrowserBash writes a human-readable `Result.md` after each run.

A basic Bubble login-and-create flow as a test file looks like this:

```
# Create a new project in the Bubble app

- Open https://my-app.bubbleapps.io
- Click the Log in button
- Type {{email}} into the email field
- Type {{password}} into the password field
- Click Log in
- Wait for the dashboard to load
- Click the New Project button
- Type "Q3 Launch Plan" into the project name field
- Click Create
- Verify text "Q3 Launch Plan" is visible
```

The `{{email}}` and `{{password}}` tokens are variables. Secret-marked variables are masked as `*****` in every log line, so your test password never shows up in CI output. That `Verify` line at the end is not agent judgment, it is a deterministic Playwright check, which we will get to shortly because it matters a lot for Bubble.

You can compose files with `@import`, so a shared "log in and land on the dashboard" preamble lives in one place and every feature test pulls it in. That keeps the re-login boilerplate out of each individual test. If you are new to the format, the [tutorials](https://browserbash.com/tutorials) walk through building a suite from scratch.

## Deterministic checks that do not trust the AI's opinion

Here is a subtle trap. If your assertion is agent-judged, the agent decides whether the app is in the right state, and an AI's judgment is probabilistic. For a Bubble app where workflows quietly succeed or fail, you want the important checks to be hard and reproducible, not a model's best guess.

BrowserBash's `Verify` steps compile to real Playwright expectations with no LLM in the loop. The grammar covers the checks you actually need for a Bubble flow:

- URL contains a path
- Title is or contains a string
- Text is visible on the page
- A named button, link, or heading is visible (`'Create' button visible`)
- Element counts (how many rows in that repeating group)
- A stored value equals an expected value

A pass means the condition genuinely held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the `Result.md` assertion table, so a red build tells you what the app showed instead of what you expected. If you write a `Verify` line that falls outside the supported grammar, it still runs, but it is agent-judged and flagged `judged: true`, so you can always tell a deterministic check from an interpreted one at a glance.

For a Bubble repeating group, an element-count assertion is gold. After you create three projects, "verify there are 3 project cards" is a real count against the live DOM, not a vibe. That catches the classic Bubble bug where a workflow fires twice and silently duplicates a data thing.

## Handling Bubble's reactive workflows with step-by-step execution

Bubble's biggest timing challenge is that a single click can kick off a chain of workflow actions before the next control appears. testmd v2 is built for exactly this. Add `version: 2` to the frontmatter of your test file and steps execute one at a time against a single browser session, instead of being flattened into one big objective.

That gives you two deterministic step types that never call a model, which is perfect for the seed-then-check pattern:

```
---
version: 2
auth: bubble-user
---

# Verify a seeded order shows up in the Bubble dashboard

- POST https://my-app.bubbleapps.io/api/1.1/wf/create_order with body {"item": "Widget", "qty": 5}
- Expect status 200, store $.response.id as 'orderId'
- Open https://my-app.bubbleapps.io/dashboard
- Find the orders table
- Verify text "Widget" is visible
- Verify 'Widget' link visible
```

The `POST` and `Expect status` lines are API steps. They hit Bubble's own Data API or a backend workflow endpoint directly to seed state, with zero browser and zero model cost, then the plain-English steps and `Verify` steps check that the seeded record actually renders in the UI. Consecutive English steps run as a grouped agent block on the same page, so "find the orders table" and the checks after it share one context.

One honest caveat, spelled out plainly: testmd v2 currently drives the builtin engine, which speaks the Anthropic API. You need an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway for v2 files. It does not yet run directly on local Ollama or OpenRouter. Your v1 files (no frontmatter) still run on whatever model you have configured, including free local models. Pick v2 when you need per-step precision and API seeding; stay on v1 when you want the fully local, no-API-key path.

## Saving your Bubble login once instead of every test

Logging into Bubble at the start of every test is slow and, worse, it is a place where flakiness creeps in. Bubble's login is itself a workflow, and doing it hundreds of times a day is wasted effort.

Save the session once:

```bash
browserbash auth save bubble-user --url https://my-app.bubbleapps.io/login

# a browser opens, you log in by hand, press Enter to save the session

browserbash testmd run ./tests/create-project_test.md --auth bubble-user
```

The `auth save` command opens a real browser, you log in as yourself, and pressing Enter stores the Playwright storageState. After that, `--auth bubble-user` reuses it on `run`, `testmd`, `run-all`, and `monitor`, and you can set `auth: bubble-user` in a test file's frontmatter as shown above. If the saved profile's origins do not cover the URL your test starts on, BrowserBash prints a warning instead of silently doing nothing, which saves you a confusing "why is it on the login page" debugging session.

This one change, reusing a saved login, typically does more for suite speed and stability against a Bubble app than any other single tweak, because it removes the most workflow-heavy step from every test.

## Running the whole Bubble suite in parallel

Once you have a folder of test files, `run-all` executes them with a memory-aware parallel orchestrator. It derives concurrency from your actual CPU and RAM, orders previously-failed and slowest tests first for faster feedback, and flags flaky tests. It also writes JUnit XML for your CI.

```bash
browserbash run-all ./tests --auth bubble-user --junit out/junit.xml --budget-usd 2.00

# split across CI machines with deterministic sharding
browserbash run-all ./tests --shard 2/4 --auth bubble-user
```

Two flags earn their keep on a Bubble project. The `--budget-usd` cap stops launching new tests once the suite crosses your spend limit: remaining tests report as `skipped`, the suite exits 2, and the spend lands in `RunAll-Result.md` and the JUnit properties. If you run a hosted model, that is a hard ceiling on a runaway suite. The `--shard 2/4` flag runs a deterministic slice computed on sorted discovery order, so four CI machines each take a quarter with no coordination between them and no test running twice.

The replay cache quietly helps here too. A green run records its actions; the next identical run replays them with zero model calls, and the agent steps back in only when the page actually changed. For a stable Bubble flow that has not been edited, most reruns become nearly free.

### Migrating an existing Playwright suite

If you already have Playwright tests against your Bubble app, held together with brittle generated-ID selectors, you do not have to rewrite them by hand. Running `browserbash import ./e2e/specs --out ./tests` converts specs to plain-English test files heuristically, with no model, fully deterministic and reproducible. It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common expects. Any `process.env.X` becomes a `{{X}}` variable. Anything it cannot translate cleanly lands in `IMPORT-REPORT.md` rather than being silently dropped or invented, so you know exactly what needs a human pass. For a Bubble suite, the `getByRole` and `getByText` calls translate cleanly, and the nasty `nth-child` chains are precisely the parts that show up in the report for you to rewrite as plain intent. That is usually the good trade: the fragile selectors were the liability anyway.

## A quick comparison of approaches

Here is how the intent-based approach stacks up against the two ways teams usually test a Bubble app today.

| Concern | Selector-based (Selenium/Playwright) | Bubble's built-in testing | BrowserBash (intent-based) |
| --- | --- | --- | --- |
| Reaction to regenerated IDs | Breaks; selectors pinned to `uNQ0` | N/A | Unaffected; keys on visible labels |
| Handling nested group DOM | Fragile CSS/XPath paths | N/A | Reads accessibility tree, ignores wrappers |
| Workflow timing | Manual sleeps, flaky | Limited | Agent waits for the state you describe |
| Deterministic assertions | Yes, if you write them | Not publicly specified for E2E | Yes, via `Verify` (real Playwright checks) |
| Writing effort | High (selectors + waits) | Low but limited scope | Low (plain English) |
| Runs fully offline | Yes | N/A | Yes on local models (v1 files) |

Bubble does offer preview and manual testing inside the editor, and its exact automated end-to-end testing surface is not publicly specified in a way worth quoting, so we will not pretend to characterize it. The honest point is that no-code platforms optimize for building, and external end-to-end coverage is where a tool like BrowserBash fits. For a fuller feature tour, the [features page](https://browserbash.com/features) lays out what each mode does.

## Monitoring your live Bubble app

Testing does not stop at merge. A Bubble app in production can break for reasons that have nothing to do with your last deploy: a plugin update, a Bubble platform change, an expired API connection. Monitor mode runs a test or objective on an interval and alerts only when the state flips between pass and fail, in either direction, never on every green run. A single command, `browserbash monitor ./tests/checkout_test.md --every 10m --auth bubble-user --notify <webhook-url>`, is all it takes to keep watch.

Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload. Because the replay cache makes a stable flow nearly token-free, an always-on monitor against your Bubble app costs very little to run every ten minutes. You get a Slack ping when checkout breaks and another when it recovers, and silence in between, which is the alerting behavior you actually want.

## When intent-based testing is the wrong tool

Credibility matters more than a sales pitch, so here is where this approach is not the best fit for a Bubble app.

If your check is purely structural and you already have a stable hook, a direct assertion is simpler than invoking an agent. If your Bubble app exposes clean API endpoints and the thing you care about is data correctness rather than the rendered experience, test the API directly; that is faster and more deterministic than any UI approach. And if you are running very small local models (roughly 8B parameters and under) on a long, branchy Bubble workflow, expect some flakiness. The sweet spot for hard multi-step flows is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. For a two-step check on a simple page, a tiny local model is fine and free.

The right mental model: use intent-based tests for the user journeys where Bubble's generated DOM makes selectors a nightmare, which is most of them, and reach for direct API checks or a pinned selector on the rare occasions where you have a stable contract and want maximum speed. You can read more real-world breakdowns on the [blog](https://browserbash.com/blog), and the [learn hub](https://browserbash.com/learn) covers the concepts in depth.

### A realistic Bubble workflow, end to end

A practical setup for a small team shipping a Bubble app looks like this. You save one login with `auth save`. You write a handful of `*_test.md` files covering signup, the core create-read-update flow, and checkout, using `Verify` steps for the assertions that must be deterministic and testmd v2 API steps to seed data for the read-heavy screens. You wire `run-all --junit` into CI with a `--budget-usd` cap so a bad prompt can never run up a bill. You point a `monitor` at your production checkout every ten minutes. And when someone regenerates half the page in the Bubble editor and the IDs churn, none of it breaks, because not one line of your suite ever referenced an ID.

That is the shift. You stop maintaining a selector layer that exists only to fight a code generator, and you spend that time writing tests that read like the acceptance criteria they came from.

## FAQ

### Can you test a Bubble app without writing any selectors?

Yes. BrowserBash uses plain-English objectives, and an AI agent reads the live page and picks the element that matches your intent, so you never write a CSS selector or XPath. This is the main reason it holds up against Bubble, whose generated element IDs like `uNQ0` are unstable across edits and deploys. You describe the button by its visible label, which changes only when you deliberately rename it.

### Why do Selenium tests keep breaking on Bubble apps?

Bubble compiles your visual design into HTML and assigns short generated IDs that are an implementation detail, not a stable contract. When you edit the app or deploy, those IDs and the deeply nested group structure can change even though the user-facing screen looks identical. Selenium and hand-written Playwright tests pin their selectors to that generated markup, so they break on changes a user would never notice. Testing by intent against visible labels avoids that whole failure mode.

### Do I need an API key to test my Bubble app?

Not for the basic path. BrowserBash defaults to free local models through Ollama, so v1 test files and simple `run` commands work with no API key and nothing leaving your machine. You only need an Anthropic API key or a compatible gateway for testmd v2 files, which add per-step execution and deterministic API seeding steps. Very small local models can be flaky on long Bubble workflows, so a mid-size local model or a hosted model is better for complex flows.

### How do I check that a Bubble workflow actually saved data?

Use a deterministic `Verify` step, which compiles to a real Playwright check rather than relying on the AI's judgment. You can verify that text is visible, that a named element appears, or assert an exact element count, which catches the common Bubble bug where a workflow fires twice and duplicates a record. For read-heavy screens, testmd v2 lets you seed a record through Bubble's Data API with an API step, then verify it renders correctly in the UI.

Ready to test a Bubble app without fighting its generated DOM? Install the CLI with `npm install -g browserbash-cli` and write your first plain-English test in minutes. Creating an account is optional and everything runs locally by default, but if you want the free hosted dashboard you can [sign up here](https://browserbash.com/sign-up).
