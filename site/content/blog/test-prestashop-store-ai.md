---
title: Test a PrestaShop Store With AI Browser Automation
description: "Learn to test a PrestaShop store with AI browser automation: cart, checkout, and payment flows tested by plain-English intent, no selectors."
date: 2026-05-28
category: use-case
---

If you run a PrestaShop store, you already know the anxiety: a theme update ships, a module gets patched, and two days later a customer emails to say the "Add to cart" button does nothing on mobile. The traditional answer is a pile of Selenium or Cypress scripts pinned to CSS selectors that break the moment a designer renames a class. This guide shows you how to test a PrestaShop store with AI browser automation instead, where you describe the shopper's intent in plain English and an AI agent drives a real Chrome browser through your cart and checkout the way a human would. No page objects, no brittle XPath, just the flows that actually earn you money.

The tool at the center of this walkthrough is [BrowserBash](https://browserbash.com/features), a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective, an AI agent executes it step by step against a real browser, and you get a deterministic verdict plus structured results. PrestaShop is a good fit because its storefront is stable in concept (product page, cart, address, shipping, payment, confirmation) but volatile in markup across themes, versions, and modules. Intent-based testing survives that volatility.

## Why PrestaShop stores are painful to test the old way

PrestaShop's default themes (Classic, and community themes built on top of it) render a checkout that changes its DOM depending on which payment modules you have installed, whether guest checkout is enabled, and which PrestaShop version you are on. A selector that works on 1.7 may not survive the jump to 8.x. Add a one-page checkout module or a marketplace theme and your carefully tuned locators evaporate.

There are three specific pain points that intent-based testing addresses directly:

- **Dynamic IDs and generated classes.** PrestaShop and its JavaScript widgets sprinkle generated identifiers through the cart summary, the address form, and the payment step. Hardcoding those into a script is a maintenance tax you pay forever.
- **Multi-step state that must persist.** A real checkout test spans a product page, the cart, an address form, a shipping choice, and a payment option, all in one continuous browser session. Any test that loses the cart between steps is worthless.
- **Ajax cart updates.** Adding to cart in PrestaShop usually fires an Ajax call and pops a modal or updates a mini-cart. Timing-sensitive selector scripts flake here constantly. An agent that waits for the visible result instead of a specific network event is far steadier.

When you test a PrestaShop store with AI, you stop encoding the how (click `#add-to-cart-or-refresh`) and start encoding the what (add the first product to the cart and confirm the cart count is 1). The agent figures out the how at run time against whatever the page currently looks like.

## Install BrowserBash and run your first PrestaShop check

Getting started is one command. BrowserBash is published on npm as `browserbash-cli` and installs globally.

```bash
npm install -g browserbash-cli

# Smoke test: open your storefront and confirm the home page renders
browserbash run "Open https://demo.prestashop.com and confirm the store home page loads with product listings visible" --headless --timeout 120
```

That single `run` command spins up a real Chromium browser, hands your objective to an AI agent, and returns a verdict. By default BrowserBash is Ollama-first: it looks for a local model before any hosted API, so nothing has to leave your machine and you do not need an API key to begin. The model resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If none are configured it prints setup guidance rather than failing silently.

One honest caveat up front: very small local models (around 8B parameters and under) can get lost on long multi-step checkout flows. The sweet spot for a full add-to-cart-through-payment run is a mid-size local model (Qwen3 or Llama 3.3 in the 70B class) or a capable hosted model. For a quick "does the home page load" smoke test, a small model is fine. For the money flows below, give the agent a stronger model.

If you want to point at your own store instead of the PrestaShop demo, just swap the URL. Everything in this guide works against a local dev instance, a staging environment, or production (read-only checks at least; never fire real payments at a live gateway).

## Test the add-to-cart flow by intent

The add-to-cart flow is where selector-based scripts flake the most, so it is the best place to feel the difference. Here is a single objective that exercises the core path:

```bash
browserbash run "Open the store, click the first product in the featured products list, select any available size and color if the product has options, add it to the cart, then confirm the cart shows 1 item and the correct product name" --agent --headless --timeout 180
```

The `--agent` flag switches output to NDJSON, one JSON event per line, so you get a clean `step` stream and a final `run_end` event instead of prose. That matters for two reasons. First, it is trivial to pipe into CI. Second, the exit code is a frozen contract: 0 for passed, 1 for failed, 2 for an error or infrastructure problem, 3 for a timeout. Your pipeline can branch on that without parsing English.

Notice what the objective does not contain: no selectors, no waits, no "if the size dropdown exists" branching logic. The agent reads the page, sees whether the product has combinations, and handles them. If your theme renders size as a dropdown and color as swatches, the agent adapts. If a different product renders both as radio buttons, the same objective still works. That adaptability is the whole point of choosing to test a PrestaShop store with AI rather than with pinned locators.

### Handling the Ajax cart modal

PrestaShop's default "added to cart" modal is a classic timing trap. Instead of racing a network event, phrase the check around the visible outcome: "confirm the cart shows 1 item." The agent waits for that state to be true on the page, which is exactly how a human verifies the action. If the modal is slow, the agent waits; if it never appears, the check fails with a clear reason. You get the resilience without writing a single explicit wait.

## Turn the checkout into a committable Markdown test

Ad hoc `run` commands are great for exploration, but the checkout flow deserves a file you commit next to your code. BrowserBash uses `*_test.md` files: a Markdown title, numbered or bulleted steps in plain English, `@import` composition, and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so a test card number or a password never leaks into your CI output.

Create `.browserbash/tests/prestashop_checkout_test.md`:

```bash
# PrestaShop guest checkout

1. Open https://your-store.example and add the first featured product to the cart
2. Proceed to checkout from the cart
3. Choose to check out as a guest
4. Fill the address form with name "Test Buyer", email "{{email}}", and a valid shipping address
5. Select the cheapest available shipping method
6. Select the "Pay by check" or bank wire payment option
7. Agree to the terms of service and place the order
8. Verify the URL contains "order-confirmation"
9. Verify the text "Your order is confirmed" is visible on the page
```

Run it with:

```bash
browserbash testmd run .browserbash/tests/prestashop_checkout_test.md --agent
```

Steps 8 and 9 are the important ones. Lines that start with **Verify** and match BrowserBash's assertion grammar compile to real deterministic Playwright checks (URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, a stored value equals) with **no LLM judgment involved**. A pass means the condition genuinely held. A failure comes with expected-versus-actual evidence recorded in the `run_end.assertions` block and in the human-readable `Result.md` that BrowserBash writes after every run. That deterministic layer is what lets you trust the verdict enough to gate a deployment on it. The [tutorials on browserbash.com](https://browserbash.com/tutorials) walk through the full Verify grammar if you want the exact matchers.

Use the "Pay by check" or bank wire module for automated tests, never a live card gateway. It exercises the entire order-placement pipeline (address, shipping, terms, order creation, confirmation page) without moving real money.

## Seed test data with API steps using testmd v2

Here is a problem every ecommerce tester hits: to test checkout reliably you need a known product, a known price, maybe a known coupon. Clicking through the admin to set that up before every run is slow and flaky. BrowserBash's testmd v2 format solves this by letting you mix deterministic API calls with UI checks in the same file.

Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session. Two step types never touch a model: API steps for seeding or asserting data over HTTP, and Verify steps for checking the result through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

```bash
---
version: 2
---

# PrestaShop product availability check

1. GET https://your-store.example/api/products/1?ws_key={{WS_KEY}}&output_format=JSON
2. Expect status 200, store $.product.name as 'productName'
3. Open https://your-store.example and search for the product named {{productName}}
4. Verify text {{productName}} is visible
5. Add the product to the cart
6. Verify '1' is shown in the cart quantity
```

Step 1 hits the PrestaShop webservice API (if you have it enabled) to read a known product straight from the source of truth. Step 2 asserts the status and captures the product name into a variable with a JSONPath expression. Steps 3 through 6 then verify that the storefront actually surfaces that product and lets a shopper add it. You are checking the UI against the database without hand-maintaining fixtures.

Two honest limitations to note. testmd v2 currently drives the builtin engine, which speaks the Anthropic API, so this specific format needs `ANTHROPIC_API_KEY` set (or a compatible `ANTHROPIC_BASE_URL` gateway). It does not yet run directly on Ollama or OpenRouter. And the PrestaShop webservice API is opt-in per store; if you have not enabled it, skip the API steps and lean on the pure-UI Verify approach from the previous section.

## Reuse a logged-in session for customer-account flows

A big chunk of PrestaShop testing lives behind a login: order history, saved addresses, wishlist, loyalty points, re-order. Logging in on every single test is slow and, worse, hammering your login form dozens of times in CI can trip rate limits or bot protection.

BrowserBash's saved-login feature fixes this. You log in once, interactively, and it captures the session as a Playwright storageState:

```bash
# Log in once; a real browser opens, you sign in, press Enter to save
browserbash auth save prestashop-customer --url https://your-store.example/login

# Reuse that session on any run, no login step needed
browserbash run "Open the account page, go to order history, and confirm at least one past order is listed" --auth prestashop-customer --headless
```

The `--auth` flag works on `run`, `testmd`, `run-all`, and `monitor`, or you can put `auth:` in a test file's frontmatter. If the saved profile's origins do not cover the start URL you point it at, BrowserBash prints a warning instead of quietly doing nothing, which saves you from the classic "why is it on the login page" head-scratch. This is the fastest way to test account-gated PrestaShop features without paying the re-login tax on every run.

## Run the whole suite in parallel and cap the cost

Once you have a handful of test files (guest checkout, logged-in reorder, coupon apply, out-of-stock behavior, search), you want to run them together. That is what `run-all` is for. It discovers every `*_test.md` in a folder and runs them with a memory-aware orchestrator: concurrency is derived from your real CPU and RAM, previously failed and slowest tests run first, and flaky tests get flagged.

```bash
# Run the whole PrestaShop suite, shard 2 of 4 for parallel CI, cap spend at $2
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

Two flags there earn their keep for an ecommerce team. `--shard 2/4` runs a deterministic slice of the suite computed on sorted discovery order, so four CI machines can each take a quarter without any coordination between them and they will never overlap or miss a test. `--budget-usd 2` stops launching new tests once estimated spend crosses two dollars: remaining tests are reported as skipped, the suite exits 2, and the spend lands in `RunAll-Result.md` and the JUnit properties. If you are running hosted models, that guardrail keeps a runaway loop from surprising you on the invoice.

Cost estimates come from a bundled per-model price table surfaced as `cost_usd` in the `run_end` event. Unknown models get no estimate rather than a wrong one, which is the honest default. If you run entirely on local Ollama, cost is effectively zero and the budget flag simply never trips.

There is also a viewport matrix if you care about responsive checkout (and for PrestaShop you should, since a large share of storefront traffic is mobile). Adding `--matrix-viewport 1280x720,390x844` runs every test once per viewport, labeled in the events, JUnit, and results, so you catch the mobile-only "Add to cart does nothing" bug before your customers do.

## Keep the replay cache and monitoring working for you

Two features quietly change the economics of running these tests often.

The **replay cache** records the actions from a green run. The next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page has actually changed. For a stable checkout flow that passes day after day, that means your regression suite is nearly free to run and far faster after the first pass. When PrestaShop ships a theme tweak that moves the cart button, the cache misses on that step, the agent re-plans just that part, and the run continues.

**Monitor mode** turns a test into a synthetic uptime check for your checkout:

```bash
browserbash monitor .browserbash/tests/prestashop_checkout_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ --auth prestashop-customer
```

That runs your checkout test every ten minutes and alerts **only on state changes**, pass to fail and fail back to pass, never on every green run. So you are not drowning in "checkout still works" pings; you hear from it exactly when checkout breaks and again when it recovers. Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload. Because the replay cache makes each interval run nearly token-free, an always-on checkout monitor costs almost nothing to keep running.

## When intent-based testing is the right call (and when it is not)

Being honest about fit matters more than hype. Here is a straight comparison of AI intent-based testing against classic selector-based end-to-end tools for a PrestaShop store.

| Concern | AI intent testing (BrowserBash) | Selector-based (Selenium/Cypress/Playwright scripts) |
| --- | --- | --- |
| Survives theme and version changes | Strong: adapts to new markup at run time | Weak: locators break on markup changes |
| Test authoring speed | Fast: plain English, no page objects | Slower: build and maintain selectors and helpers |
| Deterministic assertions | Yes, via Verify steps compiled to Playwright checks | Yes, native |
| Microsecond-precise timing control | Limited | Strong, full control |
| Cost per run | Model calls (or free on local Ollama), cached after first pass | Compute only, no model cost |
| Best for | Business flows: cart, checkout, account, search | Deep component tests, exact-state assertions, huge stable suites |

Choose AI intent testing when your pain is maintenance: themes change, modules come and go, and you keep rewriting selectors for flows whose business meaning never changes. Cart, guest and account checkout, coupon application, search, and account pages are the sweet spot.

Reach for a traditional selector-based framework when you need microsecond timing control, exhaustive component-level assertions, or you already own a large, stable, well-maintained suite that is not costing you much to keep green. The two approaches also coexist well: many teams keep their existing Playwright specs and use `browserbash import` to convert them heuristically into plain-English `*_test.md` files (deterministically, with no model involved), then let the intent layer own the fragile high-level flows while the scripts keep the deep assertions. Anything that cannot be translated cleanly lands in an `IMPORT-REPORT.md` rather than being dropped or invented.

If you want to see how other teams structure this, the [BrowserBash case studies](https://browserbash.com/case-study) and the [learn hub](https://browserbash.com/learn) both have worked examples you can adapt to a PrestaShop context.

## Wire it into CI and your AI coding agent

Two more integrations close the loop. For CI, there is an official GitHub Action that installs the CLI, runs your suite, uploads the JUnit, NDJSON, and results artifacts, supports sharded matrix jobs and a budget cap, and posts a self-updating PR comment with the verdict table. The full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). Drop it into your workflow and every pull request that touches your theme or a checkout module gets an automatic cart-and-checkout verdict before it merges.

For AI coding agents, BrowserBash ships an MCP server. Running `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, and one line wires it into any MCP host:

```bash
claude mcp add browserbash -- browserbash mcp
```

The same idea works for Cursor, Windsurf, Codex, and Zed. It exposes three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The key mental model: a failed test is a successful validation. The tool call itself succeeds and hands the agent the verdict to read, so an AI agent building a PrestaShop feature can validate its own work against a real browser before it claims done. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

## FAQ

### Can AI browser automation handle PrestaShop's dynamic cart and checkout markup?

Yes, that is precisely where it shines. Because you describe intent (add a product, confirm the cart count, place the order) rather than pin CSS selectors, the AI agent reads the actual page at run time and adapts to whatever markup your theme or PrestaShop version renders. When an update moves a button or renames a class, an intent-based test keeps passing while a selector-based script would break.

### Do I need an API key to test a PrestaShop store with BrowserBash?

Not to get started. BrowserBash is Ollama-first and defaults to free local models, so nothing leaves your machine and no key is required for basic runs. For long multi-step checkout flows a mid-size or hosted model works better, and the testmd v2 format with API seeding steps specifically needs the Anthropic-compatible builtin engine, but simple cart and UI checks run fine on a local model with no key at all.

### Is it safe to run automated checkout tests against my live PrestaShop store?

Use an offline payment method like "Pay by check" or bank wire for automated order tests so you exercise the full order pipeline without charging a real card. For anything touching a live gateway, test against a staging or sandbox environment instead. You can also keep automated runs read-only (browse, add to cart, verify totals) on production and reserve full order placement for a non-production instance.

### How is this different from Selenium or Cypress for ecommerce testing?

Selenium and Cypress are selector-based: you author and maintain locators, and those break when PrestaShop markup changes. BrowserBash is intent-based, so an AI agent drives the browser from plain English and adapts to markup changes, which cuts maintenance dramatically for business flows like cart and checkout. Selector tools still win for microsecond timing control and deep component assertions, and BrowserBash can import existing Playwright specs so you can run both together.

Ready to stop babysitting brittle checkout scripts? Install the CLI with `npm install -g browserbash-cli`, point it at your storefront, and describe the first cart flow in plain English. Creating an account is optional and everything runs locally by default, but if you want the free cloud dashboard and hosted run history you can [sign up here](https://browserbash.com/sign-up).
