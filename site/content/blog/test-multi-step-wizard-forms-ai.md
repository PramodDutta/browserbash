---
title: Test Multi-Step Wizard Forms End to End With AI
description: "Learn how to test multi step wizard forms with AI, variables, saved auth, and deterministic Verify checks at each step boundary."
date: 2026-07-24
category: guide
---
When you test multi step wizard forms, the risk is rarely one input field. The risk is state moving across steps: signup data, checkout choices, validation messages, plan selection, confirmation screens, and recovery after back navigation. BrowserBash lets you describe the full wizard in plain English, drive a real Chrome or Chromium browser, and add deterministic Verify checks at the step boundaries that matter.

## Why test multi step wizard forms is harder than a normal happy path
Wizard forms hide complexity behind a clean interface. One step may depend on a choice made three screens earlier. Validation can be client-side on one page and server-side on the next. A progress indicator may say step three, while the route still contains step two. Browser state, saved drafts, feature flags, and responsive layouts all affect the journey. Selector-heavy tests often become page-object chains that are hard to read and easy to break during design iteration.

A selector-first script usually assumes the page is already in the right state. That assumption is fragile for multi-step wizard form. Real users wait, retry, scroll, scan labels, notice errors, and correct themselves. BrowserBash starts closer to that user model. You give it a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step. It is not replacing every low-level test you already have. It gives SDETs and AI-agent builders a validation layer that can exercise a flow the way a person describes it.

BrowserBash is free and open source under Apache-2.0, created by The Testing Academy and founded by Pramod Dutta. Install it with `npm install -g browserbash-cli`, then run `browserbash`. The current version is 1.5.1. Its strongest fit is end-to-end validation where the page can change shape but the user intent stays stable.

## How BrowserBash helps you test multi step wizard forms
BrowserBash works well for wizard forms because the objective can describe the journey the way a user or QA lead would: choose a plan, enter account details, add billing information, review, and confirm. The agent drives one browser session, and testmd v2 can execute steps one at a time while deterministic Verify steps check each transition. That gives you readability without giving up structured verdicts.

The important distinction is that BrowserBash is not a selector recorder. You do not write page objects. You describe the business outcome and let the agent inspect the live page. Under the hood, it can use local Chrome by default, or providers such as CDP, Browserbase, LambdaTest, and BrowserStack. Stagehand is the default engine, and the builtin engine is available for the Anthropic tool-use loop and required for LambdaTest or BrowserStack.

The model story matters for test privacy. BrowserBash is Ollama-first, which means it defaults to free local models with no API keys and nothing leaving your machine. If a local Ollama model is not available, it can auto-resolve to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For hard flows, very small local models around 8B parameters and under can be flaky on long multi-step objectives. A mid-size local model such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model, is a more realistic choice.

```bash
npm install -g browserbash-cli
browserbash run "Open https://staging.example.com/signup, complete the team signup wizard with {{company_name}}, and verify the welcome screen appears"
```

