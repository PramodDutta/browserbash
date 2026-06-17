---
title: Run AI Browser Tests on Browserbase With One Flag
description: "Learn how to run browser tests on Browserbase with BrowserBash using --provider browserbase for headless cloud Chrome and fast parallel runs."
date: 2026-03-28
category: guide
---

If you want to run browser tests on Browserbase without rewriting your suite, the short version is one flag. BrowserBash points its AI agent at a remote, headless cloud Chrome session by adding `--provider browserbase`, and the same plain-English objective you ran locally now executes on Browserbase's infrastructure instead of your laptop. No selectors change, no page objects get refactored, no new SDK gets bolted on. You write "log in, add an item to the cart, complete checkout, verify the order confirmation," and the agent drives a real browser through it — the only difference is *where* that browser lives.

This guide is a hands-on walkthrough of doing exactly that. I'll cover when a remote session genuinely beats local Chromium, when it doesn't, how to wire credentials safely, how to fan out parallel runs in CI, and where the honest trade-offs are. BrowserBash is a free, open-source CLI under Apache-2.0 from The Testing Academy, so every command here is runnable today.

## What "run browser tests on Browserbase" actually means

Browserbase is a cloud platform that runs headless Chromium sessions for you and exposes each one over the Chrome DevTools Protocol (CDP). Instead of launching a browser on your own machine, you ask Browserbase for a session, and it hands back a WebSocket endpoint that any CDP-aware automation tool can connect to. That's the whole model: the browser runs in their data center, your automation logic drives it remotely.

BrowserBash already speaks this language. The CLI's default engine is Stagehand, itself an MIT-licensed project built by Browserbase, so the integration is first-class rather than a hack. When you pass `--provider browserbase`, BrowserBash provisions a remote session, connects the agent to it, and runs your objective there. The AI agent still does the reasoning — read the page, decide the next action, click, type, verify — but the pixels and the DOM live on a cloud machine.

It helps to separate two concepts that often get conflated:

- **The provider** is *where the browser runs*. BrowserBash supports `local` (your own Chrome, the default), `cdp` (any DevTools endpoint you point at), `browserbase`, `lambdatest`, and `browserstack`. You switch between them with a single `--provider` flag.
- **The engine** is *how the agent thinks and acts*. BrowserBash ships two: `stagehand` (the default) and `builtin` (an in-repo Anthropic tool-use loop). The engine is independent of the provider.

So "run browser tests on Browserbase" means keeping your objective and engine exactly as they are, and flipping the provider so the browser is a remote cloud Chrome instead of the one on your desk.

## Why a remote cloud browser beats local Chromium (sometimes)

Local Chromium is the right default for most day-to-day work. It's free, fast to start, and there's nothing between your test and the browser. But there are specific situations where a remote session on Browserbase is clearly the better tool. Here's the honest breakdown.

### Parallelism without melting your laptop

The single best reason to go remote is concurrency. Running ten browser sessions locally means ten Chromium processes fighting over your CPU, RAM, and a single network egress; the machine slows to a crawl and your timings get noisy as everything contends for the same resources.

When you run browser tests on Browserbase, each session is its own isolated cloud machine. Twenty parallel runs don't touch your laptop at all — they're twenty independent browsers in the cloud. For a CI matrix or a large regression suite, that's the difference between a forty-minute serial run and a four-minute parallel one.

### Clean, reproducible environments

A local browser carries your baggage: extensions, cached cookies, OS fonts, timezone, saved logins. That's fine until a test passes on your machine and fails on a colleague's. Remote sessions start from a known-clean state every time, which kills an entire category of "works on my machine" flakiness.

### CI runners with no display

Headless CI environments — GitHub Actions, GitLab runners, a bare Docker container — often lack a display server, the right Chrome dependencies, or enough memory to run a browser reliably. Offloading the browser to Browserbase means your CI job only needs Node and the BrowserBash CLI; the heavy lifting happens elsewhere.

### When local Chromium is the better choice

Remote is not a free win, so let's be clear about the other direction:

- **Debugging a new flow.** When you're iterating on an objective, local Chrome with a visible window beats any remote session — you see the browser, catch the problem, and fix the prompt. Run locally first, then promote to remote once the flow is stable.
- **Testing localhost.** If the app under test runs on `http://localhost:3000`, a cloud browser can't reach it without a tunnel. Local Chromium just works.
- **Cost sensitivity on huge volumes.** Browserbase bills by session minutes, and proxy traffic is billed separately. For a small team running occasional checks, local is $0.
- **Latency-sensitive timing.** A remote session adds network round-trips between your CLI and the browser. For most functional checks this is invisible; for microsecond timing it matters.

The takeaway: develop locally, scale remotely. That's the pattern this whole guide is built around. If you want the conceptual background on how the agent drives any browser, the [BrowserBash learn pages](https://browserbash.com/learn) go deeper.

