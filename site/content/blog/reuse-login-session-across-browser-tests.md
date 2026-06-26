---
title: Reusing Login Sessions Across AI Browser Tests
description: "Reuse login session tests instead of logging in every test. Factor login into one file, then @import it everywhere to keep authenticated AI suites fast."
date: 2026-06-26
category: guide
---

If every test in your suite starts by typing a username and password, your suite is slower and flakier than it needs to be. Write the login flow once, then reuse it. In BrowserBash, the durable, documented way to do that is `@import` composition plus `{{variables}}`. You put the login steps in a `login_test.md`, add `@import ./login_test.md` at the top of any test that needs an authenticated session, and pass credentials through variables that get masked in the logs.

This post shows the exact files, the secret-masking behavior, and the honest limits of what "reuse" means here, so you do not build a suite on a feature that does not exist.

## The short answer: factor login out, then `@import` it

Logging in inside every test is duplication, and duplication in a test suite is a maintenance tax plus a flakiness multiplier. If your login form changes, you do not want to edit forty files, and if your login objective is slightly nondeterministic, you do not want forty tests inheriting that flakiness independently.

BrowserBash tests are plain Markdown files ending in `_test.md`. A `#` heading is the title, and `-` or `1.` lines are the steps the agent executes against a real browser. The composition primitive is `@import`: a line like `@import ./login_test.md` pulls the steps from another `_test.md` file in at that point, so the imported flow runs first, then the rest of your test continues in the already-authenticated session.

So the reuse pattern is two files:

1. One `login_test.md` that does nothing but log in and assert it worked.
2. Every other test that needs auth begins with `@import ./login_test.md`, then does its own thing.

That is the grounded mechanism. It is composition of a login flow, not a magic cookie that appears from nowhere, and that distinction changes how you design the login step.

## Step 1: write a tight, deterministic `login_test.md`

The single most important property of a reusable login flow is that it is boring and deterministic. Because every authenticated test imports it, any wobble in this file flakes the entire suite, so keep the objective tight: go straight to the login URL, fill known fields, and assert a specific post-login marker. No exploring, no "find the login link somewhere on the homepage," no ambiguous success check.

Here is a complete `login_test.md`:

```markdown
# Log in to the app

- Go to https://app.example.com/login
- Type {{TEST_EMAIL}} into the "Email" field
- Type {{TEST_PASSWORD}} into the "Password" field
- Click the "Sign in" button
- Wait until the URL contains "/dashboard"
- Confirm the text "Welcome back" is visible on the page
```

Notice what this file does and does not do:

- It navigates **directly** to `/login`, instead of starting at the marketing homepage and hunting for a login link. Every extra hop is another chance to flake.
- It targets fields by their visible labels (`"Email"`, `"Password"`), keeping the agent on stable, human-readable anchors.
- It ends with **two** assertions, a URL check and a visible-text check. A specific post-login marker (a URL fragment plus a greeting that only appears when authenticated) is what makes "did login succeed" deterministic instead of a guess.
- Credentials are `{{variables}}`, never literals.

Run this file on its own to prove the flow works before you import it anywhere:

```bash
browserbash testmd run ./login_test.md
```

Get this green and stable in isolation first, because a login flow you have not validated alone is one you are about to copy into every test in the suite.

## Step 2: import it from any authenticated test

Once `login_test.md` is solid, every test that needs a session starts with one line. Here is a test for an authenticated settings page:

```markdown
# Update display name in settings

@import ./login_test.md

- Go to https://app.example.com/settings/profile
- Clear the "Display name" field
- Type "Ada Lovelace" into the "Display name" field
- Click the "Save changes" button
- Confirm the text "Profile updated" is visible on the page
```

When you run it:

```bash
browserbash testmd run ./update_profile_test.md
```

the agent first executes the imported login steps (navigate, fill, submit, assert the marker), then, in that same authenticated session, navigates to settings and does the real work. The test body reads as if you were already logged in, because by the time it runs, you are. Do the same across a whole directory of feature tests, each one short and focused on its own behavior, all starting with that single `@import` line.

