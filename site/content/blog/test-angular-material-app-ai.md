---
title: Test an Angular Material App in Plain English
description: "Learn how to test an Angular Material app using plain English and an AI agent, with honest handling of mat-dialog overlays and CDK overlay-container timing."
date: 2026-05-13
category: guide
---

If you want to test an Angular Material app, you already know the pain that has nothing to do with your actual features. The button works. The form submits. The dialog opens. But your test suite is a graveyard of `mat-select` panels that were not attached to the DOM yet, `cdk-overlay-container` nodes that render at the bottom of `<body>` instead of inside your component, and ripple animations that swallow the click you just fired. You spend more time babysitting the framework than validating the product.

This guide takes a different route. Instead of hand-writing selectors against Angular Material's shadowy overlay internals, you describe what a user does in plain English, and an AI agent drives a real Chrome browser to do it, step by step. No page objects. No `waitForSelector('.mat-mdc-dialog-container')`. You write the intent, the agent figures out the DOM, and you get a deterministic verdict back. We will be honest throughout about where this shines and where the overlay-container timing still needs a little care, because pretending it is magic helps nobody who ships real Angular apps.

## Why Angular Material is uniquely hard to automate

Most UI test frameworks assume the thing you clicked lives near the thing that triggered it. Angular Material breaks that assumption on purpose. The Component Dev Kit (CDK) uses an overlay system: dialogs, menus, tooltips, autocompletes, date pickers, and select panels are all portaled out of your component tree and appended to a global `cdk-overlay-container` at the end of the document body.

That architecture is great for z-index sanity and accessibility. It is miserable for brittle selector-based tests:

- **Detached DOM.** When you click a `mat-select`, the options panel does not exist until the click. Your locator for `.mat-mdc-option` resolves to nothing if you query too early, and to a stale node if the panel closed and reopened.
- **Animation timing.** Material's MDC-based components animate open and closed. A click fired during the enter animation can land on a transitional bounding box, or get eaten entirely.
- **Auto-generated IDs.** `mat-form-field` and friends generate ids like `mat-input-3` that shift as the component tree changes. Anchoring tests to them is a losing game.
- **Ripples and overlays intercepting clicks.** The ripple element and backdrop can sit on top of your target for a few frames, producing the classic "not clickable at point" error.

Traditional advice is to memorize the CDK harness API and encode the quirks into every test. That works, and if your team already lives in `@angular/cdk/testing`, it is a fine path. But every new Material component becomes a fresh research project. The plain-English approach flips the cost model: the agent reads the rendered accessibility tree and pixels the way a human tester does, so a portaled overlay is just "the thing that appeared on screen," not a special DOM location you have to reason about.

## The plain-English approach with BrowserBash

