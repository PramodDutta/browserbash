---
title: Free local browser automation with Ollama and BrowserBash
description: "A hands-on Ollama browser automation tutorial: pull a model, let BrowserBash auto-resolve it, tune OLLAMA_MODEL and OLLAMA_BASE_URL, and pick the right size."
date: 2026-02-10
category: tutorial
---

By the end of this tutorial you'll be running **Ollama browser automation** end to end — a real Chrome window, driven by a local model, verifying a real web flow — for exactly zero dollars and with nothing leaving your machine. No API keys, no cloud account, no per-run billing. You'll pull a model with `ollama pull`, watch BrowserBash's `auto` resolver pick it up on its own, learn how `OLLAMA_MODEL` and `OLLAMA_BASE_URL` change which model and host get used, and — the part most guides skip — you'll see exactly where small local models fall apart so you don't ship a flaky run into CI.

I'm going to treat this like a pairing session. We'll start from the cheapest possible setup, run a simple objective, then deliberately push a tiny model past its limits so you can recognize that failure mode in the wild. Then we'll size up to a model that actually holds together on a multi-step flow. Every command below is copy-pasteable and accurate to the current CLI.

## What you'll need

- **Node.js 18 or newer.** Check with `node --version`. BrowserBash requires `>= 18`.
- **Google Chrome** installed locally. The default `local` provider launches your real Chrome, so the agent drives the same browser your users see.
- **Ollama** installed and running. Grab it from [ollama.com](https://ollama.com) — it's a tiny daemon that serves local models over HTTP on `127.0.0.1:11434` by default.
- **BrowserBash**, installed globally:

```bash
npm install -g browserbash-cli
```

That's the entire bill of materials. No `ANTHROPIC_API_KEY`, no `OPENAI_API_KEY`, no provider credentials. The whole point of the local path is that the model runs on your hardware, so the **model bill is guaranteed $0** and your URLs, form data, and page content never touch a third-party API.

Confirm the install before we go further:

```bash
browserbash --version
```

You should see `1.3.1` (or newer). If the command isn't found, your npm global bin directory probably isn't on `PATH` — re-run the install and check `npm bin -g`.

## Step 1 — Pull a local model with Ollama

Ollama won't serve anything until you've pulled at least one model. Let's start by pulling a small one on purpose, so you can feel the trade-off firsthand before we size up.

```bash
ollama pull llama3.1:8b
```

The first pull downloads a few gigabytes; subsequent runs are instant because the weights are cached on disk. While that's running, confirm the Ollama daemon is actually up:

```bash
ollama list
```

You'll get a table of installed models with their sizes and digests. If `ollama list` errors with a connection refused, the daemon isn't running — start it with `ollama serve` (or just launch the Ollama app) and try again. BrowserBash talks to that exact daemon, so if `ollama list` works, BrowserBash will find it.

### Why we're starting small

An 8B model is the kind of thing people reach for first because it's fast and fits in modest RAM. It's a perfectly good teaching tool. But hold the thought — by Step 5 you'll see why it's the wrong default for anything beyond a couple of steps. Starting here makes the size lesson concrete instead of abstract.

## Step 2 — Let `auto` resolve to Ollama

Here's the part that makes the local story so smooth: you don't have to tell BrowserBash to use Ollama. The default model is `auto`, and the resolver checks, in order:

1. Is a local **Ollama** daemon reachable? Use it as `ollama/<model>` — free, no keys.
2. Else, is `ANTHROPIC_API_KEY` set? Use `claude-opus-4-8`.
3. Else, is `OPENAI_API_KEY` set? Use `openai/gpt-4.1`.
4. Else, error out with guidance on how to configure one of the above.

Because you've got Ollama running and no API keys exported, step 1 wins. Run your first objective:

```bash
browserbash run "Go to example.com and tell me the heading text on the page"
```

The agent launches Chrome, navigates to the page, reads it, and prints a human-readable verdict. Expect something close to:

```
PASSED — The page heading reads "Example Domain".
Model: ollama/llama3.1:8b · Provider: local · Engine: stagehand
```

Two things to notice. First, the verdict line tells you which backend actually ran — `ollama/llama3.1:8b` — so you're never guessing. Second, that single-step objective is well within an 8B model's reach. Easy wins look easy. The cracks show up on length, which is exactly what we'll provoke later.

Every run is also saved on-disk at `~/.browserbash/runs` (secrets masked, capped at the last 200 runs), so you can scroll back through what the agent did without re-running anything.

## Step 3 — Pin the model with `OLLAMA_MODEL` and `--model`

`auto` is convenient, but you'll often want to be explicit — especially in scripts and CI where you don't want resolution to silently change because someone exported a key. You have two levers.

**Lever one: the `OLLAMA_MODEL` environment variable.** This tells the `auto` resolver *which* Ollama model to use when it picks the local path:

```bash
export OLLAMA_MODEL=qwen3
browserbash run "Go to example.com and report the first paragraph of body text"
```

Now `auto` still resolves to Ollama, but it uses `ollama/qwen3` instead of guessing. The verdict line will reflect it.

**Lever two: the `--model` flag.** This pins the backend for one run, bypassing `auto` entirely:

```bash
browserbash run "Go to example.com and report the first paragraph of body text" \
  --model ollama/qwen3
```

`--model` always wins over `auto`. Use it when you want a command to be self-documenting — anyone reading the script sees exactly which model runs, no environment archaeology required.

Here's how the local knobs stack up:

| Lever | Scope | What it controls | When to reach for it |
| --- | --- | --- | --- |
| `auto` (default) | All runs | Picks Ollama → Anthropic → OpenAI by what's available | Local-first dev where you just want it to work |
| `OLLAMA_MODEL` | All `auto` runs in the shell | Which Ollama model `auto` uses | You always want the same local model in this environment |
| `OLLAMA_BASE_URL` | All Ollama runs in the shell | Which Ollama host/port to hit | Remote or non-default Ollama daemon |
| `--model ollama/<name>` | One run | Exact backend, ignores `auto` | CI and scripts that must be explicit |

A quick note on precedence so nothing surprises you: `--model` on the command line beats everything. If you don't pass `--model`, `auto` runs and consults `OLLAMA_MODEL` to decide which local model to use. `OLLAMA_BASE_URL` is orthogonal — it only changes *where* the Ollama daemon lives, not which model is chosen.

## Step 4 — Point at a remote Ollama with `OLLAMA_BASE_URL`

By default BrowserBash talks to Ollama at `http://127.0.0.1:11434`. That's perfect on a laptop, but plenty of teams run Ollama on a beefier box — a workstation with a real GPU, or a shared server — and drive it from a thinner machine. `OLLAMA_BASE_URL` redirects BrowserBash to that host.

```bash
export OLLAMA_BASE_URL=http://192.168.1.50:11434
export OLLAMA_MODEL=llama3.3
browserbash run "Open example.com and confirm the page loads without errors" \
  --model ollama/llama3.3
```

Now the agent's reasoning happens on the GPU box at `192.168.1.50`, while Chrome still runs locally under the default `local` provider. This is a clean way to keep heavy inference off your laptop without giving up the privacy guarantee — the traffic stays on your own network, and still nothing goes to a hosted API.

A few things worth knowing about this setup:

- The model named in `--model` (or `OLLAMA_MODEL`) must actually be pulled **on the remote host**, not your laptop. Run `ollama list` over there to confirm. A missing model on the remote daemon is the most common cause of a connection that opens but immediately errors.
- Make sure the remote Ollama is bound to a reachable interface. Out of the box Ollama listens on localhost only; on the server you'll typically set `OLLAMA_HOST=0.0.0.0` for the daemon so it accepts LAN connections. That's an Ollama-side setting, not a BrowserBash flag.
- If you unset `OLLAMA_BASE_URL`, BrowserBash falls right back to the local daemon. Nothing is sticky beyond your shell.

## Step 5 — Watch a small model flake, then size up

This is the most important step in the tutorial, so don't skip it. **Very small local models (8B and under) are genuinely flaky on long, multi-step objectives.** They're fine for "read this one value off this one page." They start losing the plot when an objective chains several actions with state that has to be remembered across steps.

Let's provoke it. Run a multi-step flow against the small model you pulled first:

```bash
browserbash run "Go to the W3Schools HTML form demo, fill the first name field with Ada, the last name field with Lovelace, submit the form, and confirm the submitted values appear on the results page" \
  --model ollama/llama3.1:8b
```

With an 8B model, you'll often get one of these failure shapes:

- It fills one field, forgets the second, and submits a half-empty form.
- It clicks submit before filling anything, then reports a confident-sounding but wrong `PASSED`.
- It loops or stalls and eventually trips the run `timeout`.

That last one — a confident wrong verdict — is the dangerous one, because it's the kind of green you can't trust. Recognizing this shape now means you won't waste an afternoon later wondering why a "passing" CI job missed a broken form.

Now run the identical objective against a mid-size model. The sweet spot for local browser automation is a **Qwen3 or Llama 3.3 70B-class** model — big enough to hold a multi-step plan together:

```bash
ollama pull llama3.3
browserbash run "Go to the W3Schools HTML form demo, fill the first name field with Ada, the last name field with Lovelace, submit the form, and confirm the submitted values appear on the results page" \
  --model ollama/llama3.3
```

The 70B-class model fills both fields, submits, reads the results page, and returns a `PASSED` you can actually believe — with the extracted values in the structured output. The difference isn't subtle. If your hardware can run a 70B-class model (or you point `OLLAMA_BASE_URL` at a box that can), that's the model to reach for on real flows. If it can't, that's the honest signal that a hard flow wants a capable hosted model instead — but that's a different lesson, and it costs money.

### Capture proof of the run

When you've got a flow worth keeping a record of, add `--record`. BrowserBash captures a screenshot plus a `.webm` session video using bundled ffmpeg:

```bash
browserbash run "Go to the W3Schools HTML form demo, fill the first name field with Ada, the last name field with Lovelace, and submit the form" \
  --model ollama/llama3.3 \
  --record
```

The video and screenshot land in the run folder under `~/.browserbash/runs`. None of this uploads anywhere — `--record` is purely local, same as everything else in this tutorial. (If you ever do want a shareable cloud run, that's an explicit opt-in via `browserbash connect` and a per-run `--upload` flag, and free cloud runs are kept 15 days. We're not using it here.)

## Step 6 — See your local runs in the dashboard

Reading verdicts in the terminal is fine, but BrowserBash ships a fully local dashboard that's nicer for browsing run history, screenshots, and recordings:

```bash
browserbash dashboard
```

It serves on `http://localhost:4477` and reads from the same on-disk store, so every local Ollama run you've done so far is already there. It's entirely local — no account, no upload. If you ever want to start fresh, `browserbash dashboard --clear` wipes the store. You can also pop the dashboard open as part of a run by adding `--dashboard` to a `run` command.

## Step 7 — Wire a local Ollama run into CI with `--agent`

The same zero-cost local flow works in automation. Pass `--agent` and BrowserBash emits NDJSON — one JSON object per line — instead of prose, which is exactly what a CI job or an AI coding agent wants to parse.

```bash
browserbash run "Go to example.com and confirm the heading reads Example Domain" \
  --model ollama/qwen3 \
  --agent
```

You'll get a stream of step events and one terminal event, shaped like:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Loaded example.com"}
{"type":"run_end","status":"passed","summary":"Heading matched.","final_state":{},"duration_ms":4120}
```

No prose parsing required — just read the `run_end` line. The exit code mirrors the verdict so a shell `if` is enough to gate a pipeline: `0` passed, `1` failed, `2` error, `3` timeout. That timeout code is why the earlier `--timeout` advice matters; on slow local inference a `3` is a distinct, catchable outcome rather than a generic failure.

## Troubleshooting

**`auto` resolves to a hosted model instead of Ollama.** The resolver only picks Ollama when the daemon is reachable. If `ollama list` errors, BrowserBash skips to the next option — and if you have `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` exported, it'll quietly use those (and bill you). Fix the daemon (`ollama serve`), or force the local path explicitly with `--model ollama/<name>`.

**"model not found" when the daemon is up.** You named a model in `--model` or `OLLAMA_MODEL` that hasn't been pulled. Run `ollama list` and pull the exact tag you're referencing — note that `llama3.3` and `llama3.1:8b` are different models. On a remote setup, remember the model must be pulled on the **remote** host, not your laptop.

**A multi-step run "passes" but clearly did the wrong thing.** This is the classic small-model failure. Don't trust a sub-8B model on objectives with more than two or three chained actions. Re-run against a Qwen3 / Llama 3.3 70B-class model, or reach for a capable hosted model for the genuinely hard flows. Length and state are what break small models, not difficulty of any single step.

**`--record` produces a screenshot but no video.** The session video relies on the bundled ffmpeg. If your environment stripped it or blocks the bundled binary, the screenshot still saves but the `.webm` won't. Confirm ffmpeg is runnable in your shell; on locked-down CI runners you may need to allow the bundled binary or install ffmpeg system-wide.

**Runs hit the timeout on slow local inference.** Big models on CPU-only machines are slow, and a long objective can exceed the default window. Raise it with `--timeout <seconds>` — for example `--timeout 240` — or move inference to a GPU box via `OLLAMA_BASE_URL`. A timeout exits with code `3`, distinct from a failed verdict, so CI can tell them apart.

## When to use this

Reach for the local Ollama path whenever privacy and zero cost matter more than raw model power: dev-loop smoke checks, scraping internal tools, reproducing a bug locally, or any flow where the data genuinely shouldn't leave your machine. When a flow is hard *and* long, size up the local model first, and only then consider a hosted backend.

From here, a few good next steps:

- [Choosing the right model for BrowserBash](https://browserbash.com/blog) digs deeper into the `auto` resolver and size-vs-difficulty trade-offs.
- The full [tutorials hub](https://browserbash.com/tutorials) walks through providers, engines, and CI integration one lesson at a time.
- The [learn](https://browserbash.com/learn) section covers the mental model behind natural-language browser automation if you want the "why" under the "how."
- Browse [features](https://browserbash.com/features) for the full surface, or the [source on GitHub](https://github.com/PramodDutta/browserbash) if you'd rather read the code.

## FAQ

### Is Ollama browser automation with BrowserBash really free?

Yes. When `auto` resolves to a local Ollama model, all inference runs on your own hardware, so there is no model bill at all. The CLI itself is free and open-source under Apache-2.0, and you don't need an account to run it. The only cost is the electricity and RAM the model uses on your machine.

### How does BrowserBash know to use my local Ollama model?

The default model setting is `auto`, which checks for a reachable Ollama daemon first. If it finds one, it uses your local model as `ollama/<model>` before ever considering hosted backends. You can confirm which model ran by reading the verdict line printed after each run, which names the exact backend.

### Which Ollama model should I use for browser automation?

For simple one- or two-step objectives, a small 8B model is fine. For real multi-step flows like logins, form fills, and checkouts, use a Qwen3 or Llama 3.3 70B-class model, because small models lose track of state across steps and can return confident but wrong verdicts. Match model size to how long and stateful the objective is.

### Can I run Ollama on a different machine than Chrome?

Yes. Set `OLLAMA_BASE_URL` to point BrowserBash at a remote Ollama daemon, for example a GPU workstation on your LAN, while Chrome keeps running locally under the default provider. The model must be pulled on that remote host, and the remote daemon must be bound to a reachable network interface. Nothing leaves your own network, so the privacy and zero-cost guarantees still hold.

---

Ready to run browser automation that costs nothing and keeps your data on your machine? Install it and point it at your first flow:

```bash
npm install -g browserbash-cli
```

An account is optional — you can do everything in this tutorial without one. If you want the cloud dashboard later, [sign up here](https://browserbash.com/sign-up).
