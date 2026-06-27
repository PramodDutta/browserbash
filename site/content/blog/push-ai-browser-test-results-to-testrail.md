---
title: Push AI Browser Test Results to TestRail From CI
description: "A testrail test results integration for AI browser tests: key markdown _test.md files to case IDs, derive pass/fail from exit codes, push via the TestRail API."
date: 2026-06-27
category: ci
---

To push AI browser test results to TestRail from CI, you key each BrowserBash markdown test file to a TestRail case ID, run the test in your pipeline, read the process exit code to decide pass or fail, and POST that status to the TestRail API as a result inside a test run. There is no native TestRail plugin to install: BrowserBash gives you machine-readable exit codes and a `Result.md` per run, and a short shell or script step turns those into TestRail's `add_results_for_cases` payload. This guide shows the whole loop end to end, including how to store the case-ID mapping, how exit codes map to TestRail statuses, and the honest parts about keeping that mapping from drifting.

The shape of the integration matters more than the specific CLI. Any tool that returns disciplined exit codes can feed TestRail this way. I use BrowserBash because it was built for CI: plain-English `*_test.md` files, NDJSON output under `--agent`, four well-defined exit codes, and a written result file per run.

## The mental model: tests are intent, TestRail is the ledger

In a classic Selenium or Playwright suite, a "test" is a function full of selectors. In BrowserBash, a test is an intent written in markdown. A `*_test.md` file has a title, numbered or bulleted steps in plain English, optional `@import` composition, and `{{variables}}` whose secret values are masked in logs. The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, so the file reads like a manual test script a human QA would follow.

TestRail, meanwhile, is the system of record. It does not care how the test ran: it wants a case ID and a status (passed, failed, blocked, untested, retest) for a given run. Your job in CI is to translate between those two worlds, taking the verdict BrowserBash produces and writing it against the right TestRail case.

That translation has exactly three moving parts:

1. A stable mapping from each `*_test.md` file to one or more TestRail case IDs.
2. A way to derive a TestRail status from a BrowserBash run (the exit code).
3. A call to the TestRail API to record the result inside a run.