## Local vs. Browserbase vs. other providers

Here's a side-by-side to make the decision concrete. BrowserBash treats all of these as interchangeable providers behind one flag, so you're choosing based on the job, not locking into a vendor.

| Dimension | `local` (default) | `browserbase` | `cdp` (self-hosted) |
|---|---|---|---|
| Where browser runs | Your machine | Browserbase cloud | Any CDP endpoint you control |
| Setup | None | API key | You run the browser |
| Cost | $0 | Per session minute (paid plan) | Your infra cost |
| Parallel scale | Limited by your CPU/RAM | High, cloud-isolated | Limited by your fleet |
| Clean environment | No (your profile) | Yes, per session | Depends on your setup |
| Reaches localhost | Yes | No (needs tunnel) | Depends |
| Best for | Dev, debugging, small runs | CI parallelism, clean runs | Custom/regulated infra |

A few honest notes on this table. Browserbase's exact pricing tiers change over time and aren't worth quoting to the dollar here — check their current pricing page before you commit a budget, because session-minute rates and proxy charges are what actually drive your bill. As of 2026, the platform is positioned squarely at AI-agent workloads and JS-heavy sites, which is exactly the kind of work BrowserBash hands it. The `cdp` provider is the escape hatch: if you run your own browser fleet or use another cloud that exposes a DevTools WebSocket, point BrowserBash straight at it and skip the managed providers entirely.

LambdaTest and BrowserStack are the other two managed options, and they shine when you need a broad grid of real browser and OS combinations rather than a pool of headless Chrome. If cross-browser coverage across Safari, Firefox, and old Edge is the goal, those are the better fit — and BrowserBash will happily target them with `--provider lambdatest` or `--provider browserstack`. Browserbase's strength is headless Chrome at scale for agentic flows, not a hundred browser-version permutations. Pick the provider that matches the question you're trying to answer.

## Your first run on Browserbase

Let's get a test running. First, install the CLI and confirm it works locally before going anywhere near the cloud.

```bash
# Install the CLI globally
npm install -g browserbash-cli

# Smoke-test locally first — watch the agent drive your own Chrome
browserbash run "go to the BrowserBash docs and confirm the page title mentions BrowserBash"
```

That local run is your sanity check. The agent launches Chrome, reads the page, and returns a verdict plus structured results. No API keys, nothing leaves your machine — BrowserBash defaults to free local Ollama models, so your model bill is genuinely $0 by default. If that works, you're ready to go remote.

To run browser tests on Browserbase, you need a Browserbase API key, which the CLI reads from your environment. Then it's the same command with one flag added:

```bash
# Provide your Browserbase credentials
export BROWSERBASE_API_KEY="bb_live_xxxxxxxx"
export BROWSERBASE_PROJECT_ID="your-project-id"

# Same objective, now running on remote headless cloud Chrome
browserbash run "go to the BrowserBash docs and confirm the page title mentions BrowserBash" \
  --provider browserbase
```

Read that carefully: the objective string is byte-for-byte identical to the local run. That's the entire point of the provider abstraction. You proved the flow locally, and promoting it to the cloud is a one-flag change. The agent now connects to a Browserbase session over CDP, drives the remote browser, and streams the same verdict back to your terminal.

### What changes and what doesn't

When you flip to the Browserbase provider, here's what moves and what stays put:

- **Stays the same:** your objective text, your engine, your verdict format, your exit codes, your recordings, your Markdown test files.
- **Moves to the cloud:** the browser process, its CPU/RAM usage, its network egress, and its starting profile state.
- **New requirement:** the app under test must be reachable from the public internet (or via a tunnel), because a cloud browser can't see your `localhost`.

That last point trips people up. A staging or production URL is fine; a dev server on your laptop needs a preview build or a tunnel before going remote.

## Headless by default, with recordings when you need them

Cloud sessions are headless by nature — there's no monitor in a data center. Locally, you can force headless mode yourself when you want to mirror CI behavior:

```bash
browserbash run "search for 'wireless headphones', open the first result, and verify a price is shown" \
  --headless \
  --record
```

The `--record` flag is worth calling out because it solves the biggest pain of headless runs: you can't watch them. With `--record`, BrowserBash captures a screenshot and a full `.webm` session video (via ffmpeg) on any engine, so when a remote run fails you have footage of exactly what the agent saw and did. If you're on the `builtin` engine, it additionally captures a Playwright trace you can open in the trace viewer and step through action by action.

This matters more on remote providers than locally. When the browser is on your screen, debugging is a glance. When it's in the cloud, the recording *is* your eyes. Always record your remote runs until a flow is rock-solid — the storage is cheap and the debugging time it saves is not.

## Committable Markdown tests that run anywhere

