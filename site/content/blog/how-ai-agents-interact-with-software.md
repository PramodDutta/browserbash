---
title: How AI agents interact with software
description: "How AI agents interact with software: the three interfaces — APIs, the DOM, and raw pixels — what each is good at, and how to pick the right one."
date: 2026-05-07
category: agents
---

When people ask how AI agents interact with software, they usually picture one thing: a model moving a mouse and clicking buttons on a screen. That is real, but it is only one of three doors an agent can walk through. An agent can call a documented **API** and talk to a program in its own language. It can read the **DOM**, the structured tree a web browser already keeps in memory, and act on named elements. Or it can look at raw **pixels** in a screenshot and guess where to click. Those three interfaces have wildly different costs, failure modes, and ceilings, and choosing the wrong one is the most expensive mistake teams make when they build agentic systems.

This article is a plain-English map of those three layers, written for engineers and QA folks who have to ship something that survives a Monday CI run, not just wow a room on Friday. I will be honest about where each interface wins and where it falls apart. Along the way you will see where a browser-scoped tool like [BrowserBash](https://browserbash.com/features) fits, and where it does not. BrowserBash automates web browsers through the DOM. It is not a general operating-system controller, and pretending otherwise would only waste your afternoon.

## The agent loop, and why the interface decides everything

Every agent that touches software runs the same loop. It receives some representation of the current state. It reasons about the goal. It emits an action. A runtime executes that action against a real system. Then the loop repeats with a fresh view of the new state, again and again, until the goal is reached or the agent runs out of steps.

That loop sounds simple, and conceptually it is. The interesting engineering hides in two words: what the agent **perceives**, and what it is **allowed to do**. Both of those are determined by the interface you connect it to. An API hands the agent typed, structured data and a fixed menu of operations. The DOM hands it a semantic tree of elements with roles and names. A screenshot hands it a flat grid of colored pixels and nothing else. Same model, same prompt, radically different inputs and outputs.

The reason this matters so much is that the interface sets the floor on cost and reliability before the model writes a single token. A task that an API finishes in one structured call might take a DOM agent four steps and a pixel agent twenty screenshot-analyze-act cycles. Each of those cycles is latency, tokens, and another chance to go wrong. So the right framing for how AI agents interact with software is not "which model is smartest." It is "which interface lets the smart model do the least guessing."

## Interface one: APIs, the agent's native language

An API — application programming interface — is a contract a program publishes for other programs. Send this request, get this response. When an agent interacts with software through an API, there is no screen involved at all. The agent decides it needs to create an invoice, calls `POST /invoices` with a typed payload, and reads a typed result back. No pixels, no clicking, no waiting for a page to paint.

In 2026 this is the path most production agent systems prefer when it exists, and a big reason is the **Model Context Protocol (MCP)**. MCP, introduced by Anthropic in late 2024 and since adopted broadly across the industry, is an open standard that lets a model discover and call external tools and data sources through a uniform interface. People describe it as a "USB-C port for AI" because it standardizes the plug. Under the hood, MCP is still API access: the agent reasons about intent, picks a tool, fills in the parameters, and the tool does the work deterministically.

The advantages of the API layer are hard to overstate:

- **Determinism.** A function either returns the right value or it errors. There is no coordinate to miss, no element to misidentify. The same input gives the same output.
- **Speed and cost.** One structured call can replace a dozen UI steps. Fewer round trips means fewer tokens and lower latency.
- **Robustness to redesigns.** An API is decoupled from how the screen looks. A vendor can repaint the entire front end and a versioned API keeps working.
- **Rich, typed data.** The agent gets clean JSON, not text it has to scrape out of a layout.

So why isn't every agent an API agent? Because the API has to **exist, be documented, and expose the operation you need**. Huge swaths of software do not qualify. Legacy enterprise tools, many internal admin panels, anything behind a login with no public API, and the long tail of consumer web apps simply do not offer a clean programmatic surface for the action you want. There is also a research-backed asymmetry worth naming: a 2025 arXiv paper on API agents versus GUI agents points out that even where APIs exist, they often cover only a slice of what a human can do in the UI, and stitching multiple APIs together to mimic one human workflow can be its own project. APIs are the best interface when they exist and fit. The gap between "exists" and "fits your task" is where the other two interfaces earn their keep.

## Interface two: the DOM, structure the browser already has

Now move to the browser, where most business software actually lives. A web browser does not render a page from pixels up and forget the meaning. It maintains the **Document Object Model**: a live, structured tree of every element on the page, each with a tag, a role, text content, state, and relationships to its neighbors. That tree is sitting in memory whether an agent reads it or not.

A DOM-based agent reads that structure instead of looking at a picture. Rather than guessing that a button lives near pixel (812, 344), it knows there is a `button` element with the accessible name "Submit invoice," and it tells the runtime to act on that element directly. Action is **element-targeted**, not coordinate-targeted. The agent dispatches a click to a known element through the same automation layer that tools like Playwright use under the hood. If the page reflows, the button shifts, or the screen resolution changes, the element is still the element. That binding to identity rather than position is the structural reason DOM control is far more deterministic than pixel control.

The modern refinement is to read the **accessibility tree** rather than the raw DOM. The accessibility tree is the same semantic view a screen reader uses: it keeps interactive and meaningful elements and drops wrapper divs, layout noise, and decorative markup. Stagehand, the open-source framework BrowserBash uses by default, makes this a centerpiece of its design and reports that the accessibility tree typically shrinks the page representation by 80 to 90 percent compared with raw HTML. Less data means fewer tokens, faster model calls, and a cleaner signal for the model to reason over.

This is the lane BrowserBash lives in. You give it a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step, with no selectors written by you. It reasons over the page structure, acts on real elements, and returns a verdict plus structured values you can assert on. Because perception is structured rather than pixel-based, runs are cheaper, faster, and far more repeatable than a screenshot loop, which is exactly what you want in continuous integration.

```bash
npm install -g browserbash-cli

# Plain-English objective against a real Chrome browser, driven via the DOM
browserbash run "Go to the pricing page, choose the annual plan, \
  and confirm the total shown includes a discount"
```

The DOM interface sits between the other two on the spectrum. It is more general than an API, because it works on any web page whether or not that page exposes a programmatic surface. And it is far more reliable and cheaper than pixels, because it reasons over meaning instead of appearance. Its boundary is right there in the name: it is a **browser** technique. It cannot see a native desktop window, a PDF rendered outside the browser, or a `<canvas>` element that paints its own pixels with no underlying DOM nodes. For the web, though, it is usually the sweet spot. The [features overview](https://browserbash.com/features) walks through how the structured-output and verdict model works in practice.

## Interface three: pixels, the universal fallback

The pixel approach — vision-based or screenshot-based control — is what most people picture when they hear "computer use." The agent takes a screenshot, sends that image to a multimodal model, and the model returns an action in screen coordinates. Click at (812, 344). Type "invoice." Scroll the region down. The runtime moves the real cursor to those coordinates and fires the event, then captures a fresh screenshot and the cycle begins again.

This is how the major general-purpose agents operate as of 2026. Anthropic's Claude computer-use capability, first released in late 2024, sends a screenshot and a mouse-and-keyboard tool to a model that returns structured actions. OpenAI shipped a computer-use tool and the Operator agent that work the same way. Google's Gemini computer-use capability, which grew out of the Project Mariner research, is browser-anchored and folds in DOM and accessibility-tree signals where available rather than reading pure pixels. The exact internals of each vendor's system are not all publicly specified, so treat any single benchmark number with care.

The appeal of pixels is real and it is the whole reason this interface exists: **universality**. A vision agent can, in principle, operate anything a human can see. It does not care whether the target is a web app, a native desktop tool, a remote-desktop window, or a piece of legacy software with no API and no clean DOM. If a person can recognize the control and click it, a good-enough vision model can too. For genuine operating-system automation — driving Finder, a native installer, a 2009 ERP client, an app rendered entirely on a canvas — pixels are the only interface that works, and a general computer-use model or an RPA tool is the right call.

### The tax you pay for universality

Generality comes with a bill, and it lands in three places.

First, **calls**. A simple task like filling a five-field form can take 15 to 20 screenshot-analyze-act cycles. Each cycle uploads a fresh, token-heavy image the model has to read from scratch, runs inference, parses the response, and executes one action.

Second, **latency**. When perception is an image and every step is a network round trip to a multimodal model, the wall-clock cost adds up fast. Studies that break down agent task time consistently find that perception and planning dominate, and screenshots make perception expensive.

Third, **accuracy on the hard cases**. Vision models are weakest exactly where pixels are ambiguous: icon-only buttons with no text label, dense layouts, and operations that need pixel-precise dragging. A small layout shift, a different resolution, or an unlabeled icon is enough to send a coordinate guess to the wrong place. Some specialized grounding models report roughly 90 percent accuracy with single-digit-pixel error on benchmarks, which is genuinely impressive and also a reminder that the remaining slice is where your flaky reruns live. For a CI suite that runs hundreds of times a day, that slice compounds.

## APIs vs DOM vs pixels: the side-by-side

Neither extreme is universally right. The three interfaces trade coverage against cost and reliability, and the honest move is to match the interface to the task. Here is how they line up on the dimensions that decide real projects.

| Dimension | API (incl. MCP) | DOM control | Pixel / vision control |
| --- | --- | --- | --- |
| What it perceives | Typed request/response | Semantic element tree | Flat screenshot |
| How it acts | Function call with params | Click/type on a named element | Mouse/keyboard at coordinates |
| Coverage | Only where an API exists and fits | Any web page | Anything a human can see |
| Reliability | Highest (deterministic) | High (bound to identity) | Lowest (bound to position) |
| Cost per task | Lowest | Low | Highest |
| Latency | Lowest | Low to moderate | Highest |
| Breaks when… | API is missing or changes version | Element semantics genuinely change | Layout, resolution, or icons shift |
| Best for | System-to-system data work | Browser workflows and web testing | OS-level and no-API surfaces |

A useful mental model: prefer the **highest-level interface that can actually reach your task**. If a fitting API exists, use it — it is the cheapest and most reliable door. If the work lives on a web page with no usable API, the DOM is your interface, and a tool like BrowserBash makes that path turnkey. Only when the task escapes the browser entirely — a native app, a canvas, a desktop you cannot reach any other way — do you drop to pixels and accept the tax that comes with universality.

## How real agents blend all three

In practice, serious systems rarely pick one interface and stop. They layer them. An agent might call APIs for the data-heavy steps, drive a browser through the DOM for the web UI a vendor never bothered to expose programmatically, and fall back to pixels only for the one legacy window that has no other surface. The skill is routing each step to the cheapest interface that can do it reliably.

Even within the browser, the better tools hedge. The default BrowserBash engine, Stagehand, leans on the accessibility tree for structure but can use screenshots where vision genuinely helps, such as a control that has no useful DOM signal. BrowserBash also ships a second engine, a built-in Anthropic tool-use loop, so you can choose the reasoning style that fits the job. The point is that "DOM versus pixels" inside a browser is not a religious war; it is a per-step optimization, and a good runner makes the cheap path the default and the expensive path the exception.

There is also a model dimension that quietly shapes which interface succeeds. Bigger, sharper models reason over a noisy DOM or an ambiguous screenshot more reliably and recover from surprises better. BrowserBash is Ollama-first and defaults to `auto`, which prefers a local Ollama model, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. Free local models mean a $0 bill and nothing leaving your machine, which is great for privacy and iteration. Be honest with yourself about scale, though: tiny local models in the 8B-and-under range get flaky on long multi-step runs. The sweet spot is a Qwen3- or Llama 3.3 70B-class model, or a hosted model, when the journey gets long.

## Why the interface choice matters most in CI

Everything above gets concrete the moment you put an agent in continuous integration. A demo runs once and a human is watching, so a flaky pixel click that needs a retry is a shrug. A CI suite runs on every pull request, hundreds of times a day, with no one watching, and every flaky step is a failed build, a blocked merge, and a Slack ping. That is exactly where the difference between interfaces stops being academic.

This is the case for keeping browser checks on the DOM whenever you can. Structured perception means the same run gives the same result, which is the whole job of a test. BrowserBash is built for this: an `--agent` mode that emits NDJSON so a pipeline can parse every step, and exit codes (0, 1, 2, 3) so a runner knows pass from fail from error without scraping logs. You can also record a run to a `.webm` video with a screenshot and a trace for the times something does break and you need to see what the agent saw.

```bash
# Machine-readable run for CI: NDJSON events + exit codes
browserbash run "Log in and confirm the dashboard shows a welcome message" \
  --agent

# Capture a recording, screenshot, and trace for debugging a failure
browserbash run "Add the first product to the cart and verify the count is 1" \
  --record
```

For repeatable suites you can write the objective as a Markdown test file. A `*_test.md` file holds the steps, supports `{{variables}}` for things like environments, and masks secrets so credentials never land in logs. You commit it next to your code like any other test.

```bash
# Run a Markdown test file with variables substituted in
browserbash testmd run login_test.md \
  --var base_url=https://staging.example.com
```

If you want to see this pattern applied end to end, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections walk through real flows, and the [case studies](https://browserbash.com/case-study) show how teams wire it into a pipeline.

## When to choose each interface

Here is the decision, stated plainly, with no thumb on the scale.

**Choose an API (or MCP tool) when** a documented programmatic surface exists for the exact operation you need. System-to-system data work, backend orchestration, anything where you can avoid the UI entirely — this is the cheapest, fastest, most reliable interface, full stop. Reach for it first.

**Choose DOM control when** the task lives in a web browser and there is no API that fits, or the workflow is inherently UI-shaped — logging in, walking a multi-step form, verifying that the right thing rendered on the page. This is BrowserBash's lane. You get the generality of "works on any web page" with reliability and cost close to the API path, because perception is structured. For web testing and browser automation in CI, this is usually the right answer.

**Choose pixel-based computer use when** the task escapes the browser. Native desktop apps, canvas-rendered UIs, remote-desktop sessions, legacy software with no API and no useful DOM, or cross-application workflows that hop between programs. Here a general computer-use model or a traditional RPA tool genuinely beats a browser-scoped tool, and it is not close. BrowserBash does not automate the operating system, and you should not try to make it. Use the tool built for OS-level work.

The honest summary: BrowserBash is **browser-scoped**, not general computer use. Inside the browser it tends to win on cost, speed, and determinism precisely because it reasons over the DOM instead of guessing at pixels. Outside the browser it is the wrong tool, and saying so is the only way to give you advice you can trust. Match the interface to where the task actually lives, and most of the reliability problems people blame on "agents" disappear. If you want the full breakdown of capabilities and limits, the [features page](https://browserbash.com/features) lays them out.

## FAQ

### What are the three main ways AI agents interact with software?

The three interfaces are APIs, the DOM, and raw pixels. An API agent calls documented functions and exchanges typed data with no screen involved. A DOM agent reads the browser's structured element tree and acts on named elements. A pixel agent looks at a screenshot and clicks at guessed coordinates. They trade coverage against cost and reliability, so the right choice depends on where your task lives.

### Is DOM-based automation more reliable than pixel-based computer use?

For web tasks, yes, in general. DOM control binds actions to element identity rather than screen position, so a layout shift, a resolution change, or an unlabeled icon does not break it the way it breaks a coordinate guess. It is also cheaper and faster because the model reasons over a compact semantic tree instead of re-reading a full image every step. Pixel-based control is still essential when there is no DOM to read, such as native desktop apps or canvas-rendered interfaces.

### Can BrowserBash control desktop applications outside the browser?

No. BrowserBash is browser-scoped: it drives a real Chrome or Chromium browser through the DOM and returns a verdict plus structured values. For true operating-system automation, like driving native apps, installers, or legacy desktop software, a general computer-use model or a traditional RPA tool is the right fit. BrowserBash wins when the task lives in a browser, where it is cheaper, faster, and more deterministic than a screenshot-based approach.

### Do AI agents always need an API to use software?

No, and that is the whole reason DOM and pixel interfaces exist. Many applications have no public API, or their API covers only a fraction of what a human can do in the user interface. When a fitting API exists, it is the best interface because it is deterministic and cheap. When it does not, an agent can fall back to the DOM for web apps or to pixels for anything else a person can see and click.

Ready to put an agent on your browser flows? Install in one line:

```bash
npm install -g browserbash-cli
```

Then start free at [browserbash.com/sign-up](https://browserbash.com/sign-up) — an account is optional, and local runs cost you nothing.
