---
title: Checkly Pricing vs Free Local Browser Monitoring
description: "Checkly bills by check runs and retention; running monitors on your own box has no per-run meter. Compare cost, retention, and where results live."
date: 2026-07-05
category: alternatives
---

You added a fourth critical flow to your Checkly account this quarter (password reset, say, after support got a second ticket about it), and the next invoice had a line you had to open a spreadsheet to understand: extra browser check runs, billed above your plan's included volume. Nobody's product logic changed. You just added one more check on a five-minute cadence, and the meter caught up with you before month end. That line, more than any feature comparison, is why people start looking for a Checkly pricing alternative. So this is not a "which tool has more checkboxes" article. It is about how Checkly actually bills you, what you are really paying for when that invoice arrives, and what it costs to run the same checks yourself with no per-run meter at all.

## How Checkly actually meters what you build

Checkly runs two kinds of checks, and prices them completely differently. API checks fire an HTTP request and assert on status, body, or latency, billed at a rate cheap enough to mostly ignore. Browser checks, and Playwright Check Suites that run your own Playwright tests natively, drive a real browser through your UI end to end, and that is the expensive meter: something has to keep a browser process alive, execute your script, and store a video, trace, or screenshot for every run.

As of 2026, per Checkly's published plans, the free Hobby tier includes roughly 10 uptime monitors, about 1,000 browser and Playwright check runs a month, and around 10,000 API check runs, across a handful of locations for one user. Starter, listed near $24 a month billed annually, steps that up to about 3,000 browser runs and 25,000 API runs. Team, around $64 a month, gets you to roughly 12,000 browser runs and 100,000 API runs, plus more locations, seats, and private-location support. Go past your included volume and Checkly bills overage separately: on the order of $4.00 per extra 1,000 browser runs versus about $1.80 per extra 10,000 API runs, the meter that actually drives your bill. Enterprise is custom. Treat every figure here as directional and confirm current numbers on Checkly's site before budgeting against them.

Now the arithmetic that explains the invoice. One browser check running every five minutes is 12 runs an hour, 288 a day, roughly 8,640 a month. That single flow already exceeds the Hobby tier's entire browser-run allotment and eats deep into Starter's 3,000. Run four or five checks people actually care about (login, checkout, signup, password reset) at that cadence, and you are well into Team-tier overage before shipping a single new feature. That is not a defect unique to Checkly. It is what happens whenever a vendor prices browser automation per execution: the bill scales with how often you look, not how much you built.

## What the meter is really charging you for

Here is the part worth sitting with before deciding Checkly is "too expensive." A Playwright script executing against a page for ninety seconds is genuinely cheap compute. A laptop can run that same script all day for free. So what is the roughly $4 per 1,000 runs actually buying?

It is buying the part that has nothing to do with the check itself: a fleet of browsers kept warm across global locations, a scheduler that fires reliably every five minutes forever whether anyone is watching or not, a place where every run's video and history gets retained so you can find when a flow started failing, and an alerting layer already wired into Slack, email, PagerDuty, and status pages. Checkly, and every synthetic monitoring vendor priced this way, is selling hosted retention and always-on infrastructure, not the act of clicking through a login form. The check is the cheap part; keeping it running and its history trustworthy is the expensive part, legitimate to charge for, just not what most people think they are paying for the first time they open the invoice.

That reframing matters, because it tells you exactly where a Checkly pricing alternative can and cannot save you money. Replace the check-writing and check-running with something free, and you have not replaced the hosting, retention, or alerting. You have moved that cost onto whatever you use instead, usually your own CI and on-call tooling, which you are already paying for regardless of what runs the browser.

## Running the same checks with no per-run meter

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) CLI that takes the check-writing and check-running half of this equation and removes the meter, on purpose. You install it once:

```bash
npm install -g browserbash-cli
```

Instead of a Playwright script, you write the flow as a plain-English objective. An AI agent reads the live page and drives a real Chrome browser step by step, no selectors, no page objects to maintain:

```bash
browserbash run "Log in with the test account, open the billing page, and verify the plan reads 'Pro'" --agent --headless
```

