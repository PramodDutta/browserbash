---
title: Convert Manual Test Cases Into Committable testmd Files
description: "Step-by-step guide to convert manual test cases to testmd files: map steps to plain English, add Verify assertions, and commit tests to your repo."
date: 2026-07-24
category: guide
---

If your team keeps manual test cases in a spreadsheet, a Confluence page, or a test management tool, you already have the hardest part of automation done: someone worked out what to check and in what order. The gap is not thinking, it is format. This guide walks through how to convert manual test cases to testmd, the plain-English markdown format BrowserBash runs, step by step, including exactly where to insert `Verify` lines for the checks a tester does by eye today. By the end you have a committable `*_test.md` file that runs the same way every time, in CI or on your laptop, with no selectors written.

This is written for a manual QA team, not a team of automation engineers. If you can write a test case in a spreadsheet, you can write a testmd file: the syntax is closer to a well-written manual step than to a Playwright script, and that is by design.

## Why Manual Test Cases Are Worth Converting to testmd

Manual test cases have a real cost that is easy to underweight because it is spread across every regression cycle instead of showing up as one line item. A 40-case manual regression suite run before every release, at even 5 minutes per case, is over 3 hours of a person's attention, every time: the same clicks, the same typing, the same eyeballing of a confirmation message. None of that is testing skill, it is repetition someone happens to be doing because nothing else is doing it.

The usual objection to automating that work is the cost of writing and maintaining selector-based scripts. A Playwright or Selenium suite is a second codebase: locators break when a class name changes, and every new manual case needs an engineer to translate it before it runs unattended. That translation step is where most manual-to-automated conversion efforts stall. Teams automate the five easiest cases, then the backlog piles up because the remaining 35 need engineering time nobody has.

testmd removes the translation step. A testmd file is markdown: a title, a list of plain-English steps, optional `Verify` lines for assertions, and optional frontmatter for setup. There is no selector to write and no locator to maintain, because BrowserBash's AI agent reads the step and drives a real Chromium browser the way a human would. When you convert manual test cases to testmd, you are mostly renaming and reordering text you already wrote, not learning a new tool.

The file also stays close to what a manual tester can review. A QA lead who has never touched code can read a `*_test.md` file and confirm it matches the case it came from, because the steps are still sentences. That matters: automated suites rot when nobody but the original author can read them, and testmd keeps the readable and executable versions as the same file.

## What a testmd File Actually Looks Like

Before converting anything, it helps to see the target shape: a `#` title followed by a numbered or bulleted list of steps.

```
# Login and view account balance

1. Go to https://app.example.com/login
2. Type {{username}} into the email field
3. Type {{password}} into the password field
4. Click the "Sign in" button
5. Verify 'Account balance' text visible
```

That is the whole shape. `{{username}}` and `{{password}}` are variables, substituted at run time and masked in every log line if marked as secrets, so credentials never sit in plain text inside a committed file. The `Verify` line on step 5 is a deterministic assertion, not a step the agent interprets with judgment, and it is the piece manual testers underuse most when they first convert a case.

Files can also `@import` shared steps (a login flow used by ten other tests, for instance), and adding `version: 2` to the frontmatter gets you per-step execution with deterministic API steps mixed in with UI steps, useful when a manual case includes "the record should already exist" as a setup precondition. More on that below.

## Step 1: Audit Your Existing Manual Test Cases Before You Convert

Do not start with the first case in the spreadsheet. Sort what you have into three piles first, since they convert differently and mixing them wastes time.

**Pile one: pure UI flows.** Login, navigation, form submission, search, checkout, anything where every step happens by clicking and typing and every check is something visible on screen. These convert cleanly to a plain testmd v1 file with no special handling.

**Pile two: flows with a data setup precondition.** "Given a customer account already exists with an open invoice, the customer should see a pending balance on login." That precondition is usually created through an API or a database seed in real practice, not by manually clicking through account creation. These convert best to testmd v2, covered in Step 4.

**Pile three: flows that depend on external state you cannot fully control from the browser**, such as email OTP codes or a third-party integration outside BrowserBash's scope. Convert these last, or leave that part as a manual step for now. Forcing every case into automation on day one is how conversion projects die of scope creep; convert the straightforward majority first and ship that.

