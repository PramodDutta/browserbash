---
title: Run AI browser tests in CircleCI
description: "Wire browser tests into CircleCI: a config.yml job, store_artifacts for video and screenshots, exit-code gating, and secrets via contexts."
date: 2026-04-21
category: ci
---

If you want to run AI-driven browser tests in CircleCI, the wiring comes down to one `config.yml` job, a clean exit code, and a `store_artifacts` step that hands you the evidence. You write a plain-English objective, an agent drives a real Chrome browser through it, and the process exit status tells CircleCI whether the build is green or red. No selectors to babysit, no page objects to refactor, no log scraping to decide pass or fail. This guide builds a working CircleCI pipeline for browser tests end to end — the executor, the install steps, the run command, artifacts for video and screenshots, and secrets done the right way through contexts.

I'll use BrowserBash as the runner, because it was built for exactly this shape of automation: it emits machine-readable NDJSON, returns disciplined exit codes, and records a session video on any engine. But the structural ideas — jobs, executors, `store_artifacts`, exit-code gating — carry over to whatever AI testing tool you settle on. Where CircleCI itself behaves in a plan-specific or version-specific way, I'll flag it rather than pretend every account is identical.

## Why AI browser tests fit CircleCI cleanly

CircleCI is a job runner at heart. A job runs a series of steps, each step is a command, and the job's success or failure is decided by whether those commands exit zero. That contract is a near-perfect match for AI browser tests, because the brittle part of traditional UI automation — turning a shifting DOM into stable assertions — moves out of your pipeline and into the agent.

Consider the contrast. A classic Selenium or Playwright suite ships hundreds of locators that snap the moment a designer renames a CSS class or a framework bump reshuffles the DOM. Your CircleCI job goes red, but the product is fine. That's a false failure, and false failures are how teams learn to ignore red builds. An AI agent works from intent instead: "log in, add a laptop to the cart, check out, and confirm the order succeeded." When a button's label changes from "Buy now" to "Purchase," a human tester wouldn't blink — and neither does the agent. The objective still holds.

That resilience pays off most where CircleCI jobs hurt most: nightly end-to-end runs and pre-merge smoke checks that flake on selector drift. When you run browser tests in CircleCI this way, you trade a maintenance tax (locators) for a small probabilistic tax (the agent occasionally misreads a screen). Whether that trade is worth it depends largely on your model choice, which I'll get to honestly below.

