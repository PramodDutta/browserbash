---
title: Use Local Ollama Models to Drive Browser Tests (No API Keys)
description: "A hands-on guide to ollama browser test automation with BrowserBash: keep test data local, pick the right model, and know when cloud Claude wins."
date: 2026-04-04
category: llm
---

If your test suite touches a staging environment with real-ish data, an admin panel, or login credentials, you have probably had the same quiet thought I did the first time I wired an AI agent into a browser flow: where exactly is all of this going? That question is the whole reason ollama browser test automation is worth setting up. With BrowserBash configured Ollama-first, a local model reads your plain-English objective, looks at the page, and decides the next click — and none of that prompt, page content, or DOM ever leaves the machine. No API key, no token meter, no third party reading your checkout form. This is a tutorial for getting that local stack running, choosing a model that actually finishes multi-step flows, and being honest about the point where a hosted model still earns its keep.

I write this as someone who has burned an afternoon debugging why an 8B model kept clicking the wrong "Continue" button. Local-first is great, but it is not magic, and the goal here is to make you fast and accurate, not to sell you a fantasy.

## Why run browser tests on a local LLM at all

The pitch for ollama browser test automation comes down to three concrete wins, and it helps to name them plainly before touching a command.

**Data residency.** When the model runs on your laptop or a box you control, the prompt that describes your test, the rendered text of the page, form values, and any session details stay on that host. For teams under a compliance regime — health data, financial flows, anything with a data processing agreement — "the page text never left the network" is not a nice-to-have, it is a checkbox an auditor cares about. You do not have to write a justification for sending production-adjacent screens to a vendor, because you did not send them.

**Cost.** A local model has no per-token bill. You can run a thousand iterations of a flaky checkout flow while you debug it and the only cost is electricity and your patience. That changes how you work. When every run is metered against a credit card, you self-censor — you run less, you guess more. When runs are free, you iterate like you would against a unit test.

