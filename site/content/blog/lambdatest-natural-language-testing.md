---
title: Natural-Language Testing on LambdaTest With BrowserBash
description: "Run natural-language testing on LambdaTest with BrowserBash: plain-English tests on the cloud grid, with screenshots and session video recordings."
date: 2026-06-13
category: guide
---

If you already pay for a LambdaTest plan, you have a fast cross-browser grid sitting idle most of the time, and a backlog of flows you never got around to automating because writing Selenium or WebDriver scripts for each one is slow. Natural-language testing on LambdaTest changes that math. Instead of hand-coding selectors and capability blocks, you write a plain-English objective, point it at the grid with a single flag, and let an AI agent drive a real Chrome session for you. This guide shows exactly how to do that with [BrowserBash](https://browserbash.com), a free and open-source (Apache-2.0) natural-language browser automation CLI, and how to capture screenshots and session videos of every run.

The core idea is worth stating up front because it reshapes the whole workflow: you describe *what* should happen ("open the login page, sign in, and verify the dashboard loads"), and BrowserBash figures out *how* to make it happen on the page in front of it. There are no CSS selectors, no XPath, no page objects, and no capabilities JSON to maintain. The browser still runs on the LambdaTest grid exactly as it would for a scripted Selenium job, so you keep the cross-browser coverage and the cloud infrastructure you are already paying for. You just stop writing the brittle middle layer.

## Why pair natural language with a cloud grid

A cloud grid like LambdaTest solves an infrastructure problem: it gives you browsers you do not have to install, version, or babysit, running on machines that are not your laptop. What it does not solve is the *authoring* problem. Whether the browser lives in the cloud or under your desk, somebody still has to write the test, and traditional automation makes that the expensive part. Locators drift when the front end changes, page objects rot, and a single renamed CSS class can turn a green suite red overnight.

Natural-language testing attacks the authoring cost directly. When the instruction is "add the first product to the cart and check out," there is no selector to break when a developer renames a button. The agent reads the live page and decides how to act, so cosmetic refactors that would shatter a selector-based suite simply do not register. Pairing that with LambdaTest means you get resilient, human-readable tests *and* the breadth of a real grid — many browser and OS combinations, parallel sessions, and a dashboard of evidence on the vendor side — without owning any of the machines.

There is a second, quieter benefit. Because a BrowserBash test is just a sentence, the people who understand the feature best — product managers, support engineers, designers — can read it, review it, and even propose edits. A `*_test.md` file is closer to an acceptance criterion than to code. That lowers the barrier to "we should have a test for this" from a sprint ticket to a pull request comment.

## What BrowserBash actually does

Before the LambdaTest specifics, it helps to understand the moving parts, because the same model applies whether the browser runs locally or on a grid.

You give BrowserBash an objective in plain English. An AI agent plans the steps, drives a **real** Chrome or Chromium browser, observes the result of each action, and returns a verdict — passed or failed — plus structured results you can consume programmatically. Two things are worth pulling apart here, because they are independent choices:

- **The engine** decides how the agent reasons about the page. The default is `stagehand` (an MIT-licensed open-source engine by Browserbase); there is also a `builtin` engine, an in-repo Anthropic tool-use loop. You usually leave this on the default.
- **The provider** decides *where the browser physically runs*. The default is `local` (your own Chrome). The others are `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, `browserstack`. Switching is a one-flag change: `--provider lambdatest`.

That separation is the whole trick behind "develop locally, run on the grid." The objective, the engine, and the assertions stay identical; only the provider flag moves. You debug a flow on your own Chrome where you can watch it, then flip one flag to execute the exact same words on the LambdaTest grid in CI.

The third independent axis is the **LLM** — the brain that powers the agent. BrowserBash is Ollama-first, meaning it will happily use a free local model with no API keys at all. It also supports OpenRouter (including free models such as `openai/gpt-oss-120b:free`) and Anthropic Claude if you bring your own key. On startup it auto-detects what is available, checking for Ollama first, then Anthropic, then OpenRouter. For a LambdaTest run, the model choice is orthogonal to the grid: the browser runs in the cloud, but you decide where the reasoning happens.

## Prerequisites

You need three things, and only the first is mandatory.

1. **BrowserBash installed.** It ships on npm:

   ```bash
   npm install -g browserbash-cli
   ```

   The package lives at [npmjs.com/package/browserbash-cli](https://www.npmjs.com/package/browserbash-cli) if you want to pin a version or read the install notes.

2. **A LambdaTest account with grid credentials.** You authenticate to the grid with a username and access key from your LambdaTest profile. BrowserBash reads these from your environment so they never end up in a committed file. Export them in the shell or CI environment that will run the tests:

   ```bash
   export LT_USERNAME="your-lambdatest-username"
   export LT_ACCESS_KEY="your-lambdatest-access-key"
   ```

3. **An LLM the agent can use.** The zero-setup path is Ollama running locally — free, private, no keys. If you would rather not run a local model, set an `OPENROUTER_API_KEY` (free models are available) or an `ANTHROPIC_API_KEY`. Any one of these is enough.

That is the entire setup. There is no Selenium server to stand up, no driver binary to match to a browser version, and no capabilities file to author. The grid handles the browser; BrowserBash handles the rest.

## Your first natural-language test on LambdaTest

Start with a single command so you can see the whole loop end to end. This runs one plain-English objective on the LambdaTest grid, headless, and records the session.

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the Sauce Labs Backpack to the cart, go to the cart, and verify the backpack is listed" \
  --provider lambdatest \
  --headless \
  --record
```

Walking through the flags:

- `run "..."` is the objective. Write it the way you would describe the task to a colleague who has never seen the page. Be specific about the starting URL and the success condition — "verify the backpack is listed" gives the agent a concrete thing to check and report on.
- `--provider lambdatest` sends the browser to the LambdaTest grid instead of your local Chrome. This is the only flag that differs from a local run.
- `--headless` runs without a visible window, which is what you want on a grid and in CI.
- `--record` captures a screenshot **and** a session video (a stitched `.webm`, assembled with ffmpeg) of the run, so you have visual evidence of what the agent did. Recording works on any engine.

When the run finishes, BrowserBash prints a verdict and the process exits with a meaningful code: `0` for passed, `1` for failed, `2` for an error, and `3` for a timeout. You do not have to parse any prose to know what happened — the exit code is the source of truth, which matters enormously once this lands in CI.

### Reading the result

A passing run tells you the agent reached every part of the objective and the final assertion held. A failing run (`exit 1`) means the agent completed its steps but the success condition was not met — the page did not show what you asked it to verify. An error (`exit 2`) means something went wrong mechanically: bad credentials to the grid, an unreachable URL, a misconfigured provider. Distinguishing "the app is broken" (`1`) from "my setup is broken" (`2`) is the difference, and BrowserBash draws that line for you.

## Committable tests with markdown

A one-liner is great for a smoke check, but real suites want to live in version control, get reviewed, and share setup steps. That is what BrowserBash's markdown tests are for. You write a `*_test.md` file where each list item is a step, and you commit it next to your code like any other test.

Here is a checkout flow as a markdown test. Save it as `checkout_test.md`:

```markdown
# Checkout smoke

- Open {{base_url}}
- Log in as {{username}} with password {{password}}
- Add the Sauce Labs Backpack to the cart
- Open the cart and proceed to checkout
- Fill first name 'Bo', last name 'Basher', and postal code '94016'
- Finish the order
- Verify the page shows 'Thank you for your order!'
```

Two features make this more than a glorified script:

- **`{{variables}}`** are substituted at run time, so the same file runs against staging and production without edits. Values come from JSON files BrowserBash reads from your project or home directory. Mark a value as secret and it is masked as `*****` everywhere it would otherwise appear — in logs, in reports, and in the machine-readable event stream — so a committed test never leaks a password.
- **`@import`** lets you compose shared steps. A common login or setup block lives in one file and gets pulled into many tests with a single line, so you write the authentication flow once and reuse it across the suite.

Run the markdown test on LambdaTest the same way you ran the one-liner — the provider flag is identical:

```bash
browserbash testmd run checkout_test.md \
  --provider lambdatest \
  --headless \
  --record
```

After the run, BrowserBash writes a `Result.md` report next to the test file, summarizing each step and the overall verdict in human-readable form. That report, combined with the recorded screenshot and video, gives you a complete, reviewable artifact for every execution — the kind of evidence a client or an auditor actually wants to see. For a deeper walk-through of the markdown format and how teams structure suites, the [BrowserBash learn pages](https://browserbash.com/learn) are the place to go next.

## Develop locally, run on the grid

This is the workflow that makes the local/grid split pay off, and it is worth being deliberate about.

When you are writing or debugging a test, run it on your own Chrome with the window visible. You watch the agent work, you see exactly where it gets confused, and you tighten the objective until it reads cleanly:

```bash
browserbash testmd run checkout_test.md
```

No provider flag means `local` — your Chrome, on your machine, fully visible. Iteration is fast because there is no grid queue and no network round trip to a cloud session. Once the flow is solid, you promote the *exact same file* to the grid by adding the provider flag, with nothing else changed:

```bash
browserbash testmd run checkout_test.md --provider lambdatest --headless --record
```

The objective did not change. The assertions did not change. The only difference is where the browser physically runs. That is the promise of separating the test from its infrastructure: migration between local Chrome and a cloud grid is a flag, not a project. If you later need broader coverage on a different vendor, the same file moves to `--provider browserstack` with no edits — the test never knew or cared where the browser lived.

## Wiring it into CI

A natural-language test only earns its keep when it runs automatically on every change. BrowserBash is built for exactly that, and the design choices that make it pleasant in a terminal are the same ones that make it robust in a pipeline.

For pipelines and AI coding agents, add `--agent`. In agent mode, BrowserBash emits **NDJSON** — one JSON event per line, on a stable schema — instead of human prose. Your CI job, or an autonomous coding agent, reads structured events rather than scraping formatted text, which means the contract does not break when the human-facing output gets prettier.

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, and verify the inventory page loads" \
  --provider lambdatest \
  --headless \
  --agent
```

Because the exit codes are stable — `0` passed, `1` failed, `2` error, `3` timeout — your CI step can branch on the result without any parsing at all. A non-zero exit fails the build; the specific code tells you whether to alert the dev team (`1`, the app regressed) or the infra owner (`2`, the grid credentials are stale). That single, unambiguous signal is why this slots into existing pipelines cleanly: CI already understands exit codes, and BrowserBash speaks them precisely.

A minimal pipeline step looks like this:

```bash
# CI: credentials come from the environment, never the repo
export LT_USERNAME="$LT_USERNAME"
export LT_ACCESS_KEY="$LT_ACCESS_KEY"

browserbash testmd run checkout_test.md \
  --provider lambdatest \
  --headless \
  --record \
  --agent
```

Keep the LambdaTest username and access key in your CI secret store and export them into the job. They are read from the environment, so they never appear in a committed file, and any secret-marked test variables stay masked in the NDJSON stream as well. More worked CI patterns and exit-code recipes are collected on the [BrowserBash blog](https://browserbash.com/blog).

## Recordings, evidence, and the dashboard

Running tests on a grid is only half the value; the other half is proving what happened. BrowserBash gives you evidence at two levels.

**Locally, on every run**, `--record` produces a screenshot and a stitched `.webm` session video. On the `builtin` engine you also get a Playwright trace, which is a frame-by-frame record you can open and step through when you need to understand a failure in detail. These artifacts land on the machine that ran the test, so in CI you would publish them as build artifacts alongside the `Result.md` report. Nothing about recording requires a cloud account — it works the same on a local run as on a LambdaTest run.

**In the cloud**, BrowserBash has its own dashboard, separate from any grid vendor's. Create a free account, connect the CLI once with your key, and add `--upload` to push a run to the cloud dashboard, where you get run history, recordings, and per-run replay:

```bash
# One-time: connect this machine to your free dashboard account
browserbash connect --key bb_your_key_here

# Then push any run to the cloud dashboard
browserbash testmd run checkout_test.md \
  --provider lambdatest \
  --headless \
  --record \
  --upload
```

This is genuinely opt-in. **Nothing leaves your machine unless you pass `--upload`** — no flag, no egress. That property matters when you are testing internal apps, staging behind a VPN, or pages with real customer data: by default the page content, your objective text, and any extracted results stay local. On the free tier, cloud runs are retained for 15 days, which is plenty for the "did last night's run pass, and can I watch the replay" loop.

If you want run history and replay but would rather keep everything on your own machine, there is also a free, private **local dashboard**:

```bash
browserbash dashboard
```

That gives you a browsable view of your runs without uploading anything. It is the natural home base while you are building out a suite and not yet ready to push anything to the cloud.

## A realistic LambdaTest workflow, start to finish

Pulling the pieces together, here is how a team typically adopts natural-language testing on LambdaTest without disrupting anything they already have.

First, install the CLI and confirm an LLM is reachable — Ollama if you want zero keys, otherwise an OpenRouter or Anthropic key in the environment. Write one objective for your most important flow, usually login, and run it on **local** Chrome so you can watch it and tune the wording. Once it is clean, save it as a `*_test.md` file, parameterize the environment-specific bits with `{{variables}}`, and mark the password as secret so it masks to `*****`.

Next, promote that file to the grid by adding `--provider lambdatest --headless --record`. Confirm it passes on LambdaTest and that the screenshot and video look right. Repeat for the handful of flows that matter most — checkout, search, a critical form — composing shared login steps with `@import` so you are not repeating yourself. Now wire the suite into CI with `--agent`, branch the build on the exit code, and publish the recordings and `Result.md` reports as artifacts. Finally, if you want a shared, searchable history with replay, `browserbash connect` once and add `--upload`; if you would rather stay fully local, run `browserbash dashboard` instead.

At no point in that sequence did you write a selector, maintain a page object, or author a capabilities file. The grid gave you the browsers; BrowserBash gave you tests anyone on the team can read, and the recordings gave you the evidence. That is the entire point: keep the LambdaTest coverage you already pay for, and pay far less to author and maintain the tests that run on it.

## FAQ

### Do I need to write selectors or page objects to test on LambdaTest with BrowserBash?

No. That is the central difference from traditional Selenium or WebDriver automation. You write a plain-English objective, and the AI agent reads the live page and decides how to act, so there are no CSS selectors, XPath expressions, or page objects to author or maintain. The browser still runs on the LambdaTest grid exactly as a scripted job would; you simply skip the brittle locator layer that usually breaks when the front end changes.

### How do I switch a test from my local browser to the LambdaTest grid?

Add the `--provider lambdatest` flag. The objective, the engine, and the assertions stay identical — only where the browser physically runs changes. The recommended workflow is to develop and debug on local Chrome with a visible window (no provider flag means `local`), then promote the exact same command or `*_test.md` file to the grid by adding `--provider lambdatest --headless`. Nothing else in the test needs to change.

### How do I get screenshots and video recordings of a LambdaTest run?

Pass `--record`. It captures a screenshot and a stitched `.webm` session video on any engine, and the `builtin` engine additionally captures a Playwright trace you can step through. These artifacts are written on the machine that ran the test, so in CI you would publish them as build artifacts. If you also want cloud-hosted run history with per-run replay, connect the CLI with `browserbash connect` and add `--upload`.

### Is BrowserBash free, and does my page data leave my machine?

BrowserBash is free and open source under the Apache-2.0 license. By default nothing leaves your machine: the page content, your objective text, and any extracted results stay local unless you explicitly pass `--upload` to push a run to the cloud dashboard. If you also use a local LLM through Ollama, the reasoning happens on your machine too, with no API keys and no token bill. Note that running on the LambdaTest grid does send the browser session to LambdaTest, since that is where the browser physically runs.

## Get started

Natural-language testing on LambdaTest gives you the best of both worlds: the cross-browser grid you already have, and tests that anyone on the team can read, written in plain English instead of selectors. Install the CLI with `npm install -g browserbash-cli`, point your most important flow at the grid with `--provider lambdatest --record`, and you have a recorded, reviewable test in minutes.

When you are ready for shared run history and per-run replay, [create a free account at browserbash.com/sign-up](https://browserbash.com/sign-up). It is free and open source — no paid tier to unlock the workflow above, and nothing leaves your machine until you choose to upload.
