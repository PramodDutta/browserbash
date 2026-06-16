---
title: Playwright MCP vs browser-use: Agent Tooling Compared
description: "Playwright MCP vs browser-use compared for LLM browser control — MCP tools vs a Python agent, plus BrowserBash as a CLI with NDJSON and exit codes."
date: 2026-05-30
category: comparison
---

If you are giving a language model the ability to drive a real browser this year, two projects show up in almost every shortlist. The Playwright MCP vs browser-use question is the one most teams hit first, because the two represent genuinely different bets on how an LLM should control a page. Playwright MCP exposes browser actions to a model as discrete tools over the Model Context Protocol. browser-use hands the model a task and an autonomous loop, written as a Python library you embed. Both are open source, both are widely used, and neither is "better" in the abstract. The right pick depends on who is driving the browser, where your code lives, and how you find out whether a run actually worked.

I'll keep this honest. I have shipped browser automation that has to pass in CI, and I have wired LLMs to pages both ways. Where I make a claim about either project, it sticks to publicly documented behavior or to design choices that follow directly from how each tool is built. Where something is not public, I'll say "not publicly specified" and move on rather than invent a number. At the end I'll show where BrowserBash fits — a standalone CLI with an NDJSON agent mode and exit codes — because it solves a slightly different problem than either of these, and the contrast is the clearest way to explain all three.

## What Playwright MCP and browser-use actually are

Before comparing them, it helps to define them precisely, because a lot of confusion comes from treating "tools for a model" and "an agent library" as the same thing. They are not.

**Playwright MCP** is a Model Context Protocol server maintained by the Playwright team at Microsoft. It exposes browser automation as a set of MCP tools backed by Playwright's engine. An MCP-capable host — Claude Desktop, Claude Code, Cursor, VS Code, and a growing list of others — connects to it, and the model gains a toolbox: navigate to a URL, click an element, type into a field, take an accessibility snapshot of the page, and so on. A notable design choice is that it leans on the accessibility tree rather than screenshots, so the model reasons over structured page state instead of pixels. That tends to be fast and token-efficient. Critically, Playwright MCP does not contain an agent. It is a capability surface. The intelligence — the decision about what to click next — lives entirely in whatever host LLM is connected to it.

**browser-use** is an open-source Python framework for giving an LLM end-to-end control of a browser. You install it with pip, instantiate an agent with a task string and a model client, and let it run. The library owns the perception-action loop: it reads the page's interactive elements, serializes them for the model, executes whatever action the model picks — click, type, scroll, navigate, extract — and loops until the task is done or it gives up. The design philosophy is autonomy. You describe a goal in natural language and the agent owns the whole journey. Unlike Playwright MCP, browser-use *is* the agent loop. You bring a model and a task; it brings the orchestration.

The shortest way to frame the difference: **Playwright MCP is a toolbox with no driver; browser-use is a driver you embed in your own program.** One assumes an external model will do the deciding. The other does the deciding for you, in process, in Python.

## The core architectural difference: where the loop lives

Almost every practical tradeoff between these two flows from a single question: where does the agent loop live?

With **Playwright MCP**, the loop lives in the host LLM. Your model is the orchestrator. It calls `browser_snapshot`, the page state comes back into its context window, it reasons, it calls `browser_click`, and around it goes. That is powerful and transparent — the model sees everything, every step, and you can watch it think. But it also means the browser session is only as good as the model driving it, and every page snapshot consumes context. You also need an MCP host to use it at all. Playwright MCP is fundamentally a component inside an agentic conversation; on its own, from a plain shell, it does nothing.

With **browser-use**, the loop lives inside the library. You write Python that constructs an agent, passes it a task and a model client, and calls `run()`. From there, browser-use reads the page, asks the model what to do, performs the action, and repeats — all inside your process. Your code is not in that loop turn by turn; it kicks off the agent and waits for a result object. That makes browser-use usable without any MCP host. It is a library you import. The cost is that you are writing and maintaining a program: a model client, an entry point, result handling, error paths, retries.

So the fork is real and it is architectural. Playwright MCP needs an external brain and gives you fine-grained, observable control. browser-use brings its own brain and gives you a one-call-and-wait ergonomic, at the price of code you own. Hold that fork in your head; everything below follows from it.

## Side-by-side comparison

The table sticks to characteristics that are publicly documented or follow directly from each project's design. Where something is not public, it says so rather than guess. Both projects move quickly, so treat any specific feature as "as of 2026" and check the current docs before you commit.

