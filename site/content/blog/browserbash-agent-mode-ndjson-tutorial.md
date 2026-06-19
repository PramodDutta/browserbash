---
title: BrowserBash agent mode: NDJSON output for CI and AI agents
description: "Learn BrowserBash agent mode: the --agent NDJSON event schema, how to parse run_end, exit codes, and wire browser runs into CI and a coding agent."
date: 2026-02-24
category: tutorial
---

If you have ever tried to make a CI job decide whether a browser test passed by grepping colored terminal output, you already know why this tutorial exists. By the end of it you will be fluent in **browserbash agent mode**: you will know every field the `--agent` flag emits, how to read progress `step` events as they stream, how to parse the terminal `run_end` object for the verdict and extracted values, and how to wire all of that into a shell script, a CI pipeline, and a coding agent that reacts to the result programmatically. No prose parsing, no brittle regex against human text — just newline-delimited JSON and four exit codes you can trust.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome browser step by step, and you get back a verdict plus structured extracted values. In interactive use it prints friendly progress for a human watching the terminal. Agent mode flips that contract: stdout becomes a machine-readable stream designed to be consumed by a script, a CI runner, or another AI agent. That single flag is the difference between "a thing a person watches" and "a function your software can call."

## What you'll need

This lesson uses the free, fully local path so you can follow along without paying for anything or leaking a single byte off your machine.

- **Node.js >= 18** — check with `node -v`.
- **Google Chrome** installed (the default `local` provider drives your real Chrome).
- **BrowserBash CLI**, installed globally:

```bash
npm install -g browserbash-cli
```

- **A model.** The default `--model auto` resolves to a local Ollama model first, so if you have Ollama running there are zero keys to set. If you would rather use a hosted model, export `ANTHROPIC_API_KEY` (resolves to `claude-opus-4-8`) or `OPENAI_API_KEY` (resolves to `openai/gpt-4.1`). We will stick to the free local path in the examples.
- **`jq`** for parsing JSON on the command line. Optional but it makes the examples readable: `brew install jq` on macOS, or your distro's package manager on Linux.

One honest caveat before we start: agent mode is a transport, not a brain. The quality of the verdict still depends on the model. Very small local models (8B and under) get flaky on long, multi-step objectives — they lose the thread halfway through a checkout flow. The sweet spot for unattended CI is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model for the genuinely hard flows. Keep that in mind when a run comes back `failed` and the objective was a marathon.

## Step 1 — Run a normal interactive run first

Before you flip on agent mode, run something the human way so you have a baseline. Pick a simple, deterministic objective.

```bash
browserbash run "go to example.com and confirm the page heading says 'Example Domain'"
```

You will see a real Chrome window open, the agent navigate, and a friendly, colorized progress log: step numbers, the action it took, a short remark per step, and a final verdict block that says whether the objective passed and prints any values it extracted. This is great for a human at a keyboard. It is terrible for a script — the colors are ANSI escape codes, the layout can change between versions, and "confirm" buried in a sentence is not something you want to regex against. That is exactly the problem the next step solves.

## Step 2 — Turn on agent mode with `--agent`

Add one flag. Everything that was prose becomes NDJSON — newline-delimited JSON, one complete JSON object per line.

```bash
browserbash run "go to example.com and confirm the page heading says 'Example Domain'" --agent
```

Now stdout is a stream you can pipe. Each line is independently parseable, which means you can consume events as they arrive without waiting for the whole run to finish. A run produces a sequence of progress `step` events followed by exactly one terminal `run_end` event. Realistically the stream for that objective looks like this:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened https://example.com"}
{"type":"step","step":2,"status":"passed","action":"observe","remark":"Read the main page heading"}
{"type":"step","step":3,"status":"passed","action":"extract","remark":"Heading text is 'Example Domain'"}
{"type":"run_end","status":"passed","summary":"Heading matched 'Example Domain'.","final_state":{"heading":"Example Domain"},"duration_ms":7421}
```

Two event types, and that is the whole contract. Let's break down each one.

## Step 3 — Read the `step` event schema

Every `step` event reports one action the agent took as it worked toward your objective. The fields are stable, so you can rely on them in tooling:

| Field | Type | What it means |
| --- | --- | --- |
| `type` | string | Always `"step"` for progress events. Use this to discriminate from `run_end`. |
| `step` | number | The 1-based step index, in order. |
| `status` | string | Outcome of this individual step, e.g. `"passed"`. |
| `action` | string | The primitive the agent used, e.g. `navigate`, `observe`, `extract`, `act`. |
| `remark` | string | A short human-readable note about what happened on this step. |

The crucial design point: `step` events are for **progress and observability**, not for decisions. You can stream them to a live log, surface them in a CI annotation, or feed them to a coding agent so it can narrate what is happening. But you should never make your pass/fail decision by counting or inspecting `step` events. The verdict lives in exactly one place, and that is the next step.

### Watch the steps stream live

Because each event is its own line, you can react to them as they come in. Here is a tiny live tailer that prints a friendly line per step using `jq`:

```bash
browserbash run "search npm for 'browserbash-cli' and confirm the package appears" --agent \
  | jq -r 'select(.type=="step") | "  step \(.step): \(.action) — \(.remark)"'
