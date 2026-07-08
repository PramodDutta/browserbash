---
title: Track Cost Per Test Run With BrowserBash cost_usd
description: "Learn cost per test run tracking with BrowserBash's cost_usd field: how it's estimated, where it appears, and how to build a cost dashboard."
date: 2026-08-01
category: guide
---

If you have ever run an AI-driven test suite and gotten a surprise bill at month end, you already know why cost per test run tracking matters. Model calls are not free, and when your validation layer is an AI agent driving a real browser step by step, every objective, every retry, and every flaky test that reruns three times before it passes adds up. BrowserBash addresses this directly with a `cost_usd` field that ships in every `run_end` event, a per-run dollar estimate you can log, sum, budget against, and eventually chart. This guide covers how that number is calculated, where it surfaces across the CLI's output formats, and how to turn a folder of JSON and JUnit files into a real cost dashboard.

## Why Cost Per Test Run Tracking Matters for AI-Driven Testing

Traditional Playwright or Selenium suites have a predictable cost curve: compute time, maybe some CI minutes, and that is basically it. A run that takes 40 seconds costs about the same whether it passes or fails on the first try. AI-driven browser automation breaks that assumption. When an agent interprets a plain-English objective and decides what to click next, the cost is tied to model tokens, not just wall-clock time. A test that needs an extra reasoning pass because the page layout changed, or a suite that reruns failed tests to rule out flakiness, burns real money on every attempt.

That is the gap cost per test run tracking is meant to close. Without it, teams either avoid AI-driven testing at scale because the spend is opaque, or they adopt it and get blindsided by a bill that does not map to anything they can act on. BrowserBash's approach is to attach a cost estimate to the same structured output you already use for pass/fail verdicts, so cost becomes just another field you can query, not a separate system you have to bolt on. The [features page](https://browserbash.com/features) and the [learn](https://browserbash.com/learn) section cover the full `run_end` schema and how NDJSON events fit into a CI pipeline.

The practical upshot: once you can see cost per test run, you can answer questions that used to be guesswork. Which tests are expensive? Is a flaky test costing you 3x its baseline because it retries? Did switching from a hosted model to a local Ollama model actually save money, or just shift where the cost is hidden? None of that is answerable from a plain pass/fail log. It is answerable from `cost_usd`.

## How BrowserBash Estimates cost_usd

The `cost_usd` estimate comes from a bundled per-model price table inside the CLI. When a run finishes, BrowserBash looks at which model actually executed the objective (this can vary run to run depending on your model resolution: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter) and multiplies token usage against that model's known input and output pricing. The result lands in `run_end.cost_usd` as a dollar figure, typically a small fraction of a cent for a short objective and a few cents for a long, multi-step flow on a larger model.

The important design decision here, and the one that keeps this number trustworthy, is what happens when the model is not in the price table. Rather than guessing or falling back to a default rate that might be wildly wrong, BrowserBash simply omits the estimate. You will see `cost_usd: null` (or the field absent, depending on your output consumer) instead of a confidently wrong number. A cost dashboard that occasionally reports $0.00 for a run that actually cost money is worse than no dashboard at all, because it trains you to distrust the whole system. An honest "unknown" is more useful than a plausible-looking lie.

This also means local Ollama runs, which are the default model story for BrowserBash and cost nothing in API terms, typically report `cost_usd` as zero or null since there is no metered API spend to estimate. That is correct behavior, not a bug: the whole point of the Ollama-first default is that nothing leaves your machine and nothing gets billed. Cost per test run tracking becomes interesting specifically when you are using a hosted model, whether that is Anthropic Claude with your own API key, an OpenAI key, or an OpenRouter-routed model, because those are the runs where dollars are actually changing hands.

## Where cost_usd Shows Up: run_end, Result.md, and JUnit

BrowserBash surfaces `cost_usd` in three places, and knowing all three matters because they serve different consumers.

The first and most granular is the `run_end` NDJSON event, emitted when you run with `--agent`. This is the machine-readable format built for CI and AI coding agents, and it is where `cost_usd` lives alongside `status`, `duration_ms`, and (if you are using deterministic Verify steps) the `assertions` block. If you are piping BrowserBash output into a log aggregator, a Datadog pipeline, or a custom script, this is the field you parse.

