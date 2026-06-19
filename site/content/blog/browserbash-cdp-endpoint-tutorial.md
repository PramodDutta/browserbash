---
title: Attach BrowserBash to any browser over CDP
description: "Configure a browserbash cdp endpoint with --provider cdp and --cdp-endpoint to attach the AI agent to docker Chrome or a Playwright-managed browser."
date: 2026-01-27
category: tutorial
---

By the end of this tutorial you will be able to point BrowserBash at a Chrome you already have running and let the AI agent drive it — no fresh browser launch, no profile shuffling. The trick is a `browserbash cdp endpoint`: you give the CLI a Chrome DevTools Protocol WebSocket URL with `--provider cdp --cdp-endpoint ws://...`, and the agent attaches to that exact browser instead of spawning its own. We will do this two ways — against a headless Chrome running in Docker, and against a browser that Playwright started and is holding open — and you will run a real plain-English objective through both.

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a sentence describing what should happen; an AI agent reads the live page and drives a real Chromium browser step by step, then returns a verdict plus any values it extracted. CDP attach mode is the bridge between that agent and *your* infrastructure — a container in CI, a remote debugging Chrome, or a browser a Playwright script is already managing. I am going to treat this like a pairing session: we get a local flow working first so the wording is solid, then attach it to a containerized browser, then hand it a Playwright-managed page. Every command here is real and runnable against BrowserBash 1.3.1.

## What you'll need

Before we attach to anything, get the basics in place. None of this requires a BrowserBash account — the CLI runs entirely from your terminal, and on a local model nothing leaves your machine.

