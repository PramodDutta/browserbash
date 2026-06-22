---
title: Migrating Selenium Java to Playwright: A Practical Guide for Java Teams
description: "A practical Selenium to Playwright Java migration guide: Maven profiles, a legacy folder, command mapping, the TS-only tooling gap, and where a CLI"
date: 2026-05-19
category: guide
---

If you run a Java test suite that has been alive for five or more years, a Selenium to Playwright Java migration is probably already on a slide somewhere in your team's roadmap. The pitch is easy to nod along to: auto-waiting, faster runs, a trace viewer that actually shows you what happened, fewer flaky retries. The hard part is that you have hundreds of tests, a page object hierarchy nobody fully remembers, and a CI pipeline that other teams depend on. You cannot stop the world for a quarter and rewrite everything. This guide is written for that reality — a Java team that wants the benefits of Playwright without a big-bang rewrite, doing it incrementally with Maven profiles, a `legacy/` folder, and a clear command-by-command map from the WebDriver API to the Playwright Java API.

I will also be honest about something most migration posts skip: a lot of Playwright's best tooling is JavaScript and TypeScript first. The Java binding is real and supported, but it is not where the ecosystem's center of gravity sits. That changes how you should plan, and it is also where a natural-language CLI can shortcut parts of the rewrite that are not worth porting by hand.

## Why Java teams move from Selenium to Playwright

Let me be precise about what you actually gain, because "Playwright is faster" is not a migration justification a tech lead can defend.

The headline difference is **auto-waiting**. Selenium WebDriver does not wait for elements to be actionable on its own. Every team eventually bolts on `WebDriverWait` and `ExpectedConditions`, and over years that turns into a thicket of explicit waits, implicit waits that conflict with them, and `Thread.sleep` calls that someone added at 2am to stop a flaky test. Playwright waits for an element to be visible, stable, attached, and enabled before it acts, as a default. Most of your wait code simply disappears. That is the single biggest reason flake drops after a migration.

The second is **the trace viewer**. When a Playwright test fails, you can open a trace that shows a DOM snapshot at every step, network activity, console logs, and the action timeline. Debugging a Selenium failure usually means re-running with more logging and hoping it reproduces. The trace makes most failures diagnosable from a single run.

Third is **architecture**. Selenium 4 speaks WebDriver BiDi and the classic W3C WebDriver protocol over HTTP to a browser driver. Playwright talks to the browser over a single persistent connection (CDP for Chromium, and its own protocols for Firefox and WebKit), which is part of why it is faster and why features like network interception and request mocking feel native instead of bolted on.

None of this is free. Selenium has the larger Grid ecosystem, broader real-device cloud support across vendors, and a longer track record in heavily regulated shops. If your value proposition is "every browser and OS combination a bank's compliance team can name," Selenium Grid is still a very strong answer and you should weigh that honestly before committing.

## Selenium and Playwright in Java, side by side

The most important thing to know up front: **Playwright has an official Java binding.** You do not have to learn TypeScript to use Playwright. The Microsoft-maintained `com.microsoft.playwright` package gives you the same `Page`, `Locator`, and `BrowserContext` model the JS API has, callable from plain Java and runnable under JUnit 5 or TestNG.

Here is the honest framing of the two tools as a Java team experiences them:

| Dimension | Selenium (Java) | Playwright (Java) |
| --- | --- | --- |
| Official Java support | Yes, first-class, since the beginning | Yes, official Microsoft binding |
| Waiting model | Manual (`WebDriverWait`, explicit/implicit) | Auto-waiting built into every action |
| Test runner | JUnit / TestNG (you bring it) | JUnit / TestNG (you bring it) |
| Locators | `By.*`, you manage strategy | `Page.locator`, role/text/test-id helpers |
| Browser comms | W3C WebDriver + BiDi over HTTP | Persistent connection (CDP and native) |
| Network mocking | Add-on / CDP gymnastics | First-class `route()` interception |
| Debugging | Logs, re-run, screenshots | Trace viewer, Inspector, codegen |
| Grid / cloud breadth | Very broad (Grid, many vendors) | Good, narrower vendor maturity (as of 2026) |
| Tooling center of gravity | Java is a first-class citizen | TypeScript-first; Java a step behind |

That last row is the load-bearing caveat. Read on, because it shapes how you should sequence the work.

### The TS-only tooling reality

