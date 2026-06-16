---
title: Selenium IDE vs Cypress: Record vs Code in 2026
description: "Selenium IDE vs Cypress compared honestly: record-and-playback versus code-based testing, where each breaks, and the plain-English path that self-adapts."
date: 2026-05-23
category: comparison
---

If you are deciding how your team should write browser tests this year, the Selenium IDE vs Cypress choice is really a choice between two philosophies: record what you do in the browser and replay it, or write code that drives the browser by hand. Selenium IDE is the record-and-playback option — you click through your app and it captures the steps. Cypress is the code-first option — you author specs against the DOM and assert on what you find. Both still ship in 2026, both have real fans, and the honest answer to "which is better" depends almost entirely on who is writing the tests and how often the app changes.

I have run suites built both ways, watched recordings rot after a frontend refactor, and spent more evenings than I would like fixing selectors that broke because someone renamed a CSS class. This is a working SDET's comparison, not a feature grid scraped off two homepages. The short version up front: Selenium IDE gets non-coders producing tests in an afternoon but pays for it in brittleness; Cypress gives engineers precise, debuggable control at the cost of writing and maintaining every selector. By the end you will know which fits your team. I will also be straight about a third path that is quietly changing the question — where the test is a plain-English sentence and an AI agent does the driving, with nothing to record and no selectors to maintain.

## The 60-second answer

If you read nothing else, read this.

Choose **Selenium IDE** if you need manual testers, business analysts, or junior QA to produce automated checks without writing code, your flows are short and stable, and you are happy treating the recordings as disposable smoke tests rather than a long-lived suite. The barrier to entry is almost zero. The ongoing maintenance cost is the catch.

Choose **Cypress** if your testers can write JavaScript or TypeScript, your app is a modern single-page application, and you want deterministic, debuggable tests with a strong runner and a real assertion library. Cypress is a developer tool that rewards engineering discipline. It is not built for non-coders.

