---
title: Arrange-Act-Assert Tests in Plain Markdown
description: "Map the classic arrange act assert markdown tests pattern onto testmd v2: API setup, English actions, and deterministic Verify checks in one file."
date: 2026-08-07
category: guide
---

Every SDET learns Arrange-Act-Assert before they learn anything else. Set up the state you need, do the thing you're testing, check that it happened. It's the shape of a good unit test, and it's the shape of a good end-to-end test too, except most browser test frameworks bury that shape under fixtures, page objects, and boilerplate until you can't see it anymore. This article shows how to write arrange act assert markdown tests with BrowserBash's testmd v2 format, where the three phases aren't a convention you follow in your head, they're literal, labeled sections in a file you can read top to bottom without running anything.

If you've written enough Playwright or Selenium specs, you already know the pattern gets harder to see as the file grows. A `beforeEach` hook seeds a user in one file. A helper function logs in three files away. The assertion is buried in a chain of `.toHaveText()` calls after twenty lines of locator setup. The pattern is still there, technically, but you'd need a decoder ring to find it. This piece walks through why AAA tends to erode in browser tests, and then shows a format where it can't, because the file structure enforces it.

## The classic Arrange-Act-Assert pattern, briefly

Arrange-Act-Assert isn't complicated, which is exactly why it's durable. Arrange means you get the system into a known starting state: create a user, seed a database row, log in, navigate to a page. Act means you perform the one behavior under test: click the button, submit the form, call the endpoint. Assert means you check that the outcome matches what you expected, and only that outcome, nothing more.

The value isn't the acronym. It's what the acronym forces you to do: separate the noise of setup from the signal of the test. A well-arranged test tells a reader exactly what preconditions matter. A well-acted test performs one action, not five. A well-asserted test checks a specific, falsifiable claim, not a vague "it looks right." When any of those three blur together, tests get harder to read, harder to debug when they fail, and harder to trust when they pass.

Unit tests keep this discipline naturally because the language enforces small functions. Browser tests lose it because setup is expensive and repetitive: you need a browser, a page, a login, maybe some seed data, before you can even get to the "act" you actually care about. Teams reach for `beforeEach`, shared fixtures, and helper functions to avoid repeating that setup, and each of those abstractions pulls the arrange step further from the assert step, until nobody can eyeball a test file and tell you what it's actually verifying.

## Why AAA erodes in end-to-end browser tests specifically

There are three specific ways browser test suites lose the AAA shape, and it's worth naming them because the fix has to address all three.

**Setup requires a different tool than the check.** You seed data through an API call, or a database script, or a UI flow nobody wants to repeat. Then you check the result through the UI. Those are two different code paths, often two different files, sometimes two different languages if your seed script is a shell one-liner and your assertion is a Playwright `expect`. The arrange and the assert are structurally separated before you've written a single line of the act.

**The "act" step accumulates incidental steps.** You want to test "submitting the checkout form shows an order confirmation." But to get there you also have to add an item to the cart, open the cart, click checkout, fill in an address, and click submit. Which of those is the act and which is really arrange that belongs somewhere else? In practice, most teams just cram it all into one test body, and the act you care about gets lost in five unrelated clicks.

**Assertions become vague because writing precise ones is tedious.** `expect(page.locator('.status')).toBeVisible()` tells you something rendered. It doesn't tell you the order total matched, or the confirmation number was in the expected format, or the right button label showed up. Writing precise Playwright assertions for every meaningful outcome is real work, so a lot of end-to-end suites drift toward "did anything blow up" checks instead of "did the specific thing I expect happen."

None of these are framework failures exactly. Playwright and Selenium are perfectly capable of expressing tight AAA tests. But nothing in the tooling nudges you toward it, and the path of least resistance in a growing suite is always toward more shared setup and looser checks.

## testmd v2: a file format where arrange, act, and assert are literal sections

BrowserBash's testmd v2 format gives you three distinct step types in one markdown file, and they map onto Arrange-Act-Assert almost without translation:

- **Arrange = API steps.** A deterministic `GET/POST/PUT/DELETE/PATCH` call that seeds state before the browser ever opens a page. No model call, no ambiguity, just an HTTP request and a status check.
- **Act = plain-English steps.** The behavior under test, described the way you'd describe it to a teammate: "Add the blue hoodie to the cart and go to checkout." An AI agent drives a real browser through it, no selectors required.
- **Assert = Verify steps.** Deterministic checks compiled to real Playwright expectations: URL contains, title is or contains, specific text visible, a named button or link or heading visible, element counts, a stored value equals something.

To turn this on, add `version: 2` to the frontmatter of a `*_test.md` file. Once that's set, steps execute one at a time against a single browser session instead of getting flattened into a single objective string, and API steps and Verify steps run deterministically without touching a model at all. Consecutive plain-English steps still get grouped into agent blocks on the same page, so you're not paying a model call for every single click, only for the parts that genuinely need natural-language interpretation.

This matters for the AAA pattern specifically because it means the three phases are no longer a discipline you have to maintain by convention. They're different step types in the file. You can't accidentally bury an assertion inside your arrange section, because a Verify step and an API step have different syntax. The format itself is the code review.

## A worked example: arrange, act, assert, one file

Here's a small but complete example. It arranges a test order through the API, performs the actual UI behavior (searching for and viewing that order) in plain English, and asserts the result with Verify steps.

```markdown
---
version: 2
---
# Order lookup shows correct status

GET https://api.example.com/orders/{{orderId}}
Expect status 200, store $.status as 'orderStatus'

Log in as {{testUser}} and go to the orders page.
Search for order {{orderId}} and open its detail view.

Verify the URL contains "/orders/{{orderId}}"
Verify "Order Status" heading visible
Verify text "{{orderStatus}}" visible
```

Read that top to bottom and the AAA shape is right there. The `GET` line arranges the fixture (confirms the order exists and captures its current status into a variable). The two plain-English lines are the act: log in, search, open the record. The three `Verify` lines are the assert: the URL landed where it should, the heading is present, and the status text on the page actually matches what the API told you the order's status was, not just "some text is visible."

That last Verify line is worth dwelling on. It isn't checking that a status appeared. It's checking that the status the UI shows matches the status the API returned for the same order, using a value captured earlier in the same run. That's a materially tighter assertion than most end-to-end suites bother writing, and it costs you one line of markdown, not a helper function.

### Arrange with more than one API call

Real setup often needs more than a single seed request. testmd v2 API steps chain naturally because each one can store a value the next one, or a later Verify step, depends on:

```markdown
---
version: 2
---
# Cart total reflects a discount code applied via API

POST https://api.example.com/carts
Expect status 201, store $.id as 'cartId'

POST https://api.example.com/carts/{{cartId}}/items with body {"sku": "HOODIE-BLU-M", "qty": 1}
Expect status 200, store $.total as 'preDiscountTotal'

POST https://api.example.com/carts/{{cartId}}/discounts with body {"code": "WELCOME10"}
Expect status 200, store $.total as 'discountedTotal'

Open the cart page for cart {{cartId}} in the browser.

Verify text "{{discountedTotal}}" visible
Verify "Discount applied" text visible
```

Three arrange steps, one act step, two assert steps. Nothing here is hidden in a `beforeEach` three files away. Whoever picks up this test next reads it in thirty seconds and knows exactly what state it depends on and what it's checking.

## Verify grammar: what compiles deterministically versus what's still agent-judged

Not every `Verify` line you can imagine compiles to a real Playwright check, and BrowserBash is upfront about the line between the two. Lines that match the supported grammar (URL contains, title is/contains, text visible, `'name' button|link|heading` visible, element counts, stored value equals) run with zero model involvement: a pass means the condition literally held, and a fail comes back with expected-versus-actual evidence in the run's `assertions` output and in the generated `Result.md` file.

A `Verify` line outside that grammar still runs, but it's agent-judged instead, and it's flagged `judged: true` in the results so you can tell the difference at a glance. That flag matters more than it looks like it should. It means you never have to wonder, six months later, whether a green checkmark in your suite came from a real Playwright assertion or from a model's best guess. The report tells you.

For the assert phase of an AAA test, this is the whole point. You want your outcome checks to be as deterministic as your arrange steps. Writing Verify lines that stay inside the compiled grammar gets you there.

## Comparing AAA-in-markdown against AAA in a code framework

