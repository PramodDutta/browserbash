---
title: Import an Existing Playwright Suite Into Plain English
description: "A hands-on browserbash import playwright tutorial: convert a real spec to plain English, read IMPORT-REPORT.md, and verify before you trust it."
date: 2026-07-18
category: tutorial
---

If you already have a Playwright suite, you don't need to throw it away to try natural-language testing. This browserbash import playwright tutorial walks through converting a real spec file with `browserbash import`, reading the `IMPORT-REPORT.md` file it leaves behind, and reviewing the generated test before you let it anywhere near CI. The short version: import is a deterministic converter, not a model, and it tells you exactly what it couldn't translate instead of guessing.

That distinction matters more than it sounds. A lot of "AI migration" tooling quietly invents steps when it hits something it doesn't understand, and you don't find out until a test fails for a reason that has nothing to do with your app. `browserbash import` takes the opposite approach: no LLM in the loop, so the same input always produces the same output, and anything it can't confidently translate goes into a report file instead of being dropped or fabricated.

## Why migrate a Playwright suite to plain English at all

Before the walkthrough, it's worth being honest about the motivation, because "convert everything to English" isn't automatically the right move for every team.

Playwright specs with well-chosen locators and a mature Page Object Model are already good. If your suite is stable, fast, and nobody complains about maintaining it, importing it into BrowserBash doesn't buy you much on its own. Where the conversion earns its keep is when:

- You want the same test readable by a product manager or a support engineer, not just an SDET.
- You're wiring your validation layer into an AI coding agent through the [BrowserBash MCP server](https://browserbash.com/features), and you want existing coverage available as `run_test_file` calls without hand-rewriting every spec.
- Your suite has drifted into brittle, deeply nested selector chains and you want a lighter-weight baseline to iterate from.
- You want to run the same logical test across `local`, `cdp`, `browserbase`, `lambdatest`, and `browserstack` providers without maintaining separate framework glue for each.

If none of that applies, keep your Playwright suite as-is. BrowserBash's import command is for teams that want a bridge, not a replacement mandate.

There's also a practical time argument. Rewriting a fifty-test suite by hand into a new format, even a simpler one, is a multi-day project most teams never actually schedule. It stays on the backlog forever, and the suite keeps drifting further from something a non-engineer could read. Running `browserbash import` against the same fifty files takes seconds, and it turns the remaining work into a bounded, visible list: whatever's in `IMPORT-REPORT.md`, rather than an open-ended rewrite. That reframing, from "rewrite everything" to "review what didn't convert," is usually the difference between a migration that happens and one that doesn't.

## What browserbash import actually does

`browserbash import` reads one or more Playwright spec files (or a whole directory of them) and heuristically converts the common patterns into `*_test.md` files: `goto`, `click`, `fill`, `press`, `check`, `selectOption`, the `getBy*` locator family, and the common `expect(...)` assertions. It also picks up `process.env.X` references and turns them into `{{X}}` variables, so your test files stay portable and your secrets stay out of the file.

Two things make this safe to run against a real suite:

1. **No model calls.** The conversion is pattern-based, not generative. Feed it the same spec twice and you get the same output twice. That reproducibility is the whole point when you're about to trust the result in CI.
2. **Nothing gets silently dropped.** Anything the converter doesn't recognize (a custom fixture, a complex `waitForResponse`, a non-standard assertion) is written to `IMPORT-REPORT.md` instead of being guessed at or ignored. You decide what to do with it.

That second point is the one people skip past, and it's the one this tutorial spends the most time on, because the report file is where the real migration work happens.

## Setting up: install BrowserBash and point it at a real spec

If you haven't already:

```bash
npm install -g browserbash-cli
```

No API key required to get started. BrowserBash defaults to Ollama-first: it tries a local model before anything else, and `browserbash import` doesn't even need a model at all since the conversion itself is deterministic.

