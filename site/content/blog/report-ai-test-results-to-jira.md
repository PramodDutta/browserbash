---
title: Report AI Browser Test Results to Jira
description: "Learn how to report test results to jira from BrowserBash NDJSON and JUnit outputs, with CI gates and issue comments."
date: 2026-07-25
category: ci
---
If you need to report test results to jira from AI browser tests, the hard part is not running the browser. It is turning a real validation result into the right Jira signal without flooding the project. BrowserBash helps because every run can produce structured output: NDJSON events for agents and CI, a final `run_end` verdict, JUnit for suites, and human-readable result files for debugging.

The goal is simple. A failed browser validation should create or update the right Jira issue, attach enough evidence for triage, and preserve the CI gate. A passed validation should not spam Jira. A budget stop or infrastructure error should be distinguishable from a real product failure. That distinction matters when your tests are powered by AI agents and real Chrome or Chromium sessions.

BrowserBash is a free, open-source Apache-2.0 CLI from The Testing Academy, founded by Pramod Dutta. Install it with `npm install -g browserbash-cli` and run it with `browserbash`. It is built as the open-source validation layer for AI agents: you write a plain-English objective or test file, the browser is driven step by step, and the run returns a deterministic verdict plus structured results.

## Why Report Test Results to Jira From Structured Verdicts

Jira is where many engineering teams coordinate triage, ownership, release risk, and follow-up work. If your browser test fails in CI but the only evidence is a long log, the failure often gets ignored or manually retyped. If the CI job creates noisy duplicate tickets, the team starts ignoring those too.

The better approach is to report only meaningful state. BrowserBash gives you the data needed to do that. In `--agent` mode, it emits one JSON event per line. The final `run_end` event carries the verdict fields you care about: status, summary, final state, assertions, cost estimate when known, and duration in milliseconds. Suite runs can also produce JUnit and result artifacts.

That lets a CI script make a sober decision. If status is failed, create or update a Jira issue for that test. If status is passed, optionally comment on an existing open issue or leave Jira alone. If exit code is `2`, treat it as infrastructure, budget, or runner error. If exit code is `3`, treat it as timeout. Do not collapse all outcomes into "test failed."

This is especially important for AI browser tests. A failed test is a successful validation when the browser completed the flow and found a product problem. BrowserBash's MCP server follows the same idea: the tool call succeeds and the agent reads the failed verdict.

## BrowserBash Outputs You Can Send to Jira

BrowserBash provides several outputs that map well to Jira workflows. The first is NDJSON from `--agent`. Each line is a JSON event. CI scripts can filter for `run_end` and extract a compact, structured summary.

The second is JUnit from suite runs. JUnit is useful when CI platforms already collect test results, and when you want a stable test-case-oriented view. BrowserBash writes spend into JUnit properties when budget governance is active, and labels viewport matrix runs in events, JUnit, and results.

The third is the human-readable `Result.md` or `RunAll-Result.md`. These files are useful as issue body content or artifacts linked from the Jira issue. A developer reading the issue can inspect the summary, final state, and assertion table without opening raw CI logs.

The fourth is the exit code. BrowserBash uses `0` for passed, `1` for failed validation, `2` for error, infrastructure issue, or budget stop, and `3` for timeout. Your Jira reporting step should capture the BrowserBash exit code but delay failing the CI job until after it has posted the issue or comment.

## A CI Pattern That Does Not Hide the Gate

The common mistake is running the test command directly with shell settings that stop the job before reporting. In CI, you usually want to capture the exit code, parse the output, report to Jira, then exit with the original code. That preserves the gate while still creating the triage record.

```bash
set +e
browserbash run-all tests/browserbash --agent --budget-usd 2.50 > browserbash.ndjson
BB_EXIT=$?
set -e

node scripts/report-browserbash-to-jira.js browserbash.ndjson "$BB_EXIT"
exit "$BB_EXIT"
```

The script can decide what to do based on the final verdict and exit code. For a single objective, the same pattern works with `browserbash run "...objective..." --agent`. For a single markdown file, use `browserbash testmd path/to/file_test.md --agent` if your workflow emits agent events for that command.

