---
title: Selenium 4 Relative Locators vs No-Locator AI Testing
description: "Selenium 4 relative locators fight brittle XPath; an AI agent uses no stored locator at all. Compare reliability, readability, and upkeep."
date: 2026-07-05
category: comparison
---

Picture the ticket: "Automate the room-booking widget on the campaign landing page." The widget was built by an outside design shop using a page builder, not your team's component library. Every input is a bare `<input>` tag. No `id`, no `name`, no `data-testid`, and the auto-generated class names change on every republish, something like `class="fb2c91 input"` this week and `class="a83d40 input"` next. The one thing that never moves is the layout: the guest-count field always sits immediately to the right of the check-in date, and the room-type dropdown always sits directly below both. You cannot write a stable CSS selector against this markup. This is, almost word for word, the use case Selenium 4 built relative locators to solve, and it is also the exact shape of problem a no-locator AI agent is built to solve. Below is a specific, code-level comparison: what Selenium's `above()`, `below()`, `toLeftOf()`, `toRightOf()`, and `near()` API does under the hood, where it earns its keep, where it quietly reintroduces a different kind of brittleness, and what changes when you drop locators entirely and describe the element in plain English instead.

## What Selenium 4 relative locators actually do

Relative locators (called Friendly Locators during the Selenium 4 alpha) shipped in Selenium 4.0 in late 2021. They live in `org.openqa.selenium.support.locators.RelativeLocator` for Java, with equivalent bindings in Python (`locate_with`), C# (`RelativeBy`), JavaScript, and Ruby. The API lets you locate an element by describing its position relative to another element you have already found, instead of describing its position in the DOM tree.

```java
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;

import static org.openqa.selenium.support.locators.RelativeLocator.with;

WebElement checkInField = driver.findElement(By.cssSelector("input[placeholder='Check-in date']"));

// "the input to the right of check-in" -> the guest-count field
WebElement guestsField = driver.findElement(
    with(By.tagName("input")).toRightOf(checkInField)
);

// "the select box below check-in" -> the room-type dropdown
WebElement roomType = driver.findElement(
    with(By.tagName("select")).below(checkInField)
);

guestsField.sendKeys("2");
```

Five spatial methods are available: `above()`, `below()`, `toLeftOf()`, `toRightOf()`, and `near()` (which by default matches elements within about 50 pixels of the anchor, and accepts an overload to set that distance explicitly). None of this is DOM-tree logic under the hood. Selenium finds every element matching your base locator (`By.tagName("input")` above means every input on the page), asks the browser for each candidate's live bounding rectangle through a JavaScript call, and ranks the candidates by their geometric relationship to the anchor's rectangle. It returns the closest one that satisfies the directional test. That is the whole trick: swap "which node is this in the tree" for "where does this render on screen right now," recomputed fresh on every single call rather than baked in at write time.

Python's binding does the identical thing with snake_case method names: `locate_with(By.TAG_NAME, "input").to_right_of(check_in_field)`.

## Why the feature exists

Selenium's own guidance is candid about when to reach for this: relative locators are meant for elements you cannot cleanly describe with an id, name, or `data-testid`, not as a first-choice replacement for those. That candor is the point. Before Selenium 4, an engineer facing the widget above had two bad options: an unreadable positional XPath like `(//input)[3]` that breaks the moment a hidden field gets added anywhere earlier in the DOM, or a request to the design agency to add test hooks to markup they do not maintain and will not touch for one client's QA suite. Relative locators gave testers a third option that is genuinely more legible than either: describe the element the way you would say it out loud, in code that still compiles inside a normal Selenium test, with no markup changes required from anyone outside the QA team.

## Where relative locators genuinely help

Give credit where it holds up. Relative locators are a real improvement over positional XPath for exactly the case they target: markup you do not control, where a stable id or `data-testid` is not coming. They are computed live against the rendered page on every call, so a DOM reorder that does not change visual layout, a wrapper `<div>` inserted two levels up, a stylesheet-only class rename, does not break them the way a positional selector would. They stay inside your existing Selenium test code and grid, with zero new infrastructure. And they read closer to how a human describes a page than any locator strategy before them in the WebDriver API, which is itself a tell: even Selenium's own maintainers are conceding that spatial, human-readable description outlasts a structural path.

## Where they still break

### The anchor is still a locator

Every relative call needs an anchor, and the anchor is found the old-fashioned way. In the example above, `checkInField` comes from `By.cssSelector("input[placeholder='Check-in date']")`, a completely conventional, completely breakable CSS locator. If the agency's next republish removes that placeholder text or swaps the field for a button that opens a date picker, `checkInField` throws `NoSuchElementException` before `toRightOf()` ever runs. Relative locators do not remove your dependency on a traditional locator, they move it. You now have one traditional locator (the anchor) doing double duty, which is a real improvement in headcount, not a removal of the underlying risk.

