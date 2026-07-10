---
title: Send Broken-Flow Signals to Rollbar From BrowserBash
description: "A browserbash rollbar integration that forwards monitor failures to Rollbar as items via a small webhook bridge, so broken user flows page you like real errors."
date: 2026-06-16
category: ci
---

If your Rollbar dashboard shows a clean green wall of nothing while your checkout page has been throwing a blank screen for six hours, you already know the gap. A browserbash rollbar integration closes it by turning a broken user flow into a first-class Rollbar item, the same kind of item you already triage, assign, and resolve. BrowserBash drives a real Chrome browser through a plain-English objective, decides pass or fail, and when a scheduled monitor flips from green to red you forward that state change into Rollbar through a tiny webhook bridge. No new dashboard to babysit, no second on-call rotation, no separate synthetic-monitoring vendor.

Rollbar is built to catch exceptions your code throws. It is very good at that. What it does not see is the failure that throws no exception at all: a payment button that silently does nothing, a login that spins forever, a search box that returns an empty page because a third-party script changed. Those flows fail from the user's chair while every server log stays quiet. BrowserBash is the piece that watches from the user's chair, and this article shows you how to wire its verdicts into the error tracker your team already lives in.

## Why route BrowserBash failures into Rollbar at all

Most teams already have Rollbar (or Sentry, or Bugsnag) open on a second monitor. That is the point. The value of a browserbash rollbar integration is not a shiny new surface, it is the absence of one. When a synthetic check for "user can add to cart and reach the payment step" fails, you want it to land exactly where your backend 500s land, with the same severity levels, the same assignment rules, the same Slack routing you already configured months ago.

There is a real difference between the two failure classes, and naming it honestly matters:

- **Rollbar-native failures** are exceptions your application code raised. A stack trace, a request id, a line number. Rollbar is purpose-built for these.
- **Flow failures** are behavioral. The page rendered, the server returned 200, and the user still could not finish the task. No exception exists to catch. Traditional error tracking is structurally blind here.

BrowserBash produces the second kind of signal. It executes a task the way a person would, then emits a deterministic verdict. Feeding that verdict into Rollbar means your error tracker finally covers both columns, and your team learns one triage habit instead of two.

Worth being straight about the overlap: if you only care about server-side exceptions, you do not need this at all, Rollbar's SDK already covers you. This integration earns its keep specifically when the failure is invisible to code and only visible to a browser. Keep that boundary in mind so you do not over-build.

## What BrowserBash gives you before any webhook

Before you think about Rollbar, get a passing check locally. BrowserBash is a free, open-source (Apache-2.0) command-line tool. You install it once and describe what a healthy flow looks like in plain English.

```bash
npm install -g browserbash-cli

browserbash run "Open https://shop.example.com, search for 'wireless mouse', \
  add the first result to the cart, and confirm the cart shows 1 item" \
  --agent --headless --timeout 120
```

The `--agent` flag switches output to NDJSON, one JSON event per line, so nothing downstream has to parse prose. The exit code is the contract your bridge will rely on later: `0` passed, `1` failed, `2` error or infra problem, `3` timeout. Those codes are frozen and safe to build automation against.

