---
title: Project Mariner vs OpenAI Operator: Agents in 2026
description: "Project Mariner vs Operator: an honest 2026 look at Google's and OpenAI's hosted browser agents on access, control, and a scriptable open alternative."
date: 2026-03-03
category: comparison
---

If you have been tracking browsing agents, the Project Mariner vs Operator question keeps coming up, and the honest answer in 2026 is messier than the demos suggest. Both are hosted AI agents that drive a web browser for you: you give a goal, the agent clicks and types its way through pages, and it reports back. Google's Project Mariner came out of DeepMind as a research-driven take on agentic browsing; OpenAI's Operator was the consumer-facing agent that ran inside a cloud browser. They rhyme. They also differ in ways that matter a lot once you stop watching the launch video and try to put one into a real workflow. This guide compares them on the two axes that actually decide things — access and control — and then shows where an open, local, scriptable tool fits when neither hosted agent is the right shape for the job.

I write this as someone who builds automation for a living, not as a fan of any one lab. Where a competitor is genuinely the better fit, I will say so. Where the public record is thin, I will say "not publicly specified" rather than invent a number, because a comparison you cannot trust is worse than no comparison.

## The one-paragraph version

Project Mariner and Operator are both **hosted** agents: the browser runs on someone else's infrastructure, behind an account, gated by availability, and the agent's reasoning is a closed model you do not control. That design buys you convenience — you do not manage a browser, a model, or a runtime. It costs you control: you cannot easily wire either into CI, you cannot guarantee where your session data goes, and you are subject to whatever access tier, region, and rate limit the vendor decides this quarter. So the Project Mariner vs Operator decision is rarely "which is smarter." It is "which hosted constraint can you live with," and sometimes the better question is whether a hosted agent is the right tool at all.

## What Project Mariner actually is

Project Mariner is Google DeepMind's experimental agent for browsing the web on your behalf. The framing from Google has consistently been research-first: it was introduced as an early prototype exploring what a capable agentic assistant inside the browser could do, built on Google's Gemini model family. The pitch is that you describe a multi-step task — research a topic across several sites, compile information, fill in a flow — and Mariner navigates, reads, and acts to complete it.

What is publicly clear is the *category*: a Gemini-powered agent that operates a browser, originally surfaced through Google's experimental channels and rolled out to higher subscription tiers over time rather than as a wide free release. What is **not publicly specified** in precise, stable detail is the exact rate limits, the full provider stack underneath, and the long-term productization path, because Google has iterated on all of that. Treat any hard number you see quoted about Mariner's limits as a snapshot that may already be stale.

### Where Mariner tends to shine

Mariner's strength is reasoning over messy, multi-site research tasks. When the job is "go read across these sources and synthesize," a Gemini-class model with a browser is a genuinely strong combination, and Google's long context handling helps when a task spans a lot of page content. If you already live inside Google's ecosystem and have access through your subscription, the friction to *try* it is low. That is a real advantage, and I will not pretend otherwise.

### Where Mariner constrains you

The constraints are the constraints of any hosted agent, plus Google's specific rollout behavior. Access has been tied to subscription tiers and regions; that means availability is a moving target, not a guarantee you can build a process around. The browser runs in Google's environment, so your session — cookies, what you typed, what the agent saw — transits infrastructure you do not own. And there is no first-class story for dropping Mariner into a build pipeline and getting a clean pass/fail exit code. It is an assistant, not a test runner.

## What OpenAI's Operator actually is

Operator was OpenAI's agent that could use a web browser in the cloud to carry out tasks for you — booking things, filling forms, navigating sites — by visually interpreting the page and acting on it. It was built on a computer-using model and ran inside a hosted browser environment that you interacted with through a chat-style interface. The core idea was the same family of capability OpenAI later folded into its broader "agent" offerings: a model that can see a screen and operate it.

The important and honest caveat for 2026: OpenAI has reorganized and renamed pieces of this work over time, folding agentic browsing into its larger agent and "operator"-style capabilities rather than keeping a single static product. So when people say "Operator," they may mean the original standalone preview or the successor capability inside OpenAI's agent stack. The underlying *concept* — a hosted, vision-driven browser agent from OpenAI — is what we are comparing, and the exact current packaging and pricing should be checked against OpenAI's own docs because it has shifted.

