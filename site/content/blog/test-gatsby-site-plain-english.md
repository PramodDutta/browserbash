---
title: Test a Gatsby Static Site in Plain English
description: "Learn to test a Gatsby site in plain English: verify pre-rendered pages, client hydration, and dynamic routes with a plain-English browser agent."
date: 2026-05-10
category: guide
---

If you want to test a Gatsby site the way a real visitor experiences it, you have to check two very different things: the static HTML that Gatsby pre-renders at build time, and the React app that hydrates on top of it in the browser. Most teams test only one half. This guide shows how to cover both in plain English, using a browser agent that reads your objective, drives a real Chrome window, and returns a pass or fail verdict with evidence. No selectors, no page objects.

Gatsby's architecture is a gift for testers and a trap at the same time. The pre-rendered output makes some checks trivial: a page either shipped in the build or it did not. But hydration, client-only routes, and data that arrives after the first paint are where static-site testing quietly falls apart, and this guide is honest about which is which.

## Why Gatsby sites need a two-layer testing strategy

Gatsby builds your site into static HTML, CSS, and JavaScript at build time. When a request comes in, the server (or CDN) hands back a fully-formed HTML document that already contains your headings, copy, meta tags, and structured data. Then Gatsby's runtime "hydrates" it: React attaches event listeners, client-side routing takes over, and dynamic data (a cart count, a logged-in state, a live search) gets wired up. This split creates two distinct failure modes that need different tests.

The first layer is the pre-rendered shell. If your build succeeded, the HTML for `/`, `/about`, `/blog/some-post`, and every statically generated route already exists on disk. Testing it is mostly about confirming the right content made it into the build and routing works. Static output is deterministic: the same build produces the same bytes every time.

The second layer is hydration and client behavior, where a Gatsby site stops being a document and becomes an app. A button that does nothing until React attaches its handler looks fine in a raw HTML check and is broken for a real user. Client-only routes rendered with `@reach/router` do not exist as static files at all, so a naive "does this HTML file exist" test misses them. Data fetched from an API after mount, form submissions, authenticated views: all of it lives here.

If you only test the static layer, you ship interactivity bugs. If you only test with a JavaScript-heavy end-to-end tool but never assert on the raw pre-rendered output, you miss SEO and content regressions that ship silently. You need both, and plain-English testing lets you write both without two separate toolchains.

## What makes testing a Gatsby site easy (the honest wins)

Let me start with the good news, because Gatsby genuinely makes several kinds of tests easier than a client-rendered SPA would.

Because pages are pre-rendered, content assertions are reliable. When you check that your homepage heading reads "Ship faster with confidence," you are checking a value baked in at build time. No loading spinner, no race condition, no "wait for the API." The text is in the initial HTML, so the same input produces the same output, run after run.

Meta tags and structured data are also easy wins. Gatsby sites usually manage their `<head>` through `gatsby-plugin-react-helmet` or the newer Head API, and that output is static. You can verify a page title, an Open Graph image, or a canonical URL with confidence because it will not change based on client state. Routing between statically generated pages is equally predictable: navigating from `/` to `/pricing` either loads the pre-built page or it does not, so broken internal links show up immediately.

Here is the simplest possible check. Point the agent at your built site (served locally on port 9000 with `gatsby serve`, or at your deployed URL) and describe what you expect.

```bash
npm install -g browserbash-cli

browserbash run "Open http://localhost:9000 and confirm the main heading contains 'Ship faster', then store the page title as 'homeTitle'" --agent
```

The agent opens a real browser, reads the page, checks the heading, captures the title, and returns a structured verdict. Because the content is pre-rendered, this is about as deterministic as browser testing gets. BrowserBash defaults to free local Ollama models with nothing leaving your machine, so you can keep the whole flow offline. For hard multi-step flows, a mid-size local model or a hosted model does better, which I will come back to.

## What makes testing a Gatsby site hard (the parts static output does not solve)

Now the parts static rendering does not save you from, where most Gatsby test suites have gaps. Hydration timing is the big one. There is a window between "the HTML is on screen" and "React has hydrated and the page is interactive," and during it the page looks done but is not. If your test clicks a button the instant the DOM appears, it may click before the handler is attached and see nothing happen. A good plain-English test describes the expected outcome ("after clicking Subscribe, a confirmation appears") and lets the agent wait for it rather than racing the framework.

