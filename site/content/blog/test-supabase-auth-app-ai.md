---
title: Test a Supabase Auth App With Plain-English Tests
description: "See how to test supabase auth app flows with saved sessions, magic links, password login, and deterministic dashboard Verify checks."
date: 2026-07-31
category: use-case
---
test supabase auth app is the kind of browser test that sounds simple until you try to keep it alive for months. The risky part is not clicking a button once. The risky part is proving that a real user can still complete the flow after theme changes, auth changes, plugin updates, route rewrites, and small copy changes that never show up in unit tests.

BrowserBash is built for that outside-in layer. It is a free, open-source Apache-2.0 natural-language browser automation CLI from The Testing Academy, founded by Pramod Dutta. You install it with `npm install -g browserbash-cli`, run `browserbash`, and write an objective in normal English. An AI agent drives a real Chrome or Chromium browser step by step and returns a deterministic verdict with structured results. That makes it a practical validation layer for AI agents, SDET teams, and product engineers who need browser confidence without maintaining selectors for every page variant.

For Supabase Auth app, the useful pattern is not to replace every test you already have. Keep low-level checks where they belong, then add a small number of committable markdown tests around the paths that would hurt if they broke. BrowserBash test files can sit next to the app, use `{{variables}}`, import shared steps, mask secrets in logs, and write a human-readable `Result.md` after each run. If you want a broader starting point, the [BrowserBash learning center](https://browserbash.com/learn) and [tutorials](https://browserbash.com/tutorials) cover the same local-first model in more general terms.

## Why test supabase auth app Breaks in Real Browsers

The hard part of test supabase auth app is that the browser surface keeps changing while the user intent stays stable. In this case, redirect URLs, email handoffs, session refresh, protected routes, and auth state hydration can fail even when unit tests pass. A traditional scripted test often has to know too much about the implementation: the selector for a button, the exact nesting of a menu, the form field ID, or the current markup emitted by a theme, framework, or platform page. Those details are valuable when you own the component, but they become a drag when you are validating the full user path.

A browser-level smoke test should be written in the language of the outcome. It should say what the user is trying to do, where they start, what data they use, and what evidence proves success. BrowserBash lets you express that as a plain-English objective or a `*_test.md` file. The agent handles the page exploration, and deterministic Verify lines handle the final checks when the condition fits the grammar.

This distinction matters. An agent can be useful for navigation, but the final verdict should not be a vague feeling that the page looked correct. BrowserBash 1.5.0 added deterministic Verify assertions for URL contains, title is or contains, visible text, visible buttons, links, headings, element counts, and stored value equality. When a Verify line matches the grammar, it compiles to real Playwright checks. A pass means the condition held. A fail includes expected-vs-actual evidence in `run_end.assertions` and the Result.md assertion table.

## What BrowserBash Changes About test supabase auth app

BrowserBash changes the maintenance model. Instead of writing selectors and page objects up front, you write the user objective and let the agent operate the browser. That is especially useful for Supabase Auth because the flow is often owned by multiple layers: your app, a platform screen, an identity provider, a payment or billing page, a portal widget, or a client-side route. Each layer can shift independently.

The default model story is also important. BrowserBash is Ollama-first. It defaults to free local models, requires no API keys for local runs, and keeps data on your machine when using local models. Resolution proceeds from local Ollama to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter when configured. It also supports OpenRouter and Anthropic Claude with your own key. That gives you a practical path for nightly smoke checks: run easy, stable flows locally, and reserve stronger hosted models for long or difficult paths.

There is an honest caveat. Very small local models, roughly 8B and under, can be flaky on long multi-step objectives. The sweet spot is a mid-size local model such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model for hard flows. That does not make local testing useless. It means you should keep objectives focused, use saved sessions, add deterministic Verify assertions, and measure the flow before you scale it across CI.

## A Practical test supabase auth app Test Plan

Start with one test that covers the critical happy path. For Supabase Auth app, that means: sign in with password or a captured magic-link path, save the authenticated browser state, reopen the app, and verify the dashboard. Keep the first version narrow. A good smoke test is allowed to skip edge cases if it catches the failure that would block a real user or a release.

Then split the test into three layers of evidence. The first layer is setup, such as auth, fixture selection, or test data. The second layer is the browser journey, where the agent uses the page the way a user would. The third layer is deterministic verification. In the final layer for this article, useful assertions include: the dashboard route loads, the user email is visible, a protected navigation item appears, and the logged-out landing page is not shown.

A simple command-based smoke check can look like this:

```bash
npm install -g browserbash-cli
browserbash auth save supabase-user --url https://supabase-app.example.com/login
browserbash run "Open https://supabase-app.example.com, act as a signed-in app user, sign in with password or a captured magic-link path, save the authenticated browser state, reopen the app, and verify the dashboard, then verify the authenticated dashboard is correct" --auth supabase-user --viewport 1280x720 --agent
```

The command uses `--agent` so stdout is NDJSON, one JSON event per line. That matters in CI and for coding agents because nobody has to scrape prose. Exit codes are direct: 0 passed, 1 failed, 2 error or infra or budget stop, and 3 timeout. If the test fails because the app is wrong, that is not an infra exception. It is a successful validation run with a failed verdict.

## Use testmd Files for Reviewable Browser Specs

A one-off objective is useful during exploration, but a repeated test supabase auth app check belongs in a markdown test file. BrowserBash markdown tests are committable `*_test.md` files. They support `@import` composition and `{{variables}}` templating, and secret-marked variables are masked as ***** in every log line. That gives SDETs and developers something they can review in a pull request without reading a selector-heavy framework.

testmd v2, new in BrowserBash 1.5.0, adds `version: 2` frontmatter and executes steps one at a time against a single browser session. It has two deterministic step types that never touch a model: API steps and Verify steps. API steps support `GET`, `POST`, `PUT`, `DELETE`, and `PATCH` with an optional JSON body, followed by an `Expect status N` line that can store a JSONPath value. Consecutive plain-English steps still run as grouped agent blocks on the same page.

For Supabase Auth, a focused v2 sketch can look like this:

```bash
cat > tests/test-supabase-auth-app-ai_test.md <<'EOF'
---
version: 2
auth: supabase-user
---
GET https://supabase-app.example.com/api/test/user/{{user_id}}
Expect status 200, store $.email as 'email'

Open https://supabase-app.example.com and complete the critical Supabase Auth flow as a signed-in app user.
Keep the same browser session and use the visible UI, not test-only shortcuts.

Verify url contains "/dashboard"
Verify text "{{email}}" visible
EOF

browserbash testmd tests/test-supabase-auth-app-ai_test.md --auth supabase-user --agent
browserbash run-all tests --shard 1/2 --matrix-viewport 1280x720,390x844 --budget-usd 2.50
```

Two details are worth calling out. First, testmd v2 currently drives the builtin engine and needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run on Ollama or OpenRouter directly. Second, Verify lines outside the supported grammar still run as agent-judged assertions and are flagged `judged: true`, so you can see which checks are deterministic and which are model judged.

## Deterministic Verify Assertions That Matter

For test supabase auth app, deterministic checks keep the article-worthy promise honest. The agent can decide how to move through the interface, but the result should be anchored in facts. BrowserBash Verify checks are compiled to Playwright where possible, so the assertion table is not just a transcript of what the model believed.

A strong Verify set has a mix of route, identity, and state checks. A route check might be `Verify url contains "/dashboard"`, `Verify url contains "/checkout"`, or `Verify title contains "Billing"`, depending on the surface. An identity check might prove the right user or customer is visible. A state check should confirm the business outcome, such as an approved request, selected plan, visible order confirmation, published post, or offline-ready message.

Avoid checks that are too broad. `Verify text "Success" visible` may pass because a sidebar, toast, or old message contains that word. Prefer the most meaningful visible evidence your app exposes. If your app can display a unique ticket number, email address, product name, plan label, route heading, or stored fixture value, use that. A failed assertion should tell a developer exactly what changed.

## Saved Logins, Variables, and Secret Hygiene

Many Supabase Auth flows require authentication. BrowserBash 1.5.0 added saved logins with `browserbash auth save <name> --url <login-url>`. It opens a browser, you log in once, then press Enter to save the session as Playwright storageState. You can reuse it with `--auth <name>` on run, testmd, run-all, and monitor, or with `auth:` frontmatter in a test file.

That is cleaner than embedding credentials into every test. It also matches how many browser problems actually appear: the user is already signed in, the app refreshes a token, a protected route loads, or a portal handoff assumes a session. BrowserBash warns when a profile's saved origins do not cover the target start URL, which prevents a silent no-op where you think auth is applied but the browser is still anonymous.

Use variables for fixture values and secrets. Markdown tests support `{{variables}}`, and secret-marked variables are masked as ***** in every log line. Magic-link tests need a test mailbox, API helper, or controlled link capture. BrowserBash should not guess at emails it cannot access. For published CI logs, this is not optional. Browser automation sees real pages, so the test design has to treat credentials, customer data, and account identifiers as production-grade material even in staging.

## CI, MCP, and AI Agent Workflows

BrowserBash is designed for CI and AI coding agents, not only for a developer laptop. The `run-all` orchestrator is memory-aware and derives concurrency from real CPU and RAM. It orders previously failed and slowest tests first and can detect flaky behavior. With sharding, `run-all --shard 2/4` runs a deterministic slice based on sorted discovery order, so parallel CI machines agree without coordination.

Viewport coverage is built in. `--matrix-viewport 1280x720,390x844` runs every test once per viewport and labels events, JUnit, and results with the viewport. A standalone `--viewport WxH` flag also works on single runs, both engines. For test supabase auth app, that is useful because many real failures hide in mobile drawers, sticky footers, responsive menus, or narrow checkout and portal layouts.

BrowserBash 1.5.0 also added an MCP server. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio. Install it into an MCP host with one line, then expose `run_objective`, `run_test_file`, and `run_suite`. Each tool returns structured verdict JSON with status, summary, final_state, assertions, cost_usd, and duration_ms. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

```bash
claude mcp add browserbash -- browserbash mcp
browserbash monitor tests/critical_test.md --every 10m --notify https://hooks.example.com/browserbash
```

The key behavior is subtle but important: a failed browser test is a successful tool call. The agent reads the verdict and can decide what to fix next. That makes BrowserBash a useful validation layer after an AI coding agent changes a UI. You can read more about product capabilities on the [BrowserBash features page](https://browserbash.com/features) and inspect the open-source project on [GitHub](https://github.com/PramodDutta/browserbash).

## Cost, Replay, and Nightly Runs

Cost governance is part of the workflow rather than an afterthought. BrowserBash `run_end` carries a `cost_usd` estimate from a bundled per-model price table. Unknown models get no estimate rather than a wrong one. `run-all --budget-usd 2.50` or `--budget-tokens` stops launching new tests once the suite crosses the budget. Remaining tests are reported as skipped, the suite exits 2, and spend lands in `RunAll-Result.md` and JUnit properties.

The replay cache matters even more for routine test supabase auth app smoke checks. A green run records its actions. The next identical run replays them with zero model calls, and the agent steps back in only when the page changed. For stable nightly paths, that can make always-on monitoring inexpensive while still catching real UI shifts.

Monitor mode runs a test or objective on an interval. `browserbash monitor <test|objective> --every 10m --notify <webhook>` alerts only on pass-to-fail or fail-to-pass state changes, not on every green run. Slack incoming-webhook URLs get Slack formatting automatically, while other URLs receive the raw JSON payload. That is the right alert shape for a smoke test. You want a signal when the state changes, not noise every time the system remains healthy.

## Where BrowserBash Fits Against Other Test Layers

A balanced test supabase auth app strategy uses several layers. BrowserBash is not a replacement for everything. It is the browser validation layer for flows where intent is stable but implementation details move.

| Layer | Best use | Where BrowserBash helps | Where another tool is better |
| --- | --- | --- | --- |
| Unit tests | Pure functions and small components | Usually not needed | Keep fast code-level coverage here |
| API tests | Data setup and service contracts | v2 API steps can seed or read fixtures | Deep backend validation belongs here |
| Platform-native tests | Vendor-specific internals | Can validate the user-visible result | Native tools know platform internals better |
| BrowserBash | Real browser journeys in plain English | Drives Chrome or Chromium and returns structured verdicts | Not ideal for exhaustive selector-level assertions |
| Manual testing | Exploratory judgment | Recorder can turn a flow into a plain-English test | Humans still find unknown risks best |

This framing keeps the tool honest. Use Supabase client tests or API tests for row-level security policies and token parsing. BrowserBash should cover the user journey that depends on redirects, cookies, local storage, and the visible app shell. Use BrowserBash when the browser journey is the risk: auth redirects, responsive layouts, platform screens, cart paths, dashboards, portals, route transitions, and visible business state.

## When to Choose BrowserBash for test supabase auth app

Choose BrowserBash when the test should read like a user workflow, when selectors have become the maintenance burden, and when you need a result an AI agent or CI job can consume. It is also a good fit when your team wants browser checks that product managers, QA engineers, and developers can all review in markdown. If the test intent is easy to explain but the implementation changes often, test supabase auth app is a strong candidate.

Do not choose BrowserBash as the only test layer for deep platform logic. If you need to validate exact tax rules, permission policies, webhook signatures, trigger behavior, cache algorithms, or background worker internals, use the lower-level tool that owns that layer. Then add BrowserBash to prove a real user can reach and verify the visible result.

For local development, start with one objective and one saved auth profile. For CI, promote the objective into a `*_test.md` file, add deterministic Verify lines, use `--agent`, and publish JUnit or Result.md artifacts. The repo also includes a GitHub Action at the root that installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and budget limits, and posts a self-updating PR comment with the verdict table. The [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) is the practical next step once the first smoke test is useful.

## Rollout Checklist for Supabase Auth Teams

Start with the smallest flow that would block a release. Name it plainly, commit it as `tests/test-supabase-auth-app-ai_test.md`, and keep the setup data boring. If the page needs login, save an auth profile. If the flow needs a known record, create or read it through an API step. If the final state matters, Verify it with route, text, heading, button, link, count, or stored value equality.

Run the test locally before adding CI. Watch the visible browser once. If the agent hesitates, make the objective more specific. If the result depends on a model judgment, replace that line with a deterministic Verify assertion where the grammar supports it. If the test is long, split it into two smaller tests that reuse the same auth profile or fixture setup.

When the test is stable, add viewport coverage and a budget. Consider monitor mode for the one or two flows that should be watched between releases. Use the local dashboard with `browserbash dashboard` when you want a fully local view with no account, or the optional free cloud dashboard with `browserbash connect` and `--upload` when 15-day retention is useful. Pricing and account details are available on the [BrowserBash pricing page](https://browserbash.com/pricing), but an account is optional for local CLI use.

## FAQ

### Can BrowserBash test Supabase magic links?
Yes, when your test environment exposes the link through a mailbox, API helper, or controlled test fixture. The browser run can then follow the link and verify the authenticated dashboard.

### How do I reuse Supabase login state?
Run browserbash auth save against your login URL, complete sign-in once, and reuse that profile with --auth or auth frontmatter. BrowserBash stores Playwright storageState for the session.

### Can Verify prove that a protected route loaded?
Yes. Verify can check URL contains, visible text, headings, buttons, links, and stored value equality. That gives deterministic proof for the route and user identity on the page.

### Does testmd v2 run on Ollama for Supabase flows?
Not yet. testmd v2 currently drives the builtin engine, which needs ANTHROPIC_API_KEY or a compatible ANTHROPIC_BASE_URL gateway. Plain objectives can still use local-first model resolution.

The shortest way to try this is still the CLI: install BrowserBash with `npm install -g browserbash-cli`, run one focused objective, then turn the useful path into a markdown test. You can also [sign up for BrowserBash](https://browserbash.com/sign-up) for optional cloud dashboard features, while local CLI use remains available without an account.
