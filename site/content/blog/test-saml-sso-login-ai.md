---
title: Test a SAML SSO Login With AI Browser Automation
description: "Learn to test SAML SSO login with AI browser automation: SP-initiated and IdP-initiated redirects, MFA gates, saved sessions, and CI verdicts."
date: 2026-05-18
category: security
---

If you have ever tried to test a SAML SSO login with a traditional automation framework, you already know the pain. The flow bounces your browser across three or four domains, the identity provider rewrites the URL twice, a hidden `SAMLResponse` form auto-submits before you can grab a selector, and the whole thing changes the week your IdP admin flips a setting. This article walks through how to test SAML SSO login with AI browser automation instead, where you describe the flow in plain English and an agent drives a real Chrome browser through every redirect by intent rather than by brittle CSS paths.

BrowserBash is the tool I will use for the examples. It is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective in ordinary sentences, an AI agent drives a real Chrome or Chromium session step by step with no selectors and no page objects, and you get back a deterministic verdict plus structured results. That model fits SAML unusually well, because SAML is defined by what the user experiences (redirect, log in, get bounced back, land authenticated) rather than by any stable DOM you could pin a locator to.

## Why SAML SSO is the worst case for selector-based tests

SAML is a federation protocol. Your application (the service provider, or SP) never sees the user's password. Instead it hands the browser off to an identity provider (the IdP) such as Okta, Azure AD / Entra, Google Workspace, OneLogin, or Ping. The IdP authenticates the user, mints a signed XML assertion, and posts it back to your SP's Assertion Consumer Service (ACS) URL. The browser is the courier the whole time.

That courier journey is what breaks selector-based tools:

- **Cross-domain hops.** You start on `app.example.com`, get redirected to `login.okta.com` or `login.microsoftonline.com`, maybe pass through a corporate proxy, then come back. Each domain has its own DOM, its own field names, its own anti-bot quirks.
- **Auto-submitting relay forms.** The SAML response usually arrives as an HTML form with a hidden `SAMLResponse` field and an `onload` auto-submit. There is nothing to click. A script that waits for a button never finds one.
- **IdP UI churn.** Okta and Entra redesign their sign-in screens on their own schedule. The field that was `#okta-signin-username` last quarter is a differently named input this quarter. Your test breaks and it is not even your code that changed.
- **Two entirely different entry points.** SP-initiated and IdP-initiated logins take different paths (more on that below), and teams often only test one.

An AI agent sidesteps most of this. When you tell it to "enter the email, click Next, enter the password, click Sign in," it reads the live page each step, finds the right field by its visible label and role, and adapts when the IdP moves things around. You are testing the behavior a real employee would perform, not a snapshot of the HTML.

## SP-initiated vs IdP-initiated: test both flows

There are two ways a SAML session can begin, and they exercise different code paths in your integration. If you only test one, you are shipping the other blind.

| Aspect | SP-initiated | IdP-initiated |
| --- | --- | --- |
| Entry point | Your app's login page | The IdP dashboard / app tile |
| First redirect | SP sends `AuthnRequest` to IdP | None, IdP posts assertion directly |
| RelayState | Set by the SP to remember the target | Often empty or IdP-supplied |
| Common failure | Broken `AuthnRequest`, wrong ACS URL | Unsolicited-response rejected, no deep link |
| Who starts it | User clicks "Log in" on your site | User clicks your app in Okta/Entra |

In an **SP-initiated** flow, the user lands on your product, clicks "Sign in with SSO," your SP generates a SAML `AuthnRequest`, and the browser carries it to the IdP. After authentication the IdP posts the assertion back and the SP drops the user on whatever page RelayState pointed at.

In an **IdP-initiated** flow, the user is already inside the IdP portal (the Okta "My Apps" grid, the Entra My Apps page) and clicks your application's tile. The IdP posts an unsolicited assertion straight to your ACS URL. Many SP libraries reject unsolicited responses by default for security reasons, so this path can pass in one environment and fail in another purely on a config toggle.

Testing both by intent looks like two short objectives. Here is the SP-initiated one as a single run:

```bash
browserbash run "Open https://app.example.com/login, click 'Sign in with SSO', \
enter {{sso_email}} on the identity provider page and click Next, \
type {{sso_password}} and click Sign in, then confirm the dashboard heading \
'Welcome back' is visible and the URL contains app.example.com/dashboard" \
  --agent --headless --timeout 180
```

The `--agent` flag emits NDJSON, one JSON event per line, so CI reads a machine verdict instead of parsing prose. The agent handles every redirect between `app.example.com` and the IdP on its own. You never named a domain-specific selector, which is exactly why this test survives an IdP redesign.

## Turn the flow into a committable test file

Ad hoc `run` commands are great for exploring. For a suite you commit, put the flow in a `*_test.md` file so it lives in git next to your code, reads like documentation, and supports variables and imports. BrowserBash tests are plain Markdown: a `#` title, numbered or bulleted steps, `{{variables}}` for templating, and `@import` for composition.

Here is an SP-initiated SAML test with deterministic assertions:

```markdown
# SAML SSO login (SP-initiated)

1. Open https://app.example.com/login
2. Click the 'Sign in with SSO' button
3. On the identity provider page, type {{sso_email}} into the username field and click Next
4. Type {{sso_password}} into the password field and click Sign in
5. Verify: URL contains app.example.com/dashboard
6. Verify: text "Welcome back" is visible
7. Verify: 'Sign out' link is visible
```

Steps 5 through 7 use `Verify`, which compiles to real Playwright checks with no LLM judgment. A `Verify: URL contains ...` line is a genuine assertion on the resolved URL, a `Verify: text "..." is visible` is a real visibility check, and `Verify: 'Sign out' link is visible` matches an element by its accessible role and name. When one fails you get expected-vs-actual evidence in the `run_end.assertions` block and in the human-readable Result.md assertion table, not a vague "the agent thought it looked wrong." That determinism matters for a security-critical flow, because "logged in" should be a hard fact, not a model's opinion.

