---
title: Run BrowserBash in a Jenkins pipeline
description: "A hands-on tutorial for ai browser tests jenkins: a declarative Jenkinsfile stage, headless Chrome, exit-code gating, and archiving .webm recordings."
date: 2026-03-24
category: tutorial
---

By the end of this tutorial you'll have a working Jenkins job that runs **ai browser tests** on every build, fails red when a flow breaks, and parks a screen recording next to the build log so you can watch exactly what the agent saw. We'll write a declarative `Jenkinsfile` with a dedicated stage, run BrowserBash headless on the agent, gate the build on the process exit code instead of scraping logs, and archive the `.webm` video as a build artifact. No selectors, no page objects — you write a plain-English objective, an AI agent drives a real Chrome browser through it, and the exit code tells Jenkins pass or fail.

This is a build-it-with-me walkthrough. I'll assume you've used Jenkins before (you know what a controller and an agent are) but have never run BrowserBash inside one. We'll start from a clean agent, prove the command works by hand, then promote it into a pipeline stage and wire up artifacts. Every command below is copy-paste runnable.

## What you'll need

Before we touch a `Jenkinsfile`, get these in place on the machine where the Jenkins **agent** (not the controller UI) actually executes builds:

- **Node.js >= 18** — check with `node -v`. BrowserBash is a Node CLI and won't start on older runtimes.
- **Google Chrome (or Chromium)** installed on the agent. The default `local` provider drives a real Chrome on the build machine, so it has to be there.
- **The BrowserBash CLI**, installed globally:
  ```bash
  npm install -g browserbash-cli
  ```