```

You will see one line print per step as the agent works, then nothing for the `run_end` line because the filter drops it. That is fine here — we are only demoing the stream. In real tooling you keep the `run_end` line; we get to that now.

## Step 4 — Parse `run_end`, the one event that decides everything

The terminal event is `run_end`. There is exactly one per run, it is always the last line, and it carries the verdict plus the structured payload. This is the only event your decision logic should read.

| Field | Type | What it means |
| --- | --- | --- |
| `type` | string | Always `"run_end"`. |
| `status` | string | The verdict: `"passed"`, `"failed"`, `"error"`, or `"timeout"`. |
| `summary` | string | One-line natural-language summary of the outcome. For logs and humans, not for branching. |
| `final_state` | object | The structured values the agent extracted — your actual data payload. |
| `duration_ms` | number | Total wall-clock time of the run in milliseconds. |

The mental model is: `status` is your control flow, `final_state` is your data, `summary` is for humans. You branch on `status`. You read your extracted values out of `final_state`. You print `summary` into a log so a person skimming the build understands what happened. You never parse `summary` to decide anything — it is prose, and prose is exactly what we are escaping.

### Grab just the verdict

Pull the last line, which is always `run_end`, and read its status:

```bash
browserbash run "log in at the staging site and confirm the dashboard loads" --agent \
  | tail -n 1 \
  | jq -r '.status'
```

That prints one word: `passed`, `failed`, `error`, or `timeout`. Clean enough to put in a Slack message.

### Pull a value out of `final_state`

Say your objective extracts an order total. The agent puts whatever it pulled into `final_state`, so you read it straight out:

```bash
browserbash run "open the cart and extract the order total as 'total'" --agent \
  | tail -n 1 \
  | jq -r '.final_state.total'
```

No screen-scraping, no parsing English. The agent did the interpreting; `final_state` is the typed result you asked for. This is why agent mode pairs so well with data-extraction jobs as well as pass/fail checks — the same `run_end` object carries both the verdict and the goods.

## Step 5 — Why there is no prose to parse

It is worth pausing on the design philosophy because it changes how you build on top of BrowserBash. In interactive mode the CLI is allowed to be chatty, colorful, and to reword its output between versions — that is good UX for a human. None of that is safe to build automation against. A regex that worked against last month's wording silently breaks when the phrasing changes, and you find out when a broken deploy sails through a green build.

Agent mode removes the temptation entirely. There is no human sentence in the decision path. The verdict is a fixed enum in `status`. The data is a structured object in `final_state`. The schema is small and stable on purpose, so a script written today keeps working. This is the same principle behind machine-readable output everywhere — JSON over stdout, not screen scraping. If you are migrating from a tool where you parsed console text, this is the upgrade: you delete the regex and read a field.

## Step 6 — Use exit codes for the fast path in CI

Parsing `run_end` gives you rich detail, but sometimes you do not even need to read stdout. Agent mode sets a process exit code that mirrors the verdict, so a CI step can pass or fail on the exit code alone.

| Exit code | Meaning |
| --- | --- |
| `0` | `passed` — objective met. |
| `1` | `failed` — agent ran but the objective was not met. |
| `2` | `error` — something broke (bad config, provider/model failure, crash). |
| `3` | `timeout` — the run exceeded `--timeout`. |

The distinction between `1`, `2`, and `3` is the part teams love. A `failed` (1) means your app is actually wrong — investigate the feature. An `error` (2) usually means your harness is wrong — a missing key, a model that would not load, a bad flag. A `timeout` (3) means the run was too slow or the model stalled, which is operational, not a product bug. Treat them differently in CI and you stop wasting time debugging the wrong layer.

A minimal GitHub Actions-style step:

```bash
browserbash run "smoke test: home page loads and the primary CTA is visible" \
  --agent --headless --timeout 120
