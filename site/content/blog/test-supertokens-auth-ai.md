---
title: Test SuperTokens Auth With AI Browser Automation
description: "Learn to test SuperTokens auth end to end with AI browser automation: sign-up, login, session refresh, and pre-built UI verified by plain-English intent."
date: 2026-05-21
category: security
---

If you run SuperTokens in production, the scariest bugs are the silent ones: a session that refreshes wrong, a redirect loop after login, an email-verification link that lands on the wrong screen. To test SuperTokens auth properly you have to drive the real pre-built UI, complete a real flow, and confirm the session actually holds across a page reload. That is exactly the kind of work that breaks brittle selector-based scripts every time SuperTokens ships a new UI version. This guide shows how to test SuperTokens auth with AI browser automation, where you describe the flow in plain English and an agent drives a real Chrome browser to a deterministic verdict.

The tool doing the driving is BrowserBash, a free and open-source (Apache-2.0) command-line tool from The Testing Academy. You write an objective like "sign up, log in, then reload and confirm you are still logged in," and an AI agent executes it step by step against a live browser. No page objects, no CSS selectors, no rewrite when the SuperTokens theme changes. The result is a structured pass or fail you can wire into CI.

## Why SuperTokens auth is hard to test the old way

SuperTokens is an open-source authentication provider that ships two very different pieces you have to validate together. There is the backend SDK and Core (the session engine, token rotation, and the anti-CSRF logic), and there is the frontend, which for most teams means the pre-built React UI components for sign-up, sign-in, password reset, and email verification. The failure modes live in the seams between them.

Consider what a "login works" test actually needs to prove. The form submits, the Core issues an access token and a refresh token, the frontend stores them, the redirect to your protected route fires, and crucially, when the short-lived access token expires the frontend silently calls the refresh endpoint and keeps the user in. A traditional Selenium or Cypress test pins itself to the DOM of the pre-built UI. The moment SuperTokens updates a class name or restructures the widget, your selectors rot and the suite goes red for reasons that have nothing to do with a real regression.

There is a subtler problem too. Auth flows are multi-page and stateful: you sign up, get bounced to email verification, click a link in an inbox, come back, and land on a dashboard. Encoding that as a linear script with explicit waits is fragile and verbose. Encoding it as intent ("complete the sign-up flow and verify you reach the dashboard") is durable, because the agent adapts to whatever the page shows.

**One overlap to be honest about.** If your only goal is unit-testing the SuperTokens backend SDK, you do not need a browser at all. Hitting the Core's REST API directly with a request runner is faster and cheaper than driving Chrome. AI browser automation earns its keep at the UI and session layer, where a human clicks the pre-built widgets and where token refresh only happens inside a real browser context. You can even combine both in one file, which we will get to.

## What "verify by intent" actually means

BrowserBash positions itself as the open-source validation layer for AI agents, and the core idea is simple: you state what should be true, and the agent decides how to make the browser prove it. For a plain objective, the agent interprets your English, drives the browser, and returns a verdict with a summary and a final state.

For anything you want to run in CI, you graduate to deterministic checks. BrowserBash has a `Verify` step type that compiles to real Playwright assertions, not LLM judgment. When you write `Verify: "Dashboard" heading is visible`, that becomes an actual visibility check on a heading element. A pass means the condition genuinely held. A fail comes with expected-versus-actual evidence in the run output and in the generated Result.md table. This distinction matters for auth testing, because you do not want a language model "deciding" that a login looked successful. You want the URL to contain `/dashboard` and the logout button to be visibly present, checked deterministically.

Here is the split in practice. The messy, human parts of the flow (fill the sign-up form, click the primary button, handle the redirect) run as agent-driven English steps. The claims you assert on (the URL, a heading, a stored value) run as deterministic Verify steps. You get the flexibility of AI for navigation and the rigor of Playwright for the pass or fail.

## Getting set up in two minutes

Install the CLI globally from npm. BrowserBash defaults to local models through Ollama, so you can run your first test without any API keys and with nothing leaving your machine.

