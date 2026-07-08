---
title: Seed Data Over the API, Verify It in the UI
description: "Learn api seed data ui verification testing with BrowserBash testmd v2: seed a record over the API, store its id, then verify it in the UI."
date: 2026-08-06
category: guide
---

If you have ever watched an end-to-end test spend forty seconds clicking through a signup form just to get a single test user into the database, you already understand why api seed data ui verification testing has become the default pattern for teams who actually ship. The idea is simple: create the data you need through a direct API call, capture the id it returns, then use the browser only for what the browser is actually good at, confirming that a real user looking at a real page sees the right thing. This article walks through that pattern end to end using BrowserBash's testmd v2 format, which lets a single test file mix deterministic API steps with deterministic UI assertions and plain-English browser steps in one linear script.

## The Problem With UI-Only Test Setup

Most teams start end-to-end testing by driving everything through the UI, including setup. You want a test that checks an order confirmation page, so the test also creates an account, adds a product to a cart, and completes checkout, all before it gets to the assertion you actually care about. Every one of those setup steps is a place the test can fail for reasons that have nothing to do with the confirmation page. A flaky "Add to cart" button breaks a test that was never about the cart. A slow signup form makes a 5 second test take 45 seconds.

This is a well known problem in the testing world, and the standard fix is arrange-act-assert: put your setup (arrange) somewhere fast and reliable, do the one thing you're testing (act), then check the outcome (assert). The trouble with browser automation tools has historically been that "somewhere fast and reliable" meant writing a second test framework, usually a Playwright or Selenium script that calls your API directly, then handing off to your UI framework for the assertion. Two frameworks, two languages sometimes, two places for state to drift out of sync.

testmd v2 collapses that into one file. You write API steps and UI steps in the same plain-English test, in the same session, with the id from the API response available as a variable in your UI steps. No handoff, no second tool.

## What Arrange-Act-Assert Actually Means for Browser Tests

Arrange-act-assert isn't a BrowserBash invention, it's decades old, but it maps unusually well onto browser testing once you separate "state I need to exist" from "behavior I'm testing." Consider a test that verifies a product page renders correctly for an out-of-stock item. The arrange step is: a product exists with `stock_quantity: 0`. The act step is: a user navigates to that product's page. The assert step is: the page shows an "Out of Stock" badge and disables the Add to Cart button.

Only the middle and last steps involve the browser. The first step is a database write, and the fastest, most reliable way to perform a database write in a test is a direct API call, not five minutes of UI navigation to get a product into that state through an admin panel. This is exactly what api seed data ui verification testing means in practice: push data in through the API, pull the resulting behavior out through the UI, and never conflate the two.

The pattern also isolates failure causes. If the API seed step fails, you know your test data setup is broken (bad endpoint, bad payload, backend down) before you've spent any browser time. If the UI verification step fails after a successful seed, you know the rendering logic is the problem. That separation alone makes a flaky suite easier to triage on a Monday morning.

## Introducing testmd v2: API Steps Meet UI Verification

BrowserBash's `*_test.md` format has always been plain English steps in a markdown file, composable with `@import` and templated with `{{variables}}`. testmd v2 adds a `version: 2` line to the frontmatter and, with it, two new deterministic step types that never touch a language model:

- **API steps**: `GET`, `POST`, `PUT`, `DELETE`, or `PATCH` a URL, optionally with a JSON body, followed by an `Expect status N` line that can also store a value from the response with `store $.path as 'name'`.
- **Verify steps**: assertions compiled to real Playwright checks, not agent judgment, covering things like URL contains, title is or contains, text visible, a named button/link/heading visible, element counts, and stored value equals.

Everything else, the plain-English navigation and interaction steps, still runs through the agent exactly as it always has. Consecutive plain-English steps get grouped into a single agent block against the same page, so you're not paying a model call per click, only per logical chunk of UI work. Steps execute one at a time against a single browser session, in order, top to bottom. If a file has no `version: 2` frontmatter, it behaves exactly like a v1 file, so nothing about existing tests breaks.

One honest caveat: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It doesn't yet run directly on Ollama or OpenRouter the way v1 files can. If your whole workflow is local-only models, keep that in mind before you commit to v2 for every suite; you can still adopt it selectively for the tests where API seeding actually pays off.

