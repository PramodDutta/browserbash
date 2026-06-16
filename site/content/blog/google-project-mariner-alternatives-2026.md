---
title: Google Project Mariner Alternatives You Can Use Today
description: "Project Mariner alternatives you can install and run now — Operator, browser-use, Skyvern, and BrowserBash, the no-waitlist CLI for web automation."
date: 2026-02-12
category: alternatives
---

Project Mariner is the kind of demo that makes you want to refresh your access status three times a day. Google's research prototype drives a browser for you — books the thing, fills the form, walks the multi-tab flow — and it looks genuinely good in the clips. The problem is the one every developer hits with a Google research preview: you can watch it, but you mostly cannot use it. So if you came here searching for Project Mariner alternatives because you need a web agent that runs against your own pages this afternoon, not whenever your name clears a waitlist, this guide is for you.

I work on BrowserBash, so I will be upfront that its section is the vendor talking. The rest I have tried to keep honest, including the parts where another tool is the better pick. I will cover what Mariner actually is, why access is the real blocker, and then four available options — OpenAI's Operator, the open-source browser-use and Skyvern projects, and BrowserBash as an install-and-run CLI — with a comparison table and a plain decision section so you can leave with an actual choice.

## What Project Mariner is (and what's publicly known)

Project Mariner is a research prototype from Google DeepMind, first shown in late 2024 and built around the Gemini model family. The pitch: an agent that operates inside a browser, takes a goal in plain language, and carries out multi-step tasks across the web on your behalf — researching, comparing, filling forms, navigating between pages and tabs. In its early form it ran as a Chrome extension that took over a tab and narrated what it was doing.

Beyond that high-level description, a lot of the specifics are not publicly nailed down, and I am not going to invent them. As of early 2026, Mariner has been positioned as an experimental capability tied to Google's premium AI subscriptions and surfaced through limited previews rather than a general, documented developer API you can install against. Exact rollout, regional availability, rate limits, and pricing have shifted over time and are not something I will quote a hard number for. Treat anything you read claiming precise Mariner pricing or benchmarks with suspicion unless it links to a Google source.

The thing worth holding onto: Mariner is a **consumer-facing research agent**, not a testing or automation product you wire into CI. Even with full access, it is built to do tasks *for a person* in a browser, not to emit a pass/fail verdict for your pipeline or write a committable test file. That distinction matters when you pick an alternative, because half the people searching for Project Mariner alternatives actually want an automation tool, and the other half want a personal assistant. Those are different shopping lists.

## Why "available today" is the real differentiator

Here is the honest framing. The headline feature that makes people want Mariner is not some unique model trick — plenty of agents can drive a browser now. The thing Mariner has that you cannot get is the polished, Google-integrated experience. The thing it does *not* have, for most of us, is availability.

When a tool is gated behind a waitlist or a regional preview, its feature list is irrelevant to your Tuesday. You cannot script against it, you cannot put it in a CI job, you cannot demo it to your team, and you cannot depend on it for anything with a deadline. So when comparing Project Mariner alternatives, I weight three practical axes heavily:

- **Can you get it right now?** No waitlist, no enterprise sales call, no region lock.
- **Can you automate it?** Does it give you something a script or a CI runner can consume — an exit code, structured output, a file you can commit — or is it click-and-watch only?
- **What does it cost to run a flow?** Every-step-to-a-frontier-model agents add up fast. A free local path changes the math entirely.

A flashy agent you cannot run loses to a plainer one you can. Keep that in mind as we go through the options.

## The shortlist at a glance

Here is the at-a-glance version before the deep dives. I have stuck to what is publicly known as of early 2026; where something is not publicly specified, I say so rather than guess.

| Tool | Type | Availability | Open source | Built for CI | Free local model path |
|------|------|--------------|-------------|--------------|------------------------|
| Project Mariner | Consumer research agent (Gemini) | Limited preview / waitlist | No | No | No |
| OpenAI Operator | Consumer agent (in ChatGPT) | Subscription-gated, rolling out | No | No | No |
| browser-use | Open-source Python agent library | Available now (pip) | Yes (MIT) | Partial (you build it) | Yes (any model you wire) |
| Skyvern | Open-source agent + cloud platform | Available now (self-host or cloud) | Yes (AGPL core) | Partial | Yes (self-host) |
| BrowserBash | NL automation CLI | Available now (npm), no waitlist | Yes (Apache-2.0) | Yes (NDJSON + exit codes) | Yes (Ollama-first, local) |

