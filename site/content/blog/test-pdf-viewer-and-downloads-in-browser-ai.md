---
title: Testing In-Browser PDF Viewers and PDF Downloads With AI
description: "Test PDF viewer in browser with AI: trigger a PDF download, assert the file landed, verify the download trigger, and the limits of reading rendered PDFs."
date: 2026-06-27
category: testing
---

To test a PDF viewer in the browser with an AI agent, split the job into the parts the agent handles well and the part it does not. The agent reliably proves the trigger fired (a "View invoice" or "Download statement" control did something), proves a real PDF file landed on disk when the flow is a download (the file exists, the name and `.pdf` extension are right, the size is non-zero), and captures recorded evidence of the sequence. What it cannot do on its own is read the text painted inside a rendered PDF, because most in-browser viewers draw onto a `<canvas>` or hide the document inside an `<embed>` or `<iframe>` that exposes no accessible text. So the honest pattern is: let the agent verify the trigger and the saved file, record the run for evidence, and hand byte-level content checks to a separate step outside the browser. This article shows how to do that with BrowserBash, where it holds, and where it does not.

I have written PDF download tests in Selenium, raw Playwright, and now agent-driven tooling, and PDFs are deceptively nasty. The button is trivial. Everything after the click (where did the PDF go, is it the right one, can I even see what is inside it) is where teams quietly accept flaky or hollow assertions.

## The three flavors of "PDF in the browser"

"Test the PDF" means at least three different things, and conflating them is the root of most bad PDF tests. Pin down which one you are looking at before you write a single step.

- **PDF download.** Click a control, the browser saves a `.pdf` file to disk. No viewer involved. This is the most testable flavor.
- **PDF rendered in a native viewer.** Click a link, the browser's built-in PDF plugin (Chrome's PDFium) opens the document inside an `<embed>` or a new tab. You see the PDF but the DOM around it tells you almost nothing.
- **PDF rendered by a JavaScript viewer.** A library like PDF.js paints each page onto a `<canvas>` element inside the app's own DOM. The pixels look like a document; the accessibility tree sees a canvas with no readable text.

The first flavor is squarely in an AI browser agent's wheelhouse, because a download is a real, observable event. The second and third are where the honest limits live, and most of this article is about not pretending otherwise.

## What the agent verifies, and what it cannot

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You describe the goal in plain English and it drives a real Chrome browser to do it. Install once:

```bash
npm install -g browserbash-cli
```

The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, so a link labeled "View invoice PDF" or a button labeled "Download statement" is located by its accessible name the way a human reads it. It handles iframes and Shadow DOM, which matters here because PDF viewers are often mounted inside an iframe. For the deeper mechanics of how it resolves controls, see [how BrowserBash finds elements with the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree).

Here is the split, stated plainly so nobody is surprised in code review:

| What you want to check | Can the agent do it directly? |
|---|---|
| The "View/Download PDF" control exists and is clickable | Yes, by accessible name |
| Clicking it triggers a download | Yes, via the browser download event |
| A `.pdf` file landed on disk, fully written | Yes |
| Filename and extension are correct | Yes |
| File size is non-zero | Yes |
| A viewer iframe/embed appeared on the page | Partially, the container is visible in the DOM |
| The text inside a canvas-rendered PDF says "Invoice #1042" | No, not reliably |
| Page 3 of the rendered PDF matches a baseline | No, that is a separate tool's job |

The top block is what an agent is genuinely good at. The bottom block is the honest limit, and the rest of the article keeps that line bright.

## Testing the PDF download flow

This is the flavor you should lean on, because a download produces a real artifact you can assert against. Under the hood BrowserBash uses Playwright's built-in download handling, so the agent listens for the browser's actual download event rather than guessing from pixels whether a file arrived.

Run a single objective straight from the command line:

```bash
browserbash run "Go to the billing page, click Download statement, wait for the download to finish, and confirm a PDF file was saved"
```

