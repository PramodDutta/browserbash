---
title: CI/CD Browser Smoke Tests in Plain English
description: "Write CI/CD browser smoke tests in plain English with BrowserBash. Gate deploys using GitHub Actions exit codes — no selectors, no flaky scripts."
date: 2026-06-13
category: use-case
---

A deploy gate is only as trustworthy as the smoke test behind it. If your pipeline promotes a build to production the moment the unit tests go green, you are betting that nothing user-facing broke between "compiles" and "checkout works." CI/CD browser smoke tests are the cheap insurance against that bet — a tiny suite that drives a real browser through your most critical flows and fails the deploy if any of them stops working. The problem is that traditional smoke tests are written in selectors, and selectors break for reasons that have nothing to do with whether your product is healthy. This post shows how to write deploy-gating smoke tests in plain English with [BrowserBash](https://browserbash.com), a free and open-source natural-language browser automation CLI, and wire them into GitHub Actions so the exit code becomes the gate.

## What a smoke test is actually for

It helps to be precise about the job, because smoke tests get overloaded constantly. A smoke test is not regression coverage. It is not a place to assert every edge case, validate every error message, or check pixel positioning. A smoke test answers exactly one question: **is this build sane enough to let real users touch it?**

That framing has consequences. A good smoke suite is short — five to fifteen flows, not five hundred. It covers breadth, not depth: can a user log in, can they reach the dashboard, can they complete the one transaction that pays your bills, does the search box return results. It runs fast enough to sit in the critical path of a deploy without anyone resenting it. And critically, it fails for the right reasons. A smoke test that goes red because someone renamed a CSS class is worse than no smoke test, because it trains the team to click "deploy anyway" — and once that reflex exists, the test gates nothing.

This last property is where plain-English smoke tests pull ahead. When the instruction is "click the Checkout button" instead of `page.locator('[data-testid="checkout-btn-v2"]')`, a front-end refactor that moves the button or rewrites its markup does not break the test. The build is still sane; the smoke test still passes; the deploy proceeds. The test only goes red when a human would also get stuck — which is exactly when you want the gate to slam shut.

## Why selector smoke tests fail the wrong way

Every team that has run selector-based smoke tests in CI knows the failure mode. The product is fine. Users are happily checking out. But the nightly smoke job is red, and the deploy is blocked, because a designer shipped a styling refresh that regenerated the utility classes a test was anchored to. Someone gets paged, opens the run, sees that the "failure" is a stale `data-testid`, patches the selector, and re-runs. Multiply that by a dozen flows and a UI that changes every other sprint, and the smoke suite becomes a part-time maintenance job that produces zero new coverage.

The deeper issue is that a selector is an implementation detail, and you have coupled your deploy gate to implementation details. The whole point of a smoke test is to verify behavior — the user-visible contract — but selectors describe structure. The two drift apart every time the front end is touched, and each drift is a false failure that erodes trust in the gate.

BrowserBash removes the coupling. You write a plain-English objective; an AI agent drives a real Chrome or Chromium browser, finds the elements the way a person would, executes the steps, and returns a verdict plus structured results. There are no selectors and no page objects to maintain. When the markup changes but the behavior does not, the test keeps passing. When the behavior actually breaks, the test fails — and the deploy is correctly blocked.

## Your first smoke test in one command

Before wiring anything into CI, prove the flow locally. Install the CLI and run a single objective against your staging environment:

```bash
npm install -g browserbash-cli

browserbash run "Go to https://staging.example.com, log in as demo@example.com, \
  and verify the dashboard greeting is visible" --headless
```

The agent opens a real browser, performs the steps, and exits. You will see a verdict in the terminal — passed or failed — and the process exit code reflects it. That exit code is the entire foundation of the deploy gate, so it is worth understanding the contract before going further.

By default BrowserBash uses the **stagehand** engine (MIT-licensed), and you can switch to the **builtin** engine (an Anthropic tool-use loop) when you want a Playwright trace alongside your recording. For the model, BrowserBash is Ollama-first, so you can run entirely on a free local model, point it at a free OpenRouter model like `openai/gpt-oss-120b:free`, or bring your own Anthropic key. Nothing leaves your machine unless you explicitly pass `--upload`. For a deploy gate, that local-first default matters: your smoke tests run inside your own CI runner without sending your staging URLs or test data anywhere.

## The contract that makes deploy gating work: exit codes

CI systems make exactly one decision about a step: did it succeed or fail. They read that from the process exit code, not from log text. Pipelines that scrape stdout for a "0 failures" line are one log-format change away from a silent false green — the kind of bug where the gate stays open for days while something is quietly broken in production.

BrowserBash treats the exit code as the verdict, with four distinct values:

| Exit code | Meaning | What CI should do |
|---|---|---|
| `0` | passed | Promote the deploy |
| `1` | failed — an objective or verify step did not hold | Block the deploy; a human should look |
| `2` | error — infrastructure or agent problem | Block; retry once before failing |
| `3` | timeout — the run outlived its budget | Block; retry once before failing |

The granularity is what makes this a good gate rather than a blunt one. A `1` is a product signal: something a user would hit is broken, and silently auto-retrying it would teach the team to ignore red. A `2` or `3` is an environment signal — a runner hiccup, a dead endpoint, a slow cold start — and those are worth a single automatic retry before you fail the build. Collapsing all of these into a generic "non-zero" loses information that helps you tune the pipeline.

To get machine-readable detail alongside the exit code, add `--agent`. It emits NDJSON to stdout — one JSON object per line, including a final `run_end` event with the verdict and summary — which you can archive as a CI artifact and parse when a run goes red:

```bash
browserbash run "Add the first product to the cart and complete checkout \
  with the saved test card, then verify the order confirmation page" \
  --agent --headless --timeout 180 > checkout.ndjson
echo "exit: $?"
```

## Organizing smoke tests as markdown files

A single inline objective is fine for a spike, but a real smoke suite lives in version control where it can be reviewed in pull requests. BrowserBash supports **markdown tests**: any file named `*_test.md` where each list item is one step. The agent runs the steps in order, and `{{variables}}` work everywhere — with secret values masked as `*****` in output so credentials never leak into CI logs.

Here is a deploy-gating login smoke test:

```markdown
# Login smoke test

- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field and press Enter
- Verify the dashboard heading is visible
- Verify the user menu shows the logged-in account
```

And a checkout smoke test that reuses the login steps with `@import`, so a change to the login flow is a one-file fix instead of a hunt across every test:

```markdown
# Checkout smoke test

@import ./helpers/login.md

- Click the Catalog link
- Add the first product to the cart
- Open the cart and click Checkout
- Fill the shipping form with the saved test address
- Pay with the test card {{test_card}}
- Verify the order confirmation number is visible
```

Run a single markdown test:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md --agent --headless --timeout 180
```

The `{{base_url}}`, `{{username}}`, and `{{test_card}}` placeholders come from a variables file, which lets the same suite run against staging in CI and against a local dev server on your laptop without editing a line of the test. Because each step is plain English, a manual QA engineer who knows the product flows — but does not write code — can author and review these tests directly in a pull request. The smoke suite stops being a thing only two automation engineers can touch.

## Wiring smoke tests into GitHub Actions

Now the deploy gate. The pattern is: deploy to staging, run the smoke suite against it, and only promote to production if the suite passes. In GitHub Actions, "only if the previous step passed" is automatic — a non-zero exit code fails the job, and a failed job blocks anything that needs it.

Here is a workflow that runs the smoke suite as a gate between staging and production deploys:

```yaml
name: Deploy with smoke gate

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: ./scripts/deploy-staging.sh

  smoke:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install BrowserBash
        run: npm install -g browserbash-cli

      - name: Run smoke suite against staging
        env:
          BASE_URL: https://staging.example.com
          TEST_USER: ${{ secrets.SMOKE_USER }}
          TEST_PASS: ${{ secrets.SMOKE_PASS }}
        run: |
          browserbash testmd run .browserbash/tests/login_test.md \
            --agent --headless --timeout 180 > login.ndjson
          browserbash testmd run .browserbash/tests/checkout_test.md \
            --agent --headless --timeout 180 > checkout.ndjson

      - name: Upload NDJSON artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-results
          path: "*.ndjson"

  deploy-production:
    needs: smoke
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Promote to production
        run: ./scripts/deploy-production.sh
```

The gate is the dependency chain. `smoke` needs `deploy-staging`, and `deploy-production` needs `smoke`. If any `browserbash testmd run` exits non-zero, the `smoke` job fails, and `deploy-production` never starts — the broken build stays out of production with no extra logic. The `if: always()` on the artifact upload means you get the NDJSON even when the suite fails, so you can open the `run_end` event and see exactly which step broke without re-running anything. Secrets flow in as environment variables and are masked in BrowserBash output, so they never appear in the run logs.

### Separating environment failures from product failures

The four exit codes let you act on the distinction between "the product is broken" and "the runner had a bad moment." A small wrapper retries only the environment-class failures:

```bash
run_smoke () {
  browserbash testmd run "$1" --agent --headless --timeout 180 > "$2"
  code=$?
  if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
    echo "Environment failure ($code) on $1 — retrying once"
    browserbash testmd run "$1" --agent --headless --timeout 180 > "$2"
    code=$?
  fi
  return $code
}

run_smoke .browserbash/tests/login_test.md login.ndjson || exit 1
run_smoke .browserbash/tests/checkout_test.md checkout.ndjson || exit 1
```

A `1` — a real product failure — fails immediately and blocks the deploy, exactly as it should. A `2` or `3` gets one retry to absorb a transient grid or network hiccup before failing. This keeps the gate strict about product health while staying resilient to infrastructure noise, which is the balance that keeps a team trusting their pipeline instead of routinely overriding it.

## Capturing evidence when the gate trips

When a smoke test blocks a deploy, the next question is always "what broke?" — and the faster you answer it, the shorter the time your release is stuck. BrowserBash can record what happened. The `--record` flag captures a screenshot and a session video (a `.webm` produced via ffmpeg) on any engine, and the builtin engine additionally writes a Playwright trace you can open for a step-by-step replay:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md \
  --agent --headless --record --timeout 180 > checkout.ndjson
```

Upload those recordings as artifacts the same way as the NDJSON, and a failed deploy gate comes with a video of the exact moment the flow broke — far more useful than a stack trace when the problem is "the pay button never became clickable." If you would rather not manage artifacts by hand, `--upload` pushes a run to the free cloud dashboard (runs are kept for fifteen days), and `browserbash dashboard` serves the same view locally. Both are optional; by default everything stays on your runner.

## Running the gate on a real-browser cloud grid

CI runners are usually headless Linux boxes, which is fine for most smoke flows. But sometimes you need to gate on a browser or OS that your runner cannot provide — a specific Safari version, a real mobile viewport, a Windows-only quirk. BrowserBash abstracts the browser backend behind a single `--provider` flag, with support for `local`, `cdp`, `browserbase`, `lambdatest`, and `browserstack`. Switching from a local headless Chrome to a cloud grid is one flag, with no change to the test itself:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md \
  --provider lambdatest --agent --timeout 180 > checkout.ndjson
```

The same plain-English markdown runs unchanged, the same exit-code contract gates the deploy, and you can run the suite across real browsers on a hosted grid when local headless coverage is not enough. For most pipelines you will keep the bulk of smoke tests on the local provider for speed and only fan a couple of cross-browser-sensitive flows out to a grid.

## A practical rollout order

If you are adding a deploy gate to an existing pipeline, resist the urge to convert everything at once. Start with the single flow whose breakage would be most embarrassing in production — usually login or checkout — and write it as one `*_test.md`. Get it passing locally with `browserbash run` and `testmd run`, then add it as a `smoke` job between your staging and production deploys. Watch it for a week of real deploys to confirm it fails only when the product actually breaks. Then add the next flow.

This incremental path matters because a deploy gate has to earn trust before people will respect it. A suite that produces even occasional false failures gets overridden, and an overridden gate is decorative. A small suite of plain-English smoke tests that fails only when a user would also get stuck stays respected — and a respected gate is the only kind that actually keeps broken builds out of production. You can browse more setup walkthroughs on the [BrowserBash blog](https://browserbash.com/blog) and step-by-step guides in [the docs](https://browserbash.com/learn), and the CLI itself lives on [npm](https://www.npmjs.com/package/browserbash-cli).

## FAQ

### How fast are plain-English smoke tests in CI?

Each run is slower than a hand-tuned selector script, because an AI agent reasons about the page before acting. For a smoke suite that is usually an acceptable trade — you are running a handful of flows, not hundreds of regression cases, and the time saved on selector maintenance dwarfs the per-run cost. Keep your smoke suite small and breadth-focused, set a sane `--timeout`, and run flows in parallel jobs if total wall-clock time matters for your deploy cadence.

### Will the smoke gate produce flaky false failures?

Far fewer than selector-based gates, because the agent finds elements the way a human would, so markup and styling changes do not break tests. The main source of vagueness is vague instructions — "check it worked" gives the agent nothing concrete to verify. Write explicit assertions like "Verify the order confirmation number is visible," and reserve the `1` exit code for genuine product failures while letting `2` and `3` (environment errors and timeouts) absorb a single retry.

### Do I need an API key or paid service to run this in CI?

No. BrowserBash is free and open-source under Apache-2.0, and it is Ollama-first, so you can run smoke tests on a free local model or a free OpenRouter model without any paid key. Bringing an Anthropic key is optional. Cloud providers like LambdaTest and the upload dashboard are opt-in — by default nothing leaves your CI runner.

### How is this different from a regular regression suite?

A smoke suite answers "is this build sane enough to deploy?" with a few broad flows, while a regression suite checks depth and edge cases. They coexist well: gate deploys on a fast plain-English smoke suite and keep your existing framework for heavy regression. The smoke layer is where natural-language tests pay off most, because it lives in the critical deploy path and must fail only for real reasons.

## Get started

Wiring a trustworthy deploy gate takes one `npm install` and one markdown file. BrowserBash is free and open-source, runs on a local model with nothing leaving your machine, and turns your most critical user flow into a plain-English smoke test that gates production. Create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) and put your first smoke test in front of your next deploy.
