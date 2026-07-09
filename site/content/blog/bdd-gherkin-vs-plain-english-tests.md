---
title: BDD Gherkin vs Plain-English AI Tests
description: "BDD Gherkin vs plain English AI tests compared for Cucumber teams, step reuse, readable intent, deterministic checks, and agent workflows."
date: 2026-09-04
category: comparison
---
bdd gherkin vs plain english is not a fight between readable tests and unreadable tests. Both approaches try to express user intent, but they put the maintenance cost in different places. Gherkin asks teams to maintain scenarios and step definitions. Plain-English AI tests ask an agent to operate the browser directly, then rely on deterministic assertions and structured verdicts for confidence. BrowserBash fits the second model while still respecting where Cucumber works well.

## Why bdd gherkin vs plain english is a real comparison

bdd gherkin vs plain english matters because both formats promise readable tests. Gherkin gives a disciplined structure: Given, When, Then. Plain-English AI tests give direct instructions to an agent that drives the browser. The difference is where execution knowledge lives. In Cucumber, it lives in step definitions and glue code. In BrowserBash, it lives in the agent run, deterministic assertions, and structured verdict output.

Neither model is automatically better. Gherkin can be excellent when product owners, QA, and engineers actually collaborate on scenarios. It can be painful when step definitions multiply, wording becomes political, and the real selectors hide behind vague business language. Plain-English AI tests can be fast and expressive, but they need focused objectives and deterministic checks to avoid vague results.

The choice should follow team behavior, not tool fashion.

## How BrowserBash frames plain-English tests

BrowserBash is a free, open-source natural-language browser automation CLI from The Testing Academy, founded by Pramod Dutta and licensed under Apache-2.0. You install it with `npm install -g browserbash-cli` and run it with `browserbash`. The current version to write against is 1.5.1. Its positioning matters: it is the open-source validation layer for AI agents. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step, and the run returns a deterministic verdict plus structured results. It is not a selector framework, and it does not ask you to maintain page objects before you know whether a flow is worth automating.

A BrowserBash test can be a one-line objective or a committable markdown file with steps, imports, variables, saved auth, API setup, and Verify assertions. It does not require a Cucumber runner or step-definition layer. That is the main maintenance difference. You are not writing a new function every time you add a phrase. You are describing the flow and then pinning important claims with deterministic checks.

