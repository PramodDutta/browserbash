---
title: Write Deterministic Verify Assertions in BrowserBash
description: "A hands-on tutorial for deterministic verify assertions in BrowserBash: the Verify grammar, run_end.assertions, and judged fallback steps."
date: 2026-07-14
category: tutorial
---

If you have ever shipped an AI-driven test suite, you have probably had the same uneasy thought at some point: the agent said "pass," but did it actually check the right thing, or did it just sound confident? Deterministic verify assertions exist to remove that doubt. In BrowserBash, a `Verify` step written in a small, specific grammar compiles down to a real Playwright check rather than a model's opinion, so the pass or fail you get back is the same kind of pass or fail you would get from a hand-written assertion. This tutorial walks through the whole grammar, how to read the results, and exactly what happens the moment you write a Verify line the compiler does not recognize.

This is a pure how-to. No philosophy about AI testing in general, no competitor comparisons. Just the syntax, the output shape, and the edge cases you will actually hit while writing test files.

## Why deterministic verify assertions matter in an AI test file

A `*_test.md` file in BrowserBash is mostly plain English: "Log in with {{email}} and {{password}}, add the first product to the cart, go to checkout." An agent reads that objective, drives a real browser, and decides step by step what to click and type. That flexibility is the whole point of the tool. But flexibility and judgment cut both ways when it comes to the final check. If your last step is "Verify the order confirmation looks correct," you are asking a language model to eyeball a screenshot and render a verdict. Most of the time it will get it right. Occasionally it will not, and worse, you will not always be able to tell which runs were judgment calls and which were hard checks.

Deterministic verify assertions solve this by giving you a small vocabulary that compiles to actual Playwright expectations: URL checks, title checks, visibility checks, element counts, and stored-variable equality checks. When you write a Verify line inside that grammar, BrowserBash never asks a model whether the condition held. It runs the check itself, the same way an `expect(page).toHaveURL(...)` assertion would in a Playwright test, and the evidence for the outcome ships back in the run output. That matters most at exactly the point you would expect: the final assertion in a flow that is otherwise driven by natural language.

## The Verify grammar: what compiles deterministically

BrowserBash's Verify compiler recognizes a specific, growing set of assertion shapes. Each one maps to a Playwright check under the hood, no LLM call involved. Here is the current grammar:

| Verify pattern | What it checks | Playwright equivalent |
|---|---|---|
| `Verify URL contains "checkout"` | Current page URL includes a substring | `expect(page).toHaveURL(/checkout/)` |
| `Verify title is "Order Confirmed"` | Page title equals exactly | `expect(page).toHaveTitle("Order Confirmed")` |
| `Verify title contains "Confirmed"` | Page title includes a substring | `expect(page).toHaveTitle(/Confirmed/)` |
| `Verify text "Payment successful" is visible` | Given text is visible anywhere on the page | `expect(page.getByText(...)).toBeVisible()` |
| `Verify 'Submit' button is visible` | A button with that accessible name is visible | `expect(page.getByRole('button', {name: 'Submit'})).toBeVisible()` |
| `Verify 'Home' link is visible` | A link with that accessible name is visible | `expect(page.getByRole('link', {name: 'Home'})).toBeVisible()` |
| `Verify 'Checkout' heading is visible` | A heading with that accessible name is visible | `expect(page.getByRole('heading', {name: 'Checkout'})).toBeVisible()` |
| `Verify count of ".cart-item" is 3` | Number of matching elements equals a value | `expect(page.locator(...)).toHaveCount(3)` |
| `Verify stored 'orderId' equals "ORD-4521"` | A previously stored variable matches exactly | direct string comparison against the store |

The role-based pattern (`'name' button|link|heading visible`) is the one worth internalizing first, because it is the pattern you will reach for most often. It mirrors Playwright's own `getByRole` locator strategy: instead of hunting for a CSS class or an XPath, you name the accessible role and the visible label, which is also what a screen reader announces. That makes your Verify lines resilient to the kind of markup churn that breaks selector-based tests, without giving up determinism the way a fully agent-judged check does.

The `count` pattern is your tool for structural assertions: "there are exactly 3 items in the cart," "the search results list has 12 rows," "the error banner region has 0 children." It takes a CSS selector, not a plain-English description, which is a deliberate trade-off: you lose some of the natural-language ergonomics in exchange for a check that is unambiguous about which elements it is counting.

