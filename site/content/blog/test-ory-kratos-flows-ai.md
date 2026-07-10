---
title: Test Ory Kratos Self-Service Flows in Plain English
description: "Learn how to test Ory Kratos flows (login, registration, recovery) by intent with an AI agent that drives a real browser and returns a verdict."
date: 2026-05-22
category: security
---

If you run Ory Kratos, most of your risk lives in the self-service flows: login, registration, account recovery, verification, and settings. Those flows are rendered from Kratos UI nodes, which means the exact fields, hidden CSRF tokens, and message IDs shift as you tune your identity schema. That churn is precisely why teams struggle to test Ory Kratos flows reliably: brittle selectors break the moment a node changes, and rewriting them after every schema edit is a tax nobody wants to pay. This guide shows a different approach. Describe what each flow should do in plain English, let an AI agent drive a real Chromium browser through the Kratos UI, and get a deterministic pass or fail back.

BrowserBash is the tool doing the driving here. It is a free, open-source (Apache-2.0) command-line tool from The Testing Academy that turns a plain-English objective into browser actions. No selectors, no page objects, no waiting-for-node-ID gymnastics. You write intent, the agent figures out which node is the email field and which button submits the flow, and you get a structured verdict you can gate a pipeline on.

## Why Ory Kratos flows are hard to test the old way

Kratos does not ship a fixed HTML login page. It exposes flow APIs, and your UI (the reference self-service-node UI, or your own React or server-rendered app) renders whatever nodes the flow returns. A registration flow might return an email node, a password node, one or more trait nodes from your identity schema, a CSRF token node, and a submit node. Change the schema to add a "company" trait, and the DOM changes. Turn on a second factor, and the login flow grows a step. Enable code-based recovery, and the recovery UI is a different shape entirely.

Traditional end-to-end tests pin themselves to that DOM. A Playwright or Cypress test hard-codes `input[name="traits.email"]` and `button[name="method"][value="password"]`. When Kratos or your UI renames or reorders those nodes, the selector misses, and you get a failure that has nothing to do with a real regression. Teams respond by over-maintaining selectors or, worse, by not testing the auth flows at all.

There is a second, subtler issue. Kratos flows are stateful and CSRF-protected. Each flow has an ID in the URL, a hidden anti-CSRF token, and a short lifespan. A test that navigates directly to a stale flow URL fails for reasons that look like a bug but are not. You want a test that always starts a fresh flow the way a user would.

## The plain-English approach to testing identity flows

The core move is to stop describing *how* to interact with the page and start describing *what* should happen. Instead of "find the input with name traits.email and type into it," you write "register a new account with a unique email and a strong password, then confirm you land on the signed-in dashboard." An AI agent reads that objective, snapshots the live page, decides which node is the email field, and submits.

Because the agent works from the rendered accessibility tree and visible text rather than a frozen selector, it tolerates the node churn that breaks brittle tests. When you add that "company" trait to your schema, the agent still finds the email and password fields and fills the new one if your objective mentions it, and you did not touch the test. That is the whole point of testing by intent: the test describes the user's goal, and the goal is stable even when the markup is not.

