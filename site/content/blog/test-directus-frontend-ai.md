---
title: Test a Directus-Backed Front End With AI
description: "Learn to test Directus frontend rendering with AI. Verify CMS content reaches your live pages using plain-English objectives, no selectors, no page objects."
date: 2026-06-12
category: guide
---

When an editor publishes an article in Directus, does it actually show up on the page the way you expect? That single question is what most teams never test properly, and it is exactly what you want to answer when you test Directus frontend rendering with AI. Directus is a headless CMS, which means the content lives in a database and reaches your site through an API. Between the collection record and the paragraph a reader sees, there is a rendering layer full of things that break quietly: a field rename, a null image, a draft that leaked to production, a slug that no longer matches the route. Traditional end-to-end tests catch some of this, but they are brittle, and they usually assert on CSS selectors that shift the moment a designer touches the layout.

This guide walks through a different approach. Instead of writing selectors, you describe the intent of a page in plain English and let an AI agent drive a real browser to confirm the content Directus manages is present, correct, and reachable. The tool is [BrowserBash](https://browserbash.com/features), a free, open-source natural-language browser automation CLI. You write an objective, an agent opens Chrome, reads the page like a person would, and hands back a deterministic verdict. No page objects, no locators to maintain, and no snapshot files to bless every sprint.

## Why testing a Directus front end is different

A headless CMS decouples content from presentation, and that decoupling is the whole point. Your editors work in the Directus admin app, your front end (Next.js, Nuxt, Astro, SvelteKit, plain HTML, whatever) fetches from the Directus REST or GraphQL API, and the two evolve on separate schedules. The upside is flexibility. The downside is that a change on either side can silently desync the other.

Here are the failures that actually happen in production Directus stacks:

- A field gets renamed in a collection (`body` to `content`), the front end still queries `body`, and every article page renders an empty div.
- An editor saves a record as a draft, but a caching layer or a missing status filter serves it publicly anyway.
- A relational field (author, category, featured image) points at a deleted record, so the template hits a null and either crashes or drops the block.
- A new required field ships in the schema, old records lack it, and half the catalog renders with a blank section.
- The API returns content correctly, but a hydration bug on the front end means the text never appears to a real browser even though it is in the HTML source.

Notice that the last one is invisible to an API test. You can hit the Directus endpoint, get a clean 200 with the right JSON, and still ship a page where the reader sees nothing. That gap between "the API is fine" and "the reader sees the content" is precisely the seam an AI browser agent is built to cover, because it evaluates the rendered page, not the payload.

### API tests do not cover the rendered page

You should absolutely test the Directus API directly. Schema validation, permission checks, and endpoint contracts belong in fast API tests. But those tests stop at the network boundary. They cannot tell you whether the `<article>` on `/blog/my-post` actually contains the heading the editor typed, whether the featured image loaded, or whether a flagged draft is genuinely hidden from an anonymous visitor. For that you need something looking at the page the way a human does.

## How BrowserBash tests intent instead of markup

BrowserBash flips the usual model. A conventional Playwright test says "find the element matching `h1.article-title` and assert its text equals X." A BrowserBash objective says "open the blog post and confirm the headline matches what the editor published." The agent figures out what the headline is on its own, using the visible page, so a class rename or a wrapper div added by a redesign does not break the test.

You install it once and run objectives from the terminal:

```bash
npm install -g browserbash-cli

browserbash run "Open https://mysite.com/blog/launch-week and confirm the article headline, author name, and a hero image are all visible" --agent --headless
```

The `--agent` flag emits NDJSON, one JSON event per line, so CI and other AI tools can read the result without parsing prose. Exit codes are frozen and predictable: 0 passed, 1 failed, 2 error, 3 timeout. That determinism matters. An AI drives the browser, but the verdict your pipeline reads is a plain boolean plus a structured summary, not a paragraph you have to interpret.

By default BrowserBash is Ollama-first. It looks for a local model before any hosted API, so nothing has to leave your machine and you do not need an API key to get started. It resolves a local Ollama model first, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat worth stating up front: very small local models (roughly 8B parameters and under) can get flaky on long multi-step objectives. For a simple "is this content visible" check they are usually fine. For a ten-step editorial flow, reach for a mid-size local model (a Qwen3 or Llama 3.3 70B-class model) or a capable hosted model. You can read more on the model story on the [features page](https://browserbash.com/features).

## Writing your first Directus content check

Let's start concrete. Say your Directus instance manages a `posts` collection and your front end renders each post at `/blog/{slug}`. You want a test that fails loudly if a published post stops rendering its body text.

```bash
browserbash run "Go to https://mysite.com/blog/how-we-scaled and verify the page shows a headline, at least three paragraphs of body text, and a published date. Fail if the main content area is empty." --agent --headless --timeout 120
```

Read that objective the way a QA engineer would read a test case. It names the URL, lists what must be present, and states the failure condition explicitly. The agent opens the page, takes a snapshot, reasons about whether the described content is there, and returns a verdict. If Directus served an empty body because someone renamed the field, the main content area is empty, the condition trips, and you get exit code 1.

This is the everyday value: you are testing the contract between the CMS and the reader, expressed in the language the editor and the product manager already use.

### Testing that drafts stay hidden

Draft leakage is one of the nastier Directus bugs because it is a permissions and status-filter problem that API tests often miss when they run as an authenticated admin. Test it as an anonymous visitor sees it:

```bash
browserbash run "Visit https://mysite.com/blog/unreleased-feature as a normal visitor. This post is a draft and should NOT be public. Confirm the page returns a not-found or shows no article content. Fail if the draft article body is visible." --agent --headless
```

The agent visits the URL with a fresh browser context, no admin session, exactly what a member of the public gets. If the draft renders, the test fails, and you have caught a content leak before an editor does. Fresh context per run is the default in BrowserBash: every run gets a clean browser, so there is no session bleed from a previous test.

## Deterministic Verify assertions for content correctness

Plain-English objectives are flexible, but sometimes you want a check that never involves model judgment at all, because the condition is exact and you want zero ambiguity in CI. BrowserBash gives you deterministic `Verify` steps inside a committable Markdown test file. These compile to real Playwright checks (URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, a stored value equals something) with no LLM in the loop. A pass means the condition held. A fail comes with expected-versus-actual evidence in the assertion table.

Here is a `posts_render_test.md` for a Directus-backed blog index and article:

```bash
browserbash testmd run ./.browserbash/tests/posts_render_test.md --agent
```

The file itself looks like this (a `*_test.md` with a title, plain steps, and Verify lines):

```
# Directus blog renders published content

- Open https://mysite.com/blog
- Verify heading "Latest Posts" is visible
- Verify at least 5 links are visible
- Click the first post card
- Verify the URL contains /blog/
- Verify text "Published" is visible
```

The plain steps let the agent navigate like a person. The `Verify` lines are the hard gates: they either hold or they do not, and a failure prints the expected condition next to what the page actually showed. Verify lines that fall outside the strict grammar still run, but they are agent-judged and flagged `judged: true` in the output, so you always know which assertions were deterministic and which leaned on the model. That transparency is deliberate. You should never have to guess how a green check was reached.

### Seeding content through Directus, then verifying it in the UI

The most powerful pattern for a headless CMS is create-then-render: push a record into Directus through its API, then confirm the front end renders it correctly. This is where testmd v2 shines. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session, with deterministic API steps for seeding and Verify steps for checking.

A `seed_and_render_test.md` might look like this:

```
---
version: 2
---

# Create a Directus post, then confirm it renders

- POST https://cms.mysite.com/items/posts with body {"title":"AI Test Post","slug":"ai-test-post","status":"published","body":"Rendered by an agent."}
- Expect status 200, store $.data.slug as 'slug'
- Open https://mysite.com/blog/{{slug}}
- Verify heading "AI Test Post" is visible
- Verify text "Rendered by an agent." is visible
```

The API step seeds a real post directly in Directus. The stored slug flows into the next step as a variable. The agent then opens the rendered page and the Verify lines confirm the content made it all the way from the database to the reader. If your front end caches aggressively or your ISR revalidation is misconfigured, this test catches it, because it exercises the real path a new post takes.

Two honest constraints to plan around. testmd v2 currently drives the builtin engine, which speaks the Anthropic API (or a compatible gateway via `ANTHROPIC_BASE_URL`), so this particular flow needs an `ANTHROPIC_API_KEY` rather than pure local Ollama. And the API step here is writing to your CMS, so point it at a staging Directus instance or a dedicated test collection, never production content your editors depend on.

## Wiring Directus content tests into CI

A test you run by hand is a demo. A test that runs on every deploy is a safety net. BrowserBash ships a GitHub Action that installs the CLI, runs your suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with the verdict table. Because your front end and your Directus schema often live in different repos, running the front-end content suite on every front-end PR (and on a schedule against the shared staging environment) catches desync from both directions.

For a folder of content tests you use `run-all`, which is a memory-aware parallel orchestrator. It derives concurrency from the real CPU and RAM available, orders previously-failed and slowest tests first, and flags flaky ones. On a large content catalog you can shard the suite across CI machines and cap spend at the same time:

```bash
browserbash run-all ./.browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel machines each take a quarter of the tests without any coordination between them. The `--budget-usd 2` cap stops launching new tests once estimated spend crosses the limit: remaining tests are reported skipped, the suite exits 2, and the spend lands in the results file and JUnit properties. That budget guard matters when you are running dozens of content checks with a hosted model. Full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

### Keeping monitors on your published content

Deploy-time tests protect against your own changes. But Directus content changes continuously as editors work, and a bad publish can break a page hours after your last deploy. Monitor mode runs a test on an interval and alerts only on a pass-to-fail or fail-to-pass state change, never on every green run:

```bash
browserbash monitor "Open https://mysite.com/blog and confirm at least 10 posts are listed with titles and dates" --every 10m --notify https://hooks.slack.com/services/XXX
```

Slack webhook URLs get Slack formatting automatically; other URLs receive the raw JSON payload. The replay cache is what makes an always-on monitor practical: a green run records its actions, and the next identical run replays them with near-zero model calls, stepping the agent back in only when the page actually changed. So a monitor watching your blog index every ten minutes stays cheap until something genuinely breaks, at which point it flips state and pings your channel. For teams running Directus as a live publishing platform, this is the difference between hearing about a broken page from your monitor and hearing about it from a reader.

## Reusing editor logins for authenticated content

Some Directus front ends gate content behind a login: member-only articles, a preview mode that renders drafts for logged-in editors, a customer portal fed by Directus collections. Logging in on every test is slow and wasteful, so BrowserBash lets you save a session once and reuse it.

```bash
browserbash auth save editor --url https://mysite.com/login
```

That opens a browser, you log in once, and pressing Enter saves the session as a Playwright storageState profile. Then any run, test, suite, or monitor reuses it with `--auth editor`:

```bash
browserbash run "Open https://mysite.com/preview/draft-post using the editor session and confirm the draft preview banner and the draft body are both visible" --auth editor --agent --headless
```

If the saved profile does not cover the target start URL, BrowserBash prints a warning instead of silently doing nothing, so a stale login surfaces as a clear message rather than a mysterious failure. This is how you test the editor-preview path that renders unpublished Directus content, which is otherwise painful to cover.

## Migrating existing Playwright tests for a Directus site

If you already have a Playwright suite pointed at your front end, you do not have to rewrite it by hand. The importer converts Playwright specs to plain-English `*_test.md` files heuristically, with no model involved, so the conversion is deterministic and reproducible:

```bash
browserbash import ./e2e/tests
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common expects. Any `process.env.X` becomes a `{{X}}` variable. Anything it cannot translate cleanly lands in an `IMPORT-REPORT.md` rather than being silently dropped or invented. Treat the output as a starting point: the imported objectives will be literal and selector-flavored, and you will want to loosen them into intent-based checks. But it saves you retyping the navigation scaffolding for a hundred content pages.

## Where an AI browser agent is the wrong tool

Credibility beats hype, so here is where you should not reach for BrowserBash on a Directus stack.

If you are testing the Directus API contract itself, permission rules, filter logic, relational integrity, field validation, use direct API tests. They are faster, cheaper, and more precise than driving a browser, and testmd v2's API steps are for seeding, not for exhaustively testing the endpoint. If you need pixel-perfect visual regression on a template, a screenshot-diffing tool is a better fit; an AI agent confirms content is present and correct, not that a button moved three pixels. And if your team is deeply invested in a mature Playwright or Cypress suite with stable selectors and no one complains about maintenance, there is no urgency to switch. The case for an AI agent is strongest exactly where selector-based tests hurt: fast-changing front ends, frequent redesigns, and content-correctness checks that map naturally to plain English.

A balanced setup usually runs all three layers. API tests guard the Directus schema and permissions. A few visual snapshots guard the critical template. And BrowserBash objectives guard the thing users actually experience: that the content an editor published in Directus reaches the page, reads correctly, and stays hidden when it should. You can see more real-world patterns in the [tutorials](https://browserbash.com/tutorials) and the [case studies](https://browserbash.com/case-study).

### A quick decision table

| Question you are answering | Best tool | Why |
| --- | --- | --- |
| Does the API return the right JSON and enforce permissions? | Direct API tests | Fast, precise, no browser needed |
| Did a button shift a few pixels after a CSS change? | Visual snapshot diffing | Pixel comparison is what it is built for |
| Does published Directus content actually render for a reader? | BrowserBash objective | Evaluates the real rendered page by intent |
| Is a draft correctly hidden from the public? | BrowserBash objective | Tests as an anonymous visitor, fresh context |
| Are your existing selector tests painful to maintain? | BrowserBash intent tests | No selectors to update on redesign |

## Putting it together for a real Directus workflow

A pragmatic content-testing workflow for a Directus site looks like this. On every front-end pull request, `run-all` executes a folder of intent-based checks against a preview deployment, sharded across CI runners with a budget cap, and the GitHub Action posts the verdict table on the PR. A small set of testmd v2 seed-and-render tests runs against staging to prove the full create-to-render path, using a dedicated test collection so nothing touches editor content. Editor-preview paths are covered with a saved `--auth` session, and a couple of monitors watch the live blog index every ten minutes, staying near-free thanks to the replay cache.

None of these tests know or care what CSS classes your template uses. They assert on what the content means to a reader, the one thing that stays stable while your front end gets redesigned around it. That is the core reason to test Directus frontend rendering with AI rather than with brittle locators: the CMS exists to let content and presentation change independently, and your tests should survive both. Browse more guides on the [BrowserBash blog](https://browserbash.com/blog) and check what is free versus hosted on the [pricing page](https://browserbash.com/pricing).

## FAQ

### Can BrowserBash test content managed in Directus without API access?

Yes. For rendering checks you only need the public (or authenticated) front end URL, because the agent evaluates the page a reader sees, not the Directus API. You only need API access if you use testmd v2 API steps to seed records before verifying them in the UI, and even then you can point those steps at a staging instance or a dedicated test collection rather than production.

### Do I need selectors or a Directus schema to write these tests?

No. You describe the intent of the page in plain English, such as confirming a headline, body text, and image are visible, and the AI agent figures out the elements on its own. That means a field rename in Directus or a CSS class change on the front end does not break the test the way a selector-based assertion would. You write about what the content should be, not where it lives in the markup.

### How do I keep AI content tests deterministic in CI?

Use the deterministic Verify assertions inside a testmd file. These compile to real Playwright checks (text visible, URL contains, element counts, and similar) with no model judgment, and a failure prints expected-versus-actual evidence. Combine that with the frozen exit codes (0 passed, 1 failed, 2 error, 3 timeout) and the NDJSON output from --agent mode, and your pipeline reads a plain boolean verdict rather than interpreting prose.

### Will testing a Directus front end with AI cost a lot in model calls?

Not necessarily. BrowserBash defaults to local Ollama models, so simple content checks can run with no API key and nothing leaving your machine. The replay cache also makes repeated runs and always-on monitors nearly token-free by replaying recorded actions until the page changes, and run-all supports a hard --budget-usd cap so a suite of hosted-model tests can never overspend.

Testing a Directus front end is really about one promise: that the content your editors publish reaches the reader intact. Intent-based checks hold that promise steady while your front end changes around it. Install the CLI with `npm install -g browserbash-cli`, point an objective at your blog, and watch an agent confirm your published content the way a person would. When you want hosted dashboards and monitors, [create a free account](https://browserbash.com/sign-up), though an account is entirely optional and the CLI is free and open source.
