---
title: AI Testing for Ecommerce Catalogs, Search & Filters
description: "AI testing for ecommerce: verify faceted search, sort order, and out-of-stock states in plain English and get pass/fail verdicts, not brittle selectors."
date: 2026-04-22
category: use-case
---

Ask any ecommerce QA engineer what breaks most often, and they will not say checkout. They will say the catalog. AI testing for ecommerce exists because the product listing page, its faceted search, its sort dropdown, and its out-of-stock badges are the parts of a store that change every theme update, every merchandising experiment, and every Black Friday rush. Those are also the parts that traditional Selenium suites give up on first, because a single class-name change in a Shopify or Magento theme can red-line forty filter assertions overnight. This article walks through how to verify catalog behavior in plain English using BrowserBash, why an AI agent driving a real browser sidesteps the selector-maintenance trap, and where this approach genuinely is not the right call.

The premise is straightforward. Instead of writing `driver.find_element(By.CSS_SELECTOR, "div.facet__item[data-value='red']")` and praying the theme team never renames `.facet__item`, you write "filter the catalog by the color Red and confirm every visible product swatch is red." An AI agent reads the rendered page the way a shopper does, performs the clicks, and returns a structured verdict. When the theme changes the markup but keeps the behavior, your test still passes. That is the whole pitch, and the rest of this piece is about when it holds up and when it does not.

## Why ecommerce catalogs break test suites

Catalog pages are a perfect storm for brittle automation. They are the most-iterated surface in any store, they render dynamically, and their correctness is defined by relationships between elements rather than by any single element existing.

Consider what a faceted search result actually asserts. It is not "the Red filter chip is present." It is "after applying Red, every product card in the grid is a red product, the result count updated, the URL gained a `?color=red` param, and the other facets re-scoped their counts to reflect the narrowed set." A CSS selector can check that a chip exists. It cannot easily check that *all forty cards genuinely match the filter* without a brittle loop that depends on a `data-color` attribute the theme may not even expose.

Then there is the churn. Ecommerce front-ends get reskinned constantly. A/B tests swap component libraries mid-quarter. A headless storefront rebuild moves from a Liquid theme to a React PLP and every selector in your suite is now wrong. The behavior — filter narrows results, sort reorders them, out-of-stock items show a badge — is remarkably stable across all of that. The markup is not. Traditional suites couple themselves to the unstable layer and pay for it on every release.

### The selector tax nobody budgets for

If you have run a Selenium or Cypress catalog suite for a year, you know the selector tax. It does not show up as a line item, but it is real: the hours each sprint spent re-pointing locators after a theme deploy, the flaky retries on lazy-loaded grids, the page-object refactors when merchandising adds a new facet group. AI testing for ecommerce does not eliminate maintenance, but it moves the cost from "fix the selector" to "occasionally re-word the objective," which is a much cheaper category of work.

## How BrowserBash approaches catalog testing

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it once, write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects, no recorder. At the end of a run it returns a verdict plus structured results you can act on.

```bash
npm install -g browserbash-cli
browserbash run "Go to shop.example.com, open the Shoes category, filter by Size 10 and Color Black, and confirm every product shown is a black shoe available in size 10. Report PASS or FAIL with the result count."
```

The agent navigates, finds the facet controls visually, clicks them, waits for the grid to re-render, and inspects the results. There is no locator to maintain because there is no locator at all. When your theme team renames `.facet__item` next month, this objective does not change.

