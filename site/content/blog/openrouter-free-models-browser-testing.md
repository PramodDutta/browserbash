---
title: Using Free OpenRouter Models for Browser Testing
description: "Use free OpenRouter models for browser testing with BrowserBash and --model. Setup, tool-capable model picks, CI, and troubleshooting."
date: 2026-06-13
category: guide
---

If you want AI-driven browser tests but you don't want to hand over a credit card before your first run, **free OpenRouter models for browser testing** are the most practical on-ramp there is. OpenRouter is a single gateway that exposes hundreds of language models behind one API key, and a slice of that catalog is genuinely free to call. Point [BrowserBash](https://browserbash.com) at one of those free models with a single `--model` flag and you get an AI agent that drives a real Chrome browser from a plain-English objective, returns a pass/fail verdict, and emits structured results — all without writing a selector or paying per token.

This guide is the practical version of that promise. We'll cover what "free" really means on OpenRouter, why tool-capable (function-calling) models matter for browser automation specifically, how to wire up the key, how to address a free model id correctly, and how to fold the whole thing into CI. Every command is runnable as written. BrowserBash is free and open source (Apache-2.0), so the only thing standing between you and a working setup is about five minutes of reading.

## Why OpenRouter, and what "free" actually means

OpenRouter sits in front of many model providers and gives you one endpoint and one key for all of them. Instead of signing up with three vendors, managing three API keys, and learning three SDKs, you get a unified surface where switching from one model to another is a string change. That alone is useful. The part that matters for this article is that some of those models are offered with a free tier — addressed with a `:free` suffix on the model id — so you can run real workloads without spending anything.

A few honest caveats about free tiers, because they shape how you should use them:

- **Free does not mean unlimited.** Free models on OpenRouter typically carry rate limits and may be slower or more heavily loaded than their paid counterparts. They are excellent for development, smoke tests, and CI gates that run a handful of flows — not necessarily for hammering thousands of long sessions per hour.
- **Free models come and go.** The exact set of free model ids changes over time as providers add and retire them. Treat any specific id in a blog post as an example to verify, not a permanent fixture. Always copy the current id from the OpenRouter model catalog.
- **You still need a key.** Even for free models, OpenRouter wants an API key so it can attribute usage and apply limits. Getting one is free and takes a minute.

