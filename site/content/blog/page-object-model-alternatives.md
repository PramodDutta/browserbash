---
title: Page Object Model Alternatives for Modern Test Suites
description: "Page object model alternatives for Selenium and Playwright suites: the screenplay pattern, CodeceptJS, and selector-free Markdown tests compared honestly."
date: 2026-03-28
category: alternatives
---

If you are hunting for **page object model alternatives**, you have probably hit the wall every growing suite hits: the page objects outweigh the tests. You started with a clean `LoginPage` class and a tidy `loginAs()` method, and three years later you have 200 page object files, a `BasePage`, a `ComponentObject` hierarchy, and a directory of locators that breaks every time a designer touches the DOM. The Page Object Model (POM) was a genuinely good idea. It is also, for a lot of teams, the single heaviest layer of abstraction in the codebase. This guide surveys the realistic alternatives — the screenplay pattern, CodeceptJS, and a newer selector-free approach — and is honest about when each one beats the others, including when you should just keep your page objects.

I have built and maintained POM suites in both Selenium and Playwright. I am not here to tell you the pattern is dead. I am here to map what you would actually move to, why, and the trade-offs nobody mentions until you are mid-migration.

## Why the Page Object Model gets heavy

The Page Object Model is a design pattern, not a tool. The idea is simple: wrap each page (or component) of your app in a class that exposes high-level methods, and hide the locators and low-level interactions inside that class. Your test says `loginPage.loginAs(user, pass)`; the page object knows that "the username field" means `By.id("username")`. When markup changes, you fix the locator in one place instead of in fifty tests.

That centralization is the whole value, and it is real. So why does POM get heavy?

**It is a second codebase.** Every page object is production code you write, review, refactor, and debug — code that exists only to translate intent into selectors. A mature Selenium or Playwright suite often has more lines in page objects and fixtures than in the actual test assertions. You are maintaining an entire abstraction layer whose only job is to paper over the brittleness of CSS and XPath.

**The abstractions leak.** The clean theory is that tests never see a locator. In practice, you constantly drop down: a one-off `driver.findElement(By.xpath(...))` in a test because adding a method to the page object felt like overkill, a `waitForVisible` that belongs to timing, not to the page's vocabulary. Within a year the boundary is fuzzy and the discipline has eroded.

**Inheritance turns into a maze.** `BasePage` grows utility methods. Then `AuthenticatedBasePage` extends it. Then a `ModalComponent` needs to be composed into five pages. New engineers spend their first week learning your page object hierarchy before they can write a single test. That is onboarding cost the pattern itself created.

**Selectors still rot.** POM localizes selector maintenance; it does not eliminate it. A front-end refactor that renames a class or restructures a form still breaks the locator. You fix it in one file instead of fifty, which is a real win, but you are still on the maintenance treadmill — just with fewer steps per lap.

None of this makes POM bad. It makes it a 2013-era answer that scales linearly with your app's surface area. The alternatives below attack the same maintainability goal from different angles. Some keep the code and reorganize it. One removes the selector layer entirely.

## The alternatives at a glance

There are several patterns and tools worth evaluating. Four map cleanly onto the real reasons people leave POM.

| Approach | What it changes | Still writes selectors? | Best fit for teams that… |
|---|---|---|---|
| **Screenplay pattern** (Serenity/JS, Serenity BDD) | Replaces page objects with actors, tasks, and questions | Yes — in interactions | …have large suites and want better composition and readability without leaving Selenium/WebDriver |
| **CodeceptJS** | Hides locators behind a scenario-style `I` actor | Mostly no, until heuristics miss | …want human-readable scenarios over an existing driver |
| **Component testing / Testing Library** | Tests components in isolation with role-based queries | Role/text queries instead of CSS | …want to shrink E2E surface and push coverage down the pyramid |
| **BrowserBash** (selector-free Markdown) | An AI agent reads the page; you write plain English | No — zero selectors, zero page objects | …want true selector-free tests with no abstraction layer to maintain |

The rest of this article goes deep on each, then gives you a decision framework. I will flag honest caveats throughout, including the ones that count against the tool I work on.

## The screenplay pattern: composition over page objects

The screenplay pattern (originally "journey pattern," popularized by the Serenity ecosystem and available as Serenity/JS for Node and Serenity BDD for Java) is the most direct, like-for-like replacement for POM. It keeps you in Selenium/WebDriver territory but reorganizes the code around a different metaphor.

