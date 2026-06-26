---
title: How BrowserBash Finds Elements: The Accessibility Tree
description: "How AI finds elements for accessibility tree browser testing: BrowserBash reads roles, accessible names, and states plus the DOM, not your CSS classes."
date: 2026-06-26
category: agents
---

The short version, because you came here for a mechanism and not a sales pitch: BrowserBash finds elements by reading the page's accessibility tree (the same semantic model a screen reader consumes), cross-referenced with the DOM, and not by matching the CSS classes or XPath paths you would hand-write in a Selenium test. When you say "click the submit button," it does not search for `button.btn-primary.checkout__submit`. It looks for a node whose role is `button` and whose accessible name is something like "Submit," then derives a concrete locator for that node at the moment it acts. This article explains exactly how that works, step by step, and ties it to a claim that surprises a lot of SDETs the first time they hear it: in this model, "testable" and "accessible" turn out to be the same property.

That last point is the whole reason the approach is worth your attention. If a control has a proper accessible name, it is easy for a screen reader to announce and easy for the agent to target. If it is an unlabeled icon button or a `div` with an `onclick` handler and no role, both struggle for the same reason. So the work you do to make a page targetable by BrowserBash is, almost line for line, the work you would do to make it usable by someone driving the page with NVDA or VoiceOver. Let's get into how the engine actually resolves an element, where it falls down, and what you can change to make your UI cooperate.

## What the accessibility tree actually is

Every modern browser builds two trees from your HTML. The first is the DOM, which you already know: the literal tree of elements, attributes, and text nodes. The second is the **accessibility tree**, a parallel semantic model the browser derives from the DOM, ARIA attributes, and a pile of computation rules. Assistive technology reads the accessibility tree, not the raw DOM, because the raw DOM is full of layout `div`s and styling hooks that mean nothing to a blind user.

A node in the accessibility tree is, at its core, three things:

- A **role**, meaning what kind of control this is. `button`, `textbox`, `checkbox`, `link`, `heading`, `combobox`, `tab`, `dialog`, and so on. Roles come from native HTML semantics (`<button>` is a `button`, `<a href>` is a `link`) or from explicit ARIA (`role="button"` on a `div`).
- An **accessible name**, the human label for the control. For a button it is usually the visible text. For an input it is the associated `<label>`, or an `aria-label`, or `aria-labelledby` pointing at another element. For an image it is the `alt` text.
- A set of **states and properties**: `checked`, `disabled`, `expanded`, `selected`, `required`, `pressed`, value, and the rest. These describe the live condition of the control, not just its identity.

So a checkout form that you see as a styled box of inputs, the browser sees as something closer to this:

```
button "Submit"
textbox "Email"
textbox "Card number"
checkbox "Remember me" (checked: false)
link "Forgot password?"
```

That is roughly what a screen reader would walk through, and it is roughly what BrowserBash works from. Notice what is absent: no class names, no `nth-child` positions, no XPath. The semantic identity of each control is carried by its role and its name, which is exactly the information a human uses to read the page out loud. For the deeper background on why this tree exists and how scanners use it, the [AI accessibility testing guide](/blog/ai-accessibility-testing-guide) covers the WCAG side in detail.

## From "click the submit button" to a concrete action

Here is the part you actually want: how a sentence becomes a click. Walk through what happens when you run an objective with BrowserBash, the free, open-source (Apache-2.0) natural-language browser-automation and testing CLI from The Testing Academy.

You install it once:

```bash
npm install -g browserbash-cli
```

And you give it an objective in plain English:

```bash
browserbash run "go to the login page, fill in the email field, and click the submit button"
```

There is no selector anywhere in that command. The phrase "the submit button" is an **intent**, and the engine's job is to map that intent onto a real node in the page. Tests in this model are expressed as intent, not as selectors, which is the property that lets the same script survive a restyle. The mapping happens in a few stages.

### Step 1: Perceive the page semantically

