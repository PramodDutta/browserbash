---
title: testmd v2: Seed Data With API Steps, Verify With the UI
description: "A hands-on testmd v2 api steps tutorial: seed data with a POST step, capture an id, then verify it in the UI with deterministic checks."
date: 2026-07-13
category: tutorial
---

If you have ever written a browser test that spends its first three sentences describing how to create an account, log in, add three items to a cart, and only then gets to the thing you actually wanted to test, you already know the problem this testmd v2 api steps tutorial is here to fix. Plain-English objectives are great at describing intent, but they are a clumsy tool for data setup. Clicking through a signup form to get one test account is not testing anything, it is just overhead the model has to burn tokens on before your real assertion even starts. testmd v2 splits that concern in two: API steps seed the data deterministically, and Verify steps check the result in the UI, no LLM judgment required for either half.

This is a practical, code-first walkthrough. By the end you will have a working `*_test.md` file that seeds a resource over HTTP, stores a value from the response, opens a page that depends on it, and verifies the UI reflects it, all without writing a single Playwright selector.

## What testmd v2 actually changes

Every `*_test.md` file BrowserBash has ever run starts life as prose: numbered or bulleted steps in English, optionally stitched together with `@import` and `{{variables}}`. In v1 (the default, and still fully supported), the runner joins every step into one big objective string and hands the whole thing to the agent. The agent reads the combined instructions, drives the browser, and reports a verdict at the end.

That works well for exploratory or single-flow tests. It gets shaky once you introduce data dependencies, because "sign up a new user, then log in as that user, then check their dashboard" asks the model to carry state across steps inside a single freeform reasoning pass. Every step is agent-judged, every step costs tokens, and a flaky signup form can quietly poison everything downstream.

testmd v2 adds one frontmatter field, `version: 2`, and changes execution to run against a single browser session, one step at a time, with two step types that never touch a model at all:

- **API steps**: `GET/POST/PUT/DELETE/PATCH <url>` with an optional `with body {...}`, followed by an `Expect status N` (optionally `, store $.path as 'name'`) line.
- **Verify steps**: deterministic UI assertions compiled to real Playwright checks (URL contains, title is/contains, text visible, `'name' button|link|heading` visible, element counts, stored value equals).

Consecutive plain-English steps in between are still grouped into agent blocks and run against the same live page, so you are not losing the flexibility of natural language, you are just no longer forced to route data setup through it. v1 files without frontmatter behave exactly as before, nothing changes underneath you unless you opt in.

## Anatomy of a v2 test file

Here is the shape of a minimal hybrid file. Save this as `.browserbash/tests/cart_seed_test.md`:

```
---
version: 2
---
# Checkout page shows a seeded cart

1. POST https://api.example.com/carts with body {"userId": "{{USER_ID}}", "items": [{"sku": "SKU-100", "qty": 2}]}
2. Expect status 201, store $.id as 'cartId'
3. Open https://shop.example.com/cart/{{cartId}}
4. Verify 'Checkout' button visible
5. Verify text "2 items" visible
```

Five steps, two of them are pure HTTP calls with a JSONPath store, one is a plain-English navigation handled by the agent, and two are deterministic Verify assertions. No step here asks a model to reason about whether a cart was created, because the API response's status code already told you that in a way you can trust.

### The API step grammar

The `GET/POST/PUT/DELETE/PATCH <url>` line accepts a full URL (variables and secrets substitute the same way they do everywhere else in BrowserBash) and an optional `with body {...}` clause for a JSON payload. The very next line has to be an `Expect status N` line, and it can optionally chain a `store $.path as 'name'` clause that pulls a value out of the JSON response using a JSONPath expression and drops it into your variable set for every step after it.

A couple of things worth calling out because they trip people up the first time:

- `Expect status N` is a strict equality check on the HTTP status code. If your seed endpoint returns 200 instead of 201, the step fails, full stop, and the test file will not silently continue with a `cartId` that does not exist.
- The stored value is available to every later step, including plain-English ones, as `{{cartId}}` (or whatever name you gave it). It works exactly like any other testmd variable.
- Only single JSON bodies are supported in the `with body` clause today. If your seed endpoint needs form-encoded data or multipart, you are better off seeding through a small script outside the test file and passing the resulting id in as a variable.

