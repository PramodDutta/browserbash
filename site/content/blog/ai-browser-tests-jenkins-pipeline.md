---
title: AI Browser Testing in a Jenkins Pipeline: 2026 Setup Guide
description: "Wire ai browser tests into a Jenkins pipeline: a declarative Jenkinsfile, .webm video artifacts with --record, and builds gated on exit codes."
date: 2026-03-13
category: ci
---

If you run a Jenkins controller and you want ai browser tests in your Jenkins pipeline, the wiring is simpler than most teams expect. You write a plain-English objective, an AI agent drives a real Chrome browser through it, and the process exit code tells Jenkins pass or fail. No selectors to maintain, no page objects to refactor, no log scraping to decide the build verdict. This guide walks through a working declarative `Jenkinsfile` end to end: installing the CLI on an agent, running the test inside a stage, capturing a `.webm` session video as a build artifact, and gating the build on exit codes instead of brittle text assertions.

I'll use BrowserBash as the runner because it was built for exactly this shape of automation — it emits machine-readable NDJSON, returns disciplined exit codes, and records video on any engine. But the structural ideas here (stages, artifacts, exit-code gating) transfer to whatever AI browser testing tool you land on. Where Jenkins itself behaves in a version-specific way, I'll say so rather than pretend every controller is identical.

## Why AI browser tests fit Jenkins so well

Jenkins has always been a process runner. A stage executes a shell step, the shell step returns an exit status, and Jenkins decides what to do next based on that status. That model is a near-perfect fit for AI browser tests, because the hard part of traditional UI automation — translating a fragile DOM into stable assertions — moves out of your pipeline and into the agent.

Here is the contrast. A classic Selenium or Playwright suite ships hundreds of locators that break when a designer renames a CSS class or a framework upgrade reshuffles the DOM. Your Jenkins job goes red, but the product is fine. That's a false failure, and false failures are how teams learn to ignore red builds. An AI agent works from intent instead: "log in, add a laptop to the cart, check out, and confirm the order succeeded." When the button text shifts from "Buy now" to "Purchase," a human tester wouldn't even blink, and neither does the agent. The objective still holds.

That resilience is worth the most precisely where Jenkins jobs hurt the most: nightly end-to-end runs and pre-merge smoke checks that flake on selector drift. When you wire ai browser tests into a Jenkins pipeline, you're trading a maintenance tax (locators) for a small probabilistic tax (the agent occasionally misreads a screen). Whether that trade pays off depends on your model choice, which I'll come back to honestly.

### What BrowserBash brings to the table

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, give the `browserbash` command an objective in English, and an AI agent drives a real Chrome or Chromium browser step by step, then returns a verdict plus structured results. There are no accounts required to run it and no selectors to write.

The features that matter for Jenkins specifically are three: an `--agent` mode that emits NDJSON (one JSON event per line) instead of prose, four well-defined exit codes, and `--record` for capturing a screenshot and a full `.webm` session video on any engine. Those three combine into a CI story where Jenkins never has to read English to decide anything.

## The model decision before you touch the Jenkinsfile

Before any pipeline code, decide where the AI inference runs, because it changes your agent's networking, your cost, and your reliability.

BrowserBash is Ollama-first. By default it looks for a local Ollama instance and uses free local models, so no API keys are needed and nothing leaves the machine. If you have a beefy Jenkins agent (or a dedicated test node with a GPU), you can run the whole pipeline at a guaranteed $0 model bill. The CLI auto-resolves in order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. It also supports OpenRouter — including genuinely free hosted models such as `openai/gpt-oss-120b:free` — and Anthropic Claude if you bring your own key.

Here's the honest caveat, and it matters more in CI than in a local demo. Very small local models (roughly 8B parameters and under) can be flaky on long, multi-step objectives. A six-step checkout flow is exactly the kind of task where a tiny model loses the plot halfway through. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If your Jenkins agents are modest VMs without GPUs, point the CLI at a hosted model via `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` and keep the local default for engineers' laptops. Don't run a nightly suite of twelve complex journeys against an 8B model and then be surprised by intermittent reds — that's a model problem, not a pipeline problem.

