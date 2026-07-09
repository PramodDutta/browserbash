---
title: Push AI Test Results to TestRail From CI
description: "Learn how to push test results to testrail from BrowserBash JUnit and NDJSON outputs with CI mapping and verdict gates."
date: 2026-07-27
category: ci
---
If you need to push test results to testrail from AI browser tests, the key is mapping. BrowserBash can tell you what happened in a real Chrome or Chromium session, but TestRail needs a run, cases, statuses, and evidence. A good CI step connects those worlds without hiding the BrowserBash exit code or turning every infrastructure problem into a failed product test.

BrowserBash is useful here because it produces structured validation output. In `--agent` mode, it emits NDJSON with one JSON event per line. The final `run_end` verdict carries status, summary, final state, assertions, cost estimate when known, and duration. Suite runs can also produce JUnit and human-readable result artifacts. Those outputs are exactly what a TestRail integration needs.

BrowserBash is a free, open-source Apache-2.0 CLI from The Testing Academy, founded by Pramod Dutta. Install it with `npm install -g browserbash-cli` and run it with `browserbash`. It is the open-source validation layer for AI agents: you write a plain-English objective or markdown test, an AI agent drives a real browser, and the run returns a deterministic verdict plus structured results.

## Why Push Test Results to TestRail From BrowserBash

TestRail is usually where QA teams track planned coverage, execution history, release readiness, and failure trends. CI logs are not enough for that workflow. If a BrowserBash suite validates a checkout flow, settings flow, or production smoke test, the result should land where the team already reviews test status.

The challenge is that AI browser testing can produce richer outcomes than a simple pass or fail. A validation can fail because the product did not meet the assertion. A suite can stop because the budget was crossed. A run can time out. A local model can struggle on a long objective. Your TestRail mapping should preserve those differences.

BrowserBash exit codes help. `0` means passed. `1` means failed validation. `2` means error, infrastructure issue, or budget stop. `3` means timeout. When you map to TestRail statuses, do not flatten all nonzero codes into product failure. Keep the original exit code in the comment or custom field.

This makes the TestRail report more honest. Product failures show up as failed cases. Budget stops can be blocked or skipped depending on your TestRail configuration. Timeouts can be marked for investigation. Passing tests stay clean.

## BrowserBash Artifacts That Map to TestRail

There are three useful BrowserBash outputs for TestRail. NDJSON is best for automation because it contains structured events and the `run_end` verdict. JUnit is best when you want test-case-like records from a suite. `Result.md` and `RunAll-Result.md` are best for human-readable evidence.

For a small integration, start with NDJSON. Parse the final `run_end`, extract status, summary, assertions, duration, cost, and final state, then post a result to the mapped TestRail case. For a suite, parse each test-level event if your NDJSON includes per-test results in your chosen command, or use JUnit as the test-case list and NDJSON for detailed verdict evidence.

JUnit is often easier for suite-level mapping because TestRail cases usually correspond to named tests. BrowserBash suite runs can label viewport matrix runs in events, JUnit, and results. That matters when a desktop run passes but the mobile viewport fails.

The result markdown files are useful as links or attachments. Avoid pasting entire logs into TestRail comments. Put the summary, failed assertions, duration, cost estimate, viewport, and CI artifact URL in the result comment. Link to raw artifacts for deeper debugging.

## A CI Pattern That Preserves the Gate

Your CI step should run BrowserBash, capture the exit code, upload results to TestRail, then exit with the original code. This ensures reporting does not hide the quality gate.

```bash
set +e
browserbash run-all tests/browserbash --agent --budget-usd 2.50 > browserbash.ndjson
BB_EXIT=$?
set -e

./scripts/push-browserbash-to-testrail.sh browserbash.ndjson "$BB_EXIT"
exit "$BB_EXIT"
```

This pattern works for hosted CI, local CI, and AI-agent validation jobs. It also handles budget governance correctly. In BrowserBash 1.5.0, `run-all --budget-usd 2.50` or `--budget-tokens` stops launching new tests after the suite crosses the budget. Remaining tests are reported skipped, the suite exits `2`, and spend lands in `RunAll-Result.md` and JUnit properties.

For GitHub users, the BrowserBash GitHub Action installs the CLI, runs the suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs and budgets, and posts a self-updating PR comment with the verdict table. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) explain the supported inputs.