Ad-hoc objectives on the command line are great for exploration, but real suites want to live in version control. BrowserBash supports committable `*_test.md` files where each list item is a step. These read like a checklist a human could follow, and the provider flag works on them exactly the same way.

Here's a checkout flow as a Markdown test. Notice the `{{variables}}` templating and the secret marking — secret-marked variables are masked as `*****` in every log line, so credentials never leak into your CI logs or your recordings.

```bash
# checkout_test.md
# Variables: store_email, store_password (secret), product_name

# Steps:
# - Go to {{store_url}} and log in as {{store_email}} with {{store_password}}
# - Search for "{{product_name}}" and open the first result
# - Add the item to the cart and proceed to checkout
# - Complete the order with the saved test payment method
# - Verify the page shows "Thank you for your order!"

# Run it remotely on Browserbase
browserbash testmd run ./checkout_test.md --provider browserbase --record
```

After each run, BrowserBash writes a human-readable `Result.md` next to your test, so reviewers can see what happened without digging through logs. You also get `@import` composition, which lets you factor a login flow into a shared `login_test.md` and import it into every suite that needs it — the same DRY discipline you'd expect from a code-based framework, but in plain prose. The [features overview](https://browserbash.com/features) lists the full set of what the test format supports.

The big idea: a Markdown test is provider-agnostic. The same `checkout_test.md` runs against local Chrome while you develop and against Browserbase in CI, with zero edits to the file. You change one flag in the command, not the test.

## Wiring Browserbase into CI for parallel runs

This is where remote sessions earn their keep. The `--agent` flag turns BrowserBash into a clean machine interface: it emits NDJSON (one JSON event per line) on stdout, and it uses meaningful exit codes — `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, no scraping log output with regex. Your CI just reads the exit code and, if it wants detail, parses the NDJSON stream.

```bash
# A CI step: run a critical-path flow on Browserbase, machine-readable output
browserbash testmd run ./checkout_test.md \
  --provider browserbase \
  --agent \
  --record \
  --upload
