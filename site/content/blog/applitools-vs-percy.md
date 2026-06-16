---
title: Applitools vs Percy: Visual Testing Tools Compared
description: "Applitools vs Percy compared on AI diffing, cost, and workflow — an honest 2026 breakdown plus a free way to drive flows in plain English and record video."
date: 2026-05-06
category: comparison
---

If you are weighing Applitools vs Percy, you have already accepted the premise that screenshots belong in your test suite — and that is the right instinct for catching the layout breaks that functional assertions sail straight past. Both tools watch your UI render and flag when it changes against a stored baseline. But they pick very different fights once you look past the marketing pages. Applitools sells a Visual AI engine and an enterprise platform around it; Percy (now part of BrowserStack) sells fast, developer-friendly visual review wired tightly into CI. This guide compares the two honestly on AI diffing, cost, and day-to-day workflow, says plainly where each one wins, and then shows where a free, plain-English tool fits for the part of testing neither of them was built to cover.

I have run pixel-diff suites that screamed on every font-rendering hiccup, and I have run smarter ones that stayed quiet until something genuinely broke. The difference is mostly in the diff engine and how you configure it. So let's start there, because it is the heart of the Applitools vs Percy decision.

## The one-paragraph answer

If you want the short version before the depth: **choose Applitools when the visual diff itself is the hard part and you will pay for an AI engine that suppresses noise; choose Percy when you want fast, no-fuss visual review baked into pull requests and you are already in or near the BrowserStack ecosystem.** Both are commercial screenshot-comparison platforms. Both store baselines, render your pages or components, and surface a reviewable diff. The split is philosophical: Applitools bets that smarter image comparison is worth a premium, while Percy bets that a tight, fast developer loop matters more than diff sophistication. Neither one drives a multi-step user flow in plain English or records a video of the run for a human to review — and that is the gap we will get to.

## What Applitools actually is

Applitools is a Visual AI platform. Its flagship idea is that naive pixel-by-pixel comparison is a trap: anti-aliasing, sub-pixel rendering, dynamic content, and minor browser differences all trigger false positives that bury real regressions under a pile of meaningless red. Applitools' answer is its comparison engine (marketed as Visual AI), which aims to compare images more the way a human would — ignoring imperceptible rendering noise while still catching a button that shifted, text that overflowed, or a control that vanished.

That engine is the product. Around it sits a platform: a dashboard for reviewing and approving diffs, baseline management across browsers and viewports, and an Ultrafast Test Cloud / Execution Cloud concept that renders your captured DOM snapshots across many browser-and-device combinations without you running each one live. The pitch is that you capture once and validate everywhere, with the AI keeping the noise down so review stays manageable at scale.

Applitools is positioned as enterprise software. It integrates with most test runners — Selenium, Cypress, Playwright, WebdriverIO, Storybook, and more — through SDKs you embed in existing tests. You keep writing the test that navigates to the right state, then call something like `eyes.check(...)` at the moment you want a visual assertion. The strength is the diff intelligence and the breadth of cross-environment rendering. The cost is, well, cost and complexity: it is a paid platform aimed at teams that treat visual quality as a first-class, funded concern.

### Where Applitools genuinely shines

If your application is visually dense — a design-system-heavy product, a data-visualization tool, a marketing site where pixel fidelity is the brand — the AI diffing earns its keep. The whole reason teams abandon homegrown pixel-diff scripts is false-positive fatigue, and reducing that noise is exactly what Applitools is built to do. Its cross-browser rendering breadth is also a real differentiator: validating one captured snapshot across dozens of browser/viewport combinations is faster and cheaper than spinning up that many live sessions. For a large QA org with budget and a baseline-approval workflow already in place, this is a credible enterprise choice.

## What Percy actually is

Percy, acquired by BrowserStack in 2020, is a visual testing and review platform with a developer-first personality. The core loop is familiar: you add Percy's SDK to your existing tests (or to Storybook), snapshots get captured during a run, Percy renders them on its infrastructure, and it posts a visual review back to your pull request. Reviewers see side-by-side diffs, approve or reject, and Percy gates the merge on that approval.

Percy's reputation is speed and simplicity. It is designed to slot into CI with minimal ceremony, render snapshots consistently on its own browsers (so you are not at the mercy of whatever rendered your local screenshot), and keep the review experience tight enough that developers actually use it instead of routing around it. It supports responsive snapshots across widths, handles a range of frameworks, and leans heavily on the GitHub/GitLab/Bitbucket integration so visual review feels like just another required check.