The agent locates the control by its accessible name, clicks it, waits for the download event to resolve (the temporary placeholder is renamed to its final name only when the transfer is complete), then reports the saved filename and path with a pass or fail verdict on whether a PDF landed. You did not write a `waitForEvent('download')` handler, a polling loop over the downloads folder, or cleanup for stale `.crdownload` placeholders.

The waiting is the part that kills naive PDF tests. A `statement.pdf.crdownload` file means the transfer is still in flight, and reading it then gives you a half-written file. BrowserBash relies on Playwright's built-in auto-wait with a 15-second ceiling and no manual sleeps, so the agent waits for the rename to the final name rather than the first appearance of any file. For the full treatment of download triggers, save paths, and filename assertions, the companion piece on [testing file download flows with AI](https://browserbash.com/blog/test-file-download-flows-with-ai-browser) goes deeper.

### A download test as a *_test.md file

For anything you want to keep and run in CI, move from a one-off `run` to a Markdown test file. BrowserBash tests are intent, not selectors. A `*_test.md` file has a `#` title, steps as `-` or `1.` list items, and supports `@import` composition and `{{variables}}` with secret masking in logs.

```markdown
# Download invoice PDF

- Go to {{base_url}}/billing
- Click the "Download invoice" button
- Wait for the download to finish
- Confirm a file named like "invoice" with a .pdf extension was saved
- Confirm the saved file size is greater than zero bytes
```

Run it:

```bash
browserbash testmd run ./download_invoice_pdf_test.md
```

Notice what the steps assert and what they deliberately do not. They check existence, name pattern, extension, and non-zero size. They do not claim "the invoice total is $42.00," because that text lives inside the PDF bytes, not in anything the browser exposes. Keeping the assertions honest here is what keeps the test from being a false sense of safety.

If you have a login in front of billing, compose it rather than copy-pasting steps:

```markdown
# Download invoice PDF behind auth

@import ./login_test.md

- Click "Billing" in the account menu
- Click the "Download invoice" button
- Wait for the download to finish
- Confirm a .pdf file was saved
```

The `{{base_url}}` and any credentials come from variables, and secrets are masked in logs so a recorded run or CI output never prints them.

## Testing the trigger when the PDF opens in a viewer

The native-viewer flavor (Chrome opening a PDF in its built-in plugin) and the JavaScript-viewer flavor (PDF.js painting to canvas) share a problem: once the PDF is "open," there is little readable text to assert against. So you shift the assertion from "what does the PDF say" to "did the trigger do the right thing."

For a viewer that opens the PDF inline in an iframe or embed, assert that the container appeared:

```markdown
# View invoice opens the PDF viewer

- Go to {{base_url}}/invoices/1042
- Click "View invoice"
- Confirm a PDF viewer or embed appeared on the page
```

The agent can see that an `<embed>`, `<object>`, or viewer iframe is now present in the DOM, which proves the click wired up to a viewer rather than throwing a 500 or doing nothing. That is a real, useful assertion: it catches the regression where the View button silently breaks. What it is not is a claim about the document's contents.

For a viewer that opens the PDF in a new browser tab pointed at a `.pdf` URL, the better assertion is on navigation, not on rendered text:

```markdown
# View invoice navigates to the PDF URL

- Go to {{base_url}}/invoices/1042
- Click "View invoice"
- Confirm a new tab or page opened with a URL ending in .pdf
```

A URL ending in `.pdf` (or a response served as `application/pdf`) is a far more reliable signal than trying to read pixels off PDFium's chrome. The pattern throughout is the same: assert the strongest signal the browser actually exposes, and refuse to invent one it does not.

## Recording evidence with --record

Because you cannot assert the inside of a rendered PDF, recorded evidence becomes the thing a human reviews when a PDF test matters. BrowserBash captures a webm video plus screenshots with `--record`, which is the difference between "the test says the viewer opened" and "here is the frame where the viewer opened."