Pile one is your fastest win, the one to demonstrate value with before asking for time on piles two and three.

## Step 2: Map Manual Steps to Plain-English testmd Steps

This is the mechanical core of the conversion, closer to editing than writing. Take a manual test case written for a human tester and rewrite each line as an imperative instruction the agent can act on.

A typical manual step reads like this:

> Step 3: Enter a valid email address in the "Email" field and click "Continue". Verify that the page navigates to the password entry screen.

Split that into its parts: an action, a target, a second action, and a check. In testmd that becomes:

```
1. Type {{email}} into the "Email" field
2. Click the "Continue" button
3. Verify URL contains "/password"
```

Notice the check moved to its own `Verify` line instead of staying folded into the action, and the vague data ("a valid email address") became a variable, `{{email}}`, reused across every case that needs a valid login. That is the pattern for the whole conversion: one instruction per line, data in variables, checks separated from actions.

A few conventions that make the plain-English steps reliable:

- Name the element the way a person would describe it on screen: "the Submit button", not a CSS class or an XPath.
- Keep one action per step. "Fill in the form and submit it" is two steps in disguise.
- Reuse variables (`{{email}}`, `{{password}}`, `{{orderId}}`) instead of hardcoding data, so the same file runs against different environments by swapping a variables file.
- If a manual case describes a conditional branch, split it into two separate testmd files rather than one ambiguous one.

Most manual test cases convert at roughly one testmd line per manual step, sometimes fewer, since a step like "log in as an admin user" collapses into two or three lines once, then gets `@import`-ed into every file that needs it rather than retyped each time.

## Step 3: Where to Add Verify Steps for the Checks You Already Do By Eye

This is the step manual QA teams get wrong most often when they first convert manual test cases to testmd, and it is worth slowing down on. Every manual test case has checks buried inside it that a tester does by eye without writing them down: "the button turns green", "the page loads a confirmation", "the count goes up by one". When you convert, each of those needs to become an explicit `Verify` line, because an agent that is not told to check something will not check it on its own.

BrowserBash's `Verify` grammar compiles a fixed set of phrasings into real Playwright assertions with no model judgment involved, so the pass or fail is deterministic with expected-versus-actual evidence on failure. The patterns that map cleanly to what manual testers already check:

| What you do by eye | testmd Verify line |
|---|---|
| "Confirm you land on the right page" | `Verify URL contains "/dashboard"` |
| "Check the page title" | `Verify title is "Account Overview"` or `Verify title contains "Overview"` |
| "Look for the success message" | `Verify 'Payment successful' text visible` |
| "Make sure the Submit button is there before you click it" | `Verify 'Submit' button visible` |
| "Confirm the link to support shows up" | `Verify 'Contact support' link visible` |
| "Check the section heading changed" | `Verify 'Order History' heading visible` |
| "Count how many rows are in the results table" | `Verify count of ".result-row" is 5` |
| "Make sure the total I stored earlier still matches" | `Verify stored value 'total' equals "42.00"` |

Any `Verify` line that does not match this grammar still runs, it just falls back to agent judgment instead of a deterministic Playwright check, and BrowserBash flags it `judged: true` so you always know which checks are hard assertions. A suite trusted to block a deploy should lean as heavily as possible on the deterministic grammar; judged checks are worth revisiting to see if they can be rewritten into the patterns above.

The practical workflow: go line by line and ask, for every step, "what did I actually look at to check this off?" Every answer becomes a `Verify` line right after the action that produced it. A five-step manual case often has three or four implicit checks buried in the tester's head, and converting well means all of them become visible lines, written down for the first time.

## Step 4: Handle Setup Data Without Repeating Every Precondition by Hand

Manual test cases frequently start with a precondition a tester has to arrange before the interesting part begins: "given a customer with an existing order". In manual testing, someone either maintains seeded test accounts forever or spends the first ten minutes of every run clicking through account creation. Neither scales, and neither belongs in the UI-driven part of a test.

