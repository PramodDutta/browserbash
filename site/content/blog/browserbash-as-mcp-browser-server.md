---
title: Using BrowserBash as a Browser Tool for MCP Agents
description: "Wire BrowserBash into your browser automation MCP server stack so Claude Code or Cursor can drive a real Chrome via CDP and NDJSON, then act on the verdict."
date: 2026-03-17
category: agents
---

Your agent can read the diff. It can write the fix. What it cannot do, on its own, is open a browser and confirm the thing actually works. That last mile is where a **browser automation MCP server** earns its keep: it hands a coding agent like Claude Code or Cursor a tool it can *call* — one that drives a real Chrome, performs a flow the way a user would, and returns a result the agent can branch on without parsing English. This article shows how to wire BrowserBash into that stack using CDP and NDJSON, so the browser runs where you want it and the agent gets a structured verdict instead of a vibe.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome step by step — no selectors, no page objects — and you get back a pass/fail verdict plus structured extracted values. That shape happens to be exactly what an MCP tool wants to expose. The trick is connecting the two cleanly, and the two pieces that make it clean are the `cdp` provider (point at any DevTools endpoint) and `--agent` mode (machine-readable NDJSON, no prose to scrape).

## What "browser automation MCP server" actually means

The Model Context Protocol is an open standard for connecting LLMs to external tools and data. An MCP *server* exposes a set of tools — each with a name, a description, and a JSON schema — and an MCP *client* (Claude Code, Cursor, Cline, Claude Desktop, and a growing list of others) lets the model discover those tools via `tools/list` and invoke them via `tools/call`. The server validates the input, runs the underlying action, and returns a structured result the model can reason over.

A *browser* MCP server is just that pattern aimed at a web page. The agent asks the server to navigate, click, read the DOM, or verify a flow; the server drives a real or headless browser and reports back. There are several well-known implementations as of 2026:

- **Playwright MCP** (Microsoft, Apache-2.0) drives a browser through Playwright and returns accessibility-tree snapshots — structured text rather than screenshots — so no vision model is needed. You run it locally with `npx`, no key, no hosted tier.
- **Chrome DevTools MCP** (the Chrome team, open-source) exposes the full Chrome DevTools Protocol surface to an agent: inspect pages, read console logs, capture network requests, run performance traces. It's built on Puppeteer and talks CDP under the hood.
- **Vendor browser MCPs** from cloud browser providers expose a hosted Chromium over CDP to MCP clients.

These are genuinely good tools, and for a lot of work they're the right answer. They're also *primitive-level*: they hand the agent a toolbox of low-level actions (click this ref, type into that field, snapshot the tree) and let the model orchestrate the sequence itself, one tool call at a time. That's powerful and flexible. It also means the agent is doing the step-by-step reasoning, burning tokens and context on every micro-action, and you're trusting it to assemble a correct sequence and then *judge its own result*.

BrowserBash sits at a different altitude, and that difference is the whole point of this article.

## Where BrowserBash fits: a verdict, not a toolbox

The primitive MCP servers give your agent a steering wheel and pedals. BrowserBash gives it a destination and a driver. You hand over one plain-English objective — "log in as the test user and confirm the dashboard shows the welcome banner" — and a separate agent inside BrowserBash drives the browser end to end, then returns a single verdict and the values it extracted along the way.

That has three practical consequences when you're building or assembling an agent stack:

1. **The outer agent stays cheap and focused.** Instead of the model spending dozens of tool calls and a few thousand tokens of context micromanaging clicks, it makes one call: "verify this flow." The browser reasoning happens inside BrowserBash, against whatever model you point it at — including a free local one. Your Claude Code or Cursor session keeps its context window for the code.
2. **You get an honest verdict, not self-assessment.** When the same agent that performed the steps also decides whether it passed, "success" tends to mean "I finished my plan," not "the user-facing flow worked." A separate verification call returns `passed` / `failed` / `error` / `timeout` as an exit code and an NDJSON line. There's nothing to interpret, so there's nothing to hallucinate.
3. **The objective is committable.** Because the input is English (or a markdown test file), the verification lives in your repo next to the code, not buried in a transcript. Anyone — agent or human — can re-run it.

