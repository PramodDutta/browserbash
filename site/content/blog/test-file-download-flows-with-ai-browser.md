---
title: Testing File Download Flows and Saved Files With AI
description: "Test file download flows with AI: confirm a button triggers a download, the right file lands on disk, and verify the filename and path without selectors."
date: 2026-06-27
category: testing
---

To test a file download with an AI browser agent, you state the objective in plain English ("click Export CSV and confirm a file downloads"), and the agent clicks the button, waits for the browser's download event to finish, and checks that a file actually landed in the downloads directory with the expected name. The reliable signals are existence (a file appeared), filename or extension (it is the `invoice.pdf` or `report.csv` you asked for), and the save path (where the browser put it). What an AI agent does not do well on its own is open the binary and verify the contents byte by byte, so the honest pattern is: let the agent prove the download happened and the right file landed, then hand deep content assertions to a separate step. The rest of this article shows how to do that with BrowserBash, where it works, and where it does not.

I have wired up download tests in Selenium, raw Playwright, and now agent-driven tools, and the download flow is one of the sneakier things to get right. The button is easy. The waiting is not, the filename is not, and "did the bytes actually arrive" is a question most teams answer badly.

## Why download flows are harder than they look

A download is not a page transition. When you click "Export CSV," nothing visibly changes on the page in most apps: no navigation, no new DOM, often not even a toast. The browser quietly starts a transfer to disk in the background, and that invisibility is why naive tests are flaky. A script that clicks and immediately checks for a file fails half the time because the transfer has not finished. A script that clicks and waits a fixed three seconds passes on a fast machine and fails in CI on a slow one.

There are three distinct things worth verifying, and teams conflate them constantly:

- **The trigger fired.** Clicking the button actually started a download, rather than opening a new tab, throwing a 500, or doing nothing because a modal swallowed the click.
- **The file landed.** A real file now exists on disk, fully written, not a `.crdownload` or `.part` placeholder mid-transfer.
- **The file is the right one.** The name matches (`statement-2026-06.pdf`), the extension is correct, the size is non-zero, and ideally the contents are what you expected.

The first two are squarely in an AI browser's wheelhouse. The third splits: name, extension, and size are easy; full content verification is the honest limit I will get to.

## What an AI browser agent verifies on a download

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You describe the goal in English and it drives a real browser to do it. Install once:

```bash
npm install -g browserbash-cli
```

The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, so a button labeled "Export CSV" or "Download invoice" is found by its accessible name the way a human reads it. For downloads, the agent leans on Playwright's built-in download handling underneath, which is the part that matters: Playwright exposes a real download event and a path to the saved file, so the agent is not guessing from pixels whether a file arrived.

Run a single objective straight from the command line:

```bash
browserbash run "Go to the billing page, click the Export CSV button, wait for the download to finish, and confirm a CSV file was saved"
```

The agent locates the export control by its accessible name, clicks it, listens for the browser's download event rather than watching the DOM for a change that may never come, waits for the transfer to complete (the placeholder file is renamed to its final name when fully written), then reports the saved filename and path with a pass or fail verdict on whether a file landed. You wrote one sentence. You did not write a `waitForEvent('download')` handler, a polling loop over the downloads folder, or a cleanup routine for stale `.crdownload` files.

## Waiting correctly: no manual sleeps

The single biggest source of download flakiness is bad waiting, and this is where the AI approach earns its keep. BrowserBash relies on Playwright's built-in auto-wait with a 15-second ceiling, and there are no manual sleeps in your test. You never write "wait 3 seconds and hope." The agent waits for the actual completion signal: the download event resolving and the temporary file being renamed to its final name.

A `report.csv.crdownload` file (Chrome) or `report.csv.part` file (Firefox) means the transfer is still in flight, and checking the file while that placeholder exists is how you read a half-written file and get nonsense. Because the agent waits for the rename rather than the first appearance of any file, it sees the finished artifact, not a fragment. For the broader waiting philosophy and how the agent handles content that appears late or behind lazy loading, see [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis). Downloads are a special case of the same problem: an event you must wait for, not a clock you can race.

## Writing a download test as a *_test.md file

For anything you want to keep and run in CI, move from a one-off `run` to a Markdown test file. BrowserBash tests are intent, not selectors. A `*_test.md` file has a `#` title, steps as `-` or `1.` list items, and supports `@import` composition and `{{variables}}` with secret masking in logs.

Here is a complete `csv_export_test.md`:

