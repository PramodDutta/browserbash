---
title: AI Testing for Government and Citizen Service Portals
description: "AI testing for government portals: verify form-heavy citizen service flows by intent, with honest handling of accessibility and session timeouts."
date: 2026-07-01
category: use-case
---

If you maintain a benefits application, a tax filing wizard, or a permit renewal flow, you already know the pain. AI testing for government portals is hard because the flows are long, the forms are enormous, and the smallest wording change on a "Continue" button can quietly break the path a citizen takes to renew a driver's license. Traditional selector-based tests snap on every redesign, and every redesign of a public-service site seems to touch the exact field your suite was pinned to. This guide is about a different approach: describing what a citizen is trying to accomplish in plain English, letting an AI agent drive a real browser through the flow, and getting a deterministic verdict back that you can trust in CI.

Public-sector web applications carry a set of constraints that most SaaS test guides skip entirely. Accessibility is a legal requirement, not a nice-to-have. Session timeouts are aggressive by design, often 15 or 20 minutes, and they log a half-finished applicant out for security reasons. Forms span multiple pages with conditional branches that only appear for certain answers. And the audience includes people on old devices, slow connections, and screen readers. Any honest testing strategy for these portals has to treat those realities as first-class, not edge cases. That is the lens this article takes.

## Why government portals break traditional test suites

The classic Selenium or plain Playwright approach ties each step to a locator: a CSS selector, an XPath, a `data-testid`. That works until the markup moves. On a citizen service portal, markup moves for reasons that have nothing to do with your feature. A new accessibility audit adds ARIA attributes and restructures the DOM. A content team rewords a legal disclaimer. A vendor swaps the design system to meet a new brand standard mandated by a central digital agency. Each of these leaves the underlying task ("apply for a fishing license") completely intact while shattering a selector-based suite.

Intent-based testing sidesteps this. Instead of "click the element with id `#btn-continue-3`", you write "continue to the next step of the application". The AI agent reads the page, finds the control that actually advances the flow, and clicks it. When the button text changes from "Continue" to "Next step", the intent still resolves. This is not magic and it is not a claim that tests never need maintenance. It is a shift in what your test is pinned to: the citizen's goal instead of the page's current HTML.

There is a second structural problem. Government forms are long. A business registration flow can run 40 fields across six pages. Encoding that as explicit selector interactions produces brittle, unreadable test files that only their author understands. A plain-English test file reads like the task itself, which means a policy analyst or a compliance reviewer can read it and confirm it matches the real process. That readability is worth real money when an auditor asks you to prove a flow was tested.

## Intent-based testing with a real browser

BrowserBash is a free, open-source (Apache-2.0) command-line tool built by The Testing Academy for exactly this kind of work. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step, and you get a deterministic verdict plus structured results back. There are no selectors and no page objects in your test. The agent looks at the actual rendered page, decides what to do next, and acts, the same way a person would.

Here is the simplest possible starting point for a citizen portal. You describe the flow and let the agent execute it against a real browser:

```bash
npm install -g browserbash-cli

browserbash run "Open the city permit portal, start a new dog license application, \
fill the owner name as Jordan Rivera and email as jordan@example.com, \
proceed to the review step, and store the displayed application reference number as 'ref'" \
  --agent --headless --timeout 180
```

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or an AI coding agent can consume the result without parsing prose. Exit codes are frozen and predictable: 0 passed, 1 failed, 2 error or infrastructure or budget stop, 3 timeout. That determinism matters for government CI pipelines where a flaky exit code can block a release or trigger a false compliance alarm.

