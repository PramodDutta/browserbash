---
title: Test a Payload CMS Front End in Plain English
description: "Learn how to test Payload CMS frontend rendering, blocks, and dynamic pages in plain English with an AI agent that drives a real browser."
date: 2026-06-13
category: guide
---

If you build with Payload CMS, your front end is only as trustworthy as the last content edit an editor made. You need a fast way to test a Payload CMS frontend that catches broken blocks, missing hero images, and dropped rich-text sections before they hit production. The old answer was a pile of Playwright selectors that shatter every time a designer renames a class. The newer answer is to describe what a page should show in plain English and let an AI agent drive a real Chrome browser to confirm it. That is exactly what BrowserBash does, and it fits the way Payload actually works: content-driven pages assembled from a flexible blocks field, rendered by a Next.js or standalone front end you do not want to re-instrument every sprint.

This guide walks through testing Payload-driven pages by intent instead of by selector. You will seed content through Payload's REST API, then verify that the rendered page shows what an editor expects, using deterministic checks where it matters. The result is a committable test suite that survives redesigns and reads like acceptance criteria.

## Why Payload front ends are hard to test the old way

Payload's superpower is its layout builder. A page document is usually a `layout` field holding an array of blocks: a hero block, a content block, a media block, a call-to-action block, maybe a code block or an archive block. Editors reorder them, toggle them, and drop new ones in without touching code. Your front end maps each block type to a React component and renders whatever the API returns.

That flexibility is a testing nightmare for selector-based tools. Consider the failure modes you actually see:

- A block renders, but its rich-text field came back empty because a Lexical migration silently dropped a node.
- The hero image is present in the CMS but the front end requests the wrong Payload media size and gets a 404.
- Draft-versus-published logic leaks a draft block onto a live page.
- A newly added block type has no matching front-end component, so it renders as nothing and no one notices.

None of these throw a JavaScript error. The page returns HTTP 200. A synthetic check that only pings the URL sees green. To catch them, you have to assert on what a human would see, against content that changes constantly. Writing CSS selectors for a layout that editors rearrange weekly means your tests break for reasons that have nothing to do with real bugs.

## What "test by intent" means with BrowserBash

BrowserBash is a free, open-source natural-language browser automation CLI. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors and no page objects, and you get back a deterministic verdict plus structured results. It is positioned as the open-source validation layer for AI agents, and it works just as well as a plain end-to-end tool for humans.

For a Payload front end, "test by intent" looks like this. Instead of `await page.locator('.hero__title').toHaveText('Welcome')`, you write:

```bash
browserbash run "Open https://your-site.com/about and confirm the page shows a hero with the heading 'About Our Team' and at least three team member cards below it" --agent
```

The agent reads the page the way a person does, finds the hero, checks the heading text, counts the cards, and returns a pass or fail with a summary of what it saw. When your designer renames `.hero__title` to `.page-hero__heading`, the test does not care. The intent is unchanged, so the test is unchanged.

Install takes one line and the tool defaults to free local models through Ollama, so nothing has to leave your machine to get started:

```bash
npm install -g browserbash-cli
browserbash run "Open https://your-site.com and confirm the main navigation has links for Home, Blog, and Contact"
```

