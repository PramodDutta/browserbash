---
title: Screenshot testing with BrowserBash
description: "Screenshot testing AI workflows with BrowserBash: use --record to capture screenshots and video across every page in one plain-English run."
date: 2026-06-02
category: use-case
---

Screenshot testing AI tools usually means one of two things, and people mix them up constantly. The first is *visual regression* — capture a known-good image, capture a new one, diff them, and flag changes. The second is *evidence capture* — drive a flow, grab a screenshot (and ideally a video) at every step so you have proof of what the browser actually saw. BrowserBash is firmly in the second camp, and it does the part most teams skip: getting a real Chrome browser to walk every page you care about, on its own, from a plain-English objective, and dropping a screenshot plus a `.webm` recording into a run folder you can open later. This post is about that workflow — using `--record` to capture screenshots across pages — and where it fits next to the dedicated diffing tools you may already know.

Upfront about scope: BrowserBash does not ship a pixel-diff engine, a baseline store, or a perceptual AI comparison model. If you want "fail the build when this button moves four pixels," a purpose-built visual platform is the right tool, and I'll name them honestly. What BrowserBash gives you is the hard, tedious front half of any screenshot pipeline — navigating the app like a user, reaching the right states, and recording each one — without selectors, page objects, or a recorded script that rots the moment your markup changes.

## What "screenshot testing" actually means in 2026

The phrase gets stretched to cover a whole spectrum, so it helps to pin down the layers before deciding what you need.

At the bottom is **raw capture**: take a picture of a page or component. That's `page.screenshot()` in Playwright, or `--screenshot` in the Playwright CLI. No comparison, no verdict — just a PNG on disk.

In the middle is **visual regression**: capture the same view twice and compare. The comparison strategy is where the interesting differences live. Classic tools do **pixel-by-pixel** diffs, which are precise but notoriously noisy — anti-aliasing, font smoothing, a one-pixel shadow shift, and you get a red diff that means nothing. Some tools do **DOM-based** comparison, checking structure and attributes rather than rendered pixels, which misses anything that only shows up after layout and paint.

At the top is what the industry now markets as **screenshot testing AI** or "Visual AI": a perceptual model that looks at a rendered page the way a person would, recognizes that a button is a button, and decides whether a shift is *meaningful* or just noise. Applitools built its Visual AI engine around exactly this idea — comparing what pixels *mean* rather than the pixels themselves — and it's the headline differentiator for that class of product. Percy (BrowserStack) and Chromatic sit nearby with their own noise-reduction approaches; as of 2026 Percy markets a "Visual Review Agent" aimed at cutting pixel-diff noise, and Chromatic is tightly coupled to Storybook component workflows. I'll come back to where each one wins.

BrowserBash adds a different axis the diffing tools mostly assume you've already solved: **how do the screenshots get taken in the first place, across many pages, in the right states?** That's an automation problem, and it's the one that usually eats the most maintenance.

## Where BrowserBash fits: the capture layer, driven by an agent

Here's the thing nobody puts on the marketing page for a visual tool: a screenshot is only as good as the state behind it. A baseline of your dashboard is worthless if your test couldn't log in, dismiss the cookie banner, switch to the right workspace, and wait for the chart to render. The diff engine is the easy 20%. Reaching the state is the brutal 80%.

That 80% is exactly what BrowserBash automates. You write a plain-English objective. An AI agent drives a **real** Chrome browser — clicking, typing, scrolling, waiting — figures out the steps itself, and returns a verdict plus any structured values it extracted. No selectors to maintain, no page-object layer to refactor when a class name changes. Add `--record` and every run captures a screenshot and a full `.webm` session video using a bundled ffmpeg, written to an on-disk run folder. On the `builtin` engine it also writes a Playwright trace you can open in the trace viewer.

So the mental model is: BrowserBash gets the browser to the right page and proves it got there. If you later want true regression diffing, you feed those captures into a dedicated comparator. For a huge number of teams, though, the agent-driven capture *is* the test — you're not chasing four-pixel deltas, you're answering "did the agent reach checkout and does the page look sane in the recording?"

It's open-source (Apache-2.0), free, and built by The Testing Academy. You can read the full command surface on the [features page](https://browserbash.com/features), and the broader philosophy in the [learn section](https://browserbash.com/learn).

## Capturing screenshots across pages with `--record`

The practical core of this article is `--record`. Add it to any `run` and BrowserBash captures a screenshot plus a `.webm` recording of the session. Because the agent drives the whole flow, "across pages" isn't a separate feature — it's just what happens when your objective spans multiple pages. You describe a journey, the agent walks it, and the recording covers every page it touched.

