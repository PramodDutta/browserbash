---
title: browser-use vs Stagehand: AI Browser Agents Compared
description: "browser-use vs Stagehand compared on control, reliability, and models — plus BrowserBash, a ready-made CLI built on Stagehand with local-first Ollama."
date: 2026-03-28
category: comparison
---

If you have spent any time wiring a large language model up to a real browser in the last year, you have run into both of these names. The browser-use vs Stagehand decision is the one nearly every team building AI browser agents hits early, because the two open-source projects sit at opposite ends of the same spectrum: how much control you hand to the model versus how much you keep in your own code. browser-use leans toward "give the agent the page and let it figure out the whole task." Stagehand leans toward "let me call discrete, typed actions and only invoke the model when I need it." Both are real, both are widely used, and the right answer depends almost entirely on what you are building.

This post compares them as honestly as I can from the perspective of someone who has shipped browser automation that has to actually pass in CI. I will name the genuine overlaps, say plainly where each is the better fit, and then show where a ready-made tool like BrowserBash fits — it is built on Stagehand and ships an Ollama-first, local-by-default workflow so you can skip most of the plumbing.

## What browser-use and Stagehand actually are

Let me define the two before comparing them, because a lot of confusion comes from treating them as interchangeable. They are not.

**browser-use** is an open-source Python framework for giving an LLM end-to-end control of a browser. You install it with pip, instantiate an agent with a task string and a model client, and let it run. The library handles the perception-action loop: it reads the page's interactive elements, serializes them for the model, and executes whatever action the model picks — click, type, scroll, navigate, extract — looping until the task is done or it gives up. The design philosophy is autonomy. You describe a goal in natural language and the agent owns the whole journey. That makes it a natural fit for open-ended tasks where you genuinely cannot enumerate the steps in advance: research-style flows, "find me X and fill in Y," RPA over sites you do not control.

**Stagehand** is an open-source browser automation framework from Browserbase, built on top of Playwright and available under the MIT license. Its bet is different. Instead of one big autonomous loop, Stagehand exposes a small, composable API — primitives like `act()` ("click the login button"), `extract()` (pull structured data out of the page against a schema), and `observe()` (ask the page what actions are available) — plus an `agent()` mode when you do want autonomy. The headline idea is that you stay in control. You can write a mostly deterministic Playwright script and drop in an AI call only at the exact step where a selector would be brittle. When the model is not needed, you are running normal Playwright, which means the reliability characteristics of a mature, well-understood tool.

The shortest way to frame the difference: **browser-use is autonomy-first, Stagehand is control-first.** browser-use wants to drive the whole car; Stagehand hands you the wheel and lets you ask for help on the tricky corners.

## browser-use vs Stagehand: the core tradeoff

Almost everything else flows from that one architectural decision, so it is worth sitting with it.

When you give a model full autonomy, you get flexibility at the cost of predictability. An autonomous agent can handle a flow you never anticipated — a surprise interstitial, a relabeled button, a different layout on mobile — because it re-reads the page each step and decides what to do next. That is genuinely powerful for tasks with high variance. The price is that the same flexibility makes runs non-deterministic. Two runs of the same task can take different paths, burn different numbers of tokens, and occasionally wander into a dead end. For a one-off scrape that is fine. For a test that runs 200 times a day in CI and must give the same verdict each time, that variance is a liability.

Stagehand's control-first model inverts the tradeoff. Because you script the deterministic parts in Playwright and only invoke the model at named decision points, your runs are far more repeatable. The model is used surgically — to translate "click the Add to Cart button under the second product" into an action against the current DOM — rather than to plan the whole route. You pay fewer tokens, you get tighter latency, and you can reason about failure because most of the run is ordinary code. The cost is that you write more of the flow yourself. Stagehand will not magically complete a 15-step checkout from a one-line prompt unless you reach for its `agent()` mode, at which point you have opted back into autonomy and its tradeoffs.

Here is the honest summary I would give a teammate: if your task is open-ended and you cannot enumerate the steps, browser-use's autonomy is the right primitive. If your task is a known flow that you need to run reliably and cheaply over and over, Stagehand's surgical approach wins. Neither is "better." They optimize for different jobs.

