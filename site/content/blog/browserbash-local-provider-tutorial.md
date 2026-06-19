---
title: Run browser automation locally with BrowserBash
description: "A hands-on local browser automation CLI tutorial: drive your own Chrome with BrowserBash, headed vs headless, zero API keys, fully on-device."
date: 2026-01-23
category: tutorial
---

By the end of this tutorial you will have a working **local browser automation CLI** on your own machine that drives your real Chrome browser from a plain-English objective — no selectors, no page objects, no cloud account, and no API keys. We will use the default `local` provider in [BrowserBash](https://browserbash.com), which runs the browser on your laptop and (on the Ollama path) keeps the model on-device too, so nothing leaves your machine and your model bill stays at exactly zero dollars.

This is a teach-by-doing lesson. We will install the CLI, run a first objective against a live site, watch the agent step through a real headed Chrome window, then flip it to headless for CI, record a session video, and read the on-disk run store. Along the way you will learn what the `local` provider actually does, when a small local model will bite you, and how to keep everything reproducible. Every command below is real and runnable against BrowserBash 1.3.1.

## What you'll need

The whole point of the `local` provider is a short dependency list. You need exactly three things:

1. **Node.js 18 or newer.** The CLI ships as a global npm package, so any recent LTS works. Check with `node -v`.
2. **Google Chrome (or Chromium).** The `local` provider drives a real Chrome on your machine — headed by default, so you literally watch it work. If you can open Chrome by hand, you are good.
3. **A model brain.** This is the only choice you make. The default is `auto`, which resolves to local Ollama first if it is running. We will use the free, on-device Ollama path for almost every example so there are no keys and no token bill. If you would rather point at a hosted model, you can — there is a table for that below.

No BrowserBash account is required to run anything in this tutorial. The optional dashboards and cloud upload are opt-in and covered near the end.

### Install BrowserBash

One global install and you have the `browserbash` command:

```bash
npm install -g browserbash-cli
```

Confirm it landed and see the top-level commands:

```bash
browserbash --help
```

You should see the core commands — `run`, `testmd`, `dashboard`, `connect` — and the global flags. The package lives on [npm](https://www.npmjs.com/package/browserbash-cli) and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to pin a version or read the code. There is no separate AI plugin to install; model detection is built in, which is what makes the local path so short.

### Set up the free local model (Ollama)

The `local` provider decides *where the browser runs*. The model is a separate decision about *who interprets your English*. To stay fully on-device with no keys, install [Ollama](https://ollama.com), make sure it is running, and pull a model:

```bash
ollama pull qwen3
```

That downloads the weights once and caches them. From here on, the model answers from your own machine. If Ollama is up when you run BrowserBash, the default `auto` resolver finds it and uses `ollama/<model>` automatically — no flag needed. If you skip this and have no Ollama, `auto` will fall through to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, and finally error with guidance if it finds nothing. We will lean on the Ollama path because it is the one that costs nothing and ships nothing off the box.

A quick honest note before we run anything: very small local models (8B parameters and under) are flaky on long, multi-step objectives. They lose the plot halfway through a checkout. The sweet spot for serious local work is a mid-size model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. For single-page checks and extraction, a smaller model is fine. Keep that in your back pocket; we will come back to it in Troubleshooting.

## Step 1 — Run your first local objective (headed)

Let's prove the pipeline end to end. The `run` command takes one plain-English objective in quotes. Because `local` is the default provider and `auto` is the default model, you do not need to pass either:

```bash
browserbash run "Go to https://example.com and tell me the exact text of the main heading"
```

When you hit Enter, a real Chrome window opens on your screen — that is the `local` provider at work, headed by default. You will watch the agent navigate, read the page, and decide it is done. In your terminal, BrowserBash prints a step-by-step trace of what the agent did, then a final verdict block. For a task this simple you should see a `passed` verdict and the extracted heading text returned as a structured value (here, "Example Domain").

The shape of the output is always the same: a sequence of steps (navigate, read, observe), then a terminal result with a status and any values the agent pulled out. That structured `final_state` is the part that makes this useful in scripts — you are not grepping prose, you are reading a verdict.

### Try a real multi-step flow

A single page is a warm-up. The agent earns its keep on flows that would normally need selectors and waits. Point it at a public demo site and give it a goal with a checkpoint:

```bash
browserbash run "Open https://www.saucedemo.com, log in with username 'standard_user' and password 'secret_sauce', add the first product to the cart, open the cart, and verify exactly one item is listed"
```

Watch the headed window: the agent types the credentials, clicks through, opens the cart, and reads it back. Notice you never told it *how* — no CSS selector, no `data-testid`, no element index. It re-reads the live page at each step and figures out the "how" itself. If the cart shows one item, you get a `passed` verdict with a short summary; if the site changed and the item count is wrong, you get `failed` with the agent's explanation of what it actually saw. That difference — a real verdict grounded in the rendered page — is the whole pitch.

## Step 2 — Headed vs headless

By default the `local` provider runs **headed**: a visible Chrome window. That is exactly what you want while you are writing and debugging an objective, because you can see where the agent gets confused. When you move the same objective into CI, or just want it to run quietly in the background, add `--headless`:

```bash
browserbash run "Go to https://example.com and confirm the page loads and shows a heading" --headless
```

Same agent, same verdict, no window. Chrome still launches on your machine — `local` always means *your* browser — it just runs without a visible UI. The terminal trace and final verdict are identical to the headed run, which is the point: you debug headed, then flip one flag for unattended runs. Nothing else about the command changes.

A practical habit: develop an objective headed until it passes reliably two or three times, then add `--headless` for the committed version. If a headless run starts failing where the headed one passed, it is almost always a timing or viewport issue, not the model — more on that in Troubleshooting.

## Step 3 — Record the run for evidence

When a run matters — a flaky bug you are chasing, a CI failure you need to explain — capture it. The `--record` flag saves a screenshot and a `.webm` session video using a bundled ffmpeg, so you do not have to install anything extra:

```bash
browserbash run "Open https://www.saucedemo.com, log in with 'standard_user' / 'secret_sauce', and verify the products page is shown" --record
```

After the run, BrowserBash writes the screenshot and the `.webm` video alongside the run record. You can scrub the video to see exactly what the agent saw at each step — invaluable when a verdict is `failed` and you want to know whether the app broke or the agent misread it. If you are using the `builtin` engine (more on engines below), `--record` also writes a Playwright trace you can open in the Playwright trace viewer for a frame-by-frame, network-and-DOM replay.

One caveat worth stating: `--record` relies on the bundled ffmpeg to mux the video. On a locked-down machine where that binary cannot execute, the screenshot still lands but the `.webm` may not. The fix is in Troubleshooting.

## Step 4 — Inspect the local run store

Every run you execute is kept on-disk, locally, at `~/.browserbash/runs`. You did not have to opt into this and nothing was uploaded — it is your own audit trail. Secrets are masked in the stored records, and the store is capped at the last 200 runs so it never grows without bound. Have a look:

```bash
ls -lt ~/.browserbash/runs | head
```

Each run directory holds the trace, the final verdict, and (if you passed `--record`) the screenshot and video. This is the local-first contract in action: you get full history and replayable evidence without a server, an account, or a single byte leaving your laptop.

If you want a nicer view than `ls`, BrowserBash ships a fully local dashboard. It runs entirely on your machine on `localhost:4477` — no account, no upload:

```bash
browserbash dashboard
```

Open the printed URL and you get a browsable UI over the same on-disk runs: verdicts, steps, screenshots, and videos. You can also open the dashboard on a specific run by adding `--dashboard` to a `run` command, or wipe the local store with `browserbash dashboard --clear` when it gets noisy. None of this touches the network.

## Step 5 — Make it script-friendly with agent mode

The pretty trace is for humans. When you want a CI gate or another program (or an AI coding agent) to consume the result, use `--agent`, which emits NDJSON — one JSON object per line:

```bash
browserbash run "Open https://example.com and verify the heading is visible" --agent --headless
```

You will get a stream of progress objects, one per step, like:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened https://example.com"}
```

followed by a single terminal object:

```json
{"type":"run_end","status":"passed","summary":"Heading is visible","final_state":{"heading":"Example Domain"},"duration_ms":4120}
```

No prose to parse — your script reads the last line, checks `status`, and pulls `final_state`. Better still, the process exit code mirrors the verdict, so a CI job can branch on it without reading JSON at all:

| Exit code | Meaning |
| --- | --- |
| 0 | passed |
| 1 | failed |
| 2 | error |
| 3 | timeout |

That means a bash gate is a one-liner. In a CI step, a non-zero exit fails the job automatically; if you want to act on the distinction, capture `$?` right after the run and branch on `1` (a real assertion failure) versus `3` (the agent ran out of time). Pair `--agent` with `--headless` and you have a clean, unattended local browser automation CLI step that any pipeline can run.

## The flags that matter on `run`

Here are the `run` flags this tutorial uses, plus the rest of the surface so you know what exists. These are the real flags — there are no others to guess at.

| Flag | What it does |
| --- | --- |
| `--provider <name>` | Where the browser runs. `local` (default, your Chrome), `cdp`, `browserbase`, `lambdatest`, `browserstack`. |
| `--engine <name>` | Who interprets the English. `stagehand` (default) or `builtin`. |
| `--model <id>` | Pin the LLM instead of `auto`, e.g. `ollama/qwen3` or `claude-opus-4-8`. |
| `--headless` | Run Chrome with no visible window. Default is headed. |
| `--timeout <seconds>` | Hard cap on how long the agent may work before a `timeout` verdict. |
| `--record` | Save a screenshot and `.webm` session video (bundled ffmpeg); `builtin` also writes a Playwright trace. |
| `--cdp-endpoint <ws-url>` | DevTools endpoint for the `cdp` provider. |
| `--dashboard` | Open the local dashboard for this run. |
| `--upload` | Push this run to the cloud (requires `connect`). Without it, nothing leaves your machine. |
| `--agent` | Emit NDJSON, one JSON object per line, for CI and coding agents. |

A word on the two **engines**, because they are easy to conflate with providers. The provider is *where the browser is*; the engine is *who reads your English*. The default `stagehand` engine (MIT, by Browserbase) uses act/extract/observe/agent primitives and self-heals when a page shifts. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright directly, and it is what gets selected automatically for the LambdaTest and BrowserStack providers. For the `local` provider in this tutorial, the default `stagehand` engine is the right call; reach for `--engine builtin` only when you specifically want the Playwright trace that `--record` produces under it.

## Pinning the model explicitly

`auto` is convenient, but in CI you usually want a deterministic backend so a teammate's stray `ANTHROPIC_API_KEY` does not silently change which model runs. Pin it with `--model`. To force the free local path regardless of environment:

```bash
browserbash run "Open https://example.com and read the heading" --model ollama/qwen3 --headless
```

Here is the backend menu and what each one needs:

| `--model` value | Backend | Needs |
| --- | --- | --- |
| `auto` (default) | Resolves Ollama → Anthropic → OpenAI | Whatever is present; errors with guidance if nothing is |
| `ollama/<model>` | Local Ollama (free, on-device) | Ollama running; `OLLAMA_BASE_URL` / `OLLAMA_MODEL` optional |
| `claude-opus-4-8` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai/gpt-4.1` | OpenAI via Stagehand | `OPENAI_API_KEY` |
| `google/gemini-2.5-flash` | Google via Stagehand | provider key |
| `openrouter/<vendor>/<model>` | OpenRouter | `OPENROUTER_API_KEY` |

The `openrouter` route is the nicest middle ground when a local model is too weak for a flow but you do not want to manage multiple vendor keys — for example `--model openrouter/meta-llama/llama-3.3-70b-instruct` gives you a 70B-class brain through a single key, no local GPU required. You can also point at any Anthropic-compatible gateway by setting `ANTHROPIC_BASE_URL`. But for the bulk of local automation, `ollama/<model>` is the line you want: free, private, and reproducible.

## Step 6 — Save it as a committable markdown test

One-shot `run` commands are great for exploration, but the flows you care about should live in your repo. BrowserBash reads markdown test files where each list item is a step. Create `login_test.md`:

```markdown
# Login smoke test

- Open https://www.saucedemo.com
- Log in with username {{user}} and password {{password}}
- Verify the products page is shown
- Verify at least one product card is visible
```

Run it:

```bash
browserbash testmd run ./login_test.md
```

The `{{variables}}` are templated at run time, and any variable you mark as a secret is masked as `*****` in every log line, so credentials never leak into output or the run store. You can compose shared setup across files with `@import`, and after each run BrowserBash writes a human-readable `Result.md` next to the test — a plain-English record of what passed, what failed, and why. Because the file is just markdown, it diffs cleanly in a pull request and anyone on the team can read it without knowing a test framework. This is the format to graduate your `run` experiments into once they are stable.

## Troubleshooting

A short tour of the failures you are most likely to hit, and the actual fix for each.

**A small local model flakes on long flows.** If a 7B or 8B Ollama model passes single-page checks but loses its way on a multi-step login-and-checkout objective, that is expected behavior, not a bug. Move to a mid-size model — Qwen3 or a Llama 3.3 70B-class model — or pin a capable hosted backend for that one hard flow with `--model openrouter/meta-llama/llama-3.3-70b-instruct` or `--model claude-opus-4-8`. Keep the small model for the cheap checks where it shines.

**`--record` produced a screenshot but no video.** The `.webm` is muxed by a bundled ffmpeg. On a hardened machine where that binary cannot execute, the screenshot still lands but the video does not. Confirm the bundled ffmpeg can run, or fall back to the `builtin` engine's Playwright trace (`--engine builtin --record`), which gives you a frame-by-frame replay without depending on the video muxer.

**`auto` errors saying no model is available.** That means Ollama is not running and neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` is set. Either start Ollama and `ollama pull` a model, or export one of the keys, or pin a backend explicitly with `--model`. The error message tells you exactly which paths it checked.

**A run ends with a `timeout` verdict (exit code 3).** The agent ran out of clock, usually because the flow is long or the model is slow. Raise the ceiling with `--timeout 180` for a three-minute budget, or simplify the objective into smaller checkpoints. A `timeout` is distinct from a `failed` assertion — check the exit code to tell them apart in CI.

**A headless run fails where the headed run passed.** This is almost never the model. It is usually a timing or viewport difference, or a cookie/consent banner that renders differently without a visible window. Re-run headed to watch what changes, then either adjust the objective to dismiss the banner explicitly or give the agent more time with `--timeout`.

## When to use this

The `local` provider is the right default whenever the thing you are automating already runs on your machine or a CI runner: smoke tests before a deploy, single-page verifications, data extraction, and pre-commit checks. Reach for a remote provider (`browserbase`, `lambdatest`, `browserstack`, or a `cdp` endpoint) only when you need cross-browser coverage or a clean cloud session you do not have locally.

If you want to go deeper from here, these sibling lessons pick up where this one ends:

- [Run browser tests with Ollama](https://browserbash.com/tutorials) — the full free, local, private model setup, including model sizing.
- [Markdown test files tutorial](https://browserbash.com/learn) — turning your `run` experiments into committable `*_test.md` suites with `@import` and secrets.
- More walkthroughs and recipes live on the [BrowserBash blog](https://browserbash.com/blog), and the full command surface is documented under [features](https://browserbash.com/features).

## FAQ

### Do I need an API key to run browser automation locally?

No. With the default `local` provider and Ollama running, BrowserBash uses an on-device model through the `auto` resolver, so there is no API key and no token bill. Keys are only needed if you deliberately choose a hosted backend like Anthropic, OpenAI, or OpenRouter. The free local path is the default everything-stays-on-your-machine route.

### What is the difference between headed and headless mode?

Headed mode opens a visible Chrome window so you can watch the agent work, which is ideal while you write and debug an objective. Headless mode runs the same Chrome on the same machine with no window, which is what you want for CI and unattended runs. You switch between them with a single `--headless` flag, and the verdict and trace are identical either way.

### Does BrowserBash send my pages or data to the cloud?

Not unless you explicitly ask it to. On the local provider with a local model, the browser, the page content, your objective, and any extracted values all stay on your machine, and the run store at `~/.browserbash/runs` is on disk only. Data leaves your machine only when you run `browserbash connect` and add `--upload` to a specific run, which is fully opt-in.

### Which local model should I use for browser automation?

For single-page checks and extraction, a small Ollama model is fine and fast. For longer multi-step flows like login-and-checkout, very small models under 8B parameters get unreliable, so step up to a mid-size model in the Qwen3 or Llama 3.3 70B class. If you lack the hardware to run a big model locally, route a 70B-class model through OpenRouter for the hard flows and keep the small local model for cheap ones.

---

That is a complete local browser automation CLI workflow: install, run headed, flip to headless, record evidence, read the local run store, and gate CI on exit codes — all on your own Chrome with zero keys on the Ollama path. Install it and try your own objective:

```bash
npm install -g browserbash-cli
```

An account is optional, but if you want the free cloud dashboard later you can [sign up here](https://browserbash.com/sign-up).
