---
title: Export AI Browser Test Results to JUnit XML for CI
description: "Export browser test results to JUnit XML from BrowserBash: parse --agent NDJSON plus exit codes into a testsuite file so Jenkins, GitLab, and GitHub show pass/fail."
date: 2026-06-27
category: ci
---

To export browser test results to JUnit XML, run BrowserBash with `--agent` so it emits NDJSON on stdout, capture the process exit code, and feed both into a small script that writes a single `<testsuite>` file. BrowserBash does not produce JUnit XML natively, and that is on purpose: it emits a clean, stable machine signal (NDJSON events plus exit codes 0/1/2/3), and you own the thin adapter that maps that signal into whatever format your CI dashboard already understands. This post shows the exact mapping, a working shell script, a sample XML, and the CI YAML that surfaces it in Jenkins, GitLab, and GitHub Actions.

## Why JUnit XML, and why an adapter

Almost every CI system speaks JUnit XML. Jenkins has the JUnit plugin, GitLab has `artifacts:reports:junit`, and GitHub Actions has a dozen test-reporter actions that all read the same `<testsuite>` / `<testcase>` shape. It is the lingua franca of "did the tests pass," and it is what makes a red X appear next to a commit, a flaky-test history build up, and a failed case show its message inline in a merge request.

BrowserBash speaks a different, equally machine-friendly dialect. When you pass `--agent`, every line on stdout is one JSON object, and the process exit code is the final verdict. That is a deliberate design: a stable contract that you can adapt to any consumer, instead of a pile of half-supported native exporters that drift out of date. The cost is honest: you write a converter. The benefit is that the converter is about forty lines of shell or Python, it lives in your repo, and you can change the mapping the day your dashboard needs something different.

