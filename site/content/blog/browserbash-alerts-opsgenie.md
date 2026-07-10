---
title: Route BrowserBash Monitor Alerts Into Opsgenie
description: "Wire BrowserBash Opsgenie alerts through monitor --notify so on-call engineers get paged only when a real user journey flips from passing to failing."
date: 2026-06-15
category: ci
---

If your on-call rotation lives in Opsgenie, you want browser checks to land there the same way a Datadog monitor or a Prometheus alert does: as a real alert with a priority, an owner, and an escalation policy. BrowserBash Opsgenie alerts do exactly that. You point `browserbash monitor` at a plain-English test, give it an Opsgenie webhook, and the tool pages your rotation only when a real user journey changes state, when login stops working, when checkout throws, when the dashboard stops loading. No cron wrapper, no glue script, no separate synthetic-monitoring vendor. This guide walks through wiring `monitor --notify` into an Opsgenie webhook, what the on-call payload looks like, how to control noise, and where this fits alongside your existing alerting stack.

## Why route browser checks into Opsgenie at all

Most teams already have uptime pings. A `200 OK` on your homepage tells you the server is up. It tells you nothing about whether a user can actually log in, add an item to the cart, and reach the confirmation page. Those multi-step flows are where revenue lives and where the nastiest regressions hide, because they only break when three or four systems interact in production.

BrowserBash exists to validate exactly those flows. You write an objective in plain English, an AI agent drives a real Chrome browser step by step (no selectors, no page objects), and you get back a deterministic verdict plus structured results. That verdict is the thing worth paging on. When the "can a customer check out" test flips from passing to failing at 2am, you do not want it buried in a Slack channel nobody reads until standup. You want Opsgenie to wake the person who owns checkout.

Opsgenie is built for that: alert deduplication, priority-based routing, on-call schedules, escalation if the first responder does not ack. Feeding it a browser-level signal turns a synthetic check into a first-class incident source. The BrowserBash side of this is deliberately thin. Monitor mode emits a JSON payload on a state change, and Opsgenie's inbound integrations accept exactly that shape. You are connecting two systems that already speak the same language.

## How BrowserBash monitor mode works

Before wiring anything into Opsgenie, understand what monitor mode actually does, because its behavior is the whole reason the alerts stay useful.

`browserbash monitor <test|objective> --every 10m --notify <webhook>` runs a check on an interval. The critical detail: it alerts **only on pass-to-fail and fail-to-pass transitions**, in both directions, never on every green run. If your checkout test passes every ten minutes for a week, Opsgenie hears nothing. The moment it fails, you get one alert. When it recovers, you get one recovery alert. That is the entire noise-control model, and it maps cleanly onto how you want an incident tool to behave.

This matters because the fastest way to get an alerting integration ignored is to fire on every successful run. Opsgenie has dedup rules, but you should not lean on them to hide a firehose. Monitor mode does the deduplication upstream by only speaking when reality changes.

There is a second reason monitor mode is practical to run continuously: the replay cache. A green run records its actions, and the next identical run replays them with zero model calls. The AI agent only steps back in when the page actually changed. So an always-on monitor is nearly token-free in steady state. You are not burning inference budget every ten minutes to confirm that login still works, you are replaying a known-good script and only paying for intelligence when something looks different.

