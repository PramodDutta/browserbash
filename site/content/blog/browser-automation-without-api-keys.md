---
title: Browser Automation Without API Keys Using Local LLMs
description: "Browser automation without API keys is real: run AI agents fully offline with local LLMs and BrowserBash so nothing leaves your machine."
date: 2026-04-29
category: llm
---

Most AI browser tools start with a setup step you cannot skip: paste an API key. Before you have driven a single page, you have signed up for an account, generated a token, dropped it into an environment variable, and accepted that every page your agent touches will be shipped to someone else's data center and metered by the token. **Browser automation without API keys** removes that whole preamble. The model runs on your own hardware through a local LLM, the browser runs on your own machine, and the only traffic crossing the network is the requests your test was always going to make. No key, no account, no per-token meter, no page snapshots leaving the building.

This article is about how that actually works in practice, and where it does not. I will walk through running fully offline AI browser automation with [BrowserBash](https://browserbash.com), a free, open-source CLI that defaults to local models via Ollama, and I will contrast it honestly with the cloud-only agents most people reach for first — OpenAI's Operator and Browserbase. There are real reasons those hosted products exist, and I will name them. But if your goal is to keep data on your machine, run a thousand iterations without a billing dashboard, and never touch a key, the local path is genuinely viable today.

## Why API keys became the default (and why that is a problem)

The reason almost every AI agent demands a key is structural, not malicious. The capable models — the ones that can look at a messy page and figure out which button completes a checkout — have historically lived behind hosted APIs. To use them you authenticate, and authentication means a key. The key is also how the vendor meters you, rate-limits you, and ties usage back to a billing account. So the key is not really about your browser at all; it is about getting access to a model you do not control.

That arrangement carries three costs that show up the moment you try to use these tools on real work.

The first is **data exposure**. A browser agent works by feeding the model a representation of the current page — often a screenshot, often the accessibility tree or DOM — at every single step. If the model is hosted, every one of those snapshots is an outbound request. The pages you most want to automate are frequently the ones you least want to ship to a third party: internal admin panels, staging behind a VPN, dashboards rendering real customer records, checkout flows with payment fields on screen. "The page never left our network" stops being a nice-to-have the second you are under a data-processing agreement.

The second is **cost that scales with how messy your work is**. Browser automation is token-hungry by nature. Each step hands the model a fresh view of the page, and a flow that retries a couple of times quietly multiplies that. Debugging an intermittent failure by running the same flow forty times is exactly the workflow that lights up a hosted invoice. You end up rationing runs to protect the budget, which is the opposite of how you want to iterate.

The third is **procurement friction**. Getting an API key approved inside a company can take longer than writing the automation it would power. Even once approved, you inherit shared rate limits that throttle precisely when your CI fleet spins up twenty parallel jobs during a release.

None of these are problems with the *idea* of AI browser automation. They are problems with renting the model. Move the model onto your own hardware and all three soften at once.

## What "no API keys" actually requires

To run browser automation without API keys, three pieces of the pipeline have to stay local. It is worth being precise, because "local" gets used loosely in this space.

1. **The browser.** It has to be a real browser already installed on your machine, not a headless cloud browser you rent by the minute. The page renders locally, JavaScript executes locally, cookies live in a local profile.
2. **The language model.** This is the piece that usually forces a key. You need an open-weight model running on your own CPU or GPU through a local runtime. [Ollama](https://ollama.com) is the common choice: it serves models on `http://localhost:11434` and needs no account, no key, no credit card.
3. **The orchestration.** The thing that plans steps, calls the model, issues browser actions, and writes results has to run as a local process too, with no telemetry beacon firing by default.

Get all three local and you have a hard, easy-to-reason-about property: nothing leaves your machine unless you explicitly choose to send it. That is the whole point of the category, and it is the property the cloud-only agents structurally cannot offer.

## How BrowserBash does browser automation without API keys

BrowserBash is built Ollama-first. When you run it, it resolves a model in a specific order: it looks for a local Ollama instance first, then falls back to `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. If Ollama is running and a model is pulled, that is what it uses — no key required, nothing configured. The default path *is* the local path. You do not opt into privacy; you opt out of it if you ever want a hosted model.

Install is a single npm command, and there is no signup gate to run it:

```bash
npm install -g browserbash-cli
```

You write a plain-English objective and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — then returns a verdict plus structured results. Here is a complete offline run against a local model:

```bash
# Pull a capable mid-size local model once
ollama pull qwen3:32b

# Drive your real Chrome with that model — no key, nothing uploaded
browserbash run "Go to the staging store, log in as the test user, \
  add the blue running shoes to the cart, complete checkout, \
  and verify the page shows 'Thank you for your order!'"
```

That run touches no API key. The objective text, the page content the agent reasons over, and the data it extracts all stay on your machine. The only network traffic is your browser loading the staging store — exactly what would happen if a human ran the flow by hand. You can do this on an air-gapped laptop and it behaves identically, because there is no telemetry path that fires by default.

When you *do* want a video record or a verifiable artifact, those are local too. Add `--record` and you get a screenshot plus a full `.webm` session video on any engine, written to disk:

```bash
browserbash run "Search for 'wireless keyboard', open the first result, \
  and confirm the price is visible" --record
```

Nothing about `--record` phones home. The webm lands in a local folder. If you want a browsable history of runs with per-run replay without leaving your machine, there is a fully local dashboard:

```bash
browserbash dashboard
```

The only time anything leaves your machine is when you explicitly opt in with `browserbash connect` and pass `--upload` to push a run to the free cloud dashboard. That is a deliberate, visible action — not a default. Free uploaded runs are kept 15 days. If you never type `--upload`, the cloud side simply does not exist for you.

### The honest caveat about small local models

Local models are not magic, and pretending otherwise would do you no favors. Very small models — roughly 8B parameters and under — tend to be flaky on long, multi-step objectives. They lose the thread, misread which element does what, or declare success prematurely. For a two-step smoke check they are often fine. For a ten-step checkout with conditional dialogs, they are a coin flip.

The sweet spot for reliable offline automation is a mid-size local model: think Qwen3 or a Llama 3.3 70B-class model, run on a machine with enough VRAM or unified memory to keep it responsive. That is where you get the privacy and the $0 model bill *and* the step-to-step reliability that makes the tool worth running in CI. If your hardware cannot hold a model that size and you have a genuinely hard flow, that is exactly the situation where reaching for a capable hosted model — by setting one key — is the pragmatic call. Browser automation without API keys is a default worth defending, not a religion worth losing a release over.

## The cloud-only contenders: Operator and Browserbase

To make the comparison fair, you have to be clear about what the cloud-first tools are actually for, because they are not failed attempts at local automation. They are well-built products solving a different problem.

**OpenAI Operator** is a browser-using agent that does tasks for a person. It looks at a rendered page, decides what to click or type, and acts — the way a human would — instead of relying on hand-written selectors. That vision-driven design lets it handle sites it has never seen. Architecturally, the things that matter for this comparison are public: Operator runs inside OpenAI's own hosted cloud environment, on a browser they provide, reached through a hosted interface rather than your terminal. It pauses to hand control back to you for sensitive moments like logging in or entering payment details — a deliberate human-in-the-loop safety design for a consumer agent acting on real accounts on the live internet. Pricing and packaging have shifted as the product evolved; as of 2026 the consumer experience has been tied to OpenAI's paid subscription tiers, and the underlying computer-use capability has been exposed to developers via API. I will not quote a number that might be stale. The point that does not change: Operator is optimized for a person getting a real-world task done, and it is hosted by design. There is no local mode and no no-key mode.

**Browserbase** is infrastructure, not an agent. It provides hosted, managed headless browsers in the cloud that your code or your agent connects to — a browser-as-a-service layer with features like session management, scaling, and stealth. It is genuinely good at what it does: when you need to run many browser sessions in parallel, from cloud IPs, without managing your own browser fleet, that is the problem Browserbase solves. But the browser lives in their cloud, which means the pages you automate render on their infrastructure and you authenticate to reach it. (Browserbase is also the team behind Stagehand, the MIT-licensed engine BrowserBash uses by default — a nice illustration that "cloud-only company" and "useful open-source contribution" are not mutually exclusive.)

Neither tool is trying to be a no-key, fully-local automation runner. That is not a knock; it is just a different axis. The question is which axis matters for your work.

## Side-by-side: local-first vs cloud-only

Here is the honest comparison. I have kept it to things that are publicly known or directly verifiable, and left cells as "not publicly specified" rather than guess.

| Dimension | BrowserBash (local-first) | OpenAI Operator | Browserbase |
|---|---|---|---|
| API key required to start | No (Ollama-first; key optional) | Yes (OpenAI account/sub) | Yes (Browserbase account) |
| Where the browser runs | Your machine (default) | OpenAI's cloud | Browserbase cloud |
| Where the model runs | Your machine (local LLM) | OpenAI's cloud | N/A — it's the browser layer, you bring the model |
| Can run fully offline / air-gapped | Yes, with local model | No | No |
| Per-token / per-minute model bill | $0 on local models | Tied to paid tiers (as of 2026) | Usage-based for browser sessions |
| Data leaves your network by default | No (only with `--upload`) | Yes (hosted by design) | Yes (pages render in their cloud) |
| Built for CI / machine-readable output | Yes (`--agent` NDJSON, exit codes) | Not packaged as a test runner | It's infra; you build the runner |
| Open source / license | Yes, Apache-2.0 | No, proprietary | Browser service proprietary; Stagehand is MIT |
| Best at | Private, no-key, committable QA | A person doing real-world web tasks | Scaling many cloud browser sessions |

The pattern is clear. If your priority is that data never leaves your machine and you never touch a key, the local-first approach wins on exactly those axes. If your priority is a consumer agent doing errands, or massive parallel cloud-browser capacity, the hosted tools win on theirs. They are not competing for the same job most of the time.

## Where each tool is genuinely the better fit

Credibility beats hype, so let me be plain about when *not* to reach for the local, no-key path.

**Choose a hosted consumer agent like Operator when** the task is a one-off real-world errand for a person — book the flight, fill out the government form, place the order — and you want a polished, supervised experience with the model handling unfamiliar sites gracefully. You are not trying to get a repeatable pass/fail back into a pipeline; you are trying to get a thing done once. For that, a no-key local runner is the wrong shape entirely.

**Choose Browserbase (or a similar managed-browser service) when** you need hundreds of concurrent browser sessions from cloud IPs, you do not want to run your own browser fleet, and the data-residency question is not a blocker for your use case. Web scraping at scale, distributed crawling, running browsers from many geographies — that is their wheelhouse, and trying to replicate it on one laptop with a local model is the wrong tool. Notably, BrowserBash can *use* Browserbase as a provider when you want exactly that, which I will come back to.

**Choose local, no-key automation with BrowserBash when** any of these are true: the surface under test is sensitive and cannot leave your network; you want to iterate freely without watching a token meter; you cannot get an API key approved in a reasonable timeframe; or you want committable, machine-readable test artifacts that live in your repo. This is the QA-and-internal-tools sweet spot, and it is where the no-key story pays off every single run. You can read more about the local-first design on the [features page](https://browserbash.com/features) and see real flows in the [case study](https://browserbash.com/case-study).

## Provider flexibility: local by default, cloud when you ask

One thing worth being explicit about: choosing local-first does not mean you are locked out of the cloud when you actually need it. In BrowserBash, *where the browser runs* is a separate decision from *which model drives it*, and both are one flag away.

The provider — where the browser actually executes — is controlled with `--provider`. The default is `local`, your own Chrome. But the same objective can run against any DevTools endpoint (`cdp`), or against managed cloud grids like `browserbase`, `lambdatest`, or `browserstack` when you need cross-browser coverage or parallel scale:

```bash
# Same plain-English objective, run on a cloud grid for cross-browser coverage
browserbash run "Log in and verify the dashboard loads the user's name" \
  --provider lambdatest
```

That is the pragmatic posture. Stay local and key-free for the bulk of your runs where privacy and cost matter most, and reach for a cloud provider on the runs where breadth or scale matters more. You are not forced to pick one philosophy for everything. The [learn section](https://browserbash.com/learn) walks through each provider in detail.

The same separation applies to the model. Local Ollama is the default, but you can point at OpenRouter — which includes genuinely free hosted models such as `openai/gpt-oss-120b:free` — or bring your own Anthropic Claude key for the hardest flows. The resolution order means the moment you remove those keys from the environment, you are back to fully local with zero config changes.

## A no-key workflow that survives in CI

The reason this matters beyond a demo is that browser automation without API keys can be made *repeatable*. Two BrowserBash features turn an ad-hoc local run into something a pipeline can rely on.

The first is **agent mode**. Pass `--agent` and the CLI emits NDJSON — one JSON event per line on stdout — instead of prose. Exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. That is built for CI and for AI coding agents that need to consume results programmatically, with no brittle log-scraping. Combined with a local model, you get a CI step that costs nothing per run and leaks nothing.

```bash
browserbash run "Verify the login page rejects an empty password \
  with a visible error" --agent --headless
```

The second is **markdown tests**. You can commit `*_test.md` files to your repo where each list item is a step, compose them with `@import`, and template with `{{variables}}`. Critically for the no-key, privacy story: variables marked as secrets are masked as `*****` in every single log line, so credentials never appear in output even when a run fails verbosely. After each run BrowserBash writes a human-readable `Result.md` next to the test.

```bash
browserbash testmd run ./checkout_test.md \
  --var BASE_URL=https://staging.example.com \
  --secret PASSWORD=hunter2
```

A `checkout_test.md` is just readable English that doubles as living documentation:

```markdown
# Checkout smoke test

- Go to {{BASE_URL}}
- Log in as test@example.com with password {{PASSWORD}}
- Add the first product to the cart
- Complete checkout
- Verify the page shows "Thank you for your order!"
```

Run that against a local model and you have a committable, secret-masked, machine-readable regression check that touches no API key and ships no page data anywhere. That combination — local model, local browser, masked secrets, NDJSON exit codes — is the practical payoff of the whole approach. You can browse more patterns like this on the [blog](https://browserbash.com/blog).

## Setting expectations: what to verify before you commit

Before you wire a local, no-key setup into a real pipeline, sanity-check a few things so you are not surprised later.

**Hardware headroom.** A mid-size model wants real memory. Confirm your CI runners or dev machines can actually hold a Qwen3 / Llama 3.3 70B-class model at a usable speed. If they cannot, decide up front whether you will run a smaller model and accept it for simple flows only, or set a single hosted key for the hard ones.

**Flow complexity.** Map which of your flows are short and deterministic (great for small local models) versus long and branchy (need a mid-size or hosted model). You do not have to use the same model everywhere; match the model to the flow.

**Artifact policy.** Decide whether you ever want runs uploaded. If you are in a regulated environment, you may want a blanket "never `--upload`" rule, and the good news is that is the default behavior — you have to do nothing to keep it that way. If you want shareable replays for a few non-sensitive flows, those can opt in individually.

Get those three decisions right and the no-key, local-first setup is not a compromise. It is a faster, cheaper, more private way to run the same automation you were going to run anyway.

## FAQ

### Can you really do browser automation without any API keys?

Yes. With a local LLM runtime like Ollama serving an open-weight model on your own machine, plus a CLI that defaults to that local model, you can run AI browser automation end to end with no key, no account, and no credit card. BrowserBash resolves a local Ollama instance first, so the default path requires no key at all. You only need a key if you deliberately choose a hosted model later.

### Is a local model good enough to drive a real browser reliably?

It depends on the model size and the flow. Very small models around 8B parameters and under can be flaky on long, multi-step objectives and may declare success too early. A mid-size local model in the Qwen3 or Llama 3.3 70B class is the reliable sweet spot for complex flows, while small models are fine for short smoke checks. Match the model to the difficulty of the task.

### Does running locally mean nothing leaves my machine?

With a local model and the local browser provider, yes — the page content, your objective text, and any extracted data all stay on your machine, and there is no telemetry that fires by default. The only exception is when you explicitly run `browserbash connect` and pass `--upload` to push a run to the optional cloud dashboard. If you never use `--upload`, the setup works identically on an air-gapped laptop.

### How is this different from OpenAI Operator or Browserbase?

Operator is a hosted consumer agent that does real-world tasks for a person, and Browserbase is a cloud service that runs managed headless browsers for you — both are cloud-only by design and require accounts. The local-first approach keeps both the model and the browser on your machine, needs no key, and produces committable, machine-readable test results. Choose the hosted tools when you need consumer-task polish or massive cloud-browser scale; choose local when privacy, cost, and a no-key workflow matter most.

## Get started

You can run private, no-key, fully offline AI browser automation in a couple of minutes. Install the CLI, make sure Ollama is serving a capable local model, and point a plain-English objective at your app:

```bash
npm install -g browserbash-cli
```

No account is required to run it — the cloud dashboard is strictly optional. If you do want shareable run history and per-run replays later, you can [sign up](https://browserbash.com/sign-up) for the free dashboard whenever it is useful. Either way, the default stays the same: your model, your browser, your machine, no key.
