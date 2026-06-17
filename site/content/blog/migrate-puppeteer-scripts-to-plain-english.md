---
title: Replace Puppeteer Scripts With Plain-English Browser Tests
description: "How to migrate Puppeteer to natural language with BrowserBash: swap page.click chains for plain-English objectives and get structured CI results."
date: 2026-03-03
category: guide
---

If you maintain a wall of Puppeteer scripts, you already know the failure mode. A frontend engineer renames a class, a framework upgrade reshuffles the DOM, and suddenly `page.click('#submit-btn')` throws `No node found for selector` across half your suite — not because the feature broke, but because the address you hard-coded moved. This guide shows you how to migrate Puppeteer to natural language: how to replace those imperative `page.click` and `page.evaluate` chains with plain-English objectives that an AI agent executes against a real Chromium browser, and how to get structured, machine-readable results back so the whole thing still works in CI.

The tool doing the driving is [BrowserBash](https://www.npmjs.com/package/browserbash-cli), a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You install it with `npm install -g browserbash-cli`, write what you want to happen in English, and an agent reads the live page on every run and figures out the steps the way a person would. No selectors. No page objects. This is not a "delete Puppeteer and never look back" pitch — Puppeteer is excellent at a long list of jobs, and I'll be specific about where you should keep it. But for the end-to-end flows that keep breaking on selectors, moving to natural language is a real reduction in maintenance, and the migration is more mechanical than you'd expect.

## Why Puppeteer scripts rot over time

Puppeteer is a Node library from the Chrome team that drives Chrome and Chromium over the DevTools Protocol. It is fast, mature, and close to the metal. You get a `Browser`, you get `Page` objects, and you script every interaction imperatively. For scraping, PDF generation, screenshotting, and a great deal of end-to-end testing, it is the default reach in the Node ecosystem, and for good reason: sub-second actions, total control of the page, and execution that is byte-for-byte identical every run.

The cost is structural, and it's the same cost every selector-based tool carries. Your script is a list of instructions bound to the *structure* of the page rather than its *meaning*. Consider a typical fragment:

```javascript
await page.waitForSelector('#login-button');
await page.click('#login-button');
await page.waitForSelector('.inventory_list');
const title = await page.$eval('.product_label', el => el.textContent);
```

Every one of those strings is a coupling point. The `#login-button` id, the `.inventory_list` class, the `.product_label` selector inside `$eval` — each is a contract between your test and the current shape of the DOM. When a designer relabels "Login" to "Sign in," or a component library swaps a `<div>` for a `<button>`, or an A/B test injects a wrapper element, the selector stops resolving and the run goes red. The feature works perfectly. The translation layer you hand-wrote between "log in" and the markup is what failed.

Across a few hundred selectors and a year of UI churn, that translation layer becomes a second job. SDETs end up spending more time repairing locators and rebalancing `waitForSelector` timeouts than they spend writing coverage for new features. The `page.evaluate` blocks are worse: they're little islands of browser-context JavaScript that fail silently when the DOM they reach into changes, and they're invisible to most linters and type-checkers. That is the rot. It's not Puppeteer's fault — it's the inherent tax of describing *how* to drive the page instead of *what* you want to be true.

## What "migrate Puppeteer to natural language" actually means

When you migrate Puppeteer to natural language, you stop encoding the path through the DOM and start encoding the objective. Instead of fifteen lines of `goto`, `type`, `click`, and `$eval`, you write one sentence describing the outcome, and an agent reads the rendered page on each run and decides where to click.

Under the hood, BrowserBash drives a real browser through one of two engines. The default is **stagehand**, the MIT-licensed AI browser-automation framework from Browserbase, which is what most of your migrated flows will run on. The other is **builtin**, an in-repo Anthropic tool-use loop that drives the browser directly. Both end up controlling real Chromium, the same target Puppeteer drives — the difference is who writes the steps.

The model that powers the agent is yours to choose, and this is where BrowserBash differs from most hosted AI testing tools. It is Ollama-first: by default it auto-detects a free local model running on your machine, so there are no API keys and nothing leaves your laptop. If no local model is present, it resolves to `ANTHROPIC_API_KEY`, then to `OPENROUTER_API_KEY` — and OpenRouter includes genuinely free hosted models such as `openai/gpt-oss-120b:free`. On local models you can guarantee a $0 model bill, which matters when you're running a migrated suite hundreds of times a day in CI.

One honest caveat up front, because it shapes how you should plan the migration: very small local models (roughly 8B parameters and under) get flaky on long, multi-step objectives. They'll handle a three-step smoke test fine and then lose the thread on a ten-step checkout. The sweet spot for migrated end-to-end flows is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. Pick the model to fit the complexity of the objective and the migration goes smoothly. Push an 8B model at your hardest journey and you'll think the approach doesn't work when it's really a model-size problem.

## The before: a real Puppeteer login-and-checkout

Here's a compact, representative Puppeteer script — the kind that lives in real suites. It logs into a practice storefront, adds an item to the cart, completes checkout, and asserts on the confirmation text.

```javascript
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://www.saucedemo.com/');
  await page.type('#user-name', 'standard_user');
  await page.type('#password', 'secret_sauce');
  await page.click('#login-button');

  await page.waitForSelector('.inventory_list');
  await page.click('#add-to-cart-sauce-labs-backpack');
  await page.click('.shopping_cart_link');
  await page.click('#checkout');

  await page.type('#first-name', 'Bo');
  await page.type('#last-name', 'Basher');
  await page.type('#postal-code', '94016');
  await page.click('#continue');
  await page.click('#finish');

  const header = await page.$eval('.complete-header', el => el.textContent);
  if (!header.includes('Thank you for your order')) {
    console.error('Assertion failed:', header);
    await browser.close();
    process.exit(1);
  }

  console.log('Order confirmed');
  await browser.close();
})();
```

Count the coupling points: nine distinct selectors, one `$eval` reaching into `.complete-header`, and a manual `waitForSelector` to paper over a race. Every string is a future failure. The `#add-to-cart-sauce-labs-backpack` id in particular is the kind of thing that gets generated and regenerated by a build step and quietly changes shape. This script tells the future maintainer exactly *how* to click but says nothing about *why* — you have to reverse-engineer the intent from the DOM addresses.

## The after: one English objective

Here is the same flow as a BrowserBash objective. The intent is now explicit and the DOM addresses are gone.

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the Sauce Labs Backpack to the cart, complete checkout with name Bo Basher and ZIP 94016, and verify the page shows 'Thank you for your order!'"
```

There is nothing to map. The agent reads the page on every run and decides what to click. Rename `#login-button` to `#sign-in`, relabel "Login" to "Sign in," wrap the cart icon in a new container — the objective still passes, because the agent reads the new label rather than a stored selector. The thing you commit to git is now the *intent*, which doubles as documentation a product manager can read. When a teammate opens this line in six months, they know precisely what it verifies without parsing nine selectors.

This is the core of the migration: each Puppeteer script becomes one objective sentence. The `page.evaluate` blocks — those fragile islands of browser-context JavaScript — usually collapse into a clause of the objective like "verify the order total is $32.39" or "confirm the confirmation header reads 'Thank you for your order!'", because the agent can read and reason about page content without you writing extraction code.

## How the migration maps, piece by piece

The translation from imperative Puppeteer calls to natural-language clauses is consistent enough that you can do it almost mechanically. This table covers the patterns you'll hit most.

| Puppeteer pattern | Plain-English equivalent in the objective |
| --- | --- |
| `page.goto(url)` | "Go to {url}" |
| `page.type('#user', 'x')` | "log in as x" or "enter x in the username field" |
| `page.click('#submit')` | "click the submit button" or fold it into the next action |
| `page.waitForSelector('.list')` | (usually drop it — the agent waits for the page to settle) |
| `page.$eval('.h', el => el.textContent)` | "verify the page shows '...'" |
| `page.select('#country', 'US')` | "choose United States from the country dropdown" |
| `page.waitForNavigation()` | (implicit — the agent follows the flow) |
| `if (!text.includes(...)) process.exit(1)` | "verify ..." (the agent returns a pass/fail verdict) |

Two things are worth calling out. First, most of your `waitForSelector` and `waitForNavigation` plumbing disappears. A big chunk of Puppeteer flakiness comes from hand-tuned waits racing against the app; the agent's job is to observe the page until it's actionable, so you stop writing that layer. Second, your assertions become first-class. In Puppeteer an assertion is an `if` block that you wire to `process.exit`. In BrowserBash, "verify X" is part of the objective, and the run returns a verdict — pass, fail, or error — that you consume directly. No string parsing, no manual exit-code bookkeeping.

### Handling logins and secrets

You don't want `password secret_sauce` sitting in a shell history or a committed script. For anything beyond a throwaway demo, move the flow into a committable Markdown test, where BrowserBash gives you `{{variables}}` templating and, crucially, secret-marked variables that are masked as `*****` in every single log line — stdout, the recorded result file, the dashboard, everywhere.

```bash
browserbash testmd run ./checkout_test.md \
  --var username=standard_user \
  --secret password=secret_sauce
```

A `checkout_test.md` is just a Markdown file where each list item is a step, with `@import` for composition so you can share a "log in" block across many tests. After the run, BrowserBash writes a human-readable `Result.md` next to it. That file is the equivalent of your old `console.log('Order confirmed')` — except it captures every step, the verdict, and any masked secrets, in a form you can attach to a PR. For teams coming from Puppeteer, this is the natural home for the credentials that used to live in `.env` files and get `page.type`-d into login forms.

## Getting structured results for CI

The single biggest worry when you migrate Puppeteer to natural language is CI. Puppeteer scripts integrate cleanly: they exit non-zero on failure, and you can pipe their output anywhere. An AI agent that returns prose would be a regression. BrowserBash was built to avoid exactly that.

Add `--agent` and the run emits **NDJSON** — one JSON event per line — on stdout. One event per step, one final verdict event, all machine-readable. There is no prose to parse and no regex to maintain. The exit codes are explicit and stable:

- `0` — passed
- `1` — failed (objective ran but the verification didn't hold)
- `2` — error (something went wrong executing)
- `3` — timeout

That four-way distinction is more than a Puppeteer script gives you out of the box, where "failed assertion" and "selector threw" both tend to land as a generic non-zero exit. Here's a headless, CI-shaped invocation:

```bash
browserbash run "Log in as standard_user, add the backpack to the cart, check out, and verify 'Thank you for your order!'" \
  --agent --headless
```

In a GitHub Actions job, you check the exit code like any other command. A coding agent or test runner reads the NDJSON stream event by event and decides what to do — retry, open an issue, post a comment — without ever parsing English. This is the property that makes the migration safe: your pipeline contract (exit codes plus structured output) is *stronger* after the move, not weaker. If you want a deeper walkthrough of wiring this into pipelines, the [BrowserBash learn hub](https://browserbash.com/learn) has the CI patterns laid out.

### Recording runs for the failures you can't reproduce

Puppeteer's classic debugging gap is the run that fails in CI and passes locally. BrowserBash addresses it with `--record`, which captures a screenshot *and* a full `.webm` session video (via ffmpeg) on any engine. On the builtin engine you additionally get a Playwright trace you can open in the trace viewer and step through.

```bash
browserbash run "Complete checkout and verify the confirmation message" \
  --record
```

When a migrated flow goes red on the CI machine, you watch the video and see exactly what the agent saw — a cookie banner that covered the button, a slow third-party script, a layout shift. That's a level of post-mortem visibility most hand-written Puppeteer suites add only after a painful incident. There's more on capturing and replaying runs over on the [features page](https://browserbash.com/features).

## A staged migration plan that doesn't blow up your pipeline

Do not rewrite the whole suite in a weekend. The teams that succeed at this run both stacks in parallel and migrate by value. Here's the sequence I'd use.

**1. Start with your flakiest selector-bound tests.** Find the three or four end-to-end tests that break most often on locator changes — the login flow, the checkout, the signup. These are where natural language pays off fastest, because they're the ones costing you the most maintenance. Port each to a single objective and run it alongside the Puppeteer original for a week.

**2. Keep Puppeteer for everything it's good at.** Unit-level DOM assertions, PDF generation, screenshot pipelines, scraping with precise structured output, and any flow where you need byte-identical, sub-second, deterministic execution — leave those in Puppeteer. The goal is not zero Puppeteer. The goal is to stop spending your week repairing selectors for high-level journeys.

**3. Move credentials into Markdown tests with secrets.** As you port each flow, lift its login out of inline `page.type` calls into a `{{variable}}` marked as a secret. Now the same masked credential drives every test via `@import`, and it's masked everywhere it appears.

**4. Switch CI to exit codes and NDJSON.** Replace the bespoke pass/fail logging in your migrated tests with `--agent` and a check on the exit code. Your pipeline gets simpler, not harder.

**5. Pick the right model per flow.** Run smoke tests on a small local model if it holds up; promote your long, gnarly checkout journeys to a mid-size local model or a capable hosted model. This is the lever that determines whether your hardest migrated flows are reliable, so tune it deliberately rather than defaulting an 8B model at everything.

**6. Decide where the browser runs.** Local Chrome is the default and free. When you need scale or specific OS/browser matrices, the `--provider` flag points the same objective at a remote grid.

### Running the same objective on a remote grid

A migrated objective isn't tied to your laptop. The `--provider` flag switches where the browser runs without touching the objective text — local (your Chrome, the default), `cdp` for any DevTools endpoint, or hosted grids like LambdaTest, BrowserStack, and Browserbase.

```bash
browserbash run "Log in, add the backpack, check out, and verify 'Thank you for your order!'" \
  --provider lambdatest --agent
```

The same English sentence that ran on your machine now runs on a cloud grid for cross-browser coverage. With Puppeteer, retargeting to a grid usually means reworking the launch and connection code. Here it's one flag, because the objective never knew or cared which Chromium it was driving.

## Where Puppeteer is still the better tool

Credibility matters more than a clean pitch, so let me be plain about the cases where you should *not* migrate.

If you need **deterministic, sub-second, byte-identical runs**, Puppeteer wins. An AI agent reasons about the page each run, which adds latency and a small amount of non-determinism — that's the cost of resilience to UI change. For a 50-step regression that must execute identically every time at maximum speed, scripted Puppeteer is the right call.

If your job is **high-volume scraping with precise structured extraction** — pulling 10,000 product rows into a typed schema — Puppeteer's `page.evaluate` and `$$eval` give you exact control that's hard to beat. BrowserBash can extract data, but a tight scraping loop over a known DOM is squarely Puppeteer's territory.

If you're generating **PDFs, screenshots at scale, or doing low-level network interception and request mocking**, that's Puppeteer's home turf and there's no reason to move it.

And if your selectors genuinely never change — a stable internal tool with a frozen UI — the maintenance tax that justifies the migration simply isn't there. Don't fix what isn't rotting.

The honest framing is that this is not "AI replaces Puppeteer." It's "use natural language for the flows that keep breaking on selectors, and keep Puppeteer for the deterministic, low-level, high-volume work it's genuinely best at." Most real suites end up running both. If you want to see how teams split the two in practice, the [case studies](https://browserbash.com/case-study) walk through a few real setups, and the [pricing page](https://browserbash.com/pricing) confirms the CLI itself is free and open source.

## A quick reality check on the tradeoffs

| Dimension | Puppeteer scripts | BrowserBash objectives |
| --- | --- | --- |
| What you write | `goto`/`click`/`$eval` chains, by hand | One English sentence per flow |
| Breaks when | A selector or DOM structure changes | Rarely — agent re-reads the live page |
| Speed | Sub-second, deterministic | Slower, agent reasons each run |
| Maintenance | Ongoing selector and wait repair | Update the sentence if intent changes |
| CI integration | Exit codes, custom logging | `--agent` NDJSON, 4 explicit exit codes |
| Best at | Scraping, PDFs, low-level control | High-level journeys, smoke tests, signups |
| Model/API cost | None | $0 on local Ollama models |

Read that table as a division of labor, not a scoreboard. The right answer for most teams is some of each. You'll find more head-to-head detail across the [BrowserBash blog](https://browserbash.com/blog), including deeper dives on the engines and the agent mode.

## FAQ

### Can BrowserBash fully replace Puppeteer in my test suite?

For high-level end-to-end journeys that keep breaking on selectors — logins, signups, checkouts — yes, an English objective replaces the script cleanly. But for high-volume scraping, PDF generation, low-level network interception, and flows that must run deterministically at sub-second speed, Puppeteer remains the better tool. Most teams keep both and migrate only the flows where the selector-maintenance tax is highest.

### How do I keep BrowserBash tests working in CI without parsing prose?

Run the objective with the `--agent` flag. It emits NDJSON — one structured JSON event per line — instead of prose, and the process exits with explicit codes: 0 for passed, 1 for failed, 2 for error, and 3 for timeout. Your pipeline checks the exit code like any other command, and a runner or coding agent can read the NDJSON stream event by event with no regex involved.

### Do I need an API key or a paid model to migrate my Puppeteer scripts?

No. BrowserBash is Ollama-first and defaults to a free local model, so there are no API keys and nothing leaves your machine. If you prefer hosted models it resolves to an Anthropic key or an OpenRouter key, and OpenRouter offers genuinely free hosted models. For long, multi-step flows, use a mid-size local model or a capable hosted model rather than a very small one, which can get flaky on complex objectives.

### How do I handle passwords and secrets when moving login flows off Puppeteer?

Move the flow into a committable Markdown test and pass the credential as a secret-marked variable. BrowserBash masks any secret-marked value as `*****` in every log line, including stdout, the recorded result file, and the dashboard. This is cleaner than the inline `page.type('#password', '...')` calls common in Puppeteer scripts, and the same masked secret can drive many tests through `@import`.

Ready to swap your first `page.click` chain for a sentence? Install the CLI with `npm install -g browserbash-cli`, point it at your flakiest end-to-end flow, and watch it run against real Chromium. No account is required to get started, though you can optionally [sign up](https://browserbash.com/sign-up) for the free cloud dashboard with run history and video replay when you want it.