if [ $? -eq 0 ]; then echo "smoke passed"; else echo "smoke failed"; exit 1; fi
```

Note `--headless` so no window pops up on a CI runner, and `--timeout 120` so a stuck run fails fast at two minutes instead of hanging the job. The `--timeout` value is in **seconds**.

## Step 7 — A robust CI wrapper that reads both signals

For production CI you want the best of both: branch on the exit code for speed, but also capture the full `run_end` for logging and artifacts. Save the NDJSON to a file, then read the last line.

```bash
#!/usr/bin/env bash
set -uo pipefail

OBJECTIVE="log in, open billing, and extract the current plan name as 'plan'"
OUT="bb-run.ndjson"

browserbash run "$OBJECTIVE" --agent --headless --timeout 180 | tee "$OUT"
CODE=${PIPESTATUS[0]}

END=$(tail -n 1 "$OUT")
STATUS=$(echo "$END" | jq -r '.status')
SUMMARY=$(echo "$END" | jq -r '.summary')
PLAN=$(echo "$END" | jq -r '.final_state.plan // "n/a"')

echo "verdict=$STATUS  plan=$PLAN"
echo "summary: $SUMMARY"

case "$CODE" in
  0) echo "::notice::browser check passed" ;;
  1) echo "::error::objective failed — app behavior is wrong"; exit 1 ;;
  2) echo "::error::run errored — check keys/model/config"; exit 1 ;;
  3) echo "::error::run timed out — slow flow or stalled model"; exit 1 ;;
esac
```

A few things to internalize here. `tee` writes the stream to a file and still shows it in the build log. `PIPESTATUS[0]` captures the exit code of `browserbash` rather than `tee`, which is the bug everyone hits the first time. The `// "n/a"` in the `jq` filter gives you a safe default when a field is absent. And the `case` block turns the four exit codes into four distinct CI behaviors instead of a single binary green/red.

