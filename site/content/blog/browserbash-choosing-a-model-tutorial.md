---
title: Choosing the right model for BrowserBash
description: "Pick the best model for browser automation in BrowserBash: how auto resolution works, local vs hosted trade-offs, and matching model size to task difficulty."
date: 2026-02-20
category: tutorial
---

The single biggest factor in whether a BrowserBash run passes cleanly or quietly flakes is the model sitting behind it. Choose the **best model for browser automation** that actually fits your task, and a five-step checkout verifies on the first try, every time. Choose one that is too small for the job, and the agent loses the thread halfway through, clicks the wrong control, and hands you a confident-but-wrong verdict that slips straight past your CI. By the end of this tutorial you will know exactly how BrowserBash's `auto` model resolution works, how to read which backend a run actually used, when a free local model is more than enough, and when you genuinely need to reach for a hosted model. We run real commands the whole way, starting from the zero-cost local path and working up to the hard flows.

This is a hands-on lesson, not a spec dump. We are going to do this the way I would if we were pair-programming at the same desk. You will run a simple objective and watch `auto` resolve to a local Ollama model. Then you will deliberately push a small model past its limits so you can recognize that exact failure mode when it bites you in production. After that you will pin a capable model for a genuinely hard multi-step flow and feel the difference. Let us get into it.

## What you'll need

- **Node.js 18 or newer.** Check with `node --version`. BrowserBash requires `>= 18`.
- **Google Chrome** installed locally. That is what the default `local` provider drives, a real browser, not a simulation.
- **BrowserBash installed globally.** One command:

```bash
npm install -g browserbash-cli
```