## Anatomy of an API Seed Step

An API step in testmd v2 looks close to how you'd describe the request in English, because it largely is English with a fixed grammar underneath. Here's a seed step that creates a product and captures its id:

```
POST https://api.example.com/v1/products with body {"name": "Wireless Mouse", "price": 24.99, "stock_quantity": 0}
Expect status 201, store $.data.id as 'productId'
```

That's the entire "arrange" phase of the test. No browser opens, no page loads, no model call happens. It's an HTTP request and a JSON path extraction, which means it runs in milliseconds and fails loudly and specifically if your API contract changes. If the endpoint starts returning `200` instead of `201`, or the id moves from `data.id` to `data.product.id`, the test tells you exactly that, rather than failing three steps later with a confusing "element not found" error from a UI step that was never the real problem.

The `store ... as 'name'` clause is what makes the rest of the file possible. `productId` becomes a variable available to every subsequent step in the same file, UI steps included, the same way `{{variables}}` have always worked in BrowserBash tests, with secret-marked values masked in logs.

You can chain multiple API steps to build up more complex state. A common pattern is seed a user, seed an order for that user, then verify the order shows up in that user's order history:

```
POST https://api.example.com/v1/users with body {"email": "{{unique_email}}", "name": "Test User"}
Expect status 201, store $.data.id as 'userId'

POST https://api.example.com/v1/orders with body {"user_id": "{{userId}}", "items": [{"sku": "WM-100", "qty": 1}]}
Expect status 201, store $.data.id as 'orderId'
```

Two deterministic requests, two stored ids, zero browser time spent, and the rest of the file can reference `{{userId}}` and `{{orderId}}` wherever it needs them.

## Deterministic Verify Steps: Checking What the API Created

Once your data exists, the "assert" phase is where you actually use the browser, and this is where the second half of api seed data ui verification testing comes in. A `Verify` step written in the supported grammar compiles to a real Playwright expectation rather than asking a model to eyeball the page and decide if it looks right.

```
Verify URL contains "/products/{{productId}}"
Verify 'Wireless Mouse' text visible
Verify 'Out of Stock' text visible
Verify 'Add to Cart' button visible is false
```

Each of these is a concrete, repeatable check. A pass means the condition held, full stop. A fail comes back with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md`, so when something breaks you're looking at "expected text 'Out of Stock' to be visible, found nothing" instead of a paragraph of agent prose describing what it thinks it saw.

It's worth being precise about what falls inside the grammar and what doesn't. URL checks, title checks, text visibility, named button/link/heading visibility, element counts, and stored-value equality are all deterministic. If you write a `Verify` line that falls outside that grammar, say something more open-ended like "Verify the page looks well formatted," it still runs, but it's agent-judged and flagged `judged: true` in the output so you can always tell which assertions are hard guarantees and which are model opinions. That distinction matters a lot when you're deciding how much to trust a green run.

## A Full Example: Seed a Record, Verify It Renders

Here's a complete testmd v2 file that ties the whole pattern together: seed a product over the API, store its id, then drive a real browser to the product page and verify it renders with the right out-of-stock state.

```
---
version: 2
---

# Out of stock product renders correctly

POST https://api.example.com/v1/products with body {"name": "Wireless Mouse", "price": 24.99, "stock_quantity": 0}
Expect status 201, store $.data.id as 'productId'

Go to https://shop.example.com/products/{{productId}}
Verify URL contains "/products/{{productId}}"
Verify 'Wireless Mouse' text visible
Verify 'Out of Stock' text visible

DELETE https://api.example.com/v1/products/{{productId}}
Expect status 204
```

Notice the last two lines: a teardown step that deletes the seeded product after the UI verification is done. Because API steps are just HTTP calls, cleanup costs nothing extra and keeps your test database from accumulating junk records every time the suite runs. This is something that's genuinely painful to do reliably when your only tool is UI automation, because "delete the thing you just created through the UI" usually means more clicking through more UI that could itself fail.

Run it the same way you'd run any BrowserBash test:

```bash
browserbash testmd run ./.browserbash/tests/out_of_stock_product_test.md --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, which is what you want feeding a CI pipeline or an AI coding agent rather than prose. Exit codes stay frozen: `0` for passed, `1` for failed, `2` for error or infra or budget-stop, `3` for timeout. The API steps and Verify steps show up as their own step events in that stream, distinct from the agent-driven UI blocks, so a CI dashboard or an AI agent reading the output can tell at a glance which parts of the run were deterministic and which involved model reasoning.