- **An LLM backend.** BrowserBash is Ollama-first. If the agent has [Ollama](https://browserbash.com/features) running with a mid-size model pulled, your model bill is exactly $0 and nothing leaves the machine. If you'd rather use a hosted model, set `ANTHROPIC_API_KEY` (resolves to `claude-opus-4-8`) or `OPENAI_API_KEY` as a Jenkins credential. We'll default to the local path and show the hosted path as a variant.
- **ffmpeg** on the agent, only if you want session videos. The `--record` flag bundles ffmpeg, but a missing system codec is the most common reason recordings come out empty in CI — more on that in troubleshooting.

One honest caveat before we start: very small local models (8B and under) get flaky on long multi-step objectives. They'll nail a single login but lose the thread on a five-step checkout. For CI, run a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. Treat the model like a dependency you pin, not an afterthought.

## Step 1 — Prove the command works on the agent by hand

Never debug a new tool through the Jenkins UI. SSH into the agent, become the Jenkins user, and run BrowserBash directly first. If it works in the shell, the pipeline is just plumbing.

```bash
browserbash run "Go to https://browserbash.com, confirm the page loads and the main heading is visible" --headless
```

A few things to notice. `run` is the one-shot command — give it an objective in quotes and it drives the browser through it. `--headless` is non-negotiable on a CI agent: there's no display server, so a headed Chrome would hang or crash. The agent navigates, observes the page, and prints a human-readable verdict ending in a clear `passed` or `failed`, plus any structured values it extracted along the way.

If you see a passing verdict, your runtime is healthy. If it errors about a model, jump to Step 2 and pin one explicitly. If Chrome fails to launch, your agent is missing the browser — install Chrome and retry before going further.

### Pin the model so CI is reproducible

`auto` is convenient locally but I don't like surprises in CI. The default `auto` resolves in order: a running local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then an error. On a build agent that resolution can shift if someone toggles an env var. Pin it:

```bash
browserbash run "Go to https://browserbash.com and confirm the hero heading is visible" \
  --headless \
  --model ollama/qwen3
```

Now the build uses exactly the model you tested, every time. Here are the backends you can pin with `--model`:

| `--model` value | Backend | Key / env needed |
| --- | --- | --- |
| `auto` (default) | Resolves Ollama -> Anthropic -> OpenAI | Whatever's present |
| `ollama/qwen3` | Local Ollama, free, offline | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` optional |
| `claude-opus-4-8` | Anthropic hosted | `ANTHROPIC_API_KEY` |
| `openai/gpt-4.1` | OpenAI via Stagehand | `OPENAI_API_KEY` |
| `google/gemini-2.5-flash` | Google via Stagehand | Stagehand-configured key |
| `openrouter/<vendor>/<model>` | OpenRouter | `OPENROUTER_API_KEY` |

For a self-hosted Ollama, point the agent at it with `OLLAMA_BASE_URL` if the model server lives on a different host than the build agent.

## Step 2 — Understand exit codes (this is the whole game in CI)

A CI tool lives or dies by its exit code. Jenkins marks a stage failed the moment a shell step returns non-zero. BrowserBash is built for exactly this — it maps run outcomes to distinct codes so your build verdict isn't a regex over log text:

| Exit code | Meaning | What Jenkins should do |
| --- | --- | --- |
| `0` | passed | Mark stage green, continue |
| `1` | failed | The objective's assertion did not hold — fail the build |
| `2` | error | Setup/runtime problem (no model, bad flag, Chrome missing) — fail and investigate |
| `3` | timeout | Run exceeded `--timeout` — fail, likely flaky flow or slow model |

This is why you never parse prose to decide pass/fail. Confirm the codes by hand on the agent:

```bash
browserbash run "Go to https://browserbash.com and confirm the hero heading is visible" --headless --model ollama/qwen3
echo "exit code: $?"
```

A clean pass prints `exit code: 0`. Point the same objective at an assertion you know is false and you'll see `1`. That separation — `1` for a real failure versus `2`/`3` for an infrastructure problem — is gold when you're triaging a red build at 2am. A `1` means the app regressed; a `2` means your pipeline is broken; a `3` means something got slow. Treat them differently.

### Want structured progress? Use `--agent`

For richer log lines, add `--agent`. It emits NDJSON — one JSON object per line — instead of prose, so the build log stays machine-parseable while still being human-skimmable:

```bash
browserbash run "Log in with the demo account and confirm the dashboard loads" \
  --headless \
  --model ollama/qwen3 \
  --agent
```

You'll get step events as the agent works:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened the login page"}
{"type":"step","step":2,"status":"passed","action":"type","remark":"Filled in the demo credentials"}
{"type":"run_end","status":"passed","summary":"Dashboard loaded for the demo user","final_state":{"loggedIn":true},"duration_ms":18342}
```

The terminal `run_end` line carries the same verdict as the exit code, plus a `final_state` object holding extracted values and a `duration_ms`. The exit code is still authoritative for Jenkins; `--agent` just gives you a clean record to archive or feed into another tool. Either way works for the rest of this tutorial — I'll use plain prose output in the pipeline and call out where `--agent` slots in.

## Step 3 — Commit a markdown test you can version-control

One-liners are great for a smoke check, but real suites belong in the repo next to the code they test. BrowserBash reads markdown test files where each list item is a step. Drop this into your project as `login_test.md`:

```markdown
# Login smoke test

- Go to {{baseUrl}}
- Click the "Sign in" link
- Enter {{username}} into the email field
- Enter {{password}} into the password field
- Click the "Log in" button
- Confirm the dashboard greeting shows the user's name
```

Notice the `{{variables}}`. They're templated at run time, so the same test runs against staging or production by swapping inputs — no forked files. Mark a variable as secret and BrowserBash masks it as `*****` in every log line, which matters when the build log is world-readable inside your org. You can also compose suites with `@import` to pull shared setup steps into multiple tests.

Run it locally before wiring CI:

```bash
browserbash testmd run ./login_test.md --headless --model ollama/qwen3
```

`testmd run` executes the steps in order and writes a human-readable `Result.md` next to the test after each run — a clean artifact you'll archive in Jenkins. The same exit-code contract applies: `0` passed, `1` failed, and so on. Commit `login_test.md` so the suite travels with the code.

## Step 4 — Write the Jenkinsfile stage

Now the main event. Here's a complete declarative `Jenkinsfile` with a dedicated stage for ai browser tests. It installs the CLI, runs the test headless, and the stage's success is decided purely by the exit code.

```groovy
pipeline {
  agent any

  environment {
    BASE_URL = 'https://staging.example.com'
  }

  stages {
    stage('Install BrowserBash') {
      steps {
        sh 'node -v'
        sh 'npm install -g browserbash-cli'
        sh 'browserbash --version'
      }
    }

    stage('AI Browser Tests') {
      steps {
        sh '''
          browserbash testmd run ./login_test.md \
            --headless \
            --model ollama/qwen3 \
            --timeout 180
        '''
      }
    }
  }
}
```

Walk through what's happening. The `Install BrowserBash` stage is cheap insurance — it prints the Node version, installs the CLI globally on the agent, and echoes the version so the build log records exactly what ran. The `AI Browser Tests` stage runs your committed markdown test headless against the pinned model.

The magic is the `sh` step itself. When BrowserBash exits non-zero, the `sh` step returns that code, Jenkins fails the stage, and the build goes red — no `when` conditions, no log grepping, no custom verdict logic. The exit code *is* the gate. That's the entire point of building the CLI around clean codes.

I've added `--timeout 180`, which caps the run at 180 seconds and returns exit code `3` if the agent blows past it. Always set a timeout in CI. Without one, a confused model or a hung page can stall the agent indefinitely and your executor sits blocked. Pick a ceiling a comfortable margin above your slowest honest run.

### The flags worth knowing for the pipeline

Here are the `run`/`testmd run` flags that matter most inside Jenkins, accurate to the current CLI:

| Flag | What it does | Why it matters in CI |
| --- | --- | --- |
| `--headless` | Runs Chrome with no display | Required on agents — no display server exists |
| `--timeout <seconds>` | Caps total run time, exits `3` if exceeded | Stops hung runs from blocking executors |
| `--model <id>` | Pins the LLM backend | Reproducible builds, no `auto` surprises |
| `--record` | Captures screenshots + a `.webm` session video | The artifact you'll archive for debugging |
| `--agent` | Emits NDJSON instead of prose | Machine-parseable logs and `final_state` |
| `--provider <name>` | Where the browser runs (`local` default) | Switch to a grid or cloud provider |
| `--engine <name>` | Who interprets the English (`stagehand` default) | `builtin` adds a Playwright trace with `--record` |

## Step 5 — Record the session and archive it as a build artifact

A red build with no evidence is a support ticket. Add `--record` and the agent captures screenshots plus a `.webm` session video using its bundled ffmpeg. If you switch to the `builtin` engine, `--record` also writes a Playwright trace you can open in the trace viewer. Then archive those files so they hang off the build page.

Update the test stage to record, and add a `post` block so artifacts are captured **even when the test fails** — which is precisely when you need the video most:

```groovy
stage('AI Browser Tests') {
  steps {
    sh '''
      browserbash testmd run ./login_test.md \
        --headless \
        --record \
        --model ollama/qwen3 \
        --timeout 180
    '''
  }
  post {
    always {
      archiveArtifacts artifacts: '**/*.webm, **/*.png, **/Result.md',
                       allowEmptyArchive: true,
                       fingerprint: true
    }
  }
}
```

The key detail is `post { always { ... } }`. Putting `archiveArtifacts` in `always` means a failing build still uploads the recording. If you only archive on success, you lose the evidence exactly when the test breaks — backwards. The glob grabs the `.webm` video, the screenshots, and the `Result.md` summary that `testmd run` writes. `allowEmptyArchive: true` keeps the build from erroring if a run dies before producing files, and `fingerprint: true` lets you trace an artifact back to its build later.

After a build, open it in Jenkins and you'll see the recording under **Build Artifacts**. Download the `.webm`, scrub to the step that broke, and you're watching exactly what the agent saw — no reproduction guesswork.

### Keep a local dashboard for richer triage

Every run is also kept on disk at `~/.browserbash/runs` (capped at 200, secrets masked), so even runs you didn't archive are recoverable on the agent. For a visual history, BrowserBash ships a fully local dashboard:

```bash
browserbash dashboard
```

That serves a dashboard on `localhost:4477` with no account and nothing leaving the machine — handy on a dedicated test agent you can port-forward to. If your org uses the optional cloud dashboard, you'd run `browserbash connect --key bb_...` once and add `--upload` to a run to push it (opt-in; free cloud runs are kept 15 days). Without `--upload`, nothing ever leaves your infrastructure — the right default for most CI.

## Troubleshooting

Real failure modes you'll hit, and how to clear them.

**The agent passes simple flows but loses the thread on long ones.** This is almost always the model. Tiny local models (8B and under) can't hold a long multi-step objective in their head and start wandering around step three or four. Pin a mid-size local model (`--model ollama/qwen3` with a 70B-class model pulled) or a hosted model like `claude-opus-4-8`. Don't fight a model that's too small — swap it.

**`--record` produces an empty or missing `.webm`.** The recording path needs a working ffmpeg. BrowserBash bundles it, but some minimal CI images strip system media libraries the binary depends on. Confirm with `ffmpeg -version` on the agent; if it's absent or broken, install ffmpeg in your agent image. Screenshots will usually still capture even when video fails, so check those first to confirm the run itself worked.

**Exit code `2` right at startup.** That's an error, not a test failure — the agent never got going. Almost always a missing model backend: no Ollama running and no `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` set. Pin `--model` explicitly and make sure that backend is actually reachable from the agent. A `2` is your pipeline's problem to fix, not the app's.

**Builds hang or return exit code `3`.** Code `3` is a timeout. Either the flow genuinely got slower, or the model is stalling. First raise `--timeout` to confirm it's slowness, not a true hang. If runs are wildly inconsistent in duration, that's a sign the model is too small for the objective — see the first item. Always keep *some* timeout set so a hung run can't pin an executor forever.

**Chrome won't launch on the agent.** The default `local` provider needs a real Chrome on the build machine. If Chrome isn't installed in your agent image, either add it or move the browser off-box: use `--provider cdp --cdp-endpoint ws://...` to drive a remote DevTools endpoint, or a grid provider like `lambdatest` (set `LT_USERNAME` + `LT_ACCESS_KEY`) or `browserstack` (set `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`). Those grid providers auto-switch to the `builtin` engine, so behavior is consistent.

## When to use this

Reach for this Jenkins setup when you want a thin layer of high-value, user-journey smoke tests — login, checkout, signup — running on every build without a brittle selector suite to maintain. It pairs well with, not instead of, your unit and API layers: let those run fast and deep, and let BrowserBash guard the handful of flows a real human cares about. Because the verdict is just an exit code and the evidence is a `.webm`, triage stays fast even when the AI does something surprising.

From here, a few natural next steps:

- Broaden your suite with the patterns in the [BrowserBash tutorials](https://browserbash.com/tutorials) hub.
- Learn how the agent interprets objectives and writes verdicts in [BrowserBash Learn](https://browserbash.com/learn).
- See how teams wire this into real release pipelines on the [BrowserBash blog](https://browserbash.com/blog) and the [case study page](https://browserbash.com/case-study).

If you're deciding between local and hosted models for your runners, the trade-offs (cost, speed, and how hard your flows are) are laid out on the [pricing page](https://browserbash.com/pricing).

## FAQ

### How do I run BrowserBash headless in Jenkins?

Add the `--headless` flag to your `run` or `testmd run` command inside the pipeline's `sh` step. CI agents have no display server, so a headed browser would hang or crash. Headless mode launches Chrome without a screen while still capturing screenshots and `.webm` recordings if you also pass `--record`.

### How does Jenkins know if an AI browser test passed or failed?

BrowserBash returns a process exit code that Jenkins reads automatically: `0` for passed, `1` for failed, `2` for an error, and `3` for a timeout. When the code is non-zero, the `sh` step returns that code and Jenkins fails the stage. You never have to parse log text to decide the build verdict.

### Can I save the browser recording as a Jenkins build artifact?

Yes. Run the test with `--record` to capture a `.webm` session video and screenshots, then use `archiveArtifacts` inside a `post { always { ... } }` block so the files are saved even when the build fails. The recordings then appear under Build Artifacts on the build page for download and review.

### Do I need an API key to run ai browser tests in Jenkins?

No. BrowserBash is Ollama-first, so if the agent has a local Ollama model pulled, the runs are free and fully offline with no keys. If you prefer a hosted model, set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as a Jenkins credential and pin it with `--model`. No BrowserBash account is required to run.

Ready to put this in your pipeline? Install the CLI and run your first headless test today:

```bash
npm install -g browserbash-cli
```

Then head to [browserbash.com/sign-up](https://browserbash.com/sign-up) — an account is optional, but it's there when you want the cloud dashboard.
