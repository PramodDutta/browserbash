---
title: Integrate AI Browser Tests With Xray and Zephyr
description: "Xray Zephyr test integration for AI browser tests: feed standard JUnit from BrowserBash into Jira-native test management the clean way."
date: 2026-07-28
category: ci
---

If your team lives in Jira, your test results probably need to live there too. That is the whole promise of a xray zephyr test integration: runs that started as pull-request checks end up as executions attached to real Jira issues, visible on the same board where product managers track releases. The catch is that most AI-driven browser tools speak their own proprietary result format, and getting that into Xray or Zephyr means writing glue code you did not budget for. BrowserBash takes a deliberately boring path here. It writes standard JUnit XML, the same schema JUnit has emitted for over a decade, so any importer that already accepts JUnit accepts BrowserBash without a translation layer.

This article walks through how that works in practice. You will see how BrowserBash produces JUnit from plain-English tests, how Xray and Zephyr each ingest that file, where the two tools differ, and the honest limits of what an AI browser test can map to inside a Jira test-management model. If you are evaluating whether to route AI browser results into your existing Jira workflow, this is the ground-level view.

## Why Jira-native test management still matters

Test management inside Jira is not a nostalgia play. When a test execution is a first-class object linked to a story, a bug, and a release version, a few things get easier at once. Release managers can look at a fix version and see coverage without leaving the board. Traceability reports (which requirement is tested, which test last passed) come for free instead of being assembled by hand. And when a test fails, the failure can open or update a linked defect in the same system your developers already triage.

Xray and Zephyr are the two dominant apps that add this layer to Jira. Both model Test, Test Execution, Test Plan, and Test Set (or their close equivalents) as Jira issue types or issue-linked entities. Both accept automated results through a REST API and, critically for us, both accept JUnit XML as an import format. That shared format is the seam we are going to work with.

The alternative, keeping AI browser results in a separate dashboard that nobody on the release side ever opens, is how automation quietly becomes shelfware. You want the verdict to land where decisions get made.

## How BrowserBash produces standard JUnit

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step (no selectors, no page objects), and you get back a deterministic verdict plus structured results. The part that matters for Jira integration is the suite runner and its output formats.

The `run-all` command executes a folder of committable `*_test.md` files in parallel, with concurrency derived from real CPU and memory, and writes a JUnit XML file when you ask for one:

```bash
npm install -g browserbash-cli
browserbash run-all .browserbash/tests --junit out/junit.xml
```

That `out/junit.xml` is ordinary JUnit. Each test file becomes a test case, its pass or fail becomes the case status, and failures carry a message. Suite-level metadata such as estimated spend lands in the JUnit `<properties>` block, which is the standard extension point for exactly this kind of side-channel data. Because the schema is the plain JUnit schema and not a BrowserBash dialect, the file is a valid input to any tool in the JUnit ecosystem, from Jenkins JUnit plugins to Allure to, yes, Xray and Zephyr importers.

This is the honest core of the pitch. BrowserBash did not invent a results format and then build a bespoke Jira connector around it. It emits the lingua franca and lets the importer you already trust do the mapping. If you ever move off Xray to Zephyr, or off both to something else, the export side of your pipeline does not change.

### The exit-code contract that CI depends on

Alongside JUnit, BrowserBash keeps a frozen exit-code contract: `0` passed, `1` failed, `2` error or infrastructure or budget-stop, `3` timeout. Your CI job can gate on the exit code for a hard pass/fail while still uploading the JUnit file for the richer Jira-side record. The two signals do not fight. The exit code decides whether the pipeline is red; the JUnit import decides what the Jira board shows.

For machine consumers there is also `--agent` mode, which emits NDJSON (one JSON event per line) on stdout with `step` and `run_end` events. That is the stream you would parse if you ever wanted to build a custom Jira sync beyond what JUnit carries, but for standard Xray and Zephyr import you do not need it.

## Feeding JUnit into Xray

Xray supports importing automated test results in several formats, and JUnit is one of the long-standing supported ones. The typical shape of the integration is a REST call to the Xray import endpoint after your tests run, with the JUnit XML as the payload and a few parameters that tell Xray which Jira project, which test execution, and optionally which test plan and fix version the results belong to.

