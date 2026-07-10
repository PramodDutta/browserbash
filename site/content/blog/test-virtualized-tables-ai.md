---
title: Test Virtualized and Infinite Tables With AI
description: "A practical guide to test virtualized table automation with AI: assert on-demand rows in react-window and ag-grid without brittle selectors."
date: 2026-07-14
category: guide
---

Virtualized grids are the classic reason a "simple" table test turns into a two-hour selector fight. You want to check that row 4,812 shows the right invoice total, but the DOM only holds the 30-odd rows currently painted inside the scroll window. That is exactly the problem test virtualized table automation with AI is built to solve: instead of computing pixel offsets and firing synthetic scroll events, you describe the row you care about in plain English and let an agent drive a real browser until that row renders, then assert on it. This guide walks through how windowed grids like react-window and ag-grid actually behave, why traditional selectors break, and how to write tests that scroll, wait, and verify the way a human would.

If you have ever written `page.locator('[data-row-index="4812"]')` and watched it time out because that node has never existed in the DOM, you already understand the core issue. Let's fix it properly.

## Why virtualized tables break normal test automation

A virtualized (or "windowed") table only mounts the rows currently in view, plus a small overscan buffer. Libraries like react-window, react-virtualized, TanStack Virtual, and ag-grid's row virtualization keep a fixed-size pool of DOM nodes and recycle them as you scroll. A grid that logically holds 50,000 rows might have 25 to 40 `<div role="row">` elements in the DOM at any instant. Scroll down and those same nodes get repositioned with a transform and repopulated with new data.

This design is great for performance and terrible for naive automation. Three things break at once:

First, **element existence is transient**. The node for a given record is not absent because your selector is wrong; it is absent because the framework has not rendered it yet. Standard waits (`waitForSelector`) will sit there until timeout because the condition can only become true after a scroll that your test never triggered.

Second, **indexes lie**. Many virtualization libraries reuse `data-index` or `aria-rowindex` attributes, or they renumber based on the visible window rather than the logical dataset. The third row on screen might be logical row 8,000. A test that assumes on-screen position maps to data position will pass on an empty grid and fail silently on a full one.

Third, **scroll is the hidden precondition**. To assert anything about a distant row, you first have to get it into the viewport, and virtualized grids often need a settle frame after each scroll before the row content stabilizes. Fire your assertion one animation frame too early and you read stale recycled content from the previous row that occupied that node.

The result is the flakiest category of UI test most teams own. You can absolutely make it work with hand-written Playwright, but it takes careful scroll-into-view logic, retry loops, and intimate knowledge of the specific grid library. Change the grid config and half your helpers rot.

## The AI approach: describe the row, not the DOM path

BrowserBash flips the model. It is a free, open-source natural-language browser automation CLI: you write a plain-English objective, and an AI agent drives a real Chrome browser step by step (no selectors, no page objects), then returns a deterministic verdict plus structured results. For a virtualized table, that means you say what you want to be true, and the agent figures out the scrolling.

Here is the simplest possible smoke test against a windowed grid:

```bash
npm install -g browserbash-cli

browserbash run "Open https://your-app.test/reports/invoices and \
  scroll the invoices table until the row for invoice INV-48120 is visible, \
  then confirm its Amount column reads 2,450.00" --agent --headless
```

The agent snapshots the page, sees a virtualized grid, and does what a person does: scrolls, waits for the row to paint, reads it, and reports back. Because it is reading the rendered accessibility tree rather than guessing at a static selector, it does not care whether the grid is react-window or ag-grid or a hand-rolled canvas overlay, as long as the row is reachable and readable.

