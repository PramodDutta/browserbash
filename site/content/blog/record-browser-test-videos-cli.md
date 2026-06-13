---
title: How to Record Browser Test Videos From the CLI
description: "Record browser test videos from the CLI with BrowserBash --record: screenshots, .webm video, traces, and dashboard replay. Free and open source."
date: 2026-06-13
category: guide
---

When a browser test fails in CI, a one-line "assertion failed" tells you almost nothing. Was the page blank? Did a cookie banner steal the click? Did the network stall on step three? The fastest way to answer those questions is to watch the run back, which is exactly why the ability to **record browser test videos from the CLI** matters. With [BrowserBash](https://browserbash.com) — a free, open-source (Apache-2.0) natural-language browser automation CLI — you add a single `--record` flag and walk away with a screenshot, a full `.webm` video of the session, and (on the builtin engine) a Playwright trace you can scrub frame by frame. No screen recorder, no separate tooling, no test framework to wire up.

This guide covers the whole loop: what `--record` captures, how it works on each engine, how to record plain-English runs and committed Markdown tests, how to keep recordings sane in headless CI, and how to push a run to a dashboard so the video lives next to its verdict and structured results. Everything here uses real commands, and nothing leaves your machine unless you explicitly ask it to.

## Why record at all when you have a pass/fail verdict?

BrowserBash already gives you a verdict. You write an objective in plain English, an AI agent drives a real Chrome or Chromium browser, and you get back a pass/fail result plus structured data. For a green run on a stable flow, that is often all you need.

The trouble starts the moment something goes wrong, and with browser automation, something always eventually goes wrong. A verdict tells you *that* a run failed; it rarely tells you *why*. Recordings close that gap in three situations that come up constantly:

**Flaky failures you cannot reproduce locally.** A test passes on your laptop and fails one run in twenty on the CI box. Re-running and hoping is a waste of an afternoon. A video of the exact failing run shows you the modal that appeared, the spinner that never resolved, or the layout shift that pushed the button out from under the cursor.

**Failures in environments you cannot see.** CI runners are headless and ephemeral. Staging sits behind a VPN. A remote browser grid runs in someone else's data center. You cannot lean over and watch any of those. A recorded artifact is the only window you get, and it is the same window every time.

**Communicating a bug to a human.** "The checkout breaks" provokes an argument. A fifteen-second clip of the checkout breaking ends it. Dropping a `.webm` into a bug ticket or a pull request comment turns a vague report into something a developer can act on in seconds.

Recording is not a debugging luxury you bolt on later. It is the cheapest insurance you can buy against the hours you would otherwise spend guessing, and the flag is short enough that there is little reason not to turn it on whenever a run might matter.

## What `--record` actually captures

`--record` works on any engine, and at minimum it captures two things on every run:

- **A screenshot.** A still image, typically of the final state, so you have an at-a-glance picture of where the run ended up.
- **A session video.** A `.webm` recording of the browser session for the whole run. BrowserBash stitches the video with [ffmpeg](https://ffmpeg.org/), so you get one continuous file you can scrub, not a pile of frames to reassemble yourself.

On top of that, the engine you choose changes what else you get. BrowserBash ships two:

- **`stagehand`** — the default engine, MIT-licensed and open source, maintained by Browserbase. With `--record` you get the screenshot and the `.webm` video.
- **`builtin`** — an in-repo Anthropic tool-use loop. With `--record` you get the screenshot, the `.webm` video, *and* a Playwright trace.

That Playwright trace is the headline reason to reach for the builtin engine when a run is being stubborn. A trace is not just video — it is a structured, interactive record of the session. Opened in the Playwright Trace Viewer, it lets you step through actions one at a time, inspect DOM snapshots at each step, see what the page looked like before and after every click, and read console output and network activity alongside the timeline. When a video shows you *that* the click missed but you need to know *why*, the trace usually has the answer.

A reasonable rule of thumb: keep the default `stagehand` engine for everyday runs, where a screenshot plus video is plenty, and switch to `builtin` with `--record` when you are actively hunting a gnarly intermittent failure and want the trace.

## Your first recorded run

Install the CLI from npm if you have not already:

```bash
npm install -g browserbash-cli
```

The package and its full option list live on the [npm page for browserbash-cli](https://www.npmjs.com/package/browserbash-cli). One install gives you the whole toolkit — engines, providers, recording, and the local dashboard.

Now record a run. Write the objective in plain English and add `--record`:

```bash
browserbash run "go to https://example.com, then verify the page heading says 'Example Domain'" --record
```

That is the entire workflow. An AI agent reads the objective, plans the steps, drives a real browser through them, and returns a verdict plus structured results. Because you passed `--record`, you also get a screenshot and a `.webm` video of the session on disk when it finishes.

A note on the LLM that powers the agent: BrowserBash is Ollama-first, so if you have [Ollama](https://ollama.com/) running locally it will use that by default — free, local, and no API keys. The auto-detection order is Ollama, then Anthropic, then OpenRouter. OpenRouter exposes free models such as `openai/gpt-oss-120b:free`, and you can bring your own Anthropic Claude key if you prefer; all three are optional. The recording behavior is identical no matter which brain you pick — `--record` is about the browser session, not the model. If you want a deeper tour of engines, providers, and LLM options, the [BrowserBash learn pages](https://browserbash.com/learn) walk through each one.

## Recording with the builtin engine to get a trace

When a screenshot and a video are not enough, switch engines and ask for the trace. Select the builtin engine and keep `--record`:

```bash
browserbash run "open the pricing page and confirm the monthly toggle switches the displayed amounts" --engine builtin --record
```

This run produces the usual screenshot and `.webm`, plus a Playwright trace. Open the trace in the Playwright Trace Viewer to step through the run action by action:

```bash
npx playwright show-trace path/to/trace.zip
```

(Use the actual trace path BrowserBash reports at the end of the run.) Inside the viewer you can scrub the timeline, click any action to see the DOM snapshot at that exact moment, and watch the before-and-after of every interaction. For an intermittent failure that only shows up one run in twenty, capturing the trace on the failing run and walking it step by step is usually the fastest path from "it broke" to "here is the line that broke it."

The trace is engine-specific: it is captured by the builtin engine, not by stagehand. So when a trace is what you are after, `--engine builtin --record` is the combination to remember.

## Recording in headless CI

Continuous integration is where recordings earn their keep, because the runner is headless and you never get to watch the browser live. The recording is the only artifact that tells you what actually happened.

The friction is that recording a browser does not require *seeing* the browser. Run headless so the agent does not try to paint a window on a machine with no display, and keep `--record` so the artifacts still land on disk:

```bash
browserbash run "log in and verify the account dashboard loads" --headless --record
```

A few practices keep CI recordings useful rather than noisy:

**Lean on the exit code, not the logs.** In agent mode, `browserbash run "..." --agent` emits NDJSON — one JSON event per line on a stable schema — and the process exit code *is* the verdict. The convention is `0` for passed, `1` for failed, `2` for error, and `3` for timeout. That means your CI step can branch on the exit code without parsing any prose, then collect the recorded artifacts when a run does not pass.

**Combine agent mode with recording.** The two are complementary, not mutually exclusive. Agent mode gives the machine a clean, parseable verdict and event stream; `--record` gives the human a video to watch when that verdict is "failed." Putting them together is the natural fit for CI and for AI coding agents that need both a programmatic signal and a human-reviewable artifact:

```bash
browserbash run "complete checkout with the test card and confirm the order number appears" --agent --headless --record
```

**Upload artifacts from the job.** Wire your CI provider's artifact step to grab the screenshot, the `.webm`, and (on builtin) the trace, so they are attached to the run and a teammate can open them later without re-running anything.

Because BrowserBash sends nothing off your machine unless you pass `--upload`, recorded files stay strictly local by default. In CI that means they live inside the runner and go wherever your pipeline's own artifact handling sends them — and nowhere else.

## Recording committed Markdown tests

Plain-English `run` commands are perfect for one-off checks and quick reproductions, but for a suite you want something committable and reviewable. BrowserBash supports Markdown tests: `*_test.md` files where each list item is a step. Shared steps compose with `@import`, and `{{variables}}` let you parameterize a test — secrets are masked in output, shown as `*****`, so a recorded session of a login flow will not leak a password into the logs.

A small `login_test.md` might look like this:

```markdown
# Login smoke test

- Go to {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field
- Click the "Sign in" button
- Verify the dashboard heading is visible
```

Run it, and add `--record` to capture the session exactly as you would for a plain-English run:

```bash
browserbash testmd run login_test.md --record
```

A Markdown test writes a `Result.md` summarizing what happened, and with `--record` you get the screenshot and `.webm` alongside it. The payoff is that the test, its result, and a video of the actual run all live together — the test file is committed to your repo as living documentation, and when it fails you have the recording right there to explain why. For more patterns and worked examples, the [BrowserBash blog](https://browserbash.com/blog) has a steady stream of guides on Markdown tests, agent mode, and recording.

## Where the browser runs, and what that means for recordings

By default BrowserBash drives your local Chrome — the browser is on your machine, and so are the recordings. But "where the browser runs" is a separate axis from "what gets recorded," and one flag switches it. The supported providers are:

- **local** — your own Chrome, the default.
- **cdp** — any DevTools (Chrome DevTools Protocol) endpoint you point it at.
- **browserbase**, **lambdatest**, **browserstack** — remote browser providers.

Switching is a single flag. To run on LambdaTest, for example:

```bash
browserbash run "open the homepage and verify the nav links load" --provider lambdatest --record
```

The value of recording goes *up* when the browser is remote, not down. With a remote provider you have no way to watch the session live — the browser is in someone else's data center — so a recorded screenshot and video are often the only direct evidence you get of what the run actually did. `--record` works the same way regardless of provider; you are always capturing the session BrowserBash is driving, wherever that session physically lives.

## Viewing recordings on a dashboard

Files on disk are fine for a quick look, but they do not give you history. If you want run history, organized recordings, and per-run replay in one place, BrowserBash offers two dashboards, and which one you use comes down to whether you want the data to stay on your machine.

**The local dashboard** is free and fully private. It runs on your own machine and shows your runs and recordings without anything being uploaded anywhere:

```bash
browserbash dashboard
```

This is the right default when you simply want a nicer way to browse local runs than poking through a folder, and you want to keep everything self-contained.

**The cloud dashboard** is for when you want runs and recordings available beyond your laptop — to share with a team, or to keep a browsable history across machines. Create a free account, connect the CLI with your key, and add `--upload` on any run you want pushed up:

```bash
browserbash connect --key bb_your_key_here
browserbash run "verify signup flow end to end" --record --upload
```

Once uploaded, the cloud dashboard gives you run history, your recordings, and per-run replay, so a video sits right next to the verdict and structured results for that run. The privacy model stays explicit and opt-in: nothing is uploaded unless that run carries `--upload`. On the free tier, cloud runs are retained for 15 days, which comfortably covers the window in which you would actually go back and watch a failure. For local-only work, skip `connect` and `--upload` entirely and use `browserbash dashboard`.

## A complete recording workflow

Pulling the pieces together, here is a sequence that takes you from install to a recorded, uploaded run, with a Markdown test and an agent-mode CI run along the way:

```bash
# 1. Install
npm install -g browserbash-cli

# 2. Record a quick plain-English run (screenshot + .webm)
browserbash run "go to the homepage and verify the hero headline is visible" --record

# 3. Hunt a flaky failure with the builtin engine for a trace
browserbash run "add an item to the cart and verify the count increments" --engine builtin --record

# 4. Record a committed Markdown test
browserbash testmd run checkout_test.md --record

# 5. Run in CI: machine-readable verdict + a video for humans
browserbash run "complete checkout and confirm the order number" --agent --headless --record

# 6. Push a run to the cloud dashboard for history and replay
browserbash connect --key bb_your_key_here
browserbash run "verify the full signup flow" --record --upload

# 7. Or keep everything local and private
browserbash dashboard
```

Every command here is real, and every one of them produces a screenshot and a `.webm` video the moment you add `--record`. The builtin engine adds the trace; agent mode adds a clean exit-code verdict for CI; `--upload` puts the recording in the cloud dashboard; and `browserbash dashboard` keeps it all on your machine. That is the entire surface area of recording in BrowserBash, and it is small on purpose.

## FAQ

### What file formats does BrowserBash record?

On any engine, `--record` captures a screenshot (a still image) and a session video as a `.webm` file, which BrowserBash stitches together with ffmpeg into one continuous recording. If you use the builtin engine, you additionally get a Playwright trace, which you open in the Playwright Trace Viewer to step through the run with DOM snapshots, console output, and network activity at each action.

### Can I record while running headless in CI?

Yes. Recording does not require a visible browser window, so you can combine `--headless` and `--record` in the same command, which is exactly the setup you want on a headless CI runner. The screenshot, `.webm` video, and (on builtin) trace are still written to disk, and you can attach them as build artifacts. Pair it with `--agent` to get a machine-readable NDJSON stream and an exit-code verdict alongside the human-watchable recording.

### Do my recordings get uploaded anywhere automatically?

No. Nothing leaves your machine unless you explicitly pass `--upload` on a run. Without that flag, screenshots, videos, and traces stay strictly local — you can browse them with the free, private `browserbash dashboard` that runs on your own machine. Only runs you choose to push with `--upload` (after `browserbash connect`) appear in the cloud dashboard, where free-tier runs are retained for 15 days.

### How do I view a recording after a run?

For a quick look, open the screenshot or `.webm` file BrowserBash writes to disk, and open any builtin-engine trace with `npx playwright show-trace`. For history and per-run replay, run `browserbash dashboard` to browse your runs locally, or add `--upload` to a run and view it in the cloud dashboard, where the recording sits next to that run's verdict and structured results.

---

Recording a browser run should be one flag, not a project. With BrowserBash it is: add `--record` and you get a screenshot, a `.webm` video, and — on the builtin engine — a Playwright trace, all without leaving your machine unless you decide to upload. It is free and open source, it works headless in CI, and it puts a watchable record next to every verdict.

[Create a free account](https://browserbash.com/sign-up) to push your recorded runs to the cloud dashboard for history and replay — or skip it entirely and keep everything local. Either way, BrowserBash is free and open source, so you can start recording your browser tests today.
