---
title: Playwright expect() Assertions vs Plain-English Verify Steps
description: "Compare Playwright expect() with Verify steps that compile to real checks, no LLM judgment. Which keeps assertions clear and non-flaky in CI?"
date: 2026-07-05
category: comparison
---

Picture the ordinary version of this problem. A redesign PR lands, the checkout confirmation banner gets a new wrapper div and a renamed class, and four `expect()` calls that were pinned to `.order-success-banner` start failing in the E2E suite. Nothing about checkout actually broke: the confirmation text still renders, the order total is still right, the "Continue shopping" link still works. The assertions failed because they were written against markup, and the markup moved. Whoever is on call spends the next hour diffing selectors instead of verifying behavior, and ships the actual fix an hour later than they should have.

That's the moment "just verify it in plain English" starts to sound appealing, and also the moment a careful SDET should get suspicious. The entire value of `expect()` is that a pass means the exact condition held, every time. Trade that for a sentence an AI agent judges, and you can fix the selector-fragility problem while creating a worse one: a model that reports success when the condition was never actually met. So the real question isn't "which is nicer to write," it's whether a plain-English check is a genuine Playwright assertions alternative, one that keeps a verdict you don't have to double-guess, or just an agent's opinion with better branding. This article answers that using BrowserBash's `Verify` steps, because BrowserBash draws this exact line explicitly: some `Verify` lines compile to real checks, and the ones that don't are labeled, not hidden.

## What expect() actually guarantees

Start with what you already trust, because the alternative has to be measured against it honestly. A typical Playwright assertion block for the checkout scenario above looks like this:

```ts
import { test, expect } from '@playwright/test';

test('checkout confirms the order', async ({ page }) => {
  await page.goto('https://shop.example.com/checkout');
  // ...fill the form, submit payment...
  await expect(page).toHaveURL(/\/checkout\/confirmation/);
  await expect(page.getByRole('heading', { name: /order confirmed/i })).toBeVisible();
  await expect(page.locator('.cart-item')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Continue shopping' })).toBeVisible();
});
```

Four things are true about this block that make it the gold standard for a CI gate. It auto-retries: `toBeVisible()` and friends poll until the condition holds or the timeout expires, so you aren't racing the assertion against the page's own render. It's exact: `toHaveCount(1)` either matches one element or it doesn't, no shade of "close enough." It's typed and reviewable: a teammate reading the PR diff sees precisely which locator and which matcher changed. And it fails loudly: an unmet `expect()` throws, the test stops, and the reason is right there in the stack trace.

The cost is the one the opening scenario just paid. Every `expect()` call above is coupled to a locator, and a locator is coupled to the markup as it exists today. Rename a class or restructure a wrapper and the assertion fails not because checkout is broken, but because you described "checkout" in terms of its current HTML. You also need someone comfortable writing TypeScript to add or change a check, a real barrier for anyone else who wants to read or extend the suite.

## The other extreme: an agent judging "does this look right"

The opposite failure mode is worth naming first, because it's what "plain English assertions" get fairly criticized for. Hand an AI agent a fuzzy instruction like "verify the page looks like a successful order," and you've asked a model to judge meaning, and a model judging meaning can also hallucinate a pass: reporting success when the condition was never actually true. That failure is silent. The run goes green, the exit code is `0`, and nobody investigates a check that appeared to work. We've covered that failure mode in depth in [how natural-language assertions work and when they fail](https://browserbash.com/blog/natural-language-assertions-how-they-work); this article deliberately doesn't repeat it. It covers a narrower question: what happens when a plain-English line isn't judged by a model at all, but compiled into the same kind of check `expect()` runs.

## The middle path: Verify steps that compile, not just get judged

This is where BrowserBash's `testmd` v2 format earns its keep. Opt in with `version: 2` in a test file's frontmatter, and every line gets classified into exactly one of three kinds before the run ever starts: a deterministic API call, a deterministic `Verify` assertion, or a plain-English action for the agent. Only the third kind touches a model.