- **Node.js >= 18.** Check with `node -v`. BrowserBash ships as an npm global.
- **A Chromium-family browser** for the local warm-up run (the `local` provider uses your installed Chrome).
- **Docker** for Step 3 (we run headless Chrome in a container).
- **A model backend.** We use the free Ollama-first path. Install [Ollama](https://ollama.com), then pull a mid-size model — a 70B-class model like Llama 3.3 or Qwen3 is the sweet spot for multi-step flows. If you would rather use a hosted model, export `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` and the default `auto` resolver will pick it up.
- **The CLI itself:**

```bash
npm install -g browserbash-cli
```

Confirm it landed:

```bash
browserbash --version
```

You should see `1.3.1`. If the command is not found, your npm global bin directory is not on `PATH` — fix that before continuing, because every step below calls `browserbash`.

### Why attach over CDP at all?

The default `local` provider is great for development: BrowserBash launches a clean Chrome, drives it, and tears it down. But sometimes the browser already exists and you want the agent to *join* it rather than start a new one. Three common cases:

- **CI containers.** You have a hardened headless Chrome image. Booting another browser inside the runner is wasteful and sometimes blocked. Attach instead.
- **Pre-authenticated sessions.** A Playwright script logged in, set cookies, and seeded state. You want the agent to take over that exact page mid-flow.
- **Remote or shared browsers.** A long-lived debugging Chrome on another host. Point the agent at its WebSocket and go.

That is what `--provider cdp` is for. Here is the flag surface we will use.

| Flag | Value | What it does |
| --- | --- | --- |
| `--provider cdp` | — | Attach to an existing DevTools endpoint instead of launching a browser. |
| `--cdp-endpoint <ws-url>` | `ws://host:port/...` | The CDP WebSocket the agent connects to. Required with `--provider cdp`. |
| `--engine` | `stagehand` / `builtin` | Who interprets the English. `stagehand` is the default; `builtin` is the in-repo Anthropic tool-use loop. |
| `--model` | e.g. `ollama/qwen3` | Pin the LLM. Omit to let `auto` resolve it. |
| `--headless` | — | Run without a visible window (useful for the local warm-up; moot for an already-headless attached browser). |
| `--timeout <seconds>` | integer | Hard wall-clock budget for the whole run. |
| `--record` | — | Capture a screenshot and a `.webm` session video via bundled ffmpeg. |
| `--agent` | — | Emit NDJSON (one JSON object per line) instead of prose — for CI and coding agents. |

## Step 1 — Warm up on the local provider

Before you attach to anything, prove the *objective* works on a browser you can watch. This is the fastest way to debug wording, and it separates "my sentence is wrong" from "my CDP endpoint is wrong" — two failures that otherwise look identical.

Pick a stable, public target. We will check the navigation on the BrowserBash homepage:

```bash
browserbash run "Go to https://browserbash.com and confirm the main navigation contains a link to Pricing. Report the visible nav link labels." --model ollama/qwen3
```

What you should see: the agent narrates a few steps — navigate, read the page, look for the nav — and finishes with a verdict like `PASSED` plus a short summary and an extracted list of nav labels (Features, Pricing, Blog, and so on). If your local model is small (8B or under), you may see it stumble on the "report the labels" part; that is the honest caveat from the intro. Bump to a mid-size model and it settles down.

Once the local run is green, you know the sentence is good. Now we only have to change *where the browser runs*.

## Step 2 — Understand what `--cdp-endpoint` expects

`--cdp-endpoint` wants a **WebSocket debugger URL**, not an HTTP one. Chrome exposes both:

- `http://localhost:9222/json/version` — a JSON document you can `curl` to discover the browser.
- `ws://localhost:9222/devtools/browser/<id>` — the actual WebSocket BrowserBash attaches to.

The HTTP endpoint is how you *find* the WebSocket. The `webSocketDebuggerUrl` field in that JSON is exactly what you pass to `--cdp-endpoint`. Keep this mental model: HTTP to discover, `ws://` to attach. We use it in both of the next steps.

## Step 3 — Attach to headless Chrome in Docker

This is the CI-shaped case. We run a headless Chrome in a container with remote debugging exposed, discover its WebSocket, and attach the agent.

### 3.1 — Start a debuggable Chrome container

Use any image that runs Chromium with the DevTools port open. The `browserless/chrome` image is a common, batteries-included choice:

```bash
docker run -d --name bb-chrome -p 9222:3000 browserless/chrome
```

That maps the container's internal Chrome port to `localhost:9222` on your host. Give it a couple of seconds to boot, then confirm Chrome is alive and listening:

```bash
curl -s http://localhost:9222/json/version
```

You should get back JSON with a `Browser` field (the Chromium version) and a `webSocketDebuggerUrl` field. That URL is your endpoint.

> If you are rolling your own image instead, the equivalent is launching Chrome with `--headless=new --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0` and publishing the port. The `0.0.0.0` bind matters — without it, Chrome only listens on the container's loopback and your host `curl` gets nothing.

### 3.2 — Grab the WebSocket URL

Pull the `webSocketDebuggerUrl` straight out of the JSON so you do not fat-finger it:

```bash
CDP_WS=$(curl -s http://localhost:9222/json/version | python3 -c "import sys, json; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
echo "$CDP_WS"
```

You will see something like `ws://localhost:9222/devtools/browser/2f1c...`. Chrome reports the host it *thinks* it is on; if it prints an internal container hostname instead of `localhost`, rewrite the host portion to `localhost` (or wherever you published the port) before using it. That host mismatch is the single most common reason a CDP attach hangs, so eyeball this value every time.

### 3.3 — Run the objective against the container

Now point BrowserBash at that browser. Same objective as the warm-up, just a different provider:

```bash
browserbash run "Go to https://browserbash.com and confirm the main navigation contains a link to Pricing. Report the visible nav link labels." \
  --provider cdp \
  --cdp-endpoint "$CDP_WS" \
  --model ollama/qwen3
```

What you should see: the agent does **not** open a window on your desktop — it is driving the container's headless Chrome. The step narration is identical to the local run, and you land on the same `PASSED` verdict with the extracted nav labels. The difference is invisible from the terminal, which is exactly the point: your objective is portable, only the browser moved.

Add `--record` if you want proof of what happened inside the container:

```bash
browserbash run "Go to https://browserbash.com and confirm the main navigation contains a link to Pricing." \
  --provider cdp \
  --cdp-endpoint "$CDP_WS" \
  --record
```

That writes a screenshot and a `.webm` of the session (rendered with the bundled ffmpeg) into the run's artifacts, so you can watch the headless run after the fact. On the `builtin` engine, `--record` also writes a Playwright trace you can open in the trace viewer.

When you are done, stop the container:

```bash
docker rm -f bb-chrome
```

## Step 4 — Attach to a Playwright-managed browser

The second big use case: a Playwright script already launched a browser, did some setup — logged in, set cookies, navigated deep into an app — and you want the agent to take over *that* live session. Playwright can expose its browser over CDP, and BrowserBash attaches to it the same way.

### 4.1 — Launch a browser server from Playwright

Create a tiny script that starts Chromium as a server and prints its WebSocket endpoint. Save it as `cdp-server.mjs`:

```bash
cat > cdp-server.mjs <<'EOF'
import { chromium } from 'playwright';

const server = await chromium.launchServer({ headless: true });
console.log('CDP endpoint:', server.wsEndpoint());
// Keep the process alive so the browser stays up for BrowserBash to attach.
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
EOF
```

Run it (you need Playwright installed in this directory — `npm i playwright` if you do not have it):

```bash
node cdp-server.mjs
```

It prints something like `CDP endpoint: ws://127.0.0.1:51234/abc123...` and then *stays running*. Leave this terminal open — that browser lives only as long as the process does. Copy the printed `ws://` URL.

### 4.2 — Attach the agent to the Playwright browser

In a **second terminal**, hand that endpoint to BrowserBash:

```bash
browserbash run "Go to https://browserbash.com/pricing and tell me whether the page mentions a free tier. Quote the exact text you base that on." \
  --provider cdp \
  --cdp-endpoint "ws://127.0.0.1:51234/abc123..." \
  --model ollama/qwen3
```

Swap in the real URL your script printed. What you should see: the agent attaches to the Playwright-managed Chromium, runs your objective, and returns a verdict with the quoted text it relied on. Because the browser was started by Playwright, anything Playwright did before you attached — cookies, storage, an open authenticated page — is right there for the agent to use. That is the superpower of this mode: Playwright handles deterministic setup, BrowserBash handles the fuzzy "now go verify the thing" part in plain English.

When you are finished, go back to the first terminal and press `Ctrl+C` to close the Playwright server cleanly.

### 4.3 — A note on the two engines

The interpreter that turns your sentence into browser actions is the **engine**, and it is independent of the provider. The default `stagehand` engine (MIT, by Browserbase) gives you self-healing act/extract/observe primitives and works well for most attach flows. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright; it is what gives you the Playwright trace under `--record`. Both attach over CDP identically — pick with `--engine stagehand` or `--engine builtin`. For the Playwright-managed case, `builtin` often feels natural since you are already in Playwright's world, but either works.

## Step 5 — Wire an attached run into CI with NDJSON

Once a CDP attach works by hand, you usually want it in a pipeline. Add `--agent` and BrowserBash stops printing prose and emits NDJSON — one JSON object per line — so your runner never has to parse human text:

```bash
browserbash run "Go to https://browserbash.com and confirm the main navigation contains a link to Pricing." \
  --provider cdp \
  --cdp-endpoint "$CDP_WS" \
  --agent
```

You get progress events like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}` followed by a terminal `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. Just as useful, the process exit code mirrors the outcome: `0` passed, `1` failed, `2` error, `3` timeout. Gate your pipeline on that and you never grep stdout. Pair this with the container from Step 3 and you have a fully headless, machine-readable attached run.