Then understand there is now a third option that sidesteps the record-versus-code tradeoff entirely: you write what you want to verify in plain English, and an AI agent figures out the clicks. That is where [BrowserBash](https://browserbash.com) comes in, and it is worth knowing about before you commit a year to either approach.

## What Selenium IDE actually is

Selenium IDE is a browser extension (Chrome and Firefox) maintained under the Selenium project. You open it, hit record, and click through your application. It captures each interaction as a command in a table — `open`, `click`, `type`, `assert text`, and so on — building a test you can replay with one button. There is no code to write to get started, and it exports to WebDriver code in several languages if you later want to graduate a recording into a "real" Selenium script.

That low barrier is the whole pitch. A manual tester who has never opened a code editor can record a login flow, a search, a checkout, and have a replayable test in minutes. For teams where automation is otherwise zero, that is genuinely valuable. Selenium IDE also added control flow over the years — `if`, `while`, `times`, and the ability to call one test from another — so it is more capable than the old "linear macro recorder" reputation suggests.

The honest caveat: recordings are tightly coupled to the structure of your page at the moment you recorded them. Selenium IDE captures locators based on IDs, CSS, and XPath, and it tries to record a few fallback locators per element. But when a developer restructures the DOM, renames an attribute, or wraps a button in a new container, the recorded locator can stop matching. The test does not adapt; it fails, and a human has to re-record or hand-edit the locator. This is the structural weakness of record-and-playback, and no amount of fallback locators fully removes it.

## What Cypress actually is

Cypress is a code-first end-to-end testing framework for the web. You install it into a JavaScript or TypeScript project and write specs that drive the browser through the Cypress API. A login test looks roughly like this:

```javascript
describe('login', () => {
  it('signs in and lands on the dashboard', () => {
    cy.visit('/login')
    cy.get('[data-cy=email]').type('qa@example.com')
    cy.get('[data-cy=password]').type('hunter2')
    cy.get('[data-cy=submit]').click()
    cy.contains('Welcome back').should('be.visible')
  })
})
```

Cypress runs inside the browser's event loop, in the same run-loop as your application, which gives it tight control and a fast, interactive test runner. Its standout features are automatic waiting (commands retry until the element is actionable or a timeout hits), time-travel debugging (you can hover over each step in the runner and see the DOM state at that moment), and clear, readable assertions. Frontend engineers who try it tend to like it a lot.

The cost is that you write and maintain every selector yourself. Cypress is JavaScript/TypeScript only, so a non-coding tester cannot author specs. It runs inside the browser, which historically constrained things like multi-tab and multi-origin testing, though Cypress has worked to ease cross-origin handling over time. And while automatic waiting kills a large class of flakiness, your selectors are still hand-written assumptions about the DOM. When the app changes, you update the spec. That maintenance is the real ongoing cost, and on a fast-moving product it is not small.

## Selenium IDE vs Cypress at a glance

Here is the honest side-by-side. Where a fact is not publicly nailed down or varies by version, I say so rather than inventing a number.

| Dimension | Selenium IDE | Cypress |
|---|---|---|
| Authoring model | Record-and-playback (point and click) | Code-first (JavaScript / TypeScript) |
| Who can use it | Manual testers, BAs, non-coders | Developers and SDETs who code |
| Setup time | Install a browser extension | Install into a JS/TS project |
| Languages | None to author; exports WebDriver code | JavaScript / TypeScript only |
| Where tests run | Chrome and Firefox (extension) | Chromium-family, Firefox, WebKit support has evolved |
| Selector strategy | Auto-captured ID/CSS/XPath with fallbacks | Hand-written, ideally `data-*` test attributes |
| Adapts when the DOM changes | No — re-record or hand-edit locators | No — update the spec by hand |
| Debugging | Replay and step through commands | Time-travel runner, DevTools integration |
| CI fit | Possible via `selenium-side-runner`, less common | Strong, first-class CI story |
| Best for | Fast smoke tests by non-coders | Maintained suites by engineering teams |
| Cost | Free, open source | Open-source core; paid Cypress Cloud tiers |

A few of these rows deserve more than a cell, so let me unpack the ones that decide real projects.

### Setup and the first green test

Selenium IDE wins the first hour decisively. Install the extension, record, replay — you have a passing test before lunch with no project scaffolding. Cypress is not hard to set up, but it assumes a Node project, a package install, and someone comfortable in a terminal. If your goal is "let our manual QA team automate the top ten smoke flows by Friday," Selenium IDE is the faster road to a green checkmark.

### Maintenance over six months

This is where the picture flips. A recorded test is a snapshot of the DOM. The first significant frontend refactor — a component library upgrade, a redesign, a move from one CSS framework to another — can invalidate a chunk of your recordings at once, and re-recording is the only realistic fix for a non-coder. Cypress tests also break on DOM change, but an engineer can fix a selector in seconds and, crucially, can defend against churn up front by using stable `data-cy` attributes that survive visual redesigns. Over a six-month horizon on an active product, Cypress's maintenance story is meaningfully better — provided you have people who can code.

### CI and reporting

Cypress has the stronger continuous-integration story by a wide margin. It runs headless, produces screenshots and videos of failures out of the box, and integrates cleanly with every CI provider. Selenium IDE recordings can run in CI through the `selenium-side-runner` command-line tool, but it is a less common, less polished path, and many teams treat IDE recordings as local artifacts rather than pipeline citizens. If your tests need to gate deploys, that gap matters.

## Where both approaches share the same wall

Step back and notice what Selenium IDE and Cypress have in common, because it is the thing the next section is about. Both are built on **selectors**. Record-and-playback captures them automatically; code-first makes you write them by hand. Either way, your test is a stack of assumptions about the page's structure: this button has this ID, this field matches this CSS path, this row sits at this XPath.

Selectors are why end-to-end suites rot. A passing test today is a promise that the DOM will not change in ways your locators care about. On a product with an active frontend team, that promise breaks constantly. You spend your maintenance budget not on testing new behavior but on re-teaching old tests where the buttons moved. Record-and-playback feels worse here because the fix is "record it again," but code-first is the same disease with a faster bandage. Neither tool *understands* your app. They match patterns, and patterns drift.

That shared wall is the opening for a genuinely different model.

## A third path: plain-English objectives that self-adapt

[BrowserBash](https://browserbash.com/features) starts from a different question. Instead of "how do we capture or write the exact clicks," it asks "what are we actually trying to verify?" You write that as a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step to accomplish it — no recording session, no selectors, no page objects. Here is the same login-and-checkout idea the other tools would express in dozens of recorded steps or lines of code:

```bash
browserbash run "Log in to the store with the test account, add the first item to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

The agent reads the page, decides what to click, and adapts when the layout differs from what it expected. Because there is no hard-coded locator for the "Add to cart" button, a redesign that renames a class or reshuffles a container does not automatically break the run — the agent looks for the button that does the job, the way a human tester would. That is the core difference from both record-and-playback and code-first: the test describes intent, not structure, so structural change is something it tolerates rather than something that snaps it.

BrowserBash is free and open source (Apache-2.0), built by The Testing Academy. You install it as a CLI:

```bash
npm install -g browserbash-cli
```

No account is required to run it. There is an optional, opt-in free cloud dashboard for run history and video replays, and a fully local dashboard too, but the default experience is: install, write a sentence, run it against your own Chrome. You can read more about the approach on the [BrowserBash learn pages](https://browserbash.com/learn).

### The model story, told honestly

The thing that makes a plain-English test trustworthy is the model behind it, so here is the unvarnished version. BrowserBash is **Ollama-first**: by default it uses free local models, needs no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install first, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY`. It supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic's Claude if you bring your own key. On local models you can guarantee a $0 model bill.

The honest caveat — the one that decides whether this works for you — is that very small local models (roughly 8B parameters and under) can be flaky on long, multi-step objectives. They lose the thread on a ten-step checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If you try BrowserBash on a tiny model and a complex objective and it wanders, that is expected; size up the model before you write off the approach. Used within its sweet spot, the self-adapting behavior is the real payoff over both Selenium IDE recordings and hand-written Cypress selectors.

### Tests you can commit, in Markdown

Plain English does not have to mean "ephemeral." BrowserBash supports committable Markdown test files where each list item is a step:

```bash
browserbash testmd run ./checkout_test.md
```

A `checkout_test.md` might read like this, with `@import` for shared setup, `{{variables}}` for templating, and secret-marked variables masked as `*****` in every log line:

```markdown
# Checkout smoke test

@import ./setup/login_test.md

- Search for "{{product}}"
- Add the first result to the cart
- Go to checkout and pay with the saved card
- Sign in if prompted with password {{secret:CARD_PIN}}
- Verify the confirmation reads "Thank you for your order!"
```

That gives you the reviewable, version-controlled artifact a Cypress spec provides — your team can diff it, comment on it in a pull request, and reason about it — without the selector maintenance a Cypress spec demands. After each run BrowserBash writes a human-readable `Result.md`, so there is a record of what happened in language a product manager can read.

### CI and AI coding agents

For pipelines and for AI coding agents that need to consume results programmatically, BrowserBash has an `--agent` mode that emits NDJSON — one JSON event per line on stdout — instead of prose you would have to parse. Exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. So a smoke check in CI looks like this:

```bash
browserbash run "Open the pricing page and confirm the Pro plan price is visible" --agent --headless
```

You can attach `--record` to capture a screenshot and a full `.webm` session video on any engine (the builtin engine additionally captures a Playwright trace you can open in the trace viewer), and `--upload` to push the run to the optional cloud dashboard for per-run replay. That is the kind of failure evidence Cypress users expect and Selenium IDE users usually do not get for free.

## Where Selenium IDE is still the right call

I am not going to pretend BrowserBash wins every situation. Selenium IDE is genuinely the better fit in a few cases.

If your testers cannot and will not write code, and your flows are short, stable, and few, Selenium IDE's record button is hard to beat for time-to-first-test. There is no model to choose, no prompt to phrase, no inference cost to think about — you click and it captures. For a handful of rarely-changing smoke paths owned by a non-coding team, that simplicity is a feature.

It is also a fine teaching tool. Watching a recording replay, then exporting it to WebDriver code, is a clean way to show someone how Selenium works under the hood before they learn to write it. And because it is part of the Selenium project, it slots naturally into shops that already standardize on Selenium WebDriver for their maintained suites.

If determinism is the absolute priority and your team would rather debug a precise selector than reason about a model's choices, that is a legitimate preference, and it points toward code, not plain English.

## Where Cypress is still the right call

Cypress remains the strong default for a frontend engineering team that owns its own tests. If your people write TypeScript, your app is a single-page application, and you want the best interactive debugging experience available, Cypress is excellent and BrowserBash is not trying to replace it wholesale. The time-travel runner alone wins developers over.

Cypress also gives you fine-grained control that a plain-English objective deliberately abstracts away. If you need to assert on a specific network response, stub a backend call, or check an exact computed style, you want code, and Cypress's API is built for exactly that precision. A natural-language agent is the wrong tool for "assert this XHR returned a 304." The honest framing is complementary: use Cypress where you need deterministic, low-level control, and reach for a self-adapting agent where you mostly care that a user-visible flow still works end to end. You can read a longer take on that split in the [Cypress versus BrowserBash comparison](https://browserbash.com/blog).

## A practical way to combine all three

You do not have to pick one religion. A pragmatic 2026 setup might look like this. Keep your deep, deterministic Cypress specs for the component- and integration-level checks that need precise control — they are worth the maintenance because they catch specific regressions. Drop Selenium IDE if its recordings have become a re-recording treadmill; that treadmill is exactly the cost a plain-English agent removes. Then use BrowserBash for the broad, user-journey smoke layer: the "can a customer actually log in, search, add to cart, and check out today" flows that change shape often and break selector-based tests most.

That smoke layer is where self-adaptation pays off the most, because user journeys touch the most UI surface and therefore drift the most. Writing them as plain-English objectives means a redesign costs you a re-read of the objective, not a re-recording session or a selector hunt. You can run that layer entirely on a free local model for a $0 bill, gate it in CI with exit codes, and keep video evidence of any failure. See real flows on the [BrowserBash case study page](https://browserbash.com/case-study), and the install details on [npm](https://www.npmjs.com/package/browserbash-cli).

## Migration without a rewrite

One worry with adopting any new approach is throwing away work you already did. With BrowserBash you mostly do not have to. Your existing Cypress suite keeps running unchanged; BrowserBash is additive, sitting alongside it for the journeys where selectors hurt most. If you are coming from Selenium IDE recordings, the migration is conceptual rather than mechanical: instead of re-recording the broken steps, you write the objective the recording was trying to express. A 22-step recorded checkout becomes a one-paragraph objective, and the steps the agent figures out for itself.

Because BrowserBash drives a real browser, you can also point it at the same environments your other tools use. The default `local` provider uses your own Chrome; one `--provider` flag switches the browser to a remote DevTools endpoint or to grids like LambdaTest, BrowserStack, or Browserbase when you need cross-browser coverage at scale. So adopting it does not mean rebuilding your test infrastructure — it means changing what a "test" is for the flows that hurt, while leaving everything else in place.

## FAQ

### Is Selenium IDE better than Cypress for beginners?

For a non-coding beginner, Selenium IDE is easier to start with because you record clicks instead of writing code. For a developer learning automation, Cypress is the better long-term investment thanks to its coding model, debugging tools, and CI story. The real question is whether the person will write code at all; if not, Selenium IDE or a plain-English tool like BrowserBash fits better than Cypress.

### Why do Selenium IDE recordings break so often?

Recordings capture locators based on the DOM at the moment you record, so when the page structure changes — a renamed attribute, a redesign, a new wrapper element — the captured locators stop matching and the test fails. Selenium IDE records fallback locators to soften this, but it cannot fully prevent it. A plain-English agent avoids the problem by deciding what to click at run time rather than replaying a fixed locator.

### Can Cypress and BrowserBash be used together?

Yes, and that is often the best setup. Keep Cypress for low-level, deterministic checks that need precise control over selectors, network stubs, or exact assertions, and use BrowserBash for broad user-journey smoke tests written as plain-English objectives that survive UI churn. They run side by side, and adopting BrowserBash does not require touching your existing Cypress specs.

### Does BrowserBash cost money to run?

No. BrowserBash is free and open source under Apache-2.0, and it is Ollama-first, so it defaults to free local models with no API keys and nothing leaving your machine — a guaranteed $0 model bill on local models. You can optionally use OpenRouter free models or bring your own Anthropic key for the hardest flows, and the cloud dashboard is a free, opt-in extra.

Record-and-playback versus code has been the only real choice for a long time, but in 2026 you have a third one that sidesteps the selector trap both share. If your tests keep breaking on UI change, try describing what you want instead of capturing or coding it. Install with `npm install -g browserbash-cli`, write one plain-English objective, and run it against your own Chrome — no account required, though you can [sign up](https://browserbash.com/sign-up) for the free dashboard if you want run history and video replays.