So the two approaches aren't really competitors. A primitive browser MCP is great when the agent needs to *explore* a page or do fine-grained interactive debugging. BrowserBash is great when the agent needs to *verify a known flow* and move on. Plenty of stacks want both: DevTools MCP for poking around, BrowserBash for the binary "does the checkout still complete" gate. More on that split in the decision section below.

## The two features that make BrowserBash MCP-friendly

BrowserBash wasn't built as an MCP server. It's a CLI. But two of its features make wrapping it — or shelling out to it from an MCP tool — almost trivial.

### `--agent` mode: NDJSON instead of prose

Run any objective with `--agent` and BrowserBash stops printing human-readable progress and starts emitting NDJSON — one JSON object per line on stdout. Progress events look like this:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened the login page"}
```

And the run terminates with a single summary object:

```json
{"type":"run_end","status":"passed","summary":"Logged in and saw the dashboard","final_state":{"dashboard_visible":true},"duration_ms":18420}
```

Exit codes mirror the status: `0` passed, `1` failed, `2` error, `3` timeout. That's the contract an MCP tool wraps. No regex over English, no log-format fragility — the wrapper reads lines, parses JSON, and returns `final_state` plus the status to the calling agent. This is the same pattern the broader ecosystem uses to turn CLIs into agent tools: spawn the subprocess, read structured stream output line by line, relay parsed results back through the protocol.

### The `cdp` provider: run the browser anywhere

By default BrowserBash uses the `local` provider — your own Chrome on the machine running the CLI. But pass `--provider cdp --cdp-endpoint ws://...` and it attaches to *any* DevTools endpoint over a WebSocket. That's the seam that lets you decouple "where the agent thinks" from "where the browser runs."

This matters a lot for MCP stacks, because the browser is rarely sitting in the same place as the agent. Common shapes:

- A Chrome you launched with `--remote-debugging-port=9222` so the agent reuses an authenticated, logged-in session instead of starting cold.
- A containerized Chromium in CI exposing a CDP socket, so the MCP tool runs in a clean, reproducible environment.
- A cloud browser endpoint that speaks CDP, when you need a specific OS/browser matrix you can't host locally.

CDP is Chrome's native debugger interface — a set of APIs that expose a running Chromium over a WebSocket so external tools can open tabs, evaluate JavaScript, intercept network, and capture screenshots. It's the same low-level protocol Playwright MCP and Chrome DevTools MCP build on. BrowserBash speaking CDP means it slots into the exact same browser infrastructure you may already have stood up for those tools.

## Wiring it up: BrowserBash behind an MCP tool

You have two clean integration paths, and which one you pick depends on whether your client can run shell commands directly or needs a formal MCP server.

### Path A: the agent shells out to the CLI

Claude Code and Cursor can both run terminal commands. If your agent already has a Bash tool, the simplest "browser tool" is a documented command in your project instructions: tell the agent that to verify a browser flow, it should run BrowserBash in agent mode and read the final NDJSON line.

```bash
browserbash run "log in as the test user and confirm the dashboard welcome banner is visible" \
  --agent \
  --provider cdp \
  --cdp-endpoint ws://127.0.0.1:9222/devtools/browser/abc123 \
  --timeout 90
```

The agent runs it, parses the `run_end` object, checks the exit code, and branches: green means move on, red means read `summary` and `final_state`, then go fix the code. This isn't a "real" MCP server, but functionally it gives the agent the same thing — a callable browser tool with a structured verdict — with zero extra infrastructure. For a lot of solo and small-team workflows, this is all you need.

### Path B: a thin MCP server that wraps the CLI

If you want a first-class tool that shows up in `tools/list` for every MCP client (including ones without shell access), write a small server that exposes one tool — call it `verify_browser_flow` — with a JSON schema like `{ objective: string, cdp_endpoint?: string, timeout?: number }`. Inside the handler, spawn BrowserBash with `--agent`, read stdout line by line, keep the last `run_end` object, and return its `status` and `final_state` as the tool result. Map the exit code into the response so the model gets an unambiguous pass/fail.

