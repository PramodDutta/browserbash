---
title: Use Any LLM for Browser Automation Through OpenRouter
description: "Browser automation OpenRouter guide: point BrowserBash at any OpenRouter model and drive a real Chrome browser from plain English in the CLI."
date: 2026-02-17
category: llm
---

Browser automation OpenRouter setups give you something most AI tools refuse to: a choice. Instead of being married to one vendor's model, you point a single API key at a catalog of 400+ models and swap whichever one drives your browser from a plain-English objective — Llama 3.3 today, Gemini Flash tomorrow, a Claude or GPT model for the genuinely hard flow next week. With [BrowserBash](https://www.npmjs.com/package/browserbash-cli), the free open-source CLI from The Testing Academy, you write the objective in English, an AI agent drives a real Chrome browser step by step, and the `--model openrouter/...` flag decides which brain is doing the thinking. No selectors, no page objects, and no rewrite when you change models.

This article is about the model-agnostic angle specifically. BrowserBash is Ollama-first by design — its whole identity is that nothing has to leave your machine — but OpenRouter is the escape hatch for when you want a frontier model on a tricky checkout, or you want to A/B two models against the same flow without touching your code. Below: how the wiring works, which models actually hold up on multi-step browsing, how to pick one, and where OpenRouter is the wrong tool.

## What "browser automation through OpenRouter" actually means

There are two separate jobs happening when an AI drives a browser, and conflating them is where most confusion starts.

The first job is **interpreting the page and your intent** — reading what's on screen, deciding the next click, knowing when the objective is met. That's the LLM's work. The second job is **physically driving a browser** — launching Chrome, clicking the referenced element, typing into a field, taking a screenshot. That's the automation engine's work, and it never changes regardless of which model you use.

OpenRouter only touches the first job. It's a unified API gateway: one OpenAI-compatible endpoint, one API key, and behind it a catalog of models from Anthropic, OpenAI, Google, Meta, DeepSeek, Mistral, xAI and others. You send a chat completion request naming a model like `meta-llama/llama-3.3-70b-instruct`, and OpenRouter routes it to a provider that serves that model, bills you, and returns the response. OpenRouter states it does not mark up the underlying provider's per-token price — you pay the model's native cost — though specific rates and any platform fees change over time, so check [openrouter.ai/pricing](https://openrouter.ai/pricing) for current numbers as of 2026.

In BrowserBash terms, OpenRouter is one of several **LLM backends**. The browser automation itself — the perception, the clicking, the verdict — is identical whether the model behind it is a local Ollama model, a Claude model via Anthropic, or any OpenRouter model. You're swapping the reasoning, not the plumbing. That separation is exactly what makes "use any LLM" a real promise instead of marketing.

## Why a model-agnostic browser automation workflow matters

Most AI browser tools pick a model for you. That's fine until it isn't. Three situations make model choice matter:

**Cost shape changes with the task.** A daily smoke test that loads a page and checks a heading does not need a frontier model. A small, cheap, fast model handles it. But a ten-step checkout with a coupon, an address form, and a 3-D Secure modal is a different animal — there, a stronger model that fails less often is cheaper in total than a weak one you have to re-run four times. With browser automation OpenRouter routing, you set the model per run with a flag, so you spend frontier money only where the flow earns it.

**Availability and rate limits are real.** If a single provider is rate-limiting you or having a bad afternoon, being locked to it stops your pipeline. A gateway lets you switch the model your CI uses by changing one environment value, not rearchitecting.

**You want to compare models honestly.** "Which model is best at our signup flow?" is an empirical question. The only fair way to answer it is to run the *same* objective through several models and look at pass rates, step counts, and wall-clock time. A model-agnostic CLI turns that into a loop over a list of model names instead of three separate integrations.

The honest caveat, which the rest of this article keeps coming back to: model-agnostic does not mean model-equal. The smartest models genuinely complete more flows on the first try. A model-agnostic tool gives you the *freedom* to make that tradeoff deliberately; it does not make the tradeoff disappear.

## How BrowserBash plugs into OpenRouter

BrowserBash resolves its model through a `--model` flag (or the `auto` default). For OpenRouter you pass a model id in the shape `openrouter/<vendor>/<model>` and provide your key as an environment variable.

```bash
export OPENROUTER_API_KEY="sk-or-..."
browserbash run "Open https://news.ycombinator.com and tell me the title of the top story" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct
```

