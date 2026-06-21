---
title: What computer use really costs (and its limits)
description: "A senior SDET breakdown of computer use cost: token math, latency reality, hard limits, and the free local browser path that often does the job."
date: 2026-02-05
category: guide
---

If you have priced out an agent that drives a screen, the first number that surprises you is rarely the per-token rate. It is the turn count. Computer use cost is dominated by a loop: the model takes a screenshot, reasons about pixels, emits one action, and waits for the next screenshot. Multiply that by a twelve-step web flow and you are paying a frontier model to look at an image again and again, on every click, for a task whose page already exposes a clean DOM underneath. This guide breaks down where the money and the milliseconds actually go, where computer use earns its keep, and where a browser-scoped tool running a free local model does the same job for $0 of API spend.

I work on [BrowserBash](https://browserbash.com/features), so I will be upfront about the bias and equally upfront about the boundary. BrowserBash automates *browsers*, not your whole operating system. For genuine desktop and OS-level control, computer-use models and RPA suites are the right tool and I will say so plainly. The argument here is narrower and, I think, more useful. A large share of what people reach for computer use to do lives inside a web page, and for that slice the economics are very different.

## What "computer use" means and why it bills the way it does

Computer use is a model capability, not a finished product. Anthropic exposes it through the Claude API as a set of tools — a `computer` tool plus optional `bash` and `text_editor` tools — and ships a reference agent loop, usually inside a Docker container with a virtual display. The loop is simple to describe: capture a screenshot, send the image and your instruction to the model, receive an action such as `click(x, y)`, `type("...")`, `key("Return")`, or another `screenshot`, execute it, and repeat until the task finishes or you stop it.

That architecture is vision-first and coordinate-based. The model reasons about what it sees on screen, not about the structure of the application. The upside is generality: the exact same loop can drive a spreadsheet, a native installer, a legacy desktop client, or a browser. The downside, for your invoice, is that generality gets paid for one screenshot at a time.

Three cost drivers fall straight out of that design, and they compound:

- **Every turn ships an image.** Screenshots are not free tokens. They are charged under vision pricing by pixel count, and a multi-step task takes many turns.
- **Pixel reasoning is verbose.** The model often narrates what it sees before it acts, which inflates output tokens on every step.
- **Latency stacks per turn.** Each round trip includes image upload, model inference, and action execution. Ten turns means ten of those serialized.

None of this is a knock on the capability. It is a description of what you are buying. The mistake teams make is assuming the headline per-million-token rate is the cost. The real cost is that rate multiplied by image-heavy turns multiplied by the steps in your task.

## The token math behind computer use cost

Let us put real numbers to it, using Anthropic's published pricing as of early 2026. Treat these as illustrative arithmetic, not a benchmark, since your token counts depend entirely on the task.

Start with the fixed overhead. Per Anthropic's documentation, the computer use beta adds **466 to 499 tokens to the system prompt**, and the computer tool definition itself costs **735 input tokens** on Claude 4.x models. If you also enable the bash tool (245 tokens) or the text editor tool (700 tokens), add those. That overhead is small per call but it rides along on every turn of the loop, paid at input rates.

Now the part that dominates: screenshots. Images are tokenized by pixel count under [Anthropic's vision pricing](https://platform.claude.com/docs/en/build-with-claude/vision). A roughly 1000×1000 screenshot lands near **1,300 input tokens**; a larger viewport costs proportionally more. And newer Opus models changed how high-resolution images are handled and use a tokenizer that can consume **up to 35% more tokens** for the same text, so per-turn image cost has drifted up, not down, on the frontier models.

Put it together for a single illustrative turn on Claude Opus 4.8 (input $5 / MTok, output $25 / MTok as published):

| Component | Tokens (illustrative) | Where it bills |
|-----------|----------------------|----------------|
| Computer use system prompt overhead | ~480 | input |
| Computer tool definition | 735 | input |
| Prior conversation + instruction | ~1,500 | input |
| Screenshot image | ~1,300 | input |
| Model reasoning + action | ~350 | output |

That is roughly 4,000 input tokens and 350 output tokens **per turn**. At Opus 4.8 rates that is about $0.020 input plus $0.009 output, near **$0.03 per turn** before context growth. A modest 10-turn web flow therefore lands on the order of $0.25 to $0.40 once conversation history accumulates on each step. Run that flow on every pull request across a handful of suites and the monthly number stops being a rounding error.

Two levers cut this meaningfully and you should use both:

- **Prompt caching.** A cache hit reads at **0.1× the input price**, so the stable parts of your prompt (system prompt, tool definitions, instructions) can be reused at a 90% discount once cached. For a loop that resends the same scaffolding every turn, this is the single biggest win.
- **The Batch API.** For non-interactive, queue-it-and-wait workloads, Anthropic's Batch API gives a **50% discount** on input and output. It does not help latency, but it halves the bill for offline jobs.

Switching to a smaller model is the other obvious lever. Claude Haiku 4.5 is published at $1 / MTok input and $5 / MTok output, a 5× reduction versus Opus on input. But cheaper models on a long, fiddly, coordinate-based task tend to need more turns and more retries, which can quietly erase the per-token saving. Cheaper-per-token is not the same as cheaper-per-task. Measure the task, not the token.

## The latency reality nobody puts on the pricing page

Cost is the number teams plan for. Latency is the one that bites in CI. The computer use loop is inherently serial: turn N+1 cannot start until turn N's screenshot comes back, the model finishes inference, and the action executes. There is no publicly specified per-turn latency figure, and it would be misleading to invent one, because it depends on model, image size, network, and how much the model reasons. But the structure is unavoidable. A 15-step flow is 15 sequential model round trips, each carrying an image.

That has three practical consequences:

1. **Wall-clock time scales with steps, not complexity.** A simple-but-long flow (many clicks, little thinking) can be slower than a short-but-hard one, because each click is a full round trip.
2. **Image upload is on the critical path.** Bigger viewports mean bigger screenshots mean more upload and more tokenization on every single turn.
3. **It fights your CI budget.** A pipeline that needs results in under two minutes does not love an agent that wants fifteen serial model calls per check.

Anthropic does offer a **Fast Mode** for latency-sensitive Opus work, published at $10 / MTok input and $50 / MTok output for Opus 4.8, which buys speed at a premium price. That is a real option when you genuinely need OS-level control fast, but notice the direction of the trade: you are paying *more* per token to claw back time the architecture spends on images. If the task is a browser task, there is a cheaper way to get the time back, which is to stop sending images at all.

## Where computer use is genuinely the right tool

I want to be fair here, because the honest version of this article is the persuasive one. There are tasks where computer use is not just acceptable but clearly correct, and no browser-scoped tool (BrowserBash included) replaces it:

- **Native desktop applications.** Installers, IDEs, accounting software, a legacy enterprise client with no web front end. If it only exists as a window on a desktop, you need something that sees the desktop.
- **Cross-application workflows.** Copy a value out of a PDF viewer, paste it into a native form, then trigger a desktop app. That spans the OS, not a single DOM.
- **Canvas and pixel-only surfaces.** A `<canvas>` game, a remote-desktop stream, an image-based UI with no accessible structure. Vision is the only signal available, so vision is the right approach.
- **Generality over efficiency.** A research spike where you do not know what app you will hit next and want one agent that can drive anything. Breadth is the feature; you pay for it on purpose.

For all of these, the screenshot loop is the point. The cost is the price of operating where no clean structure exists. RPA platforms (UiPath, Automation Anywhere, and similar) occupy an overlapping space for enterprise desktop and document workflows, typically with negotiated rather than published licensing, so I will not quote figures I cannot verify. The category boundary is what matters: desktop and cross-app belong to computer use and RPA; the browser is a different problem.

## Where the browser path wins on cost and speed

Here is the asymmetry the pricing page does not advertise. A huge fraction of what people want a screen-driving agent to do is actually a *web* task — log in, fill a form, walk a checkout, scrape a dashboard, verify a flow after a deploy. And web pages are not opaque pixels. They expose a DOM: structured, readable, queryable. When a tool reads the DOM instead of screenshotting the screen, three things change at once.

- **No image tokens per turn.** This is the big one. The single largest line item in computer use cost, the screenshot on every step, drops to zero when the agent works from page structure instead of pixels.
- **Fewer, smarter turns.** DOM context lets the model see many elements at once rather than discovering them one screenshot at a time, so flows resolve in fewer round trips.
- **Determinism you can put in CI.** DOM-targeted actions survive layout shifts and viewport changes that break pixel coordinates, which means fewer flaky reruns, and reruns are pure wasted spend.

This is the lane BrowserBash is built for. It is a free, open-source (Apache-2.0) command-line tool: you give it a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors to maintain, and you get back a verdict plus structured values. It is deliberately browser-scoped and does not control your OS, and that constraint is exactly what makes it cheaper, faster, and more deterministic for the web slice. For the deeper architectural argument, [DOM-based versus pixel-based browser automation](https://browserbash.com/blog) is worth a read.

The economics get more interesting because of the model story. BrowserBash is **Ollama-first**. The default `auto` provider chain tries a local Ollama model first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. Point it at a capable local model and your API bill is **$0**: nothing leaves your machine, no per-turn token meter runs at all. You still pay in electricity and hardware, but the marginal cost of a run goes to zero, which changes how freely you can run checks in development and CI.

```bash
# Install once
npm install -g browserbash-cli

# Plain-English objective against a real local Chrome.
# With a local Ollama model in the auto chain, this run costs $0 in API spend.
browserbash run "Go to the staging site, log in as the demo user, and confirm the dashboard shows a welcome banner"
```

A fair caveat, because the honest version is the useful one: tiny local models (roughly 8B parameters and under) get flaky on long multi-step flows. The sweet spot is a Qwen3 or Llama 3.3 70B-class model locally, or a hosted model when you need the extra reliability. If you only have a small local model, keep objectives short and split long journeys into separate runs. That is the real tradeoff, not a footnote.

## A cost comparison you can reason about

Here is the side-by-side. I am comparing approaches, not quoting competitor invoices I cannot verify, so where a number is not public I say so.

| Dimension | Computer use (vision loop) | DOM browser agent, hosted model | DOM browser agent, local model (BrowserBash + Ollama) |
|-----------|---------------------------|--------------------------------|------------------------------------------------------|
| Per-turn image tokens | Yes — screenshot every turn | No | No |
| Dominant cost driver | Image-heavy turns × steps | Text tokens × steps | Hardware + electricity (no API meter) |
| Marginal API cost per run | Real, scales with steps | Lower than vision loop | $0 |
| Latency shape | Serial round trips, image on critical path | Serial round trips, no image | Serial round trips, local inference |
| Determinism on layout change | Brittle (pixel coordinates) | Resilient (DOM) | Resilient (DOM) |
| Scope | Whole OS / any app | Browser only | Browser only |
| Best fit | Desktop, cross-app, canvas | Web tasks needing top reliability | Web tasks, cost-sensitive, privacy-sensitive |

Read the rows, not just the totals. The vision loop's cost is structural. It is the screenshots, and you cannot prompt-engineer your way out of paying for images when images are how the model perceives the page. The browser-scoped rows trade away OS reach to delete that line item. Whether that trade is good depends entirely on whether your task lives in a browser.

## When to choose which: an honest decision guide

Pick the tool by where the task actually lives, not by which one sounds most capable.

**Choose computer use or an RPA platform when:**

- The work touches native desktop apps, the file system through a GUI, or multiple applications in one flow.
- The target surface is pixel-only: a canvas, a remote stream, an image with no accessible structure.
- You value one agent that can drive anything over minimizing the bill, and you are doing exploration rather than repeatable production runs.
- You are in an enterprise that already standardized on an RPA suite with support contracts and governance; staying in that ecosystem has real non-technical value.

**Choose a browser-scoped tool like BrowserBash when:**

- The task is a web task — login, forms, checkout, dashboard verification, scraping, post-deploy smoke checks.
- You want it in CI with a clear pass/fail contract and as few flaky reruns as possible.
- You are cost- or privacy-sensitive and the **$0 local-model path** matters, or you simply do not want screenshots of your app leaving your network.
- You want a committable artifact your team can review, not a bespoke agent harness you maintain forever.

The split is clean once you stop treating "computer use" and "browser automation" as the same product. They overlap in demos and diverge hard in production cost. If you are migrating existing web flows off a vision loop specifically to cut spend, the [migration guide from computer use to a browser CLI](https://browserbash.com/learn) walks the path.

## Putting the browser path into CI without re-architecting

The cost argument only pays off if the cheaper tool is also easy to run. BrowserBash is built to run by people and by other agents. Tests are plain Markdown files (`*_test.md`) with `{{variables}}` and masked secrets, so a checkout flow reads like documentation and lives in version control next to the code it checks. There is no page-object layer and no selector file to rot.

```bash
# Run a committed Markdown test with variables injected at runtime.
browserbash testmd run checkout_test.md \
  --var baseUrl=https://staging.example.com \
  --var coupon=LAUNCH20
```

For pipelines, agent mode emits NDJSON and returns meaningful exit codes (0 success, plus distinct non-zero codes for failure classes), which lets a build step fail the build instead of parsing console text. Add a recording when you need evidence of what happened.

```bash
# Machine-readable output for CI, with a .webm recording, screenshot, and trace.
browserbash run "Verify the pricing page loads and the monthly toggle switches to annual" \
  --agent \
  --record
```

That is the whole point of the browser-scoped trade. You give up OS reach you probably were not using for this task, and in return you get a check that costs little or nothing per run, survives layout shifts, produces a reviewable artifact, and slots into CI with a real exit code. The [tutorials](https://browserbash.com/tutorials) cover login flows, scraping, and CI wiring, and the [features overview](https://browserbash.com/features) lists the providers (local, CDP, Browserbase, LambdaTest, BrowserStack) and engines if you need to scale beyond your laptop. BrowserBash stays free and open source with no per-run charge. See the [pricing page](https://browserbash.com/pricing) for what the optional cloud dashboard does and does not cost.

## A quick gut-check before you commit budget

Before you wire a screen-driving agent into anything recurring, ask three questions and let the answers route you.

First, does the task ever leave the browser? If yes, you likely need computer use or RPA, and the screenshot cost is the price of admission. If no, you are paying for generality you will not use.

Second, how many steps is the flow, really? Count the clicks and form fields, multiply by your per-turn estimate, then multiply by your run frequency. If that number makes you wince, the image-free path is not a nice-to-have, it is the budget.

Third, can the run happen on hardware you already own? If a 70B-class local model on your machine can handle the objective, the marginal API cost of every future run is zero, and that reshapes what you are willing to test continuously. The cheapest computer use cost is the screenshot you never send because the page told you what you needed to know.

## FAQ

### How much does computer use cost per task?

There is no single per-task price because the cost is driven by turn count, not a flat fee. Each turn sends a screenshot (roughly 1,300+ input tokens for a 1000×1000 image) plus tool overhead and reasoning, so a 10-step web flow on a frontier model commonly lands in the range of a few cents to around forty cents once conversation history accumulates. Prompt caching (a 90% discount on cached input) and the Batch API (50% off offline jobs) are the main levers to bring it down.

### Why is computer use slower than DOM-based browser automation?

Computer use runs a serial loop where each step is a full model round trip carrying an image: screenshot, infer, act, repeat. Wall-clock time therefore scales with the number of steps, and image upload sits on the critical path of every turn. DOM-based tools skip the per-turn screenshot and can perceive many page elements at once, so equivalent web flows usually finish in fewer, lighter round trips.

### Can I do browser automation for free instead of paying for computer use?

For browser tasks, yes. BrowserBash is free and open source and is Ollama-first, so pointing it at a capable local model (Qwen3 or Llama 3.3 70B-class works well) means your API bill is zero and nothing leaves your machine. You still need the hardware and electricity, and tiny local models under about 8B parameters get unreliable on long flows, so the practical sweet spot is a mid-to-large local model or a hosted model when you need maximum reliability.

### When should I use computer use instead of BrowserBash?

Use computer use or an RPA platform when the task touches native desktop apps, spans multiple applications, or targets pixel-only surfaces like a canvas or a remote-desktop stream — anything that lives outside a single web page. BrowserBash is deliberately browser-scoped, so it wins on cost, speed, and determinism for web tasks but does not control your operating system. Match the tool to where the work actually happens: the OS for computer use and RPA, the browser for BrowserBash.

Computer use cost is real and structural, but most of it is the price of generality you may not need. If your task lives in a browser, you can usually delete the most expensive part of the bill by never sending a screenshot in the first place.

```bash
npm install -g browserbash-cli
```

Try it on a real flow today, free and local. An account is optional and only adds the hosted dashboard, so start at [browserbash.com/sign-up](https://browserbash.com/sign-up).
