---
title: How to Test Drag-and-Drop Interfaces With an AI Agent
description: "Test drag and drop kanban boards, sortable lists, and reorder widgets with natural-language intent like move card X to Done, no selectors or coordinates."
date: 2026-06-27
category: testing
---

To test drag and drop with an AI agent, you write the move as plain intent (for example, "move the card titled Design review to the Done column") and let the agent resolve both the thing you grab and the place you drop it against the live page, then perform a real browser drag. You never write a CSS selector for the card, you never compute pixel coordinates for the column, and you never hardcode the source-and-target index that a sortable list reshuffles on every render. With [BrowserBash](https://browserbash.com/features), a free open-source CLI from The Testing Academy, that move is one line. This post shows exactly how to do it for kanban boards, sortable lists, and reorder widgets, how the agent maps roles and accessible names onto drag sources and drop targets, and the honest places where it struggles (canvas-based drags and pointer-precise gestures).

Install it first if you want to follow along:

```bash
npm install -g browserbash-cli
```

## Why drag-and-drop breaks scripted tests

Drag-and-drop is the single most fragile interaction to script, and it breaks scripted suites in ways that have nothing to do with the feature being wrong.

A scripted drag test makes three brittle bets at authoring time. It bets on a **selector** for the card you grab, a **selector** for the column or slot you drop into, and very often a **set of coordinates or offsets** to simulate the gesture. Every one of those bets loses value over time:

- **The card selector rots.** Kanban cards are usually rendered from data, so their DOM is generated. A class like `css-1f9x2a` or a `data-rbd-draggable-id` keyed to an internal index changes the moment the library updates or the board re-sorts.
- **The drop target moves.** Columns get reordered, renamed, or virtualized. A locator pinned to `nth-child(3)` points at the wrong column the day someone inserts a "Blocked" lane.
- **The gesture itself is synthetic.** Many drag libraries (react-dnd, dnd-kit, SortableJS, react-beautiful-dnd) listen for a specific sequence of `pointerdown`, `pointermove`, and `pointerup` events with real movement between them. A naive `dragAndDrop()` that fires HTML5 drag events often does nothing, because the library is not listening for those events at all.

So you end up with a test that is correct the day you write it and silently wrong a sprint later, failing on a `TimeoutError` that looks like a bug but is just selector churn. The deeper background on why fixed locators are a losing bet lives in [browser automation without selectors](https://browserbash.com/blog/browser-automation-without-selectors).

## The intent-first approach

An AI agent flips the question. Instead of "what is the DOM path of this card and this column, and what offsets reproduce the gesture," you state the outcome you care about:

```bash
browserbash run "on the project board, move the card titled 'Write release notes' from the In Progress column to the Done column"
```

That is the whole test. There is no selector, no coordinate, no index. The agent reads the page, finds a card whose accessible name is "Write release notes," finds a region whose accessible name is "Done," and performs the drag through a real browser. Because the description ("Write release notes," "Done") is what a human would say out loud, it survives the things that wreck scripts: a class rename, a reordered column, a library bump. None of those change the name of the card or the name of the column, so none of them break the test.

This is the same principle as [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants), applied to the hardest interaction to pin down. You are asserting the invariant ("this card ends up in Done"), not the implementation path.

## How the agent maps names and roles to drag targets

The mechanism matters here, because drag-and-drop is exactly where "it just figures it out" deserves a real explanation.

BrowserBash finds elements through the accessibility tree (roles, accessible names, and states) plus the DOM, not through CSS classes. A full walkthrough is in [how BrowserBash finds elements via the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree). For a drag, the agent resolves two anchors instead of one:

1. **The source.** It looks for an element matching your description of the thing to grab. A kanban card typically surfaces as a `listitem`, an `article`, or a generic container with an accessible name built from its title text. "The card titled 'Write release notes'" maps to the element whose name contains that string.
2. **The target.** It looks for the region you described as the destination. Columns are commonly `list`, `region`, or `group` roles with an accessible name like "Done" or "In Progress" coming from a heading or `aria-label`. "The Done column" maps to that region.

Once both anchors resolve, the agent issues a real pointer-based drag between them through the browser, the same low-level movement a person's mouse would produce, rather than firing only synthetic HTML5 drag events. That is why it works against libraries that listen for `pointermove` sequences.

A note on the two engines, because they observe the page differently. The default engine is **stagehand** (MIT, by Browserbase): it observes the live DOM at each step and decides the next action from what is rendered right then. The alternative is the **builtin** engine (an Anthropic tool-use loop) that captures native Playwright traces and re-derives the target from a fresh snapshot on every action, never caching a selector across runs. Either way, the source and target are computed from the page as it exists during the run. To be explicit: this is not self-healing and there is no saved selector being patched. The agent re-derives from live state each run, so a board that reordered its columns since last week simply resolves correctly this week with no edit from you. More on that distinction in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## Testing a kanban board

Kanban is the canonical case: cards in columns, and the behavior you care about is "a card I move ends up in the right column and persists." Here is a committable Markdown test for it.

Tests are intent, not selectors. A `*_test.md` file has a `#` title, ordered or unordered steps in plain English, `@import` for shared setup, and `{{variables}}` whose values are masked in logs when they are secret.

```markdown
# Kanban move card test

@import ./login_test.md

- Go to {{boardUrl}}
- Confirm the card titled "Write release notes" is in the In Progress column
- Move the card titled "Write release notes" to the Done column
- Confirm the card titled "Write release notes" now appears in the Done column
- Reload the page
- Confirm the card titled "Write release notes" is still in the Done column
```

Run it:

```bash
browserbash testmd run ./kanban_move_test.md
```

Two things make this a real test and not just an action. The verify steps before and after the move turn it into an assertion: the card has to start in In Progress and end in Done. The reload step checks that the move actually persisted to the backend rather than only nudging the DOM, which is the bug drag-and-drop tests most often need to catch. The `@import ./login_test.md` line keeps your authentication flow in one file and reused everywhere.

Because the steps describe cards and columns by their visible names, this same test keeps working when the board switches from react-beautiful-dnd to dnd-kit, when "In Progress" gets restyled, or when a new "Review" column appears between the others.

## Testing a sortable list (reorder)

Sortable lists are a different shape of problem. There are no named columns to drop into; you are changing the order of items relative to each other. The trick is to phrase the intent relative to other items, not to absolute positions, because absolute positions are exactly what the reorder is supposed to change.

```bash
browserbash run "in the priorities list, drag the item 'Fix login bug' so it sits above 'Update docs'"
```

Or as a committed test that asserts the resulting order:

```markdown
# Sortable list reorder test

- Go to {{listUrl}}
- Drag the item "Fix login bug" so it is above the item "Update docs"
- Confirm "Fix login bug" appears before "Update docs" in the list
- Drag "Fix login bug" to the top of the list
- Confirm "Fix login bug" is the first item in the list
```

Phrasing the target as "above 'Update docs'" or "to the top of the list" gives the agent a stable anchor that does not depend on the item's current index. "Move item 3 above item 5" would be fragile for the same reason index-based selectors are fragile: the indices are the moving part.

Late-loading is handled for you here. If the list lazy-loads items or animates the reorder, BrowserBash relies on Playwright built-in auto-wait (a 15 second ceiling, no manual `sleep()` calls), so the agent proceeds the moment an item is actionable rather than racing the animation or guessing at a delay.

## Testing reorder widgets and other variants

Reorder widgets (drag handles on table rows, image galleries you rearrange, a "drag to reorder steps" wizard, a dual-list "available vs selected" picker) all reduce to the same two-anchor pattern: name the thing you grab, name where it goes relative to something stable.

```bash
# Table rows with drag handles
browserbash run "in the steps table, drag the row 'Verify email' so it runs before the row 'Send welcome message'"

# Dual-list picker
browserbash run "in the permissions panel, move 'Export reports' from the Available list to the Selected list"
```

The dual-list case is really a kanban move in disguise: two named regions ("Available," "Selected") and one named item. If your widget exposes a drag handle as a separate control, you can still describe the item by name; the agent grabs the draggable element associated with it.

## Running drag tests in CI

Drag tests earn their keep in a pipeline, where flaky scripted drags are a notorious source of red builds. BrowserBash is built for that:

```bash
browserbash testmd run ./kanban_move_test.md --agent --headless --record
```

- `--agent` emits NDJSON so a CI job can parse each step.
- Exit codes are unambiguous: `0` pass, `1` fail, `2` error, `3` timeout.
- `--headless` runs without a display.
- `--record` saves a webm video plus screenshots, which is the thing you actually want when a drag fails, because watching the replay tells you instantly whether the card was grabbed, dropped in the wrong lane, or never moved. A `Result.md` is written per run.

For where the browser runs, `--provider` takes `local`, `cdp`, `browserbase`, `lambdatest`, or `browserstack`. You can opt into a cloud dashboard with `--upload` (free runs kept 15 days), or keep everything on your machine with `browserbash dashboard`.

## Choosing a model

The model resolves automatically by default: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist there). For drag-and-drop specifically, model capability matters more than for a simple click, because the agent has to reason about two anchors and a spatial relationship ("above," "into the Done column") at once. Small local models (8B parameters and under) get flaky on these longer, more ambiguous moves. A 70B-class local model (Qwen3 or Llama 3.3) or a capable hosted model is the safer choice for hard boards. Running locally means nothing leaves your machine, which is worth it when the board is behind your VPN.

## Honest limits

Drag-and-drop is where an intent-based agent hits its real ceiling, and pretending otherwise would not help you. Here is where BrowserBash struggles on this specific topic.

- **Canvas-based drags.** A whiteboard, a diagram editor, a node-graph builder, or anything rendered to a `<canvas>` exposes no accessibility tree and no DOM elements for the shapes inside it. The agent sees one canvas, not "the blue node" or "the connector." Naming a target inside a canvas will not resolve, because there is nothing named to resolve to. These need pixel-level or app-specific tooling, not intent.
- **Pointer-precise gestures.** Resizing by dragging a handle to an exact width, dropping within a few pixels of a snap line, drawing a freehand path, or any interaction where the precise distance and endpoint are the assertion. The agent moves to a sensible point on the target, not to a coordinate you specify, so "drag the slider to exactly 73%" or "resize this to 240px" is out of scope. Describe the outcome ("set the volume slider near maximum") rather than a pixel target, and accept it will be approximate.
- **Custom gesture handling that ignores standard pointer events.** Most mainstream libraries work, but a bespoke drag implementation that only listens for an unusual event sequence, or that requires a long-press, momentum, or multi-touch, may not respond to a standard pointer drag.
- **Ambiguous names.** If a board has three cards literally titled "Untitled" or five list items reading "New item," the agent cannot tell which one you mean. Give items distinguishing text, or anchor by relationship ("the Untitled card directly below 'Launch plan'").
- **Order-sensitive verification on virtualized lists.** A list that only renders the visible window can hide the item you expect to assert on. The agent may need to scroll it into view first; phrase a scroll-and-confirm step rather than assuming the whole list is in the DOM.

For these cases, a coordinate-driven Playwright or Selenium test, or a library-specific test harness, remains the right tool. That is not a knock on the agent approach; it is the correct boundary. Use intent for "the card ended up in Done," and use pixel-level scripting for "the handle landed at exactly 240px." An honest tool tells you which is which.

## FAQ

### How do I test a drag-and-drop kanban board with an AI agent?

Write the move as intent and let the agent resolve both ends. For example: `browserbash run "move the card titled 'Write release notes' to the Done column"`. The agent matches the card by its accessible name and the column by its region name, then performs a real pointer drag. Wrap it in a `*_test.md` file with confirm steps before and after, plus a reload step, to assert the move both happened and persisted. You never write a selector or a coordinate.

### Does BrowserBash work with libraries like react-beautiful-dnd, dnd-kit, or SortableJS?

Yes for the common case, because the agent performs a real pointer-based drag (a genuine `pointerdown`, `pointermove`, `pointerup` sequence with movement) rather than firing only synthetic HTML5 drag events, which is what those libraries listen for. A naive scripted `dragAndDrop` often does nothing against them. The exception is a bespoke gesture handler that requires an unusual event sequence, a long-press, or multi-touch, which may not respond.

### Can it test canvas-based drag-and-drop, like a whiteboard or diagram editor?

No, and this is the main honest limit. Canvas content has no accessibility tree and no per-shape DOM, so there is nothing named for the agent to grab or drop onto. It sees a single `<canvas>` element, not the shapes inside it. Canvas drags need pixel-level or app-specific tooling. Intent-based testing works when the draggable items and drop zones are real DOM elements with roles and names.

### How do I assert the result of a sortable-list reorder?

Phrase both the move and the assertion relative to other items, never by absolute index. Move with "drag 'Fix login bug' so it is above 'Update docs'," then assert with "confirm 'Fix login bug' appears before 'Update docs' in the list." Index-based phrasing ("move item 3 above item 5") is fragile because the reorder is precisely what changes the indices. Relative anchors stay stable across the move.

## Wrapping up

Drag-and-drop is the interaction that has cost testers the most maintenance for the least feature coverage, because every part of a scripted drag (source selector, target selector, gesture offsets) rots independently. Stating the move as intent collapses all three into one durable line: name the card, name the destination, assert it landed. The agent maps your words onto roles and accessible names, performs a real pointer drag, and re-derives everything from the live page on each run, so a relabeled column or a swapped drag library is a non-event. Keep canvas editors and pixel-exact gestures on coordinate-driven tools, and let intent handle the boards, lists, and reorder widgets that make up most real apps. Start at [the learn page](https://browserbash.com/learn) and write your first move test in a single line.
