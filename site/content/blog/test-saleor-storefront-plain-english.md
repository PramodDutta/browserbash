---
title: Test a Saleor Storefront in Plain English
description: "Learn how to test a Saleor storefront in plain English with BrowserBash: seed data over GraphQL, then verify checkout through the real browser UI."
date: 2026-06-03
category: use-case
---

If you run a Saleor shop, you already know the storefront and the backend speak different languages. To test a Saleor storefront the traditional way, you write selectors that shatter every time the Next.js theme re-renders, and you mock a GraphQL layer that behaves nothing like production. BrowserBash flips that around. You describe the shopper's intent in plain English, an AI agent drives a real Chrome browser through the flow, and you get a deterministic verdict back. No selectors, no page objects, no brittle wait logic pasted from Stack Overflow.

Saleor is a good stress test for this approach because it is API-first. The catalog, cart, checkout, and payment intents all live behind a GraphQL API, and the storefront (usually the React Storefront or a custom Next.js app) is just one consumer of that API. That split is exactly where BrowserBash earns its keep: you can seed a product or a promotion straight through GraphQL, then check that a human shopper actually sees it and can buy it through the UI. This article walks through how to do both, honestly, including where a lower-level tool would still serve you better.

## Why a Saleor storefront is awkward to test the old way

A Saleor storefront moves a lot of state that never shows up in the DOM in an obvious place. Prices come back localized and tax-adjusted. Variant availability depends on channel and warehouse. The checkout is a multi-step state machine that talks back to the API at every transition. When you write Playwright or Cypress specs against this, you end up encoding three fragile assumptions at once: the CSS structure of the theme, the exact copy of button labels, and the timing of async GraphQL responses.

Change the theme, rename "Proceed to checkout" to "Continue", or add a shipping-method call that takes 400ms longer, and half your suite goes red for reasons that have nothing to do with a real regression. QA engineers on Saleor projects spend a genuinely large share of their time babysitting selectors instead of testing the actual buying experience.

BrowserBash targets the intent layer instead. When you write "add the first product to the cart and go to checkout", the agent reads the page the way a person does, finds the add-to-cart control, and clicks it. If the label changed from "Proceed" to "Continue", the agent still finds the control because it is reasoning about what the button does, not matching a string. That is the core reason plain-English testing survives storefront redesigns that would break a selector suite.

## What "plain English" actually means here

There is a real distinction worth making up front, because "AI browser testing" gets oversold everywhere. BrowserBash is not magic and it does not pretend to be. Each objective you write is handed to an AI agent that plans a sequence of browser actions (navigate, snapshot the page, click, type, wait, extract) and executes them against a real Chromium instance. It then returns a structured verdict: a status, a summary, the final page state, any assertions, an estimated cost, and a duration.

