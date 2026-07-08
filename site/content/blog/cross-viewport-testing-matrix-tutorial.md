---
title: Test Every Viewport in One Command: --matrix-viewport
description: "Run a cross viewport testing matrix in one command with BrowserBash's --matrix-viewport flag, then read per-cell results in JUnit and NDJSON."
date: 2026-08-04
category: tutorial
---

Responsive bugs rarely show up on the viewport you happen to be testing on. A checkout button that's perfectly clickable at 1280x720 can slide under a sticky footer at 390x844, and nobody notices until a support ticket comes in from a phone. A cross viewport testing matrix is the fix: instead of running your suite once and hoping the layout holds everywhere, you run it once per screen size and get a pass or fail for each one. BrowserBash builds this in directly with `--matrix-viewport`, so you don't need a separate script, a device farm subscription, or a pile of duplicated test files to cover phone, tablet, and desktop in the same run.

This tutorial walks through the two viewport flags BrowserBash ships, how to read the per-cell results they produce in JUnit and in `--agent` NDJSON output, and where a viewport matrix actually earns its keep versus where it won't save you. If you've been maintaining three copies of the same test file with different hardcoded window sizes, this is the section to skip straight to.

## What --viewport and --matrix-viewport actually do

BrowserBash gives you two related but distinct flags for controlling browser window size during a run.

`--viewport WxH` sets a single fixed viewport for one run. It works on `browserbash run`, on a single `testmd run`, and on both engines (stagehand and builtin). You'd use it when you already know the specific screen size you're debugging and just want to reproduce a bug at that size:

```bash
browserbash run "Open https://example.com/checkout and verify the pay button is visible" --viewport 390x844
```

`--matrix-viewport` is the multiplier. Give it a comma-separated list of dimensions and `run-all` executes every test in your suite once per viewport in the list. A five-test suite with three viewports in the matrix becomes fifteen executions, each one labeled with the viewport it ran under. Nothing about your test files changes: the same plain-English steps in your `*_test.md` files just get replayed against a different window size for each pass.

```bash
browserbash run-all .browserbash/tests --matrix-viewport 1280x720,390x844
```

That single command is the entire point of this feature. You write your login flow, your checkout flow, your search flow once in plain English, and the matrix runs each of them across however many screen sizes you care about, without you writing a loop, a CI matrix job, or a second set of test files.

## Why a cross viewport testing matrix belongs in your suite

Most teams test responsive design visually, once, during code review, on whatever monitor the reviewer has open. That catches the obvious stuff: a logo that's too big, a nav bar that wraps badly. It does not catch the stuff that actually breaks a purchase flow: a modal that opens off-screen at a narrow width, a form field that's technically present in the DOM but rendered behind a fixed header so a real click never lands on it, or a dropdown that opens downward off the visible viewport on a short mobile screen.

A cross viewport testing matrix catches these because it's not eyeballing a screenshot, it's driving the actual flow: clicking the actual button, typing into the actual field, and checking the actual resulting state, at each screen size. If the pay button isn't clickable at 390 pixels wide because a cookie banner is covering it, the test fails there and passes at 1280, and you get a viewport-labeled failure instead of a vague "site is broken on mobile" bug report three days later.

This matters more the closer your product gets to a majority-mobile user base. If your analytics show 60% of traffic on phones and your regression suite has never run below 1280 pixels, you have a coverage gap that's proportional to your actual audience. `--matrix-viewport` closes that gap without asking you to maintain a second suite.

## Quick start: running your first viewport matrix