For deeper examples, the [BrowserBash learning center](https://browserbash.com/learn) and [BrowserBash tutorials](https://browserbash.com/tutorials) are useful places to connect the concepts to working CLI usage.

## Write a plain-English objective for test multi step wizard forms
A good wizard objective names the type of user, the data set, and the final confirmation. If step boundaries are important, say what should be visible after each one. For checkout, identify whether payment is sandboxed. For signup, identify whether email verification is skipped, simulated, or handled in a separate test.

A good objective names the start URL, the data you expect to use, the visible signals that matter, and the final state. Avoid wording that says only "make sure it works." That gives an agent too much freedom and gives a human reviewer too little information. Say what must be true when the flow succeeds.

For example, you can write the objective as a sentence for a quick local check, then move it into a committed markdown test once the flow becomes part of your release gate. BrowserBash writes a human-readable `Result.md` after each run, so the result is inspectable by a developer, tester, or AI coding agent.

A practical objective has three parts. First, describe the setup: account, environment, fixture, or saved login. Second, describe the action in user language. Third, describe the assertion in terms a product owner would recognize. That keeps the test stable when a CSS class changes, when a component moves, or when a team swaps one implementation detail for another.

## Use markdown tests and variables without leaking secrets
Variables keep wizard tests reusable across environments. Use them for names, emails, company names, plan names, addresses, and coupon codes. testmd v2 is especially helpful because you can place Verify steps between grouped plain-English blocks, which turns the wizard into a readable sequence of user states.

BrowserBash markdown tests are committable `*_test.md` files. They support `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, which is the right default for credentials, temporary codes, API tokens, and customer-like fixture data.

In version 1.5.0, testmd v2 added `version: 2` frontmatter. Steps execute one at a time against a single browser session. Two deterministic step types never touch a model: API steps for seeding data and Verify steps for checking UI state. Consecutive plain-English steps run as grouped agent blocks on the same page. v1 files without frontmatter behave as before. One caveat is important: testmd v2 currently drives the builtin engine, so it needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run on Ollama or OpenRouter directly.

```bash
browserbash run-test site/tests/team_signup_wizard_test.md --auth qa-user --agent
browserbash run-all site/tests --shard 2/4 --budget-usd 2.50
```

A v2 test can combine setup, intent, and deterministic assertions:

```bash
---
version: 2
auth: qa-user
---
GET https://staging.example.com/api/test-signup/reset?email={{email}} Expect status 200, store $.id as 'signup_id'
Open https://staging.example.com/signup and start the team signup wizard with {{email}} and {{company_name}}
Choose the Pro plan, complete the profile step, review the details, and submit the wizard
Verify URL contains "/welcome"
Verify text "Welcome to your workspace" is visible
```

The `--agent` flag emits NDJSON, one JSON event per line, with exit codes designed for automation: 0 for passed, 1 for failed, 2 for error, infrastructure failure, or budget stop, and 3 for timeout. AI coding agents do not need to parse prose. They can read structured events and the final verdict.

## Make verification deterministic wherever possible
For wizards, deterministic checks should appear at boundaries: account step visible, plan selected, billing step visible, review heading visible, confirmation visible. This prevents a test from wandering through the form and passing only because it reached some later page. If a Verify step fails, the assertion table shows expected versus actual evidence, which makes the failure easier to triage.

BrowserBash 1.5.0 introduced deterministic Verify assertions. Supported Verify steps compile to real Playwright checks rather than LLM judgment. That includes URL contains, title is or contains, visible text, a named button, link, or heading being visible, element counts, and stored value equality.

This is the difference between "the agent thinks the page looks right" and "the condition held in the browser." If a deterministic Verify step fails, the evidence is reported in `run_end.assertions` and in the assertion table in `Result.md`. If a Verify line falls outside the grammar, it can still run as agent-judged, but it is flagged with `judged: true` so you can separate deterministic checks from judgment-based checks.

For multi-step wizard form, that split matters. Let the agent do the parts humans naturally do, such as recognizing a visible control or moving through a changing interface. Let deterministic assertions own the final gate wherever the condition can be expressed as URL, title, text, count, or stored value.

## Handle authentication and session setup cleanly
Some wizard tests start anonymous, such as signup. Others start authenticated, such as onboarding, workspace setup, or checkout inside an existing account. Saved auth is useful for the second category. For anonymous signup, use API setup to reset the email or workspace before each run so old drafts do not leak into the test.

Saved logins reduce noise in tests that should not spend half their time logging in. With BrowserBash 1.5.0, `browserbash auth save <name> --url <login-url>` opens a browser. You log in once, press Enter, and BrowserBash saves the Playwright storageState. Reuse it with `--auth <name>` on run, testmd, run-all, and monitor, or with `auth:` frontmatter in a test file.

A useful safety detail is that a profile whose saved origins do not cover the target start URL prints a warning instead of silently doing nothing. That helps when staging, preview, and production domains look similar but do not share browser storage.

Save the profile with `browserbash auth save qa-user --url https://staging.example.com/login`, then reuse it with `browserbash run "Open the onboarding wizard for the saved QA account and verify the Company details step is visible" --auth qa-user --viewport 1280x720`.

For teams adopting BrowserBash across more flows, the [BrowserBash features](https://browserbash.com/features), [BrowserBash blog](https://browserbash.com/blog), and [open-source GitHub repo](https://github.com/PramodDutta/browserbash) give you a quick way to check what is local, what is optional cloud dashboard, and what is implemented in the open.

## Run test multi step wizard forms in CI and agent workflows
Wizard tests are good CI gates because they represent revenue and activation paths. Use sharding when the suite grows, and use budget limits to prevent one branch from launching an unbounded set of expensive AI runs. For AI coding agents, the MCP run_test_file tool returns structured verdict JSON so the agent can tell whether a UI change broke the funnel.

The MCP server added in 1.5.0 makes BrowserBash usable from AI coding agents without wrapping the CLI yourself. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio. You can add it to an MCP host with `claude mcp add browserbash -- browserbash mcp`, with the same idea applying to Cursor, Windsurf, Codex, and Zed. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

The MCP tools are intentionally small: `run_objective` for one plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder in parallel. Each returns structured verdict JSON with `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. A failed test is a successful validation. The tool call succeeds, and the agent reads the verdict instead of guessing.

For CI, BrowserBash includes `action.yml` at the repo root. It installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports `shard:` matrix jobs and `budget-usd:`, and posts a self-updating PR comment with the verdict table. The [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) explains the setup details.

## Monitor the flow without noisy alerts
Monitor the highest-value wizard path, not every variation. A signup or checkout wizard monitor should use sandbox data and alert only when the state changes from pass to fail or fail to pass. If the wizard creates persistent records, add cleanup or use a test environment that resets data regularly.

Monitor mode is useful when multi-step wizard form has a history of breaking after deployments, provider changes, or design-system updates. `browserbash monitor <test|objective> --every 10m --notify <webhook>` runs on an interval and alerts only on pass to fail or fail to pass state changes. It does not page the team on every green run. Slack incoming-webhook URLs get Slack formatting automatically, while other URLs receive the raw JSON payload.

The replay cache also matters for monitoring cost. A green run records its actions. The next identical run replays them with zero model calls, and the agent steps back in only when the page changed. That makes an always-on monitor much more practical than a naive AI agent that spends tokens every ten minutes for the same unchanged screen.

Cost governance gives you another guardrail. `run_end` carries a `cost_usd` estimate from a bundled per-model price table. Unknown models get no estimate rather than a fake number. `run-all --budget-usd 2.50` or `--budget-tokens` stops launching new tests after the suite crosses the budget. Remaining tests are reported as skipped, the suite exits 2, and spend lands in `RunAll-Result.md` and JUnit properties.

## When to choose this approach, and when not to
Choose BrowserBash when the wizard is user-facing, multi-screen, and sensitive to UI changes. It is a strong fit for signup, onboarding, checkout, quote builders, and admin setup flows. Choose unit or API tests for validation rules, pricing calculations, and state-machine transitions that can be tested faster below the browser.

Choose BrowserBash when the user journey matters more than implementation details. It is a strong fit when your team wants to express tests in product language, when AI coding agents need an independent browser verdict, or when selectors are expensive to maintain because the UI is still moving.

Keep lower-level tests where they are cheaper and more precise. A pure unit test is better for date math, permission predicates, parser behavior, or API schema validation. A hand-written Playwright test can still be the best tool when you need exact control of a browser primitive or a highly specialized assertion. BrowserBash is the validation layer on top of those checks, especially for flows that benefit from natural language intent and structured verdicts.

Do not treat any AI browser agent as magic. Be explicit about data, expected state, and boundaries. Use deterministic Verify steps for the final gate. Use saved auth instead of repeatedly exercising login unless login is the subject of the test. Pick a capable model for long journeys. Those choices are what turn a flashy demo into a test you can run before a merge.

## Practical checklist before you add the test
Before adding a wizard test, map the step boundaries and decide which ones deserve deterministic Verify lines. Prepare unique test data. Decide whether the journey starts anonymous or authenticated. Then keep the objective focused on one path. A single giant wizard test that covers every branch is harder to debug than a few clear paths with shared imports.

Before committing a multi-step wizard form test, run through a short checklist. Is the start state controlled? Are variables used for environment-specific values? Are secrets masked? Is the final assertion deterministic? Does the test explain what failure means? Can it run in CI without a person present, or is it intentionally an interactive smoke check?

For BrowserBash specifically, decide whether the flow belongs in a single objective, a `*_test.md` file, or a suite. Use `--viewport` for a single responsive size, and use `--matrix-viewport 1280x720,390x844` when the same test should run across desktop and mobile widths. Use `run-all --shard 2/4` when parallel CI machines need deterministic slices based on sorted discovery order.

If you are migrating from Playwright, `browserbash import <specs-or-dir>` can convert many specs into plain-English `*_test.md` files deterministically, with no model involved. It handles common goto, click, fill, press, check, selectOption, getBy locators, and common expects. Anything untranslatable goes to `IMPORT-REPORT.md` instead of being dropped or invented. The recorder is useful for new manual discovery: `browserbash record <url>` opens a visible browser, lets you click through once, and writes a plain-English test when you stop it.

For wizards, resist the urge to cover every branch in one long objective. Long flows are harder for humans to review and harder for agents to keep in working memory. Create one clear happy path, then add smaller focused tests for abandoned drafts, validation errors, plan changes, or back-button behavior. If the wizard writes records as it goes, seed and clean up data through API steps or environment tooling. Use unique emails and company names so a failure points to the current run, not yesterday's draft. The best wizard test reads like a product acceptance scenario and fails at the step where the user would actually be blocked.
Also decide how failure should be triaged. A blocked Next button, a missing review heading, and a bad confirmation URL point to different owners. Clear step-boundary assertions make that ownership visible.

## FAQ
### How do I test a multi-step wizard with AI?
Describe the full user journey in plain English and add deterministic Verify checks at important step boundaries. BrowserBash drives a real browser and returns structured results. Variables keep test data readable and reusable.

### Should I verify every step in a wizard?
Verify the steps that represent meaningful transitions or common failure points. You do not need an assertion after every click. Focus on headings, selected plan state, review pages, and final confirmation.

### Can wizard tests run in CI?
Yes, if the data setup is controlled and any payment or email steps are sandboxed. Use saved auth for authenticated onboarding flows and API setup for anonymous signup data. Keep interactive human steps out of unattended CI.

### What causes wizard form tests to fail unexpectedly?
Old draft state, reused emails, unclear validation messages, responsive layout differences, and vague objectives are common causes. Use unique variables, reset data, and make the expected step state explicit.

Ready to try it locally? Install BrowserBash with `npm install -g browserbash-cli`, then run a plain-English browser check from your terminal. You can also [sign up](https://browserbash.com/sign-up), and an account is optional because the CLI and local dashboard work without one.
