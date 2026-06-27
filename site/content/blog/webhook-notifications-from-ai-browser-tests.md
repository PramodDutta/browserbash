---
title: Send Webhook Notifications From AI Browser Test Runs
description: "Fire webhook notifications from browser tests: build a JSON payload from the BrowserBash exit code, Result.md, and run metadata, then POST it from CI."
date: 2026-06-27
category: ci
---

To send a webhook notification from a BrowserBash run, you read the signal BrowserBash already gives you (the process exit code, the `Result.md` summary it writes per run, and any run metadata you have in CI), assemble those into a small JSON payload in a shell step, and `POST` that payload to your webhook URL with `curl`. BrowserBash does not call out to Slack, Discord, Teams, or a generic endpoint by itself, and it never will pretend to: it runs the test, returns a verdict you can branch on, and leaves the delivery to you. That is the honest shape of this integration, and it is genuinely a few lines of glue once you see the pieces. This post walks through every piece: the exit code contract, what `Result.md` contains, a reusable payload schema, and a copy-paste shell snippet plus a GitHub Actions job that fires the webhook on pass, on fail, or on both.

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You write an objective in plain English, an AI agent drives a real Chrome or Chromium browser through it step by step, and you get back a verdict as the process exit status. Because the verdict is a number and not a line of prose you have to scrape, it is trivial to turn into a webhook payload. Let's build that.

## The signals BrowserBash gives you

A webhook is only as useful as the data you put in it. BrowserBash hands you three distinct signals after a run, and a good payload uses all three.

### 1. The exit code (the verdict)

This is the load-bearing one. Every run ends with one of four exit codes, and the contract is fixed:

- `0` is passed. The agent satisfied the objective.
- `1` is failed. The agent ran the flow but the assertion did not hold.
- `2` is error. Something broke before a verdict could be reached (bad config, the site never loaded, a crash).
- `3` is timeout. The run hit its time ceiling before finishing.

The distinction between `1` and `2`/`3` matters for a webhook because the message you want to send is different. A `1` means "the app is broken, ping the team." A `2` or `3` often means "the test harness or environment hiccuped, maybe retry before you wake anyone." Encode that nuance in the payload rather than flattening everything into "failed." For the full breakdown, see [BrowserBash exit codes and CI gating, explained](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial).

### 2. Result.md (the human summary)