```markdown
# Export billing data to CSV

1. Go to {{base_url}}/billing
2. Click the "Export CSV" button
3. Wait for the download to finish
4. Confirm a file with a .csv extension was downloaded
5. Confirm the downloaded filename contains "billing"
6. Confirm the saved file is not empty
```

Run it:

```bash
browserbash testmd run ./csv_export_test.md
```

The steps read like instructions you would give a new teammate, because that is exactly what they are. Note what each verification step targets: extension (`.csv`), a filename substring (`billing`), and a non-empty file. Those are the three checks an agent can make reliably without opening and parsing the file's internals.

If you have a login flow guarding the billing page, compose it instead of repeating it:

```markdown
# Export billing data to CSV

@import ./login_test.md

1. Click the "Export CSV" button
2. Wait for the download to finish
3. Confirm a PDF or CSV file was saved with a sensible name
```

The `@import` pulls the login steps in so your download test stays focused on the download. Variables like `{{base_url}}` and any secrets are substituted at run time, and secret values are masked in the logs so a token never leaks into CI output.

## Verifying the filename and path

Filename verification is where download tests prove they tested the *right* download, not just *a* download. Apps generate filenames that carry meaning: `invoice-{{order_id}}.pdf`, `statement-2026-06.pdf`, `export-{{date}}.csv`. A test that only checks "a file downloaded" happily passes when the app serves last month's statement, a generic `download.bin`, or an error page saved as HTML.

Be specific in the step. Instead of "a file downloaded," write what you actually expect:

```markdown
1. Click "Download invoice"
2. Wait for the download to finish
3. Confirm the downloaded file is named "invoice-{{order_id}}.pdf"
```

The agent can verify the name matches, that the extension is `.pdf` and not `.html` (the classic failure where a server error gets saved as a file), and that the file lives in the expected downloads path. Those three together catch the majority of real download bugs: wrong file, wrong type, nothing saved.

On the save path: where a browser drops a download depends on its profile and configuration. In a controlled run the agent works against a known downloads directory, so "the file landed at the expected path" is meaningful. Keep the path expectation aligned with the environment you actually run in, especially between local and CI.

## Running download tests in CI

A broken export is the kind of bug that ships silently and gets reported by an angry customer, not a dashboard, which is why these tests earn their place. BrowserBash is built for CI from the same binary.

```bash
browserbash testmd run ./csv_export_test.md --agent --headless
```

The `--agent` flag emits NDJSON so a pipeline can parse each step as structured events. Exit codes are unambiguous: `0` pass, `1` fail, `2` error, `3` timeout. A download that never completes within the wait ceiling surfaces as a clean timeout (`3`) rather than a hung job, which is exactly the signal you want when an export endpoint is down.

`--headless` runs without a visible browser for CI runners. When a download test fails and you need to see why, add recording:

```bash
browserbash testmd run ./csv_export_test.md --agent --headless --record
```

