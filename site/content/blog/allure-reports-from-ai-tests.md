---
title: Generate Allure Reports From AI Browser Tests
description: "A practical guide to allure reports ai testing: turn BrowserBash JUnit and NDJSON output plus --record artifacts into rich Allure HTML in CI."
date: 2026-07-29
category: ci
---

Allure reports and AI testing sit closer together than most teams realize. If your suite is a folder of plain-English `*_test.md` files that an AI agent drives through a real browser, you already emit everything Allure needs: JUnit XML, structured NDJSON events, and recorded artifacts. This guide walks through allure reports ai testing end to end, from the raw output BrowserBash produces on every run to a polished Allure HTML dashboard published by your CI pipeline. No custom framework glue, no fake results, just the artifacts you already have wired into a report humans actually want to open.

The reason this matters: raw pass/fail exit codes tell a machine what happened, but a flaky login test at 2am tells a human almost nothing without context. Allure gives you the timeline, the retries, the trend graph, the screenshot at the moment of failure, and the grouping by suite and severity. When the test author is an AI agent reading a natural-language objective, that context is the difference between "the agent failed" and "the agent could not find the checkout button after the pricing redirect." Let's build the pipeline that surfaces the second kind of answer.

## Why Allure Reports Fit AI Browser Tests

Traditional test reporters were built around code: a `describe` block, an `it` block, an assertion library throwing an error. [BrowserBash](https://browserbash.com/features) inverts that. You write an objective in English, an AI agent interprets it, drives Chrome step by step with no selectors or page objects, and returns a deterministic verdict. The interesting question becomes: how do you report on a test whose implementation was decided at runtime by a model?

Allure answers this well because it is format-driven, not framework-driven. It ingests results from a directory of JSON and XML files and renders them into HTML. It does not care whether a human wrote the test in TypeScript or an agent inferred the steps from a sentence. As long as you feed it valid JUnit results, it produces the suites, the durations, the pass/fail breakdown, and the trend history across runs. That neutrality is exactly what you want when the test logic lives in prose.

There is a second reason the fit is natural. AI browser tests generate rich side artifacts by design: a step-by-step NDJSON stream, a human-readable `Result.md`, an assertion table, and optionally a Playwright trace or a screencast video. Allure has first-class slots for attachments. You can hang the trace, the video, the NDJSON log, and the failure screenshot directly off the test case in the report. The person triaging the failure gets the agent's reasoning and the visual evidence in one place.

## The Raw Output BrowserBash Already Produces

Before you can build allure reports from AI testing runs, you need to know exactly what BrowserBash emits. Everything here is produced by the CLI with no extra configuration, which is what makes the Allure integration cheap.

### JUnit XML from run-all

The `run-all` orchestrator runs a folder of tests in parallel with concurrency derived from your real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. It writes JUnit XML on demand:

```bash
npm install -g browserbash-cli
browserbash run-all .browserbash/tests --junit out/junit.xml
```

That JUnit file is the backbone of the Allure report. Each `<testcase>` maps to a test case in Allure, each `<testsuite>` becomes a suite grouping, and failures carry the error text. Suite-level spend and metadata land in JUnit `<properties>`, which Allure surfaces as parameters. If you run with a budget, `run-all --budget-usd 2.50` records the spend and reports remaining tests as `skipped` once the suite crosses the limit, and Allure renders those skips distinctly from failures.

### NDJSON from agent mode

Agent mode is the machine-readable stream. Add `--agent` and BrowserBash emits one JSON event per line on stdout: `step` events as the agent works and a `run_end` event with the final verdict.

```bash
browserbash run "Log in and confirm the dashboard shows my name" --agent --headless > run.ndjson
```

The `run_end` event is the structured heart of the result: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. The exit codes are a frozen public contract you can trust in CI: `0` passed, `1` failed, `2` error or budget stop, `3` timeout. You attach the NDJSON file to the Allure case so a reviewer can replay the agent's decision trail line by line.

### Result.md and the assertion table

After every run, BrowserBash writes a human-readable `Result.md`. When you use deterministic `Verify` steps, they compile to real Playwright checks (URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, a stored value equals) with no LLM judgment. A pass means the condition held. A fail arrives with expected-versus-actual evidence in both `run_end.assertions` and the `Result.md` assertion table. That table is exactly the kind of thing you want visible inside an Allure test case, and you can attach the Markdown directly.

### Record artifacts: traces and video

The `--record` flag captures visual evidence. On the builtin engine it produces a Playwright trace; on the default stagehand engine it captures a screencast video. Both are the money attachments in a failure report. A trace lets a reviewer scrub the timeline, and a video shows the exact moment the agent went off the rails.

## Mapping BrowserBash Artifacts to Allure Concepts

Here is the concrete mapping. Keep this table next to you while you build the pipeline.

| BrowserBash output | Allure concept | How it shows up |
| --- | --- | --- |
| `run-all --junit out/junit.xml` | Test results | Suites, cases, pass/fail/skip, durations |
| JUnit `<testsuite>` name | Suite grouping | Left-nav tree in the report |
| `run_end.status` and exit code | Case status | passed / failed / broken / skipped |
| `run_end.cost_usd`, `duration_ms` | Parameters | Shown on the case detail page |
| `Result.md` assertion table | Attachment (Markdown) | Expected-vs-actual evidence inline |
| NDJSON `--agent` stream | Attachment (text) | The agent's step-by-step decision log |
| `--record` Playwright trace | Attachment (file) | Downloadable trace for the trace viewer |
| `--record` screencast video | Attachment (video/mp4) | Inline playback in the case detail |
| `run-all` flaky flag | Retries / flaky marker | Flaky indicator on the case |
| `--matrix-viewport` label | Parameter | Distinguishes 1280x720 from 390x844 runs |

The important insight: JUnit alone gives you a usable Allure report on day one. The attachments are progressive enhancement. Start with JUnit, then layer in NDJSON, `Result.md`, and the `--record` artifacts as your triage needs grow.

## Building the Pipeline Step by Step

Let's assemble a working pipeline. The shape is the same on any CI provider: run the suite, collect artifacts into an Allure results directory, generate the HTML, publish it.

### Step 1: Run the suite and emit JUnit

Start with the orchestrator writing JUnit into a known location. Add a budget so a runaway agent cannot burn your whole CI spend on one stuck test:

```bash
browserbash run-all .browserbash/tests \
  --junit allure-results/junit.xml \
  --budget-usd 2 \
  --matrix-viewport 1280x720,390x844
```

The viewport matrix runs every test once per viewport and labels each run in events, JUnit, and results, so mobile and desktop failures show up as distinct cases in Allure rather than being collapsed together. If you are sharding across CI machines, `run-all --shard 2/4` runs a deterministic slice computed on sorted discovery order, so parallel runners agree on their split without any coordination. Each shard writes its own JUnit, and you merge the results directories before generating the report.

### Step 2: Convert JUnit to Allure results

Allure's command line tool reads a results directory. JUnit XML is a supported input format. Point Allure at the directory that holds your JUnit file and it will parse it into Allure's internal model. In practice you keep all per-test JSON, JUnit XML, and attachment files in one `allure-results/` folder, then run the generate command against it. Because JUnit is a first-class Allure input, no adapter code is required for the baseline report.

### Step 3: Attach the rich artifacts

To go beyond a bare pass/fail table, drop the extra files into the results directory following Allure's attachment convention, or use a small post-processing script that reads your NDJSON `run_end` events and writes Allure attachment references keyed to each test case. The pieces you want on every failed case:

- The `Result.md` for that test, carrying the deterministic assertion table.
- The `run.ndjson` stream so a reviewer can read the agent's reasoning.
- The Playwright trace or screencast from `--record`.

A green run needs far less. When a test passes, the verdict and duration are usually enough, and skipping heavy video attachments on passing cases keeps your report directory small.

### Step 4: Generate and publish the HTML

Finally, generate the static HTML and publish it as a CI artifact or to a pages host. Because Allure keeps history across runs when you carry the `history/` folder forward between builds, you get trend graphs: pass rate over time, duration trends, and a retries view that makes flaky AI tests visible instead of hidden. That trend history is one of the strongest arguments for Allure over a plain JUnit summary, especially when an agent-driven test can be non-deterministic in ways a hardcoded script never is.

## Wiring It Into GitHub Actions

BrowserBash ships an official GitHub Action, and it does most of the collection work for you. The `action.yml` at the repo root installs the CLI, runs the suite, and uploads the JUnit, NDJSON, and results artifacts. It supports `shard:` matrix jobs and a `budget-usd:` input, and it posts a self-updating PR comment with the verdict table. The full reference lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

The Allure layer slots in after the BrowserBash Action step. Your workflow does three things in sequence: run the BrowserBash Action to produce and upload artifacts, download those artifacts into an `allure-results/` directory, then run the Allure generation step and publish the HTML. If you use `shard:` matrix jobs, each shard uploads its own results, and a final aggregation job downloads all shard artifacts, merges them into one results directory, and generates a single unified Allure report. Because the shard split is deterministic on sorted discovery order, the merged report is stable and reproducible across reruns.

A few practical notes for the CI wiring. Carry the Allure `history/` directory between runs by caching it or committing it to a reports branch, otherwise you lose the trend graphs. Keep the JUnit path stable across shards so the aggregation job knows where to look. And gate the report publish on the suite completing rather than on it passing, because a failed suite is precisely when you most want the report. Remember that a suite verdict in BrowserBash is the exit code plus the presence of a `run_end` event, so an empty results directory means the run never produced events, not that everything passed.

## Reading the Report: What AI Test Failures Look Like

Once the pipeline is live, the payoff is in how failures read. A conventional Playwright failure gives you a stack trace and a selector that did not match. An AI browser test failure in Allure reads differently and, honestly, more usefully for a QA reviewer.

Open a failed case and you see the `status` and `summary` from `run_end` at the top: a plain-English sentence describing what the agent concluded. Below that, the deterministic assertion table from `Result.md` shows exactly which `Verify` condition failed with expected-versus-actual values, so you can tell a genuine regression from a test that needs updating. The NDJSON attachment lets you scroll the agent's step trail to see where the flow diverged. And the `--record` trace or video shows the browser state at the moment of failure.

This layering matters for a specific reason. `Verify` steps inside the supported grammar are checked by real Playwright assertions with no model involved, so a failure there is trustworthy evidence. `Verify` lines outside the grammar still run but are agent-judged and flagged `judged: true`, which surfaces in your attachments so a reviewer knows to weigh them differently. Allure carries that distinction through as long as you attach the structured result. You never want a report that implies deterministic certainty where the underlying check was a model's opinion.

### Distinguishing flaky from broken

The `run-all` orchestrator already does flaky detection, ordering previously-failed and slowest tests first and flagging flakiness. When that flag rides through JUnit into Allure, the retries view groups the attempts, and you can see a test that passed on rerun versus one that failed every time. For AI-driven tests this separation is worth more than usual, because agent non-determinism and a genuine app regression can both present as a single red case until you look at the retry pattern.

## testmd v2 for Deterministic, Reportable Suites

If you want your Allure reports to lean on hard assertions rather than agent judgment, testmd v2 is the tool. Add `version: 2` frontmatter to a `*_test.md` file and steps execute one at a time against a single browser session, with two step types that never touch a model: API steps for seeding data and `Verify` steps for checking it through the UI.

```bash
# login_flow_test.md
# ---
# version: 2
# ---
# 1. POST https://api.example.com/users with body {"email": "{{email}}"}
# 2. Expect status 201, store $.id as 'userId'
# 3. Open https://example.com and log in as {{email}}
# 4. Verify heading 'Welcome' is visible
# 5. Verify URL contains /dashboard
```

The API steps (`GET/POST/PUT/DELETE/PATCH url [with body {...}]` plus `Expect status N`, optionally storing a JSON path as a named variable) seed state deterministically, and the `Verify` steps compile to real Playwright checks. Consecutive plain-English steps run as grouped agent blocks on the same page. The result is a suite where the assertions in your Allure report are backed by deterministic checks, not LLM guesses, which is exactly what a QA lead wants to see when they scan the assertion table. You can read more about writing these files in the [tutorials](https://browserbash.com/tutorials).

One honest caveat: testmd v2 currently drives the builtin engine, which speaks the Anthropic API, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on local Ollama or OpenRouter. Version 1 files with no frontmatter behave exactly as before, so you can mix v1 and v2 in the same suite and the same Allure report.

## Keeping Costs and Tokens Under Control in CI

A report is only useful if the runs that feed it are affordable. Two BrowserBash features keep an Allure pipeline cheap to operate, and both surface data you can put straight into the report.

Cost governance puts a `cost_usd` estimate in every `run_end` event, drawn from a bundled per-model price table. Unknown models get no estimate rather than a wrong one, which is the honest default. Feed that number into a JUnit property and Allure shows per-test spend as a parameter, so you can spot the objective that quietly costs ten times the others. The suite-level `--budget-usd` and `--budget-tokens` flags stop launching new tests once you cross the threshold, mark the rest `skipped`, and exit `2`, and that spend also lands in `RunAll-Result.md` and the JUnit `<properties>`.

The replay cache is the bigger lever. A green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. In a CI context where the app under test is stable between commits, most of your suite replays for free, and your Allure trend graph shows stable durations without the token cost of a full agent run every time. If you also stand up a [monitor](https://browserbash.com/blog) on a critical flow, `browserbash monitor <test> --every 10m --notify <webhook>` alerts only on pass-to-fail or fail-to-pass state changes and is nearly token-free thanks to the same cache, giving you a continuous signal to complement the per-commit Allure report.

## When Allure Is the Right Choice, and When It Is Not

Allure is not the only way to read AI test results, and it is worth being clear about the tradeoff so you do not adopt it out of habit.

Choose Allure when you have a multi-test suite, more than one person triages failures, and you care about trends across time. The suite tree, the retries view, the attachment slots for traces and video, and the historical trend graphs all pay off at that scale. It is the right pick when you are presenting results to people who did not write the tests: a QA lead, a release manager, an engineering director who wants a pass-rate graph.

Skip Allure when a single agent or a single developer is the only consumer of the result. If a Claude Code or Cursor agent is calling BrowserBash through the [MCP server](https://browserbash.com/learn) to validate its own work, it does not need HTML. The `browserbash mcp` command serves `run_objective`, `run_test_file`, and `run_suite` over the Model Context Protocol, and each returns the structured verdict JSON directly. A failed test is a successful validation there: the tool call succeeds and the agent reads the verdict. Wrapping that in an Allure build would add latency and files nobody opens.

| Situation | Best fit |
| --- | --- |
| Team triage, trend graphs, release reporting | Allure HTML from JUnit + attachments |
| A coding agent validating its own change | `browserbash mcp` structured verdict JSON |
| A single dev running one flow locally | `Result.md` and `--agent` NDJSON on the terminal |
| Continuous uptime signal on a critical path | `browserbash monitor` with webhook alerts |
| Long-term cloud retention without self-hosting | The optional free cloud dashboard via `connect` |

For the local, no-account case, `browserbash dashboard` gives you a fully local UI on port 4477 with nothing leaving your machine, and the optional cloud dashboard (`browserbash connect` plus `--upload`) offers 15-day retention if you want history without running Allure infrastructure yourself. Allure earns its place specifically when you need portable, self-hosted, richly-attached HTML that lives in your own CI. Pick the tool that matches who reads the output.

## FAQ

### How do I generate Allure reports from BrowserBash tests?

Run your suite with `browserbash run-all .browserbash/tests --junit allure-results/junit.xml` to emit JUnit XML, then point the Allure command line tool at that results directory to generate the HTML report. JUnit is a first-class Allure input, so no adapter code is needed for the baseline report. Add NDJSON logs, the `Result.md` assertion table, and `--record` traces or video as attachments to enrich each test case.

### What artifacts do AI browser tests produce for reporting?

Every BrowserBash run can emit JUnit XML from `run-all`, a machine-readable NDJSON stream in `--agent` mode with a structured `run_end` verdict, a human-readable `Result.md` with a deterministic assertion table, and optional `--record` artifacts (a Playwright trace on the builtin engine or a screencast video on stagehand). Each of these maps cleanly onto an Allure concept, with the verdict driving case status and the rest becoming attachments and parameters.

### Can I wire Allure reports into a CI pipeline automatically?

Yes. The official BrowserBash GitHub Action installs the CLI, runs the suite, and uploads JUnit, NDJSON, and results artifacts, including support for `shard:` matrix jobs and a `budget-usd:` input. Add a following step that downloads those artifacts into an Allure results directory and runs the Allure generation, and carry the history folder between builds to keep trend graphs. For sharded runs, an aggregation job merges all shard results into one unified report.

### Do AI test reports show real assertions or model guesses?

Both, and BrowserBash keeps them clearly separated. `Verify` steps that fall inside the supported grammar compile to real Playwright checks with no LLM judgment, and a failure comes with expected-versus-actual evidence. `Verify` lines outside the grammar still run but are agent-judged and flagged `judged: true`, so when you attach the structured result to Allure, a reviewer can always tell a deterministic assertion from a model's opinion.

Ready to build reportable AI browser tests? Install with `npm install -g browserbash-cli`, point `run-all --junit` at an Allure results directory, and you have a pipeline in an afternoon. An account is optional and everything runs locally by default, but for hosted history start at [browserbash.com/sign-up](https://browserbash.com/sign-up).