| Setup | Where inference runs | Cost | Best for |
|---|---|---|---|
| Local Ollama, mid-size model | On the Jenkins agent | $0 | GPU-equipped nodes, privacy-sensitive shops |
| OpenRouter free model | Hosted | $0 (rate-limited) | Modest VMs, occasional runs |
| Anthropic Claude (own key) | Hosted | Per-token | Hard multi-step flows, highest reliability |

Store any API key as a Jenkins credential (Secret text) and inject it with the `withCredentials` block, never as a plaintext environment variable in the `Jenkinsfile`. I'll show that below.

## Installing the CLI on a Jenkins agent

Two realistic paths exist, depending on how your controller is set up.

If your agents are long-lived VMs with Node.js already on them, a one-time global install is simplest. SSH onto the agent (or bake it into your agent provisioning script) and run `npm install -g browserbash-cli`. Because BrowserBash drives a real browser, the agent also needs Chrome or Chromium available, plus `ffmpeg` on the PATH if you want `.webm` video recording — `ffmpeg` is what turns the session into a video file.

If your agents are ephemeral Docker containers (the more common pattern in 2026), install inside the pipeline or, better, bake a custom agent image with Node, Chromium, and ffmpeg preinstalled so every build starts warm. Installing `browserbash-cli` from npm on every single run works but adds dead time to each build. A purpose-built image is the move once you're past the prototype stage.

A quick sanity check belongs in its own early stage so a missing dependency fails fast and loud rather than halfway through a test:

```bash
node --version
browserbash --version   # expect 1.3.1 or newer
ffmpeg -version | head -1   # only needed if you use --record
```

If any of those three commands errors, the stage fails immediately and you know the agent is misconfigured before a single browser launches. That's much kinder than a cryptic failure three stages deep.

## A complete declarative Jenkinsfile

Here is a full declarative pipeline that installs the CLI (idempotently), runs an AI browser test inside a dedicated stage, records video, and archives the artifacts. Read it once, then I'll unpack the load-bearing parts.

```bash
pipeline {
  agent any

  environment {
    BB_TIMEOUT = '240'
  }

  stages {
    stage('Setup') {
      steps {
        sh 'npm install -g browserbash-cli'
        sh 'browserbash --version'
      }
    }

    stage('AI Browser Test') {
      steps {
        withCredentials([string(credentialsId: 'openrouter-key', variable: 'OPENROUTER_API_KEY')]) {
          sh '''
            browserbash run "log in to the demo store, add a laptop to the cart, \
              complete checkout, and verify the page shows 'Thank you for your order!'" \
              --agent --headless --record --timeout ${BB_TIMEOUT} > run.ndjson
          '''
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: '**/*.webm, **/*.png, run.ndjson', allowEmptyArchive: true
    }
  }
}
```

Walk through what each piece does. The `Setup` stage installs the CLI and prints its version, doubling as the fast-fail dependency check. The `AI Browser Test` stage is where the real work happens: `withCredentials` pulls your OpenRouter key from Jenkins' credential store and exposes it only inside that block, so the secret never lands in the build log or the environment of unrelated stages.

The `browserbash run` command carries the whole test. The objective is plain English. `--agent` switches output to NDJSON so nothing prose-y leaks into stdout. `--headless` is mandatory on a CI agent with no display. `--record` captures a screenshot and the `.webm` video. `--timeout` caps the run so a hung agent can't pin your executor forever. The `> run.ndjson` redirect keeps the structured event stream as a file for later inspection.

Finally, the `post { always { ... } }` block archives the video, the screenshot, and the NDJSON log regardless of whether the stage passed or failed — which is exactly when you want the video most. We'll dig into artifacts and exit codes next, because those two ideas are the heart of doing this well.

## Gating the build on exit codes, not assertions

This is the single most important habit when you put ai browser tests in a Jenkins pipeline: let the exit code be the verdict. Do not grep the output for a success string.