`--record` captures a webm video plus screenshots, and a `Result.md` is written per run. For a download failure, the recording shows whether the click landed, whether a modal intercepted it, or whether the button did nothing, which beats re-running locally and squinting. Full walkthrough: [record browser test videos from the CLI](https://browserbash.com/blog/record-browser-test-videos-cli). For the complete list of flags, providers, and exit codes, see the [BrowserBash CLI flags reference](https://browserbash.com/blog/browserbash-cli-flags-reference-tutorial).

## Choosing an engine and a model

BrowserBash ships two engines, and both handle downloads through Playwright's mechanics underneath. The default, **stagehand** (MIT, by Browserbase), observes the live DOM at each step and decides the next action from what is rendered right then. The alternative, **builtin**, is an Anthropic tool-use loop that captures native Playwright traces and re-derives the selector on every action from a fresh snapshot, never cached across runs. Either way the agent re-reads live state each run rather than replaying a saved selector script: it is looking again every time, not patching a stored locator.

The model matters more than the engine here, because the tricky part is reasoning about a multi-step flow (navigate, log in, open a menu, click export, wait) without losing the thread. The default model resolution is `auto`: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free models exist. Small local models (8B parameters and under) get flaky on long flows and can skip the wait step or declare success early. For a multi-step download behind a login, reach for a 70B-class local model (Qwen3, Llama 3.3) or a capable hosted model. Running local means nothing leaves your machine, which matters when the file is a customer invoice or financial statement.

## Honest limits: what AI download testing does *not* do well

Here is where download testing with an AI browser hits real walls, and what to do instead.

**It does not deeply inspect file contents.** This is the big one. The agent reliably confirms a file exists, has the right name and extension, and is non-zero in size. It does *not* open your PDF and confirm the invoice total is `$1,240.00`, or parse your CSV and assert that row 7, column 3 equals the order ID. Verifying a download triggered and the right file landed is a browser concern; verifying the bytes inside are correct belongs in a separate step. Get the file on disk with the AI browser, then let `pdfplumber`, a CSV reader, or a spreadsheet library do the content assertion. Two stages is the correct design, not a workaround.

**Exact byte-for-byte matching is brittle by nature.** Comparing a download against a golden fixture breaks the moment the export includes a timestamp, a generated ID, or a reordered column. That is a property of the data, not the tool. Assert on stable fields, not a full-file hash, unless the file is genuinely deterministic.

**"Save As" dialogs and OS-native pickers are out of scope.** BrowserBash works with the browser's automatic-download path, where the file goes straight to the downloads directory. A native OS save dialog lives outside the page and outside the browser's automation surface. Configure the environment for automatic downloads instead of relying on the picker.

**In-browser viewers are not downloads.** A PDF that opens in the browser's built-in viewer instead of saving did not trigger a download event. The test will correctly report that no file landed, which reads as a false failure if you expected a viewer. Write the objective to match the behavior you are actually testing.

**Very small local models will lie about success.** On a long flow, an 8B-class model may report "downloaded successfully" without confirming the file. Model capability is the floor under your trust. Size up the model for anything important, and keep the deterministic file-existence check as the thing you actually believe.

## How this compares to Playwright and Selenium directly

If you already write Playwright tests, you can test downloads with `page.waitForEvent('download')`, `download.suggestedFilename()`, and `download.path()`. It works well and gives full control, at the cost of maintaining that handler, the export-button selectors, and the waiting logic, and re-fixing selectors when the markup shifts. Selenium can do it too, though it has historically been clunkier because the WebDriver protocol has no first-class download event, so teams poll the filesystem or configure the browser profile carefully.

The AI-browser trade: you give up hand-written download handlers and selectors in exchange for tests written in English that survive cosmetic UI changes, because the agent re-reads the page each run instead of binding to a class name. For a stable, high-volume download path that never changes, a tuned Playwright test is faster and cheaper to run. For a flow buried behind a login, a menu, and a modal that gets redesigned every quarter, describing the intent is the lower-maintenance bet. Use the one whose failure mode you can live with.

If your download test is really a "trigger an export, then check the exported data" workflow, the companion is pulling values back out of the app for comparison, covered in [extract and store data with BrowserBash](https://browserbash.com/blog/browserbash-extract-and-store-data-tutorial). New to the tool? Start at [BrowserBash Learn](https://browserbash.com/learn).

## FAQ

### How do I test that clicking a button downloads a file?

Write the objective so it includes the wait: `browserbash run "Click the Export CSV button, wait for the download to finish, and confirm a CSV file was saved"`. The agent clicks the button by its accessible name, listens for the browser's download event, waits for the transfer to complete (so it does not read a half-written file), and reports pass or fail on whether a real file landed. For a repeatable version, put those steps in a `*_test.md` file and run it with `browserbash testmd run`.

### Can BrowserBash verify the contents inside a downloaded PDF or CSV?

Not deeply, and you should not ask it to. The agent reliably confirms the file exists, has the right name and extension, and is non-empty. To assert that an invoice total or a specific CSV cell is correct, run a separate step after the download that opens the saved file with a PDF or CSV library and checks the parsed values. Land the file with the AI browser, inspect its bytes with plain code.

### How does the agent avoid reading a half-finished download?

It waits for the completion signal rather than a timer. Browsers write downloads to a temporary placeholder (`.crdownload` in Chrome, `.part` in Firefox) and rename it to the final filename only when fully written. BrowserBash uses Playwright's built-in download handling, with a 15-second wait ceiling and no manual sleeps, so it acts on the finished file rather than a fragment.

### What if my download opens a native "Save As" dialog?

That is the main scenario AI browser testing does not cover, because an OS-native save dialog lives outside the page and the browser's automation surface. The supported path is automatic-download behavior, where the file goes straight to the downloads directory without a picker. Configure your environment for automatic downloads and the agent can see, name-check, and confirm the saved file. A forced native dialog needs OS-level automation outside this tool's scope.

## The takeaway

Testing a download flow with an AI browser comes down to one honest division of labor. The agent handles the flake-prone front half: find the export button by its label, click it, wait for the real completion event instead of a guessed timer, and confirm a correctly named, non-empty file landed on disk. It is not the tool for cracking that file open and auditing every value inside. Let BrowserBash prove the download happened and the right file arrived, then hand the contents to a parser built to read them.
