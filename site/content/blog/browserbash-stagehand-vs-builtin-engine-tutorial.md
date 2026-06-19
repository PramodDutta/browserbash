---
title: Stagehand vs builtin engine in BrowserBash: when to use each
description: "Hands-on guide to the BrowserBash engine choice: Stagehand vs builtin, the --engine flag, why grids auto-use builtin, and traces on builtin runs."
date: 2026-01-20
category: tutorial
---

By the end of this tutorial you'll know exactly which BrowserBash engine to reach for on any given run, how to switch between them with the `--engine` flag, and why a grid provider like LambdaTest or BrowserStack quietly forces the builtin engine no matter what you ask for. The word "engine" gets thrown around a lot in browser automation, so let's pin it down: in BrowserBash, the **engine** is the component that reads your plain-English objective and decides what to click, type, and verify in a real Chrome browser. There are two of them — `stagehand` (the default) and `builtin` — and they behave differently enough that picking the right one can be the difference between a clean pass and a flaky, half-finished run. We'll run both side by side against the same objective, read the verdicts, and pull a Playwright trace out of a builtin run so you can see exactly what the agent did.

[BrowserBash](https://browserbash.com) is a free, open-source CLI from The Testing Academy. You write an objective in English, an AI agent drives a real browser step by step (no selectors, no page objects), and you get back a pass/fail verdict plus any structured values it extracted. Everything below is real and runnable.

## What you'll need

This is a hands-on lesson, so set yourself up before we start. The free local path needs almost nothing.

- **Node.js >= 18** — check with `node -v`.
- **Google Chrome** installed — the default `local` provider drives your real Chrome.
- **BrowserBash installed globally:**

```bash
npm install -g browserbash-cli
```

- **A model backend.** The default `--model auto` resolves in order: a local **Ollama** server first (free, nothing leaves your machine), then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. For this lesson the free Ollama path is fine for most steps, but engine differences show up most clearly on harder flows — so I'll flag where a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a capable hosted model earns its keep.

That's it. No account, no signup, no API key for the local path. If you want a model with zero keys, pull one with Ollama first:

```bash
ollama pull qwen3
```

Confirm the install resolved:

```bash
browserbash --version
```

You should see `1.3.1` or later printed back.

## Two engines, one sentence each

Before the first command, here's the mental model. Both engines read the *same* English objective and drive the *same* real browser. What differs is **how they interpret your words into browser actions**.

| Engine | Who builds it | License | How it interprets English | Auto-used when |
| --- | --- | --- | --- | --- |
| `stagehand` | Browserbase | MIT | High-level primitives — `act`, `extract`, `observe`, `agent` — with self-healing built in | Default for `local`, `cdp`, and `browserbase` providers |
| `builtin` | In-repo (BrowserBash) | Apache-2.0 (ships with the CLI) | An Anthropic tool-use loop driving Playwright directly | Forced automatically for `lambdatest` and `browserstack` |

Read that table twice, because it explains nearly everything that follows. Stagehand is a layer that specializes in turning intent into resilient browser actions and re-finding elements when a page shifts. The builtin engine is a tighter loop: the model is handed Playwright as a set of tools and reasons step by step, and — crucially for debugging — it can emit a **Playwright trace** when you record a run.

## Step 1 — Run the default engine (Stagehand)

Let's establish a baseline. Run any objective without an `--engine` flag and you get Stagehand, because the default `local` provider uses it.

```bash
browserbash run "Go to https://news.ycombinator.com and tell me the title of the top story"
```

What you'll see: the agent launches your Chrome, navigates, reads the page, and prints a verdict. A passing run ends with something like a `PASSED` status and a short summary — for this objective, the extracted title of the current top Hacker News story. The point isn't the story; it's that you ran the **default BrowserBash engine** without naming it. Stagehand did the interpreting.

If you want to watch it happen instead of running headless, that's the default — the browser window is visible unless you pass `--headless`.

## Step 2 — Switch engines explicitly with --engine

Now run the same objective on the builtin engine. One flag flips it:

```bash
browserbash run "Go to https://news.ycombinator.com and tell me the title of the top story" --engine builtin
```

The verdict should match — same top story, same `PASSED`. What changed is invisible on this simple task: the builtin engine reasoned through a tool-use loop (navigate, read, extract) rather than calling Stagehand's `act`/`extract` primitives. On a one-step read like this, you won't feel the difference. You will on Step 4.

The `--engine` flag accepts exactly two values:

| Flag | Engine selected | Notes |
| --- | --- | --- |
| `--engine stagehand` | Stagehand | Same as omitting the flag on local/cdp/browserbase |
| `--engine builtin` | Builtin tool-use loop | Required for trace output; auto-selected on grids |

There is no third value. If you mistype it, the run errors out rather than silently falling back — which is the behavior you want in CI.

## Step 3 — Why grids auto-use the builtin engine

Here's the gotcha that trips people up. Run against a Selenium grid provider and your `--engine` choice is overridden:

```bash
browserbash run "Open the login page and confirm the username field is present" \
  --provider lambdatest
```

Even though you didn't pass `--engine builtin`, that's what runs. The same is true for BrowserStack:

```bash
browserbash run "Open the login page and confirm the username field is present" \
  --provider browserstack
```

Why? Grid providers like LambdaTest and BrowserStack expose remote browsers over a protocol that the builtin engine's Playwright-driven loop talks to directly and reliably. So BrowserBash makes the safe choice for you: **`lambdatest` and `browserstack` always use the builtin engine.** If you explicitly pass `--engine stagehand` alongside one of those providers, don't expect it to take effect — the grid wins. This isn't a limitation to fight; it's the supported path for cross-browser grid runs. Treat the provider as the thing that decides the engine here.

These two providers need credentials in your environment before the run will start:

| Provider | Required environment variables |
| --- | --- |
| `lambdatest` | `LT_USERNAME`, `LT_ACCESS_KEY` |
| `browserstack` | `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY` |

Set those, and the same English objective you wrote for local runs executes on a remote grid browser — with the builtin engine doing the interpreting whether you asked for it or not.

## Step 4 — Run a real multi-step flow on each engine

Single reads don't separate the engines. Multi-step flows do. Let's give both engines something with state — navigate, search, read a result back — and compare.

### 4a — Stagehand on the flow

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first product to the cart, and confirm the cart badge shows 1"
```

Stagehand's self-healing earns its keep here. When the page re-renders after login, Stagehand re-observes the DOM and re-finds the cart button rather than clutching a stale reference. A clean run ends `PASSED` with a summary noting the cart badge read `1`.

### 4b — Builtin on the same flow

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first product to the cart, and confirm the cart badge shows 1" \
  --engine builtin
```

Same objective, builtin engine. The tool-use loop will navigate, fill the login fields, click add-to-cart, and read the badge — narrating each tool call as a step. You'll typically see a `PASSED` here too. The reason to prefer builtin for a flow like this isn't the verdict — it's what you can extract *afterward*, which is the next step.

A quick honesty note that matters for both engines: **very small local models (8B or under) get flaky on long multi-step objectives.** They lose the thread halfway through a five-step flow regardless of engine. If a run like 4a or 4b stalls or wanders, that's almost always the model, not the engine. Move to a mid-size local model (Qwen3 / Llama 3.3 70B-class) or pin a hosted model:

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first product to the cart, and confirm the cart badge shows 1" \
  --engine builtin \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

(That last command needs `OPENROUTER_API_KEY` set. The point stands for any capable backend.)

## Step 5 — Get a Playwright trace out of a builtin run

This is the builtin engine's superpower for debugging. Add `--record` and the builtin engine writes a **Playwright trace** alongside the usual screenshot and `.webm` session video.

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first product to the cart, and confirm the cart badge shows 1" \
  --engine builtin \
  --record
```

What `--record` produces:

- A **screenshot** of the final state.
- A **`.webm` session video** captured via the bundled ffmpeg.
- A **Playwright trace** — but *only because this is the builtin engine.* The trace is the builtin engine's gift; it's the artifact you open in the Playwright trace viewer to scrub through every action, DOM snapshot, and network call the agent made.

Open the trace the way you'd open any Playwright trace, pointing the viewer at the trace file the run wrote:

```bash
npx playwright show-trace <path-to-trace-file-from-the-run-output>
```

The run prints where it saved artifacts, and every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at the most recent 200). When a builtin flow fails on step three of five, this trace is how you find out whether it was the login, the add-to-cart click, or the badge read — without re-running blind.

Here's the rule worth tattooing on your CI config: **if you want a Playwright trace, use `--engine builtin`.** Stagehand runs still give you the screenshot and `.webm` video with `--record`; the Playwright trace specifically is a builtin-engine output.

### The flags that matter for this lesson

| Flag | What it does | Engine note |
| --- | --- | --- |
| `--engine stagehand\|builtin` | Picks the interpreter | Ignored on lambdatest/browserstack (always builtin) |
| `--provider` | Picks where the browser runs | `lambdatest`/`browserstack` force builtin |
| `--model` | Pins the LLM backend (e.g. `ollama/qwen3`) | Same syntax on both engines |
| `--record` | Screenshot + `.webm` video; builtin **also** writes a Playwright trace | Trace is builtin-only |
| `--headless` | Hides the browser window | Both engines |
| `--timeout <seconds>` | Caps run duration | Both engines |
| `--agent` | NDJSON output, one JSON object per line | Both engines |

## Step 6 — Read both engines in CI with --agent

In a pipeline you don't want to parse prose. Add `--agent` and either engine emits NDJSON — one JSON object per line — which is identical in shape regardless of engine, so your CI step doesn't care which interpreter ran.

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, and confirm the inventory page loads" \
  --engine builtin \
  --agent
```

You'll get progress lines like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}` followed by a terminal line such as `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. Exit codes make the gate trivial: `0` passed, `1` failed, `2` error, `3` timeout. Because the NDJSON contract is engine-agnostic, you can switch an objective from Stagehand to builtin (or let a grid provider force builtin) without touching the script that reads its output. That's the whole reason `--agent` exists — CI and AI coding agents consume it, no prose parsing required.

## Troubleshooting

Real failure modes you'll hit, and how to clear them.

- **A long flow wanders or stalls.** Almost always the model, not the engine. Tiny local models (<=8B) lose track on multi-step objectives on either engine. Switch to a mid-size local model (`--model ollama/qwen3` with a 70B-class pull) or pin a capable hosted model. Re-run the *same* command with the better model before blaming the engine.
- **`--record` produced no `.webm` video.** The video uses bundled ffmpeg; if your environment strips it or PATH is mangled, the recording can fail. The screenshot (and, on builtin, the Playwright trace) should still be written. Re-run and check the artifact path the run prints — and on builtin, the trace is the more useful artifact anyway.
- **You passed `--engine stagehand` but the run used builtin.** You're on `--provider lambdatest` or `--provider browserstack`. Grids force the builtin engine by design. If you genuinely need Stagehand, run against `local`, `cdp`, or `browserbase` instead.
- **Grid run errors before it starts.** Missing credentials. `lambdatest` needs `LT_USERNAME` + `LT_ACCESS_KEY`; `browserstack` needs `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`. Export them in the shell (or your CI secrets) and retry.
- **The run dies at exactly your timeout.** Exit code `3` means timeout, not failure. A heavy flow on a slow local model can legitimately need more headroom — raise it with `--timeout 180` and re-run before assuming the agent is stuck.

## When to use this

A short decision rule you can keep:

- **Reach for Stagehand (default)** on local and cloud-headless flows where self-healing on shifting pages matters — dynamic SPAs, flows that re-render after every action.
- **Reach for builtin** when you want a Playwright trace to debug a failure, or when you're on a LambdaTest / BrowserStack grid (where it's chosen for you anyway).

