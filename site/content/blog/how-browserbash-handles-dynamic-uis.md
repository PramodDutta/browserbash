---
title: How BrowserBash Handles Dynamic UIs That Change Between Runs
description: "How BrowserBash runs tests that survive UI changes: intent steps resolved against the live DOM on every run, Playwright auto-wait for late elements, plus an honest look at where it still struggles."
date: 2026-06-26
category: guide
---

This is the question senior testers keep asking, and it is the right one to ask. Four different people raised some version of it in public within a week of launch: "How does it handle dynamic pages where the UI changes between runs?" If you have maintained a real Selenium or Playwright suite, you already know why. The UI moving is not an edge case. It is Tuesday. A redesign, an A/B test, a component-library bump, a feature flag flipping on for half your users, and suddenly the locator you wrote last sprint points at nothing.

So here is the honest, mechanism-level answer to what BrowserBash actually does when the page is not the same on run two as it was on run one. No hand-waving, and a clear section at the end on where it still struggles.

## Why selector-based tests break when the UI moves

A scripted test makes a promise at authoring time. You decide, today, that the submit button is `button[data-testid="checkout-submit"]`, and you bake that path into the test. The runtime never reconsiders. When the markup changes, the script does not notice and adapt. It throws a `TimeoutError` because the selector no longer matches, and your pipeline goes red for a reason that has nothing to do with a real bug.

Three forces make this constant rather than rare:

- **Selector churn.** Class names, IDs, and DOM structure shift on every redesign or library upgrade. Your locators rot quietly until a run fails.
- **Conditional rendering.** A cookie banner, a "new feature" tooltip, a role-based menu, or an experiment variant changes what is on the page between runs, even with no code change on your side.
- **Async timing.** Content that loads late races your script. You paper over it with `sleep()` calls, which are flaky and slow.

