---
title: Auto-File Jira Issues From Failing AI Browser Tests
description: "Open a Jira issue automatically from test failures: map BrowserBash exit codes to severity, attach the recording and Result.md, and dedupe flaky noise."
date: 2026-06-27
category: ci
---

To create **a Jira issue automatically from test failures**, gate a CI step on the BrowserBash exit code: when a run exits `1` (the agent reached a confident "fail" verdict), call the Jira REST API to open a ticket, then attach the run recording and the per-run `Result.md` to it. BrowserBash makes this clean because the verdict is the process exit status, not a string you scrape from a log, so your pipeline can branch on `0` (pass), `1` (fail), `2` (error), and `3` (timeout) with no guesswork. The honest part, which most "auto-file bugs" tutorials skip, is the deduplication and flake filtering: file a ticket on every red run and you will bury your board under repeat reports and noise from one slow network call. This post shows the wiring end to end, maps each exit code to a sensible severity, and is blunt about where this approach should and should not fire.

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, write your intent in plain English or in a Markdown `*_test.md` file, and an AI agent drives a real Chrome or Chromium browser step by step using the accessibility tree (roles, accessible names, states) plus the DOM. There are no CSS selectors to maintain and no page objects to refactor. For the Jira-filing job, three properties matter: the verdict arrives as an exit code, the run can emit machine-readable NDJSON with `--agent`, and `--record` captures a webm video plus screenshots you can attach as evidence. Let's build the bridge.

## Why exit codes, not log scraping, drive the Jira step

The first instinct teams have is to grep the run output for the word "fail" and create a ticket when they find it. That is fragile in two directions. A log-format tweak silently breaks the trigger and you stop filing tickets you should file. Worse, the agent might mention the word "fail" while describing what it was checking ("verifying the form does not fail on empty input"), and you file a ticket for a passing run.

BrowserBash avoids both by making the verdict the process exit status. The contract is small and stable:

- `0`: the objective was met. Pass. No ticket.
- `1`: the agent reached a confident negative verdict. The thing under test is genuinely broken. This is your file-a-bug case.
- `2`: an error prevented a verdict (bad config, the target URL never loaded, a crashed browser). Not a product bug, an infrastructure or test problem.
- `3`: the run hit its time ceiling before concluding. Could be a real hang, could be a slow environment.

That separation is the whole game. A product bug (`1`) should open a Jira issue against your application project. An error (`2`) or timeout (`3`) usually points at the pipeline or the environment, and filing those as product bugs is exactly how you train a team to ignore the bot. We map them to different destinations and severities below. If you want the full breakdown of what each code means and how to gate a pipeline on it, the dedicated walkthrough is here: [BrowserBash exit codes and CI gating, explained](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial).

## The test that produces the evidence

Before we file anything, we need a run that produces a verdict and artifacts. Here is a small intent test as a Markdown file, `checkout_test.md`:

```markdown
# Checkout completes with a saved card

@import ./login_test.md

1. Go to {{base_url}}/cart
2. Confirm the cart shows 1 item
3. Click "Proceed to checkout"
4. Choose the saved card ending in {{card_last4}}
5. Place the order
6. Confirm an order confirmation number is shown
```

A few things to note that matter for the Jira workflow. The `@import ./login_test.md` line composes a shared login flow so you are not rewriting auth in every test. The `{{base_url}}`, `{{card_last4}}` and any secret variables are substituted at run time, and secret values are masked in logs, so when you attach a log to a ticket you are not leaking a card number or a token. The steps are intent, not selectors: "Click Proceed to checkout" is resolved against the live accessibility tree on each run, so a class rename in the frontend does not turn this into a false bug report.

Run it in CI like this:

```bash
browserbash testmd run ./checkout_test.md \
  --agent \
  --headless \
  --record \
  --timeout 120000
```

