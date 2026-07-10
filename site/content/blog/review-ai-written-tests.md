---
title: How to Review AI-Written Browser Tests
description: "Learn how to review ai written tests for intent, deterministic assertions, safe data, model limits, CI behavior, and maintainable evidence."
date: 2026-11-12
category: agents
---

When you **review ai written tests**, do not start by asking whether the prose sounds polished. Start by asking whether the proposed test protects a real user promise, can reach a controlled state, and produces evidence that a machine can evaluate without guessing. An agent can draft a plausible journey in seconds. Plausibility is not coverage, and fluent instructions are not automatically executable specifications.

BrowserBash makes the review boundary unusually visible. It accepts a plain-English objective, drives a real Chrome or Chromium browser without selectors or page objects, and returns a structured verdict. Deterministic Verify steps can compile to Playwright checks, while unsupported Verify prose remains agent-judged and is flagged. That lets a reviewer separate flexible navigation from trustworthy validation, provided the reviewer actually inspects the distinction.

## Review AI written tests as untrusted code changes

Treat an agent-authored test like any other proposed code. The author, human or AI, has made assumptions about requirements, test data, permissions, environment, and failure meaning. Review is the process of exposing those assumptions before the test becomes a gate or a misleading green badge.

The risk is not only false passes. A badly scoped test can delete shared data, leak a secret into an objective, consume an uncontrolled model budget, or block a pull request because a preview environment was unavailable. It can also create maintenance debt by encoding screen position and temporary copy as if they were business rules.

Use a two-pass review. In the first pass, read only the title and objective as a specification. Decide whether the behavior matters and whether the expected result is correct. In the second pass, inspect execution details: setup, variables, imports, authentication, step boundaries, assertion types, provider, model, budgets, artifacts, and exit-code handling.

Do not let a successful demonstration substitute for review. One pass proves only that one combination of state, model behavior, page state, and timing worked. The test still needs a clear failure contract and safe repeatability. Conversely, do not reject a test merely because an AI agent wrote it. Judge the artifact and its evidence.

## Confirm the test protects the intended requirement

Begin with traceability. What requirement, incident, acceptance criterion, or product risk caused this test to exist? A title such as “Verify workspace controls” is too broad. “Non-owner cannot open billing settings and sees an access message” names the actor, prohibited action, and observable result.

Read the objective without imagining the current interface. Could product, QA, and engineering agree on what success means? If the answer depends on hidden knowledge, ask the author to add context. Common omissions include which user role is active, which tenant owns the data, which record should be chosen, what locale applies, and whether the feature flag is enabled.

Check that the expected result is a product rule, not an artifact of current implementation. A redirect to `/login` might be the contract, or it might be today’s implementation of “unauthenticated users cannot view invoices.” If the route is not public behavior, a visible sign-in heading may be the more durable assertion. If route stability is important for integrations, the URL check is appropriate.

Look for contradictory goals. “Submit the form with invalid data and verify the account is created” may reveal a drafting error. “Use any product and confirm the stored product ID equals {{productId}}” allows the action to choose one record while the assertion expects another. Agents often produce locally coherent sentences that do not form a coherent state transition.

Finally, ask what the test does not cover. A happy-path payment test does not prove decline handling, duplicate submission protection, tax accuracy, or receipt delivery. Record those as separate risks rather than inflating one journey into an unreviewable end-to-end epic.

## Inspect setup, identity, and data ownership

A repeatable browser test needs a known starting state. Review where the user, organization, records, feature flags, and URLs come from. “Open the latest order” is unsafe if the environment contains concurrent test traffic. Prefer a unique seeded record or an explicit `{{orderId}}`.

BrowserBash testmd v2 supports deterministic API steps for GET, POST, PUT, DELETE, and PATCH. An API step can expect a status and store a JSON-path value for later UI use. This is often better than spending agent steps creating data through screens unrelated to the behavior under test.

```bash
# Review the generated file, then run it with structured output
browserbash testmd tests/orders/refund-owned-order_test.md --agent

# Run the containing suite with a hard cost circuit breaker
browserbash run-all tests/orders --budget-usd 2.50 --agent
```

