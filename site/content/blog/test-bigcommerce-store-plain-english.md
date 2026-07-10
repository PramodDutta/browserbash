---
title: Test a BigCommerce Store in Plain English
description: "Learn how to test a BigCommerce store in plain English: browse, add to cart, and verify checkout with an AI agent that drives a real browser."
date: 2026-05-27
category: use-case
---

If you run a BigCommerce storefront, the scariest bug is the one you never see: a checkout that silently breaks on a Tuesday afternoon while orders quietly stop landing. This guide shows you how to test a BigCommerce store in plain English, from category browse all the way to the order confirmation page, without writing a single CSS selector or maintaining a page object. You describe what a shopper should be able to do, an AI agent drives a real Chrome browser through the flow, and you get back a deterministic verdict plus structured results you can wire into CI.

The tool doing the driving is [BrowserBash](https://browserbash.com/features), a free, open-source command-line runner from The Testing Academy. It treats a browser test as an English objective rather than a script. That shift matters most on hosted platforms like BigCommerce, where the theme markup is generated for you, changes when you update Stencil themes, and rarely gives you the stable IDs that selector-based tools assume. When your assertions are written as intent instead of DOM paths, a theme refresh stops being a test-suite emergency.

## Why BigCommerce storefronts are hard to test the old way

BigCommerce Stencil themes ship a lot of generated markup. Product cards, faceted search filters, the cart drawer, and the multi-step Optimized One-Page Checkout all render from theme templates and platform components you do not own. That is great for launching fast and terrible for brittle end-to-end tests.

Three things bite selector-based suites specifically:

First, class names and data attributes drift between theme versions. A `data-cart-item` today can become a different hook after you pull an upstream theme update, and every Playwright or Selenium locator that pinned to it breaks at once.

Second, the checkout runs partly inside platform-controlled components. Payment fields, express checkout buttons, and shipping quote widgets are not always in your theme's control, and some load in iframes or hydrate asynchronously. Timing-sensitive selectors turn flaky.

Third, real storefront flows are stateful. Add-to-cart, apply a coupon, change quantity, pick a shipping method, reach the confirmation page: each step depends on the last, and a single mismatched wait cascades into a false failure that wastes an afternoon of triage.

Plain-English testing sidesteps most of this. Instead of "click the element matching `.button--primary.add-to-cart`", you write "add the first product to the cart". The agent reads the live page, finds the control a shopper would click, and acts. When BigCommerce reshuffles the markup, the intent is unchanged, so the test is unchanged.

## How BrowserBash drives a real browser from an objective

BrowserBash is the open-source validation layer for AI agents. You give it a plain-English objective, it launches a real Chrome or Chromium browser, and an agent works through the page step by step: read the current state, decide the next action, act, observe, repeat, until it either satisfies the objective or fails and tells you why. There are no selectors and no page objects in your test.

Install it globally with npm and you are ready:

```bash
npm install -g browserbash-cli
browserbash run "Open my-store.mybigcommerce.com, open the Shirts category, add the first product to the cart, and confirm the cart count shows 1 item" --agent --headless --timeout 180
```

The `--agent` flag emits NDJSON, one JSON event per line on stdout, so a CI job or an AI coding agent can read the result without parsing prose. The exit code is a frozen contract: `0` passed, `1` failed, `2` error or infrastructure or budget-stop, `3` timeout. That is enough to gate a deploy on its own.

On the model side, BrowserBash is Ollama-first. By default it looks for a local Ollama model so nothing leaves your machine and you spend nothing per run. If it does not find one, it resolves to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, and if none exist it prints setup guidance rather than failing cryptically. One honest caveat worth stating up front: very small local models (around 8B and under) get flaky on long multi-step flows like a full checkout. For a browse-to-confirmation objective, use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. Short objectives are fine on smaller models. The [learn hub](https://browserbash.com/learn) has more on picking a model for your flow.

## Your first plain-English BigCommerce test

Start with the smallest useful thing: prove a shopper can find a product and add it to the cart. Run it interactively first so you can watch the browser work.

```bash
browserbash run "Go to my-store.mybigcommerce.com. Search for 'coffee mug'. Open the first result. Add it to the cart. Verify the cart shows 1 item and the mug's name appears in the cart." --timeout 180
```

Drop `--headless` while you are developing so you can see exactly where the agent goes and where it hesitates. Once the objective reads cleanly and passes, add `--headless` and `--agent` for the CI version.

Notice how the objective is phrased. It names a concrete goal ("search for coffee mug"), a concrete action ("add it to the cart"), and a concrete check ("cart shows 1 item and the name appears"). That last clause is the important part. An objective without a verification can pass just by navigating around. Always end with what should be true when the shopper is done. The more specific the expected state, the more useful the verdict.

### Turn the run into a committable test file

Ad hoc `run` commands are great for exploration, but your suite should live in version control. BrowserBash uses plain Markdown test files, `*_test.md`, with a title, numbered steps, `@import` composition, and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so a coupon code or a test account password never leaks into your CI output.

A basic BigCommerce browse test looks like this:

```
# Browse to cart on the storefront

1. Open {{store_url}}
2. Open the "Kitchen" category from the main navigation
3. Add the first product to the cart
4. Open the cart drawer
5. Verify the cart shows 1 item
```

Save that as `browse_to_cart_test.md` and run it with `browserbash testmd run ./browse_to_cart_test.md`. Every run writes a human-readable `Result.md` next to it, so you get a shareable pass or fail record without standing up a dashboard. When you do want a dashboard, `browserbash dashboard` serves a fully local one on port 4477 with nothing leaving your machine.

## Verifying checkout by intent, not by selector

The whole point of testing a BigCommerce store is the checkout. This is where "verified by intent" earns its keep, because the checkout is the most platform-controlled, most iframe-heavy, most timing-sensitive part of the whole storefront.

BrowserBash gives you deterministic `Verify` assertions that compile to real Playwright checks with no LLM judgment involved. Supported forms include URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and a stored value equals. A pass means the condition genuinely held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the `Result.md` assertion table, so you are never guessing why it went red.

That distinction matters on checkout. You want the order confirmation to be a hard, deterministic assertion, not an agent's opinion. Here is a checkout test that browses, adds to cart, walks the guest checkout, and pins the outcome:

```
# Guest checkout reaches order confirmation

1. Open {{store_url}}
2. Add the first product on the homepage to the cart
3. Open the cart and proceed to checkout
4. Choose to check out as a guest with email {{test_email}}
5. Fill the shipping address with the test address for {{test_email}}
6. Select the cheapest shipping method
7. Continue to payment and enter the test card {{test_card}}
8. Place the order
Verify: text "Your order has been received" visible
Verify: url contains "/checkout/order-confirmation"
```

Steps 1 through 8 are plain-English work the agent figures out against the live page. The two `Verify` lines are deterministic gates. If either fails, you get the expected value, the actual value, and a screenshot with a DOM excerpt, which is the difference between "checkout is broken" and "checkout is broken on the shipping step because no methods returned for this zip". Use only a real BigCommerce sandbox and platform test-mode payment credentials here. Never point a checkout test at a production store with a live card.

A `Verify` line that falls outside the deterministic grammar still runs. It gets judged by the agent and is flagged `judged: true` in the results, so you can always tell a hard assertion from a soft one at a glance.

## Seeding storefront data with testmd v2 API steps

Pure UI tests have a setup problem. To test "the cart badge shows the right count after a customer adds three items", you first need a customer, or a product in stock, or a coupon that exists. Clicking all of that setup through the UI is slow and flaky. This is what testmd v2 solves.

Add `version: 2` to a test file's frontmatter and the steps execute one at a time against a single browser session, with two deterministic step types that never touch a model. API steps (`GET`, `POST`, `PUT`, `DELETE`, `PATCH` against a URL, optionally with a body) let you seed or read data, and `Expect status N` lets you assert on the response and store a value from the JSON body for later steps. Verify steps then check the result through the UI.

```
---
version: 2
auth: bc_admin
---

# Coupon applies at checkout

POST https://api.bigcommerce.com/stores/{{store_hash}}/v3/marketing/promotions with body {"name":"E2E10","status":"ENABLED","rules":[{"action":{"cart_value":{"discount":{"percentage_amount":"10"}}}}]}
Expect status 201, store $.data.id as 'promo_id'

Open {{store_url}}
Add the first product to the cart
Open the cart and apply the coupon code E2E10
Verify: text "Coupon applied" visible
```

The API call seeds the promotion deterministically, then the plain-English steps drive the storefront UI to confirm a shopper actually benefits from it. Consecutive plain-English steps run as grouped agent blocks on the same page, so you are not re-launching a browser between them. Two honest constraints: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway, and it does not yet run directly on Ollama or OpenRouter. If you are all-local today, keep your seeding in the deterministic API steps and lean on hosted models for the agent blocks. More patterns live in the [tutorials](https://browserbash.com/tutorials).

## Reusing a logged-in customer session

A lot of BigCommerce behavior only exists for signed-in customers: saved addresses, order history, wishlists, customer-group pricing, and one-click reorder. Logging in through the UI on every single test is slow and, worse, it is a shared failure point. If the login step flakes, your whole suite goes red for a reason that has nothing to do with what you are testing.

BrowserBash handles this with saved logins built on Playwright storageState. You log in once, interactively, and reuse that session everywhere:

```bash
browserbash auth save shopper --url https://my-store.mybigcommerce.com/login.php
```

A browser opens, you sign in as your test customer, press Enter, and the session is saved under the name `shopper`. From then on, add `--auth shopper` to any `run`, `testmd`, `run-all`, or `monitor` command, or put `auth: shopper` in a test file's frontmatter, and the run starts already signed in. If a saved profile's origins do not cover the start URL you point it at, BrowserBash prints a warning instead of silently doing nothing, which saves you from the classic "why is it logged out" mystery.

```bash
browserbash run "Open my account, go to Order History, and verify at least one past order is listed" --auth shopper --agent --headless
```

That test now assumes nothing about the login form's markup and never re-types a password. When BigCommerce changes the account UI, your reorder test does not care.

## Running the full suite in CI without breaking the bank

Once you have a handful of `*_test.md` files (browse, guest checkout, logged-in reorder, coupon, out-of-stock behavior), you run them together with `run-all`. It is a memory-aware orchestrator: it derives concurrency from real CPU and RAM, runs previously-failed and slowest tests first so you learn about breakage early, and flags flaky tests across runs. It writes a `RunAll-Result.md` summary and can emit JUnit for your CI to render.

Because these are AI-driven runs, cost governance is built in. Every `run_end` carries a `cost_usd` estimate from a bundled per-model price table, and you can cap a whole suite:

```bash
browserbash run-all ./tests --junit out/junit.xml --budget-usd 2.00 --shard 2/4
```

`--budget-usd 2.00` stops launching new tests once the suite crosses two dollars of estimated spend. Remaining tests are reported `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. That is a hard guardrail against a runaway CI bill. `--shard 2/4` runs a deterministic slice of the suite, computed on sorted discovery order so four parallel CI machines agree on who runs what without any coordination. You can also matrix across viewports with `--matrix-viewport 1280x720,390x844` to run every test once on desktop and once on a phone-sized screen, which matters for BigCommerce themes that render a different mobile checkout.

The [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wraps all of this. It installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result artifacts, supports `shard:` matrix jobs and `budget-usd:`, and posts a self-updating pull request comment with the verdict table. Your reviewers see "guest checkout: PASS, coupon: PASS, reorder: FAIL" right in the PR.

There is one more efficiency worth knowing. A green run records its actions in a replay cache. The next identical run replays those actions with zero model calls, and the agent only steps back in when the page actually changed. On a stable storefront, most of your suite becomes nearly token-free after the first pass, and the agent's judgment is spent only where BigCommerce genuinely shifted.

## Catching a broken checkout before your customers do

CI catches regressions you introduce. It does not catch the ones the platform introduces: a payment gateway outage, an expired certificate on a shipping quote provider, a theme app that pushed a bad update overnight. For those you want a monitor.

```bash
browserbash monitor ./tests/guest_checkout_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

This runs your guest-checkout test every ten minutes and alerts only on a pass-to-fail or fail-to-pass state change, in both directions, never on every green run. So you are not training your team to ignore a channel full of "checkout still works" messages. A Slack incoming-webhook URL gets Slack formatting automatically. Any other URL gets the raw JSON payload for your own routing. Because of the replay cache, an always-on monitor of a stable checkout is nearly free to run, which is what makes ten-minute synthetic monitoring practical rather than a budget problem. There is a real-world walkthrough of this pattern in the [case study](https://browserbash.com/case-study).

## When plain-English testing is the right call, and when it is not

Be honest about fit. Plain-English, agent-driven testing is not a universal replacement for scripted tests.

It shines for BigCommerce storefront journeys: browse, search, filter, add to cart, apply coupons, guest and logged-in checkout, account flows, and post-deploy smoke tests. These are exactly the flows where selector churn hurts most and where "did a shopper actually get to the confirmation page" is the question that matters. It is also strong for teams without a dedicated SDET, because a product manager can read and even write the tests.

It is a weaker fit when you need microsecond-precise timing assertions, when you are testing a component in isolation rather than a user journey, or when you have thousands of tiny deterministic checks where an agent's per-step judgment is overkill and pure Playwright is faster and cheaper. If you already have a large, healthy scripted Playwright suite, you do not throw it away. Use `browserbash import` to convert those specs to plain-English `*_test.md` heuristically and deterministically, with anything untranslatable landing in an `IMPORT-REPORT.md` rather than being silently dropped, and run both suites side by side.

| Scenario | Plain-English BrowserBash | Selector-based scripts |
| --- | --- | --- |
| Storefront browse-to-checkout journeys | Strong: survives theme changes | Brittle: breaks on markup churn |
| Post-deploy smoke test | Strong: fast to write, intent-based | Works, but high maintenance |
| Component-level isolation tests | Weak: overkill | Strong: precise and fast |
| Thousands of tiny deterministic checks | Weak: cost adds up | Strong: cheapest per assertion |
| Non-engineers writing tests | Strong: reads like English | Weak: needs coding |
| Precise timing or performance budgets | Weak | Strong |

The pragmatic answer for most BigCommerce teams is a blend: deterministic `Verify` assertions and API steps for the exact checks that must be exact, agent-driven plain English for the messy human journeys, and the replay cache keeping the whole thing affordable. You can compare tiers on the [pricing page](https://browserbash.com/pricing); everything that runs on your own machine, the CLI, both engines, the local dashboard, the cache, and MCP, stays free.

## FAQ

### Can I test a BigCommerce checkout without writing selectors?

Yes. You write the checkout flow as a plain-English objective, such as browse to a product, add it to the cart, check out as a guest, and reach the order confirmation page. An AI agent reads the live storefront and finds the controls a shopper would use, so there are no CSS selectors or page objects in your test. For the final result you add deterministic Verify assertions that compile to real Playwright checks, which gives you a hard pass or fail on the confirmation page rather than an opinion.

### Do I need API keys or a paid account to test my store?

No. BrowserBash is Ollama-first, so by default it uses a free local model, keeps everything on your machine, and costs nothing per run. If you prefer a hosted model it will use an Anthropic, OpenAI, or OpenRouter key when one is present, but that is your choice. An account on browserbash.com is optional and only unlocks hosted retention and the cloud dashboard, so the core CLI, both engines, and the local dashboard are free forever.

### How do I keep an AI-driven test suite from running up a large bill?

Use the built-in cost governance. Every run reports a cost_usd estimate, and run-all accepts a budget-usd flag that stops launching new tests once the suite crosses your limit, marks the rest skipped, and exits with an error code. On top of that, the replay cache makes repeat runs of a stable storefront nearly token-free because the agent only re-engages where the page actually changed. Together those two features keep even an always-on checkout monitor affordable.

### What happens when my BigCommerce theme changes and breaks a test?

Because your tests describe intent rather than markup, a theme update that reshuffles class names or data attributes usually leaves them working, since "add the first product to the cart" does not depend on any specific selector. If a genuine behavior changed, the deterministic Verify assertions fail with expected-versus-actual evidence plus a screenshot and a DOM excerpt, so you can see exactly what broke and where. That is a far cry from a wall of selector-not-found errors that tell you nothing about whether the shopper experience actually regressed.

## Start testing your storefront today

You can go from install to a passing browse-to-checkout test in a few minutes. Install the CLI with `npm install -g browserbash-cli`, point a plain-English objective at your BigCommerce sandbox, and add a couple of Verify assertions to lock down the order confirmation page. When you are ready to wire it into CI, add the GitHub Action and set a budget. Grab the source on [GitHub](https://github.com/PramodDutta/browserbash) or the package on [npm](https://www.npmjs.com/package/browserbash-cli), and if you want the optional cloud dashboard and hosted retention you can create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up).
