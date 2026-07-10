---
title: Test an AI Agent Dashboard and Run-Log UI
description: "Learn how to test an AI agent dashboard, verify run lists, step logs, and status pills by intent using plain-English browser checks."
date: 2026-07-30
category: agents
---

If you build agents, you eventually build a dashboard for them: a run list, a per-run step log, and a row of status pills that tell you at a glance which runs passed, failed, or are still in flight. To test an AI agent dashboard well, you cannot lean on brittle CSS selectors that break every time the design tweaks a class name, and you cannot lean on an LLM eyeballing a screenshot and shrugging "looks fine." You need checks that verify the dashboard by intent, the same way a human would read it, but with a deterministic verdict at the end. That gap is exactly what BrowserBash was built to close.

This article covers the three surfaces every agent dashboard shares: the run list (the table of past and active runs), the step log (the drill-down showing each action an agent took), and the status pills (the colored badges that summarize state). We will write plain-English objectives that an AI agent executes against a real Chrome browser, harden the important assertions into deterministic checks that never depend on model judgment, and wire it into CI so a broken pill color fails the build instead of shipping to users.

## Why an agent dashboard is hard to test the normal way

A run-log UI is a moving target in ways a marketing page never is. The data is live: runs appear, update their status, and finish while you are looking at them. The states are numerous: queued, running, passed, failed, error, timed out, skipped, sometimes flaky. And the visual language carries meaning that a naive DOM check misses. A green pill and a red pill can share the same markup structure and differ only by a class or an inline color, so asserting that "a pill exists" tells you nothing about whether the pill communicates the right thing.

Traditional end-to-end tests handle this with a thicket of selectors: `[data-testid="run-row-status"]`, `.pill--success`, `nth-child` walks down a table body. Those tests are real work to write, and they rot fast. Rename a test id, swap the pill component for a new design-system version, and half your suite goes red for reasons that have nothing to do with a real regression. Meanwhile the things you actually care about, like "does a failed run show a red pill and a readable error in its step log," often go unchecked because encoding them in selectors is tedious.

