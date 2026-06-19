---
title: Run BrowserBash in GitHub Actions
description: "Browser automation in GitHub Actions with BrowserBash: a full workflow YAML covering install, --agent --headless, exit-code gating, and artifact upload."
date: 2026-03-20
category: tutorial
---

By the end of this tutorial you will have a working GitHub Actions job that runs **browser automation in GitHub Actions** with BrowserBash on every push — installs the CLI, drives a real headless Chromium through a plain-English objective, and fails the build on a red verdict using the process exit code instead of grepping logs. You'll also collect screenshots, a session video, and the raw NDJSON stream as build artifacts so a failed run is debuggable from the Actions tab without re-running anything locally.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective in English, an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and you get a verdict plus structured extracted values. The reason it slots cleanly into CI is the same reason it's pleasant on your laptop: the result is the exit code, and `--agent` emits one JSON object per line that a runner can read without parsing prose. We'll lean on both. Let's build the workflow piece by piece, run it, and harden it.

## What you'll need

- **Node.js 18 or newer** on the runner. GitHub's `ubuntu-latest` ships a recent Node, but we'll pin it explicitly with `actions/setup-node` so the job is reproducible. Locally, check with `node -v`.
- **A browser on the runner.** BrowserBash's default `local` provider drives the machine's own Chrome/Chromium. On `ubuntu-latest` you install one in the workflow (we use Playwright's Chromium download because it's a one-liner that pulls the OS libraries too).
- **The CLI**, installed in the job:

```bash
npm install -g browserbash-cli
```

- **A model.** This is the one real decision. On your laptop the free local path (Ollama) is the default and nothing leaves your machine. But GitHub-hosted runners have no GPU and no Ollama daemon, so for a hosted CI run you'll either (a) point at a hosted model via an API key stored as a repo secret, or (b) run your own GPU runner with Ollama. We'll wire the hosted-key path because it's what most teams ship first, and call out the self-hosted-Ollama alternative where it matters.
- **A GitHub repository** you can push a `.github/workflows/` file to, and permission to add an Actions secret.

Confirm the CLI works locally before you commit anything:

```bash
browserbash --version
```

You should see `1.3.1`. If the command isn't found, your global npm bin directory isn't on `PATH` — fix that locally, but note it won't bite you on the runner because we install fresh there.

## Step 1 — Get one run green on your laptop first

Never debug a flow for the first time inside CI. Logs are slower, the feedback loop is minutes not seconds, and you can't see the browser. Get the objective passing locally, then lift the exact command into the workflow.

Run a tiny smoke check against a public page:

```bash
browserbash run "Go to https://example.com and confirm the page heading says 'Example Domain'" --headless
```

`--headless` matters because that's how it'll run in CI — no display server. The agent navigates, reads the page, and prints a human-readable verdict ending in something like `passed — heading text matched "Example Domain"`. The process exits `0`.

Now flip it to the machine-readable shape you'll actually use in the pipeline:

```bash
browserbash run "Go to https://example.com and confirm the page heading says 'Example Domain'" --agent --headless
```

