---
title: Pipe BrowserBash Failures Into Bugsnag
description: "A practical browserbash bugsnag integration guide: turn a failed production browser flow into a Bugsnag error event through a generic webhook."
date: 2026-06-17
category: ci
---

Your error tracker already knows when a 500 fires or a null reference blows up. What it does not know is that checkout has been silently broken for three hours because a third-party script changed the DOM and nothing threw. That is the gap a browserbash bugsnag integration closes. You point BrowserBash at a real user flow, let an AI agent drive a real browser through it every few minutes, and when the flow flips from pass to fail you turn that verdict into a first-class Bugsnag event that lands next to your application exceptions, with a stacktrace-shaped payload, a severity, and the exact objective that broke.

This is not a monitoring dashboard bolted onto your app. It is synthetic validation that reports through the same pipe your engineers already watch. In this guide you will wire `browserbash monitor` to a small webhook receiver, shape the payload into a Bugsnag error event, and make the alert fire only on state changes so your Bugsnag inbox stays signal, not noise. Everything here uses the free, open-source CLI, no account required to run it locally.

## Why route synthetic failures through Bugsnag at all

Most teams treat end-to-end failures and application errors as two separate worlds. Playwright or Cypress runs in CI, fails a job, and someone eventually notices a red pipeline. Meanwhile Bugsnag, Sentry, or your error tracker owns the real-time story of production health, complete with grouping, assignment, release tracking, and the on-call rotation that already reacts to it.

The problem with that split is latency and ownership. A CI failure on the main branch might be seen in ten minutes or in ten hours depending on who is looking. A Bugsnag event pages the right person now. If a broken login or a dead "Add to cart" button is a production incident, and it usually is, then it deserves the same routing as a backend exception.

A browserbash bugsnag integration gives you exactly that. BrowserBash runs the flow the way a user would, no selectors and no page objects, just a plain-English objective. When the objective fails, you convert the structured verdict into a Bugsnag event so it inherits everything your team already built: error grouping, severity tiers, Slack and PagerDuty forwarding, and the "mark as fixed on next release" workflow. You are not replacing Bugsnag. You are feeding it a class of failure it could never see on its own.

### What BrowserBash actually gives you to work with

Every BrowserBash run ends with a deterministic verdict and a structured result object. In agent mode the CLI emits NDJSON, one JSON event per line, and finishes with a `run_end` event that carries the fields you care about: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. The exit code tells the same story at the shell level: 0 passed, 1 failed, 2 error or infra or budget stop, 3 timeout. That contract is frozen, so anything you build on top of it will not break on the next release.

Those fields are exactly the raw material a Bugsnag event wants. `summary` becomes the error message. `status` and the exit code map to severity. `assertions` gives you expected-versus-actual evidence you can drop into metadata. You are doing structured-to-structured translation, not scraping console prose.

## The architecture in one picture

The flow has three moving parts, and only one of them is code you write.

1. BrowserBash runs a flow on an interval with `browserbash monitor` and calls a webhook when the pass or fail state changes.
2. A tiny webhook receiver (a serverless function or a ten-line Express handler) accepts that JSON and reshapes it into a Bugsnag error event.
3. Bugsnag ingests the event through its Notify API and does what it always does: group, alert, and route.

BrowserBash's monitor mode is the piece that makes this sane. It runs your test or objective every N minutes and alerts only on pass to fail and fail to pass transitions, in both directions, never on every green run. If a Slack incoming-webhook URL is detected it gets Slack formatting automatically; any other URL, including your Bugsnag-bound receiver, gets the raw JSON payload. That raw payload is what you want here, because you are going to transform it yourself.