Every `browserbash run` and `browserbash testmd run` exits with one of four codes:

| Exit code | Meaning |
|---|---|
| `0` | passed |
| `1` | failed — the objective or a verify step didn't hold |
| `2` | error — infrastructure or agent problem |
| `3` | timeout |

Jenkins' `sh` step already understands this contract. By default, a non-zero exit status from a `sh` step fails the stage. So in the simple `Jenkinsfile` above, exit code 1, 2, or 3 all turn the build red automatically — no conditional logic, no parsing, nothing to keep in sync with a log format. That's the whole appeal.

The granularity exists so you can treat the codes differently when you want to. Exit code `1` is a product signal: the checkout actually didn't reach "Thank you for your order!", and a human should look. Silently auto-retrying a `1` teaches your team that red doesn't mean anything. Codes `2` and `3` are environment signals — a grid hiccup, a dead staging endpoint, a run that outran its timeout — and those are reasonable to retry once before failing. Here's a stage that encodes exactly that policy:

```bash
stage('AI Browser Test') {
  steps {
    script {
      def code = sh(returnStatus: true, script: '''
        browserbash run "log in and verify the dashboard loads" \
          --agent --headless --record --timeout 180 > run.ndjson
      ''')
      if (code == 0) {
        echo 'Test passed.'
      } else if (code == 1) {
        error 'Product failure: objective did not hold. See run.ndjson and the .webm video.'
      } else {
        echo "Environment issue (exit ${code}); retrying once."
        def retry = sh(returnStatus: true, script: '''
          browserbash run "log in and verify the dashboard loads" \
            --agent --headless --record --timeout 180 > run-retry.ndjson
        ''')
        if (retry != 0) { error "Still failing after retry (exit ${retry})." }
      }
    }
  }
}
```

`returnStatus: true` tells the `sh` step to hand you the integer code instead of throwing, so you can branch on it. The `error` step fails the build with a message you'll actually read in the Jenkins UI. The key discipline: a `1` never auto-retries, because masking a genuine product break behind a retry is how broken checkout flows ship green for a week.

