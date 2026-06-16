---
title: Synthetic Monitoring With AI Agents vs Scripted Checks
description: "Synthetic monitoring AI vs scripted checks like Checkly and Ghost Inspector: where each wins, plus a plain-English BrowserBash recipe you run in CI."
date: 2026-04-22
category: use-case
---

Most teams find out their checkout is broken from a customer email, not from a monitor. The whole point of synthetic monitoring is to beat that email — to log into your app on a schedule, click through the flow a real user depends on, and shout before anyone's card declines. For a decade the way you did this was a scripted check: record or hand-write a sequence of selectors, schedule it from a probe location, and alert when a step fails. That still works. But synthetic monitoring AI changes the contract. Instead of encoding *how* to click each button, you describe *what* a healthy flow looks like in plain English, and an AI agent drives a real browser to confirm it. This article compares the two approaches honestly, names where scripted tools like Checkly and Ghost Inspector are the better fit, and shows how to run agent-driven checks with [BrowserBash](https://www.npmjs.com/package/browserbash-cli) on a schedule in CI.

I'll be direct about the tradeoffs. Agent-driven monitoring is not strictly better than a tuned scripted suite, and anyone selling you that is hand-waving. The two styles fail differently, cost differently, and break differently when your UI shifts. The right answer for most teams is a blend. By the end you'll know which critical flows belong in a scripted monitor and which are better served by a natural-language agent, and you'll have a copy-paste recipe for either.

## What synthetic monitoring actually is

Synthetic monitoring means you generate *synthetic* (simulated) traffic against your production app and watch whether it behaves. It's the opposite of real-user monitoring (RUM), which waits for actual users to generate signals. Synthetic checks run whether or not anyone is using the site, which is exactly why they catch a broken signup at 3 a.m. on a Sunday before your Monday cohort hits it.

There are roughly three tiers of synthetic check, in increasing fidelity:

- **Uptime / HTTP checks.** Ping a URL, assert a 200 and maybe a string in the body. Cheap, fast, and nearly useless for catching front-end regressions. Your API can return 200 while the React bundle fails to mount.
- **API / transaction checks.** Hit a sequence of endpoints, assert status codes and JSON shapes. Great for backend contracts, blind to anything that only breaks in the browser.
- **Browser checks.** Drive a real browser through a multi-step user journey — log in, search, add to cart, pay — and assert the user-visible outcome. This is the tier that actually protects revenue flows, and it's the tier this article is about.

Browser-tier synthetic monitoring is where the scripted-versus-agent debate matters, because browser checks are the ones that break constantly when your UI changes. A renamed CSS class, a new cookie banner, an A/B test that injects a modal — any of these can turn a green monitor red without a single real bug. How a tool handles that drift is the whole ballgame.

## The scripted approach: Checkly, Ghost Inspector, and friends

Scripted synthetic monitoring is the mature, well-understood camp. You define the exact steps and the tool replays them on a schedule.

**Checkly** is a modern, developer-first platform built around monitoring-as-code. You write browser checks as Playwright scripts, commit them, and Checkly runs them from global locations on a cron-like schedule with alerting and dashboards. As of 2026 its model is real Playwright, so you get Playwright's full API, auto-waiting, and trace artifacts. If your team already writes Playwright, Checkly feels like home, and its Playwright-native approach is genuinely excellent. The flip side is that you are maintaining selectors and scripts — when the DOM shifts, a human edits the code.

**Ghost Inspector** comes from the record-and-playback lineage. You record a flow in the browser, it captures steps and assertions, and it replays them on a schedule from the cloud with screenshots and video. It's friendlier to non-engineers and has been around long enough to be dependable. Its assertions and step model are its own; the exact internals and current pricing tiers are not something I'll invent here — check their site for the 2026 numbers. The general tradeoff of the record-and-playback family is well known: recordings are fast to create and brittle to maintain, because a recorded step is pinned to a specific element.

Other names in this space — Datadog Synthetics, New Relic, Grafana, Pingdom, Uptime-style tools — sit at various points on the same spectrum. The common thread across all scripted tools is this: **the test encodes the mechanism.** It knows that "log in" means *type into `#email`, type into `#password`, click `button[type=submit]`*. That precision is a feature when your UI is stable and a liability when it isn't.

### Where scripted checks genuinely win

I want to be fair here, because scripted monitoring earns its place:

- **Determinism.** The same script does the same thing every run. When it passes, you know exactly what passed. There's no model deciding what "looks logged in" means.
- **Speed and cost per run.** A compiled Playwright script clicking known selectors is fast and cheap. No model inference per step.
- **Precise assertions.** You can assert exact text, exact network responses, exact pixel regions. An agent's "it looks complete" is fuzzier than `expect(page.locator('#total')).toHaveText('$49.00')`.
- **Mature alerting and global probes.** Checkly and the big observability platforms have years of work in multi-region runners, on-call routing, SLO tracking, and status pages. A CLI you schedule yourself does not.

