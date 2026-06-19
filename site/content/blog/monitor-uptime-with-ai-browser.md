---
title: Monitor uptime and critical journeys with an AI browser
description: "Uptime monitoring browser checks break on every UI change. See how an AI browser watches critical journeys in plain English, with no selectors to maintain."
date: 2026-06-09
category: use-case
---

A 200 status code is a lie you tell yourself. Your homepage returns 200, your load balancer is green, and your status page is all blue dots — and meanwhile the login button does nothing because a deploy shipped a broken bundle. Ping checks and HTTP probes never noticed, because the HTML came back fine. This is the exact gap an uptime monitoring browser fills: instead of checking that a page responds, it checks that a real person could actually log in, search, add to cart, and pay. The hard part has always been writing and maintaining those browser checks. BrowserBash takes a different route — you describe the journey in plain English, and an AI agent drives a real Chrome browser through it, no selectors required.

This article is for SREs, platform engineers, and SDETs who already run some uptime monitoring and keep getting paged for the wrong things — or, worse, *not* paged when a checkout silently dies. We'll cover what synthetic monitoring actually verifies, why traditional browser checks are so brittle, where an AI-driven browser changes the maintenance math, where it genuinely doesn't fit, and how to wire it into the alerting and CI you already have.

## What uptime monitoring really means once you have a browser

"Uptime" splits into three layers, and most teams only watch the cheapest one.

The first layer is **reachability**: does the server answer? An ICMP ping or a TCP connect tells you the box is alive. The second is **HTTP health**: does `GET /` return a 200 with the right content type and maybe a known string in the body? This is what the majority of uptime tools sell, and it's genuinely useful — it's cheap, it's fast, and it catches DNS outages, expired certs, and 5xx storms.

The third layer is **journey health**: can a user complete the thing your business actually depends on? Logging in. Searching the catalog. Submitting the support form. Checking out. None of these are visible to an HTTP probe, because all the interesting failures happen *after* the HTML loads — in JavaScript, in a third-party widget, in an API call fired by a click, in a payment iframe that throws on render.

Synthetic monitoring is the practice of scripting those journeys and running them on a schedule from somewhere outside your network, so you find out a flow is broken before your users file a ticket. When the journey involves a real rendered page and real clicks, you need a real browser — which is why an uptime monitoring browser, as opposed to a raw HTTP checker, is the tool that catches the failures that actually cost money. Industry guides in 2026 are blunt about this: the better tools go past simple uptime alerts to cover multi-step transaction flows and browser automation in real Chrome, because a 200 on the front page tells you almost nothing about whether the funnel works.

The catch: those browser checks are the most expensive thing you'll ever maintain in your monitoring stack.

## Why traditional synthetic browser checks rot

Here's the failure mode every SDET who has owned synthetic monitoring knows by heart. You record or script a checkout flow. It's green for three weeks. Then a frontend team renames a CSS class, swaps a `<button>` for a `<div role="button">`, or restructures the cart page into a new component. Your script — which was looking for `.btn-checkout-primary` — can't find the element, fails, and pages someone at 2 a.m. The application is completely fine. The *monitor* broke.

This is the central, well-documented pain of synthetic browser monitoring: transaction scripts are coupled to the DOM, so any UI change can break them even when the app works perfectly. The result is alert noise, eroded trust ("oh, that's just the flaky checkout monitor again"), and a standing maintenance tax that grows with every release. For a product that ships daily, keeping scripts current is a real operational cost, not a one-time setup.

The industry has three standard mitigations, and each has a tax of its own:

- **Stable test IDs.** You ask developers to embed `data-testid` attributes on every element a monitor touches, treating them as a public contract. This works, but it requires buy-in from teams who don't own the monitor, and it only covers elements you anticipated.
- **Resilient locators.** Playwright-style `getByRole()`, `getByText()`, and `getByLabel()` mimic how a human identifies an element and survive cosmetic CSS churn far better than raw selectors. This is genuinely good engineering and the right default for code-based checks.
- **Self-healing.** Some tools recompute a broken locator at runtime when the obvious one fails. Helpful, but it's still operating on the locator model — it's patching selectors, not removing them.

All three improve the situation. None of them remove the underlying coupling: somewhere there is a script that names page elements, and that script has to be kept in sync with a UI it doesn't control.

## How an AI browser changes the maintenance math

BrowserBash starts from a different premise. You don't write selectors at all. You write the *objective* in plain English, and an AI agent looks at the live page, decides what to click, does it, looks again, and keeps going until the goal is met or it gives up. There are no page objects, no CSS selectors, and no recorded steps to re-record when the layout shifts.

A monitor for "is login working" looks like this:

```bash
browserbash run "Go to https://app.example.com/login, sign in with email qa@example.com and the password in TEST_PW, and confirm the dashboard shows the user's name in the header"
```

