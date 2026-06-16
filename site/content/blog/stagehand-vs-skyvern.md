---
title: Stagehand vs Skyvern: Which AI Automation Wins?
description: "Stagehand vs Skyvern compared honestly: a code-first AI browser library versus a vision-driven workflow engine, plus a free CLI that packages Stagehand."
date: 2026-04-01
category: comparison
---

The stagehand vs skyvern debate trips people up because both promise the same headline: drive a browser with AI, skip the brittle selectors, describe what you want in plain language. But underneath that shared pitch are two genuinely different machines. Stagehand is a TypeScript library you import into your own code and call like an API. Skyvern is a vision-driven workflow engine you run as a service and point at sites it has never seen. One hands you primitives and expects you to build; the other hands you a system and expects you to configure it. This piece compares them the way a senior SDET actually evaluates tools — by intent, not feature-checkbox parity — and then shows where a free CLI called BrowserBash fits, because it wraps Stagehand and turns it into structured pass/fail verdicts you can gate a build on.

There is no single winner here, and any article that crowns one is selling you something. The honest answer is that stagehand vs skyvern is a question about your altitude and your goal. Are you a developer who wants programmatic control inside an existing codebase? Or do you need to automate a recurring, messy business task across sites you do not own? Those are different problems, and the tools optimize for opposite things.

## What Stagehand actually is

Stagehand is an open-source (MIT) AI browser automation framework from Browserbase. It sits on top of Playwright and adds a small, deliberate set of AI-powered primitives — usually `act`, `extract`, and `observe`. Instead of writing `await page.click('#login-btn')`, you write `await page.act("click the login button")` and let a model resolve the intent against the live DOM. The design philosophy is restraint: Stagehand does not try to be a full agent that runs off and does whatever it wants. It gives you AI-resolved actions as building blocks and leaves orchestration — loops, branches, retries, assertions — to you, in your own code.

That restraint is the whole point. You stay inside a real Node.js or TypeScript project. You keep your test runner, your assertion library, your typed data models, your error handling. When you call `extract`, you can hand it a schema and get back structured, typed data rather than a wall of text. When `act` resolves an ambiguous instruction, you can wrap it in your own retry logic. Because Stagehand is a library, it composes with whatever you already have: a Playwright spec file, a scraping pipeline, a backend job that needs to log into a partner site once a day. You import it, you call it, you own the program around it.

The cost of that flexibility is real. You are writing and maintaining a codebase: you install dependencies, wire up a model provider in code, structure the project, decide how results are reported, and build the CI integration yourself. Stagehand gives you sharp, well-shaped primitives; it does not give you a finished workflow. For a developer who wants control, that trade is exactly right. For someone who just wants a task done without writing TypeScript, it is overhead.

## What Skyvern actually is

Skyvern is an open-source browser automation platform that pairs vision-capable LLMs with multi-agent coordination to operate websites the way a human would. Its signature move is visual. Rather than leaning entirely on the DOM, it takes a screenshot, asks a vision model what is on the page, and acts on what it sees. That approach lets it work on sites it has never encountered before, with no bespoke setup, which is precisely what you want when the "site" is some arbitrary vendor portal you do not control and cannot predict.

The product surface follows from that goal. Skyvern exposes a Playwright-compatible SDK for engineers and a no-code workflow builder for everyone else, with reusable blocks for the boring-but-critical parts of real automation: form filling, data extraction, file downloads, validation, and loop control over lists of inputs. It runs as a local service and also as Skyvern Cloud. The use cases the project highlights are RPA-flavored — downloading invoices across many billing portals, automating job applications, replacing brittle selector scripts that shatter whenever a layout shifts. Its center of gravity is throughput on unfamiliar pages, and the multi-agent angle (decompose a task, run parts in parallel, aggregate the results) is what you reach for when one "job" is really fifty sub-jobs across fifty pages.

So Skyvern is not really a library at all. It is a system. You point it at a goal and it figures out the rest, adapting around layout changes as a feature rather than a failure — a powerful default for getting work done, and a different posture from Stagehand entirely.

## The core difference: a library versus a system

Here is the cleanest way to hold the stagehand vs skyvern distinction in your head: Stagehand is a tool you call, Skyvern is a system you deploy. Everything else flows from that.

