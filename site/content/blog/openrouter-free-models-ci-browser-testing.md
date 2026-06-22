---
title: Run Browser Tests on OpenRouter Free Models in CI
description: "Wire BrowserBash to OpenRouter free models browser testing CI: run gpt-oss-120b:free at zero cost, handle rate limits, and fall back to Anthropic for hard"
date: 2026-04-08
category: llm
---

If you want OpenRouter free models browser testing CI without a per-token bill, the setup is more practical than the "free LLM" reputation suggests. You write a plain-English objective, an AI agent drives a real Chrome browser through it, and the inference runs on a genuinely free hosted model like `openai/gpt-oss-120b:free`. No GPU on your CI runner, no Ollama to install, no credit card on the inference provider. This guide shows exactly how to wire BrowserBash to OpenRouter's free tier for zero-cost CI runs, where the rate limits will actually bite, and when you should swallow your pride and fall back to a paid Anthropic key for the genuinely hard flows.

I'll be honest about the trade-offs throughout, because "free" hides a real cost: throughput. A free hosted model is rate-limited, and a pipeline that fires fifty browser journeys at midnight hits those limits in a way a single local demo never does. The good news is that the same flag that selects OpenRouter also lets you swap to a paid model for the handful of flows that need it.

## Why OpenRouter free models are interesting for CI

CI runners are usually cheap, ephemeral, and CPU-only. That's a bad environment for local LLM inference — you don't have a GPU on a typical GitHub-hosted or GitLab shared runner, and a small CPU-bound model crawls through a multi-step objective. So the two realistic paths for AI browser testing on commodity CI are: pay per token to a hosted provider, or use a free hosted tier.

OpenRouter is a router in front of many model providers, and it exposes a set of models on a free tier — names suffixed with `:free`, like `openai/gpt-oss-120b:free`. These are real, capable models served at no per-token charge, subject to rate limits and availability. For a test suite that runs a few times a day rather than thousands of times an hour, that's a genuinely usable zero-cost option. You get a 120B-class model reasoning over your browser screens without a GPU bill or an inference invoice.

The catch, stated plainly: free tiers are throttled and best-effort. OpenRouter publishes its current limits, and they change, so treat any specific number you read (including here) as "check the docs as of 2026" rather than gospel. The shape of the limit matters more than the exact figure — free models cap requests per minute and per day, and they can return a 429 when the upstream provider is busy. Your pipeline has to tolerate that, which is most of what the rest of this guide is about.

### Where BrowserBash fits

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command an objective in English, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — then returns a verdict plus structured results. There's no account required to run it.

