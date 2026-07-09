---
title: Build Datadog and Grafana Dashboards From Test NDJSON
description: "Turn BrowserBash NDJSON into datadog grafana test metrics: parse duration_ms, cost_usd, and assertions into dashboards and alerts your team trusts."
date: 2026-08-01
category: ci
---

Most teams treat their end-to-end suite as a pass/fail gate and throw away everything else the run produced. That is a waste. Every BrowserBash run in agent mode emits a stream of structured events, and inside that stream sits the raw material for real datadog grafana test metrics: how long each objective took, what it cost, which assertions held, and which flow flipped from green to red. This article walks through parsing the NDJSON event stream (`duration_ms`, `cost_usd`, `assertions`) into time-series metrics you can chart in Datadog or Grafana, alert on, and use to argue for or against a release.

I will assume you already run BrowserBash somewhere, whether that is a laptop, a GitHub Action, or a scheduled monitor. If you have not installed it yet, it is one command:

```bash
npm install -g browserbash-cli
```

The rest is about the data.

## Why NDJSON Is the Right Source of Truth

BrowserBash was built for machines to read, not just humans. When you pass `--agent`, the CLI emits NDJSON on stdout: one JSON object per line, one line per event. There is no prose to scrape, no HTML report to parse, no screenshot OCR. Each line is a complete, self-describing record. That property is exactly what a metrics pipeline wants, because you can tail the stream, split on newlines, and hand each line to `JSON.parse` without buffering the whole run.

Two event types matter most for observability. A `step` event fires as the agent works through the objective, and a `run_end` event fires once when the run finishes. The `run_end` payload is the one carrying the fields you will chart: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. Those field names are a frozen public contract in BrowserBash, so a dashboard you build today keeps working after upgrades. New fields get added additively, never renamed out from under you.

Exit codes reinforce the same discipline. BrowserBash returns `0` for passed, `1` for failed, `2` for an error or infra problem or a budget stop, and `3` for a timeout. Your collector can key off both the exit code and the presence of a `run_end` event, which is the same belt-and-suspenders rule the built-in `run-all` orchestrator uses internally. A suite that produced no `run_end` did not finish cleanly, no matter what the exit code says.

### A single NDJSON line, decoded

Here is the shape you are working with when a run ends. The exact JSON differs per run, but the fields are stable:

```bash
browserbash run "Open the pricing page and verify the Pro plan is visible" \
  --agent --headless --timeout 120 > run.ndjson
```

The last line of `run.ndjson` is your `run_end` object. It contains a `status` string, a numeric `duration_ms`, a `cost_usd` estimate (present only when the model is in the bundled price table), and an `assertions` array where each deterministic Verify check reports expected versus actual. That is the entire payload your Datadog or Grafana pipeline needs. Everything else is plumbing.

## The Metrics Worth Extracting

Before writing any collector code, decide what you actually want on a wall. Dumping every field into a dashboard produces noise. These four families of metrics earn their place.

**Duration.** `duration_ms` from `run_end` is your latency signal. Charted over time per test, it catches the slow creep that no single run would flag. A login flow that drifts from 8 seconds to 19 seconds over three weeks is a regression even while it stays green. Track it as a gauge per test name, and a p95 across the suite.

**Cost.** `cost_usd` is the spend signal. BrowserBash estimates it from a bundled per-model price table, and it deliberately emits nothing for a model it does not recognize rather than guessing wrong. That honesty matters for your dashboard: a missing `cost_usd` is a real state (unknown model), not a zero. Chart summed cost per suite run and per test, and you will see immediately when someone points a flow at an expensive hosted model that a cheap local one could have handled.

**Assertions.** The `assertions` array is your correctness signal at a finer grain than pass/fail. Each deterministic Verify step compiles to a real Playwright check (URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, a stored value equals) with no model judgment involved. When one fails, the array carries expected versus actual. Counting passed and failed assertions per run gives you a health metric that survives even when the overall verdict is green, because a suite can pass its critical path while a secondary check quietly rots.

**Verdict and flakiness.** The `status` field plus exit code give you the pass rate. Layered over time, the same test flipping green and red without code changes is your flake signal. BrowserBash's memory store already tracks flaky flags and orders previously-failed and slowest-first, so you can cross-reference.

