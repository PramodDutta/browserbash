---
title: How to Test 2FA and TOTP Authenticator Logins With AI
description: "Test 2FA TOTP login with AI: generate the current authenticator code from a shared secret, inject it as a masked variable, and assert the dashboard loads."
date: 2026-06-27
category: guide
---

To test a 2FA TOTP login (the Google Authenticator style six-digit code) with AI, you generate the current code yourself from the account's shared secret, pass it into the test as a secret-marked `{{otp}}` variable, and let an AI agent type it into the verification field and assert that you reached the dashboard. The shared secret is the key your authenticator app was seeded with; a tiny TOTP library turns it into the same rolling six-digit code the app would show, so your test never has to read a phone screen. This works because TOTP is a deterministic function of a secret and the clock, and the rest of the login is ordinary form-filling that an AI browser agent handles by reading the live page. The tool here is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command below is real and runnable.

The trick that makes the whole thing tractable is that you are not "automating Google Authenticator." You are reproducing what Authenticator does. The app and your test are both seeded from the same Base32 secret, both read the same wall clock, and both run the same standard algorithm, so they independently arrive at the same code in the same 30-second window. Get the secret into your test harness once, and the six digits are just a computed string you inject like any other value.

## What TOTP actually is (and why that makes it testable)

TOTP stands for Time-based One-Time Password, defined in RFC 6238. When a site shows you a QR code during 2FA setup, that QR encodes a shared secret, usually a Base32 string like `JBSWY3DPEHPK3PXP`. Your authenticator app stores that secret. Every 30 seconds, the app combines the secret with the current Unix time divided into 30-second steps, runs an HMAC, and truncates the result to six digits. The server does the identical computation and checks that your code matches one of the recent steps.

The consequence for testing is the part people miss: the code is not random and it is not pushed from a server. It is a pure function of `(secret, current_time)`. If your test knows the secret, it can compute the exact same six digits the human's phone would show, with no phone, no SMS, and no push notification involved. That is what makes TOTP, alone among the common second factors, fully automatable end to end.

So the testing problem reduces to three concrete tasks: get the shared secret for a dedicated test account, compute the current code at the moment the test needs it, and feed that code into the login flow as a variable. BrowserBash handles the third task natively through its `{{variable}}` system with secret masking. The first two are a few lines of setup you do once per test account.

## Get a stable shared secret for a test account

Do this against a dedicated QA account, never a real user's, and never your own. During that account's 2FA enrollment, the site offers a "can't scan the code?" link or a manual-entry option that reveals the Base32 secret in plain text. Copy that string. It is the one durable input your tests need, and it does not rotate unless you re-enroll the account. Treat it exactly like a password: it belongs in your secret store, not in a committed file.

A clean pattern is to enroll one long-lived QA account once, record its secret, and reuse it across every run. The codes it generates change every 30 seconds, but the secret behind them is stable, so a single value in your CI secret store powers thousands of logins.

If your app is the one being tested and you control enrollment, you can go further and have a setup step capture the secret programmatically when the account is created, then hand it to the test. Either way, the secret reaches the test as a string you will mark secret.

## Compute the current code at run time

A TOTP code is only valid for its 30-second window, so you cannot hardcode it. You generate it fresh, immediately before the login step. Any standard library does this in a line or two. In Node, `otplib` or `otpauth` are the common choices:

```js
// gen-otp.js
import { authenticator } from "otplib";

const secret = process.env.TOTP_SECRET; // the Base32 string
console.log(authenticator.generate(secret));
```

```bash
node gen-otp.js
# -> 482913
```

That six-digit string is the value you inject. The pattern in a shell wrapper is to compute it and pass it straight into the run:

```bash
OTP=$(node gen-otp.js)
browserbash run "Open {{base_url}}/login, sign in as {{username}} with password {{password}}, then enter the verification code {{otp}} and verify the dashboard heading is visible" \
  --variables "{\"base_url\":\"https://staging.example.com\",\"username\":\"qa@example.com\",\"password\":{\"value\":\"$PW\",\"secret\":true},\"otp\":{\"value\":\"$OTP\",\"secret\":true}}"
```

Because you generate `OTP` in the same script that launches the run, the code is at most a second or two old when the agent types it, comfortably inside the 30-second window. If you ever see a flake where the code is rejected, it is almost always a clock issue (see honest limits below), not a logic error.

## The `{{otp}}` injection pattern, end to end

The reason to pass the code as `{{otp}}` rather than splicing it into the objective string is the same reason you never inline a password: anything you write literally into the objective shows up in BrowserBash's logs and NDJSON events. A one-time code is less sensitive than a long-lived password, but the shared secret it comes from is extremely sensitive, and a disciplined habit of routing every credential-shaped value through a masked variable keeps the secret hygiene uniform. Mark both the password and the OTP secret, and the log line reads:

```text
Type ***** into the verification code field
```

