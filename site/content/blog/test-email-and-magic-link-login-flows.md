---
title: Testing Email and Magic-Link Login Flows with AI
description: "How to test magic link login and run test email OTP login automation with BrowserBash: human-in-the-loop, test-inbox API, and pre-provisioned tokens."
date: 2026-06-26
category: guide
---

The short answer: magic-link and email-OTP logins are hard to automate because the credential never appears in your test code. It lands in an inbox, out of band, seconds after your browser clicks "Send link." Traditional UI automation has no natural way to reach across into that inbox and pull the code back out.

BrowserBash gives you three workable patterns, and which one you pick depends on whether you are running locally or in CI:

1. **Human-in-the-loop:** pause the run, let a person grab the code or click the link, then continue. Good for local and exploratory work. Does not run unattended in CI.
2. **Test-inbox API (the CI-friendly pattern):** a programmatic inbox (Mailosaur, MailSlurp, Mailpit, or a Gmail-plus-alias with an API) fetches the latest email in your harness, you extract the link or 6-digit code, then a BrowserBash step opens the link or types the code through `{{variables}}`.
3. **Pre-provisioned sessions or tokens:** if your app exposes a test-only login token, inject it through variables and skip email entirely in CI.

One thing to be honest about up front: BrowserBash drives the browser. It does not read your inbox. The email retrieval is something you wire alongside it, either as an API call in your test harness or as a setup step before the browser run. Codes and links flow through `{{variables}}`, which are masked in logs. The rest of this guide shows the shape of each pattern.

## Why magic links break traditional automation

A normal login is self-contained. You know the username and password before the test starts, you type them, you assert. Everything the test needs is in the test.

A magic-link or email-OTP login splits the flow across two channels:

- **Channel one (browser):** the user enters an email address and clicks a button.
- **Channel two (inbox):** seconds later, an email arrives with either a clickable link or a short numeric code.
- **Back to channel one:** the user clicks the link (which usually opens a new tab or a fresh session) or types the code into the form.

The credential is generated server-side, after the test starts, and delivered somewhere your browser tooling cannot see. That is the whole problem. You cannot hardcode the code because it is different every run. You cannot read it from the DOM because it is not in the DOM, it is in an inbox.

So every working approach has to answer one question: how does the code get from the inbox back into the browser step? The three patterns below answer it three different ways.

## Pattern 1: Human-in-the-loop

BrowserBash supports pausing a run so a human can supply an OTP or click a magic link, then resuming. This is the same human-in-the-loop capability used for CAPTCHA and other interactive challenges. The browser holds at the right spot, you check your real inbox, you paste the code or follow the link, and the run carries on.

When this fits:

- **Local development:** you are iterating on a login flow and just want it to work end to end against a real inbox without setting up email infrastructure.
- **Exploratory testing:** you are poking at edge cases (expired links, reused codes, wrong email) and a human in the loop is exactly what you want.
- **Demos and one-off verification:** you need to confirm the flow works on a staging environment once, not a thousand times.

When this does not fit:

- **Headless CI.** This is the honest limit. A pipeline has no human watching, so a step that waits for a person to paste a code will hang until it times out. Human-in-the-loop and unattended CI are mutually exclusive. If your nightly suite needs to test magic-link login, you need Pattern 2 or Pattern 3.

Use human-in-the-loop for the runs a person is already watching. Do not reach for it in automation that has to run alone.

## Pattern 2: The test-inbox API (CI-friendly)

This is the pattern that survives in a pipeline. The idea is a hybrid flow: an **API step** retrieves the latest email and extracts the link or code, then a **BrowserBash step** uses that value in the browser. BrowserBash already supports hybrid API plus UI testing, where an API setup or fetch runs first and the AI handles the UI verification, so this fits the model directly.

You need a programmatic inbox: an email service with an API you can query from your harness. Common choices:

- **Mailosaur** and **MailSlurp:** hosted services that give every test a real, queryable inbox.
- **Mailpit:** a self-hosted SMTP capture server with an HTTP API, handy when your app sends mail in a test environment and you do not want a third party.
- **Gmail with a plus-alias** (`you+test123@gmail.com`) read through the Gmail API: workable when you want to reuse an existing mailbox.

The flow has the same three logical stages every time:

1. **Browser, part one:** open the app, enter the test email address, click the button that triggers the email.
2. **Harness, API:** poll the inbox API for the newest message sent to that address, then extract the link or the 6-digit code from the body.
3. **Browser, part two:** either open the extracted link directly, or type the extracted code into the form, passing the value in through `{{variables}}`.