None of this makes testmd v2 a wholesale replacement for Playwright or Selenium test code. It's a different tool for a specific shape of test, and it's worth being honest about the tradeoffs rather than pretending one approach wins everywhere.

| | testmd v2 (arrange act assert markdown) | Playwright/Selenium spec files |
|---|---|---|
| Arrange step | `GET/POST/...` lines, no model call, no code | Fixtures, `beforeEach`, seed scripts, often a separate helper file |
| Act step | Plain English, agent-driven, no selectors to maintain | Explicit locator chains and actions you write and update yourself |
| Assert step | `Verify` grammar compiles to real Playwright checks, or falls back to agent-judged with a flag | `expect()` assertions, fully deterministic, fully in your control |
| Readability for a non-engineer | High, it's a markdown file with sentences | Low, requires reading TypeScript or Python |
| Fine-grained control over interactions | Limited to what the agent can infer from English | Full, every click and wait is explicit |
| Best fit | Business-readable regression suites, smoke tests, PR-gate checks | Complex interaction sequences, precise timing control, unit-level component tests |
| Model dependency for Act steps | Yes, needs a model (local Ollama or a hosted key) | No, pure code |
| CI cost profile | Near-zero after the first green run, thanks to the replay cache | Fixed, same execution cost every run |

If your team's bottleneck is that non-engineers (PMs, support, QA without a coding background) can't read or write your end-to-end tests, arrange act assert markdown tests solve a real problem: the file is prose plus a handful of structured lines, and anyone can review a pull request that changes one. If your bottleneck is instead that you need pixel-precise control over drag-and-drop sequences or exact wait conditions, plain English act steps are the wrong tool, and you should stay in Playwright code for that specific flow. Nothing stops you from using both: testmd for your smoke and regression layer, code specs for the handful of flows that need surgical precision.

## Running an AAA markdown test

A single arrange-act-assert file runs like any other BrowserBash test:

```bash
browserbash testmd run ./.browserbash/tests/order_lookup_test.md
```

For CI, add `--agent` to get NDJSON on stdout instead of prose, one JSON event per line, built to be machine-read rather than parsed with regex:

```bash
browserbash testmd run ./.browserbash/tests/order_lookup_test.md --agent --headless --timeout 120
```

The exit code tells you the verdict without reading a single line of output: `0` passed, `1` failed, `2` error, `3` timeout. Because testmd v2 currently drives the builtin engine, you'll need `ANTHROPIC_API_KEY` set, or an `ANTHROPIC_BASE_URL` pointed at a compatible gateway, for the plain-English act steps to run. v1 files without `version: 2` frontmatter are unaffected and keep working exactly as they did before; this is opt-in per file.

## Scaling AAA markdown tests across a suite

One arrange-act-assert file is a nice pattern. A folder of a hundred of them is a test suite, and that's where `run-all` earns its keep. It's a memory-aware orchestrator: concurrency is derived from real CPU and RAM on the machine, previously-failed and slowest tests run first, and flaky tests get flagged rather than silently retried into a false green.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