At import time Xray does the mapping you would hope for. Each JUnit test case is matched to (or used to auto-provision) a Test issue, and a Test Execution issue is created or updated to hold the run. When a case fails, the failure message from the JUnit file rides along so a triager can see what BrowserBash reported without opening a separate artifact.

A minimal pipeline step looks like running the suite, then posting the file:

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml --budget-usd 2
# then POST out/junit.xml to your Xray import endpoint from the CI job
```

The `--budget-usd 2` flag is worth calling out because it interacts nicely with a Jira workflow. If a suite crosses the budget, BrowserBash stops launching new tests, reports the remaining ones as `skipped`, and exits `2`. Those skipped results still appear in the JUnit file, so your Xray execution honestly shows what ran and what was cut off rather than silently omitting the tail of the suite. Spend also lands in the JUnit `<properties>`, giving you a per-execution cost breadcrumb inside Jira if your import maps properties through.

### Mapping tests to Jira issues in Xray

The one design decision you cannot avoid is how JUnit test cases map to Xray Test issues. Xray keys tests during import, and the exact keying behavior (auto-provision new tests versus match existing ones by a defined key) is configured on the Xray side, not by BrowserBash. Practically, that means your naming discipline in the `*_test.md` files becomes your test identity in Jira. Give each test file a stable, descriptive `#` title, keep it stable across runs, and Xray has a consistent handle to match on. Rename a file casually and you may get a duplicate Test issue.

For BrowserBash's part, the suite discovery order is deterministic and sorted, so the same folder produces the same set of cases in the same order on every machine. That stability is what makes repeated imports update the same executions instead of scattering.

## Feeding JUnit into Zephyr

Zephyr (in its Scale and Squad lineages) also ingests automated results, and JUnit XML is among the accepted formats. The mechanics rhyme with Xray: run the suite, produce `out/junit.xml`, then hand the file to Zephyr's import path, whether through its REST API, a CI plugin, or the UI upload for ad-hoc runs. The result is a set of test executions inside a Zephyr cycle, linked back to Jira issues.

The exact endpoint names, authentication, and cycle parameters differ between Zephyr editions and are not identical to Xray's, and the specifics of each Zephyr edition's importer are best read from that vendor's current docs rather than trusted from memory. What is stable and in your control is the input: BrowserBash gives you a clean JUnit file, and Zephyr's importer is built to eat JUnit files. The seam holds regardless of which Zephyr edition you run.

Because the export side is identical for both tools, a team running Xray in one project and Zephyr in another can point the same `run-all --junit` output at both. You are not maintaining two different result generators. You are maintaining one JUnit file and two importer configs.

## Xray vs Zephyr for AI browser results: a quick comparison

Neither tool is the AI browser layer. Both are the Jira-side destination. The choice between them is mostly about which one your organization already standardized on, but here is how they line up on the dimensions that matter for importing BrowserBash results.

| Dimension | Xray | Zephyr |
| --- | --- | --- |
| JUnit XML import | Supported | Supported |
| Result destination | Test Execution issues | Test cycles / executions |
| Jira-native issue model | Tests as Jira issues | Editions vary (issue-linked or app-managed) |
| REST import for CI | Yes | Yes (varies by edition) |
| Works with BrowserBash `--junit` | Yes, no glue format | Yes, no glue format |
| Test identity keying | Configured on Xray side | Configured on Zephyr side |
| Best fit | Teams already on Xray | Teams already on Zephyr |

The honest read of this table: from BrowserBash's side, Xray and Zephyr are interchangeable. The differentiators live entirely in the Jira apps, not in how BrowserBash talks to them. If your team has not committed to either, that decision should be driven by your Jira administration, licensing, and reporting needs, not by anything about the AI browser tests. Whichever you pick, standard JUnit is the contract you rely on. For a broader look at how BrowserBash slots into CI, the [features overview](https://browserbash.com/features) covers the suite runner, agent mode, and artifacts.

## Writing tests that produce meaningful Jira executions

