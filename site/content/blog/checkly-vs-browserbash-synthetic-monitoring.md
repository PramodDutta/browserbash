---
title: Checkly vs BrowserBash for AI Synthetic Monitoring
description: "AI synthetic monitoring with plain-English smoke checks: run scheduled BrowserBash --agent NDJSON tests as an AI alternative or complement to Checkly."
date: 2026-04-22
category: use-case
---

If your signup form silently breaks at 2 a.m. on a Saturday, the question is not whether you have a synthetic monitor watching it — it is how that monitor was built and how fast you find out it lied to you. AI synthetic monitoring is the newer answer to that problem: instead of hand-writing a Playwright script for every critical flow, you describe the flow in plain English and let an AI agent drive a real browser to check it. This article walks through how to run scheduled, plain-English smoke checks with BrowserBash's `--agent` NDJSON output, and where that approach sits next to Checkly's code-based synthetic monitors. It is written for an SDET or platform engineer who already has (or is shopping for) uptime coverage and wants to know whether an AI agent belongs in the picture.

I am not going to pretend BrowserBash replaces a mature monitoring SaaS for every team. It does not, and I will say plainly where Checkly is the better tool. The more useful framing is: these two solve overlapping problems with very different center-of-gravity, and a lot of teams will end up running both.

## What "synthetic monitoring" actually means in 2026

Synthetic monitoring is the practice of running scripted, repeatable checks against your production app on a schedule, from outside, to catch problems before your users report them. "Synthetic" because the traffic is fake — a robot you control, not a real customer. The classic categories are uptime checks (is the URL up, what is the status code, is the TLS cert valid), API checks (does this endpoint return the right JSON in the right time budget), and browser checks (can a robot actually log in, click through, and reach the success state).

The browser check is the hard, valuable one. An uptime check tells you the homepage returns 200. It says nothing about whether checkout works. A browser check that drives login → add to cart → pay → "Thank you for your order!" is the closest thing you have to a real user, running every few minutes, telling you the truth about your conversion path. That is the flow this article keeps coming back to, because it is the flow that pays for itself.

The "AI" in AI synthetic monitoring changes one specific thing: how the browser check is authored and how it survives change. Traditional browser checks are code with selectors. When a developer renames a CSS class or restructures the DOM, the selector breaks and your monitor goes red on a non-bug. AI-driven checks describe intent — "log in and confirm the dashboard loads" — and an agent figures out the clicks at runtime by reading the page the way a person does. That is the pitch. It comes with its own failure modes, which I will not skip over.

## What Checkly is, honestly

Checkly is a hosted synthetic monitoring platform. You define checks — uptime, API, and browser — and Checkly runs them on a schedule from a set of global locations on its own infrastructure. Browser checks are written as Playwright scripts in JavaScript or TypeScript. When a check fails, Checkly alerts you through the integrations you have wired up, shows you the run details, traces, and screenshots, and (as of 2026) can run an AI triage step that analyzes failures and surfaces a likely root cause. The exact name and capabilities of that triage feature are Checkly's to specify, so treat the details as a snapshot and confirm on their site.

The philosophy Checkly leans into is "Monitoring as Code." You keep monitors in version control next to your application, deploy them with a CLI, Terraform, or Pulumi, and treat a broken check like a broken build. For engineering teams who already live in code and do not want a point-and-click console that drifts away from the app, that resonates.

Pricing, as of 2026, starts with a free Hobby tier and scales through paid tiers that increase check volume, locations, users, and features like private locations, RBAC, and status pages, with custom Enterprise plans above that. Pricing pages move, so verify current figures on Checkly's own site before you budget. The structural point that matters for this comparison: Checkly is a *hosted, scheduled, global* monitoring service, and you are buying run infrastructure, alerting, dashboards, and locations as a managed product. That is genuinely valuable, and rebuilding it yourself is not free even when the tools are.

## What BrowserBash is, honestly

BrowserBash is a free, open-source command-line tool (Apache-2.0) from The Testing Academy, built by Pramod Dutta. You install it with one command:

```bash
npm install -g browserbash-cli
```

Then you describe a flow in plain English and an AI agent drives a real Chrome or Chromium browser, step by step, with no selectors and no page objects. You write the objective; the agent works out how to accomplish it and returns a verdict plus structured results.

