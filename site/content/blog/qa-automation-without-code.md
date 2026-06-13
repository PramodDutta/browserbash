---
title: QA Automation Without Code: Plain-English Browser Testing
description: "QA automation without code: write browser tests in plain English and let an AI agent run them in a real Chrome. No selectors, free and open source."
date: 2026-06-13
category: use-case
---

Most manual QA testers hit the same wall when they try to move into automation: the job stops being about *testing* and becomes about *programming*. You start with a clear idea — "log in, add an item to the cart, check out, confirm the order" — and within an hour you are fighting `WebDriverWait`, hunting for a stable CSS selector, and debugging why a `StaleElementReferenceException` killed a test that was passing yesterday. The product knowledge that made you good at finding bugs gets buried under syntax. This guide is about a different path: **QA automation without code**, where you write the test as plain English sentences and an AI agent drives a real browser to carry them out and judge the result. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command here is real and runnable.

To be clear up front about what "without code" means: you will still open a terminal, you will still commit test files to a repo, and you will still think rigorously about edge cases — that is the part of QA that no tool replaces. What goes away is the translation layer. You no longer convert "click the Sign In button" into `driver.findElement(By.cssSelector("button.auth-submit")).click()`. You write "click the Sign In button," and the agent finds it on the live page the way a person would.

## Why selectors are the wall, not automation itself

It is worth naming the real obstacle, because "I can't code" is rarely the whole story. Plenty of sharp manual testers can read a `for` loop. The thing that actually grinds people down is the selector — the brittle string that ties a test to the exact shape of the HTML at the moment you wrote it.

A selector-based test does not describe what a user does; it describes where an element sits in the DOM right now. So when a developer renames a class, wraps a button in a new `div`, or lets a build tool regenerate `class="css-1x9z3k"` on every deploy, your test breaks — even though the feature works perfectly. The failure has nothing to do with product quality, and chasing it teaches you nothing about your application. You spend your afternoon updating locators so a green feature can go back to green.

For a manual tester, this is a brutal trade. You came to automation to *save* time on regression, and instead you have signed up for a second job maintaining a wall of strings that snap every sprint. This is where most "I tried automation and gave up" stories come from. It is not the loops. It is the locators.

Plain-English testing removes that maintenance surface entirely. There is no hardcoded reference to the DOM, so there is nothing to go stale when the markup shifts. You describe intent; the agent re-reads the page on every run and figures out the *where* itself.

## How plain-English browser testing actually works

BrowserBash is a command-line tool. You write an objective in ordinary English, and an AI agent drives a **real Chrome or Chromium browser** — not a simulation, the actual browser your users use — to accomplish it. At the end you get a verdict (pass or fail) plus structured results you can read or feed into other tools.

Under the hood there are two engines, and for the most part you never think about them. The default is **Stagehand**, the MIT-licensed, open-source browser-automation framework from Browserbase, built around self-healing automation. The second is a **builtin** engine: an in-repo Anthropic tool-use loop driving Playwright, which additionally captures a Playwright trace when you record. The property both share is that the agent reads the live page and plans each step at run time, so your test expresses *what should happen*, not *which element to grab*.

