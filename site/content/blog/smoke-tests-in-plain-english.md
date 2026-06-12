---
title: "Smoke Tests in Plain English: Markdown Beats Selectors"
description: How a 4-person QA team replaced 38 brittle selector scripts with 12 markdown *_test.md files — and cut smoke-suite maintenance from hours to minutes.
date: 2026-06-12
category: case-study
---

Every selector-based smoke suite eventually develops the same disease: tests fail when the UI changes, not when the product breaks. A `data-testid` gets renamed, a button moves into a dropdown, a styling framework regenerates its class names — and Monday standup opens with twenty red tests and zero real bugs. This post walks through how a small QA team can replace that treadmill with plain-English markdown tests run by BrowserBash's `testmd` command. The team below is a composite scenario built from common patterns — the numbers are illustrative, not a customer endorsement — but every command shown is real and runnable.

## The starting point: 38 scripts, six hours a week

Picture a four-person QA team on a B2B invoicing product: two automation engineers, two manual testers. Their smoke suite is 38 selector-based scripts accumulated over three years. The product ships a UI refresh roughly every other sprint, and each one breaks five to ten locators. The automation engineers spend about six hours a week repairing selectors — time that produces zero new coverage. Meanwhile the two manual testers, who know the product flows better than anyone, can't touch the suite at all, because the suite is code.

The team decides to rewrite the smoke layer — and only the smoke layer; deep regression stays in their existing framework — as BrowserBash markdown tests.

## Tests are markdown files: `*_test.md`

A BrowserBash test is a plain markdown file whose name ends in `_test.md`. Each list item is one step. An AI agent drives a real browser, executes each step, and verifies it. `{{placeholders}}` work everywhere.

```markdown
# Login flow

- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field and press Enter
- Verify the dashboard heading is visible
- Store the logged-in user name as 'user_name'
```

Run it:

```bash
browserbash testmd run .browserbash/tests/login_test.md --headless
```

There is no selector to maintain. The agent finds "the email field" the way a human would, so when a wrapper div changes or the submit button moves, the test still passes — and it still fails when login actually breaks. That is exactly the property a smoke test should have.

## 38 scripts become 12 files

Rewriting forces a healthy question: what is this suite actually checking? Most of the 38 scripts turn out to be variations of the same flows wrapped in different setup ceremony. In plain English, the ceremony collapses. The team lands on 12 files, one per user-facing flow: login, invoice creation, invoice send, payment recording, customer search, CSV export, dashboard widgets, settings, permissions, password reset, and two cross-feature regression walks.

Shared steps live in helper files and are spliced in with `@import`:

```markdown
# Invoice creation

@import ./helpers/login.md

- Click the New Invoice button
- Fill the customer field with {{customer_name}}
- Add a line item 'Consulting' priced at 1200
- Save the invoice and verify the status badge says 'Draft'
- Store the invoice number as 'invoice_number'
```

Imported steps are inserted in place, so every test logs in identically and a login change is a one-file fix instead of a twelve-file hunt.

## Result.md: a report anyone can review

After every run, BrowserBash writes a `Result.md` next to the test file: the verdict, what happened at each step, and any values the test stored (like `invoice_number` above). The manual testers attach it to bug reports. Reviewers see test changes as readable diffs in pull requests — a smoke-test review stops being "trust me, the selectors are right" and becomes an English conversation about what the product should do.

The same files run unmodified in CI, where the exit code is the verdict — `0` passed, `1` failed, `2` error, `3` timeout:

```bash
browserbash testmd run .browserbash/tests/invoice_test.md --agent --headless --timeout 180
```

## What changed, in numbers (illustrative)

Three months in, this composite team's picture looks like:

- **Selector maintenance: ~6 hours/week → under 1 hour/week.** What remains is mostly reviewing `Result.md` after intentional UX changes.
- **Authoring: ~15 minutes for a new smoke test**, written by a manual tester as a markdown bullet list and reviewed in a normal pull request.
- **One UI refresh, zero test edits.** The release that moved CSV export into a kebab menu broke nothing, because the agent finds the control the way a user would.

The honest tradeoffs: each run is slower than a hand-tuned selector script, because a model is reasoning about the page; and vague steps produce vague verdicts, so write assertions explicitly — "Verify the status badge says 'Draft'", not "check it worked".

## Try it in five minutes

```bash
npm install -g browserbash-cli
browserbash init    # scaffolds ./.browserbash/ with variables and an example smoke_test.md
browserbash testmd run .browserbash/tests/smoke_test.md --headless
```

Point `{{base_url}}` at your staging environment in `./.browserbash/variables/default.json`, then convert your single most selector-broken smoke test first.

## FAQ

### Do I have to replace my whole suite at once?

No. The pattern that works is converting only the smoke layer — the dozen tests that answer "is this build sane?" — while keeping your selector-based framework for deep, data-heavy regression. The two coexist happily in one repo and one pipeline.

### What happens when a step fails?

The run ends with a failed verdict: exit code `1`, the failing step recorded in `Result.md` next to the test file, and — if you passed `--agent` — an NDJSON `run_end` event with the summary and final state. "Verify ..." steps fail exactly like assertions in code.

### Can people who don't code really maintain these tests?

Yes, and that's most of the payoff. Each list item is one plain-English step, so manual testers can author and review tests in pull requests. Put shared sequences in helper files and splice them in with `@import ./helpers/login.md` so nobody copy-pastes login boilerplate.