```bash
browserbash run "Go to the staging store, log in with the demo account, add a laptop to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

The model story is the part that changes the economics of monitoring. BrowserBash is Ollama-first: by default it uses free local models running on your own machine, with no API keys and nothing leaving your box. It auto-resolves a local Ollama install first, then falls back to `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` if you have set them. So you can run a genuinely $0 model bill on local models, or bring a capable hosted model — Anthropic Claude with your own key, or free hosted models through OpenRouter such as `openai/gpt-oss-120b:free` — when a flow is hard enough to need it. You can read the full feature tour on the [BrowserBash learn page](https://browserbash.com/learn).

Here is the honest caveat I will repeat, because it matters most for unattended monitoring: very small local models (around 8B parameters and under) get flaky on long, multi-step objectives. They lose the thread, click the wrong thing, or declare victory too early. The sweet spot for reliable runs is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you point a tiny model at a ten-step checkout and schedule it to run unattended, you will get flaky reds that are the model's fault, not your app's. For monitoring specifically, model choice is not a nice-to-have — it is the difference between a trustworthy signal and an alert you learn to ignore.

No account is needed to run anything. There is an optional, opt-in free cloud dashboard (`browserbash connect` plus `--upload`) that gives you run history, video recordings, and per-run replay, and a fully local dashboard (`browserbash dashboard`) if you want to keep everything on your own machine. Free uploaded runs are kept for 15 days.

## The core difference: a managed service vs a check you schedule yourself

Strip away the marketing and the real split is this. Checkly is a place your checks *live and run*. BrowserBash is a *command that produces a verdict*; where and when it runs is up to you.

That single difference cascades into everything. With Checkly, the scheduler, the global run locations, the alert routing, the retention, the dashboards, and the on-call escalation are the product. You are paying for someone else to keep the lights on so your monitor fires reliably at 2 a.m. from three continents. With BrowserBash, you own the scheduling and the run environment — a cron job, a GitHub Actions workflow, a Kubernetes CronJob, whatever you already operate — and BrowserBash slots in as the thing that actually performs the check and emits a machine-readable result.

Neither is automatically better. If you have no infrastructure and no appetite to build any, a hosted service is the pragmatic choice. If you already run CI and cron and a runner fleet, bolting an AI smoke check onto that is cheap, private, and entirely under your control.

| Dimension | Checkly | BrowserBash |
|---|---|---|
| Shape | Hosted SaaS monitoring platform | Free open-source CLI (Apache-2.0) |
| Browser checks authored as | Playwright code (JS/TS) | Plain-English objectives, no selectors |
| Who runs the schedule | Checkly's scheduler + global locations | You (cron, CI, K8s CronJob) |
| Run locations | Multiple global locations, managed | Wherever you run it (your runner) |
| Model / AI cost | Triage AI as a platform feature | Ollama-first, $0 on local models possible |
| Alerting & dashboards | Built in, managed | Bring your own (exit codes + NDJSON); optional free dashboard |
| Data residency | Runs on Checkly infrastructure | Can stay fully on your machine |
| Pricing | Free tier + paid tiers (verify current) | Free; you pay only for your own compute/models |
| Best at | Turnkey global uptime + browser monitoring | Private, code-light, AI-driven smoke checks |

## How to run a plain-English smoke check as AI synthetic monitoring

The mechanism that makes BrowserBash usable for monitoring is `--agent` mode. Add the flag and the CLI emits NDJSON — one JSON event per line — on stdout, with no prose to parse. The terminal event carries the verdict, and the process exit code tells the whole story to any scheduler:

- `0` passed
- `1` failed
- `2` error
- `3` timeout

That is the entire contract a monitor needs. A scheduler does not care about pretty output; it cares whether the exit code is zero and what the structured result said. Here is a headless smoke check shaped for unattended runs:

```bash
browserbash run "Open https://app.example.com, log in with the test account, \
and confirm the dashboard shows the 'Welcome back' heading and today's revenue widget" \
  --agent --headless