## Concrete TestRail Push Script

The script below shows the core idea. It reads the final BrowserBash `run_end` event from NDJSON and posts a result to a configured TestRail case. It assumes you already map the BrowserBash test to a case ID through an environment variable or CI matrix. For production use, add lookup logic, retries, deduplication, and run creation as needed.

```bash
#!/usr/bin/env bash
set -euo pipefail

NDJSON_FILE="${1:?Usage: push-browserbash-to-testrail.sh browserbash.ndjson exit_code}"
BB_EXIT="${2:-0}"

RUN_END="$(grep '"run_end"' "$NDJSON_FILE" | tail -n 1)"
STATUS="$(printf '%s' "$RUN_END" | jq -r '.status // .data.status // "unknown"')"
SUMMARY="$(printf '%s' "$RUN_END" | jq -r '.summary // .data.summary // "BrowserBash validation result"')"
DURATION="$(printf '%s' "$RUN_END" | jq -r '.duration_ms // .data.duration_ms // "unknown"')"
COST="$(printf '%s' "$RUN_END" | jq -r '.cost_usd // .data.cost_usd // "not estimated"')"
ASSERTIONS="$(printf '%s' "$RUN_END" | jq -c '.assertions // .data.assertions // []')"

case "$STATUS:$BB_EXIT" in
  passed:0) TESTRAIL_STATUS_ID="${TESTRAIL_PASS_STATUS_ID:-1}" ;;
  failed:1) TESTRAIL_STATUS_ID="${TESTRAIL_FAIL_STATUS_ID:-5}" ;;
  *:2) TESTRAIL_STATUS_ID="${TESTRAIL_BLOCKED_STATUS_ID:-2}" ;;
  *:3) TESTRAIL_STATUS_ID="${TESTRAIL_RETEST_STATUS_ID:-4}" ;;
  *) TESTRAIL_STATUS_ID="${TESTRAIL_RETEST_STATUS_ID:-4}" ;;
esac

COMMENT="BrowserBash status: $STATUS
Summary: $SUMMARY
Exit code: $BB_EXIT
Duration ms: $DURATION
Cost USD: $COST
Assertions: $ASSERTIONS
CI run: ${CI_JOB_URL:-not provided}"

jq -n \
  --argjson status_id "$TESTRAIL_STATUS_ID" \
  --arg comment "$COMMENT" \
  '{ status_id: $status_id, comment: $comment }' > testrail-result.json

curl -sS -u "$TESTRAIL_USER:$TESTRAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  --data @testrail-result.json \
  "$TESTRAIL_BASE_URL/index.php?/api/v2/add_result_for_case/$TESTRAIL_RUN_ID/$TESTRAIL_CASE_ID"
```

TestRail status IDs are configurable in many installations, so keep them in environment variables. The defaults above reflect a common pattern, but your project may differ. Also keep `TESTRAIL_RUN_ID` and `TESTRAIL_CASE_ID` outside the script so CI can set them per suite, folder, test file, or matrix job.

If your workflow creates a new TestRail run for each CI execution, add a prior API call to create the run and export its ID. If your organization maintains long-lived milestone runs, use the existing run ID and update cases in place. BrowserBash does not dictate that structure.

## Mapping BrowserBash Outcomes to TestRail Status

The mapping should be agreed with QA and release managers before it lands in CI. A simple mapping looks like this:

| BrowserBash outcome | Exit code | Suggested TestRail result |
| --- | ---: | --- |
| Passed validation | 0 | Passed |
| Failed validation | 1 | Failed |
| Budget stop or infrastructure error | 2 | Blocked or custom status |
| Timeout | 3 | Retest or investigation status |
| Skipped after budget stop | 2 at suite level | Skipped or blocked |

This is where BrowserBash cost governance matters. If a suite stops because it crossed `--budget-usd`, the unlaunched tests are not product failures. Reporting them as failed would make release health look worse than it is. Use blocked, skipped, or a custom status depending on your TestRail configuration.

Viewport matrices also need careful mapping. If `--matrix-viewport 1280x720,390x844` runs every test twice, decide whether each viewport maps to a separate TestRail case, a separate result comment on the same case, or a custom field. For mobile-critical products, separate cases often make triage clearer.

Shards should not change identity. `run-all --shard 2/4` is an execution slice based on sorted discovery order. The shard number is useful context, but the TestRail case should be tied to the test name, slug, viewport, and product area.