If you want the broader product map, the [BrowserBash features page](https://browserbash.com/features) explains the CLI surface, the [tutorial library](https://browserbash.com/tutorials) has runnable flows, and the [open-source repository](https://github.com/PramodDutta/browserbash) is the place to inspect the Apache-2.0 project itself.

## Comparison table: bdd gherkin vs plain english

| Dimension | BDD Gherkin | Plain-English AI tests |
| --- | --- | --- |
| Test shape | Given, When, Then scenarios mapped to step definitions | Objectives and steps executed by an AI browser agent |
| Reuse model | Shared step definitions and glue code | Reusable test files, imports, variables, saved auth, replay cache |
| Best stakeholder fit | Teams that actively review feature language | Teams that want direct user goals without glue-code overhead |
| Maintenance risk | Step explosion, ambiguous wording, brittle selectors inside steps | Over-broad objectives, weak assertions, poor model choice |
| BrowserBash fit | Runs alongside it, not a native Cucumber runner | Native model for `run`, testmd, MCP, and run-all |

## Where Gherkin is the better fit

Choose Gherkin when the organization genuinely practices BDD. That means stakeholders read scenarios before implementation, examples clarify business rules, and step definitions are maintained with discipline. Gherkin is also useful for domain-heavy logic where Given, When, Then examples become living documentation. If nobody outside engineering reads the feature files, you may not be getting the main benefit.

Gherkin also has a mature ecosystem. Cucumber reporting, tags, hooks, step reuse, and existing CI patterns are valuable. BrowserBash should not be described as a drop-in replacement for that whole world. It is a different execution model for browser validation.

## Where plain-English AI tests are the better fit

Plain-English AI tests are a strong fit when selector maintenance and step glue slow the team down. A release smoke test that says to create a workspace, invite a user, and verify the invitation status is understandable without mapping every phrase to a function. A coding agent can run the same objective after a change and read the verdict JSON. That is a different feedback loop from waiting for a human to update glue code.

```bash
browserbash run "Given a signed-in customer, add a product to the cart, apply the welcome coupon, and verify the discount appears" --agent

browserbash mcp
```

The MCP command matters because it exposes BrowserBash to agent hosts over stdio. It includes `run_objective`, `run_test_file`, and `run_suite`, and it returns structured verdicts. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

## Determinism is the deciding factor

The newer deterministic Verify assertions are the guardrail. In testmd v2, a `Verify` line that matches the grammar compiles to a real Playwright check for URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, or a stored value equals. That is not model judgment. A pass means the condition held in the browser, and a fail carries expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. Verify lines outside the grammar can still run, but they are marked `judged: true`, so you can separate deterministic checks from agent-judged observations.

testmd v2 also added deterministic API steps for setup. A file with `version: 2` frontmatter can run `GET`, `POST`, `PUT`, `DELETE`, or `PATCH` before the UI steps, assert `Expect status N`, and store a JSON path value for later use. Consecutive plain-English lines still run as grouped agent blocks on the same browser session. The current limitation is important: v2 uses the builtin engine today, which means it needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run on Ollama or OpenRouter directly.

```bash
cat > tests/users_flow_test.md <<'EOF'
---
version: 2
auth: admin
---
POST https://api.example.com/users with body {"name":"bb-{{RUN_ID}}"}
Expect status 201, store $.id as 'usersId'

Open https://app.example.com/users/{{usersId}}
Verify URL contains dashboard
EOF

browserbash run-test tests/users_flow_test.md --agent
```

This is how plain-English avoids becoming hand-wavy. Let the agent navigate, but let deterministic checks decide important facts. If a Verify line falls outside the grammar and is agent-judged, BrowserBash marks it with `judged: true`. That label is valuable because it prevents a team from treating model judgment and real Playwright checks as the same kind of evidence.

## Migration patterns from Cucumber

Do not migrate every feature file at once. Start with flows where Gherkin adds little value because the scenarios are already implementation scripts in disguise. Convert a few smoke tests into BrowserBash markdown, preserve meaningful examples, and add Verify assertions for the key outcomes. Keep domain-rule-heavy feature files in Cucumber if they are still useful to stakeholders.

If you already have Playwright specs behind Cucumber or alongside it, BrowserBash import can convert common Playwright actions into plain-English tests deterministically. It is not a semantic Gherkin converter, and it does not invent missing behavior. Anything untranslatable goes into `IMPORT-REPORT.md`.

Two bridge features help teams move incrementally. `browserbash import <specs-or-dir>` converts Playwright specs to plain-English `*_test.md` files without a model. It handles common goto, click, fill, press, check, selectOption, getBy locators, and common expects. Anything it cannot translate goes into `IMPORT-REPORT.md` instead of being invented. `browserbash record <url>` opens a visible browser, captures a manual flow, and writes a plain-English test on Ctrl-C. Password fields never leave the page, and the generated step uses a variable marker such as `{{password}}`.

## Decision section: who should choose what

Choose BDD Gherkin if your primary need is shared business language, example mapping, and stakeholder review. Choose BrowserBash plain-English tests if your primary need is fast browser validation for AI agents, CI, and changing UIs. Use both if business rules live well in Gherkin but browser smoke coverage needs a lighter intent-based layer.

A balanced suite might keep Cucumber for core domain rules and add BrowserBash for production-like user journeys, saved-auth flows, monitors, and AI coding-agent validation. The goal is not to win a format debate. The goal is to get failure signals people trust.

## Operational caveats

The model story is deliberately local-first. BrowserBash defaults to Ollama, so a team can start with free local models, no API keys, and no test prompt leaving the machine. Provider resolution then falls through to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and OpenRouter when you bring your own keys. For long, sensitive, or regulated flows, that default is useful. The honest caveat is that very small local models around 8B parameters and under can be flaky on long multi-step objectives. The sweet spot is usually a mid-size local model, such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model for hard flows.

For suites, `run-all` is memory-aware. It derives concurrency from real CPU and RAM, orders previously-failed and slow tests first, and reports flaky behavior. Version 1.5.0 added budget controls: `run-all --budget-usd 2.50` or `--budget-tokens` stops launching new tests after the budget is crossed, reports the rest as skipped, exits 2, and writes spend into `RunAll-Result.md` and JUnit properties. Sharding through `--shard 2/4` uses sorted discovery order, so CI machines agree without coordination.

For CI, the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) shows how to install BrowserBash, run a suite, upload JUnit, NDJSON, and results artifacts, and post a self-updating PR comment. For pricing and optional cloud dashboard context, see [BrowserBash pricing](https://browserbash.com/pricing). An account is optional for local CLI use.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for bdd gherkin vs plain english

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## FAQ

### What is BDD Gherkin vs plain English testing?
Gherkin uses structured Given, When, Then scenarios mapped to step definitions. Plain-English AI tests describe the browser objective directly, then an agent drives the real browser and returns a verdict.

### Is Gherkin still useful with AI browser tests?
Yes. Gherkin is still useful when business stakeholders actively review scenarios, teams depend on step reuse, or the organization already has a mature Cucumber workflow. AI tests are better when selector and step-definition maintenance is the bottleneck.

### Can BrowserBash run Cucumber feature files?
BrowserBash runs plain-English objectives and *_test.md files, not Cucumber feature files as a native runner. Teams can translate selected flows manually or use BrowserBash alongside existing Cucumber suites.

### How do plain-English AI tests stay deterministic?
Use deterministic Verify steps, API expectations, stored values, and structured verdict JSON. The agent can navigate and act, but the important pass or fail claims should be checked by real browser assertions when possible.

Start locally with `npm install -g browserbash-cli`, then explore the optional [BrowserBash sign-up](https://browserbash.com/sign-up) path if you want the free cloud dashboard. An account is optional for local CLI validation, so you can try the workflow before connecting anything.
