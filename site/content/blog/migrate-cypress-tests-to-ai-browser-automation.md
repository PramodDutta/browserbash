---
title: How to Migrate Cypress Tests to AI Browser Automation
description: "Learn how to migrate Cypress tests to AI browser automation: map cy.get and cy.intercept patterns to plain-English objectives that still return pass/fail."
date: 2026-02-21
category: guide
---

If you have a Cypress suite that worked beautifully for two years and now spends most of its life flaking on `cy.get` selectors that changed when a designer renamed a class, you already know why people want to migrate Cypress tests to AI browser automation. The pitch is simple: instead of describing *how* to click through a flow with selectors, retries, and intercepts, you describe *what* you want verified in plain English, and an AI agent drives a real browser to get there. This guide is the practical version of that pitch. It walks through how each Cypress pattern you rely on — `cy.get`, `cy.contains`, `cy.intercept`, custom commands, fixtures — maps onto an objective-driven approach, where the translation is clean, where it is lossy, and where you should honestly keep Cypress instead.

I have shipped Cypress in CI for real products and I will not pretend AI automation is a drop-in replacement for everything. It is a genuinely better fit for some tests and a worse fit for others. The goal here is to help you sort your suite into the right buckets and move the tests that benefit, using [BrowserBash](https://browserbash.com/features) as the concrete tool, while being clear about the trade-offs.

## Why teams want to move off Cypress selectors

Cypress is a good tool. The friction people hit is rarely Cypress itself — it is the selector-and-assertion model that every DOM-driven framework shares. A Cypress test is a recipe: find this element, type into it, click that, wait for this network call, assert that text equals a value. The recipe is precise, which is its strength and its curse. When the DOM shifts even slightly, the recipe breaks, and the failure is often "element not found," not "the feature is broken."

Three patterns drive most migration interest:

- **Selector churn.** `cy.get('[data-cy=submit]')` is fine until someone deletes the `data-cy` attribute or restructures the component. Multiply that across hundreds of tests and a redesign turns into a week of test surgery.
- **Flaky waits.** Cypress retries assertions automatically, which is great, but flows that depend on animations, third-party widgets, or race conditions still produce intermittent reds that erode trust in the suite.
- **Maintenance tax.** Page objects, custom commands, and fixtures are real code. Someone owns them. When that person leaves, the suite calcifies.

AI browser automation attacks the first two directly. There are no selectors to churn because you never write one, and the agent decides for itself when the page is ready instead of you guessing a wait. It does not magically eliminate maintenance — it relocates it from "fix selectors" to "tune objectives" — but the relocation is often a net win for end-to-end tests that change shape frequently.

If you want the conceptual background before the mechanics, the [BrowserBash learn hub](https://browserbash.com/learn) covers how agent-driven automation differs from scripted runs. This article assumes you already buy the premise and want the migration path.

## What "AI browser automation" actually does

Before mapping commands, be precise about what replaces them. With BrowserBash you install one CLI:

```bash
npm install -g browserbash-cli
browserbash run "go to the staging store, log in as the demo user, add any item to the cart, complete checkout, and confirm the page shows 'Thank you for your order!'"
```

That single objective replaces what might be 40 lines of Cypress. An AI agent reads the objective, looks at the actual rendered page, decides the next action (type, click, scroll, navigate), performs it in a real Chrome or Chromium browser, observes the result, and repeats until it can return a verdict. The output is not just "done" — it is a structured pass/fail result plus the reasoning trail, which matters because your CI gate needs a boolean, not prose.

Two facts make this practical for a Cypress refugee. First, it is **Ollama-first**: by default BrowserBash uses a free local model, so no API keys leave your machine and your model bill is genuinely zero. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so you can start fully local and upgrade only the hard flows. Second, it returns **CI-grade exit codes** in agent mode (more on that below), so it slots into the same pipeline stage your `cypress run` lived in.

One honest caveat up front, because it changes how you migrate: very small local models (roughly 8B parameters and under) get flaky on long, multi-step objectives — exactly the kind of end-to-end flow you are most tempted to move. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for your hardest flows. Plan your migration around that reality rather than against it.

## Mapping Cypress commands to AI objectives

Here is the core translation table. Read it as "the *intent* behind the Cypress command, expressed as something you say to an agent instead of code you write."

| Cypress pattern | What it does | AI objective equivalent |
| --- | --- | --- |
| `cy.visit('/login')` | Navigate to a URL | "go to the login page" (or include the URL in the objective) |
| `cy.get('[data-cy=email]').type(...)` | Find element, enter text | "enter `{{email}}` in the email field" |
| `cy.contains('Sign in').click()` | Click by visible text | "click the Sign in button" |
| `cy.get('.cart-count').should('have.text','1')` | Assert DOM state | "confirm the cart shows 1 item" |
| `cy.url().should('include','/dashboard')` | Assert navigation | "verify you land on the dashboard" |
| `cy.intercept('POST','/api/order')` | Stub/spy network | partial — verify the *outcome*, not the call (see below) |
| Custom command `cy.login()` | Reusable step block | `@import` a shared Markdown test fragment |
| `fixtures/user.json` | Test data | `{{variables}}` with secret masking |

The pattern is consistent. Anything that is about **observable behavior a human could verify** translates cleanly: typing, clicking, reading text, checking that you ended up on the right page. Anything that reaches *under* the UI to assert on implementation details — intercepted request bodies, spied function calls, DOM internals — translates poorly or not at all, because the agent works from what is rendered, the same as a user.

### Selectors: cy.get and cy.contains become descriptions

This is the headline change. In Cypress you write `cy.get('#checkout-btn')`. In an objective you write "click the checkout button." You describe the element the way you would point at it for a colleague over their shoulder, not the way the DOM identifies it.

The upside is obvious: when the engineering team renames `#checkout-btn` to `#place-order`, the Cypress test breaks and the objective does not, because "the checkout button" is still the checkout button. The downside is real too: ambiguity. If your page has three buttons that could plausibly be "the submit button," the agent has to guess, and a weaker model guesses wrong. The fix is to write objectives the way you would write a good bug report — specific, anchored to visible text or position. "Click the green 'Place order' button at the bottom of the cart summary" beats "click submit."

### Assertions: should() becomes a verdict, not a chain

Cypress assertions are chained and granular: `.should('be.visible')`, `.should('have.text', 'X')`, `.should('have.class', 'active')`. AI objectives fold assertions into the natural-language outcome. Instead of three `.should()` chains you write one sentence: "confirm the order succeeded and the confirmation page shows the order number." The agent verifies the user-visible truth and returns pass or fail.

You lose fine-grained control over *which* assertion failed in the same call. You gain a check that reads like a requirement instead of like DOM archaeology. For end-to-end gates this is usually the right trade. For a unit-ish test that needs to assert a specific class toggled, Cypress is still better, and you should keep it.

## Handling cy.intercept and network logic honestly

This is the part most migration guides hand-wave, so let me be blunt. `cy.intercept` does two distinct jobs, and they migrate very differently.

**Job one: stubbing.** You intercept `GET /api/products` and return a fixture so the test is deterministic and offline. AI browser automation does not stub network calls for you. The agent drives a real browser against a real backend. If you depend on stubbed responses to make a flow deterministic, that determinism does not come along for free in the agent model — you either point the agent at a seeded test environment or a mock server you stand up yourself.

**Job two: spying/asserting.** You intercept a request to assert it fired with the right payload. This is testing an implementation detail, and the AI equivalent is to verify the *visible outcome* instead. Rather than asserting `POST /api/order` was called with `{total: 49.99}`, you verify the confirmation screen shows the order total of $49.99. That is arguably a better test — it checks what the user experiences, not what the code happens to do internally — but it is genuinely different, and if your test's entire reason for existing was to assert a request shape, that test should stay in Cypress (or move to an API-level test).

The honest summary: migrate intercepts that were really UI-outcome checks in disguise. Keep intercepts that do true network stubbing or contract assertion, or move them to a dedicated API test layer. Do not pretend the agent stubs your network — it does not. For deeper examples of how outcome-based verification reads in practice, the [BrowserBash blog](https://browserbash.com/blog) has flow-by-flow walkthroughs.

## Replacing custom commands and fixtures

Mature Cypress suites lean on two things AI objectives need an answer for: reusable steps (`cy.login()`, `cy.seedCart()`) and test data (fixtures). BrowserBash answers both with committable Markdown tests.

A Markdown test is a `*_test.md` file where each list item is a step. It is plain text, lives in your repo, and survives code review like any other file. Here is a login flow that mirrors a Cypress custom command:

```bash
# login_test.md
# Each list item below is one step the agent performs.
```

```markdown
# Login smoke test

- Go to {{baseUrl}}/login
- Enter {{email}} in the email field
- Enter {{password}} in the password field
- Click the Sign in button
- Confirm the dashboard loads and shows "Welcome back"
```

Run it with:

```bash
browserbash testmd run ./login_test.md \
  --var baseUrl=https://staging.example.com \
  --var email=demo@example.com \
  --secret password=$DEMO_PASSWORD
```

Three Cypress concepts map directly here:

- **Custom commands → `@import` composition.** Put your login steps in `login_test.md` and `@import` it at the top of every test that needs a logged-in session. That is your `cy.login()` equivalent, except it is readable by a non-engineer.
- **Fixtures → `{{variables}}`.** Templated variables replace fixture files for the data your flow needs. You pass them at the command line or from a CI secret store.
- **Secrets handling.** Variables marked as secret are masked as `*****` in every log line, so a password never lands in your CI output. Cypress can do this with effort; here it is the default behavior.

After each run BrowserBash writes a human-readable `Result.md` next to your test, which is the artifact you attach to a ticket or paste into a stand-up. It is the verdict plus what happened, in prose a product manager can read.

### What you give up moving fixtures to variables

Fixtures can be large structured JSON blobs that Cypress loads and reuses across assertions. Variables are simpler — strings you template into steps. If your tests depend on rich fixture objects with nested data the test then asserts against, that structure does not survive the move cleanly. For credentials, URLs, and simple parameters, variables are plenty. For complex data-driven matrices, you may want to keep that logic in Cypress or generate per-row objectives programmatically.

## Wiring AI tests into CI the way cypress run did

A migration is pointless if it cannot gate a pull request. Cypress gives you `cypress run` with a non-zero exit on failure. BrowserBash gives you agent mode, which is built for exactly this.

```bash
browserbash run "log in and confirm the dashboard loads" \
  --agent --headless
echo "exit code: $?"
```

`--agent` emits **NDJSON** — one JSON event per line on stdout — so your pipeline (or an AI coding agent) parses structured events instead of scraping prose. The exit codes are the contract:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

That maps onto your existing CI gate with zero ceremony. Wherever your `.yml` ran `cypress run` and checked the exit code, it now runs `browserbash run ... --agent` and checks the same code. `--headless` keeps it off-screen on the runner, exactly like Cypress headless mode.

For debugging a failed CI run, add recording:

```bash
browserbash run "complete checkout and verify the thank-you page" \
  --agent --headless --record
```

`--record` captures a screenshot and a full `.webm` session video via ffmpeg on any engine. On the builtin engine you also get a Playwright trace you can open in the trace viewer — which will feel familiar if you ever used Cypress's video and snapshot artifacts to debug a CI red. The replacement for "open the Cypress dashboard and watch the run" is the optional, opt-in cloud dashboard via `browserbash connect` and `--upload`, or a fully local `browserbash dashboard` if you would rather nothing leave your machine.

## A realistic migration plan: triage, don't lift-and-shift

The worst way to do this is to mechanically rewrite all 400 Cypress tests as objectives in a weekend. You will burn time on tests that should never have moved. Sort first.

### Step 1: Bucket your suite

Go through your specs and tag each test:

- **Green (migrate first):** End-to-end user journeys that touch real UI and verify user-visible outcomes — login, signup, checkout, search, onboarding. These are where selector churn hurts most and where objectives shine. Move these first.
- **Yellow (migrate selectively):** Tests with some network stubbing that is really outcome verification, or data-driven tests with simple parameters. Rewrite the assertion to check the visible result; keep the data in variables.
- **Red (keep in Cypress):** Tests that assert request payloads, spy on functions, check specific DOM classes or computed styles, or depend on heavy fixtures. These are testing implementation, and the agent model is a poor fit. Leaving them in Cypress is the correct call, not a failure.

Be ruthless. A suite that is 60% green, 25% yellow, 15% red after migration is a healthy outcome. Trying to push everything green produces brittle objectives that flake worse than the selectors you left behind.

### Step 2: Translate one green test end to end

Pick your most-painful, most-flaky green test and rewrite it as a Markdown test. Run it locally on a mid-size local model. Tune the objective wording until it passes reliably across three or four runs. This first translation teaches you how specific your objectives need to be for *your* app's UI. Every later test goes faster.

### Step 3: Pin a model per flow

Run your green tests on a free local model first. Where a long flow flakes — and some will, especially on small models — promote just that flow to a stronger model. BrowserBash's auto-resolution makes this a matter of which key is present, and OpenRouter offers genuinely free hosted models such as `openai/gpt-oss-120b:free` if you want more capability without a bill. Keep the cheap default everywhere it works; pay (or spend bigger local compute) only where you must.

### Step 4: Swap the CI gate per test, not all at once

Run both suites in parallel during transition. As each migrated test proves stable for a week, delete its Cypress counterpart. This keeps you safe — you never have a window where a flow is untested — and it makes the rollback obvious if a migrated test misbehaves.

## Cypress vs AI browser automation: when to use which

Here is the balanced version, because the honest answer is "both, for different jobs."

| Dimension | Cypress | AI browser automation (BrowserBash) |
| --- | --- | --- |
| Test authoring | JavaScript, selectors, commands | Plain-English objectives |
| Resilience to UI change | Low — selectors break | High — no selectors |
| Network stubbing | First-class (`cy.intercept`) | Not provided; needs real/seeded env |
| Implementation assertions | Strong (spies, DOM internals) | Weak by design |
| Determinism | High (stubs, retries) | Model-dependent; tune for it |
| Language lock-in | JavaScript/TypeScript | Language-agnostic |
| CI integration | `cypress run` exit codes | `--agent` NDJSON + exit codes |
| Cost | Free OSS; paid dashboard tiers | Free OSS; $0 on local models |
| Best for | Component tests, contract checks, stubbed flows | E2E journeys, smoke tests, cross-team-readable flows |

**Choose Cypress** when you need network stubbing, you are asserting on implementation details, your team is comfortable in JavaScript, and your UI is stable. Component testing in particular has no good agent equivalent — keep it.

**Choose AI browser automation** when your end-to-end tests flake on selectors and waits, you want non-engineers to read and even write tests, you need the suite to survive frequent redesigns, and you can run flows against a real or seeded environment. The language-agnostic part matters more than it sounds: a Python shop, a Go shop, and a no-code QA team all write the same plain-English objective, so the suite stops being hostage to one runtime. If you are weighing this against other agent tools, the [BrowserBash pricing page](https://browserbash.com/pricing) and the [case studies](https://browserbash.com/case-study) give a grounded sense of where it lands.

## Common migration mistakes to avoid

A few traps I have watched teams fall into:

- **Writing vague objectives.** "Test the checkout" is not an objective. "Add the $20 item to the cart, enter the test card 4242 4242 4242 4242, place the order, and confirm 'Thank you for your order!' appears" is. Specificity is the new selector discipline.
- **Expecting stubs for free.** If your green tests secretly relied on stubbed APIs for speed and determinism, point them at a seeded staging environment before you blame the agent for flakiness.
- **Migrating red tests anyway.** The pull to get to "100% migrated" is strong. Resist it. A spy assertion does not become a good objective; it becomes a bad one.
- **Starting on a tiny model.** An 8B model will struggle on a ten-step checkout and you will wrongly conclude the approach does not work. Start green tests on a mid-size local model, then optimize down only where it holds.
- **Big-bang cutover.** Delete Cypress tests one at a time as their replacements prove stable, never in bulk.

Get those right and the migration is undramatic, which is the goal. You can grab the CLI from [npm](https://www.npmjs.com/package/browserbash-cli) or read the source on [GitHub](https://github.com/PramodDutta/browserbash) if you want to see exactly how the agent loop and engines work before committing.

## FAQ

### Can I migrate Cypress tests to AI without losing CI pass/fail gates?

Yes. BrowserBash's agent mode (`--agent`) returns the same kind of exit codes your CI already checks: 0 for passed, 1 for failed, 2 for error, 3 for timeout. Wherever your pipeline ran `cypress run` and gated on the exit code, you swap in `browserbash run ... --agent --headless` and gate on the same code, so the pull-request gate behaves identically.

### Does AI browser automation support cy.intercept-style network stubbing?

No, not as a built-in. The agent drives a real browser against a real backend, so it does not stub or mock network responses for you. If a Cypress test only used `cy.intercept` to verify a user-visible outcome, rewrite it to check that outcome on screen. If it did genuine stubbing or contract assertion, keep that test in Cypress or move it to a dedicated API-level test.

### How do I handle login and reusable steps after migrating from Cypress?

Use Markdown tests with `@import` composition. Put your login steps in a `login_test.md` file and `@import` it into every test that needs an authenticated session, which is the direct equivalent of a `cy.login()` custom command. Credentials go in `{{variables}}` marked as secret, so they are masked as `*****` in every log line.

### Is BrowserBash free, and does it cost money to run migrated tests?

The CLI is free and open-source under Apache-2.0, and it is Ollama-first, so it defaults to free local models with no API keys. That means you can run migrated tests with a genuine $0 model bill. Optional hosted models (OpenRouter or Anthropic with your own key) are there for your hardest flows, and there is even a free hosted option such as `openai/gpt-oss-120b:free` if you want more capability without paying.

Ready to move your flakiest flows off selectors? Install the CLI with `npm install -g browserbash-cli`, rewrite one green test as a Markdown objective, and run it locally today. No account is needed to get started — though if you want run history and video replay later, you can opt in at [browserbash.com/sign-up](https://browserbash.com/sign-up).
