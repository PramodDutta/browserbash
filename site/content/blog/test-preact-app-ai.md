---
title: Test a Preact App With AI Browser Automation
description: "Learn how to test a Preact app with AI browser automation: signals, hydration, and intent-based checks that survive Preact's tiny-React internals."
date: 2026-05-09
category: guide
---

If you want to test a Preact app, the hardest part is that your tests keep breaking on things that have nothing to do with what your users experience. Preact ships a tiny React-compatible core (roughly 3KB), swaps in its own reconciler, and increasingly leans on signals for state. None of that changes what a person sees in the browser, but it absolutely changes the class names, the DOM timing, and the hydration boundaries that selector-based tests cling to. AI browser automation flips the script: you describe the behavior in plain English, an agent drives a real Chromium browser, and you get a deterministic verdict back. This guide walks through how to test a Preact app by intent, why Preact differs from React in ways that matter to your test suite, and where the boundaries of this approach are.

BrowserBash is the tool I'll use throughout. It is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective, an AI agent figures out the clicks, and you never touch a selector. That model happens to fit Preact unusually well.

## Why testing a Preact app is not the same as testing React

On the surface, Preact is a drop-in. You alias `react` and `react-dom` to `preact/compat`, your components render, and life goes on. But underneath, the runtime is a different animal, and those differences leak straight into your test suite.

Preact's reconciler does not produce the same internal fiber structure React does. Tools that reach into React internals (some testing utilities, some devtools-driven assertions) either behave differently or need the `preact/debug` and `preact/devtools` shims to work at all. If your existing React test helpers poke at component instances or rely on React's synthetic event pooling, you are testing an implementation that Preact does not share.

Then there is the class-name problem. Preact apps built with Vite, WMR, or a signals-heavy setup often use scoped CSS or utility classes that shift when you refactor. A test that says `page.click('.btn-primary-xj3f')` is coupled to a hashed class that your bundler regenerates. The button still says "Save changes" and still lives in the same place on screen, but your selector is now pointing at nothing.

AI browser automation sidesteps all of this. When you tell an agent to "click the Save changes button," it reads the rendered page the way a user does: visible text, roles, position, and accessibility tree. Preact's internal reconciler, its fiber-free architecture, its compat layer, none of it is visible at that level. You are testing the product, not the framework's guts.

### The signals wrinkle

Preact signals are the feature people most want to test and most often test wrong. A signal is a reactive value; reading `.value` in a component subscribes that component to updates, and writing `.value` re-renders only the pieces that actually depend on it. That fine-grained update model is fast, but it means the DOM can update in places your test did not expect, and *not* update in places a full re-render would have touched.

If you unit-test a signal, you are checking `count.value === 5`. Useful, but it tells you nothing about whether the number on screen actually changed, whether a sibling component that reads the same signal updated too, or whether a memoized child was skipped correctly. Intent-based browser testing checks the thing that matters: after the user clicks "Add to cart" three times, does the cart badge read "3"? That is a behavior, and behavior is exactly what signals are supposed to drive.

## Setting up your first intent-based Preact test

Start by installing the CLI globally. It runs on Node 18 through 22.

```bash
npm install -g browserbash-cli
browserbash run "Open http://localhost:5173, click the 'Add to cart' button twice, and verify the cart badge shows 2" --headless
```