| Dimension | Playwright MCP | browser-use |
| --- | --- | --- |
| What it is | MCP server exposing browser tools | Python agent library with its own loop |
| Maintainer | Playwright team (Microsoft) | browser-use project |
| License | Open source (Apache-2.0) | Open source (MIT) |
| Where the agent loop lives | In the host LLM | Inside the library, in your process |
| How you invoke it | An MCP host connects and the model calls tools | You write Python and call the agent |
| Page perception | Accessibility tree / structured snapshot | Reads interactive elements, serializes for the model |
| Needs an MCP host | Yes | No |
| Needs you to write code | No (you write prompts in a host) | Yes (you write a Python program) |
| Browser engine | Playwright (cross-browser) | Real browser via its own driver |
| Model providers | Whatever the host LLM is | Multiple LLM providers you wire in |
| Determinism | Low — model re-plans each turn | Low — autonomous agent re-plans each step |
| Natural home | AI IDEs and agentic chat | Custom Python automations and RPA |
| Runs from a bare terminal as a verdict | No | No (you build that yourself) |

Two rows deserve a caveat. First, "model providers" for Playwright MCP is whatever your host happens to use — Claude in Claude Code, whatever Cursor is configured with, and so on. The server itself is model-agnostic because it never calls a model; the host does. Second, the last row is the one most people overlook. Neither tool, out of the box, gives you a single command that returns "passed" or "failed" with a process exit code. Playwright MCP gives a model tools. browser-use gives you a library to build with. If what you actually wanted was to verify that a login page still works and gate a pipeline on the answer, you have more assembly ahead of you than either landing page suggests. That gap is exactly where a CLI like BrowserBash lives, and I'll get there.

## When to choose Playwright MCP

Playwright MCP shines in a specific, increasingly common situation: you are inside an AI IDE or an agentic chat, and you want your assistant to poke at a web app while you work.

Picture the scenario. You are in Claude Code or Cursor, debugging a checkout flow. You want the assistant to open the page, try the broken path, read back what it sees, and reason about the failure with you in the loop. Playwright MCP is purpose-built for that. The model drives the browser turn by turn, narrates what it finds, and you stay in the conversation the whole time. Because it uses the accessibility tree, the model gets clean structured state rather than having to interpret screenshots, which keeps latency and token use sane. And because the loop lives in the model, you get full transparency — you can see every decision, redirect mid-flow, and learn things about the page you would have missed in a one-shot automation.

Choose Playwright MCP when:

- You already work inside an MCP host (Claude Desktop, Claude Code, Cursor, VS Code).
- The work is exploratory — debugging, reverse-engineering a flow, "poke at this and tell me what breaks."
- You want the model's full reasoning visible and steerable, step by step.
- Cross-browser coverage from Playwright's mature engine matters to you.
- You do not need a stable machine-readable verdict at the end; a conversation is the deliverable.

Where Playwright MCP is *not* the right tool: anything headless and unattended. There is no MCP host in a cron job. A GitHub Actions runner is not going to hold an agentic conversation. The moment your use case is "run this on a schedule and tell a pipeline yes or no," the MCP-server-plus-interactive-host shape stops fitting, because the whole model assumes a live LLM host is driving.

## When to choose browser-use

browser-use is the better fit when you are building a custom automation in Python and the task is open-ended enough that you genuinely cannot enumerate the steps in advance.

The classic case is research-style or RPA-style work over sites you do not control. "Go to this supplier portal, find the current price for SKU X, and pull the lead time." You cannot write a deterministic script for that across dozens of vendor sites with different layouts, but an autonomous agent that re-reads each page and decides what to do next can handle the variance. browser-use is designed for exactly this: hand it a goal, let it own the journey, get back a result. Because it is a library, it slots naturally into a larger Python application — a data pipeline, a backend job, an internal tool — where you want the agent as one component among many that you control programmatically.

Choose browser-use when:

- You are building in Python and want the agent embedded in your own program.
- The task is open-ended and hard to enumerate — the steps vary run to run.
- You want autonomy: one task string, the agent owns the whole flow.
- You are comfortable owning the surrounding code: model wiring, error handling, output parsing.
- You do not need an MCP host and would rather not run one.

Where browser-use is *not* ideal: when the flow is actually a known, repeatable sequence that you need to run reliably hundreds of times. Full autonomy buys flexibility at the cost of predictability, and for a stable regression flow that predictability is the thing you most want. It is also not ideal when you do not want to write and maintain a program at all — when the honest answer to "how much code do you want to own?" is "as little as possible."

## Reliability in practice: what actually breaks

Anyone who has run AI browser agents past the demo stage knows the failure modes are not where the marketing suggests. "Reliability" is too vague to act on, so let me be specific.

