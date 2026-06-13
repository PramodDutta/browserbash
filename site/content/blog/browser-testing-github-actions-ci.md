---
title: Browser Testing in GitHub Actions With Exit Codes (No Parsing)
description: "Run browser testing in GitHub Actions with BrowserBash: --agent NDJSON, --headless, exit codes 0/1/2/3, encrypted secrets, and uploaded artifacts."
date: 2026-06-13
category: guide
---

Most teams that wire browser testing into GitHub Actions end up doing something fragile: they run a test command, capture its log, and then `grep` that log for a phrase like `0 failed` or `All checks passed` to decide whether the build should go red. It works until a dependency bumps its output format, the phrase stops matching, and a broken checkout flow sails through CI green for a week. This guide shows a sturdier recipe. You write your browser test as a plain-English objective, run it under [BrowserBash](https://www.npmjs.com/package/browserbash-cli) with `--agent` and `--headless`, and let the process exit code be the verdict. Codes `0`, `1`, `2`, and `3` map to passed, failed, error, and timeout — so the GitHub Actions step fails exactly when the test fails, and there is nothing to parse.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. Instead of writing selectors and page objects, you describe what you want verified; an AI agent drives a real Chrome/Chromium browser and returns a verdict plus structured results. That design is what makes it pleasant in CI: a browser run becomes a function call with a well-defined exit code and a machine-readable stream, not a wall of prose a YAML conditional has to interpret.

## Why exit codes beat log parsing in CI

GitHub Actions already has a contract baked into every step: if the command exits non-zero, the step fails and the job fails. Most test integrations fight this contract instead of using it. They force the command to exit `0` no matter what, then bolt on a separate "check results" step that re-derives pass or fail from text. Every layer you add between "the test failed" and "the build is red" is a place for the signal to get lost.

BrowserBash leans all the way into the native contract. Every `browserbash run` and every `browserbash testmd run` terminates with one of four exit codes:

| Exit code | Meaning | Typical CI response |
|---|---|---|
| `0` | passed | continue |
| `1` | failed — the objective or a verify step did not hold | fail the build, a human should look |
| `2` | error — infrastructure or agent problem | retry once, then fail |
| `3` | timeout — the run outlived its `--timeout` budget | retry once or raise the budget |

The granularity is the useful part. A `1` is a product signal: the page changed, a button vanished, a verification did not hold. Silently retrying a `1` until it passes is how teams train themselves to ignore red. A `2` or `3` is an environment signal — a flaky network, a grid hiccup, a run that ran out of time — and that is the kind of thing worth one automatic retry before you give up. Because the four codes are distinct, your pipeline can treat them differently without ever reading a single line of output.

## Prerequisites

You need three things, and only the first is non-negotiable:

1. **Node.js in the runner.** BrowserBash installs from npm with `npm install -g browserbash-cli`. GitHub's `ubuntu-latest` image already has Chromium dependencies available, and the default `local` provider drives a real Chrome/Chromium on the runner.
2. **An LLM the agent can call.** BrowserBash is Ollama-first (free, local, no API keys) and auto-detects Ollama, then Anthropic, then OpenRouter. On a hosted GitHub runner you will usually point at a hosted model: OpenRouter (which has free models such as `openai/gpt-oss-120b:free`) or Anthropic Claude with your own key. Whatever you choose goes in as an encrypted secret, never in the YAML.
3. **Optional: a cloud browser grid.** The default is the runner's own browser. If you want to test across real desktop and mobile browsers, one flag switches the run to LambdaTest, BrowserStack, or Browserbase — covered near the end.

A note on privacy that matters for CI: nothing leaves your machine unless you explicitly pass `--upload`. A normal CI run keeps every screenshot, video, and result on the runner. You opt in to the cloud dashboard per run, not by default.

## A minimal GitHub Actions workflow

Here is the smallest useful pipeline: on every push, install BrowserBash, run one smoke objective headless, and capture the NDJSON stream as an artifact even when the run fails.

```yaml
name: browser-smoke
on: [push]

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli

      - name: Run smoke test
        run: |
          browserbash run "Open https://staging.example.com, confirm the login form is visible, and store the page title as 'title'" \
            --agent --headless --timeout 120 > smoke.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}

      - name: Upload NDJSON
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-ndjson
          path: smoke.ndjson
```

There is no "parse results" step, and there is no `if: failure()` conditional deciding the verdict. The `Run smoke test` step fails precisely when the objective fails, because the exit code is the verdict. Two details are doing quiet work here.

First, the redirect. With `--agent`, NDJSON events go to **stdout** and all human-readable output goes to **stderr**. Redirecting stdout to `smoke.ndjson` keeps the artifact clean while the live Actions log still shows readable progress on stderr — you get both, with no interleaving.

Second, `if: always()` on the upload step. A failing run is exactly when you most want the artifact, so the upload must run regardless of the test step's outcome. Without `always()`, a red build would discard the very evidence you need to debug it.

### What `--agent` and `--headless` actually do

`--headless` runs Chrome/Chromium without a visible window, which is what you want on a runner that has no display. `--agent` is the more consequential flag: it switches the CLI into machine mode. Every line on stdout becomes a single JSON object with a stable schema. While the agent works, step events stream:

```json
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked ref:12"}
```

`status` is `running`, `passed`, or `failed`; `action` names what the agent did (`navigate`, `click`, `type_text`, `extract`, and friends). The final line is always a single `run_end` event:

```json
{"type":"run_end","status":"passed","summary":"Login form visible; stored title.","final_state":{"title":"Sign in - Example"},"duration_ms":48211,"steps_executed":9,"provider":"local"}
```

Because the terminal event is always the last line, `tail -1 smoke.ndjson | jq` pulls the verdict and any stored values without buffering or parsing the whole stream. The `final_state` object carries anything your objective phrased as `store ... as 'name'` — which is how you hand a value from a browser run to a later CI step without scraping logs.

## Handling secrets the right way

Two kinds of secrets show up in browser-testing pipelines, and they are handled in two different places.

**API keys for the LLM or grid** belong in GitHub's encrypted secrets and arrive as environment variables. In the workflow above, `OPENROUTER_API_KEY` is injected through the `env:` block from `secrets.OPENROUTER_API_KEY`. GitHub redacts registered secret values from the build log automatically, and BrowserBash never prints the key. If you use Anthropic Claude instead, the variable is `ANTHROPIC_API_KEY`; if you use a cloud grid, you also pass its credentials the same way (`LT_USERNAME` / `LT_ACCESS_KEY` for LambdaTest, for example).

**Application credentials** — the username and password the agent types into the page under test — are different. You do not want them inlined in the objective string, both because the objective is logged and because it reads badly. BrowserBash gives you `{{variables}}` for exactly this, and any variable marked `"secret": true` is masked as `*****` everywhere it could otherwise appear: the human log, the NDJSON, and the recordings. That masking matters in CI, where transcripts get archived verbatim.

```yaml
      - name: Authenticated check
        run: |
          browserbash run "Open {{base_url}}/login, log in as {{username}} with password {{password}}, then confirm the dashboard heading is visible and store the account id as 'account_id'" \
            --agent --headless --timeout 150 \
            --variables '{"base_url":"https://staging.example.com","username":"qa@example.com","password":{"value":"'"$APP_PASSWORD"'","secret":true}}' \
            > auth.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          APP_PASSWORD: ${{ secrets.APP_PASSWORD }}
```

The password rides in as the `APP_PASSWORD` secret, gets injected into the `--variables` JSON with `"secret": true`, and never appears in plaintext in the objective or the output. If you prefer to keep JSON out of your YAML entirely, BrowserBash also accepts `--variables-file <path>`, so you can write a variables file from a secret in an earlier step and point at it.

## Markdown tests: committable, reviewable browser tests

A single `browserbash run` is great for a smoke check, but real suites want something you can version, review in a pull request, and reuse. BrowserBash's answer is **markdown tests**: committable `*_test.md` files where each list item is a step. They read like a checklist a human could follow, which means a reviewer who has never seen the tool can still tell whether the test is correct.

```markdown
# Checkout smoke

- Open {{base_url}}
- Click "Add to cart" on the first product
- Go to the cart and click "Checkout"
- Confirm the order summary shows a total
- Store the order id as 'order_id'
```

Two features make these scale. `@import` lets you compose shared steps — a `login_test.md` you import at the top of every authenticated test, so the login sequence lives in one place. And `{{variables}}` work exactly as they do on the CLI, including secret masking. You run a markdown test the same way, and it writes a `Result.md` alongside the NDJSON:

```yaml
      - name: Run checkout suite
        run: |
          browserbash testmd run ./.browserbash/tests/checkout_test.md \
            --agent --headless --timeout 180 > checkout.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

`browserbash testmd run` carries the same exit-code contract as `browserbash run`, so everything you have read about `0/1/2/3` applies unchanged. The `Result.md` it writes is a human-friendly companion to the NDJSON — handy to upload as an artifact for reviewers who would rather read a report than pipe `jq`.

## Recording: screenshots, video, and traces for failed runs

When a browser test fails in CI, "it failed" is rarely enough — you want to see what the agent saw. The `--record` flag captures a screenshot **and** a session video (a stitched `.webm`, assembled with ffmpeg) on any engine. On the in-repo `builtin` engine it additionally captures a Playwright trace, which you can open later in the Playwright trace viewer for a step-by-step replay.

In CI you usually want to record only when something goes wrong, to keep artifacts small. Capture the exit code, and on a real failure, re-run with `--record` and upload the result:

```yaml
      - name: Run with replay on failure
        run: |
          set +e
          browserbash testmd run ./.browserbash/tests/checkout_test.md \
            --agent --headless --timeout 180 > checkout.ndjson
          code=$?
          if [ "$code" -eq 1 ]; then
            echo "Objective failed — re-running with recording for the artifact" >&2
            browserbash testmd run ./.browserbash/tests/checkout_test.md \
              --agent --headless --record --timeout 180 > checkout.replay.ndjson
          fi
          exit $code
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}

      - name: Upload recordings
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: checkout-artifacts
          path: |
            checkout.ndjson
            checkout.replay.ndjson
