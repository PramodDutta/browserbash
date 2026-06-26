---
title: No GPU? Running BrowserBash on a Low-End Machine in 2026
description: "Run BrowserBash without a GPU: AI browser testing on a low-end machine by offloading the model to a hosted provider while the light browser runs local."
date: 2026-06-26
category: llm
---

Short answer first, because it is the whole reason you are here: yes, you can **run BrowserBash without a GPU**, and you do not need a powerful machine at all. This is the direct response to a question Artur Kuznetsov asked on Product Hunt, "my machine isn't powerful enough to drive local models. Can I use an AI subscription instead?" You can. The heavy part of AI browser automation is the language model, not the browser, and the model is the one piece you can hand off to a hosted provider. The browser is light. It runs fine on a modest laptop, or you can push that into the cloud too. Either way, your hardware stops being the bottleneck.

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real browser step by step, and you get a pass/fail verdict plus any structured data it extracted. The default model setting is `auto`, and `auto` resolves in a specific order: it looks for a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. That resolution order is the key to running on weak hardware, because it means the moment you set a hosted key, BrowserBash uses the hosted model instead of trying to load anything locally. No GPU required, no config file to edit.

This article walks through three concrete setups, from "hosted model, local browser" to "nothing touches my machine," plus the honest tradeoffs on privacy, speed, and cost.

## Why your hardware is not actually the problem

When people say a machine "can't run the model," they mean the local model. A capable open-weight model run through something like Ollama wants real memory and ideally a GPU, because a 70B-class model is genuinely large. A small 8B model will load on a modest machine, but it gets flaky on long, multi-step flows (more on that below).

The browser is a completely different weight class. Driving a Chrome or Chromium window, clicking, typing, reading the page, that is the kind of thing a five-year-old laptop does all day without breaking a sweat. So the architecture that makes BrowserBash work on weak hardware is simple: keep the browser local (cheap) and move the model to a provider that owns the GPUs (their problem, not yours). That split is exactly what an "AI subscription instead" buys you. You rent the expensive part by the token and keep the cheap part on your own machine.

## Setup 1: Hosted model with your own key (Claude or OpenRouter)

This is the most common low-end-machine setup, and it is almost embarrassingly simple because of how `auto` resolution works. You do not need to pass a special flag to switch to a hosted model. You just need the right environment variable set, and `auto` will skip the (absent) Ollama install and use it.

If you have an Anthropic Claude key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."

browserbash run "Go to https://staging.example.com, log in as the \
  test user, add the first product to the cart, complete checkout, \
  and verify the page shows 'Thank you for your order!'"
```

That is the whole change. With no Ollama running, `auto` falls through to `ANTHROPIC_API_KEY`, the model runs in Anthropic's data center, and the browser runs locally on your machine. Your laptop never has to hold a model in memory.

If you would rather route through OpenRouter, which is a single gateway in front of hundreds of models, set its key instead:

```bash
export OPENROUTER_API_KEY="sk-or-..."

browserbash run "Search for 'wireless keyboard', open the first \
  result, and confirm the price is visible"
```

Same idea: `auto` finds `OPENROUTER_API_KEY` and uses a hosted model through OpenRouter. You can be explicit about which model you want with `--model` (covered next), but for a default run, the key alone is enough.

The mental model to keep: setting a hosted key does not just "enable" the cloud, it changes what the default `auto` setting resolves to. Remove the key from your environment and you are back to local-first with zero config changes. If you want a deeper tour of how this resolution behaves and how to read which backend a run actually used, the [choosing a model tutorial](https://browserbash.com/blog/browserbash-choosing-a-model-tutorial) walks through it.

## Setup 2: Free hosted models on OpenRouter for a genuine $0 bill

The first setup solves the hardware problem but introduces a cost: most hosted models are metered per token. If your machine is weak *and* you want to keep the bill at zero, OpenRouter exposes a slice of its catalog as genuinely free models. On a weak machine, this is the closest thing to "free local automation" without needing the hardware to run a model locally.

Point at a free model id with `--model`. A solid tool-capable pick is `openai/gpt-oss-120b:free`:

```bash
export OPENROUTER_API_KEY="sk-or-..."

