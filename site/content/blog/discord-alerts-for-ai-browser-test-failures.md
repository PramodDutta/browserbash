---
title: Send Discord Alerts for AI Browser Test Failures in CI
description: "Discord alerts for browser test failures: read the BrowserBash exit code and Result.md, then curl a Discord webhook from your CI step when a run fails."
date: 2026-06-27
category: ci
---

To send **Discord alerts for browser test failures** with BrowserBash, you let the test run finish, check its exit code, and if it is non-zero you build a message from the run output and `curl` it to a Discord webhook from the same CI step. BrowserBash gives you the signal: a clean exit code (`0` pass, `1` fail, `2` error, `3` timeout), machine-readable NDJSON when you pass `--agent`, a human-readable `Result.md` per run, and optional `--record` artifacts. You wire the webhook. BrowserBash does not natively post to Discord, Slack, or anything else, and that is on purpose: emitting a stable signal and letting you choose the destination is more flexible than a built-in integration that only fits one team's setup. This post shows the exact wiring, from a one-line objective to a full GitHub Actions job that pings your channel when a flow breaks.

## The short version

Here is the whole pattern in three lines, before we unpack it:

```bash
browserbash testmd run ./checkout_test.md --headless --agent > run.ndjson
status=$?
[ $status -ne 0 ] && curl -H "Content-Type: application/json" \
  -d '{"content":"Checkout flow failed in CI (exit '"$status"')"}' \
  "$DISCORD_WEBHOOK_URL"
```

That is the entire mechanism. The test runs, `$?` captures the exit code, and a non-zero status fires a webhook. Everything below makes that message useful: pulling the failing step out of `Result.md`, formatting a Discord embed, attaching the recording, and making the alert fire reliably even when the pipeline is having a bad day.

## Step 1: get a clean pass/fail signal out of the run

The foundation of any alert is a trustworthy pass/fail. BrowserBash uses process exit codes, which is the one interface every CI system already understands:

- `0`: the run passed, every step succeeded.
- `1`: the run failed, meaning the agent reached the page but a step did not pass (an element never appeared, an assertion was false, the flow could not complete).
- `2`: an error, meaning something broke outside the test logic (bad config, a provider that would not start, a malformed test file).
- `3`: a timeout, meaning the run blew past its ceiling before finishing.

This distinction matters for alerting because you want to phrase the message differently for a `1` (your app probably broke) than for a `2` or `3` (your harness or infrastructure probably broke). "Checkout flow failed" versus "test runner errored, check the CI logs" tells the on-call person where to look before they open the link.

A minimal run that produces a signal looks like this:

```bash
browserbash run "log in as the demo user and confirm the dashboard loads" \
  --headless \
  --agent
echo "exit code: $?"
```

The `--headless` flag is what you want in CI, since there is no display. The `--agent` flag switches output to NDJSON, which we will use for richer messages in a moment. If you only care about pass/fail, the exit code alone is enough. For a deeper walk through what each code means and how to branch on them, the [BrowserBash exit codes tutorial](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial) covers the full matrix.

## Step 2: write the test as intent, not selectors

Before the alert can mean anything, the test has to be readable. BrowserBash tests are Markdown files where the title is an `#` heading and the steps are a bullet or numbered list written in plain English. The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, so you describe what a user does, not what CSS class to click.

A `checkout_test.md` might look like this:

```markdown
# Guest checkout reaches confirmation

1. Go to {{BASE_URL}}
2. Add the first product on the page to the cart
3. Open the cart and proceed to checkout
4. Fill the shipping form with the test address
5. Place the order
6. Confirm an order number is shown
```

The `{{BASE_URL}}` is a variable, resolved from the environment at run time. Variables that hold secrets are masked in logs, which matters the moment your Discord alert quotes run output: you do not want a token leaking into a public channel. You can also compose tests with `@import`, so a shared login step lives in one file:

```markdown
# Checkout requires a logged-in user

@import ./login_test.md

1. Add the first product to the cart
2. Proceed to checkout and place the order
3. Confirm an order number is shown
```