If you want a deeper, CI-specific walkthrough of these codes, the [exit codes for CI tutorial](https://browserbash.com/tutorials) on the tutorials hub goes further into pipeline patterns.

## Step 8 — Wire agent mode into a coding agent

Here is where it gets fun. Because `run_end` is structured, another AI agent — a coding assistant, an autonomous fixer, an orchestration loop — can call BrowserBash as a tool and reason over the result. The agent does not read a terminal; it reads a JSON object and decides what to do next.

The pattern is always the same three moves: run with `--agent`, take the last line, branch on `status`, and feed `final_state` and `summary` back to the agent as context. In Node it looks like this:

```bash
node -e '
const { execFileSync } = require("child_process");
let code = 0, out = "";
try {
  out = execFileSync("browserbash",
    ["run", "open the signup page and confirm the email field is required", "--agent", "--headless", "--timeout", "120"],
    { encoding: "utf8" });
} catch (e) { code = e.status; out = e.stdout || ""; }
const last = out.trim().split("\n").pop();
const end = JSON.parse(last);
console.log(JSON.stringify({ exit: code, verdict: end.status, data: end.final_state, note: end.summary }));
'
```

That one-liner prints a single tidy JSON object: `{ "exit": 0, "verdict": "passed", "data": {...}, "note": "..." }`. A coding agent consumes that directly. If `verdict` is `failed`, the agent can open the relevant component, propose a fix, and re-run the same objective to verify. If it is `error`, the agent knows to check configuration rather than touch product code. If it is `timeout`, the agent can retry with a longer `--timeout` or a stronger `--model`. The structured contract is what makes that decision tree possible — none of it works if the agent has to guess from prose.

This is the core reason agent mode exists: it makes a browser run a callable function with a typed return value, which is exactly the shape an AI agent needs. For the bigger picture of how agents drive browsers, the [learn hub](https://browserbash.com/learn) has the conceptual background.

## Step 9 — Combine agent mode with other flags

Agent mode composes with the rest of the `run` surface. The flags you will reach for most in unattended contexts:

| Flag | What it does in agent mode |
| --- | --- |
| `--agent` | Emit NDJSON: `step` events then one `run_end`. |
| `--headless` | No visible browser window — essential on CI runners. |
| `--timeout <seconds>` | Cap the run; on overrun you get `status:"timeout"` and exit code `3`. |
| `--model <id>` | Pin the model, e.g. `ollama/qwen3`, instead of `auto`. |
| `--provider <name>` | Where the browser runs: `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack`. |
| `--engine <name>` | Who interprets the English: `stagehand` (default) or `builtin`. |
| `--record` | Capture a screenshot and a `.webm` session video (and a Playwright trace on the builtin engine). |
| `--upload` | Push this run to the cloud dashboard — requires `connect` first; without it nothing leaves your machine. |

A fully specified unattended run pinned to a capable local model might look like this:

```bash
browserbash run "complete the demo checkout and confirm the order confirmation page" \
  --agent --headless --timeout 240 --model ollama/qwen3 --record
```

The `--record` flag is handy in CI: when a run comes back `failed`, you still have a video and screenshot of exactly what the agent saw, so a human does not have to reproduce it. Recording does not change the NDJSON contract — you still get the same `step` and `run_end` events on stdout; the artifacts land on disk alongside the run.

## Troubleshooting

**`jq: error: Cannot index string with "status"`** — You are piping the whole stream into `jq` instead of one line. The `step` lines and the `run_end` line are separate JSON objects; `jq` needs one object at a time. Use `tail -n 1` to grab the terminal `run_end` line before reading `.status`, or use `select(.type=="run_end")` to filter the stream.

**Exit code is `2` (error) before the browser even moves** — This is almost always config, not your app. On `--model auto` with no local Ollama and no `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` set, model resolution fails and the run errors out with guidance. Start Ollama, or export a key, or pin a reachable model with `--model`. A `2` means fix your harness, not your feature.

**Verdict is `failed` on a long objective with a tiny local model** — Small models (8B and under) lose the plot on long multi-step flows; they will click into a dead end and report the objective unmet. Either shorten the objective into smaller runs, or move to a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a hosted model for the hard flows. Agent mode is faithfully reporting what the model did — the fix is a better driver, not a different flag.

**Runs hang and you never see `run_end`** — Add `--timeout <seconds>`. Without it a stuck page or a stalled model can hang the process indefinitely, which is brutal in CI. With it, an overrun produces a clean `run_end` with `status:"timeout"` and exit code `3` so the job fails fast instead of blocking the runner.

**`--record` produces no video** — Recording uses a bundled ffmpeg for the `.webm`. If video is missing while screenshots still appear, your environment is interfering with the bundled binary (locked-down CI images sometimes do this). The NDJSON stream and verdict are unaffected — recording is an artifact layer on top, not part of the decision path — so your pass/fail logic keeps working regardless.

## When to use this

Reach for agent mode any time a machine — not a human — is the consumer of the output: CI gates, scheduled synthetic checks, and AI agents that call BrowserBash as a tool. For interactive debugging at your desk, skip `--agent` and enjoy the colored output; flip the flag on the moment the run moves into a pipeline.

Good next steps from here:

- [Markdown tests](https://browserbash.com/tutorials) — turn one-off objectives into committable `*_test.md` files with `{{variables}}` and `@import`, then run them with the same agent-friendly verdicts.
- [Choosing a model](https://browserbash.com/learn) — pick the right local or hosted model for your flows so unattended runs stop coming back flaky.
- More walkthroughs on the [BrowserBash blog](https://browserbash.com/blog), and the package itself on [npm](https://www.npmjs.com/package/browserbash-cli).

## FAQ

### What is BrowserBash agent mode?

Agent mode is what you get when you add the `--agent` flag to a `browserbash run` command. Instead of human-friendly colored progress, stdout becomes NDJSON — one JSON object per line, a stream of `step` progress events followed by exactly one terminal `run_end` event with the verdict and extracted data. It is built so CI pipelines and AI agents can consume browser runs programmatically without parsing prose.

### How do I get a pass or fail result from BrowserBash in CI?

Run with `--agent`, take the last line of output (always the `run_end` event), and read its `status` field, which is one of `passed`, `failed`, `error`, or `timeout`. Even simpler, agent mode sets the process exit code to match: `0` for passed, `1` for failed, `2` for error, `3` for timeout. Most CI steps can branch on the exit code alone and only read the JSON when they want detail.

### Why does agent mode avoid prose parsing?

Human-readable text is allowed to change wording and formatting between versions, so any regex you write against it is fragile and can silently break a build. Agent mode puts the verdict in a fixed enum (`status`) and the data in a structured object (`final_state`), so your decision logic reads a stable field instead of guessing from a sentence. The `summary` field stays human prose on purpose — for logs, never for branching.

### Can an AI coding agent call BrowserBash and act on the result?

Yes, that is a primary use case. Because `run_end` is a structured object, a coding agent can run a browser objective with `--agent`, parse the last line, branch on `status`, and read `final_state` and `summary` as context. From there it can propose a fix when a run fails, check configuration when a run errors, or retry with a longer timeout — all without ever reading a terminal, because the run behaves like a callable function with a typed return value.

---

Ready to make your browser runs machine-readable? Install the CLI and flip on `--agent`:

```bash
npm install -g browserbash-cli
```

No account needed to run locally — but if you want the optional cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up) (it stays opt-in).