Before acting, the agent perceives the current page through the accessibility tree and the DOM together. It is not screenshotting pixels and guessing coordinates as its primary signal; it is reading the structured semantic model. So "the submit button" gets matched against the available nodes by role and accessible name: find a node with `role=button` whose name is close to "submit." If the page has a single `button "Submit"`, the match is unambiguous and the agent locks onto that node.

### Step 2: Map intent to role plus name

The reason this works across phrasings is that role and name are forgiving in the right way. "Click the submit button," "press Submit," and "submit the form" all land on the same `button "Submit"` node, because the model is reasoning about meaning, not string-matching a literal selector. A few concrete intent-to-node mappings make the pattern obvious:

- "fill in the email field" maps to `textbox "Email"`.
- "check the remember me box" maps to `checkbox "Remember me"`.
- "open the account menu" maps to `button "Account"` (or a node with `aria-expanded` that is named "Account").
- "click the forgot password link" maps to `link "Forgot password?"`.

In each case the noun phrase you typed corresponds to an accessible name, and the kind of control corresponds to a role. That is not a coincidence of how BrowserBash is built. It is a consequence of the fact that good UI labels are written in human language in the first place, the same human language you used in the objective.

### Step 3: Re-derive the locator at action time (builtin engine)

This is the step that matters most for reliability, and it differs by engine.

On the **builtin engine**, every action starts from a **fresh snapshot** of the page. The engine captures the current accessibility tree and DOM, assigns short reference IDs (refs) to the nodes it sees, resolves your intent to one of those refs, and then **derives the concrete locator for that ref at that moment**. It does this on every single action. The locator is never cached and reused across steps. If you click "Submit," then on the next step ask to click "Continue," the engine takes a brand-new snapshot for the second action rather than trusting anything it computed for the first.

Why does the never-cached part matter so much? Because the page between two actions is frequently not the same page. A modal opens, a list re-renders, a framework swaps the DOM under you. A cached locator computed against the old tree would be pointing at a stale or detached node. By re-deriving from a fresh snapshot each time, the engine is always reasoning about the page as it exists right now. The builtin engine also captures Playwright traces as it runs, so when something does go wrong you have a step-by-step record to open and inspect rather than a bare stack trace. The companion piece on [how BrowserBash handles dynamic UIs](/blog/how-browserbash-handles-dynamic-uis) goes deeper on the run-to-run stability angle.

### Step 4: Observe the live tree each step (stagehand engine)

The default engine, **stagehand**, takes a closely related approach: it observes the live DOM and accessibility tree at each step and resolves your instruction against what it currently sees. The shared principle across both engines is that resolution happens against the present state of the page, step by step, rather than against a selector you froze in place when you wrote the test. Whether you are on stagehand or builtin, the element is located by what it means on the page at the instant of the action.

The practical upshot is the same in both cases. There is no `selectors.js` file to maintain, no `data-testid` to keep in sync, and no XPath that silently rots when a designer reorders two columns.

## Why semantic locators survive change

Now the payoff. A CSS selector encodes a path through the document: "third child of the form, the input with class `form-control`." That path is an assumption about structure, and structure is exactly what frontend teams churn constantly. Rename a class, wrap a field in an extra `div` for layout, ship an A/B variant, bump the component library, and the path breaks while the page still looks and behaves identically to a user. The full autopsy of that failure mode lives in [why CSS selectors are brittle](/blog/why-css-selectors-are-brittle), and it is the best companion to this article.

Role and accessible name are different in kind. They are tied to the *meaning* of the control, not its position or styling. Consider what a typical refactor does to each:

| Change a frontend team ships | Class-based selector | Role + accessible name |
| --- | --- | --- |
| Rename `.btn-primary` to `.button--cta` | Breaks | Unaffected |
| Wrap the input in an extra layout `div` | Often breaks (`nth-child` shifts) | Unaffected |
| Swap the CSS framework | Breaks broadly | Unaffected |
| Reorder two columns | Breaks (positional XPath) | Unaffected |
| Change the button's visible text "Submit" to "Place order" | Unaffected | Changes (name changed) |

