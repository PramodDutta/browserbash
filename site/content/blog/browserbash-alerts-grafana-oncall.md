---
title: Alert Grafana OnCall When a Flow Breaks
description: "A BrowserBash Grafana OnCall integration guide: route monitor alerts into escalation chains so a broken checkout or login pages the right engineer fast."
date: 2026-06-21
category: ci
---

A synthetic check is only as useful as the human it eventually reaches. If your checkout flow breaks at 3am and the alert lands in a Slack channel nobody watches until standup, you did not really have monitoring, you had a delayed log entry. This is where a BrowserBash Grafana OnCall integration earns its keep: you run a plain-English browser test on an interval, and the moment the flow flips from pass to fail, the alert enters a real escalation chain that pages a human, waits for acknowledgement, and climbs to the next responder if nobody answers.

BrowserBash is the free, open-source (Apache-2.0) validation layer for AI agents, built by The Testing Academy. You write an objective in English, an AI agent drives a real Chrome browser step by step, and you get back a deterministic verdict. Its monitor mode already knows how to fire a webhook on state changes. Grafana OnCall already knows how to turn a webhook into an escalation policy. The job of this guide is to wire the two together cleanly, so a failing login or a stalled payment page does exactly what an on-call rotation is designed to handle.

## Why route synthetic failures into an escalation chain

Most teams start with a monitor that posts to a chat channel. That works right up until the failure happens outside working hours, or the channel is noisy, or the one person who understands the checkout service is on holiday. Chat is a broadcast. An escalation chain is a contract: this alert will be acknowledged by someone, and if it is not acknowledged in N minutes, it becomes someone else's problem automatically.

Grafana OnCall gives you that contract. It ingests alerts through an integration webhook, groups them, and runs them through an escalation policy you define: notify the primary on-call engineer, wait five minutes, notify the secondary, wait ten more, notify the whole team, and optionally trigger a phone call. When you feed BrowserBash monitor results into that pipeline, your end-to-end user journeys get the same seriousness as a CPU-saturation alert or a 500-error spike.

The distinction that matters for synthetic monitoring is signal quality. A browser flow that runs every few minutes will occasionally hiccup for reasons that resolve on their own. If every green-to-red blip pages a human, people learn to ignore the pager, which defeats the entire purpose. BrowserBash monitor mode is built to avoid exactly that noise, and Grafana OnCall gives you a second layer of grouping and routing on top. Together they let a real regression cut through while a one-off network stutter stays quiet.

## How BrowserBash monitor mode decides to alert

Monitor mode is a single command. You point it at a test file or a plain-English objective, set an interval, and give it a webhook to notify.

```bash
browserbash monitor "Open https://shop.example.com, add the first product to the cart, and confirm the cart shows 1 item" \
  --every 10m \
  --notify https://your-grafana-oncall-webhook-url
```

The critical design choice: monitor mode alerts **only on state changes, in both directions**. It does not fire on every failing run and it does not fire on every green run. If the flow was passing and now fails, you get one alert. If it was failing and now recovers, you get one alert. A flow that stays red across ten consecutive checks pages you once, not ten times. That behavior is what makes it safe to plug straight into an escalation policy without drowning your on-call rotation.

There is a second reason this is cheap to run continuously. BrowserBash has a replay cache: a green run records the actions the agent took, and the next identical run replays those recorded actions with zero model calls, stepping the AI back in only when the page actually changed. An always-on monitor therefore spends almost no tokens while the flow stays healthy, and only re-engages the model when something is genuinely different. You are paying real inference cost at roughly the rate at which your product changes, not the rate at which the clock ticks.

### What the alert payload actually contains

When monitor mode fires, it sends a structured JSON payload. Slack incoming-webhook URLs get Slack-formatted messages automatically. Every other URL, including a Grafana OnCall integration endpoint, receives the raw JSON. That raw payload is what you will map into an OnCall alert. It carries the verdict status, a human-readable summary of what the agent observed, the final state of the page, any assertion results, a cost estimate, and the run duration. Because it is plain JSON rather than prose, you never have to parse a sentence to know whether the check passed.

## Setting up the Grafana OnCall side

