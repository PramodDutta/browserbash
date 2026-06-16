---
title: Fellou vs BrowserBash: Agentic Browser or Test Agent CLI
description: "A fellou browser alternative for QA teams: an agentic browser that does your work vs a headless, CI-friendly test CLI that verifies it."
date: 2026-02-17
category: agents
---

If you have watched Fellou plan a multi-step task, log into a few sites, and hand you back a finished result, you have seen what an agentic browser can do. It is genuinely useful, and it is also why a lot of QA engineers start hunting for a **fellou browser alternative** the moment they try to bend that experience into a test pipeline. The two things look similar from across the room: both use an AI agent to drive a browser without you writing selectors. Up close they are built for opposite jobs. This piece compares Fellou, an all-in-one agentic browser product, with BrowserBash, an open-source, headless, scriptable test-runner CLI from The Testing Academy, and tries to be honest about where each one wins.

I have wired enough agents into CI to know that the thing that breaks a deploy gate is almost never a lack of intelligence. It is non-determinism, output you cannot parse, and a tool that decides to be helpful in a way you did not ask for. So let's look at what each tool actually is, where they genuinely overlap, and where one is plainly the better fit.

## What Fellou actually is

Fellou is an AI-first web browser. Instead of treating an AI assistant as a sidebar bolted onto Chrome, the browser itself is built around an agent. You type a goal in plain language and Fellou generates a step-by-step execution plan you can review, edit, and approve before it runs. It can then carry out that plan in background windows while you keep browsing, handle authenticated sessions across platforms (its marketing highlights research workflows across logged-in services), and remember context from your history through an "agentic memory" feature. It bundles several agent types — browser, coding, file, shell, and computer-use — and can schedule recurring tasks like a weekly summary of a set of pages.

The core pitch is breadth and control. Where some agentic browsers operate as a black box, Fellou leans into letting you inspect and edit the planned workflow before it executes, and intervene mid-run. It is a consumer-and-knowledge-worker product: deep search, research, and "do this task on the web for me" all live inside one application you open like any other browser.

A few honest notes on the facts. Fellou's exact internals, model stack, and roadmap are a product detail that shifts over time, and they are not fully publicly specified, so treat anything you read about its underlying models as "as of 2026" rather than fixed truth. On pricing, public reviews describe a freemium model: a free allowance of a small number of tasks, then paid tiers (commonly cited around the $19–$199/month range) using a credit system. Those numbers move and vary by region and billing cycle, so I am not going to pin a hard price to it — check Fellou directly for current plans. What is clearly true is the shape of the thing: a hosted, all-in-one agentic browser you install and use interactively, not a headless binary you drop into a `.yml` file.

## What BrowserBash actually is

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy, founded by Pramod Dutta. You install it with `npm install -g browserbash-cli`, write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects. At the end you get a verdict plus structured results. The current release is 1.3.1.

