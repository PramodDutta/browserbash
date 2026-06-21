---
title: How AI agents use computers and browsers
description: "How AI agents use computers: the action spaces, browser tools, and tradeoffs behind screenshot-pixel vs DOM control, and when each one wins."
date: 2026-04-23
category: agents
---

When AI agents use computers, they are doing something that looked like science fiction a couple of years ago: reading a screen, deciding what to do, and driving the machine without a person at the keyboard. Strip away the demos and the breathless threads, and the whole field comes down to two engineering questions. What can the agent perceive, and what is it allowed to do? That pair, perception plus action, is the action space. Everything else — the model, the prompt, the guardrails — sits on top of it. This article walks through how that loop actually works, the browser tools agents reach for, and where a browser-scoped runner fits versus a general operating-system controller.

I am writing this as someone who ships browser checks that have to survive a Monday CI run, not a Friday demo. So you will get the honest version, where the limits matter more than the magic when you are the one paged at 2 a.m. Along the way you will see where [BrowserBash](https://browserbash.com/features) belongs and, just as usefully, where it does not. BrowserBash automates web browsers. It is not a desktop controller, and treating it like one would only waste your afternoon.

## The agent loop: perceive, decide, act, repeat

Every agent that uses a computer runs the same loop. It receives a representation of the current screen state. It reasons about the goal. It emits an action — click here, type this, scroll down, press Enter, navigate to that URL. A runtime executes that action against a real machine. Then the loop starts over with a fresh view of the new state, again and again, until the goal is reached or the agent runs out of steps and gives up.

That sounds simple, and conceptually it is. The interesting decisions live inside two of those words. **Perceive** is how the agent sees the screen: a flat image of pixels, a structured tree of elements, or some blend of both. **Act** is how the agent affects the world: by synthesizing mouse and keyboard events at guessed coordinates, or by targeting a specific element a runtime already knows about. These are not cosmetic choices. They decide whether a five-field form costs 4 model calls or 20, whether a run costs cents or dollars, and whether a 12-pixel layout shift quietly breaks the whole thing.

The loop also explains why agents feel slower than scripts. A traditional Selenium or Playwright script knows exactly what to click because a human wrote the selector. An agent has to look, think, and decide on every step. That round trip — capture state, send to model, wait for a decision, execute — is the unit of latency and cost. Shrink it and the agent feels fast and cheap. Bloat it and you are watching a spinner while the bill climbs.

## What an action space actually is

"Action space" is borrowed from reinforcement learning, and it just means the set of moves an agent can make. For a chess agent the action space is legal moves. For an agent that uses a computer, it is the catalog of operations the runtime exposes to the model. Designing that catalog well is most of the engineering.

A typical computer-use action space looks roughly like this:

- **Pointer actions** — move the cursor, left click, right click, double click, drag, hover.
- **Keyboard actions** — type a string, press a named key, hold a modifier combo.
- **Viewport actions** — scroll a region, scroll to an element, resize the window.
- **Navigation actions** — open a URL, go back, switch tabs, wait for a condition.
- **Read actions** — take a screenshot, read text, query the DOM, extract a value.

The shape of that catalog is the single biggest factor in how reliable and cheap an agent is. A coordinate-based pointer action ("click at 812, 344") is universal but fragile, because the agent has to compute where the button is from an image, and a small layout change moves the target. An element-based action ("click the element with the accessible name 'Add to cart'") is narrower but sturdier, because the runtime resolves the element and the agent never has to do pixel math at all.

The other axis is risk. Mature action spaces split moves into low-risk and high-risk tiers. Reading, scrolling, and taking a screenshot are safe and run freely. Submitting a payment, deleting a record, sending a message, or overwriting a file are dangerous and should pause for human approval or be blocked entirely. If you are evaluating any agent for real work, ask how it draws that line before you ask how smart the model is. The line is what keeps a confused agent from buying the wrong thing twice.

## Screenshot-pixel control: how vision agents see the screen

The screenshot approach — vision-based or pixel-based control — is what most people picture when they hear "computer use." The agent captures a screenshot, sends that image to a multimodal model, and the model returns an action in screen coordinates. Click at (812, 344). Type "invoice". Scroll the region. The runtime moves the real cursor there and fires the event, grabs a new screenshot, and the cycle repeats.

This is how the major general-purpose agents operate as of 2026. Anthropic's Claude Computer Use, first released in late 2024, hands the model a screenshot plus a mouse-and-keyboard tool and gets structured actions back. OpenAI shipped a Computer Use tool and the Operator agent built on its Computer-Using Agent model, which pairs vision with reinforcement-learned GUI interaction. Google's Gemini Computer Use, which grew out of Project Mariner, is browser-anchored and folds in DOM and accessibility-tree signals where it can rather than reading pure pixels. The exact internals of each system are not all publicly specified, and they change fast, so treat any specific behavior as a snapshot rather than a permanent fact.

The appeal is real. A vision agent can, in principle, drive anything a human can see: a web app, a native desktop tool, a remote-desktop window, a piece of legacy enterprise software from 2009 with no API to speak of. If a person can recognize the button and click it, a good-enough vision model usually can too. That generality is the entire point of OS-level computer use, and for genuine desktop work it is the right tool. There is no DOM behind a native Settings panel; pixels are all you have.

### The tax you pay for pixels

Generality is not free, and the cost shows up in three places.

**Latency.** Every step needs a screenshot, a round trip to a multimodal model, and an executed action. That is hundreds of milliseconds to a couple of seconds per move. A five-step task that a script finishes in a blink can take a vision agent a minute or more. Public reporting in 2026 describes contact-form tasks that take a screenshot agent over a minute completing in about a second under DOM control — a difference you feel on every run and in every CI queue.

**Cost.** Images are expensive tokens. Sending a full screenshot on every step, sometimes at high resolution, adds up quickly across a long task and a large suite. Multiply that by every pull request and the math gets uncomfortable.

**Fragility from ambiguity.** When elements overlap in a screenshot, the model can misjudge which layer is clickable and pick the wrong one. Animations and loading spinners produce mid-state frames that confuse the model. A redesign that moves a button 40 pixels can throw off coordinate math even when the page is functionally identical. Vision agents are improving fast, but pixel reasoning is inherently noisier than reading the structured truth the browser already holds.

None of this makes vision control bad. It makes it a general tool with a general tool's overhead, and the question is whether you are paying for generality you actually need.

## DOM and accessibility-tree control: reading the page, not the pixels

Inside a browser, you do not have to guess from an image. The browser already maintains a precise, structured model of the page — the Document Object Model — plus an accessibility tree that exposes roles, names, states, and hierarchy the way a screen reader sees them. A DOM-based agent reads that structured text instead of a screenshot. The model sees something closer to "button, accessible name 'Add to cart', enabled" than a grid of colored pixels.

That changes the economics. Text is cheaper to process than images, so each step costs less. The model does not compute coordinates, so a layout shift that would break a pixel agent often leaves a DOM agent untouched, because the element it targets is still the same element. And reads are fast — querying the DOM is closer to sub-100-millisecond territory than the multi-second screenshot-and-infer loop. Faster, cheaper, and steadier, as long as the work lives somewhere with a DOM.

That last clause is the whole catch. DOM control only exists where there is a document to read. A web page, yes. A canvas-heavy game, a native desktop app, an OS dialog, a remote-desktop stream — no. Those have no DOM, so a structured agent has nothing to read and falls back to pixels or simply cannot act. This is exactly why the architecture you pick should follow the surface your task lives on, not the other way around.

[BrowserBash](https://browserbash.com/learn) sits firmly on the DOM side. You give it a plain-English objective, and an AI agent drives a real Chrome browser step by step — no selectors to write, no XPath to babysit — resolving elements from the page's structure rather than from screen coordinates. You get a clear pass/fail verdict plus any structured values you asked for. The bet is narrow and deliberate: stay in the browser, read the DOM, and be faster, cheaper, and more deterministic than a pixel agent for browser work. The full mechanics are on the [features page](https://browserbash.com/features).

## Browser tools: the action space agents actually use on the web

Once you commit to the browser, the action space gets sharper than a generic mouse-and-keyboard catalog. Web pages have structure, and good browser tools lean on it. A modern browser-agent toolkit usually exposes moves like these:

- **Navigate** to a URL and wait for the page to settle.
- **Find** an element by its accessible name, role, text, or place in the hierarchy.
- **Click** a resolved element instead of a raw coordinate.
- **Type** into a specific field, with values masked when they are secrets.
- **Select** an option, check a box, or toggle a control.
- **Extract** a value, a table, or a block of text into a structured result.
- **Assert** a condition: the order number is visible, the banner says "Success," the cart total equals the expected figure.

That last one is the difference between automation that does things and automation that verifies things. An agent that clicks Buy is mildly useful. An agent that clicks Buy, then confirms the confirmation page shows the right total and returns that total as data, is something you can wire into a pipeline and trust. BrowserBash leans hard into the verify case: the objective ends in a verdict, and the structured values come back machine-readable so the next step in your workflow can act on them. Worked examples live in the [tutorials](https://browserbash.com/tutorials).

Browser-scoped tools also inherit the browser's plumbing for free. Cookies, sessions, headers, downloads, and multiple tabs are all first-class because you are in a real Chrome, not poking at a picture of one — plumbing a pixel agent has to reconstruct from the outside, one screenshot at a time.

## A concrete look: driving Chrome with BrowserBash

Enough theory. Here is what the browser action space looks like from a terminal. Install the CLI and hand it an objective in plain English — no selectors, no page objects.

```bash
npm install -g browserbash-cli

browserbash run "Go to the demo store, search for 'wireless mouse', \
  open the first result, add it to the cart, and confirm the cart \
  shows exactly 1 item. Return the product title and price."
```

The agent navigates, finds elements by their structure, performs each step, and returns a verdict plus the title and price as structured values. No XPath, no `waitForSelector`, no flaky timing glue.

For CI, switch on agent mode. It emits NDJSON you can parse step by step and uses exit codes — `0` for pass, non-zero for the various failure and error states — so a pipeline can branch on the result without scraping logs.

```bash
browserbash run "Log in with {{USERNAME}} / {{PASSWORD}}, open Billing, \
  and verify the current plan reads 'Pro'." \
  --agent
```

The `{{USERNAME}}` and `{{PASSWORD}}` placeholders pull from your environment, and secret values are masked in the output so credentials never land in a log. When a run misbehaves and you need to see what the agent actually did, record it:

```bash
browserbash run "Complete checkout with the saved test card and confirm \
  the order-success page appears." \
  --record
```

That captures a `.webm` video, a screenshot, and a trace you can replay — the browser equivalent of a flight recorder. You can also save reusable Markdown tests as `*_test.md` files with `{{variables}}` and masked secrets, then run them as a suite. And when you outgrow your laptop, point the same objective at a cloud browser with `--provider` (local, cdp, browserbase, lambdatest, or browserstack) without rewriting a thing.

Two honest notes. First, model choice matters. BrowserBash is Ollama-first and defaults to `auto`, so it tries a local Ollama model before falling back to an Anthropic or OpenAI key. Running fully local means a $0 model bill and nothing leaving your machine. But tiny local models — roughly 8B parameters and under — get flaky on long multi-step objectives. The sweet spot is a Qwen3 or Llama 3.3 70B-class model, or a hosted model when you need the headroom. Second, this is browser-only. If your task wanders out of Chrome and onto the desktop, you are past where BrowserBash can help.

## How the approaches compare

Here is the honest side-by-side. Treat the benchmark numbers as 2026 snapshots from public reporting, not guarantees — they move with every model release.

| Dimension | Screenshot-pixel agents | DOM / accessibility-tree agents | BrowserBash (browser-scoped, DOM) |
|---|---|---|---|
| Perceives via | Screenshots, multimodal vision | Structured DOM + a11y tree | Structured DOM in real Chrome |
| Scope | Whole OS: any app, any window | Browser (where a DOM exists) | Browser only |
| Per-step latency | Hundreds of ms to seconds | Often sub-100 ms reads | Fast, DOM-based |
| Cost driver | Image tokens every step | Cheaper text tokens | Text tokens; $0 model bill with local Ollama |
| Layout-shift fragility | Higher (coordinate math) | Lower (element-targeted) | Lower (element-targeted) |
| Native desktop apps | Yes | No | No |
| CI-friendliness | Workable but slow and pricey | Good | Strong: `--agent` NDJSON, exit codes, `--record` |
| Determinism | Lower (pixel ambiguity) | Higher | Higher (DOM, not pixels) |

On the public benchmarks the split is just as telling. For web-only tasks, vision agents post strong numbers — WebVoyager scores in the mid-to-high 80s and WebArena in the high 50s have been reported in 2026. For full operating-system tasks, the same class of agent has historically sat far lower on OSWorld, with multi-app orchestration ("pull from email, update a sheet, post to Slack") reported in the low double digits. The lesson is not that one architecture is bad. It is that the open OS is genuinely harder than the browser, and browser-shaped work is where these agents are most dependable today. If your task is browser-shaped, you want the tool built for that shape.

## When to choose which: an honest decision guide

No single tool wins everything. Pick by where the work lives.

**Choose a general computer-use model or RPA tool when the task leaves the browser.** Renaming files in a desktop file manager, clicking through a native installer, operating a Windows-only line-of-business app, automating a legacy thick client, or stitching together several native apps in one flow — that is OS-level work, and a vision-based computer-use agent or a traditional RPA platform is the right fit. BrowserBash genuinely cannot do these, and any tool that claims to do all of it through one magic interface deserves a hard squint. For desktop automation, the pixel approach earns its overhead because pixels are all there is.

**Choose a browser-scoped runner like BrowserBash when the task lives in a web browser.** Logging in, searching a catalog, filling and submitting a form, completing a checkout, verifying a dashboard reads the right value, scraping a structured result, or running web smoke checks in CI — this is browser work, and a DOM-based runner is cheaper, faster, and more deterministic than a screenshot agent. You get a real Chrome, element-targeted actions, a clean verdict, and structured values, plus `--agent`, `--record`, and Markdown tests to make it CI-grade. The trade you accept is scope: it stops at the edge of the browser, on purpose.

**Who it is for.** BrowserBash fits SDETs and developers who want plain-English browser checks that run in a pipeline, teams that care about a $0 model bill and keeping data on-prem with local models, and anyone tired of babysitting selectors. It is free and open-source under Apache-2.0, so the cost of finding out is an `npm install`. If you would rather not run a model at all and want a hosted dashboard, there is an [optional cloud](https://browserbash.com/pricing) path, but an account is not required to use the CLI. Browse [real examples](https://browserbash.com/case-study) to see the kinds of objectives it handles, or read more on the [blog](https://browserbash.com/blog).

A useful gut check: if you can describe the task as "open this web page and do X," a DOM-based browser tool is almost always the better answer. If it involves a window that is not a browser, you are in computer-use or RPA territory. Matching the tool to the surface beats chasing the most general option every time.

## FAQ

### How do AI agents use computers?

An AI agent uses a computer by running a loop: it perceives the current screen, reasons about the goal, emits an action like a click or keystroke, and a runtime executes that action against a real machine before the loop repeats. Perception is either a screenshot the model reads as pixels or a structured view such as the DOM and accessibility tree. The model keeps acting step by step until the task is finished or it gives up.

### What is an action space for an AI agent?

An action space is the full set of moves an agent is allowed to make, borrowed from reinforcement-learning terminology. For computer use it is the catalog of operations a runtime exposes: pointer moves, keyboard input, scrolling, navigation, and reads such as screenshots or DOM queries. Well-designed action spaces also separate low-risk moves that run freely from high-risk ones like payments or deletions that pause for approval.

### Is browser automation the same as computer use?

No. Computer use usually means controlling an entire operating system, including native desktop apps that have no underlying document to read, which is why those agents lean on screenshots and pixels. Browser automation is narrower and stays inside a web browser, where a DOM exists, so it can target elements directly and run faster and cheaper. BrowserBash is browser-scoped, so it handles web tasks but not general desktop control.

### When should I use a DOM-based browser agent instead of a screenshot agent?

Use a DOM-based agent whenever the task lives in a web browser, such as logins, forms, checkouts, dashboard checks, or scraping structured data. Reading the DOM is cheaper, faster, and more resistant to layout changes than computing coordinates from a screenshot, and it fits CI pipelines well. Reach for a screenshot-based computer-use agent only when the work involves native desktop apps or windows that have no DOM to read.

Ready to put a browser agent to work? Install the CLI with `npm install -g browserbash-cli`, point it at a plain-English objective, and watch it drive a real Chrome. It is free and open-source, and an account is optional — grab one at https://browserbash.com/sign-up only if you want the hosted dashboard.
