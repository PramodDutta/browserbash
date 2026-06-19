---
title: Running a self-hosted browser agent
description: "How to run a self-hosted browser agent that drives a real Chrome locally with no cloud, no API keys, and a $0 model bill using local Ollama models."
date: 2026-04-10
category: agents
---

Most "AI browser agent" demos quietly route your pages, your form values, and your screenshots through someone else's servers. A self-hosted browser agent flips that: the model runs on your machine, the browser runs on your machine, and nothing about the run leaves your laptop unless you explicitly push it. That matters when you are automating an internal admin panel, a staging environment behind a VPN, or any flow that touches real customer data. This guide walks through what "self-hosted" actually means for a browser agent, where the line between local and cloud really sits, and how to stand one up with BrowserBash using a local Ollama model so your model bill stays at exactly zero.

I have run a lot of these setups, both the kind that phone home and the kind that do not. The honest version is more interesting than the marketing version, so this article is going to be specific about what works, what is flaky, and when you genuinely should reach for a hosted model instead of pretending local is always better.

## What "self-hosted browser agent" actually means

The phrase gets thrown around loosely, so let me pin down the parts. A browser agent has three moving pieces, and each one can independently live on your machine or on someone else's:

1. **The reasoning layer (the LLM).** Something has to read the page and decide "click the login button, then type the email." That is a language model. It can be a local model served by Ollama on your own hardware, or a hosted API like Claude or GPT.
2. **The browser.** The actual Chrome or Chromium process that loads URLs, renders the DOM, and executes clicks. It can run on your laptop, or in a remote cloud browser farm.
3. **The orchestration and storage.** The thing that turns your English objective into steps, keeps a run history, and optionally shows a dashboard.

A truly self-hosted browser agent keeps all three local. The model infers on your CPU or GPU, the browser is your own Chrome, and the run record sits on your disk. No keys, no accounts, no per-token billing, no network egress for the automation itself. That is the configuration this article is about, and it is the default behavior in BrowserBash, the free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy.

The distinction matters because plenty of tools call themselves "local" while still sending every page snapshot to a hosted model. If the LLM is remote, your DOM and any values it reads are leaving the building. For a lot of teams that is fine. For some — healthcare, fintech, anything under a strict data residency policy — it is a hard no. Self-hosting the whole stack is how you make that a non-issue.

## Why run the agent on your own machine

There are four reasons that come up again and again, and they are not all about privacy.

**Data never leaves your machine.** This is the headline. On a local model, the page content, the screenshots, the extracted values, and the objective text all stay on your disk. There is no third party in the loop to log, train on, or leak your data. If you are driving an internal tool that shows real user records, this is the difference between "allowed" and "not allowed" in a lot of compliance reviews.

**A guaranteed $0 model bill.** Hosted LLM APIs charge per token, and a multi-step browser run burns a surprising number of tokens because the agent re-reads the page state on every step. Run a regression suite a few hundred times a day and that adds up. A local model on hardware you already own costs nothing per run. The marginal cost of the thousandth run is the same as the first: zero.

**Offline and air-gapped capability.** If your CI runner or your dev box has no outbound internet — common in regulated environments — a hosted model is simply unavailable. A local model keeps working. The browser still needs to reach whatever site you are testing, but the reasoning layer has no external dependency.

**No account, no signup friction.** You install the CLI, you point it at a local model, you run. There is no key to provision, no project to create, no rate limit tied to a billing tier. For a quick "does this checkout flow still work" check, that frictionlessness is the whole appeal.

