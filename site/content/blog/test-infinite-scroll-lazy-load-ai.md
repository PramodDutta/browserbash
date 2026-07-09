---
title: Test Infinite Scroll and Lazy-Loaded Pages With AI
description: "Learn how to test infinite scroll lazy load pages with AI, real browser scrolling, Playwright waits, and deterministic UI checks."
date: 2026-07-20
category: guide
---
To test infinite scroll lazy load behavior, you need more than a sleep after page load. Feeds, catalogs, image grids, and activity streams reveal content only after the browser moves, network calls finish, and lazy assets enter the viewport. BrowserBash lets you describe the user goal in plain English while a real Chrome or Chromium browser scrolls, waits, observes, and returns a structured verdict.

## Why test infinite scroll lazy load is harder than a normal happy path
Infinite scroll breaks naive automation because the DOM is not complete when the test starts. A selector for the thirtieth product may not exist yet. Images may have placeholder containers until they intersect the viewport. Virtualized lists may remove earlier items while later items appear. Manual sleeps are a weak answer because they are either too short on slow builds or too long on every green run. The test needs to follow what a user does: scroll until the relevant content appears and then verify it.

A selector-first script usually assumes the page is already in the right state. That assumption is fragile for infinite scroll and lazy-loaded page. Real users wait, retry, scroll, scan labels, notice errors, and correct themselves. BrowserBash starts closer to that user model. You give it a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step. It is not replacing every low-level test you already have. It gives SDETs and AI-agent builders a validation layer that can exercise a flow the way a person describes it.

BrowserBash is free and open source under Apache-2.0, created by The Testing Academy and founded by Pramod Dutta. Install it with `npm install -g browserbash-cli`, then run `browserbash`. The current version is 1.5.1. Its strongest fit is end-to-end validation where the page can change shape but the user intent stays stable.

## How BrowserBash helps you test infinite scroll lazy load
BrowserBash is useful here because the objective can say to browse the catalog until a named item appears, open it, and verify the detail page. The agent can drive the browser by intent rather than assuming a fixed DOM at time zero. Underneath, real browser automation gives you auto-wait behavior where Playwright checks are used for deterministic Verify steps, so you can avoid sprinkling arbitrary waits through a script.

The important distinction is that BrowserBash is not a selector recorder. You do not write page objects. You describe the business outcome and let the agent inspect the live page. Under the hood, it can use local Chrome by default, or providers such as CDP, Browserbase, LambdaTest, and BrowserStack. Stagehand is the default engine, and the builtin engine is available for the Anthropic tool-use loop and required for LambdaTest or BrowserStack.

The model story matters for test privacy. BrowserBash is Ollama-first, which means it defaults to free local models with no API keys and nothing leaving your machine. If a local Ollama model is not available, it can auto-resolve to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For hard flows, very small local models around 8B parameters and under can be flaky on long multi-step objectives. A mid-size local model such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model, is a more realistic choice.

```bash
npm install -g browserbash-cli
browserbash run "Open https://staging.example.com/catalog, scroll until the Trail Runner Backpack appears, open it, and verify the product detail page loads"
```

