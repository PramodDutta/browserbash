---
title: Run AI browser tests in Azure DevOps
description: "Wire browser tests into Azure DevOps with a real azure-pipelines.yml: an AI agent drives Chrome, NDJSON output, exit-code gating, and published video artifacts."
date: 2026-04-24
category: ci
---

If you run pipelines on Azure DevOps and you want browser tests in Azure DevOps that don't break every time a designer renames a CSS class, the wiring is more approachable than the usual Selenium-grid horror stories suggest. You describe what the test should do in plain English, an AI agent drives a real Chrome browser through it, and the process exit code tells the pipeline pass or fail. No selectors to maintain, no page objects to refactor, no log scraping to decide the build verdict. This guide builds a working `azure-pipelines.yml` end to end: installing the CLI on a Microsoft-hosted agent, running the test in a job, publishing a session video as a build artifact, and gating the stage on exit codes rather than fragile text assertions.

I'll use BrowserBash as the runner because it was built for exactly this shape of automation — it emits machine-readable NDJSON, returns disciplined exit codes, and records video on any engine. The structural ideas here (stages, jobs, variable groups, published artifacts, exit-code gating) transfer to whatever AI browser testing tool you settle on. Where Azure DevOps behaves in a version- or agent-specific way, I'll flag it rather than pretend every pipeline is identical.

## Why AI browser tests fit Azure Pipelines

Azure Pipelines is, underneath all the YAML, a job runner. A job runs steps, a step is a script that returns an exit code, and the pipeline marks the step succeeded or failed based on that code. That model is a clean fit for AI browser tests, because the hardest part of traditional UI automation — turning a fragile DOM into stable assertions — moves out of your pipeline and into the agent.

Consider the contrast. A classic Selenium or Playwright suite ships hundreds of locators that snap the moment a framework upgrade reshuffles the DOM or someone renames a class. Your pipeline goes red, but the product is fine. That is a false failure, and false failures are how teams learn to ignore red builds. An AI agent works from intent instead: "log in, add a laptop to the cart, check out, and confirm the order succeeded." When a button label shifts from "Buy now" to "Purchase," a human tester wouldn't blink, and neither does the agent. The objective still holds, so the build stays green for the right reason.

That resilience pays off precisely where Azure DevOps jobs hurt most: nightly end-to-end runs and pre-merge smoke checks that flake on selector drift. When you wire AI browser tests into Azure DevOps, you trade a maintenance tax (locators) for a small probabilistic tax (the agent occasionally misreads a screen). Whether that trade is worth it depends heavily on your model choice, which I'll come back to honestly because it is the part most "just add AI" tutorials skip.

### What BrowserBash brings to a pipeline

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command an objective in English, and an AI agent drives a real Chrome or Chromium browser step by step, then returns a verdict plus structured extracted values. No account is required to run it, and no selectors get written anywhere.

