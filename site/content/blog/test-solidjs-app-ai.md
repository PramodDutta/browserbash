---
title: Test a SolidJS App With Plain-English AI Tests
description: "Learn how to test a SolidJS app with plain-English AI tests that verify Signals-driven DOM updates by intent, plus where Vitest still wins."
date: 2026-05-04
category: guide
---

If you want to test a SolidJS app without writing a single CSS selector, an AI agent that reads plain English and drives a real browser is a genuinely different way to work. You describe what a user should see after a Signal changes, and the agent clicks, types, waits, and reports a verdict. SolidJS is built on fine-grained reactivity: a Signal updates exactly the DOM nodes that depend on it, no virtual DOM diff, no component re-render. That precision is a gift for testing, because the DOM change you assert on is small, specific, and predictable. This guide shows how to verify those Signal-driven updates by intent, and it stays honest about where a fast Vitest unit test is still the right tool.

## Why SolidJS reactivity is a good fit for intent-based testing

Solid compiles your JSX into real DOM operations at build time. When a Signal like `count` changes, Solid does not re-run the whole component. It runs only the small effect that touches the one text node or attribute bound to `count`. The result is that a user-visible change maps cleanly to a single reactive update. There is no reconciliation pass hiding what happened.

For a testing tool, this matters. When you assert "the cart badge shows 3 after I add a third item," you are checking a specific text node that Solid updated through a memo or effect. The change is deterministic and localized. An AI agent that reads the page after the interaction sees exactly the state your reactivity produced, with none of the timing ambiguity you sometimes get from frameworks that batch and re-render larger trees.

BrowserBash leans into this. You write an objective in plain English, and an AI agent drives a real Chrome or Chromium browser step by step, with no selectors and no page objects. It returns a deterministic verdict plus structured results. Because Solid updates are surgical, the agent rarely has to guess whether a change finished rendering. The reactive graph settles fast, and the visible DOM is the source of truth the agent reads against.

### Signals, memos, and what you actually assert on

A Signal is a getter and setter pair. A memo derives a value from Signals and caches it. An effect runs side effects when its dependencies change. In practice, the thing your user sees is almost always the output of a memo bound into JSX, or a direct Signal read in a text interpolation. Those are your assertion targets.

You do not assert on the Signal itself when you test by intent. You assert on the rendered consequence. If a `derivedTotal` memo computes a price and Solid writes it into a `<span>`, your plain-English check is "the order total reads $48.00," not "the memo returned 48." That separation is healthy. It keeps your browser tests focused on behavior a real user can observe, and it leaves the internal wiring to unit tests.

## Setting up BrowserBash for a SolidJS project

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. Install it globally and you have the `browserbash` command available in any project, Solid or otherwise. It does not care what framework built the page. It reads the DOM the same way a person would.

```bash
npm install -g browserbash-cli
browserbash run "Open http://localhost:3000 and confirm the heading reads 'SolidJS Todos'"
```

The model story is Ollama-first. By default BrowserBash uses free local models, so no API keys are required and nothing leaves your machine. It auto-resolves in order: a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If you already run Ollama for other work, your Solid tests can be completely local and free. For the harder multi-step flows, a mid-size local model in the 70B class (Qwen3 or Llama 3.3) or a capable hosted model does noticeably better than a tiny 8B model, which can get flaky on long objectives. That caveat is worth internalizing early so you pick the right model for the job.

Point the objective at your Solid dev server. Solid's default Vite setup serves on port 3000, so most of your commands will open `http://localhost:3000` and walk through a flow. You can read more about the model routing and provider options on the [BrowserBash features page](https://browserbash.com/features) before you commit to a setup.

### Local Chrome, no account, nothing uploaded

The default provider is `local`, which drives your own installed Chrome. There is no account requirement to run tests, and results stay on your machine unless you deliberately opt in to the free cloud dashboard. For a Solid app you are developing on your laptop, this is the whole loop: dev server up, run an objective, read the verdict, iterate. You can inspect past runs in a fully local dashboard with `browserbash dashboard`, which serves a UI without sending anything anywhere.