The defining design choice is that BrowserBash is built for *verification*, not open-ended task completion. It is Ollama-first: out of the box it uses free local models, so you need no API keys and nothing leaves your machine. It auto-resolves a local Ollama install first, then falls back to `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` if you would rather use a hosted model. That means you can run an entire test suite for a guaranteed $0 model bill on local models, or reach for a capable hosted model when a flow is genuinely hard. OpenRouter even exposes some genuinely free hosted models (like `openai/gpt-oss-120b:free`) if you want more horsepower without a credit card. You can take the full feature tour on the [BrowserBash learn page](https://browserbash.com/learn).

One honest caveat I always give people up front: very small local models — roughly 8B parameters and under — can get flaky on long, multi-step objectives. They lose the thread, click the wrong element, or declare victory too early. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow has a lot of branching. If you point a tiny model at a ten-step checkout and it wobbles, that is the model, not the tool — size up and it settles down.

No account is needed to run anything. There is an optional, free cloud dashboard with run history, video recordings, and per-run replay, but it is strictly opt-in through `browserbash connect` plus an `--upload` flag. There is also a fully local dashboard (`browserbash dashboard`) if you want history and replay without any cloud at all. Free uploaded runs are kept for 15 days.

## The honest overlap

It would be dishonest to pretend these tools share nothing. Both use a large language model to interpret intent and drive a browser without selectors. Both can log into a site, click around, and complete a flow that a brittle CSS-or-XPath script would choke on. Both let an agent figure out the "how" so you only have to describe the "what." If your task is "go to this page and do this thing," either one can plausibly get it done, and Fellou will likely feel more polished because it is a finished product with a UI, a plan preview, and memory baked in.

The overlap matters because it sets up the real question. The interesting difference is not *can the agent drive a browser* — both can. It is what happens when you need that browser action to run the same way a thousand times, fail loudly when the app breaks, and report a result your pipeline can read without a human squinting at it. That is where an interactive agentic browser and a headless test CLI diverge hard, and it is the entire reason a **fellou browser alternative** keeps surfacing in QA channels.

## Interactive product vs. scriptable runner

The cleanest way to think about it: Fellou is something you *use*, and BrowserBash is something you *run*.

Fellou lives on your desktop. You open it, type a goal, watch it plan, approve, and read the result. The whole experience is designed around a human in the loop — reviewing the plan, intervening when it goes sideways, reading the natural-language summary it produces. That human in the loop is a feature. It is what makes an agentic browser feel safe and controllable for open-ended work, where you genuinely cannot predict every step in advance.

BrowserBash is a command. It is built to be invoked by a `Makefile`, a GitHub Actions job, a cron entry, or another AI coding agent. There is no window you sit in front of. You give it an objective, it runs headless if you ask, and it exits with a code. The whole design assumes *nobody is watching* at the moment it runs — that the result has to be machine-consumable because the consumer is a pipeline, not a person.

```bash
# Fully headless, CI-friendly run. No GUI, no human watching.
browserbash run "log in as standard_user, add the backpack to the cart, \
  complete checkout, and verify 'Thank you for your order!' appears" \
  --headless --agent

echo "exit code: $?"   # 0 passed, 1 failed, 2 error, 3 timeout
```

That difference cascades into almost every decision below. Plan-preview-and-approve is wonderful when a human is steering. It is a non-starter when the thing has to run unattended at 3am on every pull request.

## Why exit codes matter more than a finished result in CI

Here is the core of the argument. A test does exactly one valuable thing: it tells you, unambiguously, whether something works. Everything else — screenshots, videos, logs — is supporting evidence. The verdict is the product. And a verdict is only useful to automation if a machine can read it without interpreting prose.

BrowserBash is built around that contract. Run it in agent mode with `--agent` and it emits NDJSON — one JSON event per line on stdout — so an AI coding agent or a CI script consumes structured events, never paragraphs. More importantly, it returns real process exit codes:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

That is the entire interface a CI gate needs. Your pipeline runs the command, checks `$?`, and branches. No regex over a chat transcript, no "the agent said it looked successful," no parsing a friendly paragraph to guess whether checkout actually completed.

An agentic browser optimizes for the opposite of this. Its job is to complete the task and present a satisfying, readable result to a human. That is exactly what you want when you are researching a market or pulling data across logged-in sites. It is exactly what you do *not* want in a test, where "the agent improvised around the broken button and reported success" is a false pass that lets a bug ship. The finished result Fellou is so good at producing is the wrong currency for a deploy gate. Exit codes are the right one.

If you have ever tried to make a pass/fail decision by scraping an agent's natural-language summary, you already feel why this matters. The exit code is boring. Boring is exactly what you want when a release is on the line.

## Determinism, repeatability, and the false-pass problem

The deeper issue with general autonomy in testing is the false pass. An agent rewarded for completing the task will, if it is good, find a way to complete the task. If the "Buy" button is broken, a capable agent might find a deep link, a keyboard shortcut, or an alternate flow and finish the purchase anyway. For a personal browsing assistant, that resourcefulness is the whole point. For a regression suite, it just hid a P1 from you.

A test-focused tool should be a little bit literal on purpose. When you tell BrowserBash to verify that "Thank you for your order!" appears after clicking the visible checkout button, you want it to walk that path and tell you the truth about it — not to creatively route around a defect to make the run green. Narrow scope is the feature here, not a limitation.

Repeatability is the other half. A test you run nightly has to behave the same way tonight as it did last week, or the signal is worthless. The more degrees of freedom an agent has, the more its run-to-run behavior drifts. BrowserBash narrows the surface deliberately: a stated objective, a real browser, a structured verdict. You can still use a smart model under the hood, but the contract around it is fixed. Output you can diff, exit codes you can gate on, and committable test files you can review in a pull request.

## Committable tests, secrets, and version control

There is a workflow gap that gets bigger the more seriously you take testing, and it is about source control.

A test that lives in a desktop app's history is not a test your team owns. It is not in the repo, it is not in code review, and it is not in the diff when someone changes the checkout flow. BrowserBash ships a Markdown test format precisely for this. You write a `*_test.md` file where each list item is a step, compose files together with `@import`, and template values with `{{variables}}`. Secret-marked variables are masked as `*****` in every log line, so a password never lands in your CI output. After each run it writes a human-readable `Result.md` you can attach to a build.

```bash
# A committable Markdown test with a templated, masked secret
browserbash testmd run ./checkout_test.md \
  --var username=standard_user \
  --secret password=$STORE_PASSWORD \
  --agent --headless
```

Inside `checkout_test.md`, the steps read like plain English:

```text
# Checkout smoke test
- Go to the store and log in as {{username}} with password {{password}}
- Add the backpack to the cart
- Open the cart and proceed to checkout
- Fill shipping details and place the order
- Verify the page shows "Thank you for your order!"
```

That file lives next to your code. It is reviewable, greppable, and diffable. When the checkout flow changes, the test change shows up in the same pull request. An interactive agentic browser is not trying to solve this problem — it is not where your team's regression suite is supposed to live — and that is fine. It is just a different job. You can read more about the Markdown test workflow on the [BrowserBash features page](https://browserbash.com/features).

## Evidence: recordings, traces, and replay

When a test fails, "it failed" is not enough; you need to see what happened. Both kinds of tools produce artifacts, but they produce them for different audiences.

Fellou, as an interactive product, shows you the run as it happens — you are watching it work. BrowserBash, running unattended, has to capture evidence for someone who was not there. Pass `--record` and it captures a screenshot plus a full `.webm` session video using ffmpeg, on any engine. On the builtin engine it additionally captures a Playwright trace you can open in the trace viewer and step through action by action. That is the difference between "the nightly job failed, good luck" and "here is the video and the trace, the third step clicked the wrong button."

```bash
# Capture a screenshot, a .webm video, and (on builtin) a Playwright trace
browserbash run "search for 'wireless mouse', open the first result, \
  add it to the cart, and verify the cart count is 1" \
  --record --engine builtin
```

If you opt into the free cloud dashboard with `browserbash connect` and `--upload`, those recordings and per-run replays show up in a web UI with run history, kept 15 days on the free tier. Prefer to keep everything local? `browserbash dashboard` gives you the same history and replay with nothing leaving your machine. Both are optional; neither is required to get a verdict.

## Where the browser runs: providers and engines

One more axis that matters for teams. BrowserBash separates *what* it does from *where* the browser runs. A single `--provider` flag switches the execution target:

- `local` (default) — your own Chrome
- `cdp` — any Chrome DevTools Protocol endpoint
- `browserbase`, `lambdatest`, `browserstack` — hosted browser grids

So you can develop against your local Chrome, then run the exact same objective across a cloud grid for cross-browser coverage without rewriting anything.

```bash
# Same objective, run on a LambdaTest cloud browser for cross-platform coverage
browserbash run "open the pricing page and verify the Pro plan shows '$29/mo'" \
  --provider lambdatest --headless --agent
```

It also exposes two engines: `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin` (an in-repo Anthropic tool-use loop, the one that emits Playwright traces). An agentic browser, by contrast, runs where it runs — the browser *is* the product, so there is no notion of pointing it at your CI's Selenium grid or a BrowserStack session. Again, not a flaw; just a different design center.

## Side-by-side comparison

| Dimension | Fellou | BrowserBash |
|---|---|---|
| Product shape | All-in-one agentic browser (desktop app) | Open-source CLI you `npm install` |
| Primary job | Do web tasks, deep search, research for you | Verify a web flow works, pass/fail |
| Interaction model | Interactive, human-in-the-loop, plan preview | Headless, unattended, scriptable |
| License / source | Proprietary product | Apache-2.0, fully open source |
| Pricing | Freemium, credit-based tiers (as of 2026) | Free CLI; $0 model bill possible on local models |
| Models | Not fully publicly specified | Ollama-first local, or Anthropic / OpenRouter keys |
| Data path | Hosted product | Local-first; nothing leaves your machine by default |
| CI integration | Not its design center | NDJSON + exit codes (0/1/2/3) built for CI |
| Committable tests | Not the goal | `*_test.md` with `@import` + `{{variables}}` |
| Evidence | Watch it run live | Screenshot, `.webm`, Playwright trace, replay |
| Where it runs | The browser is the product | local / cdp / browserbase / lambdatest / browserstack |

Read that table as two different tools, not a scoreboard. Several of Fellou's "missing" rows are things it was never trying to do.

## When to choose Fellou

I will be direct: for a lot of people, Fellou is the better pick, and pretending otherwise would cost me your trust.

Choose Fellou when the work is open-ended and a human is in the loop. If you are doing research across many sites, pulling data from services you are logged into, summarizing pages on a schedule, or you just want an AI browser that completes fuzzy tasks for you with a plan you can review and edit, that is squarely what it is built for. The plan-preview-and-approve flow, the cross-platform authenticated sessions, the agentic memory — those are real advantages for knowledge work, and a headless test CLI offers you none of them because it is not trying to.

If your question is "I want one application that browses the web and does tasks for me," BrowserBash is the wrong tool and Fellou (or another agentic browser) is the right category. Don't reach for a CI-shaped hammer for an interactive-research-shaped nail.

## When to choose BrowserBash

Choose BrowserBash when the job is *verification that has to run without you*. If you need to gate a deploy on whether login still works, run a checkout smoke test nightly, catch regressions in a pull request, or hand an AI coding agent a tool that returns clean structured output instead of prose, this is the shape that fits.

The concrete signals: you want exit codes a pipeline can branch on, not a paragraph to parse. You want committable `*_test.md` files in version control with masked secrets, not runs trapped in an app's history. You want a guaranteed $0 model bill on local models and data that never leaves your machine. You want to point the same objective at your local Chrome today and a BrowserStack grid tomorrow with one flag. And you want NDJSON, recordings, and Playwright traces so a failed nightly job explains itself.

If you are an SDET, an SRE, or a platform engineer who lives in YAML and exit codes, that is the BrowserBash sweet spot. You can compare options across the broader space in the [BrowserBash blog](https://browserbash.com/blog), and there is a [pricing page](https://browserbash.com/pricing) that lays out exactly what is free (most of it).

## Can you use both?

Yes, and plenty of people will. Use Fellou as your daily agentic browser for research and ad-hoc tasks where you want to watch and steer. Use BrowserBash in CI as the thing that proves the flows those tasks depend on still work, with exit codes and committed tests. They are not really competitors so much as tools that happen to share a technique — an LLM driving a browser — pointed at different problems. The mistake is using one where the other belongs: an interactive browser as a deploy gate, or a headless CLI as your research assistant.

## FAQ

### Is BrowserBash a good Fellou alternative for CI testing?

For CI specifically, yes. Fellou is an interactive agentic browser designed for human-in-the-loop web tasks, while BrowserBash is a headless CLI built to run unattended in pipelines. BrowserBash returns real exit codes (0 passed, 1 failed, 2 error, 3 timeout) and NDJSON output a pipeline can branch on, which is what a deploy gate needs. If your goal is research or doing tasks for you, Fellou is the better fit; if it is automated verification, BrowserBash is.

### Is BrowserBash free and open source?

Yes. BrowserBash is free and open source under the Apache-2.0 license, installed with `npm install -g browserbash-cli`. It is Ollama-first, so it defaults to free local models with no API keys, which means you can run a full suite for a $0 model bill. The optional cloud dashboard is also free and strictly opt-in, and there is a fully local dashboard if you prefer nothing to leave your machine.

### Does BrowserBash need API keys or an account to run?

No. By default it uses local models through Ollama, so nothing leaves your machine and you need no keys or account to run a test. If you want a hosted model instead, it auto-resolves an `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` when present, including some genuinely free OpenRouter models. An account is only needed for the optional cloud dashboard, and even that has a fully local alternative.

### What is the difference between an agentic browser and a test agent CLI?

An agentic browser like Fellou is a full application you open and interact with; it plans and completes open-ended web tasks with a human reviewing and steering along the way. A test agent CLI like BrowserBash is a command you run unattended; it verifies a specific flow and reports a machine-readable pass or fail. One optimizes for completing fuzzy tasks for a person, the other for catching regressions for a pipeline. They share the underlying technique but are built for opposite jobs.

Ready to add a CI-friendly verification layer to your stack? Install it with `npm install -g browserbash-cli`, point it at a flow, and check the exit code. No account is required to run anything — but if you want free run history and replay, you can [sign up here](https://browserbash.com/sign-up) whenever it suits you.
