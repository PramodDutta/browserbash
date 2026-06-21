---
title: Claude computer use, explained
description: "Claude computer use explained for engineers: what it is, how the agent loop works, its real limits and cost, and when a browser-scoped CLI fits better."
date: 2026-01-08
category: agents
---

Claude computer use is Anthropic's capability that lets a Claude model see a screen through screenshots and act on it with mouse clicks, keystrokes, and scrolls. You hand it a goal like "save a picture of a cat to my desktop," and the model loops: look at a screenshot, decide on a click or a keypress, run it in your environment, look again, repeat until the task is done. It is the closest thing the Claude API has to a general-purpose desktop operator, and it is genuinely impressive. It is also slower, costlier, and less deterministic than people expect on their first run. This article walks through what Claude computer use actually does, the limits Anthropic states in its own docs, what it costs as of 2026, and the cases where a narrower, browser-scoped tool earns its keep instead.

If your task lives entirely inside a web browser — a checkout flow, a login regression, a dashboard scrape — you have a choice between this broad screen-pixel approach and a tighter DOM-based one. We will be honest about both. BrowserBash, the open-source CLI from The Testing Academy, is browser-scoped on purpose, and there are real tasks where general computer use is the right answer and BrowserBash simply does not apply. Knowing which is which saves you money and grief.

## What Claude computer use actually is

Computer use is a beta tool you attach to a normal Claude API request. You declare it in the `tools` array (the current type is `computer_20251124`), tell the model your display resolution, and send a prompt. The model does not connect to your machine directly. Instead, it returns structured tool-use requests — "take a screenshot," "left-click at (480, 322)," "type this string," "scroll down 3" — and your code executes those against a screen you control, then feeds the result back.

The tool gives the model three core abilities: capture a screenshot to see the current state, control the mouse (click, drag, move), and send keyboard input (type text, press shortcuts). That is deliberately low-level. The model is reasoning about pixels and coordinates, not about a button's accessibility role or a DOM node's selector. It looks at an image, decides where the "Submit" button is, and emits a coordinate. This is what makes it general: it can drive Firefox, LibreOffice, a file manager, or a native settings panel with the same primitives, because to the model it is all just a picture and a cursor.

Anthropic positions this around autonomous, multi-step tasks. On WebArena, a benchmark for navigating real websites, Claude reports state-of-the-art results among single-agent systems. That benchmark framing matters: computer use is built for agentic sequences where the model has to figure out the path itself, not for a fixed, repeatable script you already know how to write.

### Computer use vs Claude Code vs Cowork

People conflate three different Anthropic things. Worth separating them:

- **Computer use (the API tool)** — the raw screenshot-and-control loop described here. You build the harness, supply the environment, and own the agent loop. Maximum flexibility, maximum plumbing.
- **Claude Code** — Anthropic's coding agent that runs in your terminal and edits files, runs commands, and works in a repo. It is not a desktop pixel-driver; it operates through a CLI and tools, not screenshots of your screen.
- **Cowork / desktop app surfaces** — packaged experiences where some of this is wired up for you.

This article is about the first one: the API-level computer use tool you call yourself. That is the thing engineers compare against browser automation.

## How the agent loop works, step by step

The mechanics are a four-step cycle Anthropic calls the "agent loop." It is worth internalizing because every cost and latency property falls out of it.

1. **You provide the tool and a prompt.** You add the computer use tool to the request and include a task that needs desktop interaction.
2. **Claude requests a tool use.** The model assesses whether the computer tool helps, and if so returns a properly formatted tool-use request. The API response carries `stop_reason: tool_use`.
3. **You execute and return the result.** Your code extracts the action, runs it on a container or VM, then continues the conversation with a `tool_result` content block — usually a fresh screenshot.
4. **Claude decides whether it is done.** It analyzes the result and either requests another action (back to step 3) or writes a final text response.

Steps 3 and 4 repeat without human input. That repetition is the whole game. A task that takes a human eight clicks becomes eight or more round trips, and every round trip ships a new screenshot up to the model and pulls reasoning plus a fresh action back down.

### The environment you have to build