If you want the full tour of the NDJSON contract first, read the [NDJSON agent mode tutorial](https://browserbash.com/blog/ndjson-agent-mode-tutorial). For the verdict side, the [exit codes in CI tutorial](https://browserbash.com/blog/browserbash-exit-codes-ci-tutorial) covers the 0/1/2/3 scheme in depth. This article assumes both and focuses on the conversion to XML.

## The signal you are converting

Start from a concrete run. Here is a BrowserBash test file, `checkout_test.md`, written as intent rather than selectors:

```markdown
# Checkout smoke test

1. Open {{base_url}} and accept the cookie banner if it appears
2. Search for "wireless keyboard"
3. Add the first result to the cart
4. Open the cart and verify the item count is 1
5. Proceed to checkout and verify the order summary shows a total
```

You run it in CI like this:

```bash
browserbash testmd run ./checkout_test.md \
  --agent --headless --timeout 180 \
  --variables '{"base_url":"https://staging.example.com"}'
```

With `--agent`, human-readable output goes to stderr and stdout is pure NDJSON. While the run executes you get step events:

```json
{"type":"step","step":3,"status":"passed","action":"click","remark":"Added first result to cart"}
```

And the last line is always a single `run_end`:

```json
{
  "type": "run_end",
  "status": "passed",
  "summary": "Cart shows 1 item and checkout total is visible.",
  "duration_ms": 41980,
  "steps_executed": 9
}
```

Two pieces of information drive the JUnit conversion: the **exit code** (the authoritative verdict) and the **`run_end` event** (the human-readable summary and timing). The intermediate `step` events are optional detail you can fold into `<system-out>` if you want a trail.

## The mapping: exit code to JUnit case

JUnit XML has three states for a `<testcase>`: a clean pass (no child element), a `<failure>` (an assertion the app failed), and an `<error>` (something broke before a verdict was reachable). BrowserBash exit codes map onto that almost one to one, with a small judgment call about timeouts:

| BrowserBash exit code | Meaning | JUnit XML representation |
| --- | --- | --- |
| `0` | passed | `<testcase>` with no failure/error child |
| `1` | failed (app assertion did not hold) | `<testcase>` with `<failure>` |
| `2` | error (infra or agent error, no verdict) | `<testcase>` with `<error>` |
| `3` | timeout (15s auto-wait ceiling exhausted, run did not finish) | `<testcase>` with `<error>` (or a `<failure>` if your team treats timeouts as test failures) |

The only opinion here is the last row. A timeout is genuinely ambiguous: it can mean the app hung (a real defect, so `<failure>`) or that the grid was slow and the step never got a fair chance (infra, so `<error>`). Pick one and be consistent. The script below treats `3` as an error so that flaky-infra timeouts do not poison your pass-rate trend, and leaves a one-line comment marking where to flip it.

There is a deeper point worth stating plainly. The exit code is the contract, not the prose. Do not grep the summary string for the word "fail" to decide the verdict. The summary is for humans reading the report; the exit code is what your adapter branches on. The [no-parsing exit codes](https://browserbash.com/blog/ci-exit-codes-no-parsing) writeup makes the case for why this separation keeps integrations from breaking every time the wording changes.

## A working converter script

Here is a self-contained Bash + jq adapter. It runs one BrowserBash test, captures stdout and the exit code, and writes a JUnit file with exactly one `<testcase>`. Save it as `bb-to-junit.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail

TEST_FILE="$1"
SUITE_NAME="$(basename "$TEST_FILE" .md)"
OUT_XML="${2:-results/${SUITE_NAME}.xml}"
mkdir -p "$(dirname "$OUT_XML")"

# Run the test. stdout is NDJSON; stderr stays human-readable.
ndjson="$(browserbash testmd run "$TEST_FILE" --agent --headless --timeout 180)"
code=$?

# Pull the final run_end line for summary + timing.
run_end="$(printf '%s\n' "$ndjson" | tail -1)"
summary="$(printf '%s' "$run_end" | jq -r '.summary // "no summary"')"
dur_ms="$(printf '%s' "$run_end" | jq -r '.duration_ms // 0')"
dur_s="$(awk "BEGIN { printf \"%.3f\", ${dur_ms}/1000 }")"

# XML-escape the summary so quotes and angle brackets do not break the file.
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' \
  -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }
msg="$(esc "$summary")"

# Map exit code -> JUnit case body. Timeout (3) is treated as <error> here.
case $code in
  0) body="" ;;
  1) body="<failure message=\"${msg}\" type=\"AssertionError\"/>" ;;
  2) body="<error message=\"${msg}\" type=\"RunError\"/>" ;;
  3) body="<error message=\"${msg}\" type=\"Timeout\"/>" ;;  # flip to <failure> if you prefer
  *) body="<error message=\"unexpected exit ${code}\" type=\"Unknown\"/>" ;;
esac

# failures / errors counters for the suite header.
fails=0; errs=0
[ "$code" -eq 1 ] && fails=1
{ [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; } && errs=1

# Fold the step trail into system-out so the report is debuggable.
steps="$(printf '%s\n' "$ndjson" | jq -rc 'select(.type=="step")' | esc_stream)" 2>/dev/null || steps=""

cat > "$OUT_XML" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${SUITE_NAME}" tests="1" failures="${fails}" errors="${errs}" time="${dur_s}">
  <testcase classname="browserbash.${SUITE_NAME}" name="${SUITE_NAME}" time="${dur_s}">
    ${body}
    <system-out><![CDATA[${summary}]]></system-out>
  </testcase>
</testsuite>
XML

echo "Wrote $OUT_XML (exit was $code)"
exit $code
```

A note on the `esc_stream` reference: that is a stand-in if you want to embed the raw step lines too. In the version above the `<system-out>` uses a CDATA block with the plain summary, which is the simplest safe choice; CDATA needs no entity escaping as long as your summaries never contain the literal sequence `]]>`. Keep it simple and you avoid an entire class of escaping bugs.

The script preserves the exit code at the end (`exit $code`), so the surrounding CI step still goes red on a real failure even though it also produced an XML artifact. That is the behavior you want: the XML is for the dashboard, the exit code is for the job result.

## Sample JUnit XML output

A passing run produces this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="checkout_test" tests="1" failures="0" errors="0" time="41.980">
  <testcase classname="browserbash.checkout_test" name="checkout_test" time="41.980">
    <system-out><![CDATA[Cart shows 1 item and checkout total is visible.]]></system-out>
  </testcase>
</testsuite>
```

A failing run (exit `1`) produces this, and this is the version that lights up a red case in your dashboard with the message visible inline:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="checkout_test" tests="1" failures="1" errors="0" time="38.520">
  <testcase classname="browserbash.checkout_test" name="checkout_test" time="38.520">
    <failure message="Cart count was 0 after adding the first result; expected 1." type="AssertionError"/>
    <system-out><![CDATA[Cart count was 0 after adding the first result; expected 1.]]></system-out>
  </testcase>
</testsuite>
```

## Many tests, one suite file

Most teams run several `*_test.md` files and want them all in one `<testsuite>` (or a `<testsuites>` wrapper with one suite per file). The cleanest pattern is to emit one `<testcase>` per file into a shared buffer, then write the header with the totals at the end. Here is the shape, abbreviated to the loop:

```bash
#!/usr/bin/env bash
set -uo pipefail
mkdir -p results
cases=""; total=0; fails=0; errs=0; suite_time=0

for f in tests/*_test.md; do
  name="$(basename "$f" .md)"
  ndjson="$(browserbash testmd run "$f" --agent --headless --timeout 180)"
  code=$?
  total=$((total+1))
  run_end="$(printf '%s\n' "$ndjson" | tail -1)"
  summary="$(printf '%s' "$run_end" | jq -r '.summary // "no summary"')"
  dur_s="$(printf '%s' "$run_end" | jq -r '(.duration_ms // 0)/1000')"
  suite_time="$(awk "BEGIN { print ${suite_time}+${dur_s} }")"

  case $code in
    0) child="" ;;
    1) child="<failure message=\"${summary}\" type=\"AssertionError\"/>"; fails=$((fails+1)) ;;
    2) child="<error message=\"${summary}\" type=\"RunError\"/>"; errs=$((errs+1)) ;;
    3) child="<error message=\"${summary}\" type=\"Timeout\"/>"; errs=$((errs+1)) ;;
  esac

  cases="${cases}
  <testcase classname=\"browserbash\" name=\"${name}\" time=\"${dur_s}\">${child}</testcase>"
done

{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo "<testsuite name=\"browserbash\" tests=\"${total}\" failures=\"${fails}\" errors=\"${errs}\" time=\"${suite_time}\">"
  echo "$cases"
  echo "</testsuite>"
} > results/browserbash.xml

# Fail the job if any case failed or errored.
[ $((fails+errs)) -eq 0 ]
```

The production hardening (XML-escaping every summary, guarding against `]]>` in CDATA, handling the case where a run crashes before writing any NDJSON) is left to you, because it is exactly the kind of small, repo-specific decision the adapter pattern is meant to give you control over. If you compose tests with `@import` (for example a shared `@import ./login_test.md` at the top of several flows), each top-level file is still one `browserbash testmd run` invocation and therefore one `<testcase>`; the imported steps run inline and do not split into their own cases.

## Wiring it into CI

The XML is useless until your CI system reads it. Each platform has a one-liner for that.

### GitHub Actions

GitHub does not render JUnit natively in the checks UI, so pair the artifact with a reporter action:

```yaml
name: browser-tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install -g browserbash-cli
      - name: Run browser tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: bash bb-to-junit-suite.sh   # writes results/browserbash.xml, exits non-zero on failure
      - name: Publish test report
        if: always()
        uses: mikepenz/action-junit-report@v4
        with:
          report_paths: results/browserbash.xml
```

The `if: always()` matters: you want the report published even when the test step failed, otherwise a red run shows no detail. For a deeper GitHub setup including artifact upload of `--record` webm and screenshots, see the [GitHub Actions tutorial](https://browserbash.com/blog/browserbash-github-actions-tutorial).

### GitLab CI

GitLab reads JUnit XML directly through `artifacts:reports:junit` and renders it in the merge request widget:

```yaml
browser-tests:
  image: node:20
  script:
    - npm install -g browserbash-cli
    - bash bb-to-junit-suite.sh
  artifacts:
    when: always
    reports:
      junit: results/browserbash.xml
    paths:
      - results/
```

Again, `when: always` so the report survives a failing job.

### Jenkins

With a declarative pipeline and the JUnit plugin:

```groovy
pipeline {
  agent any
  stages {
    stage('Browser tests') {
      steps {
        sh 'npm install -g browserbash-cli'
        sh 'bash bb-to-junit-suite.sh'
      }
    }
  }
  post {
    always {
      junit 'results/browserbash.xml'
      archiveArtifacts artifacts: 'results/**', allowEmptyArchive: true
    }
  }
}
```

The `junit` step in the `post { always { } }` block ingests the XML into Jenkins' trend graphs and per-build test view regardless of stage outcome.

## Adding artifacts: record and Result.md

JUnit XML gives you pass/fail and a message. For a failed UI test, you usually want to see what happened. BrowserBash writes a `Result.md` per run, and with `--record` it captures a webm video plus screenshots. Point your adapter or CI step at those and attach them next to the XML:

```bash
browserbash testmd run ./checkout_test.md \
  --agent --headless --record --timeout 180
# produces NDJSON on stdout, plus Result.md and a recording on disk
```

Then archive the recording directory in the same `always` block as the JUnit publish. The XML tells the dashboard the case is red; the webm tells the engineer why. JUnit does not have a first-class field for video, so most teams either link to the archived artifact from the `<system-out>` text or rely on the CI platform's own artifact browser sitting next to the test report.

## Honest limits

This is a thin adapter you own, and a few things follow from that honestly.

**You maintain the converter.** BrowserBash does not ship a JUnit exporter, so when JUnit's schema expectations in your specific reporter action change, or you want `<properties>`, `<skipped>`, or retry annotations, you edit the script. That is the trade for not depending on a native exporter that lags behind your needs. The flip side: it is forty lines, in your repo, under your control.

**One run is one case, not one assertion per case.** A `*_test.md` file maps to a single `<testcase>`. The intermediate `step` events are not assertions in the JUnit sense; they are actions the agent took. If your dashboard's value comes from fine-grained per-assertion history, you will need to split a flow into several smaller test files (one objective each) so each becomes its own case. That is more files but a more granular report.

**The timeout mapping is a judgment call.** Exit `3` does not tell you whether the app hung or the grid was slow. Whichever way you map it (error or failure), some runs will be misclassified, and no script can fully resolve that ambiguity. Treating it as `<error>` keeps infra flakiness out of your failure rate but can hide a genuinely hung page; the reverse trade applies if you map it to `<failure>`.

**Timing is approximate.** The `duration_ms` in `run_end` is wall-clock for the whole objective, including model thinking time, not a precise per-assertion timer. It is fine for trend graphs and "this got slower" signals, not for sub-second performance budgeting.

**Non-determinism is real.** Because the agent re-derives elements from the live accessibility tree and DOM on every run rather than replaying a saved selector script, two runs of the same test can take slightly different paths and occasionally disagree on a borderline flow, especially with a small local model (8B-class models get flaky on long flows). Use a 70B-class model (Qwen3, Llama 3.3) or a hosted model for the hard flows that feed your dashboard, so the JUnit verdict you publish is one you trust. See the [features page](https://browserbash.com/features) for how element-finding works, and the [learn hub](https://browserbash.com/learn) for model selection guidance.

## FAQ

### Does BrowserBash output JUnit XML natively?

No. BrowserBash emits NDJSON with `--agent` and a verdict via exit codes (0 pass, 1 fail, 2 error, 3 timeout). JUnit XML is produced by a small adapter you write, which maps that signal into `<testsuite>` and `<testcase>` elements. This is intentional: the NDJSON contract is stable and you adapt it to any consumer, rather than waiting on a built-in exporter to support your dashboard's exact needs.

### How do I map a BrowserBash timeout to JUnit?

Exit code `3` (timeout) is ambiguous, so you choose. Map it to `<error>` if you want infra-related slowness kept out of your failure rate, or to `<failure>` if your team treats a hung page as a defect. Pick one and apply it consistently across all your tests so your pass-rate trend stays meaningful. The script in this post uses `<error>` and marks the line where you flip it.

### Should I parse the run summary text to decide pass or fail?

No. Branch on the process exit code, never on the words in the summary. The summary is human-readable prose that can be reworded; the exit code is the stable contract. Parsing prose is the most common way these integrations break. Use the summary only as the `message` attribute and `<system-out>` content, after the exit code has already decided the verdict.

### Can I get one JUnit case per step instead of per test?

Not cleanly, and you probably do not want it. The `step` events in the NDJSON are agent actions, not JUnit assertions, so promoting them to `<testcase>` elements produces a noisy, misleading report. If you need finer granularity, split your flow into multiple smaller `*_test.md` files, one objective each, and let each file become its own `<testcase>`. That gives you real per-scenario history without misrepresenting actions as assertions.
