---
title: From CodeceptJS to Natural-Language Browser Tests
description: "A practical guide to migrate CodeceptJS to natural language tests: map I.click and I.see to plain-English objectives, no helpers or locators."
date: 2026-04-18
category: guide
---

If you have written CodeceptJS scenarios, you already know the appeal: the test reads almost like a sentence. `I.click('Login')`, `I.fillField('email', user)`, `I.see('Welcome back')`. The promise of this guide is to push that idea the rest of the way. When you migrate CodeceptJS to natural language tests, you stop describing actions through a helper API that wraps a locator engine and start describing the *outcome* you want in plain English, letting an AI agent figure out the clicks. The grammar that already feels like prose in CodeceptJS becomes actual prose, and an entire layer of your test stack — helpers, locators, page objects — disappears.

This is not a hit piece on CodeceptJS. It is a genuinely good framework, and for a lot of teams it is the right tool to stay on. What this article does is map its `I.*` vocabulary onto BrowserBash's plain-English objectives, show what survives the move and what gets deleted, and be honest about where you should think twice before migrating. By the end you will know exactly which scenarios are easy wins, which are awkward, and how to run a side-by-side migration without ripping out your whole suite on day one.

## What CodeceptJS actually gives you

CodeceptJS is an open-source, end-to-end testing framework that sits on top of a backend engine — Playwright, WebDriver, Puppeteer, or others — and exposes a unified actor API. You write scenarios against a single object, conventionally `I`, and the framework translates those calls into the underlying driver's commands.

The headline feature is readability. A CodeceptJS test looks like this:

```js
Scenario('user can check out', ({ I }) => {
  I.amOnPage('/store');
  I.click('Add to cart');
  I.click('Checkout');
  I.fillField('Card number', '4242 4242 4242 4242');
  I.click('Place order');
  I.see('Thank you for your order!');
});
```

That reads cleanly. But every line is still an instruction to a locator engine. `I.click('Add to cart')` works because CodeceptJS has a "smart locator" resolution order: it tries to match by visible text, then by a CSS or XPath fallback, then by semantic locators if you configured them. When the button text is unambiguous, it feels like magic. When you have two "Add to cart" buttons, or the label is an icon, or the text is set by an `aria-label`, you drop down into explicit locators: `I.click({css: '.product-42 .add'})` or `I.click(locate('button').withText('Add'))`.

CodeceptJS also leans on **helpers** and **page objects**. Helpers extend the actor with custom steps; page objects centralize locators so a markup change touches one file instead of forty. This is the standard, sensible architecture that keeps a Playwright or WebDriver suite maintainable. It is also exactly the layer that a natural-language approach removes — which is the whole point of the migration.

## What "natural language" changes

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. Instead of a scenario built from `I.*` calls, you write a plain-English objective and an AI agent drives a real Chrome or Chromium browser step by step. There are no selectors, no page objects, no helper API. The agent looks at the live page, decides what to click, performs the action, observes the result, and returns a verdict plus structured results.

The same checkout scenario becomes one objective:

```bash
browserbash run "Go to the store, add the first item to the cart, complete checkout with card 4242 4242 4242 4242, and verify the page shows 'Thank you for your order!'"
```

Notice what is gone. There is no `Add to cart` locator to maintain because the agent reads the rendered page and finds the button the way a person would. There is no page object because there is nothing to centralize — the "locator" is the English description, and it lives in the test itself. The assertion (`verify the page shows...`) is part of the same sentence, not a separate `I.see` line.

That is the trade at the heart of this migration: you give up deterministic, line-by-line control and gain resilience to markup churn plus a test that a non-engineer can read and edit. Whether that trade is worth it depends on the scenario, and we will get concrete about that.

### The model story matters here

One thing to settle before you commit: where does the "intelligence" run, and what does it cost? BrowserBash is Ollama-first. It defaults to free local models with no API keys, and nothing leaves your machine. The resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. You can run a whole suite with a guaranteed $0 model bill on local models, or point it at OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) or Anthropic Claude with your own key for harder flows.

Be honest with yourself about model size. Very small local models (roughly 8B and under) get flaky on long, multi-step objectives — they lose track halfway through a checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. If your CodeceptJS scenarios are long, migrating them onto an 8B model and then blaming the tool is a common and avoidable mistake.

## Mapping the I.* vocabulary to plain English

