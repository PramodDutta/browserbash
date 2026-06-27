---
title: How to Test Multi-Step Form Wizards With an AI Agent
description: "Test a multi-step wizard with an AI agent: describe each page in plain English, carry state across steps with @import, and assert the final confirmation."
date: 2026-06-27
category: testing
---

To test a multi-step wizard with an AI agent, you describe each page of the flow as plain-English steps, let the agent advance only when a step's validation passes, carry shared values (an email, an account ID, a chosen plan) across pages with `{{variables}}`, and end on a hard assertion against the final confirmation screen. With [BrowserBash](https://browserbash.com), a free open-source CLI from The Testing Academy, that looks like one Markdown file per logical chunk of the wizard, stitched together with `@import`, run end to end against a real Chrome browser. You never write a selector for the "Next" button, and you never hardcode a wait for the validation message that gates the next page. This guide shows the full pattern for checkout, onboarding, and KYC wizards, plus the honest places where it gets hard.

Multi-step wizards punish brittle tests the most. Each page validates before it lets you advance, state set on page one has to survive to page four, and a single relocated field on step two fails every test that runs the whole journey. The plain-English approach fits this shape well: the agent re-reads the live page on every step and finds the field the way a person would, so a renamed input class is something it works around rather than something that reds the build. It is not a saved script that patches itself. On each run the agent derives what to do from the page as it is rendered right then.

## What makes a wizard hard to test

A form wizard is not one form. It is a sequence of pages where each page is a gate. You cannot reach the shipping step until the cart step is valid, you cannot submit KYC until every prior document passed its check, and the data you typed on page one is expected to appear, prefilled or summarized, on the review page at the end. Three properties make this harder than a single-page form:

- **Per-step validation.** The "Continue" button is disabled, or the page refuses to advance, until the current step is internally consistent. A required field, a format check, a server-side availability check on a username. Your test has to satisfy the gate, not click past it.
- **State that travels.** An email entered in step one shows up in the order summary in step five. A plan chosen in step two changes the price shown in step four. The test has to set a value once and then assert it survived to a later page.
- **All-or-nothing failure.** Because the steps are sequential, a break anywhere kills the whole run. That is the right behavior (a wizard that breaks mid-flow is genuinely broken) but it means your test design has to make the failure point obvious.

Selector-based frameworks handle this with page objects, one per step, and explicit waits for each gate. That works, and tools like Playwright and Selenium do it well. The cost is maintenance: every page object is a hardcoded map of a page that changes, and the wizard is exactly the kind of UI that changes often (a new consent checkbox, a reordered field, an inserted upsell step). The intent-based approach trades that map for a description of what each step means, which is the thing that does not change when the markup does.

## The core pattern: one file per step, composed with @import

The clean way to model a wizard is to write each logical part of the flow as its own `*_test.md` file, then compose them. A BrowserBash test file is plain Markdown: an `# H1` title, a list of steps as `-` bullets or `1.` numbered items, and two composition primitives, `@import ./other_test.md` to pull in another file's steps and `{{variable}}` for values you want to parameterize. If you have not seen the format before, the [Markdown test files tutorial](https://browserbash.com/blog/markdown-test-files-tutorial) walks through it from scratch.

Take a checkout wizard with four pages: cart, shipping, payment, review. Model each as a file.

`cart_test.md`:

```markdown
# Cart step

1. Open https://shop.example.com/cart
2. Confirm the cart contains "Aeron Chair" priced at $1,395
3. Click Proceed to checkout
4. Verify the page heading reads "Shipping address"
```

That last step does real work. By asserting the shipping heading appeared, the test confirms the cart gate actually let it through. If the cart page had a validation error (an out-of-stock item, an empty cart) the agent would not see "Shipping address" and the step fails right there, naming the page it got stuck on.

`shipping_test.md`:

```markdown
# Shipping step

1. Fill the shipping form: name {{full_name}}, address {{street}},
   city {{city}}, ZIP {{zip}}, country {{country}}
2. Click Continue to payment
3. Verify the page heading reads "Payment"
```

Notice the variables. The shipping values are parameterized so the same file can run with a US address in one job and a non-US address in another (useful for testing region-specific validation, which is a common wizard branch). Now compose the whole journey in a top-level file.

`checkout_wizard_test.md`:

```markdown
# Checkout wizard, end to end

@import ./login_test.md
@import ./cart_test.md
@import ./shipping_test.md
@import ./payment_test.md

1. On the Review page, confirm the ship-to name shows {{full_name}}
2. Confirm the order total reads $1,395
3. Click Place order
4. Verify the page shows "Order confirmed" and an order number
```

