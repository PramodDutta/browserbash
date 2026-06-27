---
title: Testing Angular Material Forms and Controls With an AI Agent
description: "Test Angular Material widgets like mat-select, mat-datepicker, and mat-checkbox with an AI agent that resolves CDK overlays by role and accessible name."
date: 2026-06-27
category: guide
---

To test Angular Material forms with an AI agent, you describe what you want in plain English ("open the Country dropdown and choose Canada") and let the agent resolve the widget through the accessibility tree (roles, accessible names, and states) instead of matching `mat-select` component selectors or CDK overlay classes. This sidesteps the single hardest thing about Material testing: the actual option list, calendar, or menu is not rendered inside your form. Angular's CDK teleports it into an overlay container appended near the end of `<body>`, far from the trigger that opened it. A selector written against `.mat-mdc-select-panel .mat-mdc-option` binds to a portal that did not exist a moment ago and vanishes the moment you click away. An agent that reads roles instead, like `option` with the accessible name "Canada", finds it wherever the CDK put it. This guide shows how that works for the widgets that break scripted tests most often, with real `*_test.md` examples, plus an honest section on where it still struggles.

The framing up front: this is not magic, and Material's animation timing can still bite. But the part that wrecks selector-based Material tests, the overlay markup churning on every interaction, is exactly the part an agent re-derives from live state on each action.

## Why Angular Material breaks selector-based tests

Material components look like ordinary form fields, but their DOM is anything but ordinary. Three things make them hostile to hard-coded selectors.

**The overlay lives somewhere else.** When you open a `mat-select`, the panel of options is not a child of the select. The CDK renders it into a `cdk-overlay-container` at the document root. Your trigger is in the form; the options are in a sibling of `<body>`. A selector scoped to the form finds nothing, and a global selector has to know the exact overlay class names, which differ between MDC-based components and older ones.

**The class names are generated and versioned.** `mat-mdc-select-panel`, `mat-mdc-option`, `cdk-overlay-pane`: these are framework internals, not your markup. A Material minor version bump can rename or restructure them, and your test breaks on an upgrade that touched none of your code. Keying tests to `.mat-mdc-*` couples your suite to Angular Material's release cadence.

**The DOM is transient.** The overlay is created on open and destroyed on close. A `mat-datepicker` calendar does not exist until you click the toggle, and it is gone the instant you pick a date. Any selector for a calendar cell points at an element that is absent most of the time, so timing and existence checks dominate the test code.

