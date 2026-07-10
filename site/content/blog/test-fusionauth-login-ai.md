---
title: Test a FusionAuth Login Flow With Plain-English Tests
description: "Learn how to test FusionAuth login with plain-English objectives that drive a real browser through hosted-login themes, redirects, and token exchange."
date: 2026-05-20
category: security
---

If you run FusionAuth in front of your app, the sign-in path is never as simple as "fill two boxes and click a button." To test FusionAuth login the way your users actually experience it, you have to follow a hosted-login page on a different origin, survive a theme that your marketing team keeps re-skinning, tolerate a redirect back to your app with a code in the query string, and confirm a session actually landed. That is a lot of moving parts for a selector-based script to babysit. BrowserBash takes a different route: you describe the outcome in plain English, an AI agent drives a real Chrome browser through every hop, and you get a deterministic pass or fail with structured evidence at the end.

This guide walks through building a durable FusionAuth login test with BrowserBash, from the first one-line objective to a committable Markdown test that survives theme changes, redirect quirks, and the occasional MFA prompt. It is written for SDETs and platform engineers who already know what an OAuth authorization code grant is and just want the login flow covered without maintaining a wall of CSS locators.

## Why FusionAuth login is hard to test the old way

FusionAuth is an identity provider. When your application delegates authentication to it, a login is not one page, it is a negotiated conversation across origins. A typical authorization code flow looks like this: your app sends the browser to the FusionAuth `/oauth2/authorize` endpoint, FusionAuth renders its own hosted-login page (styled by a theme you configured), the user submits credentials there, FusionAuth redirects back to your registered callback URL with an authorization code, and your app exchanges that code for tokens behind the scenes.

Every one of those hops breaks a naive Selenium or Playwright script in a slightly different way.

The hosted-login page lives on the FusionAuth origin, which is usually a different host from your app. If your test only knows how to look at `app.example.com`, it loses the plot the moment the browser lands on `auth.example.com`. FusionAuth themes are fully customizable, which is great for your brand and terrible for hard-coded selectors: a designer renames a wrapper div, adds a "Sign in with Google" block above the email field, or swaps the submit button text from "Submit" to "Continue," and your locator chain shatters. Redirects add timing you cannot always predict, because token exchange happens server-side and the browser may bounce through an intermediate loading state before your dashboard paints.

Selector-based tools force you to encode all of this brittleness explicitly. You end up writing waits for specific network idles, guarding against the "remember this device" interstitial, and re-recording locators every time the theme ships. The test spends most of its life red for reasons that have nothing to do with whether login actually works.

## The plain-English approach

BrowserBash flips the model. Instead of telling the browser *how* to click, you tell an AI agent *what outcome you want*, and it figures out the how against whatever the page actually looks like right now. There are no selectors, no page objects, and no per-theme maintenance. The agent reads the live DOM, decides the next action, performs it in a real Chrome or Chromium browser, and repeats until your objective is satisfied or it gives up with a clear reason.

Install the CLI and run your first FusionAuth login check as a single objective:

```bash
npm install -g browserbash-cli

browserbash run "Open https://app.example.com, click Sign In, log in on the FusionAuth hosted page with email {{email}} and password {{password}}, and confirm the dashboard shows 'Welcome back'" \
  --agent --headless --timeout 120
```

The agent starts on your app, follows the redirect to the FusionAuth hosted-login theme without you telling it the origin changed, finds the email and password fields by intent rather than by CSS, submits, waits out the redirect back to your callback, and verifies the landing state. Because it is reading the page the way a human would, a renamed div or a reordered social-login block does not faze it. That is the whole pitch: you test the *intent* of "log in and land on the dashboard," and the agent absorbs the cosmetic churn that used to break your suite.