Grafana OnCall models incoming alerts around **integrations**. An integration is an endpoint with a unique URL, a set of templates that turn an inbound payload into a readable alert, and an escalation chain that decides who gets notified and when. The pieces you need to create are straightforward, and none of them require BrowserBash to know anything about Grafana internals.

Start by creating a new integration of the generic webhook type inside Grafana OnCall. This gives you a unique HTTP endpoint. That endpoint URL is exactly what you pass to `--notify`. From BrowserBash's point of view, it is just a webhook that accepts JSON, which is all monitor mode needs.

Next, attach an escalation chain to that integration. A sane starting chain for a synthetic checkout monitor looks like this:

1. Immediately notify the primary on-call engineer via push and SMS.
2. If not acknowledged within five minutes, notify the secondary.
3. If not acknowledged within fifteen minutes total, notify the team channel and optionally start a phone call.
4. Auto-resolve the alert group when a recovery signal arrives.

That last point matters. Because BrowserBash sends a state-change alert in both directions, you can wire the recovery alert to resolve the OnCall alert group automatically, so a recovered flow closes its own incident without a human clicking anything.

### Mapping the payload into readable alerts

Grafana OnCall integrations use Jinja2 templates to render inbound payloads into a title, a message, and grouping and routing keys. Because the BrowserBash payload is predictable JSON, the templates are short. You map the run status to determine whether the alert is firing or resolved, you use the summary field as the alert title, and you use the test name or objective as the grouping key so repeated failures of the same flow collapse into a single alert group rather than spawning a new incident every ten minutes.

A useful pattern is to route by severity based on which flow broke. A failed login or a failed payment is a page-someone-now event. A failed cosmetic check, like a marketing banner not rendering, might route to a low-urgency chain that only notifies during business hours. Grafana OnCall's routing templates let you branch on any field in the payload, so you decide the urgency from the content of the BrowserBash verdict.

## A concrete end-to-end example

Say you run an e-commerce site and the two flows that must never silently break are login and checkout. You want both monitored every ten minutes, both feeding Grafana OnCall, and you want login to page harder than checkout because a broken login blocks everyone.

First, capture the flows as committable Markdown tests rather than long inline strings. A `*_test.md` file is version-controlled, reviewable, and reusable across your monitor, your CI suite, and your local runs. Here is a checkout test using deterministic Verify assertions so the pass condition is not left to model judgment:

```bash
browserbash monitor ./tests/checkout_test.md \
  --auth shopper \
  --every 10m \
  --notify https://your-grafana-oncall-webhook-url \
  --agent
```

Two flags there deserve attention. `--auth shopper` reuses a saved login session, so the monitor does not have to re-authenticate from scratch on every single run. You capture that session once with `browserbash auth save shopper --url https://shop.example.com/login`, log in by hand, press Enter, and BrowserBash stores the Playwright session state. Every later run reuses it. The `--agent` flag emits NDJSON, one JSON event per line, which is handy if you also want to tee the monitor output into your own log pipeline alongside the OnCall webhook.

The checkout test itself might look like this in `checkout_test.md`, using Verify steps that compile to real Playwright checks rather than agent guesses:

```
# Checkout smoke test

- Open https://shop.example.com
- Search for "wireless keyboard" and open the first result
- Add the product to the cart
- Go to the cart and proceed to checkout
- Verify: "Order summary" heading visible
- Verify: text "Total" visible
```

Each `Verify` line becomes a deterministic assertion. A pass means the condition genuinely held on the page. A fail arrives with expected-versus-actual evidence attached to the verdict, which flows straight through into the OnCall payload so the paged engineer sees not just that checkout broke but roughly where.

### Running the login monitor with tighter routing

The login monitor uses the same shape but a different Grafana OnCall integration URL, one whose escalation chain is more aggressive. You do not need any BrowserBash-side difference beyond the `--notify` target. All the urgency logic lives in Grafana:

```bash
browserbash monitor ./tests/login_test.md \
  --every 5m \
  --notify https://your-grafana-oncall-login-webhook-url
```

Because monitor mode only alerts on transitions, running login every five minutes does not mean twelve alerts an hour. It means zero alerts while login works, one alert the moment it breaks, and one alert when it recovers. The five-minute interval simply means you learn about a break within five minutes rather than ten.

