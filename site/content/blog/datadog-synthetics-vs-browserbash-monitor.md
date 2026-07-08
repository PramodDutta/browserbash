---
title: Datadog Synthetics vs a Free BrowserBash Monitor
description: "Datadog synthetics vs browserbash monitor compared: hosted per-check pricing versus a free CLI loop with webhook alerts, and when each one earns its keep."
date: 2026-07-14
category: comparison
---

If your checkout flow breaks at 2am and nobody notices until support tickets pile up, the cost of not knowing is always bigger than the cost of the tool that would have told you. That's the pitch behind synthetic monitoring, and it's why the datadog synthetics vs browserbash monitor question comes up so often on SDET teams that already run Datadog for infrastructure but are quoted a five- or six-figure add-on to watch a login page. Both tools point a browser at your app on a schedule and tell you when something breaks. The difference is who runs the browser, who pays for the compute, and what happens when a step needs a real judgment call instead of a hardcoded selector.

This isn't a "Datadog is overpriced, cancel it" article. Datadog Synthetic Monitoring is a mature, hosted product with a global probe network, and for some teams that's worth every dollar. But if you've never seriously priced out a self-run alternative, or you assumed "free monitoring" meant a flaky cron job and a prayer, it's worth walking through what a BrowserBash monitor loop actually looks like in practice, because it's closer to a real synthetic monitoring tool than most people expect.

## What Datadog Synthetic Monitoring Actually Does

Datadog's synthetics product runs two kinds of checks: API tests (HTTP requests with assertions) and browser tests (multi-step flows recorded through a UI or scripted). Browser tests execute from Datadog's managed locations around the world, on a schedule you define, and results roll into the same dashboards, alerting pipelines, and on-call rotations you're already using for APM and infrastructure metrics. If your team lives in Datadog for everything else, that integration is real value: one pane of glass, one alerting policy, one vendor relationship.

Datadog prices synthetic checks per test run, with separate meters for API tests and browser tests (browser tests cost meaningfully more per run since they spin up an actual browser). The exact current rate isn't something we'll guess at here, it's not publicly specified in a way that stays accurate for long since Datadog adjusts usage-based pricing periodically, but the pattern every team reports is the same: cost scales with check frequency and test count, and a suite of a few dozen browser checks running every five minutes adds up fast. That per-execution meter is the single biggest thing to understand before you compare it to anything else, because it changes your incentives. You start writing fewer checks, or checking less often, specifically to manage a bill, which is exactly the wrong pressure to have on your monitoring coverage.

### What you get for that price

To be fair to Datadog: multi-region probe locations, a managed browser fleet you never patch, retry logic tuned by people who've run this at scale, integration with existing dashboards and incident management, and a UI-based recorder for people who don't want to write test scripts by hand. If your on-call process is already built around Datadog monitors and you need synthetic checks to trigger the same PagerDuty escalation as everything else, that's a real, non-trivial advantage.

## What a Free BrowserBash Monitor Loop Looks Like

BrowserBash takes a different shape entirely. It's an open-source (Apache-2.0) CLI, `browserbash-cli` on npm, that turns a plain-English objective into browser actions against a real Chrome or Chromium instance, no selectors, no page object models, no recorded scripts to maintain. You describe what should happen ("go to the login page, sign in, confirm the dashboard shows the account balance") and an AI agent drives the browser step by step, then returns a deterministic pass/fail verdict. The full command reference and setup options live on the [features page](https://browserbash.com/features).

Monitor mode wraps that loop in a scheduler:

```bash
browserbash monitor "Go to https://app.example.com/login, sign in with {{email}} and {{password}}, and confirm the dashboard heading is visible" --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

That single command re-runs the objective every ten minutes and only fires a webhook when the pass/fail state flips, from pass to fail, or from fail back to pass. Every green run in between is silent. It's the same core idea as Datadog's alerting, minus the hosted probe network and minus the per-check invoice, because the browser runs on hardware you already control: your laptop, a spare VM, a GitHub Actions self-hosted runner, whatever you point it at.

### Where the model comes from, and why that matters for "free"

BrowserBash resolves its model in a fixed order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. Run it with a local model and nothing leaves your machine, no API key required, no per-call token bill. That's the honest version of "free": the CLI itself costs nothing and the default path costs nothing to run, but if you choose to point it at a hosted model for harder flows, you're paying that vendor directly, not BrowserBash. Small local models (roughly 8B parameters and under) can get flaky on long multi-step objectives, so the realistic sweet spot for unattended monitoring is a mid-size local model (Qwen3 or Llama 3.3 in the 70B class) or a capable hosted model reserved for the flows that actually need the extra reasoning.

There's a second reason cost stays low over time: the replay cache. Once a monitor run passes, BrowserBash records the exact actions it took. The next identical run replays those recorded actions directly, with zero model calls, and only falls back to agent reasoning if the page actually changed. An always-on monitor checking the same login flow every ten minutes for a month isn't paying model costs for every single run, it's paying for the first run and then replaying until something on the page shifts.

## Datadog Synthetics vs BrowserBash Monitor: Feature by Feature

| Capability | Datadog Synthetic Monitoring | BrowserBash Monitor |
|---|---|---|
| Hosting | Fully hosted, Datadog-managed browser fleet and probe locations | Self-run, on your machine, VM, or CI runner |
| Pricing model | Per-check-run metered billing (exact current rates not publicly fixed here) | CLI is free and open-source; only cost is optional hosted model tokens, offset heavily by the replay cache |
| Test authoring | UI recorder or scripted steps with fixed assertions | Plain-English objectives, no selectors; also supports Verify assertions compiled to real Playwright checks |
| Alerting | Native integration into Datadog monitors, dashboards, on-call | Webhook on state change only (pass to fail, fail to pass), Slack-formatted automatically for incoming webhook URLs |
| Global probe locations | Yes, multiple managed regions | No, runs from wherever you schedule it; you'd need your own multi-region runners for that |
| Model/AI judgment | Not applicable, deterministic step scripts | AI-driven navigation with deterministic Verify assertions layered on top |
| Data residency | Data flows through Datadog's platform | Everything stays local unless you opt into `browserbash connect --upload` |
| Setup for CI | Datadog-specific integration | Native `--agent` NDJSON output plus an official GitHub Action |
| Open source | No | Yes (Apache-2.0) |

The table understates one thing worth calling out directly: Datadog checks are deterministic by design (click this selector, assert this text), which is a strength when your flow never changes and a liability when your UI does. BrowserBash's plain-English objectives adapt to layout drift because the agent is reasoning about intent, not a brittle CSS path, but that flexibility is also why you want the deterministic Verify layer for anything you need a hard pass/fail on, not agent judgment.

## Pricing: Per-Check Billing vs Free and Self-Hosted

Let's be concrete about the shape of the tradeoff, even without pinning Datadog's exact per-check rate. Datadog's model charges for every execution, so your bill scales linearly with two things you control: how many flows you monitor and how often you check them. A team monitoring 15 critical user journeys every five minutes is paying for roughly 4,300 browser test runs per journey per month, times 15. That's the lever that makes teams quietly dial back check frequency or drop lower-priority flows from the monitoring plan, not because the flows don't matter, but because the meter is watching.

BrowserBash flips that lever off. `browserbash monitor` on your own hardware costs the same whether it runs every minute or every hour, because you're not paying per execution, you're paying for compute you already own (or Ollama tokens that are already free). The honest tradeoff: you're now responsible for the box that runs the monitor staying up, which is not nothing. If your monitor host goes down, your monitoring goes down with it, and Datadog's hosted probes don't have that failure mode. For a single critical flow that genuinely needs five-nines uptime awareness, that's a legitimate point in Datadog's favor. For the other 90% of a typical test suite (checkout works, search returns results, the pricing page loads), a self-run loop on a cheap always-on VM is a reasonable bet.

### A cost governance angle Datadog doesn't need

Because BrowserBash can call out to hosted LLMs, it ships its own cost control layer so an unattended monitor loop can't surprise you the way a metered SaaS product can. `run_end` events carry a `cost_usd` estimate from a bundled per-model price table (models it doesn't recognize get no estimate rather than a fabricated one), and `run-all --budget-usd 2.50` will stop launching new tests once a suite crosses that budget, marking the rest `skipped` and exiting with code 2 so CI catches it. That's not a feature Datadog needs, since their pricing is already metered at the platform level, but it's the equivalent guardrail for a self-run tool that talks to a paid model API.

## Setting Up a BrowserBash Monitor with Webhook Alerts

Here's the actual path from zero to a running monitor, assuming you've already got `browserbash-cli` installed (`npm install -g browserbash-cli`) and a target flow in mind.

First, save a login session so the monitor doesn't have to authenticate through the AI agent on every single run:

```bash
browserbash auth save prod-account --url https://app.example.com/login
```

That opens a browser, you log in once by hand, hit Enter, and it's saved as a Playwright storageState profile you can reuse across runs.

Then write the check as a `*_test.md` file so it's version-controlled alongside the rest of your test suite, using a Verify step so the pass/fail isn't left to agent judgment:

```
# Dashboard health check

