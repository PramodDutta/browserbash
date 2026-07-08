---
title: A Real Hybrid API and UI Suite in One testmd File
description: "Learn hybrid API UI testing testmd style: seed data over API, drive the UI in plain English, and Verify results, all in one file."
date: 2026-07-29
category: tutorial
---

Most test suites split into two worlds that barely talk to each other: fast API checks that seed data and confirm backend state, and slower UI flows that click through what a real user would see. Hybrid API UI testing with testmd closes that gap. In a single `*_test.md` file you can create a resource over HTTP, drive a browser through the resulting page in plain English, and finish with deterministic assertions that check the DOM, not a model's opinion of it. This post walks through one complete worked example, line by line, so you can copy the pattern into your own suite today.

## Why Hybrid API and UI Testing Matters

Pure UI suites are honest about what a user experiences, but they are slow and brittle when they also have to create the data they test against. Signing up a user through the browser just to test the profile page wastes a full flow's worth of time and adds a full flow's worth of failure points before you even reach the thing you care about. Pure API suites are fast and deterministic, but they never touch the rendering layer, so a broken button or a silently failing client-side validation slips right past them.

The practical answer most teams land on eventually is a hybrid: seed state through the API where the API is fast and reliable, then verify the parts that only exist in the browser, like layout, client-side state, and what text a user actually sees. Until testmd v2, BrowserBash could describe the UI half in plain English but had no first-class way to fold API setup into the same file. Now it does, and the whole suite, seed data included, lives in one version-controlled document instead of being split across a setup script and a separate spec.

## What testmd v2 Actually Changes

A `*_test.md` file without a version marker still behaves exactly the way it always has: the whole file becomes one objective string handed to an AI agent, which figures out the sequence of actions itself. That's fine for a single flow, but it means every step, including pure data setup, goes through a model.

Add `version: 2` to the frontmatter and the runner switches to a different execution model: steps run one at a time, in order, against a single persistent browser session. Two step types are deterministic and never touch a language model at all:

- **API steps**: `GET/POST/PUT/DELETE/PATCH <url>` optionally followed by `with body {...}`, then an `Expect status N` line that can also `store $.path as 'name'` to pull a value out of the JSON response for later use.
- **Verify steps**: assertions like URL contains, title is/contains, text visible, a named button/link/heading visible, element counts, or a stored value equals something. These compile straight to Playwright checks.

Everything else, meaning consecutive plain-English lines, gets grouped into an agent-driven block that runs against the current page. That's the important design detail: you are not choosing between "AI mode" and "deterministic mode" for the whole file. You are marking each step by what it actually is, and the runner honors that per step.

One caveat worth stating plainly: testmd v2 currently drives the builtin engine only, which means it needs `ANTHROPIC_API_KEY` set, or an `ANTHROPIC_BASE_URL` gateway pointed at a compatible model. It does not yet run directly against Ollama or OpenRouter the way v1 objectives can. If your whole workflow is local-only today, keep that in mind before you commit to v2 syntax in CI.

## The Full Worked Example

Here's a complete, realistic hybrid suite. It seeds a task through a public JSON API, opens the resulting page, drives a short UI flow in English, and closes with Verify assertions that don't depend on any model judgment. Save this as `checkout_flow_test.md` in your `.browserbash/tests/` directory.

```markdown
---
version: 2
---

# Hybrid checkout smoke test

- POST https://api.example.com/carts with body {"items": [{"sku": "SKU-4471", "qty": 2}]}
- Expect status 201, store $.id as 'cartId'

- GET https://api.example.com/carts/{{cartId}}
- Expect status 200, store $.total as 'expectedTotal'

- Open https://shop.example.com/cart/{{cartId}}
- Click the "Proceed to checkout" button
- Fill in the shipping form with name "Test Buyer", address "12 Elm Street", city "Austin", zip "73301"
- Click the "Continue to payment" button

- Verify url contains "/checkout/payment"
- Verify 'Order summary' heading is visible
- Verify text "{{expectedTotal}}" is visible
- Verify 'Place order' button is visible
```

