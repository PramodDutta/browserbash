---
title: Cost Per Run: What AI Browser Testing Actually Costs
description: "AI browser testing cost is $0 on local Ollama or free hosted models, or a per-token cost per test run on paid models. Here is how to model it."
date: 2026-06-26
category: llm
---

The short answer to "what does AI browser testing cost per run" is that the model bill can be exactly **$0**, or it can be a small per-token amount, and the difference is entirely a configuration choice you make. Run [BrowserBash](https://browserbash.com) against a local model on Ollama and the model bill is zero: nothing leaves your machine, and you pay only for the hardware and electricity you already own. Run it against a free hosted model and the bill is also zero, with the trade being rate limits and lower speed. Run it against a paid hosted model such as Claude and you pay a real per-run cost that scales with how long the flow is. That is the whole pricing surface. Everything below is about helping you put a defensible number on the paid path, decide when it is worth paying, and compare the result honestly against what your existing Selenium or Playwright suite already costs you in engineer time.

This is written for the person who has to defend a number in a budget meeting: an engineering manager or an SDET costing out AI-driven testing. Every figure here is **illustrative**. Real prices and token counts change constantly and vary run to run, so the goal is to give you a formula you can fill in with your own measured numbers, not a price list you can quote.

## The one formula that explains your bill

For paid hosted models, cost per run is governed by a single relationship:

```
cost_per_run = tokens_per_step  x  steps_per_run  x  price_per_token
```

That is it. Three inputs, and each one is a lever you can pull:

- **tokens_per_step** is how much text the model reads and writes on each action it takes. The agent looks at a representation of the page, reasons about what to do next, and emits an action. Bigger pages and chattier reasoning mean more tokens per step.
- **steps_per_run** is how many actions the flow takes end to end. A login is a handful of steps. A full "register, verify email, build a cart, check out, confirm the receipt" journey can be many times that.
- **price_per_token** is set by the model provider, and there are usually two rates (input tokens are priced differently from output tokens). You substitute the current published numbers for whatever model you picked.

The most important consequence falls straight out of the multiplication: **long multi-step flows cost more than short ones, roughly in proportion to their length.** Two short smoke checks can be cheaper than one sprawling end-to-end journey, even though that feels backwards if you are used to thinking in terms of "number of tests." With AI browser testing you are not billed per test, you are billed per step, and a single test can contain many steps.

This is also why the same suite can have a very different bill depending on which backend it runs against, with no change to the test text at all.

## The three cost regimes

BrowserBash resolves its model through a default `auto` setting that checks, in order, for a local Ollama install, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY`. Which one it lands on determines which of the following three regimes you are paying under.

### Local model on Ollama: $0 model bill

When `auto` finds Ollama, or when you point BrowserBash at a local model explicitly, the model bill is **zero**. There is no per-token charge because there is no provider invoice: the model runs on your own machine, and nothing about the page or the run leaves it. That last point matters for two reasons. It is a privacy property (sensitive internal dashboards never get sent to a third party), and it is a cost property (you cannot be billed for tokens that never crossed a network boundary).

What you do pay for is the hardware and the electricity. If you already have a machine capable of holding a tool-capable model, the marginal cost of an extra run is close to nothing. If you do not, the cost shows up as a one-time capital outlay or as the depreciation on a machine you bought anyway. For teams running high volumes of routine checks, this is usually the cheapest regime by a wide margin, because the per-run cost trends toward zero as volume goes up. If your hardware is modest, the companion guide on how to [run BrowserBash without a powerful machine](https://browserbash.com/blog/run-browserbash-without-a-powerful-machine) covers how to pick a small local model that still passes, or offload the heavy parts.

### Free hosted models: $0, with limits

Some hosted catalogs expose genuinely free model ids. On OpenRouter, for example, certain models carry a `:free` suffix (such as `openai/gpt-oss-120b:free`) and cost nothing to call. The model bill here is also **zero**, and you do not need to own capable hardware, which makes this a strong on-ramp for anyone whose laptop cannot hold a local model.

The honest trade is that free hosted models are **rate-limited** and generally **slower** and more heavily loaded than their paid counterparts. They are excellent for development, for smoke tests, and for CI gates that run a handful of flows. They are a poor fit for hammering thousands of long sessions per hour, because the rate limits will throttle you long before the (non-existent) bill becomes a problem. Specific free ids also come and go as providers add and retire them, so treat any id you see written down as an example to verify against the current catalog, not a permanent fixture. The deep dive on this path is in [free OpenRouter models for browser testing](https://browserbash.com/blog/openrouter-free-models-browser-testing).

### Paid hosted models: a real per-run cost

When `auto` resolves to a paid key (an `ANTHROPIC_API_KEY` for Claude, or a paid OpenRouter model), you are in the regime where the formula above produces an actual invoice. This is where capable frontier models live, and where hard flows that smaller models fail tend to succeed. You pay per token, the cost scales with flow length, and the question stops being "is it free" and becomes "is this run worth paying for." The next section is a worked example of putting a number on it.

## A worked example (illustrative numbers, fill in your own)

Everything in this section is **made up for illustration**. The point is the method, not the figures. Do not quote these numbers as real prices.

Suppose you want to estimate the cost of one login-and-checkout run on a paid model. You sit down with three placeholder numbers that you will later replace with your own measurements:

| Input | Placeholder value (illustrative) | Where the real number comes from |
| --- | --- | --- |
| tokens_per_step | 4,000 tokens | Measure it: run the flow once and read the per-step token usage |
| steps_per_run | 15 steps | Count the actions your flow actually takes end to end |
| price_per_token | $0.000004 per token (blended) | The provider's current published rate, blended across input and output |

Plug them in:

```
cost_per_run = 4,000  x  15  x  $0.000004
             = 60,000 tokens  x  $0.000004
             = $0.24 per run        (ILLUSTRATIVE: not a real price)
```

So in this made-up scenario, one checkout run costs about a quarter of a (fictional) dollar. Now scale it the way a budget meeting would:

- A nightly suite of **20 such flows**: about `20 x $0.24 = $4.80` per night (illustrative).
- The same suite run **per pull request, 40 times a day**: about `40 x $4.80 = $192` a day (illustrative).

Two things to notice. First, the per-PR number is what actually moves a budget, not the single-run number, and it is driven by **frequency**, which is a policy choice you control. Second, the moment you swap that paid model for a local or free one, the same table collapses to **$0** in the model column, and the only thing that changed was the backend, not a single line of test text.

To turn this from illustration into a real estimate, you only have to do one thing: run a representative flow once, read off your actual tokens_per_step and steps_per_run, look up the current price_per_token for your chosen model, and re-run the multiplication. That measured number is the only one worth taking to a meeting.

## Strategies to cut cost per run

Once you understand the three levers, the cost-reduction playbook writes itself. Each tactic attacks one of them.

### Run local or free for bulk, reserve paid for the hard flows

This is the single biggest lever. Most of any suite is routine: logins, navigation, form validation, smoke checks. Run all of that on a local model or a free hosted one, where the model bill is zero, and run it as often as you like. Reserve paid hosted models for the genuinely hard flows where a smaller model cannot keep up. Because BrowserBash uses the same plain-English objectives regardless of backend, you can route a flow to a different model by changing one setting, so a tiered policy ("free for CI, paid for the three flows that need it") costs you nothing in maintenance.

### Pick the smallest model that passes

Do not default to the most capable (and most expensive) model out of caution. Start small and step up only when a flow fails. A smaller model that reliably passes your flow is strictly cheaper per token and often faster, and the only way to know which is the smallest that passes is to try them on your own flows. The [choosing a model tutorial](https://browserbash.com/blog/browserbash-choosing-a-model-tutorial) walks through how to evaluate this, and if you want to lean on local models, the [Ollama local models tutorial](https://browserbash.com/blog/browserbash-ollama-local-models-tutorial) shows how to pull one and let `auto` pick it up.

### Cut steps, not just price

Because cost is linear in steps_per_run, removing steps is as powerful as cutting the price per token, and it works in every regime including the free ones (where fewer steps means less rate-limit pressure and faster runs). Concrete ways to shed steps:

- **Reuse login sessions** instead of logging in at the top of every flow. Authenticating once and reusing the session removes a fixed block of steps from every single run.
- **Seed state via API.** If a flow needs a populated cart, a created account, or a specific record, set that up with a fast API call and let the agent start from there, rather than spending steps clicking the UI to build it. The agent should spend its (billable) steps verifying the thing under test, not constructing fixtures.
- **Scope the objective tightly.** A focused objective ("verify the checkout total updates when a coupon is applied") takes fewer steps than a meandering one that re-checks things other tests already cover.

### Run headless, and cache where you can

Run with `--headless` in CI. Headless does not change the per-token math directly, but it removes the overhead of rendering a visible browser, which keeps runs lean and is the correct mode for any automated pipeline. Where your setup allows caching of repeated context, use it, since anything you do not have to send again is something you do not pay for again.

## Reframe the comparison: total cost of ownership

If you stop the analysis at "inference costs X cents per run," you are comparing the wrong thing. Scripted Selenium and Playwright suites look free because there is no per-run invoice, but they carry a large and very real hidden cost: **engineer hours spent maintaining brittle selectors.** Every time the UI changes, a CSS selector or XPath breaks, a test goes red for a reason that has nothing to do with a real defect, and someone has to stop what they are doing and repair it. Multiply that by the size of your suite and the rate at which your front end changes, and the maintenance line dwarfs anything an inference bill is likely to reach.

The honest comparison is total cost of ownership, not inference cost in isolation:

- **Scripted suites:** $0 per run, plus the ongoing salary cost of selector maintenance, flake triage, and rewrites every time the DOM shifts.
- **AI browser testing:** $0 to a small per-run inference cost (your choice of regime), plus far less selector maintenance, because the agent works from a plain-English objective and adapts to UI changes rather than breaking on them.

For most teams the interesting question is not "which has the lower inference bill" (AI testing can be literally zero) but "which has the lower total cost once you price in human time." An inference bill is visible, predictable, and on a line item. Selector maintenance is invisible, unpredictable, and spread across your engineers' calendars, which is exactly why it tends to be under-counted. There is a fuller treatment of the maintenance side of this argument across the guides on [/learn](https://browserbash.com/learn), and the [features](https://browserbash.com/features) page lays out what the agent does instead of selectors.

## Honest limits

In the spirit of giving you a number you can actually defend, here is what this framework cannot do for you:

- **Prices change constantly.** Model providers adjust per-token rates, add models, and retire them on their own schedule. Any specific dollar figure or model id in this post is illustrative and will drift. Look up the current rate before you commit a number to a budget.
- **Token counts vary run to run.** Model output is not deterministic. The same flow can take a few more or fewer steps, and produce more or less reasoning text, on different runs against the same page. Your tokens_per_step and steps_per_run are averages with variance around them, not fixed constants. Budget with a margin.
- **You must measure on your own flows.** The only reliable cost estimate is one you derive from running your own representative flows on your own pages with your own chosen model. Borrowed numbers from a blog post (including this one) are a starting point for the method, never a substitute for measurement.

Treat everything quantitative here as a worked illustration of the method. The method is durable; the figures are not.

## Get started

Install the CLI and run a flow to start measuring your own numbers:

```
npm install -g browserbash-cli
browserbash run "log in and verify the dashboard loads" --headless
```

BrowserBash is free and open source under Apache-2.0. Point it at a local Ollama model and your model bill is $0 with nothing leaving your machine; point it at a paid model and use the formula above to put a real number on each run. Either way, you control which regime you are paying under.

## FAQ

### How much does one AI browser test run cost?

It depends entirely on the backend. On a local model via Ollama, or on a free hosted model, the model bill is $0. On a paid hosted model, the cost per run is `tokens_per_step x steps_per_run x price_per_token`, so it scales with how long the flow is. A short smoke check costs a small fraction of what a long end-to-end checkout journey costs. To get your real number, run a representative flow once, read off the token usage and step count, and multiply by the current published rate for your model.

### Is AI browser testing really free?

The model bill genuinely can be $0, two ways: a local model on Ollama (no per-token charge, nothing leaves your machine, you pay only for hardware and electricity) or a free hosted model id (no charge, but rate-limited and slower). "Free" in the sense of zero model invoice is real. It is not free of all cost: local models use your hardware, and every regime still costs engineer time to write and review objectives, though far less than maintaining brittle selectors.

### Why do longer test flows cost more on paid models?

Because you are billed per step, not per test. Cost per run is the number of tokens per step multiplied by the number of steps multiplied by the price per token. A flow with more actions has more steps, so it accumulates more tokens and a higher bill, roughly in proportion to its length. This is why reusing login sessions and seeding state via API (both of which remove steps) directly lower the cost of every run, and why a couple of short checks can be cheaper than one sprawling journey.

### How do I keep AI browser testing costs down?

Run local or free models for the bulk of your suite and in CI, and reserve paid hosted models only for the hard flows that smaller models fail. Pick the smallest model that reliably passes rather than defaulting to the most expensive one. Cut steps by reusing login sessions, seeding state through APIs instead of clicking the UI to build fixtures, and scoping each objective tightly. Run with `--headless` in pipelines and cache repeated context where your setup allows.
