---
title: Migrate Robot Framework Suites to AI Browser Testing
description: "Learn how to migrate Robot Framework to AI testing: convert keyword-driven .robot files and SeleniumLibrary calls into plain-English BrowserBash objectives."
date: 2026-04-15
category: guide
---

If you maintain a Robot Framework suite, you already know its two faces. The good face is readability: a `.robot` file reads almost like English, and a business analyst can follow a test without knowing Python. The bad face shows up in the resource files, where `${LOGIN_BUTTON}` points at an XPath that broke three sprints ago and nobody noticed until the nightly run went red. The question this guide answers is when and how to migrate Robot Framework to AI testing without throwing away what Robot got right. We will convert real keyword-driven cases and SeleniumLibrary calls into BrowserBash Markdown objectives, and I will be honest about where Robot's explicit structure still beats a probabilistic agent.

This is not a "Robot Framework is dead" piece. Robot is a mature, well-governed tool with a deep ecosystem, and for a lot of teams it is the correct choice. What has changed is that a second option now exists for browser flows: instead of binding every step to a locator, you describe the objective in plain English and an AI agent drives a real Chrome browser to satisfy it. That shifts the maintenance burden in a way that matters most for exactly the kind of brittle UI tests Robot users complain about. So let's look at both honestly.

## What Robot Framework actually gives you

Robot Framework is a generic, keyword-driven automation framework. It is not a browser tool by itself; it is a test orchestration engine with a plain-text, tabular syntax. You write test cases as sequences of keywords, and those keywords come from libraries. For web testing, the heavy lifter has historically been SeleniumLibrary (and increasingly Browser Library, which wraps Playwright). A typical login test looks like this:

```robotframework
*** Settings ***
Library    SeleniumLibrary
Resource   resources/locators.robot

*** Test Cases ***
Valid Login
    Open Browser    ${URL}    chrome
    Input Text      ${USERNAME_FIELD}    standard_user
    Input Text      ${PASSWORD_FIELD}    secret_sauce
    Click Button    ${LOGIN_BUTTON}
    Wait Until Page Contains    Products
    Close Browser
```

There is a lot to admire here. The case is declarative, the keywords are reusable, and `locators.robot` keeps every selector in one place so a UI change theoretically means one edit. Robot's reporting is genuinely excellent: `log.html` and `report.html` are some of the most readable artifacts in the entire testing world. Tags, suites, setup and teardown, data-driven templates, and a `--rerun-failed` flag are all first-class. This is a serious tool with two decades of refinement behind it.

The structure is also the cost. Every one of those `${...}` variables is a locator you own forever. When the front-end team renames a class, swaps a `<button>` for a `<div role="button">`, or reorders the DOM, your `locators.robot` file is where the pain lands. The keyword `Wait Until Page Contains    Products` is robust against text; the `Click Button    ${LOGIN_BUTTON}` line is not robust against anything. In a large suite, the resource files quietly become the most-edited files in the repository, and that maintenance is invisible in your test logic.

### The keyword-driven model in one sentence

Robot's core idea is that a test is a list of named actions whose implementations live elsewhere. That indirection is the source of both its readability and its upkeep. You are always maintaining two layers: the human-readable case and the machine-readable locator behind each keyword.

## What changes when you migrate Robot Framework to AI testing

BrowserBash takes a different stance. There is no locator layer. You write a plain-English objective, and an AI agent reads the live page, decides what to click, types into the right field, and returns a verdict plus structured results. The same login flow becomes a sentence:

```bash
browserbash run "Log in to the store with username standard_user and password secret_sauce, then confirm the Products page loads"
```

No `Open Browser`, no `${LOGIN_BUTTON}`, no resource file. The agent figures out which element is the login button by looking at the rendered page the way a person would. When the front-end team swaps that `<button>` for a styled `<div>`, the objective does not change, because "log in" is still true. That is the headline reason teams want to migrate Robot Framework to AI testing: the locator-upkeep tax largely disappears for UI flows.

