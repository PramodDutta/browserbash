---
title: Test an Ionic Web App in Plain English
description: "Test ionic app automation by writing plain-English objectives that an AI agent runs against your PWA in a real Chrome browser, no selectors."
date: 2026-05-14
category: guide
---

Ionic apps are deceptively hard to automate. The framework ships a shadow-DOM web component for almost every control, from `ion-button` to `ion-toggle` to the sliding `ion-menu`, and each one wraps its real clickable surface a few layers deep. Traditional selector-based tests break the moment Ionic bumps a version and shifts a class name. This guide takes a different route: test ionic app automation by writing what you want in plain English and letting an AI agent drive a real Chrome browser, no selectors and no page objects. You describe intent, the agent figures out the DOM, and you get a deterministic verdict back.

BrowserBash is a free, open-source (Apache-2.0) command-line tool that does exactly this. You install it with `npm install -g browserbash-cli`, hand it an objective like "open the app, log in, add an item to the cart, and confirm the badge shows 1", and it steps through a real browser one action at a time. Because Ionic web apps run as progressive web apps in the browser, the desktop-browser path covers the large majority of what you actually need to test. This article walks through the how, the honest limits around native-only features, and the patterns that make Ionic automation stable instead of flaky.

## Why Ionic UIs break traditional selector tests

If you have ever written a Selenium or raw Playwright test against an Ionic app, you know the pain. A single `ion-input` renders as a custom element that hosts a native `<input>` inside its shadow root. A tap target you can see on screen might be the `ion-button`, or its internal `button`, or a `<div class="button-native">` that Ionic generates at runtime. Ionic also reuses generic class names across components, so a CSS selector that looks specific today collides with an unrelated element after a redesign.

The mobile-first nature of Ionic makes this worse. Controls are sized for touch, gestures matter, and the same component can render differently depending on the platform mode (iOS versus Material Design). A selector tuned for `md` mode may miss the element in `ios` mode entirely. Teams end up maintaining brittle locator files that need constant babysitting, which is the opposite of what a test suite should cost you.

The plain-English approach sidesteps the whole problem. When you tell the agent "click the Checkout button", it reads the accessible page, finds the element a human would click, and clicks it. Shadow DOM, platform mode, generated class names: none of that is your problem anymore, because you never wrote a selector in the first place. That is the core promise of natural-language browser automation, and it maps unusually well onto component frameworks like Ionic where the rendered markup is deep and volatile.

## Your first plain-English Ionic test

Start by pointing BrowserBash at your running Ionic dev server or a deployed preview URL. The `run` command takes a single objective string. The agent navigates, acts, and returns a verdict along with structured results you can read in CI.