For v2 files, verify that `version: 2` is present and that the execution environment supports the builtin engine. It currently requires `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not run directly on Ollama or OpenRouter yet. An agent may propose valid v2 syntax that cannot run in your chosen local-model lane.

Review cleanup and collision behavior. Can the test be rerun after failing halfway? Does it create a unique email or overwrite a shared account? Can parallel shards touch the same record? Cleanup should target only data created by that run and should tolerate the resource already being absent.

Identity deserves extra scrutiny. BrowserBash saved logins use Playwright storageState. `browserbash auth save <name> --url <login-url>` opens a browser for one manual login, then saves the session. Tests reuse it with `--auth <name>` or `auth:` frontmatter. Confirm that the profile belongs to a low-privilege test account, matches the environment, and is stored according to your secret policy. BrowserBash warns if saved origins do not cover the target start URL; a proposed test must not ignore that warning.

## Review instructions for ambiguity and harmful freedom

Plain English should express business intent, not surrender every decision to the agent. “Find an order and refund it” gives dangerous freedom. “Open the seeded order {{orderId}}, confirm it belongs to {{testCustomer}}, and issue a full refund” narrows the target. Destructive actions should use isolated fixtures and, where possible, a nonproduction environment with limited credentials.

Flag vague verbs: handle, check, validate, fix, manage, process, and ensure. They can be useful in a title but usually need concrete meaning in executable steps. “Check the profile” should become “Open the member profile and confirm the displayed email equals {{memberEmail}}.”

Flag subjective outcomes: looks right, behaves normally, is user-friendly, loads fast, or seems complete. Those may describe legitimate exploratory goals, but they do not make strong merge assertions. Ask for observable conditions or keep the result explicitly advisory.

Flag positional choreography: click the second card, use the blue button, open the menu on the right. BrowserBash is valuable partly because an agent can interpret labels and accessible roles without selectors. The test should identify controls by user-visible purpose. Position is appropriate only when order or layout is itself under test.

Check pronouns and references after every inserted step. “Delete it” can silently switch referents when a new record is mentioned. Check selection rules such as newest, first, cheapest, or active. They need defined sorting and stable data. The [BrowserBash tutorials](https://browserbash.com/tutorials) can help reviewers learn the execution model, but your product glossary should define domain terms.

## Verify that deterministic assertions decide the verdict

BrowserBash 1.5.0 recognizes a grammar for deterministic Verify steps. It can check URL contains, title equals or contains, visible text, a named button, link, or heading, element counts, and equality of stored values. These compile to real Playwright checks, with no LLM judgment. Failures include expected-versus-actual evidence in `run_end.assertions` and the Result.md table.

Review each required outcome against that grammar. Do not infer that every sentence beginning with “Verify” is deterministic. Unsupported lines still run through the agent and are marked `judged: true`. Inspect the structured result from a trial run to confirm compilation. For a blocking test, require deterministic evidence for the central product promise.

Use one claim per assertion. “Verify the success heading, correct total, and receipt link are visible” makes evidence coarse and can blur which requirement failed. Separate checks. Avoid exact copy assertions unless the wording is contractual. Prefer stable visible labels or stored identifiers for dynamic content.

Check both sides of a negative case. If a viewer cannot edit a report, the test might verify that the Edit button is absent or disabled and that a direct edit URL does not grant access. UI absence alone may not prove authorization. The browser layer should complement API or service authorization tests, not replace them.

Review the final state for accidental success. An agent may reach a confirmation page after creating a different record than intended. Store the API-created ID, navigate to that record, and verify the displayed ID or name. A green heading is meaningful only when tied to the right subject.

## Evaluate model, engine, and provider assumptions

BrowserBash is Ollama-first. Model resolution checks local Ollama, then `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and OpenRouter. Local models keep data on the machine and need no API key. That default is valuable, but review must identify what CI or another developer will actually resolve.

