---
title: Smoke Test Staging Before Every Deploy With AI
description: "Smoke test your staging environment before every deploy with a plain-English AI suite that returns exit code 0/1 for CI — free, local, no API keys."
date: 2026-02-07
category: use-case
---

Every team that has shipped a broken release to production knows the exact moment it goes wrong: the build went green, the deploy button got clicked, and nobody actually checked whether a real user could still log in. The fix is not more unit tests. It is a smoke test against your staging environment that runs before every deploy and slams the gate shut when something user-facing breaks. This post shows how to build that gate with a plain-English smoke suite using [BrowserBash](https://browserbash.com), a free and open-source natural-language browser automation CLI, so the test returns exit code `0` or `1` and your CI does the rest — no Checkly subscription, no Ghost Inspector recorder, no selectors to babysit.

The premise is simple. You write the flow in English. An AI agent drives a real Chrome browser through your staging environment the way a person would, returns a pass/fail verdict, and exposes that verdict as a process exit code your pipeline already knows how to read. The whole thing runs inside your own CI runner on free local models, so the model bill is genuinely zero and your staging URLs never leave your infrastructure.

## What a pre-deploy smoke test is actually for

It helps to be precise, because "smoke test" gets stretched to mean almost anything. A pre-deploy smoke test is not your regression suite. It is not where you assert every validation message, every edge case, every pixel. It answers one question: **is this build sane enough that we should let it move forward?**

That framing has teeth. A good smoke suite is short — five to fifteen flows, not five hundred. It covers breadth instead of depth: can a user reach the homepage, can they log in, can they complete the one transaction that pays the bills, does search return results, does the signup form accept a new account. It runs fast enough to sit in the critical path of a deploy without anyone resenting it. And it fails for the right reasons. A smoke test that goes red because a designer renamed a CSS class is worse than no smoke test, because it trains the team to click "deploy anyway" — and the day that reflex forms, the gate stops gating anything.

Running it against **staging specifically** is the whole point. You want to catch the regression on the environment that mirrors production but is not production. Smoke test staging environment first, get a clean verdict, then promote with confidence. If you only ever smoke test production, you are testing after the blast radius, not before it.

## Why selector-based smoke tests fail the wrong way

Anyone who has run selector-based smoke tests in CI knows the failure mode by heart. The product is fine. Users are checking out happily. But the staging smoke job is red and the deploy is blocked, because someone shipped a styling refresh that regenerated the utility classes a test was anchored to. An engineer gets pinged, sees the "failure" is a stale `data-testid`, patches the locator, re-runs. Multiply that by a dozen flows and a UI that changes every sprint, and your smoke suite becomes a part-time maintenance job that produces zero new coverage.

The deeper problem: a selector is an implementation detail, and you have coupled your deploy gate to it. The job of a smoke test is to verify behavior — the user-visible contract — but selectors describe structure. The two drift apart every time the front end is touched, and each drift is a false failure that erodes trust in the gate.

BrowserBash removes the coupling. You write a plain-English objective; an AI agent drives a real Chrome or Chromium browser, locates elements the way a human would, runs the steps, and returns a verdict plus structured results. No selectors, no page objects. When the markup changes but the behavior holds, the test keeps passing. When the behavior actually breaks, the test fails and the deploy is correctly blocked. That is the property you want from a gate: it goes red exactly when a person would also get stuck.

## Your first staging smoke test in one command

Before wiring anything into CI, prove the flow on your machine. Install the CLI and run a single objective against staging:

```bash
npm install -g browserbash-cli

browserbash run "Go to https://staging.example.com, log in as demo@example.com \
  with password demo1234, and verify the dashboard greeting is visible" --headless
```

The agent opens a real browser, performs the steps, and exits. You see a verdict in the terminal — passed or failed — and the process exit code reflects it. That exit code is the entire foundation of the deploy gate, so it is worth understanding the contract before going further.

By default BrowserBash uses the **stagehand** engine (MIT-licensed, by Browserbase). You can switch to the **builtin** engine (an in-repo Anthropic tool-use loop) when you want a Playwright trace alongside your recording. For the model, BrowserBash is Ollama-first: it auto-resolves a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. So you can run entirely on a free local model, point it at a free hosted model like `openai/gpt-oss-120b:free` through OpenRouter, or bring your own Anthropic key for the hard flows. Nothing leaves your machine unless you explicitly pass `--upload`. For a deploy gate that local-first default matters: your smoke tests run inside your own CI runner without shipping staging URLs or test data to anyone.

One honest caveat I will repeat throughout: very small local models — roughly 8B parameters and under — get flaky on long, multi-step objectives. They lose the thread, click the wrong thing, or declare victory early. The reliable sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. If you point a tiny model at a ten-step checkout, expect wobble. Match the model to the flow.

## The contract that makes deploy gating work: exit codes

CI systems make exactly one decision about a step: did it succeed or fail. They read that from the process exit code, not from log text. Pipelines that scrape stdout for a "0 failures" line are one log-format change away from a silent false green — the kind of bug where the gate stays open for days while something is quietly broken.

BrowserBash treats the exit code as the verdict, with four distinct values:

| Exit code | Meaning | What CI should do |
|---|---|---|
| `0` | passed | Promote the deploy |
| `1` | failed — an objective or verify step did not hold | Block the deploy; a human should look |
| `2` | error — infrastructure or agent problem | Block; retry once before failing |
| `3` | timeout — the run outlived its budget | Block; retry once before failing |

The granularity is what makes this a good gate instead of a blunt one. A `1` is a product signal: something a user would hit is broken, and auto-retrying it teaches the team to ignore red. A `2` or `3` is an environment signal — a runner hiccup, a dead endpoint, a slow cold start — and those deserve a single automatic retry before you fail the build. Collapse them all into a generic "non-zero" and you lose the information that lets you tune the pipeline.

To get machine-readable detail alongside the exit code, add `--agent`. It emits NDJSON to stdout — one JSON object per line, including a final event with the verdict and summary — which you can archive as a CI artifact and parse when a run goes red:

```bash
browserbash run "Add the first product to the cart and complete checkout \
  with the saved test card, then verify the page shows 'Thank you for your order!'" \
  --agent --headless > smoke-results.ndjson
echo "exit: $?"
```

No prose parsing. Your build script reads `$?`, and your dashboards read the NDJSON. The two never disagree, because they come from the same run.

## Committing the suite: Markdown tests instead of one-liners

A single `browserbash run` is great for proving a flow. For a real deploy gate you want the suite in version control, reviewable in pull requests, and runnable by anyone on the team without memorizing a prompt. That is what Markdown tests are for.

You write a committable `*_test.md` file where each list item is a step. You compose suites with `@import`, parameterize with `{{variables}}`, and mark secrets so they are masked as `*****` in every log line — which matters when CI logs are visible to a wide audience. Here is a staging smoke test for a login-and-checkout flow:

```markdown
# Staging smoke: login and checkout

- Go to {{baseUrl}}
- Click "Sign in"
- Log in as {{email}} with password {{password}}
- Verify the dashboard greeting is visible
- Add the first product to the cart
- Proceed to checkout
- Complete checkout with the saved test card
- Verify the page shows "Thank you for your order!"
```

Run it against staging, passing the environment-specific values and marking the password as a secret so it never appears in logs:

```bash
browserbash testmd run ./smoke/login-checkout_test.md \
  --var baseUrl=https://staging.example.com \
  --var email=demo@example.com \
  --secret password=$STAGING_PASSWORD \
  --agent --headless
```

After each run BrowserBash writes a human-readable `Result.md` next to the test — a plain record of what passed, what failed, and what the agent saw at each step. You can commit that artifact, attach it to a PR, or drop it into a release ticket. It reads like something a human wrote, which makes it the artifact your reviewers actually look at instead of a wall of CI log.

### Composing a suite with @import

Once you have more than two or three flows, keep each in its own file and stitch them together with `@import`. A `smoke_test.md` that imports `login_test.md`, `search_test.md`, and `checkout_test.md` gives you one entry point for the whole gate while keeping each flow small enough to reason about and reuse. When a flow changes, you edit one file, and every suite that imports it picks up the change.

## Wiring the gate into CI

The gate is just a job that runs the suite and lets the exit code decide. In GitHub Actions it looks like this:

```yaml
- name: Smoke test staging
  run: |
    npm install -g browserbash-cli
    browserbash testmd run ./smoke/smoke_test.md \
      --var baseUrl=https://staging.example.com \
      --secret password=${{ secrets.STAGING_PASSWORD }} \
      --agent --headless
```

If the suite passes, the step exits `0` and the workflow proceeds to the deploy job. If any flow fails, it exits `1`, the step goes red, and GitHub Actions stops the pipeline. There is no extra glue: the deploy gate is the natural behavior of a step that fails on non-zero exit. Add a retry-once wrapper for exit codes `2` and `3` if you want to absorb runner flakiness without masking real product failures, and upload `smoke-results.ndjson` and `Result.md` as artifacts so a red build comes with evidence attached.

Because everything runs locally inside the runner, there is no per-check billing, no minutes quota on a hosted monitoring plan, and no data leaving your CI environment. The cost of running the gate is the cost of the runner you are already paying for.

## The free local alternative to Checkly and Ghost Inspector

If you have shopped for pre-deploy browser checks, you have probably looked at Checkly and Ghost Inspector. Both are real, capable products, and for plenty of teams they are the right call. The point here is not to dunk on them — it is to be honest about where each fits, so you can decide whether you actually need a hosted platform in your release pipeline or whether a local CLI gate covers the job.

**Checkly** is a hosted synthetic monitoring platform. You write browser checks as Playwright scripts in JavaScript or TypeScript, and Checkly runs them on a schedule from global locations, alerting you when something breaks. Its pitch is "Monitoring as Code" — keep monitors in version control, deploy with a CLI or Terraform, treat a broken check like a broken build. As of 2026 it offers a free Hobby tier and paid tiers that scale with check volume, locations, and features; treat any pricing as a snapshot and confirm on Checkly's own site before you budget.

**Ghost Inspector** is a hosted, mostly low-code browser testing and monitoring tool. You record or build tests in a visual editor and the GUI manages selectors and assertions, with scheduling and CI triggers on top. It leans toward teams that want a recorder and a console rather than code. Specifics of its current plans and limits are not worth guessing at here; check their site for what is true as of 2026.

Here is the honest comparison:

| | BrowserBash | Checkly | Ghost Inspector |
|---|---|---|---|
| Test authoring | Plain English / Markdown | Playwright (JS/TS) code | Visual recorder / low-code |
| Where it runs | Your machine / CI runner | Hosted, global locations | Hosted cloud |
| Element handling | AI agent, no selectors | Selectors in Playwright | Recorder-managed selectors |
| Scheduled monitoring | Not built in | Core feature | Yes |
| Global check locations | No | Yes | Yes (cloud) |
| Cost on local models | $0 | Free tier + paid plans | Paid plans |
| CI gate via exit code | Yes (`0`/`1`/`2`/`3`) | Yes (CLI) | Yes (triggers) |
| Data leaves your infra | No (unless `--upload`) | Yes (hosted) | Yes (hosted) |

The pattern in that table is the decision. Checkly and Ghost Inspector are monitoring platforms first — their core value is scheduled, geographically-distributed checks running around the clock, with alerting and dashboards. BrowserBash is a CLI first — its core value is a fast, free, local pass/fail verdict you drop into a pipeline. They overlap on the deploy-gate use case, and on that one job a local CLI is hard to beat on cost and privacy. They diverge everywhere monitoring lives.

## When to choose a hosted platform instead

Be honest with yourself about what you need, because the wrong tool here wastes money or leaves a gap.

**Choose Checkly or Ghost Inspector when** you need continuous, scheduled synthetic monitoring from multiple global regions — round-the-clock checks that page you at 3 a.m. when checkout breaks in production, with built-in alerting, status pages, and historical uptime dashboards. A pre-deploy gate runs when you deploy; a monitoring platform runs whether you deploy or not. If "is the site up right now, from Frankfurt and São Paulo" is the question you need answered continuously, a hosted platform is the right answer and a local CLI is not pretending to be one. Checkly in particular fits teams already living in Playwright who want their monitors as code; Ghost Inspector fits teams who want a recorder and a console rather than scripts.

**Choose a plain-English BrowserBash suite when** your job is gating deploys, you want a $0 model bill, you do not want staging URLs and test data leaving your infrastructure, and you are tired of maintaining selectors that break on cosmetic UI changes. It is also the pragmatic pick when you want the suite committed in Markdown that non-engineers can read and edit, and when you would rather not add another SaaS subscription to the release pipeline.

For many teams the answer is **both**: a free BrowserBash gate on every deploy to catch regressions before they ship, and a hosted monitor watching production continuously after. The gate and the monitor are different jobs. Using one tool for each, where each is strongest, beats forcing either to do the other.

## Recording runs for the inevitable red build

When the gate goes red, the next question is always "what did it actually do?" Add `--record` and BrowserBash captures a screenshot and a full `.webm` session video via ffmpeg on any engine. On the builtin engine it additionally captures a Playwright trace you can open in the trace viewer and step through frame by frame.

```bash
browserbash testmd run ./smoke/smoke_test.md \
  --var baseUrl=https://staging.example.com \
  --record --agent --headless
```

Attach the video and `Result.md` to the failed CI run and the on-call engineer sees the failure instead of reconstructing it from logs. If you want run history, video replay, and per-run timelines in a shared view, you can opt in with `browserbash connect` and `--upload` to the free cloud dashboard (free uploaded runs are kept 15 days), or run the fully local `browserbash dashboard` to keep everything on your own machine. Both are strictly opt-in — by default nothing is uploaded anywhere. You can read more about these options in the [features overview](https://browserbash.com/features) and the [learn hub](https://browserbash.com/learn).

## Running the gate against other browsers and grids

Local Chrome is the default and covers most smoke needs, but the same suite runs unchanged on other providers via a single `--provider` flag. Point it at any DevTools endpoint with `cdp`, or run on a hosted grid like LambdaTest, BrowserStack, or Browserbase when you need a browser or OS your runner does not have:

```bash
browserbash testmd run ./smoke/smoke_test.md \
  --var baseUrl=https://staging.example.com \
  --provider lambdatest --agent --headless
```

The objective text does not change — only where the browser runs. That keeps your smoke suite portable: write it once in plain English, run it locally for the deploy gate, and fan it out to a grid for the occasional cross-browser pass without rewriting a single step. There is more on providers and engines in the [BrowserBash docs](https://browserbash.com/learn) and on the [blog](https://browserbash.com/blog).

## A realistic staging smoke suite

To make this concrete, here is what a healthy pre-deploy suite looks like for a typical SaaS or store. Each is one short flow, each gates the deploy, and the whole thing finishes in a couple of minutes:

- **Homepage loads** — go to staging, verify the hero and primary nav render.
- **Login** — sign in with the demo account, verify the dashboard greeting.
- **Core transaction** — add an item to the cart, complete checkout, verify "Thank you for your order!"
- **Search** — type a known query, verify results appear.
- **Signup** — register a fresh test account, verify the welcome state.

Notice none of these assert deep correctness. They check that the load-bearing paths work. If all five pass on staging, the build is sane enough to promote. If checkout fails, you find out before a customer does — which is the entire reason the gate exists. Keep the suite this lean and it stays fast, stays trustworthy, and stays something the whole team is glad runs before every deploy. Deeper regression coverage is a separate suite with a different budget, not something you bolt onto the gate.

## FAQ

### What is a smoke test for a staging environment?

A staging smoke test is a short suite that drives a real browser through your most critical user flows on staging — login, the core transaction, search, signup — before you promote a build. It answers one question: is this build sane enough to move forward? It is breadth over depth, usually five to fifteen flows, and it runs fast enough to sit in the critical path of a deploy.

### How do I make a smoke test gate a deploy in CI?

Run the suite as a CI step and let the process exit code decide. BrowserBash returns `0` for pass and `1` for fail, so a passing run lets the pipeline proceed to deploy and a failing run goes red and stops it. Add `--agent` for NDJSON results you can archive, and retry once on exit codes `2` and `3` to absorb runner flakiness without hiding real product failures.

### Is BrowserBash a free alternative to Checkly or Ghost Inspector?

For the pre-deploy gate use case, yes. BrowserBash is free, open-source, and runs locally on free models, so there is no subscription and no per-check billing. Checkly and Ghost Inspector are hosted monitoring platforms with scheduled, global checks and alerting — if you need continuous production monitoring, a hosted platform is the better fit, and many teams run a free gate on deploy plus a hosted monitor on production.

### Can I run an AI smoke test without sending data to the cloud?

Yes. BrowserBash is Ollama-first and defaults to free local models, so nothing leaves your machine or your CI runner by default — no API keys required. Uploading to the cloud dashboard is strictly opt-in via `browserbash connect` and `--upload`, and there is a fully local `browserbash dashboard` if you want history and replay without any upload at all.

Ready to gate your next deploy? Install with `npm install -g browserbash-cli`, write your first flow in plain English, and wire the exit code into CI. No account is required to run anything — though you can [sign up](https://browserbash.com/sign-up) for the optional free dashboard whenever you want run history and video replay.
