---
title: Test a Swell Headless Store With Plain-English Tests
description: "Learn to test a Swell store with plain-English objectives: verify headless cart, checkout, and API-seeded data without brittle selectors or page objects."
date: 2026-06-04
category: use-case
---

If you run a headless storefront on Swell, you already know the hard part is not building the front end. It is proving that the cart, the checkout, and the order flow still work after every deploy. When you want to test a Swell store the traditional way, you write selectors against a React or Vue front end that changes weekly, and those selectors rot. BrowserBash takes a different route: you write a plain-English objective, an AI agent drives a real Chrome browser step by step, and you get back a deterministic verdict. No page objects, no CSS selectors, no waiting for a designer to stop renaming class names.

This guide walks through how to validate a Swell headless commerce flow end to end using intent instead of implementation details. We will cover the add-to-cart path, the checkout, guest versus logged-in purchases, and how to seed data through Swell's API so your UI checks stay fast and reliable. Everything here uses the free, open-source `browserbash-cli`, and most of it runs against free local models with nothing leaving your machine.

## Why Swell stores are hard to test the old way

Swell is a headless, API-first commerce platform. Your catalog, cart, and orders live behind Swell's backend, and you build whatever front end you like on top: Next.js, Nuxt, Astro, a custom SPA, or a static site with client-side hydration. That decoupling is great for developer experience and terrible for classic UI test suites.

The trouble comes from three directions at once. First, the DOM is generated. Component libraries emit hashed class names and deeply nested wrappers, so a selector like `.sc-bdVaJa.kGItas > button:nth-child(2)` is one refactor away from meaningless. Second, the cart is asynchronous. Adding a product fires a background request to Swell, updates local state, and re-renders the mini-cart. A test that clicks and immediately asserts will flake unless you hand-tune waits everywhere. Third, checkout spans multiple states: guest capture, shipping, payment, and confirmation, each of which may live on a different route or inside a single-page modal.

Write that as Playwright or Cypress and you end up maintaining a small application just to test your application. Write it as an intent, and the agent figures out the current DOM at run time. When you test a Swell store by describing what a shopper does, the fragile middle layer disappears.

## The plain-English approach in one command

Here is the smallest useful example. You describe the shopper's goal, and the agent navigates, finds the product, adds it, and reports what it saw.

```bash
npm install -g browserbash-cli

browserbash run "Open my Swell storefront at https://shop.example.com, \
open the first product, add it to the cart, and confirm the cart count \
shows 1 item" --headless --timeout 120
```

That single objective becomes one run. The agent takes a snapshot of the accessibility tree, decides which element is the product link, clicks it, finds the add-to-cart control, and verifies the cart badge. You did not name a selector once. If the front end ships a redesign tomorrow that moves the button and renames every class, the same objective still passes, because the agent reads the live page each time.

By default BrowserBash is Ollama-first. It looks for a local model before anything else, so this run can cost you nothing and send zero data off your laptop. If you do not have Ollama running, it falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat: very small local models (around 8B parameters and under) get shaky on long multi-step checkouts. For a full guest-to-confirmation flow, a mid-size local model in the 70B class (Qwen3 or Llama 3.3) or a capable hosted model is the sweet spot. Short objectives like the one above run fine on smaller models.

## Writing a repeatable cart test as a markdown file

Ad hoc `run` commands are great for exploration, but you want your Swell tests committed to the repo and running in CI. BrowserBash uses committable `*_test.md` files: a title, a list of plain-English steps, optional `{{variables}}`, and `@import` composition for shared setup.

A basic add-to-cart test looks like this:

```
# Swell add to cart

- Open https://shop.example.com
- Search for "Merino Beanie"
- Open the first matching product
- Select size Medium if a size option is shown
- Add the product to the cart
- Open the cart drawer
- Verify the cart contains "Merino Beanie"
- Verify the cart subtotal is greater than zero
```

Run it with the `testmd` command. Each line reads like something you would tell a new QA hire, not like code. The `Verify` steps at the end are special: instead of being agent-judged prose, they compile to real Playwright checks. "Verify the cart contains" becomes a genuine text-visible assertion, and the run records expected-versus-actual evidence if it fails. That distinction matters for a store, because you want a cart total check to be a hard, deterministic gate, not a language model's opinion.