For this tutorial, imagine a small Playwright spec for a login and checkout flow, sitting in `tests/checkout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('user can log in and reach checkout', async ({ page }) => {
  await page.goto('https://shop.example.com/login');
  await page.getByLabel('Email').fill(process.env.TEST_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole('link', { name: 'Shop' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.getByRole('link', { name: 'Cart' }).click();

  await page.getByLabel('Shipping method').selectOption('Express');
  await page.getByRole('checkbox', { name: 'I agree to the terms' }).check();
  await page.getByRole('button', { name: 'Checkout' }).click();

  await expect(page.getByText('Order confirmed')).toBeVisible();
  await expect(page).toHaveTitle(/Confirmation/);
});
```

This is a fairly ordinary spec: `getByLabel`, `getByRole`, `fill`, `click`, `check`, `selectOption`, a `toHaveURL`, a `toHaveTitle`, and a text-visibility assertion. It also references two environment variables for credentials, which is the pattern `browserbash import` is built to recognize.

## Running the import command

From the repo root:

```bash
browserbash import tests/checkout.spec.ts
```

You can also point it at an entire directory (`browserbash import tests/`) and it will walk every spec file it finds. For a single file, you'll get a generated `*_test.md` next to your output location and an `IMPORT-REPORT.md` summarizing the whole conversion. Nothing runs a browser during this step: import is pure static conversion, so it's fast even against a large suite.

## Reading the generated test file

For the spec above, the converter produces something close to this:

```markdown
# user can log in and reach checkout

- Go to https://shop.example.com/login
- Type {{TEST_EMAIL}} into the "Email" field
- Type {{TEST_PASSWORD}} into the "Password" field
- Click the "Sign in" button
- Verify URL contains "dashboard"
- Click the "Shop" link
- Click the "Add to cart" button
- Click the "Cart" link
- Select "Express" in the "Shipping method" field
- Check the "I agree to the terms" checkbox
- Click the "Checkout" button
- Verify "Order confirmed" text is visible
- Verify title contains "Confirmation"
```

A few things worth noticing here, because they explain both the value and the limits of the conversion:

**Variables, not secrets.** `process.env.TEST_EMAIL` and `process.env.TEST_PASSWORD` became `{{TEST_EMAIL}}` and `{{TEST_PASSWORD}}`. That's the same templating BrowserBash uses everywhere else, and if you mark the password variable as secret in your variables file, it gets masked as `*****` in every log line, same as any other test.

**The assertions are deterministic Verify steps.** `toHaveURL(/dashboard/)` became `Verify URL contains "dashboard"`, and `toHaveTitle(/Confirmation/)` became `Verify title contains "Confirmation"`. Both match BrowserBash's Verify grammar exactly, which means they compile to real Playwright checks at run time, not agent judgment. The text-visibility check followed the same path: `Verify "Order confirmed" text is visible` is grammar-matched, not judged.

**Ordinary interactions read like sentences.** `getByRole('button', { name: 'Sign in' }).click()` becomes `Click the "Sign in" button`. That's the whole pitch of BrowserBash in one line: no selector, no locator strategy decision, just what a human would type if you asked them to describe the step.

If you're running this on a real suite, don't skip the diff. Open the generated file next to the original spec and read every line side by side once. It's fast, and it's the cheapest way to catch a mistranslation before it costs you a debugging session later.

## Reading IMPORT-REPORT.md: what didn't translate

This is the step people are most tempted to skip, and it's the one that actually matters. Open `IMPORT-REPORT.md` after every import run. For a spec with something the converter doesn't recognize, say a custom `page.waitForResponse(...)` call checking an API response before continuing, the report looks something like this:

```markdown
# Import Report

## tests/checkout.spec.ts

Converted: 12 of 13 statements

### Not translated

- Line 9: `await page.waitForResponse(resp => resp.url().includes('/api/cart') && resp.status() === 200);`
  Reason: custom predicate function not supported by heuristic conversion.
  Suggestion: add a manual step, or replace with a Verify step against the resulting UI state.
```

That's the entire value proposition of a deterministic importer in one paragraph. It didn't try to approximate the intent of a custom predicate function, because guessing wrong here would produce a test that looks complete but silently checks nothing. Instead it told you precisely which line, why it couldn't convert it, and what to do about it.

In practice, the things that consistently land in the "not translated" bucket are:

- Custom fixtures and page object method calls that wrap multiple Playwright actions behind a single function name.
- Non-standard wait conditions: `waitForResponse`, `waitForFunction`, custom polling loops.
- Assertions outside BrowserBash's Verify grammar (deep object comparisons, screenshot diffing, accessibility tree snapshots).
- Conditional branching inside a test (`if` statements driving different paths based on page state).
- Multi-tab or multi-context flows, since the converter targets the common single-page-per-test shape first.

None of these are BrowserBash limitations you should be surprised by. They're the honest boundary of what a static, model-free converter can safely infer. The fix in every case is the same: read the reason, decide if the underlying check still matters, and either add it back by hand or replace it with an equivalent Verify step.

## What translates well versus what needs a manual pass

After running import against a handful of real suites, a pattern emerges. Here's the rough breakdown:

| Pattern | Translates cleanly | Needs manual review |
|---|---|---|
| `goto`, `click`, `fill`, `press`, `check` | Yes | |
| `getByRole`, `getByLabel`, `getByText`, `getByPlaceholder` | Yes | |
| `selectOption` on a `<select>` | Yes | |
| `process.env.X` references | Yes, becomes `{{X}}` | |
| `toHaveURL`, `toHaveTitle`, text-visibility expects | Yes, becomes Verify | |
| Element count assertions | Yes, becomes Verify | |
| Custom fixtures / page object methods | | Yes |
| `waitForResponse` / `waitForFunction` with predicates | | Yes |
| Conditional branching (`if` inside a test) | | Yes |
| Multi-tab / multi-context flows | | Yes |
| Screenshot or visual-diff assertions | | Yes |

If your suite leans heavily on the left column, expect a fast conversion with a light review pass. If it leans on the right column, budget real time to rewrite those sections by hand, either as additional plain-English steps or, in the case of screenshot diffing, as something you keep in Playwright directly since BrowserBash doesn't attempt to replicate visual regression testing.

## Reviewing the generated test before you trust it

Converting the file is the easy part. Trusting it is a separate step, and skipping it is how teams end up with a "passing" suite that isn't actually checking anything.

Run the imported test the same way you'd run any other:

```bash
browserbash testmd run checkout_test.md
```

Watch it execute, or run it headless with `--agent` if you want the NDJSON event stream instead of a live browser:

```bash
browserbash run-all . --agent --headless --timeout 120
```

A few concrete things to verify on that first run:

**Check the verdict against a known-good and a known-bad state.** Run the imported test against a build where the flow works, confirm it passes. Then, if you can, break something deliberately (wrong shipping option, missing terms checkbox) and confirm the imported test actually fails. A converted assertion that always passes regardless of app state is worse than no assertion at all, and the only way to catch that is to force a failure once.

**Compare the assertion count.** If your original spec had five `expect()` calls and the generated `Result.md` shows fewer than five entries in the assertions table, something didn't survive the conversion, and it's probably sitting in `IMPORT-REPORT.md` waiting for you.

**Confirm secrets stayed out of the file.** Open the generated `*_test.md` and grep for anything that looks like a literal credential. It shouldn't be there since env var references convert to `{{variables}}`, but a quick check costs nothing and catches the case where a credential was hardcoded in the original spec rather than pulled from `process.env`.

**Run it against a second provider if that's part of your plan.** One advantage of moving a test into BrowserBash's format is that the same file can run against `local`, `cdp`, or a grid provider like `lambdatest` or `browserstack` without separate framework configuration. If cross-browser or cross-grid coverage is why you're migrating, confirm that story works before you delete the original Playwright spec.

**Sanity-check the model you're running against.** If you're on the default Stagehand engine with a local Ollama model, be honest with yourself about the flow's complexity. A short login-and-checkout flow like the example above is well within range for a mid-size local model, but a very small model (roughly 8B parameters and under) can get flaky on long multi-step objectives, missing a step or misreading a page state under load. If an imported test that should pass reliably starts flaking, that's worth ruling out before you assume the conversion itself is the problem: try a larger local model, or point the run at a hosted `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for the flow in question and see if the flakiness disappears.

## Wiring imported tests into the rest of your workflow

Once you trust a converted test, it slots into everything else BrowserBash does, and this is where the migration starts paying for itself instead of just being a format change.

Add `version: 2` frontmatter and it can mix deterministic API setup with UI verification in one file, useful if your Playwright suite used `request.post()` to seed data before the UI steps:

```markdown
---
version: 2
---

