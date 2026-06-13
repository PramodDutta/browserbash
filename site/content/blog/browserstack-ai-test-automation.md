---
title: AI Test Automation on BrowserStack With Plain English
description: "Run AI test automation on BrowserStack Automate in plain English. Drive real browsers with no selectors, one flag, free open-source BrowserBash."
date: 2026-06-13
category: guide
---

Most teams adopt BrowserStack for one honest reason: real browsers, real devices, and a session dashboard they can hand to a client or an auditor. What they do not love is everything between the intent and that dashboard — the capabilities object, the vendor SDK, the page objects that rot every time a class name changes. This guide shows a different path to the same evidence: **AI test automation on BrowserStack** driven by plain English, where you write what you want verified and an AI agent figures out the clicks. No selectors, no page objects, and one flag to send the run to BrowserStack Automate.

The tool is [BrowserBash](https://browserbash.com), a free and open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You describe an objective like "log in, add a backpack to the cart, and confirm the order total," and an AI agent plans the steps, drives a real Chrome session, and returns a pass/fail verdict plus structured results. Point it at your laptop while you iterate, then flip `--provider browserstack` to run the exact same test on BrowserStack's grid in CI. This article walks the whole loop end to end.

## Why plain English changes the BrowserStack workflow

BrowserStack solves the infrastructure half of cross-browser testing extremely well. It does not write your tests for you — that is still on you and your framework. And the framework is where most of the cost lives. A Selenium or Playwright suite married to BrowserStack tends to accumulate three kinds of maintenance debt at once:

- **Selector churn.** Every refactor that touches markup can break a locator. The assertion logic is fine; the path to the element is not.
- **Capabilities sprawl.** The `bstack:options` block, the right `browserName`/`browserVersion` matrix, the tunnel wiring for local apps — none of it is hard individually, but it spreads across config files nobody wants to own.
- **Onboarding friction.** A new contributor has to learn your page-object conventions before they can add a single check.

Natural-language automation collapses the first and third problems and shrinks the second. A BrowserBash test is a sentence, not a script. There is no element to mis-locate because you never named one — the agent reads the live page and decides what to click. A new teammate can add a test on day one because the test reads like a bug report. And the BrowserStack capability surface shrinks to a single word on the command line.

The honest tradeoff: an AI agent is non-deterministic in its path, even when the verdict is deterministic. It might reach the cart via the product tile one run and the search bar the next. For exploratory checks, smoke tests, and end-to-end happy paths, that flexibility is a feature — it survives UI changes that would shatter a brittle locator. For pixel-exact regression on a frozen UI, a recorded script still has its place. BrowserBash is built for the former, and it earns its keep precisely where selector-based suites are most fragile.

## How BrowserBash talks to BrowserStack

Two concepts make the rest of this guide click into place: **engines** and **providers**.

An *engine* is the brain that turns your sentence into browser actions. BrowserBash ships two. The default is **stagehand**, the MIT-licensed AI browser automation framework from Browserbase. The other is **builtin**, an in-repo Anthropic tool-use loop driving Playwright directly.

A *provider* is where the browser actually runs. The default is **local** — your own Chrome. The others are **cdp** (any DevTools endpoint), **browserbase**, **lambdatest**, **browserstack**, and similar. You switch with one flag: `--provider browserstack`.

Here is the part worth internalizing. The default Stagehand engine cannot attach to a remote BrowserStack Automate session. So the instant you pass `--provider browserstack`, BrowserBash automatically switches to its builtin engine to drive the remote Playwright session. You never type `--engine builtin` yourself — the switch is implicit and handled for you. The practical consequence is that grid runs use the Anthropic tool-use loop, which speaks the Anthropic API. More on the key that implies in a moment.

The other thing that happens for free: BrowserStack stays in the loop. BrowserBash reports the verdict back as the session status, so a passed test shows up green in your BrowserStack dashboard, and a failed one shows up failed — without a custom reporter. The run's final event also carries a link straight to the session in the BrowserStack UI, which is exactly the evidence a client or auditor is asking for.

## What you need before you start

The dependency list is short:

1. **Node.js** (a recent LTS release) to install the CLI from npm.
2. **A Chrome or Chromium browser** on your machine for local runs. BrowserBash drives your real local browser by default.
3. **An LLM the agent can think with.** BrowserBash is Ollama-first: it auto-detects a local [Ollama](https://browserbash.com/learn) install (free, local, no API keys), then Anthropic, then OpenRouter. For local iteration you can stay entirely free. For BrowserStack runs you will want an Anthropic key, because the builtin engine speaks the Anthropic API — see the dedicated section below.
4. **A BrowserStack Automate account**, with your username and access key handy.

That is everything. No Selenium grid to stand up, no capabilities file to hand-write.

## Step 1: Install BrowserBash

BrowserBash is a single global npm package:

```bash
npm install -g browserbash-cli
```

Confirm it landed and skim the commands:

```bash
browserbash --help
```

The package page lives on [npm](https://www.npmjs.com/package/browserbash-cli) if you want to pin a version or read the changelog. Model detection is built in, so there is no separate AI plugin and no model SDK to wire up.

## Step 2: Run it locally first

Before you spend a single BrowserStack minute, prove the test on your own Chrome. This is the fast inner loop — you watch the agent drive the real browser and confirm the objective is phrased the way you mean it.

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the Sauce Labs Backpack to the cart, open the cart, and verify the backpack is listed" --headed
```

The agent navigates, performs each action, and prints a verdict at the end: passed, failed, or an error with the reason. Because the default model path prefers your local Ollama install, this run is free and nothing leaves your machine. (Privacy is the default everywhere in BrowserBash: nothing is uploaded unless you explicitly pass `--upload`.)

Once the objective reads cleanly and passes locally, you are ready to send the identical instruction to BrowserStack.

## Step 3: Authenticate with BrowserStack

Store your BrowserStack credentials once with the `login` command:

```bash
browserbash login --provider browserstack \
  --username "$BROWSERSTACK_USERNAME" \
  --access-key "$BROWSERSTACK_ACCESS_KEY"

browserbash whoami
```

`login` writes the credentials to `~/.browserbash/config.json`, and `whoami` lists the accounts you have stored. To remove them later, run `browserbash logout --provider browserstack`. You can see every target BrowserBash knows about with `browserbash providers`.

In CI you usually skip `login` entirely and let environment variables carry the secrets — `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`. The resolution order is flags > env vars > config defaults, so an explicit `--provider` or `--username` on the command line always wins over whatever is stored.

## Step 4: Run the same test on BrowserStack

This is the entire migration. Take the objective you proved locally and add one flag:

```bash
browserbash run "Go to https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the Sauce Labs Backpack to the cart, open the cart, and verify the backpack is listed" \
  --provider browserstack \
  --headless
```

No test edits, no capabilities block, no tunnel script in the common case. BrowserBash switches to the builtin engine under the hood, opens a real session on BrowserStack Automate, drives it with the Anthropic tool-use loop, and reports the verdict back as the session status. When the run finishes, the final event includes a link to the session in the BrowserStack dashboard — open it to watch the recording the platform captured.

That is the headline of this whole guide: the same plain-English test runs on your laptop and on BrowserStack's real-browser grid, and the only thing that changed between the two is the word after `--provider`.

## Step 5: Make it CI-ready with `--agent`

Interactive output is great for a human watching a terminal. CI wants something a machine can read without guessing. Pass `--agent` and BrowserBash switches stdout to NDJSON — one JSON event per line, with a stable schema, so your pipeline never has to parse prose.

```bash
browserbash run "Log in to https://www.saucedemo.com as standard_user with password secret_sauce and verify the inventory page lists six products" \
  --provider browserstack \
  --agent \
  --headless \
  --timeout 180
```

Two things make this CI-friendly beyond the JSON. First, the process exit code *is* the verdict, so a job fails exactly when the test fails:

| Exit code | Meaning |
| --------- | ------- |
| `0` | Passed |
| `1` | Failed |
| `2` | Error |
| `3` | Timeout |

Second, the NDJSON stream gives you structured events to log, store, or fan out to other tools — useful when an AI coding agent is the thing reading the output instead of a person. There is no prose to scrape, which is the whole point of agent mode.

A minimal GitHub Actions step looks like this:

```yaml
- run: npm install -g browserbash-cli
- run: |
    browserbash run "Log in to https://www.saucedemo.com as standard_user with password secret_sauce and verify the inventory page lists six products" \
      --provider browserstack --agent --headless --timeout 180
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}
    BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}
```

The exit code fails the job when the test fails — no output parsing, no custom reporter.

## The Anthropic key, and why grid runs need it

This is the one gotcha worth stating plainly, because it surprises people who set up a fully free local stack first.

Local runs are free because the default model path prefers your local Ollama install. But the moment you target BrowserStack, BrowserBash switches to the builtin engine, and the builtin engine speaks the Anthropic API. So a BrowserStack run needs `ANTHROPIC_API_KEY` set in the environment.

You have two ways to satisfy that:

- Set `ANTHROPIC_API_KEY` with your own Anthropic key (bring your own key — it is optional precisely because it is only needed on this path).
- Point `ANTHROPIC_BASE_URL` at any Anthropic-compatible gateway — for example a proxy that fronts local or alternative models. The builtin engine talks to whatever sits at that base URL as long as it speaks the Anthropic protocol.

Either way, the key (or gateway) is a requirement of the *engine*, not of BrowserStack itself. Local Stagehand runs do not need it; remote builtin runs do.

## Committable tests: Markdown test files

One-line `run` commands are perfect for ad hoc checks and CI gates. For a suite you want to version and review, BrowserBash has Markdown tests — committable `*_test.md` files where each list item is a verified step. They double as living documentation, because the file reads like a manual test case but actually executes.

```markdown
# Checkout smoke

- Open {{base_url}}
- Log in as {{username}} with password {{password}}
- Add the Sauce Labs Backpack to the cart
- Go to checkout and fill first name 'Bo', last name 'Basher', postal code '94016'
- Finish the order
- Verify the page says 'Thank you for your order!'
```

The `{{placeholders}}` are substituted from JSON variables files, so dev and CI can point at different environments without touching the test. Mark a value as a secret and it renders as `*****` in every log and NDJSON line — credentials never leak into your build output. You can also compose shared steps across files with `@import`, so a login sequence lives in one place.

Run a Markdown test, and send it to BrowserStack, the same way:

```bash
# Locally on your Chrome
browserbash testmd run checkout_test.md

# On BrowserStack Automate in CI
browserbash testmd run checkout_test.md --provider browserstack --headless
```

After each run, BrowserBash writes a `Result.md` report next to the test file — a human-readable record of what happened, step by step. Combined with the BrowserStack session recording, you get two complementary artifacts: the narrative in your repo and the video in the dashboard.

## Recordings and the dashboards

BrowserStack captures its own session video, and that is often all the evidence you need. But BrowserBash can capture artifacts independently too, which is handy when you want a local copy regardless of provider.

Pass `--record` and BrowserBash captures a screenshot and a session video (a `.webm` stitched together with ffmpeg) on any engine. On the builtin engine — the one BrowserStack runs use — it also captures a Playwright trace you can open in the trace viewer for a frame-by-frame, network-aware replay.

```bash
browserbash run "Log in to https://www.saucedemo.com as standard_user with password secret_sauce and confirm the dashboard loads" \
  --provider browserstack \
  --headless \
  --record
```

For run history beyond a single artifact, BrowserBash has two dashboards. There is a free, private **local** dashboard you launch with `browserbash dashboard` — it stays entirely on your machine. And there is a free **cloud** dashboard: create an account, connect the CLI with `browserbash connect --key bb_...`, and add `--upload` to push a run up for run history, recordings, and per-run replay.

```bash
# One-time: link the CLI to your free cloud account
browserbash connect --key bb_your_key_here

# Push this BrowserStack run to the cloud dashboard
browserbash run "Smoke test the checkout flow on https://www.saucedemo.com" \
  --provider browserstack \
  --headless \
  --record \
  --upload
```

Cloud runs are kept for 15 days on the free tier. And to be explicit about the privacy model one more time: nothing is uploaded unless you pass `--upload`. The `connect` step alone does not start shipping your runs anywhere — the flag does.

## Portable across grids, not locked in

A quiet benefit of the provider model is that BrowserStack is not a one-way door. The same test that runs `--provider browserstack` today runs `--provider lambdatest` tomorrow with nothing else changed:

```bash
# Same test, a different grid — one word changes
browserbash run "Verify login and checkout on https://www.saucedemo.com" --provider lambdatest --headless
```

If a client mandates BrowserStack and another arrives with a LambdaTest plan, you do not maintain two suites. You maintain one folder of plain-English tests and choose the grid at run time. Pin a default with `browserbash config set defaultProvider browserstack` if most of your runs go to one place, and override per run with the flag when they do not. For deeper walkthroughs of the engines, providers, and Markdown test format, the [BrowserBash learn pages](https://browserbash.com/learn) go further, and the [blog](https://browserbash.com/blog) collects more end-to-end guides.

## Putting it together

The workflow this guide describes is short on purpose:

1. Write the objective in plain English and prove it on local Chrome — free, private, fast.
2. Store BrowserStack credentials once with `browserbash login`, or pass them as env vars in CI.
3. Add `--provider browserstack` to run the identical test on BrowserStack Automate.
4. Add `--agent` so CI reads NDJSON and trusts the exit code instead of parsing prose.
5. Set `ANTHROPIC_API_KEY` (or an Anthropic-compatible gateway) because BrowserStack runs use the builtin engine.
6. Optionally `--record` for local artifacts and `--upload` for the cloud dashboard.

No page objects, no capabilities file in the common case, no custom reporter. Just a sentence, a flag, and a real BrowserStack session with a verdict you can act on.

## FAQ

### Do I need to write Selenium or Playwright code to run on BrowserStack with BrowserBash?

No. You write a plain-English objective or a Markdown test, and the AI agent drives the browser for you — there are no selectors or page objects to author or maintain. When you pass `--provider browserstack`, BrowserBash opens a real BrowserStack Automate session and runs your instruction against it. The framework code you would normally write simply does not exist in this workflow.

### Why does a BrowserStack run need an Anthropic API key when local runs do not?

Local runs use the default Stagehand engine, which prefers a free local Ollama model and needs no key. BrowserStack runs force the builtin engine, because Stagehand cannot attach to a remote BrowserStack session, and the builtin engine speaks the Anthropic API. So set `ANTHROPIC_API_KEY`, or point `ANTHROPIC_BASE_URL` at any Anthropic-compatible gateway, for grid runs.

### Where do I see the test result and the recording?

The verdict is reported back to BrowserStack as the session status, so it shows green or failed in your BrowserStack dashboard, and the run's final event links straight to that session. BrowserBash also writes its own artifacts: a `Result.md` next to Markdown tests, plus a screenshot, a `.webm` video, and a Playwright trace when you pass `--record`. For run history across many runs, connect the free cloud dashboard with `browserbash connect` and push with `--upload`.

### Can I move the same test to another grid like LambdaTest later?

Yes. The provider is a runtime choice, not something baked into the test. The same plain-English test that runs with `--provider browserstack` runs with `--provider lambdatest` by changing only that flag, with no edits to the objective, the variables, or any capabilities. That portability is one of the main reasons to keep the test itself free of vendor-specific code.

## Try it free

BrowserBash is free and open source under Apache-2.0, so you can run the entire local-to-BrowserStack workflow above without paying for the tool itself. Install it with `npm install -g browserbash-cli`, prove a test on your own Chrome, then add `--provider browserstack` to run it on real browsers in the cloud. When you want run history, recordings, and per-run replay, [create a free account](https://browserbash.com/sign-up) and connect the CLI — it is free to start and open source all the way down.
