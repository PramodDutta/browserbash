---
title: AI smoke tests in your CI pipeline
description: "Wire ai smoke tests ci into your pipeline: fast plain-English post-deploy checks that drive a real browser and gate releases on exit codes."
date: 2026-05-05
category: ci
---

The job of a smoke test is narrow and unglamorous. After a deploy lands, you want one fast answer: did this break something a real user hits in the first thirty seconds? Setting up **ai smoke tests in ci** lets you ask that question without hand-maintaining selectors and page objects every sprint. You describe the critical flow in plain English, an AI agent drives a real Chrome browser through it, and the process exits `0` if it passed or non-zero if it didn't. Your pipeline already knows how to read exit codes. It does not need to parse prose, scrape a log, or trust a screenshot taken by something that never clicked a button.

This post is about the post-deploy slot specifically. Not your full regression suite, not your nightly cross-browser matrix. The two-minute check that runs right after a release reaches staging or production and tells you go or no-go. I'll cover what belongs in a smoke check (and what doesn't), how an AI agent changes the maintenance math, a concrete pipeline wiring with exit codes and NDJSON, the honest failure modes, and when you're better off keeping the deterministic scripts you already have.

## What a smoke test is actually for

A smoke test is a breadth-first sanity pass, not a depth-first verification. The name comes from hardware: power on the board, and if you see smoke, stop. The software version is the same idea. You touch the handful of flows that, if broken, mean the release is dead on arrival — the home page renders, login works, the primary call-to-action does something, checkout reaches a confirmation. You are not validating every edge case. You are confirming the building isn't on fire.

Three properties separate a good smoke suite from a bad one, and they hold regardless of whether the tests are AI-driven or hand-coded:

- **It finishes fast.** Industry guidance lands around the two-minute mark for the whole suite. If your smoke check takes ten minutes, it's a regression run wearing a smoke-test costume, and people will stop waiting for it.
- **It isn't flaky.** A smoke test that fails randomly trains the team to ignore smoke failures, which defeats the entire point. The moment a red smoke result becomes "oh, that one's always flaky," the gate is dead.
- **It covers the few things that matter most.** Critical paths only. Every flow you add is time the pipeline waits and another thing that can break for reasons unrelated to the deploy.

Smoke tests sit at deploy boundaries. The most common placement is right after the release reaches staging — that catches configuration, secrets, routing, and dependency problems in the same place you decide whether to promote. A production smoke check runs immediately after the production deploy to confirm the release didn't break anything live, ideally against synthetic test accounts rather than real user data, so a failure lets you roll back before users notice. Some teams also run a lightweight version against production every few minutes as a synthetic monitor.

The thing nobody likes to say out loud: most smoke suites rot. They were written against a UI that has since changed three times, half of them are commented out, and the ones that run pass for the wrong reasons. That rot is a maintenance problem, and maintenance is exactly where the AI approach earns its keep — or doesn't.

## Why AI changes the maintenance math (and where it doesn't)

A traditional smoke test is brittle in a specific, well-understood way: it depends on selectors. You wrote `page.click('#checkout-btn')`, a designer renamed the button, and now your green smoke suite is green because it's skipping or your red suite is red for a reason that has nothing to do with the deploy you're gating. Multiply that across a dozen flows and several releases a week and the maintenance tax becomes the dominant cost of having smoke tests at all.

An AI agent removes the selector layer. You write the objective in plain English — "log in as the test user, add the first product to the cart, and confirm the cart shows one item" — and the agent reads the actual rendered page, decides what to click, and adapts when the button moved or got renamed. There's no `#checkout-btn` to go stale because there's no selector at all. When a button's label changes from "Buy now" to "Purchase," a selector-based test breaks and an intent-based objective usually doesn't, because "buy" and "purchase" mean the same thing to a language model reading the page.

That's the upside, and it's real. Here's the honest counterweight, because pretending an AI agent is free of failure modes is how you end up with a worse gate than the one you replaced:

| Concern | Selector-based smoke test | AI smoke test |
| --- | --- | --- |
| Reaction to UI copy/layout changes | Breaks, needs a code edit | Usually adapts on its own |
| Determinism | Fully deterministic | Stochastic; same objective can take different paths |
| Speed per check | Fast (milliseconds of decision) | Slower; each step is a model call |
| Cost per run | Effectively $0 compute | $0 on a local model, or per-token on a hosted model |
| Debuggability | Stack trace points at a line | Need the run record, video, or NDJSON to see what it did |
| Best at | Stable, high-frequency assertions | Flows where the UI shifts and intent is stable |

