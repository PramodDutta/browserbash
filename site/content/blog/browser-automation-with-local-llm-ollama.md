---
title: Run Browser Automation With a Local LLM via Ollama
description: "A practical guide to browser automation local LLM Ollama setups: drive real Chrome with a private, zero-API-cost model using BrowserBash."
date: 2026-02-13
category: llm
---

Most AI browser tools assume you are fine shipping every page you touch to a cloud model. That is the default for a reason — hosted frontier models are smart and convenient — but it is not the only path. If you want browser automation local LLM Ollama style, where a model running entirely on your own machine reads the page, decides what to click, and types into the form, you can have it today. Nothing leaves your laptop, there is no API key, and the model bill is exactly zero. This guide walks through how that actually works with BrowserBash, where it shines, and the honest limits you need to plan around before you bet a CI pipeline on a 7B model.

I have spent enough time wiring local models into agent loops to know the gap between the demo and the daily driver. A clean signup flow on a tidy marketing site is one thing. A six-step checkout with a flaky third-party iframe is another. So this is not a hype piece. It is a working setup plus the trade-offs, written for an SDET or platform engineer deciding whether local-model browser automation belongs in their stack.

## Why run browser automation on a local LLM at all

There are three reasons people reach for a local model to drive a browser, and they tend to arrive in this order.

**Privacy and data residency.** When an AI agent automates a browser, the model sees whatever the page shows: account dashboards, customer records, internal admin tools, half-filled forms with real PII. Send that to a hosted API and you have to reason about data processing agreements, retention, and which jurisdiction the inference happened in. Run the model locally and the question evaporates. The page content, the screenshots, the extracted values — they stay on the machine. For teams in healthcare, fintech, or anything under a strict data-handling policy, this is not a nice-to-have. It is the thing that makes automation legally usable at all.

**Zero marginal cost.** Hosted models charge per token, and an agent that drives a browser is token-hungry — every step feeds page state back into the model. Run a few hundred automation runs a day and the bill is real. A local model on hardware you already own costs nothing per run. You pay once for the GPU (or you already have an Apple Silicon laptop that does fine), and every run after that is free. For high-volume, repetitive automation — smoke checks every fifteen minutes, scraping the same dashboards hourly — the economics flip hard toward local.

**Air-gapped and offline.** Some environments simply cannot call out to the public internet for inference. A model that runs against `localhost:11434` works behind a corporate firewall, on a locked-down build agent, or on a plane.

Ollama is the piece that makes this approachable. It is a lightweight local runtime for open-weight models — pull a model once, and it serves an HTTP endpoint on your machine that tools can talk to. You do not manage CUDA flags or quantization by hand for the common path. You run `ollama pull qwen3` and you have an inference server.

## How BrowserBash drives a browser with a local model

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it once and you write objectives in plain English; an AI agent drives a real Chrome step by step — no selectors, no page objects — and returns a verdict plus the structured values it pulled out.

The part that matters for this article: BrowserBash is Ollama-first by design. The default model is `auto`, and the resolution order puts your local model at the top.

1. If a local Ollama server is reachable, it uses `ollama/<model>` — free, no keys.
2. Otherwise, if `ANTHROPIC_API_KEY` is set, it uses `claude-opus-4-8`.
3. Otherwise, if `OPENAI_API_KEY` is set, it uses `openai/gpt-4.1`.
4. Otherwise it errors with guidance on what to set.

So if you have Ollama running, you get local-model automation automatically — you do not have to ask for it. That is a deliberate stance, and it is unusual. Many AI browser tools assume cloud first and treat local as an afterthought you bolt on. BrowserBash inverts that: local is the default, cloud is the fallback when you explicitly hand it a key.

Under the hood, two things are separable, and keeping them separate is the key to understanding the tool:

- The **engine** is who interprets your English and decides the next browser action. BrowserBash ships `stagehand` (the default, MIT-licensed, from Browserbase, with act/extract/observe primitives and self-healing) and `builtin` (an in-repo tool-use loop driving Playwright).
- The **LLM backend** is the model doing the reasoning. With `--model ollama/<model>` you point the engine at your local Ollama server.

