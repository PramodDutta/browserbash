---
title: Test a Storyblok-Powered Site With AI Browser Automation
description: "Learn how to test a Storyblok site with AI browser automation: check visual-editor content, published blocks, and live pages by intent, not selectors."
date: 2026-06-14
category: guide
---

If you run a Storyblok-powered site, most of your bugs do not live in your code. They live in content. An editor drags a hero block into the wrong slot, a rich-text field ships with a broken image, a nested component publishes with an empty CTA, and your React or Next.js layer renders all of it faithfully. To test a Storyblok site properly you have to check the thing a visitor actually sees, and that is exactly where plain-English AI browser automation earns its place. Instead of writing brittle CSS selectors against DOM output that your marketing team reshapes weekly, you describe the intent ("the pricing hero shows three plan cards") and let an AI agent drive a real browser and return a verdict.

This guide covers how to test a Storyblok site with an AI agent, why the visual editor changes your strategy, and how to wire deterministic checks around content that keeps moving. The examples use [BrowserBash](https://browserbash.com/features), a free, open-source natural-language browser automation CLI, but the ideas apply whether you use Cypress or Playwright. The point is to test content as content, not as a frozen HTML snapshot.

## Why Storyblok Sites Break the Usual Test Playbook

Storyblok is a headless CMS built around a visual editor and a component-based content model. Editors assemble pages out of Bloks (Storyblok's word for reusable content components): a hero, a feature grid, a testimonial slider, a rich-text section. Each Blok maps to a front-end component you render. That architecture is great for content velocity and terrible for the classic end-to-end test suite.

Here is the friction. Traditional UI tests bind to structure. You write `cy.get('[data-testid="hero-title"]')` or a Playwright locator like `page.getByRole('heading', { level: 1 })`, and the test passes until an editor swaps the hero for a different Blok, renames a field, or reorders the stack. The content changed, not the code, but your test still goes red. Multiply that across hundreds of editor-managed pages and your suite becomes a maintenance tax nobody wants to pay.

The second problem is preview versus published. Storyblok's visual editor renders a draft through the Preview API, while your live site serves the Published version through the CDN. A block can look perfect in the editor and be missing in production because someone forgot to hit publish, or a cache did not purge. A test that only checks the preview iframe will happily pass while real visitors see stale or empty content.

AI-driven, intent-based testing sidesteps both problems. When you tell an agent to "open the pricing page and confirm three plan cards are visible with a price on each," it does not care which Blok produced those cards or what the class names are. It reads the rendered page the way a person would and reports whether the intent held. That resilience to structural churn is the core reason to test a Storyblok site this way.

## How AI Browser Automation Reads Content by Intent

BrowserBash takes a plain-English objective, hands it to an AI agent, and the agent drives a genuine Chrome or Chromium browser step by step: no selectors, no page objects. It returns a deterministic verdict (passed, failed, error, or timeout) plus a structured result you can act on in CI. By default it is Ollama-first, so it runs against free local models with no API keys and nothing leaving your machine, and it can auto-resolve to a hosted model if you have one configured.

The simplest possible Storyblok check is a single objective:

```bash
browserbash run "Open https://yoursite.com/pricing and confirm there are three plan cards, each showing a plan name and a monthly price" --agent --headless --timeout 120
```

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or another AI coding agent can parse the outcome without scraping prose. Exit codes are frozen and boring by design: 0 passed, 1 failed, 2 error or infra problem, 3 timeout. That means a Storyblok content regression fails your pipeline the same clean way a unit test would.

Because the agent reads intent, the same objective survives an editor reshaping the pricing page. If marketing renames "Starter" to "Free" or reorders the cards, "three plan cards, each with a name and a monthly price" is still true, and the test passes. It only fails when a human would also say something is wrong: two cards instead of three, or a blank card from an unpublished Blok.

### Local models keep content tests cheap

Content tests tend to run often, on every publish or every deploy, so cost matters. Running against a local model through Ollama keeps those runs free and private. One honest caveat: very small local models (roughly 8B parameters and under) can get flaky on long multi-step objectives. The sweet spot for reliable Storyblok flows is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard pages. Keep single-intent checks short and the small models do fine.

## Writing Repeatable Storyblok Tests as Markdown

One-off `run` commands are great for exploration, but a real Storyblok site deserves committable tests. BrowserBash uses `*_test.md` files: a title, plain-English steps, optional `@import` composition, and `{{variables}}` templating. These live in your repo next to the code, get reviewed in pull requests, and produce a human-readable `Result.md` after each run.

A basic content test for a Storyblok landing page looks like this:

```markdown
# Homepage hero renders published content

- Open https://yoursite.com
- Confirm the hero headline is visible and not empty
- Verify the primary call-to-action button is present
- Confirm at least one feature section with an image below the hero
```

Save that as `homepage_test.md` and run it with `browserbash testmd run ./.browserbash/tests/homepage_test.md`. The value of markdown tests on a Storyblok site is that they read like acceptance criteria. A content editor or a product manager can review the test file and understand exactly what is being guaranteed, which is rarely true of a Playwright spec full of locators. When the marketing team asks "will this break my page?" you can point at a short, readable file.

You can compose these too. If every page on your site shares a header and footer rendered from a global Storyblok Blok, put those checks in one file and `@import` it into your per-page tests so you are not repeating the same navigation-bar assertion in fifty places. That mirrors how Storyblok itself reuses components, and it keeps your suite as DRY as your content model.

## Deterministic Verify Steps for the Parts That Must Not Move

Intent-based checks are resilient, but some things on a Storyblok site are contractual and should be checked with zero ambiguity: the page title, a canonical URL, a specific legal link, an exact price during a promotion. For those, BrowserBash offers `Verify` steps that compile to real Playwright checks with no LLM judgment involved. A `Verify` line can assert URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, or a stored value equals a target. A pass means the condition literally held. A fail comes with expected-versus-actual evidence in the run's assertion table.

That gives you a clean split. Use agent-judged intent for the fuzzy, editor-managed content ("the testimonial section feels complete"), and use `Verify` for the hard contracts that a Storyblok publish should never violate:

```markdown
# Pricing page contracts

- Open https://yoursite.com/pricing
- Verify title contains "Pricing"
- Verify "Start free trial" button visible
- Verify text "Cancel anytime" visible
- Confirm three plan cards are visible with a price on each
```

The first three checks are deterministic. If Storyblok publishes a page where someone deleted the "Start free trial" Blok, the `Verify` step fails with concrete evidence rather than a vague model opinion. The last line stays agent-judged because "three plan cards with a price" is the kind of holistic read where an LLM beats a selector. Verify lines outside the strict grammar still run, agent-judged and flagged, so you always know which checks were deterministic. There are more patterns like this in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Seeding and Verifying Storyblok Content With testmd v2

Here is where testing a Storyblok site gets genuinely interesting. Storyblok exposes a Content Delivery API and a Management API. That means you can seed or read content through the API and then verify it renders correctly through the UI, all in one test. BrowserBash's testmd v2 format is built for exactly this hybrid API-plus-UI flow.

Add `version: 2` to a test file's frontmatter and steps execute one at a time against a single browser session. Two step types never touch a model: API steps (`GET/POST/PUT/DELETE/PATCH` a URL, optionally with a body, then `Expect status N` and store a value from the JSON response) and `Verify` steps. Consecutive plain-English steps run as grouped agent blocks on the same page. So you can pull a story straight from the Storyblok Content Delivery API, capture the headline it should render, and then assert the live page actually shows that headline:

```markdown
---
version: 2
---
# Storyblok home story renders its published headline

- GET https://api.storyblok.com/v2/cdn/stories/home?token={{STORYBLOK_TOKEN}}
- Expect status 200, store $.story.content.hero_title as 'headline'
- Open https://yoursite.com
- Confirm the main hero headline matches the value stored as headline
- Verify "Get started" button visible
```

That test closes the preview-versus-published gap directly. It reads what Storyblok says the home story's hero title should be, then checks that a real browser hitting your production CDN renders that same title. If content is published in Storyblok but stale on the live site because a cache did not purge, this test catches it. If the front-end silently drops the field, this test catches that too. One honest limitation to note: testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway rather than running on Ollama or OpenRouter directly.

### Why the API-plus-UI split matters for headless CMS testing

The seed-then-verify pattern is the whole point of testing a headless CMS well. Your content lives in one system (Storyblok) and renders in another (your front end), and bugs hide in the seam. By reading the source of truth over the API and asserting the rendered output through a browser, you test the seam itself, the thing a pure front-end test and a pure API test both miss. Secret-marked variables like `{{STORYBLOK_TOKEN}}` are masked as `*****` in every log line, so your delivery token never leaks into CI output.

## Handling Preview, Auth, and the Storyblok Visual Editor

Some Storyblok content lives behind authentication: a preview environment, a members-only page, a gated resource assembled from Bloks. Logging in on every test run is slow and wasteful. BrowserBash lets you save a login once with `browserbash auth save storyblok-preview --url https://yoursite.com/preview-login` and reuse it everywhere. That opens a browser, you log in once, press Enter, and it saves the session as a Playwright storageState profile. Then any run, testmd, run-all, or monitor invocation can reuse it with `--auth storyblok-preview`, or you can declare `auth:` in a test file's frontmatter. If a saved profile's origins do not cover your target start URL, you get a warning instead of a silent no-op, which saves you from the classic "why is it not logged in" head-scratch.

A note on the Storyblok visual editor itself: it renders your site inside an iframe with a draft state, so it is a great authoring tool but a poor test target. Test the published, live URL your visitors actually hit, not the editor iframe. The editor can show content that has not been published, and a passing test against draft state gives false confidence. To validate a preview environment before a publish, save an auth profile and test the preview URL directly rather than the embedded editor.

## Running Storyblok Suites in CI Without Blowing the Budget

Once you have a folder of content tests, you run them together. The `run-all` orchestrator discovers every test in a directory and runs them with memory-aware parallelism: concurrency derived from real CPU and RAM, previously-failed and slowest-first ordering, and flaky detection built in. For a Storyblok site with dozens of pages, that ordering surfaces a page that broke yesterday first.

Two flags matter for a big Storyblok suite. Sharding splits the work across CI machines deterministically, and a budget cap stops runaway spend if you are testing against a hosted model:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel CI machines agree on who runs what without any coordination service. The `--budget-usd 2.00` cap stops launching new tests once estimated spend crosses the budget: remaining tests report `skipped`, the suite exits 2, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. If you want to check every page across two viewports (say desktop and mobile, since Storyblok Bloks often render responsively), add `--matrix-viewport 1280x720,390x844` and each test runs once per viewport, labeled in the events, JUnit, and results.

There is an official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) that installs the CLI, runs your suite, uploads the JUnit, NDJSON, and result artifacts, supports shard matrix jobs and the budget flag, and posts a self-updating PR comment with a verdict table. For a Storyblok site that ships content changes through pull requests, that PR comment turns "did my content edit break anything" into a glance.

### The replay cache makes content tests fast on repeat

Content tests run constantly, so repeat speed matters. A green BrowserBash run records the actions it took, and the next identical run replays them with zero model calls. The agent only steps back in when the page actually changed. For a Storyblok site where most pages are stable between edits, only the pages that genuinely changed pay the full agent cost. It is the difference between a suite you run nightly and one you run on every publish.

## Monitoring Published Storyblok Content in Production

Testing in CI catches regressions before they ship. Monitoring catches the ones that slip through: a scheduled publish that fired at 3am, a CDN purge that half-failed, a third-party embed inside a Blok that went down. BrowserBash monitor mode runs a test or objective on an interval and alerts only when the state flips between pass and fail, in either direction, never on every green run:

```bash
browserbash monitor ./.browserbash/tests/homepage_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Point it at a Slack incoming-webhook URL and it formats the alert for Slack automatically; any other URL gets the raw JSON payload. Because the replay cache makes an always-on monitor nearly token-free, you can watch your most important Storyblok pages every ten minutes without a meaningful bill. When an editor publishes a broken hero, you find out from Slack in minutes, not from a customer.

This pairs naturally with Storyblok's own publish workflow. Storyblok can fire a webhook on publish; use that to trigger a targeted BrowserBash run against the changed page, and keep a broader monitor watching the homepage funnel as a safety net. Together they cover both the "something just published" moment and the "something quietly broke" drift.

## Comparing Approaches to Testing a Storyblok Site

There is no single right tool, so here is an honest comparison of the common ways teams test Storyblok content. Each has a real place.

| Approach | Resilient to content changes | Preview vs published coverage | Setup effort | Best for |
| --- | --- | --- | --- | --- |
| Selector-based E2E (Playwright/Cypress) | Low: breaks on Blok reshuffles | Front end only | High: locators + page objects | Stable app flows, checkout, forms |
| Storyblok API assertions only | High for data, none for render | Reads published data, ignores UI | Medium | Content-model validation, migrations |
| AI browser automation by intent | High: reads rendered intent | UI, and API-plus-UI in one test | Low: plain English | Editor-managed marketing pages |
| Manual QA before publish | High, but slow | Whatever the human checks | None, but does not scale | One-off launches, final sign-off |

Selector-based frameworks like Playwright and Cypress remain the better fit for stable, high-value transactional flows: a checkout, a signup form, a multi-step wizard where the DOM is developer-owned and rarely reshaped by editors. There, precise locators are an asset, not a liability. AI browser automation shines on the editor-managed surface area, the marketing and content pages where Storyblok's flexibility is the whole point and where selectors go stale weekly. Many teams run both: Playwright for the app, intent-based tests for the content. BrowserBash even offers `browserbash import` to convert existing Playwright specs into plain-English `*_test.md` files heuristically, with no model and everything untranslatable logged rather than guessed, so migrating a slice of your suite is low risk. You can weigh the tradeoffs further in the [BrowserBash learn hub](https://browserbash.com/learn).

## When to Choose Intent-Based Testing for Storyblok

Reach for AI, intent-based browser testing when your Storyblok pages are edited more often than your code, when marketing reshuffles Bloks without engineering, and when your E2E suite spends more time being repaired than catching bugs. If your failures are mostly "the selector changed, not the behavior," that is the signal.

Stick with, or add, deterministic tooling when the flow is developer-owned and structurally stable, when you need exact assertions on contractual elements, or when you are validating the content model itself through the Storyblok API rather than the rendered page. The good news is these are not mutually exclusive. Use `Verify` steps for the contracts, agent intent for the fuzzy content, API steps to seed and read the source of truth, and one readable markdown file per page that a content editor can actually review. That combination tests a Storyblok site the way it is actually built and edited, and it is free to run locally. See the current options on the [pricing page](https://browserbash.com/pricing), where anything that runs on your own machine stays free.

## FAQ

### How do I test Storyblok content without brittle CSS selectors?

Use intent-based AI browser automation instead of binding tests to selectors or data-testids. You write a plain-English objective like "confirm three plan cards each show a price," and an AI agent drives a real browser to check whether that intent holds. When an editor reshuffles Bloks or renames fields, the test still passes because it reads the rendered page the way a visitor would, and it only fails when a human would also say something is wrong.

### Can I check that content published in Storyblok actually shows on the live site?

Yes, and this is the highest-value test for a headless CMS. Using testmd v2, you read the story from the Storyblok Content Delivery API, store the field value it should render, then assert the live production page displays that same value through a real browser. This closes the gap where content is published in Storyblok but stale on the CDN, or silently dropped by the front end, which pure front-end tests and pure API tests both miss.

### Should I test the Storyblok visual editor or the published site?

Test the published, live URL your visitors actually hit, not the visual editor iframe. The editor renders a draft state and can show content that has not been published, so a passing test against the editor gives false confidence. If you specifically need to validate a preview environment before publishing, save an auth profile and test the preview URL directly rather than the embedded editor.

### Is intent-based testing a replacement for Playwright on a Storyblok project?

Not entirely, and it is not meant to be. Playwright and Cypress remain the better fit for stable, developer-owned flows like checkout and forms where precise selectors are an asset. Intent-based AI testing is stronger on the editor-managed marketing pages where Blok layouts change constantly, so most teams run both and use each where it fits best.

Ready to test your Storyblok site by intent instead of by selector? Install the CLI with `npm install -g browserbash-cli`, point a plain-English objective at your live pages, and let an AI agent return the verdict. Create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want the optional cloud dashboard, though everything that runs on your own machine works without one.
