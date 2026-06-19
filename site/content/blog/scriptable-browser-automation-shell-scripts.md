---
title: "Scriptable Browser Automation: Wire Plain-English Checks Into Shell Scripts"
description: "Scriptable browser automation from the terminal: compose plain-English browser checks into bash pipelines and cron jobs for smoke tests and uptime monitoring."
date: 2026-05-19
category: ci
---

Most browser checks die in a tab. You open a staging URL, click around, confirm the login still works, and close the window. Nothing is recorded, nothing reruns, and the next person repeats the whole dance. Scriptable browser automation flips that: you write a check once, in plain English, and pipe its verdict into the same shell tooling you already use for backups, log rotation, and health probes. A bash `if` statement decides pass or fail. A cron line decides when it runs. An exit code decides whether your pager goes off. This guide is about treating browser checks as first-class shell citizens — composable, schedulable, and quiet until something breaks.

The reason this matters now is that the hard part of browser automation used to be the *script* itself. Selectors drift, page objects rot, and a redesign breaks fifty tests that have nothing to do with the actual user behavior. When the check is a sentence instead of a selector tree, the brittle layer mostly disappears, and what's left is the part shell scripting was always good at: stitching small commands into pipelines and putting them on a schedule. The rest of this article shows how to do exactly that with [BrowserBash](https://browserbash.com/features), a free, open-source CLI, and where the approach has real limits you should plan around.

## What "scriptable" actually means for a browser check

A tool is scriptable when three things are true. It runs as a single command with no interactive prompts. It signals success or failure through a process exit code, not through prose you have to read. And it emits machine-readable output you can parse without regex gymnastics. Plenty of "automation" tools fail at least one of these — they pop a GUI, they print a wall of color text, or they assume a human is watching the run.

BrowserBash is built for the terminal-first case. You install it once with `npm install -g browserbash-cli` (Node 18+ and Chrome required), then every check is a `browserbash run "<objective>"` invocation. The objective is plain English. An AI agent drives a real Chrome browser step by step — no selectors, no page objects — and returns a verdict plus any structured values it extracted along the way. Because the verdict maps to an exit code, a shell script can branch on it the same way it branches on `grep` or `curl`.

Here's the shape of the whole idea in four lines:

```bash
browserbash run "Go to https://app.example.com, log in, confirm the dashboard loads"
if [ $? -eq 0 ]; then
  echo "smoke check passed"
fi
```

That `$?` is the entire contract. Exit 0 means the agent reached the objective; non-zero means it didn't. Everything else in this article is variations on composing that single fact into bigger systems.

### Exit codes are the API

BrowserBash uses distinct exit codes so a script can react differently to different failure modes:

| Exit code | Meaning | Typical script reaction |
|-----------|---------|-------------------------|
| `0` | passed | continue the pipeline |
| `1` | failed (objective not met) | alert, the app is broken |
| `2` | error (tooling/setup problem) | retry or page the on-call infra owner |
| `3` | timeout | retry once, then alert |

This separation matters more than it looks. A failed check (`1`) usually means a real regression — the login button moved, the cart math is wrong, the page 500'd. An error (`2`) often means *your* environment is wrong — Chrome isn't installed on the runner, a model key expired, the network is down. A timeout (`3`) might just be a slow deploy still warming up. If you collapse all of these into "non-zero = bad," you'll wake people up for the wrong reasons. Branch on them explicitly and your monitoring gets a lot calmer.

## Compose browser checks into bash pipelines

The unix philosophy is small tools piped together, and a browser check slots in cleanly as one of those tools. The trick is deciding *what* flows between stages. For pass/fail gating, the exit code is enough. For anything richer — extracted prices, order numbers, feature-flag states — you want structured output, which is where agent mode comes in.

### Use `--agent` for machine-readable output

Add `--agent` and BrowserBash emits NDJSON: one JSON object per line. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal object: `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. Because each line is a complete JSON document, you can pipe straight into `jq` without buffering the whole stream or parsing prose.

```bash
browserbash run "Open https://shop.example.com, search for 'wireless mouse', \
  read the price of the first result" --agent \
  | jq -r 'select(.type=="run_end") | .final_state'