There is a real cost benefit hiding in this design too. The replay cache means a green run records its actions and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. An always-on monitor is therefore nearly token-free while everything is healthy, and only spends model budget on the run where something broke. You can read more about how the engine and providers fit together on the [features page](https://browserbash.com/features).

## Step 1: write the flow as a test you trust

Before you alert on anything, you need a flow whose failures mean something. A flaky test that cries wolf will poison your Bugsnag inbox faster than no monitoring at all. Write the critical path as a committable `*_test.md` file with deterministic `Verify` steps so a fail is a real fail, not an AI judgment call.

Here is a login-and-dashboard smoke test. The plain-English steps let the agent drive, and the `Verify` lines compile to real Playwright checks (URL contains, text visible, a named button or heading visible) with no model in the loop.

```bash
# .browserbash/tests/prod-login_test.md
#
# Production login smoke test
#
# - Open https://app.example.com/login
# - Type {{email}} into the email field
# - Type {{password}} into the password field
# - Click the "Sign in" button
# - Verify: URL contains /dashboard
# - Verify: "Welcome back" heading visible
# - Verify: "Log out" button visible
```

Run it once by hand to make sure the verdict is honest before you ever schedule it:

```bash
browserbash testmd run .browserbash/tests/prod-login_test.md --agent
```

Because the `Verify` steps are deterministic, a pass genuinely means the conditions held, and a fail arrives with expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. That evidence is the difference between a Bugsnag event that says "login broke" and one that says "expected URL to contain /dashboard, actual URL was /login?error=locked". The second one saves your on-call thirty minutes. For more on writing tests this way, the [tutorials](https://browserbash.com/tutorials) walk through the grammar step by step.

### Handle the login without leaking a password

Production smoke tests almost always need to be authenticated. Rather than typing credentials on every run, save the session once and reuse it. The `auth save` command opens a browser, you log in by hand, press Enter, and BrowserBash stores the Playwright storageState.

```bash
browserbash auth save prod --url https://app.example.com/login
```

Then reference it on the monitor with `--auth prod`. If the saved profile does not cover the target origin, BrowserBash prints a warning rather than silently doing nothing, which is exactly the behavior you want before you trust an alert. Secret-marked variables are masked as `*****` in every log line, so nothing sensitive ends up in the payload you forward to Bugsnag.

## Step 2: stand up a webhook-to-Bugsnag receiver

BrowserBash sends raw JSON to any non-Slack webhook URL. Your receiver's only job is to translate that JSON into a Bugsnag event and POST it to the Bugsnag Notify API. Bugsnag's ingestion endpoint accepts a JSON body describing an event with an exception (message and stacktrace), a severity, and arbitrary metadata. The specifics of the Bugsnag Notify payload schema are documented by Bugsnag and are not reproduced in full here; treat the receiver below as the shape, and check Bugsnag's current API docs for the exact field names your account expects.

A minimal Node receiver looks like this. It maps the BrowserBash verdict onto a Bugsnag error event, sets severity from the status, and carries the assertion evidence as metadata.

```bash
# server.js  (run with: node server.js)
# Expects BUGSNAG_API_KEY in the environment.
```

```javascript
import express from "express";

const app = express();
app.use(express.json());

app.post("/browserbash-hook", async (req, res) => {
  const v = req.body; // the raw BrowserBash payload

  const event = {
    apiKey: process.env.BUGSNAG_API_KEY,
    payloadVersion: "5",
    notifier: { name: "browserbash-monitor", version: "1.5.1", url: "https://browserbash.com" },
    events: [
      {
        exceptions: [
          {
            errorClass: "SyntheticFlowFailure",
            message: v.summary || "BrowserBash flow failed",
            stacktrace: [],
          },
        ],
        severity: v.status === "failed" ? "error" : "warning",
        unhandled: true,
        metaData: {
          browserbash: {
            objective: v.objective || v.test,
            status: v.status,
            durationMs: v.duration_ms,
            costUsd: v.cost_usd,
            assertions: v.assertions,
            finalState: v.final_state,
          },
        },
      },
    ],
  };

  await fetch("https://notify.bugsnag.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  res.sendStatus(202);
});

app.listen(8787, () => console.log("listening on :8787"));
```

The design choice worth calling out: BrowserBash treats a failed test as a successful validation. The monitor did its job by detecting the break. So your receiver should always return 2xx to BrowserBash (here a 202), because the webhook delivery succeeding and the flow failing are two different things. Bugsnag is where the failure lives, not in a 500 from your hook.

### Grouping and deduplication

Bugsnag groups events by their error class and the top of the stacktrace. Because synthetic failures have no real stacktrace, decide your grouping deliberately. A good pattern is to set `errorClass` to a stable string per flow, for example `SyntheticFlowFailure:prod-login`, so every failure of the login smoke test collapses into one Bugsnag error you can assign and track across releases. If you instead want each distinct assertion failure grouped separately, encode the failing assertion into the error class. Either way, you control the grouping key, which is something the default backend-exception flow rarely gives you this cleanly.

## Step 3: point the monitor at the receiver

With the receiver deployed at a public URL, start the monitor. It runs the test on your chosen interval, keeps the pass or fail state between runs, and posts only when the state flips.

```bash
browserbash monitor .browserbash/tests/prod-login_test.md \
  --every 5m \
  --auth prod \
  --notify https://hooks.example.com/browserbash-hook
```

Because BrowserBash only fires on transitions, your Bugsnag inbox sees one event when login breaks and one event when it recovers, not one every five minutes for the entire outage. That recovery event, the fail to pass transition, is genuinely useful: you can auto-resolve the Bugsnag error or drop a note in the incident thread when synthetic checks go green again.

If you would rather run monitoring in CI on a schedule instead of a long-lived process, run the suite in a scheduled job and let the exit code drive the webhook. The [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) uploads JUnit and NDJSON artifacts and posts a verdict comment, and a scheduled workflow that runs every fifteen minutes plus a small "on failure, curl the receiver" step gives you the same Bugsnag routing without a server you have to keep alive.

## Mapping BrowserBash verdicts to Bugsnag severity

Not every non-pass is a page-someone incident. Use the exit code and status to set severity so Bugsnag routes appropriately. Here is a sane default mapping.

| BrowserBash outcome | Exit code | `run_end.status` | Bugsnag severity | Route |
| --- | --- | --- | --- | --- |
| Flow passed | 0 | passed | none (no event, or info on recovery) | auto-resolve |
| Assertion failed | 1 | failed | error | on-call, immediate |
| Infra or engine error | 2 | error | warning | triage queue |
| Timeout | 3 | timeout | warning | triage queue, watch for flake |
| Budget stop (suite) | 2 | skipped remainder | info | cost review, not an incident |

The reason to split these out is that a real assertion failure (exit 1) means the product is broken for users, while a timeout (exit 3) or an infra error (exit 2) often means the runner had a bad moment. Routing all of them at the same severity trains your team to ignore the tracker. Mapping exit 1 to `error` and the rest to `warning` keeps the page for the failures that actually hurt. BrowserBash's flaky detection and previously-failed-first ordering in the orchestrator help you spot the difference over time.

### Enrich the event with cost and duration

Two fields make synthetic Bugsnag events unusually rich. `duration_ms` tells you whether the flow is degrading before it fully breaks, a login that used to take 4 seconds and now takes 18 is a warning sign worth a low-severity event. `cost_usd`, drawn from a bundled per-model price table, lets you sanity-check that an always-on monitor stays cheap; if a normally cached, near-zero-cost monitor suddenly reports real spend, the page changed enough that the agent had to step back in, which is itself a signal.

## When this integration is the right call, and when it is not

Be honest about the fit. A browserbash bugsnag integration is worth building when you already live in Bugsnag, when broken user flows should page the same people who handle exceptions, and when you want a small number of critical paths watched continuously between deploys. It shines for login, checkout, signup, search, and any flow where a silent DOM or third-party break produces no server error.

It is the wrong tool in a few cases, and pretending otherwise helps nobody.

- **You need full functional coverage of hundreds of paths.** Synthetic monitoring is for a handful of crown-jewel flows, not your entire regression suite. Run the big suite in CI with `run-all` and reserve the monitor for the flows whose failure is a production incident.
- **Your team does not use Bugsnag as an alerting hub.** If nobody watches the Bugsnag inbox and alerts route through, say, Datadog or Opsgenie, send the webhook there directly instead of laundering it through Bugsnag.
- **You want a hosted, zero-code monitor with a UI.** BrowserBash monitoring is a CLI and a webhook. If you need a polished synthetic-monitoring product with maps and SLA dashboards out of the box, a dedicated commercial tool may fit better. The tradeoff you get in return is that BrowserBash is free, open-source, and runs the exact same plain-English tests you already commit.
- **Tiny local models on hard flows.** Very small local models (around 8B and under) can be flaky on long multi-step objectives. For a production smoke test you want reliability, so use a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model for the harder flows. A flaky agent produces flaky alerts, and flaky alerts are worse than none.

If you are weighing this against other approaches, the [case study](https://browserbash.com/case-study) and [pricing page](https://browserbash.com/pricing) lay out where the hosted retention features add value versus what stays free forever.

## A fuller example: seed data, then verify through the UI

Smoke tests get sharper when you can set up state deterministically before the agent drives the browser. testmd v2 lets you mix deterministic API steps with plain-English UI steps in one file. Add `version: 2` to the frontmatter and steps run one at a time against a single browser session. API steps seed data with no model involved; Verify steps check it through the real UI.

```bash
# .browserbash/tests/order-flow_test.md
#
# ---
# version: 2
# auth: prod
# ---
#
# Create an order via API, confirm it renders in the account UI.
#
# - POST https://api.example.com/orders with body {"sku":"A-100","qty":1}
# - Expect status 201, store $.id as 'orderId'
# - Open https://app.example.com/account/orders
# - Verify: text visible {{orderId}}
# - Verify: "Order confirmed" text visible
```

Now the failure semantics are precise. If the API step returns the wrong status, that is a backend problem and the event should say so. If the API returns 201 but the order never renders in the UI, that is a frontend or data-propagation break, and the Bugsnag event carries the exact stored `orderId` that failed to appear. One caveat to weave into your planning: testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway, and it does not yet run on Ollama or OpenRouter directly. For pure smoke tests without API seeding, a v1 file on a local model is the cheaper path.

## Keeping the Bugsnag inbox clean over time

A monitoring integration lives or dies on signal quality. A few habits keep it healthy.

Quarantine flaky flows fast. BrowserBash's memory store flags flaky tests and orders previously-failed and slowest-first, so you can spot a flow that fails intermittently before it spams Bugsnag. Pull a chronically flaky flow out of the alerting monitor and fix the test, or the product, first.

Use recovery events. Because the monitor fires on both directions of the state change, wire the fail-to-pass event to auto-resolve the matching Bugsnag error. An incident that opens and closes itself with a clean timeline is far more useful than a stuck "still failing?" ticket nobody updates.

Set severity by consequence, not by convenience. The mapping table above is a starting point, not gospel. If your signup flow breaking is a revenue emergency and your search flow breaking is a minor annoyance, encode that in the severity your receiver sets, not in how loudly you shout in Slack.

Keep secrets out of metadata. BrowserBash masks secret-marked variables in logs, but your receiver is your code. Do not copy the raw request body into Bugsnag metadata without confirming credentials, tokens, and personal data are stripped first. A convenience blob in metadata is a great way to leak a session cookie into your error tracker.

If you want to go deeper on the engine internals, replay cache behavior, and provider options, the [learn hub](https://browserbash.com/learn) collects the conceptual docs in one place.

## FAQ

### Does BrowserBash have a native Bugsnag integration?

Not as a built-in connector. BrowserBash speaks a generic webhook: `browserbash monitor --notify <url>` posts the raw JSON verdict to any non-Slack URL. You add a small receiver that reshapes that JSON into a Bugsnag Notify API event. That thin layer is deliberate, because it lets the same monitor feed Bugsnag, Opsgenie, Datadog, or anything else that accepts a webhook, without BrowserBash needing a bespoke plugin per vendor.

### Will monitor mode spam Bugsnag on every run?

No. Monitor mode alerts only on state changes, both pass to fail and fail to pass, never on every green run. During a healthy stretch it stays quiet, and the replay cache keeps those healthy runs nearly token-free. When the flow breaks you get one event, and when it recovers you get one recovery event you can use to auto-resolve the Bugsnag error. Your inbox tracks transitions, not heartbeats.

### How do I set the right Bugsnag severity for a failed flow?

Map it from the BrowserBash exit code and status inside your receiver. Treat an assertion failure (exit code 1, status failed) as an error worth paging, and treat timeouts (exit 3) or infra errors (exit 2) as warnings that go to a triage queue, since those often mean the runner had a bad moment rather than the product being broken. Carry the `assertions` evidence and `duration_ms` into Bugsnag metadata so on-call sees expected-versus-actual detail immediately.

### Can I run this in CI instead of a long-running process?

Yes. Instead of a persistent `browserbash monitor`, run the suite in a scheduled CI job, read the exit code (0 passed, 1 failed, 2 error, 3 timeout), and post to your Bugsnag receiver on failure. The GitHub Action already uploads JUnit and NDJSON artifacts and posts a verdict comment, so a scheduled workflow plus a small on-failure step gives you Bugsnag routing without keeping a server alive. The tradeoff is coarser timing, since you only check on the schedule rather than continuously.

Ready to wire your first synthetic failure into Bugsnag? Install the CLI with `npm install -g browserbash-cli`, write one critical flow as a `*_test.md` file, and point a monitor at your receiver. An account is optional, everything above runs locally, and you can start free at [browserbash.com/sign-up](https://browserbash.com/sign-up).
