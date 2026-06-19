---
title: Run AI browser tests on LambdaTest with BrowserBash
description: "Hands-on lambdatest ai testing cli tutorial: set LT keys, run --provider lambdatest with BrowserBash, go --headless, and watch recordings in the LT dashboard."
date: 2026-02-03
category: tutorial
---

By the end of this tutorial you'll be doing real lambdatest ai testing from the command line: you type a plain-English objective, BrowserBash provisions a real browser on the LambdaTest cloud grid, an AI agent drives it step by step, and you get back a pass/fail verdict plus the structured values it pulled off the page. No selectors, no page objects, no SDK to bolt on. The exact same objective you run against your own Chrome will run on a LambdaTest browser by flipping a single flag — and the session shows up in your LambdaTest dashboard with its recording, just like any other Automation build.

I'm going to pair-program this with you the way I'd do it sitting next to a teammate. We start free and local so you can confirm the agent actually works, then point it at LambdaTest, run it headless, and go watch the recording in the LT dashboard. BrowserBash is a free, open-source CLI (Apache-2.0) from The Testing Academy, so everything here is runnable today. The only paid piece is your own LambdaTest plan, which you already have if you're reading this.

## What you'll need

Before we touch LambdaTest, get the basics in place. None of this requires a BrowserBash account — the CLI runs entirely from your machine, and nothing leaves it unless you explicitly opt in.

- **Node.js 18 or newer.** Check with `node -v`. If it prints anything below 18, upgrade before continuing.
- **Google Chrome** installed locally. You only need this for the warm-up run on the `local` provider; the LambdaTest runs use cloud browsers.
- **The CLI**, installed globally:

```bash
npm install -g browserbash-cli
```