That separation means you can run the same objective against a local Qwen model today and a hosted model tomorrow by changing one flag, with the rest of your command identical.

## Setup: from zero to a local-model run

Here is the full path. It assumes nothing beyond a machine that can run a mid-size model.

**1. Install Ollama and pull a model.** Grab Ollama from its site, then pull a model. For agent work you want something with solid instruction-following and tool-use behavior. A mid-size model is the sweet spot — more on sizing below.

```bash
ollama pull qwen3
ollama serve   # usually already running as a background service
```

By default Ollama listens on `http://localhost:11434`. BrowserBash will find it there.

**2. Install BrowserBash.** You need Node 18 or newer and Chrome installed (the local provider drives your real Chrome).

```bash
npm install -g browserbash-cli
browserbash --version   # should report 1.3.1 or newer
```

**3. Run an objective against the local model.** With Ollama up, `auto` already resolves to your local model. But pinning it explicitly is good practice so your command is reproducible:

```bash
browserbash run "Go to news.ycombinator.com, open the top story, \
  and tell me its title and points" \
  --model ollama/qwen3
```

What happens: BrowserBash launches your Chrome, the local model reads the page, decides to navigate and click, and at the end you get a verdict (passed or failed) plus the extracted values — the title and points in this case. No token meter ticked. No page content left the machine.

If your Ollama runs on a different host or port, or you want to force a specific model name, the `OLLAMA_BASE_URL` and `OLLAMA_MODEL` environment variables override the defaults. That is useful when Ollama lives on a beefier box on your LAN and you drive it from a laptop.

## A realistic objective, step by step

Let me make this concrete with something closer to real work than a Hacker News read. Say you want to confirm a staging signup flow still works, using a local model so test fixtures and any seeded PII never leave your network.

```bash
browserbash run "Open https://staging.example.com/signup, \
  fill the form with name 'Test User' and a random email, \
  submit it, and confirm the welcome message appears" \
  --model ollama/qwen3 \
  --record \
  --timeout 120
```

A few things worth calling out in that command:

- `--record` captures screenshots and a `.webm` session video via bundled ffmpeg, so you have a visual artifact even though everything ran locally. With the `builtin` engine it also writes a Playwright trace you can open later.
- `--timeout 120` caps the run at two minutes. Local models are slower per step than hosted frontier models, so giving multi-step flows a generous timeout matters more here than it does on the cloud path.
- There is no `--upload`. Without that flag, **nothing** is sent anywhere. The run is captured on disk and that is the end of it.

Every run, local or not, is kept on disk at `~/.browserbash/runs` with secrets masked, capped at the last 200. So you can come back and inspect what the local model actually did, frame by frame, without any cloud round-trip.

## The honest part: small models are flaky on long flows

I am not going to tell you a 7B model on your laptop matches a frontier model at driving a browser. It does not, and pretending otherwise sets you up to distrust the whole approach when it falls over.

Here is the real shape of it. Very small local models — roughly 8B parameters and under — are fine on short, well-scoped objectives. "Open this page and extract the price." "Click the cookie banner and tell me the headline." They handle that. Where they get flaky is **long, multi-step objectives**: a six-step checkout, a flow with conditional branches, anything where the model has to hold a plan across many turns and recover when the page does something unexpected. Small models lose the thread, repeat actions, or declare victory early.

The sweet spot for serious local automation is a **mid-size model** — think Qwen3 or a Llama 3.3 70B-class model. These have enough reasoning depth to stay on plan across many steps, and they still run on a single capable GPU or a high-memory Apple Silicon machine. If you have the hardware, this is where local-model browser automation goes from "neat demo" to "I trust this in a nightly job."

And there is a third honest option: for genuinely hard flows — long, branchy, high-stakes — a capable hosted model is still the better tool, and BrowserBash makes that a one-flag change. Local for privacy and volume, hosted for the gnarly cases, same CLI. That is the pragmatic posture, not a religious one.