A few of these columns deserve nuance, which is what the rest of the article is for. "Built for CI" especially is not binary — browser-use and Skyvern *can* be put in CI with work, while BrowserBash ships the CI contract as a first-class feature. Let me go tool by tool.

## OpenAI Operator: the closest consumer-side analog

If Mariner is the Google version of "an agent that uses your browser," Operator is the OpenAI version. It launched as a research preview that operates a browser in a cloud environment, takes natural-language tasks, and clicks through sites for you. Conceptually it is the nearest like-for-like alternative to Mariner: a consumer-facing agent, model-backed, designed to do real web tasks for a person.

The catch is the same catch. Operator has been gated behind OpenAI's higher subscription tiers and rolled out gradually by region and plan. Availability and exact terms have changed over the product's life, and I am not going to pin a current price or feature set to it, because that is precisely the kind of thing that goes stale and burns your trust. As of 2026, treat it as "maybe available to you depending on your plan and region," not "guaranteed install."

**Where Operator genuinely wins:** if you want a polished, hosted, do-it-for-me agent and you already pay for the right OpenAI tier, it is a strong, low-effort experience. You are not writing code. You are not managing a browser. For a non-developer who wants an assistant, that is the point.

**Where it does not fit:** it is not an automation primitive. There is no committable test file, no exit code your CI job reads, no NDJSON stream for another program to consume. It runs in OpenAI's environment, not necessarily against your local dev server behind your VPN. If your real goal is "test my checkout flow on every pull request," Operator is the wrong shape, the same way Mariner is. It is an assistant, not a test runner.

## browser-use: the open-source agent loop

Now we get to tools you can actually install today without anyone's permission. [browser-use](https://browserbash.com/learn) is a popular open-source Python library (MIT-licensed) that wires a large language model to a real browser via Playwright. You give it a task in plain English, it reads the page's accessibility tree and DOM, decides on actions, and executes them in a loop until the goal is met or it gives up.

This is a genuinely good project and, for a Python team, often the right answer. It is DOM-aware rather than pixel-first, which sidesteps a whole class of brittleness that coordinate-based agents suffer from. You bring your own model — you can point it at OpenAI, Anthropic, Google, or local models — so you control the cost and the privacy story. And because it is a library, you can embed it inside a larger Python application and call it however you like.

**Where browser-use shines:** you are a Python shop, you want an agent you can compose into your own code, and you are comfortable owning the harness around it. It gives you the engine; you build the product. For research-style automation and bespoke agents, that flexibility is a feature, not a bug.

**The honest trade-off:** "you build the product" is also the cost. Out of the box it is a library, not a CI tool. If you want a stable pass/fail verdict, structured machine-readable output, retry semantics, and a committable test artifact, you assemble that yourself. That is fine if you have the time and want full control. It is friction if you just want to run a flow and get an answer. browser-use is the better choice when you are *building*; it is more than you need when you just want to *run*.

## Skyvern: open-source plus a cloud platform