Playwright's flagship developer experience is the `@playwright/test` runner: fixtures, projects, sharding, retries, the HTML reporter, parallelism config, component testing. That runner is JavaScript and TypeScript only. In Java you get the Playwright **library** — the browser automation — but you wire it into JUnit or TestNG yourself, and you provide your own parallelism, reporting, and fixture patterns. The trace viewer and codegen work for Java, but a meaningful share of community examples, plugins, and Stack Overflow answers assume the TS runner.

What this means in practice: do not budget your migration as if you are getting the full "Playwright experience" you saw in a TypeScript demo. You are getting an excellent automation library with auto-waiting and tracing, bolted onto the JUnit/TestNG world you already run. That is still a big upgrade over Selenium. Just plan with eyes open, especially if a stakeholder watched a TS screencast and now expects component testing and the native runner.

## An incremental migration strategy that fits Java teams

A big-bang rewrite is where these projects go to die. You burn a quarter, the pipeline is unstable the whole time, and the first production incident pulls everyone off the migration. Instead, run both frameworks in the same Maven module for as long as it takes, and shrink Selenium's footprint test by test.

The strategy has three moving parts: a `legacy/` source layout, **Maven profiles** to choose what runs, and a per-test cut-over rule. Here is the shape.

### Step 1: Carve out a legacy folder

Move your existing Selenium tests into a clearly named package and source root so nobody confuses old and new code. A common layout:

```
src/test/java/
  com/acme/legacy/      <- existing Selenium tests, untouched
  com/acme/pw/          <- new Playwright tests land here
```

The point of the `legacy/` boundary is psychological as much as technical. New work goes in `pw/`. The `legacy/` package is frozen except for bug fixes. When `legacy/` is empty, the migration is done. You can see progress as a file count going down, which keeps momentum visible to managers who fund the work.

### Step 2: Add both dependencies, gate them with Maven profiles

Add `com.microsoft.playwright:playwright` alongside your existing Selenium dependency. Then use Maven profiles plus Surefire/Failsafe includes so you can run "just legacy," "just Playwright," or "everything." A sketch:

```xml
<profiles>
  <profile>
    <id>legacy</id>
    <properties><test.includes>com/acme/legacy/**</test.includes></properties>
  </profile>
  <profile>
    <id>pw</id>
    <properties><test.includes>com/acme/pw/**</test.includes></properties>
  </profile>
</profiles>
```

Wire `${test.includes}` into the Surefire `<includes>` block. Now `mvn test -P legacy` keeps the old gate green, `mvn test -P pw` runs the migrated tests, and your default profile can run both. In CI you run a Playwright job and a Selenium job in parallel, and you watch the Playwright job's test count grow while the Selenium job's shrinks. When the Selenium job hits zero, you delete the profile and the dependency in one clean commit.

### Step 3: Migrate by risk and churn, not alphabetically