## Why This Beats Seeding Through the UI

It's worth being explicit about the tradeoffs rather than just asserting API seeding is better, because in some cases it genuinely isn't.

| Aspect | Seed through the UI | Seed through the API |
|---|---|---|
| Speed | Seconds per step, multiple steps to reach the state | Milliseconds, one request per record |
| Failure signal | Ambiguous: a broken signup form and a broken confirmation page look the same | Specific: API failures and UI failures are separated by step type |
| Coverage of setup flows | Free (you're exercising the signup form anyway) | None (you have to test signup separately) |
| Determinism | Depends on agent judgment for each setup step | Deterministic HTTP status codes and JSON extraction |
| Cost (model calls) | Higher, every setup step may involve the agent | Lower, API steps never call a model |
| Cleanup | Painful, often skipped, database bloats over time | Trivial, a DELETE call |

The honest reading of that table is that API seeding is the right call whenever the thing you're setting up is not the thing you're testing. If you're specifically testing the signup flow, you obviously need to drive signup through the UI, that's the "act" phase for that particular test, not something to skip. The pattern isn't "always avoid the UI for setup," it's "don't make the UI carry setup weight for behavior it isn't the subject of."

There's also a cost dimension that matters at scale. Every plain-English UI step in a testmd file that isn't served by the replay cache involves a model call under the hood. A seed sequence that used to be eight UI steps (navigate to admin, log in, click new product, fill five fields, submit, confirm) becomes zero model calls when it's two API steps instead. Multiply that across a suite with fifty tests that all need a fresh product or user, and the savings in both wall-clock time and `cost_usd` (which shows up in `run_end` from BrowserBash's bundled per-model price table) are substantial. This compounds nicely with BrowserBash's replay cache on the UI portion too: a green run records its actions, and the next identical run replays them with no model calls at all until the page actually changes, so the UI verification steps get cheap on repeat runs the same way the API steps are cheap from the start.

## Handling Auth, Secrets, and Variables Across API and UI Steps

Real seed-and-verify tests almost always need authentication on both sides: an API key or bearer token for the seed request, and a logged-in session for the UI check. BrowserBash handles these independently but lets both draw from the same variable and secret-masking system.

For the API side, put credentials in `{{variables}}` and mark them as secrets in your variables file so they're masked as asterisks in every log line, the same masking that already applies to passwords typed in UI steps:

```
POST https://api.example.com/v1/products with body {"name": "Wireless Mouse", "price": 24.99}
Header Authorization: Bearer {{apiToken}}
Expect status 201, store $.data.id as 'productId'
```

For the UI side, if the page you're verifying requires a logged-in user, save a session once with `browserbash auth save <name> --url <login-url>`, which opens a browser, lets you log in by hand, and captures the resulting Playwright storageState when you hit Enter. From then on, reference it with `--auth <name>` on the run command, or add an `auth:` line to the test file's frontmatter, and every run of that test starts already logged in instead of re-authenticating from scratch. If the saved profile's origins don't cover the URL you're navigating to, BrowserBash prints a warning rather than silently proceeding unauthenticated, which saves you from a false-positive green run that never actually tested a logged-in state.

Secrets never leak into caches either. On the builtin engine path (which v2 uses), cached actions get re-templatized back to `{{name}}` before they're written to disk, and secret-typing actions are origin-pinned, meaning a cached "type the password" action fails closed if it's ever replayed against a different origin than the one it was recorded on.

## When testmd v2 Is (and Isn't) the Right Tool

testmd v2 earns its keep specifically when a test needs setup data that's inconvenient or slow to create through the UI, and the UI portion of the test is genuinely about verifying rendering or behavior rather than exercising the setup flow itself. Order confirmation pages, dashboards that depend on existing records, permission checks that need a user in a specific role, search results that depend on seeded inventory: these are all cases where api seed data ui verification testing shortens the test dramatically without losing any of the coverage that matters.

