---
title: "agent-browser Alternative: Natural-Language CLI vs Ref-Based Commands"
description: "Looking for an agent-browser alternative? Compare Vercel Labs' ref-based CLI with BrowserBash's plain-English browser automation — honestly, command by command."
date: 2026-01-06
category: alternatives
---

If you have been pointing a coding agent at the web lately, you have probably run into Vercel Labs' agent-browser, and you may now be hunting for an agent-browser alternative that fits your workflow better. agent-browser is a fast, well-built headless browser CLI: you take a snapshot, the page comes back as an accessibility tree with refs like `@e1` and `@e2`, and your agent clicks and fills against those refs. It is a low-level driver, and that is the whole point. BrowserBash sits at a different altitude. Instead of emitting refs and waiting for the agent to compose a click sequence, you hand it one plain-English objective and an AI agent drives a real Chrome step by step, then returns a verdict plus the values it pulled out. This article compares the two honestly, command by command, so you can pick the right tool — and sometimes that tool is agent-browser.

## What agent-browser actually is

Let me be precise, because the value of any comparison depends on getting the competitor right. agent-browser is an open-source (Apache-2.0) CLI from Vercel Labs. It pairs a fast native Rust binary with a Node.js daemon that holds a Playwright browser instance, so the first command spins up the daemon and subsequent commands reuse it. Chromium is the default engine; the daemon also supports Firefox and WebKit through Playwright.

The headline workflow is the snapshot-and-ref loop. You run `agent-browser open example.com`, then `agent-browser snapshot`, and you get back something like:

```
- heading "Example Domain" [ref=e1] [level=1]
- button "Submit" [ref=e2]
- textbox "Email" [ref=e3]
- link "Learn more" [ref=e4]
```

From there you act on the refs: `agent-browser click @e2`, `agent-browser fill @e3 "test@example.com"`, `agent-browser get text @e1`. Refs are deterministic — each one points at the exact element that was in that snapshot — and they are fast because there is no DOM re-query. agent-browser also supports traditional CSS selectors, text and XPath selectors, and semantic locators like `find role button click --name "Submit"`. There is a `--json` agent mode for machine-readable output, isolated `--session` instances, persistent `--profile` directories, network interception, tabs, frames, iOS Simulator control, and cloud providers (Browserbase, Browser Use, Kernel). It is a genuinely good piece of engineering.

Here is the thing the README is honest about and that you should internalize before you compare anything: **agent-browser does not contain an AI agent.** It is the hands, not the brain. The intelligence — deciding which ref to click, reading the snapshot, recovering when the page changes — lives in whatever LLM or coding agent you wire up around it. The recommended pattern in their own docs is literally "just tell your agent to use it" and let the agent read `--help`. So when you ask "is there an agent-browser alternative," the honest answer depends on which layer you actually want to replace: the driver, or the brain that drives it.

## What BrowserBash is, and where the line falls

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it with `npm install -g browserbash-cli` and run `browserbash`. The difference from agent-browser is not cosmetic. You do not take a snapshot and parse refs. You write the objective in plain English, and BrowserBash brings its own agent loop that drives a real Chrome to completion:

```bash
browserbash run "Go to the demo store, add the first product to the cart, start checkout, and confirm the cart subtotal is shown"
```

That single command navigates, decides what to click, types where it needs to, handles the page changing under it, and returns a pass/fail verdict plus any structured values it extracted along the way. No selectors. No page objects. No ref bookkeeping. The agent and the browser ship together in one tool.

So the cleanest way to frame the choice: agent-browser gives you precise, deterministic verbs and expects you (or your agent) to supply the reasoning. BrowserBash bundles the reasoning and gives you an objective-level interface. Both drive a real Chromium. Both have a JSON output mode for CI and coding agents. They overlap, but they are aimed at different jobs.

## Ref-based commands vs natural-language objectives

This is the heart of it, so let's slow down. Consider a login flow. With agent-browser, an agent (or a human) produces a sequence like this:

```
agent-browser open app.example.com/login
agent-browser snapshot -i --json
# agent reads the tree, finds the email and password refs and the submit button
agent-browser fill @e3 "user@example.com"
agent-browser fill @e5 "hunter2"
agent-browser click @e7
agent-browser wait --url "**/dashboard"
agent-browser get text @e2
```

