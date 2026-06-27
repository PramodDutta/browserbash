---
title: Testing Firebase Auth Email and Google Sign-In With AI
description: "Test Firebase Auth flows with AI: email and password sign-up, the Google sign-in popup, masked passwords, and reusing the signed-in session across tests."
date: 2026-06-27
category: guide
---

To test Firebase Auth with AI, you hand a browser agent a plain-English objective like "sign up with this email and password, then confirm the dashboard loads," and it drives a real Chrome session through the whole flow: typing into the Firebase-rendered form, handling the Google sign-in popup window, and verifying the authenticated app state on the other side. You never write a selector for `#email` or chase the popup with `page.waitForEvent('popup')`. You describe what a signed-in user looks like, the agent reads the live page on each step, and it decides what to click. This guide walks through all three Firebase Authentication cases that matter in practice: email and password, the Google OAuth popup, and reusing the signed-in session across later tests, using the open-source [BrowserBash](https://browserbash.com/features) CLI.

The honest framing first. Firebase Auth has two parts that fight automation: a third-party OAuth popup that opens a separate Google-controlled window, and Google's bot detection that can show a CAPTCHA or a "this browser may not be secure" wall on real consumer accounts. An AI agent handles the popup mechanics well, but it cannot click past a CAPTCHA, and it should not be pointed at a real Google account you care about. The reliable path, which this guide centers on, is the Firebase Auth Emulator plus dedicated test accounts.

## Why Firebase Auth is awkward to test the old way

Firebase Authentication is a hosted service, so your app does not own the login UI the way a hand-rolled form does. When you use FirebaseUI or the `signInWithPopup` flow, large parts of the experience are rendered by Firebase or by Google, on markup you do not control.

Three things make selector-based scripts brittle here:

- **The Google account chooser is a separate window on `accounts.google.com`.** Your Playwright or Cypress script has to detect the popup, switch context to it, find the email field inside Google's markup, and switch back. Google reworks that markup on its own schedule, and your selectors break on a release you never deployed.
- **Auth state is asynchronous and invisible in the DOM.** Firebase resolves the sign-in, fires `onAuthStateChanged`, then your app re-renders. A test that asserts on the dashboard right after clicking "Sign in" races the auth callback, so you sprinkle waits to paper over the gap.
- **FirebaseUI class names are generated.** Keying a test to `.firebaseui-id-submit` couples you to an implementation detail that can change with a library bump.

None of these are bugs. They are the normal shape of a hosted auth service. The fix is to stop describing the page by its structure and start describing it by its behavior: there is an email field, there is a Google button, and after sign-in there is a signed-in dashboard. That is exactly what an agent works with.

## How the agent drives a Firebase login

BrowserBash is a natural-language CLI. You write an objective in English, an AI agent drives a real Chromium browser step by step, and it returns a pass or fail verdict plus structured results. The default engine, stagehand, observes the live DOM on each step and decides the next action from what is actually rendered right then. The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, and it handles iframes and Shadow DOM, which matters because FirebaseUI sometimes renders inside one.

The mental model: a selector tool needs you to answer "where is the email field?" with a path. The agent answers with a description and resolves it against the live page at runtime. A basic email and password sign-in is one command:

```bash
browserbash run "Go to https://localhost:3000/login, click 'Sign in with email', \
  enter email test-user@example.com and password hunter2, submit, and confirm \
  you land on the dashboard showing 'Welcome, Test User'."
```

There are no selectors there. "Sign in with email," "the dashboard," "Welcome, Test User" are the words a human would use, and the agent maps each one to the live page. Because it re-reads the page after every action, the dashboard that appears only after `onAuthStateChanged` fires is simply there on the next look. You did not add a wait for it; Playwright's built-in auto-wait (a 15 second ceiling, no manual sleeps) covers the late render, and the agent confirms the signed-in text before declaring success.

## Writing the email and password flow as a test file

Running ad hoc objectives is fine for exploration, but auth flows are something you want to version and re-run. BrowserBash reads Markdown test files: a `#` title, then steps as a numbered or bulleted list, with `{{variables}}` for values and `@import` to compose files. Tests are intent, not selectors.

Here is `firebase_email_login_test.md`:

```markdown
# Firebase email and password sign-in

1. Go to {{baseUrl}}/login
2. Click "Sign in with email"
3. Type {{email}} into the email field
4. Type {{password}} into the password field
5. Click the "Sign in" button
6. Confirm the page shows "Welcome, {{displayName}}"
7. Confirm a "Sign out" control is visible
```

Run it:

```bash
browserbash testmd run ./firebase_email_login_test.md \
  --var baseUrl=http://localhost:3000 \
  --var email=test-user@example.com \
  --var displayName="Test User" \
  --var password=$FIREBASE_TEST_PASSWORD
```

The password comes from an environment variable, not the file, and BrowserBash masks `{{password}}` in its logs so the secret never lands in your terminal scrollback, your CI output, or the per-run `Result.md`. That masking is the whole point of routing secrets through variables instead of inlining them. There is a full walkthrough of how variable resolution and secret masking work in the [BrowserBash variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial).

A few notes specific to Firebase here:

- **Use the Auth Emulator for the green path.** Point `baseUrl` at an app wired to the Firebase Auth Emulator and seed `test-user@example.com` ahead of time. The emulator has no bot detection, no rate limits, and no CAPTCHA, so this test passes deterministically. Against live Firebase you risk throttling after repeated runs.
- **Seed the account, do not test sign-up and sign-in in one file.** A login test should assume the user exists, which makes it fast and independent.
- **Assert on something only a signed-in user sees.** "Welcome, Test User" and a visible "Sign out" control are good signals. Asserting only that the URL changed is weaker, because an error page can also change the URL.

For the wider pattern of testing any login by intent rather than markup, see the guide on [AI login flow testing](https://browserbash.com/blog/ai-login-flow-testing).

## Handling the Google sign-in popup

This is the part that breaks most scripts. `signInWithPopup` opens a new window on Google's domain, the user picks an account and consents, the window closes, and your app receives the credential. Four context switches, all on markup you do not own.

An agent treats the popup as part of the same objective. You describe the flow end to end, and the agent follows the new window when it opens, acts inside it, and returns to your app when it closes:

```bash
browserbash run "Go to http://localhost:3000/login, click 'Continue with Google'. \
  In the Google window that opens, choose the account test-user@example.com, \
  enter the password if prompted, and approve. Back on the app, confirm the \
  dashboard shows 'Welcome, Test User'."
```

Because the default engine re-derives the next action from whatever is rendered, the agent does not need a hand-coded `waitForEvent('popup')` or a manual context switch. It sees the Google account chooser appear and works inside it the way a person would: read the accounts, click the right one, type the password, click consent. When the popup closes and your app re-renders signed in, the agent reads the dashboard and confirms.

A test-file version, `firebase_google_login_test.md`:

```markdown
# Firebase Google sign-in popup

1. Go to {{baseUrl}}/login
2. Click "Continue with Google"
3. In the Google sign-in window, choose the account {{email}}
4. If a password field appears, type {{password}} and continue
5. If a consent screen appears, approve the requested permissions
6. Back on the application, confirm the page shows "Welcome, {{displayName}}"
```

### The critical caveat: use the Auth Emulator's Google provider

The Firebase Auth Emulator simulates OAuth providers. When you trigger Google sign-in against the emulator, it shows a simple local account-picker page instead of the real `accounts.google.com` flow. There is no CAPTCHA, no two-factor prompt, and no "this browser may not be secure" block. That is the only version of the Google popup an agent can drive reliably end to end.

Against the real Google OAuth screen, expect friction. Google's bot detection frequently challenges automated browsers with a CAPTCHA or a phone-verification step, and an AI agent cannot and should not click past those. If you must test against live Google, use a dedicated throwaway account with two-factor disabled, accept that it will sometimes get challenged, and never point automation at a real personal account.

## Reusing the signed-in session across tests

Signing in is the slowest step in most suites, and the Google popup is the slowest part of that. You do not want to repeat it before every test. Firebase persists auth in the browser (IndexedDB by default), so once a context is signed in, that state can be saved and replayed.

The pattern is the standard one: run the login flow once, save the authenticated storage state, then start later tests from that saved state so they open already signed in.

With `@import`, you compose a signed-in precondition into each test instead of repeating the steps:

```markdown
# View account settings as a signed-in user

@import ./firebase_email_login_test.md

1. Click the user menu in the top right
2. Click "Account settings"
3. Confirm the email field shows {{email}}
4. Confirm the "Delete account" button is present
```

That keeps the login logic in one place. When the login UI changes, you edit one file and every test that imports it stays correct. For the deeper version of this (saving storage state so the popup runs zero times in the main suite, plus how Firebase persistence interacts with replayed sessions) see [reusing a login session across browser tests](https://browserbash.com/blog/reuse-login-session-across-browser-tests).

Two Firebase-specific things to watch when reusing sessions:

- **ID tokens expire after about an hour.** A session captured days ago hits an expired token, and the Firebase SDK tries to refresh it. As long as the refresh token is still in the saved state, the SDK refreshes silently; if you cleared it, the app bounces to login. Regenerate the saved state on a schedule rather than committing it once and forgetting.
- **The emulator resets on restart unless you export.** Emulator auth state lives in memory. Use export-on-exit and import-on-start so your seeded test users survive a restart, otherwise a saved browser session points at a user that no longer exists.

## Email verification and passwordless links

Firebase also offers email-link (passwordless) sign-in and an email-verification step after sign-up. Both put a link in an inbox that the test has to retrieve and visit. That is its own pattern: the agent drives the app to the point where Firebase sends the mail, your test reads the link from a mail-testing inbox or the emulator's log, and the agent visits it to complete the flow. The mechanics of pulling a link out of an inbox and continuing the flow are covered in [testing email and magic link login flows](https://browserbash.com/blog/test-email-and-magic-link-login-flows).

For Firebase specifically, the Auth Emulator helps again: it does not send real email. Instead it logs the sign-in and verification links to its console and exposes them on a local endpoint, so your test can fetch the link directly without any external mail service. That keeps passwordless and verification tests fully local and deterministic.

## Running it in CI

Firebase auth tests belong in CI like any other end-to-end check, and BrowserBash is built for that. Use `--agent` to emit NDJSON for machine parsing, `--headless` for the runner, and the exit codes to gate the pipeline: 0 pass, 1 fail, 2 error, 3 timeout.

```bash
browserbash testmd run ./firebase_email_login_test.md \
  --agent --headless --record \
  --var baseUrl=http://localhost:3000 \
  --var email=test-user@example.com \
  --var displayName="Test User" \
  --var password=$FIREBASE_TEST_PASSWORD
```

`--record` captures a webm video plus screenshots, which is what you want when an auth run fails in CI and you need to see whether it stalled on the popup or on the dashboard render. Each run also writes a `Result.md`. For local triage you can run `browserbash dashboard`, and there is an opt-in `--upload` to a hosted dashboard (free runs are kept 15 days) if you want a shareable link. None of that is required; the exit code alone is enough to pass or fail a build.

Two CI specifics for Firebase: start the Auth Emulator as a service step before the tests run with your seeded users imported, and keep the test password in your CI secret store, passing it as `--var password=$FIREBASE_TEST_PASSWORD` so the variable masking keeps it out of build logs.

## Choosing a model

BrowserBash resolves a model automatically: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist there). Local models mean nothing leaves your machine, which is appealing for an auth flow where test credentials are in play. Be realistic about size, though: small local models (roughly 8B and under) get flaky on long, multi-window flows, and the Google popup is exactly that kind of flow. For the popup case, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model handles the context switches far more reliably. Email and password against the emulator is short enough that smaller models often manage it. The [learn hub](https://browserbash.com/learn) covers the higher-level reasoning on engines and models.

## Honest limits

This approach is not magic, and Firebase auth has sharp edges worth stating plainly.

- **The real Google OAuth screen is a wall.** Against live `accounts.google.com`, expect CAPTCHAs, "this browser may not be secure" blocks, and phone-verification prompts. An AI agent cannot solve a CAPTCHA, and you should not try to make it. The emulator's Google provider is the only reliably automatable path, and that is a real constraint, not a workaround we are hiding.
- **Non-determinism is inherent.** The agent decides each step from the live page, so two runs are not guaranteed to be identical. For an account chooser with several saved accounts, an ambiguous objective can pick the wrong one. Be specific about which account, and assert on exact signed-in text.
- **Auth state assertions can give false positives.** If your app shows a generic shell before auth resolves, the agent might see something that looks signed-in for a moment. Assert on data only an authenticated user has (their name, their email in settings, a sign-out control), not just a URL change.
- **It costs model tokens and is slower than a unit test.** Driving a real browser with a model per step is heavier than calling the Firebase Admin SDK directly. Use this for the genuine end-to-end paths, and use the Admin SDK or emulator REST API to set up state you are not specifically testing.
- **Token expiry bites reused sessions.** A saved session older than the refresh window will not silently work. Treat saved auth state as perishable and regenerate it.

Where does that leave the comparison to scripted tools? Playwright and Cypress are excellent and, with enough hand-written popup handling and storage-state plumbing, they test Firebase auth perfectly well. What they ask of you is the brittle part: the selectors for Google's markup, the explicit popup context switch, the waits around the auth callback. BrowserBash moves that targeting logic into a model that re-derives it from the live page each run, trading upfront selector maintenance for per-run model cost and a dose of non-determinism. For Firebase auth, where the third-party markup is the thing most likely to break a script, that trade often comes out ahead.

## FAQ

### Can BrowserBash get past the Google sign-in CAPTCHA?

No. If the real Google OAuth flow shows a CAPTCHA, the agent cannot solve it, and you should not build your tests assuming it will. Use the Firebase Auth Emulator, whose simulated Google provider has no CAPTCHA, for reliable runs. Reserve any live-Google testing for a dedicated throwaway account and accept that it will sometimes be challenged.

### How do I keep the Firebase test password out of my logs?

Pass it as a `{{password}}` variable sourced from an environment variable (for example `--var password=$FIREBASE_TEST_PASSWORD`), never inline it in the test file, and let BrowserBash mask the variable in its terminal output, NDJSON, and the per-run `Result.md`. The masking is automatic for values supplied through variables, which is the reason to route secrets that way.

### Do I need a real Firebase project to test sign-in?

No, and for repeatable tests you should not use one. The Firebase Auth Emulator runs locally, simulates email/password and OAuth providers, sends no real email, and has no rate limits or bot detection. Point your app at the emulator, seed test users, and your auth tests pass deterministically. Save real-project testing for occasional smoke checks.

### How do I avoid signing in before every test?

Run the sign-in flow once, save the authenticated browser storage state, and start later tests already signed in, or compose a signed-in precondition with `@import ./firebase_email_login_test.md` at the top of each test. Regenerate the saved state periodically because Firebase ID tokens expire after about an hour and stale sessions can bounce to login.