Three features matter specifically for Azure Pipelines. First, an `--agent` mode that emits NDJSON — one JSON object per line — instead of prose, so nothing in your YAML has to parse English. Second, four well-defined exit codes that map directly onto the pass/fail decision the pipeline already wants to make. Third, `--record`, which captures a screenshot and a full `.webm` session video (via bundled ffmpeg) on any engine, and on the builtin engine also writes a Playwright trace. Those three combine into a CI story where the pipeline never reads a sentence to decide anything. You can read more about the wider toolset on the [BrowserBash features page](https://browserbash.com/features).

## Decide where the model runs before you touch YAML

Before any pipeline code, decide where AI inference happens, because it changes your agent's networking, your cost, and your reliability.

BrowserBash is Ollama-first. With the default `--model auto`, it resolves in this order: a local Ollama instance (`ollama/<model>`, free, no keys, nothing leaves the machine); then `ANTHROPIC_API_KEY` (`claude-opus-4-8`); then `OPENAI_API_KEY` (`openai/gpt-4.1`); and if none of those is present, it errors with guidance instead of guessing. If you have a self-hosted Azure DevOps agent with a GPU, you can run the entire pipeline at a guaranteed $0 model bill, with no test traffic leaving your network — which is a real consideration for regulated shops.

Here is the honest caveat, and it bites harder in CI than in a local demo. Very small local models — roughly 8B parameters and under — get flaky on long, multi-step objectives. A six-step checkout is exactly the kind of task where a tiny model loses the plot halfway through and reports a confident wrong answer. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. The standard Microsoft-hosted `ubuntu-latest` agents have no GPU and modest RAM, so running a 70B model locally on them is not realistic. On hosted agents, point the CLI at a hosted model; reserve local Ollama for self-hosted GPU agents or engineers' laptops.

| Setup | Where inference runs | Cost | Best for |
|---|---|---|---|
| Local Ollama, mid-size model | On a self-hosted GPU agent | $0, fully private | Regulated shops, heavy nightly suites |
| Hosted Claude (`ANTHROPIC_API_KEY`) | Anthropic API | Per-token | Hard multi-step flows, highest reliability |
| Hosted OpenAI (`OPENAI_API_KEY`) | OpenAI API | Per-token | Teams already standardized on GPT |

Whatever you pick, store the key as a secret in an Azure DevOps **variable group** (Pipelines → Library) or in linked Azure Key Vault, never as a plaintext value in the YAML. I'll wire that in below. If you're still weighing local versus hosted, the [pricing page](https://browserbash.com/pricing) lays out where the $0 path holds and where it doesn't.

## A minimal azure-pipelines.yml that runs one test

Start with the smallest thing that proves the loop works: install Node, install the CLI, run one objective against a public site on a Microsoft-hosted Ubuntu agent. This uses a hosted model so it works on a vanilla agent with no GPU.

```bash
browserbash run "go to https://demo.browserbash.com, log in with the demo account, and confirm the dashboard shows a welcome message" \
  --headless \
  --model claude-opus-4-8 \
  --agent \
  --record
```

Now the pipeline. Save this as `azure-pipelines.yml` at the repository root:

```yaml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

variables:
  - group: browser-test-secrets   # holds ANTHROPIC_API_KEY as a secret

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js 20'

  - script: npm install -g browserbash-cli
    displayName: 'Install BrowserBash CLI'

  - script: |
      browserbash run "log in to the demo account and confirm the dashboard loads" \
        --headless --model claude-opus-4-8 --agent --record \
        | tee "$(Build.ArtifactStagingDirectory)/run.ndjson"
    displayName: 'Run AI browser test'
    env:
      ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)

  - task: PublishBuildArtifacts@1
    condition: always()
    inputs:
      PathtoPublish: '$(Build.ArtifactStagingDirectory)'
      ArtifactName: 'browser-test-evidence'
    displayName: 'Publish NDJSON + video'
```

A few things are doing real work here. `vmImage: ubuntu-latest` gives you Chromium support out of the box — BrowserBash needs Chrome for the local provider, and the headless Linux agent has the libraries it needs. The `variables` block pulls in a variable group so `ANTHROPIC_API_KEY` is injected as a secret and masked in logs; mapping it into the step's `env` is what makes it visible to the `auto`/hosted resolution. `--headless` is non-negotiable on a build agent that has no display. And `condition: always()` on the publish task means you still get the video and NDJSON even when the test fails — which is exactly when you want the evidence.

That is the entire loop. Push to `main`, watch the run, and download the `browser-test-evidence` artifact to see the `.webm` recording of the agent driving the browser.

## Gate the pipeline on exit codes, not log text

The single most important habit when you wire browser tests into Azure DevOps: let the exit code decide the verdict. BrowserBash returns four codes, and they map onto your pipeline's needs without any parsing:

- `0` — passed
- `1` — failed (the objective ran but the assertion didn't hold)
- `2` — error (something broke: bad config, missing key, crash)
- `3` — timeout

Azure Pipelines already fails a `script` step on any non-zero exit, so the simple case needs no extra code — a failed or timed-out test reds the build automatically. The reason you'd ever read the code explicitly is when you want to treat `1` (a real product failure) differently from `2` (a broken pipeline). A genuine assertion miss should fail the build loudly; a misconfigured agent is your problem to fix, not a signal about the product.

```yaml
  - script: |
      set +e
      browserbash run "complete checkout with the test card and confirm the order number appears" \
        --headless --model claude-opus-4-8 --agent --record \
        | tee "$(Build.ArtifactStagingDirectory)/checkout.ndjson"
      code=${PIPESTATUS[0]}
      echo "BrowserBash exit code: $code"
      if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
        echo "##vso[task.logissue type=warning]Infrastructure error or timeout (exit $code), not a product defect"
      fi
      exit $code
    displayName: 'Checkout smoke test'
    env:
      ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)
```

Two subtleties trip people up. Because the command is piped into `tee`, the shell's `$?` reflects `tee`, not BrowserBash — so you read `${PIPESTATUS[0]}` to get the real code. And `set +e` stops the script from aborting before you've captured that code; you re-raise it with the final `exit $code`. The `##vso[task.logissue]` logging command surfaces a warning annotation in the Azure DevOps run summary so a human skimming the build knows at a glance whether a red build was the product's fault or the pipeline's. This is the kind of disciplined exit-code handling the [BrowserBash tutorials](https://browserbash.com/tutorials) walk through in more depth.

### Why NDJSON beats prose parsing in CI

The `--agent` flag is what makes the whole thing CI-grade rather than a demo. Without it, BrowserBash prints human-readable prose — lovely on your laptop, useless to a pipeline. With it, you get one JSON object per line. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run finishes with a terminal `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`.

That terminal object is gold for richer reporting. You can pull `final_state` to extract the order number the agent confirmed, or `duration_ms` to track how long a flow takes over time. Crucially you never grep English to make a decision — the structured `status` field and the exit code agree, and you build on whichever is convenient. If you've ever maintained a regex that scraped "PASS" out of a test log and watched it silently break when the wording changed, you know why this matters.

## Markdown tests you can commit and review

One-shot `run` commands are perfect for a single smoke check, but real suites live in version control and get reviewed in pull requests. BrowserBash supports committable markdown tests — files named `*_test.md` where each list item is a step. They support `{{variables}}` templating, `@import` for composing shared setup, and secret-marked variables that get masked as `*****` in every log line. After each run the CLI writes a human-readable `Result.md`.

Here's what a `login_test.md` might contain:

```
# Login smoke test

- Go to {{baseUrl}}
- Click the "Sign in" button
- Enter {{username}} into the email field
- Enter {{password!}} into the password field
- Submit the form
- Confirm the dashboard heading reads "Welcome back"
```

The `{{password!}}` marker tells BrowserBash to treat that value as a secret, so it appears as `*****` in logs and in the run store. You run the file from your pipeline like this:

```bash
browserbash testmd run ./tests/login_test.md \
  --headless --model claude-opus-4-8 --agent --record
```

In the Azure DevOps step, you pass the variables through the environment and let templating resolve them. Because the test is a plain markdown file, a reviewer reads the diff and immediately understands what changed — no mental parsing of selectors or `await page.click(...)` chains. That readability is the quiet superpower of natural-language tests in a PR-review culture, and it's a recurring theme across the [BrowserBash blog](https://browserbash.com/blog). Combine `testmd run` with the exit-code gating above and you have a committable suite that gates merges into `main`.

## Engines and providers: which to pick on an agent

Two orthogonal choices shape how your test behaves: the engine (who interprets the English) and the provider (where the browser actually runs).

The engine is set with `--engine`. The default is `stagehand` (MIT-licensed, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals around small UI changes — a good default for most pipelines. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright; it's what gets used automatically when you target the LambdaTest or BrowserStack grids, and it adds a Playwright trace to `--record` output, which is handy for deep debugging in Azure DevOps.

The provider is set with `--provider` and decides where the browser lives:

| Provider | Where the browser runs | Extra credentials |
|---|---|---|
| `local` (default) | Chrome on the agent itself | none |
| `cdp` | Any DevTools endpoint via `--cdp-endpoint ws://...` | none (you supply the URL) |
| `browserbase` | Browserbase cloud | `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` |
| `lambdatest` | LambdaTest grid (auto builtin engine) | `LT_USERNAME` + `LT_ACCESS_KEY` |
| `browserstack` | BrowserStack grid (auto builtin engine) | `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` |

On a Microsoft-hosted agent, `local` is the simplest and cheapest — Chromium is already there. Reach for `lambdatest` or `browserstack` when you need cross-browser coverage (Safari, Edge, older versions) that a single Linux agent can't provide, and put those grid credentials in the same variable group as your model key. The `cdp` provider is the escape hatch for an unusual setup — say a browser running in a sidecar container on a self-hosted agent — where you point BrowserBash at an existing DevTools endpoint.

## Self-hosted agents, parallelism, and a nightly schedule

The minimal pipeline runs on demand against `main`. Three upgrades make it production-grade.

**Self-hosted agents for the local-model path.** If you want the $0, fully-private route with a mid-size Ollama model, you need a self-hosted agent with a GPU — the hosted Ubuntu images won't cut it. Install Ollama and pull a model (for example `qwen3`) on that agent, set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` if they differ from defaults, and switch the run to `--model auto` (or pin `--model ollama/qwen3`). Now no test traffic leaves your infrastructure. This is the configuration most regulated teams end up on, and it's a strong reason to read the [BrowserBash learn hub](https://browserbash.com/learn) on local-model setup before committing.

**Parallelism with a matrix.** Azure Pipelines runs a `strategy: matrix` to fan out jobs. Map each matrix leg to a different markdown test or a different objective, and the legs run concurrently across agents (subject to your parallel-job quota). Each job publishes its own artifact, so you get one video per flow. Keep an eye on the model side: if every parallel leg hits the same hosted API key, you can brush against rate limits, so stagger heavy suites or use a higher-tier key.

**A nightly schedule.** Add a `schedules` block to run the full suite overnight when nobody's waiting on the build:

```yaml
schedules:
  - cron: "0 2 * * *"
    displayName: 'Nightly browser regression'
    branches:
      include:
        - main
    always: true
```

`always: true` runs the schedule even when there were no commits that day, which is what you want for a regression net. Nightly is also the right home for your slowest, most complex journeys — the ones where a hosted model's reliability earns its per-token cost.

### Reviewing runs locally and in the cloud

Every run is kept on-disk at `~/.browserbash/runs` (secrets masked, capped at 200), so on a self-hosted agent you can inspect history directly. For a friendlier view, `browserbash dashboard` opens a fully-local dashboard at `localhost:4477` — useful when debugging on your own machine before pushing pipeline changes; `--clear` wipes the store.

There's also an opt-in cloud dashboard for sharing run evidence with a team. You link it once with `browserbash connect --key bb_...`, then add `--upload` to a run to push that run's evidence to the cloud (free cloud runs are kept 15 days). The default is local-only: without `--upload`, nothing leaves the machine. That opt-in posture is deliberate, and it's why the `--record` artifact published straight into Azure DevOps is the safest default for most teams — your evidence stays inside your own build retention. If you do want the shared view, [sign up](https://browserbash.com/sign-up) is free and the account is optional.

## When to choose this over a classic Playwright suite

This approach is not a universal replacement, and pretending otherwise would do you a disservice. Here's the balanced read.

**Choose AI browser tests in Azure DevOps when:** your selectors break more often than your features do; you want non-engineers (QA, PMs) to author and review tests in plain English; you're standing up coverage fast on an app that's still changing shape weekly; or you value committable, human-readable tests that survive UI refactors. The exit-code-plus-NDJSON contract makes the pipeline side genuinely boring, which is a compliment in CI.

**Stick with a hand-written Playwright or Selenium suite when:** you need millisecond-deterministic assertions on exact pixel positions or specific DOM attributes; you're testing a stable, mature app where selectors rarely change and the maintenance tax is already low; or you have hard constraints against any probabilistic component in your gating path. A traditional suite is deterministic by construction — the same locators do the same thing every run. An AI agent introduces a small, real chance of a misread, and on a poorly chosen small model that chance is not small at all. Be honest with yourself about your tolerance.

Many teams land on a hybrid: deterministic Playwright for the tight, unchanging core flows, and AI browser tests for the broad, churn-heavy surface where locator maintenance was eating the most time. Azure Pipelines handles both happily in the same `azure-pipelines.yml` — they're just different `script` steps with different exit-code semantics. For a sense of how teams have combined the two, the [BrowserBash case study page](https://browserbash.com/case-study) is a useful reference point.

## FAQ

### How do I add browser tests to an Azure DevOps pipeline?

Install Node and the runner in your `azure-pipelines.yml`, then add a `script` step that runs the test on a headless agent. With BrowserBash you run `npm install -g browserbash-cli`, then `browserbash run "<objective>" --headless --agent`, and the step's exit code gates the build automatically because Azure Pipelines fails any step that returns non-zero. Publish the recorded artifact with `PublishBuildArtifacts@1` and a `condition: always()` so you keep evidence even on failures.

### Can AI browser tests run on Microsoft-hosted agents?

Yes. The `ubuntu-latest` hosted image ships Chromium support, so the default `local` provider works without extra setup, and `--headless` handles the lack of a display. The one limit is the local-model path: hosted agents have no GPU, so a mid-size Ollama model isn't realistic there. On hosted agents, point the CLI at a hosted model via `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`; use self-hosted GPU agents if you need the fully-local $0 route.

### How do I keep API keys and passwords out of my pipeline logs?

Store secrets in an Azure DevOps variable group (Pipelines → Library) or linked Azure Key Vault, never as plaintext in the YAML, and map them into the step's `env`. Azure DevOps masks secret variables in logs automatically. On top of that, BrowserBash masks any secret-marked `{{variable!}}` in markdown tests as `*****` in every log line and in its on-disk run store, so passwords don't leak into evidence even when you publish artifacts.

### What's the difference between exit codes 1 and 2 in CI?

Exit code 1 means the test ran but the objective's assertion didn't hold — a genuine product failure you want to fail the build loudly. Exit code 2 means something broke before a real verdict was possible: a missing API key, bad config, or a crash, which is a pipeline problem rather than a product defect. Exit code 3 is a timeout. Reading the code explicitly (via `${PIPESTATUS[0]}`) lets you annotate infrastructure errors differently from real failures so a red build's cause is obvious at a glance.

Wiring AI browser tests into Azure DevOps comes down to three honest moves: pick a model that actually fits your agents, let exit codes decide the verdict, and publish the recorded video so every failure ships with evidence. Start with one objective on a hosted agent, watch the `.webm`, then grow into committable markdown suites and a nightly schedule.

Install it and run your first test in a minute:

```bash
npm install -g browserbash-cli
```

Then [sign up](https://browserbash.com/sign-up) if you want the shared cloud dashboard — though the account is entirely optional, and everything in this guide works without one.