None of this is a bug. It is how the CDK delivers correct z-index stacking, focus trapping, and positioning. But it means the fragile part of a Material test is element targeting, and that is precisely the part worth moving out of your codebase. For the mechanics, see [how BrowserBash finds elements through the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree) and the broader case for [browser automation without selectors](https://browserbash.com/blog/browser-automation-without-selectors).

## How an AI agent resolves a CDK overlay

The mental model is simple. A selector-based tool needs you to answer "where is the Canada option?" with a DOM path. An agent answers with a description and resolves it against the live page at runtime.

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You install it once:

```bash
npm install -g browserbash-cli
```

Then you give it an objective. Under the default engine (stagehand, MIT, by Browserbase) the agent observes the live DOM each step and decides the next action from what is rendered right then. The alternate builtin engine (an Anthropic tool-use loop) captures native Playwright traces and re-derives the selector on every action from a fresh snapshot, never cached across runs. Either way, the agent is not running a saved script of selectors: it reads the page each time and chooses what to do.

For a `mat-select`, the sequence looks like what a human does:

1. It reads the rendered page and finds a control with the `combobox` or `listbox` role whose accessible name matches "Country".
2. It clicks to open it. The CDK injects the overlay panel into the document root.
3. On the next observation, the agent sees new elements with the `option` role. It does not care that they live in a `cdk-overlay-container` far down the DOM. It matches "Canada" by accessible name.
4. It clicks the option. The overlay closes, the form updates, and the agent moves on.

The agent finds elements via the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, so the overlay's physical location is irrelevant. ARIA roles travel with the element wherever the portal puts it, and Material ships solid ARIA semantics on its components. The agent is reading the same tree a screen reader would.

The same property lets it cross boundaries that defeat scoped selectors. If part of your form is mounted in an iframe or behind a web component, the same role-based resolution applies; see [iframes and Shadow DOM in AI browser testing](https://browserbash.com/blog/iframe-and-shadow-dom-ai-browser-testing).

## Tests are intent, not selectors

BrowserBash tests are Markdown files. A `*_test.md` file has a title (`#`), steps (`-` or `1.`), supports `@import` composition, and `{{variables}}` with secret masking in logs. There are no selectors anywhere in the file. Here is a registration form that touches a `mat-select`, a `mat-datepicker`, and a `mat-checkbox`.

```markdown
# Sign up via the Material registration form

- Go to https://example.com/signup
- Type "Ada Lovelace" into the Full name field
- Type "{{EMAIL}}" into the Email field
- Open the Country dropdown and choose "Canada"
- Open the Date of birth picker and select December 10, 1815
- Check the "I accept the terms" checkbox
- Click the Create account button
- Confirm the page shows "Welcome, Ada"
```

Every line is intent. "Open the Country dropdown and choose Canada" does not mention `mat-select`, `mat-option`, or any overlay class. The agent opens the trigger, waits for the panel, and clicks the option by its accessible name. The same holds for the datepicker step: the agent toggles the calendar, navigates to the right month and year, and clicks the day cell, all by reading the calendar's roles and labels rather than computing a grid coordinate.

You run it with:

```bash
browserbash testmd run ./signup_test.md
```

Or run a one-off objective without a file:

```bash
browserbash run "open the Country dropdown on this page and pick Canada, then submit"
```

### Composition with @import and variables

Material apps usually gate the interesting forms behind a login. Put the login flow in its own file and import it, so credential logic lives in one place.

```markdown
# Update billing country in account settings

@import ./login_test.md

- Go to https://example.com/account/settings
- Open the Billing country dropdown and choose "Germany"
- Click Save changes
- Confirm a snackbar appears with "Settings saved"
```

The `{{variables}}` get their values from the environment or a values file, and secrets are masked in logs, so an `{{API_PASSWORD}}` never prints in plaintext. That matters because Material snackbars and dialogs often echo back submitted data.

## Widget-by-widget notes

### mat-select and mat-autocomplete

Phrase the step as the user goal: "open the Status dropdown and choose Active." For multi-select, list the choices: "in the Tags dropdown, select Urgent and Backend, then close the panel." With `mat-autocomplete`, type partial text then pick: "type 'ber' in the City field and choose Berlin from the suggestions." The agent types, waits for the option list overlay, and selects by accessible name.

### mat-datepicker

Be explicit about the target date and let the agent navigate. "Open the Start date picker and select March 3, 2026" is enough: the agent reads the calendar header to know the current month, clicks the period buttons to move, and clicks the day cell labeled 3. If your picker opens to a year or multi-year view, say so: "switch to year view and pick 2026, then select March 3." Range pickers work as two clicks: "select March 3 as the start and March 10 as the end."

### mat-checkbox, mat-radio, and mat-slide-toggle

These carry `checkbox`, `radio`, and `switch` roles with checked or pressed states, so they are among the most reliable Material controls to drive. "Check the Remember me box," "select the Express shipping radio option," "turn on the Email notifications toggle." Because the agent reads current state, "make sure the toggle is on" is valid: if it is already on, the agent leaves it; if not, it flips it.

### mat-menu and mat-dialog

Menus and dialogs are also CDK overlays. "Open the row actions menu and click Delete" opens the menu portal, then clicks the item by name. For the confirmation dialog that follows, "in the confirm dialog, click Delete" scopes to the dialog by its `dialog` role and accessible name, even though the content sits in yet another overlay pane.

## Handling Material's late and animated elements

Material leans hard on animations: panels expand, ripples fire, dialogs fade in. The risk for any automation is acting before the overlay is interactive. BrowserBash uses Playwright's built-in auto-wait with a 15-second ceiling, and you do not write manual sleeps. The agent waits for the option, calendar cell, or dialog button to be present and actionable before it clicks. So a step like "choose Canada from the Country dropdown" will not fire a click into the void during the panel's open animation: the agent observes that the option is not yet actionable and waits, within the ceiling, for it to settle, all without a single configured timeout. For the general approach, see [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## Choosing a model

BrowserBash's default model resolution is `auto`: it resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist on OpenRouter). Material flows can be reasoning-heavy, especially datepicker navigation across months and multi-step forms with conditional fields. Small local models (8B or under) are flaky on long flows and tend to lose track midway through a multi-month calendar. For hard flows, prefer a 70B-class local model (Qwen3 or Llama 3.3) or a hosted model. Running locally means nothing leaves your machine, worth it for internal admin apps built on Material. To go deeper, see [the learn hub](https://browserbash.com/learn).

## Running Material tests in CI

The same `*_test.md` files run headless in a pipeline. Use `--headless` for no display, `--agent` to emit NDJSON for log ingestion, and `--record` to capture a webm plus screenshots when an overlay step fails (invaluable for diagnosing a datepicker that opened to the wrong view). Exit codes are unambiguous: 0 pass, 1 fail, 2 error, 3 timeout. A `Result.md` is written per run.

```bash
browserbash testmd run ./signup_test.md --headless --agent --record
```

You can target different browsers with `--provider local|cdp|browserbase|lambdatest|browserstack`, and `--upload` opts into a cloud dashboard where free runs are kept 15 days (or run `browserbash dashboard` for a local one). A failing Material step in CI gives you a recording of exactly what the agent saw, not a stack trace pointing at a selector that no longer exists.

## Honest limits

An AI agent is not a cure-all for Material, and it is worth being precise about where it struggles on this specific topic.

**Custom overlay timing is the real soft spot.** Material's stock animations are handled by auto-wait, but teams routinely lazy-load option lists from an API after the panel opens or add their own fade transitions. If options stream in after the panel renders, the agent may observe an empty or partial list on its first look. It usually re-observes and recovers within the wait ceiling, but a slow backend behind a `mat-autocomplete` can produce a flaky step. When that happens, make the step explicit ("wait for the suggestion list to load, then choose Berlin") or split it in two so the agent re-reads the page.

**Ambiguous accessible names cause wrong picks.** If two options share a visible label, the agent can choose the wrong one. The fix is the one good accessibility demands anyway: give controls distinct, meaningful labels. Material tests are easiest to write on apps that are already accessible.

**Dense grids and virtualized lists are hard.** A `mat-table` with virtual scrolling, or a tightly packed multi-year calendar view, can confuse the agent about which cell to click, because only a window of the data is in the DOM at once. These are solvable with more explicit steps, but not as effortless as a plain dropdown.

**Custom non-ARIA widgets defeat it.** The agent's whole advantage comes from reading roles and accessible names. A homegrown "select" built from `<div>` elements with no `role`, or a date picker with no labels on its cells, gives the accessibility tree nothing to match. Stock Material ships good ARIA; hand-rolled lookalikes may not.

**It is not deterministic the way a recorded script is.** Two runs can take slightly different paths to the same goal: a feature for resilience, a cost for reproducibility. For a regression suite that needs the exact same clicks every time, a selector-based Playwright or Selenium test is more predictable, and those frameworks remain excellent at what they do. BrowserBash is strongest where the markup churns and selector maintenance is the real bottleneck. Many teams run both: scripted tests for stable critical paths, an agent for the Material-heavy forms that break weekly.

One thing the product does not do: it does not patch or keep a saved selector script between runs. It re-derives element targets from live state on every run. That is the source of its resilience to Material upgrades, and it is a different thing from caching a fixed locator.

## FAQ

### How do I test a mat-select dropdown without writing component selectors?

Write the step as a user goal: "open the Country dropdown and choose Canada." The agent finds the trigger by its `combobox` or `listbox` role and accessible name, opens it, then matches the option by the `option` role and the text "Canada", regardless of which CDK overlay container the panel landed in. You never reference `mat-select`, `mat-option`, or any `cdk-overlay` class in your `*_test.md` file.

### Why do CDK overlays break normal selectors but not the agent?

Because the CDK renders dropdown panels, calendars, menus, and dialogs into an overlay container at the document root, not inside your form. A scoped selector cannot reach them, and a global selector has to hard-code framework class names that change between Material versions. The agent reads the accessibility tree, where ARIA roles and accessible names travel with the element wherever the portal places it, so the overlay's DOM position does not matter.

### Can the agent navigate a mat-datepicker to the right month and year?

Yes. Give it the target date ("open the Start date picker and select March 3, 2026") and it reads the calendar header to determine the current month, clicks the navigation buttons to move, then clicks the day cell labeled 3. For pickers that open to a year or multi-year view, name the view: "switch to year view, pick 2026, then select March 3." Very dense multi-year grids are the hardest case and may need more explicit steps.

### What happens when a Material overlay animates in slowly?

BrowserBash uses Playwright's built-in auto-wait with a 15-second ceiling and no manual sleeps, so the agent waits for the option, calendar cell, or dialog button to become actionable before clicking. Stock Material animations are handled automatically. The exception is custom overlays that lazy-load contents from an API after opening; if data streams in slowly, split the step or tell the agent to wait for the list to load first.
