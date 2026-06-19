---
title: Headless CLI Browser Tests in CI: One Flag, A Clean Exit Code
description: "A practical guide to headless cli browser testing ci: run plain-English checks in GitHub Actions, GitLab, and Jenkins, and gate deploys on the exit code."
date: 2026-05-15
category: ci
---

The thing that makes a browser test useful in a pipeline isn't the assertion library or the reporter. It's the exit code. Your CI runner doesn't care how clever your selectors are; it cares whether the process returned `0` or not. Headless cli browser testing ci comes down to two requirements that sound trivial and trip up half the teams who try it: the browser has to run without a display, and the command has to exit non-zero when the check fails so the deploy stops. Get those two things right and you have a quality gate. Get either one wrong and you have a job that goes green while production is on fire.

This guide is about wiring plain-English browser checks into GitHub Actions, GitLab CI, and Jenkins with [BrowserBash](https://browserbash.com/features), running them headless, and gating the deploy on the exit code instead of scraping logs. You write an objective in English, an AI agent drives a real Chrome browser through it step by step, and the process exit status tells the pipeline pass or fail. No selectors to maintain, no page objects to refactor when the markup shifts.

## Why headless is the default in CI, and why people still get it wrong

A CI runner is a Linux box with no monitor. There is no window server, no `$DISPLAY`, nothing to draw pixels onto. So any browser you launch has to run headless — meaning the browser engine renders the page in memory and never tries to open a visible window. This is not an exotic mode. Modern Chrome has shipped `--headless=new` (a real Chrome instance without a window, default since Chrome 112) precisely so that headless behavior matches what a user sees in a headed browser. Tools like Playwright launch headless by default for the same reason.

So where does it go wrong? Three places, every time.

**The browser tries to open a window and the job hangs or crashes.** If your tool defaults to headed and you forget the flag, the process either errors out looking for a display or sits waiting forever until the job times out. On older setups people reached for `Xvfb` to fake a virtual display. With current headless Chrome on a GitHub Actions `ubuntu-latest` runner you generally don't need a framebuffer at all — headless runs natively. Reaching for Xvfb is usually a sign something else is misconfigured.

**The test passes locally and fails in CI for reasons unrelated to your app.** Headless rendering, fonts, viewport, and timing differ subtly from your laptop, so a check that depends on a specific pixel or a fast network can be green at your desk and red on the runner. Plain-English checks driven by an AI agent are more forgiving here than coordinate-based scripts, because the agent reasons about what's on the page rather than where it is — but validate the behavior, not the geometry.

**The job goes green even though the check failed.** This is the dangerous one. If your test framework writes "FAILED" to stdout but the wrapping shell command still exits `0`, your pipeline merrily promotes a broken build. Exit codes are the contract. Everything in this article exists to honor that contract.

With BrowserBash, headless is one flag:

```bash
browserbash run "Go to https://app.example.com, sign in with the demo account, and confirm the dashboard shows today's revenue widget" --headless
```

That command launches a real Chrome with no window, drives the objective, and exits `0` on pass or non-zero on fail. That's the whole shape of headless cli browser testing ci in one line.

## The exit-code contract: 0, 1, 2, 3

A browser check is only a gate if the runner can read its verdict mechanically. BrowserBash defines four exit codes, and they map cleanly onto the decisions a pipeline needs to make:

| Exit code | Meaning | What CI should do |
|-----------|---------|-------------------|
| `0` | passed | continue the pipeline, allow the deploy |
| `1` | failed | the agent reached a verdict and the objective did not hold — block the deploy |
| `2` | error | something broke before a verdict (bad config, missing model, crash) — block and investigate |
| `3` | timeout | the run exceeded `--timeout` — block, and look at whether the objective is too long or the app is slow |

The distinction between `1`, `2`, and `3` matters more than it looks. A `1` is a real product failure — the login broke, the widget is missing, the price is wrong. A `2` usually means your environment is misconfigured: no model resolved, a missing API key, Chrome not installed. A `3` means the run didn't finish in time. If you treat all non-zero codes identically you'll waste hours debugging "test failures" that were really a missing environment variable. Most pipelines should fail the build on any non-zero code, but route the alert differently: a `1` pings the app team, a `2` or `3` pings whoever owns the CI config.

Because the verdict lives in the exit code, you never parse prose to decide pass or fail. That's the headline difference from screen-scraping a human-readable report. If you want machine-readable detail alongside the exit code — for a dashboard, a Slack message, an AI coding agent reading the result — add `--agent` and BrowserBash emits NDJSON, one JSON object per line:

```bash
browserbash run "Add a product to the cart and verify the cart count increments to 1" --headless --agent
```

Each step emits an event like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal `{"type":"run_end","status":"passed","summary":"...","duration_ms":...}` line. Your pipeline can still gate on the exit code and separately tee the NDJSON into an artifact for triage. There's more on the structured-output design in the post on [AI agents driving browsers with NDJSON](https://browserbash.com/blog).

## GitHub Actions: the minimal gate

Here's the smallest workflow that actually gates a deploy on a headless browser check. The `ubuntu-latest` runner ships Node and Chrome, so you install the CLI, run the check headless, and let the job's own exit status decide whether the deploy step runs.

```bash
# .github/workflows/smoke.yml is YAML, but the commands inside are these:
npm install -g browserbash-cli
browserbash run "Open https://staging.example.com, accept cookies, and confirm the hero headline reads 'Ship faster'" --headless --timeout 90
```

In YAML form, the structure is straightforward. A `test` job runs the BrowserBash command; a `deploy` job declares `needs: test`. If the browser check exits non-zero, the `test` job fails, `deploy` never starts, and nothing ships. You did not write a single `if` to check a log. The runner did the gating for you because the command honored the exit-code contract.

A few specifics worth getting right on GitHub Actions:

- **Pin the timeout.** `--timeout 90` (seconds) caps each run so a hung agent surfaces as exit code `3` instead of burning your job-level minutes. Set it slightly above the slowest legitimate run you've observed.
- **Pick your model deliberately.** By default BrowserBash uses `auto`: it resolves a local Ollama model first (free, no keys, nothing leaves the runner), then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. On a stock GitHub runner there's no Ollama, so you'll typically supply a hosted key as a repository secret. More on that trade-off below.
- **Capture artifacts on failure.** Add `--record` and BrowserBash writes a screenshot plus a `.webm` session video via bundled ffmpeg. Upload them with `actions/upload-artifact` so a red build comes with a video of exactly what the agent saw.

The matrix pattern — running the same objective across several browsers or shards in parallel — layers on top of this cleanly, and there's a dedicated walkthrough in the guide on [GitHub Actions matrix cross-browser AI tests](https://browserbash.com/tutorials) if you need it.

## GitLab CI: stages as gates

GitLab's mental model is even closer to what we want, because stages are gates by construction. Jobs in a later stage don't run unless every job in the earlier stage succeeded — and "succeeded" means exit code `0`. So a headless browser check in a `test` stage automatically gates a `deploy` stage.

The job body is the same three lines you'd run anywhere:

```bash
npm install -g browserbash-cli
browserbash run "Sign in at https://staging.example.com/login with \$DEMO_USER / \$DEMO_PASS and verify the account menu shows the user's name" --headless --agent --timeout 120
```

In `.gitlab-ci.yml`, that lives in a job assigned to `stage: test`, with your deploy job in `stage: deploy`. GitLab masks variables marked as masked in the UI, and BrowserBash separately masks any secret-marked values in its own logs as `*****`, so credentials don't leak into the job output on either layer. Store `DEMO_USER` and `DEMO_PASS` as masked CI/CD variables and reference them in the objective.

If you run GitLab on a self-hosted runner using a Docker executor, the one thing to verify is that Chrome is present in the image (the local provider needs it). A Node 18+ base image plus Chrome is enough. There's a full container-focused treatment in the post on [dockerized AI browser tests](https://browserbash.com/blog) covering the image layers and the headless flags for sandboxed environments.

The payoff is the same as GitHub: you didn't write logic to interpret a verdict. You put a command in the `test` stage that exits non-zero on failure, and GitLab's stage ordering turns that into a deploy gate. A deeper end-to-end setup lives in the guide on [integrating AI browser tests into GitLab CI](https://browserbash.com/tutorials).

## Jenkins: declarative stages and the exit status

Jenkins predates most of this tooling, and that's fine — it has always understood exit codes. In a declarative `Jenkinsfile`, a `sh` step that returns non-zero fails the stage, and a failed stage fails the build. So the pattern is identical in spirit: a `Test` stage runs the headless check, and a `Deploy` stage guarded by `when { expression { currentBuild.result == null } }` (or simply ordered after `Test`) only runs if the check passed.

On a Jenkins agent the commands are unchanged:

```bash
npm install -g browserbash-cli
browserbash run "Go to the checkout page, apply coupon SAVE10, and confirm the order total drops by 10 percent" --headless --record --timeout 150
```

Two Jenkins-specific notes. First, `--record` is especially valuable here because Jenkins' console log is verbose and hard to skim; archiving the `.webm` and screenshot as build artifacts gives reviewers a watchable record of the failure. With the builtin engine, `--record` also writes a Playwright trace you can open in the trace viewer. Second, make sure the agent has Node 18+ and Chrome installed once, rather than reinstalling per build — `npm install -g browserbash-cli` is fast but Chrome provisioning isn't something you want on the hot path of every run.

There's a complete declarative `Jenkinsfile` — stages, artifact archiving, exit-code gating — in the dedicated post on [AI browser tests in a Jenkins pipeline](https://browserbash.com/blog). The short version: Jenkins reads the same exit-code contract every other runner reads, so the gate behaves identically.

## Choosing a model for CI: local, hosted, or both

This is the decision that quietly determines whether your headless checks are reliable and what they cost. BrowserBash is Ollama-first by design, and the `auto` resolver makes the trade-off explicit.

**Local models (Ollama).** When a local Ollama model is reachable, BrowserBash uses it, nothing leaves the machine, and the model bill is exactly `$0`. This is genuinely appealing for CI on self-hosted runners where you control the host and can keep a model warm. The honest caveat: very small local models (8B parameters and under) are flaky on long, multi-step objectives. They'll handle "open the page and check the headline" but drift on "log in, navigate three menus, apply a filter, and verify the export." The sweet spot for local is a mid-size model — Qwen3 or a Llama 3.3 70B-class model — which needs real hardware. On a self-hosted runner with a capable host, that's a strong setup. On an ephemeral cloud runner that spins up fresh every build, hosting and warming a 70B model usually isn't worth it.

**Hosted models.** For hard, long flows on ephemeral runners, a capable hosted model is the pragmatic choice. Pin it with `--model claude-opus-4-8` (needs `ANTHROPIC_API_KEY`) or use an OpenAI or Gemini backend through the Stagehand engine. You pay per run and your page content goes to the provider, but the reliability on multi-step objectives is the reason this option exists.

| Setup | Best for | Model bill | Watch out for |
|-------|----------|-----------|---------------|
| Local Ollama, mid-size model (Qwen3 / Llama 3.3 70B-class) | Self-hosted runners you control | $0 | Needs real hardware; keep the model warm |
| Local Ollama, small model (≤8B) | Short, simple checks only | $0 | Flaky on long multi-step objectives |
| Hosted (Claude / GPT / Gemini) | Hard flows on ephemeral cloud runners | per-run API cost | Keys in CI secrets; page content leaves the machine |

A reasonable real-world pattern: a self-hosted runner pool with a warm mid-size local model for the bulk of your smoke checks, and a hosted key reserved for the handful of long, gnarly journeys where reliability matters most. You can pin the model per command, so this is a per-objective decision, not a global one. The full backend matrix is on the [pricing page](https://browserbash.com/pricing), which is worth a look precisely because the local path has no per-run charge at all.

## Engines and providers: where the browser actually runs

Two more knobs affect CI behavior, and it's worth knowing them so you don't fight the defaults.

The **engine** is who interprets your English. The default is `stagehand` (MIT, by Browserbase) with self-healing act/extract/observe primitives. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright, auto-selected for LambdaTest and BrowserStack, which also writes a Playwright trace under `--record`. Switch with `--engine builtin` if you want that trace artifact; for most CI smoke checks the default is fine.

The **provider** is where the browser runs, via `--provider`: `local` (default, the runner's own Chrome) for the GitHub/GitLab/Jenkins patterns above; `cdp` to attach to any DevTools endpoint with `--cdp-endpoint ws://...`; and `browserbase`, `lambdatest`, or `browserstack` to run on a cloud grid (each needs its credentials; LambdaTest and BrowserStack auto-switch to the builtin engine).

For the question this article is really about — headless checks that gate a deploy — `--provider local --headless` is the answer in the overwhelming majority of cases. The grid providers matter when you need browsers or OS versions the runner can't supply. There's a one-flag cross-grid walkthrough in the post on running the [same objective across providers](https://browserbash.com/blog) if you outgrow the local runner.

## Markdown tests: committing checks next to your code

Running one objective from the command line is great for a smoke gate, but real suites want to live in version control and be reviewed like any other code. BrowserBash supports committable markdown tests — files named `*_test.md` where each list item is a step. They support `{{variables}}` templating, `@import` composition for shared setup, and secret-marked variables that are masked as `*****` in every log line. After each run, BrowserBash writes a human-readable `Result.md`.

You run a markdown suite in CI exactly like a single objective, and it honors the same exit-code contract:

```bash
browserbash testmd run ./checkout_test.md --headless --timeout 180
```

This is the form to reach for once you have more than two or three checks. A `checkout_test.md` reads like a checklist a product manager could review, diffs cleanly in pull requests, and `@import` lets you share a login step across every suite without copy-paste. The exit code still gates the deploy; the markdown is just a more maintainable way to express the steps than a long shell one-liner. The [Learn section](https://browserbash.com/learn) covers the templating and import mechanics in detail.

## Artifacts and triage: making a red build actionable

A gate that fails without telling you why is a gate people learn to ignore and eventually `|| true` into uselessness. The fix is artifacts.

- **`--record`** writes a screenshot and a `.webm` session video (bundled ffmpeg). With the builtin engine it also writes a Playwright trace. Archive these in your CI's artifact store and a failed run comes with a watchable replay.
- **`--agent` NDJSON** is your structured triage log. Tee it to a file and upload it; the per-step events show exactly which action the agent took before the verdict flipped to failed.
- **The run store.** Every run is kept on-disk at `~/.browserbash/runs` (secrets masked, capped at the most recent 200). On a self-hosted runner that persists between builds, this is a free local history you can inspect.
- **Local dashboard.** `browserbash dashboard` serves a fully local dashboard at `localhost:4477` — handy when you're reproducing a CI failure on your own machine and want to click through the run.

None of these require an account or send anything off the machine. If you do want a shared cloud view of CI runs, that's opt-in: `browserbash connect --key bb_...` links the cloud workspace, and only runs you explicitly mark with `--upload` are pushed (free cloud runs are kept 15 days). Without `--upload`, nothing leaves your runner — which matters when the pages under test contain customer data. You can read more on the [features page](https://browserbash.com/features) about what's local-only versus opt-in cloud.

## When this approach fits — and when it doesn't

Plain-English headless checks in CI are a strong fit when:

- You want **smoke and critical-path coverage** that survives UI refactors. Because there are no selectors, a renamed CSS class or a restructured DOM doesn't break the check.
- You're tired of **maintaining page objects** for tests whose whole job is to answer "does the happy path still work?"
- You need **a clean deploy gate** and care more about a reliable pass/fail signal than about millisecond-level performance assertions.
- Non-engineers — PMs, support, founders — should be able to **read and even write** the checks. A markdown `*_test.md` is reviewable by anyone.

It's a weaker fit when:

- You need **deterministic, sub-second unit-style assertions** on specific DOM nodes. A traditional framework like Playwright or Cypress with explicit locators is more precise and faster for that, and you should use it. Honestly, most teams want both: deterministic component and integration tests close to the code, plus a thin layer of English smoke checks for the end-to-end happy paths.
- Your flows are **long and gnarly and you're stuck on a tiny local model.** As noted, sub-8B local models drift on long objectives. Either move to a mid-size local model on capable hardware or pin a hosted model for those specific checks.
- You require **pixel-perfect visual regression** as the primary signal. That's a different tool category; an English verdict isn't the right instrument for "this button moved three pixels."

The pattern is additive. It doesn't replace your unit tests or your typed integration suite. It gives you a maintainable, refactor-proof gate for the user journeys that actually matter, expressed in a language the whole team can read. For more on where this sits relative to traditional automation, the [agentic testing explainer](https://browserbash.com/blog) lays out the boundaries, and the [case studies](https://browserbash.com/case-study) show concrete setups.

## A complete mental model

Strip everything else away and the recipe for headless cli browser testing ci is four moves:

1. **Install and run headless.** `npm install -g browserbash-cli`, then `browserbash run "<objective>" --headless`. One flag, no display server.
2. **Trust the exit code.** `0` passes, `1` is a product failure, `2` is a config error, `3` is a timeout. Fail the build on any non-zero; route the alert by code.
3. **Let the runner gate.** GitHub `needs:`, GitLab stages, and Jenkins ordered stages all turn a non-zero exit into a stopped deploy. You write no log-parsing logic.
4. **Capture artifacts.** `--record` for video and screenshots, `--agent` for NDJSON, the run store and local dashboard for history. A red build should always come with evidence.

That's it. The browser runs without a window, the command returns a verdict your pipeline already knows how to read, and a failing check stops the deploy on its own.

## FAQ

### How do I run a headless browser test in GitHub Actions?

Install the CLI with `npm install -g browserbash-cli` in a step, then run `browserbash run "<your objective>" --headless` in a `test` job. Make your `deploy` job declare `needs: test` so it only runs when the check passes. The `ubuntu-latest` runner already ships Node and Chrome, and headless Chrome runs there without a virtual display, so no Xvfb setup is needed in most cases.

### What exit codes does BrowserBash return, and how do I gate a deploy on them?

BrowserBash returns `0` for passed, `1` for failed, `2` for error, and `3` for timeout. Every major CI runner already treats a non-zero exit as a failed step, which stops later stages from running, so you gate a deploy simply by ordering the deploy after the test job. Fail the build on any non-zero code, but route alerts differently: a `1` is a real product failure, while a `2` or `3` usually points at CI configuration.

### Can I run headless AI browser tests in CI for free?

Yes, if you use a local Ollama model. When a local model is reachable, nothing leaves the machine and there is no per-run model charge at all. The practical caveat is that very small local models under 8B parameters are unreliable on long multi-step flows, so for free $0 runs you want a mid-size model on a self-hosted runner with real hardware, and a hosted model only for the hardest journeys.

### Do I need an account or to send my data to the cloud to use this in CI?

No. BrowserBash runs entirely on your machine by default, and nothing is uploaded unless you opt in. Linking a cloud workspace with `browserbash connect` and pushing a specific run with `--upload` is optional; without those flags, every run, its artifacts, and its masked secrets stay on the runner. That matters when the pages you test contain customer data.

Ready to wire it in? Install with `npm install -g browserbash-cli`, drop a `--headless` run into your pipeline, and let the exit code gate the deploy. No account required to start — and if you want the optional cloud view later, [sign up here](https://browserbash.com/sign-up).