## Use JUnit for Suite-Level Mapping

NDJSON is convenient for final verdicts, but JUnit can be easier when pushing a whole suite. BrowserBash suite runs can produce JUnit artifacts, and CI systems already know how to store them. A TestRail importer or custom script can walk the JUnit test cases, map names to case IDs, and add results.

The mapping file can be simple:

| BrowserBash test | TestRail case |
| --- | --- |
| checkout_smoke_test.md | C101 |
| account_settings_test.md | C102 |
| pricing_mobile_test.md at 390x844 | C103 |

Keep this mapping under review. If you generate BrowserBash tests through `browserbash import <specs-or-dir>`, review the generated `*_test.md` files and `IMPORT-REPORT.md` before wiring them to TestRail. The import is deterministic and model-free, but untranslatable Playwright steps are reported rather than invented.

For suite comments, include the BrowserBash summary, failed assertions, final state, duration, cost estimate, viewport, and artifact links. Keep raw NDJSON and full `RunAll-Result.md` as CI artifacts instead of stuffing them into TestRail fields.

## Assertions Are Better Evidence Than Raw Logs

BrowserBash deterministic `Verify` assertions are useful for TestRail because they tell a reviewer exactly what failed. Supported Verify checks include URL contains, title is or contains, visible text, named button, link, or heading visibility, element counts, and stored value equality.

When a deterministic Verify check fails, BrowserBash writes expected-vs-actual evidence into `run_end.assertions` and the Result.md assertion table. That is the content you want in a TestRail result comment. It is shorter and more actionable than a full browser log.

If a Verify line is outside the grammar, BrowserBash still runs it but flags it as `judged: true`. Include that flag when posting evidence. A judged failure may still be useful, but it should be treated differently from a compiled Playwright assertion.

For teams using testmd v2, remember the current limitation: v2 drives the builtin engine and needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. Version 1 tests behave as before.

## Local Models, Hosted Models, and Cost in CI

BrowserBash is Ollama-first. It defaults to local models, no API keys, and no page context leaving your machine. Its resolver checks local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. It also supports Anthropic Claude and OpenRouter with your own key.

For CI, choose the model based on flow difficulty and reliability. Very small local models, around 8B and under, can be flaky on long multi-step objectives. That flakiness can pollute TestRail history. For hard flows, use a mid-size local model such as Qwen3 or Llama 3.3 70B-class, or a capable hosted model.

The replay cache reduces repeated cost. A green run records its actions. The next identical run replays them with zero model calls, and the agent steps back in only when the page changed. That means common green paths can stay cheap while changed paths still get agent attention.

Cost estimates appear in `run_end.cost_usd` when the model is known in the bundled price table. Unknown models get no estimate rather than a wrong one. Include cost in TestRail comments when it helps the team understand suite spend, but do not make it the main result.

## CI, GitHub Action, and MCP Workflows

BrowserBash can run as raw CLI, through its GitHub Action, or through MCP hosts. The raw CLI gives you the most control over custom TestRail scripts. The GitHub Action gives you a ready workflow for installing the CLI, running suites, uploading artifacts, supporting shards and budgets, and posting PR comments.

MCP matters when AI coding agents are part of the development flow. BrowserBash 1.5.0 added `browserbash mcp`, exposing `run_objective`, `run_test_file`, and `run_suite` over stdio. Each returns structured verdict JSON. A failed test is still a successful tool call because the validation completed.

```bash
claude mcp add browserbash -- browserbash mcp
browserbash mcp
```

BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`. An AI agent can run the same tests a CI job later reports to TestRail. That keeps local agent validation and release reporting aligned.

For broader product context, the [BrowserBash learn hub](https://browserbash.com/learn), [features page](https://browserbash.com/features), and [BrowserBash blog](https://browserbash.com/blog) are useful references.

## When to Push, Skip, or Comment

Push TestRail results for planned tests that represent release coverage. This includes smoke suites, critical user journeys, production monitors that are part of release quality, and BrowserBash tests mapped to existing TestRail cases.

Skip TestRail pushes for exploratory local objectives, one-off AI-agent checks, and experiments that are not mapped to a case. Those runs can still be valuable, but they should not distort release reporting.

Comment or update existing results when a repeated failure belongs to the same case and same environment. If your TestRail process supports custom fields, include environment, viewport, shard context, BrowserBash version, exit code, and artifact links.

The rule is simple: TestRail should tell the release story. BrowserBash gives you the browser verdict. Your CI mapping should translate that verdict into a clear, non-noisy testing record.

## Push Test Results to TestRail Review Checklist

Before enabling TestRail pushes, decide the identity model. A BrowserBash test file can map to one TestRail case, but viewport matrices may need separate cases or separate result comments. If a mobile viewport failure should block a mobile release independently, give it its own case or custom field.

Review status mapping with QA leadership. BrowserBash `passed` with exit code `0` is straightforward. BrowserBash `failed` with exit code `1` is a failed validation. Exit code `2` needs care because it can represent budget stop, infrastructure error, or another non-product problem. Exit code `3` is timeout. TestRail should preserve those distinctions instead of flattening them into one failed status.

Keep result comments short and evidence-rich. Include summary, failed assertions, duration, cost estimate if present, viewport, environment, BrowserBash version if your CI captures it, and links to artifacts. Avoid posting full NDJSON into TestRail. Store raw files in CI and link to them.

Make the case mapping reviewable. A small mapping file from BrowserBash slug to TestRail case ID is easier to audit than hard-coded IDs hidden in shell scripts. When tests are imported from Playwright, review the generated markdown and `IMPORT-REPORT.md` before assigning permanent case IDs.

Finally, preserve the CI gate. The TestRail push should happen after BrowserBash runs but before the job exits with the original BrowserBash code. Reporting should never make a failed validation look green, and a TestRail API outage should be handled according to your release policy rather than accidentally hiding the product result.

Add a dry-run mode before updating live runs. Print the resolved run ID, case ID, status ID, and comment so QA owners can confirm the mapping. This is especially useful when one BrowserBash suite uses viewport matrices or sharding because the same logical test can produce several execution records.

Keep TestRail history readable. If the comment includes every raw event, nobody will use it. Put the summary, failed assertions, final state, duration, cost estimate, and artifact links in the comment. Store NDJSON, JUnit, and result markdown as CI artifacts for deeper analysis.

Review the mapping whenever tests are renamed. BrowserBash markdown files are easy to refactor, but TestRail case IDs are part of release reporting. A renamed test should either keep the same case mapping intentionally or get a new case when the product coverage has changed.

For sharded suites, let every shard publish its own results while sharing the same run identity. Sharding is an execution detail computed from sorted discovery order, not a different product behavior. The TestRail result should map to the case, environment, and viewport, with shard noted only in the comment when useful.

For viewport matrices, decide whether each viewport is a case, a configuration, or a comment on the same case. There is no single right answer. Mobile-heavy products often benefit from separate case visibility. Internal tools may be fine with one case and a comment that names the failing viewport. BrowserBash provides the labels, and the reporting policy should match how your QA team reviews releases.

If AI coding agents run BrowserBash before CI, treat those local validations as early signal. TestRail should usually receive the curated CI execution, not every exploratory agent run. That keeps release history clean while still letting agents use BrowserBash verdicts to fix issues before the suite reaches the official reporting step. The official run should be repeatable, mapped, and reviewed.

## FAQ

### How do I push test results to testrail from BrowserBash?

Run BrowserBash in CI, capture NDJSON or JUnit output, parse the verdict, and call the TestRail API with the mapped run and case IDs. Preserve the original BrowserBash exit code after posting the result.

### Should I use NDJSON or JUnit for TestRail?

Use NDJSON when you want structured verdict details such as assertions, duration, cost, and final state. Use JUnit when mapping a whole suite to many TestRail cases is easier through test-case records.

### How should budget stops appear in TestRail?

Do not report budget-stopped tests as product failures. Mark them as blocked, skipped, or a custom governance status depending on your TestRail configuration, and include the BrowserBash exit code.

### Can BrowserBash TestRail reporting work with AI agents?

Yes. AI agents can run BrowserBash through CLI or MCP, and CI can later push the same style of structured results to TestRail. The key is using the verdict fields instead of parsing prose.

TestRail reporting works when BrowserBash remains the source of browser truth and CI performs a disciplined mapping. Install BrowserBash with `npm install -g browserbash-cli`, then run locally or create an optional account at [BrowserBash sign up](https://browserbash.com/sign-up) if you want cloud dashboard uploads.