If you want the broader picture of how natural-language agents drive browsers, the [BrowserBash features page](https://browserbash.com/features) lays out the primitives, and the [learn hub](https://browserbash.com/learn) covers the concepts behind agentic automation.

## The honest caveat: local models are not magic

I am not going to sell you a fantasy. Here is the part most "run it locally" posts skip.

Very small local models — anything in the 7B-to-8B parameter range — are genuinely flaky on long, multi-step browser objectives. They will nail a three-step flow and then completely lose the plot on step nine of a checkout, hallucinate a button that does not exist, or get stuck in a click loop. The accessibility tree of a real page is large and noisy, and small models do not have the working memory to hold an eleven-step plan while parsing a thousand-node DOM snapshot on every turn.

The sweet spot for a self-hosted browser agent is a **mid-size local model** — think Qwen3 or a Llama 3.3 70B-class model. Those have enough reasoning headroom to stay coherent across a long flow. The cost is hardware: a 70B-class model wants a serious GPU or a lot of unified memory. If you have an Apple Silicon machine with 64GB or a workstation with a 24GB+ GPU, you are in business. If you are on a thin laptop, you will be running an 8B model, and you should keep your objectives short and verify the results.

The practical rule I use:

- **Short, deterministic flows (1–5 steps):** a small local model is usually fine.
- **Long or branchy flows (8+ steps, conditional logic):** use a mid-size local model, or accept a hosted model for that particular run.
- **Hard, fragile flows (multi-page checkout, dynamic SPAs, CAPTCHAs in the path):** a capable hosted model still wins on reliability, full stop.

Being able to switch between these without changing your tooling is the real win, and it is what makes the local-first approach practical instead of dogmatic.

## How BrowserBash does local-first

BrowserBash is Ollama-first by design. Install it globally and the default configuration tries to stay on your machine before it ever considers the cloud.

```bash
npm install -g browserbash-cli
browserbash run "go to example.com and confirm the page title contains Example"
```

You need Node 18 or newer and Chrome installed for the local provider. The command is `browserbash`, the latest version is 1.3.1, and that is the entire setup.

The model resolution is the interesting part. The default `--model` is `auto`, and `auto` resolves in a specific, local-first order:

1. **Local Ollama first.** If BrowserBash detects a running Ollama instance, it uses `ollama/<model>`. Free, no keys, nothing leaves your machine.
2. **`ANTHROPIC_API_KEY` next.** If you have that environment variable set and no local Ollama, it falls back to `claude-opus-4-8`.
3. **`OPENAI_API_KEY` after that.** Falls back to `openai/gpt-4.1`.
4. **Otherwise it errors** with guidance instead of silently doing something you did not intend.

So if you have Ollama running, the default already keeps you fully local. There is no flag to remember. On local models, your model bill is guaranteed $0 because the inference happens on your own silicon.

### Pinning a specific local model

`auto` is convenient, but for repeatable runs you usually want to pin the exact model so behavior does not drift if your environment changes. You do that with `--model`:

```bash
browserbash run "log in with the test account and verify the dashboard greeting" \
  --model ollama/qwen3 \
  --headless \
  --timeout 120
```

You can also set `OLLAMA_MODEL` and `OLLAMA_BASE_URL` in the environment if your Ollama instance is not on the default host. That is handy when Ollama runs on a beefier box on your LAN and your CLI runs on a thin client — the reasoning is still on hardware you control, which is what self-hosted means in practice.

If you want a mid-size model without the local hardware, there is a middle path: OpenRouter. `--model openrouter/meta-llama/llama-3.3-70b-instruct` (with `OPENROUTER_API_KEY`) gets you a 70B-class model through a hosted gateway. That is not local — data leaves your machine — but it keeps you off the biggest proprietary APIs while giving you the reasoning headroom small local models lack. I mention it for completeness; if your goal is strict locality, stick with Ollama.

## Keeping the browser local too

The model is only half the privacy story. The browser is where the page content actually lives, and BrowserBash defaults to running it locally.

The `--provider` flag controls where the browser runs. The default is `local`, which drives your own installed Chrome. The other providers — `cdp`, `browserbase`, `lambdatest`, `browserstack` — point the agent at a remote browser, which means the pages you load render on someone else's infrastructure. For a self-hosted setup, you want `local` (the default), and you simply do not pass any of the cloud provider flags.

There is a nuance worth calling out. The `cdp` provider connects to "any DevTools endpoint" via `--cdp-endpoint ws://...`. That endpoint can be a Chrome you launched yourself on your own network, which keeps things local, or it can be a remote grid, which does not. CDP is local only if the endpoint you point it at is local. Read the URL before you assume.

Here is the fully self-hosted shape: local Ollama model, local Chrome, nothing uploaded.

```bash
browserbash run "open the staging admin panel, search for order 4471, and report its status" \
  --provider local \
  --model ollama/qwen3 \
  --record
```

The `--record` flag captures a screenshot and a `.webm` session video using bundled ffmpeg, written to disk. With the builtin engine it also writes a Playwright trace. All of that lands in your local run store and never goes anywhere unless you ask it to.

## What stays on disk vs. what leaves

This is the table I wish every "local AI" tool published. Here is exactly where data goes in each BrowserBash configuration.

| Configuration | Reasoning runs on | Browser runs on | Data leaves your machine? | Model bill |
|---|---|---|---|---|
| Local Ollama + local provider (default) | Your hardware | Your Chrome | No | $0 |
| Local Ollama + `--record` (no `--upload`) | Your hardware | Your Chrome | No (artifacts saved to disk) | $0 |
| Local Ollama + `--upload` after `connect` | Your hardware | Your Chrome | Yes (run pushed to cloud, opt-in) | $0 |
| Hosted model (Claude/GPT) + local provider | Vendor API | Your Chrome | Yes (page content to model) | Per token |
| Any model + `browserbase`/`lambdatest`/`browserstack` | Depends | Cloud grid | Yes (pages render remotely) | Per token / grid cost |

The default row is the one that matters for this article. Local model, local browser, no upload: a closed loop on your own machine.

Two opt-in escape hatches exist, and both are explicit. The cloud dashboard requires `browserbash connect --key bb_...` to link an account, and then `--upload` on each run to actually push that run. Without `--upload`, nothing leaves your machine even if you have connected. Free cloud runs are kept for 15 days. The local dashboard, by contrast, needs none of that.

### The fully local dashboard

You do not have to give up a UI to stay local. BrowserBash ships a free local dashboard:

```bash
browserbash dashboard
```

That serves a dashboard at `localhost:4477`, fully local — no account, no upload, nothing in the cloud. You can also pass `--dashboard` on a `run` to open it for that specific run, or `--clear` to wipe the local store. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200 runs), so you have a persistent local history without any cloud service in the loop. The [tutorials](https://browserbash.com/tutorials) walk through reading those run records step by step.

## Choosing an engine for local runs

BrowserBash has two engines — the layer that actually interprets your English and decides what to do — and the choice interacts with your local setup.

**Stagehand** is the default. It is MIT-licensed, built by Browserbase, and exposes act / extract / observe / agent primitives with self-healing behavior when the page shifts under it. For most local runs on a capable model, Stagehand is the one you want.

**Builtin** is an in-repo Anthropic tool-use loop driving Playwright. It is automatically used for LambdaTest and BrowserStack providers. You can also select it explicitly with `--engine builtin`, and it has a nice property for debugging: it writes a Playwright trace when you `--record`.

```bash
browserbash run "add the first product to the cart and verify the cart count is 1" \
  --engine stagehand \
  --model ollama/qwen3
```

Both engines work with local models. The thing to keep in mind is the caveat from earlier: whichever engine you pick, a small local model is still a small local model. The engine makes the orchestration smarter and more resilient, but it cannot give an 8B model the reasoning capacity of a 70B model. Match your engine choice to your model, and match your model to the difficulty of the flow.

## A realistic local workflow

Let me sketch how I actually use a self-hosted setup day to day, because the commands above are pieces and you want the assembly.

For ad-hoc checks, I run one-shot objectives against a local model and read the verdict in the terminal. "Does login still work," "is the pricing page showing the right tiers," that kind of thing. Fast, free, local.

For anything I want to keep and re-run, I write a markdown test. BrowserBash's `testmd` command runs `*_test.md` files where each list item is a step. These are committable, they support `{{variables}}` templating and `@import` composition, and — this is the important bit for local-first teams — variables you mark as secret are masked as `*****` in every log line. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md --model ollama/qwen3
```

Because the test file lives in your repo and the model runs locally, the entire loop is auditable and self-contained. Your test definition is in git, your run history is in `~/.browserbash/runs`, your secrets are masked, and no page content ever touched a third party. That is a genuinely tidy story for a security-conscious team.

For CI, I switch on `--agent`, which emits NDJSON — one JSON object per line — so a pipeline or an AI coding agent can parse progress and results without scraping prose. Step events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}` and the terminal event is a `run_end` with a status and a `final_state`. Exit codes are clean: 0 passed, 1 failed, 2 error, 3 timeout. You can wire that into a self-hosted runner with a local model and have a fully air-gapped verification stage. If you are building CI around this, the [blog](https://browserbash.com/blog) has deeper pipeline write-ups.

## When self-hosted is the right call — and when it is not

I promised a balanced decision section, so here it is without spin.

**Choose a fully self-hosted browser agent when:**

- You are automating flows that touch sensitive data — internal admin tools, customer records, anything under a data residency or compliance regime.
- You run automation at high volume and want the per-run cost to be zero.
- Your environment is air-gapped or has restricted egress, so a hosted model is not even reachable.
- Your flows are short to medium length and you have at least a mid-size local model, or you are willing to keep objectives tight on a small one.
- You want zero signup friction and no account to manage.

**Reach for a hosted model (still with a local browser) when:**

- The flow is long, branchy, or fragile — multi-page checkouts, heavy SPAs, conditional logic that a small local model will fumble.
- You do not have the hardware to run a 70B-class model and reliability matters more than locality for this particular task.
- You need the highest possible success rate on a flaky flow and can accept that page content goes to the model vendor.

**Reach for a cloud browser provider when:**

- You need cross-browser or real-device coverage that your single local Chrome cannot give you (that is where `lambdatest` and `browserstack` earn their keep).
- You need to run many browsers in parallel beyond what your machine can host.

The good news is that switching between these is a flag change, not a rewrite. You can keep your objectives and your markdown tests identical and move the model from `ollama/qwen3` to `claude-opus-4-8`, or move the browser from `local` to `browserstack`, depending on the run. That flexibility is what makes "local-first" a pragmatic default rather than a constraint. The [pricing page](https://browserbash.com/pricing) lays out where the optional cloud pieces sit, and the [case study](https://browserbash.com/case-study) shows a real flow end to end.

## Hardware and setup notes for the local model

A few practical things I have learned getting Ollama into a good place for browser work.

Pick a model that fits your memory with room to spare for the context. A browser agent feeds large page snapshots into the model on every step, so the effective context usage is higher than a chat workload. If you are memory-constrained, a model that nominally fits may still thrash once you load a big DOM. Leave headroom.

Quantization is your friend on consumer hardware. A 4-bit quantized 70B model is dramatically more runnable than a full-precision one and, for browser-driving tasks, the quality drop is usually acceptable. Test it on your real flows before deciding.

Keep Ollama warm. The first inference after a cold start loads the model into memory and is slow; subsequent steps are fast. For a multi-step browser run that is fine because the model stays resident across steps, but if you are running many short one-shot commands in a row, a cold model on each one will feel sluggish. A simple keep-alive solves it.

And set a realistic `--timeout`. Local models are slower per token than hosted APIs, so a flow that finishes in 30 seconds on Claude might take two or three minutes on a local 70B model. The default may be too tight for a long local run; bump it with `--timeout <seconds>` so the agent is not cut off mid-flow. There is nothing more annoying than a timeout at step ten of eleven because the model was thinking carefully.

## FAQ

### Can I run a browser agent fully offline with no API keys?

Yes. With a local Ollama model and the default local browser provider, BrowserBash needs no API keys and makes no calls to any LLM vendor. The reasoning runs on your hardware and the browser is your own Chrome. The only network the agent needs is to reach the website you are automating; if that site is also internal, the whole thing works on an air-gapped network. Your model bill in this configuration is guaranteed $0.

### Is a local model good enough to drive a real browser?

It depends on the flow and the model size. Small local models in the 7B-to-8B range handle short, deterministic flows fine but get flaky on long multi-step objectives. A mid-size model in the Qwen3 or Llama 3.3 70B class is the sweet spot and stays coherent across longer flows, at the cost of needing serious hardware. For genuinely hard or fragile flows, a capable hosted model is still more reliable, and BrowserBash lets you switch with a single flag.

### What data leaves my machine when I run a self-hosted browser agent?

In the default local configuration — local Ollama model and local browser — nothing leaves your machine. Page content, screenshots, extracted values, and run records all stay on disk at `~/.browserbash/runs`. Data only leaves if you explicitly opt in by running `browserbash connect` and then passing `--upload` on a run, or if you choose a hosted model or a cloud browser provider. Without those choices, the loop is fully closed on your own hardware.

### Do I need an account to use BrowserBash locally?

No. You install it with `npm install -g browserbash-cli`, point it at a local Ollama model, and run. There is no signup, no key, and no rate limit tied to a billing tier. The optional local dashboard at `localhost:4477` also needs no account. An account is only relevant if you want the optional cloud dashboard, which is opt-in and keeps free runs for 15 days.

Self-hosting a browser agent is no longer an exotic setup. With a local model and your own Chrome, you get privacy, a $0 model bill, and offline capability without giving up the plain-English workflow. Start with `npm install -g browserbash-cli`, point it at Ollama, and keep your runs on your own machine. An account is optional — grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up) only if you later want the cloud dashboard.