Client-only routes are the second trap. Gatsby lets you carve out paths (say, everything under `/app/*`) rendered entirely on the client, often behind authentication. These routes have no pre-built HTML file. If you request `/app/dashboard` directly and your hosting is not configured to fall back to the client app shell, you get a 404. Testing them requires driving the actual client-side navigation, not requesting a static file. A browser agent handles this naturally because it navigates the way a user does, by loading the app and clicking through.

Deferred and client-fetched data is the third. Gatsby's Deferred Static Generation (DSG) and any runtime API call mean some content is not present at first paint. A price from a live pricing service, a personalized recommendation block, a comment count: none of it is in the pre-rendered HTML. Asserting on it means waiting for the network and the render, which plain-English objectives handle well because you describe the end state, not the mechanics.

Then there are subtle framework-specific gotchas. Gatsby's `Link` component prefetches linked pages, which makes network assertions noisy. Image components (`gatsby-plugin-image`) lazy-load and swap in higher-resolution sources, so an image assertion right after load may see a placeholder. Service workers from `gatsby-plugin-offline` can serve stale content on a second visit, a nasty source of "works on my machine" flake. None of these are reasons to avoid testing; they are reasons to test in a real browser and assert on outcomes, not internals.

## Setting up your first plain-English Gatsby test

The goal is a committable test file that lives next to your code and reads like documentation. BrowserBash uses Markdown test files (`*_test.md`) with a title, plain-English steps, and optional `{{variables}}`. A single objective can cover content presence, an interaction, and a routing outcome, for example: open the pricing page, confirm the "Start free trial" button is visible, click it, and verify the URL contains `/sign-up`.