If you have a small set of stable, business-critical flows and a team comfortable maintaining test code, a scripted monitor on a dedicated platform is a perfectly good answer. Don't let anyone AI-shame you out of it.

## The agent approach: describe the flow, let it drive

Agent-driven synthetic monitoring inverts the contract. You don't tell the tool *how* to click; you tell it *what* a healthy run looks like, and an AI agent figures out the clicks at runtime by looking at the page.

With BrowserBash, a browser check is a plain-English objective:

```bash
browserbash run "Go to shop.example.com, log in with the test account, \
add the first product to the cart, complete checkout with the saved test \
card, and confirm the page shows 'Thank you for your order!'"
```

There are no selectors in that command. The agent loads a real Chrome, reads the page, decides the next action, and repeats until your objective is met or it gives up. It returns a verdict plus structured results. If your "Add to cart" button moves, gets renamed, or changes from a `<button>` to an `<a>`, the agent generally doesn't care — it's looking for the thing a human would click, not a frozen selector.

That's the core promise of synthetic monitoring AI: **the check describes intent, so cosmetic UI churn doesn't turn the monitor red.** This is the same drift that generates a steady drip of selector-maintenance pull requests in scripted suites. Move that resilience to the monitoring layer and you stop paying the drift tax on your most-changed flows.

