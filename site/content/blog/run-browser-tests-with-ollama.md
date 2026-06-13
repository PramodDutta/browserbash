---
title: How to Run Browser Tests With Ollama (Free, Local, Private)
description: "Run browser tests with Ollama using BrowserBash: free, local, private, no API keys. Step-by-step setup, model picks, CI, and troubleshooting."
date: 2026-06-13
category: guide
---

Most "AI-powered" browser testing tools assume you are happy to mail your pages, prompts, and credentials to someone else's server and pay per token for the privilege. You do not have to. If you want to **run browser tests with Ollama** — a free, local LLM runtime that never phones home — you can drive a real Chrome browser entirely from your own machine, with no API keys and nothing leaving your laptop. This guide shows you exactly how, using [BrowserBash](https://browserbash.com), a free and open-source (Apache-2.0) natural-language browser automation CLI that treats local Ollama as a first-class brain.

The pitch is simple: you write a plain-English objective like "open the login page, sign in, and verify the dashboard loads," and an AI agent plans the steps, drives a real browser, and returns a pass/fail verdict plus structured results. No selectors. No page objects. And because the model runs locally through Ollama, no token bill and no data egress. Let's build that setup from scratch.

## Why local models change the calculus

There are three recurring objections to AI browser testing, and Ollama addresses all of them at once.

**Cost.** Hosted frontier models charge per token, and browser automation is token-hungry — every step sends the agent a fresh view of the page. A flaky multi-step flow that retries a few times can quietly become a line item. Ollama models cost nothing to run beyond the electricity your machine already draws. You can run a thousand iterations of a test while you debug it and the meter never moves.

**Privacy.** Internal apps, staging environments behind a VPN, pages with real customer data — these are exactly the surfaces you most want to test and least want to ship to a third party. When the model runs locally, the page content, your objective text, and any extracted data stay on the machine. BrowserBash reinforces this: nothing leaves your machine unless you explicitly pass `--upload`. No flag, no egress.

**Keys and procurement.** Getting an API key approved at a company can take longer than writing the tests. Ollama needs no key, no account, and no credit card. You install it, pull a model, and you are running.

The tradeoff is honest and worth stating up front: local models are slower than a hosted frontier model, and smaller ones are less reliable on long, multi-step flows. We will deal with both of those head-on later in the guide. But for a large share of real testing work — smoke checks, single-page verifications, extraction jobs, CI gates — a local model is more than capable, and the price is unbeatable.

## What you need before you start

Three things, and only the first is non-obvious:

1. **Ollama**, installed and running. Download it from the official site for macOS, Linux, or Windows, or install it with your package manager. Once it is running, it serves an OpenAI-compatible API on `http://localhost:11434` by default.
2. **Node.js** (a recent LTS release) so you can install the CLI from npm.
3. **A Chrome or Chromium browser** on the machine. BrowserBash drives your real local browser by default.

That is the entire dependency list for a fully local stack. No cloud account, no API key, no Selenium grid.

## Step 1: Install BrowserBash

BrowserBash ships as a single global npm package. Install it once:

```bash
npm install -g browserbash-cli
```

You can confirm it landed and check the available commands:

```bash
browserbash --help
```