The `stored` pattern lets you close the loop between something you captured earlier in the same run (from an agent step, or from an API step in a testmd v2 file) and a value you expect it to equal later. This is the pattern that turns BrowserBash from "did something happen" into "did the exact right thing happen," because it lets you compare against real captured state rather than a hardcoded expectation you have to keep updating by hand.

## Writing your first Verify steps

Let's build a small `*_test.md` file for a login-then-checkout flow and put deterministic assertions at the two points that matter most: right after login, and right after order placement.

```markdown
# Checkout smoke test

- Go to https://shop.example.com/login
- Log in with {{email}} and {{password}}
- Verify URL contains "dashboard"
- Verify 'Sign out' link is visible
- Add the first product in the catalog to the cart
- Go to checkout and complete payment with the test card
- Verify title contains "Order Confirmed"
- Verify text "Payment successful" is visible
- Verify count of ".order-summary-line" is 1
```

Run it with the standard testmd command:

```bash
browserbash testmd run ./.browserbash/tests/checkout_smoke_test.md --agent
```

Notice what is happening structurally. The first five steps are plain English, and the agent figures out how to execute them: filling the login form, finding the right product, clicking through to checkout. The Verify lines sit inline between those steps, and each one is evaluated the instant BrowserBash reaches it, against whatever the page looks like at that moment. If "Sign out" is not visible right after login, that Verify line fails on the spot rather than letting the whole flow limp forward on a broken assumption.

This inline placement is worth calling out because it is different from bolting one giant assertion onto the end of the file. Spreading Verify steps through the flow means a failure points you at the exact step where reality diverged from expectation, instead of leaving you to reconstruct what went wrong from a final screenshot.

### A note on quoting and exact matching

The grammar is intentionally strict about quoting because that strictness is what makes it deterministic. `Verify title is "Order Confirmed"` requires an exact match; if the real title is "Order Confirmed - shop.example.com", that line fails and you want `title contains` instead. Get in the habit of using `contains` for anything with dynamic suffixes (order numbers, timestamps, breadcrumbs) and `is` only for strings you control completely, like a fixed page title.

## Reading the run_end.assertions block

Every BrowserBash run in agent mode (`--agent`) emits NDJSON on stdout, one JSON object per line, ending with a `run_end` event. When your test file contains Verify steps, that `run_end` event carries a structured `assertions` array, one entry per Verify line, in the order they executed.

A passing assertion looks like this:

```json
{
  "type": "verify",
  "expression": "Verify URL contains \"dashboard\"",
  "judged": false,
  "passed": true,
  "expected": "contains \"dashboard\"",
  "actual": "https://shop.example.com/dashboard?ref=login"
}
```

And a failing one carries the same shape, with the evidence that tells you exactly what diverged:

```json
{
  "type": "verify",
  "expression": "Verify count of \".order-summary-line\" is 1",
  "judged": false,
  "passed": false,
  "expected": "count == 1",
  "actual": "count == 2"
}
```

This is the part that makes deterministic verify assertions useful in CI, not just reassuring in principle. You do not have to parse prose to find out what failed. Grep the `run_end` line, filter `assertions` where `passed` is `false`, and you have a machine-readable list of exactly which conditions did not hold, expected and actual sitting right next to each other, the same shape you would build by hand from a Playwright reporter, except it came from a plain-English test file.

If you are running through `browserbash testmd run` without `--agent`, the same evidence lands in the human-readable `Result.md` file written after the run, formatted as an assertion table: one row per Verify line, with pass/fail and the expected/actual pair. That file is the one to open when you are debugging a failure by hand rather than parsing it in a script.

### Piping assertions into CI logic

Because `assertions` is structured JSON, you can act on it directly instead of relying on the process exit code alone. A common pattern is capturing the last line of `--agent` output and checking specific assertions before deciding whether to block a deploy:

```bash
browserbash testmd run ./.browserbash/tests/checkout_smoke_test.md --agent | tail -n 1 > run_end.json
```

From there, a small script (or `jq`) can assert that a specific Verify line passed, independent of the overall run status. This is useful when one assertion in a longer flow is a hard release blocker (say, the payment confirmation) while others are informational.

## Verify steps vs agent-judged steps: the judged flag

Not every Verify line you might want to write fits the current grammar. Maybe you want to check something more subjective, like "Verify the product image looks correctly rendered" or "Verify the layout is not visually broken." BrowserBash does not reject those lines. It runs them, but it hands them to the agent to evaluate with judgment rather than compiling them to a Playwright check, and it flags the result `"judged": true` in the same `assertions` array.

