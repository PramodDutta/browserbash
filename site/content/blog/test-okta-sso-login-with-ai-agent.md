---
title: Testing Okta SSO and SAML Login Flows With an AI Agent
description: "Test Okta SSO and SAML login flows with an AI agent: drive the org login page, follow the redirect chain back into your app, and mask secrets in logs."
date: 2026-06-27
category: guide
---

To test an Okta SSO or SAML login flow with an AI agent, you describe the journey in plain English (open the app, get bounced to the Okta org login page, enter the username and password, clear any prompt, and confirm you land back inside the protected app) and let the agent drive a real Chrome browser through the full redirect chain. The agent reads each page live as it renders, so the Okta-hosted login screen, your app's "Sign in with SSO" button, and the post-authentication landing page are all found from what is on screen rather than from brittle selectors. The tool here is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command in this guide is real and runnable. The hard parts of Okta testing are not the typing: they are the redirect hops between domains, keeping the credential out of your logs, and being honest about MFA. This post covers all three.

An Okta-fronted login is not one page. It is a hand-off: your app redirects an unauthenticated user to your Okta org domain (something like `your-org.okta.com`), Okta authenticates them, and then either posts a SAML assertion back to your app's Assertion Consumer Service URL or completes an OIDC redirect. A selector-based test has to track that chain by hand across domains you do not control. An intent-based agent follows the navigation the way a person would, which is why this flow fits AI-driven testing.

## Why Okta login tests are harder than a plain form

A plain login form lives on one page you control. An Okta SSO flow spans domains you do not, and that changes the failure modes. The markup on the Okta side is not yours. Okta ships sign-in widget updates and your org admin toggles features, so a selector pinned to an Okta widget class is waiting to break on a release you never see coming. The flow is also a redirect chain, not a single submit: the browser leaves your origin, lands on the Okta domain, and returns, and tests that assume a single page get confused the moment the URL changes. SAML and OIDC differ at the edges (a SAML flow ends with a hidden form auto-posting an encoded assertion back to your app, OIDC with a code exchanged at a callback URL), but from the browser's point of view both look like "the page navigated again and then I was logged in." That is exactly the level an intent-based agent works at: you assert on the destination, not the protocol mechanics.

BrowserBash's agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, and it handles iframes and Shadow DOM. That matters here because some embedded Okta widgets and consent surfaces render inside iframes a class-based locator would miss. For more on how intent-based login testing holds up against selector churn, see [AI login flow testing](https://browserbash.com/blog/ai-login-flow-testing).

## Your first Okta SSO test

Install the CLI globally from npm:

```bash
npm install -g browserbash-cli
```