## Troubleshooting

Real failures you will hit, and how to clear them.

**The run hangs forever after "connecting".** Almost always a host mismatch in the WebSocket URL. Chrome reports the host *it* believes it is on, which inside Docker can be a container hostname your machine cannot resolve. Re-read the `webSocketDebuggerUrl`, and if the host is not reachable from where you run `browserbash`, rewrite it to `localhost` (or the host where you published the port). Confirm reachability first with `curl -s http://localhost:9222/json/version`.

**`connection refused` on the endpoint.** The browser is not actually listening where you think. For Docker, check the port mapping (`docker ps` should show `0.0.0.0:9222->3000/tcp` or similar) and that Chrome bound to `0.0.0.0`, not loopback, inside the container. For the Playwright case, make sure the `cdp-server.mjs` process is still running — if you closed that terminal, the browser is gone and there is nothing to attach to.

**The agent flakes on a multi-step objective.** This is the model, not CDP. Very small local models (8B and under) lose the thread on long flows — they navigate fine and then forget what they were verifying. Move to a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model with `--model claude-opus-4-8`. Re-run the warm-up from Step 1 to confirm the model can carry the flow before blaming the attach.

**`--record` produces no video.** The recorder uses a bundled ffmpeg. If the `.webm` is missing while the screenshot is present, ffmpeg failed to run in your environment — common in minimal CI containers. The run itself still passes; you just lose the video. Install system ffmpeg or run `--record` from a fuller environment if you need the recording.

