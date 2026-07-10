---
title: Wire BrowserBash Monitors Into Better Stack
description: "A practical browserbash better stack integration guide: turn monitor mode pass/fail flips into Better Stack incidents over a webhook."
date: 2026-06-20
category: ci
---

A browserbash better stack integration closes a gap that plain uptime checks leave wide open. Better Stack (Uptime) can already tell you when your homepage returns a 200. What it cannot tell you on its own is whether a real user can log in, add an item to the cart, and reach the confirmation screen. BrowserBash monitor mode drives a real Chrome browser through that flow in plain English, and when the flow flips from pass to fail, it fires a webhook. Point that webhook at Better Stack and every broken user journey becomes a first-class incident with the same on-call routing, escalation, and paging you already trust for infrastructure.

This guide walks through the whole path: what BrowserBash monitor mode actually does, how Better Stack incidents get created from an inbound webhook, the exact command to wire them together, and the design decisions that keep the pipeline quiet until something genuinely breaks. It is written for someone who runs on-call and does not want another noisy alert source.

## Why uptime pings miss the failures that page you

Classic synthetic monitoring checks a URL and a status code. That catches the server being down. It does not catch the failures that actually cost you money, because most of those failures return a perfectly healthy 200.

A checkout that spins forever after the pay button returns 200. A login form that silently rejects valid credentials after an auth deploy returns 200. A search box that renders but returns zero results returns 200. A cookie banner that traps focus and blocks the primary CTA returns 200. Your HTTP monitor is green through every one of these, and your first signal is a support ticket or a drop in the revenue graph.

The fix is to test the journey, not the endpoint. You need something that opens the page, types into fields, clicks buttons, waits for the right screen, and decides pass or fail the way a person would. That is exactly what BrowserBash does. You describe the flow in plain English, an AI agent drives a real browser step by step with no selectors and no page objects, and you get back a deterministic verdict. Monitor mode runs that verdict on a schedule and tells you the moment it changes.

Better Stack is a strong home for those signals because it already owns the parts that are genuinely hard: incident lifecycle, on-call schedules, escalation policies, acknowledgement, and paging across Slack, email, SMS, and phone. There is no reason to rebuild any of that. You just need to hand Better Stack a well-shaped event when a journey breaks, and another when it recovers.

## How BrowserBash monitor mode works

Monitor mode is one command that wraps a run and repeats it on an interval:

```bash
browserbash monitor "Open https://shop.example.com, log in as {{user}}, \
  add the blue running shoes to the cart, and confirm the cart shows 1 item" \
  --every 10m \
  --notify https://uptime.betterstack.com/api/v1/incoming-webhook/YOUR_TOKEN
```

Three behaviors matter for a clean Better Stack integration.

First, monitor mode alerts only on state changes, in both directions. It does not fire on every green run. If the journey passed last cycle and passes this cycle, nothing is sent. The webhook fires when the flow flips from pass to fail, and again when it flips from fail back to pass. That property is the whole reason this integration stays quiet: Better Stack receives one event when the incident starts and one when it resolves, not a message every ten minutes.

Second, the payload shape depends on the destination. Slack incoming-webhook URLs get Slack-formatted messages automatically. Every other URL, including a Better Stack incoming webhook, receives the raw JSON payload. That raw JSON is what you map into a Better Stack incident, and it carries the fields you care about: the status, a human summary, and timing.

