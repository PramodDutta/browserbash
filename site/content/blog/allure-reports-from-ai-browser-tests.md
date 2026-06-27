---
title: Generate Allure Reports From AI Browser Test Runs
description: "Build an allure report browser tests workflow: convert BrowserBash NDJSON and Result.md into Allure results with steps, status, screenshots, and video."
date: 2026-06-27
category: ci
---

To produce an Allure report from BrowserBash runs, you write a small converter that turns the `--agent` NDJSON stream and the per-run `Result.md` into Allure's result format: one `*-result.json` file per test holding the title, status, and an ordered list of step events, plus the recorded screenshots and `.webm` video registered as attachments. Drop those JSON files into an `allure-results/` directory in CI, point `allure generate` at it, and you get the familiar Allure dashboard with a step timeline, pass and fail counts, and clickable media. BrowserBash does not ship a native Allure adapter, so the converter is the bridge, and this guide walks through writing one honestly, including where the mapping is clean and where it is approximate.

The reason this works at all is that BrowserBash was built to be machine-readable in CI. The `--agent` flag emits NDJSON (one JSON object per line), exit codes carry the verdict, and `--record` captures a screenshot and a full session video. Allure, for its part, is format-driven: it does not care which framework produced the results as long as the JSON on disk matches its schema. So the job is translation, not integration, and translation is something you fully control.

## What Allure actually needs on disk

Allure is two pieces. The report viewer is a static site. The input it consumes is a folder, conventionally `allure-results/`, full of JSON files plus any attachment binaries. The CLI command `allure generate allure-results -o allure-report` reads that folder and emits the browsable HTML. Nothing in that pipeline assumes a particular test runner, which is exactly why a CLI like BrowserBash can feed it.

The core file is a test result, named `<uuid>-result.json`. The fields that matter for an AI browser run are a handful:

```json
{
  "uuid": "b1e2...",
  "name": "Checkout: guest can buy a laptop",
  "status": "passed",
  "stage": "finished",
  "start": 1719500000000,
  "stop": 1719500048211,
  "steps": [
    { "name": "navigate to /products", "status": "passed",
      "start": 1719500000100, "stop": 1719500002400 },
    { "name": "click Add to cart", "status": "passed",
      "start": 1719500002500, "stop": 1719500004900 }
  ],
  "attachments": [
    { "name": "Session video", "source": "run.webm", "type": "video/webm" },
    { "name": "Final screenshot", "source": "final.png", "type": "image/png" }
  ]
}
```

`status` is one of `passed`, `failed`, `broken`, or `skipped`. Each step has its own name, status, and optional timing. Attachments reference a `source` filename that must physically sit in the same `allure-results/` folder. Get those right and Allure renders the rest.

That is the whole target. Everything below is about producing this shape from a BrowserBash run.

## What BrowserBash gives you to convert

A single BrowserBash run produces three artifacts that line up neatly with Allure's needs.

First, the NDJSON stream from `--agent`. Each step the agent takes is a line:

```json
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked ref:12"}
```

`status` on a step is `running`, `passed`, or `failed`. The terminal line is always a single `run_end` event with the overall verdict and timing:

```json
{
  "type": "run_end",
  "status": "passed",
  "summary": "Logged in and completed checkout.",
  "duration_ms": 48211,
  "steps_executed": 9,
  "provider": "local"
}
```

