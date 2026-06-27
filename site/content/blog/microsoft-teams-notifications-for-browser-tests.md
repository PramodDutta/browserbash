---
title: Microsoft Teams Notifications for AI Browser Test Runs
description: "Teams test notifications from BrowserBash CI: post an Adaptive Card built from the NDJSON stream and Result.md with pass/fail counts and artifact links."
date: 2026-06-27
category: ci
---

To post BrowserBash CI results to a Microsoft Teams channel, you point a CI step at an incoming webhook URL and send it an Adaptive Card built from two artifacts every run produces: the `run_end` object in the `--agent` NDJSON stream (for the verdict, duration, and any extracted values) and the `Result.md` file (for a human-readable headline). The exit code decides pass or fail, your script colors the card and fills in the counts, and the message lands in the channel with a button that links to the uploaded recording and logs. That is the whole pattern. Setting up **teams test notifications** for an AI browser run is the same shape as any other CI notification: read a verdict, format a payload, `curl` it to a webhook. The only BrowserBash-specific parts are which fields to read and where the artifacts live, and that is what the rest of this post covers in detail.

## The pieces you are wiring together

Three things connect to make this work, and it helps to name them before any code.

First, **BrowserBash output**. Every run writes a `Result.md` summary to disk, and when you pass `--agent` it also streams newline-delimited JSON to stdout: a sequence of `step` events followed by exactly one terminal `run_end` event. The process also sets an exit code that mirrors the verdict (`0` pass, `1` fail, `2` error, `3` timeout). You can read the verdict three ways: the exit code (fastest), the `run_end.status` field (richest), or the first line of `Result.md` (most human). A good notification uses all three, each for what it is best at.

Second, **a Microsoft Teams incoming webhook**. This is a URL Teams gives you, scoped to one channel. Anything you `POST` to it appears as a message in that channel. You do not need a bot, an app registration, or OAuth for the basic case. You create it once, store it as a CI secret, and post JSON to it.

Third, **an Adaptive Card**. Teams renders plain text, but it also renders Adaptive Cards: a JSON schema for structured message layouts with headings, fact tables, colored text, and action buttons. A card is how you get a clean pass/fail block with counts and a button to the artifacts, instead of a wall of text. You build the card JSON from the BrowserBash output and send it through the webhook.