```

A few things are happening here that matter for CI:

- `--agent` gives you NDJSON events and reliable exit codes, which is what lets a pipeline gate a deploy on the result.
- `--provider browserbase` moves the browser off the runner, so your CI container stays lean and the runs don't contend for the runner's tiny CPU.
- `--upload` opt-in pushes the run to the free cloud dashboard for run history, video recordings, and per-run replay. It's strictly opt-in via `browserbash connect` plus `--upload`, and free uploaded runs are kept for 15 days. If you'd rather keep everything in-house, `browserbash dashboard` gives you a fully local dashboard with no upload at all.

### The parallel pattern

The reason to combine Browserbase with CI is fan-out. Because each session is isolated in the cloud, you can launch many at once without resource contention. A typical pattern is one BrowserBash invocation per critical flow — login, checkout, search, account settings — each its own CI job, all targeting Browserbase, all running at the same time. Locally that's four Chromium instances brawling over one machine. Remotely it's four independent cloud browsers, and your wall-clock time drops to the slowest single flow instead of the sum of all of them.

This is the concrete answer to "when do remote sessions beat local Chromium for parallel runs": the moment your concurrency exceeds what one machine can run cleanly. For a single test, local wins on simplicity. For a matrix of flows on every pull request, Browserbase wins on speed and isolation. The [case studies](https://browserbash.com/case-study) walk through real setups, and the [open-source repo](https://github.com/PramodDutta/browserbash) shows how the provider flag is wired.

## A realistic end-to-end walkthrough

Let me tie it together with a flow you'd actually ship: an e-commerce checkout regression that runs on every merge to main. You start local and visible, because you want to watch the agent and tune the objective:

```bash
browserbash run "log in to the demo store, add the first laptop to the cart, \
complete checkout with the test card, and verify 'Thank you for your order!' appears"
```

You run it a few times, refine the wording where the agent hesitates, and once it's reliably green, you freeze it into `checkout_test.md` with proper `{{variables}}` so the email, password, and product name aren't hard-coded. The password gets marked secret so it's masked everywhere.

Then you promote it to CI. The pipeline step runs the same Markdown file with `--provider browserbase --agent --record --upload`. On every merge, Browserbase spins up a clean headless Chrome, the agent runs the checkout, and the job exits `0` or `1`. If it fails, you open the uploaded replay, watch the `.webm`, and see exactly where the agent got stuck — a changed button label, a new interstitial modal, a slow payment iframe. You fix the app or nudge the objective, and you're green again.

Notice what you *didn't* do: you never wrote a selector, maintained a page object, managed a Selenium grid, or installed Chrome dependencies on your CI runner. The model did the reasoning, Browserbase ran the browser, and BrowserBash glued them together with one flag.

### A note on model choice for hard flows

Here's an honest caveat that's easy to skip and expensive to ignore. BrowserBash is Ollama-first and defaults to free local models, which is great for cost and privacy. But very small local models (roughly 8B parameters and under) can get flaky on long, multi-step objectives — a checkout with login, search, cart, and payment is genuinely hard reasoning. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows.

BrowserBash auto-resolves your model in order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. OpenRouter includes genuinely free hosted models such as `openai/gpt-oss-120b:free`, and you can bring your own Anthropic Claude key for maximum reliability. The practical advice: prototype on a small local model to keep iteration free, but if a complex remote flow is flaky, the fix is usually a stronger model, not a different provider. The [pricing page](https://browserbash.com/pricing) lays out the model and dashboard options, all of which keep the CLI itself free.

## Choosing the right provider for your situation

To make this practical, here's a quick decision guide based on what you're actually trying to do.

**Choose `local` when** you're developing a new flow, debugging a failure, testing a localhost dev server, or running a handful of checks where $0 and instant startup matter more than parallelism. This is most people, most of the time. Start here.

**Choose `browserbase` when** you need many parallel sessions without buying a bigger laptop, you're running in a headless CI environment that can't host a browser cleanly, you want guaranteed clean state per run to kill "works on my machine" flakiness, or you're running agentic flows on public JS-heavy sites at scale. This is the parallel-runs-in-CI case, and it's where remote genuinely beats local.

**Choose `cdp` when** you already run your own browser fleet or use a cloud that exposes a DevTools WebSocket, and you want full control over the infrastructure — common in regulated environments where the browser can't leave your network.

**Choose `lambdatest` or `browserstack` when** the question is cross-browser coverage across many real OS and browser combinations rather than headless Chrome concurrency. Browserbase is the wrong tool for "does this work in Safari 16 on macOS 13"; a device grid is the right one.

The beauty of the BrowserBash model is that none of these are lock-in. The provider is one flag. You can develop on `local`, run PR checks on `browserbase`, and spot-check cross-browser on `lambdatest` — all from the same objectives and the same Markdown tests, switching providers per command. You're never rewriting your suite to change where the browser runs.

## Common pitfalls when going remote

A few things bite people on their first Browserbase run:

- **The app must be public.** A cloud browser can't reach `localhost`. Deploy a preview or open a tunnel before you flip the provider — a local pass that times out on Browserbase with a connection error is almost always this.
- **Record everything until stable.** Without `--record`, a failed cloud run is a black box. The `.webm` and the builtin engine's Playwright trace are your only window into what the headless browser actually did.
- **Mask your secrets.** Mark credentials secret in your `{{variables}}` so they render as `*****`. This matters most in CI, where logs are retained and team-visible.
- **Match the model to the difficulty.** A tiny local model on a long checkout is a recipe for flakiness; use a mid-size or hosted model for hard flows.
- **Cost isn't zero on the cloud.** The CLI and local runs are free, but Browserbase bills by session usage. Develop locally and spend cloud minutes only on the runs that need them.

## FAQ

### How do I run browser tests on Browserbase with BrowserBash?

Install the CLI with `npm install -g browserbash-cli`, set your `BROWSERBASE_API_KEY` and project ID as environment variables, then add `--provider browserbase` to any `browserbash run` or `browserbash testmd run` command. The objective text stays identical to your local runs; only the flag changes. The agent connects to a remote headless Chrome session over CDP and runs your flow there.

### When should I use a remote cloud browser instead of local Chromium?

Go remote when you need many parallel sessions without overloading your machine, when your CI runner can't host a browser cleanly, or when you want a guaranteed clean environment for every run. Stick with local Chromium for developing and debugging flows, testing localhost apps, and small occasional runs where $0 cost and instant startup matter most. The common pattern is to develop locally and scale to Browserbase in CI.

### Do I need a Browserbase account to use BrowserBash?

You need a Browserbase API key only if you want to use the `browserbase` provider specifically. BrowserBash itself needs no account and defaults to running on your local Chrome with free local models, so you can do everything except cloud sessions without signing up for anything. The optional BrowserBash dashboard is also free and opt-in, and there's a fully local dashboard if you never want to upload runs.

### Can I run the same tests on local Chrome and Browserbase without changes?

Yes, that's the core design. Your objectives and your committable `*_test.md` files are provider-agnostic, so the exact same test runs against local Chrome during development and against Browserbase in CI. You switch by changing one flag on the command line, not by editing the test. The same applies to the other providers like LambdaTest and BrowserStack.

## Get started

Run browser tests on Browserbase the same way you run them locally — write the objective, prove it on your own Chrome, then add `--provider browserbase` to move it to headless cloud Chrome for clean, parallel CI runs. There's no rewrite and no lock-in, because the provider is just a flag.

Install it now with `npm install -g browserbash-cli` and start with a local run today. When you're ready for cloud dashboards and run history, you can [sign up](https://browserbash.com/sign-up) — though an account is entirely optional, and the CLI is free and open-source either way.