```

The `set +e` keeps the shell from aborting the moment the first run exits non-zero, so you can inspect `code`, optionally record, and then re-raise the original exit code with `exit $code`. The job's verdict is still driven by the first run; the recording is purely supplementary evidence.

## Distinguishing real failures from infrastructure flakes

This is where the four-way exit code earns its keep. A pattern that has held up well is: never auto-retry a `1`, always allow one retry on `2` or `3`. Encoding that policy is a few lines of shell, and it lives inside the run step so the step's final exit code is still the build verdict.

```bash
browserbash testmd run ./.browserbash/tests/smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
code=$?
if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
  echo "infra-flavored exit ($code) — retrying once" >&2
  browserbash testmd run ./.browserbash/tests/smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
  code=$?
fi
exit $code
```

A `1` falls straight through to `exit $code` with no retry, so a genuine product regression turns the build red immediately and stays red. A `2` (credentials wrong, grid unreachable, agent error) or a `3` (the run blew its time budget) gets one more attempt before the build is allowed to fail. The reason this matters is cultural as much as technical: pipelines that retry real failures until they pass quietly teach the team that red builds are noise, and then nobody trusts CI.

If you want an early-warning channel before a flake ever turns a build red, watch `duration_ms` and `steps_executed` from the `run_end` line across runs. A test whose verdict is still `passed` but whose `steps_executed` has crept well above the number of steps you actually wrote is a sign the agent is working harder than it should to reach the same answer — often the signature of a slow third-party widget or an intermittently sluggish page. The verdict is binary, but the timing is a gradient you can trend.

## Running across real browsers with one flag

The default `local` provider tests the runner's own Chrome/Chromium, which is the right default for fast feedback. When you need coverage across real desktop and mobile browsers, the provider is a single flag — the objective and the exit-code contract do not change at all:

```yaml
      - name: Cross-browser smoke on LambdaTest
        run: |
          browserbash run "Open https://staging.example.com and confirm the pricing page loads with at least three plan cards" \
            --provider lambdatest --headless --agent --timeout 180 > lt.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          LT_USERNAME: ${{ secrets.LT_USERNAME }}
          LT_ACCESS_KEY: ${{ secrets.LT_ACCESS_KEY }}
