---
title: Markdown Test Files: Write Reviewable Browser Tests in _test.md
description: "Markdown test files let you write reviewable browser tests in _test.md. Tutorial on steps, @import, variables, and Result.md with BrowserBash."
date: 2026-06-13
category: guide
---

Markdown test files are plain-English browser tests you keep in your repo as `*_test.md`, where every list item is one step an AI agent executes against a real Chrome browser. There are no selectors, no page objects, and no step-definition glue to maintain — just a readable list of actions and checkpoints that anyone on the team can open, diff, and review in a pull request. This tutorial walks through the whole format end to end: how a `_test.md` file is structured, how `@import` composes shared steps, how `{{variables}}` keep secrets out of the file, and how the `Result.md` report turns every run into a record you can read. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command and file below is real.

The reason this format exists is the same reason most test suites become unreadable: traditional end-to-end tests are welded to the DOM. A test that says `await page.locator('[data-testid="submit"]').click()` is precise, but it is also a liability — rename the attribute, move the button into a menu, regenerate a class, and a working feature goes red for reasons that have nothing to do with the product. Markdown test files take the opposite stance. You write the *intent* — "Click the Submit button and verify the confirmation page loads" — and the agent re-reads the live page on every run to figure out how to do it. The test describes what should happen, not how the page is wired today.

## Why a markdown format at all

Gherkin tried to make tests readable two decades ago, and mostly half-succeeded. The English in a `.feature` file is legible, but every `Given`/`When`/`Then` line needs a step definition behind it, so teams ended up maintaining two artifacts: the readable one and the code that made it run. The glue rotted, the step library sprawled, and the "executable specification" promise quietly broke.

BrowserBash markdown test files remove the glue entirely. There is no step-definition layer mapping English to code. The agent interprets each line directly against the browser, which means the readable layer *is* the executable layer — they cannot drift apart, because there is only one of them. That single structural choice is what makes these files genuinely reviewable. A product manager, a designer, or a backend engineer who has never opened a test framework can read a `_test.md` file top to bottom and know exactly what it verifies.

Three properties fall out of that design, and they are the spine of the rest of this tutorial:

- **Steps are list items.** One Markdown bullet equals one verified action or assertion. The file reads like a checklist because it is one.
- **`@import` composes shared steps.** Repeated preludes (log in, open a module) live in helper files and get spliced in, so you fix a flow once instead of in twenty files.
- **`{{variables}}` parameterize and protect.** Values like base URLs and credentials come from outside the file, and anything marked secret is masked as `*****` everywhere it would otherwise print.

## Install and run your first markdown test

