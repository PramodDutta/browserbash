---
title: Test a RedwoodJS App With Plain-English Tests
description: "Learn to test a RedwoodJS app with plain-English tests: cells, forms, and GraphQL pages validated by intent using an AI agent that drives a real browser."
date: 2026-05-11
category: guide
---

To test a RedwoodJS app well, you have to accept a small truth about the framework: the interesting behavior lives at the seams. Cells fetch data through GraphQL and swap between Loading, Empty, Failure, and Success states. Forms wire up to services that hit Prisma. A page looks static until the query resolves and the DOM rearranges itself. Classic end-to-end tests spend most of their code chasing those seams with selectors and waits, and every schema change or component refactor snaps a locator somewhere. Plain-English testing flips the model. You describe the outcome you care about ("the dashboard shows my three most recent orders"), an AI agent drives a real Chrome browser to get there, and you get a deterministic verdict back. This guide walks through testing Redwood cells, forms, and GraphQL-backed pages by intent, using [BrowserBash](https://browserbash.com/features), a free open-source CLI built exactly for this.

## Why RedwoodJS is awkward for selector-based tests

Redwood is opinionated in ways that help you build fast and hurt you at test time if you cling to traditional tooling. The router generates routes from a `Routes.js` file. Cells are a convention, not a component you hand-wrote, so their markup often comes from a generator and changes shape when you re-run it. GraphQL sits between the browser and the database, which means the same page can render four completely different DOM trees depending on the query lifecycle.

A Playwright or Cypress spec has to encode all of that. You wait for a network idle, you assert a spinner disappears, you target a `data-testid` that a teammate forgot to add to the new component, and you re-derive the selector every time the Redwood generator reshapes the output. None of that is about your product. It is bookkeeping the framework forces on you.

The plain-English approach removes the bookkeeping. You still test the same behaviors, but you stop hard-coding the path the framework takes to render them. When you want to test a RedwoodJS app this way, you write the intent and let the agent handle the mechanics of finding the right element and waiting for the right state.

### The four cell states are the whole game

Every Redwood cell exports up to four render functions. A serious test suite for a Redwood app is mostly about proving those four states behave:

- **Loading**: does the user see a sensible placeholder while GraphQL resolves?
- **Empty**: when the query returns nothing, does the empty view render instead of a broken table?
- **Failure**: when the resolver throws, does the failure UI appear rather than a white screen?
- **Success**: does the real data render correctly and in the right place?

Selector tests can check these, but they are brittle because each state has different markup. An intent-based check like "the page shows an empty-state message, not an error" survives a component rewrite because the agent reads the rendered page the way a person would.

## What plain-English testing actually looks like

BrowserBash is a natural-language browser automation CLI. You install it once, write an objective in English, and an AI agent drives a real Chromium browser step by step, no selectors and no page objects. It returns a deterministic verdict (passed, failed, error, timeout) plus a structured result you can read in CI.

Here is the smallest possible test against a locally running Redwood dev server:

```bash
npm install -g browserbash-cli

browserbash run "Open http://localhost:8910, wait for the posts list to load, and confirm at least one post title is visible" --agent --headless
```

The `--agent` flag emits NDJSON, one JSON event per line on stdout, so a CI job or another AI agent can read the verdict without parsing prose. Exit codes are frozen and simple: `0` passed, `1` failed, `2` error or infra problem, `3` timeout. That contract is what makes this usable in a pipeline rather than a toy.

By default BrowserBash is Ollama-first. It looks for a local Ollama model before anything else, so you can run the whole thing with no API keys and nothing leaving your machine. If you do not have Ollama, it falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, and if none of those exist it prints setup guidance instead of failing silently. One honest caveat up front: very small local models (roughly 8B and under) get flaky on long multi-step flows. For a gnarly Redwood checkout with five screens, reach for a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model.

## Testing a Redwood cell by intent

Take a `PostsCell` that lists blog posts. The Success render loops over posts; the Empty render shows "No posts yet." You want a test that proves both without knowing a single class name.

Start with the Success path against seeded data:

```bash
browserbash run "Go to http://localhost:8910/posts. Wait for the list to finish loading. Verify that a table or list of posts is visible and that it contains more than one row." --agent --headless --timeout 90
```

The agent navigates, waits for the GraphQL query to resolve (it watches the actual rendered page, so it is not fooled by an early network-idle), and reads the DOM to confirm rows exist. If the cell is stuck in its Loading state because a resolver hangs, the timeout fires and you get exit code `3`, which tells you something very different from a `1` assertion failure.

The Empty path is where intent testing shines. Point the same kind of objective at a filtered view you know returns nothing:

```bash
browserbash run "Go to http://localhost:8910/posts?author=nobody. Confirm the page shows an empty-state message like 'No posts' and does NOT show an error or a broken layout." --agent --headless
```

You did not write a selector for the empty view. You described what a correct empty state looks like, and the agent judges it. When your teammate regenerates the cell and the empty markup changes, this test keeps passing because the meaning did not change.

### Making cell tests committable with test files

One-off commands are great for exploration, but a real suite lives in version control. BrowserBash uses committable `*_test.md` files with a plain structure: a `#` title, `-` or numbered steps, `@import` for composition, and `{{variables}}` templating. Save this as `posts_cell_test.md`:

```
# Posts cell renders success and empty states

- Go to {{baseUrl}}/posts
- Wait for the posts list to finish loading
- Verify text "Posts" is visible
- Verify the list contains at least one post row
```

Run it with `browserbash testmd run ./posts_cell_test.md`. After each run BrowserBash writes a human-readable `Result.md` next to your test so you have an artifact to eyeball, and secret-marked variables are masked as `*****` in every log line. The [tutorials on browserbash.com](https://browserbash.com/tutorials) walk through the full test file grammar if you want the complete reference.

## Deterministic checks with Verify steps

Here is the part that matters for a full-stack framework: some assertions should never depend on an LLM's judgment. "Did the URL change to `/posts/1` after I clicked the title?" is a yes-or-no fact, not something to reason about. BrowserBash gives you `Verify` steps that compile to real Playwright checks, no model in the loop.

The Verify grammar covers the things you assert constantly: URL contains a substring, title is or contains text, specific text is visible, a named button, link, or heading is visible, element counts, and stored-value equality. A pass means the condition genuinely held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table, so a red test tells you exactly what the page showed instead of what you expected.

```
# Post detail navigation is deterministic

- Go to {{baseUrl}}/posts
- Click the first post title
- Verify URL contains "/posts/"
- Verify the "Edit" link is visible
- Verify heading "Post" is visible
```

The click step is agent-driven because "the first post title" needs a bit of judgment about what counts as the title. The three Verify lines are deterministic Playwright assertions. You get the flexibility of intent where you need it and the rigor of a hard check where the answer is binary. If you write a Verify line outside the supported grammar, BrowserBash still runs it, but agent-judged and flagged `judged: true` in the results, so you can always tell which assertions were deterministic and which were reasoned.

## Seeding data and checking it: testmd v2 for GraphQL-backed pages

Redwood's whole architecture is GraphQL over Prisma. The hardest tests to keep stable are the ones that need specific data in the database first, then verify that data surfaces through the UI. Doing that by clicking through a creation form every time is slow and couples your read test to your write test.

testmd v2 solves this cleanly. Add `version: 2` to a test file's frontmatter and steps execute one at a time against a single browser session, with two deterministic step types that never touch a model. API steps (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) let you seed data straight through your GraphQL or REST endpoint, and Verify steps check that it rendered. Consecutive plain-English steps run as grouped agent blocks on the same page.

```
---
version: 2
---

# Seed a post via the API, then verify it renders

- POST {{baseUrl}}/api/posts with body { "title": "Redwood release notes", "body": "Shipping cells today" }
- Expect status 201, store $.id as 'postId'
- Go to {{baseUrl}}/posts/{{postId}}
- Verify text "Redwood release notes" is visible
- Verify text "Shipping cells today" is visible
```

You created the record deterministically, captured its id from the JSON response, navigated to the exact detail page, and verified the content, all without an LLM inventing anything about your data. This is the pattern for testing any GraphQL-backed Redwood page: seed through the API, read through the UI, assert with Verify. It maps almost perfectly onto Redwood's separation of services (write side) and cells (read side).

One honest limitation to plan around: testmd v2 currently drives the builtin engine, which speaks the Anthropic API. You need an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway for v2 files today. It does not yet run directly on Ollama or OpenRouter. Your v1 files (no version frontmatter) still run exactly as before on any model, so you can mix both while this matures.

## Testing Redwood forms and mutations

Forms are Redwood's other core primitive. A `<Form>` wires fields to a service that runs a GraphQL mutation, and Redwood's server-side validation can bounce a submission back with field-level errors. A good form test proves both the happy path and the validation path.

Happy path first, as a committable test file:

```
# Create post form submits successfully

- Go to {{baseUrl}}/posts/new
- Type "My first Redwood post" into the Title field
- Type "Testing forms by intent" into the Body field
- Click the Save button
- Verify URL contains "/posts"
- Verify text "My first Redwood post" is visible
```

The agent finds the Title and Body fields by their labels, not by CSS, which means a styling refactor does not break the test. The two Verify lines confirm the mutation actually persisted and the router redirected you to the list, deterministically.

For validation, describe the broken input and the expected feedback:

```bash
browserbash run "Go to http://localhost:8910/posts/new, leave the Title empty, click Save, and confirm a validation error appears on the Title field and the form did not submit." --agent --headless
```

This is a case where agent judgment earns its keep. "A validation error appears on the Title field" can render as red text, an aria message, an inline hint, or a toast depending on how you built the form. You do not want to hard-code which one. The agent reads the page and decides whether a user would see an error, which is the thing you actually care about. If you later want to lock the exact message text down, promote it to a `Verify text "Title is required" is visible` line.

### Reusing a logged-in session across form tests

Most Redwood apps gate creation behind auth (dbAuth, Netlify Identity, or a custom setup). Logging in through the UI before every form test is slow and noisy. BrowserBash lets you save a session once and replay it:

```bash
browserbash auth save redwood-admin --url http://localhost:8910/login

browserbash run "Create a new post titled 'Auth reuse works'" --auth redwood-admin --agent --headless
```

The `auth save` command opens a browser, you log in by hand once, press Enter, and it stores the Playwright storageState. From then on `--auth redwood-admin` (or an `auth:` line in a test file's frontmatter) reuses it on run, testmd, run-all, and monitor. If the saved profile's origins do not cover your start URL, BrowserBash prints a warning instead of silently doing nothing, which saves you an hour of confused debugging.

## Running the whole suite in CI

Individual tests are the unit; the suite is what runs on every pull request. BrowserBash has a memory-aware parallel orchestrator built in. Point `run-all` at a folder and it derives concurrency from your real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones.

```bash
browserbash run-all ./web/tests --junit out/junit.xml --shard 2/4 --budget-usd 2.00
```

Two things there are worth calling out for a Redwood monorepo. Sharding (`--shard 2/4`) computes a deterministic slice from the sorted discovery order, so four parallel CI machines split the suite without any coordination between them. And `--budget-usd 2.00` stops launching new tests once estimated spend crosses the cap: remaining tests report `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. If you run against hosted models, that budget stop is what keeps a runaway loop from surprising you on the invoice.

The [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wraps all of this: it installs the CLI, runs your suite, uploads JUnit, NDJSON, and Result artifacts, supports a `shard:` matrix, and posts a self-updating PR comment with the verdict table. For a Redwood team, that means every PR gets a plain-English test report next to the diff.

### The replay cache keeps CI fast and cheap

The first green run of a test records the actions the agent took. The next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page actually changed. For a stable Redwood page that has not been touched, your CI run is effectively free and fast after the first pass. When you edit a cell and its markup shifts, the replay misses on that step, the agent re-derives it, and the cache updates. You get the speed of recorded automation with a fallback that adapts when the page moves.

## Where selector-based tools are still the better fit

Credibility matters more than a sales pitch, so here is the honest picture. Plain-English testing is not the right tool for everything, and if you are already deep in a mature Playwright suite you should not rip it out.

| Scenario | Better fit | Why |
| --- | --- | --- |
| Pixel-exact visual regression | Playwright/Cypress snapshots | Intent tests judge meaning, not exact pixels |
| Millisecond-tight timing assertions | Playwright | You need precise, low-level control of waits and events |
| Component-level unit tests | Vitest + Redwood testing utils | No browser needed; test the service or cell function directly |
| Testing GraphQL resolvers in isolation | Redwood's own scenario tests | Faster to test the service layer without a UI at all |
| Flows that change every render | Intent testing (BrowserBash) | Selectors break; intent survives refactors |
| Non-technical stakeholders reading tests | Intent testing (BrowserBash) | English steps are readable by anyone |

The sweet spot for plain-English testing is user-facing behavior that changes shape often: cells regenerated by the Redwood CLI, forms restyled by a design pass, pages whose GraphQL query gets a new field. Keep your fast Vitest and Redwood scenario tests for the service and resolver layer, where a headless browser is pure overhead. Use intent tests for the browser journeys that used to cost you a day of selector maintenance every sprint. The two approaches are complementary, not competitors. Redwood's own [testing docs](https://browserbash.com/learn) pair well with an intent layer sitting on top.

## Wiring BrowserBash into an AI coding agent

If you build Redwood with an AI coding assistant, the most interesting use is giving that assistant a way to validate its own work. BrowserBash ships an MCP server, so any Model Context Protocol host (Claude Code, Cursor, Windsurf, Codex, Zed) can call it as a native tool.

```bash
claude mcp add browserbash -- browserbash mcp
```

That one line exposes three tools to the agent: `run_objective` for a single English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The key mental model: a failed test is a successful validation. The tool call itself succeeds and hands the agent a verdict to read, so your coding assistant can generate a Redwood cell, run an intent test against it, see it fail, and fix the code before it ever tells you it is done. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash` if you want to install it through your host's registry UI instead.

## A practical rollout for a Redwood team

If you are adding intent tests to an existing Redwood app, do it in this order and you will get value on day one:

1. **Smoke test the critical path.** One `run` command that logs in, hits your main dashboard cell, and confirms the Success state renders. Wire it into CI with `--agent` and read the exit code.
2. **Convert your flakiest Playwright spec.** Pick the selector test that breaks most often and rewrite it as a `*_test.md` with Verify lines for the deterministic bits. If you have existing Playwright specs, `browserbash import` converts them heuristically with no model involved, and anything untranslatable lands in an `IMPORT-REPORT.md` rather than being silently dropped.
3. **Add form validation coverage.** These are usually undertested because they are annoying to write with selectors. Intent tests make them a two-line objective.
4. **Seed-and-verify your GraphQL pages** with a testmd v2 file so your read tests stop depending on your write tests.
5. **Turn on monitoring** for production once the suite is green. `browserbash monitor "check the login flow" --every 10m --notify <webhook>` runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes, never on every green run, and the replay cache makes it nearly token-free.

You do not need to migrate everything. Start with the tests that hurt, prove the model works on your own Redwood app, and expand from there. The [BrowserBash blog](https://browserbash.com/blog) has more framework-specific walkthroughs if you want to see the pattern applied elsewhere.

## FAQ

### Can I test RedwoodJS cells without writing any selectors?

Yes, that is the core idea. You describe the outcome you want ("the posts list shows at least one row" or "an empty-state message appears"), and the AI agent drives a real browser to check it by reading the rendered page. Because you never hard-code a class name or test id, regenerating a cell or restyling it does not break the test as long as the visible behavior stays the same.

### Do I need API keys to test a RedwoodJS app with BrowserBash?

Not for standard runs. BrowserBash is Ollama-first, so it defaults to a free local model with no keys and nothing leaving your machine. If you have no local model it falls back to Anthropic, OpenAI, or OpenRouter keys if present. The one exception today is testmd v2 files (the version 2 API-plus-Verify format), which currently need the builtin engine and an Anthropic key or a compatible gateway.

### How do I test a Redwood form's validation errors?

Write an objective that describes the invalid input and the expected feedback, for example leaving a required field empty, clicking Save, and confirming a validation error appears while the form does not submit. The agent judges whether a user would see an error regardless of whether it renders as inline text, an aria message, or a toast. If you want to lock down the exact message, promote it to a deterministic Verify step that checks for that specific text.

### Can my AI coding agent run these tests itself?

Yes. Running `claude mcp add browserbash -- browserbash mcp` exposes BrowserBash to any Model Context Protocol host such as Claude Code, Cursor, or Codex. The agent gets tools to run a single objective, a test file, or a whole suite, and each returns a structured verdict it can read. A failed test still returns successfully as a validation result, so the agent can generate Redwood code, test it, see the failure, and fix it before handing work back to you.

Ready to test your Redwood app by intent instead of by selector? Install with `npm install -g browserbash-cli` and you can run your first plain-English test in under a minute. An account is optional and everything runs locally, but if you want the hosted dashboard and monitors you can [sign up here](https://browserbash.com/sign-up).