Stagehand assumes you are a developer building software. It gives you AI primitives and gets out of your way. The orchestration is yours, the assertions are yours, the reporting is yours — by design. The mental model is "I am writing a program that happens to use AI to click things."

Skyvern assumes you have a recurring task and want a machine that completes it despite the messiness of the open web. It gives you a workflow engine, vision-based resilience, and a no-code builder so non-engineers can drive it. The mental model is "I have a chore, and I want this thing to go do it." When the target site redesigns, Skyvern adapting on its own is exactly what you paid for.

This is why a feature-checklist comparison misleads. On paper both "use AI," both "avoid selectors," both "drive a real browser." In practice they answer different questions. Reach for Stagehand when "where does this run?" is "inside my codebase." Reach for Skyvern when the answer is "as a service that does a job for me."

## Stagehand vs Skyvern: side-by-side

The table sticks to publicly documented differences in shape and posture. Where a fact is not publicly specified, it says so rather than guessing.

| Dimension | Stagehand | Skyvern |
| --- | --- | --- |
| Form factor | TypeScript / Node.js library you import | Workflow engine / service you run |
| License | Open source (MIT) | Open source |
| Built by | Browserbase | Skyvern |
| Element strategy | AI resolves intent against the DOM (Playwright under the hood) | Vision LLM identifies elements from screenshots |
| Primitives | `act`, `extract`, `observe` | Workflow blocks: form fill, extract, download, validate, loop |
| Authoring surface | Code (you write the program) | Playwright-compatible SDK + no-code workflow builder |
| Orchestration | Yours (loops, retries, assertions in code) | Built in; multi-agent decomposition and aggregation |
| Best at | Developer control inside an existing app | Throughput on unfamiliar sites you do not own |
| Where it runs | Anywhere your Node app runs | Local service or Skyvern Cloud |
| Non-technical users | No — it is a code library | Yes — no-code builder is a headline feature |
| Model approach | Bring your own provider, configured in code | Vision-capable LLMs |
| Pricing | Library is free/MIT; you pay your own model + infra | Open source self-host; managed cloud pricing not detailed here |

Read it top to bottom and the pattern is consistent. Stagehand's columns describe a kit for building software. Skyvern's describe a system for producing outcomes. Neither set of choices is "better" in the abstract. If you find yourself wanting the no-code builder, you have already left Stagehand's territory. If you find yourself wanting to wrap AI clicks in your own custom retry-and-assert logic, you have left Skyvern's.

## Where each one genuinely wins

Let me be specific, because "it depends" is a cop-out without examples.

### When Stagehand wins

Stagehand is the better pick when you are a developer and the automation lives inside code you already maintain. A few concrete cases:

- **You have a Playwright suite already.** Stagehand drops in next to your existing specs. Replace the three brittle selectors that keep breaking with `page.act(...)` calls and keep everything else. No new system to operate.
- **You need typed, structured extraction.** Call `extract` with a schema, get back validated objects, and feed them straight into the rest of your program. That is a developer's dream and a no-code builder's blind spot.
- **You want surgical control over one flow.** A login with a custom 2FA dance, or a scrape that needs precise pagination, is easier when you own the loop. Stagehand handles the fuzzy "find the button" part; you handle the deterministic glue.
- **You are embedding AI browsing into a product.** If browser automation is a feature of the software you ship, a library you compile in beats a separate service you have to deploy and babysit.

### When Skyvern wins

Skyvern is the better pick when the deliverable is the work itself, on sites you do not control:

- **Recurring RPA across many portals.** "Every Monday, log into these twelve billing systems and download last week's invoices" is Skyvern's home turf. Vision-based element handling survives the redesigns those portals ship without telling you.
- **A task that fans out into many sub-tasks.** Bulk form submission, job-application automation, research across a list of sites — the multi-agent decomposition is built for parallel fan-out and result aggregation.
- **Non-technical operators.** Finance, ops, and recruiting teams who will never open a terminal can drive the no-code workflow builder. That alone can be the deciding factor.
- **Resilience over rigidity.** When you want the agent to push through an unfamiliar layout and still get the invoice, adaptive behavior is a feature, not a bug.

Notice the dividing line is not "which is smarter." It is what you want to happen when a page changes. Stagehand-in-your-code lets you decide. Skyvern decides for you, in the direction of getting the job done.