With `--agent` you get NDJSON instead of prose — one JSON object per line. Progress lines look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"opened example.com"}`, and the final line is the terminal event:

```json
{"type":"run_end","status":"passed","summary":"heading matched","final_state":{"heading":"Example Domain"},"duration_ms":8421}
```

That `status` mirrors the exit code, which is the contract CI cares about. Check it:

```bash
echo $?
```

A `0` means passed. Hold onto that mental model — the whole pipeline gate is built on it.

### Exit codes you'll gate on

| Exit code | `run_end` status | Meaning | What CI should do |
|-----------|------------------|---------|-------------------|
| `0` | `passed` | The objective was met | Pass the job |
| `1` | `failed` | The agent finished but the verdict was negative | Fail the job |
| `2` | `error` | Something broke (bad provider key, browser launch failure, malformed objective) | Fail the job, surface the error |
| `3` | `timeout` | The run exceeded `--timeout` | Fail the job, likely raise the timeout or simplify |

The beauty of this is you don't write any parsing. `npm install`, then `browserbash run ... --agent --headless`, and the runner's own "did this step exit non-zero?" check does the gating for free. We'll still capture the NDJSON as an artifact so you can read *why* a `1` happened, but the pass/fail decision never depends on reading it.

## Step 2 — Pick the model the runner will use

Locally, `--model` defaults to `auto`, which resolves in order: a running local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, else an error telling you to configure one. On a GitHub-hosted runner there's no Ollama, so `auto` will fall through to whichever API key you've exposed as an environment variable.

The cleanest, most explicit setup: store a hosted key as a repo secret and let `auto` find it. Go to your repo's **Settings → Secrets and variables → Actions → New repository secret** and add, for example, `ANTHROPIC_API_KEY`. In the workflow you expose it as an env var on the step, and `auto` resolves to `claude-opus-4-8`.

Here's the table of model values you can pass to `--model` and what each needs. Use it to decide what to put in CI:

| `--model` value | Backend | Needs | Good for CI? |
|-----------------|---------|-------|--------------|
| `auto` (default) | Ollama → Anthropic → OpenAI | Whatever is available, in that order | Yes, with a key exposed |
| `ollama/<model>` (e.g. `ollama/qwen3`) | Local Ollama | A running Ollama daemon (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`) | Only on a self-hosted GPU runner |
| `claude-opus-4-8` | Anthropic | `ANTHROPIC_API_KEY` | Yes — strong on long flows |
| `openai/gpt-4.1` | OpenAI (via Stagehand) | `OPENAI_API_KEY` | Yes |
| `google/gemini-2.5-flash` | Google (via Stagehand) | Google API key | Yes |
| `openrouter/<vendor>/<model>` | OpenRouter | `OPENROUTER_API_KEY` | Yes — e.g. `openrouter/meta-llama/llama-3.3-70b-instruct` |

A blunt honesty note that will save you a flaky pipeline: very small local models (8B and under) are unreliable on long, multi-step objectives — they lose the plot halfway through a checkout flow. The sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. For CI specifically, a hosted model or a 70B-class model on a self-hosted runner is the dependable choice. Don't wire a 3B model into a gating job and then wonder why it's red on Tuesdays.

If you'd rather keep everything local and free, the alternative is a self-hosted GitHub runner with a GPU, Ollama installed, and a pulled model; then set `--model ollama/qwen3` (or your model) plus `OLLAMA_BASE_URL` in the job. That keeps your model bill at exactly $0 and nothing leaves your infrastructure. The [choosing-a-model walkthrough](https://browserbash.com/tutorials) goes deeper on this trade-off.

## Step 3 — Write the workflow YAML

Create `.github/workflows/browserbash.yml`. This is the full, copy-pasteable job — install, browser, the gating run, and artifacts. We'll walk through each block right after.

```yaml
name: browser-checks

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install a Chromium browser
        run: npx playwright install --with-deps chromium

      - name: Install BrowserBash
        run: npm install -g browserbash-cli

      - name: Run browser check (gates the build)
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          browserbash run "Go to https://example.com and confirm the page heading says 'Example Domain'" \
            --agent \
            --headless \
            --record \
            --timeout 120 \
            | tee browserbash-output.ndjson

      - name: Upload run artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: browserbash-run
          path: |
            browserbash-output.ndjson
            ~/.browserbash/runs/**
```

### Walking the blocks

**`on:`** — runs on pushes to `main`, on every pull request, and on a manual `workflow_dispatch` button. Trim to taste; a lot of teams gate only on PRs.

**`timeout-minutes: 15`** — a hard ceiling on the *job*. This is belt-and-suspenders alongside BrowserBash's own `--timeout`. If the runner itself wedges, GitHub kills it. The CLI's `--timeout 120` (seconds) bounds the agent run and produces a clean exit code `3` you can read; the job-level timeout is the backstop.

**Install a Chromium browser** — `npx playwright install --with-deps chromium` downloads a Chromium build and the Linux system libraries it needs. The `local` provider then drives it. This is the simplest way to get a working browser plus its dependencies on a clean Ubuntu runner in one line.

