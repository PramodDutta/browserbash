---
title: Push BrowserBash Monitor Results to New Relic
description: "A practical BrowserBash New Relic integration guide: forward synthetic-check verdicts to the New Relic Events API from a monitor hook and build alerts."
date: 2026-06-18
category: ci
---

If you already run New Relic for APM and infrastructure, your synthetic browser checks should live in the same place as everything else you page on. This BrowserBash New Relic integration walks through exactly that: you write a plain-English test, run it on an interval, and forward each pass or fail verdict into New Relic as a custom event you can query, chart, and alert on. No selectors, no Selenium grid, no separate synthetics vendor bill. BrowserBash is a free, open-source (Apache-2.0) command-line tool that drives a real Chrome browser from an English objective and returns a deterministic verdict, and New Relic already knows how to ingest arbitrary events. The glue between them is a small hook, and by the end of this article you will have it running.

The reason to bother is correlation. When checkout starts failing at 03:14, you want the browser-check failure sitting on the same timeline as the p95 latency spike, the error-rate jump, and the deploy marker. Two dashboards in two tools is how incidents get missed. One event stream is how they get caught.

## Why route browser checks into New Relic at all

New Relic is a telemetry platform, not a test runner. It is excellent at storing events, running NRQL queries over them, drawing dashboards, and firing alert policies when a condition trips. What it does not do well is author and maintain end-to-end browser flows in plain English, run them against your own machine or CI, or default to free local models with nothing leaving your network. That is the gap BrowserBash fills, and it is why the two pair cleanly instead of overlapping.

New Relic does ship its own Synthetics product, and if you are already paying for it and happy, you may not need any of this. Be honest with yourself about that. What BrowserBash gives you that a hosted synthetics vendor usually does not: tests written as committable Markdown, an Ollama-first model story so checks can run with no API keys and nothing leaving your machine, and a replay cache that makes an always-on monitor nearly token-free. If those matter to you, forwarding the verdicts into New Relic gets you the best of both: cheap open-source authoring and running, plus New Relic's alerting and correlation.

The shape of the integration is simple. BrowserBash produces a verdict. New Relic has an Events API that accepts custom events over HTTPS. A thin hook takes the first and posts it to the second. Everything below is about making that hook reliable.

## What a BrowserBash verdict actually contains

Before you forward anything, you need to know the payload you are forwarding. BrowserBash emits structured results, not prose you have to scrape. In agent mode (`--agent`), it prints NDJSON, one JSON object per line, ending in a `run_end` event. That event carries the fields you care about: `status` (passed or failed), a `summary`, `final_state`, an `assertions` block for any Verify steps, `cost_usd`, and `duration_ms`. Exit codes are frozen public contract: `0` passed, `1` failed, `2` error or budget stop, `3` timeout.

That maps almost one-to-one onto a New Relic custom event. You pick an `eventType` (say `BrowserBashCheck`), then attach attributes: the status, the duration in milliseconds, the estimated cost, the test name, the environment, and whatever else you want to slice by later in NRQL. New Relic events are just flat key-value bags with a required `eventType`, so there is nothing exotic to model.

Here is a single run in agent mode so you can see the raw material:

```bash
# One-shot check, machine-readable NDJSON on stdout
browserbash run "Open https://shop.example.com, add the first product to the cart, \
  go to checkout, and verify the order summary shows a subtotal" \
  --agent --headless --timeout 120
```

The last line of that output is your `run_end` event. Grab it, reshape it into a New Relic event, and POST it. The rest of this article is that "grab and POST" step, done properly.

## The New Relic Events API in one paragraph

New Relic exposes an Event API endpoint that accepts custom events as JSON over HTTPS. You send a POST to the collector with an `Api-Key` header set to a New Relic Insert (ingest) key, a JSON body containing one event object or an array of them, and each object must include an `eventType`. New Relic accepts gzip-compressed bodies and returns quickly. The exact endpoint host, account path, and key management are all in New Relic's own documentation and can change, so treat the specifics as configuration rather than something to hardcode from a blog post. The stable idea you can rely on: a keyed HTTPS POST of a JSON event, and a `WHERE eventType = 'YourType'` NRQL query on the other side.

Two things trip people up. First, the Insert key is different from a user API key or a license key. Use the ingest/insert key meant for the Events API. Second, custom event attributes are typed on first sight, so send `duration_ms` as a number, not a string, or your NRQL `average(duration_ms)` will quietly return nothing.

## Wiring the monitor to New Relic

BrowserBash ships a monitor mode built for exactly this cadence. It runs a test or objective on an interval and alerts only when the verdict flips between pass and fail, in both directions, never on every green run. It knows Slack incoming-webhook URLs and formats for them automatically; any other URL gets the raw JSON payload.

That last detail is the crux of the New Relic integration and also its honest limitation. The New Relic Events API needs an `Api-Key` header and events shaped a specific way. The monitor's `--notify` webhook posts a plain JSON body and cannot set a custom auth header. So you do not point `--notify` straight at the New Relic collector. You point it at a tiny relay you control, and the relay adds the header and reshapes the body. This is a five-line function on any serverless platform, or a one-file service in your cluster.