The package page lives on [npm](https://www.npmjs.com/package/browserbash-cli) if you want to pin a version or read the changelog. There is no separate "AI plugin" to install and no model SDK to wire up — model detection is built in, which is the part that makes the Ollama path so short.

## Step 2: Pull an Ollama model

Ollama models are pulled by name. The documented starting point for BrowserBash is Qwen3, which balances capability against the resources a typical developer machine has:

```bash
ollama pull qwen3
```

This downloads the model weights once and caches them locally. From then on, the model is available offline. You can pull several models and switch between them per run — a small one for quick single-page checks and a larger one for gnarly end-to-end flows. We will get to picking sizes shortly; for now, one model is enough to prove the pipeline works.

## Step 3: Run your first local browser test

Here is the moment the whole setup pays off. With Ollama running and a model pulled, you do not have to configure anything. BrowserBash defaults to a model setting of `auto`, and `auto` resolves in this order:

1. **Ollama running locally** → it uses `ollama/<your model>` — free, open source, no keys.
2. `ANTHROPIC_API_KEY` set → it uses Claude.
3. `OPENAI_API_KEY` / OpenRouter set → it uses a hosted model.
4. Otherwise → a helpful error explaining how to set one of the above.

Because Ollama sits at the top of that list, a running Ollama means the local path is also the zero-config path. Just run an objective:

```bash
browserbash run "Open https://example.com and verify the page heading is visible"
```

That single command spins up a real browser, lets the agent plan and execute the steps, checks the assertion implied by "verify," and exits with a status code you can act on. No selector. No setup file. The brain is your local Ollama model, so nothing about that page or that instruction left your machine.

If you want to be explicit rather than relying on auto-detection — which is a good habit in scripts and CI — pin the model directly:

```bash
browserbash run "Open https://example.com and store the main heading as 'title'" --model ollama/qwen3
```

The name after `ollama/` must match a model your Ollama instance actually serves. To make auto-detection deterministic without naming the model on every command, set an environment variable once:

```bash
export OLLAMA_MODEL=qwen3
browserbash run "Open https://example.com and verify the heading is visible"
```

Now `auto` will reliably select `qwen3` instead of falling back to "first installed model," which matters the day you pull a second model and forget which one Ollama lists first.

## Step 4: Run headless and capture proof

By default you will see a browser window open, which is great while you are writing a test. For CI or background runs, go headless:

```bash
browserbash run "Open https://example.com and verify the heading is visible" --headless
```

When a run fails — or when you simply want a receipt — capture it. The `--record` flag saves a screenshot and a session video (a stitched `.webm`) on any engine, so you have visual proof of exactly what the agent saw and did:

```bash
browserbash run "Open https://example.com and sign in, then verify the dashboard loads" --record --headless
```

This is one of the quiet advantages of a local-first setup: you can record everything, liberally, without worrying that the artifacts or the page content touched a cloud service. The recordings sit in your working directory like any other build output.

## Step 5: Turn objectives into committable markdown tests

One-off commands are perfect for exploration, but real suites want something you can version-control and review in a pull request. BrowserBash supports committable markdown test files — plain `*_test.md` files where each list item is a single step. Here is a login smoke test, `login_test.md`:

```markdown
# Login smoke test

- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field
- Click the "Sign in" button
- Verify the text "Welcome" is visible
```

Run it like this:

```bash
browserbash testmd run login_test.md --headless
```

Backend resolution is identical to `browserbash run`, so with Ollama running and no keys set, this whole file executes locally on your machine. Each run writes a `Result.md` next to the test file, giving you a readable record of what passed.

A few things in that example are worth calling out because they matter specifically for local models:

- **`{{variables}}`** like `{{base_url}}` and `{{password}}` are injected at run time, and secrets are masked in output as `*****`. Even though everything is local, you still do not want a password sitting in plain text in your logs.
- **One step per list item** is not just tidy — it is a reliability technique. Smaller local models stay on rails far better when each instruction is short and explicit than when you hand them one sprawling paragraph. More on that next.
- **`@import`** lets you compose shared steps (a reusable login sequence, say) across many test files, so you are not copy-pasting the same five lines into every suite.

## Choosing the right Ollama model

This is the single decision that most affects how well a local setup works, so let's be specific rather than hand-wavy.

The honest guidance from the BrowserBash documentation is blunt: models of roughly **8B parameters and under tend to be flaky on multi-step objectives**, while the **Qwen3 / Llama 3.3 70B class** is the sweet spot for real flows. That maps to a practical rule of thumb.

A small model (8B-ish) is genuinely fine for:

- Single-page verifications ("is the banner visible?", "does the heading say X?").
- Short extraction jobs ("store the price as 'price'").
- Quick local iteration while you draft a test.

A larger model (the 70B class) earns its keep on:

- Multi-step end-to-end journeys — login, navigate, act, assert across many pages.
- Flows where the agent has to reason about state ("if a cookie banner appears, dismiss it first").
- Anything where a small model keeps "wandering" — drifting back to a previous page mid-flow or verifying the wrong element.

Two strategies make smaller models punch above their weight, and you should reach for them before you reach for a bigger model:

1. **Split long flows into short tests.** A twenty-step objective fails more often than two ten-step tests. The markdown format makes this natural — each list item is one verified step, which keeps a smaller model focused.
2. **Give long flows headroom.** Multi-step runs need time and step budget. BrowserBash defaults to a 300-second timeout and 30 steps; bump both for a heavy journey:

```bash
browserbash testmd run checkout_test.md --headless --timeout 300 --max-steps 40
```

If you have the hardware, serving a 70B-class model is the most reliable single upgrade for complex suites. If you do not, splitting flows and pinning a known-good smaller model gets you surprisingly far.

## Pointing BrowserBash at vLLM, LM Studio, or a remote GPU box

A lot of teams have one beefy machine with a GPU and several laptops without. You do not have to install models everywhere. BrowserBash talks to Ollama over its OpenAI-compatible endpoint, and that endpoint is configurable with a single environment variable, `OLLAMA_BASE_URL` (it defaults to `http://localhost:11434/v1`).

Because the protocol is OpenAI-compatible, the same `ollama/<model>` flag works against **any** OpenAI-compatible server — vLLM, LM Studio, or llama.cpp — not just Ollama itself. So you can serve a big model from the GPU box and point your laptop at it:

```bash
export OLLAMA_BASE_URL=http://gpu-box.local:8000/v1
browserbash run "Open {{base_url}} and verify the signup button is visible" --model ollama/qwen3
```

The model name after `ollama/` should match whatever the remote server actually serves. A common split that works well: LM Studio on a laptop for quick experiments, and vLLM on the GPU box serving a 70B model for the nightly suite — all driven by the same CLI and the same test files, just a different base URL.

## Wiring local tests into CI

Local models and CI are a natural fit: your runner already has CPU and memory, and you avoid storing an LLM API key in the pipeline's secrets. BrowserBash is built for automation, so the integration is clean.

For machine-readable output, use agent mode. `browserbash run "..." --agent` emits NDJSON — one JSON event per line, on a stable schema — instead of prose, so a CI job or an AI coding agent can consume the stream without parsing human sentences:

```bash
browserbash run "Open https://example.com and verify the heading is visible" --agent --headless
```

Just as important, the process exits with a meaningful status code, so your pipeline can branch on it without scraping logs at all:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

A minimal CI step is therefore just the command itself; a non-zero exit fails the build the way any other test command would. On the runner you would install Node and Ollama, `ollama pull` your chosen model in a setup step, then run the suite. The same `*_test.md` files you committed run identically there, writing their `Result.md` artifacts for you to upload.

## A realistic end-to-end example

Putting the pieces together, here is what a small local suite looks like in practice. Pull a model, write a couple of committed tests, and run them headless against your staging environment with recordings on:

```bash
# one-time setup
ollama pull qwen3
export OLLAMA_MODEL=qwen3
export BASE_URL=https://staging.internal.example

# run the committed suite locally, with proof
browserbash testmd run smoke/login_test.md --headless --record
browserbash testmd run smoke/checkout_test.md --headless --record --timeout 300 --max-steps 40
```

Every page in that staging app, every credential, and every screenshot stays on the machine running the tests. No key was provisioned, no token was billed, and nothing was uploaded. That is the whole point of running browser tests with Ollama.

## When local is the right call — and when it isn't

Local models are excellent, but they are not the answer to every situation. Here is a fair comparison of the two paths BrowserBash supports, so you can choose deliberately.

| Dimension | Local Ollama models | Hosted frontier models (optional) |
| --- | --- | --- |
| Cost | Free to run; uses hardware you already own | Per-token billing that scales with run volume |
| API keys | None required | Requires a key (and often procurement) |
| Data privacy | Page content and prompts stay on your machine | Page content is sent to the provider's API |
| Speed | Slower; depends on your hardware | Generally faster, hosted on optimized infrastructure |
| Reliability on long flows | Strong with 70B-class models; small models can drift | Generally strong out of the box |
| Best for | Smoke tests, single-page checks, extraction, CI gates, private apps | The occasional hardest multi-step flow when local keeps flaking |
| Setup friction | Install Ollama, pull a model | Set an environment variable with a key |

**Choose local Ollama when** cost matters, the app or data is sensitive, you cannot or do not want to manage an API key, or the work is well-suited to local models — which covers most smoke tests, single-page verifications, extraction jobs, and CI gates. This is the default, and for good reason.

**Reach for a hosted model when** one specific flow keeps flaking even on a 70B-class model and you need maximum reliability for that case. The nice part is that the escape hatch is per-test, not architectural. Set `ANTHROPIC_API_KEY` (or use OpenRouter, which has genuinely free models such as `openai/gpt-oss-120b:free`) and run just that one file with `--model claude-opus-4-8`, while every other test stays local. Because `auto` prefers a running Ollama by design, reaching for a cloud model is always an explicit choice — never a surprise.

For most teams the answer is a blend: local by default for the broad suite, with a hosted model held in reserve for the one or two flows that genuinely need it.

## A note on engines

Worth knowing as you scale up: BrowserBash ships two engines, and both work with Ollama. The default is `stagehand` (the open-source, MIT engine from Browserbase), and the second is `builtin` (an in-repo Anthropic tool-use loop). The default is the right choice for almost everyone, and the model resolution described above applies regardless of engine — so your local Ollama setup carries over either way. If you want to see your local runs collected in one place, BrowserBash also includes a free, private local dashboard you can launch with `browserbash dashboard`, with no upload and no account.

If you want to go deeper on any of this — engines, providers, the markdown test format, agent mode — the [BrowserBash learn pages](https://browserbash.com/learn) walk through each piece, and the [blog](https://browserbash.com/blog) has focused write-ups on CI patterns and the local-first stack.

## FAQ

### Do I need an API key to run browser tests with Ollama?

No. That is the whole appeal. Ollama runs models locally and requires no API key, no account, and no credit card. BrowserBash auto-detects a running Ollama and uses it before any cloud provider, so once Ollama is running and a model is pulled, you can run tests immediately with zero keys configured.

### Which Ollama model should I start with for browser testing?

Start with `ollama pull qwen3`, the documented starting point. Expect models of 8B parameters and under to be flaky on multi-step objectives — they are fine for single-page extraction and verification, but the Qwen3 / Llama 3.3 70B class is the documented sweet spot for real, multi-step flows. If a small model keeps drifting, split the flow into shorter tests before reaching for a bigger model.

### Is anything sent to the cloud when I use Ollama with BrowserBash?

No. The model runs locally through Ollama, and BrowserBash sends nothing off your machine unless you explicitly pass `--upload`. Page content, your objective text, extracted data, and recordings all stay local by default, which makes this combination well-suited to internal apps and staging environments with sensitive data.

### Can I use a GPU server or vLLM instead of running Ollama on my laptop?

Yes. Set `OLLAMA_BASE_URL` to your server's OpenAI-compatible endpoint, for example `http://gpu-box.local:8000/v1`, and pass `--model ollama/<model>` with the name your server serves. The same flag works against Ollama, vLLM, LM Studio, and llama.cpp, so you can serve a large model from one GPU box and drive it from any number of laptops.

---

Ready to run your first local, private browser test? Install the CLI with `npm install -g browserbash-cli`, point it at your Ollama model, and you are off — free, open source, and entirely on your own machine. When you want run history and replays across a team, [create a free account](https://browserbash.com/sign-up) and push a run with `--upload`. BrowserBash is free and open source, so there is nothing to unlock and nothing to pay.
