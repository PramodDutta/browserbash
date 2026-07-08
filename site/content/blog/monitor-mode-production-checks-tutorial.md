---
title: Turn Any Test Into a Production Monitor With browserbash monitor
description: "A hands-on tutorial on browserbash monitor mode production checks: --every, --notify, Slack autodetection, and the replay cache."
date: 2026-07-16
category: tutorial
---

If you already have a `*_test.md` file that logs in, adds something to a cart, and checks out, you have most of a production monitor sitting in your repo and you probably don't know it. Browserbash monitor mode production checks turn that same file, the exact one your CI already runs on every pull request, into a scheduled watchdog that pings your real production site on an interval and tells you the moment it breaks. No separate monitoring tool, no synthetic-test DSL to learn, no dashboard subscription just to get a Slack alert when checkout stops working at 2am.

This is a tutorial, so we're going to build one from scratch: pick a test, point it at production, set an interval, wire up a notification, and then look at why running an AI-driven browser check every 10 minutes, 24 hours a day, doesn't turn into a surprise bill at the end of the month. That last part matters more than it sounds. An LLM-driven agent that re-reasons about the page on every single run would be an expensive way to babysit a login page. Browserbash doesn't do that, and understanding why is the difference between "I'll try monitor mode" and "I run monitor mode on six flows and forgot it's even running."

## What browserbash monitor actually does

`browserbash monitor` is the fifth of the ten features shipped in v1.5.0, and it's the simplest one to explain: it wraps `run` or `testmd run` in a loop. You give it a test file (or a plain-English objective) and an interval, and it keeps executing that check forever, or until you kill the process. Nothing about the underlying execution changes, it still drives a real Chrome browser, it still returns a structured verdict, it still writes NDJSON if you ask for it. The only new thing is the scheduling wrapper and the alerting logic on top.

That's a deliberate design choice worth calling out. A lot of "synthetic monitoring" products are built as a separate product surface: different config format, different runner, different assertion syntax from your test suite. Browserbash monitor mode is not a different product. It is the same test file, the same engine, the same assertions you already trust in CI, running on a clock instead of a webhook. If a test passes in your PR pipeline and passes locally, you already know what it will do in monitor mode, because it is the identical artifact.

## The basic command

Here is the minimal invocation, monitoring a login flow every 10 minutes:

```bash
browserbash monitor .browserbash/tests/login_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

`--every` accepts a duration string (`10m`, `1h`, `30s` if you're impatient, though sub-minute intervals against a real page are rarely necessary). `--notify` takes any HTTP(S) URL. That's the whole surface area for the common case. You can also point monitor at a plain-English objective instead of a file, the same way `run` works:

```bash
browserbash monitor "Go to https://app.example.com/login, sign in as demo@example.com, and verify the dashboard heading is visible" --every 15m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Both forms behave identically underneath: each interval tick is a fresh execution of `run` (for the objective form) or `testmd run` (for the file form), with the same engine and provider selection you'd use manually. If your test file has `auth:` frontmatter pointing at a saved login profile, or you pass `--auth <name>` on the monitor command itself, every tick reuses that session instead of re-logging-in from scratch, which matters a lot once you're checking authenticated flows every few minutes.

## Building a real monitor: checkout flow example

Let's walk through something closer to what you would actually run in production: a checkout smoke test. Assume you already have this file from your CI suite, or something close to it:

```markdown
# Checkout smoke test

- Go to https://shop.example.com
- Search for "wireless keyboard" and open the first result
- Add it to the cart
- Go to the cart and click checkout
- Fill the shipping form with {{shipping_name}}, {{shipping_address}}, {{shipping_city}}
- Verify 'Place order' button visible
- Click 'Place order'
- Verify text "Order confirmed" visible
```

This file already works in CI against a staging environment. To turn it into a production monitor, you don't rewrite it. You point the same file at production (usually via an environment-specific variables file or a `--var` override for the base URL) and run it under `monitor` instead of `testmd run`:

```bash
browserbash monitor .browserbash/tests/checkout_test.md --every 10m --notify https://hooks.slack.com/services/T000/B000/XXXX --auth prod-shopper
```