A few design decisions matter for ecommerce specifically. BrowserBash is Ollama-first: it defaults to free local models, needs no API keys, and nothing leaves your machine unless you opt in. It auto-resolves a running local Ollama install first, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY` if you have set those. That means you can verify catalog behavior on a staging build for a $0 model bill, which is the right default for the high-volume, repetitive runs that catalog testing implies. You can read more about the model and provider options on the [features page](https://browserbash.com/features).

### Honest caveat about model size

Catalog objectives are often multi-step: navigate, apply two facets, change the sort, scroll a lazy grid, then assert across many cards. That is exactly the kind of long-horizon task where very small local models (roughly 8B parameters and under) get flaky — they lose track of state mid-flow or hallucinate a result count. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you try to run a ten-step faceted-search verification on a tiny model and it wanders, that is the model, not the approach. Size up and the same objective stabilizes.

## Testing faceted search the plain-English way

Faceted search is where AI testing for ecommerce earns its keep, because the correctness condition is a *relationship* that selectors model badly.

A good faceted-search objective spells out the post-condition, not the clicks. You do not tell the agent which element to click; you tell it what should be true afterward.

```bash
browserbash run "On the Laptops listing page, apply the brand filter 'Dell' and the price filter 'Under \$800'. Confirm: (1) every visible product is a Dell laptop, (2) every visible price is below \$800, (3) the result count in the header decreased, and (4) the active filters Dell and Under \$800 are both shown as removable chips. Return PASS only if all four hold."
```

Notice what that buys you. The agent checks the *whole grid*, not a sampled element. It validates the count moved in the right direction. It confirms the chips reflect state. A Selenium version of this would need a loop over cards, a price-parsing helper, a count assertion, and a chip locator — four fragile coupling points, all theme-dependent. The plain-English version couples to none of them.

### Multi-facet and AND/OR logic

Stores differ on whether selecting two values in the same facet group is AND or OR. Most do OR within a group (Red OR Blue) and AND across groups (Red AND Size 10). That business rule is a frequent source of merchandising bugs, and it is hard to encode in a recorder.

```bash
browserbash run "On the T-Shirts page, select colors Red and Blue in the Color facet. Confirm the results include both red and blue shirts (OR within the group). Then add Size M from the Size facet. Confirm results now show only red-or-blue shirts that are also size M (AND across groups). Report PASS/FAIL with what you observed."
```

You are describing the rule a human merchandiser would describe. If the storefront wires the facet logic backwards after a platform migration, this objective catches it without you having reverse-engineered the markup.

### Clearing and stacking filters

Two more high-value checks that selectors handle poorly: clearing a single facet and the "clear all" reset. After clearing one chip, the others should remain active and the count should grow back partially, not fully. After "clear all," the grid should return to the unfiltered baseline count. Phrase the expected count relationship and let the agent verify it across the re-rendered grid.

## Verifying sort order and result counts

Sort is deceptively easy to get wrong, and almost nobody tests it well, because asserting "price low to high" in Selenium means parsing every price string, stripping currency symbols, handling sale-price overrides, and comparing a list — a brittle helper that breaks the moment a product shows a struck-through original price next to a sale price.

An agent reads the rendered prices the way a shopper does and can reason about the sequence.

```bash
browserbash run "On the Headphones listing, set the sort to 'Price: Low to High'. Read the prices of the first eight products top to bottom and confirm they are in non-decreasing order, using the actual selling price where a sale price is shown. Report the eight prices you read and PASS or FAIL."
```

Because the agent reports the prices it read, you get a debuggable artifact, not just a boolean. When it fails, you can see *which* product was out of order and whether the bug was the sort or your sale-price handling. That is a meaningfully better failure signal than a Selenium `AssertionError: lists differ` with no context.

Result-count integrity deserves its own check. The number in "Showing 1–24 of 312 results" should match reality and should change correctly as filters apply. Ask the agent to confirm the header count is consistent with the number of pages or the infinite-scroll total, and to flag the classic bug where the count says 312 but the grid only ever loads 300 because pagination silently drops a page.

## Out-of-stock, low-stock, and unavailable states

Inventory states are where catalog bugs hurt revenue and reputation directly. An out-of-stock product that still shows an active "Add to Cart" button leads to an order you cannot fulfill. A back-in-stock item still wearing a "Sold Out" badge loses a sale. These states are driven by inventory data that changes constantly, which makes them hard to fixture and easy to regress.

Plain-English objectives map onto these states cleanly because the agent evaluates the *visible* state, exactly as a customer would.

```bash
browserbash run "Open the product page for any item currently marked Out of Stock on the Sneakers listing. Confirm: the Add to Cart button is disabled or replaced by a 'Notify Me' control, the out-of-stock badge is visible, and no size or quantity selector lets you proceed to checkout. Report PASS/FAIL and describe the exact button state you saw."
```

### The grid-vs-detail consistency trap

A common, costly bug is a state mismatch between the listing grid and the product detail page: the grid shows "In Stock," the detail page shows "Sold Out," or vice versa. This happens when two different services or caches feed the two views. It is almost never tested because it requires checking two pages and comparing them — tedious to script, trivial to describe.

```bash
browserbash run "On the Watches listing, find the first product showing a 'Low Stock' badge in the grid. Open its product detail page. Confirm the detail page also reflects low or limited stock and does not show unlimited availability. If the grid and detail disagree, report FAIL and name the product."
```

This is the kind of cross-page invariant that AI testing for ecommerce makes cheap. You describe the consistency rule once; the agent does the navigating and comparing.

## Committable Markdown tests for your catalog suite

One-off `run` commands are great for exploration, but a real catalog suite needs to live in version control next to your code. BrowserBash supports committable Markdown tests: `*_test.md` files where each list item is a step, with `@import` composition for shared setup and `{{variables}}` templating for environments and secrets. Secret-marked variables are masked as `*****` in every log line, so a store password never lands in CI output.

```bash
browserbash testmd run ./catalog/faceted_search_test.md \
  --var base_url=https://staging.shop.example.com \
  --var store_pass={{secret:STORE_PASSWORD}}
