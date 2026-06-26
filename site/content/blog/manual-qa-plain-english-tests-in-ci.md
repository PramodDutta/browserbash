---
title: "Manual QA to CI: Plain-English Tests Without Writing Code"
description: "Manual QA automation without code: turn the plain English tests you already write into CI checks. No Playwright, no Selenium, just *_test.md files."
date: 2026-06-26
category: use-case
---

Yes, a manual tester can turn the test cases they already write in English into automated CI checks, and they can do it without learning Playwright or Selenium. The trick is a plain-text file format. You save your numbered manual steps as a `*_test.md` file, run it with BrowserBash, and wire that same file into your pipeline so it runs on every pull request. Your test cases stay in plain English. The automation happens around them.

This post walks the whole path, from a manual test case you might have in a spreadsheet today, to a green or red check on a GitHub pull request, with no stack traces to decode at the end.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser-automation and testing CLI from The Testing Academy. You install it once with `npm install -g browserbash-cli`. After that, the work happens in Markdown files you can read out loud.

## The short version: from English steps to a CI check

Here is the entire loop, then we will slow down and do each part properly.

1. Take a manual test case (numbered steps in plain English) and save it as a `*_test.md` file, almost word for word.
2. Run it locally with `browserbash testmd run ./checkout_test.md`, and watch the browser do it with `--record`.
3. Pull shared steps (like login) into one file and reuse them with `@import`, and feed in data and credentials using `{{variables}}` so secrets get masked in the logs.
4. Commit the `.md` file to your repo and wire it into CI (GitHub Actions) using `--agent` for machine-readable output and the exit codes to pass or fail the build.
5. When something breaks, read the failure from `Result.md` and the recording. No stack trace required.

That is the answer. The rest is detail and honesty about where it gets harder.

## Step 1: Turn a manual test case into a `*_test.md` file

Start with something you already own. Most manual testers have a checkout test that looks roughly like this in a spreadsheet or test-management tool.

### Before: the manual test case (a table)

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Go to the shop home page | Home page loads with product grid |
| 2 | Click the first product | Product detail page opens |
| 3 | Click "Add to cart" | Cart count shows 1 |
| 4 | Open the cart | Cart shows the product and price |
| 5 | Click "Checkout" | Checkout form appears |
| 6 | Fill name, email, and address | Fields accept the input |
| 7 | Click "Place order" | Confirmation page shows an order number |

You have probably run this by hand a hundred times. You know exactly what each step means. That knowledge is the valuable part, and it transfers directly.

### After: the same case as `checkout_test.md`

A `*_test.md` file is just a Markdown file. The title goes after a `#`. The steps are a list, written with `-` bullets or `1.` numbers. BrowserBash reads the steps in order and drives a real browser through them.

```markdown
# Checkout flow

1. Go to https://shop.example.com
2. Click the first product in the grid
3. Click the "Add to cart" button
4. Confirm the cart count shows 1
5. Open the cart
6. Confirm the cart shows the product and its price
7. Click "Checkout"
8. Fill in the name field with "Test Buyer"
9. Fill in the email field with "buyer@example.com"
10. Fill in the address field with "221B Baker Street, London"
11. Click "Place order"
12. Confirm the page shows an order number
```

Look at what changed: almost nothing. You added the starting URL and turned "Expected result" notes into plain "Confirm that..." steps. There is no `await page.click()`, no CSS selector, no `By.xpath`. You did not pick element locators. You described the intent the way a human tester would read it off a card, and BrowserBash figures out which button on the page is the "Add to cart" button.

This is the heart of manual QA automation without code. The skill you are using is the same skill you already have: writing a clear, unambiguous test case. The file format is the only new thing, and it is a format you can learn in one read.

A few small habits make these files run better:

- Name the file so it ends in `_test.md`. That suffix is the convention BrowserBash looks for.
- Write one action per step. "Click Checkout and fill the form" is two steps, so split it.
- Make assertions explicit. A step like "Confirm the page shows an order number" gives BrowserBash something concrete to check, and gives you a clean pass or fail.

## Step 2: Run it locally and watch it

Before you trust a test in CI, you watch it run once on your own machine. That is where you catch a step that was clearer in your head than on the page.

```bash
browserbash testmd run ./checkout_test.md
```

That runs the file and prints the result. To actually see the browser move through your steps, add the recording flag.

```bash
browserbash testmd run ./checkout_test.md --record
```

With `--record`, BrowserBash saves a `.webm` video of the run plus screenshots. This is the part manual testers tend to love, because it is the closest thing to looking over the browser's shoulder. If step 9 fails, you do not guess why. You open the video, watch what the page looked like at that moment, and usually see it immediately: the email field had a different label, or a cookie banner was covering the button.