That's the whole integration. `OPENROUTER_API_KEY` authenticates you; the `openrouter/meta-llama/llama-3.3-70b-instruct` string tells BrowserBash which catalog entry to call. Everything downstream — launching your local Chrome, perceiving the page, clicking, and returning a verdict with extracted values — is unchanged from any other backend.

A few mechanics worth knowing before you run it in anger:

- **You still need Chrome.** OpenRouter supplies the brain, not the browser. The default `local` provider drives the Chrome installed on your machine. The browser runs locally even though the model call goes out to OpenRouter. (You can move the browser elsewhere with `--provider`, but that's orthogonal to model choice.)
- **The objective is the prompt.** You don't write code; you write what you want. The agent loop converts your sentence into observe-decide-act cycles against the page.
- **Two engines exist; pick per run.** The default `stagehand` engine (MIT, by Browserbase) provides the act/extract/observe primitives and self-healing behavior, and it's what most OpenRouter and hosted-model runs use. The `builtin` engine is an in-repo Anthropic tool-use loop and is auto-selected for the LambdaTest and BrowserStack providers. For an OpenRouter model on your local Chrome, you're on `stagehand` unless you say otherwise with `--engine`.

If you've never installed it, the on-ramp is one line:

```bash
npm install -g browserbash-cli
```

You need Node 18+ and Chrome. No account is required to run anything. For deeper setup walkthroughs, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections cover the full surface.

## Choosing an OpenRouter model that can actually drive a browser

Here's where senior judgment beats a model leaderboard. Multi-step browser automation is harder on a model than a one-shot chat completion. The agent has to hold the objective in mind across many turns, interpret a fresh page snapshot each time, avoid looping, and decide when it's genuinely done. Two failure modes show up constantly:

1. **Premature success.** A weak model declares victory before the page actually reached the target state.
2. **Looping and drift.** A weak model re-clicks the same element, forgets a sub-goal, or wanders off into an unrelated part of the page.

Capable instruction-following and long-context coherence matter more here than trivia knowledge. This maps directly onto the same caveat BrowserBash gives for local models: the very small models (roughly 8B parameters and under) are flaky on long, multi-step objectives. That truth doesn't change just because the model is hosted on OpenRouter instead of running in Ollama — an 8B-class model served through a gateway is still an 8B-class model.

A practical way to think about model tiers for browser work:

| Tier | Example OpenRouter models | Good for | Watch out for |
| --- | --- | --- | --- |
| Frontier / hosted heavyweight | `anthropic/claude-*`, `openai/gpt-*`, `google/gemini-2.5-pro` | Long, branching flows; tricky modals; the hard checkout | Highest per-token cost; pick this where reliability pays for itself |
| Mid-size capable | `meta-llama/llama-3.3-70b-instruct`, large Qwen3 variants | The everyday sweet spot: logins, search, multi-field forms | Slightly more retries than frontier on the gnarliest pages |
| Small / cheap / free | sub-8B instruct models, many free-tier entries | Single-step checks, "is the page up," cheap smoke tests | Premature success and looping on anything multi-step |

Note that the exact catalog and the availability of any specific model on OpenRouter shifts over time; treat the model ids above as illustrative of *tiers*, not a frozen list. The discipline is the same regardless of which names are current: start one tier higher than you think you need, get the flow passing reliably, then try stepping down a tier and watch the pass rate. If it holds, you just saved money. If it drops, you found the floor for that flow.

### A note on vision

Some flows lean on a screenshot the model can look at — heavily visual layouts, canvas-y UIs, drag interactions. If your objective depends on that, prefer a vision-capable model on OpenRouter. Many text-only models will still drive a lot of the standard DOM-based web fine through the accessibility-tree representation, but the moment correctness depends on seeing pixels, a non-vision model is the wrong pick. Match the model's capabilities to what the page actually demands.

## OpenRouter vs the local-first default: when to use which

BrowserBash's default isn't OpenRouter — it's `auto`, which prefers a local Ollama model first. That ordering is deliberate, and understanding it tells you when to reach for OpenRouter and when not to.

With `auto`, BrowserBash resolves the backend in order: a local Ollama install (free, no keys, nothing leaves your machine) → an `ANTHROPIC_API_KEY` if present → an `OPENAI_API_KEY` if present → otherwise it errors with guidance. OpenRouter sits outside that auto-chain on purpose; you opt into it explicitly with `--model openrouter/...`. So the real question is: when do you override the local-first default?

| Dimension | Local Ollama (default) | OpenRouter backend |
| --- | --- | --- |
| Cost | $0 model bill — nothing metered | Pay per token at the model's native rate (verify on OpenRouter) |
| Data path | Stays on your machine; no model call leaves | Page-derived prompts go to OpenRouter and the underlying provider |
| Model ceiling | Capped by your hardware; mid-size is the sweet spot | Access to frontier models you can't run locally |
| Setup | Install Ollama + pull a model | One env var, one flag |
| Best for | Privacy-sensitive flows, high run volume, CI you don't want metered | Hard flows, frontier reasoning, model A/B comparisons, no local GPU |

The clean decision rule:

- **Stay local** when the data is sensitive, when you run thousands of cheap checks and want a guaranteed $0 model bill, or when a mid-size local model already passes the flow reliably. Nothing leaving your machine is a feature, not a limitation.
- **Reach for OpenRouter** when a flow is hard enough that you want a frontier model, when you don't have the hardware to run a 70B-class model locally, or when you specifically want to compare several models against one objective. You can read more about the local-first philosophy and what's free on the [pricing](https://browserbash.com/pricing) and [features](https://browserbash.com/features) pages.

There's also a middle path some teams take: prototype against a frontier OpenRouter model to confirm the objective is well-written and the flow is even automatable, then port the now-proven objective down to a local model for everyday runs. The English objective doesn't change — only the `--model` flag does. That's the model-agnostic payoff in one sentence.

## Comparing several OpenRouter models on the same flow

The most useful thing a model-agnostic CLI lets you do is treat model choice as an experiment. Here's a realistic pattern: run one objective through three models and capture machine-readable output you can diff.

```bash
export OPENROUTER_API_KEY="sk-or-..."
for MODEL in \
  "openrouter/meta-llama/llama-3.3-70b-instruct" \
  "openrouter/google/gemini-2.5-flash" \
  "openrouter/anthropic/claude-opus-4-8"
do
  browserbash run "Go to the demo store, add the first product to the cart, open the cart, and report the cart total" \
    --model "$MODEL" --agent
done
```

The `--agent` flag is what makes this evaluable. It emits NDJSON — one JSON object per line — instead of prose. You get progress events like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}` and a terminal `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. Exit codes follow the same contract: `0` passed, `1` failed, `2` error, `3` timeout. So your comparison harness doesn't parse English — it reads `status`, counts steps, and sums `duration_ms` per model.

That turns "which OpenRouter model is best for our flow" from a vibe into a table: pass/fail per model, how many steps each took, how long each ran, and what `final_state` each extracted. Run it a few times per model, because these runs are non-deterministic and a single sample lies. When you find the cheapest model that passes consistently, that's your production pick.

If you'd rather watch than read JSON, add `--record` to capture a screenshot and a `.webm` session video (the `builtin` engine also writes a Playwright trace), and `--dashboard` to open the fully local dashboard at `localhost:4477` on that run. The dashboard is free and stays on your machine; nothing is uploaded unless you separately run `browserbash connect` and pass `--upload` per run. Without `--upload`, nothing leaves your machine.

## Putting OpenRouter models into committable tests

One-shot `run` commands are great for exploration, but a model choice you actually depend on belongs in version control. BrowserBash markdown tests (`*_test.md`) make that natural. Each list item is a step, you can template values with `{{variables}}`, compose files with `@import`, and any variable marked as secret is masked as `*****` in every log line — including, importantly, when a run is recorded or written to the on-disk run store.

```bash
browserbash testmd run ./checkout_test.md \
  --model openrouter/meta-llama/llama-3.3-70b-instruct --record
```

After each run BrowserBash writes a human-readable `Result.md`, and the full run (secrets masked) is kept on-disk under `~/.browserbash/runs`, capped at the most recent 200. The point for a model-agnostic workflow: the *test* doesn't encode the model. The same `checkout_test.md` runs under a local Ollama model in everyday CI and under a frontier OpenRouter model when you're chasing a flaky edge case — you change one flag, not the test. Pin the model in CI for reproducibility; vary it on your laptop when you're debugging or comparing. The [case studies](https://browserbash.com/case-study) and the wider [blog](https://browserbash.com/blog) show more of how teams structure these committable flows.

## Honest limitations of the OpenRouter route

A balanced article names the downsides plainly.

**Cost is real and metered.** The whole reason BrowserBash leads with local Ollama is the guaranteed $0 model bill. The moment you route through OpenRouter, every run costs tokens. For a high-volume CI suite, that adds up fast — which is exactly why the local-first default exists. Use OpenRouter where the model quality earns its keep, not as a blanket default.

**Data leaves your machine.** With a local model, the page content the agent reasons about never leaves your laptop. With OpenRouter, the prompts — which include page-derived text — go to OpenRouter and then to the underlying provider. For privacy-sensitive or regulated flows, that's a real consideration. The local route, or a self-hosted Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`, keeps you in control of the data path.

**Model behavior varies and shifts.** Two OpenRouter models can behave very differently on the same flow, and a given model can change as providers update it. That's why the NDJSON comparison loop above isn't optional polish — it's how you keep an eye on whether your chosen model still passes after a silent upstream change. Re-run your comparison periodically rather than trusting a one-time result.

**Small models are still small.** Routing an 8B model through a slick gateway does not make it good at ten-step flows. If you want cheap, accept that cheap means single-step or short objectives, and reserve multi-step flows for mid-size and up. The gateway changes your billing and access, not the model's reasoning.

## When to choose OpenRouter for BrowserBash, and when not to

To make this concrete and decision-ready:

**Choose OpenRouter when:**
- You don't have local hardware to run a 70B-class model and you need that level of reasoning.
- A specific flow is hard enough that a frontier model's higher first-try pass rate is worth the per-token cost.
- You want to compare several models against one objective before committing to one.
- You want one key and one flag to reach many vendors instead of wiring up each provider separately.

**Stay local (or use a direct provider key) when:**
- The data is sensitive and you want nothing to leave your machine — use the Ollama default.
- You run a high volume of cheap checks and want a guaranteed $0 model bill.
- A mid-size local model already passes your flow reliably; there's no reason to pay.
- You're already standardized on one provider and don't need a gateway's breadth — a direct `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` through `auto` is simpler.

The beauty of a model-agnostic CLI is that this isn't a one-time architectural decision you're stuck with. It's a flag. You can start local, prove a flow on a frontier OpenRouter model when you hit a wall, and drop back to local once the objective is solid — all with the same English instruction and the same committed test file.

## FAQ

### How do I use OpenRouter with BrowserBash?

Set your key as `OPENROUTER_API_KEY` and pass `--model openrouter/<vendor>/<model>` to a run, for example `openrouter/meta-llama/llama-3.3-70b-instruct`. BrowserBash uses that model for the reasoning while your local Chrome still does the actual browsing. No account or sign-up is needed to run it, and the rest of the command surface — objectives, recording, agent mode — works exactly as it does with any other backend.

### Which OpenRouter model is best for browser automation?

There's no single answer because it depends on flow difficulty and budget. A mid-size capable model like a 70B-class Llama is the everyday sweet spot; frontier models from Anthropic, OpenAI, or Google win on long or tricky flows; small sub-8B models tend to declare success early or loop on multi-step objectives. The reliable way to decide is to run the same objective through a few models with `--agent` and compare pass rates, step counts, and duration.

### Does using OpenRouter mean my data leaves my machine?

Yes. The browser still runs locally, but the prompts the agent sends — which include text derived from the page — go to OpenRouter and the underlying model provider. If you need everything to stay on your machine, use the default local Ollama backend, where nothing leaves your laptop and the model bill is $0. OpenRouter is the right call when you specifically want a frontier or hosted model and accept that tradeoff.

### Is BrowserBash free if I use OpenRouter?

BrowserBash itself is free and open-source under Apache-2.0, and there's no account required. OpenRouter, however, is a paid gateway — you pay the underlying model's per-token cost on every run, so it is not a $0 setup the way the local Ollama default is. Verify current rates on OpenRouter's pricing page, and reserve the OpenRouter route for flows where the model quality is worth the metered cost.

OpenRouter turns BrowserBash into a true any-model browser automation tool: one key, one flag, and a catalog of hundreds of models behind the same plain-English objective. Start local for free, reach for a frontier model when a flow gets hard, and let the NDJSON tell you which model to keep.

```bash
npm install -g browserbash-cli
```

Account optional — [sign up](https://browserbash.com/sign-up) only if you later want the cloud dashboard.
