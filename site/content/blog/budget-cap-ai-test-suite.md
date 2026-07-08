---
title: Put a Hard Dollar Cap on Your AI Test Suite
description: "Set an ai test suite budget cap with BrowserBash --budget-usd and --budget-tokens so a bad run-all never turns into a surprise LLM bill."
date: 2026-07-31
category: guide
---

The first time an AI-driven test suite blows through your model budget, it usually isn't during a demo. It's at 2am on a Tuesday, when a flaky selector turns into a retry loop, the agent starts second-guessing itself on every page, and by the time someone notices, the token bill for a routine regression run looks like it paid for a small production incident. An ai test suite budget cap fixes the actual failure mode: not "the AI is too expensive" in general, but "nothing was watching the meter while the suite ran unattended." BrowserBash bakes that meter directly into `run-all` with two flags, `--budget-usd` and `--budget-tokens`, and this guide walks through exactly how the stop works, what happens to the tests that don't get to run, and how to size a number that actually protects you without strangling your suite.

## Why AI Test Suites Need a Budget Cap in the First Place

Traditional Playwright or Selenium suites have a cost profile you can reason about with a spreadsheet: CI minutes, maybe a browser-grid subscription, done. Bring an LLM into the loop and the cost curve changes shape. Every step an agent takes, every screenshot it reasons over, every retry after a flaky page load, consumes tokens, and tokens convert directly into dollars. A 40-test suite that normally finishes in six minutes for a fixed CI cost can, under a bad day of DOM churn or a provider rate limit, take twice as long and burn far more in model calls than usual, with zero warning until someone checks the invoice.

This is the specific problem an ai test suite budget cap is meant to solve. It's not about making AI testing cheap in the abstract, it's about making the cost bounded and predictable, the same way a CI timeout bounds wall-clock time. You already trust a `timeout: 30m` block in your pipeline to stop a hung job. `--budget-usd` and `--budget-tokens` are the same idea applied to spend instead of minutes, and they matter more for AI suites than for deterministic ones precisely because AI cost is a function of how hard the model has to work, not just how many tests you wrote.

There's a second, quieter reason this matters: it changes how comfortable teams are running AI test suites unattended at all. A nightly `run-all` that could, in a bad scenario, cost anywhere from fifty cents to fifty dollars is a suite nobody wants to schedule. A nightly `run-all` capped at $3 with automatic skip-and-report behavior on overage is a suite you can put on a cron job and stop thinking about, which is the actual goal of automation.

## How run-all --budget-usd Works Under the Hood

BrowserBash's `run-all` orchestrator already tracks cost per test. Every finished test emits a `run_end` event carrying a `cost_usd` estimate, pulled from a bundled per-model price table (models BrowserBash doesn't recognize get no estimate rather than a fabricated one, which matters if you're on a newer or custom model that hasn't been priced yet). The orchestrator sums those estimates as tests complete, and once the running total crosses the threshold you set with `--budget-usd`, it stops launching new tests.

```bash
browserbash run-all .browserbash/tests --budget-usd 2.50
```

That's the whole interface from the operator's side: one flag, one dollar figure. Internally, the scheduler checks the budget at the point where it would otherwise dispatch the next queued test. Tests already running when the budget is crossed are allowed to finish, since killing a browser session mid-assertion would leave you with an unreliable partial result and no verdict at all. Everything still in the queue at that point is marked skipped rather than run, and the suite as a whole exits with code 2, the same exit code BrowserBash uses for infra and error conditions, so your CI step fails loudly instead of quietly returning green on an incomplete run.

`--budget-tokens` works the same way but on the token count directly rather than the derived dollar estimate. This is the flag to reach for when you'd rather not depend on the pricing table at all, for example if you're running a local Ollama model where "dollars" doesn't mean anything but token volume still correlates with wall-clock time and, if you're on a metered API tier for a hybrid setup, indirect cost.

```bash
browserbash run-all .browserbash/tests --budget-tokens 500000
```

You can set both flags at once if you want a belt-and-suspenders stop: the orchestrator halts at whichever limit is crossed first.

## What Happens to the Tests That Don't Run

This is the part teams actually need to plan for, because a budget stop isn't a clean success or failure, it's a third state: incomplete. BrowserBash treats it that way explicitly rather than papering over it.

- Tests that finished before the budget was crossed keep their real pass/fail verdicts, with cost attributed normally.
- Tests that were in flight when the threshold hit are allowed to complete and get a real verdict too, since the sunk cost of that browser session is already spent.
- Tests still queued are marked `skipped`, not failed, so you can tell the difference between "this broke" and "this never got a chance to run."
- The suite exit code is 2 (error/budget-stop), distinct from 1 (failed tests) and 0 (clean pass), so a CI gate that only checks for exit code 1 will miss a budget stop unless you also check for 2. Treat both as red.

That skip/fail distinction lives in the output artifacts too. `RunAll-Result.md` lists every test with its status, cost, and duration, and the skipped ones are clearly labeled instead of silently missing from the report. If you're feeding results into JUnit for a CI dashboard, the spend and the stop reason land in the `<properties>` block of the JUnit XML, so a build system that already parses JUnit gets the budget context for free without a custom integration.

