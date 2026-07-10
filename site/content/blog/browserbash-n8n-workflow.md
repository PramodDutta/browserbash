---
title: Orchestrate BrowserBash Alerts With an n8n Workflow
description: "Build a browserbash n8n workflow that receives monitor webhooks, branches on pass or fail, and routes alerts to Slack, PagerDuty, and Jira."
date: 2026-06-24
category: ci
---

A browserbash n8n workflow turns a plain-English browser check into a full incident pipeline. BrowserBash monitors a login flow, a checkout, or a signup page on a schedule, and the moment the verdict flips it fires a webhook. Self-hosted n8n catches that webhook, reads the structured verdict JSON, and branches: page a human on failure, close the incident on recovery, and stay silent while everything is green. You get the reliability of synthetic monitoring without paying a per-check SaaS bill, and every piece runs on hardware you control.

This guide walks through the whole thing. You will set up a BrowserBash monitor, point it at an n8n webhook, parse the payload, branch on pass versus fail, and fan the result out to Slack, an on-call tool, and a ticket tracker. Along the way I will show the actual commands, the real shape of the payload, and where this approach is a good fit versus where a hosted uptime tool would serve you better.

## Why pair BrowserBash with n8n

BrowserBash is an open-source, natural-language browser automation CLI. You write an objective in plain English, an AI agent drives a real Chrome browser through it step by step, and you get back a deterministic verdict plus structured results. There are no selectors to maintain and no page objects to refactor when a button moves. That makes it a strong fit for the kind of end-to-end check that flaps constantly under selector-based tooling: "log in, add an item to the cart, and confirm the total updates."

n8n is a self-hosted workflow automation engine. It listens on webhooks, runs code, calls APIs, and branches on conditions using a visual node graph. It is the glue layer that most teams already run for internal automation.

The pairing is clean because BrowserBash already speaks webhooks natively through its monitor mode, and it emits machine-readable JSON rather than prose. n8n is built to receive exactly that. You are not writing a custom bridge service, just connecting two tools where one produces a verdict and the other decides what to do with it.

