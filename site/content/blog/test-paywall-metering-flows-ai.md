---
title: Test Paywalls and Metered Content With Plain-English AI
description: "Test paywall automation with plain-English AI that drives a real browser through metered counters, subscribe gates, and login walls for a real verdict."
date: 2026-07-06
category: guide
---

Paywalls are some of the most brittle flows a QA team owns, and they are exactly the flows nobody wants to touch. Test paywall automation usually means a pile of selectors pointed at a counter that increments on every article view, a subscribe modal that fires on the fourth or fifth read, and a login wall that swaps the whole page out. Change the counter copy, move the modal trigger, or A/B test the gate, and your suite goes red for reasons that have nothing to do with a real bug. This guide shows how to verify metered-article counters and subscribe gates by intent instead of by locator, using a plain-English AI agent that drives a real Chrome browser and returns a deterministic verdict.

The idea is simple. You describe what a reader should experience ("read three articles, hit the gate on the fourth, subscribe, then read freely"), and an AI agent performs those steps against a live browser the same way a person would. You stop maintaining fragile CSS paths and start asserting the business rule the paywall actually enforces. Along the way you get structured results, a pass or fail exit code, and evidence you can drop into CI.

## Why paywall and metering flows break traditional tests

Metered content is stateful by design. The publisher counts how many free articles you have consumed, usually in a cookie, local storage, or a server-side session tied to your IP or account. The whole point of the flow is that the fifth request behaves differently from the first. That statefulness is what makes it painful to automate.

A conventional Playwright or Selenium suite hard-codes three fragile assumptions. First, it assumes the counter lives at a known selector and increments in a known way. Second, it assumes the subscribe gate appears in a specific DOM node with a specific class. Third, it assumes the reset button, the "you have 2 free articles left" banner, and the metered-paywall interstitial all keep their markup stable. Publishers break every one of these constantly, because paywall conversion is a revenue lever and growth teams run experiments on it weekly.

The result is a test that fails when the marketing team changes "2 articles remaining" to "2 free reads left this month." Nothing about the actual metering logic changed. Your locator did. Multiply that across a dozen gate variants and two dozen publications on the same CMS, and paywall coverage becomes the first thing teams quietly delete.

### The metering counter problem in detail

Consider a typical soft paywall. A reader gets five free articles per calendar month. On article one through four, a small banner reads "X articles remaining." On article five, an interstitial slides up asking for an email. On article six, a hard subscribe wall replaces the content entirely. Reset the counter (clear cookies, new month, new device) and the cycle restarts.

To test this by selector you would need to assert the banner text at each step, catch the interstitial at exactly the right view count, confirm the hard wall replaces the article body, and then verify that a logged-in subscriber skips the whole gate. Every one of those checkpoints is a place where a copy change or a layout tweak snaps the test. You are testing markup, not the metering rule.

## Testing paywalls by intent instead of by selector

BrowserBash flips the model. It is a free, open-source natural-language browser automation CLI from The Testing Academy that positions itself as the validation layer for AI agents. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors and no page objects, and you get back a deterministic verdict plus structured results.

For a paywall, that means you describe the reader's journey and let the agent figure out how to execute it against whatever the page currently looks like. If the "articles remaining" banner moved or got reworded, the agent still reads it, because it perceives the page the way a human does rather than through a brittle path. You are asserting the intent (the gate should appear after the free quota is used) rather than the implementation (the gate lives at `div.paywall-modal--v3`).

Here is the smallest possible version. Install the CLI and run a single objective against a metered site:

```bash
npm install -g browserbash-cli

browserbash run "Open the news site, open and read four different articles in a row, and confirm a subscribe or sign-in gate appears before the fifth article loads" --agent --headless --timeout 180
```

The `--agent` flag emits NDJSON, one JSON event per line on stdout, so CI can read the outcome without parsing prose. Exit codes are frozen and predictable: 0 passed, 1 failed, 2 error or infra or budget stop, 3 timeout. A red exit code here means the gate did not fire when it should have, which is a real metering bug, not a broken selector.