Computer use does not come with a computer. Anthropic's reference implementation runs a sandboxed Linux desktop: a virtual X11 display via Xvfb, a window manager (Mutter), a panel (Tint2), and pre-installed apps like Firefox and LibreOffice, all in a Docker container with the agent loop and tool implementations wired up. You are expected to stand up and secure that environment yourself, or adapt the quickstart image. This is not a one-line install. It is a containerized virtual desktop you operate, patch, and pay to run.

That requirement is a feature for general automation — you genuinely can drive any app on that desktop — and a tax for narrow tasks. If all you need is to log into a website and confirm a banner appears, provisioning a virtual X11 desktop is a lot of machinery for the job.

## The limits Anthropic states (read these before you build)

Anthropic is unusually candid in its own documentation about where computer use falls short. The tool is in beta, and the limitations page lists concrete failure modes. Taking them at face value:

- **Latency.** Anthropic says the current latency "might be too slow compared to regular human-directed computer actions" and steers you toward use cases where speed is not critical — background information gathering, automated testing — in trusted environments.
- **Computer-vision accuracy.** The model "might make mistakes or hallucinate when outputting specific coordinates." It is reading an image and guessing pixel positions; sometimes it guesses wrong.
- **Tool-selection reliability.** It can pick the wrong action or take an unexpected path, and reliability "might be lower when interacting with niche applications or multiple applications at once."
- **Scrolling.** The scroll action can simply not take effect in some apps; the docs suggest keyboard alternatives like Page Down as a fallback.
- **Fiddly UI elements.** Dropdowns and scrollbars "might be tricky" to manipulate with mouse movements; the recommended workaround is to prompt the model toward keyboard shortcuts.
- **Spreadsheets.** Selecting individual cells may need fine-grained mouse-down/mouse-up control and still take multiple attempts.

None of this means computer use is bad. It means it is a probabilistic, vision-driven operator that occasionally misclicks, mis-scrolls, or mis-selects, and you design around that with retries, extended thinking for debuggability, and human confirmation on consequential steps. For a CI gate that must pass or fail the same way on every run, that variance is the thing you have to engineer against.

### The prompt-injection problem is real

Because the model reads whatever is on screen, a malicious webpage or image can carry instructions that try to hijack it. Anthropic states plainly that Claude "will follow commands found in content even if it conflicts with the user's instructions" in some circumstances. They have trained the model to resist this and added a classifier layer that flags likely injections in screenshots and steers the model to ask for confirmation before continuing. They still recommend running in a sandbox, restricting internet access to an allowlist, keeping sensitive credentials away from the model, and putting a human in the loop for anything with real-world consequences like financial transactions or accepting terms.

This is the right posture, and it is also a reason to scope down when you can. The smaller the surface a browsing agent can touch, the smaller the blast radius if a page tries something.

## What Claude computer use costs in 2026

There is no separate "computer use" price. It bills as standard token usage on whichever model you choose, plus the structural overhead of the loop. As of 2026, Anthropic's published API rates per million tokens include:

| Model | Input / MTok | Output / MTok | Notes |
|---|---|---|---|
| Claude Opus 4.8 | $5 | $25 | Latest Opus; adds adaptive thinking and effort controls |
| Claude Opus 4.8 Fast Mode | $10 | $50 | Faster variant at a higher token rate |
| Claude Sonnet 4.6 | $3 | $15 | Balanced workhorse |
| Claude Haiku 4.5 | $1 | $5 | Cheapest of the recommended tier |

Pricing changes; treat these as 2026 figures and check Anthropic's pricing page before you budget. Bedrock and Vertex may differ.

The headline rate is only part of the bill. Three multipliers make computer use cost more than a single prompt suggests:

1. **Screenshots are image input on every turn.** Each loop iteration sends a screenshot, and images consume input tokens scaled by resolution. The docs recommend modest resolutions (1280x720 as a baseline) partly because higher resolutions cost more without improving accuracy on UI tasks.
2. **The loop multiplies turns.** An eight-action task is roughly eight request/response pairs, each re-sending context and a new image. Costs scale with the number of steps, not the difficulty of the goal in your head.
3. **A fixed system-prompt overhead.** Enabling the computer use beta adds a few hundred tokens to the system prompt on every request (reported in the ~466–499 token range). Small per call, but it rides along on every iteration of every run.

