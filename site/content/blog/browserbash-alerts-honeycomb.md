---
title: Send BrowserBash Verdicts to Honeycomb as Events
description: "A practical BrowserBash Honeycomb integration guide: pipe run_end verdicts into Honeycomb events so you can correlate browser checks with your traces."
date: 2026-06-19
category: ci
---

If you already ship traces to Honeycomb, your end-to-end browser checks probably live somewhere else entirely: a CI log, a Slack channel, a dashboard nobody opens. A BrowserBash Honeycomb integration closes that gap. Every BrowserBash run ends with a structured `run_end` verdict, and that verdict is exactly the kind of typed, high-cardinality event Honeycomb was built to store and query. Once your validation results land in the same dataset as your application traces, a failing login flow stops being an isolated red X and becomes a data point you can slice next to latency spikes, deploy markers, and error rates.

This guide walks through the whole pipeline. You will see what the verdict payload actually contains, how to turn one NDJSON line into a Honeycomb event, how to add trace context so a failed check links straight to the request it exercised, and how to keep an always-on monitor feeding events without burning tokens. No wrappers to install, no magic. It is stdout, a POST, and a dataset.

## Why send browser verdicts to Honeycomb at all

Observability tools are very good at telling you what your backend did and very bad at telling you what a user would have experienced. Your traces can be flawless while the checkout button is dead because of a broken CSP header that never reached the server. Synthetic browser checks fill that blind spot, but only if their results are queryable next to everything else.

Honeycomb's model rewards this. It stores wide events with lots of attributes and lets you group, filter, and break down by any field after the fact. A BrowserBash verdict is naturally wide: it carries a status, a human summary, the assertions that passed or failed, an estimated cost, and a duration. Drop those fields into a Honeycomb event and you can ask questions you could not ask from a CI log. "Show me every failed `checkout` verdict in the last 24 hours, broken down by viewport." "Overlay browser-check failures on the p95 latency of the orders service." "Did the deploy at 14:02 change my pass rate?"

