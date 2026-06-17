---
title: Run AI Browser Tests in GitLab CI: A Complete Tutorial
description: "A complete tutorial for ai browser testing gitlab ci with BrowserBash: --agent NDJSON, exit codes 0/1/2/3, masked CI secrets, and artifacts."
date: 2026-03-10
category: ci
---

If you want reliable ai browser testing in GitLab CI, the hard part is rarely writing the test. It is making the pipeline trust the result. Traditional end-to-end tooling prints a wall of human-readable logs, and your CI job has to scrape that text to decide pass or fail. That breaks the moment a tool changes its output format. BrowserBash takes a different route: in agent mode it emits one JSON event per line and sets a Unix exit code that GitLab reads directly. No grep, no fragile regex, no log scraping. This tutorial walks the whole thing end to end, from a clean `.gitlab-ci.yml` to masked secrets and downloadable artifacts.

By the end you will have a working pipeline that installs the CLI, runs a plain-English browser objective against a real Chromium instance, fails the job automatically when the verdict is wrong, and keeps your credentials out of the logs. We will also be honest about where this approach has rough edges, because a tutorial that only sells you the happy path is not worth your time.

## Why ai browser testing in GitLab CI is different

Most browser test failures in CI are not real bugs. They are selector drift, a renamed CSS class, an A/B test that moved a button, or a timing race that only shows up on a slow runner. The cost of that is brutal: engineers stop trusting red builds and start clicking "retry" on reflex. Once a pipeline cries wolf often enough, it stops protecting anything.

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy that drives a real Chrome or Chromium browser using natural language. You write an objective like "log in, add the blue running shoes to the cart, check out, and confirm the order succeeded," and an AI agent figures out the steps as it goes. There are no selectors to maintain and no page objects to refactor. When marketing renames a button from "Buy now" to "Purchase," a selector-based test breaks; an intent-based objective usually does not, because "complete the purchase" still describes the goal.

That matters for ai browser testing in GitLab CI specifically because GitLab runners are ephemeral. Every pipeline spins up a fresh container, runs your job, and tears it down. There is no human watching. The pipeline needs a clean, machine-readable signal it can act on without a person interpreting a screenshot. That is exactly what agent mode provides.

### The log-scraping problem, concretely

Picture the old way. Your test framework prints something like `✓ 14 passed, 1 failed` and your CI script runs `grep -q "0 failed"` to decide the build. Then a minor version bump changes the summary line to `Tests: 1 failed | 14 passed` and every green build silently turns into a false pass, because your grep no longer matches and your script defaults to success. Nobody notices until production breaks. The fix is to stop parsing prose entirely and let the process exit code be the contract.

## How BrowserBash agent mode talks to CI

When you add the `--agent` flag, BrowserBash switches into a mode designed for machine callers. Two things change.

First, stdout becomes NDJSON: newline-delimited JSON, one event object per line. You get a structured stream of what the agent did, step by step, instead of free-form prose. Each line is independently parseable, so a tool like `jq` can read events as they arrive without waiting for the run to finish.

Second, and more important for GitLab, the process exit code becomes the verdict. The codes are fixed and small:

| Exit code | Meaning | Typical GitLab outcome |
|-----------|---------|------------------------|
| `0` | Passed — the objective was met | Job succeeds (green) |
| `1` | Failed — the objective was not met | Job fails (red) |
| `2` | Error — something broke (bad config, network, crash) | Job fails (red) |
| `3` | Timeout — the run exceeded its time budget | Job fails (red), investigate flake or slow app |

GitLab CI already treats any non-zero exit from a job's script as a failure. So you do not write any decision logic at all. You run `browserbash run "..." --agent`, and if the objective fails, the process exits `1`, and the GitLab job goes red on its own. This is the core idea behind clean [exit-code verdicts without log parsing](https://browserbash.com/learn): the operating system contract does the work your brittle grep used to do.

