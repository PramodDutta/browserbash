---
title: How to Test a Vue and Nuxt App With Natural Language Tests
description: "Test a Vue Nuxt app with natural language tests: assert v-if toggles, transition groups, and reactive form state by visible text and ARIA role, no selectors."
date: 2026-06-27
category: testing
---

To test a Vue 3 or Nuxt app with BrowserBash, you write Markdown `*_test.md` files that describe the intent of each flow in plain English, then let the agent drive a real browser and verify the result against what is actually rendered. Because Vue reactivity swaps DOM nodes (`v-if`), toggles visibility (`v-show`), and animates list changes (`<transition-group>`), you assert on visible text and ARIA role rather than CSS classes, so a refactor from `<div class="alert">` to `<UAlert>` does not break the test. BrowserBash reads the accessibility tree plus the live DOM on every step, waits on Playwright auto-wait for late elements, and decides the next action from what is on screen right then. That maps cleanly to Vue, where the DOM after a state change is the only source of truth that matters. This guide shows the test files, the commands, and the honest limits around transition timing and hybrid rendering.

## Why Vue and Nuxt are a good fit for intent-based tests

Vue's whole model is that state drives the DOM. A `ref` flips, a computed recalculates, and the rendered tree changes. The problem for traditional testing is that the *shape* of that tree (tag names, class names, component wrappers) is an implementation detail that changes constantly: you swap a hand-rolled modal for a Nuxt UI `<UModal>`, you rename a BEM class, you wrap an input in a new layout component. Selector-based suites feel every one of those changes as a broken test, even when the user-facing behavior never moved.

BrowserBash sidesteps that by testing intent, not structure. You say "fill the email field and submit," and the agent finds the email field by its accessible name and role (a textbox labeled Email), not by `input#email.form-control`. When the success message appears, you assert that the words "Account created" are visible, not that an element with class `.success-banner` exists. The Vue refactor that renames the class is invisible to the test, because the test never knew the class existed. For the broader argument, see [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants).

This is not magic and it is not self-correcting. The agent re-derives the element from live state on every action; it does not keep a saved selector script that it patches over time. Each run reads the page fresh. With the `builtin` engine, that snapshot is re-derived from a fresh accessibility tree on every action and never cached across runs. With the default `stagehand` engine, the agent observes the live DOM each step and chooses the next action from what is rendered at that moment. Either way, the contract is the same: the rendered page is the truth.

## Install and a first run against a Nuxt dev server

Install the CLI globally:

```bash
npm install -g browserbash-cli
```

Start your Nuxt app the usual way (`npm run dev`, typically on port 3000), then point a one-off objective at it:

```bash
browserbash run "Go to http://localhost:3000, open the signup page, \
  and confirm the email and password fields are visible"
```

The `run` command is the fastest way to sanity-check that the agent can see and reason about your app before you commit anything to a file. For anything you want to keep and re-run, move to a Markdown test, which is the durable, reviewable form.

## Writing a Vue form test in Markdown

A BrowserBash test is a Markdown file. A `#` heading is the title, ordered or unordered list items are the steps, `{{variables}}` get interpolated (and masked in logs when they hold secrets), and `@import` lets you compose shared flows. Here is a multi-step Vue form test that exercises reactive UI updates.

```markdown
# Signup form reactive validation

1. Go to {{baseUrl}}/signup
2. Confirm the heading "Create your account" is visible
3. Click the "Create account" button without filling anything
4. Confirm an error "Email is required" is now visible
5. Type "{{email}}" into the field labeled "Email"
6. Confirm the "Email is required" error is no longer visible
7. Type "abc" into the field labeled "Password"
8. Confirm a hint "Password must be at least 8 characters" is visible
9. Type "{{password}}" into the field labeled "Password"
10. Confirm the "Password must be at least 8 characters" hint disappears
11. Click "Create account"
12. Confirm the text "Welcome, {{email}}" is visible
```

