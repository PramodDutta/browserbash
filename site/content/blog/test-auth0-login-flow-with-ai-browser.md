---
title: How to Test an Auth0 Login Flow With an AI Browser CLI
description: "Test Auth0 login end to end with an AI browser CLI. Drive Universal Login, return to your app, mask credentials, and reuse the session across test runs."
date: 2026-06-27
category: guide
---

To test an Auth0 login flow with an AI browser CLI, you write the journey as plain English, point the agent at your app, and let it carry out the full Universal Login redirect: click your "Log in" button, follow the hop to the Auth0-hosted page, type the email and password, submit, and confirm you land back on your own authenticated screen. With [BrowserBash](https://browserbash.com), a free open-source CLI, that round trip is a single objective or a short Markdown test file. Credentials go in as masked variables so the password never shows up in a log, and once a session works you can save and reuse it so later tests skip the login screen. This guide shows the exact commands, the redirect handling, the secret masking, and an honest account of where social-provider and bot-protection screens still get in the way.

## Why Auth0 login is awkward to test

Auth0's Universal Login is a redirect flow, and redirect flows are where conventional UI tests get brittle. Your app does not host the login form. When a user clicks "Log in," the browser leaves your origin, lands on a tenant page like `your-tenant.us.auth0.com` (or your custom domain), collects the credentials there, and bounces back to your callback URL with a code that your app exchanges for a session. A test has to follow that hop across two origins and keep its bearings the whole way.

Selector-based suites struggle here for a practical reason: the Auth0-hosted page is markup you do not own. Auth0 ships changes to Universal Login on its own schedule, experiments run behind feature flags, and the input you pinned to a particular `name` or `id` last quarter may sit under a different attribute today. You can pin locators to the hosted page, but you are maintaining a map of someone else's territory, and the territory moves without telling you.

The intent-based approach sidesteps that. Instead of encoding *how* to find the username field, you describe *what* logging in means, and the agent re-reads the live page on each run to find the fields the way a person would. It locates elements through the accessibility tree, by their roles and accessible names and states, rather than by CSS classes, so a renamed attribute on the hosted page is something the agent reads past rather than something that turns the build red. To be precise: BrowserBash re-derives the target from the live page every run. It does not patch or keep a saved selector script between runs, so there is no cached locator quietly going stale.

## Install and pick a model

Install the CLI globally from npm:

```bash
npm install -g browserbash-cli
```

You need a model to drive the agent. BrowserBash resolves one automatically: it looks for a local [Ollama](https://ollama.com) install first, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY` (which includes some genuinely free hosted models). Running local means nothing leaves your machine, which matters when the flow involves real credentials.

One caution: the Auth0 round trip is a long objective with several decision points, and small local models (8B and under) tend to wander on long flows. A 70B-class model (Qwen3, Llama 3.3) or a hosted model is the dependable choice for hard auth journeys. If you have Ollama and the hardware:

```bash
ollama pull qwen3
```

## Run the full redirect as one objective

The fastest way to see the whole flow work is a single natural-language objective. Replace the URL and the test account with your own staging values:

```bash
browserbash run "Open https://app.example.com, click 'Log in', wait for the Auth0 login page, enter email qa@example.com and password into the form, click 'Continue', and verify the page returns to app.example.com and shows the text 'Dashboard'"
```

A few things are worth noticing. You never tell the agent which origin the password field lives on, because the agent reads whatever page is in front of it after the redirect and acts on what is rendered right then. You do not write a manual wait for the hop, because Playwright's built-in auto-wait (with a 15-second ceiling) handles the navigation and the late-appearing inputs without a single `sleep`. And the final clause is what makes this a test rather than a click-through: "verify the page returns to app.example.com and shows 'Dashboard'" is the assertion. The run only passes if the browser actually came back to your origin authenticated.

The default engine here is Stagehand, which observes the live DOM at each step and decides the next action from what is rendered at that moment. That is exactly the behavior you want across a redirect, because the agent does not assume the next page looks like the last one. For native Playwright traces instead, switch to the builtin engine, an Anthropic tool-use loop that captures traces and re-derives the selector from a fresh snapshot on every action, never cached across runs:

```bash
browserbash run "<same objective>" --engine builtin
```

For more on what each engine is good at, the [features page](https://browserbash.com/features) lays out the tradeoffs.

## Write it as a reusable test file

A one-off objective is great for a first pass, but you will want this in version control as a named test. BrowserBash tests are Markdown `*_test.md` files: a `# title`, ordered or bulleted steps, `{{variables}}` for values, and `@import` to compose flows. Here is the Auth0 login as `auth0_login_test.md`:

```markdown
# Auth0 Universal Login

1. Open {{APP_URL}}
2. Click the "Log in" button
3. Wait for the Auth0 Universal Login page to load
4. Enter {{AUTH0_EMAIL}} into the email field
5. Click "Continue" if a separate password step appears
6. Enter {{AUTH0_PASSWORD}} into the password field
7. Click "Continue" to submit the login form
8. Verify the browser returns to {{APP_URL}}
9. Verify the page shows the text "Dashboard"
```

Step 5 is deliberate. Auth0's identifier-first experience splits email and password onto two screens, while the classic single-page form shows both at once. Because the agent reads the live page each step, a conditional instruction like "click Continue if a separate password step appears" lets the same file pass on either layout instead of forking into two tests.

Run it:

```bash
browserbash testmd run ./auth0_login_test.md
```

The `@import` directive is what keeps this from being copy-pasted into every other test you own. Authentication is a prerequisite for nearly every authenticated journey, so put the login once in `auth0_login_test.md` and pull it into a billing test, a settings test, a profile test:

```markdown
# Update billing address

@import ./auth0_login_test.md

1. Click "Account settings"
2. Open the "Billing" tab
3. Update the billing address to "12 Market Street, Berlin"
4. Verify the page shows "Address updated"
```

Now a change to the login flow is fixed in one file, and everything downstream inherits it. This composition pattern is covered in more depth in [AI login flow testing](https://browserbash.com/blog/ai-login-flow-testing), and the broader OAuth-style redirect case in [testing OAuth login with AI](https://browserbash.com/blog/test-oauth-login-with-ai).

## Keep the password out of your logs

A login test types a credential, and credentials have a way of leaking into shell history, CI output, and archived run transcripts that outlive the test by months. BrowserBash treats variables marked as secret specially: their values are masked in logs, so the password renders as `*****` rather than plaintext wherever the run is recorded.

Pass the values at runtime rather than hardcoding them in the file. The email and app URL are not sensitive; the password is:

```bash
browserbash testmd run ./auth0_login_test.md \
  --var APP_URL=https://app.example.com \
  --var AUTH0_EMAIL=qa@example.com \
  --secret AUTH0_PASSWORD="$AUTH0_TEST_PASSWORD"
```

The `$AUTH0_TEST_PASSWORD` here is read from your environment, so the literal never appears on the command line either. In CI, store it as a pipeline secret and let the runner inject it. The full variable-and-secret model, including how masking behaves across the result artifacts, is walked through in the [variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial).

A word on test accounts: use a dedicated Auth0 test user in a non-production tenant, not a real customer login and never a real admin. The redirect flow will work the same way, and you keep production credentials out of the test harness entirely.

## Reuse the session so later tests skip login

Logging in through the full Universal Login redirect on every test is slow and, more importantly, hammers the auth flow with repeated logins that can trip rate limits or bot heuristics. The better pattern is to authenticate once, save the resulting browser session, and reuse it so subsequent tests open already signed in.

That keeps the expensive redirect flow as one focused test whose only job is to prove login works, while your billing, settings, and profile tests start authenticated and stay fast. The mechanics of capturing and replaying a session across runs are covered end to end in [reuse login session across browser tests](https://browserbash.com/blog/reuse-login-session-across-browser-tests). The short version: get login green once, persist the session, and point the rest of your tests at it.

## Wire it into CI

For continuous integration, BrowserBash speaks NDJSON and clean exit codes so a pipeline can read the result without scraping prose. Run headless with the agent stream on:

```bash
browserbash testmd run ./auth0_login_test.md \
  --agent --headless \
  --var APP_URL=https://app.example.com \
  --var AUTH0_EMAIL=qa@example.com \
  --secret AUTH0_PASSWORD="$AUTH0_TEST_PASSWORD"
```

The `--agent` flag emits NDJSON events you can parse step by step. Exit codes are unambiguous: `0` pass, `1` fail, `2` error, `3` timeout, so your job either goes green or tells you exactly which category of trouble it hit. Add `--record` to capture a webm video plus screenshots, which is invaluable when an auth redirect fails on a runner you cannot watch live. Every run also writes a `Result.md` summary. For a dashboard, `browserbash dashboard` runs one locally, or `--upload` opts into the cloud dashboard (free runs kept 15 days).

The `--provider` flag chooses where the browser runs: `local`, `cdp`, `browserbase`, `lambdatest`, or `browserstack`. For Auth0, running against a remote provider is sometimes the difference between passing and failing, because some bot-protection heuristics treat datacenter or unusual fingerprints differently from a normal browser.

## Honest limits: where Auth0 testing gets hard

This flow is not magic, and Auth0 has two screens in particular that an AI browser agent cannot reliably push through. Being straight about them is more useful than pretending otherwise.

**Social-provider logins (Google, GitHub, Microsoft).** If your "Log in" path goes through "Continue with Google," the agent leaves Auth0 entirely and lands on Google's own login, which layers on its own bot detection, device checks, and frequently a one-time code or interstitial designed specifically to stop automated sign-in. Identity providers actively fight scripted logins, so expect the agent to stall there. The standard answer is to not test the social provider's UI at all: use a dedicated username-and-password test user in your Auth0 tenant for end-to-end runs, and trust the provider's own systems for the social path. Testing Google's login form is testing Google, not your app.

**Auth0 bot protection, CAPTCHA, and MFA.** Auth0 can present a CAPTCHA, a "verify you are human" challenge, or an attack-protection step when a login looks suspicious, and repeated automated logins are exactly what looks suspicious. The agent will not solve a CAPTCHA, and it should not. The fix is on the Auth0 side: in your test tenant, disable bot detection and brute-force protection, and configure the test user so multi-factor is not required. If MFA sends a code to a real phone or authenticator, the agent cannot retrieve it, so disable MFA for the test account. Reusing a saved session (above) also cuts the number of fresh logins, which keeps you under the heuristics that trigger these screens.

**Custom JavaScript widgets and exotic embeds.** The agent handles iframes and Shadow DOM, and it reads the accessibility tree, so most standard inputs are fine even when Auth0 nests them. But a heavily customized Universal Login page with a canvas-rendered control or an input that exposes no accessible name can leave the agent without a handle to grab. If your hosted page is bespoke, test it early to find the gaps.

**It is non-deterministic by nature.** An agent that reads the page and decides the next action will occasionally make a different choice than it did last run, especially on a smaller model. That is the cost of resilience to UI change. Mitigate it with a capable model, clear step text, and assertions specific enough that a wrong path fails loudly instead of passing by accident.

## Where this beats, and does not beat, Playwright

It is worth being fair about the alternative. A hand-written Playwright or Selenium test against Auth0, with well-maintained locators on the hosted page, will run faster and more deterministically than an agent on any given green day. If your Auth0 login is stable and you have the engineering time to maintain the page objects, a coded test is a perfectly good choice, and BrowserBash is built on Playwright underneath, so you are not leaving that ecosystem behind.

The trade is maintenance against speed. The coded test is fast until Auth0 ships a Universal Login change and your locators break. The intent-based test is slower per run but reads the page fresh each time, so the same UI change is usually absorbed without a code edit. Many teams run both: a fast coded path for the happy case, and agent tests for the redirect-heavy flows where locator churn hurts most. Pick the tool that matches how often your auth UI actually moves.

## FAQ

### Can BrowserBash follow the Auth0 redirect from my app to the hosted login page and back?

Yes. The agent reads whatever page is currently rendered and acts on it, so it follows the hop from your origin to the Auth0-hosted login and back to your callback without you scripting the navigation. Playwright's built-in auto-wait (15-second ceiling) handles the redirect timing, so you do not write manual waits. Your final assertion should confirm the browser returned to your own origin and shows an authenticated element, which proves the round trip completed.

### How do I keep the Auth0 password out of my logs and CI output?

Pass it as a secret variable with `--secret AUTH0_PASSWORD="$AUTH0_TEST_PASSWORD"` and read the value from an environment variable so it never sits on the command line. Secret-marked variables are masked in logs, rendering as `*****` instead of plaintext wherever the run is recorded, including the result artifacts. In CI, store the password as a pipeline secret and let the runner inject it at run time.

### Does it work with social logins like "Continue with Google"?

Not reliably, by design on the provider's side. Once you click "Continue with Google," you leave Auth0 and hit Google's own login with bot detection and challenges built specifically to stop scripted sign-in. The recommended approach is to use a username-and-password test user in your Auth0 tenant for end-to-end runs and not attempt the social-provider UI, since that path is testing the provider, not your app.

### How do I stop re-running the full login on every test?

Authenticate once through the full redirect, save the resulting browser session, and reuse it so later tests open already signed in. That keeps login as one focused test and makes the rest of your suite fast, while also cutting the number of fresh logins, which helps you stay under Auth0's bot-protection heuristics. The step-by-step session capture and replay is covered in the reuse-login-session guide linked above.

## Wrapping up

Testing an Auth0 Universal Login flow with an AI browser CLI comes down to four moves: describe the redirect as plain-English intent so the agent follows the hop and back, assert that you landed on your own authenticated screen, mask the password as a secret so it never leaks, and save the session so the rest of your suite skips the login screen. Route around the two walls, social-provider logins and bot-protection challenges, with a dedicated test user and a quieter test tenant rather than fighting CAPTCHAs you were never meant to solve. For a guided path into the broader toolkit, start at [the learn hub](https://browserbash.com/learn), then install the CLI and run your first redirect:

```bash
npm install -g browserbash-cli
```