Install the CLI globally from npm — the package is [browserbash-cli](https://www.npmjs.com/package/browserbash-cli):

```bash
npm install -g browserbash-cli
```

You need a model to drive the agent. BrowserBash is Ollama-first: it auto-detects a local Ollama install and uses it for free, with no API keys and nothing leaving your machine. If you have Ollama, pull a capable model:

```bash
ollama pull qwen3
```

A practical note: small models in the 8B-and-under range tend to wander on multi-step objectives. A Qwen3 or Llama 3.3 70B-class model is the reliable sweet spot for markdown tests with several steps. If you would rather not run anything locally, BrowserBash also auto-detects an Anthropic key, then falls back to OpenRouter — which includes genuinely free hosted models such as `openai/gpt-oss-120b:free`. The resolution order is Ollama, then Anthropic, then OpenRouter, so you can be running on whatever you already have.

Now create your first markdown test file. Anything ending in `_test.md` is treated as a test. Here is `login_test.md`, written against a public practice app whose demo credentials are published on its own login page, so it runs as printed:

```markdown
# Login flow

- Open https://practicetestautomation.com/practice-test-login/
- Type "student" into the Username field
- Type "Password123" into the Password field
- Click the Submit button
- Verify the text "Congratulations" is visible
- Verify the "Log out" button is visible
```

Run it:

```bash
browserbash testmd run login_test.md
```

The agent opens a real browser, works through the list one item at a time, and judges the result. When it finishes, you get a verdict in the terminal and a `Result.md` file written next to the test (more on that below). If you do not want a visible window — for example on a server or in CI — add `--headless`:

```bash
browserbash testmd run login_test.md --headless
```

That is the entire loop: write a list, run the file, read the result. Everything else in this tutorial makes that loop scale to a real suite.

## Anatomy of a _test.md file

A markdown test file has a deliberately small grammar. There is no schema to memorize, but understanding the four pieces makes the difference between tests that pass reliably and tests that drift.

### The title

The first line is a Markdown heading naming the test:

```markdown
# Create an invoice
```

It is documentation, not behavior — it shows up in reports and makes the file self-describing. One heading per file.

### Steps as list items

Every Markdown list item is one step, executed in order. There are two flavors of step, and using both well is the core skill:

- **Actions** tell the agent to *do* something: `Open ...`, `Type ... into ...`, `Click ...`, `Fill ... with ...`, `Press Enter`.
- **Checkpoints** tell the agent to *verify* something: `Verify the dashboard heading is visible`, `Verify the URL contains "/success"`.

```markdown
- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field and press Enter
- Verify the dashboard heading is visible
```

The single most important habit for reliable markdown tests is to **assert often**. A `Verify ...` step turns intent into a hard check: if it fails, the run fails. Without checkpoints, an agent can technically "complete" a flow while landing somewhere wrong and still report success. Treat every meaningful state change — page loaded, item added, banner shown — as a place to drop a `Verify`. Checkpoints are what make these tests *tests* rather than scripts.

A second habit: keep each line to one action. "Type the username, type the password, and submit" in a single bullet asks the agent to plan three things at once. Splitting it into three lines makes both the run and the diff cleaner.

### Storing values for later steps

A step can capture a value from the page and reuse it later in the same run:

```markdown
- Store the new invoice number as 'invoice_id'
- Verify the confirmation page shows 'invoice_id'
```

The stored value also surfaces in `Result.md`, which is how you pull structured output (an order ID, a generated token, a confirmation number) out of a run for the next stage of a pipeline.

## Variables: parameterize and protect secrets

Hard-coding `https://staging.example.com` and a password into a test file is a problem twice over: the file only runs against one environment, and the password is now in your Git history. The `{{variable}}` syntax solves both.

Anywhere you write `{{name}}` in a step, BrowserBash substitutes a value at run time. Put environment-specific and sensitive values in a variables JSON file rather than in the test:

```json
{
  "base_url": "https://staging.example.com",
  "username": "qa@example.com",
  "password": { "value": "s3cr3t-pass", "secret": true }
}
```

A plain `"key": "value"` is a normal substitution. The object form `{ "value": "...", "secret": true }` marks a value as a secret — and a secret is **masked as `*****` everywhere it would otherwise appear**: in console output, in logs, and in the `Result.md` report. The agent still uses the real value to drive the browser; you just never see it printed. That is what makes it safe to commit a `_test.md` file that *references* `{{password}}` — the sensitive part lives in a separate file you keep out of version control or inject from a secrets manager.

The same test file now runs against any environment by swapping which variables file you point at. Your `checkout_test.md` does not change between staging and a production-like environment; only the values behind `{{base_url}}` and the credentials do. This is the difference between a test you wrote for today and a test the suite can keep.

## @import: a shared-steps library without step definitions

Plain English still deserves DRY. The prelude that every test repeats — open the login page, sign in, confirm you landed on the dashboard — should live in exactly one place. That is what `@import` is for.

Put shared steps in their own Markdown file. By convention these helpers skip the `_test.md` suffix, because they are shared steps, not standalone tests. A common layout:

```text
.browserbash/
├── tests/
│   ├── helpers/
│   │   └── login.md
│   ├── checkout_test.md
│   └── invoices_test.md
└── variables/
    └── staging.json
```

`helpers/login.md` is just a Markdown list of steps:

```markdown
- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field and press Enter
- Verify the dashboard heading is visible
```

Any test pulls it in with an `@import` line, placed exactly where those steps belong in the flow:

```markdown
# Create an invoice

@import ./helpers/login.md

- Open {{base_url}}/invoices/new
- Fill the client field with 'Acme Ltd' and the amount with '450'
- Click the 'Create invoice' button
- Verify the 'Invoice scheduled' banner is visible
- Store the new invoice number as 'invoice_id'
```

Mechanically, `@import` splices the helper's steps into the test at that line, in order, before the run begins. The agent sees one flat sequence — the login steps followed by the invoice steps — exactly as if you had typed them inline. The payoff is the one every team eventually needs: when you rename the login field or move the sign-in button, you fix `helpers/login.md` once, and every test that imports it is fixed. A suite of twenty tests that each start with the same five-line login no longer means twenty places to update.

Keep helpers small and imperative — one action per line, the same rules as any test — and name them for the flow they encapsulate (`login.md`, `add_to_cart.md`, `open_admin.md`). A helper that tries to do too much is as hard to reason about as a 400-line function.

## Result.md: the report every run writes

Every `testmd run` writes a `Result.md` file next to the test. This is not an afterthought — it is the durable record of what happened, in the same readable Markdown as the test itself. A `Result.md` captures:

- **The verdict** — passed or failed — for the run as a whole.
- **Per-step outcomes**, so when something fails you see exactly which line derailed and why, rather than a stack trace.
- **Stored values** you captured with `Store ... as '...'`, like `invoice_id`, surfaced as structured output (with any secrets still masked as `*****`).

Because it is Markdown, `Result.md` is reviewable the same way the test is. Teams read the nightly `Result.md` files the way they used to skim a status channel: open the file, see the verdict, read the one step that went sideways. When a checkpoint fails, the report points at the assertion that broke, which turns "the test is red" into "the confirmation banner didn't appear after step 6" — a debuggable statement instead of a mystery.

## Recording a run: screenshots, video, and traces

When a test fails on a machine you are not sitting at — CI, a teammate's laptop, a flaky overnight run — a written report is good but a recording is better. Add `--record` to capture a screenshot **and** a session video (a `.webm`, stitched together with ffmpeg) of the run:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md --headless --record
```

Recording works on either engine. BrowserBash ships two: the default **Stagehand** engine (the MIT-licensed AI browser-automation framework from Browserbase) and a **builtin** engine — an in-repo Anthropic tool-use loop driving Playwright. When you record on the builtin engine, you also get a Playwright trace, which you can step through frame by frame to see exactly what the agent saw at each moment. For a checkout flow that only breaks one time in ten, a video plus a trace is the difference between reproducing the bug and guessing at it.

## Running markdown tests in CI

The same files that are reviewable in a pull request are also the files that gate your merges. For automation, the `--agent` flag makes a run machine-readable: it emits NDJSON (one JSON event per line, on a stable schema), so a CI job or an AI coding agent consumes structured events instead of parsing prose. Pair it with `--timeout` to bound the run:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md \
  --headless --agent --timeout 180
```

The exit code is what gates the pipeline, and it is unambiguous:

- `0` — passed
- `1` — failed (a checkpoint did not hold)
- `2` — error (something broke before a verdict)
- `3` — timeout

No prose parsing, no scraping the terminal for the word "PASS". The job checks the exit code and moves on. This is what makes markdown tests safe to put in front of a `merge` gate: a `_test.md` file that stops being true fails the build the moment it does, with an exit code your CI already knows how to read. (For a deeper look at NDJSON events and exit codes, see the BrowserBash [blog](https://browserbash.com/blog).)

## Pushing a run to the dashboard

By default, nothing leaves your machine — runs, recordings, and reports stay local. If you want run history, replayable recordings, and a per-run timeline in one place, create a free account and connect the CLI:

```bash
browserbash connect --key bb_xxxxxxxx
browserbash testmd run .browserbash/tests/checkout_test.md --record --upload
```

`--upload` pushes that run — verdict, recording, and metadata — to the cloud dashboard, where you get run history and per-run replay. Cloud runs are kept for 15 days on the free tier. Prefer to keep everything local? There is a free, private local dashboard built in:

```bash
browserbash dashboard
```

The rule is simple and worth repeating: **nothing leaves your machine unless you pass `--upload`.** The dashboard is opt-in convenience, not a dependency.

## Scaling beyond your own browser

Markdown tests are not locked to local Chrome. The same `_test.md` files run on a remote browser grid by switching one flag — `--provider`. To run on LambdaTest's cloud, for example:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md \
  --provider lambdatest --record
```

The supported providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. The test files do not change — the agent reads the same steps, asserts the same checkpoints, and writes the same `Result.md`. Where the browser physically runs is a deployment detail, not a rewrite. (If you want the conceptual tour of engines, providers, and the agent loop, the [learn](https://browserbash.com/learn) section is the place to start.)

## A workflow that holds up

Put the pieces together and a durable pattern emerges. Keep `*_test.md` files under version control next to the code they exercise. Factor every repeated prelude into a `helpers/` file and pull it in with `@import`. Push all environment-specific and sensitive values into a variables JSON file, marking anything sensitive `secret: true` so it is masked. Make every meaningful state change a `Verify` checkpoint. Run locally with a visible browser while you author, then `--headless --agent --timeout` in CI where the exit code gates the merge. Add `--record` to anything that can fail unattended, and `--upload` only when you want it in the dashboard.

The result is a suite that reads like documentation, survives the UI churn that shatters selector scripts, and is reviewable by people who would never open a test framework — all from files that are nothing more than Markdown lists.

## FAQ

### What makes a markdown file a BrowserBash test?

Any file ending in `_test.md` is treated as a test, and each Markdown list item in it is one executable step. The first heading names the test, action steps tell the agent what to do, and `Verify ...` steps assert what should be true. You run it with `browserbash testmd run file_test.md`, and a `Result.md` report is written next to it.

### How does @import differ from Gherkin step definitions?

`@import ./helpers/login.md` splices that file's steps into the test at exactly that line, in order, before the run starts — there is no step-definition layer mapping English to code. The agent interprets the spliced-in steps directly against the browser, the same as any inline step. That is the whole point: the readable list and the executable list are the same artifact, so they cannot drift apart the way Gherkin's English and its glue code do.

### Are secrets in variables safe to use?

Yes, when you mark them. A variable written as `{ "value": "...", "secret": true }` is masked as `*****` everywhere it would otherwise print — console output, logs, and the `Result.md` report — while the agent still uses the real value to drive the browser. Keep the variables JSON file out of version control or inject it from a secrets manager, and the committed `_test.md` only ever references `{{password}}`, never the value.

### What happens when a markdown test fails?

The run exits non-zero — `1` when a `Verify` checkpoint did not hold, `2` for an error before any verdict, `3` for a timeout — and `Result.md` records which step derailed and why. If you ran with `--record`, you also have a screenshot and a `.webm` video of the session (plus a Playwright trace on the builtin engine) to replay exactly what the agent saw. That turns a red build into a specific, debuggable statement instead of a stack trace.

## Try it

Markdown test files are free and open source (Apache-2.0), and you can have one running in the time it took to read this. Install with `npm install -g browserbash-cli`, write a `_test.md` list, and run `browserbash testmd run`. When you want run history and replayable recordings, [create a free account](https://browserbash.com/sign-up) — it stays free, nothing leaves your machine unless you pass `--upload`, and the whole project is open source.