Steps 4, 6, 8, and 10 are the interesting ones for Vue. They assert that reactive validation messages appear and disappear in response to input. In a Vue component, those messages are almost always `v-if`ed on a computed validity flag, so the DOM node literally does not exist until the condition is true. BrowserBash asserts on the *visible text*, so "is no longer visible" passes when the node is removed (`v-if`) and also when it is hidden (`v-show`), which is exactly what you want: the user cannot see it either way.

Run it with variables supplied inline:

```bash
browserbash testmd run ./signup_test.md \
  --var baseUrl=http://localhost:3000 \
  --var email=jess@example.com \
  --var password=correct-horse-battery
```

Variables that look like credentials are masked in the run log, so `password` will not leak into your CI output or the `Result.md` written per run.

### Composing flows with @import

Most apps gate features behind login. Rather than copy the login steps into every test, factor them out:

```markdown
# login_test.md
1. Go to {{baseUrl}}/login
2. Type "{{email}}" into the field labeled "Email"
3. Type "{{password}}" into the field labeled "Password"
4. Click "Sign in"
5. Confirm the text "Dashboard" is visible
```

Then import it at the top of a downstream test:

```markdown
# Create a project from the dashboard

@import ./login_test.md

1. Click "New project"
2. Type "Q3 Launch" into the field labeled "Project name"
3. Click "Create"
4. Confirm "Q3 Launch" appears in the project list
```