### The Verify step grammar

Verify steps compile to real Playwright expectations, so a pass means the condition was literally checked and held, not "the model looked at a screenshot and thought it looked right." The supported forms as of 1.5.0 cover the checks that account for the overwhelming majority of what testers actually assert:

- URL contains a substring
- Page title is or contains a string
- Text is visible on the page
- A named button, link, or heading is visible, written as `'Checkout' button visible`
- Element counts (for example, "3 items visible")
- A stored variable equals a specific value

If a `Verify` line does not match this grammar, BrowserBash does not throw it away, it falls back to letting the agent judge it, and the resulting event is flagged `judged: true` in the output so you can always tell which assertions were deterministic and which were not. That flag matters more than it sounds like it does: when you are debugging a flaky CI run six months from now, you want to know immediately whether the failing check was a real Playwright expectation or an LLM opinion.

## Building the full hybrid test

Let's build something closer to what you would actually ship. Say you are testing an order confirmation page that depends on three things existing: a user, a product, and an order linking them. Doing this entirely in English would mean asking the agent to create an account, search a catalog, add a product to a cart, and check out, purely to get to the page you actually want to test. Here is the v2 version instead.

```
---
version: 2
---
# Order confirmation reflects seeded order total

1. POST https://api.example.com/users with body {"email": "{{TEST_EMAIL}}", "password": "{{TEST_PASSWORD}}"}
2. Expect status 201, store $.id as 'userId'
3. POST https://api.example.com/orders with body {"userId": "{{userId}}", "sku": "SKU-441", "qty": 3}
4. Expect status 201, store $.orderId as 'orderId'
5. Expect status 201, store $.total as 'orderTotal'
6. Open https://shop.example.com/orders/{{orderId}} and wait for the confirmation panel to render
7. Verify 'orderTotal' stored value equals text on page
8. Verify text "Order confirmed" visible
9. Verify 'Track shipment' button visible
```

Two seed calls, three stored values, one agent-driven navigation, and three deterministic checks. Notice step 5 chains a second `store` off the same order-creation response, since a single API response body can feed more than one variable downstream. The agent only has to do one thing here: open a URL and wait for a panel to render, a task well within reach of even a modest local model, because it is not being asked to also remember what order it just theoretically created three steps ago.

### Running it

The command is identical to running any other testmd file:

```bash
browserbash testmd run .browserbash/tests/cart_seed_test.md --agent
```

`--agent` gets you NDJSON on stdout: one `step` event per line as each step completes, and a final `run_end` event carrying the verdict, `assertions` array, and (when the model is known to the pricing table) a `cost_usd` estimate. Because the API and Verify steps never call a model, that cost estimate for this file will mostly reflect the single agent-driven navigation step, not the whole flow.

Since testmd v2 currently drives the builtin engine (it needs `ANTHROPIC_API_KEY` set, or an `ANTHROPIC_BASE_URL` gateway pointed at a Claude-compatible endpoint), make sure that is configured before you run a v2 file. This is worth being upfront about: v2 does not yet run on Ollama or OpenRouter directly the way v1 objectives can. If your whole pipeline is local-model-only today, keep using v1 for now and revisit v2 once your seed data needs grow past what plain English can carry cleanly.

## Why this beats one giant English objective

It is worth being specific about what you are actually buying here, because "deterministic is better" is a platitude until you have felt the alternative fail.

**Reliability.** An HTTP POST either returns 201 or it doesn't. There is no interpretation step. A model reading a signup form, on the other hand, can misclick a field, misread a validation message, or get stuck on a CAPTCHA-adjacent widget that has nothing to do with the thing you're actually testing. Moving setup out of the agent's hands removes an entire category of flake that has nothing to do with your product.

**Speed.** API calls that used to be "navigate to signup, fill three fields, click submit, wait for redirect" (call it 15-30 seconds of browser automation and a model round trip per field) become a single HTTP request that completes in milliseconds. On a suite with a dozen tests that each need a fresh user and a seeded cart, that difference compounds into minutes, not seconds.

**Cost.** Every agent-judged step costs tokens. An API step costs nothing beyond the HTTP round trip. If you are running `run-all` with `--budget-usd`, moving three or four setup steps out of the agent loop and into API steps can meaningfully change how many tests fit inside a fixed budget before the suite starts skipping the rest.