The `--agent` flag emits NDJSON (one JSON event per line) so a CI pipeline or an AI coding agent can consume the result without parsing prose. Exit codes are frozen and boring on purpose: 0 passed, 1 failed, 2 error, 3 timeout. That determinism is the whole point. You get a human-style test with machine-readable output. The BrowserBash [features overview](https://browserbash.com/features) covers the full event schema if you want to wire this into an existing reporter.

### What "the agent scrolls for you" actually means

It is worth being precise so you know what you are buying. The agent does not have magic access to unrendered rows. It cannot read logical row 4,812 while row 4,812 is unmounted, any more than you can. What it does is close the loop: it scrolls, re-snapshots, checks whether the target appeared, and repeats until the row is present or it exhausts its step budget. You are trading a brittle hard-coded scroll calculation for an adaptive search. That is a real, honest improvement for windowed grids specifically, because the failure mode of hard-coded scrolling (wrong offset, row never appears) becomes a search that self-corrects.

## Writing deterministic assertions with Verify steps

Plain-English objectives are great for exploration, but for a suite you commit and run in CI, you want assertions that do not depend on model judgment. That is what BrowserBash's `Verify` steps are for. In a `*_test.md` file, a `Verify` line compiles to a real Playwright check (URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, stored value equals) with no LLM involved. A pass means the condition genuinely held; a fail comes with expected-versus-actual evidence in the `run_end.assertions` block and the Result.md table.

For a virtualized table, the pattern is: use natural-language steps to navigate and scroll, then pin down the checkable facts with `Verify`. A test file might look like this:

```markdown
# Invoice grid renders on-demand rows

- Open https://your-app.test/reports/invoices
- Scroll the invoices table until invoice INV-48120 is visible
- Verify text "INV-48120" is visible
- Verify text "2,450.00" is visible
- Verify "Export" button is visible
```

The first two steps are agent-driven (they need judgment about how far to scroll and when the row settled). The three `Verify` steps are deterministic gates. If `INV-48120` never scrolls into view, the text-visible check fails with evidence rather than a vague "the agent thought it looked fine." That split, judgment where you need it and determinism where you can get it, is how you keep a virtualized-grid suite from going flaky. The [learn section](https://browserbash.com/learn) has a deeper reference on the full Verify grammar.

If you write a `Verify` line that falls outside the supported grammar, it still runs, but agent-judged, and gets flagged `judged: true` in the output so you can tell the two apart at a glance. No silent downgrades.

## Counting rendered rows without fooling yourself

A frequent virtualized-grid assertion is "the grid shows N rows." Be careful what you actually mean, because with virtualization there are two very different numbers:

- The **rendered row count**: how many row nodes are in the DOM right now (small, roughly viewport-sized, plus overscan).
- The **logical row count**: how many records the dataset contains (large, usually shown in a footer like "50,000 results").

These are not interchangeable, and conflating them is the single most common virtualized-table test bug. An element-count assertion on `role="row"` will return the rendered count (maybe 32), never the logical count. That is correct behavior, not a defect, but if your test expected 50,000 it will fail for the wrong reason.

The reliable approach is to assert the logical count from wherever the app displays it (a results footer, a header badge, an aria-live region) and assert the rendered behavior separately.

```markdown
# Grid reports the right totals

- Open https://your-app.test/reports/invoices
- Verify text "50,000 results" is visible
- Scroll to the bottom of the invoices table
- Verify text "INV-50000" is visible
```

Here the first `Verify` pins the logical total from the footer, and the last one proves the grid can actually virtualize all the way to the final record. Together they cover both halves of the virtualization contract: the dataset is complete, and every row is reachable. If you genuinely need to assert on the rendered node count (for example, to prove overscan is not ballooning), do it as a separate, explicit element-count check and document why the number is small.

## Testing infinite scroll and lazy-loaded pages

Infinite tables add a wrinkle on top of virtualization: rows do not exist client-side at all until a scroll triggers a fetch. So there are two async gates in series, the network round-trip and then the render. A human handles this without thinking: scroll, wait for the spinner to disappear, keep going. The agent does the same, which is why natural-language scrolling holds up better here than a fixed scroll loop that has no idea a fetch is still in flight.

For infinite grids, lean on the settle language in your objective:

```bash
browserbash run "Open https://your-app.test/feed and scroll the results list, \
  waiting for each new batch of rows to finish loading, \
  until you reach the item titled 'Q3 Reconciliation' and confirm it is visible" \
  --agent --headless --timeout 180
```

The `--timeout 180` matters for infinite scroll. If reaching your target means loading 40 pages of results, give the run enough runway. When a test legitimately needs a long time, raising the timeout is better than watching it exit 3 (timeout) and calling the app broken.

### Seeding data first with testmd v2 API steps

There is a chicken-and-egg problem with big-table tests: to prove the grid renders row 48,120, that row has to exist. Hand-clicking 48,000 records into a test environment is not a plan. testmd v2 solves this by letting you seed data deterministically before you check the UI.

Add `version: 2` frontmatter to a `*_test.md` file and steps execute one at a time against a single browser session, with two step types that never touch a model. API steps (`GET`, `POST`, `PUT`, `DELETE`, `PATCH` with an optional body, plus `Expect status N` and optional `store $.path as 'name'`) seed and read data. `Verify` steps then check it through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

```markdown
---
version: 2
---

# Seeded invoice renders in the virtualized grid

- POST https://your-app.test/api/invoices with body {"id": "INV-99999", "amount": "9,999.00"}
- Expect status 201, store $.id as 'newId'
- Open https://your-app.test/reports/invoices
- Scroll the invoices table until invoice INV-99999 is visible
- Verify text "9,999.00" is visible
```

The API step creates a known record with no UI involved, then the agent proves the virtualized grid can scroll to and render it. This is the cleanest way to test on-demand rows: you control exactly what should be there. One honest caveat: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on local Ollama or OpenRouter. For pure exploration and simpler grids, the default Ollama-first path with a single `browserbash run` is plenty.

## Keeping virtualized-table tests fast and cheap

The obvious objection to AI-driven scrolling is cost and speed. Scrolling through 50,000 rows sounds like a lot of model calls. Two features keep this in check.

The **replay cache** records the actions of a green run, and the next identical run replays them with zero model calls. The agent only steps back in when the page actually changed. So the first time your test finds INV-48120 it costs some tokens; every green run after that replays the same scroll-and-check sequence for free until the grid layout genuinely changes. For a stable grid, an always-on check becomes nearly token-free.

The **cheap-model routing** option (`--model-exec`) lets you plan on a strong model and execute individual steps on a cheaper one. Finding the right scroll strategy benefits from a capable model; repeating a scroll does not.

For a suite of table tests across many grids, the memory-aware `run-all` orchestrator runs them in parallel with concurrency derived from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. You can shard across CI machines and cap spend at the same time:

```bash
browserbash run-all ./tests/tables --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel machines each take a quarter without any coordination. The `--budget-usd 2.00` cap stops launching new tests once the suite crosses budget, reports the rest as skipped, and exits 2. That combination, deterministic sharding plus a hard spend ceiling, is what makes AI-driven grid testing viable in a real pipeline rather than a demo. The [pricing page](https://browserbash.com/pricing) is worth a look, but the CLI, engines, replay cache, and local dashboard are free forever since they run on your machine.

## AI-driven versus hand-written Playwright for virtualized grids

Neither approach is universally correct. Here is an honest comparison for the specific job of testing windowed and infinite tables.

| Concern | AI-driven (BrowserBash) | Hand-written Playwright |
| --- | --- | --- |
| Scroll-to-row logic | Adaptive search, agent scrolls until the row renders | You write and maintain scroll-into-view + retry helpers |
| Grid library changes | Usually survives (reads rendered content, not selectors) | Often breaks; helpers are coupled to the library |
| First-run speed | Slower (model reasoning per step) | Fast once written |
| Repeat-run speed | Near-instant with replay cache | Fast |
| Assertion precision | Deterministic via `Verify`, agent-judged otherwise | Fully deterministic, you control everything |
| Debugging a failure | Read the verdict + Result.md evidence | Read the trace + your own logs |
| Best when | Grid internals vary, tests should read like intent | You need exact control and the grid is stable |

The fair summary: if your grid is stable, your team knows Playwright well, and you want microsecond-precise control, hand-written tests are the better fit and you should keep them. If your virtualized grids change often, you are drowning in selector maintenance, or you want tests a product manager can read, the AI approach earns its keep. Many teams run both, AI-driven tests for the fragile windowed grids and classic Playwright everywhere else. BrowserBash even helps you migrate: `browserbash import` converts existing Playwright specs to plain-English `*_test.md` files heuristically, with no model involved, and drops anything untranslatable into an `IMPORT-REPORT.md` instead of silently guessing.

### When to reach for each

Choose AI-driven grid tests when the pain is selector churn and the value is readability: onboarding flows, reporting dashboards, admin tables that get restyled every quarter. Choose classic Playwright when you need frame-perfect timing assertions, you are testing the virtualization library itself, or you are asserting on internal state that never surfaces in the rendered DOM. And remember the honest model caveat: very small local models (around 8B and under) can be flaky on long multi-step objectives like scrolling deep into a 50,000-row grid. The sweet spot is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model for the hard, deep-scroll flows.

## Wiring it into CI and monitoring

Once your virtualized-table tests are green, you want them to stay green without babysitting. Two paths matter.

For pull requests, the official GitHub Action installs the CLI, runs the suite, uploads JUnit, NDJSON, and Result artifacts, supports shard matrix jobs and a `budget-usd` cap, and posts a self-updating PR comment with the verdict table. Because grid rendering is exactly the kind of thing that silently regresses (a CSS change breaks row height math and virtualization miscalculates offsets), catching it on every PR is worth the minutes. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) cover the setup.

For production, monitor mode runs a test or objective on an interval and alerts only on pass-to-fail or fail-to-pass state changes, never on every green run:

```bash
browserbash monitor ./tests/tables/invoice-grid_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Slack webhook URLs get Slack formatting automatically; other URLs receive the raw JSON payload. Thanks to the replay cache, a monitor that scrolls the same grid every ten minutes is nearly token-free, so you can watch your most important reporting table around the clock without a scary bill. If the grid stops rendering row 48,120 because a deploy broke pagination, you hear about it once, when the state flips, not sixty times an hour.

## Debugging a virtualized-table test that fails

When a grid test does fail, the evidence is designed to tell you which of the three classic virtualization bugs bit you. The `run_end.assertions` block and the Result.md table show expected-versus-actual for each `Verify`. A few patterns to recognize:

If a text-visible check for a distant row fails but the same check for a near-top row passes, the agent could not scroll far enough. Raise `--timeout`, or for infinite scroll confirm the fetch is actually returning more pages. If the rendered-row-count check returns a surprisingly small number, that is virtualization working as intended, and you probably meant to assert the logical count from a footer instead. If content is present but wrong (right row index, stale value), you are likely reading a recycled node before it settled, and adding an explicit "wait for the row to finish loading" clause to the preceding natural-language step usually fixes it.

Run any test locally through the fully-local dashboard (`browserbash dashboard`, no account, nothing leaves the machine) to replay what the agent saw step by step. That visual playback is the fastest way to see whether the agent scrolled to the wrong place or the app genuinely rendered the wrong data. For real-world walkthroughs of grid and dashboard flows, the [tutorials](https://browserbash.com/tutorials) are a good next stop.

## FAQ

### How do I test a row that only renders after scrolling in a virtualized table?

Describe the target row in plain English and let the agent scroll until it appears, then assert on it. With BrowserBash you write an objective like "scroll the table until invoice INV-48120 is visible and confirm its amount," and the agent snapshots, scrolls, waits for the row to render, and checks it. This works across react-window, ag-grid, and other windowed grids because the agent reads the rendered content rather than a fixed selector that never exists for an unmounted row.

### Why does my element count return fewer rows than the table actually has?

Because virtualized grids only mount the rows currently in the viewport plus a small overscan buffer, so a 50,000-row table might have around 30 row nodes in the DOM at once. An element-count assertion returns that rendered count, which is correct behavior, not a bug. To check the true dataset size, assert on the logical count wherever the app displays it, such as a results footer or header badge, and test rendered behavior separately.

### Do I need an API key to test infinite-scroll tables with BrowserBash?

Not for basic runs. BrowserBash is Ollama-first and defaults to free local models, so a plain `browserbash run` objective against an infinite-scroll page needs no API key and nothing leaves your machine. You only need an Anthropic API key or a compatible gateway if you use testmd v2 to seed data with deterministic API steps, since v2 currently drives the builtin engine rather than local Ollama or OpenRouter.

### How can I keep AI-driven grid tests from being slow and expensive?

The replay cache records a green run's actions and replays them with zero model calls on the next identical run, so repeat runs of a stable grid test are nearly free. Combine that with cheap-model routing to execute repeated scroll steps on a cheaper model, and use run-all sharding with a budget cap to bound spend across CI machines. The first run against a deep table costs tokens; after that, an unchanged grid replays for free.

Virtualized and infinite tables are one of the few UI patterns where describing intent genuinely beats hand-coding the mechanics, because the mechanics (scroll, wait, re-check) are exactly what an agent can adapt on its own. Install the CLI with `npm install -g browserbash-cli`, point a plain-English objective at your worst windowed grid, and see how far the agent scrolls. You can create an optional free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) for the cloud dashboard, but everything on your machine stays free forever.