`--auth prod-shopper` reuses a saved storageState profile created earlier with `browserbash auth save prod-shopper --url https://shop.example.com/login`, so the monitor is not burning a login flow (and a real user session token) on every single tick. That single flag is doing a lot of quiet work here: it is the difference between a monitor that hammers your login form 144 times a day and one that authenticates once and reuses the session, the same tradeoff you'd make running this manually.

Run this in a long-lived process, a tmux session, a systemd unit, a small VM, wherever you'd run any other long-running poller. Browserbash monitor does not manage its own daemonization or persistence across reboots, it is a foreground process that loops, so you supply the process supervisor.

## The pass-to-fail alert rule, and why it's the right default

This is the part of monitor mode that is easy to get wrong if you build it yourself, and it is the part BrowserBash gets right out of the box: it only alerts on state changes, in both directions.

Concretely: if the checkout flow passes on tick 1, passes on tick 2, passes on tick 3, you get zero notifications. Nothing happens. Silence is the expected, correct behavior of a healthy monitor. If tick 4 fails, that is a pass-to-fail transition, and you get exactly one alert. If tick 5, 6, 7, and 8 also fail because the underlying issue hasn't been fixed yet, you get nothing more, because the state hasn't changed, it is still "failing." The moment tick 9 passes again, that is a fail-to-pass transition, and you get one more alert telling you it recovered.

Compare that to the naive approach, which is what a lot of homegrown cron-plus-curl monitors do by accident: alert on every failed run. If your checkout flow breaks at 2am and stays broken until someone wakes up at 7am, a monitor that fires on every failing tick with a 10-minute interval sends you 30 identical Slack messages before anyone has had coffee. That is not monitoring, that is an alert-fatigue generator, and it is exactly the kind of thing that gets a Slack channel muted within a week. The pass-to-fail-only rule means every notification you get is meaningful: something changed. You get told once when it broke, and once when it is fixed. Nothing in between.

This also means monitor mode is safe to leave running against something flaky without becoming annoying, though "flaky" is worth a caveat here. If a flow genuinely flips between pass and fail on every tick because the underlying page or the test itself is unstable, you will get an alert per flip, which is arguably correct: a flapping production flow is worth knowing about too, and that flapping pattern itself is diagnostic information you would not get from a monitor that just alerts on every failure.

## Slack autodetection: point it at a webhook, get formatted messages

The `--notify` flag does not require you to pick a "mode." Browserbash inspects the destination URL: if it looks like a Slack incoming webhook (the `hooks.slack.com/services/...` pattern), it formats the payload as a proper Slack message, readable in a channel without any post-processing on your end. Point the same flag at any other HTTPS endpoint, your own webhook receiver, a PagerDuty integration URL, an internal alerting service, and you get the raw JSON payload instead, so you can parse it however your system expects.

Setting up the Slack side is the standard Slack incoming-webhook flow: create an app in your workspace (or use an existing one), enable incoming webhooks, pick a channel, copy the URL. That URL is what goes after `--notify`. There is no BrowserBash-specific Slack app to install, no OAuth flow, no bot token, it is a plain webhook POST, which means it also works with things that speak "Slack-compatible webhook," like several open-source Slack-alternative chat tools.

```bash
browserbash monitor .browserbash/tests/checkout_test.md \
  --every 10m \
  --notify https://hooks.slack.com/services/T000/B000/XXXX
```

If you would rather send to a generic endpoint and handle formatting yourself, for example forwarding into an existing incident-management pipeline, just swap in that URL:

```bash
browserbash monitor .browserbash/tests/checkout_test.md \
  --every 10m \
  --notify https://alerts.internal.example.com/webhooks/browserbash
```

Same command shape, same pass-to-fail alerting rule, different payload format on the wire. You do not configure which mode you are in, the URL itself decides it.

## Why an always-on AI monitor doesn't burn tokens on every tick

Here is the question anyone who has used an LLM-driven browser agent should be asking: if every tick of this monitor is an AI agent re-reading the page and re-deciding what to click, doesn't running that every 10 minutes, forever, cost real money in model tokens? For a naive implementation, yes, and that is a legitimate reason to be skeptical of "AI-native" monitoring. BrowserBash's answer to this is the replay cache, and it is the single feature that makes monitor mode practical rather than theoretical.