The agent is not deterministic. The same English objective can take a slightly different path run to run, which is great for surviving UI churn and annoying when you're trying to reproduce a one-off failure. The mitigation is keeping objectives narrow and unambiguous, and capturing artifacts so a failure is inspectable instead of a mystery. More on both below.

## Writing smoke objectives that don't waste your time

The quality of an AI smoke test is mostly the quality of the objective you write. A vague objective gives the agent room to wander; a precise one keeps it on rails and makes failures meaningful. A few patterns that hold up in a CI slot:

**Be specific about the success condition.** "Check the login page" is too loose — the agent doesn't know what "check" means, so its verdict is whatever it decides to be. "Go to /login, sign in with the test account, and confirm the dashboard heading reads 'Welcome back'" gives the agent an unambiguous pass/fail. The agent returns a verdict plus structured extracted values, so name the value you want it to confirm.

**Keep each check to one flow.** Don't ask one objective to log in, update a profile, place an order, and check email. Each added step is another place the run can fail for a reason unrelated to your deploy, and a long multi-step objective is exactly where smaller local models start to drift. One flow per check keeps runs fast and failures legible.

**Pin the data.** Use a known synthetic account and known test products so the expected end state is fixed. A smoke check against live, changing inventory will eventually fail because the catalog changed, not because the deploy broke, and that's the flakiness that kills trust in the gate.

Here's a single post-deploy check from the CLI:

```bash
browserbash run "Go to https://staging.example.com, click Sign in, log in as smoke@example.com, and confirm the page heading reads 'Dashboard'" \
  --headless \
  --timeout 90
```

`--headless` runs without a visible window, which is what you want on a CI agent. `--timeout 90` caps the run at 90 seconds so a hung flow fails the gate instead of stalling the pipeline. The command exits `0` on pass and non-zero on fail — that's the entire contract your pipeline needs.

For a smoke suite you want committed and reviewed alongside the app, markdown tests are a better fit than a shell script full of one-liners. Each list item is a step, `{{variables}}` handle environment differences, and secret-marked variables are masked as `*****` in every log line so credentials never leak into CI output:

```bash
browserbash testmd run ./smoke_test.md
```

A `smoke_test.md` lives in your repo, gets code-reviewed like anything else, and writes a human-readable `Result.md` after each run. You can compose larger suites from smaller files with `@import`, which keeps a "critical paths only" smoke file from sprawling into a regression suite by accident.

## Wiring it into the pipeline with exit codes

The cleanest CI integration is also the oldest one: a process that returns an exit code. Your build system already knows how to fail a step when a command exits non-zero, so you don't need a plugin, a results parser, or a custom reporter. You need a command that drives a browser and tells the truth about whether the flow worked.

BrowserBash maps cleanly onto exit codes:

- `0` — passed
- `1` — failed (the flow ran but the verdict was negative)
- `2` — error (something went wrong before a verdict — a bad config, a missing dependency)
- `3` — timeout (the run hit the `--timeout` ceiling)

For machine consumption — which is what a pipeline is — `--agent` emits NDJSON, one JSON object per line. You get progress events as the agent works and a terminal event with the final state:

```bash
browserbash run "Open https://example.com, add the first product to the cart, and confirm the cart count shows 1" \
  --headless \
  --agent \
  --record \
  --timeout 120
```

A progress line looks like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. Your CI step can stream those lines, surface the summary in the build log, and let the exit code decide the gate. No prose parsing, no guessing from a screenshot.

The `--record` flag is the piece that makes AI smoke tests debuggable in CI, and it matters more here than in a local run because you weren't watching. It captures a screenshot and a `.webm` session video using a bundled ffmpeg, so when a smoke check fails at 2 a.m. you watch the recording and see exactly where the flow diverged. With the built-in engine you also get a Playwright trace, which is the difference between "the smoke test failed" and "the smoke test failed because the cart endpoint 500'd after the third click." Stash those as build artifacts and your post-mortem is a video, not a guessing game.

Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at the last 200), so even without explicit artifact handling there's a local record on the agent. For deeper background on the exit-code pattern and gating deploys on a real-browser pass/fail, the [BrowserBash blog](https://browserbash.com/blog) has companion write-ups, and the [tutorials](https://browserbash.com/tutorials) walk through end-to-end setups.

### A minimal post-deploy stage