There is a second reason this combination is attractive. BrowserBash defaults to free local models through Ollama, so nothing has to leave your machine and you do not need an API key to get started. Combine that with a self-hosted n8n instance and you have a monitoring stack with zero external SaaS dependencies and zero recurring cost. For teams with data-residency rules or a tight budget, that matters. You can read more about the model story on the [features page](https://browserbash.com/features).

## Install BrowserBash and prove the check works

Before you wire anything to n8n, get the underlying check passing on its own. A monitor is only as good as the objective it runs, so validate that first.

```bash
npm install -g browserbash-cli

# Confirm the flow works end to end before you schedule it
browserbash run "Go to https://app.example.com/login, log in with {{username}} and {{password}}, and confirm the dashboard heading is visible" --agent

# For authenticated flows, log in once and save the session to reuse
browserbash auth save prod-login --url https://app.example.com/login
browserbash run "Confirm the account dashboard loads and shows the current balance" --auth prod-login --agent
```

The `--agent` flag emits NDJSON, one JSON event per line on stdout, which is the format CI systems and coding agents consume. Exit codes are frozen and worth memorizing: `0` passed, `1` failed, `2` error or infrastructure or budget-stop, `3` timeout. When you see a `run_end` event with `status: "passed"` and a clean exit code 0, the check is trustworthy enough to schedule.

Saved logins use Playwright storageState under the hood, so the browser starts already authenticated. That keeps your monitor objective focused on the thing you actually care about (does the dashboard render) instead of re-driving the login form every interval. If you want the deeper walkthrough on auth profiles and variables, the [tutorials](https://browserbash.com/tutorials) cover them step by step.

## How monitor mode emits webhooks

Monitor mode is the engine behind this whole pipeline. It runs a test or an objective on an interval and alerts only on state changes, in both directions. It does not spam you on every green run, and it does not wait for you to notice a failure. It fires when pass flips to fail, and it fires again when fail flips back to pass.

```bash
browserbash monitor "Confirm https://app.example.com/checkout completes a test purchase" \
  --auth prod-login \
  --every 10m \
  --notify https://n8n.internal.example.com/webhook/browserbash
```

Three details make this practical for always-on use. First, the interval is yours: `--every 10m`, `--every 1h`, whatever cadence fits the flow. Second, the notify target is any URL. Slack incoming-webhook URLs get Slack-formatted messages automatically, and every other URL, including your n8n webhook, receives the raw JSON payload. That raw JSON is exactly what you want feeding a workflow engine. Third, the replay cache makes an always-on monitor nearly token-free. A green run records its actions, the next identical run replays them with zero model calls, and the agent only steps back in when the page actually changed. So a monitor that runs every ten minutes is not burning model budget every ten minutes. It replays the cached path and stays quiet.

Because monitor alerts fire only on transitions, your n8n workflow does not have to deduplicate a stream of identical "still failing" messages. Each webhook it receives is a genuine state change worth acting on.

## Build the n8n webhook receiver

On the n8n side, the entry point is a **Webhook** node. Create a new workflow, drop in a Webhook trigger, set the method to POST, and give it a path such as `browserbash`. n8n will show you the production URL, which looks like `https://n8n.internal.example.com/webhook/browserbash`. That is the exact URL you pass to `--notify`.

Activate the workflow so the production URL goes live. While building, n8n also gives you a test URL that captures a single execution, handy for inspecting the first real payload. Trigger a state change on purpose so a webhook actually fires, then look at what landed.

The payload BrowserBash sends carries the structured verdict. The fields you will branch on are the ones that come out of every run: `status` (passed or failed), a human-readable `summary`, the `final_state`, an `assertions` block, `cost_usd`, and `duration_ms`. There is also monitor context describing which check ran and which direction it flipped. Pin that sample execution in n8n so downstream nodes have a stable schema to map against while you build.

### Parse and normalize the payload

Right after the Webhook node, add a **Set** or **Code** node to normalize the fields you care about into a flat shape. This keeps every downstream node readable and protects you if the payload nests differently than you expect. A small Code node that pulls `status`, `summary`, the monitor name, and the previous state into top-level variables pays for itself the first time you edit the workflow six weeks later.

Normalizing here also gives you one obvious place to enrich the event: append a timestamp, attach the environment name, or compute a severity from the check name. Everything after this node reads clean, predictable fields.

## Branch on pass versus fail

The heart of a browserbash n8n workflow is the branch. Add an **IF** node (or a **Switch** node for more than two paths) after your normalizer, and route on `status`.

The two-path version is common:

- **Fail path**: status is `failed`. This is an incident. Open or update a ticket, page on-call, and post to the team channel with the summary and the failing assertion detail.
- **Recovery path**: status is `passed`. Because monitor mode only fires on transitions, a `passed` webhook after a failure means the thing that was broken is now working. Close the incident, resolve the page, and post an all-clear.

That second path is easy to forget and genuinely valuable. Plenty of monitoring setups shout when something breaks and then go silent, leaving humans to manually confirm recovery. Since BrowserBash fires on the fail-to-pass transition too, your workflow can auto-resolve. The IF node's two outputs map directly onto "declare incident" and "resolve incident," which is about as clean as branching logic gets.

If you want finer control, use a Switch node keyed on both `status` and the check name. A checkout failure might page immediately, while a marketing-page failure might only post to a channel. You are branching on real structured data, not scraping a status string out of a log line, so these rules stay reliable as you add checks.

### Route the fail path

On the fail branch, fan out to the tools your team already lives in:

1. **Slack or Teams**: post the check name, the `summary`, and the specific assertion that failed. Because the Verify assertions in BrowserBash carry expected-versus-actual evidence, you can surface "expected URL to contain /dashboard, actual was /login" directly in the message instead of a vague "check failed."
2. **PagerDuty or Opsgenie**: trigger an incident with a dedup key built from the check name, so repeated failures of the same check group into one incident rather than a storm.
3. **Jira or Linear**: create a ticket, or comment on an existing one, with the full `final_state` for the engineer who picks it up.

n8n runs these in parallel branches off the IF node's true output, each a standard app node with credentials you configure once.

### Route the recovery path

On the pass branch, mirror the fail actions in reverse. Resolve the PagerDuty incident using the same dedup key, post a green message to the same Slack thread, and transition the Jira ticket to Done or add a "resolved automatically" comment. The dedup key is what ties recovery back to the original incident, so choose it deliberately (the check name plus environment is a good default).

## Make the alerts richer with Verify assertions

A bare pass or fail is fine, but BrowserBash gives you more to work with, and threading it into your n8n workflow makes alerts far more actionable.

Deterministic Verify assertions compile plain-English checks into real Playwright conditions with no LLM judgment involved. A `Verify` step like "the 'Checkout' button is visible" becomes an actual visibility check. A pass means the condition held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block. When that block rides along in the webhook payload, your n8n Code node can loop over the assertions, find the one that failed, and put its expected and actual values straight into the alert.

That is the difference between an on-call engineer reading "checkout monitor failed" at 2am and reading "checkout monitor failed: expected order-confirmation heading visible, actual was payment-error banner." The second one starts the investigation for them.

To get that detail, drive your monitor off a committed test file rather than a one-line objective. A testmd v2 file (add `version: 2` frontmatter) executes steps one at a time against a single browser session and mixes deterministic API steps with UI verification. You point the monitor at the file the same way you point it at an objective: `browserbash monitor ./.browserbash/tests/checkout_monitor_test.md --auth prod-login --every 15m --notify <n8n-url>`. That file can seed data through an API step, then verify it through the UI, so the assertions that reach n8n are precise. Note the honest caveat: testmd v2 currently runs on the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. For a plain-objective monitor, local models are fine. For the richer v2 assertion flow, plan for the builtin engine.

## A worked example: checkout monitor to on-call

Here is the full shape of a real setup, end to end.

You have an e-commerce checkout that has broken twice this quarter without anyone noticing until a customer complained. You want a browserbash n8n workflow that catches the next break within fifteen minutes and pages the on-call engineer, then auto-resolves when a deploy fixes it.

**Step one**, save the login and write the test file. The test navigates to the product page, adds an item, proceeds to checkout, fills test payment details from masked variables, and includes a `Verify` step confirming the order-confirmation heading appears.

**Step two**, validate it once with a manual run and confirm exit code 0 and a passed verdict. Do not schedule a check you have not seen pass.

**Step three**, start the monitor with `--every 15m` pointed at your n8n webhook, as shown above.

**Step four**, in n8n: Webhook node, normalizer, IF node on `status`. On fail, a Code node extracts the failing assertion, a PagerDuty node triggers with dedup key `checkout-prod`, and a Slack node posts the detail. On pass, a PagerDuty node resolves `checkout-prod` and Slack posts recovery.

**Step five**, test the whole loop by temporarily pointing the monitor at a broken staging URL. Watch the fail webhook arrive, the page trigger, the Slack message land. Then fix it and watch the recovery fire. Only after you have seen both transitions do you trust the pipeline.

The payoff is that this now runs unattended and nearly for free. The replay cache keeps the every-fifteen-minutes cadence from costing model calls on green runs, and n8n sits idle until a real transition arrives. You are not paying a synthetic-monitoring vendor per check, and you are not maintaining brittle selectors that break on the next redesign. Teams describe similar tradeoffs in the [case studies](https://browserbash.com/case-study).

## Scaling to many checks

One monitor is a demo. A real deployment watches a dozen flows across a few environments. A few patterns keep that manageable.

**Use one n8n webhook for all monitors, branch inside.** Point every `--notify` at the same webhook path and let the Switch node route by check name. This keeps you from maintaining a separate workflow per check. The normalizer node reads the check name out of the payload, and the Switch decides severity and destination from there.

**Run suites, not just single objectives, from CI.** BrowserBash has a memory-aware parallel orchestrator that derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. For the scheduled deep sweep (as opposed to the lightweight always-on monitors), run the whole folder and shard it across machines:

```bash
browserbash run-all ./.browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

Sharding computes a deterministic slice on sorted discovery order, so parallel CI machines agree on who runs what without any coordination. The `--budget-usd` cap stops launching new tests once the suite crosses the budget, marks the rest as skipped, and exits 2, which protects you from a runaway bill if a model gets stuck in a loop. That JUnit output can feed a separate n8n workflow that summarizes suite health daily.

**Keep monitors and suites separate.** Monitors are for continuous, low-cost, state-change alerting on your most critical flows. Suites are for thorough coverage on a schedule or on every deploy. Wiring both into n8n gives you fast paging on the critical path and a broader daily health report.

## Where a hosted uptime tool fits better

Credibility matters more than hype, so here is the honest boundary. A browserbash n8n workflow is excellent when you are verifying real, multi-step user journeys that depend on your application actually working: login, checkout, search, onboarding. It shines when selectors would otherwise make your checks flaky, and when running everything on your own hardware is a requirement rather than a preference.

It is not the right tool for raw uptime pinging. If all you need is "is the homepage returning 200 from five regions every thirty seconds," a dedicated uptime service does that more cheaply and with global points of presence you would have to build yourself. BrowserBash drives a full browser through a real flow, which is heavier than an HTTP ping by design. Use the right tool for each job: an uptime pinger for liveness, a browserbash n8n workflow for "can a user actually complete the thing that makes us money."

There is also a model-capability caveat worth stating plainly. Very small local models (around 8B and under) can be flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows. Size the model to the complexity of the flow.

| Use case | BrowserBash + n8n | Hosted uptime tool |
| --- | --- | --- |
| Multi-step user journey (login, checkout) | Strong fit, no selectors to maintain | Limited or requires scripting add-ons |
| Raw HTTP liveness from many regions | Overkill, heavier than needed | Purpose-built, cheaper |
| Self-hosted, data stays on your hardware | Yes, local models plus self-hosted n8n | Usually not, it is a SaaS |
| Alert on both break and recovery | Built in, transitions both directions | Varies by vendor |
| Recurring cost | Near zero with replay cache | Per-check subscription |

The point is not that one wins. They solve different halves of the problem, and a mature setup often runs both.

## Putting it all together

The recipe is short once you have seen it. Install the CLI, save an auth profile, validate the objective with a manual run, then start a monitor with `--every` and `--notify` pointed at an n8n webhook. In n8n, receive the webhook, normalize the fields, branch on `status`, and fan out to Slack, on-call, and tickets on both the fail and the recovery paths. Enrich the alerts with the Verify assertion detail, and scale by funneling every monitor into one webhook while keeping heavier suite runs on a separate scheduled workflow.

Because BrowserBash is open source under Apache-2.0 and n8n is self-hostable, the entire pipeline can run without a single external SaaS dependency and without recurring per-check fees. That is a rare combination in synthetic monitoring, and it is the main reason to reach for this pattern. The full source lives on [GitHub](https://github.com/PramodDutta/browserbash) if you want to see how the monitor and webhook layers work.

## FAQ

### What data does a BrowserBash monitor send to an n8n webhook?

When you point `--notify` at a non-Slack URL like an n8n webhook, BrowserBash sends the raw structured verdict JSON. That includes the status (passed or failed), a human-readable summary, the final_state, an assertions block with expected-versus-actual evidence, and cost and duration figures. Because monitor mode only fires on pass-to-fail and fail-to-pass transitions, each webhook your n8n workflow receives represents a real state change rather than a routine green run.

### Do I need an API key to run a BrowserBash monitor for n8n?

Not for basic objectives. BrowserBash defaults to free local models through Ollama, so a plain-English monitor can run entirely on your machine with nothing leaving it. You only need an Anthropic key or a compatible gateway if you use testmd v2 files, which run on the builtin engine, or if you deliberately choose a hosted model for a complex multi-step flow. For simple checks feeding an n8n workflow, local models with no key are a fine starting point.

### How do I stop my n8n workflow from getting spammed with repeated failure alerts?

You largely get this for free. BrowserBash monitor mode alerts only on state changes in both directions, so it does not send a webhook on every failing run, only when the check first flips to failing and again when it recovers. Inside n8n, add a dedup key built from the check name when you trigger PagerDuty or Opsgenie so repeated incidents group together, and use that same key on the recovery path to auto-resolve.

### Can a BrowserBash n8n workflow auto-resolve incidents when a check recovers?

Yes, and this is one of the strongest reasons to use it. Because monitor mode fires on the fail-to-pass transition as well as pass-to-fail, your n8n IF node can branch a passed webhook into a recovery path. That path resolves the PagerDuty incident using the original dedup key, posts an all-clear to Slack, and transitions the ticket to done, so recovery is handled automatically instead of a human confirming it by hand.

Ready to build your own pipeline? Install the CLI with `npm install -g browserbash-cli`, wire a monitor to your n8n webhook, and let the branch logic handle the rest. An account is optional and everything runs locally, but if you want the hosted dashboard and 15-day retention you can [sign up here](https://browserbash.com/sign-up).