Start simple. Capture the homepage and confirm it rendered:

```bash
browserbash run "Open https://browserbash.com and confirm the main heading and primary call-to-action button are visible" --record
```

That single command launches your local Chrome, navigates, checks the page, and writes a screenshot and `.webm` into the run folder. Now widen it to a multi-page walk:

```bash
browserbash run "Go to https://browserbash.com, then visit the pricing page, then the features page, and on each one confirm the main heading renders and there are no obvious broken layouts or error banners" --record --headless
```

One objective, three pages, one recording that scrolls through all of them. The `--headless` flag runs Chrome without a visible window, which is what you want in CI. If a mid-size model is interpreting the English, the agent will navigate between pages on its own — you didn't write a single URL-to-URL transition by hand.

For a flow behind auth, describe the login and the pages you want to land on. Use markdown tests (covered below) when secrets are involved, but a one-shot looks like this:

```bash
browserbash run "Log in at https://app.example.com with the test account, open the Reports page, then the Settings page, and confirm each page loads its main content without errors" --record --timeout 180
```

The `--timeout` is in seconds and matters for longer journeys — give a multi-page authenticated walk room to breathe. Every run, recorded or not, is also kept on-disk at `~/.browserbash/runs` (secrets masked, capped at the most recent 200), so you have a history even when you forget the flag.

### What you get out of a recorded run

After a `--record` run you have, per run:

- A **screenshot** of the page state.
- A **`.webm` video** of the whole session — useful for "what did the agent actually see between step 3 and step 5."
- On the `builtin` engine, a **Playwright trace** you can open in the Playwright trace viewer for a step-by-step DOM timeline.

That trio is genuinely good failure evidence. When a CI run goes red at 2 a.m., the video usually tells you in ten seconds whether it was a real regression, a slow third-party widget, or the agent getting confused — more than a bare pixel-diff percentage gives you.

## Engines, providers, and models for screenshot capture

Three knobs decide how a capture run behaves. Getting them right is most of the skill.