That single command boots a real browser, loads your Preact dev server (Vite's default port here), performs the clicks, and returns a verdict. There is no page object, no selector file, no `data-testid` you had to remember to add. The agent reads the page and acts.

By default BrowserBash is Ollama-first. It looks for a local model before it ever considers a hosted API, so nothing has to leave your machine and you do not need an API key to get started. The resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, and if none of those exist you get setup guidance instead of a cryptic crash. For a Preact SPA with short, well-labeled flows, a mid-size local model handles most objectives comfortably. I will be honest about the caveat, because it matters: very small local models (roughly 8B parameters and under) get flaky on long multi-step objectives. If your checkout flow has nine steps and a modal, reach for a 70B-class local model like Qwen3 or Llama 3.3, or a capable hosted model. The [features overview](https://browserbash.com/features) lays out the engine and provider options if you want the full menu.

### Committing tests as Markdown

Ad-hoc `run` commands are great for exploring. For a suite you commit to git, use a `*_test.md` file. It is plain Markdown: a title, numbered or bulleted steps, `@import` for shared setup, and `{{variables}}` for anything that changes between environments. Run one with `browserbash testmd run ./.browserbash/tests/cart_test.md --agent`.

The `--agent` flag emits NDJSON, one JSON event per line, so CI systems and AI coding agents read a stream of `step` and `run_end` events instead of scraping prose. Exit codes are frozen and dependable: 0 passed, 1 failed, 2 error or budget stop, 3 timeout. Your pipeline can branch on those without parsing a single sentence.

## Deterministic checks with Verify steps

Plain-English objectives are interpreted by a model, which is powerful but, by nature, a judgment call. For the assertions you never want a model second-guessing, BrowserBash has `Verify` steps that compile to real Playwright checks with no LLM in the loop.

A `Verify` line understands a specific grammar: URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and stored-value equality. When the condition holds, you get a clean pass. When it fails, you get expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md` assertion table. If you write a `Verify` line outside that grammar, it still runs, but it is agent-judged and flagged `judged: true` so you always know which checks were deterministic and which were interpreted.

For a Preact app, this split is exactly what you want. Use plain English for the messy navigation ("log in, open the account page, start a new project") and use `Verify` for the signal-driven outcomes you care about being exact:

```
# Cart signal test
version: 2

1. Open http://localhost:5173
2. Click the 'Add to cart' button
3. Click the 'Add to cart' button
Verify text "2 items" is visible
Verify 'Checkout' button visible
```

That `version: 2` frontmatter is doing real work, and it deserves its own section.

## testmd v2: one step at a time, and API steps for seeding

By default a `*_test.md` file collapses into a single objective string that the agent executes as one block. That is fine for short flows. But the moment you add `version: 2` to the frontmatter, the runner executes steps one at a time against a single browser session, and it unlocks two deterministic step types that never touch a model.

The first is API steps. You can write `GET`, `POST`, `PUT`, `DELETE`, or `PATCH` against a URL, optionally with a body, and assert the response with `Expect status N` plus an optional `store $.path as 'name'`. This is how you seed data before the UI test runs. For a Preact app backed by a JSON API, you can create a cart server-side, grab its ID, and then drive the UI to confirm it renders, all in one file.

```
# Seed then verify in the UI
version: 2

POST http://localhost:8787/api/cart with body {"items": 3}
Expect status 201, store $.id as 'cartId'

1. Open http://localhost:5173/cart/{{cartId}}
Verify text "3 items" is visible
Verify 'Proceed to checkout' button visible
```

The second deterministic type is `Verify`, which I covered above. Consecutive plain-English steps between the deterministic ones run as grouped agent blocks on the same page, so you are not paying for a fresh browser context or a fresh page load between step 1 and step 2. v1 files with no frontmatter behave exactly as they always did, so upgrading is opt-in and file-by-file.

One honest limitation to plan around: testmd v2 currently drives the builtin engine, which speaks only the Anthropic API. A v2 file needs `ANTHROPIC_API_KEY` set, or an `ANTHROPIC_BASE_URL` gateway pointing at a compatible endpoint. It does not yet run directly on Ollama or OpenRouter. If your reason for choosing BrowserBash was local-only, check the [tutorials](https://browserbash.com/tutorials) for the current engine matrix before you commit to v2 everywhere.

## Handling Preact hydration and islands

Modern Preact apps rarely ship as one big client-rendered bundle anymore. Fresh (the Deno framework built on Preact) popularized the islands architecture: the server renders static HTML, and only the interactive islands hydrate on the client. Astro with the Preact integration does the same. This is great for performance and genuinely annoying for tests, because a button can be visible in the DOM a full second before its click handler is actually wired up.

Selector-based tests handle this badly. They find the element, click it, nothing happens because hydration had not finished, and now you are sprinkling arbitrary `waitForTimeout(500)` calls through your suite like salt. AI browser automation handles it better because the agent has a `wait_for` capability and an objective that describes intent. When you say "click Subscribe and verify the confirmation message appears," a failed click that produces no confirmation prompts the agent to wait and retry against the real page state rather than declaring victory on a dead button.

### Testing an islands page end to end

For a Fresh or Astro Preact site, a realistic objective reads: `browserbash run "Open http://localhost:8000, wait for the newsletter island to become interactive, type an email, click Subscribe, and confirm 'Thanks for subscribing' appears" --headless --timeout 120`. The `--timeout 120` gives hydration room on a cold start. Because the agent verifies the confirmation text rather than the click landing, a premature click on a not-yet-hydrated island does not produce a false pass. This is the kind of race condition that eats hours of debugging in a traditional suite, and describing the outcome instead of the mechanism is what makes it tractable.

## Running the whole Preact suite in CI

A single test is a demo. A suite is a product. BrowserBash's `run-all` command takes a folder of tests and runs them in parallel with a memory-aware orchestrator: it derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first so you fail fast, and flags flaky tests across runs.

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml --shard 2/4 --budget-usd 2
```

Two things there are worth calling out. `--shard 2/4` runs a deterministic slice of your tests computed on sorted discovery order, so four CI machines can each grab a shard without any coordination server, and they will always agree on who runs what. `--budget-usd 2` stops launching new tests once estimated spend crosses two dollars: remaining tests are reported `skipped`, the suite exits 2, and the spend lands in both `RunAll-Result.md` and the JUnit `<properties>`. If you run against hosted models, that hard stop is your insurance against a runaway loop billing you.

There is also a viewport matrix. Preact's whole selling point is small and fast, which usually means you care about mobile. `--matrix-viewport 1280x720,390x844` runs every test once per viewport, labeled in the events, JUnit, and results, so your responsive Preact layout gets checked at desktop and phone widths in one command. For a single run, the standalone `--viewport 390x844` flag works on both engines.

### The replay cache changes the cost math

The first green run of a test records the actions the agent took. The next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page actually changed. For a Preact app whose UI is stable between commits, your suite gets dramatically cheaper and faster after the first pass, and a pure regression run that nobody has broken is close to free. When you ship a change that moves a button, the replay misses on that one step, the agent recovers just that step, and the cache updates. You are not re-paying for the entire flow because one label changed.

## Wiring BrowserBash into your AI coding agent

If you build with an AI coding agent (Claude Code, Cursor, Windsurf, Codex, Zed), the most interesting use of BrowserBash is as a validation layer the agent calls itself. The MCP server exposes the CLI over the Model Context Protocol on stdio.

```bash
claude mcp add browserbash -- browserbash mcp
```

That one line registers three tools in the host: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder run in parallel. Each returns the structured verdict JSON: status, summary, final state, assertions, `cost_usd`, and `duration_ms`. The important mental shift is that a failed test is a successful validation. The tool call itself succeeds, and your agent reads the verdict and decides what to do. When your coding agent writes a new Preact component and wants to know whether it works in a real browser, it runs an objective against your dev server and reads the answer, instead of guessing from the diff.

BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so any MCP-aware host can discover it. This closes the loop that makes AI browser automation genuinely useful for AI-built software: the same agent that writes the Preact code can validate it against the DOM it produced.

## When intent-based testing is the right call, and when it is not

AI browser automation is not the answer to every testing question. Here is the honest breakdown.

| Testing need | Best fit | Why |
| --- | --- | --- |
| Signal logic in isolation | Unit tests (Vitest + @preact/signals) | Pure functions and reactivity are faster and cheaper to test in a unit harness |
| Component render output | Preact Testing Library | Fast feedback on a single component's markup and props |
| End-to-end user flows | AI browser automation | Tests intent through a real browser, survives refactors and class-name churn |
| Cross-viewport behavior | AI automation with viewport matrix | One command runs every flow at desktop and mobile widths |
| Hydration and islands timing | AI browser automation | Intent + wait beats brittle fixed sleeps |
| Deterministic API + UI seeding | testmd v2 (needs Anthropic engine) | API steps seed data, Verify steps check the UI without a model |
| Pixel-perfect visual regression | Dedicated visual tools | Snapshot-diff tools are purpose-built for pixel comparison |

The pattern that works: keep your fast unit tests for signal logic and pure functions where they shine, and use AI browser automation for the flows a user actually walks through. Do not try to unit-test your way to confidence that the cart badge updates, and do not browser-test a reducer that has no UI. Match the tool to the layer.

### Who this approach is for

You will get the most out of intent-based Preact testing if your team keeps refactoring the UI and breaking selector-based tests, if you ship islands or SSR where hydration timing burns you, or if you build with an AI coding agent and want it to self-validate. If your Preact app is a tiny static widget with almost no interactivity, a couple of unit tests are all you need, and browser automation would be overkill. The [case studies](https://browserbash.com/case-study) show what the sweet spot looks like in practice.

## A realistic Preact workflow, start to finish

Here is how I would set this up on a Preact project. First, prove the concept with a one-liner against the dev server, like the cart example above. Once that passes, move it into a committed `*_test.md` file so it lives in git next to the code. Add `Verify` steps for the exact outcomes (the badge count, the confirmation text, the URL after checkout) and leave the navigation in plain English.

For flows behind a login, save the session once and reuse it, so you are not typing credentials on every run. Running `browserbash auth save preact-app --url http://localhost:5173/login` opens a browser, you log in by hand once, press Enter, and it stores the Playwright storageState. Every later run with `--auth preact-app` (on `run`, `testmd`, `run-all`, or `monitor`) reuses it. If the saved profile's origins do not cover your test's start URL, you get a warning instead of a silent no-op.

Finally, wire the suite into CI with `run-all`, a JUnit output, a shard split across your runners, and a budget ceiling if you use hosted models. Add a monitor if this is a flow you want watched in production. `browserbash monitor` runs a test on an interval and alerts only when the pass/fail state changes, in either direction, never on every green run, and the replay cache keeps an always-on monitor nearly token-free. That is useful for a signals-driven dashboard where a subtle reactivity bug might only appear under real data. The [BrowserBash blog](https://browserbash.com/blog) has more patterns for monitors and CI, and the [GitHub repo](https://github.com/PramodDutta/browserbash) is the place to read the source or file an issue.

The throughline: you describe what a user does and what should be true afterward, and Preact's internal machinery (its tiny reconciler, its signals, its compat layer, its hydration boundaries) stays invisible to the test. Your tests should break when the product breaks, not when your bundler rehashes a class name.

## FAQ

### Can I test Preact signals with browser automation?

Yes, and it is often the better way to test what signals actually do. A unit test can confirm a signal holds the right value, but AI browser automation confirms the user-visible result of that signal: the number on screen changing, a dependent component updating, a memoized child correctly staying put. Because signals drive fine-grained DOM updates, verifying the rendered outcome in a real browser catches reactivity bugs that a value-only assertion misses.

### Do I need to add data-testid attributes to my Preact components?

No. Intent-based automation reads the page the way a user does, using visible text, roles, and the accessibility tree, so you can tell the agent to "click the Save button" without any test-specific attributes. That is a real advantage for Preact apps that use hashed or scoped class names, since there is no brittle selector to break when your bundler regenerates them. Good accessibility markup helps the agent, but you do not add attributes purely for the test.

### Is testing a Preact app different from testing a React app with this tool?

At the browser level, not at all, and that is the point. The AI agent drives the rendered DOM, so Preact's different reconciler, its lack of React fibers, its signals, and its compat layer are all invisible to the test. The differences only bite you when you use tools that reach into framework internals; intent-based browser testing never touches those internals, so the same objective works whether the app is built on Preact or React.

### Does BrowserBash work with Preact islands and server-side rendering?

Yes. Islands architectures like Fresh and Astro with Preact render static HTML and hydrate interactive parts on the client, which creates timing gaps where an element is visible before its handler is wired up. Because the agent verifies an outcome (a confirmation message, a state change) rather than assuming a click landed, it waits and retries against the real page state instead of producing a false pass on a not-yet-hydrated island. Give hydration room with a longer timeout on cold starts.

Ready to test your Preact app by intent instead of by selector? Install the CLI with `npm install -g browserbash-cli` and run your first objective against your dev server in under a minute. An account is optional, everything runs locally by default, but if you want the free hosted dashboard and cloud retention you can [sign up here](https://browserbash.com/sign-up).
