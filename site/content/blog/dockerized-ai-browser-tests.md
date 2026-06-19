---
title: Dockerized AI browser tests
description: "Run dockerized browser tests by pointing an AI agent at a Chrome container over CDP: reproducible CI, no local Chrome, structured pass/fail verdicts."
date: 2026-05-01
category: ci
---

If you have ever watched a test suite pass on your laptop and fail in CI, you already know why dockerized browser tests exist. The browser version drifts, a font is missing, a GPU flag behaves differently, and suddenly a "flaky" failure is really an environment failure. The fix is to pin the browser inside a container and talk to it over a stable wire. This guide is about doing exactly that with an AI agent on the driving end: you write a plain-English objective, the agent connects to a Chrome container over the Chrome DevTools Protocol (CDP), and you get a reproducible verdict instead of a maintenance bill.

I'll use BrowserBash as the runner because its `cdp` provider was built for this — point it at any DevTools endpoint and the same agent that drives your local Chrome now drives a container. But the architecture here (a Chrome image, a CDP endpoint, an agent that connects over a WebSocket) is the same whether you use BrowserBash, raw Playwright, or Puppeteer. Where a detail depends on a specific image or tool I'll say so, and where a competitor is the better fit I'll say that too.

## Why containerize the browser at all

A browser is the least reproducible dependency in most test stacks. Your team runs whatever Chrome auto-updated to last week. Your CI runner has a different one. A teammate on Linux has yet another. Nobody wrote down a version, so when a test breaks you can't tell whether the product regressed or the browser did. Containerizing the browser turns "whatever is installed" into "this exact image SHA," which is the whole point of CI in the first place.

There are three concrete wins, and they show up fast.

- **Reproducibility.** A pinned image like `chrome:128` (or a `browserless` tag) means every run — local, CI, a colleague's machine — uses the identical binary, fonts, and flags. A failure is a real failure.
- **Isolation.** The browser runs in its own process namespace with its own filesystem. A runaway page can't eat your CI host's memory or leave Chrome zombies behind, a real problem on long-lived runners.
- **Scale.** You can spin up ten Chrome containers across a cluster, fan tests across them, then tear them all down. No per-machine Chrome install, no `apt` drift, no "works on the runner with the right libnss."

The cost is one layer of indirection: your test code no longer launches Chrome, it *connects* to a Chrome already running somewhere. That connection is CDP, and getting it right is most of the work.

### Where the AI part fits

Traditional dockerized browser tests still ship the fragile part: the selectors. You pin the browser, but your suite is still hundreds of CSS locators that break when a designer renames a class. The container made the *environment* reproducible; it did nothing for the *test logic*.

An AI agent changes the second half. Instead of `page.click('#checkout-btn')`, you write "add a laptop to the cart and complete checkout." The agent reads the rendered page, decides what to do, and acts, all over the same CDP connection to the same container. You get reproducibility from Docker and resilience from the agent. That combination is why "dockerized AI browser tests" is worth treating as its own pattern rather than just "Docker plus a test runner."

## CDP, in one honest paragraph

The Chrome DevTools Protocol is the same JSON-over-WebSocket interface that Chrome's own DevTools uses. When you start Chrome with `--remote-debugging-port=9222`, it opens an HTTP server that advertises a WebSocket URL (the `webSocketDebuggerUrl`), and anything that speaks CDP — Playwright's `connectOverCDP`, Puppeteer's `connect`, or an AI agent — can attach to that URL and drive the browser: navigate, click, evaluate JavaScript, read the DOM, take screenshots. There is no magic. A Chrome container is just a Chrome listening on a debugging port, and a CDP endpoint is just a URL pointing at it.

Two things trip people up. First, the `webSocketDebuggerUrl` from `http://host:9222/json/version` usually contains `127.0.0.1` even when you're connecting from another container — you often need to rewrite the host. Second, Chrome binds the debugging port to localhost by default for security; exposing it across a network without an allowlist is a real risk, covered in the security section below. CDP is powerful because it can do anything DevTools can do, which is also why you don't leave it open to the internet.

## The container side: what's actually running

You have two reasonable ways to get a Chrome-over-CDP container.

**Option A — a purpose-built image.** Projects like `browserless/chrome` (and similar headless-Chrome images) ship Chrome plus a WebSocket front door, font packages, and a `/json/version` endpoint already wired up. You run the image, expose a port, and you have a CDP endpoint with minimal fuss. These images handle the annoying parts — fonts, sandbox flags, concurrency limits — that you'd otherwise debug by hand. Licensing and feature limits vary by project and version, so check the specific image's terms as of 2026 rather than assuming.

