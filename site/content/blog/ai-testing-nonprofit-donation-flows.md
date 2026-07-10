---
title: AI Testing for Nonprofit Donation Flows
description: "AI testing donation flows for nonprofits: validate one-time gifts, recurring pledges, and sandbox payments by plain-English intent, not selectors."
date: 2026-07-02
category: use-case
---

If your donation page breaks on a Tuesday afternoon, no alert fires, no build turns red, and no engineer gets paged. You just quietly stop receiving gifts. AI testing donation flows solves exactly this blind spot: you describe the giving journey in plain English, an AI agent drives a real browser through it against a payment sandbox, and you get a deterministic pass or fail before a supporter ever hits the broken button. For nonprofits running on thin engineering budgets, that difference between "we found it in CI" and "we found it three days later in the giving report" is real money.

Donation forms are deceptively hard to test. They span an embedded payment widget, an address form, a recurring-gift toggle, gift-designation dropdowns, employer-match lookups, and a thank-you page that has to fire the receipt email and the analytics event. Most of that logic lives in third-party iframes and JavaScript you do not control. Traditional selector-based tests shatter every time your donation platform ships a redesign. This guide walks through how to test the whole flow by intent instead, using a free open-source CLI, so a redesign or a coupon-code regression surfaces in minutes rather than in your monthly reconciliation.

## Why donation flows are the worst thing to test with selectors

A checkout on an e-commerce site is at least yours. A nonprofit donation flow usually is not. You are stitching together a form builder (Classy, Givebutter, Donorbox, or a homegrown page), a payment processor (Stripe, PayPal, Braintree) inside a sandboxed iframe, and a CRM webhook on the back end. Each of those vendors updates its own DOM on its own schedule, and none of them tells you first.

That means the classic Playwright or Cypress approach, where you hand-write `page.locator('#card-number')` and `page.getByTestId('recurring-toggle')`, is a maintenance treadmill. Payment iframes deliberately obscure their internals for PCI reasons. The "Give monthly" control might be a radio, a toggle, or a slider depending on the week. Your test does not care which one it is. It cares that a donor can choose to give monthly and that the confirmation reflects a recurring pledge.

This is the core argument for AI testing of donation flows: you assert the intent, not the implementation. You write "Choose to give monthly," and the agent figures out which control satisfies that intent on the page right now. When the form vendor swaps a toggle for a dropdown, your English does not change. That resilience is worth more on a donation page than almost anywhere else, because you own so little of the markup.

### The stakes are conversion, not just coverage

A flaky login test annoys your engineers. A broken donation flow costs the organization directly, and often silently. Card-declined handling that shows a blank screen, a recurring toggle that resets on validation error, an Apple Pay button that vanishes on mobile Safari: these are the regressions that never throw a server error and never show up in your logs. They just depress conversion. Testing by intent lets you cover the messy human path (fill the form wrong, get an error, fix it, succeed) the way a real supporter would experience it.

## How BrowserBash tests a donation flow by intent

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it once and describe what you want validated. An AI agent drives a real Chrome or Chromium browser step by step, no selectors and no page objects, then returns a deterministic verdict plus structured results you can pipe into CI.

Install it globally and run a first donation objective against your staging environment:

```bash
npm install -g browserbash-cli

browserbash run "Open https://staging.example.org/donate, choose a one-time gift of \$25, \
fill in the card number 4242 4242 4242 4242 with any future expiry and CVC, \
complete the donation, and confirm a thank-you message with a receipt reference appears" \
  --agent --headless --timeout 180
```

The `4242` card is Stripe's canonical test card, which is why you run this against a sandbox or test-mode key, never production. The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or a coding agent reads structured events instead of scraping console prose. Exit codes are frozen: `0` passed, `1` failed, `2` error or infra, `3` timeout.

