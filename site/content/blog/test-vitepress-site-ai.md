---
title: Test a VitePress Site With AI Browser Automation
description: "Learn how to test vitepress site with plain-English browser automation, deterministic checks, reusable logins, CI workflows, and honest model guidance."
date: 2026-08-21
category: guide
---

To test vitepress site well, you need to validate more than a successful build or a handful of component states. You need evidence that a reader or customer can load a real route, understand the rendered page, interact with docs navigation, local search, code groups, theme controls, and deep links, and reach the expected result. BrowserBash lets you describe that outcome in plain English while an AI agent drives real Chrome or Chromium. Deterministic checks then turn important conditions into evidence rather than opinion.

This approach is useful when selectors and page objects cost more attention than the journey deserves, especially across content, routing, or design changes. It does not make conventional tests obsolete. It gives you another layer: an open-source validation boundary for AI agents and human teams. BrowserBash is free under Apache-2.0, maintained by The Testing Academy, founded by Pramod Dutta, and available as version 1.5.1.

## Why test vitepress site through user intent

VitePress pre-renders documentation and then enhances navigation and widgets on the client. Search, sidebar state, code groups, and theme controls are exactly the kind of seams a real-browser journey can expose.

A unit test can tell you that a helper returns the right value. A framework test can confirm that a component receives expected data. Neither proves that the assembled deployment works in a browser with real routing, cookies, layout, accessible names, and client behavior. When you test vitepress site, the browser journey is the final contract.

Intent also survives many harmless implementation changes. "search for deployment, open the guide, and switch a code group tab" describes a user goal. It does not care whether the control moved into a new component or acquired another generated class. The agent observes the page, chooses an action, and proceeds step by step without selectors or page objects.

That flexibility has a limit. An AI action is adaptive, not mathematically deterministic. Use it for navigation and interaction, then reserve deterministic Verify lines for conditions that must be exact. This split is the practical pattern: flexible movement, strict evidence.

