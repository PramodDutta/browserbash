---
title: Send Browser Test Alerts to Slack, Discord, and Teams
description: "Wire slack discord test alerts into your pipeline with BrowserBash monitor mode and run-all --notify, including webhook payload formatting."
date: 2026-07-30
category: ci
---

A red build is only useful if someone actually sees it. If your browser tests run on a schedule or in CI and the verdict lands in a log file nobody opens, you have monitoring in name only. This guide shows you how to send Slack, Discord, and Teams test alerts straight from BrowserBash, the free open-source natural-language browser automation CLI, using monitor mode with `--notify` and the parallel `run-all` orchestrator. You write a plain-English objective, an AI agent drives a real Chrome browser, and a webhook fires the moment the verdict changes so the right channel hears about it in seconds.

The setup is deliberately small. There is no bot to register, no OAuth dance, no cloud account to create. You paste an incoming-webhook URL, BrowserBash figures out whether it is talking to Slack or something else, and it posts a formatted message. Everything below is grounded in what the CLI actually does today (version 1.5.1), including the exact rule for when an alert fires and what shape the payload takes.

## Why webhook alerts beat scraping CI logs

Most teams start by tailing CI output. It works until it does not. A scheduled Playwright job fails at 3 a.m., the log rotates, and the first anyone hears of it is a customer ticket at 9. The gap between "the test knew" and "a human knew" is where trust in your suite quietly dies.

Webhook alerts close that gap. An incoming webhook is a single HTTPS endpoint that Slack, Discord, and Microsoft Teams each expose. You POST JSON to it and a message appears in a channel. No polling, no API tokens with rotating scopes, no separate alerting service in the middle. BrowserBash treats that URL as a first-class output: give it a webhook and it will post the verdict for you.

The important design decision is restraint. BrowserBash monitor mode does not spam you on every green run. It alerts only on a state change, pass to fail or fail back to pass, in both directions. A suite that has been green for a week stays silent until something actually breaks, and then you get one message. When it recovers, you get one more. That is the difference between an alert channel people keep muted and one they trust.