**No key management.** API keys leak. They end up in CI logs, in a `.env` someone committed, in a Slack paste. A stack that needs zero keys to do useful work removes an entire category of secret-handling from your setup. You can read more about that specific tradeoff in the deeper write-up over on the [BrowserBash learn hub](https://browserbash.com/learn).

None of this is unique to BrowserBash as an idea. What is useful is that BrowserBash defaults to it instead of treating local as an afterthought you have to configure your way into.

## How BrowserBash resolves a model (the Ollama-first chain)

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You install it once:

```bash
npm install -g browserbash-cli
```

Then you describe what you want in English and an AI agent drives a real Chrome browser through it, step by step, with no selectors and no page objects. The part that matters for this article is how it picks the brain doing the driving.

When you run a command, BrowserBash auto-resolves a model in a fixed order:

1. **Local Ollama** — if an Ollama server is reachable, it uses that. This is the default and the whole point.
2. **`ANTHROPIC_API_KEY`** — if that environment variable is set and no local Ollama is found, it falls back to Anthropic Claude (your key, your bill).
3. **`OPENROUTER_API_KEY`** — last in the chain, which opens up hundreds of hosted models, including some genuinely free ones.

The practical consequence: if Ollama is running and you have not exported any keys, you are on a local model and your data is staying put. You did not have to pass a flag to get there. If you want to be certain, just make sure no `ANTHROPIC_API_KEY` is exported in the shell — with Ollama up, the resolver stops at step one.

This is different from most AI testing tools, where "local" is a paid enterprise tier or a roadmap promise. Here it is the path of least resistance.

### Getting Ollama itself ready

Install Ollama from its official site, then pull a model. The first pull is a download; after that it is cached locally.

```bash
ollama pull qwen3:32b
ollama serve   # usually already running as a background service
```

By default Ollama listens on `http://localhost:11434`, which BrowserBash looks for automatically. If you run Ollama on another host or port — say a beefier workstation on your LAN, or you are pointing at an OpenAI-compatible server like vLLM or LM Studio — set `OLLAMA_BASE_URL` to that endpoint and BrowserBash will talk to it instead. That single variable is also how you keep inference on a GPU box while your tests run from a thin CI runner.

## Your first fully-local browser test

Here is the part where it stops being theory. With Ollama running and a model pulled, you write an objective in quotes and let the agent work.

```bash
browserbash run "Go to the demo store, search for 'wireless mouse', open the first result, add it to the cart, and confirm the cart shows 1 item"
```

The agent navigates, reads the page, decides each action, and at the end returns a verdict (pass or fail) plus structured results describing what it saw and did. No part of that round trip touched a cloud LLM, assuming you are on the Ollama default.

A classic end-to-end example that BrowserBash handles well is a full purchase: log in to a store, add an item to the cart, complete checkout, and verify the page shows "Thank you for your order!". That is exactly the kind of flow where you do not want to be shipping cart contents and an email address to a third-party model, so it is a natural fit for the local stack.

If you want to watch what happened after the fact, add recording:

```bash
browserbash run "Log in, add the blue t-shirt to cart, check out, and verify 'Thank you for your order!'" --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine. On the builtin engine it also captures a Playwright trace you can open in the trace viewer. The recording lives on your disk; nothing is uploaded unless you explicitly opt in, which we will get to.

### Looking at runs without leaving your machine

BrowserBash ships a fully local dashboard. Run:

```bash
browserbash dashboard
```

and you get run history and replay served from your own machine, no account, no upload. There is also an optional free cloud dashboard with run history, video recordings, and per-run replay, but that is strictly opt-in via `browserbash connect` and the `--upload` flag — and free uploaded runs are kept for 15 days. If your reason for going local in the first place is data residency, you simply never pass `--upload` and the cloud side never sees a thing. The choice stays yours per command, which is the right place for it to live.

## Picking a local model that actually finishes the job

This is where I have to be straight with you, because the difference between a delightful local setup and a maddening one is almost entirely model choice.

Driving a browser is not a one-shot prompt. The agent has to hold a goal in its head, read a messy page, choose among several plausible elements, take an action, observe the result, and repeat — often a dozen or more times. That is a long reasoning chain, and small models fall off it. In my experience, very small local models (roughly 8B parameters and under) can be genuinely flaky on long multi-step objectives. They will nail "search and click the first result" and then lose the plot somewhere around step seven of a checkout, clicking a footer link because the text matched. It is not that they are useless — they are fine for short, well-scoped flows — but do not hand them your hairiest journey and expect cloud-grade reliability.

The sweet spot for serious local work is a mid-size model: a Qwen3-class model or a Llama 3.3 70B-class model. These have enough reasoning headroom to keep a multi-step plan coherent, recover from a misclick, and reason about what a page is actually showing. That capability costs VRAM, which is the real tradeoff, not dollars.

Here is a rough decision table from running these flows in practice. Treat the size buckets as guidance, not a benchmark — I am not quoting numbers I cannot stand behind.

| Model tier | Typical use | Reliability on long flows | Hardware reality |
|---|---|---|---|
| Small local (~8B and under, e.g. Llama 3.1 8B) | Short, scoped checks; smoke tests; learning the tool | Hit or miss past ~6 steps | Runs on a laptop / modest GPU |
| Mid local (Qwen3-class, Llama 3.3 70B-class) | Real multi-step E2E flows, the local sweet spot | Solid; the recommended default for serious work | Wants a 24GB+ GPU or quantization tricks |
| Free hosted (e.g. `openai/gpt-oss-120b:free` via OpenRouter) | Hard flows when you lack local VRAM | Strong, but data leaves your machine | None — runs in the cloud |
| Cloud Claude (bring your own key) | The gnarliest, highest-stakes flows | Highest | None local; you pay per token |

A pragmatic pattern: develop and iterate on a mid-size local model where runs are free and private, then reserve a hosted model for the two or three flows that are genuinely hard or business-critical. You are not forced to pick one model for the whole suite.

### When a small model is actually the right call

Do not over-buy. If your "test" is "open the homepage, accept cookies, confirm the hero headline is present," an 8B model will do that all day for free on a laptop. Short objectives with little ambiguity are exactly where small local models shine. Reach for bigger models when the flow is long, the page is cluttered with near-identical elements, or a wrong click is expensive.

## Local vs cloud Claude: when each one wins

Local-first is the default I would reach for, but I would be doing you a disservice to pretend a local model always wins. It does not. Here is the honest split.

**Choose local Ollama when:**

- Data residency is a hard requirement. If the page or prompt cannot legally or contractually leave your network, this decides it for you before any quality discussion.
- You are iterating heavily. Debugging a flaky flow means running it many times; free-and-fast beats accurate-but-metered when you are in a tight loop.
- The flow is short to medium and your hardware can host a mid-size model.
- You want a guaranteed zero model bill. On local models you can genuinely promise $0 in inference cost, which matters for open-source projects, side projects, and budget-locked teams.

**Choose cloud Claude (your own key) when:**

- The flow is long, ambiguous, and high-stakes, and you cannot host a 70B-class model locally. A capable hosted model will simply finish more often on the hard ones.
- You need the most reliable agent you can get for a release-gating check and the data sensitivity is acceptable.
- You do not have the GPU for a mid-size local model and prefer paying per token over running a flaky small one.

**Choose a free hosted model (OpenRouter) when:**

- You want cloud-grade capability at no cost and the data leaving your machine is acceptable. Models like `openai/gpt-oss-120b:free` give you real reasoning power for $0, with the tradeoff that it is no longer a local-only privacy story.

The point is that BrowserBash does not lock you in. The model is a resolution chain and a flag, not an architectural decision you make once and regret. You can read more about the hosted side on the [features page](https://browserbash.com/features), and the [pricing page](https://browserbash.com/pricing) lays out where the free tiers sit.

### Switching to a hosted model when you need it

Falling back is deliberate. Export an Anthropic key and, with no local Ollama in the resolution path, BrowserBash uses Claude:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
browserbash run "Complete the multi-page mortgage application and verify the confirmation number appears" --record
```

Or point at OpenRouter for a free hosted model by setting `OPENROUTER_API_KEY` instead. Same objective, same command shape, different brain. Nothing about your test rewrites itself when you swap models, which is the whole appeal of describing intent instead of coding selectors.

## Committable Markdown tests, run locally

For anything you want to keep and run repeatedly, BrowserBash supports Markdown tests: plain `*_test.md` files where each list item is a step. They live in your repo next to the code, support `@import` for composing shared setup, and use `{{variables}}` templating so you can parameterize environments and credentials. Variables you mark as secret are masked as `*****` in every log line, which matters a lot when you are running locally and tailing output.

A small example, `checkout_test.md`:

```markdown
# Checkout smoke (local model)

- Go to {{base_url}}
- Log in as {{username}} with password {{password!secret}}
- Search for "wireless mouse" and open the first result
- Add it to the cart
- Proceed to checkout and complete the order
- Verify the page shows "Thank you for your order!"
```

Run it with the local model and your variables:

```bash
browserbash testmd run ./checkout_test.md --var base_url=https://staging.example.com --var username=qa@example.com --var password=hunter2
```

After the run, BrowserBash writes a human-readable `Result.md` summarizing what happened. With the secret marker on the password, that credential never shows up in plaintext in your logs or the result file. Run this against Ollama and you have a committable, repeatable, fully-local test where neither the page content nor the masked secret leaves your machine. That combination — version-controlled intent, local inference, masked secrets — is hard to beat for privacy-sensitive suites.

## Wiring the local stack into CI

A local model is not just for your laptop. If your CI runner can reach an Ollama endpoint — running on the same host or a GPU box on the network via `OLLAMA_BASE_URL` — your pipeline can run AI browser tests without a single cloud key in its secrets store.

BrowserBash has an agent mode built for exactly this. The `--agent` flag emits NDJSON, one JSON event per line on stdout, so a CI step or an AI coding agent can parse machine output instead of scraping prose. The exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. That makes gating a build trivial.

```bash
browserbash run "Log in and confirm the dashboard loads with the user's name in the header" --agent --headless
```

Run that in a pipeline step, key off the exit code, and you have a release gate powered by a local model that touched nothing external. Add `--record` if you want the `.webm` video as a build artifact for when something fails at 2 a.m. and you need to see what the agent saw. There are real-world write-ups of teams doing this kind of thing on the [BrowserBash blog](https://browserbash.com/blog) and in the published [case study](https://browserbash.com/case-study).

### A note on providers vs models

Two settings are easy to conflate. The *model* is the brain (resolved via the Ollama-first chain). The *provider* is where the browser actually runs, switched with the `--provider` flag: `local` (the default, your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, or `browserstack`. These are independent. You can run a local Ollama model driving a browser on a cloud grid like LambdaTest, or a cloud model driving your local Chrome. For the purest data-residency story, keep both local: a local model on the `local` provider, no `--upload`. That is the configuration where you can say, with a straight face, that nothing left the machine.

```bash
browserbash run "Verify the cross-browser checkout works" --provider lambdatest
```

Use that when you need broad browser coverage and accept that the browser now runs in the cloud even if your reasoning model is local.

## Engines: stagehand vs builtin

One more knob worth knowing. BrowserBash ships two engines. The default is **stagehand** (MIT-licensed, by Browserbase), and there is a **builtin** engine that is an in-repo Anthropic tool-use loop. For a pure local-only Ollama setup, the stagehand default is the natural choice and what most of these examples assume. The builtin engine's extra goodie is that, with `--record`, it captures a Playwright trace on top of the screenshot and video — handy for deep debugging. Pick the engine for the debugging fidelity you want; the model-resolution story is the same either way.

## Setting expectations before you commit

A few honest caveats so you do not get surprised:

- **Small models will frustrate you on long flows.** I said it earlier and it is the single most common cause of "this AI testing thing doesn't work." Match the model to the flow length. If a flow keeps failing on a small model, the fix is usually a bigger model, not a different tool.
- **Local inference uses your hardware.** A 70B-class model wants real VRAM. If you do not have it, a free hosted model is a reasonable middle ground that still costs nothing in dollars — just not a local-only privacy guarantee.
- **Determinism is different from scripted tests.** An AI agent reasons each run, so two runs of a genuinely ambiguous flow can differ. For most flows this is fine and actually more resilient to UI churn than brittle selectors, but know that you are trading exact repeatability for adaptability.
- **Verify the resolution path.** If you expected local but a key was exported in your environment, BrowserBash may have fallen back to a hosted model. When privacy is the goal, confirm there is no `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` set in the shell running your tests.

Set those expectations correctly and ollama browser test automation goes from a neat demo to a daily-driver part of your QA stack.

## FAQ

### Do I need an API key to run browser tests with BrowserBash?

No. BrowserBash defaults to a local Ollama model, so with Ollama running and no keys exported, you can run full browser tests with a zero model bill and nothing leaving your machine. Keys for Anthropic Claude or OpenRouter are optional fallbacks you only set if you want a hosted model. The tool resolves local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`.

### Which local model is best for AI browser test automation?

For serious multi-step flows, a mid-size model is the sweet spot: a Qwen3-class model or a Llama 3.3 70B-class model has the reasoning headroom to stay coherent across a long sequence of clicks. Very small models (around 8B and under) work for short, scoped checks but tend to get flaky on long objectives. Pull the largest model your hardware can comfortably host for the hard flows, and keep a small one for quick smoke checks.

### Does any of my test data leave my machine when using Ollama?

When you run on the local Ollama default with the `local` provider and do not pass `--upload`, your prompt, page content, and form values stay on your machine. Secret-marked `{{variables}}` are additionally masked as asterisks in every log line and in the generated Result.md. The optional cloud dashboard only receives data if you explicitly opt in with `browserbash connect` and `--upload`, and free uploaded runs are kept for 15 days.

### When should I use cloud Claude instead of a local model?

Reach for cloud Claude when a flow is long, ambiguous, and high-stakes, and you cannot host a 70B-class model locally — a capable hosted model simply finishes more often on the hardest journeys. It is also the right call for release-gating checks where reliability matters most and the data sensitivity is acceptable. If you want cloud-grade capability for free and can accept data leaving your machine, a free hosted model on OpenRouter is a strong middle option.

Ready to keep your test data on your own machine? Install with `npm install -g browserbash-cli`, make sure Ollama is running, and write your first plain-English objective — no account, no API key, nothing uploaded. If you later want the optional free cloud dashboard, you can [sign up here](https://browserbash.com/sign-up), but it is entirely opt-in and your local-first setup never depends on it.