This is the detail that makes the whole system trustworthy: you are never left guessing whether a given assertion was deterministic or a model's opinion. The flag is right there in the structured output.

```json
{
  "type": "verify",
  "expression": "Verify the product image looks correctly rendered",
  "judged": true,
  "passed": true,
  "expected": "agent judgment",
  "actual": "image loaded, no broken-image icon, aspect ratio looks correct"
}
```

Practically, this means you can mix both kinds of Verify lines in the same test file without any special syntax to switch modes. BrowserBash decides per line, based on whether the wording matches one of the grammar patterns. If it does, deterministic. If it does not, judged. Both still show up as first-class entries in `assertions`, so a reporting script can choose to treat `judged: true` results differently, for example logging them but not failing a build on them, while treating `judged: false` failures as hard blockers.

### When a judged fallback is actually the right call

Do not read this as "always prefer the grammar." Some checks genuinely need visual or contextual judgment that no selector-based assertion can express, like "Verify the error message is worded clearly and does not blame the user." Those are legitimate uses of a judged Verify step, and BrowserBash supports them on purpose rather than forcing everything into deterministic form. The goal of the grammar is to pull the checks that can be deterministic out of judgment's hands, not to eliminate judgment entirely. Use `judged: true` results as a signal in your test file design: if you see a lot of them clustered around checks that really are objective (a URL, a visible label, a count), that is often a sign the wording just needs to shift into the grammar, not that the grammar is missing a capability.

## What happens when a Verify line falls outside the grammar entirely

It is worth being precise about the boundary here, because "falls outside the grammar" covers two different situations, and they behave differently.

The first situation is a Verify line that reads as a genuine, evaluable claim about the page, just phrased in a way the compiler does not have a pattern for yet, like the "looks correctly rendered" example above. As covered, that becomes a judged step: the agent evaluates it, and the result carries `judged: true`.

The second situation is a Verify line that is malformed or references something that does not exist in the run at all, for example `Verify stored 'shippingCost' equals "12.99"` when nothing in the test file ever stored a variable named `shippingCost`. That assertion fails deterministically rather than falling back to judgment, because the check itself is well-formed (a `stored equals` pattern) but the precondition for evaluating it does not hold. The `actual` field tells you plainly that the variable was never set, usually a signal that an earlier step needs a store action added to it, not that the Verify line is wrong.

The practical rule to carry away: a recognized pattern always resolves deterministically, true or false, with real evidence. An unrecognized pattern degrades gracefully to a judged step rather than crashing the run or silently skipping the line. Nothing in a Verify step is ever dropped or ignored, you always get a result and a `judged` flag telling you how it was produced.

## Combining Verify with testmd v2 API steps

If you add `version: 2` to a test file's frontmatter, BrowserBash switches to a step-by-step execution model against a single browser session, and it unlocks a second kind of deterministic step alongside Verify: API steps. These let you seed or check state directly over HTTP, with no model involved, which pairs naturally with Verify assertions that check the same state through the UI afterward.

```markdown
---
version: 2
---

# Order lookup, seeded via API

- POST https://api.shop.example.com/orders with body {"sku": "WIDGET-1", "qty": 2}
- Expect status 201, store $.id as 'orderId'
- Go to https://shop.example.com/account/orders
- Verify stored 'orderId' equals "ORD-4521"
- Verify text "WIDGET-1" is visible
```

The API step creates the order and captures its id with no browser involved. The Verify step later checks that the same id shows up on the account page, closing the loop between backend state and what a real user would see. Both steps are deterministic, so this file can run with zero model calls, or mix in agent-driven steps where the flow needs them. Keep in mind testmd v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway, since it is not yet wired up to run directly against Ollama or OpenRouter models.

## Practical patterns for placing Verify steps

A few habits make Verify assertions more useful in practice, based on where flows tend to actually break:

**Verify right after any navigation that matters.** If a step says "go to checkout," the next line should usually be a `Verify URL contains "checkout"` or a `Verify 'Checkout' heading is visible`, so a redirect back to the cart (a common real bug) fails immediately instead of confusing whatever comes after it.

**Verify state, not just presence.** `Verify count of ".cart-item" is 3` catches "an item silently failed to add" in a way that `Verify text "Cart" is visible` never will, since the second check still passes even if the cart is empty.