`--agent` emits NDJSON to stdout so a script can parse each step and the final verdict. `--headless` runs without a visible window. `--record` writes a webm video plus screenshots. Every run also writes a `Result.md`, a human-readable summary of what the agent did, what it saw, and why it reached its verdict. Those two artifacts, the recording and `Result.md`, are exactly what a developer wants attached to a bug. More on capturing good video is in [Record browser test videos from the CLI](https://browserbash.com/blog/record-browser-test-videos-cli), and the anatomy of a shareable result write-up is covered in [Browser test reports and stakeholder summaries](https://browserbash.com/blog/browser-test-reports-and-stakeholder-summaries).

## Mapping exit codes to Jira severity

Do not file every non-zero run the same way. The mapping below is a sane default you can tune to your team's Jira fields. Severity names and project keys here are illustrative; swap in yours.

| Exit code | Meaning | Action | Jira destination | Severity |
| --- | --- | --- | --- | --- |
| `0` | Pass | Nothing | none | none |
| `1` | Confident fail | File bug | App project (e.g. `WEB`) | High / `Blocker` if on a critical flow |
| `2` | Error, no verdict | File infra task or alert | CI/Infra project (e.g. `OPS`) | Medium |
| `3` | Timeout | Quarantine, then file only if it repeats | CI/Infra project | Low to Medium |

The reasoning: a `1` on your checkout flow is a customer-facing defect and deserves a real bug with evidence. A `2` is more often a broken pipeline step than a product problem, so it should page the team that owns CI, not clutter the engineering bug board. A `3` is the one most likely to be flaky environment noise, so the default is to retry once and only escalate on a repeat. Treating all three as "the test went red, make a bug" is the fastest way to make people mute the integration.

## The filing script

Here is a Bash step that runs the test, branches on the exit code, and files to Jira via the REST API. It uses `curl` and `jq`; adapt the field names to your Jira instance.

```bash
#!/usr/bin/env bash
set -uo pipefail

JIRA_BASE="https://your-org.atlassian.net"
JIRA_AUTH="$JIRA_EMAIL:$JIRA_API_TOKEN"   # from CI secrets
RUN_DIR="./bb-artifacts"

mkdir -p "$RUN_DIR"

# Run the test. Do not let a non-zero exit abort the script: we want to handle it.
browserbash testmd run ./checkout_test.md \
  --agent --headless --record --timeout 120000 \
  > "$RUN_DIR/run.ndjson"
CODE=$?

# Decide project + severity from the exit code.
case "$CODE" in
  0) echo "Pass. Nothing to file."; exit 0 ;;
  1) PROJECT="WEB"; SEVERITY="High";   TYPE="Bug" ;;
  2) PROJECT="OPS"; SEVERITY="Medium"; TYPE="Task" ;;
  3) PROJECT="OPS"; SEVERITY="Low";    TYPE="Task" ;;
  *) PROJECT="OPS"; SEVERITY="Medium"; TYPE="Task" ;;
esac
```

The `> "$RUN_DIR/run.ndjson"` capture keeps the structured stream so we can pull a one-line summary into the ticket title and body. Now build a stable fingerprint and a summary from the NDJSON, then create the issue:

```bash
# A stable fingerprint: test file + exit code + the failing step text.
FAIL_STEP=$(jq -r 'select(.type=="step" and .status=="fail") | .text' \
  "$RUN_DIR/run.ndjson" | tail -1)
FINGERPRINT=$(printf '%s|%s|%s' "checkout_test.md" "$CODE" "$FAIL_STEP" \
  | shasum | cut -c1-12)

SUMMARY="[bb $FINGERPRINT] checkout_test failed: ${FAIL_STEP:-no verdict}"
DESCRIPTION="Exit code: $CODE. See attached Result.md and recording.
Fingerprint: $FINGERPRINT"

ISSUE=$(curl -s -u "$JIRA_AUTH" -X POST \
  -H "Content-Type: application/json" \
  "$JIRA_BASE/rest/api/3/issue" \
  -d "$(jq -n \
        --arg p "$PROJECT" --arg s "$SUMMARY" \
        --arg d "$DESCRIPTION" --arg t "$TYPE" \
        '{fields:{project:{key:$p},summary:$s,
          description:$d,issuetype:{name:$t}}}')")

ISSUE_KEY=$(echo "$ISSUE" | jq -r '.key')
echo "Filed $ISSUE_KEY"
```

That `FINGERPRINT` is the key to deduplication, which we get to next. First, attach the evidence:

```bash
# Attach Result.md and the recording to the issue.
for f in "$RUN_DIR"/Result.md "$RUN_DIR"/*.webm; do
  [ -e "$f" ] || continue
  curl -s -u "$JIRA_AUTH" -X POST \
    -H "X-Atlassian-Token: no-check" \
    -F "file=@$f" \
    "$JIRA_BASE/rest/api/3/issue/$ISSUE_KEY/attachments"
done
```

Now the developer who picks up the ticket opens it and finds the exact failing step in the title, the full reasoning in `Result.md`, and a webm of the agent walking the flow up to the point it went wrong. That is a bug report someone can act on without first asking "how do I reproduce this?"

## Deduplicating repeat failures

Filing a fresh ticket on every red run is the single biggest reason auto-filing gets switched off. A broken checkout flow that runs every fifteen minutes will mint ninety-six identical tickets a day. The fix is the fingerprint: a stable hash of what failed (test file, exit code, failing step) rather than when it failed.

Before creating a new issue, search Jira for an open issue carrying the same fingerprint. If one exists, comment on it instead of opening a new one:

```bash
EXISTING=$(curl -s -u "$JIRA_AUTH" -G \
  "$JIRA_BASE/rest/api/3/search" \
  --data-urlencode "jql=project=$PROJECT AND statusCategory != Done \
    AND text ~ \"$FINGERPRINT\"" \
  | jq -r '.issues[0].key // empty')

if [ -n "$EXISTING" ]; then
  curl -s -u "$JIRA_AUTH" -X POST \
    -H "Content-Type: application/json" \
    "$JIRA_BASE/rest/api/3/issue/$EXISTING/comment" \
    -d "$(jq -n --arg b "Reproduced again at $(date -u +%FT%TZ). Exit $CODE." \
          '{body:$b}')"
  echo "Commented on existing $EXISTING"
  exit 0
fi
# else: fall through to the create-issue block above
```

Putting the fingerprint in the summary (`[bb $FINGERPRINT]`) and searching for it gives you idempotency: the first failure opens one ticket, every repeat adds a "reproduced again" comment with a fresh timestamp. The board shows one bug with a visible reproduction count instead of a wall of duplicates. When the underlying bug is fixed and the test goes green, you stop touching the ticket and a human closes it. You can extend this to auto-comment "passed again" or transition the issue when a later run returns `0`, but be conservative: a test flapping green for one run does not mean the bug is fixed.

## The honest part: avoiding ticket noise from flaky steps

This is where most "auto-file your bugs" pipelines quietly fail. A single red run is not proof of a product defect. It can be a slow third-party widget, a cold cache on the first request after a deploy, or a genuinely non-deterministic step. If your filing logic does not account for this, you will file bugs that are really flakes, and developers will learn to distrust every ticket the bot opens, including the real ones.

A few guardrails that work:

**Retry before you file, but only for `2` and `3`.** A confident `1` verdict is the agent saying the expected outcome was not present, and that is usually worth filing immediately. Errors and timeouts are far more likely to be environmental, so retry those once or twice and file only if they persist. BrowserBash leans on Playwright's built-in auto-wait with a 15-second ceiling and no manual sleeps, so a lot of ordinary "the element was not ready yet" flake is already absorbed before a verdict is reached. That reduces, but does not eliminate, environmental noise.

**Require N-of-M consecutive failures for non-critical flows.** For a flow that is not customer-blocking, only file once you have seen the same fingerprint fail two or three runs in a row. The dedup logic already tracks the fingerprint, so this is a counter, not new infrastructure.

**Separate "the test could not run" from "the feature is broken."** This is the entire reason for the exit-code mapping. Route `2` and `3` to an infra channel or a CI project so they never look like product bugs. Many false reports come from this single confusion.

**Tag every auto-filed ticket.** Label them `auto-filed` and `source:browserbash` so triage can spot, batch, and (if needed) bulk-mute them. An auto-filer you cannot easily silence is an auto-filer people will rip out.

The deeper move is to fix flake at the source rather than filtering it downstream. When a step is genuinely non-deterministic, no amount of retry logic makes the ticket trustworthy. The right response is root-cause work on the test or the app, and the diagnostic process for that is laid out in [Flaky test root cause analysis: a debugging playbook](https://browserbash.com/blog/flaky-test-root-cause-analysis). Auto-filing is a delivery mechanism for signal; it cannot manufacture signal that is not there.

## Where BrowserBash struggles on this specific job

Be clear-eyed about the limits before you wire this into a release gate.

**The verdict is a judgment, not a deterministic assert.** With the default `stagehand` engine, the agent observes the live DOM each step and decides the next action from what is rendered right then. The alternative `builtin` engine (an Anthropic tool-use loop) re-derives the selector on every action from a fresh snapshot and captures native Playwright traces. Either way, the pass/fail call is the model interpreting the page, not a hardcoded equality check. On a borderline case ("is this the right confirmation message?") two runs can disagree. For the Jira workflow that means an occasional `1` that is a model judgment call rather than a hard defect. Keep your objectives concrete and checkable to narrow that gap.

**Small local models are not reliable enough to file bugs from.** BrowserBash resolves a model automatically: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, with free hosted models available. Local models keep everything on the machine, which is great for privacy, but models at or below 8B parameters get flaky on long flows. If a bug ticket is going to interrupt a developer, you want the verdict to come from a 70B-class model (Qwen3, Llama 3.3) or a hosted model, not a tiny local one that loses the thread halfway through checkout. Choosing a model is its own topic; see the [learn hub](https://browserbash.com/learn) for the tradeoffs.

**Auto-filing does not triage.** The script files and dedupes; it does not decide whether a `1` on a low-traffic settings page deserves the same urgency as a `1` on checkout. That judgment still belongs to a human, or to severity rules you maintain by hand. The fingerprint plus the exit-code mapping gets you organized noise, not prioritized work.

**Jira API specifics drift.** Field names, required fields, issue types, and screen configurations vary per instance and change over time. The script above is a skeleton; your `description` may need Atlassian Document Format, your project may force a component or a custom severity field, and your token may need specific scopes. Treat the API calls as the part you will adapt, not copy verbatim.

**A frequently failing flow can still flood you despite dedup.** Dedup collapses identical fingerprints, but if a deploy breaks five different flows at once you get five tickets, which is correct but can feel like a flood during an incident. Pair auto-filing with a circuit breaker: if more than K distinct fingerprints fail in one pipeline run, file one umbrella incident instead of K bugs. That is a small amount of extra logic and worth it for release-day sanity.

## FAQ

### How do I open a Jira issue automatically only when a test really fails?

Gate the Jira step on the BrowserBash exit code and file only on `1`. Run with `browserbash testmd run ./your_test.md --agent --headless --record`, capture `$?`, and create an issue when the code is `1` (a confident fail verdict). Route `2` (error) and `3` (timeout) to an infra channel or a separate project instead, since those usually mean the test could not run rather than the feature being broken. This is more robust than scraping the log for the word "fail," which breaks on format changes and misfires on passing runs that merely mention failure.

### How do I attach the recording and Result.md to the Jira ticket?

Run the test with `--record` so BrowserBash writes a webm video plus screenshots, and rely on the `Result.md` it writes every run. After the issue is created and you have its key, POST each file to `/rest/api/3/issue/{key}/attachments` with the header `X-Atlassian-Token: no-check` and a multipart `file=@path` field. Attaching the video and the result summary turns a terse "test failed" into a report a developer can act on without asking how to reproduce it.

### How do I stop a repeating failure from creating duplicate tickets?

Build a stable fingerprint from the test file, exit code, and failing step text (a short hash), and put it in the issue summary, for example `[bb a1b2c3d4e5f6]`. Before creating an issue, search Jira with JQL for an open issue containing that fingerprint. If one exists, add a "reproduced again" comment with a timestamp instead of opening a new ticket. The first failure files one bug; every repeat updates it, so the board shows one issue with a reproduction count rather than dozens of duplicates.

### How do I keep flaky steps from filing false bugs?

Use four guardrails. Retry only `2` and `3` exit codes before filing, since those are usually environmental, while a `1` is the agent's confident verdict. Require two or three consecutive same-fingerprint failures before filing for non-critical flows. Route errors and timeouts away from the product bug project so they never masquerade as defects. And label every auto-filed ticket so triage can batch or mute them. BrowserBash's Playwright-based auto-wait (15-second ceiling, no manual sleeps) absorbs a lot of timing flake before a verdict, but for genuinely non-deterministic steps the real fix is root-cause work, not more retry logic.

## Putting it together

The shape of a trustworthy auto-filer is small: run the test so the verdict is an exit code, branch `0/1/2/3` to different destinations and severities, build a fingerprint, dedupe against open issues, and attach the recording and `Result.md` as evidence. BrowserBash supplies the parts that make this reliable, a structured NDJSON stream under `--agent`, a per-run `Result.md`, and `--record` artifacts, while you supply the policy: what counts as severe, when to retry, and how many repeats justify a ticket. Get the policy right and the bot files real bugs with real evidence and stays quiet otherwise. Get it wrong and you have built a duplicate-ticket machine. The difference is entirely in the exit-code mapping and the dedup, which is why both got more space here than the `curl` call that actually opens the issue.

You can install the CLI today with `npm install -g browserbash-cli`, point a test at a staging URL, and have the filing script open its first real ticket on the next genuine failure. Start with one critical flow, file only on `1`, and widen from there once you trust what lands on the board.