If you are new to the tool, the [features overview](https://browserbash.com/features) and the [learn hub](https://browserbash.com/learn) are good starting points before you wire alerts into a real pipeline.

## Monitor mode: alerts on state change

Monitor mode is the core of the "always-on" story. You point it at a test file or a plain-English objective, tell it how often to run, and hand it a webhook.

```bash
browserbash monitor "Open https://app.example.com, log in, and confirm the dashboard loads" \
  --every 10m \
  --notify https://hooks.slack.com/services/T000/B000/XXXXXXXX
```

That command runs the objective every ten minutes. The `--every` flag accepts intervals like `30s`, `5m`, `1h`. On each cycle the agent drives a real browser, produces a deterministic verdict, and compares it to the previous cycle's result. If nothing changed, nothing is sent. If the verdict flipped, the webhook fires.

Two properties make this practical to leave running for weeks:

- **It only alerts on transitions.** Green to red sends a failure alert. Red to green sends a recovery alert. A long streak of the same result sends nothing. Your channel stays quiet until it matters.
- **The replay cache keeps it nearly token-free.** BrowserBash records the actions of a green run and replays them on the next identical run with zero model calls. The agent only steps back in when the page actually changed. An always-on monitor hitting a stable app therefore costs almost nothing in tokens, whether you are running a local Ollama model or a hosted one.

You can monitor a committed test file the same way, which is usually what you want for anything beyond a one-liner:

```bash
browserbash monitor ./.browserbash/tests/checkout_smoke_test.md \
  --every 15m \
  --auth prod-user \
  --notify https://discord.com/api/webhooks/000/XXXX
```

Here `--auth prod-user` reuses a saved login so the monitor does not have to re-authenticate every cycle. You save that session once with `browserbash auth save prod-user --url https://app.example.com/login`, log in by hand, press Enter, and the storageState is captured for reuse. That keeps a login-gated monitor honest without hardcoding credentials.

## How BrowserBash formats the webhook payload

This is the part people ask about most, so let me be precise about what leaves the machine.

BrowserBash inspects the notify URL. If it recognizes a **Slack incoming-webhook URL**, it applies Slack formatting automatically. That means the message body is shaped the way Slack expects, so the alert renders as a readable message in the channel rather than a wall of raw JSON. You do not add a flag or a template for this; passing a `hooks.slack.com` URL is enough.

For **any other URL**, BrowserBash posts the raw JSON payload. That is the deliberate fallback, and it is what makes Discord and Teams work. Both Discord and Microsoft Teams accept an incoming webhook and both can consume a JSON body. The raw payload carries the verdict data (status, a summary of what happened, timing) so your channel receives the substance of the alert even without vendor-specific formatting.

Here is the mental model as a table.

| Webhook target | URL pattern | What BrowserBash sends |
| --- | --- | --- |
| Slack | `hooks.slack.com/services/...` | Slack-formatted message, applied automatically |
| Discord | `discord.com/api/webhooks/...` | Raw JSON payload |
| Microsoft Teams | your Teams inbound webhook URL | Raw JSON payload |
| Any custom endpoint | any other HTTPS URL | Raw JSON payload |

A practical note on the raw-JSON targets: Discord and Teams each have their own opinions about message schemas. Discord's webhook accepts a `content` field for a plain message and an `embeds` array for richer cards. Teams historically expects a MessageCard or an Adaptive Card wrapper. Because BrowserBash sends the verdict payload as raw JSON to non-Slack URLs rather than a vendor-specific card, the cleanest integration for Discord and Teams is often to point the webhook at a tiny relay (a serverless function or a lightweight endpoint) that reshapes the JSON into that platform's preferred card format. Slack is the zero-config path; the others are "works out of the box for the data, prettier with a five-line adapter."

If you want the full structured verdict for a relay to consume, the same data BrowserBash reports through the [agent NDJSON interface](https://browserbash.com/tutorials) is the shape you are reshaping: a status, a summary, timing, and any assertions.

### What a state-change alert actually tells you

The value of the alert is not just "something broke." Because BrowserBash runs a real objective end to end, the failure alert reflects a real user path failing, not a flaky unit assertion. When your Slack channel lights up with a fail transition on the checkout monitor, you know a browser could not complete checkout, which is a very different signal from a 500 in a log. That is the whole point of using a browser-driving validation layer as your synthetic monitor.

## Suite-wide alerts with run-all --notify

Monitor mode is built for one target on an interval. When you have a folder of tests and you want a single alert for the whole run, `run-all` is the tool. It is the memory-aware parallel orchestrator: it discovers every `*_test.md` file in a directory, derives concurrency from your actual CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. Point it at a folder and hand it a webhook the same way.

```bash
browserbash run-all ./.browserbash/tests \
  --notify https://hooks.slack.com/services/T000/B000/XXXXXXXX \
  --junit out/junit.xml
```

The same URL-detection rule applies: a Slack webhook gets Slack formatting, everything else gets the raw JSON payload. The difference is scope. Instead of one objective's pass/fail transition, `run-all --notify` gives you a suite-level result you can drop into a CI channel after every pipeline run.

Because `run-all` already writes a `RunAll-Result.md` summary and JUnit XML, the webhook alert is the push half of a system whose pull half (artifacts, JUnit for your CI dashboard) is already covered. You get the instant ping in Slack and the durable record in your pipeline, from one command.

### Combining alerts with budgets and sharding

`run-all` carries the flags that make a big suite safe to run in CI, and they compose cleanly with `--notify`. Two are worth calling out.

Cost governance stops a runaway suite before it drains your token budget:

```bash
browserbash run-all ./.browserbash/tests \
  --budget-usd 2.50 \
  --notify https://hooks.slack.com/services/T000/B000/XXXXXXXX
```

Every run reports a `cost_usd` estimate drawn from a bundled per-model price table (unknown models get no estimate rather than a wrong one). With `--budget-usd 2.50`, once the suite crosses the budget the orchestrator stops launching new tests, reports the remainder as `skipped`, exits with code 2, and records the spend in `RunAll-Result.md` and the JUnit `<properties>`. Your Slack alert then reflects a budget-stopped run, which is a signal in itself.

Sharding splits a suite across parallel CI machines without coordination:

```bash
browserbash run-all ./.browserbash/tests --shard 2/4 \
  --notify https://hooks.slack.com/services/T000/B000/XXXXXXXX
```

`--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four machines each run their quarter and agree on the split without talking to each other. Each shard can post its own alert, or you can notify only from the coordinating job. If you also pass `--matrix-viewport 1280x720,390x844`, every test runs once per viewport, labeled in events, JUnit, and results, so a mobile-only failure is distinguishable in the alert data.

## A committable test worth alerting on

An alert is only as good as the test behind it. A flaky test that flips green-red-green will page you at random and train you to ignore the channel. BrowserBash gives you deterministic assertions so the pass/fail transition your webhook reports is grounded in a real check, not an LLM's mood.

`Verify` steps compile to actual Playwright checks with no model judgment: URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, or a stored value equals. A pass means the condition held. A fail arrives with expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. Verify lines that fall outside the supported grammar still run, agent-judged, and are flagged `judged: true` so you can tell deterministic checks from judged ones at a glance.

For a monitor you want to trust, lean on the deterministic side. Here is a testmd v2 file that seeds data through an API step and then verifies it through the UI, all in one browser session:

```bash
# checkout_smoke_test.md
---
version: 2
auth: prod-user
---

# Checkout smoke

POST https://api.example.com/orders with body {"item":"sku-42","qty":1}
Expect status 201, store $.id as 'orderId'

Open https://app.example.com/orders/{{orderId}}
Verify text "Order confirmed" is visible
Verify 'Pay now' button is visible
```

With `version: 2` frontmatter, steps execute one at a time against a single browser session. The API step (a deterministic `POST` with an `Expect status`) seeds an order and stores its id, and the `Verify` steps check it deterministically through the UI. Point monitor mode at that file and a fail transition means a real, checkable condition broke. One honest caveat: testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. For plain v1 objectives and Verify-only files, the local-model path is fully available.

## Choosing between monitor mode and run-all for alerts

Both send Slack, Discord, and Teams test alerts. They answer different questions.

| Question | Use | Alert scope |
| --- | --- | --- |
| Is this one critical flow up right now? | `monitor --every` | One target, state-change only |
| Did the whole suite pass in this pipeline run? | `run-all --notify` | Whole folder, per run |
| Is production checkout healthy around the clock? | `monitor` with `--auth` | Continuous synthetic check |
| Did my PR break any browser test? | `run-all` in CI, or the GitHub Action | Per pull request |

**Choose monitor mode** when you want synthetic monitoring: one or a few high-value flows watched continuously, alerting only when the state flips. It is the closest thing to an uptime check that actually drives your app like a user. The replay cache is what makes leaving it on affordable.

**Choose run-all --notify** when the trigger is a pipeline, not a clock. You already run the suite on every merge; adding `--notify` turns that existing run into a channel message without a second tool. Pair it with `--budget-usd` so cost is bounded and `--shard` so it scales across machines.

**Choose the GitHub Action** when the alert you want is a PR comment rather than a chat message. The action installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and `budget-usd`, and posts a self-updating verdict-table comment on the pull request. That is a different surface from a webhook, and for many teams the right one for code review. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) cover the setup.

These are not exclusive. A common shape is: the GitHub Action gates merges with a PR comment, `run-all --notify` posts nightly full-suite results to a QA channel, and a handful of `monitor` processes watch production login and checkout around the clock with alerts to an on-call channel.

## Wiring it into a real pipeline

A few patterns that hold up in practice.

**Route by severity, not by tool.** Send production monitors to an on-call channel that is allowed to page. Send suite results to a team channel people read during work hours. Because the notify target is just a URL per command, you control routing by choosing which webhook each invocation gets. No central config to manage.

**Keep secrets out of the objective.** BrowserBash masks secret-marked `{{variables}}` as `*****` in every log line, and the recorder never lets password fields leave the page (it sends a marker, and the generated step reads `Type {{password}} into ...`). That matters for alerts too: you do not want a failure summary echoing a credential into a Slack channel. Use variable templating and secret marking so the payload that hits the webhook is safe to read.

**Let the exit codes drive the pipeline, let the webhook drive the humans.** Agent mode emits NDJSON with stable exit codes: 0 passed, 1 failed, 2 error or infra or budget-stop, 3 timeout. Your CI gate should read those codes. The webhook is the human-facing layer on top, not a replacement for the machine-readable contract. Use both.

**Mind the model for hard flows.** Very small local models (around 8B and under) can be flaky on long multi-step objectives, which means more false pass-fail transitions and noisier alerts. The sweet spot for anything you are going to page on is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model. A stable agent is a quiet alert channel; a flaky one is a muted channel. When in doubt, back your most alert-worthy monitors with a stronger model and keep the throwaway checks on the cheap local path.

If you want to see the structured verdict the webhook is built on, or compare how teams wire this into CI, the [blog](https://browserbash.com/blog) and [case studies](https://browserbash.com/case-study) go deeper on real setups.

## Putting it together

The whole flow is three moving parts. A deterministic test (a `*_test.md` file with `Verify` steps, ideally testmd v2 for seeding plus checking). A runner that produces a verdict (`monitor` on an interval, or `run-all` on a pipeline). And a webhook that carries the result to where people are (Slack with automatic formatting, Discord and Teams with the raw JSON payload, optionally reshaped by a small relay). Monitor mode's state-change-only rule keeps the channel quiet until something real happens, and the replay cache keeps an always-on monitor from costing you tokens for standing still.

Start with one flow. Save a login, write a five-line Verify test, and run:

```bash
browserbash monitor ./.browserbash/tests/login_smoke_test.md \
  --every 10m \
  --auth prod-user \
  --notify https://hooks.slack.com/services/T000/B000/XXXXXXXX
```

Break the flow on purpose once to confirm the fail alert lands, fix it to confirm the recovery alert lands, and you have a synthetic monitor your team will actually trust. From there, add `run-all --notify` to your CI and let the two layers cover the interval and the pipeline between them.

## FAQ

### How do I send BrowserBash test alerts to Slack?

Pass a Slack incoming-webhook URL to `--notify` on either monitor mode or run-all, for example `browserbash monitor <test> --every 10m --notify https://hooks.slack.com/services/...`. BrowserBash recognizes the Slack URL and applies Slack formatting automatically, so the verdict renders as a readable channel message. There is no bot or OAuth setup, just the webhook URL.

### Does BrowserBash support Discord and Microsoft Teams webhooks?

Yes. For any URL that is not a Slack incoming webhook, BrowserBash posts the raw JSON verdict payload, which both Discord and Teams inbound webhooks can consume. The data (status, summary, timing) arrives intact. For platform-specific card formatting on Discord or Teams, point the webhook at a small relay that reshapes the JSON into that platform's preferred card schema.

### Will monitor mode alert me on every test run?

No. Monitor mode alerts only on a state change, pass to fail or fail back to pass, in both directions. A test that stays green sends nothing until it actually breaks, and then sends one alert; when it recovers you get one recovery alert. Combined with the replay cache, that makes an always-on monitor both quiet and nearly token-free.

### What is the difference between monitor --notify and run-all --notify?

Monitor mode watches one target on an interval and alerts only when its verdict flips, which suits continuous synthetic monitoring of a critical flow. `run-all --notify` runs a whole folder of tests in parallel and posts a suite-level result, which suits pipeline runs where you want one alert per CI execution. Both honor the same Slack-versus-raw-JSON payload rule, and many teams run both for different channels.

## Get started

Install the CLI with `npm install -g browserbash-cli`, save a login, and point `monitor --notify` at your Slack, Discord, or Teams webhook. Everything runs on your machine, defaults to free local models, and needs no account to send alerts. If you later want hosted retention and a shared dashboard, you can [sign up](https://browserbash.com/sign-up) (an account is optional).
