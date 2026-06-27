---
title: Testing Modals, Toasts, and Notifications With an AI Agent
description: "Test modal and toast UI with an AI agent: assert on dialog roles, catch short-lived toasts with auto-wait, and an honest look at fast-dismiss race limits."
date: 2026-06-27
category: testing
---

To test a modal and toast reliably with an AI agent, describe what the user should see in plain English and let the agent resolve it against the live accessibility tree on each run: it finds the modal by its `dialog` role and accessible name, asserts the toast text while Playwright auto-wait keeps polling for the element, and reports a clear pass or fail. BrowserBash does this without a single CSS selector in your test. The honest caveat, covered in full below, is that a toast that paints and vanishes in a few hundred milliseconds can still lose the race, and no agent can assert on a message that is already gone.

That is the whole answer. The rest of this post shows the mechanism, gives you real `*_test.md` files you can run today, and is straight with you about where this approach struggles.

## Why modals and toasts break scripted tests

Three UI patterns, three different headaches, and selector-based suites feel all of them.

A **modal dialog** appears on top of the page, traps focus, and often renders into a portal at the bottom of the DOM rather than next to the button that opened it. Scripted tests chase it with brittle paths like `.modal-overlay > .modal-content > .confirm-btn`, which shatter the moment a component library bumps a version or a designer reorders the markup.

A **toast** (also called a snackbar) is worse, because it is designed to disappear. It slides in, shows "Saved successfully," and auto-dismisses after a few seconds. Your test has a narrow window to read it. Write a fixed `sleep(3)` and you either miss it or waste time on every run.

A **notification banner** sits somewhere persistent, a bell icon with a count or a sticky alert bar, and changes based on state you do not always control: unread counts, feature flags, server-pushed events. The locator might be stable, but what it contains is not.

The common thread is that all three are transient or conditional, and a fixed selector is a bet that the page will hold still. That bet loses a little more every sprint. The deeper survey of that trade lives in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## Tests are intent, not selectors

BrowserBash never writes a CSS or XPath path into your test. You describe the step the way a tester would say it out loud:

```bash
browserbash run "click Delete account, then in the confirmation dialog click Cancel, and verify the account is still active"
```

There is no `.modal` in that line and no page object behind it. The asset you keep is the **intent**. On the default **stagehand** engine (MIT, by Browserbase), the agent observes the live DOM at each step and decides the next action from what is actually rendered right then. On the **builtin** engine (an Anthropic tool-use loop that also captures native Playwright traces), it takes a fresh snapshot and re-derives the path on every single action, never cached across runs. Either way, a portal-rendered modal with reshuffled markup is a non-event, because there is no saved locator for the change to invalidate.

This is not magic and it is not self-patching. The agent simply re-derives from live state each run. For the full mechanism, see [how BrowserBash finds elements with the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree).

## Testing a modal dialog

Modals are the easiest of the three, because the platform already gives them a strong signal. An accessible modal exposes the `dialog` role (or `alertdialog` for confirmations), an accessible name from its heading or `aria-label`, and a focus trap. The agent finds it through that role and name, not through CSS classes, so it works across React, Vue, vanilla, or whatever portal library renders it.

Here is a `*_test.md` file for a destructive-action confirmation:

```markdown
# Delete confirmation modal

@import ./login_test.md

- Go to {{baseUrl}}/account/settings
- Click the "Delete account" button
- Verify a confirmation dialog appears with a warning about permanent deletion
- Verify the dialog has both a "Cancel" and a "Delete forever" button
- Click "Cancel"
- Verify the dialog is no longer visible
- Verify the account settings page is still shown
```

Run it:

```bash
browserbash testmd run ./delete_modal_test.md
```

Notice what this file does and does not contain. It asserts on the **role and content** ("a confirmation dialog," named buttons) rather than DOM structure. It checks the dismissal path, that closing the dialog returns you to a safe state, which is the assertion that matters for a destructive action. And it uses `@import ./login_test.md` so authenticated setup is shared, not duplicated, across your modal tests.

For an `alertdialog`-style modal, the same approach holds, and you can assert the focus trap behaviorally too:

```markdown
- Open the "Invite teammate" dialog
- Verify focus is inside the dialog
- Press Escape
- Verify the dialog closes and focus returns to the page
```

The agent reads `dialog` semantics from the accessibility tree, which is also why it can handle modals rendered inside iframes and Shadow DOM that trip up naive selector queries.

## Catching a short-lived toast

This is where auto-wait earns its keep. A toast is a race: the agent needs to look at the page in the window between the toast appearing and it dismissing itself. BrowserBash uses Playwright's built-in auto-waiting, which polls for the element and proceeds the instant it is actionable, up to a 15 second ceiling, with no manual `sleep()` in your test.

```markdown
# Save settings toast

@import ./login_test.md

- Go to {{baseUrl}}/account/profile
- Change the display name to "QA Bot"
- Click "Save changes"
- Verify a toast or snackbar appears confirming the profile was saved
- Verify the toast mentions the save succeeded
```

When the agent reaches the verify step, it does not snapshot once and give up. The auto-wait loop keeps re-checking the live state, so a toast that takes 400ms to slide in after the network round-trip is still caught, because the agent is watching for it rather than guessing a fixed delay. That is the mechanism that makes most real-world toasts assertable.

The toast's role helps too. A well-built toast uses `role="status"` or `role="alert"` (an ARIA live region), which gives the agent a clean semantic target instead of a guess at a class name. If your toasts are accessible, they are also more testable, and the same accessibility-tree reading that powers assertions is described in [natural-language assertions and how they work](https://browserbash.com/blog/natural-language-assertions-how-they-work).

A practical tip: assert the toast and the underlying state change together. The toast is the user-facing signal, but the durable truth is the saved data.

```markdown
- Click "Save changes"
- Verify a success toast appears
- Reload the page
- Verify the display name is still "QA Bot"
```

If the toast races away before the agent reads it but the reload confirms the save, you still know the feature works. You have tested the **invariant** (the data persisted), not just the animation. That habit, asserting the thing that must be true rather than the exact pixels, is the core idea in [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants).

## Testing notification banners and counts

Notification banners and bell-icon counters are the most stateful of the three. The element is usually stable; the contents are not. The agent's job is to assert on meaning, not on a hardcoded number.

```markdown
# Notification bell

@import ./login_test.md

- Go to {{baseUrl}}/dashboard
- Trigger a new notification by completing an export job
- Verify the notification bell shows an unread indicator
- Open the notification panel
- Verify a recent notification mentions the export finished
- Mark all as read
- Verify the unread indicator is cleared
```

Because the assertion is "shows an unread indicator" rather than "the badge text equals 3," the test survives a colleague's notification arriving mid-run, a count that renders as "9+", or a redesign that swaps a numeric badge for a dot. You are testing the state transition, unread to read, which is what the feature actually promises.

For a sticky alert banner (a trial-expiry warning, a degraded-service notice), the pattern is the same: describe what the banner should say and when it should appear or clear, and let the agent resolve the live element.

## Running it in CI

For pipelines, the agent flags turn this into machine-readable signal:

```bash
browserbash testmd run ./modal_and_toast_suite_test.md \
  --agent --headless --record
```

