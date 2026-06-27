---
title: Testing Data Tables, Sorting, and Pagination With AI
description: "Test data table behavior with AI: assert row order after sorting, navigate pages, verify filtered results, and read table semantics by role, not CSS."
date: 2026-06-27
category: testing
---

To test a data table with AI, you describe the table behavior you care about in plain English and let an agent read the rendered grid through its accessibility roles, then assert on the values it sees. You sort a column and check the first row holds the expected value, you click to the next page and check the row that should appear, you apply a filter and check the rows that survive it. No `nth-child` selectors, no hardcoded row indexes that shatter when a column moves, no `waitForSelector` after every click. You write the intent, the agent re-reads the live table on each step, and the assertion runs against what is actually on screen right now.

This article walks through how that works concretely with BrowserBash, a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. I will show real `*_test.md` files for sorting, pagination, and filtering, explain how the agent reads table semantics through the accessibility tree, and be honest about where this approach struggles, especially on virtualized grids where most rows are not in the DOM at all. I will also stay fair to Playwright and Selenium, which remain excellent tools for table testing when you want byte-level determinism.

## Why data tables break selector-based tests

A data grid is the single most selector-hostile surface in a web app. Think about everything that legitimately changes between two correct renders of the same table:

- Sorting reorders every row, so any test pinned to "row 3" is now testing a different record.
- Pagination swaps the entire row set, so a selector that found a value on page 1 finds nothing on page 2.
- Filtering removes rows, shifting every index below the removed ones.
- Column reordering or a show/hide-columns control moves the cell you targeted into a different position.
- Virtualization renders only the visible window, so the row you want may not exist in the DOM until you scroll.

A traditional locator like `table tbody tr:nth-child(3) td:nth-child(2)` encodes a position, not a meaning. The position is correct for exactly one arrangement of the data. The moment a user sorts, filters, or pages, the position points at the wrong cell, and your assertion either fails loudly or, worse, passes against the wrong value. This is why table tests have a reputation for being the flakiest suite in the building.

The fix is to stop testing positions and start testing meaning. A human verifying a sort does not count to the third `tr`. They look at the column, read the top value, and check it is the smallest or largest. That semantic eye is exactly what an agent-driven test brings to a grid. BrowserBash is not self-healing: it does not patch a saved selector behind your back. It re-derives what to read from the live page on every action, so a reordered or repaginated table is just a new page to read, not a broken script to repair.

## How the agent reads a table: roles, not classes

Before the assertions make sense, it helps to know what the agent actually looks at. BrowserBash finds elements through the accessibility tree (roles, accessible names, and states) plus the DOM, not through CSS classes. A well-built HTML table exposes a rich semantic structure that the agent reads directly:

- The table itself has the `table` role.
- Header cells have the `columnheader` role with their text as the accessible name ("Name", "Price", "Created").
- A sortable header exposes an `aria-sort` state of `ascending`, `descending`, or `none`.
- Data cells have the `cell` (or `gridcell`) role, and the row has the `row` role.
- Pagination controls surface as buttons with accessible names like "Next page" or "Go to page 3".

Because the agent reads this structure, it can find "the Price column" by its header name and read the cell values under it, rather than counting columns. It can tell that a header is currently sorted ascending by reading `aria-sort`. It handles iframes and Shadow DOM, so a table mounted inside a web component or an embedded report frame is still readable. For the full picture of how this resolution works, see [how BrowserBash finds elements via the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree).

The practical consequence: your assertions can name things the way a person would. "Verify the Status column shows Active for the row whose Email is {{userEmail}}" is a sentence the agent can resolve against the live grid, because it can find the Status column by its header, find the row by a value it contains, and read the intersecting cell.

A caveat worth stating up front: this depends on the table being built with real semantics. A grid assembled from a pile of `<div>` elements with no roles gives the agent far less to work with. Modern grid libraries (the data-grid components in the major React, Vue, and Angular ecosystems) generally apply ARIA grid roles, but a hand-rolled `<div>` table without `role="grid"` is genuinely harder to read, and I will come back to that in the honest-limits section.

## Asserting row order after sorting