Run-level `status` is `passed`, `failed`, `error`, or `timeout`, mirroring the process exit codes `0`, `1`, `2`, `3`. If you have not worked with the stream before, the [BrowserBash agent mode and NDJSON tutorial](https://browserbash.com/blog/browserbash-agent-mode-ndjson-tutorial) covers the full schema and a bash plus jq loop.

Second, the `Result.md` file written per run. It is the human-readable summary: objective, outcome, and a prose step list. It is handy for a stakeholder-facing description field, and the broader thinking on those summaries lives in [browser test reports and stakeholder summaries](https://browserbash.com/blog/browser-test-reports-and-stakeholder-summaries).

Third, the media from `--record`: a `.webm` session video and screenshots. Allure shows both inline, which is where an AI browser report earns its keep, because a reviewer can watch the agent do the thing rather than read about it. The recording mechanics are covered in [record browser test videos from the CLI](https://browserbash.com/blog/record-browser-test-videos-cli).

So the mapping is: `run_end.status` becomes the Allure test status, each `step` line becomes an Allure step, `duration_ms` and a captured start time become `start` and `stop`, and the recorded files become attachments. That is a clean, mechanical transform.

## A minimal test in intent, not selectors

Before the converter, here is the kind of test you would actually run. BrowserBash tests are Markdown files describing intent, not scripts of CSS selectors. A `checkout_test.md`:

```markdown
# Guest checkout for a single laptop

@import ./fixtures/open_store_test.md

1. Search for "ThinkPad X1" and open the first result
2. Add it to the cart
3. Go to the cart and click Checkout
4. Fill the guest email {{email}}
5. Complete the order with the test card {{card}}
6. Confirm an order number is shown and store it as 'order_id'
```

The title becomes the Allure test name, the numbered steps map to the agent's actions, `@import` pulls in shared setup, and `{{email}}` and `{{card}}` are variables that get masked in logs when marked secret. You run it with:

```bash
browserbash testmd run ./checkout_test.md --agent --headless --record
```

The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not brittle CSS classes, and Playwright's built-in auto-wait handles late-rendering elements up to a 15-second ceiling with no manual sleeps. None of that changes the Allure mapping. It just means the steps Allure displays describe behavior a human recognizes rather than locator internals.

## The converter: NDJSON to allure-results

Here is the heart of it, a Node script that reads NDJSON on stdin and writes one Allure result file. It is intentionally small so you can read every line and adapt it.

```javascript
// ndjson-to-allure.mjs
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";

const OUT = "allure-results";
mkdirSync(OUT, { recursive: true });

const lines = readFileSync(0, "utf8").trim().split("\n");
const events = lines.map((l) => JSON.parse(l));

const runEnd = events.find((e) => e.type === "run_end");
const stepEvents = events.filter(
  (e) => e.type === "step" && e.status !== "running"
);

// Map BrowserBash verdict to Allure status.
const statusMap = {
  passed: "passed",
  failed: "failed",
  error: "broken",
  timeout: "broken",
};

const stop = Date.now();
const start = stop - (runEnd?.duration_ms ?? 0);

const steps = stepEvents.map((e) => ({
  name: `${e.action}: ${e.remark ?? ""}`.trim(),
  status: e.status === "passed" ? "passed" : "failed",
  stage: "finished",
}));

const result = {
  uuid: randomUUID(),
  name: process.env.BB_TEST_NAME ?? runEnd?.summary ?? "BrowserBash run",
  status: statusMap[runEnd?.status] ?? "broken",
  statusDetails: { message: runEnd?.summary ?? "" },
  stage: "finished",
  start,
  stop,
  steps,
  labels: [
    { name: "suite", value: "AI browser tests" },
    { name: "framework", value: "browserbash" },
  ],
  attachments: [],
};

writeFileSync(
  `${OUT}/${result.uuid}-result.json`,
  JSON.stringify(result, null, 2)
);
console.error(`wrote ${result.uuid}-result.json`);
```

Two design choices are worth calling out. The run-level `error` and `timeout` map to Allure's `broken`, not `failed`, because in Allure semantics `broken` means the test could not run to a verdict, which is exactly what an agent or infrastructure error is. Keeping a real app failure (`failed`) distinct from a tooling failure (`broken`) is the same discipline the exit codes enforce, and it keeps your dashboard honest.

The second choice is that step timing here is coarse. The NDJSON step events carry `status` and `action` reliably, but per-step millisecond timestamps are not part of the documented schema, so the script gives steps a status and a name without fake `start` and `stop` values. Inventing precise per-step durations would be dishonest. Better an accurate ordered list than a fabricated waterfall.

## Wiring attachments: screenshots and video

Attachments are the part reviewers love and the part that needs the most care, because Allure resolves them by filename relative to `allure-results/`. The pattern: copy each recorded file into `allure-results/` (or write it there directly) and add an entry to the result's `attachments` array.

Extend the converter with an attachments step driven by environment variables your CI sets after the run:

```javascript
import { copyFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

function attach(result, filePath, label, type) {
  if (!filePath || !existsSync(filePath)) return;
  const dest = `${OUT}/${result.uuid}-${basename(filePath)}`;
  copyFileSync(filePath, dest);
  result.attachments.push({
    name: label,
    source: basename(dest),
    type,
  });
}

attach(result, process.env.BB_VIDEO, "Session video", "video/webm");
attach(result, process.env.BB_SCREENSHOT, "Final screenshot", "image/png");
attach(result, process.env.BB_RESULT_MD, "Result.md", "text/markdown");
```

Prefixing the copied filename with the result UUID avoids collisions when you run many tests into one `allure-results/` folder. Registering `Result.md` as a `text/markdown` attachment is a nice touch: the full human summary rides along inside the report, one click from the step list.

## Putting it in CI

The full loop in a CI job is four moves: run the test with `--agent --record`, capture stdout, find the recorded media, and run the converter. A shell sketch:

```bash
set -o pipefail
mkdir -p allure-results

out=$(browserbash testmd run ./checkout_test.md \
  --agent --headless --record \
  --variables '{"email":"qa@example.com","card":{"value":"4111111111111111","secret":true}}')
code=$?

# Recorded artifacts land in the run's record directory; resolve the newest.
rec_dir=$(ls -dt browserbash-records/* | head -1)

BB_TEST_NAME="Guest checkout" \
BB_VIDEO="$rec_dir/run.webm" \
BB_SCREENSHOT="$rec_dir/final.png" \
BB_RESULT_MD="$rec_dir/Result.md" \
  node ndjson-to-allure.mjs <<< "$out"

# Build the static report.
allure generate allure-results --clean -o allure-report

exit $code
```

Note that the secret card value rides in `--variables` with `"secret": true`, so it is masked as `*****` in the NDJSON. That masking matters here precisely because the NDJSON is about to be parsed, attached, and published. Treat the path to the record directory as version-specific and resolve it at runtime rather than hardcoding it.

Preserve the exit code at the end. Allure generation should never swallow the verdict: if the app failed, the job should still go red regardless of whether the report built. The report is evidence, not the gate. Exit codes are the gate.

For a multi-test suite, loop the run-and-convert pair over each `*_test.md` file, all writing into the same `allure-results/` folder, then run `allure generate` once at the end. Allure aggregates them into a single dashboard with suite-level pass and fail counts.

You can read more about how this fits the broader CI story on the [features page](https://browserbash.com/features), and there is a hands-on path for the whole CLI on the [learn page](https://browserbash.com/learn).

## Trace data and a richer report

If you run the `builtin` engine (an Anthropic tool-use loop) instead of the default `stagehand`, BrowserBash captures native Playwright traces. Those traces are a separate, deeper artifact than the NDJSON step list: they hold network activity, DOM snapshots, and action timing that Allure's simple step model does not natively represent. You can attach the trace `.zip` as an Allure attachment so reviewers can download and open it in the Playwright trace viewer, which is the right division of labor: Allure for the at-a-glance dashboard, the trace for forensic detail. Reading a trace is its own skill, covered in [how to read a Playwright trace from BrowserBash](https://browserbash.com/blog/read-a-playwright-trace-from-browserbash).

```javascript
attach(result, process.env.BB_TRACE, "Playwright trace", "application/zip");
```

Allure will not render the trace inline (it is not a media type Allure understands), but it will offer it as a download, which is exactly what you want.

## Honest limits

This approach is real and useful, but it is a converter, not a first-class framework integration, and pretending otherwise would mislead you. Here is where it falls short of native Allure adapters in tools like Playwright Test, pytest, or JUnit.

Step granularity is coarser than a code-level framework. A native Allure step in Playwright Test wraps an exact line of code with precise timing. A BrowserBash step is one agent action, named from `action` and `remark`. The mapping is faithful, but you will not get the rich nested-step trees that hand-instrumented `allure.step()` calls produce in framework tests. If your reviewers expect deeply nested, sub-millisecond step trees, this will feel flatter.

Per-step timing is approximate. As noted, the documented NDJSON schema gives step status and action reliably but not per-step timestamps, so the converter assigns overall run timing from `duration_ms` rather than a true per-step waterfall. The total duration is accurate; the internal distribution is not reconstructed. Do not present the step timeline as precise profiling data.

History and trends need extra plumbing. Allure's trend graphs (flakiness, history of a given test across runs) rely on a stable test identity and a preserved `history/` directory carried between runs. With UUIDs generated fresh each run, you must set a deterministic `historyId` (for example, a hash of the test file path) and persist Allure's `history` folder in CI cache, or the trend charts stay empty. That is solvable but is manual work a native integration does for you.

There is non-determinism at the source. Because the agent re-derives what to do from the live page state on every run rather than replaying a saved selector script, two runs of the same objective can take slightly different paths: an extra step here, a different order there. This is a property of agentic testing, not a bug, and it is not self-patching either, it simply reads the current page each time. But it means your Allure step list can vary run to run for the same test, which looks odd if you expect identical structure every time. Set expectations with your team.

Flaky-versus-broken classification is your judgment. Allure has a `flaky` marker and retry semantics. The converter above maps cleanly to `passed`, `failed`, and `broken`, but deciding that a given `error` was a transient flake worth a retry rather than a genuine break is a policy you encode, not something the run_end event decides for you. Mapping `error` and `timeout` to `broken` is a sensible default, not a universal truth.

None of these are reasons to avoid the approach. They are reasons to describe the report accurately to stakeholders: a clear, media-rich Allure dashboard of AI browser runs, with step lists and attached video, that trades some of the fine-grained instrumentation of a code-native adapter for the zero-maintenance, intent-based authoring that BrowserBash is built around.

## FAQ

### Does BrowserBash have a built-in Allure reporter?

No. There is no native `--reporter allure` flag. BrowserBash emits NDJSON with `--agent`, writes a `Result.md` per run, and records video and screenshots with `--record`. You convert those into Allure's `*-result.json` format with a small script like the one above, then run `allure generate`. The format is stable and documented, which is what makes the converter reliable.

### How do I get screenshots and video into the Allure report?

Run with `--record` so BrowserBash captures a `.webm` session video and screenshots, then copy each file into the `allure-results/` folder and add an entry to the result's `attachments` array with a matching `source` filename and a correct MIME type (`video/webm`, `image/png`). Allure resolves attachments by filename relative to that folder, so the file must physically live there. Prefix copied filenames with the test UUID to avoid collisions across a suite.

### Can I show trend and flakiness graphs across runs?

Yes, with extra setup. Allure trends need a stable `historyId` per test and a preserved `history/` directory carried between CI runs. Set `historyId` to something deterministic like a hash of the test file path, and cache Allure's `history` folder in your CI between builds. Without that, each run looks brand new and the trend charts stay empty. A native framework adapter handles this for you; here it is manual.

### Should Allure report generation decide whether my build passes?

No. Keep the verdict and the report separate. BrowserBash exit codes (`0` passed, `1` failed, `2` error, `3` timeout) are the gate, so preserve and re-emit that code at the end of the job. Allure generation is evidence that should run regardless of pass or fail, never the thing that decides the build result. If you let report generation swallow the exit code, a real failure can sail through green.
