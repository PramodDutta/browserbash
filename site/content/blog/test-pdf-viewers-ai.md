---
title: Test In-Browser PDF Viewers With Plain-English Tests
description: "Test PDF viewer automation without brittle selectors: assert rendered text, toolbar controls, and page counts with plain-English AI-driven browser tests."
date: 2026-07-13
category: guide
---

If you have ever tried to write test PDF viewer automation with a traditional framework, you already know the pain. A PDF opened inside the browser is not a normal DOM tree. It is a viewer application (pdf.js, a native Chrome plugin, or a vendor widget) painting glyphs onto a `<canvas>`, and your usual `getByText` locator finds nothing because there is no text node to find. This guide shows a different approach: you describe what a human sees ("the second page shows the invoice total", "the download button is visible") in plain English, and an AI agent drives a real Chrome browser to check it. No selectors, no page objects, and an honest accounting of exactly where this technique works and where it does not.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective, an AI agent executes it step by step against a real browser, and you get back a deterministic verdict plus structured results. That model turns out to be unusually well suited to PDF viewers, because the agent reasons about what is rendered on screen the same way a person would, instead of demanding a selector that the viewer never exposes.

## Why PDF viewers break traditional test automation

The core problem is rendering strategy. There are three common ways a PDF ends up in front of a user, and each defeats selector-based tests differently.

First, the native browser viewer. When Chrome loads a `.pdf` URL directly, it uses an embedded PDF plugin rendered inside a `<embed>` or a shadow-DOM PDFium surface. Playwright and Selenium cannot reach inside that surface with normal locators. You can assert the URL ends in `.pdf` and that the page loaded, but you cannot read the third paragraph on page two.

Second, pdf.js and similar JavaScript viewers. Mozilla's pdf.js renders each page to a `<canvas>`, then overlays an invisible text layer (absolutely positioned `<span>` elements) to support selection and search. If the site enables the text layer, you sometimes get real DOM text. If it disables it for performance, the text layer is gone and you are back to pixels.

Third, vendor widgets and image fallbacks. Some document platforms convert each PDF page to a PNG server-side and serve an image carousel. Others use WebAssembly renderers that paint to canvas with no text layer at all. In every canvas-only case, the text a user reads simply does not exist as a queryable node.

Traditional automation copes by scripting brittle coordinate clicks, shelling out to a separate PDF-parsing library, or asserting only the surrounding chrome (the toolbar, the filename, the page-count widget) and hoping the content is correct. None of that tests what users care about, which is whether the right document rendered.

### What "AI-driven" changes

An AI agent that can take a snapshot of the page, read visible text through accessibility and OCR-adjacent reasoning, and decide whether an objective was met does not need a selector for the invoice total. It looks at the rendered viewer, finds the number, and reports pass or fail. That is the shift this article is about, and it is why test PDF viewer automation is more tractable with a language-model-driven agent than it was with pure DOM tooling. Be clear-eyed, though: canvas-only rendering still has hard limits, covered in detail below.

## Getting started with BrowserBash

Installation is a single npm command, and by default nothing leaves your machine. BrowserBash is Ollama-first: it defaults to free local models with no API keys required, and only falls back to a hosted model if you have configured one.

```bash
npm install -g browserbash-cli

# Assert a PDF viewer loaded and shows expected text, using a free local model
browserbash run "Open https://example.com/reports/q2-invoice.pdf and confirm the document heading reads 'Q2 Invoice' and store the visible total as 'total'"
```

The agent navigates to the URL, waits for the viewer to paint, inspects what rendered, and returns a verdict with a `final_state` block containing your stored value. If the viewer exposes a text layer, the agent reads it directly. If it is canvas-only, the agent reasons over the visual snapshot, which works well for large headings and toolbar labels and degrades for dense body text (more on that honesty below).