**Option B — roll your own.** A slim Debian base, `google-chrome-stable` or `chromium`, and a launch command:

```bash
# Inside the container, conceptually:
google-chrome --headless=new \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --no-sandbox \
  --disable-dev-shm-usage
```

A few of those flags are load-bearing. `--remote-debugging-address=0.0.0.0` is what lets another container reach the port at all; defaulting to localhost quietly refuses your connection. `--disable-dev-shm-usage` avoids the infamous crashes from Docker's tiny default `/dev/shm`; the alternative is `--shm-size=2g` on the container. `--no-sandbox` is common inside containers but disables a real security boundary, so use it only for trusted test targets, never for crawling untrusted pages. Rolling your own gives total control and teaches you which flags matter, but it also means *you* own the font and dependency debugging a purpose-built image already solved.

Either way, the output is the same: a host and port serving a CDP WebSocket, all the agent needs.

## The driving side: an agent over CDP

Here's where BrowserBash earns its place in a dockerized browser tests setup. It's a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command an English objective, and an AI agent drives a real browser step by step — no selectors, no page objects. By default it drives your *local* Chrome. To drive a container instead, you switch the provider to `cdp` and pass the endpoint:

```bash
browserbash run "Go to the app, log in as the demo user, open Settings, \
and confirm the account email is shown" \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser \
  --record
```

That single change — `--provider cdp --cdp-endpoint ws://...` — is the whole integration. The agent attaches to the running Chrome over the WebSocket you give it, executes the objective, and returns a verdict plus any structured values it extracted. Nothing about the objective changes between local and container runs, which is exactly what you want: the same English test, two different browsers.

A note on the endpoint string: the exact path varies by image. When in doubt, `curl http://localhost:9222/json/version` and use the `webSocketDebuggerUrl` it hands back, rewriting `127.0.0.1` to your reachable host if needed.

### Which engine drives the CDP session

BrowserBash has two engines that interpret your English. The default, `stagehand` (MIT, by Browserbase), uses act/extract/observe/agent primitives with self-healing behavior. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright, and it adds a Playwright trace on top of video when you record. Both work over the `cdp` provider, so you can pick by what artifacts you want:

```bash
browserbash run "Search for 'wireless mouse', open the first result, \
and report its price" \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser \
  --engine builtin \
  --record
```

If you want a Playwright trace you can open in the Trace Viewer for a failed CI run, `--engine builtin --record` is the combination. If you want the self-healing Stagehand primitives, stay on the default. There's a deeper breakdown of the engines on the [features page](https://browserbash.com/features).

## The model decision changes inside a container

This is the part people skip and then get burned by, so I'll be blunt about it. BrowserBash is Ollama-first. The default model is `auto`, which resolves in order: a local Ollama instance (free, no keys, nothing leaves the machine) → `ANTHROPIC_API_KEY` → `OPENAI_API_KEY`, or an explicit `--model`. The browser lives in the Chrome container; **the model does not have to.** These are separate concerns. You can run the Chrome container on a CI runner and point the agent at a host-side Ollama, or at a hosted model with a key, while CDP carries only the browser traffic.

Here's the honest caveat. Very small local models (8B and under) are flaky on long, multi-step objectives — they lose the plot three or four steps into a checkout flow. For dockerized browser tests that do anything non-trivial, the sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. If your runner is a small box and your Ollama host is the same small box, you'll blame the agent for what is really an under-powered model. Size the model to the flow, or pin a capable one explicitly:

```bash
browserbash run "Complete the multi-step signup wizard and confirm \
the welcome screen appears" \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser \
  --model ollama/qwen3
```

