---
title: "Hybrid Testing: Fast API Setup, Then AI UI Verification"
description: "Hybrid API and UI testing: use API setup for fast, deterministic state, then BrowserBash for AI UI verification. Faster, less flaky, better isolated tests."
date: 2026-06-26
category: guide
---

Do not drive your entire test through the UI. If the thing you actually want to check is one screen, clicking through ten setup screens to reach it is wasted time and a flake surface you signed up for voluntarily. The faster, steadier pattern is hybrid: set up state through the API, where it is quick and deterministic, then use the UI only to verify that the state renders correctly. Create the user, seed the cart, mint the auth token, and place the order with REST calls. Then point [BrowserBash](https://browserbash.com) at the one page that matters and ask it, in plain English, whether the UI reflects what you seeded.

That is the whole idea. The rest of this guide is the mechanics: capturing an ID from the API step, handing it to the browser through `{{variables}}`, deciding when hybrid beats a full UI journey, and where it bites you if you trust it blindly. BrowserBash is a free, open-source (Apache-2.0) CLI from The Testing Academy, and every command here is real and runnable.

## Why setup through the UI is the wrong default

Think about what a checkout-confirmation test costs when you build the whole thing in the browser. To assert that an order page shows "Shipped," the test first registers an account, verifies an email, logs in, browses to a product, adds it to the cart, fills a shipping form, enters payment, and submits. Eight screens, every one a place where a redesigned button, a new cookie banner, a slow third-party widget, or a rate limit can fail the run. Not one of those steps is the thing you are testing. They are tax, and every one you add is independent risk multiplied together, so the assertion you care about never runs on the executions that died in setup.

The API does not have these problems. A `POST /orders` either returns 201 with an ID or it does not. No rendering, no animation, no element to locate, no banner to dismiss. It runs in milliseconds, it is deterministic, and it fails loudly with a status code instead of a screenshot you squint at. So push the boring setup down to the API and keep the browser for the one job it is uniquely good at: confirming a human would see the right thing.

That isolates the one variable a good test should. In a hybrid order-status test, the variable is the order page's rendering and labeling: does status `shipped` in the database surface as the word "Shipped," in the right place, without a stale cache or a broken template. The account, product, payment, and order record are preconditions, not the subject. Building preconditions through the same UI you are testing couples them together, so a failure tells you "something in this long chain broke" instead of "the order page mislabels shipped orders." The API builds the precondition; the browser checks one claim about one surface.

## The hybrid pattern, end to end

The shape is always the same three moves:

1. A shell or CI step calls the API to seed data and captures an identifier or token from the response.
2. That captured value is passed into BrowserBash as a `{{variable}}` via `--var key=value` (or the environment).
3. `browserbash run` opens the seeded resource in a real browser and asserts the UI shows the expected state.

That `{{variable}}` substitution is the entire bridge between the API world and the browser world: whatever your `curl` produced, your objective can consume.

### A worked example: seed an order by API, verify it by UI

Here is the pattern as a single shell snippet you could drop into a script or CI job. The first part is plain `curl` and `jq` creating an order and pulling its ID from the JSON response; the second hands that ID to BrowserBash to verify the order page.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Seed state via the API and capture the new order's ID.
ORDER_ID=$(curl -sS -X POST "https://api.example.com/orders" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"sku": "WIDGET-1", "qty": 1, "ship": true}' \
  | jq -r '.id')

echo "Seeded order ${ORDER_ID}"

# 2. Hand the captured ID to BrowserBash and verify the UI.
browserbash run \
  "open the order {{orderId}} page and verify the status says Shipped" \
  --var orderId="${ORDER_ID}"
```

The `curl` call creates an order with `ship: true`, and `jq -r '.id'` extracts the new `id` into `ORDER_ID`. No browser has opened; this is fast and either works or returns a non-2xx you can fail on immediately. The `browserbash run` call is the verification: `--var orderId="${ORDER_ID}"` fills the `{{orderId}}` placeholder, so the agent receives a concrete instruction like "open the order 48213 page and verify the status says Shipped." A real Chrome browser opens, navigates to the order page, reads it the way a person would, and judges whether the status reads "Shipped." If the page shows "Processing," errors, or omits the label, the run fails. One sentence and one variable, testing exactly the surface you meant to.

You will usually want this seeded resource cleaned up afterward, which is also an API call, not a UI one:

```bash
# 3. Teardown via the API.
curl -sS -X DELETE "https://api.example.com/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${API_TOKEN}"
```

Setup, verify, teardown: two of the three are pure API, and the browser does only the part it is irreplaceable for.

### Where the values come from

The ID is the obvious candidate, but the same capture-and-pass move works for anything the API returns. A common case is authentication: rather than scripting a login through the browser on every run, mint a token from a credentials endpoint and pass it in. For how BrowserBash masks sensitive values as `*****` so a token or password never lands in a log line, see the [variables and secrets tutorial](/blog/browserbash-variables-and-secrets-tutorial). Mark anything sensitive as a secret variable: it is substituted into the run but redacted everywhere it would otherwise be printed.

### Reusing a login session to skip the auth screens entirely

Even with token-based setup, repeatedly authenticating is overhead you can often remove. BrowserBash can save and reuse a browser session, so you log in once, persist the cookies and storage, and start every subsequent hybrid test already authenticated. The mechanics are in [reuse login session across browser tests](/blog/reuse-login-session-across-browser-tests), and the broader approach in [AI login flow testing](/blog/ai-login-flow-testing). The principle runs through this post: do the slow, flaky thing once, and only when it is the thing under test.

## Structuring hybrid tests as repeatable files

Inline shell is fine for a one-off, but real suites want the verification step as a versioned, reviewable artifact. BrowserBash supports `*_test.md` files: a Markdown test where the objective lives as prose, `{{variables}}` are filled at run time, secrets are masked, and `@import` pulls shared setup or login steps into many tests so you write the common preamble once. The API seeding and teardown stay in your shell or CI job and export the captured values; the `*_test.md` file holds the assertion and does not care how the order got created, only that `{{orderId}}` points at a shipped one. That separation is the isolation we are after.

## When to use hybrid, and when not to

Hybrid is a sharp tool for a specific shape of problem, not a replacement for end-to-end journeys. Reaching for it everywhere leaves real bugs uncaught.

### Use hybrid when

Use hybrid when **setup is slow or multi-step and you care about one UI surface.** The order-status page is the textbook case: the value is in the rendering, and the eight steps to produce a shipped order are overhead you would rather buy from the API in one call. Reach for it when you are writing many variations of the same verification (shipped, processing, cancelled, refunded) and want to seed each state directly instead of running the full flow four times, when setup touches a part of the system you do not need to re-test here, and when setup flake is drowning out signal, because moving setup to the API removes that flake at the source.

### Use a full UI journey when

Use a full end-to-end UI journey when **the flow itself is the thing under test.** If the question is "can a new customer get from the homepage to a completed purchase," you cannot answer it by seeding an order, because the seeding skips the exact integration points you are validating: the add-to-cart button, the shipping form post, the payment widget hand-off, the confirmation screen wiring to the order just created. A hybrid test that injects an order via API would pass while a real user is blocked at a broken checkout button, and you would ship the outage. When the wiring between screens is the subject, click through them.

These are complementary, not competing. A healthy suite has a small number of full-journey tests that prove the critical paths connect end to end, and a larger number of fast hybrid tests that check how surfaces render the many states behind them. Use the slow journey to prove the path exists; use fast hybrid checks for the combinatorial detail without paying the journey cost every time.

## Hybrid in CI

The pattern drops straight into a pipeline, because both halves are just commands: a CI step runs the `curl` seeding, exports the ID, then runs `browserbash run` against the seeded resource, with teardown in an `always`-style cleanup step so a failed assertion still removes the data. For an agent-driven run, the `--agent` flag streams NDJSON events and sets a process exit code (`0` pass, `1`/`2`/`3` for failure or error) you can branch on. Full pipeline wiring is in the [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial).

```bash
# CI verification step: NDJSON out, exit code drives the gate.
browserbash run \
  "open the order {{orderId}} page and verify the status says Shipped" \
  --var orderId="${ORDER_ID}" \
  --headless \
  --agent
```

## Honest limits

Hybrid testing buys speed and stability by taking on responsibility. Be clear-eyed about what you own.

**You own the setup and teardown.** When you seed through the API, you are on the hook for cleaning up. An order created by `curl` does not get rolled back by a test runner that does not know it exists. Forget the teardown and your test database fills with orphaned records that skew counts, trip uniqueness constraints, or make a later "the list shows N orders" assertion flap. Every seeded resource needs a matching delete that runs even when the verification fails.

**The API and the UI can drift apart.** A hybrid test assumes the state you inserted through the API is the same state the UI reads and renders, and that assumption breaks in real systems. The API might write to a primary while the UI reads a replica that has not caught up, so the order is "shipped" in the database and "processing" on screen from replication lag. A caching layer might serve a stale page. The API might accept a status value the UI has no label for. When seeded and rendered state disagree, your test is exercising the gap between two subsystems, sometimes a real bug and sometimes an eventual-consistency window you handle with a wait or retry. Either way, "I set it via API" is not the same as "the UI sees it."

**The pattern is only as trustworthy as the API.** Hybrid testing leans its whole weight on the API being correct. If `POST /orders` silently creates the order in the wrong state, or your seeding payload does not match what the real checkout flow would produce, your UI verification passes against a precondition that never occurs in production: a green test proving the order page renders a state no real user can reach, while the state real users hit goes unchecked. You removed UI setup flake by trusting the API, so that trust has to be earned. Keep a few full-journey tests so the way orders are really created stays under test, and keep your seeding payloads honest against the real flow rather than a fiction you invent.

## FAQ

### When should I use hybrid testing instead of a full UI test?

Use hybrid when setup is slow or multi-step and you only care about one UI surface, like verifying an order-status page renders "Shipped": seed the order through the API and let BrowserBash check the one page that matters. Use a full UI journey when the flow itself is the subject, like proving a new user can complete checkout from the homepage, because seeding skips the very integration points that flow validates.

### How do I pass an ID from a curl call into BrowserBash?

Capture it from the API response in your shell, then pass it with `--var`: `ORDER_ID=$(curl -sS ... | jq -r '.id')`, then `browserbash run "open the order {{orderId}} page and verify the status says Shipped" --var orderId="${ORDER_ID}"`. BrowserBash substitutes the `{{orderId}}` placeholder with your value before the agent starts driving the browser.

### Does hybrid testing work in CI?

Yes. Run the API seeding as one pipeline step, export the captured ID, then run `browserbash run` with `--headless` and `--agent`. The `--agent` flag emits NDJSON and sets an exit code (`0` pass, `1`/`2`/`3` for failure or error) so the verification becomes a normal gate. Put teardown in a cleanup step that always runs so a failed verification still deletes the seeded data. See the [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial).

### What if the API and the UI show different states?

That disagreement is real information, not a tool bug. It usually means replication lag, a stale cache, or a status value the UI has no label for. Sometimes a genuine defect, sometimes an eventual-consistency window you handle with a short wait or retry. Either way, treat "I set it via API" and "the UI shows it" as two separate facts, and keep some full-journey tests so the real path stays under test.

## Get started

Install the CLI from npm and write your first hybrid verification:

```bash
npm install -g browserbash-cli
```

BrowserBash is free and open-source under Apache-2.0. Seed state through the API, hand the ID to a one-sentence objective, and let an AI agent confirm the UI got it right. See the [features](/features) for the full command surface, or [learn](/learn) to build hybrid tests into a real suite.