testmd v2 handles this by letting a file mix deterministic API steps with UI steps in the same run, against a single browser session, executed one step at a time instead of as one big fuzzy objective. Add `version: 2` to the frontmatter and the parser recognizes API steps (`GET/POST/PUT/DELETE/PATCH url`, an optional body) and an `Expect status N` check that can store a value for later steps:

```
---
version: 2
---
# Customer sees their existing order

1. POST https://api.example.com/orders with body {"customer": "{{customerEmail}}", "item": "Widget"}
2. Expect status 201, store $.id as 'orderId'
3. Go to https://app.example.com/login
4. Type {{customerEmail}} into the "Email" field
5. Type {{password}} into the "Password" field
6. Click the "Sign in" button
7. Go to https://app.example.com/orders
8. Verify 'Widget' text visible
9. Verify stored value 'orderId' equals "{{orderId}}"
```

The order gets created through the API, in milliseconds, with no model call and no browser click involved. The stored `orderId` then flows into a `Verify` line further down, so the UI check confirms the specific record created in setup is the one visible in the interface, a stronger check than most manual testers can perform by eye.

testmd v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway pointed at a Claude-compatible endpoint; it does not yet run on Ollama or OpenRouter directly. Consecutive plain-English steps still run as grouped agent blocks on the same page, so only the API and Verify steps need the strict grammar.

## Step 5: Run the Converted File and Read the Result.md

Run a converted case before committing it:

```bash
browserbash testmd run ./.browserbash/tests/login_balance_test.md
```

BrowserBash writes a human-readable `Result.md` after every run, the fastest way to sanity-check a freshly converted file, since it shows what the agent did at each step alongside the pass or fail status of every `Verify` line, with evidence for failures. If a step failed because the agent could not find "the Continue button" and the real label is "Next", that mismatch is visible immediately and the fix is a one-word edit.

Run each newly converted case two or three times before trusting it. Flakiness at this stage is almost always one of three things: an ambiguous element description, a `Verify` line loose enough to fall back to judged mode, or a timing issue where the page needs a moment to settle. All three are fixable in the markdown file itself.

For CI, `--agent` mode emits NDJSON, one JSON event per line, built for machine parsing instead of prose:

```bash
browserbash testmd run ./.browserbash/tests/login_balance_test.md --agent --headless --timeout 120
```

Exit code 0 means passed, 1 failed, 2 error or infra problem, 3 timeout, which is what a pipeline gate checks, no output parsing required.

## Step 6: Commit It and Wire the Converted Suite Into CI

Once a handful of converted cases run clean, put them under version control like any test code. A typical layout is `.browserbash/tests/` inside the repo, one file per converted case, with shared blocks like login pulled into a separate file and brought in with `@import`.

For a whole regression suite, `run-all` runs a folder of testmd files with memory-aware parallelism and failed-first, slowest-first ordering, so the suite gets faster on repeat runs:

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml --budget-usd 3
```

The `--budget-usd` flag is worth setting on any converted suite that leans on a paid model, since it stops launching new tests once the budget is crossed and reports the rest as skipped instead of silently burning spend. Once the conversion is stable, [BrowserBash's official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) installs the CLI, runs the suite, uploads NDJSON and JUnit artifacts, and posts a self-updating PR comment with the verdict table, generally the moment a converted suite stops being "the automation project" and starts being "the tests that run on every PR."

Worth knowing before that first CI run: the replay cache means a green run records its actions, and the next identical run replays them with close to zero model calls. That keeps a converted suite affordable on every commit instead of only nightly.

## A Worked Example: Converting a Real Manual Test Case

Here is a complete before-and-after, the kind of case a manual QA team runs every release.

**Manual test case (as written in a spreadsheet):**

> Title: Password reset sends confirmation email
> 1. Navigate to the login page and click "Forgot password?"
> 2. Enter a registered email address and click "Send reset link"
> 3. Verify a confirmation message appears on screen
> 4. Verify the URL changes to a "check your email" page

**Converted testmd file:**

```
# Password reset sends confirmation email

