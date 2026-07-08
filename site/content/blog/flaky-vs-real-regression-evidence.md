---
title: Flaky Test or Real Regression? Read the Evidence, Not the Vibe
description: "How to tell a flaky test vs real regression apart using deterministic assertion evidence and run history, without guessing at 2am."
date: 2026-08-10
category: guide
---

It's 2am, the build is red, and someone on the team says "probably flaky, just rerun it." Sometimes they're right. Sometimes that shrug ships a real regression to production because nobody wanted to open the logs. The flaky test vs real regression question sounds like a triviality until you've watched a team rerun a genuinely broken checkout flow four times in a row because the last three failures in that suite really were flaky, and pattern-matching took over from evidence.

This is a guide to doing that triage with evidence instead of vibes: what expected-vs-actual assertion data actually tells you, what a run history of pass/fail flips is for, and where the line sits between "the tool can hand you the evidence" and "you still have to make the call." BrowserBash produces the evidence (deterministic Verify assertions, a stored run history with flaky flags) but it does not auto-classify failures as flake or regression yet. That's an honest limit, not a feature, and it matters for how you build a process around it.

## Why "just rerun it" is a bad default

Rerunning a failed test costs almost nothing in CI minutes and almost everything in trust. Every team that adopts "rerun on failure" without a second thought eventually trains itself to stop reading failures at all. The build goes red, someone clicks rerun, it goes green, everyone moves on. Nobody asked why it failed the first time. Six weeks later a customer files a bug for something the suite "caught" and then un-caught with a rerun.

The opposite failure mode is just as costly: treating every red build as a fire drill. If a team pages someone every time a selector-based test hiccups on a slow CDN response, engineers start ignoring the pager, which is exactly the outcome you were trying to prevent. Neither extreme works. What works is separating "this failed because the app changed" from "this failed because the test, the network, or the browser hiccuped," and doing that separation with evidence you can point to, not intuition.

The core problem is that most test output doesn't give you enough to do that separation. A screenshot of a red X and a stack trace that says `TimeoutError: waiting for selector ".checkout-btn"` doesn't tell you whether the button moved, renamed, disappeared, or just took 400ms longer to render than the test's timeout allowed. You're stuck inferring intent from a stack trace, which is exactly where flaky test vs real regression debates go in circles.

## What flaky actually means, and what it doesn't

"Flaky" gets used as a catch-all for any test result you don't trust, which is part of the problem. It's worth being precise about what actually causes flakiness, because the causes point to different fixes:

- **Timing and race conditions**: an element exists but isn't interactive yet, a network response arrives after the assertion runs, an animation is mid-transition when the click fires.
- **Environmental noise**: a shared staging database, a rate-limited third-party API, a CI runner under memory pressure, a flaky DNS resolver in the test VPC.
- **Non-deterministic app behavior**: A/B test buckets, randomized onboarding order, feature flags that flip mid-run.
- **Test design bugs**: a selector that matches two elements depending on load order, a wait condition that's technically satisfied before the real state you care about.

None of these are "the app broke." A real regression is different in kind: the button really is gone, the text really did change, the API really does return a 500 now. The tricky part is that from the outside, a regression and a race condition can produce an identical-looking failure: a step didn't find what it expected. Without more information than "assertion failed," a human has to guess, and humans guess based on recent memory ("this test's been flaky before") rather than the actual state of the page at failure time.

That's the gap evidence closes. If you know exactly what the test expected and exactly what it found, in structured form, you don't have to guess. And if you know the test's own recent history, you have a base rate to weigh that evidence against.

## Evidence, part one: expected vs actual, not a feeling

The single most useful thing a failing test can hand you is a diff: what did we expect, and what did we actually get. Not a prose explanation from an LLM about what it "thinks" happened, an actual structured comparison you can read in five seconds.

This is what BrowserBash's `Verify` steps are built for. Since v1.5.0, `Verify` lines in a `*_test.md` file compile to real Playwright assertions when they match a known grammar (URL contains a string, page title is or contains a string, text is visible, a named button/link/heading is visible, an element count, a stored value equals something). There's no LLM judgment involved in evaluating those checks. A pass means the condition literally held in the DOM. A fail comes back with expected-vs-actual evidence attached, both in the `run_end.assertions` block of the NDJSON output and in the human-readable assertion table in `Result.md`.