By default BrowserBash is Ollama-first. It defaults to free local models with no API keys, and nothing leaves your machine. It auto-resolves in this order: a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For a multi-step donation flow with an embedded payment iframe, one honest caveat matters: very small local models (roughly 8B parameters and under) get flaky on long objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. The [tutorials](https://browserbash.com/tutorials) walk through picking a model for exactly this kind of multi-step task.

### What "by intent" buys you on a payment iframe

When the agent reaches the Stripe or Braintree iframe, it reads the rendered page the way a person would and types into the field that is clearly the card number. You did not tell it the frame name, the input id, or the shadow-DOM boundary. That is the entire point. Six months from now when the processor restructures its iframe, your objective text is untouched and your test still passes, assuming the flow still works for a real donor. If the flow genuinely broke, you get a fail with the actual page state captured, which is what you wanted.

## Turning the flow into a committable, deterministic test

Ad hoc `run` commands are great for exploration. For CI you want a committable test file with real assertions. BrowserBash uses plain Markdown test files (`*_test.md`) with `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, which matters when your test references API keys or a test-mode publishable key.

The important upgrade for donation testing is testmd v2 plus deterministic `Verify` steps. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session. Two step types never touch a model at all: API steps for seeding data, and `Verify` steps for checking the result through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page. Here is a one-time donation test that seeds a campaign over the API, then validates the gift through the browser:

```bash
# donate_onetime_test.md
```

```markdown
---
version: 2
---

# One-time $25 donation completes and shows a receipt

POST https://staging.example.org/api/campaigns with body {"name": "Spring Fund", "goal": 5000}
Expect status 201, store $.id as 'campaignId'

Open https://staging.example.org/donate?campaign={{campaignId}}
Choose a one-time gift of $25
Fill the card number 4242 4242 4242 4242 with a future expiry and any CVC
Enter donor@example.org as the email and submit the donation

Verify URL contains "/thank-you"
Verify text "Your gift of $25" is visible
Verify "Download receipt" link is visible
```

Every `Verify` line here compiles to a real Playwright check: URL contains, text visible, and a named link visible. There is no LLM judgment in those assertions. A pass means the condition actually held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md` assertion table. That is the difference between an AI that "thinks it looks fine" and a test that proves the receipt link rendered. If you write a Verify line outside the supported grammar, it still runs, agent-judged, and gets flagged `judged: true` so you can always tell deterministic from judged.

One honest limitation to plan around: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. If you are committed to fully local execution, keep the plain `run` and v1 test files for now, and use v2 where you already have Anthropic access.

Run the committed test with:

```bash
browserbash testmd run ./.browserbash/tests/donate_onetime_test.md --agent
```

## Recurring gifts: the flow that quietly matters most

One-time gifts are the demo. Recurring gifts are the revenue. A monthly-giving program is the difference between a nonprofit that fundraises every quarter and one that has a predictable base, so the recurring-setup flow deserves its own dedicated test and its own paranoia.

Recurring flows have a specific failure mode: state that resets. A donor picks "monthly," triggers a validation error on the email field, fixes it, submits, and the pledge silently reverts to one-time because the toggle lost its state on re-render. No error, no log line, just a monthly donor who becomes a one-time donor. Testing this by intent, where you deliberately trigger the error path, is exactly the kind of human journey that selector scripts rarely bother to encode.

A recurring-gift test in plain English reads almost like a QA checklist:

```markdown
---
version: 2
---

# Monthly recurring gift survives a validation error

Open https://staging.example.org/donate
Choose to give monthly
Set the amount to $15 per month
Submit without an email so the form shows a validation error
Now enter monthly-donor@example.org and complete the donation with card 4242 4242 4242 4242

Verify text "monthly" is visible
Verify text "$15" is visible
Verify URL contains "/thank-you"
```

That "submit without an email, then fix it" step is the whole test. It reproduces the exact re-render that eats the recurring selection. Because you assert on the confirmation ("monthly" and "$15" both visible after success), you catch a state reset that a happy-path script would sail right past. The [learn hub](https://browserbash.com/learn) has more patterns for testing error-and-recovery journeys like this one.

### Designations, cover-the-fee, and match lookups

Real donation forms carry more than an amount. There is the gift designation dropdown ("Where should your gift go?"), the "cover the processing fee" checkbox that changes the charged total, and sometimes an employer-match lookup. Each is a separate small assertion. You can compose these into one test file with `@import`, sharing a common "open the donation page and fill donor details" preamble across your one-time, recurring, and fee-covered variants, so you write the donor identity once.

## Wiring donation tests into CI, monitors, and budgets

A donation test that only runs when you remember to run it is barely better than no test. The point is to catch regressions automatically, from three angles: on every deploy, on a schedule against production, and without blowing a tiny budget.

### On every pull request

Run your whole donation suite in parallel and gate the merge on it. The memory-aware orchestrator derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. On CI you can also shard deterministically across machines:

```bash
browserbash run-all ./.browserbash/tests --junit out/junit.xml --shard 2/4 --budget-usd 2.00
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel CI machines agree on who runs what with zero coordination. The `--budget-usd 2.00` cap is the nonprofit-friendly part: once the suite crosses the budget, remaining tests are reported `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. You never wake up to a surprise model bill from a runaway CI loop. There is also a bundled per-model price table so `cost_usd` shows up in `run_end`, and unknown models get no estimate rather than a wrong one. The official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wraps all of this and posts a self-updating PR comment with the verdict table.

### As an always-on production monitor

Deploy-time tests catch your regressions. They do not catch your payment processor's outage, your DNS expiring, or a CDN edge serving a stale bundle. For that you want synthetic monitoring against production, using a read-only "does the form load and reach the payment step" objective (never actually charging a card in production):

```bash
browserbash monitor "Open https://example.org/donate and confirm the amount buttons \
and the card payment field are visible and interactive" \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode runs on an interval and alerts only on pass-to-fail and fail-to-pass state changes, in both directions, never on every green run. So you get one Slack message when the form breaks and one when it recovers, not a wall of noise every ten minutes. Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload. And because the replay cache records a green run's actions and replays them with zero model calls until the page actually changes, an always-on monitor is nearly token-free. That last part is what makes a 10-minute cadence affordable on a nonprofit budget.

## Letting your AI agents validate their own donation-page work

Increasingly the code touching your donation page is written by an AI coding agent. If the agent can also validate its work through a real browser, the loop closes. BrowserBash ships an MCP server: `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, and it is one line to install into any MCP host.

```bash
claude mcp add browserbash -- browserbash mcp
```

The same idea works for Cursor, Windsurf, Codex, and Zed. Once installed, the agent gets three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder run in parallel. Each returns the structured verdict JSON: status, summary, final_state, assertions, cost_usd, and duration_ms. A crucial framing here is that a failed test is a successful validation. The tool call succeeds, and the agent reads the verdict to decide what to fix. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so discovery is a non-issue.

Concretely: you ask your agent to "add a cover-the-fee checkbox to the donation form." It writes the code, then calls `run_objective` with "check the cover-the-fee box and verify the total increases by the fee amount," reads the fail, sees the total did not update, fixes the calculation, and re-runs until the verdict is pass. You reviewed English and a verdict, not a diff full of brittle selectors.

## Getting logged-in and gated donor journeys under test

Plenty of giving journeys sit behind a login: a donor portal where supporters manage recurring gifts, update a card, or download tax receipts. Re-logging in on every test is slow and annoying. BrowserBash handles this with saved sessions.

```bash
browserbash auth save donor-portal --url https://example.org/account/login
```

That opens a browser, you log in once as a test donor, press Enter, and the session (a Playwright storageState) is saved. Reuse it with `--auth donor-portal` on `run`, `testmd`, `run-all`, or `monitor`, or via `auth:` frontmatter in a test file. If a saved profile's origins do not cover your target start URL, you get a warning instead of a test that silently does nothing. Now a test like "log in to the donor portal, cancel the monthly recurring gift, and confirm it shows as cancelled" runs without you scripting the login every single time.

## Migrating an existing suite and recording new tests

If you already have Playwright specs covering your donation flow, you do not start over. `browserbash import` converts Playwright specs to plain-English `*_test.md` files heuristically, with no model in the loop, so it is deterministic and reproducible. It handles goto, click, fill, press, check, selectOption, getBy* locators, and common expects. `process.env.X` becomes a `{{X}}` variable. Anything it cannot translate cleanly lands in `IMPORT-REPORT.md` rather than being silently dropped or invented, so you always know exactly what needs a human eye.

For brand-new coverage, the recorder is faster than typing. Run `browserbash record https://staging.example.org/donate`, click through the full giving flow once, press Ctrl-C, and it writes a plain-English test. Password fields never leave the page: the capture script sends only a secret marker, and the generated step reads `Type {{password}} into ...`, so you never accidentally commit a credential. Between import and record, standing up a donation suite is a morning, not a sprint.

## A balanced view: where BrowserBash fits and where it does not

Credibility matters more than hype, so here is the honest boundary.

| Concern | Selector-based Playwright/Cypress | AI testing donation flows with BrowserBash |
| --- | --- | --- |
| Third-party payment iframes | Brittle, breaks on vendor redesigns | Resilient, targets intent not markup |
| Deterministic assertions | Native, exact | `Verify` steps compile to real Playwright checks; other lines are agent-judged and flagged |
| Millisecond-precise UI timing | Excellent | Not the tool for micro-timing assertions |
| Pixel-diff visual regression | Dedicated tools do this better | Out of scope, use a visual-diff tool |
| Cost and setup | Free, but heavy to maintain | Free and open-source, lower maintenance, model cost governed by budgets |
| Fully offline execution | Yes | Yes for plain runs (Ollama), but testmd v2 needs the builtin engine (Anthropic) |

BrowserBash is the right tool when your donation flow spans vendor iframes you do not control, when you want tests that survive redesigns, and when you want AI agents to validate their own changes. It is not the right tool for pixel-level visual regression or sub-second timing assertions; reach for a dedicated visual-diff or performance tool there. And if you need testmd v2's deterministic per-step API seeding, budget for the builtin engine's Anthropic requirement rather than expecting it on local models today. Being clear about that is more useful to you than pretending it does everything. You can weigh the tradeoffs further on the [pricing page](https://browserbash.com/pricing), where the guardrail is simple: anything that runs on your machine (the CLI, engines, local dashboard, cache, MCP) stays free forever.

## FAQ

### Is it safe to run AI testing on donation flows with real payment details?

No, and you should never point these tests at a live payment key. Always run against a payment sandbox or test-mode configuration using the processor's official test cards, such as Stripe's `4242 4242 4242 4242`. For production monitoring, use read-only objectives that confirm the form loads and reaches the payment step without ever submitting a charge. Keep any keys as secret-marked variables so they are masked in every log line.

### How does BrowserBash handle recurring or monthly gift setup?

You describe the recurring intent in plain English, such as "choose to give monthly and set the amount to $15 per month," and the AI agent finds and operates whatever control the form uses, whether that is a toggle, radio, or dropdown. Then you add deterministic Verify steps that confirm the confirmation page reflects a monthly pledge. Because you assert on the outcome rather than the widget, a redesign of the recurring control does not break your test, and a state reset that quietly downgrades a monthly gift to one-time gets caught.

### Do I need an API key or a paid model to test donation forms?

Not for basic runs. BrowserBash is Ollama-first, so it defaults to free local models with no API keys and nothing leaves your machine. Very small local models under about 8B parameters can be flaky on long multi-step flows, so a mid-size model in the 70B class or a hosted model is the sweet spot for a full donation journey. Note that testmd v2, with its per-step API seeding, currently requires the builtin engine and an Anthropic key or compatible gateway.

### Can my AI coding agent test the donation page it just built?

Yes, that is a core use case. Install the MCP server with a single command like `claude mcp add browserbash -- browserbash mcp`, and your agent in Claude Code, Cursor, Windsurf, Codex, or Zed gets tools to run an objective, a test file, or a whole suite. Each call returns a structured verdict with status, assertions, cost, and duration, so a failed test is a successful validation the agent reads and acts on. The agent writes the code, validates it through a real browser, reads the fail, and iterates until the verdict is pass.

Donation pages are where a silent regression turns straight into lost gifts, so they are exactly the surface worth automating with intent-based tests. Install with `npm install -g browserbash-cli`, point your first objective at a staging donation form and a test card, and let the agent tell you whether a real supporter could actually give. An account is optional and everything local is free forever, but if you want hosted retention and monitors you can [sign up here](https://browserbash.com/sign-up).