```

When a cloud provider runs the browser, the `run_end` event also includes a `test_url` that deep-links to the session recording in that grid's own dashboard — so a failed cross-browser run gives you a clickable replay without any extra wiring. Besides `lambdatest`, BrowserBash supports `browserstack` and `browserbase`, plus `cdp` to attach to any DevTools endpoint — useful when you want the agent to drive a browser another tool already launched, such as one started by Playwright MCP or a Docker grid.

## A matrix that parallelizes a whole suite

GitHub's matrix strategy and BrowserBash's per-file verdict compose neatly. Give each markdown test its own matrix entry, and each one becomes an independent job with its own exit code and its own artifact:

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        test: [login, checkout, search]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli
      - name: Run ${{ matrix.test }}
        run: |
          browserbash testmd run ./.browserbash/tests/${{ matrix.test }}_test.md \
            --agent --headless --timeout 180 > ${{ matrix.test }}.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ${{ matrix.test }}-ndjson
          path: ${{ matrix.test }}.ndjson
```

`fail-fast: false` lets every test report its own result instead of cancelling siblings the moment one goes red — usually what you want for a test suite, so a single failing flow does not hide the status of the others. Each entry keeps its own verdict, its own `Result.md`, and its own NDJSON artifact, and the job summary in the Actions UI tells you exactly which flows passed at a glance.

