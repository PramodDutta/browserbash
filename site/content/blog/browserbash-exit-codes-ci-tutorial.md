---
title: BrowserBash exit codes and CI gating, explained
description: "A hands-on tutorial to BrowserBash exit codes — what 0/1/2/3 mean, how to fail a pipeline correctly, and how to combine --agent with --timeout."
date: 2026-02-27
category: tutorial
---

If your CI pipeline decides pass or fail by grepping log output, you are one log-format change away from a green build that should have been red. This tutorial fixes that. By the end you will know exactly what every **BrowserBash exit code** means — `0`, `1`, `2`, and `3` — how to gate a pipeline on the process exit status instead of parsing prose, and how to pair `--agent` and `--timeout` so your CI job is both machine-readable and bounded. We will run real commands, read the real verdict, and wire the whole thing into a shell script and a GitHub Actions workflow you can copy today.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and you get back a verdict. The key idea for CI is that the verdict is not buried in text you have to scrape; it is the process exit code, and the structured detail arrives as NDJSON. That single design choice is what makes BrowserBash easy to gate on. Let's make it concrete.

## What you'll need

- **Node.js 18 or newer.** Check with `node -v`. The CLI will not start on older runtimes.
- **Google Chrome installed** for the default local provider. The agent drives your actual browser binary.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

