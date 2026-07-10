---
title: Test Squarespace Commerce Checkout With AI
description: "Learn to test Squarespace commerce product pages and checkout with an AI agent that drives a real browser by plain-English intent, not brittle selectors."
date: 2026-05-30
category: use-case
---

If you run a Squarespace store, the scariest bug is the one you cannot see: a checkout that quietly breaks after a template tweak, a variant dropdown that stops updating the price, a discount code that silently fails at the payment step. To test Squarespace commerce properly you need to walk the real buying path the way a customer does, and that is exactly where an AI agent that drives a real browser earns its keep. Instead of writing selectors against Squarespace's generated markup, you describe the intent ("add the large blue tee to the cart and reach the payment step") and let the agent figure out the clicks.

This guide shows how to test Squarespace commerce end to end with [BrowserBash](https://github.com/PramodDutta/browserbash), a free and open-source natural-language browser automation CLI. You will see how to validate product pages, variant selection, cart math, promo codes, and the checkout flow, all by writing plain-English objectives that survive Squarespace's frequent DOM churn. Along the way I will be honest about where this approach shines and where a traditional coded test still wins.

## Why Squarespace commerce is hard to test the old way

Squarespace generates its storefront markup for you. That is wonderful for merchants and miserable for anyone writing Selenium or raw Playwright locators. Class names look like `sqs-block-button-element--medium`, product option controls are nested inside dynamically injected fieldsets, and the DOM changes shape when you switch templates or when Squarespace ships a platform update. A selector that worked last month can evaporate after a theme change you did not even make.

The checkout compounds the problem. Squarespace commerce routes payment through its own hosted flow, and the exact fields, iframes, and button labels shift depending on whether you use Stripe, PayPal, Apple Pay, or Squarespace's express checkout. Hardcoding those steps means your test suite becomes a maintenance tax that nobody wants to pay.

An AI agent flips the model. You state what a shopper is trying to accomplish, and the agent reads the page, decides which element matches the intent, clicks it, and reports what happened. When Squarespace renames a class or reorders a block, the intent has not changed, so the test usually keeps passing. That resilience is the whole reason to test Squarespace commerce by intent rather than by selector.

### The difference between recording clicks and describing intent

Old-school recorders capture literal coordinates or literal selectors. Intent-based testing captures meaning. "Choose the medium size and add to cart" is a stable instruction; `click(#product-variants > div:nth-child(2))` is not. That single shift is what makes AI-driven testing viable on a platform you do not control.

## Installing BrowserBash and running your first check

BrowserBash installs as a single global npm package and gives you a `browserbash` command. It defaults to free local models through Ollama, so you can run your first test without any API keys and without anything leaving your machine.

```bash
npm install -g browserbash-cli
browserbash run "Open https://your-store.squarespace.com and confirm the shop navigation link is visible" --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, which is perfect for reading in CI or by another AI coding agent. If you would rather watch it happen, drop the flag and BrowserBash prints a human-readable step log instead. Exit codes are deterministic: 0 for pass, 1 for a failed assertion, 2 for an error or infrastructure problem, 3 for a timeout. That contract matters once you wire this into a pipeline, because your CI job can trust the exit code without parsing prose.

A quick honesty note on models. Very small local models (roughly 8B parameters and under) can get flaky on long multi-step flows like a full checkout. For a page-visibility smoke test they are fine. For a five-step add-to-cart-through-payment journey, reach for a mid-size local model in the Qwen3 or Llama 3.3 70B class, or bring your own hosted key. BrowserBash auto-resolves in order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter.

## Testing the Squarespace product page by intent

A product page has more moving parts than it looks. You have the gallery, the variant selectors (size, color, style), quantity, price display, stock status, and the add-to-cart button. Each of those is a place where a template change can break the buying experience.

Here is a single objective that exercises the core of a product page:

```bash
browserbash run "Open the product page at https://your-store.squarespace.com/shop/classic-tee, select size Large and color Blue, set quantity to 2, and confirm the displayed price updates to reflect the selection" --agent --headless
```

Notice what you did not write: no selector for the size dropdown, no XPath for the price node. The agent reads the rendered page, finds the control that means "size", picks Large, and then checks that the price reacted. If Squarespace nests that control three divs deeper next month, your objective still reads the same and still passes.

### Variant math is where stores quietly break

The most common silent Squarespace commerce bug is variant pricing. You set a $5 upcharge on the XL size, then later edit the product and the upcharge does not carry through. A customer sees the base price, adds the XL, and either you eat the difference or the order looks wrong. An intent test catches this because you assert on the outcome ("price updates to reflect the selection") rather than on a specific DOM value that you would have to keep in sync.

You can make this even sharper with a deterministic assertion instead of an agent-judged one, which I will cover next.

## Deterministic checkout assertions with Verify steps

Letting an AI judge whether a page "looks right" is useful, but for money-touching flows you want hard checks that never depend on model judgment. BrowserBash lets you write these as committable Markdown test files with `Verify` steps that compile to real Playwright checks.

Create a file called `checkout_test.md`:

```
# Squarespace add to cart and reach checkout

- Open https://your-store.squarespace.com/shop/classic-tee
- Select size Large and add the item to the cart
- Open the cart and proceed to checkout
- Verify text "Order Summary" is visible
- Verify "Continue" button is visible
- Verify url contains "checkout"
```

Run it:

```bash
browserbash testmd run ./checkout_test.md
```

The plain-English steps run as grouped agent blocks that share one browser session, and each `Verify` line is checked deterministically. `Verify text "Order Summary" is visible`, `Verify "Continue" button is visible`, and `Verify url contains "checkout"` are not opinions from a model. They are real assertions. A pass means the condition held; a fail comes back with expected-versus-actual evidence in the structured `run_end.assertions` block and in the human-readable `Result.md` that BrowserBash writes after every run.

This split is the point. Use plain-English steps for the fuzzy navigation that Squarespace makes annoying, and use `Verify` steps for the facts you refuse to leave to chance. If you write a `Verify` line that falls outside the supported grammar, it still runs, but it runs agent-judged and gets flagged `judged: true` so you can tell the difference at a glance.

### What Verify can check without a model

The deterministic grammar covers the checks that matter for a storefront: URL contains a fragment, page title is or contains text, arbitrary text is visible, a named button, link, or heading is visible, element counts, and whether a stored value equals what you expect. For a checkout, that is enough to lock down the summary, the totals, and the transition into Squarespace's payment step. If you want the deeper reference, the [BrowserBash learn hub](https://browserbash.com/learn) walks through the full assertion grammar with examples.

## Seeding cart state with API steps in testmd v2

Sometimes you do not want to click through three product pages just to get a populated cart before you test the checkout UI. testmd v2 lets you mix deterministic API calls with UI steps in the same file, so you can seed state fast and then verify it through the browser.

Add `version: 2` to the frontmatter to opt in:

```
---
version: 2
---
# Seed a discount then verify it in the UI

- GET https://your-store.squarespace.com/api/health
- Expect status 200
- Open https://your-store.squarespace.com/shop/classic-tee
- Add the item to the cart and open the cart
- Enter the promo code SPRING10
- Verify text "10% off" is visible
```

In v2, steps execute one at a time against a single browser session. API steps (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, optionally with a body, plus an `Expect status` line that can store a value from the JSON response) never touch a model, so they are fast and reproducible. That makes them ideal for setup: hit an endpoint to create an order, a coupon, or a test customer, then flip to plain-English UI steps to confirm the shopper actually sees the result.

One caveat to keep you honest: testmd v2 currently runs on the builtin engine, which speaks the Anthropic API. You need an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway for v2 files. v1 files (no frontmatter) behave exactly as before and can run on your free local models. The [tutorials section](https://browserbash.com/tutorials) has a v2 walkthrough if you want the full frontmatter reference.

## Handling logged-in customers and saved carts

Plenty of Squarespace stores gate content or apply member pricing behind a customer account. Logging in on every test run is slow and, worse, it makes your tests flaky when the login form itself is what changed.

BrowserBash solves this with saved logins. You log in once, interactively, and it stores the session as a Playwright storageState profile you can reuse.

```bash
browserbash auth save squarespace-customer --url https://your-store.squarespace.com/account
```

A browser opens, you log in like a human, press Enter, and the session is saved. From then on, attach it to any run:

```bash
browserbash run "Open the account page and confirm the saved shipping address is shown" --auth squarespace-customer --agent
```

The same `--auth squarespace-customer` flag works on `testmd`, `run-all`, and `monitor`, or you can put an `auth:` line in a test file's frontmatter. If a saved profile does not cover the target start URL's origin, BrowserBash prints a warning rather than silently pretending it worked, which saves you from the classic "why is my logged-in test acting logged out" head-scratcher.

## Running the whole suite and monitoring the live store

A single product test is a start. A real store has a catalog, and you want the whole buying surface covered on every change and on a schedule after launch.

### Parallel suites with a budget guardrail

Point `run-all` at a folder of tests and it builds a memory-aware parallel plan, ordering previously-failed and slowest tests first so you learn about breakage sooner. If you are running with a hosted model, cap the spend so a runaway suite never surprises you:

```bash
browserbash run-all ./tests --shard 1/2 --budget-usd 2.00 --junit out/junit.xml
```

`--shard 1/2` runs a deterministic half of the discovered tests, computed on sorted discovery order so two CI machines agree on the split without talking to each other. `--budget-usd 2.00` stops launching new tests once estimated spend crosses the cap; the remaining tests are reported as `skipped`, the suite exits 2, and the spend lands in `RunAll-Result.md` and the JUnit properties. The `cost_usd` estimate comes from a bundled per-model price table, and unknown models get no estimate rather than a wrong one.

### Catch checkout outages before your customers do

The most valuable test of a live commerce site is the one that runs while you sleep. Monitor mode runs a test or objective on an interval and alerts only when the pass/fail state changes, in either direction, so you are not spammed by a green run every ten minutes.

```bash
browserbash monitor ./checkout_test.md --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

When the checkout breaks, you get a Slack message. When it comes back, you get another. Nothing in between. Because BrowserBash records a green run's actions to its replay cache and replays them on the next identical run with zero model calls, an always-on monitor is nearly token-free until the page actually changes, at which point the agent steps back in to figure out the new layout.

## Wiring Squarespace tests into CI and AI coding agents

If you use GitHub Actions, the official action installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result.md artifacts, supports a `shard:` matrix and `budget-usd:`, and posts a self-updating PR comment with the verdict table. The full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). For a Squarespace store, the pattern that works well is: run a fast smoke suite on every commit and the full checkout journey on a nightly schedule plus a live monitor.

