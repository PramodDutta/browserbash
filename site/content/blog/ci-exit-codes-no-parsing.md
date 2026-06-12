---
title: "CI Verdicts Without Log Parsing: Exit Codes 0-3"
description: "Wire BrowserBash into GitHub Actions: exit codes 0/1/2/3 as the verdict, NDJSON artifacts for debugging, and flaky-test detection via duration_ms."
date: 2026-06-12
category: ci
---

A surprising number of CI pipelines decide pass or fail by parsing logs: grep the runner output for `0 failures`, scrape a summary line, hope the format never changes. BrowserBash takes the opposite position — the process exit code is the verdict, and everything machine-readable arrives as NDJSON on stdout. Here's how that plays out in a GitHub Actions pipeline, told through an illustrative SDET scenario: a composite of common setups with indicative numbers, not a real customer story. Every command is runnable as shown.

## The week of false greens

Picture an SDET at a thirty-engineer SaaS company who inherits a nightly end-to-end job. Its last step greps the test runner's stdout for a summary line and fails the build when the match reports failures. One quiet Tuesday, a tooling update changes the log format. The grep stops matching anything, the conditional falls through, and the job stays green for nine consecutive days — while checkout is broken on staging the whole time. A support ticket finds it; the pipeline never does.

The lesson isn't "write a better regex". It's that prose was never an interface. Verdicts belong in exit codes.

## Four exit codes, one contract

Every `browserbash run` and `browserbash testmd run` exits with the verdict:

| Exit code | Meaning |
|---|---|
| `0` | passed |
| `1` | failed — the objective or a verify step didn't hold |
| `2` | error — infrastructure or agent problem |
| `3` | timeout |

The granularity is the point. `1` is a product signal: a human should look, and silently auto-retrying it teaches your team to ignore red. `2` and `3` are environment signals — a grid hiccup, a dead endpoint, a run that outlived its budget — worth one automatic retry before failing the build:

```bash
browserbash testmd run .browserbash/tests/smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
code=$?
if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
  echo "infra-flavored exit ($code) - retrying once" >&2
  browserbash testmd run .browserbash/tests/smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
  code=$?
fi
exit $code
```

## The workflow

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
      - run: browserbash testmd run .browserbash/tests/smoke_test.md --agent --headless --timeout 180 > smoke.ndjson
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: smoke-ndjson
          path: smoke.ndjson
```

There is no "parse results" step. The run step fails exactly when the test fails, because the exit code is the verdict. Note the redirect: with `--agent`, NDJSON events go to stdout and human-readable output goes to stderr — so `smoke.ndjson` stays clean while the Actions log stays readable.

## What lands in the NDJSON artifact

Step events stream while the agent works:

```json
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked ref:12"}
```

The final line is always the terminal event:

```json
{"type":"run_end","status":"passed","summary":"Login flow verified","final_state":{"order_id":"12345"},"duration_ms":48211,"steps_executed":9,"provider":"lambdatest","test_url":"https://automation.lambdatest.com/build"}
```

`final_state` carries anything your steps stored ("Store the order id as 'order_id'"), and `test_url` deep-links to the session recording when you run on a cloud grid (`--provider lambdatest` or `--provider browserstack`). Pull fields with jq:

```bash
tail -1 smoke.ndjson | jq -r '.status, .duration_ms, .final_state.order_id'
```

## Flaky detection with duration_ms

Verdicts are binary; `duration_ms` is your early-warning channel. The SDET in our scenario keeps every `smoke.ndjson` artifact and runs a weekly pass over them:

```bash
for f in artifacts/*/smoke.ndjson; do
  tail -1 "$f" | jq -r '[.status, .duration_ms, .steps_executed] | @tsv'
done | sort -k2 -n
```

After three weeks, the illustrative numbers look like this: the checkout test's median is around 52,000 ms at 9 steps executed, but roughly one run in ten spikes past 150,000 ms with 14-15 steps executed, and two runs hit exit code `3`. The duration distribution exposed the flake before it ever turned a build red: a third-party chat widget was intermittently slow, and the agent burned extra steps waiting it out. Two fixes followed — the widget got stubbed on staging, and `--timeout` was set near twice the observed p95 instead of a guess.

Rules of thumb: investigate when `duration_ms` p95 drifts more than about 50% from baseline, or when `steps_executed` creeps well above the number of steps written in the markdown file. Both mean the agent is working harder than it should to reach the same verdict — the signature of a flaky page rather than a failing product.

## FAQ

### Why distinguish exit code 1 from 2?

Because the correct response differs. `1` means the product or the test's expectation broke — page a human, never silently rerun. `2` means infrastructure or agent trouble (credentials, grid capacity, network), where one automatic retry is reasonable. Pipelines that collapse the two train teams to rerun real failures until they pass.

### How do I use a stored value in a later CI step?

The `run_end` event is always the last line of the NDJSON stream, so `tail -1 smoke.ndjson | jq -r '.final_state.order_id'` gives you the value to export or pass downstream — no scraping.

### Can I run a whole directory of tests in one job?

Loop and let each file keep its own verdict and `Result.md`:

```bash
fail=0
for t in .browserbash/tests/*_test.md; do
  browserbash testmd run "$t" --agent --headless --timeout 180 > "$(basename "$t" .md).ndjson" || fail=1
done
exit $fail
```

A matrix job per file also works and parallelizes nicely — each entry gets its own exit code and artifact.
