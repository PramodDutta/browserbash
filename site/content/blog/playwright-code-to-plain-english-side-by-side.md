---
title: Your Playwright Code as Plain English: A Side-by-Side
description: "Playwright vs plain English tests, side by side. Convert Playwright to natural language with BrowserBash and see exactly what you trade and gain."
date: 2026-06-26
category: comparison
---

Here is the short version, with code, so you can decide in two minutes whether this is worth your time. A Playwright login test is a `page.goto`, two `fill` calls against locators, a `click`, and an `expect`. The BrowserBash equivalent is one line of English that names the goal. Same outcome, different contract: Playwright pins the exact steps and selectors, BrowserBash states intent and lets the engine work out the steps each run.

```ts
// Playwright
import { test, expect } from '@playwright/test';

test('user can log in', async ({ page }) => {
  await page.goto('https://app.example.com/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('hunter2');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

```bash
# BrowserBash
browserbash run "log in at https://app.example.com/login as test@example.com / hunter2 and confirm the dashboard loads"
```

Tradeoff: Playwright gives you precise, fast, repeatable control over every locator. BrowserBash gives you one resilient line that survives a label rename or a moved button, at the cost of some determinism and a dependency on a capable model.

That is the whole article in one example. The rest shows four more before/after pairs at increasing complexity, then an honest account of where each approach wins and where plain English stops being the right tool. [BrowserBash](https://browserbash.com/features) is a free, open-source, Apache-2.0 CLI from The Testing Academy. Install it with `npm install -g browserbash-cli`. Tests describe intent, not selectors, and the default engine is stagehand, while the builtin engine drives Playwright under the hood and emits traces you can open in the Playwright trace viewer.

## How BrowserBash expresses a test

Before the comparisons, two mechanics matter, because they explain how a one-line objective scales to a real suite.

First, the inline form. `browserbash run "<objective>"` takes a single plain-English goal and executes it against a real Chrome browser. Good for a quick check or a smoke test.

Second, the file form. A `*_test.md` file holds an ordered list of steps in Markdown. It supports `@import` to pull in shared setup (a login flow, a base URL, common fixtures), `{{variables}}` so the same test runs across environments and data rows, and secret masking so a password or token is supplied at runtime and never written to logs or traces. That file is the closest analog to a Playwright spec, and it is where most teams live once they move past one-liners.

A `login_test.md` might look like this:

```markdown
# Log in
@import setup/base.md