On the diffing side, Percy historically used pixel-based comparison with controls to manage flakiness — snapshot stabilization, the ability to ignore regions, and rendering on consistent infrastructure to remove a lot of the environmental noise. BrowserStack has layered more capability on top over time, and exactly how "smart" Percy's current diffing is compared to Applitools' marketed AI is the kind of thing that shifts release to release, so treat any head-to-head diff-quality claim as something to verify on your own UI rather than take on faith. The honest framing as of 2026: Percy optimizes the workflow; Applitools optimizes the comparison.

### Where Percy genuinely shines

If your real pain is "we keep shipping CSS regressions and nobody notices until a customer does," Percy's PR-gating model fixes that with very little setup. The consistent rendering infrastructure removes the classic "works on my machine" screenshot drift. And if you are already paying BrowserStack for cross-browser or device-cloud testing, Percy folds into that relationship and billing instead of adding a separate enterprise vendor. For component-driven teams using Storybook, the integration is clean and fast.

## Applitools vs Percy: the comparison table

Here is the honest side-by-side. Anything not publicly fixed — pricing tiers especially — is marked as such, because both vendors use quote-based or tier-based plans that change and that I will not invent numbers for.

| Dimension | Applitools | Percy (BrowserStack) |
|---|---|---|
| Core bet | Smarter AI diffing reduces false positives | Fast, developer-friendly visual review in CI |
| Diff approach | Visual AI comparison engine (perception-oriented) | Pixel-based with stabilization + ignore controls; capabilities evolving |
| Cross-env rendering | Broad: one snapshot validated across many browsers/viewports (Ultrafast/Execution Cloud) | Renders on Percy infra; responsive widths; deeper cross-browser via BrowserStack |
| Integration model | SDKs embedded in existing tests (Selenium, Cypress, Playwright, Storybook, etc.) | SDKs + Storybook; tight Git PR review gating |
| Ecosystem | Standalone enterprise Visual AI vendor | Part of BrowserStack platform/billing |
| Workflow gating | Dashboard review + baseline approval | PR-based visual review as a required check |
| Pricing | Commercial, enterprise-oriented; not publicly fixed | Commercial; tiers via BrowserStack; not publicly fixed here |
| Open source | No | No |
| Drives multi-step flows | No — you script the navigation | No — you script the navigation |
| Plain-English authoring | No | No |
| Records run video for review | Not its purpose (captures snapshots) | Not its purpose (captures snapshots) |

Read the last three rows carefully. Neither tool *drives* your application. Both assume you already wrote the test that gets the UI into the state worth photographing. They are assertion layers, not navigation layers. That distinction is the whole reason this comparison does not end at the table.

## AI diffing: the real difference, minus the hype

The phrase "AI diffing" gets thrown around loosely, so let's be precise about what it does and does not mean in the Applitools vs Percy context.

A naive pixel diff compares two images cell by cell and flags any cell that differs beyond a threshold. It is simple and it is brutal — a one-pixel anti-aliasing shift on a font edge lights up as a "change," and after a week of that, your team stops reading the reports. Every serious visual tool exists to escape that fate.

Applitools' Visual AI is its attempt to compare images at the level of *what a person would notice*: grouping pixels into regions, understanding that some changes are perceptually meaningless and others are not, and surfacing only the latter. When it works, the payoff is a low-noise review queue where almost every flagged diff is worth a human's attention. That is genuinely valuable, and it is the single strongest reason to pay the Applitools premium.

Percy's approach has historically leaned on a combination of pixel comparison and *control* — stabilizing snapshots, rendering on consistent infrastructure so the inputs are clean, and giving you ignore-regions for known-dynamic areas. The strategy is to remove noise at the source rather than to out-think it at comparison time. For a lot of UIs, clean inputs plus sensible ignore rules get you most of the way to a quiet queue without a heavyweight AI engine.

The honest takeaway: if your UI produces a lot of perceptually-irrelevant pixel churn that you cannot easily fence off with ignore regions, Applitools' engine is likely worth it. If your UI is reasonably stable and your noise is the predictable kind (timestamps, ad slots, animated bits), Percy's control-based model may get you to the same quiet place for less money and less ceremony. Do not buy the AI engine to solve a problem you can solve with three ignore regions and a stable renderer.

## Cost: how to think about it without invented numbers

I will not quote you a price for either tool, because both use commercial, tier-or-quote-based pricing that moves, and fabricating numbers would be worse than useless. What I *can* do is hand you the cost model so you can run your own math.

