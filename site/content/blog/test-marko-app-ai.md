---
title: Test a Marko App With AI Browser Automation
description: "Learn to test a Marko app with AI browser automation: verify streaming render and partial hydration by intent, no selectors, no page objects."
date: 2026-05-12
category: guide
---

If you want to test a Marko app the way a real user experiences it, you need something that respects how Marko actually renders: HTML streams down first, and interactivity arrives later through partial hydration. Traditional selector-based tests fight this model. They race the stream, they assume the DOM is static, and they break the moment eBay's compiler renames a class. This guide shows a different approach: describe what should happen in plain English and let an AI agent drive a real browser to confirm it, so your Marko app is checked by intent rather than by brittle CSS paths.

Marko is unusual among frontend frameworks. It compiles your `.marko` templates into a streaming server render, flushes markup to the browser as data resolves, and hydrates only the interactive islands. That is fantastic for time-to-first-byte and for keeping JavaScript payloads small. It is also exactly the kind of behavior that makes conventional end-to-end tests flaky, because the page you assert against is a moving target for the first few hundred milliseconds. The rest of this article walks through how to validate that moving target reliably.

## Why Marko apps break conventional end-to-end tests

Most Playwright or Cypress suites written against a Marko app carry the same three scars.

First, they hard-code selectors. Marko's compiler and your component structure decide the final markup, and a refactor of a `<product-card>` component can silently rename or restructure the DOM. Your test still passes its type checks, then fails in CI with a `TimeoutError` on a locator that no longer exists. You spend the afternoon updating selectors instead of shipping.

Second, they misjudge readiness. Marko streams. A naive `await page.waitForLoadState('networkidle')` either fires too early (before a late chunk flushes) or hangs on a long-lived connection. Testers paper over this with fixed `waitForTimeout(2000)` calls, which are slow in the happy path and still flaky under load.

Third, they cannot tell "rendered" from "hydrated." A price can be visible in the streamed HTML while the "Add to cart" button is still an inert placeholder because its island has not hydrated yet. A test that clicks the button the instant it appears will click a dead element. This is the single most common source of false failures on Marko, Astro, Qwik, and other partial-hydration frameworks.

AI browser automation sidesteps all three. Instead of encoding a selector and a guess about timing, you state an outcome. An agent reads the live page, decides what to do next, waits for the element to be genuinely interactive, and reports a verdict. When you test a Marko app this way, the test survives compiler output changes because it never depended on the compiler's output in the first place.

