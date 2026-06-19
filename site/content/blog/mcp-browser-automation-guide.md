---
title: MCP and browser automation: a practical guide
description: "A practical guide to MCP browser automation: how MCP servers manage browsers, where CDP fits, and how BrowserBash composes with MCP-managed Chrome."
date: 2026-03-17
category: agents
---

If you have wired up a coding agent in the last year, you have probably bumped into MCP and at least one MCP server that drives a browser. MCP browser automation is now one of the most common ways people let an AI agent open a page, click around, and read what came back. The pattern works, but it leaves a real gap: the MCP server is great at giving an agent fine-grained browser control inside a chat, and far less good at giving you a repeatable, scriptable check you can run in CI or hand to a teammate. This guide explains what MCP actually is, how MCP-managed browsers expose themselves over the Chrome DevTools Protocol (CDP), and how a CLI like [BrowserBash](https://browserbash.com/features) composes with that same browser instead of fighting it.

I am going to be specific about mechanics, because the word "MCP" gets thrown around as if it were a single product. It is not. It is a protocol, a handful of competing server implementations, and a transport detail (CDP) that turns out to be the glue that lets these tools share one browser. Once you see those three layers clearly, the integration story stops being magic and becomes plumbing you can reason about.

## What MCP actually is (and what it is not)

The Model Context Protocol is an open standard, originally published by Anthropic in late 2024, for connecting AI assistants to external tools and data sources. An MCP **client** lives inside an agent host — Claude Desktop, Cursor, VS Code, Codex, Cline, Windsurf, and others. An MCP **server** is a separate process that exposes a set of tools, resources, and prompts over a defined wire format (JSON-RPC, typically over stdio or HTTP). The client discovers the server's tools at startup and the model can then call them by name with structured arguments.

That is the whole idea. MCP itself says nothing about browsers. It is a tool-calling contract. What makes "MCP browser automation" a thing is that several teams shipped MCP servers whose tools happen to be `navigate`, `click`, `type`, `snapshot`, and so on. The most prominent is Microsoft's official [Playwright MCP](https://github.com/microsoft/playwright-mcp), but there are many others — community Playwright servers, the Chrome DevTools MCP, Browserbase's hosted server, and more.

Two clarifications that save a lot of confusion:

- **MCP is not a browser.** It is the channel the agent uses to ask *something else* to drive a browser. The actual driving is done by Playwright, by raw CDP, or by a cloud provider behind the server.
- **MCP is not a test runner.** It gives an interactive agent step-by-step control. It does not, on its own, give you a committed artifact, a deterministic pass/fail exit code, or a run you can replay tomorrow. That distinction matters for anyone doing QA, and it is the gap BrowserBash is built to fill.

If you want the broader background on agents driving browsers, the BrowserBash [blog](https://browserbash.com/blog) has several pieces that go deeper on the agentic side.

## How MCP-managed browsers work under the hood

A browser-flavored MCP server has to solve two problems: how does the model perceive the page, and how does it act on it.

### Perception: accessibility tree, not pixels

Playwright MCP's headline design choice is that it does not feed screenshots to the model by default. When a tool runs, it returns a structured accessibility snapshot — a text representation of the page showing each element's role, its accessible name, and a stable reference id like `ref=e5`. The model reads that snapshot and decides "type into `ref=e5`, click `ref=e10`." Because the references are explicit and text-based, you avoid the ambiguity and cost of asking a vision model to find a button by pixel coordinates.

This is fast and surprisingly reliable for well-built pages, and it is why a lot of MCP browser work needs no vision model at all. The trade-off is that the accessibility tree can be large, which burns tokens. Microsoft shipped the Playwright CLI in early 2026 partly to address this — it writes compact YAML snapshots to disk instead of streaming the full tree, and their reporting put it at roughly 4x fewer tokens per session.

### Action: Playwright, then CDP underneath

When the model says "click `ref=e10`," the MCP server translates that into a Playwright call, and Playwright in turn talks to the browser over the Chrome DevTools Protocol. CDP is the low-level JSON-RPC interface Chrome and Chromium expose for instrumentation: navigation, input synthesis, DOM access, network interception, screenshots, the lot. Firefox and WebKit have their own protocols, but for the Chromium family, CDP is the substrate.

So the layering, top to bottom, looks like this:

```
Agent host (Cursor / Claude Desktop)
   └─ MCP client  ──JSON-RPC──>  MCP server (Playwright MCP)
                                    └─ Playwright  ──CDP──>  Chromium
```

The reason this matters for integration is the bottom arrow. CDP is not a private detail. It is a documented, network-accessible protocol, and that is exactly what lets a second tool attach to the very same browser.

## Where CDP fits — the integration seam

Here is the key fact that makes everything in this guide possible. When Chrome or Chromium is launched with `--remote-debugging-port=9222`, it starts a CDP server on that port. Two endpoints become available:

- An HTTP endpoint at `http://localhost:9222/json/version` that reports a `webSocketDebuggerUrl`.
- A WebSocket endpoint (the URL from above, like `ws://localhost:9222/devtools/browser/<id>`) that accepts CDP commands and emits events.

Any tool that speaks CDP can connect to that WebSocket and drive the browser. This is not a hack; it is how Playwright's own `connectOverCDP` works, and it is how Playwright MCP's `--cdp-endpoint` flag works in reverse — pointing the server *at* an already-running browser instead of launching its own.

Cloud browser providers do the same thing over the network. Browserbase, for example, hands you a CDP WebSocket URL of the shape `wss://connect.browserbase.com/v1/sessions/<session-id>?apiKey=<key>`. Cloudflare's Browser Run and several other "cloud browser MCP" providers expose CDP endpoints too. The session lives in their infrastructure; you get a `wss://` string that behaves like a remote `--remote-debugging-port`.

So whether the browser is on your laptop or in someone's cloud, the integration seam is the same: **a CDP endpoint URL**. If you can get that URL, you can attach a second tool to the running session. That is the entire basis for composing BrowserBash with an MCP-managed browser.

## How BrowserBash composes with MCP-managed browsers

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome step by step — no selectors, no page objects — and you get back a verdict plus structured extracted values. By default it launches your local Chrome (`--provider local`). But it also ships a `cdp` provider, and that is the bridge.

The relevant flag is on the `run` command:

```bash
browserbash run "verify the dashboard shows at least 3 active projects and extract their names" \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser/abc123
```

Point `--cdp-endpoint` at any DevTools WebSocket URL and BrowserBash drives that browser instead of spawning a new one. The URL can come from three places, and all three are common in MCP setups:

1. **A browser you launched yourself** with `--remote-debugging-port=9222`, which is also the same browser an MCP server can attach to via `connectOverCDP`. Two tools, one Chrome.
2. **A browser an MCP server launched** in a mode that keeps the debugging port open. Some servers run persistent profiles you can reach this way.
3. **A cloud browser session** from a provider like Browserbase, whose `wss://...` CDP URL you paste straight into `--cdp-endpoint`. (BrowserBash also has a first-class `browserbase` provider that takes `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` directly, if you would rather not manage the raw URL.)

The composition pattern that actually earns its keep looks like this. During development, you let your coding agent explore a flow interactively through its MCP server — poke at the page, read the accessibility tree, figure out what "done" looks like. Once you know the flow, you do **not** leave it as a chat transcript. You write the objective down as a BrowserBash markdown test and run it against the same kind of browser, on demand, in CI, with a real exit code. The agent's exploration becomes a committed, repeatable check. That hand-off — exploratory MCP session to durable BrowserBash run — is the whole point of composing them.

### Why use BrowserBash on top of an MCP browser at all?

A fair question. If your MCP server can already click and type, why add a CLI? Three reasons, and they are the same reasons QA teams keep asking for.

- **A verdict, not a transcript.** BrowserBash returns a structured result and an exit code (`0` passed, `1` failed, `2` error, `3` timeout). An MCP chat returns prose you have to read. CI needs the former.
- **It runs without a chat host.** A BrowserBash run is a shell command. It runs in Jenkins, GitHub Actions, a cron job, or another AI agent's tool call — no Cursor or Claude Desktop in the loop.
- **It is committable.** Markdown tests live in your repo and get reviewed like code. More on that below.

## A worked example: from MCP exploration to a committed check

Say your team's internal admin tool just got a new bulk-export button, and you explored it interactively through Playwright MCP in Cursor. Now you want a guard so it does not silently break. Drop a markdown test into the repo:

```bash
browserbash testmd run ./admin_export_test.md
```

The file is plain English, one step per list item, with `{{variables}}` for anything environment-specific and secret-marked variables masked as `*****` in every log line. After each run BrowserBash writes a human-readable `Result.md`. The same objective you reasoned through in an MCP chat is now a file your CI runs on every PR, and a teammate who has never touched MCP can read it.

For the model that interprets the English, BrowserBash is Ollama-first. The default `--model auto` resolves in order: a local Ollama model if one is running (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (Claude), then `OPENAI_API_KEY` (GPT). One honest caveat worth stating plainly: very small local models (8B and under) get flaky on long multi-step objectives. For real flows, the sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard journeys. You can pin any of them with `--model`. The BrowserBash [tutorials](https://browserbash.com/tutorials) walk through the model setup end to end.

## MCP browser servers vs a CLI like BrowserBash

These are not competitors so much as different altitudes. Here is an honest side-by-side. Where a competitor's behavior is configuration-dependent or not publicly fixed, I have said so rather than inventing a number.

| Dimension | Playwright MCP (and similar) | BrowserBash CLI |
|---|---|---|
| Primary user | An AI agent inside a chat host | A human or agent at a shell / in CI |
| Interface | MCP tool calls (`navigate`, `click`, `snapshot`) | One plain-English objective, or a markdown test |
| Perception model | Accessibility-tree snapshots, refs like `ref=e5` | You describe intent; the agent figures out the steps |
| Output | Tool results + prose in the conversation | Verdict + structured values + exit code + `Result.md` |
| Runs without a chat host? | No — needs an MCP client | Yes — it is a CLI command |
| Committable artifact | The server config; flows live in chat history | `*_test.md` files in your repo |
| Browser location | Local, or remote via `--cdp-endpoint` | Local (default) or any CDP endpoint via `--cdp-endpoint` |
| CI fit | Indirect; needs a host harness | Direct; `--agent` emits NDJSON, real exit codes |
| License | Playwright MCP: open source (Apache-2.0) | Apache-2.0 |
| Cost of the model | Whatever the host model costs | $0 on local Ollama; your keys otherwise |

The honest read: if your goal is *interactive* — "help me figure out why this checkout breaks while I watch" — an MCP browser server inside your coding agent is excellent, and BrowserBash is not trying to replace that loop. If your goal is *durable* — "run this exact check on every deploy and fail the build if it regresses" — that is BrowserBash's job, and a raw MCP server will leave you writing a harness around it.

You do not have to choose. They share a browser over CDP, so use the MCP server to explore and BrowserBash to lock the result in.

## Engines, providers, and the rest of the surface

It helps to know which knobs exist, because the CDP story is only one column of a wider matrix.

**Engines** decide who interprets the English. The default is `stagehand` (MIT, by Browserbase), which exposes act / extract / observe / agent primitives and self-heals when the page shifts. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright, used automatically for the LambdaTest and BrowserStack providers. Switch with `--engine stagehand|builtin`.

**Providers** decide where the browser runs, via `--provider`:

- `local` — your Chrome (default)
- `cdp` — any DevTools endpoint via `--cdp-endpoint ws://...` (the MCP-composition path)
- `browserbase` — needs `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`
- `lambdatest` — needs `LT_USERNAME` + `LT_ACCESS_KEY` (auto-uses the builtin engine)
- `browserstack` — needs `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` (auto-uses the builtin engine)

For an MCP-managed browser, you are almost always on `cdp` with the endpoint the server or cloud provider gave you, or on `browserbase` if that is your cloud. The [features](https://browserbash.com/features) page lists the full provider grid.

A couple of run flags pair especially well with MCP work. `--record` captures a screenshot and a `.webm` session video via bundled ffmpeg (the builtin engine also writes a Playwright trace), which is handy when you want a visual artifact from a headless CDP session you could not watch live. And `--agent` emits NDJSON — one JSON object per line, `step` events during the run and a terminal `run_end` with status and `final_state` — which is exactly what another AI coding agent or a CI script wants to consume instead of parsing prose.

## A realistic end-to-end flow

Putting the pieces together, a team that uses both might work like this:

1. A developer asks their coding agent (with Playwright MCP attached) to walk the new onboarding flow and confirm the welcome email modal fires. The agent explores via accessibility snapshots and confirms it works.
2. They start a Chrome with `--remote-debugging-port=9222`, grab the `webSocketDebuggerUrl` from `http://localhost:9222/json/version`, and run a one-shot BrowserBash check against it to confirm the same objective passes outside the chat.
3. They write the objective into `onboarding_test.md`, parameterize the test account with `{{email}}` and a secret-marked `{{password}}`, and commit it.
4. CI runs `browserbash testmd run ./onboarding_test.md --agent` on every PR. A `0` exit code keeps the build green; a `1` fails it with a readable `Result.md` and, if `--record` is on, a video.
5. Optionally, runs land on the free local dashboard (`browserbash dashboard` at localhost:4477), or — opt-in only — get pushed to the cloud dashboard with `connect` plus `--upload`. Without `--upload`, nothing leaves the machine.

Every run is also kept on disk at `~/.browserbash/runs` with secrets masked, capped at 200, so you have a local history regardless of any dashboard. None of this requires an account; the [learn](https://browserbash.com/learn) section covers the markdown test format if you want to go deeper.

## When to choose what

A balanced rule of thumb, because both tools are genuinely good at different things.

**Choose an MCP browser server (Playwright MCP, Chrome DevTools MCP, a cloud MCP) when:**

- You want an agent to *explore* a page interactively inside your editor or chat.
- You are debugging a flow live and want the model to react step by step.
- You are building an agent product where browser control is one tool among many, called through MCP.
- You need cross-browser coverage (Firefox/WebKit) at the perception layer — Playwright MCP handles all three.

**Choose BrowserBash when:**

- You need a repeatable, committable check with a real pass/fail exit code.
- You want it to run in CI or a cron job with no chat host present.
- You want a plain-English objective rather than a sequence of low-level tool calls.
- You want $0 model cost on a local model and a guarantee that nothing leaves your machine.

**Use both when** the flow matters enough to lock in: explore through MCP, then capture the result as a BrowserBash markdown test pointed at the same CDP browser. That is the composition this whole guide is about, and it is the setup I would recommend to most teams shipping web apps with agents in the loop.

## FAQ

### Can BrowserBash connect to a browser launched by an MCP server?

Yes, as long as that browser exposes a CDP endpoint. Launch Chrome with `--remote-debugging-port`, or use a cloud provider that hands you a `wss://` CDP URL, then pass it to BrowserBash with `--provider cdp --cdp-endpoint ws://...`. BrowserBash attaches to the running session over CDP instead of launching its own browser, so both tools can share the same Chrome.

### Is MCP a replacement for Playwright or Selenium?

No. MCP is a tool-calling protocol that lets an AI agent invoke tools, including browser tools. Under the hood, a browser-flavored MCP server usually drives the browser with Playwright over CDP. So MCP sits above Playwright rather than replacing it, and it does not on its own give you the deterministic, committable test artifacts that a test framework or BrowserBash provides.

### Does using BrowserBash with a cloud MCP browser send my data anywhere?

Only to the cloud browser provider you explicitly point it at. If you connect to a Browserbase or other remote CDP session, the page traffic flows through that provider by design. BrowserBash itself sends nothing to its own cloud unless you run connect and add `--upload` to a run; on a local Ollama model with a local browser, nothing leaves your machine at all.

### Which model should I use for MCP-style browser automation in BrowserBash?

Start with the default `--model auto`, which prefers a local Ollama model and costs nothing. For short, simple objectives a small model is fine, but very small models (8B and under) get unreliable on long multi-step flows. For real journeys, use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model like Claude for the hardest flows, pinned with `--model`.

Explore an MCP-managed browser, then lock the result in. Install with `npm install -g browserbash-cli` and point it at any CDP endpoint. No account needed to run — and if you want the optional cloud dashboard later, you can [sign up](https://browserbash.com/sign-up) for free.