The practical upshot: a budget stop tells you two things at once, "here is what we verified" and "here is what we didn't get to," which is strictly more useful than a suite that either runs to completion no matter the cost or dies with a generic timeout and no partial verdict at all.

## Sizing a Budget for a Real Suite

The number you put after `--budget-usd` shouldn't be a guess. The fastest way to size it is to run your suite once without a cap, read the per-test `cost_usd` values out of the individual `run_end` events or the `RunAll-Result.md` summary, and use that as your baseline.

```bash
browserbash run-all .browserbash/tests --agent > run.ndjson
```

Grep the NDJSON output for `run_end` lines and you'll have a per-test cost breakdown you can sum and average. From there, a reasonable cap is your observed suite total plus a buffer for retries and flakiness, not the observed total exactly (which would trip on the very next run that's even slightly slower than baseline).

A few sizing patterns that hold up in practice:

| Suite profile | Typical driver | Starting budget approach |
|---|---|---|
| Small smoke suite (5-15 tests), replay cache warm | Mostly cache hits, near-zero model calls | Set a low guard, $0.50-$1, since a warm cache should barely touch it |
| Mid-size regression suite (20-60 tests), local Ollama | Token volume matters more than dollars | Use `--budget-tokens` sized to 1.5x a cold-run baseline |
| Full nightly suite, hosted model, cold cache | Every test does real reasoning | Set `--budget-usd` at 2x the observed baseline total |
| CI pull-request gate, sharded across machines | Multiple parallel `run-all --shard` jobs | Set a per-shard budget, not a suite-wide one, since each shard is a separate process |

That last row matters if you're combining budgets with sharding. `--shard i/n` splits your suite across parallel CI machines deterministically (sorted discovery order, so every shard agrees on the split without coordinating), and each shard runs as its own `run-all` process with its own budget:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 1.25
```

If you want one shard's overspend to protect the whole build, that has to happen at the CI orchestration layer (fail the whole workflow if any shard job exits non-zero), not inside BrowserBash itself, since each `run-all` invocation only sees its own slice of tests.

### The Replay Cache Changes the Math Entirely

One thing worth internalizing before you set a number: BrowserBash's replay cache means a healthy suite's steady-state cost is much lower than its cold-run cost. The first time a test passes, it records its actions; on the next identical run, it replays those recorded actions with zero model calls and only steps the agent back in if the page actually changed. That means a suite you baselined cold at $4 might settle into a $0.30 steady state once the cache warms up, which is also why a sudden budget trip on a suite that's normally cheap is itself a signal worth investigating: it often means the cache went cold across the board, which usually points at a real UI change, not random flakiness.

If your budget keeps tripping on a suite that used to sail through cheaply, don't just raise the number. Check whether something upstream changed (a redesign, a new auth flow, a provider outage that killed cache hits) before you assume the fix is a bigger cap.

## Combining Budget Caps with Cost Governance Elsewhere

The budget flags aren't the only cost lever in BrowserBash, and it helps to know how they fit next to the others.

`--model-exec` lets you plan on a strong model and execute steps on a cheaper one, which lowers your baseline cost before you ever get to the budget cap, meaning the cap you need is smaller and less likely to trip on legitimate runs. Auth reuse (`--auth <name>`, saved via `browserbash auth save`) cuts out repeated login flows across every test in a suite, which on a suite with a shared login step can be a meaningful chunk of total token spend on its own. And the Ollama-first model resolution (local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter) means a suite you run locally during development can cost effectively nothing before it ever reaches a metered API in CI.

Put together, the sequence for a cost-conscious suite looks like: warm the replay cache locally with a free local model, reuse auth sessions instead of re-logging-in every test, and only then set a `--budget-usd` cap sized off the real steady-state number, not a worst-case guess.

```bash
browserbash auth save prod-login --url https://app.example.com/login
browserbash run-all .browserbash/tests --auth prod-login --budget-usd 1.50
```

## Budget Caps in CI and GitHub Actions

If you're running BrowserBash's official GitHub Action, the budget flag passes straight through as an input, and a budget stop fails the job the same way a failed assertion does, which is the behavior you want for a PR gate: an AI suite that's about to blow past its allotted spend on a pull request should stop the merge, not quietly finish over budget and get rubber-stamped.

```yaml
- uses: PramodDutta/browserbash-action@v1
  with:
    tests: .browserbash/tests
    budget-usd: 2
    shard: 1/2