### Responsive layouts break the geometry, not the DOM

This is the failure mode that is specific to relative locators and rarely shows up in write-ups of the feature. `toRightOf()` and `below()` are judgments about rendered pixel position, and modern responsive design exists specifically to change rendered pixel position across breakpoints. A two-column desktop layout where guests sits to the right of check-in commonly collapses to a single stacked column on a phone-width viewport, where guests now sits below check-in instead. Run the exact same `toRightOf(checkInField)` call against both viewports in a responsive test matrix and you get a pass on desktop and a `NoSuchElementException` on mobile, for a UI that is working exactly as designed. A promo banner that conditionally renders above the form pushes every element's vertical position down; that alone does not break a directional check, but it can push a `near()` relationship outside its pixel radius. You have traded brittleness against DOM structure for brittleness against viewport width and layout reflow, which in a genuinely responsive, mobile-first product is at least as common a change as a class-name rename.

### Ambiguity and no auto-wait

When your base locator matches several candidates, Selenium ranks them by geometric distance and hands back the closest one that satisfies the direction, which is a best-effort heuristic, not a guarantee of semantic correctness: a checkbox a few pixels closer than the field you meant can win the lookup. Relative locators also inherit Selenium's classic wait story: `findElement` still does not wait for the target to become interactable, so you wrap it in the same `WebDriverWait` and `ExpectedConditions` as every other locator. The feature fixes what you locate, not when it becomes safe to act on it, and it does not exist outside Selenium: Cypress, Playwright, and WebDriver BiDi tooling have no equivalent API, so a relative-locator test does not port if your team migrates frameworks.

## What changes with no locator at all

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. Instead of finding an anchor, then computing a spatial relationship to a second element in code, you write the relationship in one English sentence, and an AI agent resolves both the anchor and the target from the live, rendered page in a single pass:

```bash
npm install -g browserbash-cli

browserbash run "On the booking widget, set the check-in date to next Friday, enter '2' in the guests field to the right of check-in, and verify the nightly rate shown is a dollar amount" --headless
```

Notice the spatial vocabulary, "to the right of," did not disappear. That is the tell: relative locators exist because testers already think this way. What disappeared is the code required to express it: the `checkInField` variable, the `with(By.tagName("input"))` base locator, the `toRightOf()` call, and the separate `WebDriverWait` wrapping all of it. The agent reads labels, visible text, and rendered layout the same way a person scanning the page would, and it re-derives both the anchor and the target from scratch on every run rather than replaying a stored path. A DOM reorder, a class-name hash, or a wrapper div moving one level up simply is not part of what it is keying on in the first place.

For a suite you want to commit and review, the same flow becomes a Markdown test:

```markdown
# Booking widget: guest count updates the nightly rate

- Open {{widget_url}}
- Set the check-in date field to next Friday
- Enter "2" in the guests field to the right of check-in
- Verify: the nightly rate shown is a dollar amount
```

```bash
browserbash testmd run ./booking_widget_test.md --agent --headless
echo "exit code: $?"
```

