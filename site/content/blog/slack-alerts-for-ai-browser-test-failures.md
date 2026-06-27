---
title: Send Slack Alerts for AI Browser Test Failures in CI
description: "Slack test failure alerts from BrowserBash CI: parse the NDJSON --agent stream and exit codes, then post the Result.md summary and run link to a channel."
date: 2026-06-27
category: ci
---

To send **Slack test failure alerts** for AI browser tests, run BrowserBash with `--agent` so it emits NDJSON, read the process exit code (`0` pass, `1` fail, `2` error, `3` timeout), and when the code is non-zero, POST a message to a Slack Incoming Webhook with the one-line `Result.md` headline and a link back to the CI run. The exit code decides whether to alert at all; the NDJSON and `Result.md` fill in the detail a human needs to act. That is the entire pattern, and the rest of this post is the concrete wiring: the run command, the parse step, the webhook call, and the failure modes nobody mentions until they bite you.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You describe a flow in plain English, an AI agent drives a real Chrome browser through it, and you get back a verdict that is the process exit code, with structured detail as NDJSON. Because the verdict is a number and not a line of prose you have to grep, gating a Slack alert on it is reliable in a way that log-scraping never is.

## Why post failures to Slack at all

A red build on a dashboard nobody watches is a tree falling in an empty forest. A Slack alert moves a failure from a place people check when they remember to a place people already live. For a post-deploy smoke check or a nightly browser suite, the difference between "we caught checkout breaking at 9am" and "a customer told support at 2pm" is usually whether the failure landed in a channel.

Two rules keep the alert useful instead of noise. First, alert only on real failures, not on every run, or the channel gets muted within a week. Second, put enough in the message that a reader can decide whether to act without opening anything: the verdict, one line of human context, and a link to the full run. Everything below is built around those two rules.

## The contract: exit codes and NDJSON

Everything keys off two outputs from a single run. The exit code is the gate. The NDJSON is the detail.

The four exit codes are a fixed contract:

| Code | Meaning | What it tells your alert logic |
| --- | --- | --- |
| `0` | passed | Stay quiet. The flow worked. |
| `1` | failed | A real content failure. This is the one you alert on loudest. |
| `2` | error | Something broke before a verdict (bad config, crash, browser launch). Alert, but as an infra problem. |
| `3` | timeout | The run outlived its `--timeout` budget. Alert, but treat it as a budget or environment signal. |

