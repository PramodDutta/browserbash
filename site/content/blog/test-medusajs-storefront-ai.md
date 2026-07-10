---
title: Test a Medusa.js Storefront With AI Browser Automation
description: "Learn how to test a Medusa.js storefront with AI browser automation: verify browse-and-buy flows by intent, seed data via API, and assert real checkout state."
date: 2026-06-02
category: use-case
---

If you run a headless commerce stack, you already know the hard part is not the API. It is the storefront. To test a Medusa.js storefront with AI browser automation, you write what a shopper actually does in plain English, hand it to an agent that drives a real Chrome browser, and get back a verdict you can trust in CI. No selectors that break when your Next.js frontend re-renders a product card. No page objects to maintain when the design team ships a new cart drawer. You describe the intent (open the store, add a hoodie to the cart, check out as a guest) and the agent figures out the clicks.

Medusa splits the world cleanly: a Node.js backend that exposes the Store and Admin REST APIs, and a separate storefront (often the official Next.js starter) that talks to it. That separation is great for engineering and slightly awkward for testing, because a green backend does not prove a shopper can buy anything. The checkout button might be misaligned, the region selector might send the wrong currency, the payment step might silently swallow an error. This guide walks through validating the browse-and-buy path end to end using [BrowserBash](https://browserbash.com/features), the open-source validation layer for AI agents, with real commands you can drop into your pipeline today.

## Why headless commerce breaks traditional test suites

Selector-based tests assume the DOM is a stable contract. In a Medusa storefront it is not. The Next.js starter uses server components, streaming, and a component library that changes class names between releases. Your Playwright spec that asserted `button[data-testid="add-to-cart"]` works until a designer renames the test id or a refactor moves the button into a client component that hydrates a beat later. You spend Friday afternoons chasing flaky selectors instead of shipping.

There is a second problem specific to commerce. A real purchase touches many moving parts in sequence: region and currency resolution, inventory checks, cart line items, shipping options, a payment provider, and finally an order confirmation. Any one of those can regress without throwing a visible error. A traditional suite that only checks "the add-to-cart button exists" gives you false confidence. What you actually want to verify is the outcome: after I go through checkout, does an order confirmation page appear with the right total?

AI browser automation reframes the test around intent. Instead of encoding every click and every selector, you state the goal. The agent reads the page like a person would, using the accessibility tree and visible text, then decides how to reach the goal. When the cart drawer moves, the agent still finds "Add to cart" because it is looking for meaning, not a brittle CSS path. That is the core reason teams reach for this approach on fast-moving storefronts.

### Where AI testing is genuinely better, and where it is not

Be honest about the tradeoff. AI browser automation shines on flows that change often, span many screens, or are described more naturally in English than in code. It is slower per run than a hand-tuned selector script, and it costs either local compute or a few cents of model spend per objective. For a hot inner-loop unit test on a pure function, keep using your existing framework. For a full checkout journey that a human would describe in three sentences, the intent-based approach usually wins on maintenance cost. Use the right tool for each layer of the pyramid.

## Set up BrowserBash against your Medusa storefront

Installation is one command, and the CLI defaults to free local models through Ollama, so nothing leaves your machine unless you point it at a hosted model.

```bash
npm install -g browserbash-cli
browserbash run "Open the storefront, go to the first product, and store its price as 'price'" --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, which is what you want in CI. Exit codes are stable: 0 passed, 1 failed, 2 error, 3 timeout. That means your pipeline can branch on the result without parsing prose.

By default the agent uses your local Chrome through the `local` provider and the Stagehand engine. If you are running the Medusa Next.js starter locally on port 8000, point the objective at it directly. The model story is Ollama-first: it auto-resolves a local Ollama model, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, then prints setup guidance if it finds nothing. One honest caveat worth internalizing early: very small local models (around 8B and under) get flaky on long multi-step objectives like a full checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is hard. Start small, and step up model size if the agent starts missing steps.

If you want a deeper walkthrough of the CLI basics before wiring this into a suite, the [BrowserBash tutorials](https://browserbash.com/tutorials) cover the run, testmd, and run-all commands with runnable examples.

## Write a browse-and-buy test as a committable file

One-off `run` commands are great for exploration. For anything you want to keep, use a Markdown test file. These are plain `*_test.md` files with a title, numbered steps, `{{variables}}` templating, and `@import` composition so shared setup lives in one place. They commit to your repo next to the code they test and produce a human-readable `Result.md` after each run.

Here is the shape of a guest checkout test for a Medusa storefront. Save it as `.browserbash/tests/guest-checkout_test.md`:

```bash
browserbash testmd run .browserbash/tests/guest-checkout_test.md --agent
```

Inside the file you write the journey the way you would explain it to a new QA hire:

- Open {{STORE_URL}} and select the United States region if a region picker appears
- Go to the "Medusa Sweatshirt" product page
- Choose size M and add it to the cart
- Open the cart and proceed to checkout
- Fill the email, shipping address, and select the standard shipping option
- Complete the order using the test payment method
- Verify the URL contains "order/confirmed"
- Verify text "Thank you" is visible

That last pair of steps is where determinism enters. In BrowserBash, a `Verify` step compiles to a real Playwright check, not an LLM judgment call. "Verify the URL contains order/confirmed" and "Verify text Thank you is visible" run as actual assertions, and a failure comes back with expected-versus-actual evidence in the `run_end.assertions` block and the Result.md assertion table. The agent-driven steps handle the fuzzy navigation, and the Verify steps nail down the outcome with no model involved. That combination is what makes an AI test trustworthy enough to gate a deploy.

### Verify grammar you can lean on

The Verify grammar covers the checks a storefront test actually needs: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, and a stored value equals. So you can assert "Verify 'Place order' button visible" or "Verify the cart shows 2 line items" and get a deterministic pass or fail. If you write a Verify line outside the supported grammar, it still runs, but it is agent-judged and flagged `judged: true` in the output so you always know which assertions were deterministic and which relied on the model. That transparency matters when you are debugging a red build at 2am.

## Seed cart and order data deterministically with testmd v2

Here is a problem every commerce tester hits: driving the whole funnel through the UI just to test the confirmation page is slow and wasteful. You do not want to click through five screens to check that the order summary renders a discount correctly. You want to seed the state and then verify one screen.

testmd v2 solves this. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session, with two deterministic step types that never touch a model. API steps let you call the Medusa Store API to seed a cart or apply a promotion, and Verify steps check the result through the UI. A test file might start like this in its frontmatter and body:

```
---
version: 2
auth: shopper
---
- POST {{STORE_URL}}/store/carts with body { "region_id": "{{REGION}}" }
- Expect status 200, store $.cart.id as 'cartId'
- POST {{STORE_URL}}/store/carts/{{cartId}}/line-items with body { "variant_id": "{{VARIANT}}", "quantity": 2 }
- Expect status 200
- Open {{STORE_URL}}/cart
- Verify the cart shows 2 line items
- Verify text "Medusa Sweatshirt" is visible
```

The API steps seed the cart deterministically against Medusa's Store REST endpoints, then the plain-English step opens the cart page and the Verify steps confirm the UI reflects what you seeded. Consecutive plain-English steps run as grouped agent blocks on the same page, so a short navigation sequence stays efficient. One important limitation to plan around: testmd v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. If your team is strict about local-only, keep the pure browse-and-buy tests on v1 and use v2 where the API seeding pays for itself.

This hybrid API-plus-UI pattern is the single biggest time saver for Medusa testing. You get the speed and reliability of direct API seeding for setup, and the honesty of a real browser assertion for the part that actually faces the customer.

## Reuse a logged-in shopper session

Most storefront journeys past the cart assume a session. Logging in through the UI on every single test is the re-login tax, and it makes suites slow and brittle. BrowserBash handles this with saved logins built on Playwright storageState.

```bash
browserbash auth save shopper --url https://your-store.com/account
browserbash testmd run .browserbash/tests/reorder_test.md --auth shopper --agent
```

The first command opens a browser, you log in once as a test shopper, press Enter, and the session is saved. Every test that passes `--auth shopper` (or sets `auth: shopper` in frontmatter, as in the v2 example above) reuses that session with no login step. If a saved profile does not cover the target start URL, BrowserBash prints a warning rather than silently doing nothing, which saves you from the classic "why is it logged out" mystery. This is how you test account-gated flows like order history, saved addresses, and reorder without paying the login cost on every run.

## Run the full suite in CI without burning your budget

A single test is a smoke check. A suite is coverage. The `run-all` command executes a folder of tests with a memory-aware parallel orchestrator: concurrency is derived from real CPU and RAM, previously-failed and slowest tests run first, and flaky tests get flagged automatically.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

Two flags there matter for commerce teams. Sharding (`--shard 2/4`) runs a deterministic slice computed on sorted discovery order, so four parallel CI machines agree on who runs what without any coordination. Budget governance (`--budget-usd 2`) stops launching new tests once the suite crosses two dollars of estimated spend: remaining tests are reported as skipped, the suite exits 2, and the spend lands in `RunAll-Result.md` and the JUnit properties. The `run_end` cost estimate comes from a bundled per-model price table, and unknown models get no estimate rather than a wrong one. For a storefront with dozens of product and checkout permutations, a matrix run across viewports is a one-liner too: `--matrix-viewport 1280x720,390x844` runs every test once per viewport and labels the results, which catches the mobile cart bugs that desktop-only suites miss.

The replay cache is what makes this affordable at scale. A green run records its actions, and the next identical run replays them with zero model calls. The agent only steps back in when the page actually changed. So a suite that is green today costs almost nothing to re-run tomorrow, and it lights up with real model reasoning precisely when something drifted. If you want the details on wiring this into GitHub, the [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) installs the CLI, runs the suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with the verdict table.

## Give your AI coding agent the storefront as a tool

If you build with Claude Code, Cursor, Windsurf, Codex, or Zed, there is a tighter loop available. BrowserBash ships an MCP server, so your coding agent can validate its own changes against the live storefront without you copy-pasting results.

```bash
claude mcp add browserbash -- browserbash mcp
```

That one line registers BrowserBash as a Model Context Protocol server on stdio. It exposes three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The mental model to internalize: a failed test is a successful validation. The tool call succeeds and hands the agent the verdict, so your coding agent reads "checkout failed at the payment step, expected order/confirmed, got /checkout/payment" and can go fix its own regression. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so discovery is a one-liner in any compatible host.

For a Medusa team, this closes the loop nicely. You ask your agent to add a discount code field to the cart, it writes the code, and then it calls `run_test_file` against your checkout test to confirm the funnel still completes. No human in the loop until something is actually broken.

## Keep the storefront honest in production with monitors

Testing in CI catches regressions before deploy. Monitoring catches the ones that only show up in production, like a payment provider outage or a CDN cache serving a stale checkout bundle. Monitor mode runs a test or objective on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run.

```bash
browserbash monitor .browserbash/tests/guest-checkout_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Every ten minutes the agent walks the guest checkout. If it breaks, you get a Slack message (Slack incoming-webhook URLs get Slack formatting automatically; other URLs get the raw JSON payload). When it recovers, you get a second message. You are not spammed with green pings. Because the replay cache makes an always-on monitor nearly token-free, running a synthetic checkout every ten minutes costs almost nothing until the day it saves you from a silent revenue leak. That is the cheapest insurance a commerce team can buy.

## Migrate existing Playwright specs instead of rewriting

If you already have a Playwright suite for your Medusa storefront, you do not have to throw it away. The `import` command converts specs to plain-English `*_test.md` files heuristically, with no model involved, so it is deterministic and reproducible.

```bash
browserbash import ./e2e/checkout.spec.ts
```

It translates the common surface (goto, click, fill, press, check, selectOption, getBy* locators, and common expects), turns `process.env.X` into `{{X}}` variables, and writes everything it could not translate into an `IMPORT-REPORT.md` instead of dropping it or inventing a fake step. You review the report, hand-fix the tricky bits, and you have a starting point in minutes instead of a rewrite in days. Similarly, `browserbash record <url>` opens a visible browser, you click through the flow once, and Ctrl-C writes a plain-English test. Password fields never leave the page: the capture script sends only a secret marker, and the generated step reads `Type {{password}} into ...`. Between import and record, getting your first ten storefront tests written is an afternoon, not a sprint.

## When to choose intent-based testing for your storefront

Be deliberate about where this fits. AI browser automation is the right call for your Medusa storefront when the frontend changes often, when your journeys are multi-step and read naturally in English, and when selector maintenance is eating real engineering time. It pairs especially well with the Next.js starter precisely because that codebase evolves and its DOM is not a stable contract.

It is the wrong call for a few cases, and saying so plainly is more useful than pretending otherwise. Pure API contract tests on Medusa's Store and Admin endpoints belong in a fast API test framework, not a browser. Millisecond-level performance assertions want a dedicated tooling layer. And if your storefront almost never changes and you already have a green selector suite that nobody touches, the migration may not pay for itself. The honest framing: use deterministic API seeding for setup, intent-based agent steps for the fuzzy navigation, and deterministic Verify assertions for the outcomes. That layering gives you speed where you need speed and human-readable coverage where the customer actually lives.

| Concern | Selector-based Playwright | Intent-based BrowserBash |
| --- | --- | --- |
| Reacts to DOM churn | Breaks on renamed selectors | Finds elements by meaning |
| Test authoring | Code and page objects | Plain English steps |
| Setup data | Fixtures in code | API steps in testmd v2 |
| Outcome checks | Assertions in code | Deterministic Verify steps |
| Re-run cost | Fast, fixed | Near-zero with replay cache |
| Best fit | Stable UIs, API contracts | Fast-moving storefronts |

For teams weighing the operational side, the [pricing page](https://browserbash.com/pricing) lays out what stays free forever (everything that runs on your machine) versus the optional hosted extras, and the [case study](https://browserbash.com/case-study) shows the pattern applied end to end.

## FAQ

### How do I test a Medusa.js storefront without writing selectors?

You describe the shopper journey in plain English and let an AI agent drive a real browser to carry it out. With BrowserBash you write steps like "add the sweatshirt to the cart and check out as a guest," and the agent reads the page by meaning rather than by CSS path, so a redesigned cart drawer does not break your test. You then pin outcomes with deterministic Verify steps that compile to real Playwright checks.

### Can I seed cart and order data before checking the UI?

Yes, using testmd v2. Add version: 2 to the test frontmatter and you get deterministic API steps that call the Medusa Store REST endpoints to seed a cart, line items, or a promotion, followed by Verify steps that confirm the UI reflects what you seeded. This avoids clicking through the whole funnel just to test one screen. Note that testmd v2 currently needs the builtin engine with an Anthropic key or a compatible gateway.

### Does this work in CI and with my AI coding agent?

Both. The run-all command runs a folder of tests in parallel with sharding and a spending budget, emits JUnit and NDJSON, and returns stable exit codes for your pipeline to branch on. Separately, the MCP server exposes run_objective, run_test_file, and run_suite so agents in Claude Code, Cursor, or Codex can validate their own storefront changes and read the structured verdict directly.

### What does it cost to run these storefront tests?

If you use a local Ollama model, the model itself is free and nothing leaves your machine. If you use a hosted model, each run costs a few cents, and the run_end output includes a cost_usd estimate from a bundled price table. The replay cache makes repeat runs nearly free because a green run records its actions and the next identical run replays them with zero model calls, so even an always-on monitor stays cheap.

Ready to validate your storefront by intent instead of by selector? Install the CLI with `npm install -g browserbash-cli` and write your first browse-and-buy test in minutes. An account is optional, but if you want the free cloud dashboard and hosted extras you can [sign up here](https://browserbash.com/sign-up) and keep everything that runs on your machine free forever.
