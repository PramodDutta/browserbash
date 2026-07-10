---
title: Run Mobile-Web Smoke Tests With AI and --viewport
description: "Run mobile web smoke tests with an AI agent that drives a real phone-sized browser, checks the mobile layout by intent, and returns a verdict."
date: 2026-08-04
category: guide
---

Most teams ship a mobile layout that nobody smoke tested until a customer complained. You have desktop coverage, maybe a Playwright suite that runs at 1280 wide, and the phone experience is a hope and a prayer. This guide walks through how to run mobile web smoke tests with an AI agent that emulates a real phone viewport, checks your mobile layout the way a human would (is the menu reachable, does the CTA render, can I add to cart), and returns a deterministic pass or fail. No selectors, no device farm, no separate mobile page-object tree. You write the intent in plain English, BrowserBash drives a real Chromium browser sized to a phone, and you get a verdict you can gate a deploy on.

The core mechanic is one flag: `--viewport`. Point it at a phone resolution like `390x844` (iPhone 14/15 class) or `360x800` (a common Android median), and every check runs against the layout your mobile users actually see. Because the objectives are written as intent rather than CSS selectors, the same test that passes on desktop tells you something different on mobile: whether the hamburger menu opens, whether a sticky footer eats the submit button, whether the hero image pushes the primary action below the fold. This is smoke testing: the goal is breadth and speed, not exhaustive coverage.

## Why mobile smoke tests break where desktop tests pass

Responsive breakpoints are where web apps quietly rot. A desktop test suite renders at a wide viewport, so it never exercises the collapsed navigation, the stacked form, or the off-canvas drawer that only appears under 768 pixels. Your unit tests do not catch it because the component renders fine in isolation. Your desktop end-to-end tests do not catch it because the desktop DOM has a visible nav bar with the link right there. The bug lives entirely in the narrow layout.

Concrete failure modes that a mobile web smoke test catches and a desktop suite misses:

- A primary button that is present in the DOM but pushed off-screen by a fixed cookie banner on small heights.
- A navigation menu that only exists behind a hamburger toggle, so any test that "clicks the Pricing link" fails because the link is not rendered until the menu opens.
- Touch targets that overlap, so the agent taps the wrong control.
- A modal that is not scrollable on a short viewport, hiding its own confirm button.
- Text that wraps into a tap target, changing where a link actually sits.

Traditional mobile testing answers this with device farms and hard-coded emulation profiles. Those are excellent for deep compatibility matrices and real-device quirks, and heavy for a smoke test. What you often want first is a fast, cheap signal: does the mobile layout let a user complete the two or three flows that pay the bills. That is exactly the gap an intent-based agent at a phone viewport fills.

## What --viewport actually does

`--viewport WxH` sets the browser's rendering size before the run starts. It works on single `run` commands and on both engines (the default Stagehand engine and the in-repo builtin engine). When the agent takes a snapshot of the page to decide its next action, that snapshot reflects the phone-sized layout: the collapsed nav, the stacked hero, the reflowed grid. So the agent's reasoning is grounded in the same DOM and geometry your mobile users get.

Here is the simplest possible mobile smoke test, a single objective at a phone viewport:

```bash
browserbash run "Open https://shop.example.com, tap the menu, go to Pricing, and confirm a plan price is visible" \
  --viewport 390x844 \
  --agent \
  --headless \
  --timeout 120
```

A few things are happening here. `--viewport 390x844` renders the page at iPhone-class width and height. `--agent` emits NDJSON, one JSON event per line, so CI reads a machine verdict instead of parsing prose. `--headless` runs without a visible window, which is what you want on a build server. `--timeout 120` caps the run at two minutes, appropriate for a smoke check. The exit code tells the story: `0` passed, `1` failed, `2` error or budget stop, `3` timeout. Those exit codes are a frozen public contract, so you can wire them into a shell gate without fear they change under you.

Because the objective is intent, not a selector script, "tap the menu" is resolved by the agent looking at the rendered mobile page and finding the control that opens navigation. If your hamburger is an unlabeled icon button, the agent finds it the way a person would, by position and role. You did not write a selector, so there is nothing to update when the markup changes.

### A quick note on viewport height

