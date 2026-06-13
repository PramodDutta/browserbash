---
title: How AI Coding Agents Can Verify Web Apps Themselves
description: "Give your AI coding agent a real browser. BrowserBash --agent emits NDJSON with exit codes so agents verify web apps end-to-end in CI."
date: 2026-06-13
category: use-case
---

AI coding agents can write a login form, wire up a checkout flow, and refactor a dashboard in minutes. What they usually cannot do is tell you whether the thing they just built actually works in a browser. That gap is where BrowserBash fits: it gives an AI coding agent a real Chrome browser and a machine-readable verdict, so the agent can verify web apps itself instead of guessing from the diff. This post walks through how to wire that up using BrowserBash's `--agent` mode, NDJSON output, and exit codes.

The core idea is simple. Your agent writes code, then runs a plain-English browser check. A second AI agent inside BrowserBash drives a real Chromium browser, performs the objective, and returns a structured result plus an exit code. The coding agent reads that result, decides whether the task is done, and either ships or fixes. No selectors, no page objects, no flaky CSS paths to maintain.

## Why coding agents need a browser, not just unit tests

Most autonomous coding workflows already run unit tests. Those are valuable, but they verify functions in isolation. They do not tell you that the "Sign up" button is reachable, that the form submits, that the success toast appears, or that a logged-in user lands on the dashboard. Those are the failures users actually hit, and they are invisible to a test suite that never opens a browser.

The traditional answer is end-to-end testing with a framework like Playwright or Selenium. That works, but it asks a coding agent to do something it is bad at: write and maintain brittle selectors. The agent has to guess at `data-testid` attributes, dig through the DOM, and keep those locators in sync as the UI changes. Every redesign breaks the tests, and the agent spends its budget repairing locators instead of building features.

BrowserBash flips the model. You describe the *objective* in plain English, and an AI agent figures out the *how* at runtime against the live page. When the button text changes from "Sign up" to "Create account," a hard-coded selector breaks, but an objective like "click the button to create a new account" still works because the agent reads the page the way a human would. That resilience is exactly what an autonomous coding loop needs, because the agent is changing the UI constantly and cannot stop to re-pin selectors after every edit.

There is a second reason this matters specifically for agents. A coding agent needs a *signal it can branch on*. A wall of console text is useless to a program. BrowserBash is built to emit a clean, parseable result and a process exit code, which is the universal language every CI system and every agent runtime already understands. That is the whole point of `--agent` mode.

## What BrowserBash actually is

BrowserBash is a free, open-source, natural-language browser automation CLI, released under Apache-2.0. You install it from npm:

```bash
npm install -g browserbash-cli
```

You then hand it a plain-English objective, and an AI agent drives a real Chrome or Chromium browser to accomplish it, returning a verdict plus structured results. A first run looks like this:

```bash
browserbash run "Go to https://example.com, click the Sign up link, \
  fill in a test email and password, submit the form, and confirm \
  a welcome message appears"
```

Under the hood you can pick the engine. The default is **stagehand** (MIT-licensed); there is also a **builtin** engine that runs an Anthropic tool-use loop. For the model, BrowserBash is Ollama-first, so you can run everything locally and free with a local model. It also supports free OpenRouter models such as `openai/gpt-oss-120b:free`, and it can use Anthropic directly if you bring your own key. Nothing leaves your machine unless you explicitly opt in, which matters when an agent is exercising a pre-production app full of real-looking data.

Because the same binary runs locally and in CI, the verification step your agent runs on your laptop is the exact same step that runs on your build server. There is no separate harness to maintain.

## The agent-facing contract: `--agent`, NDJSON, and exit codes

This is the part that makes BrowserBash usable by another program rather than just a human. When you pass `--agent`, BrowserBash emits **NDJSON** (newline-delimited JSON) on stdout. Each line is a complete JSON object, so a consuming agent can read the stream line by line, parse each event as it arrives, and react without waiting for the whole run to finish. This is the standard streaming format for tool output, and it is trivial to consume from any language.

