---
title: "Testing User Intent, Not Clicks: Invariant-First Tests"
description: "Testing user intent over click order is what makes plain-English tests durable. Invariant-first tests protect the user-level truth, not a frozen path."
date: 2026-06-26
category: agents
---

The value of a test is the user-level invariant it protects, not the click sequence it happens to perform. If you write a plain-English test as "click the Sign in link, type the email, click the password field, click Submit," you have not escaped brittleness. You have just relocated it. The fragility used to live in CSS selectors. Now it lives in a hardcoded list of clicks that breaks the moment the flow reshuffles. Same disease, new host.

The fix is to author tests as invariants and outcomes instead of paths. "A returning user can sign in and reach their dashboard and see their own name." "An out-of-stock item cannot be added to the cart." "After checkout the order total equals the sum of the line items." Each of those names a truth that should hold no matter how the UI is arranged this week. The objective states the protected truth, and the agent figures out the path on each run.

This post agrees with a point an SDET named Patrick Krekelberg made on the BrowserBash Product Hunt launch, and turns it into a method you can apply today. His comment: "The hard part in plain-English browser tests is preserving intent after selectors change. A good test should explain the user-level invariant it protects, not just regenerate clicks." That is exactly right, and it deserves more than a nod. It deserves a writing discipline.

## Why "click X then click Y" is still brittle

Selector-based scripts earned their bad reputation honestly. A redesign renames a class, a component library bumps a version, an A/B test swaps a button for a dropdown, and your locators rot. Anyone who has owned a large suite has spent an afternoon chasing a `TimeoutError` that meant nothing except "the markup moved."

Natural-language tooling is sold as the cure. And it can be, but only if you use it correctly. Here is the trap. You can write a plain-English test that is just a transcript of clicks:

```
# weak: a click transcript in English
Go to the home page.
Click the "Sign in" link in the top right.
Type alice@example.com into the first field.
Type the password into the second field.
Click the blue "Continue" button.
Click "My account" in the navigation.
```

Read that closely. Every line names a widget, a position, or a color. "The top right." "The first field." "The blue button." You have written CSS selectors in prose. The instant the sign-in link moves into a hamburger menu, or the account link gets renamed to "Dashboard," this test fails, and it fails for a reason that has nothing to do with whether a user can actually sign in. That is a false negative, the most expensive kind of test result, because it costs you trust and triage time and teaches the team to ignore red.

The deeper problem is that a click transcript does not say what it is protecting. If it breaks, you cannot tell from the test whether something real regressed or the page just got rearranged. The test has no opinion about correctness. It only has an opinion about layout.

## Invariant-first authoring, by example

An invariant is a statement that should remain true across redesigns. Write the test as the invariant, and the path becomes the agent's problem, not yours.

```
# strong: an invariant, path-free
A returning user signs in with valid credentials,
lands on their dashboard,
and the page shows their own account name.
```

Notice what is gone. No "top right." No "first field." No "blue button." The objective names a user goal (sign in), a destination (the dashboard), and a verifiable end state (their own name is visible). Where the link lives, what the button is called, how many fields the form has: none of that is frozen into the test, so none of it can break the test on its own. If the navigation gets reorganized tomorrow, this test still passes, because the user can still sign in and still see their name. If sign-in genuinely breaks, or the dashboard shows the wrong user, it still fails, because the protected truth is no longer true.

A few more, drawn from real flows:

```
# inventory invariant
An item marked out of stock cannot be added to the cart.
Attempting to add it leaves the cart count unchanged
and surfaces an out-of-stock message.
```

```
# arithmetic invariant
After completing checkout, the order confirmation total
equals the sum of the individual line item prices.
```

```
# access-control invariant
A signed-out visitor who opens a billing URL directly
is sent to the login screen and never sees billing data.
```

Each one survives a reshuffle and still catches a real defect. The out-of-stock test does not care whether the disabled state is a grayed button or a tooltip, only that the rule holds. The checkout test does not care about the layout of the receipt, only that the arithmetic is correct, which is exactly the kind of bug a click transcript would sail straight past because it never looked at the numbers.

## How BrowserBash supports invariant-first tests

