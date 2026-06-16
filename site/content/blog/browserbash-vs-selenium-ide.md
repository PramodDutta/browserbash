---
title: Selenium IDE vs BrowserBash: Record-Replay vs Plain English
description: "A senior SDET's honest Selenium IDE alternative comparison: brittle record-and-replay .side scripts versus an AI agent driving real Chrome from plain English."
date: 2026-02-03
category: comparison
---

If you have ever recorded a flow in Selenium IDE, watched it replay perfectly once, then come back a sprint later to a wall of red because someone renamed a button, you already understand why people search for a Selenium IDE alternative. The record-and-replay model is genuinely brilliant for getting started: you click through your app, the recorder writes down every step, and you replay it. The problem shows up the second the DOM moves. This article compares Selenium IDE's `.side` record-replay approach with BrowserBash, a free, open-source CLI where you write a plain-English objective and an AI agent drives a real Chrome browser to satisfy it. No selectors to re-record, no hand-waving about "the future" without the tradeoffs.

BrowserBash installs with `npm install -g browserbash-cli`, runs with no account, and defaults to free local models so nothing leaves your machine. Selenium IDE is a browser extension (and a small ecosystem around it) that records your interactions into a replayable test. They solve the same surface problem — "automate this browser flow without writing a lot of code" — but they fail and scale in completely different ways. Let's get into the detail, including the places where Selenium IDE is still the right call.

## What Selenium IDE actually is

Selenium IDE is the record-and-playback member of the Selenium family. It is a browser extension (Chrome and Firefox) maintained by the Selenium project. You open the extension, hit record, and click through your application. The IDE captures each interaction as a command with a target locator and writes it into a project file with a `.side` extension (JSON under the hood). You can replay the whole suite inside the browser, add assertions, parameterize with variables, and export the test to WebDriver code in several languages. For headless and CI runs there is a command-line runner, historically `selenium-side-runner`, that executes `.side` files via Node.

The appeal is obvious and real. There is almost no learning curve. A manual QA who has never written a line of code can record a login, a search, and a checkout in ten minutes and have something that replays. For smoke-checking a stable internal tool, or for capturing a bug repro you can hand to a developer, that speed is hard to beat. Selenium IDE has earned its place precisely because it lowers the barrier to "I automated something today."

### How the recorder stores a step

When you click a button, Selenium IDE does not store "the Add to Cart button." It stores a command (`click`), a target locator (something like `id=add-to-cart-sauce-labs-backpack` or an XPath), and often a fallback list of alternative locators it guessed at record time. That is the crux of everything that follows. The recorded test is a frozen snapshot of the DOM as it existed the moment you clicked. The IDE is smart about offering multiple candidate locators, but every one of them is still a hard-coded assumption about page structure.

## What BrowserBash does differently

BrowserBash removes the locator from the equation entirely. You do not record clicks and you do not store targets. You write the *intent* as a sentence, and an LLM-driven agent reads the live page the way a human reads it, decides which element satisfies the current step, acts, observes the result, and moves on. There is no `.side` file, no Selenese command table, and no list of fallback XPaths to maintain.

Here is a complete, runnable login-and-verify flow against a public practice site:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first backpack to the cart, complete checkout, and verify the page shows 'Thank you for your order!'" \
  --headless \
  --record