```bash
npm install -g browserbash-cli

browserbash run "Open http://localhost:8100, tap the 'Get Started' button, \
  and confirm the login screen with an email field is visible" --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, which is what you want when a CI job or an AI coding agent needs to read the result without parsing prose. Exit codes are frozen and dependable: `0` passed, `1` failed, `2` error or infra problem, `3` timeout. That contract means your pipeline can branch on the exit code alone.

By default BrowserBash is Ollama-first. It looks for a local Ollama model before anything else, so you can run tests with no API keys and nothing leaving your machine. If no local model is present it resolves to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat that matters for Ionic: very small local models (roughly 8B parameters and under) get flaky on long multi-step flows through deep component trees. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. A three-step smoke check runs fine on small models; a twelve-step checkout with conditional modals does not.

Notice the language in the objective above. "Tap" and "click" are interchangeable to the agent, and describing the target by its visible label ("Get Started") is far more durable than any selector. Describe what a QA engineer would see, not what the DOM contains.

## Writing durable objectives for Ionic components

Ionic has a handful of components that trip up naive automation. Here is how to phrase objectives so the agent handles them cleanly.

### Toggles, checkboxes, and segments

An `ion-toggle` is not a standard checkbox, so "check the box" can confuse a selector-based tool. In plain English you just say the outcome: "turn on the Notifications toggle" or "switch the segment to the Completed tab". The agent reads the current state and acts to reach the state you asked for, which also makes the step idempotent. If the toggle is already on, a well-phrased objective ("make sure Notifications is on") lets the agent no-op instead of flipping it off.

### Modals, alerts, and action sheets

Ionic overlays (`ion-modal`, `ion-alert`, `ion-action-sheet`) mount at the end of the DOM, outside your main content. Selector tests often scope to a container and miss them. With natural language you name the overlay content directly: "in the confirmation dialog, click Delete" or "dismiss the action sheet by tapping Cancel". Because the agent reads the whole accessible page, the overlay is visible to it wherever Ionic mounted it.

### Lists, sliding items, and infinite scroll

For an `ion-list` with sliding items, describe the gesture as an intent: "swipe the first list item left and tap the Archive button that appears". For infinite scroll or virtual lists, tell the agent to scroll until the target appears: "scroll the list until you see the item named 'Invoice 042' and open it". This keeps the test resilient to how many items load per page.

The general rule: phrase every step as a user-visible outcome, use the label text a person would read, and let the agent resolve the mechanics. If you find yourself wanting to mention a CSS class or a shadow root, stop and rewrite the step as intent.

## Turning objectives into committable Markdown tests

One-off `run` commands are great for exploration, but real suites live in version control. BrowserBash reads `*_test.md` files: a Markdown title, a list of steps, optional `@import` composition for shared setup, and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so credentials never leak into your CI output. Every run also writes a human-readable `Result.md`.

Here is a small Ionic login-and-verify test using testmd v2, which executes steps one at a time against a single browser session and adds two deterministic step types that never call a model. API steps seed data through your backend, and Verify steps assert the result through the UI with real Playwright checks instead of LLM judgment.

```bash
browserbash testmd run ./.browserbash/tests/ionic_login_test.md --agent
```

A `version: 2` test file for that command looks like this:

```
---
version: 2
---
# Ionic login and dashboard check

POST {{API}}/test/seed with body {"user":"ionic_qa","plan":"pro"}
Expect status 201, store $.token as 'session'

Open {{APP_URL}} and tap the 'Sign In' button
Type {{EMAIL}} into the email field
Type {{PASSWORD}} into the password field
Tap the 'Log In' button

Verify text "Welcome back" is visible
Verify 'Dashboard' heading is visible
Verify URL contains /home
```

The Verify lines compile to deterministic assertions: URL contains, text visible, a named heading visible, and so on. A pass means the condition actually held; a fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the `Result.md` assertion table. Verify lines that fall outside the supported grammar still run, but they are agent-judged and flagged `judged: true` so you can always tell a deterministic check from a judged one. That distinction is gold when you are triaging a red build. One caveat to plan around: testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway rather than local Ollama. The plain-English `run` command and v1 test files still run fully local.

The API step at the top is what makes hybrid testing practical. Instead of clicking through a five-screen onboarding wizard to reach the state you actually want to test, you seed the account over HTTP in one line, store the token, and jump straight to the UI assertion. For a comprehensive walkthrough of the test format, the [tutorials on browserbash.com](https://browserbash.com/tutorials) go deeper than we can here.

## Saved logins so you do not re-authenticate every run

Ionic apps almost always gate the interesting screens behind auth. Re-typing credentials at the start of every test is slow and, worse, exercises the login flow over and over when you meant to test something else. BrowserBash solves this with saved login profiles backed by Playwright storageState.

```bash
browserbash auth save ionic-user --url http://localhost:8100/login

browserbash run "Open the app, go to Settings, and change the theme to Dark" \
  --auth ionic-user --agent