[Skyvern](https://browserbash.com/learn) takes the agent idea and wraps it in more product. It is open-source (the core is AGPL-licensed) and also offered as a hosted cloud platform. It uses a combination of vision models and DOM understanding to operate websites, and it leans hard into workflow-style automation — think filling out forms across many similar sites, RPA-flavored tasks, and repeatable business processes rather than one-off personal errands.

The architecture is more ambitious than a single agent loop: Skyvern is built to handle whole workflows, with a server you can self-host or a managed cloud option if you do not want to run infrastructure. That makes it a serious candidate when your problem is "automate this same multi-step web process reliably at some scale," especially across sites that look similar but differ in layout.

**Where Skyvern fits:** RPA-style and workflow automation, teams that want a platform rather than a bare library, and anyone who needs to run the same web process across many targets. The self-host option keeps your data in-house, and the cloud option removes the ops burden.

**The honest trade-off:** the AGPL core has licensing implications worth reading carefully if you plan to build a product on top of it — AGPL is a strong copyleft and not everyone wants it in their stack. And like browser-use, turning Skyvern into a clean CI gate for your *own* app's tests is doable but not its center of gravity; it is aimed more at business-process automation than at being a per-PR test runner. Check the current license and hosted-tier terms yourself before committing, because those evolve.

## BrowserBash: install-and-run, no waitlist

Here is the vendor section, so read it with that in mind. [BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. The premise lines up directly with the "available today" problem this whole article is about: there is no waitlist, no preview gate, and no account required to run it. You install it from npm and it works.

```bash
npm install -g browserbash-cli
browserbash run "go to the demo store, add the first product to the cart, complete checkout, and verify the page says Thank you for your order"
```

You write a plain-English objective; an AI agent drives a real Chrome/Chromium browser step by step — no selectors, no page objects — and returns a verdict plus structured results. That is the same "agent uses a browser" idea as Mariner and Operator, but packaged as a CLI you own rather than a hosted consumer product you wait for.

### The model story: local-first, $0 if you want

The part that changes the cost math: BrowserBash is **Ollama-first**. By default it reaches for free local models, so no API keys are required and nothing leaves your machine. It auto-resolves in order — a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — so the same command works whether you want a $0 local run or a capable hosted model. It supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key when a flow is hard enough to want frontier reasoning.

Here is the honest caveat, because it matters: very small local models (roughly 8B and under) can be flaky on long, multi-step objectives. They lose the thread. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you try a tiny model on a ten-step checkout and it wanders, that is expected — size up. With a mid-size local model you can guarantee a $0 model bill while still finishing real flows.

### Built for automation, not just watching

This is where BrowserBash diverges most sharply from Mariner and Operator. Those are click-and-watch consumer agents. BrowserBash is built to be consumed by scripts, CI runners, and AI coding agents.

```bash
# Emit one JSON event per line for CI or an AI coding agent to parse
browserbash run "log in and confirm the dashboard loads" --agent --headless
```

`--agent` mode emits NDJSON — one JSON event per line on stdout — so there is no prose to parse. Exit codes follow a real contract: `0` passed, `1` failed, `2` error, `3` timeout. That is the difference between "an agent that does a thing for me" and "a tool I can put in a GitHub Actions job and trust the exit status." You can read more about that approach on the [BrowserBash blog](https://browserbash.com/blog).

### Committable tests and real recordings

For repeatable flows, BrowserBash supports markdown tests — committable `*_test.md` files where each list item is a step, with `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so credentials do not leak into your CI logs.

```bash
browserbash testmd run ./checkout_test.md --record --upload
```

That run records a screenshot and a full `.webm` session video via ffmpeg on any engine (the builtin engine additionally captures a Playwright trace you can open in the trace viewer), writes a human-readable `Result.md`, and `--upload` pushes the run to the optional free cloud dashboard for replay. A `{{password}}` marked as secret in that test file shows up as `*****` everywhere, not as your real value.

Where does the browser run? By default, locally in your own Chrome. One `--provider` flag switches it: `cdp` for any DevTools endpoint, or `browserbase`, `lambdatest`, and `browserstack` for cloud grids.

```bash
browserbash run "search for a laptop and verify the results load" --provider lambdatest --record
```

The cloud dashboard is strictly opt-in via `browserbash connect` plus `--upload`, with run history, video recordings, and per-run replay; free uploaded runs are kept 15 days. If you would rather keep everything local, `browserbash dashboard` gives you a fully local dashboard with no upload at all.

**Where BrowserBash is the better fit:** you want a web agent you can run *today*, you care about cost (local-first, $0 possible), and your goal is automation you can put in CI or hand to an AI coding agent. **Where it is not:** if you specifically want Mariner's deep Google-ecosystem integration, or a polished consumer assistant for personal errands with zero command line, a hosted consumer agent is a better experience. BrowserBash is a developer and SDET tool. It assumes you are comfortable in a terminal.

## Side-by-side: which problem are you actually solving

The cleanest way to choose is to name your problem first, then match the tool. Most confusion in this space comes from comparing a consumer assistant to a CI test runner as if they were competing for the same job. They are not.

| Your goal | Best fit | Why |
|-----------|----------|-----|
| Personal web errands, no code, polished UX | Operator or Mariner (if you have access) | Hosted consumer agents are built for exactly this |
| Embed a browser agent in a Python app | browser-use | Library-first, model-agnostic, composable |
| Automate the same workflow across many sites at scale | Skyvern | Workflow/RPA focus, self-host or cloud |
| Gate your app's web flows in CI on every PR | BrowserBash | NDJSON, exit codes, committable `*_test.md` |
| Run a web agent today with a $0 model bill | BrowserBash | Ollama-first local models, no API key needed |
| Cross-application desktop control (not just browser) | None of these | You want a computer-use-class agent instead |

Notice that the last row points away from all of these. If you genuinely need to drive native desktop apps, not just a browser, none of the browser-native tools replace a full computer-use agent. Be honest with yourself about which one you need before you start wiring anything.

## A realistic migration path away from a waitlist

Say you have been waiting on Mariner access for a flow you actually need to ship. Here is a pragmatic way to stop waiting without betting the farm on any one tool.

First, write the objective in plain English exactly as you would say it to a person. "Log in with these credentials, go to billing, download the latest invoice, and confirm the total matches." Good agents — Mariner, Operator, browser-use, BrowserBash — all take roughly this shape of instruction, so the prompt you write is portable across tools. You are not locking yourself in by starting somewhere.

Second, run it locally with something free and see how far a mid-size model gets. With BrowserBash that is a one-liner and no key:

```bash
browserbash run "log in, open billing, download the latest invoice, and confirm the total is shown" --record
```

The `--record` flag gives you a video so you can watch where it stumbled, which is far more useful than a wall of logs when an agent goes sideways. If a small local model wanders on a long flow, size up to a 70B-class local model or set `ANTHROPIC_API_KEY` for the hard runs and keep everything else local. You only pay for the steps that genuinely need frontier reasoning.

Third, once a flow works, freeze it into a committable `*_test.md` so it stops being a one-off and starts being a regression check your team can run. That is the step Mariner and Operator structurally cannot give you, and it is the one that turns "cool agent demo" into "thing my CI depends on." If you want the deeper how-to, the [learn hub](https://browserbash.com/learn) and the [case studies](https://browserbash.com/case-study) walk through real flows end to end.

## The honest bottom line

Project Mariner is a strong research preview, and if Google opens it up broadly with a real developer surface, it will be worth another look. Operator is its closest consumer-side analog and a fine experience if your subscription and region line up. But both share the same disqualifier for a lot of readers: you may simply not be able to use them, and neither is built to be a CI-grade automation tool even when you can.

Among the things you can install right now, the choice comes down to what you are building. browser-use is the answer when you want a Python library to compose into your own code. Skyvern is the answer for workflow and RPA-style automation at scale, with a self-host option. BrowserBash is the answer when you want a web agent you can run today with no waitlist, a local-first $0 model path, and a real CI contract — NDJSON, exit codes, and committable tests. Pick by your problem, not by the demo reel.

## FAQ

### Is Google Project Mariner available to use right now?

As of early 2026, Project Mariner has been offered through limited previews and tied to Google's premium AI subscriptions rather than as a generally available developer product. Availability has shifted over time and varies by region and plan, so check Google's own pages for current status. If you need a web agent you can install today without a waitlist, an open option like browser-use or a CLI like BrowserBash is the practical move.

### What is the best free alternative to Project Mariner?

For a free, install-today option, BrowserBash and browser-use are both worth trying. BrowserBash is a free, open-source CLI that defaults to local Ollama models, so you can run real browser flows with a $0 model bill and no API key. browser-use is a free open-source Python library if you would rather embed the agent in your own code and bring your own model.

### Can I use a Project Mariner alternative in CI/CD pipelines?

Yes, but not all of them are built for it. Consumer agents like Mariner and Operator are click-and-watch experiences without exit codes or machine-readable output. BrowserBash is designed for pipelines: its agent mode emits NDJSON and it returns real exit codes (0 passed, 1 failed, 2 error, 3 timeout), so a CI job can gate a pull request on the result.

### Do I need to send my data to the cloud to run a browser agent?

No. With BrowserBash the default is fully local — it runs your own Chrome and uses local Ollama models, so nothing leaves your machine and no account is needed. The cloud dashboard for run history and video replay is strictly opt-in via a connect step and an explicit upload flag, and a fully local dashboard is available if you want run history without any upload at all.

## Get started today

You do not have to wait for an access email to drive a browser with natural language. Install the CLI and run your first flow in a minute:

```bash
npm install -g browserbash-cli
```

An account is optional — you can run everything locally and never sign up. If you do want the free cloud dashboard for video replays and run history, you can [create one here](https://browserbash.com/sign-up) when you are ready. Stop refreshing your waitlist status and run something today.
