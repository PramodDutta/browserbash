---
title: Test Kibana Dashboards With Plain-English AI
description: "Learn how to test kibana dashboards with plain-English browser automation, deterministic checks, practical CI patterns, and honest chart limits."
date: 2026-10-29
category: guide
---
If you need to test kibana dashboards, the hard part is rarely opening the page. The hard part is expressing what a useful dashboard session means without coupling the test to generated selectors, transient markup, or one exact data point. BrowserBash lets you write that intent in plain English, drives a real Chrome or Chromium browser step by step, and returns a deterministic verdict with structured results.

That approach fits Kibana because users interact with global time filters, KQL queries, dashboard controls, panels, saved views, and drilldowns. Those controls are meaningful to an analyst, but their DOM structure can be noisy and can change across upgrades. Intent-level automation gives you a readable outer layer. It does not remove the need for API, component, accessibility, or data-quality tests. It gives those layers an end-to-end companion that answers a narrower question: can a real user reach and operate the expected experience?

BrowserBash is free and open source under Apache-2.0. It is built by The Testing Academy, founded by Pramod Dutta, and version 1.5.1 installs from npm. This guide shows a practical test design, the limits you should acknowledge, and how to make dashboard checks useful in local development, CI, and AI-agent workflows.

## Why teams test kibana dashboards at the browser level

A dashboard is an integration surface. Authentication, routing, API calls, saved configuration, data permissions, front-end state, and rendering all have to agree before a user sees a useful result. A unit test can prove that a formatter works. An API test can prove that a query returns records. Neither proves that the intended filter is reachable, that it affects the right view, or that the final state makes sense in the browser.

A browser test should therefore focus on user-observable contracts. For Kibana, that means open a dashboard, set a time window, enter a KQL filter or choose a control value, refresh, and verify the resulting dashboard context. These are not implementation details. They are the workflow a product owner, analyst, support engineer, or operator recognizes.

Traditional scripted browser automation remains excellent when you need precise control over every locator, event, and assertion. It can become expensive when dashboard markup changes frequently or when a generated component tree offers weak stable selectors. BrowserBash uses an AI agent to perform plain-English actions without selectors or page objects. The agent navigates the real interface and returns a verdict rather than asking CI to parse prose.

The phrase "AI browser automation" can sound less controlled than it should. Separate navigation from proof. The agent is useful for finding and operating controls. Deterministic Verify assertions, introduced in BrowserBash 1.5.0, compile supported statements into real Playwright checks. URL, title, visible text, named button, link, or heading visibility, element counts, and stored-value equality can be checked without LLM judgment. Unsupported Verify grammar still runs as agent judgment and is explicitly marked `judged: true`.