The shape is the same across GitHub Actions, GitLab CI, Jenkins, or a plain shell script. Install the CLI, run the check after the deploy step, fail the job on a non-zero exit:

```bash
npm install -g browserbash-cli
browserbash run "Go to $DEPLOY_URL and confirm the home page loads and the primary nav is visible" \
  --headless --timeout 60 --record
```

If that command exits `0`, the deploy is good enough to promote. If it exits `1`, `2`, or `3`, the job fails and your existing notifications fire. Nothing about this is BrowserBash-specific — it's the standard "smoke gate as a process" pattern, and any tool that respects exit codes slots in the same way. What the AI agent buys you is that the objective survives the next three UI tweaks without a code edit.

## Picking where the browser runs and which model interprets the English

Two choices shape how AI smoke tests behave in CI: where the browser runs (the provider) and which model reads the page (the LLM backend). Defaults are sensible, so you can ignore both at first, but in a pipeline the choices have real consequences.

**Provider — where the browser runs.** The default is `local`: your own Chrome on the CI agent. That's the simplest setup and keeps everything on the machine. If your CI agents are containers without a display, you can point at any DevTools endpoint with `--provider cdp --cdp-endpoint ws://...`, or use a hosted browser grid — `browserbase`, `lambdatest`, or `browserstack` — when you need real cross-environment coverage or your runners can't host Chrome. The grid providers need their own credentials; LambdaTest and BrowserStack automatically use the built-in engine. The [features page](https://browserbash.com/features) lays out the provider matrix.

**Model — who interprets the objective.** The default is `auto`, which resolves in order: a local Ollama model first (free, no keys, nothing leaves the machine), then `ANTHROPIC_API_KEY` if set (`claude-opus-4-8`), then `OPENAI_API_KEY` (`openai/gpt-4.1`), otherwise it errors with guidance. The Ollama-first default means your model bill can be a guaranteed $0 — on a local model, no tokens ever leave your CI agent.

Here's the honest caveat, because it determines whether your smoke gate is trustworthy. Very small local models (8B parameters and under) are flaky on long multi-step objectives — they drift, miss a step, or declare victory early. For a CI gate, flakiness is the one thing you cannot tolerate. So either keep objectives short and single-flow (which you should be doing anyway), or run a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model for the harder flows. Pin the model explicitly in CI so a run is reproducible rather than depending on whatever happens to be installed on the agent:

```bash
browserbash run "Log in as the test user and confirm the dashboard loads" \
  --model ollama/qwen3 --headless --timeout 90
```

You can also pin a hosted model (`--model claude-opus-4-8`, `--model openai/gpt-4.1`, `--model google/gemini-2.5-flash`), route through OpenRouter (`--model openrouter/meta-llama/llama-3.3-70b-instruct`), or point at an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`. The tradeoff is the obvious one: local is free and private but needs decent hardware on your runner; hosted is a per-token cost but gives you a strong model without provisioning a GPU. The [learn section](https://browserbash.com/learn) goes deeper on matching model size to objective complexity.

## When AI smoke tests are the wrong tool

A balanced recommendation has to include the cases where you should not reach for this. AI smoke tests are not a universal upgrade, and the senior move is knowing the boundary.

**Keep deterministic scripts for high-frequency, stable assertions.** If you run a smoke check every two minutes as a synthetic monitor and the flow hasn't changed in a year, a plain HTTP check or a tiny Playwright script is faster, cheaper, and perfectly reliable. There's no UI churn for the AI to absorb, so you're paying the stochastic-and-slower tax for a benefit you aren't using. Use the AI approach where the UI moves; use a script where it doesn't.

**Don't smoke-test what a unit or API test covers better.** If the thing you're worried about is business logic, a unit test catches it faster and more precisely than driving a browser. Smoke tests are for the integrated, user-facing path — the place where routing, config, and the front end all have to line up. Pushing logic assertions into a browser smoke check is slow and gives you worse failure messages.

**Be cautious with hard multi-step flows on small models.** A ten-step checkout with conditional branches is exactly where a small local model drifts. If that flow is your gate, either run it on a capable model or break it into a few short single-flow checks. Don't gate a release on a long objective interpreted by an 8B model and then wonder why the gate is flaky.

Here's a quick way to decide:

| Situation | Reach for | Why |
| --- | --- | --- |
| UI copy/layout changes often, flow intent stable | AI smoke test | Survives churn without code edits |
| High-frequency synthetic monitor, frozen UI | Deterministic script / HTTP check | Faster, cheaper, fully reliable |
| Business-logic correctness | Unit / API test | Precise, fast, better failure messages |
| Long branching flow as the gate | Capable model, or split into short checks | Small models drift on long objectives |
| Need to prove a real user path works post-deploy | AI smoke test | Drives a real browser end to end |

If you're weighing this against a recorder-and-monitor SaaS or a hosted AI testing platform, compare honestly on the axes that matter to you: maintenance cost when the UI changes, where your data and credentials live, and total cost at your run volume. BrowserBash is free and open-source (Apache-2.0) and runs entirely on your machine by default, which is the right fit when data residency or a $0 model bill matters. A hosted platform with a managed grid and a polished dashboard may be the better fit if you'd rather not run any infrastructure yourself — that's a real tradeoff, not a knock. The [pricing page](https://browserbash.com/pricing) and a [case study](https://browserbash.com/case-study) help you sanity-check the comparison against your own numbers.

## A realistic rollout for an existing pipeline

You don't rip out your current smoke suite on day one. Start by adding a single AI smoke check next to it, in shadow mode — run it, log the result, but don't gate on it yet. Watch it across a week of deploys. Does it pass when the app is healthy and fail when something's genuinely broken? If it's noisy, the objective is too vague or the model is too small; tighten the objective and bump the model before you trust it.

Once one check is stable, move it from shadow to gating and add the next critical path. Keep the suite small on purpose — the whole point of a smoke gate is speed, and every flow you add is latency on every deploy. Commit the markdown tests so they're reviewed with the code that they cover, mask every credential as a secret variable, and stash the `--record` video and (with the built-in engine) the Playwright trace as artifacts so a failure is a thirty-second watch, not an investigation.

The optional local dashboard is useful while you're tuning. `browserbash dashboard` opens a fully local view at `localhost:4477` where you can scroll through past runs and watch what the agent actually did — no account, no upload, nothing leaving the machine. If you later want a shared cloud view for the team, that's opt-in: `browserbash connect --key bb_...` links it, and only runs you explicitly mark with `--upload` get pushed (free cloud runs are kept 15 days). Without `--upload`, nothing leaves your machine — which for a lot of CI environments is the deciding factor. The CLI is on [npm](https://www.npmjs.com/package/browserbash-cli) and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly what it does before you trust it in your pipeline.

The end state is unremarkable in the best way: a deploy lands, a real browser clicks through your top three flows in under two minutes, and a clean exit code says go or no-go. When the UI changes next sprint, the objectives still read true and nobody opens a PR to fix a selector. That's the whole pitch — fast post-deploy checks that don't rot.

## FAQ

### What is an AI smoke test in CI?

An AI smoke test is a fast post-deploy check where you describe a critical user flow in plain English and an AI agent drives a real browser through it, returning a pass or fail. In CI, it runs as a pipeline step right after a deploy and gates promotion on the process exit code. It replaces selector-based smoke scripts that break every time the UI changes, since the agent reads the rendered page and adapts to intent rather than matching a fixed selector.

### How fast should a smoke test suite run in a pipeline?

The common target is under two minutes for the whole smoke suite. Smoke tests are a breadth-first sanity pass over your most critical flows, not a full regression run, so anything that takes ten minutes is too big for the slot. Keep each AI objective to a single flow, cap each run with a timeout, and only add a flow if breaking it would mean the release is dead on arrival.

### Will AI smoke tests be flaky in CI?

They can be if you misuse them. Very small local models under 8B parameters drift on long multi-step objectives, and vague objectives give the agent room to reach inconsistent verdicts. You keep them reliable by writing specific success conditions, limiting each check to one flow, pinning synthetic test data, and running a mid-size local model or a capable hosted model for harder flows. Run new checks in shadow mode for a week before you let them gate a release.

### Does running AI smoke tests cost money per run?

It depends on the model. On a local Ollama model the model bill is a guaranteed $0 because nothing leaves your machine and there are no tokens to pay for — you only need decent hardware on the CI runner. If you pin a hosted model like Claude or GPT, you pay per token for that model, which buys you a stronger interpreter without provisioning a GPU. The CLI itself is free and open-source under Apache-2.0.

Ready to add a fast post-deploy check to your pipeline? Install the CLI with `npm install -g browserbash-cli` and run your first smoke objective in minutes. An account is optional — you only need one for the cloud dashboard. [Sign up here](https://browserbash.com/sign-up) when you want it.