The reason it pairs well with OpenRouter is the model story. BrowserBash is Ollama-first: by default it looks for a local Ollama instance and uses free local models, so nothing leaves your machine. But it auto-resolves a chain — local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — and it supports OpenRouter's hosted models directly, including the free ones. On a CPU-only CI runner where local inference isn't viable, OpenRouter free models become the zero-cost default, and a paid Anthropic key is your escape hatch. You can read more about how the CLI is put together on the [BrowserBash features page](https://browserbash.com/features).

## The model decision before you write any pipeline YAML

Decide where inference runs before you touch your CI config, because it changes cost, reliability, and how you handle secrets.

BrowserBash gives you three honest options, and the right answer is often a mix:

| Setup | Where inference runs | Cost | Best for |
|---|---|---|---|
| Local Ollama, mid-size model | On the runner (needs a GPU) | $0 | Self-hosted runners with a GPU, privacy-sensitive shops |
| OpenRouter free model (`:free`) | Hosted | $0, rate-limited | Commodity CPU runners, suites that run a few times a day |
| Anthropic Claude (your key) | Hosted | Per-token | Hard multi-step flows, tight reliability requirements |

Most teams reading this article don't have GPU runners, so local Ollama is off the table in CI even though it's the default on a developer's laptop. That leaves the free hosted tier as your zero-cost CI choice and a paid key as the reliability backstop. The whole point of this guide is to lean on the free model for the bulk of your runs and reserve the paid one for the flows that genuinely need it.

Here's the honest caveat that shapes everything. Very small models — roughly 8B parameters and under — get flaky on long, multi-step objectives. A six-step checkout flow is exactly where a tiny model loses the plot halfway through. The sweet spot is a mid-size model (Qwen3 or Llama 3.3 70B-class locally) or a capable hosted model. The reason `openai/gpt-oss-120b:free` is the recommended OpenRouter pick is precisely that it's a 120B-class model, not an 8B toy. It's big enough to hold a multi-step browser objective together, and it's free. That combination is rare, which is why it anchors this whole setup.

## Getting an OpenRouter key and picking the model

You need one secret: an OpenRouter API key. Create a free account, generate a key, and that's it — no per-token billing is attached to a free model, though OpenRouter may ask you to add a small credit balance to unlock higher free-tier limits. That detail changes over time, so verify it as of 2026 when you sign up rather than trusting a number here.

Set the key as an environment variable and let BrowserBash auto-resolve it:

```bash
export OPENROUTER_API_KEY="sk-or-..."

browserbash run "Go to the staging store, log in as a standard user, add the first laptop to the cart, complete checkout, and verify the page shows 'Thank you for your order!'" \
  --model "openai/gpt-oss-120b:free" \
  --headless
```

A few things are happening here. The `--model` flag pins the exact OpenRouter model slug, including the `:free` suffix that selects the no-cost tier. The `--headless` flag is what you want in CI — there's no display on a runner, so the browser runs without a visible window. Because `OPENROUTER_API_KEY` is set and there's no local Ollama on the runner, BrowserBash resolves to OpenRouter automatically. If you also had `ANTHROPIC_API_KEY` set, the resolution order (Ollama → Anthropic → OpenRouter) means you'd need to be explicit about wanting OpenRouter; pinning `--model` to a `:free` slug keeps it unambiguous.

Run this locally first, watch the agent narrate its steps, confirm it reaches the "Thank you for your order!" verdict, and only then move it into CI. Debugging a flaky free-tier run is much easier on your own machine than in a pipeline log.

## Wiring it into GitHub Actions

The pattern is the same on any CI system: install Node and the CLI, expose the key as a secret, run the objective, and let the exit code decide pass or fail. Here's a GitHub Actions job. Store your key in the repo as a secret named `OPENROUTER_API_KEY` under Settings → Secrets and variables → Actions.

```bash
# .github/workflows/browser-tests.yml
name: browser-tests
on: [push, workflow_dispatch]
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g browserbash-cli
      - name: Run smoke test on a free model
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
        run: |
          browserbash run "Open the homepage, click Sign in, log in with a standard account, and confirm the dashboard loads" \
            --model "openai/gpt-oss-120b:free" \
            --headless \
            --agent
```

That `--agent` flag is the one that makes this CI-grade. In agent mode, BrowserBash emits NDJSON — one JSON event per line — on stdout instead of human prose, and it returns disciplined exit codes: `0` passed, `1` failed, `2` error, `3` timeout. GitHub Actions reads the exit code to mark the step green or red, so you never have to grep English to decide a build verdict. If you're building any kind of automation on top of the output, you parse structured events, not sentences. This is the same NDJSON contract AI coding agents consume, and it's covered in more depth over on the [BrowserBash blog](https://browserbash.com/blog).

One environment note: `ubuntu-latest` ships with Chromium dependencies that BrowserBash's default engine can use, but if you hit a missing-browser error, install Chrome in a prior step or switch to a remote provider (more on that below). Test this on a throwaway branch before you make it a required check.

## Rate limits: the part everyone underestimates

This is where free models earn their reputation, fairly. A free OpenRouter model is rate-limited on requests per minute and per day, and those limits are shared infrastructure — you're competing with everyone else using the same `:free` slug. A single browser objective is not one model call; it's many, because the agent reasons step by step. Logging in, reading the screen, deciding the next click, reading again — each of those is at least one request. A ten-step journey can be twenty or thirty model calls. Run five journeys in parallel and you're suddenly making a hundred-plus requests in a burst.

That's how a suite that worked fine yesterday starts throwing 429s today. Three concrete tactics keep you under the limits.

### Serialize, don't parallelize

The instinct in CI is to fan out: run every test in its own parallel job to finish faster. With a free model, that's exactly wrong. Parallel jobs multiply your requests-per-minute and you'll trip the limit. Run free-model browser tests in a single job, one objective after another, so your request rate stays flat. You trade wall-clock time for staying inside the free tier — an acceptable trade for a nightly suite, less so for a blocking pre-merge check.

### Keep objectives tight

Every extra step is extra model calls. A bloated objective like "test the entire account section" might balloon into forty steps; a focused one — "log in, open billing, confirm the current plan is Pro" — is six. Tight objectives aren't just cheaper on rate limits, they're more reliable, because you give the agent less room to wander. This discipline pays off on every provider, but it's load-bearing on a rate-limited free tier.

### Treat 429 as retryable, not as a failure

A rate-limit response is not a product bug, and your pipeline shouldn't treat it like one. BrowserBash returns exit code `2` for an error condition (distinct from `1`, a genuine test failure), which lets you tell "the app is broken" apart from "the model was throttled." A simple shell retry-with-backoff around the run handles transient throttling cleanly:

```bash
for attempt in 1 2 3; do
  browserbash run "Log in and confirm the dashboard loads" \
    --model "openai/gpt-oss-120b:free" --headless --agent
  code=$?
  [ "$code" -eq 0 ] && exit 0       # passed
  [ "$code" -eq 1 ] && exit 1       # genuine failure, don't retry
  echo "Transient error ($code), backing off..."
  sleep $((attempt * 30))
done
exit 1
```

The key insight: retry on `2` and `3` (error and timeout, which is where throttling shows up), but never retry on `1`. Retrying a real failure just hides bugs and wastes free-tier budget. Distinguishing those exit codes is exactly why agent mode's disciplined exit codes matter more here than on a paid tier.

## Falling back to Anthropic for the hard flows

Not every flow belongs on a free model. A long, branchy journey — multi-page checkout with address validation, a wizard with conditional steps, anything where one misread screen derails the whole run — deserves a more capable model, and a free tier that might 429 mid-journey is the wrong place for your most important test.

The clean pattern is a two-tier suite. Run the bulk of your checks — smoke tests, simple logins, "does the page load" guards — on `openai/gpt-oss-120b:free` for $0. Run the handful of high-value, high-complexity journeys on Anthropic Claude with your own key, where you pay per token but get the reliability and the higher throughput that a paid tier provides.

```bash
# Tier 1: cheap smoke checks on the free model
browserbash run "Open the homepage and confirm the hero and nav render" \
  --model "openai/gpt-oss-120b:free" --headless --agent

# Tier 2: the critical revenue flow on a paid model
export ANTHROPIC_API_KEY="sk-ant-..."
browserbash run "Log in, add a laptop to the cart, apply coupon SAVE10, complete checkout with a test card, and verify 'Thank you for your order!'" \
  --headless --agent
```

When `ANTHROPIC_API_KEY` is set and you don't pin a `:free` model slug, BrowserBash's resolution order picks up Anthropic for that run. You're spending real money only on the flows that justify it, and you keep the free model doing the heavy lifting on volume. For most teams this two-tier split lands the monthly inference bill somewhere between "nothing" and "a few dollars," which is the whole reason to bother with the free tier in the first place. The [BrowserBash pricing page](https://browserbash.com/pricing) lays out what is and isn't free across the product.

### A quick honesty check on "free"

Free hosted inference is free in dollars, not in reliability. If you put a free-model test on the blocking path of every merge, you've coupled your team's velocity to a third party's best-effort capacity. Some mornings it'll be snappy; some mornings it'll throttle. That's fine for a nightly regression run and risky for a required pre-merge gate. Be deliberate: free models for non-blocking volume, a paid model (or a local GPU runner) for anything that can't be allowed to flake on a busy upstream. Pretending the free tier has paid-tier SLAs is how teams get burned.

## Committable Markdown tests over free models

Inline `browserbash run` strings are great for a single check, but a real suite wants version-controlled tests. BrowserBash supports Markdown tests: committable `*_test.md` files where each list item is a step, with `@import` composition and `{{variables}}` templating. Variables marked as secret are masked as `*****` in every log line — which matters a lot in CI, where logs are often world-readable inside your org.

```bash
# login_test.md
# Log in to the staging store
# - Go to {{baseUrl}}
# - Click "Sign in"
# - Enter {{username}} and {{password}}
# - Confirm the dashboard shows "Welcome back"

browserbash testmd run ./login_test.md \
  --model "openai/gpt-oss-120b:free" \
  --headless --agent \
  --var baseUrl=https://staging.example.com \
  --var username=qa@example.com \
  --secret password=$STORE_PASSWORD
```

The `--secret` flag is the one to notice: `password` is masked as `*****` everywhere it would otherwise appear, so a free-tier rate-limit error dumped into a CI log doesn't leak credentials. After each run, BrowserBash writes a human-readable `Result.md` you can attach as an artifact or read in a PR. Markdown tests work identically whether the inference is a free OpenRouter model, Anthropic, or local Ollama — the test file doesn't know or care which model graded it, so you can promote a flow from the free tier to a paid model by changing one flag. There's a fuller walkthrough of this workflow in the [BrowserBash learn hub](https://browserbash.com/learn).

## Recording runs for when free-model tests do fail

A free model will occasionally misjudge a screen, and when it does you want evidence, not a one-line "failed." The `--record` flag captures a screenshot and a full `.webm` session video on any engine, via ffmpeg. On the builtin engine — BrowserBash's in-repo Anthropic tool-use loop — it additionally captures a Playwright trace you can open in the trace viewer.

```bash
browserbash run "Complete checkout and verify the confirmation page" \
  --model "openai/gpt-oss-120b:free" \
  --headless --record --agent
```

In CI, upload the resulting `.webm` and screenshot as build artifacts. When a free-model run fails, the video tells you in seconds whether the agent genuinely caught a regression or whether the model misread a screen and clicked the wrong thing. That distinction is the single most useful thing to know when you're running on a model that's free but occasionally fuzzy. Make ffmpeg available on the runner (it's a prerequisite for `.webm` capture), and gate recording behind a condition if you don't want a video on every green run.

For teams that want run history, per-run replay, and hosted video without standing up storage, there's an optional free cloud dashboard — strictly opt-in via `browserbash connect` plus `--upload`, with free uploaded runs kept for 15 days. There's also a fully local dashboard via `browserbash dashboard` if you'd rather keep everything on your own machine. Neither is required; the CLI runs and returns its verdict with no account at all.

## When the runner itself is the problem: remote providers

Sometimes the browser, not the model, is your CI pain. A locked-down runner can't install Chrome, or you need to test on a browser version your runner can't provide. BrowserBash separates where the browser runs from where the model runs, switched with a single `--provider` flag: `local` (the default, your Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`.

```bash
browserbash run "Log in and confirm the dashboard loads" \
  --model "openai/gpt-oss-120b:free" \
  --provider lambdatest \
  --headless --agent
```

That command keeps your inference free on OpenRouter while the actual browser runs on a remote grid. The model decision (OpenRouter free, Anthropic paid, local Ollama) and the browser decision (local Chrome vs. a remote provider) are fully independent. So "I have no GPU and a restricted runner" has a clean answer: free hosted model for inference, remote provider for the browser, zero local infrastructure. You can dig into the engine and provider model further in the [BrowserBash case studies](https://browserbash.com/case-study).

## A realistic recommendation

After all the caveats, here's the setup I'd actually run for a small-to-mid team on commodity CI.

Put your smoke suite — the cheap, high-volume "does it load, can users log in" checks — on `openai/gpt-oss-120b:free`, serialized into a single job, with a three-attempt backoff retry that distinguishes throttling (exit `2`/`3`) from real failure (exit `1`). Run that on every push as a non-blocking check or as a nightly job. It costs nothing and catches the obvious breakages.

Put your three-to-five most important journeys — the revenue flows, the multi-step wizards, the things that genuinely must work — on Anthropic Claude with your own key. Pay the few dollars a month for reliability where it counts, and let those be your blocking pre-merge gates. The free tier carries the volume; the paid tier carries the risk.

That split gives you most of the value of AI browser testing at most of the cost savings, without pretending a best-effort free tier is something it isn't. As your needs grow — more flows, GPU runners, tighter SLAs — you shift the dial toward local Ollama or more paid runs, and the flag-level swap makes that migration a config change rather than a rewrite.

## FAQ

### Is gpt-oss-120b:free actually free on OpenRouter?

Yes — models with the `:free` suffix carry no per-token charge, which is why `openai/gpt-oss-120b:free` is a genuinely zero-cost option for CI inference. They are rate-limited and best-effort, and OpenRouter may require a small account credit to unlock higher free-tier limits. Verify the current limits and any credit requirement when you sign up, since those terms change over time.

### How do I avoid hitting OpenRouter rate limits in CI?

Serialize your tests into one job instead of fanning them out across parallel jobs, since parallelism multiplies your requests-per-minute. Keep each objective tight so the agent makes fewer model calls, and wrap runs in a retry-with-backoff that retries on error and timeout exit codes but never on a genuine failure. For high-volume or blocking checks, move the most demanding flows to a paid model where throughput is not throttled.

### Can I mix free and paid models in the same test suite?

Yes, and it's the recommended pattern. Run cheap, high-volume smoke checks on the free OpenRouter model and reserve a paid Anthropic key for the few hard, high-value journeys. Because BrowserBash selects the model per run via a flag and an environment variable, you can promote any individual test from the free tier to a paid model without rewriting it.

### Do I need a GPU to run AI browser tests in CI?

No. A GPU is only needed if you want to run local Ollama models on the runner itself, which most commodity CI runners can't do well. Using OpenRouter free models or a paid Anthropic key moves inference off the runner entirely, so a standard CPU-only CI machine is enough — you only need Node, the CLI, and a browser (local or via a remote provider).

Ready to run browser tests on a free hosted model? Install with `npm install -g browserbash-cli`, point it at `openai/gpt-oss-120b:free`, and you're running at $0. No account is required to use the CLI; if you later want hosted run history and video replay, [sign up for the free dashboard](https://browserbash.com/sign-up) — it's entirely optional.
