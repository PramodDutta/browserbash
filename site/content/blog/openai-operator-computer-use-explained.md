---
title: OpenAI Operator and computer use, explained
description: "OpenAI Operator computer use explained: how the CUA agent works, what it became, and when a self-hosted browser CLI is the better fit for web tasks."
date: 2026-01-12
category: agents
---

If you have watched the agent space for the last year, you have seen the phrase **OpenAI Operator computer use** attached to a lot of demos: a model that looks at a screen, moves a cursor, clicks buttons, and books you a restaurant table while you watch. That promise is real, and it is also widely misunderstood. Operator was not a browser extension and not a scripting library. It was a hosted agent that drove a virtual computer by looking at pixels and deciding where to click, the same way a person would. This guide explains what that actually means, what Operator turned into, where the approach genuinely shines, and where a self-hosted browser CLI like BrowserBash is the more sensible tool. I build BrowserBash, so read the comparison sections with that in mind. I have tried to keep the rest grounded in what is publicly documented.

The short version: Operator (and the broader idea of computer-use agents) is a general-purpose primitive for controlling *a whole computer*. That breadth is its strength and its tax. If your task lives entirely inside a web browser — logging in, filling a form, walking a checkout, scraping a dashboard, running the same flow in CI every night — you are usually better served by something browser-scoped, DOM-aware, and deterministic. Let's get into why.

## What OpenAI Operator actually was

OpenAI launched Operator on January 23, 2025 as a research preview, initially limited to ChatGPT Pro subscribers (the Pro tier is publicly priced at $200 per month). The pitch was simple to say and hard to build: give the agent a goal in plain English, and it would carry out multi-step tasks on the web for you — ordering groceries, filling out forms, making reservations — by operating its own browser inside a sandboxed cloud environment.

What made Operator different from a normal script was *how* it acted. It did not parse the page's HTML and target elements by ID or CSS selector. It took a screenshot, reasoned about what was on the screen, and emitted low-level actions: move the mouse to these coordinates, click, type this text, press Enter, scroll, take another screenshot, repeat. This is the defining trait of computer use as a category. The model perceives the interface visually and acts through a virtual mouse and keyboard, exactly as a human perceives and acts. Nothing about the target application has to expose an API or a DOM the agent can read directly.

Operator ran in the cloud, not on your machine. You watched it work in a window inside ChatGPT, you could take over at any point, and it would pause to ask for confirmation before anything sensitive — entering payment details, sending a message, completing a purchase. That human-in-the-loop design was deliberate, and as you will see, it cut both ways.

## The model underneath: Computer-Using Agent (CUA)

Operator was the product. The engine was a model OpenAI called the Computer-Using Agent, or CUA. OpenAI described CUA as combining GPT-4o's vision capabilities with additional reasoning trained through reinforcement learning, specifically on interacting with graphical user interfaces — the buttons, menus, fields, and toolbars that make up software people use every day.

The loop CUA runs is the same loop every computer-use agent runs. It looks at a screenshot. It decides on an action. It executes that action against the virtual machine. It looks again. When it is uncertain or hits something it does not recognize — a CAPTCHA, an unexpected dialog, a login wall — it can stop and hand control back to you. The intelligence is in choosing the next pixel-level action from a raw image of the screen, turn after turn, until the goal is met or the agent gives up.

OpenAI also published benchmark numbers for CUA that are worth knowing because they set honest expectations. On OSWorld, a benchmark for full computer-use tasks, CUA scored roughly 38%. On WebArena, a web-task benchmark, it scored around 58%. On WebVoyager, which covers live web browsing tasks, it reached about 87%. Read those together and a pattern jumps out: the agent is far stronger at *web* tasks than at *general computer* tasks, and even on the web it is not a sure thing on any single run. Those gaps matter a great deal once you try to put one of these agents into something that needs to be reliable, like a paid checkout or a nightly test.

## What Operator became

If you go looking for Operator today, you will not find it as a standalone product. The capability did not disappear; it moved.

On July 17, 2025, OpenAI announced ChatGPT Agent, which combined Operator's computer-use abilities with Deep Research and a broader set of tools inside the main ChatGPT product. On August 31, 2025, the standalone Operator surface was shut down and its capabilities were absorbed into ChatGPT Agent. As of 2026, "Operator" as a separate product no longer exists. The underlying CUA model lives on inside ChatGPT Agent, and OpenAI exposes a computer-use tool to developers through the OpenAI Agents SDK.