## Side-by-side comparison

The table below sticks to characteristics that are publicly documented or follow directly from each project's design. Where something is not publicly specified, I say so rather than guess.

| Dimension | browser-use | Stagehand |
| --- | --- | --- |
| Primary language | Python | TypeScript / Node.js |
| License | Open source (MIT) | Open source (MIT) |
| Maintainer | browser-use project | Browserbase |
| Core model | Autonomy-first agent loop | Control-first primitives (`act`, `extract`, `observe`) + optional `agent` mode |
| Built on | Its own perception loop over a real browser | Playwright |
| Determinism | Lower — agent re-plans each step | Higher — deterministic Playwright between AI calls |
| Structured extraction | Supported via the agent | First-class `extract()` against a schema |
| Best for | Open-ended, hard-to-enumerate tasks | Repeatable flows, testing, scraping with known structure |
| Model providers | Multiple LLM providers | Multiple LLM providers |
| Interface | Python library you embed | TypeScript library you embed |
| Runs from a terminal as-is | No — you write code | No — you write code |

Two rows deserve a caveat. First, both projects move fast, so treat any specific feature claim as "as of 2026" and check the current docs before you commit. Second, the "runs from a terminal as-is" row is the one most people overlook: both are **libraries**. Whichever you pick, you are writing and maintaining code — a model client, an entry point, result handling, error paths. That is the right call when you are building a product. It is pure friction when all you wanted was to verify that a login page works. Hold that thought; it is where BrowserBash comes in.

## Reliability in practice: what actually breaks

Anyone who has run AI browser agents past the demo stage knows the failure modes are not where the marketing suggests. Let me be specific about what tends to break with each approach, because "reliability" is too vague to act on.

With an **autonomy-first** tool, the common failures are drift and cost blowups. The agent misreads the page state, takes a plausible-but-wrong action, then spends several more steps trying to recover — sometimes succeeding, sometimes looping until it times out. On a long multi-step objective the probability of at least one wrong turn compounds with each step, so a 12-step flow is meaningfully riskier than a 4-step one. The mitigation is a stronger model and tighter prompts, which raises cost. None of this makes browser-use bad; it makes it a tool you tune for the variance you are willing to accept.

With a **control-first** tool like Stagehand, the failures are narrower and easier to localize. Because most of the run is deterministic Playwright, when something breaks it usually breaks at a specific `act()` or `extract()` call, and you can see exactly which one. The model still occasionally picks the wrong element on an ambiguous page, but the blast radius is one step, not the whole journey. In my experience that localizability is the single biggest reliability advantage of the Stagehand approach for testing work — a flaky run tells you *where* it flaked.

There is a model-size dimension to both, and it is worth being blunt about it. Very small local models (roughly 8B parameters and under) are genuinely flaky on long, multi-step objectives regardless of framework. They will nail a three-step smoke test and then fall apart on a ten-step checkout. The sweet spot for reliable local runs is a mid-size model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If anyone tells you an 8B model autonomously completes complex checkouts every time, be skeptical. This is true for browser-use, true for Stagehand, and true for anything built on top of them.

## Where BrowserBash fits: Stagehand without the plumbing

Here is the practical gap both libraries leave open. You have a flow you want to verify — log in, add an item to the cart, check out, confirm the page says "Thank you for your order!" — and you do not want to write and maintain a Python or TypeScript program to do it. You want to describe the goal and get a verdict.