**Install BrowserBash** — global npm install, same command you ran locally. It's fast and cache-free here, which is fine for a smoke job.

**The gating run** — this is the heart of it. `--agent --headless` is the CI shape: NDJSON, no display. `--record` captures a screenshot and a `.webm` session video via the bundled ffmpeg (and on the builtin engine, a Playwright trace too) so a failure is inspectable. `--timeout 120` bounds the run. We pipe through `tee` so the NDJSON is both visible in the live log *and* saved to a file for the artifact step. Crucially, `tee` preserves the exit status of `browserbash` in a default-pipefail-aware way on GitHub's bash — but to be safe against pipe masking, see the troubleshooting note on `pipefail` below. When `browserbash` exits non-zero, the step fails, and the job fails. That's the entire gate. No `grep`, no `jq`, no parsing.

**Upload artifacts** — `if: always()` is the important flag: upload even when the run step failed, because a failed run is exactly when you want the video and NDJSON. The run store at `~/.browserbash/runs` holds every run on disk (secrets masked, capped at 200 runs), including the `--record` screenshots and `.webm`. We grab both that directory and the piped NDJSON file.

## Step 4 — Commit, push, and read the result

Commit the workflow and push:

```bash
git add .github/workflows/browserbash.yml
git commit -m "ci: add BrowserBash smoke check"
git push
```

Open the **Actions** tab, click the running `browser-checks` workflow, and watch the live log. In the "Run browser check" step you'll see the NDJSON stream in real time — `step` lines as the agent navigates and reads, then the `run_end` line with the verdict. A healthy run ends with `"status":"passed"` and a green check on the step.

Force a failure to prove the gate works. Change the assertion to something false:

```bash
browserbash run "Go to https://example.com and confirm the page heading says 'Hello World'" --agent --headless --record --timeout 120
```

The agent will navigate, read the real heading, and emit `{"type":"run_end","status":"failed","summary":"heading was 'Example Domain', expected 'Hello World'",...}`. The process exits `1`, the step goes red, and the job fails — without anyone writing a single line of log parsing. Download the `browserbash-run` artifact from the run summary and you'll find the NDJSON plus the screenshot and `.webm` showing exactly what the agent saw.

### Optional: commit the test instead of inlining it

Inlining a one-line objective in YAML is fine for a smoke check. For anything real, write a markdown test (`*_test.md`) and commit it — each list item is a step, you get `{{variables}}` templating and `@import` composition, secret-marked variables are masked as `*****` in every log line, and the run writes a human-readable `Result.md`. Then the CI step becomes:

```bash
browserbash testmd run ./checkout_test.md --agent --headless --timeout 180
```