The reason this matters: a `1` is a product bug and a `2` or `3` is usually a pipeline or environment problem, and you want the Slack message to say which so the right person picks it up. If you collapse them all into "tests failed," you train people to ignore the channel. There is a deeper write-up of each code in the [exit codes tutorial](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial), and the case for gating on the integer instead of parsing prose is made in full in [why CI should not parse log output](https://browserbash.com/blog/ci-exit-codes-no-parsing).

The `--agent` flag turns on the machine-readable stream. It emits one JSON object per line to **stdout**, while the human-readable narration goes to **stderr**. That split is what lets you redirect a clean NDJSON file without polluting it with prose:

```bash
browserbash testmd run ./checkout_test.md \
  --agent \
  --headless \
  --timeout 180 > run.ndjson
echo "exit code: $?"
```

The last line of `run.ndjson` is the one your alert cares about most. It looks like this:

```json
{"type":"run_end","status":"passed","summary":"Checkout flow verified","final_state":{"order_id":"A-12345"},"duration_ms":48211}
```

The `status` field mirrors the exit code exactly: `passed` is `0`, `failed` is `1`, `error` is `2`, `timeout` is `3`. So you have the verdict in two places that always agree, which is handy when you want both a clean gate (the exit code) and a human sentence (`summary`) in the same message.

Alongside the NDJSON, every run writes a `Result.md`: a plain Markdown summary of what was attempted, what passed, what failed, and where the artifacts landed. That file is for people. Its first line makes a fine one-line headline for a Slack message.

## A test worth alerting on

A good alert starts with a test that produces a clean pass or fail. BrowserBash tests are intent, not selectors: a Markdown `*_test.md` file with a title, numbered steps, optional `{{variables}}` (masked in logs), and `@import` to compose shared flows. Here is a checkout smoke test that reuses a login flow:

```markdown
# Checkout smoke test

@import ./login_test.md

1. Click "Add to cart" on the first product
2. Open the cart
3. Click "Checkout"
4. Confirm the page heading reads "Order confirmation"
5. Store the order number as "order_id"
```

The `@import ./login_test.md` pulls in the login steps so you maintain that flow in one place. The agent finds each element through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, and it handles iframes and Shadow DOM. Late-rendering elements are covered by Playwright's built-in auto-wait, with a 15-second ceiling, so you never add manual sleeps. BrowserBash re-derives the right element from the live page on every action rather than replaying a cached selector script, so a renamed button or a moved field usually still resolves.

Phrase the success condition as something the agent can confirm or deny ("confirm the heading reads 'Order confirmation'"), not open-ended browsing. A verifiable objective turns a fuzzy task into a clean `0` versus `1`, which is exactly what your alert logic needs.

## Wiring the Slack webhook

Slack's Incoming Webhooks are the simplest delivery path: create one in a Slack app, point it at a channel, and you get a URL that accepts a JSON `POST`. Store that URL as a secret in your CI provider (`SLACK_WEBHOOK_URL`) and never hardcode it.

Here is a self-contained shell step that runs the test, branches on the exit code, and only alerts when there is something to say:

```bash
#!/usr/bin/env bash
set -uo pipefail

# Run the test. Do NOT let a non-zero exit kill the script here;
# we want to inspect the code and alert first, then fail at the end.
browserbash testmd run ./checkout_test.md \
  --agent --headless --timeout 180 \
  --record > run.ndjson
STATUS=$?

# Pull a human headline from Result.md (first line), with a fallback.
HEADLINE=$(head -n 1 Result.md 2>/dev/null || echo "No Result.md produced")

# Map the exit code to a message. Stay silent on success.
case "$STATUS" in
  0)
    echo "Passed. No alert sent."
    ;;
  1)
    TEXT=":x: *Browser test FAILED* (product bug)\n${HEADLINE}\nRun: ${CI_RUN_URL}"
    ;;
  2)
    TEXT=":warning: *Browser test ERROR* (pipeline/infra)\n${HEADLINE}\nRun: ${CI_RUN_URL}"
    ;;
  3)
    TEXT=":hourglass: *Browser test TIMED OUT*\n${HEADLINE}\nRun: ${CI_RUN_URL}"
    ;;
esac

# Post to Slack only when TEXT is set (i.e. STATUS was non-zero).
if [ -n "${TEXT:-}" ]; then
  curl -sS -X POST -H 'Content-type: application/json' \
    --data "$(printf '{"text":"%s"}' "$TEXT")" \
    "$SLACK_WEBHOOK_URL"
fi

# Re-assert the verdict so CI inherits the correct color.
exit "$STATUS"
```

A few things in that snippet are doing real work. The message text changes with the exit code, so a reader knows at a glance whether this is a product bug, a broken pipeline, or a timeout. The headline pulled from `Result.md` gives one line of human context. The `CI_RUN_URL` makes the message a jumping-off point, not a dead end. And the final `exit "$STATUS"` re-asserts the verdict so the alert step never accidentally turns a red run green by swallowing the exit code.

### Richer messages from the NDJSON

If a one-line headline is not enough, parse `run.ndjson` instead of `Result.md`. The `summary` and `duration_ms` fields on `run_end` are usually what a reader wants, and `final_state` carries whatever your steps stored:

```bash
SUMMARY=$(tail -n 1 run.ndjson | jq -r '.summary // "no summary"')
DURATION=$(tail -n 1 run.ndjson | jq -r '.duration_ms // 0')
ORDER=$(tail -n 1 run.ndjson  | jq -r '.final_state.order_id // "n/a"')

TEXT=":x: *Checkout test failed*\n${SUMMARY}\nDuration: ${DURATION}ms  Order: ${ORDER}\nRun: ${CI_RUN_URL}"
```

You can count attempted steps by filtering the stream, or surface the last failing step's `remark` so the message names the exact action that went wrong. The NDJSON makes that a `jq` one-liner instead of a regex against prose.

### Attaching the recording

The `--record` flag in the run above captures a webm video plus screenshots. Upload those as CI artifacts in the same job, then put the artifact URL in the Slack message so the assignee can watch what the agent did in two clicks. A failure with a video attached gets triaged; a failure that is just a red X gets ignored. Routing the same artifacts to other surfaces (a CI job summary, a Jira ticket, an email digest) is covered in [reporting AI test results to Slack and Jira](https://browserbash.com/blog/browser-test-reports-and-stakeholder-summaries).

## Dropping it into GitHub Actions

The shell logic is portable, but here is the shape inside a GitHub Actions workflow. The key trick is `continue-on-error` on the test step so the notify step still runs on failure, then an explicit fail at the end:

```yaml
- name: Run browser smoke test
  id: smoke
  continue-on-error: true
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    browserbash testmd run ./checkout_test.md \
      --agent --headless --timeout 180 --record > run.ndjson
    echo "status=$?" >> "$GITHUB_OUTPUT"

- name: Notify Slack on failure
  if: steps.smoke.outputs.status != '0'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
    CI_RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
  run: |
    HEADLINE=$(head -n 1 Result.md 2>/dev/null || echo "No Result.md")
    curl -sS -X POST -H 'Content-type: application/json' \
      --data "$(printf '{"text":":x: Browser test failed (code %s)\n%s\nRun: %s"}' \
        "${{ steps.smoke.outputs.status }}" "$HEADLINE" "$CI_RUN_URL")" \
      "$SLACK_WEBHOOK_URL"

- name: Fail the job if the test did not pass
  if: steps.smoke.outputs.status != '0'
  run: exit 1
```

The `if: steps.smoke.outputs.status != '0'` is your gate: Slack is touched only when the verdict is non-zero, and the job still goes red because of the final explicit `exit 1`. A complete end-to-end workflow, including artifact upload, lives in the [GitHub Actions guide](https://browserbash.com/blog/browser-automation-github-actions-ci). The same `status` output drives both the alert and the job color, so they can never disagree.

## Model and provider choices that affect alert quality

A flaky test produces a flaky alert, and the model behind the agent is part of that equation. The default model resolution is `auto`: Ollama first (fully local, nothing leaves the machine), then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (which has free models available). For a CI check that feeds a Slack channel, the model choice is a reliability decision, not just a cost one.

Small local models (8B parameters or under) are fine for short, unambiguous flows but get flaky on long multi-step journeys, and a model that drifts produces a `1` for the wrong reason: a false alarm in Slack. For harder flows, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model is the safer pick. Local keeps everything on the runner and free; hosted is a per-token cost but removes the need to provision a GPU on your CI agent. The [learn section](https://browserbash.com/learn) goes deeper on matching model size to flow complexity, and the [features page](https://browserbash.com/features) lays out the provider matrix.

The provider does not change the alert wiring at all. The default `--provider local` uses Chrome on the CI agent; headless container runners can point at a DevTools endpoint with `--provider cdp` or a hosted grid (`browserbase`, `lambdatest`, `browserstack`). The exit code and NDJSON are identical wherever the browser lives. If you opt in with `--upload`, the run also lands on the cloud dashboard (free runs kept 15 days), giving you a hosted link to drop into the Slack message alongside the CI run URL. A local dashboard is available via `browserbash dashboard` with no upload.

## Honest limits

This pattern is reliable, but it is not magic, and pretending otherwise sets you up for a Slack channel people stop trusting. The real edges:

**A stochastic agent can produce a false `1`.** The agent decides its next action from what is rendered right then, so the same objective can take a slightly different path run to run. That resilience is the point, but an occasional run fails for an ambiguous reason rather than a genuine bug, and that becomes a Slack alert. Mitigation: keep objectives narrow and verifiable, pin test data to known synthetic accounts and products, and do not retry `0` or `1` (retrying a `1` papers over real bugs). Auto-retrying a `2` or `3` once before alerting is reasonable, since those are usually environment noise.

**Slack rate limits and noise.** A nightly suite that fails the same way for a week will post the same alert seven times, and the channel will mute you. If you run a suite, batch failures into one message rather than firing per-test, and consider posting to a thread or de-duplicating on the failure signature. BrowserBash gives you the exit code and `Result.md` per run; the de-duplication logic is yours to add.

**The headline is only as good as your objective.** If your objective was vague, the `Result.md` and NDJSON `summary` will be vague too, and the Slack message will not tell anyone much. The fix is upstream: write objectives as assertions with a named success condition.

**It does not replace deep debugging.** A Slack alert tells a human a flow broke and links them to the evidence. It does not tell them why the application is wrong. The `--record` video and the NDJSON step trail turn the alert into a diagnosis, so always attach them. The alert is the doorbell, not the investigation.

**Secrets discipline still applies.** The `{{variables}}` masking keeps credentials out of run logs, but a careless message that echoes a `final_state` value containing PII will leak it into a channel. Decide deliberately which fields are safe to put in a message.

## FAQ

### How do I only alert on failures and not on every passing run?

Gate the Slack call on the exit code. After the run, read `$?` (or the step output in CI), and only build and send the webhook payload when the code is non-zero. In the shell example above, the `TEXT` variable is left unset on a `0`, and the `curl` is guarded by `if [ -n "${TEXT:-}" ]`, so a passing run sends nothing. In GitHub Actions, the equivalent is `if: steps.smoke.outputs.status != '0'` on the notify step. The exit code is the single source of truth for whether to alert.

### Can I tell a product bug apart from a broken pipeline in the alert?

Yes, and you should. Exit code `1` is a content failure: the agent worked and the answer was "no," which usually means a real product bug. Codes `2` (error) and `3` (timeout) are pipeline or environment problems, not product verdicts. Branch your Slack message on the code so it reads ":x: test failed (product bug)" for a `1` versus ":warning: pipeline error" for a `2`. That one distinction routes the alert to the right person and stops developers from chasing infrastructure flakes as if they were bugs.

### Do I need the cloud dashboard to send Slack alerts?

No. The whole pattern runs on the exit code, the local `Result.md`, and the NDJSON from `--agent`, none of which require an account or upload. Everything stays on your CI agent. The optional `--upload` flag adds a hosted run link (kept 15 days on the free tier) that you can drop into the Slack message for convenience, and `browserbash dashboard` gives you a local dashboard. But the alert itself works fully offline with no cloud dependency.

### How do I include a link back to the run in the Slack message?

Use your CI provider's run URL. In GitHub Actions, that is `${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`, which you pass into the message as an environment variable. If you used `--upload`, you can also include the hosted run link. Either way, put the URL on its own line in the message text so Slack renders it as a clickable jump to the full run, the artifacts, and the recording.

## Where this leaves you

The pattern is small on purpose: run with `--agent`, read the exit code, alert on non-zero, attach the `Result.md` headline and a run link. Because the verdict is an integer and not a line you grep, the gate is stable, and because the same `status` field appears in the NDJSON, your human-facing message and your machine gate can never drift apart. Start with one critical flow (login or checkout), wire the webhook, watch a real failure land in your channel, then expand the suite. A single trustworthy alert beats ten noisy ones, and trust in the channel is the whole asset you are building.