BrowserBash defaults to Ollama-first, meaning it will use free local models with no API keys and nothing leaving your machine, which is a genuine advantage when you are testing systems that handle citizen PII and your security team is nervous about data egress. It auto-resolves in order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. Be honest with yourself about model size here. Very small local models (around 8B parameters and under) can be flaky on long multi-step objectives, and a 40-field benefits form is about as long and multi-step as it gets. The sweet spot for these hard flows is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model. If you are learning the tool, the [tutorials](https://browserbash.com/tutorials) walk through model selection before you point it at anything real.

## Handling long, multi-page forms deterministically

Plain-English objectives are great for exploration and for flows where the agent needs judgment. But when you are validating a specific outcome ("the confirmation page shows a valid reference number"), you do not want an AI making a subjective call. You want a hard check. This is where testmd v2 and deterministic Verify assertions come in.

A testmd file is a committable Markdown test with `#` title, `-` or `1.` steps, `@import` composition, and `{{variables}}` templating. Add `version: 2` to the frontmatter and the steps execute one at a time against a single browser session. Two step types never touch a model at all: API steps for seeding data, and Verify steps for checking the result through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

For a government portal, this hybrid is exactly right. You seed an application record through an API, then verify the citizen-facing UI reflects it correctly:

```bash
version: 2
---
# Renew a vehicle registration

- POST https://api.dmv.example.gov/applications with body {"type": "renewal", "plate": "ABC1234"}
- Expect status 201, store $.id as 'appId'

- Open the registration portal and look up application {{appId}}
- Continue to the payment summary step

- Verify text "ABC1234" visible
- Verify 'Pay now' button visible
- Verify title contains "Vehicle Registration"
```

Every `Verify` line here compiles to a real Playwright check: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, or a stored value equals. There is no LLM judgment in the assertion. A pass means the condition actually held. A fail arrives with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable Result.md assertion table. If you write a Verify line that falls outside the supported grammar, it still runs, but it is agent-judged and flagged `judged: true`, so you can always tell a deterministic check from a judged one. That distinction is priceless when a regulator asks how confident you actually are in a given assertion.

One honest caveat: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. If a fully local, no-key setup is a hard requirement for your agency, stick with v1 plain-English runs for now, or route the builtin engine through a self-hosted gateway that stays inside your network.

## Session timeouts and re-authentication

Citizen portals log you out fast. A 15-minute idle timeout is common, and some high-security systems are tighter. This creates two testing problems. First, a long form-filling run can trip the timeout mid-test and produce a misleading failure that looks like a broken flow but is really an expired session. Second, logging in fresh for every single test is slow and, on systems with rate-limited authentication or MFA, sometimes impossible to repeat dozens of times.

BrowserBash addresses the re-login tax with saved logins. You authenticate once, interactively, and reuse that session across many tests:

```bash
browserbash auth save citizen-portal --url https://portal.example.gov/login

browserbash testmd run ./tests/benefits_application_test.md --auth citizen-portal
```

`browserbash auth save` opens a browser, you log in once (including any MFA step a human has to do), and pressing Enter saves the Playwright storageState. From then on you reuse it with `--auth citizen-portal` on run, testmd, run-all, or monitor, or with an `auth:` line in the test file frontmatter. If the saved profile's origins do not cover your target start URL, BrowserBash prints a warning rather than silently doing nothing, which saves you an hour of confused debugging.

There is a real limitation to name here honestly. A saved session does not defeat a server-side idle timeout. If the portal invalidates sessions after 15 minutes regardless of storageState, a saved profile that sat unused will still be expired. The right pattern is to keep individual tests short, seed as much state as you can through API steps (which are near-instant), and reserve the slow agent-driven UI work for the specific screens you actually need to verify. Testing the timeout behavior itself is a legitimate test too: write an objective that logs in, waits past the idle window, attempts an action, and verifies the portal correctly forces re-authentication instead of silently losing the citizen's data.

## Accessibility is not optional for public services

Here is where I want to be candid, because accessibility marketing in the testing space is often dishonest. BrowserBash is an intent-based functional testing tool. Its core job is to verify that a citizen can complete a task, and because the AI agent navigates by reading the page the way a user does, an intent-based test naturally catches a class of accessibility failures that selector-based tests miss. If a form field has no accessible label, the agent often struggles to find it, and that struggle surfaces a real usability problem before a screen-reader user hits it. If the tab order is broken or a critical button is not reachable, an objective that says "submit the application using only keyboard-reachable controls" will expose it.

But let me be clear about what this is not. BrowserBash does not currently ship a dedicated axe-core audit step or a WCAG conformance report. If your obligation is to produce a formal Section 508 or WCAG 2.1 AA conformance statement, you need a dedicated accessibility scanner (axe, Pa11y, Lighthouse) in your pipeline alongside functional testing. The two are complementary, not interchangeable. Use a scanner to catch the deterministic, rule-based violations (contrast ratios, missing alt text, ARIA misuse), and use intent-based flows to catch the "technically compliant but actually unusable" failures that no automated rule catches.

A practical middle ground: write plain-English objectives that mirror how assistive-technology users navigate, and treat agent difficulty as a signal. If the agent cannot complete "find and activate the skip-to-content link", that is a finding worth a bug ticket. Read the [features overview](https://browserbash.com/features) to see exactly which verification primitives are supported today so you scope your accessibility program honestly rather than assuming a functional tool covers conformance reporting.

## Running the whole suite in CI

A single test is a demo. A government portal needs a suite: eligibility screening, application submission, document upload, payment, status lookup, appeal filing, and the multilingual variants of each. BrowserBash runs these in parallel with a memory-aware orchestrator that derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones.

For a large suite across parallel CI machines, sharding keeps runs fast and coordinated:

```bash
browserbash run-all ./tests \
  --shard 2/4 \
  --budget-usd 3.00 \
  --matrix-viewport 1280x720,390x844 \
  --junit out/junit.xml
```

`--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four CI machines agree on who runs what without any coordination between them. `--matrix-viewport` runs every test once per viewport, which for a citizen portal is essential: a large share of benefits and unemployment traffic comes from mobile phones, and the mobile layout of a government form is frequently where the bugs live. The `--budget-usd 3.00` flag is a spend guard. Once the suite crosses the budget, remaining tests are reported skipped, the suite exits 2, and the spend lands in RunAll-Result.md and the JUnit properties. For a publicly funded project with a hard cloud-model budget, that guardrail is not a nicety.

Everything integrates with CI through the official GitHub Action, which installs the CLI, runs the suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating pull request comment with the verdict table. The full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). A remark that often surprises teams: in agent mode a failed test is not a tool error. The run completes, emits a `run_end` with a `fail` status, and the calling agent or CI job reads that verdict. A failing test is a successful validation.

## Continuous monitoring for always-on public services

Citizen portals are not release-and-forget. Benefits enrollment periods, tax deadlines, and voter registration windows create traffic spikes where an outage is a genuine public harm. Monitor mode runs a test or objective on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run:

```bash
browserbash monitor ./tests/status_lookup_test.md \
  --every 10m \
  --auth citizen-portal \
  --notify https://hooks.slack.com/services/XXXX/YYYY/ZZZZ
```

Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload so you can wire it into PagerDuty, an internal incident bus, or a webhook of your own. The replay cache is what makes an always-on monitor practical: a green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. For a state agency watching a status-lookup endpoint every ten minutes around the clock, that is the difference between a near-free monitor and an unjustifiable model bill.

## Migrating an existing Playwright suite

Many government contractors already have a Playwright or Selenium suite they cannot throw away overnight. BrowserBash includes a deterministic importer, no model involved, that converts Playwright specs to plain-English testmd files heuristically:

```bash
browserbash import ./e2e/specs --out ./tests
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common expects. Anything using `process.env.X` becomes a `{{X}}` variable. Whatever it cannot translate is written to IMPORT-REPORT.md rather than being silently dropped or invented, so you get an honest inventory of what needs a human pass. This lets you migrate incrementally: import the stable flows, review the report, and hand-write the tricky conditional branches as plain-English objectives. If you would rather build a fresh suite by clicking through the flow once, `browserbash record <url>` opens a visible browser, captures your clicks, and writes a plain-English test on Ctrl-C, with password fields never leaving the page.

## When BrowserBash is the right tool, and when it is not

Balance matters more than a sales pitch, so here is a plain comparison of approaches for a government portal.

| Concern | Selector-based (Playwright/Selenium) | Dedicated a11y scanner | BrowserBash (intent-based) |
| --- | --- | --- | --- |
| Survives copy and markup changes | Poor, pins to DOM | N/A | Strong, pins to intent |
| Long multi-page forms | Verbose, brittle | N/A | Reads like the task |
| Deterministic assertions | Yes | Yes (rule-based) | Yes, via Verify steps |
| WCAG conformance report | No | Yes | No, functional only |
| Local, no data egress | Yes | Varies | Yes, Ollama-first |
| Formal audit-readable tests | Poor | Report only | Strong, plain English |

Choose BrowserBash when your flows are long, form-heavy, and reworded often, when you want tests a non-engineer can read, and when data privacy pushes you toward local models. Keep a dedicated accessibility scanner in the loop for conformance reporting; that is genuinely a different job. Keep a raw Playwright layer if you have deeply custom low-level interactions (canvas widgets, precise drag geometry) where explicit control beats intent. And be realistic about local model size on the hardest flows, or bring a hosted key for those.

For teams weighing cost against a public budget, the [pricing page](https://browserbash.com/pricing) spells out what stays free forever (the CLI, engines, local dashboard, cache, and MCP all run on your machine at no cost) versus the optional hosted extras. If you want to see how other teams structured their suites, the [blog](https://browserbash.com/blog) has worked examples you can adapt to a citizen-service context.

## FAQ

### How does AI testing for government portals handle session timeouts?

Save a logged-in session once with `auth save` and reuse it across tests to avoid re-authenticating constantly, but understand that a saved session cannot override a server-side idle timeout. The durable pattern is to keep each test short, seed state through fast API steps, and reserve slow agent-driven UI work for the screens you must verify. You can also write a test that deliberately waits past the idle window to confirm the portal forces re-authentication correctly instead of losing the citizen's data.

### Can BrowserBash produce a WCAG or Section 508 conformance report?

No, and it is important to be honest about that. BrowserBash is an intent-based functional testing tool, so it naturally surfaces some accessibility failures (unlabeled fields, unreachable controls, broken keyboard paths) because the agent navigates the page the way a user does. For a formal WCAG 2.1 AA or Section 508 conformance statement you still need a dedicated scanner such as axe, Pa11y, or Lighthouse running alongside it. The two approaches are complementary rather than interchangeable.

### Does citizen data leave my machine when I run these tests?

By default it does not. BrowserBash is Ollama-first, meaning it uses free local models with no API keys and nothing leaving your machine, which suits systems handling personal information. If you opt into a hosted model by setting an API key, prompts and page content go to that provider, so for sensitive government data keep to local models or route the builtin engine through a self-hosted gateway inside your network.

### How do I verify a specific outcome instead of trusting an AI judgment?

Use testmd v2 with Verify steps. Adding `version: 2` to the test frontmatter makes steps run one at a time, and each Verify line compiles to a real Playwright check (text visible, title contains, a named button visible, element counts, or a stored value equals) with no LLM judgment involved. A pass means the condition genuinely held, and a fail comes with expected-versus-actual evidence in the results, so your assertions are deterministic and defensible.

## Get started

Government and citizen service portals are the hardest kind of web application to test well: long forms, aggressive timeouts, legal accessibility duties, and citizens who cannot afford a broken flow. Intent-based testing lets you pin your suite to what a citizen is trying to do rather than to markup that changes every audit cycle. Install with `npm install -g browserbash-cli` and point it at a single flow to feel the difference. Creating an account is optional (the CLI, local dashboard, and cache all run free on your machine), but if you want hosted retention or team features, sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up).
