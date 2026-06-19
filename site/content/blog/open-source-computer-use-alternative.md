---
title: An open-source alternative to computer use for the web
description: "An open source computer use alternative scoped to the browser: cheaper, more deterministic, runs on a local model with no API bill and no cloud."
date: 2026-04-14
category: agents
---

If you have ever wired up Anthropic's computer use loop to drive a web task, you know the feeling: it works, it's impressive, and your token bill makes you wince. An open source computer use setup that screenshots a desktop, asks a frontier model to count pixels, and clicks where it guesses is a genuinely useful primitive — but for *web* work specifically it's the wrong altitude. The page underneath has a readable DOM and an accessibility tree. You don't need a model staring at a 1280-pixel-wide PNG to figure out where the "Log in" button is. This article is for engineers who have built against computer use, felt the cost and the flakiness, and want a browser-scoped option that is cheaper, more deterministic, and can run entirely on your own machine.

The short version: [BrowserBash](https://browserbash.com/features) is a free, Apache-2.0 CLI that drives a real Chrome browser from a plain-English objective. It defaults to a local Ollama model, so on the local path nothing leaves your machine and your model bill is a flat $0. It is not a general computer-use agent — it deliberately does less. That narrower scope is the whole point.

## What "computer use" actually means, and why the web doesn't need all of it

Anthropic's computer use is structured around a screenshot-in, action-out loop. The model receives a full-screen image, reasons about what's on screen, and emits a structured action — `click` at some (x, y), `type` this string, `scroll` here — with pixel coordinates. The reference implementation ships as a Dockerized Ubuntu VM with X11 and VNC so Claude can drive an entire Linux desktop, not just a browser. That generality is exactly why people reach for it: it can operate any app, including ones with no API and no DOM.

The catch is that this generality has a tax. Every step round-trips a screenshot to a frontier vision model. The model has to *visually* locate the target, count pixels from a reference point, and hope the click lands. Resolution, DPI scaling, and a re-rendered layout can all shift where the button is. On a long multi-step web flow — log in, navigate, fill a form, submit, read the confirmation — you pay for that screenshot-and-reason cycle on every single step, and any one of them can misfire because the model misjudged a coordinate by twenty pixels.

For web tasks, there is a cheaper source of truth sitting right there: the DOM. A browser already knows there's a button with the accessible name "Log in." It knows the input is `type="email"`. It can scroll an element into view deterministically. A browser-scoped agent that reads structure instead of guessing pixels is doing less work, sending fewer tokens, and failing in more predictable ways. That's the trade BrowserBash makes, and it's why it can run a serious flow on a mid-size *local* model instead of needing a frontier API on every step.

This isn't a knock on computer use. If your task involves a native desktop app, a Citrix session, a legacy thick client, or anything without a DOM, computer use (or an open source clone of it) is genuinely the right tool and BrowserBash can't help you — it only drives browsers. The argument here is narrower: when the task lives in a browser, browser-scoped beats screen-scoped on cost, speed, and determinism.

## How BrowserBash drives the browser instead of the screen

You install it once and run it from the terminal:

```bash
npm install -g browserbash-cli
browserbash run "Go to the demo store, search for a blue backpack, add the first result to the cart, and confirm the cart subtotal is shown"
```

Behind that one line, an AI agent opens a real Chrome/Chromium browser and works the objective step by step. There are no selectors to write, no page objects to maintain, no waits to tune. The agent acts on the page, observes the result, decides the next step, and at the end returns a plain-language verdict (passed/failed) plus any structured values it was asked to extract — like that subtotal.

Two pieces make this work, and it helps to keep them straight:

- **Engines** decide *who interprets your English and acts on the page.* The default is **Stagehand** (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when the page shifts. There's also **builtin**, an in-repo Anthropic tool-use loop driving Playwright directly, which is what runs automatically on grid providers. You switch with `--engine stagehand|builtin`.
- **Providers** decide *where the browser actually runs.* The default is **local** — your own Chrome. You can also point at any DevTools endpoint with `cdp`, or run on Browserbase, LambdaTest, or BrowserStack.

The important contrast with a screenshot loop: the engine works with the page's real structure, not a flattened image of it. It can read the accessibility tree, observe what's actionable, and self-correct when a render changes — which is the kind of thing that makes a coordinate-counting agent stumble. You can dig into the primitives and recipes on the [tutorials page](https://browserbash.com/tutorials).

## The cost difference is the headline

This is where browser scope stops being an architecture footnote and starts being a line item.

A computer use agent calls a hosted frontier model on every step, and each call carries a full screenshot. For reference, Claude Opus 4.8 is priced at $5 per million input tokens and $25 per million output tokens as of 2026; an image plus reasoning plus a tool-use response on each of ten steps adds up fast, and a flaky run that retries adds more. None of that is wasteful by design — it's the price of operating a desktop you can only *see*.

BrowserBash's model story is Ollama-first, and that changes the math completely. The default model is `auto`, which resolves in this order:

1. A local **Ollama** model if one is running — used as `ollama/<model>`, free, no API keys, nothing leaves your machine.
2. `ANTHROPIC_API_KEY` if set — uses `claude-opus-4-8`.
3. `OPENAI_API_KEY` if set — uses `openai/gpt-4.1`.
4. Otherwise it errors with guidance on how to configure one.

When the local path resolves, your model bill for the run is exactly zero, and there's no usage-based screenshot tax because the agent is reading the page rather than shipping images to a cloud model. You can pin a backend explicitly when you want determinism across machines:

```bash
# Run fully local on a mid-size Ollama model — $0, no keys, nothing leaves the box
browserbash run "Log in with the seeded test account and verify the dashboard greeting shows the user's first name" --model ollama/qwen3

# Or pin a hosted model for a hard flow
browserbash run "Walk the full multi-step checkout and confirm the order number is returned" --model claude-opus-4-8
```

Here's the honest caveat, and it matters: very small local models (roughly 8B parameters and under) are flaky on long, multi-step objectives. They'll handle a two-step "open this page and read a value" fine, but they lose the plot on a ten-step checkout. The sweet spot for serious local runs is a mid-size model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you try to drive a complex journey on a 3B model and it wanders, that's expected — size up the model, don't blame the approach. Anyone telling you a tiny local model nails arbitrary web flows is selling something.

### A rough cost picture

| Dimension | Open source computer use (screenshot loop) | BrowserBash (browser-scoped) |
|---|---|---|
| What the model sees each step | Full screenshot (image tokens) | Page structure / accessibility tree |
| Model required | Capable hosted vision model on every step | Mid-size local model, or hosted for hard flows |
| Model bill on the default path | Per-token, per-screenshot, per-step | $0 on local Ollama |
| Where data goes | To the model provider (the screenshots) | Stays on your machine on the local provider |
| Failure mode | Misjudged pixel coordinate | Page-structure mismatch (more legible) |
| Scope | Any app on the desktop | Browser only |

Note the asymmetry in that last row. Computer use can do strictly more than BrowserBash. The point is that for the subset of work that lives in a browser — which is a large subset — you're paying the general-purpose tax for nothing.

## Determinism: legible failures beat mysterious ones

Cost gets the headline, but determinism is what makes a tool usable in CI. A pixel-coordinate agent has a particular failure signature: it clicks a few pixels off, lands on the wrong element, and the run derails in a way that's hard to reproduce because the next screenshot is now different. You re-run it and it passes. That non-determinism is poison for a test suite.

Browser-scoped automation fails more legibly. When BrowserBash can't find an actionable element matching your objective, the failure is about page structure, not a near-miss on a coordinate, and it tends to reproduce. Three features lean into making runs auditable rather than magical:

- **`--record`** captures a screenshot and a `.webm` session video via bundled ffmpeg. On the builtin engine it also writes a Playwright trace you can open in the trace viewer and scrub step by step.
- **The run store** keeps every run on disk at `~/.browserbash/runs` — secrets masked, capped at 200 — so you can go back and see exactly what happened on a flaky run instead of reconstructing it from memory.
- **`--agent`** emits NDJSON, one JSON object per line, so a CI job or an AI coding agent consumes structured progress instead of scraping prose.

That last one is the bridge to automation. Here's the contract:

```bash
browserbash run "Submit the contact form and confirm the success toast appears" --agent --record
```

Progress events stream as `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`. The terminal event is `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. And the exit codes are the part your pipeline actually keys on: `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, no brittle regex over a log. That's the difference between a demo and something you can gate a deploy on. There's a deeper walk-through of this on the [learn pages](https://browserbash.com/learn).

## Markdown tests: the part computer use doesn't give you

A one-shot `run` is great for exploration, but most teams want something they can commit, review in a pull request, and run on every push. Computer use, as a raw API loop, leaves that scaffolding to you. BrowserBash ships it.

Markdown tests are plain `*_test.md` files where each list item is a step:

```bash
browserbash testmd run ./checkout_test.md
```

Inside the file, steps read like instructions to a careful teammate. You get `{{variables}}` templating, `@import` composition so shared setup lives in one place, and — importantly for anything touching credentials — secret-marked variables are masked as `*****` in every log line. After each run it writes a human-readable `Result.md` you can attach to a PR or hand to a non-engineer. This is the kind of thing you'd otherwise build yourself on top of a computer use loop, and it's where "an open source alternative" stops meaning "the same primitive, self-hosted" and starts meaning "the workflow, done for you."

## Where it runs: local by default, grid when you need it

The provider story matters for both cost and privacy.

By default the browser is **local** — your own Chrome, on your own machine. That's what keeps the local model path genuinely private: with `--provider local` and a local Ollama model, no screenshots, no DOM, no objective text leaves the box. There's no account required to run anything; you install the npm package and go.

When you need scale or specific browser/OS coverage, you can change *where the browser runs* without changing how you write the test:

- **`cdp`** attaches to any DevTools endpoint via `--cdp-endpoint ws://...`.
- **`browserbase`** runs on Browserbase (needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`).
- **`lambdatest`** and **`browserstack`** run on those grids (with their respective credentials) and automatically switch to the builtin engine.

There's also an optional, fully local dashboard if you want a UI over your runs:

```bash
browserbash dashboard
```

That serves a dashboard at `localhost:4477` with everything staying on your machine. If you *want* shareable run history, you can opt in: `browserbash connect --key bb_...` links a free cloud account, and then `--upload` pushes a specific run (free cloud runs are kept 15 days). The default is the privacy-preserving one — without `--upload`, nothing is sent anywhere. You can read the boundaries on the [pricing page](https://browserbash.com/pricing), which is short because the CLI is free.

## How BrowserBash compares to the open-source web-agent landscape

"Open source computer use" has come to mean a few different things, so it's worth placing BrowserBash honestly against the neighbors. The facts below are accurate as of 2026; where a project's internals aren't publicly specified, I say so rather than guess.

| Tool | Scope | Primary interface | Model story | Best fit |
|---|---|---|---|---|
| **Anthropic computer use** (reference impl, open) | Whole desktop | Screenshot loop, pixel coordinates | Anthropic Claude (hosted) | Native apps with no DOM; broad desktop control |
| **browser-use** | Browser | LLM-driven agent loop over DOM + vision | BYO LLM (multiple providers) | Python projects building a custom web agent in code |
| **Stagehand** | Browser | act/extract/observe/agent primitives | BYO LLM | Embedding browser AI primitives into your own app code |
| **BrowserBash** | Browser | Plain-English CLI + committable markdown tests | Ollama-first `auto`; local or hosted | Terminal-first runs, CI gating, $0 local model bill |

A few honest notes on that table:

- **browser-use** is the de facto open-source library for letting an LLM drive a browser in Python. If you want to *write code* that orchestrates a web agent with full control over state and prompts, it's an excellent choice and arguably the better fit. BrowserBash is the opposite ergonomic: a CLI you point at an objective, not a library you build a program around. BrowserBash actually uses Stagehand as its default engine, so this isn't a rivalry so much as a different packaging.
- **Stagehand** is the engine, not a competitor in the usual sense — it's the MIT primitive library underneath BrowserBash's default engine. If you're a developer who wants those primitives in your own application code, use Stagehand directly. If you want a ready-to-run CLI and markdown tests on top of them, that's BrowserBash.
- **Anthropic computer use** wins decisively the moment the task leaves the browser. No browser-scoped tool can drive a native installer or a desktop spreadsheet. If your "web" task is actually 30% desktop, computer use or an open clone of it is the honest answer.

If you came here from the screenshot-loop world specifically, there's a focused migration write-up and a head-to-head on the [BrowserBash blog](https://browserbash.com/blog) worth reading next.

## When to choose a browser-scoped agent (and when not to)

Let me be balanced about this, because picking the wrong tool wastes a week.

**Choose a browser-scoped open source computer use alternative like BrowserBash when:**

- The task lives entirely in a web browser — logins, forms, checkouts, dashboards, scraping a value off a page.
- You care about the model bill and want a realistic path to $0 by running a mid-size local model.
- Privacy matters and you'd rather nothing leave your machine — the local provider plus a local model keeps it all on-box.
- You want results in CI: exit codes, NDJSON, committable markdown tests, and recordings for debugging.
- You're terminal-first and don't want to maintain selectors or page objects.

**Stick with computer use (open or hosted) when:**

- The workflow touches native desktop apps, OS dialogs, or anything with no DOM.
- You specifically need cross-application orchestration — e.g., pull data from a desktop app and paste it into a web form.
- The "page" is actually a canvas/WebGL surface or a remote-desktop stream where there's no meaningful DOM to read.

**Reach for browser-use or Stagehand directly when:**

- You're building a custom agent *in code* and want library-level control over the loop, prompts, and state, rather than a CLI.

And the honest caveat one more time, because it's the most common way people get disappointed: a tiny local model will not reliably drive a long, branching web flow. Match the model to the difficulty. Use a 70B-class local model or a hosted model for the hard stuff, and save the small local models for short, well-defined objectives. Done that way, the browser-scoped approach is faster, cheaper, and far more predictable than asking a frontier model to count pixels on a screenshot ten times in a row.

## A realistic first hour

If you want to feel the difference rather than take my word for it, here's a sane on-ramp. Install the CLI (you'll need Node 18+ and Chrome) and start with a short objective on whatever model you have. Watch it open a real browser and work the task. Then add `--record` and open the video and trace to see exactly what it did. When you're comfortable, write a `*_test.md` for one flow you care about, run it with `testmd run`, and read the generated `Result.md`. Finally, add `--agent` and wire the exit code into a throwaway CI job to see a real pass/fail gate.

That sequence takes about an hour and tells you everything: whether your model is strong enough for your flows, whether determinism holds up on re-runs, and whether the $0-local-model story is real for your workload. If the local model wanders on a hard flow, pin a hosted one for that test and keep the cheap path for the easy ones — mixing is fine and expected. Real-world examples live on the [case study page](https://browserbash.com/case-study).

None of this requires an account. You only sign up if you want the optional cloud dashboard for shareable run history, and even then nothing is uploaded unless you pass `--upload`.

## FAQ

### Is there a free, open-source alternative to Anthropic computer use for web tasks?

Yes. BrowserBash is a free, Apache-2.0 CLI that drives a real Chrome browser from a plain-English objective, scoped specifically to the web rather than the whole desktop. It defaults to a local Ollama model, so on the local path your model bill is $0 and nothing leaves your machine. It's not a general desktop agent, which is exactly why it's cheaper and more deterministic for browser work.

### Why is a browser-scoped agent cheaper than a computer use screenshot loop?

A computer use loop sends a full screenshot to a hosted vision model on every step and asks it to reason about pixel coordinates, which costs image tokens plus output tokens per step. A browser-scoped agent reads the page's real structure instead, so it can run on a mid-size local model with no API bill and no per-screenshot tax. The cost difference compounds on long multi-step flows where each step would otherwise be a paid model call.

### Can I run this entirely locally with no API keys?

Yes. With the default local provider and a local Ollama model, the browser runs on your own Chrome and the model runs on your own machine, so no objective text, DOM, or screenshots are sent to any cloud. The honest caveat is that very small local models under about 8B parameters get flaky on long objectives, so use a mid-size model in the Qwen3 or Llama 3.3 70B class for serious multi-step flows.

### When should I still use computer use instead of a browser-only tool?

Use computer use, or an open-source clone of it, whenever the task leaves the browser — native desktop apps, OS-level dialogs, remote-desktop streams, or canvas surfaces with no readable DOM. Those are cases where there's no page structure to read, so seeing and clicking pixels is the only option. A browser-scoped tool like BrowserBash deliberately can't help there, and that's a fair trade for being cheaper and more deterministic on actual web work.

Ready to try the browser-scoped path? Install it and run your first objective in a minute:

```bash
npm install -g browserbash-cli
```

No account required to run it locally. If you later want a shareable cloud dashboard, you can [sign up](https://browserbash.com/sign-up) — it's optional, and the CLI works fully on its own without it.
