---
title: Convert Selenium IDE Recordings to Plain-English Tests
description: "Convert Selenium IDE to natural language tests: translate exported .side click-and-type recordings into resilient, AI-driven BrowserBash objectives."
date: 2026-05-06
category: guide
---

If you have a folder of `.side` files gathering dust, you already know the problem. You recorded a checkout flow once, it ran green for a week, then a designer renamed a button and the whole script collapsed. This guide walks through how to convert Selenium IDE to natural language tests: you take those exported click-and-type recordings, read what they were actually trying to do, and rewrite each one as a plain-English objective an AI agent can carry out in a real browser. The tool we'll use is [BrowserBash](https://browserbash.com), a free, open-source CLI, and the goal is simple — keep the intent of your recordings and throw away the brittle selectors that keep breaking them.

Selenium IDE is a genuinely good recorder. It is the fastest way I know to capture a flow without writing code, and it has helped thousands of QA folks ship their first automated test. The trouble is not the recording. The trouble is what gets recorded: a sequence of low-level commands frozen to a specific DOM at a specific moment. That snapshot ages badly. By the end of this article you'll have a repeatable method for converting any `.side` export into an objective that survives a redesign, plus the honest trade-offs so you know when to keep Selenium and when to move on.

## What a Selenium IDE recording actually contains

Open any `.side` file in a text editor and you'll see JSON. Each test is an array of commands, and each command has three meaningful fields: a `command` (like `click`, `type`, `select`, or `assertText`), a `target` (the locator), and a `value` (text to type, an expected string, and so on). A trimmed recording for a login-and-checkout flow looks roughly like this:

```json
{
  "commands": [
    { "command": "open", "target": "/login", "value": "" },
    { "command": "type", "target": "id=user-name", "value": "standard_user" },
    { "command": "type", "target": "id=password", "value": "secret_sauce" },
    { "command": "click", "target": "css=#login-button", "value": "" },
    { "command": "click", "target": "css=.inventory_item:nth-child(1) button", "value": "" },
    { "command": "click", "target": "id=cart", "value": "" },
    { "command": "click", "target": "css=#checkout", "value": "" },
    { "command": "assertText", "target": "css=.complete-header", "value": "Thank you for your order!" }
  ]
}
```

Two things matter here. First, the `target` values are coordinates into a DOM tree — `css=.inventory_item:nth-child(1) button` is a literal path that means "the button inside the first inventory item." Second, buried in the noise is the actual test intent: log in, add the first product to the cart, check out, and confirm the order succeeded. A human reading this understands the goal in five seconds. Selenium IDE only stored the mechanics.

When you convert Selenium IDE to natural language, you are extracting that second layer — the intent — and discarding the first. The selectors were never the point. They were a means to an end that the recorder happened to capture.

### The locator-priority problem

Selenium IDE records every element with a fallback chain of locators: an id, a CSS path, an XPath, sometimes link text. On replay it tries them in priority order. This sounds resilient and isn't. If the primary id changes and the recorded CSS fallback also points at a now-stale structure, the command fails. You don't get a "the button moved" message; you get `NoSuchElementException` and a stack trace. The fallback chain papers over small drift but shatters on anything structural, like a column that became a card or a single-page step that became a wizard.

## Why recorded selectors break and AI intent does not

Recorded selectors break because they encode *implementation*, not *meaning*. Here are the failure modes I've watched eat afternoons, ranked by how often they happen.

**Auto-generated class names.** Modern build tools hash CSS class names — `.btn_a3f9c` today, `.btn_7e21b` after the next deploy. Any recording that pinned to one of those is dead the moment CI rebuilds the frontend. Selenium IDE recorded it because it was on the page; it had no way to know the name was disposable.

**Positional CSS.** `nth-child(1)` is a time bomb. Add a promotional banner above the product grid, reorder a list, A/B test a layout, and "the first item" is now something else entirely. The selector still resolves — it just resolves to the wrong element, which is worse than failing, because your test goes green while testing nothing.

**XPath tied to structure.** `//div[2]/div[3]/button` survives exactly as long as nobody touches the markup. One wrapper `<div>` for a new analytics widget and every index shifts.

**Dynamic ids.** Frameworks emit ids like `input-field-9e2a` that change per render. A recording captures one instance; replay never sees it again.

