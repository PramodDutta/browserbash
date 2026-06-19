---
title: Command-Line Browser Automation: A Practical Getting-Started Guide
description: "A hands-on command-line browser automation quickstart: install the CLI, write a plain-English objective, run headless, and read the pass/fail exit code."
date: 2026-04-17
category: guide
---

Command-line browser automation is the practice of driving a real browser from your terminal, with no IDE, no GUI recorder, and no point-and-click editor in the loop. You type an instruction, a browser opens, something happens, and you get a result you can act on. For years that meant writing Playwright or Puppeteer scripts full of CSS selectors and `waitFor` calls, then running them through a test runner. That approach still works and still has its place. But there is a newer path: describe what you want in plain English, let an AI agent figure out the clicks, and read a single exit code to know whether it worked. This guide walks you through that path end to end, from a clean install to your first headless run, using BrowserBash.

I am going to keep this concrete. By the time you finish reading, you will have installed a CLI, written an objective in a sentence of English, run it against a real Chrome browser without a window, and understood exactly what the exit code is telling you. No selectors, no page objects, no framework scaffolding. If you have ever wanted a single terminal command that says "log in and confirm the dashboard loads" and answers pass or fail, this is the fastest way I know to get there.

## What command-line browser automation actually means

Strip away the marketing and there are two separable ideas here. The first is "browser automation": some program drives a browser engine instead of a human, loading pages, clicking elements, filling forms, and reading the result. The second is "command-line": you trigger and observe all of that from a shell, which means it composes with everything else a shell can do — pipes, exit codes, environment variables, cron, CI runners, and shell scripts.

The combination matters more than either half alone. A GUI test recorder is fine when a person is sitting in front of it, but it does not slot into a `Makefile` or a GitHub Actions job. A library like Playwright slots into CI beautifully, but you have to write and maintain the code first. A command-line tool that takes an English objective sits in between: it is scriptable like a library and approachable like a recorder, without the code in the middle.

Here is the mental model to hold onto. In classic command-line browser automation, *you* are the one translating intent ("the user logs in") into mechanics ("type into `#email`, type into `#password`, click `button[type=submit]`, wait for `.dashboard`"). With an AI agent driving the browser, you hand over the intent and the agent does the translation step by step, looking at the live page each time. You still run it from the terminal, you still get a deterministic exit code, but the brittle middle layer — the selectors — is gone.

## The two families of CLI tools, and where this one fits

It helps to see the landscape before you commit. Command-line browser automation in 2026 splits into two broad families.

| Approach | You write | Drives | Breaks when | Best for |
|---|---|---|---|---|
| Script-based (Playwright, Puppeteer) | Code with selectors and waits | Real browser via CDP/driver | Markup or selectors change | High-volume, deterministic, performance-sensitive runs |
| Agent-based (BrowserBash) | A plain-English objective | Real Chrome, agent decides each step | The intent itself is ambiguous | Fast-changing UIs, smoke checks, one-off flows, non-coders |

Playwright is Microsoft's library and the default for new script-based projects; it supports Chromium, Firefox, and WebKit, ships auto-waiting and a built-in test runner, and is genuinely excellent. Puppeteer is Google's Node library focused on Chrome and Chromium, lean and fast, ideal for screenshots, PDFs, and Chrome-specific scraping. If your markup is stable and you need raw throughput across thousands of runs, a script-based tool is still the right call, and I will say that plainly.

BrowserBash sits in the agent-based family. It is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors and no page objects, and you get back a verdict plus any structured values it extracted. The point is not that it beats Playwright at Playwright's job — it does not try to. The point is that it removes the writing-and-maintaining-selectors job entirely, which for a lot of everyday flows is the whole cost. You can read more about that selector-free philosophy in the [BrowserBash features](https://browserbash.com/features) overview.

## Step 1: Install the CLI

You need two things on your machine: Node.js version 18 or newer, and Chrome (the local provider drives your installed Chrome). Check Node first so you do not chase a confusing error later.

```bash
node --version
npm install -g browserbash-cli
browserbash --version
```

