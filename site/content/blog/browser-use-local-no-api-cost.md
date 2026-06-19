---
title: Running Browser-Use Style Agents Locally With Zero API Cost
description: "Get browser use local no api cost: natural-language browsing on a free Ollama or OpenRouter model, with honest reliability notes per model size."
date: 2026-04-14
category: llm
---

The pitch behind tools like Browser-Use is seductive: write what you want in plain English, and an agent drives a real browser to do it. The catch most people hit on day two is the bill. Every step of an agentic browser run feeds page state back into a model, and hosted frontier models charge per token for the privilege. If you want browser use local no api cost — natural-language browsing where the model runs on your own machine and the per-run model bill is literally zero — that path exists today, and it is more practical than the demos suggest, as long as you are honest about which model size you point it at.

I have wired enough local models into agent loops to know where the seam is. A 3B model will happily click the wrong button with total confidence. A 70B-class model will quietly do the boring thing right. This article is the working setup plus the trade-offs, written for an SDET or platform engineer deciding whether a free local model can carry real browser automation, and where you should still reach for something hosted.

## What "browser-use style" actually means

The Browser-Use project popularized a particular shape of automation: instead of writing selectors and waits, you hand an agent an objective in natural language, and a loop does the rest. The agent observes the page (DOM, accessibility tree, sometimes a screenshot), reasons about the next action, executes it against a real browser, observes again, and repeats until it decides the goal is met or it gives up. No `page.locator(...)`, no brittle XPath, no page objects. The model is the planner and the browser is the hands.

That loop is the same regardless of which model sits inside it. Swap a frontier API for a model running on `localhost` and the mechanics do not change — only the cost, the privacy posture, and the reliability do. The cost goes to zero. The privacy posture flips to "nothing leaves the machine." The reliability becomes a function of how capable the local model is, which is the whole game and the part this piece spends the most time on.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy that implements exactly this shape. You install it once, write an objective in English, and an AI agent drives a real Chrome step by step, returning a verdict plus the structured values it extracted. The relevant design choice for this article: it is Ollama-first, so the zero-cost local path is the default, not a buried flag.

## Why local-first changes the economics of agentic browsing

Three reasons push people toward a local model for this kind of work, and they usually arrive in this order.

**Zero marginal cost.** An agentic browser run is token-hungry by nature — each step resends page context so the model can decide the next move. A single multi-step flow can burn through far more tokens than a one-shot prompt. Run a few hundred automations a day (smoke checks every fifteen minutes, hourly dashboard scrapes) and a hosted bill becomes a line item someone questions. A local model on hardware you already own costs nothing per run. You pay once for the GPU, or you already have an Apple Silicon laptop that handles mid-size models fine, and every run after that is free.

**Privacy and data residency.** When an agent drives a browser, the model sees whatever the page shows: account dashboards, customer records, internal admin panels, half-filled forms with real PII. On a local model none of that leaves the machine. There is no data processing agreement to reason about, no retention question, no jurisdiction puzzle about where inference happened. For teams under healthcare, fintech, or strict internal data policies, that is often the difference between "we can automate this" and "legal said no."

**Offline and air-gapped.** Some build agents and corporate networks cannot call the public internet for inference at all. A model serving on `localhost:11434` works behind a firewall, on a locked-down runner, or on a plane.

The honest cost story: local is free per run but not free overall. You trade an API bill for hardware and electricity, and — the part nobody likes to say — for reliability headroom on hard flows. That trade is excellent for high-volume repetitive work and gets worse the longer and weirder your objective gets.

## The free model landscape: Ollama vs OpenRouter free tier

There are two realistic ways to get a $0 model bill, and they are not the same kind of free.