browserbash run "Go to the docs site, open the pricing page, and \
  verify a free tier is listed" \
  --model "openai/gpt-oss-120b:free"
```

The model runs on OpenRouter's infrastructure, the browser runs on your machine, and the `:free` suffix means you are not paying per token for that model. For a low-end machine that cannot host a model locally, this is the genuinely $0 path.

Two honest caveats, because the brief here is zero hype. Free hosted models are **rate-limited**, so you cannot hammer them with a large parallel CI fleet, and they are generally **slower** than paid tiers. For inner-loop development and small suites, that is usually a fine trade. For a fast, high-volume pipeline, you will likely outgrow the free tier and either pay for a faster hosted model or move heavy runs onto local hardware that can hold a model. There is a dedicated walkthrough of this path in [free OpenRouter models for browser testing](https://browserbash.com/blog/openrouter-free-models-browser-testing) if you want the model-selection details and CI patterns.

## Setup 3: A truly minimal machine, hosted model plus remote browser

Setups 1 and 2 still run the browser locally. That is light, but it is not nothing. If your machine is *really* constrained, a cheap cloud box, a thin client, a CI runner with no display, you can offload the browser too. Then neither the model nor the browser needs your hardware.

In BrowserBash, *where the browser runs* is a separate decision from *which model drives it*, controlled by `--provider`. The values are `local` (the default, your own Chrome), `cdp` (attach to any DevTools endpoint), and the managed cloud grids `browserbase`, `lambdatest`, and `browserstack`. To run the browser in the cloud via Browserbase while a hosted model does the thinking:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export BROWSERBASE_API_KEY="bb-..."
export BROWSERBASE_PROJECT_ID="..."

browserbash run "Log in and verify the dashboard loads the user's \
  name" --provider browserbase
```

