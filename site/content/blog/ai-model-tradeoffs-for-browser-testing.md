---
title: Which Model for Browser Testing? Cost, Latency, Accuracy
description: "The best model for AI browser testing depends on flow complexity and budget. LLM model tradeoffs for testing across cost, latency, accuracy, and privacy."
date: 2026-06-26
category: llm
---

There is no single best model for AI browser testing. You pick by matching the complexity of the flow you are testing to the capability of the model, and then trimming for budget, latency, and privacy. A short smoke check on a stable page does not need the same brain as a multi-step checkout with conditional branches, and paying frontier-model prices to assert that a page title rendered is waste. This article gives you a clearly illustrative tradeoff table across four realistic options, a decision guide keyed to the kind of flow you are running, and an honest section on why you should benchmark on your own flows rather than trust any table, including this one.

The examples use [BrowserBash](https://browserbash.com/features), a free open-source (Apache-2.0) command-line tool from The Testing Academy that drives a real Chrome browser from plain-English objectives. Its model layer is provider-agnostic, so the same test can run against a tiny local model, a 70B-class local model, a hosted frontier model, or a free hosted model with nothing more than a config change. That flexibility is exactly what makes the model choice a real decision rather than a vendor lock-in, so it is worth understanding the tradeoffs before you commit a suite to one option.

## The short answer: match the flow to the model

Browser tests are not uniform. The reasoning a model has to do varies enormously between "open this page and confirm the heading says Dashboard" and "log in, add two items to the cart, apply a coupon that only works above a threshold, and verify the discounted total." The first is a single observation. The second is a plan with state, conditionals, and several points where the page can surprise the agent.

Model capability scales with that demand. Small models are perfectly competent at short, well-scoped objectives and fall apart on long ones, where a single wrong turn early compounds into a failed run. Larger models hold a plan together across many steps and recover from unexpected page states more reliably. So the decision rule is simple to state: use the smallest model that reliably completes the flow you are testing, and reach for a bigger one only when the flow's complexity demands it. The rest of this article is about putting numbers and names to that rule, starting with how the four main options actually compare.

## The four options, compared

Below is a clearly illustrative comparison. The ratings are qualitative and directional, not measured benchmark scores, and the landscape shifts month to month. Treat it as a map of the tradeoff space, not a leaderboard. The four options are the ones BrowserBash supports directly, and they cover the realistic spectrum from "runs on a laptop for free" to "calls out to the strongest reasoning available."

| Option | Cost | Latency | Accuracy on complex flows | Hardware needed | Privacy |
|---|---|---|---|---|---|
| **Small local model** (8B or smaller, via Ollama) | $0, no bill | Fast | Weak, flaky on long multi-step objectives | Modest: a normal laptop or desktop | Local: nothing leaves your machine |
| **Mid/large local model** (70B-class: Qwen3, Llama 3.3) | $0, no bill | Moderate, depends on your hardware | Strong, handles complex flows well | Capable: a good GPU or a lot of RAM | Local: nothing leaves your machine |
| **Hosted frontier model** (Claude via your API key) | Per token, a real bill | Moderate, network-bound | Strongest reasoning on the hardest flows | None local | Hosted: prompts leave your machine to the provider |
| **Free hosted model** (OpenRouter, for example `openai/gpt-oss-120b:free`) | $0, no bill | Slower, and rate-limited | Good, but throttling interrupts long runs | None local | Hosted: prompts leave your machine to the provider |

A few notes on reading that table, because the columns interact in ways a single glance can hide.

### Cost is not just the dollar figure

Both local options and the free hosted option show $0, but the costs are different in kind. Local models cost you nothing per run and nothing per token, but the 70B-class option costs you hardware up front, either a capable GPU or a machine with a lot of RAM. The free hosted option costs you nothing in money or hardware but costs you throughput, because rate limits cap how fast you can push runs through. The hosted frontier model is the only one with a literal per-token bill, and that bill is the price of not needing any local hardware and getting the strongest reasoning on the table. The right way to think about it is total cost of ownership for your situation, not the sticker. For a detailed treatment of how this plays out across a suite, see the [cost per run breakdown](/blog/cost-per-run-ai-browser-testing).

### Latency is workload-shaped

A small local model on a decent machine often feels the snappiest for short objectives because there is no network hop and the model is light. A 70B-class local model is heavier and its speed is bounded by your hardware, so it can be quick on a strong GPU and sluggish on a marginal one. Hosted models add a network round trip per step, which is usually fine but adds up over a long flow. Free hosted models are the slowest in practice, not because the model is weak but because rate limiting forces waits between requests. If you are running one test interactively, latency barely matters. If you are running hundreds in CI, it compounds, and that is where the decision guide below earns its keep.

### Accuracy on complex flows is the column that actually drives the decision

This is the one that should anchor your choice. A small local model is genuinely fine for a five-step happy path on a stable page and genuinely unreliable on a fifteen-step flow with conditionals, because errors early in a long plan compound. The 70B-class local models and the hosted frontier model are where hard flows become dependable. The free hosted 120B-class model sits in a good place on raw capability but gets interrupted by throttling on the longest runs, which can look like an accuracy problem when it is really a rate-limit problem. Keep that distinction in mind when a free hosted run fails partway, because the fix is patience or a different tier, not a different prompt.

### Privacy is binary in the way that matters

Either the page content and your prompts stay on your machine or they go to a provider. Local models (small or 70B-class) keep everything on the machine, which matters when you are testing against internal staging environments, pages behind auth that show real customer data, or anything covered by a data-handling policy. Both hosted options send prompts, which include observations about the page, off your machine. That is not automatically disqualifying, but it is a real line that some teams cannot cross, and it often settles the decision before cost or latency enter the picture.

## How `auto` resolves a model for you

BrowserBash defaults its model setting to `auto`, which resolves in a fixed priority order so the tool does something sensible without configuration. Understanding the order tells you exactly which option you will get on a given machine, and it is short enough to memorize.

1. **Ollama** first, if a local model is available. This is the local, free, private path, and it wins when present because it costs nothing and leaks nothing.
2. **`ANTHROPIC_API_KEY`** next, if that environment variable is set. This routes to a hosted frontier Claude model for the strongest reasoning.
3. **`OPENROUTER_API_KEY`** last, which opens up OpenRouter's catalog, including free models like the 120B-class option in the table.

The order is deliberate. Local and private comes first because it is the cheapest and safest default. A frontier key comes next because if you have paid for one, you probably want its capability. OpenRouter is the broad fallback that still works with no local setup and even with no paid key, thanks to its free tier. You can always override `auto` and name a specific model, but the resolution order is what runs when you do not. For a full walkthrough of choosing and pinning a model, the [choosing a model tutorial](/blog/browserbash-choosing-a-model-tutorial) goes deeper than this article has room for.

## Decision guide by flow type

Here is the part you can act on today. Match the kind of flow you are testing to the option that fits, and reach for more capability only when the flow earns it.

### Smoke test on a stable page: small local model

If the objective is short and the page rarely changes (confirm the homepage loads, the nav renders, the login form is present), a small local model via Ollama is the right call. It is free, fast, and private, and the flow is simple enough that its weakness on long objectives never comes into play. Running these on a developer laptop with no API key and no bill is the whole point, and the small model handles it without breaking a sweat. If your machine is modest, the guide on [running BrowserBash without a powerful machine](/blog/run-browserbash-without-a-powerful-machine) shows exactly how light you can go.

### Complex checkout with conditionals: 70B-class local or hosted frontier

When the flow has state and branches (a coupon that only applies above a threshold, a shipping step that appears for some carts, a payment path with validation) you need a model that holds a plan together and recovers from surprises. That means a 70B-class local model if you have the hardware, or a hosted frontier model if you do not. Both are dependable here where a small model is flaky. The choice between them comes down to privacy and hardware: if the data is sensitive or you already own a capable GPU, go local; if not, the hosted frontier model spares you the hardware and tends to be the strongest on the genuinely hard cases.

### CI bulk runs: local or free hosted, for cost

When you are running a large suite on every push, per-token cost dominates and you want $0 per run. A 70B-class local model on a CI runner with enough resources is ideal if the flows are complex, and a small local model is fine for the simple ones. If you cannot provision capable hardware on your runners, a free hosted model keeps the bill at zero, with the caveat that rate limits will slow throughput, so budget wall-clock time accordingly. The piece on [OpenRouter free models for browser testing](/blog/openrouter-free-models-browser-testing) covers how to lean on the free tier in CI without surprises.

### Highest-stakes, hardest flow: hosted frontier model

For the flow you cannot afford to get wrong (the checkout that touches real money, the regulated workflow, the one whose failure costs the most) use the hosted frontier model and pay the per-token cost. This is exactly where its strongest-reasoning advantage is worth the bill, and the cost of a missed regression dwarfs the cost of the tokens. Reserve it for the flows that justify it rather than running your whole suite on it, and the spend stays sane.

## Honest limits

A tradeoff table is a snapshot of a moving target, so here is where to be skeptical of it, including the one above.

**The landscape changes fast.** New open models land regularly, and a model that was middling last quarter can be a strong default this quarter. The names in the table (Qwen3, Llama 3.3, the 120B-class free option) are accurate as reference points today, but the right answer drifts. Re-evaluate periodically rather than treating any list as settled, because last quarter's pick is not automatically this quarter's.

**Accuracy is workload-dependent.** "Accuracy on complex flows" is not one number. It depends on your specific pages, how your DOM is structured, how dynamic the UI is, and how you phrase your objectives. A model that breezes through one team's checkout can struggle on another team's, purely because of how the application is built. The qualitative ratings here are directional, not a promise about your app, and they cannot substitute for measurement on the thing you actually ship.

**No measured prices or scores here on purpose.** This article deliberately avoids quoting specific per-token prices or benchmark numbers, because both move and because a number that is right for one workload misleads for another. The columns are qualitative for a reason, and you should be wary of any model comparison that hands you a precise accuracy percentage without telling you what flows it measured.

**Benchmark on your own flows.** The only model comparison that should decide your suite is the one you run yourself. Take your three or four most important flows, run each on a small local model, a 70B-class model, and a hosted frontier model, and look at the completion rate, the latency, and (for the hosted option) the cost. That gives you a table that is true for your application, which is the only kind that matters. The [cost per run breakdown](/blog/cost-per-run-ai-browser-testing) pairs naturally with that exercise, because once you know which models complete your flows, cost is what ranks the survivors.

## Putting it into practice

The fastest way to feel these tradeoffs is to run the same flow on two different models and watch the difference. Install the CLI:

```bash
npm install -g browserbash-cli
```

With `auto`, the tool picks Ollama if you have a local model, then a Claude key, then OpenRouter, so the path you get depends on what is set up on your machine. To compare deliberately, run a short smoke flow on a small local model and a complex flow on a 70B-class or hosted model, and you will see exactly why one column in the table cannot make the decision alone. From there, the [choosing a model tutorial](/blog/browserbash-choosing-a-model-tutorial) and the rest of the [learn hub](https://browserbash.com/learn) walk through pinning specific models and tuning for your workload.

## FAQ

### What is the best model for AI browser testing?

There is no single best model. The best choice is the smallest, cheapest model that reliably completes the flow you are testing. For short smoke checks on stable pages, a small local model is best because it is free, fast, and private. For complex flows with conditionals, a 70B-class local model or a hosted frontier model is best because they hold long plans together. For the highest-stakes flows, a hosted frontier model is worth its per-token cost. Match the flow to the model rather than picking one winner.

### Do I need an expensive GPU to run browser tests with a local model?

Not for simple flows. A small local model (8B or smaller) runs on a normal laptop or desktop and is well suited to short smoke checks. You only need a capable GPU or a lot of RAM for 70B-class models, which are the ones you reach for on complex multi-step flows. If your hardware is modest, you can run simple flows locally and route the complex ones to a free or hosted model instead, so you are never blocked by hardware alone.

### How does the `auto` model setting decide what to use?

The `auto` default resolves in a fixed order: Ollama first if a local model is available (local, free, private), then `ANTHROPIC_API_KEY` if set (hosted frontier Claude), then `OPENROUTER_API_KEY` (OpenRouter's catalog, including free models). It picks the first one available on your machine. You can override `auto` by naming a specific model, but if you do nothing, this order is what runs, so it pays to know which option your environment will land on.

### Can I run browser tests for free without any local hardware?

Yes. A free hosted model on OpenRouter, such as the 120B-class free option, costs nothing in money or hardware. The tradeoff is that free tiers are rate-limited and slower, so long or bulk runs take more wall-clock time. It is a good fit for CI when you cannot provision capable runners, as long as you budget for the throttling. See [OpenRouter free models for browser testing](/blog/openrouter-free-models-browser-testing) for the details on staying within the free tier.