Here's a minimal example of what that looks like in a test file:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md --agent
```

And a snippet of the kind of test that produces useful evidence:

```
# Checkout smoke test

1. Go to https://shop.example.com/cart
2. Verify 'Proceed to Checkout' button visible
3. Click Proceed to Checkout
4. Verify url contains '/checkout'
5. Verify text 'Order Summary' visible
```

If step 4 fails, the assertion record doesn't just say "failed." It says the expected condition was `url contains '/checkout'` and the actual URL at the time of the check was, say, `https://shop.example.com/cart` (meaning the click never navigated) or `https://shop.example.com/checkout/error` (meaning it navigated somewhere real, but wrong). Those two actual values point to completely different root causes: a broken click handler versus a broken checkout flow. That distinction is invisible in a plain pass/fail, and it's the whole ballgame when you're trying to sort flaky test vs real regression at 2am.

Verify lines that don't match the deterministic grammar still run, but they're agent-judged and flagged `judged: true` in the output, so you always know which pieces of evidence are hard fact and which are a model's best read of the screen. That flag matters: you should weight deterministic assertion failures much more heavily than judged ones when deciding whether something is a real regression, because judged assertions inherit whatever uncertainty the model had.

## Evidence, part two: run history and flaky flags

A single failure, even with perfect expected-vs-actual evidence, is still one data point. The second half of the evidence you need is: has this specific test been unreliable before, independent of this run?

BrowserBash's orchestrator keeps a run history (`.browserbash/memory/history.json` per project) that `run-all` uses to order tests (previously-failed and slowest tests run first) and to flag tests that flip between pass and fail across recent runs. A test that failed once in the last 40 runs and passed the other 39 has a very different prior than a test that's failed 3 of the last 5 runs on no code changes at all. That's the base rate a good triage decision needs: not "did this fail," but "how often does this fail when nothing changed."

Combine that with the assertion evidence from the failing run and you get a much better signal than either alone. A test with a clean history that suddenly fails with a hard, deterministic `Verify` assertion (button that used to exist now returns a count of 0) is a strong regression signal. A test with a history of intermittent failures that fails again with a `judged: true` assertion on a page that's known to have slow-loading third-party widgets is a strong flake signal. Neither of those conclusions comes free: you still have to read both pieces of evidence side by side and decide, but the decision stops being a coin flip.

## A decision framework you can actually run

Here's a practical way to structure the call, in the order you should actually check things:

1. **Is the failing assertion deterministic or judged?** Deterministic (`judged` absent or false) failures carry expected-vs-actual DOM/URL/text evidence you can trust literally. Judged failures carry a model's interpretation, weight them lower.
2. **What's the actual value, not just the pass/fail?** Did the actual value show the app in a broken state (error page, wrong URL, missing element) or a plausible transient state (previous page, loading spinner, empty count that a slow API would also produce)?
3. **What does the run history say about this test?** Check `.browserbash/memory/history.json` or the local dashboard for how often this specific test has failed recently with no corresponding code change.
4. **Did anything else in the same run also fail?** A single test failing in isolation, with everything else in the suite green, points more toward an isolated app issue (or an isolated flake) than a broad environmental problem. If ten unrelated tests all failed in the same run, that's an infrastructure story (CI runner, network, provider outage), not ten unrelated regressions.
5. **Does it reproduce on a clean rerun with the replay cache disabled?** A rerun that reproduces the same expected-vs-actual mismatch is much stronger evidence than a rerun that passes clean.

None of these five checks require the tool to tell you "this is a regression." They require the tool to give you honest, structured data at each step, which is what deterministic assertions and run history are for. The judgment call at the end is still yours, and it should be: a human (or a documented team policy) deciding "we treat repeat deterministic failures with no history of flakiness as regressions requiring a fix before merge" is a much better process than an opaque auto-classifier making that call silently.

## Reading a real run_end together

It helps to see the shape of the actual evidence. A `run_end` event from an `--agent` run carries a `status`, a `summary`, `final_state`, an `assertions` array, `cost_usd`, and `duration_ms`. Say a login regression test fails. The relevant slice of the assertions array might look like this conceptually:

- assertion: `text 'Welcome back' visible`
- judged: false
- expected: text "Welcome back" visible on page
- actual: text not found; page text sampled included "Invalid credentials"
- passed: false

That's not a vague timeout, that's evidence the login is actively rejecting valid credentials, which is a strong regression signal regardless of what the test's flaky history looks like. Compare that to:

- assertion: `'Dashboard' heading visible`
- judged: false
- expected: heading "Dashboard" visible
- actual: heading not found; page still showed "Loading..." spinner
- passed: false

That actual value (page still loading) combined with a run history showing this same test flipped pass/fail twice in the last ten runs on an otherwise unchanged branch points toward a timing issue: either the app is genuinely slower under some condition, or the test's wait step needs tightening. Neither of these read-throughs needed a model to tell you what happened. They needed the raw expected-vs-actual value and the history, both of which BrowserBash surfaces in structured form rather than burying in prose.

## Where BrowserBash stops and you start

Here's the honest part: BrowserBash does not currently look at an assertion failure plus a run history and output "regression" or "flake" as a verdict. There's no classifier, no auto-quarantine, no root-cause label attached to a `run_end` event today. What it gives you is the raw material for that decision: deterministic pass/fail with expected-vs-actual detail on `Verify` steps, a `judged` flag so you know which evidence is hard versus soft, a per-test run history with flaky flags in the orchestrator, and cost/duration data that can rule environmental slowness in or out.

Turning that into an automatic verdict is a harder problem than it sounds, because "regression" is ultimately a statement about intent (did the team mean for this to change) that no amount of DOM inspection can answer on its own. A button that disappeared might be a bug, or it might be last night's intentional redesign that nobody updated the test for. That's a call a human, or at minimum a team policy tied to a changelog or PR description, has to make. Advisory failure-triage classification (regression vs UI change vs flake vs infra, plus quarantine suggestions) is on the roadmap as a later feature, and when it ships it'll still be advisory: a suggestion attached to the evidence, not a silent auto-dismiss. Until then, the evidence-first workflow above is the right way to use what's already shipped rather than waiting on a feature that isn't here yet.

## Comparing evidence-based triage to vibe-based triage

The difference shows up clearest side by side.

| Question during triage | Vibe-based ("just rerun it") | Evidence-based (assertions + history) |
|---|---|---|
| Why did it fail? | "Probably flaky" | Expected-vs-actual value from a deterministic `Verify` check |
| Is this new? | Nobody checked | Run history shows first failure in 40 runs, or a repeat pattern |
| Do we trust this signal? | Same weight for every failure | `judged: true` failures weighted lower than deterministic ones |
| What do we do next? | Rerun and hope | Rerun with evidence in hand to confirm or rule out reproduction |
| Who decides regression vs flake? | Whoever's on call, from memory | A person, using structured evidence, against a documented policy |
| Can we audit the decision later? | No, it lived in someone's head | Yes, the assertion table and history are in `Result.md` and CI artifacts |

The right column isn't automated, and it doesn't need to be to be a massive improvement. It just needs to stop being a guess.

## Building this into CI without guessing

In practice, the workflow looks like this. Run your suite with `--agent` for structured NDJSON, or use `run-all` for a whole folder so you get the memory-aware ordering and flaky detection for free:

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml --shard 1/2
```

When something fails, don't rerun blind. Pull the assertion table from `Result.md` (or the `assertions` array in the JSON output if you're piping into a dashboard) and check whether the failing `Verify` line is deterministic or judged, and what the actual value was. Then check the test's entry in run history, either via the local dashboard (`browserbash dashboard`, fully local) or directly in `.browserbash/memory/history.json`, for its recent pass/fail pattern.

If a test is genuinely a repeat offender with a history of environmental-looking failures (judged assertions, timeouts, no consistent actual-value pattern), that's a candidate for tightening the test itself: add explicit `Verify` waits, use saved auth sessions with `--auth <name>` instead of re-logging in every run (which removes one whole category of timing flakiness), or move it off a shared staging environment if that's the noise source. If a test fails with a hard deterministic mismatch and no flaky history, treat it as a regression and block the merge until someone looks at it, full stop.

For continuous checks outside of CI, monitor mode gives you the same evidence stream on a schedule without spamming you on every green run:

```bash
browserbash monitor .browserbash/tests/login_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Monitor only alerts on pass/fail state changes in either direction, so the Slack channel isn't drowning in "still passing" noise, and because the replay cache makes an always-on monitor nearly token-free, you can afford to run it continuously rather than sampling.