Every step is explicit and inspectable. If `@e5` was wrong, you see exactly where it broke. The refs are stable within a snapshot, but they are tied to that snapshot — if the page re-renders, you generally re-snapshot and the refs can shift, so the agent has to keep its mental model fresh. The cost is round-trips and orchestration: something has to parse the tree, choose refs, sequence the verbs, and re-snapshot after navigation. agent-browser is excellent at being the verbs; it deliberately leaves the orchestration to you.

With BrowserBash, the same flow collapses:

```bash
browserbash run "Log in at app.example.com/login with user@example.com / hunter2, then confirm the dashboard greeting shows the user's name"
```

The agent inside BrowserBash does the snapshot-reason-act loop internally. You describe the *what*; it figures out the *how*. The trade is the mirror image of agent-browser's: you give up per-verb determinism in exchange for not having to write or generate the verb sequence at all. When a button moves or a label changes, a good natural-language run often adapts without you touching anything, because the instruction was "confirm the dashboard greeting," not "click `@e7`." When it does fail, you read the agent's step log and verdict rather than diffing a ref sequence.

Neither approach is strictly better. Ref-based commands are the right primitive when you want tight, scripted control and full visibility into every action. Natural-language objectives are the right primitive when you want to express intent once and not maintain the mechanics. A lot of teams end up wanting both at different times, which is exactly why this is a real decision and not a marketing one.

### The honesty caveat on natural-language reliability

I am not going to pretend natural-language driving is free of failure modes. It leans on a model's ability to read a page and plan, and that ability scales with the model. BrowserBash is Ollama-first — its default `auto` model resolves to a local Ollama model when one is present, so nothing leaves your machine and your model bill is genuinely $0. But very small local models (8B parameters and under) get flaky on long, multi-step objectives; they lose the thread, repeat steps, or call a flow done early. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the hard flows. If you run a tiny model against a ten-step checkout, expect to babysit it. agent-browser sidesteps this entirely at the driver layer — its verbs are deterministic — and pushes the reliability question onto whatever brain you bolt on, which is a legitimate design choice with its own trade-offs.

## Feature comparison

Here is a side-by-side of the facts that actually drive a decision. Where something about agent-browser is not stated in its public docs, I say so rather than guess.

| Dimension | agent-browser (Vercel Labs) | BrowserBash |
|---|---|---|
| License | Apache-2.0 | Apache-2.0 |
| Core interface | Ref-based verbs (`@e1`) + selectors, snapshot loop | Plain-English objective, agent-driven |
| Built-in AI agent | No — you supply the brain | Yes — agent loop is bundled |
| Default browser | Chromium (Firefox/WebKit via Playwright) | Real Chrome/Chromium (local provider) |
| LLM backend | Not applicable (no built-in model) | `auto`: local Ollama → Anthropic → OpenAI; or pin `--model` |
| Runs fully offline / $0 model bill | N/A at driver layer | Yes, with local Ollama models |
| Machine output mode | `--json` per command | `--agent` NDJSON stream + exit codes |
| Engine choice | Single Playwright-based driver | `stagehand` (default) or `builtin` Anthropic loop via `--engine` |
| Cloud browser providers | Browserbase, Browser Use, Kernel | Browserbase, LambdaTest, BrowserStack, any CDP endpoint |
| iOS Simulator / real device | Yes (Appium/XCUITest) | Not a documented feature |
| Committable test format | Not a documented first-class feature | Markdown tests (`*_test.md`) with `{{variables}}`, `@import`, secret masking |
| Recording | Trace start/stop | `--record` screenshot + `.webm` video; builtin engine writes Playwright trace |
| Dashboard | Not a documented feature | Local dashboard (`browserbash dashboard`, localhost:4477) + optional cloud |

A few notes so this table is read fairly. agent-browser's iOS Simulator integration is a real strength BrowserBash does not match — if mobile Safari on a simulator is your target, that alone may decide it. agent-browser's network routing and request mocking are first-class and granular in a way BrowserBash does not advertise. And agent-browser's Rust-binary speed for individual verbs is a real characteristic of its client-daemon architecture. None of that is fluff; if those are your needs, agent-browser is the better fit and you should use it.