[Ollama](https://browserbash.com/learn) is a local runtime for open-weight models. You pull a model once, and it serves an HTTP endpoint on your machine. The model runs on your hardware, so "free" means free inference with no network call — the truest form of browser use local no api cost. Nothing about your runs touches a third party.

OpenRouter's free tier is different. It is a hosted gateway that exposes certain open models at no charge (subject to rate limits and policy that change over time, so treat specifics as "as of 2026" and check current terms). Inference still happens on someone else's servers, so your page content does leave your machine, and you are at the mercy of rate limits and availability. The model bill is zero; the privacy guarantee is not. BrowserBash supports it via `openrouter/<vendor>/<model>` with an `OPENROUTER_API_KEY`.

Here is the trade-off laid out plainly:

| Dimension | Ollama (local) | OpenRouter free tier |
| --- | --- | --- |
| Model bill | $0 (your hardware) | $0 (rate-limited, as of 2026) |
| Data leaves machine | No | Yes |
| Needs API key | No | Yes (`OPENROUTER_API_KEY`) |
| Works offline / air-gapped | Yes | No |
| Hardware needed | Enough RAM/VRAM for the model | None |
| Rate limits | Your GPU's throughput | Provider-imposed, can change |
| Best model sizes available | Whatever you can run | Larger models you can't host |

The practical read: use Ollama when privacy or offline operation matters, or when you want unlimited runs and have the hardware. Use the OpenRouter free tier when you do not have a GPU big enough for a capable model and you are comfortable with page content leaving the machine. A common middle path is to host a small model locally for cheap, frequent checks and reach for a larger free hosted model only for the runs that need more reasoning.

## How BrowserBash resolves the model with zero config

The reason this is approachable is the default. BrowserBash's default model is `auto`, and the resolution order is built to land on the free local path first.

1. If a local Ollama server is reachable, it uses `ollama/<model>` — free, no keys, nothing leaves the machine.
2. Otherwise, if `ANTHROPIC_API_KEY` is set, it uses `claude-opus-4-8`.
3. Otherwise, if `OPENAI_API_KEY` is set, it uses `openai/gpt-4.1`.
4. Otherwise it errors with guidance instead of silently doing the wrong thing.

So the zero-cost path is the path of least resistance. Have Ollama running, and `auto` picks it. You can also pin a backend explicitly with `--model` when you want control — for example `--model ollama/qwen3` for a specific local model, or `--model openrouter/meta-llama/llama-3.3-70b-instruct` to route through OpenRouter.

Getting started looks like this:

```bash
npm install -g browserbash-cli
ollama pull qwen3
browserbash run "Go to news.ycombinator.com and return the titles of the top 5 stories"
```

Because Ollama is up, `auto` resolves to your local model and the run costs nothing. If you want to be explicit about which engine interprets the English, you can leave it on the default `stagehand` engine or switch with `--engine builtin`; for a first local run, the default is fine.

## Reliability by model size: the part that actually matters

This is where I will not sell you a fantasy. A local model can drive a browser, but capability scales hard with size, and the failure mode of a too-small model is not a clean error — it is confident wrongness. The agent will click something, declare victory, and move on, leaving you with a green run that did the wrong thing. That is worse than a crash because it erodes trust in the whole setup.

Here is roughly what to expect at each tier. These are field-tested impressions from running agentic browser loops, not a benchmark — your mileage varies with the specific model, quantization, and how clean the target site is.

| Local model size | What it can reliably do | Where it breaks |
| --- | --- | --- |
| Tiny (≤3B) | Toy demos, single navigation + one extraction | Anything multi-step; hallucinated actions |
| Small (7–8B) | Short 2–3 step flows on clean pages | Long flows, ambiguous UI, recovering from a misclick |
| Mid (Qwen3 / Llama 3.3 70B-class) | Multi-step flows, form fills, structured extraction with decent recovery | Very long flows, heavy iframes, tricky dynamic content |
| Hosted frontier (Claude / GPT-class) | Hard, long, branchy flows; best self-correction | Cost and privacy, not capability |

The honest caveat that runs through all of this: very small local models (≤8B) are flaky on long multi-step objectives. They lose the thread, forget what they already did, and mis-rank which element matters. The sweet spot for serious local work is a mid-size model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you only have a laptop that can run an 8B model, scope your objectives to match — short, well-specified, single-purpose — and you will get a lot of value. Hand that same model a six-step checkout with a third-party payment iframe and you are setting it up to fail.

### Why small models fail at long flows specifically

It helps to understand the mechanism so you can design around it. An agentic loop accumulates state: every step adds to the context the model must reason over. Small models have less room to hold that growing history and weaker instruction-following under load, so two things happen as a flow lengthens. First, they start ignoring earlier constraints from the objective ("only the in-stock items," "skip the newsletter popup"). Second, their grounding gets worse — they pick a plausible-looking element that is not the right one. A short flow finishes before either failure mode dominates. A long flow gives both time to compound.

The design takeaway: keep objectives tight, prefer several small runs over one giant run, and verify the output rather than trusting the agent's self-reported verdict. Which is exactly why BrowserBash returns structured extracted values you can assert on, not just a "passed."

### Making a small model more reliable

You are not helpless if a mid-size model will not fit on your hardware. A few habits meaningfully raise the floor:

- **Specify the objective precisely.** "Click the blue 'Add to cart' button on the product page, then go to the cart" beats "buy the thing." Less ambiguity, fewer wrong turns.
- **Split long flows.** Run login as one objective and the post-login task as another. Each run starts with a clean context window.
- **Assert on extracted values.** Treat the structured output as the source of truth, not the verdict line. A run that "passed" but returned an empty value did not actually work.
- **Record the run when it matters.** Use `--record` to get a screenshot and a session video so a failure is debuggable instead of mysterious.

```bash
browserbash run "On the demo store, search for 'backpack', open the first result, and extract its name and price" \
  --model ollama/qwen3 \
  --record
```

That run stays entirely local, costs nothing, captures a video for later, and gives you values to check. For a deeper menu of objective-writing patterns, the [tutorials](https://browserbash.com/tutorials) are a good next stop.

## Privacy: what "nothing leaves your machine" really guarantees

This is worth being precise about because it is the strongest reason to go local. On a local Ollama model with the default `local` provider, BrowserBash runs your own Chrome and your own model, and nothing about the run is uploaded anywhere. There is no telemetry of page content, no model API call over the network. Runs are kept on-disk at `~/.browserbash/runs` (secrets masked, capped at 200) so you have history without any cloud.

The opt-in escape hatches are exactly that — opt-in. There is a fully local dashboard at `browserbash dashboard` (localhost:4477) that reads your on-disk runs and never phones home. If you ever want a cloud dashboard, you explicitly run `browserbash connect --key bb_...` and then pass `--upload` per run; without `--upload`, nothing leaves your machine even after connecting. The free cloud runs that are uploaded are kept 15 days. That design is deliberate: the private path is the default, and going cloud is a conscious choice you make per run.

The caveat to keep honest: if you switch to OpenRouter's free tier (or any hosted backend), page content does go to that provider for inference, by definition. "Local no API cost" and "free hosted no API cost" are both zero-dollar, but only the local one is also zero-data-egress. Pick the one that matches your threat model, not just your budget.

## A realistic local workflow

Here is how I would actually use this on a project. Stand up a mid-size model locally if the hardware allows — Qwen3 in the 70B-class neighborhood, or Llama 3.3 70B via Ollama. Point your routine, low-stakes automation at it: scheduled smoke checks, dashboard scrapes, "is the login page even up" probes. These run every few minutes at zero cost, fully private, and a mid-size model handles them comfortably.

For the gnarly flows — the multi-branch checkout, the wizard with conditional steps, the page that loads three nested iframes — keep a hosted model configured and route just those runs to it. BrowserBash makes that a one-flag decision: leave `auto` for local, or pass `--model claude-opus-4-8` (with `ANTHROPIC_API_KEY` set) for the runs that need the extra reasoning. You get the cost savings on the 90% of runs that are easy and the reliability on the 10% that are hard.

Markdown tests are the piece that makes this maintainable. You can write a committable `*_test.md` file where each list item is a step, with `{{variables}}` templating and secret-marked variables masked as `*****` in every log line. Run it with `browserbash testmd run ./checkout_test.md`. The same test can run against your local model in development and a hosted model in CI by changing one flag, so the test is the asset and the model is swappable underneath it.

```bash
browserbash testmd run ./checkout_test.md --model ollama/qwen3
```

If you want output a CI job or another AI coding agent can parse instead of prose, add `--agent` for NDJSON: one JSON object per line, step events plus a terminal `run_end` with a status and structured `final_state`, and clean exit codes (0 passed, 1 failed, 2 error, 3 timeout). That is how you wire local-model browser automation into a pipeline without writing a parser for human-readable text. The [features](https://browserbash.com/features) page covers the full surface.

## Where a hosted model is genuinely the better call

Balance demands this section. Going local is not always right, and pretending otherwise would waste your time.

Reach for a hosted frontier model when the flow is long and branchy, when the site is hostile (heavy dynamic content, anti-bot friction, deeply nested iframes), or when a wrong action is expensive and you need the best available self-correction. Reach for it when you do not have hardware that can run a mid-size model and OpenRouter's rate limits would throttle your volume. Reach for it when you are doing exploratory work where the objective is fuzzy and the model needs to figure out the path itself — that is exactly the regime where small models drift.

Conversely, go local when privacy or offline operation is non-negotiable, when run volume is high and flows are short-to-medium, and when you can run a mid-size model. The decision is not local-versus-hosted as a religion; it is per-workload routing, and the same tool should let you flip between them. If you are still mapping which tier fits your use case, the [case studies](https://browserbash.com/case-study) show concrete flows at different complexity levels.

A quick decision summary:

- **Choose local Ollama** if: data can't leave the machine, you have a capable GPU/Apple Silicon, runs are frequent and flows are short-to-mid.
- **Choose OpenRouter free tier** if: no local GPU, page content leaving the machine is acceptable, occasional runs within rate limits.
- **Choose a hosted frontier model** if: flows are long/branchy, the site is hostile, or a mistake is costly and you need best-in-class recovery.

## Putting it together

Running Browser-Use style agents locally with zero API cost is no longer a stunt. With an Ollama model and a tool that is local-first by default, you get natural-language browser automation that costs nothing per run and keeps your data on your machine. The one thing you cannot skip is matching the model size to the job: a sub-8B model is fine for short, precise objectives and unreliable on long ones, a mid-size 70B-class model carries most real work, and a hosted model earns its keep on the hardest flows. Pick honestly, verify the output instead of trusting the verdict, and route per workload. Compare the cost picture on the [pricing](https://browserbash.com/pricing) page — the core CLI is free and open source either way.

## FAQ

### Can I run browser automation with a local model and no API key?

Yes. With Ollama serving a model locally, BrowserBash's default `auto` model resolves to your local model with no API key required, and nothing leaves your machine. You install the CLI, pull a model with `ollama pull`, and run an objective in plain English. The per-run model bill is zero because inference happens on your own hardware.

### How small can a local model be and still drive a browser reliably?

For short, precise, two-to-three-step objectives on clean pages, a 7–8B model can work. For multi-step flows, form fills, and structured extraction with decent recovery, you want a mid-size model in the Qwen3 or Llama 3.3 70B class. Models at or below 8B get flaky on long objectives and tend to fail by confidently doing the wrong thing rather than by erroring, so scope tasks tightly when using them.

### Is OpenRouter's free tier really zero cost for browser agents?

OpenRouter exposes some open models at no charge, subject to rate limits and policy that change over time, so the model bill can be zero as of 2026 if you stay within those limits. The important difference from local Ollama is that inference happens on OpenRouter's servers, so your page content does leave your machine. It is zero-dollar but not zero-data-egress; choose it when you lack local hardware and that trade-off is acceptable.

### Does running a local model mean my page data stays private?

On a local Ollama model with the default local provider, yes — BrowserBash runs your own Chrome and your own model, with no upload of page content and runs kept only on-disk. Cloud features are strictly opt-in: you must run connect and pass `--upload` per run for anything to leave your machine. If you switch to a hosted backend like OpenRouter, page content goes to that provider by design, so privacy depends on which backend you choose.

Ready to try natural-language browsing with a $0 model bill? Install the CLI with `npm install -g browserbash-cli`, point it at a local Ollama model, and run your first objective. No account needed to run it — though you can [sign up](https://browserbash.com/sign-up) for the optional free cloud dashboard whenever you want it.