`--agent` switches the output to NDJSON: one structured JSON event per line (`step` events as the agent works, a final `run_end` with the verdict), and the process exits `0` on pass, `1` on fail, `2` on error, `3` on timeout. That is the entire integration contract a script or CI job needs: no prose to parse, just an exit code and a JSON stream for detail.

The part that actually matters for a pricing comparison is what runs the model behind that agent. BrowserBash resolves one automatically in `auto` mode: a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then an OpenRouter key. Point it at a capable local model and your model bill is genuinely $0, since you are spending compute you already own instead of paying per execution. Point it at a hosted model and you pay that provider directly, at their rate, nothing added on top. Either way, nothing is counting "browser check runs" and billing you extra for the 8,641st one this month.

Be honest about the trade, because an alternative that quietly produces worse checks is not actually cheaper, just a different failure mode. Very small local models, roughly 8B parameters and under, get flaky on long, multi-step flows: they lose the thread, click the wrong element, or call a broken flow a pass. The reliable range is a mid-size local model (Qwen3 or Llama 3.3 in the 70B class) or a capable hosted model for the genuinely hard flows, matched to how much the flow actually matters.

## Where a local check gets cheaper instead of staying flat

This is the mechanical difference a pure feature comparison tends to miss. On Checkly, your 1st and your 10,000th run of the same unchanged check cost exactly the same, because the meter is flat per execution. On BrowserBash they do not, because of the replay cache: the first green run of a flow records the actions the agent took, and every later run replays those actions directly, with zero model calls, only falling back to full reasoning if the page actually changed. A flow you run every ten minutes gets cheaper the longer it stays green, the opposite of how a per-run meter behaves.

You get this whether you write a one-line objective or a committable test file. For anything you want reviewed in a pull request, BrowserBash reads Markdown test files with one step per line:

```markdown
# billing_test.md
- Go to {{baseUrl}}/login
- Log in as {{user}} with password {{password!secret}}
- Open the billing page
- Verify the plan reads "Pro"
```

```bash
browserbash testmd run billing_test.md --var baseUrl=https://staging.example.com --var user=qa@example.com
```

Anything tagged `!secret` is masked as `*****` in every log line and in the `Result.md` file the run writes, so a credential never ends up sitting in a CI log. And where you need a hard, non-negotiable assertion rather than agent judgment, `Verify:` steps compile to real Playwright checks and return expected-versus-actual evidence on failure, not a model's opinion about whether things looked fine.

## The metering math, side by side

| What you're paying for | Checkly | BrowserBash (local) |
| --- | --- | --- |
| Writing the check | Engineering time, in Playwright | Plain English, or a Markdown test file |
| Cost of one run | Included in plan, then ~$4.00 per 1,000 over | $0 on a local model; provider rate if hosted |
| Cost of the 10,000th run of an unchanged flow | Same as the 1st | Usually cheaper, replay cache skips the model |
| Adding a 5th monitored flow | More browser runs, closer to overage | No per-flow charge, only your own compute and time |
| Global probe locations | Included, managed | You bring your own (`--provider` for cloud grids) |
| Scheduling infrastructure | Included, always-on | You bring it: cron, CI, or `browserbash monitor` |
| Result retention | Included, hosted, long window | Local by default; optional free cloud dashboard, 15-day retention |
| Alerting (Slack, PagerDuty, status pages) | Included, polished | Webhook via `monitor --notify`; you wire the rest |

## Monitor mode and the budget dials that actually govern price

If part of what draws you to Checkly is "runs on a schedule and tells someone when it breaks," BrowserBash has a direct answer that keeps the no-meter property intact:

```bash
browserbash monitor billing_test.md --every 10m --notify https://hooks.slack.com/services/your-webhook
```

That runs the target on an interval and posts to the webhook only on a pass-to-fail (or fail-to-pass) state change, so nobody gets paged every ten minutes for a flow that is healthy, only when something actually changes. Because a warm replay cache means most ticks make zero model calls, a monitor watching a stable flow is close to token-free most of the time, a very different cost curve from a vendor charging per scheduled execution whether anything changed or not.