| NDJSON field | Metric type | Datadog / Grafana use | What it catches |
| --- | --- | --- | --- |
| `duration_ms` | gauge (per test) | latency line + p95 | slow creep, timeouts |
| `cost_usd` | gauge / sum | spend per run and per test | wrong model, runaway suites |
| `assertions[]` | count (pass/fail) | stacked bar per run | silent secondary-check rot |
| `status` + exit code | count | pass-rate line, flake heatmap | regressions, flaky tests |
| `run_end` presence | boolean | run-completeness check | crashed or truncated runs |

## Parsing the Stream Into Metrics

The collector is small on purpose. You do not need a framework. You need something that reads NDJSON line by line, picks out `run_end`, and forwards the numbers to your backend of choice.

### The line reader

Any language works. In a Node CI step you can pipe the run straight into a reader that splits on newlines, parses each line, and ignores anything that is not a `run_end`. The critical detail: parse defensively. A truncated final line (EPIPE on stdout is handled quietly by BrowserBash and exits `0`) means you should treat "no `run_end` seen" as an incomplete run and emit a synthetic `run.incomplete` metric rather than silently recording nothing. That single guard saves you from dashboards that look healthy because they are blind.

### Shipping to Datadog

Datadog ingests custom metrics through DogStatsD or the HTTP API. For a batch CI run, the HTTP API is simpler because you are sending a handful of points at the end of a job, not a high-frequency stream. Map each `run_end` to a few metric submissions:

- `browserbash.run.duration_ms` as a gauge, tagged `test:<name>`, `suite:<folder>`, `status:<status>`.
- `browserbash.run.cost_usd` as a gauge, same tags, submitted only when the field is present.
- `browserbash.run.assertions.passed` and `.failed` as counts.
- `browserbash.run.result` as a count with a `verdict` tag so you can build a pass-rate ratio.

Tags are where the value compounds. Tagging by `test`, `suite`, `branch`, `shard`, and `viewport` lets you slice the same base metrics a dozen ways without emitting a dozen metric names. When you run a viewport matrix (more on that below), the viewport label already appears in the events and JUnit, so carry it straight through as a Datadog tag.

### Shipping to Grafana

Grafana does not store data itself; it reads from a backend. Two common paths:

1. **Prometheus via a Pushgateway.** CI jobs are short-lived, so a normal Prometheus scrape will miss them. Push the parsed metrics to a Pushgateway keyed by job and instance, then let Prometheus scrape the gateway. Grafana queries Prometheus. This fits teams already running Prometheus.
2. **Loki for the raw NDJSON, plus a metrics backend for the numbers.** Ship the full NDJSON stream to Loki as structured logs (it is already JSON, so label extraction is trivial), and derive metrics with LogQL or a recording rule. This keeps the raw events queryable for post-incident forensics while still giving you time-series panels.

Either way, the parsing logic is identical. Only the final `POST` target changes. Keep the collector backend-agnostic and you can dual-write to Datadog and Grafana from one CI step during a migration.

## Deterministic Assertions Make the Metrics Honest

A metrics pipeline is only as trustworthy as the events feeding it. This is where BrowserBash's deterministic Verify assertions earn their keep. A `Verify` step that matches the grammar compiles to a real Playwright expectation, so a passed assertion means the condition genuinely held, and a failed one ships expected-versus-actual evidence into `run_end.assertions`. There is no LLM deciding whether "the page looks right." Your dashboard is charting facts, not a model's opinion.

There is a useful escape hatch that you should surface in your metrics rather than hide. A Verify line that falls outside the deterministic grammar still runs, but it is agent-judged and flagged `judged: true`. When you parse the assertions array, split your counts into deterministic and judged. A dashboard panel that shows "12 deterministic passes, 3 judged passes" tells your team exactly how much of their green is provable and how much rests on model judgment. That distinction is the difference between a vanity metric and a real one.