BrowserBash is a free, open-source (Apache-2.0) CLI from The Testing Academy. You install it with `npm install -g browserbash-cli` and run it with the `browserbash` command. It defaults to local Ollama models, so no API keys are required and nothing leaves your machine unless you opt in. It will auto-resolve a local Ollama install first, then fall back to `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` if you prefer a hosted model. You can read more about the model story and the broader approach in the [BrowserBash learn hub](https://browserbash.com/learn).

Here is the honest trade, stated plainly. Robot's locators are deterministic: `${LOGIN_BUTTON}` resolves to exactly one element or fails loudly. An AI agent is probabilistic: it usually finds the right element, and occasionally it misreads an ambiguous one. You are trading guaranteed precision and high upkeep for low upkeep and occasional non-determinism. Whether that trade is good depends on your suite, which is what the rest of this guide is about.

## A side-by-side comparison

| Dimension | Robot Framework (SeleniumLibrary) | BrowserBash AI objectives |
| --- | --- | --- |
| Test definition | Keywords + locator variables | Plain-English objective |
| Locator maintenance | You own every selector | None; agent reads the page |
| Determinism | High and explicit | Probabilistic, model-dependent |
| Readability for non-coders | Excellent (tabular keywords) | Excellent (plain sentences) |
| Setup cost | Python, Selenium, drivers, libs | `npm install -g browserbash-cli` |
| Reporting | Best-in-class `log.html`/`report.html` | `Result.md`, video, optional dashboard |
| CI integration | XML/JUnit output, exit codes | NDJSON agent mode, exit codes |
| Data-driven tests | Templates, `[Template]` keyword | `{{variables}}` in Markdown tests |
| Native/non-web | Many libraries (API, SSH, mobile) | Web/browser only |
| Cost | Free and open source | Free; $0 model bill on local models |

Two rows deserve a flag because they cut against AI testing. First, "Native/non-web": Robot Framework is a general automation engine with libraries for HTTP APIs, databases, SSH, mobile, and desktop. BrowserBash does one thing, browser automation. If your Robot suite mixes API setup, DB assertions, and UI checks in a single case, you are not migrating that whole case; you are migrating the UI portion. Second, "Determinism": for compliance-critical flows where a test must behave identically every single run, Robot's explicit locators are a feature, not a bug.

## Converting your locator files into objectives

The migration mechanics are simpler than they sound, because most of the work is deletion. Your `locators.robot` resource file does not get ported; it gets retired. The intent encoded across your keywords and locators collapses into a short objective. Walk through a real conversion.

Take this slightly larger Robot case, a checkout flow:

```robotframework
*** Test Cases ***
Complete Checkout
    Open Browser              ${URL}    chrome
    Input Text                ${USERNAME_FIELD}    standard_user
    Input Text                ${PASSWORD_FIELD}    secret_sauce
    Click Button              ${LOGIN_BUTTON}
    Click Element             ${ADD_TO_CART_BACKPACK}
    Click Element             ${CART_ICON}
    Click Button              ${CHECKOUT_BUTTON}
    Input Text                ${FIRST_NAME}    Jane
    Input Text                ${LAST_NAME}     Doe
    Input Text                ${ZIP}           94016
    Click Button              ${CONTINUE_BUTTON}
    Click Button              ${FINISH_BUTTON}
    Page Should Contain       Thank you for your order!
    Close Browser
```

That is fourteen keyword lines and roughly ten locators behind them. The BrowserBash equivalent is a single committable Markdown test, where each list item is a step and the agent resolves every element at runtime:

```markdown
# Checkout flow

- Go to {{url}}
- Log in with username {{username}} and password {{password}}
- Add the backpack to the cart
- Open the cart and start checkout
- Enter first name Jane, last name Doe, and ZIP 94016
- Continue and finish the purchase
- Confirm the page shows "Thank you for your order!"
```

Save that as `checkout_test.md` and run it:

```bash
browserbash testmd run ./checkout_test.md
```

Notice what survived the migration and what did not. The flow logic survived: every business step is still there, in order, just as readable as the Robot version, arguably more so. The assertion survived almost verbatim, because `Page Should Contain    Thank you for your order!` was already an intent-based check, and that is the kind of Robot keyword that ports cleanly. What did not survive is the entire locator layer. There is no `${ADD_TO_CART_BACKPACK}` to maintain, no `${CHECKOUT_BUTTON}` to fix when the markup shifts. That deletion is the whole point.

### Handling variables and secrets

Robot uses `${VARIABLES}` and often a `variables.py` or a `--variable` flag for environment-specific data. BrowserBash Markdown tests use `{{variables}}` templating, and they add something Robot users usually bolt on themselves: secret masking. Mark a variable as a secret and it is rendered as `*****` in every log line, the `Result.md`, and any uploaded run. So a password never appears in your CI output.

```bash
browserbash testmd run ./checkout_test.md \
  --var url=https://store.example.com \
  --var username=standard_user \
  --secret password=secret_sauce
```

For shared steps, Robot's `Resource` files have a direct analog: the `@import` directive lets you compose Markdown tests, so a reusable "log in" block lives in one file and gets pulled into many. That preserves the DRY structure Robot taught you to value, without preserving the locators.

## Reporting and CI: matching Robot's strongest feature

I said Robot's reporting is best-in-class, and I meant it. Any migration argument has to address what you give up there. You do give up `log.html`'s exact format. What you get instead is different but genuinely useful. After every run, BrowserBash writes a human-readable `Result.md` you can commit alongside the test. With the `--record` flag, it captures a screenshot and a full `.webm` session video using ffmpeg, on any engine, so you can watch exactly what the agent did. On the built-in engine, it additionally captures a Playwright trace you can open in the trace viewer, which is the closest analog to the step-by-step debugging Robot users expect.

```bash
browserbash testmd run ./checkout_test.md --record
```

For CI, this is where the migration gets cleaner than you might fear. Robot emits JUnit-compatible XML and meaningful exit codes, and your pipeline parses those. BrowserBash has an agent mode built for exactly this world. The `--agent` flag emits NDJSON, one JSON event per line on stdout, with no prose to parse. The exit codes map onto pipeline expectations directly: 0 for passed, 1 for failed, 2 for error, 3 for timeout. So a Jenkins or GitHub Actions step that used to read Robot's XML can read structured JSON events instead, and the green/red gate logic is just the exit code.

```bash
browserbash testmd run ./checkout_test.md --agent --headless
```

If you want run history, per-run replay, and video without standing up your own storage, there is a fully local dashboard via `browserbash dashboard`, and an optional free cloud dashboard you opt into with `browserbash connect` and the `--upload` flag. Uploaded runs are kept 15 days on the free tier. No account is required to run anything locally; the dashboard is strictly opt-in. The [features page](https://browserbash.com/features) has the full breakdown of recording, providers, and engines.

## Where Robot Framework is still the better fit

A migration guide that only sells the destination is not worth reading. There are real cases where you should keep Robot, and naming them honestly is the point.

Keep Robot when your suite is genuinely multi-protocol. If a single test case opens an API session, seeds a database, runs an SSH command, and then validates the UI, that orchestration is Robot's home turf. BrowserBash handles the browser leg; it does not replace RequestsLibrary, DatabaseLibrary, or SSHLibrary. You would end up calling BrowserBash from within a Robot keyword, not replacing Robot.

Keep Robot when you need strict, reproducible determinism for regulatory or contractual reasons. A pharma validation suite or a financial control test that must behave identically on every run, with an audit trail tied to exact locators, is better served by explicit selectors than by a probabilistic agent. The very flexibility that makes AI testing low-maintenance makes it less suitable when "did the exact same DOM path get clicked" is itself the requirement.

Keep Robot when you have a large, stable suite and a team fluent in it. If your locators rarely break because your UI rarely changes, the maintenance argument for migrating weakens considerably. Migration has a cost. If the brittleness you would be fixing is mostly theoretical for your app, the rational move is to leave the working suite alone and adopt AI testing only for new, fast-changing surfaces.

### The honest model caveat

There is one more limitation you must plan around, and it is about the model, not the tool. AI agents are only as reliable as the model driving them. Very small local models, roughly 8B parameters and under, can be flaky on long, multi-step objectives: they lose the thread, misread an ambiguous element, or declare success too early. The practical sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If your first migration attempt feels unreliable, the fix is usually a bigger model, not abandoning the approach. Treat the model like a dependency you tune, the same way you would tune a flaky `Wait Until` timeout in Robot.

## A practical migration sequence

You do not rip out Robot in a weekend. Here is the order I would run a real migration in.

Start by listing your flakiest UI tests, the ones whose locators break most often. Those are where AI testing pays off fastest, and where the migration risk is lowest because the tests are already unreliable. Convert two or three of them to Markdown objectives and run them side by side with the Robot originals for a sprint. You want to see the agent pass the same flows the Robot suite passes, on the same builds, before you trust it.

Next, wire the converted tests into CI in agent mode but non-blocking. Let them report alongside the Robot suite without gating the build. Watch the NDJSON output and the recorded videos for a week. You are looking for two things: false failures (the agent reports a bug that is not real) and false passes (the agent declares success when the flow actually broke). A false pass is the more dangerous failure mode for any AI tester, so weight your review toward those.

Once the converted tests are stable, flip them to blocking and delete the corresponding Robot cases and their orphaned locators. Keep the multi-protocol and compliance-critical Robot cases exactly where they are. The end state for most teams is not "all Robot" or "all AI" but a split: Robot for orchestration and deterministic control tests, AI objectives for the fast-moving UI surface. If you want to see how teams structure that split in practice, the [case studies](https://browserbash.com/case-study) and the broader [BrowserBash blog](https://browserbash.com/blog) walk through real examples.

### Running across providers

One more parallel with Robot worth drawing: just as Robot can target a Selenium Grid or a cloud device farm, BrowserBash can run the browser somewhere other than your laptop. The default `local` provider uses your own Chrome. Switch with a single `--provider` flag to a CDP endpoint, Browserbase, LambdaTest, or BrowserStack, so the same Markdown objective can run on a grid you already pay for.

```bash
browserbash testmd run ./checkout_test.md --provider lambdatest --record
```

That means migrating off SeleniumLibrary does not mean abandoning the cross-browser infrastructure you already invested in. The objective stays identical; only the execution target changes.

## Putting it together: a realistic before and after

To make the trade concrete, picture a mid-size suite: 120 UI tests, a `locators.robot` file with 300 selectors, and a recurring pattern where roughly 15 of those tests go red after any significant front-end refactor, costing a day of locator archaeology per refactor. Of those 120 tests, suppose 90 are pure UI flows and 30 mix in API or DB steps.

After migration, the 90 pure UI flows become 90 Markdown objectives with zero locators between them. The 300-line locator file shrinks to whatever the 30 multi-protocol tests still need, or disappears entirely if you call BrowserBash from those tests for the UI leg. The next front-end refactor that would have reddened 15 tests now reddens far fewer, because "log in and check out" survives a DOM rewrite. You did not gain determinism; you traded it for not spending a day on selectors every refactor. For a fast-moving product, that is usually the right trade. For a frozen legacy app under audit, it is not. That asymmetry is the whole decision, and you now have the pieces to make it for your own suite.

## FAQ

### Can I migrate Robot Framework to AI testing all at once?

You can, but you should not. A safer migration converts your flakiest UI tests first and runs them in parallel with the Robot originals for a sprint before deleting anything. Keep multi-protocol and compliance-critical Robot cases as they are. Most teams end up with a hybrid suite rather than a full replacement.

### Do I still need to maintain locators after migrating to BrowserBash?

No. BrowserBash has no locator layer. You write a plain-English objective and the AI agent reads the live page to find elements at runtime, so your `locators.robot` resource file is retired rather than ported. That removed upkeep is the main reason teams migrate, though you trade it for the agent's probabilistic behavior.

### How does BrowserBash handle Robot's variables and secrets?

Robot's `${VARIABLES}` map to BrowserBash's `{{variables}}` templating in committable Markdown tests, and shared steps map to the `@import` directive instead of `Resource` files. Secrets are a built-in: mark a variable as a secret and it is masked as `*****` in every log line, the `Result.md`, and any uploaded run. You pass them on the command line with `--var` and `--secret`.

### Is BrowserBash free, and does it replace Robot's reporting?

BrowserBash is free and open source under Apache-2.0, and you can guarantee a $0 model bill by running local models. It does not reproduce Robot's `log.html` exactly, but it writes a readable `Result.md`, captures screenshots and `.webm` video with `--record`, and offers a local or optional free cloud dashboard for run history and replay. For CI, agent mode emits NDJSON with clean exit codes.

Ready to convert your first `.robot` file? Install with `npm install -g browserbash-cli`, point it at a flaky login or checkout flow, and watch the locators disappear. No account is needed to run locally; if you later want hosted run history and replay, sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) when you are ready.