Height matters more on mobile than most people expect. A lot of "the button is missing" bugs are really "the button is below the fold and a sticky element covers it." Setting a realistic height (844 for iPhone 14/15, 800 for a common Android) makes the agent reason about a real screen, including whether it needs to scroll to reach a control. Set width alone and you miss the entire class of short-viewport regressions.

## Writing mobile smoke tests as committable testmd files

Ad-hoc `run` commands are great for exploration. For anything you run every build, put the test in a `*_test.md` file and commit it. These are plain-English step lists with a title, and they support `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so credentials never leak into CI output.

A minimal mobile smoke test file looks like this:

```
# Mobile home smoke

- Open https://shop.example.com
- Confirm the main navigation is reachable by tapping the menu button
- Tap the "Sale" category
- Confirm at least one product card is visible
- Tap the first product and confirm an "Add to cart" button is visible
```

Run it at a phone viewport with the `testmd` command, and set the viewport there too:

```bash
browserbash testmd run ./.browserbash/tests/mobile_home_smoke_test.md \
  --viewport 390x844 \
  --agent
```

This is the same file you would run on desktop, executed at a different size. That is the point: intent-based tests are viewport-portable. You do not fork the test for mobile. You change one flag and the meaning of "is the navigation reachable" changes with the layout. The BrowserBash [tutorials](https://browserbash.com/tutorials) walk through the testmd format in more depth, and the [learn](https://browserbash.com/learn) section covers how the agent turns steps into browser actions.

### Making assertions deterministic with Verify

Plain-English steps are agent-judged, which is fine for a lot of smoke checks. But for the checks you never want to argue with, use `Verify` steps. A `Verify` line compiles to a real Playwright check with no LLM judgment involved: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, or a stored value equals. A pass means the condition literally held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the written `Result.md` table.

For a mobile smoke test, deterministic Verify steps are where you pin the load-bearing facts:

```
# Mobile checkout smoke

- Open https://shop.example.com
- Tap the menu and go to the Sale category
- Add the first product to the cart
- Open the cart

Verify: 'Checkout' button visible
Verify: text "Order summary" visible
Verify: URL contains /cart
```

The three `Verify` lines are not the agent's opinion. They are Playwright assertions run against the mobile DOM. If the `Checkout` button is present in markup but visually clipped by a sticky bar, the visibility check reflects what Playwright considers visible, which is a far better proxy for "can the user tap it" than a raw DOM presence check. Verify lines that fall outside the supported grammar still run, agent-judged, and get flagged `judged: true` in the output so you can always tell a deterministic pass from a judged one.

## Running the mobile matrix without maintaining N test files

One phone size is a smoke test. Several phone sizes is a small matrix, and you should not copy the test file per size. `run-all` has a viewport matrix flag that runs every test in a folder once per viewport, and labels each result in the events, JUnit output, and result files:

```bash
browserbash run-all .browserbash/tests \
  --matrix-viewport 390x844,360x800,414x896 \
  --junit out/junit.xml
```

That runs your whole mobile smoke folder across three phone profiles: a tall iPhone, a mid Android, and a larger phone. Each combination is a labeled result, so when 360x800 fails and 390x844 passes, you know exactly which breakpoint broke. The orchestrator is memory-aware: concurrency is derived from real CPU and RAM, previously-failed and slowest tests are ordered first, and flaky tests get flagged across runs. You are not hand-tuning parallelism.

If you run this on multiple CI machines, sharding keeps them coordinated without a central scheduler:

```bash
browserbash run-all .browserbash/tests \
  --matrix-viewport 390x844,360x800 \
  --shard 2/4 \
  --budget-usd 2 \
  --junit out/junit.xml
```

`--shard 2/4` runs a deterministic slice of the discovered tests, computed on sorted discovery order so four parallel machines each take a quarter without talking to each other. `--budget-usd 2` stops launching new tests once estimated spend crosses two dollars: remaining tests are reported `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit properties. On a smoke suite that mostly hits the replay cache, you will rarely approach a budget like that, but the guardrail means a runaway loop cannot quietly burn tokens.

### The replay cache makes mobile smoke tests nearly free

Smoke tests run constantly, and paying a model for every step every time would be wasteful. BrowserBash records the actions of a green run and, on the next identical run, replays them with zero model calls. The agent only steps back in when the page actually changed. For a mobile smoke suite that mostly passes, that means most runs are close to free and very fast: you are replaying recorded taps, not re-reasoning from scratch. The moment the mobile layout shifts and a recorded action no longer fits, the agent re-engages and either adapts or fails with a real verdict. This is why an always-on mobile smoke check is cheap to keep running.