[BrowserBash](https://browserbash.com/learn) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy that closes exactly that gap. It uses **Stagehand as its default engine**, so you inherit the control-first reliability characteristics discussed above, but you never touch the API. You install it once and write plain English:

```bash
npm install -g browserbash-cli

browserbash run "Go to the demo store, log in as standard_user, add the first product to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

An AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects, no glue code — and returns a verdict plus structured results. There is no account needed to run it. If you have used Stagehand directly, think of BrowserBash as the batteries-included CLI you would otherwise have had to build around it.

### Ollama-first, so your model bill can be exactly $0

The model story is where BrowserBash diverges most from a raw library. Out of the box it is **Ollama-first**: it defaults to free local models, needs no API keys, and nothing leaves your machine. The CLI auto-resolves a local Ollama install first, then falls back to `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` if you would rather use hosted models. You can run capable hosted models through OpenRouter (including genuinely free ones such as `openai/gpt-oss-120b:free`) or bring your own Anthropic Claude key for the hardest flows.

That local-first default matters for two reasons. One, you can guarantee a $0 model bill by staying on local models — useful when you are running hundreds of CI checks a day. Two, the data-residency story is simple: with local inference, the page contents and your credentials never touch a third-party API. The honest caveat from the reliability section still applies — a tiny local model will struggle on long objectives — so for hard, multi-step flows, point BrowserBash at a mid-size local model or a hosted one. The framework gives you the dial; the model size is yours to set.

### Two engines, one flag

BrowserBash ships two engines. The default `stagehand` engine (MIT, by Browserbase) is what most people use. There is also a `builtin` engine — an in-repo Anthropic tool-use loop driving Playwright — which additionally captures a Playwright trace you can open in the trace viewer. You switch with a flag, so you can pick the engine that fits the run without rewriting anything.

## Built for testing and AI coding agents

The library-versus-CLI distinction shows up most sharply when you try to put any of this into CI or hand it to an AI coding agent. With a raw library you are parsing your own output. BrowserBash was built for automation as a first-class use case.

Agent mode emits **NDJSON** — one JSON event per line on stdout — so a CI job or an AI coding agent consumes structured events instead of scraping prose. Exit codes are explicit: `0` passed, `1` failed, `2` error, `3` timeout. That alone removes a whole class of brittle log-parsing from your pipeline:

```bash
browserbash run "Open the staging login page, sign in, and confirm the dashboard loads" \
  --agent --headless
```

For flows you want to keep under version control, BrowserBash supports committable **markdown tests**. Each list item in a `*_test.md` file is a step; you get `@import` composition for shared setup and `{{variables}}` templating for environment-specific values. Variables marked as secrets are masked as `*****` in every log line, which keeps credentials out of your CI logs:

```bash
browserbash testmd run ./checkout_test.md
```

A `checkout_test.md` might template the password as a secret variable so it never appears in the human-readable `Result.md` that gets written after each run. That committable, reviewable test format is something you would have to build yourself on top of either library. You can dig into the full feature set on the [BrowserBash features page](https://browserbash.com/features), and there is a worked end-to-end checkout walkthrough in the [case study](https://browserbash.com/case-study).

### Recordings and where the browser runs

When a run fails at 2 a.m., a verdict is not enough — you want to see what happened. The `--record` flag captures a screenshot and a full `.webm` session video (via ffmpeg) on any engine; with the builtin engine you also get a Playwright trace. There is a free, fully local dashboard (`browserbash dashboard`) for browsing runs on your own machine, and an optional free cloud dashboard with run history, video recordings, and per-run replay — strictly opt-in via `browserbash connect` and the `--upload` flag, with free uploaded runs kept for 15 days.

You also choose where the browser actually runs with a single `--provider` flag. The default is `local` (your own Chrome). You can also point at any DevTools endpoint with `cdp`, or run on `browserbase`, `lambdatest`, or `browserstack` when you need a cloud grid for cross-browser coverage:

```bash
browserbash run "Verify the pricing page loads and the annual toggle works" \
  --provider lambdatest --record
```

Neither browser-use nor Stagehand bundles this provider-switching, recording, and dashboard layer for you — with the libraries you wire up the grid connection and artifact capture yourself. That is the point of a ready-made CLI.

## When to choose each tool

Here is the decision framework I would actually give someone, with no hand-waving.

**Choose browser-use when** you are building a product or workflow that needs genuine autonomy over web pages you do not control, the tasks are open-ended and hard to enumerate, and your team is comfortable in Python wiring up the agent loop, model client, and result handling. If the variance of an autonomous agent is acceptable for your use case — say, an assistant that researches and fills forms across many unfamiliar sites — browser-use is built for exactly that, and you should not fight its grain by forcing determinism onto it.

**Choose Stagehand when** you are building a TypeScript application and you want fine-grained, control-first browser automation with AI used surgically. If you need first-class structured extraction against a schema, repeatable runs, and the reliability of mostly-deterministic Playwright with model calls only at the brittle steps, Stagehand is the better primitive. It is also the right pick if you are constructing your own framework or product and want a clean library to build on rather than an opinionated tool.

**Choose BrowserBash when** you want the Stagehand reliability model but you do not want to write or maintain a program to get it. If your job is to verify flows — login, checkout, smoke tests, regression — and you would rather describe the goal in plain English, run it from your shell or CI, and get a clean verdict with NDJSON and proper exit codes, BrowserBash is the ready-made layer. It is also the obvious choice when you want a guaranteed $0 model bill on local models, when credentials and page contents must stay on your machine, and when you want committable markdown tests and recordings without building that tooling yourself. You can compare it against more tools on the [BrowserBash blog](https://browserbash.com/blog) and see the plans on the [pricing page](https://browserbash.com/pricing).

To be fair about the boundary: if your task genuinely needs an autonomous agent improvising across unknown sites, or you are embedding browser control deep inside a larger application, a library is the right call and BrowserBash is the wrong abstraction. Use the tool that matches the shape of your problem.

## A realistic workflow

Let me sketch how these pieces fit together in practice, because the comparison is easier to feel with a concrete arc.

Say you maintain an e-commerce app and you want a checkout smoke test that runs on every deploy. With a library you would scaffold a project, add the dependency, write the flow, wire a model, handle the result object, add artifact capture, and connect it to CI — a day or two of work before the first green check. With BrowserBash you write the objective once, save it as a `checkout_test.md` with the password marked secret, and run it locally against your default Ollama model to confirm it passes. When you are happy, you flip on `--agent` and `--headless` in your CI job and read the exit code. If a run ever fails, you re-run it with `--record` to get the `.webm` and watch exactly where it broke. If you want cross-browser coverage for a release, you add `--provider lambdatest` for that one run. Nothing about the test changes — only the flags.

That is the throughline of this whole comparison. browser-use and Stagehand are excellent libraries optimized for two different jobs, autonomy and control. BrowserBash takes the control-first engine (Stagehand), pins the model story to local-first inference, and wraps the operational layer — CI contract, secrets, recordings, providers, dashboards — so you can spend your time on the flow and not the framework.

## FAQ

### Is browser-use or Stagehand better for browser automation?

It depends on the job. browser-use is autonomy-first and shines on open-ended tasks you cannot fully script, especially in Python. Stagehand is control-first and better for repeatable, testable flows in TypeScript where you want AI used only at the brittle steps. For reliable, predictable runs in CI, the Stagehand approach generally wins; for improvising across unknown sites, browser-use is the stronger fit.

### Is Stagehand free and open source?

Yes. Stagehand is an open-source framework from Browserbase released under the MIT license, and it is built on top of Playwright. You can use it without a paid Browserbase account by running browsers locally, though Browserbase also offers a hosted cloud-browser product as a separate commercial service. As always, check the current repository for licensing details since fast-moving projects can change terms.

### Do I need to write code to use browser-use or Stagehand?

Yes — both are libraries you embed in your own program. browser-use is a Python library and Stagehand is a TypeScript library, so either way you write and maintain code, a model client, and result handling. If you want to skip that and run AI browser automation from the terminal, BrowserBash is a CLI built on Stagehand that takes a plain-English objective and returns a verdict with no glue code.

### Can I run AI browser agents without paying for an API?

Yes, if you use local models. BrowserBash is Ollama-first and defaults to free local models with no API keys, so you can guarantee a $0 model bill and keep all data on your machine. The honest caveat is that very small local models (around 8B and under) get flaky on long multi-step flows, so for hard objectives use a mid-size local model like a Qwen3 or Llama 3.3 70B-class, or a capable hosted model through OpenRouter or Anthropic.

Whichever side of the browser-use vs Stagehand debate you land on, you do not have to build the operational layer yourself. Install the CLI with `npm install -g browserbash-cli`, describe your flow in plain English, and run it on free local models from your terminal or CI. No account is required to run it — though you can [sign up](https://browserbash.com/sign-up) for the optional free cloud dashboard if you want run history, video replay, and shareable results.