To drive the agent you need a model, and this is where BrowserBash stays genuinely free. It is **Ollama-first**: it auto-detects a local [Ollama](https://ollama.com) install and uses it with no API keys and nothing leaving your machine. If you would rather not run a local model, it also supports OpenRouter — which includes free hosted models such as `openai/gpt-oss-120b:free` — and Anthropic's Claude if you bring your own key. The resolution order is Ollama, then Anthropic, then OpenRouter, so you can be testing in minutes on whatever you already have.

## Your first test in five minutes

Install the CLI globally from npm:

```bash
npm install -g browserbash-cli
```

If you have Ollama, pull a capable model. A word of hard-won advice: very small models (8B and under) tend to wander on multi-step tasks, so a Qwen3 or Llama 3.3 70B-class model is the reliable sweet spot for real test flows.

```bash
ollama pull qwen3
```

Now write a complete test as a single sentence. This one runs exactly as printed, because it targets a public practice app whose demo credentials are published right on its own login page:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as tomsmith with password SuperSecretPassword!, and verify the page says 'You logged into a secure area'"
```

That is a full end-to-end test. A Chrome window opens; the agent finds the username and password fields and the submit button on its own, types, clicks, and checks for the success text. The `verify` clause is the assertion — if that text is missing, the run fails. You wrote no selector, no wait, no page object. Watch it the first few times; seeing the agent navigate a page you know is the moment automation stops feeling like programming.

When you want it to run without a visible window — in the background, or later in CI — add `--headless`:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as tomsmith with password SuperSecretPassword!, and verify the page says 'You logged into a secure area'" --headless
```

## Writing a good plain-English step

The agent is capable, but it is not a mind reader, and the gap between a flaky test and a dependable one is almost always the wording. As a manual tester this plays directly to your strengths — you already know how to describe a flow precisely, because you have written hundreds of bug reproduction steps. The same discipline applies. A few rules earn their keep on every test.

**Make the assertion explicit and specific.** "Check it worked" gives the agent nothing to measure against. "Verify the page says 'Thank you for your order!'" gives it an unambiguous pass/fail condition. End every meaningful step with a `verify` where an outcome should be visible on screen. This is the single highest-leverage habit you can build.

**Describe what a user sees, not what the page contains.** Say "Click the Checkout button," not "Click the element with id `checkout-btn`." Staying above the markup is the entire point — referencing implementation detail throws away the resilience you came for.

**Capture values you will need later with "store ... as".** When a step produces something worth keeping — an order number, a confirmation ID, the logged-in user's name — phrase it as `store the order number as 'order_number'`. BrowserBash surfaces stored values in its structured output, so downstream steps and any CI tooling can read them.

**Keep one objective focused.** An agent reasoning about a 30-step marathon is likelier to drift than one handling a tight 8-step flow. If a journey is long, split it or compose it from shared pieces (more on that below). Anything past roughly fifteen steps is a candidate for splitting.

Apply those four and your plain-English tests stop being a party trick and start being something you would trust to gate a release.

## Handling logins and secrets safely

Real QA flows log in, and real logins involve credentials you must never paste into a command that lands in your shell history or a CI log. BrowserBash handles this with a `--variables` payload: use `{{placeholders}}` in the objective, supply their values as JSON, and mark anything sensitive as `secret`.

```bash
browserbash run "Open {{base_url}}/login, log in as {{username}} with password {{password}}, and verify the dashboard heading is visible" \
  --headless \
  --variables '{"base_url":"https://staging.example.com","username":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

Because the password carries `"secret": true`, it shows as `*****` in every log line and structured event — which matters a great deal when test transcripts get archived or shared with a teammate. The other values stay readable, so you can still tell at a glance which environment a run hit. Point `{{base_url}}` at staging during development and at a preview deployment in CI, and the same sentence travels everywhere without an edit.

## Making tests committable: markdown test files

A one-line objective is perfect for a quick check, but the tests you keep belong in version control, where they can be reviewed, diffed, and reused. BrowserBash's format for that is the **markdown test**: a file ending in `_test.md` where each list item is one step, and `{{variables}}` work exactly as they do on the command line.

This format is the real unlock for a manual tester moving into automation, because the test *is* the test case. There is no gap between the human-readable steps in your test management tool and the executable script — they are the same document.

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

After the run, BrowserBash writes a `Result.md` next to the file — the verdict, what happened at each step, and any values the test stored (like `confirmation` above). That report is readable by anyone: you can attach it to a bug ticket, hand it to a product manager, or drop it into a release thread. And in a pull request, a *change* to a test shows up as a plain-English diff. A reviewer who has never written a line of Selenium can look at the diff and tell you whether the test now checks the right thing. Test review stops being "trust me, the locators are correct" and becomes a conversation about product behavior.

The payoff compounds once you have more than one test, because every flow starts with the same login. Instead of copy-pasting those steps into a dozen files, put them in a helper and splice them in with `@import`:

```markdown
# Profile update end-to-end

@import ./helpers/login.md

- Click the Account menu and open Settings
- Change the display name to {{new_name}}
- Save and verify the page says 'Profile updated'
```

Imported steps are inserted in place, so every test authenticates identically, and a login change becomes a one-file fix instead of a twelve-file hunt. Placeholders resolve from JSON files in `./.browserbash/variables/` (project) or `~/.browserbash/variables/` (global), so dev and CI target different environments with no edit to the test itself. If you want a deeper walkthrough of the markdown format and the import pattern, the [BrowserBash blog](https://browserbash.com/blog) has more on it.

## Recording runs so a failure is self-explanatory

Manual testers know the pain of "works on my machine" — a bug a developer cannot reproduce dies in the backlog. BrowserBash kills that argument with recordings. The `--record` flag captures a screenshot and a session video (a `.webm`, stitched with ffmpeg) on any engine; the builtin engine additionally captures a Playwright trace you can step through.

```bash
browserbash testmd run checkout_test.md --record --headless
```

Everything stays on your machine by default — nothing is uploaded unless you explicitly ask. There is a free, private local dashboard for browsing your runs and replaying them:

```bash
browserbash dashboard
```

When a flow fails, you do not file a vague ticket. You attach a video of the exact moment it broke. That single habit changes how developers receive your bug reports.

## Running tests automatically in CI

A test you have to remember to run by hand is a checklist item, not a safety net. The whole point of automation is that it runs without you. BrowserBash is built to gate merges, and — crucially — it does so **without making your pipeline parse prose**, which is the part that trips up most homegrown automation.

Two facts make the integration clean. First, **the exit code is the verdict**: `0` passed, `1` failed, `2` error, `3` timeout. Your CI step succeeds or fails on that code alone — no log scraping, no fragile string matching. Second, the `--agent` flag switches stdout to **NDJSON**: one JSON object per line on a stable schema, with everything human-readable going to stderr. Step events stream as they happen, and the final line is always a single `run_end` event carrying the status, a summary, and every value the test stored.

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

The exit code fails the job exactly when the test fails, and `--timeout` bounds any run that would otherwise hang. You do not need to understand the NDJSON schema to get value here — the exit code alone is enough for a passing gate. But because that schema is stable, the same flag also makes BrowserBash callable by AI coding agents that need to verify their own work in a real browser. If you want the full event reference and the bash-plus-`jq` patterns around it, the [learn section](https://browserbash.com/learn) covers it in detail.

## Scaling to shared run history and cloud browsers

Everything so far runs on your laptop, which is the right default — your tests and credentials stay local. Two flags extend that when a team needs more.

When you want shareable run history with per-run replay — so a teammate or manager can see what ran and watch the recording without it living on your machine — create a free account, connect once, and push a run to the cloud dashboard with `--upload`:

```bash
browserbash connect --key bb_your_key_here
browserbash testmd run checkout_test.md --record --upload --headless
```

The privacy default is worth underlining: `--upload` is opt-in. Nothing leaves your machine unless you pass it. Cloud runs on the free tier are retained for 15 days.

The second flag handles *where the browser runs*. By default BrowserBash uses your local Chrome, but tests often need to run somewhere else — a CI grid, or a cloud browser vendor your team already pays for. That is a one-flag change, `--provider`, with no edit to the test:

```bash
# Local Chrome (default) — watch it run while you author
browserbash testmd run checkout_test.md

# A cloud grid — same file, one flag
browserbash testmd run checkout_test.md --provider lambdatest --headless
```

The providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. One thing to know: Stagehand cannot attach to LambdaTest or BrowserStack sessions, so when you pass one of those, BrowserBash automatically switches to its builtin engine — which speaks the Anthropic API, meaning those grid runs need `ANTHROPIC_API_KEY` set. You never pass `--engine` yourself; the switch is automatic, and the same markdown file runs unchanged across all of them.

## An honest look at the tradeoffs

Plain-English testing is not magic, and it is not a replacement for everything a coded framework does. If you are moving from manual QA into automation, you deserve a clear-eyed picture so you point this tool where it shines.

| Dimension | Plain-English (BrowserBash) | Selector-based (Playwright, Selenium, Cypress) |
| --- | --- | --- |
| How you author a test | English sentences / markdown steps | Code: locators, page objects, waits |
| Resilience to UI changes | High — agent re-reads the page each run | Low — selectors break on markup changes |
| Who can write and review | Anyone, including non-coders | Engineers fluent in the framework |
| Speed per test | Slower — model inference per step | Fast — direct DOM calls, milliseconds per action |
| Determinism | Goal-deterministic, not path-identical | Bit-identical execution every run |
| Cost model | Free with local Ollama; tokens with hosted models | No per-run model cost |
| CI contract | Exit codes + NDJSON, no parsing | Framework reporters / JUnit XML |
| Best fit | Smoke, journey, fast-changing UIs, new coverage | Deep regression walls, pixel-precise checks |

Two tradeoffs deserve to be named plainly. **Speed**: a WebDriver click is milliseconds, while every BrowserBash step includes model inference, so a single login that a coded script finishes in seconds typically lands in the tens-of-seconds range. For a dozen smoke tests that is irrelevant; for an 800-test regression wall it is disqualifying. **Determinism**: a coded test runs the same instructions every time, while an agent plans at run time, so two runs may take slightly different paths to the same outcome. Explicit `verify` steps and the exit-code contract narrow that gap, but the result is goal-determinism, not trace-identical execution.

The practical takeaway for someone leaving manual testing: do not try to convert an entire legacy regression suite on day one. Point plain English at the flows where it wins biggest — the smoke tests, the critical user journeys, and the screens whose markup churns every sprint and breaks selector scripts constantly. Those are the tests that hurt most to maintain by hand and break most often when coded against selectors, and they are exactly where writing a sentence beats writing forty lines.

## A workflow that actually sticks

Here is the loop that works in practice, and none of it asks you to become a software engineer first. Start by writing a flow you know cold as a single `browserbash run "..."` objective, and watch it execute locally with a visible browser so you can see exactly where the agent's reading of the page diverges from yours. Tighten the wording until it passes reliably — specific `verify` clauses, user-visible language, `store ... as` for the values you care about. Move the steps into a `*_test.md` file, factor the login into an `@import` helper, and commit it so it lives in code review alongside the product. Wire it into CI with `--agent --headless --timeout` and let the exit code gate the merge. Turn on `--record` for the flows you need evidence from, and reach for `--provider` only when the browser has to live somewhere other than your machine. Each step is small, builds on your existing testing instincts, and nothing you wrote in the first stage gets thrown away in the last.

## FAQ

### Do I really need zero coding skills to use this?

You need to be comfortable opening a terminal and running a command, and you should be willing to commit test files to a Git repo — that is the floor. But you write no locators, no page objects, no waits, and no programming-language syntax. The skills that actually matter are the ones you already have from manual testing: describing a flow precisely and thinking through what a correct outcome looks like. If you can write a clear bug reproduction, you can write a BrowserBash test.

### How is this different from recording clicks with a tool like Selenium IDE?

Click recorders capture the selectors of the exact elements you touched, so the recording is just as brittle as hand-written locators — change the markup and the recording breaks. BrowserBash records nothing about the DOM. Your test is a description of intent, and the agent finds the right elements fresh on every run by reading the live page. That is why a plain-English test survives the UI refactors that shatter a recorded script.

### Is plain-English testing reliable enough to gate a real release?

Treat the exit code as the contract. A `verify` step fails the run with exit code `1` when its assertion is false, and `--timeout` plus focused objectives bound any wandering, so the pass/fail signal is solid for smoke and journey gates. It is goal-determinism rather than bit-identical execution, which makes it an excellent fit for fast-moving coverage but not a drop-in replacement for a compliance suite that requires a reproducible trace. Most teams run both side by side, gated the same way.

### What does it cost to run these tests?

The tool itself is free and open source under Apache-2.0, so the tooling never costs anything. With the default Ollama resolution there is no per-run model cost either — the model runs locally on your hardware, free and offline. If you prefer hosted models, OpenRouter includes free options such as `openai/gpt-oss-120b:free`, and you can bring your own Anthropic key for Claude when a flow needs more capability. You can run a full suite without ever entering a credit card.

---

If you have been putting off automation because the selector grind made it feel like a programming job instead of a testing one, this is the on-ramp. Install with `npm install -g browserbash-cli` from the [npm package page](https://www.npmjs.com/package/browserbash-cli), write your most-repeated manual check as a single sentence, and watch it run in a real browser. When you want shareable run history and cloud replays, [create a free account](https://browserbash.com/sign-up) — BrowserBash is free and open source, so the only thing it costs you is the afternoon you used to spend updating locators.