### Where Operator-style agents shine

The visual, computer-using approach is good at sites that are hostile to traditional automation — heavy JavaScript, canvas-rendered UIs, anything where there is no clean DOM to target. Because it interprets the screen the way a person does, it can sometimes get through flows that selector-based tools choke on. For one-off consumer tasks ("book this, fill that"), a polished hosted agent with a friendly interface is genuinely pleasant, and that is a legitimate reason to reach for it.

### Where Operator-style agents constrain you

Same hosted ceiling. The browser is in OpenAI's cloud, behind your account, subject to availability and usage limits that are the vendor's to change. You do not choose the model. You do not get to point it at an arbitrary DevTools endpoint or your own grid. And, like Mariner, it is not designed to be a scriptable, exit-code-emitting citizen of a CI pipeline. It is built for a human in a chat loop, not a YAML file in a GitHub Action.

## Project Mariner vs Operator: the comparison table

Here is the honest side-by-side. Where a cell says "not publicly specified," that is deliberate — I would rather leave a gap than fabricate a figure.

| Dimension | Project Mariner (Google) | Operator (OpenAI) | BrowserBash (open alternative) |
| --- | --- | --- | --- |
| Where the browser runs | Google's cloud | OpenAI's cloud | Your machine by default; or any provider you choose |
| Model | Gemini family (closed) | OpenAI computer-using model (closed) | Ollama-first local models; or OpenRouter / Anthropic (your key) |
| Access | Subscription-tier + region gated | Account + usage gated | `npm install -g browserbash-cli`, no account to run |
| Cost model | Bundled into subscription tiers | Vendor usage pricing | $0 model bill possible on local models |
| Source | Closed | Closed | Open source, Apache-2.0 |
| CI / scripting | Not a first-class use case | Not a first-class use case | `--agent` NDJSON + exit codes 0/1/2/3 |
| Data residency | Transits Google infra | Transits OpenAI infra | Nothing leaves your machine on local models |
| Best at | Multi-site research synthesis | Visually hostile, JS-heavy sites | Scriptable, committable web flows in CI |

A few honest notes on that table. The pricing rows for both hosted agents are intentionally vague because both vendors have moved them; do not quote me a dollar figure from this article. The "best at" row reflects design intent, not a benchmark — I am not aware of a neutral, reproducible public benchmark that pits Mariner against Operator on a fixed task set, so treat any "X beats Y by N%" claim you see elsewhere with suspicion unless it shows its methodology.

## The axis nobody puts in the demo: access and control

Strip away the marketing and the real difference between these tools comes down to two questions.

**Access** is: can you actually use it, today, where you are, at the volume you need, without a tier upgrade or a regional block? For both Mariner and Operator the answer is "it depends on your account, your region, and the vendor's current rollout." That is fine for a curious individual. It is a problem for a team that wants to standardize a process, because you cannot build a dependable workflow on a feature that might not be available to your colleague in another country next quarter.

**Control** is: do you decide where the browser runs, which model reasons over your pages, where your session data goes, and how the result comes back? For both hosted agents the answer is largely "no" — those are the vendor's calls. You trade them away for convenience. For many consumer tasks that trade is worth it. For regulated data, for reproducible test runs, for anything you need to put in a pipeline, the loss of control is the whole story.

This is exactly the gap an open, local tool fills. Not because hosted agents are bad — they are genuinely impressive at what they do — but because "smart agent in someone else's cloud" and "scriptable agent I run and own" are different products solving different problems.

## BrowserBash: the open, local, CI-ready alternative

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy, built by Pramod Dutta, that takes the same core idea — describe a goal in plain English, let an AI agent drive a real browser — and inverts the ownership model. Instead of a hosted agent in a vendor cloud, you get a CLI that drives a **real Chrome/Chromium on your own machine**, defaults to **free local models**, and is built from the ground up to be **scripted**.

You install it and run an objective:

```bash
npm install -g browserbash-cli

browserbash run "Log in, add the blue running shoes to the cart, \
  complete checkout, and verify 'Thank you for your order!' appears"
```

No selectors. No page objects. The agent reasons about the page step by step, performs the actions, and returns a verdict plus structured results. That part rhymes with Mariner and Operator. Everything underneath is different.

### Ollama-first: a $0 model bill and nothing leaving your machine

The defining choice is that BrowserBash is **Ollama-first**. Out of the box it resolves a local Ollama model, so there are no API keys and nothing about your session leaves your machine. If you want a hosted brain, it auto-resolves in order — local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — and it supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key.

That is the opposite of the hosted-agent data model. With Mariner or Operator, your session transits the vendor's infrastructure by design. With BrowserBash on local models, it does not — which is a concrete answer to the data-residency row in the table above, not a marketing line.

Here is the honest caveat, and I would rather you hear it from me than discover it at 2am: very small local models (roughly 8B and under) can be flaky on long, multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. Neither Mariner nor Operator makes you think about model size because they pick for you — that convenience is real, and the price of owning the model is that you own the model selection too.

### Built to be scripted, not chatted with

This is where BrowserBash diverges hardest from both hosted agents. Mariner and Operator are designed around a human in a loop. BrowserBash has an **agent mode** built for machines:

```bash
browserbash run "Search for 'wireless headphones', open the first result, \
  and confirm the price is under $200" \
  --agent --headless
```

With `--agent`, it emits NDJSON — one JSON event per line on stdout — and sets a real exit code: `0` passed, `1` failed, `2` error, `3` timeout. No prose to parse, no screen-scraping the agent's chat. That is the difference between something you can drop into a GitHub Action and something you have to babysit. It is also why AI coding agents can call BrowserBash as a tool: they read the events, not the vibes.

### Committable Markdown tests with masked secrets

Because real teams want flows that live in version control and review like code, BrowserBash supports committable `*_test.md` files. Each list item is a step, you can compose files with `@import`, and you template values with `{{variables}}`. Secret-marked variables are masked as `*****` in every log line, and a human-readable `Result.md` is written after each run.

```bash
browserbash testmd run ./checkout_test.md \
  --var storeUrl=https://shop.example.com \
  --secret password=hunter2
```