Just as important, BrowserBash sets a meaningful process **exit code**:

- `0` — the objective passed
- `1` — the objective failed (the app did the wrong thing)
- `2` — an error occurred (something broke before a verdict could be reached)
- `3` — the run timed out

These four codes are the entire decision tree a coding agent needs. Exit `0` means "ship it." Exit `1` means "the feature is wrong, go read the result and fix the code." Exit `2` means "the environment or the run itself is broken." Exit `3` means "the app hung or is too slow." An agent can branch on those without parsing a single character of output, then fall back to the NDJSON stream when it needs the details of *why* something failed.

A verification call inside an agent loop looks like this:

```bash
browserbash run "Log in with email demo@acme.test and password hunter2, \
  then confirm the dashboard shows a 'Welcome back' heading and at \
  least one project card" \
  --agent \
  --headless
```

Add `--headless` so the run works on a CI box with no display. The agent kicks off the command, waits for it to exit, checks the exit code, and reads the final NDJSON verdict line for the human-readable explanation and any structured results it extracted from the page.

## A concrete loop: build, verify, branch

Here is the pattern in practice. Suppose your coding agent just implemented a password reset flow. After it finishes editing the code and starting the dev server, it runs a verification step and branches on the result.

```bash
#!/usr/bin/env bash
# Agent runs this after implementing the password-reset feature.

browserbash run "On http://localhost:3000, click 'Forgot password', \
  enter the email demo@acme.test, submit, and confirm the page shows \
  a message saying a reset link was sent" \
  --agent \
  --headless

code=$?

case $code in
  0) echo "VERIFIED: reset flow works, proceeding to commit" ;;
  1) echo "FAILED: app behaved incorrectly, agent should read the verdict and fix" ;;
  2) echo "ERROR: run could not complete, check the environment" ;;
  3) echo "TIMEOUT: app hung or was too slow" ;;
esac

exit $code
```

The coding agent treats `$code` as a gate. On `0` it commits. On `1` it does not blindly retry; it reads the final NDJSON line, which contains the agent's verdict in plain English ("the form submitted but no confirmation message appeared"), feeds that back into its own reasoning, edits the code, and re-runs the same command. Because the objective is plain English and never references a selector, the agent does not have to touch the verification step when it changes the UI to fix the bug. The check is stable while the implementation churns.

This is the difference between an agent that *thinks* it finished and an agent that *knows*. The exit code is ground truth from a real browser, not a hallucinated "looks good to me."

## Repeatable checks with Markdown tests

Single objectives are great for quick verification, but a coding agent often wants a small, durable suite of checks it can re-run after every change. BrowserBash supports **Markdown tests** for exactly this. You write a file named with a `*_test.md` suffix, and each list item becomes a step.

```markdown
# login_test.md

- Go to {{BASE_URL}}
- Click the "Log in" link
- Enter {{EMAIL}} in the email field
- Enter {{PASSWORD}} in the password field
- Click the "Sign in" button
- Confirm the page shows a "Dashboard" heading
```

You run it with the `testmd` subcommand:

```bash
browserbash testmd run login_test.md --agent --headless
```

Markdown tests support `@import` so you can share common setup (like a login sequence) across many files, and they support `{{variables}}` that get substituted at runtime. Secret values are masked in output as `*****`, so an agent can pass a real password through `{{PASSWORD}}` without that secret leaking into logs, the NDJSON stream, or a CI transcript. For an autonomous agent that is exercising authenticated flows, that masking is not a nicety; it is what keeps credentials out of the artifacts the agent produces.

The practical workflow: your coding agent maintains a folder of `*_test.md` files, one per critical flow. After any change, it runs the relevant files with `--agent`. Each file exits with the same `0/1/2/3` semantics, so the agent gets a per-flow pass/fail signal it can aggregate into a single "is the app healthy" decision. Because the steps are plain English, the agent can also *write new test files itself* as it builds new features, growing the suite without ever learning a selector syntax.

