---
title: Test WorkOS-Powered Auth in Plain English
description: "Learn to test WorkOS auth flows (AuthKit, SSO, magic links) in plain English with BrowserBash, templated credentials, and deterministic Verify checks."
date: 2026-05-19
category: security
---

If your app leans on WorkOS for login, you already know the hard part is not writing the login screen. It is proving, on every deploy, that the whole authentication path still works: AuthKit renders, the SSO redirect lands back on your callback, the session cookie sticks, and a logged-in user actually sees the dashboard. To test WorkOS auth the usual way you write selectors, mock redirects, and babysit brittle scripts. There is a simpler path. With BrowserBash you describe the flow in plain English, an AI agent drives a real Chrome browser through it, and you get a deterministic pass or fail with evidence attached. No page objects, no hand-tuned CSS selectors, no guessing which iframe AuthKit is rendering into this week.

This guide walks through testing WorkOS-powered authentication end to end: the hosted AuthKit sign-in, enterprise SSO connections, magic-link and passwordless flows, and the protected routes behind them. You will template every credential so nothing sensitive lands in a log, save a login once so you stop re-authenticating on every test, and pin the important checks to deterministic assertions so a pass means the condition actually held.

## Why WorkOS auth is awkward to test

WorkOS is a good product precisely because it hides complexity. AuthKit gives you a hosted, drop-in sign-in box, the SSO product brokers SAML and OIDC connections so you never touch an enterprise IdP directly, and magic links and MFA sit behind a clean API. That abstraction is a gift in production and a headache in a test suite.

The trouble is that a WorkOS login is not one page. It is a redirect chain. Your app sends the user to AuthKit, AuthKit may bounce to an enterprise identity provider, the IdP posts back, WorkOS exchanges a code for a profile, and your callback finally sets a session. A traditional end-to-end script has to know the shape of every one of those pages, and those pages are not yours. AuthKit's markup can change without warning, an enterprise SSO stub renders different fields than an email-password form, and selectors that worked last quarter silently rot.

Then there is the redirect timing. Automated scripts love to assert against a page before the redirect settles, so you get flaky failures that are really race conditions. And because auth is the front door to everything, every other test in your suite pays the login tax again and again.

Plain-English testing sidesteps most of this. You are not describing markup, you are describing intent. "Sign in with the email and password, then confirm the dashboard loads" reads the same whether AuthKit ships a new layout tomorrow or not. The agent looks at the live page, finds the right fields by what they mean, and adapts. You still get determinism where it counts, because the important checks compile to real assertions rather than an AI's opinion.

## Your first plain-English WorkOS login test

Start by installing the CLI. It is free and open source, and by default it runs against local models so nothing leaves your machine.

```bash
npm install -g browserbash-cli
browserbash run "Open https://app.example.com/login, click 'Sign in', enter {{WORKOS_EMAIL}} and {{WORKOS_PASSWORD}} on the AuthKit form, submit, and confirm the page heading reads 'Dashboard'" --agent
```

A few things are happening in that one line. The double-brace tokens are templated variables, so your real WorkOS test credentials never appear in the command, the terminal history, or the run log, and secret-marked variables get masked as five asterisks in every line BrowserBash prints. The `--agent` flag switches output to NDJSON, one JSON event per line, which is what you want in CI or when a coding agent is reading the result instead of a human.

The agent navigates to your login page, clicks through to AuthKit, recognizes the email and password fields by their labels and roles rather than by fragile selectors, types the templated values, submits, and checks the heading. If AuthKit redesigned its form, the intent still holds. You did not hard-code a single `#email` or `input[name="password"]`.