Look closely at that last row, because it is the honest catch. The semantic approach is robust to restyling and DOM reshuffling, but it is deliberately *sensitive* to changes in meaning. If you rename the button from "Submit" to "Place order," the accessible name genuinely changed, and your objective should change with it. That is a feature, not a bug: the test broke because the thing a user reads actually changed, which is precisely when a human-readable test *should* need a human to look at it. Class-based selectors give you the opposite and worse trade, breaking on cosmetic churn while sometimes sailing through meaningful UX changes.

To be clear about what this is not: this is not self-healing. The engine does not silently rewrite a broken step to hit a different element and carry on. It resolves your stated intent against the current page; if the intent no longer matches anything on the page, the step fails and tells you, the way it should.

## Testable and accessible are the same property

This is the idea I most want SDETs to walk away with. The exact thing that makes a control easy for BrowserBash to target is the exact thing that makes it usable by a screen reader: a clear role and a clear accessible name.

Run the equivalence in both directions:

- A `<button>Submit</button>` has a `button` role and an accessible name of "Submit" for free. A screen reader announces "Submit, button." The agent resolves "the submit button" instantly. Easy for both.
- A `<div class="icon-btn" onclick="...">` with only an SVG inside has no role, no name, and no keyboard handling. A screen reader skips past it or announces nothing useful. The agent has nothing semantic to grab. Hard for both, for the identical reason.

So when your BrowserBash objective fails to find a control, it is frequently a genuine accessibility defect waving at you. The agent struggling to click your "filter" icon and a keyboard user being unable to operate it are two symptoms of one cause: the control was never given a name or a role. This is why teams that adopt intent-driven testing tend to file accessibility bugs almost by accident. You can lean into that deliberately; the [AI accessibility testing guide](/blog/ai-accessibility-testing-guide) shows how to make those checks explicit rather than incidental.

### Practical tips to make your UI targetable

You do not need to restructure your app. A handful of habits cover the vast majority of cases:

- **Give every interactive control an accessible name.** Visible text is best. Where you must use an icon, add an `aria-label` (`aria-label="Search"`) or visually hidden text so the control has a name.
- **Use real semantic elements.** A `<button>`, `<a href>`, `<input>`, `<select>`, and `<label>` carry correct roles and name computation automatically. Reach for ARIA only when no native element fits.
- **Associate labels with inputs.** A `<label for="email">` (or wrapping the input) gives the textbox a name. An unlabeled input is an anonymous node to both the agent and the screen reader.
- **Make names unique within a view.** Three buttons all named "Edit" on the same screen create ambiguity. "Edit profile," "Edit address," and "Edit payment" resolve cleanly.
- **Avoid relying on icon-only controls.** If the only way to trigger an action is a bare glyph with no name, you have built something hard to test and hard to use. Label it.
- **Prefer visible text and roles over visual-only cues.** Color, position, and iconography are invisible to the semantic tree. Meaning that exists only in pixels cannot be targeted by name.

Every one of those is also a WCAG win. That is the point.

## The honest limits

I would be selling you something if I stopped at the happy path. The accessibility-tree approach has real boundaries, and knowing them up front saves you a frustrating afternoon.

**Unlabeled or `aria-hidden` controls are hard to target.** If a control has no accessible name, the agent has no semantic handle for it, exactly as a screen reader would not. Worse, anything marked `aria-hidden="true"` is deliberately removed from the accessibility tree, so it is invisible to the agent by design even though it renders on screen. If you have hidden something from assistive tech that a user genuinely needs to operate, that is a bug to fix in the page, not a setting to toggle in the test.

**Canvas and WebGL render no semantic nodes.** A chart, a map, or a game drawn into a `<canvas>` is, from the accessibility tree's perspective, a single opaque rectangle. There are no buttons or labels inside it because there is no DOM inside it, only pixels. The agent cannot target "the zoom-in control" on a canvas map unless the application exposes real DOM controls alongside the canvas. This is the same reason canvas content is notoriously hard for screen readers, and the fix is the same: provide accessible DOM equivalents.

