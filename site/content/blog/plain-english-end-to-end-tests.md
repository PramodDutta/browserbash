---
title: How to Write End-to-End Tests in Plain English
description: "Write end-to-end tests in plain English with BrowserBash. Step-by-step guide to plain-language E2E tests an AI agent runs in a real browser — no selectors."
date: 2026-06-13
category: guide
---

End-to-end tests are the ones that matter most and hurt the most. They exercise the whole stack the way a user does — load the page, log in, click through a flow, confirm the outcome — and they are exactly the tests that rot fastest, because every one is welded to a wall of selectors. Rename a `data-testid`, move a button into a dropdown, regenerate a class name, and a green feature turns red for reasons that have nothing to do with whether the product works. This guide shows a different approach: how to write end-to-end tests in plain English, where you describe the user journey in ordinary sentences and an AI agent drives a real Chrome browser to carry it out and judge the result. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command below is real and runnable.

The premise is simple. Instead of writing code that *translates* "log in and check the dashboard" into `findElement(By.id(...))`, you write the sentence "log in and check the dashboard" and let the agent find the elements the way a person would. No page objects, no locators, no waits — just the steps, and an explicit assertion at the end.

## What "plain English" actually means here

It is worth being precise, because "natural language testing" gets thrown around loosely. In BrowserBash, a plain-English test is a sequence of instructions an agent reads, plans against the live page, and executes one step at a time in a real browser. There are two shapes you will use:

- A **one-off objective** passed to `browserbash run "..."` — perfect for a quick check or a CI verification step.
- A **committable markdown test** (a `*_test.md` file) where each list item is one step — the format for tests you keep, version, and review in pull requests.

Under the hood, BrowserBash ships two engines. The default is **Stagehand**, the MIT-licensed AI browser-automation framework from Browserbase, built around self-healing automation. The second is a **builtin** engine: an in-repo Anthropic tool-use loop driving Playwright, which also captures a Playwright trace when you record. You rarely choose engines by hand; for most local runs the default is what you want. The important property either way is that the agent *re-reads the page on every run*, so the test describes intent, not DOM structure.

That single shift — intent over structure — is why these tests survive UI churn that would shatter a selector script. It is also why they read like documentation: a product manager can review the test in a pull request and actually understand what it checks.

## Install and your first end-to-end test in five minutes

Install the CLI globally from npm:

```bash
npm install -g browserbash-cli
```