```

A `faceted_search_test.md` might read like a checklist a human would follow: open the category, apply two facets, assert the grid, change the sort, assert order, clear all, assert the baseline count. After each run BrowserBash writes a human-readable `Result.md` you can attach to a ticket or hand to a merchandiser who does not read code. The [learn section](https://browserbash.com/learn) has more on structuring these files, and shared steps like login or cookie-banner dismissal can be factored into an imported fragment so every catalog test starts from the same clean state.

This format is the answer to the "but my QA suite needs to be reviewable" objection. The tests diff cleanly in a pull request, a non-engineer can read them, and there is not a single CSS selector to review.

## Wiring catalog tests into CI

Catalog tests are most valuable when they gate deploys, and that means CI. BrowserBash has an agent mode built for exactly this: `--agent` emits NDJSON — one JSON event per line on stdout — so a coding agent or a pipeline step consumes structured events instead of scraping prose. The exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout.

```bash
browserbash run "Apply the 'On Sale' filter on the homepage deals grid and confirm every product shows a discounted price with a struck-through original." \
  --agent --headless --record --upload
```

In a pipeline, that line either returns `0` and the deploy proceeds, or returns `1` and you block. No prose parsing, no flaky regex over a log. The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine, so a failed faceted-search run leaves you a video of exactly what the agent saw — far more useful than a single end-state screenshot when a filter silently failed to apply. The builtin engine additionally captures a Playwright trace you can open in the trace viewer.

### Where your runs and recordings go

By default everything runs locally and no account is needed. If you want run history and per-run replay, there are two opt-in paths. A fully local dashboard via `browserbash dashboard` keeps everything on your machine. Or, strictly opt-in, `browserbash connect` plus the `--upload` flag pushes runs to a free cloud dashboard with video recordings and replay; free uploaded runs are kept for 15 days. Neither is required to run a single test. Pricing and the (optional) hosted tiers are spelled out on the [pricing page](https://browserbash.com/pricing).

## Running catalog tests across browsers and the cloud

Catalog rendering bugs are often browser-specific — a facet drawer that works in Chrome but traps focus in Safari, a sticky filter bar that overlaps the grid on a particular mobile viewport. BrowserBash decouples *where the browser runs* from your objective via a single `--provider` flag.

| Provider | Where the browser runs | Good for |
| --- | --- | --- |
| `local` (default) | Your own Chrome | Fast feedback, $0, staging on a laptop |
| `cdp` | Any DevTools endpoint | A container or a custom Chrome you already manage |
| `browserbase` | Browserbase cloud | Scaling parallel runs off your machine |
| `lambdatest` | LambdaTest grid | Cross-browser and real-device catalog checks |
| `browserstack` | BrowserStack grid | Cross-browser and device coverage |

The objective is identical across providers; only the flag changes.

```bash
browserbash run "Open the Bags category, apply the Leather material facet, and confirm the filter drawer closes cleanly and results update on a mobile viewport." \
  --provider lambdatest
