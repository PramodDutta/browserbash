---
title: Run AI browser tests in GitLab CI
description: "Run browser tests in GitLab CI with a clean .gitlab-ci.yml: --agent NDJSON, --headless Chrome, .webm artifacts, and exit-code pipeline gating."
date: 2026-04-17
category: ci
---

If you want browser tests in GitLab CI without inheriting a wall of selectors and page objects, the setup is shorter than most pipelines you already maintain. You write a plain-English objective, an AI agent drives a real Chrome browser through it, and the process exit code tells GitLab whether the job passed. That last part matters more than it sounds: GitLab CI is, at heart, a process runner. A job runs a shell command, the command returns a status, and the pipeline reacts. AI browser tests fit that model cleanly because the fragile part of UI automation — turning a shifting DOM into stable assertions — moves out of your `.gitlab-ci.yml` and into the agent.

This guide walks a working `.gitlab-ci.yml` end to end. I'll use BrowserBash as the runner because it was built for this exact shape: it runs `--headless`, emits machine-readable NDJSON under `--agent`, returns disciplined exit codes (0/1/2/3), and records a `.webm` video you can publish as a job artifact. The structural ideas — stages, headless Chrome, artifacts, exit-code gating — carry over to whatever tool you pick. Where GitLab itself behaves in a version-specific way, I'll say so instead of pretending every runner is identical.

## Why AI browser tests fit GitLab CI so well

GitLab pipelines are built around exit status. A job's `script:` block runs, the shell returns a code, and GitLab marks the job green on `0` and red on anything else (unless you opt into `allow_failure`). Traditional Selenium or Playwright suites bolt their own assertion framework on top of that, then translate failures back into a non-zero exit. It works, but the brittle layer — locators, waits, page objects — lives in your repo and breaks every time a designer renames a class.

An AI browser agent collapses that layer. You describe the outcome in English — "log in, open billing, confirm the plan reads Pro" — and the agent figures out the clicks. When the objective can't be satisfied, the process exits non-zero and GitLab fails the job. No `grep` over logs, no parsing test output to decide the verdict. That's the whole pitch for running browser tests in GitLab CI this way: the verdict is the exit code, and the exit code is the contract.

The honest tradeoff: an AI agent is non-deterministic in a way a hard-coded selector is not. You manage that with model choice, a sensible `--timeout`, retries on the job, and recorded artifacts so a flake is debuggable rather than a mystery. We'll wire all three.

## What you need on the runner

BrowserBash needs Node 18 or newer and a Chrome/Chromium binary for the default local provider. On a GitLab shared runner or your own runner, the cleanest path is a Docker executor with an image that already ships Node and Chrome. If you build your own image, install `browserbash-cli` globally and make sure Chrome is on `PATH`.

```bash
npm install -g browserbash-cli
browserbash --version
```

A few runner realities worth knowing before you copy a config:

- **Chrome needs `--no-sandbox` in most containers.** Running Chrome as root inside Docker without a sandbox flag is the single most common cause of a "Chrome crashed" job. BrowserBash handles the browser launch for you, but if you supply your own Chromium or run a hardened image, the sandbox is the first thing to check.
- **Headless is non-negotiable on a runner.** There's no display. Always pass `--headless`. If you ever need a virtual display for a tool that demands one, `xvfb-run` is the usual workaround — but with `--headless` you shouldn't need it.
- **A model has to be reachable.** This is the decision that shapes the rest of the pipeline, so it gets its own section.

## Choosing a model: local Ollama vs hosted

BrowserBash is Ollama-first. The default model is `auto`, resolved in this order: a local Ollama install (`ollama/<model>`, free, no keys, nothing leaves the machine), then `ANTHROPIC_API_KEY` (`claude-opus-4-8`), then `OPENAI_API_KEY` (`openai/gpt-4.1`), otherwise it errors with guidance. You can pin any of them explicitly with `--model`.

For a GitLab pipeline you're really choosing between two shapes:

| Approach | What runs the reasoning | Cost | Best for |
| --- | --- | --- | --- |
| Local Ollama on the runner | A model you host beside the job | $0 model bill, nothing leaves the runner | Privacy-sensitive flows, self-hosted runners with spare RAM/VRAM, high run volume |
| Hosted model via API key | Claude / OpenAI / others over the network | Per-token, billed to your provider | Hardest multi-step flows, shared runners with no GPU, lowest maintenance |

There's an honest caveat that decides this for a lot of teams. Very small local models (8B and under) are flaky on long multi-step objectives — they lose the thread halfway through a checkout flow. The sweet spot for local is a mid-size model in the Qwen3 / Llama 3.3 70B class, which needs real hardware. If your runners are modest GitLab shared runners with no GPU, a capable hosted model behind an API key will be steadier for hard flows. Pick based on your runner fleet, not on a vibe.