Every run also writes a `Result.md` file, a plain-English summary of what happened on each step. We will lean on that hard in step 5.

Run the file a couple of times. If it passes consistently and the recording matches what you expect, the test is ready to share.

## Step 3: Reuse login with `@import`, and handle data with `{{variables}}`

Real test suites repeat themselves. Almost every test starts by logging in. You do not want to paste the same six login steps into twenty files, because the day the login flow changes you would have to edit all twenty.

### Pull shared steps into one file with `@import`

Put your login steps in their own file, for example `login_test.md` or a shared `login.md`.

```markdown
# Shared login

1. Go to https://shop.example.com/login
2. Fill in the email field with {{USER_EMAIL}}
3. Fill in the password field with {{USER_PASSWORD}}
4. Click the "Sign in" button
5. Confirm the account menu is visible
```

Then in your checkout test, bring those steps in with `@import` instead of repeating them.

```markdown
# Checkout flow (logged in)

@import login.md

1. Go to https://shop.example.com
2. Click the first product in the grid
3. Click the "Add to cart" button
... (rest of the checkout steps)
```

Now login lives in one place. Fix it once and every test that imports it gets the fix. This is the same "don't repeat yourself" idea engineers use, except you are doing it with readable English files, not function calls.

### Feed in data and credentials with `{{variables}}`

Notice `{{USER_EMAIL}}` and `{{USER_PASSWORD}}` above. Anything in double curly braces is a variable. You supply the real value at run time, which keeps two things out of your test files: data that changes, and secrets that must never be committed.

This matters for credentials specifically. BrowserBash masks secret values in its logs, so a password passed in as a variable does not show up in plain text in your run output or your CI logs. You write the test against `{{USER_PASSWORD}}`, the real password is provided by your CI secret store at run time, and the logs show it masked. Your `.md` file is safe to commit because it contains a placeholder, not the actual password.

The same pattern handles test data. Instead of hard-coding `buyer@example.com`, you can use `{{BUYER_EMAIL}}` and pass different values for different environments, like a staging email in CI and a throwaway address locally.

For the full mechanics of defining values, passing them in, and what masking does and does not cover, see the [variables and secrets tutorial](/blog/browserbash-variables-and-secrets-tutorial).

## Step 4: Commit the file and wire it into CI

This is the step that changes your job. Once the `.md` file is in your repository and connected to CI, your test runs automatically on every pull request, with no one remembering to run it.

First, commit the file like any other project file.

```bash
git add checkout_test.md login.md
git commit -m "Add plain-English checkout test"
```

Now connect it to GitHub Actions. The key flag for automation is `--agent`, which makes BrowserBash emit NDJSON (newline-delimited JSON, one event per line) instead of pretty human output. CI tools read that format easily. Paired with that, BrowserBash uses standard exit codes so the build knows what happened:

- `0` means the test passed.
- `1` means the test failed (a step or assertion did not pass).
- `2` means an error (something went wrong running the test itself).
- `3` means a timeout (the run did not finish in time).

A GitHub Actions step can be as direct as this:

```yaml
- name: Run BrowserBash checkout test
  run: browserbash testmd run ./checkout_test.md --agent --record
  env:
    USER_EMAIL: ${{ secrets.USER_EMAIL }}
    USER_PASSWORD: ${{ secrets.USER_PASSWORD }}
    BUYER_EMAIL: ${{ secrets.BUYER_EMAIL }}
```

Because the test exits non-zero on failure, GitHub Actions marks the job red on its own. You do not write any glue to interpret results. A failed checkout test becomes a failed check on the pull request, right next to the unit tests. Keep `--record` on in CI so that when something fails, the video and screenshots are saved as artifacts you can download and watch.

For the full pipeline setup, including caching, artifacts, and running several `.md` files together, follow the [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial).

### Why this is the career part

Here is the honest pitch for a manual QA tester. You did not become an engineer. You did not spend three months learning a framework and fighting flaky selectors. You kept writing test cases in plain English, the way you always have. But now those cases run on every code change, automatically, and block a broken checkout from shipping.

That is a real shift in how your work shows up. Instead of a test case sitting in a document that someone runs before a release if there is time, your test case is a check on the pull request that a developer sees the moment they break it. The plain-English file you wrote is the source of truth, and it is doing the gatekeeping. You moved from running tests to owning tests that run themselves, without changing the skill you trade on.

If you want the mindset behind writing tests that survive UI churn, [testing user intent, not clicks](/blog/testing-user-intent-not-clicks-invariants) is worth a read. It is the difference between a test that breaks every time a button moves and one that keeps checking what actually matters.

## Step 5: Read failures without reading stack traces

When a developer breaks the checkout, the pull request goes red. Now what? This is where BrowserBash stays friendly to non-coders.