Both of these tools inherit the central risk of autonomous, model-driven browsing: **drift on long flows**. The agent — whether it is the host LLM driving Playwright MCP tools, or the model inside browser-use's loop — misreads the page state, takes a plausible-but-wrong action, then spends several more steps trying to recover. Sometimes it succeeds. Sometimes it loops until it times out. On a long multi-step objective, the probability of at least one wrong turn compounds with each step, so a twelve-step checkout is meaningfully riskier than a four-step smoke test. This is not a knock on either project. It is the nature of letting a model decide what to click next.

The two differ in *where the variance is visible*. With Playwright MCP, you can watch it happen — the model narrates every tool call, so when it drifts you see the wrong decision in the transcript and can intervene. That observability is a genuine advantage during interactive debugging. With browser-use, the loop runs inside the library, so the drift is less visible in real time; you see it in the final result and the logs. Neither is "more reliable" in a deep sense — both depend on the model — but the interactive one surfaces problems sooner, while the library one is easier to run unattended and inspect afterward.

There is a model-size dimension worth being blunt about, because it cuts across all three tools in this article. Very small local models — roughly 8B parameters and under — are genuinely flaky on long, multi-step objectives regardless of framework. They will nail a three-step login and then fall apart on a ten-step checkout. The sweet spot for reliable runs is a mid-size model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If anyone tells you an 8B model autonomously completes complex checkouts every single time, be skeptical. This is true for Playwright MCP's host model, true for browser-use's agent, and true for anything built on top of either. You can read more about matching model size to flow complexity on the [BrowserBash learn pages](https://browserbash.com/learn).

## The gap both leave open: a verdict you can gate on

Step back and notice what neither tool gives you directly. Playwright MCP gives a model a toolbox and assumes an interactive host. browser-use gives you a library and assumes you will write the program around it. Both are excellent at their jobs. But there is a third job that neither targets head-on: **run one browser objective from a plain shell and get back a machine-readable verdict you can gate a CI pipeline on.**

That sounds small until you try to build it. With Playwright MCP, you would need to stand up an MCP host, drive it programmatically, capture the conversation, and parse prose into a pass/fail signal — prose parsing being exactly the brittle thing you want to avoid in CI. With browser-use, you would write a Python entry point, wire a model client, define what "passed" means, serialize a result, and map it onto an exit code yourself. Both are doable. Both are also a project. If all you wanted was to answer "did login still work after my last deploy?" you have signed up for real engineering before you can write the first assertion.

This is the slot BrowserBash was built for.

## Where BrowserBash fits: a CLI with NDJSON agent mode and exit codes

BrowserBash is a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) command-line tool for natural-language browser automation, from The Testing Academy. You write an objective in plain English; an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and returns a verdict plus structured results. Where Playwright MCP is a tool surface and browser-use is a library, BrowserBash is a **binary you run from a shell**. That single packaging decision is the whole point.

```bash
npm install -g browserbash-cli

browserbash run "Log in with the demo account, add the first product to the cart, \
complete checkout, and verify the page shows 'Thank you for your order!'"
```

The loop lives inside the CLI. You issue one command; internally the chosen engine runs its own plan-act-observe cycle until the objective is met or a guardrail trips. Your caller is not in that loop — it waits for the process to exit and reads the result. That is the same encapsulation browser-use gives you, but without writing the program, and it works in environments where Playwright MCP cannot go because there is no MCP host involved.

The feature that matters most for the comparison is **agent mode**. Add `--agent` and BrowserBash emits NDJSON — one JSON event per line — on stdout, and maps the run's verdict onto process exit codes: `0` passed, `1` failed, `2` error, `3` timeout. No prose to parse. A CI step or an AI coding agent reads structured lines and branches on the exit code.

```bash
browserbash run "Sign in and confirm the dashboard loads" --agent --headless
echo "exit code: $?"   # 0 passed, 1 failed, 2 error, 3 timeout
```

That exit-code contract is precisely the thing you would have to build by hand on top of either Playwright MCP or browser-use. Here it is the default behavior of a tool you installed in one line. For AI coding agents specifically, this is the cleaner integration: an agent calls `browserbash ... --agent` as a `subprocess.run()`, checks the exit code, and reads NDJSON if it needs detail — no MCP host to stand up, no transcript to interpret.

### Models: Ollama-first, your choice

