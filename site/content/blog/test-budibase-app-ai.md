---
title: Test a Budibase App With Plain-English Tests
description: "Learn to test a Budibase app with plain-English tests: verify data-bound screens by intent, seed rows via API, and assert deterministically."
date: 2026-06-11
category: guide
---

If you build internal tools on Budibase, you already know the awkward gap: the app is generated from your data, but the tests are not. You drag a Data Provider onto a screen, bind a table to it, wire up a form, and ship. Then something in the data model shifts and a screen quietly renders the wrong rows. To test a Budibase app the traditional way, you would open the browser, click through the flow, and eyeball the result. This guide shows a faster path: write a plain-English objective, let an AI agent drive a real Chrome browser through your Budibase screen, and get back a deterministic verdict. No selectors, no page objects, no brittle CSS paths that break the moment Budibase regenerates its markup.

The tool is [BrowserBash](https://browserbash.com/features), a free, open-source (Apache-2.0) command-line runner from The Testing Academy. You describe what a screen should do in the language a product owner would use, and BrowserBash validates it against a running instance. Because Budibase leans so heavily on data-bound components, the intent-first model fits it unusually well. You are rarely testing "did the button turn blue." You are testing "does this screen show the row I just created, and only that row." That is a claim about intent and data, which is exactly what a language-driven runner is good at.

## Why Budibase apps are hard to test the old way

Budibase is a low-code builder. Screens are assembled from components (Data Provider, Repeater, Form, Table, Button) that bind to data sources: internal tables, a Postgres or MySQL connection, a REST datasource, or a Google Sheet. The HTML those components produce is generated. Class names are hashed, the DOM tree is deep, and a small change in the builder can reshuffle the markup underneath a screen that looks identical to a user.

That generated markup is poison for selector-based testing. If you record a Selenium or Cypress script against a Budibase screen, you end up pinning assertions to auto-generated attributes that were never meant to be a public contract. The next time someone re-binds a component or adds a column, your locators drift and the suite goes red for reasons that have nothing to do with a real regression. You spend your afternoon repairing selectors instead of catching bugs.

There is a second problem specific to low-code: the person who owns the app is often not the person who writes tests. A Budibase app might be built by an ops lead or a solutions engineer, not a full-time SDET. Asking them to maintain a page-object model is a non-starter. What they can do is describe the screen. "The dashboard should list every open ticket assigned to me, newest first." That sentence is a test. It just needs a runner that can execute it.

### Data binding is the thing you actually want to assert

The interesting bugs in a Budibase app almost always live in the binding layer. A filter that references the wrong column. A relationship that returns duplicates. A row action that updates the record but leaves the table stale until refresh. An access rule that leaks another user's data into a shared view. None of these are visual bugs. They are all statements about which data reaches which screen, and whether the screen reflects the truth in the table.

When you test a Budibase app by intent, you write the assertion at that level. You are not checking that a `div` exists. You are checking that the screen shows the customer you seeded, with the status you set, and nothing else. That is a much more valuable test, and it survives markup churn because it never mentions markup.

## Set up BrowserBash for your Budibase instance

Installation is one command, and there is nothing to configure on the Budibase side. BrowserBash drives whatever URL you point it at, whether that is Budibase Cloud, a self-hosted instance behind your VPN, or a local dev build on `localhost:10000`.

```bash
npm install -g browserbash-cli

# Smoke test: open your published Budibase app and confirm the home screen loads
browserbash run "Open https://my-tenant.budibase.app/app/support-desk and confirm the heading 'Open Tickets' is visible" --headless
```

By default BrowserBash is Ollama-first. It looks for a local Ollama model before it reaches for any API key, which means you can run these tests with nothing leaving your machine. The resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat worth stating up front: very small local models (around 8B parameters and under) get flaky on long multi-step Budibase flows where the agent has to open a record, edit three fields, save, and re-read the table. For those, use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. Short single-screen checks run fine on smaller models. The [tutorials](https://browserbash.com/tutorials) walk through picking a model for your hardware.

Budibase apps almost always sit behind a login, so the first real thing you need is a saved session.

## Handle the Budibase login once with saved auth

Budibase authenticates users before it renders any app screen. You do not want the agent typing a password on every run, and you definitely do not want that password sitting in a test file. BrowserBash solves this with saved logins backed by Playwright's storageState.

```bash
# Opens a real browser at the Budibase login page. Log in by hand, press Enter, done.
browserbash auth save budibase --url https://my-tenant.budibase.app/builder

# Every later run reuses that session, no password in the test
browserbash run "Open the Support Desk app and verify the 'Open Tickets' table shows at least one row" --auth budibase --headless
```

The `auth save` flow opens a visible browser at the URL you give it. You complete the login the normal way (including SSO or a magic link if your tenant uses one), press Enter in the terminal, and BrowserBash captures the session. From then on you pass `--auth budibase` to `run`, `testmd`, `run-all`, or `monitor`, and every test starts already logged in. If the saved profile's origins do not cover the URL a test tries to open, BrowserBash prints a warning rather than silently failing, so you find out immediately when a session has expired.

This one feature removes the single biggest source of friction in low-code testing. Budibase sessions are short-lived, and re-authenticating in every script is the kind of tax that makes people abandon a suite. Save it once, reference it by name, refresh it when it expires.

## Write your first data-bound screen test by intent

Now the core loop. You want to prove that a Budibase screen renders the data it is bound to. Start with the simplest possible claim and build up.

```bash
browserbash run "Open the Support Desk app, go to the Tickets screen, and confirm the table lists a ticket titled 'Printer offline' with status 'Open'" --auth budibase --agent --headless
```

Note the `--agent` flag. That switches output to NDJSON, one JSON event per line, so you get a machine-readable stream of every step the agent takes plus a final verdict. Exit codes are stable and CI-friendly: 0 for passed, 1 for failed, 2 for an error or infrastructure problem, 3 for a timeout. You never parse prose to know whether a test passed. The [agent integration docs](https://browserbash.com/learn) cover the full NDJSON schema.

What actually happens when this runs: the agent opens the app, reads the page like a person would (using the accessibility tree, not hashed class names), finds the Tickets screen, scans the table for a row matching your description, and returns a structured verdict. Because it navigates by what the screen says rather than by a selector, a Budibase rebuild that reshuffles the DOM does not break the test. The row is still labeled "Printer offline," the status column still reads "Open," and the agent still finds them.

### Verifying a filtered or personalized view

Budibase Data Providers frequently apply filters bound to the logged-in user or to a search box. These are the views most likely to have binding bugs, so they deserve explicit tests.

```bash
browserbash run "Open the Support Desk app, type 'network' into the ticket search box, and confirm every visible row's title contains the word 'network'" --auth budibase --headless
```

That objective asserts something a selector script cannot easily express: a property that must hold for all visible rows, not just one. If the search filter is bound to the wrong column, some rows will not contain "network" and the agent reports a fail with the offending content. This is the class of bug that quietly ships in low-code apps because nobody wrote the test that would have caught it.

## Seed data first, then verify through the UI with testmd v2

Ad-hoc `run` commands are great for exploration, but a real suite needs to control its own data. You do not want a test that depends on a "Printer offline" ticket someone might delete. This is where testmd version 2 earns its place. A `*_test.md` file with `version: 2` frontmatter executes one step at a time against a single browser session, and it gives you two deterministic step types that never call a model: API steps for seeding data, and Verify steps for asserting it through the UI.

Budibase exposes a REST API for internal tables, so you can create a row with an API step and then confirm the data-bound screen renders it. Here is a `budibase_ticket_test.md`:

```
---
version: 2
auth: budibase
---

# Verify a newly created ticket appears on the dashboard

POST https://my-tenant.budibase.app/api/public/v1/tables/ticket-table/rows with body {"title": "Seeded outage", "status": "Open", "priority": "High"}
Expect status 200, store $.data._id as 'ticketId'

Open the Support Desk app and go to the Open Tickets screen

Verify text "Seeded outage" is visible
Verify text "High" is visible
```

The API step seeds a known row and captures its id into a variable. The plain-English step navigates the app as an agent block. The `Verify` steps compile to real Playwright checks, not LLM judgment: "text visible" becomes an actual assertion, and a pass means the condition genuinely held. If the row does not render, the failure comes with expected-versus-actual evidence in the `run_end.assertions` block and in the generated `Result.md` assertion table. You get a deterministic answer about whether your data-bound screen reflects the row you just created.

Run it like any other test:

```bash
browserbash testmd run ./budibase_ticket_test.md --agent
```

Two honest constraints to plan around. First, testmd v2 currently drives the builtin engine, which speaks the Anthropic API, so the plain-English steps need an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. The deterministic API and Verify steps do not call a model at all, but the grouped English blocks between them do. Second, this pattern assumes your Budibase datasource has a reachable REST endpoint and an API key with permission to write. For internal tables that is Budibase's public data API; for external datasources you seed through their own API instead. Either way, the shape is the same: seed deterministically, assert through the UI by intent.

### Why Verify beats an agent-judged check for data assertions

Not every check should be agent-judged. When you write `Verify text "Seeded outage" is visible`, BrowserBash does not ask a model whether the text looks present. It runs a Playwright expectation. That matters for a data-bound app because the whole point is to remove ambiguity: either the row rendered or it did not. Verify lines that fall outside the supported grammar still run, but they run agent-judged and get flagged `judged: true` in the output so you can always tell a deterministic assertion from a probabilistic one. For Budibase data checks, stay inside the deterministic grammar wherever you can.

## Build a suite and run it in parallel

One screen is a start. A real Budibase app has a dozen screens: a dashboard, a detail view, a create form, an edit flow, an admin table, a settings page. Drop a `*_test.md` file per screen into a folder and let the orchestrator run them together.

```bash
browserbash run-all ./budibase-tests --auth budibase --junit out/junit.xml
```

The `run-all` orchestrator is memory-aware. It derives concurrency from your real CPU and RAM rather than blindly spawning workers, orders previously-failed and slowest tests first so you learn about breakage sooner, and flags flaky tests across runs. It writes JUnit XML that any CI system reads, plus a `RunAll-Result.md` summary. For a wide Budibase app you can slice the suite across machines and cap spend at the same time:

```bash
browserbash run-all ./budibase-tests --shard 2/4 --budget-usd 2.00 --auth budibase
```

Sharding is deterministic: the slice is computed on a sorted discovery order, so four CI machines each running `--shard N/4` cover the whole suite without coordinating. The `--budget-usd` guard stops launching new tests once estimated spend crosses your cap; remaining tests report as `skipped`, the suite exits 2, and the spend lands in the results file and JUnit properties. That cost governance matters when a Budibase suite grows and you are running it on every pull request.

The replay cache pays off here too. The first green run of each test records the actions it took. The next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page actually changed. For a stable Budibase screen that rarely moves, your suite gets cheaper and faster the more you run it.

## Compare the approaches honestly

Intent-first testing is not the only option, and it is not always the right one. Here is where each approach fits.

| Approach | Best for | Weak spot on Budibase |
| --- | --- | --- |
| BrowserBash (plain-English intent) | Data-bound screens, filtered views, non-SDET authors, surviving markup churn | Long flows need a mid-size or hosted model; testmd v2 needs the builtin engine |
| Selenium / Cypress (selectors) | Pixel-level UI contracts, teams with deep framework skill | Auto-generated Budibase markup makes locators brittle and high-maintenance |
| Budibase automations / manual QA | Server-side workflow logic, quick one-off checks | No repeatable UI regression coverage, does not scale across screens |
| Postman / API-only tests | Datasource and endpoint correctness | Never proves the data-bound screen actually renders the data |

The honest read: if your Budibase app has a small number of stable, visually precise screens and your team already lives in Cypress, a selector suite is a legitimate choice. If your value is in the data layer and your screens are generated and frequently rebuilt, intent-first testing removes the maintenance tax that would otherwise sink a selector suite. And if you only care that an automation fires correctly, an API-only test is simpler than any browser test. Most teams end up with a mix: API tests for datasource logic, BrowserBash for the data-bound screens, and Budibase's own automation logs for server-side workflows.

### Who this is for

This approach fits you if you own a Budibase app and want regression coverage without hiring a framework specialist, if your screens are data-bound and change shape when you rebuild them, or if the people who understand the app best cannot write or maintain page objects. It fits less well if you need sub-pixel visual regression (use a dedicated screenshot-diff tool for that) or if your app is a single static screen where a five-line Cypress test would do the job and never change. Read a few [case studies](https://browserbash.com/case-study) to see where intent-first testing has paid off and where teams kept a selector suite alongside it.

## Keep the app honest with a monitor

Tests in CI catch regressions before merge. But a Budibase app talks to live datasources, and those can rot independently of your code: an expired database credential, a deleted external table, a datasource that starts returning duplicates. You want to know when a production screen stops reflecting reality, and you want to know it before a user files a ticket.

```bash
browserbash monitor "Open the Support Desk app and verify the Open Tickets dashboard shows today's date and at least one row" \
  --auth budibase --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode runs the check on an interval and alerts only on state changes, both directions: it pings you when a passing screen starts failing, and again when it recovers. It does not spam you on every green run. Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload for your own tooling. Because the replay cache makes a stable check nearly token-free, you can run an always-on monitor against your most important Budibase screen without a meaningful bill. That turns a data-binding failure from a Monday-morning surprise into a Saturday-afternoon Slack alert.

## Wire it into your agents and pipeline

Two more integration points close the loop. If you use an AI coding assistant to build or modify Budibase screens, you can give that agent the ability to validate its own work. BrowserBash ships an MCP server, so any Model Context Protocol host (Claude Code, Cursor, Windsurf, Codex, Zed) can call it as a native tool.

```bash
# Add BrowserBash as an MCP tool in your agent host
claude mcp add browserbash -- browserbash mcp
```

That exposes `run_objective`, `run_test_file`, and `run_suite` to the agent, each returning the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The important design detail: a failed test is a successful tool call. The agent gets the verdict and reads it, rather than the tool erroring out. So when your assistant rebuilds a Budibase screen, it can run your plain-English test suite, see the fail, and fix the binding before it hands the change back to you. BrowserBash is also on the official MCP Registry as `io.github.PramodDutta/browserbash`.

For CI, the official GitHub Action installs the CLI, runs the suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs and a `budget-usd` cap, and posts a self-updating pull-request comment with a verdict table. Point it at your `budibase-tests` folder and every PR that touches the app gets a table showing which screens passed. The full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read how any of this works.

## A realistic testing plan for a Budibase app

Putting it together, here is a plan that scales from one screen to a full app without a framework specialist on the team. Start by saving a login once with `auth save`. Write one `run` objective per critical screen to prove the happy path renders. Promote the ones that matter into `version: 2` testmd files that seed their own data with an API step and assert it with Verify steps, so the tests do not depend on data anyone can delete. Group those files into a folder and run them with `run-all`, sharded across your CI machines with a spend cap. Add the GitHub Action so every pull request that touches the Budibase app reports a verdict table. Finally, put a `monitor` on the single most important production screen so a datasource failure reaches you in minutes.

That sequence covers the four things a low-code app actually needs: proof that screens render their data, protection against markup churn, controlled test data, and continuous production checks. None of it requires you to touch a selector or maintain a page object, which is the whole point when the app itself was built without writing code.

## FAQ

### How do I test a Budibase app without writing selectors?

Point BrowserBash at your published app URL and describe what a screen should do in plain English, such as confirming a specific ticket appears with a given status. An AI agent drives a real browser, reads the page through its accessibility tree rather than hashed class names, and returns a deterministic verdict. Because it never references generated markup, a Budibase rebuild that reshuffles the DOM does not break your test.

### Can I seed data before checking a Budibase screen?

Yes. Use a testmd file with `version: 2` frontmatter, which lets you run an API step that creates a row through Budibase's REST endpoint and then a Verify step that confirms the data-bound screen renders it. The API and Verify steps are deterministic and never call a model, while the plain-English navigation steps run as agent blocks. This keeps your tests independent of any data that other people might change or delete.

### How does BrowserBash handle the Budibase login?

Run `browserbash auth save` with your login URL once, complete the sign-in by hand in the browser that opens (including SSO or magic links), and press Enter to capture the session. Later runs reference that saved profile with the `--auth` flag and start already logged in, so no password ever appears in a test file. If the saved session expires or does not cover the target URL, BrowserBash prints a warning instead of failing silently.

### Is BrowserBash free to use with Budibase?

Yes. BrowserBash is free and open-source under the Apache-2.0 license, and it defaults to local Ollama models so nothing has to leave your machine and no API key is required for basic runs. Longer multi-step Budibase flows work best with a mid-size local model or a hosted model, and testmd v2's plain-English steps currently need the builtin engine backed by an Anthropic key or compatible gateway. Anything that runs on your own machine, the CLI, the engines, the local dashboard, stays free.

Ready to test your Budibase screens by intent instead of by selector? Install the CLI with `npm install -g browserbash-cli`, save your login, and write your first plain-English assertion in the next five minutes. An account is optional and everything runs locally, but if you want the free cloud dashboard and hosted history you can [sign up here](https://browserbash.com/sign-up).