**A wrong or duplicated accessible name causes ambiguity.** If two controls share the name "Submit," or a button is mislabeled "Cancel" when it actually confirms, the agent can resolve to the wrong node or hesitate between candidates. The model is only as good as the names the page gives it. Garbage labels in, ambiguous targeting out. This failure is, again, a real accessibility problem: a sighted user might disambiguate by position or color, but a screen-reader user hears two identical "Submit, button" announcements with no way to tell them apart.

**Nested document contexts add their own walls.** Cross-origin iframes carry a genuine browser security boundary, and closed shadow roots are intentionally opaque. The intent-driven approach handles a lot of component complexity gracefully, but it cannot talk its way through a security boundary. The dedicated treatment is in [testing iframes, shadow DOM, and web components](/blog/iframe-and-shadow-dom-ai-browser-testing).

None of these are reasons to avoid the approach. They are the edges of it, and most of them point back at a page-level fix that improves accessibility anyway. The pattern holds: where the agent struggles, a human assistive-technology user usually struggles too.

## Putting it together

BrowserBash resolves elements the way a person reading a page does: by what each control *is* (its role) and what it is *called* (its accessible name), checked against the live page at the moment it acts rather than against a frozen selector. On the builtin engine that means a fresh snapshot, fresh refs, and a freshly derived locator on every action, with Playwright traces captured for when you need to debug. On the default stagehand engine it means observing the live DOM and tree each step. Either way, your tests describe intent, and the brittle middle layer of CSS classes and XPath paths simply is not in the loop.

The strategic takeaway for an SDET is that investing in accessibility and investing in test stability are no longer two separate budgets. Label your controls, use semantic HTML, keep your names unique and honest, and you get a page that both a screen reader and an agent can navigate with ease. Start from `browserbash run "<objective>"` against one of your own flows, watch where it resolves cleanly and where it stalls, and treat every stall as a question about whether a real user could operate that control either. You can browse the rest of the capabilities on [the features page](https://browserbash.com/features) and work through the tutorials in the [learn section](https://browserbash.com/learn).

## FAQ

### Does BrowserBash use CSS selectors or XPath under the hood?

Not as the thing you write or maintain. You express intent in plain English, and the engine maps that to a node by role and accessible name read from the accessibility tree and DOM. It derives a concrete locator internally at action time, but that locator is computed fresh from the current page each run rather than authored by you and frozen into a test file. There is no selector layer for you to keep in sync.

### What is the difference between the builtin and stagehand engines for finding elements?

Both resolve your instruction against the live page at each step instead of a cached selector. The builtin engine takes a fresh accessibility-tree and DOM snapshot per action, assigns refs to nodes, re-derives the locator each time (never cached), and captures Playwright traces. The default stagehand engine observes the live DOM and tree each step and resolves your instruction against what it currently sees. The shared principle is present-state resolution, step by step.

### Why does my test break when developers rename a button's text but not when they restyle it?

Because the engine targets by accessible name, which is usually the visible text. Restyling changes classes and layout, which the semantic model ignores, so the test is unaffected. Renaming "Submit" to "Place order" changes the actual accessible name, which is a real change in what a user reads, so the objective genuinely no longer matches and should be updated. The test is sensitive to meaning and indifferent to cosmetics, which is the trade you want. Note this is resolution against the current page, not self-healing; the engine does not silently rewrite your step.

### How do I make a custom component easier for BrowserBash to find?

Give it a real role and an accessible name. Prefer native elements (`<button>`, `<a href>`, `<input>` with a `<label>`) so roles and names are computed for free. If you must build a custom widget, add the correct `role` and an `aria-label` or visible text, keep that name unique within the view, and make sure it is operable by keyboard. Every one of those changes also makes the component usable by a screen reader, which is the same property the agent depends on.