BrowserBash is free and open source under Apache-2.0, and by default it is Ollama-first. It will use a local model with no API keys so nothing leaves your machine, and it auto-resolves to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter if you would rather use a hosted model. You can read more about the engine and provider model on the [features page](https://browserbash.com/features).

### The {{variables}} keep credentials out of your logs

Notice the `{{email}}` and `{{password}}` placeholders. BrowserBash substitutes those from a variables file or environment, and any variable you mark as a secret is masked as `*****` in every log line the run emits. You never paste a real password into an objective string, and you never leak one into CI output. For a login test that is not a nice-to-have, it is table stakes.

## Handling the hosted-login redirect and theme

The single most common reason a FusionAuth login test flakes is that the tool cannot cope with the origin change to the hosted-login page and back. BrowserBash treats the redirect as just another thing that happens on the way to your goal. When you say "log in and confirm the dashboard loads," the agent does not care that it visited three origins to get there. It keeps driving until the end state matches your description.

Themes are the second flake source, and here the intent-based approach genuinely earns its keep. Consider a theme change where the login button text goes from "Login" to "Sign in securely" and a passkey option appears above the password field. A locator like `button[type=submit]` might still work, or it might now match the passkey button instead, silently logging your test into the wrong path. A plain-English objective of "enter the password and submit the login form" gives the agent enough context to pick the correct control, because it understands the *role* of each element on the page rather than matching a fragile attribute.

You can also be as specific as you need to be. If your FusionAuth theme has a distinctive multi-step layout (email first, then password on a second screen), spell that out:

```bash
browserbash run "Go to https://app.example.com/login. On the FusionAuth page, type {{email}} into the email field and click Next. On the password screen, type {{password}} and click Sign In. Wait for the redirect back to app.example.com and confirm the URL contains /dashboard and the page shows the user's name." \
  --agent --headless
```

The agent handles the two-screen split, the redirect, and the final verification as one continuous flow. If FusionAuth injects a "Trust this browser?" interstitial, describe how you want it handled ("if asked to trust this browser, click Skip") and the agent will follow that instruction when the prompt appears and ignore it when it does not. That conditional tolerance is exactly what a hard-coded script cannot express cleanly.

## Turn it into a committable Markdown test

A one-line objective is great for a smoke check, but a login flow you care about belongs in version control next to your app code. BrowserBash uses `*_test.md` files: plain Markdown with a title, numbered steps, `{{variables}}`, and optional `@import` composition so shared setup lives in one place.

Here is a `fusionauth_login_test.md` that a whole team can read and edit without knowing a testing framework:

```bash
# FusionAuth hosted login smoke test

1. Open https://app.example.com and click "Sign In".
2. On the FusionAuth hosted-login page, type {{email}} into the email field.
3. Type {{password}} into the password field and submit.
4. Wait for the redirect back to app.example.com.
5. Verify: URL contains /dashboard
6. Verify: text "Welcome back" is visible
7. Verify: "Log out" link visible
```

Run it with:

```bash
browserbash testmd run ./.browserbash/tests/fusionauth_login_test.md --agent
```

Steps 1 through 4 are plain English, so the agent interprets them against the live page. Steps 5 through 7 begin with `Verify`, which is where BrowserBash gets deterministic. Those lines compile to real Playwright checks (URL contains, text visible, named link visible) with no LLM judgment involved. A pass means the condition literally held. A fail comes back with expected-versus-actual evidence in the run's assertions block and in the human-readable `Result.md` the run writes out. You get the flexibility of an AI agent for the messy navigation and the hard guarantees of a real assertion engine for the checks that decide pass or fail. The [tutorials](https://browserbash.com/tutorials) cover the full `Verify` grammar if you want counts, stored-value equality, or title assertions.

### Why the Verify split matters for a security test

For an auth flow specifically, you do not want an LLM deciding whether login "seemed" to succeed. You want a concrete assertion that the URL is your authenticated route and a known element is present. The `Verify` grammar gives you that. Everything before the verifications can be fuzzy and adaptive; the verdict itself is nailed down. If a `Verify` line falls outside the supported grammar, BrowserBash still runs it as an agent-judged check but flags it `judged: true` in the output, so you always know which assertions were deterministic and which were an AI's opinion.

## Save the login once, reuse it everywhere

Most of your suite does not need to test login itself. It needs to *be* logged in so it can test something else. Re-running the full FusionAuth handshake before every test is slow and, worse, it makes an unrelated dashboard test fail whenever the identity provider hiccups.

BrowserBash solves this with saved logins. You authenticate once, interactively, and it captures the session (Playwright storageState) for reuse:

```bash
browserbash auth save fusionauth --url https://app.example.com/login
```

A browser opens, you complete the FusionAuth login by hand (including any MFA), press Enter, and the session is saved under the name `fusionauth`. From then on, any run, testmd, run-all, or monitor invocation can reuse it:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md --auth fusionauth --agent
```

Now your checkout test starts already authenticated, skipping the login dance entirely. You keep one dedicated `fusionauth_login_test.md` that actually exercises the sign-in path, and every other test rides the saved session. If a saved profile's origins do not cover the start URL a test is trying to load, BrowserBash prints a warning instead of silently proceeding as if nothing were wrong, so a stale session surfaces loudly rather than as a mysterious failure. You can also set `auth:` in a test file's frontmatter to bind a suite to a profile without repeating the flag.

## Seed data deterministically with testmd v2

Sometimes a login test needs a known user to exist first, or you want to verify that a freshly provisioned FusionAuth account can sign in. testmd v2 lets you mix deterministic API calls with UI verification in one file. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session, with two step types that never touch a model: API steps for seeding, and Verify steps for checking.

```bash
---
version: 2
---

# Register a FusionAuth user, then verify login

1. POST https://auth.example.com/api/user/registration with body {"user":{"email":"{{email}}","password":"{{password}}"},"registration":{"applicationId":"{{appId}}"}}
2. Expect status 200
3. Open https://app.example.com and click "Sign In".
4. On the FusionAuth page, log in with {{email}} and {{password}}.
5. Verify: URL contains /dashboard
6. Verify: text "Welcome back" is visible
```

Step 1 hits the FusionAuth API directly to create the account, step 2 asserts it succeeded, and the remaining steps drive the real browser through the hosted-login page and verify the result through the UI. This is the honest way to test "a new FusionAuth user can log in" end to end: seed with a deterministic API call, then prove it works through the actual login screen your users see. One caveat worth stating plainly: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter, so v2 files are the one place the Ollama-first default does not apply.

## Comparing the approaches

It helps to be concrete about where an AI-driven, intent-based test wins and where a traditional approach is still the right call. No tool is universally best, and a login flow has real trade-offs.

| Concern | Selector-based (Selenium/Playwright script) | Plain-English (BrowserBash) |
| --- | --- | --- |
| Cross-origin redirect to hosted login | Works, but you manage waits and origin switches by hand | Agent follows redirects to the goal without extra code |
| FusionAuth theme re-skin | Locators break, re-record needed | Intent survives cosmetic changes |
| Conditional interstitials (trust device, MFA prompt) | Explicit branching in code | Describe the condition in the objective |
| Deterministic pass/fail | Full control via assert libraries | `Verify` steps compile to real Playwright checks |
| Raw speed on a stable page | Fastest, no model in the loop | Slower first run, near-free on replay |
| Precise low-level control (drag exact pixels, custom protocol) | Best fit | Not the tool for this |

The replay cache narrows the speed gap more than the table suggests. A green run records the actions it took, and the next identical run replays them with zero model calls. The agent only steps back in when the page has actually changed. So a passing FusionAuth login test that runs on every commit costs almost nothing after the first green, and it self-updates its recorded path when a theme change makes the old actions stop working.

### Where a traditional script is the better fit

If your login test needs pixel-precise drag interactions, a custom transport that is not HTTP, or microsecond-level timing control, a hand-written Playwright script is still the right tool and BrowserBash is not pretending otherwise. The same is true if you have an enormous, mature Playwright suite that already passes reliably: there is little reason to rewrite it wholesale. What BrowserBash is genuinely better at is the fuzzy, high-churn surface area, and a themed hosted-login page is about as high-churn as browser testing gets. Many teams keep both: deterministic API and unit coverage in their existing framework, and intent-based end-to-end login and journey tests in BrowserBash. If you are migrating, `browserbash import` will convert existing Playwright specs to plain-English tests heuristically and deterministically, dropping anything it cannot translate into an `IMPORT-REPORT.md` rather than inventing a step.

## Run it in CI and watch it in production

A login test earns its keep in two places: on every pull request, and continuously against production. BrowserBash covers both.

For CI, agent mode emits NDJSON (one JSON event per line) on stdout with frozen exit codes: `0` passed, `1` failed, `2` error or budget stop, `3` timeout. No prose parsing, no scraping a log. Your pipeline reads the exit code and the `run_end` event and moves on. There is an official GitHub Action that installs the CLI, runs the suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with a verdict table. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) walk through wiring it up, including sharding and budget flags.

For production, monitor mode runs your login test on an interval and alerts only when the pass or fail state changes, in either direction, never on every green run:

```bash
browserbash monitor ./.browserbash/tests/fusionauth_login_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Point it at a Slack incoming webhook and it formats the alert for Slack automatically; point it at any other URL and it posts the raw JSON payload. Because the replay cache makes each check nearly token-free, an always-on FusionAuth login monitor that pings every ten minutes costs almost nothing while catching the outage where your identity provider's theme deploy silently broke the submit button. That is synthetic monitoring for the one flow you cannot afford to have down. The source and issue tracker live on [GitHub](https://github.com/PramodDutta/browserbash) if you want to see how the monitor loop and state-change detection work.

### A note on cost and models

If you run BrowserBash against a hosted model, `run_end` carries a `cost_usd` estimate from a bundled per-model price table, and `run-all --budget-usd` will stop launching new tests once a suite crosses your spend limit. One honest caveat: very small local models (roughly 8B parameters and under) can be flaky on long multi-step objectives, and a themed multi-screen login is genuinely multi-step. The sweet spot for reliable login testing is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If your login test on a tiny local model is inconsistent, that is expected, and moving up a model size usually fixes it before you start blaming the tool.

## Putting it together

A durable FusionAuth login test with BrowserBash comes down to a few decisions. Write the sign-in path as a plain-English `*_test.md` with deterministic `Verify` steps for the verdict, so cosmetic theme changes never turn the test red on their own. Save the session once with `browserbash auth save` and reuse it across the rest of your suite so you are not re-authenticating for every unrelated test. Seed known users with testmd v2 API steps when you need to prove a fresh account can log in. Run it in CI through the GitHub Action for the exit-code verdict, and put a monitor on production so a broken login pages you before your users do.

The result is a test that reads like documentation, survives the churn that used to keep your auth suite perpetually broken, and gives you a real pass or fail with evidence instead of a guess. You can browse more end-to-end recipes on the [BrowserBash blog](https://browserbash.com/blog) and see the full command reference in the [learn section](https://browserbash.com/learn).

## FAQ

### Can BrowserBash handle the FusionAuth hosted-login page on a different origin?

Yes. When you describe an outcome like "log in and confirm the dashboard loads," the agent follows the redirect from your app to the FusionAuth hosted-login origin and back without any special configuration. It reads whatever page it lands on and keeps driving toward your goal, so the origin switch is invisible from your test's point of view. You do not need to hard-code the auth host or write manual waits for the redirect.

### Will a FusionAuth theme change break my login test?

Not the way it breaks a selector-based script. Because the agent identifies fields and buttons by their role and intent rather than by CSS selectors, a renamed wrapper, reordered social-login block, or changed button text usually does not affect the test. The one part that is locked down is the verdict: your `Verify` steps compile to real Playwright assertions, so a pass still means a concrete condition held. Cosmetic churn is absorbed, and the checks that decide pass or fail stay deterministic.

### How do I avoid logging in before every single test?

Use saved logins. Run `browserbash auth save` once, complete the FusionAuth flow by hand including any MFA, and BrowserBash captures the session as Playwright storageState. Then pass `--auth <name>` on any run, testmd, run-all, or monitor command, or set it in a test file's frontmatter, and those tests start already authenticated. You keep one dedicated test that actually exercises login and let everything else reuse the saved session.

### Does testing FusionAuth login require API keys or send my credentials anywhere?

By default BrowserBash is Ollama-first and runs a local model with no API keys, so nothing leaves your machine. Credentials passed as `{{variables}}` are masked as asterisks in every log line, and the recorder never lets password field contents leave the page. The exception is testmd v2, which currently needs the builtin engine and therefore an Anthropic API key or a compatible gateway. For a simple single-file login objective, you can stay fully local.

Ready to cover your FusionAuth login flow in plain English? Install with `npm install -g browserbash-cli` and write your first test in minutes. An account is optional and everything runs locally, but if you want the free cloud dashboard and hosted retention you can [sign up here](https://browserbash.com/sign-up).