**Use stored equals to check computed values.** Anything a backend calculates (totals, discounts, tax) is worth capturing with an API step or an earlier store action, then checking with `Verify stored 'total' equals "..."` rather than trusting a UI-only judged check to catch an off-by-cents bug.

**Reserve judged Verify lines for genuinely subjective checks.** If you catch yourself writing a judged line for something that is really just "is this text visible" or "is this URL correct," rewrite it into the grammar for a faster, cheaper, more repeatable check.

## Verify assertions in a GitHub Action

Because `assertions` ships in the same NDJSON stream CI already parses for the pass/fail verdict, wiring Verify results into a pull request needs no extra plumbing. The [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) posts a self-updating PR comment with a verdict table and links to uploaded JUnit and NDJSON artifacts, and the same `assertions` array is present in that JUnit output, so a failing deterministic check shows up as a failed test case rather than getting buried in agent narration.

```yaml
- uses: PramodDutta/browserbash-action@v1
  with:
    tests: .browserbash/tests
    budget-usd: 2.00
```

Pair that with `run-all --shard i/n` if your suite is large enough to split across parallel CI jobs, since sharding is computed from sorted discovery order and does not need any coordination between machines to stay deterministic in both senses of the word: which tests run where, and what each Verify line reports.

## When to lean on the Verify grammar vs plain English

Not every check belongs in the Verify grammar, and treating it as mandatory everywhere would just make your test files harder to read for no benefit. Use the grammar at the specific points in a flow where you need a guarantee, not a description:

- **Use Verify** for anything that has one correct, checkable answer: a URL, a title, whether a specific labeled element is visible, an element count, or a captured value matching an expectation.
- **Use plain English** for the parts of the flow that are genuinely about behavior and navigation: "log in," "add the cheapest item to the cart," "complete checkout with the test card." Forcing these into a rigid syntax would just recreate the brittleness of selector-based tests that BrowserBash exists to avoid.
- **Use a judged Verify line** sparingly, for checks that are legitimately about visual or contextual quality rather than a fact you can query from the DOM.

Most well-built test files end up as a spine of plain-English steps with Verify lines placed at the seams: after login, after navigation, after any state-changing action, and at the final outcome.

If you want to see the broader assertion and testmd v2 picture, the [tutorials index](https://browserbash.com/tutorials) and [learn section](https://browserbash.com/learn) have companion walkthroughs on API steps and auth reuse that pair well with this one, and the [features page](https://browserbash.com/features) covers where Verify fits alongside the rest of the 1.5 release.

## FAQ

### What is the difference between a Verify step and a plain-English step in BrowserBash?

A plain-English step describes an action or an observation and the agent decides how to carry it out, using its own judgment about what it sees on the page. A Verify step that matches the supported grammar (URL, title, text or role visibility, element count, stored equality) compiles to a real Playwright check instead, so the result is a deterministic pass or fail rather than a model's assessment. Both live in the same test file and can be mixed freely.

### How do I know if a Verify assertion in BrowserBash was deterministic or agent-judged?

Check the `judged` field on that assertion's entry in the `run_end.assertions` array (from `--agent` NDJSON output) or the assertion table in `Result.md`. `judged: false` means it compiled to a real Playwright check with no model call; `judged: true` means the wording fell outside the current grammar and the agent evaluated it with judgment instead.

### Does BrowserBash's Verify grammar support checking element counts or captured variables?

Yes. `Verify count of "<selector>" is <number>` checks how many elements a CSS selector matches, and `Verify stored '<name>' equals "<value>"` compares a previously captured variable, whether it came from an agent step's store action or a testmd v2 API step, against an expected value. Both resolve deterministically with no model involved.

### Can I use Verify assertions without upgrading to testmd v2?

Yes. Verify steps work in ordinary v1 test files as regular steps mixed with plain-English instructions; you do not need `version: 2` frontmatter to use them. Version 2 adds a second deterministic step type, API steps, and switches execution to one step at a time on the builtin engine, which is useful when you want to seed or check backend state directly, but it is a separate, optional upgrade from using Verify itself.

Deterministic verify assertions are one of the simplest ways to make an AI-driven test suite trustworthy without giving up the plain-English ergonomics that make it worth using in the first place. Start small: pick the one or two checkpoints in your riskiest flow, like login and checkout, and rewrite the final "verify it worked" lines into the grammar above. Install BrowserBash with `npm install -g browserbash-cli` and try it against a real flow today. An account is optional; if you want the hosted dashboard and run history later, [sign up here](https://browserbash.com/sign-up).