## Wiring mobile smoke tests into CI and monitors

A smoke test earns its keep when it runs automatically. Two paths matter: pre-deploy in CI, and post-deploy as a monitor.

For CI, the official GitHub Action installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports `shard:` matrix jobs and a `budget-usd:` cap, and posts a self-updating PR comment with the verdict table. You can add a viewport axis so the PR comment shows mobile and desktop side by side. The setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). Because the Action speaks the same NDJSON and exit-code contract as the CLI, a red mobile smoke result blocks the merge exactly like any other check.

Post-deploy, monitor mode turns the same test into a synthetic check that runs on an interval and alerts only when the pass or fail state changes:

```bash
browserbash monitor ./.browserbash/tests/mobile_checkout_smoke_test.md \
  --viewport 390x844 \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

This runs the mobile checkout smoke test every ten minutes at a phone viewport and pings Slack only on a transition: green to red when mobile checkout breaks, and red to green when it recovers. It does not spam you on every green run. Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload so you can route it into your own alerting. Combined with the replay cache, an always-on mobile monitor is nearly token-free, which is what makes running it every ten minutes reasonable rather than reckless.

## Recording a mobile flow instead of writing it

If clicking through the flow is easier than describing it, record it. `browserbash record <url>` opens a visible browser; you click through the flow once, and Ctrl-C writes a plain-English test. Password fields never leave the page: the capture script sends only a secret marker, and the generated step reads `Type {{password}} into ...` rather than embedding your credential. Recording at a phone size gives you a mobile-shaped test to start from, which you can then harden with `Verify` steps.

You can also bring existing coverage over. If you already have Playwright specs, `browserbash import <specs-or-dir>` converts them to plain-English `*_test.md` files heuristically, with no model involved, so it is deterministic and reproducible. It handles `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common expects, turns `process.env.X` into `{{X}}` variables, and drops anything untranslatable into `IMPORT-REPORT.md` instead of silently inventing a step. That gives you a fast on-ramp: import the desktop specs, then run them at `--viewport 390x844` to see which ones actually hold up on mobile.

## Handling logged-in mobile flows

Half the interesting mobile bugs live behind a login, and re-authenticating on every smoke run is slow and brittle. Save the session once and reuse it. `browserbash auth save <name> --url <login-url>` opens a browser, you log in by hand, press Enter, and it saves the session as a Playwright storageState. After that, pass `--auth <name>` on `run`, `testmd`, `run-all`, or `monitor`, or set `auth:` in the test frontmatter. If a saved profile's origins do not cover the target start URL, BrowserBash prints a warning rather than silently doing nothing, so a stale profile fails loud.

The pattern is: save the auth profile once, then run the mobile suite with both the auth and viewport flags. The session cookie carries the logged-in state, the viewport carries the phone layout, and you get the authenticated mobile experience without a login step in every test.

## Choosing a model for mobile smoke tests

BrowserBash is Ollama-first: it defaults to free local models, needs no API keys, and nothing leaves your machine unless you opt in. Model resolution auto-walks from a local Ollama install to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, so it uses whatever you have configured. For mobile smoke tests specifically, model choice interacts with flow length.

An honest caveat: very small local models (around 8B parameters and under) can be flaky on long multi-step objectives. A five-step mobile checkout flow with conditional navigation is exactly the kind of thing that trips them up. The sweet spot is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model for the harder flows. Short smoke checks (open the page, confirm the nav opens, confirm the hero renders) are forgiving and run fine on smaller models. Save the bigger model for the multi-step purchase or signup path.

You can also split the work: cheap-model routing lets you plan on a strong model and execute on a cheap one with `--model-exec`, which keeps cost down without dumbing down the reasoning.

## When to reach for a device farm instead

Intent-based smoke testing at a phone viewport is the right first tool, but be honest about its edges. Viewport emulation is a resized Chromium, not a physical iPhone. It does not reproduce Safari's rendering quirks, iOS-specific input behavior, real touch latency, hardware sensors, or the exact way a given Android skin handles a date picker. If your bug is "this only breaks on Safari on iOS 17" or "the camera upload fails on a Samsung mid-range," you need a real device or a browser cloud, not a resized desktop browser.