```bash
browserbash testmd run ./view_invoice_test.md --record
```

This writes a `.webm` of the run and step screenshots alongside the per-run `Result.md`. When a download test passes but someone doubts whether the right document opened, the screenshot of the viewer (or the saved file path in `Result.md`) is the evidence. When a viewer test fails, the video shows whether the click missed, a modal swallowed it, or the PDF genuinely failed to load. For the full walkthrough of artifacts and how to read them, see the [recording video and traces tutorial](https://browserbash.com/blog/browserbash-recording-video-and-traces-tutorial).

There is a real limit even here: a screenshot of a canvas-rendered PDF is a picture of a picture. A human can eyeball it, but it is not a machine assertion. Evidence supports review; it does not replace a content check.

## Wiring a PDF check into CI

In CI you do not watch the run, so you consume the machine signal instead. Pass `--agent` to emit NDJSON, run `--headless`, and rely on exit codes: `0` pass, `1` fail, `2` error, `3` timeout. Each run also writes a `Result.md` you can archive.

```yaml
name: pdf-flows
on: [push]
jobs:
  pdf-download:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g browserbash-cli
      - name: Download invoice PDF
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          browserbash testmd run ./download_invoice_pdf_test.md \
            --agent --headless --record
      - name: Archive evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: pdf-evidence
          path: |
            **/Result.md
            **/*.webm
            **/*.png
```

The job fails on a non-zero exit code, so a broken download trigger or a viewer that never appears turns the pipeline red without extra glue. BrowserBash emits the signal: the NDJSON stream, the exit code, the `Result.md`, and the recorded artifacts. You wire the integration alongside it. BrowserBash does not natively post to Slack, Jira, or a dashboard service, so if you want a failed PDF download to open a ticket or ping a channel, parse the exit code or NDJSON in a following step and call that API yourself. There is also an opt-in cloud dashboard via `--upload` (free runs kept 15 days) and a local one via `browserbash dashboard` if you would rather browse runs than archive raw files.

On the model side, `--agent` resolves a model the same way `auto` does: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. A PDF download flow is short and well-scoped, so even a modest model usually handles it, though small local models (8B or smaller) get flaky on long multi-step flows. For a checkout-then-download flow with several conditional steps, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model is the safer pick. Running fully local means nothing about the page or the document leaves your machine, which matters when the PDFs are customer statements.

## If your download tests are flaky

PDF download tests flake for the same reasons most download tests do, and the fixes are not PDF-specific. The dominant cause is racing the transfer: checking for the file before the `.crdownload` placeholder has been renamed. Because the agent waits for the completion event rather than a fixed clock, that whole class of flake mostly disappears, but two PDF-flavored gotchas remain.

First, some apps open the PDF in the viewer instead of downloading it depending on browser settings, so a test that asserts a saved file fails not because the trigger broke but because the browser chose to render instead of save. Decide which behavior you are testing and assert that one. Second, a slow on-demand PDF generation step on the server can push the download past the 15-second auto-wait ceiling, which reads as timeout exit code `3` rather than a failure. That is a signal to investigate generation latency, not to add a sleep. For the broader playbook on diagnosing this instability, see [reduce flaky end-to-end tests](https://browserbash.com/blog/reduce-flaky-end-to-end-tests).

## Honest limits, specific to PDFs

This is the section that keeps you out of trouble, so read it before you promise a stakeholder "we test the PDFs."

**You cannot assert text inside a canvas-rendered PDF.** PDF.js and similar viewers paint pages to a `<canvas>`. The accessibility tree sees a canvas element with no readable words, so "confirm the invoice total reads $42.00" is not something the browser agent can verify by reading the page. The pixels are correct and meaningless to the DOM at the same time.

**The native viewer is opaque too.** When Chrome opens a PDF in PDFium inside an `<embed>`, the document is rendered by a plugin the page does not expose as text. You can confirm the embed exists and the URL is a `.pdf`; you cannot read the third paragraph on page two.

**A passing download test does not prove the PDF is correct.** It proves a file with the right name and a non-zero size landed. The bytes could be a valid-but-wrong PDF (last month's invoice, the wrong customer) and the test would still pass. Name, extension, and size are necessary, not sufficient.

**The honest pattern is a handoff.** Let the agent prove the trigger fired and the right-named PDF landed, capture `--record` evidence for human review, then verify contents in a separate step outside the browser: open the saved `.pdf` with a PDF text-extraction library (`pdfplumber`, `pdf-parse`, `pdftotext`) and assert the extracted text contains "Invoice #1042" or the expected total. That step is plain code reading a file on disk, not a browser action, and it is where deep content assertions belong. BrowserBash gets you a verified file at a known path; your extraction step takes it from there.

**Visual diffing is a different tool.** If "page 3 must look like the baseline" is a real requirement, that is a pixel-diff job (render the PDF to images, diff against a golden set), which is its own category and not what an agentic browser test is for. Do not stretch the agent to cover it.

If you keep that line clear (agent for the flow and the file, separate tooling for the contents) your PDF suite is honest and durable. If you blur it, you ship tests that pass while the actual PDF is wrong, which is worse than no test at all.

## FAQ

### Can BrowserBash read the text inside a rendered PDF?

Not reliably, and you should not design your tests as if it can. Most in-browser viewers either paint the PDF onto a `<canvas>` (PDF.js) or hand it to a native plugin inside an `<embed>` (Chrome's PDFium). In both cases the document's text is not present in the accessibility tree or the DOM, so the agent has nothing to read. Use the agent to verify the trigger and the saved file, then extract and assert the PDF's text in a separate step with a library like `pdftotext` or `pdfplumber`.

### How do I assert a PDF actually downloaded and not just that a button was clicked?

Write the objective so it waits for the download to finish and then checks the file, for example "click Download statement, wait for the download to finish, and confirm a .pdf file was saved." BrowserBash uses Playwright's real download event under the hood, so it waits for the temporary `.crdownload` placeholder to be renamed to its final name (a complete transfer) before checking. Then assert filename pattern, the `.pdf` extension, and a non-zero size. That separates "the click did something" from "a real PDF landed."

### What is the difference between testing a PDF download and testing a PDF viewer?

A download produces a real file on disk, which is an observable event the agent can assert against (existence, name, extension, size). A viewer renders the PDF inside the page, where the contents are opaque to the DOM, so the strongest assertion you can make is that the viewer container appeared or that a new tab opened on a `.pdf` URL. If you control the flow, prefer testing the download path for content-adjacent checks and treat the viewer as a trigger-and-evidence check.

### Does this work in CI without a visible browser?

Yes. Run with `--headless` and `--agent` to emit NDJSON, and gate the pipeline on the exit codes (`0` pass, `1` fail, `2` error, `3` timeout). Add `--record` so every run leaves a webm and screenshots, and archive the per-run `Result.md` and artifacts as build outputs. BrowserBash emits these signals; you wire the integration (Slack, Jira, a dashboard) alongside it in a following step, since it does not post to those services natively.

## Where to go next

If you are standing up PDF tests today, start with the download flavor because it gives you a real artifact to assert against, keep the viewer flavor to trigger-and-evidence checks, and put content verification in a separate extraction step outside the browser. From there, the [features overview](https://browserbash.com/features) covers the rest of the toolchain, and the [learn hub](https://browserbash.com/learn) walks through writing `*_test.md` files, composing flows with `@import`, and wiring runs into CI. The discipline that makes a PDF suite trustworthy is the same one that makes any agentic suite trustworthy: assert the strongest signal the browser actually exposes, record evidence for the rest, and never claim a check the tool cannot honestly make.