- **A model.** Every example here defaults to the free local path: install [Ollama](https://browserbash.com/learn), pull a mid-size model, and you need no API keys, no account, and nothing leaves your machine. The CI section shows the hosted-key path too, and calls out exactly which environment variable to set when we get there.
- **A shell** (bash or zsh) so you can read `$?` after each run. That variable holds the exit code of the last command, and it is the whole game here.

Confirm the install landed:

```bash
browserbash --version
```

You should see `1.3.1`. Now let's look at the contract.

## Step 1 — The four exit codes, one contract

Every `browserbash run` and every `browserbash testmd run` exits with a number that *is* the verdict. There are exactly four:

| Exit code | Status | Meaning | What it tells CI |
| --- | --- | --- | --- |
| `0` | passed | The objective held; every verify step was satisfied. | Build is green. Move on. |
| `1` | failed | The objective or a verify step did not hold. | A product/test signal. A human should look. Do **not** silently retry. |
| `2` | error | Infrastructure or agent problem — missing key, dead endpoint, browser failed to launch. | An environment signal. One automatic retry is reasonable. |
| `3` | timeout | The run outlived its `--timeout` budget before reaching a verdict. | An environment/budget signal. One retry, or raise the budget. |

The granularity is the entire point. Most test tools give you a single "non-zero means bad" bit. BrowserBash splits "bad" into three meaningfully different cases, because the correct *response* to each differs. A `1` means your product or your expectation broke — paging a human and never auto-rerunning is the right move, because silently retrying a real failure trains your team to ignore red. A `2` or a `3` is usually a hiccup in the world around the test — a grid blip, a network stall, a run that ran long — and one retry before failing the build is sane.

Hold that table in your head. Every step below is just an application of it.

## Step 2 — See exit code 0 (passed) with your own eyes

Start with the simplest possible run and immediately inspect the exit code:

```bash
browserbash run "Go to example.com and confirm the page heading contains the word Example"
echo "exit code: $?"
```

Your Chrome opens, the agent navigates, reads the heading, reasons about whether it matches, and prints a verdict. Because the heading on `example.com` really does contain "Example", the agent returns `passed` and the process exits `0`. The `echo` prints `exit code: 0`.

That `$?` read is the habit to build. In an interactive terminal the human-readable verdict is enough, but in CI nothing reads the words — the runner reads the number. Prove to yourself the number tracks the verdict before you trust it in a pipeline.

## Step 3 — Force a failure and see exit code 1

Now ask for something that is false, so the agent has to fail honestly:

```bash
browserbash run "Go to example.com and confirm the page heading contains the word Checkout"
echo "exit code: $?"
```

The heading does not contain "Checkout", so the agent cannot satisfy the objective. It returns `failed` and the process exits `1`. You will see `exit code: 1`.

This is the case CI cares about most. A `1` is a *content* verdict, not a crash — the tool worked perfectly and the answer is "no". When this happens in a pipeline, the build should go red and stay red until a person looks. The next step makes that automatic.

### A note on writing checkable objectives

The cleaner your objective, the cleaner your `1` versus `0` split. Phrase objectives as assertions the agent can confirm or deny — "confirm the order confirmation page shows an order number", "verify the cart total equals 49.00" — rather than open-ended browsing. A verifiable objective is what turns a fuzzy task into a binary exit code.

## Step 4 — Gate a shell script on the exit code

Here is the smallest correct gate. Run, capture `$?` once, and branch on it:

```bash
browserbash run "Go to example.com and confirm the heading contains Example" --headless --timeout 120
code=$?

if [ "$code" -eq 0 ]; then
  echo "PASS"
elif [ "$code" -eq 1 ]; then
  echo "FAIL - product/test signal, failing the build" >&2
  exit 1
else
  echo "infra-flavored exit ($code) - retry territory" >&2
  exit "$code"
fi
```

Capture `$?` into a variable *immediately* after the command — any other command in between (even an `echo`) overwrites it. From there you branch: a `0` passes, a `1` fails the build hard, and a `2` or `3` falls into the "retry" branch we build next. Note `--headless` so no visible window pops up on a CI runner, and `--timeout 120` so the run is bounded — more on both shortly.

## Step 5 — Retry only the infra-flavored exits (2 and 3)

This is the pattern that separates a mature pipeline from a flaky one. Retry `2` and `3`, never `1`:

```bash
run_once() {
  browserbash testmd run ./smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
}

run_once
code=$?

if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
  echo "infra-flavored exit ($code) - retrying once" >&2
  run_once
  code=$?
fi

exit $code
```

The first run writes its NDJSON to `smoke.ndjson`. If it exited `2` (error) or `3` (timeout), we run it exactly once more and adopt the second exit code. A `0` or a `1` is never retried — a pass needs no retry, and a real failure must not be papered over. The script's own final `exit $code` propagates the verdict to whatever called it, so CI inherits the right color.

Why never retry `1`? Because a retried real failure that happens to pass on a re-run is the single fastest way to make a team stop believing their own pipeline. Keep `1` sacred.

## Step 6 — Turn on `--agent` for machine-readable output

Everything so far works on the exit code alone, which is all a gate strictly needs. But when a build goes red you want detail, and `--agent` is how you get it without parsing prose. It emits NDJSON — one JSON object per line — to stdout:

```bash
browserbash testmd run ./smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
echo "exit code: $?"
```

Two kinds of lines land in `smoke.ndjson`. Progress events stream while the agent works:

```json
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked the Sign in button"}
```

And the very last line is always the terminal event:

```json
{"type":"run_end","status":"passed","summary":"Login flow verified","final_state":{"order_id":"12345"},"duration_ms":48211}
```

The `status` field on `run_end` mirrors the exit code — `passed` → `0`, `failed` → `1`, `error` → `2`, `timeout` → `3` — so you have the verdict in two places that always agree. One important detail: with `--agent`, the NDJSON goes to **stdout** and the human-readable narration goes to **stderr**. That is why the redirect `> smoke.ndjson` produces a clean file while your CI log stays readable. Pull any field with `jq`:

```bash
tail -1 smoke.ndjson | jq -r '.status, .duration_ms, .final_state.order_id'
```

`final_state` carries whatever your steps stored (a markdown step like "Store the order number as 'order_id'"), so a later CI step can read a value out of the run with zero scraping.

## Step 7 — Bound the run with `--timeout`

`--timeout` takes a number of **seconds** and is what makes exit code `3` possible. Without a bound, a confused agent or a hung page can keep a CI job alive far longer than you want. With one, the run is guaranteed to terminate and report `timeout`:

```bash
browserbash run "Complete the multi-step checkout on the staging cart" --headless --timeout 240
echo "exit code: $?"
```

If the agent finishes inside 240 seconds it exits `0` or `1` as usual. If it blows the budget, it exits `3` — which your retry branch from Step 5 catches. Pick the number from data, not vibes: run the flow a few times, note how long a healthy pass takes, and set `--timeout` to roughly twice that. Too tight and healthy runs flap to `3`; too loose and a genuinely stuck run wastes a CI slot.

### How `--agent` and `--timeout` combine

These two flags are the CI pair. `--timeout` guarantees the run *ends*; `--agent` guarantees the result is *readable*. Together they give you a job that always terminates with a known exit code and always leaves a parseable artifact behind. Here are the flags that matter for gating, all accurate to the `run` and `testmd run` surface:

| Flag | Value | What it does for CI |
| --- | --- | --- |
| `--agent` | (none) | Emits NDJSON on stdout, narration on stderr. The terminal `run_end` line mirrors the exit code. |
| `--timeout` | seconds | Bounds the run. Exceeding it produces status `timeout` and exit code `3`. |
| `--headless` | (none) | Runs Chrome without a visible window — essential on a headless CI runner. |
| `--record` | (none) | Saves a screenshot and a `.webm` session video via bundled ffmpeg; the builtin engine also writes a Playwright trace. Great for debugging a red build. |
| `--provider` | `local` \| `cdp` \| `browserbase` \| `lambdatest` \| `browserstack` | Where the browser runs. `local` is the default and needs no keys. |
| `--model` | e.g. `ollama/qwen3` | Pin the LLM. Default `auto` resolves Ollama → Anthropic key → OpenAI key. |

## Step 8 — Put it in a GitHub Actions workflow

Now assemble it. This workflow installs the CLI, runs a markdown smoke test bounded and in agent mode, and uploads the NDJSON for debugging. There is deliberately **no "parse results" step** — the `run` step fails exactly when the test fails, because the exit code is the verdict:

```yaml
name: e2e
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
      - run: browserbash testmd run ./smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: smoke-ndjson
          path: smoke.ndjson
```

A CI runner has no local Ollama, so this example sets `ANTHROPIC_API_KEY` and lets `auto` resolve to `claude-opus-4-8` — a capable hosted model for the hard, multi-step flows CI tends to throw at it. The `if: always()` on the upload step means you keep the NDJSON artifact even when the run fails, which is exactly when you want it. If you would rather add the Step 5 retry logic, drop the run command into a small shell script in your repo and call that script instead of the inline command.

### Reading the result downstream

Because the `run_end` event is always the last NDJSON line, a follow-up step can extract a stored value without any guesswork:

```bash
order_id=$(tail -1 smoke.ndjson | jq -r '.final_state.order_id')
echo "Captured order id: $order_id"
```

That value came from a markdown step that said to store it. No log scraping, no brittle regex — just the last line of a JSON stream.

## Troubleshooting

**Every run exits `2` with a "no model available" message.** Exit code `2` is an environment error, and the most common one in CI is that `auto` found neither a local Ollama nor an API key. On a CI runner, set `ANTHROPIC_API_KEY` (resolves to `claude-opus-4-8`) or `OPENAI_API_KEY` (resolves to `openai/gpt-4.1`) in the job environment, or pin `--model ollama/<model>` only on machines that actually run Ollama. Locally, start Ollama and pull a model first.

**A long objective keeps exiting `1` on a small local model.** Be honest with yourself about model size. Very small local models (8B and under) are flaky on long, multi-step objectives — they lose the thread and report a genuine-looking `failed`. The sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model for the hard flows. If a flow fails on a tiny model but the page is clearly fine by eye, the model is the bottleneck, not your test.

**Runs flap between `0` and `3` on a slow CI runner.** That is a timeout that is set too tight. Measure a few healthy passes, then set `--timeout` to roughly twice the observed time. Pair it with the Step 5 retry so a one-off `3` does not fail the whole build, and reserve hard failures for `1`.

**`--record` produces no video.** The `.webm` capture uses bundled ffmpeg, but if the bundled binary cannot run in your environment you will get the screenshot but a missing or empty video. The run itself still succeeds and the exit code is unaffected — recording is a debugging convenience, not part of the verdict. Confirm the runner can execute the bundled ffmpeg, or fall back to `--agent` NDJSON plus a Playwright trace (written by the builtin engine) for diagnosis.

**The NDJSON file is full of human-readable noise.** You forgot `--agent`, or you redirected stderr into the file. With `--agent`, JSON goes to stdout and narration to stderr — so use `> smoke.ndjson` (which redirects only stdout). If you used `&> smoke.ndjson` or `2>&1`, the narration leaks in and `jq` chokes on the non-JSON lines.

## When to use this

Reach for exit-code gating whenever a build's pass/fail should hinge on a real browser flow — smoke tests before a deploy, a nightly end-to-end job, or a synthetic check on production. It is the foundation every other CI recipe builds on.

From here, a few sibling tutorials go deeper:

- [Every BrowserBash CLI flag, explained](https://browserbash.com/tutorials) — the full reference for `--engine`, `--provider`, `--model`, and the rest, each with a runnable example.
- The [NDJSON agent-mode tutorial](https://browserbash.com/learn) — how to consume `step` and `run_end` events from an AI coding agent or a custom script.
- More CI and pipeline walkthroughs live on the [BrowserBash blog](https://browserbash.com/blog), and the [features page](https://browserbash.com/features) maps every flag back to the capability it unlocks.

## FAQ

### What do BrowserBash exit codes 0, 1, 2, and 3 mean?

Exit code `0` means the run passed and the objective held. Exit code `1` means it failed — the objective or a verify step did not hold, which is a product or test signal a human should review. Exit code `2` means an error, usually an infrastructure or agent problem like a missing key or a browser that would not launch, and exit code `3` means the run timed out before reaching a verdict.

### How do I fail a CI pipeline when a BrowserBash test fails?

You do not need to do anything special — the process exit code is the verdict, so the CI step fails automatically when the run exits non-zero. Just run `browserbash run` or `browserbash testmd run` as a normal step and let the exit code propagate. Avoid wrapping it in a "parse the logs" step; that reintroduces exactly the fragility the exit-code contract removes.

### Should I retry a BrowserBash run that exits with code 1?

No. Exit code `1` is a real failure of the product or the test's expectation, and silently retrying it until it passes trains your team to ignore red builds. Reserve automatic retries for exit codes `2` and `3`, which signal infrastructure or timeout issues where a single re-run is reasonable. Keep the failed verdict sacred so people still trust the pipeline.

### How do --agent and --timeout work together in CI?

`--timeout` takes a number of seconds and guarantees the run terminates, producing exit code `3` if it blows the budget, while `--agent` guarantees the output is machine-readable NDJSON on stdout with the verdict mirrored in the final `run_end` line. Used together, your CI job always ends with a known exit code and always leaves a parseable artifact behind. That pairing is the standard, recommended setup for any BrowserBash CI step.

---

Ready to gate your pipeline on a verdict instead of a regex?

```bash
npm install -g browserbash-cli
```

No account needed to run — everything above works locally and free. When you want a shared dashboard and 15-day cloud run history, [sign up here](https://browserbash.com/sign-up) (optional).