```

The Action already uploads JUnit, NDJSON, and result artifacts, and posts a self-updating PR comment with the verdict table, so a budget stop shows up in the same place a normal pass/fail would: right on the pull request, with the spend and the skip count visible without digging into raw logs. Full setup details live in the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) if you're wiring this into an existing pipeline.

## Reading Budget-Stop Output in --agent Mode

If another AI agent is the one kicking off your suite (via the [BrowserBash MCP server](https://browserbash.com/features), for instance, using `run_suite` against a folder of tests), the budget behavior surfaces the same way it would to a human: exit code 2, a `run_end` for every test that actually ran, and no fabricated verdict for the ones that were skipped. That matters specifically because BrowserBash's whole pitch as a validation layer for AI agents depends on it never inventing a pass. A calling agent that reads `status: skipped` on the tail end of a suite knows exactly what it does and doesn't know, rather than assuming a full green run happened when half the suite never executed.

```bash
browserbash run-all .browserbash/tests --agent --budget-usd 3 --timeout 120
```

Parsing this in a script is a matter of streaming NDJSON lines and checking each event's `status` field, no prose parsing, no guessing whether "the suite mostly passed" means anything actionable.

## When a Budget Cap Isn't the Right Tool

It's worth being honest about where this flag doesn't help. A budget cap protects you from runaway spend within a single `run-all` invocation. It does nothing about spend across many separate invocations, so if you're triggering ad hoc `browserbash run` calls from a dozen different scripts, none of which go through `run-all`, you'll want to track spend at a higher level (aggregate the `cost_usd` values from your own logging) rather than expecting a per-run flag to cap a fleet-wide total. It also doesn't retroactively refund a run that's already in flight when the threshold hits, by design, since killing an in-progress browser session for the sake of the last few cents would trade a clean verdict for a marginal savings.

And if your actual problem is that individual tests are expensive because of excessive retries or a model that's overkill for the objective, a budget cap will stop the bleeding on a bad day but won't fix the underlying inefficiency. For that, look at `--model-exec` routing and whether your replay cache is actually staying warm between runs, since a cache that keeps invalidating is usually the real reason a suite's cost baseline crept up in the first place.

## Who Should Turn This On

If you're running BrowserBash suites unattended, on a schedule via [monitor mode](https://browserbash.com/tutorials) or a nightly CI job, a budget cap should be close to non-negotiable. Nobody is watching the run in real time, which is exactly the scenario where an LLM retry storm goes unnoticed until the bill arrives. If you're running suites interactively during development, where you're at the keyboard and can Ctrl-C a run that looks wrong, the cap is a nice-to-have rather than a hard requirement, though it's cheap enough to leave on by default anyway.

Teams on a shared hosted model budget across multiple projects benefit the most: a single misbehaving suite with no cap can eat a disproportionate share of a monthly API allowance before anyone traces it back to a specific `run-all` job. A per-suite `--budget-usd` turns that shared risk into a bounded, attributable cost per suite, which also makes it much easier to reason about total AI testing spend across an org instead of discovering it after the fact in a billing dashboard.

## Getting Started

Start with a baseline run to see your real numbers, set a cap with headroom above that baseline, and let a failed budget check do its job: it's supposed to fail loudly, not quietly clamp your suite down to nothing. Once the cap is in place, revisit it periodically, especially after adding new tests, changing models, or touching anything upstream that might cool the replay cache.

```bash
browserbash run-all .browserbash/tests --budget-usd 2.50 --budget-tokens 500000 --auth prod-login
```

Combined with sharding, auth reuse, and the replay cache, a budget cap is less a defensive afterthought and more the last piece that makes running an AI test suite on a schedule feel as boring, in the good sense, as running any other CI job. For more on how the wider cost model fits into BrowserBash's testmd format and orchestration, the [learn section](https://browserbash.com/learn) and [blog](https://browserbash.com/blog) both have deeper walkthroughs of related flags like `--shard` and `--model-exec`.

## FAQ

### What happens to tests that haven't run yet when the budget is hit?

They're marked `skipped`, not `failed`, in both the console output and `RunAll-Result.md`. Tests that were already in progress are allowed to finish and get a real pass/fail verdict, since stopping a browser session mid-run would leave an unreliable partial result. The suite as a whole exits with code 2 so CI treats a budget stop as a build failure that needs attention, not a silent pass.

### Should I use --budget-usd or --budget-tokens?

Use `--budget-usd` when you're on a hosted model with known pricing and want a dollar figure that matches how your team thinks about cost. Use `--budget-tokens` when you're running a local model where dollar cost doesn't apply, or when you want a cap that's independent of BrowserBash's bundled price table entirely. You can set both, and the orchestrator stops at whichever limit is reached first.

### How do I pick a starting budget number?

Run your suite once without a cap, either in `--agent` mode or by reading `RunAll-Result.md`, and note the total `cost_usd` across all tests. Set your cap somewhere around 1.5x to 2x that baseline to give room for normal variance, then tighten it once you've seen a few real runs. Remember that a warm replay cache drops steady-state cost well below a cold-run baseline, so re-check the number after the cache has had a few clean runs to build up.

### Does the budget cap work with sharded or parallel test runs?

Yes, but each `--shard i/n` process manages its own budget independently since sharding splits your suite into separate `run-all` invocations. If you want a single shard's overspend to stop the whole build, configure your CI workflow to fail the job when any shard exits non-zero, since BrowserBash itself only tracks spend within the process it's running in.

Ready to put a number on your AI testing spend instead of hoping it stays reasonable? Install BrowserBash with `npm install -g browserbash-cli` and add `--budget-usd` to your next `run-all` call. No account is required to use any of this, though signing up at [browserbash.com/sign-up](https://browserbash.com/sign-up) gets you the optional hosted dashboard on top.