```

That pipeline gives you the extracted price as data. From there you can compare it to a threshold, write it to a CSV, post it to a Slack webhook, or feed it into the next stage of a larger script. The browser check stops being a yes/no gate and becomes a *source* in your pipeline — the same way `df` is a source of disk numbers.

### Chain checks with `&&` and short-circuit on the first failure

A deploy smoke suite is often a sequence where later steps only make sense if earlier ones passed. There's no point checking the checkout flow if the homepage won't load. Shell `&&` chaining gives you that short-circuit for free:

```bash
browserbash run "Confirm https://app.example.com loads and shows the marketing hero" \
  && browserbash run "Log in at https://app.example.com with the test account, reach the dashboard" \
  && browserbash run "From the dashboard, open Billing and confirm the plan name is visible" \
  && echo "ALL SMOKE CHECKS PASSED"
```

If the homepage check fails, the chain stops and the login check never runs. That's usually what you want for a smoke test — fail fast, fail loud, and don't drown the failure in twenty downstream errors that are all caused by the same root issue. If instead you want every check to run regardless (to collect a full report), drop the `&&` and accumulate exit codes in a variable. Both patterns are a few lines of bash, and which one you pick is a real design decision, not an accident.

### Keep the artifacts for the runs that fail

When a scheduled check fails at 3 a.m., a non-zero exit code tells you *that* it broke but not *why*. Add `--record` and BrowserBash captures a screenshot plus a `.webm` session video using a bundled ffmpeg, so you can watch the actual failure the next morning instead of trying to reproduce it. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200 entries), which means you have a local audit trail without setting up any server. For teams that want a UI over those runs, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — nothing leaves your machine unless you explicitly opt into cloud upload.

## Schedule checks with cron for continuous monitoring

A smoke test you run by hand is a smoke test you forget to run. Cron turns the same one-liner into a heartbeat. The pattern is a tiny wrapper script that runs the check, branches on the exit code, and notifies on failure — then a single crontab line to schedule it.

```bash
#!/usr/bin/env bash
# /opt/monitors/checkout-monitor.sh
set -euo pipefail

OBJECTIVE="Go to https://shop.example.com, add any product to the cart, \
proceed to checkout, and confirm the payment form renders with a card field"

if browserbash run "$OBJECTIVE" --headless --timeout 120 --record; then
  logger -t browserbash "checkout monitor OK"
else
  code=$?
  curl -sf -X POST "$SLACK_WEBHOOK" \
    -d "{\"text\":\"Checkout monitor FAILED (exit $code) — see ~/.browserbash/runs\"}"