Now trace the workload: the model runs in Anthropic's cloud (because the key is set), the browser runs in Browserbase's cloud (because of `--provider browserbase`), and your machine is doing little more than sending an objective and printing the verdict. Both heavy pieces live elsewhere. The same pattern works with `--provider lambdatest` or `--provider browserstack` if you also want cross-browser coverage from a real grid. The [learn hub](https://browserbash.com/learn) covers each provider in detail.

The tradeoff, naturally, is that this is the least private and most cost-bearing of the three, since both the model and the browser are now hosted services. Choose it when your hardware constraint is the dominant factor and the data you are touching is not sensitive.

## Rough sizing guidance: when local is fine and when it is not

To decide whether you even need the hosted route, match the model to the difficulty of the flow.

- **Short objectives on a modest machine.** A small local model (around 8B or under, via Ollama) is often fine for a two or three step smoke check, "is the homepage up and does the login button render." These fit on modest hardware and cost nothing.
- **Long, multi-step flows.** A twelve-step journey through auth, search, cart, and payment wants a 70B-class local model or a hosted model. Small models lose the thread on long flows, click the wrong control, or declare success prematurely. That is a model-size problem, not a tool problem.
- **Your machine cannot hold a 70B model.** This is the exact situation the hosted route answers. If you have a hard flow and the hardware to run a big local model, run it locally. If you have a hard flow and you do not, set a hosted key and let a provider carry the model. Do not run a hard flow against an 8B model on a weak laptop and then blame the run for being flaky.

So the decision tree is short. Modest machine plus short flows: small local model, free, nothing leaves your machine. Hard flows but capable hardware: big local model. Hard flows and weak hardware: hosted model (Setup 1 or 2), and add a remote browser (Setup 3) if even the browser is too much. If you do have the hardware for local models, the [Ollama local models tutorial](https://browserbash.com/blog/browserbash-ollama-local-models-tutorial) shows how to pull one and let `auto` pick it up.

## The privacy tradeoff, stated honestly

This is the part that is easy to gloss over, so here it is plainly. A hosted model means your prompts leave your machine.

A browser agent feeds the model a representation of the current page at every step, often the accessibility tree or DOM, sometimes a screenshot, plus your objective text. With the fully local Ollama default, all of that stays on your machine and nothing crosses the network except the requests your test was always going to make. The moment you switch to a hosted model (any of the three setups above), those page representations and objectives become outbound requests to that provider. With a remote browser (Setup 3), the pages also render on the provider's infrastructure.

That is not a reason to avoid hosted models. It is a reason to choose deliberately:

- **Sensitive surface (internal admin panels, staging behind a VPN, dashboards with real customer data, payment fields on screen):** prefer the fully local path if your hardware can run a usable model. If it cannot, treat the hosted model as a data processor, check it against whatever data-processing agreement you operate under, and prefer a key you control (Setup 1) over anything that pools data.
- **Public or non-sensitive surface (marketing site, public docs, a demo app):** the hosted route is low-risk and the convenience is worth it. Reach for the free OpenRouter path (Setup 2) and do not overthink it.

The general rule: the more sensitive the page content, the more you should weight keeping the model local. For the broader picture on handling credentials and secrets safely (which matters regardless of where the model runs), see [credentials and secrets safety for AI browser automation](https://browserbash.com/blog/ai-browser-automation-credentials-secrets-safety).

## The honest limits

To keep this zero-hype, the constraints of the hosted route, in one place:

- **Free hosted models are slower and rate-limited.** Great for development and small suites, not for a fast high-volume pipeline. You will eventually pay for speed or move heavy runs to local hardware.
- **Hosted means data leaves your machine.** Covered above. It is a real tradeoff, not a footnote.
- **Cost scales with usage on paid models.** Browser automation is token-hungry by nature, each step hands the model a fresh view of the page, and a flow that retries a few times multiplies that. On a metered model, debugging an intermittent failure by running the same flow forty times is exactly the workflow that runs up a bill. Keep an eye on usage, lean on free models or a local model for the noisy iteration loop, and reserve paid hosted models for the runs that need the capability.

None of these change the headline answer. You do not need a powerful machine. You need to know which of the three setups fits your flow, your data sensitivity, and your budget.

## FAQ

### Can I run BrowserBash without a GPU at all?

Yes. The GPU is only needed to run a capable model locally. If you set `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`, the default `auto` setting resolves to that hosted model and the model runs on the provider's hardware. The browser is light and runs fine on a modest CPU-only machine, or you can offload it too with `--provider browserbase`. No local GPU is involved in either case.

### Do I need to change a setting to use a hosted model instead of a local one?

No. With the default `auto`, BrowserBash resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. If you have no Ollama install and you export a hosted key, `auto` simply uses the hosted model. The only time you need `--model` is when you want to pin a specific model, for example a free OpenRouter id like `openai/gpt-oss-120b:free`.

### What is the cheapest way to do AI browser testing on a low-end machine?

Set `OPENROUTER_API_KEY` and run with `--model "openai/gpt-oss-120b:free"`. The model runs free on OpenRouter and the browser runs locally, so the bill is genuinely $0. Expect it to be slower and rate-limited, which is fine for development and small suites but not for high-volume CI. If your machine can hold a small local model, the fully local Ollama default is also $0 and keeps data on your machine.

### Is a hosted model less private than running locally?

Yes, and it is worth being clear about. A hosted model receives the page content and your objective at each step, so that data leaves your machine, unlike the fully local Ollama default where nothing does. Choose local for sensitive surfaces (internal tools, staging, real customer data) when your hardware allows it, and use a hosted model freely for public or non-sensitive pages. When you must use a hosted model on sensitive data, prefer a key you control and check it against your data-processing requirements.

## Get started

You can be running AI browser automation on a weak machine in a couple of minutes. Install the CLI, set one hosted key, and point a plain-English objective at your app:

```bash
npm install -g browserbash-cli
export ANTHROPIC_API_KEY="sk-ant-..."   # or OPENROUTER_API_KEY

browserbash run "Open the login page and verify it rejects an \
  empty password with a visible error"
```

That is a hosted model carrying the heavy work and your own machine doing the light part. From there, swap in a free OpenRouter model to drop the bill to zero, or add `--provider browserbase` to offload the browser as well. The full set of run options lives on the [features page](https://browserbash.com/features), and the [learn hub](https://browserbash.com/learn) walks through model choices and providers in more depth. Your hardware is not the bottleneck anymore.