```markdown
---
version: 2
---
# Checkout applies a coupon and confirms the order

- POST {{base_url}}/api/cart/seed with body {"sku": "tshirt", "qty": 1}
- Expect status 201, store $.id as 'cart_id'
- POST {{base_url}}/api/cart/{{cart_id}}/coupon with body {"code": "WELCOME10"}
- Expect status 200, store $.appliedCode as 'applied_code'
- Verify stored 'applied_code' equals 'WELCOME10'
- Open the checkout for cart {{cart_id}}, pay with a test card, and finish the order
- Verify the URL contains '/checkout/confirmation'
- Verify the title contains 'Order Confirmed'
- Verify 3 elements match `.cart-item`
- Verify the 'Continue shopping' link is visible
```

Run it the same way you'd run any test file:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md --agent
```

Four things happen in that file, and only one of them calls a model. The two `POST` lines and their `Expect status` follow-ups run as plain HTTP requests, no browser, no model, seeding the cart and applying the coupon directly against the API. The stored-value `Verify` line is a string comparison against a value just captured from the API response, again no model. The single plain-English line, opening checkout and completing payment, is the one instruction the agent actually reasons about, grouped into a single objective because it's the only action line in that stretch. And the four `Verify` lines that follow are each compiled into a real Playwright check against the live page: a `waitFor({ state: 'visible' })`, a `.count()`, a `page.url()` read, polled until it matches or the timeout expires. Under the hood these are the same primitives you'd write by hand in the `expect()` block above. The difference is who wrote them, you in TypeScript, or the parser, from a sentence.

### Seven kinds of check, nine accepted phrasings

BrowserBash currently ships nine deterministic grammar patterns, covering seven kinds of check:

- **URL contains:** `Verify the URL contains '/checkout/confirmation'`, checked against `page.url()`.
- **Title is / title contains:** `Verify the title is 'Order Confirmed'` or `Verify the title contains 'Order Confirmed'`, checked against `page.title()`.
- **Text visible:** `Verify 'Order confirmed' is visible`, or the longer `Verify the text '...' is visible`, the same auto-retrying visibility wait `expect().toBeVisible()` gives you.
- **Named role visible:** `Verify the 'Continue shopping' link is visible`. Supported roles are button, link, heading, checkbox, textbox, tab, dialog, menuitem, option, and row.
- **Element count:** `Verify 3 elements match` a backtick-quoted CSS selector, or the selector followed by `count is 3`, both checked with `.locator(selector).count()`.
- **Stored value equals:** `Verify stored 'applied_code' equals 'WELCOME10'`, a string comparison against something captured earlier in the same run.

Match one of these shapes and a pass means the condition held, exactly the guarantee `expect()` gives you. Write something outside the grammar, genuinely fuzzy like "verify the page looks trustworthy," and BrowserBash doesn't reject it or silently skip it. It falls back to the agent, gets judged the old way, and is flagged everywhere that matters: `judged: true` in the `run_end.assertions` JSON, "(agent-judged)" in `Result.md`. You can see, line by line, which verdicts are code-equivalent and which are a model's opinion, instead of a suite where every green checkmark carries the same unearned confidence.

## What a compiled assertion actually returns

The `run_end` event (or the return value from BrowserBash's MCP tools, if another AI agent is driving it) carries a structured `assertions` block, additive to the existing NDJSON schema so nothing downstream breaks:

```json
{
  "type": "run_end",
  "status": "passed",
  "assertions": {
    "passed": 5,
    "failed": 0,
    "details": [
      { "step": "Verify stored 'applied_code' equals 'WELCOME10'", "passed": true, "expected": "stored 'applied_code' equals 'WELCOME10'", "actual": "WELCOME10" },
      { "step": "Verify the URL contains '/checkout/confirmation'", "passed": true, "expected": "URL contains '/checkout/confirmation'", "actual": "https://shop.example.com/checkout/confirmation/9182" },
      { "step": "Verify the title contains 'Order Confirmed'", "passed": true, "expected": "title contains 'Order Confirmed'", "actual": "Order Confirmed #9182" },
      { "step": "Verify 3 elements match `.cart-item`", "passed": true, "expected": "3 elements match .cart-item", "actual": "3" },
      { "step": "Verify the 'Continue shopping' link is visible", "passed": true, "expected": "link 'Continue shopping' visible" }
    ]
  }
}
```

That's expected-versus-actual evidence per check, not a paragraph of prose claiming success, the same shape of proof an `expect(locator).toHaveCount(3)` failure message gives you, just emitted as data instead of a stack trace. That's what makes it consumable by a CI step, a dashboard, or another AI agent deciding whether to trust the result; BrowserBash's own agent-integration docs tell an integrating agent to prefer this `assertions` block over the prose summary for exactly that reason. And because a failed unit stops the file right there, arrange-act-assert semantics, a busted "arrange" step never produces a meaningless pass three steps later, the same way an uncaught `expect()` failure stops the rest of a Playwright test body.

The human-readable side of the same run, `Result.md`, gets an `## Assertions` table: one row per check, a PASS or FAIL column, and "(agent-judged)" appended to any row that fell through to the agent. A reviewer doesn't have to take the suite's word for it; the table shows, per line, whether a green result is backed by code or by judgment.