This approach also handles budget governance cleanly. In BrowserBash 1.5.0, `run-all --budget-usd 2.50` or `--budget-tokens` stops launching new tests once the suite crosses the budget. Remaining tests are reported skipped, the suite exits `2`, and spend lands in `RunAll-Result.md` and JUnit properties. Jira should not report those skipped tests as product bugs.

The [BrowserBash GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) is useful if you prefer a packaged action. The action installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and budgets, and posts a self-updating PR comment with the verdict table.

## Concrete Jira Reporting Script

The script below reads a BrowserBash NDJSON file, finds the last `run_end` event, and creates a Jira issue only when the validation status is failed. It is intentionally small. Real teams usually add deduplication by test slug, labels, component mapping, and "comment on existing issue" behavior.

```bash
#!/usr/bin/env bash
set -euo pipefail

NDJSON_FILE="${1:?Usage: report-browserbash-to-jira.sh browserbash.ndjson exit_code}"
BB_EXIT="${2:-0}"

RUN_END="$(grep '"run_end"' "$NDJSON_FILE" | tail -n 1)"
STATUS="$(printf '%s' "$RUN_END" | jq -r '.status // .data.status // "unknown"')"
SUMMARY="$(printf '%s' "$RUN_END" | jq -r '.summary // .data.summary // "BrowserBash validation result"')"
DURATION="$(printf '%s' "$RUN_END" | jq -r '.duration_ms // .data.duration_ms // "unknown"')"
COST="$(printf '%s' "$RUN_END" | jq -r '.cost_usd // .data.cost_usd // "not estimated"')"
ASSERTIONS="$(printf '%s' "$RUN_END" | jq -c '.assertions // .data.assertions // []')"

if [ "$STATUS" != "failed" ]; then
  echo "BrowserBash status is $STATUS, Jira issue creation skipped."
  exit 0
fi

BODY="BrowserBash validation failed.

Summary: $SUMMARY
Exit code: $BB_EXIT
Duration ms: $DURATION
Cost USD: $COST
Assertions: $ASSERTIONS

CI run: ${CI_JOB_URL:-not provided}"

jq -n \
  --arg project "$JIRA_PROJECT_KEY" \
  --arg summary "BrowserBash failed: $SUMMARY" \
  --arg body "$BODY" \
  '{
    fields: {
      project: { key: $project },
      summary: $summary,
      issuetype: { name: "Bug" },
      description: $body
    }
  }' > jira-payload.json

curl -sS -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -X POST \
  --data @jira-payload.json \
  "$JIRA_BASE_URL/rest/api/3/issue"
```