That's a full, runnable suite in nineteen lines. Let's take it apart section by section, because each block is doing a specific job and none of it is decorative.

### The API Seed Block

```markdown
- POST https://api.example.com/carts with body {"items": [{"sku": "SKU-4471", "qty": 2}]}
- Expect status 201, store $.id as 'cartId'

- GET https://api.example.com/carts/{{cartId}}
- Expect status 200, store $.total as 'expectedTotal'
```

Two API calls, two stored values. The first creates a cart with a specific SKU and quantity and captures the new cart's ID. The second reads the cart back and captures the total the backend actually computed. Neither of these lines involves the browser at all, and neither of them involves a model. They run as plain HTTP requests, the response is checked against the expected status code, and the value at the given JSON path is stored under a name you chose. That name becomes a `{{variable}}` you can reference anywhere later in the file, UI steps included.

This is the part that used to require a separate setup script, a `beforeAll` hook, or a fixture file living somewhere else in your repo. Now it's two lines in the same file the reviewer is already reading, and it runs in milliseconds because there's no browser and no inference involved.

### The Plain-English UI Flow

```markdown
- Open https://shop.example.com/cart/{{cartId}}
- Click the "Proceed to checkout" button
- Fill in the shipping form with name "Test Buyer", address "12 Elm Street", city "Austin", zip "73301"
- Click the "Continue to payment" button
```

This block is consecutive plain-English steps, so testmd v2 groups them into a single agent-driven pass over the page. Notice the `{{cartId}}` variable from the API block feeding straight into the opening URL: the cart you just created over HTTP is the exact cart the browser opens. No hunting through the UI to find "a" cart, no separate signup flow just to get a cart ID to test with. The agent reads the objective, finds the checkout button, fills the shipping form using the labels an ordinary user would see, and moves to payment. There are no selectors here, and there's no page object model to maintain. If the shipping form gets a new field next sprint, or the button copy changes from "Continue to payment" to "Go to payment," you update a sentence, not a locator file.

### The Closing Verify Block

```markdown
- Verify url contains "/checkout/payment"
- Verify 'Order summary' heading is visible
- Verify text "{{expectedTotal}}" is visible
- Verify 'Place order' button is visible
```

This is where the hybrid pattern earns its keep. `{{expectedTotal}}` was computed by the API in the seed block, and the last Verify line checks that the exact number the backend returned is the number rendered on the payment page. That's a real cross-layer assertion: it fails if the backend total and the UI total ever drift apart, which is precisely the kind of bug that a pure API test can't see (it never looks at rendering) and a pure UI test can't cleanly express (it would have to guess or hardcode the expected total).

Each of these four Verify lines matches the built-in assertion grammar, so each one compiles to a real Playwright check: URL substring match, heading visibility by accessible role, text visibility, button visibility by accessible name. None of it is agent judgment. If "Order summary" isn't in the accessibility tree, the assertion fails with expected-vs-actual evidence, full stop, no model asked whether it "looks about right." That evidence lands in `run_end.assertions` in the NDJSON output and in the assertion table inside the generated `Result.md`. If you write a Verify line that falls outside the grammar, for example something judgment-based like "Verify the page feels uncluttered," it still runs, but the runner flags it `judged: true` in the output so you can tell at a glance which assertions are deterministic and which ones are asking the model for an opinion.

## Running the Suite

A single hybrid file runs the same way any testmd file does:

```bash
browserbash testmd run .browserbash/tests/checkout_flow_test.md --agent
```

The `--agent` flag switches output to NDJSON, one JSON object per line, which is what you want feeding a CI job or another AI agent rather than a human terminal. Because this is a `version: 2` file, the runner needs the builtin engine's model access, so make sure `ANTHROPIC_API_KEY` is set in the environment (or `ANTHROPIC_BASE_URL` points at a compatible gateway) before the run starts.

If the checkout flow sits behind a login you don't want to repeat on every run, save the session once and reuse it:

```bash
browserbash auth save shopper --url https://shop.example.com/login
browserbash testmd run .browserbash/tests/checkout_flow_test.md --auth shopper --agent
```