Sorting is the canonical table test, and it is where positional selectors hurt most. With BrowserBash you assert on the value that should land in a known position after the sort, not on a fixed row from before it.

Here is a `*_test.md` file. The format is plain Markdown: a `#` title, `-` or `1.` numbered steps, `{{variables}}` for data, and `@import` to pull in shared setup like login.

```markdown
# Users table: sort by name and verify order

@import ./login_test.md

- Go to {{baseUrl}}/admin/users
- Verify a table with a column header "Name" is visible
- Click the "Name" column header to sort ascending
- Verify the first row's Name cell comes alphabetically before the second row's Name cell
- Verify the Name column header indicates an ascending sort
- Click the "Name" column header again to sort descending
- Verify the first row's Name cell comes alphabetically after the second row's Name cell
```

Two things make this robust. First, the assertions are relational ("the first row comes before the second row alphabetically"), so they hold for any dataset, not just the one row you happened to see when you wrote the test. Second, the sort-direction check reads the header state, which the agent gets from `aria-sort`, so you are confirming the control actually toggled, not just that some rows moved.

When you do know the exact expected value, assert it directly:

```markdown
# Orders table: sort by total descending, check top order

@import ./login_test.md

- Go to {{baseUrl}}/orders
- Click the "Total" column header until the table is sorted by total, highest first
- Verify the first row shows an order with a Total of {{highestTotal}}
- Verify the first row's Status is "Paid"
```

The agent reads the Total column by its header name, sorts highest-first, then reads the first row's cells. Because it re-reads the table after the sort completes, there is no stale snapshot from before the click. The phrase "until the table is sorted by total, highest first" lets the agent click once or twice as needed, since some grids cycle none, then ascending, then descending.

You can also drive a single ad hoc sort check without a file:

```bash
browserbash run "Open the products page, sort the table by Price ascending by clicking the Price header, and confirm the first row's price is the lowest visible price"
```

