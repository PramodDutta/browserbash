---
title: Test Mobile Forms and Input Keyboards With Plain-English AI
description: "A practical guide to mobile form testing with plain-English AI: fill flows by intent, check input-mode keyboards, and stay honest about native overlays."
date: 2026-08-09
category: guide
---

Mobile form testing is the part of QA that quietly breaks the most and gets automated the least. A signup screen that works flawlessly on a 1280px desktop can fall apart on a 390px phone: the numeric keypad never shows up for the phone field, the "Done" button hides behind the software keyboard, autocorrect mangles the email, and the submit button scrolls out of reach. You can write plain-English objectives that drive a real browser through those flows by intent, and this guide walks through how to do it with BrowserBash without hand-writing a single selector.

The core idea is simple. Instead of encoding `page.locator('#phone').fill('...')` and hoping the id survives the next redesign, you describe the outcome: "type the phone number into the phone field and confirm the numeric keypad appears." An AI agent reads that, drives a live Chromium instance, and returns a deterministic verdict. That shift matters most on mobile, where the fragile parts are rarely the field ids and almost always the layout, viewport, and keyboard behavior selector-based scripts never look at.

## Why mobile forms break where desktop forms don't

Desktop form tests are forgiving. There is usually enough screen height that nothing overlaps, the physical keyboard never covers the page, and `inputmode` is irrelevant because everyone types on the same hardware. Move the same form to a phone viewport and three new failure classes appear at once.

First, the software keyboard steals half the screen. On a 390x844 viewport, an on-screen keyboard can eat 300px of vertical space, and a "Continue" button pinned to the bottom ends up hidden behind it. Users report "the button doesn't work" when the real problem is that it is not reachable. Second, `inputmode` and `type` attributes decide which keyboard the OS shows. A phone field marked `type="text"` gives users the full QWERTY keyboard instead of a number pad, a real usability defect even though the field still "works" in a functional sense. Third, autocorrect and autocapitalize quietly corrupt input. An email field without `autocapitalize="none"` can turn `jane@work.com` into `Jane@work.com` on some mobile browsers, and your backend validation rejects it.

None of these show up in a headless desktop run. They only surface when you test at a real phone viewport, with a browser that renders the same box model a phone would. That is the gap mobile form testing has to close, and it is why "does the field accept text" is the wrong question. The right question is "can a thumb actually complete this form on a small screen."

### The selector problem multiplies on mobile

Selector-based mobile suites carry a second tax. Responsive designs frequently ship a separate DOM for small screens: a hamburger menu instead of a nav bar, a stacked form instead of a two-column layout, sometimes a different component tree behind a breakpoint. Your desktop selectors do not transfer, and you maintain two locator sets that drift apart over time. Describing intent sidesteps this. "Open the menu and go to the signup form" resolves against whatever the mobile DOM actually renders, so one plain-English test covers both layouts as long as the user-facing flow is the same.

## How plain-English AI testing changes the workflow

With BrowserBash you write an objective in English, and the agent plans and executes the steps against a real browser. No page objects, no waits to tune, no selector guessing. You install once and describe what to validate.

```bash
npm install -g browserbash-cli

browserbash run "Open https://demo.app/signup on a phone viewport, type +1 415 555 0199 into the phone number field, and confirm a numeric keypad or numeric input mode is used for that field" \
  --viewport 390x844 \
  --agent
```

The `--viewport 390x844` flag renders the page at an iPhone-class size, both engines respect it, and the objective tells the agent what "correct" looks like. The `--agent` flag emits NDJSON, one JSON event per line, so CI or an AI coding agent reads the verdict without parsing prose. Exit codes are frozen: `0` passed, `1` failed, `2` error, `3` timeout.