Very small local models around 8B and under can be flaky on long objectives. A mid-size Qwen3 model, a Llama 3.3 70B-class model, or a capable hosted model is a better fit for difficult flows. Rather than requiring a huge model for every test, shorten the objective, control data, and remove ambiguous decisions. Use a stronger model when the journey genuinely requires harder interpretation.

Cheap-model routing with `--model-exec` can plan on a strong model and execute on a cheaper one. Reviewers should ask whether both model choices were tested on this flow. Lower nominal token cost can be offset by retries and investigation if execution quality drops.

Provider and engine constraints belong in review. Providers include local Chrome, cdp, Browserbase, LambdaTest, and BrowserStack. Stagehand is the default engine. The builtin Anthropic tool-use engine is required for LambdaTest and BrowserStack, and for testmd v2. A test proposal that depends on a provider feature or authenticated local Chrome should declare it rather than relying on one author’s machine.

Read the [feature reference](https://browserbash.com/features) when verifying current capabilities, and check the [open-source repository](https://github.com/PramodDutta/browserbash) instead of accepting an agent’s claim about unsupported syntax.

## Review AI written tests for CI semantics

A test file is not ready when it passes locally. Review how CI interprets it. BrowserBash agent mode emits NDJSON on stdout, one event per line, so automation does not need to parse prose. Exit code 0 means passed, 1 failed, 2 error, infrastructure issue, or budget stop, and 3 timeout.

Ensure the workflow does not collapse all nonzero statuses into “product regression.” A failed deterministic assertion can block a PR. An infrastructure error is inconclusive and may deserve one controlled retry. A timeout needs its own diagnosis. A budget stop marks remaining tests skipped and exits 2; it must never satisfy a required gate.

Review artifact retention. Human-readable Result.md should be available, along with NDJSON and JUnit for suite runs. The official GitHub Action installs the CLI, runs suites, uploads JUnit, NDJSON, and result artifacts, and posts a self-updating PR verdict table. Its current setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

Check concurrency assumptions. `run-all` derives concurrency from CPU and RAM and orders previously failed or slow tests first. Sharding uses sorted discovery order, so `--shard 2/4` agrees across machines without coordination. Tests must still own their data and avoid shared mutable fixtures.

Viewport matrices multiply execution. `--matrix-viewport 1280x720,390x844` labels each result in events, JUnit, and reports. Confirm that both dimensions matter for this test. A responsive navigation flow may justify them; a backend-driven permission result may not.

```bash
browserbash run-all tests/pr \
  --shard 2/4 \
  --matrix-viewport 1280x720,390x844 \
  --budget-usd 2.50 \
  --agent
```

## Check cost, replay, and observability claims

BrowserBash `run_end` includes a `cost_usd` estimate based on a bundled per-model price table. Unknown models get no estimate rather than an incorrect one. Review expected cost in the context of test frequency, viewports, shards, retries, and model routing. Do not accept a precise cost forecast for an unknown model.

`run-all --budget-usd` or `--budget-tokens` stops launching new tests after the suite crosses the limit. Remaining cases are skipped, the suite exits 2, and spend appears in RunAll-Result.md and JUnit properties. A budget is a circuit breaker, not a target for normal runs. If a proposal routinely consumes the whole limit, reduce scope or change its schedule.

The replay cache can make repeated stable tests nearly free of model calls. A green run records actions; the next identical run replays them with zero model calls, and the agent steps back in when the page changes. Reviewers should welcome that optimization without assuming it guarantees zero cost. Changed data, URLs, auth, or UI can prevent full replay.

Check what history will reveal. BrowserBash tracks flaky behavior in its memory-aware orchestrator and writes structured events. A test that alternates pass and fail with unchanged code should not be promoted to a merge gate. Require an owner and a plan to distinguish product nondeterminism, environment instability, ambiguous instructions, and model variation.

The fully local dashboard runs with `browserbash dashboard` and needs no account. The optional cloud dashboard uses `browserbash connect` and `--upload`, with 15-day retention. Review data policy before an agent adds uploads to CI. Pricing and account options are described on the [BrowserBash pricing page](https://browserbash.com/pricing), but the CLI itself is free and Apache-2.0 licensed.

## Inspect generated tests from importers and recorders

Generated does not always mean model-generated. BrowserBash’s Playwright importer is deterministic and uses no model. `browserbash import <specs-or-dir>` heuristically converts common goto, click, fill, press, check, selectOption, getBy locators, and expects into plain-English `*_test.md` files. `process.env.X` becomes `{{X}}`. Anything untranslatable goes into `IMPORT-REPORT.md` rather than being dropped or invented.

Review the report before the generated files. An unsupported custom fixture or assertion may represent the most important part of the original test. Compare behavior, not line count. Imported steps can also preserve implementation-shaped wording that should be rewritten around business intent.

The recorder captures a real visible-browser flow. `browserbash record <url>` writes a plain-English test after Ctrl-C. Password fields never leave the page; the capture script sends a secret marker and the generated step uses `{{password}}`. Still review all other captured values for personal data, environment-specific IDs, and accidental destructive actions.

```bash
browserbash import playwright-tests
browserbash record https://preview.example.test
```

Recorder output often includes the exact path a human took, including detours. Remove irrelevant navigation, clarify selection rules, add controlled setup, and add deterministic assertions. Preserve steps that embody a real requirement even if they appear redundant, such as confirming an irreversible action.

## Decide when to approve, revise, or reject

Approve when the test protects a named risk, starts from controlled state, uses safe identity and data, gives the agent bounded instructions, and ends with deterministic evidence for its core promise. Its execution lane, model, provider, budget, exit behavior, artifacts, and owner should be clear.

Request revision when the scenario is valuable but ambiguous. Most weak proposals can be improved by narrowing the role and record, splitting a long journey, replacing subjective checks, adding API setup, or converting outcomes into supported Verify steps. Give feedback in terms of failure evidence: “If this fails, we cannot tell which invoice was opened” is more actionable than “be more specific.”

Reject when the test duplicates a faster lower-level check without adding browser value, requires unsafe production mutation, embeds secrets, or claims a product behavior that stakeholders have not agreed on. Also reject fabricated capabilities, benchmark numbers, or unsupported assumptions. BrowserBash is an adaptable validation layer, not permission to call every generated scenario coverage.

Keep exploratory tests, but label them honestly. An agent-judged assessment can provide useful observations without becoming a deterministic merge gate. The decision is about where the result belongs, not whether exploratory work has value.

Before approval, ask another reviewer to reproduce the test from a clean environment. That simple exercise catches local profiles, undeclared variables, stale replay state, and hidden seed data that the original author may not realize are dependencies. Compare the clean run's `run_end` fields with the proposed policy: status, summary, final state, assertions, estimated cost when available, and duration. If the result needs a verbal explanation from the author to become meaningful, add that context to the test or its repository documentation. A test should be understandable after its original author and drafting agent are gone.

## FAQ

### What should I check first when reviewing an AI-written test?

Check the protected user promise and expected outcome before execution details. If stakeholders cannot agree on what the title means or what evidence proves success, the test is not ready regardless of how polished its steps look.

### Can AI-written BrowserBash tests use deterministic assertions?

Yes. Supported Verify lines compile to Playwright checks for URLs, titles, visible text and roles, counts, and stored-value equality. Unsupported Verify prose is agent-judged and marked `judged: true`, which reviewers should inspect.

### Should an AI-written browser test run against production?

Only with a deliberately read-only or tightly controlled design, appropriate authorization, and low-privilege identity. Destructive or state-changing drafts should run in isolated test or preview environments with owned data and cleanup.

### Does one passing run prove an AI-written test is reliable?

No. One pass shows that one execution worked under one state and model path. Review repeated history, deterministic assertion evidence, timeout and infrastructure behavior, data isolation, and the meaning of failures before making it blocking.

Make review a required engineering step, not a ceremony after generation. Install BrowserBash 1.5.1 with `npm install -g browserbash-cli`; an [account is optional](https://browserbash.com/sign-up), and local CLI use keeps working without one.
