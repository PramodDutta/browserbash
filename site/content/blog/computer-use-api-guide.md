---
title: A practical guide to the computer-use API
description: "A practical, honest guide to the computer use API: how the screenshot-action loop works, what it costs, and when a browser-only alternative wins."
date: 2026-01-22
category: guide
---

If you have spent any time near AI agents in the last year, you have heard the pitch: hand a model your screen and it will do the work a person would do with a mouse and keyboard. That capability ships today as the computer use API, and the two best-known versions come from Anthropic (the `computer-use` beta on Claude) and OpenAI (the `computer-use-preview` model behind the Responses API). Both let a model look at a screenshot, decide on an action, and drive a real interface. This guide explains how the computer use API actually works under the hood, what it costs you in latency and tokens, where it is genuinely the right tool, and where a browser-only approach beats it for the everyday case of "the task lives in a web app." I will be specific about the trade-offs, because the marketing rarely is.

## What the computer use API is, in plain terms

A computer use API is a model plus a tool definition that turns a visual perception problem into a sequence of UI actions. You give the model a goal in natural language and a screenshot of the current state. The model reasons about what it sees and returns a structured action — click at these coordinates, type this text, scroll down, press this key. Your code executes that action against a real environment, takes a fresh screenshot, and sends it back. The model looks at the new state and decides the next move. That loop continues until the task is done or the model asks for help.

The important thing to internalize is that the model does not "have" your computer. It cannot click anything on its own. It emits *intentions*, and you — through a harness you write or adopt — translate those intentions into real input events and feed the consequences back. The model is the brain; your harness is the hands. This is true for both major providers, and it shapes everything about cost, reliability, and security that follows.

That harness-in-the-middle design is the single most important thing to understand before you build on this, so it is worth saying twice in different words: nothing the model decides happens until your code makes it happen.

Anthropic exposes this through a beta header (the current path uses `computer-use-2025-11-24`) and a `computer` tool that the supported Claude 4.x models know how to call, alongside companion `text_editor` and `bash` tools for file and shell work. OpenAI exposes a dedicated `computer-use-preview` model and a `computer_use_preview` tool that is only usable in the Responses API, where you declare a display size and an `environment` of `browser`, `mac`, `windows`, or `ubuntu`. Different surface, same core idea.

## How the screenshot-action loop actually works

Let's walk one iteration end to end, because the mechanics explain the costs.

1. **Capture state.** Your harness takes a screenshot of the target — a browser tab, a virtual desktop, an app window — and sends it to the model along with the running conversation and the task.
2. **Model reasons and acts.** The model parses the pixels, locates the relevant UI element, and returns an action with coordinates (for example, "left_click at 512, 318") or a typing/scroll/keypress instruction. Newer Claude actions even include a `zoom` so the model can request a full-resolution look at a region of the screen before committing to a click.
3. **Harness executes.** Your code maps those coordinates onto the live display and performs the real input event — usually via a browser automation library like Playwright for the `browser` environment, or OS-level input for a desktop.
4. **Capture the result.** Take a new screenshot reflecting what changed, send it back.
5. **Repeat** until the model emits a final answer or stops to ask for confirmation.

Two consequences fall directly out of this design. First, every single action carries a screenshot round-trip plus a full reasoning pass, so each step typically takes a few seconds. A multi-step task — say fifty actions — runs for minutes, not milliseconds. Second, the model is working from *approximate pixel coordinates* on an image. It can misjudge a small button, miss a hover-only control, or click the wrong row in a dense table. The providers have improved this a lot, but it is a fundamentally different reliability profile than code that targets an element by its accessibility role or DOM node.

This is not a knock — it is the price of generality. The whole point of this approach is that it works on interfaces you never integrated with, including legacy apps and canvases with no API at all. You pay for that reach with latency and a non-zero misclick rate.

## What it costs: tokens, latency, and screenshots

There is no separate "computer use" meter to read. You pay standard model token rates, and screenshots are images, which means they consume image tokens on every turn. Because the loop sends a fresh screenshot each step, image tokens accumulate across a long task and often dominate the bill on visually busy pages.

