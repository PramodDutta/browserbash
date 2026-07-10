---
title: Seed via GraphQL, Assert in the Browser
description: "Build a GraphQL seed UI test that posts a mutation, checks the response, and verifies the rendered result with BrowserBash testmd v2."
date: 2026-09-02
category: tutorial
---
A graphql seed ui test workflow is most useful when it removes setup clicks without hiding what the user actually experiences. The practical shape is simple: arrange a known project through an API, confirm that setup deterministically, keep one browser session alive, and inspect the resulting screen. BrowserBash testmd v2 puts those operations in one committable Markdown file, so the setup and the user-facing assertion travel together.

This is not an argument for replacing end-to-end testing with API checks. It is a way to stop spending browser time on data construction while preserving a real Chrome or Chromium validation at the boundary users care about. BrowserBash is a free, Apache-2.0, open-source natural-language browser automation CLI from The Testing Academy, founded by Pramod Dutta. Version 1.5.1 positions it as an open-source validation layer for AI agents: you state the objective, an agent drives a real browser, and the run returns a deterministic verdict with structured results.

## Why graphql seed ui test belongs in one test

A browser-only test usually creates prerequisites by clicking through administration screens. That can be legitimate when those screens are the subject under test. It is wasteful when they are merely a slow route to projects. Every extra navigation, modal, and form adds another page state that can fail before the scenario reaches its purpose.

An API-only test has the opposite blind spot. It can prove that https://app.example.test/graphql accepts a request and returns a useful response, but it does not prove that the browser fetches, interprets, and renders that state. Serialization mistakes, stale caches, authorization boundaries, client-side filters, and inaccessible controls live after the endpoint.

The hybrid test divides responsibility clearly. The API step arranges and checks the prerequisite. The browser block performs the user behavior. A deterministic Verify line checks the visible outcome. This split makes failures easier to classify: setup contract, navigation or interaction, or final user-facing condition.

The main risk here is GraphQL responses that return HTTP 200 with an errors array. Design the fixture so that repeated and parallel runs remain understandable. Prefer unique identifiers, an isolated test tenant, idempotent setup where the service supports it, and a cleanup policy owned by the environment. Do not let a convenient API shortcut bypass the exact security or business rule you intended to validate.

GraphQL changes one important detail: HTTP status alone is not a complete contract. A server can return 200 while placing resolver failures in `errors`. Store a field under `data` and later compare it, so a missing payload cannot masquerade as a usable seed.

