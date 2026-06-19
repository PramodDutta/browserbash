---
title: Migrating from Selenium to Cypress: Step-by-Step (and the Catch)
description: "A practical selenium to cypress migration guide: map your patterns step by step, hit Cypress's real architecture limits, and weigh a no-rewrite third path."
date: 2026-05-22
category: guide
---

A selenium to cypress migration usually starts the same way: someone is tired of flaky waits, brittle WebDriver setups, and a Grid that falls over the morning of a release. Cypress looks like the cure. The developer experience is genuinely good, the time-travel debugger is a joy, and the automatic waiting kills off most of the `Thread.sleep` cruft you have been carrying for years. I have moved suites in this direction and watched teams get real value from it. But there is a catch, and it is not a small one. Cypress made architectural choices that buy you that smooth experience by closing off whole categories of things Selenium does without blinking. If your suite leans on any of those, a clean port turns into a rewrite plus a pile of workarounds.

This guide does three things. It maps Selenium patterns to their Cypress equivalents so you can plan the work honestly. It tells you plainly where Cypress's browser and architecture limits will bite, so you do not discover them three weeks into the project. And it offers a third path for teams who want to leave Selenium behind without rewriting hundreds of tests into a new framework's idioms at all. By the end you should know whether to commit to Cypress, stay on Selenium, or sidestep the framework question entirely.

## Why teams leave Selenium in the first place

Before mapping anything, be clear about what you are actually trying to fix. Most Selenium pain falls into a few buckets, and naming yours tells you whether Cypress is even the right target.

The big one is flakiness. Selenium is a W3C WebDriver client that lives *outside* the browser and sends commands over a network protocol. That out-of-process model gives Selenium its reach across languages and browsers, but it also means your test code and the browser are never perfectly in sync. You compensate with explicit waits, `WebDriverWait`, expected conditions, and the occasional desperate `sleep`. When those waits are tuned wrong, tests flake.

The second bucket is infrastructure: running Selenium at scale means a Grid, or a paid cloud grid, plus driver-version juggling every time Chrome auto-updates. The third is developer experience: a failed run gives you a stack trace and maybe a screenshot, and you reproduce it by re-running the whole thing and squinting.

Cypress addresses all three head-on, and that is exactly why it is attractive. It runs in the same run loop as your application, so it has native access to the DOM and the window object. Commands like `cy.get()` and `.click()` automatically retry until the element reaches an actionable state, which eliminates most explicit waits. It installs as an npm dependency with no separate driver, and the runner gives you a time-traveling visual log of every command. If your pain is flakiness, driver management, and debugging on a JavaScript front end, Cypress is a legitimate answer. If your pain is something else, keep reading, because the catch section may change your mind.

## The architecture difference that explains everything

Almost every difference you will hit during a selenium to cypress migration traces back to one decision. Selenium drives the browser from the outside through WebDriver. Cypress runs *inside* the browser, in the same event loop as the app under test.

That single fact is the source of all the good parts. Native DOM access, no network round-trip per command, automatic waiting, the ability to stub network requests and read application state directly — all of it falls out of being in-process. It is also the source of every limitation. Because Cypress lives inside one browser tab's JavaScript context, anything that requires stepping *outside* that context is hard or impossible: a second tab, a truly separate origin, a non-Chromium engine, or a language that is not JavaScript.

Keep this mental model handy. When you hit a wall later in this guide, the wall is almost always "Cypress is in the browser, and what you want lives outside the browser." It is not a missing feature they will ship next quarter. It is the shape of the tool.

## Step 1: Inventory before you port anything

Do not open a Cypress file yet. Open a spreadsheet. The single biggest mistake in a migration is starting with the easy tests and discovering the dealbreakers when half the suite is already converted.

Go through your Selenium suite and tag every test against the catch list from later in this article: does it use multiple tabs or windows? Does it cross to a different origin (a third-party login, a payment gateway, an SSO redirect)? Does it touch a cross-origin iframe? Does it drive a non-Chromium browser you care about? Does it rely on a language-specific library — a Java PDF parser, a C# database fixture — that you would have to replace?

Score each test: clean port, port with workaround, or blocked. Now you have a real map instead of optimism. Most suites split into a large majority of clean ports, a chunk that need workarounds, and a stubborn tail that is genuinely blocked. That tail is the whole decision. If it is small and low-value, migrate and delete it. If it covers your payment flow and your SSO, you have a problem Cypress will not solve — and you should know that on day one.

## Step 2: Map Selenium concepts to Cypress

For the tests that *can* move, the day-to-day translation is mostly mechanical once you internalize a few shifts. Here is the mapping that covers the bulk of real suites.