When you test an AI agent dashboard by intent instead, you describe the outcome a user should observe and let the agent find the elements. The agent reads the rendered page the way a person does, so a class rename does not break it. You get resilience where selector tests are brittle, and a hard verdict where a pure vision check would be vague. If you are new to the tool, the [learn hub](https://browserbash.com/learn) is the fastest way to see the model in action first.

## The three surfaces you actually need to cover

Break the dashboard into the surfaces that carry meaning, then test each one for what it is supposed to communicate.

### The run list

The run list is the front door. It answers "what has my fleet of agents been doing?" A good run-list test asserts that recent runs appear, that each row shows an identity (a name or id), a status, and a timestamp, and that the newest run sits where the sort order promises. You also want to test the empty state (a fresh account with zero runs should say so, not render a broken skeleton) and the filter controls (filtering to failed runs should hide the passing ones).

### The step log

Drill into a single run and you get the step log: the ordered list of actions the agent took, often with a snapshot, a duration, and a per-step outcome. This is where debugging happens, so the test bar is high. You want to confirm that steps render in order, that a failed step is visibly marked, that the failure evidence (an error message, a screenshot, a DOM excerpt) is present and readable, and that a passing run shows every step green with no phantom error banner leaking in.

### The status pills

Status pills are small but load-bearing. They are the compressed summary a user scans without reading. The test that matters here is not "a pill exists" but "the pill matches the run's real state." A run that failed must not wear a green pill. A running job should show a running pill and then transition, which means you sometimes test a state change over time. Getting pill semantics wrong is one of the most damaging dashboard bugs, because users trust the color and stop reading.

## Your first run-list check in plain English

Start with a single objective against a live dashboard. The command below opens your dashboard, waits for the run list, and stores what it reads so you can inspect the structured result.

```bash
npm install -g browserbash-cli

browserbash run "Open https://app.example.com/agents/runs, wait for the run list to load, confirm the newest run row shows a name, a status, and a timestamp, and store the newest run's status text as 'top_status'" --agent --headless --timeout 120
```

The `--agent` flag makes the run emit NDJSON, one JSON event per line, so a script or a CI job can read the verdict without parsing prose. Exit code `0` means the objective passed, `1` means it failed, `2` is an error or infrastructure problem, and `3` is a timeout. Those codes are a frozen contract, so you can branch on them in a shell script with confidence. The `store` phrasing captures the value you asked for into the run's `final_state`, which is where you go when you want to assert on the exact status text later.

By default BrowserBash is Ollama-first: it looks for a local model before it reaches for any API key, so nothing leaves your machine unless you point it at a hosted model. For a dashboard test that only reads a page and checks a few facts, a mid-size local model handles it comfortably. One honest caveat: very small local models (around 8B parameters and under) can get lost on long multi-step objectives, so if a flow has many steps, reach for a 70B-class local model like Qwen3 or Llama 3.3, or a capable hosted model.

## Turn the important checks deterministic with Verify

A plain-English objective is great for exploration, but for the assertions you never want to be fuzzy, you want a deterministic check. In a committable `*_test.md` file, a `Verify` step compiles to a real Playwright assertion with no model judgment. A pass means the condition literally held; a fail comes with expected-versus-actual evidence in the run's assertion table. That is the difference between "the agent thought the pill looked green" and "the text 'Failed' was visible and the URL contained /runs/8842."

Here is a test file that opens a specific run and verifies the step log and the pill semantics deterministically. You run it with `browserbash testmd run ./.browserbash/tests/run_log_test.md --agent`, and the file itself, `run_log_test.md`, looks like this:

```markdown
# Agent run-log UI check

1. Open https://app.example.com/agents/runs/8842
2. Wait for the step log to finish loading
3. Verify heading "Run 8842" is visible
4. Verify text "Failed" is visible
5. Verify text "Timed out waiting for selector" is visible
6. Verify url contains "/runs/8842"
```

Steps 3 through 6 are inside the Verify grammar, so they run as hard Playwright checks: heading visible, text visible, URL contains. If the failed run silently lost its error message during a refactor, step 5 fails with real evidence instead of a green suite that hides the regression. Any Verify line that falls outside the supported grammar still runs, but it is agent-judged and flagged `judged: true` in the output, so you can always tell a deterministic pass from a judged one. That flag matters when you are deciding how much to trust a given check. The [deterministic assertions](https://browserbash.com/features) that back Verify are what let you put an agent-driven test in a merge gate without flakiness anxiety.

### Verifying pill state, not pill existence

The pill test is where intent-based checking earns its keep. Write the Verify against the meaning: a failed run's row should show the label your pill renders for failure, and it should not show the success label. If your pills are icon-only or color-only with an accessible name, verify that accessible name. Bind the assertion to what the pill communicates, so a designer swapping the pill component cannot quietly turn every failure green without your suite noticing.

## Seed real data with testmd v2 so tests are not hostage to fixtures

The hardest part of testing a run-log UI is having a run in a known state to test against. You cannot reliably assert "a failed run shows a red pill" if there is no failed run in the account, and hand-maintaining fixture data is its own maintenance tax. testmd v2 solves this by letting a single test file both seed data through the API and verify it through the UI, step by step, against one browser session.

Add `version: 2` to the frontmatter and you unlock two deterministic step types that never call a model. API steps issue real HTTP requests to seed or read data, and Verify steps check the result through the UI. Consecutive plain-English steps still run as grouped agent blocks on the same page, so you mix deterministic seeding with intent-based navigation in one file.

```markdown
---
version: 2
---

# Dashboard shows a seeded failed run

1. POST https://api.example.com/agents/runs with body {"name": "checkout-flow", "status": "failed", "error": "assertion failed on total"}
2. Expect status 201, store $.id as 'run_id'
3. Open https://app.example.com/agents/runs
4. Wait for the run list
5. Verify text "checkout-flow" is visible
6. Verify text "failed" is visible
```

Step 1 seeds a failed run through the API, step 2 asserts the create succeeded and captures the new id, and steps 3 through 6 drive the UI and check that the dashboard renders the seeded run with the right status. Because the seed is deterministic, the test is repeatable: you are no longer hoping the right data happens to exist. One honest limit: testmd v2 currently runs on the builtin engine, which speaks the Anthropic API, so you need an `ANTHROPIC_API_KEY` or a compatible gateway for the plain-English steps in a v2 file. The API and Verify steps are model-free, but the grouped agent steps are not. The full step-type reference lives in the [tutorials](https://browserbash.com/tutorials).

## Run the suite across viewports and wire it into CI

Run lists and step logs are dense, and dense UIs are where responsive layouts fall apart. A status pill that reads fine at 1280 pixels wide can wrap, clip, or overlap the timestamp at 390 pixels. Rather than write separate tests per breakpoint, run the same suite across a viewport matrix and let each test execute once per size, labeled in the events and results so you know which breakpoint failed. The `run-all` orchestrator handles both the matrix and the CI concerns in one command.

The orchestrator derives its concurrency from your real CPU and memory, orders previously-failed and slowest tests first, and detects flaky runs. Add a budget and it stops launching new tests once the suite crosses your spend limit, marks the rest skipped, and exits `2`, so a stuck agent cannot rack up a surprise bill.

```bash
# Run every test at two viewports, sharded and budget-capped, for CI
browserbash run-all .browserbash/tests \
  --matrix-viewport 1280x720,390x844 \
  --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

Every test runs once at desktop width and once at mobile width, so if the pill overlaps the timestamp only on the narrow viewport, that combination fails and the label tells you it was the 390x844 pass, not a mystery. For a single objective you can pass `--viewport 390x844` directly. The `--shard 2/4` slice is computed on sorted discovery order, so four parallel CI machines each take a deterministic quarter of the suite without coordinating. The bundled [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wraps all of this: it installs the CLI, runs the suite, uploads the JUnit, NDJSON, and Result artifacts, supports a shard matrix, and posts a self-updating PR comment with the verdict table so reviewers see the dashboard's health without leaving the pull request.

## Reuse logins and monitor production

A dashboard test that only runs on your laptop is a test that will eventually stop running. Two more pieces make the coverage real: reusing a saved login so you are not authenticating on every test, and monitoring the live dashboard so you learn about breakage before your users do.

### Reuse a login instead of re-authenticating every test

Most agent dashboards sit behind auth, and logging in on every single test is slow and fragile. Save the session once and reuse it. `browserbash auth save dashboard --url https://app.example.com/login` opens a browser, you log in by hand, press Enter, and the session is stored as Playwright storageState. After that, pass `--auth dashboard` on any run, testmd, run-all, or monitor invocation, or set `auth:` in a test file's frontmatter. If a saved profile does not cover the start URL you point it at, BrowserBash prints a warning rather than silently doing nothing, which saves you a confusing "why is it on the login page" debugging session.

### Monitor the live dashboard for state changes

Once the dashboard is in production, you want to know when it breaks for real users, not just in CI. Monitor mode runs a test or objective on an interval and alerts only when the verdict flips, in either direction, so you get a ping when a green dashboard goes red and another when it recovers, and silence in between.

```bash
browserbash monitor ./.browserbash/tests/run_log_test.md --every 10m --notify https://hooks.slack.com/services/XXX --auth dashboard
```

Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload. Because the replay cache records a green run's actions and replays them on the next identical run with zero model calls, an always-on monitor is nearly token-free until the page actually changes, at which point the agent steps back in to figure out what moved. That is what makes running a dashboard check every ten minutes affordable.

## Let your coding agent test the dashboard through MCP

If you build with an AI coding assistant, you can hand it the dashboard test as a native tool. The MCP server exposes BrowserBash over the Model Context Protocol on stdio, so Claude Code, Cursor, Windsurf, Codex, or Zed can call it directly. One line installs it: `claude mcp add browserbash -- browserbash mcp` (the same idea works for the other hosts).

That registers three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON with status, summary, final_state, assertions, cost, and duration. The mental model that trips people up: a failed test is a successful tool call. When your agent asks BrowserBash to check the dashboard and the dashboard is broken, the tool call succeeds and hands back a `failed` verdict for the agent to read and act on. The agent gets a real validation signal instead of a stack trace. This is what "the validation layer for AI agents" means in practice: your coding agent writes dashboard code and then verifies its own work against a real browser before telling you it is done.

## Where a different tool is the better fit

Intent-based testing is not the right hammer for every nail. If you own the dashboard's source and are unit-testing a single pill component in isolation, a component test in your framework's runner is faster than driving a whole browser. If you need pixel-exact visual regression against a golden image, a dedicated visual-diff tool is built for that job and BrowserBash is not trying to replace it. And if your assertions are all deeply structural, checking exact DOM shapes and ARIA trees that never surface to a user, a classic Playwright suite gives you finer control.

Where BrowserBash fits best is the layer between those: the user-visible behavior of a live, data-driven UI where selectors are brittle and the thing you care about is meaning, not markup. Testing that a failed run reads as failed, that the step log shows its error, that filters filter and empty states are honest. That is the sweet spot. Many teams run BrowserBash for the intent-level flows and keep a thin layer of component and unit tests underneath. If you want to weigh the hosted retention and team features against the free CLI, the [pricing page](https://browserbash.com/pricing) lays out what stays free forever (everything that runs on your machine) versus the paid hosted extras.

## A practical adoption path

You do not need to boil the ocean. Start with one objective against your staging dashboard to prove the tool reads your run list correctly. Promote the assertions you never want to be fuzzy into a `run_log_test.md` with Verify steps. Add a testmd v2 file that seeds a known-failed run through the API so your pill test always has real data to check. Run the folder across a viewport matrix in CI with a budget, behind a saved login. Then point monitor mode at production so you learn about breakage before your users file a ticket. Each step is independently useful.

The through-line is that every check is written as intent and returns a deterministic verdict. You describe what a user should see on the run list, in the step log, and on the status pills, and you get an unambiguous pass or fail with evidence, not a screenshot to interpret. That combination, human-readable intent plus a machine-readable result, is what makes an agent dashboard testable without a selector suite you dread maintaining.

## FAQ

### How do I test an AI agent dashboard without writing CSS selectors?

You write plain-English objectives that describe what a user should see, and an AI agent drives a real Chrome browser to find those elements and check them. Because the agent reads the rendered page the way a person does, a class rename or a component swap does not break your test. For the assertions you never want to be fuzzy, you promote them to Verify steps in a test file, which compile to deterministic Playwright checks with expected-versus-actual evidence on failure.

### How can I verify that a status pill shows the correct state?

Bind the assertion to what the pill communicates rather than to its markup. In a testmd file, use a Verify step that confirms the failure label is visible for a failed run and that the success label is not, so a designer swapping the pill component cannot silently turn a failure green. If your pills are icon-only, verify the accessible name instead, and use testmd v2 to seed a run in a known state through the API first so the pill always has real data to check against.

### Do I need an API key to test my dashboard with BrowserBash?

Not for basic checks. BrowserBash is Ollama-first and defaults to a free local model, so simple read-and-verify objectives run entirely on your machine with nothing leaving it. You only need a hosted key for testmd v2 files, which currently run on the builtin engine that speaks the Anthropic API, or when you deliberately choose a capable hosted model for a long multi-step flow that a small local model would struggle with.

### How do I keep a dashboard test running against production?

Use monitor mode to run a test or objective on an interval and alert only when the verdict changes, in either direction, so you get pinged when a green dashboard goes red and again when it recovers. Point it at a Slack incoming webhook for formatted alerts or any other URL for the raw JSON. The replay cache makes an always-on monitor nearly token-free by replaying a green run's recorded actions until the page actually changes.

Ready to put a deterministic verdict on your run list, step logs, and status pills? Install with `npm install -g browserbash-cli` and write your first intent-based dashboard check in minutes. An account is optional, but if you want hosted run history and team features you can [sign up here](https://browserbash.com/sign-up).
