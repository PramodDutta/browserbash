---
title: A Quarantine Strategy for Flaky Tests in CI
description: "Learn how to quarantine flaky tests in CI so unstable specs stop blocking releases, then use failed-first ordering to fix them fast."
date: 2026-07-24
category: guide
---

Every team hits the same wall eventually. A test that passed a hundred times fails once on a Tuesday afternoon, blocks a release nobody wanted to hold, and someone hits "re-run" until the pipeline goes green. The decision to quarantine flaky tests is usually made in anger, at the worst possible moment, by whoever is on call. That is exactly the wrong time to design a policy. This guide walks through a calm, deliberate strategy: how to isolate unstable tests so they stop gating merges, how to keep them visible instead of deleting them, and how to use failed-first ordering to burn down the quarantine backlog quickly rather than letting it rot.

Flakiness is not a moral failing of your test suite. It is a signal. A flaky end-to-end test is telling you that something (a race condition, an animation, a slow API, a selector that shifts) is non-deterministic, and pretending it is deterministic by re-running until green just hides the message. The goal of a good quarantine strategy is to separate two questions that teams keep tangling together: "should this failure block the release right now?" and "is this test actually broken and worth fixing?" You can answer the first quickly and the second calmly.

## Why re-running until green is a trap

The default reaction to a flaky test is the retry button. Some CI systems even bake it in: retry each failed test up to three times, and count a pass on any attempt. It feels pragmatic. It is also how a two-percent flake rate quietly becomes a forty-percent flake rate over a year, because nobody ever feels the pain that would motivate a fix.

Retries have three real costs. First, they hide regressions. If a test is genuinely catching a new bug intermittently (because the bug itself is a race), retry-until-green will paper over a real defect and ship it. Second, they multiply cost and time. Three retries on a slow browser test is three times the compute and three times the wall-clock delay on every affected run. Third, they erode trust. Once your team learns that a red pipeline "usually goes green on re-run," they stop reading failures at all, and a legitimate break slides through because the muscle memory is to click retry.

Quarantine is the honest alternative. Instead of pretending the failure did not happen, you acknowledge it, move the test out of the blocking path, and put it on a list you actually work through. The pipeline stays trustworthy: a red required check means something is really broken. The flaky test stays alive: it keeps running, keeps reporting, and its history keeps accumulating so you can diagnose it with data instead of vibes.

## What "quarantine" actually means

Quarantine is a status, not a delete. A quarantined test still executes on every run. Its result is still recorded. The one thing that changes is that its pass or fail no longer counts toward the gate that blocks a merge or a deploy. You get three properties out of this:

- Releases stop being held hostage by a test whose failure you cannot immediately explain.
- The test keeps generating signal, so you can see whether it fails ten percent of the time or ninety.
- The quarantine list is a visible, finite backlog, not a graveyard of `.skip()` calls scattered across the codebase that nobody can find.

The last point matters more than it looks. The lazy version of quarantine is commenting a test out or slapping `test.skip` on it. That works for exactly one day, and then the skip is invisible. Six months later you have forty skipped tests, no idea which ones still matter, and no record of when or why each was disabled. A real quarantine strategy keeps the list in one place, timestamps every entry, and has an exit criterion.

### The lifecycle of a quarantined test

Think of quarantine as a state machine with four states:

1. **Active**: the test gates merges normally.
2. **Suspected**: it has failed intermittently but has not yet been formally quarantined. You are watching it.
3. **Quarantined**: it runs but does not gate. It has an owner and a due date.
4. **Resolved**: either fixed and returned to active, or deleted because the behavior it covered is gone.

The failure mode every team falls into is letting tests sit in "quarantined" forever. The fix is a hard rule: every quarantined test has an owner and a review date, and the list gets triaged on a schedule (weekly is realistic for most teams). No owner, no quarantine. A test with no one accountable for it should be deleted, not parked.

## Detecting flakiness before you can act on it

You cannot quarantine what you cannot see. Before any policy is useful you need to reliably distinguish a flaky test from a genuinely failing one, and that requires run history. A single failure tells you nothing. The same test passing, then failing, then passing on identical code is the definition of flaky, and you can only spot that pattern if you are recording every result over time.