`auth save` opens a real browser, you log in by hand once, and hitting Enter captures the Playwright storageState. Every subsequent run with `--auth shopper` starts already authenticated instead of re-running a login flow as its own set of steps. You can also point to a saved profile directly in the file's frontmatter with an `auth:` field, so the association travels with the test instead of living only in a CI script.

For a whole directory of hybrid suites, run them together with the orchestrator, with cost and time controls attached:

```bash
browserbash run-all .browserbash/tests --shard 1/3 --budget-usd 2.00 --junit out/junit.xml
```

`--shard 1/3` runs a deterministic third of the suite based on sorted discovery order, so three parallel CI machines split the work without coordinating with each other. `--budget-usd 2.00` stops launching new tests once the running suite crosses that spend estimate; anything not yet started is reported `skipped` rather than silently dropped, and the suite exits with code 2 so CI notices. Because most of a hybrid file's steps are deterministic API and Verify steps that never touch a model, the actual dollar cost of a suite like this tends to be small: the model only earns its keep on the plain-English UI block, not on the setup or the assertions.

## Why the API Steps Matter More Than They Look

It's tempting to read the API block as a minor convenience, a way to skip a few clicks. The bigger deal is what it does to test independence and speed. A UI-only version of the same test would need to either create a cart by clicking through a product page and an add-to-cart button first, which multiplies the surface area that can break before you even reach checkout, or rely on a pre-seeded fixture cart that every test in the suite fights over. Neither is great. The API block sidesteps both problems: every run gets its own fresh cart with a known SKU and quantity, created in milliseconds, and nothing about the checkout test depends on some other test's leftover state.

It also means failures are diagnosable at a glance. If the suite fails on the `Expect status 201` line, you know instantly the problem is upstream in cart creation, not in the checkout UI, and you haven't burned a full browser session finding that out. If it fails on `Verify text "{{expectedTotal}}" is visible`, you know the browser rendered a number that doesn't match what the API computed, which is a much more specific signal than "checkout test failed."

## Hybrid testmd vs. Pure API or Pure UI Suites

| Approach | Setup speed | Cross-layer coverage | Flakiness source | Model cost |
|---|---|---|---|---|
| Pure API suite | Fast (HTTP only) | None (never renders anything) | Backend/API contract drift | None |
| Pure UI suite (v1 testmd or a full click-through) | Slow (every precondition clicked through) | Full, but conflates setup bugs with the bug under test | UI flow brittleness, slow setup timing out | Full objective, every step |
| Hybrid testmd v2 (this pattern) | Fast for setup, focused for UI | Full where it matters, at the seam between backend truth and rendered UI | Only the plain-English block, isolated from setup | Only the plain-English block |

The honest tradeoff is that hybrid files require the target application to have an API worth calling directly, which is true for most modern web apps but not universal, and they require the builtin engine's model access rather than a fully local Ollama setup. If your app has no meaningful API surface, or you need a strictly zero-cost, fully offline suite, a v1 plain-English objective run against a local model is still the simpler starting point.

## When to Choose This Pattern

Reach for a hybrid API-plus-UI testmd file when:

- You're testing a flow that depends on a precondition (a cart, an order, a user with a specific role or plan) that's expensive or flaky to build through the UI.
- You want an assertion that spans both layers, like confirming a backend-computed value matches what's rendered, not just that "something numeric" is on the page.
- You're running in CI and want most of the suite's cost and time to sit in fast, deterministic steps, with the AI-driven portion scoped down to only the part that genuinely needs judgment: interpreting a UI in English.
- You already have `ANTHROPIC_API_KEY` or a gateway configured, since v2 needs it.

Stick with a plain v1 objective, or a pure API test with your existing HTTP client, when the flow you're testing has no meaningful UI component, or when your whole pipeline needs to stay on a local model with no external API key at all.

## Common Mistakes to Avoid