| Selenium pattern | Cypress equivalent | What actually changes |
| --- | --- | --- |
| `driver.get(url)` | `cy.visit(url)` | Cypress assumes one app under test; set `baseUrl` in config |
| `driver.findElement(By.css(...))` | `cy.get(selector)` | Returns a chainable subject, not a raw element; auto-retries |
| `WebDriverWait` + expected conditions | (built in) | Most explicit waits disappear; Cypress retries assertions |
| `element.click()` / `.sendKeys()` | `.click()` / `.type()` | Chained off `cy.get`; waits for actionability automatically |
| Page Object Model classes | Custom commands / app actions | POM still works, but `Cypress.Commands.add` is more idiomatic |
| `driver.switchTo().frame()` | `cy.iframe()` plugin or `.its('0.contentDocument')` | No first-class iframe support; see the catch |
| Explicit assertions in test code | `.should('...')` / `expect` | Assertions retry until they pass or time out |
| File upload via `sendKeys(path)` | `.selectFile(path)` | Built-in command, cleaner than the Selenium trick |
| TestNG / JUnit / pytest runner | Mocha + Chai (bundled) | Test structure becomes `describe`/`it`; one runner, no choice |
| Network interception (proxy hacks) | `cy.intercept()` | A genuine upgrade — stub and assert on requests natively |

A few deserve a word. The waiting shift is the one people underestimate in a good way: a large share of a Selenium suite's line count is wait plumbing, and most of it simply evaporates. Cypress retries the *last* command and its assertion until they pass, so `cy.get('.cart-count').should('have.text', '3')` keeps checking until the cart updates or the timeout hits.

The shift people underestimate in a *bad* way is the language and runner change. Selenium lets you write tests in Java, Python, C#, Ruby, or JavaScript and bring your whole ecosystem with you. Cypress is JavaScript and TypeScript only, on Mocha and Chai. If your team is a Java shop with shared fixtures, custom reporters, and CI plumbing built around JUnit, you are not porting tests — you are rebuilding tooling. Budget for it.

### Page objects, or not

If you have years of Page Object Model investment, you can keep that structure in Cypress; classes and methods work fine. But the idiomatic Cypress style leans toward custom commands (`Cypress.Commands.add('login', ...)`) and "app actions" that reach straight into application state to set up preconditions, bypassing the UI entirely. That is faster and less brittle, but it is a different mental model, and forcing your old POM shape onto Cypress can leave you with the worst of both. Decide deliberately rather than porting by reflex.

## Step 3: Rebuild your CI and parallelization expectations

Selenium parallelization usually means a Grid spreading tests across nodes, or a cloud grid you pay per minute. Cypress parallelizes differently. The open-source runner executes specs serially in a single process by default; to fan out across machines you either wire up your own sharding in CI or use the paid Cypress Cloud for orchestration, smart load-balancing, and the recording dashboard.

This is a real budget and architecture conversation, not a footnote. If your Selenium suite finishes in eight minutes across twenty Grid nodes, a naive Cypress port that runs serially can take far longer. Plan the parallelization story — CI matrix sharding, container fan-out, or Cypress Cloud — as part of the migration, not after it. Pricing and orchestration features for Cypress Cloud change over time, so check current terms rather than trusting an old blog figure.

## The catch: where Cypress will fight you

Here is the section the cheerful migration guides skip. These are not edge cases I am inventing to be contrarian. They are documented constraints that follow directly from Cypress running inside the browser. Map them against your Step 1 inventory.

### Multiple tabs and windows

Cypress does not support controlling more than one browser tab. This is by design — the runner runs inside a single tab to keep tests isolated and deterministic. If your Selenium test clicks a link that opens a new tab and asserts on it, there is no direct Cypress equivalent. The accepted workaround is to stop the new tab from opening at all: remove the `target="_blank"` from the anchor at runtime, or grab the `href` and `cy.visit()` it directly so everything stays in one tab. That works for "open in new tab" links. It does not work when the second window is genuinely separate and you need both alive at once.

### Cross-origin navigation

For years Cypress could only operate within a single origin per test, full stop. The `cy.origin()` command improved this a lot: you can now run commands against a second origin by wrapping them in a `cy.origin('https://auth.example.com', () => { ... })` block. That covers a real SSO or third-party-login flow far better than the old situation. But it is still more ceremony than Selenium's "just navigate there," it has rules about what can cross the boundary, and multi-origin flows remain a place where Cypress feels like it is working around its own architecture. If your suite hops across three or four origins in a single journey, expect friction.

### Iframes, especially cross-origin ones