Third, the replay cache keeps the cost near zero. A green run records its actions, and the next identical run replays them with no model calls, stepping the agent back in only when the page actually changed. An always-on monitor that mostly passes therefore costs almost nothing to run, which means you can afford a tight interval on your most important flows. You can read more about the model and cost story on the [features page](https://browserbash.com/features).

### A test file instead of an inline objective

Inline objectives are fine for a quick check, but for anything you care about, put the flow in a committable `*_test.md` file and monitor that. You get version control, code review, and reuse across `run`, `run-all`, and `monitor`.

```bash
browserbash monitor ./.browserbash/tests/checkout_test.md \
  --every 5m \
  --auth shop-prod \
  --notify https://uptime.betterstack.com/api/v1/incoming-webhook/YOUR_TOKEN
```

The `--auth shop-prod` flag reuses a saved login so the monitor does not have to log in from scratch every cycle. You capture that session once with `browserbash auth save shop-prod --url https://shop.example.com/login`, log in by hand, press Enter, and the Playwright storageState is stored for reuse. If the saved profile does not cover the start URL, BrowserBash prints a warning instead of silently doing nothing, which saves you from a monitor that quietly tests a logged-out page forever.

## Setting up the Better Stack side

Better Stack Uptime can create incidents from an inbound signal. The exact menu labels and the precise webhook URL format are configured inside your Better Stack workspace and are not fully public, so treat the URLs in this article as placeholders and copy the real one from your own dashboard. The general shape holds regardless of small UI differences.

You have two reasonable patterns, and which one you pick changes how the BrowserBash `--notify` URL is used.

### Pattern A: incoming webhook to raise an incident

Better Stack can expose an incoming webhook that creates or updates an incident from a JSON body. This is the most direct match for monitor mode, because monitor mode already sends raw JSON to any non-Slack URL. You create the webhook integration in Better Stack, copy its URL, and pass it straight to `--notify`. When the checkout flow breaks, BrowserBash posts the failure JSON, Better Stack opens an incident, and your on-call escalation policy takes over.

The one thing to verify is field mapping. Better Stack needs to know which part of the incoming JSON is the incident title and which is the description. If Better Stack lets you configure how inbound fields map to incident fields, point the title at the summary field and the description at the full payload so the responder sees the plain-English flow and the verdict in one place.

### Pattern B: heartbeat monitor with inverted logic

If your Better Stack plan leans on heartbeats, you can invert the model. A heartbeat expects a regular ping and raises an incident when the ping stops. You would ping the heartbeat on every green run and stop pinging on failure. This is a weaker fit for BrowserBash monitor mode, because monitor mode is deliberate about only firing on state changes rather than on every green cycle, so a heartbeat that expects a steady stream of pings will not receive one. Pattern A (incident from an inbound event) matches monitor mode's design far better, and it is the one this guide recommends.

### A thin relay when you need to reshape the payload

Sometimes the raw BrowserBash JSON does not line up with what Better Stack wants field for field. When that happens, put a tiny relay in the middle: a small serverless function or a workflow tool that accepts the BrowserBash POST, reshapes it, and calls the Better Stack API. The relay is where you add anything Better Stack cannot infer from the raw body, such as a fixed service name, a severity, or a runbook link. Keep the relay stateless and boring. Its only job is to translate one JSON shape into another and forward it.

## The end-to-end wiring

Here is the full picture, start to finish, for a production checkout monitor feeding Better Stack.

Step one, save the login once so the monitor never has to type credentials into a shared log:

```bash
browserbash auth save shop-prod --url https://shop.example.com/login
```

Step two, write the journey as a committable test file at `./.browserbash/tests/checkout_test.md`. Use Verify steps so the pass or fail decision is a real Playwright check rather than a model's opinion:

```
# Checkout smoke

- Open https://shop.example.com
- Search for "blue running shoes"
- Click the first product result
- Add the product to the cart
- Open the cart

Verify: text "1 item" is visible
Verify: 'Checkout' button is visible
```

The plain-English steps run as a grouped agent block on the same browser session, and the two `Verify` lines compile to deterministic Playwright assertions (text visible, named button visible) with no LLM judgment. A pass means the conditions held. A fail arrives with expected-versus-actual evidence in the run's assertions and the `Result.md` table, which is exactly the detail you want attached to a Better Stack incident.

Step three, run it once by hand to confirm it is green and to warm the replay cache:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md --auth shop-prod
```

Step four, start the monitor pointed at your Better Stack webhook:

```bash
browserbash monitor ./.browserbash/tests/checkout_test.md \
  --every 5m \
  --auth shop-prod \
  --notify https://uptime.betterstack.com/api/v1/incoming-webhook/YOUR_TOKEN
```

From here the loop runs itself. Every five minutes the monitor replays the cached actions if nothing changed, or re-drives the flow with the agent if the page shifted. As long as checkout keeps working, Better Stack hears nothing. The first time a Verify assertion fails, BrowserBash posts the failure JSON, Better Stack opens an incident, and your escalation policy pages whoever is on call. When the underlying bug is fixed and the next cycle passes, BrowserBash posts the recovery event and Better Stack can auto-resolve the incident.

## Keeping it quiet: designing for signal, not noise

An alerting pipeline is only useful if people still trust it after a month. These are the choices that keep a BrowserBash-to-Better Stack link from becoming background noise everyone mutes.

**Monitor journeys, not pages.** Point monitors at the two or three flows that define your business: sign-up, login, checkout, the core create action of your product. A page that renders is not the same as a feature that works, and you want incidents that map to real user pain.

**Lean on state-change alerting.** Because monitor mode only fires on pass-to-fail and fail-to-pass transitions, a flow that flaps will not spray ten messages an hour at your on-call. You get the open event and the close event. If a specific flow is genuinely flaky rather than broken, that is a test-quality problem to fix at the source, not something to paper over with alert suppression.

**Use Verify assertions for the failure condition.** Agent-judged pass or fail is convenient, but for a monitor that pages a human, you want the verdict to be a deterministic Playwright check. `Verify: text "Order confirmed" is visible` either held or it did not. That removes model variance from the one decision that triggers a page, and it gives the responder concrete expected-versus-actual evidence instead of a vague "the agent thought it failed."

**Tune the interval to the flow's importance.** Checkout might justify every 5 minutes. A rarely used admin export might be fine at every hour. The replay cache means a tighter interval is cheap on a passing flow, but the interval also sets your detection latency, so match it to how fast you need to know.

**Attach context in the incident.** Whether through Better Stack field mapping or a thin relay, make sure the incident body carries the flow summary and the failing assertion. An on-call engineer who opens the incident and immediately sees "checkout smoke failed: expected text 'Order confirmed' visible, was not found" is halfway to a diagnosis before they touch a terminal.

## BrowserBash monitor mode versus native Better Stack browser checks

Better Stack has its own synthetic and browser-check capabilities, and it is worth being honest about where each tool is the better choice. This is not a zero-sum comparison. Many teams run both.

| Dimension | BrowserBash monitor mode | Better Stack native checks |
| --- | --- | --- |
| Where it runs | Your machine, CI, or your own box | Better Stack's hosted infrastructure |
| How you describe a flow | Plain English objective or `*_test.md` file | Configured in the Better Stack product |
| Multi-step user journeys | Core design: agent drives real Chrome step by step | Available; exact scripting model not detailed here |
| Cost model | Free, open-source CLI; replay cache keeps runs near token-free | Priced per your Better Stack plan (not covered here) |
| Incident lifecycle and paging | Delegated to Better Stack via webhook | Native and mature |
| Global probe locations | You provide the runner | Better Stack's global network |
| Source control of the test | Committable Markdown, code review, `@import` reuse | Configuration lives in the product |

The clean division of labor: let BrowserBash define and execute the deep, plain-English user journey, and let Better Stack own the incident, the on-call schedule, and the escalation. If all you need is a status-code ping from many geographic regions, Better Stack's native checks are the simpler answer and you may not need BrowserBash at all. If you need to prove that a human can actually complete a multi-step flow, that is where the journey-level test earns its place, and routing its verdict into Better Stack gives you the best of both.

## Going further: suites, budgets, and CI

Monitor mode is one runner in a larger toolbox. A few patterns extend the same Better Stack pipeline once you have more than one critical flow.

Run a whole folder of journeys in parallel with the memory-aware orchestrator, and cap spend so a runaway suite cannot surprise you on the bill:

```bash
browserbash run-all ./.browserbash/tests \
  --junit out/junit.xml \
  --budget-usd 2.00 \
  --shard 1/2
```

The orchestrator derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. The `--budget-usd 2.00` flag stops launching new tests once the suite crosses the budget, marks the rest as skipped, and exits with code 2 so CI notices. Sharding with `--shard 1/2` splits the suite deterministically across machines with no coordination needed, since the slice is computed on sorted discovery order.

For the CI half of the story, `--agent` mode emits NDJSON with clean exit codes (0 passed, 1 failed, 2 error, 3 timeout), so you never parse prose. Pair that with the official GitHub Action, which installs the CLI, runs the suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with the verdict table. The [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) covers the matrix and budget inputs. You can also expose the same runs to any AI coding agent over the Model Context Protocol with `browserbash mcp`, so Claude Code or Cursor can validate a change and read the structured verdict directly. The [tutorials](https://browserbash.com/tutorials) walk through both paths.

The mental model to hold onto: BrowserBash produces trustworthy verdicts about real user journeys, and everything downstream (Better Stack incidents, PR comments, CI gates, MCP tool calls) is just a different consumer of the same verdict. Wire the verdict once and reuse it everywhere. For a broader look at how teams structure these pipelines, the [blog](https://browserbash.com/blog) has more end-to-end examples.

## A realistic caveat before you ship it

Two honest limits are worth stating so you set this up with clear eyes.

BrowserBash runs where you run it. Unlike a hosted uptime provider with a global probe network, a monitor started on your laptop stops when your laptop sleeps. For a real always-on monitor, run it on a small always-up box, a CI cron, or a container, the same way you would host any long-lived process. That is a deployment decision, not a limitation of the tool, but plan for it.

And the model matters for hard flows. Very small local models (roughly 8B and under) can be flaky on long multi-step objectives. For a monitor that pages a human, use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, and lean on Verify assertions so the final pass or fail decision is a deterministic Playwright check rather than a model judgment call. Get those two things right and the browserbash better stack integration becomes a dependable early-warning system for the failures that plain pings never see.

## FAQ

### What is a browserbash better stack integration and why use one?

It is a webhook link between BrowserBash monitor mode and Better Stack Uptime. BrowserBash drives a real browser through a plain-English user journey on a schedule, and when the journey flips from pass to fail it posts a JSON event to a Better Stack incoming webhook, which opens an incident. You use it to catch broken user flows like checkout or login that return a healthy 200 status and slip past ordinary uptime pings, while still routing them through the on-call, escalation, and paging you already trust in Better Stack.

### Will BrowserBash monitor mode spam Better Stack on every run?

No. Monitor mode fires the webhook only on state changes, meaning a pass-to-fail transition or a fail-to-pass recovery, never on every green cycle. Better Stack receives one event when the incident begins and one when it resolves, so the pipeline stays quiet as long as the flow keeps working. This state-change behavior is the main reason the integration does not turn into background noise.

### Does the raw JSON payload work directly with Better Stack?

BrowserBash sends Slack-formatted messages to Slack webhook URLs and raw JSON to every other destination, including Better Stack. Whether the raw JSON drops straight into a Better Stack incident depends on how that workspace maps inbound fields, which is configured in your own dashboard and is not fully public. If the shapes do not line up, put a small stateless relay in the middle to reshape the payload and add fixed fields like a service name or severity before forwarding to the Better Stack API.

### Should I replace Better Stack's native browser checks with BrowserBash?

Not necessarily, and often you should run both. Better Stack owns incident lifecycle, global probe locations, and paging better than a self-hosted runner can, so keep it for those. Let BrowserBash define and execute the deep, plain-English, multi-step journeys and hand the verdict back to Better Stack over the webhook. If all you need is a status-code ping from many regions, Better Stack's native checks alone may be enough.

## Get started

BrowserBash is free and open-source under Apache-2.0. Install it with `npm install -g browserbash-cli`, save a login, write a `*_test.md` for your most important flow, and start a monitor pointed at your Better Stack webhook. An account is optional and everything can run entirely on your own machine, but if you want the hosted dashboard and cloud extras you can create one at [browserbash.com/sign-up](https://browserbash.com/sign-up). Turn your worst user-journey failures into incidents your on-call already knows how to handle.