**Debuggability.** When a v1 objective fails halfway through a long multi-step flow, you often get a summary of "the agent could not complete the objective" and have to reconstruct which sub-step actually broke from the transcript. When a v2 API step fails, you get an exact status code mismatch on an exact line number. When a Verify step fails, you get expected-vs-actual evidence in the `run_end.assertions` array and in the Result.md table. That precision is the difference between a five-minute fix and a twenty-minute investigation.

None of this means English objectives are obsolete. The genuinely valuable part of natural-language testing is describing user-facing behavior that has no clean API equivalent: "confirm the discount banner only shows on mobile viewport," "verify the error toast disappears after five seconds," "check that the search autocomplete suggests the right category." Those are UI behaviors, and they are exactly where an agent driving a real browser earns its keep. testmd v2 is not asking you to abandon that, it is asking you to stop routing your data setup through it.

## Where API steps stop and Verify steps start

A useful mental model: **API steps establish ground truth, Verify steps confirm the UI agrees with it.** Anything you could assert with a database query or a backend call belongs on the API side. Anything that only exists once rendered, layout, visibility, copy, interactive state, belongs on the Verify side or, if it needs judgment beyond the current grammar, stays as a plain-English step.

A common pattern that works well in practice:

| Concern | Step type | Why |
|---|---|---|
| Create a test user | API (`POST /users`) | Deterministic, fast, no UI dependency |
| Seed a cart or order | API (`POST /orders`) | Same as above, plus you can chain stored values |
| Log in | Plain-English or `--auth <profile>` | Session-dependent, sometimes has UI quirks worth catching |
| Confirm the total renders correctly | Verify (stored value equals) | Deterministic once the number is known |
| Confirm a banner or empty state appears | Verify (text/element visible) | Deterministic UI presence check |
| Confirm a subtle layout or responsive behavior | Plain-English | Needs visual judgment the current Verify grammar doesn't cover |
| Clean up test data | API (`DELETE /orders/{{orderId}}`) | Deterministic teardown, keeps your backend tidy between runs |

That last row is worth calling out on its own: API steps are not just for setup. A `DELETE` step at the end of your file, gated behind the id you stored earlier, gives you a self-cleaning test that does not leave orphaned rows in a shared staging database every time CI runs. That is a small thing, but it is the kind of small thing that saves someone a very annoying Monday morning three months from now.

## Combining v2 with auth, monitor, and CI

testmd v2 is not a standalone feature, it composes with the rest of the toolchain. If your app requires a login before the order confirmation page is reachable, save the session once and reuse it instead of re-authenticating in every test:

```bash
browserbash auth save shopper --url https://shop.example.com/login
```

Then reference it from the test file's frontmatter (`auth: shopper`) or pass `--auth shopper` on the command line, and your v2 file's agent-driven steps start from an already-authenticated context. Combined with API seeding, a full test that used to need "sign up, log in, add to cart, check out, verify" now needs one seed call, one auth profile, and a couple of Verify lines.

For CI, run the whole hybrid suite through `run-all` with sharding and a hard budget so a seeding bug in one test can't quietly balloon your monthly spend:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

And if this is a flow you care about staying green over time rather than just at merge time, wrap it in monitor mode so you get alerted only when the pass/fail state actually changes, not on every successful heartbeat:

```bash
browserbash monitor .browserbash/tests/cart_seed_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Because the seed and verify halves of this test are deterministic and mostly model-free, an always-on monitor built from a v2 file is cheap to run continuously, most of each run's cost is the one navigation step, not repeated API-parsing judgment calls.

If you already have Playwright specs doing similar seed-then-check flows and want a head start converting them, `browserbash import` handles the deterministic parts of the translation (goto/click/fill/expect patterns, `getBy*` locators, `process.env.X` becoming `{{X}}` variables) and drops anything it can't confidently translate into an `IMPORT-REPORT.md` rather than guessing. You will still want to hand-convert your setup logic into API steps yourself, since import works off the UI actions in the spec, not the backend calls a `beforeEach` hook might be making.

## When to reach for v2 and when to stay on v1

Neither version is strictly better, they solve different shapes of problem. Use this as a rough decision guide:

**Stay on v1 (no frontmatter, plain English)** when your test is a single coherent user journey with no external data dependency worth seeding separately, when you are running purely on local Ollama models and don't have an Anthropic key or gateway available, or when the whole point of the test is judging something inherently visual or fuzzy that a Verify grammar line can't express cleanly.

**Move to v2 (`version: 2` frontmatter)** when your test needs a specific data state to exist before the interesting part starts, when you are tired of a flaky signup or checkout flow eating your setup budget every single run, when you want assertion failures to come with exact expected-vs-actual evidence instead of a paragraph summary, or when you are running the same seed-and-check flow often enough (in CI, or under `monitor`) that the token savings from skipping agent-judged setup steps actually add up.

A reasonable middle ground for a lot of teams: keep exploratory and new-feature tests on v1 while you're still figuring out the flow, then "graduate" a test to v2 once you know exactly what data state it needs and want it to run fast and cheap forever after. Nothing about promoting a v1 file to v2 requires rewriting the whole thing either, since consecutive English steps between your API and Verify lines keep working exactly as they did before.

## A note on limits

Being upfront about the rough edges: v2 needs the builtin engine right now, which means an `ANTHROPIC_API_KEY` or a compatible gateway, not the Ollama-first, zero-key path that BrowserBash defaults to for plain objectives. The API step grammar handles JSON bodies and JSONPath stores, it does not (yet) handle multipart uploads, GraphQL, or response headers as store sources. The Verify grammar covers the common assertion shapes, not arbitrary custom logic, if you need something outside that list it falls back to agent judgment and gets flagged as such rather than silently pretending to be deterministic. None of these are dealbreakers for the hybrid seed-and-verify pattern this tutorial covers, but they're worth knowing before you plan a migration around v2 handling every test file you own.

## Getting started

If you want to try this on your own suite, start small: pick one test that spends its first several steps on setup you could just as easily do with a curl command, add `version: 2` to its frontmatter, convert the setup into API steps with a stored id or two, and replace at least one agent-judged assertion with a Verify line. Run it with `--agent` and look at the `run_end.assertions` array to see the deterministic evidence for yourself. Once you've felt the difference in reliability and speed on one file, the rest of the migration tends to go quickly.

For more background on the full v1.5.0 feature set, including the MCP server and deterministic assertions this tutorial builds on, see the [BrowserBash learn hub](https://browserbash.com/learn) and the [tutorials index](https://browserbash.com/tutorials). If you want to see how a hybrid API+UI suite fits into a CI pipeline end to end, the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) walk through sharding and PR comments, and the [features page](https://browserbash.com/features) has the current state of every capability described here.

## FAQ

### What is testmd v2 in BrowserBash?

testmd v2 is an opt-in mode for `*_test.md` files, enabled by adding `version: 2` to the file's frontmatter. It runs steps one at a time against a single browser session and adds two deterministic step types, API steps for seeding or checking data over HTTP and Verify steps for compiled Playwright UI assertions, alongside the usual plain-English steps.

### Do I need an Anthropic API key to use API steps and Verify steps?

Yes, testmd v2 currently drives BrowserBash's builtin engine, which speaks only the Anthropic API, so you need `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway pointed at a Claude-compatible endpoint. This differs from v1 plain-English objectives, which can run entirely on a local Ollama model with no key at all.

### How do I store a value from an API response and use it later?

Chain a `store $.path as 'name'` clause onto your `Expect status N` line, using a JSONPath expression to pull the value out of the JSON response body. The stored value becomes available as `{{name}}` in every step after it, including plain-English navigation steps and Verify assertions, exactly like any other testmd variable.

### Is a Verify step the same as an agent judging a screenshot?

No, when a `Verify` line matches the supported grammar (URL contains, title is or contains, text visible, a named button/link/heading visible, element counts, or a stored value equals a page value), BrowserBash compiles it to a real Playwright check with no model involved. Lines that fall outside that grammar still run, but they get judged by the agent instead and are explicitly flagged `judged: true` in the output so you always know which assertions were deterministic.

Ready to try it on your own suite? Install with `npm install -g browserbash-cli` and write your first hybrid test file today. An account is optional (BrowserBash runs entirely on your machine by default), but if you want the free cloud dashboard and run history, [sign up here](https://browserbash.com/sign-up).