You can blunt these with prompt caching (Anthropic advertises up to 90% savings on repeated context), batch processing where latency is irrelevant, picking a cheaper model for simple UI, and keeping the screen resolution sane. Even so, a long multi-step desktop task on a frontier model is not a fraction-of-a-cent operation. Budget for it.

## Where a browser-scoped CLI fits better

Here is the honest pivot. A huge share of the "automate the computer" tasks people actually have never leave a browser tab: log in, fill a form, complete a checkout, pull a number off a dashboard, verify a page after a deploy. For those, general computer use is more machinery and more variance than the job needs. BrowserBash is built for exactly that slice.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI. You give it a plain-English objective and an AI agent drives a real Chrome or Chromium browser step by step — no selectors — and returns a verdict plus structured values. Install is one line, no virtual X11 desktop to stand up:

```bash
npm install -g browserbash-cli
browserbash run "go to the demo store, add a laptop to the cart, and confirm the cart shows 1 item"
```

The core difference is what the agent reasons over. Computer use reasons over screenshot pixels and emits coordinates. BrowserBash works through the browser's DOM and the page structure, which is why it is more deterministic on web tasks: there are no misread pixels or missed scrollbars, and a button that moves twenty pixels does not break the run. That DOM-grounded approach is also lighter to run in CI, where you want the same pass/fail every time, not a vision model occasionally guessing a coordinate wrong.

It is also cheaper to operate, and not only because there is no GPU-backed virtual desktop in the loop. BrowserBash is Ollama-first. The default model resolution is `auto`: it tries a local Ollama model first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. Point it at a local model and your token bill is $0 and nothing leaves your machine. When you do want a hosted model — including Claude via your Anthropic key, or models through OpenRouter — you can, but you are not forced to pay per screenshot to verify a login page.

For agent and CI workflows, BrowserBash speaks a pipeline-friendly protocol. The `--agent` flag emits NDJSON with stable exit codes (0/1/2/3), so a coding agent or a CI job can read structured events and branch on the result:

```bash
browserbash run "log in with {{USERNAME}} and {{PASSWORD}}, then verify the welcome banner" --agent
```

You can capture evidence with `--record`, which writes a `.webm` video plus a screenshot and a trace for the run. And you can keep tests as Markdown files — `*_test.md` with `{{variables}}` and masked secrets — and run them like any other suite:

```bash
browserbash testmd run smoke_test.md --record
```