## Keeping the alert stream trustworthy

The fastest way to ruin an on-call rotation is a flaky monitor that cries wolf. A few practices keep the BrowserBash Grafana OnCall integration honest.

**Prefer deterministic Verify assertions over open-ended judgment.** When your pass condition is "the order summary heading is visible" compiled to a real Playwright check, a pass and a fail both mean something precise. When your pass condition is a vague English sentence the model interprets, you invite borderline verdicts that flap between runs. Use Verify steps for the conditions that decide whether you get paged, and reserve free-form agent steps for navigation.

**Pick a capable model for the flows that page people.** BrowserBash is Ollama-first and defaults to free local models, which is perfect for development and for low-stakes checks. Be honest with yourself, though: very small local models, around 8B parameters and under, can be flaky on long multi-step objectives. For a monitor that will page a human at 3am, use a mid-size local model in the 70B class (Qwen3 or Llama 3.3 sized) or a capable hosted model. A flaky model produces flaky verdicts, and flaky verdicts produce a pager everyone mutes.

**Let Grafana group by flow.** Set the OnCall grouping key from the test name so ten failing checkout runs during a real outage collapse into one alert group with one escalation, not ten separate incidents. The state-change behavior already prevents repeated alerts for a stuck-red flow, and grouping is a belt-and-suspenders second layer if you ever run overlapping monitors.

**Auto-resolve on recovery.** Wire the recovery alert to close the OnCall alert group. When the deploy that broke checkout gets rolled back, the next green run sends a state-change alert in the recovery direction, and OnCall marks the incident resolved without anyone touching it.

## Comparing your alerting options

There is more than one way to get a BrowserBash failure in front of a human. Grafana OnCall is a strong choice when you already run Grafana or want a full escalation-policy engine, but it is worth seeing the trade-offs plainly.

| Destination | Best for | Escalation logic | Setup effort |
| --- | --- | --- | --- |
| Grafana OnCall | Teams already on Grafana who need true escalation chains and on-call schedules | Full: multi-step, acknowledgement, auto-resolve, phone calls | Moderate: create integration, templates, chain |
| Slack incoming webhook | Small teams, working-hours coverage, quick visibility | None built in; relies on humans watching | Minimal: paste webhook, auto-formatted |
| Generic webhook to your own service | Custom routing, ticket creation, in-house tooling | Whatever you build | High: you own the receiver |
| PagerDuty or Opsgenie via webhook | Teams standardized on those platforms | Full, in that platform's model | Moderate: similar to OnCall |

BrowserBash treats all of these the same way from its side: a `--notify` URL that receives JSON, with Slack getting special formatting and everything else getting the raw payload. That means switching destinations, or fanning out to several, is a configuration change on your side rather than a BrowserBash feature you have to wait for. If you outgrow Slack, you point `--notify` at a Grafana OnCall integration and your escalation policy takes over, with no change to the test itself.

### When Grafana OnCall is the right call, and when it is not

Choose Grafana OnCall when you already operate Grafana, when you have an on-call rotation with schedules and acknowledgement expectations, and when a broken user journey deserves the same treatment as an infrastructure alert. The escalation-policy engine is the whole point: acknowledgement tracking, automatic climb to the next responder, and phone-call fallback for the flows that genuinely cannot wait.

Do not reach for it if you are a two-person team that lives in Slack during business hours and simply wants to see when checkout breaks. For that, a Slack webhook is less setup and perfectly adequate, and BrowserBash formats it for you automatically. The honest answer is that escalation policies are overhead, and overhead is only worth it when the cost of a missed alert is high. Match the machinery to the stakes.

## Fitting the monitor into a broader CI and validation setup

A monitor is one use of BrowserBash, not the whole story. The same `*_test.md` files you point a monitor at can run in your CI pipeline on every pull request, which means the flow that pages your on-call rotation in production is the exact flow you validated before merge. That symmetry is valuable: you are not maintaining two separate definitions of "checkout works."

In CI you would run the suite in parallel with the memory-aware orchestrator, optionally sharded across machines and capped by a spend budget:

```bash
browserbash run-all ./tests \
  --shard 2/4 \
  --budget-usd 2.00 \
  --junit out/junit.xml \
  --agent
```

