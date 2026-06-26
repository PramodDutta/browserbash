---
title: "UI Change or Real Regression: How the Agent Decides"
description: "UI change vs regression in AI tests: whether a run reports pass or fail comes down to the outcome you assert, not the layout the agent sees."
date: 2026-06-26
category: guide
---

BrowserBash does not auto-classify a layout reshuffle as "harmless" and a broken feature as "regression." There is no model inside it scoring whether two releases are the same workflow. The decision is made entirely by how you write the objective, because the agent verifies the outcome you stated, not the layout it walked through to get there. State a user-level truth ("the cart shows one item", "the page says Thank you for your order") and a cosmetic change (a button moved, restyled, or re-nested) still passes while a real defect (item not added, wrong total, missing confirmation) fails. State only an action ("click the buy button") and you have encoded a click, not a truth, so the run cannot tell a layout change apart from a dead feature. This guide is the long answer to a question [Prashant Patil asked on Product Hunt](https://www.producthunt.com): if the UI changes significantly between releases, how does BrowserBash decide whether it is the same workflow with a different layout versus an actual regression that should fail the test? The honest answer is that you decide, in the objective, and this is how to write objectives that make the right call.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser-automation and testing CLI from The Testing Academy. Tests are intent, not selectors. You write what should be true; the agent drives a real browser and reports a verdict.

## The decision is in the objective, not in a classifier

Here is the mental model that matters. A traditional test couples two things that are actually separate: the path (which element to click, in what order) and the goal (what state proves the feature works). When the UI changes, the path breaks even if the goal still holds, and you get a red build that means nothing. The whole reason teams reach for an intent-driven runner is to decouple those two so a layout change stops masquerading as a failure.

BrowserBash leans all the way into that split. The agent re-derives the path at run time against whatever the page looks like right now, and it judges the run against the assertion you wrote. So the runner's behavior is a direct function of what you asserted:

- You asserted an **outcome** (a user-observable fact): a reshuffle passes, a real regression fails. This is the behavior the question is asking for, and you get it by writing the right objective.
- You asserted an **action** (a click, a fill): the runner has no outcome to check, so it cannot distinguish a moved button from a broken one. It will report success as long as it found something plausible to click.

The agent does not invent acceptance criteria. It will not guess that "add to cart" implies the badge should read 1. If the badge matters, you say so. The intelligence is in resolving the path against a changed DOM; the judgment about what counts as correct is yours, and it lives in the words you write.

## Weak objective versus strong invariant

The difference is concrete. Same flow, two objectives.

Weak, action-only:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user / secret_sauce, then click the add-to-cart button for the Sauce Labs Backpack"
```

This asks the agent to perform a click. If a release renames the button, restyles it, or moves it into a new card component, the agent still finds and clicks it, and the run is green. Good so far. But if a release breaks the add-to-cart handler so nothing is added, the agent still finds and clicks a button, and the run is still green, because clicking was the entire job. You shipped a regression and the test applauded.

Strong, outcome-based:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user / secret_sauce, add the Sauce Labs Backpack to the cart, open the cart, and verify the cart shows exactly one item and that item is the Sauce Labs Backpack"
```

Now the assertion is a fact about state, not a gesture. A cosmetic reshuffle (button moved, restyled, re-nested under a new container) changes the path the agent takes but not the truth it checks, so the run passes. A real regression (nothing added, the wrong product added, a stale count) makes the asserted fact false, so the run fails with a non-zero exit code. The credentials above are published on the demo login page, so that command runs as written.

The pattern generalizes. Anchor the assertion to something the user would notice:

```bash
browserbash run "Complete checkout for the items in the cart and verify the page says 'Thank you for your order'"
```

A redesigned checkout with a different stepper, relabeled fields, and a new button layout still has to land on the confirmation copy. If it does, pass. If the order silently fails to submit, no confirmation, fail. The layout was free to change; the outcome was not.

## Why the agent tolerates layout change at all

This is worth grounding in how the run actually executes, because the resilience is not a vibe, it is a property of the engine.

Under the default **stagehand** engine, the agent observes the live DOM on every step and resolves your described target against the current state. It is not replaying recorded coordinates or a frozen selector. When you say "open the cart," it looks at what is on the page now and finds the cart control, whether that is an icon in the header, a button in a new nav, or a link that moved. The **builtin** engine (an Anthropic tool-use loop over Playwright, used automatically for cloud grids the default engine cannot attach to) re-derives selectors each run from a fresh snapshot rather than reading them from a saved script.

To be precise about a word people misuse here: this is not self-healing. Self-healing implies a saved script that gets patched when it breaks. There is no saved script of selectors to patch. The agent derives the path fresh from live state every run, so there is nothing stale to repair in the first place.

Late-rendering elements are handled by Playwright's auto-wait, which polls up to 15 seconds for an element to become actionable before the step is considered failed. So a slower client-side render after a redesign does not, by itself, fail a run.

Put together: the path is recomputed against the real page each step, slow elements get a 15-second grace, and the verdict is your assertion. That is the machinery that lets a re-laid-out workflow pass, but only if you gave it an outcome to confirm.

## Encode the invariant, not the interface

A good rule when authoring: write the assertion you would accept from a manual tester who had never seen the old design. They cannot tell you "the button is in the same place," because they do not know where it used to be. They can tell you "I added the backpack and the cart shows one item." That sentence is the invariant, and it survives a redesign because it never referenced the design.

Some practical translations:

- Instead of "click the blue Submit button," assert "submit the form and verify a confirmation message appears."
- Instead of "click the third row's Edit link," assert "edit the order for customer Jane Doe and verify the saved status reads Updated."
- Instead of "click the hamburger then Settings," assert "open Settings and verify the page heading is Account Settings."

Each strong version names the user goal and the observable proof. The agent owns the route; you own the truth. This is the same principle covered in depth in [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants), and it is the single highest-leverage habit for keeping an intent-driven suite honest across redesigns.

Tests live as markdown `*_test.md` files when you want them versioned and reviewed, with steps and assertions written the same plain-English way. A test file is just the objective broken into readable lines, each `verify` line an assertion the agent must satisfy:

```markdown
# Checkout smoke test

## Steps
- Open https://www.saucedemo.com
- Log in as standard_user with password secret_sauce
- Add the Sauce Labs Backpack to the cart
- Open the cart

## Assertions
- Verify the cart shows exactly one item
- Verify the listed item is the Sauce Labs Backpack
```

If a future redesign moves every control on that page, this file does not change, because nothing in it described where a control lives. That is the point.

## Functional outcome versus pixel regression

There is a category of "UI change" this approach deliberately does not catch by default, and being clear about it keeps expectations honest.

If a button still works perfectly but turned the wrong color, sits 40 pixels too low, or renders with a broken web font, that is a visual regression, not a functional one. BrowserBash checks functional outcomes: did the asserted state come true. A miscolored-but-working button satisfies "add the backpack and verify the cart shows one item," so that run passes, correctly, by the runner's own definition. It is not blind to the page, but it is not grading appearance.

That is a different concern with a different tool. Pair functional intent checks with a visual-diff tool when pixel fidelity is part of your contract. The two are complementary: the visual-diff tool tells you the button changed color, BrowserBash tells you the button still adds to the cart. Run both and you cover both questions. The reasoning behind keeping them separate, and how to layer them, is in the [AI visual regression testing guide](https://browserbash.com/blog/ai-visual-regression-testing-guide). For how the agent copes with DOMs that shift legitimately between runs (modals, lazy lists, A/B variants), see [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis), and for why the brittle baseline (a frozen selector) fails in the first place, [why CSS selectors are brittle](https://browserbash.com/blog/why-css-selectors-are-brittle).

## How a verdict reaches your pipeline

The classification you encoded shows up as an exit code, which is what makes this usable in CI without parsing prose. BrowserBash returns:

- `0` pass: every assertion held.
- `1` fail: an assertion was not met (this is your real regression).
- `2` error: something went wrong outside the test logic (a crash, a bad config).
- `3` timeout: the run exceeded its time budget.

A real regression surfaces as exit `1`: the asserted outcome was false. A cosmetic reshuffle, against a well-written objective, exits `0`, because the outcome was still true. The split between "the feature broke" (`1`) and "the run itself fell over" (`2` / `3`) is deliberate, so a flaky network is not logged as a product regression. Install and wire it in:

```bash
npm install -g browserbash-cli
browserbash run "Complete checkout and verify the page says 'Thank you for your order'"
echo "exit: $?"
```

Gate a deploy on the exit code and you have a check that fails on broken behavior and shrugs at a redesign, which is the behavior the original question wanted. The full flag set and provider options are on the [features page](https://browserbash.com/features), and worked end-to-end examples are in [learn](https://browserbash.com/learn).

## Honest limits

This is where the answer earns its keep, because the approach has real edges and pretending otherwise would be the hype this article is trying to avoid.

**Ambiguous objectives get ambiguous judgment.** "Make sure checkout works" is not an assertion, it is a wish. The agent does not know what "works" means to you, so it cannot reliably fail when the thing you care about breaks. Name the observable proof. Vague in, vague out.

**The agent does not guess your intent.** It will not infer that adding an item should change a badge count, or that a discount code should reduce the total, unless you wrote that. If the invariant is not in the objective, the agent is not silently enforcing it. There is no hidden acceptance-criteria model filling in the blanks.

**It is not a pixel-diff tool.** Color, spacing, font, and alignment regressions on a still-working control will pass a functional assertion. If those matter, you need a visual-diff layer alongside it. This is a deliberate scope, not a gap to be surprised by.

**A genuinely new required step still needs authoring.** If a release adds a mandatory step the old flow never had (a new consent checkbox, a new 2FA prompt, a new address-confirmation screen), behavior depends on the step. Often the agent navigates it on its own because it reasons about the live page. But when the step requires information only you have (a specific code, a particular choice, data that is not on screen), the agent cannot invent it, and you update the objective to include it. The agent adapts to layout, not to requirements you never gave it.

None of these are bugs. They are the boundary of "the agent verifies the outcome you stated." Inside that boundary, a re-laid-out workflow passes and a broken one fails. Outside it, you are asking the agent to read your mind.

## FAQ

### Does BrowserBash automatically know a reshuffle is not a regression?

No, and that is the honest answer. It has no classifier scoring "same workflow, different layout" versus "broken." It verifies the outcome you wrote. If you asserted a user-level fact, a reshuffle that preserves that fact passes and a defect that breaks it fails. The correct behavior is a property of your objective, not a feature that runs behind your back.

### What happens if my objective only says to click a button?

You have encoded an action, not a truth. The agent clicks something plausible and reports success, whether or not the feature behind the button works. It cannot tell a moved button from a dead one, because nothing in the objective described what should be true afterward. Add a `verify` clause naming the outcome and the run gains the ability to distinguish them.

### How is this different from self-healing tests?

Self-healing implies a saved script of selectors that gets patched when the UI shifts. BrowserBash has no saved selector script to patch. The default stagehand engine observes the live DOM each step and the builtin engine re-derives selectors each run from a fresh snapshot, so the path is computed from current state every time. Nothing goes stale, so nothing needs healing. It is a different mechanism with different failure modes.

### Will it catch a button that turned the wrong color but still works?

Not by default. That is a visual regression, and BrowserBash checks functional outcomes: a miscolored button that still adds to the cart satisfies a cart-state assertion, so the run passes. For appearance, pair it with a visual-diff tool. Run both and the functional check tells you the feature works while the visual check tells you it looks right.