### The shape of the hybrid email-fetch flow

Here is the pattern in plain terms. The email retrieval lives in your harness as a small step that runs between the two browser phases. A rough sketch in JavaScript using a test-inbox API:

```js
// 1. Trigger the email via the browser (BrowserBash step), then:

// 2. Fetch and extract in your harness
const message = await inbox.waitForLatestMessage({
  sentTo: "you+test123@example.com",
  timeout: 30000,
});

// For a magic link, pull the href:
const magicLink = message.html.links.find(l =>
  l.href.includes("/auth/verify")
).href;

// For an OTP, pull the 6-digit code with a regex:
const otp = message.text.match(/\b(\d{6})\b/)[1];

// 3. Hand the value to the BrowserBash run as a variable
process.env.MAGIC_LINK = magicLink; // or OTP
```

Then the browser step consumes it. In your test markdown you reference the value with `{{variables}}`, and you pass it at run time:

```bash
# Magic-link variant: open the extracted URL
browserbash run login-magic-link.test.md --var magic_link="$MAGIC_LINK"

# OTP variant: type the extracted code
browserbash run login-otp.test.md --var otp_code="$OTP"
```

Inside `login-otp.test.md`, the natural-language steps read like this:

```markdown
# Email OTP login

Open the app and click "Sign in with email".
Enter "you+test123@example.com" in the email field and click "Send code".
Wait for the code-entry screen.
Type {{otp_code}} into the verification code field.
Click "Verify".
Check that the dashboard is visible and shows the account email.
```

And the magic-link variant is even simpler, because the link carries the session:

```markdown
# Magic-link login

Open {{magic_link}} in the browser.
Check that the page redirects to the dashboard.
Check that the user is signed in.
```

A few practical notes on this pattern:

- **The fetch is yours, the browser is BrowserBash.** The `inbox.waitForLatestMessage` call is in your harness, not in BrowserBash. BrowserBash never logs into the mailbox. Keep that boundary clear when you wire it.
- **Secrets go through `{{variables}}` with masking.** The OTP and the link are sensitive for the duration of the test. Passing them as variables means they are masked in BrowserBash logs rather than printed in plain text. Do not bake them into the markdown file.
- **`@import` keeps it DRY.** If several tests share the same "trigger email" preamble or the same dashboard assertions, factor those into a shared file and pull them in with `@import` composition instead of copying steps.
- **Address-per-run avoids cross-talk.** Use a unique plus-alias or a fresh inbox per test so a poll never picks up a stale email from a previous run. This is the single most common source of flake in this pattern.

### Magic link versus OTP: pick by where the secret lives

Both are email-delivered credentials, but they behave differently in automation:

- A **magic link** carries the session in the URL. Once you open it, you are usually signed in, no form to fill. The extraction is "find the right href." The risk is that some links are single-use or open in a specific browser context, so opening them out of band can behave differently than a real click.
- An **OTP** is a short code you type into a field. The extraction is "regex out six digits." It maps cleanly to a type-into-field browser step, which is why OTP flows are often the easier of the two to automate reliably.

If your app supports both, OTP is frequently the more predictable target for CI.

## Pattern 3: Pre-provisioned sessions and tokens

The fastest test is the one that skips the slow part. If your application exposes a **test-only login token**, a backdoor that the engineering team built specifically for automated tests, you can bypass email entirely.

The shape:

1. Your harness asks a test endpoint (or reads a seeded fixture) for a valid login token for a known test user.
2. You pass that token to the BrowserBash run through `{{variables}}`.
3. The browser step injects it, usually by opening a URL that accepts the token or by setting it where the app expects a session, and lands on an authenticated page.

```bash
TOKEN=$(curl -s "$APP/test/login-token?user=qa@example.com")
browserbash run authed-dashboard.test.md --var session_token="$TOKEN"
```

When this fits:

- **CI suites where login is not the thing under test.** If you are testing the checkout flow, you do not need to re-test email login a hundred times to get there. Provision a session and start at the dashboard.
- **Speed.** No inbox polling, no OTP timing window, no flake from email delivery latency.

The honest caveat: this requires cooperation from the application. The app has to expose a token mechanism that is locked to non-production environments. If it does not exist, you cannot use this pattern, and you should not ship a login backdoor to production to get it. When the token path is available, it is the most stable of the three for everything except testing the email login flow itself.

## Choosing between the three

A quick rule of thumb:

- **Testing the magic-link or OTP flow itself, in CI:** Pattern 2 (test-inbox API). It is the only one that exercises the real email path unattended.
- **Testing something behind login, in CI:** Pattern 3 (pre-provisioned token), if your app supports it. Fastest and least flaky.
- **Local or exploratory work:** Pattern 1 (human-in-the-loop). Lowest setup, but it cannot run alone.

Many teams use two at once: Pattern 3 for the bulk of the suite that just needs to be authenticated, and a small number of Pattern 2 tests that specifically guard the email login flow.

This pairs well with session reuse. Once you have authenticated through any of these paths, reusing the resulting session across tests means you pay the login cost once rather than per test.

## Honest limits

No tooling makes email-delivered credentials free. The real constraints:

- **Fully unattended magic-link testing needs a programmatic inbox.** BrowserBash does not read your email for you. If you want CI to test the real email path, you must wire a test-inbox API (Mailosaur, MailSlurp, Mailpit, Gmail API, or similar) into your harness. There is no way around having something that can query a mailbox.
- **OTP timing windows can flake.** Codes expire. If your inbox poll is slow, or email delivery lags, or the verification step runs after the window closes, the test fails for reasons that have nothing to do with a real bug. Tune your poll timeout and keep the gap between "fetch code" and "submit code" tight.
- **The human-in-the-loop path cannot run in headless CI.** It is for runs a person is watching. A pipeline step that waits for human input will hang and time out. This is a hard boundary, not a configuration you can flip.
- **Magic links can be single-use or context-bound.** Opening a link out of band in automation sometimes behaves differently from a real user click in the original browser. Verify your app's link behavior before assuming the extracted href will just work.
- **Pre-provisioned tokens require app support.** If engineering has not built a test-login endpoint scoped to non-production, Pattern 3 is simply unavailable. Do not invent a production backdoor to satisfy a test.

None of these are dealbreakers. They are the real cost of testing a credential that arrives in an inbox, and naming them up front saves you a week of chasing phantom failures.

## Getting started

Install the CLI and you have everything on the browser side:

```bash
npm install -g browserbash-cli
```

BrowserBash is free and open source under Apache-2.0. Write your login flow in natural-language markdown, wire your inbox fetch alongside it in your harness, pass codes and links through `{{variables}}`, and run with `browserbash run` (or `testmd run`). Start with human-in-the-loop locally to get the flow right, then graduate the CI-critical paths to the test-inbox API or a pre-provisioned token.

See the [features](/features) page for the full capability list and [learn](/learn) for more guides.

## FAQ

### Can BrowserBash read my email to get the magic link automatically?

No, and it is important to be clear about this. BrowserBash drives the browser, it does not log into your mailbox. To fetch the link or code automatically you wire a programmatic inbox (Mailosaur, MailSlurp, Mailpit, or the Gmail API) into your test harness, extract the value there, and pass it to the browser step through `{{variables}}`. The browser automation and the email retrieval are two separate pieces you compose.

### What is the difference between testing a magic link and testing an email OTP?

A magic link carries the session in the URL, so opening the extracted link usually signs the user in with no form to fill. An email OTP is a short numeric code you type into a verification field. In automation, OTPs are often more predictable because "type six digits into a field" maps cleanly to a browser step, while some magic links are single-use or context-bound and behave differently when opened out of band. If your app offers both, OTP is frequently the easier CI target.

### How do I keep the OTP code out of my logs?

Pass it through `{{variables}}` rather than writing it into the test markdown. BrowserBash masks variable values in its logs, so the code is not printed in plain text. Generate or fetch the code in your harness, hand it in as a variable at run time, and reference it as `{{otp_code}}` in the steps. Never commit a real code or link to your test files.

### Can I run magic-link login tests in CI without a human?

Yes, with the test-inbox API pattern (Pattern 2). You need a programmatic inbox your harness can query, and a unique email address per run to avoid picking up stale messages. The human-in-the-loop path cannot run unattended, so for CI you either fetch the code via an inbox API or skip email entirely with a pre-provisioned test-login token (Pattern 3) when your app supports one.

## Related guides

- [Human-in-the-loop CLI browser for OTP and CAPTCHA](/learn/human-in-the-loop-cli-browser-otp-captcha)
- [Hybrid API and UI testing with AI](/learn/hybrid-api-and-ui-testing-with-ai)
- [Reuse login session across browser tests](/learn/reuse-login-session-across-browser-tests)
- [BrowserBash variables and secrets tutorial](/learn/browserbash-variables-and-secrets-tutorial)
