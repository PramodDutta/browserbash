---
title: Trigger PagerDuty Alerts From Synthetic Browser Checks
description: "PagerDuty synthetic alerts let you page on-call when a scheduled browser check of a critical production flow fails. Map exit codes to severity and page fast."
date: 2026-06-27
category: ci
---

To trigger **PagerDuty synthetic alerts** from a browser check, run a headless BrowserBash check of a critical production flow on a schedule (cron, a CI scheduled job, or a Kubernetes CronJob), read its exit code, and POST an event to the PagerDuty Events API v2 when that code is non-zero. A passing run exits `0` and does nothing. A failed verdict exits `1`, an error exits `2`, a timeout exits `3`, and each of those maps to a `trigger` event with a severity you choose. When the next scheduled run passes again, you send a `resolve` event with the same `dedup_key` and the incident closes itself. That is the whole pattern: a real browser walks your login-to-checkout path every few minutes, and the moment the path breaks, the person carrying the pager finds out.

This post covers the wiring end to end: writing a synthetic check as an intent-based markdown test, running it headless on a schedule, mapping BrowserBash exit codes to PagerDuty severities, deduplicating so one outage is one incident, and the honest part nobody likes, suppressing transient blips so you do not wake someone for a network hiccup. If you are new to running real-browser checks against production, the background piece on [synthetic monitoring with AI agents](https://browserbash.com/blog/synthetic-monitoring-with-ai-agents) sets up the why before this post handles the how.

## What "synthetic" means here and why a browser check is the right signal

A synthetic check is a scripted, repeated transaction that pretends to be a user. Ping a URL, get a 200, that is the shallow version. It tells you the server answered. It does not tell you whether a logged-in customer can actually reach the dashboard, whether the cart still adds items, or whether the payment step renders. Those failures live above the HTTP layer, in JavaScript that did not hydrate, a third-party widget that timed out, a feature flag that shipped half a flow. A status-code probe is blind to all of it.

A browser-driven synthetic check sees what the user sees because it runs the user's path in a real Chrome instance. BrowserBash drives that browser from a plain-English objective. You describe the flow, the agent reads the live page through the accessibility tree (roles, accessible names, states) plus the DOM, decides the next action from what is actually rendered, and returns a pass or fail verdict. There is no selector script to drift out of sync with the UI, because the agent re-derives what to click from the live state on every run rather than replaying a saved locator. When marketing reskins the checkout button, a CSS-selector probe goes red for the wrong reason; an intent objective that says "complete checkout" usually keeps working because the intent did not change.

That property matters specifically for paging on-call. The worst thing a synthetic alert can do is cry wolf. Every false page erodes trust until people mute the service, and a muted monitor is worse than no monitor because you believe you are covered. An intent-based check cuts one whole category of false alarm, the cosmetic UI change that breaks a brittle selector but breaks nothing a user cares about. It does not eliminate flakiness (more on that in the honest-limits section), but it removes the dumbest source of it.

## Write the check as an intent, not a script

Synthetic checks live longest when they read like a description of the flow. A BrowserBash markdown test is a `*_test.md` file: a title, numbered or bulleted steps, `{{variables}}` for environment-specific values, and `@import` to compose shared pieces. Here is a checkout-path check for a production storefront.

```markdown
# Production checkout smoke

@import ./login_test.md

1. Go to {{BASE_URL}}/shop
2. Add the first product to the cart
3. Open the cart and proceed to checkout
4. Confirm the order summary shows a non-zero total
5. Confirm the page heading reads "Payment"
```

The `@import ./login_test.md` pulls in a shared login flow so you write the sign-in once and reuse it across every check that needs an authenticated session. Variables marked as secrets, like a test account password, are masked as `*****` in every log line, so credentials never land in CI output or an incident payload. Late-rendering elements are handled by Playwright's built-in auto-wait with a 15-second ceiling, so you do not sprinkle manual sleeps through the steps to cope with a slow widget.

Two rules keep synthetic checks from becoming the flaky thing they were meant to catch. First, use synthetic test accounts and known test products, never live customer data or live inventory, so the expected end state is fixed and a catalog change does not read as an outage. Second, keep each check to a single flow. One objective that logs in, edits a profile, places an order, and checks email has four independent ways to fail for reasons unrelated to the thing you are paging on. The deeper version of this discipline is in the guide on how to [monitor production flows with synthetic checks](https://browserbash.com/blog/monitor-production-flows-synthetic-checks), which is worth reading before you point this at production.

## Run it headless on a schedule

Synthetic monitoring is just this check on a timer. Run it headless so there is no display server involved, cap it with a timeout so a hung flow fails fast instead of stalling, and let the exit code carry the verdict.

```bash
browserbash testmd run ./checkout_test.md \
  --headless \
  --timeout 120 \
  --record \
  --agent
```

`--headless` runs without a visible window. `--timeout 120` caps the run at two minutes. `--record` captures a `.webm` video and screenshots so a failure at 3 a.m. is a recording you watch, not a mystery you reconstruct. `--agent` emits NDJSON, one JSON object per line, so a wrapper script can read structured progress and a terminal event instead of scraping prose.

Where the timer lives is your choice and it does not change the wiring:

- **System cron** on a small always-on box: one crontab line every five minutes.
- **A CI scheduled job**: GitHub Actions `schedule` triggers, a GitLab scheduled pipeline, a Jenkins cron trigger.
- **A Kubernetes CronJob**: the same container image your CI uses, on a `*/5 * * * *` schedule.

Run it headless either way. The full set of headless flags, recording options, and provider choices is covered in the [headless browser automation guide](https://browserbash.com/blog/headless-browser-automation-guide). One caveat worth stating up front: a five-minute cron means your detection window is up to five minutes wide. A flow can be broken for almost the whole interval before the next run catches it. Tighten the interval and you detect faster but spend more compute per hour; that trade is yours to set per flow based on how much a minute of that flow being down actually costs.

## Map exit codes to PagerDuty severity

BrowserBash returns four exit codes, and they line up neatly with how you want to page:

- `0` passed: the flow worked. Send nothing, or send a `resolve` to clear any open incident.
- `1` failed: the flow ran but the verdict was negative, for example the order total was zero or the payment heading never appeared. This is a real product failure. Page it.
- `2` error: something broke before a verdict, a bad config, a missing dependency, a browser that would not launch. This is a check-infrastructure failure, often not a product outage, so route it differently.
- `3` timeout: the run hit the `--timeout` ceiling. Could be a genuinely hung flow or a slow run; treat it as degraded.

The full meaning of each code and how CI consumes them is detailed in the [BrowserBash exit codes CI tutorial](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial). The mapping to PagerDuty's Events API v2 severity field (`critical`, `error`, `warning`, `info`) is a policy decision, not a fixed law. A defensible default:

| BrowserBash exit code | Meaning | PagerDuty event action | Suggested severity |
| --- | --- | --- | --- |
| `0` | Flow passed | `resolve` | (clears incident) |
| `1` | Flow failed | `trigger` | `critical` |
| `2` | Check errored | `trigger` | `error` |
| `3` | Timed out | `trigger` | `warning` |

Why split them. An exit `1` on the checkout path means customers cannot buy, that is a wake-someone-up `critical`. An exit `2` usually means your monitoring rig broke, not your product, so it deserves a page, but probably to whoever owns the monitors, not whoever owns checkout. An exit `3` is ambiguous enough that `warning` is honest; you want it visible without treating "slow" identically to "down."

Here is a wrapper that runs the check and posts to the Events API v2. The integration key comes from a PagerDuty service with an Events API v2 integration; keep it in an environment variable, not in the script.

```bash
#!/usr/bin/env bash
set -uo pipefail

ROUTING_KEY="${PD_ROUTING_KEY:?set PD_ROUTING_KEY}"
DEDUP_KEY="checkout-smoke-prod"

browserbash testmd run ./checkout_test.md --headless --timeout 120 --record --agent
CODE=$?

case "$CODE" in
  0) ACTION="resolve"; SEVERITY="info";     SUMMARY="Checkout smoke passed" ;;
  1) ACTION="trigger"; SEVERITY="critical"; SUMMARY="Checkout flow FAILED in production" ;;
  2) ACTION="trigger"; SEVERITY="error";    SUMMARY="Checkout check errored (infra/config)" ;;
  3) ACTION="trigger"; SEVERITY="warning";  SUMMARY="Checkout check timed out (degraded)" ;;
  *) ACTION="trigger"; SEVERITY="error";    SUMMARY="Checkout check unknown exit $CODE" ;;
esac

curl -s -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d "{
    \"routing_key\": \"${ROUTING_KEY}\",
    \"event_action\": \"${ACTION}\",
    \"dedup_key\": \"${DEDUP_KEY}\",
    \"payload\": {
      \"summary\": \"${SUMMARY}\",
      \"severity\": \"${SEVERITY}\",
      \"source\": \"browserbash-synthetic\",
      \"component\": \"checkout\"
    }
  }"
```

The `dedup_key` is what turns a noisy loop into a sane incident. Because every run uses the same `dedup_key`, repeated `trigger` events for a still-broken flow fold into the one open incident rather than spawning a new page every five minutes. When the flow recovers, the `resolve` action with that same key closes it. One outage, one incident, one resolve.

## Suppress transient blips honestly

This is the part that decides whether your team trusts the pager or mutes it. A single failed run is not proof of an outage. The network blipped, a third-party script was slow, the agent took an unlucky path on a genuinely ambiguous page. If you page on the first red, you will page on noise, and the honest cost of that is people stop looking.

The standard mitigation is to require consecutive failures before you trigger. Page on the second or third red in a row, not the first. You can do this in PagerDuty's event orchestration or alert grouping, or you can do it in the wrapper by only triggering once a small counter crosses a threshold.

```bash
STATE_FILE="/var/lib/synthetic/checkout.fails"
THRESHOLD=2

if [ "$CODE" -eq 0 ]; then
  rm -f "$STATE_FILE"
  # send resolve here
else
  FAILS=$(( $(cat "$STATE_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$FAILS" > "$STATE_FILE"
  if [ "$FAILS" -lt "$THRESHOLD" ]; then
    echo "Failure $FAILS below threshold $THRESHOLD, not paging yet"
    exit 0
  fi
  # send trigger here
fi
```

The trade is blunt and you should name it out loud: a threshold of two on a five-minute cron means a real outage can be live for up to ten minutes before anyone is paged. That is the price of not crying wolf. Tune it per flow by how expensive the downtime is. A payment flow might justify a tighter interval and a threshold of two; a rarely-used admin report can tolerate a slower cadence and a higher threshold.

Two more honest knobs. Run the check from more than one place if you can; a failure seen from one region but not another is more likely a network problem than a product outage, and that distinction is worth encoding before you page. And separate exit `2` (the check itself broke) from exit `1` (the product broke) in routing, because a config error in your monitoring rig paging the checkout on-call at 3 a.m. is its own kind of trust-destroying false alarm.

## Pick a model that survives a long flow

Synthetic checks of real flows are multi-step, and step count is where model choice starts to matter. BrowserBash resolves a model automatically: Ollama first if it is running, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free models exist. Running a local model means nothing leaves the machine, which is a genuine advantage when your synthetic check logs into production with real test credentials.

The caveat is capability. Small local models (roughly 8B and under) get flaky on long flows; they lose the thread halfway through a multi-step checkout and the agent's verdict becomes the unreliable thing, not the product. For a check that has to be trustworthy enough to page a human, use a 70B-class local model (Qwen3, Llama 3.3) or a hosted model for the hard flows. A flaky monitor is worse than no monitor, and under-powering the model is a quiet way to build a flaky monitor. The engine and model details are on the [features page](https://browserbash.com/features), and the [learn hub](https://browserbash.com/learn) walks through choosing one for your flow length.

## Honest limits

This pattern is solid, but it is not magic, and pretending otherwise sets you up to distrust it later.

**The agent is stochastic.** The same objective can take a slightly different path run to run. That is exactly what makes it survive UI churn, and it is exactly what makes a one-off failure occasionally hard to reproduce. The defenses are real but partial: narrow, unambiguous objectives, the consecutive-failure threshold above, and `--record` so every failure is a video and (with the builtin engine) a Playwright trace rather than a guess. You will still get the occasional run where you watch the recording and conclude the agent, not the product, had a bad day.

**Detection is as coarse as your interval.** A cron-driven synthetic check cannot detect faster than its schedule. A flow can break thirty seconds after a run and stay broken until the next one. Synthetic checks are a complement to real-user monitoring and server-side alerting, not a replacement; they catch the user-visible breakages those layers miss, and they miss the sub-interval failures those layers catch.

**A passing synthetic is not full coverage.** It proves the one path you scripted works for the one synthetic account you used. It says nothing about the seventeen other flows you did not check, the logged-out experience, or that specific customer with a weird cart. Breadth costs runtime and compute, so you will always be checking a curated few critical paths, not everything.

**It is not a replayed selector script.** BrowserBash re-derives what to interact with from the live page on every run; it does not save and patch a locator file. That is a strength for surviving UI change, but it means you cannot diff "what the test clicked last week versus this week" the way you can with a committed selector script. Your audit trail is the run record, the NDJSON, and the recording, not a stable line of code.

**A model call costs something.** On a local model that cost is compute and the machine staying on. On a hosted model it is per-token, and a check every five minutes across many flows adds up. None of these are measured figures for your setup; treat any specific number you see quoted as illustrative until you measure your own runs and your own bill.

## FAQ

### How do I keep one outage from paging on-call every five minutes?

Use a stable `dedup_key` on the PagerDuty Events API v2 event. Every scheduled run sends a `trigger` with the same `dedup_key`, so repeated failures of a still-broken flow collapse into the single open incident instead of creating a new page each cycle. When a later run passes, send `resolve` with that same key and the incident closes. The result is one incident per outage and an automatic resolve when the flow recovers.

### Which exit code should page someone and which should not?

Exit `1` (the flow ran and failed) is a real product outage and is the one you want to page hard on as `critical`. Exit `3` (timeout) is degraded and is honest as a `warning`. Exit `2` (the check errored before reaching a verdict) usually means your monitoring rig broke, not your product, so still page it but route it as `error` to whoever owns the monitors rather than to the product on-call. Exit `0` sends a `resolve`, not a page.

### Won't an AI agent page us on false alarms?

It removes one big class of false alarm, the cosmetic UI change that breaks a brittle selector but breaks nothing a user cares about, because the agent works from intent and the live accessibility tree rather than a saved selector. It does not remove stochastic flakiness entirely. The practical defense is requiring two or three consecutive failures before triggering, running from more than one location, and capturing `--record` artifacts so you can confirm a failure was real before trusting the next one like it.

### Can I run this fully on-premise without sending data to a cloud?

Yes. Run the agent against a local model by having Ollama running, which resolves first in the default model order, so the page content and your test credentials never leave the machine. Drive a local headless browser with `--provider local`. The trade-off is that small local models get flaky on long multi-step flows, so for a check trustworthy enough to page a human, use a 70B-class local model rather than an 8B one. The PagerDuty POST is the only outbound call, and it carries your summary text, not the page contents.

## Wrapping up

The whole pattern reduces to four moving parts: an intent-based markdown check of one critical flow, a scheduler that runs it headless on a timer, an exit-code-to-severity map, and a PagerDuty Events API v2 call with a stable `dedup_key`. The agent watches your real user path the way a user would, the exit code carries the verdict your pipeline already knows how to read, and the `dedup_key` keeps one outage to one incident. Add a consecutive-failure threshold so you page on signal and not on noise, pick a model strong enough to finish the flow without drifting, and you have a synthetic monitor that pages on-call when production actually breaks, and stays quiet when it does not.

Install with `npm install -g browserbash-cli`, point a check at a staging URL first, and watch a deliberately broken flow walk through trigger and resolve before you let it near the production pager.