```

The `auth save` command opens a browser, you log in once by hand, press Enter, and the session is captured. From then on you attach `--auth ionic-user` to any `run`, `testmd`, `run-all`, or `monitor` invocation, or set `auth:` in a test file's frontmatter, and the run starts already authenticated. If the saved profile's origins do not cover the target start URL, BrowserBash prints a warning instead of silently doing nothing, so you find out immediately rather than debugging a mysteriously logged-out session. This one feature removes the biggest source of wasted steps in an Ionic suite.

## The honest part: where the desktop browser stops

This is where credibility matters more than hype. Ionic is a hybrid framework. The same codebase can ship as a web PWA and, through Capacitor, as a native iOS or Android app. BrowserBash drives a real Chrome or Chromium browser. That covers your entire web and PWA surface, which for most Ionic teams is the bulk of the functional behavior. It does not drive a native iOS or Android build, and it cannot exercise the paths that only exist inside a native shell.

Concretely, here is what lives outside the browser and therefore outside what this tool tests:

| Feature or path | Browser-testable with BrowserBash | Notes |
| --- | --- | --- |
| Routing, forms, lists, modals, auth flows | Yes | Full coverage in Chrome/Chromium |
| Ionic UI components and gestures | Yes | Agent reads the rendered accessible page |
| PWA behavior, responsive layout | Yes | Use `--viewport` to size the window |
| Capacitor Camera, GPS, Bluetooth plugins | No | Native-only, no browser equivalent |
| Push notifications via native APNs/FCM | No | Requires the native runtime |
| App Store or Play Store install flows | No | Outside any browser |
| Biometric unlock (Face ID, fingerprint) | No | Native device capability |

For the native-only rows you still need a device or emulator harness such as Appium. BrowserBash is not trying to replace that, and pretending otherwise would waste your time. The right mental model: use plain-English browser tests for everything that runs in the web layer (which is most of your app's logic and UI), and reserve a smaller, slower native suite for the plugin-dependent paths. Many teams find the web-layer coverage catches the overwhelming majority of regressions because that is where the app logic actually lives.

To test mobile-shaped layouts without leaving the browser, size the viewport to a phone. A single run flag or a matrix across viewports both work.

```bash
browserbash run "Open the app and confirm the hamburger menu opens the side nav" \
  --viewport 390x844 --agent
```

That renders the app at an iPhone-ish width so you exercise the mobile navigation, the collapsed toolbar, and the `ion-menu` behavior that only appears on narrow screens. It is not a native test, but it catches the mobile-first UI regressions that desktop-width tests miss.

## Running a whole Ionic suite in CI

Once you have a folder of test files, `run-all` executes them as a memory-aware parallel suite. Concurrency is derived from your real CPU and RAM rather than a guessed number, previously-failed and slowest tests run first so you get signal early, and flaky tests are detected across runs. For CI you shard the suite across machines and cap spend.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00 \
  --junit out/junit.xml --agent
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel CI machines each take a deterministic quarter of the suite without any coordination between them. The `--budget-usd 2.00` guard stops launching new tests once estimated spend crosses the limit: remaining tests are reported `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. That is a real safety net when you are running against a hosted model and do not want a runaway loop to burn your budget. The `cost_usd` estimate comes from a bundled per-model price table, and unknown models get no estimate rather than a wrong one.

The replay cache is what makes this cheap to run often. A green run records its actions; the next identical run replays them with zero model calls, and the agent only steps back in when the page actually changed. For a stable Ionic suite that means most CI runs are nearly token-free, and the model cost only shows up when something genuinely shifted in the UI. If you want the official pipeline wiring, the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) covers the marketplace action that installs the CLI, runs the suite, uploads artifacts, and posts a self-updating PR comment with the verdict table.

## Monitoring a deployed Ionic PWA

Testing in CI catches regressions before merge. Monitoring catches the ones that only show up in production, like a CDN change that breaks asset loading or an auth provider outage. Monitor mode runs a test or objective on an interval and alerts only when the pass/fail state changes, in either direction, never on every green run.

```bash
browserbash monitor ./.browserbash/tests/ionic_login_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ \
  --auth ionic-user
```

Every ten minutes the login flow runs against your live PWA. When it flips from passing to failing you get a Slack message; when it recovers you get another. Slack incoming-webhook URLs get Slack formatting automatically, and any other URL receives the raw JSON payload so you can route it into a custom alerting stack. Because the replay cache keeps a stable monitor nearly token-free, running a synthetic check every ten minutes does not translate into a large model bill. This turns your plain-English login test into a synthetic uptime monitor for free.

## Migrating existing Playwright tests