Cypress has no first-class command for iframes. You reach into the iframe's `contentDocument` manually or lean on a community plugin like `cypress-iframe`. Same-origin iframes are workable. Cross-origin iframes — an embedded payment widget, a third-party booking module, an OAuth consent screen in a frame — run into browser security policies that Cypress, living in the page, cannot cleanly pierce. There are proxy and config workarounds floating around, but they are fragile and they are the kind of thing that breaks on a vendor update. Selenium, driving from outside via WebDriver, simply switches into the frame.

### Browser and engine coverage

Cypress supports Chrome-family browsers (Chrome, Chromium, Electron, and Chromium-based Edge) and Firefox. Safari's WebKit engine is supported only experimentally, behind an `experimentalWebKitSupport` flag, as of 2026. There is no real Internet Explorer story and no deep mobile-browser story. Selenium, by contrast, drives Chrome, Firefox, Edge, and Safari as first-class targets and reaches the long tail through the W3C WebDriver protocol. If your compliance matrix demands genuine Safari or a broad browser spread, Cypress narrows your coverage rather than widening it.

### Language lock-in

Cypress is JavaScript and TypeScript. If your organization standardized on Java or C# for tests — shared with the dev team, integrated into the same build, staffed by engineers who write that language — moving to Cypress is also a skills and staffing decision. That is not a knock on Cypress; it is a fact to price in.

None of this makes Cypress a bad tool. It makes Cypress a *specific* tool: superb for a single-origin, Chromium-first, JavaScript-front-end app, and increasingly awkward the further your reality drifts from that profile.

## A third path: no rewrite at all

Step back and ask what you actually want. For most teams it is not "Cypress specifically." It is "stop maintaining brittle selector scripts and flaky waits." Cypress is one answer. There is another that skips the framework rewrite entirely: describe what the test should do in plain English and let an AI agent drive a real browser to do it.