A JUnit import is only as useful as the tests behind it. Two capabilities in BrowserBash matter here because they change what a "pass" in Jira actually means.

### Deterministic Verify assertions

By default an AI agent judging whether a page looks right introduces judgment into your verdict. BrowserBash lets you remove that judgment where it counts. `Verify` steps in a `*_test.md` file compile to real Playwright checks with no LLM in the loop: URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and stored-value equality. A pass means the condition actually held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md` assertion table.

This distinction travels into Jira in a way that matters for auditability. When a test that failed lands as a failed execution in Xray or Zephyr, and the reason is a compiled Verify assertion, you can trust the failure was a concrete condition, not an AI having a bad day. Verify lines that fall outside the supported grammar still run, but they run agent-judged and are flagged `judged: true` so you can tell the two apart. For a Jira-native process where executions feed release decisions, deterministic verification is what makes the imported results defensible. The [tutorials](https://browserbash.com/tutorials) walk through writing Verify steps.

### testmd v2 for hybrid API and UI flows

For tests that need to seed data before checking it through the browser, testmd v2 adds deterministic step types. Put `version: 2` in the frontmatter and steps execute one at a time against a single browser session. Two step types never touch a model: API steps for setup and Verify steps for checking.

```bash
# example_test.md
---
version: 2
---
# Create an order and confirm it renders

POST https://api.example.com/orders with body {"item":"widget","qty":2}
Expect status 201, store $.id as 'orderId'

