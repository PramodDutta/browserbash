---
title: What is a computer-using agent (CUA)?
description: "A computer using agent (CUA) is an AI that operates a screen like a person. Here is how CUAs work, browser vs OS scope, and where each one fits."
date: 2026-01-15
category: agents
---

A computer using agent (CUA) is an AI system that operates a computer the way a person does: it looks at the screen, decides what to do, then moves the mouse, clicks, and types to get there. You hand it a goal in plain language — "find the cheapest flight to Lisbon next month and start the booking" — and it works through the interface step by step instead of calling a documented API. That is the whole idea, and it is a genuine shift from the chatbot model most people met first. A chatbot produces text. A computer-using agent takes actions on software you actually use.

The term got its specific meaning in early 2025 when OpenAI shipped Operator, powered by a model it literally named Computer-Using Agent. Around the same window Anthropic released Computer Use for Claude, Google had Project Mariner running, and Amazon later shipped Nova Act. The category is young, the names overlap confusingly, and the marketing tends to flatten an important distinction: some of these agents drive a whole operating system, and some only drive a browser. That distinction decides cost, speed, reliability, and whether the thing belongs anywhere near your CI pipeline. This article defines what a CUA is, walks through how the loop actually works, separates browser scope from OS scope honestly, and shows where a focused browser tool like BrowserBash fits and — just as important — where it does not.

## What a computer-using agent actually is

Strip away the branding and a CUA is a loop. It observes the current state of the screen, reasons about what to do next, emits a single low-level action, your harness executes that action, and the agent observes again. Repeat until the goal is met or you cut it off. The canonical version is what OpenAI describes as "pixel-in, action-out": the model receives a screenshot, thinks, and replies with something like `click(x, y)`, `type("[email protected]")`, `scroll(down)`, or `keypress("Enter")`. Nothing about that loop assumes a website, a documented API, or a stable selector. It assumes a screen and a pointer, which is exactly what makes the approach so general.

That generality is the headline feature. Because the agent works through the graphical interface the same way you do, it can in principle operate any application that renders to a screen — a SaaS dashboard with no public API, a legacy desktop tool, a settings panel. No integration contracts to sign, no endpoints to reverse-engineer. OpenAI's framing is that the web and most software are already optimized for human consumption, so navigating them as a human does generalizes better than special-casing every site.

It helps to put the CUA on a spectrum with the things it replaces:

- **Scripted automation** (Selenium, Playwright, classic RPA): you write every step and every target by hand. Maximum control, maximum maintenance, zero improvisation. The script does exactly what you said and breaks the moment the UI moves.
- **API integration**: fast, deterministic, and cheap — but only exists where a vendor published an interface. Most of the software people touch daily has no usable API for the task you care about.
- **Computer-using agent**: you state intent, the model improvises the steps at runtime. Maximum flexibility, real cost and latency, and a reliability profile you have to design around rather than assume.

None of these is strictly better. They sit at different points on a control-versus-flexibility curve, and the right pick depends on whether the task is stable, whether an API exists, and how much you can tolerate non-determinism.

## How the perceive–decide–act loop works under the hood

The mechanics matter because they explain every strength and every weakness a CUA has. Here is the cycle in more detail.

First, **perception**. The harness captures a screenshot of the current screen — sometimes the full desktop, sometimes a single browser viewport — and sends that image to a vision-capable model along with the user's instruction and a running history of what has happened so far. Some agents also send a textual representation of the interface (an accessibility tree, or the page's DOM) alongside the pixels; others rely on the image alone. That choice — pixels only, or pixels plus structure — is one of the biggest design forks in the whole field, and we will come back to it.

Second, **reasoning and action selection**. The model produces an intermediate chain of thought and then commits to one atomic action expressed in screen terms: click at these coordinates, type this string, scroll this direction, press this key. Crucially, in the pure pixel formulation the model is computing where to click in raw pixel space. That is harder than it sounds.

Third, **execution**. Your harness translates the action into a real OS or browser event and performs it. Then the loop returns to perception with a fresh screenshot of the new state.

Two practical realities fall straight out of this design. One, it is **slow** relative to a human or a script, because every single step is a full model round-trip with an image attached, and a multi-step task can mean dozens of them. Two, it can be **imprecise**: the model might identify the correct button conceptually but emit coordinates that land a few pixels off — on the menu item next to the one you wanted, or on a toolbar instead of an input field. DPI scaling makes this worse. On a Retina-style display rendering at 2x, coordinates that are right for the screenshot's dimensions can be wrong for the physical screen unless your harness remaps them carefully. These are everyday failure modes of the screenshot-driven approach, not exotic edge cases, and serious implementations spend real effort taming them.