- Go to {{baseUrl}}/login
- Sign in as {{email}} with password {{password}}
- Confirm the dashboard loads and greets {{email}}
```

The steps are intent. There is no locator anywhere. The engine resolves "the thing that signs in" at run time, every run.

## 1. Login

Covered in the intro, but here it is as a clean pair with the file form, since login is the step you will `@import` everywhere.

```ts
// Playwright
await page.goto('https://app.example.com/login');
await page.getByLabel('Email').fill(process.env.TEST_EMAIL!);
await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!);
await page.getByRole('button', { name: 'Sign in' }).click();
await expect(page).toHaveURL(/.*dashboard/);
```

```markdown
# login_test.md
- Go to https://app.example.com/login
- Sign in as {{email}} with password {{password}}
- Confirm we land on the dashboard
```

Note: the password in the BrowserBash version is a masked `{{variable}}`, supplied at runtime and redacted from output. Playwright reaches for `process.env` plus your own care to keep secrets out of trace files. Both can be safe; one makes masking the default.

## 2. Form fill with several fields

This is where line count starts to diverge. A profile or signup form with six fields is six locators and six `fill` calls in Playwright, plus a select and a checkbox. In BrowserBash it is one objective that names the fields and their values.

```ts
// Playwright
await page.goto('https://app.example.com/profile');
await page.getByLabel('First name').fill('Ada');
await page.getByLabel('Last name').fill('Lovelace');
await page.getByLabel('Company').fill('Analytical Engines');
await page.getByLabel('Phone').fill('555-0142');
await page.getByLabel('Country').selectOption('United Kingdom');
await page.getByLabel('Subscribe to updates').check();
await page.getByRole('button', { name: 'Save' }).click();
await expect(page.getByText('Profile updated')).toBeVisible();
```

```bash
# BrowserBash
browserbash run "on https://app.example.com/profile set first name Ada, last name Lovelace, company Analytical Engines, phone 555-0142, country United Kingdom, tick subscribe to updates, save, and confirm 'Profile updated' appears"
```

Note: Playwright's per-field locators give you exact targeting and per-field failure messages, which is genuinely useful when one field is flaky. BrowserBash collapses the form to one statement and matches fields by their visible labels, so a reordered or relabeled field does not break the test, but a field-level failure is reported as "could not set country," not a specific selector miss.

## 3. Table or row assertion

Verifying a row in a data table is a common and annoying thing to write in Playwright. You scope to the row, then assert on cells. The plain-English version states the fact you want to be true.

```ts
// Playwright
const row = page.getByRole('row', { name: new RegExp(email) });
await expect(row).toBeVisible();
await expect(row.getByRole('cell', { name: 'Paid' })).toBeVisible();
await expect(row.getByRole('cell', { name: /\$\d+/ })).toBeVisible();
```

```markdown
# orders_test.md
- Verify the orders table shows an order for {{email}} with status Paid and a dollar amount
```

Note: the Playwright version is precise about which roles and cells it checks, which is exactly what you want when the table structure is contractual. The BrowserBash version reads like the acceptance criterion it came from, and it keeps working if the table gains a column or the cells get rewrapped in new markup, because it asserts on the meaning of the row rather than its DOM shape.

## 4. Conditional cookie banner or dialog

Conditional UI is where Playwright code gets defensive. A cookie banner that may or may not appear forces an `if`, a `try/catch`, or a short timeout you then have to justify in review. In BrowserBash you state the goal and the engine deals with the banner if it is there.

```ts
// Playwright
const accept = page.getByRole('button', { name: 'Accept cookies' });
try {
  await accept.click({ timeout: 2000 });
} catch {
  // banner not present this run, continue
}
await page.getByRole('link', { name: 'Pricing' }).click();
await expect(page).toHaveURL(/.*pricing/);
```

```markdown
# pricing_test.md
- Dismiss the cookie banner if one is shown
- Open the Pricing page and confirm it loads
```

Note: the Playwright `try/catch` is honest engineering, but it adds branching and a magic timeout that every reviewer has to read past, and a too-short timeout can flake. The BrowserBash step states the conditional intent directly. The cost is that you are trusting the engine's judgment of what counts as "the cookie banner," which is usually right but is not the explicit contract a locator is.

## 5. A multi-step checkout

This is the case that sells the approach. A realistic checkout, search, add to cart, go to cart, fill shipping, pick a method, enter payment, place the order, assert confirmation, runs to thirty-plus lines of Playwright with a dozen locators, each one a future maintenance liability. Here is a representative slice.

```ts
// Playwright
test('guest checkout', async ({ page }) => {
  await page.goto('https://shop.example.com');
  await page.getByPlaceholder('Search products').fill('wireless mouse');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('link', { name: /Wireless Mouse/ }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('link', { name: 'Cart' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Address').fill('1 Engine Way');
  await page.getByLabel('City').fill('London');
  await page.getByLabel('Postcode').fill('EC1A 1BB');
  await page.getByRole('radio', { name: 'Standard shipping' }).check();

  await page.getByLabel('Card number').fill('4242 4242 4242 4242');
  await page.getByLabel('Expiry').fill('12/30');
  await page.getByLabel('CVC').fill('123');
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
  await expect(page.getByText(/Order #\d+/)).toBeVisible();
});
```

```markdown
# checkout_test.md
@import setup/base.md

- Go to https://shop.example.com and search for "wireless mouse"
- Open the first wireless mouse result and add it to the cart
- Go to the cart and start checkout
- Enter shipping details for Ada Lovelace, 1 Engine Way, London, EC1A 1BB
- Choose standard shipping
- Pay with test card {{cardNumber}}, expiry 12/30, CVC {{cvc}}
- Place the order and confirm an "Order confirmed" page with an order number appears
```

Note: the Playwright version is fully deterministic and fast, and if any single step regresses you get a precise locator-level failure and a trace pointing at the exact line. The BrowserBash version is roughly seven readable lines that a product owner could review, card details are masked `{{variables}}`, and it absorbs the constant churn a shop's UI goes through, new promo interstitials, a relocated checkout button, a redesigned address form, without an edit. The cost is that a subtle bug like "shipping cost calculated wrong" still needs an explicit assertion you spell out, and the run is slower because the model is reasoning about each step rather than firing a pre-baked selector.

## When each one wins

Neither tool is strictly better. They optimize for different things, and a mature suite often uses both.

### Playwright wins when

- You need millisecond-stable, byte-identical runs, for example performance gates or tight CI budgets where every second and every retry counts.
- The assertion is exact and contractual: a specific API response shape, a pixel-level visual diff, a precise computed total, an ARIA attribute that must be present.
- The flow has intricate custom logic, loops over generated data, complex waits on network events, or branching that is genuinely easier to express in TypeScript than in prose.
- You already own a large, well-factored Playwright suite with page objects and fixtures, and the cost of change is low.

### BrowserBash wins when

- The UI changes often and your selector tests break for non-bugs, eating maintenance time on tests that were never actually testing the selector.
- You want tests that read like acceptance criteria so non-engineers can review and even write them.
- You are covering broad happy-path and smoke flows across many screens, where one resilient line per flow beats forty brittle ones.
- You want to stand up coverage fast on an app with no existing test harness, then keep it cheap to maintain.

A common pattern: BrowserBash for resilient end-to-end smoke and acceptance coverage that tracks the product as it shifts, Playwright for the handful of precise, performance-sensitive, or deeply custom checks that deserve hand-written code. If you are weighing the two for a specific suite, [BrowserBash vs Playwright: when to use which](https://browserbash.com/blog/browserbash-vs-playwright-when-to-use-which) goes deeper on the decision.

## Honest limits

Plain English is not a free lunch, and pretending otherwise would waste your time.

BrowserBash is not a line-for-line transpiler. You do not paste a Playwright file in and get an identical English script out, and you should not expect a one-to-one mapping of every `await` to a sentence. The translation is from *intent* to *intent*. Where your Playwright test encodes intricate custom logic, computed expectations, data-driven loops, or assertions on exact internal values, that logic still belongs in code, and forcing it into prose makes it vaguer, not clearer. Use a `*_test.md` step for the goal and keep the gnarly precision in Playwright where it reads better.

Exact assertions favor code. "The invoice total equals the sum of line items minus the 10 percent coupon" is a calculation, and a calculation wants a real expression and a real number. An English step can ask the engine to "confirm the total reflects the coupon," but if you need the exact figure checked, write the exact figure.

The plain-English version depends on a capable model. The engine has to read the page and decide what each step means, so output quality tracks model quality. A weaker model misreads ambiguous UI more often, which is the flip side of the resilience: you are trading a brittle-but-literal selector for a flexible-but-judgment-based interpretation. Scope each step clearly, assert on outcomes, and measure your own pass rate before trusting a flow in CI.

And to be explicit, because the category is full of overclaims: this is not self-healing magic. The engine re-derives targets from intent every run, which is why a renamed button does not break it, but that is plain re-interpretation, not a system that detects and patches its own broken locators. Set expectations accordingly.

If you are coming from an existing suite, the practical path is incremental. Keep Playwright where it earns its keep and move the high-churn flows first. [Migrate a Playwright suite to BrowserBash](https://browserbash.com/blog/migrate-playwright-suite-to-browserbash) walks through that, and if your maintenance pain is specifically page objects, [replace page objects with plain English](https://browserbash.com/blog/replace-page-objects-with-plain-english) covers the pattern that tends to delete the most code. For the underlying idea of why none of these tests reference a selector at all, see [browser automation without selectors](https://browserbash.com/blog/browser-automation-without-selectors).

## FAQ

### Does BrowserBash replace Playwright?

No, and it is not trying to. It replaces the brittle, high-maintenance parts of a selector suite with resilient plain-English objectives, and it leaves Playwright as the right tool for precise, fast, contractual checks. The builtin engine even runs Playwright under the hood and emits traces, so the two are not opposed at the runtime level. Many teams run both: BrowserBash for resilient acceptance and smoke coverage, Playwright for the exact and performance-sensitive cases.

### Can I just convert my Playwright tests automatically?

There is no line-for-line transpiler, because the translation is intent to intent, not statement to statement. In practice you reread what each test is trying to prove and restate that as one objective or a short list of `*_test.md` steps, which is usually far shorter than the original. The flows worth converting first are the high-churn ones whose selectors break for non-bugs. Tests with intricate custom logic or exact computed assertions are often better left in Playwright.

### How do I handle data, environments, and secrets?

A `*_test.md` file supports `@import` for shared setup, `{{variables}}` for environment and data values, and secret masking so passwords, tokens, and card numbers are supplied at runtime and redacted from logs and traces. That covers the same ground as Playwright fixtures, environment variables, and your own secret hygiene, with masking on by default rather than something you remember to add.

### Is it really free and open source?

Yes. BrowserBash is open source under Apache-2.0 from The Testing Academy, installable with `npm install -g browserbash-cli`. The default engine is stagehand, and you can switch to the builtin Playwright-backed engine when you want traces in the Playwright trace viewer. Start at [the features page](https://browserbash.com/features) or work through the guides on [learn](https://browserbash.com/learn).

## Where to go next

If the side-by-sides made the case, the fastest way to feel the difference is to install the CLI and convert one flaky flow. Pick the test that breaks most often for reasons that are not real bugs, restate it as a single objective, and run it a few times to see the path vary while the outcome holds. From there, browse [features](https://browserbash.com/features) for the full picture or [learn](https://browserbash.com/learn) for step-by-step guides, and use [BrowserBash vs Playwright: when to use which](https://browserbash.com/blog/browserbash-vs-playwright-when-to-use-which) to decide where the line between code and English should fall for your suite.
