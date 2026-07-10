---
title: Test Stencil.js Web Components With AI
description: "Learn how to test stenciljs components with AI: verify shadow DOM custom elements by intent in plain English, no selectors, no brittle page objects."
date: 2026-05-15
category: guide
---

If you build with Stencil, you already know the pain of trying to test stenciljs components with a traditional selector-based framework. Stencil compiles your JSX into standards-based custom elements, wraps their internals in shadow DOM, and hands you a bundle of `<my-button>` and `<app-profile>` tags that look nothing like the flat markup your test tooling expects. You reach for a selector, the shadow boundary blocks it, and you spend an afternoon writing `page.locator('my-button').shadowRoot()` chains that shatter the moment a designer renames a class. This guide takes a different route: describe what the component should do in plain English, let an AI agent drive a real browser, and get a deterministic verdict back.

The approach matters more for Stencil than for almost any other stack, because encapsulation is the whole point of web components. Shadow DOM exists so that a `<rating-stars>` element you publish to npm cannot be broken by a consumer's global CSS. That same wall is what makes automated testing awkward. When you verify by intent instead of by internal structure, the shadow boundary stops being an obstacle and becomes an implementation detail you no longer have to care about.

## Why Stencil components are hard to test the old way

Stencil is a compiler, not a runtime framework. You write components with a decorator API and JSX, and Stencil emits framework-agnostic web components that ship as tiny lazy-loaded bundles. That output is great for users and libraries. It is rough on tests for three concrete reasons.

First, shadow DOM. By default a Stencil component with `shadow: true` renders its template inside a shadow root. Query selectors from the document do not pierce that boundary. Your test framework has to explicitly hop into each `shadowRoot`, and nested components mean nested roots, so a single assertion about a button label three levels deep turns into a chain of shadow traversals.

Second, hydration timing. Stencil lazy-loads component definitions and hydrates them asynchronously. A naive test that queries the DOM immediately after navigation finds an undefined custom element, an empty shell, or a flash of unstyled content. You end up sprinkling `customElements.whenDefined()` calls and arbitrary waits, which is exactly the kind of flake that erodes trust in a suite.

Third, slots and reflected props. Stencil components accept content through `<slot>` and expose state through reflected attributes and properties. A test that only checks the light DOM misses slotted content, and a test that only checks attributes misses what the user actually sees rendered. The gap between "the prop is set" and "the label is visible" is where real bugs hide.

Selector-based tools can handle all of this. They just make you spell out the internal structure, and that structure is the thing most likely to change release over release. Every refactor that touches a class name or a wrapper `div` becomes a test-maintenance chore even when the user-facing behavior is unchanged.

## Testing by intent instead of by structure

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors and no page objects, and you get back a deterministic verdict plus structured results. For Stencil, the key property is that the agent looks at the rendered page the way a person does. It reads the accessibility tree and the visible content, so a shadow-DOM button with an accessible name of "Add to cart" is just a button named "Add to cart," whether it lives in the light DOM or four shadow roots deep.

Install it globally and point it at a page that renders your compiled components:

```bash
npm install -g browserbash-cli

browserbash run "Open http://localhost:3333, wait for the rating-stars component to appear, click the fourth star, and confirm the component now shows a rating of 4 out of 5" --agent
```

Notice what is absent. There is no `shadowRoot()`, no `customElements.whenDefined`, no CSS selector at all. You described the intent. The agent handled the shadow boundary, waited for hydration on its own, and returned a verdict. The `--agent` flag emits NDJSON, one JSON event per line on stdout, so a CI job or an AI coding agent can read the result without parsing prose. Exit codes are frozen and simple: 0 passed, 1 failed, 2 error or infra, 3 timeout.

The model story is Ollama-first. By default BrowserBash uses free local models, needs no API keys, and nothing leaves your machine. If it does not find a local Ollama server it resolves in order to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, so you can bring a hosted key when a flow is hard. One honest caveat worth stating up front: very small local models, roughly 8B parameters and under, can get flaky on long multi-step objectives. For a gnarly multi-component checkout flow, reach for a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. For a single-component smoke test, a small local model is usually fine.