```

That single objective covers what would be a dozen-plus recorded commands in a `.side` file. The agent navigates, finds the username and password fields by understanding the page, clicks through the cart and checkout steps, and asserts the success text. The `--record` flag captures a screenshot and a full `.webm` session video so you can watch exactly what happened. When the run finishes you get a verdict — passed or failed — plus structured results, not a green bar that hides a stale locator.

The key difference is what happens when the page changes. If a developer renames `add-to-cart-sauce-labs-backpack` to `add-backpack-btn`, the Selenium IDE step that targeted the old id stops matching and the test fails. The BrowserBash objective still reads "add the first backpack to the cart," and the agent finds the button by its meaning on the page, not by a string it memorized last month. You did not write a selector, so there is no selector to re-record.

## Record-and-replay vs plain English: the core tradeoff

This is the heart of the comparison, so it is worth being precise about it. Both tools let you avoid hand-writing WebDriver code. The difference is *what the test is made of*.

A Selenium IDE test is made of locators. Its correctness depends on those locators continuing to match the DOM. That gives you something valuable: determinism. The same `.side` file sends the same commands against the same targets in the same order every single time. When it passes, it passes for a reason you can point at. When it fails, the failure is usually specific — "element not found: id=checkout" — and easy to diagnose. For a page that genuinely never changes, this is close to ideal.

A BrowserBash test is made of intent. Its correctness depends on the agent correctly interpreting your sentence against the live page. That gives you resilience to DOM churn but introduces a different kind of variability: an AI model is making judgment calls, and judgment is not perfectly deterministic. A capable model running a clear objective on a normal flow is reliable in practice, but it is a different reliability profile than a hard-coded locator. You trade "brittle but exact" for "adaptive but probabilistic." Neither is universally better. Which one you want depends on how often your DOM moves and how much selector maintenance is eating your week.

Here is the practical version of that tradeoff:

| Dimension | Selenium IDE (record-replay) | BrowserBash (plain English) |
| --- | --- | --- |
| Test is expressed as | Recorded commands + locators in a `.side` file | A plain-English objective sentence |
| When the DOM shifts | Locator stops matching, step fails, you re-record | Agent re-reads the page and adapts; nothing to re-record |
| Determinism | High — same commands, same targets, every run | Probabilistic — model interprets intent each run |
| Failure messages | Precise ("element not found") | A verdict plus reasoning, less line-pinpointed |
| Learning curve | Near zero — click to record | Near zero — write a sentence |
| Cross-browser / grid | Yes, mature Selenium ecosystem | Via providers: local, CDP, Browserbase, LambdaTest, BrowserStack |
| Cost of model inference | None (no model involved) | $0 on local models; optional paid hosted models |
| Best when | The flow is stable and you want exact repeatability | The DOM changes often and selector upkeep hurts |

Notice the table does not declare a winner. A team with a frozen legacy admin panel might rationally prefer Selenium IDE. A team shipping a React app three times a day, drowning in "fix the selector" pull requests, is exactly who the plain-English approach is built for.

## The selector maintenance tax, made concrete

Every Selenium IDE user eventually meets the maintenance tax, so let's make it concrete instead of abstract. Say you recorded a checkout suite of forty steps across five `.side` files. It is green. Then the front-end team ships a component-library upgrade. The upgrade wraps every button in a new container, changes a handful of generated class names, and restructures the cart drawer.

With record-replay, you now have a maintenance project. Steps that targeted the changed elements fail. You open each failing test, figure out which locator broke, re-record or hand-edit the target, and re-run. If the IDE's fallback locators happened to survive, some steps recover on their own; if they did not, you are clicking through the recorder again. None of this work tested anything new. It restored coverage you already had. That is the tax: effort spent keeping the map current rather than finding bugs.

With BrowserBash, the objective "add the first backpack to the cart, complete checkout, and verify 'Thank you for your order!'" did not mention a single class name or container. The component upgrade changed the DOM, but the meaning of the page — there is a product, there is a cart, there is a checkout button, there is a confirmation — did not change. The agent reads the new DOM and proceeds. You re-ran the same command and got a verdict. There was nothing to re-record because you never recorded anything. This is the single biggest reason engineers go looking for a Selenium IDE alternative in the first place, and it is the difference plain-English automation is designed to erase.

To be fair to Selenium IDE: this resilience is not free. The agent has to actually understand the page, which means model quality matters (more on that below), and a genuinely ambiguous page can confuse an agent in ways a hard-coded XPath never would. Resilience to DOM churn is a real win; it is not magic.

## Tests you can commit and read

Record-replay produces a `.side` file, which is JSON. It is replayable and exportable, but it is not something a reviewer reads in a pull request and understands at a glance. BrowserBash leans the other way with committable Markdown tests. You write a `*_test.md` file where each list item is a step, compose files together with `@import`, and template values with `{{variables}}`. Secret-marked variables are masked as `*****` in every log line, so credentials never leak into output.

```bash
browserbash testmd run ./checkout_test.md
```

A `checkout_test.md` might read like this:

```markdown
# Checkout smoke test

