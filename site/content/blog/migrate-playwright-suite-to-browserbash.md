---
title: Move a Playwright Suite to BrowserBash: Migration Tutorial
description: "How to migrate Playwright tests to BrowserBash: convert page objects and specs into Markdown test files with @import and variables, honestly."
date: 2026-02-26
category: guide
---

If you want to migrate Playwright tests to BrowserBash, the first thing to understand is that you are not doing a line-for-line port. There is no `page.click('#submit')` to rewrite into a slightly different `page.click('#submit')`. You are throwing away the selector layer entirely and replacing it with plain-English objectives that an AI agent reads and acts on inside a real Chrome browser. That sounds like a bigger leap than it is, and this tutorial walks you through it spec file by spec file — including the parts where Playwright code is still the better tool and you should keep it.

I have maintained large Playwright suites long enough to know which tests rot first. The brittle ones are the long, click-heavy user journeys that break every time a designer renames a class. Those are the tests worth moving. The fast, deterministic unit-ish checks on a single component? Leave them in Playwright. A good migration is selective, not total, and the goal of this guide is to help you draw that line honestly.

## What changes when you migrate Playwright tests to BrowserBash

Playwright is a code-first framework. You write TypeScript or Python, you build page objects, you select elements with locators, and you assert on the DOM. The control is total and the failure modes are precise. BrowserBash sits at a different altitude. You write an objective — "log in, add the blue running shoes to the cart, check out, and confirm the order succeeded" — and an AI agent drives a real Chrome or Chromium browser step by step, deciding which buttons to press based on what it sees on the page. No selectors. No page objects. It returns a verdict (passed or failed) plus structured results you can feed into CI.

The mental shift is the whole migration. In Playwright you tell the browser *how* to do something. In BrowserBash you tell it *what* you want and let the agent figure out the how. That is the source of both the maintenance savings and the new class of risks you take on.

BrowserBash is a free, open-source (Apache-2.0) CLI from The Testing Academy. You install it with `npm install -g browserbash-cli` and run it with the `browserbash` command. The current version as of this writing is 1.3.1. There is no account required to run anything, and by default it uses free local models through Ollama, so nothing has to leave your machine.

### The three artifacts you are replacing

A typical Playwright suite has three layers worth naming, because each maps differently to BrowserBash:

- **Page objects** (`LoginPage.ts`, `CartPage.ts`) — classes that wrap selectors and expose methods like `login(user, pass)`. In BrowserBash, these mostly evaporate. The "how to log in" knowledge moves from a method body into a sentence.
- **Spec files** (`checkout.spec.ts`) — the actual tests with their `test()` blocks and `expect()` assertions. These become committable Markdown `*_test.md` files, one list item per step.
- **Fixtures and config** (`playwright.config.ts`, auth setup, base URL) — environment plumbing. Some of this maps to BrowserBash variables and flags; some of it has no equivalent and you simply stop needing it.

Keep that mapping in your head as we go. Most of the confusion in a migration comes from trying to translate something in the first column that should just be deleted.

## Anatomy of a Playwright test before migration

Let's make this concrete with a checkout flow, the kind of end-to-end test that costs teams the most maintenance. Here is roughly what it looks like in Playwright with a page object.

```bash
# LoginPage.ts (page object)
# class LoginPage {
#   usernameInput = this.page.locator('#user-name')
#   passwordInput = this.page.locator('#password')
#   loginButton   = this.page.locator('[data-test="login-button"]')
#   async login(u, p) { ... fill, fill, click ... }
# }
#
# checkout.spec.ts
# test('user can check out', async ({ page }) => {
#   await page.goto('https://shop.example.com')
#   await new LoginPage(page).login(process.env.USER, process.env.PASS)
#   await page.locator('.inventory_item:has-text("Backpack") button').click()
#   await page.locator('.shopping_cart_link').click()
#   await page.locator('[data-test="checkout"]').click()
#   // ...fill first name, last name, zip...
#   await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!')
# })
```

Count the selectors. There are at least seven, and every one of them is a hostage to the frontend team. Rename `data-test="checkout"` to `data-test="checkout-btn"` and this test goes red even though the application works perfectly. That is the failure mode you are trying to escape. The `expect()` at the bottom — the actual business assertion, that the order succeeded — is the only line a product owner cares about. Everything above it is scaffolding.

## Converting a spec file into a Markdown test