**The run dies at exactly your timeout.** A CDP attach adds a little latency, and headless containers can be slower than your laptop. If you see a `timeout` outcome, raise the budget with `--timeout 180` and try again. If it still times out, simplify the objective — one verification per run is more reliable than a five-part sentence.

## When to use this

Reach for `--provider cdp` when the browser already exists and you want the agent to join it: a hardened Chrome in CI, a Playwright-seeded session, or a remote debugging browser. For everything else — local development, quick checks — the default `local` provider is simpler because BrowserBash manages the browser lifecycle for you.

Good next reads from here:

- The [BrowserBash tutorials index](https://browserbash.com/tutorials) for the default local flow you warmed up with in Step 1.
- The [BrowserBash blog](https://browserbash.com/blog) if you are wiring these attached runs into CI and want more on agent mode, exit codes, and machine-readable output.
- The [learn hub](https://browserbash.com/learn) for engine and model deep-dives, and the [features page](https://browserbash.com/features) for the full provider list.

If you want managed cloud browsers instead of running your own, the `browserbase`, `lambdatest`, and `browserstack` providers cover that without any CDP plumbing on your side.

## FAQ

### What is a CDP endpoint in BrowserBash?

A CDP endpoint is the Chrome DevTools Protocol WebSocket URL of an already-running browser. When you pass `--provider cdp --cdp-endpoint ws://...`, BrowserBash attaches the AI agent to that exact browser instead of launching its own. It is how you point the agent at a Docker Chrome, a remote debugging session, or a browser another tool is managing.

### How do I find the WebSocket URL for an existing Chrome?

Start Chrome with remote debugging on a port, then request `http://localhost:9222/json/version` over HTTP. The JSON response includes a `webSocketDebuggerUrl` field, and that `ws://` value is exactly what you pass to `--cdp-endpoint`. If the host in that URL is not reachable from where you run BrowserBash, rewrite it to localhost or the host where you published the port.

### Can BrowserBash attach to a browser Playwright already launched?

Yes. Use Playwright's `chromium.launchServer()` and print `server.wsEndpoint()`, then pass that URL to BrowserBash with `--provider cdp --cdp-endpoint`. The agent joins the live session, so any cookies, storage, or authenticated state Playwright set up beforehand is available. This lets Playwright handle deterministic setup while the agent handles plain-English verification.

### Does CDP mode change which AI model or engine I use?

No. The provider only decides where the browser runs; the model and engine are independent. You can pair `--provider cdp` with any backend the `auto` resolver supports — a free local Ollama model, Claude, OpenAI, or OpenRouter — and with either the default `stagehand` engine or the `builtin` engine. On local models, nothing leaves your machine.

Ready to attach the agent to your own browsers? Install it and run your first CDP flow today:

```bash
npm install -g browserbash-cli
```

Then grab an optional free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) — though you do not need one to run anything in this tutorial.