You can read more about the assertion grammar and how BrowserBash separates deterministic checks from judged ones in the [BrowserBash tutorials](https://browserbash.com/tutorials), which walk through each supported `Verify` form.

### Keeping the store URL and product data out of the steps

Hard-coding `https://shop.example.com` into every file is a maintenance trap. Put shared values in variables so the same suite runs against local, staging, and production. A frontmatter block or an imported variable file lets you swap `{{store_url}}` and `{{test_sku}}` per environment without touching the steps. Secret-marked variables (an API token, a test card) are masked as `*****` in every log line, so committing the tests never leaks credentials.

## Seeding cart and catalog data through Swell's API

The slowest, flakiest part of any commerce test is arranging the world before you check it. If you want to verify that a discount code applies correctly, you first need a product at a known price, maybe a customer account, maybe an existing cart. Clicking through the UI to build that state is wasteful and brittle.

This is where testmd version 2 earns its place. Add `version: 2` to the frontmatter and your steps execute one at a time against a single browser session, with two deterministic step types that never call a model: API steps and Verify steps. The API steps hit Swell's backend directly to seed data, and the Verify steps confirm it surfaced correctly in the UI.

```
---
version: 2
---

# Swell price shows correctly in cart

- GET https://api.example-proxy.com/products/merino-beanie
- Expect status 200, store $.price as 'expected_price'
- Open https://shop.example.com/products/merino-beanie
- Add the product to the cart
- Open the cart drawer
- Verify the cart subtotal contains "{{expected_price}}"
```

The `GET` step pulls the canonical price from your API layer, stores it, and the final `Verify` confirms the UI renders that exact number. No model touches the API or the assertion, so those steps are fully reproducible. The plain-English lines in the middle run as a grouped agent block on the same page. One honest limit worth stating plainly: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. If you are committed to fully local execution, keep your seeding logic in v1 UI steps for now, or run v2 flows where a hosted key is acceptable.

Using API steps to seed and UI steps to verify is the pattern that makes commerce suites fast. You skip the ten clicks it takes to build a cart and spend your agent time only on the thing you actually want to prove.

## Testing the full checkout, guest and logged in

A cart test is table stakes. The flow that keeps commerce teams up at night is checkout, because a broken checkout is lost revenue in real time. Swell checkouts usually branch on whether the shopper is a guest or an existing customer, so you want both paths covered.

The guest path is straightforward to describe:

```bash
browserbash run "Open https://shop.example.com, add the Merino Beanie \
to the cart, proceed to checkout as a guest, fill shipping with a test \
US address, choose standard shipping, and stop at the payment step. \
Confirm the order summary shows the beanie and a shipping cost." \
--headless --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, so CI or an AI coding agent can read the verdict without parsing prose. Exit codes are frozen and stable: 0 passed, 1 failed, 2 error or infra or budget stop, 3 timeout. That contract is what lets you wire this straight into a pipeline gate.

### Reusing a logged-in session instead of signing in every run

Testing the returning-customer path means logging in, and logging in on every single test is slow and noisy. BrowserBash solves this with saved logins. You sign in once, interactively, and it captures the Playwright storageState:

```bash
browserbash auth save swell-customer --url https://shop.example.com/account/login

browserbash testmd run ./tests/checkout_logged_in_test.md --auth swell-customer
```

The `auth save` command opens a browser, you log in by hand, press Enter, and the session is stored under the name `swell-customer`. From then on, any `run`, `testmd`, `run-all`, or `monitor` command with `--auth swell-customer` starts already authenticated. You can also set `auth:` in a test file's frontmatter. If the saved profile's origins do not cover your start URL, BrowserBash prints a warning rather than silently doing nothing, so you find out immediately instead of debugging a mysteriously logged-out run.

This one feature removes the biggest tax on commerce testing: the re-login-every-test overhead that bloats suite runtime and adds a whole extra failure surface.

## Running the whole suite in parallel with a budget

Once you have cart, guest checkout, logged-in checkout, discount codes, and a few edge cases, you have a suite. BrowserBash's `run-all` command is a memory-aware orchestrator: it derives concurrency from real CPU and RAM, runs previously-failed and slowest tests first, and flags flaky ones.

```bash
browserbash run-all ./tests --junit out/junit.xml --budget-usd 2.00
```

Two things there matter for a store team. The `--junit` output drops straight into any CI dashboard. The `--budget-usd 2.00` flag is a hard financial stop: once the suite's estimated spend crosses two dollars, BrowserBash stops launching new tests, reports the remaining ones as `skipped`, and exits 2. That estimate comes from a bundled per-model price table, and unknown models get no estimate rather than a wrong one. For teams running against hosted models, a budget guard means a runaway loop never becomes a surprise invoice.

For parallel CI machines, `run-all --shard 2/4` runs a deterministic slice computed on sorted discovery order, so four machines split the work without coordinating. You can also matrix across viewports with `--matrix-viewport 1280x720,390x844` to prove the same checkout works on desktop and mobile widths, which for a storefront is not optional.

The replay cache is the quiet hero here. The first green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. For a stable checkout, your suite goes from expensive to nearly free after the first pass. That economics is what makes running the full suite on every pull request realistic rather than aspirational.

## Continuous monitoring so a broken checkout pages you

Deploy-time tests catch regressions you introduce. They do nothing about the third-party payment provider that quietly changes an API, or the CDN edge that starts serving a stale bundle at 2 a.m. For that you want an always-on synthetic monitor.

```bash
browserbash monitor ./tests/checkout_guest_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ \
  --auth swell-customer
```

This runs the guest checkout every ten minutes and alerts only on state changes, both directions. You get a message when checkout breaks and another when it recovers, and you do not get spammed on every green run. Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload for your own routing. Because the replay cache makes a stable flow nearly token-free, an always-on monitor on a working checkout costs almost nothing to keep running.

For a revenue-critical Swell store, a ten-minute synthetic on the real purchase path is one of the highest-leverage things you can set up. It is the difference between finding out checkout is down from your monitor and finding out from angry customers.

## Where the plain-English approach fits, and where it does not

Credibility matters more than hype, so here is the balanced view.

Choose BrowserBash to test a Swell store when your front end changes often, when you want tests that read like acceptance criteria, when you are validating an AI agent's work, or when you want commerce flows that a product manager can read and trust. The intent-based model is genuinely resilient to DOM churn, and API-seeded v2 flows give you deterministic checks where they count.

Do not reach for it when you need microsecond-level performance benchmarking, pixel-perfect visual regression across a thousand screenshots, or unit-level assertions on internal component state. Those are jobs for a dedicated performance tool, a visual diff service, or your component test runner. An AI agent driving a real browser is the right tool for user-journey validation, not for every kind of test that exists.

Here is a quick side-by-side of the two mental models.

| Concern | Selector-based scripts | Plain-English objectives |
| --- | --- | --- |
| Reacts to DOM/class-name changes | Breaks, needs a rewrite | Adapts at run time |
| Time to write a new flow | Minutes to hours per selector | One sentence per step |
| Who can read the test | Engineers | Engineers, QA, and PMs |
| Deterministic price/total checks | Yes, if you code them | Yes, via `Verify` and API steps |
| Best for visual pixel diffs | Purpose-built tools win | Not the right fit |
| Cost on a stable, cached flow | Free (no model) | Near-free (replay cache) |

The honest summary: for the specific job of proving a Swell cart and checkout still work after a deploy, describing the shopper's intent beats maintaining selectors. For adjacent jobs like visual regression, use the tool built for that and let BrowserBash own the journey validation.

## Wiring it into CI and your AI coding workflow

Two integrations turn this from a local convenience into a real safety net. The first is the official GitHub Action. It installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result.md artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating pull request comment with the verdict table. Adding a Swell checkout gate to every PR is a few lines of YAML; the setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

The second is the MCP server. Running `browserbash mcp` serves the whole CLI over the Model Context Protocol on stdio, and a one-line install wires it into Claude Code, Cursor, Windsurf, Codex, or Zed:

```bash
claude mcp add browserbash -- browserbash mcp
```

Now your coding agent can call `run_objective`, `run_test_file`, or `run_suite` directly and read back the structured verdict: status, summary, final_state, assertions, cost, and duration. When you ask an agent to change your Swell checkout, it can validate its own work against a real browser before telling you it is done. A failed test is a successful validation here: the tool call succeeds and the agent reads the verdict, so it learns from the failure instead of hiding it. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash` if you prefer to install through your host's registry UI.

If you want to see complete worked examples of commerce flows, the [BrowserBash blog](https://browserbash.com/blog) and the broader [learn hub](https://browserbash.com/learn) collect patterns for cart, checkout, and auth-heavy stores. The [features overview](https://browserbash.com/features) lays out the full capability list if you are evaluating.

## A practical rollout for your Swell store

Start small and expand. Day one, write a single add-to-cart objective and run it against production with the local model to confirm the basic path works. Day two, promote it to a committed `*_test.md` file with `Verify` steps on the cart total and item name. Day three, add a guest checkout test and a logged-in checkout test using a saved auth profile. By the end of the first week you have a `run-all` suite with a budget guard and JUnit output wired into CI, plus a ten-minute monitor on the guest checkout that pages Slack if revenue stops flowing.

The whole thing stays cheap because of the replay cache and because most of it runs on a free local model. The parts that need a hosted key (v2 API-seeded flows on the builtin engine) are the parts where determinism is worth the small cost. You are never locked into a vendor, and nothing leaves your machine unless you explicitly opt into the free cloud dashboard with `browserbash connect`.

If you already have a Playwright suite for your store, you do not have to start from scratch. `browserbash import` converts existing specs to plain-English tests heuristically and deterministically, with no model involved: it translates goto, click, fill, press, check, selectOption, common expects, and turns `process.env.X` into `{{X}}` variables. Anything it cannot translate lands in an `IMPORT-REPORT.md` rather than being silently dropped, so you know exactly what to review by hand.

## FAQ

### Can I test a Swell headless store without writing selectors?

Yes. BrowserBash takes a plain-English objective and drives a real Chrome browser to complete it, reading the live accessibility tree at run time instead of relying on CSS selectors or page objects. That means a front-end redesign that renames every class does not break your test, because the agent finds the current elements each run. You describe what a shopper does, and the agent handles the how.

### How do I verify a cart total or price deterministically?

Use `Verify` steps and testmd version 2 API steps. A `Verify` line like checking the subtotal compiles to a real Playwright assertion with expected-versus-actual evidence, not a language model judgment. With version 2 frontmatter you can `GET` the canonical price from Swell's API, store it as a variable, and then verify the UI renders that exact value, giving you a hard, reproducible gate on money-critical numbers.

### Does BrowserBash cost money to run against my store?

It is free and open source under Apache-2.0, and it defaults to local Ollama models so most runs cost nothing and send no data off your machine. If you use a hosted model for harder multi-step checkouts, the replay cache makes stable flows nearly free after the first green run, and `run-all --budget-usd` gives you a hard spending cap. Note that testmd version 2 currently needs the builtin engine with an Anthropic key or gateway, so those specific flows are the exception to fully local execution.

### How do I keep a returning-customer checkout test logged in?

Run `browserbash auth save` once to log in interactively and capture the session, then pass `--auth <name>` to any run, testmd, run-all, or monitor command. The stored Playwright storageState is reused so the test starts already authenticated, removing the slow re-login-every-test overhead. If the saved profile does not cover your start URL, BrowserBash warns you instead of silently running logged out.

Testing a headless commerce store should not mean maintaining a second codebase of brittle selectors. Describe the shopper's journey, let an AI agent drive a real browser, and gate every deploy on a deterministic verdict. Install with `npm install -g browserbash-cli` and start with a single add-to-cart objective today. An account is optional, but if you want the free cloud dashboard and hosted extras, you can [sign up here](https://browserbash.com/sign-up).