The wrapper stays thin on purpose. All the brittle parts — driving the browser, healing selectors, deciding what "logged in" looks like — live inside BrowserBash. The MCP layer is just translation: tool call in, NDJSON out, structured result back. That's the canonical "wrap a CLI as an MCP tool" shape, and it's why the `--agent` contract was designed the way it was.

A minimal end-to-end run the server would invoke looks like this:

```bash
browserbash run "search for 'noise-cancelling headphones', open the first result, and extract the price" \
  --agent \
  --record \
  --timeout 120
```

`--record` captures a screenshot plus a `.webm` session video via bundled ffmpeg (and on the builtin engine, a Playwright trace), so when a verification fails the agent — or you — has an artifact to inspect instead of a guess. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200), which doubles as an audit trail for what the agent actually did.

## Choosing the engine and the model for an agent stack

Two configuration choices shape how BrowserBash behaves as a tool, and both have sensible defaults you can override per run.

### Engines: who interprets the English

BrowserBash ships two engines. The default is **Stagehand** (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when the page shifts — a good fit for verification flows that need to survive UI churn. The alternative is **builtin**, an in-repo Anthropic tool-use loop driving Playwright; it's used automatically for LambdaTest and BrowserStack providers and writes a Playwright trace when you `--record`. Switch with `--engine stagehand|builtin`. For most MCP wiring you can leave the default alone.

### Models: Ollama-first, $0 by default

This is the part that changes the economics of an agent stack. BrowserBash's default model is `auto`, resolved in this order:

1. A local **Ollama** model → `ollama/<model>`. Free, no keys, and nothing leaves your machine.
2. `ANTHROPIC_API_KEY` set → `claude-opus-4-8`.
3. `OPENAI_API_KEY` set → `openai/gpt-4.1`.
4. Otherwise, an error with guidance.

That ordering means your verification tool can run on a guaranteed $0 model bill while your outer coding agent spends its (often metered) tokens on the actual code. The browser reasoning is offloaded to a local model entirely under your control.

One honest caveat, because it'll bite you otherwise: very small local models (8B and under) are flaky on long, multi-step objectives. They'll nail "open this page and read the heading" and then lose the plot on a five-step checkout. The sweet spot for serious local verification is a mid-size model — Qwen3 or a Llama 3.3 70B-class model — or a capable hosted model for the genuinely hard flows. Pin it explicitly when it matters:

```bash
browserbash run "complete checkout with the test card and confirm the order number appears" \
  --agent \
  --model ollama/qwen3 \
  --provider cdp \
  --cdp-endpoint ws://127.0.0.1:9222/devtools/browser/abc123
```

You can also pin a hosted model directly (`--model claude-opus-4-8`, `--model openai/gpt-4.1`, `--model google/gemini-2.5-flash`), route through OpenRouter (`--model openrouter/meta-llama/llama-3.3-70b-instruct` with `OPENROUTER_API_KEY`), or point at an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`.

## BrowserBash vs primitive browser MCP servers

Here's the honest comparison. None of these tools is strictly "better" — they sit at different altitudes and solve different problems.

| Dimension | BrowserBash (`--agent` + CDP) | Playwright MCP | Chrome DevTools MCP |
| --- | --- | --- | --- |
| License | Apache-2.0 | Apache-2.0 | Open-source |
| Granularity | One objective → verdict | Per-action primitives | Per-action primitives + DevTools |
| Agent input | Plain-English objective | Tool calls (click/type/snapshot) | Tool calls (CDP-level) |
| Who orchestrates steps | BrowserBash's internal agent | The calling model | The calling model |
| Result shape | Pass/fail + structured `final_state` | Accessibility snapshots, action results | DOM, console, network, traces |
| Real browser | Yes (local Chrome or any CDP) | Yes | Yes (Chrome via CDP) |
| Model required | Yes — but Ollama-first, $0 local default | None for snapshots (vision-free) | None for the protocol itself |
| Self-healing | Yes (Stagehand engine) | Via accessibility refs | Not its focus |
| Native MCP server | No — wrap the CLI (`--agent`) | Yes | Yes |
| Best at | Verifying a known flow, returning a verdict | Fine-grained interactive automation | Live debugging, perf, network inspection |

Read that table as complementary, not as a leaderboard. Where Playwright MCP and Chrome DevTools MCP win is **interactive, exploratory, fine-grained** work — the agent needs to poke at the DOM, read a console error, profile a slow page, or assemble a bespoke sequence it can't pre-describe. They're also native MCP servers, so there's no wrapping step. If your primary need is "let the agent freely drive and inspect a browser," reach for those.

Where BrowserBash wins is **verification and extraction at the flow level** — "does this end-to-end journey still work, and what value did it produce" — with a committable English objective, a structured verdict, and a local-model path that keeps the bill at zero. If your primary need is a reliable pass/fail gate the agent calls and acts on, that's BrowserBash's lane.

## When to choose which

A few concrete situations, because the abstract version only gets you so far.

**Choose a BrowserBash-backed tool when:**

- You want the agent to *verify* a flow it just changed and branch on a clean exit code, not narrate its way to a conclusion.
- You care about model cost and want browser reasoning on a free local model while your coding agent's tokens go to code.
- You want the verification committed to the repo as plain English or a markdown test, so it's reviewable and re-runnable by anyone.
- You're attaching to an already-authenticated Chrome over CDP and want one call to drive the whole journey.

**Choose a primitive browser MCP (Playwright / Chrome DevTools) when:**

- The agent needs to explore an unfamiliar page interactively or do step-by-step debugging.
- You want a native MCP server with zero wrapping, and you're comfortable letting the model orchestrate every action.
- You need DevTools-grade signals — performance traces, network waterfalls, Lighthouse — that a flow-level verdict doesn't surface.

**Run both when** your stack does serious agentic development: DevTools MCP (or Playwright MCP) for exploration and debugging, and a BrowserBash verification tool as the gate that decides whether a change is actually safe to ship. They share the same CDP browser infrastructure, so this isn't double the setup — it's two tools pointed at one Chrome.

There's a deeper write-up of the verification-gate idea over on the [BrowserBash blog](https://browserbash.com/blog), and the full flag surface lives in the [features](https://browserbash.com/features) reference if you want to confirm a flag exists before you bake it into a wrapper.

## A worked example: the verify-and-fix loop

Put the pieces together and you get a loop that runs without a human in the critical path. Say Cursor just refactored your sign-in component. With a BrowserBash tool wired in, the sequence is:

1. Cursor writes the change.
2. Cursor calls the browser tool with the objective: *"go to /login, sign in as test@example.com, and confirm the URL is /dashboard and the welcome banner shows the user's name."*
3. The tool runs BrowserBash with `--agent` against your local CDP Chrome, on a local Qwen3 model.
4. BrowserBash drives the real browser, returns `{"type":"run_end","status":"failed","summary":"Landed on /login after submit; banner not found","final_state":{"final_url":"/login"}}` and exit code `1`.
5. Cursor reads the structured failure — not a screenshot it has to interpret, an actual `final_url` — sees the redirect bounced, and goes back to fix the form handler.
6. Re-run. Green this time. Move on.

The committable version uses a markdown test instead of an inline objective. BrowserBash's `testmd` runner takes a `*_test.md` file where each list item is a step, supports `{{variables}}` templating and `@import` composition, masks secret-marked variables as `*****` in every log line, and writes a human-readable `Result.md` after each run:

```bash
browserbash testmd run ./login_flow_test.md --agent
```

That file lives in the repo. The agent runs it, CI runs it, you run it — same objective, same verdict shape every time. The `--agent` flag keeps the output machine-readable for the automated callers; drop it when a human wants to read along.

## Privacy, dashboards, and keeping it local

A reasonable worry with any agent tool is what leaves your machine. With BrowserBash on a local Ollama model and the `local` or `cdp` provider, the answer is nothing — the model runs locally, the browser runs locally, and the run store stays on disk at `~/.browserbash/runs` with secrets masked.

There's an optional, fully local dashboard if you want to *see* what the agent's verification tool has been doing: `browserbash dashboard` serves it at `localhost:4477`, no account, no upload. It's handy when a wrapped tool fails intermittently and you want to scrub through the recorded runs.

```bash
browserbash dashboard
```

If you *do* want a shareable cloud view — say, to send a teammate a failing run — that's strictly opt-in. You link your machine once with `browserbash connect --key bb_...` and then add `--upload` to the specific runs you want pushed; free cloud runs are kept 15 days. Without `--upload`, nothing leaves your machine, full stop. That opt-in-per-run design is deliberate: an agent calling the tool a hundred times a day shouldn't be silently shipping every run to a server. Pricing for the cloud side, if you go there, is on the [pricing page](https://browserbash.com/pricing).

If you're newer to the natural-language approach, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections walk through writing good objectives — which, it turns out, is most of the skill in getting reliable verdicts out of any model.

## Getting started

The fastest way to see whether BrowserBash belongs in your agent stack is to skip the MCP wrapper at first and just run it by hand. Install it, point it at a flow you care about, and watch the NDJSON come out:

```bash
npm install -g browserbash-cli
browserbash run "open example.com and confirm the page heading contains 'Example'" --agent
```

Requires Node 18+ and Chrome for the local provider. Once you trust the verdict, decide between Path A (document the command for your agent) and Path B (a thin MCP server), point `--provider cdp` at whatever browser you want it driving, and you've got a browser tool your agent can call and act on. The package is on [npm](https://www.npmjs.com/package/browserbash-cli) and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly how the `--agent` contract is emitted before you build against it.

## FAQ

### Is BrowserBash a native MCP server?

No. BrowserBash is a command-line tool, not an MCP server out of the box. You expose it to MCP clients in one of two ways: let the agent shell out to the `browserbash run ... --agent` command directly, or write a thin MCP server that wraps the CLI and returns its NDJSON result as a structured tool response. The `--agent` flag emits one JSON object per line plus a clean exit code, which is exactly the contract a wrapper needs.

### How is this different from Playwright MCP or Chrome DevTools MCP?

Those are primitive-level browser MCP servers — they give the agent low-level actions (click, type, snapshot, read console) and the model orchestrates the sequence itself. BrowserBash works at the flow level: you give it one plain-English objective, its internal agent drives the whole journey, and it returns a single pass/fail verdict plus extracted values. They're complementary. Use the primitives for interactive exploration and debugging, and BrowserBash for verifying a known flow and getting a verdict the agent can branch on.

### Where does the browser actually run when an agent calls BrowserBash?

Wherever you point it. The default `local` provider uses the Chrome on the machine running the CLI. Pass `--provider cdp --cdp-endpoint ws://...` and it attaches to any Chrome DevTools Protocol endpoint over a WebSocket — a Chrome you launched with remote debugging, a containerized Chromium in CI, or a CDP-speaking cloud browser. That CDP seam is the same protocol Playwright MCP and Chrome DevTools MCP build on, so BrowserBash slots into browser infrastructure you may already run.

### Does using BrowserBash as an agent tool cost money?

The model bill can be zero. BrowserBash defaults to an Ollama-first `auto` model, so if you have a local model installed it runs on that — free, no API keys, and nothing leaves your machine. Very small local models (8B and under) struggle with long multi-step flows, so use a mid-size local model like Qwen3 or a Llama 3.3 70B-class model, or a capable hosted model, for the hard verifications. The optional local dashboard and the on-disk run store are also free; only the opt-in cloud upload involves an account.

Ready to give your agent a browser it can drive and a verdict it can trust? Install it with `npm install -g browserbash-cli` and start with a single objective — an account is optional, and you can [sign up](https://browserbash.com/sign-up) later only if you want the cloud dashboard.
