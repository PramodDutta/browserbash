---
title: Send BrowserBash Alerts to Squadcast On-Call
description: "A practical browserbash squadcast integration guide: forward failed browser-flow alerts to Squadcast on-call for fast, deduplicated incident response."
date: 2026-06-22
category: ci
---

If your checkout page silently breaks at 2am, you want the on-call engineer paged, not a red line buried in a CI log nobody reads until morning. A **browserbash squadcast integration** closes that gap: BrowserBash drives a real Chrome browser through your critical user flows in plain English, and when a flow that was passing suddenly fails, the alert lands as a Squadcast incident that follows your escalation policy. This guide walks through wiring the two together, from a five-minute monitor-mode webhook to a production-grade CI bridge that opens and auto-resolves incidents.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective like "log in and confirm the dashboard loads," an AI agent executes it step by step against a real browser, and you get back a deterministic verdict plus structured JSON. Squadcast is an incident-response and on-call platform that ingests events, deduplicates them, and routes pages through escalation policies. Put them together and BrowserBash becomes the synthetic-monitoring signal that decides when your team gets woken up.

## Why route browser-flow failures into Squadcast at all

Most synthetic monitoring tells you a page returned a 200. That is a weak signal. A page can return 200 while the login button is dead, the cart total is wrong, or a third-party script blocks the "Place order" flow. BrowserBash validates the flow the way a user experiences it: it navigates, clicks, types, waits, and reads the page, then returns `passed`, `failed`, `error`, or `timeout`. That verdict is exactly the kind of high-signal event Squadcast is built to act on.

The value of pushing these verdicts into Squadcast instead of Slack-only pings is threefold. First, escalation: if the primary on-call does not acknowledge in five minutes, Squadcast walks the ladder to the secondary and then the manager. Second, deduplication: a flow that fails every ten minutes should be one open incident, not thirty-six pages by morning. Third, accountability: Squadcast keeps the incident timeline, the acknowledgement, and the postmortem in one place. Slack is great for chatter, but it does not guarantee anyone is actually paged.

There is an honest caveat here. Squadcast's exact incoming-webhook payload contract, alert-source templates, and API rate limits are configured per account and are not publicly fixed, so the field names below are the ones you will map in your Squadcast alert-source or transformer, not a universal schema. Treat the JSON BrowserBash emits as the raw input and shape it to whatever your Squadcast alert source expects.

## How BrowserBash decides what is worth paging for

The heart of any alerting setup is deciding *when* to fire. BrowserBash gives you two clean mechanisms.

The first is **monitor mode**. `browserbash monitor` runs a test or objective on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run. That last part matters for on-call sanity. If your login flow is healthy and stays healthy, Squadcast hears nothing. The moment it flips to failing, you get one event. When it recovers, you get a recovery event you can use to auto-resolve the incident. This state-change model is the difference between a useful pager and one your team mutes within a week.

The second mechanism is **CI exit codes**. Every run returns a frozen, documented exit code: `0` passed, `1` failed, `2` error or infrastructure or budget-stop, `3` timeout. In a pipeline, a non-zero exit from a BrowserBash suite is your trigger to open a Squadcast incident through their events API. This path suits deploy-gate and post-deploy smoke checks, where the browser flow runs as part of a job rather than on a standalone clock.

