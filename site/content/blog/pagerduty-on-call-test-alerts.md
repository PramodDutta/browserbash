---
title: Wire AI Test Failures to PagerDuty On-Call
description: "Turn BrowserBash monitor-mode results into PagerDuty test failure alerts: route a pass-to-fail change into a real incident via the Events API v2."
date: 2026-07-31
category: ci
---

If a production login flow breaks at 2 a.m., a green dashboard nobody is watching does not help you. What helps is a PagerDuty incident on the on-call phone. This guide shows how to wire PagerDuty test failure alerts to an AI-driven synthetic check, so a real browser walks your critical path on an interval and a pass-to-fail change becomes an incident through PagerDuty's Events API v2. The tool doing the walking is BrowserBash, a free, open-source natural-language browser automation CLI: you write a plain-English objective, an AI agent drives a real Chrome, and you get a deterministic verdict back.

Synthetic monitoring and paging are two separate jobs. One decides whether the app works. The other decides who gets woken up. Most teams glue them together with a pile of custom scripts. The pattern below keeps each job small: BrowserBash owns the checking and the state-change detection, PagerDuty owns the escalation, and a thin transform sits between them because the two payload shapes do not match by default. I will be honest about that gap and show you how to close it cleanly.

## Why synthetic checks belong on your pager, not a dashboard

Unit tests and CI catch regressions before you ship. They do not catch the failures that happen after you ship: an expired TLS cert, a third-party auth provider outage, a CDN misconfiguration, a payment gateway that started returning 500s, a feature flag that quietly broke checkout in one region. None of those show up in your test suite because your test suite is not running against production every few minutes. A synthetic check is.

The value of a synthetic check is only realized if someone acts on a failure fast. That is the entire premise of on-call. A Slack message in a busy channel gets missed. An email gets filtered. PagerDuty exists to break through: it escalates, it retries, it moves to the next person if the first does not acknowledge. So the goal is not "send an alert somewhere." The goal is to convert a specific, meaningful event, your production login going from working to broken, into a PagerDuty incident with enough context that the on-call engineer knows what failed and where to look.

There is a subtle trap here. If your check fires an alert on every run, you have built a noise machine, and on-call will mute it within a week. The signal you actually want is the transition: the moment a passing check starts failing, and later, the moment it recovers. BrowserBash monitor mode is built around exactly that transition, which is what makes it a good fit for paging.

## How BrowserBash monitor mode detects the transition

BrowserBash ships a `monitor` command that runs a test or a plain-English objective on an interval and alerts only on pass to fail and fail to pass state changes, in both directions, never on every green run. That last detail is the whole point. An always-green check stays quiet. The webhook only fires when the verdict actually flips.

Here is the simplest possible monitor:

```bash
browserbash monitor "Open https://app.example.com/login, sign in with {{EMAIL}} and {{PASSWORD}}, and confirm the dashboard heading is visible" \
  --every 10m \
  --notify https://relay.example.com/pagerduty
```

That runs every ten minutes. On the first failure after a run of passes, the notify webhook fires once. It does not fire again on the second, third, or tenth consecutive failure. When the flow recovers, the webhook fires once more with the resolved state. This maps almost perfectly onto how PagerDuty wants to think about incidents: trigger on the way down, resolve on the way back up.