## Writing your first plain-English test for a Solid component

Start with a canonical Solid example: a counter driven by a Signal. The button increments `count`, and Solid updates a single text node. Here is how you verify the reactivity end to end, through the real browser, without touching a selector.

```bash
browserbash run "Open http://localhost:3000, note the counter shows 0, click the 'Increment' button three times, and confirm the counter now shows 3" --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, on stdout. Each step and the final `run_end` event are machine-readable, which is what you want when this test later runs in CI. The exit codes are frozen and dependable: 0 for passed, 1 for failed, 2 for an error or infrastructure or budget stop, and 3 for a timeout. Your CI job reads the exit code and does not have to parse prose.

What actually happens under the hood is that the agent navigates, snapshots the accessibility tree, finds the button by its visible label, clicks it, waits for the DOM to settle, and reads the counter text. Because Solid updated exactly one node, the read is unambiguous. If the counter reads 3, you get a pass. If a bug in your Signal setter double-counts and it reads 6, you get a fail with the actual value captured.

### Grouping steps into a committable test file

One-off `run` commands are great while you explore, but you will want tests you can commit and re-run. BrowserBash uses Markdown test files: a `.md` file with a `#` title and a list of steps. These support `@import` composition so you can reuse a login block across suites, and `{{variables}}` templating so you can parameterize data. Secret-marked variables are masked as `*****` in every log line, which keeps tokens and passwords out of your CI output.