## The honest caveat: adaptive automation cuts both ways

Here is the part most comparisons skip. Both of these tools are built to *do work*, and that is subtly dangerous if your real goal is *to check work*.

Picture a deploy that accidentally hides the "Apply coupon" button on a checkout page. A workflow agent told to "complete a purchase with a discount code" might notice the button is gone, decide the discount is optional, and finish the order anyway. Mission accomplished, because the task was to buy something and it did. That is the correct behavior for an RPA engine. It is the wrong behavior for a regression test, where "apply the coupon and verify the discount appears" must fail loudly because the truth it asserted is no longer true.

Same page, same hidden button, same underlying AI — opposite correct behavior. This matters because plenty of teams reach for Skyvern or a raw Stagehand script when what they actually need is a test: a thing that walks one specific path and screams when that path breaks. Adaptive automation will route around the very bug you wanted to catch and hand you a green checkmark. If you are testing an app you own, the flexibility that makes Skyvern great at RPA becomes a liability, and a bare Stagehand script gives you no opinion at all until you write the assertions yourself.

That gap — between automation that gets the job done and automation that returns a trustworthy verdict — is exactly where the next tool lives.

## Where BrowserBash fits: Stagehand, packaged as a verdict machine

[BrowserBash](https://browserbash.com/learn) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it once, write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and returns a verdict plus structured results. The interesting part for this comparison: its default engine is `stagehand` — the same Stagehand from Browserbase, embedded and wired up so you never touch the library code.

That makes BrowserBash a clean third reference point in the stagehand vs skyvern discussion. With Stagehand, you get powerful primitives and write the program. With Skyvern, you get a workflow system tuned for RPA. With BrowserBash, you get Stagehand already turned into a finished test-automation workflow — the CLI surface, the committable test format, the CI contract, the recordings, the reporting — handed to you. The unit of work is a sentence, not a class and not a workflow diagram.

Here is the entire "hello world":

```bash
npm install -g browserbash-cli
browserbash run "Open https://news.ycombinator.com and verify the top story link is visible"
```

That command drives a real browser, plans its own steps, checks the assertion in the `verify` clause, and exits with a status code you can act on. The exit-code contract is what makes it a verdict machine rather than a doer: `0` passed, `1` failed, `2` error, `3` timeout. A missing element resolves to exit code `1` instead of a creative detour around the bug — the opposite default from an RPA engine, and on purpose.

### A model story that costs nothing to start

Both Stagehand and Skyvern expect you to bring a model. Stagehand wants a provider configured in code; Skyvern leans on vision-capable LLMs. BrowserBash is Ollama-first: it defaults to free local models with no API keys, and nothing leaves your machine. The resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so you can stay fully local for a guaranteed $0 model bill, or reach for OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) or Anthropic Claude with your own key when a flow is hard.

One honest caveat, because it matters: very small local models (roughly 8B and under) get flaky on long, multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely tricky flows. If your objective is a five-step checkout with conditional branches, do not expect a tiny model to nail it every time. Right-size the model to the flow and reliability follows.

### Built for CI and AI coding agents

The reason BrowserBash exists as a CLI and not a library is the CI contract. Run it in agent mode and it emits NDJSON — one JSON event per line on stdout, with a stable terminal event — so a pipeline or another AI coding agent consumes the result without parsing prose:

