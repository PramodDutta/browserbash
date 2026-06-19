---
title: Cloud browsers with BrowserBash and Browserbase
description: "A hands-on browserbase cli tutorial: set your keys, run with --provider browserbase, and learn exactly when cloud browsers beat local Chrome."
date: 2026-01-30
category: tutorial
---

By the end of this browserbase cli tutorial you'll be running the exact same plain-English objectives you run on your laptop, except the browser lives in Browserbase's cloud instead of on your machine. You'll set two API keys, add one flag — `--provider browserbase` — and watch the BrowserBash agent drive a remote, headless Chromium session through a real flow, then hand back a verdict and structured values. No selectors, no page objects, no SDK rewrite. Same objective, different location for the browser.

This is a teach-by-doing lesson. We'll install the CLI, run a first objective locally so you have a baseline, wire up Browserbase credentials, flip a single run into the cloud, then talk honestly about *when* cloud browsers actually beat local Chrome — and when they don't. Every command here is real and runnable against [BrowserBash](https://browserbash.com) 1.3.1. BrowserBash is free, open-source (Apache-2.0), and built by The Testing Academy; Browserbase is the paid cloud-browser service we'll point it at.

## What you'll need

A few things before we start. Don't skip the version check — Node 18 is a hard floor.

- **Node.js >= 18.** Check with `node -v`. If you're below 18, upgrade first; the CLI won't install cleanly otherwise.
- **A terminal** you're comfortable in (macOS, Linux, or WSL on Windows all work).
- **The CLI installed globally.** One command:

```bash
npm install -g browserbash-cli
```

- **A model backend.** BrowserBash defaults to `auto`, which prefers a local [Ollama](https://browserbash.com/learn) model (free, no keys, nothing leaves your machine), then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. For the cloud-browser runs in this lesson I'll lean on a capable model, because remote multi-step flows are exactly where a flaky tiny model will burn your money. More on that below.
- **A Browserbase account.** You need two values from your Browserbase dashboard: an **API key** and a **project ID**. They go in `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. No Browserbase account is needed to *install* BrowserBash or run locally — only for the `browserbase` provider sections.

Note the split: **Chrome** is only required for the default `local` provider. When you switch to `--provider browserbase`, the browser runs in Browserbase's data center, so you do *not* need Chrome installed locally for those runs. That's part of the appeal.

## Step 1 — Confirm a clean local baseline

Before you go to the cloud, prove the agent works on your machine. This separates "my objective is wrong" from "my cloud keys are wrong" later — debugging both at once is misery.

```bash
browserbash run "go to example.com and tell me the main heading text"
```

You'll see the agent narrate a few steps — navigate, read the page, extract — and finish with a plain-English verdict plus the extracted value (the heading "Example Domain"). If you're on the Ollama path, the run is free and fully on-device. If `auto` resolved to a hosted key, you'll see that reflected in the startup line.

If this fails, fix it now. The most common cause is no model backend resolving at all, in which case BrowserBash prints guidance telling you to either start Ollama or set an API key. Sort that before moving on.

### Pin a model so cloud runs are predictable

For the cloud sections I recommend pinning a capable model with `--model` rather than trusting `auto`. Remote sessions cost real money (Browserbase bills by session/minute), so you don't want a flaky local 7B model wandering for ten minutes. A solid option is Claude if you have an Anthropic key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
browserbash run "go to example.com and report the heading" --model claude-opus-4-8
```

We'll carry a pinned model into the Browserbase runs. The honest reason: small local models (8B and under) are genuinely unreliable on long multi-step objectives, and "long multi-step on a metered cloud browser" is the worst place to discover that. The sweet spot is a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a capable hosted model.

## Step 2 — Get your Browserbase keys and export them

Log into Browserbase, grab your **API key** and your **Project ID** from the dashboard, and export both. BrowserBash reads them from the environment — it never takes them as flags, which keeps secrets out of your shell history.

```bash
export BROWSERBASE_API_KEY="bb_live_xxxxxxxxxxxxxxxx"
export BROWSERBASE_PROJECT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Two quick sanity checks:

- Confirm they're actually set in *this* shell: `echo $BROWSERBASE_PROJECT_ID` should print the ID. New terminal tabs don't inherit exports unless they're in your shell profile.
- Don't paste these into a `_test.md` file or a CI YAML in plaintext. For CI, use your runner's secret store and inject them as env vars at job time.

If either variable is missing when you run `--provider browserbase`, BrowserBash will error out telling you which credential it needs. That's the intended behavior — it won't silently fall back to local and bill you a surprise.

## Step 3 — Run your first objective on a cloud browser

Now the payoff. Take the same objective and add `--provider browserbase`:

```bash
browserbash run "go to news.ycombinator.com and extract the titles of the top 5 stories" \
  --provider browserbase \
  --model claude-opus-4-8
```

Here's what changes versus local. BrowserBash asks Browserbase for a session, gets back a Chrome DevTools Protocol endpoint, and connects the [Stagehand](https://browserbash.com/features) engine (the default) to that remote browser over the wire. The agent then acts/extracts/observes exactly as it would locally. You'll see the same step narration in your terminal, then a verdict like "Passed — extracted 5 story titles" with the titles in the structured output. The difference is invisible in the transcript and total in the infrastructure: that browser ran in Browserbase, not on your laptop.

A few things worth knowing about this run:

- **Headless is implicit.** Cloud sessions are headless by nature; there's no window to watch on your machine. The `--headless` flag is about the *local* provider — on Browserbase you simply don't get a visible window.
- **The agent connects over CDP under the hood.** Browserbase is, mechanically, a managed CDP endpoint. If you ever wanted to point at a *different* DevTools endpoint (a self-hosted grid, a different vendor), that's what the `cdp` provider and `--cdp-endpoint ws://...` are for. `browserbase` is the convenience path that handles session creation for you from your two env vars.
- **The engine and model are independent of the provider.** Switching to the cloud doesn't change who interprets your English (still Stagehand by default) or which LLM reasons about the page (still whatever you pinned with `--model`). Only the browser's *location* moved. That orthogonality is the whole design: you mix and match where the browser runs, which engine drives it, and which model thinks, without any one choice forcing the others.

Run the same objective twice — once with no provider flag, once with `--provider browserbase` — and diff the verdicts. They should agree. If they don't, you've found a real environmental difference between your laptop and the cloud IP (a login wall, a geo banner), and that's exactly the kind of bug cloud runs are good at surfacing early.

### Add recording so you can see what happened

On a remote run you can't lean over and watch the window, so capture artifacts instead:

```bash
browserbash run "log in to the staging app and confirm the dashboard loads" \
  --provider browserbase \
  --model claude-opus-4-8 \
  --record
```

`--record` writes a screenshot plus a `.webm` session video using BrowserBash's bundled ffmpeg. (If you also switch to the `builtin` engine, that path additionally writes a Playwright trace you can open in the trace viewer.) For cloud runs this is the difference between "it failed and I have no idea why" and a video you can scrub.

## Step 4 — The providers and the flags that matter

`--provider` decides *where the browser runs*. It's orthogonal to the engine (who interprets your English) and the model (the LLM backend). Here's the full provider surface so you can see where Browserbase sits:

| `--provider` value | Where the browser runs | Credentials needed |
| --- | --- | --- |
| `local` (default) | Your own Chrome | None |
| `cdp` | Any DevTools endpoint via `--cdp-endpoint ws://...` | Depends on the endpoint |
| `browserbase` | Browserbase cloud Chromium | `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` |
| `lambdatest` | LambdaTest cloud grid (auto `builtin` engine) | `LT_USERNAME` + `LT_ACCESS_KEY` |
| `browserstack` | BrowserStack cloud grid (auto `builtin` engine) | `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` |

And the flags you'll actually reach for on a Browserbase run:

| Flag | What it does |
| --- | --- |
| `--provider browserbase` | Runs the browser on Browserbase instead of local Chrome |
| `--engine stagehand\|builtin` | Picks who interprets the English; `stagehand` is the default |
| `--model <id>` | Pins the LLM backend (e.g. `claude-opus-4-8`, `ollama/qwen3`) |
| `--timeout <seconds>` | Caps the whole run — important for metered cloud sessions |
| `--record` | Screenshot + `.webm` video (builtin engine also writes a Playwright trace) |
| `--agent` | Emits NDJSON, one JSON object per line, for CI and AI agents |
| `--upload` | Pushes this run to the cloud dashboard (requires `connect`; off by default) |

Two notes. First, `lambdatest` and `browserstack` force the `builtin` engine automatically — but `browserbase` does **not**, so you keep Stagehand's self-healing act/extract/observe primitives, which is usually what you want for cloud web flows. Second, set a `--timeout` on cloud runs. A runaway agent on a metered session is a billing event; a timeout makes it a bounded one.

## Step 5 — Wire a Browserbase run into CI with NDJSON

The reason to put cloud browsers in CI is concurrency and a clean environment, not having to babysit a window. Use `--agent` so your pipeline parses machine output instead of scraping prose:

```bash
browserbash run "complete the signup flow with a throwaway email and verify the welcome screen" \
  --provider browserbase \
  --model claude-opus-4-8 \
  --timeout 180 \
  --agent
```

With `--agent`, every line of stdout is a JSON object. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal object such as `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. Exit codes map cleanly: **0** passed, **1** failed, **2** error, **3** timeout. Your CI step can branch on the exit code and, if it wants detail, read the last NDJSON line. No regex over human prose, ever.

For a repeatable suite, commit a markdown test instead of a long inline string. A `*_test.md` file is one step per list item, supports `{{variables}}` templating and `@import` composition, masks any secret-marked variable as `*****` in every log line, and writes a human-readable `Result.md` after each run:

```bash
browserbash testmd run ./checkout_test.md --provider browserbase --model claude-opus-4-8
```

That's the same provider flag, applied to a committable test file. Your Browserbase credentials still come from the environment — never hard-code them in the markdown.

## Step 6 — Optional: see the run in a dashboard

Every run is already saved on-disk at `~/.browserbash/runs` (secrets masked, capped at 200), so you have a local history for free. To browse it visually, spin up the fully-local dashboard:

```bash
browserbash dashboard
```

That serves a local UI at `localhost:4477` — no account, nothing uploaded. If you want a shareable cloud view of a specific run, that's opt-in and separate: link once with `browserbash connect --key bb_...`, then add `--upload` to the run you want to push. Without `--upload`, nothing leaves your machine. Free cloud runs are kept 15 days. Don't confuse this local `localhost:4477` dashboard with Browserbase the browser provider — they're unrelated.

## Troubleshooting

Real failure modes you'll actually hit, and how to clear them.

**"Missing BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID."** You either didn't export both variables or you're in a fresh shell that didn't inherit them. Re-run the exports from Step 2 in the *current* terminal, confirm with `echo $BROWSERBASE_PROJECT_ID`, and only then re-run. In CI, make sure both are injected as job-level secrets, not just defined in a different stage.

**The agent wanders or stalls on a cloud session.** This is almost always a too-small model, not Browserbase. Local models at 8B and under are flaky on long, multi-step objectives — and a metered cloud browser is the most expensive place to learn that. Pin a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a capable hosted model with `--model`, and cap the run with `--timeout` so a confused agent can't run up a bill.

**`--record` produces no video.** The `.webm` capture uses BrowserBash's bundled ffmpeg; if recording silently no-ops, your environment likely shadowed it with a broken system ffmpeg or a sandbox blocked it. The screenshot should still land. Re-run without other PATH overrides, or switch to the `builtin` engine and read the Playwright trace it writes instead.

**Runs time out at the cloud boundary.** Remote sessions add network latency and have their own session limits. If you see `status:"timeout"` (exit code 3), raise `--timeout` to give the flow headroom, and tighten the objective — "log in and verify the dashboard heading" beats a vague "test the app." A crisp objective finishes in fewer steps, which matters more on a remote browser.

**It worked locally but fails on Browserbase.** Usually environmental: the cloud IP hits a bot wall, a geo-redirect, or a login that's allow-listed only for your office network. Reproduce with `--record` on the cloud run and watch the video — you'll often see a Cloudflare challenge or a region banner the local run never showed.

## When to use this — and what's next

Cloud browsers earn their cost in specific situations: **CI without a display server**, where there's no GUI Chrome to drive; **parallelism**, where you want many sessions at once without melting one laptop; **clean-room runs**, where you need a fresh, uncontaminated browser every time; and **geo or IP diversity** you can't get from your own machine. If you're iterating on a single flow on your own laptop, the default `local` provider is faster to debug and costs nothing — stay there until one of those reasons applies.

From here, branch out:

- [BrowserBash tutorials](https://browserbash.com/tutorials) — the companion deep-dives, including parallel cloud runs.
- [The Learn hub](https://browserbash.com/learn) — pick the right model backend so cloud runs don't waste money.
- The [BrowserBash blog](https://browserbash.com/blog) for CI recipes, and [features](https://browserbash.com/features) for the full engine/provider matrix.

## FAQ

### What is the difference between BrowserBash and Browserbase?

BrowserBash is a free, open-source command-line tool that drives a browser from plain-English objectives using an AI agent. Browserbase is a paid cloud service that hosts headless Chromium sessions. They are complementary: you use BrowserBash as the driver and add the provider flag to make it drive a browser that runs in Browserbase's cloud instead of on your own machine.

### Do I need a Browserbase account to use BrowserBash?

No. BrowserBash installs and runs entirely on your machine with the default local provider, and on the Ollama model path it needs no keys or accounts at all. A Browserbase account, an API key, and a project ID are only required when you specifically choose the browserbase provider to run the browser in their cloud.

### What credentials does the browserbase provider need?

Two environment variables: BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID, both copied from your Browserbase dashboard. BrowserBash reads them from the environment rather than from command-line flags, which keeps the secrets out of your shell history. If either is missing, the run stops with an error naming the credential it needs.

### When should I use a cloud browser instead of local Chrome?

Reach for the cloud when you need parallelism, a clean fresh browser every run, CI with no display server, or IP and geo diversity you can't get locally. For everyday iteration on a single flow, the default local provider is faster to debug and costs nothing, so stay local until one of those specific needs shows up.

## Ready to run cloud browsers?

Install the CLI and point it wherever you need:

```bash
npm install -g browserbash-cli
```

An account is optional — you can run everything in this tutorial without one. When you want the shareable cloud dashboard, [sign up here](https://browserbash.com/sign-up).
