---
title: Every BrowserBash CLI flag, explained with examples
description: "A reference tutorial to BrowserBash CLI flags across run, testmd, dashboard, and connect — every flag in a table with a runnable example each."
date: 2026-01-16
category: tutorial
---

If you have ever stared at a `--help` dump and wondered which flag actually matters for the run you are about to fire, this is the page to keep open in a second tab. This is a hands-on reference tutorial to **BrowserBash CLI flags** — every flag across `run`, `testmd`, `dashboard`, and `connect`, each one in a table and each one with a runnable command you can paste into your terminal right now. By the end you will know exactly what `--engine`, `--provider`, `--model`, `--headless`, `--timeout`, `--cdp-endpoint`, `--record`, `--dashboard`, `--upload`, and `--agent` do, when to reach for each, and how they combine.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and you get back a verdict plus structured extracted values. The flags below are the knobs that decide *who interprets your English*, *where the browser runs*, *which model thinks*, and *what artifacts you keep*. I will treat you like a teammate pairing on a real run, not a man page, so we will run things, read the verdict, and only then move the next dial.

## What you'll need

- **Node.js 18 or newer.** Check with `node -v`. BrowserBash will not start on older runtimes.
- **Google Chrome installed** for the default local provider. The agent drives your actual browser binary.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