You can also pin a hosted model with `--model claude-opus-4-8` (needs `ANTHROPIC_API_KEY`) or route through OpenRouter for a hosted 70B-class model. The container decided *where the browser runs*; the `--model` flag independently decides *where the thinking runs*, and the second decision determines whether your tests are reliable. The [pricing page](https://browserbash.com/pricing) lays out the cost story, but the short version is that local models are a guaranteed \$0 model bill.

## Wiring it into CI

The reason to containerize at all is usually CI, so here's the shape of it without pretending every platform is identical.

In a typical pipeline you run two things: a Chrome container as a service, and a job step that runs BrowserBash against it. On GitHub Actions you'd declare the Chrome image as a service container; on GitLab CI you'd use a `services:` entry; in a plain `docker compose` setup you'd bring up Chrome and the test runner on a shared network. In all three cases the test step looks the same — install the CLI, run an objective against the CDP endpoint, let the exit code decide the build.

That last part is what makes BrowserBash comfortable in CI. The `--agent` flag emits NDJSON — one JSON object per line — instead of prose, so your pipeline never parses English to decide anything:

```bash
browserbash run "Log in and verify the dashboard loads with at least one widget" \
  --provider cdp \
  --cdp-endpoint ws://chrome:9222/devtools/browser \
  --agent \
  --timeout 120
```

You get progress events like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}` and a terminal `{"type":"run_end","status":"passed","summary":"...","duration_ms":...}`. The exit codes are disciplined: `0` passed, `1` failed, `2` error, `3` timeout. Your CI gate is a single integer, not a grep over logs. When you note `chrome` as the host in the endpoint, that's the service name on the shared Docker network — containers reach each other by service name, which is cleaner than juggling IPs.

For tests you want to commit and review, BrowserBash also runs markdown test files. Each list item is a step, `{{variables}}` get templated in, secret-marked variables are masked as `*****` in every log line, and a human-readable `Result.md` is written after each run:

```bash
browserbash testmd run ./login_test.md \
  --provider cdp \
  --cdp-endpoint ws://chrome:9222/devtools/browser \
  --agent
