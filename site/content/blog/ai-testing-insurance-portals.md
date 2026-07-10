---
title: AI Browser Testing for Insurance Quote and Claim Portals
description: "AI testing for insurance portals validates multi-step quote and claim wizards by intent, with PII masking and deterministic verdicts for regulated flows."
date: 2026-06-25
category: use-case
---

Insurance quote and claim portals are some of the hardest web flows to test, which is exactly why AI testing for insurance portals is worth getting right. A single auto-quote wizard can span eight or nine screens: vehicle lookup, driver history, coverage sliders, discount toggles, a soft-credit consent checkbox, and a rate that recalculates every time you touch anything. Claims flows are worse, because they branch on policy type, loss date, and whether a document upload succeeded. Traditional selector-based tests break the moment marketing reorders a step or renames a field, and your QA team spends more time repairing locators than catching real defects. BrowserBash takes a different path: you write the objective in plain English, an AI agent drives a real Chrome browser through the wizard step by step, and you get a deterministic pass or fail with structured evidence you can drop into a compliance record.

This article walks through how to validate quote and claim journeys by intent rather than by brittle DOM paths, how to keep personally identifiable information out of your logs, and where an AI-driven approach genuinely helps versus where a hand-written Playwright suite is still the better tool.

## Why insurance portals break conventional test automation

Most insurance carriers run their front end on top of a rating engine and a policy administration system that neither the QA team nor the marketing team fully controls. The rating engine can change a premium mid-session. The CMS layer lets a product owner reorder wizard steps without a code review. A/B tests swap button copy and DOM structure on a percentage of traffic. Every one of those changes is invisible to a `data-testid` selector until the test goes red.

Here is what a typical brittle failure looks like. Your Playwright suite fills a field located by `#applicant-dob`. A redesign renames it to `#driver-birthdate` and nests it two divs deeper inside a new "Primary Driver" accordion. The test throws a locator timeout. Nothing about the actual user experience broke, but your pipeline is red and someone spends an afternoon on it. Multiply that across a nine-step wizard rendered in three states (new business, endorsement, renewal) and you understand why insurance QA teams quietly disable half their end-to-end suite.

The second problem is data. Quote and claim forms are magnets for PII: names, dates of birth, driver license numbers, VINs, Social Security fragments, prior-carrier account numbers. If your test framework logs raw form values on failure, that PII lands in CI artifacts, screenshots, and console output, which is a compliance problem in a regulated industry. You need a testing approach that treats secrets as first-class, not as an afterthought you bolt on later.

## Testing by intent instead of by selector

BrowserBash flips the model. You do not tell it *where* the date-of-birth field is; you tell it *what the applicant is trying to do*. The agent reads the live page, decides which element matches the intent, acts, and reports what happened. When marketing renames the field or moves it into an accordion, the objective still reads "enter the driver date of birth" and it still works, because the agent is matching meaning, not a CSS path.

Install the CLI and drive a quote flow with a single objective:

```bash
npm install -g browserbash-cli

browserbash run "Open the auto insurance quote page, choose 'New quote', \
  enter a 2019 Honda Civic, set the driver age to 34 with a clean record, \
  select the standard coverage tier, and store the displayed monthly premium as 'quote'" \
  --agent --headless --timeout 180
```

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or an AI coding agent reads the outcome without parsing prose. You get a `step` event for each action the agent takes and a `run_end` event carrying the final verdict, the stored `quote` value, a `cost_usd` estimate, and `duration_ms`. Exit codes are frozen and machine-readable: `0` passed, `1` failed, `2` error or infra problem, `3` timeout. That is enough to gate a deploy without a human reading a report.