You can read more about these in the [BrowserBash features](https://browserbash.com/features) overview and the step-by-step [tutorials](https://browserbash.com/tutorials).

### Honest caveat about local models

If you go fully local to get the $0 bill, model size matters. Tiny local models (roughly 8B parameters and under) get flaky on long, multi-step browser flows — they lose the thread, repeat steps, or stop early. The reliable sweet spot is a Qwen3 or Llama 3.3 70B-class model, or just use a hosted model for the hard runs. This is the mirror image of computer use's tradeoff: BrowserBash gives you a cheaper, more deterministic path for browser tasks, but the cheapest tier needs a capable-enough model to stay on track. The [Learn hub](https://browserbash.com/learn) walks through choosing a model for your workload.

## Claude computer use vs BrowserBash: a straight comparison

Same task framing, different tools. This table is about fit, not about one being universally better.

| Dimension | Claude computer use | BrowserBash |
|---|---|---|
| Scope | Whole desktop / OS, any app | Web browser only |
| How it perceives | Screenshot pixels + coordinates | Browser DOM / page structure |
| Determinism on web | Probabilistic; can misclick / mis-scroll | DOM-based, more repeatable |
| Setup | Sandboxed VM/container (Xvfb desktop) you build | `npm install -g browserbash-cli` + Chrome |
| Cost model | Per-token + image per turn; hosted model | Ollama-first; $0 with a local model, or BYO key |
| CI fit | Workable but heavier and noisier | NDJSON via `--agent`, exit codes 0/1/2/3 |
| Best at | OS-level and cross-app automation | Browser flows, login, checkout, scraping, web QA |
| Status | Beta (per Anthropic) | v1.3.1, stable CLI |

The pattern is clear. If your task touches the operating system — moving files in Finder, clicking through native System Settings, driving a desktop accounting app, orchestrating two native apps together — BrowserBash cannot do it, and computer use (or a traditional RPA tool) is the correct choice. Drag-and-drop between a desktop app and a browser, a native installer wizard, reading a value out of a PDF viewer and pasting it into a spreadsheet: that is computer-use territory, full stop.

If your task lives in a browser, BrowserBash is usually the better-shaped tool: faster to stand up, cheaper to run, and steadier in a pipeline because it is reading the DOM instead of guessing pixels.

## When to choose which

A short decision guide.

**Choose Claude computer use (or general computer-use models / RPA) when:**

- The work crosses application boundaries or touches the OS shell, file system, or native dialogs.
- There is no usable web interface and the only path is a desktop app.
- You need one agent that can improvise across whatever happens to be on screen, and you can tolerate latency and occasional misclicks.
- You are doing background, non-time-critical automation in a trusted sandbox, with humans confirming consequential actions.

**Choose BrowserBash when:**

- The entire task happens inside a web browser — auth flows, forms, carts, dashboards, post-deploy verification, data extraction.
- You want CI-grade determinism and a clean pass/fail, not a vision model's best guess.
- You care about cost and want the option of $0 local runs with nothing leaving your machine.
- You want plain-English tests your whole team can read, version, and run, with recordings as evidence.

Plenty of teams use both: computer use or an RPA tool for the genuine desktop work, and a browser-scoped CLI for the web-heavy majority. They are not competitors so much as different altitudes. You can see how teams apply the browser-scoped approach in the [case studies](https://browserbash.com/case-study), and compare it against other tools on the [BrowserBash blog](https://browserbash.com/blog).

## A realistic mental model for cost and reliability

If you remember one thing, make it this: computer use prices and reliability both scale with the number of loop iterations, and each iteration is a screenshot up plus reasoning down. A goal that feels like "one task" to you might be twenty round trips to the model. That is why Anthropic itself points computer use at non-time-critical, background, trusted-environment work rather than fast interactive flows.

Browser-scoped automation collapses a lot of that. Because the agent reasons over structured page content rather than re-screenshotting the screen every step, web flows run with less back-and-forth and far less pixel-level uncertainty — and when you run them locally, the marginal cost is your own electricity. The tradeoff you accept is scope: it only does browsers. For an enormous fraction of "automate this" requests, that scope is exactly right, and the narrowing is the point.

So the practical playbook is: reach for general computer use when the task truly needs the whole computer, and reach for a tighter tool when it does not. Match the tool to the surface area of the task, and both your bill and your flake rate come down.

## FAQ

### Is Claude computer use free?

No. There is no separate computer use fee, but it bills as standard Claude API token usage on whichever model you pick, and screenshots count as image input on every loop iteration. A multi-step task can run many request/response round trips, so costs add up faster than a single prompt suggests. Use the 2026 per-token rates as a baseline and check Anthropic's current pricing before budgeting.

### What can Claude computer use do that a browser tool cannot?

It can operate the whole desktop, not just a web page. Because it works from screenshots and mouse and keyboard control, it can drive native apps, file managers, system dialogs, and several applications at once — anything visible on the screen. A browser-scoped tool like BrowserBash is limited to web browsers by design, so genuine OS-level or cross-application automation is exactly where general computer use, or a traditional RPA tool, is the right fit.

### How reliable is Claude computer use?

Anthropic describes it as beta and state of the art for its category, while listing real limitations in its own docs. The model can misjudge click coordinates, pick the wrong action, struggle with dropdowns and scrollbars, and have scrolling not take effect in some apps. It works best on non-time-critical, background tasks in a trusted sandbox, with retries and human confirmation on consequential steps rather than as a deterministic, hands-off pipeline.

### When should I use BrowserBash instead of Claude computer use?

Use BrowserBash when the task lives entirely in a web browser — logins, forms, checkouts, dashboards, scraping, or verifying a page after a deploy. It reasons over the DOM rather than screen pixels, which makes it more deterministic and CI-friendly, and it is Ollama-first so a local model costs nothing to run. Choose general computer use when the work leaves the browser and touches the operating system or multiple native apps.

Browser-scoped automation does not have to cost a thing to try. Install the CLI with `npm install -g browserbash-cli`, point it at a local Ollama model for a $0 bill, and run your first plain-English browser task in minutes. An account is optional — sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) only if you want the cloud dashboard.
