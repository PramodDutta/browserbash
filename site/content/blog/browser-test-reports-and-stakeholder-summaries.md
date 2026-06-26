---
title: From Result.md to Slack and Jira: Reporting AI Test Results
description: "AI test reporting with BrowserBash: route browser test reports to Slack and Jira using Result.md, NDJSON, and recordings driven by CI exit codes."
date: 2026-06-26
category: ci
---

BrowserBash gives you three reporting surfaces out of every run, and your job is to wire each one to wherever your team actually looks. The three surfaces are a human-readable `Result.md` written after each run, machine-readable NDJSON streamed via `--agent`, and recordings plus screenshots captured via `--record`. From those three artifacts you can drive a CI job summary, a Slack message, a Jira ticket, and an HTML or email report for non-technical reviewers. The exit code is the contract your automation gates on, and the human artifacts are for people. That is the whole model, and the rest of this post shows how to connect each surface.

If you are new to the tool, install it with `npm install -g browserbash-cli`. It is open source under Apache-2.0, so you can read exactly how every artifact is produced before you build glue on top of it.

## The three reporting surfaces, and who each one is for

Most test runners hand you one output and force everyone to read it the same way. BrowserBash splits the output by audience so you do not have to translate.

### Result.md is for humans

After every run, BrowserBash writes a `Result.md` file: a plain Markdown summary of what was attempted, what passed, what failed, and where the artifacts landed. A QA lead can read it in a pull request. A manager can read it in a Slack thread. Nobody needs to open a trace viewer or parse JSON to understand whether the checkout flow worked.

This matters more than it sounds. The most common reporting failure on a QA team is not missing data, it is data that only one person on the team can read. `Result.md` is deliberately the layer everyone can read.

### NDJSON via `--agent` is for machines

When you pass `--agent`, BrowserBash emits newline-delimited JSON: one JSON object per line, streamed as the run progresses. This is the surface your CI scripts, dashboards, and bots consume. Because each line is a complete JSON object, you can pipe the stream into `jq`, tail it, or forward it to a log aggregator without waiting for the run to finish. The full structure is covered in the [NDJSON agent mode tutorial](/blog/ndjson-agent-mode-tutorial).

### Recordings via `--record` are proof

Pass `--record` and BrowserBash captures a `webm` video of the browser session plus screenshots. This is the artifact you attach when someone asks "are you sure it actually failed there?" A video is evidence a non-technical reviewer can watch without any tooling. The full walkthrough of recordings and traces lives in the [recording video and traces tutorial](/blog/browserbash-recording-video-and-traces-tutorial).

Put those three together and you have a reporting stack where the same run feeds the gate, the bot, and the human, with no extra test code.

## The exit code is the contract

Before you route anything, internalize this: your automation should gate on the exit code, not on scraping text out of a log. BrowserBash uses a small, stable set of codes:

- `0` is a pass. Everything the run was asked to verify held.
- `1` is a fail. The run completed but at least one assertion did not hold.
- `2` is an error. Something broke before the run could reach a verdict, for example a bad selector or a malformed instruction.
- `3` is a timeout. The run exceeded its time budget.

The distinction between `1`, `2`, and `3` is the part teams usually get wrong. A failing assertion is a product signal that belongs in front of a developer. An error or a timeout is usually an infrastructure or flakiness signal that belongs in front of whoever owns the pipeline. Routing all three to the same channel trains everyone to ignore the channel. The full breakdown of how to branch on each code is in the [exit codes in CI tutorial](/blog/browserbash-exit-codes-ci-tutorial).

In a shell script, the code lands in `$?` immediately after the command. Capture it once and branch on it:

```bash
browserbash run "log in, add a laptop to the cart, and verify the cart total" \
  --record \
  --agent > run.ndjson
STATUS=$?
echo "BrowserBash exited with $STATUS"
```