Keep going from here:

- [Run AI browser tests on Browserbase with one flag](https://browserbash.com/blog) — the cloud-headless provider path.
- The [BrowserBash tutorials hub](https://browserbash.com/tutorials) for end-to-end lessons, and [Learn](https://browserbash.com/learn) for the concepts behind agentic browser automation.
- The full [features](https://browserbash.com/features) list if you want to see every provider, engine, and flag in one place.

## FAQ

### What is the difference between the Stagehand and builtin engine in BrowserBash?

The Stagehand engine, built by Browserbase under an MIT license, interprets your English using high-level `act`, `extract`, `observe`, and `agent` primitives with self-healing, and it is the default. The builtin engine is an in-repo Anthropic tool-use loop that drives Playwright directly. Both read the same objective and drive the same real browser; they differ in how they turn your words into actions and in what artifacts they can produce.

### How do I switch the BrowserBash engine?

Add the `--engine` flag to any `run` command, with either `stagehand` or `builtin` as the value, for example `browserbash run "..." --engine builtin`. Omitting the flag gives you Stagehand on local, cdp, and browserbase providers. There is no third value, and a typo will error the run rather than silently falling back.

### Why does BrowserBash use the builtin engine on LambdaTest and BrowserStack?

Grid providers expose remote browsers over a protocol that the builtin engine's Playwright-driven loop talks to directly and reliably, so BrowserBash forces the builtin engine on `lambdatest` and `browserstack` runs. This happens automatically even if you pass `--engine stagehand`, because the provider decides the engine on grids. It is the supported path for cross-browser grid runs, not a limitation to work around.

### How do I get a Playwright trace from BrowserBash?

Run with the builtin engine and add `--record`, for example `browserbash run "..." --engine builtin --record`. On the builtin engine that produces a Playwright trace in addition to the screenshot and `.webm` session video, and you open it with the Playwright trace viewer. Stagehand runs still record a screenshot and video, but the Playwright trace specifically is a builtin-engine output.

Pick an engine, run a flow, read the verdict. Install it and try both on your own app — no account required:

```bash
npm install -g browserbash-cli
```

Want the optional cloud dashboard later? [Sign up here](https://browserbash.com/sign-up) — it stays optional, and nothing leaves your machine unless you explicitly `--upload` a run.