Run it:

```bash
browserbash testmd run ./checkout_wizard_test.md
```

The `@import` lines run their steps in order, so the journey is login, then cart, then shipping, then payment, then the review-and-submit steps in this file. Each imported file ends with a verification of the next page's heading, which means the composed run naturally stops at the first gate that fails. This is the central idea: **make every step boundary an assertion**, so "the wizard advanced" is something the test checks rather than assumes. The same composition mechanics power any sequential journey; for the broader pattern across non-checkout flows see [automate multi-step workflow testing](https://browserbash.com/blog/automate-multi-step-workflow-testing).

## Carrying state across pages

The thing that separates a wizard test from four unrelated form tests is state that travels. You set a value early and assert it survived to a later page. There are two ways to carry it, and they cover different needs.

### Variables for values you supply

When you know the value up front (the name, the address, the plan you intend to pick), put it in a `{{variable}}` and supply it as JSON when you run. The same variable referenced on the shipping page and again on the review page lets you assert continuity: did the name I typed in step two show up in the summary in step five?

```bash
browserbash testmd run ./checkout_wizard_test.md \
  --vars '{"full_name":"Ada Lovelace","street":"5 Analytical Ave","city":"London","zip":"EC1A","country":"UK"}'
```

The review step `confirm the ship-to name shows {{full_name}}` now checks that "Ada Lovelace" actually propagated through three intervening pages. If the wizard dropped the name on a page transition (a real bug, and a common one) that assertion fails. Secrets get the masked shape so they never appear in logs: a payment token or a one-time KYC code passed as `{"value":"...","secret":true}` is rendered as `*****` in every log line and NDJSON event.

### Reading values the app generated

Sometimes the value you need to carry is created by the app, not by you: an order number on the confirmation page, an account ID minted during onboarding, a reference code from a KYC provider. You cannot put that in a variable ahead of time because it does not exist yet. Here you lean on the agent's ability to read the rendered page and assert against it in natural language, for example "confirm the confirmation page shows an order number in the format ABC-00000". The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, so "the order number" resolves to the text a human would read as the order number, even across an iframe or Shadow DOM boundary that a CSS selector would struggle with.

## Per-step validation and late elements

The defining feature of a wizard is that each step validates before it advances, which means your test spends a lot of its time waiting for the right thing to be true. Two BrowserBash behaviors matter here.

First, **the agent decides each action from the live page**. The default engine, Stagehand (MIT, by Browserbase), observes the DOM each step and picks the next action from what is rendered right then. The alternate `builtin` engine (an Anthropic tool-use loop) re-derives the selector on every action from a fresh snapshot, never cached across runs. In both cases there is no saved click-path that can go stale: if step three of your KYC wizard now shows a consent checkbox that was not there last month, the agent sees it and acts on it. It does not patch or keep a saved selector script between runs; it re-derives from live state, every run, which is a more honest property than a script that edits itself.

Second, **late elements are handled by waiting, not sleeping**. A validation message, a freshly enabled "Continue" button, a spinner that resolves into the next page: these arrive milliseconds to seconds after the click. BrowserBash uses Playwright's built-in auto-wait with a 15-second ceiling, so you do not write manual sleeps. You describe the gate ("verify the page heading reads Payment") and the agent waits for that condition to become true, up to the ceiling, before deciding the step passed or failed. For more on why asserting the meaning of a step beats asserting a click, see [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants).

## A worked KYC example

KYC and onboarding wizards are the strictest version of this problem: every step has a server-side check, and you genuinely cannot skip ahead. Model it the same way, one file per stage, each ending on the heading of the next stage.

`kyc_identity_test.md`:

```markdown
# KYC, identity step

1. Open https://app.example.com/onboarding/identity
2. Fill legal name {{full_name}} and date of birth {{dob}}
3. Upload {{id_document}} into the government ID field
4. Click Verify identity
5. Verify the page shows "Identity verified" within 15 seconds
6. Verify a Continue button is now enabled
7. Click Continue
8. Verify the page heading reads "Proof of address"
```