For anything you want to keep, save that to a `*_test.md` file (version-controllable, reviewable in a pull request, readable by a non-engineer) and run it with `browserbash testmd run ./homepage_test.md`; the next section shows a full file. You get a human-readable `Result.md` and a deterministic exit code for CI: 0 passed, 1 failed, 2 error, 3 timeout. Those exit codes are a frozen contract, so you can wire them into any pipeline. For background on how the engine interprets English and drives the browser, the [BrowserBash learn hub](https://browserbash.com/learn) walks through the model and the step lifecycle, and the [tutorials](https://browserbash.com/tutorials) start from a fresh install.

## Making static-content checks deterministic with Verify

Plain-English steps are interpreted by an AI agent, which is what you want for fuzzy, human-described behavior. But for the static layer of a Gatsby site, you often want zero ambiguity: a heading either says the right thing or it does not. For those checks, BrowserBash gives you `Verify` steps that compile to real Playwright assertions with no model judgment involved.

A `Verify` line that matches the built-in grammar (URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, a stored value equals something) runs as a hard, deterministic check. Pass means the condition held. Fail comes with expected-versus-actual evidence in the run output and the `Result.md` assertion table. Your pre-rendered content is deterministic, so your assertions should be too.

Here is a stronger homepage test that mixes agent-driven navigation with deterministic verification:

```
# Gatsby homepage verified

- Open http://localhost:9000
- Verify title contains "BrowserBash"
- Verify text "Ship faster" is visible
- Verify "Read the docs" link is visible
- Click "Read the docs"
- Verify URL contains /docs
```

Every `Verify` line here is checked by Playwright, not judged by a model, so it will not drift with model updates or temperature. When you do need judgment (say, "the page looks broken"), a plain step still works and gets flagged as agent-judged so you can tell the two apart. Mixing hard assertions and judged ones in one file is what makes this practical for a real Gatsby suite, where some things are crisp (a title) and some are fuzzy (does the hero image actually render).

Gatsby sites also live and die by their SEO, and the pre-rendered `<head>` is a prime candidate for deterministic checks. A title regression or a missing canonical tag ships silently and costs traffic, so add title and content verifications to a dedicated SEO smoke test.

## Testing hydration and client-side behavior

Now the harder half. The trick with hydration is to never assert on timing directly. Describe the outcome that can only be true after hydration completes, and let the agent wait.

Say your Gatsby site has a newsletter form that only works once React attaches its submit handler. A brittle test clicks and immediately checks for success. A robust plain-English test describes the interaction as one outcome, for example: open the page, scroll to the newsletter form, type an email, click Subscribe, and confirm a "Thanks for subscribing" message appears. The agent waits for that confirmation to appear, which means it implicitly waits for hydration to finish, because the handler that produces the message only exists after hydration. No arbitrary sleep, no hydration flag, just the outcome a user would see.

For client-only routes, drive the navigation the way a user does. Do not request `/app/dashboard` as a URL and expect a static file. Instead, log in through the UI (or reuse a saved session, covered below) and click into the app, so the agent lets Gatsby's router take over and navigates client-side, the real code path your users hit.

### Handling authenticated Gatsby app routes

Many Gatsby sites put client-only routes behind a login: a member dashboard, a course area, an admin panel. Logging in on every test is slow and noisy. BrowserBash lets you save a login once and reuse it: run `browserbash auth save`, log in by hand in the browser that opens, press Enter, and the session (Playwright storageState) is saved. Then reuse it:

```bash
browserbash auth save member --url http://localhost:9000/login

browserbash run "Open http://localhost:9000/app/dashboard and confirm the welcome banner shows the member's name" --auth member --agent
```

The `--auth member` flag loads the saved session so the client-only route renders in its authenticated state without a fresh login. If the saved profile does not cover the target origin, you get a warning instead of a silent no-op. You can also set `auth:` in a test file's frontmatter so a suite runs authenticated.

## Seeding data and verifying it in the UI with testmd v2

Some Gatsby pages render content from an API at runtime, or from data you seed before the UI can show it. testmd v2 lets you combine deterministic API calls and UI verification in one test file, executed one step at a time against one browser session.

Add `version: 2` to the frontmatter and you unlock two deterministic step types that never touch a model: API steps for seeding or reading data, and `Verify` steps for checking the result through the UI. Consecutive plain-English steps still run as grouped agent blocks on the same page. This test seeds a record over the API, then confirms the Gatsby front end renders it:

```
---
version: 2
---

# Seed a post and verify it renders

- POST http://localhost:8000/api/posts with body {"title": "Hydration test", "slug": "hydration-test"}
- Expect status 201, store $.id as "postId"
- Open http://localhost:9000/blog/hydration-test
- Verify text "Hydration test" is visible
- Verify title contains "Hydration test"
```

The API step seeds the data with a real HTTP call and captures the returned id. The `Verify` steps confirm the UI reflects it. This is the hybrid pattern a Gatsby site with DSG or client-fetched content needs: you control the data deterministically and check the result through a real browser. One honest caveat: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible gateway, and does not yet run directly on Ollama or OpenRouter. If your workflow is local-model-only, keep the plain-English v1 flow and reach for v2 where you have an Anthropic-compatible key.

## Running Gatsby tests in CI and on a schedule

A test you do not run on every deploy is a test that rots. Gatsby sites deploy often, and each deploy can silently break hydration or drop a page from the build, so wire your suite into CI to run on every pull request.

BrowserBash emits NDJSON in `--agent` mode (one JSON event per line), so your pipeline reads structured events instead of scraping prose. For a folder of tests, `run-all` is a memory-aware parallel orchestrator that derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones. You can shard across machines and cap spend at once:

```bash
browserbash run-all ./tests --shard 2/4 --budget-usd 2 --junit out/junit.xml --agent
```

The `--shard 2/4` runs a deterministic slice computed on sorted discovery order, so parallel CI machines agree on the split without coordinating. The `--budget-usd 2` stops launching new tests once the suite crosses the budget, marking the rest skipped and exiting with an error code. There is an official GitHub Action that installs the CLI, runs the suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with a verdict table; the full setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

For a deployed Gatsby site, you also want to know when production breaks between deploys. Monitor mode runs a test on an interval and alerts only when the pass/fail state changes, in either direction, so you are not spammed on green runs:

```bash
browserbash monitor ./homepage_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Because a green run records its actions into the replay cache and the next identical run replays them with zero model calls, an always-on monitor is nearly token-free until something changes. That is a real fit for a static Gatsby site, where most runs are green so replay kicks in constantly. See the broader feature set on the [features page](https://browserbash.com/features).

## Comparing plain-English testing to traditional Gatsby test tools

Gatsby's own docs point at Jest for unit tests, React Testing Library for components, and Cypress or Playwright for end-to-end. Those are excellent tools, and this is not a case for throwing them out. Here is where each fits.

| Approach | Best for | Gatsby-specific strength | Cost of maintenance |
| --- | --- | --- | --- |
| Jest + React Testing Library | Component logic, utils, GraphQL data transforms | Fast unit feedback, no browser needed | Low, but tests implementation not the real render |
| Cypress / Playwright (scripted) | Precise, repeatable E2E flows | Full control over waits and selectors | High: selectors and page objects break on refactors |
| Plain-English browser agent | Smoke tests, hydration outcomes, content checks | Describes user intent, survives markup churn | Low: steps read like documentation |
| Static HTML crawl (grep the build) | Confirming a page shipped in the build | Trivially cheap for pre-rendered content | Low, but blind to anything client-side |

The honest read: if you have a large, mature Gatsby app with complex flows and a team fluent in Playwright, scripted Playwright gives you the tightest control, and you should keep it. Plain-English testing shines for smoke tests, content and SEO regressions, hydration-outcome checks, and the long tail of "did this obvious thing break" tests nobody wants to maintain as brittle selector scripts. The two coexist well: keep critical-path flows in scripted Playwright and cover breadth in plain English.

A note on models. Very small local models (around 8B and under) can be flaky on long multi-step objectives. For a simple content check they are fine and free, but for a five-step authenticated flow with hydration waits, use a mid-size local model (a Qwen3 or Llama 3.3 70B-class model) or a capable hosted model. Matching the model to the difficulty of the flow is the single biggest lever on reliability.

## Who this approach is for

Reach for plain-English Gatsby testing if you want broad coverage without a maintenance tax, if your team includes people who should be able to read and write tests without learning a selector API, or if you are validating a Gatsby site that an AI agent generated or edited and need a fast, honest verdict on whether it works in a browser. It is a strong fit for content-heavy Gatsby sites (blogs, docs, marketing) where the static layer is large and the interactive surface is focused. Look elsewhere, or supplement, if your Gatsby app is a complex SPA-like experience with intricate client state that demands frame-by-frame control, or if you need pixel-level visual regression, a job for a dedicated visual tool. You can browse usage patterns on the [case study page](https://browserbash.com/case-study) and read more walkthroughs on the [blog](https://browserbash.com/blog).

The workflow that tends to win: static-layer content and SEO checks as deterministic `Verify` assertions, hydration and interaction checks as plain-English outcomes, authenticated routes with a saved session, and the suite running on every deploy through CI plus a production monitor. That covers both layers without two separate testing philosophies.

## FAQ

### How do I test if my Gatsby page hydrated correctly?

Do not assert on hydration timing directly. Instead, describe an outcome that can only be true after React has hydrated, such as a button click producing a confirmation message. A plain-English browser agent waits for that outcome to appear, which implicitly waits for hydration to complete, so you get a reliable check without arbitrary sleeps or hydration flags in your test.

### Can I test Gatsby client-only routes that have no static HTML?

Yes. Client-only routes (often paths like /app/*) have no pre-built HTML file, so requesting the URL directly can 404. The fix is to navigate the way a real user does: load the site, let Gatsby's client router take over, and click through, or reuse a saved authenticated session so the route renders logged in. A real browser agent follows that exact code path, so it reaches routes a static-file check never could.

### Is plain-English testing reliable enough for a production Gatsby site?

For the static layer it is highly reliable because pre-rendered content is deterministic, and you can lock those checks down with Verify steps that compile to real Playwright assertions with no model judgment. For interactive flows, reliability depends on matching the model to the task: small local models are fine for simple checks, while multi-step authenticated flows do better on a mid-size or hosted model. Running the suite in CI on every deploy catches regressions early either way.

### Do I need an API key to test a Gatsby site with BrowserBash?

No, not to start. BrowserBash defaults to free local Ollama models, so simple plain-English and Verify-based tests run entirely on your machine with nothing leaving it. You only need an Anthropic-compatible key for testmd v2's step-by-step API-plus-UI flows, or if you prefer a hosted model for harder multi-step objectives.

Ready to test both layers of your Gatsby site in plain English? Install the CLI with `npm install -g browserbash-cli` and write your first test in a minute. An account is optional and everything runs locally by default, but for the free cloud dashboard and monitoring you can [sign up here](https://browserbash.com/sign-up).