The login logic lives in exactly one place. When your login form changes, you edit `login_test.md` once and every importing test picks up the change. That maintenance payoff is why factoring login out is worth doing on day one. `@import` is general composition, so you can also layer it (a base file imports login and seeds shared state, and a feature test imports the base), but keep the chain shallow.

## Step 3: pass credentials as masked variables

Hardcoding a password into a `_test.md` file is how secrets end up in version control and CI logs. BrowserBash supports `{{variables}}` so your test references a name, not a value, and sensitive values are masked in the logs so the real password never appears in run output. That is why the login file says `{{TEST_PASSWORD}}` and not the literal string. The flow is:

- The test file contains only the variable reference, for example `Type {{TEST_PASSWORD}} into the "Password" field`.
- You supply the real value at run time (from your environment or a variables source), so the secret lives outside the committed file.
- In the run logs, the value is masked, so a leaked CI log or a shared terminal recording does not leak the credential.

This matters more for reused login than for a one-off test, because a reused `login_test.md` runs on every single test invocation, so masking turns a recurring exposure into a non-event. Two rules keep the shared login file safe: use a dedicated test account (never a real human's production credentials), and keep the value out of the committed file, because if you can read the password by opening the test in your editor, so can anyone with repo access.

For exactly how variables resolve and what masking covers, see the [variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial), and for the broader threat model of pointing an AI agent at an authenticated app with real credentials, read [credentials and secrets safety](https://browserbash.com/blog/ai-browser-automation-credentials-secrets-safety) before you aim this at production.

## What "session reuse" actually means here

Be precise about the mental model, because it shapes how you write the login step. Each `browserbash testmd run` drives a real browser, and when a test imports `login_test.md`, the agent **performs the login** at the start of that run. It is not loading a pre-saved cookie jar from a previous run and skipping the form. The reuse is reuse of the **flow definition**, one canonical set of login steps every test shares, executed fresh each time inside that run's browser session.

That is a feature, not a limitation, for most suites: a fresh, deterministic login per run keeps tests isolated, so none inherits stale or half-expired state from another. But it has two consequences worth designing around. First, **login speed is part of every test's runtime**: because the login steps execute on each run, a slow flow taxes the whole suite, which is the real reason to keep `login_test.md` tight (direct URL, known fields, one clean post-login assertion). Second, **determinism compounds**: a login that succeeds ninety-five percent of the time hands every authenticated test that same five percent failure rate before it even starts, so pin the login down hard and spend the flakiness budget on the behavior under test, not on getting through the front door.

### If your app supports a token, you can inject it as a variable

There is a faster path when your application supports it. If your app accepts a session token, bearer token, or API key that grants an authenticated session, you can supply that token as a `{{variable}}` and set it directly, skipping the interactive form entirely: no email field, no password field, no submit button, just an authenticated session from a value you inject.

Whether this is available depends entirely on your app. BrowserBash gives you the variable mechanism to inject such a token when your app exposes one, but it does not invent a token your app does not issue. Treat token injection as an optimization you reach for when the application cooperates, and fall back to the imported form-login flow when it does not.

## Magic-link and OTP logins

Some apps have no password field at all. They email a magic link, or send a one-time code you type in, and you cannot fully factor those into a static `login_test.md` the way you can a username-and-password form, because the secret part arrives out of band at run time.

BrowserBash handles these with dedicated flows. For email-based logins, the agent can drive the inbox-and-click flow rather than guessing. For codes a human or an external system must supply, BrowserBash supports a human-in-the-loop path for OTP and CAPTCHA, where the run pauses for the code and then continues. You can still reuse these: the magic-link or OTP login lives in its own `login_test.md`-style file and gets imported the same way; only the steps inside that file change. See [testing email and magic-link login flows](https://browserbash.com/blog/test-email-and-magic-link-login-flows) for the full setup.

## Honest limits

The pattern is solid, and being clear about its edges keeps you off assumptions that do not hold.

- **`@import` composes, it does not cache.** Importing `login_test.md` executes the login steps; it is not a saved-cookie shortcut. The one exception is the token-injection case above. If you came here expecting "log in once, then every test skips login from a stored session," that shortcut only exists when your app issues a token you can inject. Otherwise, login runs each time.
- **A flaky login flakes everything that imports it.** This is the sharpest edge. Because the login file is shared, its failure rate is the floor for your whole authenticated suite. An ambiguous post-login assertion, a login URL that sometimes redirects through an interstitial, or a field label that occasionally changes will surface as intermittent failures across dozens of unrelated tests. Keep `login_test.md` tight and validate it in isolation, precisely because it is load-bearing.
- **MFA and OTP need a real second factor.** If login requires a one-time code or a second device, a static imported file cannot conjure that code. Use the email flow or the human-in-the-loop path. There is no way around a factor that is, by design, not knowable ahead of time.
- **Reuse does not deduplicate runtime.** Sharing the login definition removes duplicated authoring and maintenance, not duplicated execution. Each run still logs in, so budget your suite's wall-clock time accordingly.

None of these are reasons to avoid the pattern. They are reasons to write the login file carefully, because in a reused-login suite, the login file is the most important file you have.

The whole approach is three moves: write one tight, deterministic `login_test.md` and validate it alone, start every authenticated test with `@import ./login_test.md`, and pass credentials as masked `{{variables}}` (injecting a session token when your app supports one). That gives you a suite where login logic lives in exactly one place, secrets never hit logs, and each test reads as if it were already signed in, while staying honest: it composes a real login flow per run, not a cross-run cookie cache you cannot verify.

BrowserBash is a free, open-source, Apache-2.0 natural-language browser automation and testing CLI from The Testing Academy. Install it with:

```bash
npm install -g browserbash-cli
```

## FAQ

### Does `@import` save my login session between runs so tests skip logging in?

No, not by itself. `@import ./login_test.md` composes the login steps into your test, so the agent performs the login at the start of each run inside a real browser. It is reuse of the login flow definition, not a stored cookie jar. The only way to truly skip the form is if your app issues a session token or key you can inject as a `{{variable}}`. When your app does not support that, login runs each time, which is also what keeps tests isolated from each other.

### How do I keep my password out of the logs and out of git?

Reference it as a `{{variable}}`, for example `Type {{TEST_PASSWORD}} into the "Password" field`, and supply the real value at run time from your environment rather than putting it in the file. BrowserBash masks sensitive values in run logs, so the password does not appear in output even though the login flow runs on every test. Use a dedicated test account. The [variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial) covers exactly how values resolve and what masking covers.

### My app uses a magic link or an OTP code. Can I still reuse login?

Yes, with a different inside. Put the magic-link or OTP login in its own file and `@import` it like any other login file. For emailed links, BrowserBash can drive the inbox-and-click flow, and for codes supplied at run time, it supports a human-in-the-loop pause for OTP and CAPTCHA. See [testing email and magic-link login flows](https://browserbash.com/blog/test-email-and-magic-link-login-flows) for the full setup. The `@import` pattern is identical; only the steps inside the imported file change.

### One flaky test keeps failing on the login step. What should I check?

Because every authenticated test imports the same `login_test.md`, a flaky login surfaces everywhere, so fix it at the source. Make sure the file navigates directly to the login URL instead of hunting for a login link, targets fields by stable visible labels, and ends with a specific post-login marker. Run `browserbash testmd run ./login_test.md` on its own until it is green and stable before trusting it across the suite, since a login that is ninety-five percent reliable makes every importing test at most ninety-five percent reliable.

## Keep going

- Full mechanics of credentials and masking: the [variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial).
- Passwordless logins: [testing email and magic-link login flows](https://browserbash.com/blog/test-email-and-magic-link-login-flows).
- The agent-against-an-authenticated-app security model: [credentials and secrets safety](https://browserbash.com/blog/ai-browser-automation-credentials-secrets-safety).
- Running plain-English tests in your pipeline: [manual QA plain-English tests in CI](https://browserbash.com/blog/manual-qa-plain-english-tests-in-ci).
- See everything the CLI does on the [features](https://browserbash.com/features) page, and get grounded on engines, providers, and models on the [learn](https://browserbash.com/learn) page.