That `Verify:` line compiles to a real, deterministic check, not an LLM opinion about whether the run "looked fine." The run exits `0` on pass, `1` on a failed verification, `2` on an error, and `3` on timeout, and `--agent` streams NDJSON step and `run_end` events on stdout so CI, or another AI agent, can gate on structured data instead of parsing prose. More on how the two engines resolve elements is on the [BrowserBash features page](https://browserbash.com/features).

## Relative locators vs no locator, side by side

Put side by side, the trade lands on one specific axis: geometry computed in your test code versus meaning read from the page at run time.

| Concern | Selenium 4 relative locators | No-locator AI (BrowserBash) |
| --- | --- | --- |
| Needs a pre-existing anchor locator | Yes, always | No, anchor and target both described in one sentence |
| Survives class or id renames | Only if the anchor's own locator avoids them | Yes, reads labels and visible text |
| Survives responsive breakpoint reflow | No, pixel position changes | Mostly, the semantic relationship still holds |
| Handles multiple matching candidates | Nearest-pixel heuristic, can pick the wrong one | Model reasons about label and context, not just distance |
| Waits for actionability | No, still needs explicit `WebDriverWait` | Agent observes rendered state before acting |
| Determinism | High: identical geometry math every run | Goal-deterministic, gated by `Verify:` plus exit code |
| Speed per lookup | Milliseconds, one JS round trip | Seconds on a fresh run, near-zero once cached |
| Cost | Free, part of existing grid or browser time | Free with local Ollama; token cost with hosted models |
| Portable outside Selenium | No, Selenium-only API | Yes, engine- and provider-agnostic |
| CI gating | Exception surfaces as a normal test failure | Exit codes 0/1/2/3 plus NDJSON `--agent` events |

Read the speed and determinism rows honestly: for a stable, desktop-only layout, relative locators are faster and more predictable than any model call, full stop. That is not a small advantage to concede.

## The honest tradeoffs

Where relative locators pull ahead: cost and raw speed on a layout that does not move. A JavaScript bounding-rect query is milliseconds; a model call, even a fast one, is seconds. If your widget is desktop-only, internal, and its layout has not changed in two years, `toRightOf()` is simply the cheaper, more deterministic tool, and reaching for an AI agent there is solving a problem you do not have.

Where the no-locator approach pulls ahead is the exact failure mode the section above walked through: a viewport-driven layout change, a rebuilt anchor with a new class hash, or markup you genuinely do not control and cannot annotate. BrowserBash's replay cache narrows the cost gap for stable flows too: a green run records its resolved actions, and the next run replays them with zero model calls, near-free and deterministic in the same way a fixed locator is, right up until the page changes enough that the cached action no longer applies. At that point it falls back to the model and re-resolves the step instead of throwing an exception and waiting for someone to patch code. Neither approach escapes a "the page changed" tax: relative locators fail loud and get patched by hand, while the no-locator agent quietly re-resolves and leans on your `Verify:` steps to catch anything that changed for the wrong reason.

None of this argues for ripping out a working Selenium suite. A team with hundreds of passing tests and a stable, owned UI has little to gain from replacing locators of any kind. Scope each tool to the failure it actually solves: keep relative locators for the handful of unlabeled elements in markup you already control end to end, and reach for a plain-English objective for pages you do not control, layouts that reflow across breakpoints, and the widget an outside agency rebuilds every quarter.

## A short decision checklist

Ask these before picking a tool for the next locator problem, not the whole suite:

- Is the anchor element itself stable? If the anchor's own locator is as brittle as the element you are trying to find, relative locators only relocate the failure, they do not remove it.
- Does the layout you are targeting run at more than one viewport width? A `toRightOf()` or `below()` call needs to be re-verified at every breakpoint you test, which is its own maintenance line.
- Do you own the markup? If your team can add a `data-testid`, that is still the cheapest, fastest, most deterministic fix, ahead of both relative locators and an AI agent.
- Is the page third-party, agency-built, or otherwise permanently out of your control? That is the strongest case for describing the element instead of locating it at all.

For that last case, the fastest way to get a working test is often to click through the flow once with `browserbash record`, which generates the plain-English `*_test.md` file for you and pre-warms the replay cache in the same pass.

## FAQ

### Do relative locators replace CSS and XPath selectors?

No. Every relative locator call needs a base locator (`By.tagName`, `By.cssSelector`, and so on) to gather candidates, plus an anchor found by a conventional locator to compare against. Relative locators add a spatial layer on top of traditional locators; they do not remove your dependency on at least one traditional locator per call.

### Are Selenium 4 relative locators recommended for every test?

No, and Selenium's own guidance is explicit about this: reach for relative locators when you cannot build a reliable id, name, or `data-testid` based locator, not as a default first choice. A stable, dedicated test attribute is still faster, more deterministic, and easier to read than any spatial computation.

### Why do relative locators break on mobile when they pass on desktop?

Because `above()`, `below()`, `toLeftOf()`, `toRightOf()`, and `near()` are computed from an element's live, rendered bounding rectangle, not from the DOM tree. Responsive layouts commonly change an element's on-screen position across breakpoints, for example collapsing a two-column desktop layout into a single stacked column on mobile, which changes the geometric relationship the locator depends on even though the underlying markup and behavior are unchanged.

### How does an AI agent find an element without any locator?

It reads the live, rendered page the way a person would, using visible labels, accessible roles, surrounding text, and the layout position described right in the objective, then acts. Because the objective already carries the spatial and semantic description, "the field to the right of check-in," the agent does not need a separate anchor lookup or a stored pixel-distance calculation; it resolves the relationship fresh from the current page on every run.

### Is a no-locator AI test as fast as a relative locator?

On the first run, no: a model call takes longer than a single JavaScript bounding-rect query. After a green run, BrowserBash's replay cache stores the resolved actions and replays them with zero model calls on later runs, which closes most of the gap for a stable flow, and it only falls back to the model again once the cached action no longer matches the page.

If you are staring at a widget with no stable id and a `toRightOf()` call that only holds on desktop, install the CLI with `npm install -g browserbash-cli` and try describing the field instead of locating it. It costs one command to compare against the relative-locator version you already have.