The second is `Result.md`, the human-readable file BrowserBash writes after every run of a markdown test file. This is meant for a human skimming a PR or a local run, not a machine, so the cost shows up as a line item alongside the pass/fail verdict and step summary rather than as raw JSON.

The third is JUnit `<properties>`, which matters specifically for suite-level runs through `run-all`. JUnit is the lingua franca of CI test reporting: Jenkins, GitLab CI, CircleCI, and most CI dashboards already know how to parse and render JUnit XML. BrowserBash writes suite-level spend into the JUnit properties block, so a budget-aware suite run surfaces its total cost in the same report your CI system already displays, without any custom tooling on your end.

Here is roughly how the three compare:

| Output | Scope | Format | Best for |
|---|---|---|---|
| `run_end` (NDJSON, `--agent`) | Single run | JSON, one line per event | Piping into scripts, log aggregators, agents |
| `Result.md` | Single markdown test | Human-readable markdown | PR review, local debugging |
| JUnit `<properties>` | Whole suite (`run-all`) | XML | CI dashboards that already read JUnit |

A single test file run without `--agent` will show you the cost in `Result.md`. Run the same file with `--agent` and you get the identical dollar figure as a structured field in the final NDJSON line. Run a whole folder through `run-all` and you get both a per-test breakdown and a suite total rolled into the JUnit properties.

## Reading cost_usd From Agent Mode NDJSON

The most direct way to get at `cost_usd` is `--agent` mode on a single run. Each line of stdout is a JSON object, and the last one for a given test is the `run_end` event carrying the verdict and cost together:

```bash
browserbash run "Go to https://example.com/checkout, add the first item to the cart, and verify the cart total is visible" --agent --headless --timeout 120
```

