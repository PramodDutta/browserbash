---
title: browserbash record vs playwright codegen: Two Ways to Capture a Flow
description: "browserbash record vs playwright codegen compared: what each tool hands you after you finish clicking through a flow, and which one CI keeps happy."
date: 2026-07-09
category: comparison
---

If you have ever recorded a login flow with Playwright's built-in recorder and then watched that same spec go red three sprints later because a `data-testid` moved, you already understand the tradeoff this article is about. browserbash record vs playwright codegen is really a question about what kind of artifact survives contact with a changing UI: a generated TypeScript spec locked to CSS and role selectors, or a plain-English test file that an AI agent re-reads and re-executes on every run. Both tools solve the same immediate problem, turning "click through this once" into "run this forever," but they hand you very different objects when you finish clicking, and that difference shows up the first time your app's markup changes.

This isn't a "one tool is better" piece. Playwright codegen is free, it ships in a tool most teams already have installed, and it produces exactly the kind of deterministic, line-by-line spec that a Playwright-fluent team wants to own. browserbash record produces something else entirely: a committable `*_test.md` file written in English, plus a pre-warmed replay journal that lets the next run skip the model almost entirely. Which one you want depends on who is going to read the output six months from now, and how much selector maintenance you're willing to sign up for. The [full feature list](https://browserbash.com/features) covers everything the recorder sits alongside, if you want the wider picture before diving into this one comparison.

## What Playwright codegen actually gives you

Run `npx playwright codegen https://example.com` and Playwright opens a real browser alongside an inspector window. Every click, fill, and navigation you perform gets translated, live, into Playwright API calls: `page.getByRole('button', { name: 'Sign in' }).click()`, `page.getByLabel('Email').fill('user@example.com')`, and so on. When you stop recording, you have a `.spec.ts` file, fully typed, ready to run under `npx playwright test`.

This is a genuinely good developer experience if you already write Playwright tests by hand. The generated locators lean on Playwright's accessibility-first selector strategy (`getByRole`, `getByLabel`, `getByText`) rather than brittle CSS classes, which is a real improvement over older codegen tools that would spit out `div > div > button:nth-child(3)`. The output is also immediately debuggable: you can set breakpoints, step through assertions, and extend the spec with any Playwright API method, because it's just TypeScript.

But the output is also a commitment. Once you have `page.getByRole('button', { name: 'Sign in' }).click()` checked into your repo, that line has to keep matching the DOM forever, or someone has to open the file, understand the existing code, and fix the selector by hand. The recorder never comes back to re-verify anything; it captured a single sequence of DOM interactions at a single point in time, and from that moment on the maintenance burden belongs entirely to whoever owns the spec file.

## What browserbash record actually gives you

`browserbash record <url>` opens a visible browser the same way codegen does. You click through your flow exactly once. The difference starts the moment you stop recording (Ctrl-C): instead of a TypeScript file full of API calls, you get a plain-English `*_test.md` file, the same format BrowserBash uses for every other test in the project.

```bash
browserbash record https://example.com/login
```

A recorded login flow might come out looking like this:

```markdown
# Login flow

1. Go to https://example.com/login
2. Type {{username}} into the Email field
3. Type {{password}} into the Password field
4. Click the "Sign in" button
5. Verify 'Dashboard' heading visible
```

Two things are happening here that codegen has no equivalent for. First, the steps describe intent ("Type {{password}} into the Password field"), not implementation ("locate this exact selector and call `.fill()`"). Second, password capture never touches the recorded file at all: the capture script sends only a secret marker while you're typing, so the generated step reads `Type {{password}} into ...` and the actual value lives in your variables file or environment, masked as `*****` in every log line. Codegen, by contrast, will happily bake your literal test password into the `.fill()` call if you type it during the session, and you have to remember to go back and parameterize it yourself.

The second artifact browserbash record leaves behind is less visible but arguably more important: a pre-warmed replay journal. BrowserBash's replay cache records the concrete actions (clicks, fills, navigations) that satisfied each English step the first time it ran. The next time you run that same test, BrowserBash replays the cached actions directly, with zero model calls, and only falls back to the AI agent if the page has visibly changed since the recording. Recording a flow doesn't just produce a readable spec, it produces a spec that's already fast on day one.

## The core distinction: instructions vs implementation

This is the part worth sitting with, because it's easy to wave away as a syntax preference. It isn't. A Playwright codegen spec is an implementation: a sequence of API calls against a specific DOM shape. A BrowserBash `*_test.md` file is an instruction set: a sequence of things a human (or an AI agent) should do to a page, independent of how that page happens to be built today.

When your frontend team renames a `data-testid`, swaps a button for a styled `<div role="button">`, or moves a form field two pixels to the left inside a redesigned card layout, the Playwright spec's selector may stop resolving. Someone has to notice the failure, open the spec, and manually rewrite the locator. The English step "Click the Sign in button" doesn't reference any selector at all, so an AI agent re-interpreting that instruction against the new DOM has a real shot at finding the equivalent element without a human touching the file. That is not a claim that BrowserBash spec files are self-healing in some magical sense, they're not, and BrowserBash doesn't market them that way. It's a narrower and more defensible claim: instructions expressed in terms of user intent are more robust to DOM churn than instructions expressed in terms of exact selectors, because the agent re-reads intent every run instead of replaying a frozen implementation.

## Side-by-side: what you get after recording

| | Playwright codegen | browserbash record |
|---|---|---|
| Output format | `.spec.ts` (TypeScript, Playwright API calls) | `*_test.md` (plain English, committable) |
| Selector strategy | Baked-in `getByRole`/`getByLabel`/CSS at record time | None stored; agent re-locates elements each run via the DOM at execution time |
| Password handling | Typed value can land in the file verbatim unless you manually parameterize | Secret marker only; generated step reads `{{password}}`, real value stays out of the file |
| Re-run cost after recording | Fast; runs as native Playwright, no AI involved | Fast on repeat runs too, via the pre-warmed replay journal (skips the model when the page hasn't changed) |
| Who can read/edit it | Developers comfortable in TypeScript/Playwright | Anyone: QA, PM, developer, or an AI coding agent |
| Assertions | Playwright `expect()` calls, hand-written or added after recording | `Verify` steps compile to deterministic Playwright checks when they match the grammar (URL, title, text, element counts, stored values); anything outside that grammar is agent-judged and flagged `judged: true` |
| Maintenance on UI change | Manual: find the failing selector, fix it in the spec | Re-run and let the agent re-interpret; heavy redesigns may still need a human to re-record or edit wording |
| Where it runs | `npx playwright test`, any CI runner with Node + browsers | `browserbash testmd run`, `run-all`, `--agent` NDJSON, or as an MCP tool from an AI coding agent |
| Cost model | Free, purely local execution | Free CLI; local Ollama models cost nothing, hosted models (Anthropic/OpenRouter) cost tokens, tracked as `cost_usd` in `run_end` |

That last row matters more than it looks. Playwright codegen's execution cost is fixed and effectively zero once you've written the browsers to disk. BrowserBash's execution cost depends on your model choice: point it at a local Ollama model and repeat runs are also free, or bring your own Anthropic/OpenRouter key and pay per token, with the replay cache keeping that spend down after the first successful run.

## Verification, not just navigation

Codegen alone doesn't give you assertions. You record the click path, then you go back and hand-write `expect()` calls for whatever you actually want to verify. That's not a criticism, it's just how the tool is scoped: it's a locator generator, not a test-authoring assistant.

BrowserBash's recorder can capture `Verify` steps as part of the same pass, and those steps aren't agent guesswork by default. When a `Verify` line matches BrowserBash's grammar, like `Verify 'Dashboard' heading visible`, `Verify URL contains /account`, or `Verify stored 'orderTotal' equals '49.99'`, it compiles to a real Playwright check with no LLM judgment involved. A pass means the condition literally held; a fail comes back with expected-vs-actual evidence in the `run_end.assertions` block and in the Result.md table BrowserBash writes after every run. If you write a `Verify` step in looser language that falls outside that grammar, it still runs, but the agent judges it and the event stream marks it `judged: true` so you always know which kind of pass you got.

## Running the recorded output in CI

Once you have a spec, either kind, the next question is how it behaves in a pipeline. A Playwright `.spec.ts` runs the way Playwright specs always have: `npx playwright test`, JUnit output if you configure a reporter, and you're done.

A BrowserBash `*_test.md` file runs through the same CLI you used to record it:

```bash
browserbash testmd run ./.browserbash/tests/login_test.md --agent --headless --timeout 120
```

The `--agent` flag switches output to NDJSON, one JSON event per line, which is what you want feeding a CI parser or an AI coding agent instead of a human terminal. Exit codes are frozen and documented: `0` passed, `1` failed, `2` error, `3` timeout, so a shell script or GitHub Action can branch on them without parsing prose.

For a whole folder of recorded flows, `run-all` adds the orchestration layer Playwright teams usually have to bolt on themselves: memory-aware parallelism, previously-failed-first ordering, and flaky-run detection.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

That `--shard 2/4` flag computes a deterministic slice of the suite based on sorted discovery order, so four parallel CI machines split the work without coordinating with each other. `--budget-usd 2` is the other half of the story if you're running on a hosted model: once the suite's estimated spend crosses the budget, `run-all` stops launching new tests, marks the rest `skipped`, exits `2`, and records the spend in both `RunAll-Result.md` and the JUnit `<properties>` block. There's no equivalent concept in Playwright codegen's output, because codegen specs don't carry a per-run cost to budget against in the first place.

There's also the official [`browserbash-action@v1` GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), which installs the CLI, runs your suite, uploads JUnit/NDJSON/results artifacts, and posts a self-updating PR comment with a verdict table. If your team is already comfortable wiring up `.github/workflows/playwright.yml`, adding a BrowserBash job for the recorded English suite is a similarly small diff. The CLI itself ships as [`browserbash-cli` on npm](https://www.npmjs.com/package/browserbash-cli), so pinning a version in CI is the same `npm install -g browserbash-cli@1.5.1` pattern you'd use for any other global tool.

## If you already have a pile of Playwright specs

You don't have to pick a side and throw away existing work. If your team has years of Playwright codegen output sitting in a `tests/` directory, `browserbash import` converts those specs to plain-English `*_test.md` files heuristically, with no model call involved:

```bash
browserbash import ./tests/*.spec.ts
```

It's deterministic and reproducible: `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common `expect()` calls all translate. `process.env.X` references become `{{X}}` variables automatically. Anything the importer can't confidently translate lands in an `IMPORT-REPORT.md` file instead of being silently dropped or, worse, invented. That report is worth reading closely the first time you run an import; it's the honest accounting of what didn't make the trip.

## Where testmd v2 changes the calculus

Everything above describes a single flow captured start to finish. testmd v2 (add `version: 2` to the frontmatter of a `*_test.md` file) lets you mix deterministic API calls into the same file as your recorded UI steps, executing one step at a time against a single browser session instead of one big joined objective.

```markdown
---
version: 2
---
# Checkout flow with seeded cart

1. GET https://api.example.com/cart/seed with body {"sku": "TEST-123"}
2. Expect status 200, store $.cartId as 'cartId'
3. Go to https://example.com/checkout
4. Verify stored 'cartId' equals 'cartId'
5. Click the "Place order" button
6. Verify URL contains /order-confirmed
```

That API step never touches a model at all, it's a plain HTTP call with a status check and an optional JSON-path extraction into a variable you can reference later in the file. Playwright codegen has no comparable concept baked into the recorder itself; you'd write that setup call by hand in `beforeEach` or a fixture. testmd v2 currently drives BrowserBash's builtin engine specifically, which means it needs `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway pointed at a compatible model; it doesn't yet run directly against local Ollama or OpenRouter. v1 files with no frontmatter behave exactly as they always have, so upgrading is opt-in per file.

## When to choose Playwright codegen

Reach for codegen when your team is already fluent in Playwright and the spec file is going to live inside a codebase that developers, not QA or PMs, will maintain. If you need to extend the recorded flow with arbitrary custom logic, mocked network responses, or Playwright's full API surface (`route()`, `waitForResponse()`, multi-tab handling), a real TypeScript file gives you that headroom directly. Codegen is also the better fit when you have zero interest in AI models being part of your test execution path at all, either for cost reasons or because your organization has a policy against sending page content to any model, local or hosted.

## When to choose browserbash record

Reach for browserbash record when the person who needs to read and eventually edit the test isn't a Playwright developer. A plain-English step list is legible to a QA lead, a product manager reviewing a PR, or an AI coding agent picking up the file as an MCP tool call. It's also the better fit when you're actively fighting selector churn: teams doing frequent redesigns or migrating design systems tend to see codegen specs break in clusters, while English instructions re-interpreted against the current DOM tend to survive smaller cosmetic changes without a human edit. And if you want your test suite doubling as documentation, an org onboarding new engineers can read a `*_test.md` file and understand the login flow without knowing Playwright syntax at all.

## Who it's for, honestly

If your org has invested in a Playwright test architecture with page object models, custom fixtures, and CI wired around `playwright test`, don't rip that out to switch tools. Bring `browserbash import` in as a bridge for new suites, or use BrowserBash `Verify` steps and the MCP server (`browserbash mcp`) alongside your existing Playwright suite as a second, human-readable validation layer, not a replacement. If you're starting a project fresh, or you're the kind of team where the person writing the test and the person reading the test failure six months later are different people with different skill sets, browserbash record's plain-English output plus the pre-warmed replay journal is the more forgiving starting point. The [tutorials section](https://browserbash.com/tutorials) walks through a first recording end to end if you want to see the whole loop before committing to it, and the [source is on GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly how the recorder captures actions.

## Debugging a recorded flow after it fails

Playwright gives you the trace viewer and the inspector: step through a failing spec, watch the DOM state at each `expect()`, and reproduce the exact browser session that failed in CI. That workflow is mature and most Playwright users lean on it daily.

BrowserBash's debugging story runs through a different surface. `browserbash dashboard` starts a fully local web UI on port 4477, nothing leaves the machine, and it shows you the run history for every test, including the ones you captured with `browserbash record`. Each run's Result.md, written automatically after execution, lays out the step-by-step outcome in plain text: which English instruction ran, what it resolved to on the page, and whether any `Verify` step passed or failed with expected-vs-actual evidence attached. For teams that want more than the local view, `browserbash connect` plus `--upload` pushes runs to an optional free cloud dashboard with 15-day retention, useful when a failure needs to be shared with someone who doesn't have the repo checked out.

The debugging philosophy difference tracks the same instructions-vs-implementation split from earlier in this piece. Playwright's trace viewer is built for someone debugging code: you're looking at API calls, network waterfalls, and DOM snapshots tied to specific lines in a `.spec.ts` file. BrowserBash's Result.md and dashboard are built for someone debugging a flow: you're reading "Click the Sign in button, resolved to element X, succeeded" in the same English the test was written in, which is a smaller leap for a QA lead or PM who never opened the underlying browser automation code. Neither approach is strictly better for triage speed; a developer fixing a real selector regression will usually get there faster in Playwright's trace viewer, while a non-developer trying to understand why a recorded flow diverged from expectations will usually get there faster reading a Result.md written in the same language as the test itself.

## FAQ

### Does browserbash record replace Playwright codegen entirely?

No, and it doesn't need to. They solve the same "capture a flow once" problem but produce different artifacts: codegen gives you a TypeScript spec you own and maintain by hand, browserbash record gives you a plain-English `*_test.md` file plus a pre-warmed replay journal that an AI agent re-interprets on each run. Teams with existing Playwright suites often keep both, using `browserbash import` to bring older specs into the English format gradually.

### Is a recorded BrowserBash test slower than a Playwright spec because it uses AI?

Not after the first run. BrowserBash's replay cache stores the concrete actions from a test's first successful pass and replays them directly with zero model calls on subsequent runs, only falling back to the AI agent when the page has visibly changed. A monitor running the same recorded test every ten minutes stays close to token-free most of the time.

### Does browserbash record capture passwords in the saved test file?

No. The capture script sends only a secret marker while you're typing a password field, so the generated step reads `Type {{password}} into ...` with the real value kept out of the file entirely, in your variables file or environment instead. Playwright codegen has no equivalent safeguard; it will write whatever you typed into the `.fill()` call unless you go back and parameterize it yourself.

### Can I migrate my existing Playwright specs into BrowserBash's format?

Yes, with `browserbash import`, which converts Playwright specs to plain-English `*_test.md` files heuristically and deterministically, with no model call involved. It handles `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, common `expect()` calls, and turns `process.env.X` references into `{{X}}` variables, writing anything it can't confidently translate into an `IMPORT-REPORT.md` file rather than dropping or inventing it.

To try it yourself: `npm install -g browserbash-cli`, then `browserbash record <your-url>` on a real flow and compare the output to whatever codegen would have produced for the same clicks. An account is optional; [sign up free](https://browserbash.com/sign-up) only if you want the cloud dashboard on top of the local one.