By default BrowserBash is Ollama-first. It looks for a local model before any hosted key, so nothing has to leave your machine for the simple flows. The resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, so you start free and scale up only for the hard flows. One honest caveat: very small local models (roughly 8B and under) get flaky on long multi-step objectives. For a five-field mobile signup with conditional validation, a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, is the sweet spot. The [learn hub](https://browserbash.com/learn) goes deeper on model selection.

### Describing input-mode behavior by intent

The trick to testing keyboards is describing what the keyboard implies rather than screenshotting the OS keyboard itself. A browser does not render the native OS keyboard into the page DOM. What it does expose is the `inputmode` attribute, the `type` attribute, and the field's `pattern`, and those are exactly the signals that tell the mobile OS which keyboard to raise. So you test the cause, not the visual effect.

An objective like "confirm the phone field uses numeric input mode and the email field disables autocapitalization" is checkable against the DOM the agent can read. That is the honest boundary: BrowserBash tests the web page's intent signals for the keyboard, not a pixel capture of iOS or Android's native keyboard overlay. For the vast majority of input-mode bugs, testing the attribute is the correct and sufficient check, because the attribute is what drives the keyboard.

## Turning fuzzy checks into deterministic assertions

Agent judgment is great for "does this flow make sense," but for a regression suite you want conditions that either held or did not, with evidence. That is what Verify steps are for. In a committable `*_test.md` file, a `Verify` line compiles to a real Playwright check with no LLM judgment. A pass means the condition held; a fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable Result.md assertion table.

Here is a mobile signup test mixing agent-driven fills with deterministic verification:

```markdown
# Mobile signup keyboard and layout

- Open https://demo.app/signup
- Type jane@work.com into the email field
- Type +1 415 555 0199 into the phone field
- Tap the Create account button

Verify: text "Check your inbox" is visible
Verify: 'Create account' button visible
Verify: url contains /welcome
```

Run it at a phone viewport with secret masking intact:

```bash
browserbash testmd run ./tests/mobile-signup_test.md --viewport 390x844
```

The plain-English steps handle the parts that need interpretation, like finding the right field on a stacked mobile layout, and the `Verify` lines lock down the outcomes that must not regress. Verify supports URL contains, title is or contains, text visible, named button/link/heading visible, element counts, and stored-value equality. If you write a Verify line outside that grammar, it still runs, but agent-judged and flagged `judged: true`, so you always know which assertions were deterministic. That distinction is the difference between a suite you trust in CI and one you babysit. The [features overview](https://browserbash.com/features) lists the full grammar.

### Testing across multiple phone sizes at once

One viewport is rarely enough. A form that fits on a 430px Pro Max can overflow on a 360px budget Android. The viewport matrix runs every test once per screen size and labels the results so you see exactly which size failed.

```bash
browserbash run-all ./tests \
  --matrix-viewport 360x800,390x844,430x932 \
  --junit out/junit.xml
```

Each test executes three times, once per viewport, and every event, JUnit case, and Result.md row is labeled with the viewport it ran under. When the 360px slice fails and the other two pass, you have a precise reproduction: same flow, same assertions, only the screen size changed. That is far more actionable than a single "form test failed" line.

## Building a realistic mobile form suite

A production mobile form suite needs more than one happy-path test. Real forms have conditional fields, server-driven validation, and states that only appear after a backend responds. testmd v2 gives you the structure. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session, with two deterministic step types that never call a model: API steps for seeding data and Verify steps for checking it through the UI.

```markdown
---
version: 2
---

# Returning user sees prefilled mobile checkout

POST https://api.demo.app/test/users with body {"email": "jane@work.com", "plan": "pro"}
Expect status 201, store $.id as 'userId'

- Open https://demo.app/checkout?u={{userId}}
- Confirm the email field is prefilled with jane@work.com

Verify: text "Pro plan" is visible
Verify: 'Pay now' button visible
```

The API step seeds a user through the backend, stores the returned id, and the UI steps verify that the mobile checkout reflects it. This hybrid pattern is how you test forms that depend on real state without clicking through five setup screens every run. One honest limitation: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. For pure agent-judged runs at a viewport you stay fully local; for the deterministic API-plus-Verify hybrid you bring a key.

### Reusing a logged-in session

Half of mobile form testing lives behind a login: profile edits, saved addresses, payment forms. Logging in on every test is slow and, with OTP or magic links, sometimes impossible to script cleanly. Save the session once, reuse it everywhere.

```bash
browserbash auth save mobileuser --url https://demo.app/login
# a browser opens, you log in once, press Enter to save

browserbash testmd run ./tests/edit-profile_test.md \
  --auth mobileuser \
  --viewport 390x844
```

`auth save` opens a real browser, you log in by hand once, and pressing Enter stores the Playwright storageState. From then on, `--auth mobileuser` on run, testmd, run-all, or monitor reuses it. If the saved profile's origins do not cover the start URL of a test, BrowserBash prints a warning instead of silently doing nothing, so a stale profile fails loud. You can also set `auth:` in a test file's frontmatter to bind a suite to a profile permanently.

## Migrating an existing Playwright mobile suite

If you already have a Playwright mobile project, you do not have to rewrite it by hand. The importer converts specs to plain-English `*_test.md` files heuristically, deterministically, and with no model in the loop, so the same input always produces the same output.

```bash
browserbash import ./e2e/mobile --out ./tests
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common `expect` assertions. `process.env.X` references become `{{X}}` variables so your templating carries over. Anything it cannot translate cleanly is not dropped or invented: it lands in an `IMPORT-REPORT.md` so you see exactly what needs a human pass. An importer that silently guesses at untranslatable code produces tests that lie, and a mobile suite full of quietly-wrong tests is worse than no suite. Read the migration notes in the [tutorials](https://browserbash.com/tutorials) before a large import.

### Recording a flow instead of writing it

For a form you have never automated, the recorder is often faster than writing objectives. Run it against your URL, click through the mobile flow once, and Ctrl-C writes a plain-English test.

```bash
browserbash record https://demo.app/signup --out ./tests/signup_test.md
```

Password fields are handled safely: the value never leaves the page. The capture script sends only a secret marker, and the generated step reads `Type {{password}} into ...` so your recording never bakes a real credential into a committed file. You get a first-draft test in the time it takes to fill the form once, then add `Verify` lines to harden the outcomes that matter.

## Comparing the approaches

It helps to see where plain-English AI testing sits against the alternatives you might already run. This is not a claim that BrowserBash wins every row, just a map of tradeoffs so you can pick the right tool per job.

| Capability | Selector-based Playwright/Cypress | Manual device testing | BrowserBash plain-English AI |
| --- | --- | --- | --- |
| Test authoring | Write and maintain selectors | No code, real fingers | Describe intent in English |
| Survives responsive redesign | Brittle, dual selector sets | N/A, human adapts | Resolves against live DOM |
| Viewport matrix | Manual config per size | One device at a time | `--matrix-viewport` in one run |
| Input-mode / keyboard check | Assert attributes manually | Sees real OS keyboard | Checks intent signals by objective |
| Native OS keyboard pixels | No | Yes | No, tests the driving attribute |
| Deterministic assertions | Yes, native | No | Yes, via Verify steps |
| Runs in CI headless | Yes | No | Yes, `--agent` NDJSON |
| Cost at scale | Free, high maintenance | High human time | Free local models, replay cache |

The honest reading: if you need to verify how the actual iOS keyboard renders pixel-for-pixel, real-device manual testing or a device cloud is the right fit, and BrowserBash does not replace it. If you are testing that the form's intent signals, layout, and flow behave correctly across viewports in CI, plain-English AI testing removes most of the maintenance tax that makes selector suites rot. Many teams run both. The [case studies](https://browserbash.com/case-study) show how that split plays out in practice.

### When to choose plain-English AI testing

Reach for this approach when your mobile forms change often, when you maintain parallel desktop and mobile layouts, or when your selector suite spends more time being repaired than catching bugs. It shines for flows where the outcome is stable but the DOM is not: signup, checkout, profile edits, multi-step wizards. It is also a strong fit when an AI coding agent is writing your app, because the agent validates its own work through the same MCP tools your CI uses.

### When another tool fits better

Be clear-eyed about the edges. If your bug is specifically about the native OS keyboard rendering, predictive text, or platform gesture behavior, you need a real device or a device cloud, not a browser-driven agent. If you have a mature, stable Playwright suite that rarely breaks and your team is fluent in it, ripping it out buys you little. And if you require zero model latency on every single step, a pure selector suite will always be faster than any agent loop, though the replay cache narrows that gap for unchanged flows.

## Wiring it into CI and monitoring

Tests only pay off when they run without you. Two features carry mobile form suites into production. Sharding splits the suite across parallel machines with no coordination: `run-all --shard 2/4` runs a deterministic slice computed on sorted discovery order, so four CI machines each take a quarter and agree without talking to each other. Cost governance caps spend: `--budget-usd` stops launching new tests once the suite crosses the budget, reports the rest as skipped, and exits `2`.

```bash
browserbash run-all ./tests \
  --shard 2/4 \
  --budget-usd 2.00 \
  --matrix-viewport 360x800,390x844 \
  --junit out/junit.xml
```

For a form that must keep working, monitor mode watches it on an interval and alerts only on state changes. It does not spam you on every green run. It fires when a passing flow starts failing and again when it recovers.

```bash
browserbash monitor ./tests/mobile-signup_test.md \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX
```

Slack webhook URLs get Slack formatting automatically; other URLs get the raw JSON payload. Because the replay cache records a green run's actions and replays them on the next identical run with zero model calls, an always-on monitor is nearly token-free until the page actually changes, at which point the agent steps back in to re-verify.

### Letting your AI agent test its own forms

If you build with Claude Code, Cursor, Windsurf, Codex, or Zed, the MCP server turns BrowserBash into a validation layer your agent calls directly. One line wires it in:

```bash
claude mcp add browserbash -- browserbash mcp
```

That exposes `run_objective`, `run_test_file`, and `run_suite` as MCP tools. Each returns the structured verdict JSON: status, summary, final_state, assertions, cost_usd, duration_ms. When your agent finishes a mobile checkout component, it can validate the form at a phone viewport before it reports done. A failed test is a successful validation here: the tool call succeeds and the agent reads the verdict to decide what to fix. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, and the integration guide lives on [GitHub](https://github.com/PramodDutta/browserbash).

## A sensible rollout plan

Start narrow. Pick your single highest-value mobile form, usually signup or checkout, and write one plain-English test with two or three `Verify` lines at a 390x844 viewport. Run it locally against a free model to prove the flow resolves, then add a second and third viewport with `--matrix-viewport`. Once the happy path is green, layer in edge cases: an invalid email that should be rejected, a phone field that should raise numeric input, a submit button that must stay reachable above the keyboard fold.

When the suite has real coverage, move it into CI behind `run-all` with a budget cap, shard it across your runners, and put a monitor on the one flow that would cost you money if it broke silently. If you already run Playwright, import that suite first and treat the `IMPORT-REPORT.md` as your to-do list. Keep a thin manual pass on real hardware for device-specific bugs, because no browser-driven agent sees the native keyboard the way a thumb does.

The payoff compounds. Selector suites get more expensive as your app changes, because every redesign breaks locators. Intent-based tests get cheaper, because a description of the outcome survives a redesign a CSS selector never would. On mobile, where layouts fork and viewports multiply, that difference is the whole game.

## FAQ

### Can AI test which mobile keyboard a form field shows?

It tests the signals that decide the keyboard, not a pixel capture of the native OS keyboard. A browser does not render the iOS or Android keyboard into the page DOM, so BrowserBash checks the `inputmode`, `type`, and `pattern` attributes that tell the mobile OS which keyboard to raise. For nearly every input-mode bug that is the correct check, because the attribute is what drives the keyboard. If you need to verify the native keyboard's exact rendering, use a real device or a device cloud.

### How do I test a form at a real phone screen size?

Add the `--viewport` flag with a phone-class size, for example `--viewport 390x844`, and the page renders at that dimension in a real Chromium instance. Both engines respect the flag on single runs. To cover several phone sizes in one pass, use `--matrix-viewport` with a comma-separated list on `run-all`, which executes every test once per size and labels each result so you can see exactly which screen failed.

### Do I need API keys to run mobile form tests?

Not for the basic agent-driven flows. BrowserBash is Ollama-first and defaults to free local models, resolving to a local model before any hosted key so nothing leaves your machine. Very small local models under about 8B can be flaky on long multi-step forms, so a mid-size local model or a hosted model is the sweet spot for hard flows. The one exception is testmd v2 with API steps, which currently needs the builtin engine and an Anthropic key or compatible gateway.

### Will my existing Playwright mobile tests transfer?

Yes, through the importer, which converts Playwright specs to plain-English test files deterministically with no model in the loop. It translates common actions and locators and turns environment variables into templated variables. Anything it cannot translate cleanly is written to an IMPORT-REPORT.md rather than dropped or guessed at, so you get an honest list of what still needs a human pass instead of tests that silently misbehave.

Mobile forms are where small screens, software keyboards, and forked layouts conspire to break flows that look fine on a desktop. Testing them by intent, at real viewports, with deterministic assertions where it counts, catches the bugs your selector suite never looks for. Install with `npm install -g browserbash-cli` and write your first plain-English mobile test today. If you want the optional free cloud dashboard for run history, [sign up here](https://browserbash.com/sign-up). An account is optional, and everything on your machine stays free.