```bash
npm install -g browserbash-cli

# Point it at your SuperTokens demo app and run a first objective
browserbash run "Open http://localhost:3000/auth, sign up with email qa+st@example.com and password Test1234!, then confirm you land on the home page" --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, which is what you feed into CI or into an AI coding agent. Exit codes are frozen and dependable: 0 for passed, 1 for failed, 2 for an error or infra problem, 3 for a timeout. A shell script or a GitHub workflow can branch on the result without parsing any prose.

One honest caveat up front. Very small local models (roughly 8B parameters and under) can get flaky on long multi-step objectives like a full sign-up-plus-verify flow. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. BrowserBash auto-resolves in order: local Ollama first, then your `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. Match the model tier to the complexity of the flow. If you want the deeper background on engines and providers, the [features overview](https://browserbash.com/features) walks through the options.

## Writing a committable SuperTokens login test

Ad-hoc objectives are great for exploration, but real regression coverage lives in committable Markdown test files. A `*_test.md` file has a title, plain-English steps, and can use `{{variables}}` for anything you do not want hard-coded, including secrets, which get masked as `*****` in every log line.

Save this as `.browserbash/tests/supertokens_login_test.md`. It covers the core SuperTokens sign-in against the pre-built UI and, more importantly, the session-persistence-across-reload behavior:

```
# SuperTokens login and session persistence

version: 2

1. Open {{BASE_URL}}/auth
2. Click the "Sign In" tab if it is not already selected
3. Type {{TEST_EMAIL}} into the email field
4. Type {{TEST_PASSWORD}} into the password field
5. Click the "Sign In" button
6. Verify: url contains /dashboard
7. Verify: "Sign Out" button is visible
8. Reload the page
9. Verify: url contains /dashboard
10. Verify: "Sign Out" button is visible
```

Two things here are worth calling out. The `version: 2` frontmatter turns on testmd v2, which executes steps one at a time against a single browser session. That single-session behavior is essential for auth testing, because the session created in step 5 must survive the reload in step 8. Steps 6, 7, 9, and 10 are deterministic Verify assertions. Step 9 is the real test: if SuperTokens fails to persist or restore the session across a reload, the URL will not contain `/dashboard` and the assertion fails with evidence, not a vague "the agent thought it looked fine."

Note the honest limitation on testmd v2: it currently drives the builtin engine, which speaks the Anthropic API. So this file needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. The plain-English `run` objectives from the previous section run fine on local models; the one-at-a-time v2 executor is the part that needs the builtin engine for now.

## Seeding accounts with API steps, then verifying in the UI

Sign-up tests have a nasty prerequisite: you often need an account that does not already exist, or conversely an account that definitely does. Creating that state by clicking through the UI first is slow and couples one test to another. testmd v2 solves this with deterministic API steps that never touch a model.

You can hit the SuperTokens Core or your own backend to seed state, then switch to the browser to verify the human experience. Here is a hybrid file that provisions a user through an API and then confirms that user can log in through the pre-built UI:

```
# Seed a SuperTokens user, then log in through the UI

version: 2

1. POST {{API_URL}}/test/signup with body {"email": "{{TEST_EMAIL}}", "password": "{{TEST_PASSWORD}}"}
2. Expect status 200, store $.user.id as 'userId'
3. Open {{BASE_URL}}/auth
4. Type {{TEST_EMAIL}} into the email field
5. Type {{TEST_PASSWORD}} into the password field
6. Click the "Sign In" button
7. Verify: url contains /dashboard
8. Verify: stored 'userId' is not empty
```

The API step in line 1 runs deterministically, checks the status in line 2, and stores a value from the JSON response using a JSON path. Then the agent takes over for the browser steps. This is the pattern for testing SuperTokens auth without flaky, order-dependent setup: seed with the API, prove it through the UI. It also lets you test edge cases like "logging in with an unverified email shows the verification screen" by seeding an unverified account through your backend and letting the agent walk the UI consequence.

For SuperTokens specifically, the API step layer is also useful for the reverse case. You can call your backend's session-info endpoint after a UI login to confirm the access token and refresh token were actually issued, closing the loop between what the user sees and what the Core recorded. If you want more examples of composing API and UI steps, the [tutorials](https://browserbash.com/tutorials) collection has runnable walk-throughs.

## Running the suite: saved logins, sharding, and budgets

A large share of your suite will be tests that assume the user is already logged in: dashboard tests, settings tests, anything behind the SuperTokens session guard. Logging in through the full pre-built UI at the start of every one of those tests is wasteful and it makes the login flow a single point of failure for unrelated tests.

BrowserBash has saved logins for exactly this. You log in once, interactively, and the session is captured as a Playwright storageState profile. From there you run individual tests, reuse the saved session, and finally run the whole folder as a suite:

```bash
# Log in once through the real SuperTokens UI and save the session
browserbash auth save supertokens-user --url http://localhost:3000/auth

# Run one committable test against the saved session
browserbash testmd run ./.browserbash/tests/supertokens_login_test.md --auth supertokens-user --agent

# Run the whole auth folder, shard across CI machines, cap spend
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

You can reference a saved profile with `--auth <name>` on `run`, `testmd`, `run-all`, and `monitor`, or with an `auth:` frontmatter line in a test file. There is a thoughtful guardrail here: if the saved profile's origins do not cover the start URL you are testing, BrowserBash prints a warning instead of silently proceeding as if you were logged in. That prevents the classic false green where a test "passes" because it never actually needed the auth it claimed to use.

The suite runner is built for real pipelines. Sharding with `--shard 2/4` computes a deterministic slice from the sorted discovery order, so four parallel CI machines split the work without any coordination between them. The `--budget-usd 2.00` flag stops launching new tests once the suite crosses your dollar budget; remaining tests are reported as skipped, the suite exits 2, and the spend lands in the results and JUnit properties. That budget stop is a genuine safety net when you are running against a hosted model and a runaway loop could otherwise burn money. You can also run the same tests across viewports with `--matrix-viewport 1280x720,390x844` to confirm the pre-built UI behaves on desktop and mobile widths, since responsive auth forms are a common "works on my machine" bug.

There is an official GitHub Action that wraps all of this: it installs the CLI, runs the suite, uploads the JUnit, NDJSON, and Result artifacts, supports the shard matrix and budget flags, and posts a self-updating PR comment with a verdict table. The setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## Monitoring SuperTokens auth in production

Testing in CI catches regressions before they ship. But auth is the kind of thing you also want to watch continuously in production, because an expired certificate, a misconfigured cookie domain, or a Core deployment gone wrong can break login for real users at 3am. BrowserBash has a monitor mode for this, and it can also convert your existing Playwright tests so you have something to monitor in the first place:

```bash
# Check that login still works every ten minutes, alert only on state changes
browserbash monitor ./.browserbash/tests/supertokens_login_test.md --every 10m --notify https://hooks.slack.com/services/XXX

# Convert existing Playwright auth specs into plain-English tests
browserbash import ./e2e/auth
```

Monitor mode runs your test on an interval and alerts only when the pass or fail state changes, in either direction, never on every green run. So you get a message the moment login breaks, and another message when it recovers, and silence in between. Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload so you can route it wherever you like.

The reason this is practical rather than expensive is the replay cache. A green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page changed. An always-on login monitor is therefore nearly token-free most of the time, spending model budget only on runs where something moved. That is what makes a ten-minute cadence realistic instead of a cost problem.

The `import` command above is heuristic and deterministic, with no model involved, so it is reproducible. It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common expects into plain-English steps, and it turns `process.env.X` references into `{{X}}` variables. Anything it cannot confidently translate is written into an IMPORT-REPORT.md file rather than silently dropped or invented, so you know exactly what needs a human pass. If you prefer to build fresh instead, `browserbash record` opens a visible browser, you click through the SuperTokens flow once, and Ctrl-C writes a plain-English test. Password fields are handled carefully: the value never leaves the page, and the generated step references a secret marker rather than capturing your actual password into a committed file.

## Comparing the approaches and who it is for

Here is an honest look at where AI browser automation fits against the alternatives for SuperTokens auth testing.

| Approach | Survives UI theme changes | Session and token refresh coverage | CI-ready verdict | Best for |
| --- | --- | --- | --- | --- |
| Backend SDK / Core API tests | Not applicable (no UI) | Token issuance only, not frontend refresh | Yes | Fast backend logic checks |
| Selector-based Selenium / Cypress | Fragile, breaks on markup change | Yes, with manual waits | Yes | Teams with stable, custom auth UI |
| AI browser automation (BrowserBash) | Yes, driven by intent | Yes, real browser context | Yes, deterministic Verify | Pre-built UI, multi-page flows, monitoring |
| Manual QA | Yes | Yes | No, not automated | One-off exploratory checks |

The takeaway is not that one row wins everything. If your auth UI is fully custom and rarely changes, a well-maintained Cypress suite is perfectly good and you may not need to switch. If your logic lives in the backend, test it at the API. AI browser automation is the strongest fit when you are running the SuperTokens pre-built UI (which updates on its own release cadence), when your flows span multiple pages, and when you want continuous production monitoring that does not cost a fortune to run.

Reach for this approach when you are testing the human side of SuperTokens: the sign-up widget, the sign-in widget, email verification, password reset, and the all-important session-persistence-across-reload behavior. It shines when the pre-built UI is involved, because intent-based steps do not care about the exact markup the widget renders. It also shines for the on-call use case, where a nearly free monitor watching login every ten minutes is a genuine early-warning system. Be honest about where it is not the first choice: pure backend session-logic unit tests belong in your backend runner, extremely small local models can struggle with long flows, and testmd v2 currently needs the builtin engine rather than a local Ollama model. If you want to see how other teams structure their coverage, the [case studies](https://browserbash.com/case-study) page is a good next read, and the full command reference lives on [the learn hub](https://browserbash.com/learn).

## FAQ

### Can I test SuperTokens session refresh without writing selectors?

Yes. Because the agent drives a real browser, the short-lived access token expires and the frontend refresh happens exactly as it would for a real user. You express the check as intent, for example reload the page after login and verify you are still on the protected route, and a deterministic Verify assertion confirms the session held. There are no CSS selectors to maintain when the SuperTokens pre-built UI changes.

### Does BrowserBash need my SuperTokens password in plain text?

No committed file needs your real password. You store it as a masked variable that shows up as five asterisks in every log line, or you capture the login once with saved logins so the session is reused without re-entering credentials. When you use the recorder, password fields never leave the page and the generated step only references a secret marker, so your actual password is never written into a test file.

### Do I need an API key to test SuperTokens auth?

For plain-English run objectives, no. BrowserBash defaults to local models through Ollama with no API keys and nothing leaving your machine. The one-at-a-time testmd v2 files that combine API seeding steps with Verify assertions currently need the builtin engine, which means an Anthropic key or a compatible gateway. Choose local for exploration and the builtin engine when you want the deterministic hybrid flow.

### How do I keep an eye on SuperTokens login in production?

Use monitor mode with an interval and a webhook. It runs your login test on a schedule and alerts only when the pass or fail state changes, so you hear about it the moment login breaks and again when it recovers, without noise on healthy runs. The replay cache means an always-on monitor is nearly token-free, which makes a ten-minute cadence affordable.

Testing SuperTokens auth does not have to mean brittle selectors that shatter every time the pre-built UI updates. Describe the flow in plain English, let an AI agent drive a real browser, and get a deterministic verdict you can trust in CI and in production monitoring. Install it with `npm install -g browserbash-cli` and run your first sign-up test in a couple of minutes. An account is optional, but if you want the free cloud dashboard and hosted retention you can [sign up here](https://browserbash.com/sign-up).