```

That makes your dockerized browser tests version-controlled artifacts your team can read in a pull request, not opaque scripts. There's a step-by-step walkthrough in the [tutorials](https://browserbash.com/tutorials).

## Dockerized AI browser tests vs. the alternatives

It's worth being clear about what this pattern competes with, because "run browser tests in Docker" is a crowded space and the honest answer is that the right tool depends on what you're optimizing for.

| Approach | What runs the browser | What writes the test | Best when |
| --- | --- | --- | --- |
| BrowserBash + CDP to a Chrome container | Your container (any CDP endpoint) | English objective, AI agent | You want reproducible env + no selector maintenance, and your own infra |
| Raw Playwright/Puppeteer in Docker | Bundled or external browser | Code (selectors, page objects) | You want full programmatic control and don't mind maintaining locators |
| Selenium Grid in containers | Grid nodes (Chrome/Firefox containers) | Code (WebDriver) | You need cross-browser at scale and have an existing Selenium investment |
| Hosted browser cloud (Browserbase, LambdaTest, BrowserStack) | The vendor's infrastructure | Code or agent, depending | You don't want to run browser infra at all and will pay for it |

A few honest notes on that table. Raw Playwright is the better fit if your tests are deterministic API-shaped checks where selectors are stable and an AI agent's probabilistic behavior is unwanted overhead. Selenium Grid remains the pragmatic choice if you already have a grid and need Firefox and Safari coverage, which a single Chrome container doesn't give you. And if you genuinely don't want to operate any browser infrastructure, a hosted cloud is the right call — BrowserBash itself supports `browserbase`, `lambdatest`, and `browserstack` providers for exactly that case, so "self-hosted CDP container" and "hosted cloud" aren't an either/or with this tool; they're two providers you can switch between with one flag.

What the CDP-to-container pattern uniquely buys you is *control plus resilience on your own hardware*: you own the image (reproducibility) and the network (security), and the agent absorbs UI churn (low maintenance). There's a longer [case study](https://browserbash.com/case-study) of teams using the agent approach, and the broader concepts are covered in [learn](https://browserbash.com/learn).

## Security: don't leave 9222 open

CDP is, by design, a remote-control protocol with no authentication. Anything that can reach the debugging port can drive the browser — navigate it to internal URLs, read whatever's on the page, exfiltrate cookies from an authenticated session. Treat the endpoint accordingly.

- **Bind to the Docker network, not the world.** Inside `docker compose`, containers reach each other by service name on a private network. You do not need to publish `9222` to the host (`-p 9222:9222`) unless you're debugging from your laptop. Don't publish it on a CI runner.
- **Never expose CDP to the public internet.** If you must reach it across hosts, put it behind a VPN or an authenticated proxy. An open `9222` on a public IP is a remote browser anyone can drive.
- **Be careful with `--no-sandbox`.** It's common in containers, but it disables a security boundary. Only point a no-sandbox Chrome at sites you trust. For crawling untrusted pages, keep the sandbox and pay the `--shm-size` cost instead.
- **Keep secrets out of logs.** BrowserBash masks secret-marked variables as `*****` in every log line and in the on-disk run store, but you still control what you put in objectives. Pass credentials as masked variables in markdown tests, not as literals in the objective string.

None of this is exotic; it's the same discipline you'd apply to any remote-debugging port. The mistake is treating a Chrome container like a stateless web service when it's a fully scriptable browser holding live sessions.

## Debugging when a container run goes sideways

Containerized runs fail in container-shaped ways, and the symptoms look like agent failures until you check:

- **"Connection refused" on the CDP endpoint.** Chrome is binding to localhost inside the container. Add `--remote-debugging-address=0.0.0.0` and confirm the port is reachable on the Docker network.
- **Chrome crashes on page load.** Almost always `/dev/shm` exhaustion. Add `--disable-dev-shm-usage` to the Chrome flags or `--shm-size=2g` to the container. This one wastes an afternoon if you don't know the pattern.
- **Pages render with boxes instead of text.** Missing fonts in the image. Purpose-built Chrome images bundle font packages; a hand-rolled slim base often doesn't. Install the font packages or switch images.
- **The agent "can't find" something a human can see.** Record the run with `--record` to capture a screenshot and a `.webm` session video; on the `builtin` engine you also get a Playwright trace. Watching the video tells you in seconds whether the page actually rendered or the model misread it — and which of the two it was.

Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200), so you can inspect what the agent saw without re-running. For a live view, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — no account, nothing leaving your machine; add `--upload` per run only if you've opted into the cloud dashboard with `browserbash connect`. Without `--upload`, nothing leaves the box, which matters when your container is hitting an internal staging environment.

## When to choose this pattern — and when not to

Use dockerized AI browser tests over CDP when you want a reproducible browser environment you control, you're tired of maintaining selectors, and you can run the agent against a mid-size or hosted model. It shines for end-to-end smoke tests, pre-merge checks, and nightly flows against staging — the places where selector drift and environment drift both hurt.

Reach for something else when your tests are tight, deterministic, low-level assertions where an AI agent adds variance you don't want — raw Playwright in a container is the better tool there. Reach for Selenium Grid if cross-browser coverage across Firefox and Safari is a hard requirement, since a single Chrome container won't give you that. And if you'd rather not operate browser infrastructure at all, a hosted provider is the honest answer, and BrowserBash can point at one with a provider flag, so adopting the CDP-container pattern now doesn't lock you out of the cloud later.

The pattern is not a silver bullet. You're trading selector maintenance for a small probabilistic tax and a model-sizing decision. For many teams that's a great trade; for some it isn't. Knowing which you are is the whole game.

## FAQ

### What is the Chrome DevTools Protocol and why does it matter for Docker?

CDP is the JSON-over-WebSocket interface Chrome's own DevTools uses to control the browser — navigate, click, evaluate scripts, read the DOM. It matters for Docker because a Chrome container started with `--remote-debugging-port=9222` exposes a CDP endpoint that any tool or AI agent can connect to over the network. That decoupling is what lets your test code run in one place and the browser run in another.

### How do I connect an AI agent to a Chrome container over CDP?

Start a Chrome container that exposes a debugging port, then point your agent at the resulting WebSocket URL. With BrowserBash you pass `--provider cdp --cdp-endpoint ws://host:9222/devtools/browser` to the `run` command, and the agent attaches to the running browser instead of launching a local one. If you're unsure of the exact URL, query `http://host:9222/json/version` and use the `webSocketDebuggerUrl` it returns.

### Do I need API keys to run dockerized browser tests with BrowserBash?

No. BrowserBash is Ollama-first and free to install, so with a local Ollama model you need no keys and nothing leaves your machine. The container decides where the browser runs and the model setting independently decides where the AI inference runs — you only add a key if you choose a hosted model like Claude or an OpenAI model. For non-trivial flows, use a mid-size local model rather than a tiny one for reliability.

### Is it safe to expose Chrome's CDP port in CI?

Only on a private network. CDP has no authentication, so anyone who can reach the port can fully control the browser, including reading authenticated sessions. Keep the port on your private Docker network, never publish it to the public internet, and reach it across hosts only through a VPN or authenticated proxy. Treat a Chrome container as a scriptable browser holding live sessions, not a harmless stateless service.

---

Ready to run dockerized browser tests against your own Chrome container? Install the CLI with `npm install -g browserbash-cli` and point it at a CDP endpoint with `--provider cdp`. No account is needed to run; everything works locally and offline with a local model. If you want the optional free cloud dashboard later, [sign up](https://browserbash.com/sign-up) when you're ready.
