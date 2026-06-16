---
title: How to Replace Selenium IDE With an AI Browser Agent
description: "A step-by-step guide to replace Selenium IDE with AI: migrate brittle .side recordings to plain-English BrowserBash markdown tests with @import and variables."
date: 2026-04-11
category: guide
---

If you want to replace Selenium IDE with AI, the migration is less about porting code and more about throwing away the part of your test that breaks most: the recorded locators. Selenium IDE gave a generation of QA teams a fast on-ramp to automation. You hit record, clicked through a flow, and got a replayable `.side` file. The catch shows up a sprint later, when a developer renames a button and your green suite turns red for reasons that have nothing to do with the product. This guide walks through a concrete, step-by-step migration from those brittle recordings to BrowserBash markdown tests — plain-English `*_test.md` files where an AI agent reads the live page on every run instead of replaying a frozen DOM snapshot.

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You install it with `npm install -g browserbash-cli`, write your intent as a sentence, and an AI agent drives a real Chrome browser step by step — no selectors, no page objects, no fallback XPath lists to maintain. It defaults to free local models through Ollama, so you can run an entire suite with a $0 model bill and nothing leaving your machine. By the end of this article you will know exactly how to map each recorded Selenese step to a plain-English objective, how to compose shared flows with `@import`, and how to keep credentials safe with `{{variables}}`.

## Why teams want to move off Selenium IDE

Selenium IDE is the record-and-playback member of the Selenium family — a browser extension for Chrome and Firefox, maintained by the Selenium project, that captures your clicks into a replayable test. The appeal is real and worth naming honestly. There is almost no learning curve. A manual tester who has never written a line of code can record a login, a search, and a checkout in ten minutes and have something that replays. For a quick bug repro you hand to a developer, or a smoke check on a stable internal tool, that speed is genuinely hard to beat.

The trouble is structural, not a bug you can patch. When you click a button, Selenium IDE does not store "the Add to Cart button." It stores a command (`click`), a target locator like `id=add-to-cart-sauce-labs-backpack` or an XPath, and often a list of guessed fallback locators. Your test is a frozen photograph of the DOM as it existed the moment you clicked. Every locator in it is a hard-coded assumption about page structure.

So the failures pile up in predictable ways:

- A redesign renames classes or restructures a menu, and a dozen recordings break at once even though the feature works fine.
- A flow that depends on timing replays faster than the app renders, and you sprinkle in waits that make the suite slow and still flaky.
- The recording reads as a wall of Selenese commands and XPaths that nobody but the author can review in a pull request.
- Running headless in CI means wiring up `selenium-side-runner`, a Node toolchain, and a grid — work that has nothing to do with the test itself.

None of this means Selenium IDE was a mistake. It means the record-replay model has a ceiling, and a lot of teams hit it. The reason to replace Selenium IDE with AI is to keep the low barrier to entry while removing the locator as a maintenance liability.

## What changes when you replace Selenium IDE with AI

The single biggest shift is that you stop describing *how* and start describing *what*. A recorded step says "click the element at `id=login-button`." A BrowserBash step says "click the Login button." The agent reads the live page the way a person does, decides which element satisfies the current step, acts, observes the result, and moves on. There is no `.side` file, no Selenese command table, and no fallback locator list to babysit.

Here is the same login-and-verify flow you might have recorded, written as a one-line objective against a public practice site:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first backpack to the cart, complete checkout, and verify the page shows 'Thank you for your order!'" \
  --headless \
  --record