Treat the Jira fields as project-specific. Many Jira projects require custom fields, components, labels, or a different issue type. Keep those mappings in CI variables or a small config file. Do not hard-code secrets. Use environment variables such as `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, and `JIRA_PROJECT_KEY`.

For teams that use Jira Data Center or a customized Jira Cloud workflow, adjust the endpoint and payload to match the deployment. The BrowserBash side of the integration stays the same: capture NDJSON, parse `run_end`, and preserve the original exit code.

## Mapping Verdicts to Jira Actions

You do not need a Jira issue for every BrowserBash event. You need an action model. The simplest model is based on status and exit code:

| BrowserBash outcome | CI exit code | Jira action |
| --- | ---: | --- |
| Passed validation | 0 | No issue, or comment resolved on an existing issue |
| Failed validation | 1 | Create or update a product bug |
| Infra, runner error, or budget stop | 2 | Create CI infrastructure issue only if repeated |
| Timeout | 3 | Create timeout investigation issue if repeated |

This table prevents noisy reporting. A budget stop from cost governance is not a product bug. A timeout might be a product performance problem, but it might also be a CI environment problem. A failed validation with deterministic assertion evidence is the strongest Jira signal.

If you run BrowserBash monitor mode, apply similar restraint. Monitor mode runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes. It does not alert on every green run. That state-change model is a good example for Jira too: create or update issues when state changes or when a failure repeats, not on every run.

Deduplication is worth adding early. A practical key can combine suite name, test slug, viewport label, and assertion name. For example, `browserbash:checkout_test:390x844:Verify text Order confirmed visible`. Store that key as a Jira label or in a custom field if your workflow allows it.

## Include Assertion Evidence, Not Just Screenshots

Screenshots can help, but assertion evidence is more useful for triage. BrowserBash deterministic `Verify` checks record expected-vs-actual evidence in `run_end.assertions` and in the `Result.md` assertion table. Send that to Jira in a compact form.

For example, if a test says `Verify text "Invoice sent" visible`, a failure can show the expected text and the actual result. That tells the developer what was missing. If the failure is agent-judged, BrowserBash flags the assertion as `judged: true`, which helps the triager understand the confidence level.

Keep Jira issue bodies readable. Put the summary, status, exit code, duration, cost estimate, failed assertion table, viewport, shard, and CI artifact links near the top. Avoid pasting thousands of lines of NDJSON into the description. Store raw files as CI artifacts and link them.

For suite runs, `RunAll-Result.md` is often the best human-readable artifact. JUnit is better for CI dashboards and historical test reporting. NDJSON is better for automation and issue creation. Use all three for the jobs they are good at.

## Shards, Viewports, and Test Identity

BrowserBash 1.5.0 added deterministic sharding and viewport matrices. `run-all --shard 2/4` runs a slice computed from sorted discovery order, so parallel CI machines agree without coordination. `--matrix-viewport 1280x720,390x844` runs every test once per viewport and labels the outputs.

Those labels matter for Jira. A failure on mobile should not overwrite a desktop issue if the causes are likely different. Include viewport in the dedupe key and issue title. Include shard only as execution context, not as part of the product identity, because a test may run on a different shard when the suite changes.

```bash
browserbash run-all tests/browserbash \
  --shard "${CI_NODE_INDEX:-1}/${CI_NODE_TOTAL:-1}" \
  --matrix-viewport 1280x720,390x844 \
  --budget-usd 2.50 \
  --agent > browserbash.ndjson
