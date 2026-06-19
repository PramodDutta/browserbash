---
title: Test OAuth and SSO login with AI
description: "Learn how to test OAuth login and SSO flows with AI by driving a real Chrome browser through Google sign-in in plain English with BrowserBash."
date: 2026-05-22
category: use-case
---

Ask any SDET which test breaks the most and they'll say the same thing: the one that has to test OAuth login. The "Sign in with Google" button looks like one click, but behind it sits a redirect to `accounts.google.com`, a consent screen that changes by region and browser, a password field, sometimes a 2FA prompt, and a redirect back to your app with a token in the URL. Every one of those hops is a chance for a hardcoded selector to drift. This guide walks through a different approach: you describe the Google sign-in journey in plain English, an AI agent drives a real Chrome browser through it, and you get a pass or fail verdict plus the values it saw. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command here is real.

There are two reasons OAuth tests rot. First, you don't own the identity provider's UI — Google can reshuffle its consent page tomorrow and your `data-testid` map is worthless. Second, the flow crosses domains your framework treats as foreign territory, with popups, full-page redirects, and bot-detection heuristics watching for exactly the kind of headless automation you're running. Intent-based AI testing doesn't make those problems disappear, but it changes how you fight them.

## What "test OAuth login" actually means

OAuth, SSO, SAML, and OIDC get used interchangeably in standups, and the sloppiness leaks into test design. A quick, honest separation helps you decide what you're even testing.

OAuth 2.0 is an *authorization* protocol: it lets your app get limited access to a user's resources without ever seeing their password. OpenID Connect (OIDC) is a thin authentication layer on top of OAuth 2.0 — it's what "Sign in with Google" actually uses, because plain OAuth tells you what an app may access, not who the user is. SAML is the older XML-based protocol that still dominates enterprise SSO. SSO ("single sign-on") is the user-facing outcome — one set of credentials, many apps — that any of these protocols can deliver.

For a browser test, the protocol underneath matters less than the *shape* of the flow on screen. From the user's seat, almost every social or enterprise login looks like this:

1. Click a "Sign in with Google" (or Microsoft, Okta, GitHub) button on your app.
2. Get redirected to the identity provider, or have a popup open.
3. Enter an email, then a password, on a domain you don't control.
4. Possibly clear a 2FA challenge or a consent screen.
5. Get redirected back to your app, now authenticated, landing on a dashboard or home screen.

When people say they want to test OAuth login end to end, this is the journey they mean. The token exchange, the PKCE handshake, the `state` parameter validation are real and important, but they happen server-to-server and are better covered by integration tests against your callback endpoint. The browser test's job is to prove that a human clicking that button ends up logged in. That's the slice we'll automate.

### Where browser tests fit, and where they don't

Be honest with yourself about the test pyramid here. Driving a real identity provider through its UI on every pull request is a bad idea, and the OAuth community has said so for years: real providers have rate limits, bot detection, and consent screens that vary by region and browser, which makes UI-level OAuth tests slow and flaky. The widely recommended split is to mock the provider for fast feature tests and run real-provider tests on a schedule, not in the PR gate.

So the AI-driven flow here is your *scheduled, real-provider smoke test* — the nightly or hourly run that catches "Google changed their consent page and our redirect broke" before a user does. It is not a replacement for mocked unit tests, and a live Google login does not belong in a blocking CI gate. We'll come back to that with a concrete pattern later.

## Why selector-based OAuth tests are so fragile

If you've automated a Google login in Cypress or Playwright, you already know the pain. Let me name the specific failure modes, because the AI approach is best understood as a direct answer to each one.

**You don't own the markup.** Your selectors for the email field and the "Next" button live on Google's pages. Google ships UI changes whenever it wants, and it maintains multiple variants of the consent and sign-in pages that differ by region, by browser, and by whether you're headless. A locator that's green in your CI's data center can be red from a developer's laptop in another country. Nothing in your repo changed; the test broke anyway.

**The flow leaves your origin.** Some frameworks historically struggled to drive a different domain or a popup window mid-test. Modern tools handle cross-origin navigation better, but the popup variant of the Google flow — sign-in in a second window that posts a message back to the opener — is still a classic source of "element not found" when the test is looking at the wrong window.

**Bot detection fights you.** Google's sign-in is explicitly engineered to make scripted use hard. Run a vanilla headless browser through it and you can trip extra verification: a phone challenge, a CAPTCHA, an "unusual activity" interstitial. These appear *intermittently* — the worst kind of flake, where the test passes ten times then fails once for reasons unrelated to your code.

