---
title: A Browser Automation CLI for SDETs Who Live in the Terminal
description: "A browser automation CLI for SDETs: drive real Chrome from plain English, gate CI on exit codes, and stop maintaining brittle selector suites."
date: 2026-06-05
category: use-case
---

If you are a Software Development Engineer in Test, the terminal is your home. You grep logs, you wire up CI, you pipe JSON through `jq`, and you would rather type a command than click through a SaaS dashboard. A browser automation CLI for SDETs has to respect that. It should run where your tests already run, exit with a code your pipeline can branch on, and never ask you to maintain another wall of CSS selectors that breaks the moment a designer renames a class. This article is about that kind of tool, and specifically about [BrowserBash](https://browserbash.com), a free, open-source CLI that drives a real Chrome browser from a plain-English objective and reports back a verdict your CI can read.

I want to be precise about who this is for. If you own a large, stable Playwright or Selenium suite, you are not throwing it away. What follows is about the band of work where writing and maintaining selectors is pure overhead — new coverage you need today, UIs that churn weekly, smoke checks against staging, exploratory passes nobody had time to script. That band is where a terminal-native AI agent earns its place next to your framework, not against it. It is also the exact crossover space that newer tools like Kane CLI are courting, and I will be honest about where they overlap and where each one wins.

## What "terminal-native" actually means for an SDET

"Terminal-native" gets thrown around loosely, so let me pin it down with the things that matter when you are the person on call at 2 a.m.

A tool is terminal-native when it installs with one package-manager command and runs with one more. When it returns a process exit code that means something — not a 0 on every run that you then have to scrape stdout to interpret. When its machine output is structured, line-delimited, and stable across versions, so you can pipe it into a script instead of writing a regex against prose. And when it does not require a browser tab, a login, or a control plane just to answer "did the checkout flow work or not?"

BrowserBash is built around that contract. You install it with `npm install -g browserbash-cli` (Node 18 or newer, plus Chrome for the local provider). You run an objective in plain English. The agent drives a real browser step by step, and the process exits `0` for passed, `1` for failed, `2` for error, and `3` for timeout. Those four codes are the entire integration surface you need to gate a deploy. No prose parsing, no flaky string matching, no dashboard round-trip.

That is the difference between a tool that *has* a CLI and a tool that *is* a CLI. Plenty of testing platforms bolt a command-line wrapper onto a cloud product; the CLI is a thin client and the real work happens server-side behind an account. A genuinely terminal-native tool inverts that: the work happens on your machine, and any cloud is optional sugar on top.

## The selector-maintenance tax you are paying right now

Every SDET knows the failure mode. A feature works perfectly in the browser. The test is red. You open the trace, and the root cause is `data-testid="submit-btn"` became `data-testid="submit-button"` in a refactor nobody flagged. You spend twenty minutes fixing a locator to assert something that was never broken.

Multiply that by a churning UI and a quarter of your maintenance budget evaporates into selector babysitting. The test was correct. It was just welded to the *structure* of the page instead of the *intent* of the user. That coupling is the original sin of selector-based automation, and it is why a green feature can turn red for reasons that have nothing to do with whether the product works.

A natural-language agent breaks that coupling. You describe intent — "log in as the demo user and confirm the dashboard shows a welcome message" — and the agent reads the page the way a person does, finds the email field by what it looks like and what it is labeled, and adapts when a button moves. There is no `data-testid` for it to depend on, so there is nothing to break when one gets renamed. You can read more about why [CSS selectors are brittle](https://browserbash.com/blog) and how intent-based control sidesteps the problem.

This is not magic, and I will not pretend it is. The agent is reading the DOM and accessibility tree and reasoning about it, which means it is slower per step than a compiled selector and it costs model inference. The trade you are making is maintenance time for run time. For a stable login flow you assert 500 times a day, a hard-coded Playwright selector is cheaper. For a flow that changes weekly or one you would otherwise never get around to scripting, the agent wins decisively.

```bash
# One-shot smoke check against staging, plain English, real Chrome
browserbash run "Go to https://staging.example.com, log in with the demo
account, and confirm the dashboard shows today's order count" --headless
```

## The model story: $0 by default, no keys, nothing leaves your machine

Here is where most "AI testing" tools quietly hand you a bill. They route every run through a hosted model and meter you per token, so what looked free at the demo becomes a line item once it is in CI running hundreds of times a day.

BrowserBash defaults to local. The default model is `auto`, which resolves in a clear order: first it looks for a local Ollama install and uses `ollama/<model>` — free, no keys, fully offline. If there is no Ollama, it falls back to an `ANTHROPIC_API_KEY` (Claude), then an `OPENAI_API_KEY` (GPT-4.1), and if none of those exist it errors with guidance instead of silently doing something expensive. Run on a local model and your model bill is guaranteed $0, and nothing about the page you are testing ever leaves your laptop. For an SDET testing an internal admin panel or a fintech flow under compliance review, that "stays on the machine" property is not a nice-to-have — it is the thing that gets the tool approved.

I owe you the honest caveat that the whole pitch turns on. Very small local models — anything around 8B parameters or under — are flaky on long, multi-step objectives. They will nail "click login and check the heading" and then lose the plot on a six-step checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you try to run a complex multi-page journey on a tiny model and it wanders off, that is expected behavior, not a bug. Size the model to the objective. The [tutorials](https://browserbash.com/tutorials) walk through picking a model for your hardware.

You can pin the model explicitly when you want determinism in CI:

```bash
# Pin a mid-size local model via Ollama — free, offline, no API keys
browserbash run "Search for 'wireless headphones', open the first result,
and extract the price and rating" --model ollama/qwen3

# Or use a hosted model for a hard multi-step flow
browserbash run "Complete the full signup, email verification, and
onboarding wizard" --model claude-opus-4-8
```

## Markdown tests: committable, reviewable, diffable

Plain-English ad-hoc runs are great for exploration. For regression coverage you want something that lives in the repo, shows up in pull requests, and survives a code review. BrowserBash markdown tests give you that.

A `*_test.md` file is a list where each item is a step. It reads like a test case a product manager could understand, but it is executable. You get `{{variables}}` templating so the same file runs against staging and prod, `@import` composition so you can share a login sequence across twenty tests instead of copy-pasting it, and secret-marked variables that are masked as `*****` in every single log line — so credentials never leak into CI output or the run store. After each run it writes a human-readable `Result.md` you can attach to a ticket or paste into a review.

```bash
browserbash testmd run ./checkout_test.md
```

For an SDET, this is the format that makes the agentic approach defensible to the rest of the team. A markdown test is a diff in a pull request. A reviewer can read it without learning a DSL. When the spec changes, you edit a sentence, not a page object and three helper functions. It is executable documentation in the most literal sense, and it is the on-ramp I recommend before you put anything in front of a deploy gate. Learn the format on the [learn page](https://browserbash.com/learn).

## CI-gated checks: the exit codes and NDJSON that make it real

This is the part SDETs care about most, because a check that cannot block a bad deploy is just a dashboard widget.

BrowserBash agent mode (`--agent`) emits NDJSON — one JSON object per line, no prose to parse. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`. The run ends with a single terminal event: `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. Your pipeline reads the last line, or it reads the exit code, and either way it has a clean machine-readable verdict.

The exit codes are the whole integration: `0` passed, `1` failed, `2` error, `3` timeout. That means a GitHub Actions or Jenkins or GitLab CI step is a one-liner — the command's exit status fails the job for you, no scripting required. If you want the structured output for richer reporting, you pipe the NDJSON into `jq` and pull `final_state` or `summary` into a Slack message. The design goal is explicit: built for CI and for AI coding agents that consume events, not humans reading a terminal.

```bash
# CI gate: NDJSON to a log, exit code fails the job automatically
browserbash run "Verify the homepage loads and the primary CTA is clickable" \
  --agent --headless --timeout 120 > smoke.ndjson
# exit 0 = passed, 1 = failed, 2 = error, 3 = timeout
```

When something goes wrong, you want evidence. The `--record` flag captures a screenshot and a `.webm` session video via bundled ffmpeg, and on the builtin engine it also writes a Playwright trace you can open in the trace viewer. Every run is also kept on-disk at `~/.browserbash/runs` (secrets masked, capped at 200), so you have local history without any cloud at all. If you do want a UI, `browserbash dashboard` runs a fully local dashboard on `localhost:4477` — no account, nothing uploaded.

## Where the browser runs: local, CDP, and the clouds

The browser itself is a separate axis from who interprets your English, which is exactly the flexibility an SDET wants. The `--provider` flag controls it.

`local` is the default — your own Chrome. `cdp` attaches to any DevTools endpoint via `--cdp-endpoint ws://...`, which is how you point BrowserBash at a containerized Chrome, a remote debugging session, or a browser you have already authenticated. Then there are three managed clouds: `browserbase`, `lambdatest`, and `browserstack`, each needing its own credentials, with LambdaTest and BrowserStack automatically using the builtin engine. So you can develop locally on free models, then run the same objective against a real Safari or a specific Chrome version on a grid for cross-browser coverage, without rewriting anything.

There are also two engines — who actually interprets the English. `stagehand` is the default (MIT, by Browserbase) with act/extract/observe/agent primitives and self-healing. `builtin` is an in-repo Anthropic tool-use loop driving Playwright, and it is auto-selected for LambdaTest and BrowserStack. You switch with `--engine stagehand|builtin`. Most SDETs never touch this; the default is fine until you have a specific reason to change it.

```bash
# Attach to a containerized Chrome over CDP in CI
browserbash run "Confirm the search returns at least one result for 'laptop'" \
  --provider cdp --cdp-endpoint ws://localhost:9222/devtools/browser --agent
```

## BrowserBash vs the alternatives an SDET will actually weigh

You are not choosing in a vacuum. Here is an honest map of the options, with the genuine trade-offs.

| Tool | Selector-free NL | Runs free/local by default | Account to start | CI exit codes + NDJSON | Best fit |
|---|---|---|---|---|---|
| BrowserBash | Yes | Yes (Ollama-first, $0) | No account needed | Yes (0/1/2/3 + NDJSON) | Terminal-native SDETs who want local-first, account-free, free model runs |
| Kane CLI (TestMu AI) | Yes | Free to start; account required | Yes (`kane-cli login`) | Yes (structured agent mode) | Teams already in the TestMu AI ecosystem wanting managed Test Manager + native agent adapters |
| Playwright / Selenium | No (selectors) | Yes | No | Yes (test-runner exit codes) | Large, stable, deterministic suites where selectors pay for themselves |
| Hosted no-code AI platforms | Yes | Usually metered cloud | Yes | Varies | Non-engineers who want a UI and managed infrastructure over a terminal |

A few honest notes on that table. **Kane CLI** is the closest comparison and a genuinely good tool — it is terminal-native, selector-free, open source under Apache-2.0, supports the same exit-code semantics and NDJSON contract, and ships native adapters for Claude Code, Cursor, Codex CLI, and Gemini CLI. Where it differs: it requires authentication with a TestMu AI account before first use (`kane-cli login`), and it leans into converting plain-English flows into native Playwright code and pausing for a human on OTP/CAPTCHA. If your org is already standardized on TestMu AI / LambdaTest and you want runs tied back to a managed Test Manager, Kane CLI is arguably the better fit — that is its design intent, and I will not pretend otherwise. BrowserBash's distinct bet is account-free, local-first, $0-by-default operation: clone a repo and run a smoke test in sixty seconds with nothing else provisioned.

**Playwright and Selenium** are not competitors so much as the thing you keep for the stable core. If you have a flow you assert thousands of times a day and the UI is frozen, a compiled selector is faster and cheaper than any agent. The honest line is: keep the deterministic suite for the stable core, reach for the agent for the churn. You can read a longer take on [replacing page objects with plain English](https://browserbash.com/blog) only where it actually pays off.

## A realistic adoption path for an existing QA org

Do not rip anything out. Here is how I would actually roll this into a team that already has a framework.

**Week one: ad-hoc exploration.** Install it, point `browserbash run` at the flows you never had time to script — the password reset, the obscure admin toggle, the third-party redirect. Run on a local model so it costs nothing and stays on your machine. You are buying coverage you did not have, with zero maintenance commitment.

**Week two: committable markdown tests.** Take the three smoke checks you run by hand before every release and turn them into `*_test.md` files with shared `@import` login steps and masked secrets. Now they are in the repo, reviewable, and runnable by anyone.

**Week three: a CI gate.** Wire one markdown test into your pipeline in `--agent --headless` mode and let the exit code gate a staging deploy. Add `--record` so a failure leaves a video and trace. Start with a non-blocking job if you are cautious, then promote it to required once you trust it.

**Ongoing.** Let the agent own the churning surface — the marketing pages, the onboarding wizard that product redesigns every sprint, the flows that generate the most selector-maintenance tickets. Let Playwright keep owning the frozen core. Check [pricing](https://browserbash.com/pricing) if you eventually want the optional cloud dashboard, and the [features](https://browserbash.com/features) page for the full surface. There is nothing to buy to get started — the CLI and local dashboard are free.

The goal is not to make the agent do everything. It is to put each kind of work in the cheapest place to maintain it.

## When to choose a CLI agent — and when not to

Balanced advice, because the wrong tool in the wrong slot is how teams sour on a good idea.

**Choose a terminal-native AI agent like BrowserBash when** you need coverage faster than you can write selectors, when the UI changes often enough that maintenance dominates, when you want runs to cost nothing and stay local for privacy or compliance, when you want executable documentation a non-engineer can read, or when an AI coding agent in your stack needs to *verify* its own browser work and consume the result as NDJSON. The local-first, account-free defaults are the differentiator here.

**Stick with selector-based frameworks when** the flow is stable and asserted constantly, when you need millisecond-deterministic timing, when you are doing fine-grained DOM assertions an agent would gloss over, or when your suite is already green and cheap to maintain. There is no prize for converting a working test.

**Reach for a managed platform like Kane CLI instead when** your organization is already invested in the TestMu AI / LambdaTest ecosystem, you want runs centralized in a managed Test Manager, or you specifically want first-class native adapters for your coding agent backed by a commercial support relationship. That is a legitimate set of reasons, and the right answer for some teams.

The unifying idea: an AI browser agent is a maintenance-cost lever, not a silver bullet. Pull it where selector maintenance is expensive. Leave it alone where it is already cheap.

## FAQ

### What is a browser automation CLI for SDETs?

It is a command-line tool that drives a real browser from the terminal so test engineers can run browser checks the same way they run any other script. A modern one like BrowserBash takes a plain-English objective, uses an AI agent to click and type through a real Chrome browser with no selectors, and returns a CI-readable verdict via standard exit codes. It fits the SDET workflow because it installs with one npm command, runs without a dashboard, and pipes structured output into your existing pipeline.

### Can I run browser automation without maintaining selectors?

Yes. Intent-based AI agents read the page the way a person does — by labels, roles, and visible text — instead of binding to a specific `data-testid` or CSS class. That removes the most common source of test breakage, where a green feature turns red only because a locator was renamed. The trade-off is that agent runs are slower per step and use model inference, so they pay off most on UIs that change often rather than on a frozen, heavily-asserted core.

### Does an AI browser automation CLI work in CI like GitHub Actions or Jenkins?

It does, and that is the main point. BrowserBash exits `0` for passed, `1` for failed, `2` for error, and `3` for timeout, so a single CI step fails the job automatically with no scripting. Its `--agent` mode emits NDJSON — one JSON event per line with a stable terminal event — which you can log, pipe through `jq`, or post to Slack. Add `--record` to capture a screenshot, a video, and a Playwright trace whenever a check fails.

### How is BrowserBash different from Kane CLI?

Both are open-source, terminal-native, selector-free CLIs with the same exit-code and NDJSON contracts, so the surface is genuinely similar. The main differences are defaults and ecosystem. BrowserBash is Ollama-first and account-free — it runs on free local models with no login and nothing leaving your machine — while Kane CLI requires a TestMu AI account (`kane-cli login`) and is built to tie runs back to a managed Test Manager with native coding-agent adapters. If you are already in the TestMu ecosystem, Kane CLI may fit better; if you want local-first, $0-by-default runs with zero setup, BrowserBash is the closer match.

Install it and run your first check in under a minute:

```bash
npm install -g browserbash-cli
```

No account is required to run anything local. If you later want the optional free cloud dashboard, you can [sign up](https://browserbash.com/sign-up) — but the CLI, the local dashboard, and free local-model runs cost nothing and need no login.