```bash
browserbash run "Log in, add an item to the cart, complete checkout, and verify 'Thank you for your order!' appears" --agent --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine; the `builtin` engine additionally writes a Playwright trace you can open in the trace viewer. That is the artifact you want when a test fails at 2 a.m. and you need to see what the agent saw. Read more about how [AI agents drive browsers and report structured results](https://browserbash.com/features) if you want the full event schema.

### Tests you can commit and read in review

The other thing a raw library or a no-code builder does not naturally give you is living documentation. BrowserBash supports committable `*_test.md` files where each list item is a step, with `@import` for composing shared steps and `{{variables}}` for templating. Secret-marked variables are masked as `*****` in every log line, so credentials never leak into your CI logs:

```bash
browserbash testmd run ./checkout_test.md --upload
```

A `checkout_test.md` might pass `{{username}}` and a secret `{{password}}`, walk the cart-to-confirmation flow, and write a human-readable `Result.md` after the run. Because it is plain text, a product manager can read it in review and a diff shows exactly which step changed — something a screenshot-driven workflow engine does not produce on its own. If you are coming from a code-heavy setup, the move from [selectors and page objects to plain-English steps](https://browserbash.com/blog) is the bigger shift than the tool choice.

### Where the browser runs, and an optional dashboard

By default the browser is your local Chrome. One `--provider` flag switches it: `cdp` for any DevTools endpoint, plus `browserbase`, `lambdatest`, and `browserstack` when you need a grid. Running the same plain-English suite across a cloud grid looks like this:

```bash
browserbash run "Sign up with a new email and verify the welcome screen" --provider lambdatest --headless
```

No account is required to run anything. There is a free, fully local dashboard via `browserbash dashboard`, and a strictly opt-in free cloud dashboard (run history, video recordings, per-run replay) you turn on with `browserbash connect` and `--upload`. Free uploaded runs are kept for 15 days. Compare the tiers on the [pricing page](https://browserbash.com/pricing) — the short version is that the core CLI is free and the model bill is whatever you choose, down to zero on local models.

## So which AI automation wins?

The honest verdict: none of the three "wins" outright, because they target different jobs. But you can pick correctly with one question: what do you want out of the run?

- **Want programmatic control inside your own codebase?** Stagehand wins. It is the right tool when browser automation is part of software you build and maintain, and you want sharp primitives without a separate system to operate.
- **Want a recurring task done across sites you do not own, ideally with non-technical operators?** Skyvern wins. Vision-based resilience, multi-agent fan-out, and a no-code builder make it the strongest fit for genuine RPA. As of 2026, its managed-cloud specifics are not detailed here, so evaluate pricing against your volume.
- **Want a trustworthy pass/fail verdict you can gate a build on, with zero account and a $0 model bill to start?** BrowserBash wins — and since it runs Stagehand under the hood, you get that engine's quality with the testing workflow, CI exit codes, masked secrets, and recordings already built.

Many teams will run more than one: Skyvern for the operational chores that produce artifacts, Stagehand for the AI browsing baked into a product, and BrowserBash for the plain-English smoke suite that protects each release. The [case studies](https://browserbash.com/case-study) show what the testing slice looks like in practice once you stop hand-writing selectors.

## FAQ

### Is Stagehand better than Skyvern?

Neither is universally better — they solve different problems. Stagehand is a TypeScript library that gives developers AI-resolved browser primitives to use inside their own code, so it wins when you want programmatic control. Skyvern is a vision-driven workflow engine built for RPA-style tasks across sites you do not own, so it wins when the deliverable is the completed work and non-technical operators need a no-code builder. Pick based on whether you are building software or completing a recurring chore.

### Does BrowserBash use Stagehand under the hood?

Yes. BrowserBash ships two engines, and the default one is `stagehand` — the same MIT-licensed library from Browserbase. It also includes a `builtin` engine that drives Playwright through an Anthropic tool-use loop. So when you run BrowserBash with its default settings, you are already running Stagehand, just packaged inside a free CLI with markdown tests, NDJSON output, exit codes, and recordings handled for you.

### Can I use Stagehand or Skyvern for end-to-end testing in CI?

You can, but be careful about a mismatch. Both are built to complete tasks and adapt around obstacles, which means an automation can route around the exact bug a test should catch and still report success. For CI gating you want a tool that returns a clean pass/fail and fails loudly on missing elements — BrowserBash is purpose-built for that, with exit codes `0` passed, `1` failed, `2` error, and `3` timeout, plus an `--agent` mode that emits machine-readable NDJSON.

### Is there a free way to try AI browser automation without API keys?

Yes. BrowserBash is Ollama-first, so it defaults to free local models with no API keys and nothing leaving your machine, which means a guaranteed $0 model bill if you stay local. You can also use genuinely free hosted models through OpenRouter, or bring your own Anthropic Claude key for harder flows. Keep in mind that very small local models under about 8B can be unreliable on long multi-step objectives, so a mid-size local model is the practical sweet spot.

Ready to turn plain-English objectives into pass/fail verdicts? Install with `npm install -g browserbash-cli` and run your first test in under a minute — no account required. When you want run history and video replay, an optional free dashboard is one [sign-up](https://browserbash.com/sign-up) away.