Everything downstream, Slack, Jira, the job summary, keys off `$STATUS`. The artifacts (`Result.md`, `run.ndjson`, the recording) are what you attach for the humans, but the branch logic reads the integer.

## Surface 1: the CI job summary

The cheapest win is to surface the verdict and `Result.md` directly in your pipeline UI, so the first place a developer looks already tells the story.

On GitHub Actions, you write to the `$GITHUB_STEP_SUMMARY` file and it renders as Markdown on the run page. Since `Result.md` is already Markdown, this is close to a one-liner:

```yaml
- name: Run BrowserBash
  id: bb
  run: |
    browserbash run "log in and verify the dashboard loads" --record --agent > run.ndjson
  continue-on-error: true

- name: Publish summary
  if: always()
  run: |
    echo "## BrowserBash result" >> "$GITHUB_STEP_SUMMARY"
    echo "Exit code: ${{ steps.bb.outcome }}" >> "$GITHUB_STEP_SUMMARY"
    cat Result.md >> "$GITHUB_STEP_SUMMARY"
```

The `continue-on-error: true` is deliberate: you want the summary and notification steps to run even when the test fails, then fail the job explicitly at the end based on the exit code. A complete workflow, including artifact upload and how to fail the job correctly, is in the [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial).

Upload the recording and `Result.md` as build artifacts in the same job so anyone reading the summary can download the proof in two clicks.

## Surface 2: Slack via an incoming webhook

Slack is where most QA teams actually live, so this is the integration that earns its keep. The pattern is simple: after the run, read `$STATUS`, build a message, and POST it to a Slack incoming webhook with `curl`.

First, create an incoming webhook in your Slack workspace and store the URL as a secret named `SLACK_WEBHOOK_URL` in your CI provider. Never hardcode it. Then drive the message off the exit code:

```bash
#!/usr/bin/env bash
set -uo pipefail

browserbash run "complete checkout with a test card and verify the receipt" \
  --record \
  --agent > run.ndjson
STATUS=$?

case "$STATUS" in
  0)
    EMOJI=":white_check_mark:"
    TEXT="Checkout smoke test passed."
    ;;
  1)
    EMOJI=":x:"
    TEXT="Checkout smoke test FAILED an assertion. A developer should look."
    ;;
  2)
    EMOJI=":warning:"
    TEXT="Checkout run errored before reaching a verdict. Check the config or selectors."
    ;;
  3)
    EMOJI=":hourglass:"
    TEXT="Checkout run timed out. Likely a slow environment or a hang."
    ;;
  *)
    EMOJI=":grey_question:"
    TEXT="Checkout run returned an unexpected code: $STATUS."
    ;;
esac

# Pull the first line of Result.md as a one-line headline for the message.
HEADLINE=$(head -n 1 Result.md 2>/dev/null || echo "No Result.md produced.")

curl -sf -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  --data "$(cat <<JSON
{
  "text": "$EMOJI $TEXT",
  "blocks": [
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "$EMOJI *$TEXT*\n$HEADLINE" }
    },
    {
      "type": "context",
      "elements": [
        { "type": "mrkdwn", "text": "Exit code: \`$STATUS\`  |  Build: ${CI_BUILD_URL:-local run}" }
      ]
    }
  ]
}
JSON
)"

# Re-assert the original status so the CI job still reflects the test outcome.
exit "$STATUS"
```

A few things worth calling out in that snippet. The message text changes with the exit code, so a reader knows at a glance whether this is a product bug, a broken pipeline, or a timeout, without opening anything. The headline pulled from `Result.md` gives one line of human context. The final `exit "$STATUS"` re-asserts the verdict so the notification step never accidentally turns a red run green.

If you want richer messages, parse `run.ndjson` instead of `Result.md`. For example, to count how many steps were attempted:

```bash
STEPS=$(jq -c 'select(.type == "step")' run.ndjson | wc -l | tr -d ' ')
```