On cost: a screenshot is not as token-heavy as people fear — vendors note a ~20-action session on a roughly 1568x900 display lands near 30K tokens of image context, not hundreds of thousands, especially if you downscale before sending. But it is still per-step image inference, and it adds up across long runs and large fleets. The loop is elegant. It is not free.

## Browser scope vs OS scope: the distinction that actually matters

Here is the line that the word "CUA" tends to blur, and the one that should drive most of your decisions. Some computer-using agents control the **whole operating system**. Others control only a **browser**.

An OS-scoped agent can do anything a person at the keyboard can do: switch between native apps, open Finder or Explorer, edit a spreadsheet in a desktop client, drag a file from the download folder into a chat window, click through a system settings panel. Anthropic's Computer Use is the clearest example of this shape — it is typically run against a virtual desktop (a Docker container with a virtual display) and it can drive native applications and websites alike. The trade-off is that you own the security perimeter, the data-access boundaries, and the compliance story, because the agent can touch everything on that machine.

A browser-scoped agent confines itself to web pages. OpenAI's Operator, in its launch form, ran inside a remote browser on OpenAI's servers and carried out web tasks — booking tickets, filling an online order — but did not roam your desktop. The scope is narrower on purpose, and the narrowness buys you things: a smaller attack surface, a more predictable environment, and the option to read the page's structure instead of guessing from pixels.

Why does this fork matter so much in practice?

- **Most business automation lives in a browser.** Internal tools, CRMs, billing portals, admin dashboards — the long tail of "software with no good API" is overwhelmingly web software. If your task lives on a web page, OS-level reach is capability you pay for and never use.
- **Browser scope unlocks the DOM.** A browser-confined agent can read the Document Object Model — the structured tree of elements behind the page — instead of, or alongside, the pixels. It can target a button by its role and accessible name rather than by `click(x, y)`, which sidesteps the coordinate and DPI problems entirely. That is a large reliability win.
- **OS scope is irreplaceable when the task genuinely leaves the browser.** Reconciling a number between a desktop accounting app and a web portal, organizing files, operating a thick-client tool with no web version — that is OS-agent territory, full stop. A browser tool simply cannot reach those pixels.

So the honest framing is not "browser agents beat OS agents." They solve different problems, and most people reach for the broadest tool out of reflex when a narrower one would be cheaper, faster, and more reliable for the job in front of them.

## Pixel-driven vs DOM-driven: two ways an agent "sees"

The browser-vs-OS scope question is tightly coupled to a second one: how the agent perceives the interface. There are two camps.

**Pixel-driven (vision-first).** The agent sees a screenshot and reasons over the image. This is the only option for an OS-scoped agent, because there is no universal structured representation of an arbitrary desktop. Its strength is universality — if it renders, the agent can see it, including canvas elements, images of text, and apps that expose no semantic structure. Its weaknesses are the ones from the loop section: coordinate imprecision, DPI sensitivity, and the cost and latency of per-step image inference. Some recent research argues vision-first agents generalize better across unfamiliar sites precisely because they do not depend on each site's particular markup, and that is a fair point worth holding alongside the reliability concerns.

**DOM-driven (structure-first).** A browser agent can ask the browser for the page's element tree and act on semantic targets — "the Submit button," "the email field" — letting the browser resolve where those actually are on screen. This is deterministic in a way pixels are not: the same element resolves the same way regardless of monitor, zoom level, or DPI. It is also generally cheaper, because you are sending structured text the model can reason over rather than a large image every step. The catch is that it lives or dies on the page having meaningful structure; content baked into a canvas or an image is invisible to it, and the best browser tools fall back to vision for exactly those cases.

| Dimension | Pixel-driven (vision-first) | DOM-driven (structure-first) |
|---|---|---|
| Scope it suits | Whole OS or browser | Browser only |
| How it targets | Coordinates from a screenshot | Element role / accessible name |
| Determinism | Lower; coordinates can drift | Higher; same element resolves the same way |
| Sensitive to DPI / zoom | Yes | No |
| Per-step cost | Image inference every step | Often cheaper structured context |
| Blind spots | Cost, latency, pixel misses | Canvas / image-only content |
| Cross-site generalization | Often strong | Depends on markup quality |

