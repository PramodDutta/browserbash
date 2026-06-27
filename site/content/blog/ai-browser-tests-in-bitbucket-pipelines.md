---
title: Running AI Browser Tests in Bitbucket Pipelines
description: "Run AI browser tests in Bitbucket Pipelines: a Node image, repository variables for secrets, --headless --agent, exit-code gating, and --record artifacts."
date: 2026-06-27
category: ci
---

To run AI browser tests in Bitbucket Pipelines, you add a `bitbucket-pipelines.yml` that uses a Node Docker image, installs `browserbash-cli`, pulls secrets from repository variables, and runs a plain-English objective with `--headless --agent`. The process exit code is what Bitbucket gates on: `0` passes the step, anything non-zero fails it. You write the test as intent (`"log in and confirm the dashboard loads"`), an AI agent drives a real Chrome browser through it, and `--record` saves a `.webm` video plus screenshots that you publish as pipeline artifacts for debugging. No selectors, no page objects, no log parsing. This post walks the whole `bitbucket-pipelines.yml` end to end and mirrors the same pattern teams already use for [BrowserBash in GitHub Actions](https://browserbash.com/blog/browserbash-github-actions-tutorial).

Bitbucket Pipelines is, at its core, a container that runs shell steps and reacts to their exit status. That model fits AI browser tests cleanly, because the fragile part of UI automation (turning a shifting DOM into stable assertions) moves out of your YAML and into the agent. I will use BrowserBash as the runner since it was built for exactly this shape: it runs `--headless`, emits machine-readable NDJSON under `--agent`, returns disciplined exit codes (0/1/2/3), and records video you can attach to a step. The structural ideas carry over to whatever tool you pick.

## Why AI browser tests fit Bitbucket Pipelines

A Bitbucket step runs a list of `script:` commands inside a Docker image. Each command returns a status, and the moment one returns non-zero the step fails and the pipeline stops (unless you opt out). Traditional Selenium or Playwright suites bolt their own assertion framework on top of that, then translate failures back into a non-zero exit. It works, but the brittle layer (locators, waits, page objects) lives in your repo and breaks every time a designer renames a class.

An AI browser agent collapses that layer. You describe the outcome in English, "log in, open billing, confirm the plan reads Pro", and the agent figures out the clicks by reading the live page. When the objective cannot be satisfied, the process exits non-zero and Bitbucket fails the step. No `grep` over logs, no parsing test output to decide the verdict. That is the whole pitch for running AI browser tests in Bitbucket Pipelines this way: the verdict is the exit code, and the exit code is the contract.

The agent does not match on CSS classes. It finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, and it handles iframes and Shadow DOM. The default `stagehand` engine observes the live DOM on each step and decides the next action from what is actually rendered right then, so a renamed button or a moved element usually does not break the run. It re-derives from live state every run rather than replaying a saved selector script.

The honest tradeoff: an AI agent is non-deterministic in a way a hard-coded selector is not. You manage that with model choice, a sensible `--timeout`, step-level retries, and recorded artifacts so a flake is debuggable rather than a mystery. We will wire all of those.

## What Bitbucket gives you to work with

A few Bitbucket-specific facts shape the YAML, so it helps to name them before copying a config:

- **Every pipeline runs in a Docker image.** You set it with a top-level `image:` or per step. Pick a Node image so `npm` and `node` are already present.
- **Repository variables hold your secrets.** Repository settings, then Repository variables. Mark a variable **Secured** and its value is masked in the log and hidden in the UI. These become plain environment variables inside the step.
- **Artifacts are declared per step.** An `artifacts:` list names paths to keep after the step finishes, and they are downloadable from the pipeline result view.
- **`size: 2x` doubles the memory.** Browsers are memory-hungry. The default step gets a limited memory budget, and a Chrome run can need more. If you see the browser killed mid-run, bumping `size: 2x` is the first thing to try.
- **Pipelines run on Linux containers by default.** No display, so headless is mandatory.

## Installing BrowserBash and Chrome in the step

BrowserBash needs Node 18 or newer and a Chrome/Chromium binary for the default `local` provider. The cleanest path is a Node image plus a quick Chromium install in the step. Here is the smallest install sequence:

```bash
npm install -g browserbash-cli
browserbash --version
```

On a Debian-based Node image you install the browser alongside it. A couple of container realities are worth knowing:

- **Chrome needs `--no-sandbox` in most containers.** Running Chrome as root inside Docker without a sandbox flag is the single most common cause of a "Chrome crashed" step. BrowserBash handles the browser launch for you, but if you supply your own Chromium or run a hardened image, the sandbox is the first thing to check.
- **Headless is non-negotiable.** There is no display in a pipeline container. Always pass `--headless`.
- **A model has to be reachable.** That decision shapes the rest of the pipeline, so it gets its own section next.

## Choosing a model: hosted key vs local

BrowserBash resolves the model with `auto` by default, in this order: a local Ollama install first (`ollama/<model>`, free, no keys, nothing leaves the machine), then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (which has free models available). You can pin any of them explicitly with `--model`.

For a Bitbucket pipeline you are really choosing between two shapes:

| Approach | What runs the reasoning | Cost | Best for |
| --- | --- | --- | --- |
| Hosted model via API key | Claude / OpenRouter over the network | Per-token, billed to your provider | Shared Bitbucket cloud runners with no GPU, hardest multi-step flows, lowest maintenance |
| Local Ollama on a self-hosted runner | A model you host beside the job | $0 model bill, nothing leaves the runner | Privacy-sensitive flows, self-hosted Bitbucket runners with spare RAM/VRAM, high run volume |

There is an honest caveat that decides this for most cloud-hosted setups. Bitbucket's cloud runners have no GPU and a modest memory budget, so a capable hosted model behind an API key is the steady choice there. Very small local models (8B and under) are flaky on long multi-step objectives: they lose the thread halfway through a checkout flow. The sweet spot for local is a 70B-class model (Qwen3, Llama 3.3), which needs real hardware, so local Ollama makes sense mainly on **self-hosted** Bitbucket runners where you control the box. Pick based on your runner fleet, not on a vibe. The local option's quiet upside is that nothing leaves the machine, which privacy-conscious teams care about.

For hosted, put the key in a **Secured repository variable**, never in the YAML. We reference it as `$ANTHROPIC_API_KEY` below. The [features page](https://browserbash.com/features) lays out engines, providers, and backends in more depth.

## A first `bitbucket-pipelines.yml` that gates on exit code

Here is the smallest pipeline that does real work: install the CLI and Chromium, run one headless objective, fail the step if the agent fails.

```bash
image: node:20-bookworm

pipelines:
  pull-requests:
    '**':
      - step:
          name: Browser smoke
          size: 2x
          script:
            - apt-get update && apt-get install -y chromium
            - npm install -g browserbash-cli
            - >
              browserbash run "Go to https://example.com, confirm the heading
              says Example Domain and the More information link is visible"
              --headless --timeout 120
```

What is happening, line by line. The top-level `image:` runs everything on a clean Debian-based Node image. The step installs Chromium and the CLI, then runs a single English objective in headless mode with a two-minute ceiling. There are no explicit assertions in the YAML: the objective *is* the assertion. If the agent cannot confirm the heading and the link, `browserbash run` exits non-zero and Bitbucket marks the step red. Putting this under `pull-requests:` runs it on every PR, which is the pattern you want for a gate. `size: 2x` gives the browser headroom.

No model is pinned here, so `auto` resolves whatever the environment offers. On a runner with an API key in the environment that is the hosted model. Pin it explicitly the moment you care about reproducibility, which we do next.

## Machine-readable output with `--agent`

For a real pipeline, prose output is the wrong shape. The `--agent` flag switches BrowserBash to NDJSON, one JSON object per line, so anything downstream can parse it without guessing at sentence structure.

```bash
browserbash run "Log in as $TEST_USER and confirm the dashboard loads" \
  --agent \
  --headless \
  --model claude-opus-4-8 \
  --timeout 180
```

Each step emits an object such as `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a single terminal line: `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. The `final_state` carries any structured values the agent extracted (an order number, a displayed plan name, a balance) which you can pull out for later steps.

Two reasons `--agent` matters in Bitbucket specifically. First, the pipeline log renders cleanly, and you can post-process the NDJSON in a later command to surface a one-line summary. Second, if you later feed these tests to an AI coding agent or a bot that opens PRs, NDJSON is parseable without prose heuristics, which is exactly why agent mode exists. The model is pinned to `claude-opus-4-8` here so every pipeline run reasons with the same backend. Swap in `--model ollama/qwen3` on a self-hosted runner. For the broader picture of why CLI tests belong in CI, see [headless CLI browser tests in CI](https://browserbash.com/blog/headless-cli-browser-tests-in-ci).

## Exit-code gating: the part that actually decides pass/fail

This is the core of running AI browser tests in Bitbucket Pipelines well, so it is worth being precise. BrowserBash returns four exit codes:

- `0` is passed
- `1` is failed (the agent ran but the objective was not met)
- `2` is error (something broke: bad flag, no model reachable, Chrome would not start)
- `3` is timeout (the run exceeded `--timeout`)

Bitbucket's default behavior is binary: `0` is green, non-zero fails the step. For many gates that is all you need, any non-zero result blocks the merge. But the distinction between `1` (a genuine test failure) and `2`/`3` (infrastructure trouble) is useful, and because a Bitbucket step is just shell, you act on it with a tiny wrapper.

Say you want a real assertion failure to hard-fail the step, but a timeout to warn and pass while you tune model and timeout settings. Bitbucket has no built-in per-exit-code policy the way some CI systems do, so you capture the code in the script and decide:

```bash
- |
  set +e
  browserbash run "Add the first product to cart and reach the payment step" \
    --agent --headless --timeout 240
  code=$?
  set -e
  if [ "$code" -eq 3 ]; then
    echo "Timeout (exit 3): warning, not blocking while we tune."
    exit 0
  fi
  exit $code
```

Now exit `3` (timeout) is swallowed into a pass with a printed warning, while exit `1` or `2` still propagates and fails the step. This explicit handling is the Bitbucket equivalent of the exit-code policies you find in other runners. If you want the full breakdown of what each code means and how to branch on them, the [exit codes in CI tutorial](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial) goes deep.

For transient flakiness, Bitbucket lets you retry an entire failed step from the UI, and you can also wrap the run in a small shell retry loop if a one-off agent stumble is common on a given flow. Do not reach for retries to paper over a model that is simply too small for the flow. Fix the model first.

## Recording artifacts: video, screenshots, and traces

When a browser step fails in CI, "it failed" is not a debuggable statement. `--record` captures a screenshot and a `.webm` session video using a bundled ffmpeg, and on the builtin engine it also writes a native Playwright trace. Declare those paths as Bitbucket artifacts and every failure comes with a replay.

```bash
- step:
    name: Recorded e2e
    size: 2x
    script:
      - apt-get update && apt-get install -y chromium
      - npm install -g browserbash-cli
      - >
        browserbash run "Sign in and verify the welcome banner shows the
        user's name" --agent --headless --record --timeout 180
    artifacts:
      - "**/*.webm"
      - "**/*.png"
      - "Result.md"
```

A detail unique to Bitbucket: artifacts are uploaded whether the step passes or fails, so you do not need a special "upload on failure" flag the way some CI systems require. The run you most want to watch, the failed one, is captured automatically. Bitbucket keeps artifacts for 14 days by default.

Every run is also kept on disk by BrowserBash at `~/.browserbash/runs` (secrets masked, capped at 200 entries), and a `Result.md` is written per run, so if you exec into a self-hosted runner you have local history independent of Bitbucket's artifact store. For a richer view during local development, `browserbash dashboard` serves a fully local dashboard with no account and no data leaving your machine. If you want a hosted view, `--upload` opts the run into the cloud dashboard, where free runs are kept 15 days.

## Committing tests as Markdown instead of inline strings

Inline objectives are fine for a smoke check, but real suites want to live in version control as readable, reviewable files. BrowserBash supports Markdown tests: `*_test.md` files where each list item is a step. They support `{{variables}}` templating, `@import` for composing shared flows, and secret-marked variables that get masked as `*****` in every log line.

A `login_test.md` might read:

```bash
# Log in as the QA user

1. Go to https://staging.example.com
2. Click Sign in
3. Enter {{username}} into the email field
4. Enter {{password secret}} into the password field
5. Click the Log in button
6. Confirm the page heading reads "Dashboard"
```

A larger `checkout_test.md` can compose it:

```bash
# Checkout happy path

@import ./login_test.md

1. Click on the first product in the catalog
2. Click Add to cart
3. Go to the cart and confirm it shows 1 item
4. Proceed to checkout and confirm the payment step loads
```

Then the pipeline runs the composed suite:

```bash
- step:
    name: Markdown suite
    size: 2x
    script:
      - apt-get update && apt-get install -y chromium
      - npm install -g browserbash-cli
      - >
        browserbash testmd run ./checkout_test.md
        --agent --headless --record --timeout 240
    artifacts:
      - "**/*.webm"
      - "Result.md"
```

This is the shape I would push most teams toward once they are past the proof of concept. A `checkout_test.md` that reads like a QA script sits in the repo, gets reviewed in pull requests like any other code, and the diff tells a reviewer exactly what behavior changed. The masking matters in CI: a `{{password secret}}` variable never lands in the pipeline log in plain text. The [learn hub](https://browserbash.com/learn) goes deeper on writing maintainable Markdown tests.

## Handling secrets the Bitbucket way

Anything sensitive (API keys, test logins) belongs in Bitbucket's repository variables, marked **Secured**, and referenced as environment variables in your step. Never hardcode a key in `bitbucket-pipelines.yml`. The file is in the repo and visible to everyone with read access.

```bash
- step:
    name: Login test
    size: 2x
    script:
      - apt-get update && apt-get install -y chromium
      - npm install -g browserbash-cli
      - >
        browserbash testmd run ./login_test.md
        --agent --headless
        --var username=$QA_USERNAME --var password=$QA_PASSWORD
```

Two layers of protection stack here. Bitbucket masks the Secured variable in its own pipeline log, and BrowserBash masks any secret-marked Markdown variable as `*****` in its output and run store. Use both. If you are on a hosted model, the model API key (`$ANTHROPIC_API_KEY`, `$OPENROUTER_API_KEY`) is just another Secured variable. Set it once at the repository or workspace level and every step inherits it. On a self-hosted Ollama runner there is no key to manage at all.

## Where the browser runs: providers for Bitbucket

The default provider is `local`, Chrome on the runner itself. That is the right default for most pipelines: fast, free, no external dependency. But `--provider` opens other options when you need them:

- `cdp`: point at any DevTools endpoint with `--cdp-endpoint ws://...`. Useful if you run a shared headless Chrome service and want steps to attach rather than each launching their own.
- `browserbase`: a hosted browser.
- `lambdatest` / `browserstack`: cross-browser grids (each needs its own credentials; both auto-switch to the builtin engine).

For a straightforward Bitbucket gate, stay on `local` and `--headless`. Reach for `cdp` when you want to centralize the browser, or a hosted grid when you genuinely need a browser or OS your runners do not have. Do not add a provider for its own sake. Every external dependency is one more thing that can make a green test go red for reasons unrelated to your app.

## Putting it together: a complete pipeline

Here is a fuller `bitbucket-pipelines.yml` that combines the pieces: a pinned model, agent output, recorded artifacts, exit-code-aware gating, and the Markdown suite. It runs on pull requests and on pushes to `main`.

```bash
image: node:20-bookworm

definitions:
  steps:
    - step: &browser-e2e
        name: AI browser e2e
        size: 2x
        script:
          - apt-get update && apt-get install -y chromium
          - npm install -g browserbash-cli
          - |
            set +e
            browserbash testmd run ./smoke_test.md \
              --agent --headless --record \
              --model claude-opus-4-8 --timeout 240
            code=$?
            set -e
            if [ "$code" -eq 3 ]; then
              echo "Timeout (exit 3): warning, not blocking."
              exit 0
            fi
            exit $code
        artifacts:
          - "**/*.webm"
          - "**/*.png"
          - "Result.md"

pipelines:
  pull-requests:
    '**':
      - step: *browser-e2e
  branches:
    main:
      - step: *browser-e2e
```

Read it as a contract. On every PR and every push to `main`, Bitbucket spins a clean Node image, installs Chromium and the CLI, runs the committed Markdown suite headless with video recording, and reasons with a pinned hosted model so results are reproducible. A genuine failure (exit `1`) or an error (exit `2`) fails the pipeline. A timeout (exit `3`) prints a warning and passes while you tune. Failures upload video, screenshots, and a `Result.md` you can read without leaving Bitbucket. The `definitions` anchor keeps the step defined once and reused for both triggers. That is a gate you can actually trust to block a bad merge.

## Honest limits: where this struggles in Bitbucket

No tool is free of failure modes, and pretending otherwise gets you a worse gate than the one you replaced.

**Cloud runners have no GPU and a tight memory budget.** Bitbucket's hosted runners are not built for local LLM inference. On cloud, you are effectively committed to a hosted model API key, which means per-token cost and a network dependency on every run. Local Ollama only makes sense on self-hosted Bitbucket runners with real hardware.

**The agent is non-deterministic.** The same English objective can take a slightly different path run to run. That is great for surviving UI churn and annoying when you are trying to reproduce a one-off failure. Keep objectives narrow and unambiguous, pin a model, and capture `--record` artifacts so a failure is inspectable instead of a mystery.

**Latency is real.** Each step is a model call, so an AI run is slower than a hard-coded Playwright assertion. For a smoke check this is fine. For a thousand-case regression matrix on every commit, the wall-clock and token cost add up. Use AI tests for the broad, frequently-shifting surface area, not for tight loops where exactness and speed are the whole point.

**No native integrations.** BrowserBash emits the signal (exit code, NDJSON, `Result.md`, recorded artifacts). It does not post to Slack, open a Jira ticket, or comment on a PR by itself. You wire those alongside it: parse the NDJSON in a later script command and call your webhook, or use Bitbucket's own notification features. The tool produces the verdict; the plumbing to route it is yours, which is the honest shape of any CLI-in-CI integration.

**Build minutes are finite.** Bitbucket bills pipeline minutes. A `2x` step with a hosted model on every PR consumes both build minutes and model tokens. Scope the suite to the flows that matter and let a smaller deterministic suite cover the stable, high-frequency assertions.

## When this approach is the right fit, and when it is not

**Reach for AI browser tests in Bitbucket Pipelines when:** your UI changes often enough that selector maintenance is a real tax; you want non-engineers to read and review the test intent; you are adding smoke and happy-path coverage fast; or you want CI to verify a flow an AI coding agent just changed, where NDJSON output feeds straight back to the agent.

**Stick with deterministic Playwright or Cypress when:** you need pixel-exact, byte-exact assertions that must never drift; you are testing tight performance budgets where every millisecond of agent reasoning is noise; or you have a mature, stable suite that already runs fast and green. For a checkout flow that has not changed its DOM in two years, a plain Playwright test is cheaper to run and reason about.

The pragmatic answer for most teams is both: AI browser tests for the broad, frequently-shifting surface area, and a small core of deterministic tests for the handful of flows where exactness is the whole point. BrowserBash is free and open-source (Apache-2.0), so adding it to a pipeline costs nothing to try, and on a self-hosted Ollama runner there is no model bill either. The same wiring applies across CI systems, so if your team also runs GitLab, the [GitLab CI guide](https://browserbash.com/blog/browser-tests-in-gitlab-ci) mirrors this exact pattern with `.gitlab-ci.yml`.

## FAQ

### How do I run headless browser tests in Bitbucket Pipelines?

Use a Node Docker image, install `browserbash-cli` and Chromium in the step's `script:` block, and call `browserbash run "<objective>" --headless`. The `--headless` flag is required because pipeline containers have no display. The process exit code becomes the step's pass/fail status, so you do not write explicit assertions in the YAML: the English objective is the assertion. Add `size: 2x` to give Chrome enough memory.

### How does Bitbucket know if my browser test passed or failed?

It reads the process exit code of the last command in the step. BrowserBash returns 0 for passed, 1 for a failed objective, 2 for an error, and 3 for a timeout. Bitbucket marks the step green on 0 and red on anything non-zero. If you want to treat specific codes differently, for example let a timeout warn instead of block, capture the code in the shell (`code=$?`) and branch on it, then `exit` with the value you want Bitbucket to see.

### Can I save a video of a failed browser test in Bitbucket?

Yes. Add `--record` to the run, which captures a screenshot and a `.webm` session video (and a native Playwright trace on the builtin engine). Then declare an `artifacts:` list in the step naming `**/*.webm`, `**/*.png`, and `Result.md`. Bitbucket uploads artifacts whether the step passes or fails, so the failed run you most want to inspect is captured automatically, with no special "on failure" flag needed.

### Do I need an API key to run AI browser tests in Bitbucket Pipelines?

On Bitbucket's cloud runners, practically yes, because they have no GPU for local inference. Store the key as a Secured repository variable (Claude via `ANTHROPIC_API_KEY`, or OpenRouter via `OPENROUTER_API_KEY`, which has free models). Only on a self-hosted Bitbucket runner with real hardware does local Ollama make sense, where it runs free with no key and nothing leaves the machine. Note that very small local models (8B and under) are flaky on long multi-step flows, so use a 70B-class local model or a capable hosted one for hard objectives.

---

Ready to gate your pipeline on real browser behavior instead of brittle selectors? Install the CLI and add a step today:

```bash
npm install -g browserbash-cli
```

It is free and open-source, no account required to run.
