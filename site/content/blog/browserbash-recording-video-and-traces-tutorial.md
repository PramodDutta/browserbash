---
title: Record video, screenshots and traces with BrowserBash
description: "Hands-on BrowserBash record video tutorial: capture .webm session video, screenshots and a Playwright trace with --record, then open every artifact."
date: 2026-03-10
category: tutorial
---

By the end of this tutorial you'll know how to make BrowserBash record video of a real browser run, drop a screenshot at the end, and — on the builtin engine — write a full Playwright trace you can scrub frame by frame. We'll do it the cheap way first: a local model through Ollama, your own Chrome, and the bundled ffmpeg doing the encoding. No cloud, no keys, no per-run bill. The whole thing is one flag, `--record`, but there are some sharp edges around which engine writes a trace and where the files land, so we'll walk through it slowly and actually open every artifact at the end.

BrowserBash is a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome browser step by step — no selectors, no page objects — and you get back a verdict plus any structured values it extracted. Recording artifacts turn that black box into something you can show a teammate, attach to a bug, or replay when a run goes sideways.

## What you'll need

Before the first command, get these in place. None of them cost money on the path we're using.

- **Node.js >= 18** — check with `node -v`. BrowserBash is an npm global.
- **Google Chrome** installed locally — the default `local` provider drives your real Chrome.
- **BrowserBash itself** — install it globally:

```bash
npm install -g browserbash-cli
```

- **A model.** The default `--model auto` resolves to a local Ollama model first if one is running, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. For this lesson we'll lean on Ollama so nothing leaves your machine and the model bill stays at exactly $0. Pull a mid-size model — `ollama pull qwen3` is a good sweet spot. Very small models (8B and under) get flaky on long multi-step objectives, which matters here because recording lengthens runs.
- **ffmpeg** — and here's the good news: `--record` ships with a bundled ffmpeg, so you don't need to install anything. We'll cover the rare case where the bundle can't run in Troubleshooting.

Confirm the install before going further:

```bash
browserbash --version
```

You should see `1.3.1` (or newer). If the command isn't found, your npm global bin directory probably isn't on `PATH` — fix that first, because nothing else will work.

## Step 1 — A plain run, no recording, to set a baseline

Start with the simplest possible thing so you know the agent and the model are talking before you add recording on top. Pick a public, stable target — the BrowserBash docs site or any site you're comfortable hitting repeatedly.

```bash
browserbash run "go to https://browserbash.com and confirm the page heading mentions browser automation"
```