Where BrowserBash pulls ahead is for the team that wants the whole loop in one tool: the agent, the engine, committable tests, recording, and a verdict, without standing up an orchestration layer. You can read more about that surface on the [BrowserBash features page](https://browserbash.com/features).

## Engines and providers: BrowserBash's two-axis model

One structural difference worth understanding is that BrowserBash separates *who interprets the English* from *where the browser runs*. agent-browser has one driver and a set of cloud providers; BrowserBash splits the decision into two independent axes.

On the interpretation axis there are two engines. The default is `stagehand` (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when selectors drift. The alternative is `builtin`, an in-repo Anthropic tool-use loop that drives Playwright directly; it is selected automatically for LambdaTest and BrowserStack runs. You switch with `--engine stagehand|builtin`.

On the execution axis, `--provider` decides where the Chrome actually lives: `local` (your own Chrome, the default), `cdp` for any DevTools endpoint via `--cdp-endpoint ws://...`, `browserbase`, `lambdatest`, or `browserstack`. The `cdp` provider is the overlap point with agent-browser's own CDP support — both can attach to an existing browser exposing a DevTools endpoint, so if you already run a remote Chrome you can point either tool at it.

The LLM backend is its own setting. `auto` is the default and resolves in order: a local Ollama model first (`ollama/<model>`, free, no keys), then `claude-opus-4-8` if `ANTHROPIC_API_KEY` is set, then `openai/gpt-4.1` if `OPENAI_API_KEY` is set, otherwise it errors with guidance. You can pin any of those explicitly, or route through OpenRouter (`openrouter/<vendor>/<model>`) or an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`. That flexibility is the practical answer to the reliability caveat above — start local and free, escalate to a stronger model only for the flows that need it. The [pricing page](https://browserbash.com/pricing) lays out what is free versus optional.

## Output for CI and coding agents

Both tools were built with machine consumers in mind, and this matters more than it sounds. agent-browser's `--json` gives you per-command structured output — a snapshot returns `{"success":true,"data":{"snapshot":"...","refs":{...}}}` — which is ideal for an agent that is composing its own sequence and needs to read state between verbs.

BrowserBash's `--agent` flag emits NDJSON, one JSON object per line, oriented around a whole objective rather than a single verb. You get progress events as it goes:

```bash
browserbash run "Search for 'wireless mouse', open the first result, and report its price" --agent
```

Each step arrives as `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. Exit codes map cleanly: `0` passed, `1` failed, `2` error, `3` timeout. There is no prose to parse, which is the point — a CI job or a coding agent consumes the stream directly. If your CI or your AI assistant needs to *know* whether a flow worked, not just that some verbs ran, the run-level verdict is the more natural fit. The [tutorials](https://browserbash.com/tutorials) walk through wiring this into a pipeline.

This is also where the two tools can genuinely complement each other. An advanced agent could use agent-browser for surgical, deterministic steps and reach for an objective-level run when it wants to delegate a whole flow and get back a verdict. They are not mutually exclusive religions.

## Committable tests, recording, and the run store

Beyond the live driving, BrowserBash carries some artifacts agent-browser does not advertise as first-class features, and these tend to matter once you move past one-off scripts.

Markdown tests are committable spec files (`*_test.md`) where each list item is a step. They support `{{variables}}` templating and `@import` composition, so you can build a library of reusable flows. Secret-marked variables are masked as `*****` in every log line, which is the difference between a log you can paste into a ticket and one you cannot. After each run, BrowserBash writes a human-readable `Result.md`. You run them with:

```bash
browserbash testmd run ./login_test.md
```

For evidence, `--record` captures a screenshot and a `.webm` session video using a bundled ffmpeg, and on the builtin engine it also writes a Playwright trace you can open in the standard trace viewer. agent-browser has trace start/stop too, so traces are a shared capability; the bundled video recording is the BrowserBash-specific piece.

Every run is also kept on disk at `~/.browserbash/runs` with secrets masked, capped at 200 runs, so you have a local history without opting into anything cloud. If you want a UI over that, `browserbash dashboard` opens a fully local dashboard at localhost:4477 (`--clear` wipes the store). There is an optional cloud dashboard too — `browserbash connect --key bb_...` links it, and then `--upload` pushes a specific run; without `--upload`, nothing leaves your machine, and free cloud runs are kept 15 days. The default posture is local-first, which lines up with the offline, $0-model-bill story. You can dig into real examples on the [BrowserBash blog](https://browserbash.com/blog) and the [case study](https://browserbash.com/case-study).

## Which one should you choose?

Let me make this concrete and balanced, because both tools are good and the wrong recommendation wastes your time.

### Choose agent-browser when

- You want a **low-level, deterministic driver** and you are bringing your own agent or writing your own orchestration. The ref model gives you exact, inspectable control.
- You need **iOS Simulator or real-device Safari** testing. This is a documented agent-browser strength that BrowserBash does not match.
- You want **granular network interception and request mocking** as a core part of the workflow.
- Raw **per-verb speed** from the Rust binary matters to your loop, and you are fine supplying the reasoning layer yourself.
- You are already deep in the Vercel ecosystem and want a tool that fits that grain.

### Choose BrowserBash when

- You want to **express intent in plain English** and have the agent, engine, and browser ship in one tool — no orchestration layer to build.
- You want a **run-level verdict** (passed/failed/error/timeout with exit codes) for CI or a coding agent, not just per-command JSON.
- You care about a **$0 model bill and offline operation** via local Ollama, with the option to escalate to a hosted model for hard flows.
- You want **committable markdown tests**, automatic **video recording**, and a **local run store and dashboard** out of the box.
- You want to run the same objective across **local, CDP, LambdaTest, BrowserStack, or Browserbase** by changing one flag.

### Be honest with yourself about the model

If you go the BrowserBash route on local models, remember the caveat: a tiny model will struggle on long flows. Start with a mid-size local model or a capable hosted one for anything with more than a handful of steps, and use small local models for short, well-scoped objectives where they are reliable and free. That single decision determines most of your day-one experience. The [learn hub](https://browserbash.com/learn) has guidance on matching models to flow complexity.

## A realistic migration sketch

Say you have a handful of agent-browser sequences your coding agent generates for smoke checks, and you want to try the natural-language approach without ripping anything out. You do not have to migrate; you can run them side by side.

Take one existing ref sequence — open, snapshot, fill, fill, click, wait, assert — and rewrite the *intent* as a BrowserBash objective:

```bash
browserbash run "Open the staging login page, sign in as the demo user, and verify the orders table loads with at least one row" --record --agent
```

Run it locally against your own Chrome with a local model first. If the flow is short and the model is capable enough, you will get a clean verdict and a `.webm` to attach to a ticket. If it is a long, finicky flow, pin a stronger model with `--model` and re-run. Keep agent-browser for the surgical, deterministic steps where you want ref-level control. The two coexist fine because they operate at different altitudes, and you can let real usage tell you which flows belong at which level rather than committing up front.

## FAQ

### Is agent-browser the same as BrowserBash?

No. agent-browser is a Vercel Labs CLI that drives a browser through deterministic ref-based commands and selectors, and it does not include an AI agent — you supply the reasoning. BrowserBash is a CLI from The Testing Academy that takes a plain-English objective and runs its own bundled agent loop to complete it and return a verdict. Both are Apache-2.0 and both drive a real Chromium, but they sit at different layers.

### Can I use natural language instead of @e1-style refs?

Yes — that is the core of the BrowserBash approach. Instead of snapshotting a page and acting on refs like `@e1`, you write the objective in English and the agent decides which elements to interact with internally. agent-browser, by contrast, is built around refs and selectors, so it expects you or your agent to choose the targets explicitly.

### Does BrowserBash cost money to run?

The CLI is free and open-source, and no account is needed to run it. On local Ollama models nothing leaves your machine and your model bill is genuinely $0. If you choose a hosted model like Claude or GPT, you pay that provider's usage directly; the optional cloud dashboard is opt-in and free cloud runs are kept for 15 days.

### Which is better for CI pipelines?

It depends on what you need from the output. agent-browser's `--json` gives precise per-command results, which suits an agent composing its own verb sequence. BrowserBash's `--agent` NDJSON stream plus clean exit codes (0 passed, 1 failed, 2 error, 3 timeout) gives a run-level verdict for a whole objective, which is usually the more natural fit when a pipeline needs to know whether a flow actually worked end to end.

## Try BrowserBash

If the natural-language angle fits how you want to work, it takes one command to start:

```bash
npm install -g browserbash-cli
```

Write an objective, run it against your own Chrome, and read the verdict. No account required — though if you want the optional cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up). And if agent-browser's ref-level control is what your workflow actually needs, use that. Picking the right altitude beats picking the louder tool.