instead of printing the live digits. There is a deeper treatment of why this matters in [secrets masking and credential safety](https://browserbash.com/blog/secrets-masking-credential-safety), and the full mechanics of variable precedence live in the [variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial).

The agent finds the verification field the way a human would. It reads the accessibility tree (roles, accessible names, states) and the DOM rather than matching a CSS class, so a field labeled "Enter code", "One-time passcode", "Authentication code", or "6-digit code" all resolve to the same intent. You describe what you want typed, not where to type it. If the page splits the code across six single-character boxes, the agent handles that from the live layout too, because it decides the next action from what is rendered right then rather than from a recorded script. You can read more about how the engine observes the page on the [features page](https://browserbash.com/features).

## A committable markdown test for the full 2FA flow

A one-line objective is great for a quick check, but the login you depend on belongs in version control. BrowserBash's format for that is the markdown test: a file ending in `_test.md` where each list item is a step and `{{variables}}` work exactly as on the command line. Here is a standalone `totp_login_test.md`:

```markdown
# 2FA login with TOTP

- Open {{base_url}}/login
- Sign in as {{username}} with password {{password}}
- Verify a verification code prompt is shown
- Enter the one-time code {{otp}} into the verification field
- Submit the verification form
- Verify the page shows the dashboard heading
- Verify a "Log out" link is visible
```

You still have to compute the code before the run, so the wrapper looks like this:

```bash
OTP=$(node gen-otp.js)
browserbash testmd run totp_login_test.md --headless \
  --variables "{\"otp\":{\"value\":\"$OTP\",\"secret\":true}}"
```

The non-secret values (`base_url`, `username`) live in `./.browserbash/variables/*.json` where reviewers can see them, and the password and OTP come from your secret store at run time. After the run, BrowserBash writes a `Result.md` next to the file: the verdict, what happened at each step, and `*****` everywhere the secret values were used, so the artifact is safe to attach to a ticket.

The real payoff arrives the moment you have a second authenticated test. Every flow behind that login needs to pass 2FA first, so put the login in a helper and splice it in with `@import` instead of copying the steps:

```markdown
# Create invoice (behind 2FA)

@import ./helpers/totp_login.md

- Click the New Invoice button
- Fill the customer field with {{customer_name}}
- Save the invoice and verify the status badge says 'Draft'
```

Imported steps are inserted in place, so every test authenticates identically and a change to the login is a one-file fix. There is a fuller walkthrough of the underlying mechanics in [AI login flow testing](https://browserbash.com/blog/ai-login-flow-testing).

## Choosing a model for a multi-step flow

A 2FA login is a genuinely multi-step objective: navigate, type credentials, wait for the second-factor prompt, type the code, submit, assert. That length matters when you pick a model. BrowserBash resolves a model automatically in the order Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (which includes some free hosted models). Running locally through Ollama means nothing leaves your machine, which is appealing when you are handling authentication secrets.

The honest caveat is capability. Small local models in the 8B-and-under range tend to wander on long flows, and a 2FA login is exactly the kind of sequence where a weak model loses track between the password step and the code step. A 70B-class model (Qwen3, Llama 3.3) or a capable hosted model is the reliable choice for the full flow. If you must run small and local for privacy, keep each test short and lean on `@import` so no single run is very long.

## Timing: the one thing that bites people

TOTP is unforgiving about clocks because both sides derive the code from time. Two timing facts keep these tests green.

First, generate the code as late as possible. Compute `OTP` in the same script that launches the run, not minutes earlier in a separate setup phase, so the digits are fresh when the agent types them. A code generated 40 seconds before it is typed has already rolled over.

Second, do not add manual sleeps waiting for the 2FA prompt. BrowserBash uses Playwright's built-in auto-wait with a 15-second ceiling, so the agent waits for the verification field to actually appear before typing into it. A second-factor screen that takes a moment to render after the password submit is handled for you; you write the step, not the wait.

If a code is occasionally rejected despite being fresh, suspect clock skew. The server and the machine generating the code must agree on the time within the server's tolerance window (commonly one or two 30-second steps). On a CI runner with NTP, this is rarely an issue; on a laptop with a drifting clock, it can be. Sync the clock before blaming the test.

## Honest limits: where this approach struggles

This pattern is clean for TOTP and genuinely awkward or impossible for the other second factors. Be clear-eyed about the boundary.

**Push-based 2FA cannot be computed.** If the second factor is a "tap Approve on your phone" push notification (Duo, Okta Verify, an app-specific prompt), there is no shared secret you can turn into a code. The approval lives on a physical device and a vendor's backend. BrowserBash cannot generate that approval, and neither can any other automation honestly. The realistic options are a test-only bypass in a non-production environment, a vendor test API that auto-approves, or a human in the loop. There is a dedicated write-up of that last option in [human in the loop for OTP and CAPTCHA](https://browserbash.com/blog/human-in-the-loop-cli-browser-otp-captcha).

**SMS and email codes are not deterministic.** An SMS or emailed code is generated server-side and delivered out of band, so you cannot compute it from a local secret. Testing those means reading the code from somewhere: a test SMS provider with an API (Twilio test numbers, a catch-all inbox), a staging hook that exposes the last sent code, or a mail-trap service your test queries. That is a real integration, not a one-liner, and it is outside what the browser agent alone can do.

**You need access to the secret, which is a real constraint.** The whole approach assumes you can obtain the TOTP secret for a test account. For your own application that is straightforward. For a third-party site you are merely a user of, capturing and storing the enrollment secret may be against terms of service or simply not worth the risk. Test what you own.

**Masking is one layer, not a force field.** Marking the OTP and the shared secret as secret hides them in BrowserBash's own logs and NDJSON. It cannot scrub a value you hardtyped as a literal into the objective, it cannot clean a CI runner that echoes the whole command line, and it cannot stop your app from printing something on the page. Keep the secret in a secret store, prefer a variables file over inline flags in CI so the value never sits on a command line, and rotate the QA account if a secret is ever exposed.

**Single-use codes complicate retries.** Many servers reject a TOTP code after it has been used once, even within its window. If your test runner retries a failed login, the retry may reuse a now-spent code and fail for the wrong reason. Generate a fresh code on each attempt rather than reusing the value from the first try.

## How this compares to selector-based suites

A traditional Playwright or Selenium suite tests TOTP the same way at the secret level: you still compute the code with a TOTP library and type it in. To be fair, those frameworks are excellent and battle-tested, and if you already have a robust login helper, generating a code and filling a field is a small addition. The difference BrowserBash makes is in the rest of the flow, not the code generation. You describe the verification step in plain English instead of pinning a selector to the code field, and the agent re-reads the live page each run to find it. When the 2FA screen gets redesigned (and auth screens churn constantly), an intent-based step adapts where a hardcoded locator would break.

BrowserBash is not self-healing in the sense of patching a saved script: it keeps no cached selector to repair. It re-derives the right element from the live accessibility tree and DOM on every run. That is a different model from a recorded-locator suite, and for the frequently-redesigned login screen specifically, it tends to survive the churn that shreds a locator map. If you are starting fresh and want plain-English tests, this is a strong fit; if you have a mature selector suite that works, the honest advice is to add TOTP to it rather than rewrite. You can explore more patterns on [the learn hub](https://browserbash.com/learn).

## FAQ

### How do I get the TOTP secret for my test account?

During the account's 2FA enrollment, choose the manual-entry or "can't scan the QR code?" option. The site then shows the Base32 shared secret (something like `JBSWY3DPEHPK3PXP`) in plain text instead of only as a QR image. Copy that string into your secret store. It is stable until you re-enroll the account, so you capture it once and reuse it. If you control the application, a setup step can capture the secret programmatically at enrollment and pass it to the test.

### Can BrowserBash handle push notifications or SMS-based 2FA?

No, and neither can any automation honestly, because those factors are not computable from a local secret. A push approval lives on a physical device and a vendor backend, and an SMS or email code is generated server-side and delivered out of band. For those, use a test-only bypass in a non-production environment, a vendor test API, a test SMS or mail-trap provider you can query, or a human in the loop. TOTP is the one common second factor that is fully automatable because the code is a deterministic function of the secret and the clock.

### Why does my TOTP code get rejected even though it looks correct?

Almost always clock skew or staleness. The machine generating the code and the server validating it must agree on the time within the server's tolerance window. Sync the generating machine's clock (NTP) and generate the code as late as possible, in the same script that launches the run, so it is only a second or two old when typed. Also check that a retry is not reusing a now-spent single-use code; generate a fresh one on each attempt.

### Do I have to write a TOTP generator myself?

No. Use a standard library: `otplib` or `otpauth` in Node, `pyotp` in Python, and equivalents in most languages. You pass it the Base32 secret and it returns the current six-digit code in one call. BrowserBash does not generate the code for you; you compute it in a small wrapper and inject it as a masked `{{otp}}` variable. That keeps the code generation in well-tested library code and the secret in your store.

## The shape of it

Testing a TOTP login with AI comes down to a clean division of labor. A standard TOTP library, fed the account's Base32 secret and the current clock, produces the exact six digits the authenticator app would show. BrowserBash takes it from there: you inject the code as a secret-marked `{{otp}}`, write the login as plain-English steps the agent carries out against the live page, and assert the dashboard loads, with every secret value masked to `*****` in the logs and the `Result.md`. The hard boundary is that push and SMS factors are not computable from a local secret and need a bypass, a vendor test path, or a human, while TOTP is fully automatable end to end. Pick a 70B-class or hosted model for the multi-step flow, generate the code as late as possible to dodge timing flakes, and keep the shared secret in a real secret store. The result is a 2FA login test that reads like a sentence and survives the redesigns that break a locator script.