If you'd rather not deal with a remote gateway at all, BrowserBash is Ollama-first and runs fully local models with no key and no egress — that's covered in the [run browser tests with Ollama](https://browserbash.com/blog) guide. OpenRouter is the complementary path: when you want the breadth of a hosted catalog, including frontier-class models you can A/B against, without standing anything up locally.

## Why tool-capable models matter for browser testing

This is the single most important technical point in the article, so it gets its own section. Not every language model is a good fit for driving a browser, and the deciding factor is **tool use** (also called function calling).

Here's why. When BrowserBash runs an objective, the AI agent doesn't just write one block of text and stop. It works in a loop: it looks at the current state of the page, decides on the next action — click this, type that, navigate here, extract this value — emits that action in a structured form, the browser executes it, and the agent sees the result and decides what to do next. That structured "decide an action, call it, observe, repeat" pattern is exactly what tool-calling models are trained to do well. A model that can reliably emit well-formed tool calls will plan and execute multi-step flows cleanly. A model that can only produce free-form prose will tend to hallucinate steps, drift off-format, or stall.

So when you go shopping in the OpenRouter catalog for a free model to test with, the filter that matters is not "which one is smartest in the abstract" — it's "which free model supports tool use and emits clean structured calls." OpenRouter lets you filter the catalog by capability, and tool/function-calling support is the column to watch. A larger free model that handles tools well will outperform a flashier one that doesn't, every time, for this workload.

BrowserBash has two engines, and the engine interacts with this choice:

- The **stagehand** engine (default, MIT, by Browserbase) is the general-purpose path and works across providers.
- The **builtin** engine is an in-repo Anthropic tool-use loop. It is purpose-built around structured tool calls and also captures a Playwright trace when you record.

For OpenRouter free models, start with the default engine and a tool-capable model. We'll note where the builtin engine and the trace it produces become useful for debugging.

## Setup: one key, one flag

The integration is deliberately tiny. Get a key from the OpenRouter dashboard (openrouter.ai/keys), export it, and you're done with configuration.

```bash
npm install -g browserbash-cli
export OPENROUTER_API_KEY=sk-or-...
```

BrowserBash auto-detects available LLMs in a fixed order: it looks for Ollama first, then Anthropic, then OpenRouter. Because of that precedence, if you have Ollama running locally and you specifically want OpenRouter, don't rely on auto-detection — name the model explicitly with `--model`. The flag wins over auto-detection, over environment defaults, and over config-file defaults, so it's the unambiguous way to say "use this exact model on OpenRouter."

You address any OpenRouter model as `openrouter/<vendor>/<model>`, and a free model carries the provider's `:free` suffix. Here is a first run against a free, tool-capable model:

```bash
browserbash run "Open https://example.com and confirm the page heading says 'Example Domain'" \
  --model openrouter/openai/gpt-oss-120b:free
```

That's the whole thing. No SDK, no client setup, no per-vendor wiring. The agent opens a real browser, reads the page, checks the heading, and prints a verdict. If your traffic has to flow through a proxy or a regional endpoint, set `OPENROUTER_BASE_URL` to override the endpoint — the model ids and commands stay exactly the same.

### Reading the model id carefully

The id has two jobs, and getting either wrong is the most common setup mistake:

- The `openrouter/` prefix tells BrowserBash **which backend to route to**. Drop it and the CLI won't know to use OpenRouter.
- Everything after the prefix — `openai/gpt-oss-120b:free` in the example — must match OpenRouter's catalog id **verbatim**, including the `:free` suffix. Copy it from the catalog rather than typing it from memory, because vendor and model spellings are exact.

If a run fails immediately with an "unknown model" or authentication-style error, the id string or the key is almost always the cause — check both before suspecting the page or the test.

## Your first real test: a login smoke check

A heading check proves the pipeline. A login flow proves it's useful. Notice there are no selectors, no waits, and no page objects — you describe intent and let the agent figure out the mechanics.

```bash
browserbash run "Go to https://www.saucedemo.com, log in as user 'standard_user' with password 'secret_sauce', and verify the inventory page shows the 'Sauce Labs Backpack' product" \
  --model openrouter/openai/gpt-oss-120b:free \
  --headless
```

`--headless` runs Chrome without a visible window, which is what you want in CI and on a server. Drop it locally and you'll watch the agent work in a real browser window, which is the fastest way to build confidence in a new objective.

When you want to keep evidence of the run, add `--record`. On any engine that captures a screenshot plus a stitched `.webm` session video (assembled with ffmpeg); on the builtin engine it additionally captures a Playwright trace you can open for a step-by-step replay:

```bash
browserbash run "Go to https://www.saucedemo.com, log in as 'standard_user' / 'secret_sauce', add the 'Sauce Labs Backpack' to the cart, and verify the cart badge shows 1" \
  --model openrouter/openai/gpt-oss-120b:free \
  --headless \
  --record
```

The video is the artifact you attach to a bug or hand to a teammate when a free-tier model flakes on a long flow — it shows exactly where the agent's plan diverged from what you expected.

## Committable tests: markdown suites on a free model

One-off `run` commands are great for exploration, but real suites should live in version control. BrowserBash supports markdown tests — committable `*_test.md` files where each list item is a step. They read like documentation and execute like tests.

```markdown
# Checkout smoke test

- Go to https://www.saucedemo.com
- Log in as {{USERNAME}} with password {{PASSWORD}}
- Add the "Sauce Labs Backpack" to the cart
- Open the cart and verify it contains exactly one item
- Proceed to checkout, fill first name "Ada", last name "Lovelace", zip "94105"
- Continue and verify the order summary page is shown
```

A few features make these production-grade:

- `{{variables}}` let you parameterize the run, and secrets are masked in output as `*****` so credentials never leak into logs.
- `@import` composes shared steps — keep a `login_test.md` and import it into every flow that needs a session, so you write the login once.

Run a markdown suite against your free OpenRouter model exactly the way you'd run anything else:

```bash
export USERNAME=standard_user
export PASSWORD=secret_sauce

browserbash testmd run checkout_test.md \
  --model openrouter/openai/gpt-oss-120b:free \
  --headless
```

This writes a `Result.md` next to your test — a human-readable record of what passed and what didn't, suitable for committing alongside the test or attaching to a PR. For more on structuring suites this way, the [BrowserBash learn pages](https://browserbash.com/learn) walk through markdown tests and imports in depth.

## Free models in CI: agent mode and exit codes

The reason a free model pairs so well with CI is that there's no per-token cost to gate every pull request. BrowserBash is built for automation: it speaks exit codes and NDJSON, not prose you have to scrape.

Pass `--agent` and the run emits NDJSON — one JSON event per line, with a stable schema — instead of human prose. The process also sets a meaningful exit code: `0` passed, `1` failed, `2` error, `3` timeout. That combination is everything a CI step needs; it can branch on the exit code and archive the NDJSON as a build artifact without parsing any English.

```bash
browserbash testmd run checkout_test.md \
  --agent \
  --headless \
  --timeout 180 \
  --model openrouter/openai/gpt-oss-120b:free \
  > result.ndjson

echo "exit code: $?"
```

Because the verdict is an exit code, the surrounding CI logic is trivial:

```bash
if browserbash run "Open https://example.com and confirm the heading says 'Example Domain'" \
     --agent --headless --model openrouter/openai/gpt-oss-120b:free; then
  echo "smoke passed"
else
  echo "smoke failed with code $?" >&2
  exit 1
fi
```

The NDJSON stream ends with a `run_end` event carrying fields like `duration_ms` and `steps_executed`, which are useful when you're characterizing how a free model behaves over time. If you want to inspect the last event of a run, pipe it through `jq`:

```bash
tail -1 result.ndjson | jq '{status, duration_ms, steps_executed}'
```

This is also the surface AI coding agents consume: a coding agent can fire a BrowserBash run, read the structured events, and react to a verdict without you writing brittle prose parsers. Free OpenRouter models make that loop cheap enough to run on every change.

## Practical limits of free tiers, and how to work with them

Free models are real models with real constraints. Treat the following as operating guidance rather than warnings, and they'll serve you well.

**Rate limits are the main ceiling.** Free tiers cap how often you can call them. For a per-PR smoke job that runs a few short flows, you'll rarely notice. For a sweep of dozens of long end-to-end walks in parallel, you may hit limits and see queuing or errors (exit code `2`). The fix is scheduling, not panic: run heavy suites serially or stagger them, and reserve the free model for the high-frequency, low-volume jobs where its price is unbeatable.

**Long flows are where smaller models flake first.** This is true of every model class, free or paid, and it's a function of step count. A 4-step smoke test is forgiving; a 16-step checkout is not. If a free model fails a long flow, don't condemn it on one run:

- **Rerun for a pass rate.** One failure is noise, not a verdict.
- **Give it headroom.** Raise `--timeout` and, if your flow is long, `--max-steps`, so the agent isn't cut off mid-plan.
- **Split the flow.** Two short `*_test.md` files (with a shared `@import`ed login) are more reliable than one long one — and they parallelize.
- **Record and inspect.** Add `--record`, or switch to the builtin engine for a Playwright trace, and watch exactly where the plan diverged.

**Pick the model for the job.** A common, durable pattern is a split policy: a fast, free, tool-capable model for the frequent per-PR smoke job, and a stronger model for the nightly full suite where the flows are longest. Because tests are plain English, moving a flow between models is a one-flag change — `--model` and nothing else. Other comparisons on the [BrowserBash blog](https://browserbash.com/blog) dig into model selection across the same suite.

## Where the browser runs is a separate choice

One point that trips up newcomers: the **model** (the brain) and the **provider** (where the browser actually runs) are independent. Choosing a free OpenRouter model decides the reasoning; it says nothing about the browser. By default the browser is your local Chrome, which is perfect for development and CI runners that have a browser installed.

If you later need a real device cloud — say, to run the same objective across browser/OS combinations you don't have locally — you switch the browser with one flag and leave the model untouched:

```bash
browserbash run "Open https://example.com and confirm the heading says 'Example Domain'" \
  --model openrouter/openai/gpt-oss-120b:free \
  --provider lambdatest \
  --headless
```

Supported providers include `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. The takeaway: a free OpenRouter model is not locked to local execution. You can keep the free brain and scale the browser out when a real cross-environment matrix demands it.

## Optional: dashboards and keeping runs

Everything above is fully local — nothing leaves your machine unless you explicitly ask it to. Privacy is the default, not a setting. When you do want history and replay, BrowserBash gives you two options.

There's a free, private **local dashboard** that needs no account and no network:

```bash
browserbash dashboard
```

And there's a cloud dashboard for run history, recordings, and per-run replay across a team. You create a free account, connect once, and opt in to pushing a run with `--upload`:

```bash
browserbash connect --key bb_...
browserbash run "Open https://example.com and confirm the heading says 'Example Domain'" \
  --model openrouter/openai/gpt-oss-120b:free \
  --record \
  --upload
```

Without `--upload`, the run stays entirely on your machine — the cloud is strictly opt-in. On the free tier, cloud runs are retained for 15 days. If your tests touch sensitive internal apps, the safe default is simply not to pass `--upload`, and nothing about your run ever leaves the laptop.

## Putting it together

The full free path looks like this: install the CLI, export an `OPENROUTER_API_KEY`, pick a tool-capable free model from the catalog, and address it as `openrouter/<vendor>/<model>:free` with `--model`. Write objectives in plain English or commit them as `*_test.md` files. Run them headless in CI, branch on exit codes, archive the NDJSON, and add `--record` when you need evidence. Reserve the free model for frequent smoke work where its zero cost shines, and lean on rerun-for-pass-rate, generous timeouts, and flow-splitting when a long test gets flaky. The whole loop costs nothing and ships nothing off your machine unless you choose to.

That's the real value of free OpenRouter models for browser testing: they turn AI browser automation from a budgeted experiment into something you can run on every pull request, all day, for free — and because BrowserBash keeps the tests in plain English, the model under them is always a one-flag decision you can revisit later. You can grab the CLI on the [npm package page](https://www.npmjs.com/package/browserbash-cli) and read the source on GitHub whenever you want to see exactly how the agent loop works.

## FAQ

### Which free OpenRouter models work best for browser testing?

The ones that support tool use (function calling) and emit clean structured calls. Browser automation is an action loop — decide a step, call it, observe, repeat — so a free model that handles tools reliably will beat a flashier one that can only produce prose. Filter the OpenRouter catalog by tool/function-calling support, then prefer a larger free model for long, multi-step flows.

### How do I write the model id for a free OpenRouter model?

Use `--model openrouter/<vendor>/<model>:free`, copying the part after `openrouter/` verbatim from the OpenRouter catalog. The `openrouter/` prefix routes BrowserBash to the right backend, and the `:free` suffix selects the provider's free tier. For example, `--model openrouter/openai/gpt-oss-120b:free`. If a run fails with an unknown-model or auth error, the id string or the `OPENROUTER_API_KEY` is almost always the cause.

### Are free OpenRouter models really free, or are there hidden limits?

The calls themselves are free, but free tiers carry rate limits and the available model ids change over time as providers add and retire them. That makes them ideal for development and high-frequency, low-volume jobs like per-PR smoke tests, and less suited to massive parallel sweeps. You still need a (free) OpenRouter API key so usage can be attributed and limited.

### Can I use a free OpenRouter model in CI?

Yes, and it's one of the best fits, because there's no per-token cost to gate every pull request. Run with `--agent` to get NDJSON on a stable schema, and branch on the exit codes (`0` passed, `1` failed, `2` error, `3` timeout). Archive the NDJSON as a build artifact and add `--record` when you want a screenshot and session video attached to a failing run.

---

Ready to try it? Install the CLI with `npm install -g browserbash-cli`, export your `OPENROUTER_API_KEY`, and point `--model` at a free, tool-capable model — your first AI browser test is one command away. When you want run history and replays for a team, [create a free account](https://browserbash.com/sign-up) and push a run with `--upload`. BrowserBash is free and open source, so there's nothing to unlock and nothing to pay.
