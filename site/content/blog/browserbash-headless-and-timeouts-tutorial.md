---
title: Headless mode and timeouts in BrowserBash
description: "Hands-on browserbash headless tutorial: run --headless on servers and CI, tune --timeout, and debug runs that only fail when the browser is hidden."
date: 2026-03-27
category: tutorial
---

By the end of this tutorial you'll be able to run BrowserBash headless on a server or CI box with no display attached, tune the run budget with `--timeout` so slow flows don't die early and stuck flows don't hang forever, and — the part nobody warns you about — debug the runs that pass on your laptop but fail the moment the browser goes invisible. The phrase to remember is **browserbash headless**: one flag, `--headless`, that hides the Chrome window so the agent can drive a real browser where there's no screen to draw on. We'll start cheap and local with Ollama, prove the happy path, then deliberately break things and fix them.

BrowserBash is a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome step by step — no selectors, no page objects — and you get back a verdict plus any structured values it pulled off the page. Headless mode and a sane timeout are the two settings that take that from "works on my machine" to "runs unattended in a pipeline at 3am."

## What you'll need

Get these in place first. On the path we're using, none of them cost money.

- **Node.js >= 18** — check with `node -v`. BrowserBash installs as an npm global.
- **Google Chrome / Chromium** installed on the box that runs the command. The default `local` provider drives a real Chrome binary, headless or not. On a CI runner that usually means installing Chrome as part of the job.
- **BrowserBash itself**:

```bash
npm install -g browserbash-cli
```

- **A model.** The default `--model auto` resolves a local Ollama model first, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. For most of this lesson we'll use Ollama so nothing leaves the machine and the model bill stays at exactly $0. Pull a mid-size model — `ollama pull qwen3` is a good sweet spot. Be honest with yourself about model size here: very small local models (8B and under) get flaky on long multi-step objectives, and headless runs tend to be the long ones, so a 70B-class model (Qwen3 / Llama 3.3) or a capable hosted model is worth it for hard flows.

Confirm the install before going further:

```bash
browserbash --version
```

You should see `1.3.1` or newer. If the command isn't found, your npm global bin directory probably isn't on `PATH` — fix that before anything else, because the rest of the tutorial assumes `browserbash` resolves.

## Step 1 — A headful baseline so you know the agent works

Before you hide anything, prove the agent and the model are actually talking. Run a plain, visible run against a stable public target. You'll see a Chrome window pop open and the agent drive it.

```bash
browserbash run "go to https://browserbash.com and confirm the page heading mentions browser automation"
```

What you should see: a window opens, the agent narrates a few steps — navigate, read the page, reason about the heading — and finishes with a verdict line like `PASSED` plus a short summary of what it observed. This is your control. If this fails, headless won't fix it, so stop and sort the model out first (Troubleshooting has the common causes).

Keep this exact objective in mind. We're going to run the *same* objective headless in the next step, and any difference in behaviour between the two is the whole lesson.

## Step 2 — Run it headless

Now add `--headless`. Same objective, no visible window. This is the mode you'll use on every server and CI runner, because there's no display for Chrome to draw onto.

```bash
browserbash run "go to https://browserbash.com and confirm the page heading mentions browser automation" --headless
```

What changes:

- No Chrome window appears. The browser is still real — it loads the page, runs JavaScript, fires events — it just renders off-screen.
- The terminal output looks the same as Step 1: step narration, then a `PASSED` verdict and summary.
- The run is usually a touch faster, because there's no window compositing and your machine isn't spending cycles painting pixels you'll never look at.

If Step 1 passed and Step 2 passed with the same verdict, congratulations — your headless setup is sound and you can run BrowserBash anywhere there's a Chrome binary and a network connection. Most simple objectives behave identically headful and headless. The interesting failures come later, on the heavier flows, and we'll get to those in Troubleshooting.

### When headless is the right default

On a real server you don't usually pass `--headless` for fun — you pass it because there's no choice:

- **CI runners** (GitHub Actions, GitLab CI, Jenkins agents, CircleCI) almost never have a display. Headless is mandatory.
- **Docker containers** without an X server. Same story.
- **Cron jobs and scheduled synthetic checks** on a VPS, where nobody's watching a screen.
- **SSH sessions** into a remote box. You could forward X11, but that's pain you don't need.

Locally, while you're writing and debugging an objective, leave the window visible — watching the agent work is the fastest way to understand why it does what it does. Flip to headless only when you ship the command into automation.

## Step 3 — Understand the run budget with `--timeout`

By default a run has a built-in time budget. `--timeout <seconds>` overrides it: the whole run — every step, all model thinking and browser work combined — must finish inside that window, or BrowserBash gives up and reports a `timeout`.

```bash
browserbash run "go to https://browserbash.com/features and list the top three features you see" --headless --timeout 120
```

That gives the run two full minutes. For a short read-and-extract like this, you'll finish well under it and see a normal `PASSED`. The timeout is a ceiling, not a target — finishing early is fine and expected.

Why you tune it:

- **Raise it** for genuinely long flows: multi-page checkouts, slow staging environments, or local models that think slowly. A flow that needs eight steps against a sluggish site can legitimately want 180–300 seconds. If the budget is too tight, a *working* flow gets killed mid-step and reported as `timeout`, which looks like a real failure but isn't.
- **Lower it** in CI when you'd rather fail fast than let a stuck run burn pipeline minutes. If a smoke check should always finish in under a minute, a 60-second ceiling turns a hang into a quick, clean `timeout` instead of a job that sits there for ten minutes.

### What a timeout looks like vs. a real failure

This distinction trips people up, so be precise about it. A `timeout` means the run ran out of clock — it might have been on its way to passing. A `failed` means the agent finished its reasoning and concluded the objective was *not* met. An `error` means something broke (bad model config, Chrome wouldn't launch). They are three different outcomes with three different exit codes, and you should treat them differently in a pipeline. More on the codes in Step 5.

## Step 4 — The flags that matter for headless and CI

When you move a run into automation you usually combine `--headless` with a couple of others. Here's the slice of the BrowserBash run surface that's relevant to this lesson — every one of these is a real flag, nothing invented:

| Flag | What it does | When to reach for it |
| --- | --- | --- |
| `--headless` | Hides the Chrome window; the browser still runs for real, just off-screen. | Any server, container, or CI runner with no display. |
| `--timeout <seconds>` | Sets the total wall-clock budget for the whole run. Exceeding it ends the run with a `timeout` outcome. | Raise for slow/long flows; lower in CI to fail fast on hangs. |
| `--record` | Captures a screenshot and a `.webm` session video via bundled ffmpeg; on the builtin engine also writes a Playwright trace. | Debugging headless-only failures where you can't watch the screen. |
| `--agent` | Emits NDJSON — one JSON object per line — instead of prose. | CI and AI coding agents that need to parse outcomes, not read English. |
| `--model <id>` | Pins the LLM backend instead of `auto`. | Force a specific local or hosted model for repeatable CI runs. |
| `--engine <stagehand\|builtin>` | Chooses which engine interprets the English. `stagehand` is the default; `builtin` also writes a Playwright trace under `--record`. | Use `builtin` when you want a trace from a headless run. |
| `--provider <name>` | Where the browser runs: `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack`. | Stay on `local` for headless on your own box; switch only when you need a remote grid. |
| `--dashboard` | Opens the local dashboard on this run (localhost:4477, fully local). | Inspecting a run from a machine where you *do* have a browser to view it. |

A realistic CI invocation that pulls several of these together:

```bash
browserbash run "go to https://browserbash.com/pricing and confirm a free tier is mentioned" --headless --timeout 90 --agent
```

Headless because the runner has no screen, a 90-second ceiling so a hang fails fast, and `--agent` so the job step can read a clean JSON outcome instead of scraping prose.

## Step 5 — Read the outcome in CI (NDJSON + exit codes)

`--agent` is what makes BrowserBash safe to wire into a pipeline. Instead of English, you get NDJSON: progress events while it works, then one terminal event. A progress event looks like this:

```bash
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"opened pricing page"}
```

And the final line — the one your script actually cares about — looks like this:

```bash
{"type":"run_end","status":"passed","summary":"free tier confirmed on pricing page","final_state":{},"duration_ms":18450}
```

The `status` on that `run_end` line maps directly to the process exit code, so most CI systems don't even need to parse the JSON — they just check whether the step succeeded:

| Exit code | Meaning |
| --- | --- |
| `0` | passed |
| `1` | failed |
| `2` | error |
| `3` | timeout |

That's why the `timeout` vs `failed` distinction from Step 3 is load-bearing. In a pipeline, a `3` (timeout) might mean "bump `--timeout` and retry," while a `1` (failed) means "the app is genuinely broken, page someone." Treat them the same and you'll either retry real bugs or alert on slow networks. To see the codes yourself, run a command and immediately check `echo $?`.

Every run is also saved on-disk at `~/.browserbash/runs` (secrets masked, capped at the most recent 200), so even a headless CI run leaves a record you can inspect after the fact.

## Step 6 — Capture evidence from a headless run with `--record`

Here's the headless paradox: the runs most likely to fail unattended are exactly the ones you can't watch. The fix is to record them. Add `--record` and the run drops a screenshot plus a `.webm` video, even though no window was ever on screen.

```bash
browserbash run "go to https://browserbash.com/features and list the top three features" --headless --record --engine builtin
```

Two things to know:

- `--record` works on every engine for the screenshot and `.webm`. If you also want a **Playwright trace** — the frame-by-frame, DOM-inspectable artifact that's gold for debugging — use `--engine builtin`, which writes one alongside the video.
- The run takes slightly longer to *finish* after the verdict, because ffmpeg has to flush and finalize the `.webm`. Don't kill the process the instant you see the verdict; let it write the file.

In CI, archive that `.webm` and trace as job artifacts. When a headless run fails on the runner but passes on your laptop, the video is usually the fastest way to see what the agent actually saw — a cookie banner, a different layout, a redirect you don't get locally.

## Troubleshooting

These are the real failure modes you'll hit running BrowserBash headless, and how to get out of each.

### A run passes headful but fails or times out headless

This is the classic, and there are a few usual suspects. Headless Chrome sometimes gets a **different default viewport**, so responsive sites render a layout (or a hamburger menu) the agent didn't expect — make the objective explicit about what to click rather than relying on a desktop layout. Some sites also gate on **bot/headless detection** and serve a challenge page. And headless runs are often slightly slower end to end on a loaded CI box, which can nudge a borderline flow past its budget. First move: re-run the same objective with `--record --engine builtin` and open the screenshot/trace to see what the headless browser actually rendered.

### The run dies with a `timeout` (exit code 3)

The budget was too small for the work. Raise it: `--timeout 240` gives a heavy multi-page flow room to breathe. If a *simple* objective times out, the cause is usually upstream — a local model that's too small thrashing on a long objective, or a slow/unreachable target. Watch one headful run to see where the time goes before you keep raising the ceiling; an infinitely large timeout just turns a fast failure into a slow one.

### Small local model can't finish the flow

If your verdicts wander, contradict the page, or stall on multi-step objectives, suspect the model before the flag. Models at 8B and under are genuinely flaky on long headless flows. Pull a mid-size model (`ollama pull qwen3`, or a Llama 3.3 70B-class model) and pin it with `--model ollama/qwen3`, or fall back to a capable hosted model by setting `ANTHROPIC_API_KEY` and letting `auto` resolve to `claude-opus-4-8`. This single change fixes more "headless is broken" reports than any browser setting.

### `--record` produces no video

`--record` relies on a bundled ffmpeg. In the rare case the bundle can't execute on your platform — an unusual CI image, a locked-down container — the screenshot may write but the `.webm` won't. Confirm by checking whether an ffmpeg binary is reachable on the runner, and prefer a standard Chrome-capable CI image. Remember the trace only appears when you're on `--engine builtin`; on the default Stagehand engine you'll get the screenshot and video but no Playwright trace.

### Chrome won't launch on the server

The `local` provider needs an actual Chrome/Chromium binary on the box. CI runners and slim containers often don't ship one — install Chrome as a step in the job. If you genuinely can't put Chrome on the runner, point BrowserBash at a remote browser instead: a DevTools endpoint via `--provider cdp --cdp-endpoint ws://...`, or a hosted grid like `--provider browserbase` (needs `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`). Those move the browser off the runner entirely, so headless-on-the-runner stops being your problem.

## When to use this

Reach for `--headless` whenever a human isn't watching the screen: CI pipelines, containers, cron-driven synthetic checks, and remote servers. Pair it with a deliberate `--timeout` so slow flows survive and stuck ones fail fast, and add `--record` on the runs you can't observe live. For local development, stay headful — seeing the agent work is the best debugger there is.

From here, a few sibling tutorials build directly on this one:

- [Run BrowserBash in CI with exit codes and NDJSON](https://browserbash.com/blog) — wire the `--agent` output and exit codes from Step 5 into a real pipeline.
- [Record video, screenshots and traces](https://browserbash.com/tutorials) — go deeper on the `--record` artifacts you used in Step 6.
- [Choosing a model for BrowserBash](https://browserbash.com/learn) — pick the right local or hosted backend so your headless runs actually finish.

Browse the full set at [browserbash.com/tutorials](https://browserbash.com/tutorials) and the conceptual write-ups at [browserbash.com/learn](https://browserbash.com/learn).

## FAQ

### Does BrowserBash run headless by default?

No. By default the `local` provider opens a visible Chrome window, which is what you want while you're writing and debugging an objective on your laptop. Add the `--headless` flag to hide the window for servers, containers, and CI runners that have no display attached.

### What is the difference between a timeout and a failed run in BrowserBash?

A `timeout` (exit code 3) means the run hit its wall-clock budget before the agent could reach a verdict — it may have been on its way to passing. A `failed` (exit code 1) means the agent finished reasoning and concluded the objective was not met. Treat them differently in CI: a timeout often warrants raising `--timeout` and retrying, while a failed run usually signals a real bug.

### How do I set the timeout for a BrowserBash run?

Pass `--timeout <seconds>` on the run command, for example `--timeout 180` to give a long flow three minutes. The budget covers the entire run — every step, model thinking, and browser work combined. Raise it for slow or multi-page flows and lower it in CI when you'd rather fail fast on a hang.

### Why does my BrowserBash run work locally but fail headless in CI?

The most common causes are a different headless viewport that changes the page layout, bot or headless detection serving a challenge page, a slower CI box nudging a flow past its timeout, or a model that's too small for the flow. Re-run with `--record --engine builtin` and open the screenshot or Playwright trace to see exactly what the headless browser rendered, then adjust the objective, timeout, or model accordingly.

## Get started

Install the CLI and run your first headless objective in under a minute:

```bash
npm install -g browserbash-cli
```

No account needed to run locally. If you later want optional cloud runs and a hosted dashboard, sign up (it's free and opt-in) at [browserbash.com/sign-up](https://browserbash.com/sign-up).
