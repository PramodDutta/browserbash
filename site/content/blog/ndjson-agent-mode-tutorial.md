---
title: NDJSON Agent Mode: Make Browser Runs Callable by Scripts and AI
description: "Learn BrowserBash NDJSON agent mode: the --agent stdout schema, exit codes 0-3, and how to call browser runs from scripts and AI agents."
date: 2026-06-13
category: guide
---

Most browser automation tools were built for humans to read. You launch a run, watch a wall of colored text scroll by, and a person decides whether it passed. That falls apart the moment the caller is a shell script, a CI job, or an AI coding agent — none of them should be parsing prose to learn whether a login worked. BrowserBash's **NDJSON agent mode** exists to remove that guesswork: add `--agent` to any run and stdout becomes a stream of newline-delimited JSON with a stable schema, while the process exit code carries the verdict. A browser run stops being a thing you watch and becomes a thing you can call like a function.

This is a hands-on tutorial. By the end you will know every field the schema emits, what each of the four exit codes means and how to react to it, and how to wire a real run into a `bash` + `jq` loop, a CI job, and an AI agent — without a single regex against human-readable output.

## Why NDJSON, and why a verdict in the exit code

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source natural-language browser automation CLI. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser, and you get back a verdict plus structured results — no selectors, no page objects. In interactive use it prints friendly, human-readable progress. Agent mode flips that contract for machine callers.

NDJSON — newline-delimited JSON — means one complete JSON object per line, terminated by a newline. It is the right shape for a long-running process for two reasons:

- **It streams.** Each line is independently parseable the instant it arrives. A supervising script or agent can react to step-by-step progress, log it, detect a stall, and kill a runaway run early — without waiting for the whole document to finish and without buffering megabytes of output.
- **The last line is the verdict.** The terminal event is always emitted last, so `tail -1 | jq` gives you the final result with no need to parse everything before it.

Pairing NDJSON with an exit-code verdict is the second half of the contract. Prose was never an interface — log formats drift between releases, a summary line gets reworded, and a brittle `grep "0 failures"` silently falls through and reports a false green. By putting the verdict in the exit code, BrowserBash makes the integration robust: the caller never *infers* success from text. It reads a number.

## Turning on agent mode

Agent mode is a single flag on the commands you already run. Here is the canonical invocation:

```bash
browserbash run "Open https://example.com/login, log in as standard_user with the team password, and store the logged-in display name as 'user_name'" \
  --agent \
  --headless \
  --timeout 120
```

Three flags are doing the work:

- `--agent` switches output to the NDJSON contract. This is the only flag that changes the *shape* of stdout.
- `--headless` runs Chrome without a visible window — almost always what you want on a server, in CI, or inside an agent.
- `--timeout 120` caps the run at 120 seconds. When the budget is exceeded the run ends with a distinct timeout verdict (more on that below), so a stuck page can never hang your pipeline forever.

The most important behavioral detail in agent mode: **stdout carries only NDJSON; everything human-readable goes to stderr.** That separation is what lets you redirect a clean machine stream to a file while still seeing readable progress in your terminal or CI log:

```bash
browserbash run "Open https://example.com and store the page title as 'title'" \
  --agent --headless > run.ndjson
# run.ndjson is pure NDJSON; friendly logs still print to the console via stderr
```

If you forget the redirect, the two streams stay correctly separated anyway — NDJSON to stdout, prose to stderr — so piping stdout into `jq` never trips over a stray log line.

## The NDJSON schema, field by field

Agent mode emits two kinds of events on stdout: zero or more `step` events while the run is in flight, then exactly one terminal `run_end` event. Every line is a complete JSON object and every line has a `type` field, so a consumer can branch on `type` and never guess.

### Step events

As the agent acts on the browser, it streams one `step` event per action:

```json
{"type":"step","step":3,"status":"running","action":"click","remark":"Clicking the Login button (ref:12)"}
```

The fields:

- `type` — always `"step"` for these events.
- `step` — a 1-based integer counter for the action's position in the run.
- `status` — the state of this step: `running`, `passed`, or `failed`.
- `action` — what the agent did, drawn from a small stable vocabulary: `navigate`, `click`, `type_text`, `extract`, and similar verbs. This is the field to key on if you want to surface "what is it doing right now" in a progress UI.
- `remark` — a short human-readable note about the step. Treat it as a label for logs, not as data to parse for control flow.

