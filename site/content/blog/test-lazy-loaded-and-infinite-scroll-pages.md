---
title: Testing Lazy-Loaded and Infinite-Scroll Pages with AI
description: "Test infinite scroll and test lazy loaded content automation without brittle indexes: scroll by intent, auto-wait for late content, assert on what is visible."
date: 2026-06-26
category: guide
---

Lazy-loaded and infinite-scroll pages break naive automation for one concrete reason: the element you want is not in the DOM until you scroll to it. A scripted test that does `page.locator('[data-row="42"]').click()` assumes row 42 already exists. On a virtualized feed it does not. It was never rendered, it sits in a placeholder, or it loads only after a scroll event fires and an XHR returns. The locator resolves to nothing, the test times out, and your pipeline goes red for a reason that has nothing to do with a real bug.

This guide shows how [BrowserBash](https://browserbash.com), the free open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy, handles those pages. The short answer up front: you write the *goal* of the scroll ("scroll until you find the post by {{author}} and open it"), and the agent scrolls, re-reads the live page, and decides what to do next from what is actually rendered right now. There is no fixed index baked into the test for a virtualized list to invalidate.

Install it with one command:

```bash
npm install -g browserbash-cli
```

## Why infinite scroll defeats fixed-index automation

Three things go wrong on feed-heavy and list-heavy apps, and they compound.

**The DOM is incomplete on purpose.** Modern feeds (social timelines, product grids, log viewers, admin tables) render only what is near the viewport. A list that shows 10,000 logical items might keep 20 to 40 DOM nodes alive at a time and recycle them as you scroll. The item you assert on may genuinely not be in the document until you bring it into view. Asserting on a hardcoded Nth row is asserting on something that does not exist yet.

**Content arrives after the scroll, not before it.** Scrolling triggers a fetch. The fetch resolves late. If your test scrolls and immediately asserts, it races the network and loses intermittently. The classic fix, a `sleep(3)`, is both flaky (sometimes 3 seconds is not enough) and slow (sometimes the content was there in 200ms and you wasted the rest).

**The position is not stable.** Item ordering on a live feed changes between runs. A new post lands at the top, an ad slot shifts everything down, a "you might also like" block injects itself. Any test that says "click the 5th card" is making a bet about ordering that loses a little more every deploy.

BrowserBash sidesteps all three because it never stores a position or a selector. It stores intent and resolves it against the page as it exists during the run. The deeper mechanism is covered in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis); the rest of this post is the scroll-specific application.

## Intent-level scroll steps: describe the goal, not the index

The core move is to write the *outcome* of the scroll and let the agent figure out the scrolling. BrowserBash observes the live DOM on each step (the stagehand default), so after every scroll it re-reads what is now on screen and decides whether it found the target or needs to keep going.

A one-off objective from the shell:

```bash
browserbash run "go to the demo store, scroll the product list until you find the product named 'Sauce Labs Fleece Jacket', and open it"
```

The agent does not need to know the item is the 7th card or that the grid lazy-loads in pages of 12. It scrolls, re-reads the rendered cards, and stops when a card matching that name appears. If the catalog reorders tomorrow, the same line still works, because the instruction is about the product, not its coordinates.

The same pattern with a `{{variable}}` so the objective is reusable across data:

```bash
browserbash run "scroll the feed until you find a post by {{author}} and open it"
```

`{{variables}}` are substituted at run time and masked in logs when they hold secrets, so you can parameterize the hunt without hardcoding one specific author into the test.

For anything past a single step, commit a Markdown test file. Each list item is a plain-English step, and the scroll step reads like an instruction you would give a human tester:

```markdown
# Find and open a product (infinite-scroll grid)

- Go to {{baseUrl}}
- Scroll the product grid until you find the product named "{{productName}}"
- Open that product
- Verify the product detail page shows the title "{{productName}}"
```

Run it:

```bash
browserbash testmd run ./find_product_test.md
```

Because the agent re-derives what to click from a fresh read of the page on every action, "scroll until you find X" is robust to the item starting off-screen. That is the whole point: the element does not have to be in the DOM when the step starts, only by the time the agent has scrolled it into view.

## Auto-wait handles content that loads late after a scroll

Scrolling is half the problem. The other half is the fetch that fires *because* you scrolled and resolves a beat later. BrowserBash leans on Playwright's built-in auto-waiting here rather than manual sleeps. After a scroll, when the agent goes to act on or assert about an element, the underlying wait polls for that element to be present and actionable and proceeds the instant it is, up to a 15 second ceiling.

In practice that means:

- You do not write `sleep(5)` after a scroll to "let the next page load." The wait is implicit and ends as soon as the content is actionable.
- A slow XHR that takes two seconds to return new feed items does not cause a false failure, because the assertion that depends on those items waits for them.
- You are not paying a fixed penalty on fast runs. If the content rendered in 300ms, the step continues at 300ms, not at whatever number you guessed.