For local, store nothing secret — Ollama needs no key. For hosted, put the key in a **masked, protected CI/CD variable** (Settings → CI/CD → Variables), never in the YAML. We reference it as `$ANTHROPIC_API_KEY` below.

If you want to see the engine and model story in more depth, the [features page](https://browserbash.com/features) lays out engines, providers, and backends, and the [tutorials](https://browserbash.com/tutorials) walk through first runs.

## A first `.gitlab-ci.yml` that gates on exit code

Here's the smallest pipeline that does real work: install the CLI, run one headless objective, fail the job if the agent fails.

```bash
stages:
  - e2e

browser-smoke:
  stage: e2e
  image: node:20-bookworm
  before_script:
    - apt-get update && apt-get install -y chromium
    - npm install -g browserbash-cli
  script:
    - >
      browserbash run "Go to https://example.com, confirm the heading says
      Example Domain and the More information link is visible"
      --headless --timeout 120
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'
```

What's happening, line by line. The `before_script` installs Chromium and the CLI on a clean Debian-based Node image. The `script` runs a single English objective in headless mode with a two-minute ceiling. There are no explicit assertions in the YAML — the objective *is* the assertion. If the agent can't confirm the heading and the link, `browserbash run` exits non-zero and GitLab marks `browser-smoke` red. The `rules` block runs the job on merge requests and on `main`, which is the pattern you want for a gate.

No model is pinned here, so `auto` resolves whatever the environment offers. On a runner with an API key in the environment that's the hosted model; with Ollama installed it's local. Pin it explicitly the moment you care about reproducibility, which we'll do next.

## Machine-readable output with `--agent`

For a real pipeline, prose output is the wrong shape. The `--agent` flag switches BrowserBash to NDJSON — one JSON object per line — so anything downstream can parse it without guessing at sentence structure. Progress events look like this:

```bash
browserbash run "Log in as $TEST_USER and confirm the dashboard loads" \
  --agent \
  --headless \
  --model claude-opus-4-8 \
  --timeout 180
```

Each step emits an object such as `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a single terminal line: `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. The `final_state` carries any structured values the agent extracted — an order number, a displayed plan name, a balance — which you can pull out for later jobs.

Two reasons `--agent` matters in GitLab specifically. First, GitLab's job log renders cleanly and you can post-process the NDJSON in an `after_script` to surface a one-line summary in the UI. Second, if you later feed these tests to an AI coding agent or a bot that opens MRs, NDJSON is parseable without prose heuristics — which is exactly why agent mode exists. The model is pinned to `claude-opus-4-8` here so every pipeline run reasons with the same backend; swap in `--model ollama/qwen3` if you're self-hosting.

## Exit-code gating: the part that actually decides pass/fail

This is the core of running browser tests in GitLab CI well, so it's worth being precise. BrowserBash returns four exit codes:

- `0` — passed
- `1` — failed (the agent ran but the objective wasn't met)
- `2` — error (something broke: bad flag, no model reachable, Chrome wouldn't start)
- `3` — timeout (the run exceeded `--timeout`)

GitLab's default behavior is binary: `0` is green, non-zero is red. For many gates that's all you need — any non-zero result blocks the merge, full stop. But the distinction between `1` (a genuine test failure) and `2`/`3` (infrastructure trouble) is useful, and GitLab gives you `allow_failure: exit_codes:` to act on it.

Say you want a real assertion failure to hard-fail the pipeline, but a timeout to soft-fail with a warning while you tune model and timeout settings:

```bash
flaky-checkout:
  stage: e2e
  script:
    - browserbash run "Add the first product to cart and reach the payment step" --agent --headless --timeout 240
  allow_failure:
    exit_codes:
      - 3
```

Now exit `3` (timeout) marks the job as a yellow warning and lets the pipeline proceed, while exit `1` or `2` still fails it red. A note from the field: `allow_failure: exit_codes:` has had executor-specific quirks (PowerShell runners in particular have a reported issue where exit codes don't propagate as expected). On the standard Docker and shell executors on Linux it behaves as documented. If you're on Windows runners, test the propagation before you rely on it.

For transient flakiness, layer GitLab's `retry` on top — `retry: 2` re-runs the job up to twice on failure, which often clears a one-off agent stumble without a human looking. Don't reach for retries to paper over a model that's simply too small for the flow; fix the model first.

## Recording artifacts: video, screenshots, and traces

When a browser job fails in CI, "it failed" is not a debuggable statement. `--record` captures a screenshot and a `.webm` session video using a bundled ffmpeg, and on the builtin engine it also writes a Playwright trace. Publish those as GitLab artifacts and every failure comes with a replay.

```bash
e2e-recorded:
  stage: e2e
  script:
    - browserbash run "Sign in and verify the welcome banner shows the user's name" --agent --headless --record --timeout 180
  artifacts:
    when: always
    paths:
      - "**/*.webm"
      - "**/*.png"
    expire_in: 1 week
```

The detail that makes this work is `when: always`. By default GitLab only uploads artifacts on success, which is precisely backwards for debugging — the run you most want to watch is the one that failed. `when: always` uploads on pass or fail. `expire_in` keeps storage in check.

Every run is also kept on-disk by BrowserBash at `~/.browserbash/runs` (secrets masked, capped at 200 entries), so if you exec into a runner you have local history independent of GitLab's artifact store. For a richer view during local development, `browserbash dashboard` serves a fully local dashboard at `localhost:4477` with no account and no data leaving your machine.

## Committing tests as Markdown instead of inline strings

Inline objectives are fine for a smoke check, but real suites want to live in version control as readable, reviewable files. BrowserBash supports Markdown tests — `*_test.md` files where each list item is a step. They support `{{variables}}` templating, `@import` for composing shared flows, and secret-marked variables that get masked as `*****` in every log line. After each run a human-readable `Result.md` is written.

```bash
testmd-suite:
  stage: e2e
  script:
    - browserbash testmd run ./checkout_test.md --agent --headless --record
  artifacts:
    when: always
    paths:
      - "**/*.webm"
      - "Result.md"
    expire_in: 1 week
```

This is the shape I'd push most teams toward once they're past the proof of concept. A `checkout_test.md` that reads like a QA script sits in the repo, gets reviewed in merge requests like any other code, and the diff tells a reviewer exactly what behavior changed. The masking matters in CI: a `{{password secret}}` variable never lands in the job log in plain text. The [learn hub](https://browserbash.com/learn) goes deeper on writing maintainable Markdown tests, and there are worked examples on the [blog](https://browserbash.com/blog).

## Handling secrets the GitLab way

Anything sensitive — API keys, test logins — belongs in GitLab's CI/CD variables, marked **Masked** and **Protected**, and referenced as environment variables in your job. Never hardcode a key in `.gitlab-ci.yml`; the file is in the repo and visible to everyone with read access.

```bash
login-test:
  stage: e2e
  script:
    - browserbash run "Sign in with the provided credentials and confirm the account menu appears" --agent --headless
  variables:
    TEST_USER: $QA_USERNAME
    TEST_PASS: $QA_PASSWORD
```

Two layers of protection stack here. GitLab masks the variable in its own job log, and BrowserBash masks any secret-marked Markdown variable as `***** ` in its output and run store. Use both. If you're on a hosted model, the model API key (`$ANTHROPIC_API_KEY`, `$OPENAI_API_KEY`, etc.) is just another masked variable — set it once at the project or group level and every job inherits it. On local Ollama there's no key to manage at all, which is one quiet reason privacy-conscious teams lean local.

## Where the browser runs: providers for GitLab

The default provider is `local` — Chrome on the runner itself. That's the right default for most pipelines: fast, free, no external dependency. But `--provider` opens other options when you need them:

- `cdp` — point at any DevTools endpoint with `--cdp-endpoint ws://...`. Useful if you run a shared headless Chrome service and want jobs to attach to it rather than each launching their own.
- `browserbase` — a hosted browser (needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`).
- `lambdatest` / `browserstack` — cross-browser grids (each needs its own credentials; both auto-switch to the builtin engine).

For a straightforward GitLab gate, stay on `local` and `--headless`. Reach for `cdp` when you want to centralize the browser, or a hosted grid when you genuinely need a browser or OS your runners don't have. Don't add a provider for its own sake — every external dependency is one more thing that can make a green test go red for reasons unrelated to your app.

## Engines: stagehand vs builtin

Two engines interpret the English. The default is `stagehand` (MIT, by Browserbase) — act/extract/observe/agent primitives with self-healing behavior. The other is `builtin`, an in-repo Anthropic tool-use loop driving Playwright, which is auto-selected for LambdaTest and BrowserStack and which also writes a Playwright trace when you `--record`. Switch with `--engine stagehand|builtin`.

For most GitLab jobs the default stagehand engine is the right call. The one concrete reason to pick `builtin` explicitly is the Playwright trace artifact — if your team already lives in the Playwright trace viewer, that's a familiar debugging surface to publish alongside the `.webm`. Otherwise let the engine default and spend your attention on the objectives.

## Putting it together: a complete pipeline

Here's a fuller `.gitlab-ci.yml` that combines the pieces — a pinned model, agent output, recorded artifacts, exit-code-aware gating, and a retry for transient flakiness.

```bash
stages:
  - e2e

variables:
  CHROME_BIN: /usr/bin/chromium

browser-e2e:
  stage: e2e
  image: node:20-bookworm
  before_script:
    - apt-get update && apt-get install -y chromium
    - npm install -g browserbash-cli
  script:
    - browserbash testmd run ./smoke_test.md --agent --headless --record --model claude-opus-4-8 --timeout 240
  retry: 1
  allow_failure:
    exit_codes:
      - 3
  artifacts:
    when: always
    paths:
      - "**/*.webm"
      - "**/*.png"
      - "Result.md"
    expire_in: 1 week
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'
```

Read it as a contract. On every MR and every push to `main`, GitLab spins a clean Node image, installs Chromium and the CLI, runs the committed Markdown suite headless with video recording, and reasons with a pinned hosted model so results are reproducible. A genuine failure (exit `1`) or an error (exit `2`) fails the pipeline; a timeout (exit `3`) warns but doesn't block while you tune. Failures upload video, screenshots, and a `Result.md` you can read without leaving GitLab. One retry absorbs a single transient stumble. That's a gate you can actually trust to block a bad merge.

## When this approach is the right fit — and when it isn't

Be honest about the boundaries.

**Reach for AI browser tests in GitLab CI when:** your UI changes often enough that selector maintenance is a real tax; you want non-engineers to read and review the test intent; you're adding smoke and happy-path coverage fast; or you want CI to verify a flow an AI coding agent just changed, where NDJSON output feeds straight back to the agent.

**Stick with deterministic Playwright or Cypress when:** you need pixel-exact, byte-exact assertions that must never drift; you're testing tight performance budgets where every millisecond of agent reasoning is noise; or you have a mature, stable suite that already runs fast and green. An AI agent adds latency and a sliver of non-determinism that a hard-coded selector doesn't have. For a checkout flow that hasn't changed its DOM in two years, a plain Playwright test is cheaper to run and reason about.

The pragmatic answer for most teams is both: AI browser tests for the broad, frequently-shifting surface area, and a small core of deterministic tests for the handful of flows where exactness is the whole point. BrowserBash is free and open-source (Apache-2.0), so adding it to a pipeline costs nothing to try, and on local Ollama there's no model bill either — see the [pricing page](https://browserbash.com/pricing) and a [case study](https://browserbash.com/case-study) for how that plays out in practice.

## FAQ

### How do I run headless browser tests in GitLab CI?

Install `browserbash-cli` in your job's `before_script`, make sure Chrome or Chromium is on the runner, and call `browserbash run "<objective>" --headless` in the `script` block. The `--headless` flag is required because runners have no display. The process exit code becomes the job's pass/fail status, so you don't need to write explicit assertions in the YAML — the English objective is the assertion.

### How does GitLab CI know if my browser test passed or failed?

It reads the process exit code. BrowserBash returns 0 for passed, 1 for a failed objective, 2 for an error, and 3 for a timeout. GitLab marks the job green on 0 and red on anything non-zero by default. If you want to treat specific codes differently — for example, let a timeout warn instead of block — use `allow_failure: exit_codes:` in the job to soft-fail only that code while real failures still fail the pipeline.

### Can I save a video of a failed browser test as a GitLab artifact?

Yes. Add `--record` to the run, which captures a screenshot and a `.webm` session video (and a Playwright trace on the builtin engine). Then declare an `artifacts:` block with `when: always` so GitLab uploads the files even when the job fails, listing `**/*.webm` and `**/*.png` in `paths`. The `when: always` part is the key detail, since GitLab only uploads on success by default.

### Do I need an API key to run AI browser tests in a pipeline?

Not necessarily. BrowserBash is Ollama-first, so if your runner has a local Ollama model installed, it runs free with no key and nothing leaves the machine. If you'd rather use a hosted model like Claude or OpenAI, set the API key as a masked, protected CI/CD variable and the job will pick it up. Be aware that very small local models (8B and under) tend to be flaky on long multi-step flows, so for hard objectives use a mid-size local model or a capable hosted one.

---

Ready to gate your pipeline on real browser behavior instead of brittle selectors? Install the CLI and add a job today:

```bash
npm install -g browserbash-cli
```

It's free and open-source, no account required to run — and if you want the optional cloud dashboard later, you can [sign up](https://browserbash.com/sign-up) when it's useful, not before.