So when people say "OpenAI Operator computer use" in 2026, they are usually pointing at one of two things: the consumer experience now folded into ChatGPT Agent, or the developer-facing computer-use tool in the Agents SDK. The mental model is the same either way — a hosted agent that perceives a screen and acts through a virtual mouse and keyboard. The branding changed; the architecture did not.

If you want a deeper look at how this category compares across vendors, our writeups on [Anthropic's computer use and its alternatives](https://browserbash.com/blog) and on [whether Claude can control a web browser](https://browserbash.com/blog) cover the neighboring approaches in the same honest spirit.

## Hosted agent vs self-hosted browser CLI: the real distinction

Here is the comparison this article exists to make, and I am going to be direct about where each side wins.

A hosted computer-use agent like Operator/ChatGPT Agent and a self-hosted browser CLI like BrowserBash are solving overlapping but genuinely different problems. The hosted agent controls a *computer*. BrowserBash controls a *browser*. That one word is the whole story.

When your task involves more than a browser — dragging a file from the desktop into a native app, clicking through an installer, operating a legacy Windows client, copying data between a spreadsheet application and a web form — a computer-use agent is the right category, and BrowserBash does not compete there at all. BrowserBash automates web browsers. It is not OS-level control. If you need true desktop automation, a general computer-use model or a traditional RPA tool is the honest answer, and I would point you there.

But the majority of "agent automates a task for me" demand actually lives inside a browser. Sign-ups, logins, dashboards, SaaS settings pages, checkouts, scraping, form filling, end-to-end web tests. For that slice — and it is a large slice — driving a whole virtual computer by screenshot is doing far more work than the job requires.

| Dimension | Hosted computer-use agent (Operator / ChatGPT Agent) | Self-hosted browser CLI (BrowserBash) |
|---|---|---|
| Scope | Whole computer (any app on screen) | Web browser only |
| How it perceives | Screenshots, pixel coordinates | DOM-aware via the Stagehand engine (or Anthropic tool-use in builtin) |
| Where it runs | OpenAI's cloud VM | Your machine or your CI, a real local Chrome |
| Model | CUA (GPT-4o vision + RL), hosted | Ollama-first, default `auto`; also Anthropic, OpenAI, OpenRouter |
| Local / free option | No | Yes — local Ollama models, $0 API bill, nothing leaves your machine |
| Built for CI | Not its purpose | Yes — `--agent` NDJSON, exit codes 0/1/2/3, committable test files |
| Source | Proprietary, hosted | Open source, Apache-2.0 |
| Best at | Cross-app desktop tasks, novel GUIs | Repeatable, deterministic web flows and tests |

Neither column is "better." They are aimed at different targets. The mistake teams make is reaching for the cloud computer-use agent because it is the famous one, then discovering that their actual task was a browser task all along — and that they are now paying frontier-model rates to send a screenshot every turn for something a DOM-aware tool would have done cheaper, faster, and more predictably.

## Why pixels are expensive and the DOM is cheap

This is the most important technical point in the whole comparison, so it gets its own section.

A computer-use agent reasons about pixels. Every turn, it ships an image of the screen to a vision model, the model figures out where things are, and it returns coordinates. That has three costs that compound on any multi-step web flow:

- **Tokens and money.** Images are not cheap to process, and a real web task is many turns. Screenshot in, reasoning out, repeat — the bill scales with the length of the flow, and there is no free local tier for a hosted frontier model.
- **Latency.** Each turn is a round trip to a large vision model plus the time to render and capture a screen. Strung across a login, a navigation, a form, and a confirmation, that adds up.
- **Brittleness.** Pixel coordinates assume the layout. Shift the viewport, move a button, render an A/B variant, and the model has to visually re-find everything. A small change that a DOM-targeting tool would shrug off can throw a coordinate-based agent.

A browser-scoped tool reads the page structure instead. BrowserBash's default engine, Stagehand (MIT-licensed), is DOM-aware: it resolves your plain-English instruction against the actual elements on the page rather than guessing where they are in a bitmap. You still describe the goal in natural language — no selectors to write — but the resolution happens against structure, not pixels. The result is automation that is generally cheaper, faster, and far more stable across the layout churn that real web apps go through every sprint.

To be fair to the other side: pixel-based perception is exactly why computer use generalizes to *any* application. A DOM only exists in a browser. If you leave the browser, the DOM advantage evaporates and you are back to needing a vision agent. That is the trade. Inside the browser, structure beats pixels. Outside it, pixels are all you have.

## Determinism, verdicts, and CI: the part hosted agents skip

There is a second gap that has nothing to do with pixels versus DOM, and it bites hardest when you try to put an agent into a pipeline.

A hosted agent is built to *do a task for a person who is watching*. It pauses for confirmation, it narrates, it expects a human to nudge it past CAPTCHAs and ambiguous moments. That is great for a consumer running an errand. It is awkward for an unattended nightly job that needs to either pass or fail and tell your CI which one happened.

Reviews of Operator and ChatGPT Agent through 2026 repeatedly land on the same friction: the agent stops and asks for permission so often that fully unattended runs are hard, and reliability on commerce flows — CAPTCHAs, complex JavaScript checkouts — was one of the reasons the standalone product was wound down. None of that is a knock on the technology. It is just a different design center. A "do my errand while I watch" agent is not the same thing as a "fail the build at 3am when checkout breaks" tool.

BrowserBash is built for the second job. You can run it as an agent that emits machine-readable output and a clean exit code, so a pipeline can branch on the result without a human in the loop:

```bash
# Run an objective as an agent: NDJSON events on stdout, verdict via exit code
browserbash run "log in with the test account, open Billing, confirm the plan shows Pro" \
  --agent
# exit 0 = pass, 1 = objective failed, 2 = usage/config error, 3 = runtime error
```

Those exit codes (0/1/2/3) are the contract a CI system actually wants. Pair that with a recording when you need an artifact to look at after a failure:

```bash
# Capture a .webm video, a screenshot, and a trace for debugging a CI failure
browserbash run "search for 'wireless mouse', add the first result to the cart, go to checkout" \
  --record
```

And when the flow is something your QA team should own and review like code, you write it as a Markdown test with variables and masked secrets, then run it:

```bash
# A committable *_test.md flow with {{variables}}; secrets are masked in output
browserbash testmd run login_test.md \
  --var username={{TEST_USER}} \
  --var password={{TEST_PASS}}
```

That is the operational gap in one breath: a hosted computer-use agent hands you a result on a screen for a human to read; a browser CLI hands you an exit code, an NDJSON stream, a video, and a file you can put in version control. For automation that has to run on its own, the second set is what you build pipelines on. There is more on the CI patterns in our [tutorials](https://browserbash.com/tutorials) and the full flag set on the [features page](https://browserbash.com/features).

## Cost and privacy: where running it yourself changes the math

The hosted model is convenient and it is metered. You send screenshots to a cloud, the cloud runs a frontier model, you pay per use, and your task data — including whatever is on the screen — travels to that cloud. For plenty of work that is a perfectly fine trade. For some work it is a non-starter.

BrowserBash is Ollama-first. Its default model setting is `auto`, which prefers a local Ollama model, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY` if you have them set. Run a capable local model and your API bill for the agent's reasoning is $0, and nothing about the page or the task leaves your machine. That is a meaningfully different posture for regulated environments, internal tools behind a VPN, or anyone who simply does not want their screens flowing to a third-party cloud by default.

I have to be honest about the catch, because it is real: tiny local models (roughly 8B parameters and under) get flaky on long, multi-step flows. They lose the thread. The sweet spot for reliable local runs is a Qwen3 or Llama 3.3 70B-class model, or you point BrowserBash at a hosted model (Anthropic, OpenAI, or OpenRouter) when you want maximum reliability and do not mind the bill. The point is that *you* choose the trade per task, instead of every run going to one vendor's cloud at one vendor's price. Our [pricing page](https://browserbash.com/pricing) lays out the local-versus-cloud picture, and BrowserBash itself is free and open source under Apache-2.0.

## A worked example: the same task, two ways

Picture a nightly check: log in to your staging app, open the billing page, and confirm a Pro user sees the Pro plan.

A hosted computer-use agent would spin up a cloud VM, open a browser, screenshot the login page, find the fields by sight, type, screenshot again, navigate, screenshot the billing page, and read the plan name off the pixels. It would likely pause to confirm before doing anything it judged sensitive. You would watch it, or you would build scaffolding to feed it confirmations, and you would pay per screenshot-heavy turn. If staging shifted its layout, the visual targeting might wobble. At the end you would have a result on a screen, not an exit code your pipeline can branch on.

BrowserBash, given the same plain-English objective, drives your real local Chrome, resolves each step against the DOM through Stagehand, and finishes with a verdict and a clean exit code your CI can act on immediately. Run it with `--agent` and you get NDJSON events plus that exit code. Run it with `--record` and you get a video and trace to inspect when something breaks. Point it at a local model and the reasoning costs nothing and stays on your machine. No human has to sit and approve steps for a routine internal flow.

That is the whole argument in one scenario. For a browser-bound, repeatable, CI-shaped task, the browser-scoped tool is cheaper, faster, more deterministic, and built for the unattended case. For a task that wanders out of the browser into the desktop, the computer-use agent is the one that can actually do it, and BrowserBash cannot.

## When to choose which

Let me make this concrete so you can decide quickly.

**Choose a hosted computer-use agent (Operator's successor, ChatGPT Agent, or the Agents SDK computer-use tool) when:**

- The task spans the whole desktop, not just a browser — native apps, file dialogs, installers, legacy clients.
- You are operating a novel or proprietary GUI that exposes no DOM and no API.
- A human is in the loop to watch, confirm, and unstick the agent, and per-use cloud pricing is fine.
- You value breadth and zero local setup over determinism and cost control.

**Choose a self-hosted browser CLI like BrowserBash when:**

- The task lives entirely inside a web browser — auth, forms, dashboards, checkout, scraping, end-to-end web tests.
- You need it to run unattended in CI with a pass/fail verdict, exit codes, and machine-readable output.
- You want DOM-based determinism over screenshot-pixel guessing, and stability across layout changes.
- Cost or privacy matters — you want a free local-model path and data that stays on your machine.
- You want a flow you can commit to version control and review like code.

The honest framing is not "BrowserBash beats Operator." It is "use the browser tool for browser jobs and the computer-use agent for computer jobs." Most of the agent automation people actually need is browser-shaped, which is why a focused, DOM-aware, CI-friendly CLI wins more often than the headlines suggest — and why, when a task genuinely needs the desktop, you should reach for a computer-use agent without apology. You can see real workflows in our [case studies](https://browserbash.com/case-study), or start from the [npm package](https://www.npmjs.com/package/browserbash-cli) if you would rather just install it and try.

## FAQ

### Is OpenAI Operator still available in 2026?

Not as a standalone product. Operator launched as a research preview in January 2025, and on August 31, 2025 its capabilities were folded into ChatGPT Agent. The underlying Computer-Using Agent (CUA) model still exists inside ChatGPT Agent and is exposed to developers through the OpenAI Agents SDK's computer-use tool, so the capability lives on under different branding.

### What is the difference between Operator and computer use?

Computer use is the general category — an AI model that perceives a screen and controls it through a virtual mouse and keyboard. Operator was OpenAI's specific consumer product built on that idea, powered by its CUA model. So "computer use" is the technique, and Operator was one branded implementation of it, now absorbed into ChatGPT Agent.

### Can OpenAI Operator replace browser automation tools like Playwright or BrowserBash?

For browser tasks, usually not the best fit. Operator-style agents reason about pixels and run in a hosted cloud with a human-in-the-loop design, which makes them strong for novel or cross-application desktop work but awkward for unattended, repeatable web automation. A browser-scoped tool that reads the DOM and emits CI verdicts tends to be cheaper, faster, and more deterministic for web flows specifically.

### Does BrowserBash do computer use or OS-level automation?

No. BrowserBash is browser-scoped — it automates web browsers, not the operating system. It cannot click around your desktop, drive native apps, or operate non-browser software. For true OS-level automation you want a general computer-use model or an RPA tool; BrowserBash is the right call when the entire task lives inside a browser.

Operator showed the world what a computer-use agent can do, and the category is genuinely useful when a task spans your whole machine. But most web automation is browser-shaped, and for that you want something browser-scoped, DOM-aware, and built to run unattended. Install BrowserBash with `npm install -g browserbash-cli` and try a plain-English objective against your own site. A free [account](https://browserbash.com/sign-up) is optional — the CLI runs locally on its own.