This keeps each test focused on one behavior and keeps shared setup in one place. It is the same instinct that makes Markdown tests double as [living documentation](https://browserbash.com/blog/markdown-tests-living-documentation): a reviewer reads the steps and understands the flow without opening the app.

## Handling v-if versus v-show

These two Vue directives produce different DOM outcomes, and it is worth knowing how each interacts with the agent.

`v-if` adds and removes the element from the DOM. When the condition is false, the node is gone: not in the DOM, not in the accessibility tree, not findable. When you assert "Confirm X is visible," the agent waits (Playwright auto-wait, up to a 15 second ceiling) for the node to appear, which covers the brief gap while Vue patches the DOM after a state change. When you assert "Confirm X is no longer visible," removal satisfies it immediately.

`v-show` keeps the element in the DOM and toggles `display: none`. A hidden `v-show` element is present in the DOM but not visible and, for accessibility purposes, not exposed. BrowserBash treats it as not visible, which again matches the user's experience. The practical takeaway: write your assertions in terms of what the user sees ("is visible," "is no longer visible," "appears"), and both directives behave the way you expect without you having to know which one the component used.

This is the core reason intent-based assertions survive Vue refactors. A developer can switch a panel from `v-if` to `v-show` for a performance reason, and your test does not change, because the test was never coupled to the mechanism, only to the visible outcome. For more on how the agent copes with shifting DOM, see [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## Transition groups and animated lists

`<transition-group>` is where Vue testing gets genuinely tricky, and it is worth being honest about it. A transition group animates items entering, leaving, and moving in a list: a to-do item slides in, a deleted row fades out over 300ms, the remaining rows reflow. During that animation window the DOM is in an in-between state. A leaving element may still be present (mid fade-out) with a `*-leave-active` class for the duration of the transition.

Here is a test against an animated list:

```markdown
# Todo list add and remove with transitions

@import ./login_test.md

1. Go to {{baseUrl}}/todos
2. Type "Buy milk" into the field labeled "New todo"
3. Press Enter
4. Confirm "Buy milk" is visible in the todo list
5. Type "Walk the dog" into the field labeled "New todo"
6. Press Enter
7. Confirm "Walk the dog" is visible in the todo list
8. Click the delete button on the "Buy milk" item
9. Confirm "Buy milk" is no longer visible in the todo list
```

Step 8 to 9 is the soft spot. If the fade-out runs for, say, 400ms, the "Buy milk" text is still on screen for a fraction of a second after the click. BrowserBash leans on Playwright auto-wait, which will keep checking until the element is genuinely gone, so for typical transitions in the few-hundred-millisecond range this resolves correctly without any manual sleep. The agent does not need you to insert a wait; it polls until the assertion is satisfiable or the 15 second ceiling is hit.

Where it can get flaky: very long transitions, transitions chained on `transitionend` that depend on the browser not being throttled, or assertions that try to pin down the *intermediate* visual state ("confirm the row is half-faded"). The agent reasons about discrete, settled states well; it does not frame-step an animation. If you find yourself wanting to assert on a mid-animation frame, that is a signal to test the component's animation in a unit test (Vitest plus Vue Test Utils with fake timers) and let BrowserBash assert the before-and-after states, which is what a user actually perceives.

## Nuxt hybrid rendering: SSR, islands, and hydration

Nuxt can render a route server-side, client-side, statically, or as a hybrid with route rules, and it hydrates server-rendered HTML on the client. This matters for testing in two ways.

First, SSR means the initial HTML often already contains the content, so the agent sees it fast. That is good. But hydration is a second phase: the server HTML arrives, then Vue attaches event listeners and makes the page interactive. There is a brief window where text is visible but clicks may not yet do anything because the handler is not wired up. If you click immediately on a freshly loaded SSR page, you can occasionally act before hydration completes.

The mitigation is the same auto-wait behavior, plus writing steps that confirm interactivity through an observable result rather than assuming it. Instead of "click the menu, then immediately assert the panel," prefer a flow where the click's success is verified by a visible change, and let the agent retry the chain if the first click landed pre-hydration. In practice, asserting the outcome ("Confirm the menu panel is visible") rather than the mechanism gives the agent room to recover.

Second, Nuxt's `<NuxtIsland>` and server components render parts of the page on the server with no client JS. Those islands show up in the DOM and accessibility tree like any other content, so assertions on their text and roles work normally. The thing to watch is data-dependent islands that fetch on the server: if the upstream data is slow, the island content arrives late, and you want your assertion to wait for the text rather than for a fixed timer. "Confirm the product price is visible" with auto-wait is more robust than guessing a delay.

A representative Nuxt route test:

```markdown
# Product page renders price and add-to-cart (SSR route)

1. Go to {{baseUrl}}/products/{{sku}}
2. Confirm the product title is visible
3. Confirm a price starting with "$" is visible
4. Click the button labeled "Add to cart"
5. Confirm the cart count shows "1"
6. Confirm a message "Added to cart" is visible
```

Step 5 asserts a reactive update (the cart count is almost certainly a Pinia or `useState` value rendered reactively), and step 6 asserts a transient confirmation that itself may be a transition. Both are expressed as visible outcomes, which is the pattern that holds up across SSR, client-rendered, and island variants of the same route.

## Running in CI

For pipelines, run headless and emit machine output. The `--agent` flag streams NDJSON (one JSON object per line), and exit codes carry the verdict: 0 pass, 1 fail, 2 error, 3 timeout. A minimal GitHub Actions step:

```yaml
- name: Run BrowserBash Vue tests
  run: |
    npm run build && npm run preview &
    npx wait-on http://localhost:3000
    browserbash testmd run ./tests/signup_test.md \
      --headless --agent --record \
      --var baseUrl=http://localhost:3000 \
      --var email=ci@example.com \
      --var password=$TEST_PASSWORD
```

`--record` captures a `.webm` video and screenshots, which is invaluable when a transition-timing failure shows up only in CI and you need to see what the agent saw. A `Result.md` is written per run as a human-readable summary. You can optionally `--upload` to the cloud dashboard (free runs kept 15 days) or run `browserbash dashboard` locally to browse results without sending anything off the machine.

Testing the preview build (`npm run preview` over `npm run dev`) matters for Nuxt specifically: dev mode has extra hydration warnings, slower first loads, and HMR overhead that you do not want your tests racing against. Test the artifact that ships.

## Choosing a model

The default model resolution is `auto`: it tries Ollama first (local, nothing leaves the machine), then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (which has free models available). For Vue flows specifically, model capability matters more than for static pages, because the agent has to reason about state changes and decide whether a reactive update has settled. Small local models (8B and under) tend to get flaky on long multi-step flows, exactly the kind a Vue form or a multi-route Nuxt journey produces. For hard flows, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model is more reliable. Keep the small local model for short smoke checks and reach for the larger one when a flow has many reactive steps.

## Honest limits

Here is where BrowserBash struggles on Vue and Nuxt apps, stated plainly.

**Mid-animation assertions.** As covered above, the agent reasons about settled states, not animation frames. If your test value is in the visual feel of a transition, a unit test with fake timers is the right tool, not a browser agent.

**Very fast or very slow transitions.** A transition shorter than the agent's perception loop can be missed (the element appeared and vanished between observations), and a transition longer than expected can push an assertion toward the 15 second ceiling. Most transitions in the 150 to 400ms range are fine; the extremes need care. These ranges are illustrative, not measured guarantees, and they depend on machine load and model latency.

**Hydration races on click-immediately flows.** SSR pages can be visible before they are interactive. Asserting outcomes rather than assuming instant interactivity mitigates this, but a pathologically slow hydration (huge bundle, slow CI runner) can still cause an early click to no-op. Recording the run helps you spot it.

**Hidden reactive state with no visible signal.** If a Vue state change has no rendered consequence (you set a ref that nothing displays), there is nothing for the agent to assert, by design. BrowserBash tests what a user can perceive. For invisible internal state, a unit or component test is the right layer.

**Determinism.** An LLM-driven agent makes a decision each step, so two runs are not byte-identical the way a hardcoded Playwright script is. For most flows this is a non-issue because the assertions are explicit, but it is a real difference from a deterministic selector script and worth knowing. Playwright and Selenium remain excellent when you want exact, repeatable, selector-pinned control, and BrowserBash is not trying to replace that for every case. It is strongest where the UI churns and selector maintenance dominates, which is precisely the Vue refactor treadmill. For the underlying approach, see [natural-language browser automation](https://browserbash.com/blog/natural-language-browser-automation-cli) and the full [features overview](https://browserbash.com/features).

## FAQ

### Do I need to update tests when I refactor a Vue component's markup?

Usually not. Because assertions reference visible text and ARIA role, renaming a class, wrapping an input in a new layout component, or switching a panel from `v-if` to `v-show` does not change the test. You only update a test when the user-facing behavior changes, for example when a label's text or a flow's steps actually change. That is the whole point of testing intent over structure, though it is re-derived from live state each run, not a saved script that patches itself.

### How does the agent know a reactive update has finished before asserting?

It does not guess a timer. It uses Playwright's built-in auto-wait, polling the page until the assertion is satisfiable or the 15 second ceiling is reached. For a `v-if` element appearing after a state change, or a `<transition-group>` item leaving, the agent keeps checking until the DOM and accessibility tree reflect the settled state. You do not write manual sleeps.

### Can BrowserBash test Nuxt server-rendered and island content?

Yes. SSR and `<NuxtIsland>` content appears in the DOM and accessibility tree like any other content, so text and role assertions work normally. Watch for data-dependent islands that fetch on the server: write assertions that wait for the visible text (auto-wait handles the delay) rather than assuming a fixed render time. For interactivity on SSR routes, assert outcomes so the agent can recover from a click that landed before hydration finished.

### Should this replace my Vitest component tests?

No, they complement each other. Vitest with Vue Test Utils is the right place for fast, isolated checks of computed properties, emitted events, animation timing with fake timers, and invisible state. BrowserBash covers the end-to-end, in-a-real-browser flows where a user moves through multiple components and routes and you want to verify the assembled experience, including reactive updates and Nuxt rendering, without maintaining selectors. Start at [the learn hub](https://browserbash.com/learn) to see where each layer fits.