An AI-driven objective sidesteps all four because it never stores a selector. When BrowserBash runs "add the first product to the cart," the agent looks at the live page, reasons about which element is a product and which control adds it to a cart, and clicks. If the class name changed, it doesn't care — it was never reading the class name. If a banner pushed the grid down, it still finds the product grid. The instruction is written at the level of human intent, so it tolerates everything below that level changing.

This is the core trade. Selectors are precise and brittle. Intent is fuzzy and durable. Recorded tests optimize for the wrong one.

### Where AI intent has its own failure mode — said honestly

I'm not going to pretend natural-language automation is free of risk. It has a different failure mode, and you should know it before you migrate anything important. An AI agent can misread an ambiguous page. If "the first product" is genuinely unclear — say two grids on screen — the agent might pick the wrong one. The fix is to write objectives that are specific enough to be unambiguous to a careful human reading them cold. "Add the first product in the main catalog to the cart" beats "add the first product." You're trading selector maintenance for prompt clarity, and on balance that's a far better deal, but it is a trade, not a free lunch.

## Setting up BrowserBash before you convert anything

BrowserBash is a CLI you install once. It writes plain-English objectives that an AI agent executes in a real Chrome or Chromium browser, step by step, with no selectors and no page objects, and it returns a pass/fail verdict plus structured results.

```bash
npm install -g browserbash-cli
browserbash run "Go to the SauceDemo login page, log in as a standard user, add the first product to the cart, complete checkout, and confirm the page shows 'Thank you for your order!'"
```

The model story matters for adoption, so here it is straight. BrowserBash is Ollama-first: by default it uses free local models, needs no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. You can run a $0 model bill entirely on local models, or bring an Anthropic Claude key, or use OpenRouter — including genuinely free hosted models such as `openai/gpt-oss-120b:free`.