To learn the broader monitor and alerting model beyond Opsgenie, the [BrowserBash features overview](https://browserbash.com/features) lays out how monitor mode, the replay cache, and the deterministic verdict fit together.

## Setting up the Opsgenie inbound webhook

On the Opsgenie side you need an inbound integration that accepts a POST and turns it into an alert. Opsgenie's API integration gives you a webhook URL and an API key. The exact menu path in the Opsgenie UI is under Settings and Integrations, and it is not publicly specified here beyond that, so follow Opsgenie's current documentation for creating an "API" integration and copying its URL.

What you care about is the endpoint. Opsgenie's alert API accepts a JSON body with fields like `message`, `alias`, `priority`, `description`, and `tags`. The `alias` field is the deduplication key: two alerts with the same alias collapse into one open alert, which is exactly what you want so a flapping test does not create fifty separate incidents.

Here is the mental model for the mapping:

| BrowserBash concept | Opsgenie field | Why it matters |
| --- | --- | --- |
| Test name / objective | `message` | The alert title your on-call sees first |
| Test identifier | `alias` | Dedup key so repeated failures stay one alert |
| Verdict (fail vs recover) | open vs close action | Fail opens, pass-again closes |
| `summary` from the verdict | `description` | The human-readable reason it failed |
| Severity you assign | `priority` (P1 to P5) | Routes to the right escalation policy |
| Suite or team tag | `tags` | Filters and routing rules in Opsgenie |

BrowserBash sends a raw JSON payload to any non-Slack webhook (Slack incoming-webhook URLs get Slack-specific formatting automatically; everything else receives the raw JSON). Opsgenie is a non-Slack target, so it receives the raw verdict JSON. In many setups you will want a thin transform in front of Opsgenie (an Opsgenie webhook integration, an AWS Lambda, or a small serverless function) that reshapes the BrowserBash payload into Opsgenie's exact field names and sets priority. That transform is where you encode team-specific policy: which tests are P1, which are P3, which team owns which alias.

## Wiring monitor --notify into Opsgenie

With the webhook URL in hand, the command is short. Point monitor at your checkout test, run it every five minutes, and send state changes to the Opsgenie endpoint.

```bash
# Install once
npm install -g browserbash-cli

# Monitor a committed test file and page Opsgenie on state changes
browserbash monitor ./.browserbash/tests/checkout_test.md \
  --every 5m \
  --notify "https://api.opsgenie.com/v2/alerts?apiKey=YOUR_INTEGRATION_KEY"

# Or monitor a one-off plain-English objective directly
browserbash monitor "Log in as {{user}}, add a laptop to the cart, and reach the order confirmation page" \
  --every 10m \
  --notify "$OPSGENIE_WEBHOOK_URL"
```

Keep the real webhook URL and API key out of your shell history and out of any committed file. Put them in an environment variable or your secret manager and reference `$OPSGENIE_WEBHOOK_URL`. If your test uses secret-marked variables like a password, BrowserBash masks them as `*****` in every log line, so credentials do not leak into the alert body or your terminal scrollback.

For a monitored flow that needs a logged-in session, save the login once and reuse it so the monitor is not re-authenticating from scratch every interval:

```bash
# Log in once, interactively, and save the session
browserbash auth save prod-user --url https://app.example.com/login

# Reuse that saved session on the monitor
browserbash monitor ./.browserbash/tests/dashboard_test.md \
  --auth prod-user \
  --every 5m \
  --notify "$OPSGENIE_WEBHOOK_URL"
```

The [BrowserBash tutorials](https://browserbash.com/tutorials) cover saved logins and monitor mode in more depth if you want a fuller walkthrough of the auth-save flow.

## What the on-call payload looks like

When the test flips, monitor mode POSTs a JSON payload describing the transition. The shape carries the essentials an on-call engineer needs to triage without opening a laptop: which test, what direction it flipped, the verdict summary, and timing. Conceptually the fail event looks like this:

```json
{
  "event": "state_change",
  "from": "pass",
  "to": "fail",
  "test": "checkout_test",
  "status": "failed",
  "summary": "Add to cart succeeded but the order confirmation page never loaded; the pay button stayed disabled after 20s.",
  "duration_ms": 41200,
  "cost_usd": 0.00,
  "timestamp": "2026-06-15T02:11:44Z"
}
```

That `summary` is the money field. It is not a stack trace and not a bare "check failed", it is the agent's plain-English account of where the journey broke. Dropped into Opsgenie's `description`, it means the responder reads "the pay button stayed disabled" on their phone instead of a generic red X. That is the difference between an actionable page and a wake-up they resent.

When the test recovers, monitor sends the mirror event with `from: fail` and `to: pass`. Route that to Opsgenie's close-alert action keyed on the same `alias`, and your recovery auto-resolves the incident. Now your incident timeline in Opsgenie shows exactly when the flow broke and when it came back, with no human touching it.

Note the `cost_usd` field reads near zero on a cached run. That is the replay cache doing its job: the monitor replayed the recorded checkout actions without a model call, so the check cost effectively nothing. You only see a real cost when the page changed enough that the agent had to re-plan, which is also, not coincidentally, exactly when you are about to get an alert.

### Setting priority from the test

Opsgenie priority (P1 through P5) decides which escalation policy fires. You do not want checkout and a marketing-page check on the same priority. The cleanest pattern is to run separate monitors per criticality and route each through its own Opsgenie integration or transform that stamps the priority. Checkout and login go to a P1 integration that pages immediately; a secondary flow goes to a P3 integration that opens an alert without waking anyone at 3am. Because each `browserbash monitor` invocation is its own process, splitting by priority is just splitting by command, and each one can carry a distinct `--notify` URL.

## Controlling noise and flapping

A monitor that flaps, fails, recovers, fails again within one interval, is worse than no monitor, because it trains your rotation to ignore it. Three levers keep BrowserBash Opsgenie alerts trustworthy.

First, monitor mode already only fires on transitions, so a test that is genuinely down stays as one open alert rather than one alert per interval. Combined with a stable Opsgenie `alias`, a two-hour outage is a single incident, not twenty-four.

Second, write tests that fail for real reasons. If your objective depends on a third-party widget that is slow but not broken, you will get transient fails. Prefer deterministic `Verify` assertions where you can, because they compile to real Playwright checks (URL contains, text visible, a named button visible, element counts, a stored value equals) with no model judgment involved. A `Verify` pass means the condition actually held, and a fail comes with expected-versus-actual evidence, so you are alerting on a concrete gap, not on a model's mood.

Third, tune your interval to your recovery expectations. A five-minute interval on a checkout flow is reasonable. A thirty-second interval on a flow that legitimately takes twenty seconds is asking for false transitions. Give the flow room. The replay cache means a longer interval does not cost you much in coverage, because the check itself is cheap to run.

If you do see flapping, the fix is usually in the test, not the alerting. A `Verify` step that waits for the confirmation heading to be visible is far more stable than an agent-judged "did checkout work" that can be tricked by a slow spinner. The [BrowserBash learn hub](https://browserbash.com/learn) has guidance on writing assertions that hold up under production timing.

## A committed test that Opsgenie can trust

The most reliable monitored tests are committed `*_test.md` files with deterministic assertions, not one-off objectives typed at the prompt. Here is a testmd v2 file that seeds a cart via an API step (deterministic, no model), then verifies the UI through the browser:

```bash
# .browserbash/tests/checkout_monitor_test.md
```

```markdown
---
version: 2
auth: prod-user
---

# Checkout confirmation stays healthy

POST https://api.example.com/cart with body { "sku": "LAPTOP-13", "qty": 1 }
Expect status 201, store $.cartId as 'cart'

Go to https://app.example.com/cart/{{cart}}
Click the checkout button and complete the order with the saved payment method
Verify text "Order confirmed" is visible
Verify "Track your order" link is visible
```

In a testmd v2 file, steps execute one at a time against a single browser session. The API step seeds data with no model call, and the `Verify` lines compile to real Playwright checks. When you point `browserbash monitor` at this file, a failure means a specific assertion did not hold, and that specific reason travels into the Opsgenie `description`. One caveat to plan for: testmd v2 currently runs on the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible gateway, it does not yet run directly on Ollama or OpenRouter.

## Fitting this into CI and the wider stack

Monitor mode is the production-facing half of the story. The other half is catching regressions before they ship, and that belongs in CI. BrowserBash emits NDJSON in `--agent` mode with frozen exit codes (0 passed, 1 failed, 2 error or budget stop, 3 timeout), which slots into any pipeline without prose parsing. The official GitHub Action runs a suite on pull requests, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with the verdict table. Details live in the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

The clean division of labor: the GitHub Action gates merges so a broken checkout never reaches production, and `browserbash monitor` watches production so the flows that break because of data, infrastructure, or a third-party outage still page your rotation. Opsgenie sits at the end of that second pipe.

If you already page from other synthetic sources, BrowserBash does not ask you to rip anything out. It adds a browser-journey signal to the same Opsgenie rotation you already trust. You can tag its alerts (`source: browserbash`) so they filter cleanly in your Opsgenie alert views, and route them through the same on-call schedule and escalation policy as everything else.

### Where a dedicated synthetic vendor is still the better fit

Honesty matters more than a sales pitch here. If you need multi-region probes from a dozen geographic points of presence, per-region latency SLAs, and a hosted status page with historical uptime graphs, a purpose-built synthetic-monitoring vendor is the better tool, and you should use it. BrowserBash runs the browser wherever you run the command (your machine, a CI runner, a small always-on box), so global geographic distribution is on you to arrange.

Where BrowserBash wins is the authoring model and the cost. You write checks in plain English or commit them as readable `*_test.md` files, the same tests your team already reviews in pull requests, and the replay cache makes always-on monitoring nearly free. If your checks are more about "does this complex journey still work" than "what is my p99 latency from Frankfurt", BrowserBash into Opsgenie is a strong, cheap, open-source fit. Pick the tool that matches the question you are actually asking.

## Who this setup is for

This pattern fits a specific and common situation. You have a handful of business-critical flows (login, checkout, signup, the main dashboard) that absolutely must work in production. You already run Opsgenie for incident management. You want browser-level failures to page the right person automatically, with a readable reason, and you do not want to stand up or pay for a heavyweight synthetic-monitoring platform to get there.

It fits especially well for teams that already write BrowserBash tests for CI, because the same committed `*_test.md` file that gates your pull requests becomes the thing you monitor in production. One artifact, two jobs. It fits less well if your primary need is geographic latency measurement or a public status page, and it is not a replacement for infrastructure alerting on CPU, memory, or error rates, those signals come from your metrics stack, and BrowserBash rides alongside them as the "can a human actually use this" check.

The [BrowserBash pricing page](https://browserbash.com/pricing) is worth a look here: the CLI, engines, local dashboard, replay cache, and monitor mode all run on your machine and stay free, so the only cost of this Opsgenie setup is the inference you spend on the rare non-cached runs.

## A sensible rollout order

Start narrow. Pick your single most important flow, usually checkout or login, and get one monitor paging Opsgenie end to end. Verify the fail alert opens an incident and the recovery closes it. Confirm the `alias` dedups correctly by forcing a failure (point the test at a broken staging URL) and watching Opsgenie collapse repeated failures into one alert.

Once one flow is solid, add the next two or three, each as its own `browserbash monitor` process with its own priority routing. Split P1 flows (checkout, login) from P3 flows (a secondary report, a settings page) so your escalation policies match business impact. Commit the tests as `*_test.md` files so the checks are reviewable and versioned, not ad-hoc strings living in a systemd unit.

Finally, close the loop with CI. Run the same tests in the GitHub Action on pull requests so regressions are caught before merge, and keep the production monitors for everything CI cannot see (real payment providers, real data, real third-party dependencies). At that point you have coverage on both sides of the deploy, and Opsgenie is the single pane where a broken user journey becomes an actionable incident regardless of which side caught it.

## FAQ

### How do I send BrowserBash monitor alerts to Opsgenie?

Create an API integration in Opsgenie to get an inbound webhook URL, then run `browserbash monitor` with the `--notify` flag pointed at that URL. Monitor mode POSTs a JSON payload on every pass-to-fail and fail-to-pass transition, which Opsgenie turns into an alert (or closes an existing one on recovery). Keep the integration key in an environment variable rather than committing it, and consider a thin transform in front of Opsgenie to map the BrowserBash fields onto Opsgenie's exact `message`, `alias`, and `priority` fields.

### Will monitor mode spam my on-call rotation with alerts?

No. BrowserBash monitor mode only fires on state changes, so a test that passes every interval sends nothing, and a test that is genuinely down sends one alert rather than one per interval. Pair that with a stable Opsgenie `alias` so repeated failures dedup into a single open incident, and route the recovery event to close that same alert. The most common cause of noise is a flaky test, not the alerting, so prefer deterministic Verify assertions over agent-judged checks for anything you page on.

### Does running an always-on BrowserBash monitor cost a lot in model usage?

In steady state it is nearly free. The replay cache records a green run's actions and replays them with zero model calls on the next identical run, so confirming that login still works every five minutes does not spend inference. The AI agent only steps back in and incurs cost when the page actually changed, which tends to be the same moment you are about to get an alert anyway. The `cost_usd` field in the payload reflects this and typically reads near zero on cached runs.

### Can I still use BrowserBash in CI if I am monitoring production with it?

Yes, and that is the recommended setup. Use the official GitHub Action to run your test suite on pull requests so regressions are caught before they merge, and use `browserbash monitor` to watch production for failures that only appear with real data or third-party dependencies. The same committed `*_test.md` file works for both jobs, so you author each critical flow once and get pre-merge gating plus production paging into Opsgenie from a single artifact.

Wiring browser-journey failures into your on-call rotation takes one command once the Opsgenie webhook exists. Install the CLI with `npm install -g browserbash-cli`, save your login, and point `browserbash monitor --every 5m --notify` at your Opsgenie integration URL. Everything that matters here runs locally and stays free, so you can prove the whole flow on your own machine before touching production. If you want the optional hosted dashboard and 15-day run retention, create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up), though an account is entirely optional and the monitor works without one.