Here is how it works. The first time a test runs and passes, BrowserBash records the concrete actions the agent took, the clicks, the fills, the navigations, as a journal, keyed to the page origin. On the next run of that same test, if the page has not materially changed, BrowserBash replays those recorded actions directly against the DOM. No model call. No reasoning step. It is executing a known-good action sequence, the same way a traditional Playwright script would, except it was generated from an English description instead of hand-written selectors. The agent only steps back in, spends tokens, re-reasons about the page, when the replay hits something it does not recognize: a changed layout, a moved button, a new modal. That is the "heal on miss" behavior, and it is origin-pinned, so a cached journal for `shop.example.com` never gets applied somewhere it was not recorded for.

For a monitor ticking every 10 minutes against a stable production page, this means the overwhelming majority of runs are cache hits: zero model calls, fast execution, no API cost. You only pay for reasoning on the runs where something actually changed, which is exactly the small subset of runs where you would want a smarter check anyway. This is also why saved auth (`--auth`) pairs so well with monitor mode: a stable authenticated session plus a stable replay cache means a 24/7 checkout monitor spends most of its life doing deterministic browser automation, with the LLM as a fallback for the moments the page drifts, not as the thing doing the work on every single tick.

Secrets stay out of the cache regardless of how many times the monitor runs. The Stagehand engine path never pre-substitutes secret values into the objective it sends anywhere, it passes a variables map instead. The builtin engine path re-templatizes recorded values back to `{{name}}` before writing the journal. Cached actions that involve a secret-typed field are origin-pinned and fail closed if a mismatched origin somehow shows up. A monitor that has been running against your production login page for three months does not accumulate a growing liability of stored credentials in a cache file, because the cache was never designed to hold them.

## Reading monitor output and wiring it into on-call

Monitor mode's output is the same verdict shape you would get from any other browserbash run: a `status` (passed or failed), a `summary`, a `final_state`, and, if you are using deterministic `Verify` assertions in your test file, a structured `assertions` block with expected-versus-actual evidence rather than a vague pass or fail. If you run monitor with `--agent`, you get NDJSON step events on stdout for the run in progress, which is useful if you are piping the process's own output into something (a log aggregator, a local dashboard tail) separate from the `--notify` alert path.

A practical setup looks like this: run `browserbash monitor` for each critical flow (login, search, checkout, whatever your top user journeys are) as a separate long-lived process, each with its own `--notify` target routed to the right channel, each on an interval that matches how quickly you would want to know about a break (5 to 15 minutes is typical for anything customer-facing). Put these behind a process supervisor so a machine reboot does not quietly kill your monitoring. If you already run `browserbash dashboard` locally or use `browserbash connect` for the optional cloud dashboard, monitor runs show up there the same way any other run does, since under the hood each tick is just a normal run.

### A note on test design for monitors specifically

Not every test file makes a good monitor as-is. A CI test that seeds data through an API step, then checks a UI, then tears the data down, is fine to run once per PR but wasteful to run every 10 minutes forever if the teardown itself is slow or has side effects on a shared production resource. When you are converting an existing CI test into a monitor, look for anything that writes data (creates an order, sends an email, charges a card in a sandboxed but still logged payment provider) and either point it at a dedicated test account that is safe to hit repeatedly, or scope the monitor down to the read-only parts of the flow: can you log in, can you search, can you reach the checkout page and see the right total, without actually placing an order every 10 minutes. Verify assertions are useful here because they let you check state (a button is visible, a total matches, a heading renders) without necessarily completing a mutating action.

## Monitor mode versus a dedicated uptime tool

It is worth being honest about where monitor mode fits and where it does not. A pure uptime checker, ping a URL, check for a 200, alert if it times out, is cheaper and simpler than spinning up a real browser every few minutes, and if all you need is "is the server up," use that instead. Monitor mode earns its keep on flows a status-code check cannot see: does login actually work end to end, does the cart total calculate correctly, does the confirmation page actually render after checkout. Those are things that can be broken while your server returns a perfectly healthy 200 on every endpoint.

| Need | Better fit |
|---|---|
| Is the server responding at all | Plain uptime/ping checker |
| Does a multi-step user flow (login, checkout, search) actually work | `browserbash monitor` |
| API endpoint health with strict SLAs, sub-second polling | Dedicated API monitoring tool |
| Full user journey validated in plain English, same test file as CI | `browserbash monitor` |
| Enterprise on-call with escalation policies, paging rotations | A dedicated incident tool, with BrowserBash's webhook feeding into it |