## What "test by intent" actually means

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step (no selectors, no page objects), and it returns a deterministic verdict plus structured results. You can read more about the model on the [features page](https://browserbash.com/features).

The mental shift is small but important. You stop describing *how* to find and manipulate elements and start describing *what a correct outcome looks like*. "Open the product page, wait for the price to appear, then add the item to the cart and confirm the cart count increments" is a sentence any teammate understands. It is also enough for the agent to work through the streaming render and the hydration delay on its own, because at each step it looks at the current page and decides whether the next action is possible yet.

Install it globally with npm:

```bash
npm install -g browserbash-cli
browserbash run "Open http://localhost:3000, wait for the streamed product list to render, then confirm at least 3 product cards are visible" --headless
```

That single command spins up a browser, navigates to your locally running Marko dev server, and reasons about the page as it streams in. There is no selector to maintain and no explicit sleep. If your streaming render regresses (say a data source stalls and the list never flushes), the objective fails with a summary of what the agent saw, which is far more useful than a locator timeout.

### Local-first, no API keys required

BrowserBash defaults to Ollama, so it runs against free local models with no API keys and nothing leaving your machine. It auto-resolves in this order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For a lot of Marko smoke tests, a mid-size local model is plenty. Be honest with yourself about model size, though: very small local models (roughly 8B and under) get flaky on long multi-step objectives. The sweet spot is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model when the flow is genuinely hard, like a multi-page checkout.

## Verifying the streaming server render

Marko's headline feature is streaming SSR. The server sends the shell immediately, then flushes content blocks as their data resolves. A good test confirms two things: that the early shell is present fast, and that the streamed-in content actually arrives.

The trick is that you do not want to assert on wall-clock timing in a fragile way. You want to assert on the *sequence*: shell first, then content. With an intent-driven objective you describe that sequence in words and let the agent watch it unfold.

```bash
browserbash run "Open http://localhost:3000/products/12345. Confirm the page header and navigation are visible immediately. Then wait for the product description and price to stream in and confirm both are visible." --headless --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, on stdout. Each `step` event tells you what the agent did and what it observed; the final `run_end` event carries the verdict. This is built for CI and for AI coding agents, so nothing depends on scraping prose. Exit codes are frozen and stable: `0` passed, `1` failed, `2` error or infrastructure or budget-stop, `3` timeout. Wire those straight into your pipeline.

For the streaming case specifically, the value is that the agent naturally distinguishes "the shell rendered" from "the streamed block rendered" because it takes a fresh look at the page between steps. If a late chunk never flushes, the second half of the objective fails and the `run_end` summary tells you the description and price were never seen, which points you at the data source rather than at the test.

## Confirming partial hydration works

Streaming SSR gets your Marko app on screen fast. Partial hydration is what makes it interactive. Marko hydrates only the islands that need client-side behavior, and it does so after the markup lands. This is precisely where deterministic checks matter, because "visible" and "interactive" are different states and your users only care about the second one.

BrowserBash added deterministic `Verify` assertions that compile to real Playwright checks with no LLM judgment involved. A `Verify` step can assert that a URL contains a string, that a title is or contains text, that specific text is visible, that a named button, link, or heading is visible, that an element count matches, or that a stored value equals something. A pass means the condition genuinely held. A fail comes with expected-versus-actual evidence in `run_end.assertions` and in the Result.md assertion table. That combination (an agent handling the flexible navigation, then a hard assertion locking down the outcome) is the right tool for hydration.

Put it in a committable Markdown test file. Here is a `hydration_test.md` using testmd v2, which executes steps one at a time against a single browser session:

```bash
# save as hydration_test.md, then: browserbash testmd run ./hydration_test.md
```

```
---
version: 2
---

# Marko cart hydration

- Open http://localhost:3000/products/12345
- Wait for the "Add to cart" button to appear
Verify 'Add to cart' button visible
- Click the "Add to cart" button
Verify text "1" visible
Verify url contains /cart
```

The plain-English steps let the agent work through the streaming render and wait for the button to be truly ready. The `Verify` lines are deterministic: they do not ask a model whether the button looks right, they check Playwright-grade conditions and produce evidence on failure. If the button rendered in the streamed HTML but its island had not hydrated, the click step fails cleanly, and you learn that hydration, not rendering, is the regression. That is the exact distinction conventional suites blur.

Note one honest limitation: testmd v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. For pure v1 objectives (no `version: 2` frontmatter) the local-first defaults apply as usual. The [tutorials](https://browserbash.com/tutorials) walk through both paths.

### Why the Verify grammar matters here

The reason deterministic assertions matter for hydration is subtle. An LLM-judged check ("does this look interactive?") can be fooled by a rendered-but-inert element, because visually it is identical to the hydrated version. A `Verify` step that clicks and then confirms the cart count incremented is checking *behavior*, and behavior is only possible after hydration. You are using the agent's flexibility for the parts that change (finding and reaching the button) and Playwright's rigor for the parts that must be exact (the post-click state). Verify lines that fall outside the supported grammar still run, but they are agent-judged and flagged `judged: true` in the output, so you always know which assertions were deterministic and which relied on model judgment.

## A comparison: intent-driven versus selector-driven for Marko

Neither approach is universally right. Here is an honest side-by-side for the specific case of a streaming, partially hydrated Marko app.

| Concern | Selector-driven (Playwright/Cypress) | Intent-driven (BrowserBash) |
| --- | --- | --- |
| Surviving Marko compiler output changes | Breaks when markup structure changes | Unaffected; no selectors to break |
| Distinguishing rendered vs hydrated | Manual; needs explicit waits and behavior checks | Natural; agent re-reads page and checks behavior |
| Streaming readiness | Fragile `networkidle` or fixed sleeps | Agent waits for the described content to appear |
| Deterministic assertions | Native `expect` matchers | `Verify` steps compile to Playwright checks |
| Test authoring speed | Slower; write and maintain locators | Faster; describe the outcome in English |
| Fine-grained DOM assertions | Excellent; pixel and attribute precision | Good via Verify, but not pixel-level |
| Execution cost | Free, no model calls | Free locally; hosted models cost tokens (mitigated by replay cache) |
| Best fit | Deep component-level unit-ish E2E, visual regression | User-journey validation, agent-driven CI, cross-team readability |

If you need pixel-precise visual regression or you are asserting on a specific `aria` attribute deep in a component, a classic Playwright test is the better fit and you should reach for it. Intent-driven automation shines for user-journey validation, for tests non-engineers can read, and for keeping a suite alive across refactors. Many teams run both: Playwright for tight component contracts, BrowserBash for the end-to-end journeys that used to rot every sprint. The [learn hub](https://browserbash.com/learn) covers how to layer them.

## Keeping the suite fast with the replay cache

A fair objection to AI-driven tests is speed and cost: if every run calls a model, your CI slows down and your token bill climbs. BrowserBash handles this with a replay cache. The first green run records the actions the agent took. The next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page actually changed. For a Marko app whose streaming and hydration are stable release to release, most CI runs replay in full and cost nothing in tokens.

That matters for a framework like Marko because your rendering path is usually deterministic. Once the agent has learned the route through your product page, the cache handles the happy path at Playwright-like speed, and the model wakes up only when your markup or flow genuinely shifts. You get the resilience of intent-driven testing without paying the model tax on every commit.

For suites, the memory-aware orchestrator runs tests in parallel with concurrency derived from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. You can shard across CI machines and cap spend in the same command:

```bash
browserbash run-all ./tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel machines agree on who runs what with no coordination. The `--budget-usd 2` stops launching new tests once the suite crosses the budget: remaining tests report `skipped`, the suite exits `2`, and spend lands in `RunAll-Result.md` and the JUnit `<properties>`. That is a hard ceiling you can trust in CI.

## Wiring it into CI and your AI coding agent

There are two integration stories worth knowing.

For classic CI, there is an official GitHub Action. Its `action.yml` installs the CLI, runs your suite, uploads JUnit, NDJSON, and results artifacts, supports `shard:` matrix jobs and a `budget-usd:` cap, and posts a self-updating PR comment with the verdict table. So a pull request that touches your Marko templates gets an automatic comment showing which user journeys still pass. The full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

For AI coding agents, BrowserBash ships an MCP server. Running `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, and you install it into any MCP host with one line:

```bash
claude mcp add browserbash -- browserbash mcp
```

The same idea works for Cursor, Windsurf, Codex, and Zed. It exposes three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder run in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The important design choice: a failed test is a *successful validation*. The tool call succeeds and the agent reads the verdict, so your coding assistant can change a Marko component, ask BrowserBash to confirm the cart journey still works, and read a clean structured result. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

This closes a real loop. An agent editing your `.marko` files can validate its own change against a real browser before it reports done, which is exactly the "open-source validation layer for AI agents" idea in practice.

## Monitoring a deployed Marko app

Testing in CI catches regressions before they ship. Monitoring catches the ones that only appear in production, like a CDN misconfiguration that breaks a hydration chunk or a data source that starts stalling the stream under real traffic.

```bash
browserbash monitor "Open https://yourshop.com/products/12345, confirm the price streams in and the Add to cart button becomes clickable" --every 10m --notify https://hooks.slack.com/services/XXX
```

Monitor mode runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run. So you are not drowning in noise: you hear about it when your streaming render or hydration breaks, and you hear about it again when it recovers. Slack incoming-webhook URLs get Slack formatting automatically; other URLs receive the raw JSON payload. Because the replay cache makes an always-on monitor nearly token-free, running this every ten minutes against a stable Marko app costs almost nothing.

### Reusing a login for authenticated flows

Plenty of Marko apps put the interesting hydration behind a login: a personalized dashboard, a saved cart, account settings. Re-authenticating on every test is slow and clutters your objectives. Save the session once and reuse it:

```bash
browserbash auth save myshop --url https://yourshop.com/login
browserbash run "Open the account dashboard and confirm the saved payment methods list hydrates and is interactive" --auth myshop --headless
```

The `auth save` step opens a browser, you log in by hand once, press Enter, and it stores the Playwright storageState. After that, `--auth myshop` on run, testmd, run-all, or monitor reuses it. If a saved profile's origins do not cover your target start URL, BrowserBash prints a warning instead of silently doing nothing, so you are not left guessing why an authenticated test behaved like a logged-out one.

## Migrating an existing Playwright suite

If you already have a Playwright suite against your Marko app, you do not have to rewrite it by hand. The importer converts specs to plain-English `*_test.md` files heuristically, with no model involved, so the conversion is deterministic and reproducible:

```bash
browserbash import ./e2e/tests
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common `expect` calls, and it turns `process.env.X` into `{{X}}` variables. Anything it cannot translate cleanly lands in an `IMPORT-REPORT.md` rather than being silently dropped or invented, so you get an honest map of what came over and what needs a human. This is a pragmatic way to lift your most valuable journeys into intent-driven tests without abandoning the work already in your Playwright suite.

You can also generate a test from scratch by clicking through a flow once with `browserbash record <url>`, which opens a visible browser and writes a plain-English test on Ctrl-C. Password fields never leave the page during recording: the capture sends only a secret marker, and the generated step reads `Type {{password}} into ...`.

## Who this approach is for

Reach for intent-driven testing on your Marko app if you are tired of selector churn, if your streaming and hydration timing keep making tests flaky, if you want tests a product manager or designer can read and trust, or if you are building AI agents that need to validate their own browser work. It fits the user-journey layer of your test pyramid especially well.

Stay with classic Playwright or Cypress where you need pixel-level visual regression, deep attribute-level DOM assertions on individual components, or the absolute fastest possible execution with zero model involvement on complex logic. And be realistic about model choice: lean local models are fine for smoke tests, but hand the hard multi-step checkout flows to a 70B-class local model or a hosted one. The most resilient setup for a serious Marko app is usually both approaches side by side, with BrowserBash owning the journeys that used to break every release. If you want to see the tradeoffs in practice, the [case study page](https://browserbash.com/case-study) has real examples.

## FAQ

### How do I test streaming server render in a Marko app?

Describe the sequence as a plain-English objective: confirm the page shell and navigation appear immediately, then wait for the streamed content block (like a product description or price) to render, and confirm it is visible. An AI agent re-reads the page between steps, so it naturally distinguishes the early shell from the later streamed content without fragile fixed sleeps. If a chunk never flushes, the objective fails with a summary of exactly what the agent did and did not see.

### Can AI browser automation tell the difference between rendered and hydrated elements?

Yes, and this is where it beats naive selector tests. A rendered element can be visible while its interactive island has not hydrated yet, so the two look identical on screen. By checking behavior rather than appearance (clicking a button and then verifying the resulting state changed, such as a cart count incrementing) you confirm true interactivity, because that behavior is only possible after hydration completes.

### Do I need an API key or paid model to test a Marko app with BrowserBash?

Not for standard objectives. BrowserBash defaults to Ollama and runs against free local models with no API keys, and nothing leaves your machine. It auto-resolves to a hosted key only if one is present. The one exception is testmd v2 (files with `version: 2` frontmatter), which currently needs the builtin engine and therefore an Anthropic key or a compatible gateway.

### How does intent-driven testing stay fast enough for CI?

The replay cache is the answer. The first green run records the agent's actions, and the next identical run replays them with zero model calls, so a stable Marko app runs most CI executions at near-Playwright speed and near-zero token cost. The agent only re-engages when the page actually changed, and the memory-aware orchestrator runs the suite in parallel with sharding and budget caps to keep pipelines predictable.

Ready to test your Marko app by intent instead of by selector? Install the CLI with `npm install -g browserbash-cli` and point your first objective at a local dev server. Everything runs locally out of the box, and if you want the optional free cloud dashboard you can create an account at [browserbash.com/sign-up](https://browserbash.com/sign-up), though an account is entirely optional.