A useful test pyramid for VitePress therefore has three layers. Keep fast unit and framework tests close to logic. Add API checks for contracts and setup. Put a small set of browser objectives at the top for high-value routes, interactive seams, and business-critical outcomes. The [BrowserBash learning guides](https://browserbash.com/learn) show how that layer fits without forcing a rewrite of the lower layers.

## Install BrowserBash and run the first test

Install the CLI globally and run an objective against your local or preview deployment. BrowserBash defaults to a local provider and drives your installed Chrome. The default engine is Stagehand, while an in-repository Anthropic tool-use engine is available for flows that need it.

```bash
npm install -g browserbash-cli
browserbash run "Open http://localhost:3000/guide/getting-started, confirm the page is about Getting Started, then search for deployment, open the guide, and switch a code group tab"
browserbash run "Open https://preview.example.com/guide/getting-started and verify the primary navigation works" --viewport 390x844
```

The objective should name a start URL, a user action, and a visible outcome. Avoid turning it into a disguised selector script. "Click the third div" is brittle and gives the agent little semantic context. "Choose the monthly plan and confirm the checkout summary shows monthly billing" is clearer and easier to diagnose.

BrowserBash is Ollama-first. It resolves a local Ollama model before checking `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and OpenRouter. With a local model, there is no API key and page data stays on your machine. You can also bring an Anthropic Claude or OpenRouter key when a hosted model is appropriate.

Be honest about model capacity. Very small local models around 8B parameters and under can become flaky on long objectives. A mid-size local model such as Qwen3, a Llama 3.3 70B-class model, or a capable hosted model is a better choice for difficult flows. You can still keep costs controlled by making objectives short and letting the replay cache handle unchanged paths.

After a run, BrowserBash writes a human-readable `Result.md`. In agent mode, standard output becomes NDJSON, one structured event per line. Exit code 0 means passed, 1 means failed, 2 means an infrastructure error or budget stop, and 3 means timeout. That contract is much safer in CI than scraping colored prose.

## Design a focused test vitepress site objective

Start with a risk, not a tour of the whole site. For VitePress, high-value risks usually sit at rendering and interaction boundaries: a generated route is absent, a navigation item points to the wrong page, a form reaches the server but does not update the page, or an enhanced widget fails after the initial HTML appears.

A strong objective has four parts:

1. A stable entry URL that makes the environment explicit.
2. A short task written in the language of a user.
3. A visible result that matters to the product.
4. A narrow failure surface, so the result explains what broke.

For this guide, a good first journey is: open `/guide/getting-started`, search for deployment, open the guide, and switch a code group tab, then confirm the destination or updated state. Add a separate objective for a mobile viewport rather than asking one long agent run to cover desktop, mobile, keyboard use, errors, and every navigation item.

Keep authentication and test data deliberate. If the test depends on a user, create that user through an API step or a controlled fixture. If the site is public, start from a clean browser state. If a feature depends on a third party, decide whether this is a true end-to-end environment or whether a stable test double owns that boundary. Plain English does not excuse vague test design.

The same discipline applies to assertions. "Make sure it looks right" leaves too much room for judgment. "Verify the URL contains `/guide/getting-started` and the 'Getting Started' heading is visible" identifies observable conditions. BrowserBash can compile supported Verify grammar into Playwright checks, so those exact statements do not ask a model to decide.

## Add deterministic Verify checks with testmd v2

A committable `*_test.md` file gives the objective a stable home. BrowserBash supports imports with `@import`, `{{variables}}` templating, and secret-marked variables that are masked as `*****` in every log line. With `version: 2` frontmatter, steps execute one at a time in one browser session.

The v2 format has two deterministic step types that never touch a model. API steps can send GET, POST, PUT, DELETE, or PATCH requests and check a status, optionally storing a JSON path. Verify steps compile recognized grammar into Playwright assertions. Consecutive plain-English lines are grouped into agent blocks on the same page.

```bash
browserbash testmd core_journey_test.md --agent
browserbash run-all tests --shard 2/4 --budget-usd 2
```

A representative test file can POST test data, use `Expect status 201, store $.id as 'recordId'`, open `/guide/getting-started`, perform the user action, then use `Verify URL contains "/guide/getting-started"` and `Verify 'Getting Started' heading visible`. That sequence separates setup, adaptive movement, and strict proof without hiding which layer failed.

Supported deterministic checks include URL contains, title is or contains, text visible, named button, link, or heading visible, element counts, and stored value equality. A pass means the Playwright condition held. A failure includes expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table.

A Verify sentence outside the supported grammar still runs, but it is agent-judged and marked `judged: true`. Review that label before treating the condition as a deterministic gate. Rewrite critical checks into the grammar instead of assuming every sentence is compiled.

There is one current constraint: testmd v2 uses the builtin engine and needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run directly with Ollama or OpenRouter. Version 1 files without frontmatter retain their previous behavior, so local-model teams can still use Markdown tests while deciding where v2 sequencing is worth the gateway requirement.

## Cover rendering, routing, and interactive seams

When you test vitepress site, divide coverage by observable boundaries. First rendering asks whether the requested URL returns meaningful, navigable content. Routing asks whether links, deep URLs, back and forward navigation, and parameters land on the right page. Interaction asks whether the behavior layered onto that content actually works.

For server-rendered or pre-rendered content, test a direct deep link, not only navigation from the home page. A deployment can render the home page perfectly while rewrites or base paths break nested routes. Verify the title or heading after loading the deep URL. Then follow one internal link and confirm the next URL.

For client behavior, trigger the smallest meaningful interaction. Search for deployment, open the guide, and switch a code group tab is better evidence than merely checking that a control exists. Also test refresh after reaching a stateful route. Framework routers can appear correct during client navigation while the server or static host returns a 404 on refresh.

Add a mobile run for navigation drawers, search dialogs, tables, or code blocks. The standalone `--viewport WxH` option works with both engines. For a suite, `--matrix-viewport 1280x720,390x844` runs each test once per viewport and labels events, JUnit, and result output. Use the matrix on a selected smoke set, since doubling viewports doubles executions even when replay keeps model usage low.

Accessibility semantics help both people and automation. BrowserBash can deterministically verify a named button, link, or heading. If the agent cannot distinguish controls because everything is an unlabeled icon or generic div, that is useful product feedback, not merely a tooling inconvenience.

Explore more patterns in the [practical BrowserBash tutorials](https://browserbash.com/tutorials), but keep your suite tied to risks in your own deployment. A short, trusted smoke pack beats a large set of vague journeys.

## Reuse login state and stable test data

Private VitePress routes need repeatable authentication. BrowserBash can open a visible browser so you log in once, then save the Playwright storage state. Reuse the named profile across a run, test file, full suite, or monitor.

```bash
browserbash auth save site-editor --url https://preview.example.com/login
browserbash run "Open https://preview.example.com/guide/getting-started, search for deployment, open the guide, and switch a code group tab" --auth site-editor
browserbash monitor tests/smoke_test.md --every 10m --notify https://hooks.example.com/browserbash
```

You can also place `auth:` in test frontmatter. If the saved origins do not cover the target start URL, BrowserBash prints a warning rather than silently applying an irrelevant profile. That catches a common preview-environment mistake where authentication was saved for production or a different subdomain.

Treat saved state like a credential. Do not commit it casually. Use a restricted test account, rotate it, and keep destructive capabilities out of the profile when the journey only reads data. Saved login state improves repeatability, but it does not replace test-data ownership.

For setup, API steps in testmd v2 are often cleaner than spending model turns clicking through an admin UI. Seed the precise record, store its identifier, open the browser, and verify the record through the interface. Cleanup can live in an environment reset or a dedicated API path. This makes failures easier to classify: setup contract, browser action, or visible assertion.

Secrets belong in variables, not literal objectives. BrowserBash masks secret-marked variables in logs. Still inspect screenshots, third-party pages, and application-side telemetry because masking CLI logs cannot govern every system the browser contacts.

## Scale VitePress checks in CI

BrowserBash `run-all` is a memory-aware parallel orchestrator. It derives concurrency from real CPU and RAM, prioritizes previously failed and slow tests, and detects flaky behavior. That is useful when VitePress coverage grows beyond a few smoke journeys.

Sharding is deterministic. `--shard 2/4` selects from sorted discovery order, so four CI machines agree without coordinating. A viewport matrix runs discovered tests at each specified size. Cost controls stop launching new tests after `--budget-usd` or `--budget-tokens` is crossed. Remaining tests are marked skipped, the suite exits 2, and spend is written to `RunAll-Result.md` plus JUnit properties.

Version 1.5.0 includes a GitHub Action at the repository root. It installs the CLI, runs a suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and `budget-usd:`, and maintains one self-updating pull request comment with a verdict table. See the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

The replay cache changes repeated-check economics. A green run records its actions. The next identical run replays them with zero model calls, and the agent returns only if the page changed. This is not a promise that every future run is free. It is a practical optimization for stable smoke paths and frequent pull request checks.

Agent mode supplies NDJSON for CI and coding agents. The final `run_end` includes status, summary, final state, assertions, duration milliseconds, and a `cost_usd` estimate when the model exists in the bundled price table. Unknown models receive no estimate instead of a fabricated number. Cheap-model routing through `--model-exec` can also let a strong model plan while a cheaper one executes.

## Validate with MCP and monitor production

The MCP server exposes BrowserBash over standard input and output. Install it into Claude with `claude mcp add browserbash -- browserbash mcp`; Cursor, Windsurf, Codex, and Zed use the same server-command idea. BrowserBash is listed in the official MCP Registry as `io.github.PramodDutta/browserbash`.

It exposes `run_objective`, `run_test_file`, and `run_suite`. Each returns structured verdict JSON containing status, summary, final state, assertions, cost, and duration. A failed test is a successful validation call: the MCP tool succeeds and the calling agent reads the failed verdict. That cleanly separates a product failure from a broken tool transport.

This is BrowserBash's core role, the open-source validation layer for AI agents. It is not a replacement for all test frameworks or observability. It gives an agent an executable real-browser answer to whether a user objective works now. The [feature overview](https://browserbash.com/features) helps map local, CI, and agent workflows.

Monitor mode reruns a test or objective on an interval. It alerts only on pass-to-fail and fail-to-pass changes, never on every green run. Slack incoming webhooks get Slack formatting; other URLs receive raw JSON. Stable monitors become nearly token-free through replay.

The local dashboard from `browserbash dashboard` needs no account. An optional free cloud dashboard uses `browserbash connect` plus `--upload` and retains uploads for 15 days. Teams with strict data rules can remain fully local.

## When to choose BrowserBash to test vitepress site

Choose BrowserBash when behavior is easiest to describe as an outcome, UI structure changes often, and you want a real browser plus a machine-readable verdict. It fits smoke tests, preview checks, coding-agent validation, cross-route journeys, and compact regression packs maintained as Markdown.

Keep Playwright or another code-first framework when you need exact event control, extensive network mocking, trace-level debugging, visual snapshot ecosystems, or a very large selector-stable suite. BrowserBash compiles deterministic Verify grammar to Playwright, but its authoring model remains intent-first. The approaches coexist well.

Use direct API tests when no browser behavior matters. They are faster and isolate contracts cleanly. Testmd v2 can combine API setup with UI verification, but not every backend assertion belongs in a browser test.

Choose Ollama when privacy, local execution, and avoiding keys matter. Choose a capable hosted model for difficult, long, or visually ambiguous flows. Choose the builtin engine for testmd v2 or LambdaTest and BrowserStack. The local, CDP, Browserbase, LambdaTest, and BrowserStack providers serve different environments, and the latter two require builtin.

Before expanding, try one critical journey and inspect its failure evidence. The [BrowserBash case studies](https://browserbash.com/case-study) may provide planning ideas, but your deployment risks should decide the fit.

### VitePress-specific regression checklist

For VitePress, cover one direct guide route, one sidebar transition, and one local-search result. Verify the destination heading and URL after each meaningful action. Refresh the nested guide to include static-host fallback and base-path behavior. If the site uses locale routes, repeat the smallest critical journey in one non-default locale rather than assuming generated navigation is symmetric.

Code groups and theme controls are good focused interaction checks. Switch a code-group tab and verify its distinctive text, then navigate and confirm whether shared tab state behaves as intended. Toggle the theme and refresh only if persistence is a requirement. A link crawler should own exhaustive static references, while component tests can own custom Vue behavior in isolation. BrowserBash proves the final reader path across pre-rendered HTML, enhanced navigation, search indexing, responsive controls, and deployment configuration.
A final review should classify every failure before anyone reruns it. A deterministic assertion mismatch is product evidence. An agent that chose an unexpected path may indicate ambiguous wording, weak accessible semantics, or insufficient model capacity. Exit code 2 points toward infrastructure or a budget stop, while exit code 3 identifies timeout. Preserve the Result.md and NDJSON artifacts so the team can make that distinction from evidence.

Run the same small smoke set against the deployment shape users receive, not only a development server. Preview hosts can differ in redirects, caching, base paths, headers, and access controls. Keep the objective unchanged across environments where possible, and inject only URLs, accounts, and test data. That makes environment drift visible without turning the test into a collection of conditional instructions. Review agent-judged assertions separately from deterministic ones, and promote stable critical conditions into supported Verify grammar as the suite matures.

## FAQ

### How do I test vitepress site without CSS selectors?

Write a plain-English objective with a start URL, a user action, and a visible outcome. BrowserBash drives real Chrome or Chromium step by step, while supported Verify lines compile to deterministic Playwright checks.

### Can BrowserBash test VitePress with a local AI model?

Yes. BrowserBash is Ollama-first, so local models need no API key and data stays on your machine. Models around 8B and under may struggle with long flows, so use shorter objectives or a capable mid-size model.

### Does testmd v2 work with Ollama for VitePress tests?

Not directly today. Testmd v2 requires the builtin engine with an Anthropic key or compatible gateway, while v1 Markdown tests retain their previous behavior.

### Should BrowserBash replace Playwright in my VitePress project?

Usually not completely. Use BrowserBash for readable intent-driven journeys and agent validation, and keep code-first Playwright tests where exact control, mocking, or detailed debugging is the better fit.

Install with `npm install -g browserbash-cli` and run one focused journey against your preview site. An account is optional, but you can [sign up for the optional dashboard](https://browserbash.com/sign-up) if shared uploaded results fit your workflow.