# checkout with seeded cart

1. POST https://api.example.com/cart/seed with body {"sku": "SKU-100", "qty": 2}
   Expect status 201, store $.cartId as 'cartId'
2. Go to https://shop.example.com/cart
3. Verify "SKU-100" text is visible
4. Verify element count for ".cart-item" equals 1
```

Point the whole suite at the [BrowserBash MCP server](https://browserbash.com/features) so an AI coding agent can run your migrated regression tests as part of its own workflow, calling `run_test_file` and reading back a structured verdict instead of parsing terminal output:

```bash
claude mcp add browserbash -- browserbash mcp
```

Or keep it in CI exactly like a native Playwright suite would run, sharded across machines and budget-capped:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

None of that requires the original Playwright files to still exist. But there's no rule that says you have to delete them either. A lot of teams keep both for a stretch: the Playwright suite as the source of truth for anything import couldn't fully convert, and the BrowserBash suite as the plain-English layer that's easy for anyone on the team to read, extend, or hand to an AI agent.

## When to run import versus writing tests from scratch

Import is the right call when you have existing coverage you don't want to rewrite from zero, especially if that coverage uses common, well-behaved Playwright patterns: role-based locators, straightforward fill/click/check sequences, and standard `expect()` assertions. It's also the right call if your motivation is making an existing suite readable to non-engineers or usable by an AI agent through MCP, since the conversion preserves intent while dropping the locator-strategy layer.

Writing from scratch, or using [`browserbash record`](https://browserbash.com/tutorials) to click through a flow once and generate a test, makes more sense when your Playwright suite is small, when it leans heavily on custom fixtures and conditional logic that won't survive a heuristic conversion anyway, or when you're starting coverage for a flow that doesn't have a Playwright test yet at all. In that second case, recording the flow live is faster than writing either format by hand, and you skip the review-the-report step entirely because there's nothing to translate.

There's also a middle path worth mentioning: incremental adoption. You don't have to import the whole suite in one sitting. Start with the handful of tests that matter most for a quick smoke check, run `browserbash import` on just those files, review the reports, and get them into your CI pipeline or MCP-connected agent workflow first. Once that's stable, come back for the next batch. Treating import as an ongoing tool rather than a one-time cutover event tends to produce a cleaner result than trying to convert five hundred spec files in an afternoon and reviewing none of them carefully.

Either way, read `IMPORT-REPORT.md` before you trust an imported suite, and run each converted test against both a passing and a failing app state at least once. That's not specific to BrowserBash. It's just what "trust but verify" looks like when a deterministic tool hands you a file and tells you it did its best on the rest.

## FAQ

### Does browserbash import use AI to convert my Playwright tests?

No. The conversion is heuristic and pattern-based, not model-driven, so the same spec file produces the same output every time. Anything the converter can't confidently translate is written to `IMPORT-REPORT.md` instead of being guessed at, which keeps the process reproducible and auditable.

### What happens to environment variables and secrets during import?

References to `process.env.X` in your Playwright spec become `{{X}}` variables in the generated `*_test.md` file. Values are never hardcoded into the output, and if you mark a variable as secret in your BrowserBash variables file, it gets masked as `*****` in every log line at run time.

### Can I import an entire Playwright test directory at once?

Yes. Point `browserbash import` at a directory instead of a single file and it walks every spec it finds, producing a converted test for each along with one `IMPORT-REPORT.md` summarizing what did and didn't translate across the whole batch.

### Do I need to delete my Playwright suite after importing it?

No, and most teams don't right away. Keeping both is common: the original Playwright spec as the source of truth for anything the importer couldn't fully convert, and the generated plain-English test as the version that's easy to read, extend, or run through the BrowserBash MCP server.

Ready to try it on a real spec? Install with `npm install -g browserbash-cli` and run `browserbash import` against your own suite. No account is required to get started, but if you want the free cloud dashboard for run history later, you can [sign up here](https://browserbash.com/sign-up).