[BrowserBash](https://github.com/PramodDutta/browserbash) is a free, open-source (Apache-2.0) command-line tool that turns a plain-English objective into a browser run. You write what a user would do, an AI agent drives a real Chrome or Chromium instance one step at a time, and you get back a deterministic verdict plus structured results. There are no selectors in your test, so there is nothing to break when Angular regenerates an id or reorders the overlay container.

Install it and run your first objective against a Material app:

```bash
npm install -g browserbash-cli

browserbash run "Open http://localhost:4200, click the 'Create Order' button, \
wait for the dialog to appear, select 'Priority' from the Type dropdown, \
type 'Test order 42' into the Notes field, click Save, and confirm a success \
snackbar with the text 'Order created' is visible" --agent --headless
```

Read that objective back. It never mentions `mat-dialog-container`, `cdk-overlay-pane`, or `mat-mdc-snack-bar-container`. It describes the dialog, the dropdown, and the snackbar the way you would explain the flow to a teammate. The agent handles the mapping from "the Type dropdown" to whatever portaled panel Material rendered.

The Ollama-first model story matters here too. By default BrowserBash resolves to a free local model through Ollama, so nothing leaves your machine and you do not need an API key to get started. If a local model is not present it falls back in order to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For a genuinely tricky multi-step Material flow you will get more reliable results from a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model. Very small local models around 8B and under can lose the thread on long overlay-heavy sequences, and it is better you hear that from me than discover it at 2am.

## Testing mat-dialogs by intent

The `mat-dialog` is the canonical CDK overlay. It opens via `MatDialog.open()`, portals into the overlay container, traps focus, and closes with a backdrop click or an explicit action. Here is what testing one by intent looks like, expanded across the flow a real user runs.

Consider an "Edit Profile" dialog. The user clicks an edit button, a dialog animates in, they change a field, they save, and the dialog closes with a confirmation. Written as an objective, that whole arc is one sentence of English. The agent opens the page, finds the trigger, waits for the dialog surface to actually be present and interactive (not just mounted), interacts with the field inside the portaled container, and then verifies the close.

The important mental shift: you are asserting on **observable outcomes**, not DOM structure. "The dialog is gone and the profile name now reads 'Ada Lovelace'" is a user-visible truth. Whether Angular removed the `cdk-overlay-pane` immediately or kept it for a leave animation is an implementation detail the agent watches for you.

For repeatable, committable tests you graduate from a one-off `run` to a Markdown test file. BrowserBash reads `*_test.md` files with a title, plain-English steps, `@import` composition, and `{{variables}}` templating. The Verify step is where determinism enters, and it deserves its own section because it is the antidote to "the AI said it passed."

## Deterministic Verify assertions for overlay content

Letting an agent judge success is convenient, but for CI you want checks that do not depend on a model's opinion. BrowserBash's `Verify` steps compile to real Playwright checks with no LLM judgment involved. The supported grammar covers exactly the things you assert on constantly in a Material app:

- URL contains a substring
- Title is or contains text
- Specific text is visible
- A named `button`, `link`, or `heading` is visible
- Element counts
- A stored value equals an expected value

When a Verify passes, the condition genuinely held. When it fails, you get expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table, so a red build tells you what the DOM actually showed instead of a vague "objective not met." If you write a Verify line outside the supported grammar, it still runs, but agent-judged, and it is flagged `judged: true` so you can tell deterministic checks apart from opinions at a glance.

For overlay content this is the difference between a trustworthy suite and a flaky one. "Verify text 'Order created' is visible" after a snackbar fires is a hard check against the rendered accessibility tree. "Verify the 'Save' button visible" inside a dialog confirms the portaled action row rendered. You are validating the overlay by what the user can perceive, which is exactly the contract your app promises.

## Being honest about overlay-container timing

Here is the caveat I promised, stated plainly rather than buried. The CDK overlay container introduces timing that no test tool can fully abstract away, because the timing is a property of your app, not the tool.

Three situations still need your attention:

**Enter and leave animations.** Material components animate. If your objective clicks a dialog action the instant the dialog opens, the agent may act during the enter transition. The fix is to describe the wait as part of the intent: "wait for the dialog to fully appear before clicking Save." The agent respects an explicit wait, and it also does its own readiness checks, but a hint costs you nothing and removes a whole class of flakiness.

**Backdrop and ripple interception.** For a beat after a click, the ripple element or a fresh backdrop can sit over your target. Phrasing the next step as a distinct action, rather than assuming an immediate second click lands, gives the frame time to settle. When you do hit an interception, the failure evidence in the assertions block will show you the state, which beats guessing.

**Multiple stacked overlays.** Open a `mat-select` inside a `mat-dialog` and you have two overlays in the container at once. Be specific: "in the open dialog, click the Country dropdown, then choose 'Canada' from the list." Naming the containing surface keeps the agent from wandering into the wrong pane.

None of these are unique to the plain-English approach. Selector-based Material suites fight the exact same timing, they just fight it with explicit `waitForSelector` calls scattered through helper files. Here your wait lives in a readable sentence instead of a utility function three directories away. Overlay timing is real, manageable, and your app's behavior showing through, not a defect in testing by intent.

## A committable testmd v2 example with seeded data

For a serious Material test you often need data to exist before the UI can show it. A profile page needs a profile. An orders table needs orders. testmd v2 handles this cleanly. Add `version: 2` frontmatter to a `*_test.md` file and steps execute one at a time against a single browser session, with two deterministic step types that never touch a model: API steps for seeding, and Verify steps for checking through the UI.

```bash
# .browserbash/tests/orders-dialog_test.md
---
version: 2
---

# Angular Material orders dialog

POST http://localhost:4200/api/orders with body {"title": "Seeded order", "type": "priority"}
Expect status 201, store $.id as 'orderId'

Open http://localhost:4200/orders
Click the row containing 'Seeded order' to open its detail dialog
Verify text 'Seeded order' is visible
Verify the 'Save' button visible
Change the Status dropdown to 'Shipped' and click Save
Verify text 'Order updated' is visible
```

Run it with:

```bash
browserbash testmd run .browserbash/tests/orders-dialog_test.md --agent
```

The `POST` step seeds a real record deterministically and stores the returned id, so your dialog test operates on known data instead of whatever happened to be in the database. The plain-English steps in the middle run as grouped agent blocks on the same page, opening the portaled detail dialog and interacting with its `mat-select`. The Verify steps at the end are hard checks. One honest note to plan around: testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. For the pure `run` and default-engine flows earlier in this guide, local Ollama is fully in play.

## Handling authenticated Material apps

Most real Angular Material apps sit behind a login. Re-authenticating at the start of every test is slow and, worse, it means half your dialog tests are actually login tests wearing a disguise. BrowserBash's saved-login feature fixes this.

Run `browserbash auth save` once, log in through the visible browser, press Enter to capture the session (a Playwright storageState), and every subsequent run reuses it:

```bash
browserbash auth save acme --url http://localhost:4200/login

browserbash run "Open http://localhost:4200/dashboard, open the user menu \
in the top toolbar, click 'Settings', and verify the 'Account' tab is visible" \
--auth acme --agent --headless
```

You can attach `--auth acme` to `run`, `testmd`, `run-all`, and `monitor`, or set `auth:` in a test file's frontmatter. If the saved profile's origins do not cover the start URL, BrowserBash prints a warning rather than silently doing nothing, so a stale session fails loud instead of producing a mysterious blank dashboard. This keeps your Material dialog and overlay tests focused on the feature under test instead of re-proving that login works.

## Running the whole suite in CI

Once you have a folder of Material test files, you run them together. The `run-all` orchestrator is memory-aware: concurrency is derived from real CPU and RAM, previously-failed and slowest tests run first, and flaky tests get flagged. You can slice the suite across CI machines and cap spend at the same time.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 \
  --junit out/junit.xml --agent
```

The shard slice is computed on sorted discovery order, so four parallel machines each running `--shard N/4` agree on who runs what without any coordination. The `--budget-usd 2` guard stops launching new tests once the suite crosses the budget: remaining tests report `skipped`, the suite exits with code 2, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. That protects you from a runaway bill if a hosted model gets stuck retrying a stubborn overlay.

Agent mode (`--agent`) emits NDJSON, one JSON event per line, built for CI and for AI coding agents rather than prose parsing. The exit codes are a frozen contract: 0 passed, 1 failed, 2 error or infra or budget-stop, 3 timeout. Your pipeline can branch on the code and read the structured `run_end` for details.

The [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wraps all of this. It installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating PR comment with the verdict table. For an Angular Material app under active development, a per-PR overlay-and-dialog smoke suite that comments its verdict directly on the pull request is a strong safety net.

### Replay cache keeps repeated runs cheap

There is a practical cost angle worth knowing. A green run records the actions it took, and the next identical run replays them with zero model calls. The agent only steps back in when the page actually changed. For a Material dialog flow that is stable release to release, this means your hundredth run of the same test is essentially free and fast, while still catching the run where a refactor moved the overlay content. That is what makes an always-on monitor practical:

```bash
browserbash monitor .browserbash/tests/orders-dialog_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run. Slack incoming-webhook URLs get Slack formatting automatically. Because of the replay cache, an always-on monitor of your critical dialog flow is nearly token-free.

## Migrating an existing Playwright Material suite

If you already have a Playwright suite full of `page.locator('.mat-mdc-dialog-container')` and `getByRole('option')` calls, you do not have to rewrite it by hand. The `browserbash import` command converts Playwright specs to plain-English `*_test.md` files heuristically, with no model involved, so the conversion is deterministic and reproducible:

```bash
browserbash import ./e2e/tests --out .browserbash/tests
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common `expect` assertions. `process.env.X` becomes a `{{X}}` variable. Anything it cannot confidently translate lands in an `IMPORT-REPORT.md` instead of being silently dropped or, worse, invented. You review that report, port the tricky overlay-harness bits by hand, and keep the rest. It is a starting point, not a magic wand, and the report is deliberately honest about what it could not convert.

For teams building tests fresh, `browserbash record <url>` opens a visible browser, you click through the Material flow once, and Ctrl-C writes a plain-English test. Password fields never leave the page: the capture sends only a secret marker and the generated step reads `Type {{password}} into ...`, so recorded auth flows stay safe to commit.

## Who this approach is for

Testing by intent is not the right answer for every team. Here is the balanced read.

| Your situation | Best fit |
| --- | --- |
| You want tests a non-engineer can read and edit | Plain-English BrowserBash |
| Your Material overlays change structure often, but behavior is stable | Plain-English BrowserBash |
| You already have deep `@angular/cdk/testing` harness expertise and love it | Keep your CDK harness suite |
| You need microsecond-precise animation frame assertions | Selector or harness-based Playwright |
| You want AI coding agents to validate their own Material UI changes | BrowserBash MCP server |
| You need a committable, deterministic API-plus-UI seed and check | testmd v2 |

The MCP row deserves a note. BrowserBash ships an MCP server (`browserbash mcp`) that exposes `run_objective`, `run_test_file`, and `run_suite` as Model Context Protocol tools. Add it to Claude Code, Cursor, Windsurf, or Codex with a one-line install, and your AI coding agent can validate the Angular Material component it just wrote by running a real browser and reading the structured verdict. A failed test is a successful validation: the tool call succeeds and the agent reads the pass-or-fail JSON.

And the honest counterpoint: if your team's entire testing investment is in Angular's component harnesses and you get real value from unit-testing components in isolation with `TestBed`, this browser-level approach complements that rather than replacing it. Harnesses test the component; BrowserBash tests the shipped app the way a user meets it. Most mature teams want both layers. You can read more about where each layer fits in the [BrowserBash learn hub](https://browserbash.com/learn) and browse worked examples in the [tutorials](https://browserbash.com/tutorials).

The recipe comes down to a few habits. Describe flows the way a user experiences them, not the way the CDK portals them. Lean on `Verify` steps for the assertions that must be deterministic in CI, and let the agent judge the softer checks with the `judged: true` flag making the difference obvious. Name the containing surface when overlays stack, and add an explicit wait when an animation is in flight, because overlay-container timing is your app's behavior and worth being deliberate about. Seed data with testmd v2 API steps, and reuse a saved login so your overlay tests are about overlays, not authentication. None of this pretends the overlay system stops being a moving target. It just moves the timing decisions into readable English and the assertions into hard, evidence-backed checks.

## FAQ

### How do I test a mat-dialog without writing selectors?

Describe the flow in plain English as an objective or a `*_test.md` step, for example "click Create Order, wait for the dialog, fill the Notes field, click Save." An AI agent drives a real browser, finds the portaled dialog in the CDK overlay container by what is on screen, and interacts with it. You never write `.mat-mdc-dialog-container` or query the overlay pane yourself, so nothing in your test breaks when Angular regenerates ids.

### Why do my Angular Material overlay tests flake on timing?

Material components animate open and closed, and for a few frames a backdrop or ripple can sit over your target, so a click fired too early lands on a transitional element or gets intercepted. This is your app's animation behavior, not a tool defect. The fix is to make the wait part of your intent, such as "wait for the dialog to fully appear before clicking Save," and to name the specific overlay when several are stacked so the agent acts on the right one.

### Can I seed test data before checking an Angular Material UI?

Yes. Use testmd v2 by adding `version: 2` frontmatter, then write deterministic API steps that POST to your backend and store the response, followed by plain-English UI steps and Verify assertions. The API steps never call a model, so seeding is reproducible. Note that testmd v2 currently runs on the builtin engine and needs an Anthropic API key or a compatible gateway, while the plain `run` command works with local Ollama models too.

### Does the plain-English approach work with authenticated Angular apps?

Yes. Run `browserbash auth save` once, log in through the visible browser, and press Enter to capture the session as a Playwright storageState. After that, attach `--auth <name>` to any run, testmd, run-all, or monitor command, or set it in a test file's frontmatter. If the saved session does not cover your start URL, BrowserBash warns you instead of failing silently, so stale sessions surface clearly.

Ready to test your Angular Material app by intent instead of by selector? Install with `npm install -g browserbash-cli` and run your first dialog flow in a minute. Everything runs locally and free by default, and an account is optional. If you want the hosted dashboard and monitoring, you can [sign up here](https://browserbash.com/sign-up).