A quick sizing guide:

| Model size | Good for | Watch out for |
| --- | --- | --- |
| ~3B–8B (local) | Single-page extracts, short clicks, quick checks | Loses the plan on long multi-step flows; declares success early |
| ~70B-class (local) | Multi-step flows, nightly smoke runs, privacy-sensitive automation | Needs real hardware (capable GPU or high-RAM Apple Silicon); slower per step |
| Hosted frontier (cloud) | Hardest flows, branchy logic, max reliability | Per-token cost; page content leaves your machine |

## Local-model browser automation versus the cloud-first crowd

The browser-automation space leans cloud. Worth understanding the landscape honestly so you pick what actually fits.

**browser-use** is a popular open-source Python library that drives a browser with an LLM, and it does support Ollama as a provider — you can point it at a local model and cut API costs. It is a capable, flexible library. The trade-off is that it is a Python library you script against, so you are writing and maintaining code, managing the async loop, and wiring the model yourself. If you want a programmable library inside a larger Python app, that is a genuine strength and may be the better fit. BrowserBash is a CLI: you type an English objective and get a verdict, with the Ollama wiring already done. Different altitude, different ergonomics.

**BrowserOS** is an open-source Chromium fork that runs agents natively in the browser and supports local models via Ollama. It is a browser product — great if you want an AI-driven browser you sit in front of. BrowserBash is a headless-capable CLI built for terminals, scripts, and CI, not a browser you drive by hand. If your need is an interactive AI browser, BrowserOS is squarely aimed at that; if your need is automation you can commit to a repo and run in a pipeline, the CLI shape fits better.

Here is the comparison I would actually want as a buyer. I have kept it to facts; where a project's internals are not something I can verify, I say so rather than guess.

| | BrowserBash (Ollama path) | browser-use (Ollama path) | Typical cloud-first AI browser tool |
| --- | --- | --- | --- |
| Interface | CLI: English objective in, verdict out | Python library you script | Varies; often hosted UI or SaaS API |
| Local model support | Default — `auto` resolves to Ollama first | Yes, Ollama is a supported provider | Often secondary or not offered |
| Data leaves machine on local run | No (unless you opt in with `--upload`) | No, when using a local model | Frequently yes by design |
| Model bill on local run | $0 | $0 | Per-token / subscription |
| Built for CI / agents | Yes — `--agent` NDJSON, exit codes | Possible, you build the harness | Varies |
| License | Apache-2.0, open source | Open source | Varies; often proprietary |

The point of that table is not that BrowserBash wins every row. It is that "local-first" is a real architectural choice, and tools differ on it. Many cloud-first tools are excellent at what they do; they are just not built for the case where the data cannot leave the building. Read more about [where BrowserBash fits](https://browserbash.com/features) before you commit either way.

## Wiring local-model runs into CI and coding agents

The reason a CLI beats a UI for this work is automation-of-the-automation. BrowserBash has an agent mode built for exactly that.

```bash
browserbash run "Log into the admin panel and verify the user count \
  is above 100" \
  --model ollama/qwen3 \
  --agent
```

The `--agent` flag emits NDJSON — one JSON object per line. You get progress events as the run unfolds:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"opened admin panel"}
```

and a terminal event at the end:

```
{"type":"run_end","status":"passed","summary":"user count 142 > 100","final_state":{...},"duration_ms":18402}
```

Exit codes map cleanly: `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, no scraping a log for "success." A CI step or an AI coding agent reads the JSON and the exit code and moves on. Because the model is local, this whole loop runs on a build agent with no outbound inference calls — which, for a lot of security-conscious shops, is the difference between "allowed" and "blocked."

If you prefer committable tests over one-shot commands, BrowserBash also has markdown tests. Each list item in a `*_test.md` file is a step, you template values with `{{variables}}`, secret-marked variables are masked as `*****` in every log line, and it writes a human-readable `Result.md` after each run. Point it at your local model the same way:

```bash
browserbash testmd run ./signup_test.md --model ollama/qwen3
```