Then fold `$STEPS` into the Slack `context` block. The NDJSON stream is the right surface when you want structured numbers in the message rather than a prose headline, and the [agent mode tutorial](/blog/ndjson-agent-mode-tutorial) lists the event types you can filter on.

## Surface 3: Jira on failure

Slack is for awareness. Jira is for accountability. The rule of thumb: notify Slack on every run, but only touch Jira when there is something a human must act on, which usually means exit code `1`.

The mechanism is the Jira REST API. On failure, you either create a new issue or, better, comment on an existing tracking issue so you do not spawn a hundred duplicate tickets from a flaky nightly job. You attach the `Result.md` summary and a link to the recording so the assignee has the evidence in hand.

Here is the create-on-failure shape. It runs only when `$STATUS` is `1`:

```bash
if [ "$STATUS" -eq 1 ]; then
  SUMMARY=$(cat Result.md)

  # Create an issue. JIRA_BASE, JIRA_USER, and JIRA_TOKEN come from CI secrets.
  ISSUE_KEY=$(curl -sf -X POST "$JIRA_BASE/rest/api/3/issue" \
    -u "$JIRA_USER:$JIRA_TOKEN" \
    -H 'Content-Type: application/json' \
    --data "$(cat <<JSON
{
  "fields": {
    "project": { "key": "QA" },
    "issuetype": { "name": "Bug" },
    "summary": "Checkout smoke test failed in CI",
    "description": "Automated failure from BrowserBash. See attached summary and recording.\n\nBuild: ${CI_BUILD_URL:-unknown}"
  }
}
JSON
)" | jq -r '.key')

  echo "Opened $ISSUE_KEY"

  # Attach the Result.md and the recording as evidence.
  curl -sf -X POST "$JIRA_BASE/rest/api/3/issue/$ISSUE_KEY/attachments" \
    -u "$JIRA_USER:$JIRA_TOKEN" \
    -H 'X-Atlassian-Token: no-check' \
    -F "file=@Result.md" \
    -F "file=@$(ls recordings/*.webm | head -n 1)"
fi
```

The `X-Atlassian-Token: no-check` header is required by Jira for the attachments endpoint. The recording path assumes `--record` wrote a `webm` into a `recordings/` folder; adjust the glob to match where your run puts it.

If you would rather comment on a standing "Nightly checkout health" ticket than open new bugs, swap the create call for a comment call against a known issue key:

```bash
curl -sf -X POST "$JIRA_BASE/rest/api/3/issue/QA-1234/comment" \
  -u "$JIRA_USER:$JIRA_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "$(cat <<JSON
{ "body": { "type": "doc", "version": 1, "content": [
  { "type": "paragraph", "content": [
    { "type": "text", "text": "BrowserBash checkout test failed. Build: ${CI_BUILD_URL:-unknown}" }
  ]}
]}}
JSON
)"
```

Commenting keeps the noise down and the history in one place, which the people triaging your board will thank you for.

## Surface 4: HTML or email for non-technical reviewers

Sometimes the audience is a product manager or a client who will never open your CI tool. For them, assemble the artifacts into a single self-contained report: the `Result.md` rendered to HTML, the screenshots inlined, and a link to the `webm` video.

You do not need a framework for this. A small build step that renders `Result.md` to HTML and drops the screenshots underneath produces a page anyone can open in a browser or receive as an email body:

```bash
{
  echo "<html><body>"
  # Convert Result.md to HTML with any markdown CLI you already have.
  markdown Result.md
  echo "<h2>Screenshots</h2>"
  for img in screenshots/*.png; do
    echo "<img src=\"$img\" style=\"max-width:800px;display:block;margin:1em 0\">"
  done
  echo "<p>Full video: <a href=\"$RECORDING_URL\">watch the run</a></p>"
  echo "</body></html>"
} > report.html
```

For a stakeholder, `Result.md` plus a video recording is the whole report. It says what was tested, whether it passed, and shows the browser doing it. That is something a non-technical manager can read and trust without ever learning what a trace viewer is. The trace is there for your engineers when they need to debug; the video and the Markdown are there for everyone else.