The `Verify identity` step hits a real check, and step 5 asserts the success state before the test is willing to move on. If the provider returns "verification pending" instead, the agent will not find "Identity verified" and the run fails on this stage, with a clear pointer to where. Compose identity, address, and the final review into one `kyc_wizard_test.md` with `@import`, supply the documents and personal data as variables (the sensitive ones marked secret), and you have a single command that drives the entire compliance flow. This is the same shape used in [SaaS onboarding flow testing](https://browserbash.com/blog/automate-saas-onboarding-flow-testing), where the wizard is the activation funnel rather than a compliance gate.

## Running it in CI

A wizard test earns its keep when it runs on every deploy. Add the CI flags:

```bash
browserbash testmd run ./checkout_wizard_test.md \
  --headless --agent --record \
  --vars '{"full_name":"Ada Lovelace","street":"5 Analytical Ave","city":"London","zip":"EC1A","country":"UK"}'
```

`--headless` runs without a window, `--agent` emits NDJSON so your pipeline can parse step-by-step progress, and `--record` captures a webm video and screenshots, which is exactly what you want when a wizard fails on step four of five and you need to see which gate it hit. Exit codes are pipeline-friendly: 0 pass, 1 fail, 2 error, 3 timeout, so a failed validation gate exits 1 and reds the build, while a flaky-environment timeout exits 3 and you can treat it differently. Every run writes a `Result.md` summary, and you can opt in to a cloud dashboard with `--upload` (free runs kept 15 days) or keep everything local with `browserbash dashboard`. A full feature rundown lives on the [features page](https://browserbash.com/features).

## Honest limits

This approach is good, not perfect, and wizards expose its rough edges more than most flows.

**Partial-progress recovery is the weak spot.** A wizard run is sequential, so if step three fails, the test stops there. It does not automatically resume from step three on the next run; the next run starts from the top. For most CI use that is fine (you want a clean, repeatable run from a known state) but if your wizard has an expensive or rate-limited early step, you cannot cheaply retry just the tail. The practical workaround is to keep your `@import` chunks small so that re-running the whole composed file is cheap, and to seed the application into the right state with fixtures rather than driving the early steps through the UI when you only care about a later one.

**Resumable, save-and-continue wizards are tricky.** Many onboarding flows let a user leave and come back to a half-finished wizard. Testing the resume path means setting up a partially completed account first, which the agent cannot conjure. You will need a fixture or an API call to create the half-done state, then point the test at the resume URL. The agent handles the UI from there fine, but it cannot manufacture the prior partial state on its own.

**Long flows stress small models.** A ten-step KYC wizard is a long plan to hold together. Small local models (8B and under) tend to wander on flows this long, losing the thread or repeating a step. Use a 70B-class local model (Qwen3, Llama 3.3) or a hosted model for the hard, long wizards. The model layer resolves automatically (Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, which has free hosted options), and running locally means nothing leaves your machine.

**Anti-automation gates can block you.** A CAPTCHA, a step that requires a real SMS code, or a liveness check with a webcam is not something the agent can complete on its own, the same way a human tester would need a real phone. Stub these in your test environment or accept that the test stops at that boundary.

**Non-deterministic content makes assertions softer.** If a step shows a value you cannot predict (a generated reference number, a time-stamped message), you assert its shape or presence rather than its exact text, a weaker assertion than an exact match.

None of these are unique to AI agents (a Selenium suite hits the CAPTCHA wall too) but they are the honest edges of testing wizards this way. Where the approach clearly wins is the churn case: the wizard that gains a field, reorders a step, or renames a button every sprint, and shreds a locator script every time. For deeper background on the broader testing philosophy, the [learn page](https://browserbash.com/learn) collects the concepts.

## FAQ

### How do I carry data from step one to the final confirmation page?

Put values you supply into `{{variables}}` and reference the same variable on both the early page and the review page, so the test asserts continuity (did the name I typed survive to the summary). For values the app generates, like an order number, assert against the rendered text in natural language on the confirmation page, since the agent reads elements from the accessibility tree and DOM rather than from CSS classes.

### What happens when a wizard step fails validation and won't advance?

The test fails on that step. Because each imported file ends by verifying the next page's heading, a gate that does not open means the agent never sees the expected next-page text, so the step fails right there and names the page it got stuck on. In CI that exits with code 1, reding the build, and `--record` gives you a video and screenshots of exactly which gate held.

### Can I resume a failed wizard run from the step that broke?

Not automatically. A run is sequential and the next run starts from the top, so there is no built-in resume-from-step-three. Keep your `@import` chunks small so re-running the whole file is cheap, and for save-and-continue wizards, seed the partially completed state with a fixture or API call before pointing the test at the resume URL.

### Does it patch the test automatically when the UI changes?

No. There is no saved selector script that gets patched or kept between runs. On every run the agent re-derives what to do from the live page as it is rendered right then, so a renamed button or reordered field is handled because the page is read fresh each time, not because a stored script was edited. That is a deliberately more modest and more honest property than a script that rewrites itself.