The model resolution order is worth knowing: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For PDF work specifically, the honest guidance is that very small local models (roughly 8B and under) get flaky on multi-step objectives and on reading small rendered text. A mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, is the sweet spot when the document content matters. You can read more about model choices in the [BrowserBash learn hub](https://browserbash.com/learn).

## Asserting rendered PDF text

The most valuable assertion is also the hardest one for classic tools: does the visible text of the rendered document match what you expect. With a plain-English objective, you frame it the way a reviewer would.

Here are objectives that work reliably against viewers with a real text layer, and reasonably well against high-contrast canvas headings:

```bash
# Read a specific value and store it for the verdict JSON
browserbash run "Open the attached statement PDF at https://example.com/statement.pdf, find the account balance on the first page, and store it as 'balance'" --agent

# Check that a specific string is visible anywhere in the rendered document
browserbash run "Open https://example.com/policy.pdf and confirm the phrase 'effective date: January 2026' is visible"
```

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or an AI coding agent can read the `step` and `run_end` events without parsing prose. The `run_end` event carries `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. That structured output is the point: your pipeline gets a machine-readable answer, not a screenshot it has to eyeball.

### Where text assertions are strong

Headings, titles, and short labels rendered at normal or large sizes are read reliably, because they are high contrast and the agent has plenty of visual signal. Documents served through pdf.js with the text layer enabled behave almost like a normal web page from the agent's perspective, since the spans really are in the DOM. Invoice totals, policy dates, order numbers, and single-line fields are the bread and butter of PDF viewer testing, and they hold up well.

### Where text assertions get shaky

Dense multi-column body text on a canvas-only viewer is the weak spot. Reading paragraph seven of a legal contract from pixels alone is error-prone, and you should not build a critical assertion on it. If the document you test is canvas-only and the detail you need is small body text, the more robust pattern is to download the file and parse it deterministically outside the browser, then use BrowserBash to assert the viewer loaded and the toolbar works. Splitting the concern this way keeps each layer honest.

## Testing toolbar controls and viewer chrome

Beyond content, PDF viewers ship interactive controls: download, print, zoom, page navigation, rotate, and a page-count indicator. These are usually real DOM elements (buttons, inputs) even when the page canvas is not, which makes them a great deterministic target.

BrowserBash has `Verify` assertions that compile to actual Playwright checks with no language-model judgment involved. A `Verify` line for a named control checks real visibility, so a pass genuinely means the condition held and a fail comes with expected-versus-actual evidence. That determinism matters for chrome, because toolbar behavior should be exact, not agent-estimated.

Here is a committable Markdown test that mixes agent-driven content reading with deterministic control checks:

```bash
# runs/pdf-viewer_test.md
---
version: 2
---
# In-browser PDF viewer smoke test

- Open https://example.com/reports/annual.pdf and wait for the first page to render
- Verify 'Download' button visible
- Verify 'Print' button visible
- Verify text 'Page 1 of' visible
- Click the next-page control and confirm the second page renders
- Verify title contains 'annual'
```

With `version: 2` frontmatter, steps run one at a time against a single browser session. The plain-English steps run as agent blocks; the `Verify` steps run as deterministic Playwright checks and land in the `run_end.assertions` array and the Result.md assertion table. You get a clean split between "an agent judged this" and "Playwright proved this". Note the honest constraint: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway, so it does not yet run on Ollama or OpenRouter directly.

Run the file like this:

```bash
browserbash testmd run ./runs/pdf-viewer_test.md
```

### Verify grammar that fits PDF chrome

The deterministic `Verify` grammar covers the assertions you most want for a viewer: URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and a stored value equals check. A page-count widget that reads "Page 1 of 12" is a perfect element-count or text-visible assertion. A download button is a named-button visibility check. Anything outside the grammar still runs, but agent-judged and flagged `judged: true`, so you always know which assertions are provable and which are estimated.

## A realistic decision table: which layer to test where

The honest way to think about PDF viewer testing is to match the assertion to the rendering strategy. This table is the mental model I use before writing a single test.

| What you want to assert | Native browser viewer | pdf.js with text layer | Canvas-only / image fallback |
| --- | --- | --- | --- |
| Toolbar buttons (download, print, zoom) | Deterministic Verify | Deterministic Verify | Deterministic Verify |
| Page count indicator | Verify text or count | Verify text or count | Verify text (if in DOM) |
| Large headings and titles | Agent read, reliable | Agent read, reliable | Agent read, usually reliable |
| Single-line fields (total, date, ID) | Agent read, good | Agent or Verify, strong | Agent read, use larger model |
| Dense body paragraphs | Agent read, risky | Agent or DOM, reliable | Download and parse instead |
| Exact byte-level content | Download and parse | Download and parse | Download and parse |

The pattern is consistent: chrome is deterministic everywhere, headings are safe everywhere, and the deeper you go into small canvas-rendered body text the more you should lean on downloading the file for the critical check. BrowserBash is genuinely useful across the first four rows and honest that the last row belongs to a parser.

## Wiring PDF viewer tests into CI

A single objective is a spike. A suite is what you actually ship. BrowserBash has a memory-aware parallel orchestrator that derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. For a folder of PDF viewer tests, that keeps the whole thing fast and stable.

```bash
# Run the whole PDF suite, emit JUnit for CI, cap spend on hosted models
browserbash run-all ./runs/pdf --junit out/junit.xml --budget-usd 1.50

# Split across four CI machines deterministically
browserbash run-all ./runs/pdf --shard 2/4
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel CI machines agree on who runs what with zero coordination. The `--budget-usd` guard stops launching new tests once the suite crosses your spend limit: remaining tests report `skipped`, the suite exits with code 2, and the spend lands in the results and JUnit properties. Exit codes are frozen and predictable across the tool: 0 passed, 1 failed, 2 error or budget stop, 3 timeout. Your pipeline reads the exit code and the JUnit file and moves on.

If your PDF viewer sits behind a login (a customer portal serving statements, say), you do not want to script the auth flow into every test. Save the session once and reuse it:

```bash
browserbash auth save portal --url https://example.com/login
# log in by hand, press Enter to save the storageState

browserbash run "Open the latest statement PDF from the documents tab and confirm it renders" --auth portal
```

The `--auth` flag works on `run`, `testmd`, `run-all`, and monitor, and there is an `auth:` frontmatter option for test files too. If the saved profile's origins do not cover your start URL, BrowserBash prints a warning instead of silently doing nothing, which saves you a confusing debugging session. The [features overview](https://browserbash.com/features) has the full list of what carries across runs.

## Using BrowserBash as your AI agent's validation layer

If you are building an AI agent that generates or manipulates PDFs (an invoicing assistant, a report generator, a contract tool), you want the agent to validate its own output in a real browser. BrowserBash ships an MCP server for exactly that.

```bash
# Expose BrowserBash to any MCP host (Claude Code, Cursor, Windsurf, Codex, Zed)
claude mcp add browserbash -- browserbash mcp
```

That one line makes three tools available to your agent: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The important design detail: a failed test is a successful validation. The tool call itself succeeds and hands the agent a verdict to read and act on, rather than throwing. So your PDF-generating agent can render its output, ask BrowserBash "does the viewer show the correct total on page one", and branch on the answer. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

### Monitoring a live PDF endpoint

Production document endpoints break quietly. A CDN misconfiguration, an expired signing key, or a viewer library upgrade can turn a working statement page into a blank canvas without any error in your logs. Monitor mode catches that.

```bash
browserbash monitor ./runs/pdf/statement_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

This runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run. Slack webhook URLs get Slack formatting automatically; other URLs get the raw JSON payload. The replay cache makes an always-on monitor nearly token-free: a green run records its actions, the next identical run replays them with zero model calls, and the agent only steps back in when the page actually changed. For a PDF viewer that renders the same layout every time, that is close to free continuous validation.

## Migrating existing PDF tests

If you already have Playwright specs poking at a PDF viewer (probably a fragile mix of coordinate clicks and toolbar assertions), you do not have to rewrite them by hand. The importer converts specs to plain-English tests deterministically, with no model involved.

```bash
browserbash import ./tests/e2e/pdf.spec.ts
```

It heuristically translates goto, click, fill, press, check, selectOption, `getBy*` locators, and common expects into readable `*_test.md` steps, and rewrites `process.env.X` into `{{X}}` variables. Anything it cannot translate cleanly (your custom canvas-coordinate helpers, most likely) lands in an `IMPORT-REPORT.md` file instead of being silently dropped or invented. That report is genuinely useful here, because the untranslatable parts are usually exactly the brittle canvas hacks you wanted to escape, now itemized so you can replace them with plain-English objectives.

You can also record a fresh test by clicking through the viewer once:

```bash
browserbash record https://example.com/reports/annual.pdf
```

A visible browser opens, you click download, page through, zoom, and press Ctrl-C. BrowserBash writes a plain-English test from what you did. Password fields never leave the page: the capture sends only a secret marker and the generated step reads `Type {{password}} into ...`, so a login-gated document flow stays safe to commit.

## When BrowserBash is the right tool, and when it is not

Balance matters, so here is the straight version.

Choose BrowserBash for PDF viewer testing when you care about the user-visible outcome: the right document rendered, the heading and key fields are correct, the toolbar controls work, and the page loads behind auth. It is especially strong when you want committable, readable tests that survive viewer library upgrades, because a plain-English objective does not break when a CSS class name changes. And it is the right layer when an AI agent needs to validate PDF output it just produced, via the MCP server.

Reach for a dedicated PDF-parsing library instead when you need exact, byte-level assertions on dense body text, precise coordinate geometry, form-field extraction from the PDF structure, or digital-signature verification. Those are file-level concerns, not viewer-level concerns, and a browser agent is the wrong tool for them. The honest pattern for a serious PDF-heavy product is both: parse the file deterministically for content correctness, and use BrowserBash to prove the viewer renders and behaves for real users. Pixel-diffing tools also remain a better fit if your only concern is that the rendered canvas is visually identical frame to frame, since that is a pure image-comparison problem.

There is no shame in mixing tools. The teams who get this right test the file with one tool and the experience with another. You can see more walkthroughs in the [tutorials](https://browserbash.com/tutorials) and read how other teams structure suites on the [blog](https://browserbash.com/blog).

## Putting it together

A pragmatic PDF viewer test suite looks like this. A handful of deterministic `Verify` tests cover the toolbar and page-count chrome across every viewer type, because those are provable and cheap. A few agent-driven objectives read the headings and single-line fields users actually check, run on a mid-size model so small text is legible. Any critical dense-content assertion downloads the file and parses it outside the browser. The whole thing runs in CI under a budget cap with deterministic sharding, and a monitor watches the live endpoint for silent regressions. That is a suite that tells you the truth about your PDF experience without a single brittle selector.

Start with one objective against a real PDF URL, watch the verdict, and grow from there.

```bash
npm install -g browserbash-cli
browserbash run "Open a PDF URL of yours and confirm the document title and download button are visible"
```

An account is optional (everything above runs fully local and free), but if you want the hosted dashboard, monitors, and retention, you can [sign up here](https://browserbash.com/sign-up).

## FAQ

### How do you test PDF text that is rendered on a canvas instead of the DOM?

An AI-driven agent reads what is visually rendered rather than requiring a DOM text node, so it can confirm large headings, titles, and single-line fields even on a canvas-only viewer. It is reliable for high-contrast text and short strings, and gets shaky on dense multi-column body text. For byte-exact assertions on that dense content, download the file and parse it with a PDF library, then use the browser agent only to prove the viewer loaded and the controls work.

### Can I assert PDF toolbar controls like download and print buttons?

Yes, and this is where the deterministic path shines. Toolbar buttons are usually real DOM elements even when the page canvas is not, so a Verify step for a named button compiles to an actual Playwright visibility check with no model judgment. A pass means the control genuinely rendered, and a fail arrives with expected-versus-actual evidence in the assertions table. That makes toolbar and page-count checks the most trustworthy part of a PDF viewer suite.

### Do I need an API key to run these PDF viewer tests?

Not for the basic content and toolbar checks. BrowserBash is Ollama-first and defaults to free local models with nothing leaving your machine, so a single-objective run needs no key at all. The one exception is testmd v2 (the `version: 2` frontmatter with step-by-step execution and API steps), which currently drives the builtin engine and needs an Anthropic API key or a compatible gateway. For reading small rendered text accurately, a mid-size local model or a hosted model works better than a tiny 8B one.

### How is this different from using Playwright directly on a PDF?

Playwright is excellent at DOM elements and struggles the moment content moves onto a canvas with no text layer, which is common in PDF viewers. You end up asserting only the surrounding chrome or scripting brittle coordinate clicks. BrowserBash lets you write the assertion as a plain-English objective that an agent verifies visually, and it keeps deterministic Playwright checks available through Verify for the controls that are real DOM. If you already have Playwright PDF specs, the importer converts them and itemizes anything untranslatable in a report.