## A first real test against a Stencil dev server

Stencil ships a dev server on port 3333 by default when you run `npm start`. That is the ideal target for component tests because it serves your compiled output with hot reload. Start the dev server in one terminal, then run an objective against it.

Say you have published a `<user-avatar>` component that takes a `name` prop, renders initials when no image is supplied, and shows a green status dot when `online` is true. The behavior you care about is entirely visual and entirely inside the shadow root. Here is the intent expressed as a test:

```bash
browserbash run "Open http://localhost:3333/avatar-demo, wait for the user-avatar element to render, and verify that it shows the initials 'PD' and a visible online status indicator" --agent --headless
```

The agent navigates, waits for the custom element to hydrate, reads the rendered content across the shadow boundary, and decides whether the initials and the status indicator are actually visible to a user. If the component regressed so that `online` no longer reflects to a visible dot, you get a fail with a summary of what the agent saw, not a stack trace pointing at a missing selector.

This is the moment the shadow-DOM problem quietly disappears. You never told the tool that `user-avatar` uses `shadow: true`. It did not need to know. The full library of tutorials at [browserbash.com/tutorials](https://browserbash.com/tutorials) walks through more of these single-component patterns if you want a warm-up before wiring anything into CI.

## Making the check deterministic with Verify assertions

Agent judgment is flexible, and flexibility is exactly what you do not want for a regression gate. If the pass or fail of your build depends on a model's opinion about whether something "looks right," you have traded selector flake for judgment flake. BrowserBash solves this with deterministic Verify assertions. In a committable `*_test.md` file, a `Verify` step compiles to a real Playwright check with no LLM judgment involved. Supported forms include URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and stored-value equality.

For Stencil components, the "text visible" and "named element visible" checks are the workhorses, because they resolve against the accessibility tree and therefore pierce shadow DOM the way the agent's perception does. A pass means the condition genuinely held. A fail arrives with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable Result.md assertion table that BrowserBash writes after every run.

Here is a Stencil component test as a markdown file, mixing an agent-driven action with a deterministic check:

```
# Rating component keeps state after click

- Open http://localhost:3333/rating-demo
- Wait for the rating-stars component to finish rendering
- Click the fifth star in the rating-stars component

Verify text "You rated this 5 out of 5" is visible
Verify 'Submit rating' button is visible
```

The plain-English lines let the agent handle the messy parts: hydration timing, finding the fifth star inside a shadow root, clicking the right element. The two `Verify` lines are the assertions your build actually gates on, and they never touch a model, so the same input always yields the same verdict. If you write a Verify line that falls outside the supported grammar, it still runs, but agent-judged and flagged `judged: true` in the output, so you can always tell a deterministic check from a judged one at a glance.

### Grouping steps so the browser session stays warm

When you want steps to execute one at a time against a single browser session, add `version: 2` frontmatter to the test file. In testmd v2, consecutive plain-English steps run as grouped agent blocks on the same page, and two deterministic step types never touch a model at all: API steps for seeding data and Verify steps for checking it. This matters for Stencil apps that need a logged-in user or a specific data shape before the component under test even renders.

```
---
version: 2
---
# Profile card renders the seeded display name

POST http://localhost:3333/api/test-users with body { "name": "Ada Lovelace", "handle": "ada" }
Expect status 201, store $.id as 'userId'

- Open http://localhost:3333/profile/{{userId}}
- Wait for the profile-card component to render

Verify text "Ada Lovelace" is visible
Verify text "@ada" is visible
```

The API step seeds a user deterministically, stores the returned id, and the UI steps verify that your Stencil `profile-card` renders the seeded values through its shadow DOM. One note on scope: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. If you are staying fully local, keep your assertions in a v1 file for now and use the deterministic Verify lines there.

## Handling slots, props, and reflected attributes

Three Stencil-specific patterns deserve their own objectives because they are where structural tests fail most often.

Slotted content is the first. When you write `<alert-banner>Payment failed</alert-banner>`, that text is projected into a `<slot>` inside the component's shadow root. A light-DOM query finds the text; a naive shadow-DOM query does not; the user sees it either way. Because the agent reads what is rendered, an objective like "verify the alert-banner shows the message 'Payment failed' with a red background" covers both the projection and the styling in one intent, without you having to reason about which DOM the text lives in.

Reflected attributes are the second. Stencil components commonly reflect a prop like `disabled` or `variant` to an attribute so consumers can style with CSS. The bug you want to catch is the mismatch: the attribute is set but the visual state did not update, or vice versa. Testing by intent catches this for free, because you assert on the visible result ("the submit button appears disabled and does not respond to clicks") rather than on the attribute value that may or may not match reality.

Named events and interactivity are the third. Stencil components emit custom events through the `@Event()` decorator. You rarely want to assert on the event object itself in an end-to-end test. You want to assert on the consequence: after clicking `<add-to-cart>`, the cart badge increments. That consequence is visible and stable across refactors, so it is exactly what an intent-based test should check.

### A quick comparison of approaches

Different tools make different trade-offs against Stencil's encapsulation model. Here is an honest read.

| Concern | Selector-based E2E (Playwright/Cypress) | Stencil test utils (jest/spec) | BrowserBash (intent-based) |
| --- | --- | --- | --- |
| Pierces shadow DOM | Yes, with explicit shadowRoot traversal | Yes, in-process | Yes, automatically via accessibility tree |
| Waits for hydration | Manual waits or web-first assertions | Handled by the test harness | Agent waits on its own |
| Survives class or markup rename | Often breaks | Depends on the query | Usually survives, checks intent |
| Deterministic gate | Yes | Yes | Yes, via Verify assertions |
| Requires writing selectors | Yes | Yes | No |
| Best for unit-level component logic | Overkill | Excellent | Not the right layer |

The last row is the honest limit. If you want to test a single component's rendering logic in isolation, in-process with mocked inputs and no real browser, Stencil's own testing utilities are the better fit and they are fast. BrowserBash lives at the end-to-end layer, verifying that compiled components behave correctly on a real page in a real browser. Use both. Unit-test the logic with Stencil's harness; verify the assembled experience with intent-based end-to-end runs. The [features overview](https://browserbash.com/features) lays out where the end-to-end layer adds the most value.

## Running a whole component library in CI

A component library has dozens of demo pages, one per component, and you want them all checked on every pull request without the suite taking twenty minutes. BrowserBash has a memory-aware parallel orchestrator built for this. Point `run-all` at a folder of `*_test.md` files and it derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones.

```bash
browserbash run-all ./component-tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

Two flags carry weight here. `--shard 2/4` runs a deterministic slice of the suite, computed on sorted discovery order, so four CI machines can each take a quarter with no coordination between them and no overlap. `--budget-usd 2` stops launching new tests once estimated spend crosses the budget: remaining tests report `skipped`, the suite exits 2, and the spend lands in RunAll-Result.md and the JUnit properties. That budget stop is your protection against a runaway hosted-model bill when someone accidentally points a large suite at a paid key.

There is also a viewport matrix for responsive components. Stencil is popular for design systems, and a `<nav-bar>` that collapses to a hamburger below 768px needs checking at both widths. `--matrix-viewport 1280x720,390x844` runs every test once per viewport, labeled in the events, JUnit, and results so a failure tells you which width broke.

The replay cache keeps repeated runs cheap. A green run records its actions, and the next identical run replays them with zero model calls, with the agent stepping back in only when the page actually changed. For a component library whose demo pages are stable between most commits, that means the suite is nearly free to run on every push, and the model only wakes up for the component you actually touched. The official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wires all of this into a workflow: it installs the CLI, runs the suite, uploads artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating PR comment with the verdict table.

## Using BrowserBash as a validation layer for AI coding agents

If you generate Stencil components with an AI coding assistant, the more interesting workflow is letting that assistant validate its own output. BrowserBash ships an MCP server. Run `browserbash mcp` to serve the CLI over the Model Context Protocol on stdio, and install it into any MCP host with a single line:

```bash
claude mcp add browserbash -- browserbash mcp
```

The same idea works for Cursor, Windsurf, Codex, and Zed. Once connected, the agent gets three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder run in parallel. Each returns the structured verdict JSON with status, summary, final_state, assertions, cost_usd, and duration_ms. The design decision that matters: a failed test is a successful validation. The tool call itself succeeds and hands the verdict to the agent, so your assistant can generate a `<date-picker>` component, ask BrowserBash to verify it renders and accepts input in a real browser, read the fail, and fix its own code before you ever see the diff. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so discovery is a one-liner in hosts that support it.

## When to choose this approach, and when not to

Be honest with yourself about the layer you are testing.

Choose intent-based testing when you are verifying assembled, hydrated components on a real page: does the shadow-DOM button respond, does slotted content appear, does the reflected variant actually change what the user sees, does the multi-component flow hold together across viewports. This is where selectors are most brittle and where reading the page by intent pays off the most. It is also the right layer when an AI agent is generating components and needs a truthful signal about whether the output works in a browser.

Do not choose it for pure unit logic. If you are asserting that a `@State()` value transitions correctly given a sequence of method calls, or that a formatter returns the right string, Stencil's in-process testing utilities are faster and more precise, and you do not need a browser at all. Reserve end-to-end runs for behavior a user can observe.

Also weigh the model constraint honestly. Fully local, token-free runs on small models are great for smoke tests and simple single-component checks. Long, branching flows across many components want a stronger model, and the deterministic testmd v2 path with API seeding currently needs the builtin engine and an Anthropic key or gateway. None of that is a dealbreaker, but knowing it up front saves you a confusing first hour. The [learn hub](https://browserbash.com/learn) covers the engine and provider choices in more depth, and [pricing](https://browserbash.com/pricing) spells out what stays free forever (everything that runs on your machine).

## FAQ

### How do you test Stencil components that use shadow DOM?

Test them by intent rather than by internal structure. BrowserBash reads the rendered page through the accessibility tree, so a button, heading, or piece of text inside a shadow root is perceived the same way a user perceives it. You write an objective like "verify the rating-stars component shows 4 out of 5" and the agent handles the shadow boundary without any shadowRoot traversal or manual selector chaining.

### Do I need to write CSS selectors to test compiled web components?

No. That is the core difference from selector-based frameworks. You describe what the component should do in plain English and an AI agent drives a real browser to check it. For deterministic regression gates you add Verify steps in a markdown test file, which compile to real Playwright checks (text visible, named element visible, element counts) without you naming a single CSS class or shadow root.

### Can this run fully locally without any API keys?

Yes for most cases. BrowserBash is Ollama-first, defaulting to free local models with nothing leaving your machine and no API keys required. The honest caveat is that very small local models around 8B parameters and under can be flaky on long multi-step flows, so use a mid-size local model or a hosted key for complex objectives. Note that the testmd v2 deterministic API-plus-Verify path currently needs the builtin engine with an Anthropic key or a compatible gateway.

### How do I add Stencil component tests to a CI pipeline?

Write your component checks as committable `*_test.md` files and run them with `run-all`, which parallelizes across your CPU and RAM. Use `--shard 2/4` to split the suite across machines deterministically and `--budget-usd` to cap spend, then emit `--junit` for your CI reporter. The official GitHub Action installs the CLI, runs the suite, uploads artifacts, and posts a self-updating PR comment with the verdict table.

Ready to test your Stencil library without fighting the shadow boundary? Install with `npm install -g browserbash-cli` and point an objective at your dev server today. An account is entirely optional, but if you want the free cloud dashboard and hosted run history you can create one at [browserbash.com/sign-up](https://browserbash.com/sign-up).