Because step events arrive live, you can tee them straight into a structured log. A coding agent can keep a running trail of exactly which actions ran, which is invaluable when a teammate later asks "what did the bot actually click?"

### The run_end event

The final line is always a single terminal event that summarizes the whole run:

```json
{
  "type": "run_end",
  "status": "passed",
  "summary": "Logged in successfully and captured the display name.",
  "final_state": {"user_name": "Q. Tester"},
  "duration_ms": 48211,
  "steps_executed": 9,
  "provider": "local",
  "test_url": null
}
```

The fields you will actually consume:

- `type` — always `"run_end"`. Because it is the last line, `tail -1` is enough to isolate it.
- `status` — the verdict, one of `passed | failed | error | timeout`. It mirrors the exit code described in the next section.
- `summary` — a one-line natural-language description of what happened. Good for a human-facing notification; not something to branch on.
- `final_state` — an object holding every value the objective asked to capture. Anything you phrased as `store ... as 'name'` lands here under that key. In the example, `store the logged-in display name as 'user_name'` produced `final_state.user_name`. This is how a browser run hands structured data back to its caller.
- `duration_ms` — wall-clock duration of the run in milliseconds. Binary verdicts tell you pass or fail; `duration_ms` is your early-warning channel for flakiness when you track it over time.
- `steps_executed` — how many actions the agent actually took. If this creeps well above the number of steps you wrote, the agent is working harder than expected to reach the same verdict — often the signature of a slow or flaky page.
- `provider` — where the browser ran (`local`, `cdp`, `browserbase`, `lambdatest`, or `browserstack`).
- `test_url` — a deep link to the session on a cloud grid when one ran the browser; `null` for local runs.

A practical rule for designing objectives around this schema: **phrase every piece of data you need as `store ... as 'some_name'`.** That is the contract that fills `final_state`, and `final_state` is the clean, typed channel back to your script. Everything else in `run_end` is metadata about the run itself.

## Exit codes are the real API

The schema tells you *what happened*; the exit code tells you *what to do about it*. Every `browserbash run` and `browserbash testmd run` exits with one of four codes, and that single number is the contract a caller should branch on:

| Exit code | `status` | Meaning |
|---|---|---|
| `0` | `passed` | The objective held. |
| `1` | `failed` | A real failure — the objective or a verify step did not hold. |
| `2` | `error` | Infrastructure or agent problem (bad endpoint, grid hiccup, misconfiguration). |
| `3` | `timeout` | The run exceeded its `--timeout` budget. |

The granularity is the entire point, and the right response differs per code:

- **`0` — passed.** Proceed. The run did what you asked.
- **`1` — failed.** This is a *product* signal. The app is broken, or the test's expectation no longer holds. A human should look, and you should never silently auto-retry it — retrying a real failure until it happens to pass is how teams learn to ignore red.
- **`2` — error.** This is an *environment* signal: a dead DevTools endpoint, a grid capacity blip, a missing credential, a transient network fault. One automatic retry — possibly on a different provider — is reasonable before failing.
- **`3` — timeout.** The run outlived its budget. Raise `--timeout`, or split a large objective into smaller runs, or check whether a page is genuinely hanging.

Collapsing `1` and `2` into a single "it failed" is the most common mistake, and it is corrosive: it trains your team to rerun genuine product failures as if they were flakes. Keep them distinct.

## Build along: a bash + jq loop

Here is the smallest useful integration. Run an objective, capture the verdict from the exit code, and pull a stored value out of `final_state`:

```bash
out=$(browserbash run "Open https://example.com and store the page title as 'title'" --agent --headless)
code=$?
title=$(echo "$out" | tail -1 | jq -r '.final_state.title')
echo "exit=$code title=$title"
```

Three things make this robust. `$?` reads the verdict straight from the exit code. `tail -1` isolates the always-last `run_end` line. `jq -r '.final_state.title'` extracts exactly the value you stored — no prose, no regex.