Now the same flow as a BrowserBash Markdown test. Create a file called `checkout_test.md`. Each list item is one step the agent performs in order.

```bash
# checkout_test.md
#
# # Checkout flow
#
# Variables:
# - base_url: https://shop.example.com
# - username: standard_user
# - password (secret): {{SHOP_PASSWORD}}
#
# Steps:
# - Go to {{base_url}}
# - Log in with username {{username}} and password {{password}}
# - Add the backpack to the cart
# - Open the cart and proceed to checkout
# - Fill in any required shipping details with realistic test data
# - Complete the purchase
# - Verify the page shows "Thank you for your order!"
```

Run it:

```bash
browserbash testmd run ./checkout_test.md
```

Seven selectors became seven sentences, and several of those sentences are vaguer than the Playwright code on purpose. "Add the backpack to the cart" does not name a class or a button. The agent looks at the rendered page, finds the backpack product, and clicks its add-to-cart control. If the frontend team renames that button next sprint, this test does not care. That is the maintenance win, and it is real.

After every run, BrowserBash writes a human-readable `Result.md` next to your test so you can see, in prose, what the agent did and why it reached its verdict. Commit the `*_test.md` file to your repo like any other test. It diffs cleanly in code review because it reads like English, which means a product manager can actually review it — something that was never true of your page objects.

### Where {{variables}} replace fixtures

Playwright fixtures inject things like base URLs and credentials. BrowserBash uses `{{variables}}` templating for the same job. You define a variable once and reference it across steps, which keeps environment-specific values out of the test body. Mark a variable as a secret and BrowserBash masks it as `*****` in every log line, so credentials never leak into your CI output or the `Result.md` artifact. That solves the same problem Playwright's `process.env` plus a `.gitignore` solved, with less ceremony and built-in masking.

```bash
browserbash testmd run ./checkout_test.md \
  --var base_url=https://staging.shop.example.com \
  --var SHOP_PASSWORD=$STAGING_PASS
```

Pass the same file different variables to run it against staging, production, or a PR preview deploy. That is your environment matrix, and it lives in flags instead of a `playwright.config.ts` projects array.

### Where @import replaces page object reuse

The genuinely useful thing a page object gives you is reuse: a `login()` method called by twenty specs so you write the login logic once. BrowserBash's answer is `@import`. Put your shared login steps in a file and import them into any test that needs them.

```bash
# login_test.md  (the reusable piece)
# - Go to {{base_url}}
# - Log in with username {{username}} and password {{password}}
#
# checkout_test.md
# @import login_test.md
# - Add the backpack to the cart
# - ...
```

This is the closest structural parallel to a page object in the whole migration. `@import` is your composition primitive. A shared `login_test.md`, a shared `accept_cookies_test.md`, a shared `seed_account_test.md` — these become the building blocks the way `LoginPage`, `CartPage`, and `CheckoutPage` were. The difference is they are written in English and chained by import rather than instantiated as classes.

## A practical migration order

Do not try to convert the whole suite in a weekend. Migrate in waves, easiest wins first.

1. **Smoke tests and happy-path journeys.** These are high-value, high-maintenance, and forgiving of vagueness. A "can a user sign up and reach the dashboard" test is the perfect first migration. You will feel the selector-maintenance pain disappear immediately.
2. **Cross-page flows with lots of clicks.** Checkout, onboarding wizards, multi-step forms. The more selectors a test has, the more you save by deleting them.
3. **Content and copy verification.** "Does the pricing page show the three plans with correct prices" is a natural-language assertion that an agent handles well and a brittle DOM query handles badly.
4. **Leave the rest.** Tightly-coupled component tests, anything asserting exact pixel positions, API-level checks, and tests that must run in milliseconds — keep those in Playwright. We will get to why.

A useful rule of thumb: if a Playwright test is more than half scaffolding (selectors, waits, page-object plumbing) and less than half assertion, it is a migration candidate. If it is a precise check on one component's behavior, it is not.

## Running migrated tests in CI

Your old Playwright suite reported pass/fail to CI through exit codes and a reporter. BrowserBash does the same, built for machines from the start. Agent mode emits NDJSON — one JSON event per line on stdout — so your pipeline parses structured events instead of scraping prose.

```bash
browserbash run "log in and confirm the dashboard loads" \
  --agent --headless
```

The exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. That maps directly onto how your CI already interprets Playwright's exit status, so the integration is mechanical. Add `--record` to capture a screenshot and a full `.webm` session video on any engine via ffmpeg; on the builtin engine you also get a Playwright trace you can open in the trace viewer — a nice bridge for a team already fluent in Playwright tooling.

If you want run history, video recordings, and per-run replay in a dashboard, that is strictly opt-in. Connect once and add the upload flag:

```bash
browserbash connect
browserbash testmd run ./checkout_test.md --upload
```

The cloud dashboard is free, uploaded runs are kept for 15 days, and you never have to use it — there is also a fully local `browserbash dashboard` if you would rather keep everything on your machine. None of this is required to run tests. You can read more about the available capabilities on the [BrowserBash features page](https://browserbash.com/features).

## Choosing a model for migrated tests

This is the part most migration guides would skip, and it is the part that determines whether your converted suite is reliable. BrowserBash is Ollama-first. It defaults to free local models with no API keys, and it auto-resolves in order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. On local models you can guarantee a $0 model bill, which is a real difference from cloud-only AI testing tools.

Here is the honest caveat, and you need to hear it before you migrate fifty tests and wonder why they flake. Very small local models — roughly 8B parameters and under — can be unreliable on long, multi-step objectives. They lose the thread halfway through a seven-step checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. BrowserBash supports OpenRouter, including genuinely free hosted models such as `openai/gpt-oss-120b:free`, and Anthropic Claude if you bring your own key.

The practical migration advice: start your converted journey tests on a mid-size local model. If a particular flow is long and finicky, point that one test at a stronger hosted model. You do not need to pick one model for the whole suite. Match the model to the difficulty of the objective, the same way you would not run your heaviest E2E test on a tiny CI runner.

### A quick model-fit table

| Objective type | Steps | Recommended model tier |
|---|---|---|
| Smoke check (load a page, see a heading) | 1–3 | Small local model is usually fine |
| Login + single action | 3–5 | Mid-size local (Qwen3 / Llama 3.3 70B-class) |
| Full checkout / onboarding | 6–12 | Mid-size local, or hosted model if flaky |
| Ambiguous content verification | varies | Capable hosted model for best judgment |

Treat this as a starting point, not a law. Your application's complexity and how clearly you phrase objectives both move these lines.

## Where Playwright still wins (be honest)

A migration guide that only sells you the destination is lying to you. Here is where you should keep Playwright, full stop.

**Determinism and speed.** A Playwright test that clicks a known selector runs the same way every time in milliseconds. An AI agent reasons about the page, which costs time and introduces variance. For a test that runs ten thousand times a day on every commit, that determinism is worth more than the maintenance savings. Keep your fast, stable checks in code.

**Precise, low-level assertions.** Need to assert that an element has exactly `aria-expanded="false"`, or that a network request fired with a specific payload, or that a CSS transition completed? That is Playwright's home turf. Natural-language objectives are great for "did the order go through" and weak for "is this attribute exactly this value." Do not force a DOM-precise assertion into prose.

**API and network-level testing.** Playwright can intercept requests, mock responses, and test at the protocol layer. BrowserBash drives a browser like a user; it is not the tool for asserting on raw API contracts.

**Component and visual-regression suites.** Pixel-diffing and isolated component testing want the control of code. Keep them.

The honest framing: BrowserBash and Playwright are not rivals fighting over the same tests. They split the suite. Playwright owns the deterministic, low-level, high-frequency layer. BrowserBash owns the brittle, click-heavy, English-describable user journeys where AI objectives genuinely reduce maintenance. The best 2026 suites I have seen run both. If you want the longer argument for the agent-driven side, the [BrowserBash learn hub](https://browserbash.com/learn) lays it out with examples.

## A side-by-side comparison

| Dimension | Playwright | BrowserBash |
|---|---|---|
| How you write a test | TypeScript/Python + selectors | Plain-English objective in `*_test.md` |
| Element targeting | Locators (CSS, role, text) | Agent sees the page, no selectors |
| Reuse primitive | Page objects / fixtures | `@import` + `{{variables}}` |
| Breaks on selector rename | Yes | No (agent re-finds the element) |
| Speed per run | Milliseconds | Slower (agent reasoning) |
| Determinism | High | Lower; model-dependent |
| Low-level DOM assertions | Excellent | Limited |
| Cost | Free (open source) | Free; $0 on local models |
| Best for | Fast, precise, high-frequency checks | Brittle user journeys, content checks |

Read this table as a division of labor, not a scoreboard. Each column has rows where it clearly wins.

## A realistic migration session

Here is how a converted flow comes together end to end, the kind of run BrowserBash is built for. Suppose your old `checkout.spec.ts` logs into a store, adds an item, completes checkout, and asserts the success message. You write the Markdown file shown earlier, store the password as a secret variable, and run it locally headless first.

```bash
browserbash run "log in to the store, add the backpack to the cart, \
complete checkout, and verify it says 'Thank you for your order!'" \
  --record
```

You watch the `Result.md` and the recorded `.webm` to confirm the agent did what you meant. If the agent misread a step — say it added the wrong product because your phrasing was ambiguous — you tighten the sentence, not the selector. "Add the backpack" might become "add the gray backpack priced at $29.99." That iteration loop, refining English instead of debugging XPath, is the day-to-day feel of a migrated suite, and most SDETs find it faster once they trust it.

When the flow is stable, you commit `checkout_test.md`, wire it into CI with `--agent --headless`, and optionally `--upload` it so a teammate can replay the run from the dashboard. The brittle selector layer that used to break weekly is simply gone from that test.

## Running migrated tests on cloud browsers

Your Playwright suite may run on a grid or a cloud browser provider. BrowserBash keeps that option with a single `--provider` flag. By default it runs `local` — your own Chrome. You can switch to `cdp` for any DevTools endpoint, or to `browserbase`, `lambdatest`, or `browserstack` to run the same objective on a hosted browser.

```bash
browserbash testmd run ./checkout_test.md --provider lambdatest
```

The objective and the Markdown file do not change. Only where the browser runs changes. That mirrors how you would point Playwright at a remote grid, so the operational model is familiar even though the test format is new. For teams comparing approaches before committing, the [case study page](https://browserbash.com/case-study) and the [pricing details](https://browserbash.com/pricing) are worth a look — though, again, you can run the whole thing free and local without any of that.

## A migration checklist

Before you call a test "migrated," run it through this:

- The objective reads like a sentence a new teammate would understand.
- Credentials are secret-marked variables, not inline text.
- Shared steps (login, cookie banners) are pulled into an `@import` file.
- The flow passes three times in a row on your chosen model — flakiness usually means the model is too small or the phrasing is too vague.
- CI uses `--agent` and checks the exit code, not the prose.
- You consciously decided this test belongs in BrowserBash and not Playwright.

That last point is the one people skip. A migration is a series of deliberate yes/no decisions, not a bulk find-and-replace. The suite you end up with should be a clean split: Playwright for the deterministic core, BrowserBash for the journeys.

## FAQ

### How do I migrate Playwright tests to BrowserBash without rewriting everything?

You do not migrate everything, and that is the point. Pick the brittle, click-heavy user journeys — checkout, onboarding, signup — and convert just those into Markdown `*_test.md` files with plain-English steps. Leave your fast, deterministic component and API tests in Playwright. A good migration is selective, moving only the tests where selector maintenance was actually hurting you.

### Do BrowserBash Markdown tests replace Playwright page objects?

They replace what page objects were used for, but not as classes. Reusable logic like login becomes a shared `*_test.md` file that you pull into other tests with `@import`, and environment values move into `{{variables}}`. So the reuse and parameterization page objects gave you still exist; they are just expressed in English and composed by import rather than instantiated in code.

### Will migrated tests be flaky compared to Playwright?

They can be if you use too small a model or write vague objectives. Very small local models under about 8B parameters lose the thread on long multi-step flows, so use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest journeys. With the right model and clear phrasing, converted journey tests are stable, though they will never match the millisecond determinism of a Playwright selector click.

### Can I run migrated BrowserBash tests in my existing CI pipeline?

Yes. Run them with `--agent` to emit NDJSON events and `--headless` for the CI environment, then read the exit code: 0 passed, 1 failed, 2 error, 3 timeout. That maps directly onto how your pipeline already interprets Playwright's exit status, so wiring it in is mechanical. You can also add `--record` to capture a video and, on the builtin engine, a Playwright trace for debugging failures.

Ready to convert your first brittle journey? Install with `npm install -g browserbash-cli`, point it at one ugly checkout spec, and feel the selector layer disappear. When you want run history and replay, [sign up for the free dashboard](https://browserbash.com/sign-up) — though an account is entirely optional and your tests run fully local without one.