BrowserBash is Ollama-first. It defaults to free local models with no API keys, so nothing leaves your machine and you can guarantee a $0 model bill. It auto-resolves a local Ollama instance, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. It also speaks OpenRouter — including genuinely free hosted models such as `openai/gpt-oss-120b:free` — and Anthropic Claude if you bring your own key. The same honesty applies as above: stay local for short, well-scoped flows, and reach for a mid-size local model or a capable hosted model when the flow is long. The [features page](https://browserbash.com/features) lays out the full model story.

### Engines, providers, and recording

BrowserBash ships two engines: `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin` (an in-repo Anthropic tool-use loop). It also separates *where the browser runs* from the rest, switched with one `--provider` flag: `local` (the default, your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. So you can develop locally for free and fan the same objective out to a cross-browser grid without rewriting anything.

```bash
browserbash run "Open the pricing page and verify the Pro plan lists annual billing" \
  --provider lambdatest --record --upload
```

`--record` captures a screenshot and a full `.webm` session video via ffmpeg on any engine; the builtin engine additionally captures a Playwright trace you can open in the trace viewer. Runs stay local unless you opt in. There is a free, fully local dashboard via `browserbash dashboard`, and an optional free cloud dashboard with run history, video, and per-run replay via `browserbash connect` plus `--upload` (free uploaded runs are kept 15 days). No account is needed to run anything.

### Committable Markdown tests

For flows you want to keep, BrowserBash supports Markdown tests — committable `*_test.md` files where each list item is a step, with `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, which matters the moment a flow involves a password. It writes a human-readable `Result.md` after each run.

```bash
browserbash testmd run ./checkout_test.md \
  --var "user=demo@example.com" \
  --secret "password=hunter2"
```

This is something neither Playwright MCP nor browser-use targets directly: a plain-text, version-controlled test that a non-engineer can read and edit, that an AI runs, and that masks secrets in logs by default. If you want to see how these pieces fit a real suite, the [case study](https://browserbash.com/case-study) walks through one, and the [blog](https://browserbash.com/blog) has deeper tutorials on agent mode and CI.

## How the three relate, honestly

These tools are not strictly competitors. They overlap in capability but target different jobs, and the most useful thing I can tell you is when each is the right reach.

- **Reach for Playwright MCP** when you are inside an AI IDE and want your assistant to drive a browser interactively, with full visibility into every decision. It is the best fit for exploratory, in-the-loop work and inherits Playwright's mature cross-browser engine.
- **Reach for browser-use** when you are building a Python application and need an autonomous agent embedded in it for open-ended tasks you cannot script. It is the right primitive when the steps genuinely vary run to run and you are happy to own the surrounding code.
- **Reach for BrowserBash** when you want a single command that runs a browser objective and returns a verdict — NDJSON plus an exit code — with no MCP host and no program to write. It is built for CI and for AI coding agents that need a result, not a conversation, and it stays free and local by default.

And they can coexist. BrowserBash's `cdp` provider attaches to any DevTools endpoint, including a browser something else launched, so a session that started under one tool can be handed to another. The point of this comparison is not to crown a winner. It is to match the tool to the shape of your problem: an interactive toolbox, an embeddable autonomous library, or a one-shot CLI verdict. Pick the shape first, and the rest gets easy. If you want to try the CLI path, the [pricing page](https://browserbash.com/pricing) confirms the core tool is free and open source.

## FAQ

### Is Playwright MCP an agent or just a set of tools?

Playwright MCP is a set of tools, not an agent. It is a Model Context Protocol server that exposes browser actions — navigate, click, type, snapshot — to whatever LLM host connects to it. The decision-making lives entirely in that host model; the server itself never calls a model. That is the key difference from browser-use, which contains its own autonomous agent loop.

### Can I use Playwright MCP or browser-use in a CI pipeline?

Both can be used in CI, but neither gives you a one-command pass/fail verdict out of the box. Playwright MCP assumes an interactive MCP host, which a typical CI runner does not have, so you would script around it. browser-use is a Python library, so you would write an entry point and map results onto exit codes yourself. A CLI like BrowserBash is built for this directly: `--agent` emits NDJSON and returns exit code 0 for pass, 1 for fail, 2 for error, and 3 for timeout.

### Do I need API keys to run AI browser automation?

It depends on the tool and the model. Playwright MCP uses whatever model your host is configured with, so keys follow your host. browser-use requires you to wire up a model client, which usually means a key. BrowserBash is Ollama-first and defaults to free local models with no API keys, so you can run a complete browser automation with a $0 model bill, and add an Anthropic or OpenRouter key only if you want a hosted model.

### Which tool is best for an AI coding agent that needs to verify a web app?

For a coding agent that just needs to know "did my fix work," a CLI with a stable contract is usually the cleanest fit. The agent runs one command, checks the exit code, and reads NDJSON only if it needs detail — no MCP host to stand up and no transcript to parse. Playwright MCP is better when you want the assistant to explore a page interactively, and browser-use is better when you are building a larger Python automation around an autonomous agent.

Pick the shape that matches your problem, then ship. If you want the one-command, verdict-returning path, install BrowserBash with `npm install -g browserbash-cli` and run your first objective in under a minute — no account required. When you are ready for run history and replay, you can [sign up](https://browserbash.com/sign-up) for the optional free cloud dashboard, but it stays strictly opt-in.