There is a second integration story that is easy to miss. BrowserBash ships an MCP server, so any AI coding agent (Claude Code, Cursor, Windsurf, Codex, Zed) can call it as a validation tool:

```bash
claude mcp add browserbash -- browserbash mcp
```

Once added, your agent can call `run_objective`, `run_test_file`, or `run_suite` and read back the structured verdict JSON (status, summary, final state, assertions, cost, duration). This is genuinely useful when you have an agent editing your Squarespace injected code or a headless commerce integration: it can change something, then validate the checkout still works, and read the verdict itself. A failed test here is a successful validation. The tool call succeeds and the agent learns the checkout broke. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

## When AI-driven testing is the right call, and when it is not

I promised honesty, so here is the balanced view.

Test Squarespace commerce with an AI agent when the storefront markup is out of your control (it is, on Squarespace), when the flows change often, when you want tests a non-engineer can read and edit, and when you want a live monitor that survives template updates. Those are exactly the conditions Squarespace creates, which is why this approach fits it so well.

Reach for a traditional coded framework instead when you need microsecond-precise timing assertions, when you are testing a deterministic internal app whose selectors you fully own and rarely change, or when your team already has a mature Playwright suite and a Squarespace store is a small slice of it. There is no shame in using both: intent tests for the volatile storefront, coded tests for the parts you control.