A real production check usually deserves a committed test file rather than an inline objective, so you can add deterministic assertions and reuse a saved login. More on both below. For the interval mechanics, the [monitor and features overview](https://browserbash.com/features) covers the flags in depth.

### The token cost of always-on monitoring

Running an AI agent against a browser every ten minutes sounds expensive. It usually is not, because of the replay cache. When a run passes, BrowserBash records the exact actions the agent took. The next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page actually changed. A monitor that mostly passes therefore mostly replays, which makes an always-on synthetic check nearly token-free. You are paying model cost only when something is different, which is precisely when you want the agent thinking anyway.

If you point the monitor at local models through Ollama, which BrowserBash defaults to, the marginal cost is effectively zero and nothing leaves your machine. For hard multi-step flows you may want a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a hosted model, because very small local models around 8B and under can get flaky on long objectives. Pick the model to match the flow, then let the cache carry the boring green runs.

## The honest gap: BrowserBash JSON is not PagerDuty JSON

Now the part most guides skip. BrowserBash monitor mode sends Slack formatting automatically when the notify URL is a Slack incoming webhook. For any other URL, it sends the raw JSON payload. PagerDuty's Events API v2 does not accept arbitrary JSON. It expects a specific schema: a `routing_key` that identifies the service integration, an `event_action` of `trigger` or `resolve`, and a `payload` object with `summary`, `source`, and `severity` fields, plus optional `dedup_key`, `custom_details`, and `links`.

So you cannot point `--notify` straight at `https://events.pagerduty.com/v2/enqueue` and expect a clean incident. The field names do not line up, and PagerDuty will reject or misinterpret a payload it did not expect. This is not a BrowserBash limitation so much as a reality of gluing any two systems together: their contracts differ. The fix is a thin transform, a relay, that receives the BrowserBash payload and re-emits it in the shape PagerDuty wants.

You have three reasonable places to put that transform. A tiny serverless function (Cloudflare Workers, AWS Lambda, Vercel) is the most common. PagerDuty's own inbound integrations or event orchestration can reshape some payloads if you prefer to keep the logic on their side. And for a quick internal setup, a small always-on script on a box you already run works fine. The relay is maybe forty lines of code. It is the only custom piece in the whole pipeline.

### A minimal relay that maps state changes to Events API v2

The relay's job is small: read whether BrowserBash reported a pass or a fail, choose `trigger` or `resolve`, set a stable `dedup_key` so PagerDuty groups repeated triggers into one incident, and forward it. Here is the logic in a Cloudflare Worker style handler, kept deliberately plain:

```bash
# Deploy target: any HTTPS endpoint BrowserBash can POST to.
# It receives the monitor payload and re-emits PagerDuty Events API v2.
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "YOUR_INTEGRATION_KEY",
    "event_action": "trigger",
    "dedup_key": "browserbash-login-prod",
    "payload": {
      "summary": "Login synthetic check failed on app.example.com",
      "source": "browserbash-monitor",
      "severity": "critical",
      "custom_details": { "verdict": "fail", "test": "login_test.md" }
    }
  }'
```

Your relay builds that request dynamically from the incoming BrowserBash payload. When the state change is fail, set `event_action` to `trigger`. When the state change is pass, meaning recovery, set `event_action` to `resolve` and reuse the same `dedup_key`. That `dedup_key` is what lets PagerDuty auto-resolve the incident when your check goes green again, which is the recovery alert BrowserBash already sends you for free. One key, one incident lifecycle, opened on the way down and closed on the way up.

Because monitor mode only fires on transitions, your relay does not need debounce logic. It will not get spammed on every failing run. It receives exactly one trigger when the flow breaks and exactly one resolve when it heals. That symmetry is the reason this pairing is clean rather than hacky.

## Making the check deterministic before you page anyone

Paging a human is a strong action. You do not want to do it on a flaky verdict. An AI agent judging whether a page "looks logged in" is useful, but for a production check that can wake someone up, you want the failure condition to be exact. This is where BrowserBash's deterministic Verify assertions matter.

In a committed test file, a `Verify` step compiles to a real Playwright check rather than an LLM judgment. Supported conditions include URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and stored-value equality. A pass means the condition literally held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table. That evidence is exactly what you want to pipe into the PagerDuty incident's `custom_details`, so the on-call engineer sees "expected URL to contain /dashboard, actual was /login?error=session" instead of a vague "test failed."

Here is a production login check as a committed test file using testmd v2, which executes steps one at a time against a single browser session and lets you seed state with a deterministic API step before you check the UI:

```bash
# login_prod_test.md
---
version: 2
auth: prod-session
---

# Production login synthetic check

POST https://api.example.com/session/warm with body { "region": "us-east" }
Expect status 200

Open https://app.example.com/login
Type {{EMAIL}} into the email field
Type {{PASSWORD}} into the password field
Click the Sign in button
Verify URL contains /dashboard
Verify "Welcome back" heading is visible
```

The API step seeds a warm session deterministically without touching a model. The plain-English steps drive the browser through the agent. The two `Verify` lines are the real gates: if the URL does not reach `/dashboard` or the heading is missing, the verdict is a hard fail with structured evidence, and that is what trips your relay. Verify lines that fall outside the supported grammar still run, agent-judged, and get flagged `judged: true` so you can tell a deterministic check from a judged one. For a page you page on, keep the load-bearing checks inside the deterministic grammar. Note that testmd v2 currently drives the builtin engine, so it needs an ANTHROPIC_API_KEY or a compatible gateway rather than running on Ollama directly.

### Reusing a real login instead of re-authenticating every run

A synthetic check that logs in from scratch every ten minutes hammers your auth provider and can trip rate limits or bot defenses, which then causes false failures, which then pages someone at 2 a.m. for no reason. BrowserBash saved logins solve this. You log in once interactively, and the session is saved as Playwright storageState:

```bash
browserbash auth save prod-session --url https://app.example.com/login
```

You sign in in the browser that opens, press Enter, and the session is stored. Then `auth: prod-session` in the test frontmatter, or `--auth prod-session` on the command line, reuses it. Your monitor now starts already authenticated, checks the thing you actually care about, and does not generate auth noise. If the saved session's origins do not cover the start URL, BrowserBash prints a warning rather than silently doing nothing, so a stale profile fails loud instead of quiet.

## Choosing severity, and where the pipeline ends

Not every failing synthetic check deserves a critical page. A broken checkout is critical. A broken marketing footer link is not. Because your relay is code, you get to encode that policy. Route different tests to different PagerDuty services, or set `severity` based on which test file failed. A clean way to do this is to run distinct monitors per criticality tier, each pointed at a relay path that carries the right routing key and severity:

```bash
browserbash monitor login_prod_test.md --every 5m --auth prod-session \
  --notify https://relay.example.com/pagerduty/critical

browserbash monitor search_prod_test.md --every 15m --auth prod-session \
  --notify https://relay.example.com/pagerduty/warning
```

The login check runs every five minutes into a critical service that escalates aggressively. The search check runs every fifteen minutes into a lower-severity service that might only post to a channel. Same tool, same transition semantics, different blast radius. This is the practical payoff of keeping BrowserBash and PagerDuty as separate systems joined by a small transform: policy lives in the relay, checking lives in the monitor, and neither has to know much about the other.

## Comparing the routing approaches

There is more than one way to get a failing check into PagerDuty. Here is an honest comparison of the realistic options, including where BrowserBash is not the whole answer.

| Approach | Fires on | Payload work | Best for |
| --- | --- | --- | --- |
| BrowserBash monitor to relay to Events API v2 | Pass-to-fail and fail-to-pass transitions only | Thin relay reshapes JSON to PagerDuty schema | Production synthetic checks that page on-call |
| BrowserBash monitor to Slack webhook | Same transitions, native Slack formatting | None, Slack format is automatic | Team channels, no formal escalation needed |
| CI job to PagerDuty on suite failure | Every failing CI run | CI plugin or API call | Pre-merge gating, not live production |
| Dedicated synthetic monitoring SaaS | Vendor-defined thresholds | Handled by vendor | Teams wanting a fully managed, non-code product |

The honest read: if you want a fully managed synthetic monitoring product with a polished UI, a dedicated SaaS in that category is a better fit and you should use one. The exact feature sets and pricing of those products are not something I will invent here. BrowserBash's edge is different. It is free and open source, it drives a real browser from plain English so your checks read like the user story, and it can run entirely on your own machine or CI with local models. If you already live in the terminal, commit your tests to git, and want the check to be code you own rather than a config in someone else's dashboard, this pipeline fits. If you want zero code and a vendor pager button, it does not, and that is fine.

For CI-time paging, note that the same tool covers a different moment. In a pull request you probably do not want to page anyone. There you want a verdict table in the PR comment, which the [BrowserBash GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) already posts. Reserve PagerDuty for the production monitor, where a real user is affected and someone needs to wake up. The [tutorials](https://browserbash.com/tutorials) walk through both the CI and monitor setups end to end.

## When to choose this pipeline, and who it is for

Choose the BrowserBash-to-PagerDuty pipeline when three things are true. First, you have a handful of critical user journeys, login, checkout, search, signup, that must work in production continuously, not just at deploy time. Second, you already use PagerDuty for escalation and want synthetic failures to flow into the same on-call rotation as everything else. Third, you are comfortable running one small relay to bridge the two payload formats, because that transform is unavoidable regardless of which synthetic tool you pick.

It is a strong fit for platform and SRE teams who already own PagerDuty and want cheap, code-owned synthetic checks alongside their infra alerts. It fits SDETs who want production monitoring that reuses the same plain-English test files they run in CI, no separate test language. It fits small teams who cannot justify a per-seat synthetic monitoring subscription but can stand up a serverless relay in an afternoon.

It is a weaker fit if you need a compliance-grade managed monitoring product with SLA guarantees and a dedicated support contract, or if nobody on the team wants to maintain even forty lines of relay code. In those cases a managed vendor earns its price. Be honest with yourself about which camp you are in before you build. There is a broader look at real-world usage in the [case studies](https://browserbash.com/case-study), and the full flag reference lives in the [learn hub](https://browserbash.com/learn).

## Testing the whole loop before you trust it

Do not wait for a real outage to find out your relay drops the `dedup_key`. Test the pipeline deliberately. Point a monitor at a URL you control, confirm a passing baseline, then break the page on purpose (return a 500, change the heading text, log out the saved session) and watch for exactly one PagerDuty trigger. Fix the page and watch for exactly one resolve on the same incident. If you see repeated triggers, your relay is not reusing a stable `dedup_key`. If you see no resolve, your recovery path is not mapping the pass transition to `event_action: resolve`.

You can also validate the BrowserBash side independently in agent mode, which emits NDJSON with one event per line and uses frozen exit codes: 0 passed, 1 failed, 2 error, 3 timeout. A quick manual run confirms the verdict logic before you ever involve PagerDuty:

```bash
browserbash testmd run login_prod_test.md --auth prod-session --agent
```

Read the `run_end` event. Confirm the `assertions` block shows your Verify checks passing, and note the `cost_usd` estimate so you know the marginal spend of a cache-miss run. Once the standalone run behaves, wire in the monitor, then wire in the relay, then break things on purpose. Build the pipeline one honest layer at a time and you will trust the page when it finally comes.

## FAQ

### How do I send BrowserBash test failures to PagerDuty?

Run `browserbash monitor` with `--notify` pointed at a small relay endpoint you control, and have that relay reshape the payload into PagerDuty's Events API v2 format before forwarding it to the enqueue endpoint. Monitor mode fires only on pass-to-fail and fail-to-pass transitions, so the relay receives one trigger when the check breaks and one resolve when it recovers. You cannot point `--notify` directly at PagerDuty because the JSON schemas differ, which is why the thin relay exists.

### Will monitor mode page me on every failing run?

No. BrowserBash monitor mode alerts only on state changes, meaning the moment a passing check starts failing and later the moment it recovers. Repeated consecutive failures do not re-fire the webhook, so you get one incident trigger rather than a flood. If you use a stable dedup_key in your relay, PagerDuty groups everything into a single incident and auto-resolves it when the check goes green again.

### Does an always-on synthetic monitor cost a lot in model tokens?

Usually not, because of the replay cache. A passing run records its actions, and the next identical run replays them with zero model calls, so a mostly-green monitor is nearly token-free. The agent only re-engages the model when the page actually changed, which is exactly when you want it thinking. Pointing the monitor at local Ollama models drops the marginal cost to effectively zero.

### Can I make the failure condition deterministic instead of AI-judged?

Yes, use Verify steps in a committed test file. Verify compiles to real Playwright checks like URL contains, text visible, or a named heading visible, with no LLM judgment, and a failure comes with expected-versus-actual evidence in the run_end assertions block. That evidence is ideal to forward into the PagerDuty incident details. Keep the load-bearing checks inside the supported Verify grammar so a page-worthy alert never fires on a flaky judgment.

Ready to put a real browser on your pager? Install with `npm install -g browserbash-cli`, save a production login, and point a monitor at your most critical flow. An account is optional and everything runs locally, but if you want the free cloud dashboard you can grab one at https://browserbash.com/sign-up.
