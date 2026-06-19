---
title: Drive a browser with Claude using BrowserBash
description: "Claude browser automation tutorial: wire ANTHROPIC_API_KEY into BrowserBash, run claude-opus-4-8 on the builtin engine, and route through a gateway."
date: 2026-02-17
category: tutorial
---

By the end of this tutorial you'll have Claude browser automation running on your own machine: you'll point BrowserBash at `claude-opus-4-8`, hand it a plain-English objective, and watch a real Chrome window get driven step by step — no selectors, no page objects. We'll wire up `ANTHROPIC_API_KEY`, run the in-repo `builtin` engine that drives Playwright through an Anthropic tool-use loop, record a session video, emit machine-readable NDJSON for CI, and route everything through an Anthropic-compatible gateway with `ANTHROPIC_BASE_URL`. I'm going to pair-program this with you the way I'd onboard a new SDET — every command is real, every flag exists, and I'll tell you exactly what the verdict should look like.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective like "log in and confirm the dashboard loads," an AI agent plans the clicks, drives a genuine browser, and returns a pass/fail verdict plus any structured values it extracted. The interesting bit for this lesson is the model layer — and how Claude slots into it cleanly.

## What you'll need

Before the first command, get these in place:

- **Node.js >= 18** — check with `node -v`. BrowserBash is published to npm and needs a modern runtime.
- **Google Chrome** installed — the default `local` provider drives your real Chrome binary.
- **An Anthropic API key** — grab one from the Anthropic console and export it as `ANTHROPIC_API_KEY`. This is what flips BrowserBash onto `claude-opus-4-8`.
- **The CLI itself** — one global install:

```bash
npm install -g browserbash-cli
```

That gives you the `browserbash` command (latest version 1.3.1). No account, no signup, no telemetry — nothing leaves your machine unless you explicitly opt in later. Confirm the install:

```bash
browserbash --version
```

You should see `1.3.1` printed back. If `command not found` shows up instead, your npm global bin isn't on `PATH` — see [Troubleshooting](#troubleshooting).