```bash
# Run the check every 10 minutes; alert on state changes to your relay.
# The relay adds the New Relic Api-Key header and reshapes the payload.
browserbash monitor ./.browserbash/tests/checkout_test.md \
  --every 10m \
  --notify https://relay.internal.example.com/newrelic/browserbash \
  --auth shopper
```

The `--auth shopper` flag reuses a saved login so the checkout flow starts already signed in. You create that profile once with `browserbash auth save shopper --url https://shop.example.com/login`, log in by hand, press Enter, and BrowserBash stores the Playwright storageState. From then on every monitored run reuses it, which kills the re-login-every-run tax and keeps the check focused on the flow you actually care about.

### What the relay does

The relay is deliberately dumb. It receives the monitor's JSON on state change, wraps it into a New Relic event object with an `eventType` and typed attributes, sets the `Api-Key` header, and POSTs to the collector. Because the monitor only fires on flips, this relay is quiet by design: it sends a `BrowserBashCheck` event with `status: "failed"` when the flow breaks and another with `status: "passed"` when it recovers. Those two events are enough to drive a New Relic alert condition and to draw an uptime chart.

If you want a data point on every run and not just on flips, do not use monitor for the forwarding. Use a cron job or your CI scheduler that calls `browserbash run ... --agent`, parses the final `run_end` line, and POSTs to the relay unconditionally. That gives New Relic a dense time series (duration, cost, status every interval) that you can average and trend, at the price of more events. Pick based on whether you want alerting signal (monitor, sparse) or observability signal (cron, dense). Many teams run both against the same test.

## Turning verdicts into deterministic checks

A synthetic check is only as good as its assertions. If your test says "check that the page looks right," an AI judge decides what "right" means, and your New Relic event inherits that fuzziness. BrowserBash gives you a way out with deterministic Verify assertions.

In a `*_test.md` file, a `Verify` step compiles to a real Playwright check with no model in the loop: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, or a stored value equals. A pass means the condition genuinely held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the written Result.md table. When you forward that to New Relic, `status: "failed"` is trustworthy because a concrete assertion missed, not because a model felt unsure.

testmd v2 takes this further. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session, with two deterministic step types that never call a model: API steps to seed data and Verify steps to check it through the UI.

```bash
# .browserbash/tests/order_status_test.md
---
version: 2
auth: shopper
---
# Order status reflects a freshly created order

POST https://api.example.com/orders with body {"sku":"SKU-42","qty":1}
Expect status 201, store $.id as 'orderId'

Open https://shop.example.com/orders/{{orderId}}
Verify the page title contains "Order"
Verify the text "SKU-42" is visible
Verify the "Track shipment" button is visible
```

Run that with `browserbash testmd run` in `--agent` mode and the `run_end.assertions` array tells you precisely which Verify lines held. Forward the aggregate status plus the per-assertion detail into your New Relic event and you can build an alert that distinguishes "the API seed failed" from "the UI did not render the order," because both live as attributes on the same event. One caveat to keep honest: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. Plain v1 tests and single objectives still run happily on local models.

## Querying and alerting once the events land

With events flowing, New Relic does the part it is good at. You write NRQL against your event type and build the dashboards and alert policies.

A basic availability query looks like a count of failed checks over a window:

- Failures in the last hour: `SELECT count(*) FROM BrowserBashCheck WHERE status = 'failed' SINCE 1 hour ago`
- Average flow duration: `SELECT average(duration_ms) FROM BrowserBashCheck WHERE test = 'checkout' TIMESERIES`
- Cost trend for the check: `SELECT sum(cost_usd) FROM BrowserBashCheck SINCE 1 day ago FACET test`

Wire an alert condition to the first query with a threshold of one or more failures and you get a New Relic notification, an incident, and correlation with the rest of your telemetry, all without BrowserBash knowing anything about New Relic's alerting internals. The division of labor is clean: BrowserBash decides pass or fail, New Relic decides who gets paged and shows the failure next to the deploy that caused it.

Because you can attach a deployment marker in New Relic and your BrowserBash events share the same timeline, a failed checkout event landing 90 seconds after a deploy marker is a story that tells itself on the chart. That correlation is the entire payoff of routing checks into an observability platform instead of a standalone synthetics tab.

## A realistic reference architecture

Here is how the pieces fit for a team already on New Relic:

| Layer | Tool | Responsibility |
| --- | --- | --- |
| Test authoring | BrowserBash `*_test.md` | Plain-English flows, committed to the repo, reviewed in PRs |
| Assertions | BrowserBash Verify / testmd v2 | Deterministic pass or fail, no LLM judgment |
| Scheduling | `browserbash monitor` or CI cron | Runs the check on an interval |
| Verdict transport | Monitor `--notify` or `--agent` NDJSON | Emits status, duration, cost, assertions |
| Header + reshape | Your small relay | Adds `Api-Key`, maps to a New Relic event |
| Storage + query | New Relic Events API + NRQL | Charts, dashboards, retention |
| Paging | New Relic alert policy | Notifies humans, opens incidents |