The point is correlation. A red build tells you something broke. A verdict event sitting beside your traces tells you what broke, when, and next to which backend behavior. That is the difference between an alert and an investigation you can actually run. If you are newer to how BrowserBash produces these results, the [BrowserBash learn hub](https://browserbash.com/learn) is a good primer on the objective-in, verdict-out model before you wire it to anything.

## What lives inside a run_end verdict

BrowserBash is a natural-language browser automation CLI. You write a plain-English objective, an AI agent drives a real Chrome browser step by step, and you get a deterministic verdict back. For automation you run it in agent mode, which emits NDJSON on stdout: one JSON object per line, no prose to parse.

There are two event types you care about. Each step the agent takes emits a `step` event. When the run finishes, a single `run_end` event carries the verdict. That `run_end` object is the thing you forward to Honeycomb. It includes:

- `status`: the deterministic verdict, `passed` or `failed`.
- `summary`: a short human-readable description of what happened.
- `final_state`: the ending state the agent observed.
- `assertions`: the list of `Verify` checks, each with expected-versus-actual evidence.
- `cost_usd`: an estimated cost from a bundled per-model price table (absent for unknown models rather than guessed).
- `duration_ms`: how long the run took.

The exit code is the other half of the contract, and it is frozen so CI can trust it: `0` passed, `1` failed, `2` error or infrastructure or budget-stop, `3` timeout. A verdict is therefore the combination of the exit code and the presence of a `run_end` event. When you build your Honeycomb forwarder, read both: emit the event from `run_end`, and let the exit code drive whether CI itself goes red.

Here is the shape of a minimal run in agent mode:

```bash
browserbash run "Open https://shop.example.com, add a laptop to the cart, and verify the cart shows 1 item" \
  --agent --headless --timeout 120
```

That command prints NDJSON. The last meaningful line is your `run_end`. Everything downstream is just moving that JSON into Honeycomb.

## Building the Honeycomb forwarder

Honeycomb ingests events over a public HTTP API. You POST a JSON body to `https://api.honeycomb.io/1/events/<dataset>` with an `X-Honeycomb-Team` header holding your API key. Each POST is one event. That is all the surface area you need.

The cleanest approach is to pipe BrowserBash NDJSON into a small script that finds the `run_end` line, reshapes it into a flat event, and posts it. Flat matters: Honeycomb queries fields, so `assertions.0.name` nested three levels deep is less useful than a handful of top-level attributes plus a couple of counts.

```bash
#!/usr/bin/env bash
# run-and-report.sh: run a BrowserBash check and forward the verdict to Honeycomb
set -uo pipefail

DATASET="browser-checks"
NAME="$1"        # a label for this check, e.g. "checkout"
OBJECTIVE="$2"   # the plain-English objective

OUT="$(browserbash run "$OBJECTIVE" --agent --headless --timeout 120)"
CODE=$?

VERDICT="$(printf '%s\n' "$OUT" | grep '"event":"run_end"' | tail -n 1)"

EVENT="$(printf '%s' "$VERDICT" | jq -c \
  --arg name "$NAME" \
  --arg code "$CODE" \
  '{
     check_name: $name,
     status: .status,
     summary: .summary,
     duration_ms: .duration_ms,
     cost_usd: .cost_usd,
     exit_code: ($code | tonumber),
     assertions_total: (.assertions | length),
     assertions_failed: ([.assertions[] | select(.pass == false)] | length)
   }')"

curl -s https://api.honeycomb.io/1/events/"$DATASET" \
  -H "X-Honeycomb-Team: $HONEYCOMB_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$EVENT"

exit "$CODE"
```

A few decisions in that script are worth calling out. The `exit "$CODE"` at the end preserves the frozen exit contract, so CI still fails the build when the check fails, even though the event ships regardless. The `assertions_failed` count is derived rather than nested, which makes "break down by assertions_failed" a one-click Honeycomb query. And the whole thing degrades gracefully: if `grep` finds no `run_end` line (an infra crash, exit code 2), you get an empty event that is itself a signal worth alerting on.

You would call it like this:

```bash
HONEYCOMB_API_KEY=your_key ./run-and-report.sh checkout \
  "Open https://shop.example.com, complete a guest checkout with test card 4242 4242 4242 4242, and verify the order confirmation page shows an order number"
```

Now every run of that command leaves a permanent, queryable record in Honeycomb.

## Adding trace context so verdicts link to requests

Shipping the verdict is useful. Linking the verdict to the exact backend requests the browser triggered is where Honeycomb earns its keep. The mechanism is a shared trace ID.

Generate a trace ID before the run, pass it to the browser so your app can propagate it, and stamp the same ID onto the Honeycomb event. BrowserBash supports `{{variables}}` templating in objectives and test files, so you can inject a per-run ID and have the agent send it as a header or query parameter where your app expects one. The verdict event then carries `trace.trace_id`, and Honeycomb natively joins events to traces that share it.

A committable Markdown test makes this cleaner than a raw objective, because the ID lives in one place and the steps read like documentation. BrowserBash tests are plain `*_test.md` files with `@import` composition and `{{variables}}` templating, and secret-marked variables are masked as `*****` in every log line. Here is a testmd v2 file that seeds data through an API step, then verifies it through the UI with a deterministic check:

```bash
cat > checkout_test.md <<'EOF'
---
version: 2
---
# Checkout with a seeded order

POST https://api.example.com/test/orders with body { "sku": "LAPTOP-1", "qty": 1 }
Expect status 201, store $.id as 'order_id'

Open https://shop.example.com/orders/{{order_id}}
Verify text "Ready to ship" is visible
Verify 'Track order' button is visible
EOF

browserbash testmd run ./checkout_test.md --agent --headless
```

In a testmd v2 file, steps execute one at a time against a single browser session. The `POST` and `Expect status` lines are deterministic API steps that never touch a model, so they are perfect for seeding the exact record you are about to check. The `Verify` lines compile to real Playwright assertions (text visible, named button visible) with no LLM judgment, which means a pass genuinely means the condition held and a fail comes with expected-versus-actual evidence in `run_end.assertions`. Those assertion objects are what your forwarder counts and ships to Honeycomb.

One honest caveat: testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. If you are running fully local on Ollama, keep the trace-linking pattern but express the flow as plain-English objectives on the default engine instead. The [BrowserBash features page](https://browserbash.com/features) lays out which capabilities belong to which engine.

## Turning an always-on monitor into an event stream

Firing an event from CI covers deploys. It does not cover the 3 a.m. outage that happens between deploys. For continuous coverage, BrowserBash has a monitor mode that runs a check on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run.

```bash
browserbash monitor ./checkout_test.md \
  --every 10m \
  --notify https://your-forwarder.internal/honeycomb
```

The `--notify` target receives a payload on every state change. Point it at a tiny HTTP endpoint that reshapes the payload into a Honeycomb event and posts it, exactly like the CI forwarder does. Because monitor only notifies on transitions, your Honeycomb dataset gets a clean signal: an event when the flow breaks, and another when it recovers. Overlay those two markers on a service latency graph and a recovery that lines up with a pod restart tells its own story.

The economics here matter more than they look. BrowserBash has a replay cache: a green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. An always-on monitor checking a stable flow every ten minutes is therefore nearly token-free, which is what makes minute-scale synthetic monitoring feasible without a per-run LLM bill. When the page does change, the agent re-engages, the check either passes or fails honestly, and a transition event lands in Honeycomb. There is more on the monitor-and-cache pairing across the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Scaling across a suite, shards, and viewports

One check is a demo. A real coverage story is dozens of flows across a few viewports on several CI machines. BrowserBash handles the fan-out and still gives you per-test verdicts to forward.

`run-all` is a memory-aware parallel orchestrator: it derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. For CI fan-out, `--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four machines agree on who runs what with zero coordination. `--matrix-viewport 1280x720,390x844` runs every test once per viewport, and each result is labeled in the events and JUnit output so your Honeycomb events can carry a `viewport` attribute for breakdowns.

```bash
browserbash run-all ./.browserbash/tests \
  --shard 2/4 \
  --matrix-viewport 1280x720,390x844 \
  --budget-usd 2.00 \
  --junit out/junit.xml \
  --agent
```

The `--budget-usd 2.00` flag is a hard stop worth wiring into your dashboards. Once a suite crosses the budget, `run-all` stops launching new tests, reports the remainder as `skipped`, exits `2`, and records spend in both `RunAll-Result.md` and the JUnit `<properties>`. If you forward that spend to Honeycomb alongside verdicts, you get a live picture of validation cost per run, which is the kind of number that keeps a synthetic-monitoring program funded instead of quietly cancelled. The [pricing page](https://browserbash.com/pricing) is explicit that everything running on your own machine (the CLI, engines, cache, dashboard) stays free, so the only cost to track is the model spend the price table already estimates for you.

To forward per-test verdicts from a suite, run each test's NDJSON through the same reshape-and-POST step your single-check forwarder uses. The `--junit` file is a useful backstop: even if a forward POST fails, the JUnit report preserves the verdict for CI and for a later replay into Honeycomb.

## A comparison: verdict events versus the alternatives

There is more than one way to get browser-check signal into an observability tool. Being honest about the tradeoffs helps you pick the one that fits your stack.

| Approach | What you get in Honeycomb | Effort | Best when |
| --- | --- | --- | --- |
| BrowserBash `run_end` to Honeycomb events | Wide, typed verdict events (status, assertions, cost, duration) queryable next to traces | Low: pipe NDJSON to a POST | You want synthetic-check results correlated with backend telemetry |
| CI log scraping | Unstructured text you must parse per format | Medium and brittle | You have no other option and cannot change the pipeline |
| Slack-only alerts | Human-readable pings, no queryable history | Very low | Small team, no observability platform yet |
| OpenTelemetry span from a custom script | Full trace integration if you build the instrumentation | High | You already emit OTel everywhere and want spans, not events |

The honest read: if your endgame is spans and you have OTel plumbing everywhere, wrapping a BrowserBash run in a custom span exporter is the richer integration, and Honeycomb ingests OTel natively. The event approach in this guide is the pragmatic middle. It gives you 90 percent of the correlation value for a fraction of the work, because a verdict maps so cleanly onto a wide event. Start with events. Graduate to spans if and when you actually need the parent-child structure.

One thing to avoid claiming: BrowserBash does not replace your APM or your tracing. It is the open-source validation layer that sits in front of them, confirming the user-visible path works while your existing telemetry explains the backend behavior. The two are complements, not competitors.

## Querying and alerting once the events land

With verdicts flowing, the Honeycomb side is standard practice. A few queries earn their keep immediately:

- **Pass rate over time**, grouped by `check_name`, to spot a flow degrading before it fully breaks.
- **`COUNT` where `status = failed`**, broken down by `viewport`, to catch a bug that only shows up on mobile.
- **`P95(duration_ms)`** per check, so a slow-creeping flow surfaces as a latency trend rather than a sudden timeout.
- **`SUM(cost_usd)`** per day, to keep synthetic-monitoring spend visible next to its value.

For alerting, build a Honeycomb trigger on `COUNT` of failed verdicts crossing a threshold in a window. Because monitor mode already deduplicates to state transitions, you avoid the classic synthetic-monitoring noise problem where every green run and every flaky blip pages someone. The event stream is quiet by design, which makes the alerts that do fire worth reading.

When a trigger fires, the correlation you built pays off. Click into the failed verdict event, follow the shared `trace.trace_id` to the requests the browser actually made, and you are looking at the backend behavior behind the user-visible failure without switching tools. That round trip, from red check to root cause in one dataset, is the entire reason to send BrowserBash verdicts to Honeycomb in the first place.

## Who this integration is for

This pattern fits you if you already run Honeycomb and want your synthetic browser checks to stop living in a silo. It fits teams doing continuous deployment who need deploy markers, latency, and user-path validation in one view. And it fits anyone building AI agents who wants a real browser confirming the agent's work, with the verdict logged as data rather than a screenshot in a chat thread.

It is probably overkill if you have three flows and a two-person team. In that case, monitor mode with a Slack webhook is enough, and you can add Honeycomb later when the number of checks makes a queryable history worth having. It is also not the right first step if you have not yet written any browser checks at all. Get a couple of `*_test.md` files passing locally first, confirm the verdicts look right in `Result.md`, and only then wire the forwarder. The [BrowserBash blog](https://browserbash.com/blog) has walkthroughs for getting those first tests green.

Whichever end of that spectrum you are on, the wiring is the same three moving parts: agent-mode NDJSON out, a reshape step, a POST to a dataset. Nothing about it is BrowserBash-specific plumbing you have to maintain. It is your CLI's normal output going where your other telemetry already goes.

## FAQ

### How do I send BrowserBash results to Honeycomb?

Run BrowserBash in agent mode with the `--agent` flag, which emits NDJSON on stdout, one event per line. Grab the final `run_end` line, reshape its fields (status, summary, assertions, cost, duration) into a flat JSON object, and POST it to Honeycomb's events API at `https://api.honeycomb.io/1/events/<dataset>` with your `X-Honeycomb-Team` API key header. Each POST becomes one queryable event in your dataset.

### What data does a BrowserBash verdict contain?

The `run_end` event carries a deterministic `status` (passed or failed), a human `summary`, the ending `final_state`, an `assertions` array with expected-versus-actual evidence for each Verify check, an estimated `cost_usd`, and a `duration_ms`. The exit code mirrors the verdict: 0 for passed, 1 for failed, 2 for error or budget-stop, and 3 for timeout. Together the event and the exit code give you both the data to forward and the signal to fail a CI build.

### Can I correlate browser checks with my traces in Honeycomb?

Yes, by sharing a trace ID. Generate an ID before the run, inject it through BrowserBash `{{variables}}` templating so the browser sends it to your app, and stamp the same ID onto the Honeycomb verdict event as `trace.trace_id`. Honeycomb then joins the verdict event to any trace that carries the same ID, so a failed check links directly to the backend requests it exercised.

### Does an always-on monitor cost a lot in tokens?

No, because of the replay cache. A green run records its actions, and the next identical run replays them with zero model calls, so a monitor checking a stable flow every ten minutes is nearly token-free. The agent only re-engages the model when the page actually changes, at which point the check runs honestly and any state transition fires a notification you can forward to Honeycomb.

Ready to wire your browser checks into your observability stack? Install the CLI with `npm install -g browserbash-cli`, get a couple of tests passing, and pipe the verdicts to Honeycomb. An account is optional and everything runs locally, but if you want the hosted dashboard and cloud retention you can [sign up here](https://browserbash.com/sign-up).