A quick note before we start: BrowserBash is **Ollama-first**. Its default model is `auto`, which prefers a free local model if it finds one. We're deliberately overriding that to use Claude, because this tutorial is about hosted Anthropic models specifically. If you'd rather keep your model bill at exactly zero, the local path is covered in the [tutorials hub](https://browserbash.com/tutorials) — but Claude is the right call when your flows are long, multi-step, and need a capable model that won't lose the plot halfway through checkout.

## Step 1 — Set your Anthropic key

BrowserBash resolves `auto` in a fixed order: local Ollama first, then `ANTHROPIC_API_KEY` -> `claude-opus-4-8`, then `OPENAI_API_KEY` -> `openai/gpt-4.1`, otherwise it errors with guidance. The cleanest way to land on Claude is to export the key and pin the model explicitly so there's no ambiguity.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Put that in your `~/.zshrc` or `~/.bashrc` if you want it to persist across shells. To verify the variable is actually exported (and not just typed into a dead subshell):

```bash
echo ${ANTHROPIC_API_KEY:+set}
```

That prints `set` when the key is present and nothing when it isn't — handy because it never echoes the secret itself.

## Step 2 — Run your first Claude-driven objective

Let's drive a browser. We'll pin the model to `claude-opus-4-8` so the resolver doesn't reach for a local Ollama model instead, and we'll use the `builtin` engine — the in-repo Anthropic tool-use loop that drives Playwright directly. The `builtin` engine is the natural home for Claude here because it *is* an Anthropic tool-use agent under the hood.

```bash
browserbash run "Go to https://news.ycombinator.com and tell me the title of the top story" \
  --engine builtin \
  --model claude-opus-4-8
```

A real Chrome window opens, Claude reads the page, and after a few steps the CLI prints a verdict. Expect something close to:

```
PASSED — Navigated to Hacker News and read the top story headline.
final_state: { "top_story_title": "<the current #1 headline>" }
```

The verdict is `PASSED`, `FAILED`, `ERROR`, or `TIMEOUT`. The `final_state` object holds whatever structured values the agent extracted to satisfy your objective — here, the headline string. That's the whole loop: English in, verdict plus structured data out.

### Why pin the model instead of trusting `auto`?

If you have Ollama running locally, `auto` resolves to that local model first — free and private, but a small local model can be flaky on long flows. Pinning `--model claude-opus-4-8` guarantees the request goes to Claude regardless of what else is installed. When you control which model runs, you control reproducibility, and reproducibility is the whole game in test automation.

## Step 3 — Understand builtin vs stagehand

BrowserBash separates the *engine* (who interprets your English) from the *provider* (where the browser physically runs). Two engines ship:

| Engine | What it is | When to reach for it |
| --- | --- | --- |
| `stagehand` | Default. MIT, by Browserbase. Exposes act/extract/observe/agent primitives with self-healing. | General use; resilient to small DOM drift. |
| `builtin` | In-repo Anthropic tool-use loop driving Playwright directly. Auto-selected for LambdaTest and BrowserStack. | Claude-native flows, traces, and the paid grid providers. |

For Claude browser automation specifically, `--engine builtin` is the most direct fit — it's literally an Anthropic tool-use agent. You can also run Claude through Stagehand if you prefer its primitives, but builtin gives you the tightest mapping to Anthropic's tool-calling model and, as a bonus, writes a Playwright trace when you record.

Switch engines explicitly with the flag:

```bash
browserbash run "Search for 'browser automation' and open the first result" \
  --engine builtin \
  --model claude-opus-4-8
```

If you drop `--engine`, you get `stagehand`. If you point `--provider` at LambdaTest or BrowserStack, the engine flips to `builtin` automatically regardless of the flag.

## Step 4 — Record the run for evidence

When a flow fails at 2 a.m. in CI, you want to *see* what the browser saw. Add `--record` and BrowserBash captures a screenshot plus a `.webm` session video using bundled ffmpeg. On the `builtin` engine you also get a Playwright trace — gold for debugging a tricky step.

```bash
browserbash run "Add the first product to the cart and go to checkout" \
  --engine builtin \
  --model claude-opus-4-8 \
  --record
```

After the run, the CLI prints the verdict and the paths to the artifacts. Every run is also kept on-disk at `~/.browserbash/runs` (secrets masked, capped at 200 runs), so you can dig back through history without re-running anything. If `--record` errors about a missing encoder, jump to [Troubleshooting](#troubleshooting) — ffmpeg is bundled, but a locked-down environment can still trip it.

### Headless when you don't need to watch

In CI you don't want a visible window. Add `--headless`:

```bash
browserbash run "Confirm the homepage loads and the login button is visible" \
  --engine builtin \
  --model claude-opus-4-8 \
  --headless \
  --timeout 120
```

`--timeout` takes **seconds**, not milliseconds — `120` gives the agent two minutes before it gives up and returns a `TIMEOUT` verdict. Long, multi-step objectives deserve a generous budget; a smoke check can run tight.

## Step 5 — Route Claude through a gateway with ANTHROPIC_BASE_URL

This is the part teams ask about most. If your org puts an Anthropic-compatible gateway in front of the model — for spend caps, audit logging, prompt firewalls, or a proxy that load-balances across regions — you don't change a single BrowserBash flag. You override the base URL.

```bash
export ANTHROPIC_API_KEY="sk-ant-or-gateway-token"
export ANTHROPIC_BASE_URL="https://your-gateway.internal/anthropic"

browserbash run "Log in with the demo account and confirm the dashboard loads" \
  --engine builtin \
  --model claude-opus-4-8
```

BrowserBash sends Claude traffic to whatever `ANTHROPIC_BASE_URL` points at, as long as that endpoint speaks the Anthropic API. The `claude-opus-4-8` model id and the `ANTHROPIC_API_KEY` header travel through untouched — the gateway is transparent to the CLI. This is how you keep a single landing zone for all model spend while engineers still run plain `browserbash run` locally.

A few field notes from rolling this out:

- The token you set in `ANTHROPIC_API_KEY` is whatever your gateway expects — sometimes a real Anthropic key, sometimes a gateway-minted token. The CLI doesn't care; it just forwards it.
- Make sure the gateway path includes any prefix it needs. If requests 404, the base URL is almost always missing or doubling a path segment.
- Unset the variable (`unset ANTHROPIC_BASE_URL`) to fall straight back to Anthropic's default endpoint — useful when you're isolating whether a failure is the gateway or the model.

### The model and backend flags at a glance

Here's the slice of the CLI surface this lesson touches, so you're never guessing what a flag does:

| Flag / env | Purpose |
| --- | --- |
| `--model claude-opus-4-8` | Pin the LLM backend to Anthropic's Opus model (needs `ANTHROPIC_API_KEY`). |
| `--engine builtin` | Use the in-repo Anthropic tool-use loop driving Playwright. |
| `--provider local` | Run the browser in your real Chrome (the default). |
| `ANTHROPIC_API_KEY` | Auth for Claude; also what makes `auto` resolve to `claude-opus-4-8`. |
| `ANTHROPIC_BASE_URL` | Point Claude traffic at an Anthropic-compatible gateway or proxy. |
| `--record` | Capture screenshot + `.webm` video (and a Playwright trace on builtin). |
| `--headless` | Run with no visible browser window. |
| `--timeout <seconds>` | Wall-clock budget before the run returns `TIMEOUT`. |
| `--agent` | Emit NDJSON, one JSON object per line, for CI and coding agents. |

Everything in that table is a real BrowserBash flag or environment variable. There's no invented configuration here — if it's not in this table or the rest of this post, it doesn't exist. The full set lives on the [features page](https://browserbash.com/features).

## Step 6 — Get machine-readable output for CI

Prose verdicts are great for a human at a terminal. For CI you want a contract a script can parse without regexing English. Add `--agent` and BrowserBash emits NDJSON — one JSON object per line.

```bash
browserbash run "Verify the pricing page shows a Pro plan and capture its price" \
  --engine builtin \
  --model claude-opus-4-8 \
  --headless \
  --agent
```

You'll see a stream of step events followed by a single terminal event. Realistically it looks like this:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened the pricing page"}
{"type":"step","step":2,"status":"passed","action":"extract","remark":"Found the Pro plan card"}
{"type":"run_end","status":"passed","summary":"Pro plan present; price captured","final_state":{"pro_price":"$29/mo"},"duration_ms":18420}
```

Each `step` line tells you what action ran and whether it passed. The `run_end` line carries the overall `status`, a `summary`, the `final_state` with your extracted values, and `duration_ms`. The process exit code mirrors the status, which is what your pipeline gates on:

| Exit code | Meaning |
| --- | --- |
| `0` | `passed` |
| `1` | `failed` |
| `2` | `error` |
| `3` | `timeout` |

So a CI step is as simple as running the command and checking `$?`. No prose parsing, no flaky string matching — just an exit code and a clean JSON line you can pipe into a report. This is exactly how you'd wire BrowserBash into Jenkins, GitHub Actions, or hand it to an AI coding agent that consumes structured events.

## Step 7 — Commit the flow as a markdown test

One-shot `run` commands are perfect for exploration. When you want something a teammate can review in a pull request, promote it to a markdown test. Create `checkout_test.md`:

```markdown
# Checkout smoke

- Go to https://demo.store.example
- Add the first product to the cart
- Open the cart and proceed to checkout
- Confirm the order summary shows at least one line item
```

Each list item is a step. Run it with the same Claude backend:

```bash
browserbash testmd run ./checkout_test.md --engine builtin --model claude-opus-4-8
```

After the run, BrowserBash writes a human-readable `Result.md` next to your test so reviewers can see exactly what happened. Markdown tests support `{{variables}}` templating, `@import` for composing shared steps, and **secret-marked variables that get masked as `*****` in every log line** — so you can template in a password without it ever landing in a log or the run store. That last point matters: it's how you keep Claude-driven login tests safe to commit.

## Step 8 — See it all in the local dashboard

Want a UI instead of scrollback? BrowserBash ships a fully local dashboard. Nothing uploads anywhere.

```bash
browserbash dashboard
```

That serves on `http://localhost:4477` and reads from your on-disk run store. You can also open it for a single run with `--dashboard` on the `run` command. If your store ever gets cluttered, `browserbash dashboard --clear` wipes it.

If you *do* want runs shared with a team, that's opt-in and separate: `browserbash connect --key bb_...` links the optional cloud dashboard, and then `--upload` on a run pushes that one run (free cloud runs are kept 15 days). Without `--upload`, **nothing leaves your machine** — the local-first default holds. More on the hosted side lives on the [pricing page](https://browserbash.com/pricing).

## Troubleshooting

Real failure modes I've hit, and the fix for each.

### `command not found: browserbash`
The global install succeeded but npm's global bin directory isn't on your `PATH`. Run `npm bin -g` to find it, then add that directory to your shell profile. Re-open the terminal and `browserbash --version` should resolve.

### It ran on a local model instead of Claude
You exported `ANTHROPIC_API_KEY` but left the model on `auto`, and Ollama was running — so `auto` resolved to the local model first (that's the Ollama-first design). Pin it: add `--model claude-opus-4-8` to force Claude. To confirm the key is even visible to the process, run `echo ${ANTHROPIC_API_KEY:+set}` and look for `set`.

### `401` or `authentication` errors from Claude
The key is missing, expired, or wrong for your gateway. If you set `ANTHROPIC_BASE_URL`, the token must be whatever that gateway expects, not necessarily a raw Anthropic key. Unset the base URL temporarily (`unset ANTHROPIC_BASE_URL`) and retry against Anthropic directly to isolate whether it's the model or the proxy.

### `--record` fails to produce a video
Recording uses bundled ffmpeg. In a stripped-down container, the encoder can still fail to initialize. Drop `--record` to confirm the flow itself passes, then check that the bundled binary is executable in your environment. The screenshot usually still lands even when the `.webm` encode chokes.

### The run returns `TIMEOUT` on a long flow
Multi-step objectives — login, navigate, add to cart, checkout — take time, and Claude reasons before each action. Raise the budget with `--timeout 180` (seconds). If it still times out, your objective is probably too broad for one run; split it into two markdown test steps so each leg has room to breathe.

## When to use this

Reach for the Claude + `builtin` combo when your flows are long and stateful and you need a model that holds context across many steps — checkout journeys, multi-page wizards, dashboards behind a login. It's the capable-hosted-model end of the spectrum; the honest tradeoff is that a hosted model has a per-token cost, whereas a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) on Ollama runs at exactly $0. Small local models (8B and under) get flaky on long objectives, so match the model to the difficulty of the flow.

Where to go next:

- [BrowserBash tutorials](https://browserbash.com/tutorials) — the full hands-on library, including the free local-model path.
- [Learn](https://browserbash.com/learn) — concepts behind agentic browser automation, engines, and providers.
- [Case studies](https://browserbash.com/case-study) — real flows teams have automated end to end.
- [The blog](https://browserbash.com/blog) — deeper dives on NDJSON, CI gating, and recording.

## FAQ

### How do I make BrowserBash use Claude instead of a local model?
Export your `ANTHROPIC_API_KEY` and pass `--model claude-opus-4-8` on the run command. BrowserBash defaults to an Ollama-first `auto` resolution, so if a local model is installed you must pin Claude explicitly to override it. Pinning the model also makes your runs reproducible across machines.

### What is the difference between the builtin and stagehand engines?
The `stagehand` engine is the default, an MIT project by Browserbase that exposes act, extract, observe, and agent primitives with self-healing. The `builtin` engine is an in-repo Anthropic tool-use loop that drives Playwright directly and is auto-selected for LambdaTest and BrowserStack. For Claude-native automation the builtin engine is the tightest fit and adds a Playwright trace when you record.

### Can I route Claude through a company gateway or proxy?
Yes. Set `ANTHROPIC_BASE_URL` to your Anthropic-compatible gateway and keep using `--model claude-opus-4-8` exactly as before. BrowserBash forwards the model id and your `ANTHROPIC_API_KEY` through unchanged, so the gateway stays transparent to the CLI and you keep a single landing zone for model spend.

### Does running Claude through BrowserBash send my data to the cloud dashboard?
No, not by default. Runs are stored locally at `~/.browserbash/runs` and the dashboard at localhost:4477 is fully local. Data only reaches the optional cloud dashboard if you run `browserbash connect` and then add `--upload` to a specific run, and even then free cloud runs are kept for just 15 days.

## Get started

That's the whole loop: install once, set your key, pin Claude, and drive a real browser with plain English.

```bash
npm install -g browserbash-cli
```

No account is required to run anything in this tutorial — but if you want the optional cloud dashboard and team features, [sign up here](https://browserbash.com/sign-up). Now go point Claude at a flow that's been annoying your team and watch it click through.