If you are new to writing these checks, the [features overview](https://browserbash.com/features) walks through the Verify grammar, and the [tutorials](https://browserbash.com/tutorials) show them inside full test files.

### A testmd v2 file that seeds and verifies

The cleanest source of trustworthy assertions is a testmd v2 file, which runs steps one at a time against a single browser session. It gives you deterministic API steps for seeding data and Verify steps for checking it through the UI, and neither touches a model:

```bash
# tests/checkout_test.md
---
version: 2
---
# Checkout shows the seeded order

POST https://api.example.com/orders with body {"sku": "PRO-1", "qty": 2}
Expect status 201, store $.id as 'orderId'

Open https://example.com/orders/{{orderId}}
Verify the page title contains "Order"
Verify "Pro Plan" text is visible
Verify the "Pay now" button is visible
```

Run that with `--agent`, and the resulting `assertions` array in `run_end` is fully deterministic for the three Verify lines. Those are the checks you want driving your alerting, because a failure is a real, reproducible failure with evidence, not a flaky judgment call. One caveat to keep honest: testmd v2 currently drives the built-in engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly.

## Building the Dashboards

With metrics flowing, the panels almost design themselves. A few that consistently pull their weight.

**Suite latency over time.** A time-series panel of `duration_ms` p50 and p95 across the whole suite, with an overlaid marker for deploys. This is the panel that catches performance regressions before a customer files a ticket. Break it out per test on a second row so you can see which flow moved.

**Cost per run and cumulative spend.** A bar chart of summed `cost_usd` per suite run, plus a cumulative line for the billing period. Because BrowserBash omits `cost_usd` for unknown models, add a small stat panel counting runs with no cost estimate so an unrecognized model does not silently drag your total down and lie to you.

**Assertion health.** A stacked bar per run: deterministic passes, judged passes, and failures. When the failure segment appears, the expected-versus-actual detail is one click away in the raw NDJSON you shipped to Loki or stored as a CI artifact.

**Pass-rate and flake heatmap.** A heatmap of test name against run, colored by verdict, makes flakiness visually obvious. A test that alternates green and red without a code change lights up as a striped row. Cross-reference that with BrowserBash's own flaky detection in the memory store and you have both the machine's opinion and the human-readable evidence.

The replay cache changes the economics of feeding these dashboards. A green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. That means an always-on monitor pushing metrics every few minutes stays nearly token-free, so your `cost_usd` line for a healthy monitored flow should hover near zero. When it spikes, the page changed and the agent re-engaged, which is itself a signal worth a panel.

## From Dashboards to Alerts

Charts are for humans browsing. Alerts are for machines waking humans. Wire both.

### Alert on the metrics you shipped

In Datadog, a monitor on `browserbash.run.duration_ms` breaching a p95 threshold catches latency regressions. A monitor on cumulative `browserbash.run.cost_usd` crossing a daily ceiling catches a runaway suite before the bill does. A monitor on the failed-assertion count catches correctness drift even when the overall verdict stayed green. In Grafana, the same thresholds become alert rules on your Prometheus or Loki queries. None of this requires anything special from BrowserBash; you are alerting on the numbers you already parsed.

### Let BrowserBash alert on state changes

For the flows you care about most, do not wait for a CI run. BrowserBash has a built-in monitor that runs on an interval and alerts only on pass-to-fail and fail-to-pass transitions, in both directions, never on every green run:

```bash
browserbash monitor ./tests/checkout_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload, which you can forward straight into your metrics pipeline as another event source. Pair this with your Datadog and Grafana alerts and you get two independent tripwires: one from the observability backend watching trends, one from BrowserBash watching state flips in real time. The [learn hub](https://browserbash.com/learn) has more on monitor mode and cache behavior.

### Budgets as a hard alert

Spend governance is worth wiring into CI directly rather than only watching after the fact. When you run a folder, cap it:

```bash
browserbash run-all ./tests --agent \
  --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

Once the suite crosses the budget, BrowserBash stops launching new tests, reports the remaining ones as `skipped`, exits `2`, and writes the spend into `RunAll-Result.md` and the JUnit `<properties>`. Your collector should treat that exit `2` and the skipped count as a first-class metric: a "budget stop" is a real operational event, not a test failure, and your dashboard should distinguish the two so nobody debugs a "failure" that was actually a spend guardrail doing its job.

## Sharding, Matrix, and the Tags That Make It Sliceable

Parallel CI is where naive dashboards fall apart, because you get four machines writing metrics for the same suite and no way to tell them apart. BrowserBash's sharding solves the coordination problem for you. `run-all --shard 2/4` runs a deterministic slice computed on sorted discovery order, so parallel machines agree on who runs what without talking to each other. Carry the shard index straight into your metric tags and your per-shard latency becomes a clean, non-overlapping breakdown.

The viewport matrix works the same way. `--matrix-viewport 1280x720,390x844` runs every test once per viewport, and the viewport label already appears in events, JUnit, and results. Tag your Datadog and Grafana metrics with it and a single panel shows desktop versus mobile latency and assertion health side by side. That is a genuinely useful view: mobile flows are often the slower, flakier ones, and now you can prove it with data instead of anecdote.

Because every axis (shard, viewport, branch, test, suite) is a tag on the same handful of base metrics, you never explode your metric cardinality into hundreds of names. You emit `browserbash.run.duration_ms` once and slice it however the incident demands.

## When a Metrics Pipeline Is Overkill

Be honest about scope. Not every team needs Datadog or Grafana in front of their browser suite, and pretending otherwise wastes engineering time.

If you run a handful of tests a few times a day, the built-in local dashboard (`browserbash dashboard`, fully local, no account) already shows you runs, verdicts, and results without any pipeline at all. It stores masked runs on your machine and nothing leaves it. For small teams, the optional free cloud dashboard via `browserbash connect` with `--upload` gives 15-day retention and a shareable view. Reach for Datadog or Grafana when you have crossed into one of these situations:

- You already run one of them for the rest of your stack and want browser-test signals correlated with app metrics on the same time axis.
- You run enough tests, often enough, that trend detection (slow creep, cost drift, flake rate) matters more than any single verdict.
- You need long retention and alerting SLAs that a 15-day cloud dashboard does not cover.

If none of those are true, the parsing exercise in this article is premature. The [pricing page](https://browserbash.com/pricing) lays out what stays free forever (the CLI, engines, local dashboard, cache, MCP, and NDJSON output all run on your machine at no cost) versus what hosted retention adds. Build the pipeline when the trend data will actually change a decision, not before.

## Putting It Together in CI

The full loop, end to end, looks like this. Your CI job runs the suite in agent mode with sharding and a budget, capturing NDJSON to a file and JUnit for the native test report. A collector step reads the NDJSON, extracts `run_end` from each run, and pushes `duration_ms`, `cost_usd`, and assertion counts to Datadog or a Pushgateway with tags for test, suite, shard, viewport, and branch. The raw NDJSON goes to Loki or an artifact for forensics. Dashboards read the time series; alerts watch the thresholds. Separately, a BrowserBash monitor watches your top flows every ten minutes and pings Slack on state flips.

None of the pieces are exotic. The whole thing works because the event stream is structured, the field names are frozen, and the assertions are deterministic where it counts. You are not scraping logs or guessing at a run's meaning. You are reading a clean record and charting it. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) show the CI half, and the [BrowserBash repo](https://github.com/PramodDutta/browserbash) has the full NDJSON schema if you want to code your collector against the source.

## FAQ

### What fields does BrowserBash NDJSON include for metrics?

The `run_end` event carries the fields you chart: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. The `step` events cover the agent's progress through the objective. These names are a frozen public contract, so a dashboard you build stays valid across upgrades, with new fields added additively rather than renamed.

### How do I get cost metrics from my browser tests?

Run in agent mode and read `cost_usd` from the `run_end` line. BrowserBash estimates it from a bundled per-model price table and deliberately omits the field for models it does not recognize rather than reporting a wrong number. Treat a missing value as an "unknown model" state in your dashboard, and use `run-all --budget-usd` to hard-stop a suite once spend crosses a ceiling.

### Can I send BrowserBash results to both Datadog and Grafana?

Yes. The parsing logic is identical for both; only the final submission target differs. Read the NDJSON line by line, extract `run_end`, and dual-write the metrics to Datadog's HTTP API and to a Prometheus Pushgateway that Grafana queries. Keeping the collector backend-agnostic lets you run both during a migration or permanently.

### Do I need a metrics pipeline if I only run a few tests?

Probably not. The built-in local dashboard shows runs and verdicts on your machine with no setup, and the optional free cloud dashboard adds 15-day retention and sharing. Reach for Datadog or Grafana only when trend detection across many runs, long retention, or correlation with your existing app metrics will actually change a decision.

Ready to start charting your own runs? Install with `npm install -g browserbash-cli`, capture a run with `--agent`, and point your collector at the last line. An account is optional, but if you want the hosted dashboard you can grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up).