If you already have a Playwright suite for your Ionic web app, you do not have to rewrite it by hand. The `import` command converts Playwright specs to plain-English `*_test.md` files heuristically, with no model involved, so the conversion is deterministic and reproducible.

```bash
browserbash import ./tests/e2e --out .browserbash/tests
```

It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, the `getBy*` locators, and common `expect` assertions. `process.env.X` references become `{{X}}` variables automatically. Anything it cannot translate cleanly lands in an `IMPORT-REPORT.md` rather than being silently dropped or invented, so you get an honest inventory of what needs a human pass. For an Ionic team sitting on a pile of brittle selector-based Playwright tests, this is a fast way to see how much of the suite becomes simpler in plain English. You can browse more migration and workflow patterns on the [BrowserBash blog](https://browserbash.com/blog).

There is also a recorder for building tests from scratch. Run `browserbash record <url>`, click through your Ionic flow once, and Ctrl-C writes a plain-English test. Password fields never leave the page: the capture script sends only a secret marker, and the generated step reads `Type {{password}} into ...` so no credential is ever written to disk.

## Wiring BrowserBash into your AI coding agent

If you build with an AI coding assistant, BrowserBash exposes itself as an MCP server so the agent can validate its own Ionic changes. Run `browserbash mcp` to serve the CLI over the Model Context Protocol on stdio, or install it into a host in one line.

```bash
claude mcp add browserbash -- browserbash mcp
```

That gives your agent three tools: `run_objective` for a single plain-English check, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). A key design point: a failed test is still a successful tool call. The agent reads the verdict and decides what to do, rather than the tool call erroring out. So when your assistant edits an Ionic component, it can immediately ask BrowserBash "does the login flow still pass" and get a real answer. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, and the same one-line install idea works for Cursor, Windsurf, Codex, and Zed. The [features page](https://browserbash.com/features) has the full list of what the agent integration exposes.

## FAQ

### Can BrowserBash test native iOS and Android Ionic builds?

No. BrowserBash drives a real Chrome or Chromium browser, so it covers your Ionic web and PWA surface completely but does not run inside a native iOS or Android shell. Native-only paths such as Capacitor camera or GPS plugins, push notifications, and biometric unlock need a device or emulator harness like Appium. Use plain-English browser tests for the web layer, which is where most of your app logic lives, and keep a smaller native suite for the plugin-dependent features.

### How do I test Ionic shadow-DOM components without writing selectors?

You describe the outcome in plain English and let the AI agent resolve the DOM. Instead of targeting an `ion-button` shadow root, you write "tap the Checkout button", and the agent reads the accessible page and clicks the element a human would click. This works across `ion-toggle`, `ion-modal`, `ion-action-sheet`, and the rest because you never depend on a CSS class or shadow-root path that Ionic can change between versions.

### Does BrowserBash need API keys or paid models to test my Ionic app?

Not for the core plain-English flow. BrowserBash is Ollama-first, so it defaults to a free local model with no API keys and nothing leaving your machine, then falls back to Anthropic, OpenAI, or OpenRouter if no local model is present. The one exception is testmd v2, which currently drives the builtin engine and needs an Anthropic key or a compatible gateway. Very small local models under about 8B parameters can get flaky on long multi-step Ionic flows, so a mid-size local model or a hosted model is better for hard cases.

### How do I test mobile-first Ionic layouts in a desktop browser?

Set the viewport to a phone-sized window with the `--viewport` flag, for example a 390 by 844 size that approximates an iPhone. That renders the collapsed toolbar, the side menu, and the touch-sized controls that only appear on narrow screens, so you exercise the mobile navigation without leaving the browser. You can also run a viewport matrix across several sizes in one suite pass to check both phone and tablet breakpoints. It is a responsive-layout test, not a native-device test, but it catches the mobile UI regressions desktop-width runs miss.

Ionic testing does not have to mean maintaining a fragile locker of shadow-DOM selectors. Describe the flow the way a user experiences it, let an AI agent drive a real browser, and get a deterministic verdict you can trust in CI. Install it with `npm install -g browserbash-cli` and start writing plain-English tests against your Ionic PWA today. An account is optional, but you can create one at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want the free cloud dashboard and 15-day run history.