Both mechanisms emit the same structured verdict, so the shape of the data you forward to Squadcast is consistent no matter which you pick. If you are new to writing the flows themselves, the [BrowserBash tutorials](https://browserbash.com/tutorials) walk through building your first plain-English test before you bolt on alerting.

## The fastest path: monitor mode straight to a webhook

The simplest browserbash squadcast integration is a single long-running monitor that posts to a Squadcast incoming-webhook URL. Squadcast lets you create a webhook alert source that accepts an inbound JSON POST and turns it into an incident. BrowserBash's monitor detects Slack webhook URLs and applies Slack formatting automatically; any other URL, including a Squadcast one, receives the raw JSON payload. That raw payload is what you want here, because Squadcast's alert source will parse the fields itself.

Here is a monitor watching a login flow every ten minutes and notifying a Squadcast webhook:

```bash
# Install once
npm install -g browserbash-cli

# Watch a critical flow and alert Squadcast only on state changes
browserbash monitor "Open https://app.example.com, log in with {{email}} and {{password}}, and confirm the text 'Dashboard' is visible" \
  --every 10m \
  --notify https://api.squadcast.com/v2/incidents/api/<your-webhook-key> \
  --auth prod-user
```

A few things are doing real work in that command. `--every 10m` sets the interval. `--notify` is the Squadcast webhook. `--auth prod-user` reuses a saved login session so the monitor does not have to type credentials from scratch every cycle (more on that below). Because monitor mode fires only on transitions, Squadcast receives an event when the flow breaks and another when it heals, and nothing in between.

There is a cost angle worth calling out. An always-on monitor could get expensive if every cycle called a model. BrowserBash's replay cache prevents that: a green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. That makes a ten-minute Squadcast monitor nearly token-free while it stays green, which is most of the time. You can read more about how the caching and orchestration work on the [features page](https://browserbash.com/features).

### Mapping the payload in Squadcast

When the raw verdict JSON reaches your Squadcast webhook alert source, you map its fields to incident properties. The verdict carries `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. A sensible mapping:

- `status` drives whether you trigger or resolve. A `failed`, `error`, or `timeout` opens an incident; a recovery event can auto-resolve it.
- `summary` becomes the incident title so the on-call sees "Checkout flow failed at payment step" rather than a generic "monitor alert."
- `assertions` and `final_state` go into the incident body as evidence, so whoever acknowledges has the expected-vs-actual detail without re-running anything.
- A stable dedup key (the test name plus the target URL) keeps repeated failures collapsed into one incident.

Because Squadcast's transformer language and field names are account-specific, build this mapping in your alert source and test it with one deliberate failure before you trust it in production.

## Making the failure evidence actually useful

An incident that just says "a test failed" wastes the on-call engineer's first ten minutes. BrowserBash's deterministic Verify assertions are what make the Squadcast incident actionable.

`Verify` steps in a test file compile to real Playwright checks with no LLM judgment: URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and stored-value equality. When one fails, `run_end.assertions` carries expected-vs-actual evidence, and the same detail lands in the human-readable `Result.md`. Forward that assertions block into the Squadcast incident body and the engineer sees exactly which condition broke: "Expected 'Order confirmed' heading visible, actual: not found." That is a root-cause hint, not a mystery.

Here is a testmd v2 file that seeds a cart through the API, then verifies the UI, so a Squadcast page tells you precisely which layer failed:

```bash
# checkout_test.md
---
version: 2
auth: prod-user
---

# Checkout confirmation

POST https://api.example.com/carts with body { "sku": "SKU-42", "qty": 1 }
Expect status 201, store $.cart_id as 'cart'

Open https://shop.example.com/cart/{{cart}} and start checkout
Type {{card}} into the card number field and place the order

Verify text 'Order confirmed' is visible
Verify URL contains /orders/
```

Run it, and if the `Verify` line fails you know the checkout UI broke even though the API seeded the cart cleanly. That separation of concerns is gold in an incident: it tells the on-call whether to look at the frontend, the payment integration, or the backend. Verify lines that fall outside the deterministic grammar still run, but agent-judged and flagged `judged: true`, so you can always tell a hard check from a soft one. The [BrowserBash learn hub](https://browserbash.com/learn) covers the full Verify grammar and testmd v2 step types in detail.

One honest limit: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run those API-plus-Verify hybrid flows directly on Ollama or OpenRouter. Plain single-objective monitors, by contrast, run happily on free local models.

## Wiring it into CI so deploys can page on-call

Monitor mode is the always-on path. The other half of a solid browserbash squadcast integration is the deploy gate. You want a failed post-deploy smoke test to open a Squadcast incident automatically, because a bad deploy is exactly when you want humans paged.

BrowserBash is built for this. `--agent` mode emits NDJSON, one JSON event per line on stdout, so there is no prose to parse. The suite verdict is the process exit code plus the presence of a `run_end` event. A small bridge in your pipeline reads that verdict and calls Squadcast's events API to trigger or resolve.

```bash
# post-deploy smoke check, machine-readable output
browserbash run-all .browserbash/tests \
  --agent \
  --junit out/junit.xml \
  --budget-usd 2.00 > out/events.ndjson
code=$?

# 0 = passed, 1 = failed, 2 = error/budget-stop, 3 = timeout
if [ "$code" -ne 0 ]; then
  # forward the final verdict to Squadcast's events API to open an incident
  curl -sS -X POST "https://api.squadcast.com/v2/incidents/api/<webhook-key>" \
    -H 'Content-Type: application/json' \
    --data @<(tail -n1 out/events.ndjson)
fi
```

That `--budget-usd 2.00` guard is quietly important on hosted models: `run-all` stops launching new tests once the suite crosses the budget, reports the remainder as `skipped`, and exits `2`. In the bridge above, exit `2` still pages, which is correct: a budget stop means your suite did not finish validating, and someone should know. The spend also lands in `RunAll-Result.md` and the JUnit `<properties>`, so you have a paper trail.

If you would rather not hand-roll the bridge, the official GitHub Action does most of this for you. It installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, and posts a self-updating PR comment with the verdict table. You can add a failure step that calls Squadcast on a non-zero result. The [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) cover the inputs, including `shard:` matrix jobs and `budget-usd:`.

### Sharding without confusing your incidents

For large suites you will shard across CI machines with `run-all --shard 2/4`. The slice is computed on sorted discovery order, so parallel machines agree on who runs what without coordinating. When you forward failures to Squadcast from sharded jobs, include the shard label and viewport in the dedup key. Otherwise shard 2 and shard 3 failing the same test create two incidents. A dedup key of `test-name + viewport + target-url` keeps them collapsed correctly while still separating a genuine desktop-only versus mobile-only break, since `--matrix-viewport 1280x720,390x844` runs each test once per viewport and labels it in events, JUnit, and results.

## Saved logins keep an always-on monitor sane

An on-call monitor that has to log in from scratch every ten minutes is fragile and slow. BrowserBash's saved-login feature fixes that. `browserbash auth save prod-user --url https://app.example.com/login` opens a browser, you log in once, press Enter, and it saves the session as a Playwright storageState. Reuse it with `--auth prod-user` on `run`, `testmd`, `run-all`, and `monitor`, or via `auth:` frontmatter in a test file.

```bash
# save the session once, interactively
browserbash auth save prod-user --url https://app.example.com/login

# every monitor cycle now reuses that session
browserbash monitor ./checkout_test.md \
  --every 15m \
  --notify https://api.squadcast.com/v2/incidents/api/<webhook-key> \
  --auth prod-user
```

There is a helpful guardrail: if a saved profile's origins do not cover the target start URL, BrowserBash prints a warning instead of silently doing nothing. That saves you from the classic false-negative where a monitor "passes" only because it never actually reached the authenticated page. For a Squadcast setup this matters, because a silent no-op monitor is worse than no monitor: it gives you false confidence that nobody is being paged for a real outage.

## BrowserBash-to-Squadcast versus other alerting paths

You have options for getting a browser-flow failure to your on-call. Here is an honest comparison of the realistic paths, so you can pick the one that fits your team.

| Path | Sets up in | Escalation and dedup | Best for |
| --- | --- | --- | --- |
| Monitor mode to Squadcast webhook | Minutes | Squadcast handles both | Always-on synthetic checks on critical flows |
| CI exit-code bridge to Squadcast events API | An hour | Squadcast handles both | Deploy gates and post-deploy smoke tests |
| Monitor mode to Slack webhook | Minutes | Slack does neither well | Team visibility, not guaranteed paging |
| GitHub Action PR comment only | Minutes | None (informational) | Blocking a bad PR, not waking anyone up |

The trade-off is clear. If you need someone actually paged with escalation, Squadcast is the destination and either the monitor webhook or the CI bridge is the pipe. If you only need a channel to see red, a Slack webhook via monitor mode is less setup. And if the flow is a PR gate rather than a production outage, the GitHub Action's PR comment is the right, quieter tool. Do not page humans for a failing PR check that already blocks the merge.

Be balanced about where Squadcast itself may be overkill. If you are a solo maintainer with no rotation, standing up a full incident-management platform to catch a broken login flow is more machinery than you need, and a Slack ping or an email will do. Squadcast earns its place once you have a real on-call rotation, an escalation policy, and a need for postmortems. BrowserBash is the same signal source either way; only the destination changes.

## A realistic rollout plan

Rolling this out cleanly avoids the two classic failure modes: alert fatigue on one side and silent gaps on the other.

Start with one flow. Pick the single most business-critical journey (usually login or checkout) and write it as a plain-English objective or a testmd file with a couple of `Verify` assertions. Run it locally until it is green and stable. Flakiness at this stage is your problem to fix, not Squadcast's, and a very small local model (roughly 8B and under) can be flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows.

Next, run it in monitor mode pointed at a *test* Squadcast alert source, not your production escalation policy. Force a failure (break a selector-free step by pointing at a staging URL that is down) and confirm the incident opens with the summary and assertions you expect. Then force a recovery and confirm your resolve path closes it. Only after that round-trip works do you point `--notify` at the real policy.

Then expand. Add flows one at a time, each with its own dedup key, and lean on the replay cache to keep the whole fleet nearly token-free while healthy. If you are running in CI as well, add the exit-code bridge as a separate, clearly-labeled alert source so a deploy-gate page is visually distinct from a synthetic-monitor page in Squadcast's timeline.

Finally, review noise weekly for the first month. If a flow flaps, either the flow is genuinely flaky (fix the test) or the underlying app is genuinely flaky (that is a real signal, keep it). BrowserBash's run history helps here: `run-all` orders previously-failed and slowest tests first and flags flaky ones, so you can spot an unstable flow before it trains your on-call to ignore the pager. The [case studies](https://browserbash.com/case-study) show how teams tune this balance over time.

## Keeping costs and tokens under control

On-call monitoring runs forever, so cost discipline is not optional. Three levers keep a browserbash squadcast integration cheap.

The replay cache is the big one. While a flow stays green, repeated monitor cycles replay recorded actions with zero model calls. You pay tokens only on the cycle where the page actually changed, which is usually the cycle that is about to page you anyway. The `cost_usd` field in `run_end`, drawn from a bundled per-model price table, lets you watch spend per run (unknown models get no estimate rather than a wrong one).

For CI suites, `--budget-usd` is a hard stop, and `--budget-tokens` works the same way on token count. And for the hard flows where you want a strong model to plan but not to execute every keystroke, cheap-model routing via `--model-exec` lets you plan on a capable model and execute on a cheaper one. None of this is Squadcast-specific, but it is what makes running dozens of synthetic Squadcast checks financially boring rather than a line item your finance team questions. The [pricing page](https://browserbash.com/pricing) lays out what stays free forever (everything that runs on your machine) versus the optional hosted extras.

## FAQ

### What is a browserbash squadcast integration?

It is a setup where BrowserBash runs your critical browser flows in plain English and forwards failed-flow verdicts to Squadcast as incidents. BrowserBash produces the high-signal event (a real login or checkout flow actually broke), and Squadcast handles the on-call response: paging, escalation, deduplication, and the incident timeline. You connect them either through monitor mode posting to a Squadcast incoming webhook, or through a CI exit-code bridge that calls Squadcast's events API.

### How do I send only real failures to Squadcast instead of every run?

Use BrowserBash monitor mode, which alerts only on pass-to-fail and fail-to-pass state changes, never on every green run. A healthy flow stays silent; Squadcast hears from it only when the state flips, and again when it recovers so you can auto-resolve the incident. For CI-triggered pages, gate on the process exit code (non-zero means failed, error, budget-stop, or timeout) so passing suites never open an incident.

### Do I need an Anthropic or OpenAI API key to run this?

Not for basic single-objective monitors. BrowserBash is Ollama-first and defaults to free local models with no API keys and nothing leaving your machine. The one exception is testmd v2, the hybrid format that mixes deterministic API steps with UI Verify checks: it currently runs on the builtin engine, which needs an Anthropic API key or a compatible gateway. Plain monitor-mode objectives run fine on a capable local model.

### Can Squadcast auto-resolve the incident when the flow recovers?

Yes, and this is one of the main reasons to use monitor mode. Because BrowserBash fires a state-change event in both directions, you get a recovery event when a previously failing flow goes green again. Map that recovery event to a resolve action in your Squadcast alert source or events API call, and the incident closes itself without anyone touching the pager. Confirm the round-trip against a test alert source before pointing it at your production escalation policy.

Ready to page on real user-flow failures instead of hollow 200s? Install with `npm install -g browserbash-cli`, write one plain-English monitor, and point `--notify` at your Squadcast webhook. An account is optional and everything on your machine stays free, but if you want hosted retention and the cloud dashboard you can [sign up here](https://browserbash.com/sign-up).