Splitting `1`, `2`, and `3` apart is genuinely useful in practice. A `1` means the application is wrong and a human should look at the app. A `2` usually means your pipeline is wrong — a missing browser, a bad URL, an unreachable model endpoint. A `3` means the run is taking too long, which often signals an environment problem or a flaky step rather than a product defect. You can branch on these codes in your job script to route alerts differently, which we will do later.

## Prerequisites for the pipeline

You need three things before writing the YAML.

A GitLab project with CI/CD enabled and a runner available. GitLab.com shared runners work fine; so does a self-hosted runner, which you may actually prefer here for reasons we will get to.

A target application URL the runner can reach. If you are testing a staging environment behind a VPN or IP allowlist, a self-hosted runner inside that network is the simplest path.

A decision about which model drives the agent. BrowserBash is Ollama-first: by default it looks for a local Ollama install and uses free local models, so nothing leaves your machine and there is no API key. In CI, you have two practical choices. You can run Ollama inside the pipeline (heavier image, zero per-run model cost, full privacy) or point the agent at a hosted model with an API key (lighter image, simpler setup). The CLI auto-resolves in this order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. OpenRouter even exposes genuinely free hosted models such as `openai/gpt-oss-120b:free`, which is a reasonable starting point for CI if you do not want to ship Ollama in your image.

One honest caveat worth stating up front. Very small local models, roughly 8B parameters and under, tend to get flaky on long multi-step objectives. They lose the plot halfway through a checkout flow. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, for any flow with more than a few steps. If your CI runner cannot host a 70B model and you do not want a hosted key, keep your CI objectives short and focused rather than fighting an underpowered model on a ten-step journey.

## Writing your first .gitlab-ci.yml

Here is a minimal pipeline that installs BrowserBash and runs a single browser objective in agent mode. We use a hosted model via OpenRouter to keep the image light.

```bash
# .gitlab-ci.yml
stages:
  - test

ai-browser-test:
  stage: test
  image: mcr.microsoft.com/playwright:v1.50.0-noble   # ships Chromium + deps
  variables:
    OPENROUTER_API_KEY: $OPENROUTER_API_KEY            # masked CI variable
  script:
    - npm install -g browserbash-cli
    - >
      browserbash run
      "Open https://shop.example.com, log in as a guest, add the first
       product to the cart, complete checkout, and verify the page shows
       'Thank you for your order!'"
      --agent
      --headless
      --provider local
    - echo "Objective passed — exit code $?"
  artifacts:
    when: always
    paths:
      - run.ndjson
    expire_in: 1 week
```

A few things to notice. The `image` is a Playwright base image because it already bundles Chromium and the system libraries a real browser needs, which saves you a long `apt-get` block. The `--headless` flag is mandatory on a CI runner with no display. The `--provider local` flag means the browser runs inside the job container itself, which is the default; we will look at remote providers shortly. And `artifacts: when: always` keeps the NDJSON around even on failure, which is precisely when you want to read it.

The job has no `if` statement deciding pass or fail. It does not need one. If the objective fails, `browserbash` exits `1`, GitLab sees a non-zero exit, and the job goes red. That is the whole point.

### Capturing the NDJSON stream as an artifact

The snippet above references `run.ndjson` but never writes it. Redirect stdout so the structured stream lands in a file you can attach as an artifact and inspect later from the GitLab UI.

```bash
script:
  - npm install -g browserbash-cli
  - |
    browserbash run "Log in and confirm the dashboard loads" \
      --agent --headless --provider local | tee run.ndjson
  - |
    # tee preserves the exit code of the FIRST command in older shells poorly,
    # so guard it explicitly:
    test "${PIPESTATUS[0]}" -eq 0
```