The [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wires this into pull requests directly: it posts a self-updating PR comment with the verdict table, uploads JUnit and NDJSON artifacts, and supports the same `shard:` and `budget-usd:` options as the CLI, so the evidence lands right where reviewers are already looking instead of in a build log nobody opens.

## When to escalate to a human instead of retrying

There's a version of this that goes wrong in the other direction: teams that build increasingly elaborate auto-retry logic to avoid ever looking at a failure. Three retries, exponential backoff, quarantine after five consecutive fails, and so on. That's solving the wrong problem. Retry logic is appropriate for genuinely transient infrastructure noise (a third-party API having a bad five minutes), not as a substitute for reading the evidence once.

A good rule of thumb: if a deterministic `Verify` assertion fails with an actual value that shows a broken state (error text, wrong page, missing element that should unconditionally exist), that goes to a human immediately, no retry. If a `judged` assertion fails, or a deterministic one fails with an actual value that looks like a transient state (loading, previous page, partial render), one clean rerun is reasonable, but the result of that rerun (pass or fail, and what changed) should get logged, not silently discarded. Over time, that log is what builds the run history that makes the next triage faster.

## Getting from red build to confident answer

The teams that get good at this aren't the ones with the fanciest auto-classifier, they're the ones with a habit: look at the actual expected-vs-actual value before you decide anything, check whether the test has a history of doing this, and write down what you concluded so the next person (or your future self) doesn't re-litigate it from scratch. Deterministic `Verify` assertions and per-test run history give you the raw material for that habit. Making the call between flaky test vs real regression is still a human judgment, and being honest about that is more useful than pretending a tool has solved it for you.

Start with a suite that surfaces real evidence rather than a red X. If you want to see the assertion format and run history in a real project, the [tutorials](https://browserbash.com/tutorials) walk through writing your first `Verify` steps, and [features](https://browserbash.com/features) has the full rundown of what's deterministic versus agent-judged.

## FAQ

### How do I tell if a test failure is flaky or a real regression?

Look at the expected-vs-actual evidence from the failing assertion first: a deterministic `Verify` failure with an actual value showing a broken app state (error page, missing element, wrong URL) is a strong regression signal. Then check the test's run history: a test with a clean recent history that suddenly fails hard is more likely a regression, while a test with a pattern of intermittent judged-assertion failures is more likely flaky. There's no fully automatic answer, you're combining hard evidence with a base rate.

### Does BrowserBash automatically classify failures as flaky or regressions?

No. BrowserBash gives you the evidence, deterministic Verify assertions with expected-vs-actual detail, a `judged` flag distinguishing hard checks from agent-judged ones, and a per-test run history with flaky flags in the orchestrator, but it does not currently output an automatic "flake" or "regression" verdict. Advisory failure-triage classification is on the roadmap but isn't shipped yet, so the decision is still a human one made from that evidence.

### What's the difference between a deterministic Verify assertion and an agent-judged one?

A deterministic `Verify` step matches a known grammar (URL contains a string, text visible, element counts, stored value equals, and similar checks) and compiles to a real Playwright assertion with no LLM judgment involved, so a fail always comes with concrete expected-vs-actual evidence. A `Verify` line outside that grammar still runs but is evaluated by the agent's read of the screen and gets flagged `judged: true` in the output, meaning it should be weighted as softer evidence than a deterministic failure.

### How does run history help decide if a failing test is trustworthy?

Run history tracks how often a specific test has passed or failed across recent runs independent of the current failure, which the orchestrator uses to flag flaky tests and order previously-failed tests first. A test that's been consistently green and suddenly fails hard is a stronger regression signal than a test that's flipped between pass and fail repeatedly with no code changes, which points toward timing or environmental noise instead.

To try this workflow on your own suite, install with `npm install -g browserbash-cli` and write your first `Verify` steps against a real flow. It's free and open source, and an account is entirely optional (you only need one for the hosted dashboard) so sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want run history and recordings backed up off your machine.
