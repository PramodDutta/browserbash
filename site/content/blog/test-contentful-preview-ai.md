---
title: Test a Contentful-Powered Site With Plain-English AI
description: "Learn to test Contentful site content with plain-English AI: verify preview vs published entries by intent on the real front end, no selectors."
date: 2026-06-05
category: guide
---

When you need to test a Contentful site, the hard part is rarely the code. It is the content. Editors change a headline in the preview environment, a legal team approves a pricing change that has not gone live yet, a hero banner gets scheduled for next Tuesday, and your automated checks either miss the difference entirely or shatter into red because a CSS class moved. This guide shows you how to test a Contentful site with plain-English AI: you write the intent of what a reader should see, an agent drives a real browser to the preview URL and the published URL, and you get a deterministic verdict on whether the content matches your expectation.

The tool here is [BrowserBash](https://browserbash.com/features), a free, open-source natural-language browser automation CLI. You describe what you want checked in ordinary English, an AI agent drives a genuine Chrome browser step by step (no selectors, no page objects), and it returns a pass or fail plus structured results. That model fits headless CMS testing unusually well, because Contentful content is about meaning, not markup, and meaning is exactly what plain-English assertions capture.

## Why Contentful sites break traditional front-end tests

A Contentful-powered site separates content from presentation. Your Next.js, Nuxt, or Astro front end pulls entries from the Content Delivery API (published content) or the Content Preview API (draft and scheduled content), then renders them. That separation is great for editors and terrible for brittle selector-based tests.

Three things go wrong with the old approach:

First, content is dynamic by design. The whole point of a CMS is that a marketer can change the words without a deploy. A test that asserts `expect(page.locator('.hero h1')).toHaveText('Summer Sale')` becomes false the moment the summer sale ends, even though nothing is actually broken. You end up either not testing content at all or maintaining a graveyard of stale string assertions.

Second, preview and published diverge on purpose. In Contentful, the preview environment shows draft entries and future-dated content through the Preview API. The published environment shows only what the Content Delivery API serves. A correct site shows different things on those two URLs, and your tests need to understand that difference as intent, not treat it as a bug.

Third, rich text and reference fields render into deep, unstable DOM. A Contentful rich-text field can nest embedded entries, asset links, and inline hyperlinks. The generated markup shifts whenever the rendering library updates or an editor adds an embedded block. Selectors that reach into that tree snap constantly.

Plain-English AI sidesteps all three. Instead of pinning a selector, you tell the agent what a human reader should conclude, and it reads the rendered page the way a person would.

## The plain-English approach in one command

Here is the smallest useful example. You want to confirm that your published marketing page shows the current, approved hero message and a working call to action. You do not care which div holds it.

```bash
npm install -g browserbash-cli

browserbash run "Open https://www.yoursite.com and confirm the hero headline mentions the current campaign, then verify a 'Get Started' button is visible and links to the sign up page" --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, which is what you want in CI and what any AI coding agent can parse without prose scraping. The exit code tells the machine the verdict: `0` passed, `1` failed, `2` error or infrastructure problem, `3` timeout. No screenshot diffing, no selector maintenance, no flaky wait-for-element loops.

By default BrowserBash is Ollama-first. It looks for a local Ollama model before it ever reaches for a key, so nothing has to leave your machine. The resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For a simple content check like the one above, a mid-size local model handles it fine. For long multi-step flows, reach for a stronger model, and I will come back to that tradeoff honestly later.

## Verifying Contentful preview versus published content

This is the core scenario for a headless CMS, so it deserves its own workflow. Your editorial team stages a change in Contentful. Before it goes live, you want to prove two things at once: the preview URL shows the new content, and the published URL still shows the old content. Getting both right is what "content is correctly staged" actually means.

Because BrowserBash drives a real browser against whatever URL you give it, you simply point it at each environment and describe the expected intent.

```bash
# Preview environment (Contentful Preview API behind it) should show the draft
browserbash run "Open https://preview.yoursite.com/pricing and confirm the page shows the new Pro plan priced at 49 dollars per month" --agent

# Published environment (Content Delivery API) should still show the live price
browserbash run "Open https://www.yoursite.com/pricing and confirm the Pro plan is still priced at 39 dollars per month and does NOT mention 49 dollars" --agent
```

Run both, check both exit codes, and you have a deterministic answer to the question editors actually ask: is my change staged correctly and not yet leaking to production? The negative assertion in the second command matters. Testing that the published page does not show the draft price catches the most dangerous class of CMS bug, which is a preview token accidentally wired into production, or caching that serves draft content to real users.

### Why intent beats string matching here

You could pin the exact strings, and sometimes you should. But framing the check as intent gives you tolerance for the harmless variations that make string tests flaky. "Confirm the Pro plan is priced at 49 dollars per month" passes whether the page renders `$49/mo`, `49 USD monthly`, or `$49.00 per month`, because the agent reads for meaning. When an editor tweaks the formatting in Contentful without changing the actual price, your test stays green, which is exactly the behavior you want.

## Committing content checks as testmd files

One-off commands are good for exploration. For a suite you commit to your repo, BrowserBash uses `*_test.md` files: plain Markdown with a title, English steps, `@import` composition, and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so a Contentful preview token never shows up in your CI output.

A basic Contentful content test looks like this:

```
# Pricing page shows approved content

- Open https://www.yoursite.com/pricing
- Confirm the page heading mentions pricing or plans
- Verify: text "Pro" visible
- Verify: 'Get Started' button visible
- Verify: url contains "/pricing"
```

The `Verify:` lines are the important upgrade. Deterministic Verify assertions compile to real Playwright checks with no LLM judgment involved. `Verify: url contains "/pricing"`, `Verify: text "Pro" visible`, `Verify: 'Get Started' button visible`, title checks, element counts, and stored-value equality all run as hard, reproducible conditions. A pass means the condition genuinely held. A fail arrives with expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table that BrowserBash writes after every run.

This gives you a clean split. Use plain-English steps for the fuzzy, meaning-level checks that make headless CMS testing pleasant ("confirm the hero mentions the current campaign"), and use `Verify:` for the structural facts you want locked down deterministically (the URL, a button, a specific visible label). Verify lines that fall outside the supported grammar still run, but agent-judged, flagged `judged: true`, so you always know which assertions were deterministic and which leaned on the model.

## Seeding Contentful state with testmd v2 API steps

Content testing gets more interesting when you want to set up state, not just read it. Say you want to confirm that a newly created Contentful entry renders correctly on the front end. You could publish it by hand every time, or you could seed it as part of the test.

testmd v2 adds exactly this. Put `version: 2` in the frontmatter and steps execute one at a time against a single browser session, with two deterministic step types that never touch a model: API steps and Verify steps.

```
---
version: 2
auth: contentful-preview
---

# New blog entry renders on the front end

- POST https://api.example.com/seed/blog-entry with body {"title": "Test Post 2026", "slug": "test-post-2026"}
- Expect status 201, store $.sys.id as 'entryId'
- Open https://preview.yoursite.com/blog/test-post-2026
- Confirm the article title reads "Test Post 2026"
- Verify: url contains "/blog/test-post-2026"
- Verify: text "Test Post 2026" visible
```

The API step here calls your own seeding endpoint or a Contentful Management API wrapper to create the draft, captures the returned entry id with a JSONPath store, and then the English and Verify steps confirm the front end renders it. Consecutive plain-English steps run as grouped agent blocks on the same page, so the browser session and any cookies persist across the whole flow. This is how you build hybrid checks that stitch API seeding to front-end verification, which is precisely the shape of a real headless CMS test.

Two honest constraints. testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway rather than running directly on Ollama or OpenRouter today. And the API step type is deliberately simple: it is for seeding and expectations, not a full API test framework. If you need deep contract testing of the Contentful APIs themselves, keep using a dedicated API tool and let BrowserBash own the front-end verification.

## Handling authenticated Contentful preview

Preview environments are usually gated. Sometimes it is HTTP basic auth, sometimes a login form, sometimes a preview secret in the URL. For form-based logins, you do not want to re-authenticate on every single test run, and you certainly do not want credentials scattered through your test files.

BrowserBash saves logins once and reuses them. You run `browserbash auth save` against the login URL, log in by hand in the browser that opens, press Enter, and it stores the Playwright storageState. After that, any run, testmd, run-all, or monitor invocation can reuse that session with `--auth`, or a test file can pull it in through `auth:` frontmatter (as in the v2 example above).

```bash
# Log in to the gated preview environment one time
browserbash auth save contentful-preview --url https://preview.yoursite.com/login

# Reuse that session on every content check, no re-login
browserbash run "Open https://preview.yoursite.com/pricing and confirm the draft Pro plan shows 49 dollars per month" --auth contentful-preview --agent
```

If the profile you saved does not cover the origin you are trying to open, BrowserBash prints a warning instead of silently doing nothing, which saves you the classic "why is my test seeing the logged-out page" debugging session. For a deeper walkthrough of session reuse patterns, the [tutorials](https://browserbash.com/tutorials) cover several auth setups end to end.

## Monitoring published content for unexpected drift

Testing before a deploy is half the story. The other half is catching content that changes when it should not: a marketer edits live copy without review, a scheduled Contentful entry publishes at the wrong time, or a CDN caches a stale draft. You want to know the moment your published content stops matching your approved expectation, and you want to be told only when something actually flips.

Monitor mode does this. It runs a test or objective on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in both directions, never on every green run. You are not spammed with a notification every ten minutes saying "still fine." You hear from it when the state changes.

```bash
browserbash monitor "Open https://www.yoursite.com/pricing and confirm the Pro plan is priced at 39 dollars per month" \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload so you can route it wherever you like. The economics work because of the replay cache. A green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. That makes an always-on content monitor nearly token-free, which is what makes running it every ten minutes reasonable rather than expensive.

## Scaling across many pages, viewports, and a budget

A real Contentful site has dozens or hundreds of content-driven pages: blog posts, landing pages, localized variants, product entries. BrowserBash ships a memory-aware parallel orchestrator, `run-all`, that runs a folder of tests with concurrency derived from your actual CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones.

For CI, two flags matter for a content suite. Sharding splits the suite deterministically across machines, and a budget stops runaway spend.

```bash
# Machine 2 of 4 runs its deterministic slice; stop launching new tests past $2
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

The shard slice is computed on sorted discovery order, so four parallel CI machines agree on who runs what without any coordination. The `--budget-usd` guard stops launching new tests once the suite crosses the estimate; remaining tests report `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. You can also run every test across multiple viewports with `--matrix-viewport 1280x720,390x844` to confirm your Contentful content renders on both desktop and mobile, which matters when responsive layouts hide or reorder content blocks.

The `cost_usd` estimate in each `run_end` comes from a bundled per-model price table, and unknown models get no estimate rather than a wrong one, so the budget math stays honest.

## Where a traditional Playwright suite still wins

Plain-English AI is not the right hammer for every nail, and pretending otherwise would waste your time. Here is a straight comparison.

| Testing need | Plain-English AI (BrowserBash) | Selector-based Playwright/Cypress |
| --- | --- | --- |
| Content meaning ("shows the approved price") | Strong: reads intent, tolerant of formatting | Brittle: string pinning breaks on edits |
| Preview vs published verification | Strong: point at each URL, describe expectation | Works but verbose, needs custom fixtures |
| Exact pixel or layout regression | Not the focus | Strong: visual snapshot tools |
| Deep API contract testing of Contentful | Seeding only (v2 API steps) | Use a dedicated API test tool |
| Deterministic structural checks | Yes, via `Verify:` assertions | Native strength |
| Test authoring speed for content flows | Very fast: English steps | Slower: selectors, waits, page objects |
| Millisecond-precise timing assertions | Not designed for it | Strong |

If you already have a mature Playwright suite, you do not throw it away. BrowserBash includes `browserbash import` to convert existing Playwright specs to plain-English `*_test.md` files heuristically, deterministically, with no model in the loop. It translates goto, click, fill, press, check, selectOption, getBy* locators, and common expects; `process.env.X` becomes a `{{X}}` variable; and anything it cannot translate lands in an `IMPORT-REPORT.md` rather than being silently dropped or invented. A pragmatic setup keeps deterministic layout and API tests in Playwright and moves the content-meaning checks, the ones that used to break every time an editor touched Contentful, into plain English.

### Who this is for

This approach fits you if you run a headless CMS front end and your content tests are either nonexistent or perpetually red from harmless copy changes. It fits editorial and marketing-heavy sites where the risk is wrong content, not wrong code. It fits teams that want AI coding agents to validate their own changes, since the `--agent` NDJSON output and clean exit codes are built for machines to read. You can wire the whole thing into pull requests with the official GitHub Action, documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), which posts a self-updating verdict table as a PR comment.