Assume you have a `.browserbash/tests/` folder with a handful of `*_test.md` files covering login, search, and checkout. Running them once, normally, looks like this:

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml
```

To turn that into a cross viewport testing matrix covering desktop and a common mobile size, add `--matrix-viewport`:

```bash
browserbash run-all .browserbash/tests --matrix-viewport 1280x720,390x844 --junit out/junit.xml
```

You can list as many viewports as you want, comma-separated, with no spaces:

```bash
browserbash run-all .browserbash/tests --matrix-viewport 1920x1080,1280x720,768x1024,390x844
```

A reasonable starting matrix for most web apps is four points: a large desktop size (1920x1080), a standard laptop size (1280x720), a tablet size (768x1024), and a common phone size (390x844, roughly an iPhone-class width). You don't need to chase every device in existence. Four viewports that span your real traffic distribution will catch the large majority of layout bugs a wider matrix would also catch, at a fraction of the run time.

## Reading per-cell labels in JUnit output

The whole value of a matrix collapses if you can't tell which viewport actually failed. BrowserBash labels each execution with the viewport it ran under, both in the JUnit file `run-all` writes and in the human-readable results, so a CI failure tells you exactly where to look instead of just that something, somewhere, broke.

When you open the JUnit XML from a matrix run, each test case in the report corresponds to one test file executed at one specific viewport, and the viewport shows up in the test case's identifying label so you can see at a glance that `checkout_test.md` passed at 1280x720 and failed at 390x844, rather than getting one ambiguous result per test file with no way to know which screen size it represents. In practice this means your CI dashboard or PR comment stops saying "3 of 12 tests failed" and starts telling you which three tests, and which viewport each one failed at, in the same report you were already generating.

If your CI system renders JUnit XML into a readable table (most do: GitHub Actions test reporters, GitLab CI, Jenkins, CircleCI all parse JUnit natively), the viewport-labeled test case names show up automatically with zero extra configuration. You already have the pipeline step; the matrix just adds rows to the same report.

## Reading per-cell labels in --agent NDJSON events

If you're driving BrowserBash from an AI coding agent, a script, or a custom dashboard rather than a CI runner that parses JUnit, you'll be consuming `--agent` NDJSON output instead. The same viewport labeling applies there. Each `step` and `run_end` event in the stream carries the viewport it ran under, so a script consuming the stream can group results by viewport without cross-referencing a separate config file.

```bash
browserbash run-all .browserbash/tests --matrix-viewport 1280x720,390x844 --agent > matrix-results.ndjson
```

A downstream consumer reading that file line by line can filter `run_end` events, check the `status` field for `passed` or `failed`, and pair each result with the viewport label it ran under to build its own summary: pass rate per viewport, which specific test files are viewport-sensitive, whether a given failure is new at this viewport or has been failing there for a while. Because NDJSON is one JSON object per line, this is a trivial `jq` filter or a five-line Python loop, not a parsing project. This is the same NDJSON contract BrowserBash uses everywhere else in agent mode: exit code 0 for passed, 1 for failed, 2 for error, 3 for timeout, with the viewport dimension riding along as additional structured data rather than requiring a separate protocol.

## Combining the matrix with sharding and budgets

A viewport matrix multiplies your total execution count, which means it also multiplies your total run time and, if you're on a paid model, your total cost. BrowserBash's sharding and budget controls compose cleanly with `--matrix-viewport` so a wide matrix doesn't turn into an unbounded CI job.

`--shard i/n` splits your suite into deterministic slices computed from sorted discovery order, so parallel CI machines agree on which slice each one owns without any coordination between them. Combine it with the matrix and each shard runs its portion of the suite across every viewport in the matrix:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --matrix-viewport 1280x720,390x844 --budget-usd 2
```

That command is doing three things in one line: running a quarter of your suite (shard 2 of 4), across two viewports, with a hard spend ceiling. If the suite crosses the budget mid-run, `run-all` stops launching new tests, reports the remaining ones as `skipped`, exits with code 2, and writes the actual spend into `RunAll-Result.md` and the JUnit `<properties>` block so you can see exactly where the money went. This matters specifically for a viewport matrix because a matrix is the single fastest way to accidentally 3x or 4x your CI spend without anyone noticing until the invoice arrives.

If you're running BrowserBash on the Ollama-first default (local models, no API key, nothing leaving your machine), the budget flag is mostly moot since there's no per-call cost to track. It becomes relevant the moment you switch to a hosted model for a hard flow that a local model handles unreliably, which is a common pattern: run the easy 80% of your matrix on a free local model and reserve a paid model's budget for the flows that actually need it.

## What kinds of bugs a viewport matrix actually catches

It's worth being specific about what "catches real bugs" means here, because a viewport matrix is not a visual regression tool and it's not going to flag every pixel that's one shade off.

What it does catch, reliably: elements that are present in the DOM but not interactable at a given width because something else is covering them (sticky headers, cookie banners, modals with fixed positioning). Content that's technically visible but requires horizontal scrolling to reach, which a real click or type action will fail on even though the element "exists." Navigation that collapses into a hamburger menu at narrow widths where your test steps assume the desktop nav is directly clickable, meaning the same plain-English objective genuinely needs to succeed at multiple layouts, not just render similarly. Forms where a field drops out of the tab order or becomes hidden behind an accordion at a smaller breakpoint. Any flow where the checkout, signup, or core conversion path has a viewport-specific dead end, which is exactly the kind of bug that costs revenue and gets found by a customer instead of a test.

Because BrowserBash's engine drives a real browser and interprets plain English rather than matching fixed selectors, the same test file adapts its search for "the search box" or "the checkout button" at each viewport. That's actually an advantage for a viewport matrix specifically: a selector-based test that hardcodes `#desktop-nav-search` will simply fail to find the element at a mobile breakpoint where the markup uses `#mobile-nav-search`, and you'll spend time writing viewport-conditional selectors. A plain-English step describing intent ("search for wireless keyboards") has a better chance of finding whichever search box is actually rendered and visible at that width, so your matrix results reflect real usability differences rather than selector maintenance debt.

## What a viewport matrix won't catch

Being honest about limits here matters more than the sales pitch. A cross viewport testing matrix is a functional and interaction check, not a pixel-perfect visual regression tool. It will not flag that a button is two pixels too far left, that a font rendered slightly differently, or that a color is subtly off-brand. If your team needs true visual diffing (pixel-level screenshot comparison against a baseline), that's a different category of tool and BrowserBash's Verify assertions and matrix runs aren't a substitute for it.