The suite discovery is deterministic on sorted order, so four CI machines each running a different shard agree on the split without coordinating. The budget flag stops launching new tests once the suite crosses the limit, reports the rest as skipped, and exits with a clear code. If you standardize on the official GitHub Action, the same suite runs on every pull request and posts a self-updating verdict comment, so a regression that would eventually page your on-call rotation instead gets caught at review time. You can read the details in the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), and the broader [feature list](https://browserbash.com/features) covers how the pieces fit together.

BrowserBash also runs as an MCP server, which is relevant if AI coding agents are part of your workflow. An agent can call `run_test_file` or `run_suite` over the Model Context Protocol and read the structured verdict directly, treating BrowserBash as its validation layer before it declares a task done. That is a different consumer of the same tests than a human on a pager, but it reinforces the same principle: one source of truth for what "working" means, consumed by CI, by agents, and by your monitor.

If you want to go deeper on writing good plain-English objectives and Markdown tests, the [tutorials](https://browserbash.com/tutorials) walk through the patterns, and the [learn section](https://browserbash.com/learn) covers the engine and provider model. The point for this article is narrow and practical: the test you monitor should be the test you trust, and the alert it produces should reach a human through a chain you designed on purpose.

## Putting it all together

The wiring is not complicated once you see the shape of it. BrowserBash monitor mode runs your flow on an interval, decides to alert only when the verdict actually changes, and posts a JSON payload to a webhook. Grafana OnCall receives that payload on a dedicated integration endpoint, renders it into a readable alert with a couple of short templates, groups it by flow, and runs it through an escalation policy that pages the right person and climbs if they do not answer. The replay cache keeps the always-on monitor nearly free, and deterministic Verify assertions keep the verdicts precise enough to trust at 3am.

Start small. Pick the one flow whose breakage would ruin your day, capture it as a Markdown test, point a monitor at a Grafana OnCall integration URL, and define a two-step escalation chain. Watch it stay quiet while the flow is healthy, then break the flow on purpose in staging and confirm the page arrives and the recovery resolves it. Once you trust one flow end to end, adding the next is a copy of the command with a different test file. A worked [case study](https://browserbash.com/case-study) shows the pattern in a fuller setting if you want to see it at scale.

## FAQ

### How do I connect BrowserBash to Grafana OnCall?

Create a generic webhook integration inside Grafana OnCall, which gives you a unique endpoint URL. Then run BrowserBash monitor mode with that URL passed to the `--notify` flag and an interval set with `--every`. Monitor mode posts a JSON payload to that endpoint whenever the flow changes state, and OnCall's templates and escalation chain take it from there. No BrowserBash-side plugin is required because the whole integration is just a webhook that receives JSON.

### Will monitor mode spam my on-call rotation with alerts?

No, because monitor mode only fires on state changes, in both directions. A flow that stays failing across many consecutive checks pages you exactly once, not once per run, and a recovery sends a single resolve alert. You can add a second layer of protection by setting the Grafana OnCall grouping key from the test name so repeated failures collapse into one alert group. The design goal is that a page always means something genuinely changed.

### Do I need a paid model or API key to run a monitor?

Not necessarily. BrowserBash is Ollama-first and defaults to free local models with no API keys, so nothing leaves your machine by default. That said, very small local models under about 8B parameters can be flaky on long multi-step flows, so for a monitor that will page a human you should use a mid-size local model in the 70B class or a capable hosted model. The replay cache also means a healthy monitor spends almost no inference cost because it replays recorded actions until the page actually changes.

### Can I use the same tests in CI and in the monitor?

Yes, and you should. The same committable `*_test.md` file can run in your CI pipeline on every pull request through the run-all orchestrator or the GitHub Action, and also power your production monitor. Keeping one definition of the flow means the check that pages your on-call rotation is the exact check you validated before merging. It also lets AI coding agents call the same tests over the MCP server as their validation layer.

Ready to route your first broken flow into an escalation chain? Install the CLI with `npm install -g browserbash-cli`, capture the one flow you cannot afford to lose, and point a monitor at your Grafana OnCall integration. An account is optional and everything runs locally, but if you want the free cloud dashboard and 15-day retention you can [sign up here](https://browserbash.com/sign-up).