To learn how the engine perceives and acts on a page, the [BrowserBash learn hub](https://browserbash.com/learn) walks through the agent loop and how objectives map to browser actions.

## Building a committable metered-content test

One-off `run` commands are great for exploration, but paywall coverage belongs in version control next to your app. BrowserBash uses committable Markdown test files (`*_test.md`) with `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as five asterisks in every log line, which matters when your subscriber login carries a password.

A plain metered-article test reads like a checklist a product manager could review:

```bash
browserbash testmd run ./.browserbash/tests/metered_paywall_test.md --agent
```

And the file itself:

```
# Metered paywall gate fires after free quota

- Open https://news.example.com
- Open the first headline and read the full article
- Go back and open a second, different article
- Go back and open a third, different article
- Go back and open a fourth, different article
- Try to open a fifth article
- Verify text "Subscribe" visible
- Verify "Subscribe" button visible
```

Notice the last two lines. Those are deterministic Verify assertions, and they do not use LLM judgment. In BrowserBash, a `Verify` step compiles to a real Playwright check: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, or a stored value equals some expected value. A pass means the condition genuinely held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md` written after each run.

That split is the whole trick for reliable paywall testing. The messy, variable navigation ("read four different articles") is handled by the agent, which tolerates layout drift. The business-critical checkpoint ("the gate is present") is a hard, model-free assertion with evidence. You get flexibility where you need it and determinism where it counts.

### When Verify falls outside the grammar

Sometimes you want to assert something the deterministic grammar does not cover, like "the article body is now blurred and truncated." You can still write it as a Verify line. BrowserBash runs it, but agent-judged, and flags it `judged: true` in the results so you can tell a real deterministic pass from a model opinion. That honesty is deliberate. You always know whether a green checkmark came from Playwright or from the model's read of the page.

## Seeding subscriber state with testmd v2 and API steps

Reading four articles to burn a quota works, but it is slow and it depends on the counter starting at zero. For paywalls tied to an account, you often want to set up state directly and then check it through the UI. That is what testmd v2 is for.

Add `version: 2` to the frontmatter of a test file and steps execute one at a time against a single browser session. Two deterministic step types never touch a model. API steps let you seed data with real HTTP requests (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, optionally with a body, followed by `Expect status N` and an optional `store $.path as 'name'`). Verify steps then check the result through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

A subscriber-gate test that provisions an account through your API, then confirms the paid experience in the browser, looks like this:

```
---
version: 2
---

# Subscriber skips the metered gate

- POST https://api.example.com/test/users with body {"plan": "premium"}
- Expect status 201, store $.data.email as 'email'
- POST https://api.example.com/test/users/login with body {"email": "{{email}}"}
- Expect status 200, store $.token as 'token'
- Open https://news.example.com and sign in with token {{token}}
- Open six different articles in a row
- Verify text "Subscribe" not visible
```

The API steps run deterministically with no model calls, so seeding is fast and reproducible. Then the agent takes over for the fuzzy part (signing in and reading articles), and a final Verify confirms the premium reader never sees the gate. This hybrid pattern (API to set up, UI to check) is exactly how you test metering rules without hammering the real counter one article view at a time.

One honest limitation to plan around: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. For pure exploratory `run` objectives you can stay fully local and free, but the v2 API-plus-Verify pattern wants the builtin path today. The [features overview](https://browserbash.com/features) tracks which capabilities run on which engine.

## Handling the login wall: saved sessions

Hard paywalls almost always sit behind authentication, and logging in on every single test run is a tax nobody enjoys. BrowserBash handles this with saved logins. You run `browserbash auth save <name> --url <login-url>`, a browser opens, you log in once by hand, and pressing Enter saves the session as a Playwright storageState.

```bash
browserbash auth save subscriber --url https://news.example.com/login

browserbash testmd run ./.browserbash/tests/subscriber_paywall_test.md --auth subscriber --agent
```

After that, `--auth subscriber` reuses the saved session on `run`, `testmd`, `run-all`, and `monitor`, or you can point to it with `auth:` frontmatter inside a test file. If the saved profile's origins do not cover your target start URL, BrowserBash prints a warning instead of silently doing nothing, so you catch a stale or wrong session before it produces a confusing failure.

This matters for metering specifically because you frequently need two identities in one suite: an anonymous reader who should hit the gate, and a paid subscriber who should not. Save both once, reference each by name, and your suite stops carrying login boilerplate.

## Comparing approaches to paywall testing

No single tool is right for every layer. Here is an honest look at where each approach fits when you are testing paywall and metering flows.

| Approach | Handles copy and layout drift | Deterministic checkpoints | Setup cost | Best fit |
| --- | --- | --- | --- | --- |
| Hand-written Playwright/Selenium | Low, breaks on selector or copy change | High, you control every assertion | High, page objects per gate variant | Stable internal apps with rare UI change |
| Record-and-playback tools | Low to medium, replays fixed steps | Medium, depends on the tool | Low to record, high to maintain | Quick smoke checks, short-lived flows |
| Plain-English AI agent (BrowserBash) | High, agent adapts to the live page | High for Verify steps, judged for the rest | Low, write the reader's journey in English | Paywalls, A/B-tested gates, metering rules |
| Pure API testing | Not applicable, no UI at all | High | Medium | The counting logic itself, below the UI |

The nuance worth stating plainly: if the metering rule is purely server-side and you only care whether the count increments correctly, a straight API test is faster and cheaper than any browser at all. Use BrowserBash when the gate's behavior in the actual rendered page is what you need to verify, or when the flow spans both API state and UI experience. And if you already own a large, stable Playwright suite for an internal tool that never changes its markup, there is no reason to rewrite it. The strongest case for intent-based testing is exactly the volatile, experiment-heavy paywall surface where selectors rot fastest.

BrowserBash can also meet a Playwright suite halfway. `browserbash import <specs-or-dir>` converts existing Playwright specs into plain-English `*_test.md` files heuristically, with no model and fully reproducibly. It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common expects, turns `process.env.X` into `{{X}}` variables, and drops anything untranslatable into an `IMPORT-REPORT.md` rather than silently inventing a step. That gives you a migration path off brittle selectors for the specific gates that keep breaking, without a big-bang rewrite.

## Watching a live paywall for regressions

Testing a paywall once in CI proves it worked at merge time. Metering flows also fail in production for reasons your pipeline never sees: a marketing experiment ships a broken gate, a CDN caches the anonymous version for subscribers, or a counter reset job misfires at the start of a month. For that, BrowserBash has a monitor mode.

```bash
browserbash monitor ./.browserbash/tests/metered_paywall_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor runs your test on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run. Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload. The replay cache keeps this cheap: a green run records its actions, and the next identical run replays them with zero model calls, so an always-on paywall monitor is nearly token-free until the page actually changes and the agent has to step back in.

Concretely, that means you can watch "the subscribe gate fires after four free articles" every ten minutes across production and get a Slack ping the moment an experiment breaks conversion, then a second ping when it recovers. You are alerted on state transitions, not spammed on steady state. The [tutorials](https://browserbash.com/tutorials) cover monitor setup and webhook formatting in more depth.

## Running the full gate matrix in CI

Real publishers do not have one paywall. They have a soft gate, a hard gate, a metered interstitial, a registration wall, and often several A/B variants of each, sometimes across many titles on shared infrastructure. You want to run all of those in parallel without a runaway bill.

BrowserBash's `run-all` is a memory-aware parallel orchestrator. It derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. For CI fleets it supports deterministic sharding and a hard cost budget:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00 --junit out/junit.xml --agent
```

`--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four parallel CI machines agree on the split without coordinating. `--budget-usd 2.00` stops launching new tests once the suite crosses the budget: remaining tests are reported as skipped, the suite exits 2, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. Cost visibility comes from a `cost_usd` estimate in `run_end`, drawn from a bundled per-model price table (unknown models get no estimate rather than a wrong one).

If you want to check the gates across screen sizes too, add `--matrix-viewport 1280x720,390x844` to run every test once per viewport, labeled in events, JUnit, and results. Mobile paywalls frequently differ from desktop ones, and a metered interstitial that works at 1280 wide can be unreachable behind a broken close button at 390. There is also a self-updating GitHub Action that installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports the shard matrix and budget flags, and posts a verdict-table PR comment. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) have the full workflow.

### A note on model choice for long paywall journeys

One honest caveat if you run fully local. Very small local models (around 8B parameters and under) can get flaky on long multi-step objectives, and "read four different articles, then check the gate" is a genuinely long journey. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows. BrowserBash is Ollama-first and defaults to free local models with no API keys, but for the gnarliest metering journeys, reach for a bigger model and let the replay cache keep the ongoing cost near zero.

## Wiring it into an AI coding agent

If you build with an AI coding agent, BrowserBash ships an MCP server so the agent can validate its own paywall changes. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, and a one-line install drops it into any MCP host:

```bash
claude mcp add browserbash -- browserbash mcp
```

It exposes `run_objective`, `run_test_file`, and `run_suite`, and each returns the structured verdict JSON: status, summary, final_state, assertions, cost_usd, and duration_ms. A failed test is a successful validation. The tool call itself succeeds, and the agent reads the verdict and decides what to do. So when your agent tweaks the metering counter logic, it can immediately run the paywall suite, see that the gate now fires on the fourth article instead of the fifth, and fix its own regression before you ever open a pull request. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

## FAQ

### How do you test a metered paywall without hard-coded selectors?

You describe the reader's journey in plain English and let an AI agent drive a real browser through it, then assert the outcome with deterministic Verify steps. The agent reads the "articles remaining" banner and the subscribe gate the way a person would, so it tolerates copy changes and layout drift that would break a CSS selector. You are testing the metering rule (the gate appears after the free quota) rather than the markup that implements it.

### Can I set up subscriber state through an API before checking the UI?

Yes. With testmd v2 (add `version: 2` to the file frontmatter), you can run deterministic API steps that seed a premium account and store the returned token, then hand off to the agent to sign in and read articles, and finish with a Verify step confirming the gate never appears. The API steps run with no model calls, so setup is fast and reproducible. Note that testmd v2 currently runs on the builtin engine, which needs an Anthropic API key or a compatible gateway.

### How do I avoid logging in on every paywall test run?

Use saved logins. Run the auth save command once, log in by hand in the browser it opens, and BrowserBash stores the session as a Playwright storageState. After that you pass the profile name with the auth flag on run, testmd, run-all, or monitor, and the session is reused automatically. This is especially useful for paywalls where you need both an anonymous reader who hits the gate and a subscriber who does not.

### How can I catch a broken paywall in production, not just in CI?

Run your paywall test in monitor mode on an interval, pointed at a Slack or webhook URL. Monitor alerts only on pass-to-fail or fail-to-pass state changes, so you get a ping the moment an A/B experiment breaks the gate and another when it recovers, without noise on every healthy run. The replay cache keeps an always-on monitor nearly token-free because a green run replays its recorded actions until the page actually changes.

Ready to stop maintaining brittle paywall selectors? Install with `npm install -g browserbash-cli` and write your first metered-content test in plain English against a real browser. An account is optional, but you can grab one and explore the free cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