It's the wrong tool when the setup flow is the feature under test. Don't API-seed your way past the checkout flow in a test whose entire point is validating checkout. And if your team's whole stack runs on local Ollama models with no Anthropic key or gateway in reach, remember the current limitation: v2's API and Verify steps need the builtin engine, so you'll want an `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway configured for those specific suites, even if the rest of your BrowserBash usage stays fully local and free with Stagehand.

It's also worth sizing the model correctly for the UI portions that remain. Very small local models, roughly 8B parameters and under, tend to get flaky on longer multi-step objectives even when the objective is simple in principle. If you're running the UI half of these tests against a local model, a mid-size model in the Qwen3 or Llama 3.3 70B class holds up noticeably better, and a hosted model is worth it for anything with several UI interaction steps chained together.

## Running It in CI With Cost and Budget Guardrails

Once you've got a handful of seed-then-verify tests, they slot into the same orchestration tools as any other BrowserBash suite. `run-all` picks up memory-aware concurrency automatically, orders previously-failed and slowest tests first, and flags flaky results over time:

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml --budget-usd 2.00
```

The `--budget-usd` flag matters more here than you might expect, because even though your seed steps are free API calls, a suite full of many small UI-verification tests still accumulates model cost across the batch. Once the running total crosses the budget, BrowserBash stops launching new tests, marks the remainder `skipped` rather than silently truncating the run, exits with code `2`, and records the spend in both `RunAll-Result.md` and the JUnit `<properties>` block so it shows up wherever your CI already surfaces test results.

For larger suites, sharding splits the work across parallel CI machines deterministically, computed from sorted discovery order so machines agree without any coordination step:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2
```

If you want the whole thing wired into GitHub Actions with a PR comment showing the verdict table and recording links, BrowserBash ships an official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) that handles artifact upload and matrix jobs including shard: and budget-usd: inputs directly.

And if you're already driving BrowserBash from an AI coding agent rather than a CI YAML file, the same seed-and-verify testmd files work unchanged through the [MCP server](https://browserbash.com/features): `browserbash mcp` exposes `run_test_file` so Claude Code, Cursor, or any MCP host can execute the file and read back the structured verdict, including which assertions were deterministic and which were agent-judged, without you writing a single line of glue code.

For more patterns like this one, the [tutorials](https://browserbash.com/tutorials) section walks through testmd composition with `@import`, and the [learn](https://browserbash.com/learn) hub covers the full grammar for API and Verify steps if you want the reference rather than the walkthrough. You can also browse real [case studies](https://browserbash.com/case-study) of teams that moved setup out of the UI layer.

## FAQ

### What is the arrange-act-assert pattern in end-to-end testing?

Arrange-act-assert is a structure for tests where you first set up the state you need (arrange), perform the one action you're actually testing (act), then check the result (assert). In browser testing, the arrange step is often the slowest and least reliable part when done through the UI, which is why seeding it over the API instead is such a common optimization.

### Does testmd v2 replace plain-English UI steps entirely?

No. testmd v2 adds deterministic API steps and Verify steps alongside the existing plain-English steps, it doesn't remove them. Consecutive plain-English steps still run as agent-driven blocks against the live page, so you keep the no-selectors, no-page-objects experience for anything that genuinely needs a browser, and only use API steps for the setup parts that don't.

### Can I use API seed data with BrowserBash's local Ollama models?

Not yet for the API and Verify step types specifically. testmd v2 currently requires the builtin engine, which needs an ANTHROPIC_API_KEY or a compatible ANTHROPIC_BASE_URL gateway. Plain v1 test files and the Stagehand engine still work fully locally with Ollama and no API keys.

### How is a Verify step different from asking the agent to check the page?

A Verify step written in the supported grammar (URL contains, text visible, button/link/heading visible, element counts, stored value equals) compiles to a real Playwright assertion with no model involved, so a pass or fail is a hard fact backed by expected-versus-actual evidence. A more open-ended instruction still runs but is agent-judged and explicitly flagged judged: true in the output, so you always know which assertions are deterministic and which are opinions.

To try this pattern on your own project, install the CLI with `npm install -g browserbash-cli` and write your first `version: 2` test file today. An account is entirely optional, everything above runs locally, but if you want the free cloud dashboard or want to browse more patterns first, [sign up here](https://browserbash.com/sign-up).