For deeper examples, the [BrowserBash learning center](https://browserbash.com/learn) and [BrowserBash tutorials](https://browserbash.com/tutorials) are useful places to connect the concepts to working CLI usage.

## Write a plain-English objective for test infinite scroll lazy load
A good infinite-scroll objective defines the stop condition. Say scroll until the Trail Runner Backpack appears or load at least 30 results and verify the last visible card is not a skeleton. Avoid open-ended instructions like check the feed. A feed can always scroll more, and a test needs a clear finish line.

A good objective names the start URL, the data you expect to use, the visible signals that matter, and the final state. Avoid wording that says only "make sure it works." That gives an agent too much freedom and gives a human reviewer too little information. Say what must be true when the flow succeeds.

For example, you can write the objective as a sentence for a quick local check, then move it into a committed markdown test once the flow becomes part of your release gate. BrowserBash writes a human-readable `Result.md` after each run, so the result is inspectable by a developer, tester, or AI coding agent.

A practical objective has three parts. First, describe the setup: account, environment, fixture, or saved login. Second, describe the action in user language. Third, describe the assertion in terms a product owner would recognize. That keeps the test stable when a CSS class changes, when a component moves, or when a team swaps one implementation detail for another.

## Use markdown tests and variables without leaking secrets
Markdown tests help split setup from scrolling behavior. Use an API step to seed a product or feed item with a unique title. Then the browser step can scroll until that title appears, which is much more stable than looking for the fifth item in a list where ranking changes daily.

BrowserBash markdown tests are committable `*_test.md` files. They support `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, which is the right default for credentials, temporary codes, API tokens, and customer-like fixture data.

In version 1.5.0, testmd v2 added `version: 2` frontmatter. Steps execute one at a time against a single browser session. Two deterministic step types never touch a model: API steps for seeding data and Verify steps for checking UI state. Consecutive plain-English steps run as grouped agent blocks on the same page. v1 files without frontmatter behave as before. One caveat is important: testmd v2 currently drives the builtin engine, so it needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run on Ollama or OpenRouter directly.

```bash
browserbash run-test site/tests/catalog_infinite_scroll_test.md --auth qa-user --agent
browserbash run-all site/tests --shard 2/4 --budget-usd 2.50
```

A v2 test can combine setup, intent, and deterministic assertions:

```bash
---
version: 2
auth: qa-user
---
GET https://staging.example.com/api/test-catalog/items?name=Trail%20Runner%20Backpack Expect status 200, store $.id as 'product_id'
Open https://staging.example.com/catalog and scroll the product grid until Trail Runner Backpack is visible
Open the Trail Runner Backpack product card
Verify URL contains "/products"
Verify text "Trail Runner Backpack" is visible
```

The `--agent` flag emits NDJSON, one JSON event per line, with exit codes designed for automation: 0 for passed, 1 for failed, 2 for error, infrastructure failure, or budget stop, and 3 for timeout. AI coding agents do not need to parse prose. They can read structured events and the final verdict.

## Make verification deterministic wherever possible
The deterministic Verify step should assert the content that proves lazy loading worked. For catalogs, verify the product title on the detail page or in the loaded grid. For feeds, verify the seeded activity item text. For lazy images, be careful: a visible image container is easier to verify than the exact decoded bitmap. If image loading itself is critical, pair BrowserBash with lower-level network or visual checks that are designed for assets.

BrowserBash 1.5.0 introduced deterministic Verify assertions. Supported Verify steps compile to real Playwright checks rather than LLM judgment. That includes URL contains, title is or contains, visible text, a named button, link, or heading being visible, element counts, and stored value equality.

This is the difference between "the agent thinks the page looks right" and "the condition held in the browser." If a deterministic Verify step fails, the evidence is reported in `run_end.assertions` and in the assertion table in `Result.md`. If a Verify line falls outside the grammar, it can still run as agent-judged, but it is flagged with `judged: true` so you can separate deterministic checks from judgment-based checks.

For infinite scroll and lazy-loaded page, that split matters. Let the agent do the parts humans naturally do, such as recognizing a visible control or moving through a changing interface. Let deterministic assertions own the final gate wherever the condition can be expressed as URL, title, text, count, or stored value.

## Handle authentication and session setup cleanly
Authenticated feeds often depend on user role, organization, personalization, and feature flags. Saved auth makes those tests realistic without repeating login. It also keeps the focus on the scroll behavior rather than on session setup. If the feed is public, you may not need auth at all, but you still need deterministic data or a stable search target.

Saved logins reduce noise in tests that should not spend half their time logging in. With BrowserBash 1.5.0, `browserbash auth save <name> --url <login-url>` opens a browser. You log in once, press Enter, and BrowserBash saves the Playwright storageState. Reuse it with `--auth <name>` on run, testmd, run-all, and monitor, or with `auth:` frontmatter in a test file.

A useful safety detail is that a profile whose saved origins do not cover the target start URL prints a warning instead of silently doing nothing. That helps when staging, preview, and production domains look similar but do not share browser storage.

Save the profile with `browserbash auth save qa-user --url https://staging.example.com/login`, then reuse it with `browserbash run "Open the activity feed and verify the signed-in user can see the Latest updates heading" --auth qa-user --viewport 390x844`.

For teams adopting BrowserBash across more flows, the [BrowserBash features](https://browserbash.com/features), [BrowserBash blog](https://browserbash.com/blog), and [open-source GitHub repo](https://github.com/PramodDutta/browserbash) give you a quick way to check what is local, what is optional cloud dashboard, and what is implemented in the open.

## Run test infinite scroll lazy load in CI and agent workflows
CI is where infinite-scroll tests become valuable because they catch regressions in pagination cursors, loading spinners, and viewport-specific rendering. Use viewport matrices for pages that behave differently on mobile and desktop. BrowserBash supports both a standalone --viewport WxH flag on single runs and --matrix-viewport 1280x720,390x844 in suites.

The MCP server added in 1.5.0 makes BrowserBash usable from AI coding agents without wrapping the CLI yourself. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio. You can add it to an MCP host with `claude mcp add browserbash -- browserbash mcp`, with the same idea applying to Cursor, Windsurf, Codex, and Zed. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

The MCP tools are intentionally small: `run_objective` for one plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder in parallel. Each returns structured verdict JSON with `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. A failed test is a successful validation. The tool call succeeds, and the agent reads the verdict instead of guessing.

For CI, BrowserBash includes `action.yml` at the repo root. It installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports `shard:` matrix jobs and `budget-usd:`, and posts a self-updating PR comment with the verdict table. The [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) explains the setup details.

## Monitor the flow without noisy alerts
A monitor can detect when a production feed stops loading more items after a deploy or backend change. Keep the monitor lightweight: open the page, scroll until a known signal appears, and verify the state. Do not monitor endless browsing. The replay cache helps keep repeated green runs cheap because unchanged flows can replay without model calls.

Monitor mode is useful when infinite scroll and lazy-loaded page has a history of breaking after deployments, provider changes, or design-system updates. `browserbash monitor <test|objective> --every 10m --notify <webhook>` runs on an interval and alerts only on pass to fail or fail to pass state changes. It does not page the team on every green run. Slack incoming-webhook URLs get Slack formatting automatically, while other URLs receive the raw JSON payload.

The replay cache also matters for monitoring cost. A green run records its actions. The next identical run replays them with zero model calls, and the agent steps back in only when the page changed. That makes an always-on monitor much more practical than a naive AI agent that spends tokens every ten minutes for the same unchanged screen.

Cost governance gives you another guardrail. `run_end` carries a `cost_usd` estimate from a bundled per-model price table. Unknown models get no estimate rather than a fake number. `run-all --budget-usd 2.50` or `--budget-tokens` stops launching new tests after the suite crosses the budget. Remaining tests are reported as skipped, the suite exits 2, and spend lands in `RunAll-Result.md` and JUnit properties.

## When to choose this approach, and when not to
Choose BrowserBash when the risk is a broken user journey through lazy content: a product cannot be found, the feed stalls, or a detail page never opens after scrolling. Choose API tests for pagination math and cursor correctness. Choose visual or asset-specific tooling if you need proof that every lazy image decoded with the exact expected pixels.

Choose BrowserBash when the user journey matters more than implementation details. It is a strong fit when your team wants to express tests in product language, when AI coding agents need an independent browser verdict, or when selectors are expensive to maintain because the UI is still moving.

Keep lower-level tests where they are cheaper and more precise. A pure unit test is better for date math, permission predicates, parser behavior, or API schema validation. A hand-written Playwright test can still be the best tool when you need exact control of a browser primitive or a highly specialized assertion. BrowserBash is the validation layer on top of those checks, especially for flows that benefit from natural language intent and structured verdicts.

Do not treat any AI browser agent as magic. Be explicit about data, expected state, and boundaries. Use deterministic Verify steps for the final gate. Use saved auth instead of repeatedly exercising login unless login is the subject of the test. Pick a capable model for long journeys. Those choices are what turn a flashy demo into a test you can run before a merge.

## Practical checklist before you add the test
Before adding a lazy-load test, choose a stable target item. Seed it if you can. Make sure the objective says when to stop scrolling. Then decide whether desktop, mobile, or both matter. Infinite scroll is often responsive, and a mobile viewport may trigger different page sizes, sticky filters, or bottom navigation.

Before committing a infinite scroll and lazy-loaded page test, run through a short checklist. Is the start state controlled? Are variables used for environment-specific values? Are secrets masked? Is the final assertion deterministic? Does the test explain what failure means? Can it run in CI without a person present, or is it intentionally an interactive smoke check?

For BrowserBash specifically, decide whether the flow belongs in a single objective, a `*_test.md` file, or a suite. Use `--viewport` for a single responsive size, and use `--matrix-viewport 1280x720,390x844` when the same test should run across desktop and mobile widths. Use `run-all --shard 2/4` when parallel CI machines need deterministic slices based on sorted discovery order.

If you are migrating from Playwright, `browserbash import <specs-or-dir>` can convert many specs into plain-English `*_test.md` files deterministically, with no model involved. It handles common goto, click, fill, press, check, selectOption, getBy locators, and common expects. Anything untranslatable goes to `IMPORT-REPORT.md` instead of being dropped or invented. The recorder is useful for new manual discovery: `browserbash record <url>` opens a visible browser, lets you click through once, and writes a plain-English test when you stop it.

For long feeds, set a maximum expectation even when the objective is written in natural language. A human will stop after the target appears or after it is clear the content is missing. A test needs the same discipline. Seed a unique item near a known page boundary when possible, then ask the browser to scroll until that item appears. If the feed is personalized, run under a saved account whose recommendations are stable enough for testing. If the feed uses skeletons or shimmer placeholders, assert the real item text after the loading state clears rather than asserting the absence of a placeholder too early. That keeps the failure tied to the user-visible problem.

## FAQ
### How do I test infinite scroll without using manual sleeps?
Use a real browser flow that scrolls until a visible condition is met, then assert that condition. BrowserBash lets you express the stop condition in English and use deterministic Verify checks for the final state. That is better than waiting a fixed number of seconds.

### Can BrowserBash verify lazy-loaded images?
It can verify user-visible UI state around lazy images, such as product cards, labels, and detail pages. Exact image decoding or pixel comparison is a specialized visual testing problem. Be honest about which layer you are validating.

### Should infinite-scroll tests run on mobile viewports?
Often yes. Mobile layouts may use different page sizes, sticky filters, or virtualized rendering. BrowserBash supports viewport flags and viewport matrices so the same test can run at desktop and mobile sizes.

### What makes infinite-scroll tests flaky?
Unstable data, vague stop conditions, network delays, and manual sleeps are common causes. Use seeded content, clear visible targets, and deterministic assertions. Keep the flow short enough that the agent does not need to reason through an endless feed.

Ready to try it locally? Install BrowserBash with `npm install -g browserbash-cli`, then run a plain-English browser check from your terminal. You can also [sign up](https://browserbash.com/sign-up), and an account is optional because the CLI and local dashboard work without one.