- **An LLM backend.** BrowserBash defaults to `auto`, which resolves in this order: a local [Ollama](https://browserbash.com/learn) model first (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (Claude), then `OPENAI_API_KEY`. For the local warm-up I'll assume Ollama with a mid-size model. For the LambdaTest runs, the model matters more than you'd guess — more on that below.
- **A LambdaTest account** and its two credentials: your **username** and your **access key**. Both live on your LambdaTest dashboard under Profile → Account Settings → Password & Security, labelled "Username" and "Access Key."

Confirm the install before moving on:

```bash
browserbash --version
```

You should see `1.3.1` (or newer). If the command isn't found, your global npm bin directory isn't on your `PATH` — fix that first, because every step below calls `browserbash`.

## Step 1 — Prove the agent works locally (free)

Never debug two new things at once. Before LambdaTest enters the picture, confirm the agent and your model can actually drive a browser. Run a throwaway objective against your local Chrome:

```bash
browserbash run "Go to https://www.lambdatest.com, confirm the page loaded, and report the main headline text"
```

A Chrome window opens, the agent reads the page, and after a handful of steps you get a verdict in your terminal. A healthy run ends with a `PASSED` line, a short summary, and a `final_state` block holding the headline it extracted. If you see that, your model and the agent are wired correctly and we can move on.

If the run stalls, loops, or invents a result that doesn't match the page, it's almost always the model — not the agent. Jump to [Troubleshooting](#troubleshooting) and fix the local path first. Getting a clean local pass now saves you an hour of confusion later when a cloud run misbehaves and you can't tell whether the grid or the model is at fault.

### Why start with `local`

The `local` provider is BrowserBash's default — your own Chrome, no credentials, instant feedback. It's the cheapest possible loop for iterating on the *wording* of your objective. Once the English is solid and the agent passes locally, moving to LambdaTest is genuinely just a provider swap. The objective text doesn't change one character.

## Step 2 — Set your LambdaTest credentials

LambdaTest authentication is two environment variables. BrowserBash reads them automatically the moment you choose the LambdaTest provider — there's no config file to edit and no key to paste into a flag where it could leak into your shell history.

```bash
export LT_USERNAME="your-username"
export LT_ACCESS_KEY="your-access-key"
```

Set them in the shell you'll run from. For anything past a quick experiment, put them in your shell profile or a `.env`-style secret store so they never land in history or get committed. In CI, set them as masked repository secrets and export them in the job — never inline them in a workflow file.

A quick sanity check that they actually made it into this shell:

```bash
echo "${LT_USERNAME:?missing} is set"
```

If that errors with `missing`, the variable didn't reach your environment — export it again in *this* terminal. Environment variables don't cross shell sessions, which is the single most common reason a LambdaTest run fails with an authentication error right after it worked a minute ago in another tab.

## Step 3 — Run the same objective on LambdaTest

Now the payoff. Take the objective you proved locally and add one flag:

```bash
browserbash run "Go to https://www.lambdatest.com, confirm the page loaded, and report the main headline text" --provider lambdatest
```

That's the whole change. `--provider lambdatest` tells BrowserBash to provision a real browser on the LambdaTest grid instead of launching Chrome on your laptop. The AI agent still does all the reasoning — read the page, decide the next action, click, type, verify — but the browser now lives in LambdaTest's cloud.

One detail to internalize early: **LambdaTest automatically uses the `builtin` engine.** BrowserBash ships two engines — `stagehand` (the default for local runs, by Browserbase) and `builtin`, an in-repo Anthropic tool-use loop driving Playwright. The `builtin` engine is the one that knows how to connect to LambdaTest and BrowserStack grids, so the CLI switches to it for you. You don't pass `--engine` at all; choosing `--provider lambdatest` is enough.

The verdict comes back in the same shape as the local one — a `PASSED` or `FAILED` line, a summary, and a `final_state` with the extracted headline. The difference is that you can now open your LambdaTest Automation dashboard and find the session that ran it, complete with LambdaTest's own video and logs. We'll go look at that recording in Step 5.

### What the provider flag changes (and what it doesn't)

It helps to keep two ideas apart, because mixing them up causes most of the confusion people hit here:

| Concept | Flag | What it controls | Default |
| --- | --- | --- | --- |
| Provider | `--provider` | *Where* the browser runs | `local` (your Chrome) |
| Engine | `--engine` | *How* the agent thinks and acts | `stagehand` |
| Model | `--model` | *Which LLM* interprets the English | `auto` |

For LambdaTest you set the provider, and the CLI handles the engine. The model stays your choice. Here's the full set of providers so you can see where LambdaTest sits:

| `--provider` value | Browser location | Credentials needed |
| --- | --- | --- |
| `local` | Your own Chrome | none |
| `cdp` | Any DevTools endpoint (`--cdp-endpoint ws://...`) | none |
| `browserbase` | Browserbase cloud | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` |
| `lambdatest` | LambdaTest grid (auto `builtin`) | `LT_USERNAME`, `LT_ACCESS_KEY` |
| `browserstack` | BrowserStack grid (auto `builtin`) | `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY` |

## Step 4 — Pin a capable model for the cloud run

This is the honesty section, and it's the one that saves you the most pain. LambdaTest runs the *browser*, but the *brain* is still whatever LLM your `--model` resolves to. A real cloud flow on a live site — log in, navigate, fill a multi-step form, verify a confirmation — is a long, multi-step objective. Very small local models (8B and under) get flaky on exactly this kind of task: they drop steps, repeat themselves, or declare victory early.

So while a tiny local model is fine for the Step 1 smoke check, for serious lambdatest ai testing cli work, point the agent at something with more headroom. You've got a few good options:

```bash
# A capable hosted model via Anthropic (needs ANTHROPIC_API_KEY)
browserbash run "Log in with the demo account and verify the dashboard shows a welcome message" \
  --provider lambdatest \
  --model claude-opus-4-8
```

```bash
# A mid-size open model through OpenRouter (needs OPENROUTER_API_KEY)
browserbash run "Log in with the demo account and verify the dashboard shows a welcome message" \
  --provider lambdatest \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

```bash
# A capable local model if your machine can host it (free, nothing leaves your box)
browserbash run "Log in with the demo account and verify the dashboard shows a welcome message" \
  --provider lambdatest \
  --model ollama/qwen3
```

The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the hardest flows. Here are the model backends BrowserBash understands:

| `--model` value | Backend | Key / env |
| --- | --- | --- |
| `auto` (default) | Ollama → Anthropic → OpenAI, in that order | whichever is present |
| `ollama/<model>` | Local Ollama | none (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`) |
| `claude-opus-4-8` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai/gpt-4.1` | OpenAI (Stagehand) | `OPENAI_API_KEY` |
| `google/gemini-2.5-flash` | Google (Stagehand) | Stagehand-configured |
| `openrouter/<vendor>/<model>` | OpenRouter | `OPENROUTER_API_KEY` |

A note on model and engine together: because LambdaTest forces the `builtin` engine, the Anthropic-compatible path (`claude-opus-4-8`, or any gateway via `ANTHROPIC_BASE_URL`) is the most natural fit, since `builtin` is itself an Anthropic tool-use loop. The OpenRouter and Ollama paths work too — pick based on cost, latency, and how hard your flow is.

## Step 5 — Go headless and find the recording in the LT dashboard

Two things make a LambdaTest run feel production-ready: running without a window in the way, and having a recording you can hand to a teammate when something fails. You get both here.

### Run it headless

For unattended runs — local CI, a cron job, your laptop while you do something else — add `--headless` so nothing pops a window:

```bash
browserbash run "Open the pricing page, confirm all three plan tiers render, and report each plan name and price" \
  --provider lambdatest \
  --model claude-opus-4-8 \
  --headless
```

On a cloud provider like LambdaTest the browser already runs remotely, so `--headless` chiefly matters for the local provider — but passing it on a LambdaTest run is harmless and keeps your command identical to the one you'd run locally. The verdict shape is unchanged: a `PASSED`/`FAILED` line, a summary, and a `final_state` with the three plan names and prices the agent read off the page.

### Watch the recording in the LambdaTest dashboard

This is the part people love. Because LambdaTest runs the actual browser, every run shows up as a session in your **LambdaTest Automation dashboard** with LambdaTest's own video recording, command logs, and metadata attached. You don't pass any flag for this — it's simply how the grid works. After the run finishes, open the LambdaTest dashboard, find the most recent session in your Automation builds, and play the recording back to see exactly what the agent did, click by click.

That LT-side recording is your shareable source of truth: when a flow fails, you drop the dashboard link in the ticket and anyone can watch the failure without re-running anything.

### Capture local evidence too with `--record`

You can *also* capture artifacts on your own machine with `--record`. It writes a screenshot and a `.webm` session video using BrowserBash's bundled ffmpeg, and because LambdaTest runs on the `builtin` engine, it *also* writes a Playwright trace. That gives you two complementary records: the LambdaTest dashboard recording in the cloud, and a local trace you can step through frame by frame.

```bash
browserbash run "Open the pricing page, confirm all three plan tiers render, and report each plan name and price" \
  --provider lambdatest \
  --model claude-opus-4-8 \
  --headless \
  --record
```

Here are the run flags worth knowing for this kind of work:

| Flag | What it does |
| --- | --- |
| `--provider lambdatest` | Run the browser on the LambdaTest grid (auto `builtin` engine) |
| `--model <id>` | Pin the LLM backend instead of `auto` |
| `--headless` | Run without a visible window (chiefly affects the local provider) |
| `--timeout <seconds>` | Cap how long the agent runs before giving up |
| `--record` | Save screenshot + `.webm` video; `builtin` also writes a Playwright trace |
| `--agent` | Emit NDJSON, one JSON object per line, for CI and coding agents |
| `--dashboard` | Open the free local dashboard for this run |
| `--upload` | Push this run to the cloud dashboard (requires `connect`; opt-in) |

Every run is also kept on disk at `~/.browserbash/runs` with secrets masked, capped at the last 200 runs, so you have a local history even without any flags.

## Step 6 — Wire it into CI with `--agent`

The whole point of a grid is unattended, repeatable runs. For that, switch the output to machine-readable NDJSON with `--agent`. Instead of prose, you get one JSON object per line — progress events and a terminal event — which CI and AI coding agents can parse without guessing:

```bash
browserbash run "Open the pricing page, confirm all three plan tiers render, and report each plan name and price" \
  --provider lambdatest \
  --model claude-opus-4-8 \
  --headless \
  --agent
```

Progress lines look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal line like `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. You don't need to parse any of it to gate a build, though — BrowserBash sets the exit code for you:

| Exit code | Meaning |
| --- | --- |
| `0` | passed |
| `1` | failed |
| `2` | error |
| `3` | timeout |

So a CI step is just the command above; the job fails when the exit code is non-zero. Set `LT_USERNAME` and `LT_ACCESS_KEY` as masked secrets in your CI provider, export them in the job, and your pipeline runs cloud checks against the LambdaTest grid on every push — with the session recording waiting in the LT dashboard if a build goes red.

### Committable tests with markdown

For checks you want to version-control and reuse, write them as a markdown test instead of a one-liner. Each list item is a step, `{{variables}}` get templated in, secret-marked variables are masked as `*****` in every log line, and a human-readable `Result.md` is written after each run:

```bash
browserbash testmd run ./pricing_test.md --provider lambdatest --model claude-opus-4-8 --headless
```

This is the right home for a stable cloud regression check: the steps live in your repo, the LambdaTest provider and model are passed at run time, and credentials stay in the environment where they belong.

## Troubleshooting

A handful of failure modes account for almost every bad LambdaTest run. Here's how to recognize and fix them.

**Authentication / credentials not set.** If a run dies immediately with an auth error, your keys aren't in the current shell. Run `echo "$LT_USERNAME"` — if it's empty, re-export both `LT_USERNAME` and `LT_ACCESS_KEY` in *this* terminal. Remember that environment variables don't survive across shell tabs or CI steps unless you export them in each one.

**Small local model flakiness.** If the agent loops, skips steps, or returns a verdict that doesn't match what actually happened, the model is the culprit, not LambdaTest. Models 8B and under struggle with long multi-step cloud flows. Re-run with `--model claude-opus-4-8`, an OpenRouter 70B-class model, or a mid-size local model like `ollama/qwen3`, and the behavior usually snaps into place.

**Runs time out on slow grid sessions.** Cloud sessions add network latency that a local run doesn't have, so a complex flow can run past the default budget. Raise the ceiling with `--timeout 180` (seconds) to give the agent room. If it still times out, your objective is probably too broad — split it into smaller, sharper objectives that each verify one thing.

**`--record` produces no local video.** The local session video relies on BrowserBash's bundled ffmpeg. If the `.webm` is missing, the bundled binary couldn't run on your platform. You'll still get the screenshot and, on the `builtin` engine that LambdaTest uses, the Playwright trace — and you always have the LambdaTest dashboard's own recording in the cloud, so you're never without evidence.

**Engine confusion.** If you try to force `--engine stagehand` with `--provider lambdatest`, expect trouble — the grid integration lives in the `builtin` engine. Don't pass `--engine` for LambdaTest at all; let the CLI pick `builtin` automatically.

## When to use this

Reach for LambdaTest with BrowserBash when you want your runs visible in LambdaTest's own dashboard alongside the rest of your QA — recordings, command logs, and Automation builds your team already lives in — or when you need real browser/OS combinations you can't reproduce on your laptop. For day-to-day iteration on the *wording* of an objective, stay on the free `local` provider; for clean disposable cloud Chrome at high concurrency, look at the [Browserbase tutorial](https://browserbash.com/tutorials). When you're ready to gate builds, the [CI patterns on the blog](https://browserbash.com/blog) walk through the NDJSON and exit-code wiring end to end.

A few good next steps:

- Browse the full [BrowserBash tutorials](https://browserbash.com/tutorials) for provider-by-provider walkthroughs.
- Read [the Learn hub](https://browserbash.com/learn) to understand engines, models, and the Ollama-first design before you scale up.
- Skim the [features page](https://browserbash.com/features) to see what the agent and the optional dashboards give you, then the [pricing page](https://browserbash.com/pricing) — the CLI is free; only the optional cloud dashboard and your own grid cost anything.

## FAQ

### How do I run LambdaTest tests without writing selectors?

You don't write selectors at all. You write a plain-English objective like "open the pricing page and confirm all three plan tiers render," add `--provider lambdatest`, and an AI agent reads the rendered page and decides every action itself. There are no page objects to maintain, so the same objective survives UI changes that would break a hardcoded selector.

### Which LambdaTest credentials does BrowserBash need?

Two environment variables: `LT_USERNAME` and `LT_ACCESS_KEY`. Both come from your LambdaTest account settings. BrowserBash reads them automatically when you pass `--provider lambdatest`, so there is no config file to edit and no key to paste into a command flag where it could leak into shell history.

### Where do I watch the recording of a LambdaTest run?

In your LambdaTest Automation dashboard. Because LambdaTest runs the real browser in its cloud, every run becomes a session with LambdaTest's own video recording and command logs attached, no extra flag required. You can also capture a local screenshot, webm video, and Playwright trace with the record flag for evidence on your own machine.

### What model should I use for AI testing on LambdaTest?

For real multi-step flows, use a capable model — a hosted one like claude-opus-4-8, an OpenRouter 70B-class model, or a mid-size local model such as Qwen3. Very small local models under 8B get flaky on long cloud objectives and may drop or repeat steps. The browser running on LambdaTest does not change this; the model is still the brain doing the reasoning.

Ready to try the lambdatest ai testing cli yourself? Install the CLI and point it at your grid:

```bash
npm install -g browserbash-cli
```

Then [sign up](https://browserbash.com/sign-up) if you want the optional cloud dashboard — though you don't need an account to run a single command above.