```

That command opens a real Chrome browser, performs every step, and returns a verdict plus structured results. The `--record` flag captures a screenshot and a full `.webm` session video so you have visual proof of what happened. There were no locators anywhere in that sentence, which is exactly the point — when the DOM moves, the sentence still describes what you want, so it keeps working.

The model story matters here because it is what makes this practical for a whole team. BrowserBash is Ollama-first: it defaults to free local models, needs no API keys, and keeps everything on your machine. It auto-resolves a local Ollama install, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY` if you have set them. You can run hosted models through OpenRouter — including genuinely free options like `openai/gpt-oss-120b:free` — or bring your own Anthropic Claude key for the hardest flows. You can read more about the model and provider design on the [BrowserBash features page](https://browserbash.com/features).

One honest caveat before you migrate a hundred tests on day one: very small local models (roughly 8B parameters and under) can get flaky on long, multi-step objectives. They lose the thread on a ten-step checkout. The sweet spot for reliability is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. Start your migration with short, well-scoped tests and a decent model, and you will avoid blaming the tool for what is really a model-size problem.

## Step 1: Inventory and export your existing recordings

Before you write a single new test, take stock of what you have. Open each `.side` project and list the flows it covers — login, search, add to cart, checkout, account settings, and so on. Most suites have a long tail of recordings that overlap heavily: ten tests that all log in first, three that all open the same dashboard. Note those shared preludes, because they are going to become `@import` files and save you the most work.

For each recording, you do not need to read every locator. You need to read the *intent* of each step. Selenium IDE makes this easy: the command column already tells you the human action (`click`, `type`, `select`, `assertText`). Ignore the target column — that is the locator you are deliberately leaving behind. Write down, in one plain sentence per step, what a person doing this by hand would say out loud. "Type the username." "Click Login." "Verify the cart badge shows 1." That sentence is your migration unit.

If you want a paper trail, export the `.side` file's commands to a checklist. You are converting a machine-readable locator table into a human-readable objective list. That translation is the whole migration, and it is genuinely fast because you are deleting the brittle half.

## Step 2: Map each recorded step to a plain-English objective

This is the heart of the migration, so it is worth being precise. Selenium IDE steps come in a handful of recurring shapes, and each maps cleanly to a BrowserBash sentence. Here is the translation table I keep handy when converting a suite:

| Selenium IDE command | What it stored | BrowserBash plain-English step |
| --- | --- | --- |
| `open` `/login` | A URL path | "Open the login page at /login" |
| `type` `id=user` `standard_user` | Locator + value | "Type {{username}} into the username field" |
| `click` `id=login-button` | A target locator | "Click the Login button" |
| `select` `id=country` `India` | Dropdown locator + option | "Select India from the Country dropdown" |
| `assertText` `css=.title` `Products` | Locator + expected text | "Verify the page heading reads Products" |
| `assertElementPresent` `id=cart` | Locator presence | "Verify the cart icon is visible" |
| `waitForElementVisible` | An explicit wait | (delete it — the agent waits on its own) |

A few of those rows deserve a comment.

### Drop the explicit waits

In Selenium IDE you scatter `waitForElementVisible` and `pause` commands because the recorder replays at machine speed and races the page. The AI agent does not race. It reads the rendered page before each action and only proceeds when the element it needs is actually there. So `wait` commands have no equivalent — you delete them, and the flakiness they were patching over goes with them. This alone removes a large fraction of the noise from a typical recording.

### Collapse multi-step micro-actions

Recordings are noisy. A single human intent like "log in" might be four recorded commands: click the username field, type the username, click the password field, type the password, click submit. In BrowserBash you can keep those as separate steps for clarity, or collapse them into one objective: "Log in as {{username}} with password {{password}}." Both work. I lean toward one step per meaningful checkpoint, because the file then reads like a checklist a product manager could review.

### Turn assertions into verification language

Every `assertText`, `assertElementPresent`, and `verifyTitle` becomes a sentence starting with "Verify." The agent treats verification as a first-class objective and returns a pass/fail verdict on it. "Verify the page shows 'Thank you for your order!'" is a checkpoint the run will explicitly report on, not a brittle string match against one locator's `innerText`.

## Step 3: Write your first markdown test file

BrowserBash tests live in your repo as `*_test.md` files, where every list item is one step. They are committable, diffable, and reviewable in a pull request like any other code. Here is the recorded login flow from Step 2, fully migrated:

```markdown
# Login and checkout test

- Open https://www.saucedemo.com
- Log in as {{username}} with password {{password}}
- Verify the page heading reads "Products"
- Add the first backpack to the cart
- Verify the cart badge shows 1
- Open the cart and click Checkout
- Fill the checkout form with first name Test, last name User, and zip 12345
- Click Continue, then Finish
- Verify the page shows "Thank you for your order!"
```

Save that as `login_test.md` and run it:

```bash
browserbash testmd run ./login_test.md \
  --set username=standard_user \
  --set password='secret_sauce:secret' \
  --record
```

A couple of things are happening in that command. The `{{username}}` and `{{password}}` tokens are templated in at runtime via `--set`, so credentials never live in the committed file. The `:secret` suffix on the password marks it as a secret, which means BrowserBash masks it as `*****` in every log line, the `Result.md` report, and any uploaded run. After the run finishes, BrowserBash writes a human-readable `Result.md` next to your test — a plain record of each step and its outcome that you can open, read, and attach to a ticket.

Compare the readability. The `.side` equivalent was a JSON table of commands and XPaths that only the recorder could parse. The `_test.md` version is a checklist anyone on the team can read top to bottom and immediately understand. That is the reviewability win, and it is the reason these files survive redesigns that would shred a recording. There is a deeper walkthrough of the format on the [BrowserBash learn hub](https://browserbash.com/learn) if you want the full reference.

## Step 4: Factor shared flows with @import

Remember the overlap you inventoried in Step 1 — the ten tests that all log in first? In Selenium IDE you either re-recorded the login in every test or copy-pasted the commands, and then fixed all ten when the login changed. BrowserBash solves this with `@import`. You write the shared prelude once and splice it into every test that needs it.

Create a reusable login file:

```markdown
# login.md — shared login prelude

- Open https://www.saucedemo.com
- Log in as {{username}} with password {{password}}
- Verify the page heading reads "Products"
```

Then import it at the top of any test that starts logged in:

```markdown
# Checkout test

@import ./login.md

- Add the first backpack to the cart
- Open the cart and click Checkout
- Fill the checkout form with first name Test, last name User, and zip 12345
- Click Continue, then Finish
- Verify the page shows "Thank you for your order!"
```

Now the login lives in exactly one place. When the auth flow changes, you fix `login.md` once and every test that imports it is correct. This is the equivalent of page objects in a coded framework, except there is no code and no selectors — just composable English. For a suite that grew out of dozens of overlapping recordings, this single feature usually cuts the file count and the maintenance surface dramatically.

### A practical composition pattern

Most teams end up with a small library of import files: `login.md`, `open-dashboard.md`, `seed-cart.md`. Each test then reads as a short, specific story built on those shared building blocks. The discipline is the same one good page-object suites follow, but without the indirection — when you read a test, the imported steps are right there in plain English, not hidden behind a method name you have to go look up.

## Step 5: Wire the migrated tests into CI

The original reason many teams kept Selenium IDE around for CI was `selenium-side-runner` plus a grid. BrowserBash was built for CI from the start through its agent mode. Adding `--agent` makes the command emit NDJSON — one JSON event per line on stdout — instead of prose, and it sets meaningful exit codes: `0` passed, `1` failed, `2` error, `3` timeout. Your pipeline reads the exit code; no log scraping, no fragile prose parsing.

```bash
browserbash testmd run ./login_test.md \
  --agent \
  --headless \
  --set username=standard_user \
  --set password='secret_sauce:secret'
```

In a GitHub Actions or GitLab job, that command fails the build on a non-zero exit code exactly the way you want. Because each NDJSON line is a structured event, you can also pipe the output to a log collector and build dashboards on top of it. AI coding agents that orchestrate test runs consume the same stream, which is why agent mode exists in the first place — it is a machine interface, not a human one. There is a full breakdown of NDJSON event shapes and exit codes on the [BrowserBash blog](https://browserbash.com/blog).

For visibility, you have three options and none of them require an account. The fully local `browserbash dashboard` gives you run history on your own machine. The optional free cloud dashboard — strictly opt-in via `browserbash connect` and the `--upload` flag — stores run history, video recordings, and per-run replay for 15 days on free uploaded runs. And `--record` alone gives you a `.webm` and a screenshot per run that you can attach to a ticket or PR.

## Where you run the browser: providers

Selenium IDE's command-line runner pushed you toward a Selenium grid for parallel or cross-environment runs. BrowserBash separates *what to test* from *where the browser runs* with a single `--provider` flag. The default is `local` — your own Chrome — which is all most people need. When you want cloud browsers or a managed grid, you change one flag and nothing else about the test.

| Provider | Where the browser runs | Typical use |
| --- | --- | --- |
| `local` (default) | Your own Chrome/Chromium | Day-to-day dev and CI |
| `cdp` | Any DevTools endpoint | Self-hosted or custom browser infra |
| `browserbase` | Browserbase cloud | Managed cloud browsers |
| `lambdatest` | LambdaTest grid | Cross-browser at scale |
| `browserstack` | BrowserStack grid | Cross-browser at scale |

Running the exact same migrated test on a LambdaTest grid looks like this:

```bash
browserbash testmd run ./login_test.md --provider lambdatest --headless
```

The test file does not change. That separation is what lets you start every migration on free local Chrome and only reach for a paid grid when you actually need a browser or OS you do not have locally.

## A balanced look: when Selenium IDE is still the right call

An honest migration guide has to say where the old tool wins, and Selenium IDE genuinely does in a few cases.

If you need a throwaway bug repro to hand a developer in the next five minutes, the record button is faster than writing any sentences. If your team is happiest staying entirely inside the Selenium ecosystem and you already export `.side` files to WebDriver code that your engineers maintain, that pipeline is mature and well understood. And if you are automating against an old, stable internal tool whose DOM has not changed in three years and never will, the locator-brittleness that motivates this whole migration may simply never bite you. In that narrow case, "if it isn't broken" is fair advice.

There is also the determinism point, made fairly. A recorded `.side` step does exactly the same DOM operation every run. An AI agent makes a decision each run, and on an ambiguous page two capable models could choose slightly differently. For most end-to-end flows the agent's re-reading of the page is a feature, because it absorbs the DOM churn that breaks recordings. But if you have a flow where you need byte-for-byte identical interaction every single time and the page never changes, a recorded locator gives you that guarantee more cheaply. Match the tool to the job.

### Who should make the switch

The teams that get the most from replacing Selenium IDE with AI are the ones drowning in maintenance: suites that go red on every redesign, recordings nobody can review, flows that depend on credentials you do not want sitting in a committed file. If that describes your week, the migration pays for itself fast. You can see how that plays out in production on the [BrowserBash case study page](https://browserbash.com/case-study), and the [pricing page](https://browserbash.com/pricing) lays out what is free versus optional so you know exactly what a $0 setup looks like.

## A realistic migration timeline

You do not have to convert everything at once, and you should not. Here is the order that works.

Start with your three or four highest-value, most-flaky tests — the ones that break every release and waste the most of your time. Migrate those to `_test.md` files first, run them locally with `--record`, and confirm the verdicts match what the old recordings checked. Once you trust the format on the flows that hurt most, factor out the shared preludes into `@import` files. Then wire the migrated tests into CI with `--agent` and let the exit codes gate your builds. Keep the old `.side` files around in read-only mode until the new tests have survived a couple of releases, then delete them. Running both suites in parallel for a sprint is the cheapest insurance you can buy, and it lets you compare results on real failures rather than trusting a migration blind.

The mindset shift is the only hard part. You are no longer maintaining a map of where things are on the page. You are maintaining a description of what the page should do. That description survives the redesigns, the renamed buttons, and the restructured menus that used to turn your suite red — which is the entire reason to make the move.

## FAQ

### Can I import my existing Selenium IDE .side files directly into BrowserBash?

There is no automatic `.side` importer, and that is by design — the point of the migration is to discard the recorded locators, which is exactly what a `.side` file is built around. You convert by reading the command column of each recording (the human action) and writing one plain-English sentence per meaningful step into a `*_test.md` file. It is a manual pass, but a fast one, because you are deleting the brittle half of every test as you go.

### Will an AI browser agent be as reliable as a recorded Selenium IDE test?

For flows that change over time, the agent is usually more reliable because it re-reads the live page on every run instead of replaying a frozen DOM snapshot, so it absorbs redesigns that would break a recording. The honest caveat is model size: very small local models under about 8B parameters can lose the thread on long multi-step objectives. Use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, for hard flows, and start with short tests while you build trust.

### Does replacing Selenium IDE with AI cost money to run?

It can cost nothing. BrowserBash is free and open-source, defaults to free local models through Ollama with no API keys, and runs the browser on your own Chrome by default, so you can hit a genuine $0 model bill. You only pay if you choose a paid hosted model or a commercial grid provider like LambdaTest or BrowserStack, and even then the test files themselves do not change — you switch with one flag.

### How do I keep passwords out of my committed markdown tests?

Use `{{variables}}` for any sensitive value and pass it in at runtime with `--set`, so the credential never lives in the committed file. Mark it as a secret with the `:secret` suffix, like `--set password='secret_sauce:secret'`, and BrowserBash masks it as `*****` in every log line, the Result.md report, and any uploaded run. This is cleaner than Selenium IDE variables because the masking is automatic and applies everywhere the value would otherwise print.

Ready to migrate? Install with `npm install -g browserbash-cli`, convert your flakiest recording to a `_test.md` file, and run it on your own Chrome for free — no account required. When you want run history, video replay, and dashboards, an account is optional and you can [sign up here](https://browserbash.com/sign-up).