What you should see: the agent narrates a few steps — navigate, read the page, reason about the heading — and finishes with a verdict line like `PASSED` plus a short summary of what it observed. If it extracted any values (it won't here, since we only asked for a confirmation), they'd print as a small structured block.

If this run hangs or the verdict is `error` complaining about a model, stop and fix the model resolution now (see Troubleshooting). Recording can't save a run that never had a working brain.

## Step 2 — Add `--record` for video and a screenshot

Now turn on recording. The `--record` flag does two things on every engine: it captures a screenshot and encodes a `.webm` session video using the bundled ffmpeg.

```bash
browserbash run "go to https://browserbash.com/features and list the top three features you see" --record
```

A couple of things change in the output compared to Step 1:

- The run takes slightly longer to *finish* after the verdict, because ffmpeg has to flush and finalize the `.webm`. Don't kill the process the instant you see `PASSED` — let it write the file.
- The CLI prints the paths to the artifacts it wrote. You'll get a screenshot path and a `.webm` video path. Note them, or just remember the run is also saved to the on-disk run store (more on that in Step 5).

The verdict for this objective should be `PASSED` with a summary, and because we asked it to *list* three features, the structured extracted values will include those three strings. That's the bit you can assert on later.

### What `--record` writes, by engine

This is the one thing people trip on, so here it is plainly:

| Artifact | `stagehand` engine (default) | `builtin` engine |
| --- | --- | --- |
| Screenshot | Yes | Yes |
| `.webm` session video (via bundled ffmpeg) | Yes | Yes |
| Playwright trace (`trace.zip`) | No | Yes |

So if all you want is a video and a final screenshot, the default engine is fine. If you want a *trace* — the rich, step-by-step Playwright timeline with DOM snapshots, network, and console — you need the builtin engine. That's Step 3.

## Step 3 — Get a Playwright trace on the builtin engine

The builtin engine is BrowserBash's in-repo Anthropic tool-use loop driving Playwright directly. Because it *is* Playwright underneath, `--record` can ask Playwright to write a native trace alongside the video and screenshot.

Switch engines with `--engine builtin` and keep `--record` on:

```bash
browserbash run "go to https://browserbash.com/pricing and tell me whether a free tier exists" --engine builtin --record
```

Heads up on the model: the builtin engine is an Anthropic tool-use loop, so it expects an Anthropic-style model. The cleanest path is to set `ANTHROPIC_API_KEY` and let `auto` resolve to `claude-opus-4-8`, or you can point an Anthropic-compatible gateway at it via `ANTHROPIC_BASE_URL` (for example, a local proxy in front of Ollama). If you try to run builtin against a bare `ollama/...` model with no Anthropic-compatible endpoint, the run will error on model resolution rather than silently degrade.

When it works, the output looks like Step 2 — a verdict, a summary, extracted values — but now the artifact list includes a **trace** file (a `trace.zip`) in addition to the screenshot and `.webm`. Hold onto that path; opening it is Step 6 and it's the most useful thing in this whole tutorial.

### Pinning the model explicitly

If you don't want to rely on `auto`, pin the model on the same command:

```bash
browserbash run "go to https://browserbash.com/pricing and tell me whether a free tier exists" --engine builtin --model claude-opus-4-8 --record
```

Here's the quick reference for the flags we're combining in this lesson:

| Flag | What it does | Used here for |
| --- | --- | --- |
| `--record` | Screenshot + `.webm` video via bundled ffmpeg; builtin engine also writes a Playwright trace | Every recorded run |
| `--engine stagehand\|builtin` | Picks who interprets the English. `builtin` is required for a Playwright trace | Trace capture in Step 3 |
| `--model <model>` | Pins the LLM backend instead of `auto` resolution | Forcing claude-opus-4-8 on builtin |
| `--headless` | Runs Chrome with no visible window | Recording on a CI box (Step 7) |
| `--timeout <seconds>` | Caps the whole run | Stopping long runs before they eat the recording |
| `--dashboard` | Opens the local dashboard for this run | Replaying artifacts in-browser (Step 5) |
| `--provider <name>` | Where the browser runs; `local` is default | Staying on your own Chrome |

## Step 4 — Record a real multi-step flow

A single navigation is a warm-up. Recording earns its keep on a multi-step flow, because that's exactly when a run fails halfway and you want to *see* why. Let's record a search-and-read journey end to end.

```bash
browserbash run "go to https://browserbash.com/blog, open the most recent tutorial, and extract its title and publish date" --engine builtin --record --timeout 180
```

Notice the `--timeout 180`. Multi-step objectives wander, especially on smaller models, and a recording of a run that spun in circles for ten minutes isn't useful. Capping at 180 seconds keeps the `.webm` watchable and the trace bounded.

Expected result: a `PASSED` verdict, a summary describing which post it opened, and an extracted-values block with two fields — the title string and the date string. On the artifact side you now have a screenshot of the final article view, a `.webm` of the whole journey including the click into the post, and a trace.zip capturing every Playwright action.

If the model gets lost — opens the wrong post, or the verdict comes back `failed` — that's fine for now. A failed run still produces a recording, and the recording is *how you diagnose the failure*. That's the entire point.

## Step 5 — Find your artifacts and replay them in the dashboard

Every BrowserBash run, recorded or not, is saved on-disk to the run store at `~/.browserbash/runs` (secrets masked, capped at the most recent 200 runs). When you pass `--record`, the screenshot, `.webm`, and — on builtin — the trace are part of that run's saved artifacts. The CLI prints their paths at the end of each run, but the run store is the durable home.

The friendliest way to browse recorded runs is the **local dashboard**. It's fully local, runs on `localhost:4477`, and needs no account:

```bash
browserbash dashboard
```

Open `http://localhost:4477` and you'll see your recent runs, including the recorded ones, with the screenshot, the video, and step details rendered in the browser. You can also pop the dashboard open on a specific run as it finishes by adding `--dashboard` to the run command:

```bash
browserbash run "go to https://browserbash.com/learn and confirm the learning hub loads" --record --dashboard
```

That runs the objective, records it, and opens the local dashboard pointed at the result — handy when you want to eyeball the video the moment a run completes. If your run store ever gets cluttered, `browserbash dashboard --clear` wipes the store clean.

## Step 6 — Open the Playwright trace

This is the payoff. The `.webm` shows you *what happened*; the Playwright trace shows you *why*, because it carries DOM snapshots, network requests, console logs, and a clickable action timeline. You opened the trace on a builtin run back in Step 3 — now let's actually look inside it.

The trace is a standard Playwright `trace.zip`, so the standard Playwright trace viewer opens it. If you have Playwright on your machine:

```bash
npx playwright show-trace ~/.browserbash/runs/<run-id>/trace.zip
```

Replace `<run-id>` with the run directory the CLI named when it finished (or copy the trace path straight from the run output). The viewer opens a local web app where you can:

- Step through each Playwright action the builtin engine took, in order.
- Hover the timeline to see a DOM snapshot at that exact moment — the "before" and "after" of every action.
- Inspect the network and console tabs to catch a failed request or a JS error that derailed the run.

If you don't have Playwright installed globally, `npx` will fetch the trace viewer on demand — you don't need a full Playwright project, just Node. There's also a hosted viewer at `trace.playwright.dev` where you can drag the `trace.zip` in; it runs entirely in your browser and never uploads the file. Either way, the trace is the single richest artifact recording gives you, and it's the first thing I open when a builtin run fails.

## Step 7 — Record headlessly in CI

Local, headed recording is great for debugging at your desk. In CI you want the browser invisible and the run machine-readable, but you still want the artifacts so a failed job leaves evidence behind. Combine `--record`, `--headless`, and `--agent`:

```bash
browserbash run "go to https://browserbash.com and confirm the homepage loads" --record --headless --agent --timeout 120
```

With `--agent`, BrowserBash emits NDJSON — one JSON object per line — instead of prose. You'll get progress events like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}` and a terminal event like `{"type":"run_end","status":"passed","summary":"...","duration_ms":...}`. The exit code mirrors the status: `0` passed, `1` failed, `2` error, `3` timeout. Your CI job keys off the exit code, and the recorded artifacts in the run store get uploaded as build artifacts for whoever has to look at the failure later.

Because `--record` still writes the screenshot, `.webm`, and (on builtin) the trace in headless mode, a red build leaves you a video and a trace even though no human watched it run. That's the workflow you actually want: nobody babysits the run, but when it breaks you can replay exactly what the agent saw. For a deeper dive on agent-mode plumbing, see the [BrowserBash tutorials](https://browserbash.com/tutorials) hub.

## Troubleshooting

Recording adds a few new ways for a run to misbehave. Here are the ones you'll actually hit.

**No trace file appears, only a video and screenshot.** You're on the default `stagehand` engine. Stagehand records video and a screenshot but does *not* write a Playwright trace — only the `builtin` engine does. Re-run with `--engine builtin --record` and the `trace.zip` will show up. This is by far the most common confusion.

**The `.webm` is missing or zero bytes.** Recording uses a bundled ffmpeg, so this is rare, but it happens on locked-down machines where the bundled binary can't execute (restrictive `noexec` temp mounts, aggressive endpoint security). Check that your temp directory allows execution, and re-run a short objective with a generous `--timeout` so ffmpeg has room to finalize. Also make sure you didn't kill the process the instant the verdict printed — the video finalizes *after* the verdict.

**The builtin run errors on model resolution.** The builtin engine is an Anthropic tool-use loop and needs an Anthropic-style model. Set `ANTHROPIC_API_KEY` (so `auto` resolves to `claude-opus-4-8`), pin `--model claude-opus-4-8`, or front a local model with an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`. A bare local `ollama/...` model with no compatible endpoint won't drive builtin.

**The recording is long and useless because the run wandered.** Small local models (8B and under) lose the thread on long multi-step objectives, producing a ten-minute video of an agent going in circles. Two fixes: cap the run with `--timeout` so the recording stays bounded, and move to a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model for the genuinely hard flows. See [choosing a model](https://browserbash.com/learn) for the trade-offs.

**Chrome won't launch for the recorded run.** The `local` provider needs a real Chrome on the machine. On a headless CI box with no Chrome, install Chrome or switch providers. Recording works the same on any provider, but the browser has to actually start before there's anything to record.

## When to use this

Reach for recording whenever a run's *verdict alone* isn't enough — when you need to show someone, attach evidence to a bug, or debug a flow that fails intermittently. For day-to-day green runs, skip `--record` and keep things fast; turn it on for the runs that matter or the ones that broke.

From here, a few natural next steps:

- Make your recorded runs committable and repeatable with [markdown tests](https://browserbash.com/tutorials) (`*_test.md` files with `{{variables}}` and secret masking).
- Wire recorded, headless runs into a pipeline using agent mode — start from the [BrowserBash blog](https://browserbash.com/blog) for CI examples.
- Compare the stagehand and builtin engines in depth so you always know which one writes a trace — the [features page](https://browserbash.com/features) lays out the engine and provider matrix.

## FAQ

### How do I make BrowserBash record video of a browser run?

Add the `--record` flag to any `browserbash run` command. It captures a screenshot and encodes a `.webm` session video using a bundled ffmpeg, so you don't need to install ffmpeg yourself. On the builtin engine it also writes a Playwright trace. The artifact paths print at the end of the run and the files are saved to the on-disk run store.

### Why is there no Playwright trace in my recording?

Only the `builtin` engine writes a Playwright trace. The default `stagehand` engine records video and a screenshot but not a trace. Re-run your command with `--engine builtin --record` and a `trace.zip` will be written alongside the video and screenshot.

### Where does BrowserBash save recorded videos and traces?

Every run is saved on-disk to the run store at `~/.browserbash/runs`, capped at the most recent 200 runs with secrets masked. The screenshot, `.webm` video, and trace live inside each run's directory, and the CLI prints their exact paths when the run finishes. You can also browse them visually in the free local dashboard at localhost:4477.

### Do I need ffmpeg installed to use --record?

No. The `--record` flag uses a bundled ffmpeg, so a stock install with Node 18+ and Chrome is enough to produce video. The only time this fails is on locked-down machines where the bundled binary can't execute, usually because the temp directory blocks running executables.

---

Ready to capture your first recorded run? Install the CLI and try it:

```bash
npm install -g browserbash-cli
```

No account is required to run or record locally. If you later want the optional cloud dashboard, you can [sign up here](https://browserbash.com/sign-up) — it stays opt-in, and nothing leaves your machine unless you explicitly add `--upload`.