Here is the honest split:

| Concern | Mobile smoke at `--viewport` | Real device farm |
| --- | --- | --- |
| Fast pre-deploy signal on the mobile layout | Strong fit | Slower, heavier setup |
| Does the responsive layout let users complete a flow | Strong fit | Works, but overkill for this |
| Cost per run | Near-free with replay cache | Per-device-minute billing |
| Safari or iOS-specific rendering bugs | Not covered (Chromium only) | Covered |
| Real touch, sensors, hardware | Not covered | Covered |
| Cross-browser compatibility matrix | Use a browser cloud provider | Better fit |

BrowserBash does support cloud providers when you need them: the `--provider` flag can target `browserbase`, `lambdatest`, or `browserstack` (the grid providers require the builtin engine). So a pragmatic setup is a fast local mobile smoke suite at `--viewport` on every commit, and a smaller, slower real-device or cross-browser matrix on a nightly schedule for the compatibility questions emulation cannot answer. The [features](https://browserbash.com/features) page lists the full provider and engine matrix if you want to see what each combination supports.

## A realistic mobile smoke suite

Putting it together, a working mobile smoke suite for an e-commerce site might be four small files: a home smoke (nav reachable, hero renders, search works), a browse smoke (category loads, product cards render, filters apply), a product smoke (image gallery, add to cart visible), and a checkout smoke (cart opens, checkout button visible, order summary present). Each is five or six plain-English steps, each ends with two or three deterministic `Verify` lines, and each is committed alongside your code.

You run the whole folder across two or three phone viewports with `run-all --matrix-viewport`, gate the PR with the GitHub Action, and keep the checkout smoke running post-deploy with `monitor --every 10m`. The replay cache keeps the recurring cost near zero, and the `--budget-usd` guardrail means a bad day cannot become a big bill. When something breaks, the labeled matrix result tells you which phone size regressed, and the `Result.md` assertion table tells you exactly which check failed with expected-versus-actual evidence. That is a mobile web smoke test loop you can trust to gate a deploy. If you want to see how teams structure this, the [case studies](https://browserbash.com/case-study) and the [blog](https://browserbash.com/blog) have more examples.

## FAQ

### What viewport size should I use for mobile web smoke tests?

Use a real phone resolution that matches your traffic. A common default is `390x844`, which approximates an iPhone 14 or 15, and `360x800` for a typical mid-range Android. If your analytics show a specific device dominates your mobile traffic, use that width and height. Height matters as much as width because many mobile bugs are elements pushed below a short fold, so always set both dimensions rather than width alone.

### Is a resized browser viewport as good as testing on a real phone?

For layout and flow smoke tests, a phone-sized Chromium viewport gives you a fast, cheap, reliable signal about whether your mobile layout lets users complete key flows. It does not reproduce Safari on iOS rendering, real touch behavior, or hardware sensors, so it is not a substitute for a real device when you are chasing browser-specific or hardware-specific bugs. The practical pattern is a fast viewport smoke suite on every commit and a smaller real-device matrix on a schedule for compatibility questions.

### How do I make a mobile smoke check block a broken deploy in CI?

Run the test with the `--agent` flag so it emits NDJSON, and rely on the exit codes, which are a frozen contract: zero passed, one failed, two error or budget stop, three timeout. A failing exit code will fail the CI step and block the merge. The official GitHub Action wraps this for you, uploading JUnit and NDJSON artifacts and posting a verdict table as a PR comment, so a red mobile smoke result stops the pipeline the same way any other check does.

### Do I need to write a separate test file for mobile and desktop?

No. Because BrowserBash tests are written as plain-English intent rather than selectors, the same test file runs at any viewport, and its meaning shifts with the layout. A step like "confirm the navigation is reachable" resolves to a hamburger toggle on mobile and a visible nav bar on desktop without any change to the file. You change the viewport flag or use the matrix flag to run one folder across several phone and desktop sizes, keeping a single source of truth.

Ready to run your first mobile web smoke test? Install the CLI with `npm install -g browserbash-cli`, point it at your site with `--viewport 390x844`, and you have a phone-shaped smoke check in minutes. Everything runs locally by default with no account required, and if you want hosted dashboards, monitors, and team history you can create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up).