```

If you import tests from Playwright with `browserbash import <specs-or-dir>`, review the generated `*_test.md` files before wiring them to Jira. The import is deterministic and model-free, but any untranslatable steps land in `IMPORT-REPORT.md`. You want Jira reporting connected to meaningful tests, not half-migrated drafts.

## Cost, Local Models, and Governance

BrowserBash is Ollama-first. Local models run with no API keys and nothing leaving your machine. The resolver checks local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. It supports OpenRouter and Anthropic Claude when you bring your own key.

For CI reporting, model choice affects both cost and reliability. Very small local models, around 8B and under, can be flaky on long multi-step objectives. A flaky model can create noisy Jira issues. For hard browser flows, use a mid-size local model such as Qwen3 or Llama 3.3 70B-class, or a capable hosted model.

The replay cache helps reduce cost and noise. A green run records its actions. The next identical run replays them with zero model calls, and the agent steps back in only when the page changed. For Jira, that means fewer model-driven variations in repeated green runs.

Cost estimates in `run_end.cost_usd` come from a bundled per-model price table when the model is known. Unknown models get no estimate rather than a wrong one. If a suite crosses `--budget-usd`, treat that as a governance event in Jira, not as a failed product assertion.

## When to Create Jira Issues, Comments, or Nothing

Choose issue creation for confirmed failed validations that need engineering work. The best candidates have deterministic assertion failures, clear test identity, and a reproducible CI artifact. Use labels such as `browserbash`, environment, viewport, and area so teams can filter.

Choose comments when a known issue fails again, when a previously failing issue passes, or when a monitor detects a pass-to-fail state change. Comments are less noisy than duplicates and preserve history in one place.

Choose no Jira action for passing runs, one-off infrastructure errors, budget stops that are already visible in CI, and exploratory local runs. The goal is signal, not maximum ticket count.

The [BrowserBash features page](https://browserbash.com/features), [learn hub](https://browserbash.com/learn), and [blog](https://browserbash.com/blog) provide more context on test files, agent output, and validation workflows.

## Report Test Results to Jira Review Checklist

Before you enable Jira reporting in CI, decide what counts as a product issue. A BrowserBash exit code of `1` usually means the browser validation completed and the product did not satisfy the test. That is the strongest Jira candidate. Exit code `2` needs different handling because it can represent infrastructure, error, or budget stop. Exit code `3` is a timeout and may need investigation before it becomes a product bug.

Review the issue body for triage value. It should include the BrowserBash status, summary, failed assertions, final state, duration, cost estimate if present, viewport, environment, and CI artifact links. It should not include raw secrets, full NDJSON dumps, or pages of unfiltered logs. Secret-marked BrowserBash variables are masked in log lines, but your Jira script should still avoid copying unnecessary data.

Decide how duplicates are handled. Without deduplication, a repeated failure can create a new Jira issue on every CI run. A better approach is to create a stable key from the test slug, environment, viewport, and assertion. Use that key to find an existing open issue, then add a comment instead of creating a duplicate.

Plan for recovery comments as well as failure comments. When a monitor or CI suite moves from failed to passed, a short comment on the existing issue helps release managers understand that the validation recovered. BrowserBash monitor mode already follows a state-change alert model, and Jira reporting should follow the same discipline.

Finally, keep ownership clear. Map test folders or labels to Jira components when your project uses them. A browser failure without an owner tends to drift. A failure with assertion evidence, component, environment, and artifact links can be triaged quickly.

Add a dry-run mode before the first rollout. The script can print the Jira payload and skip the API call while teams review fields, labels, and dedupe keys. That catches bad project keys, missing required fields, and overly verbose descriptions before the integration starts creating real issues.

Treat security as part of the integration design. BrowserBash masks secret-marked variables in logs, but Jira comments can live much longer than CI logs and may be visible to a broader audience. Keep credentials, tokens, cookies, and raw page dumps out of issue bodies. Link to protected CI artifacts for deeper debugging.

Measure noise during the first week. Count created issues, duplicate comments, infrastructure outcomes, and product failures separately. If too many issues come from timeouts or budget stops, adjust the mapping before the team loses trust in the signal.

For sharded suites, make sure the reporting step runs in every shard but uses the same dedupe strategy. The shard number is execution context, not product identity. A failure should map to the same Jira issue whether it ran on shard one today or shard three after the suite order changed. Use test slug, assertion, environment, and viewport as the stable parts of the key.

For viewport matrices, decide whether mobile and desktop failures share an issue. If the same assertion fails in both viewports, one issue may be enough. If only the mobile viewport fails, a separate issue with the viewport in the title is usually easier for frontend owners to triage. BrowserBash labels viewport runs in events, JUnit, and results, so carry that label into Jira.

If AI coding agents are part of your workflow, keep Jira reporting downstream of validation rather than inside every local agent loop. Agents need fast feedback from structured verdicts. Jira needs durable records for failures that matter to the team. BrowserBash can serve both, as long as CI decides when a validation becomes a tracked issue. That policy keeps local iteration fast and Jira signal clean.

## FAQ

### How do I report test results to jira from BrowserBash?

Run BrowserBash with `--agent`, capture the NDJSON output, parse the final `run_end` verdict, and call the Jira API from CI. Preserve the original BrowserBash exit code so the CI gate still reflects the validation result.

### Should every BrowserBash failure create a Jira issue?

No. Product validation failures are good Jira candidates, especially with deterministic assertion evidence. Budget stops, infrastructure errors, and one-off timeouts should usually be handled separately or only reported after repetition.

### Can I attach BrowserBash JUnit results to Jira?

Yes, if your Jira workflow or test-management integration accepts JUnit artifacts. Many teams keep JUnit in CI and send a compact Jira issue with links to JUnit, NDJSON, and `Result.md` artifacts.

### What fields from run_end matter most for Jira?

Status, summary, final state, assertions, duration, cost estimate, viewport label, and CI artifact links are the most useful. Assertion evidence is especially valuable because it shows expected-vs-actual details.

Jira reporting works best when BrowserBash remains the validation source and Jira receives only actionable signal. Install BrowserBash with `npm install -g browserbash-cli`, then run it locally or create an optional account at [BrowserBash sign up](https://browserbash.com/sign-up) if you want cloud dashboard uploads.