Here is a quick comparison to make the trade-offs concrete.

| Dimension | AI intent testing (BrowserBash) | Traditional coded tests (raw Playwright/Selenium) |
| --- | --- | --- |
| Selectors for Squarespace markup | None; you describe intent | You write and maintain every locator |
| Survives template/DOM changes | Usually, because intent is stable | Breaks when generated classes change |
| Who can author tests | Anyone who can write English | Engineers who know the framework |
| Deterministic assertions | Yes, via Verify steps | Yes, native |
| Best fit | Volatile storefronts you do not control | Apps whose DOM you own |
| Cost model | Free local models or bring your own key | Free, but higher human maintenance time |

The honest summary: AI testing trades a little runtime cost and occasional non-determinism for a large reduction in maintenance on markup you cannot control. On Squarespace, that trade almost always favors the AI approach for storefront and checkout flows.

### A note on non-determinism

Because a model interprets the page, two runs are not byte-for-byte identical the way a scripted click is. BrowserBash narrows this in two ways: `Verify` steps are fully deterministic Playwright checks with no model in the loop, and the replay cache reuses a proven action sequence until the page actually changes. Use both, and the fuzzy part of your suite shrinks to just the navigation, where a little flexibility is a feature, not a bug.

## A practical rollout plan for a Squarespace store