- Open https://www.saucedemo.com
- Log in as {{username}} with password {{password:secret}}
- Add the first backpack to the cart
- Go to the cart and proceed to checkout
- Fill the checkout form with first name "Ada", last name "Lovelace", zip "94016"
- Finish the order
- Verify the page shows "Thank you for your order!"
```

Anyone on the team can read that file and know exactly what it does. A product manager can review it. A new hire can edit it without learning a command vocabulary. After each run, BrowserBash writes a human-readable `Result.md` so you have a record of what happened in plain language. That is a different artifact philosophy than a binary-feeling `.side` blob: the test doubles as living documentation. If you want to compare this with how other plain-English suites read, the [BrowserBash learn page](https://browserbash.com/learn) walks through the Markdown test format in depth.

## Built for CI and AI coding agents

Selenium IDE has a command-line runner, and `.side` files can run in CI through it, so this is not a "can it run headless" question — both can. The difference is the output contract. Record-replay runners are built for humans reading a test report. BrowserBash adds a machine-first mode designed for pipelines and AI coding agents.

Running with `--agent` emits NDJSON, one JSON event per line, on stdout. Nothing to parse out of prose, no scraping a HTML report. Exit codes are explicit: `0` passed, `1` failed, `2` error, `3` timeout. That means a CI job or an AI coding agent can branch on the result deterministically without regex over log text.

```bash
browserbash run "Log in and confirm the dashboard loads with a welcome message" \
  --agent --headless
echo "exit code: $?"
```

In a GitHub Actions or GitLab pipeline, you wire the exit code straight into the job status. For an AI agent that just changed front-end code and wants to verify it did not break the login flow, the NDJSON stream plus a clean exit code is exactly the contract it needs. This is a real architectural gap between a tool designed in the record-replay era and one designed for agent-driven workflows. You can read more about the event stream on the [features page](https://browserbash.com/features).

## Where the browser runs: providers and cross-browser

Selenium IDE's superpower has always been the broader Selenium ecosystem behind it — Grid, the cloud vendors, the mature cross-browser story. If you need to replay a `.side` file across thirty browser/OS combinations, that ecosystem is deep and battle-tested. Credit where it is due.

BrowserBash handles "where does the browser run" with a single `--provider` flag. The default is `local` — your own Chrome on your machine. From there you can switch to `cdp` (any DevTools endpoint), or to cloud grids `browserbase`, `lambdatest`, and `browserstack` without rewriting your objective.

```bash
browserbash run "Open the pricing page and verify the Pro plan lists annual billing" \
  --provider lambdatest --headless --record
```

The same plain-English objective runs locally during development and on a cloud grid in CI by changing one flag. You are not maintaining separate capabilities files for each target. For teams already invested in LambdaTest or BrowserStack, this slots into existing infrastructure while keeping the no-selector authoring model.

## The honest part: model quality and where Selenium IDE wins

A comparison that only flatters one side is not worth reading, so here is the candid accounting.

BrowserBash is Ollama-first. It defaults to free local models, auto-resolving in order: a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. You can run a genuinely $0 model bill entirely on local models with no API keys and nothing leaving your machine. It also supports OpenRouter (including some genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key.

The honest caveat: very small local models, roughly 8B parameters and under, can be flaky on long multi-step objectives. They lose the thread on a fifteen-step checkout, or misread an ambiguous page. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If you point a tiny model at a complicated objective and it stumbles, that is expected behavior, not a defect — match the model to the difficulty of the flow. The [local LLM guidance](https://browserbash.com/learn) goes deeper on picking a model that holds up across long runs.

Now Selenium IDE's genuine wins, stated plainly:

- **No model, no variability.** Record-replay involves no AI. For a flow that never changes, you get the same deterministic result forever, with zero inference cost and zero chance of a model misreading the page. That is a real advantage for stable, high-frequency smoke checks.
- **Pinpoint failures.** "Element not found: id=checkout" tells you precisely what broke and where. An agent verdict with reasoning is informative but less surgically specific.
- **Zero ambiguity on simple flows.** If you genuinely just want to replay five clicks on a page you control, recording them is the fastest path and there is nothing to "interpret."
- **Maturity and reach.** The Selenium ecosystem around it — Grid, exports to WebDriver code, the cloud vendors — is older and broader than any AI-native CLI.

If your application is stable and your selectors rarely break, Selenium IDE may simply be the better fit, and you should not switch for novelty. The case for a Selenium IDE alternative gets strong when DOM churn turns your suite into a maintenance treadmill — not before.

## Recordings, dashboards, and what you keep after a run

When something fails, you want to see it, not just read about it. Both approaches can produce artifacts; the BrowserBash story here is worth spelling out because it is broader than a pass/fail log.

The `--record` flag captures a screenshot and a full `.webm` session video on any engine, rendered via ffmpeg. BrowserBash ships two engines: `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin` (an in-repo Anthropic tool-use loop). The builtin engine additionally captures a Playwright trace you can open in the Playwright trace viewer — step-by-step DOM snapshots, network activity, and console logs for forensic debugging.

For run history you have two opt-in options, both free. A fully local dashboard runs with `browserbash dashboard` — everything stays on your machine. Or you can use the optional free cloud dashboard: connect with `browserbash connect` and add `--upload` to a run to push run history, video recordings, and per-run replay to the cloud. It is strictly opt-in; nothing uploads unless you ask. Free uploaded runs are kept for 15 days. You can see the plans and what is included on the [pricing page](https://browserbash.com/pricing).

```bash
browserbash run "Complete the signup flow and verify the welcome email banner appears" \
  --record --upload