```

Run that on a schedule and you have AI synthetic monitoring in its simplest form: a plain-English objective, an agent driving a real browser, and an exit code your cron job or CI gate can branch on. The NDJSON stream is there for the cases where you want more than pass/fail — you can capture it to a file, push the final event into your own alerting, or feed it to another program that decides what to do next. Because it is line-delimited JSON, you are never regex-scraping a log to find out what happened.

### Wiring it into a scheduler

The pattern is deliberately boring, which is the point. A cron line that runs the smoke check every five minutes and pages you on a non-zero exit is a handful of lines of shell. A GitHub Actions workflow on a `schedule:` trigger does the same thing with the runner's logs and notifications you already use. A Kubernetes CronJob wraps the same command in a container. In every case BrowserBash is the leaf node — the thing that produces the verdict — and your existing operational tooling handles when it runs and who gets woken up.

For teams that want run history without standing up storage, add `--upload` (after a one-time `browserbash connect`) and the run lands in the free cloud dashboard with a video recording and per-run replay, kept for 15 days. For teams that want nothing leaving the building, skip `--upload` entirely and point `browserbash dashboard` at your local runs. The first time a 2 a.m. red alert lands and you can scrub a video of exactly where the agent got stuck, you will understand why the recording matters more than the green checkmarks.

### Recording the evidence

Synthetic monitoring is only as useful as your ability to diagnose a failure after the fact. BrowserBash's `--record` captures a screenshot and a full `.webm` session video (via ffmpeg) on any engine, and the in-repo builtin engine additionally captures a Playwright trace you can open in the trace viewer. For a flaky monitor, that trace is gold — you can step through exactly what the agent saw and clicked, which is the difference between "the monitor went red, no idea why" and "the cookie banner moved and covered the login button at 14:32."

```bash
browserbash run "Log in and verify the account billing page loads" \
  --agent --headless --record
```

## Committable checks you can review like code

Checkly's "Monitoring as Code" story has a real pull: your monitors live in the repo, get reviewed in PRs, and version with the app. BrowserBash answers that with Markdown tests — committable `*_test.md` files where each list item is a step. They support `@import` so shared setup (log in, accept cookies) lives in one place, and `{{variables}}` templating so the same check runs against staging and prod with different inputs. Variables you mark as secret are masked as `*****` in every log line, which matters the moment a monitor's logs are visible to more than one person.

```bash
browserbash testmd run ./checkout_smoke_test.md \
  --agent \
  --var baseUrl=https://staging.example.com \
  --secret password=hunter2