Same gating, same artifacts, but the flow lives in your repo and reviews like code. The [markdown tests tutorial](https://browserbash.com/tutorials) covers the format end to end.

## Step 5 — Pass secrets safely

If your flow logs in, you need credentials on the runner without leaking them. Store them as Actions secrets, expose them as env vars on the step, and reference them in the objective. BrowserBash masks secret-marked variables as `*****` in every log line and in the on-disk run store, so they don't end up in your artifacts.

```yaml
      - name: Run authenticated check
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BB_USER: ${{ secrets.STAGING_USER }}
          BB_PASS: ${{ secrets.STAGING_PASS }}
        run: |
          browserbash testmd run ./login_test.md \
            --agent --headless --timeout 180 \
            | tee browserbash-output.ndjson
```

In the markdown test, reference `{{BB_USER}}` and `{{BB_PASS}}` and mark the password as secret so it's masked everywhere. The deeper pattern — including which variables to mark and how masking behaves across logs — is in the [variables and secrets guide](https://browserbash.com/learn).

## Troubleshooting

**The run step is green but the flow clearly failed.** Almost always a pipe masking the exit code. When you pipe `browserbash ... | tee file`, bash reports `tee`'s exit status, not BrowserBash's, unless `pipefail` is set. GitHub's default bash shell uses `set -eo pipefail` for `run:` blocks, so the real exit code propagates — but if you've overridden the shell or wrapped the command, add `set -o pipefail` at the top of the `run` block, or drop the pipe and use `--record` plus the run store for output. The gate is only trustworthy if the failing process's exit code reaches the runner.

**`error` exit code 2 with no clear browser output.** The model backend usually isn't configured. On a hosted runner, `--model auto` needs a key in the environment — confirm the secret name matches the env var (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`) and that the secret is actually populated. A secret that exists but is empty produces the same symptom. Pin the model explicitly with `--model claude-opus-4-8` to rule out `auto` resolution surprises.

**`--record` runs but there's no `.webm` video.** The `--record` flag uses a bundled ffmpeg to assemble the session video, and on a minimal runner the screenshot still lands but video can fail if the install step didn't pull the right libraries. Using `npx playwright install --with-deps chromium` (note `--with-deps`) installs the OS packages that ffmpeg and headless Chromium need. The screenshot in the run store is always there as a fallback.

**Timeouts (exit code 3) on flows that pass locally.** Hosted runners are slower than your laptop and have no GPU, so long agentic flows take longer per step. Raise `--timeout` (it's in seconds — `--timeout 300` for a five-minute budget), and make sure the job-level `timeout-minutes` is comfortably higher than the CLI timeout so GitHub doesn't kill the job mid-run and rob you of the clean exit-code-3 signal.

**Flaky red builds with a small model.** If you wired `--model ollama/<tiny-model>` on a self-hosted runner and multi-step flows pass sometimes and fail others, the model is the problem, not BrowserBash. Models at or below 8B drop steps on long objectives. Move to a 70B-class local model or a hosted model for the gating job and reserve the tiny ones for trivial single-step checks.

## When to use this

Reach for a GitHub Actions BrowserBash job when you want a real-browser smoke check on every push or PR that gates the merge — login still works, the pricing page renders, checkout reaches the confirmation screen — without maintaining selectors or page objects. It pairs naturally with your existing unit and integration jobs: let those run fast and deterministic, and let BrowserBash cover the handful of end-to-end paths where "does the actual UI work" is the question.

Next steps from here:

- Read the [exit codes and CI gating tutorial](https://browserbash.com/blog) to go deeper on the `0/1/2/3` contract and how to fan it out across multiple checks.
- Browse the [full tutorials index](https://browserbash.com/tutorials) for sibling CI recipes (matrix runs across browsers, secret handling, Dockerized runs).
- Skim the [features overview](https://browserbash.com/features) to see what else the agent can verify and extract in a single run.

## FAQ

### How do I run BrowserBash in GitHub Actions without an API key?

You can, but only on a self-hosted runner that has Ollama installed with a pulled model, where `--model ollama/<model>` keeps everything local and free. GitHub-hosted runners have no GPU and no Ollama daemon, so on those you need a hosted model key (Anthropic, OpenAI, or OpenRouter) stored as a repository secret. For most teams the hosted-key path is the fastest way to a working pipeline.

### How does BrowserBash fail a GitHub Actions build?

It fails the build through the process exit code, not by printing a magic string. A passed run exits `0`, a failed verdict exits `1`, an error exits `2`, and a timeout exits `3`. Because GitHub Actions already fails any step that exits non-zero, the gate works with zero parsing — you just run the command and let the exit code decide.

### Should I use headless mode in CI?

Yes. Hosted runners have no display server, so pass `--headless` to run the browser without a visible window. Combine it with `--agent` for machine-readable NDJSON output, and add `--record` if you want a screenshot and session video saved as build artifacts for debugging failed runs later.

### Why does my CI run time out when it works locally?

Hosted runners are slower than a developer laptop and lack a GPU, so each agent step takes longer, especially on long multi-step flows. Raise the CLI `--timeout` value (it's in seconds) and keep the job-level `timeout-minutes` higher than the CLI timeout so GitHub doesn't kill the job before BrowserBash can return a clean exit code. Picking a capable model also reduces wasted retries that eat the clock.

Ready to wire it up? Install the CLI with `npm install -g browserbash-cli`, get one run green locally, then lift the command into the workflow above. No account is required to run — but if you want free cloud run history, you can [sign up here](https://browserbash.com/sign-up) and opt in per run with `--upload`.