Get those three right and the rest is plumbing. If you are new to writing these test files, the [markdown test files tutorial](https://browserbash.com/blog/markdown-test-files-tutorial) covers the syntax in depth, and the [features page](https://browserbash.com/features) lists what the agent can drive.

## Step 1: Key your _test.md files to TestRail case IDs

You need a deterministic link between a file on disk and a number in TestRail (case IDs look like `C1234`, and the API wants the bare integer `1234`). There are three common ways to store that link. Pick one and be consistent.

### Option A: a sidecar mapping file (recommended)

Keep a single JSON file in the repo that maps file paths to case IDs. It is explicit, reviewable in pull requests, and easy for a script to read.

```json
{
  "tests/login_test.md": 1234,
  "tests/checkout_test.md": 1235,
  "tests/search_test.md": 1236
}
```

The strength here is that the mapping lives next to the tests and changes go through code review. The weakness is that nothing enforces it: if someone adds `tests/profile_test.md` and forgets to add a line, that test silently never reaches TestRail. That gap is the single biggest failure mode of any TestRail test results integration, and the honest-limits section covers how to guard against it.

### Option B: a naming convention in the filename

Encode the case ID in the filename itself, for example `login.C1234_test.md`, and parse it out with a regex. This guarantees every test has an ID, because the ID is part of the name. The downside is churn: if a case is renumbered in TestRail (it happens during reorganizations), you rename files and muddy git history.

### Option C: a front-matter or comment tag inside the file

Put the ID in the markdown itself, near the title:

```markdown
# Login flow
<!-- testrail-case: 1234 -->

1. Go to {{base_url}}/login
2. Type {{user_email}} into the email field
3. Type {{user_password}} into the password field
4. Click the Sign in button
5. Confirm the dashboard heading is visible
```

This keeps the ID visible to whoever reads the test and survives file renames. The tradeoff is parsing markdown to find it, which is slightly more code than reading one JSON file.

For most teams Option A wins: the mapping is centralized and a single CI guard can assert that every `*_test.md` has an entry. The examples below assume the sidecar JSON, but the same shape works for any of the three.

## Step 2: Run the test and capture the exit code

BrowserBash returns four exit codes, and they map cleanly onto TestRail statuses. This is the whole reason exit-code gating beats log scraping: you never parse English to decide a verdict.

| BrowserBash exit code | Meaning | TestRail status_id | TestRail label |
|---|---|---|---|
| 0 | pass | 1 | Passed |
| 1 | fail (objective not met) | 5 | Failed |
| 2 | error (crash, bad config) | 4 | Retest, or a custom status |
| 3 | timeout | 5 (or custom) | Failed |

TestRail's default `status_id` values are `1` passed, `2` blocked, `3` untested, `4` retest, `5` failed. If your instance defines custom statuses, your integers will differ, so confirm them in your TestRail admin before hardcoding. A defensible mapping treats `0` as passed, `1` and `3` as failed, and `2` as retest so an infrastructure crash does not masquerade as a genuine product failure. The exit-code contract is covered in full in the [exit codes CI tutorial](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial).

Run a single markdown test like this:

```bash
browserbash testmd run ./tests/login_test.md --headless --agent --record
```

`--agent` emits NDJSON (one JSON event per line) so a parser can read structured progress, `--headless` keeps it CI-friendly, and `--record` writes a `.webm` video plus screenshots you can attach to the TestRail result as evidence. Every run also writes a `Result.md`, which is a human-readable summary you can paste into the result comment.

In a shell step, grab the exit code immediately after the run:

```bash
browserbash testmd run ./tests/login_test.md --headless --agent
status=$?
echo "browserbash exited with $status"
```

Do not chain the run with `&&` or `||` before you have read `$?`, or you will lose the precise code. Capture it first, branch later.

## Step 3: Push the result to the TestRail API

TestRail's API authenticates with basic auth (your email plus an API key generated under My Settings), and you record results against a test run. There are two endpoints worth knowing:

- `add_result_for_case/{run_id}/{case_id}` adds one result to one case.
- `add_results_for_cases/{run_id}` adds many results in a single call, which is what you want at the end of a suite.

Here is a minimal single-result push using `curl`. It assumes you already created a run (more on that next) and have its `run_id`.

```bash
TESTRAIL_URL="https://yourcompany.testrail.io"
TESTRAIL_USER="ci@yourcompany.com"
TESTRAIL_KEY="$TESTRAIL_API_KEY"   # injected from a CI secret, never hardcoded
RUN_ID=42
CASE_ID=1234

# map the BrowserBash exit code to a TestRail status_id
case "$status" in
  0) status_id=1 ;;   # passed
  2) status_id=4 ;;   # retest (infra error, not a real failure)
  *) status_id=5 ;;   # failed (covers 1 and 3)
esac

curl -s -X POST \
  "$TESTRAIL_URL/index.php?/api/v2/add_result_for_case/$RUN_ID/$CASE_ID" \
  -u "$TESTRAIL_USER:$TESTRAIL_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"status_id\": $status_id, \"comment\": \"BrowserBash exit $status. See attached recording.\"}"
```

The `comment` field is where you paste the tail of `Result.md` so a human reading TestRail sees what the agent actually did, not just a red or green dot. The result is written in the same language a manual tester would use. There is more on turning runs into readable summaries in [browser test reports and stakeholder summaries](https://browserbash.com/blog/browser-test-reports-and-stakeholder-summaries).

### Batch the whole suite into one call

Per-test `curl` calls are fine for a handful of tests, but for a real suite you want to collect every result and send them together. Loop over your mapping, run each test, build an array, then POST once to `add_results_for_cases`:

```bash
#!/usr/bin/env bash
set -uo pipefail

MAP=tests/testrail-map.json
RESULTS="[]"

for file in $(jq -r 'keys[]' "$MAP"); do
  case_id=$(jq -r --arg f "$file" '.[$f]' "$MAP")

  browserbash testmd run "./$file" --headless --agent >/dev/null 2>&1
  status=$?

  case "$status" in
    0) status_id=1 ;;
    2) status_id=4 ;;
    *) status_id=5 ;;
  esac

  RESULTS=$(jq \
    --argjson cid "$case_id" \
    --argjson sid "$status_id" \
    --arg cmt "BrowserBash exit $status on $file" \
    '. + [{"case_id": $cid, "status_id": $sid, "comment": $cmt}]' \
    <<<"$RESULTS")
done

curl -s -X POST \
  "$TESTRAIL_URL/index.php?/api/v2/add_results_for_cases/$RUN_ID" \
  -u "$TESTRAIL_USER:$TESTRAIL_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"results\": $RESULTS}"
```

One important TestRail rule: `add_results_for_cases` only accepts case IDs that are actually in the run. If a case is not part of the run, the whole call is rejected. So either create runs that include every case you plan to push, or use `include_all: true` when you create the run.

## Step 4: Create (or reuse) the test run

You generally want a fresh TestRail run per CI build so results are timestamped to a commit. Create one at the start of the job and capture its `run_id`:

```bash
PROJECT_ID=7
SUITE_ID=3   # omit in single-suite projects

RUN_ID=$(curl -s -X POST \
  "$TESTRAIL_URL/index.php?/api/v2/add_run/$PROJECT_ID" \
  -u "$TESTRAIL_USER:$TESTRAIL_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"suite_id\": $SUITE_ID, \"name\": \"CI run $GIT_COMMIT\", \"include_all\": true}" \
  | jq -r '.id')
```

Naming the run after the commit SHA (or build number) makes it trivial to trace a TestRail result back to the exact code that produced it. `include_all: true` puts every case in the suite into the run, sidestepping the not-in-run rejection above. For a subset, set `include_all: false` and pass a `case_ids` array of exactly the IDs your mapping covers.

## Putting it together in a GitHub Actions job

Here is the full loop in one workflow. It installs the CLI, creates a run, executes the suite, pushes results, and never lets a TestRail hiccup hide a real test failure.

```yaml
name: ai-browser-tests-to-testrail
on: [push]

jobs:
  e2e:
    runs-on: ubuntu-latest
    env:
      TESTRAIL_URL: https://yourcompany.testrail.io
      TESTRAIL_USER: ci@yourcompany.com
      TESTRAIL_API_KEY: ${{ secrets.TESTRAIL_API_KEY }}
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      PROJECT_ID: 7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli
      - name: Create TestRail run
        run: |
          RUN_ID=$(curl -s -X POST \
            "$TESTRAIL_URL/index.php?/api/v2/add_run/$PROJECT_ID" \
            -u "$TESTRAIL_USER:$TESTRAIL_API_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"name\": \"CI $GITHUB_SHA\", \"include_all\": true}" | jq -r '.id')
          echo "RUN_ID=$RUN_ID" >> "$GITHUB_ENV"
      - name: Run suite and push results
        run: ./scripts/run-and-push-testrail.sh
      - name: Fail the build if any test failed
        run: ./scripts/check-suite-verdict.sh
```

Notice the separation in the last two steps. The push-to-TestRail step records every result regardless of pass or fail (you always want the ledger updated). A separate verdict step then decides whether the build goes red, by checking whether any test exited non-zero. Keeping reporting and gating apart means a flaky TestRail API call never accidentally turns a passing build red, and a failing test never gets buried because the reporting step happened to succeed.

The model decision sits underneath all of this. BrowserBash resolves the model as `auto` by default: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free hosted models exist there). On a hosted CI runner with no GPU, point it at a hosted model. Small local models (8B and under) get flaky on long multi-step flows, so a six-step checkout that feeds TestRail wants a 70B-class model (Qwen3, Llama 3.3) or a capable hosted model. A local model keeps everything on the machine, which matters if your test data is sensitive.

## Honest limits of an AI-to-TestRail integration

This works, and it works well once it is wired, but there are real edges. Pretending otherwise would not help you.

**The mapping drifts, and TestRail will not warn you.** This is the central weakness. A new `*_test.md` with no entry in your map simply never reaches TestRail, and a deleted test leaves a stale case ID that silently passes nothing. The fix is a CI guard that fails the build when a `*_test.md` file has no mapping and when a mapped ID points to a file that no longer exists. Write that guard on day one. Without it, a green TestRail dashboard becomes worse than no dashboard because people trust it.

**Status granularity is coarse.** A process exit code is a blunt instrument. Exit `1` tells you the objective was not met, but TestRail's `failed` status cannot, by itself, distinguish "the login button moved and the agent could not find it" from "the app returned a 500." You recover the detail by piping the tail of `Result.md` into the `comment` and attaching the `--record` video, but the structured status is still just passed, failed, or retest. If your team relies on fine-grained failure taxonomies in TestRail, you do that classification by hand from the comments.

**Non-determinism complicates a "failed" verdict.** An agentic runner reads the live page each step and decides the next action from what is rendered right then. It is not self-healing and it does not keep a saved selector script: it re-derives from the live state on every run. That resilience to cosmetic UI change is the point, but it also means a genuinely ambiguous screen can produce a different path on a re-run. A `failed` in TestRail might be a real regression or might be a model misread on a hard flow. Treat a first failure as a signal to re-run before you file a bug, and reserve the smaller, flakier models for short flows. The deeper trade-off between manual scripts and plain-English tests is unpacked in [manual QA plain English tests in CI](https://browserbash.com/blog/manual-qa-plain-english-tests-in-ci).

**Attachments need an extra call.** TestRail attaches files through `add_attachment_to_result/{result_id}`, so you first POST the result, capture the returned `result_id`, then POST the `.webm` or screenshots in a second call. The batch `add_results_for_cases` endpoint does not return per-result IDs in a form convenient for attaching, so video evidence on every case means falling back to per-result pushes. Decide whether evidence-on-every-case is worth the extra round trips, or attach only on failures.

**One test, many cases is awkward.** A single rich `*_test.md` might cover what TestRail models as three cases. You can push the same status to several case IDs from one run by listing them all in the map, but if step two of five fails, all three cases go red even though one was never exercised. If your TestRail cases are fine-grained, keep your `*_test.md` files fine-grained too, ideally one file per case, and use `@import` to share setup like login rather than bundling everything into one giant test.

If you want to go deeper on the runner itself before wiring TestRail, the [learn hub](https://browserbash.com/learn) collects the tutorials in order.

## FAQ

### How do I map a BrowserBash exit code to a TestRail status?

Read the process exit code right after the run (`status=$?`) and translate it: `0` becomes TestRail `status_id` 1 (passed), `1` and `3` become 5 (failed), and `2` becomes 4 (retest) so a crash or bad config is not recorded as a genuine product failure. Confirm those integers against your own TestRail instance first, because custom statuses change the numbers. The four BrowserBash codes are `0` pass, `1` fail, `2` error, `3` timeout.

### Do I need a TestRail plugin or a paid add-on for this?

No. The integration is just HTTP calls to the standard TestRail API (`add_run`, `add_results_for_cases`, optionally `add_attachment_to_result`) using basic auth with your email and an API key. BrowserBash is free and open source (Apache-2.0), installed with `npm install -g browserbash-cli`, and emits the exit codes and `Result.md` that your push script reads. No marketplace plugin is required on either side.

### How do I keep the test-to-case mapping from going stale?

Add a CI guard that runs before the suite and fails the build on two conditions: a `*_test.md` file that has no entry in your mapping, and a mapped case ID whose file no longer exists. A sidecar JSON map reviewed in pull requests, plus that guard, catches the drift that otherwise makes a green TestRail dashboard quietly inaccurate. This is the most important piece to build, not an optional extra.

### Can I attach the recorded video to the TestRail result?

Yes, with a second API call. Run with `--record` to produce a `.webm` and screenshots, push the result first to get its `result_id`, then POST the file to `add_attachment_to_result/{result_id}`. Because the batch endpoint does not hand back per-result IDs conveniently, attaching evidence usually means per-result pushes for the cases you want video on. Many teams attach on failures only to keep the call count down.