Neither hosted agent gives you a plain-text, diffable test artifact you own and commit. That is not a knock on them — it is not what they are for — but it is exactly what you want when the "agent run" needs to be a repeatable, reviewable part of your pipeline. You can dig into the format and more patterns on the [BrowserBash learn pages](https://browserbash.com/learn).

### Where the browser runs is your call

BrowserBash defaults to your local Chrome, but the `--provider` flag lets you move execution without rewriting your objective: `local` (default), `cdp` for any DevTools endpoint, and managed clouds like `browserbase`, `lambdatest`, and `browserstack`. So you can develop locally with a $0 bill and run the same objective on a device cloud for cross-browser coverage:

```bash
browserbash run "Open the pricing page and confirm the annual toggle \
  shows a discount" --provider lambdatest --record
```

That is control you simply do not have with a hosted agent: you, not the vendor, decide where the session executes. The engine is also yours to pick — `stagehand` (the default, MIT-licensed, from Browserbase) or `builtin`, an in-repo Anthropic tool-use loop.

### Recording and replay without surrendering your data

With `--record`, BrowserBash captures a screenshot and a full `.webm` session video via ffmpeg on any engine; the `builtin` engine additionally captures a Playwright trace you can open in the trace viewer. For run history and per-run replay, there is an optional, strictly opt-in free cloud dashboard via `browserbash connect` and `--upload` (free uploaded runs are kept 15 days), plus a fully local dashboard with `browserbash dashboard` if you would rather nothing leave the building. You can see the full feature set on the [features page](https://browserbash.com/features).

## When to choose each — an honest decision guide

I will give you the call I would actually make, including the cases where a hosted agent wins.

**Choose Project Mariner when** you have access through your Google subscription, your task is multi-site research and synthesis, you are comfortable with the session running in Google's cloud, and you want an assistant rather than a scriptable runner. For "go read across the web and pull this together for me," a Gemini-class agent is a strong pick, and there is no shame in using it.

**Choose OpenAI's Operator (or its successor agent capability) when** you are automating a one-off consumer task, the target site is visually hostile to traditional automation, you have account access, and a friendly chat-driven loop is what you want. The vision-first approach earns its keep on sites with no clean DOM, and a human-in-the-loop flow is genuinely nice for ad-hoc errands.

**Choose BrowserBash when** you need the run to be scriptable and reproducible, when you want a machine-readable verdict and exit code in CI, when data must not leave your machine, when you want a guaranteed $0 model bill on local models, or when you want a committable test artifact your team reviews like code. It is the open, local, CI-ready shape of this idea. Compare it honestly against managed options on the [pricing page](https://browserbash.com/pricing).

The meta-answer: Project Mariner vs Operator is a choice between two hosted constraints. If neither constraint fits — because you need control, ownership, or a pipeline — that is the signal to reach for an open tool you run yourself, not to keep forcing a hosted agent into a job it was not designed for.

## What none of these tools magically solve

No comparison is complete without the limits, and pretending otherwise is how people get burned.

A hosted agent will not give you a stable, version-controlled contract. Its behavior can change when the vendor updates the model, and you will not get a changelog for the reasoning. If your process depends on the agent behaving identically across months, a closed hosted model is a shaky foundation, and that is true of both Mariner and Operator regardless of how good they are today.

BrowserBash will not turn a tiny 8B local model into a flawless long-horizon planner — I said it above and it bears repeating, because the failure mode is real and the fix is just using a capable model. It also will not give you bit-for-bit deterministic replay of a pixel-precise macro; it reasons about the page rather than replaying a recorded script, so for flows that must be byte-identical every single run you should still keep a coded test alongside it. Knowing each tool's ceiling is how you avoid blaming the tool for a job it never claimed to do. If you want proof points rather than promises, the [case study](https://browserbash.com/case-study) walks through a real flow end to end.

## FAQ

### What is the difference between Project Mariner and Operator?

Both are hosted AI agents that drive a web browser for you, but they come from different labs and run on different closed models — Project Mariner is Google DeepMind's Gemini-powered agent, and Operator is OpenAI's computer-using browser agent. The practical difference is less about raw intelligence and more about access and ecosystem: Mariner has been gated by Google subscription tiers and regions, while Operator runs behind an OpenAI account. Both run the browser in the vendor's cloud, and exact pricing and packaging have shifted, so check each vendor's current docs.

### Is Project Mariner or Operator better for automation in CI?

Neither is designed as a CI citizen. Both are built around a human interacting with a hosted agent in a chat-style loop, not around emitting a clean pass/fail exit code into a build pipeline. If your goal is automated, reproducible runs with machine-readable output, an open CLI like BrowserBash is a better fit because it emits NDJSON in agent mode and sets real exit codes. Use the hosted agents for assistant-style tasks and a scriptable tool for pipelines.

### Can I run a browsing agent locally without sending data to a cloud?

Yes, and that is the main reason teams reach for an open alternative. BrowserBash is Ollama-first, so by default it uses free local models and nothing about your session leaves your machine, with no API keys required. You can optionally point it at OpenRouter or Anthropic with your own key when a task needs a more capable model. Hosted agents like Mariner and Operator, by design, run the browser in the vendor's cloud, so local execution is exactly the gap an open tool fills.

### Is there a free, open-source alternative to Project Mariner and Operator?

Yes. BrowserBash is a free, open-source (Apache-2.0) command-line tool that drives a real Chrome browser from a plain-English objective, defaults to free local models for a possible $0 model bill, and requires no account to run. It adds the things hosted agents do not focus on — agent-mode NDJSON output, CI exit codes, committable Markdown tests, and your choice of where the browser runs. It complements the hosted agents rather than claiming to out-think them; it is the open, scriptable shape of the same idea.

Ready to try the open, local version of this idea? Install it with `npm install -g browserbash-cli` and run your first objective in under a minute — no account required to run locally, and you can [sign up](https://browserbash.com/sign-up) later for the optional free dashboard if you want run history and video replay. The account is optional; the control is the point.