**Secrets leak.** A login test types a real password. In a naive script that password ends up in shell history, in CI logs, and in archived run transcripts that outlive the test by months. This is a security problem, not a cosmetic one, and it's separate from the flakiness problem.

Intent-based AI testing addresses the first two head-on and gives you tooling for the fourth. The third — bot detection — is a constraint no tool magics away, and the honest move is to plan around it. We'll do that.

## How BrowserBash drives an OAuth login

BrowserBash is a natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome browser step by step — no selectors, no page objects — and it returns a verdict plus any values it extracted. Because the agent re-reads the live page on every step the way a person would, a relocated "Next" button on Google's side is something it adapts to, not something that snaps a hardcoded locator.

Install it from npm (you need Node 18+ and Chrome):

```bash
npm install -g browserbash-cli
```

The model story is Ollama-first, and it directly affects whether a long OAuth flow succeeds. By default the `--model` is `auto`, which resolves in order: a local [Ollama](https://ollama.com) install (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (Claude), then `OPENAI_API_KEY` (GPT-4.1), otherwise it errors with guidance. On local models your model bill is guaranteed $0 and no page content is sent to a cloud API — a real consideration when those pages contain a live credential.

Here's the honest caveat, and it matters more for OAuth than for a simple form fill: very small local models (8B and under) get flaky on long, multi-step objectives, and a Google sign-in is exactly that — five or six dependent steps across two domains. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the hardest flows. If your OAuth test wanders or gives up halfway, the model is the first thing to upsize, not the prompt.

A first, naive attempt looks like this:

```bash
browserbash run "Go to https://app.example.com, click 'Sign in with Google', \
sign in with email tester@example.com and the provided password, \
and confirm you land on the dashboard with the user's avatar visible" \
--record
```

The `--record` flag captures a screenshot and a `.webm` session video (via bundled ffmpeg) so you can watch exactly where the agent went — invaluable the first time you debug an OAuth redirect that didn't come back. With the `builtin` engine you also get a Playwright trace.

But you don't want a real password sitting in your shell history like that. The next section fixes it.

## Keeping the password out of every log line

BrowserBash has committable markdown tests for this. A `*_test.md` file is a list where each item is a step, supports `{{variables}}` templating and `@import` composition, and — the part that matters for credentials — variables you mark as secret are masked as `*****` in every log line, in the on-disk run store, and in the human-readable `Result.md` it writes after each run.

A Google sign-in test as a committable file might read:

```bash
browserbash testmd run ./google_sso_test.md
```

Inside `google_sso_test.md`, the steps are plain English and the credential is a secret-marked variable, so the actual password never appears in output. You commit the test logic to your repo; you keep the secret in your CI's secret store and pass it in. That separation is the whole point — the *what* (log in via Google, land on the dashboard) lives in version control, and the *value* (the password, the TOTP seed) lives somewhere encrypted.

This solves the fourth fragility from earlier. Every run is stored on-disk at `~/.browserbash/runs` with secrets masked and capped at the last 200 runs, so you get history without leaking. Nothing is uploaded anywhere unless you explicitly opt in with `--upload` after linking a cloud account — by default the whole thing is local.

## Handling the parts that fight back: 2FA, popups, and bot detection

This is where an honest guide separates itself from a demo. A real Google account suitable for testing has 2FA, the flow sometimes opens a popup, and the provider is actively trying to detect automation. Here's how to deal with each without pretending the problems don't exist.

### Test accounts and 2FA

Use a dedicated test Google account, never a real human's. The community-standard setup is a test account with 2FA enabled where the second factor is a TOTP (time-based one-time password), because TOTP can be generated programmatically from a shared secret rather than waiting on an SMS. You store that TOTP seed the same way you store the password — as a secret-marked variable — and your test step says, in plain English, to enter the current 6-digit code. The agent reads the field and types the value you supply.

A blunt truth: authenticate as rarely as you can. The standard advice for any automated login against a real provider is to keep fresh authentications low and reuse a session where possible, because every interactive login is another roll of the bot-detection dice. If your suite needs a logged-in state for twenty journeys, you do *not* want to drive the full Google flow twenty times.

### Popup vs. redirect

If your app uses the popup variant of Google sign-in, say so in the objective. A line like "a Google sign-in popup will open; complete the login there and wait to be redirected back to the app" gives the agent the context it needs to expect a second window. Because you're describing intent rather than pinning a window handle, you're not hardcoding the popup's existence — you're telling the agent what to anticipate. If your app uses full-page redirect instead, the agent simply follows the navigation; no special handling needed.

### Bot detection — the constraint you plan around

No browser-automation tool, AI or not, makes Google's anti-automation heuristics vanish. If your test trips an "unusual activity" challenge, that's the provider doing its job, and the fix is operational, not a flag you flip:

- Use a stable, dedicated test account that has logged in from your CI's network before, so the location isn't novel every run.
- Prefer running non-headless where you can. Headless browsers are a known detection signal; the `--record` flag works in headed mode and gives you video either way. Add `--headless` only when you've confirmed your target flow tolerates it.
- Run real-provider tests on a schedule, not on every commit, so you're not hammering the provider and inviting rate limits.
- For genuinely hostile flows, fall back to a mocked OAuth provider or a test-mode bypass in your own app for the PR gate, and reserve the live Google run for the nightly smoke test.

That last point bears repeating because it's the single most important design decision: **don't put a live third-party login in a blocking gate.** Use it as a scheduled canary. BrowserBash makes the canary easy to write and easy to read; it can't repeal Google's bot policy, and any tool claiming otherwise is overselling.

## A CI-ready agent run

When you do run the scheduled OAuth check in CI, you want machine-readable output, not prose your pipeline has to parse. The `--agent` flag emits NDJSON — one JSON object per line — so an AI coding agent or a plain CI script can consume it cleanly:

```bash
browserbash run "Open https://app.example.com, sign in with Google using the \
provided test credentials, and verify the account menu shows the test user's name" \
--agent --timeout 180
```

Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`. The terminal event is a single `run_end` object with `status` of `passed`, `failed`, `error`, or `timeout`, a summary, and a `final_state`. Exit codes map straight to pipeline logic: `0` passed, `1` failed, `2` error, `3` timeout. Your nightly job runs the command, checks the exit code, and pages someone only when a real login break — not a transient Google challenge — shows up. The `--timeout` here is generous on purpose; OAuth round-trips through 2FA take longer than a local form fill, and a too-tight timeout produces false `timeout` results.

If you'd rather watch runs in a UI, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` with no account required. There's also an opt-in cloud dashboard — `browserbash connect --key bb_...` then `--upload` per run — where free cloud runs are kept 15 days. Both are optional; the CLI does its job with neither.

## Engines and providers: choosing the right combination

Two knobs decide *how* the English gets interpreted and *where* the browser runs, and for OAuth flows the choices have practical consequences.

The **engine** is who reads your English. `stagehand` is the default — MIT-licensed, from Browserbase, with act/extract/observe/agent primitives and self-healing behavior well suited to the shifting pages of an identity provider. `builtin` is an in-repo Anthropic tool-use loop driving Playwright; it's used automatically for LambdaTest and BrowserStack, and writes a Playwright trace when you record. Switch with `--engine stagehand|builtin`.

The **provider** is where Chrome actually runs:

| Provider | Flag | What it needs | Good fit for OAuth |
| --- | --- | --- | --- |
| `local` | default | your own Chrome | First choice — headed, real browser, least likely to look like a bot |
| `cdp` | `--cdp-endpoint ws://...` | any DevTools endpoint | A browser you've pre-warmed with a logged-in session |
| `browserbase` | `--provider browserbase` | `BROWSERBASE_API_KEY` + project ID | Cloud browsers when you can't run Chrome locally |
| `lambdatest` | `--provider lambdatest` | `LT_USERNAME` + `LT_ACCESS_KEY` | Cross-browser coverage (auto `builtin` engine) |
| `browserstack` | `--provider browserstack` | `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` | Cross-browser coverage (auto `builtin` engine) |

For most OAuth smoke tests, the default `local` provider with the `stagehand` engine is the right call: a real Chrome on a machine you control is the friendliest profile to present to a bot detector. Reach for `cdp` when you want to attach to a browser that already holds a session — a neat way to *avoid* re-authenticating, the behavior providers reward. Cross-browser grids like LambdaTest and BrowserStack are about coverage breadth, not about making the OAuth dance easier.

You can pin the LLM independently of all this with `--model`: `ollama/qwen3` for local, `claude-opus-4-8` with an Anthropic key, `openai/gpt-4.1` or `google/gemini-2.5-flash` through Stagehand, or an OpenRouter model like `openrouter/meta-llama/llama-3.3-70b-instruct`. For a six-step OAuth flow, pin a capable model rather than leaving a tiny local one to flail.

## When AI-driven OAuth testing is the right tool

Balanced advice means naming where this shines and where it doesn't.

**Reach for it when:** your OAuth UI changes often and your selector-based login test is the flakiest thing in the suite; you want a committable, plain-English smoke test that a non-specialist can read; you need a scheduled real-provider canary that catches "Google changed their page" before customers do; or you want local, $0, private runs where a live credential never leaves your machine.

**Stick with what you have when:** you're testing the token exchange, PKCE, or `state` validation itself — those are server-side and belong in integration tests against your callback, not in a browser test. Use a **mocked** OAuth provider for your fast PR-gate feature tests; it's faster, deterministic, and doesn't fight bot detection. And if your existing Playwright suite already logs in reliably via stored `auth.json` session reuse and you're happy with it, there's no prize for rewriting a green test.

The strongest setup is layered, not either-or: mocked provider for the blocking gate, AI-driven real-Google run on a schedule, and integration tests for the protocol internals. BrowserBash slots cleanly into the middle layer, which is precisely the layer selector scripts handle worst.

If you're new to the tool, the [tutorials](https://browserbash.com/tutorials) walk through first runs, the [learn](https://browserbash.com/learn) section covers the concepts, and the [features](https://browserbash.com/features) page lists what each engine and provider can do. The source is on [GitHub](https://github.com/PramodDutta/browserbash) and the package is on [npm](https://www.npmjs.com/package/browserbash-cli).

## A realistic end-to-end example

Let's tie it together with the Google sign-in flow as a test, the way you'd actually ship it. The committable markdown test describes the journey; the secret-marked variables hold the credential and TOTP seed; the run is local and headed for the best shot at clearing bot detection; and the output is recorded so a failure is debuggable.

```bash
browserbash testmd run ./google_sso_smoke_test.md --record
```

The steps inside read like instructions for a careful manual tester: open the app, click the Google sign-in button, enter the test email, click next, enter the secret password, handle the 2FA prompt with the current code, wait for the redirect, and assert the dashboard shows the test user's name. Because each step is intent, a renamed button or reshuffled consent screen is the agent's problem to solve, not yours to chase through a diff. Because the credential is a secret variable, `Result.md` and every log line show `*****` where the password was. And because you run it on a schedule against a warmed-up test account in headed mode, you've stacked the deck against the bot-detection flakiness that sinks naive scripts.

That's the shape of testing OAuth login with AI that holds up in practice: not a magic button, but a readable, resilient smoke test layered on top of mocked PR-gate tests and server-side integration checks. The [case studies](https://browserbash.com/case-study) and [pricing](https://browserbash.com/pricing) pages cover where teams take it next.

## FAQ

### Can you automate a Google OAuth login for testing?

Yes, you can drive the real Google sign-in UI through a browser with BrowserBash, entering the email, password, and a TOTP 2FA code. The catch is that Google actively detects automation and may show extra verification, so the reliable pattern is a scheduled real-provider smoke test against a dedicated test account, with mocked OAuth for your fast pull-request checks rather than a live login in the blocking gate.

### How do I test SSO login without leaking the password?

Use BrowserBash markdown tests and mark the password and TOTP seed as secret variables. Secret-marked values are masked as `*****` in every log line, in the on-disk run store at `~/.browserbash/runs`, and in the `Result.md` the tool writes after each run. You commit the plain-English test steps to version control and keep the actual secret in your CI's secret store, so the credential never appears in logs or shell history.

### Why is OAuth testing through a real provider so flaky?

OAuth flows cross multiple domains, hand off to an external identity provider with its own rate limits and bot detection, and rely on consent screens that vary by region, browser, and headless state. That combination makes UI-level tests against the live provider slow and intermittently failing. The standard fix is to mock the provider for feature tests and run real-provider tests on a schedule, treating them as a canary rather than a gate.

### Do I need an API key or account to run BrowserBash?

No. BrowserBash is free and open-source, and with a local Ollama model it needs no API keys and sends nothing off your machine, so your model bill is $0 and a live credential stays local. You can also use a hosted model by setting an Anthropic or OpenAI key, and there's an optional cloud dashboard, but neither is required to run a test.

Ready to try it? Install with `npm install -g browserbash-cli` and write your first Google sign-in test in plain English. An account is optional — sign up only if you want the cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