### What BrowserBash brings to a CircleCI job

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command an objective in English, and an AI agent drives a real Chrome or Chromium browser step by step, then returns a verdict plus structured extracted values. No account is required to run it, and there are no selectors to write. You can browse the [features](https://browserbash.com/features) page for the full surface, but three capabilities matter most for CircleCI.

First, an `--agent` mode that emits NDJSON — one JSON object per line — instead of prose, so nothing in your pipeline ever has to parse English. Second, four well-defined exit codes that map straight onto CircleCI's pass/fail model. Third, `--record`, which captures a screenshot plus a full `.webm` session video on any engine, exactly the kind of file you want to drop into `store_artifacts` so a failed run is debuggable from the dashboard.

## The model decision before you touch config.yml

Before any pipeline YAML, decide where the AI inference runs, because it changes your job's networking, your cost, and your reliability.

BrowserBash is Ollama-first. The default model is `auto`, and it resolves in a fixed order: (1) a local Ollama instance, which is free and needs no keys; (2) `ANTHROPIC_API_KEY`, which resolves to `claude-opus-4-8`; (3) `OPENAI_API_KEY`, which resolves to `openai/gpt-4.1`; otherwise it errors with guidance. On local models nothing leaves the machine, which means a guaranteed $0 model bill. If your CircleCI runners had a local Ollama daemon with a capable model, you could run the entire suite at zero inference cost.

Here's the honest catch, and it bites harder in CI than in a local demo. CircleCI's cloud Docker executors are CPU-bound containers — no GPU — so running a mid-size local model inside a standard cloud job is impractically slow for anything beyond a toy objective. You have two realistic options. Either point the CLI at a hosted model with `ANTHROPIC_API_KEY` (resolving to `claude-opus-4-8`) or `OPENAI_API_KEY` (resolving to `openai/gpt-4.1`), or run the job on a [self-hosted CircleCI runner](https://browserbash.com/learn) on a GPU box where local Ollama is genuinely fast. The cloud-runner-plus-hosted-model path is what most teams will reach for first.

And weave in the reliability caveat that applies everywhere: very small local models (roughly 8B parameters and under) are flaky on long, multi-step objectives. A six-step checkout flow is precisely where a tiny model loses the plot. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. Don't aim a nightly suite of twelve complex journeys at an 8B model and then act surprised by intermittent reds — that's a model problem, not a pipeline problem.

| Setup | Where inference runs | Cost | Best for |
|---|---|---|---|
| Hosted Claude (`ANTHROPIC_API_KEY`) | Anthropic | Per-token | Hard multi-step flows, highest reliability, cloud runners |
| Hosted GPT (`OPENAI_API_KEY`) | OpenAI | Per-token | Capable hosted alternative on cloud runners |
| Local Ollama, mid-size model | Self-hosted GPU runner | $0 | Privacy-sensitive shops with their own hardware |

Whatever you pick, the API key belongs in a CircleCI **context** (or a project environment variable), never inline in `config.yml`. I'll show that next.

## Secrets the CircleCI way: contexts, not plaintext

CircleCI gives you two places to store secrets: project-level environment variables (scoped to a single project) and **contexts** (organization-level, reusable across projects, and guardable with restrictions). For an API key shared across several repos, a context is the cleaner choice.

Create a context named something like `browser-tests` in your CircleCI organization settings and add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) to it. Then attach the context to the job at the workflow level. The key is injected as an environment variable at runtime and never appears in your committed YAML.

There's a second layer worth knowing about. BrowserBash's markdown tests support secret-marked variables, which are masked as `*****` in every log line the CLI writes — including the on-disk run store. So even if a credential flows into a test step as a templated `{{variable}}`, it won't leak into the artifact you upload. CircleCI masks known environment-variable values in its own log output too, but defense in depth is cheap here: let the CI platform mask the variable and let the tool mask the value. If you're building committable tests, see the [tutorials](https://browserbash.com/tutorials) for the markdown test format.

## A complete config.yml for browser tests

Here's a full, working `.circleci/config.yml` that runs a single AI browser test, records a video, and uploads both the video and the agent's NDJSON log as artifacts. Drop it at `.circleci/config.yml` in your repo root.

```yaml
version: 2.1

jobs:
  browser-test:
    docker:
      - image: cimg/node:20.11-browsers
    resource_class: medium
    steps:
      - checkout
      - run:
          name: Install BrowserBash
          command: npm install -g browserbash-cli
      - run:
          name: Sanity check
          command: |
            node --version
            browserbash --version
      - run:
          name: Run AI browser test
          command: |
            mkdir -p /tmp/bb-artifacts
            browserbash run "Open browserbash.com, click Pricing, and confirm a free tier is listed" \
              --headless \
              --record \
              --agent \
              --timeout 180 > /tmp/bb-artifacts/run.ndjson
      - store_artifacts:
          path: /tmp/bb-artifacts
          destination: browser-test
      - store_artifacts:
          path: ~/.browserbash/runs
          destination: run-store

workflows:
  verify:
    jobs:
      - browser-test:
          context: browser-tests
```

A few things to notice. The executor is `cimg/node:20.11-browsers`, one of CircleCI's convenience images that ships Node plus a preinstalled Chrome — which BrowserBash's default `local` provider needs. That satisfies the Node >= 18 and Chrome requirements without you installing a browser by hand. The `--headless` flag is mandatory in CI because there's no display. `--record` writes a screenshot and a `.webm` session video; `--agent` switches output to NDJSON, which we redirect into a file. The `--timeout 180` puts a 180-second ceiling on the run so a hung agent can't stall the job indefinitely. Finally, the workflow attaches the `browser-tests` context so `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) is present in the environment without ever touching the YAML.

### Why the exit code is the whole game

The reason this pipeline needs no assertions is that BrowserBash returns disciplined exit codes: `0` passed, `1` failed, `2` error, `3` timeout. CircleCI fails a job the instant any step exits non-zero, so a failed browser test fails the build automatically. You don't grep the log, you don't check a screenshot, you don't write a single `if` statement. The verdict is the process status.

That's the part teams coming from Selenium often under-appreciate. In a traditional suite, the test framework owns the assertions and emits a JUnit XML that CI then has to parse. Here the agent makes the call — pass or fail against your stated objective — and surfaces it as the one signal CI already understands. The NDJSON we captured is purely for humans debugging a red run; CircleCI itself never reads it.

## Capturing artifacts: video, screenshots, and the run store

Artifacts are where a CircleCI browser-testing pipeline earns its keep. A red build with no evidence is a guessing game. A red build with a 30-second video of the agent fumbling a login is a five-minute fix.

The `store_artifacts` step takes a `path` (a file or directory on the runner) and an optional `destination` (a prefix in the Artifacts tab). In the config above we upload two directories:

- `/tmp/bb-artifacts` — the NDJSON log we redirected, useful for reading the agent's step-by-step reasoning and the final structured state.
- `~/.browserbash/runs` — BrowserBash's on-disk run store. Every run is kept here automatically (secrets masked, capped at the 200 most recent), including the screenshot and `.webm` video that `--record` produced.

After the job runs, open it in the CircleCI dashboard and click the **Artifacts** tab. The `.webm` plays in most browsers directly from the artifact URL, so a reviewer can watch exactly what the agent saw without cloning anything. If your team prefers a single tidy folder, copy the specific files you care about into one directory before the `store_artifacts` step and upload just that.

One pattern worth adopting: upload artifacts even when the test fails. CircleCI runs `store_artifacts` as an ordinary step, and by default a failing earlier step stops the job. To guarantee artifacts upload on failure, mark the upload steps with `when: always`:

```yaml
      - store_artifacts:
          path: ~/.browserbash/runs
          destination: run-store
          # add this under the step in a `run`-style block where needed:
      - run:
          name: Always note completion
          when: always
          command: echo "test stage finished"
```

CircleCI's `when: always` applies to `run` steps; for `store_artifacts` specifically, the cleanest approach is to put your test command and the artifact upload in a structure where the upload isn't skipped — many teams run the test with a trailing `|| true` to capture exit status into a variable, upload artifacts, then re-exit with the saved code. It's a few extra lines, but it means every failing run leaves you a video. Decide based on how often your runs go red; if failures are rare, the simpler config is fine.

## Local-first iteration before you commit YAML

A practical tip that saves CircleCI minutes: get the objective working locally before you push a single line of `config.yml`. The CLI runs identically on your laptop and on a runner, so debug where iteration is instant.

```bash
npm install -g browserbash-cli

# Watch it drive a real browser, with the local dashboard open
browserbash run "Log in with the test account, open Settings, and confirm two-factor auth is enabled" \
  --record \
  --dashboard
```

The `--dashboard` flag opens BrowserBash's fully local dashboard at `localhost:4477` for this run, so you can watch the agent's steps, the recorded video, and the extracted state without any cloud account. You can also launch it standalone with `browserbash dashboard` to browse past runs. Nothing leaves your machine unless you explicitly opt in. Once the objective is reliable locally, copy the exact command into `config.yml`, add `--headless --agent`, and you're done — the behavior is the same, only the output format and display change.

If you want to share a run with a teammate who isn't on your machine, there's an opt-in cloud path: `browserbash connect --key bb_...` links your account once, then `--upload` on a run pushes that single run to the cloud dashboard (free cloud runs are kept 15 days). Without `--upload`, nothing is transmitted. It's strictly additive — handy for a flaky nightly you want a colleague to eyeball, not something CircleCI requires.

## Committable tests and parallelism for bigger suites

One-shot `browserbash run` commands are great for a smoke check. For a real regression suite you'll want tests in version control, reviewed in pull requests like any other code. BrowserBash's markdown tests cover that: a `*_test.md` file where each list item is a step, with `{{variables}}` templating, `@import` for composing shared flows, and secret-marked variables masked in logs. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md --headless --record --agent
```

Commit your `*_test.md` files alongside the app, and your browser tests review like source. In CircleCI, you can split a suite across containers with the `parallelism` key, which spins up multiple independent executors for one job. The honest caveat: CircleCI's built-in test splitting works from a JUnit/timing manifest, which suits frameworks that emit per-test XML. With markdown tests, the simpler and more predictable approach is to give each container a different file or group of files — for example, run smoke tests on one and checkout flows on another — rather than relying on automatic splitting. That keeps each container's work deterministic and each artifact set easy to trace back to a specific test.

Two more details for larger pipelines. Use `store_test_results` only if you're generating a JUnit XML CircleCI can parse; with the NDJSON-and-exit-code model here, `store_artifacts` plus the exit status is usually all you need. And put browser tests in their own workflow job, downstream of unit tests, so you're not paying for an agent run on a build that already failed lint.

## Engines and providers: stay default, or go remote

By default, BrowserBash uses the `stagehand` engine (MIT, by Browserbase) to interpret your English — it offers act/extract/observe/agent primitives and self-healing. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright, and it's auto-selected for LambdaTest and BrowserStack runs. You switch with `--engine stagehand|builtin`. On the `builtin` engine, `--record` additionally writes a Playwright trace, which is a nice bonus artifact for deep debugging.

Providers control where the browser actually runs, set with `--provider`. The default `local` uses the runner's own Chrome, which is exactly what `cimg/node:...-browsers` gives you and what most CircleCI jobs should use. If you need real cross-browser or device coverage, you can target a remote grid: `lambdatest` (needs `LT_USERNAME` and `LT_ACCESS_KEY`, auto-switches to the builtin engine) or `browserstack` (needs `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`, also auto-builtin). There's also `cdp` for any DevTools endpoint via `--cdp-endpoint ws://...`, and `browserbase` for a hosted browser (needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`). All of those credentials belong in your CircleCI context, same as the model key.

For most teams getting started, the answer is boring and correct: default engine, `local` provider, Chrome from the convenience image, hosted model key in a context. Reach for a remote provider only when you genuinely need a browser or OS your runner can't supply.

## When CircleCI plus AI browser tests is the right call

Be honest with yourself about fit. This approach shines when your UI changes often, your locators rot, and your team is tired of triaging false reds. It's a strong fit for smoke tests, critical-path journeys (signup, login, checkout), and exploratory checks where the intent is stable even as the markup churns.

It's a weaker fit in a few cases, and naming them keeps you out of trouble. If you need pixel-exact visual regression, a dedicated visual-diff tool is the better instrument — agents verify intent, not exact rendering. If you have a mature, low-flake Playwright suite that your team already trusts, ripping it out to chase novelty is rarely worth it; add AI tests for the flows that flake, keep the deterministic ones. And if you're locked to cloud Docker executors with no GPU and a strict no-external-API policy, the model story gets hard — local inference is too slow on CPU-only runners, and hosted models mean traffic leaves your network. In that specific corner, a self-hosted GPU runner is the unlock, or this isn't your tool today.

Where it does fit, the operational win is real: fewer locators to maintain, builds that fail for product reasons instead of CSS reasons, and a video artifact attached to every red run. You can read more about real-world usage on the [case study](https://browserbash.com/case-study) page and the broader [blog](https://browserbash.com/blog).

## Putting it together

A CircleCI browser-testing pipeline with BrowserBash is three moving parts. A `config.yml` job on a `-browsers` convenience image that installs the CLI and runs an English objective `--headless --agent`. A model key in a context so secrets stay out of YAML. And a `store_artifacts` step that hands you a `.webm` video and an NDJSON log for every run. The exit code does the gating, the artifacts do the debugging, and you never write a selector.

Start small. Get one critical-path objective passing locally with `--record --dashboard`, commit the equivalent `config.yml`, and watch your first green build come back with a playable video attached. Add a second objective. Then move the flakiest journeys in your old suite over one at a time. That incremental path is how teams actually adopt this without a risky big-bang migration. Pricing details for the optional cloud features are on the [pricing](https://browserbash.com/pricing) page, but remember the core CLI and local dashboard are free and need no account.

## FAQ

### How do I run browser tests in CircleCI?

Add a `.circleci/config.yml` with a job on a `-browsers` Docker image such as `cimg/node:20.11-browsers`, which ships Node and Chrome. Install your test runner (for BrowserBash, `npm install -g browserbash-cli`), run your test command with `--headless`, and let the process exit code decide pass or fail. CircleCI fails the job automatically when any step exits non-zero, so no separate assertion or log parsing is needed.

### How do I store browser test screenshots and videos as CircleCI artifacts?

Use the `store_artifacts` step with a `path` pointing at the directory holding your screenshots or video, and an optional `destination` prefix for the Artifacts tab. With BrowserBash, pass `--record` to capture a screenshot and a `.webm` session video, then upload BrowserBash's run store at `~/.browserbash/runs`. After the job, the files appear under the Artifacts tab and the `.webm` plays directly in most browsers.

### How do I keep my API key out of config.yml in CircleCI?

Store the key in a CircleCI context (or a project-level environment variable) rather than in the committed YAML, then attach the context to the job at the workflow level. The key is injected as an environment variable at runtime and never appears in your repository. BrowserBash additionally masks secret-marked variables as asterisks in every log line and in its on-disk run store, so credentials don't leak into uploaded artifacts.

### Can I run AI browser tests on CircleCI's free cloud runners?

Yes, on a `-browsers` Docker executor, but the model has to run somewhere with enough compute. CircleCI's cloud containers are CPU-only, so a local Ollama model is too slow there; point BrowserBash at a hosted model with `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for cloud runners. If you want fully local inference at $0, run the job on a self-hosted CircleCI runner with a GPU and a mid-size model.

Ready to try it? Install with `npm install -g browserbash-cli` and run your first objective in minutes. An account is optional — grab one only if you want the cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