One honest caveat that's directly relevant to migrating recordings: very small local models (roughly 8B parameters and under) get flaky on long, multi-step objectives. A converted checkout flow with eight or nine steps is exactly the kind of long objective that trips them up. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If your first converted test wanders, that's the first dial to turn — not your prompt. You can read more setup detail on the [BrowserBash learn pages](https://browserbash.com/learn).

## The conversion method, command by command

Here's the repeatable process. Open the `.side` file, walk the command list top to bottom, and collapse runs of low-level commands into one plain-English sentence per logical action. Use this mapping as your cheat sheet.

| Selenium IDE command | What it really means | Plain-English equivalent |
| --- | --- | --- |
| `open` / `get` | Navigate to a page | "Go to the checkout page" |
| `type` into a field | Enter data | "Enter the username and password" |
| `click` a button | Trigger an action | "Click the login button" / "Add to cart" |
| `select` from dropdown | Choose an option | "Select 'Express' shipping" |
| `assertText` / `verifyText` | Check a result | "Confirm the page shows 'Order complete'" |
| `waitForElementPresent` | Wait for load | (drop it — the agent waits naturally) |
| `pause` | Hard sleep | (drop it — almost always unnecessary) |
| `storeText` / `${var}` | Capture a value | "Note the order number shown" |

Two rows deserve emphasis. The `waitFor*` and `pause` commands are pure mechanical scaffolding that exists because Selenium replays faster than pages render. An AI agent observes the page between steps, so you delete those rows entirely. Removing them is not lossy — it removes noise the recorder added, not intent you care about.

### Worked example: the login-and-checkout recording

Take the JSON from earlier. Walking it command by command and collapsing runs:

- `open /login` plus the two `type` commands plus the login `click` → **"Log in as a standard user."**
- The product `click` → **"Add the first product to the cart."**
- The cart `click` and checkout `click` → **"Go to the cart and start checkout."**
- The final `assertText` → **"Confirm the page shows 'Thank you for your order!'"**

Eight recorded commands become four readable instructions. Now write them as a single objective:

```bash
browserbash run "On the SauceDemo store: log in as a standard user, add the first product in the catalog to the cart, go to the cart and complete the full checkout, then confirm the final page shows 'Thank you for your order!'" --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg, so you get visual proof the converted flow ran. On the builtin engine you also get a Playwright trace you can open in the trace viewer — useful while you're still building trust in the migration.

### Handling assertions, the part people get wrong

The most common migration mistake is dropping the assertion. A recording that ends in `assertText` is testing something; an objective that ends in "complete checkout" is not — it just performs the flow. Always carry the verification across. The phrase "confirm the page shows X" turns a script into a test, because BrowserBash's verdict depends on that check passing. If you only port the actions, you've built a clicker, not a test. The realistic example flow BrowserBash ships with — log in, add to cart, check out, verify "Thank you for your order!" — keeps that final assertion for exactly this reason.

## Turning converted flows into committable Markdown tests

Running a one-liner is fine for a spot check, but you migrated recordings because you want them in version control. BrowserBash supports committable `*_test.md` files where each list item is a step. This is the natural home for a converted `.side` file — it reads like the recording's intent, lives in your repo, and diffs cleanly in code review.

```markdown
# Checkout smoke test

- Go to {{baseUrl}} and log in with username {{username}} and password {{password}}
- Add the first product in the catalog to the cart
- Open the cart and start checkout
- Fill in the shipping details and place the order
- Confirm the page shows "Thank you for your order!"
```

Run it with:

```bash
browserbash testmd run ./checkout_test.md --record --upload
```

Markdown tests support `{{variables}}` templating and `@import` composition, so you can keep one login fragment and import it into every converted flow instead of repeating the login steps in each file — the same DRY win that page objects gave you in Selenium, without the selectors. Variables marked as secret are masked as `*****` in every log line, so a converted recording that hard-coded a password (like the `secret_sauce` in our example) gets a real security upgrade in the process. Every run also writes a human-readable `Result.md`. There's more on the Markdown format and templating over on the [features page](https://browserbash.com/features).

### Migrating a whole suite, not one file

If you're converting a folder of recordings, do it in waves. Start with smoke tests — short, high-value flows like login and a single purchase. Get those green and trusted before you touch the long regression scripts, because the long ones are where small local models struggle and where ambiguous steps hide. Keep the original `.side` files around until the converted versions have run clean for a couple of weeks; there's no prize for deleting them early.

## Wiring converted tests into CI

A migration that only runs on your laptop hasn't really happened. BrowserBash has an agent mode built for exactly this. The `--agent` flag emits NDJSON — one JSON event per line — on stdout, with no prose to parse. Exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. That maps directly onto how a CI step decides to go red or green.

```bash
browserbash run "Log in, add the first product to the cart, complete checkout, and confirm 'Thank you for your order!'" --agent --headless
```

Run it `--headless` on a CI runner, pipe the NDJSON to whatever collects your results, and let the exit code gate the pipeline. Because the events are structured, an AI coding agent in your CI can read them too — handy if you're building self-healing or auto-triage on top. This is the piece recorded Selenium tests never had cleanly: a machine-readable contract instead of a screenshot and a log you have to eyeball.

If you want run history, per-run video replay, and a dashboard, that's strictly opt-in. `browserbash connect` plus `--upload` sends runs to a free cloud dashboard (free uploaded runs are kept 15 days), or you can run a fully local dashboard with `browserbash dashboard` and keep everything on your machine. No account is required to run anything; the dashboard is a convenience, not a gate. Pricing details — including what stays free — are on the [pricing page](https://browserbash.com/pricing).

## Choosing where the converted browser runs

One thing Selenium IDE never gave you easily was choice of execution environment without rewriting code. BrowserBash switches providers with a single `--provider` flag while the objective text stays identical.

| Provider | Where the browser runs | Good for |
| --- | --- | --- |
| `local` (default) | Your own Chrome | Development, debugging, $0 runs |
| `cdp` | Any DevTools endpoint | A browser you already manage |
| `browserbase` | Hosted cloud browser | Scaling out without local resources |
| `lambdatest` | LambdaTest cloud grid | Cross-browser coverage at scale |
| `browserstack` | BrowserStack cloud | Existing BrowserStack contracts |

So a flow you converted from a `.side` file and validated locally can run on a cloud grid by appending one flag:

```bash
browserbash run "Log in, add the first product to the cart, complete checkout, and confirm 'Thank you for your order!'" --provider lambdatest
```

You also get a choice of engine. The default is `stagehand` (MIT-licensed, by Browserbase); the alternative is `builtin`, an in-repo Anthropic tool-use loop that additionally captures a Playwright trace when you record. For most converted recordings the default is the right starting point.

## When to keep Selenium IDE and when to convert

I promised an honest decision section, so here it is — including the cases where you should not migrate.

**Keep Selenium IDE when:** you need exact, deterministic, pixel-level reproducibility of a specific DOM interaction; you're testing a static internal tool that genuinely never changes its markup; your organization has deep WebDriver Grid infrastructure and the recordings are stable and cheap to maintain. If a recording has run green untouched for a year, it owes you nothing — leave it alone. Selenium IDE is also still the better tool for the initial *capture* of an unfamiliar flow; recording is faster than writing prose from scratch. There's no rule against recording in Selenium IDE and then converting the export.

**Convert to natural-language objectives when:** your recordings break on every redesign; selectors are auto-generated or hashed by your build; the flows are user journeys (login, search, checkout, onboarding) rather than narrow widget tests; you want tests a non-engineer can read in code review; you want them in CI as structured events instead of brittle scripts. This is the majority of UI tests at most product companies, which is why the migration is usually worth it.

**Be cautious when:** the flow is genuinely long (a dozen-plus steps) and you're on a small local model — split it or move up to a 70B-class or hosted model first. And when a step is ambiguous, fix the wording before you blame the tool. The honest summary: natural language wins on durability and readability, Selenium IDE wins on raw determinism for static pages, and the right answer for most teams is a phased migration that keeps the recordings around as a safety net. You can see how teams have approached this in the [case studies](https://browserbash.com/case-study).

## A realistic before-and-after

To make the contrast concrete, here's the same test in both worlds. The Selenium IDE version, expressed as its command list:

```
open /login
type id=user-name "standard_user"
type id=password "secret_sauce"
click css=#login-button
click css=.inventory_item:nth-child(1) button
click id=cart
click css=#checkout
type id=first-name "Jane"
type id=last-name "Doe"
type id=postal-code "94016"
click id=finish
assertText css=.complete-header "Thank you for your order!"
```

Twelve commands, four hashed-or-positional selectors that will break, and a hard-coded password sitting in plain text. The converted objective:

```markdown
- Go to {{baseUrl}} and log in with username {{username}} and password {{password}}
- Add the first product in the catalog to the cart
- Open the cart and proceed to checkout
- Enter shipping details for Jane Doe, postal code 94016, and finish the order
- Confirm the page shows "Thank you for your order!"
```

Five readable steps, zero selectors to maintain, the password masked as `*****` in logs, and a file your product manager can review. When the store gets redesigned next quarter, the Selenium version needs a re-record. The converted version needs nothing.

## FAQ

### What is a .side file in Selenium IDE?

A `.side` file is the project format Selenium IDE saves recordings in. It's JSON that stores your tests as ordered lists of commands, each with a command name (like click or type), a target locator, and an optional value. When you convert Selenium IDE to natural language, you read the intent out of that command list and rewrite it as a plain-English objective, discarding the brittle locators.

### Why do recorded Selenium selectors break so often?

Recorded selectors pin to the page's implementation — auto-generated class names, positional CSS like nth-child, structural XPath, and dynamic ids. All of those change when the frontend is rebuilt or redesigned, even if the user-facing behavior is identical. An AI agent reads the live page and acts on intent instead, so it tolerates the markup underneath changing.

### Can I convert a whole Selenium IDE suite at once?

Yes, but convert in waves rather than all at once. Start with short, high-value smoke tests, get them running green and trusted, then move to longer regression flows. Keep the original recordings until the converted versions have run clean for a couple of weeks, since long multi-step flows are where small local models and ambiguous wording cause the most trouble.

### Do I need to keep the assertions from my recordings?

Absolutely keep them. A recording's assertText or verifyText command is the only thing that makes it a test rather than a clicker. When you convert, always carry the check across as a "confirm the page shows X" step, because BrowserBash's pass or fail verdict depends on that verification actually passing.

Ready to convert your first recording? Install with `npm install -g browserbash-cli`, take any `.side` export, and rewrite it as a plain-English objective tonight. No account is needed to run anything locally — and if you later want hosted runs, video replay, and run history, you can [sign up here](https://browserbash.com/sign-up) when you're ready.