If you are starting from zero, here is the sequence I would follow. First, install BrowserBash and write one smoke objective that just confirms the shop page loads and the primary navigation is visible. Get that green on your free local model. Second, add a product-page test that selects a variant and confirms the price reacts, using a `Verify` step for the price where you can. Third, build the checkout test file with `Verify` steps for the order summary, a named continue button, and a URL that contains "checkout". Fourth, save a customer login profile so you can test member pricing and saved addresses without re-authenticating. Fifth, wire the suite into CI with a budget cap and stand up a monitor on the checkout test with a Slack webhook.

That progression takes you from a single smoke test to a defended storefront in an afternoon, and every step is committable Markdown your whole team can read. If you want inspiration for what teams check, the [case studies](https://browserbash.com/case-study) show real validation flows you can adapt.

## Wrapping up

Squarespace makes a beautiful store and a moving target for testing. The markup is generated, the checkout is hosted, and the DOM shifts under you. Testing it by writing selectors is a losing game. Testing it by describing customer intent to an AI agent that drives a real browser is a game you can win, and keep winning through template changes, because the intent does not change even when the HTML does. Add deterministic `Verify` steps for the money-touching checks, seed state with API steps when you need speed, save a login so member flows are painless, and put a monitor on the live checkout so you hear about outages before your customers do.

Ready to test your Squarespace commerce checkout by intent? Install it with `npm install -g browserbash-cli` and run your first objective in under a minute. An account is optional and everything runs on your machine by default; if you want the free cloud dashboard and 15-day run history, create one at [browserbash.com/sign-up](https://browserbash.com/sign-up).

## FAQ

### Can I test Squarespace checkout without writing any selectors?

Yes. BrowserBash drives a real browser from plain-English objectives, so you describe what a shopper is trying to do (add an item, apply a code, reach the payment step) and the AI agent finds the right elements itself. This is what makes it practical on Squarespace, where the generated markup is out of your control and changes often. You only reach for deterministic checks, called Verify steps, when you want a hard pass or fail on something specific like the order summary or the checkout URL.

### Do I need API keys or a paid model to test my Squarespace store?

No, not to get started. BrowserBash is free and open-source and defaults to local models through Ollama, so a page-visibility or add-to-cart smoke test runs with nothing leaving your machine. For long multi-step checkout journeys, a mid-size local model in the 70B class or a hosted key you bring yourself gives more reliable results, since very small local models can get flaky on long flows. The testmd v2 format with API steps does currently require the builtin engine and an Anthropic key or compatible gateway.

### How do I test a logged-in customer flow on Squarespace?

Use saved logins. Run the auth save command once, log in interactively when the browser opens, and BrowserBash stores the session as a reusable profile. After that, add the auth flag to any run, test file, or monitor and it reuses that logged-in session instead of asking you to sign in every time. If the saved profile does not cover the store's origin, it warns you rather than silently running as a guest.

### Will these AI tests break every time Squarespace updates my template?

Usually not, and that is the main reason to test by intent. A template change rewrites class names and DOM structure, which shatters selector-based tests, but your plain-English objective ("select Large and add to cart") still describes the same goal, so the agent re-reads the new page and keeps working. For the checks you refuse to leave to chance, Verify steps give you deterministic Playwright assertions, and the replay cache reuses proven actions until the page genuinely changes.