The `tee` trick lets you both stream events live to the job log and save them to a file. The `PIPESTATUS` guard matters: in a pipeline, `$?` reflects the last command (`tee`), which almost always succeeds, masking a real failure from `browserbash`. Checking `PIPESTATUS[0]` re-asserts the agent's real exit code so the job still fails correctly. If you find this fiddly, the simpler alternative is to skip the pipe and write directly: `browserbash run "..." --agent --headless > run.ndjson` and let the natural exit code stand.

## Masking secrets so credentials never hit the log

Real browser tests log in. That means handling passwords, and a CI log is the worst place for a plaintext credential. BrowserBash and GitLab give you two complementary layers here.

GitLab's side: define your credentials as CI/CD variables under **Settings → CI/CD → Variables** and tick **Masked**. GitLab then replaces the value with `[MASKED]` anywhere it would otherwise appear in the job log. Mark them **Protected** too if they should only be exposed on protected branches and tags. This is your first line of defense and you should always use it.

BrowserBash's side: it has its own masking through committable Markdown tests. You can write a `*_test.md` file where each list item is a step and values come from `{{variables}}`. When a variable is marked secret, BrowserBash replaces it with `*****` in every log line it emits, including the NDJSON stream and the human-readable `Result.md` it writes after each run. So even if your model provider echoes the value back, or a step description would have printed it, the secret stays redacted in the artifact.

Here is a Markdown test that uses a masked secret, committed alongside your code as `login_test.md`:

```bash
# login_test.md
# Objective: verify a registered user can sign in

- Go to {{base_url}}/login
- Type {{email}} into the email field
- Type {{password}} into the password field   # password is a secret
- Click the "Sign in" button
- Confirm the page shows "Welcome back"
```

Run it in the pipeline with variables wired from your masked GitLab CI variables:

```bash
script:
  - npm install -g browserbash-cli
  - >
    browserbash testmd run ./login_test.md
    --agent --headless
    --var base_url="$BASE_URL"
    --var email="$TEST_EMAIL"
    --secret password="$TEST_PASSWORD"
```

The `--secret` flag tells BrowserBash to treat `password` as sensitive and mask it as `*****` everywhere. Combined with GitLab's `[MASKED]` replacement, you get defense in depth: GitLab scrubs the raw value from its log capture, and BrowserBash never writes it in the first place. Commit the `login_test.md` file to your repo so the test is reviewable in merge requests like any other code. The `@import` directive lets you compose shared setup steps across multiple test files, which keeps a growing suite from repeating itself.

## Routing failures by exit code

Because the four exit codes mean different things, you can give your team a better signal than "the build is red." Capture the exit code and branch on it.

```bash
ai-browser-test:
  stage: test
  image: mcr.microsoft.com/playwright:v1.50.0-noble
  script:
    - npm install -g browserbash-cli
    - |
      set +e
      browserbash run "Complete a checkout and verify the order confirmation" \
        --agent --headless --provider local | tee run.ndjson
      CODE=${PIPESTATUS[0]}
      set -e
      case "$CODE" in
        0) echo "PASS: objective met" ;;
        1) echo "FAIL: app behavior is wrong — assign to product team"; exit 1 ;;
        2) echo "ERROR: pipeline/config problem — check runner & model"; exit 1 ;;
        3) echo "TIMEOUT: run too slow — likely flake or slow env"; exit 1 ;;
      esac
  artifacts:
    when: always
    paths: [run.ndjson]
```

This pattern is what makes ai browser testing in GitLab CI genuinely actionable. A `1` is a product bug and should page the team that owns the feature. A `2` is almost always an infrastructure issue — wrong URL, missing browser, unreachable model endpoint — and should page whoever owns the pipeline. A `3` is a timeout, and repeated timeouts on the same objective are your early warning of a slow page or a flaky integration. You can wire each branch to a different notification, a different GitLab label, or a different on-call rotation, all from one small `case` statement.

## Where the browser actually runs: providers

By default, `--provider local` runs Chromium inside the GitLab job container. That is the simplest setup and keeps everything self-contained. But you have options, switched with a single `--provider` flag, and they matter for different situations.