The deeper survey of this trade lives in [agentic testing explained](https://browserbash.com/blog/agentic-testing-explained). The short version: a fixed selector is a bet that the page will not change, and that bet loses a little more every sprint.

## What BrowserBash stores instead: intent, not locators

BrowserBash never writes a CSS or XPath selector into your test. You describe the step the way a human tester would say it:

```bash
browserbash run "log in as standard_user, add the first product to the cart, and verify the cart shows one item"
```

There is no `data-testid` in that line and no page object behind it. The test asset is the **intent**, not a path through the DOM. That single design choice is what makes a UI change between runs a non-event: there is no hardcoded locator sitting in the test for the change to invalidate. The forms case study in [AI form-filling automation](https://browserbash.com/blog/ai-form-filling-automation-guide) shows the same idea on multi-step wizards where fields appear and disappear.

## What actually happens at run time

This is the part that matters, so here is the real mechanism rather than a marketing sentence.

BrowserBash ships two engines. The default is **stagehand** (MIT, by Browserbase). The alternative is a **builtin** engine, an Anthropic tool-use loop that also captures native Playwright traces. Both resolve actions against the page as it exists during the run, not against a path you saved earlier.

- On the **stagehand** engine, the agent observes the live DOM at each step and decides the next action from what is actually rendered right then. If the "Add to cart" button moved into a dropdown, changed color, or got new markup, the agent still sees a control that means "add to cart" and clicks it. The objective did not change, so the step does not break.
- On the **builtin** engine, the targeting is even more explicit about this: it takes a fresh snapshot of the page and re-derives the selector on every single action. Nothing is cached across runs. The path is computed from the current page, so a reshuffled layout resolves on the next run without you touching the test.

The reason this tolerates change is simple. A scripted test asks "is the element still at this path?" BrowserBash asks "what on this page matches this intent, right now?" The first question fails the moment the path changes. The second one keeps working as long as the thing you described still exists in some form.

## Late-loading and async elements

Dynamic does not only mean "moved." It also means "not there yet." BrowserBash handles late-loading elements with Playwright's built-in auto-waiting rather than fixed sleeps. The `wait_for` behavior polls for the element and proceeds the instant it is actionable, up to a 15 second ceiling, so a spinner, a lazy-loaded table, or a slow XHR does not produce a false failure and does not cost you a hardcoded `sleep(5)` on every run. You get the resilience without the wasted seconds.

## Flows that change shape, not just elements

For anything past a single objective, you commit a Markdown test file. Each list item is a step in plain English, with `@import` for shared setup like login, and `{{variables}}` for data with secret masking in the logs:

```markdown
# Checkout smoke test

@import ./login_test.md

- Go to {{baseUrl}}
- Add the first product to the cart
- Proceed to checkout and fill shipping details
- Verify the page shows "Thank you for your order!"
```

```bash
browserbash testmd run ./checkout_test.md
```

Because steps are expressed as goals, a flow that grows an extra confirmation dialog or reorders two screens often still passes without an edit: the agent pursues each step against the live page. The B2B dashboard walkthrough in [AI testing for SaaS dashboards](https://browserbash.com/blog/ai-testing-for-b2b-saas-dashboards) covers the virtualized-table and role-based-content cases specifically.

## Where it still struggles, honestly

This is the section that should make you trust the rest. BrowserBash is not magic, and pretending it self-heals anything would be a lie. A few real limits:

- **Model quality is the ceiling.** The agent is only as good as the model reading the page. Small local models (roughly 8B parameters and under) get flaky on long, multi-step objectives: they lose the thread, repeat actions, or claim success that did not happen. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. BrowserBash defaults to `auto`, which resolves Ollama first, then your `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so you can start local and reach for a bigger brain when a flow is hard.
- **Ambiguous intent needs sharper wording.** "Click the button" on a page with six buttons is a coin flip. "Click the green Checkout button in the cart summary" is not. The agent reads meaning, so give it meaning.
- **It re-derives, it does not patch a script.** This is the key distinction from "self-healing" tools. Self-healing automation keeps a fixed selector-based script and swaps in alternate locators when one breaks. BrowserBash has no durable selector to heal: it reasons about the goal from scratch each run. That is more tolerant of large UI changes, but it is a different model, not a more durable version of the same one. A genuinely new step in a flow still needs to be written.

That trade, more resilience and faster authoring in exchange for model cost and some run-to-run variance, is the whole point. Spend it where the UI changes fastest, and keep deterministic scripts on the unchanging money paths. Most mature teams run both. The [agent-browser comparison](https://browserbash.com/blog/agent-browser-alternative) digs into the intent-level versus ref-based distinction if you want the deeper read.

## Try it on your flakiest flow

The fastest way to feel the difference is to point it at the one flow whose script breaks every other sprint. Express it as a single objective, watch it with `--record`, then promote it to a committed `_test.md` once it passes reliably:

```bash
npm install -g browserbash-cli

browserbash run "go to the demo store, log in, add an item to the cart, and verify the cart count is 1" --record
```

No API key, no credit card, nothing leaves your machine on the local default. The [features page](https://browserbash.com/features) lists every flag, and [Learn](https://browserbash.com/learn) walks through your first run.

## FAQ

### How does BrowserBash handle dynamic UIs that change between runs?

It never stores a CSS or XPath selector in your test. You write each step as intent, like "click the submit button", and at run time the agent reads the live DOM and resolves the target against whatever is actually on the page that run. If the layout shifts between runs, there is no hardcoded path to miss. Late-loading elements are handled by Playwright auto-wait (15s) instead of fixed sleeps, and multi-step flows live in committable `_test.md` files.

### Does it self-heal broken tests like other AI tools claim?

Not in the self-healing sense, and that is a deliberate distinction. Self-healing automation keeps a fixed selector-based script and swaps in alternate locators when one breaks. BrowserBash has no durable selector to repair: it reasons about the goal from scratch on each run by reading the live page. That tolerates large UI changes better than locator-swapping, but a genuinely new step still needs to be authored.

### What model do I need for reliable runs on changing pages?

Small local models (8B parameters and under) get flaky on long or ambiguous flows. The sweet spot is a 70B-class local model (Qwen3 or Llama 3.3) or a capable hosted model. BrowserBash defaults to `auto`, resolving local Ollama first, then Anthropic, then OpenRouter, so you can start free and local and scale up only when a flow is genuinely hard.

### How does it deal with elements that load late?

It uses Playwright built-in auto-waiting, which polls for the element and proceeds the moment it is actionable, up to a 15 second ceiling. You do not write `sleep()` calls, and a slow spinner or lazy-loaded table does not produce a false failure.

BrowserBash is open source under Apache-2.0 and built by The Testing Academy. Install it, point it at a flow that keeps breaking, and watch it adapt: `npm install -g browserbash-cli`.