fi
```

Schedule it every fifteen minutes:

```
*/15 * * * * /opt/monitors/checkout-monitor.sh >> /var/log/browserbash/checkout.log 2>&1
```

A few details that make the difference between a monitor you trust and one you mute:

- **`--headless`** is non-negotiable on a server with no display. Cron runs without a TTY or an X session, so a windowed Chrome would fail to launch.
- **`--timeout 120`** caps each run so a hung page can't pin a cron slot forever. Pair it with exit code `3` handling if you want to distinguish "slow" from "broken."
- **`set -euo pipefail`** makes the wrapper itself fail loudly instead of silently swallowing a typo in your webhook URL.
- **Append to a log** so you have history beyond the run store, and so a failed cron job leaves a trail you can `tail`.

If you want this same idea inside a CI runner instead of a server crontab — say a scheduled GitHub Actions or Jenkins job — the wrapper barely changes. The deeper walkthrough for one CI flavor lives in the [AI browser tests in a Jenkins pipeline](https://browserbash.com/blog) guide, and the same exit-code-gating logic carries across runners.

### Why the run store is your friend at 3 a.m.

The single most useful property of an on-disk run store is that it survives the cron job. When `*/15` cron fires and fails, the script exits, the process is gone, and stdout has scrolled past — but the run, its steps, and (if you used `--record`) the screenshot and video are still sitting in `~/.browserbash/runs` with secrets masked. You open the dashboard, click the failed run, and watch the agent try to find a "Pay" button that a deploy renamed to "Complete order." That's the whole debugging loop, and it happens after the fact, on your schedule, not under pressure during the incident.

## Markdown tests: committable checks that read like docs

One-liners are perfect for monitors and quick smoke checks. For checks you want to version, review in a pull request, and reuse across environments, BrowserBash has markdown tests. A `*_test.md` file is a plain markdown document where each list item is a step. You run it with `browserbash testmd run ./checkout_test.md`, and it writes a human-readable `Result.md` after each run.

What makes these genuinely useful in a scriptable workflow:

- **`{{variables}}` templating** lets one test file target staging, prod, or a PR preview by passing different values — no copy-paste forks.
- **`@import` composition** lets you build a login fragment once and import it into every test that needs an authenticated session, which is the markdown equivalent of a shared bash function.
- **Secret masking** means a variable marked as a secret shows up as `*****` in every log line, including the run store and `Result.md`. You can commit the test, run it in CI, and not leak the test password into a build log.

Because `testmd run` exits with the same code conventions as `run`, everything in the bash and cron sections above applies unchanged. You can chain markdown tests with `&&`, schedule them in cron, and gate a deploy on them. The difference is that the *check itself* now lives in your repo next to the code it tests, reviewed like any other file. For teams that already practice [agentic testing](https://browserbash.com/learn), markdown tests are usually where the durable, committed checks end up, while one-liners stay for ad-hoc probing.

## The model story: where this runs and what it costs

A scriptable check is only as cheap and private as the model behind it. BrowserBash is Ollama-first. The default model is `auto`, resolved in this order: a local Ollama install (`ollama/<model>`, free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (`claude-opus-4-8`), then `OPENAI_API_KEY` (`openai/gpt-4.1`), otherwise an error with guidance. You can pin any backend explicitly with `--model`, including OpenRouter models like `openrouter/meta-llama/llama-3.3-70b-instruct` or a Stagehand-driven `google/gemini-2.5-flash`.

For a cron monitor that fires every fifteen minutes, the cost math matters. Run a hosted model and you're paying per invocation, all day, forever. Run a local model through Ollama and your model bill is a guaranteed $0 — the agent reasons on your own hardware, and no page content leaves the box. For monitoring something sensitive (an internal admin panel, a healthcare dashboard, a fintech back office), that local-by-default posture is often the whole reason a security team signs off.

### The honest caveat about small local models

Here's the part most vendors won't tell you. Very small local models — roughly 8B parameters and under — get flaky on long, multi-step objectives. They'll nail "go to this URL and confirm the title," then lose the plot on "log in, navigate three pages deep, open a modal, and verify a computed total." The sweet spot for reliable local runs is a mid-size model in the Qwen3 / Llama 3.3 70B class. If your hardware can't host that, a capable hosted model is the pragmatic choice for hard flows, and you can mix: cheap local checks for the simple monitors, a hosted model pinned via `--model` for the gnarly multi-step ones. Don't put a 3B model on your checkout flow and then blame the tool when it wanders off — match the model to the difficulty of the objective.

## Engines and providers: the two knobs that change behavior

Two flags decide *how* a check runs, and they're worth understanding before you wire up a fleet of monitors.

The **engine** is who interprets your English. The default is `stagehand` (MIT-licensed, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when a page shifts. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright; it's used automatically for LambdaTest and BrowserStack providers, and it also writes a Playwright trace when you `--record`. Switch with `--engine stagehand|builtin`.

The **provider** is where the browser actually runs, set with `--provider`:

| Provider | Where the browser runs | What it needs |
|----------|------------------------|---------------|
| `local` (default) | your machine's Chrome | nothing |
| `cdp` | any DevTools endpoint | `--cdp-endpoint ws://...` |
| `browserbase` | Browserbase cloud | `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` |
| `lambdatest` | LambdaTest grid (auto builtin engine) | `LT_USERNAME` + `LT_ACCESS_KEY` |
| `browserstack` | BrowserStack grid (auto builtin engine) | `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` |

For terminal-first monitoring on your own box or a CI runner, `local` is the right default — it's free, it's fast, and it keeps everything on the machine. Reach for `cdp` when you've already got a browser endpoint running (a containerized Chrome, a remote debugging session) and want the agent to attach to it. Reach for the cloud grids when you need a browser you don't have to host, or a specific OS/browser combination your runner can't provide.

## When scriptable browser automation is the right call — and when it isn't

This approach is excellent for a specific shape of problem, and a poor fit for others. Being honest about both is the difference between a tool you keep and one you rip out in a month.

**Choose scriptable browser checks when:**

- You want production and staging *monitored*, not just tested once — synthetic checks on real user journeys (login, checkout, search) running on a schedule.
- Your team lives in the terminal and CI, and wants checks that gate deploys via exit codes rather than a dashboard someone has to remember to look at.
- The flows you care about change UI often enough that maintaining selectors is a real tax, and a plain-English objective that self-heals is worth the tradeoff.
- Privacy or cost rules out streaming every page to a hosted API, and local models on your hardware are a hard requirement.