By default BrowserBash is Ollama-first: it uses a free local model, no API keys, and nothing about the quote data leaves your machine. That property alone matters in insurance, where sending applicant PII to a third-party model endpoint can trip a data-residency clause. If you want more horsepower for a long branching claims flow, the CLI auto-resolves to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, but the default keeps everything local. Read more about the model-resolution order on the [features page](https://browserbash.com/features).

### One honest caveat on model size

Very small local models, roughly 8B parameters and under, get flaky on long multi-step objectives. A nine-screen quote wizard with conditional discount logic is exactly the kind of flow where an under-powered model loses track of state halfway through. The practical sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. Do not judge the tool on a 3B model failing a nine-step claim submission; that is the wrong instrument for the job, and pretending otherwise would waste your afternoon.

## Deterministic Verify assertions for regulated flows

Driving a wizard by intent is only half the story. In a regulated industry you also need proof that a specific condition held, and you do not want that proof to depend on a language model's judgment. This is where deterministic `Verify` assertions come in. Inside a Markdown test file, a `Verify` line compiles to a real Playwright check with no LLM in the loop: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, or a stored value equals. A pass means the condition literally held. A fail comes with expected-versus-actual evidence written into `run_end.assertions` and the human-readable `Result.md` table.

That distinction is the difference between "the AI thinks the premium looks right" and "the premium field equals the value the rating engine returned." For an insurance audit trail, you want the second one. Here is a `Verify`-backed quote test as a committable `*_test.md` file:

```markdown
# Auto quote happy path

- Open the auto insurance quote portal
- Start a new quote for a 2019 Honda Civic
- Enter driver age 34 with no prior claims
- Select the standard coverage tier
- Store the displayed monthly premium as 'premium'

Verify: text "Your estimated monthly premium" is visible
Verify: 'Continue to application' button is visible
Verify: url contains "/quote/summary"
```

Every `Verify` line here runs deterministically. If the summary URL is wrong or the Continue button never rendered, you get a hard fail with evidence, not a soft AI opinion. Verify lines that fall outside the supported grammar still run, but they are agent-judged and flagged `judged: true` in the output, so you can always tell which assertions were deterministic and which leaned on the model. That transparency is the point.

## Multi-step claims wizards with testmd v2

Quote flows are mostly linear. Claims flows branch, and they often need seed data: an existing policy, a specific loss date, a claim number generated by an API before the UI can display it. testmd v2 handles this by executing steps one at a time against a single browser session, and by adding two deterministic step types that never touch a model.

You opt in with `version: 2` frontmatter. API steps (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) let you seed a policy or a claim directly against your test API and capture an ID. `Verify` steps then confirm that the seeded state shows up correctly through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page, so the browsing context and any logged-in session carry through the whole flow.

```markdown
---
version: 2
auth: policyholder
---

# File a claim against a seeded policy

POST {{API}}/test/policies with body {"type":"auto","status":"active"}
Expect status 201, store $.policyId as 'policyId'

- Open the claims dashboard
- Start a new claim for policy {{policyId}}
- Select loss type "collision" and set the loss date to yesterday
- Upload the sample estimate document
- Submit the claim

Verify: text "Claim submitted" is visible
Verify: 'Claim reference' heading is visible
Verify: url contains "/claims/confirmation"
```

The API step seeds a clean, active policy and hands the `policyId` to the UI steps, so the test is not at the mercy of whatever leftover data happens to be in the environment. This is how you make a claims test reproducible run after run. One honest limitation: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. If strict local-only execution is a hard requirement for your claims data, keep those flows on v1 objectives for now and use v2 where a gateway is allowed.

## Keeping PII and secrets out of your logs

Insurance testing lives and dies on data handling. BrowserBash was built with secret-marking as a core feature, not a patch. Variables you mark as secret are masked as `*****` in every log line, every NDJSON event, and every `Result.md` artifact. A driver license number typed into a form never shows up in plaintext in a CI log.

The recorder respects this too. When you run `browserbash record` and click through a real login or a claim submission, password fields never leave the page. The capture script sends only a secret marker, and the generated test step reads `Type {{password}} into ...` rather than embedding the actual value. So you can record a realistic claims flow using a real test account and commit the generated test without leaking the credential.

The replay cache is equally careful. A green run records its actions, and the next identical run replays them with zero model calls, but secrets are never baked into the cache. The masking holds across the record-replay boundary. For an always-on production monitor, that means you get near-token-free re-runs without ever persisting PII into a cache file on disk.

### Saved logins without re-authenticating every test

Most insurance portals gate the interesting flows behind a login. Re-authenticating on every test is slow and, if you script the credential inline, a leak risk. Instead, save the session once:

```bash
browserbash auth save policyholder --url https://portal.example-insurer.com/login
```

That opens a browser, you log in as your test policyholder once, press Enter, and BrowserBash saves the Playwright storageState. Every subsequent run reuses it with `--auth policyholder`, or with `auth: policyholder` in the test frontmatter as shown in the claims example above. If a saved profile's origins do not cover the start URL you point it at, the CLI prints a warning instead of silently doing nothing, which saves you a confusing debugging session. The [tutorials](https://browserbash.com/tutorials) walk through the full saved-login setup end to end.

## Running the full portal suite in CI

A real insurance QA suite is not one test; it is dozens. New business, endorsements, renewals, first-notice-of-loss, claim status lookup, document upload, payment. You want them to run in parallel, stay within a token budget, and split cleanly across CI machines. The `run-all` orchestrator handles all three.

```bash
browserbash run-all ./portal-tests \
  --shard 2/4 \
  --budget-usd 2.50 \
  --junit out/junit.xml
```

Sharding is deterministic: `--shard 2/4` runs a fixed slice computed on sorted discovery order, so four parallel CI machines each take a quarter of the suite without any coordination between them. The budget flag is a hard stop: once estimated spend crosses `2.50`, `run-all` stops launching new tests, reports the remaining ones as `skipped`, exits with code `2`, and records the spend in `RunAll-Result.md` and the JUnit `<properties>` block. For a team on hosted models, that is a real guardrail against a runaway suite quietly burning a hundred dollars overnight.

The orchestrator also derives concurrency from actual CPU and RAM rather than a fixed guess, orders previously-failed and slowest tests first so you learn about breakage sooner, and flags flaky tests it sees pass and fail intermittently. If you already have a Playwright suite, `browserbash import` converts specs to plain-English `*_test.md` files heuristically and deterministically, with no model involved, so you can migrate incrementally rather than rewriting everything by hand. Anything it cannot translate cleanly lands in an `IMPORT-REPORT.md` instead of being silently dropped or invented.

### Wiring it into GitHub Actions

The official GitHub Action installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result artifacts, supports a `shard:` matrix and a `budget-usd:` cap, and posts a self-updating PR comment with the verdict table. For an insurance team, that PR comment becomes the reviewable record that the quote and claim flows passed before a merge. The full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## Always-on monitoring for production quote flows

Testing in CI catches regressions before they ship. It does not catch the rating engine going down at 2am, or a third-party VIN-lookup service timing out on live traffic. For that you want synthetic monitoring against production.

```bash
browserbash monitor ./portal-tests/quote_happy_path_test.md \
  --every 10m \
  --notify https://hooks.slack.com/services/XXXX/YYYY/ZZZZ
```

Monitor mode runs the test on an interval and alerts only on state changes, both directions. It does not spam you on every green run; it pings you when a passing flow starts failing, and again when it recovers. Slack incoming-webhook URLs get Slack formatting automatically, and any other URL gets the raw JSON payload for your own alerting pipeline. Because the replay cache makes each re-run nearly token-free, running a quote-flow monitor every ten minutes does not translate into a large model bill. That is a genuinely cheap way to know your public quote funnel is up before your customers or your revenue team tell you it is not.

## Exposing BrowserBash to your AI agents over MCP

If your team builds with AI coding agents (Claude Code, Cursor, Windsurf, Codex, Zed), you can hand them BrowserBash as a validation layer over the Model Context Protocol. One line wires it in:

```bash
claude mcp add browserbash -- browserbash mcp
```

That serves the CLI over MCP on stdio and exposes three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder run in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms), so the agent reads the result directly. A key mental model: a failed test is a *successful validation*. The tool call succeeds, the agent reads the verdict, and it learns that the quote flow it just changed broke the premium display. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash` if you prefer to install it from there. The [learn section](https://browserbash.com/learn) covers the agent-integration patterns in more depth.

## When AI testing fits, and when it does not

No tool is the right answer for everything, and pretending otherwise would cost you credibility with your own team.

| Scenario | Best fit |
| --- | --- |
| Multi-step quote or claim wizard with shifting UI copy | AI testing by intent |
| Assertions that must hold exactly for an audit trail | `Verify` deterministic checks |
| A stable, high-volume unit-level check on one component | Hand-written Playwright |
| Pixel-perfect visual regression on a rate table | Dedicated visual-diff tooling |
| Seeding a policy then verifying it through the UI | testmd v2 (API step + Verify) |
| A five-year-old suite of thousands of stable specs | Keep Playwright, import selectively |

AI-driven browser testing shines when the UI changes often, when the flow is described more naturally by intent than by selectors, and when you want a suite that survives a marketing redesign. It is the right tool for the sprawling, frequently-tweaked quote and claim journeys that define insurance front ends.

It is not the right tool for everything. If you need microsecond-precise unit assertions on a single React component, a hand-written test is faster and cheaper. If you need true pixel-level visual regression on a rate comparison table, a dedicated visual-diff product will serve you better; BrowserBash validates behavior and content, not pixel deltas. And if you already run a large, stable Playwright suite that rarely breaks, do not rip it out. Use `browserbash import` to migrate the flaky, high-churn flows and leave the stable ones alone. The honest position is that AI testing for insurance portals is a strong complement to your existing stack, targeted at the flows that hurt the most, not a wholesale replacement for every test you have ever written.

BrowserBash is free and open-source under Apache-2.0, so evaluating it against your real portal costs you nothing but time. Point it at a staging quote wizard, write three objectives, and see whether they survive a field rename that would have broken your selector suite. That single experiment tells you more than any article can. You can browse real-world write-ups on the [case study page](https://browserbash.com/case-study) if you want to see the pattern applied end to end.

## FAQ

### Is it safe to run AI testing on insurance portals that handle PII?

Yes, with the right setup. BrowserBash defaults to local Ollama models so applicant data never leaves your machine, and variables you mark as secret are masked as asterisks in every log line, NDJSON event, and result file. Password fields captured by the recorder never leave the page, and secrets are never written into the replay cache. For strict data-residency requirements, keep the default local model and avoid routing PII to hosted endpoints.

### How does AI testing handle multi-step quote and claim wizards that keep changing?

The agent drives the wizard by intent rather than by CSS selector, reading the live page and matching each objective to the right element. When a field is renamed or a step is reordered, the plain-English objective still describes what the user is doing, so the test keeps working without a rewrite. This is the main reason AI testing suits insurance portals, where marketing and CMS changes break selector-based tests constantly.

### Can I get deterministic pass or fail results instead of AI guesses?

Yes. Verify steps in a Markdown test compile to real Playwright checks with no language model in the loop, covering URL, title, visible text, named elements, counts, and stored values. A pass means the condition literally held, and a fail includes expected-versus-actual evidence in the result table. Any Verify line outside the supported grammar still runs but is clearly flagged as agent-judged so you always know which assertions were deterministic.

### Do I need to log in on every test run against a gated portal?

No. Run browserbash auth save once to log in through a real browser and capture the session as Playwright storageState, then reuse it with the auth flag on any run, test, suite, or monitor. If the saved profile does not cover the URL you point it at, the CLI warns you instead of failing silently. This removes the re-login tax that slows down gated insurance claim and policy-management flows.

Ready to try it against your own quote and claim flows? Install with `npm install -g browserbash-cli` and write your first objective in minutes. An account is optional and everything runs locally by default, but you can create one at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want the free cloud dashboard and 15-day run history.
