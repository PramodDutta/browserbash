---
title: Markdown Tests Your PM Reads, Reviews, and Edits
description: "Tests as living documentation: a product manager reviews and edits *_test.md files in pull requests, with an @import shared-steps library."
date: 2026-06-12
category: case-study
---

Every team has the document. The onboarding wiki, the "how checkout works" page, the spec with screenshots from two redesigns ago. It is always stale, because the only artifact forced to stay current — the test suite — is unreadable to half the team. Gherkin promised to fix this and mostly didn't: the English was readable, but every line needed a step definition, so the glue code rotted instead. BrowserBash's `*_test.md` files take another run at the idea with one structural difference: there are no step definitions. The English is the test, executed directly by an AI agent driving a real browser.

## An illustrative team

The team here is illustrative — a composite of small product teams — but the files and commands are real. Picture a B2B invoicing product: four engineers, one QA engineer, one product manager. The suite is 23 `*_test.md` files plus six shared helper files, and the PM is a required reviewer on any PR touching `.browserbash/tests/`. That last detail is the whole story.

## What the PM sees in a pull request

```markdown
# Login flow

- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field and press Enter
- Verify the dashboard heading is visible
- Store the logged-in user name as 'user_name'
```

Each list item is one verified step. The `{{placeholders}}` come from JSON files in `./.browserbash/variables/`, so the same test runs against staging and production-like environments, and secrets marked `{"value":"...","secret":true}` are masked as `*****` in all output. There is nothing to decode — the PM reads the test the way they would read a spec, because it is one.

## The PR moment

Mid-sprint, the team renames the checkout button from "Place order" to "Confirm purchase". The diff the PM reviews includes a one-line test change:

```diff
- - Click the 'Place order' button and verify the confirmation page loads
+ - Click the 'Confirm purchase' button and verify the confirmation page loads
```

The PM notices the new confirmation banner isn't covered and leaves a GitHub suggestion adding a step: `- Verify the 'Invoice scheduled' banner is visible`. The QA engineer accepts it. A product manager just contributed an executable test assertion without opening a test framework. Illustrative, yes — but nothing in it requires more than editing markdown in a pull request.

## A shared steps library with @import

Plain English still deserves DRY. Repeated preludes — log in, open the module — live in helper files and get spliced in with `@import`:

```text
.browserbash/
├── tests/
│   ├── helpers/
│   │   └── login.md
│   ├── checkout_test.md
│   └── invoices_test.md
└── variables/
    └── staging.json
```

`helpers/login.md` is just a markdown list. By convention it skips the `_test.md` suffix — it is shared steps, not a standalone test:

```markdown
- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field and press Enter
- Verify the dashboard heading is visible
```

Tests import it where the steps belong:

```markdown
# Create an invoice

@import ./helpers/login.md

- Open {{base_url}}/invoices/new
- Fill the client field with 'Acme Ltd' and the amount with '450'
- Click the 'Create invoice' button
- Verify the 'Invoice scheduled' banner is visible
- Store the new invoice number as 'invoice_id'
```

At run time the helper's steps are spliced in place at the `@import` line. The field rename you will inevitably ship gets fixed once, in one helper — not in 23 files.

## Run it, and the documentation proves itself

```bash
browserbash testmd run .browserbash/tests/invoices_test.md --headless
```

After every run, a `Result.md` report is written next to the test file: the verdict plus extracted values like `invoice_id`. The PM in our scenario reads the nightly `Result.md` files the way they used to read a status channel. In CI, add `--agent --timeout 180` and the exit code gates the merge: `0` passed, `1` failed, `2` error, `3` timeout. Living documentation stops being aspirational when the doc fails the build the moment it stops being true.

Outcomes, illustratively: new-hire onboarding now starts with reading `tests/` top to bottom — about 25 minutes for 23 files — and the "how does checkout work again?" questions dropped to near zero, because the answer is a file anyone can open, run, and trust.

## FAQ

### Isn't this just Gherkin with extra steps?

It is Gherkin with fewer steps — specifically, zero step definitions. There is no glue layer mapping English to code; the agent interprets each markdown step directly against a real browser, so the readable layer cannot drift away from the executable one.

### What happens when a step is ambiguous?

Write checkpoints. `Verify ...` steps turn intent into assertions, and a false verification fails the run with exit code 1, with `Result.md` showing where things derailed. Treat fuzzy wording like a fuzzy requirement — tighten the sentence.

### How does @import behave mechanically?

`@import ./helpers/login.md` splices that file's steps into the test at exactly that line, in order. Keep helpers small and imperative — one action per line — and skip the `_test.md` suffix so they read as shared steps rather than standalone tests.