This is not magic and it is not free of judgment. The agent is making decisions, and you want those decisions to be checkable. That is where BrowserBash splits the work into two halves: agent-driven steps that navigate and act, and deterministic Verify assertions that check the outcome with no model involvement. You can read more on the [BrowserBash features page](https://browserbash.com/features), but the short version is that the fuzzy part (driving the UI) and the strict part (the verdict) are kept separate on purpose.

## Testing the Ory Kratos login flow

Start with the flow you cannot afford to break. A login test needs a real account, and here you have a choice: seed an identity through the Kratos admin API before the test runs, or reuse a saved browser session so you are not typing credentials on every run. Both are supported. Start with the simplest smoke test against a running Kratos self-service UI.

```bash
npm install -g browserbash-cli

browserbash run "Open http://localhost:4455/login, sign in with email {{email}} and password {{password}}, and confirm the page shows a signed-in state with a logout option" \
  --agent --headless --timeout 120
```

The `{{email}}` and `{{password}}` placeholders are BrowserBash variables. Mark them as secrets and they are masked as `*****` in every log line, so credentials never leak into CI output. The `--agent` flag emits NDJSON, one JSON event per line, so a pipeline or an AI coding agent reads the verdict without parsing prose. Exit code 0 means passed, 1 failed, 2 an infrastructure or budget error, and 3 a timeout. Those exit codes are a frozen contract you can wire straight into a CI gate.

For the login flow specifically, the interesting assertions are negative as well as positive. You want a test that confirms a *wrong* password does not sign you in and instead surfaces the Kratos "credentials are invalid" message. Testing the unhappy path is where identity bugs hide, and phrasing it in English is natural: "attempt to sign in with a deliberately wrong password and confirm an invalid-credentials error appears and you remain on the login page." A Verify assertion then checks that the error text is visible and the URL still contains the login flow.

### Reusing a saved session instead of logging in every time

Retyping credentials on every run is slow and, for flows with a second factor, sometimes impossible to automate cleanly. BrowserBash lets you log in once by hand and save the browser session as a named profile:

```bash
browserbash auth save kratos-user --url http://localhost:4455/login

browserbash run "Open http://localhost:4455/sessions/whoami-ui and confirm the current identity email is shown" \
  --auth kratos-user --agent --headless
```

`auth save` opens a browser, you complete the login (including any second factor) once, press Enter, and the Playwright storageState is stored. Every later run with `--auth kratos-user` starts already signed in. If the saved profile's origins do not cover the URL you are testing, BrowserBash prints a warning rather than silently doing nothing.

## Testing registration and account recovery

Registration is where your identity schema shows up most directly, so it is the flow most likely to drift. A good registration test creates a genuinely unique identity each run, otherwise the second run collides with the first on a unique-email constraint. Describe the intent and let the agent handle the form: an objective like "open the registration page, fill in a unique email, set a strong password, submit, and confirm the account is now signed in" runs the same way as the login smoke test with `--agent --headless`.

If your schema requires email verification before the account is usable, the flow does not end at "signed in." Kratos sends a verification code or link, and a complete test checks that the verification step is reachable and the correct message renders. Full end-to-end verification (actually reading the email and clicking the link) needs a test mailbox, which is a larger setup; a lighter and still valuable test confirms that after registration the UI shows the "please verify your email" node.

Account recovery deserves its own test because it is a favorite target for attackers. Whether you run link-based or code-based recovery, the entry behavior is the same: a user submits an email, and Kratos responds with a neutral message that does not reveal whether the account exists. That neutral response is a security property you should test on purpose. Write an objective that submits recovery for a non-existent address and confirms the response does not leak account existence, then a second for a real address that confirms the flow proceeds to the code or link step. Enumeration-resistance is exactly the kind of security assertion that gets forgotten until it regresses.

### Handling CSRF and fresh flows correctly

Because BrowserBash drives the browser the way a person would, starting from the entry URL and clicking through, it naturally picks up a fresh flow ID and the anti-CSRF token that Kratos embeds in the page. You are not constructing flow URLs by hand or copying tokens, so a whole category of flaky "flow expired" and "CSRF token mismatch" failures disappears.

## Deterministic Verify assertions for a trustworthy verdict

An agent that decides things is useful for driving a UI, but you do not want your pass or fail verdict to hinge on a model's judgment. BrowserBash separates these concerns with `Verify` steps that compile to real Playwright checks with no LLM involvement. A Verify line can assert that the URL contains a string, that the page title is or contains something, that specific text is visible, that a named button or link or heading is visible, that an element count matches, or that a stored value equals an expected value. A pass means the condition actually held, and a fail comes with expected-versus-actual evidence in the `run_end.assertions` block and the Result.md assertion table.

For Kratos flows this matters a lot. In a login test, the agent-driven part signs in, which requires judgment about which fields to fill. The verdict, though, should be strict: the URL should no longer contain `/login`, a "Logout" link should be visible, and the identity email should appear on the page. Those are deterministic Verify assertions. If a future change breaks login, you get a fail with the exact expectation that was not met, not a vague "the agent thought it did not work." That is the difference between a test you can trust to gate a release and one you cannot.

Verify lines that fall outside the strict grammar still run, but they run agent-judged and are flagged `judged: true` in the output, so you can always tell which assertions were deterministic and which relied on the model.

## Composing Kratos flow suites with testmd v2

One-off `run` commands are great for smoke tests, but a real identity suite wants committable, reviewable files. BrowserBash uses `*_test.md` markdown files: a title, plain-English steps, `@import` for shared setup, and `{{variables}}` templating. The interesting upgrade for Kratos work is testmd v2, which you opt into with `version: 2` frontmatter. In a v2 file, steps run one at a time against a single browser session, and two deterministic step types never touch a model.

The first deterministic step type is API steps. You can issue `GET`, `POST`, `PUT`, `DELETE`, or `PATCH` calls, optionally with a body, and assert on the response status while storing values from the JSON response for later use. This is exactly what you need to seed an identity through the Kratos admin API before you test the login UI. The second type is Verify steps. In between, consecutive plain-English steps run as grouped agent blocks on the same page.

A registration-then-login suite reads almost like a runbook: an API step seeds a known identity, a block of English steps drives the login UI, and a Verify step confirms the signed-in state deterministically. Here is the shape of a v2 file, seeding the account first so the test is self-contained:

```markdown
# kratos-login_test.md
---
version: 2
---
# Ory Kratos login flow

POST http://localhost:4434/admin/identities with body {"schema_id":"default","traits":{"email":"seed-user@example.com"},"credentials":{"password":{"config":{"password":"{{password}}"}}}}
Expect status 201, store $.id as 'identity_id'

Open http://localhost:4455/login and sign in with email seed-user@example.com and password {{password}}

Verify url contains /welcome
Verify text "Signed in" is visible
Verify 'Logout' link visible
```

Two honest caveats. testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway; it does not yet run on local Ollama or OpenRouter directly. And the admin API is powerful, so keep it on an internal network. You can dig into the file format in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Running it locally and free with Ollama

A point worth dwelling on for security-conscious teams: BrowserBash is Ollama-first. By default it uses free local models and needs no API keys, so nothing about your Kratos setup, your test credentials, or your identity schema leaves your machine. It auto-resolves in order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For a login flow you test on `localhost`, keeping the whole loop on your machine is a genuine benefit, not a checkbox.

Be honest about the tradeoff, though. Very small local models (roughly 8B parameters and under) can be flaky on long multi-step objectives, and identity flows with verification and second factors get long. The sweet spot is a mid-size local model such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model for the hardest flows. For a two-field login smoke test a small model is usually fine; for a full registration-plus-verification suite, reach for something stronger.

## Wiring Kratos flow tests into CI and monitoring

A test suite that only runs on your laptop protects nobody. BrowserBash ships a GitHub Action that installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result.md artifacts, and posts a self-updating PR comment with a verdict table. It supports sharded matrix jobs and a per-suite dollar budget so a runaway run cannot cost you a fortune. The details are in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). For a Kratos suite, gate merges on login and registration passing, and let recovery and settings run on a nightly shard.