Open https://example.com/orders/{{orderId}}
Verify text "widget" is visible
Verify title contains "Order"
```

The API step seeds a record deterministically, the plain-English step drives the browser, and the Verify steps confirm the UI without model judgment. A test like this produces a JUnit case whose pass genuinely means "the order I created shows up correctly," which is exactly the kind of end-to-end evidence a Jira execution should represent. One honest limit: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. Plain v1 files without frontmatter behave exactly as before.

## Fitting it into a CI pipeline

The full loop in a CI job is small: install, authenticate to your app under test if needed, run the suite, upload JUnit to Jira. BrowserBash's saved-login feature keeps the authentication tax down. You log in once interactively and reuse the session:

```bash
browserbash auth save staging --url https://staging.example.com/login
browserbash run-all .browserbash/tests --auth staging --junit out/junit.xml --shard 2/4
```

The `--shard 2/4` flag runs a deterministic slice of the suite, computed on sorted discovery order so parallel CI machines agree on who runs what without coordinating. Each machine produces its own JUnit file; your import step can post each shard's file to the same Jira execution or merge them first, depending on how your importer handles partial results.

If you run BrowserBash through its official GitHub Action, the JUnit and NDJSON and result artifacts are uploaded for you, the Action supports `shard:` matrix jobs and `budget-usd:`, and it posts a self-updating PR comment with the verdict table. From there your Jira import can run as a follow-on step that consumes the uploaded JUnit artifact. The [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) covers the matrix and budget inputs in detail.

### Keeping monitors and executions separate

One design note worth internalizing: not every BrowserBash run belongs in Jira. Monitor mode (`browserbash monitor <test> --every 10m --notify <webhook>`) runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes, and its replay cache makes an always-on monitor nearly token-free. That is a production-health signal, not a release-gating execution. You generally want your Xray or Zephyr executions to come from CI suite runs tied to a build, and your monitor alerts to go to Slack. Mixing the two floods your Jira executions with noise. Keep the JUnit-to-Jira path for CI, and let monitors talk to a webhook.

## The honest limits of mapping AI browser tests to Jira

Credibility means naming where this gets rough. A few caveats deserve a clear statement.

First, a `*_test.md` file becomes one JUnit test case, not a granular per-step matrix inside Jira. If your Xray or Zephyr process expects test steps as separate rows with individual statuses, BrowserBash's file-level case granularity will feel coarse. testmd v2 executes steps one at a time internally, but the JUnit case is still per-file. You get a clean pass or fail per test, not a step-by-step execution table inside the Jira issue.

Second, test identity is your responsibility. As covered above, the keying that matches a JUnit case to an existing Jira Test issue is configured in Xray or Zephyr, and it leans on your test names staying stable. BrowserBash gives you deterministic, sorted discovery, but it will not rescue sloppy renaming. Treat your `*_test.md` titles as stable identifiers.

Third, the model matters for reliability, and flaky tests make for noisy Jira executions. Very small local models (around 8B parameters and under) can be flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for hard flows. BrowserBash is Ollama-first and will run entirely local with no API keys, which is great for privacy and cost, but if you are feeding release-gating executions into Jira, pick a model that clears your reliability bar. A flaky test that flips a Jira execution red on every other run erodes trust faster than no test at all. `run-all` does flag flaky tests and orders previously-failed and slowest tests first, which helps you spot instability before it pollutes your executions.

Fourth, BrowserBash does not ship a native Xray or Zephyr connector, and that is a deliberate choice, not a gap it hides. The integration is JUnit plus your importer. If you want a one-click, deeply-integrated Jira app that manages test steps, requirement links, and coverage gadgets natively, that is what Xray and Zephyr themselves are for. BrowserBash's job ends at producing an honest, standard JUnit file. It does that and gets out of the way.

## Who this setup is for

This approach fits you well if your team already runs Xray or Zephyr, already imports JUnit from other automation (Playwright, Cypress, Selenium suites), and wants AI browser tests to land in the same executions without a bespoke connector. You get plain-English tests that a non-coder can read, deterministic Verify assertions that make a pass mean something, and a JUnit file that drops into your existing import step. If you are migrating from a Playwright suite, `browserbash import` converts specs to plain-English tests heuristically and deterministically, so you can keep your Jira import wiring while changing what generates the results.

It fits less well if you need per-step execution rows inside Jira today, or if you are not on Jira at all, in which case the local dashboard (`browserbash dashboard`, fully local, no account) or the optional free cloud dashboard may serve you better than any test-management import. And if your priority is a single vendor owning the entire chain from browser driving to Jira reporting, a commercial platform with a first-party Jira app will feel more cohesive than an open-source CLI plus an importer, even if it costs more and locks you in. Be honest with yourself about which of those you actually need. You can compare the open-source and hosted pieces on the [pricing page](https://browserbash.com/pricing).

## FAQ

### Can BrowserBash results be imported into Xray and Zephyr?

Yes. BrowserBash writes standard JUnit XML with its `run-all --junit` command, and both Xray and Zephyr accept JUnit XML as an import format. There is no proprietary BrowserBash results format to translate, so any importer that already handles JUnit handles BrowserBash. You run the suite, produce the JUnit file, and hand it to your Xray or Zephyr import step.

### Do I need a special connector for a Xray Zephyr test integration?

No custom connector is required. BrowserBash deliberately does not ship a bespoke Jira app and instead emits standard JUnit, which is the format Xray and Zephyr importers are built to consume. Your CI job runs the suite and posts the JUnit file to the importer you already use. The keying of tests to Jira issues is configured on the Xray or Zephyr side, not in BrowserBash.

### How do I keep AI browser test results stable across imports?

Give each `*_test.md` file a stable, descriptive title and keep it consistent across runs, because that name is what the importer matches on. BrowserBash discovers tests in deterministic sorted order, so the same folder produces the same cases every time, which lets repeated imports update the same executions. Use deterministic Verify assertions so a pass reflects a real condition rather than AI judgment, which keeps your Jira executions trustworthy.

### Does BrowserBash map individual test steps into Jira?

Not at the step level. A single `*_test.md` file becomes one JUnit test case with a pass or fail verdict, even though testmd v2 executes steps one at a time internally. If your Jira test-management process expects each step as a separate row with its own status, BrowserBash's file-level granularity will feel coarse and is a known limit rather than a hidden gap.

Getting AI browser tests into your Jira board does not require a special integration, just a clean JUnit file and the importer you already run. Install with `npm install -g browserbash-cli`, point `run-all --junit` at your suite, and feed the output to Xray or Zephyr. An account is optional and you can start entirely local, but if you want the free cloud dashboard and hosted retention, sign up at https://browserbash.com/sign-up.