- **Ollama (optional but recommended for the free path).** If you have [Ollama](https://ollama.com) running with at least one model pulled, BrowserBash will find it with no keys at all. We use this for most of the lesson.
- **An optional hosted key for the hard-flow section.** Either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set in your shell. You only need this for Step 5, where we compare a hosted model against a local one. Everything before that is $0.

Confirm the install before we start:

```bash
browserbash --version
```

You should see `1.3.1` (or newer). If the command is not found, your global npm bin directory may not be on your `PATH`. Fix that, then carry on.

## Step 1 — Understand the `auto` resolution order

Before running anything, get the mental model straight, because half of "which model should I use" is really "which model did BrowserBash already pick for me."

BrowserBash defaults to `--model auto`. When the model is `auto`, it resolves in a strict, predictable order and stops at the first match:

1. **Local Ollama** is detected on your machine. BrowserBash uses `ollama/<model>`. Free, no keys, nothing leaves your laptop.
2. Otherwise, if **`ANTHROPIC_API_KEY`** is set, it uses `claude-opus-4-8`.
3. Otherwise, if **`OPENAI_API_KEY`** is set, it uses `openai/gpt-4.1`.
4. Otherwise, it **errors** with guidance telling you to install Ollama or set a key.

This order is deliberately Ollama-first. The project's whole posture is local-by-default: if you have a model running locally, BrowserBash will not silently start spending your hosted credits. That is the behavior you want. It also means the answer to "what's the best model for browser automation for me right now" often starts with "whatever `auto` resolves to" and only changes when a task proves too hard.

Here is the resolution order as a table you can keep next to you:

| Priority | Condition | Resolved backend | Cost |
| --- | --- | --- | --- |
| 1 | Local Ollama detected | `ollama/<model>` | $0, fully local |
| 2 | `ANTHROPIC_API_KEY` set | `claude-opus-4-8` | Hosted, per-token |
| 3 | `OPENAI_API_KEY` set | `openai/gpt-4.1` | Hosted, per-token |
| 4 | None of the above | Error with setup guidance | n/a |

Keep this in mind for the rest of the lesson: every time you do not pass `--model`, this ladder is what runs.

## Step 2 — Run a simple objective and see what `auto` chose

Let us run the easiest possible task and confirm the resolution. A single-step "open a page and read one fact" objective is the perfect smoke test, because almost any model can do it. That makes it a clean way to verify your setup rather than the model's intelligence.

```bash
browserbash run "Go to example.com and confirm the page heading says 'Example Domain'"
```

What you should see: BrowserBash launches a real Chrome window, navigates to the page, reads the heading, and prints a short run summary ending in a verdict. With `auto` resolving to a local model, the verdict line reads something like `passed` with a remark confirming the heading text matched. The summary also tells you which model interpreted the objective, so you can confirm `auto` landed where you expected.

If you have Ollama running, this whole run cost you nothing and sent nothing off your machine. That is the local path doing exactly what it should on an easy task.

### Pin the model explicitly so it is reproducible

`auto` is convenient, but for anything you commit or run in CI you want determinism. Pin the exact backend with `--model`. To force a specific local Ollama model:

```bash
browserbash run "Go to example.com and confirm the page heading says 'Example Domain'" \
  --model ollama/qwen3
```

Now the run uses `ollama/qwen3` regardless of what else is installed or which keys are set. You can also pin via environment variables instead of the flag, which is handy in CI:

```bash
export OLLAMA_MODEL=qwen3
export OLLAMA_BASE_URL=http://localhost:11434
browserbash run "Go to example.com and confirm the page heading says 'Example Domain'"
```

Either way, the run summary should name `ollama/qwen3` as the backend. Reproducibility beats convenience the moment more than one person, or one machine, runs the same objective.

## Step 3 — Watch a small model fail on a long flow

Here is the part most "which model" guides skip, and it is the most useful thing in this tutorial. Very small local models, the 8B-and-under tier, are genuinely flaky on long, multi-step objectives. They are fine for a one-shot "read this value" task. They start to wobble once the agent has to hold a plan across many steps, remember what it already did, and recover from an unexpected page.

Let us provoke that on purpose so you can recognize the signature. Pull a small model and point a hard objective at it:

```bash
ollama pull llama3.2:3b
browserbash run "Go to the demo store, search for 'wireless headphones', open the first result, add it to the cart, go to the cart, apply the coupon code SAVE10, and confirm the discounted total is shown" \
  --model ollama/llama3.2:3b \
  --record
```

We added `--record` here on purpose. It captures a screenshot plus a `.webm` session video (via the bundled ffmpeg), so you can watch where the model went off the rails instead of guessing from a one-line summary. With the builtin engine, `--record` also writes a Playwright trace.

What failure looks like: the run often gets through the first two or three steps, then stalls or drifts. Classic tells include the agent re-searching after it already had results, "adding to cart" on the wrong element, claiming the coupon was applied when no discount appears, or running out the clock and timing out. The verdict comes back `failed` (or `timeout`), and when you scrub the recorded video you can see the exact step where the plan fell apart. That is not a bug in BrowserBash; it is a small model exceeding its working capacity on a long chain of decisions.

The fix is almost always "use a bigger brain for this task," not "rewrite the objective ten times." Which brings us to the sweet spot.

## Step 4 — Move to the local sweet spot: a mid-size model

The honest sweet spot for hard flows that you still want to run locally and for free is a **mid-size model**, the Qwen3 or Llama 3.3 70B class. These are large enough to hold a multi-step plan and recover from surprises, while still running on your own hardware with no per-token bill. If your machine can host one of these, it is frequently the best model for browser automation you can run, full stop, because it combines capability with $0 cost and full privacy.

Re-run the exact same hard objective, just swap the model:

```bash
browserbash run "Go to the demo store, search for 'wireless headphones', open the first result, add it to the cart, go to the cart, apply the coupon code SAVE10, and confirm the discounted total is shown" \
  --model ollama/qwen3 \
  --record
```

What you should see now: the agent works the steps in order, search then open then add then cart then coupon then verify, and returns a `passed` verdict with a remark describing the discounted total it observed. The structured final state carries the extracted values, the discounted total being the obvious one to assert on downstream. Same objective, same provider, same machine. The only thing that changed was the size of the model interpreting the English, and that single change flipped the run from `failed` to `passed`.

This is the core lesson: **match model size to task difficulty.** Easy single-step checks run fine on small models. Long multi-step flows need a mid-size local model or a capable hosted one.

Here is the practical mapping I use day to day:

| Task difficulty | Example | Recommended model |
| --- | --- | --- |
| Trivial, single step | "Confirm the heading reads X" | Any local model, even small |
| Moderate, 2–4 steps | Login, then read a dashboard value | Mid-size local (Qwen3 / Llama 3.3 70B class) |
| Hard, 5+ steps with branching | Search → add to cart → coupon → checkout verify | Mid-size local, or hosted for max reliability |
| Brutal, fragile or unusual UI | Multi-page wizard, heavy dynamic content | Capable hosted model (`claude-opus-4-8`) |

## Step 5 — Pin a capable hosted model for the hardest flows

Sometimes local is not enough, or you simply want the most reliable run you can get and do not mind the per-token cost. For those cases, pin a hosted model. With `ANTHROPIC_API_KEY` set, you can name Anthropic's flagship directly:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
browserbash run "Go to the demo store, complete a full guest checkout for 'wireless headphones' with a test card, and confirm the order confirmation number is shown" \
  --model claude-opus-4-8 \
  --record
```

What you should see: the hosted model handles the longer, branchier flow with noticeably more composure, recovering from interstitials and unexpected modals that trip up smaller models. The verdict comes back `passed` with the order confirmation number captured in the structured final state.

If you prefer OpenAI or want to reach a much wider catalog, BrowserBash gives you several backends. Here are the ones that exist, and how each is selected:

| `--model` value | Backend | Key / env required |
| --- | --- | --- |
| `auto` (default) | Resolves per the Step 1 ladder | None up front |
| `ollama/<model>` | Local Ollama (e.g. `ollama/qwen3`) | None; `OLLAMA_BASE_URL` / `OLLAMA_MODEL` optional |
| `claude-opus-4-8` | Anthropic flagship | `ANTHROPIC_API_KEY` |
| `openai/gpt-4.1` | OpenAI via Stagehand | `OPENAI_API_KEY` |
| `google/gemini-2.5-flash` | Gemini via Stagehand | Stagehand-configured Google key |
| `openrouter/<vendor>/<model>` | OpenRouter catalog | `OPENROUTER_API_KEY` |

For example, to drive a hard flow through a 70B-class model hosted on OpenRouter, without any local GPU:

```bash
export OPENROUTER_API_KEY=sk-or-...
browserbash run "Log into the staging admin, open the Orders report, and confirm at least one order is listed for today" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

This is a nice middle ground: a capable mid-size model, hosted, no local hardware needed, and OpenRouter lets you swap the vendor string to try alternatives without changing anything else in your command.

### A note on engines vs. models

Keep two ideas separate. The **model** is the brain that interprets your English. The **engine** is the machinery that turns the model's decisions into browser actions. BrowserBash defaults to the `stagehand` engine and also ships a `builtin` engine (an in-repo Anthropic tool-use loop driving Playwright, used automatically for LambdaTest and BrowserStack). You switch engines with `--engine stagehand|builtin`, independently of `--model`. For "which model is best," focus on the model ladder above; the engine choice rarely changes the answer.

## Troubleshooting

**Small local model keeps failing a multi-step flow.** This is the most common one, and it is expected behavior, not a defect. Models in the 8B-and-under tier lose the plan on long objectives. Run the same objective with `--model ollama/qwen3` (or another mid-size model). If that passes, the model size was your problem. Use `--record` to watch exactly where the small model drifted.

**`auto` errors with "no model available."** That means none of the ladder rungs matched: Ollama is not running, and neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` is set. Start Ollama and pull a model, or export one of those keys. Then re-run; `auto` will resolve.

**`--record` produces a screenshot but no video.** The session video relies on the bundled ffmpeg. If the `.webm` is missing, ffmpeg failed to start in your environment. The run itself is unaffected, screenshots and the verdict still land, and on the builtin engine the Playwright trace is written regardless. Re-run without `--record` if you only need the verdict, or check that nothing in your environment is blocking the bundled binary.

**Hosted run errors about a missing key.** If you pinned `--model claude-opus-4-8` but did not export `ANTHROPIC_API_KEY` (or used `openai/gpt-4.1` without `OPENAI_API_KEY`, or an `openrouter/...` model without `OPENROUTER_API_KEY`), the run errors immediately. Set the matching key from the table in Step 5 and try again. Each model maps to exactly one key.

**Hard flows time out before finishing.** The default timeout can be too tight for long flows, especially on slower local models. Raise it with `--timeout`, which takes a value in seconds: `browserbash run "..." --timeout 180`. If a mid-size model still times out, the flow may be genuinely heavy; consider a hosted model or breaking the objective into smaller committed steps with markdown tests.

## When to use this

Reach for this workflow whenever a run is flaky and you suspect the model rather than the objective. The decision tree is short: start on `auto`, let it resolve locally for free, and only climb the ladder, mid-size local, then hosted, when a task proves too hard for what you have.

From here, a few natural next steps:

- New to the CLI entirely? Start with the [BrowserBash tutorials hub](https://browserbash.com/tutorials) and the broader [learn section](https://browserbash.com/learn).
- Want the deep dive on the free local path? Read the Ollama walkthrough on the [BrowserBash blog](https://browserbash.com/blog), then come back here to size the model to your task.
- Curious about every flag we touched? The full [features overview](https://browserbash.com/features) lists what the CLI can do, and the [GitHub repo](https://github.com/PramodDutta/browserbash) has the source.
- Wiring this into CI? Pair model pinning with `--agent` NDJSON output and exit codes so your pipeline reads results without parsing prose.

## FAQ

### What is the best model for browser automation in BrowserBash?

For most users the best starting point is whatever `auto` resolves to locally, since it is free and private. For long, multi-step flows the sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, and for the hardest or most fragile UIs a capable hosted model like claude-opus-4-8 is the most reliable. Match the model size to the task difficulty rather than always reaching for the biggest one.

### Do I need an API key to run BrowserBash?

No. If you have Ollama running with a model pulled, BrowserBash detects it automatically and runs entirely on your machine with no keys and no account. You only need an API key when you deliberately pin or fall through to a hosted model such as claude-opus-4-8, openai/gpt-4.1, or an OpenRouter model.

### Why does my small local model keep failing long flows?

Very small models, roughly 8B parameters and under, struggle to hold a multi-step plan in their working context, so they drift, repeat steps, or report success that did not happen. This is expected, not a bug in the tool. Switch to a mid-size local model or a hosted one for anything beyond a couple of steps, and use the record flag to see exactly where the small model went wrong.

### How do I know which model a run actually used?

Every run prints a summary that names the backend that interpreted the objective, so you can confirm whether auto landed on a local Ollama model or a hosted one. If you want certainty rather than relying on auto, pin the model explicitly with the model flag or the relevant environment variable. Pinning is the right call for anything you commit or run in CI.

## Get started

Install the CLI and let `auto` find your local model first, then climb the ladder only when a task earns it:

```bash
npm install -g browserbash-cli
```

No account is needed to run anything in this tutorial. If you later want the optional free cloud dashboard, you can [sign up](https://browserbash.com/sign-up) when you are ready. Now go run an objective, watch which model `auto` picks, and size up only when the flow demands it.