## Where expect() still wins, honestly

None of this makes `expect()` obsolete, and pretending otherwise would be exactly the kind of overclaim this blog tries not to make. A handful of checks sit outside what the nine `Verify` forms express, on purpose:

- **Visual regression.** There's no `Verify` equivalent to `toHaveScreenshot()`. Pixel-level diffing stays a Playwright (or a dedicated visual-testing tool's) job.
- **CSS or attribute equality.** `toHaveCSS()` and `toHaveAttribute()` aren't in the grammar; assert an exact computed style or attribute value in code.
- **Computed or derived assertions.** "The total equals the sum of the line items plus tax" is logic, not a literal comparison, and `Verify` only compares a stored string to a string you wrote in the file. Anything involving math belongs in `expect()` or the API-step layer above.
- **Network and console assertions inline in the test body.** Playwright asserts on a response payload or a console message in the same file as the UI check. BrowserBash's API steps cover response checks (`Expect status 201, store $.id as 'order_id'`), but as a separate step type, not a `Verify` line.
- **Unit and component-level testing.** None of this replaces `expect()` inside Jest, Vitest, or Playwright's component testing. `Verify` steps are strictly an end-to-end concern.

One more limitation is about the current state of the tool, not a permanent design choice: `testmd` v2, and the compiled `Verify` grammar with it, runs on BrowserBash's builtin engine (the in-repo Anthropic tool-use loop), not yet the default Stagehand engine. Adopting compiled `Verify` steps for a file means that file's plain-English lines run on the builtin engine instead, via an `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway pointed at a `claude-*`-shaped model id. Worth knowing before you restructure a suite around it.

One more precise point: `{{variables}}` substitute cleanly into API step URLs and bodies and into plain-English action lines, but the comparison value inside a `Verify` line, the text after "equals," "contains," or "is", is matched literally, as written in the file, not substituted at run time. Check a dynamic value against something computed earlier in the run inside the API-step layer instead; a `Verify` line checks against a fixed expectation you wrote down in advance, which is usually what you want for a regression check anyway.

## Where Verify steps win

Set against those limits, the wins are specific, not just "it's easier." There's no selector to write or maintain for any of the seven common shapes, so a redesign that keeps the same visible text and roles doesn't touch the assertion at all. The file is readable by someone who doesn't write TypeScript: a PM or manual QA lead can read `Verify the title contains 'Order Confirmed'`, know exactly what's checked, and review the PR diff without opening a code editor. Arrange, act, and assert live in one plain-English file instead of split across a fixture, a page object, and a spec, the actual point of `testmd` v2.

Migration isn't a rewrite from scratch, either. `browserbash import` walks existing Playwright specs and heuristically converts common patterns, including `toHaveURL` / `toHaveTitle`, `toBeVisible`, and `toHaveText`, into equivalent `Verify` lines, no model involved. Anything it can't confidently translate lands in an `IMPORT-REPORT.md` instead of being silently dropped or invented, as the [migration tutorial](https://browserbash.com/blog/migrate-playwright-suite-to-browserbash) walks through.

## How to actually decide

Keep `expect()` for anything visual, computed, unit-level, or exact in a way none of the seven kinds cover. That isn't a close call. For end-to-end checks that are really about whether the URL, title, visible text, element count, or a captured value matches what you expect, write `Verify` lines in a `version: 2` test file and get the same deterministic guarantee with a much smaller maintenance surface. Reserve fully agent-judged assertions, an unmatched `Verify` line or a fuzzy clause inside a `browserbash run "<objective>"` string, for checks genuinely about meaning: "does the error message actually explain the problem." Treat every pass on a critical path as a claim worth auditing, not a fact to trust blindly.

If you came here asking whether this is a real Playwright assertions alternative or just a rebrand of the same LLM judgment, the honest answer is both, depending on the line: for the seven kinds of check above, yes, genuinely, with the same pass-means-it-held guarantee. For anything else, no, and BrowserBash doesn't pretend otherwise; it labels the difference in the output instead of hiding it. That labeling is also the point of positioning BrowserBash as a validation layer AI agents and humans can both check their work against, not just a nicer way to write clicks.

BrowserBash is free and open source (Apache-2.0), built by The Testing Academy, and installs with `npm install -g browserbash-cli`. See the full feature list, including `testmd` v2 and deterministic assertions, at [browserbash.com/features](https://browserbash.com/features).

## FAQ

### Does BrowserBash's Verify step replace Playwright's expect() entirely?

No. It replaces the subset of `expect()` usage that maps onto seven deterministic check kinds: URL, title, text or role visibility, element count, and stored-value equality. Visual regression, CSS or attribute equality, computed assertions, and unit or component-level testing all stay inside Playwright's `expect()`.

### Is a Verify step still deterministic if it's written in plain English?

Yes, when it matches the compiled grammar. The sentence is parsed once, before the run starts, into the same kind of check `expect()` performs, a `waitFor`, a `.count()`, a string comparison, and no model produces the pass or fail. It's the sentence that's plain English, not the verdict.

### What happens if my Verify line doesn't match one of the nine grammar patterns?

It still runs, so nothing silently gets skipped, but it falls back to agent judgment instead of a compiled check. BrowserBash flags this: the assertion result carries `judged: true` in the JSON, and `Result.md` marks that row "(agent-judged)," so you can always tell which checks in a passing suite were compiled and which were an opinion.

### Can I combine API calls, Verify checks, and plain-English steps in one test file?

Yes, that's the point of `testmd` v2. Opt in with `version: 2` frontmatter and write API steps (`POST ... with body ...` followed by `Expect status ...`), `Verify` assertions, and plain-English action steps in any order. They execute in sequence against one browser session, with API and Verify steps running deterministically and consecutive action lines grouped into agent objectives to keep model calls low.

### Does the compiled Verify grammar work with the default Stagehand engine?

Not yet. `testmd` v2, and the deterministic `Verify` grammar with it, currently runs on BrowserBash's builtin engine, which needs an `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway. Stagehand remains the default engine for `version: 1` test files and one-line `browserbash run` objectives.

### How do I tell which assertions in a passing run were compiled versus agent-judged?

Check the `assertions.details` array in the `run_end` event, or the `## Assertions` table in `Result.md`. Every entry carries `passed`, plus `expected` and `actual` evidence for compiled checks. Agent-judged entries carry `judged: true` in the JSON and an "(agent-judged)" tag in the table, so you never have to guess which green checkmarks are backed by a real check.