The mechanical part of any migration is translation. Here is how the common CodeceptJS verbs map onto natural-language phrasing. The key shift: in CodeceptJS you name an *element*, in BrowserBash you describe an *intent*.

| CodeceptJS step | What it does | Natural-language objective phrase |
| --- | --- | --- |
| `I.amOnPage('/login')` | Navigate to a URL | "Go to the login page" |
| `I.click('Sign in')` | Click an element | "Click the Sign in button" |
| `I.fillField('email', x)` | Type into a field | "Enter the email address ..." |
| `I.selectOption('Country', 'India')` | Pick from a dropdown | "Set Country to India" |
| `I.checkOption('Remember me')` | Tick a checkbox | "Enable Remember me" |
| `I.see('Welcome')` | Assert text present | "Verify the page shows Welcome" |
| `I.dontSee('Error')` | Assert text absent | "Confirm no error message appears" |
| `I.seeElement('.cart')` | Assert element present | "Check that the cart is visible" |
| `I.waitForText('Loaded')` | Wait for a condition | "Wait until the dashboard finishes loading" |
| `I.grabTextFrom('.total')` | Extract a value | "Read the order total and report it" |

The pattern is consistent. Imperative CodeceptJS steps become clauses in a single objective sentence (or a short ordered list, if the flow is long). Assertions that lived on their own `I.see` lines fold into "verify" or "confirm" clauses. And the locator argument — the part that breaks when a class name changes — simply evaporates, because the agent resolves intent against the live page rather than against a string you hardcoded.

### Long scenarios become ordered objectives

A single run-on sentence is fine for a three-step flow. For a ten-step regression scenario, write the objective as an ordered description so the agent has clear checkpoints:

```bash
browserbash run "1) Log in as admin@example.com. 2) Open the Users page. 3) Invite a new user with email new@example.com. 4) Verify the invite shows as Pending. 5) Log out and confirm you are back on the login screen."
```

This reads like the test case a manual QA would write, which is exactly the point. Each numbered step gives the agent a discrete goal and gives you a discrete thing to read in the verdict.

## Where the helper and locator layer goes

The most underrated benefit of this migration is what you get to delete. A mature CodeceptJS suite usually carries:

- A `pages/` directory of page objects, each a bag of locators.
- A `helpers/` directory of custom steps and engine extensions.
- A `codecept.conf.js` that wires up the backend engine, helpers, and plugins.
- A slow, recurring tax: every UI refactor that renames a class or restructures the DOM sends someone hunting through page objects to fix selectors.

In a natural-language test, the locator *is* the sentence, and the sentence lives next to the assertion. When marketing renames "Add to cart" to "Buy now," a CodeceptJS suite needs a page-object edit; a natural-language objective often keeps passing because the agent reads the new button text and understands the intent is the same. You only touch the test when the actual *behavior* changes, not when the *markup* does.

That said, deleting the locator layer also deletes its precision. A page object pins you to exactly one element. An English description trusts the agent to pick the right one. On a clean, well-labeled UI that is a non-issue. On a cramped admin panel with five buttons that all say "Edit," you may need to be more descriptive ("click Edit on the row for new@example.com") to keep the agent honest. The skill you build during migration is writing objectives that are specific enough to be unambiguous and loose enough to survive cosmetic change.

## Committable tests: Markdown vs Scenario files

CodeceptJS scenarios live in `.js` (or `.ts`) files in your repo, version-controlled and reviewable in a pull request. That is a genuine strength, and you should not give it up when you migrate. BrowserBash keeps it.

BrowserBash supports committable Markdown tests: `*_test.md` files where each list item is a step. They support `@import` composition for shared setup and `{{variables}}` templating, and any variable you mark as secret is masked as `*****` in every log line. After each run it writes a human-readable `Result.md`. Here is a login flow as a Markdown test:

```bash
# login_test.md
# Smoke: user login

- Go to {{baseUrl}}/login
- Enter the email {{email}}
- Enter the password {{password}}
- Click Sign in
- Verify the page shows "Welcome back"
```

Run it with:

```bash
browserbash testmd run ./login_test.md
```

