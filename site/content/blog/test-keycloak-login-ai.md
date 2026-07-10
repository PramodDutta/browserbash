---
title: Test a Keycloak Login Flow With Plain-English AI
description: "Learn how to test Keycloak login flows with plain-English AI: the hosted redirect, secrets via variables, and an honest take on realm and MFA limits."
date: 2026-05-16
category: security
---

If you run Keycloak, you already know the login is not a form on your own page. To test Keycloak login the way a real user experiences it, you have to leave your app, land on the Keycloak-hosted sign-in page, submit credentials against a realm, and then follow the redirect back with a token in hand. Selector-based tests break the moment Keycloak ships a new theme or reorders a field, and they say nothing about whether the round trip actually completed. This guide shows a different approach: describe the flow in plain English, let an AI agent drive a real browser through the redirect, and get a deterministic verdict at the end.

The tool here is [BrowserBash](https://browserbash.com/features), a free, open-source natural-language browser automation CLI from The Testing Academy. You write an objective in English, an agent drives Chrome step by step with no page objects, and you get back a pass or fail plus structured results. I will walk through the realistic parts of testing a Keycloak-hosted login, how to keep credentials out of your logs with variables, and I will be honest about the pieces of Keycloak (realm provisioning, MFA, custom SPIs) that no browser-level test should pretend to own.

## Why Keycloak login is harder to test than a normal form

A plain login form lives on one origin. You fill two fields, click a button, and assert you landed on a dashboard. Keycloak breaks almost every assumption in that sentence.

First, there is a redirect. Your app at `app.example.com` sends the browser to `auth.example.com/realms/your-realm/protocol/openid-connect/auth` with a client ID, a redirect URI, a state parameter, and a scope. The user never sees your login markup. They see the Keycloak theme.

Second, the return trip matters as much as the credentials. A successful Keycloak login is not "the password was accepted." It is "Keycloak redirected the browser back to the registered redirect URI, the app exchanged the code for a token, and the authenticated view rendered." A test that stops at the password screen misses the half of the flow most likely to break in production, which is the callback and token handling.

Third, Keycloak themes change. Teams restyle the login page, add social login buttons, move the "Remember me" checkbox, or switch to a passwordless option. Any test pinned to `#username` or a nth-child CSS path is one theme deploy away from a false failure.

This is exactly the surface where intent-based testing earns its keep. When you say "log in as the test user and confirm you land back on the dashboard," you are describing the outcome, not the DOM. The agent finds the username field whether Keycloak calls it `username`, `email`, or renders it inside a shadow root. If you are new to the tool, the [tutorials](https://browserbash.com/tutorials) walk through the basics before you tackle a redirecting auth flow.

## What "test Keycloak login" actually means end to end

Before writing anything, get precise about the flow you want to cover. A realistic Keycloak login test has five observable stages:

1. The app renders a "Sign in" entry point and the browser is on your application origin.
2. Clicking it (or hitting a protected route) redirects to the Keycloak-hosted login on the auth origin.
3. Credentials are entered against a specific realm and submitted.
4. Keycloak validates, then redirects back to the registered redirect URI with an authorization code.
5. The app exchanges the code and shows the authenticated state.

An honest test asserts on stages 1, 2, 4, and 5. Stage 3 is the credential submission, and you want it to run without ever printing the password. The two stages people forget are 2 and 4: confirming you actually left for the auth host, and confirming you actually came back. Those two checks catch misconfigured redirect URIs, wrong client IDs, and CORS problems that a "did the dashboard load" assertion alone will happily paper over on a cached session.

## Your first plain-English Keycloak login test

Install the CLI once and you have the `browserbash` command. Ollama-first defaults mean it will reach for a free local model before any hosted key, so you can run this with nothing leaving your machine.

```bash
npm install -g browserbash-cli

browserbash run "Open https://app.example.com, click 'Sign in', \
wait to be redirected to the Keycloak login page, \
type {{KC_USER}} into the username field, \
type {{KC_PASSWORD}} into the password field, \
click 'Sign In', then confirm you are redirected back to the dashboard" \
  --agent --headless --timeout 120
```

A few things are doing real work here. The `{{KC_USER}}` and `{{KC_PASSWORD}}` tokens are variables, not literals, so your test text is safe to commit. The `--agent` flag emits NDJSON, one JSON event per line, which is what you want in CI so nothing has to parse prose. The `--headless` flag runs without a visible window, and `--timeout 120` bounds the whole objective so a hung redirect fails cleanly instead of hanging your pipeline.

Notice that the objective explicitly names the redirect twice: "wait to be redirected to the Keycloak login page" and "confirm you are redirected back to the dashboard." That is deliberate. You are encoding stages 2 and 4 as intent so the agent checks the round trip, not just the credential entry.

**Keeping credentials out of your logs.** Never bake a real password into a command or a committed file. BrowserBash treats variables as first-class, and secret-marked variables are masked as `*****` in every log line the tool writes. Set them from your environment or a variables file:

```bash
export KC_USER="qa.bot@example.com"
export KC_PASSWORD="use-a-throwaway-realm-account"

browserbash run "Log in to https://app.example.com through Keycloak as \
{{KC_USER}} with password {{KC_PASSWORD}} and verify the account menu \
shows 'qa.bot'" --agent --headless
```

Because the secret is a variable, it does not appear in the objective string that gets journaled, and it does not appear in the replay cache. On the built-in engine, any value that came from a secret is re-templatized back to `{{KC_PASSWORD}}` before an action is ever cached, and secret-typing actions are origin-pinned so a cached "type password" step will not fire on the wrong host. That last property matters a lot for Keycloak, because you are typing the password on the auth origin, not your app origin, and you never want that action replayed anywhere else.

## Making the login committable with a Markdown test file

One-off commands are fine for exploration, but a login flow you care about belongs in a committed test. BrowserBash uses `*_test.md` files: a title, English steps, `{{variables}}`, and `@import` composition. Here is a `keycloak_login_test.md`:

```bash
# Keycloak login round trip

- Open https://app.example.com
- Click the "Sign in" button
- Verify the URL contains "auth.example.com/realms/customer-portal"
- Type {{KC_USER}} into the username field
- Type {{KC_PASSWORD}} into the password field
- Click "Sign In"
- Verify the URL contains "app.example.com/dashboard"
- Verify text "Signed in as qa.bot" is visible
```

Run it with the `testmd` command:

```bash
browserbash testmd run ./.browserbash/tests/keycloak_login_test.md --agent
```

The two `Verify the URL contains ...` lines are not agent guesses. Verify steps compile to real Playwright checks with no LLM judgment: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, and stored-value equality. The first Verify confirms stage 2 (you actually reached the auth host and the right realm path), and the second confirms stage 4 (you actually returned to your app). A pass means the condition held; a fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table the tool writes after every run.

This split is the whole point. The credential entry and button clicks are agent-driven and resilient to theme changes. The redirect assertions are deterministic and will tell you exactly what URL you landed on when they fail. You get flexibility where the DOM shifts and precision where correctness must be exact. The [learn hub](https://browserbash.com/learn) goes deeper on the Verify grammar if you want to push more of the flow into deterministic checks.

## Reusing a saved Keycloak session instead of logging in every test

Most suites do not want to perform the full interactive login on every single test. That re-login tax is slow, and it hammers your realm with auth requests that have nothing to do with the feature under test. BrowserBash has saved logins for exactly this.

```bash
browserbash auth save keycloak-qa --url https://app.example.com
```

That opens a browser, you complete the Keycloak login once by hand (including any MFA prompt), press Enter, and the session is saved as a Playwright storageState profile. Every later run reuses it:

```bash
browserbash run "Open https://app.example.com/settings and verify the \
'Danger zone' heading is visible" --auth keycloak-qa --agent --headless
```

Now your feature tests start already authenticated, and you keep one dedicated `keycloak_login_test.md` that exercises the actual login path. If a saved profile does not cover the origin your test starts on, BrowserBash prints a warning instead of silently proceeding as if you were logged in, which saves you from chasing a phantom "unauthenticated" failure. You can attach `--auth` to `run`, `testmd`, `run-all`, and `monitor`, or set it as `auth:` frontmatter inside a test file so the profile travels with the test.

One honest caveat: a saved session is only as fresh as its tokens. Keycloak access tokens are short-lived and refresh tokens expire on the realm's schedule. When a profile goes stale you re-run `auth save` to refresh it. That is a fair trade for skipping the interactive login on the ninety tests that are not about login.

## The parts of Keycloak you should NOT try to automate this way

Credibility matters more than a clean demo, so here is the honest boundary. A browser-driven, intent-based test is the right tool for the human-facing login round trip. It is the wrong tool for several things Keycloak owns, and pretending otherwise sets you up for flaky, brittle suites.

Realm and client provisioning is configuration, not a user flow. Creating a realm, registering a client, setting the redirect URI allow-list, and defining roles should be done through the Keycloak Admin REST API or a declarative import, seeded before the browser test ever opens. Driving the admin console with an AI agent to set up a realm is slow, fragile, and untestable in any deterministic sense.

MFA and step-up authentication are only partly automatable, and how far you get is not publicly guaranteed to be stable across Keycloak versions. TOTP can sometimes be scripted if you control the shared secret and generate the code yourself, but WebAuthn, hardware keys, and SMS or email OTP involve out-of-band factors that a headless browser cannot satisfy on its own. The honest pattern is to test MFA once interactively, save that session with `auth save`, and reuse it, rather than trying to solve a hardware key inside a CI runner.

Custom authenticators, required actions, and identity-provider federation (logging in through Google, GitHub, or a corporate SAML IdP by way of Keycloak) each pull in a third party you do not control. You can test that your Keycloak instance redirects to the external IdP correctly, but automating the external IdP's own login is its own problem and often against that provider's terms for bots.

Token internals belong to API tests. Whether the access token carries the right claims, whether the audience is correct, whether the refresh rotation behaves, all of that is better asserted against the token endpoint directly than inferred from a rendered page.

So the rule of thumb: use plain-English browser tests for the login round trip a real user performs, seed everything else through the Admin API, and assert token internals with direct API calls. BrowserBash is genuinely good at the first job and deliberately not trying to be the tool for the other two.

## Hybrid tests: seed with an API step, verify through the UI

There is a middle ground that fits Keycloak testing well. testmd v2 lets a single test file mix deterministic API steps with agent-driven UI steps against one browser session. That means you can seed a user through the Keycloak Admin API, then log in as that user through the real UI, all in one committed file.

Add `version: 2` to the frontmatter and the steps execute one at a time. API steps (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) run with no model at all and can store values from the response for later steps to use.

```bash
---
version: 2
---

# Seed a Keycloak user, then log in through the UI

- POST https://auth.example.com/admin/realms/customer-portal/users with body {"username":"{{NEW_USER}}","enabled":true,"credentials":[{"type":"password","value":"{{NEW_PASSWORD}}","temporary":false}]}
- Expect status 201
- Open https://app.example.com and click "Sign in"
- Verify the URL contains "auth.example.com/realms/customer-portal"
- Type {{NEW_USER}} into the username field
- Type {{NEW_PASSWORD}} into the password field
- Click "Sign In"
- Verify the URL contains "app.example.com/dashboard"
```

The API step seeds the account deterministically and never touches a model. The English steps that follow log in as that freshly created user and check the redirect back. Consecutive plain-English steps run as grouped agent blocks on the same page, so the login sequence flows naturally.

Two honest notes on v2. It currently drives the built-in engine, which speaks the Anthropic API (or an `ANTHROPIC_BASE_URL` gateway), so this hybrid mode is not yet available on Ollama or OpenRouter directly. And your POST above needs an admin token in the header, which you would supply through variables the same way you handle credentials. The point stands: for setup-then-verify, you seed state without a model and check it through the UI with one.

## Running Keycloak login checks in CI and as an always-on monitor

A login test earns its keep when it runs on every deploy and again on a schedule. For CI, the `--agent` NDJSON output and the frozen exit codes are all you need: 0 passed, 1 failed, 2 error or infra or budget stop, 3 timeout. No prose parsing, no scraping stdout for the word "PASS."

For a whole folder of auth tests across shards, `run-all` gives you a memory-aware parallel orchestrator with a budget guard:

```bash
browserbash run-all .browserbash/tests --shard 1/2 --budget-usd 2 \
  --junit out/junit.xml --agent
```

The `--shard 1/2` slice is computed on sorted discovery order, so two CI machines agree on who runs what without coordinating. The `--budget-usd 2` stops launching new tests once estimated spend crosses the cap, reports the remainder as skipped, and exits 2, which keeps a runaway auth loop from quietly burning tokens.

For production confidence, monitor mode watches the live login and alerts only when the pass or fail state changes, in either direction, never on every green run:

```bash
browserbash monitor ./.browserbash/tests/keycloak_login_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

If your Keycloak realm goes down, a certificate expires, or someone breaks the redirect URI allow-list, you find out from Slack in ten minutes rather than from a user. Because the replay cache lets a green run replay its recorded actions with zero model calls, an always-on login monitor is nearly token-free until the page actually changes and the agent steps back in. The official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wires the same suite into pull requests with a self-updating verdict comment if you would rather gate merges than poll.

## When plain-English AI testing is the right call for Keycloak

Here is the balanced read. Intent-based browser testing is the right choice when you want to cover the human login round trip, when your Keycloak theme changes often enough that selector tests are a maintenance drag, and when you value a deterministic verdict your AI coding agents and CI can consume without parsing prose. It is especially strong for smoke-testing the redirect on every deploy and monitoring it in production.

It is the wrong choice, or at least not the whole answer, when your real need is realm provisioning (use the Admin API), token claim validation (use direct API assertions), or automating a hardware MFA factor (there is no honest way around the out-of-band device). And a fair caveat on the free local-model story: very small local models around 8B parameters and under can get flaky on long multi-step objectives like a full redirecting login. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows.

| Testing need | Plain-English browser test | Better handled elsewhere |
| --- | --- | --- |
| Login redirect round trip | Strong fit | |
| Theme-resilient credential entry | Strong fit | |
| Deterministic redirect assertions | Verify steps | |
| Realm and client provisioning | | Admin REST API or declarative import |
| Token claims and audience | | Direct API tests against token endpoint |
| Hardware MFA and WebAuthn | Save session once, reuse | Out-of-band, not fully automatable |
| External IdP federation login | Test the redirect only | The IdP's own login is out of scope |

Use the tool for what it is genuinely good at, seed and assert everything else with the mechanisms Keycloak already gives you, and your login suite stays fast, honest, and hard to break. The [case studies](https://browserbash.com/case-study) show how teams combine these layers in practice.

## FAQ

### How do I test a Keycloak login without hardcoding the password?

Store the password as a secret-marked variable and reference it as `{{KC_PASSWORD}}` in your objective or test file. BrowserBash masks secret variables as five asterisks in every log line it writes, and on the built-in engine it re-templatizes the value back to the variable name before any action is cached. Set the variable from your environment or a variables file so nothing sensitive is ever committed or journaled.

### Can an AI agent follow the Keycloak redirect back to my app?

Yes, and you should make that the point of the test. Because the agent drives a real Chrome browser, it follows the redirect to the Keycloak-hosted login and the redirect back to your registered redirect URI just like a user's browser does. Encode both hops explicitly, for example a Verify step that the URL contains your realm path on the way out and another that it contains your dashboard path on the way back, so the round trip itself is asserted.

### Does this handle multi-factor authentication on Keycloak?

Only partially, and honestly the out-of-band factors are the limit. A headless browser cannot satisfy a hardware security key or an SMS or email one-time code on its own. The practical pattern is to complete MFA once interactively with the auth save command, which stores the authenticated session, and then reuse that saved profile with the auth flag on later tests instead of trying to solve the second factor in CI.

### What is the difference between a Verify step and a normal English step?

A normal English step is agent-driven: the AI figures out how to accomplish it against whatever the page currently looks like, which is what makes it resilient to Keycloak theme changes. A Verify step compiles to a real Playwright check with no model judgment, so URL-contains, text-visible, and element-count assertions either hold or fail with expected-versus-actual evidence. Use English steps for the resilient credential entry and Verify steps for the exact redirect and authenticated-state assertions.

Ready to test your Keycloak login by intent instead of by selector? Install with `npm install -g browserbash-cli`, write your first `keycloak_login_test.md`, and run it in a minute. An account is optional and everything runs locally by default, but if you want hosted retention and dashboards you can [sign up here](https://browserbash.com/sign-up).
