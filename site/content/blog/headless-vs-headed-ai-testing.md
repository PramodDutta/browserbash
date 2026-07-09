---
title: Headless vs Headed Browser Testing With AI
description: "Headless vs headed testing guide for AI browser automation, visible debugging, record mode, CI runs, and repeatable evidence."
date: 2026-08-27
category: guide
---
headless vs headed testing matters more with AI browser automation because the agent is not just executing selectors. It is observing the page, deciding the next action, and responding to UI state. Headless mode is ideal for repeatable CI, while a visible browser is still the fastest way to understand timing, overlays, redirects, theme state, and confusing failures. BrowserBash supports both workflows and adds record mode when watching the browser is the most practical way to author the test. See the full [feature list](https://browserbash.com/features) for how headless and headed runs share the same plain-English tests.

## What headless vs headed testing changes with AI

In scripted automation, headless vs headed testing often feels like a switch for CI speed. With AI browser automation, it also affects observability while the agent is deciding what to do. A headed run lets you see the same page state the agent sees. That helps when the page contains cookie prompts, loading skeletons, focus traps, permission prompts, hidden overlays, or redirect loops.

Headless runs still matter. They are faster to operate in CI, easier to schedule, and less distracting on developer machines. Most mature suites should end up headless for routine validation. The mistake is to stay headless while authoring a flow you do not yet understand. If you cannot explain the failure from the artifacts, watch the browser.

BrowserBash makes the switch practical because you can start with a visible browser for authoring and debugging, save auth, record a flow, then move the stable version into headless CI with agent-mode output.

## BrowserBash basics for headless vs headed testing

BrowserBash is a free, open-source natural-language browser automation CLI from The Testing Academy, founded by Pramod Dutta and licensed under Apache-2.0. You install it with `npm install -g browserbash-cli` and run it with `browserbash`. The current version to write against is 1.5.1. Its positioning matters: it is the open-source validation layer for AI agents. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step, and the run returns a deterministic verdict plus structured results. It is not a selector framework, and it does not ask you to maintain page objects before you know whether a flow is worth automating.

Saved logins reduce the need for brittle login setup. `browserbash auth save <name> --url <login-url>` opens a browser, lets you log in once, and saves a Playwright storageState when you press Enter. You can reuse it with `--auth <name>` on run, testmd, run-all, and monitor, or put `auth:` in test frontmatter. If the saved origins do not cover the target start URL, BrowserBash prints a warning instead of silently pretending the session was applied.

The saved login detail is important when switching modes. A login flow that passes headed because you manually solved MFA is not the same as a CI-ready test. Save the authenticated state when that is appropriate, reuse it with `--auth`, and let BrowserBash warn you when the saved origins do not cover the target start URL. That warning catches a common source of false debugging, where a test appears logged out because the profile was not applicable.

## When headed mode is the better fit

Use headed mode while creating a new objective, recording a flow, or investigating a failure that has ambiguous evidence. It is also useful for pages that change based on focus, hover, popups, browser permissions, SSO redirects, or local storage. Watching the run can reveal that the agent is waiting on an animation, clicking a covered button, or landing on a page you did not expect.

```bash
browserbash record https://app.example.com/settings

browserbash run "Open the settings page, switch email notifications off, save, and verify the saved state is shown" --headless=false
```

The record command is especially useful for hard-to-describe flows. You open the app, click through the path once, and Ctrl-C writes a plain-English test. Password fields never leave the page. The capture script sends only a secret marker, and the generated step reads something like `Type {{password}} into ...`, which keeps secrets out of the test file.

## When headless mode is the better fit

Use headless mode for stable, repeatable validation in CI and scheduled monitors. The evidence should come from structured results, assertion tables, screenshots or artifacts if you capture them, and exit codes. If a test only passes while someone watches it, the problem is usually not headless mode. The problem is missing setup, weak assertions, environment differences, or a flow that has not been stabilized yet.

The result format is also part of the product. In agent mode, `--agent` emits NDJSON with one JSON event per line, so CI and coding agents can read status without scraping prose. Exit codes are fixed: 0 passed, 1 failed, 2 error or infrastructure or budget stop, and 3 timeout. A human-readable `Result.md` is written after each run, but the structured events are the contract for automation.

Headless also pairs naturally with BrowserBash MCP. An AI coding agent can call `run_objective` or `run_test_file`, read the verdict JSON, and decide what to do next. The agent does not need a visible browser if the structured result is clear.

## Debugging tradeoffs

A headed run gives direct visual context, but it can hide problems if you accidentally interact with the browser or rely on local state that CI does not have. A headless run is closer to automation reality, but it can be slower to interpret when the failure is visual or timing-related. The best workflow is not ideological. Reproduce headed, fix the objective or setup, then verify headless.

For UI timing, prefer deterministic waits expressed through visible state rather than arbitrary sleeps. In BrowserBash, that often means a plain-English step that reaches the page followed by a Verify line that checks the expected heading, text, or button. If the deterministic check fails, the Result.md assertion table gives the expected and actual evidence.

The newer deterministic Verify assertions are the guardrail. In testmd v2, a `Verify` line that matches the grammar compiles to a real Playwright check for URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, or a stored value equals. That is not model judgment. A pass means the condition held in the browser, and a fail carries expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. Verify lines outside the grammar can still run, but they are marked `judged: true`, so you can separate deterministic checks from agent-judged observations.

## Record mode is authoring evidence

Record mode is not just a convenience. It gives you a human path through the app that can be reviewed and committed as a plain-English test. This is helpful when product experts know the workflow but do not want to write selectors. It is also helpful when the UI is too new for stable page objects. A recorded test should still be edited. Remove unnecessary clicks, add meaningful Verify lines, and replace one-off values with variables.

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

If the flow needs data, combine record mode with API setup rather than recording a long admin setup sequence. That keeps the visible flow focused on what the user actually does.

## Evidence for CI and agents

Version 1.5.0 added an MCP server through `browserbash mcp`. It serves the CLI over stdio and exposes `run_objective`, `run_test_file`, and `run_suite`. Each tool returns verdict JSON with `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. A failed validation is not a crashed tool call. The tool succeeds and the calling agent reads the failed verdict, which is the right shape for agent workflows.

The one-line MCP install is `claude mcp add browserbash -- browserbash mcp`, with the same pattern for Cursor, Windsurf, Codex, and Zed. The official registry entry is `io.github.PramodDutta/browserbash`. For CI, the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) covers artifacts and PR comments, while the [tutorials](https://browserbash.com/tutorials) show smaller examples.

## Who should choose which mode

Choose headed mode when a human needs to understand the browser state. Choose headless when the flow is stable enough to be judged from artifacts and structured output. Choose record mode when a user can demonstrate the journey faster than anyone can write it from memory. Choose saved auth when login is not the behavior under test.

The model story is deliberately local-first. BrowserBash defaults to Ollama, so a team can start with free local models, no API keys, and no test prompt leaving the machine. Provider resolution then falls through to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and OpenRouter when you bring your own keys. For long, sensitive, or regulated flows, that default is useful. The honest caveat is that very small local models around 8B parameters and under can be flaky on long multi-step objectives. The sweet spot is usually a mid-size local model, such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model for hard flows.

This is the practical answer to headless vs headed testing: use headed runs to learn and diagnose, then use headless runs to scale. Treat mode as a workflow choice, not a quality label.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for headless vs headed testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## FAQ

### What is headless vs headed testing?
Headless testing runs the browser without a visible window. Headed testing shows the browser on screen, which helps when you need to watch timing, overlays, redirects, consent prompts, or visual state during a flow.

### When should AI browser tests run headed?
Run headed while authoring, recording, or debugging a confusing failure. Run headless for routine CI when the same flow is stable and evidence comes from structured results, logs, and artifacts.

### Is headless mode less accurate than headed mode?
Not automatically. Many flows behave the same, but some apps branch on viewport, focus, browser permissions, animation timing, or anti-automation checks. Treat differences as a signal to inspect the app and environment, not as proof that one mode is always better.

### How does BrowserBash record help debugging?
Record opens a visible browser, captures the flow you perform, and writes a plain-English test on Ctrl-C. It is useful when a human can complete the path faster than they can describe every intermediate UI step.

Start locally with `npm install -g browserbash-cli`, then explore the optional [BrowserBash sign-up](https://browserbash.com/sign-up) path if you want the free cloud dashboard. An account is optional for local CLI validation, so you can try the workflow before connecting anything.