Because the test is intent rather than a recorded selector script, BrowserBash re-derives the right element from the live page on every run. The default `stagehand` engine (MIT, by Browserbase) observes the rendered DOM each step and decides the next action from what is on screen right then. The alternate `builtin` engine runs an Anthropic tool-use loop, captures native Playwright traces, and re-derives the selector from a fresh snapshot on every action, never cached across runs. Neither keeps a saved selector to drift out of date. That is good for your alert quality: a red Discord ping is more likely to mean "the flow is actually broken" than "a class name changed," which is the noise that makes selector-based alerts untrustworthy. More on the engine model is on the [features page](https://browserbash.com/features).

## Step 3: build a useful message from Result.md and NDJSON

A bare "exit 1" is a weak alert. You want the channel to see which flow broke and at which step. BrowserBash gives you two sources for that.

`Result.md` is written per run: a human-readable summary of what happened, step by step, including which step failed. It is the obvious thing to quote into a Discord message because it already reads like a report. For background on shaping these into something a non-engineer can read, see [browser test reports and stakeholder summaries](https://browserbash.com/blog/browser-test-reports-and-stakeholder-summaries).

The `--agent` NDJSON stream is the structured source: one JSON object per line, one line per event, so you can pull the exact failing step with a JSON tool instead of scraping prose. A walkthrough of the event shapes lives in the [NDJSON agent mode tutorial](https://browserbash.com/blog/ndjson-agent-mode-tutorial).

Here is a shell snippet that runs the test, and on failure extracts a one-line reason to put in the alert:

```bash
#!/usr/bin/env bash
set -uo pipefail

DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:?webhook not set}"
TEST="./checkout_test.md"

browserbash testmd run "$TEST" --headless --agent > run.ndjson
status=$?

if [ "$status" -eq 0 ]; then
  echo "pass"
  exit 0
fi

# Pull the last failing step text from the NDJSON, falling back to Result.md.
reason=$(jq -r 'select(.level=="error" or .status=="failed") | .message' run.ndjson \
  | tail -n 1)
[ -z "$reason" ] && reason=$(tail -n 20 Result.md | tr '\n' ' ')

case "$status" in
  1) title="Browser test FAILED" ;;
  2) title="Test runner ERROR" ;;
  3) title="Browser test TIMED OUT" ;;
  *) title="Browser test exited $status" ;;
esac

curl -sf -H "Content-Type: application/json" \
  -d "$(jq -n --arg t "$title" --arg r "$reason" --arg ref "${GITHUB_RUN_ID:-local}" \
    '{embeds:[{title:$t,description:$r,color:15158332,footer:{text:("run "+$ref)}}]}')" \
  "$DISCORD_WEBHOOK_URL"

exit "$status"
```

A few things worth calling out. The `color:15158332` is Discord red, which makes failures scannable in a busy channel. Building the payload with `jq -n` rather than string interpolation matters: a failing step description can contain quotes or newlines that would break a hand-built JSON string, and `jq` escapes them for you. The `exit "$status"` preserves the original code so the CI step still goes red after the alert is sent: the alert is a notification, not a substitute for failing the build.

## Step 4: the GitHub Actions job

Now put it in a workflow. This job checks out the repo, installs BrowserBash, runs the test headless, and pings Discord on any non-zero exit. The webhook URL lives in repository secrets, never in the YAML.

```yaml
name: Browser smoke + Discord alert

on:
  push:
    branches: [main]
  schedule:
    - cron: "0 */6 * * *"   # every six hours

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install BrowserBash
        run: npm install -g browserbash-cli

      - name: Run browser test
        id: bb
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BASE_URL: ${{ vars.BASE_URL }}
        run: |
          browserbash testmd run ./checkout_test.md \
            --headless --agent --record > run.ndjson
        continue-on-error: true

      - name: Alert Discord on failure
        if: steps.bb.outcome == 'failure'
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: |
          reason=$(jq -r 'select(.level=="error" or .status=="failed") | .message' \
            run.ndjson | tail -n 1)
          [ -z "$reason" ] && reason="See Result.md / artifacts."
          curl -sf -H "Content-Type: application/json" \
            -d "$(jq -n --arg r "$reason" --arg url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
              '{embeds:[{title:"Browser test failed in CI",description:$r,color:15158332,fields:[{name:"Run",value:$url}]}]}')" \
            "$DISCORD_WEBHOOK_URL"

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: browserbash-run
          path: |
            run.ndjson
            Result.md
            *.webm

      - name: Fail the job if the test failed
        if: steps.bb.outcome == 'failure'
        run: exit 1
```

The structure is deliberate. The test step uses `continue-on-error: true` so a failure does not abort the job before the alert fires. The alert step is gated on `steps.bb.outcome == 'failure'`, so it only runs on a real failure. Artifacts upload `if: always()`, keeping the NDJSON, `Result.md`, and the `--record` `.webm` whether the run passed or failed. The final step re-fails the job so the commit status still goes red and branch protection still works. The deeper version of this workflow, including matrix runs and caching, is in the [BrowserBash GitHub Actions tutorial](https://browserbash.com/blog/browserbash-github-actions-tutorial).

### Attaching the recording

The webhook snippets above send a link, which is usually enough. If you want the actual video in the channel, Discord webhooks accept file uploads via `multipart/form-data`. The `--record` flag produces a `.webm` plus screenshots, so you can attach the clip directly:

```bash
curl -sf "$DISCORD_WEBHOOK_URL" \
  -F 'payload_json={"content":"Checkout flow failed. Recording attached."}' \
  -F "file=@$(ls -t *.webm | head -n 1)"
```

Mind Discord's upload size limit (8 MB on the free tier at time of writing, larger on boosted servers). A long flow can exceed that, in which case a link to the CI artifact is the safer default and the video lives in your Actions run instead.

## Making the alert reliable

A failure alert that itself fails silently is worse than no alert, because you now believe green means healthy. Two habits keep it honest.

First, never gate the webhook call on the same thing that might be broken. If you decide pass/fail by grepping stdout for a success string, a tooling change can quietly stop the regex from matching and your conditional defaults to "no alert." The exit code has no such failure mode. Branch on `$?`, not on prose.

Second, check that the `curl` to Discord itself succeeded. The `-f` flag makes `curl` return non-zero on an HTTP error, so a bad webhook URL or a Discord outage does not pass silently.

For a local view that needs no cloud, `browserbash dashboard` serves run history and replays recordings on your machine. Every run is also kept on disk under `~/.browserbash/runs` with secrets masked, so even a missed alert leaves evidence on the agent. There is an optional, strictly opt-in `--upload` to a free cloud dashboard (uploaded runs kept 15 days) if you want a teammate to watch a replay without CI access.

## Honest limits

This pattern is solid, but it is not magic, and there are specific places it gets awkward.

**BrowserBash does not post to Discord for you.** There is no `--discord` flag, no built-in integration, no retry queue for the webhook. You own the `curl`, the message formatting, and the error handling around the HTTP call. That is a feature in the sense that you are not locked into one notifier, but it is real work, and the wiring above is the floor, not a turnkey product.

**A flaky test produces a flaky alert.** The fastest way to kill a Discord alert channel is to fill it with red pings that turn green on a re-run. AI agents are non-deterministic: the same objective can take a slightly different path twice. Small local models (8B and under) are especially shaky on long flows and fail intermittently for reasons unrelated to your app. A 70B-class model (Qwen3, Llama 3.3) or a hosted model for the hard flows settles this down. By default the model is `auto`, resolving Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist there too). Running fully local means nothing leaves the machine, great for privacy and weaker on reliability for long flows.

**A timeout is not always a real failure.** BrowserBash uses Playwright auto-wait with a 15-second ceiling and no manual sleeps, which handles late-rendering elements well. But a genuinely slow staging environment can trip the `3` timeout exit, and if your message says "checkout broke," you have cried wolf. That is exactly why branching on exit code (`1` versus `3`) earns the extra `case` statement.

**The message is only as good as the run output.** Pulling the failing step from NDJSON or `Result.md` works when the agent fails cleanly at a specific step. When a run errors early (exit `2`), there may be little useful detail to quote, and your alert rightly falls back to "check the CI logs."

**Secrets need care in a public channel.** Variable masking covers `{{...}}` secrets in BrowserBash logs, but if you quote raw output into a message, audit what you are sending: a Discord channel is often more visible than your CI logs. When in doubt, send a link to the artifact rather than the full text.

For more on matching model size to flow complexity and keeping AI runs stable enough to alert on, the [learn resources](https://browserbash.com/learn) go deeper.

## FAQ

### How does BrowserBash tell my CI step that a test failed?

Through the process exit code. After a run, `$?` holds `0` for pass, `1` for a failed step, `2` for an error outside the test logic, and `3` for a timeout. Your CI step branches on that code: any non-zero value triggers the `curl` to your Discord webhook. The exit code is a stable interface every CI system already reads, so you never have to parse logs to decide whether to alert.

### Can BrowserBash send the Discord message itself?

No. BrowserBash emits the signal (exit code, `--agent` NDJSON, `Result.md`, and `--record` artifacts) and you wire the notification. There is no native Discord, Slack, or Jira integration. You write the `curl` to the webhook in your CI step, which keeps you free to send to any destination and to format the message however your team likes.

### How do I put the failing step into the alert instead of a generic message?

Run with `--agent` to get NDJSON, then use `jq` to select the error or failed event and pull its message, falling back to the tail of `Result.md` if nothing matches. Build the Discord payload with `jq -n` so quotes and newlines in the step text are escaped correctly. The result is an alert that names the flow and the step rather than a bare "tests failed."

### Why are my Discord alerts noisy, firing then passing on re-run?

That is usually model non-determinism, not your app. Small local models (8B and under) are flaky on long multi-step flows and produce intermittent failures. Move the hard flows to a 70B-class model (Qwen3, Llama 3.3) or a hosted model, keep smoke tests short and focused, and the red-then-green pings drop off. A noisy alert channel that people learn to ignore is worse than no channel at all.

## Wrapping up

The recipe is small and durable: run the test headless in CI, capture the exit code, and on any non-zero status build a message from `Result.md` or the `--agent` NDJSON and `curl` it to a Discord webhook. Branch the wording on the exit code so a real app failure reads differently from a timeout or runner error, attach the `--record` clip or a link to the artifact, and re-fail the job so the build status stays honest. BrowserBash hands you a clean signal and durable run evidence; the webhook is a dozen lines of shell you write once and reuse across every test in the repo.