Instead of pages, you model **actors** who perform **tasks** by executing **interactions**, and ask **questions** about the resulting state. A test reads like a script:

```
actorCalled('Sam').attemptsTo(
  Navigate.to('/login'),
  Login.withCredentials(username, password),
  Ensure.that(SecureArea.heading(), equals('Welcome'))
)
```

The win over POM is composition. Page objects tend to accumulate fat methods and awkward inheritance because a "page" is a clumsy unit — real flows cross pages, and behavior does not factor cleanly along page boundaries. Screenplay's tasks are small, single-responsibility, and composable. `Login` is a task you assemble from lower-level `Enter` and `Click` interactions, and you reuse it across any scenario without an inheritance chain. Tasks read top-down like user goals, which makes the high level genuinely more readable than a wall of `page.doThing()` calls.

It also enforces the separation POM only suggests. The pattern's structure makes it awkward to sneak a raw locator into a test, because tests deal in tasks and questions, not elements. The discipline is baked into the shape of the code rather than left to code review.

**The honest caveats.** Screenplay is more abstraction, not less. You have actors, tasks, interactions, questions, and abilities — five concepts where POM had roughly one. For a small suite that is overkill, and the learning curve is real; engineers who have never seen the pattern find it genuinely confusing at first. And critically, **you are still writing selectors.** Interactions like `Click.on(LoginForm.submitButton())` still resolve to a CSS or XPath locator defined somewhere. Screenplay reorganizes and dignifies the selector layer; it does not remove it. If your pain is selector rot specifically, screenplay treats the symptom you do not have and leaves the one you do.

Choose screenplay when your suite is large and stable, your team writes a lot of test code and will keep doing so, and your real complaint about POM is composition and readability rather than the existence of selectors. As of 2026 it has a dedicated following in the Serenity community and is a mature, well-documented pattern — not a fad.

## CodeceptJS: hide the locators behind a friendly actor

CodeceptJS attacks readability from a different angle. It is a Node.js end-to-end framework that sits on top of a driver — Playwright, WebDriver, or Puppeteer — and exposes a unified, scenario-style API through an `I` actor:

```
I.amOnPage('/login')
I.fillField('Email', 'me@example.com')
I.click('Sign in')
I.see('Welcome back')
```

That reads like instructions you would hand a manual tester, and that is the whole pitch. Where POM hides locators inside classes you write, CodeceptJS hides them inside its own **locator heuristics**: when you say `I.click('Sign in')`, it resolves `'Sign in'` to a real element by trying visible text, then `name`, then a CSS/XPath fallback. For a lot of common cases you genuinely never write a selector or a page object. That is a real reduction in the abstraction you maintain.

It also ships first-class BDD. You can write Gherkin `.feature` files in `Given/When/Then` and wire each step to a JavaScript step definition, which is the human-readable-scenario story that draws teams with non-technical stakeholders.

**The honest caveats.** The readability is a thin layer over the same machinery. `I.click('Sign in')` looks like English, but when the heuristic guesses wrong — two buttons say "Submit," or the accessible name is an `aria-label` rather than visible text — you drop to an explicit locator and write `I.click({css: 'form.auth button[type=submit]'})`. Your plain-English test now contains a CSS selector, and across a suite you are maintaining selectors again, which is the exact thing you were escaping. The BDD layer has its own tax: every Gherkin step needs backing glue code, and maintaining hundreds of regex-matched step definitions is a recurring cost that many teams quietly abandon within a year.