You do not open a log full of `TypeError: Cannot read properties of null` or a stack trace pointing at line 412 of some framework file. You open two things:

1. **`Result.md`**, the per-run summary. It walks through your steps in plain English and tells you which step passed and which one failed, in the same language you wrote them. "Step 7: Click Checkout, passed. Step 8: Fill in the name field, failed: could not find the name field." That sentence tells you what to look at.
2. **The recording** from `--record`. Open the `.webm` video and the screenshots, scrub to the failing step, and look at the actual page. Nine times out of ten the cause is visible: a field got renamed, a modal popped up, the page was still loading.

Between the plain-English `Result.md` and the video, you can usually diagnose a failure the same way you would if you had run the test by hand and watched it fail, because that is essentially what the recording shows you. You then do what a good manual tester already does: decide whether the app is broken (file a bug) or the test needs sharpening (update the step). No code-reading required to make that call.

## Honest limits: where this gets harder

This approach is genuinely useful, and it is not magic. Being straight about the rough edges will save you frustration.

**Someone still has to own the CI wiring.** Saving a `.md` file is easy. Setting up GitHub Actions the first time, managing secrets, and configuring artifacts is real configuration work. If your team has someone who handles CI, lean on them for the initial setup. After it exists, adding a new test is just committing another `.md` file, but the first pipeline is not zero effort.

**Ambiguous steps need sharpening.** "Make sure it works" is not a step a tool can run, and honestly it was never a great manual step either. If a page has two buttons that both say "Submit," a step that just says "click Submit" may pick the wrong one. The fix is the same discipline that makes a good manual test case: be specific. "Click the Submit button in the payment section." Expect to tighten a few steps after you watch the first runs.

**Complex data setup may need an engineer.** Some tests need a specific account state before they start: an order already in the cart, a user with a particular subscription, a database seeded with test products. Driving the browser through plain English does not create that backend state. Setting up fixtures or seed data is usually an engineering task, and you may need to pair with a developer for tests that depend on it.

**Model cost and variance are real.** BrowserBash interprets your English steps using an AI model, which means each run has a cost, and a model can occasionally read an ambiguous step two slightly different ways on two runs. Clear, specific steps reduce that variance a lot, and explicit assertions keep results honest. But plan for it: budget for the model usage your CI runs will incur, and write steps tight enough that the interpretation is not left to chance. This is not a tool you point at a vague test case and forget.

None of these are reasons to skip automating your tests. They are reasons to go in with eyes open, start with one clear test, and grow from there.

## FAQ

### Do I need to know Playwright or Selenium to use this?

No. That is the entire point. You write numbered steps in plain English in a `*_test.md` file, and BrowserBash drives the browser for you. You never write `await page.click()` or pick a CSS selector. If you can write a clear manual test case, you can write a `*_test.md` file. The framework knowledge that used to gatekeep automation is not required here.

### How do I keep passwords out of my committed test files?

Use `{{variables}}`. Write your test against a placeholder like `{{USER_PASSWORD}}` instead of the real password, and supply the actual value at run time from your CI secret store. Your committed `.md` file contains only the placeholder, never the secret. BrowserBash also masks secret values in its logs, so the real password does not appear in plain text in your run output. See the [variables and secrets tutorial](/blog/browserbash-variables-and-secrets-tutorial) for the full setup.

### What happens in CI when a test fails?

The run exits with a non-zero code (`1` for a failed step or assertion, `2` for an error, `3` for a timeout), and GitHub Actions marks the job red on its own. You do not write any code to interpret results. To find out why it failed, open `Result.md` for the plain-English step-by-step summary and watch the `--record` video and screenshots. The whole pipeline setup is covered in the [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial).

### Is BrowserBash really free?

Yes. BrowserBash is open-source under the Apache-2.0 license, built by The Testing Academy. You install it with `npm install -g browserbash-cli`. The one cost to plan for is the AI model usage that interprets your steps, which is covered in the honest-limits section above. If you are weighing the trade-offs against a traditional stack, [AI testing ROI versus Selenium maintenance](/blog/ai-testing-roi-vs-selenium-maintenance) lays out the comparison.

## Where to go next

If you take one thing from this: your plain-English test cases are already most of the work. The `*_test.md` format just lets them run on every pull request without you converting them into code.

A sensible first week looks like this. Pick one stable, high-value flow (checkout, login, signup). Write it as a `*_test.md` file, run it locally with `--record` until it passes cleanly, pull shared login into an `@import`, move secrets into `{{variables}}`, then commit it and wire that single file into CI. One green check on a pull request is enough to prove the model to your team. After that, every new test is just another `.md` file.

Explore the full command set on the [features page](/features), and work through the guided material on [learn](/learn) when you are ready to go deeper. Your test cases stay in plain English. They just start pulling their weight on every change.