Model resolution is Ollama-first: it uses a local model if one is available, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat up front: very small local models (roughly 8B parameters and under) get flaky on long multi-step objectives. For real Payload flows, use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. You can read more about the model story and provider options on the [features page](https://browserbash.com/features).

## Seed content, then verify it: the testmd v2 pattern

The most reliable way to test a Payload front end is to control the content that produces it. You do not want to assert against whatever happens to be in the database today. You want to create a known page through Payload's REST API, then check that the front end renders it correctly. BrowserBash supports this directly with testmd v2, a markdown test format where API steps and UI verification live in one file.

A testmd v2 file adds `version: 2` to its frontmatter, which makes steps execute one at a time against a single browser session. Two step types never touch a model and stay fully deterministic: API steps that call your endpoints, and Verify steps that compile to real Playwright checks. Consecutive plain-English steps run as grouped agent blocks on the same page.

Here is a test that creates a Payload page with a hero block through the REST API, then confirms the front end renders it:

```
---
version: 2
---
# Payload hero block renders on the front end

POST {{PAYLOAD_URL}}/api/pages with body {"title":"QA Landing","slug":"qa-landing","_status":"published","layout":[{"blockType":"hero","heading":"Trusted by Builders","richText":"We ship content-driven sites."}]}
Expect status 201, store $.doc.id as 'pageId'

Open {{SITE_URL}}/qa-landing
Verify heading "Trusted by Builders" is visible
Verify text "We ship content-driven sites." is visible

DELETE {{PAYLOAD_URL}}/api/pages/{{pageId}}
Expect status 200
```

Walk through what happens. The `POST` step creates a published page with a single hero block and stores the new document ID. The agent opens the rendered slug on your front end. The two `Verify` lines compile to real Playwright expectations, so a pass means the heading and body text genuinely appeared in the DOM, with expected-versus-actual evidence captured if they did not. Finally the `DELETE` step cleans up the test page so your CMS does not fill with QA junk.

This seed-then-verify loop is the backbone of trustworthy Payload testing. You assert that a specific block configuration produces a specific rendered result, which is precisely the contract between Payload and your front end.

One caveat worth stating plainly: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run the v2 flow on Ollama or OpenRouter directly. If you want fully local execution today, you can still test with plain `browserbash run` objectives and v1 test files, and seed content with a separate curl step in CI.

## Deterministic Verify checks versus agent judgment

BrowserBash draws a clear line between checks that must be exact and checks that benefit from human-like reading. Understanding that line is how you build a suite you can actually trust in CI.

Deterministic Verify assertions compile to real Playwright checks with no LLM judgment involved. The grammar covers the things you want to be precise about:

- URL contains a value
- Title is or contains a value
- Text is visible
- A named button, link, or heading is visible (`'Subscribe' button visible`)
- Element counts (useful for "exactly six blog cards")
- A stored value equals an expected value

When one of these fails, you get expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table. There is no ambiguity about why it failed.

Verify lines that fall outside that grammar still run, but they run agent-judged and get flagged `judged: true` so you can tell the difference in your results. A judged check like "Verify the page feels visually balanced" is useful for smoke-testing a redesign, but you should know it is a model opinion, not a deterministic assertion. For a Payload block that must contain exact copy, prefer the deterministic form. For "the hero image looks like a photo of a team, not a broken placeholder," lean on agent judgment and accept the softer guarantee.

### A practical split for Payload pages

For each block type, decide which checks are contract and which are vibe. A CTA block's button text and destination are contract: use deterministic Verify for the button label and a URL-contains check after clicking. Whether the CTA section "stands out enough" is vibe: let the agent judge it. Mapping this out per block type gives you a suite that is both strict where correctness matters and flexible where design evolves.

## Testing dynamic Payload routes and collections

Payload front ends rarely have one hard-coded page. You have collection routes: `/blog/[slug]`, `/authors/[slug]`, `/products/[slug]`. Each is generated from a collection document, and each is a place where the front end can silently drop a field. Testing these by intent scales well because the objective describes the shape of a correct page, not the specifics of any one document.

Create a test file per route type and template the identifiers with variables:

```bash
browserbash run "Open {{SITE_URL}}/blog/{{POST_SLUG}} and confirm the article shows a title, a published date, an author name with an avatar, and body content with at least two paragraphs" --agent --timeout 120
```

Because BrowserBash supports `{{variables}}` templating and secret masking, you can point the same test at staging or production by swapping the base URL, and you can drive it across a set of known slugs. Committable `*_test.md` files with `@import` composition let you share a common header (base URL, auth, viewport) across every route test without repeating yourself.

### Verifying archive and pagination blocks

Payload's archive block is a common source of subtle bugs: it queries a collection and renders a grid. Off-by-one pagination, wrong sort order, and stale populated relationships all show up here. An intent-based check handles it cleanly:

```bash
browserbash run "Open {{SITE_URL}}/blog and confirm the archive shows exactly 9 post cards, each with a title and thumbnail, and that a 'Next' pagination link is visible" --agent
```

The count assertion is where a deterministic Verify step earns its keep. If your archive is supposed to show nine cards per page, a count check fails loudly the day someone changes the limit from nine to twelve without updating the design.

## Handling authenticated and draft-preview pages

A lot of Payload testing lives behind a login: the admin panel, draft previews, gated members areas. Re-logging in for every test is slow and brittle. BrowserBash handles this with saved logins. You log in once interactively, and the session is stored as a Playwright storageState profile you can reuse.

```bash
browserbash auth save payload-admin --url https://your-site.com/admin/login
```

A browser opens, you log in, press Enter, and the session saves. From then on, reuse it with a flag:

```bash
browserbash run "Open the Payload admin, go to the Pages collection, and confirm the 'QA Landing' page shows status Published" --auth payload-admin --agent
```

You can attach `--auth` to `run`, `testmd`, `run-all`, and `monitor`, or set an `auth:` field in a test file's frontmatter. If a saved profile's origins do not cover the target start URL, BrowserBash prints a warning instead of silently doing nothing, which saves you from the classic "why is my logged-in test on the login page" confusion.

Draft preview is a great use case. A test that logs in with a saved session, opens the preview URL for a draft page, and verifies the new block renders gives editors confidence before they hit publish. The [tutorials section](https://browserbash.com/tutorials) has more on structuring auth-gated flows.

## Running the whole suite in CI

A single test is a demo. A suite that runs on every pull request is a safety net. BrowserBash ships a memory-aware parallel orchestrator through `run-all`, plus a real GitHub Action, so a Payload front end can be validated on every content or code change.

Point `run-all` at a folder of test files and it derives concurrency from actual CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones:

```bash
browserbash run-all ./tests/payload --junit out/junit.xml --agent
```

For larger suites you can shard across CI machines and cap spend at the same time. Sharding is deterministic because it is computed on sorted discovery order, so parallel machines agree on their slices without any coordination:

```bash
browserbash run-all ./tests/payload --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

The `--budget-usd` flag stops launching new tests once the suite crosses the budget. Remaining tests are reported `skipped`, the suite exits with code 2, and the spend lands in `RunAll-Result.md` and the JUnit properties, so a runaway suite cannot quietly burn through your budget on hosted models.

The official GitHub Action wires this into pull requests. It installs the CLI, runs the suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs, and posts a self-updating PR comment with a verdict table. The setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). For a Payload project, the natural trigger is any change under your front-end app or, if you can wire it, a webhook from Payload's afterChange hooks that runs the suite when editors publish.

### Exit codes and the agent contract

BrowserBash is built for CI and AI coding agents, not prose parsing. In `--agent` mode it emits NDJSON, one JSON event per line, and uses stable exit codes: 0 passed, 1 failed, 2 error or infra or budget-stop, 3 timeout. Your pipeline branches on those codes without scraping logs. The structured `run_end` event carries the verdict, the assertions, a `cost_usd` estimate from a bundled per-model price table, and `duration_ms`, so you can gate a merge on both correctness and cost.

## Migrating existing Playwright tests

If you already have Playwright specs for your Payload front end, you do not have to throw them away to try intent-based testing. BrowserBash includes a deterministic importer that converts Playwright specs to plain-English test files heuristically, with no model involved so the output is reproducible.

```bash
browserbash import ./e2e/payload
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common `expect` assertions. Anything using `process.env.X` becomes a `{{X}}` variable. Crucially, everything it cannot translate lands in an `IMPORT-REPORT.md` file rather than being silently dropped or invented, so you know exactly what needs a human pass. This is the honest way to migrate: you get a running head start, and a clear list of the gaps.

You can also go the other direction on new flows. The recorder opens a visible browser, you click through a flow once, and Ctrl-C writes a plain-English test. Password fields never leave the page during capture, so a login step comes out as `Type {{password}} into ...` with the secret templated, not baked in.

## Monitoring a live Payload site

Testing on merge protects the code. Monitoring protects the content. Editors publish at all hours, and a bad edit can break a page long after the last deploy. Monitor mode runs a test or objective on an interval and alerts only on state changes, in both directions, never on every green run.

```bash
browserbash monitor ./tests/payload/homepage_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ --auth payload-admin
```

It fires a Slack message when the homepage flips from passing to failing, and another when it recovers, so your channel is not spammed with "still green" noise. Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload. Because the replay cache records a green run's actions and replays them on the next identical run with zero model calls, an always-on monitor is nearly token-free until the page actually changes, at which point the agent steps back in.

## When BrowserBash is the right tool, and when it is not

Credibility matters more than hype, so here is an honest read on fit.

| Scenario | Best fit |
| --- | --- |
| Content-driven Payload pages editors rearrange often | BrowserBash intent tests |
| Verifying exact copy, counts, and URLs in blocks | testmd v2 Verify assertions |
| Seeding known content, then checking the render | testmd v2 API + Verify |
| Reusing a login across many page tests | `--auth` saved sessions |
| Catching bad editor changes on a live site | `monitor` mode |
| Deep unit testing of a single React block component | Vitest or Jest, not a browser tool |
| Pixel-perfect visual regression across breakpoints | A dedicated visual-diff tool |
| Testing Payload access-control logic at the API layer | Payload's own test harness or Supertest |

BrowserBash shines when you are validating the rendered experience of a flexible, content-driven front end. It is not trying to replace your unit tests, and it is not a pixel-diff engine. If your question is "does this page show what an editor expects, no matter how the blocks are arranged," intent-based testing is the better fit.

### Who this is for

You are a good candidate for this approach if you run a Payload front end where content changes faster than code, if your Playwright suite breaks more from redesigns than from real bugs, or if you want AI coding agents to validate their own front-end changes through a stable contract. The [case study page](https://browserbash.com/case-study) covers teams in similar situations, and the [learn hub](https://browserbash.com/learn) has the deeper reference material.

## Putting it together

A solid Payload testing setup has three layers. First, seed-and-verify testmd v2 files that create known block configurations through the REST API and confirm they render, using deterministic Verify checks for exact copy and counts. Second, intent-based objective tests for dynamic collection routes that describe the shape of a correct page rather than its selectors. Third, monitor mode on your highest-traffic pages so a bad publish pages you before it pages your customers. Wire all of it into the GitHub Action, gate merges on the exit code and the `cost_usd` estimate, and you have a suite that keeps pace with a CMS whose whole point is that content changes constantly. Start with one plain-English test against your homepage, then grow outward one block type at a time.

## FAQ

### How do I test Payload CMS blocks without writing CSS selectors?

Describe what the block should show in plain English and let the AI agent read the page the way a person does. For example, you can ask BrowserBash to confirm a hero shows a specific heading and a certain number of cards beneath it, and the agent finds those elements without any selector. When a designer renames a class the test still passes, because the intent has not changed, only the markup.

### Can I create Payload content through the API and then check the rendered page in one test?

Yes. A testmd v2 file lets you call Payload's REST API with a POST step to create a page document, store the returned ID, open the rendered slug on your front end, verify the content appeared, and then delete the test page to clean up. This seed-then-verify pattern means you assert against known content instead of whatever happens to be in the database, which is the most reliable way to test a content-driven front end.

### Does intent-based testing work for dynamic collection routes like blog posts?

It works especially well for them. You write one objective that describes the shape of a correct page, such as a title, a published date, an author with an avatar, and body content, then template the slug with a variable and point it at any document. Because the test describes structure rather than specific markup, a single test file covers every document in the collection and keeps working as content changes.

### Do I need API keys to start testing my Payload front end?

No. BrowserBash defaults to free local models through Ollama, so plain-English objective tests and v1 test files run entirely on your machine with nothing leaving it. The testmd v2 flow with API and Verify steps currently needs the builtin engine, which uses an Anthropic key or a compatible gateway, but you can begin with fully local runs and add a key only when you want the deterministic v2 seeding loop.

Ready to try it on your own site? Install with `npm install -g browserbash-cli` and write your first plain-English test in minutes. Creating an account is optional and everything runs locally by default, but if you want hosted dashboards and monitoring you can [sign up here](https://browserbash.com/sign-up).
