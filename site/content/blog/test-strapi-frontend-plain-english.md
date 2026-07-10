---
title: Test a Strapi-Backed Front End in Plain English
description: "Learn to test a Strapi frontend in plain English: verify CMS content on the live site by intent, seed data via API, and assert it deterministically."
date: 2026-06-07
category: guide
---

When you test a Strapi frontend, the hard part is not clicking buttons. It is proving that the content your editors typed into the CMS actually reached the page, in the right place, with the right words. A headless CMS like Strapi splits your app in two: an admin API that stores content types and a front end (Next.js, Nuxt, Astro, plain React) that fetches and renders them. Traditional end-to-end tests bind you to brittle CSS selectors that break every time a designer reorders a section. This guide shows a different approach: describe what a visitor should see in plain English, let an AI agent drive a real browser to check it, and get a deterministic verdict back.

The tool is [BrowserBash](https://browserbash.com/features), a free, open-source natural-language browser automation CLI. You write an objective like "open the blog index and confirm the newest article title from Strapi is visible," and an agent reads the page, reasons about it, and returns pass or fail with structured evidence. No page objects. No selector maintenance. Content-driven checks that survive a redesign because they target meaning, not markup.

## Why Strapi front ends are hard to test the old way

Strapi is a content platform. Editors create entries, publish them, and expect them to surface on the public site within seconds. Between the database and the visitor sits a rendering layer that transforms JSON into DOM. Every test you write has to account for three moving parts at once: the content in Strapi, the fetch-and-transform logic, and the final rendered HTML.

Classic Selenium or raw Playwright tests hook into that final HTML with selectors. `page.locator('.article-card:first-child h2')` works until someone renames the class, wraps the card in a new grid container, or swaps the heading level from `h2` to `h3`. None of those changes are bugs. They are normal front-end evolution. But each one turns your suite red and sends an engineer digging through the DOM to re-pin a locator. Multiply that across dozens of content types and hundreds of fields and the maintenance tax gets heavy.

There is a second, subtler problem. Selector-based tests do not actually verify content. A test that asserts `.hero h1` exists tells you nothing about whether the hero says "Summer Sale" or "404 Not Found." You can have a perfectly green suite while the CMS is serving stale or wrong copy. Testing a Strapi frontend well means checking intent: is the specific published entry visible to a human reading the page?

## The plain-English approach to test a Strapi frontend

BrowserBash flips the model. Instead of telling the browser *how* to find something, you tell it *what* to confirm. An objective is one sentence of plain English. An AI agent drives a real Chrome or Chromium instance, takes a snapshot of the page, decides what to click or read, and evaluates whether your condition held.

Here is the smallest possible check against a running Strapi-backed site:

```bash
npm install -g browserbash-cli

browserbash run "Open https://mysite.com/blog and confirm the article titled 'Shipping Faster with Headless CMS' is visible in the list" --agent --headless
```

The `--agent` flag emits NDJSON, one JSON event per line, so CI and other agents can parse the outcome without scraping prose. The exit code is the contract: `0` passed, `1` failed, `2` error, `3` timeout. If that article was published in Strapi and rendered on the blog index, you get a pass. If an editor left it in draft, or the fetch silently returned an empty array, you get a fail with a summary of what the agent actually saw.

By default BrowserBash is Ollama-first. It looks for a local model before anything else, so you can run these checks with no API keys and nothing leaving your machine. If you would rather use a hosted model, it auto-resolves to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat up front: very small local models (around 8B parameters and under) get flaky on long multi-step objectives. For content verification, which is usually short and focused, a mid-size local model handles it fine. For deep multi-page flows, reach for a 70B-class local model or a capable hosted one.

### What "by intent" actually means

The angle here is verifying Strapi content by intent, not by structure. When you write "confirm the pricing page shows the 'Enterprise' plan with the price from the CMS," the agent does not care whether that plan lives in a `<div class="tier">` or a `<section data-plan>`. It reads the rendered page the way a person would and judges whether the Enterprise plan is present and priced. Rearrange the layout tomorrow and the check still passes, because the meaning did not change. That is the whole point of testing a Strapi frontend at the content layer.

## Seed content, then verify it: the deterministic pattern

Reading the live site is useful, but the most reliable Strapi tests control their own data. You do not want a check that passes only because someone happened to publish the right entry an hour ago. You want to create a known entry through the Strapi API, then confirm it appears on the front end. BrowserBash handles both halves in one committable test file using testmd v2.

A testmd file is a Markdown file with a title and steps. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session. Two of the step types are deterministic and never touch a model: API steps for seeding data, and Verify steps for asserting the UI. Here is a Strapi content test end to end:

```bash
# strapi_article_test.md
---
version: 2
---

# New article publishes to the blog

POST https://cms.mysite.com/api/articles with body {"data":{"title":"Deterministic CMS Testing","slug":"deterministic-cms-testing","publishedAt":"2026-06-07T09:00:00Z"}}
Expect status 200, store $.data.id as 'articleId'

Open https://mysite.com/blog and wait for the article list to load
Verify text "Deterministic CMS Testing" visible

Open https://mysite.com/blog/deterministic-cms-testing
Verify title contains "Deterministic CMS Testing"
Verify "Deterministic CMS Testing" heading visible
```

Run it like any other test:

```bash
browserbash testmd run ./strapi_article_test.md --agent
```

The first two lines are a pure HTTP request. BrowserBash posts to your Strapi REST endpoint, checks the response status, and stores the new entry id from the JSON path `$.data.id` into a variable you can reuse. No browser, no model, fully deterministic. The plain-English lines that follow ("Open... and wait for...") run as an agent block on the same page. The `Verify` lines compile to real Playwright assertions, not LLM judgment.

That distinction matters. A `Verify text "..." visible` step is checked by the browser engine itself. A pass means the condition held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md` file that BrowserBash writes after every run. You are not trusting a model's opinion about whether the text showed up. You are getting a deterministic yes or no, with a screenshot and DOM excerpt when it fails.

One practical note from the docs: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. The pure API and Verify steps are deterministic regardless, but the grouped plain-English steps between them route through that engine today. If you want to keep everything local, you can split content seeding into a separate script and run pure `browserbash run` objectives against the seeded state.

### Which Verify checks map to Strapi content

The Verify grammar covers the assertions you actually need for a CMS front end:

| Verify step | What it confirms for Strapi content |
| --- | --- |
| `Verify text "..." visible` | A specific field value (title, excerpt, price) rendered on the page |
| `Verify title contains "..."` | The page `<title>`, often driven by a Strapi SEO component |
| `Verify url contains "..."` | The slug from the CMS produced the right route |
| `Verify "..." heading visible` | A named heading (article title, section name) is present |
| `Verify "..." link visible` | A navigation or related-content link generated from an entry |
| element counts | The number of cards matches the number of published entries |

Anything you write on a `Verify` line that falls outside this grammar still runs, but it gets judged by the agent and flagged `judged: true` in the output. That way you can always tell a deterministic assertion from an agent-judged one when you read the results.

## Testing content that lives behind a login

Plenty of Strapi front ends gate content: member-only articles, a customer portal, a preview mode that shows unpublished drafts. Re-authenticating on every test is slow and noisy. BrowserBash lets you log in once and reuse the session.

```bash
browserbash auth save member --url https://mysite.com/login

browserbash run "Open the members dashboard and confirm the premium article 'Advanced Content Modeling' from the CMS is readable" --auth member --headless --agent
```

The `auth save` command opens a browser at the login URL, you sign in by hand, press Enter, and BrowserBash stores the Playwright storageState. Every later run that passes `--auth member` starts already logged in. If the saved profile does not cover the target start URL, you get a warning instead of a silent no-op. You can also set `auth:` in a test file's frontmatter so committed tests carry their own session requirement. This is the clean way to verify gated Strapi content without scripting the login form on every run. The full flag reference lives in the [tutorials](https://browserbash.com/tutorials).

## Wiring Strapi content tests into CI

A content check is only worth writing if it runs automatically. Put your Strapi test files in a folder and let the memory-aware orchestrator run them in parallel.

```bash
browserbash run-all ./tests/strapi --junit out/junit.xml --agent

# split across four CI machines, cap the spend
browserbash run-all ./tests/strapi --shard 2/4 --budget-usd 2.00
```

`run-all` derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. The `--shard 2/4` slice is computed on sorted discovery order, so four parallel CI machines agree on who runs what without coordinating. If you run against hosted models, `--budget-usd` stops launching new tests once the suite crosses your spend cap: remaining tests report `skipped`, the suite exits `2`, and the total lands in `RunAll-Result.md` and the JUnit properties.

There is also an official GitHub Action. It installs the CLI, runs the suite, uploads JUnit, NDJSON, and Result artifacts, supports a `shard:` matrix and `budget-usd:`, and posts a self-updating PR comment with the verdict table. When a content model change lands in a pull request, reviewers see immediately whether the front end still renders the entries correctly. The setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

### Catch content regressions before your editors do

CMS content changes constantly, often outside your deploy cycle. An editor unpublishes an article, a translator swaps a headline, a migration drops a field. Monitor mode watches for exactly this drift.

```bash
browserbash monitor "Open https://mysite.com and confirm the featured story headline from the CMS is visible and not empty" --every 10m --notify https://hooks.slack.com/services/XXX
```

The monitor runs on an interval and alerts only when the pass/fail state changes, in either direction. It does not spam you on every green run. If the CMS starts serving an empty hero, you hear about it once, the moment it breaks, and once again when it recovers. Because the replay cache records a green run's actions and replays them with zero model calls until the page actually changes, an always-on content monitor stays nearly token-free.

## When plain-English testing is the right call, and when it is not

This approach is not a silver bullet, and pretending otherwise would waste your time. Here is an honest breakdown.

**Reach for plain-English content checks when:**

- You are verifying that CMS-managed copy, titles, prices, or media reach the page correctly. This is the sweet spot.
- Your front end changes shape often (redesigns, A/B tests, component refactors) but the content contract stays stable.
- You want tests that a non-engineer can read and even write, since they are plain sentences.
- You need editors or product managers to trust that a green suite means the site actually shows the right content.

**Stick with traditional selector-based Playwright or Cypress when:**

- You are testing pixel-precise layout, exact CSS values, or animation timing. Intent-based checks do not measure a 4px margin.
- You need microsecond-level performance assertions or deep network interception on every request.
- Your flow is a tight, high-frequency unit interaction where a hard-coded selector is genuinely faster and you own the markup completely.

Many teams run both. Keep your fast, deterministic Playwright unit and integration tests for the rendering logic, and layer BrowserBash content checks on top to prove the CMS-to-page contract holds. If you already have a Playwright suite, you do not have to rewrite it by hand.

### Migrate an existing Playwright suite

BrowserBash ships a deterministic importer. It converts Playwright specs to plain-English test files with no model involved, so the output is reproducible.

```bash
browserbash import ./e2e/strapi-blog.spec.ts
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common `expect` calls. `process.env.X` becomes a `{{X}}` variable. Anything it cannot translate cleanly lands in an `IMPORT-REPORT.md` file rather than being silently dropped or invented. You get a running head start on a plain-English suite and a clear list of what still needs a human eye.

If you would rather build a new test by clicking through the site, `browserbash record https://mysite.com/blog` opens a visible browser, you walk the flow once, and Ctrl-C writes a plain-English test. Password fields never leave the page; the capture sends only a secret marker and the generated step reads `Type {{password}} into ...`.

## Let your AI coding agent run the content checks

If you build with Claude Code, Cursor, Windsurf, Codex, or Zed, BrowserBash can act as their validation layer over the Model Context Protocol. Start the MCP server and register it with one line:

```bash
claude mcp add browserbash -- browserbash mcp
```

Now your coding agent has three tools: `run_objective` for a single plain-English check, `run_test_file` for a testmd file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON: status, summary, final_state, assertions, cost_usd, duration_ms. This closes a real gap in agentic development. When you ask your agent to add a new Strapi content type and wire it into the front end, it can write the fetch code and then actually confirm the content renders, all in the same loop.

A failed test is a successful validation. The MCP tool call succeeds and hands the agent the verdict to read and act on. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so hosts that browse the registry can find it directly. For a deeper walk through the agent integration, the [learn hub](https://browserbash.com/learn) has the full setup.

## A realistic end-to-end Strapi test walkthrough

Tie the pieces together with a concrete scenario. Say your marketing team manages a "Case Studies" collection type in Strapi, and the front end renders each entry at `/case-studies/[slug]` with an index at `/case-studies`. You want a test that proves: creating a published case study makes it appear on the index and renders correctly on its own page.

Start by seeding through the API, then verify the index, then verify the detail page. Written as a v2 testmd file, the first step POSTs a new entry and stores its slug, the middle steps open the index and confirm the new title is visible, and the final steps navigate to the detail route and confirm the heading and page title match the CMS value. Every Verify line is a real Playwright assertion, so a fail hands you expected-versus-actual evidence instead of a vague "element not found."

Run it locally while developing, add it to `run-all` for CI, and point a monitor at the production index so you learn within ten minutes if a published case study ever stops rendering. The same three-sentence test file serves all three purposes because BrowserBash does not care about the DOM structure underneath. It cares whether the content a visitor should see is actually there.

That is the durable win. Your front-end team can restyle the case study cards, migrate from a REST fetch to GraphQL, or move from Next.js pages to the app router, and the content contract test keeps passing as long as the right words reach the page. When it does turn red, it is because the content genuinely broke, which is exactly when you want to know. You can browse more worked examples on the [BrowserBash blog](https://browserbash.com/blog).

## FAQ

### How do I test that Strapi content actually appears on my front end?

Write a plain-English objective that names the specific content you expect, then let BrowserBash drive a real browser to confirm it. For example, run an objective that opens your blog index and checks that a known published article title is visible. The agent reads the rendered page by meaning rather than by CSS selector, so the check confirms the content reached the page even after a redesign. For repeatable runs, seed a known entry through the Strapi API first, then use a Verify step to assert it in the UI.

### Do I need API keys or a cloud account to run these tests?

No. BrowserBash is Ollama-first and defaults to free local models, so you can run content checks with no API keys and nothing leaving your machine. It only reaches for a hosted model if you have set one up, resolving in order to your Anthropic, OpenAI, or OpenRouter key. One exception worth knowing: testmd v2 files that mix API steps and grouped plain-English steps currently use the builtin engine, which needs an Anthropic key or a compatible gateway, though the pure API and Verify assertions stay deterministic regardless.

### What is the difference between a Verify step and a plain-English step?

A Verify step compiles to a real Playwright assertion and is checked by the browser engine with no model judgment, so a pass means the condition provably held and a fail comes with expected-versus-actual evidence. A plain-English step is interpreted by the AI agent, which decides how to act on the page. Verify lines that fall outside the supported grammar still run but get agent-judged and flagged as judged in the output, so you can always tell deterministic assertions apart from judged ones.

### Can my AI coding assistant run these Strapi tests automatically?

Yes. Start the MCP server with the browserbash mcp command and register it with your host, and agents like Claude Code, Cursor, Windsurf, Codex, or Zed gain tools to run a single objective, a test file, or a whole suite. Each call returns a structured verdict with status, summary, assertions, cost, and duration, so the agent can write front-end code and then confirm the CMS content renders in the same loop. A failed test still returns cleanly as a successful validation the agent can read and act on.

Content-driven testing is the reliable way to prove your headless CMS reaches your users. Install BrowserBash with `npm install -g browserbash-cli`, write your first objective against a running Strapi front end, and watch it verify by intent instead of by selector. Create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) to sync runs across machines, or skip it entirely and keep everything local. An account is optional; the CLI is yours to use today.