| Provider | Where the browser runs | Good fit for GitLab CI when |
|----------|------------------------|------------------------------|
| `local` | Inside the job container (default) | You want zero external deps and a self-contained job |
| `cdp` | Any DevTools endpoint you point at | You already run a browser grid or a remote Chrome |
| `browserbase` | Browserbase cloud | You want managed cloud browsers, no runner browser deps |
| `lambdatest` | LambdaTest cloud grid | You need cross-browser coverage on a managed grid |
| `browserstack` | BrowserStack cloud grid | Your org already standardizes on BrowserStack |

For a cloud grid, the command stays almost identical:

```bash
browserbash run "Log in and verify the dashboard renders" \
  --agent --headless --provider lambdatest
```

The trade-off is straightforward. `local` keeps your data and traffic inside your own runner, which is the privacy-friendly default and costs nothing beyond the runner itself. A cloud provider offloads the browser, frees your runner from shipping browser dependencies, and can give you real cross-browser coverage, but it adds an external dependency and a vendor account. For most teams starting out, `local` on a Playwright base image is the right first move; reach for a grid when you specifically need parallel browsers or device matrices you cannot host yourself. The [providers documentation](https://browserbash.com/features) covers the credential wiring for each.

## Recording and debugging failed runs

When a run fails in CI, you want evidence, not a guessing game. Add `--record` and BrowserBash captures a screenshot and a full `.webm` session video using ffmpeg on any engine. On the builtin engine it additionally captures a Playwright trace you can open in the trace viewer locally.

```bash
script:
  - npm install -g browserbash-cli
  - apt-get update && apt-get install -y ffmpeg   # if not in the base image
  - >
    browserbash run "Add an item to the cart and verify the subtotal updates"
    --agent --headless --record --provider local
  artifacts:
    when: on_failure
    paths:
      - "*.webm"
      - "*.png"
      - run.ndjson
    expire_in: 1 week
```

Setting `when: on_failure` means you only pay the artifact storage cost when something actually breaks, and the video plus screenshot are sitting right there in the GitLab job's artifacts panel when you go to investigate. For a checkout flow that failed at step seven, watching the 20-second clip is far faster than reconstructing the run from log lines.

BrowserBash also writes a human-readable `Result.md` after each run, summarizing what happened in plain English. That file is a good artifact to attach for non-engineers reviewing a merge request, since it reads like a test report rather than a JSON dump. If you want richer history, run history and per-run replay are available in the optional free cloud dashboard via `browserbash connect` and the `--upload` flag, which is strictly opt-in. There is also a fully local dashboard you can run with `browserbash dashboard` if you would rather keep everything on your own infrastructure. Uploaded runs on the free tier are kept for 15 days, which is plenty for triaging a flaky pipeline. You can read more about the workflow on the [BrowserBash blog](https://browserbash.com/blog).

### Choosing an engine

BrowserBash ships two engines. The default is `stagehand` (MIT-licensed, built by Browserbase), which is a solid general choice. The `builtin` engine is an in-repo Anthropic tool-use loop and is the one that also produces a Playwright trace under `--record`. If trace-viewer debugging is important to your CI workflow, prefer `builtin` for those jobs. Otherwise the default is fine and you do not need to think about it.

## A realistic pipeline: smoke test on every merge request

Putting it together, here is a pipeline that runs a fast smoke test on every merge request and a deeper checkout test on the default branch. It uses a hosted model, masks the password, records on failure, and routes exit codes.

```bash
stages: [smoke, e2e]

.browser-base:
  image: mcr.microsoft.com/playwright:v1.50.0-noble
  before_script:
    - npm install -g browserbash-cli
  variables:
    OPENROUTER_API_KEY: $OPENROUTER_API_KEY

smoke:
  extends: .browser-base
  stage: smoke
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - >
      browserbash run "Open $BASE_URL and confirm the home page loads and the
      main navigation is visible" --agent --headless --provider local

checkout-e2e:
  extends: .browser-base
  stage: e2e
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - >
      browserbash testmd run ./checkout_test.md --agent --headless --record
      --var base_url="$BASE_URL" --secret password="$TEST_PASSWORD"
  artifacts:
    when: on_failure
    paths: ["*.webm", "Result.md"]
```

The `smoke` job is short on purpose. A one-or-two-step objective is exactly where smaller models stay reliable, so it is cheap and fast and runs on every merge request. The `checkout-e2e` job is the longer flow, gated to the default branch where you can afford a few more seconds and a capable model. This split respects the model caveat from earlier: keep long, multi-step journeys on your more capable model, and let short objectives run anywhere.

## When this approach fits, and when it does not

Intent-based ai browser testing in GitLab CI is a strong fit when your UI changes often, when you are tired of maintaining selectors, and when you want CI verdicts that survive a CSS refactor. It shines on user-journey tests — login, search, cart, checkout — where the goal is stable even as the markup churns. The exit-code contract makes it almost trivially easy to wire into a pipeline, and the masking story is solid enough for real credentials.

It is a weaker fit in a few honest cases. If you need pixel-exact visual diffing or assertions on exact DOM attributes, a deterministic selector-based framework is more precise and that is the better tool for that job. If your CI runner cannot host a mid-size model and you refuse any hosted key, long objectives will be flaky and you should keep tests short or reconsider. And if your test must assert on something an AI cannot reliably perceive — a specific computed style value, a precise animation timing — agentic testing is the wrong layer. Use it for behavior and journeys; keep unit and component tests where they already live. Browse the [feature overview](https://browserbash.com/features) to see what is in scope before you commit a suite to it.

The pragmatic answer for most teams is both. Keep your fast deterministic unit and integration tests as they are, and add a thin layer of intent-based browser objectives for the critical user journeys that selectors keep breaking on. That layer is what BrowserBash is built for, and GitLab's exit-code handling makes it cheap to adopt.

## FAQ

### How do I make a GitLab CI job fail when a browser test fails?

Run BrowserBash in agent mode with the `--agent` flag. It sets a Unix exit code as the verdict — `0` for pass, `1` for fail, `2` for error, `3` for timeout. GitLab treats any non-zero exit from a job script as a failure, so the job goes red automatically with no log parsing or extra logic on your part.

### Do I need an API key to run BrowserBash in GitLab CI?

No. BrowserBash is Ollama-first and defaults to free local models, so you can run it with zero API keys if you ship a model in your CI image. If you prefer a lighter image, it auto-resolves to `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`, and OpenRouter offers genuinely free hosted models you can use instead. The choice is yours and a $0 model bill is achievable on local models.

### How do I keep passwords out of the CI logs?

Use two layers. Mark your credentials as Masked CI/CD variables in GitLab so the platform replaces them with `[MASKED]` in job logs. Then use BrowserBash's secret-marked `{{variables}}` or the `--secret` flag, which redacts the value as `*****` in every log line, the NDJSON stream, and the generated Result.md. Together they keep plaintext credentials out of every output.

### Can BrowserBash run cross-browser tests on a cloud grid from GitLab?

Yes. Switch where the browser runs with a single `--provider` flag. Besides the default local Chromium, you can target a CDP endpoint, Browserbase, LambdaTest, or BrowserStack. This is useful when you want managed cloud browsers, parallel runs, or cross-browser coverage without installing browser dependencies on your GitLab runner.

Ready to wire up your own pipeline? Install the CLI with `npm install -g browserbash-cli`, drop one of the `.gitlab-ci.yml` snippets above into your repo, and watch the exit code do the work no grep ever did reliably. An account is optional — everything in this tutorial runs without one — but if you want run history, video replay, and a hosted dashboard, you can [sign up for free](https://browserbash.com/sign-up) whenever it helps.