For the larger product model, read the [BrowserBash features overview](https://browserbash.com/features). It explains how plain-English browser work fits alongside deterministic outputs rather than pretending every step needs model judgment.

## What testmd v2 actually guarantees

A version 2 test starts with `version: 2` frontmatter. Steps execute one at a time against a single browser session. API steps and supported Verify steps never touch a model. Consecutive plain-English steps are grouped into agent blocks on the same page, which keeps natural interaction flexible without making the final assertion vague.

The API grammar supports GET, POST, PUT, DELETE, and PATCH, with an optional JSON body. An `Expect status N` clause can also store a JSON path as a named value. That lets the file prove the seed request completed and retain a critical response field. Keep the JSON path narrow. Storing an ID, name, count, or accepted flag is more useful than treating a whole response body as an implicit contract.

Supported Verify lines compile to real Playwright checks. They cover URL contains, exact or partial title, visible text, visible named buttons, links, and headings, element counts, and stored-value equality. A supported assertion records expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. If a Verify sentence falls outside the deterministic grammar, it still runs but is agent-judged and is marked `judged: true`. That label matters during review.

Version 1 files without frontmatter behave as before. Version 2 currently uses the builtin engine, which needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet execute directly on Ollama or OpenRouter. This caveat is easy to miss because BrowserBash generally follows an Ollama-first model resolution story.

## Build the graphql seed ui test file

The following example is deliberately small. Replace the example host with your test environment and pass secrets through variables rather than committing them. The setup creates or configures one project, stores one response value, then moves into the real browser.

```bash
cat > test-graphql-then-ui-hybrid_test.md <<'EOF'
---
version: 2
---
POST https://app.example.test/graphql with body {"query":"mutation { createProject(name: \"Apollo\") { id name } }"}
Expect status 200, store $.data.createProject.name as 'projectName'

Open https://app.example.test/projects
Open the projects page and search for Apollo
Verify text 'Apollo' is visible
EOF

browserbash testmd test-graphql-then-ui-hybrid_test.md
```

Treat the example status as part of your own contract, not a universal choice. Creation endpoints often use 201, accepted asynchronous work often uses 202, and idempotent controls may use 200. Match what your service publicly promises. A test that expects the wrong successful status creates noise rather than protection.

The plain-English lines are intentionally outcome-focused. They do not contain CSS selectors or page objects. The agent decides how to operate the current page, while the final supported Verify compiles to a real Playwright assertion. If the text is not a stable contract, prefer a named heading, button, link, URL fragment, title, element count, or stored-value comparison that users genuinely depend on.

After a run, inspect Result.md and the assertion data. Do not fabricate a green result in documentation or CI. A pass is evidence only for the condition and environment that actually ran. A failed assertion is also a successful validation operation: in MCP mode, the tool call itself succeeds and returns a failed verdict for the calling agent to reason about.

## Design deterministic setup data

Good fixtures are small, recognizable, and disposable. Include a test namespace in IDs or names so a person examining the environment can distinguish automation data from real data. If parallel jobs can collide, derive a suffix from an externally supplied run identifier. BrowserBash supports `{{variables}}` templating in Markdown tests, so environment-specific values can remain outside the committed scenario.

Seed only fields necessary to reach the behavior. Over-specified fixtures couple the test to defaults and backend fields the screen never uses. Under-specified fixtures are just as risky if the API fills nondeterministic defaults that affect sorting, permissions, or visibility. Find the narrow contract between those extremes.

Think about retry behavior before CI retries the file. If a repeated POST creates a second record, either use a unique key per run, provide a test-only idempotency key through your service design, or clean the record through a supported endpoint. BrowserBash provides the step primitives, but it does not invent transactional rollback for your application.

Secret-marked variables are masked as `*****` in every BrowserBash log line. Use them for client secrets, passwords, or service credentials. Masking reduces accidental disclosure, but it does not make a broadly privileged credential appropriate. Give the test identity the least privilege needed for the setup and run it only against an approved environment.

For deeper examples of composable files, variables, and test structure, use the [BrowserBash tutorials](https://browserbash.com/tutorials). The same Markdown format supports `@import` composition, so common setup can be shared without copying credentials or long boilerplate into every file.

## Make the UI assertion say something useful

A weak assertion proves only that a page loaded. A useful assertion connects the seeded state to a visible user outcome. For this scenario, verify text 'apollo' is visible is the first check, but it may not be sufficient by itself. Add a URL, heading, control, or count assertion when that extra condition distinguishes the intended screen from a generic success message.

Avoid exact text when content is localized, personalized, or intentionally edited by product teams. Named role assertions such as a visible `'Save' button` or `'Orders' heading` are often more stable and accessible. Exact titles and URLs are strong when routing is the contract. Element counts are excellent for pagination and list boundaries, but only when filters and sort order are controlled.

Stored value equality is useful at the API boundary. If you stored `projectName`, compare it against the expected setup value when the grammar and returned type fit the scenario. Do not imply that a stored JSON value automatically becomes a browser cookie, localStorage entry, or form value. Ground truth about the handoff matters more than a compact demo.

When a Verify line is outside the deterministic grammar, BrowserBash flags it as agent-judged. That is not inherently bad. Visual nuance and semantic summaries may need model reasoning. The mistake is reporting an agent judgment as if it were a compiled Playwright check. Review `judged` in the structured result and decide whether the assertion belongs in a deterministic form.

## Debug failures by boundary

Start with the earliest failed boundary. If the API status expectation fails, inspect the endpoint, request body, environment variables, and test identity. Do not spend time changing browser language while setup is broken. If the status passes but the stored path is absent, the response contract or JSON path is wrong.

If setup succeeds and the agent cannot reach the page, examine authentication, routing, and the start URL. BrowserBash saved logins can remove repeated interactive login: `browserbash auth save <name> --url <login-url>` opens a browser, you sign in once, and Enter saves Playwright storageState. Reuse it with `--auth <name>` or `auth:` frontmatter. BrowserBash warns when saved origins do not cover the target URL instead of silently doing nothing.

If browser interaction completes but Verify fails, use the expected-versus-actual evidence. Check whether the UI is eventually consistent, filtered, sorted differently, or showing a permission-specific view. Resist converting a deterministic failure into a loose agent-judged sentence merely to make the build green.

Run with `--agent` when CI or an AI coding agent needs machine-readable output. Stdout becomes NDJSON, one JSON event per line. Exit codes are 0 for passed, 1 for failed, 2 for error, infrastructure failure, or budget stop, and 3 for timeout. That contract avoids scraping prose and keeps test failure distinct from runner failure.

```bash
browserbash testmd test-graphql-then-ui-hybrid_test.md --agent
browserbash run-all ./tests --shard 2/4 --budget-usd 2.00
```

## Scale the pattern without losing control

A single hybrid test is easy to understand. A suite needs isolation, cost limits, and predictable partitioning. BrowserBash `run-all` derives concurrency from real CPU and RAM, prioritizes previously failed and slow tests, and detects flaky behavior. Deterministic API and Verify steps reduce model work, while consecutive natural-language steps remain agent blocks.

Sharding uses sorted discovery order, so `--shard 2/4` selects the same slice on independent CI machines without coordination. A viewport matrix such as `--matrix-viewport 1280x720,390x844` runs every test once at each size and labels events, JUnit, and results. Use it when responsive behavior changes the contract, not simply to multiply coverage numbers.

Cost governance stops new launches after the suite crosses `--budget-usd` or `--budget-tokens`. Remaining tests are marked skipped, the suite exits 2, and spend is written to RunAll-Result.md and JUnit properties. Each `run_end` can include a `cost_usd` estimate from the bundled model price table. Unknown models receive no estimate instead of a made-up value.

The replay cache makes repeated stable flows cheaper. A green run records its actions, and the next identical run replays with zero model calls. The agent steps back in if the page changes. Monitor mode uses that cache too, which can make an always-on stable check nearly token-free. These optimizations do not weaken the deterministic Verify evidence.

The repository includes a GitHub Action that installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and budget controls, and posts a self-updating pull request verdict table. Follow the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) rather than rebuilding that plumbing from scratch.

## Model, engine, and privacy choices

BrowserBash defaults to free local Ollama models, with no API key and nothing leaving your machine. Resolution proceeds from local Ollama to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. Anthropic Claude and OpenRouter are supported with your own key. That broad story applies to regular objectives, but remember the testmd v2 builtin-engine limitation described earlier.

Very small local models around 8B and below can be flaky on long, multi-step objectives. A mid-size local model such as Qwen3, a Llama 3.3 70B-class model, or a capable hosted model is a better fit for hard flows. Keep deterministic setup and assertions small so the model spends its attention on navigation and interaction.

The default engine is Stagehand, the MIT-licensed Browserbase project. BrowserBash also includes a builtin Anthropic tool-use loop. Providers include local Chrome by default, CDP, Browserbase, LambdaTest, and BrowserStack. LambdaTest and BrowserStack require the builtin engine. A standalone `--viewport WxH` works on single runs with both engines.

Cheap-model routing with `--model-exec` lets a strong model plan while a cheaper model executes. Use it after the scenario is stable enough to compare behavior. Do not claim savings that you did not measure. Cost estimates, duration, assertion details, and final status are available in structured results for evidence-based decisions.

You can review installation and current package details on the [browserbash-cli npm page](https://www.npmjs.com/package/browserbash-cli), and inspect the Apache-2.0 source in the [BrowserBash GitHub repository](https://github.com/PramodDutta/browserbash).

## Who should choose this pattern

Choose this graphql seed ui test pattern when your team owns or is authorized to use a setup endpoint, the UI consumes the resulting state, and browser-only setup is slow or distracts from the behavior under test. It fits pull request checks, release validation, agent-driven coding workflows, and focused regression tests where setup and presentation must stay traceable in one file.

Choose a pure browser test when creating the prerequisite through the UI is itself the requirement. Registration, checkout, consent, and account recovery often deserve full user-path coverage. An API shortcut would skip the very screens, validation rules, or telemetry you need to examine.

Choose a pure API or dedicated contract test when rendering adds no meaningful risk. For exhaustive schemas, consumer compatibility, load, security, and protocol edge cases, specialized API tools are the better fit. BrowserBash hybrid tests should pin a narrow dependency and then validate the user-visible consequence.

Choose Playwright code directly when your team needs precise low-level browser control, extensive fixtures, custom network interception, or operating-system integrations beyond the natural-language workflow. BrowserBash can import common Playwright actions and expects heuristically, with deterministic reporting of untranslated lines in IMPORT-REPORT.md, but an import is not a promise that every custom helper becomes Markdown.

The balanced portfolio keeps a few browser-only journeys, many fast API checks, focused contract coverage, and hybrid tests at integration seams. BrowserBash helps the hybrid layer stay readable to humans and callable by agents. Its MCP server exposes `run_objective`, `run_test_file`, and `run_suite`, each returning status, summary, final_state, assertions, cost_usd, and duration_ms. It is listed in the official MCP Registry as `io.github.PramodDutta/browserbash`.

## Operationalize the check in CI and monitoring

For CI, commit the `*_test.md` file, provide environment variables through the secret store, and retain Result.md, NDJSON, and JUnit artifacts. Treat exit 1 as a product validation failure and exit 2 as an execution, infrastructure, or budget condition. That distinction helps an AI agent decide whether to inspect application code, test data, or the runner.

For recurring production-like checks, monitor mode accepts a test or objective plus an interval and webhook. It alerts only when state changes from pass to fail or fail to pass, never on every green run. Slack incoming webhook URLs receive Slack formatting automatically, while other endpoints receive raw JSON. Use a safe read-only or disposable scenario for monitoring.

Saved authentication reduces repeated login work, but it is state that must be rotated and scoped. BrowserBash stores Playwright storageState locally. A warning about origin coverage is a useful diagnostic, not something to suppress. If the target origin changes, save a matching profile and verify the account has only the permissions the monitor needs.

A fully local dashboard is available through `browserbash dashboard` with no account. The optional free cloud dashboard uses `browserbash connect` and `--upload`, with 15-day retention. Decide based on your data policy. Upload is optional, and local execution remains a first-class path.

## FAQ

### How do I seed GraphQL data before a UI test?

Use a deterministic API step in a version 2 Markdown test, assert the documented success status, and store one stable response field. Then continue in the same file with the real browser behavior and a supported Verify assertion.

### Is HTTP 200 enough for a GraphQL assertion?

Yes, when the setup endpoint and browser view are part of the same authorized test environment. Keep the API assertion narrow and make the UI check prove a visible user outcome rather than merely repeating the response body.

### Can BrowserBash call GraphQL without an LLM?

BrowserBash distinguishes deterministic API and supported Verify steps from agent-judged behavior. Review status, expected-versus-actual assertion evidence, and the `judged` flag instead of assuming every natural-language sentence has the same execution model.

### What should a GraphQL UI test verify?

Choose the smallest repeatable fixture and define ownership for isolation, expiry, or cleanup. The right policy depends on your service, but retries and parallel runs should never silently corrupt shared state.

Install BrowserBash 1.5.1 with `npm install -g browserbash-cli`, commit the first focused hybrid test, and inspect its real verdict. You can also [create an optional BrowserBash account](https://browserbash.com/sign-up) for cloud dashboard use, but an account is not required.