## A note on the optional dashboard

If you want a hosted place to browse runs without building HTML reports yourself, BrowserBash has an opt-in cloud dashboard. You enable it by running `browserbash connect` to link your machine, then add `--upload` to a run to push that run's artifacts to the dashboard. It is opt-in by design: nothing leaves your machine unless you pass `--upload`. If you want the same browsing experience locally without uploading anything, run `browserbash dashboard` to view runs on your own box.

The dashboard is a convenience layer over the same artifacts, not a replacement for the routing above. Your CI gate still reads the exit code, and your Slack and Jira glue still runs in the pipeline.

## Honest limits

Here is what BrowserBash does and does not give you, stated plainly so you can plan the work.

BrowserBash produces the artifacts and the exit codes. It writes `Result.md`, it streams NDJSON with `--agent`, it records `webm` and screenshots with `--record`, and it returns a stable exit code your gate can trust. That is the foundation, and it is solid.

What it does not do is ship the integrations. There is no built-in Jira app, no native Slack integration, and no hosted report portal beyond the optional run dashboard described above. The Slack webhook step, the Jira REST calls, and the HTML report builder in this post are glue you write and maintain yourself. The snippets here are a starting point, not a product feature. If your team needs a polished, no-code Jira integration with bidirectional sync, BrowserBash is not that, and pretending otherwise would waste your time.

The upside of this trade is that the glue is small, it is shell and `curl`, and because the tool is Apache-2.0 you can read exactly how every artifact is generated. You are wiring well-defined outputs to well-documented APIs, which is far more durable than depending on a closed integration that can change under you.

## FAQ

### Should my CI gate read Result.md or the exit code?

The exit code, always. `Result.md` is for humans and its prose can change; the exit code is the stable contract. Gate your pipeline on `0` versus non-zero, branch your notifications on the specific code, and use `Result.md` only as the human-readable payload you attach to messages. Treating the Markdown as a parseable gate is the most common way teams build a brittle pipeline.

### How do I tell a real product failure apart from flakiness in my alerts?

Branch on the exit code. A `1` means an assertion failed, which is a product signal worth a Jira ticket and a developer's attention. A `2` (error) or `3` (timeout) usually points at infrastructure, a bad selector, or a slow environment, which is a pipeline-owner signal. Route product failures and infrastructure failures to different channels or different severities so neither group learns to tune out the other.

### Can a non-technical manager understand the output without special tooling?

Yes, and that is the point of having `Result.md` and `--record` as separate surfaces. The manager reads the Markdown summary and watches the `webm` video, both of which open in any browser. The trace and NDJSON exist for engineers who need to debug, but no stakeholder has to touch them. A summary plus a video is proof that needs no trace viewer.

### Do I need the cloud dashboard to report results?

No. The dashboard is entirely optional and opt-in. You can build every integration in this post, CI summary, Slack, Jira, and email, using only the local artifacts (`Result.md`, the NDJSON stream, the recordings) and your CI provider's secrets. The dashboard via `browserbash connect` and `--upload`, or the local `browserbash dashboard`, is a convenience for browsing runs, not a requirement for reporting.

## Where to go next

Pick the surface your team feels the most pain about today and wire just that one. If developers are missing failures, start with the CI job summary and the [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial). If QA is the bottleneck, start with the Slack webhook above. If bugs are getting lost, wire the Jira-on-failure step. Then layer in the others as you go.

To go deeper on the underlying surfaces, read the [recording video and traces tutorial](/blog/browserbash-recording-video-and-traces-tutorial), the [NDJSON agent mode tutorial](/blog/ndjson-agent-mode-tutorial), and the [exit codes in CI tutorial](/blog/browserbash-exit-codes-ci-tutorial). You can see the full set of run artifacts and flags on the [features page](/features), and find more guides in the [learn section](/learn).