```

A `checkout_smoke_test.md` reads like a runbook a human could follow, which is exactly why a reviewer can sanity-check it in a pull request without learning a selector dialect. After each run BrowserBash writes a human-readable `Result.md`, so even a non-engineer stakeholder can read what the monitor did and what it concluded. That is a softer kind of "monitoring as code" than Playwright scripts, and for a lot of smoke-level checks it is enough — and far cheaper to maintain. You can see more of how these compose on the [features page](https://browserbash.com/features).

The honest counterpoint: Markdown steps are not as precise as a Playwright assertion. If you need to assert that an API response body matches an exact schema, or that a specific network call fired with a specific payload, code is the right tool and Checkly's Playwright checks will serve you better. BrowserBash's strength is intent-level verification — "the order went through and the confirmation appeared" — not byte-level assertions.

## Where each tool is genuinely the better fit

I want to be fair here, because a comparison that always lands on "use my tool" is not worth reading.

**Choose Checkly when** you want a turnkey, hosted monitoring product and you do not want to operate any of it yourself. If you need checks running from multiple geographic locations to catch region-specific outages, that is squarely Checkly's domain and not something BrowserBash provides — BrowserBash runs wherever you run it, full stop. If you need built-in alert routing, on-call escalation, status pages, SLA reporting, and a managed dashboard out of the box, Checkly hands you all of that on day one. If your team already writes Playwright and wants deterministic, byte-exact browser and API assertions, the code-first model is a feature, not a tax. And if "someone else keeps the monitoring infrastructure alive" is worth real money to you, Checkly is selling exactly that.

**Choose BrowserBash when** you want AI synthetic monitoring that costs $0 in model spend, keeps data on your own machines, and authors checks in plain English instead of selector-laden code. It shines when you already operate CI and cron and just want a smart smoke check to drop into them. It is a strong fit when your flows change often and you are tired of selector churn turning every redesign into a monitor-fixing chore. It is the privacy-conscious choice when sending production session data to a third-party SaaS is a compliance headache. And it is the obvious pick for AI coding agents and CI pipelines that want a clean NDJSON contract and exit codes rather than prose to parse. For the broader landscape of AI-driven browser tools, the [BrowserBash blog](https://browserbash.com/blog) has more comparisons.

**Run both when** — and this is where many teams actually land — you keep Checkly for the always-on, multi-region uptime and the critical revenue paths that warrant a managed SLA, and you add BrowserBash smoke checks in CI to catch regressions *before* they ship and on cheaper internal schedules where global locations and managed alerting are overkill. The two are complementary far more than they are mutually exclusive. Checkly watches production from the outside; BrowserBash can gate your pipeline so fewer breakages reach production in the first place.

## A realistic split-stack setup

Here is a concrete pattern I would actually deploy. Keep Checkly browser checks on the two or three flows where downtime costs you money directly — login and checkout for a store, login and core action for a SaaS — running every minute from a couple of regions, wired to your pager. That is the layer where "managed, global, always-on" earns its keep.

Then add a BrowserBash smoke suite that runs on every deploy and on a five-minute internal cron against staging, covering a broader set of journeys: password reset, search, a settings change, an export, an empty-state. Use `--agent` so the suite gates the pipeline on exit codes, `--record` so any red comes with a video, and a mid-size model so the longer flows do not wobble. The free local dashboard or a 15-day `--upload` retention gives you enough history to spot patterns without building a data pipeline.

The result is two monitoring layers with different cost profiles and different jobs. Production-critical paths get the premium, managed treatment. Everything else gets cheap, private, AI-driven coverage that you fully control. You stop paying SaaS check-volume prices to monitor the long tail of flows that do not need a global SLA, and you stop writing brittle selectors for checks that change every sprint. If you want to compare how teams have structured this, the [case studies](https://browserbash.com/case-study) are a useful starting point.

## What AI synthetic monitoring does not magically fix

A few honest caveats, because over-promising is how monitoring tools lose trust.

An AI agent is non-deterministic. Two runs of the same objective can take slightly different paths, and a borderline model can occasionally read a page wrong. For monitoring, you manage this the same way you manage any flaky check: pick a capable model, keep objectives specific and verifiable ("confirm the heading 'Order confirmed' is visible"), add a retry on a single non-zero result before paging, and lean on the recording when something does go red. With a mid-size or hosted model and tight objectives, the flake rate is low — but it is not zero, and pretending otherwise would be dishonest.

AI synthetic monitoring also will not replace true uptime probes or API contract tests. A plain-language browser agent is the wrong tool to assert that an endpoint returns a specific status code in 200ms from Frankfurt. Use the right layer for each job: cheap uptime probes for liveness, API checks for contracts, and AI browser checks for the human-shaped journeys that selectors make miserable to maintain. The point of BrowserBash here is not to be all three. It is to make the third layer — the expensive-to-maintain browser journeys — dramatically cheaper to author and own.

And no tool fixes a missing process. A monitor that fires into a channel nobody watches is theater. Whichever stack you pick, the alert has to reach a human who can act, and the run has to leave enough evidence to diagnose the failure fast. BrowserBash gives you the evidence (NDJSON, screenshots, `.webm`, traces); your runbook has to give you the response.

## FAQ

### What is AI synthetic monitoring?

AI synthetic monitoring is the practice of running scheduled checks against your live app where an AI agent drives a real browser to verify a flow described in plain English, instead of a hand-written selector-based script. The agent reads the page and works out the clicks at runtime, which means a CSS change or DOM refactor is far less likely to break the monitor. It is best suited to human-shaped journeys like login and checkout, and it complements rather than replaces simple uptime probes and API contract checks.

### Can BrowserBash replace Checkly for synthetic monitoring?

For some teams, partly. BrowserBash gives you the browser-check capability for free with plain-English authoring, but it is a CLI, not a hosted service, so you bring your own scheduler, alerting, and global run locations. Checkly remains the better choice when you need turnkey multi-region monitoring, managed alerting, and SLA-grade always-on coverage. Many teams keep Checkly for production-critical paths and add BrowserBash smoke checks in CI and on internal schedules.

### How do I run a scheduled smoke check with BrowserBash?

Write your flow as a plain-English objective and run it with `--agent` so the CLI emits NDJSON and a clean exit code (0 passed, 1 failed, 2 error, 3 timeout), then trigger that command from any scheduler you already use such as cron, GitHub Actions, or a Kubernetes CronJob. Add `--headless` for unattended runs and `--record` to capture a screenshot, a `.webm` video, and a trace for diagnosing failures. Your scheduler branches on the exit code, and the NDJSON terminal event carries the structured verdict.

### Does AI synthetic monitoring cost money to run?

It does not have to. BrowserBash is Ollama-first and defaults to free local models, so you can run checks with a $0 model bill and nothing leaving your machine. You only pay for your own compute, or optionally for a hosted model like Anthropic Claude or a free OpenRouter model when a flow is hard enough to need one. By contrast, hosted platforms like Checkly charge by check volume and feature tier, which is the trade-off for not operating any infrastructure yourself.

BrowserBash is free and open source, and you can have a plain-English smoke check running in CI in the time it takes to read this paragraph. Install it with `npm install -g browserbash-cli`, point it at a flow you care about with `--agent`, and wire the exit code into whatever scheduler you already run. No account is required to start — and if you later want hosted run history and replays, you can [create a free account](https://browserbash.com/sign-up) (optional) and add `--upload`.