Neither column is the winner everywhere. The point is to match the perception model to the task. For browser work where the page has real structure — which is most browser work — DOM targeting is the more dependable foundation, and that is the bet BrowserBash makes.

## Where BrowserBash fits — and where it honestly does not

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You give it a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors to write — then returns a verdict plus any structured values you asked for. It is built around the DOM-driven, browser-scoped end of everything above. By default it uses the [Stagehand](https://browserbash.com/learn) engine and reads page structure rather than betting the run on pixel coordinates.

Let me be plain about the boundary, because it is the whole point of this article. **BrowserBash is browser-scoped. It is not a general computer-use agent and does not try to be.** If your task lives on the desktop — moving files around, driving a native app, anything outside a web page — a general OS-level computer-use model or a traditional RPA tool is the correct choice, and you should reach for one. BrowserBash cannot click pixels your browser does not render, and pretending otherwise would waste your time.

Where BrowserBash earns its place is the opposite, and very common, case: the task lives in a browser. There it tends to beat a general computer-use agent on the things you care about in production:

- **Cheaper.** DOM-based steps lean on structured context, not a full screenshot decoded by a frontier vision model on every action.
- **Faster.** Resolving an element by role beats a perceive-screenshot-reason-click cycle per step.
- **More deterministic.** The same element resolves the same way run to run — no coordinate drift, no DPI surprises.
- **CI-friendly.** It is a CLI with explicit exit codes, NDJSON output, and Markdown test files, so it slots into a pipeline instead of needing a babysitter.

A first run is one line:

```bash
npm install -g browserbash-cli
browserbash run "Go to the pricing page, confirm the Pro plan lists a yearly price, and return that price"
```

For a pipeline you want machine-readable output and a real exit code, which is where `--agent` comes in — it emits NDJSON and exits `0/1/2/3` so a build step can branch on the result:

```bash
browserbash run "Log in with {{EMAIL}} and {{PASSWORD}}, open Billing, confirm the plan shows Active" --agent
```

Repeatable checks live in Markdown `*_test.md` files with `{{variables}}` and masked secrets, and you can capture evidence with `--record` (a `.webm` video, a screenshot, and a trace):

```bash
browserbash testmd run smoke/checkout_test.md --record
```

Those flags are the actual tool surface — `run`, `--agent`, `testmd run`, `--record`, `--provider`, `{{variables}}`. The [tutorials](https://browserbash.com/tutorials) cover them end to end.

## The model story: local-first, and why that matters for a CUA

A CUA is only as practical as the model behind it and the bill that model generates. BrowserBash is Ollama-first. Its default model setting is `auto`, which prefers a local Ollama install, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. Run it against a local model and the bill is $0 and nothing leaves your machine — which for a tool that drives logged-in sessions and reads page contents is a meaningful privacy property, not just a cost one. OpenRouter and Anthropic are also supported when you want a hosted model.

Here is the honest caveat, the same one that applies to every CUA regardless of vendor: small local models struggle on long, multi-step autonomy. In practice, very small models (roughly 8B parameters and under) get flaky once a task has many dependent steps. The sweet spot for reliable local runs is a Qwen3 or Llama 3.3 70B-class model, or a hosted model when you need maximum dependability. This is not a BrowserBash-specific weakness; reasoning over a long action sequence without losing the plot is exactly where the entire category gets hard. Size the model to the task and you avoid most of the pain.

For provider flexibility, the `--provider` flag chooses where the browser actually runs — `local`, `cdp`, `browserbase`, `lambdatest`, or `browserstack`:

```bash
browserbash run "Open the dashboard and confirm the latest invoice is marked Paid" --provider browserstack
```

That lets the same plain-English objective run on your laptop during development and on a cloud grid in CI without rewriting anything.

## When to choose a CUA, an RPA tool, or a focused browser agent

Decision time. The category is broad, so match the tool to the shape of the work rather than to the loudest demo.

**Choose a general, OS-scoped computer-use agent (Anthropic Computer Use, Operator-style tools) when:**

- the task spans native applications, the file system, or system settings — anything that genuinely leaves the browser;
- you are doing open-ended exploration where you cannot predict which apps the agent will need;
- you can absorb the cost, latency, and non-determinism of per-step vision inference, and you can stand up the security perimeter a screen-controlling agent requires.

**Choose traditional RPA (UiPath, Automation Anywhere, Power Automate, and similar) when:**

- the process is high-volume, stable, regulated, and repeats the same way every time;
- you need audit trails, governance, and the kind of vendor support an enterprise compliance team signs off on;
- determinism and throughput matter far more than the flexibility to handle a UI you have never seen. RPA is mature, structured automation; a CUA is improvisation. Different tools for different temperaments of work.

**Choose a focused browser agent like BrowserBash when:**

- the task lives in a web browser — which covers most internal tools, dashboards, portals, and web apps;
- you want it to run in CI with exit codes and machine-readable output, not as an interactive assistant a human watches;
- cost, speed, and run-to-run determinism matter, so DOM targeting beats per-step screenshots;
- you want a local-first option for a $0 bill and data that never leaves your machine.

The mistake to avoid is reflexively reaching for the most general tool. OS-level reach is real capability, but you pay for it in money, latency, reliability, and security surface on every run. If the job is a browser job — and an enormous share of business automation is — a browser-scoped agent is the cheaper, faster, more dependable fit. See the [case studies](https://browserbash.com/case-study) and the [pricing](https://browserbash.com/pricing) for how that plays out in real workflows; the [blog](https://browserbash.com/blog) goes deeper on the comparisons.

## A short field guide to the CUA landscape (as of 2026)

A quick, honest map so the names stop blurring together. Exact model details, prices, and availability shift fast, so treat anything not stated by a vendor as "not publicly specified."

- **OpenAI Operator / Computer-Using Agent.** The product that put the term on the map in early 2025, combining vision with reinforcement-learned GUI reasoning. Launch form ran web tasks in a remote browser for higher-tier ChatGPT subscribers in the US. Browser-leaning in that incarnation.
- **Anthropic Computer Use.** A genuinely OS-scoped capability for Claude — drives native apps and the web, usually inside a virtual desktop. You manage the sandbox and security.
- **Google Project Mariner.** Google's research effort at agents operating the browser. Capabilities and availability have evolved; check current docs rather than trusting a snapshot.
- **Amazon Nova Act.** Amazon's entry aimed at reliable browser actions, shipped later in the wave.
- **Open-source efforts (OpenCUA, trycua, Fara-7B, and others).** A fast-moving open ecosystem building models and sandboxes to train and evaluate computer-use agents across full desktops — useful if you want to self-host or study the loop directly.

BrowserBash is deliberately not on the same line as the OS-scoped agents above. It is a browser-scoped, DOM-first CLI focused on returning a trustworthy verdict you can wire into a pipeline — a narrower, sharper instrument than a general computer-use model, by design.

## FAQ

### What is a computer-using agent in simple terms?

A computer-using agent is an AI that operates software by looking at the screen and controlling the mouse and keyboard, the same way a person would. You give it a goal in plain language and it works through the interface step by step instead of calling a programming interface. Unlike a chatbot that only writes text, a CUA actually takes actions on real applications.

### Is a CUA the same as browser automation?

Not exactly. Browser automation is a subset: some computer-using agents are confined to a web browser, while others control the entire operating system, including native desktop apps and the file system. The browser-scoped kind can often read the page's structure (the DOM) for more reliable targeting, whereas OS-scoped agents typically rely on screenshots because there is no universal structured view of an arbitrary desktop.

### Can BrowserBash control my whole computer like Operator or Claude Computer Use?

No, and that is intentional. BrowserBash is browser-scoped — it drives a real Chrome or Chromium browser to a plain-English goal and returns a verdict. For tasks that leave the browser, such as moving files or operating native desktop apps, a general OS-level computer-use model or a traditional RPA tool is the right fit. BrowserBash wins when the task lives in a browser, where it is cheaper, faster, and more deterministic.

### Why are computer-using agents sometimes slow or unreliable?

Most of it comes from the perceive-decide-act loop. Every step is a full model round-trip, often with a screenshot attached, so long tasks mean many round-trips and real latency. Pixel-based agents can also emit coordinates that land slightly off-target, and display scaling makes that worse. DOM-based browser agents avoid much of this by targeting elements semantically rather than by raw coordinates, which is one reason scope and perception model matter so much.

Ready to try the browser-scoped approach? Install with `npm install -g browserbash-cli` and run your first objective in a minute — an account is optional, and you can [sign up](https://browserbash.com/sign-up) when you want the cloud dashboard.