You need a model to drive the agent. BrowserBash is Ollama-first: it auto-detects a local [Ollama](https://ollama.com) install and uses it for free, with no API keys and nothing leaving your machine. If you have Ollama, pull a capable model:

```bash
ollama pull qwen3
```

A note from experience: small models in the 8B-and-under range tend to wander on multi-step objectives. A Qwen3 or Llama 3.3 70B-class model is the sweet spot for reliable end-to-end runs. If you would rather not run a local model, BrowserBash also auto-detects an Anthropic key, then falls back to OpenRouter — which includes genuinely free hosted models such as `openai/gpt-oss-120b:free`. The resolution order is Ollama, then Anthropic, then OpenRouter, so you can be running in minutes on whatever you already have.

Now write your first end-to-end test as a single sentence. This one is fully runnable as printed, because it targets a public practice app whose demo credentials are published on its own login page:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as tomsmith with password SuperSecretPassword!, and verify the page says 'You logged into a secure area'"
```

That is a complete end-to-end test: it navigates, authenticates, and asserts. A Chrome window opens, the agent finds the username and password fields and the submit button on its own, types, clicks, and checks for the success text. The `verify` clause is the assertion — if that text is missing, the run fails. You did not write a single selector, a wait, or a page object.

When you are ready to run it without a visible window — in CI, or just in the background — add `--headless`:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as tomsmith with password SuperSecretPassword!, and verify the page says 'You logged into a secure area'" --headless
```

## Anatomy of a good plain-English step

The agent is capable, but it is not a mind reader. The difference between a flaky test and a dependable one is almost always the wording. A few rules earn their keep on every test you write.

**Make the assertion explicit and specific.** "Check it worked" gives the agent nothing to verify against; "Verify the page says 'Thank you for your order!'" gives it an unambiguous pass/fail condition. End every meaningful step with a `verify` clause where an outcome should be visible. Vague steps produce vague verdicts.

**Describe what a user sees, not what the DOM contains.** Say "Click the New Invoice button," not "Click the element with class `btn-primary`." You are deliberately staying above the markup — that is the entire point. Referencing implementation detail throws away the resilience you came for.

**Capture values you will need later with "store ... as".** When a step produces something you want to keep — an order number, a confirmation ID, the logged-in user's name — phrase it as `store the order number as 'order_number'`. BrowserBash surfaces stored values in its structured output, which is how downstream steps and CI consumers get at them.

**Keep one objective focused.** An agent reasoning about a 30-step marathon is more likely to drift than one handling a tight 8-step flow. If a journey is long, split it into multiple runs or compose a markdown test from shared pieces (covered below). As a rule of thumb, anything past roughly fifteen steps is a candidate for splitting.

Apply those four and your plain-English tests stop being a novelty and start being something you trust to gate a merge.

## Handling logins and secrets without leaking them

Real end-to-end tests log in, and real logins involve credentials you must not paste into a command that ends up in your shell history or a CI log. BrowserBash handles this with a `--variables` payload and a `secret` flag. Use `{{placeholders}}` in the objective and supply their values as JSON; mark anything sensitive as secret:

```bash
browserbash run "Open {{base_url}}/login, log in as {{username}} with password {{password}}, and verify the dashboard heading is visible" \
  --headless \
  --variables '{"base_url":"https://staging.example.com","username":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

Because the password carries `"secret": true`, it shows as `***** ` in every log line and structured event — which matters a great deal when test transcripts get archived. The other values stay readable, so you can still tell at a glance which environment a run hit. Point `{{base_url}}` at staging in dev and at a preview deployment in CI, and the same objective travels everywhere without edits.

## Make it committable: markdown tests

A one-line objective is great for a quick check, but the tests you keep belong in version control where they can be reviewed, diffed, and reused. BrowserBash's format for that is the markdown test: a file ending in `_test.md` where each list item is one step and `{{variables}}` work exactly as they do on the command line.

```markdown
# Checkout end-to-end

- Open {{base_url}}
- Log in as {{username}} with password {{password}}
- Add the Sauce Labs Backpack to the cart
- Go to checkout and fill first name 'Bo', last name 'Basher', postal code '94016'
- Finish the order
- Verify the page says 'Thank you for your order!'
- Store the order confirmation text as 'confirmation'
```

Run it:

```bash
browserbash testmd run checkout_test.md --headless
```

After the run, BrowserBash writes a `Result.md` next to the file — the verdict, what happened at each step, and any values the test stored (like `confirmation` above). That report is readable by anyone: manual testers attach it to bug reports, and reviewers see test *changes* as plain-English diffs in pull requests. A test review stops being "trust me, the locators are right" and becomes a conversation about what the product should do.

The real payoff of the markdown format shows up when you have more than one test, because every login looks the same. Rather than copy-paste the login steps into a dozen files, put them in a helper and splice them in with `@import`:

```markdown
# Invoice creation end-to-end

@import ./helpers/login.md

- Click the New Invoice button
- Fill the customer field with {{customer_name}}
- Add a line item 'Consulting' priced at 1200
- Save the invoice and verify the status badge says 'Draft'
- Store the invoice number as 'invoice_number'
```

Imported steps are inserted in place, so every test authenticates identically and a login change is a one-file fix instead of a twelve-file hunt. The `{{placeholders}}` resolve from JSON files in `./.browserbash/variables/` (project) or `~/.browserbash/variables/` (global), so dev and CI can target different environments without touching the test. This is what living documentation looks like in practice — and there is a deeper write-up of the pattern over on the [BrowserBash blog](https://browserbash.com/blog).

## Running plain-English E2E tests in CI

A test you cannot run automatically is a demo, not a safety net. BrowserBash is built to gate merges, and it does so without making your pipeline parse prose. Two facts make the integration clean.

First, **the exit code is the verdict**: `0` passed, `1` failed, `2` error, `3` timeout. Your CI step succeeds or fails on that code alone — no log scraping. Second, the `--agent` flag switches stdout to **NDJSON**: one JSON object per line, with a stable schema, while everything human-readable goes to stderr. Step events stream as they happen, and the final line is always a single `run_end` event carrying the status, a summary, and every value the test stored.

```bash
browserbash testmd run checkout_test.md --agent --headless --timeout 180
```

A minimal GitHub Actions job is just an install and a run:

```yaml
- run: npm install -g browserbash-cli
- run: browserbash testmd run checkout_test.md --agent --headless --timeout 180
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The exit code fails the job exactly when the test fails, and `--timeout` bounds any run that would otherwise hang. Because the NDJSON schema is stable, the same flag also makes BrowserBash callable by AI coding agents that need to verify their own work in a real browser — they read the `run_end` event instead of guessing from output. If you want to dig into the event schema and the bash-plus-`jq` patterns around it, the [learn section](https://browserbash.com/learn) has the full reference.

## Recording runs and pushing to a dashboard

When a flow fails — or when you just want evidence — turn on recording. The `--record` flag captures a screenshot and a session video (a `.webm` stitched with ffmpeg) on any engine; the builtin engine additionally captures a Playwright trace.

```bash
browserbash testmd run checkout_test.md --record --headless
```

Everything stays on your machine by default — nothing is uploaded unless you ask. There is a free, private local dashboard for browsing runs and replays:

```bash
browserbash dashboard
```

And if you want shareable run history with per-run replay, create a free account, connect once, and push a run to the cloud dashboard with `--upload`:

```bash
browserbash connect --key bb_your_key_here
browserbash testmd run checkout_test.md --record --upload --headless
```

Cloud runs on the free tier are retained for 15 days. The privacy default is the part worth underlining: `--upload` is opt-in, so an end-to-end test never sends anything off your laptop unless you explicitly tell it to.

## Cross-browser and cloud grids by changing one flag

End-to-end tests often need to run somewhere other than your laptop — a CI grid, a contractually required vendor, a remote browser an agent already controls. BrowserBash treats *where the browser runs* as a runtime decision, controlled by `--provider`, with no test edits:

```bash
# Local Chrome (default) — watch it run during development
browserbash testmd run checkout_test.md

# A cloud grid in CI — same file, one flag
browserbash testmd run checkout_test.md --provider lambdatest --headless
```

The providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. One detail to know: Stagehand cannot attach to LambdaTest or BrowserStack sessions, so when you pass one of those providers BrowserBash automatically switches to its builtin engine, which speaks the Anthropic API — meaning grid runs need `ANTHROPIC_API_KEY` set (or `ANTHROPIC_BASE_URL` pointed at an Anthropic-compatible gateway). You never pass `--engine` yourself; the switch is automatic, and the same markdown file runs unchanged across all of them.

## Plain English vs. traditional E2E frameworks

To be fair, plain-English testing is not a free lunch, and selector-based frameworks remain the right tool for large stretches of testing. Here is an honest comparison against the established approach.

| Dimension | Plain-English (BrowserBash) | Selector-based (Playwright, Selenium, Cypress) |
| --- | --- | --- |
| How you write a test | English sentences / markdown steps | Code: locators, page objects, waits |
| Resilience to UI changes | High — agent re-reads the page each run | Low — selectors break on markup changes |
| Who can author and review | Anyone, including non-coders | Engineers comfortable with the framework |
| Speed per test | Slower — model inference per step | Fast — direct DOM calls, milliseconds per action |
| Determinism | Goal-deterministic, not path-identical | Bit-identical execution every run |
| Cost model | Free with local Ollama; tokens with hosted models | No per-run model cost |
| CI contract | Exit codes + NDJSON, no parsing | Framework reporters / JUnit XML |
| Best fit | Smoke, journey, fast-changing UIs, new coverage | Deep regression walls, pixel-precise checks |

The two real tradeoffs deserve naming. **Speed**: a WebDriver click is milliseconds, while every BrowserBash step includes model inference, so a single login that a selector script finishes in seconds typically lands in the tens-of-seconds range. For a dozen smoke tests that is irrelevant; for an 800-test regression wall it is disqualifying. **Determinism**: a coded test executes the same instructions every time, whereas an agent plans at run time and two runs may take slightly different paths to the same outcome. BrowserBash narrows that gap with explicit `verify` steps and exit codes as the contract, but the result is goal-determinism, not trace-identical execution.

### When to choose which

Reach for **plain English** when you need coverage *today* for a flow that does not exist yet, when the UI churns weekly and selector maintenance is eating your time, for smoke and journey tests that confirm "is this build sane?", and for any test you want a non-engineer to read and review. The authoring cost is a sentence, and the test survives the refactors that would break a selector.

Keep **selector-based frameworks** for the deep regression suite where you have hundreds of stable tests, for sub-second-per-test budgets, for pixel-precise interactions and visual assertions, and anywhere a network-free, bit-identical execution trace is mandatory for compliance.

The two coexist comfortably in one repo and one pipeline — both gate merges by exit code. The realistic pattern most teams land on is to keep their existing regression suite intact and move their most selector-fragile smoke and journey tests to plain English, where the maintenance pain is worst and the resilience win is biggest.

## A repeatable workflow

Putting it together, here is the loop that works in practice. Start by writing the journey as a single `browserbash run "..."` objective and watch it execute locally with a visible browser, so you can see exactly where the agent's understanding diverges from yours. Tighten the wording until it passes reliably: specific `verify` clauses, user-visible language, `store ... as` for the values you care about. Move the steps into a `*_test.md` file, factor the login into an `@import` helper, and commit it so it lives in code review. Wire it into CI with `--agent --headless --timeout`, letting the exit code gate the merge. Turn on `--record` for the runs you need evidence from, and reach for `--provider` only when the browser needs to live somewhere other than your machine. Each stage is small, and nothing you wrote in the first step gets thrown away in the last.

## FAQ

### Do I really not need any selectors or page objects?

Correct — you write no locators, no page objects, and no explicit waits. You describe each step the way a user would understand it ("Click the New Invoice button," "Verify the page says 'Draft'"), and the agent finds the elements on the live page at run time. That is precisely why these tests survive UI refactors that break selector-based suites: there is no hardcoded reference to the DOM to go stale.

### Are plain-English tests deterministic enough to gate a CI merge?

Treat the exit code as the contract. A `verify` step fails the run with exit code `1` when its assertion is false, and `--timeout` plus focused objectives bound any wandering, so the pass/fail signal is solid for smoke and journey gates. It is goal-determinism rather than trace-identical execution, which is the right tool for fast-moving end-to-end coverage but not a drop-in replacement for a bit-for-bit compliance suite.

### How do I keep passwords and tokens out of logs?

Pass sensitive values through `--variables` (or a variables JSON file) and mark each one as `{"value":"...","secret":true}`. BrowserBash masks secrets as `*****` in every log line and in the NDJSON `run_end` event, so credentials never appear in your shell history, CI logs, or archived transcripts — only the non-secret values, like the base URL, stay readable.

### What does it cost to run these tests?

With the default Ollama resolution there is no per-run model cost — the model runs locally on your hardware, free and offline. If you prefer hosted models, OpenRouter includes free options such as `openai/gpt-oss-120b:free`, and you can bring your own Anthropic key for Claude when a flow needs more capability. BrowserBash itself is free and open source under Apache-2.0, so the tooling never costs anything.

---

Ready to write your first end-to-end test as a sentence? Install with `npm install -g browserbash-cli` from the [npm package page](https://www.npmjs.com/package/browserbash-cli), then [create a free account](https://browserbash.com/sign-up) when you want shareable run history and cloud replays. BrowserBash is free and open source — point it at your staging URL and convert your single most selector-fragile end-to-end test first.