So a step like this is safe without any explicit wait:

```markdown
- Scroll down to load more results
- Verify a result card for "{{productName}}" is visible
```

The "is visible" assertion auto-waits for the lazily fetched card to appear and render, within the ceiling. No manual timing, and no flaky `sleep`. If the content legitimately never loads, you get a real, honest failure at the timeout rather than a false pass.

## Patterns for the four common cases

Feed and list UIs come in a handful of shapes. Here is how to express each one.

### Load-more buttons: click until a condition is true

Some lists page in behind an explicit "Load more" or "Show more" control instead of scroll. Write the *stop condition*, not a fixed number of clicks:

```markdown
# Load-more pagination

- Go to {{baseUrl}}/results
- Keep clicking the "Load more" button until a result for "{{targetItem}}" appears, or until the button is no longer shown
- Open the result for "{{targetItem}}"
- Verify the detail view shows "{{targetItem}}"
```

The "or until the button is no longer shown" clause matters. It gives the agent a terminal state so the loop ends when the list is exhausted, instead of hunting forever for something that is not there.

### Virtualized lists: assert by content, never by Nth row

Virtualized containers (think a windowed table or a recycler view) only keep a handful of rows in the DOM. Off-screen rows are genuinely absent. Do not assert "the 50th row says X" because there is no 50th row node. Assert on the content and let the agent scroll it into view first:

```markdown
# Virtualized table lookup

- Go to {{baseUrl}}/orders
- Scroll the orders table until you find the order with ID "{{orderId}}"
- Verify that row shows status "{{expectedStatus}}"
```

The agent scrolls the virtualized container, re-reads the rendered window on each step, and checks the matched row. You are asserting on the order, identified by its ID, not on a DOM index that the virtualization layer recycles.

### Infinite feeds: scroll until a marker or a count is reached

Endless feeds need *you* to supply the stop condition, because "scroll forever" is not a test (more on that in the limits section). Anchor the scroll to a marker or a target count:

```markdown
# Infinite feed, stop at a marker

- Go to {{baseUrl}}/feed
- Scroll the feed until you see the post by {{author}} titled "{{postTitle}}", or until you have scrolled past 50 posts
- Verify the post by {{author}} is visible
```

Or anchor it to a count when you are testing that the feed *can* load a depth of content:

```markdown
# Infinite feed, depth check

- Go to {{baseUrl}}/feed
- Scroll the feed until at least 30 posts have loaded
- Verify a post by {{author}} appears among the loaded posts
```

### Lazy-loaded images: wait for the visible state, not the markup

Images that lazy-load swap a placeholder for the real asset only when they enter the viewport. Test the observable outcome (the image is visible) rather than poking at `src` attributes:

```markdown
# Lazy-loaded image

- Go to {{baseUrl}}/gallery
- Scroll to the image captioned "{{caption}}"
- Verify the image captioned "{{caption}}" is visible
```

The auto-wait gives the lazy image time to enter the visible state after the scroll brings it into the viewport, and the assertion is about what a user would actually see.

## Assertions that survive virtualization

The single rule that keeps these tests stable: assert on what is visible and on semantic content, not on the internal bookkeeping of a virtualized container.

A hardcoded row count of a virtualized list is the trap. If the container only renders 20 of 10,000 rows into the DOM, an assertion like "there are 10,000 rows" is false against the DOM and "there are 20 rows" is meaningless because it just measures the window size, not your data. Both are testing the rendering strategy, not the feature.

Assert on identity and visibility instead:

```markdown
# Good: semantic, visible-state assertions
- Verify the feed shows a post by {{author}}
- Verify a product card for "{{productName}}" is visible
- Verify the order row for "{{orderId}}" shows status "Shipped"
```

```markdown
# Avoid: counting nodes in a virtualized container
- Verify the list contains exactly 200 rows
- Verify the 50th card is the "{{productName}}" card
```

The reason the "good" set holds up: BrowserBash resolves "a post by {{author}}" by reading the live page and finding content that means that, the same way it finds elements through the page's accessibility structure rather than fragile CSS paths. That mechanism is detailed in [how BrowserBash finds elements with the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree). Because the assertion is semantic, it does not care whether the matching node is the 3rd or the 30th in the rendered window, only that the thing you described is present and visible after the scroll.

This is also why these tests read as intent, not selectors: the whole file describes *what should be true for a user*, and there is not a single CSS selector or row index in it to rot when the markup or the ordering changes.

## A complete example you can adapt

Here is an end-to-end `*_test.md` that ties the patterns together for a feed-heavy app. Shared login is pulled in with `@import`, data comes from `{{variables}}`, and every scroll step has a goal and the assertions are semantic.

