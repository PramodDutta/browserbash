---
title: Test a Sanity.io Front End With AI Browser Automation
description: "Learn how to test a Sanity site front end by intent: verify portable text, dynamic routes, and draft-vs-published rendering with AI browser automation."
date: 2026-06-06
category: guide
---

If you run a headless CMS, the hardest part is not the studio, it is the front end. When you want to test a Sanity site, you are really asking one question: did the content that an editor typed into Sanity Studio render correctly on the page a visitor sees? Selectors do not answer that. A `data-testid` tells you a heading exists, not that the portable text block resolved into the right markup, that the dynamic route pulled the right document, or that a draft stayed hidden while the published version showed. AI browser automation lets you assert on intent instead of DOM structure, which is exactly the shape of the Sanity problem.

This guide walks through testing a Sanity.io front end with [BrowserBash](https://browserbash.com/features), a free, open-source natural-language browser automation CLI. You write a plain-English objective, an AI agent drives a real Chrome browser step by step, and you get a deterministic verdict plus structured results. No selectors, no page objects, no brittle waits keyed to a class name your build tool renamed last week.

## Why Sanity front ends are hard to test the old way

Sanity decouples authoring from presentation. Editors work in Sanity Studio, content lives in the Content Lake as documents, and your Next.js, Astro, Remix, or SvelteKit front end pulls it through GROQ queries or the GraphQL API. That decoupling is great for content teams and painful for test authors, because the thing you most want to verify (the rendered output of editor content) is the thing that changes most often and is least stable at the selector level.

Three properties make traditional end-to-end tests fragile here.

First, portable text. Sanity stores rich text as an array of structured blocks, and your front end runs those blocks through a serializer (`@portabletext/react` or similar). A single block type, say a custom callout or an inline annotation, can change the output HTML dramatically. A selector-based test that asserts `.callout > p` breaks the moment a developer restructures the serializer, even though the visible content is identical.

Second, dynamic routes. Blog posts, product pages, and author bios are almost always `[slug]` routes resolved at request or build time. The set of valid URLs is defined by content, not code, so a test suite pinned to hardcoded paths goes stale every time an editor publishes or unpublishes a document.

Third, draft and preview states. Sanity's draft system and preview mode mean the same URL can render different content depending on whether you are an anonymous visitor or an authenticated editor in preview. Verifying that a draft stays private, and that preview shows unpublished edits, is genuinely hard with tooling that cannot reason about what "should be visible to a logged-out user" means.

AI browser automation sidesteps all three because you describe the outcome in words. "The article body should contain the callout text 'Ships in 48 hours'" does not care how the serializer produced the callout, only that a real browser rendered it where a reader would see it.

## Testing by intent instead of by selector

The core shift is this: you stop encoding structure and start encoding meaning. Here is the smallest possible check against a Sanity-driven page.

```bash
npm install -g browserbash-cli

browserbash run "Open https://your-sanity-site.com/blog/launch-week \
  and confirm the article heading reads 'Launch Week Recap' \
  and the author byline shows 'Priya Nair'" --headless --agent
```

The agent navigates, takes a snapshot of the accessibility tree, reasons about what it sees, and returns a verdict. With `--agent`, output is NDJSON: one JSON event per line, ending in a `run_end` event that carries the status, a summary, the final state, and a `cost_usd` estimate. Exit codes are frozen and CI-friendly: `0` passed, `1` failed, `2` error, `3` timeout. You do not parse prose, you read a status field.

The value for Sanity work is that this same objective survives a serializer refactor, a Tailwind class rename, and a component library swap. As long as the published content still says "Launch Week Recap," the test passes. When an editor changes the headline in Studio and forgets to tell QA, the test fails with an expected-versus-actual message.

By default BrowserBash is Ollama-first: it defaults to free local models, needs no API keys, and nothing leaves your machine. It auto-resolves in order from a local Ollama install to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For simple single-page assertions like the one above, a mid-size local model handles it fine. One honest caveat: very small local models (around 8B parameters and under) get flaky on long multi-step objectives, so reach for a 70B-class local model (Qwen3 or Llama 3.3) or a capable hosted model when the flow gets long. The [learn hub](https://browserbash.com/learn) has more on picking a model for your hardware.

## Verifying portable text rendering

Portable text is where intent-based testing earns its keep. Because you cannot predict the exact HTML a serializer emits, you assert on what the reader perceives. Consider a Sanity document with a body that includes a heading, a bulleted list, an external link with an annotation, and a custom image block with a caption.

A single plain-English objective can walk the whole thing. You might run `browserbash run "Go to /guides/onboarding, confirm a bulleted list contains 'Invite your team', confirm a link 'Read the API reference' points to a docs URL, and confirm an image caption 'Dashboard overview' is visible below an image" --headless --agent`. Each clause maps to a real reader expectation. If the serializer drops list formatting, the "bulleted list containing" clause fails. If an annotation is misconfigured and the link renders as plain text, the link clause fails. This is the level of granularity that matters for a headless CMS, because the failure modes are almost always in the serialization layer, not in the raw content.

### Handling custom block types

Teams extend portable text with custom types: pull quotes, code samples, embeds, product cards. When you test a Sanity site that leans on custom blocks, describe the block by its visible role. Instead of "the `<PullQuote>` component rendered," write "a pull quote is visible that reads 'We shipped in six weeks.'" The agent looks at the page the way a person would, so it does not need to know your component names. The same test file then works across a rewrite from one framework to another, a real scenario for teams migrating a Sanity front end from Gatsby to Next.js App Router.

### Committing checks as markdown tests

For anything you want to keep, move from one-off `run` commands to committable `*_test.md` files. These support `@import` composition and `{{variables}}` templating, and they write a human-readable `Result.md` after each run. A portable-text regression file might look like a title, then plain-English steps, then `Verify` assertions that compile to real Playwright checks with no LLM judgment involved.

The distinction matters. A plain-English step is agent-driven and flexible. A `Verify` step inside a testmd file compiles to a deterministic Playwright check (URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, a stored value equals). A pass means the condition literally held, and a fail arrives with expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. For portable text you often want both: agent steps to reach the content, and `Verify` steps to lock down the exact strings that must never regress.

## Testing dynamic routes without hardcoding slugs

Sanity routes are content-defined, so your test strategy has to be content-aware. There are two solid patterns.

The first is to seed the data yourself and then verify it through the UI. testmd v2 makes this a first-class workflow. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session, with deterministic API steps that never touch a model. You can hit your own content API or a seeding endpoint, capture an ID or slug from the JSON response, and then drive the UI to that slug.

A v2 test file for a freshly seeded article reads roughly like this in prose: a `POST` API step creates a document through your backend, an `Expect status 200, store $.slug as 'newSlug'` line captures the slug, then a plain-English step navigates to the article using `{{newSlug}}`, and a `Verify` step confirms the published title is visible. The API step seeds, the UI step and the Verify step check it through the reader's eyes. One caveat to plan around: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly.

The second pattern is discovery-driven. Point the agent at an index page, have it pick a real article, and follow the link. This mirrors how a visitor actually browses and avoids any hardcoded slug at all. The objective reads plainly: `browserbash run "Open /blog, click the first article card, confirm the URL now contains '/blog/', and confirm the article has a visible heading and at least one paragraph of body text" --headless --agent`. Because the agent reasons about the page, it does not matter which article is first today. The test verifies the routing contract (index links resolve to article pages that render content) rather than a specific document. That is usually what you want in a smoke test: prove the `[slug]` machinery works, not that one particular post exists.

### Sharding a large content matrix

Large Sanity sites can have thousands of documents, and you may want to verify a representative sample across viewports. BrowserBash `run-all` is a memory-aware parallel orchestrator, and it supports deterministic sharding plus a viewport matrix. A run like `browserbash run-all ./tests/sanity --shard 2/4 --matrix-viewport 1280x720,390x844 --budget-usd 2.00 --junit out/junit.xml` does all of it at once. The shard slice is computed on sorted discovery order, so four parallel CI machines each run their quarter without any coordination. The viewport matrix runs every test once per viewport, labeled in events, JUnit, and results, which catches responsive rendering bugs in Sanity image blocks and layout components. The `--budget-usd` guard stops launching new tests once estimated spend crosses the limit, marks the remaining tests `skipped`, and exits `2`, so a runaway suite never surprises you on the invoice. For local models this cost is effectively zero, but the guard is cheap insurance when a suite occasionally falls back to a hosted model.

## Drafts, preview mode, and authenticated states

The scenario that keeps content teams up at night: a draft leaks to production, or preview mode silently stops showing unpublished edits. Both are testable by intent, and both benefit from saved logins.

Sanity preview usually gates on an authenticated session or a preview secret. BrowserBash saved logins let you log in once and reuse the session across runs. Run `browserbash auth save editor --url https://your-sanity-site.com/preview-login`, complete the login in the browser that opens, press Enter, and the session (a Playwright storageState) is stored. From then on, pass `--auth editor` to any run, testmd, run-all, or monitor invocation, or set `auth:` in a test file's frontmatter.

With that in place you can assert both halves of the draft contract. Anonymous, a draft-only document should return a not-found or hidden state. Authenticated in preview, the same slug should show the unpublished edits.

```bash
# Draft must stay private to logged-out visitors
browserbash run "Open https://your-sanity-site.com/blog/secret-q3-post \
  and confirm the page shows a 404 or 'not found' state, \
  not article content." --headless --agent

# Same slug in preview should reveal the unpublished draft
browserbash run "Open https://your-sanity-site.com/blog/secret-q3-post \
  and confirm the draft heading 'Q3 Roadmap (Draft)' is visible \
  and a preview banner is showing." --auth editor --headless --agent
```

If a preview secret expires or a draft-filtering GROQ query regresses, one of these two flips, and you find out before an editor does. A profile whose saved origins do not cover the target start URL prints a warning rather than silently doing nothing, so a stale auth profile fails loud instead of passing for the wrong reason. There is more on session reuse patterns in the [tutorials](https://browserbash.com/tutorials).

## Continuous monitoring of a live Sanity site

Front-end content bugs are sneaky because they are triggered by content changes, not code deploys. An editor publishes a malformed portable text block at 2 a.m. and your homepage hero breaks with no commit to blame. Scheduled monitoring catches this class of failure.

Monitor mode runs a test or objective on an interval and alerts only on state changes, in both directions, never on every green run.

```bash
browserbash monitor \
  "Open https://your-sanity-site.com and confirm the homepage hero heading is visible and the featured article card shows a title and image" \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

The first time the hero breaks, you get a Slack message. When it recovers, you get a second message. You do not get 143 identical green pings in between. Slack incoming-webhook URLs get Slack formatting automatically, and any other URL receives the raw JSON payload for your own routing. The replay cache is what makes an always-on monitor practical: a green run records its actions, the next identical run replays them with zero model calls, and the agent only steps back in when the page actually changed. For a Sanity homepage that is stable most of the day, that means a near-token-free monitor that still notices the moment content breaks.

## A realistic Sanity test suite structure

Putting it together, a maintainable suite for a Sanity front end tends to organize into a few tiers. Here is how the pieces map.

| Test tier | What it verifies | BrowserBash feature |
| --- | --- | --- |
| Smoke | Homepage and key routes render content | `browserbash run` with `--agent` |
| Portable text | Rich text blocks serialize correctly | testmd files with `Verify` steps |
| Dynamic routes | `[slug]` pages resolve from real content | discovery-driven run or testmd v2 API seeding |
| Drafts and preview | Draft privacy plus preview visibility | `--auth` saved logins |
| Cross-viewport | Responsive rendering of image and layout blocks | `run-all --matrix-viewport` |
| Live monitoring | Content-triggered breakage on production | `browserbash monitor --every` |

You do not need all six on day one. Most teams start with smoke plus two or three portable-text regression files that lock down the strings and blocks that broke before, then grow the suite as real incidents teach them what to guard.

### Migrating existing Playwright specs

If you already have a Playwright suite against your Sanity site, you do not have to rewrite it by hand. Running `browserbash import ./e2e/sanity --out ./tests/sanity` converts Playwright specs to plain-English `*_test.md` heuristically, with no model involved, so it is deterministic and reproducible. It handles goto, click, fill, press, check, selectOption, `getBy*` locators, and common expects, and it turns `process.env.X` into `{{X}}` variables. Anything it cannot translate lands in an `IMPORT-REPORT.md` file rather than being dropped or silently invented, so you get an honest inventory of what needs a human pass. This is a pragmatic on-ramp: import what you have, keep deterministic `Verify` assertions where selectors were stable, and rewrite the brittle content assertions as intent-based steps.

## Wiring it into CI and your agent workflow

Two integration paths matter for a Sanity front end.

The first is the GitHub Action. There is an `action.yml` at the repo root that installs the CLI, runs the suite, uploads JUnit, NDJSON, and results artifacts, supports a `shard:` matrix and `budget-usd:`, and posts a self-updating PR comment with the verdict table. That last part is the quality-of-life win: every pull request that touches your front end or your Sanity schema gets a comment showing which content checks passed and which regressed. The full setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

The second is the MCP server. BrowserBash ships an MCP server so any AI coding agent can use it as a validation layer. Install it into your host with one line, `claude mcp add browserbash -- browserbash mcp`, and the same pattern works for Cursor, Windsurf, Codex, and Zed. It exposes three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder run in parallel. Each returns the structured verdict JSON, so when you ask an agent to add a portable-text serializer for a new block type, it can write the component, then call `run_objective` to confirm the block renders on a real page before it tells you it is done. A failed test is a successful validation: the tool call itself succeeds and the agent reads the verdict to decide what to fix. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

## When BrowserBash is the right fit, and when it is not

Intent-based testing is not a universal replacement, and it is worth being honest about the boundaries.

BrowserBash is a strong fit when your failures live in the gap between authored content and rendered output: portable text serialization, dynamic route resolution, draft and preview correctness, and content-triggered production breakage. It is also a good fit when you want tests that survive front-end refactors, when you want an AI agent to self-validate its own front-end changes, and when you want a free, local-first tool that keeps content and credentials on your machine.

It is a weaker fit for a few things. If you need pixel-perfect visual regression down to anti-aliasing, a dedicated screenshot-diffing tool is the better call, and you can run both. If you are testing Sanity Studio itself (the authoring experience, custom input components, desk structure), that is a different surface, and a conventional Playwright suite against Studio may be more direct. And if your assertions are genuinely structural (exact DOM shape matters for a downstream integration), deterministic `Verify` steps or plain Playwright will serve you better than agent judgment. The pricing and tier details for the optional hosted features are on the [pricing page](https://browserbash.com/pricing), but everything that runs on your machine (the CLI, both engines, the local dashboard, the cache, MCP, and NDJSON output) is free forever.

The honest summary: use intent-based checks for content-driven behavior, and keep deterministic assertions for the contracts that must hold exactly.

## FAQ

### How do I test a Sanity site front end without hardcoding document slugs?

Use a discovery-driven objective or seed data first. A discovery-driven run points the agent at an index page, has it click a real article card, and verifies the resulting page renders content, so no slug is pinned in the test. Alternatively, a testmd v2 file can create a document through your API, capture the returned slug into a variable, and drive the UI to it, which keeps the test valid even as content changes.

### Can AI browser automation verify portable text rendering correctly?

Yes, because you assert on what a reader perceives rather than on the serializer's HTML output. You describe visible outcomes such as a bulleted list containing a specific item, a link with certain anchor text, or a caption below an image, and the agent checks them against a real rendered page. This survives serializer refactors and custom block changes that would break selector-based tests, since the visible content is what you are asserting on.

### How do I test Sanity draft and preview mode safely?

Save an authenticated editor session once with the auth save command, then run two checks. Anonymously, confirm a draft-only URL returns a not-found or hidden state so drafts stay private. Authenticated with the saved session passed via the auth flag, confirm the same URL reveals the unpublished draft and a preview banner, which proves preview mode is working in both directions.

### Is BrowserBash free to use for testing a headless CMS front end?

Yes. BrowserBash is free and open source under Apache-2.0, and it is Ollama-first, so it defaults to free local models with no API keys and nothing leaving your machine. Everything that runs locally (the CLI, both engines, the local dashboard, the replay cache, the MCP server, and NDJSON output) is free forever, and the only paid options are optional hosted features like cloud retention and team workspaces.

Ready to test your Sanity front end by intent instead of by selector? Install the CLI with `npm install -g browserbash-cli` and write your first plain-English content check in under a minute. An account is optional, but you can grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want the free cloud dashboard and 15-day run retention.