Visual testing platforms generally bill on **snapshot volume** — the number of screenshots captured per run, multiplied by the browser/viewport combinations you render, multiplied by how often your pipeline runs. That last multiplier is the silent budget-killer. A suite with 200 snapshots across 4 viewports is 800 images per run; run it on every pull request and every main-branch merge across an active team, and the monthly snapshot count balloons fast. Both Applitools and Percy live in this world, so before you compare vendors, count your *actual* snapshot-runs per month. That number drives the bill more than the per-snapshot rate does.

Applitools adds the cross-environment rendering angle: because it can validate one captured snapshot across many environments without live sessions, the unit economics of broad coverage can be attractive at enterprise scale — but it is enterprise-priced to match. Percy's cost folds into the BrowserStack relationship, which is a plus if you already pay them and a consideration if you do not want another platform dependency.

The blunt advice: get quotes for *your* snapshot volume from both, and treat any blog (including this one) that hands you a confident dollar figure with suspicion. The right comparison is your numbers, not a generic table.

## The gap both tools leave open

Here is the thing neither Applitools nor Percy does, by design: **they do not drive your application, and they do not produce a video of the journey for a human to watch.**

Both are assertion layers. You still have to write and maintain the test that logs in, navigates three screens deep, opens the modal, and gets the UI into the exact state worth photographing. That navigation code — selectors, waits, page objects — is the part that rots when the UI changes, and it is the part visual tools explicitly leave to you. When a Percy or Applitools run fails, you get a still image of *where* it broke; you do not get a replayable recording of the *path* that led there, which is often what you actually need to reproduce a flaky failure.