It fits less well if your primary need is pixel-perfect visual regression or microsecond timing. Use the right tool, and let plain-English AI own the layer it is genuinely best at: the content itself.

## A realistic workflow, start to finish

Putting the pieces together, here is how a content-focused team actually uses this. You save the preview login once with `auth save`. You write a handful of `*_test.md` files, mixing English steps for meaning and `Verify:` lines for structure, one file per critical content surface (pricing, homepage hero, blog index, a localized landing page). For anything that needs setup, you reach for testmd v2 and seed the entry with an API step. You commit those files to the repo next to the code they cover.

In CI, you run the suite with `run-all`, sharded across your runners, capped with a budget, emitting JUnit for your dashboard. On the production URLs, you leave a `monitor` running every ten to fifteen minutes so any unexpected live-content change pages you through Slack. When an AI agent on your team proposes a change, it can call BrowserBash itself over MCP and read the verdict directly. The open-source project lives on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read the engine, and the [blog](https://browserbash.com/blog) has more headless-CMS patterns.

One honesty note worth repeating: very small local models (around 8B and under) can get flaky on long multi-step objectives. For a quick "is this one string on the page" check, a small local model is fine and free. For a ten-step preview-versus-published flow with seeding, use a mid-size local model (a Qwen3 or Llama 3.3 70B-class model) or a capable hosted model. Matching model size to flow complexity is the single biggest lever on reliability, and it costs nothing to get right.

## FAQ

### How do I test Contentful preview content versus published content?

Point BrowserBash at each URL and describe the expected content as intent. Run one check against your preview environment confirming the draft entry appears, and a second check against your published environment confirming the live content is unchanged and does not leak the draft. Because the agent reads for meaning rather than pinning selectors, harmless formatting differences will not cause false failures, while a real content mismatch produces a clean fail verdict with evidence.

### Can plain-English AI tests handle authenticated Contentful preview environments?

Yes. Run `browserbash auth save` once against the login URL, sign in by hand in the browser that opens, and BrowserBash stores the session as Playwright storageState. After that you reuse it with the `--auth` flag or `auth:` frontmatter in a test file, so no test ever re-logs-in or embeds credentials. If your saved profile does not cover the target origin, the tool warns you instead of silently loading the logged-out page.

### Do I need API keys to test a Contentful site with BrowserBash?

Not for basic front-end content checks. BrowserBash is Ollama-first and defaults to free local models, so nothing leaves your machine and no key is required. You only need an Anthropic key or a compatible gateway for testmd v2, which currently drives the builtin engine for its deterministic API-plus-Verify step flows. Simple published-content verification runs entirely on a local model at zero cost.

### Will these tests break when editors change content in Contentful?

That is the problem this approach is designed to avoid. Selector-based tests that pin exact strings break whenever an editor edits copy, even when nothing is actually wrong. Plain-English assertions check intent, so a headline reworded from "Summer Sale" to "Summer Savings" still passes a check for "the hero mentions the current campaign." For the facts you do want locked exactly, deterministic `Verify:` assertions give you hard, reproducible conditions with expected-versus-actual evidence on failure.

## Get started

Testing a Contentful-powered site with plain-English AI turns your most fragile tests, the content ones, into the most durable. You describe what a reader should see, an agent verifies it on a real browser, and you get a deterministic verdict you can trust in CI and in production monitoring. Install it and write your first content check in a couple of minutes:

```bash
npm install -g browserbash-cli
```

An account is optional and everything runs locally by default, but if you want the free cloud dashboard and hosted retention you can create one at [browserbash.com/sign-up](https://browserbash.com/sign-up). Start with a single preview-versus-published check on your most important page, and expand from there.