- **A model.** The examples default to the free local path: install [Ollama](https://browserbash.com/learn) and pull a mid-size model. You do not need any API keys, no account, and nothing leaves your machine. Two of the later sections cover hosted models and paid providers, and those steps call out the exact keys when we get there.

Confirm the install landed:

```bash
browserbash --version
```

You should see `1.3.1`. Now let's walk the commands.

## Step 1 — The mental model: four axes, not forty flags

Before the tables, hold this map in your head. Every BrowserBash run is decided by four independent choices, and most flags just set one of them:

| Axis | Question it answers | Flag |
| --- | --- | --- |
| **Engine** | Who interprets the English into browser actions? | `--engine` |
| **Provider** | Where does the browser actually run? | `--provider` |
| **Model** | Which LLM does the thinking? | `--model` |
| **Artifacts & output** | What gets recorded, opened, uploaded, or streamed? | `--record`, `--dashboard`, `--upload`, `--agent` |

The two engines are `stagehand` (the default — MIT-licensed, by Browserbase, with self-healing `act`/`extract`/`observe`/`agent` primitives) and `builtin` (an in-repo Anthropic tool-use loop driving Playwright). The default model is `auto`, which resolves in order: a local Ollama model first (free, no keys), then `ANTHROPIC_API_KEY` → `claude-opus-4-8`, then `OPENAI_API_KEY` → `openai/gpt-4.1`, otherwise an error telling you what to set. That resolution order is why the examples below run with zero configuration on a machine that has Ollama.

## Step 2 — Your first `run` with zero flags

Start with the simplest possible command. No flags at all:

```bash
browserbash run "Go to news.ycombinator.com and tell me the title of the top story"
```

This uses every default: the `stagehand` engine, the `local` provider (your Chrome opens visibly), and `auto` model resolution. You will see step-by-step progress as the agent navigates, reads the page, and reasons. At the end it prints a verdict — `passed` or `failed` — and any structured values it was asked to extract, here the headline text. This single run already proves the whole pipeline works before you start tuning it.

If you got an error about no model being available, jump to Troubleshooting — it means neither Ollama nor an API key was found.

## Step 3 — The complete `run` flag reference

`run` is the workhorse. Here is every flag it accepts, what it does, and the values it takes:

| Flag | Values | What it does |
| --- | --- | --- |
| `--engine` | `stagehand` \| `builtin` | Picks who interprets the English. `stagehand` is default; `builtin` is the Anthropic tool-use loop and is auto-selected for LambdaTest/BrowserStack. |
| `--provider` | `local` \| `cdp` \| `browserbase` \| `lambdatest` \| `browserstack` | Where the browser runs. `local` (default) is your Chrome. |
| `--model` | `auto` \| `ollama/<model>` \| `claude-opus-4-8` \| `openai/gpt-4.1` \| `google/gemini-2.5-flash` \| `openrouter/<vendor>/<model>` | Pins the LLM. Default `auto` resolves Ollama → Anthropic → OpenAI. |
| `--headless` | (boolean flag) | Runs Chrome without a visible window. Great for CI and servers. |
| `--timeout <seconds>` | integer seconds | Caps the whole run. On expiry the run ends with a `timeout` status. |
| `--cdp-endpoint <ws-url>` | `ws://...` | The DevTools WebSocket endpoint to attach to. Used with `--provider cdp`. |
| `--record` | (boolean flag) | Saves a screenshot plus a `.webm` session video via bundled ffmpeg. With the `builtin` engine it also writes a Playwright trace. |
| `--dashboard` | (boolean flag) | Opens the local dashboard for this run (localhost:4477, fully local). |
| `--upload` | (boolean flag) | Pushes this run to the cloud dashboard. Requires `connect` first. Without it, nothing leaves your machine. |
| `--agent` | (boolean flag) | Emits NDJSON — one JSON object per line — for CI and AI agents instead of prose. |

Now let's exercise each one.

### `--engine` — choose your interpreter

The engine is the brain that turns "Click the login button" into actual browser calls. Stay on the default for most web flows:

```bash
browserbash run "Open example.com and confirm the page heading says Example Domain" --engine stagehand
```

Switch to `builtin` when you want the Anthropic tool-use loop and a Playwright trace alongside your recording:

```bash
browserbash run "Open example.com and confirm the page heading says Example Domain" --engine builtin
```

The verdict format is identical; what changes is the internal strategy and the trace artifact. Note that if you target LambdaTest or BrowserStack, the `builtin` engine is selected automatically — you do not have to pass `--engine` for those.

### `--provider` — choose where the browser lives

`local` is the default and needs nothing. To drive a browser exposed over the Chrome DevTools Protocol — a remote grid, a container, an already-running Chrome — use `cdp` together with `--cdp-endpoint`:

```bash
browserbash run "Verify the dashboard loads and shows a welcome banner" \
  --provider cdp \
  --cdp-endpoint ws://127.0.0.1:9222/devtools/browser/abc123
```

The two cloud-grid providers each need credentials in the environment. LambdaTest:

```bash
export LT_USERNAME="your_username"
export LT_ACCESS_KEY="your_access_key"
browserbash run "Smoke test the homepage and confirm the nav bar renders" --provider lambdatest
```

BrowserStack is the same shape with its own variables:

```bash
export BROWSERSTACK_USERNAME="your_username"
export BROWSERSTACK_ACCESS_KEY="your_access_key"
browserbash run "Smoke test the homepage and confirm the nav bar renders" --provider browserstack
```

Both grids auto-switch to the `builtin` engine. Browserbase is the hosted-browser option and reads `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`:

```bash
export BROWSERBASE_API_KEY="bb_live_..."
export BROWSERBASE_PROJECT_ID="proj_..."
browserbash run "Open the pricing page and extract the price of the Pro plan" --provider browserbase
```

Here is a quick lookup for the credentials each provider expects:

| `--provider` | Where it runs | Required environment variables |
| --- | --- | --- |
| `local` | Your Chrome (default) | none |
| `cdp` | Any DevTools endpoint | none (pass `--cdp-endpoint`) |
| `browserbase` | Browserbase cloud | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` |
| `lambdatest` | LambdaTest grid | `LT_USERNAME`, `LT_ACCESS_KEY` |
| `browserstack` | BrowserStack grid | `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY` |

### `--model` — pin the LLM

Leave it on `auto` and BrowserBash resolves the best available backend. Pin it when you want determinism. To force a specific local Ollama model — free, private, no keys:

```bash
browserbash run "Search Wikipedia for 'Alan Turing' and return his birth year" \
  --model ollama/qwen3
```

A blunt, honest caveat: very small local models (8B parameters or below) get flaky on long multi-step objectives — they lose the thread, repeat steps, or declare victory early. The sweet spot for local is a mid-size model like Qwen3 or a Llama 3.3 70B-class model. For genuinely hard flows, a capable hosted model earns its keep. To use Anthropic:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
browserbash run "Log in, open Settings, and confirm the email field shows my address" \
  --model claude-opus-4-8
```

To route through OpenRouter and reach hundreds of models with one key:

```bash
export OPENROUTER_API_KEY="sk-or-..."
browserbash run "Open the changelog and summarize the three most recent entries" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

Stagehand-native model strings like `openai/gpt-4.1` and `google/gemini-2.5-flash` work too, and you can point at an Anthropic-compatible gateway by setting `ANTHROPIC_BASE_URL`. Here is the backend map:

| `--model` value | Backend | Key / env |
| --- | --- | --- |
| `auto` (default) | Ollama → Anthropic → OpenAI | whatever is present |
| `ollama/<model>` | Local Ollama | none; `OLLAMA_BASE_URL`, `OLLAMA_MODEL` optional |
| `claude-opus-4-8` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai/gpt-4.1` | OpenAI (Stagehand) | `OPENAI_API_KEY` |
| `google/gemini-2.5-flash` | Google (Stagehand) | provider key |
| `openrouter/<vendor>/<model>` | OpenRouter | `OPENROUTER_API_KEY` |

### `--headless` — no visible window

When you do not need to watch, hide the browser. This is the default posture for CI and for any server without a display:

```bash
browserbash run "Confirm the status page reports all systems operational" --headless
```

Same verdict, no window pops up, and the run uses fewer resources. Combine it freely with `--record` if you still want a video of what happened.

### `--timeout` — put a ceiling on a run

Long objectives can wander, especially on smaller models. Cap them in seconds:

```bash
browserbash run "Add two items to the cart and proceed to the checkout page" --timeout 120
```

If the run exceeds 120 seconds it stops and reports a `timeout` status (exit code `3` in agent mode — more on that shortly). Treat a timeout as a signal to either simplify the objective or move to a stronger model.

### `--record` — keep the evidence

For debugging and for sharing with teammates, capture the session:

```bash
browserbash run "Sign up with a test email and verify the welcome screen appears" --record
```

This writes a screenshot and a `.webm` video using bundled ffmpeg. If you pair it with `--engine builtin`, you also get a Playwright trace you can open in the trace viewer. If recording fails, see Troubleshooting — it is almost always an ffmpeg issue.

### `--dashboard` — watch it locally

Open the fully local dashboard (localhost:4477) for this run so you can see steps, screenshots, and the verdict in a UI:

```bash
browserbash run "Open the blog and confirm the latest post is dated this month" --dashboard
```

Nothing about `--dashboard` sends data anywhere — it is your machine, your store. That is different from `--upload`.

### `--upload` — push one run to the cloud

If you have linked a cloud account with `connect` (covered in Step 6), add `--upload` to push *this* run to the cloud dashboard:

```bash
browserbash run "Verify the contact form submits and shows a thank-you message" --upload
```

This is strictly opt-in and per-run. Without `connect` it will not work, and without `--upload` nothing ever leaves your machine. Free cloud runs are kept for 15 days.

### `--agent` — machine-readable output for CI and AI

When the caller is a script, a CI job, or an AI coding agent, switch to NDJSON:

```bash
browserbash run "Log in and confirm the account dashboard loads" --agent
```

Instead of prose you get one JSON object per line. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the final line is a terminal event like `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":8421}`. The process exit code carries the verdict so you never parse text:

| Exit code | Meaning |
| --- | --- |
| `0` | passed |
| `1` | failed |
| `2` | error |
| `3` | timeout |

That makes a run callable like a function. In a shell, `browserbash run "..." --agent && echo OK || echo NOT_OK` already branches correctly on the verdict. For more on wiring this into pipelines, see the [tutorials index](https://browserbash.com/tutorials).

## Step 4 — `testmd`: running committed markdown tests

`run` is one-shot. When you want reviewable, version-controlled tests, you write a `*_test.md` file — each list item is a step, `{{variables}}` template values in, `@import` composes shared preludes, and secret-marked variables are masked as `*****` in every log line. You execute the file with `testmd run`:

```bash
browserbash testmd run ./login_test.md
```

After each run it writes a human-readable `Result.md` next to your test so the outcome is itself reviewable in a pull request. The `testmd run` command accepts the same run-shaping flags, so you can change engine, provider, model, and artifacts exactly as you do for `run`:

```bash
browserbash testmd run ./checkout_test.md \
  --model ollama/qwen3 \
  --headless \
  --record
```

| Flag on `testmd run` | Example value | What it does |
| --- | --- | --- |
| `--engine` | `builtin` | Same engine switch as `run`. |
| `--provider` | `lambdatest` | Run the markdown test on a grid or cloud browser. |
| `--model` | `claude-opus-4-8` | Pin the LLM for the whole file. |
| `--headless` | — | No visible window. |
| `--timeout <seconds>` | `180` | Ceiling for the run. |
| `--record` | — | Screenshot + `.webm` (+ trace on `builtin`). |
| `--agent` | — | NDJSON output for CI. |

For a deep dive on authoring these files — the step syntax, `@import`, and secret masking — the dedicated walkthrough is in the [BrowserBash blog](https://browserbash.com/blog).

## Step 5 — `dashboard`: the local run viewer

The standalone `dashboard` command launches the fully local dashboard at localhost:4477. It reads your on-disk run store — every run is kept at `~/.browserbash/runs`, secrets masked, capped at 200 — so you can browse past runs even ones you fired days ago:

```bash
browserbash dashboard
```

It has exactly one flag, and it is a destructive one. `--clear` wipes the local store before starting, which is handy when you want a clean slate or are about to demo:

```bash
browserbash dashboard --clear
```

| Flag on `dashboard` | What it does |
| --- | --- |
| `--clear` | Wipes the local run store, then starts the dashboard. |

Everything here stays on your machine. The local dashboard never uploads.

## Step 6 — `connect`: linking the optional cloud

You only need `connect` if you want to use `--upload`. It links the CLI to a cloud account using a key that starts with `bb_`:

```bash
browserbash connect --key bb_your_key_here
```

| Flag on `connect` | Value | What it does |
| --- | --- | --- |
| `--key` | `bb_...` | Links this machine to your cloud dashboard so `--upload` works. |

Get a key from the optional [sign-up page](https://browserbash.com/sign-up) — no account is needed to run BrowserBash at all; this is purely for the cloud dashboard. Once linked, add `--upload` to any run or `testmd run` to push that run. Free cloud runs are retained for 15 days, and the choice is always per-run and opt-in.

## Troubleshooting

**"No model available" error on a fresh machine.** The `auto` resolver found neither a running Ollama instance nor an `ANTHROPIC_API_KEY` nor an `OPENAI_API_KEY`. Either start Ollama and pull a model (`ollama pull qwen3`), or export one of the API keys, or pin a backend explicitly with `--model`. The [learn hub](https://browserbash.com/learn) has the local-model setup end to end.

**The agent loses the plot on a multi-step objective.** This is the small-model failure mode. Models at or below 8B parameters are flaky on long flows — they repeat steps or finish early. Move to a mid-size local model (Qwen3, Llama 3.3 70B-class) with `--model ollama/qwen3`, or pin a hosted model like `--model claude-opus-4-8` for the hard flows. Tightening the objective into smaller, explicit steps also helps a lot.

**`--record` produces no video.** The recorder uses bundled ffmpeg, and the usual culprit is a sandbox or permissions issue that blocks the binary from spawning. Re-run without `--headless` to confirm the run itself works, check that nothing in your environment overrides the ffmpeg path, and remember that the Playwright trace from `--record` only appears when you also pass `--engine builtin`.

**A provider run fails immediately with an auth error.** The credential environment variables are not set in the shell that ran the command. Each provider needs its own pair: `LT_USERNAME` + `LT_ACCESS_KEY` for LambdaTest, `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` for BrowserStack, and `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` for Browserbase. Export them in the same session, then re-run with the matching `--provider`.

**Runs stop with a `timeout` status.** Either the objective is genuinely long or the model is too small to finish in time. Raise the ceiling with `--timeout 240`, or split the objective, or switch to a stronger model. In `--agent` mode a timeout returns exit code `3`, so your CI can distinguish it from a real `failed` (exit `1`).

## When to use this

Keep this page bookmarked as your flag lookup, then go deeper on the topics that matter for your workflow:

- New to the tool? Start with the hands-on [tutorials](https://browserbash.com/tutorials) and the [learn hub](https://browserbash.com/learn) for the local-model setup.
- Wiring runs into CI or an AI agent? The `--agent` NDJSON schema and exit codes deserve their own read on the [blog](https://browserbash.com/blog).
- Comparing the local-first model story against hosted-only tools? The [features page](https://browserbash.com/features) lays out the engine and provider matrix in full.

## FAQ

### What is the default engine and model in BrowserBash?

The default engine is `stagehand`, Browserbase's MIT-licensed interpreter with self-healing primitives. The default model is `auto`, which resolves to a local Ollama model first, then an Anthropic key, then an OpenAI key. That means on a machine with Ollama installed you can run with zero flags and zero keys.

### How do I run BrowserBash without any API keys?

Install Ollama, pull a mid-size model, and run the default command — the `auto` resolver picks the local model first, so nothing leaves your machine and your model bill stays at zero. You can pin it explicitly with `--model ollama/qwen3` if you want determinism. No account and no keys are required to run.

### What is the difference between --dashboard and --upload?

`--dashboard` opens the fully local dashboard at localhost:4477 for a run and never sends anything off your machine. `--upload` pushes that single run to the cloud dashboard and only works after you have linked an account with `connect`. Uploading is always opt-in and per-run; without `--upload`, nothing leaves your machine.

### Which BrowserBash flag should I use for CI pipelines?

Use `--agent`, which emits NDJSON — one JSON object per line — and sets the process exit code to the verdict: `0` passed, `1` failed, `2` error, `3` timeout. Your CI job branches on the exit code without parsing any prose. Pair it with `--headless` so no browser window is needed on the runner.

---

That is every flag across `run`, `testmd`, `dashboard`, and `connect`, each with a command you can run today. Install it and start tuning your own runs:

```bash
npm install -g browserbash-cli
```

Account optional — grab a cloud key only if you want the hosted dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