## Optional: push runs to a dashboard

Everything above keeps results on the runner. If you would like run history across machines, per-run replays, and a shareable page for a failing build, BrowserBash has a dashboard — and it is opt-in. Create a free account, connect once, and add `--upload` to the runs you want pushed:

```yaml
      - name: Connect and upload
        run: |
          browserbash connect --key "$BB_KEY"
          browserbash testmd run ./.browserbash/tests/checkout_test.md \
            --agent --headless --record --upload --timeout 180 > checkout.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          BB_KEY: ${{ secrets.BB_KEY }}
```

Pairing `--record` with `--upload` sends the verdict and the recording for that run to the cloud dashboard, where you get run history and a per-run replay. Without `--upload`, nothing is sent anywhere — the flag is your explicit consent, per run. There is also a free, fully private **local** dashboard if you would rather keep everything on your own infrastructure: run `browserbash dashboard` to serve it locally with no account at all. Cloud runs on the free tier are kept for 15 days; the local dashboard keeps whatever is in your on-disk run store.

## Putting it together

The recipe is small once the contract clicks into place. Install `browserbash-cli` in the runner, write your check as a plain-English objective or a committable `*_test.md` file, run it with `--agent --headless`, and let the exit code be the verdict — `0` passed, `1` failed, `2` error, `3` timeout. Inject LLM and grid keys as encrypted GitHub secrets and application credentials as masked `{{variables}}`. Upload the NDJSON (and, on failures, a `--record` replay) as artifacts with `if: always()`. Retry only the infrastructure-flavored exits. Nothing in that pipeline parses prose to decide pass or fail, which means nothing in it silently breaks the day an output format changes.

If you want to go deeper on the agent NDJSON schema, the markdown test format, and provider setup, the [BrowserBash learn pages](https://browserbash.com/learn) walk through each piece, and there are more CI and automation write-ups on the [BrowserBash blog](https://browserbash.com/blog).

## FAQ

### How do GitHub Actions know my browser test failed without a parsing step?

The process exit code is the verdict. `browserbash run` and `browserbash testmd run` exit `0` on pass, `1` on failure, `2` on an infrastructure or agent error, and `3` on timeout. GitHub Actions already fails any step whose command exits non-zero, so the run step fails exactly when the test fails — there is no separate "check results" step and nothing to grep.

### Where do I put passwords so they do not leak into the build log?

Application credentials go in BrowserBash `{{variables}}` marked `"secret": true`, which masks them as `*****` in the human log, the NDJSON, and any recordings. API keys for the LLM or a cloud grid go in GitHub's encrypted secrets and arrive as environment variables, which GitHub also redacts from logs automatically. Never inline either kind directly in the objective string.

### Should I retry a failed browser test in CI?

It depends on the exit code, which is why BrowserBash distinguishes four of them. A `1` is a real product or assertion failure — investigate it, do not auto-retry, or you will train the team to ignore red. A `2` (infrastructure or agent error) or `3` (timeout) is reasonable to retry once before failing, since those usually reflect a flaky environment rather than a broken app.

### Do I need an API key to run BrowserBash in GitHub Actions?

Not necessarily. BrowserBash is Ollama-first and can run against a free local model with no API keys, and it also supports OpenRouter's free models such as `openai/gpt-oss-120b:free`. On hosted GitHub runners you will typically point at a hosted model and pass that provider's key as an encrypted secret; the default `local` browser provider needs no extra account because it drives the runner's own Chrome/Chromium.

---

Ready to wire up your pipeline? Create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) and try it on a real workflow today. BrowserBash is free and open source — install it with `npm install -g browserbash-cli` and let exit codes, not log parsing, decide whether your build goes green.