BrowserBash is a free, open-source (Apache-2.0) CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, no account required to run. Under the hood it can use the Stagehand engine (MIT, from Browserbase) or a builtin Anthropic tool-use loop, and it drives a real Chrome/Chromium — not a headless simulation of one. You can read the full feature set on the [features page](https://browserbash.com/features).

### The model story, and an honest caveat

Here's the part vendors usually skip. The quality of an agent-driven check is the quality of the model driving it.

BrowserBash is Ollama-first: by default it uses free local models, no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. On local models you can guarantee a literal $0 model bill, which is genuinely attractive for a check that runs every five minutes — scripted-tool per-run cloud costs add up, but inference on your own hardware doesn't bill you.

The honest caveat: very small local models (roughly 8B and under) get flaky on long multi-step objectives. A six-step checkout is exactly the kind of flow where a tiny model loses the plot. The sweet spot for reliable monitoring is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model — BrowserBash supports OpenRouter, including genuinely free hosted options like `openai/gpt-oss-120b:free`, and Anthropic Claude with your own key. If you try to monitor a critical purchase flow with an 8B model and it flakes, that's not a knock on agent monitoring; it's the wrong tool for the job. Match model size to flow complexity and the flakiness mostly evaporates.

## Scripted vs agent monitoring, side by side

Here's the comparison I wish someone had handed me before I picked a side.

| Dimension | Scripted checks (Checkly, Ghost Inspector) | Agent-driven checks (BrowserBash) |
| --- | --- | --- |
| How a check is defined | Selectors, recorded steps, or Playwright code | Plain-English objective, no selectors |
| Resilience to UI churn | Breaks on renamed/moved elements | Tolerates cosmetic UI changes |
| Determinism | High — same steps every run | Lower — model decides actions at runtime |
| Assertion precision | Exact text / network / pixel | Outcome-level ("page shows X") |
| Per-run cost | Cloud minutes / plan tier | $0 on local models; hosted-model tokens optional |
| Where the browser runs | Vendor cloud probes | Your machine, CDP, or vendor cloud via `--provider` |
| Maintenance load | Selector upkeep on every UI change | Mostly prose edits, far less frequent |
| Global multi-region probes | Mature, built in | You schedule it yourself |
| On-call / SLO tooling | Mature | Bring your own (CI alerts, dashboards) |
| Data privacy | Test traffic flows through vendor | Stays local on local models |
| Setup friction | Account + script/recording | `npm install`, write a sentence |

Read that table as "different tools," not "winner and loser." Scripted monitoring is stronger on determinism, precise assertions, and turnkey global infrastructure. Agent monitoring is stronger on resilience to change, data privacy, cost on local hardware, and setup speed. The [learn hub](https://browserbash.com/learn) walks through more of the agent side if you want to go deeper.

## Running agent-driven synthetic checks in CI

You don't need a separate monitoring platform to get scheduled synthetic checks — your CI already runs jobs on a schedule. A GitHub Actions cron, a GitLab scheduled pipeline, or a Jenkins timer can run BrowserBash every few minutes and treat the exit code as the verdict.

The key design choice is the `--agent` flag. It emits NDJSON — one JSON event per line on stdout — so nothing has to parse prose to decide pass/fail. Exit codes carry the verdict: `0` passed, `1` failed, `2` error, `3` timeout. That maps cleanly onto a CI step's success/failure, and onto whatever alerting your CI already has.

```bash
browserbash run "Log in at app.example.com with the test account and \
confirm the dashboard loads with the user's name in the header" \
  --agent \
  --headless \
  --record
```

`--headless` runs without a visible window, which is what you want on a CI runner. `--record` captures a screenshot and a full `.webm` session video via ffmpeg, so when a 3 a.m. run goes red you can watch exactly what the agent saw. On the builtin engine you also get a Playwright trace you can open in the trace viewer — the same artifact you'd reach for debugging a scripted Playwright check.

A minimal GitHub Actions schedule looks like this:

```yaml
on:
  schedule:
    - cron: "*/15 * * * *"   # every 15 minutes
jobs:
  synthetic:
    runs-on: ubuntu-latest
    steps:
      - run: npm install -g browserbash-cli
      - run: |
          browserbash run "Log in and confirm the dashboard loads" \
            --agent --headless --record
        env:
          BB_USER: ${{ secrets.TEST_USER }}
          BB_PASS: ${{ secrets.TEST_PASS }}
```

Because the step's exit code is the verdict, a failed login flow turns the workflow red and triggers your existing GitHub notifications. No `grep` for "0 failed," no log-shape coupling. If you've ever had a monitor sail green for a week because a log format changed, you'll appreciate how much sturdier exit-code-as-truth is. There's a deeper walkthrough on [the blog](https://browserbash.com/blog) covering CI patterns specifically.

### Committable checks with markdown tests

For monitoring you want your checks in version control, reviewable, and composable. BrowserBash's markdown tests do that. A `*_test.md` file holds one step per list item, supports `@import` composition so shared steps (like login) live in one file, and `{{variables}}` templating. Variables marked secret are masked as `*****` in every log line — which matters when your monitor logs end up in CI output that the whole team can read.

```bash
browserbash testmd run ./checkout_test.md \
  --var BASE_URL=https://shop.example.com \
  --var-secret CARD={{TEST_CARD}}
```

Each run writes a human-readable `Result.md`, so even a non-engineer can open the artifact and see what the synthetic check did and where it stopped. That `Result.md` plus the recorded video is often a faster incident triage than digging through a scripted tool's step log.

## Pushing runs to a free dashboard with --upload

Exit codes tell CI pass/fail, but humans want history: a trend of run results, replays of failures, video of the moment it broke. BrowserBash's dashboard gives you that, and it's strictly opt-in.

Two flavors:

- **Local dashboard** — `browserbash dashboard` runs a free dashboard entirely on your machine. Nothing uploaded, full run history and replay, good for a team that wants visibility without sending anything off-box.
- **Cloud dashboard** — opt in with `browserbash connect`, then add `--upload` to any run. You get run history, video recordings, and per-run replay in a hosted dashboard. It's free; uploaded free runs are kept 15 days. An account is optional and only needed if you want the cloud side.

```bash
browserbash run "Add an item to the cart and complete checkout, \
confirm 'Thank you for your order!'" \
  --agent --headless --record --upload
```

For synthetic monitoring this is the piece that replaces the "dashboard" you'd otherwise pay a monitoring vendor for. Every scheduled run lands as a row with its verdict; click a red one and watch the replay. The 15-day retention on free uploaded runs is plenty for "what happened last night," though it's not a long-term SLO archive — if you need quarters of history, that's a point in favor of a dedicated platform, and I'll say so plainly. You can compare what's free versus what isn't on the [pricing page](https://browserbash.com/pricing).

### Where the browser runs: the --provider flag

By default BrowserBash drives your local Chrome. For monitoring you sometimes want the browser somewhere else — a clean cloud environment, a specific region, a real device farm. One flag switches that:

- `--provider local` — your Chrome (default).
- `--provider cdp` — any DevTools endpoint you point it at.
- `--provider browserbase`, `--provider lambdatest`, `--provider browserstack` — managed cloud browser grids.

```bash
browserbash run "Complete checkout and confirm the order succeeds" \
  --agent --headless --provider lambdatest --upload
```

This gives you a poor-man's multi-region story: schedule the same objective against a cloud provider from CI and you're checking the flow from outside your own network. It's not as turnkey as Checkly's built-in global probe map, and I won't pretend it is — but it covers the common case of "does this work from a fresh, non-local browser" without standing up infrastructure.

## When to choose scripted vs agent monitoring

Here's the decision framework I'd actually use.

**Choose scripted monitoring (Checkly, Ghost Inspector, or an observability platform) when:**

- You need turnkey multi-region probes, mature on-call routing, SLO dashboards, and long-term history out of the box.
- Your critical flows are stable and you need exact, deterministic assertions (precise totals, exact network responses).
- Your team already writes Playwright and wants monitoring-as-code in that exact idiom — Checkly is hard to beat here.
- Compliance or procurement requires a vendor with an SLA and a status page. A self-scheduled CLI doesn't give you a throat to choke.

**Choose agent-driven monitoring (BrowserBash) when:**

- Your most important flows also change the most, and you're tired of selector-maintenance PRs on your monitors.
- You want a $0 model bill and test traffic that never leaves your machine — local models keep everything on-box.
- You want checks that read like documentation, so a PM can review the monitor and understand what's covered.
- You already run CI and would rather schedule a job there than adopt and pay for another platform.
- You want machine-readable output (`--agent` NDJSON, clean exit codes) to wire into AI coding agents or custom alerting.

**Run both when** you have the budget and the flows to justify it — and many teams should. Put your handful of revenue-critical, must-be-exact flows in a scripted monitor with global probes, and put your long tail of important-but-churny flows behind agent checks in CI. The two cover each other's blind spots. The agent layer absorbs UI churn; the scripted layer guarantees the money paths to the pixel. There are write-ups of teams blending the two on the [case study page](https://browserbash.com/case-study).

### A note on flakiness, honestly

Agent checks can flake in ways scripted checks don't: the model occasionally misreads a page or takes a wrong turn. Three things keep this in check. First, model choice — use a 70B-class local or capable hosted model for multi-step flows, not an 8B. Second, scope — a focused objective ("log in and confirm the dashboard header shows the username") is far more reliable than a sprawling ten-step epic; split long journeys into separate checks. Third, retries — wrap the CI step so a single hiccup retries once before paging anyone, the same hygiene you'd apply to any synthetic monitor. Do those three and agent monitoring is stable enough to trust on a schedule.

## Putting it together: a realistic monitoring setup

A balanced setup for a typical SaaS or store, end to end:

1. **Uptime layer.** Cheap HTTP checks on your key URLs and APIs, every minute. Catches hard-down fast.
2. **Critical-path scripted checks.** Two or three flows that must never silently break and need exact assertions — payment, signup — in a scripted monitor with global probes and on-call routing.
3. **Agent-driven CI checks.** Your broader set of important journeys as BrowserBash objectives, scheduled in CI with `--agent --headless`, exit-code-as-verdict, `--record` for evidence, and `--upload` so failures land in the dashboard with replay.
4. **Markdown test files in version control.** Shared login via `@import`, secrets masked, `Result.md` artifacts for triage.

That layering gives you fast detection, deterministic guarantees on money paths, and broad resilient coverage on everything else — without paying a platform to monitor flows that change every sprint. Start the agent layer in an afternoon: `npm install -g browserbash-cli`, write your first objective as a sentence, and schedule it.

## FAQ

### Is AI synthetic monitoring reliable enough for production?

For the right flows and the right model, yes. Use a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model for multi-step journeys, keep each check focused rather than sprawling, and add a single retry before alerting. Very small local models under about 8B can flake on long flows, so match the model to the complexity. With those guardrails, agent-driven checks are stable enough to schedule against production.

### How is synthetic monitoring AI different from Checkly or Ghost Inspector?

Scripted tools like Checkly and Ghost Inspector encode the exact steps — selectors or recorded clicks — so they break when the UI changes but give you precise, deterministic assertions. Agent-driven monitoring describes the intended outcome in plain English and lets an AI agent figure out the clicks at runtime, so it tolerates cosmetic UI churn. Scripted tools also ship mature global probes and on-call tooling out of the box; an agent CLI you schedule yourself does not. Many teams run both and let each cover the other's blind spots.

### Can I run BrowserBash synthetic checks in CI for free?

Yes. BrowserBash is free and open-source under Apache-2.0, installs with one npm command, and needs no account to run. On local models your model bill is literally $0, and your CI runner's exit code becomes the pass/fail verdict via the `--agent` flag. The optional cloud dashboard is also free, with uploaded free runs kept for 15 days.

### Does my data leave my machine with agent-driven monitoring?

Not by default. BrowserBash is Ollama-first and defaults to local models, so the page content and your test traffic stay on your machine with no API keys involved. Data only leaves if you opt into a hosted model (Anthropic or OpenRouter), a cloud browser provider, or the cloud dashboard via `--upload`. The fully local `browserbash dashboard` keeps everything on-box if you want history without uploading.

Synthetic monitoring AI won't replace a well-tuned scripted suite overnight, and it shouldn't — but for the churny, important flows that generate your selector-maintenance backlog, agent-driven checks in CI are a faster, cheaper, and more resilient way to know your app works before your customers tell you it doesn't. Install it with `npm install -g browserbash-cli`, write your first check as a sentence, and schedule it. Want the cloud dashboard and replay history too? Grab a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) — it's optional, and you can run everything locally without it.