Because it drives a real browser, it sees the same rendered storefront your customers see, including client-side GraphQL hydration. Because the verdict is structured, you can wire it into CI without parsing prose. And because it is [open source and free](https://browserbash.com/features) under Apache-2.0, you can read exactly what the agent does and run the whole thing on your own machine with local models, no API keys, nothing leaving your laptop.

The honest caveat: very small local models (roughly 8B parameters and under) get flaky on long multi-step flows like a full checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows. A three-step "search and add to cart" objective runs fine on modest hardware. A ten-step guest checkout with address entry and payment wants more reasoning capacity.

## Your first test: does the storefront load and list products

Install the CLI and run one objective against your Saleor storefront. If you are running the React Storefront demo locally it is usually on port 3000; point it at whatever URL your deployment uses.

```bash
npm install -g browserbash-cli

browserbash run "Open https://demo.saleor.io and confirm the homepage shows a list of products with prices" --agent --headless --timeout 120
```

The `--agent` flag emits NDJSON, one JSON event per line, so you can pipe it straight into a CI parser. The exit code carries the verdict: `0` for passed, `1` for failed, `2` for an infrastructure or budget error, `3` for a timeout. That exit-code contract is a frozen public interface, which matters when you build this into a pipeline that other people depend on.

This first run does two useful things. It confirms your storefront actually renders products (a surprising number of Saleor deploys break here after a channel misconfiguration), and it warms up BrowserBash's replay cache. The first green run records the actions the agent took. The next identical run replays those recorded actions with zero model calls and steps back into live reasoning only when the page has changed. For a storefront smoke test you run on every deploy, that means most runs are effectively token-free.

## Seed with GraphQL, verify through the UI

This is the pattern that makes Saleor testing click. Saleor's whole design is API-first, so the fastest way to get a known product, price, or promotion into a predictable state is to hit the GraphQL API directly rather than clicking through the dashboard. Then you verify the result the way a customer experiences it: through the storefront.

BrowserBash supports this hybrid flow with testmd v2. You write a committable `*_test.md` file, add `version: 2` to the frontmatter, and steps execute one at a time against a single browser session. Two of those step types never touch a model. API steps (`GET`, `POST`, and friends) seed and read data deterministically. Verify steps compile to real Playwright checks with no LLM judgment involved. Plain-English steps in between run as grouped agent blocks on the same page.

Here is a Saleor product-visibility test that reads a product over GraphQL, then confirms a shopper sees the same product on the storefront:

```bash
# saleor_product_visibility_test.md
```

```
---
version: 2
---

# Saleor product is visible and priced on the storefront

POST https://demo.saleor.io/graphql/ with body {"query":"{ products(first:1, channel:\"default-channel\"){ edges{ node{ name } } } }"}
Expect status 200, store $.data.products.edges[0].node.name as 'product_name'

Open https://demo.saleor.io and search for {{product_name}}
Click the first matching product to open its detail page

Verify text {{product_name}} is visible
Verify 'Add to cart' button visible
```

The API step pulls the real product name from the channel you care about and stores it as a variable. The plain-English steps drive the search and navigation with the agent. The two Verify steps are deterministic: a pass means the product name literally rendered and the add-to-cart control is actually visible, and a fail comes with expected-vs-actual evidence in the `run_end.assertions` block and the generated Result.md assertion table. You are no longer trusting an LLM's opinion about whether the test passed; the model handles the fuzzy navigation, and Playwright handles the hard assertions.

One caveat to plan around: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`. It does not yet run on Ollama or OpenRouter directly. If you need fully local, single-objective `browserbash run` calls still work on Ollama; the per-step API+Verify hybrid is the piece that currently wants the builtin engine.

### Why not just seed through the dashboard

You can, and for a one-off exploratory test that is fine. But dashboard seeding is slow, non-deterministic, and couples your test setup to yet another UI that can change. Hitting GraphQL gives you a fixed, reproducible starting state in a few milliseconds, and it documents exactly what data the test assumes. When a Saleor test fails, "the API returned status 200 but the storefront showed no product" is a far more actionable failure than a red X three clicks into the admin panel.

## Testing the checkout: the flow that actually matters

Product listing is table stakes. Revenue lives in checkout, and Saleor's checkout is the multi-step state machine most worth guarding. A realistic guest-checkout objective looks like this:

```bash
browserbash run "Open https://demo.saleor.io, add the first available product to the cart, proceed to checkout as a guest, fill in shipping details with a test address, select the first shipping method, and confirm the order summary shows the correct item and a total greater than zero" --agent --headless --timeout 240
```

Notice the timeout jumped to 240 seconds. A full checkout is a long multi-step flow, and you want to give the agent room to handle the address form and the shipping-method selection without tripping the timeout budget. This is also exactly the kind of flow where model choice matters. Run it on a 70B-class local model or a hosted model; an 8B model will sometimes lose the thread halfway through the address form.

For the parts of checkout where correctness is non-negotiable, push the assertions into deterministic Verify steps rather than trusting the agent's summary. A checkout test that seeds a cart-ready product over GraphQL and then verifies the order total is the kind of thing you want green on every deploy. The [tutorials](https://browserbash.com/tutorials) walk through more of these hybrid patterns end to end.

### Handling logged-in checkout without re-login tax

Guest checkout is one path. A returning customer with saved addresses is another, and logging in on every single test run is slow and wasteful. BrowserBash has saved logins for exactly this. You log in once, interactively, and it captures the session as a Playwright storageState:

```bash
browserbash auth save saleor-customer --url https://demo.saleor.io/account/login

browserbash run "Open the account page, go to checkout with the saved cart, and confirm the saved shipping address is pre-filled" --auth saleor-customer --agent
```

The `--auth saleor-customer` flag reuses that saved session on runs, testmd files, run-all suites, and monitors. If the saved profile's origins do not cover the start URL, BrowserBash prints a warning instead of silently doing nothing, which saves you the confusing "why is it asking me to log in again" debugging session. This kills the re-login-every-test tax that makes authenticated e-commerce suites crawl.

## Wiring it into CI and running the suite in parallel

Once you have a handful of Saleor tests (product visibility, guest checkout, logged-in checkout, promotion applies correctly, out-of-stock variant behaves), you run them as a suite. The `run-all` orchestrator discovers every test in a folder and runs them in parallel, with concurrency derived from your actual CPU and RAM rather than a number you guessed. It orders previously-failed and slowest tests first so you find out fast, and it flags flaky tests.

```bash
browserbash run-all ./saleor-tests --junit out/junit.xml --shard 2/4 --budget-usd 2.00
```

The `--shard 2/4` flag runs a deterministic slice of the suite, computed on sorted discovery order so four parallel CI machines each take a quarter without any coordination. The `--budget-usd 2.00` flag is a hard stop: once estimated spend crosses the budget, remaining tests are reported as skipped, the suite exits `2`, and the spend lands in the results file and JUnit properties. For a hosted-model run against a large Saleor suite, that budget guardrail is the difference between a predictable CI bill and a surprise.

The JUnit output plugs into whatever CI you already run. There is also an [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) that installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating PR comment with the verdict table. For a Saleor storefront where every PR touches the theme or the checkout components, a verdict table right in the pull request is worth a lot.

## Monitoring a live Saleor storefront

Testing on deploy is one thing. Knowing your live storefront checkout still works at 3am is another. Monitor mode runs a test or objective on an interval and alerts only when the pass/fail state changes, in either direction, never on every green run.

```bash
browserbash monitor ./saleor-tests/guest_checkout_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Every ten minutes it runs your guest-checkout test. When checkout breaks, you get one Slack alert (Slack webhook URLs get Slack formatting automatically; other URLs get the raw JSON payload). When it recovers, you get one recovery alert. You do not get a green message every ten minutes forever. Because the replay cache makes repeat runs nearly token-free, an always-on synthetic monitor of your Saleor checkout costs almost nothing to keep running. This is real synthetic monitoring built from the same plain-English test you already wrote for CI, not a separate tool with its own scripting language.

## Migrating an existing Playwright suite

If you already have a Playwright suite against your Saleor storefront, you do not have to throw it away to try this. The `import` command converts Playwright specs to plain-English `*_test.md` files heuristically, with no model involved, so it is deterministic and reproducible.

```bash
browserbash import ./tests/e2e
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common `expect` assertions. Your `process.env.X` references become `{{X}}` variables. Anything it cannot translate cleanly lands in an `IMPORT-REPORT.md` file rather than being silently dropped or invented, so you know exactly what needs a human pass. Treat the output as a strong first draft you refine, not a finished suite. It is a fast way to see how your existing Saleor coverage reads as intent-based tests.

There is also a recorder for building tests from scratch by clicking through a flow once. `browserbash record <url>` opens a visible browser, you click through the checkout, and Ctrl-C writes a plain-English test. Password fields never leave the page; the capture sends only a secret marker and the generated step reads `Type {{password}} into ...`, so you never bake a real credential into a committed test.

## Where BrowserBash fits, and where it does not

Credibility matters more than hype here, so let me be straight about the tradeoffs.

| Concern | Plain-English testing (BrowserBash) | Traditional Playwright/Cypress |
| --- | --- | --- |
| Survives theme redesigns | Strong, agent reasons about intent | Weak, selectors break |
| Deterministic assertions | Yes, via Verify steps compiled to Playwright | Yes, native |
| Fuzzy navigation and dynamic UIs | Strong | You hand-code every wait and selector |
| Millisecond-precise timing control | No | Yes |
| Fully offline, no cost | Yes, with local models | Yes |
| Best for | Intent-level flows, storefront smoke and checkout | Pixel-precise component tests, tight perf assertions |

If your goal is a low-level component test that asserts a specific DOM node has a specific computed style at a specific breakpoint, use Playwright directly. That is what it is built for and BrowserBash does not try to replace it. If your goal is "prove a customer can find a product and complete checkout even after we redesigned the theme", plain-English testing is the tool that survives the redesign.

The two also compose. Use `import` to bring your Playwright suite in as a starting draft, keep your tightest component assertions in native Playwright, and let BrowserBash own the intent-level journeys that break most often when the storefront changes. A good Saleor test strategy uses both, not a religious commitment to one.

### Who this is for

This fits QA engineers on Saleor projects who are tired of selector maintenance, indie founders running a Saleor shop who want a checkout smoke test without building a test framework, and AI-agent builders who want a validation layer their agent can call over MCP. BrowserBash exposes `run_objective`, `run_test_file`, and `run_suite` as MCP tools, so an AI coding agent in Claude Code, Cursor, or Codex can validate a Saleor change by calling a tool and reading the structured verdict. A failed test is a successful validation there: the tool call succeeds and the agent reads the result. You can browse more real-world walkthroughs in the [BrowserBash blog](https://browserbash.com/blog) and dig into the fundamentals on the [learn hub](https://browserbash.com/learn).

## A realistic starting checklist

If you want a concrete plan for your own storefront, start small and grow it:

1. Write one homepage smoke objective and confirm products render with prices.
2. Add a testmd v2 file that seeds a product name over GraphQL and verifies it on a product detail page.
3. Add a guest-checkout objective with a generous timeout and a Verify on the order total.
4. Save a customer login with `auth save` and add a returning-customer checkout test.
5. Run the folder with `run-all`, wire the JUnit output into CI, and add a budget cap.
6. Point monitor mode at your live checkout on a ten-minute interval.

Each step is committable, readable by non-engineers on your team, and survives the storefront redesigns that would break a selector suite. That is the whole pitch: test what the shopper actually experiences, in the language your product manager already uses.

## FAQ

### Can BrowserBash test a Saleor storefront without writing any code?

Yes. You write plain-English objectives like "add the first product to the cart and complete guest checkout", and an AI agent drives a real browser through the flow. There are no selectors or page objects to maintain. For deterministic checks you add Verify steps in a simple markdown test file, but those are plain English too, not code.

### How do I seed test data in Saleor before running a UI test?

Use a testmd v2 file with API steps. Saleor is API-first, so you send a GraphQL request with a POST step, store a value from the response (like a product name or ID), and then reference it in your plain-English UI steps. The API steps are deterministic and never call a model, so your test setup is fast and reproducible.

### Is BrowserBash free to use for e-commerce testing?

The CLI is free and open source under Apache-2.0. It defaults to free local models through Ollama, so nothing leaves your machine and you need no API keys for basic single-objective runs. Note that testmd v2 hybrid tests currently need the builtin engine with an Anthropic key or a compatible gateway, and very small local models can be flaky on long checkout flows.

### Will my tests break when we redesign the Saleor storefront theme?

Far less than selector-based tests. Because the agent reasons about what a control does rather than matching a CSS path or exact label, renaming a button or restructuring the layout usually does not break the test. Deterministic Verify steps still check concrete conditions like visible text and element visibility, so you keep real assertions while shedding most of the maintenance.

Ready to test your Saleor storefront by intent instead of by selector? Install the CLI with `npm install -g browserbash-cli` and write your first plain-English checkout test in minutes. An account is optional and everything runs locally, but if you want the free cloud dashboard and hosted extras you can [sign up here](https://browserbash.com/sign-up).
