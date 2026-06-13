---
title: Automating E-commerce Checkout Tests With AI
description: "E-commerce checkout test automation with AI: write the whole flow in plain English, let an agent drive a real browser, and skip selectors."
date: 2026-06-13
category: use-case
---

Checkout is the one flow your store cannot afford to get wrong, and it is also the flow that breaks your tests most often. Every promotion banner, every A/B test on the cart, every redesign of the payment step ships a fresh batch of renamed buttons and reshuffled DOM — and a selector-based suite turns red for reasons that have nothing to do with whether customers can actually buy. This article is a practical guide to **e-commerce checkout test automation with AI**: you describe the full purchase journey in plain English, and an AI agent drives a real Chrome browser to carry it out and return a pass/fail verdict with structured results. The tool is [BrowserBash](https://browserbash.com), a free, open-source (Apache-2.0) command-line tool, and every command below is real and runnable.

The premise is simple but the consequences are large. Instead of writing code that translates "add the backpack to the cart and check out" into a wall of `findElement` calls and explicit waits, you write that sentence and let the agent locate the elements the way a shopper would — by reading the page. No selectors, no page objects, no waits to tune. When marketing reorganizes the cart next sprint, the test does not care.

## Why checkout flows punish selector-based tests

It is worth being honest about *why* checkout is the worst-case scenario for traditional automation, because that is exactly where AI-driven testing earns its keep.

A checkout journey is long and stateful. A realistic flow is search or browse, open a product, choose a size or variant, add to cart, open the cart, proceed to checkout, fill shipping, fill payment, apply a coupon, review, and confirm — easily a dozen distinct screens, each with its own form fields and validation. Every one of those screens is a place where a selector can drift.

Checkout is also the most-edited part of most stores. Conversion teams are perpetually testing new layouts, new express-pay buttons, new trust badges, new one-page-versus-multi-step arrangements. The markup underneath churns constantly even when the *experience* is stable, and selector scripts are bolted to the markup, not the experience.

And checkout is full of dynamic, conditional UI: a free-shipping threshold that changes the order summary, a coupon field that only appears after you click "Have a code?", a payment iframe that loads asynchronously, an address autocomplete that injects a dropdown. Each conditional path is another branch your selector logic has to anticipate and another wait you have to get exactly right.

The result is a suite that is expensive to maintain precisely where coverage matters most. AI-driven checkout testing inverts that: because the agent re-reads the live page on every run and reasons about intent, the renamed "Place order" button or the relocated coupon link usually costs nothing.

## What "AI checkout testing" actually means here

"AI testing" gets used loosely, so let's be precise about what BrowserBash does. A checkout test here is a sequence of plain-English instructions an agent reads, plans against the actual rendered page, and executes one step at a time in a real browser. There are two shapes you will use:

- A **one-off objective** passed to `browserbash run "..."` — ideal for a quick check or a single CI verification step.
- A **committable markdown test** (a `*_test.md` file) where each list item is one step — the format for tests you keep, version, and review in pull requests.

Under the hood, BrowserBash ships two engines. The default is **stagehand**, the MIT-licensed AI browser-automation engine from Browserbase, built around resilient, self-healing actions. The second is **builtin**, an in-repo Anthropic tool-use loop driving Playwright that additionally captures a Playwright trace when you record. You rarely pick engines by hand; for local runs the default is what you want. Either way the defining property is the same: the agent observes the page fresh on every step, so your test describes the journey, not the DOM.

That single shift — intent over structure — is why an AI checkout test survives the UI churn that shatters a selector script, and why it reads like documentation a product manager can review.

## Install and run your first checkout test in five minutes

Install the CLI globally from npm:

```bash
npm install -g browserbash-cli
```

You need a model to drive the agent. BrowserBash is **Ollama-first**: it auto-detects a local [Ollama](https://ollama.com) install and uses it for free, with no API keys and nothing leaving your machine. If you have Ollama, pull a capable model:

```bash
ollama pull qwen3
```

A note from experience: small models in the 8B-and-under range tend to wander on long, multi-step flows, and checkout is long. A Qwen3 or Llama 3.3 70B-class model is the sweet spot for reliable checkout runs. If you would rather not run a local model, BrowserBash also auto-detects an Anthropic key, then falls back to OpenRouter — which includes genuinely free hosted models such as `openai/gpt-oss-120b:free`. The resolution order is Ollama, then Anthropic, then OpenRouter, so you can be running in minutes on whatever you already have.

Now run a complete checkout as a single sentence. This one is fully runnable as printed, because it targets the well-known Sauce Labs demo store whose credentials are published on its own login page:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the 'Sauce Labs Backpack' to the cart, open the cart, proceed to checkout, fill first name 'Bo', last name 'Basher', postal code '94016', continue, finish the order, and verify the page says 'Thank you for your order!'"
```

That is an end-to-end checkout test: it authenticates, adds an item, fills the shipping form, completes the purchase, and asserts the confirmation. A Chrome window opens, and the agent finds each field and button on its own — the username and password inputs, the right "Add to cart" button among several, the checkout link, the form fields, and the finish button. The `verify` clause is the assertion: if the confirmation text is missing, the run fails. You wrote no selectors, no waits, and no page objects.

When you are ready to run it without a visible window — in CI, or just in the background — add `--headless`:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the 'Sauce Labs Backpack' to the cart, open the cart, proceed to checkout, fill the shipping form, finish the order, and verify the page says 'Thank you for your order!'" --headless
```

## Anatomy of a reliable checkout step

The agent is capable, but it is not a mind reader, and checkout's length amplifies any sloppiness in your wording. A few rules earn their keep on every purchase flow you automate.

**Make each assertion explicit and specific.** "Check it worked" gives the agent nothing to verify against; "Verify the order summary shows a total of $32.39" gives it an unambiguous pass/fail condition. End meaningful steps with a `verify` clause wherever an outcome should be visible — after add-to-cart, after applying a coupon, after the totals recalculate, and at the final confirmation. Vague steps produce vague verdicts.

**Describe what a shopper sees, not what the DOM contains.** Say "Click the 'Proceed to checkout' button," not "Click the element with class `btn-checkout-primary`." Staying above the markup is the entire point — referencing implementation detail throws away the resilience you came for.

**Verify the math, not just the path.** Checkout bugs are frequently arithmetic: a coupon that does not apply, tax computed on the wrong subtotal, a shipping fee that double-counts. Add explicit verification of the numbers a customer would scrutinize — item subtotal, discount, tax, shipping, and grand total — so a wrong total fails the test even when every button clicked successfully.

**Capture the order number with "store ... as".** When the flow produces a confirmation or order ID you will want later, phrase it as `store the order confirmation number as 'order_number'`. BrowserBash surfaces stored values in its structured output, which is how downstream steps and CI consumers read them back.

**Keep one objective focused.** An agent reasoning about a 30-step marathon is likelier to drift than one handling a tight, well-scoped journey. If your full purchase path is very long, split it — for example, an "add to cart" test and a separate "complete payment" test — or compose a markdown test from shared pieces, covered next. As a rule of thumb, anything past roughly fifteen steps is a candidate for splitting.

Apply those and your AI checkout tests stop being a novelty and become something you trust to gate a merge.

## Make it committable: markdown checkout tests

A one-line objective is great for a quick check, but the tests you keep belong in version control where they can be reviewed, diffed, and reused. BrowserBash's format for that is the markdown test: a file ending in `_test.md` where each list item is one step and `{{variables}}` work exactly as they do on the command line.

```markdown
# Guest checkout — single item

- Open {{base_url}}
- Search for "wireless mouse" and open the first result
- Add the product to the cart
- Open the cart and verify the cart shows 1 item
- Proceed to checkout as a guest
- Fill email {{email}}, first name 'Bo', last name 'Basher'
- Fill shipping address '1 Market St', city 'San Francisco', postal code '94016'
- Continue to payment and verify the order summary shows a shipping cost
- Verify the grand total equals the item price plus shipping
- Place the order
- Verify the page says 'Thank you for your order!'
- Store the order confirmation number as 'order_number'
```

Run it:

```bash
browserbash testmd run checkout_test.md --headless
```

After the run, BrowserBash writes a `Result.md` next to the file — the verdict, what happened at each step, and any values the test stored (like `order_number` above). That report is readable by anyone: manual testers attach it to bug reports, and reviewers see test *changes* as plain-English diffs in pull requests. A checkout-test review stops being "trust me, the locators are right" and becomes a conversation about what the purchase flow should actually do.

The real payoff of the markdown format shows up once you have more than one checkout variant — guest, logged-in, with a coupon, with multiple items — because every one of them starts the same way. Rather than copy-paste the login or the add-to-cart steps into a dozen files, put them in a helper and splice them in with `@import`:

```markdown
# Returning customer — checkout with coupon

@import ./helpers/login.md
@import ./helpers/add-backpack.md

- Open the cart and proceed to checkout
- Click "Have a promo code?" and enter {{coupon}}
- Verify the order summary shows a discount line
- Verify the grand total reflects the discount
- Place the order
- Verify the page says 'Thank you for your order!'
```

Imported steps are inserted in place, so every checkout variant logs in and seeds the cart identically, and a change to either is a one-file fix instead of a twelve-file hunt. The `{{placeholders}}` resolve from JSON files in `./.browserbash/variables/` (project) or `~/.browserbash/variables/` (global), so dev and CI can target different storefronts without touching the test. There is a deeper write-up of this composition pattern over on the [BrowserBash blog](https://browserbash.com/blog).

## Handling logins, cards, and coupons without leaking secrets

Real checkout tests log in and submit payment details, and those are exactly the values you must never paste into a command that lands in your shell history or a CI log. BrowserBash handles this with a `--variables` payload and a `secret` flag. Use `{{placeholders}}` in the objective and supply their values as JSON; mark anything sensitive as secret:

```bash
browserbash run "Open {{base_url}}, log in as {{username}} with password {{password}}, add the featured item to the cart, check out, pay with card {{card_number}} expiry {{expiry}} CVV {{cvv}}, and verify the page says 'Thank you for your order!'" \
  --headless \
  --variables '{"base_url":"https://staging.example.com","username":"qa@example.com","password":{"value":"hunter2","secret":true},"card_number":{"value":"4111111111111111","secret":true},"expiry":"12/30","cvv":{"value":"123","secret":true}}'
```

Because the password, card number, and CVV carry `"secret": true`, each one shows as `*****` in every log line and structured event — which matters a great deal when test transcripts get archived. The non-secret values, like the base URL and expiry, stay readable, so you can still tell at a glance which environment a run hit. Point `{{base_url}}` at staging in dev and at a preview deployment in CI, and the same objective travels everywhere without edits. Use your payment provider's published *test* card numbers against a sandbox — never a live card against production.

## Recording a failed checkout for evidence

When a checkout fails — a coupon silently does not apply, the payment step stalls, the total is off by a cent — a screenshot and a verbatim verdict are worth more than any reproduction steps you could type. The `--record` flag captures a screenshot and a session video (a `.webm` stitched with ffmpeg) on any engine; the builtin engine additionally captures a Playwright trace you can open in Trace Viewer.

```bash
browserbash testmd run checkout_test.md --record --headless
```

Everything stays on your machine by default — nothing is uploaded unless you ask. There is a free, private local dashboard for browsing runs and replays:

```bash
browserbash dashboard
```

And if you want shareable run history with per-run replay — handy for handing a failed checkout to a developer or a payments vendor — create a free account, connect once, and push a run to the cloud dashboard with `--upload`:

```bash
browserbash connect --key bb_your_key_here
browserbash testmd run checkout_test.md --record --upload --headless
```

Cloud runs on the free tier are retained for 15 days. The privacy default is worth underlining: `--upload` is opt-in, so a checkout test — credentials, cart, and all — never sends anything off your laptop unless you explicitly tell it to.

## Running checkout tests in CI

A test you cannot run automatically is a demo, not a safety net, and checkout is exactly the flow you want gating every deploy. BrowserBash is built to gate merges without making your pipeline parse prose, and two facts make the integration clean.

First, **the exit code is the verdict**: `0` passed, `1` failed, `2` error, `3` timeout. Your CI step succeeds or fails on that code alone — no log scraping. Second, the `--agent` flag switches stdout to **NDJSON**: one JSON object per line, with a stable schema, while everything human-readable goes to stderr. Step events stream as they happen, and the final line is always a single `run_end` event carrying the status, a summary, and every value the test stored — including the `order_number` you captured.

```bash
browserbash testmd run checkout_test.md --agent --headless --timeout 240
```

A minimal GitHub Actions job is just an install and a run:

```yaml
- run: npm install -g browserbash-cli
- run: browserbash testmd run checkout_test.md --agent --headless --timeout 240
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The exit code fails the job exactly when checkout fails, and `--timeout` bounds any run that would otherwise hang on a stuck payment iframe. Because the NDJSON schema is stable, the same flag also makes BrowserBash callable by AI coding agents that need to verify their own work in a real browser — they read the `run_end` event instead of guessing from output. The [learn section](https://browserbash.com/learn) has the full event-schema reference and the bash-plus-`jq` patterns around it.

## Cross-browser and real-device checkout by changing one flag

Checkout bugs love to hide on specific browsers and devices — a Safari-only autofill quirk, a mobile viewport that collapses the order summary, an older Chrome that mishandles the payment iframe. BrowserBash treats *where the browser runs* as a runtime decision, controlled by `--provider`, with no test edits:

```bash
# Local Chrome (default) — watch the checkout run during development
browserbash testmd run checkout_test.md

# A cloud grid in CI — same file, one flag
browserbash testmd run checkout_test.md --provider lambdatest --headless
```

The providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. One detail to know: the stagehand engine cannot attach to LambdaTest or BrowserStack sessions, so when you pass one of those providers BrowserBash automatically switches to its builtin engine, which speaks the Anthropic API — meaning grid runs need `ANTHROPIC_API_KEY` set (or `ANTHROPIC_BASE_URL` pointed at an Anthropic-compatible gateway). You never pass `--engine` yourself; the switch is automatic, and the same markdown checkout file runs unchanged across all of them.

## AI checkout testing vs. traditional frameworks

To be fair, AI-driven checkout testing is not a free lunch, and selector-based frameworks remain the right tool for large stretches of regression work. Here is an honest comparison.

| Dimension | AI-driven (BrowserBash) | Selector-based (Playwright, Selenium, Cypress) |
| --- | --- | --- |
| How you write a test | English sentences / markdown steps | Code: locators, page objects, waits |
| Resilience to UI changes | High — agent re-reads the page each run | Low — selectors break on markup changes |
| Who can author and review | Anyone, including non-coders | Engineers comfortable with the framework |
| Speed per test | Slower — model inference per step | Fast — direct DOM calls, milliseconds per action |
| Determinism | Goal-deterministic, not path-identical | Bit-identical execution every run |
| Cost model | Free with local Ollama; tokens with hosted models | No per-run model cost |
| CI contract | Exit codes + NDJSON, no parsing | Framework reporters / JUnit XML |
| Best fit | Fast-changing checkouts, smoke and journey coverage | Deep regression walls, pixel-precise checks |

Two real tradeoffs deserve naming. **Speed**: a WebDriver click is milliseconds, while every BrowserBash step includes model inference, so a full checkout that a selector script finishes in seconds typically lands in the tens-of-seconds range. For a handful of journey tests that is irrelevant; for an 800-test regression wall it is disqualifying. **Determinism**: a coded test executes the same instructions every time, whereas an agent plans at run time and two runs may take slightly different paths to the same outcome. BrowserBash narrows that gap with explicit `verify` steps and exit codes as the contract, but the result is goal-determinism, not trace-identical execution.

### When to choose which

Reach for **AI-driven checkout tests** when the cart and payment UI churns constantly and selector maintenance is eating your time, when you need coverage *today* for a promotion or a redesign that just shipped, for the smoke and journey tests that answer "can a customer still buy?", and for any test you want a non-engineer to read and review. The authoring cost is a sentence, and the test survives the conversion-team refactors that would break a selector.

Keep **selector-based frameworks** for the deep regression suite where you have hundreds of stable tests, for sub-second-per-test budgets, for pixel-precise visual assertions on the order summary, and anywhere a network-free, bit-identical execution trace is mandatory for compliance.

The two coexist comfortably in one repo and one pipeline — both gate merges by exit code. The realistic pattern most teams land on is to keep their stable regression suite intact and move their most selector-fragile checkout smoke and journey tests to plain English, where the maintenance pain is worst and the resilience win is biggest. If you want the longer treatment of writing whole journeys this way, the [BrowserBash blog](https://browserbash.com/blog) has a dedicated guide.

## A repeatable workflow for checkout coverage

Putting it together, here is the loop that works in practice. Start by writing the purchase journey as a single `browserbash run "..."` objective and watch it execute locally with a visible browser, so you can see exactly where the agent's understanding of the cart diverges from yours. Tighten the wording until it passes reliably: specific `verify` clauses on every total, shopper-visible language, `store ... as` for the order number. Move the steps into a `*_test.md` file, factor login and add-to-cart into `@import` helpers, and commit it so it lives in code review. Wire it into CI with `--agent --headless --timeout`, letting the exit code gate the deploy. Turn on `--record` for the runs you need evidence from, and reach for `--provider` only when checkout needs testing on a browser or device that is not your machine. Each stage is small, and nothing you wrote in the first step gets thrown away in the last.

## FAQ

### Can an AI agent really complete a full checkout without selectors?

Yes — you write no locators, no page objects, and no explicit waits. You describe each step the way a shopper would understand it ("Click the 'Proceed to checkout' button," "Verify the grand total reflects the discount"), and the agent finds the elements on the live page at run time. That is precisely why these tests survive the cart and payment refactors that break selector-based suites: there is no hardcoded reference to the DOM to go stale.

### How do I keep credit card numbers and passwords out of CI logs?

Pass sensitive values through `--variables` (or a variables JSON file) and mark each one as `{"value":"...","secret":true}`. BrowserBash masks secrets as `*****` in every log line and in the NDJSON `run_end` event, so card numbers, CVVs, and passwords never appear in your shell history, CI logs, or archived transcripts — only non-secret values like the base URL stay readable. Always use your payment provider's published test cards against a sandbox, never a live card against production.

### Can these checkout tests verify totals, taxes, and coupons, not just that buttons click?

Absolutely, and you should make them. Add explicit `verify` steps for the numbers a customer scrutinizes — subtotal, discount, tax, shipping, and grand total — so a coupon that silently fails or a miscomputed tax fails the run even when every click succeeded. Because the agent reads the rendered order summary, you assert against the values a real shopper would see on the page.

### How do I run the same checkout test on different browsers and devices?

Switch one flag. The same markdown test runs on your local Chrome by default, on any DevTools endpoint with `--provider cdp`, or on a cloud grid with `--provider lambdatest`, `--provider browserstack`, or `--provider browserbase`. When you target LambdaTest or BrowserStack, BrowserBash automatically uses its builtin engine (which needs `ANTHROPIC_API_KEY`), so the test file itself never changes between your laptop and a real-device grid.

---

Ready to automate your checkout as a sentence? Install with `npm install -g browserbash-cli` from the [npm package page](https://www.npmjs.com/package/browserbash-cli), then [create a free account](https://browserbash.com/sign-up) when you want shareable run history and cloud replays. BrowserBash is free and open source under Apache-2.0 — point it at your staging storefront and convert your single most selector-fragile checkout test first.