For the deeper mechanics of how these English assertions get evaluated against the page, [natural-language assertions and how they work](https://browserbash.com/blog/natural-language-assertions-how-they-work) goes through the matching step by step.

## Navigating and verifying pagination

Pagination swaps the whole row set, which destroys any test that cached a row from a prior page. The agent-driven approach is to navigate by the control's meaning ("Next page", "page 3") and assert on what should appear there.

```markdown
# Customers table: paginate and verify the right rows show

@import ./login_test.md

- Go to {{baseUrl}}/customers
- Verify the pagination shows page 1 is the current page
- Verify the customer "{{firstPageCustomer}}" is visible in the table
- Click the "Next page" control
- Verify the pagination shows page 2 is the current page
- Verify the customer "{{secondPageCustomer}}" is visible in the table
- Verify the customer "{{firstPageCustomer}}" is no longer visible in the table
```

That last step matters more than it looks. Verifying the page-1 customer is gone confirms the table actually advanced rather than appending rows or no-opping a broken Next button. The agent reads the live grid after the click, so "no longer visible" is checked against the rows that are genuinely rendered now.

Page-size controls are testable the same way, by describing the effect rather than the widget internals:

```markdown
# Reports table: change page size and confirm row count

@import ./login_test.md

- Go to {{baseUrl}}/reports
- Set the rows-per-page control to 50
- Verify the table shows no more than 50 data rows
- Verify the pagination control reflects a page size of 50
```

A note on row-count assertions: they are reliable when the grid renders all the rows for the current page into the DOM, which most classic paginated tables do. They are not reliable on a virtualized grid that only mounts the visible window. If your "50 per page" grid still virtualizes, asserting an exact count of rendered rows will not hold, because the DOM never contains all 50 at once. Prefer asserting on a specific record you expect on the page over a raw count when virtualization is in play. The same windowing realities show up in feeds and endless lists, covered in [testing lazy-loaded and infinite-scroll pages](https://browserbash.com/blog/test-lazy-loaded-and-infinite-scroll-pages).

## Verifying filtered results

Filtering is where you most want assertions on meaning, because the whole point is that some rows survive and others vanish. Describe the filter, then assert on both inclusion and exclusion.

```markdown
# Invoices table: filter by status and verify the result set

@import ./login_test.md

- Go to {{baseUrl}}/invoices
- Type "{{searchTerm}}" into the table's search box
- Verify every visible row's Customer cell contains "{{searchTerm}}"
- Clear the search box
- Open the Status filter and select "Overdue"
- Verify every visible row shows a Status of "Overdue"
- Verify no visible row shows a Status of "Paid"
```

"Every visible row's Status is Overdue" is a universally-quantified assertion: it should hold for all rendered rows, not just the first. The agent reads the Status column across the visible rows and checks them. Pairing it with "no visible row shows Paid" catches a filter that silently does nothing, which a positive-only check would miss.

Combine filter and sort to test the interaction, which is where real bugs hide:

```markdown
# Tickets table: filter then sort, verify both hold

@import ./login_test.md

- Go to {{baseUrl}}/support/tickets
- Open the Priority filter and select "High"
- Verify every visible row shows a Priority of "High"
- Click the "Created" column header to sort oldest first
- Verify the first row's Created date is earlier than the last row's Created date
- Verify every visible row still shows a Priority of "High"
```

The final step is the one teams forget: confirming the sort did not quietly drop the filter. Because the agent re-reads the grid after the sort, it checks the current rendered state rather than assuming the filter persisted.

If your tables are the centerpiece of a dense internal tool or analytics product, the grid-heavy patterns in [AI testing for B2B SaaS dashboards](https://browserbash.com/blog/ai-testing-for-b2b-saas-dashboards) build on everything here. And if you need the table values themselves rather than just a pass/fail, the [extract-and-store-data tutorial](https://browserbash.com/blog/browserbash-extract-and-store-data-tutorial) shows how to pull cell values out as structured output.

## Handling late-loading table data

Grids frequently fetch their rows after the initial paint, then re-fetch on every sort, filter, and page change. You do not write sleeps for any of this. BrowserBash leans on Playwright's built-in auto-waiting, with a 15-second ceiling, so when a step acts on or asserts about a cell, it waits for that content to be present and actionable and proceeds the instant it is. No `sleep(2)` after clicking a header, no fixed guess that is too short on a slow CI box and wastefully long on a fast one. A step like "Verify the first row shows an order with a Total of {{highestTotal}}" waits for the re-sorted rows to land before it reads them.

The 15-second ceiling is a real bound, though. A grid whose server query routinely takes longer than that under load will time out, and the right fix is to make the data path faster or stub it, not to wish the ceiling away.

## Running tables tests in CI

Table suites belong in CI, and the agent flag makes them parseable.

```bash
browserbash testmd run ./users_sort_test.md --agent --headless
```

`--agent` emits NDJSON so a pipeline can stream and parse each step. Exit codes are conventional: `0` pass, `1` fail, `2` error, `3` timeout, so your CI gate reads naturally. `--headless` runs without a visible browser, and `--record` captures a webm plus screenshots, which is invaluable when a sort assertion fails and you want to see the grid state that produced it. A `Result.md` is written per run, and `--upload` opts into a cloud dashboard (free runs kept 15 days) if you want shareable history, while `browserbash dashboard` serves a local one.

On model choice, the default is `auto`: it resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist). For local-only work nothing leaves your machine, which matters if the table holds customer data. One honest caveat: small local models (roughly 8B and under) get flaky on long multi-step table flows, dropping a filter step or misreading a column. For demanding sort-filter-paginate chains, a 70B-class local model (Qwen3, Llama 3.3) or a capable hosted model is the reliable choice.

## Honest limits

This approach is genuinely good at table behavior, but it is not magic, and pretending otherwise would set you up for surprises.

**Virtualized grids only render the visible window.** This is the big one. A virtualized data grid (common in high-performance React and Angular table libraries) mounts only the rows currently on screen. An assertion like "the table has 200 rows" or "the 150th row is X" cannot hold, because those rows are not in the DOM until you scroll them into view. This is not a BrowserBash limitation, it is how virtualization works, and it would defeat Playwright and Selenium the same way. Test virtualized grids by scrolling the target into view by its identity ("scroll until you find the order with ID {{orderId}}") and asserting on that visible row, never on a total count or a global index.

**Counting rows across pages is not a single assertion.** "There are 4,000 customers total" is a claim about data behind the pagination, not about the rendered page. The agent reads what is on screen. If you need a cross-page total, assert on the count the UI displays ("the table footer shows 4,000 results") rather than expecting the agent to add up rows it never rendered.

**`<div>` soup tables are harder to read.** A grid built from bare `<div>` elements with no `role="grid"`, no `columnheader`, and no `aria-sort` gives the agent thin semantics to work with. It can still use visible text and layout, but a header that exposes no sort state means the agent cannot confirm sort direction from the control, only infer it from the data order. The better the table's accessibility, the more reliable the test, which is a happy alignment: building an accessible grid also makes it testable.

**Exact pixel rendering of cells is out of scope.** If your bug is "the price is rendered in red but should be green" or "the currency symbol is misaligned by 2px", a semantic table reader is the wrong tool. That is visual-regression territory. The agent verifies values and structure, not exact styling.

**No self-healing claims here.** BrowserBash tolerates a reordered or repaginated table because it resolves your intent against the live grid on every action, not because it repairs a broken selector. If the column you described is genuinely gone from the page, the test fails honestly at the timeout, which is exactly what you want a test to do. Where you need byte-exact, model-free determinism on a stable grid, a tuned Playwright or Selenium locator is still a perfectly good answer, and an honest article should say so.

## FAQ

### How do I assert that a table is sorted correctly without hardcoding row values?

Use relational assertions that compare adjacent rows rather than naming specific values. A step like "Verify the first row's Name cell comes alphabetically before the second row's Name cell" holds for any dataset, because it checks ordering, not a fixed value. Pair it with a check on the header's sort state ("Verify the Name column header indicates an ascending sort"), which the agent reads from the `aria-sort` attribute, so you confirm both that the rows are in order and that the control actually toggled. When you do know the exact top value after a sort, assert it directly for a tighter check.

### Can the agent verify pagination moved to the right page?

Yes, and the reliable pattern is to assert on three things: the current-page indicator, a record you expect on the new page, and the absence of a record from the old page. Checking that a page-1 row is "no longer visible" after clicking Next confirms the table actually advanced rather than appending rows or no-opping a broken control. The agent reads the live grid after the click, so each of these is evaluated against the rows genuinely rendered at that moment, not a stale snapshot from before the navigation.

### How should I test a virtualized table where most rows are not in the DOM?

Assert on visible, semantic content after scrolling the target into view by its identity, never on a total row count or a global row index. Off-screen rows in a virtualized grid are genuinely not rendered, so "the list has 200 rows" or "the 150th row is X" will not hold against any tool, not just BrowserBash. Instead write "scroll until you find the order with ID {{orderId}}, then verify its Status is Shipped". If you need a total, read the count the UI itself displays in a footer or summary rather than expecting the agent to tally rows it never mounted.

### Do I need waits or sleeps for tables that fetch rows after a sort or filter?

No. BrowserBash relies on Playwright's built-in auto-waiting, up to a 15-second ceiling, so when a step reads or acts on a cell it waits for that content to be present and actionable, then proceeds the instant it is. Grids re-fetch on every sort, filter, and page change, and that re-fetched data is covered by the same wait, so you do not write `sleep()` calls. Fast runs are not slowed by a fixed guess, and slow CI machines are not flaky from a guess that was too short. The only thing to watch is that the 15-second ceiling is a real bound for unusually slow server queries.

## Where to go next

Testing a data table well comes down to one shift: stop asserting on positions and start asserting on meaning. Name the column by its header, find the row by a value it holds, read the cell at the intersection, and let auto-wait absorb the re-fetch after every sort, filter, and page change. Do that and a reordered or repaginated grid stops being your flakiest suite.

BrowserBash is free and open-source under Apache-2.0, so you can read exactly how the table reading, sorting, and assertion behavior works. Browse the capabilities on [the features page](https://browserbash.com/features), work through more examples in [the learn section](https://browserbash.com/learn), then point a `sort the table by ... and verify the first row` objective at your own grid and watch it re-read the table on every step instead of betting on a row index that the next sort will invalidate.