Notice BrowserBash owns everything up to the verdict and New Relic owns everything after it. The relay is the seam, and it exists only because the Events API wants an auth header the generic webhook cannot set. If New Relic ever accepts keyless webhook ingest for your use case, the relay disappears and `--notify` points straight at it. Until then, keep the relay tiny and boring.

For CI, you can also skip the always-on monitor and run the suite inside your pipeline. BrowserBash has an official GitHub Action that installs the CLI, runs the suite, uploads JUnit and NDJSON and result artifacts, and posts a self-updating PR comment with the verdict table. A pipeline step after it can read the NDJSON artifact and post the same events to your relay, so pull-request checks and production monitors feed one New Relic event type. Details are in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), and the broader command reference lives in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Keeping the monitor cheap and quiet

Two design choices keep this from becoming noisy or expensive.

First, the replay cache. A green BrowserBash run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. For an always-on New Relic monitor running every ten minutes, that means most runs are effectively free: the browser still drives the flow and still produces a real verdict, but no tokens are spent while nothing has changed. Your `cost_usd` attribute in New Relic will show near-zero on cache hits and a small spike when the page shifts and the agent re-plans, which is itself a useful signal.

Second, the monitor's flip-only alerting. Because monitor mode fires only when the verdict changes state, your relay is not hammered every interval and New Relic is not flooded with identical green events. You get an event when checkout breaks and an event when it recovers. If you also want the dense time series for dashboards, add the separate cron-plus-`--agent` path described earlier and let it carry the high-volume, low-signal data while monitor carries the alerts.

On model choice, a fair caveat: very small local models (around 8B and under) can be flaky on long multi-step objectives, so a monitored checkout flow that has to add to cart, log in, and reach a summary page is better served by a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model. A flaky model produces flaky verdicts, and flaky verdicts produce false New Relic alerts. Match the model to the flow's difficulty and your on-call thanks you. You can read more about tuning runs in the [BrowserBash learn hub](https://browserbash.com/learn).

## When this integration is the right call

Reach for a BrowserBash New Relic integration when all of these are true: you already run New Relic and want one incident timeline, you want your browser checks version-controlled as plain-English Markdown rather than locked in a vendor UI, and you care about running checks cheaply on your own infrastructure with local models. The combination is genuinely strong for teams that treat synthetics as code and observability as the source of truth.

Be equally clear about when it is not the right call. If you are deep in New Relic Synthetics already, have private-location runners deployed, and are satisfied, adding a second check runner is extra moving parts for little gain. If you have no New Relic footprint at all and just want a Slack ping when checkout breaks, skip the relay entirely and point `browserbash monitor --notify` at a Slack incoming webhook, which BrowserBash formats natively. And if your flows are trivial and static, a plain HTTP uptime check may be all you need. Use the heaviest tool only where the flow is real, multi-step, and worth an on-call page. The [BrowserBash features overview](https://browserbash.com/features) lays out the full surface so you can judge fit before committing.

The honest summary: BrowserBash is the open-source validation layer that authors and runs the check, and New Relic is where the verdict earns its keep through correlation and alerting. Neither replaces the other. The relay is fifteen minutes of work, and once it is in place every new `*_test.md` you commit shows up in New Relic for free.

## FAQ

### Does BrowserBash send data to New Relic out of the box?

No. BrowserBash produces structured verdicts through agent-mode NDJSON and monitor webhooks, but it has no built-in New Relic exporter. You forward the verdict yourself with a small relay that adds the New Relic Api-Key header and reshapes the payload into a custom event. This keeps BrowserBash observability-agnostic and lets you send the same verdicts to any platform you use.

### Why can't the monitor post directly to the New Relic Events API?

The monitor's notify webhook posts a plain JSON body and cannot set a custom authentication header, while the New Relic Events API requires an Api-Key header and a specific event shape. A thin relay between them solves this in a few lines: it receives the monitor's JSON, adds the header, wraps the data in a custom event, and posts it to the collector. If New Relic ever supports keyless ingest for your case, the relay is no longer needed.

### How do I avoid false alerts from flaky checks?

Use deterministic Verify assertions or testmd v2 so a failed status reflects a real missed condition rather than an uncertain AI judgment, and match your model to the flow's difficulty. Very small local models can be unreliable on long multi-step flows, so use a mid-size local model or a capable hosted model for a hard checkout path. Monitor mode also alerts only on pass-to-fail and fail-to-pass transitions, which suppresses repeated identical noise.

### Is this integration expensive to run continuously?

It is cheap by design. BrowserBash's replay cache lets an identical monitored run replay recorded actions with zero model calls until the page changes, so most intervals cost effectively nothing while still producing a genuine verdict. The forwarded cost_usd attribute lets you watch spend directly in New Relic, and monitor mode's flip-only alerting keeps event volume low unless you deliberately add a dense time series.

Ready to try it? Install with `npm install -g browserbash-cli`, write one `*_test.md`, and run it in agent mode to see the `run_end` verdict you will forward. An account is optional and everything above runs locally, but if you want the hosted dashboard and cloud features you can [sign up here](https://browserbash.com/sign-up).