A few things trip people up the first time they write a hybrid file. First, forgetting `version: 2` in the frontmatter: without it, the whole file collapses back into one big objective string handed to the agent, and your carefully separated API and Verify steps get treated as prose instructions instead of deterministic steps. Second, using a stored variable before it's stored: `{{cartId}}` only exists after the `Expect status 201, store $.id as 'cartId'` line runs, so an API step referencing it needs to come after, not before, in file order. Third, writing a Verify line that almost matches the grammar but not quite, like phrasing that doesn't map to one of the supported checks (URL, title, text visibility, named element visibility, element counts, stored value equality) will silently fall back to agent-judged mode rather than erroring, so it's worth checking the `judged` flag in your NDJSON output if a Verify step's pass or fail doesn't feel deterministic. Finally, don't forget that secrets you pass through `{{}}` variables are masked in every log line automatically, so a password used in a shipping or account field never shows up in plaintext in `Result.md` or the NDJSON stream.

## Wiring It Into an Agent or CI Pipeline

Because `run_test_file` is one of the tools BrowserBash exposes over its MCP server, a hybrid suite like this one is directly callable from any MCP-aware coding agent, not just from a terminal. Once you've installed the server with `claude mcp add browserbash -- browserbash mcp` (the same pattern works for Cursor, Windsurf, Codex, or Zed), an agent working on the checkout page can call `run_test_file` against `checkout_flow_test.md` and get back structured JSON: status, a summary, final state, the assertions table, cost, and duration. A failed hybrid test is still a successful tool call from the agent's perspective, the agent simply reads the verdict and knows the checkout total drifted from the backend, without you writing a single line of glue code.

For a repository-level pipeline, the official GitHub Action wraps the same runner: install, run the suite (hybrid files included), upload JUnit, NDJSON, and Result.md artifacts, and post a self-updating PR comment with the pass/fail table. See the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) for the full workflow syntax, including `shard:` matrix jobs and `budget-usd:` for cost-bounded suites.

If you're new to the assertion grammar or want more worked examples before writing your own hybrid file, the [tutorials section](https://browserbash.com/tutorials) and the general [learn hub](https://browserbash.com/learn) both walk through the individual step types in isolation before combining them the way this article does. The [case studies](https://browserbash.com/case-study) page also has examples of teams that moved from pure UI suites to this kind of hybrid setup and what changed in their CI run times.

## FAQ

### What is hybrid API and UI testing in testmd?

Hybrid API UI testing in testmd means combining deterministic API steps, plain-English UI steps, and deterministic Verify assertions in a single `*_test.md` file with `version: 2` in the frontmatter. API steps seed or check backend state directly over HTTP, the plain-English block drives a real browser through the resulting page, and Verify steps close the loop with Playwright-backed assertions, so setup, action, and assertion all live in one version-controlled document instead of being split across scripts.

### Does testmd v2 work with local Ollama models?

Not yet. testmd v2 currently drives BrowserBash's builtin engine only, which speaks the Anthropic API, so it needs `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway pointed at a compatible model. Plain v1 testmd files (no `version` frontmatter) still support the full Ollama-first model resolution BrowserBash defaults to elsewhere.

### How do I pass a value from an API step into a UI step?

Use the `store` clause on an `Expect status` line, for example `Expect status 201, store $.id as 'cartId'`, and then reference `{{cartId}}` in any later step in the same file, including the URL you open or the text a Verify step checks for. Variables are resolved in file order, so the storing step has to appear before any step that uses it.

### Are Verify steps checked by AI or are they deterministic?

Verify steps that match the supported grammar (URL contains, title is/contains, text visible, a named button/link/heading visible, element counts, or a stored value equals) compile to real Playwright checks and never involve model judgment. A Verify line that falls outside that grammar still executes but is agent-judged instead, and the runner marks it `judged: true` in the output so you can tell which assertions are deterministic and which aren't.

Try it on your own checkout, signup, or dashboard flow: `npm install -g browserbash-cli`, add `version: 2` to a test file, and mix an API seed step with a plain-English UI block and a closing Verify assertion. No account is required to run it locally, but if you want a shared dashboard for the team, [sign up here](https://browserbash.com/sign-up).
