---
title: Use any model via OpenRouter in BrowserBash
description: "An openrouter browser automation tutorial: set OPENROUTER_API_KEY, pin openrouter/<vendor>/<model>, run free hosted models, and keep cost under control."
date: 2026-02-13
category: tutorial
---

By the end of this tutorial you will have a real Chrome window opening a page, reading it, and returning a verdict — driven in plain English by whatever model you choose from OpenRouter's catalog. This is openrouter browser automation done the practical way: you write an objective, BrowserBash hands it to a model behind one `OPENROUTER_API_KEY`, and that model drives the page step by step until it reports back pass or fail with structured values. One key unlocks Llama, Qwen, DeepSeek, Gemini, Mistral, and dozens more — including a handful of genuinely free hosted models — and you switch between them by changing a single string.

I am going to pair-program this with you as if we were sitting at the same desk. I will assume you have automated a browser before and are tired of rewriting selectors every sprint. We will start on the free local path so you can feel the shape of a run with zero spend, then point the brain at OpenRouter so you can reach for a bigger model exactly when a hard, multi-step flow needs it. Every command below is real and runnable, and I will tell you the verdict you should expect each time.

## What you'll need

Before the first run, get these in place. None of them require an account with BrowserBash itself — running is free and local by default.

- **Node.js >= 18.** Check with `node -v`. BrowserBash is an npm CLI, so this is non-negotiable.
- **Google Chrome** installed. The default `local` provider drives your real Chrome on your machine.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

- **An OpenRouter API key** for the OpenRouter parts of this lesson. Create one at openrouter.ai, then export it as `OPENROUTER_API_KEY`. For the free-model section you still need a key (it identifies your account), but the models tagged `:free` cost nothing per token.
- **Optional: Ollama** if you want to follow the warm-up step on the zero-spend local path first. That is the BrowserBash default and a good way to confirm your browser plumbing works before any token leaves your machine.

Confirm the install landed:

```bash
browserbash --version
```

You should see `1.3.1`. If the command is not found, your global npm bin directory is not on `PATH` — fix that before continuing.

## Step 1 — Warm up on the free local path

Before we touch OpenRouter, let us prove the browser side works. BrowserBash is Ollama-first: the default model is `auto`, and with a local Ollama running it resolves to `ollama/<model>` with no keys and no network egress. This is the cleanest way to confirm Chrome launches and the agent loop runs.

```bash
browserbash run "Go to example.com and tell me the page heading"
```

Expected output: a real Chrome window opens, navigates to example.com, and the run ends with a **passed** verdict. The summary will mention the heading text — "Example Domain" — and you will see a short list of steps (navigate, read, done). If you do not have Ollama installed, this command will error with guidance pointing you to set up a local model or supply a hosted key. That error is your cue to move to Step 2, where OpenRouter takes over the thinking.

A quick honesty note while we are here: very small local models (8B and under) are flaky on long multi-step objectives — they lose the plot halfway through a checkout flow. The sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. That second option is exactly what OpenRouter gives you without you hosting anything.

## Step 2 — Get an OpenRouter key and export it

Head to openrouter.ai, sign in, and create an API key. It looks like `sk-or-v1-...`. BrowserBash reads it from the `OPENROUTER_API_KEY` environment variable, so export it in the shell you will run from:

```bash
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"
```

That is the entire setup. There is no separate config file, no `browserbash login` for models, and nothing to paste into a dashboard. The key lives in your environment, BrowserBash picks it up when you pin an `openrouter/...` model, and that is it.

### Verify the variable is set

```bash
echo "OPENROUTER_API_KEY is ${OPENROUTER_API_KEY:+set}"
```

Expected output: `OPENROUTER_API_KEY is set`. If it prints `OPENROUTER_API_KEY is` with nothing after, the export did not take — re-run it in the same shell. Environment variables do not survive a new terminal tab unless you add the export to your shell profile, so if you open a fresh window, export it again.

## Step 3 — Run your first OpenRouter model

Now point the brain at OpenRouter. The model string follows the pattern `openrouter/<vendor>/<model>` — the same identifier you would see in OpenRouter's own model list, prefixed with `openrouter/` so BrowserBash knows which backend to route through. Let us pin Llama 3.3 70B Instruct, a solid all-rounder for browser flows:

```bash
browserbash run "Go to news.ycombinator.com and return the title of the top story" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

Expected output: Chrome opens Hacker News, the agent reads the front page, and the run ends **passed**. The summary names the current top story, and the structured final state carries the extracted title as a value you could pipe somewhere. Because you pinned the model explicitly, BrowserBash skips its `auto` resolution and goes straight to OpenRouter using your key.

### Anatomy of the model string

The three parts of `openrouter/<vendor>/<model>` map cleanly:

| Part | Example | What it is |
| --- | --- | --- |
| `openrouter/` | `openrouter/` | The backend prefix that tells BrowserBash to route via OpenRouter with `OPENROUTER_API_KEY` |
| `<vendor>` | `meta-llama`, `qwen`, `deepseek`, `google` | The model publisher's namespace on OpenRouter |
| `<model>` | `llama-3.3-70b-instruct`, `qwen-2.5-72b-instruct` | The specific model slug |

Want a different model? Change the last two segments. Want DeepSeek? `openrouter/deepseek/deepseek-chat`. Want Qwen? `openrouter/qwen/qwen-2.5-72b-instruct`. The pattern never changes, and one key covers all of them — that is the whole point of routing through OpenRouter.

One detail worth internalizing now, because it saves confusion later: the `--model` flag controls *which model thinks*, not *who interprets the English* and not *where the browser runs*. Those are separate concerns in BrowserBash. The engine (`stagehand` by default, or `builtin`) is the layer that turns your objective into act, extract, and observe primitives; the provider (`local` by default) is where Chrome actually opens. Your OpenRouter model slots in as the brain underneath all of that. So `--model openrouter/...` composes cleanly with `--engine` and `--provider` — you are swapping one piece, not reconfiguring the whole stack.

## Step 4 — Use a free hosted model to control cost

OpenRouter exposes a set of models tagged `:free` that cost nothing per token. They are rate-limited and sometimes slower, but for smoke checks, demos, and CI jobs that run constantly, "free" is a feature. You still pass your key (it identifies your account), but the bill stays at zero.

```bash
browserbash run "Open https://browserbash.com and confirm the page loads and shows a headline" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct:free
```

Expected output: a **passed** verdict with a one-line summary confirming the headline rendered. If the free tier is busy you may see a slower start or an occasional rate-limit retry — that is the trade-off for $0. For anything mission-critical or deeply multi-step, switch back to the paid slug (drop the `:free` suffix) where throughput and reliability are higher.

### How the model paths compare on cost

| Path | Model string | Cost | Best for |
| --- | --- | --- | --- |
| Local | `auto` (resolves to `ollama/<model>`) | $0, nothing leaves your machine | Privacy, offline dev, unlimited iteration |
| OpenRouter free | `openrouter/<vendor>/<model>:free` | $0 per token, rate-limited | Smoke tests, demos, frequent CI |
| OpenRouter paid | `openrouter/<vendor>/<model>` | Pay-per-token via OpenRouter | Hard flows, higher throughput, reliability |

A practical rule: prototype on local or `:free`, then promote the exact same objective to a paid slug only for the flows that genuinely need the extra capability. Nothing else in your command changes — just the model string.

This three-way split is why OpenRouter pairs so well with BrowserBash for a real team. The folks doing exploratory work iterate all day on a local `auto` model and spend nothing. The CI pipeline runs its smoke pack on a `:free` slug and still spends nothing. Then the one nightly regression suite that walks a genuinely hairy multi-step checkout — the flow where a weaker model would wander — gets pointed at a paid 70B-class model, and only that suite incurs a bill. You are not choosing a single model for the whole project; you are matching model spend to the difficulty of each flow, and the only thing that varies between those three setups is the string after `--model`.

## Step 5 — Record the run and watch it back

When you are paying per token, you want to see what the model actually did. Add `--record` to capture a screenshot plus a `.webm` session video via the bundled ffmpeg:

```bash
browserbash run "Go to the BrowserBash pricing page and tell me whether a free tier exists" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct \
  --record
```

Expected output: the same **passed** verdict, plus a recorded video and screenshot saved under the run directory. The run is also kept on-disk at `~/.browserbash/runs` (secrets masked, capped at the most recent 200), so you can revisit it later. If you are on the `builtin` engine, `--record` additionally writes a Playwright trace you can open in the trace viewer — handy when a model takes a surprising path and you want to step through it frame by frame.

### Inspect runs in the local dashboard

Everything stays on your machine. Spin up the free local dashboard to browse runs visually:

```bash
browserbash dashboard
```

This serves a fully local UI at `localhost:4477`. No account, no upload, nothing leaving your box. If you ever want to wipe the local store and start clean, `browserbash dashboard --clear` does it.

## Step 6 — Wire OpenRouter into CI with agent mode

For pipelines and AI coding agents, prose output is the enemy. The `--agent` flag emits NDJSON — one JSON object per line — so a script can parse progress and the final verdict without regex gymnastics. This pairs beautifully with a `:free` model for cost-controlled CI.

```bash
browserbash run "Go to example.com and verify the heading says Example Domain" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct:free \
  --headless \
  --agent
```

Expected output: a stream of progress lines like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"opened example.com"}`, followed by a terminal line such as `{"type":"run_end","status":"passed","summary":"Heading matched","final_state":{...},"duration_ms":8421}`. The `--headless` flag keeps Chrome invisible, which is exactly what you want on a CI runner with no display.

### Exit codes you can branch on

The process exit code mirrors the run result, so your pipeline can fail the build automatically:

| Exit code | Meaning |
| --- | --- |
| `0` | passed |
| `1` | failed (the objective's assertion did not hold) |
| `2` | error (something broke before a verdict) |
| `3` | timeout |

A minimal CI gate is just `browserbash run "..." --agent --headless --model openrouter/.../...:free && echo "smoke ok"`. If the smoke check fails, the `&&` short-circuits and your job goes red.

## Step 7 — Commit a markdown test that runs on OpenRouter

One-shot `run` is great for exploration, but for anything you want in version control, write a markdown test. Each list item is a step, `{{variables}}` give you templating, and any variable you mark as secret is masked as `*****` in every log line. Create `pricing_test.md`:

```markdown
# Pricing page check

- Go to {{url}}
- Confirm the page shows pricing information
- Report whether a free tier is mentioned
```

Run it, supplying the model the same way:

```bash
browserbash testmd run ./pricing_test.md \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

Expected output: each step executes in order, the run ends **passed**, and BrowserBash writes a human-readable `Result.md` next to the test summarizing what happened. Commit both the test and the result, and you have a repeatable, model-agnostic check — swap the `--model` string later and the test still runs unchanged. For composing larger suites, `@import` lets one test pull in shared steps from another.

## Troubleshooting

Real failure modes I have hit, and how to clear them fast.

- **"No API key" or the run falls back to local.** You pinned an `openrouter/...` model but `OPENROUTER_API_KEY` is not exported in the current shell. Re-run the export and confirm with the `echo` check from Step 2. Remember each new terminal tab starts fresh unless the export is in your shell profile.
- **Free model is slow or hits a rate limit.** The `:free` tier is shared and throttled. For a one-off, just retry. For something you run constantly, either drop the `:free` suffix to use the paid slug or move that flow to a local `ollama/<model>` so it is unmetered.
- **The model gets lost on a long flow.** This is the small-model flakiness caveat in practice. A weaker or heavily-quantized model can wander on a multi-step objective. Jump to a stronger slug — a Llama 3.3 70B-class or Qwen 72B model on OpenRouter — and the same objective usually completes cleanly. Capability, not prompt wording, is the lever here.
- **`--record` produces no video.** Recording uses the bundled ffmpeg. If your environment stripped it or PATH is unusual, the screenshot may save while the `.webm` does not. Re-run without `--record` to confirm the flow itself passes, then sort the ffmpeg path separately.
- **Run times out before finishing.** Heavy pages plus a slower free model can exceed the default window. Raise it with `--timeout <seconds>`, for example `--timeout 180`, and rerun. A timeout exits with code `3`, distinct from a real failure, so your CI can tell them apart.

## When to use this

Reach for OpenRouter when you want one key across many models and the freedom to right-size the brain per flow — free or local for cheap smoke checks, a bigger paid model only where a flow earns it. If your priority is privacy or unlimited offline iteration, stay on the local path; the [Ollama local models tutorial](https://browserbash.com/tutorials) walks that end to end. If a flow needs maximum reliability and you already have an Anthropic key, the Claude path is worth a look.

Next steps and sibling lessons:

- Browse the full [BrowserBash tutorials](https://browserbash.com/tutorials) for provider and engine deep-dives.
- Work through the fundamentals on the [BrowserBash learn](https://browserbash.com/learn) hub.
- Compare every flag, including `--model`, in the reference on the [BrowserBash blog](https://browserbash.com/blog).
- Skim the [features overview](https://browserbash.com/features) to see what the agent can do once your model is wired up.

## FAQ

### How do I use OpenRouter models in BrowserBash?

Export your key as `OPENROUTER_API_KEY`, then pass `--model openrouter/<vendor>/<model>` on any run or testmd command — for example `openrouter/meta-llama/llama-3.3-70b-instruct`. BrowserBash routes the objective through OpenRouter using that key. You can switch models any time by changing the string, and nothing else in the command needs to change.

### Are there free models on OpenRouter I can use for browser automation?

Yes. OpenRouter tags certain models with a `:free` suffix that cost nothing per token, such as the free variant of Llama 3.3 70B Instruct. You still supply your key so the account is identified, but the per-token bill stays at zero. They are rate-limited and best suited to smoke tests, demos, and frequent CI rather than mission-critical multi-step flows.

### How do I keep OpenRouter costs under control?

Prototype on the free local path or a free OpenRouter model, and promote only the flows that truly need it to a paid slug by dropping the free suffix. For unlimited, unmetered iteration use a local Ollama model, which keeps everything on your machine at zero cost. Right-sizing the model per flow is the main lever, since the command stays identical otherwise.

### Which OpenRouter model is best for browser flows?

For most multi-step objectives a mid-to-large instruct model works well, such as a Llama 3.3 70B-class or a Qwen 72B model. Very small models tend to wander on long flows, so when a run gets lost, moving to a stronger slug usually fixes it without changing your objective. Start cheap, then scale the model up only where reliability actually matters.

## Ready to try it

Install the CLI and pin your first OpenRouter model in under a minute:

```bash
npm install -g browserbash-cli
```

An account is optional — running is free and local by default. If you want the cloud dashboard later, [sign up here](https://browserbash.com/sign-up) and link it with `browserbash connect`.