1. Go to https://app.example.com/login
2. Click the "Forgot password?" link
3. Type {{registeredEmail}} into the "Email" field
4. Click the "Send reset link" button
5. Verify 'Check your email' text visible
6. Verify URL contains "/reset/sent"
```

Six lines, no selectors, and the two implicit checks the tester was doing by eye are now explicit `Verify` lines with structured evidence instead of someone remembering to look. That is the entire conversion in miniature: split actions from checks, name elements the way a person would, pull data into variables, and write down every visual confirmation the tester performed.

## Common Mistakes When Converting Manual Test Cases to testmd

A few patterns show up repeatedly in early conversions and are worth watching for directly.

**Folding a check into an action step.** "Click Submit and verify the confirmation appears" reads fine as one manual step but should be two testmd lines, a click and a `Verify`, since separating them is what makes the check deterministic instead of implicit.

**Vague element references.** "Click the button" when there are three buttons on the page produces ambiguous behavior. A human eye disambiguates instantly; a testmd file needs the button named by its visible label.

**Skipping the implicit checks.** The biggest gap between a converted file and the manual case it came from is missing `Verify` lines for things the tester checked by habit but never wrote down. Go back through the original case a second time hunting for unwritten checks.

**Hardcoding data instead of using variables.** A case with a literal email address baked into the step text works once, then breaks the moment that account gets deleted or the environment changes. Variables cost one extra line and pay for themselves the first time you run the test against staging and production.

**Converting everything at once.** Piles two and three from Step 1 take longer per case. Converting the easy pile first and shipping it is what keeps a conversion project alive past week one.

## When Manual Testing Still Makes Sense

Not everything belongs in a converted file, and it is worth saying plainly where manual testing stays the better tool. Exploratory testing, where a tester deliberately looks for the unexpected rather than confirms a known flow, does not convert to a scripted format by definition; that is a different discipline than regression checking. Subjective visual judgment ("does this feel right") is still best done by a person, since `Verify` assertions check for specific elements and text, not aesthetic quality. And very small local models, roughly 8B and under, can be flaky on long conversions run fully offline with Ollama; the sweet spot for anything nontrivial is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a hosted model for harder flows.

The realistic target for most manual QA teams is converting the repetitive regression cases, the ones run before every release that check known, stable flows, and keeping true exploratory sessions as manual work a person does with intent. That split is not a compromise, it is what saves time: automating the boring majority frees the tester's attention for the work that genuinely needs human judgment.

Two more resources worth a look while converting a suite: the [BrowserBash learn hub](https://browserbash.com/learn) covers the testmd grammar in more depth, and the [tutorials section](https://browserbash.com/tutorials) has runnable examples. If you already have Playwright specs alongside your manual cases, `browserbash import` is a separate, deterministic path for that half of the work.

## FAQ

### How long does it take to convert a manual test case to testmd?

A straightforward UI flow with 5 to 8 manual steps typically converts in 10 to 15 minutes once you know the pattern. Cases with data setup preconditions or shared login flows take longer the first time but get faster once you have a reusable `@import` block for the common parts.

### Do I need to know Playwright or Selenium to write testmd files?

No. testmd steps are plain-English instructions that BrowserBash's AI agent interprets by looking at the page, not selectors or locator code. `Verify` lines use a fixed grammar of readable phrases like "text visible" or "URL contains", so a manual tester who has never written code can write and read a complete file.

### What happens to checks I convert that don't fit the Verify grammar?

They still run, just interpreted by the AI agent's judgment instead of compiled to a deterministic assertion, and BrowserBash marks that result `judged: true` in the run output so you can always see which checks are hard assertions and which are not. It is worth revisiting judged checks to see if rewriting them slightly gets them into the deterministic grammar.

### Can I convert manual test cases that require test data setup, like an existing order or account?

Yes, using testmd v2: add `version: 2` to the file's frontmatter and use API steps (`POST url with body {...}` plus `Expect status N, store $.path as 'name'`) to create the setup data deterministically before the UI steps run, all in one browser session. This avoids re-scripting the setup UI every time and lets you check the exact record you created, not just any matching one.

If you want to try this on your own regression suite before converting everything by hand, install the CLI with `npm install -g browserbash-cli` and run a single converted case to see the `Result.md` output firsthand. An account is optional, [sign up](https://browserbash.com/sign-up) only if you want the free cloud dashboard for shared visibility across a team.
