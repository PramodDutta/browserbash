---
title: "AI Testing for Marketplaces: Buyer & Seller Flows"
description: "AI testing for marketplace apps: how to verify buyer-and-seller handoffs (list, message, purchase, payout) with BrowserBash markdown tests and @import."
date: 2026-04-25
category: use-case
---

A two-sided marketplace breaks in places a single-user app never can. The bug isn't in the buyer's checkout or the seller's listing form on their own — it's in the handoff between them. A seller lists an item, a buyer messages about it, the buyer pays, the seller gets a payout. Each side passes its own happy-path test, and the seam in the middle still ships broken. AI testing for marketplace apps exists to catch exactly that seam: the moment one user's action becomes another's reality. This article walks through how you test those buyer-and-seller handoffs with [BrowserBash](https://www.npmjs.com/package/browserbash-cli) markdown tests, why the shared-step problem matters, and where a human-run service like Rainforest QA is genuinely the better call.

I'll assume you've built or tested a marketplace before — Etsy-shaped, eBay-shaped, Airbnb-shaped, a B2B procurement portal, a freelance gig board, doesn't matter. The structural problem is the same: two account types, two browsers, one shared object (a listing, an order, a conversation) that has to stay consistent as control passes back and forth.

## Why marketplace testing is structurally harder than single-user testing

Most test suites assume one actor. A user logs in, does a thing, sees a result, logs out. Your fixtures seed one account; your assertions check one screen. That model covers a SaaS dashboard or a content site fine.

A marketplace violates the assumption at the foundation. The unit of value isn't an action — it's a transaction between two parties who never share a session. When a seller marks an item "shipped," the buyer's order page has to reflect it. When a buyer disputes a charge, the seller's payout has to hold. When a seller deletes a listing, an in-flight purchase against it has to resolve sanely instead of 500-ing. None of that is visible from inside one account. You have to drive both sides and check that the state they share agrees.

That's the core difficulty: **state that one user writes, another reads, asynchronously, across separate sessions.** The failures are the worst kind — intermittent, timing-dependent, often only surfacing when real money or inventory moves. A test that logs in as one user and never crosses to the other cannot see them.

### The four handoffs that actually matter

Strip a marketplace down and the high-value flows reduce to four handoffs. Test these and you've covered most of what generates support tickets and chargebacks.

| Handoff | Seller does | Buyer does | The seam under test |
| --- | --- | --- | --- |
| **List → Discover** | Creates a listing | Finds it in search/browse | Indexing, visibility rules, moderation gates |
| **Message → Reply** | Answers an inquiry | Asks a question | Notifications, thread identity, read state |
| **Purchase → Fulfill** | Sees the new order | Pays for the item | Inventory decrement, order state, payment hold |
| **Payout → Settle** | Receives funds | Triggers the charge | Fee math, ledger consistency, payout timing |

Each row is two browsers and one shared object. The left column happens in the seller's session, the right in the buyer's; the seam is what your test must assert agrees across both. A single-actor test can verify the left or the right. It structurally cannot verify the seam.

## How AI testing for marketplace apps changes the approach

Here's where natural-language agents earn their place. In a scripted framework, testing a two-sided flow means two `BrowserContext` objects, storage-state juggling, hand-written selectors for both UIs, and explicit synchronization between them. It works, but it's brittle, and every redesign on either side sends someone back into the locators.

With BrowserBash you write the objective in plain English and an AI agent drives a real Chrome browser step by step — no selectors, no page objects. You describe the seller's job ("create a listing titled X priced at Y, publish it") and the buyer's job ("search for X, confirm it appears, open it, message the seller") as separate objectives, and the agent figures out how to accomplish each against the live page. When the seller's listing form gets redesigned, you don't touch a locator file — the objective still reads "publish a listing," and the agent re-derives the steps.

That matters more in a marketplace than almost anywhere else, because you have two independently-evolving UIs: a buyer experience the growth team redesigns monthly, and a seller dashboard the merchant team iterates on separately. Selector churn is doubled, and natural-language objectives absorb that churn instead of breaking on it.

You can try the basic shape on any store right now:

```bash
npm install -g browserbash-cli

# Seller side: stand up the thing that's about to be bought
browserbash run "Log in to the seller dashboard, create a listing titled \
'Vintage Camera' priced at 49, publish it, and confirm it shows as Active."

# Buyer side: prove the handoff landed
browserbash run "Search the marketplace for 'Vintage Camera', open the first \
result, add it to the cart, check out, and verify 'Thank you for your order!'"
```

Two objectives, two real browser runs, each returning a pass/fail verdict plus structured results. That's the skeleton. Making it repeatable and committable is where markdown tests come in.

## Markdown tests and @import: the shared-step pattern

Run-from-the-CLI is fine for a smoke check. For a real suite you want tests you can commit, review in pull requests, and run in CI. BrowserBash does this with `*_test.md` files: committable markdown where each list item is a step. They support `@import` composition and `{{variables}}` templating, and write a `Result.md` after each run.

The `@import` mechanism is what makes marketplace testing sane. Both journeys share setup: log in, dismiss the cookie banner, get to a known starting screen. You'd otherwise copy that login block into every test, and when login changes you'd fix it in fifteen places. With `@import` you write the shared steps once and pull them into every flow that needs them.

### Composing a buyer-and-seller suite

Picture three files: a shared login fragment, a seller flow, and a buyer flow that runs after the seller.

`login_test.md` — the shared step block, imported everywhere:

```bash
# login_test.md
- Go to {{baseUrl}}
- Click "Sign in"
- Enter {{email}} into the email field
- Enter {{password}} into the password field
- Click the "Log in" button
- Confirm the account menu is visible
```

`seller_list_test.md` — imports the login, then lists an item:

```bash
# seller_list_test.md
@import login_test.md
- Go to the seller dashboard
- Create a new listing titled "{{itemTitle}}" priced at {{price}}
- Publish the listing
- Confirm the listing status reads "Active"
```

`buyer_purchase_test.md` — imports the same login, then buys what the seller just listed:

```bash
# buyer_purchase_test.md
@import login_test.md
- Search the marketplace for "{{itemTitle}}"
- Confirm a result titled "{{itemTitle}}" appears
- Open it and verify the price shows {{price}}
- Add it to the cart and complete checkout
- Confirm the page shows "Thank you for your order!"
```

The shared login lives in one place. Change your auth flow and you edit `login_test.md` once; both suites inherit the fix. The `{{itemTitle}}` and `{{price}}` variables thread the same listing through both sides, so the buyer is provably searching for the thing the seller just created — the handoff, expressed as a variable carried across two files.

You run them in sequence, passing the variables in:

```bash
browserbash testmd run ./seller_list_test.md \
  --var email=seller@example.com \
  --var itemTitle="Vintage Camera" --var price=49

browserbash testmd run ./buyer_purchase_test.md \
  --var email=buyer@example.com \
  --var itemTitle="Vintage Camera" --var price=49
```

Same `itemTitle`, two different accounts. If the buyer run can't find the listing, the handoff broke — the seller created something the buyer can't see. That's the marketplace-specific bug a single-actor suite would never catch, found with two markdown files.

### Secrets stay masked

Passwords are unavoidable in account-based tests. BrowserBash lets you mark a variable as secret, and it's masked as `*****` in every log line — the run output, the `Result.md`, the CI console. You pass a real password in and the artifact never leaks it:

```bash
browserbash testmd run ./seller_list_test.md \
  --var email=seller@example.com \
  --secret password=hunter2
```

In the logs that becomes `Enter ***** into the password field`. For a marketplace juggling buyer creds, seller creds, and maybe an admin account, that masking is the difference between a CI log you can paste in a ticket and one you have to scrub by hand.

## Driving two sides without two test frameworks

How do you represent "buyer" and "seller" when each is just an account? The cleanest answer is separate runs with separate credentials, as above. Because each `browserbash run` or `testmd run` is its own browser session, there's no session bleed. State crosses through your backend — the listing the seller created is in the database, so the buyer's fresh session sees it on search. That mirrors how the real app works: two strangers, two browsers, one shared backend.

If you need them genuinely concurrent — testing a race like two buyers hitting the last unit of inventory — run two BrowserBash processes in parallel and let them collide. Each emits its own verdict; you compare. There's no shared in-memory state to coordinate, which is exactly what you want when the thing under test is whether your backend serializes the contention.

### Recording the seam for evidence

When a handoff fails, "it didn't work" isn't a bug report — you want to see it. The `--record` flag captures a screenshot and a full `.webm` session video on any engine, so when the buyer run can't find the seller's listing you have a video of the empty search results page. On the builtin engine you additionally get a Playwright trace you can open in the trace viewer and step through frame by frame.

```bash
browserbash testmd run ./buyer_purchase_test.md \
  --var itemTitle="Vintage Camera" \
  --record
```

For a flaky cross-session bug — the kind that reproduces one run in five — the video of the failing run is the difference between filing a fix and filing a "couldn't reproduce." If you want that history searchable, the optional, opt-in cloud dashboard (`browserbash connect` + `--upload`) keeps run history, video recordings, and per-run replay; free uploaded runs are retained 15 days. Prefer everything local? `browserbash dashboard` runs a fully local dashboard with no account at all. Both are covered on the [features page](https://browserbash.com/features).

## Wiring it into CI

A marketplace suite is most useful when it runs on every deploy, gating both surfaces. BrowserBash has an agent mode built for this: `--agent` emits NDJSON — one JSON event per line on stdout — so your pipeline parses structured events instead of scraping prose. Exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout.

```bash
browserbash testmd run ./buyer_purchase_test.md --agent --headless \
  --var itemTitle="Vintage Camera" --var price=49 \
  || echo "Buyer purchase handoff failed in CI"
```

Run the seller suite first, then the buyer suite; a non-zero exit on either fails the build. Because the steps live in committable markdown, a reviewer sees the test change in the same pull request as the feature change — the buyer flow and its test travel together. That's a real advantage over recorded or hosted scripts outside your repo, where test and code drift apart over time. The [agent NDJSON guide on the blog](https://browserbash.com/blog) goes deeper on consuming the event stream.

## The model story, and an honest caveat

BrowserBash is Ollama-first. It defaults to free local models with no API keys, and nothing leaves your machine — it auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. On local models you can guarantee a $0 model bill. That's a meaningful contrast with human-run services that charge per flow, and it matters for marketplaces: keeping the whole run on your machine means buyer and seller credentials never transit a third party.

Here's the honest part. A marketplace handoff is a long, multi-step objective: log in, navigate, create, publish, switch context, search, verify, purchase. Very small local models (roughly 8B parameters and under) get flaky on long chains like this — they lose the thread halfway through checkout or misread a confirmation. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. BrowserBash supports OpenRouter (including genuinely free hosted models like `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key. For a four-step smoke test, an 8B model is fine. For "list an item, switch accounts, find it, buy it" in one objective, give the agent a bigger model or split it into the smaller markdown steps shown above. The [learn section](https://browserbash.com/learn) has model-selection guidance.

Two engines back the runs: `stagehand` (the default, MIT-licensed, by Browserbase) and `builtin` (an in-repo Anthropic tool-use loop). For where the browser runs, one `--provider` flag switches between `local` (your own Chrome, the default), `cdp`, `browserbase`, `lambdatest`, and `browserstack` — handy to verify a buyer checkout across real browser/OS combos:

```bash
browserbash testmd run ./buyer_purchase_test.md --provider lambdatest \
  --var itemTitle="Vintage Camera"
```

## BrowserBash versus Rainforest QA for marketplace flows

The two tools solve overlapping problems very differently, and which one fits depends on what you're optimizing.

Rainforest QA is a well-known QA platform whose model has historically centered on running tests — via a crowd of human testers and, more recently, AI-driven execution — as a managed service. The exact current pricing, the human/automated split, and internal architecture are details I won't invent; treat anything not on their public materials as not publicly specified as of 2026. What's fair to say is that the category Rainforest sits in — managed/hosted test execution — typically prices around runs or flows, and that's the axis where a free, local, open-source CLI is a different animal.

| | BrowserBash | Rainforest QA (category traits) |
| --- | --- | --- |
| **License / cost** | Free, open-source (Apache-2.0); $0 on local models | Commercial managed service; per-run/seat pricing typical of the category |
| **Where tests run** | Your machine or a provider you choose | Vendor-hosted execution |
| **Test authoring** | Plain-English objectives + committable markdown | Platform-authored test cases |
| **Data residency** | Local-first; nothing leaves your machine on local models | Runs through the vendor |
| **Human-in-the-loop** | No; agent-driven | Human testers historically a core part of the model |
| **Lives in your repo** | Yes — `*_test.md` in version control | Tests live in the platform |
| **CI integration** | NDJSON `--agent`, standard exit codes | Vendor integrations |

### When Rainforest QA is the better choice

I'd genuinely point you to a managed service like Rainforest in several cases. If you need real human judgment in the loop — "does this checkout *feel* broken," subjective visual checks, exploratory passes an agent won't think to do — humans still beat any agent at that. If you have no engineering bandwidth to own a suite and would rather pay a vendor to maintain coverage, a managed service is a legitimate trade. And if you need a contractual SLA, audited results, or someone to call when a release is at risk, a paid platform gives you an accountable counterparty that an open-source CLI cannot.

### When BrowserBash fits better

BrowserBash wins when you want buyer and seller tests to live in your repository, reviewed alongside the code that changes them. It wins when cost-per-run is what you're fighting — a marketplace might run smoke tests on dozens of deploys a day, and paying per flow adds up fast where a local agent bill is zero. It wins on data residency, since your payment fixtures and account credentials never leave your machine on local models. And it wins for AI coding agents and CI, where the NDJSON stream and clean exit codes mean no prose parsing. The honest summary: Rainforest sells you outcomes and human judgment; BrowserBash gives you an owned, committable, free agent you run yourself. The [pricing page](https://browserbash.com/pricing) lays out exactly what's free.

## A realistic end-to-end marketplace scenario

Let me thread it together as you'd run it, because the handoffs only prove out in sequence.

First, the seller lists. `seller_list_test.md` imports the shared login, creates "Vintage Camera" at 49, publishes, and asserts the status reads Active. The listing now exists in your backend.

Second, the **List → Discover** handoff. The buyer suite searches for "Vintage Camera" and confirms it appears. If your search index updates asynchronously, this is where a too-fast test flakes — and because the agent reasons about the page rather than racing a fixed timeout, it tolerates a beat of indexing lag. If the listing never appears, that's a real cross-session visibility bug, and you've caught it.

Third, the **Purchase → Fulfill** handoff. The buyer completes checkout and sees "Thank you for your order!" A follow-up seller run confirms a new order shows in the dashboard with the right item and price. Now the transaction is provably consistent on both sides — the buyer's money moved and the seller's order list reflects it.

Fourth, the **Message → Reply** handoff. A buyer run sends an inquiry; a seller run confirms it arrived in the right thread with the right read state. Pure cross-session state, and a notorious source of "the buyer never heard back" tickets.

Every one of these is a markdown file or two, sharing a login via `@import`, threading a listing through `{{variables}}`, recorded with `--record` when it matters, gated in CI with `--agent`. None of it required a page object or a selector. That's the shape of AI testing for marketplace apps in practice — you describe the two jobs and assert the seam between them holds. There's a worked walkthrough on the [case study page](https://browserbash.com/case-study) if you want a full run end to end.

## FAQ

### How do you test buyer and seller flows in the same marketplace test?

You run two separate sessions — one logged in as the seller, one as the buyer — and thread a shared object through both with a variable. In BrowserBash, the seller markdown test creates a listing using `{{itemTitle}}`, and the buyer test searches for that same `{{itemTitle}}`. Because each run is its own browser session, state crosses through your backend exactly as it would for two real users, and the buyer run finding (or failing to find) the listing is your assertion on the handoff.

### What is the @import feature in BrowserBash markdown tests?

`@import` lets one markdown test pull in steps from another file, so shared setup like login lives in exactly one place. You write a `login_test.md` once and import it into both your buyer and seller flows. When the login flow changes, you fix it in that single file and every test that imports it inherits the fix, which removes the copy-paste maintenance that two-sided suites otherwise accumulate.

### Is BrowserBash a good Rainforest QA alternative for marketplaces?

It depends on what you need. BrowserBash is free, open-source, runs locally, and keeps tests committed in your repo, which fits teams optimizing for cost-per-run, data residency, and owning their suite. Rainforest QA and similar managed services are a better fit when you need human-in-the-loop judgment, a contractual SLA, or want to outsource maintenance entirely. They solve overlapping problems with different trade-offs rather than being strict replacements.

### Can AI testing handle payment and payout flows in a marketplace?

Yes for the browser-driven parts — an agent can complete checkout, confirm an order, and verify a seller's order list and payout screen reflect it, since those are all on-page actions and assertions. For the actual money movement you'll typically point tests at a sandbox or test-mode payment environment rather than charging real cards. BrowserBash drives the UI and asserts what the buyer and seller see; keep the financial backend in test mode so runs are safe to repeat.

Marketplace bugs hide in the handoff, and the only way to catch them is to drive both sides and assert the seam holds. Install with `npm install -g browserbash-cli`, write a shared login fragment, `@import` it into your buyer and seller flows, and run them against any store — no account required to start. When you want run history and video replay, the optional free dashboard is one command away at [browserbash.com/sign-up](https://browserbash.com/sign-up).