BrowserBash is a free, open-source (Apache-2.0) natural-language browser-automation and testing CLI from The Testing Academy. Its design happens to line up with invariant-first authoring, because the tool was built so that objectives are goals, not scripts.

You can run a single invariant straight from the shell:

```bash
browserbash run "a returning user signs in and the dashboard shows their own name"
```

That string is an objective, not a recording. BrowserBash hands it to an agent that perceives the live page and decides each step, rather than replaying a fixed sequence. The default Stagehand engine observes the live DOM at every step and chooses an action against what is actually on screen right now. The built-in engine re-derives its selectors on each run from a fresh page snapshot, and those selectors are never cached between runs. Either way, the path is computed at run time, so the path is never frozen into the test. Underneath, Playwright's auto-wait gives each action up to a 15 second window to settle, which removes most of the timing flake that pushes people to sprinkle sleeps into scripts.

For suites you keep, BrowserBash uses Markdown `*_test.md` files. The point for invariant-first work is that a step can be phrased as an outcome, and an assertion can verify the invariant directly:

```markdown
# login_test.md

@import ./setup.md

## Sign-in invariant
Sign in as a returning user with {{email}} and {{password}}.

Assert the dashboard is shown and it displays the account
name for {{email}}, not a generic greeting.
```

The `@import` pulls in shared setup so you are not restating fixtures, and `{{variables}}` keep credentials and data out of the prose. The body reads as an outcome ("the dashboard is shown and it displays the account name"), and the agent re-derives the path on the live DOM on every run. The test describes the truth; the run discovers the route.

One important clarification, because the marketing word for this is everywhere and it is not what is happening here. This is not self-healing. Self-healing automation keeps a saved, selector-based script and, when a locator breaks, tries alternate locators to patch the script back to working. That is a real and useful approach, but it is a different one. BrowserBash does not store a path and repair it. There is no saved path to repair. The agent re-derives the route from live page state on each run, starting from the objective every time. The difference matters when you reason about failures: a self-healing tool can quietly paper over a change you wanted to know about, whereas a re-derivation approach simply asks, fresh each run, "can the stated invariant be satisfied on the page as it exists now?"

## The honest part: you still have to state the invariant

Here is the half of the deal that tooling cannot do for you. Holding the path loosely is the tool's job. Stating the invariant clearly is yours. The agent does not bind to selectors, which is what gives you durability against layout change. But the agent will not invent acceptance criteria you never wrote. If your objective is vague, the agent has nothing precise to check, and you get a vague test that passes too easily.

Intent preservation is a collaboration. It needs a well-written objective on one side and an agent that does not freeze the path on the other. Take away either half and it falls apart. An agent that re-derives the path but is handed "make sure login works" will confirm that some page loaded after some interaction, which is nearly worthless. A razor-sharp invariant handed to a tool that replays cached clicks will break on the next redesign. You want both, and the half you own is the wording.

So treat the objective as a spec, not a hint. Before you write a test, answer one question in plain language: what user-level truth would I be sad to ship without? Then write that sentence. That sentence is your test.

### Five reusable patterns for invariant-first objectives

These are portable. They work whether you run a one-off `browserbash run` or a Markdown suite, and frankly they make any natural-language test better.

1. **Assert the outcome, not the action.** End every objective with a verifiable result. Not "submit the form" but "and a confirmation message with an order number appears." The action is how you get there; the outcome is what you are protecting. A test with no asserted outcome is a click transcript wearing a costume.

2. **Name the user goal, in user words.** Frame the objective around what a person is trying to accomplish ("a customer applies a valid discount code and the total drops"), not around the mechanics of the interface. User goals are stable across redesigns. Interface mechanics are not.

3. **Avoid naming widgets, positions, and colors.** Strike "the blue button," "the top-right link," "the third tab." Those are selectors in disguise and they reintroduce exactly the brittleness you came here to escape. Describe the function ("the primary action that places the order"), not the pixels.

4. **Encode the business rule explicitly.** If the truth is a rule, state the rule. "An out-of-stock item cannot be added to the cart." "A coupon past its expiry date is rejected." "A non-admin cannot open the user-management page." Rules are the invariants most worth protecting and the ones click transcripts most reliably miss.