`--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four parallel CI machines each get a consistent quarter of the suite without any coordination between them. `--budget-usd 2.00` stops launching new tests once the running suite crosses that spend estimate: whatever's left gets reported `skipped`, the suite exits `2`, and the spend shows up in `RunAll-Result.md` and in the JUnit `<properties>` block, so a budget stop is visible in your CI dashboard, not a silent truncation.

Every AAA test that goes green once gets its actions recorded by the replay cache. The next identical run replays those recorded actions instead of calling a model again, and the agent only steps back in if the page actually changed. For a suite built around Verify steps that already avoid model judgment on the assert side, and API steps that never touched a model on the arrange side, this pushes the steady-state cost of running the whole thing toward the price of the act steps alone, and often to nearly nothing once the cache is warm.

If you want the same AAA suite to run continuously rather than only on PRs, `monitor` mode wraps a test or objective on an interval and only alerts on state changes:

```bash
browserbash monitor .browserbash/tests/order_lookup_test.md --every 10m --notify https://hooks.slack.com/services/your/webhook/here
```

It fires on pass-to-fail and fail-to-pass transitions, never on every green run, so a Slack channel watching a dozen of these doesn't turn into noise. Slack incoming-webhook URLs get formatted automatically; any other URL gets the raw JSON payload instead.

## Getting existing tests into this shape

If you already have Playwright specs and want to see which ones translate cleanly to arrange act assert markdown, `import` is a reasonable first pass. It's fully deterministic, no model involved:

```bash
browserbash import ./tests/playwright/*.spec.ts
```

It converts `goto`/`click`/`fill`/`press`/`check`/`selectOption` calls and `getBy*` locators along with common `expect()` calls into plain-English steps, and turns `process.env.X` references into `{{X}}` variables. Anything it can't confidently translate lands in an `IMPORT-REPORT.md` file rather than getting silently dropped or guessed at, which matters if you're going to trust the output enough to delete the original spec.

For flows you'd rather capture by clicking through once than by writing markdown by hand, `record` opens a visible browser and turns your session into a `*_test.md` file when you stop it:

```bash
browserbash record https://app.example.com/checkout
```

Password fields never leave the page during recording; the capture sends only a secret marker, and the generated file writes a `Type {{password}} into ...` step instead of your literal password. From there you'd typically add the arrange (API seed) and assert (Verify) lines by hand, since the recorder captures the act, not the setup or the checks.

## Who this format is actually for

Arrange act assert markdown tests fit teams where end-to-end coverage is currently thin because writing and maintaining Playwright specs is a bottleneck, where the org wants tests non-engineers can read in a pull request, or where you already maintain deterministic API seeding and want the browser layer of the check to stay just as deterministic without hand-rolling every locator.

It's a weaker fit if your test suite depends on precise timing, complex drag-and-drop, canvas interactions, or multi-tab choreography that plain English struggles to describe unambiguously. It's also a weaker fit today specifically for the act phase if your team has no access to a model at all: testmd v2's act steps need either a local Ollama model or a hosted key (Anthropic or OpenRouter), and very small local models, roughly 8B parameters and under, tend to get flaky on longer multi-step flows. A mid-size local model in the 70B class, or a capable hosted model for the genuinely hard flows, is the realistic sweet spot. The arrange and assert phases, being deterministic API calls and compiled Verify checks, don't have that dependency at all.

For deeper background on the format and the rest of BrowserBash's markdown testing conventions, the [learn](https://browserbash.com/learn) section and the [tutorials](https://browserbash.com/tutorials) walk through variables, imports, and secret handling in more detail than fits here. The [features](https://browserbash.com/features) page has the full feature list if you want the rest of the picture, and there's a real-world walkthrough on the [case study](https://browserbash.com/case-study) page if you'd rather see this pattern applied to an actual product than a toy example.

## FAQ

### What is the Arrange-Act-Assert pattern in software testing?

Arrange-Act-Assert is a structure for writing clear tests: arrange sets up the preconditions (data, state, login), act performs the single behavior under test, and assert checks that the outcome matches expectations. It originated in unit testing but applies to any test type, including end-to-end browser tests, because it forces a clear separation between setup noise and the actual thing being verified.

### Can I write end-to-end browser tests in plain markdown instead of code?

Yes. BrowserBash's testmd format lets you write `*_test.md` files with plain-English steps that an AI agent executes against a real browser, no selectors or page objects required. With `version: 2` frontmatter, you also get deterministic API steps for setup and Verify steps for assertions, which map directly onto arrange and assert without needing test code at all.

### Are Verify steps in testmd always checked without a model?

Only when the line matches the supported grammar: URL contains, title is or contains, text visible, a named button/link/heading visible, element counts, or a stored value equals check. Those compile to real Playwright expectations and run deterministically. A Verify line outside that grammar still executes but is agent-judged instead, and the run's results flag it with `judged: true` so you can tell which assertions were deterministic and which were not.

### Does testmd v2 work with local models through Ollama?

Not yet directly. testmd v2's plain-English act steps currently require the builtin engine, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. v1 test files without `version: 2` frontmatter are unaffected and continue to support the full model resolution chain, including local Ollama first before falling back to hosted providers.

Arrange act assert markdown tests aren't a new testing philosophy, they're an old one with a file format that finally makes it hard to cheat. Install the CLI with `npm install -g browserbash-cli`, point `testmd` at a folder, and see how much of your existing suite maps cleanly onto arrange, act, and assert once each phase has its own syntax. An account is optional: sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) only if you want the free hosted dashboard on top of what already runs locally.