`--agent` emits NDJSON for your pipeline to parse, `--headless` runs without a display, and `--record` captures a webm video plus screenshots, which is gold for debugging a toast that failed to appear, because you can watch the run frame by frame. Exit codes are unambiguous: 0 pass, 1 fail, 2 error, 3 timeout. A `Result.md` is written per run, and you can opt into a cloud dashboard with `--upload` (free runs kept 15 days) or stay fully local with `browserbash dashboard`. Full flag and provider details, including `--provider local|cdp|browserbase|lambdatest|browserstack`, are on the [features page](https://browserbash.com/features).

On model choice: the default is `auto`, which resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist). Local keeps everything on your machine, but small local models (8B and under) get flaky on long flows. For a suite that opens several modals, dismisses toasts, and checks banners in sequence, reach for a 70B-class model (Qwen3, Llama 3.3) or a hosted model. The [learn hub](https://browserbash.com/learn) walks through setup end to end.

## Honest limits

This approach is genuinely good at modals and decent at most toasts, but it is not a silver bullet, and pretending otherwise would waste your time.

**Fast-dismiss toasts can still lose the race.** Auto-wait helps the agent catch a toast that appears late, but it cannot catch one that is already gone. If your toast paints and vanishes in a few hundred milliseconds, especially a non-blocking one that fires during a fast local response, the agent may snapshot the page a beat too late and see nothing. There is no caching trick that recovers a message that no longer exists in the DOM. The honest mitigations: assert the underlying state change as well (the reload pattern above), lengthen the toast duration in a test build, or have the app log the event somewhere durable the test can read. Treat a flaky fast toast as a signal that the toast itself may be too fleeting for a real user too.

**Rapidly stacked toasts are ambiguous.** If three toasts fire in quick succession and overlap, "verify a success toast" may match the wrong one, or the agent may read a half-rendered stack. Be specific about which message you expect, and avoid asserting on order unless the order is a real product guarantee.

**Inaccessible UI is harder to read.** The agent leans on roles and accessible names. A modal built from bare `<div>`s with no `dialog` role, or a toast with no live-region role and text baked into a background image, gives the agent weak signal. It can sometimes still infer intent from surrounding text, but reliability drops. If a flow is hard for the agent, it is usually hard for a screen-reader user too, so the fix often improves real accessibility.

**Non-deterministic notification content is a judgment call.** Server-pushed notifications that arrive on their own schedule make exact-count assertions fragile by nature. Assert on transitions and presence, not precise numbers, and accept that some notification behavior is better verified at the API or event level than through the UI.

**It is not a replacement for unit tests on toast logic.** If you need to prove a toast fires under exactly the right condition with exact copy, a component test that mounts the toast and inspects it is faster and more precise than a full browser run. This is the same fair trade you would make with Playwright or Selenium: an agent run buys resilience to UI churn and readable intent, while a scripted or unit test buys millisecond precision and total determinism. Use each where it is strongest.

## FAQ

### How does the AI agent catch a toast before it disappears?

It uses Playwright's built-in auto-wait, which polls the live page for the target element and proceeds the instant it is present and actionable, up to a 15 second ceiling, with no manual `sleep()` in your test. That means a toast appearing late, after a network round-trip, is still caught, because the agent is actively watching for it rather than guessing a fixed delay. The limit is a toast that vanishes in a few hundred milliseconds: if it is already gone when the agent looks, it cannot be asserted, so pair the toast check with an assertion on the underlying state change.

### Do I need CSS selectors or data-testid to test a modal?

No. BrowserBash finds the modal through its accessibility-tree semantics, the `dialog` or `alertdialog` role and the accessible name from its heading, not through CSS classes or `data-testid`. You write the step in plain English ("verify a confirmation dialog appears") and the agent re-derives the live element on each run. This is also why it handles modals rendered into DOM portals, iframes, and Shadow DOM that break naive selector queries.

### How do I assert on a notification count that changes between runs?

Assert on the state transition, not the exact number. Write "verify the bell shows an unread indicator" and "verify the unread indicator is cleared after marking all read" rather than "the badge equals 3." That survives a notification arriving mid-run, a "9+" overflow display, or a redesign from a numeric badge to a dot, because you are testing the unread-to-read invariant the feature actually promises rather than a brittle literal.

### Is this better than Playwright or Selenium for modals and toasts?

It is a different trade, not a strict upgrade. An agent run buys resilience to UI churn (no locators to maintain) and tests written as readable intent, which shines on portals and reshuffled markup. Scripted Playwright or Selenium, or a focused component test, buys you millisecond timing precision and full determinism, which matters for a fast toast or exact-copy assertion. Many teams use the agent for user-visible end-to-end flows and keep tight component tests for the timing-critical edges.

## Where to start

Write one `*_test.md` for your most important modal, the destructive-action confirmation, and one for your main save toast with a reload-to-confirm assertion. Run them locally, watch the `--record` video, and adjust the wording until the agent reads your UI cleanly. From there, the same intent-first pattern covers banners, counters, and the rest of your transient UI. Install with `npm install -g browserbash-cli`, and the [learn hub](https://browserbash.com/learn) has the full walkthrough.