That is the data flow: `browserbash` produces a verdict and artifacts, your CI step reads them, formats an Adaptive Card, and `curl`s it to the Teams webhook. If you have wired BrowserBash into [GitHub Actions](https://browserbash.com/blog/browser-automation-github-actions-ci) before, this is one more step at the end of the job. If you have routed results to Slack and Jira, as covered in [reporting AI test results](https://browserbash.com/blog/browser-test-reports-and-stakeholder-summaries), the Teams version is the same idea with a different payload.

## Step 1: create the Teams incoming webhook

In Teams, open the channel you want results in, go to the channel's connectors or workflows settings, and add an incoming webhook. Name it something honest like "CI Test Results," optionally give it an avatar, and Teams hands you a long URL. Treat that URL as a secret: anyone who has it can post to your channel.

Microsoft has been migrating Office 365 connector webhooks toward the Workflows (Power Automate) model, so the exact menu path depends on your tenant. Both styles accept an HTTP `POST` with a JSON body, and the card JSON in this post works for both because it uses the Adaptive Card schema, which is the forward-compatible choice. If your tenant has fully retired classic connectors, create a "Post to a channel when a webhook request is received" flow in Workflows instead; it gives you a URL that takes the identical payload.

Store the URL as a CI secret. On GitHub Actions that is a repository or environment secret named, say, `TEAMS_WEBHOOK_URL`. Never inline it in a workflow file.

## Step 2: run BrowserBash and capture both artifacts

Run your test so that you capture the NDJSON stream to a file and keep `Result.md`, and record the run so the notification can link to proof. A single command does all of it:

```bash
browserbash testmd run ./checkout_test.md \
  --agent \
  --record \
  --headless \
  --timeout 120 \
  | tee run.ndjson
STATUS=$?
```

A few things to internalize here. The `--agent` flag turns stdout into the NDJSON stream, `tee run.ndjson` writes that stream to a file while still showing it in the build log, and `--record` captures a `webm` video plus screenshots so the card can link to evidence. One catch: `STATUS=$?` captures `tee`'s exit code, not BrowserBash's, which is the bug everyone hits the first time. In a real pipeline use `PIPESTATUS`:

```bash
browserbash testmd run ./checkout_test.md --agent --record --headless --timeout 120 | tee run.ndjson
STATUS=${PIPESTATUS[0]}
```

Now `STATUS` is the BrowserBash exit code: `0`, `1`, `2`, or `3`. That integer is the contract the notification keys off. The card's color and headline derive from it, and the job's final pass/fail derives from it too.

The test itself is intent, not selectors. A `checkout_test.md` is plain Markdown:

```markdown
# Checkout smoke

1. Go to https://staging.example.com
2. Sign in as {{TEST_USER}} with password {{TEST_PASSWORD}}
3. Add the first product to the cart
4. Proceed to checkout and confirm the order summary shows one item
5. Confirm the page heading reads "Order confirmed"
```

The `{{TEST_USER}}` and `{{TEST_PASSWORD}}` variables are substituted at run time and masked in logs, so secrets never end up in the NDJSON you are about to forward to Teams. That masking matters here specifically: you are sending output to a chat channel, and you do not want a credential riding along in a `step` remark.

## Step 3: read the verdict and the numbers from the stream

Before you format a card, pull the values you want to show. The `run_end` line is always the last line of the stream and carries the verdict, a human summary, the extracted state, and the duration. Grab it with `tail -n 1` and read fields with `jq`:

```bash
END=$(tail -n 1 run.ndjson)
VERDICT=$(echo "$END" | jq -r '.status')          # passed | failed | error | timeout
SUMMARY=$(echo "$END" | jq -r '.summary // "No summary."')
DURATION=$(echo "$END" | jq -r '.duration_ms // 0')
```

For a pass/fail count, remember the design of the schema: `step` events are for progress and observability, and the single `run_end` event is the verdict. A BrowserBash run is one objective with one verdict, not a suite of independent assertions, so "pass/fail counts" in this context means counting steps, not counting test cases. If you want a steps-attempted and steps-passed line on the card, derive it from the `step` events:

```bash
STEPS_TOTAL=$(jq -s '[.[] | select(.type=="step")] | length' run.ndjson)
STEPS_PASSED=$(jq -s '[.[] | select(.type=="step" and .status=="passed")] | length' run.ndjson)
```

If you run several `*_test.md` files in one job and want a true tests-passed-of-total count across the channel message, run each file as its own `browserbash testmd run`, capture each exit code, and increment a pass counter when the code is `0`. That gives you an honest "4 of 5 flows passed" headline. A single run's `run_end` cannot fabricate a multi-test count, and you should not pretend it can.

Pull a one-line headline from `Result.md` for the card's human context:

```bash
HEADLINE=$(head -n 1 Result.md 2>/dev/null || echo "No Result.md produced.")
```

## Step 4: build the Adaptive Card

Now map the verdict to a color and a label, then assemble the card JSON. Teams Adaptive Cards use named colors for text (`good`, `warning`, `attention`, `default`), so branch on the exit code to pick one:

```bash
case "$STATUS" in
  0) COLOR="good";      TITLE="Browser test passed";  EMOJI="PASS" ;;
  1) COLOR="attention"; TITLE="Browser test failed";  EMOJI="FAIL" ;;
  2) COLOR="warning";   TITLE="Browser test errored"; EMOJI="ERROR" ;;
  3) COLOR="warning";   TITLE="Browser test timed out"; EMOJI="TIMEOUT" ;;
  *) COLOR="default";   TITLE="Browser test unknown"; EMOJI="?" ;;
esac

DURATION_S=$(awk "BEGIN { printf \"%.1f\", ${DURATION}/1000 }")
```

Then build the payload. The card wraps in an `attachments` array, which is the shape both the classic connector and the Workflows webhook accept:

```bash
cat > card.json <<JSON
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "type": "AdaptiveCard",
        "\$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
          {
            "type": "TextBlock",
            "size": "Large",
            "weight": "Bolder",
            "color": "${COLOR}",
            "text": "${EMOJI}: ${TITLE}"
          },
          {
            "type": "TextBlock",
            "wrap": true,
            "text": "${HEADLINE}"
          },
          {
            "type": "FactSet",
            "facts": [
              { "title": "Verdict", "value": "${VERDICT}" },
              { "title": "Steps passed", "value": "${STEPS_PASSED} / ${STEPS_TOTAL}" },
              { "title": "Duration", "value": "${DURATION_S}s" },
              { "title": "Exit code", "value": "${STATUS}" }
            ]
          },
          {
            "type": "TextBlock",
            "wrap": true,
            "isSubtle": true,
            "text": "${SUMMARY}"
          }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "View run + recording",
            "url": "${ARTIFACT_URL}"
          }
        ]
      }
    }
  ]
}
JSON
```

The `FactSet` is what makes the message scannable: verdict, steps passed, duration, and exit code line up as a small table. The colored title block gives an at-a-glance read before anyone reads a word. The subtle `SUMMARY` block is the agent's own one-line account of what happened, straight from `run_end.summary`. Note the escaped `\$schema` and `\$` in the heredoc so the shell does not try to expand them.

## Step 5: set the artifact link and post the card

`ARTIFACT_URL` should point at where a human can see proof. You have a few honest options depending on your setup:

- If you pass `--upload`, BrowserBash sends the run to the opt-in cloud dashboard, where free runs are kept for 15 days, and you link to that per-run page.
- If you run `browserbash dashboard` locally or host artifacts yourself, link to that.
- On GitHub Actions, link to the run's artifacts page where you uploaded `run.ndjson`, `Result.md`, and the `webm` recording.

Pick whichever your team will actually open, set it, and post:

```bash
ARTIFACT_URL="${BUILD_URL:-https://github.com/your-org/your-repo/actions}"

curl -sS -X POST "$TEAMS_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  --data @card.json

exit "$STATUS"
```

The closing `exit "$STATUS"` re-asserts the verdict so the notification step never accidentally turns a red run green. The notification is a side effect; the exit code is still the thing your pipeline gates on. If you want the gate to live entirely in exit codes and never parse a log, that philosophy is covered in [CI verdicts without log parsing](https://browserbash.com/blog/ci-exit-codes-no-parsing).

## Putting it in a GitHub Actions job

Here is the whole thing as a single step, so you can see the order of operations end to end:

```yaml
- name: Run browser test and notify Teams
  env:
    TEAMS_WEBHOOK_URL: ${{ secrets.TEAMS_WEBHOOK_URL }}
    TEST_USER: ${{ secrets.TEST_USER }}
    TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
    BUILD_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
  run: |
    set -o pipefail
    browserbash testmd run ./checkout_test.md --agent --record --headless --timeout 120 | tee run.ndjson
    STATUS=${PIPESTATUS[0]}

    END=$(tail -n 1 run.ndjson)
    VERDICT=$(echo "$END" | jq -r '.status')
    SUMMARY=$(echo "$END" | jq -r '.summary // "No summary."')
    DURATION=$(echo "$END" | jq -r '.duration_ms // 0')
    STEPS_TOTAL=$(jq -s '[.[] | select(.type=="step")] | length' run.ndjson)
    STEPS_PASSED=$(jq -s '[.[] | select(.type=="step" and .status=="passed")] | length' run.ndjson)
    HEADLINE=$(head -n 1 Result.md 2>/dev/null || echo "No Result.md produced.")

    # ... build card.json as shown above, then:
    curl -sS -X POST "$TEAMS_WEBHOOK_URL" -H "Content-Type: application/json" --data @card.json

    exit "$STATUS"
```

`set -o pipefail` plus `PIPESTATUS[0]` makes sure the real exit code survives the `tee`. Upload `run.ndjson`, `Result.md`, and the recording as build artifacts in a later step so the card's button has somewhere real to land. The NDJSON field names used here come straight from the [agent mode NDJSON tutorial](https://browserbash.com/blog/browserbash-agent-mode-ndjson-tutorial), which documents the full `step` and `run_end` schema if you want to add more facts to the card.

## Only notify on failure (optional)

A green channel that pings on every passing nightly run trains people to mute it. A common refinement is to post only when the run did not pass, so the channel stays quiet until something needs a human:

```bash
if [ "$STATUS" -ne 0 ]; then
  curl -sS -X POST "$TEAMS_WEBHOOK_URL" -H "Content-Type: application/json" --data @card.json
fi
exit "$STATUS"
```

The opposite policy also has its place: some teams want a daily "all green" heartbeat so silence is never ambiguous. Both are one `if` away. The point is that the exit code is the clean signal you branch on, with no log scraping involved.

## Honest limits

This pattern is simple, which means its rough edges are mostly Teams-side and model-side, not BrowserBash-side. Be straight about them.

**The webhook surface keeps moving.** Microsoft has been retiring classic Office 365 connector webhooks and steering tenants to Workflows / Power Automate. The Adaptive Card payload is stable, but the URL you create and the menu you create it from depend on your tenant's current state. If your card returns a 4xx, the most likely cause is a connector style change, not a malformed card. Build the card to the Adaptive Card schema (as above) rather than the older `MessageCard` format to stay on the forward-compatible path.

**There are no real "test counts" inside a single run.** A BrowserBash run is one objective with one verdict. The steps-passed-of-total number on the card is a count of agent actions, not a count of independent test cases, and it should be labeled honestly. If you genuinely want "12 of 13 tests passed" on the card, you have to run multiple `*_test.md` files, tally their exit codes yourself, and assemble that number. Do not imply a suite where there is one flow.

**The verdict is only as good as the model.** Agent mode is a transport, not a judgment upgrade. The default `auto` model resolution tries Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. Small local models (8B and under) get flaky on long, multi-step flows: they lose the thread on a checkout and can report a false fail, which then fires a misleading Teams alert. For unattended CI that posts to a channel people trust, drive hard flows with a 70B-class local model (Qwen3, Llama 3.3) or a capable hosted model. A noisy channel from a weak model is worse than no channel.

**It is not magic recovery.** BrowserBash re-derives the element to act on from the live accessibility tree and DOM on every action, every run, so a moved or renamed button usually still works without a code edit. It does not keep or patch a saved selector script. That is great for surviving UI churn, but a genuinely ambiguous page ("which of these three Submit buttons?") can produce a different path run to run. When a Teams alert fires, open the recording the card links to before assuming a product bug; sometimes the agent took an unexpected but valid route, and the `webm` shows it in seconds.

**Card rendering varies by client.** Adaptive Cards render slightly differently across the Teams desktop app, web, and mobile. Colors and `FactSet` layout are reliable; exotic elements are not. Keep the card to text blocks, a fact set, and one action button, and it will render the same everywhere your team reads it.

For where this sits in the larger toolset, the [features page](https://browserbash.com/features) covers the CI and recording flags end to end, and the [learn hub](https://browserbash.com/learn) has the conceptual background on how the agent drives a browser from intent.

## FAQ

### Do I need a Teams bot or app registration to post test results?

No. For posting CI results into a channel, an incoming webhook is enough. You create the webhook on the channel (via the connectors or Workflows settings), get a URL, store it as a CI secret, and `POST` your Adaptive Card JSON to it. There is no bot, no app registration, and no OAuth in this path. You only need a full bot or Graph API integration if you want to do things beyond posting to a single channel, like reading replies or posting as a named user.

### How do I show pass and fail counts when a run has one verdict?

A single BrowserBash run produces one `run_end` verdict, so the natural per-run numbers are steps attempted and steps passed, which you count from the `step` events in the NDJSON with `jq`. If you want true test-level counts across the message ("4 of 5 flows passed"), run each `*_test.md` as its own `browserbash testmd run`, capture each exit code, and tally how many returned `0`. Label the card accordingly so steps and tests are not confused.

### Should the card link to the cloud dashboard or to CI artifacts?

Either, depending on where your team looks. If you pass `--upload`, link to the per-run page on the opt-in cloud dashboard (free runs are kept 15 days). If you run a local dashboard or self-host, link there. On GitHub Actions, link to the run's artifacts page where you uploaded `run.ndjson`, `Result.md`, and the `webm` recording. The goal is one click from the alert to the evidence, so pick the surface your reviewers already open.

### Will my credentials leak into the Teams message?

Not if you use `{{variables}}` for secrets in your `*_test.md`. BrowserBash substitutes them at run time and masks them in logs, so they do not appear in the `step` remarks or `run_end` payload you forward to the channel. Still, treat the webhook URL itself as a secret and store it in your CI's secret store, and avoid echoing raw environment values into the card text. The card should carry the verdict, a summary, counts, and a link, never a password.