```

That gives you a watchable video of the exact run, plus a replay you can share with a teammate, without standing up any infrastructure.

## When to choose each tool

Here is the decision, stripped to the essentials.

**Choose Selenium IDE when:**

- Your application is stable and selectors rarely break, so the maintenance tax is low for you.
- You want strict determinism with zero model involvement and zero inference cost.
- You need pinpoint, line-level failure messages tied to specific locators.
- You are already deep in the Selenium ecosystem and want to lean on its mature Grid and cloud-vendor integrations.
- The task is genuinely "replay five clicks on a page I control," where recording is the shortest path.

**Choose BrowserBash when:**

- Your DOM changes often and "fix the selector" pull requests are eating real time.
- You want tests that read like English, get committed to the repo, and double as documentation.
- You need a clean CI contract — NDJSON via `--agent` and explicit exit codes — or you are wiring browser checks into an AI coding agent.
- You want a $0 model bill on local models with nothing leaving your machine, with the option to scale up to a capable hosted model for hard flows.
- You want videos, traces, and an optional free dashboard without standing up infrastructure.

Plenty of teams will run both: Selenium IDE for a frozen legacy surface, BrowserBash for the fast-moving product where selector churn hurts most. They are not mutually exclusive, and the honest answer to "which one" is "it depends on how much your DOM moves." If you want to see how teams have made that call, the [case studies](https://browserbash.com/case-study) walk through real adoption stories.

## Getting started in two minutes

There is no account and no login step to try BrowserBash. Install it globally and run an objective:

```bash
npm install -g browserbash-cli
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, and verify the page shows 'Products'" --headless
```

If you have Ollama installed with a mid-size model, that runs entirely locally at no cost. If you would rather use a hosted model, set `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` and BrowserBash resolves it automatically. From there, convert your most-broken Selenium IDE flows into `*_test.md` files, add `--agent` for CI, and add `--record` when you want a video of the run. The npm package and source are public if you want to read exactly what it does.

## FAQ

### Is BrowserBash a good Selenium IDE alternative?

It is a strong fit if your tests keep breaking because the DOM changes and you are tired of re-recording locators. BrowserBash replaces recorded `.side` steps with a plain-English objective that an AI agent satisfies against the live page, so there are no selectors to maintain. If your application is very stable and you value strict determinism with no model involved, Selenium IDE may still be the better choice.

### Do I need to write or maintain selectors with BrowserBash?

No. You describe what you want in plain English, and the agent reads the page and decides which element to act on. When a button is renamed or a container is added, your objective does not change, so there is nothing to re-record or hand-edit. This is the main reason teams move away from record-and-replay tools.

### Can BrowserBash run in CI like the Selenium IDE command-line runner?

Yes, and it is built for it. Run with `--agent` to emit NDJSON, one JSON event per line, and rely on explicit exit codes (0 passed, 1 failed, 2 error, 3 timeout) so a pipeline or AI coding agent can branch on the result without parsing prose. Add `--headless` for headless runs and `--record` if you want a video artifact from CI.

### Is BrowserBash free, and does anything leave my machine?

BrowserBash is free and open-source under Apache-2.0, and it defaults to free local models via Ollama, so you can run with a $0 model bill and nothing leaving your machine. There is no account required to run it. The cloud dashboard, video uploads, and run replay are strictly opt-in through `browserbash connect` and `--upload`, with free uploaded runs kept for 15 days.

Ready to stop re-recording brittle scripts every time the DOM moves? Install it with `npm install -g browserbash-cli` and run your first plain-English flow in under two minutes. No account is needed to get started, but if you want free run history, videos, and replay, you can [sign up here](https://browserbash.com/sign-up) — it is optional.