Do not start at `A` and work down. Start with the tests that hurt: the flakiest ones (Playwright's auto-waiting often fixes the flake outright) and the highest-churn flows (login, checkout, the smoke suite) where the new debugging tools pay back fastest. Leave the stable, rarely touched corners of `legacy/` for last, or never — a test that has not flaked or changed in two years is delivering value at zero cost, and there is no prize for porting it.

## Command mapping: WebDriver to Playwright Java

This is the part you actually do at the keyboard. The mental shift is from "find an element, then act on it, and handle waiting yourself" to "describe a locator, act, and let auto-waiting handle timing." Locators in Playwright are lazy and re-resolve on each use, so a stale-element exception — the bane of long Selenium suites — basically stops happening.

| Task | Selenium (Java) | Playwright (Java) |
| --- | --- | --- |
| Start browser | `new ChromeDriver()` | `playwright.chromium().launch()` |
| Navigate | `driver.get(url)` | `page.navigate(url)` |
| Find by CSS | `driver.findElement(By.cssSelector(s))` | `page.locator(s)` |
| Find by text | XPath gymnastics | `page.getByText("Sign in")` |
| Find by role | not native | `page.getByRole(AriaRole.BUTTON, ...)` |
| Click | `el.click()` | `page.locator(s).click()` |
| Type | `el.sendKeys("x")` | `page.locator(s).fill("x")` |
| Read text | `el.getText()` | `locator.textContent()` |
| Explicit wait | `new WebDriverWait(...).until(...)` | usually nothing — auto-wait |
| Assert visible | wait + `isDisplayed()` | `assertThat(locator).isVisible()` |
| Dropdown | `new Select(el).selectByVisibleText` | `locator.selectOption(...)` |
| Screenshot | `getScreenshotAs(...)` | `page.screenshot(options)` |
| Quit | `driver.quit()` | `browser.close()` / try-with-resources |

A few notes that save real time:

- **Delete your waits, do not port them.** The most common migration anti-pattern is translating `WebDriverWait` into some Playwright equivalent. In the large majority of cases the right Playwright code is just the action with no wait at all. Port the intent, not the line.
- **Prefer role and text locators over CSS where you can.** `getByRole` and `getByText` are more resilient than the brittle CSS and XPath that accumulate in old Selenium page objects, and they double as a light accessibility check.
- **Web-first assertions retry.** `assertThat(locator).isVisible()` polls until the condition holds or times out, which removes a whole class of "assert too early" flake you would otherwise paper over with a sleep.
- **Use codegen to bootstrap, then refactor.** Playwright's codegen records a session and emits Java, including reasonable locators. It is a starting point, not a final test, but it removes the blank-page problem for each new flow.

### Page objects still work — just thinner

Your Selenium page object pattern translates directly; Playwright does not force a different architecture. The difference is that pages get thinner. All the wait helpers, the `waitForElementToBeClickable` wrappers, the retry loops — most of that scaffolding deletes itself because auto-waiting absorbed its job. A page object that was 200 lines in Selenium is often 80 in Playwright, and the 120 lines you removed were the flakiest 120 in the file.

## Where a natural-language CLI shortcuts the rewrite

Here is the uncomfortable truth about a line-by-line port: a chunk of your suite is not worth migrating by hand. The throwaway smoke checks, the "does the login page still load and let me in" tests, the one-off "verify the new banner renders for EU users" checks — porting those one Locator at a time is real engineering hours spent re-encoding selectors you will rewrite again the next time the markup shifts.

This is where [BrowserBash](https://browserbash.com/features) fits into a migration, and I want to be clear about the boundary. BrowserBash is not a replacement for your Playwright Java suite. It is a free, open-source (Apache-2.0) command-line tool where you write a plain-English objective and an AI agent drives a real Chrome browser step by step — no selectors, no page objects — then returns a pass/fail verdict plus any structured values it pulled out. Under the hood the default engine, Stagehand, and the browser provider both run locally, so it sits naturally next to a Java toolchain instead of replacing it.

Two concrete uses during a migration:

**Triage the smoke layer first.** Before you port a flow, prove it still matters with a one-liner. Install once:

```bash
npm install -g browserbash-cli
browserbash run "Go to staging.acme.com, log in as qa@acme.com, confirm the dashboard greeting shows the user's first name"
```

If that English objective passes, you have a working smoke check for the flow in seconds, and you can decide whether the hand-written Playwright version is even worth the hours. Many smoke tests never graduate to code — the CLI run, committed as a markdown test, is enough.

**Commit English tests for the flaky long tail.** BrowserBash has a markdown test format where each list item is a step, secrets are masked in logs, and `{{variables}}` are templated. For the brittle, low-value tests clogging your `legacy/` folder, a committable `*_test.md` is often a better destination than a ported Java test:

```bash
browserbash testmd run ./smoke/checkout_test.md --record
```

The `--record` flag captures a screenshot and a `.webm` video of the session, which is the equivalent of a Playwright trace for the no-code path. Run it in CI with `--agent` to get NDJSON output (one JSON object per line, real exit codes: 0 passed, 1 failed, 2 error, 3 timeout) instead of prose your pipeline has to parse. There is more on the test format in the [BrowserBash tutorials](https://browserbash.com/tutorials).

### The honest model caveat

This only works if the model driving the browser is capable enough. BrowserBash is Ollama-first: with the default `auto` model it resolves to a local Ollama model if you have one, costing nothing and sending nothing off your machine, then falls back to a hosted model if you have set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. The caveat worth stating plainly: very small local models (8B and under) are flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows. A login-and-check smoke test is fine on a small model; a twelve-step checkout with conditional branches is not. Pin a model when you need consistency:

```bash
browserbash run "Search for a blue running jacket, add the first result to the cart, go to checkout, and report the final total" --model ollama/qwen3 --record
```

You can read more about the local-first setup on the [BrowserBash learn pages](https://browserbash.com/learn).

## A realistic migration timeline

Numbers from real migrations vary wildly with suite size and team focus, so treat these as a shape, not a promise. For a suite of a few hundred Selenium Java tests with one or two engineers part-time:

- **Weeks 1–2: Scaffolding.** Add the Playwright dependency, set up the `legacy/` and `pw/` source roots, wire the Maven profiles, get one migrated test green in CI alongside the old suite. This is the boring, high-leverage phase — do not rush it.
- **Weeks 3–6: The painful 20%.** Migrate the flakiest and highest-churn flows. This is where you feel the biggest win, because the tests that were eating your week stop flaking. Use codegen to bootstrap and BrowserBash to triage which low-value tests deserve a code port at all.
- **Weeks 7+: The long tail.** Steady porting of the stable middle, plus a decision on the truly stale corners of `legacy/`. Many teams consciously leave a handful of rarely-run Selenium tests in place rather than spend hours porting them. That is a legitimate end state, not a failure.
- **Cut-over.** When the Playwright job carries the suite, delete the Selenium dependency, the `legacy/` profile, and the old folder in one commit. The diff that removes a thousand lines of wait helpers is the most satisfying PR you will write that quarter.

Run both gates in CI the entire time. The migration is safe precisely because the old suite keeps guarding production while the new one grows.

## Common migration mistakes to avoid

A few traps that sink Java migrations specifically:

- **Porting waits instead of deleting them.** Said twice on purpose. If your migrated Playwright test still has explicit waits everywhere, you have ported Selenium's habits, not adopted Playwright's model, and you kept the flake.
- **Expecting the TS runner experience.** Recheck the [Selenium-vs-Playwright honesty above](https://browserbash.com/blog) before you promise stakeholders fixtures and component testing — in Java you are on JUnit/TestNG.
- **Migrating alphabetically.** Risk-first and churn-first, always. The stable tests can wait forever.
- **One giant PR.** Per-flow PRs keep CI green and let you ship value continuously. A 4,000-line migration PR will sit in review for two weeks and rot.
- **Throwing away Selenium's Grid coverage prematurely.** If you genuinely need a browser/OS matrix that Playwright's vendor support is thin on as of 2026, keep that slice on Selenium and migrate everything else. Mixed estates are fine.

## Who should make this migration

To keep this useful and balanced:

**Migrate to Playwright Java if** your Selenium suite is flaky, your team spends more time fighting waits and stale elements than writing tests, you debug failures by re-running and praying, and your browser matrix fits comfortably inside Chromium plus Firefox plus WebKit. The auto-waiting and trace viewer alone will pay for the effort.

**Stay on Selenium, or migrate only partially, if** you depend on the breadth of Selenium Grid and real-device clouds, you operate in an environment where Selenium's longer compliance track record matters, or your suite is small, stable, and simply not causing pain. There is no medal for migrating a green suite that nobody complains about.

**Reach for a natural-language CLI like BrowserBash if** a meaningful slice of your suite is low-value smoke and exploratory checks where hand-porting selectors is busywork, or you want a fast triage layer in front of the migration to decide what is worth coding at all. Compare the no-code and coded approaches honestly on the [BrowserBash pricing](https://browserbash.com/pricing) and [case study](https://browserbash.com/case-study) pages — the tool is free and local, so the experiment costs you nothing but a `npm install`.

## FAQ

### Does Playwright have an official Java binding or is it TypeScript only?

Playwright has an official, Microsoft-maintained Java binding published as `com.microsoft.playwright`. You write tests in plain Java and run them under JUnit 5 or TestNG. The important caveat is that the `@playwright/test` runner — with fixtures, projects, and component testing — is JavaScript and TypeScript only, so in Java you bring your own runner and get the automation library rather than the full native test framework.

### How do I migrate Selenium Java tests to Playwright incrementally?

Run both frameworks in the same Maven module and shrink Selenium test by test. Move existing tests into a frozen `legacy/` package, add the Playwright dependency, and use Maven profiles to run the old suite and the new one as separate CI jobs. Migrate the flakiest and highest-churn flows first, watch the Selenium job's test count drop to zero, then delete the dependency and the legacy profile in one final commit.

### Do I need to rewrite my page objects when moving to Playwright?

No, the page object pattern carries over directly and Playwright does not force a different architecture. What changes is that your page objects get noticeably thinner, because Playwright's auto-waiting absorbs most of the explicit-wait and retry scaffolding you wrote for Selenium. A common outcome is a page object dropping from around 200 lines to roughly 80, with the deleted lines being the flakiest ones in the file.

### Can BrowserBash replace my Playwright Java test suite?

No, and it is not meant to. BrowserBash is a free, open-source CLI for natural-language browser checks that drive a real Chrome browser without selectors, which makes it a strong triage and smoke-testing layer during a migration. It shines for low-value or exploratory tests where hand-porting selectors is busywork, but your durable, business-critical regression coverage still belongs in coded Playwright Java tests under JUnit or TestNG.

Ready to triage your smoke layer before you port a single line of Java? Install with `npm install -g browserbash-cli` and try a one-liner against your staging site. No account is required to run it; if you want the optional cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up).