By default BrowserBash is Ollama-first. It looks for a local model before it looks for any API key, so nothing has to leave your machine to get a first green run. If you have no local model it walks the chain: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat worth planting early: very small local models (roughly 8B and under) get flaky on long multi-step flows. For a monitor you intend to trust at 3am, use a mid-size local model in the Llama 3.3 70B class or a capable hosted model. The [features overview](https://browserbash.com/features) walks through the engine and provider choices in more detail.

### Turn the objective into a committable test

A one-off `run` is fine for a smoke test, but a monitor should point at a file you can review in a pull request. BrowserBash tests are Markdown, with `{{variables}}` templating and a `Verify` grammar that compiles to real Playwright checks instead of asking a model to judge.

```markdown
# Checkout reaches payment

- Open {{BASE_URL}}
- Search for "wireless mouse"
- Add the first result to the cart
- Go to the cart and start checkout

Verify: 'Payment' heading is visible
Verify: url contains "/checkout/payment"
```

Those two `Verify` lines are deterministic. A pass means the condition actually held, and a fail arrives with expected-versus-actual evidence in the `run_end.assertions` block and the generated `Result.md`. That precision is what makes the Rollbar item you eventually create trustworthy: you are forwarding a checked fact, not a vibe. The [testmd guide in the docs](https://browserbash.com/tutorials) covers the full assertion grammar.

## Monitor mode: the signal you actually forward

You do not forward every run. You forward *state changes*. BrowserBash monitor mode runs a test or objective on an interval and fires only when the verdict flips, green to red or red back to green, in both directions. It stays quiet on every ordinary passing run, which is exactly the behavior you want from anything that pages a human.

```bash
browserbash monitor ./tests/checkout_payment_test.md \
  --every 10m \
  --notify https://bridge.example.com/browserbash-to-rollbar
```

Two things make this cheap to leave running. First, the replay cache: a green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. An always-on monitor is therefore nearly token-free between incidents. Second, monitor mode's edge-triggered alerting means your bridge receives a payload only on transitions, so Rollbar never fills with duplicate noise.

The `--notify` target is any HTTP endpoint. If you point it straight at a Slack incoming-webhook URL, BrowserBash formats the message for Slack automatically. Any other URL receives the raw JSON payload, and that raw JSON is exactly what your Rollbar bridge wants to read.

### What the monitor sends

On a transition, BrowserBash POSTs a JSON body describing the run: the status, a human summary, the final state, the assertion results, and timing. Your bridge reads those fields and reshapes them into Rollbar's item format. The key insight is that a red transition maps cleanly to a Rollbar item at `error` or `critical` level, and a recovery transition (red back to green) maps to a resolving or `info` signal you can use to auto-close.

## Building the webhook bridge

Rollbar does not ingest arbitrary webhooks as items directly. Its Items API expects a specific payload shape and an access token. So the bridge is a small function, twenty or thirty lines, that sits between BrowserBash's `--notify` POST and Rollbar's `POST /api/1/item/` endpoint. You can run it as a serverless function, a tiny Express route, or a Cloudflare Worker. Nothing about it is BrowserBash-specific beyond reading the payload.

Here is the shape of what the bridge does, described as steps rather than a specific framework:

1. Receive the BrowserBash monitor POST.
2. Read `status` from the body. If it is `failed`, `error`, or `timeout`, build a Rollbar item. If it is `passed` and the previous state was red, optionally emit a resolve signal.
3. Map severity: a hard `failed` flow becomes `critical`, an infra `error` becomes `error`, a `timeout` becomes `warning` (it may be a slow network rather than a true break).
4. Compose the Rollbar item body: a title like `Broken flow: checkout reaches payment`, the summary text, the failing assertion's expected-versus-actual, and a `fingerprint` derived from the test name so repeat failures group into one item instead of spawning a new one every ten minutes.
5. POST to `https://api.rollbar.com/api/1/item/` with your `X-Rollbar-Access-Token`.

The `fingerprint` field is the piece people forget. Without it, a monitor firing every ten minutes during a two-hour outage would create twelve separate Rollbar items. Set the fingerprint to a stable hash of the test name plus the failing assertion, and Rollbar collapses the whole incident into a single item with an occurrence count. That is the difference between a useful alert and a self-inflicted flood.

### A worked field mapping

This table is the contract between the two systems. Build your bridge to honor it and your Rollbar items will read like they were native from day one.

| BrowserBash field | Rollbar item field | Notes |
| --- | --- | --- |
| `status: failed` | `level: critical` | A real user-facing flow break |
| `status: error` | `level: error` | Infra or provider problem, not the app |
| `status: timeout` | `level: warning` | Could be slow network, verify before paging |
| `summary` | `body.message.body` | The human-readable one-liner |
| `assertions[].expected/actual` | `body.message.body` (appended) | The evidence that makes triage fast |
| test file name | `fingerprint` | Stable hash so repeats group into one item |
| `duration_ms` | `custom.duration_ms` | Useful for spotting creeping slowness |
| `cost_usd` | `custom.cost_usd` | Track spend per incident if you use a hosted model |

Because monitor mode is edge-triggered, you will usually see one create on the red transition and one update (or resolve) on recovery. If you also want the raw run data archived, BrowserBash writes a `Result.md` after every run and can keep history in its local store, so Rollbar does not have to be your system of record for the full trace.

## Wiring it into CI, not just a standalone monitor

A monitor is one deployment model. The other is running the same tests inside your pipeline so a bad deploy never reaches the monitor in the first place. BrowserBash ships a GitHub Action and a memory-aware parallel runner, and both emit the same NDJSON and exit codes your bridge already understands.

```bash
# Run a whole folder of flow tests in CI, sliced across machines,
# with a spend ceiling so a stuck run can't burn your budget.
browserbash run-all ./tests \
  --shard 2/4 \
  --budget-usd 2.00 \
  --junit out/junit.xml \
  --agent
```

`--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four parallel CI machines agree on who runs what without any coordination. `--budget-usd` stops launching new tests once the suite crosses the ceiling: the remainder are reported `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. That exit `2` flows through your bridge exactly like a monitor error would, so a budget stop can page you too if you want it to.

The reason this matters for a Rollbar integration: CI failures and monitor failures are the same signal at different times. A checkout test that fails in the pipeline is a bug caught pre-merge, and the same test failing in monitor mode is a regression caught in production. Routing both into Rollbar through one bridge gives you a single timeline of "when did this flow break" regardless of where it broke. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) cover the action's inputs, artifact uploads, and the self-updating PR comment it posts.

### Reusing a logged-in session

Most flows worth monitoring live behind a login. Re-authenticating on every ten-minute monitor run is slow and, with some providers, rate-limited. BrowserBash saves a real browser session once and reuses it.

```bash
browserbash auth save shopadmin --url https://shop.example.com/login
# log in by hand, press Enter, the session is saved

browserbash monitor ./tests/dashboard_loads_test.md \
  --auth shopadmin \
  --every 15m \
  --notify https://bridge.example.com/browserbash-to-rollbar
```

The saved session is a Playwright storageState profile. If a profile's saved origins do not cover the test's start URL, BrowserBash prints a warning instead of silently doing nothing, which saves you the classic "my monitor was green but actually logged out" false sense of safety. That honesty is deliberate: a validation layer that lies about its own coverage is worse than no layer.

## When Rollbar is the right target, and when it is not

Be balanced here, because the wrong tool choice is a slow tax you pay forever.

**Route BrowserBash into Rollbar when** your team already triages errors in Rollbar, you want flow failures to inherit your existing severity and assignment rules, and you would rather extend one workflow than run a second monitoring product. This is the strongest case, and it is common.

**Point `--notify` straight at Slack instead when** you just want a channel ping and nobody is going to formally triage the alert as an item. BrowserBash formats Slack webhooks automatically, so you skip the bridge entirely. There is no reason to stand up a Rollbar bridge for a signal that only ever needs to reach a chat channel.

**Reach for a dedicated synthetic-monitoring vendor when** you need multi-region probing from dozens of geographic points of presence, sub-minute intervals across hundreds of endpoints, or contractual SLA reporting. BrowserBash monitor mode is honest, cheap, and browser-real, but it is not pretending to be a global probe network. If that is your requirement, a specialist tool is the better fit and you should use it.

**Keep using Rollbar's SDK alone when** every failure you care about already throws an exception. If your app surfaces its own errors reliably, a browser-driven flow check adds cost without adding coverage. Add BrowserBash only for the flows that fail silently.

The point of laying this out plainly is that credibility beats hype. A browserbash rollbar integration is a sharp tool for one specific job: making invisible flow breaks visible in the tracker you already trust. Do not stretch it into jobs other tools do better.

## A realistic end-to-end setup

Here is how the pieces fit for a small team shipping a commerce app.

You write three tests: `checkout_payment_test.md`, `login_test.md`, and `search_returns_results_test.md`. Each ends in `Verify` assertions so the verdicts are deterministic. You commit them next to your code and run them in CI on every pull request with `run-all`, sharded across your runners, with a `--budget-usd` ceiling so a runaway test cannot drain your model budget. A red run fails the build and, through the same bridge, opens a Rollbar item tagged `pre-merge`.

After merge, three monitors watch the same three flows in production, each on a fifteen-minute interval, each authenticated with a saved session, each pointed at the bridge. Between incidents they run almost free thanks to the replay cache. When the payment page breaks at 2am because a third-party script changed, the monitor's next run flips red, POSTs to your bridge, and a `critical` Rollbar item appears with the failing assertion attached, the fingerprint grouping any repeats, and your existing Rollbar-to-PagerDuty rule waking the on-call engineer. When you ship the fix and the flow goes green, the recovery transition resolves the item automatically.

That is the whole loop. No new dashboard, no new on-call surface, no fabricated confidence. The flows a person actually performs are watched by something that performs them, and the failures land where your team already looks. You can read a longer walkthrough of the monitoring approach on the [BrowserBash blog](https://browserbash.com/blog), and the [pricing page](https://browserbash.com/pricing) spells out what stays free forever (everything that runs on your machine) versus the optional hosted extras.

## FAQ

### How does a browserbash rollbar integration actually create an item in Rollbar?

BrowserBash monitor mode POSTs a JSON verdict to any URL you give its `--notify` flag when a check flips between pass and fail. A small webhook bridge you host reads that JSON, maps the status to a Rollbar severity level, and calls Rollbar's Items API with your access token. Rollbar does not ingest arbitrary webhooks as items directly, so the bridge is the necessary translation layer between BrowserBash's payload and Rollbar's expected item format.

### Will this flood Rollbar with duplicate items during a long outage?

Not if you set a stable fingerprint. BrowserBash monitor mode is edge-triggered, so it only fires on a state change rather than on every run, which already prevents most noise. To collapse any remaining repeats, have your bridge set Rollbar's `fingerprint` field to a hash of the test name plus the failing assertion, and Rollbar groups the whole incident into one item with an occurrence count instead of many separate items.

### Do I need API keys or a paid model to run these monitors?

No. BrowserBash is Ollama-first and defaults to free local models, so nothing has to leave your machine and no key is required to start. It auto-resolves a local model before any hosted key, and the replay cache means an always-on monitor makes almost no model calls between incidents. The honest caveat is that very small local models around 8B and under can be flaky on long flows, so use a mid-size local model or a capable hosted model for anything you want to trust unattended.

### Can I send BrowserBash failures to Slack instead of building a Rollbar bridge?

Yes, and it is simpler. If you point the `--notify` flag directly at a Slack incoming-webhook URL, BrowserBash detects it and formats the alert for Slack automatically, no bridge needed. Build the Rollbar bridge only when you want failures to become formally triaged items that inherit your existing assignment, severity, and escalation rules rather than just a chat notification.

Ready to make your silent flow breaks visible where your team already triages? Install the CLI with `npm install -g browserbash-cli`, get a green run locally, then wire a monitor into your Rollbar bridge. An account is optional and everything on your machine is free forever, but if you want the hosted dashboard and cloud retention you can [sign up here](https://browserbash.com/sign-up).