BrowserBash tracks this for you. The [memory-aware orchestrator](https://browserbash.com/features) keeps per-test run history in `.browserbash/memory/history.json`, and it flags tests that flip between pass and fail across runs. That flaky flag is the raw material for a quarantine decision: instead of arguing about whether a test "feels" unreliable, you have a record of how often it actually flipped.

Here is a suite run that produces that history and writes machine-readable results for your CI to parse:

```bash
# Run the whole suite, emit JUnit for CI, and let BrowserBash
# record per-test history (flaky flags land in .browserbash/memory)
browserbash run-all .browserbash/tests \
  --junit out/junit.xml \
  --agent > out/events.ndjson
```

Because every run appends to the history store, the flaky detection sharpens over time. A test that has flipped five times in twenty runs is a far stronger quarantine candidate than one that failed once yesterday. Let the data accumulate for a week before you make big calls, unless a test is so obviously non-deterministic that it is blocking the team today.

### Distinguishing the four failure classes

Not every intermittent red is the same, and quarantine is only the right move for some of them. When you look at a failure, sort it into one of four buckets:

- **Real regression**: the test is correct and the app broke. Do not quarantine. Fix the app.
- **UI change**: the app changed on purpose and the test's expectation is stale. Do not quarantine. Update the test.
- **Flake**: non-deterministic pass/fail on unchanged code. This is the quarantine candidate.
- **Infra**: the CI runner ran out of memory, the network dropped, the browser crashed. Fix the environment, not the test.

The trap is quarantining a real regression because it "looks flaky." A race-condition bug in your application will present as a flaky test, and if you quarantine it you have just shipped the bug. This is why quarantine requires a human judgment call, not just an automated flaky flag. The flag tells you the test flips; you still have to decide *why* it flips before you take it out of the gate.

## Setting up the quarantine path in CI

The mechanics are simpler than the policy. You need two sets of tests: the ones that gate, and the ones that run but do not gate. The cleanest way to express this with committable Markdown tests is a folder convention.

Keep your blocking tests in the main tests directory and move quarantined ones into a sibling folder. Your gate runs the first; a separate, non-required job runs the second. Because BrowserBash [Markdown tests](https://browserbash.com/tutorials) are just `*_test.md` files in folders, "quarantining" a test is literally moving a file, and the move shows up in your git history with a date and an author. That is your audit trail for free.

```bash
# Gate job: this one is REQUIRED and blocks the merge
browserbash run-all .browserbash/tests --junit out/gate.xml

# Quarantine job: runs the unstable tests, reports, but is NOT required
browserbash run-all .browserbash/quarantine --junit out/quarantine.xml
```

Mark the second job as non-required in your branch protection rules. It still shows up in the checks list, still uploads its JUnit results, still tells you the current state of every quarantined test. It just cannot block a merge. Your developers see both, but only one holds the line.

If you run BrowserBash through the [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), each job posts its own self-updating verdict comment on the pull request. The gate comment is the one people watch; the quarantine comment is the burndown dashboard, sitting right there in the PR, reminding everyone how many tests are still parked.

### Keeping the two jobs honest

A quarantine folder is only safe if it stays small and moves in one direction most of the time. Two guardrails keep it from becoming a dumping ground:

- **A size cap.** Pick a number (say, fifteen tests) and treat crossing it as a stop-the-line event. If your quarantine folder is overflowing, the message is that your suite or your app has a stability problem you need to address directly, not paper over.
- **A one-way default.** Adding to quarantine should be easy; it is a pressure-release valve you want people to reach for instead of hitting retry. Leaving quarantine should require a passing streak. A test earns its way back into the gate only after it goes, say, twenty consecutive runs without flipping.

## Failed-first ordering: fixing quarantine fast

Getting tests out of the blocking path is the defensive half of the strategy. The offensive half is burning the quarantine list down, and this is where ordering matters. When you sit down to fix flaky tests, you want the pipeline to show you the worst offenders first, not run through two hundred healthy tests before it reaches the one that has been flipping all week.

BrowserBash orders its runs failed-first and slowest-first by default. The [memory store](https://browserbash.com/features) remembers which tests failed on the previous run and which took longest, and the next run puts those at the front. For quarantine work this is exactly the loop you want: run the quarantine folder, and the tests most likely to reproduce their failure surface immediately, so you get your fastest feedback on the tests you are actively debugging.

```bash
# Debug loop: failed-first ordering surfaces the worst
# quarantined tests first, so you reproduce fast
browserbash run-all .browserbash/quarantine --agent
```

The practical effect is a tight iteration cycle. You make a change to a suspect test (add an explicit wait, tighten an assertion, seed data deterministically), re-run the folder, and because the previously-failed test runs first you know within seconds whether your fix held, instead of waiting for the full suite. Multiply that across a week of quarantine triage and the time savings are real.

### Reproducing a flake deterministically

Failed-first ordering gets you to the test quickly; reproducing the flake reliably is the next problem. Two BrowserBash features help. First, the replay cache: a green run records its actions, and the next identical run replays them with no model calls, stepping the agent back in only when the page actually changed. That means the *non-flaky* parts of a flow run identically every time, so the variance you observe is isolated to the genuinely non-deterministic step.

Second, deterministic Verify assertions. A lot of "flakiness" is actually an assertion that is too loose or timed wrong. If your test asks an LLM to judge whether "the dashboard loaded," you inherit the model's judgment variance on top of any real app variance. Rewriting that as a deterministic `Verify` step compiles it to a real Playwright check with no model in the loop, which removes an entire class of false flakiness:

```markdown
---
version: 2
---
# Checkout flaky test, hardened

- Go to https://shop.example.com and add the first product to the cart

POST https://shop.example.com/api/promo with body { "code": "SAVE10" }
Expect status 200, store $.discountId as 'promo'

- Open the cart and apply promo {{promo}}

Verify: text "10% off" is visible
Verify: 'Checkout' button is visible
```

The API step seeds the promo deterministically instead of clicking through a flaky admin UI, and the two `Verify` lines are real Playwright assertions, not agent judgment. When a test is built this way, a failure is far more likely to be a real bug than a false alarm, which makes your quarantine decisions much cleaner. Note that testmd v2 currently runs on the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible gateway.

## A weekly quarantine triage that actually works

Policy without a ritual decays. The single highest-leverage habit is a short, recurring quarantine review. Here is a version that survives contact with a busy team.

Once a week, someone owns a fifteen-minute pass through the quarantine folder. For each test they ask three questions in order:

1. **Has it stopped flipping?** If the history shows a clean passing streak, promote it back to the gate. Do this first because it is the fastest win and shrinks the list.
2. **Does anyone still own it, and is the behavior still real?** If the feature is gone or nobody will claim it, delete the test. A test with no owner and no relevant behavior is pure noise.
3. **What is the actual root cause?** For the survivors, the owner spends real time only here. Failed-first ordering means these are the tests your debug runs surface first anyway.

The discipline that makes this work is the review date. Every entry in the quarantine list carries the date it was added. Anything past its review date without progress gets escalated: either someone commits to fixing it this week, or it gets deleted. "Quarantined indefinitely" is not a state you allow to exist. If you want the deeper reasoning behind failure classification and quarantine as an engineering discipline, the [BrowserBash learn hub](https://browserbash.com/learn) goes further than a single guide can.

### An anti-pattern checklist

A few habits reliably turn a quarantine strategy into a graveyard. Watch for these:

- **Silent skips.** `test.skip` with no record, no owner, no date. Invisible within a week.
- **Retry-as-policy.** Global retry counts that mask flakiness instead of surfacing it. If you must retry, retry loudly and count the flake.
- **The forever folder.** A quarantine directory that only grows. Without a size cap and a promotion path it is just a slower delete.
- **Quarantining regressions.** Taking a real, intermittent app bug out of the gate because it looked flaky. This ships the bug.
- **No exit criterion.** If there is no defined way for a test to earn its way back, it never will.

## When quarantine is the wrong tool

Quarantine is a release-safety valve, not a fix, and there are cases where reaching for it is the wrong move.

If a test fails *every single time*, it is not flaky, it is broken. Quarantine is for non-deterministic tests. A consistently red test is either a real regression (fix the app) or a stale expectation (fix the test), and moving it to quarantine just hides a decision you should make now.

If more than a fraction of your suite is flaky, quarantine will not save you. When a quarter of your tests are unstable, the problem is architectural: too many implicit waits, a test environment that is under-resourced, an application with pervasive race conditions, or selectors that shift on every deploy. Quarantining half your suite to get a green pipeline is theater. The honest move is to stop feature work and stabilize, and no isolation strategy substitutes for that.

And if you are choosing between quarantine and simply making the test deterministic, prefer determinism. Many flaky browser tests are flaky only because of timing and loose assertions. Between the replay cache pinning the stable steps and Verify assertions removing model judgment from the checks, a lot of tests that would have gone to quarantine can just be hardened in place. Quarantine is for the ones you genuinely cannot stabilize today.

## How BrowserBash fits the workflow

Nothing above requires a specific tool, and honesty matters here: you can build a quarantine strategy with any test runner that lets you tag or fold tests and record history. Playwright's own annotations, a custom reporter, and a spreadsheet will get you most of the way. What BrowserBash gives you is that the pieces are already assembled: run history and flaky flags out of the box, failed-first and slowest-first ordering by default, deterministic Verify assertions to reduce false flakiness at the source, a replay cache to isolate the non-deterministic step, and folder-based test organization that makes "quarantine" a git move with a built-in audit trail.

Because the tests are plain-English Markdown files, the quarantine list is human-readable. A product manager can open the quarantine folder and understand what is parked without reading a single selector. And because [runs emit NDJSON in agent mode](https://browserbash.com/tutorials), your own scripts or an AI coding agent can consume the results, watch the flaky flags, and even propose which tests to promote or delete. The strategy stays yours; the plumbing is handled.

One honest caveat worth repeating: if you run the builtin engine against a very small local model, long multi-step flows can themselves be a source of variance, which is its own kind of flakiness. For hard, multi-step flows the sweet spot is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model. Deterministic Verify steps and the replay cache blunt this, but it is worth naming so you diagnose model variance separately from real application flakiness.

## FAQ

### What does it mean to quarantine a flaky test?

Quarantining a flaky test means moving it out of the path that blocks merges or deploys while still letting it run and report results. The test keeps executing and keeps building history, but a failure no longer holds up a release. It is different from skipping or deleting a test, because the test stays visible on a tracked list with an owner and a review date so it actually gets fixed instead of forgotten.

### Should I use automatic retries instead of quarantine?

Automatic retries and quarantine solve different problems, and retries are usually the more dangerous choice. Retrying until green hides both real regressions and true flakiness, inflates cost and wall-clock time, and slowly trains your team to ignore red pipelines. Quarantine keeps the pipeline honest by acknowledging the failure and moving the test to a non-blocking, tracked path. If you retry at all, do it loudly and record the flake so the data still drives a fix.

### How do I tell a flaky test from a real bug?

Sort every intermittent failure into one of four classes: a real regression, a stale expectation from an intentional UI change, a genuine non-deterministic flake, or an infrastructure problem. Only the true flake is a quarantine candidate. The dangerous case is a race-condition bug in your application, which looks exactly like a flaky test, so quarantining it would ship the bug. Use run history to confirm the test flips on unchanged code, then still make a human judgment about why before you remove it from the gate.

### How does failed-first ordering speed up fixing flaky tests?

Failed-first ordering runs the tests that failed most recently, and the slowest tests, at the front of the run instead of the back. When you are actively debugging quarantined tests, this means the ones you care about reproduce first, so you get feedback on your fix in seconds rather than after the whole suite finishes. Over a week of quarantine triage that tight loop compounds into real time saved, because you are never waiting for healthy tests to run before you reach the broken one.

Ready to stabilize your suite? Install the CLI with `npm install -g browserbash-cli` and start recording flaky-test history on your next run. An account is optional and everything runs locally, but if you want hosted history and monitors you can [sign up here](https://browserbash.com/sign-up).