If you want to learn the full Markdown test format and the available step patterns, the [BrowserBash docs](https://browserbash.com/learn) walk through it end to end.

## Evidence the agent (and you) can inspect

A pass/fail verdict is enough for the agent to branch, but when something fails you usually want to see what happened. BrowserBash captures evidence on demand.

Pass `--record` and BrowserBash captures a screenshot and a full session video as a `.webm` file (it uses ffmpeg for the video). Recording works on any engine. If you are running the **builtin** engine, `--record` additionally produces a Playwright trace, which you can open in the Playwright trace viewer to step through every action frame by frame.

```bash
browserbash run "Complete the checkout flow with a test card and \
  confirm an order confirmation number appears" \
  --agent \
  --headless \
  --record
```

For an agent, the recording is gold. When a check exits `1`, the agent does not just get a text verdict; it has a screenshot at the moment of failure and a video of the whole run. If the agent surfaces a failure to a human, it can attach that evidence so a developer sees exactly what the browser saw, instead of a vague "checkout failed" message. The screenshot is also something a multimodal coding agent can read directly, closing the loop between "the check failed" and "here is visually what was wrong."

## Sharing runs without leaking anything

By default, BrowserBash keeps everything local. Nothing about a run leaves your machine unless you explicitly add `--upload`. When you do pass `--upload`, BrowserBash pushes the run to a free cloud dashboard where you can review the verdict, screenshots, and video in a browser. Cloud runs are retained for 15 days. If you would rather stay entirely local, there is also a `browserbash dashboard` command that serves a dashboard from your own machine.

```bash
browserbash testmd run smoke/*_test.md --agent --headless --upload
```

In an agent context, `--upload` is the difference between "the agent's CI run failed somewhere in the logs" and "here is a shareable link with the failing video." When an autonomous loop opens a pull request, it can include the dashboard link so a human reviewer watches the exact browser session that verified (or failed) the change. The privacy default is the right one for agents, though: an agent should never ship data off-box implicitly, and BrowserBash honors that by requiring the explicit flag.

## Running across real browsers and devices

Local Chromium is the right default for fast inner-loop verification, but some failures only show up on a specific browser or a real device. BrowserBash abstracts the execution target behind a single `--provider` flag. The supported providers are `local`, `cdp`, `browserbase`, `lambdatest`, and `browserstack`.

```bash
browserbash run "Open the pricing page and confirm the monthly and \
  annual toggle switches the displayed amounts" \
  --agent \
  --provider lambdatest
```

Because the provider is just a flag, the objective and the agent contract stay identical. The agent does not learn a new API to run the same check on a cloud grid; it appends `--provider lambdatest` (or `browserstack`, or `browserbase`) and gets the same NDJSON and the same exit codes back. That uniformity is what lets a coding agent escalate: run fast and local on every change, then run the same verification across real browsers on the provider of your choice before a release, all without rewriting a single step.

## Wiring it into CI for autonomous agents

The same properties that make BrowserBash agent-friendly make it CI-friendly, because CI is just another non-human consumer that branches on exit codes. A minimal GitHub Actions step looks like this:

```yaml
- name: Verify critical flows
  run: |
    npm install -g browserbash-cli
    browserbash testmd run e2e/*_test.md --agent --headless
```

If any test exits non-zero, the step fails and the build stops. When an AI coding agent opens a pull request, this is the gate that confirms its work actually runs in a browser before a human ever looks at it. The agent can also run the same command locally before pushing, so it never opens a PR that it has not already verified against a real browser. The NDJSON stream gives the CI logs a structured, greppable record of every step, and `--record` plus `--upload` attach the visual evidence for the failures that need a closer look.

A robust autonomous loop ends up looking like this:

1. The agent implements a change and starts the app.
2. It runs `browserbash testmd run` with `--agent --headless` against the affected flows.
3. On exit `0`, it commits and opens a PR; on exit `1`, it reads the verdict, fixes, and re-runs; on `2` or `3`, it flags an environment problem instead of thrashing on the code.
4. Before release, it re-runs the suite with `--provider browserstack` and `--upload` for cross-browser coverage and a shareable record.

Every one of those steps speaks the same four exit codes and the same NDJSON, which is why a single agent can own the whole pipeline.

## Why plain-English objectives beat selectors for agents

It is worth dwelling on why the natural-language model specifically helps autonomous agents, because it is the crux of the whole approach. A selector-based test encodes an assumption about the DOM. An agent that is actively rewriting that DOM invalidates its own tests constantly, so it spends a growing share of its budget on selector maintenance rather than feature work. That is a tax that compounds.

A plain-English objective encodes *intent* instead. "Confirm the user can add an item to the cart and see the cart count increase" stays true no matter how the markup, framework, or class names change. The BrowserBash agent re-derives the actual interaction against the live page each run. So the verification layer becomes a stable contract about behavior, while the implementation underneath it is free to change. For an agent whose entire job is to change implementations, that is precisely the right boundary.

This also lowers the barrier for the agent to *create* coverage. Writing a Playwright test requires knowing the framework's API and the page's structure. Writing a BrowserBash check requires only describing what a user should be able to do. An agent can generate a meaningful new check from a feature description alone, which means coverage grows naturally alongside the codebase instead of lagging behind it. You can see more patterns for this on the [BrowserBash blog](https://browserbash.com/blog), and the package itself lives on [npm](https://www.npmjs.com/package/browserbash-cli).

## Putting it together

The recipe for letting an AI coding agent verify web apps itself comes down to a few pieces working together. Give the agent a real browser through `browserbash run` or `browserbash testmd run`. Make the output machine-readable with `--agent` so the agent gets NDJSON. Let it branch on the `0/1/2/3` exit codes, which map cleanly to ship, fix, environment-error, and timeout. Run `--headless` in CI. Capture `--record` for evidence and `--upload` when a human needs to watch the failure. Escalate across real browsers with `--provider` when it is time to release.

Because every objective is plain English, the verification layer survives the constant UI churn that an autonomous coding agent produces. Because everything runs locally by default and is free and open source, you can adopt the whole workflow without sending data off your machine or waiting on a procurement cycle. The agent stops guessing whether its work runs, and starts knowing.

## FAQ

### How does an AI coding agent know whether a BrowserBash run passed?

The agent reads the process exit code. BrowserBash returns `0` when the objective passed, `1` when the app behaved incorrectly, `2` when the run hit an error before reaching a verdict, and `3` when it timed out. The agent branches on that code alone for the pass/fail decision, then reads the final NDJSON line from `--agent` mode when it needs the plain-English explanation of *why* a run failed.

### What is `--agent` mode and why does it matter for automation?

`--agent` makes BrowserBash emit NDJSON (newline-delimited JSON) on stdout, where each line is a complete, parseable JSON object. A consuming program or AI agent can read the stream line by line and react to events as they happen, rather than scraping human-formatted text. Combined with the exit codes, it gives any agent or CI system a clean, structured contract to build on.

### Do I have to write CSS selectors or page objects?

No. You describe the objective in plain English, such as "log in and confirm the dashboard loads," and an AI agent drives a real browser to accomplish it, figuring out the actual interactions against the live page at runtime. This is why the checks survive UI changes: there are no hard-coded selectors to break when a button's text or markup changes.

### Does my data leave my machine when an agent runs BrowserBash?

No, not unless you explicitly pass `--upload`. By default everything runs and stays local, and you can use the Ollama-first local model option to keep the LLM on your machine too. Only when you add `--upload` does a run get pushed to the free cloud dashboard, where it is kept for 15 days; you can also run `browserbash dashboard` to review runs entirely locally.

---

Ready to let your coding agent verify its own work in a real browser? BrowserBash is free and open source under Apache-2.0. Install it with `npm install -g browserbash-cli`, give your agent the `--agent` flag, and let it branch on exit codes. [Sign up to get started](https://browserbash.com/sign-up) and start verifying web apps the way users actually use them.