That last row is the realistic production pattern: monitor mode does not try to be your paging system. It tells you, via webhook, exactly when a real user flow starts or stops working. What happens with that signal, who gets paged, what the escalation policy is, is better handled by a tool built for that job. Point `--notify` at whatever ingests your alerts today and let monitor mode be the thing that generates a trustworthy signal, not the thing that decides who loses sleep over it.

## Combining monitor mode with the rest of the toolchain

Monitor mode does not exist in isolation from the rest of what BrowserBash ships. If your monitor test file uses `Verify` assertions, you get deterministic pass/fail evidence rather than agent judgment on the checks that matter most, which is exactly what you want feeding an unattended alerting pipeline: you do not want a monitor's verdict quietly drifting based on how an LLM interprets a page on a given day. If you have already built out an MCP integration so Claude Code or another agent can call BrowserBash directly (`browserbash mcp`), that is a separate, complementary workflow: MCP tools are for an agent asking "does this still work" on demand during development, while monitor mode is for asking the same question automatically, forever, in production. They share the same underlying engine and the same verdict shape, so a test you validate through MCP during development is already monitor-ready.

If you are converting an existing Playwright suite rather than starting from scratch, `browserbash import` converts specs to plain-English test files heuristically, without a model, and flags anything it could not translate in an `IMPORT-REPORT.md` instead of silently dropping it. That is often the fastest path to a monitor-ready file: import your existing E2E checkout spec, review the report for anything untranslated, then point the resulting `*_test.md` at monitor mode the same way you would a hand-written file.

## Getting started

If you already have `*_test.md` files running in CI, you do not need to write anything new to try monitor mode:

```bash
browserbash auth save prod-shopper --url https://shop.example.com/login
browserbash monitor .browserbash/tests/checkout_test.md --every 10m --auth prod-shopper --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Leave it running against staging first if you want to watch the pass-to-fail behavior before pointing it at production. You will see nothing for a while, which is the point, and that is usually when it clicks: a good monitor is one you forget is running until the day it isn't silent anymore. For deeper walkthroughs on writing testmd files and wiring assertions, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections cover the format in more depth, and the [features](https://browserbash.com/features) page has the full list of what shipped alongside monitor mode in 1.5.0.

## FAQ

### How do I set up browserbash monitor to check a production URL every few minutes?

Point `browserbash monitor` at an existing `*_test.md` file or a plain-English objective, and set `--every` to your desired interval, for example `--every 10m`. Add `--notify <webhook-url>` to get alerted, and `--auth <profile-name>` if the flow needs a saved login session so it does not re-authenticate on every tick. The command runs in the foreground, so keep it alive with a process supervisor if you want it to survive reboots.

### Does browserbash monitor alert on every failed check or only on state changes?

Only on state changes, in both directions. You get exactly one alert when a passing check starts failing, and exactly one more when it recovers back to passing. Consecutive runs in the same state, all passing or all failing, produce no additional alerts, which avoids flooding a Slack channel during an extended outage.

### Does monitor mode use Slack automatically, or do I have to configure the format?

If the `--notify` URL matches the Slack incoming-webhook pattern (`hooks.slack.com/services/...`), BrowserBash formats the payload as a readable Slack message automatically, no extra config needed. Any other HTTPS URL receives the raw JSON verdict payload instead, so you can route it into your own alerting or incident pipeline.

### Won't running an AI browser agent every 10 minutes around the clock get expensive?

Not in practice, because of the replay cache. The first passing run of a test records its actions as a journal; subsequent runs replay those actions directly against the page with zero model calls, and the agent only re-engages, spending tokens, when the page has actually changed enough that the replay does not match. For a stable production flow, most monitor ticks are cache hits with no LLM involved at all.

If you want to try it yourself, `npm install -g browserbash-cli` gets you the CLI, and you can start with `browserbash monitor` against a staging test file today. An account is optional, everything above runs entirely on your own machine, but if you want the free cloud dashboard for a shared view of monitor history, [sign up here](https://browserbash.com/sign-up).