That is what [BrowserBash](https://browserbash.com/features) is — a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) command-line tool from The Testing Academy. You write an objective in plain language, and an agent drives a real Chrome browser step by step, with no selectors and no page objects, then returns a pass/fail verdict plus any structured values it extracted. There is nothing to port because there is no selector layer to port. A Selenium test that logs in, adds an item to the cart, and checks the total becomes one English sentence.

Install it and run a flow:

```bash
npm install -g browserbash-cli
browserbash run "Go to the demo store, log in as standard_user, add the first product to the cart, and confirm the cart badge shows 1"
```

Because the agent reads the page the way a person does, the kinds of changes that break a Selenium or Cypress selector — a renamed class, a reshuffled DOM — usually do not break a BrowserBash objective. That is the maintenance win, traded against the determinism a hand-written selector gives you. It is a genuinely different bet, and worth being honest about both sides.

### The model story, honestly

BrowserBash is Ollama-first. The default model is `auto`: it uses a local Ollama model if you have one (free, no API keys, nothing leaves your machine), then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. On local models your model bill is genuinely zero. The honest caveat: very small local models (8B and under) get flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows. Pin one explicitly when you want consistency:

```bash
browserbash run "Search for a flight from NYC to London next Friday and read back the cheapest fare" --model ollama/qwen3 --record
```

The `--record` flag captures a screenshot and a session video so you can review what the agent did, which scratches the same itch as the Cypress time-travel debugger. There is a free local dashboard at `browserbash dashboard` (localhost:4477, fully local), and an optional opt-in cloud dashboard if you ever want to share runs. Nothing uploads unless you pass `--upload` after linking with `browserbash connect`.

### Where it slots into a migration

You do not have to choose all-or-nothing. A pragmatic plan: port the clean, deterministic, single-origin tests to Cypress where its developer experience pays off, and hand the awkward tail — the cross-origin SSO journey, the third-party iframe checkout, the "does this whole flow basically work" smoke test — to plain-English BrowserBash objectives that do not care about Cypress's architecture. For CI, `--agent` emits NDJSON (one JSON object per line) with clean exit codes, so it drops into a pipeline without prose parsing. The [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections walk through these patterns.

## A balanced decision guide

Three honest recommendations, because no single tool wins every case.

**Choose Cypress when** your app is a JavaScript or TypeScript front end, primarily Chromium-first, mostly single-origin, and your team will benefit from the time-travel runner, `cy.intercept` network stubbing, and automatic waiting. This is Cypress's home turf and it is excellent there. The migration is mostly mechanical and the developer-experience payoff is real.

**Stay on Selenium (or move to Playwright) when** you need true multi-tab control, broad cross-origin journeys, genuine Safari and wide browser coverage, or you have deep investment in a non-JavaScript language and ecosystem. Selenium's out-of-process WebDriver model is exactly what handles those cases. Playwright is also worth a serious look here — it shares Selenium's external-driver flexibility while offering a modern API, and many 2026 migrations skip Cypress for it precisely because of the multi-tab and cross-origin limits above.

**Use BrowserBash when** the real goal is to stop maintaining selector-heavy scripts, you want fast plain-English coverage of whole flows, you value a $0 local-model option, or you want to cover the exact tail of flows that fight Cypress without writing framework code at all. It trades hand-tuned determinism for resilience and near-zero maintenance, and it pairs well alongside either framework rather than replacing your entire pyramid.

Here is the same trade-off in a table.

| Requirement | Cypress | Selenium / Playwright | BrowserBash |
| --- | --- | --- | --- |
| Multiple tabs / windows | No (single tab) | Yes | Single browser per run |
| Cross-origin journeys | Limited (`cy.origin`) | Yes | Yes (agent navigates freely) |
| Cross-origin iframes | Workarounds only | Yes | Handled as page content |
| Safari / wide browsers | Chromium + Firefox; WebKit experimental | Broad, first-class | Real Chrome/Chromium |
| Language | JS / TS only | Many | Plain English |
| Maintenance on UI churn | Selector updates | Selector updates | Usually none |
| Determinism | High | High | Agent-driven, less rigid |
| Cost floor | OSS + paid Cloud option | Open source | Free; $0 on local models |

Read it against your own inventory, not against a generic "best tool" claim. The right answer is the one that matches the column you actually need. For more side-by-side context, the [blog](https://browserbash.com/blog) covers related comparisons, and [pricing](https://browserbash.com/pricing) lays out what is free versus optional.

## A sane migration sequence

If you do commit to moving, here is the order that keeps you out of trouble. Inventory and score every test against the catch list first. Port a thin vertical slice — five to ten representative tests — and run them in CI before going wide, so you hit the parallelization and config surprises early on a small sample. Convert the clean single-origin tests in priority order, deleting Selenium tests only as their replacements go green so you are never half-covered. Route the blocked tail to BrowserBash objectives or keep a thin Selenium/Playwright suite alive for it rather than forcing bad Cypress workarounds. Finally, settle your parallelization strategy and reporting before you call it done, because a green suite that takes forty minutes is not actually done.

The teams that struggle are the ones that treat this as a find-and-replace. The teams that succeed treat it as a portfolio decision: most tests to Cypress where it shines, the awkward minority handled by a tool built for it, and no heroics spent forcing one framework to do what its architecture refuses to.

## FAQ

### Can Cypress fully replace Selenium?

Not in every case. Cypress is excellent for single-origin, Chromium-first JavaScript front ends, but it cannot control multiple browser tabs, it handles cross-origin and iframe flows with more friction, it supports a narrower set of browsers (WebKit only experimentally as of 2026), and it is JavaScript and TypeScript only. If your suite depends on those Selenium strengths, plan to keep some Selenium or Playwright coverage rather than expecting a full replacement.

### How long does a Selenium to Cypress migration take?

It depends almost entirely on your test inventory, not your test count. Clean, single-origin tests port mechanically and quickly because most explicit-wait plumbing disappears. The time sink is the blocked tail — cross-origin flows, iframes, multi-tab tests — plus rebuilding CI parallelization and any non-JavaScript tooling. Score your suite against Cypress's known limits first so you can estimate honestly instead of discovering blockers mid-project.

### What are the biggest limitations of Cypress compared to Selenium?

The main ones all stem from Cypress running inside the browser: no multi-tab control, limited cross-origin support (improved by `cy.origin` but still constrained), no first-class iframe handling, narrower browser coverage with Safari's WebKit only experimental, and JavaScript/TypeScript as the only languages. Selenium's external WebDriver model handles all of those natively, which is why many teams keep it or choose Playwright for those scenarios.

### Is there a way to test web flows without rewriting tests into Cypress?

Yes. BrowserBash lets you describe a flow in plain English and have an AI agent drive a real Chrome browser through it, with no selectors or page objects to port. It is free and open source, runs on local models for a zero-dollar model bill, and emits NDJSON for CI, so you can cover the exact flows that fight Cypress without rewriting them into framework code. Many teams use it alongside Cypress rather than instead of it.

---

Ready to skip the rewrite for the flows that fight every framework? Install it and try a plain-English run:

```bash
npm install -g browserbash-cli
```

Then point it at your trickiest flow. No account needed to run — and if you want the optional cloud dashboard later, [sign up here](https://browserbash.com/sign-up).