```markdown
# Feed smoke test: find, open, and verify a post

@import ./login_test.md

- Go to {{baseUrl}}/feed
- Scroll the feed until you find a post by {{author}} titled "{{postTitle}}", or until you have scrolled past 60 posts
- Verify a post by {{author}} is visible
- Open the post titled "{{postTitle}}"
- Verify the post detail view shows the title "{{postTitle}}"
- Verify the post detail view shows an author of {{author}}
```

Run it with values supplied at the command line or from your config:

```bash
browserbash testmd run ./feed_test.md
```

The agent logs in via the imported steps, scrolls the live feed re-reading it on each step, stops at the matching post (or at the 60-post safety bound), opens it, and asserts on the visible title and author. Nothing in the file pins a row index or a selector, so a reordered feed or a markup refactor does not break it. For the broader take on why this style cuts down on red builds, see [reduce flaky end-to-end tests](https://browserbash.com/blog/reduce-flaky-end-to-end-tests).

If your feed-heavy surface is a B2B dashboard with dense tables and saved views, the data-grid-specific guidance in [AI testing for B2B SaaS dashboards](https://browserbash.com/blog/ai-testing-for-b2b-saas-dashboards) pairs well with the virtualized-list patterns above.

## Honest limits

This approach is not magic, and pretending otherwise would set you up for surprises. Here is where it genuinely struggles.

**Truly endless feeds need a stop condition you specify.** A feed that never ends has no natural terminal state, and "scroll forever" is not a test, it is a hang. You must give the agent a bound: a marker to scroll to, a target count, or a maximum number of posts to scroll past. Every infinite-feed example above includes that bound for exactly this reason. If you omit it and the target is not present, the run keeps scrolling until something else stops it.

**Long scroll hunts cost more model steps and more time.** Each scroll-and-re-read is a step the agent reasons about. Hunting for an item that sits 500 rows down is more steps, more model calls, and more wall-clock time than clicking a known control near the top. If you know the target is deep, prefer a more direct route (a search box, a filter, a deep link to the item) over a long blind scroll, and keep the scroll bound tight.

**Off-screen items in a virtualized DOM are genuinely absent.** This is not a BrowserBash limitation, it is how virtualization works, but it shapes how you assert. You cannot assert on a row that was never rendered. Always assert on the visible state after scrolling the target into view, and on semantic content (an ID, an author, a title) rather than on a count of a windowed container. If you write an assertion that depends on all rows existing at once, it will fail against a virtualized list no matter what tool you use.

**No self-healing claims here.** BrowserBash tolerates change because it resolves intent against the live page on every action, not because it patches a broken selector behind your back. If the thing you described is genuinely gone from the page, the test fails honestly at the timeout, which is what you want from a test.

## FAQ

### How do I test infinite scroll without a fixed item index?

Write the goal of the scroll instead of an index. A step like "scroll the feed until you find a post by {{author}} and open it" lets the agent scroll and re-read the live page until the described item appears, so it does not matter whether that item is the 3rd or the 300th. There is no hardcoded position for a reordered or virtualized feed to break. Always include a stop bound (a marker or a max scroll count) so an absent item does not scroll forever.

### Do I need manual sleeps for content that loads after a scroll?

No. BrowserBash relies on Playwright's built-in auto-waiting, up to a 15 second ceiling, so when a step acts on or asserts about an element it waits for that element to be present and actionable and continues the instant it is. Content fetched late because of a scroll is covered by that wait, so you do not write `sleep()` calls, and fast runs are not slowed down by a fixed guess.

### How should I assert on a virtualized list where most rows are not in the DOM?

Assert on visible, semantic content, not on a row count or an Nth-row index. Off-screen rows in a virtualized container are genuinely not rendered, so "the list has 200 rows" or "the 50th row is X" will not hold. Instead, scroll the target into view by its identity ("scroll until you find the order with ID {{orderId}}") and assert on that row's content. BrowserBash matches the described content against the live page, so the assertion holds regardless of the item's position in the rendered window.

### What stops the agent from scrolling forever on an endless feed?

You do, by giving it a stop condition. Anchor the scroll to a marker ("until you see the post titled {{postTitle}}"), a target count ("until at least 30 posts have loaded"), or an upper bound ("or until you have scrolled past 60 posts"). The agent stops when the condition is met or the bound is reached. Without a bound, an absent target means the scroll only ends when some other limit kicks in, which is not the behavior you want from a test.

## Where to go next

If you write feed-heavy or list-heavy tests, the pattern is consistent: describe the scroll goal, let auto-wait absorb the late content, and assert on visible semantic content rather than indexes into a virtualized DOM. BrowserBash is free and open-source under Apache-2.0, so you can read exactly how the scroll and wait behavior works.

Browse the capabilities on [the features page](https://browserbash.com/features), and work through more worked examples in [the learn section](https://browserbash.com/learn). Then point a `scroll until you find ...` objective at your own feed and watch it re-read the page on every step instead of betting on a row that may not exist yet.