That gives you version-controlled, English-readable browser tests that run against a private local model — the kind of thing you can put in front of an auditor. The [tutorials](https://browserbash.com/tutorials) walk through building these from scratch.

## Seeing what the local model did: the local dashboard

A real worry with any agent is "what did it actually do in there?" BrowserBash answers that without a cloud round-trip. Run the local dashboard:

```bash
browserbash dashboard
```

It serves a fully local dashboard at `localhost:4477` where you can browse past runs, watch the recorded video, and step through what the model decided at each turn. It is free, it needs no account, and it never phones home. If you want to wipe the store, `browserbash dashboard --clear` does it.

There is an optional cloud dashboard too — `browserbash connect --key bb_...` to link it, then `--upload` per run to push a specific run up (free cloud runs are kept 15 days). But that is strictly opt-in and run-by-run. The whole design respects the local-first premise: you choose, per run, whether anything goes up. If you never pass `--upload`, the cloud side stays empty. That opt-in model is covered in the [learn section](https://browserbash.com/learn).

## When local-model browser automation is the right call

Let me give you the decision plainly, because "it depends" is useless advice.

**Choose a local model (Ollama) when:**

- The pages contain data that cannot leave your machine or network — PII, internal tools, regulated records.
- You run high volumes and the per-token cost of a hosted model would add up.
- You are in an air-gapped or firewalled environment with no outbound inference.
- Your objectives are short-to-medium and you have a mid-size model with the hardware to back it.

**Reach for a hosted model (still same CLI, just a key and a flag) when:**

- The flow is long, branchy, and high-stakes, and you want the highest reliability you can get.
- You do not have hardware for a 70B-class model and your local options are limited to small, flaky ones.
- The data is not sensitive and convenience beats the per-run cost.

The honest reality is that most teams end up using both. Local for the bulk of privacy-sensitive, repetitive runs; hosted for the handful of hard flows where you want a frontier model's reasoning. BrowserBash is built so that split costs you one flag, not a rewrite. Compare the cost side on the [pricing page](https://browserbash.com/pricing) — the CLI itself is free and open source, so the only variable is which model you point it at.

If you are evaluating this for a team, start small: pick one privacy-sensitive flow you currently cannot automate because of where the data would go, wire it to a local Qwen3, and run it for a week. That single use case usually tells you more than any benchmark.

## FAQ

### Can I run browser automation with a local LLM and no API key?

Yes. With Ollama running on your machine, BrowserBash's default `auto` model resolves to your local model first, so you can drive a real browser with no API key and no per-token cost. Nothing leaves your machine on local runs unless you explicitly opt in with the `--upload` flag. That makes it a genuine zero-cost, fully private path for browser automation.

### Which Ollama model works best for browser automation?

A mid-size model is the sweet spot — a Qwen3 or Llama 3.3 70B-class model has enough reasoning depth to stay on plan across multi-step flows. Very small models around 8B and under work for short, single-page tasks but get flaky on long objectives like multi-step checkouts. If you have the hardware for a 70B-class model, that is the most reliable local option as of 2026.

### Is local-model browser automation slower than using a cloud model?

Usually yes, per step. A local model running on your own GPU or laptop is slower to respond than a hosted frontier model, so multi-step runs take longer and benefit from a generous `--timeout`. The trade is privacy and zero cost for speed. For high-volume repetitive automation that runs unattended, the slower per-step time rarely matters, while the cost savings and data control do.

### Does BrowserBash send my page data to the cloud when using Ollama?

No. On a local-model run, the page content, screenshots, and extracted values all stay on your machine, and runs are stored locally at `~/.browserbash/runs` with secrets masked. Data only goes to the cloud if you explicitly link an account with `browserbash connect` and add the `--upload` flag to a specific run. Without that flag, every run is fully local.

Ready to drive a browser with your own model? Install it and point it at Ollama:

```bash
npm install -g browserbash-cli
```

It is free and open source, and you do not need an account to run it — though you can [sign up](https://browserbash.com/sign-up) any time if you want the optional cloud dashboard later.