Secret-marked variables like `{{sso_password}}` are masked as `*****` in every log line, so your CI output never leaks the test credential. Store the values in a variables file rather than inline. The [features overview](https://browserbash.com/features) covers the full Verify grammar and the variable system.

## The honest problem: corporate IdP MFA gates

Here is where I have to be straight with you, because pretending otherwise would waste your time. Most real corporate identity providers do not stop at username and password. They enforce multi-factor authentication: a push to Okta Verify or Microsoft Authenticator, a TOTP code, a hardware security key (WebAuthn / FIDO2), a number-matching challenge, or a device-trust check that only passes on a managed laptop.

No browser automation tool, AI-driven or not, can approve a push notification on your phone or tap a physical YubiKey for you. That is the entire point of a second factor. If your test account is behind a mandatory push or a hardware key, a fully unattended end-to-end test through the live IdP is not achievable, and any tool that claims otherwise is either using a non-MFA test account or quietly disabling the factor. Be honest with yourself about which situation you are in.

There are legitimate ways to test the flow anyway, and picking the right one is most of the work:

### Use a dedicated non-MFA test account or realm

Many teams provision a test tenant, a bypass group, or a dedicated IdP realm where the SSO test service account is exempt from MFA (often paired with an IP allowlist so the exemption is safe). If that is available, the full SP-initiated and IdP-initiated runs above work unattended. This is the cleanest option and the one most enterprises settle on.

### Use TOTP for a scriptable second factor

If your test account uses TOTP (the 6-digit rotating code) rather than push or a hardware key, the factor is a function of a shared secret and the clock, so it is reproducible. You can compute the current code and feed it in as a variable. This keeps the test unattended while still exercising the MFA step. Push and WebAuthn are not reproducible this way, which is the practical line between "automatable" and "not."

### Save the post-MFA session once and reuse it

This is usually the best answer for day-to-day suites. BrowserBash lets you log in through the full MFA gate one time, by hand, and save the resulting browser session:

```bash
# Log in through the real IdP + MFA once, in a visible browser, then press Enter to save
browserbash auth save corp-sso --url https://app.example.com/login

# Every later run reuses that authenticated session, no IdP round trip
browserbash run "Open https://app.example.com/reports and confirm the \
'Quarterly usage' chart is visible" --auth corp-sso --agent --headless
```

`browserbash auth save` opens a browser at the login URL, you complete the whole SAML dance including the push or the key tap, and pressing Enter stores the session as Playwright storageState. After that, `--auth corp-sso` on any `run`, `testmd`, `run-all`, or `monitor` command starts already authenticated. Your downstream tests never touch the IdP at all, which means they are fast, they do not burn MFA attempts, and they keep working even when the IdP screen changes. The saved profile also warns you if its stored origins do not cover the start URL, so a stale session fails loudly instead of silently doing nothing.

The tradeoff is honest: reusing a saved session no longer re-tests the login itself. You want at least one test that still drives the SAML flow front to back (with a non-MFA or TOTP account) plus many session-reuse tests for everything behind the wall. Split the responsibility deliberately.

## Test the IdP-initiated path and RelayState deep links

The IdP-initiated flow is the one teams forget. Drive it by starting from the IdP's app grid rather than your login page:

```bash
browserbash run "Open https://example.okta.com, sign in as {{sso_email}} \
with {{sso_password}}, click the 'Example App' tile in the dashboard, \
then confirm you land on app.example.com and the 'Sign out' link is visible" \
  --agent --headless --timeout 180
```

Two things to check specifically on this path. First, does your SP even accept the unsolicited assertion, or does it reject it as a potential replay. If your library rejects unsolicited responses by default (a reasonable security posture), an IdP-initiated click should fail predictably, and your test should assert that it fails rather than passing by accident. Second, RelayState: an IdP-initiated login often has no SP-set RelayState, so the user may land on a default landing page instead of the deep link they wanted. Add a `Verify` on the final URL so a silent regression from "deep link honored" to "dumped on the home page" shows up as a real failure.

## Wire SSO tests into CI without leaking credentials

Once the flow works locally, run it in CI in agent mode. A folder of SSO tests runs in parallel through the memory-aware orchestrator:

```bash
# Run every SSO test in the folder, cap total spend, write a JUnit report for CI
browserbash run-all .browserbash/tests/sso \
  --auth corp-sso --junit out/junit.xml --budget-usd 1.50
```

`run-all` derives its concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones across runs. The `--budget-usd` guard stops launching new tests once estimated spend crosses your cap (remaining tests report `skipped` and the suite exits with code 2), which keeps a runaway hosted-model bill from ever happening in CI. The frozen exit codes make the pass/fail contract simple: 0 passed, 1 failed, 2 error or budget stop, 3 timeout.

If your test runner is itself an AI coding agent (Claude Code, Cursor, Windsurf, Codex, Zed), you can expose these runs over the Model Context Protocol so the agent validates its own work:

```bash
# Register BrowserBash as an MCP server in Claude Code
claude mcp add browserbash -- browserbash mcp
```

That gives the agent tools like `run_test_file` and `run_suite`, each returning the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). A failing SSO test is a successful validation: the tool call itself succeeds and the agent reads the verdict to decide what to fix. The [tutorials section](https://browserbash.com/tutorials) has a full MCP walkthrough.

## Monitor SSO in production, alert only on state changes

SSO breakage is a total outage. When SSO is down, nobody logs in. A synthetic monitor that runs the login on an interval catches an expired IdP metadata certificate or a broken ACS binding before your users flood support:

```bash
browserbash monitor .browserbash/tests/sso/login_sp_initiated_test.md \
  --auth corp-sso --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode runs on the interval and alerts only when the verdict flips: pass to fail, and also fail back to pass. It stays quiet on every routine green run, so the Slack channel is signal, not noise. Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload. Because the replay cache lets a green run replay its recorded actions with zero model calls, an always-on monitor is nearly token-free until the page actually changes and the agent steps back in. For a login you must not break, a 10-minute canary is cheap insurance.

## When AI browser automation is the right call (and when it is not)

I would rather you use the right tool than the shiny one, so here is the balanced read.

**Reach for AI-driven testing when** your SAML flow crosses several domains and IdP screens, when the IdP UI changes often enough that selector maintenance is a real tax, when you want the same plain-English test to survive an Okta or Entra redesign, and when you want an AI coding agent to validate its own login changes through MCP. Testing by intent is genuinely more durable here than any locator you could write, and it is far less code.

**Stick with (or add) a lower-level approach when** you need to assert on the raw SAML XML itself: signature validation, `NotOnOrAfter` conditions, the exact `AudienceRestriction`, attribute mappings in the assertion. Those are protocol-level checks below the browser, and a dedicated SAML library or a tool like SAML-tracer plus a backend test is the better fit. Browser automation verifies the user-visible outcome (did the person end up authenticated on the right page), not the cryptographic internals of the assertion. Use both: browser tests for the journey, XML-level tests for the protocol.

Also be realistic about the honest caveats. Very small local models (around 8B parameters and under) can get flaky on long multi-step objectives, and a SAML login with MFA is exactly the kind of long flow where that shows up. The sweet spot is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model for the hard flows. And as covered above, mandatory push or hardware-key MFA cannot be automated end to end by anyone; plan around it with a non-MFA account, TOTP, or saved sessions.

BrowserBash is Ollama-first, so it defaults to free local models with no API keys and nothing leaving your machine, then auto-resolves to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or OpenRouter if those are set. For a login flow carrying real corporate credentials, keeping the model local is a meaningful privacy win. If you want to compare the local versus hosted tradeoff for your specific flow, the [learn hub](https://browserbash.com/learn) and the [project on GitHub](https://github.com/PramodDutta/browserbash) both go deeper.

## A practical rollout plan

Putting it together, here is how I would stand up SAML SSO coverage from scratch:

1. **Provision a safe test identity.** Get a non-MFA test account, a TOTP-only account, or a bypass group with an IP allowlist. This one decision determines whether unattended end-to-end testing is even possible.
2. **Write one full SP-initiated test** that drives login front to back and asserts the landing URL, a post-login heading, and the presence of a sign-out control.
3. **Write one IdP-initiated test** from the IdP app grid, and assert the deep-link URL so a RelayState regression is caught.
4. **Save a post-MFA session** with `auth save` and build the rest of your suite (the pages behind the wall) on `--auth`, so those tests are fast and never hammer the IdP.
5. **Run the suite in CI** with `run-all --agent --junit` and a `--budget-usd` cap.
6. **Add a production monitor** on the login test with `--every 10m --notify` so an SSO outage pages you before it pages your users.

That gives you durable coverage of the exact thing SAML is supposed to guarantee: the right person, authenticated once, lands where they should, every time.

## FAQ

### Can you automate a SAML SSO login that requires MFA?

It depends on the second factor. TOTP codes are reproducible from a shared secret and the clock, so a TOTP-protected login can run unattended. Push notifications and hardware security keys (WebAuthn/FIDO2) require a human action on a separate device and cannot be automated end to end by any tool. The common workaround is to log in through the full MFA gate once, save the authenticated session, and reuse it for later tests.

### What is the difference between SP-initiated and IdP-initiated SAML testing?

SP-initiated means the user starts on your application, clicks "Sign in with SSO," and your service provider sends an authentication request to the identity provider. IdP-initiated means the user is already in the identity provider portal and clicks your app's tile, which posts an unsolicited assertion straight to your service. They exercise different code paths, and many SP libraries reject unsolicited IdP-initiated responses by default, so you should test both flows separately rather than assuming one covers the other.

### Why use AI browser automation instead of selector-based tools for SSO?

A SAML login crosses several domains and identity-provider screens, each with its own DOM, and IdP vendors redesign their sign-in pages on their own schedule. Selector-based tests break every time a field name or layout changes, even though your own code did not change. An AI agent reads each live page and acts by intent (find the email field, click Next), so the same plain-English test keeps working across IdP redesigns.

### How do you keep SSO test credentials from leaking in CI logs?

Store credentials as secret-marked variables rather than inline in the test. BrowserBash masks secret-marked variables as five asterisks in every log line, so the values never appear in console output, NDJSON events, or the Result.md report. For sessions, saving an authenticated profile with the auth command keeps the raw password out of your test files entirely, since later runs reuse the stored session instead of retyping the credential.

## Get started

You can test a SAML SSO login by intent in a few minutes. Install the CLI with `npm install -g browserbash-cli`, write one plain-English objective for your SP-initiated flow, and run it with `--agent`. Everything runs locally by default, with free local models and no account required. When you want the optional cloud dashboard, saved-session sharing, or team features, create an account at [browserbash.com/sign-up](https://browserbash.com/sign-up). An account is optional; the CLI is free and open source forever.