You need a model to drive the agent. BrowserBash resolves it automatically: a local [Ollama](https://ollama.com) install first, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY` (which includes some genuinely free hosted models). Local means nothing leaves your machine, attractive when your test types a corporate credential. One honest caveat: small local models in the 8B-and-under range tend to wander on long multi-step flows, and an Okta redirect chain is long, so a 70B-class model (Qwen3, Llama 3.3) or a hosted model is the reliable choice here.

Here is the shape of a one-line Okta SSO smoke test. It uses placeholder variables so no secret is ever inlined:

```bash
browserbash run "Open {{app_url}}, click the 'Sign in with SSO' button, on the Okta org login page enter {{username}} and password {{password}}, then verify the app dashboard heading is visible" \
  --variables '{"app_url":"https://app.example.com","username":"qa@example.com","password":{"value":"REDACTED","secret":true}}'
```

That single objective navigates to your app, triggers the SSO redirect, authenticates on the Okta-hosted page, follows the assertion back, and asserts on the landing page, with no selector, wait, or domain-switching logic from you. The `verify` clause is the assertion: if the dashboard heading never appears, the run fails. Add `--headless` to run without a visible window in CI, and `--record` to capture a webm video plus screenshots so a failure on any hop is debuggable after the fact.

## Handling the Okta org login page and the redirect chain

The redirect chain is where naive automation falls down, so be explicit in the objective about what the agent should expect. You are not pinning URLs or window handles, you are telling the agent the story so it knows what a successful hop looks like. A committable markdown test makes this readable. BrowserBash tests are plain `*_test.md` files: a `#` title, then steps as a numbered or bulleted list, with `{{variables}}` for values and `@import` for composition. Here is an `okta_sso_test.md`:

```markdown
# Okta SSO login smoke test

1. Open {{app_url}}
2. Click the "Log in" button
3. Click "Sign in with SSO" (or "Use single sign-on")
4. Wait to be redirected to the Okta org login page on {{okta_domain}}
5. Enter {{username}} in the username field and click Next
6. Enter password {{password}} and click Verify (or Sign in)
7. Wait to be redirected back to {{app_url}}
8. Verify the dashboard shows the heading "Welcome"
```

Run it with:

```bash
browserbash testmd run ./okta_sso_test.md \
  --variables '{"app_url":"https://app.example.com","okta_domain":"your-org.okta.com","username":"qa@example.com","password":{"value":"REDACTED","secret":true}}' \
  --record
```

Two details make this robust. Steps 4 and 7 name the navigation explicitly, so the agent treats the domain change as expected. And the test relies on Playwright's built-in auto-wait, with a 15-second ceiling and no manual sleeps, so a slow redirect or a SAML response auto-posting back to your app is handled by waiting for the next element to be actionable, not a fixed delay.

Note the split username and password steps. Modern Okta sign-in is often a two-screen identifier-first flow: you enter the email, click Next, and only then does the password field render, so two steps match what happens on screen and cue the agent that a page load sits between them.

### Identity-provider-initiated SAML

If your flow is IdP-initiated (the user starts from an Okta dashboard tile rather than your app), say so: "Open the Okta end-user dashboard, click the {{app_name}} tile, and wait to be signed into the app." Because you state intent rather than a fixed URL sequence, the agent follows whichever redirect the tile triggers and lands you in the app the same way.

## Keeping the credential out of your logs

This is the part most SSO tutorials skip, and it matters most when the credential is a real corporate account. The objective text you pass the agent is echoed into logs and structured events. So the moment you inline a password into the objective, that password is in your terminal scrollback, your shell history, and any log your CI retains.

BrowserBash's rule is simple: never inline a credential, always pass it through a `{{variable}}` marked secret. A secret variable uses the `{"value": "...", "secret": true}` shape, and secret values are masked as `*****` in every log line and NDJSON event. The agent types the real value into the Okta field, but the log shows the mask:

```text
Type ***** into the password field
```

Keep the actual secret in your CI's secret store and inject it at runtime, never in the committed `*_test.md`. The test file holds the journey, the secret store holds the credential. For a full treatment of this pattern in a pipeline, see [secret handling in AI browser tests in CI](https://browserbash.com/blog/secret-handling-ai-browser-tests-ci). If your flow drives a TOTP factor (more on its limits below), the seed gets the same treatment: never let a seed or one-time code reach a log in plaintext.

## Running it in CI

For a pipeline you want machine-readable output. The `--agent` flag emits NDJSON, one JSON object per line, that a CI script or AI coding agent can consume directly:

```bash
browserbash run "Open {{app_url}}, sign in via Okta SSO with the provided credentials, and verify the account menu shows the test user's name" \
  --agent --headless --timeout 180 \
  --variables '{"app_url":"https://app.example.com","username":"qa@example.com","password":{"value":"REDACTED","secret":true}}'
```

Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate"}`, and the run ends with a single `run_end` object carrying a `status`. Exit codes map straight to pipeline logic: `0` pass, `1` fail, `2` error, `3` timeout. The generous `--timeout` is deliberate: an Okta round-trip through multiple redirects takes longer than a local form fill, and a too-tight timeout produces false `timeout` results that are really just impatience.

Every run writes a `Result.md` summary, and you can opt into uploading runs with `--upload` (free runs kept 15 days) or watch them locally with `browserbash dashboard`. The `--provider` flag selects where Chrome runs: `local`, `cdp`, `browserbase`, `lambdatest`, or `browserstack`. For Okta flows, the default local provider in headed mode is usually the friendliest profile to present.

A useful pattern: avoid re-authenticating on every test by reusing an already-authenticated session, which sidesteps both the redirect cost and a lot of provider friction. That technique is covered in [reuse login session across browser tests](https://browserbash.com/blog/reuse-login-session-across-browser-tests).

## Composing Okta login into larger journeys

Most tests are not "log in and stop." The `@import` directive lets you write the Okta SSO flow once in `okta_sso_test.md` and reuse it as the first step of every downstream journey:

```markdown
# Create a report after SSO login

@import ./okta_sso_test.md

1. Click "New report" in the top navigation
2. Enter "Q3 summary" as the report title and click Save
3. Verify the report appears in the reports list
```

Now the authentication journey lives in one file. When Okta ships a widget update, you fix the one imported test and every journey inherits it: the same centralization a page object gives a selector suite, except the imported unit is plain-English intent, not a map of the DOM.

## The two engines, and which to pick for Okta

BrowserBash ships two engines. The default `stagehand` (MIT, by Browserbase) observes the live DOM on each step and decides the next action from what is rendered right then, which is what lets it follow an Okta page through a widget redesign without you touching the test. The alternative `builtin` is an Anthropic tool-use loop that captures native Playwright traces and re-derives the selector on every action from a fresh snapshot, never cached across runs. Neither keeps a saved selector script between runs; both work from the live state each time, the property you want when half the pages belong to Okta and change without warning.

For Okta SSO, the default `stagehand` engine on the `local` provider in headed mode is the sensible starting point; reach for `builtin` when you want the Playwright trace for debugging a gnarly redirect. The [features](https://browserbash.com/features) page lists what each engine and provider supports, and the [learn](https://browserbash.com/learn) section covers the concepts if you are new to intent-based testing.

## Honest limits: where this struggles on Okta flows

Balanced advice means naming where AI-driven Okta testing does not help, and here the limits are real.

**MFA is the big one.** If your Okta policy enforces a push to Okta Verify, an FIDO2 security key, or a biometric, no browser-automation tool (AI or not) can satisfy that from a headless CI runner, because the factor lives on a device the runner does not have. The only factor a test can realistically drive is a TOTP, and only if you provision a dedicated test account whose seed you control and store as a secret. Push, WebAuthn, and biometric factors are out of scope for an automated browser test by design: that is a security feature, not a BrowserBash gap. The practical answer is a TOTP-only policy in a non-production Okta environment, or an Okta test-mode bypass for the PR gate with a fuller flow on a schedule.

**Device trust and conditional access can block you outright.** If your policy requires a managed device, a trusted network, or a registered browser, a fresh CI runner fails the check no matter how good the automation is. Test against an environment whose rules permit your runner.

**Bot detection and novel-location challenges.** A headless browser on a CI IP Okta has never seen can trigger extra verification. The mitigations are operational: use a dedicated account that has signed in from your CI network before, prefer headed runs (headless is a known signal, and `--record` works headed), and run real-provider tests on a schedule rather than every commit.

**Do not put a live Okta login in a blocking PR gate.** This is the single most important design decision. A live identity provider in a per-commit gate will eventually flake on something outside your control and block deploys for a reason unrelated to your code. Use a mocked SAML/OIDC provider or a test-mode bypass for the fast PR gate, and run the real Okta flow as a scheduled canary that catches "Okta changed their page" first.

**Protocol internals belong in integration tests.** Validating the SAML assertion signature, the OIDC `state` parameter, PKCE, or clock skew is server-side work; assert those against your callback endpoint directly. A browser test should confirm a human can sign in and land in the app, not re-verify the cryptography.

The strongest setup is layered: mocked provider for the blocking gate, AI-driven real-Okta run on a schedule against a warmed-up TOTP-only test account, and integration tests for the assertion and token internals. BrowserBash slots into the middle layer, exactly the layer selector scripts handle worst.

## FAQ

### Can an AI agent test an Okta SSO login end to end?

Yes. An AI agent drives the full Okta SSO journey in a real browser: trigger the redirect to the Okta org login page, enter the username and password, follow the SAML or OIDC redirect back, and assert on the landing page. With BrowserBash you write that as plain-English steps and the agent finds every element from the live page across all the domains in the chain. The limit is multi-factor: a test can drive a TOTP code if you control the seed, but it cannot complete an Okta Verify push, a security key, or a biometric from a CI runner.

### How do I test a SAML login without leaking the password?

Mark the password (and any TOTP seed) as a secret variable using the `{"value":"...","secret":true}` shape, and BrowserBash masks it as `*****` in every log line, in the NDJSON `--agent` output, and in the per-run `Result.md`. Keep the actual value in your CI secret store, inject it at runtime, and commit only the plain-English `*_test.md` steps, so the credential never reaches shell history or pipeline logs.

### Why does my Okta test fail on the MFA prompt?

Because most MFA factors live on a device the runner does not have. An Okta Verify push goes to a phone, a security key needs physical presence, and biometrics need a real fingerprint or face, none of which a browser tool can satisfy. The workable path is a dedicated non-production test account with a TOTP-only policy whose seed you store as a secret, or a test-mode bypass for the PR gate with a fuller flow on a schedule.

### Should I run a live Okta login on every commit in CI?

No. A live identity provider in a per-commit blocking gate will eventually flake on novel-location challenges, rate limits, or conditional-access rules outside your control. Use a mocked SAML or OIDC provider (or a test-mode bypass) for the fast PR gate, and run the real Okta flow as a scheduled canary so a genuine "Okta changed their page" break is caught without blocking every deploy.

Ready to try it? Install with `npm install -g browserbash-cli` and write your first Okta SSO test in plain English. The source is on [GitHub](https://github.com/PramodDutta/browserbash) and the package on [npm](https://www.npmjs.com/package/browserbash-cli). If your app uses OAuth alongside Okta, a related read is [testing OAuth login with an AI agent](https://browserbash.com/blog/test-oauth-login-with-ai).