Every run writes a `Result.md` file: a short, readable summary of what the agent did, what it verified, and why it reached its verdict. This is the body you want in a Slack message or an email so a human can read it without opening a dashboard. It is plain Markdown, so you can ship it whole or extract a few lines. The companion post on [browser test reports and stakeholder summaries](https://browserbash.com/blog/browser-test-reports-and-stakeholder-summaries) goes deeper on shaping that output for non-engineers.

### 3. NDJSON from `--agent` (the structured detail)

When you pass `--agent`, BrowserBash emits NDJSON (one JSON object per line) to stdout: a structured, per-step record of the run. This is the machine-readable feed. If you want your webhook payload to include the failing step, the objective text, or step counts, you parse the NDJSON rather than scraping the human summary. The [NDJSON agent mode tutorial](https://browserbash.com/blog/ndjson-agent-mode-tutorial) covers the event shapes in detail.

There is also `--record`, which captures a webm video plus screenshots. You cannot stuff a video into a JSON webhook, but you can upload the artifact in CI and put the resulting URL into your payload, which is exactly what most teams want.

## A reusable webhook payload schema

Before writing shell, decide on a schema. A generic, service-agnostic envelope keeps your glue reusable across Slack, Discord, a custom endpoint, or an internal event bus. Here is a schema that has held up well:

```json
{
  "event": "browser_test_completed",
  "status": "passed",
  "exit_code": 0,
  "objective": "Log in and confirm the dashboard shows the welcome banner",
  "test_file": "smoke_test.md",
  "summary": "Agent logged in as the test user and verified the welcome banner is visible.",
  "metadata": {
    "repo": "acme/storefront",
    "branch": "main",
    "commit": "9f3c1a2",
    "ci_run_url": "https://github.com/acme/storefront/actions/runs/123",
    "environment": "staging",
    "timestamp": "2026-06-27T14:02:11Z"
  },
  "artifacts": {
    "recording_url": null,
    "result_md_url": null
  }
}
```

The fields break into three groups. The verdict group (`status`, `exit_code`) comes straight from BrowserBash. The context group (`objective`, `test_file`, `metadata`) is yours: you know your repo, branch, and environment, and BrowserBash neither knows nor needs to. The artifact group (`artifacts`) is optional and gets populated only if you upload the recording or `Result.md` somewhere reachable.

Map `exit_code` to a human `status` once, in one place, so every downstream consumer agrees on the vocabulary:

| exit_code | status   | meaning                          |
| --------- | -------- | -------------------------------- |
| 0         | passed   | objective satisfied              |
| 1         | failed   | assertion did not hold           |
| 2         | error    | broke before reaching a verdict  |
| 3         | timeout  | hit the time ceiling             |

## The run that produces the signal

Start with the test itself. A BrowserBash test is intent, not selectors: a Markdown `*_test.md` file with a title, numbered or bulleted steps, optional `@import` composition, and `{{variables}}` whose values are masked in logs. Here is a small login smoke test.

```markdown
# Login smoke test

1. Go to https://staging.example.com/login
2. Sign in as {{TEST_USER}} with password {{TEST_PASSWORD}}
3. Confirm the dashboard shows a welcome banner with the user's name
```

You run it headless and in agent mode so CI gets both an exit code and the NDJSON stream:

```bash
browserbash testmd run ./login_test.md \
  --agent \
  --headless \
  --timeout 180 \
  --record \
  > run.ndjson
echo "exit code: $?"
```

The agent finds elements through the accessibility tree (roles, accessible names, states) and the DOM, not CSS classes, and it relies on Playwright's built-in auto-wait (a 15 second ceiling, no manual sleeps) for elements that render late. After the run you have three things on disk: `run.ndjson` (the structured stream), `Result.md` (the human summary), and a recording from `--record`. Those are the raw materials for the payload.

## The reusable shell snippet

Here is the glue: capture the exit code immediately, map it to a status, read the summary, build JSON, and `POST`. This is plain `bash` and `curl`, nothing exotic. It uses `jq` to build well-formed JSON so you never hand-concatenate strings into a payload (that path leads to broken JSON the first time a summary contains a quote).

```bash
#!/usr/bin/env bash
set -uo pipefail

WEBHOOK_URL="${WEBHOOK_URL:?set WEBHOOK_URL}"
TEST_FILE="./login_test.md"

# 1. Run the test. Do NOT let a non-zero exit abort the script,
#    because we need that exit code to build the payload.
browserbash testmd run "$TEST_FILE" \
  --agent --headless --timeout 180 --record \
  > run.ndjson
EXIT_CODE=$?

# 2. Map the exit code to a human status.
case "$EXIT_CODE" in
  0) STATUS="passed"  ;;
  1) STATUS="failed"  ;;
  2) STATUS="error"   ;;
  3) STATUS="timeout" ;;
  *) STATUS="unknown" ;;
esac

# 3. Pull a summary. Prefer Result.md; fall back to a stub.
if [ -f Result.md ]; then
  SUMMARY="$(cat Result.md)"
else
  SUMMARY="No Result.md was written for this run."
fi

# 4. Build the payload with jq so quotes and newlines are escaped.
PAYLOAD="$(jq -n \
  --arg status "$STATUS" \
  --argjson exit_code "$EXIT_CODE" \
  --arg test_file "$TEST_FILE" \
  --arg summary "$SUMMARY" \
  --arg repo "${GITHUB_REPOSITORY:-local}" \
  --arg branch "${GITHUB_REF_NAME:-local}" \
  --arg commit "${GITHUB_SHA:-local}" \
  --arg ci_url "${CI_RUN_URL:-}" \
  --arg env "${DEPLOY_ENV:-staging}" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    event: "browser_test_completed",
    status: $status,
    exit_code: $exit_code,
    test_file: $test_file,
    summary: $summary,
    metadata: {
      repo: $repo, branch: $branch, commit: $commit,
      ci_run_url: $ci_url, environment: $env, timestamp: $ts
    }
  }')"

# 5. POST it. Fail loudly if the webhook itself rejects the call.
curl -sS -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --fail-with-body

# 6. Propagate the original verdict so CI still goes red on failure.
exit "$EXIT_CODE"
```

Three details earn their keep. First, `EXIT_CODE=$?` runs on the very next line after the test, before anything else can clobber `$?`. Second, the final `exit "$EXIT_CODE"` re-raises the verdict so the webhook never swallows a real failure (the gate and the notification are independent concerns). Third, `--fail-with-body` makes `curl` return non-zero if the webhook endpoint rejects the payload, so a broken integration does not silently look like success.

## Wiring it into GitHub Actions

The same snippet drops into a CI step almost unchanged. The job sets the environment variables the payload reads, runs the test, and always fires the webhook even when the test step fails.

```yaml
name: browser-smoke
on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  smoke:
    runs-on: ubuntu-latest
    env:
      DEPLOY_ENV: staging
      CI_RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      TEST_USER: ${{ secrets.TEST_USER }}
      TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
      WEBHOOK_URL: ${{ secrets.WEBHOOK_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli
      - run: npx playwright install --with-deps chromium

      - name: Run browser smoke test
        id: smoke
        run: ./scripts/run-and-notify.sh
        continue-on-error: true

      - name: Upload recording artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: browser-recording
          path: |
            *.webm
            Result.md

      - name: Fail the job if the test failed
        if: steps.smoke.outcome == 'failure'
        run: exit 1
```

`continue-on-error: true` on the test step lets the workflow reach the artifact upload and the explicit fail step even when the browser test exits non-zero, so you keep the recording and still turn the build red. The webhook itself fires from inside `run-and-notify.sh` regardless of verdict, because notifying on a pass is often as useful as notifying on a fail (a green nightly smoke is a real signal). For a fuller end-to-end pipeline, see the [BrowserBash GitHub Actions tutorial](https://browserbash.com/blog/browserbash-github-actions-tutorial).

### Notify only on failure

If you only want noise when something breaks, gate the `curl` on the exit code instead of always firing:

```bash
if [ "$EXIT_CODE" -ne 0 ]; then
  curl -sS -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" --fail-with-body
fi
```

### Adapting the payload for Slack or Discord

A "generic webhook" usually means a chat app's incoming webhook, and those expect their own shape. The fix is one `jq` template, not a rewrite. For Slack:

```bash
SLACK_PAYLOAD="$(jq -n \
  --arg text ":test_tube: Browser test *$STATUS* (exit $EXIT_CODE) on $DEPLOY_ENV" \
  '{ text: $text }')"
curl -sS -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" -d "$SLACK_PAYLOAD"
```

Keep your canonical envelope for internal consumers and add a thin per-destination template on top. BrowserBash supplies the same `status` and `exit_code` no matter where you send them, so only the wrapper changes.

## Enriching the payload from NDJSON

When a `failed` notification arrives, the first question is "which step broke?" Pull that from `run.ndjson` instead of from the prose summary. The exact event keys are documented in the [NDJSON agent mode tutorial](https://browserbash.com/blog/ndjson-agent-mode-tutorial); the pattern is to filter the stream for the last step event and fold a couple of fields into the payload:

```bash
LAST_STEP="$(tail -n 50 run.ndjson \
  | jq -rs 'map(select(.type == "step")) | last | .description // "n/a"')"
```

Then add `--arg last_step "$LAST_STEP"` to the `jq -n` call and reference `$last_step` in the object. Now the Slack message can say "failed at: confirm the welcome banner is visible" rather than just "failed," which is the difference between an alert someone acts on and one they mute.

## Honest limits

This integration is glue, and glue has sharp edges worth naming.

**BrowserBash does not deliver the webhook for you.** There is no `--webhook` flag, no built-in Slack or Jira posting, no retry queue. If your CI runner has no network egress to the webhook host, the `curl` fails and you get nothing. The signal is solid; the transport is your responsibility, and it inherits all the usual reliability questions (timeouts, retries, dead-letter handling) that any webhook sender faces. For anything beyond fire-and-forget, put a real queue between CI and the destination rather than trusting a single `curl`.

**`Result.md` is written for humans, and its exact wording is model-authored.** It is an excellent summary to drop into a message, but do not parse it with a regex expecting stable phrasing. If you need structured fields, take them from the NDJSON, which is designed for machines. Treat `Result.md` as the body text and the NDJSON as the data.

**A `2` (error) can masquerade as a real failure if you collapse statuses.** If your payload only knows "passed" and "failed," an environment hiccup pages someone at 3 a.m. for a problem that a retry would have cleared. Keep the four statuses distinct, and consider retrying `2` and `3` once before you notify, as shown in the exit codes tutorial.

**Flaky verdicts come from flaky models, not flaky selectors.** BrowserBash re-derives what to click from the live page on every action; it does not keep a cached selector script across runs. That live re-derivation is robust to UI churn, but it does put a language model in the loop. Small local models (8B and under) get unreliable on long, multi-step flows, which means more `1` and `2` verdicts that are about the model, not the app. For hard flows, point the default `auto` model resolution at a 70B-class local model (Qwen3, Llama 3.3) or a hosted model. Running locally keeps everything on your machine, which matters when the test handles real credentials. The [Learn hub](https://browserbash.com/learn) covers model selection in depth.

**Secrets in the payload are on you.** `{{variables}}` are masked in BrowserBash's own logs, but the moment you build a payload and `curl` it, you control what goes in. Never put a password or token into the `summary` or any metadata field, and review your `jq` template so it cannot accidentally interpolate a secret env var.

## FAQ

### Does BrowserBash send webhooks natively?

No. BrowserBash produces the result signal (an exit code, a `Result.md` summary, and NDJSON when you pass `--agent`) and stops there. There is no `--webhook` flag and no built-in Slack, Discord, Teams, or Jira posting. You build the JSON payload from those signals and `POST` it yourself with `curl` from your CI step. That is by design: keeping delivery out of the tool means you can target any destination with the same few lines of glue.

### How do I send different messages for a pass versus a fail?

Branch on the exit code. Map `0/1/2/3` to a `status` string in a `case` statement, then either gate the `curl` (only fire when `EXIT_CODE -ne 0`) or always fire with the status baked into the payload so the receiving service can render a green or red message. The four-code contract is stable, so this branching never breaks as long as you read `$?` immediately after the run.

### Can I include the screenshot or video recording in the webhook?

Not inline, because a JSON webhook is not a place to embed binary media. The pattern is to run with `--record`, upload the resulting webm and screenshots as a CI artifact (or to object storage), and put the artifact URL into the `artifacts.recording_url` field of your payload. The notification then links to the evidence rather than carrying it.

### What goes in the payload, BrowserBash data or my own?

Both, and the split is clean. The verdict fields (`status`, `exit_code`) and the `summary` come from BrowserBash. The context fields (repo, branch, commit, environment, CI run URL, timestamp) are yours, because BrowserBash has no reason to know your CI topology. Assemble the two in your shell step; the snippet above shows exactly which fields come from where.

## Wrapping up

Webhook notifications from browser tests are not a feature you flip on; they are a small, durable piece of glue you own. BrowserBash gives you a clean verdict (the exit code), a readable summary (`Result.md`), and a structured stream (`--agent` NDJSON). You map the exit code to a status, fold in your own CI metadata, build well-formed JSON with `jq`, and `POST` it. The whole thing is a couple dozen lines of `bash`, it works against any webhook destination, and it keeps the gate and the notification as separate concerns so a delivery failure never hides a real test failure. Install with `npm install -g browserbash-cli`, write one `*_test.md`, and wire the snippet above into your next pipeline run.