Pipe that through `jq` (or your language's JSON parser of choice) and pull out the fields you care about:

```bash
browserbash run "Verify the pricing page shows a 'Sign up' button" --agent --headless | \
  jq 'select(.event == "run_end") | {status, cost_usd, duration_ms}'
```

That gives you a tight, scriptable record for every run: did it pass, how long did it take, and what did it cost. This is exactly the shape you want for logging runs into a database or a spreadsheet, and it is also the format an AI coding agent reads when BrowserBash is wired in as an MCP tool. Run BrowserBash through `browserbash mcp` inside Claude Code, Cursor, or another MCP host, and the `run_objective` and `run_test_file` tools return this same structured verdict, `cost_usd` included, so the calling agent can reason about spend without you writing any glue code.

Exit codes stay meaningful alongside cost: `0` for passed, `1` for failed, `2` for error or infra issue (including a budget stop, more on that below), `3` for timeout. Cost per test run tracking does not replace the pass/fail contract your CI already relies on; it rides alongside it as an additional field, which is deliberate.

## Cost Per Test Run Tracking Across a Suite With run-all

Individual run costs are useful, but the real value shows up at suite scale, where dozens or hundreds of tests run in parallel and small per-test costs compound fast. `run-all` is BrowserBash's memory-aware parallel orchestrator, and it aggregates cost across every test in the suite into both the JUnit report and `RunAll-Result.md`.

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml
```

Open `out/junit.xml` after that run and you will find suite-level spend recorded in the `<properties>` block, next to concurrency and timing metadata. Because it is standard JUnit, your existing CI dashboard renders it without any plugin work. `RunAll-Result.md` gives you the same number in a format meant for a human scanning a PR: total suite cost, and (since each test's `cost_usd` is preserved individually) enough detail to see which tests are the expensive ones if you go digging.

This is also where sharding and viewport matrices interact with cost per test run tracking. `run-all --shard 2/4` runs a deterministic slice of your suite (computed from sorted discovery order, so parallel CI machines split the work without coordinating), and each shard reports its own partial cost, so you need to sum the JUnit properties blocks across shards to get the true suite total. Similarly, `--matrix-viewport 1280x720,390x844` runs every test once per viewport, which means your suite cost roughly doubles because each viewport pass is a full agent run, not a rerun of the same trace. That is expected, but easy to forget when a suite total jumps after adding a matrix axis.

## Setting Hard Limits With --budget-usd

Visibility into cost is one thing; enforcement is another. `run-all` supports a `--budget-usd` flag that turns your cost estimate into an actual spending cap for the suite:

```bash
browserbash run-all .browserbash/tests --budget-usd 2.50 --junit out/junit.xml
```

Once the running total of estimated spend crosses the budget, BrowserBash stops launching new tests. Anything already in flight finishes, but tests that have not started yet are reported as `skipped`. The suite exits with code `2`, the same code used for errors and infra issues, a deliberate signal that a budget stop is an operational condition, not a regular test failure. The spend figure that triggered the stop lands in `RunAll-Result.md` and the JUnit `<properties>` block alongside the skipped-test count.

There is a token-based variant too, `--budget-tokens`, for teams who would rather cap on raw token usage than on the dollar estimate, useful when you run a mix of models where the dollar-per-token ratio varies. Both flags exist because cost governance for AI-driven testing needs to work the way rate limiting and timeout budgets already work in traditional CI: as a hard backstop, not just a chart you look at after the fact.

A budget is most useful once you have a baseline. Run your suite a few times without `--budget-usd` set, look at the totals in `RunAll-Result.md`, and pick a number with headroom, maybe 1.5x to 2x your typical run, so a slow day does not trip the budget constantly while a genuine cost spike still gets caught.

## Building a Simple Cost Dashboard From cost_usd

You do not need a new observability platform to get value out of `cost_usd`. A dashboard here just means: capture the number every run, store it somewhere queryable, and plot it. Here is a minimal pattern that works whether you are running locally or in CI.

**Step 1: Capture.** In CI, run with `--agent` and append the `run_end` line to a log file, or write it directly to a database if you have one wired in. Locally, `browserbash dashboard` already gives you a fully local, no-account web UI on port 4477 that shows run history, which is a reasonable starting point if you just want to eyeball trends without building anything.

**Step 2: Extract.** A short script pulls `status`, `cost_usd`, `duration_ms`, and a timestamp out of each `run_end` event (or out of the JUnit properties block, if you are working at the suite level) and appends a row to a CSV or a small SQLite table.

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml
# then, in your CI step or a follow-up script:
# parse out/junit.xml properties for total cost_usd and append to a rolling CSV
```

**Step 3: Aggregate.** Group by day, by test name, or by suite, and sum `cost_usd`. This is where the interesting questions get answered: is average cost per test run trending up as the codebase grows? Is one particular test consistently the most expensive because it does more work, or because it is flaky and retrying?

**Step 4: Visualize.** A daily spend line chart and a per-test cost bar chart cover most of what teams actually need. You do not need anomaly detection or forecasting here, a simple trend line someone glances at weekly is enough to catch a runaway cost pattern before it becomes a budget problem.

If you want this to plug into an existing dashboard, the JUnit `<properties>` route is the path of least resistance, since most CI systems already have a JUnit visualization panel. If you would rather own the data end to end, the NDJSON `run_end` events are the more flexible source, giving you per-run granularity instead of per-suite rollups.

## Reducing Cost Per Test Run With the Replay Cache

Tracking cost is only half the job; the other half is bringing it down, and BrowserBash's replay cache is the single biggest lever for that. When a test run passes, BrowserBash records the actions the agent took. On the next identical run, it replays those recorded actions directly instead of asking the model to reason through the page again, and the agent only steps back in if the page has actually changed. Because replay does not call the model at all for the steps it can reuse, a well-cached suite drives cost per test run toward zero on the runs where nothing changed on the page, which in a healthy CI pipeline is most of them.

This interacts directly with monitor mode, which is worth calling out for anyone doing scheduled synthetic checks:

```bash
browserbash monitor "Verify the checkout page loads and the 'Add to cart' button is visible" --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

An always-on monitor running every ten minutes would be a meaningful cost line item if every check were a fresh model call. Because the replay cache kicks in once the flow is recorded, a steady-state monitor becomes nearly token-free, and you only pay for a real reasoning pass on the check that actually hits a change, which is also the run that triggers the pass/fail state-change alert monitor mode is built around. If a scheduled monitor's cost line drops to near zero after the first few runs, that is working as intended, not a silent failure to check anything.

## Cost Per Test Run Tracking in CI With the GitHub Action

If your suite runs through the official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), cost tracking rides along automatically. The action installs the CLI, runs your suite, uploads JUnit, NDJSON, and results artifacts, and posts a self-updating PR comment with the verdict table. It also supports `budget-usd:` directly as an action input and `shard:` for matrix jobs, so a PR that trips your spend cap shows that clearly in the same comment that shows pass/fail, rather than requiring someone to dig through workflow logs.

```yaml
- uses: PramodDutta/browserbash-action@v1
  with:
    tests: .browserbash/tests
    budget-usd: 2.50
    junit: out/junit.xml
```

Because the artifacts include the raw JUnit and NDJSON, you are not locked into reading cost only through the PR comment. A nightly job that aggregates cost across all PR runs for the week, or a script that flags any PR whose suite cost is a statistical outlier, can consume the same artifacts. See the [tutorials](https://browserbash.com/tutorials) section for a walkthrough on wiring the action into an existing pipeline.

## Honest Limits of Cost Estimation

It is worth being direct about what `cost_usd` is and is not. It is an estimate derived from a bundled price table matched against the model that ran, and it is only as accurate as that price table is current. If a provider changes pricing and the bundled table has not caught up yet, the estimate drifts until the CLI is updated. Run a model that is not in the table at all, most commonly a newer or less common OpenRouter-routed model, and you get no estimate rather than a wrong one, the right tradeoff but one that means gaps in your cost data are possible for those runs.

It is also not a substitute for your provider's own billing dashboard if you need exact reconciliation. Treat `cost_usd` as a directionally accurate, per-run signal good for trend-spotting, budget enforcement, and flagging expensive tests, and treat your Anthropic, OpenAI, or OpenRouter billing console as the source of truth for the actual invoice. The two should track closely, but "closely" is not "identical to the cent."

Finally, local Ollama runs reporting zero or null cost is correct, not a limitation, since there is genuinely no metered spend to estimate. If your team runs mostly on local models and only reaches for a hosted model on hard flows, expect your cost data to be sparse by design: most of your suite simply does not generate a cost line, which is the Ollama-first model story working as intended.

## When to Choose Cost Per Test Run Tracking Over Just Watching the Invoice

Some teams genuinely do not need this. If you run five or ten AI-driven tests a day, glancing at your Anthropic or OpenAI billing dashboard once a week is probably sufficient. Cost per test run tracking earns its keep once you are past that scale: dozens or hundreds of tests running multiple times a day through CI, multiple teams sharing a suite, or scheduled monitors running continuously. At that point, an aggregate invoice tells you spend went up, but not which test, which PR, or which model change caused it, and `cost_usd` at the per-run level is what lets you trace it back.

It is also the right fit if you are making a case, internally, for AI-driven testing in the first place. A skeptical team lead who wants to know "what does this actually cost us" gets a better answer from a chart built on real per-run data than from a rough guess. Pair that with the [pricing page](https://browserbash.com/pricing) and the [case study](https://browserbash.com/case-study) if you are building an internal proposal.

## FAQ

### How is BrowserBash's cost_usd calculated?

BrowserBash matches the model that actually executed a run against a bundled per-model price table and estimates cost from token usage. If the model is not in the table, the field is omitted rather than filled with a guess, so an unknown model never produces a misleadingly precise dollar figure.

### Where can I see the total cost of a test suite, not just one test?

Run your suite with `run-all` and check `RunAll-Result.md` or the JUnit `<properties>` block written alongside `--junit`. Both roll up cost across every test in the run, and if you are sharding with `--shard`, remember each shard reports only its own partial total.

### Can I stop a test suite from spending past a certain amount?

Yes. Pass `--budget-usd` (or `--budget-tokens`) to `run-all` and BrowserBash stops launching new tests once the running estimate crosses the limit, marking unstarted tests as skipped and exiting with code 2 so CI treats it as an operational stop rather than a normal failure.

### Does using a local Ollama model affect cost tracking?

Local Ollama runs typically report zero or null cost_usd because there is no metered API spend to estimate, which is expected given BrowserBash's Ollama-first default. Cost per test run tracking becomes most relevant once you switch to a hosted model like Anthropic Claude, OpenAI, or an OpenRouter-routed model where real API dollars are involved.

Cost per test run tracking does not require a new platform, just the fields BrowserBash already writes into every run. Install it with `npm install -g browserbash-cli`, point `--agent` or `run-all --junit` at your test suite, and start logging `cost_usd` from day one so you have a baseline before you need one. Signing up at [browserbash.com/sign-up](https://browserbash.com/sign-up) is optional if you later want the hosted dashboard; everything described here works entirely from the CLI on your own machine.