5. **Verify the end state, concretely.** Say what the world should look like when the goal is met. "The cart count reads two." "The receipt total equals the line-item sum." "The signed-in user's own name is shown." Concrete end states are what turn a happy-path walk into an actual check.

Use these and your tests stop being recordings of one particular afternoon's UI and start being statements about what your product must always do.

## Where invariant-first tests run out of road

Honesty about limits is part of the method, so here are the edges.

Vague objectives produce vague tests. This is the big one and it bears repeating: an underspecified invariant is not durable, it is just lenient. "Check the dashboard works" will pass on almost anything. The resilience of invariant-first testing is not a license to be sloppy with wording. It raises the value of precise wording.

The agent cannot guess unstated rules. If "out of stock items cannot be added to the cart" is a requirement and you never write it down, no agent will test it, because nothing in a generic "buy something" objective implies that constraint exists. Invariants must be made explicit to be protected. The tool removes the selector-maintenance tax; it does not remove the need to know your own acceptance criteria.

Some checks genuinely want a targeted assertion. Invariant-first authoring is the right default for user-facing behavior and flows. It is not the right tool for an exact pixel measurement, a specific DOM attribute value, a precise hex color, or a byte-for-byte API contract. Those are not user-level invariants, they are implementation details, and they deserve a targeted assertion or a specialized tool (a visual-regression checker, a unit test, a contract test) rather than a prose objective. Use invariants where intent lives, and use precise assertions where precision lives. Knowing which is which is the skill.

For more on how the agent perceives the page rather than replaying steps, see [agentic testing explained](https://browserbash.com/blog/agentic-testing-explained) and [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis). If you are migrating off a maintenance-heavy suite, [replace page objects with plain English](https://browserbash.com/blog/replace-page-objects-with-plain-english) covers the transition, and [UI change vs real regression: how the agent decides](https://browserbash.com/blog/ui-change-vs-real-regression-how-the-agent-decides) digs into telling a cosmetic reshuffle apart from a genuine break. The [features](https://browserbash.com/features) page lists the engines and flags, and [learn](https://browserbash.com/learn) walks through writing your first objectives.

## FAQ

### Is an invariant-first test just a vaguer test?

No, and this is the most common misread. Vague and invariant-free are opposites. A vague test ("check sign-in") underspecifies the outcome and passes on almost anything. A strong invariant ("a returning user signs in and the dashboard shows their own name") is highly specific about the outcome and deliberately silent only about the path. You are tightening the part that defines correctness, the asserted truth, while loosening the part that causes brittleness, the click sequence. Precision moves from selectors to outcomes, where it actually protects you.

### Is this the same as self-healing tests?

No. Self-healing keeps a saved selector-based script and patches broken locators with alternates at run time, so the script keeps running. BrowserBash stores no path to patch. It re-derives the route from a fresh view of the live DOM on every run, starting from the objective each time. The practical difference: a re-derivation approach asks, fresh each run, whether the stated invariant holds on the page as it exists now, rather than nursing an old script back to green. Both are valid; they are not the same mechanism, and conflating them leads to wrong expectations.

### How do I handle a check that really does need an exact value?

Use a targeted assertion or a specialized tool for that one check, and keep invariant-first authoring for the surrounding flow. Exact pixels, specific DOM attributes, precise colors, and strict API contracts are implementation details, not user-level invariants, and they are better served by visual-regression, unit, or contract tests. The two styles compose: a plain-English objective drives the user journey, and a precise assertion locks down the one value that must be exact.

### Where do I start if my suite is all click transcripts today?

Pick your highest-value flows and rewrite each as a single sentence answering "what user-level truth would I be sad to ship without?" Drop every reference to widgets, positions, and colors, and end each objective with a concrete asserted outcome. Run them with `browserbash run "<objective>"` to sanity-check the wording, then move the keepers into `*_test.md` files using `@import` for shared setup and `{{variables}}` for data. Install with `npm install -g browserbash-cli`. You will usually find that one well-stated invariant replaces a dozen brittle click-transcript steps.