CodeceptJS is a good tool and a real step away from heavyweight POM. But it is a smarter locator strategy, not the absence of one. When its heuristics hold, you write no selectors; when they miss, you are back to CSS and XPath in your "readable" tests. If you want a deeper look, we compared it directly in [BrowserBash vs CodeceptJS](https://browserbash.com/blog).

## Component testing: shrink the surface instead of replacing POM

The quietest alternative is to need fewer page objects in the first place. A lot of what teams cover with heavy E2E POM suites can move down the testing pyramid into component tests.

Tools like Testing Library (and the component-test runners in Playwright, Cypress, and Vitest) let you mount a single component and query it the way a user perceives it — by role, label, and text — instead of by CSS. `getByRole('button', { name: 'Sign in' })` is resilient in a way a `.btn-primary` selector is not, because it tracks the accessible semantics rather than the styling. You assert behavior at the component boundary, in milliseconds, with no browser-wide page object graph to maintain.

This is not a drop-in replacement for E2E — it deliberately does not exercise the full integrated flow, the real backend, or cross-page journeys. But it is the most underused "alternative" to POM, because the cheapest page object is the one you never had to write. If a third of your POM-heavy E2E suite is really testing component logic that a `render()` and a role query could cover, move it. Your remaining E2E suite gets smaller, and so does the page object layer that supports it.

Pair this with role-based locators in whatever E2E tool you keep. Playwright's `getByRole`/`getByLabel` and the same queries in component tests push you toward selectors that survive refactors. It does not eliminate the locator concept, but it makes it far more durable than CSS-class soup.

## BrowserBash: the zero-abstraction, selector-free alternative

The other approaches all keep a translation layer — page objects, tasks, the `I` actor, or role queries. [BrowserBash](https://browserbash.com/features) removes it. You write a plain-English objective, and an AI agent drives a real Chrome/Chromium browser step by step, reading the live page the way a person would. There are no selectors, no page objects, no step definitions, and no inheritance hierarchy — because there is no code layer between your intent and the browser.

Here is the same login flow that would be 40+ lines of POM across three files:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as tomsmith with password SuperSecretPassword!, and verify the page says 'You logged into a secure area'" --headless
```

The agent finds the username field, the password field, and the submit button by looking at the page, not by matching a locator you maintain. The `verify` clause is the assertion: if the text is missing, the run exits with code 1. There is no `LoginPage`, no `By.id("username")`, and nothing to patch when the markup shifts, because the agent re-reads the page on every run. The default Stagehand engine is built around self-healing automation, so a renamed class or restructured form does not break the test the way a hardcoded selector would.

### Markdown tests: committable, selector-free, no page objects

A one-line command is great for a smoke check, but real suites need version-controlled, reviewable tests. BrowserBash uses Markdown test files where each list item is a step:

```markdown
# Checkout smoke test

- Open {{base_url}}
- Search for "wireless headphones" and open the first result
- Add the item to the cart
- Go to checkout and complete the order using card {{card}}
- Verify the page says "Thank you for your order!"
```

Run it with `browserbash testmd run ./checkout_test.md`. A human-readable `Result.md` lands next to the file after every run. These `*_test.md` files support `@import` composition (so a shared `login_test.md` becomes your reusable "task," no class required) and `{{variables}}` templating. Variables marked as secret are masked as `*****` in every log line:

```bash
browserbash testmd run ./checkout_test.md \
  --variables '{"base_url":"https://shop.example.com","card":{"value":"4111111111111111","secret":true}}'
```

That `@import` plus variables story is the screenplay pattern's composability — reusable, parameterized flows — without any of the actor/task/interaction scaffolding. The "page object" for login is just a Markdown file other tests import. There is no second codebase to maintain because the test *is* the only artifact.

### It runs in CI like any other suite

For pipelines and AI coding agents, `--agent` emits NDJSON — one JSON event per line on stdout, no prose to parse — and the exit codes are the contract: `0` passed, `1` failed, `2` error, `3` timeout.

```bash
browserbash testmd run ./checkout_test.md --agent --headless
```

You gate merges on the exit code exactly the way you would with a Selenium or Playwright run. Add `--record` to capture a screenshot and a full `.webm` session video on any engine; the builtin engine also captures a Playwright trace you can open in the trace viewer. The full agent-mode contract is documented in the [BrowserBash learn docs](https://browserbash.com/learn).

### The model story, honestly

BrowserBash is Ollama-first. It defaults to free local models, so there are no API keys and nothing leaves your machine — you can guarantee a $0 model bill on local models. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, and supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key.

The honest caveat: very small local models (around 8B and under) can be flaky on long, multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for hard flows. A five-step checkout on an 8B model will frustrate you; the same flow on a 70B-class model or Claude is solid.

## The honest trade-offs of going selector-free

Removing the selector layer is not free. Here is where the agent approach costs you, plainly.

**Determinism.** Selenium and Playwright execute identical instructions every run; when they fail, they fail identically. An LLM agent plans at run time, and two runs may reach the same goal by slightly different paths. BrowserBash narrows the gap with explicit `verify` steps, a `--max-steps` cap, a `--timeout`, and exit codes as the contract — but runs are goal-deterministic, not path-deterministic. If you need bit-identical execution traces for a compliance audit, page objects still win.

**Speed.** A WebDriver click is milliseconds; every agent step includes model inference. A POM login finishes in single-digit seconds in CI; an agent login typically lands in the tens of seconds depending on model and provider. For a 15-test smoke suite that is irrelevant. For an 800-test regression wall run on every commit, it is disqualifying — keep your fast deterministic suite there.

**Cost on hosted models.** Every step costs tokens when you use a hosted model. You hold the levers — local models are free, and one `--model` flag swaps capability per run — but a large suite on a premium hosted model has a real bill that a Selenium grid does not.

**Debugging is different.** When a page object test fails, the stack trace points at a line. When an agent test fails, you read the `Result.md`, watch the `.webm`, or open the trace to understand what the agent saw and decided. It is often *more* informative, but it is a different debugging muscle than a `NoSuchElementException`.

This is the same balance the screenplay and CodeceptJS sections hit from the other side: those tools keep determinism and speed by keeping selectors. BrowserBash trades a measure of both to delete the abstraction entirely. Neither choice is universally right.

## A decision framework: which alternative fits you

Match the alternative to your *actual* complaint about page objects, not to the hype.

- **"My page objects are a tangled inheritance mess, but selectors are fine."** Adopt the **screenplay pattern**. It keeps your driver and your determinism and fixes composition. You will write *more* structured code, not less — that is the point.
- **"I want non-technical people to read the tests, and most of my locators are simple."** Try **CodeceptJS**. Accept that complex pages will pull explicit selectors back into your scenarios.
- **"A third of my E2E suite is really component logic."** Move it to **component tests** with role-based queries and shrink the POM surface you maintain at all.
- **"I am tired of maintaining a selector layer at all, my UI churns weekly, and I want product managers to read tests in review."** Use **BrowserBash**. Accept the determinism and speed trade-offs and keep your heavy regression suite where it is.

The realistic pattern is coexistence, not replacement. Keep your fast, deterministic POM or screenplay suite for the deep regression wall and pixel-precise interactions. Move the selector-churn victims — the flows that break on every front-end sprint, the new coverage you need today, the smoke and journey tests — to selector-free Markdown. Both report to CI through the same pass/fail exit code, so the pipeline does not care which engine produced the green check.

### A migration that actually works

You do not rewrite 800 tests. You pick the ten worst offenders — the page objects that broke most often last quarter — and port just those flows to Markdown tests. They stop appearing in your selector-maintenance backlog immediately, because there is no selector to maintain. You measure the determinism and runtime on real flows, decide how far up the suite to take it, and keep the rest on POM. That is how you evaluate an alternative without betting the suite on it. The [BrowserBash case study page](https://browserbash.com/case-study) walks through this coexistence pattern in more detail.

## FAQ

### Is the Page Object Model dead in 2026?

No. POM is still the right pattern for large, stable regression suites where you need deterministic execution, sub-second per-test speed, and pixel-precise control. What has changed is that it is no longer the *only* answer. For fast-churning UIs and human-readable smoke tests, selector-free agent tests and the screenplay pattern are real alternatives. Most mature teams now run a mix rather than betting everything on page objects.

### What is the screenplay pattern, and is it better than page objects?

The screenplay pattern models tests as actors performing tasks and asking questions, rather than as methods on page classes. It composes better than POM and reads more like user goals, which is a genuine improvement for large suites. But it is more abstraction, not less, and it still uses selectors underneath. It is "better" if your complaint is composition and readability; it does nothing for selector rot.

### Can I write tests without any selectors at all?

Yes, with an AI-agent approach like BrowserBash. You write a plain-English objective or a Markdown test file, and the agent reads the live page to find elements the way a person would, so there are no CSS or XPath locators and no page objects to maintain. The trade-off is that runs are goal-deterministic rather than path-deterministic and each step includes model inference, so it suits smoke and journey tests better than an 800-test regression wall.

### Do I have to throw away my existing page objects to adopt an alternative?

No, and you should not try. The proven approach is coexistence: keep your existing POM or screenplay suite for deep regression and move only the highest-maintenance flows to an alternative. Both suites can run in the same pipeline and gate merges through the same exit-code convention, so you migrate incrementally and measure as you go.

---

Ready to try the selector-free, page-object-free approach? Install the CLI with `npm install -g browserbash-cli` and point it at any flow you are tired of maintaining locators for. It is free and open source, runs on local models with no API keys, and needs no account to start. If you want run history, video replays, and a shared dashboard later, [sign up here](https://browserbash.com/sign-up) — the cloud dashboard is strictly optional.