This is the closest structural analog to a CodeceptJS scenario file. Steps are ordered, the file is committable and diff-friendly, secrets stay masked, and a non-engineer can read or edit it without learning a DSL. If your migration priority is keeping tests in version control and reviewable in PRs, Markdown tests are where you land — they map almost one-to-one onto CodeceptJS scenarios, minus the locators. The [feature overview](https://browserbash.com/features) goes deeper on `@import` and templating if you are composing larger suites.

## Migrating without a big-bang rewrite

You do not have to convert four hundred scenarios in a weekend. The sane path is incremental, and BrowserBash is built to slot alongside an existing suite rather than replace it overnight.

### Step 1 — Pick the smoke tests first

Start with your highest-value, lowest-complexity scenarios: login, signup, "can a user check out," the handful of flows that, if broken, mean the site is down. These are the easiest to phrase in English and the ones where flakiness from brittle locators hurt most in CodeceptJS. Convert five of them and run them daily next to your existing suite.

### Step 2 — Run both suites in parallel

Keep CodeceptJS running. Add the BrowserBash objectives as a separate CI job. For a week or two, you watch both. Where the natural-language test agrees with CodeceptJS, you build trust. Where it disagrees, you learn something — usually that one of the two found a real ambiguity. This parallel period is how you de-risk the move without betting the release process on a new tool. The [learn hub](https://browserbash.com/learn) has starter objectives if you want patterns to copy.

### Step 3 — Wire it into CI with agent mode

CodeceptJS emits standard exit codes and reporters; your pipeline already keys off pass/fail. BrowserBash matches that contract. Agent mode emits NDJSON (one JSON event per line) on stdout, with clear exit codes: `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, which is exactly what a CI gate or an AI coding agent needs.

```bash
browserbash run "Log in and verify the dashboard loads" --agent --headless
```

Your pipeline reads the exit code the same way it read CodeceptJS's, and the NDJSON stream gives you structured events to log or forward. This is the part of the migration that tends to be frictionless — the CI contract barely changes.

### Step 4 — Add evidence with recording

CodeceptJS captures screenshots on failure and, with plugins, video. BrowserBash records too. The `--record` flag captures a screenshot and a full `.webm` session video on any engine; on the builtin engine it additionally captures a Playwright trace you can open in the trace viewer.

```bash
browserbash run "Complete checkout and verify the confirmation message" --record
```

When a test fails at 2 a.m., a `.webm` of exactly what the agent saw and did is worth more than a stack trace. If you want shared run history, video replay, and per-run inspection across the team, there is an optional free cloud dashboard — strictly opt-in via `browserbash connect` plus `--upload`, with free uploaded runs kept for 15 days. Prefer to keep everything local? `browserbash dashboard` runs a fully local dashboard. No account is required to run the CLI at all.

## A realistic before-and-after

Here is a CodeceptJS scenario with a page object, the kind that takes real maintenance:

```js
// pages/checkout.js
module.exports = {
  addToCart: locate('.product-card').first().find('.btn-add'),
  checkoutBtn: '#checkout',
  cardField: 'input[name="cc-number"]',
  placeOrder: locate('button').withText('Place order'),
  confirmation: '.order-success h1',
};

// checkout_test.js
Scenario('checkout works', ({ I, checkout }) => {
  I.amOnPage('/store');
  I.click(checkout.addToCart);
  I.click(checkout.checkoutBtn);
  I.fillField(checkout.cardField, '4242 4242 4242 4242');
  I.click(checkout.placeOrder);
  I.see('Thank you for your order!', checkout.confirmation);
});
```

Two files, five locators, and every one of them is a future maintenance ticket. The natural-language version is the objective from earlier, or as a committable Markdown test:

```bash
# checkout_test.md
- Go to {{baseUrl}}/store
- Add the first product to the cart
- Proceed to checkout
- Enter card number 4242 4242 4242 4242
- Place the order
- Verify the page shows "Thank you for your order!"
```

The behavior under test is identical. The difference is that the second version has zero locators to maintain, reads like the manual test case it came from, and a product manager can review it in a pull request. When the dev team renames `.btn-add` to `.add-to-bag`, the first test breaks and the second does not.

## Where you should NOT migrate (yet)

Credibility matters more than a clean migration story, so here is the honest counter-list. Stay on CodeceptJS, or keep those specific scenarios there, when:

- **You need byte-exact, deterministic steps.** A test that must click element #3 in a list, never #2, with audited certainty, is better expressed as a locator than an English description. Determinism is a feature when you are testing a payment edge case.
- **The flow is long and your only option is a tiny local model.** A 30-step scenario on an 8B model will wander. If you cannot run a 70B-class local model or a capable hosted one, that scenario will be flakier in BrowserBash than in CodeceptJS. Match model size to flow length.
- **You depend on CodeceptJS-only ecosystem features.** Custom helpers, specific reporters, REST/GraphQL steps mixed into the same actor, BDD Gherkin with a shared step library — if your suite leans on these, the migration cost may outweigh the locator savings.
- **Your team is happy and the suite is stable.** "It's readable and it isn't flaky" is a perfectly good reason not to migrate. Do not fix what isn't broken.

The most defensible strategy is rarely all-or-nothing. Run the natural-language objectives for smoke and high-churn flows where locator maintenance is the pain, and keep CodeceptJS for the deterministic, edge-case, ecosystem-heavy tests where it shines. The [comparison write-up](https://browserbash.com/blog) on this site goes through more of these trade-offs if you want the long version.

## A quick decision guide

Use this to triage your existing scenarios:

| Scenario type | Migrate to natural language? | Why |
| --- | --- | --- |
| Login / signup smoke | Yes | Short, high-value, locator churn hurts most here |
| High-churn marketing/UI flows | Yes | Agent reads intent, survives markup renames |
| Long happy-path E2E (checkout, onboarding) | Yes, with a capable model | Readable, but match model size to length |
| Payment / security edge cases | Keep in CodeceptJS | Determinism beats flexibility |
| Tests gluing API + UI in one actor | Keep in CodeceptJS | Natural-language is UI-focused |
| Stable, non-flaky regression suite | Optional | No pain to solve |

If you are budgeting the move, the [pricing page](https://browserbash.com/pricing) lays out what is free (the CLI and local dashboard are; the cloud dashboard is opt-in), which matters because a parallel-run migration period means you are effectively running two suites for a while.

## Getting your first migrated test running

The fastest way to feel the difference is to convert one scenario and run it locally. Install the CLI and point it at a flow you already test:

```bash
npm install -g browserbash-cli
browserbash run "Go to the demo store, add the first item to the cart, and verify the cart count shows 1"
```

That runs against your local Chrome by default with a free local model — no API key, no account, nothing leaving your machine. When you are ready for CI, add `--agent --headless` and read the exit code. When you want evidence, add `--record`. When the flow is hard, point it at a bigger model. The migration is less a rewrite and more a re-expression: the test case you already had in your head, written down in the words you would have used to explain it to a colleague.

If you later want to scale where the browser runs — say, across a grid — BrowserBash switches providers with one flag (`--provider`), supporting local Chrome by default plus CDP endpoints, Browserbase, LambdaTest, and BrowserStack. Your objective text does not change; only where it executes does.

## FAQ

### Can I migrate CodeceptJS to natural language tests gradually?

Yes, and gradual is the recommended path. Keep your CodeceptJS suite running, convert your highest-value smoke tests to BrowserBash objectives first, and run both in parallel CI jobs for a week or two. Where they agree you build trust, and where they disagree you usually find a real ambiguity. There is no requirement to rewrite everything at once.

### Do natural-language browser tests need a paid AI API?

No. BrowserBash is Ollama-first and defaults to free local models with no API key, so you can run a whole suite with a $0 model bill. It also supports genuinely free hosted models on OpenRouter and bring-your-own-key Anthropic Claude for harder flows. Just match the model size to your scenario length — very small local models get flaky on long multi-step objectives.

### What happens to my page objects and helpers after migrating?

They go away for the migrated tests. A natural-language objective resolves intent against the live page, so there is no locator to centralize and no page-object file to maintain. The trade-off is that you give up the byte-exact precision a page object gives you, so for deterministic edge cases you may keep some scenarios in CodeceptJS.

### Are natural-language tests reliable enough for CI?

For the right scenarios, yes. BrowserBash agent mode emits NDJSON and clear exit codes (0 passed, 1 failed, 2 error, 3 timeout), so a pipeline gates on it exactly like it gated on CodeceptJS. Reliability depends on writing unambiguous objectives and using a capable model; short smoke flows on a mid-size or hosted model are dependable, while very long flows on tiny local models are not.

Ready to convert your first scenario? Install with `npm install -g browserbash-cli`, rewrite one CodeceptJS test as a plain-English objective, and run it against your local Chrome. No account needed to start — and if you want shared run history and video replay later, you can [sign up](https://browserbash.com/sign-up) for the optional free dashboard.
