---
title: Local LLM Browser Testing: Private, Offline, Unmetered
description: "Local LLM browser testing with BrowserBash and Ollama: private, offline, and unmetered. Drive real Chrome from plain English with no API keys."
date: 2026-06-13
category: guide
---

The default assumption baked into most AI testing tools is that the model lives in someone else's data center. You send your pages, your prompts, and often your credentials over the wire, you pay per token, and you hope the rate limits hold during a release. **Local LLM browser testing** flips that assumption. The model runs on your machine, the browser runs on your machine, and the only thing crossing the network is the traffic your tests were going to generate anyway. No API keys, no per-token meter, no data leaving the building.

This guide is about running the *entire* stack locally with [BrowserBash](https://browserbash.com), a free and open-source (Apache-2.0) natural-language browser automation CLI, paired with [Ollama](https://ollama.com) for the language model. You write a plain-English objective, a local AI agent plans the steps and drives a real Chrome or Chromium browser, and you get back a pass/fail verdict plus structured results. No selectors, no page objects, and nothing phoning home. By the end you will have a private, offline-capable, unmetered testing setup you can run a thousand times without watching a billing dashboard.

## What "local" actually means here

"Local" gets used loosely in AI tooling, so it is worth being precise about which pieces of the pipeline stay on your machine. There are three of them, and with this setup all three are local by default:

1. **The browser.** BrowserBash drives the real Chrome or Chromium already installed on your machine. It is not a headless cloud browser you rent by the minute. The page renders locally, JavaScript executes locally, and cookies live in a local profile.
2. **The language model.** Ollama runs open-weight models directly on your CPU or GPU and exposes an OpenAI-compatible API on `http://localhost:11434`. The agent's reasoning, your objective text, and any data it extracts from the page never leave the box.
3. **The orchestration.** The CLI itself is a Node process on your machine. It plans, it calls the local model, it issues browser actions, and it writes results to local files.

The practical consequence is a hard privacy guarantee that is easy to reason about: **nothing leaves your machine unless you explicitly pass `--upload`.** There is no telemetry path that fires by default, no "anonymous usage" beacon, and no model endpoint in a foreign region. If you never type `--upload`, you can run this on an air-gapped laptop and it behaves identically. That property is hard to get from a hosted tool, and it is the whole reason local LLM browser testing exists as a category.

## Why teams want the model on their own hardware

There are three recurring objections to AI-driven browser testing, and running the model locally answers all three at once.

**Privacy and data residency.** The surfaces you most want to test are often the ones you least want to ship to a third party: internal admin tools, staging environments behind a VPN, pages that render real customer records, checkout flows with payment fields. When the model is hosted, every one of those page snapshots becomes an outbound request to a vendor. When the model is local, the page content and the agent's reasoning about it stay put. For regulated environments — health, finance, anything under a data-processing agreement — "the page never left our network" is not a nice-to-have, it is the difference between being allowed to use the tool and not.

**Cost that does not scale with flakiness.** Browser automation is token-hungry. Every step hands the agent a fresh view of the page, and a multi-step flow that retries a couple of times quietly multiplies that. With a hosted frontier model, a debugging session where you run the same flow forty times to chase an intermittent failure shows up on the invoice. Local models cost nothing per run beyond the electricity your laptop already draws. The meter simply does not move, which changes how you work — you stop rationing test runs and start iterating freely.

**No keys, no procurement, no rate limits.** Getting an API key approved inside a company can take longer than writing the tests it would power. Ollama needs no key, no account, and no credit card. You also sidestep the other tax of hosted inference: shared rate limits that throttle exactly when your CI fleet spins up twenty parallel jobs during a release. Your local model's "rate limit" is your own hardware, and it is not competing with anyone else's traffic.

The honest tradeoff: local models are slower than a hosted frontier model, and smaller ones are less reliable on long, branchy flows. We will deal with both directly in the [model selection](#choosing-a-local-model-that-can-actually-drive-a-browser) and [reliability](#making-local-runs-reliable-and-fast-enough) sections. But for the bulk of real testing work — smoke checks, single-page verifications, extraction jobs, CI gates — a local model is more than capable, and the price is unbeatable.

## Standing up the stack

You need three things, and only the first is unusual:

1. **Ollama**, installed and running. Grab it from the official site for macOS, Linux, or Windows. Once running it serves its API on `http://localhost:11434`.
2. **Node.js**, a recent LTS release, so you can install the CLI.
3. **Chrome or Chromium** on the machine. BrowserBash drives your real local browser by default.

Pull a model and install the CLI:

```bash
# Pull a tool-capable local model
ollama pull qwen2.5

# Install the BrowserBash CLI globally
npm install -g browserbash-cli
```

BrowserBash auto-detects providers in a fixed order: **Ollama first**, then Anthropic, then OpenRouter. With Ollama running, you do not configure anything — it is picked up automatically, which is exactly what you want for a local-first workflow. (The CLI lives on the [npm registry](https://www.npmjs.com/package/browserbash-cli) if you want to inspect the package or pin a version.)

Now run your first fully local test:

```bash
browserbash run "go to news.ycombinator.com and verify the top story has at least 100 points"
```

That single command drives your real Chrome through a local model and prints a verdict plus structured results. No key was set, no token was billed, and no page content left your machine. The full setup is what the [BrowserBash Learn guide](https://browserbash.com/learn) walks through if you want the guided version with practice scenarios.

### Running headless and offline

For CI or a headless server, add `--headless` so no visible window is needed:

```bash
browserbash run "open the staging dashboard and confirm the revenue chart renders" --headless
```

Because both the model and the browser are local, this command has no hard dependency on outbound internet beyond reaching the site under test. Point it at an app on `localhost` or an internal host and the entire loop — reasoning, browsing, verdict — runs without touching the public internet. That is the offline property that hosted tools structurally cannot offer: their model is always a network hop away.

## Choosing a local model that can actually drive a browser

This is the decision that makes or breaks local LLM browser testing, so it deserves real attention rather than a one-line "use model X."

The agent does not just chat. On every step it has to read a structured view of the page, decide on a concrete action, and emit it in a format the engine can execute. That last part is the filter: **you need a model that supports tool or function calling and follows a schema reliably.** A surprising number of small models will happily produce fluent prose and then fail to emit a clean action, which manifests as an agent that "talks" about clicking the button without ever clicking it.

A few practical guidelines, stated without inventing benchmark numbers:

- **Prefer instruction-tuned models with explicit tool-use support.** Recent general-purpose open models in the mid-size range are the sweet spot — large enough to follow the action schema, small enough to run on a developer laptop.
- **Bigger is steadier on long flows.** A larger local model holds the thread across a six-step checkout better than a tiny one. If a particular flow keeps wandering, the cheapest fix is often a step up in model size before anything else.
- **Tiny models are fine for tiny jobs.** A 1–3B model can handle a single-page "is this element present" check perfectly well. Reach for it when the task is short; do not ask it to plan a long branching journey.
- **Match the model to your hardware.** A model that swaps to disk is a model that times out. Pick the largest model that fits comfortably in your available RAM or VRAM with headroom to spare.

The workflow that works: start with a capable mid-size model for development, prove your objectives pass reliably, then experiment with smaller models only on the specific tests where speed matters and the task is simple enough to tolerate it.

If you would rather not run a model locally at all on some runs, BrowserBash also speaks to OpenRouter — including genuinely free hosted models such as `openai/gpt-oss-120b:free` — and to Anthropic Claude if you bring your own key. Those are optional escape hatches; the default and the focus of this guide is the all-local path. There is more on mixing providers over on the [BrowserBash blog](https://browserbash.com/blog).

## Writing tests you can commit: Markdown test files

Ad-hoc `run` commands are great for exploration, but a real suite wants something you can check into git and review in a pull request. BrowserBash supports committable Markdown test files — plain `*_test.md` files where each list item is a step.

Create `login_test.md`:

```markdown
# Login smoke test

- Go to https://app.example.com/login
- Type {{username}} into the email field
- Type {{password}} into the password field
- Click the "Sign in" button
- Verify the dashboard heading is visible
```

Run it against your local model:

```bash
browserbash testmd run login_test.md
```

This writes a `Result.md` you can read or attach to a build. Two features make these files genuinely maintainable. First, `@import` lets you compose shared steps — keep a `login_steps.md` and import it into every flow that needs an authenticated session, so the login logic lives in one place. Second, `{{variables}}` are interpolated at run time, and **secret values are masked in all output as `*****`**, so committing a test that uses a password variable never risks leaking the value into your `Result.md` or your CI logs.

Because the whole thing is Markdown driven by a local model, your test suite reads like documentation, runs without a token bill, and never ships your credentials to a vendor.

## Making local runs reliable and fast enough

The two honest weaknesses of local models — speed and occasional drift on long flows — both have practical mitigations.

**Keep objectives tight and single-purpose.** A local model that is asked to "log in, update the profile, change billing, and verify the audit log" has four chances to wander. Four separate, focused tests each succeed more reliably and fail more legibly. This is good test design regardless of the model, but it matters more locally.

**Capture evidence so failures are debuggable.** Add `--record` to capture a screenshot and a session video (a stitched `.webm`) of any run:

```bash
browserbash run "complete checkout with the test card and verify the confirmation page" --record
```

When a local model does something unexpected, a video of exactly what the browser did turns a vague "it failed" into a five-second diagnosis. The two engines give you a choice here: the default `stagehand` engine (MIT, open source, from Browserbase) and the in-repo `builtin` engine (an Anthropic tool-use loop). The `builtin` engine additionally captures a Playwright trace, which is invaluable when you want to step through a failure frame by frame.

**Warm the model and reuse it.** The first call after a cold start pays the model-load cost. In CI, keep the Ollama process resident across the suite rather than restarting it per test, so only the first test eats the load time.

**Right-size before you optimize.** If a flow is flaky on a small model, try a larger one before you start rewriting objectives. It is the highest-leverage knob and the easiest to turn.

## Wiring local tests into CI

A local stack is not just for laptops — it shines in CI, where avoiding per-token costs and shared rate limits across a fleet of parallel jobs is a direct, recurring saving. Agent mode is built for exactly this.

```bash
browserbash run "sign in and verify the account page loads" --agent --headless
```

The `--agent` flag emits **NDJSON** — one JSON event per line, with a stable schema — instead of prose. Your pipeline or an AI coding agent reads structured events directly; there is no log-scraping or output-parsing fragility. The exit code tells the runner what happened with no ambiguity:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

That maps cleanly onto any CI system's pass/fail gate. A run that returns `1` fails the build; a `0` lets it through. Because the model is local, this gate has no external dependency that can rate-limit you mid-release and no usage line that grows with the size of your test matrix.

### Keeping a private record of runs

Local does not have to mean ephemeral. BrowserBash ships a free, private **local dashboard** that keeps run history, recordings, and per-run replay entirely on your machine:

```bash
browserbash dashboard
```

That is the natural companion to a local-first setup: full visibility into what your tests did, with the same privacy guarantee as the runs themselves. Nothing about it requires an account or an upload.

If and when you *do* want to share a run — say, to hand a failing recording to a teammate — you can opt in explicitly. Create a free account, connect once, and push selected runs:

```bash
browserbash connect --key bb_your_key_here
browserbash run "verify the signup flow end to end" --record --upload
```

The `--upload` flag is the single, deliberate switch that sends a run to the cloud dashboard (run history, recordings, replay; runs are retained for 15 days on the free tier). The point worth repeating: it is opt-in per run. Your default local LLM browser testing stays entirely on your hardware, and you reach for the cloud only when sharing is the goal.

## Scaling out without giving up the local default

Sometimes you genuinely need a browser you do not have locally — a specific OS-and-browser combination, or massive parallelism. BrowserBash decouples *where the browser runs* from *where the model runs*, so you can keep your reasoning local while borrowing remote browsers. One flag switches the provider:

```bash
browserbash run "verify the homepage renders on Safari" --provider lambdatest
```

The available providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. This matters for the local story because it is additive, not a replacement: your everyday runs stay on your own machine and your own model, and you reach for a remote grid only for the specific cross-browser cases that require it. You are never forced off the local path to get coverage you occasionally need.

## A realistic local-first workflow

Putting the pieces together, here is how a team actually uses this day to day:

1. **Develop interactively** with `browserbash run "..."` against a mid-size local model, iterating freely because nothing is metered.
2. **Promote stable flows** into committed `*_test.md` files with `{{variables}}` for anything environment-specific and masking for secrets.
3. **Gate CI** with `--agent --headless`, letting exit codes pass or fail the build, with the model running locally on the runner.
4. **Record on failure** with `--record` so every red build comes with a video, and step through `builtin`-engine traces when you need frame-level detail.
5. **Keep history** in the private local `dashboard`, and `--upload` only the specific runs you want to share.

Every step in that loop runs on your own hardware by default. The model is local, the browser is local, the results are local, and you decide — explicitly, per run — if anything ever leaves.

## FAQ

### Do I need any API keys for local LLM browser testing?

No. With Ollama running, BrowserBash auto-detects it and uses it as the model with no key, no account, and no credit card. API keys only come into play if you deliberately opt into a hosted provider like Anthropic or OpenRouter, and even those are optional. The all-local path needs nothing but Ollama, Node.js, and a local Chrome.

### Will my page content or credentials ever leave my machine?

Not by default. The browser, the model, and the orchestration all run locally, so page snapshots and the agent's reasoning stay on the box. Nothing is sent anywhere unless you explicitly pass `--upload` to push a run to the cloud dashboard. Secrets in Markdown tests are also masked as `*****` in all output, so even your local result files do not leak credential values.

### Which local model should I use?

Pick an instruction-tuned, open-weight model with explicit tool or function calling support, in the mid-size range that fits comfortably in your RAM or VRAM. That combination reliably emits the structured actions the agent needs to drive the browser. Larger models hold up better on long, multi-step flows; small 1–3B models are fine for short single-page checks. If a flow keeps drifting, stepping up the model size is usually the fastest fix.

### Can I run local tests in CI and still get pass/fail gating?

Yes. Run with `--agent --headless`: the `--agent` flag emits NDJSON with a stable schema, and the process returns exit code 0 for passed, 1 for failed, 2 for error, and 3 for timeout. Any CI system can gate on those codes directly with no log parsing. Keeping the Ollama process resident across the suite avoids paying the model-load cost on every test.

## Get started

Local LLM browser testing gives you privacy by default, no token meter, and a stack that runs offline on hardware you already own — all from plain-English objectives instead of brittle selectors. BrowserBash is free and open source (Apache-2.0), so you can read every line, run it air-gapped, and never wonder where your pages are going.

Install it with `npm install -g browserbash-cli`, point it at a local Ollama model, and you are testing in minutes. When you are ready to keep a shareable run history or push a recording to a teammate, [create a free account](https://browserbash.com/sign-up) — it is free, it is open source, and the local-first default never changes.