Compare that to the old way. A pipeline that decided pass/fail by grepping stdout for `"0 failures"` quietly fell through to green the day a tooling upgrade changed the log format — the regex stopped matching, the conditional defaulted to success, and a real bug shipped. Prose was never an interface. The exit code is. If you want the deeper rationale, the BrowserBash team wrote it up in their [learn resources](https://browserbash.com/learn), and the broader [BrowserBash blog](https://browserbash.com/blog) has more CI-shaped walkthroughs.

## Capturing .webm video and other artifacts

A failed AI browser test raises an obvious question: what did the agent actually see? The `.webm` video answers it directly. When you pass `--record`, BrowserBash captures a screenshot and a full session video (rendered with ffmpeg) on whichever engine you're using. On the default `stagehand` engine that's the screenshot plus video; on the `builtin` engine you additionally get a Playwright trace you can open in the trace viewer for step-by-step inspection.

In Jenkins, capturing these means two things: making sure the files land somewhere predictable, and archiving them in a `post` block so they survive the build. The `archiveArtifacts` step in the full `Jenkinsfile` above does the second part:

```bash
post {
  always {
    archiveArtifacts artifacts: '**/*.webm, **/*.png, run.ndjson', allowEmptyArchive: true
  }
}
```

`always` runs whether the stage passed or failed, which is the point — a passing build's video is mildly interesting, but a failing build's video is the first thing you'll watch. `allowEmptyArchive: true` keeps Jenkins from erroring if a particular run produced no video (say, the agent crashed before recording started). After the build, the `.webm` shows up under the run's artifacts in the Jenkins UI, downloadable with one click.

### Why video beats a stack trace for AI tests

With a classic Selenium failure you get a stack trace pointing at a line of test code. With an AI browser test, the failure is behavioral — the agent navigated somewhere unexpected, or a modal blocked the checkout button, or a third-party widget never loaded. A stack trace can't capture that; a video can. You watch fifteen seconds of `.webm`, see the cookie banner that ate the click, and you know the fix is a step telling the agent to dismiss it first. That feedback loop is dramatically faster than re-running locally and squinting.

Pair the video with the NDJSON event stream and you have both the visual and the structured record. Each line in `run.ndjson` is one JSON event — a step the agent took, a verdict, a duration. You can pretty-print the last few events in a failed stage to surface the failure reason right in the console log, then reach for the video only when the text isn't enough.

### An even cheaper artifact path: the free dashboard

If wiring up `archiveArtifacts` and browsing Jenkins' artifact UI feels heavy, BrowserBash ships a free, fully local dashboard you can run with `browserbash dashboard` to browse run history and replay recordings on your own machine. There's also an optional, strictly opt-in free cloud dashboard via `browserbash connect` plus an `--upload` flag, which gives you per-run replay and video without your team logging into Jenkins at all. Free uploaded runs are kept for 15 days. It's genuinely optional — no account is needed to run tests or capture local video — but it's a nice escalation path when you want non-Jenkins folks (a PM, a designer) to watch a failure without console access. Details are on the [features page](https://browserbash.com/features).

## Committable Markdown tests for version-controlled pipelines

Inlining a long English objective in your `Jenkinsfile` works for one test. Once you have a dozen, you want them in version control next to your code, reviewable in pull requests, and reusable across pipelines. BrowserBash's Markdown tests do exactly that.

A Markdown test is a committable `*_test.md` file where each list item is a step. It supports `@import` for composing shared setup (a login flow you reuse everywhere) and `{{variables}}` templating, including secret-marked variables that get masked as `*****` in every log line — which matters a lot when your Jenkins console output is visible to the whole team. After each run it writes a human-readable `Result.md` you can also archive. Here's a checkout test and the Jenkins stage that runs it:

```bash
# checkout_test.md
# Variables: {{baseUrl}}, {{password}} (secret)
- Go to {{baseUrl}}
- Log in as "demo@example.com" with password "{{password}}"
- Add the first laptop on the page to the cart
- Proceed to checkout and place the order
- Verify the page shows "Thank you for your order!"
```

```bash
stage('Markdown E2E') {
  steps {
    withCredentials([string(credentialsId: 'store-password', variable: 'STORE_PW')]) {
      sh '''
        browserbash testmd run ./tests/checkout_test.md \
          --agent --headless --record --timeout 240 \
          --var baseUrl=https://staging.example.com \
          --var password=$STORE_PW > checkout.ndjson
      '''
    }
  }
}
```

Because the secret variable is marked as such, `$STORE_PW` shows up as `*****` in the NDJSON and in `Result.md`, so it never leaks into an archived artifact or a console log. The test file lives in your repo, so a reviewer sees exactly what the pipeline will do, and the same file runs identically on a developer's laptop with `browserbash testmd run ./tests/checkout_test.md`. That symmetry between local and CI is what kills the "works on my machine" class of pipeline bugs.

## Running on a remote browser grid from Jenkins

Sometimes you don't want the browser on the Jenkins agent at all — maybe your agents are tiny, or you need to test on a specific browser/OS combination you don't control. BrowserBash separates where the CLI runs from where the browser runs through providers, switched with a single `--provider` flag.

The options are `local` (the default, your agent's own Chrome), `cdp` (any DevTools endpoint you point it at), and the hosted grids `browserbase`, `lambdatest`, and `browserstack`. So a Jenkins agent can stay lean and offload the actual browser to a grid:

```bash
sh '''
  browserbash run "log in and verify the account page loads" \
    --provider lambdatest --agent --headless --record \
    --timeout 240 > grid-run.ndjson
'''
```

The exit-code contract and the NDJSON output are identical no matter which provider you choose, so none of your Jenkins gating logic changes when you switch from local to a grid. You add one flag, supply the grid's credentials as Jenkins credentials, and the rest of the pipeline is untouched. That provider portability is a real advantage over tools that hard-wire themselves to one execution backend. There's a worked [case study](https://browserbash.com/case-study) if you want to see grid usage in context.

### Two engines, one flag

Worth knowing for debugging: BrowserBash has two engines. The default `stagehand` engine (MIT-licensed, from Browserbase) is the general-purpose driver. The `builtin` engine is an in-repo Anthropic tool-use loop, and its bonus is that it captures a Playwright trace alongside the video. When a failure is subtle and the `.webm` alone doesn't explain it, switching that one flaky test to the builtin engine and opening its trace in the Playwright trace viewer often surfaces the exact step that went wrong. You don't need to commit to one engine globally — pick per test.

## When this approach is and isn't the right call

Let me be balanced, because AI browser tests in a Jenkins pipeline are not a fit for every situation.

This approach shines when your UI changes often, your locators break constantly, and the maintenance cost of a traditional suite has become the bottleneck. It shines for high-level user-journey checks — login, checkout, signup, the critical paths a human would describe in one sentence. It shines when you want video-rich, easy-to-debug CI failures without building a screenshot harness yourself. And it shines for teams that want a $0 model bill on local hardware or a privacy guarantee that nothing leaves the build agent.

It's a weaker fit in a few honest cases. If you need millisecond-precise assertions on exact pixel positions or specific API response payloads, a deterministic Playwright or API test is more appropriate — an AI agent reasons about intent, not byte-exact equality. If your Jenkins agents are tiny VMs with no GPU and you can't or won't use a hosted model, small local models will flake on long flows, and you'll spend your savings on debugging intermittent reds. And if your team has a mature, low-maintenance Playwright suite that rarely breaks, ripping it out to chase novelty is not a good trade — add AI tests for the flaky journeys, keep the deterministic ones where they earn their keep. The strongest pipelines in 2026 run both: deterministic tests for precise contracts, AI browser tests for resilient user-journey coverage. You can compare plans and limits on the [pricing page](https://browserbash.com/pricing) before deciding how far to take it.

## FAQ

### How do I add AI browser tests to a Jenkins pipeline?

Install the CLI on your Jenkins agent with `npm install -g browserbash-cli`, then add a stage that runs `browserbash run "<your objective>" --agent --headless --record` inside a declarative `Jenkinsfile`. Jenkins fails the stage automatically on a non-zero exit code, so you don't need any assertion or log-parsing logic. Archive the `.webm` video and NDJSON log in a `post` block so failures are easy to debug.

### Can Jenkins fail a build based on a BrowserBash exit code?

Yes, and that's the recommended pattern. BrowserBash returns 0 for passed, 1 for a product failure, 2 for an error, and 3 for a timeout. A Jenkins `sh` step fails the stage on any non-zero status by default, so the verdict is the exit code with no extra code. If you want to retry only environment errors, use `sh(returnStatus: true, ...)` and branch on the integer.

### How do I record video of an AI browser test in CI?

Pass the `--record` flag, which captures a screenshot and a full `.webm` session video using ffmpeg on any engine. Make sure ffmpeg is installed on the Jenkins agent, then archive the video with `archiveArtifacts artifacts: '**/*.webm'` inside a `post { always { ... } }` block so it survives both passing and failing builds. The builtin engine additionally captures a Playwright trace for deeper debugging.

### Do I need API keys to run AI browser tests in Jenkins?

No. BrowserBash is Ollama-first and defaults to free local models, so a GPU-equipped agent can run at a guaranteed $0 model bill with no keys and nothing leaving the machine. If your agents are small VMs, point it at a free hosted model via OpenRouter or bring your own Anthropic key, and store that key as a Jenkins credential injected with `withCredentials` so it never lands in a log.

Ready to wire this into your own pipeline? Install the CLI with `npm install -g browserbash-cli`, drop a `browserbash run` stage into your `Jenkinsfile`, and gate the build on the exit code. An account is optional — you only need one if you want the cloud dashboard — so you can start entirely locally and [sign up](https://browserbash.com/sign-up) later if and when you want hosted run history and replay.