To keep credentials out of the command entirely, define them in a variables file or environment and let BrowserBash substitute them. This is the pattern you want for [markdown test files](https://browserbash.com/tutorials) that live in your repo and run in CI, where the objective is committed but the secrets are injected at runtime.

## Save the login once, reuse it everywhere

The single biggest speedup for auth-heavy suites is to stop logging in on every test. WorkOS sessions are just cookies and storage, and BrowserBash can capture that state once and replay it.

```bash
# save the WorkOS session once, by hand
browserbash auth save workos-user --url https://app.example.com/login

# then reuse it on any run, already logged in
browserbash run "Open https://app.example.com/settings and confirm the 'Billing' link is visible" --auth workos-user --agent
```

The first command opens a real browser at your login URL. You complete the WorkOS sign-in by hand, including any MFA prompt or SSO redirect, and press Enter. BrowserBash saves the resulting Playwright storageState under the name you gave it. From then on, any run, test file, suite, or monitor can reuse that authenticated session. Now the settings test starts already logged in. It does not re-drive AuthKit, does not spend an SSO round trip, and does not pay the redirect-timing tax. If the saved profile's origins do not cover the URL you are hitting, BrowserBash prints a warning rather than silently doing nothing, so you learn the profile is stale instead of chasing a phantom failure.

There is a real tradeoff to name here. A saved session tests the app *behind* login, not the login itself. You still want at least one test that drives the full WorkOS flow cold, so a broken AuthKit configuration or a misconfigured callback actually fails your suite. Use the saved profile for the other forty tests that just need to be logged in, and keep one honest end-to-end login test that never uses `--auth`.

## Deterministic checks with Verify, not vibes

An AI agent judging whether a page "looks logged in" is fine for exploration and dangerous for a gate that blocks deploys. This is where BrowserBash draws a hard line. Ordinary steps are agent-driven. `Verify` steps compile to real Playwright checks with no model judgment at all.

Put your WorkOS flow in a committable `*_test.md` file and use `Verify` for the assertions that matter:

```
# WorkOS AuthKit login

- Open https://app.example.com/login
- Click the 'Sign in' button
- Type {{WORKOS_EMAIL}} into the email field
- Type {{WORKOS_PASSWORD}} into the password field
- Submit the form
- Verify URL contains /dashboard
- Verify text 'Welcome back' is visible
- Verify 'Log out' button is visible
```

Those three `Verify` lines do not ask the model anything. "URL contains /dashboard" is a literal URL check, "text 'Welcome back' is visible" is a real visibility assertion, and "'Log out' button is visible" resolves a button by its accessible name. When one fails, you get expected-versus-actual evidence in the `run_end.assertions` block and the human-readable `Result.md` assertion table, so you know the URL was `/login?error=invalid_state` instead of `/dashboard`, not just that something went wrong.

A `Verify` line that falls outside the supported grammar still runs, but agent-judged, and it is flagged `judged: true` in the output so you can always tell a deterministic pass from an AI-judged one. For an auth gate, keep the load-bearing checks inside the deterministic grammar. Save the judged checks for softer observations. Run it like any other test file with `browserbash testmd run ./tests/workos-login_test.md --agent`.

## Enterprise SSO connections

The reason many teams reach for WorkOS at all is enterprise SSO: a customer brings their own Okta, Entra ID, or Google Workspace, and WorkOS brokers the SAML or OIDC handshake. Testing that path is where selector-based scripts really fall apart, because the IdP's login page is a third party you do not control and cannot pin selectors against.

Plain English handles this gracefully because you describe the goal, not the markup. A test for an SSO-initiated login reads naturally:

```
# Enterprise SSO login

- Open https://app.example.com/login
- Enter {{SSO_EMAIL}} in the work email field
- Click 'Continue with SSO'
- On the identity provider page, enter {{IDP_USERNAME}} and {{IDP_PASSWORD}}
- Submit
- Verify URL contains /dashboard
- Verify text {{TENANT_NAME}} is visible
```

The agent recognizes the WorkOS email-first step, follows the redirect to whatever IdP the connection points at, fills the provider's own login form by intent, and follows the SAML or OIDC post back to your callback. Because you templated the tenant name, the same file works across staging tenants by swapping variables rather than rewriting steps.

One honesty note worth stating plainly: if your enterprise SSO connection depends on a real corporate IdP with hardware MFA or IP allowlisting, no automated tool drives that cleanly, and BrowserBash is no exception. Most teams point tests at a WorkOS test connection or a stub IdP that mirrors the redirect shape without the hardware factor, test the brokering and the callback deterministically, and leave the physical second factor to a manual smoke check.

### Handling the callback and session

The subtle failures in SSO are rarely on the IdP page. They are on the return trip: a state mismatch, a callback that sets no cookie, a redirect loop. Add explicit `Verify` steps for exactly those: check that the URL landed on your post-login route and not back on `/login`, and that a known authenticated element rendered. If you expose a `/api/me` endpoint, you can even seed and assert it deterministically, which brings us to hybrid testing.

## Magic links, passwordless, and hybrid API steps

WorkOS also offers magic-link and passwordless sign-in, and those flows have a wrinkle: the credential arrives in an inbox, out of band. You cannot click a link the browser has not received yet. This is where testmd version 2 earns its keep by letting deterministic API steps sit right next to plain-English UI steps in the same file, running one at a time against a single browser session.

```
---
version: 2
---

# Magic link login

- POST https://api.example.com/test/magic-link with body { "email": "{{MAGIC_EMAIL}}" }
- Expect status 200, store $.link as 'loginUrl'
- Open {{loginUrl}}
- Verify URL contains /dashboard
- Verify text 'Signed in' is visible
```

The `POST` and `Expect` lines never touch a model. They hit your test-only endpoint that mints the magic link (many teams expose one gated to non-production), capture the link out of the JSON response with a JSONPath, store it as a variable, and then the plain-English steps open that link and verify the result. You have turned an out-of-band, inbox-dependent flow into a deterministic, repeatable test. The API step seeds; the Verify step confirms through the real UI.

Two limits to set expectations honestly. testmd version 2 currently drives the builtin engine, which speaks the Anthropic API, so this hybrid mode needs an `ANTHROPIC_API_KEY` or a compatible gateway rather than a local Ollama model. And it needs a test endpoint you control to expose the link; you are not scraping a real Gmail inbox here. Within those bounds it is the cleanest way to test passwordless auth I have used, and the [testmd format and step types](https://browserbash.com/learn) docs cover the full grammar.

## Keep credentials out of every log

Auth testing lives or dies on secret hygiene. A test that leaks a WorkOS API key or a real user password into CI logs is worse than no test. BrowserBash was built with this assumption baked in rather than bolted on.

Every `{{variable}}` marked as a secret is masked as `*****` in every line the tool emits: NDJSON events, the `Result.md`, the local dashboard, all of it. Secrets are never baked into the replay cache either. On the default Stagehand engine, the objective carries a variables map and values are substituted at the last moment rather than pre-injected into the prompt. On the builtin engine, cached actions are re-templatized so the stored value becomes `{{name}}` again. Cached actions that type a secret are pinned to the origin they were recorded on and fail closed if replayed against a different origin, so a captured WorkOS password cannot be accidentally replayed against some other domain.

When you record a flow with the recorder, password fields never even leave the page. The capture script sends only a secret marker, and the generated step reads `Type {{password}} into ...` rather than the literal value. That means you can record a WorkOS login by clicking through it once and get a clean, credential-free test file out the other side. Run `browserbash record https://app.example.com/login`, click through the sign-in, press Ctrl-C, and you have a plain-English test with templated secrets ready to commit.

## Running WorkOS auth tests in CI

A login test that only runs on your laptop protects nothing. The point is to gate deploys. BrowserBash emits NDJSON under `--agent` and uses honest exit codes: `0` passed, `1` failed, `2` error or infra or budget stop, `3` timeout. Your CI reads the exit code and the presence of a `run_end` event. No prose parsing, no scraping human output.

For a whole folder of auth tests, use the orchestrator, which sizes its own concurrency from real CPU and RAM and orders previously-failed and slowest tests first so failures surface early:

```bash
browserbash run-all ./tests/auth --junit out/junit.xml --shard 2/4 --budget-usd 2
```

The `--shard 2/4` slice is computed on sorted discovery order, so four CI machines each take a deterministic quarter of the suite without coordinating. The `--budget-usd 2` cap stops launching new tests once estimated spend crosses the limit, marks the rest `skipped`, and exits `2`, a real guard against a runaway suite on a hosted model. If you prefer the packaged path, the official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) installs the CLI, runs the suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with the verdict table.

### Table: which mode for which WorkOS flow

| WorkOS flow | Best BrowserBash approach | Why |
| --- | --- | --- |
| AuthKit email + password | Plain-English test file with `Verify` steps | Intent survives AuthKit redesigns; deterministic gate |
| Enterprise SSO (SAML/OIDC) | Plain English against a test connection or stub IdP | Third-party IdP markup is not yours to pin |
| Magic link / passwordless | testmd v2 API step to mint link, then UI `Verify` | Out-of-band credential seeded deterministically |
| Protected routes behind login | `browserbash auth save` then `--auth` | Skip the login tax on every downstream test |
| Always-on login health check | `browserbash monitor --every 10m --notify` | Alerts only on pass to fail state changes |

## Monitoring auth in production

Testing at deploy time catches regressions you introduce. It does not catch the WorkOS-side change, the expired SSO certificate, or the DNS hiccup that breaks login at 3 a.m. For that, run the same login test on a schedule with `browserbash monitor ./tests/workos-login_test.md --every 10m --notify <slack-webhook>`.

Monitor mode runs the test on an interval and alerts only when the verdict flips: pass to fail when login breaks, and fail back to pass when it recovers. It does not spam you on every green run. Slack incoming-webhook URLs get Slack-friendly formatting automatically; any other URL receives the raw JSON payload so you can route it into PagerDuty or your own handler. Because the replay cache lets a green run replay its recorded actions with zero model calls, an always-on auth monitor is nearly token-free until the page actually changes and the agent has to step back in.

The honest caveat: for the SSO-certificate-expiry case, monitor the full cold login (no `--auth`) so the redirect chain is actually exercised. A monitor running on a saved session only tells you the app behind login is up, not that login itself still works.

## When plain-English testing is the right call, and when it is not

BrowserBash is a strong fit when your WorkOS UI changes often, when you are tired of AuthKit and IdP selector churn, when non-engineers on the team need to read and even write auth tests, or when an AI coding agent needs a validation layer it can call over MCP to confirm a login flow it just built. Describing intent instead of markup is genuinely more durable for third-party auth screens you do not control.

It is not the right call for everything. If you need to assert against a raw SAML assertion's XML, decode a JWT claim by claim, or unit-test your callback handler's exact state parameter, that is API and integration territory, and a Playwright or Vitest test against your own endpoints is the better tool. BrowserBash validates the flow a user actually experiences; it does not replace protocol-level tests of the auth machinery itself. Use it for the browser journey and keep your unit tests for the cryptographic plumbing.

There is also the local-model honesty point. BrowserBash defaults to free local models, which is great for cost and privacy, but very small models (around 8B and under) can get flaky on long multi-step objectives like a full SSO redirect chain. The sweet spot for hard auth flows is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. A simple email-password login is fine on a small model; a five-hop enterprise SSO test deserves a stronger one.

If you are weighing this against writing raw Playwright, the [features overview](https://browserbash.com/features) lays out the engines and providers, and the [open-source repo](https://github.com/PramodDutta/browserbash) is Apache-2.0 so you can read exactly how the Verify grammar and secret masking work before you trust them with real credentials.

A healthy WorkOS test setup usually ends up looking like this. One cold end-to-end test drives AuthKit through the redirect to the dashboard, with deterministic `Verify` steps as the gate. One or two SSO tests hit a test connection or stub IdP and confirm the callback lands correctly. A magic-link test uses a testmd v2 API step to mint the link and a UI `Verify` to confirm it works. Everything else uses a saved `--auth` profile so it starts logged in and stays fast, and a monitor runs the cold login every ten minutes in production. That is a full authentication safety net written in language your whole team can read, with secrets masked at every layer and the load-bearing assertions pinned to real checks instead of an AI's judgment.

## FAQ

### Can BrowserBash test WorkOS SSO with a real enterprise identity provider?

It can drive the browser side of an SSO flow, including following the redirect to the identity provider and filling that provider's login form by intent. The practical limit is hardware MFA and IP allowlisting: no automation tool cleanly drives a physical security key. Most teams point tests at a WorkOS test connection or a stub IdP that mirrors the redirect shape, verify the callback and session deterministically, and leave the physical second factor to a manual smoke check.

### How do I keep WorkOS credentials out of my test logs?

Use templated `{{variables}}` and mark them as secrets. BrowserBash masks secret values as five asterisks in every line it emits, including NDJSON events, the Result.md, and the local dashboard. Secrets are never baked into the replay cache, and cached actions that type a secret are pinned to the origin they were recorded on, so a captured password cannot be replayed against a different domain.

### Do I have to log in on every single auth test?

No, and you should not. Run `browserbash auth save` once to complete the WorkOS login by hand and capture the session, then pass `--auth <name>` on any run, test file, suite, or monitor to start already authenticated. Keep at least one cold test that drives the full login flow without a saved profile, so a broken AuthKit or callback configuration still fails your suite.

### Does a plain-English pass actually mean the check held, or is it an AI guessing?

For the checks that matter, it is not a guess. `Verify` steps compile to real Playwright assertions with no model judgment: URL contains, text visible, named button or link visible, element counts, and stored-value equality. A pass means the condition held, and a fail comes with expected-versus-actual evidence. Verify lines outside the supported grammar still run but are flagged `judged: true` so you can always tell a deterministic result from an AI-judged one.

Ready to test WorkOS auth without the selector churn? Install the CLI with `npm install -g browserbash-cli` and write your first login test in plain English today. An account is optional and everything runs locally by default, but if you want hosted dashboards and monitoring you can [sign up here](https://browserbash.com/sign-up).