Scaling that up to a production-shaped wrapper that handles secrets and reacts per exit code:

```bash
out=$(browserbash run "Open https://staging.example.com/login, log in as {{username}} with password {{password}}, and store the logged-in display name as 'user_name'" \
  --agent --headless --timeout 120 \
  --variables '{"username":"qa@example.com","password":{"value":"hunter2","secret":true}}')
code=$?

# A structured trail of every action, for the run log:
echo "$out" | jq -c 'select(.type=="step")'

summary=$(echo "$out" | tail -1 | jq -r '.summary')

case $code in
  0) echo "PASS: $summary" ;;
  1) echo "FAIL: $summary — investigate the change" ;;
  2) echo "ERROR: $summary — retrying once" ;;
  3) echo "TIMEOUT: $summary — raise --timeout or split the objective" ;;
esac
```

Notice how credentials are passed. They ride in `--variables` as an object with `"secret": true` rather than being typed inline in the objective. Secret values are masked as `*****` in the NDJSON stream too, which matters the moment an agent transcript or CI log gets archived verbatim. For more on the variables-and-secrets model, see the [BrowserBash learn pages](https://browserbash.com/learn).

## Build along: an AI coding agent that verifies its own work

This is the use case agent mode was named for. An AI coding agent can write the fix but cannot, on its own, see whether the page still renders. Agent mode closes that loop: the agent invokes `browserbash run` as a tool, branches on the exit code, and reads structured results from `final_state` — exactly the kind of clean tool interface an LLM is good at consuming, with no prose to misread.

A house ruleset that works well for agent callers:

- **Always pass `--agent`.** It is the contract the agent depends on.
- **Phrase extractions as `store ... as 'name'`** so values land predictably in `run_end.final_state`.
- **Trust the exit code, never the summary text.** The number is the API; `summary` is a label.
- **Keep objectives focused.** Split anything that needs more than roughly fifteen steps into several `browserbash run` calls or a committable `*_test.md` file; smaller objectives are faster, more reliable, and easier to parallelize.
- **Attach `run_end` to the artifact.** When a UI check fails, the `run_end` line — verdict, summary, steps, duration — is a compact, complete record to staple to the pull request.

An agent can also drive a browser it already controls. If your agent launched Chrome over the DevTools Protocol — for example through a Playwright-based MCP server — point BrowserBash at that same endpoint instead of letting it launch its own:

```bash
browserbash run "Verify the dashboard shows a welcome banner and store its text as 'banner'" \
  --agent --headless \
  --provider cdp --cdp-endpoint ws://localhost:9222/devtools/browser/<id>
```

BrowserBash then drives the existing session rather than spawning a fresh browser — useful when the agent has already authenticated or navigated somewhere it wants verified.

## Build along: committable markdown tests

Agent mode is not limited to one-line objectives. BrowserBash also runs **markdown tests** — committable `*_test.md` files where each list item is a step, `@import` composes shared steps, and `{{variables}}` interpolate with the same secret masking. Run one with `--agent` and you get the identical NDJSON contract and exit codes, plus a written `Result.md`:

```bash
browserbash testmd run checkout_test.md --agent --headless --timeout 180 > checkout.ndjson
code=$?
tail -1 checkout.ndjson | jq -r '.status, .duration_ms, .final_state.order_id'
exit $code
```

This is the natural unit for CI: a reviewable test file lives next to your code, and the run emits a machine stream plus an exit-code verdict with no parsing step in between. Because the artifact is plain NDJSON, you can keep every run and mine `duration_ms` later to catch flakiness before it ever turns a build red.

## Wiring it into CI

In a CI job, the exit code *is* your pass/fail gate — there is no "parse results" step to write, because the run step fails exactly when the test fails. Here is a GitHub Actions job that installs the CLI, runs a markdown test in agent mode, and always uploads the NDJSON artifact for debugging:

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
      - run: browserbash testmd run checkout_test.md --agent --headless --timeout 180 > checkout.ndjson
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: checkout-ndjson
          path: checkout.ndjson
```

A couple of refinements turn this from working into production-grade. First, retry only the *environment* exit codes, never `1`:

```bash
browserbash testmd run checkout_test.md --agent --headless --timeout 180 > checkout.ndjson
code=$?
if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
  echo "environment-flavored exit ($code) — retrying once" >&2
  browserbash testmd run checkout_test.md --agent --headless --timeout 180 > checkout.ndjson
  code=$?
fi
exit $code
```

Second, when you want a real browser farm and session replays rather than the CI runner's local Chrome, switch where the browser runs with a single flag:

```bash
browserbash testmd run checkout_test.md --agent --headless --provider lambdatest
```

That sends the run to a cloud grid; the resulting `run_end` event carries a `test_url` deep-linking to the recorded session, while the verdict and schema stay byte-for-byte identical. The provider is the one thing that changes — your consuming code does not.

## Recording and pushing runs to a dashboard

Agent mode and recording compose cleanly. Add `--record` to capture a screenshot and a stitched session video (`.webm`) alongside the NDJSON, which is exactly what you want attached to a failing run:

```bash
browserbash run "Open https://example.com/checkout and complete a guest purchase" \
  --agent --headless --record
```

If you have created a free account and connected the CLI, add `--upload` to push the run to the cloud dashboard for run history and per-run replay:

```bash
browserbash connect --key bb_your_key_here
browserbash run "Open https://example.com/checkout and complete a guest purchase" \
  --agent --headless --record --upload
```

Nothing leaves your machine unless you pass `--upload` — by default every run is local. There is also a free, private local dashboard via `browserbash dashboard` if you would rather keep everything on your own machine. For walkthroughs of the dashboard and more end-to-end recipes, browse the [BrowserBash blog](https://browserbash.com/blog).

## A consumer's checklist

When you write something that calls BrowserBash in agent mode, hold yourself to this short list:

- Pass `--agent` and read stdout as NDJSON; read stderr for human logs.
- Branch on the **exit code** for control flow, not on `summary` or any `remark`.
- Isolate the verdict with `tail -1 | jq` — the `run_end` event is always last.
- Pull data from `final_state`, and make sure each value was captured with `store ... as 'name'`.
- Distinguish exit `1` (real failure, page a human) from `2`/`3` (environment, retry once).
- Set `--timeout` deliberately; treat exit `3` as a signal to raise it or split the objective.
- Keep secrets in `--variables` with `"secret": true` so they are masked in the stream.

Follow those and a browser run behaves like any other well-mannered function in your toolchain: predictable input, structured output, an unambiguous return code.

## FAQ

### Why NDJSON instead of a single JSON document?

Because runs are long-lived and you want to react before they finish. NDJSON streams one parseable object per line, so a supervising script or agent can log progress live, spot a stall, and kill a runaway run early. And since the terminal `run_end` event is always the last line, `tail -1 | jq` retrieves the verdict without buffering or parsing the entire stream.

### How do I tell a real test failure from a tooling failure?

By the exit code. `1` is a genuine failure of the app or the test's expectation — investigate the change and never silently retry it. `2` is an infrastructure or agent error such as a dead endpoint or a grid blip, where a single automatic retry is reasonable. `3` is a timeout, which means raise `--timeout` or split the objective into smaller runs.

### How do I get a value out of a run and use it in the next step?

Capture it in the objective with `store ... as 'name'`, and it appears in `run_end.final_state` under that key. Because `run_end` is always the last line, `tail -1 run.ndjson | jq -r '.final_state.name'` gives you the value to export or pass to a downstream step — no scraping of human-readable output.

### Does agent mode work with markdown tests and cloud grids too?

Yes. `browserbash testmd run file_test.md --agent` emits the identical NDJSON schema and the same four exit codes as `browserbash run`, and also writes a `Result.md`. Switching where the browser runs is one flag — for example `--provider lambdatest` — and the verdict, schema, and your consuming code stay exactly the same; only the `provider` and `test_url` fields change.

## Get started for free

BrowserBash is free and open source (Apache-2.0). Install it with `npm install -g browserbash-cli`, add `--agent` to any run, and you have a browser automation tool your scripts and AI agents can call like a function. To keep run history, recordings, and per-run replays in the cloud, [create a free account at browserbash.com/sign-up](https://browserbash.com/sign-up) — it stays free, and nothing leaves your machine until you choose to upload.