When the login button moves, gets a new class, or turns into a different element, nothing in that command changes — because nothing in it ever named the button. The agent re-reads the page on each run and finds the element by intent ("the thing that signs me in"), the same way a person would. That's the headline shift in the maintenance math: a UI refactor that would break a selector-based check is usually a no-op for an objective-based one.

BrowserBash is a free, open-source (Apache-2.0) CLI from The Testing Academy. You install it once and point it at any URL:

```bash
npm install -g browserbash-cli
```

It drives a real Chrome/Chromium browser step by step and returns a verdict plus structured extracted values — not just pass/fail, but the actual data it read off the page. Under the hood the default engine is Stagehand (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals; you can switch to the in-repo `builtin` engine with `--engine builtin` when you want the Anthropic tool-use loop driving Playwright directly. You can read more about both on the [features page](https://browserbash.com/features).

This isn't magic, and it isn't free of trade-offs — we'll get to the honest caveats below. But for the specific problem of *brittle journey checks that break on cosmetic UI changes*, removing selectors from the equation is a real structural win, not a marketing line.

### The model story: $0 bills with local models

The thing that usually scares people off "AI in monitoring" is the API bill. Run a browser check every 5 minutes across a dozen journeys and you're looking at a lot of LLM calls. BrowserBash is built Ollama-first to neutralize exactly this.

The default model is `auto`, which resolves in order: if you have a local Ollama running, it uses `ollama/<model>` — free, no API keys, and nothing leaves your machine; otherwise it falls back to `ANTHROPIC_API_KEY` (claude-opus-4-8), then `OPENAI_API_KEY` (gpt-4.1), and if none of those exist it errors with guidance instead of doing something surprising. On local models, your monitoring traffic and credentials never leave the box, and the model bill is a guaranteed zero.

Honest caveat, because it matters for monitoring reliability: very small local models (8B and under) are flaky on long, multi-step objectives. They'll handle "load the page and confirm the title" fine, but a six-step checkout with conditional branches will trip them up. The sweet spot is a mid-size local model — Qwen3 or a Llama 3.3 70B-class model — or a capable hosted model for the genuinely hard flows. For uptime monitoring specifically, this usually means: cheap local model for the simple liveness checks, and a stronger model (local-but-bigger, or hosted) for the two or three revenue-critical journeys you can't afford to get wrong. The [learn section](https://browserbash.com/learn) walks through picking a model for your hardware.

## A practical monitoring setup, end to end

Let's build something you'd actually run, not a toy. Say you run an e-commerce app and the journeys you must never let fail are: login, product search, and add-to-cart. Here's how each piece fits.

### Step 1: Write the journeys as objectives

Start one-shot to get each objective working interactively:

```bash
browserbash run "On https://shop.example.com, search for 'wireless headphones', open the first result, add it to the cart, and confirm the cart count shows 1" --record
```

The `--record` flag captures a screenshot plus a `.webm` session video via bundled ffmpeg, and on the `builtin` engine it also writes a Playwright trace. When a check fails at 3 a.m., a 20-second video of exactly what the agent saw is worth more than any stack trace. Iterate on the wording until the agent reliably completes the flow, then move on.

### Step 2: Make them committable as markdown tests

One-shot commands are great for prototyping, but monitors should live in version control next to your app. BrowserBash supports markdown test files (`*_test.md`) where each list item is a step, with `{{variables}}` templating and `@import` composition for shared setup. Crucially, secret-marked variables are masked as `*****` in every log line, so a password in a login monitor never lands in your logs or your run store. Each run writes a human-readable `Result.md`, which is the artifact you actually paste into an incident channel.

A `checkout_test.md` might import a shared login step, then run the search and cart steps, parameterized by environment so the same file monitors staging and production.

### Step 3: Run them headless on a schedule

For unattended monitoring you want no visible window and a hard ceiling on how long a check can hang:

```bash
browserbash testmd run ./checkout_test.md --headless --timeout 90 --agent
```

`--headless` runs without a window. `--timeout 90` caps the run at 90 seconds so a stuck check fails fast instead of wedging your scheduler. `--agent` is the important one for monitoring: it emits NDJSON, one JSON object per line, with progress events like `{"type":"step","step":1,"status":"passed","action":"navigate"}` and a terminal `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","duration_ms":...}`. No prose to parse. Exit codes map cleanly too: `0` passed, `1` failed, `2` error, `3` timeout — so your cron job, systemd timer, or CI step can branch on the exit code and your alerting can ingest the NDJSON directly.

Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200 runs), so you have local history without setting up any backend.

### Step 4: Alert on it

Because `--agent` gives you a stable, machine-readable contract, wiring alerts is mundane in the best way. A tiny wrapper script runs the check on a schedule, reads the `run_end` line, and fires your existing alert path — PagerDuty, Opsgenie, a Slack webhook, whatever you already use — on a non-zero exit. There's no proprietary alerting layer to learn; BrowserBash produces the signal and hands it to the tools you trust. If you want a visual, `browserbash dashboard` runs a fully local dashboard at `localhost:4477` to browse run history, and `--clear` wipes the store when you need a clean slate.

This is deliberately a *composable* model. BrowserBash is the synthetic check engine; the scheduling, alerting, and on-call routing stay in your stack. For a step-by-step build, the [tutorials](https://browserbash.com/tutorials) cover the CI wiring in detail.

## Where the browser runs: local, CI, or a cloud grid

The browser doesn't have to run on your laptop. The `--provider` flag controls where Chrome actually executes:

| Provider | What it is | Needs | Good for |
| --- | --- | --- | --- |
| `local` (default) | Your own Chrome | Chrome installed | Dev, self-hosted runners, on-prem monitoring |
| `cdp` | Any DevTools endpoint | `--cdp-endpoint ws://...` | A browser you already manage |
| `browserbase` | Hosted browser grid | `BROWSERBASE_API_KEY` + project ID | Cloud runners, parallel checks |
| `lambdatest` | LambdaTest cloud | `LT_USERNAME` + `LT_ACCESS_KEY` | Cross-browser, geo coverage (auto `builtin` engine) |
| `browserstack` | BrowserStack cloud | `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` | Cross-browser, geo coverage (auto `builtin` engine) |

For uptime monitoring, geography matters: a check that only runs from your office tells you nothing about whether users in another region can reach the app. Running on a cloud provider, or on self-hosted runners in different regions, gives you that multi-location coverage. The `lambdatest` and `browserstack` providers automatically switch to the `builtin` engine, which is handled for you.

One honest limitation: BrowserBash does not bundle a global probe network the way a hosted uptime SaaS does. If you want checks running from 130 cities out of the box with zero infrastructure, a dedicated platform gives you that on day one. With BrowserBash you bring the runners (or a cloud provider) and own the scheduling. That's a fair trade if you value owning your monitoring and keeping data local; it's the wrong trade if you want a turnkey global grid with no ops.

## Honest comparison: AI browser vs. the established synthetic tools

Let's be specific and fair, because the established tools are good and serve real needs.

**Checkly** is monitoring-as-code built natively on Playwright. You write checks as standard Playwright test files and run them on a schedule from Checkly's locations; their free Hobby tier (as of 2026) includes a generous batch of API and browser check runs, with the Team plan starting around $30/month and scaling on volume. If your team already writes Playwright and wants a hosted scheduler, global locations, and dashboards without building anything, Checkly is an excellent, well-loved fit. The trade-off is the one we've discussed all article: your checks are Playwright code, so they carry the selector-maintenance tax (mitigated by resilient locators, but present).

**Datadog Synthetics** ties browser checks to full APM, so a failing synthetic can be traced straight to the slow query or 5xx that caused it. That correlation is the killer feature — and the reason to choose it. Pricing is usage-based (publicly, browser tests around $12 per 1,000 runs and API tests around $5 per 10,000 as of 2026), and high-frequency browser checks across many flows and locations add up quickly; published breakdowns put a busy setup well into the hundreds of dollars a month. If you're already all-in on Datadog and want synthetics correlated with your traces and logs, it's the obvious pick.

**Pingdom, Site24x7, and similar** lean toward fast, cheap uptime and simpler transaction checks from large global networks. If your need is "tell me the second the site goes down from 100 locations," these are purpose-built and inexpensive.

Here's the honest positioning:

| | BrowserBash | Code-based synthetic (e.g. Checkly) | APM-integrated synthetic (e.g. Datadog) |
| --- | --- | --- | --- |
| How you define a journey | Plain English objective | Playwright/script code | Recorder or script |
| Selectors to maintain | None | Yes (resilient locators help) | Yes (self-healing helps) |
| Survives cosmetic UI change | Usually, by design | Often, with good locators | Often, with self-healing |
| Model / compute cost | $0 on local models | Included in plan | Usage-based, can climb |
| Global probe network | Bring your own runners | Built in | Built in |
| Data leaves your machine | No (local models) | Yes (hosted) | Yes (hosted) |
| Trace/log correlation | No (composable, BYO) | Limited | Deep (its main strength) |
| License / cost | Free, open-source | Free tier + paid | Paid |

Where BrowserBash genuinely wins: you want journey checks that don't break every time the frontend ships, you want $0 model cost and data that never leaves your machine, and you're comfortable owning scheduling and alerting. Where it doesn't: you want a turnkey global probe network with zero ops, or you need synthetic results correlated with traces and logs inside an APM you already pay for. Both of those are real reasons to pick a hosted platform, and you should. See the [pricing page](https://browserbash.com/pricing) for the full picture on what's free.

## When to choose an AI browser for uptime monitoring

Choose this approach when:

- **Your journey checks break more from UI changes than from real outages.** If your monitoring backlog is mostly "fix the broken checkout script," removing selectors is the highest-leverage change you can make.
- **You need data residency or zero model spend.** Local models mean credentials and traffic stay on your infrastructure, and the model bill is zero by construction.
- **You already own scheduling and alerting** and just want a better synthetic check engine to plug in, not a whole new platform.
- **You want monitors that read like documentation.** A plain-English objective is reviewable by a PM or support lead, not just the SDET who wrote the selectors.

Lean toward a hosted platform when you want a global probe network on day one with no runners to manage, deep APM correlation, or a fully managed alerting and on-call experience out of the box. There's no shame in that — for a lot of teams it's the right call, and BrowserBash can still run alongside it for the handful of fragile journeys that drive your team crazy.

A pragmatic middle path a lot of teams land on: keep your cheap HTTP uptime checks where they are, and replace only your most-broken, highest-value browser journeys with objective-based BrowserBash checks. You get the reliability win where it hurts most without ripping out a working stack. The [case study](https://browserbash.com/case-study) page has real-world flows if you want to see the shape of it.

## Keeping it honest: the limits you should plan for

A monitoring article that only lists upsides isn't worth reading, so here are the constraints to design around.

LLM-driven agents are non-deterministic. The same objective can occasionally take a different path, and a weak model can misread an ambiguous page. For monitoring you mitigate this exactly like you mitigate flaky tests anywhere: use a capable model for critical flows, keep objectives specific and unambiguous, set a sane `--timeout`, and treat a single failure as a signal to verify (the recorded video makes that fast) rather than an automatic page. Many teams gate on two consecutive failures for the noisiest checks.

There's a real floor on model capability, repeated here because it's the most common way people get burned: a tiny local model on a ten-step flow will disappoint you. Match model size to flow complexity. Liveness and one-or-two-step checks are fine on small models; multi-step revenue journeys want a 70B-class local model or a hosted one.

And you own the operational surface. No bundled global grid, no managed alerting — that's the cost of a composable, local-first, open-source tool. For teams that want to own their monitoring, that's a feature. For teams that want everything managed, it's friction. Know which you are before you commit. Everything is on [GitHub](https://github.com/PramodDutta/browserbash) and the [npm package](https://www.npmjs.com/package/browserbash-cli) if you want to read the code before you trust it with a production journey.

## FAQ

### What is the difference between an uptime monitor and synthetic monitoring?

An uptime monitor typically checks reachability and HTTP health — does the server respond, does the page return a 200. Synthetic monitoring goes further by simulating a real user completing a journey, like logging in or checking out, usually in a real browser. The distinction matters because a page can return a healthy 200 while the login button is completely broken in JavaScript, and only a browser-based synthetic check will catch that.

### Can an AI browser run uptime checks without paid API keys?

Yes. BrowserBash defaults to an Ollama-first setup, so if you have a local model running it uses that with no API keys and no data leaving your machine, which means a guaranteed zero model bill. You only fall back to a hosted model like Claude or GPT if you set those API keys, and even then it's opt-in. For monitoring, a common pattern is a small local model for simple liveness checks and a stronger model for the few revenue-critical flows.

### How do I get alerts when a BrowserBash uptime check fails?

Run the check with the `--agent` flag, which emits NDJSON with a terminal `run_end` event and sets clean exit codes (0 passed, 1 failed, 2 error, 3 timeout). A small wrapper script on your scheduler reads that result and fires your existing alerting — PagerDuty, Slack, Opsgenie, or anything else — on a non-zero exit. BrowserBash produces the signal; your current on-call tooling handles the routing, so there's no new alerting platform to learn.

### Will an AI browser monitor break when the website's UI changes?

This is the main reason teams try it. Because you describe the journey in plain English instead of naming CSS selectors, a cosmetic UI change — a renamed class, a moved button, a restructured page — usually doesn't break the check, since the agent re-reads the page each run and finds elements by intent. It's not magic: a genuinely confusing redesign can still trip up a weak model. But for the everyday churn that breaks selector-based scripts, an objective-based check is far more resilient by design.

---

Stop getting paged for renamed buttons and start watching the journeys that actually matter. Install it and point it at your login flow in the next five minutes:

```bash
npm install -g browserbash-cli
```

No account needed to run a single check locally. When you want a free cloud dashboard for your runs, [sign up here](https://browserbash.com/sign-up) — it's optional, and your local checks work with or without it.