- Go to https://app.example.com/dashboard
- Verify 'Account balance' text visible
- Verify page title contains "Dashboard"
```

And point monitor mode at that file, with the saved auth profile and a webhook:

```bash
browserbash monitor .browserbash/tests/dashboard_health_test.md --auth prod-account --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Slack incoming-webhook URLs get formatted automatically into a readable message; any other URL gets the raw JSON payload, so you can pipe alerts into PagerDuty, an internal Slack app, or a custom incident bot with the same flag. Because the auth profile is reused instead of re-logged-in every cycle, and the replay cache kicks in after the first pass, a monitor like this stays close to token-free once it settles into a steady state. If you're new to the Verify grammar or `auth` frontmatter, the [tutorials section](https://browserbash.com/tutorials) walks through both step by step.

## Alert Fatigue and Why State-Change-Only Notifications Matter

The single most underrated design decision in `browserbash monitor` is that it notifies only on state transitions, never on every green run. That sounds obvious until you've been on a team that wired up a naive cron job plus a webhook and got a Slack message every ten minutes forever, which everyone mutes within a day, which defeats the entire point of monitoring. Datadog handles this with its own monitor and alerting rules layered on top of raw check results, which is powerful but is also another system to configure correctly (thresholds, recovery notifications, notification grouping). BrowserBash bakes the pass-to-fail and fail-to-pass logic directly into the monitor loop itself, so a webhook fires exactly twice per incident: once when it breaks, once when it's fixed. No dashboard, no rule engine, no separate alerting product to configure.

That's a smaller feature set than Datadog's full alerting stack, deliberately. If you need multi-condition composite monitors, anomaly detection on latency trends, or alert routing based on business hours, Datadog's alerting engine is the more capable tool. If you need "tell me the moment login breaks and tell me again the moment it's fixed," the simpler tool does the job with less to configure and nothing to pay per check.

## Where Datadog Still Wins

It would be dishonest to write this comparison and pretend BrowserBash covers every case Datadog does. A few places where the hosted product is genuinely the better fit:

- **True global probe coverage.** If you need to know your app is reachable and fast from Frankfurt, Singapore, and São Paulo simultaneously, Datadog's managed probe network does that out of the box. Replicating it with BrowserBash means you provisioning and maintaining runners in each of those regions yourself.
- **Unified observability.** Teams already deep in Datadog for APM, infrastructure, and logs get real value from synthetic checks living in the same platform, same dashboards, same on-call escalation, no separate tool to context-switch into during an incident.
- **Compliance and audit requirements.** If your organization needs a vendor with specific compliance certifications and contractual SLAs around monitoring uptime itself, that's a procurement conversation BrowserBash, as a CLI you run yourself, isn't set up to have.
- **Non-technical stakeholders authoring checks.** Datadog's UI-based recorder lets less technical team members build and edit browser checks visually. BrowserBash's plain-English objectives are approachable, but they still live in a CLI and a markdown file, which is a different comfort zone.

If any of those four are the actual reason you're evaluating synthetic monitoring, don't let a free alternative talk you out of the hosted product. The cost is the cost of solving that specific problem well.

## Where BrowserBash Wins

The flip side is just as real:

- **No per-check meter.** You can monitor as many flows, as frequently as you want, without a bill that scales with your coverage decisions.
- **Version-controlled, plain-English checks.** Your monitoring flows live as `*_test.md` files next to your code, reviewable in a pull request, not locked inside a SaaS UI.
- **Deterministic assertions when you need them, agent flexibility when you don't.** Verify steps compile to real Playwright checks for hard pass/fail; the surrounding plain-English steps still adapt when your UI shifts slightly, instead of a hardcoded selector breaking the check.
- **CI-native from the start.** `--agent` emits NDJSON with clean exit codes (0 passed, 1 failed, 2 error/budget-stop, 3 timeout) and there's an official GitHub Action that posts a verdict table straight into your pull requests.
- **Everything stays local by default.** No account required, nothing uploaded anywhere unless you explicitly opt into `browserbash connect --upload` for the free 15-day cloud dashboard retention.
- **It doubles as your functional test runner, not just your monitor.** The same `*_test.md` files, the same `run-all --shard 2/4 --budget-usd 2` orchestrator, and the same MCP server (`browserbash mcp`, tools `run_objective`, `run_test_file`, `run_suite`) that AI coding agents like Claude Code or Cursor can call directly to self-verify a change, cover both your pre-merge test suite and your production monitor with one tool instead of two.

## Who Should Choose Which

If you're a small team or an indie project watching a handful of critical flows and you don't want a monitoring bill that grows every time you add a check, `browserbash monitor` on a spare VM with webhook alerts into Slack gets you real coverage for the cost of the compute you already have. If you're already paying for Datadog across your infrastructure and synthetic checks are a small incremental cost on top of a platform you're using anyway, staying inside Datadog for the unified dashboard and on-call integration is the pragmatic call, not a mistake.

The middle ground, and probably the most common real-world setup, is running both: Datadog synthetics for the handful of flows where global probe locations and unified alerting genuinely matter, and BrowserBash monitor loops for the long tail of flows you'd otherwise leave unmonitored because the per-check math didn't justify covering them. That's not a compromise, it's just matching the tool to the job instead of forcing one vendor to do everything. BrowserBash is [free-only pricing](https://browserbash.com/pricing) right now, so there's no tier decision to make before you try it against a real flow.

## Getting Started Without Committing to Anything

You don't need to rip out an existing monitoring setup to try this. Install the CLI, point a single monitor at your lowest-stakes flow, and watch it run for a week before you decide whether it earns a place next to (or instead of) anything else: `npm install -g browserbash-cli`, then `browserbash monitor "Go to https://yourapp.com and confirm the page title contains your app name" --every 15m --notify https://your-webhook-url`.

If you're already using GitHub Actions, the [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) runs the same suites on every pull request and posts a verdict table as a comment, so your pre-merge checks and your production monitor can share the exact same test files. And if you want to see the pattern applied to a real production app before committing to it, the [case study](https://browserbash.com/case-study) walks through one end to end.

## FAQ

### Is BrowserBash a real replacement for Datadog Synthetic Monitoring?

For teams that need global probe locations, unified on-call integration, or compliance-grade SLAs around the monitoring vendor itself, Datadog remains the better fit. For teams that want free, self-run, version-controlled checks with state-change-only alerting, BrowserBash covers a meaningful chunk of what synthetic monitoring is used for without a per-check bill.

### How much does BrowserBash monitor mode actually cost to run?

The CLI itself is free and open-source. If you run it against a local Ollama model, there's no per-call cost at all. If you point it at a hosted model like Anthropic Claude or OpenAI, you pay that provider directly for tokens, and the replay cache keeps steady-state monitoring close to token-free since repeated identical runs replay recorded actions instead of re-reasoning through the page.

### Does BrowserBash monitor alert on every check like a basic cron job would?

No. `browserbash monitor` only sends a webhook notification when the pass/fail state actually changes, once when a flow breaks and once when it recovers, not on every scheduled run. That avoids the alert fatigue that comes from naive polling setups where every green check still pings a channel.

### Can I use BrowserBash for both CI testing and production monitoring?

Yes, that's one of its core advantages over a monitoring-only tool. The same `*_test.md` files run in `run-all` for pre-merge CI checks (with sharding and budget limits) and in `browserbash monitor` for scheduled production checks, so you write one set of plain-English tests and reuse it in both places instead of maintaining separate test suites for CI and monitoring.

Ready to try it against your own flows? `npm install -g browserbash-cli` gets you running in under a minute, and creating a free [BrowserBash account](https://browserbash.com/sign-up) is entirely optional, the CLI works fully offline with a local model out of the box.