**Look elsewhere when:**

- You need millisecond-precise, deterministic assertions on exact DOM structure — a hand-written Playwright or Cypress test with explicit locators is more predictable than an agent's interpretation, and for a stable, high-frequency unit-level check that determinism is worth the maintenance.
- You're load testing or scraping at massive scale, where per-run model latency and cost dominate — a headless scripted crawler is the better tool.
- Your only hardware is tiny and you can't run a capable model locally *and* won't pay for a hosted one — the agent will be unreliable on anything complex, and you'll fight it.

There's no shame in mixing approaches. Plenty of teams keep a Playwright suite for deterministic regression and layer BrowserBash on top for the fast-moving smoke and monitoring checks that Playwright's selectors make painful. The [tutorials](https://browserbash.com/tutorials) cover both starting points, and the [pricing page](https://browserbash.com/pricing) lays out exactly what's free (the CLI and local runs are entirely free and open-source under Apache-2.0) versus the optional cloud dashboard.

## A realistic end-to-end monitoring setup

Pulling the pieces together, here's what a small but complete monitoring setup looks like in practice. You have three or four critical journeys: homepage loads, login works, checkout renders, search returns results. Each is a short objective. You wrap them in a single bash script that runs them, collects exit codes, records video on every run, and posts a summary to Slack only when something fails. Cron fires it every fifteen minutes against production and every five minutes against the deploy that just shipped. The run store keeps the last 200 runs on disk, masked and replayable. When a check fails, you open the local dashboard, watch the recording, see the agent confused by a renamed button, and you know in ninety seconds what changed.

That entire system is a few dozen lines of shell, a crontab entry, and a CLI you installed with one npm command. No selenium grid to babysit, no page-object framework to refactor after a redesign, no per-seat SaaS bill for synthetic monitoring. The check is a sentence, the schedule is cron, and the verdict is an exit code — three things every backend engineer already understands. If you want to see how other teams composed these into industry flows, the [case studies](https://browserbash.com/case-study) walk through several.

The bigger point: browser automation doesn't have to live in a separate, fragile universe with its own tooling and its own failures. When a check is scriptable in the real unix sense — single command, exit code, machine-readable output — it joins the rest of your operational toolkit. It pipes, it schedules, it gates. That's where it stops being a chore someone does by hand and becomes infrastructure that quietly watches your app while you sleep.

## FAQ

### What is scriptable browser automation?

Scriptable browser automation means driving a real browser from a single command-line invocation that returns a process exit code and machine-readable output, so you can compose it into shell scripts, pipelines, and cron jobs. The defining traits are no interactive prompts, a clear pass/fail exit code, and parseable output. With a plain-English tool like BrowserBash, the check itself is a sentence rather than a selector tree, which removes most of the brittle maintenance that traditional scripted automation carries.

### How do I run browser checks on a schedule with cron?

Write a small wrapper script that runs `browserbash run` with the `--headless` and `--timeout` flags, branches on the exit code, and sends a notification only on failure. Then add a crontab line such as `*/15 * * * *` pointing at that script, redirecting output to a log file. The `--headless` flag is essential because cron has no display, and the on-disk run store at `~/.browserbash/runs` keeps the failed run replayable so you can debug it later instead of during the incident.

### How does BrowserBash signal pass or fail to a shell script?

BrowserBash uses standard process exit codes: 0 for passed, 1 for failed, 2 for error, and 3 for timeout. A bash script branches on `$?` or uses `&&` chaining exactly as it would with any other command. For richer data, the `--agent` flag emits NDJSON with one JSON object per line, including a terminal `run_end` object you can pipe into `jq` to extract values like prices or order numbers without parsing prose.

### Can I run scriptable browser automation without paying for a model?

Yes. BrowserBash is Ollama-first, so if you have a local model running it resolves to that automatically with no API keys, and nothing leaves your machine, which makes your model bill a guaranteed $0. The honest caveat is that very small local models (8B and under) get unreliable on long multi-step objectives, so the sweet spot for free local runs is a mid-size model in the Qwen3 or Llama 3.3 70B class; for the hardest flows, a capable hosted model pinned with `--model` is the pragmatic choice.

---

Ready to put browser checks on a cron schedule? Install the CLI with `npm install -g browserbash-cli` and run your first plain-English check in under a minute — no account required. When you want the optional cloud dashboard, [sign up here](https://browserbash.com/sign-up) (it stays optional, and the CLI is free and open-source either way).
