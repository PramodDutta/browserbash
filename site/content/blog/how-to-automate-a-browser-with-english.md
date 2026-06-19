---
title: How to automate a browser using plain English
description: "Learn how to automate a browser with English: install a CLI, write a plain-English objective, and get a working run with a pass/fail verdict in minutes."
date: 2026-01-06
category: guide
---

The fastest way to automate a browser with English in 2026 is to stop writing browser code entirely. Instead of opening an editor, importing Playwright, hunting for a stable selector, and wiring up waits, you type one ordinary sentence and let an AI agent drive a real Chrome window for you. "Go to the staging site, log in as the demo user, add the blue backpack to the cart, and confirm the cart shows one item." That sentence is the whole automation. No `data-testid`, no page object, no `await page.waitForSelector`.

This guide takes you from zero to a working run. You will install one tool, write your first plain-English objective, watch it execute against a live page, read the verdict it returns, and make the runs reliable enough for CI. I will use [BrowserBash](https://www.npmjs.com/package/browserbash-cli) — a free, open-source CLI built around exactly this idea — and be honest about where the approach is brilliant and where it still bites, because driving a browser from an English sentence has real limits alongside its real wins.

## What it means to automate a browser with English

Strip away the marketing and the concept is simple. You describe an objective in ordinary language. A large language model reads it against the actual DOM of a live page, picks an action — navigate, click, type, scroll, extract — runs it through a real browser, observes the result, and loops until the goal is met or it gives up. At the end you get a verdict and, when you ask for them, structured values it pulled out along the way.

Compare that to how most teams automate today. A Playwright or Selenium script is a frozen translation of intent into selectors. A human translates the goal into `getByRole('button', { name: 'Submit' }).click()`, tunes the timing, and maintains that translation forever. It is fast and deterministic. It is also fragile: rename a class, restructure a div, ship a redesign, and the script snaps.

Automating a browser with English moves that translation to runtime. The English-to-action mapping is re-derived on every run, against the page as it exists right now. You stop maintaining selectors and start trusting a model to find the right element each time. The upside is far less maintenance; the downside is that a model is non-deterministic and occasionally wrong, which is why how you phrase the instruction — and which model you point at it — matters more than anything else in this guide.

### Why this is suddenly practical

People have wanted to "just tell the browser what to do" for two decades. What changed is that LLMs got good enough at reading a rendered page and reasoning about it step by step. The open-source ecosystem reflects that shift: Browser Use reports a state-of-the-art 89.1% on the WebVoyager benchmark, and Stagehand — the engine BrowserBash uses by default — shipped a v3 in February 2026 that talks straight to the browser over the Chrome DevTools Protocol. Benchmarks rarely survive your weird internal admin panel, but the floor has risen enough that plain-English automation is no longer a demo — it is something you can run today.

## Before you start: what you actually need

Three things, and you almost certainly have two already: **Node.js 18 or newer** (check with `node --version`), **Google Chrome or Chromium** installed locally (the default provider drives the real browser on your machine), and **a model to do the reasoning**. That last one is the only real decision, and Step 2 walks through it — the short version is that if you have [Ollama](https://browserbash.com/learn) running locally, you need nothing else and your model bill is exactly zero.

You do not need an account, a credit card, a cloud login, or an API key to get a first run on screen. The cost of trying this is five minutes, not a procurement conversation.

## Step 1: Install the CLI

One command installs it globally:

```bash
npm install -g browserbash-cli
```

That gives you the `browserbash` command everywhere. The current version is 1.3.1, licensed Apache-2.0, maintained by The Testing Academy (founder Pramod Dutta). The package lives on [npm](https://www.npmjs.com/package/browserbash-cli) and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly what it does before trusting it with a browser. There is no init step, no config file, no project to scaffold. The next thing you type is a real run.

## Step 2: Choose the model that reads your English

The agent needs a brain. BrowserBash defaults to `auto`, which resolves in a deliberate order so the cheapest, most private option wins first:

1. **Local Ollama** is checked first. If a model is reachable, BrowserBash uses `ollama/<model>` — free, no API keys, and nothing leaves your machine. This is the Ollama-first design, and it is the headline reason the model bill can be a hard $0.
2. **`ANTHROPIC_API_KEY`**, if set, routes to `claude-opus-4-8` — a capable hosted model for hard flows.
3. **`OPENAI_API_KEY`**, if set, routes to `openai/gpt-4.1`.
4. If none of those exist, BrowserBash stops and tells you how to fix it, rather than failing cryptically.

You can also pin a model with `--model`. Supported backends include `ollama/<model>` (e.g. `ollama/qwen3`, via `OLLAMA_BASE_URL` and `OLLAMA_MODEL`), `claude-opus-4-8`, Stagehand-backed `openai/gpt-4.1` and `google/gemini-2.5-flash`, and OpenRouter via `openrouter/<vendor>/<model>` (e.g. `openrouter/meta-llama/llama-3.3-70b-instruct` with `OPENROUTER_API_KEY`). The [model-choice walkthrough](https://browserbash.com/tutorials) has the full matrix.

### The honest part about local models

Running everything locally on Ollama is genuinely free and private, and for short objectives it works well. But be realistic about size. Very small local models — roughly 8B parameters and under — get flaky on long, multi-step objectives. They lose the plot around step five, click the wrong thing, or declare victory too early. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. If your first complex run wobbles on a tiny model, that is expected, not a bug — step up the model before you blame the tool.

| Model choice | Cost | Privacy | Good for |
| --- | --- | --- | --- |
| Small local (<=8B) | $0 | Fully local | Short, one- or two-step tasks |
| Mid local (Qwen3 / Llama 3.3 70B) | $0 | Fully local | Most everyday multi-step flows |
| Hosted (Claude, GPT-4.1, Gemini) | Per-token | Leaves machine | Long, brittle, high-stakes flows |
| OpenRouter (any vendor) | Per-token | Leaves machine | Pinning a specific model you like |

## Step 3: Write and run your first objective

Here is a first run you can copy verbatim. It uses the public Sauce Demo site, so it works for anyone.

```bash
browserbash run "go to https://www.saucedemo.com, log in as standard_user, add the first product to the cart, and confirm the cart badge shows 1"
```

That single `run` command does the whole loop. BrowserBash launches your local Chrome, the agent reads the page, and it works through the objective one step at a time. No script file, no selector, no setup. When it finishes it prints whether the objective passed or failed, plus any data it pulled out. The first watch is fun: the browser opens, types the username, clicks around, and reaches the cart on its own — and you never found the login button's selector, handled a navigation wait, or asserted on a DOM node. You stated the outcome; the agent figured out the path. That is the entire pitch for automating a browser with English, working in front of you.

### Anatomy of a good objective

The biggest factor in whether a run succeeds is how you write the sentence:

- **Start with the entry point.** "Go to <url>" removes ambiguity about where to begin.
- **Be specific about data.** "Log in as standard_user with password secret_sauce" beats "log in." The model cannot guess credentials you never gave it.
- **State the success condition explicitly.** End with what "done" looks like: "confirm the cart badge shows 1." This gives the agent — and you — a clear verdict.
- **Keep each objective to one coherent flow.** A login plus a checkout plus a profile edit plus a logout is four objectives, not one. Long chains are where small models fall over and even good models drift, and splitting them makes failures readable.

Vague in, vague out. "Test the site" will produce something, but you will not be able to tell whether it did the right thing. The [reliable-objectives tutorial](https://browserbash.com/tutorials) goes deeper, but those four rules cover most of what separates a clean run from a coin flip.

## Step 4: Read the verdict and the extracted values

A run is not just "it clicked some things." BrowserBash returns a structured result: a pass/fail/error verdict, a short summary, and any values the agent extracted because your objective asked for them. Write "go to the product page and tell me the price and the stock status," and you get those values back as structured fields, not a screenshot you have to eyeball. A script can branch on the verdict; a pipeline can store or alert on the extracted values. You are not parsing prose — you are reading a result.

### See it, record it, store it

A few flags turn a single run into something you can review and trust:

- `--record` captures screenshots and a `.webm` session video via bundled ffmpeg. On the builtin engine it also writes a Playwright trace for Trace Viewer. When a run does something surprising, the video is the fastest way to see why.
- `--headless` hides the browser window — exactly what you want in CI, and not what you want the first time, when watching it work is the whole point.
- `--timeout <seconds>` caps how long the agent gets, so a stuck run fails fast instead of hanging your pipeline.

Every run is also kept on disk at `~/.browserbash/runs`, with secrets masked and the store capped at the most recent 200 — so even a plain `run` leaves a trail you can revisit. For a visual history, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` with no account and nothing uploaded. There is a [local dashboard guide](https://browserbash.com/learn) if you want a tour.

## Step 5: Make it repeatable with markdown tests

Typing a sentence is perfect for exploration. For anything you run more than once — a smoke test, a regression check, a daily monitor — you want it committed to your repo. BrowserBash uses markdown test files (named `*_test.md`) for this:

```bash
browserbash testmd run ./checkout_test.md
```

A markdown test reads like a checklist: each list item is a step. You template values with `{{variables}}`, compose shared setup with `@import`, and mark a variable as secret so it shows up as `*****` in every log line instead of leaking into your terminal history or CI output. After each run it writes a human-readable `Result.md` you can attach to a ticket. This is the format that makes plain-English automation reviewable — a teammate can read the test in a pull request and understand exactly what it checks, because it is English, not selectors. The [markdown tests tutorial](https://browserbash.com/tutorials) covers variables, imports, and secret masking in detail.

## Step 6: Wire it into CI with agent mode

When you run this on every push, you do not want to parse human-readable prose in a pipeline. That is what `--agent` is for. It emits NDJSON — one JSON object per line — so a CI job or an AI coding agent can consume the output cleanly:

```bash
browserbash run "log in and confirm the dashboard loads" --agent --headless
```

You get a stream of progress events shaped like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, then a terminal `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. The exit codes are the part CI cares about: `0` passed, `1` failed, `2` error, `3` timeout. Your pipeline branches on the exit code — no prose parsing, no regex over log lines.

This is also what makes BrowserBash a clean tool for AI coding agents: one can call it, read structured NDJSON back, and verify that the web app it just changed still behaves, without a human inventing assertions. There is a [GitHub Actions walkthrough](https://browserbash.com/blog) and an exit-codes deep dive if you are pushing this into a real pipeline.

## Where the browser actually runs

So far every run has used your local Chrome — the `local` provider, the default, and the right choice while you are learning. But the `--provider` flag lets the same English objective run somewhere else entirely, without changing a word of the instruction:

- `local` — your own Chrome. Default, no setup.
- `cdp` — any DevTools endpoint via `--cdp-endpoint ws://...`, pointed at a browser you control elsewhere.
- `browserbase` — Browserbase's cloud browsers (needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`).
- `lambdatest` — LambdaTest's grid (needs `LT_USERNAME` and `LT_ACCESS_KEY`); auto-selects the builtin engine.
- `browserstack` — BrowserStack's grid (needs `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`); also auto-builtin.

The separation is worth internalizing: the *engine* decides who interprets your English, the *provider* decides where the browser runs. Keep the same engine and sentence, then move from laptop to cloud grid by flipping one flag. The two engines are `stagehand` (the default — MIT-licensed, from Browserbase, with act/extract/observe/agent primitives and self-healing) and `builtin` (an in-repo Anthropic tool-use loop driving Playwright, auto-used for LambdaTest and BrowserStack). Switch with `--engine stagehand|builtin`.

## How this compares to the rest of the field

Plain-English browser automation is crowded now, and being honest about the alternatives is the only way this guide is useful. Here is where the well-known open-source options sit, with competitor facts hedged where they are not public.

| Tool | Interface | License | Local-model story | Best fit |
| --- | --- | --- | --- | --- |
| **BrowserBash** | CLI + markdown tests | Apache-2.0 | Ollama-first, $0 local default | Terminal-native runs, CI, AI agents |
| **Stagehand** | TypeScript/Python SDK | MIT | Hosted-model oriented | Embedding AI steps in existing Playwright code |
| **Browser Use** | Python library | Open source | Configurable; strong with capable models | Python agents, high WebVoyager scores |
| **Skyvern** | SDK + no-code builder | Open source | Uses LLMs + computer vision | Form-heavy flows across many sites |

A few honest calls. If your automation lives inside an existing TypeScript Playwright suite and you want to sprinkle AI steps into code you already maintain, Stagehand as a direct SDK is the more natural fit — BrowserBash uses it as its default engine, so you get the same brains with a CLI wrapped around it. Building a Python agent and want a library to call from your own orchestration? Browser Use is purpose-built for that and posts the strongest WebVoyager number. Wrestling heterogeneous form-filling across dozens of unfamiliar sites? Skyvern's vision-plus-LLM approach is aimed squarely there.

Where BrowserBash earns its place is the terminal-first, CI-first, agent-first shape: one install, one command, structured NDJSON for pipelines, committable markdown tests, an Ollama-first default that keeps your model bill at zero, and the same objective portable across local Chrome and four cloud providers. It is the right tool when you want plain-English automation living next to your git commits and test runner, not inside a chat window. A fuller breakdown lives on the [features page](https://browserbash.com/features).

## When to choose this, and when not to

Use plain-English automation when:

- **The UI changes often.** Fast-moving products and frequently redesigned flows are exactly where selector-based scripts rot and a model re-reading the page each run pays off.
- **You want coverage fast.** Smoke tests and happy-path checks written in English take minutes, not an afternoon of selector hunting.
- **The job is exploratory or one-off.** Pulling a value off a page, checking a flow after a deploy, verifying a third-party login still works — these never justified a full Playwright project, and now they do not need one.
- **An AI agent or a non-coder is the author.** English objectives are reviewable by people who would never read a page object.

Reach for traditional code-first automation when:

- **You need bit-for-bit determinism.** A model is non-deterministic; a Playwright script is not. For a flow that must do the identical thing every run, hand-written code is still the honest answer.
- **The flow is timing-sensitive or deeply API-coupled.** Some automations are really integration tests in a browser costume, and explicit code is clearer.
- **You are stuck on a tiny local model.** If your only option is a small model and the flow is long, expect drift — split the objective hard or accept that this case wants a capable model.

The healthiest stance is not "replace everything." Use English for the 80% that is mostly clicking and reading; keep code for the 20% that demands precision. Most teams land there.

## Privacy, cost, and what leaves your machine

With the default local setup — local Chrome plus a local Ollama model — nothing leaves your machine, and your model bill is a guaranteed $0. No account, no upload, no telemetry to a cloud you did not opt into.

Cloud features are opt-in and explicit. `browserbash connect --key bb_...` links a cloud dashboard, and only then does `--upload` push a specific run up; free cloud runs are kept 15 days. Without `connect` and `--upload`, nothing is sent anywhere — the on-disk run store and local dashboard give you history and review without giving anything up. Pricing for the optional cloud tier is on the [pricing page](https://browserbash.com/pricing).

## A realistic first hour

Here is the path I would take. Install, run the Sauce Demo objective above and watch it move, then add `--record` and replay the video. Rewrite that flow as a `*_test.md` file with a `{{username}}` variable and run it with `testmd run`. Finally add `--agent --headless` and confirm the exit code is `0` on success and `1` when you deliberately break the objective. The whole sequence takes under an hour. You will hit a wobble somewhere — a misread step, a vague sentence. Tighten the objective, bump the model if you are on something tiny, and re-run. Reliability here is mostly a writing skill, and it comes fast.

## FAQ

### Can I really automate a browser with just plain English?

Yes. You write an objective in ordinary language — where to go, what to do, and what "done" looks like — and an AI agent reads the live page, decides which elements to interact with, and performs the steps in a real browser. You write no selectors or scripts. The main skill you develop is phrasing clear, specific objectives, because vague instructions produce vague runs.

### Is automating a browser with English free?

It can be completely free. BrowserBash is open-source under Apache-2.0, and its default model resolution checks for a local Ollama model first. Run locally with Ollama and your own Chrome and there are no API keys, no account, and no per-token charges — your model bill is $0. You only pay if you choose a hosted model like Claude or GPT-4.1, which bill per token.

### Why does my plain-English automation fail on long, multi-step tasks?

The usual cause is the model, not the tool. Very small local models around 8B parameters and under tend to lose track during long objectives, clicking the wrong element or declaring success early. The fix is to use a mid-size local model in the Qwen3 or Llama 3.3 70B class, switch to a capable hosted model for hard flows, or split one long objective into several shorter, single-flow objectives that are easier to keep on track.

### Is plain-English automation reliable enough for CI pipelines?

For smoke tests, happy-path checks, and synthetic monitoring, yes, and the design supports it directly. Agent mode emits NDJSON and returns clear exit codes — 0 pass, 1 fail, 2 error, 3 timeout — so a pipeline branches on the exit code without parsing prose. For flows that demand bit-for-bit determinism, traditional code-first automation is still the more predictable choice, and using both together is common.

---

Ready to try it? Install once and you will have a working run in minutes:

```bash
npm install -g browserbash-cli
```

No account is needed to run locally. Want the optional cloud dashboard later? [Sign up here](https://browserbash.com/sign-up) — but your first plain-English browser automation is one command away.
