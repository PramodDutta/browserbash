---
title: Test a Magic-Link Login End to End With AI
description: "Learn how to test magic link login end to end with AI: request the link, retrieve it from a real inbox, and verify the session lands."
date: 2026-05-25
category: security
---

Magic-link authentication looks simple from the outside and is a nightmare to automate. When you want to test magic link login the honest way, you have to reproduce a flow that leaves your app entirely: the user types an email, your backend mints a signed token, an email provider delivers it, and the user clicks a URL that may open in a different tab, a different browser, or a webmail client. Traditional Selenium and Playwright scripts break on the boundary between "I submitted the form" and "the link arrived in a mailbox I do not control." This guide walks through testing a magic-link login end to end with an AI agent that drives a real Chrome browser, plus the honest story about email retrieval that most tutorials skip.

The tool used throughout is [BrowserBash](https://browserbash.com/features), a free and open-source natural-language browser automation CLI. You write a plain-English objective, an AI agent drives a real browser step by step with no selectors, and you get a deterministic verdict back. It fits magic-link testing well because the fragile part of the flow (which button to click, where the input moved to this sprint) is exactly what an agent absorbs, and the deterministic part (did the URL change, is the dashboard heading visible) is exactly what you want asserted without model guesswork.

## Why magic-link login is hard to test

A password login is one page, one form, one submit. A magic-link login is a distributed system pretending to be a form. Break it into stages and the difficulty becomes obvious.

Stage one is the request. The user lands on a login screen, enters an email, and clicks something like "Send me a link" or "Continue with email." Your app shows a confirmation screen: "Check your inbox." That part is normal UI and any automation tool can handle it.

Stage two is delivery. Your backend generates a single-use token, signs it, stores an expiry, and hands the email to a provider like Postmark, SendGrid, SES, or Resend. Delivery is asynchronous, so the email might land in 200 milliseconds or 20 seconds, and your test has no DOM event to wait on because the thing you are waiting for is happening on a mail server, not in the browser.

Stage three is retrieval. The link lives inside an HTML email. To continue, your test must open that mailbox, find the most recent message, extract the correct URL (not the unsubscribe link, not a tracking pixel), and navigate to it. This is where most homegrown scripts collapse. People hardcode a Gmail scrape that breaks the moment Google changes markup, or they poll an inbox with brittle regex.

Stage four is the session. Clicking the link consumes the token and should drop the user into an authenticated state. Your assertion has to confirm the session actually took hold: the URL is now `/dashboard`, a "Log out" control exists, the user's name renders. Because tokens are single-use, a re-run has to request a fresh link, which means your test cannot cache a URL and replay it forever. Every stage has a different failure mode, and a good end-to-end test covers the seams between them, not just the happy click path.

## The end-to-end flow you actually want to cover

Before writing a line, decide what "done" means. A complete magic-link test proves five things in order:

1. The login form accepts an email and shows a confirmation state.
2. An email is generated and reaches an inbox you can read programmatically.
3. The link inside that email is extractable and points at your app.
4. Navigating the link establishes an authenticated session.
5. The token is single-use, so a second click of the same link is rejected.

Most teams test stage one and stage four and call it a day, which means the two stages most likely to break in production (delivery and retrieval) never get exercised. A real end-to-end magic-link test covers the whole chain, including the email hop that unit tests physically cannot reach.

Be deliberate about which inbox you use. Never point automation at a real personal Gmail or a shared team mailbox. Use a dedicated test inbox from a service built for it: Mailosaur, Mailtrap, MailSlurp, or a catch-all domain you own. These give you an API to fetch messages by recipient, which turns the flaky "scrape webmail" step into a clean HTTP call.

## Testing the request UI with a plain-English objective

Start with the part that lives entirely in the browser. You can validate the request half of the flow in a single objective without touching email at all, which is useful as a fast smoke check that runs on every commit.

```bash
npm install -g browserbash-cli

browserbash run "Open https://app.example.com/login, type qa+magic@test.example.com into the email field, click the button that sends a magic link, and confirm the page shows a 'check your inbox' message" --agent --headless --timeout 90
```

The `--agent` flag makes BrowserBash emit NDJSON, one JSON event per line, so a CI job or an AI coding agent can read the verdict without parsing prose. Exit codes are frozen and predictable: 0 passed, 1 failed, 2 error or infrastructure problem, 3 timeout. The agent figures out which button actually sends the link even if the label changed from "Send link" to "Email me a sign-in link" between releases, which is the whole point of describing intent instead of encoding a selector.

This smoke check answers one question cheaply: is the request path alive? If the confirmation screen never renders, there is no point waiting on an inbox. Run this on every pull request and save the full end-to-end version for a slower lane.

If you want to run the model locally with no API keys and nothing leaving your machine, BrowserBash defaults to Ollama first. A mid-size local model in the Qwen3 or Llama 3.3 70B class handles a two or three step login flow comfortably. Be honest with yourself about model size, though: very small local models around 8B and under get flaky on longer multi-step objectives, so keep the tiny models for the shortest flows and reach for a 70B-class local model or a capable hosted model when the flow gets long.

## The honest email-retrieval story

Here is the part most magic-link tutorials gloss over, and where honesty matters more than a slick demo. Retrieving the link from an email is genuinely the hard middle of this flow, and you have a few real options, each with tradeoffs.

### Option 1: an email-testing inbox API (recommended today)

The cleanest approach available right now is to use a testing inbox that exposes an HTTP API, then fetch the message as a deterministic step. BrowserBash's testmd v2 format gives you deterministic API steps that never touch a model, which is exactly what you want for the "go get the email" hop. You seed and read data over HTTP, then verify the result through the UI. This keeps the flaky network part out of the agent's hands and reserves the AI for the browser driving.

A testmd v2 file uses `version: 2` frontmatter, and steps then execute one at a time against a single browser session. API steps use plain HTTP verbs and can store values from the JSON response into variables, which you then reference in later steps.

```
---
version: 2
---
# Magic-link login end to end

- Open https://app.example.com/login and type qa+magic@test.example.com into the email field
- Click the button that sends a magic link
- Verify text "Check your inbox" is visible

GET https://api.mailtesting.example.com/inboxes/qa/latest
Expect status 200, store $.magicLinkUrl as 'link'

- Open {{link}}
- Verify URL contains "/dashboard"
- Verify "Log out" button is visible
```

The API step hits your testing inbox, pulls the newest message for that recipient, and stores the extracted link URL into `{{link}}`. The plain-English steps around it drive the browser, and the `Verify` steps compile to real Playwright checks (URL contains, text visible, named button visible) with no LLM judgment involved. A pass means the condition literally held, and a fail arrives with expected-versus-actual evidence in the results, so you are never guessing whether the agent was being generous.

One honest caveat: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. If you are committed to a fully local, zero-key setup, keep the request-side smoke check on a local model and run the full v2 end-to-end flow against the builtin engine.

### Option 2: extract the link inside your own API layer

If your backend has a test-only endpoint that returns the last token minted for an address (many teams add one behind a feature flag for exactly this reason), point the API step at that instead of an inbox. This skips real email delivery, which makes the test faster and more reliable, at the cost of not exercising the actual mail provider. It is a reasonable tradeoff for a pull-request lane, paired with a slower nightly run against a real inbox to catch delivery regressions.

### Option 3: native IMAP mailbox variables (on the roadmap, not shipped)

The most ergonomic version of this flow would be first-class IMAP mailbox variables, where you write `{{mail.link}}` or `{{mail.otp}}` and BrowserBash connects to a mailbox, waits for the message, and extracts the token for you, plus an `--interactive` mode that pauses for a human when a step genuinely needs a person. That capability is on the BrowserBash roadmap and is not shipped in 1.5.1. I am flagging it plainly rather than showing you a command that does not exist yet. Until it lands, the testing-inbox API pattern above is the honest, working way to do email retrieval today. Watch the [BrowserBash blog](https://browserbash.com/blog) and the [GitHub repository](https://github.com/PramodDutta/browserbash) for when the native mailbox variables ship.

## Verifying the session actually took hold

Requesting a link and even clicking it are not the same as being logged in. A token can be expired, already consumed, or scoped to the wrong environment, and any of those can leave you on an error page that superficially looks fine. This is where deterministic assertions earn their keep.

The `Verify` grammar in a testmd file compiles to actual Playwright expectations rather than asking a model "does this look logged in?" The checks you get for free include URL contains a path, title is or contains a string, specific text is visible, a named button or link or heading is visible, element counts, and a stored value equalling an expected value. For a magic-link session check, the strongest signals are usually a URL change to an authenticated route, the presence of a "Log out" control, and the user's display name rendering somewhere on the page.

Layer them so a partial failure is legible:

```
- Open {{link}}
- Verify URL contains "/dashboard"
- Verify "Log out" button is visible
- Verify text "qa+magic@test.example.com" is visible
```

If the URL check passes but the "Log out" button is missing, you learn the redirect happened but the session cookie did not set, which is a very different bug from the link being dead. Each `Verify` line reports its own expected-versus-actual, so the Result.md written after the run reads like a checklist a human can scan, not a single opaque pass or fail. Any `Verify` line that falls outside the deterministic grammar still runs, agent-judged, and gets flagged as judged so you can tell the difference between a machine-checked assertion and an AI opinion.

## Covering token single-use and expiry

A magic link is only as safe as its refusal to be reused. If a leaked link works twice, that is a security bug, and a security-conscious test should prove single-use behavior, not assume it.

The pattern is straightforward once you have the link in a variable: click it once, verify you are logged in, then open it a second time and verify the app rejects it. The second navigation should land on an error or an expired-link state, never a fresh session.

```
- Open {{link}}
- Verify URL contains "/dashboard"
- Log out of the application
- Open {{link}} again
- Verify text "link has expired" is visible
```

Expiry is the sibling test. If your links are valid for 15 minutes, you cannot practically wait that long in CI, but you can test the boundary by minting a token with a short TTL in a test environment, or by having your test-only API return an already-expired token on demand. The point is to prove the guard exists, not to burn pipeline time waiting on the clock.

## Wiring the test into CI without burning tokens

Magic-link tests are expensive if you run them naively, because every real run mints a token, sends an email, and consumes model calls for the browser driving. Three BrowserBash features keep that cost sane.

First, the replay cache. A green run records its actions, and the next identical run replays them with zero model calls, with the agent stepping back in only when the page actually changed. For a stable login flow, your happy-path magic-link test then costs almost nothing to re-run, and the model only wakes up when the UI drifted, which is precisely when you want it awake.

Second, cost governance. The `run_end` event carries a `cost_usd` estimate from a bundled per-model price table, and a suite can enforce a hard ceiling.

```bash
browserbash run-all .browserbash/tests --agent --budget-usd 2.00 --junit out/junit.xml
```

Once the suite crosses the budget, no new tests launch, the remaining ones are reported as skipped, and the suite exits 2. Spend lands in the results file and in the JUnit properties, so a runaway auth suite cannot quietly drain an API budget overnight.

Third, sharding. If you have grown a security suite covering magic-link, OAuth, password reset, and session expiry, split it across CI machines with a deterministic slice computed on sorted discovery order, so parallel runners agree without coordinating.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

For the pull-request path specifically, the official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) installs the CLI, runs the suite, uploads JUnit, NDJSON, and Result.md artifacts, and posts a self-updating PR comment with the verdict table. Reviewers see the magic-link result inline on the PR instead of digging through logs.

## Monitoring magic-link login in production

Login is the one flow where a silent break costs you every new signup, so magic-link auth is a strong candidate for continuous synthetic monitoring, not just pre-merge testing. If the email provider quietly starts landing links in spam or your token endpoint regresses, you want to know in minutes, not from a support ticket.

```bash
browserbash monitor ./.browserbash/tests/magic-link_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode runs on an interval and alerts only on pass-to-fail and fail-to-pass state changes, in both directions, never on every green run, so your channel does not turn into noise. Slack incoming-webhook URLs get Slack formatting automatically, and other URLs receive the raw JSON payload. Because the replay cache makes an always-on monitor nearly token-free, a magic-link check every ten minutes is cheap enough to leave on permanently. When it flips to failing you get one alert, and when a deploy fixes it you get the recovery alert too.

Pair this with saved logins for flows that need a pre-authenticated state. Run `browserbash auth save` once, log in through the real flow, and reuse the stored session with `--auth <name>` so downstream tests do not each re-run the full magic-link dance. That keeps the expensive email hop in one test instead of every test that needs an authenticated user.

## When an AI agent is the right tool, and when it is not

Be balanced here, because the honest answer helps you more than a sales pitch.

An AI-driven approach shines when the login UI changes often, when you test across many apps or tenants with slightly different markup, when you want tests a non-engineer can read and edit, and when you want an agent (Claude Code, Cursor, or another MCP host) to validate its own work by actually driving the browser. BrowserBash serves its commands over the Model Context Protocol, so an agent can call `run_test_file` and read the structured verdict itself. For fast-moving teams, describing intent in English beats maintaining a page-object hierarchy that breaks every sprint.

A hand-written Playwright suite is the better fit when your login flow is stable, when you need millisecond-precise timing control, when your team lives in TypeScript and values fully deterministic scripts with no model in the loop, or when constraints forbid any nondeterminism in the test path. If your whole team already knows Playwright, the switching cost may not be worth it. The two are not mutually exclusive: if you have existing specs, `browserbash import` converts them to plain-English test files heuristically and deterministically, dropping anything untranslatable into an import report rather than inventing behavior, so you can migrate incrementally.

The realistic sweet spot for most teams is a hybrid. Keep deterministic API and `Verify` steps for the parts that must be exact (delivery, retrieval, session assertions), and let the agent handle the parts that drift (which button, which field, which confirmation copy). That is the design testmd v2 pushes you toward, and it is the honest recommendation for testing a magic-link login end to end. For deeper walkthroughs of the assertion grammar, the [tutorials](https://browserbash.com/tutorials) and the [learn hub](https://browserbash.com/learn) are the places to go next.

## Putting it together

A production-grade magic-link test is not a single click path. It requests a link and confirms the UI, retrieves the token from a real inbox over a deterministic API step, navigates the link, verifies the session took hold with machine-checked assertions, and proves the token is single-use. Wrap that in a budget, cache it so re-runs are nearly free, shard it across CI, and monitor it in production, and your coverage reflects how users actually sign in. The one part to stay honest about is email retrieval: native IMAP mailbox variables are on the roadmap and not shipped in 1.5.1, so use a testing-inbox API today.

## FAQ

### How do you test a magic-link login end to end?

Cover all five stages in order: submit the email and confirm the request UI, retrieve the link from a test inbox you can read programmatically, navigate the link, verify the session established with deterministic assertions, and prove the token is single-use. Testing only the first and last stages misses the two most fragile parts, delivery and retrieval. With BrowserBash you drive the browser stages in plain English and use deterministic API and Verify steps for the email and session checks.

### How does an AI agent retrieve the magic link from an email?

Today the reliable pattern is to point a deterministic API step at an email-testing inbox (Mailosaur, Mailtrap, MailSlurp, or a catch-all domain) that exposes an HTTP endpoint, fetch the newest message for your test recipient, and store the extracted link URL into a variable. Native IMAP mailbox variables like a built-in mail token are on the BrowserBash roadmap but are not shipped in 1.5.1. Never scrape a real personal Gmail for this, because the markup changes and the flakiness is not worth it.

### Can I test magic-link login without real email delivery?

Yes, if your backend exposes a test-only endpoint that returns the last token minted for an address, which many teams add behind a feature flag. Point the API step at that endpoint instead of a mailbox to skip real delivery, which makes the test faster and more deterministic. The tradeoff is that you no longer exercise the actual mail provider, so pair it with a slower nightly run against a real testing inbox to catch delivery regressions.

### Is BrowserBash free for testing authentication flows?

Yes, BrowserBash is free and open-source under Apache-2.0, and it defaults to running local models through Ollama with no API keys, so nothing has to leave your machine. The one exception relevant here is testmd v2, which currently drives the builtin engine and needs an Anthropic API key or a compatible gateway for the one-step-at-a-time execution that API and Verify steps rely on. The CLI, local dashboard, replay cache, and MCP server all stay free.

Ready to test your own magic-link flow end to end? Install with `npm install -g browserbash-cli` and start with a request-side smoke check today. Creating an account is optional and everything runs locally, but if you want hosted run history and the free cloud dashboard you can [sign up here](https://browserbash.com/sign-up).