A few honest notes on pricing as of 2026. Anthropic's computer use bills at the normal Claude token rates for whichever model you choose, and OpenAI's `computer-use-preview` bills at that model's published rates; both vendors adjust pricing over time, so treat any specific per-million-token figure you read in a blog as a snapshot, not a contract, and confirm against the provider's own pricing page before you budget. Latency is more stable as a shape: independent write-ups consistently describe roughly two-to-five seconds per action because of the screenshot-plus-reasoning round trip, which puts a fifty-step job in the low single-digit minutes. On capability, the OSWorld benchmark is the usual reference for open-ended desktop tasks, and 2026 numbers for the frontier computer use models sit in the seventy-percent-plus range — impressive, and also a clear signal that roughly one in four hard tasks still fails unattended. Plan for retries and human review accordingly.

Both providers are explicit that this is beta technology. OpenAI states plainly that `computer-use-preview` should not be used for production applications, and Anthropic ships the feature behind a beta header with prominent safety guidance. Build with that maturity level in mind.

## The honest part: browser-scoped versus general computer use

Here is where I need to be straight with you, because it is the whole reason this guide exists on a tool vendor's blog.

[BrowserBash](https://browserbash.com/features) is a natural-language browser automation CLI. It is **browser-scoped**: it automates web browsers, and only web browsers. It is not a general computer use tool. It cannot open your native mail client, drag a file across the macOS Finder, fill a desktop accounting app, or operate a Citrix session. If your task lives outside the browser — true OS-level control, cross-application desktop workflows, legacy thick-client software — then a general computer use API (Claude's `computer` tool or OpenAI's `computer-use-preview`) or a traditional RPA platform is the correct choice, full stop. I am not going to pretend otherwise.

But a very large share of the work people *reach for* computer use to do never leaves a browser tab: logging into a SaaS dashboard, completing a checkout, filling a multi-step web form, verifying that a deployed web page renders the right values, scraping a table behind a login. For those tasks, the general-purpose screenshot loop is using a sledgehammer where a precise tool fits better — and that is exactly the gap BrowserBash is built for.

The mechanism is the difference. A computer use API reasons over *pixels*. BrowserBash drives a real Chrome through the *DOM and accessibility tree* — the structured representation the page actually exposes. It still uses an AI agent to plan and adapt from a plain-English objective, so you keep the "no selectors, just describe the goal" ergonomics. What you gain by staying in the browser is that the agent acts on structured elements instead of guessing coordinates on an image, which is cheaper (no per-step screenshot tax on every action), faster, more deterministic, and far friendlier to run in CI. You give up the ability to leave the browser. For browser work, that is a trade worth making.

## A side-by-side comparison

The table below lines up the three approaches honestly. Treat the provider rows as "as of 2026" and verify current specifics on each vendor's docs.

| Dimension | General computer use API (Claude `computer` / OpenAI `computer-use-preview`) | RPA platform (UiPath, Automation Anywhere) | BrowserBash (browser-scoped) |
| --- | --- | --- | --- |
| Scope | Whole OS: desktop apps, browser, virtual machines | Whole OS plus enterprise connectors | Web browser only |
| How it targets the UI | Pixel coordinates from screenshots | Recorded selectors / image / object IDs | DOM + accessibility tree via a real Chrome |
| Adapts to UI change | Yes — reasons from a goal | Brittle; a moved button can break the bot | Yes — agent re-plans from the objective |
| Per-action latency | Seconds (screenshot + reasoning loop) | Milliseconds once built | Fast; DOM actions, not per-step screenshots |
| Determinism | Lower (pixel guesses) | High by design | Higher than pixel loops (structured elements) |
| CI-friendliness | Heavy; needs a VM/desktop harness | Built for scheduled bots, less for dev CI | Strong: CLI, exit codes, NDJSON, Node + Chrome |
| Cost driver | Tokens + image tokens every step | Licenses + dev/maintenance time | Model tokens only; free local models = $0 |
| Setup | API + your own harness (often Playwright) | Studio, orchestrator, licensing | `npm install -g browserbash-cli` |
| Maturity statement | Beta; OpenAI says not for production | Mature, enterprise | v1.3.1, open-source (Apache-2.0) |
| Best at | OS-level and cross-app tasks no one integrated | High-volume, stable legacy back-office flows | Browser objectives: login, checkout, forms, verify, extract |

The pattern is consistent. The computer use API wins on *reach*. RPA wins on *high-volume stability on legacy systems*. BrowserBash wins when the task is *in a browser* and you want it cheap, fast, deterministic, and easy to wire into a pipeline.

## What a browser-only objective looks like in practice

Concretely, here is the same kind of work the computer use loop would do screenshot-by-screenshot, expressed as a single plain-English objective. No coordinates, no selectors, no harness to maintain.

```bash
browserbash run "Go to the demo store, add the first product to the cart, start checkout, and confirm the cart subtotal is shown"
```

BrowserBash brings its own agent loop. That one command navigates, decides what to click, types where it needs to, handles the page re-rendering under it, and returns a pass/fail verdict plus any structured values it pulled out along the way. Under the hood the default engine is Stagehand (MIT-licensed); there is also a `builtin` engine that runs an Anthropic tool-use loop if you prefer that path. You drive a real local Chrome through the default `local` provider, and you can swap in `cdp`, `browserbase`, `lambdatest`, or `browserstack` when you need remote browsers.

For CI you switch into agent mode, which streams NDJSON and returns meaningful exit codes (`0/1/2/3`) so a pipeline can branch on the result:

```bash
browserbash run "Log in at app.example.com with {{USER}} / {{PASSWORD}}, then confirm the dashboard greeting shows the user's name" --agent --record
```

That `--record` flag captures a `.webm` video, a screenshot, and a trace of the run, which is the kind of artifact you want when a flow fails in CI and you need to see what the agent saw. The `{{USER}}` and `{{PASSWORD}}` placeholders come from BrowserBash's Markdown test format — files named `*_test.md` that hold an objective with `{{variables}}` and masked secrets, so credentials never get hard-coded:

```bash
browserbash testmd run login_test.md
```

These are the real commands and flags; there is nothing here you cannot run today after `npm install -g browserbash-cli`. The [tutorials](https://browserbash.com/tutorials) and the [learn](https://browserbash.com/learn) pages walk through more of them end to end.

## Models, cost, and keeping data on your machine

One more axis matters when you compare against the hosted computer use APIs: where the inference runs and what it costs you.

The general computer use APIs are, by definition, hosted — your screenshots go to Anthropic or OpenAI, and you pay per token for every step of the loop. For a lot of teams that is fine. For some — regulated data, air-gapped environments, or simply "I do not want my internal dashboards leaving the building" — it is a non-starter.

BrowserBash is Ollama-first. The default model selection is `auto`, which prefers a local Ollama model, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY` if those are set. Run a capable local model through Ollama and your bill is $0 and nothing leaves your machine. You can also point it at OpenRouter or Anthropic when you want a hosted model's horsepower. That is a different cost and privacy story than a screenshot loop that bills image tokens on every turn and necessarily ships every frame to a provider.

I owe you one honest caveat here, because it is the same kind of caveat the computer use APIs deserve. Tiny local models — roughly 8B parameters and under — get flaky on long, multi-step objectives. They will happily nail a three-step login and then lose the thread on a twelve-step checkout. The sweet spot for reliable local runs is a Qwen3 or Llama 3.3 70B-class model, or just use a hosted model for the gnarly flows. Right-size the model to the task and you avoid most of the frustration people blame on "AI flakiness."

## How to decide: a clear-eyed picker

Skip the hype and answer one question first: **does the task ever leave the browser?**

**Choose a general computer use API when:**

- The work touches native desktop apps, the file system, system settings, or multiple applications stitched together.
- You are operating software with no API and no web UI — a thick client, a remote desktop, a kiosk.
- You genuinely need the model to see and manipulate arbitrary pixels, and you can afford the latency, the per-step token cost, and a VM-based harness with the right guardrails.
- You accept beta maturity (OpenAI explicitly says `computer-use-preview` is not for production) and you build retries and human review around it.

**Choose an RPA platform when:**

- You have high-volume, repetitive back-office workflows on stable, legacy systems.
- Determinism and auditability beat adaptability, and you have the budget and team to build and maintain bots.
- The systems involved are exactly the kind RPA vendors have spent twenty years connecting to.

**Choose BrowserBash when:**

- The task lives in a web browser: logging in, filling forms, checkout, navigating a SaaS app, verifying a deployed page renders the right values, extracting data from behind a login.
- You want the natural-language ergonomics of "just describe the goal" without paying the screenshot-loop tax.
- You need it to run in CI with exit codes and machine-readable output, and you care about cost (free local models) and keeping data on your machine.
- You want open-source (Apache-2.0) tooling you install in one command, not a platform with licensing and an orchestrator.

Many teams end up using more than one. A general computer use API for the rare desktop automation, RPA for the legacy high-volume stuff, and BrowserBash for the 80% of agent-driven work that is, when you actually look at it, a browser task wearing a "computer use" costume. There is more on real-world usage in the [BrowserBash case study](https://browserbash.com/case-study) and the [blog](https://browserbash.com/blog).

## A note on safety, because the loop changes the threat model

The computer use API moves prompt injection from a theoretical worry to an operational one. When a model is reading screenshots and clicking based on what it sees, a malicious instruction rendered *on a page* — hidden text, a fake dialog, a planted button — can try to redirect the agent. Anthropic runs classifiers on computer use prompts to flag potential injections and will steer the model to ask for confirmation when it spots something suspicious in a screenshot, and the standard hardening advice is to run general computer use in a dedicated VM or container with least privilege and restricted network access. Take that advice seriously; an agent that can click anything on a real desktop is exactly as dangerous as that sounds if it is pointed at a hostile page with access to sensitive accounts.

A browser-scoped tool narrows the blast radius simply by being unable to leave the browser. It still needs care — any agent that follows instructions can be misled by injected page content, so you still mask secrets, scope what it can reach, and review runs — but the worst case is "it did something wrong in a browser tab," not "it touched the file system or another app." Smaller surface, smaller risk. That containment is part of why staying in the browser, when the task allows it, is a reasonable default.

## Wrapping up

The computer use API is a real and genuinely useful capability: a model that perceives a screen and drives it through a screenshot-action loop, available today in beta from Anthropic and OpenAI. It earns its place on OS-level and cross-application tasks that nothing else can reach. It also carries real costs — per-step latency, image tokens on every turn, pixel-level misclicks, and a sharpened prompt-injection threat model — that make it overkill when the job is simply "do this thing in a web app."

For that very common case, a browser-scoped agent that reasons over the DOM instead of pixels gives you the same plain-English ergonomics with better speed, lower cost, more determinism, and easy CI integration. Be honest about which problem you have, pick the tool that fits, and do not pay the general-purpose tax for a browser-shaped task.

## FAQ

### What is the computer use API and how does it work?

The computer use API is a model plus a tool that lets an AI perceive a screen from screenshots and drive it with actions like clicks, typing, and scrolling. It runs in a loop: the model sees a screenshot, returns an action, your code executes it against a real browser or desktop, and a fresh screenshot goes back so the model can decide the next step. The model never controls anything directly; it emits intentions that your harness turns into real input events.

### How much does the computer use API cost?

There is no separate computer use charge; you pay standard model token rates, and because every step sends a screenshot, image tokens add up across a task and often dominate the bill on busy pages. Anthropic bills at normal Claude rates and OpenAI bills at the `computer-use-preview` model's published rates, both of which change over time, so confirm current numbers on the provider's pricing page. Latency is the other cost: expect roughly a few seconds per action, so a fifty-step job runs for minutes.

### Is BrowserBash a computer use tool?

No, and that distinction matters. BrowserBash is browser-scoped: it automates web browsers only and cannot control native desktop apps, the file system, or other software. For true OS-level or cross-application automation you want a general computer use API or an RPA platform; BrowserBash is the better fit specifically when the task lives in a browser, where it is cheaper, faster, and more deterministic because it acts on the DOM rather than guessing pixel coordinates.

### When should I use a browser-only agent instead of a general computer use API?

Use a browser-only agent when the task never leaves a web browser, such as logging in, filling forms, completing checkout, verifying a deployed page, or extracting data behind a login. The general computer use API wins when you must touch desktop apps or stitch multiple applications together, but for browser work it adds latency, per-step token cost, and pixel-level misclicks you do not need. If you can keep the work in the browser, a DOM-based agent is usually the faster, cheaper, more reliable choice.

Ready to try the browser-scoped path? Install it in one command — `npm install -g browserbash-cli` — and run your first plain-English objective in minutes. An account is optional and free if you want the cloud dashboard: [sign up here](https://browserbash.com/sign-up).