For suites where you do expect real model spend, say a batch of flows on `auto` mode hitting a hosted provider, `run-all --budget-usd 5` puts a hard ceiling on estimated spend: once the running total in `cost_usd` crosses your number, the suite stops launching new tests and exits `2` instead of quietly overrunning. That is cost governance in the literal sense, a dollar cap on a monitoring job, something a per-run vendor meter never gives you, since their answer to "stop before you overspend" is just "run it less often."

None of that erases the honest gap. `browserbash monitor` runs from wherever you run it, not from a dozen managed global locations with latency guarantees, and its alerting is a webhook, not a built-in status page or PagerDuty integration. For a shared, hosted view of run history, video, and per-run replay across a team, the free cloud dashboard (`browserbash connect` plus `--upload`) keeps uploaded runs for 15 days, which is where this article's pattern shows up inside BrowserBash itself: retention and team history are the kind of thing a hosted tier would eventually charge for, never the CLI or the act of running a check on your own machine.

## When Checkly's bill is worth paying

Be fair to the other side too. Keep paying for Checkly, or a vendor priced the same way, if you genuinely need monitoring from real global locations with latency guarantees, if your team wants built-in status pages and PagerDuty-grade on-call routing out of the box, or if you would rather have one predictable per-check bill than own even a thin scheduler and alerting stack. Those are real things you are buying, worth exactly what plenty of teams pay for them.

## When the free local math wins

Reach for a no-meter approach when the thing driving your Checkly bill up is check volume, not check importance: a growing regression suite you want to run on every pull request, not only every five minutes in production; a team that already operates CI and on-call tooling and does not want a second, separately-billed console for the same job; or flows that touch internal systems where nothing should leave your network at all. In those cases the per-run meter was never buying you anything you needed, and the money is better spent elsewhere.

## FAQ

### Is there a real Checkly pricing alternative, or do I have to accept per-run billing for browser checks?

Yes, but be precise about what changes. BrowserBash removes the per-run meter for authoring and executing browser checks: install it once, write flows in plain English or a Markdown test file, and pay $0 in model cost on a local model. It does not include Checkly's hosted probe network, built-in scheduler, or polished alerting; you supply those with cron, CI, or `browserbash monitor`, a genuine trade, not a free lunch.

### Why does Checkly's bill grow so fast once I add more browser checks?

Because browser and Playwright check runs are billed far higher than API check runs, on the order of $4.00 per additional 1,000 runs versus about $1.80 per additional 10,000 API runs as of 2026. A single flow checked every five minutes is already around 8,640 runs a month, so a handful of checks at a tight cadence pushes past included plan volume quickly. Lowering cadence, trimming flow count, or moving flows off-platform are the usual levers.

### Does BrowserBash charge anything at all?

The CLI, both engines, the replay cache, testmd, `run-all`, monitor mode, and the MCP server are free and open source under Apache-2.0, with no per-check pricing. The only paid-adjacent surface today is an optional free cloud dashboard for shared run history, video, and replay, which keeps uploaded runs for 15 days; using it requires `browserbash connect` plus an explicit `--upload`, and skipping it entirely costs nothing and loses no ability to run checks.

### Can I run the same flow on a schedule without paying anyone per run?

Yes. `browserbash monitor <test-or-objective> --every 10m --notify <webhook-url>` runs a flow on an interval and posts to your webhook only when its pass or fail state changes. Combined with the replay cache, a stable flow makes close to zero model calls per tick, so the recurring cost is close to whatever compute you already have, not a per-run vendor charge.

### Should I cancel Checkly and switch entirely?

Probably not, and this article is not arguing for that. Checkly's hosted, multi-region, always-on monitoring with built-in alerting is worth paying for if you want someone else to operate that infrastructure. The more common pattern is running a free, no-meter tool like BrowserBash for the high-frequency regression and CI-gating checks that were driving browser-run volume up, and keeping a smaller, deliberate set of production monitors on Checkly for the job it is actually built for.

For the free side of this trade in more detail, the [BrowserBash features page](https://browserbash.com/features) covers engines, providers, and recording options, and the [pricing page](https://browserbash.com/pricing) lays out exactly what stays free.