Beyond CI, there is monitor mode. Your Kratos login page is production infrastructure, and you want to know within minutes if it breaks, not when a user complains. `browserbash monitor` runs a test or objective on an interval and alerts only on a state change, pass to fail or fail back to pass, never on every green run. Point it at a Slack incoming webhook and it formats the message automatically; point it at any other URL and it sends the raw JSON payload.

```bash
browserbash monitor kratos-login_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ \
  --auth kratos-user
```

The replay cache is what makes this practical. A green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. So an always-on login monitor is nearly token-free and stays quiet until something genuinely breaks. That is synthetic monitoring for your identity provider, built from a test you already wrote.

## When plain-English testing is the right call, and when it is not

Testing by intent is a strong fit when your Kratos UI changes often, when you care more about "can a user actually log in" than about pixel-level DOM structure, and when you want tests that survive schema edits. It also fits when you want an AI coding agent to validate its own changes: BrowserBash exposes `run_objective`, `run_test_file`, and `run_suite` as MCP tools, so an agent editing your login page can check its work and read the structured verdict, where a failed test is a successful validation, not a broken tool call.

It is the wrong call in a few honest cases. If you need microsecond-precise timing assertions or you are load-testing the Kratos flow APIs directly, use a dedicated API and load tool; a browser-driving agent is the wrong instrument. If your flow is a pure API integration with no UI at all, the agent's UI-driving strength does not apply, though the v2 API steps still help you assert on responses. And if your team already has a mature Playwright suite that rarely breaks, ripping it out would be foolish; add intent-level tests for the flows that churn the most and keep the stable selector-based tests you already trust. No single tool is the answer to every testing question.