That is the seam where [BrowserBash](https://browserbash.com/features) fits — not as a visual-diff replacement, but as a way to author and run the *flow* in plain English and capture a video of the whole thing for review, for free.

## Where BrowserBash fits: plain-English flows and free video review

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. Instead of selectors and page objects, you write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step, then returns a verdict plus structured results. There is no account required to run it, and it is designed to default to free local models so your testing bill can genuinely be zero.

```bash
npm install -g browserbash-cli

browserbash run "log in with the demo account, add the first item to the cart, \
complete checkout, and verify the page shows 'Thank you for your order!'"
```

No selectors in that command. The agent figures out the buttons and fields itself. The model story is Ollama-first: it defaults to free local models with no API keys and nothing leaving your machine, then auto-resolves from a local Ollama install to `ANTHROPIC_API_KEY` to `OPENROUTER_API_KEY` if you want a hosted model. OpenRouter exposes genuinely free hosted models (such as `openai/gpt-oss-120b:free`), and you can bring your own Anthropic Claude key for the hardest flows.

One honest caveat so you size expectations correctly: very small local models (around 8B parameters and under) can get flaky on long, multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. If you point a tiny model at a ten-step checkout, do not be shocked when it loses the thread.

### Recording video for review, for free

This is the part that maps directly onto the gap left by Applitools and Percy. BrowserBash can record the run:

```bash
browserbash run "search for a blue running shoe, open the first result, \
and add it to the wishlist" --record
```

The `--record` flag captures a screenshot *and* a full `.webm` session video via ffmpeg on any engine. On the builtin engine you also get a Playwright trace you can open in the trace viewer. So when a flow fails, you have a watchable recording of the path that led there — the thing a still-image diff cannot give you. You can review it locally, or opt in to the free cloud dashboard for run history and per-run replay:

```bash
browserbash connect
browserbash run "complete the password reset flow" --record --upload
```

The cloud dashboard is strictly opt-in via `browserbash connect` plus `--upload`, free uploaded runs are kept for 15 days, and if you would rather keep everything on your machine there is a fully local dashboard with `browserbash dashboard`. Either way, you are getting video review without an enterprise contract. See the [pricing page](https://browserbash.com/pricing) for the full breakdown of what is free.

### Committable tests and CI that does not parse prose

For flows you want to version-control, BrowserBash supports markdown tests — committable `*_test.md` files where each list item is a step, with `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so credentials never leak into your CI output. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md --record
```

For pipelines and AI coding agents, `--agent` emits NDJSON — one JSON event per line on stdout — with clean exit codes (0 passed, 1 failed, 2 error, 3 timeout). No prose parsing, no scraping a log for "PASSED." That makes it easy to wire a plain-English smoke test into the same CI job that runs your Percy or Applitools visual checks. The [learn section](https://browserbash.com/learn) walks through setting that up.

And where the browser actually runs is a one-flag decision. The default `local` provider uses your own Chrome, but you can switch to a `cdp` DevTools endpoint or a cloud vendor:

```bash
browserbash run "verify the homepage hero loads on a fresh session" \
  --provider lambdatest --headless --record
```

Providers include `local`, `cdp`, `browserbase`, `lambdatest`, and `browserstack` — so if you already run Percy through BrowserStack, you can point BrowserBash's flow execution at the same infrastructure.

## When to choose each tool

Let's make this actionable. None of these are mutually exclusive — plenty of teams run a visual tool *and* a flow-driver — but here is who each one is for.

**Choose Applitools when** the visual diff is your hardest problem, your UI generates a lot of perceptually-irrelevant pixel noise, you need broad cross-browser/viewport validation from a single capture, and you have the budget and the review process to run an enterprise Visual AI platform. If false-positive fatigue has already killed a homegrown pixel-diff effort, this is the tool built to fix exactly that.

**Choose Percy when** you want fast visual review gated on pull requests with minimal setup, your UI is stable enough that control-based noise reduction is sufficient, and you are already in or comfortable joining the BrowserStack ecosystem. For component-driven teams on Storybook who just want CSS regressions caught before merge, Percy is hard to beat on time-to-value.

**Add BrowserBash when** the part that hurts is authoring and maintaining the *navigation* — not the visual assertion — or when you want a free, watchable video record of a user journey without an enterprise contract. It does not diff baselines for you; it drives the flow in plain English, returns a verdict, and records the run. Use it alongside a visual tool, not instead of one, if pixel-level baselines are a hard requirement. The [case studies](https://browserbash.com/case-study) show teams using it as a free smoke-test layer in front of heavier suites.

The honest summary: Applitools and Percy answer "does it *look* right?" BrowserBash helps answer "does the *flow* work, and can I watch what happened?" Those are different questions, and the best stacks often answer all three.

## A realistic combined workflow

Picture a checkout pipeline. On every pull request, BrowserBash runs a plain-English smoke test — log in, add to cart, check out, verify the confirmation — in `--agent` mode, recording video so any failure ships with a replay. If that passes, your Percy or Applitools step captures snapshots at the key screens and gates the merge on visual approval. The flow-driver catches "the checkout is broken"; the visual tool catches "the checkout button moved 40 pixels and overlaps the price." Neither tool is doing the other's job, and you are paying for visual diffing only where it earns its keep. That layered approach — free flow execution underneath, paid visual diffing on top — is usually more honest about cost than trying to make one tool do everything.

## FAQ

### Is Applitools better than Percy for visual testing?

It depends on your pain. Applitools is generally stronger when false-positive noise from pixel diffing is your core problem, because its Visual AI comparison engine is built to suppress perceptually-irrelevant changes. Percy is stronger when you want fast, low-setup visual review gated on pull requests and you value workflow speed over diff sophistication. Neither is universally "better" — match the tool to whether your hard problem is the diff or the developer loop.

### How much do Applitools and Percy cost?

Both use commercial, tier-or-quote-based pricing that changes over time, so any fixed number you see should be verified directly with the vendor. The biggest driver of your actual bill is snapshot volume — screenshots per run, times browser/viewport combinations, times how often your pipeline runs. Count your real monthly snapshot-runs first, then get quotes from both for that number rather than trusting a generic price comparison.

### Can Applitools or Percy drive a multi-step user flow on their own?

No. Both are visual-assertion layers that assume you already wrote the test that navigates the application into the state worth photographing. They capture and compare screenshots; they do not click through a login, a cart, and a checkout for you. For driving the flow itself, you need a separate automation layer, which is where a tool like BrowserBash that runs plain-English objectives comes in.

### What is a free alternative for testing user journeys with video?

BrowserBash is a free, open-source CLI that drives a real Chrome browser from a plain-English objective and can record a full `.webm` session video with the `--record` flag. It defaults to free local models so the model bill can be zero, needs no account to run, and offers an opt-in free cloud dashboard plus a fully local one. It does not replace a visual-diff tool, but it covers the flow-execution and video-review gap that Applitools and Percy leave open.

Ready to fill that gap for free? Install with `npm install -g browserbash-cli`, write your first objective in plain English, and run it against a real browser today. No account is required to get started, though you can [sign up](https://browserbash.com/sign-up) for the free cloud dashboard whenever you want run history and replay.
