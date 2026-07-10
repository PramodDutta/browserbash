---
title: Test Descope Auth Flows With AI Browser Automation
description: "Learn to test Descope flows end to end with AI browser automation: verify passwordless login, magic links, and no-code widgets by intent."
date: 2026-05-24
category: security
---

If you have adopted Descope for authentication, you already know the tradeoff. The visual Flows builder and drop-in widgets let you ship passwordless login, magic links, and step-up MFA without hand-writing an auth server. The cost is that your login surface now lives inside a low-code canvas that changes shape as you drag connectors around. To test Descope flows reliably, you need something that checks intent (did the user actually get authenticated?) rather than brittle selectors tied to widget internals you do not control. That is exactly where AI browser automation earns its place: you write the objective in plain English, an agent drives a real Chrome browser through the flow, and you get a deterministic verdict back.

This guide walks through how to validate Descope authentication end to end using [BrowserBash](https://browserbash.com/features), the open-source validation layer for AI agents. We will cover passwordless email login, magic-link handling, the embedded flow widget, session reuse so you are not logging in on every test, and how to wire the whole thing into CI without it going flaky the first time Descope ships a UI tweak.

## Why Descope flows break traditional selector-based tests

Descope's core idea is that authentication is a flow, not a single form. A flow is a directed graph of screens and actions: enter email, branch on whether the user exists, send an OTP or a magic link, verify, maybe prompt for a passkey, then issue a session. You compose that graph in the Descope console and embed it with a web component (`<descope-wc>`) or the React SDK. The markup that renders inside the widget is Descope's, not yours.

That is great for velocity and terrible for selector-based tests. A Playwright or Cypress test that reaches into the widget with a locator like `input[data-testid="email-input"]` is coupled to an implementation detail Descope can rename in any release. Worse, flows are conditional. The screen a user sees depends on runtime state: a returning user skips the sign-up branch, a user with MFA enrolled gets an extra step, a flow with a "remember me" toggle changes the session behavior downstream. Encoding every branch as an explicit selector script means your test suite mirrors the flow graph, and every flow edit becomes a test edit.

Intent-based testing flips this. Instead of "click the element with this attribute," you describe the outcome: "sign in with the email address and confirm you land on the dashboard." An AI agent reads the live page, decides which control matches the intent, and acts. When Descope renames an input or reorders two screens, the objective still holds because the intent did not change. You are testing the authentication behavior, which is the thing your users actually depend on.

## What "verified by intent" actually means

Intent verification is not hand-waving. It is a specific split between two kinds of steps, and understanding the split is the difference between a test that looks green and a test that means green.

The first kind is the plain-English action step. "Enter the email into the sign-in field and submit." Here the agent has latitude: it reads the DOM, finds the control that best matches, and performs the action. This is where AI browser automation absorbs UI churn.

The second kind is the deterministic assertion. BrowserBash lets you write `Verify` steps that compile to real Playwright checks with no model judgment involved: URL contains a path, a specific heading is visible, a named button exists, a stored value equals what you expect. A pass means the condition held, and a fail arrives with expected-versus-actual evidence in the run output and the generated `Result.md` assertion table. So the agent uses judgment to navigate the flexible parts of the flow, and hard assertions lock down the parts that must be exactly right. You get resilience where you want it and rigor where you need it.

For a Descope login test, that means you let the agent handle "get me through the passwordless flow" and you assert deterministically on "the URL is now `/app/dashboard`" and "the heading `Welcome back` is visible." If Descope reshuffles the OTP screen, the agent adapts. If your app silently stops issuing a session, the `Verify` step fails loudly with evidence. You can read more about how these assertions compile on the [features page](https://browserbash.com/features).

## Setting up: install and a first objective

Getting started takes one install and one command. BrowserBash is a Node CLI, Apache-2.0 licensed, published as `browserbash-cli`.

```bash
npm install -g browserbash-cli

# One-shot: drive a real Chrome through the Descope login and store proof
browserbash run "Go to https://app.example.com/login, sign in with email jane@example.com using the Descope passwordless flow, complete the one-time code, and confirm the dashboard loads. Store the page heading as 'landing_heading'." --agent --timeout 180
```

The `--agent` flag makes the run emit NDJSON, one JSON event per line, so a CI job or another AI agent can consume the result without parsing prose. Exit codes are frozen and meaningful: `0` passed, `1` failed, `2` error or infra problem, `3` timeout. That contract is what lets you treat a login test as a real gate rather than a log you skim.

By default BrowserBash is Ollama-first: it looks for a local model before any API key, so nothing has to leave your machine. It auto-resolves in order from local Ollama to `ANTHROPIC_API_KEY` to `OPENAI_API_KEY` to OpenRouter. For a multi-step auth flow with conditional branches, model quality matters. Very small local models (around 8B and under) can get lost on long flows, so the practical sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. The [learn section](https://browserbash.com/learn) has more on model selection.

## Handling the one-time code and magic-link steps

Passwordless is the whole point of Descope, and the OTP or magic-link step is where naive automation stalls. There are two honest situations, and it helps to be clear about which one you are in.

### When the code is available to the test

If you control the receiving mailbox through a test inbox API, or your staging environment exposes the code (some teams surface the last OTP through an internal debug endpoint on non-production builds), you can feed it to the flow directly. The cleanest way is a hybrid test that seeds or fetches the value deterministically, then hands it to the agent to type.

BrowserBash's testmd v2 format is built for exactly this. You add `version: 2` frontmatter to a `*_test.md` file and steps execute one at a time against a single browser session. Two step types never touch a model: API steps (`GET/POST/PUT/DELETE` with an optional body, plus `Expect status N, store $.path as 'name'`) for seeding or fetching data, and `Verify` steps for checking the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

```markdown
---
version: 2
---

# Descope passwordless login with fetched OTP

- Go to https://staging.example.com/login and enter jane@example.com to start the Descope flow

GET https://staging.example.com/internal/last-otp?email=jane@example.com
Expect status 200, store $.code as "otp"

- Type {{otp}} into the verification code field and submit

Verify URL contains /app/dashboard
Verify "Welcome back" heading visible
```

The API step fetches the code with zero model calls, so it is fast and reproducible. The agent handles the two flexible UI moments (starting the flow, typing the code), and the `Verify` block asserts the session actually landed. One honest caveat: testmd v2 currently runs on the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter.

### When the code is genuinely out of band

Sometimes the OTP lands in a real inbox you cannot script against in the test, or the magic link goes to a personal address. In that case do not fake a PASS. The right move is to test the parts you can verify deterministically (the email-entry screen renders, the "check your email" confirmation appears, the correct copy and branding show up) and treat the actual code delivery as a separate concern validated by your email provider's own tooling. Testing the flow up to the send boundary is legitimate and useful. Pretending you verified an inbox you never read is not.

## Reusing a saved Descope session so you test once, not every time

Re-running the full passwordless dance on every test is slow and, if you are hitting a real OTP provider, expensive and rate-limited. BrowserBash's saved-login feature solves this. You log in once interactively, and the session (a Playwright storageState) is captured and reused.

```bash
# Log in through the Descope flow once; press Enter to save the session
browserbash auth save descope-jane --url https://app.example.com/login

# Every later run reuses the saved session, skipping login entirely
browserbash run "Confirm the account settings page shows the Descope-managed profile for jane@example.com" --auth descope-jane --agent
```

The `--auth` flag works on `run`, `testmd`, `run-all`, and `monitor`, and you can also set it as `auth:` frontmatter inside a test file. There is a useful guardrail: if the saved profile's origins do not cover the start URL you are targeting, BrowserBash prints a warning instead of silently proceeding as if you were logged in. That warning has saved me from the classic false green where the test "passes" because it never actually needed the session it thought it had.

Practically, you split your suite into one authentication test that exercises the real Descope login flow end to end, and many downstream tests that assume a logged-in session via `--auth`. The login flow itself gets thorough coverage in one place; everything else runs fast against a warm session. The [tutorials](https://browserbash.com/tutorials) walk through this pattern in more detail.

## Testing the embedded Descope Flow widget by intent

Many teams do not use Descope's hosted pages; they embed the flow with the web component or React SDK so the login lives inside their own app shell. Testing an embedded widget is where selector-based tools hurt most, because the widget's internals are a moving target and often live in shadow DOM.

Intent-based automation does not care about the boundary. You describe the visible goal, and the agent works against the rendered page as a user would see it. A test for an embedded sign-up-or-sign-in flow reads naturally:

```markdown
---
version: 2
auth: none
---

# Embedded Descope widget: new-user sign-up branch

- Open https://app.example.com and click the "Get started" button to reveal the Descope widget
- In the widget, enter newuser+{{run_id}}@example.com and continue to the sign-up branch

Verify "Create your account" heading visible
Verify "Continue" button visible

- Complete the sign-up with the displayed passwordless option

Verify URL contains /onboarding
```

Because the agent reads the live page rather than a hard-coded selector map, the same test survives the widget being restyled, the branch order changing, or Descope shipping a new control variant. What it will not survive is the intent itself changing, which is correct: if "Create your account" stops being the heading a new user sees, that is a real product change your test should flag.

A note on honesty here. This approach is not magic and it is not selector-free forever. If your flow has two visually identical buttons that differ only by an attribute, plain English can be ambiguous, and you should make the objective more specific ("the Continue button in the widget, not the marketing header") or fall back to a deterministic `Verify` on something unique. The goal is resilience, not the absence of thought.

## Wiring Descope auth tests into CI

A login test is only worth writing if it runs on every deploy. BrowserBash was built for CI first, which is why the NDJSON contract and exit codes are frozen.

For a whole folder of auth tests, `run-all` gives you a memory-aware parallel orchestrator: concurrency is derived from real CPU and RAM, previously-failed and slowest tests run first, and flaky tests get flagged. If you are paying for a hosted model, cost governance keeps a runaway suite from surprising you.

```bash
# Run the auth suite in CI, cap spend, emit JUnit for the dashboard
browserbash run-all ./tests/auth --junit out/junit.xml --budget-usd 2.00 --agent

# Split across parallel CI machines deterministically
browserbash run-all ./tests/auth --shard 2/4 --budget-usd 1.00
```

The `--budget-usd` flag stops launching new tests once the suite crosses the limit: remaining tests report `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit properties. Sharding computes a deterministic slice on sorted discovery order, so four parallel machines running `--shard 1/4` through `4/4` agree on the split with no coordination. There is also an official GitHub Action that installs the CLI, runs the suite, uploads artifacts, and posts a self-updating PR comment with the verdict table; the setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

The replay cache matters a lot for auth tests specifically. A green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. So your Descope login test is expensive the first time and nearly free after that, right up until Descope ships a UI change, at which point the agent re-engages exactly on the screens that moved. That is the behavior you want from an auth gate: cheap when stable, adaptive when it matters.

## Continuous monitoring: catch a broken Descope flow in production

Auth is the one flow where a silent break costs you real users immediately. A Descope config change, an expired connector credential, or a provider incident can take login down without throwing an error your logs catch. Monitor mode runs a test on an interval and alerts only when the pass-or-fail state changes, in either direction, so you are not drowning in green-run noise.

```bash
browserbash monitor ./tests/auth/descope-login.md --auth descope-jane --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload. Because the replay cache makes a stable monitor nearly token-free, running a login probe every ten minutes is cheap. When the flow breaks, you get one alert on the transition to red, and one more when it recovers, not a firehose. This turns your Descope login test into a synthetic monitor without standing up separate monitoring infrastructure.

## Using BrowserBash as an MCP tool for your AI agents

If you are building AI agents that themselves need to authenticate through Descope, or you want your coding agent to validate an auth change it just made, BrowserBash runs as an MCP server. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, and installing it into a host is one line.

```bash
claude mcp add browserbash -- browserbash mcp
```

The same pattern works for Cursor, Windsurf, Codex, and Zed. It exposes three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder run in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The important mental model: a failed auth test is a successful validation. The tool call succeeds, and your agent reads the verdict to decide what to do next. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

## When intent-based testing is the right call, and when it is not

Being honest about fit builds more trust than blanket claims, so here is the balanced view.

| Situation | Intent-based (BrowserBash) | Selector-based (raw Playwright/Cypress) |
| --- | --- | --- |
| Descope flow UI changes often | Strong: objectives survive churn | Weak: selectors break on rename |
| Embedded widget / shadow DOM | Strong: reads rendered page | Painful: shadow piercing, brittle |
| Millisecond-precise timing assertions | Not the tool | Strong: full control |
| Deterministic session-state checks | Strong: `Verify` compiles to real checks | Strong: native expectations |
| Zero external dependencies, air-gapped | Strong: Ollama-first, local | Strong: no model needed |
| Very long, deeply branched flows on tiny models | Risky: small models drift | N/A |

Choose intent-based AI automation when your Descope flows evolve, when the login lives inside an embedded widget, and when you want tests that read like the behavior they protect. It shines for the exact surface Descope owns and you do not.

Reach for raw Playwright when you need microsecond-level timing control, when you are asserting on internal API contracts rather than user-visible outcomes, or when a flow is so deterministic and stable that the flexibility of an agent buys you nothing. Many teams run both: BrowserBash for the user-facing auth journeys that change, hand-written specs for the low-level invariants that do not. And if you already have a Playwright auth spec, `browserbash import` converts it to a plain-English `*_test.md` heuristically and deterministically, dropping anything untranslatable into an `IMPORT-REPORT.md` rather than silently guessing. You can see real teardown examples on the [case study page](https://browserbash.com/case-study).

The through-line is simple. Descope moved your authentication into a flow builder to buy speed. Test it with a tool that speaks the same language: intent in, deterministic verdict out.

## FAQ

### Can AI browser automation test Descope passwordless and magic-link flows?

Yes. An AI agent drives a real Chrome browser through the Descope flow the way a user would, so it handles the email-entry screen, the OTP step, and the post-login redirect by intent rather than by brittle selectors. For the one-time code itself, the cleanest approach is a hybrid test that fetches the code from a test inbox or staging endpoint and hands it to the agent. If the code lands in an inbox you cannot script against, test the flow up to the send boundary and validate delivery with your email provider's tooling instead of faking a pass.

### How do I test the embedded Descope Flow widget without brittle selectors?

Describe the visible goal in plain English and let the agent work against the rendered page, which sidesteps the shadow DOM and moving internals that break selector-based tests. Combine flexible action steps for navigation with deterministic Verify steps that compile to real Playwright checks for the outcomes that must be exact, such as the URL after login or a specific heading. This gives you resilience where the widget changes and rigor where the session state must be correct. If two controls are genuinely ambiguous, make the objective more specific rather than guessing.

### Do I have to log in on every Descope test run?

No. Use `browserbash auth save` to log in through the Descope flow once and capture the session, then reuse it with the `--auth` flag on run, testmd, run-all, and monitor commands. The typical pattern is one thorough test that exercises the full login flow and many downstream tests that assume a warm session. BrowserBash also warns you if a saved profile's origins do not cover your target URL, which prevents the false green where a test passes without actually being authenticated.

### Is BrowserBash free and does it need to send my auth data to the cloud?

BrowserBash is free and open-source under Apache-2.0, and it is Ollama-first, meaning it defaults to a local model with no API keys so nothing has to leave your machine. You can bring your own hosted key (Anthropic, OpenAI, or OpenRouter) when a hard, deeply branched flow needs a stronger model, but that is a choice, not a requirement. The local dashboard and replay cache all run on your machine, and cloud upload is strictly opt-in.

Ready to test your Descope auth flows by intent? Install the CLI with `npm install -g browserbash-cli` and write your first login objective in a minute. An account is optional, but you can grab one and explore the hosted dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