A Solid todo-app test file might read like a short user story: open the app, type a task, press Enter, confirm it appears in the list, toggle it complete, confirm the completed count updates. Each line is a plain-English step. After each run, BrowserBash writes a human-readable `Result.md` so you have an artifact to review or attach to a pull request. If you are new to the format, the [BrowserBash tutorials](https://browserbash.com/tutorials) walk through building your first test files step by step.

## Deterministic Verify assertions for Signal-driven state

Intent-based testing is powerful, but for the checks that must be exact, you do not want an AI judging whether a condition held. BrowserBash added deterministic `Verify` steps that compile to real Playwright checks with no LLM judgment involved. This is the piece that makes SolidJS reactivity testing trustworthy at the assertion layer.

The Verify grammar covers the things you assert on constantly: URL contains a fragment, title is or contains text, specific text is visible, a named button or link or heading is visible, element counts, and a stored value equals an expected value. When a Verify condition passes, it means the condition genuinely held. When it fails, you get expected-versus-actual evidence in the `run_end.assertions` block and in the `Result.md` assertion table. There is no ambiguity about why it failed.

For a Solid list rendered with `<For>`, element counts are especially useful. If you add three todos, Solid renders three list items through its keyed reconciliation, and a Verify step that counts list items to equal 3 is a hard, deterministic check on your reactive rendering. If your `<For>` keying is buggy and duplicates a row, the count assertion catches it precisely, not by a model's best guess.

Verify lines that fall outside the strict grammar still run, but they are agent-judged and flagged `judged: true` in the output, so you can always tell a deterministic pass from a judged one. That transparency is the point. You know exactly which of your assertions are ironclad and which lean on the model's reading of the page.

## testmd v2: seed data with an API step, verify it through Solid's UI

Many Solid apps fetch data from an API and render it reactively through a resource or a Signal populated from `fetch`. Testing that path used to mean either mocking the API or clicking through the UI to create the data first, which is slow and brittle. testmd v2 solves this by letting a single test file mix deterministic API steps with UI verification.

Add `version: 2` to the frontmatter of a `*_test.md` file and the steps execute one at a time against a single browser session. Two step types never touch a model. API steps issue real HTTP requests (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) with an optional body, and you can assert a status and store a value from the JSON response by path. Verify steps then check that value through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

Here is the shape of a v2 test that seeds a todo through your API and then confirms Solid renders it:

```bash
# solid-seed_test.md
---
version: 2
---

# Seed a todo via API and verify it renders in the SolidJS list

- POST http://localhost:3000/api/todos with body {"title": "Ship the release"}
- Expect status 201, store $.id as 'todoId'
- Open http://localhost:3000
- Verify text "Ship the release" is visible
- Verify 'Ship the release' heading is visible
```

Run it like any other test file. The API step creates the record deterministically, no model involved, then the browser step loads your Solid app and the Verify steps confirm the resource resolved and the reactive DOM shows the seeded title. This is exactly the hybrid API-plus-UI flow that Solid resources make common, and it lets you test the rendering without hand-clicking data into existence every run.

One honest limitation to plan around: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. If you are all-local for your v1 tests, know that v2 API-plus-UI suites are the one place you will want a hosted key or a gateway for now.

## Where Vitest unit tests still belong

An AI agent driving a real browser is the right tool for user-visible behavior. It is the wrong tool for a lot of the logic in a Solid app, and pretending otherwise would waste your time and your token budget. Solid ships first-class testing utilities, and Vitest is the standard runner in the Solid ecosystem. Keep it.

Use Vitest for the fast, isolated stuff. A memo that computes a discount from a cart of Signals should be unit tested directly: set the input Signals, read the memo, assert the number. That test runs in milliseconds, needs no browser, and pinpoints a logic bug the instant it appears. The same goes for a custom hook that composes Signals, a pure utility that formats a date, or a `createStore` reducer. These have no meaningful DOM surface, so a browser agent adds latency and nondeterminism for nothing.

Here is a rough division of labor that holds up in real Solid projects:

| Concern | Best tested with | Why |
| --- | --- | --- |
| Signal and memo math (discounts, totals, filters) | Vitest unit test | Pure logic, no DOM, milliseconds to run |
| A single component's render given props | Vitest + Solid testing library | Fast, isolated, deterministic |
| Reactive DOM updates a user sees after interaction | BrowserBash plain-English test | Real browser, real reactivity, intent-based |
| Full flows across routes and API resources | BrowserBash testmd v2 | Seeds data via API, verifies through the UI |
| Exact assertions on counts, text, URLs | BrowserBash Verify steps | Deterministic Playwright checks, no LLM judgment |
| Cross-browser and viewport behavior | BrowserBash matrix and viewport flags | One suite, many environments |

The mental model is simple. If a failure would point at a function, unit test it. If a failure would point at what a person sees, drive the browser. Solid's fine-grained reactivity blurs the line less than a virtual-DOM framework does, because the reactive output is so localized, but the division still holds. You want both layers. The [BrowserBash learn hub](https://browserbash.com/learn) has more on layering these approaches without duplicating coverage.

### Do not re-test your framework

A trap worth naming: do not write browser tests that merely confirm Solid's reactivity works. Solid's own test suite covers that. Your tests should confirm your app's behavior. "Clicking increment raises the count" is only worth a browser test if the increment triggers real app logic, an API call, a route change, or a computed total that a user depends on. If it is a toy counter, a unit test on the setter is plenty. Spend your browser runs on flows that would actually break a user.

## Running Solid tests across viewports and in CI

SolidJS apps are frequently responsive, and reactivity that looks fine at 1280 wide can hide a layout bug at mobile width where a Signal toggles a drawer. BrowserBash runs a whole suite once per viewport with a matrix flag, and it can slice a suite across parallel CI machines with sharding.

```bash
browserbash run-all ./tests --matrix-viewport 1280x720,390x844 --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

The `--matrix-viewport` flag runs every test once per listed viewport, labeled in events, JUnit, and results, so a mobile-only failure is obvious. Sharding with `--shard 2/4` runs a deterministic slice computed on sorted discovery order, which means four parallel CI machines agree on who runs what without any coordination. The `--budget-usd 2` guard stops launching new tests once estimated spend crosses the limit: remaining tests report `skipped`, the suite exits 2, and the spend lands in `RunAll-Result.md` and JUnit properties. That cost ceiling matters when you use a hosted model, because a runaway suite cannot quietly burn your budget.

The orchestrator behind `run-all` is memory-aware. It derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first so you learn about breakage sooner, and flags flaky tests it sees pass and fail. For CI specifically, there is an official GitHub Action that installs the CLI, runs your suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and a budget, and posts a self-updating pull request comment with the verdict table. The [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) covers wiring it into a Solid project's workflow.

### The replay cache keeps re-runs cheap

A green run records the actions the agent took. The next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page actually changed. For a Solid app where most commits do not touch the tested flow, this means your suite mostly replays for free and only spends model time on the parts that genuinely differ. On a stable flow, re-runs are close to token-free, which changes the economics of running browser tests on every push.

## Using BrowserBash as an MCP validation layer for AI-built Solid apps

If you build Solid components with an AI coding assistant, BrowserBash can act as that assistant's validation layer over the Model Context Protocol. The command `browserbash mcp` serves the CLI over MCP on stdio, and you add it to any MCP host with one line.

```bash
claude mcp add browserbash -- browserbash mcp
```

The same idea works for Cursor, Windsurf, Codex, and Zed. Three tools get exposed: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON with status, summary, final_state, assertions, `cost_usd`, and `duration_ms`. The key insight is that a failed test is a successful validation: the tool call itself succeeds and the agent reads the verdict, so your assistant can generate a Solid component, run a plain-English check against it in a real browser, read the fail, and fix the code, all in one loop. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

This closes a real gap. An AI that writes Solid code can now confirm the reactive UI actually behaves, not just that the code compiles. The agent asks BrowserBash "does clicking add-to-cart raise the badge to 2," gets a deterministic verdict, and acts on it. That is a much stronger signal than a passing type check.

## FAQ

### Can I test a SolidJS app with AI tests without writing selectors?

Yes. BrowserBash reads plain-English objectives and an AI agent drives a real Chrome or Chromium browser using the visible page, so you never write CSS selectors or page objects. You describe what a user should see after an interaction, and the agent finds elements by their visible labels and text. This suits SolidJS well because its fine-grained reactivity updates specific, localized DOM nodes that the agent can read unambiguously.

### How do I verify Signal-driven DOM updates deterministically?

Use BrowserBash Verify steps, which compile to real Playwright checks with no LLM judgment. They can assert visible text, element counts, URL and title contents, named buttons or headings, and stored values. For a Solid list rendered with `<For>`, an element-count Verify step is a hard check on your keyed rendering. A pass means the condition genuinely held, and a fail returns expected-versus-actual evidence in the results.

### Should I replace Vitest with browser-based AI tests for SolidJS?

No, and you should not want to. Vitest is the right tool for pure logic like memo math, custom hooks, and store reducers, which run in milliseconds with no browser. Use BrowserBash for user-visible behavior and full flows where a failure points at what a person sees, not at a single function. Keep both layers and avoid re-testing Solid's reactivity itself, which its own test suite already covers.

### Does BrowserBash need API keys to test my Solid app?

Not for standard runs. BrowserBash is Ollama-first and defaults to free local models, so with Ollama installed nothing leaves your machine and no keys are needed. It auto-resolves to a hosted key only if you have one set. The one exception today is testmd v2 API-plus-UI suites, which currently run on the builtin engine and need an Anthropic key or a compatible gateway.

Testing a SolidJS app by intent turns your reactivity into behavior you can assert on in plain English, while Vitest keeps covering the logic underneath. Install the CLI with `npm install -g browserbash-cli`, point an objective at your dev server, and watch a real browser confirm your Signals do what you meant. An account is optional, but you can grab the free cloud dashboard and more at [browserbash.com/sign-up](https://browserbash.com/sign-up).