That distinction lets you review a result honestly. You can see which assertions were mechanical and which relied on interpretation. The [BrowserBash feature overview](https://browserbash.com/features) is a useful companion when deciding where this layer belongs in your test strategy.

## A first plain-English test for Kibana

Start with one short objective that has a stable precondition and a visible outcome. Avoid asking the agent to audit an entire analytics estate in one run. A focused smoke test is easier to diagnose and more likely to benefit from replay.

```bash
npm install -g browserbash-cli
browserbash run "Open https://kibana.example.com/app/dashboards#/view/errors; Confirm the Service Errors dashboard is visible; Set the time range to Last 24 hours; Enter service.name: checkout in the KQL bar; Refresh the dashboard; Verify text 'checkout' is visible"
```

BrowserBash defaults to its stagehand engine and a local provider that uses your Chrome. Its model resolution is Ollama-first: it looks for local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. Local models require no API key and keep model traffic on your machine. OpenRouter and Anthropic Claude are supported when you bring your own key.

Choose test data that makes failure legible. If a filter may validly produce no rows at midnight, do not assert that results always exist. Seed a known record, use a controlled environment, or assert the stable empty-state contract. Dashboard tests become unreliable when the expected state is vague, not merely because an agent drives them.

Keep the objective chronological. Say what page to open, what readiness signal to observe, what control to change, and what final state matters. Do not bury five branches in a paragraph. When a step depends on a previous value, name that relationship directly.

Small local models around 8B parameters and below can be flaky on long multi-step objectives. A mid-size local model such as Qwen3, a Llama 3.3 70B-class model, or a capable hosted model is a better fit for hard flows. This is a practical model limitation, not something test wording can always fix. The [learning guides](https://browserbash.com/learn) cover the core command model before you expand a suite.

## Designing stable assertions around charts and controls

A useful assertion is both meaningful and observable. "The dashboard is correct" is meaningful but not operational. "The selected region label is visible, the panel has left its loading state, and the error banner is absent" is observable but may still need a controlled dataset to be meaningful. Build the contract from both directions.

For this subject, the main boundary is clear: Kibana visualizations vary by Lens and plugin, often with complex SVG or canvas output, and volatile observability data makes exact numeric assertions brittle unless the dataset is controlled. BrowserBash should not be presented as a pixel-diff engine. It can operate real browser controls and inspect states exposed to the page, but a canvas does not automatically expose each plotted mark as an element. Even SVG charts can use generated nodes and volatile labels that are poor long-term contracts.

Prefer a layered assertion ladder:

1. Confirm the correct page, report, notebook, or dashboard title.
2. Confirm loading has completed through a stable visible state.
3. Operate a named filter, tab, slicer, input, legend, or range control.
4. Confirm the selected context is visible.
5. Confirm a stable result, summary, table, status, or accessible label.
6. Confirm that a known error or empty state is not present when the dataset guarantees results.

Exact numbers are appropriate only when you control the source data and timing. In production observability views, a value can change between reading it and asserting it. An invariant may be better: a count increases after a seeded event, a filtered row contains the known fixture, or a status remains connected during an update.

Tooltips deserve special care. Hover-driven content may disappear when the pointer moves, and a chart library may paint it on canvas. If the tooltip represents a contractual value, expose the same information through accessible text, a companion table, or a details panel. Testability and accessibility often improve together.

## Deterministic Verify and testmd v2

For a committable suite, put the workflow in a `*_test.md` file. Markdown tests support `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line. Each run writes a human-readable `Result.md`.

testmd v2 adds `version: 2` frontmatter and executes steps one at a time in one browser session. API steps can seed or fetch data without a model, while supported Verify steps compile to deterministic Playwright assertions. Consecutive plain-English steps are grouped into agent blocks on the same page.

```bash
browserbash testmd dashboard_smoke_test.md --agent
browserbash run-all ./tests --shard 2/4 --matrix-viewport 1280x720,390x844 --budget-usd 2.50
```

A v2 file could seed a known entity through `POST https://api.example.com/fixtures with body {...}`, expect status 201, store a JSON path as a variable, navigate in plain English, and then use a supported Verify statement such as `Verify text 'production' is visible`. The API and deterministic Verify steps never touch a model. This pattern reduces uncertainty at both ends of the workflow.

There is an important limitation: testmd v2 currently drives the builtin engine. It needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway and does not yet run directly on Ollama or OpenRouter. Version 1 files with no frontmatter behave as before. If local-only execution is mandatory, use v1 objectives now and keep deterministic data checks in adjacent API tests.

With `--agent`, stdout becomes NDJSON, one JSON event per line. Exit code 0 means passed, 1 failed, 2 error, infrastructure failure, or budget stop, and 3 timeout. Structured `run_end` results include status, summary, final state, assertions, estimated `cost_usd`, and `duration_ms`. This is why BrowserBash is positioned as an open-source validation layer for AI agents: a caller consumes a contract, not a paragraph.

## Authentication and repeatable test data

Dashboards are often protected, and login mechanics are frequently more volatile than the view being tested. BrowserBash saved logins let you authenticate once and reuse Playwright storage state. Run `browserbash auth save analytics --url <login-url>`, complete login in the visible browser, press Enter, and pass `--auth analytics` to `run`, `testmd`, `run-all`, or `monitor`. You can also set `auth:` in test frontmatter.

Saved state is not magic. Sessions expire, roles change, and single sign-on can impose device or conditional-access rules. BrowserBash warns when a profile's saved origins do not cover the target start URL, instead of silently applying irrelevant state. Treat that warning as a configuration defect.

Use a dedicated test identity with the least privileges needed. Test role boundaries separately: one case can prove that an analyst reaches the dashboard, while another proves that a restricted viewer cannot access an administrative page. Never make a broad production admin session the default CI credential.

Data setup is equally important. Prefer fixtures that are unique, time bounded, and removable. If the dashboard aggregates asynchronously, define a bounded readiness condition. A fixed sleep is usually the wrong contract because it is slow when the system is fast and insufficient when the system is slow. Wait for a visible refresh completion, a known record, or a stable status.

Variables can keep environment-specific URLs, user names, fixture identifiers, and expected labels out of the procedure. Secret masking protects log output, but you still need normal CI secret management. The [practical tutorials](https://browserbash.com/tutorials) provide patterns you can adapt without copying environment-specific values into tests.

## Running dashboard checks in CI without waste

A suite is more than a loop over files. BrowserBash `run-all` derives concurrency from real CPU and RAM, orders previously failed and slow tests first, and reports flaky behavior. This matters for browser-heavy dashboard checks, where launching too many sessions can make an otherwise healthy application look unstable.

The replay cache changes the cost profile. A green run records actions. The next identical run replays those actions with zero model calls, and the agent steps back in only when the page changed. Stable smoke tests can therefore become cheap after the first successful path. Replay is still a real browser interaction, so it does not turn a stale result into a pass.

Cost governance is explicit. `run_end` carries an estimate from a bundled per-model price table. Unknown models receive no estimate rather than a fabricated one. A suite can stop launching new tests after `--budget-usd` or `--budget-tokens` is crossed. Remaining cases are marked skipped, the suite exits 2, and cost information appears in `RunAll-Result.md` and JUnit properties.

Sharding uses sorted discovery order, so `--shard 2/4` selects the same deterministic slice on independent CI machines without coordination. A viewport matrix runs every test once per requested viewport and labels variants in events, JUnit, and results. Use mobile dimensions only if the dashboard genuinely supports them. Otherwise, a narrow viewport failure may say more about an unsupported product mode than a regression.

BrowserBash includes a repository-root GitHub Action that installs the CLI, runs a suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and budgets, and posts a self-updating PR verdict comment. Configuration is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## Continuous monitoring and change-sensitive alerts

A passing deployment check does not cover failures caused later by expired credentials, datasource changes, permissions, or third-party outages. Monitor mode runs a test or objective on an interval and notifies only when state changes from pass to fail or fail to pass. It does not send a message for every green interval.

For example, `browserbash monitor dashboard_smoke_test.md --every 10m --notify <webhook>` keeps the check readable and stateful. Slack incoming webhook URLs receive Slack formatting automatically. Other webhook URLs receive raw JSON. The replay cache makes an always-on stable monitor nearly token-free.

Monitoring needs a narrower contract than release testing. Avoid destructive actions, expensive exports, broad date ranges, and data that disappears unpredictably. Choose a representative read path, a stable filter, and one result that indicates the integration is alive. Recovery alerts matter as much as failure alerts, which is why both state transitions are emitted.

Do not confuse synthetic availability with data correctness. A dashboard can load successfully while its metric definition is wrong. Pair the browser monitor with pipeline freshness, schema, and business-rule checks. Conversely, a healthy API does not prove that the viewer can authenticate and use the filter. Each layer catches a different failure.

## MCP and AI-agent validation workflows

Since version 1.5.0, `browserbash mcp` serves the CLI over the Model Context Protocol on stdio. Install it into an MCP host with `claude mcp add browserbash -- browserbash mcp`; Cursor, Windsurf, Codex, and Zed use the same command-and-arguments idea. BrowserBash is listed in the official MCP Registry as `io.github.PramodDutta/browserbash`.

The server exposes three tools. `run_objective` accepts one plain-English objective. `run_test_file` runs a `*_test.md` file. `run_suite` executes a folder in parallel. Each returns structured verdict JSON with status, summary, final state, assertions, cost, and duration.

A failed test is a successful validation call. The MCP tool itself succeeds, and the calling agent reads the failed verdict. That separation prevents application regressions from being misclassified as protocol errors. An AI coding agent can change a dashboard integration, ask BrowserBash to validate the affected path, and make its next decision from explicit output.

MCP does not grant an agent unlimited authority. Give it a test identity, controlled environment, bounded objective, and budget. Keep destructive workflows behind explicit setup and cleanup. The machine-readable contract is valuable precisely because you can build policy around it.

## When to choose BrowserBash and when not to

BrowserBash is a good fit for observability teams that need readable smoke checks for filters, saved dashboards, permissions, and navigation on controlled or predictable data. It is especially useful when non-specialists need to review the workflow, selectors are costly to maintain, and an AI coding agent needs a structured browser verdict.

Choose conventional Playwright when exact locator control, network interception, download-file inspection, pixel screenshots, or fine-grained event timing is the main requirement. Use component tests for chart rendering logic and interaction branches. Use API and data tests to prove aggregation, permissions, schema, and exact exported content. Use visual regression tooling when colors, spacing, geometry, and plotted marks themselves are the contract.

A balanced stack often uses all four. BrowserBash covers the user-intent smoke path. Deterministic Verify handles stable browser facts. Playwright or component tests cover precision interactions. API and warehouse checks cover data truth. Visual tests cover appearance. Removing overlap entirely is not the goal because each layer observes a different failure surface.

Review failures by asking which contract broke. If navigation failed, inspect identity, permissions, and page readiness. If a deterministic assertion failed, use its expected-versus-actual evidence. If an agent-judged step failed, replay the path and decide whether the instruction or interface was ambiguous. If only an exact metric is wrong, investigate the data layer before changing browser automation. This triage keeps a legitimate product defect from being dismissed as AI variability, and it keeps a weak objective from becoming a noisy release gate.

BrowserBash also supports local Chrome, CDP, Browserbase, LambdaTest, and BrowserStack providers. Stagehand is the default engine. The in-repository builtin Anthropic tool-use loop is required for LambdaTest and BrowserStack and for testmd v2. Provider choice should follow browser infrastructure and security needs, not marketing preference.

For large suites, cheap-model routing can plan on a strong model and execute on a cheaper model through `--model-exec`. Start with correctness, inspect failure evidence, and optimize only after the suite is stable. The project is available on [GitHub](https://github.com/PramodDutta/browserbash), including its Apache-2.0 source.

## FAQ

### Can BrowserBash test kibana dashboards without CSS selectors?

Yes. You describe the objective in plain English, and the agent operates a real Chrome or Chromium browser without page objects or authored selectors. For supported Verify grammar, the final proof compiles to deterministic Playwright checks.

### Can BrowserBash verify every value drawn inside a chart?

No. Canvas pixels do not automatically expose semantic elements, and SVG structure varies by chart implementation. Prefer accessible labels, stable text, companion tables, controlled summaries, or a separate visual and component testing layer for exact marks.

### Does BrowserBash require a paid AI API key?

No. It is Ollama-first and defaults to free local models with no API key and no model data leaving your machine. Hard multi-step flows often work better with a mid-size local model or a capable hosted model, and testmd v2 currently requires the builtin Anthropic-compatible engine.

### How does BrowserBash report a dashboard test failure?

Human runs get a readable `Result.md`, while agent mode emits NDJSON and uses documented exit codes. Structured results include status, summary, final state, assertions, estimated cost when known, and duration, with deterministic assertion failures showing expected-versus-actual evidence.

Install the current CLI with `npm install -g browserbash-cli` and start with one stable dashboard journey. You can also [create a free BrowserBash account](https://browserbash.com/sign-up) for the optional cloud dashboard, but an account is not required for local use.