It's also not going to catch performance regressions specific to a viewport (a mobile page that's technically functional but takes eight seconds to become interactive on throttled network), and it won't catch touch-specific interaction bugs that only manifest with an actual touch pointer rather than a resized mouse-driven browser window, since `--viewport` changes window dimensions, not the input model.

And a matrix is only as good as the viewports you choose. If your real traffic includes a foldable-device width or an unusually wide ultrawide monitor and your matrix only covers the four common sizes, you'll have the same blind spot you had before, just at a different width. Pull your actual traffic breakdown by screen width before deciding the matrix, rather than guessing at "common" sizes.

## Cross viewport testing matrix vs. other approaches

There's more than one way to get responsive coverage, and it's worth being clear about where each one actually fits, since none of them is strictly better across every dimension.

| Approach | Setup cost | Runs in CI unattended | Catches interaction bugs (not just pixels) | Needs selector maintenance |
|---|---|---|---|---|
| Manual resize during code review | None | No | Sometimes, if reviewer clicks through | No |
| Cloud device farm, manual click-through | Medium (account, device selection) | No, human-driven | Yes | No |
| Visual regression / screenshot diffing tools | Medium to high (baseline management) | Yes | No, pixel-only | Usually no, but baseline-sensitive |
| BrowserBash `--matrix-viewport` | Low (one flag, existing test files) | Yes | Yes | No, plain-English steps |

The honest takeaway from that table: if what you need is pixel-perfect visual diffing to catch a designer's one-off polish regression, a dedicated visual regression tool does that job better than a functional matrix ever will, that's not what this feature is for. If what you need is "does the actual user flow work at the sizes real users are on," a viewport matrix that drives real interactions is closer to the truth than a screenshot diff, because a screenshot can look fine while the button underneath it is unclickable. Most mature test suites eventually want both: a functional matrix for flow correctness and a separate visual tool for pixel-level polish. BrowserBash's matrix is built for the first job, and it's honest about not doing the second.

## Setting up a practical viewport matrix for your team

A few practical guidelines from actually running this pattern:

Start narrow. Two viewports (a desktop size and a mobile size) is enough to catch the majority of responsive bugs and keeps your CI time and spend predictable. Add a tablet size once you've confirmed the two-point matrix is stable and your team trusts the results.

Run the matrix on your critical paths first, not your entire suite. Checkout, signup, and search are the flows where a viewport-specific bug costs you money or users. A settings page that's slightly awkward at 390 pixels is a lower priority than a checkout button you literally cannot click.

Pair the matrix with `--budget-usd` from day one if you're on a paid model. It's cheap insurance against a matrix silently multiplying a suite that was already borderline on cost, and the failure mode (tests reported `skipped`, exit code 2) is loud enough that you'll notice in CI rather than discovering it on a bill.

Use the Verify assertion grammar where you can inside test files that run in the matrix. Deterministic checks (`'name' button visible`, text visible, URL contains) compile to real Playwright checks rather than agent judgment, so a pass or fail at a given viewport is unambiguous evidence rather than a model's interpretation, which matters more, not less, once you're running the same check across four screen sizes and comparing results.

If you're new to BrowserBash generally, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections walk through writing your first `*_test.md` file before you add a matrix on top of it, and the [feature overview](https://browserbash.com/features) covers Verify assertions and sharding in more depth than this article does. If you're running this in CI already, the [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) supports shard matrix jobs directly, which pairs naturally with a viewport matrix on the same suite.

## FAQ

### What is the difference between --viewport and --matrix-viewport in BrowserBash?

`--viewport WxH` sets a single fixed browser window size for one run, useful for reproducing a specific bug at a known screen size. `--matrix-viewport` takes a comma-separated list of sizes and runs your entire `run-all` suite once per size, producing viewport-labeled results for every combination of test file and viewport in one command.

### Can I run a viewport matrix in CI and get labeled JUnit output?

Yes. `run-all --matrix-viewport 1280x720,390x844 --junit out/junit.xml` writes each test's per-viewport result as a labeled entry in the JUnit file, so a standard CI test reporter shows you which specific viewport a failure happened at rather than one ambiguous result per test file.

### Does a viewport matrix work together with sharding and budget limits?

Yes. `--matrix-viewport` composes with `--shard i/n` and `--budget-usd`, so you can split a suite across parallel CI machines and cap total spend while still covering multiple screen sizes. This matters because a matrix multiplies total execution count, and combining it with a budget stop keeps that multiplication from becoming an unbounded cost.

### Will a viewport matrix catch every responsive design bug?

No. It catches functional and interaction bugs, elements that are hidden, unclickable, or off-screen at a given width, because it drives real clicks and real typing at each size. It does not catch pixel-level visual regressions like a font rendering slightly differently or a color being a shade off; that's a job for a dedicated visual regression tool, not a functional matrix.

BrowserBash is free and open source, and a cross viewport testing matrix is available the moment you install it: `npm install -g browserbash-cli`. No account is required to run it locally with local models; create one at [browserbash.com/sign-up](https://browserbash.com/sign-up) only if you want the optional cloud dashboard on top.