**Engine — who interprets your English.** The default is `stagehand` (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when the page shifts. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright; it's auto-selected for LambdaTest and BrowserStack, and it's the engine that writes the Playwright trace alongside your screenshots. If trace artifacts matter to you, reach for `builtin` with `--engine builtin`.

**Provider — where the browser actually runs.** `local` (default) uses your own Chrome, which is the simplest path for screenshot work on your machine or a CI runner. `cdp` attaches to any DevTools endpoint over `--cdp-endpoint ws://...`. Then there are the grid providers — `browserbase`, `lambdatest`, `browserstack` — each gated behind their own credentials, useful when you need to capture the same pages across real browser/OS combinations rather than just your local Chrome.

**Model — the LLM that reads the page and decides the next action.** BrowserBash is Ollama-first. The default `auto` resolves in order: a local Ollama model if present (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (`claude-opus-4-8`), then `OPENAI_API_KEY` (`openai/gpt-4.1`), otherwise it errors with guidance. You can pin a model with `--model`.

Here's the honest caveat for screenshot work specifically: very small local models (8B and under) get flaky on long, multi-step objectives — exactly the multi-page walks where capture is most valuable. A two-page check might be fine; a ten-page authenticated tour will wander. The sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model for the hard flows. If you're running a multi-page capture and it keeps losing the thread, the model is the first thing to upsize, not the objective:

```bash
browserbash run "Visit the homepage, pricing, and features pages and confirm each renders cleanly" --model ollama/qwen3 --record --headless
```

The [pricing page](https://browserbash.com/pricing) lays out the free-on-local story; the short version is that local models mean a guaranteed $0 model bill, because nothing leaves your machine.

## Making it repeatable: markdown tests for screenshot suites

One-shot `run` commands are perfect for spot checks, but a real screenshot suite wants to be committed, reviewed, and re-run. That's what markdown tests are for. A `*_test.md` file lists steps as list items, supports `{{variables}}` templating and `@import` composition, and — critically for any page behind a login — masks secret-marked variables as `*****` in every log line. After each run it writes a human-readable `Result.md`.

A page-walk capture test might read:

```bash
browserbash testmd run ./visual_walk_test.md
```

Inside that file, each list item is a step: navigate to a page, confirm the heading, move to the next page, confirm the next heading, and so on. Because steps are plain English, a designer or PM can read the suite and tell you whether it covers the right screens — which is rarely true of a Playwright spec full of CSS selectors. Pair the markdown test with `--record` semantics in your runner and you get a committable suite that produces screenshot and video evidence on every run.

This is also where screenshot testing stops being a developer-only ritual. The [tutorials](https://browserbash.com/tutorials) walk through building these files step by step, and the markdown format is the thing that makes the suite survive past the engineer who wrote it.

## Wiring screenshot capture into CI

The point of automated capture is that it runs without you. BrowserBash is built for that with `--agent`, which emits NDJSON — one JSON object per line, no prose to parse. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal object carrying `status`, `summary`, `final_state`, and `duration_ms`. Exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. Your pipeline gates on the exit code and stores the screenshots and `.webm` files as build artifacts.

A minimal CI invocation:

```bash
browserbash run "Open the homepage, pricing, and features pages and confirm each renders without errors" --headless --record --agent
```

Pipe the NDJSON to a log, archive the run folder, and let the exit code decide whether the stage is green. Because the recording is captured on the same run, your failure artifact is already attached — no separate screenshot step, no flaky "did the screenshot job also run" coordination. The deeper CI patterns, including how teams have an agent self-verify a deploy, live in the [case study](https://browserbash.com/case-study).

### A note on flakiness and evidence

Agent-driven runs are non-deterministic by nature — the model picks the next action each time. That's a real trade versus a hand-pinned Playwright script. The mitigation is the evidence trail: when a recorded run fails, you watch the `.webm`, see exactly where it went sideways, and decide in seconds whether to re-run or file a bug. That's a different debugging loop than staring at a pixel-diff heatmap and guessing why row 47 went red. Neither is strictly better; they answer different questions.

## Local dashboard vs cloud: where your screenshots live

By default, nothing leaves your machine. Captures land in `~/.browserbash/runs`, and you can browse them in a fully local dashboard:

```bash
browserbash dashboard
```

That serves a dashboard at `localhost:4477` with no account and no network calls — your screenshots and videos stay on disk. (`--clear` wipes the store if you want a clean slate.) You can also pop the dashboard for a single run with `--dashboard`.

If you *want* shareable runs — say, to send a recording to a teammate — there's an opt-in cloud path. Link once with `browserbash connect --key bb_...`, then add `--upload` to the specific runs you want pushed. Without `--upload`, nothing is uploaded, full stop. Free cloud runs are kept for 15 days. The opt-in nature matters for screenshot testing in particular, because screenshots of a logged-in app can contain real data, and you should be the one who decides which ones leave your laptop. You can grab a key on the [sign-up page](https://browserbash.com/sign-up) — the account is optional and only needed for cloud upload.

## BrowserBash vs dedicated visual testing tools

This is the section where I tell you when *not* to reach for BrowserBash. Screenshot testing AI products are a mature category, and several of them do diffing far better than a general automation CLI ever will. Here's an honest comparison of what each layer is actually for.

| Tool / approach | Core job | Diff engine | Best fit | Honest limitation |
| --- | --- | --- | --- | --- |
| **BrowserBash** | Agent-driven capture across pages, plus a pass/fail verdict | None built in — captures screenshot + `.webm` (+ trace on `builtin`) | Reaching real states and recording evidence without selectors; free, local, $0 on local models | No baseline store or pixel/perceptual diff; agent runs are non-deterministic |
| **Applitools Eyes** | Perceptual visual regression | Visual AI (perceptual model trained on UI screenshots) | "Fail when the UI meaningfully changes," cross-browser/device matrices | Commercial; pricing not publicly fixed (contact sales as of 2026) |
| **Percy (BrowserStack)** | Visual regression in the BrowserStack ecosystem | Pixel diff with noise reduction; a "Visual Review Agent" marketed in 2026 | Teams already on BrowserStack wanting visual coverage in one dashboard | Tied to the BrowserStack ecosystem; specifics of the review agent not fully public |
| **Chromatic** | Component-level visual review | Snapshot diffing for Storybook stories | Storybook-first teams reviewing component changes pre-merge | Works best only when Storybook is your workflow; component-, not app-, centric |
| **Playwright `toHaveScreenshot`** | Built-in screenshot assertions | Pixel diff with configurable thresholds | Teams already writing Playwright specs who want free, code-level diffs | You write and maintain the selectors and the script |

A few honest takeaways from that table. If your job is literally "catch a four-pixel button shift across Chrome, Firefox, and Safari," Applitools' perceptual Visual AI is the category leader — BrowserBash has no diff engine to compete there. If you live in Storybook and review components before merge, Chromatic is purpose-built and BrowserBash isn't trying to replace it. If you already write Playwright specs, `toHaveScreenshot` gives you free pixel diffs without adding a tool at all.

Where BrowserBash earns its place is the capture-and-evidence layer those tools assume you've solved: reaching the right state across many pages from one English sentence, no selectors, recording the whole thing, free and fully local by default. These approaches are complementary, not exclusive — let the agent drive and capture, then hand the images to a comparator if you need true regression diffing.

## Who this workflow is for

Reach for BrowserBash screenshot capture if you want to walk many pages and prove the browser saw each one, without writing and re-writing selectors every sprint; if you value free and local by default (a $0 model bill on local Ollama, nothing leaving your machine unless you opt in); if good failure *evidence* — a video plus a trace — matters more to you than a precise pixel-delta percentage; or if non-engineers need to read and own the suite, which committable markdown tests make possible.

Look elsewhere, or layer a second tool on top, if your primary need is a true visual regression gate that fails on sub-perceptual UI changes; if you need a managed baseline store with approval workflows; or if you require a fully deterministic, hand-pinned script with zero model variance. Those are real needs, and a dedicated visual platform serves them better. BrowserBash and those tools aren't mutually exclusive — the agent handles the capture nobody enjoys writing, and a comparator handles the diffing it doesn't do. You can compare the full open-source surface on [npm](https://www.npmjs.com/package/browserbash-cli) and the source on [GitHub](https://github.com/PramodDutta/browserbash).

## A realistic end-to-end example

Tie it together. Say you ship a marketing site and want a nightly check that the homepage, pricing, and features pages all render cleanly, with recorded proof, gated in CI, costing nothing.

```bash
browserbash run "Open https://browserbash.com, then the pricing page, then the features page. On each page confirm the main heading is visible and there are no error banners or broken layouts. Report a clear pass or fail." --headless --record --agent --model ollama/qwen3
```

That one line: drives a real Chrome headless, walks three pages on its own, captures a screenshot and a `.webm` of the whole tour, emits NDJSON your pipeline parses, exits `0` or `1` to gate the build, and runs on a local mid-size model so the model bill is zero. Archive the run folder as a CI artifact and you have nightly visual evidence with no selectors and no per-page script. If the model starts wandering on longer walks, upsize it before you touch the objective — that's the single highest-leverage change for multi-page capture reliability.

That's the shape of screenshot testing AI with BrowserBash: not a diff engine pretending to be smart, but an agent that does the genuinely hard part — getting to the page and recording what it saw.

## FAQ

### Does BrowserBash do visual regression with baseline image diffing?

No. BrowserBash captures screenshots and a `.webm` recording with `--record` (plus a Playwright trace on the builtin engine), but it has no built-in baseline store or pixel/perceptual diff engine. For a true regression gate that fails on UI changes, use a dedicated tool like Applitools, Percy, or Playwright's built-in screenshot assertions, and let BrowserBash handle the capture and state-reaching that feeds them.

### How do I capture screenshots across multiple pages in one run?

Write a plain-English objective that names the pages you want and add `--record`. The agent navigates between pages on its own — for example, "open the homepage, then pricing, then features, and confirm each renders" — and the single recording covers every page it touched. For repeatable suites, put the same steps in a committable markdown test and run it with `browserbash testmd run`.

### Is screenshot capture free, and does anything leave my machine?

Capture is free and, by default, fully local. Runs land in `~/.browserbash/runs` and you can browse them in a local dashboard at localhost:4477 with no account. Nothing is uploaded unless you explicitly link the cloud with `browserbash connect` and add `--upload` to a specific run. On a local Ollama model, the model bill is $0 because nothing leaves your machine at all.

### Which model should I use for multi-page screenshot runs?

Use a mid-size model. Very small local models (8B and under) get flaky on long, multi-step walks, which is exactly where capture matters most. A mid-size local model like Qwen3 or a Llama 3.3 70B-class model, or a capable hosted model such as claude-opus-4-8, handles multi-page journeys far more reliably. If a long walk keeps losing the thread, upsize the model before changing the objective.

Screenshot testing with an agent doesn't have to mean a license, a baseline store, or a wall of selectors. Install it and capture your first multi-page run for free:

```bash
npm install -g browserbash-cli
```

Then grab an optional key at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you ever want shareable cloud runs — though for local screenshot capture, no account is needed at all.