```

You write the catalog check once and run it on your laptop during development, then on a real-device grid before release, without rewriting anything. Engines are pluggable too: the default `stagehand` engine (MIT, by Browserbase) handles most flows, and the in-repo `builtin` engine (an Anthropic tool-use loop) is there when you want the Playwright trace artifact.

## AI testing vs. traditional Selenium for catalogs

Be honest about the trade-off, because AI testing for ecommerce is not free of downsides. Here is the comparison the way an SDET should frame it.

| Concern | AI agent (BrowserBash) | Selenium / Cypress |
| --- | --- | --- |
| Survives theme reskin | Usually yes — no selectors to break | No — selectors must be re-pointed |
| Cross-grid assertions ("all cards match") | Natural, described in English | Brittle loops + attribute deps |
| Determinism / repeatability | Lower — model can vary run to run | High — same code, same result |
| Speed per run | Slower (agent reasons each step) | Faster (direct DOM calls) |
| Debuggable failures | Verdict + video + read-back values | Stack trace + selector |
| Maintenance cost | Re-word objectives occasionally | Re-point selectors every theme deploy |
| Best for | Behavior that changes UI but not logic | Pixel-exact, high-frequency unit-level UI checks |

Selenium and Cypress are genuinely better for some catalog work. If you need millisecond-deterministic, run-this-10,000-times-identically assertions on a stable internal admin grid that never gets reskinned, hand-written selectors will be faster and more repeatable, and you should keep them. If your front-end is locked and your team already owns a mature page-object layer that rarely breaks, ripping it out for an AI agent is not an obvious win.

Where AI testing wins decisively is the volatile, customer-facing catalog: faceted search, sort, inventory states, and merchandising experiments on a theme that changes every sprint. That is precisely the surface where selector maintenance dominates your QA budget, and precisely where describing behavior beats encoding markup.

### When to choose which

Choose AI testing for ecommerce when: your storefront theme changes often, you are doing headless or A/B-heavy front-end work, your assertions are about relationships across many products, or your team includes people who should be able to read and review tests without knowing CSS. Choose traditional automation when: you need hard determinism, your UI is frozen, your assertions are pixel-exact, or you are running the same micro-check at very high frequency where per-run agent latency matters.

The pragmatic answer for most stores is both: a thin, deterministic layer for the few truly stable critical paths, and AI-driven plain-English coverage for the catalog churn that used to eat your sprints. You can see how teams have combined the two on the [case study page](https://browserbash.com/case-study).

## A realistic catalog smoke run, end to end

To make this concrete, here is the shape of a catalog smoke suite you could ship today. It is not exhaustive regression — it is the catalog's critical heartbeat, the things that, if broken, lose sales within minutes of a deploy.

First, the listing loads and the default sort is sane. Second, a primary facet (the most-used color or category) narrows results and updates the count. Third, two stacked facets apply AND logic correctly. Fourth, "Price: Low to High" actually sorts ascending, respecting sale prices. Fifth, an out-of-stock product disables purchase and shows its badge. Sixth, the grid and detail page agree on availability. Each of these is one plain-English objective, each returns a verdict, and the whole suite runs headless in CI with a clean exit code gating the deploy.

What you do *not* have, anywhere in that suite, is a single CSS selector. When marketing ships a new theme on a Friday afternoon, the suite still describes the same behavior, and it tells you in plain language whether the new theme honors it. That is the difference between a catalog suite that survives a year and one that you rewrite every quarter. For more worked examples across other flows, the [BrowserBash blog](https://browserbash.com/blog) collects use-case walkthroughs like this one.

## FAQ

### How does AI testing for ecommerce handle faceted search without selectors?

The AI agent reads the rendered catalog page visually the way a shopper does, so you describe the post-condition — "after applying the Red and Size 10 filters, every visible product matches both" — instead of pointing at a CSS class. The agent finds and clicks the facet controls itself, waits for the grid to re-render, and inspects every product card. Because it never binds to a specific selector, a theme reskin that renames the markup but keeps the behavior leaves your test passing.

### Can BrowserBash verify out-of-stock and low-stock states reliably?

Yes, because inventory state is a visible condition the agent can evaluate directly. You ask it to confirm an out-of-stock product has a disabled Add to Cart button, shows the correct badge, and offers no path to checkout, and it reports what it actually saw. It can also catch the costly grid-versus-detail mismatch where the listing and the product page disagree on availability, which is tedious to script but trivial to describe in plain English.

### Is AI testing for ecommerce accurate enough to gate a CI pipeline?

It can be, with the right model and clear objectives. Use the agent mode with `--agent` for NDJSON output and the unambiguous exit codes (0 passed, 1 failed, 2 error, 3 timeout) so the pipeline reads structure, not prose. The main accuracy risk is using a very small local model on long multi-step flows; a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, makes faceted-search and sort verifications stable enough to block deploys on.

### Does it cost anything to run catalog tests at this volume?

You can run catalog tests for a $0 model bill. BrowserBash is free and open-source under Apache-2.0, defaults to free local models via Ollama with no API keys, and keeps everything on your machine unless you opt in. The optional free cloud dashboard for run history and video replay is strictly opt-in through `browserbash connect` and `--upload`, and there is also a fully local `browserbash dashboard` if you want history without uploading anything.

Catalog testing is where selector maintenance goes to die, and it is exactly where describing behavior in plain English pays off most. Install the CLI with `npm install -g browserbash-cli`, write your first faceted-search objective, and let an AI agent tell you in plain language whether your storefront honors it. No account is required to run — though you can create a free one at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want hosted run history and replay.