That global install gives you the `browserbash` command anywhere in your shell. The latest version at the time of writing is 1.3.1. If `node --version` prints something below 18, upgrade Node before going further; the agent loop and the bundled browser tooling assume a modern runtime. The package itself lives on [npm as browserbash-cli](https://www.npmjs.com/package/browserbash-cli), and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly what it does before installing it globally.

One thing worth saying up front: you do not need an account to run anything. No sign-up wall, no API key required to get your first result. That is unusual enough in this category that it is worth repeating — install, run, done.

## Step 2: Pick a model (the honest version)

Before your first run, the CLI needs a model to act as the brain that interprets your English and decides each browser action. BrowserBash is Ollama-first, and the default model setting is `auto`, which resolves in a clear order:

1. If you have a local [Ollama](https://browserbash.com/learn) running, it uses `ollama/<model>` — free, no API keys, and nothing leaves your machine.
2. Otherwise, if `ANTHROPIC_API_KEY` is set, it uses `claude-opus-4-8`.
3. Otherwise, if `OPENAI_API_KEY` is set, it uses `openai/gpt-4.1`.
4. If none of those are available, it stops and tells you how to fix it.

The local-first default is the headline feature for a lot of people: run a capable model through Ollama and your model bill is a guaranteed $0, because the page content and your objective never leave your laptop. That is genuinely useful for anything touching internal tools or sensitive data.

Now the honest caveat, because you will hit it otherwise. Very small local models — roughly 8B parameters and under — get flaky on long, multi-step objectives. They will nail "open this page and check the title" and then lose the plot on a six-step checkout. The sweet spot for local is a mid-size model, something in the Qwen3 or Llama 3.3 70B class, which has enough reasoning headroom to stay coherent across a real flow. If you do not have the hardware for that, a capable hosted model (Claude, GPT-4.1, Gemini) handles the hard flows reliably. Do not judge agent-based automation by a 3B model fumbling a long task; that is a model problem, not a tool problem. There is a dedicated [model-choosing guide](https://browserbash.com/tutorials) if you want to go deeper.

You can always pin a model explicitly instead of relying on `auto`:

```bash
# Free and local via Ollama
browserbash run "open example.com and confirm the page title contains Example" --model ollama/qwen3

# Hosted, for harder multi-step flows
browserbash run "log in and verify the dashboard loads" --model claude-opus-4-8
```

## Step 3: Write your first plain-English objective

This is the part that feels strange the first time and obvious the tenth. An objective is just a sentence describing what you want to be true at the end. Treat it like an instruction you would give a careful but literal coworker who has never seen the app.

Good objectives are specific about the *end state* you care about, not the mechanics. Compare:

- Weak: "test the login page"
- Strong: "go to app.example.com, log in with email test@example.com and password from the field, and confirm the account dashboard shows the user's name"

The second one tells the agent what success looks like, which is exactly what it needs to return an honest verdict. You are not writing steps — you are writing the goal. The agent observes the live page, decides the next action, takes it, observes again, and repeats until it has either satisfied the objective or run out of road.

Run a real one now:

```bash
browserbash run "go to the npm page for browserbash-cli and confirm the latest version is shown"
```

A Chrome window opens, the agent navigates, reads the page, checks the claim, and prints a verdict with any values it pulled out. The first time you watch this happen with no selectors written, it reframes what "writing a test" means. If you want a fuller tour of the `run` command and its options, the [tutorials hub](https://browserbash.com/tutorials) has a first-run walkthrough.

### Extracting structured values, not just pass/fail

The agent does not only say yes or no. If your objective implies data — a price, an order number, a count of search results — it returns that in a structured final state alongside the verdict. So "search for wireless headphones and report how many results appear and the price of the first one" gives you both the pass/fail and the actual numbers, which you can then assert on or log. This is where command-line browser automation starts to double as lightweight scraping and monitoring, not just testing.

## Step 4: Run headless

Watching the browser is great for your first few runs and for debugging. For everything else — CI, scheduled checks, anything where no human is looking — you want headless, which skips drawing the visible window. The page still loads, scripts still run, the DOM still builds; nothing is painted to a screen. That makes it faster to start, lighter on memory, and clean to run in a container.

The flag is exactly what you would guess:

```bash
browserbash run "go to status.example.com and confirm all systems show operational" --headless
```

A couple of practical notes from running these in anger. Headless and headed are the same browser with a rendering choice flipped, so behavior is usually identical — but not always. Fonts, some media codecs, GPU-accelerated canvas, and a few permission prompts can differ with no display attached. If a flow passes headed and fails headless (or vice versa), that gap is the first thing to check, and it is a known class of issue rather than a mystery. The nice part of a CLI is that flipping between the two is one flag, not a rewrite, so you can debug headed and ship headless from the same objective. There is a deeper treatment in the [headless automation guide](https://browserbash.com/blog) if you want it.

If you want artifacts from a headless run for later inspection, add `--record`. It captures a screenshot and a `.webm` session video using bundled ffmpeg, so you can watch what the agent actually did even though no window was visible at the time. With the builtin engine it also writes a Playwright trace you can open in the trace viewer.

## Step 5: Read the exit code

Here is the piece that makes command-line browser automation actually useful in a pipeline. Every run returns a process exit code, and your shell, your CI runner, and any orchestrating script can read it without parsing a word of prose.

The codes are:

- `0` — passed
- `1` — failed (the agent ran but the objective was not satisfied)
- `2` — error (something broke — bad config, unreachable site, model unavailable)
- `3` — timeout (the run exceeded its time budget)

Notice the distinction between `1` and `2`. A failed run means the test legitimately did not pass — the dashboard did not load, the price was wrong, the element never appeared. An error means the run could not even reach a verdict. Conflating those two is a classic source of noisy CI, so it is worth wiring them differently: a `1` pages the team that owns the feature, a `2` pages whoever owns the infrastructure.

You read the code the normal shell way:

```bash
browserbash run "confirm the homepage loads and shows the sign-in button" --headless
echo "exit code: $?"
```

In CI, you usually do not even write that line. The runner treats a non-zero exit as a failed step automatically, so a BrowserBash run becomes a gate with no glue code. Set a sane time budget with `--timeout <seconds>` so a hung page turns into a clean `3` instead of stalling the job. If you want the full exit-code reference and CI patterns, that is covered in the [tutorials section](https://browserbash.com/tutorials).

### Machine-readable output with agent mode

When you want progress and the final verdict as structured data instead of human prose, add `--agent`. It emits NDJSON — one JSON object per line. You get `step` events as the run progresses (`{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`) and a terminal `run_end` event with the overall status, a summary, the final state, and the duration in milliseconds. This is built for CI and for AI coding agents that need to consume results without scraping logs. The exit codes line up exactly with the `run_end` status, so you can branch on either.

## Engines and providers: the two knobs worth knowing

Two flags shape *how* and *where* a run executes, and understanding them early saves confusion later.

The **engine** decides who interprets your English and drives the page. `--engine stagehand` is the default — Stagehand is Browserbase's MIT-licensed library built around act, extract, observe, and agent primitives, with self-healing behavior. `--engine builtin` is an in-repo Anthropic tool-use loop driving Playwright directly; it is used automatically for the LambdaTest and BrowserStack providers. For most local runs you never touch this, but it is good to know it is there.

The **provider** decides where the browser actually runs, via `--provider`:

- `local` (default) — your own Chrome, on your machine.
- `cdp` — any DevTools endpoint you point at with `--cdp-endpoint ws://...`.
- `browserbase` — Browserbase cloud (needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`).
- `lambdatest` — LambdaTest grid (needs `LT_USERNAME` and `LT_ACCESS_KEY`, auto builtin engine).
- `browserstack` — BrowserStack grid (needs `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`, auto builtin engine).

The lesson: the same English objective runs against your laptop Chrome today and a cross-browser cloud grid tomorrow by changing one flag. You do not rewrite anything to move from local development to a hosted grid, which is the kind of portability that script-based suites usually pay for with config.

## Committing tests: markdown test files

One-shot `run` commands are perfect for exploration and quick checks. When you want a flow you keep and version-control, BrowserBash has markdown tests — files named `*_test.md` where each list item is a step. You execute them with:

```bash
browserbash testmd run ./login_test.md
```

These files are committable, so they live in your repo next to your code and read like documentation. They support `{{variables}}` templating and `@import` composition so you can build a library of reusable flows. Variables you mark as secret are masked as `*****` in every log line, which matters when an objective involves a password or a token. After each run, the tool writes a human-readable `Result.md` so a non-technical teammate can see what happened without reading raw logs. This is the bridge between throwaway commands and a real, maintained suite — and unlike a selector-based suite, the steps stay readable as the app changes underneath them.

## When to choose command-line agent automation (and when not to)

I want to be balanced here, because the honest answer is "it depends," and pretending otherwise helps no one.

**Reach for agent-based CLI automation when:**

- The UI changes often and you are tired of selectors breaking. The agent reads the live page, so a renamed CSS class does not sink the run.
- You want a flow working in minutes, not after an afternoon of writing page objects.
- The people who need to write or read tests are not all engineers. An English sentence is more inclusive than a TypeScript file.
- You need smoke checks, synthetic monitoring, or a quick "did this still work" gate in CI, where the exit code is the whole product.
- Privacy matters and you want to run a local model so nothing leaves your machine.

**Stick with script-based tools (Playwright, Puppeteer) when:**

- You run the same flow thousands of times a day and per-run latency and cost dominate. Deterministic scripts are faster and cheaper at that volume.
- You need pixel-precise control, deep network interception, or browser internals an agent abstracts away.
- Your markup is genuinely stable and the selector-maintenance cost you are trying to avoid does not actually exist for you.
- You require bit-for-bit reproducibility on every run, where an agent's step-by-step reasoning is a liability rather than a feature.

In practice, plenty of teams run both: Playwright for the high-volume deterministic core, an agent CLI for the long tail of flaky, fast-changing, or one-off flows that were never worth scripting. They are not enemies. There is a fuller side-by-side in the BrowserBash [case studies](https://browserbash.com/case-study), and the [pricing page](https://browserbash.com/pricing) lays out what is free (almost everything for local use) versus the optional cloud extras.

## Optional: dashboards and cloud runs

Two more things you can turn on, both opt-in, neither required.

A free local dashboard ships in the box. Run `browserbash dashboard` and it serves a fully local UI at `localhost:4477` that reads your run history — no account, no upload, nothing leaves your machine. You can also open it for a single run by adding `--dashboard` to a `run` command. If you ever want to wipe the local store, `browserbash dashboard --clear` does that.

Every run is already saved on disk at `~/.browserbash/runs` (secrets masked, capped at 200 runs), so your history exists whether or not you ever open a dashboard.

If you want a shareable cloud view, that is opt-in too. Link your machine once with `browserbash connect --key bb_...`, then add `--upload` to any individual run you want pushed to the cloud. Without `--upload`, nothing leaves your machine, full stop. Free cloud runs are kept for 15 days. You only need to [create a free account](https://browserbash.com/sign-up) for the cloud dashboard — the entire local workflow above needs no account at all.

## Putting it together: a complete first session

Here is the whole getting-started arc as a sequence you can run right now. Install, run headed once to watch it, then run headless and read the exit code the way CI will.

```bash
npm install -g browserbash-cli
browserbash run "go to example.com and confirm the heading says Example Domain"
browserbash run "go to example.com and confirm the heading says Example Domain" --headless
echo "result: $?"
```

If that last line prints `result: 0`, you have just done end-to-end command-line browser automation: a plain-English objective, a real browser driven with no selectors, a headless run, and a pass/fail exit code your pipeline can gate on. Everything else — markdown tests, cloud grids, the dashboard, agent-mode NDJSON — is incremental on top of that core loop.

## FAQ

### What is command-line browser automation?

Command-line browser automation is driving a real web browser from your terminal instead of through a GUI, so that loading pages, clicking, filling forms, and checking results can be scripted and composed with other shell tooling. With a tool like BrowserBash you describe the goal in plain English and an AI agent performs the browser steps, returning a verdict and a process exit code your scripts and CI can read directly.

### Do I need to know how to code to use it?

No. The whole point of the plain-English approach is that you write an objective like "log in and confirm the dashboard loads" rather than code with selectors. You do need to be comfortable running a command in a terminal and installing a global npm package, but you do not need to write JavaScript, manage selectors, or build page objects.

### Can I run command-line browser automation without paying for an API?

Yes. BrowserBash is Ollama-first, so if you run a local model the model bill is zero and nothing leaves your machine. The trade-off is that very small local models (around 8B and under) get unreliable on long multi-step flows, so a mid-size local model in the 70B class, or a capable hosted model for the hardest flows, gives you the most dependable results.

### How do I use the result in a CI pipeline?

Every run returns an exit code — 0 for passed, 1 for failed, 2 for error, and 3 for timeout — and CI runners treat any non-zero exit as a failed step automatically, so no log parsing is needed. For richer integration, add the `--agent` flag to emit NDJSON with per-step events and a final run_end object, which AI coding agents and custom pipelines can consume as structured data.

## Get started

Install it and run your first objective in the next five minutes:

```bash
npm install -g browserbash-cli
```

Then write one sentence of English, run it headless, and read the exit code. No account is required for any of the local workflow above — but if you want the shareable cloud dashboard, you can [create a free account](https://browserbash.com/sign-up) whenever you are ready.