The table below sums up where each approach earns its keep.

| Concern | Selector-based end-to-end | Plain-English agent tests |
| --- | --- | --- |
| Kratos UI node churn | Breaks on rename or reorder | Tolerant, finds fields by intent |
| Fresh flow ID and CSRF token | Manual handling, flaky | Handled by driving from entry URL |
| Deterministic verdict | Yes, via assertions | Yes, via Verify steps (LLM-free) |
| Maintenance after schema edits | High | Low |
| Microsecond timing or load | Better fit elsewhere | Not the right tool |
| AI agent self-validation | Not native | Native via MCP tools |

The honest summary: use plain-English agent tests for the fragile, high-value, frequently-changing self-service flows, and keep strict tooling where determinism and raw performance dominate. You can read practical write-ups on the [BrowserBash blog](https://browserbash.com/blog) and see the project on [GitHub](https://github.com/PramodDutta/browserbash) to judge the fit for yourself.

## Putting it together for an Ory Kratos test plan

A sensible starting suite for Ory Kratos is four files. One login smoke test with both the happy path and a wrong-password negative path, wired into CI and monitored in production. One registration test that creates a unique identity and confirms the verification node renders. One recovery test that checks the neutral, enumeration-resistant response for an unknown email and confirms the flow proceeds for a known one. One settings test that reuses a saved session to change a profile trait and verify it persisted.

Each test describes intent, drives a real browser, and ends in a deterministic Verify assertion so the verdict is trustworthy. Add the API steps from testmd v2 to seed data, and you have self-contained tests that do not depend on hand-created accounts surviving between runs. The result is a security-relevant suite you will actually maintain, because maintaining it mostly means editing English, not chasing selectors.

## FAQ

### How do I test Ory Kratos login flows without brittle selectors?

Describe the login as an intent, such as "sign in with this email and password and confirm the signed-in state," and let an AI agent drive a real browser to find the fields and submit the flow. Because the agent works from the rendered page rather than a frozen selector, it survives Kratos UI node changes and schema edits. You then attach a deterministic Verify assertion, like checking the URL no longer contains the login path and a logout link is visible, so the pass or fail verdict does not depend on model judgment.

### Can I seed a Kratos identity before running a UI test?

Yes. In a testmd v2 file you can add an API step that POSTs to the Kratos admin identities endpoint to create a known account, assert the response status, and store the returned identity ID or email for later steps. That makes the login or settings test self-contained instead of relying on an account someone created by hand. Keep the admin API on an internal network only, since it is a privileged endpoint that should never be publicly exposed.

### Does BrowserBash send my Kratos credentials to a cloud service?

Not by default. BrowserBash is Ollama-first, so it uses free local models with no API keys, and nothing leaves your machine unless you explicitly configure a hosted model. Credentials passed as variables can be marked as secrets, which masks them as asterisks in every log line. If you do opt into a hosted model for harder flows, only then does the objective text reach that provider, so you stay in control of what is shared.

### How do I monitor a production Kratos login page for outages?

Use monitor mode to run your login test on an interval and alert only when the verdict changes from pass to fail or back, never on every green run. Point the notify flag at a Slack incoming webhook for formatted alerts, or at any other URL to receive the raw JSON payload. The replay cache means a passing monitor replays its recorded actions with no model calls, so an always-on check stays nearly free and quiet until something actually breaks.

Ready to test your identity flows by intent? Install with `npm install -g browserbash-cli`, point a plain-English objective at your Kratos login page, and read the verdict. An account is optional, but if you want the free cloud dashboard and hosted extras you can [sign up here](https://browserbash.com/sign-up).
