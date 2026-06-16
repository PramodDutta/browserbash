---
title: Flaky Test Root Cause Analysis: A Debugging Playbook
description: "A debugging playbook for flaky test root cause analysis: trace flake to selectors, timing, and state in Selenium and Cypress, and kill the top cause."
date: 2026-04-11
category: guide
---

A test that fails one run in fifteen and passes on retry is not a small annoyance. It is a slow leak in your team's trust, and it usually means nobody is doing real flaky test root cause analysis. Instead, the suite grows a layer of `retry: 2` config, a Slack channel of "just re-run it" messages, and an unspoken rule that red does not always mean broken. That is the exact moment a genuine regression slips into production wearing the costume of a known flake. This playbook is about reversing that: how to trace a flaky test back to its actual root cause, fix the cause instead of the symptom, and structurally remove the single biggest source of flake from Selenium and Cypress suites.

The core mistake teams make is treating flakiness as a statistics problem to be retried away rather than a determinism problem to be debugged. Every flaky test has a cause. It is reproducible if you control the right variables. The job is to find which variable you stopped controlling. By the end of this guide you will have a repeatable diagnostic process, a triage table mapping symptoms to causes, and a concrete way to eliminate the number-one root cause using intent-based runs with [BrowserBash](https://browserbash.com/features), a free and open-source natural-language browser automation CLI.

## The Three Buckets Every Flaky Test Falls Into

When you sit down to debug, resist the urge to look at the stack trace first. Instead, classify the failure into one of three buckets. Nearly every flaky end-to-end test you will ever meet lives in exactly one of these, and the bucket tells you which tools to reach for.

**Selectors and DOM coupling.** The test cannot find an element, finds the wrong element, or finds an element that is not yet interactive. The locator was correct when written and is wrong now because the DOM shifted underneath it.

**Timing and concurrency.** The test acts before the application is ready, or asserts before an async operation completes. It passes on a fast laptop and fails on a loaded CI runner because the race resolved differently.

**State and data.** The test assumes a user, a cart total, a feature flag, a database row, or a clean session that was not actually guaranteed. Parallel runs, shared staging, and leftover data from a previous test all poison this bucket.

There is a fourth, smaller bucket worth naming: infrastructure flake, such as a network blip to a third-party service or a browser that crashed out of memory. It is real, but it is usually obvious and rarely the thing that erodes trust day to day. The three buckets above account for the overwhelming majority of flaky test root cause findings in practice.

The reason classification matters is that the buckets do not share fixes. You cannot `await` your way out of a selector problem, and you cannot tighten a locator to fix a data-isolation bug. Misdiagnosing the bucket is how teams spend a week "fixing flake" and end up with the same failure rate.

## A Repeatable Diagnostic Process

Root cause analysis falls apart when it is improvised. Here is a process you can run the same way every time, so two engineers reach the same conclusion.

### Step 1: Reproduce on purpose

A flake you cannot reproduce is a flake you cannot fix. Your first goal is to make the failure happen on demand, not to fix anything. Run the single test in a tight loop, fifty or a hundred times, and record the pass/fail ratio. In most runners you can script this:

```bash
for i in $(seq 1 50); do npx playwright test checkout.spec.ts --reporter=line || echo "FAIL on run $i"; done
```

If it fails 3 in 50 locally, you have a reproduction. If it never fails locally but fails on CI, the environment is part of the cause, and you have just learned something important: the variable you stopped controlling is environmental. Slow down the machine deliberately. Throttle CPU, throttle the network, run the suite in parallel against itself, and watch the failure rate climb. Forcing the race is the fastest path to seeing it.

### Step 2: Capture the failing run, not the passing one

The single most wasted hour in flake debugging is staring at logs from a run that passed. You need artifacts from the moment it broke. That means a screenshot at failure, ideally a video of the full session, and, where your tooling supports it, a trace you can step through frame by frame. A trace shows you the DOM, the network, and the console at every action, which is the difference between guessing and knowing.

This is where most home-grown setups fall short. Capturing a video and a trace on every flaky run, on whatever engine you use, is not something Selenium gives you out of the box. Keep this requirement in mind; it shapes which tool you reach for later.

### Step 3: Read the artifact against the three buckets

With the failing run captured, walk the three buckets in order:

- Did the action target the right element, and was that element present and interactive? If no, you are in the selector bucket.
- Did the application finish its async work before the test acted or asserted? If no, you are in the timing bucket.
- Was the precondition data actually what the test assumed? If no, you are in the state bucket.

Read the trace top to bottom. The first action that behaves differently between a passing and failing run is your prime suspect. Everything after it is noise.

### Step 4: Form one hypothesis and test it

Change exactly one thing. If you suspect timing, add an explicit wait for the real condition and re-run your loop of fifty. If the failure rate drops to zero, you have confirmed the bucket. If it does not, revert and try the next hypothesis. Resist changing three things at once; you will fix the flake and never know which change did it, which means you will not recognize the pattern next time.

### Step 5: Verify the fix statistically

One green run proves nothing about a test that failed 3 in 50. Re-run your loop and require a clean sweep, ideally a few hundred runs across the parallelism level CI actually uses. Only a statistically clean result closes the ticket.

## Symptom-to-Cause Triage Table

Once you have read enough failing runs, the symptoms start to map cleanly onto causes. Keep this table next to your debugger.

| Symptom in the log | Most likely bucket | Likely root cause | First thing to try |
| --- | --- | --- | --- |
| `ElementNotFound` / `no such element` only sometimes | Selectors | Locator coupled to a class hash or DOM position that changed | Re-target by role/text; remove `nth-child` chains |
| `ElementNotInteractable` / click intercepted | Timing | Acted before element was ready or an overlay was present | Wait for the element to be stable and visible, not a fixed sleep |
| Assertion sees stale or empty value | Timing | Asserted before async data resolved | Wait for the network/UI condition, then assert |
| Passes locally, fails on CI | Timing or State | Slower runner exposes a race, or shared env drift | Throttle locally to reproduce; isolate data |
| Fails only in parallel | State | Tests mutate shared records or sessions | Give each run its own data and session |
| Fails first run, passes after | State | Leftover state from a prior run "fixes" it | Reset state in setup, not teardown |
| Random element from a list clicked | Selectors | Ambiguous locator matches multiple nodes | Scope the locator; assert uniqueness |

The pattern that should jump out: two of these seven rows are pure selector problems, and several of the timing rows are selector-adjacent because a brittle locator that matches the wrong node looks exactly like a race. Selectors are not just one bucket among three. They are the dominant root cause, and they leak into the others. That is the lever worth pulling.

## Why Selectors Are the Number-One Root Cause

If you instrument a mature Selenium or Cypress suite and tag every flaky failure by bucket, the selector bucket almost always wins, and it wins for a structural reason, not a discipline reason.

A selector like `div.css-1a2b3c > button:nth-child(2)` encodes three assumptions at once: that the wrapper `div` exists, that the generated class hash is stable, and that the button is the second child. Modern frontends violate all three routinely. CSS-in-JS regenerates that hash on every build. A component library bump adds a wrapper element. A designer reorders two buttons. None of these changes the behavior a user experiences, and none of them should fail a test, yet each one snaps the locator.

Even "good" selectors decay. A `data-testid` is more stable than a class hash, but it still depends on a developer remembering to keep it, and it still does not survive a component being replaced wholesale. Page Object Models centralize the locators, which makes them easier to update, but centralizing brittle locators does not make them less brittle. It just moves the breakage to one file.

The deeper issue is that selectors describe *implementation*, while tests should describe *intent*. A human tester does not think "click the second child of the div with class css-1a2b3c." They think "click the Checkout button." The gap between those two sentences is where flake lives. Close the gap and a whole category of root causes disappears. The [migration away from selector-based tests](https://browserbash.com/learn) is the highest-leverage anti-flake move most teams can make.

### A worked Selenium example

Consider a Selenium test for a checkout flow. The login step uses `driver.findElement(By.cssSelector("form > div:nth-child(3) input"))` to find the password field. It works for months. Then the team adds a "Remember me" toggle above the password field. Now `div:nth-child(3)` is the toggle, not the password input. The test types the password into a checkbox label, the login fails, and the failure surfaces three steps later as an unrelated assertion error on the order confirmation page. The stack trace points at the wrong line entirely. An engineer spends an afternoon convinced the checkout API is flaky when the real root cause was a positional selector two steps upstream. This is the everyday shape of selector flake: the symptom and the cause are far apart, and the locator decay is invisible until you read the failing run frame by frame.

## Eliminating the Top Cause With Intent-Based Runs

Here is the structural fix. If selectors are the dominant root cause and they are dominant *because* they encode implementation, then writing tests in terms of intent removes the cause rather than mitigating it.

BrowserBash takes a plain-English objective and an AI agent drives a real Chrome or Chromium browser step by step to accomplish it. There are no selectors to maintain, no page objects to refactor, and no `nth-child` chains to decay. You describe what a user would do, and the agent figures out which element satisfies that intent at runtime, against the DOM as it actually is in that moment.

```bash
npm install -g browserbash-cli

browserbash run "Log in as standard_user, add the first backpack to the cart, \
complete checkout, and verify the page says 'Thank you for your order!'"
```

Because the agent resolves elements by what they *do* rather than where they *sit* in the DOM, the entire class of "the class hash changed" and "a wrapper div was added" failures stops happening. The wrapper div is irrelevant. The regenerated hash is irrelevant. The button reorder is irrelevant. The agent is looking for the Checkout button the way a human reads the page, so the test only fails when a human would also be unable to check out, which is exactly the behavior you wanted from a test in the first place.

This is not magic, and it is worth being precise about the trade-off. Very small local models, roughly 8B parameters and under, can themselves be flaky on long multi-step objectives, occasionally misreading a page or losing the thread of a complex flow. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, for anything beyond a short flow. You are trading deterministic-but-brittle selectors for a probabilistic-but-robust agent, and on a sufficiently capable model that trade strongly favors fewer total flakes, because selector decay was the larger and more frequent failure source to begin with.

### The model story without a bill

BrowserBash is Ollama-first. It defaults to free local models with no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY`, so you can start at a guaranteed $0 model bill on local models and only move to a hosted model when a flow is genuinely hard. OpenRouter even exposes genuinely free hosted models such as `openai/gpt-oss-120b:free`, and you can bring your own Anthropic Claude key when you want the strongest reasoning. The point for flake work is that you can run thousands of reproduction loops locally without metering yourself into a corner.

## The --record Trace: Root Cause Analysis Built In

Diagnostic step two demanded artifacts from the failing run. This is where intent-based tooling and good capture meet.

The `--record` flag captures a screenshot and a full `.webm` session video on any engine, recorded via ffmpeg. On the builtin engine it additionally captures a Playwright trace you can open in the trace viewer and step through action by action: DOM snapshots, network activity, and console output at every step.

```bash
browserbash run "Search for 'wireless headphones', open the first result, \
and add it to the cart" --record
```

When a run is flaky, you now have exactly what step three of the diagnostic process needs. The video shows you the human-visible sequence of events, which is enough to classify the bucket in seconds. Was the page still spinning when the agent acted? Timing bucket. Did the cart show a different item than expected? State bucket. The trace then lets you confirm the hypothesis at the level of individual actions and network calls.

Two things change for the better here. First, because the agent works from intent, the selector bucket is mostly gone before you even open the trace, so the artifacts you are reading are dominated by the timing and state buckets, which are the ones a video and trace are best at diagnosing. Second, the capture is uniform. You get the same `.webm` and the same trace structure on every run, so your team reads failing runs the same way every time instead of reverse-engineering whatever logging the original author happened to add.

### Optional replay history when you want it

No account is needed to run BrowserBash at all. If you want run history across machines, there is a free, strictly opt-in cloud dashboard with per-run replay and video recordings, enabled with `browserbash connect` and `--upload`; free uploaded runs are kept for 15 days. If you would rather keep everything local, `browserbash dashboard` gives you a fully local dashboard with no upload. For flake triage in CI, having a replay link attached to a failing job is the difference between "re-run it" and "here is the frame where it broke."

## Closing the Loop in CI

Flake debugging that lives only on a laptop does not scale. The same intent-based runs and recorded traces have to work where your suite actually runs.

BrowserBash has an agent mode for exactly this. The `--agent` flag emits NDJSON, one JSON event per line on stdout, with no prose to parse, and it uses meaningful exit codes: 0 passed, 1 failed, 2 error, 3 timeout. Your CI step branches on the exit code, and on failure you attach the recorded artifacts to the job.

```bash
browserbash run "Complete checkout as a returning customer and confirm \
the order number is displayed" --agent --headless --record
```

A failing run in CI now produces a machine-readable verdict your pipeline can act on, plus a `.webm` and a trace your on-call engineer can open without re-running anything. That is the loop closed: you reproduce in CI, you capture on failure, and you read the artifact against the three buckets, exactly as the diagnostic process prescribes. For teams who want to scale flake triage across browsers and machines, the [continuous integration story](https://browserbash.com/blog) is where this pays off most.

### Committable Markdown tests for shared flows

For flows your whole team relies on, BrowserBash supports committable `*_test.md` files where each list item is a step. They support `@import` composition and `{{variables}}` templating, and any variable marked secret is masked as `*****` in every log line, which keeps credentials out of your CI logs. Each run writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md
```

```markdown
# Checkout smoke test

- Go to {{baseUrl}}
- Log in as {{user}} with password {{password!secret}}
- Add the first product to the cart
- Complete checkout
- Verify the page shows "Thank you for your order!"
```

When a shared flow flakes, the Markdown file is the source of truth, the `Result.md` is the artifact, and the masked secret never leaks into a log line that ends up in a flake report. You can also run against grids and cloud browsers by switching one flag, `--provider`, across local, cdp, browserbase, lambdatest, and browserstack, which lets you reproduce a "fails only on the CI browser" flake on the exact browser CI uses.

## When Intent-Based Runs Are the Right Call (and When They Are Not)

Honesty matters more than hype here, so be clear-eyed about the trade.

**Choose intent-based runs when** your flake is dominated by the selector bucket, your DOM changes often, you are tired of maintaining page objects, or you want uniform video-and-trace capture on every run without building it yourself. If a meaningful share of your red builds trace back to locator decay, this removes the cause rather than retrying around it, and that is the single highest-leverage change available.

**Stay with traditional Selenium, Cypress, or Playwright when** you need millisecond-precise control, deterministic byte-for-byte reproducibility for a compliance audit, or you are testing flows so latency-sensitive that an agent's per-step reasoning adds unacceptable time. Selector-based tests are deterministic, and for narrow, stable, high-frequency unit-style UI checks that determinism is a feature, not a bug. A coded test that has not flaked in a year does not need replacing.

**Use both** in most real organizations. Keep your fast deterministic checks where they earn their keep, and move the long, brittle, frequently-breaking end-to-end journeys, the ones that generate most of your flake tickets, onto intent-based runs. The two approaches are not a religious war. They are tools with different failure modes, and a good [test strategy](https://browserbash.com/case-study) puts each where its failure mode is least painful.

One more honest caveat: an AI agent introduces its own variance, especially on weak models. If you run a tiny local model against a 30-step objective and call the resulting misfires "flake," you have simply traded one root cause for another. Match the model to the difficulty of the flow, and the variance stays well below the selector flake you removed.

## Putting the Playbook Together

The whole playbook reduces to a short loop you can run every time a test goes amber. Classify the failure into selectors, timing, or state. Reproduce it on purpose with a tight run loop, throttling the environment until the failure rate climbs. Capture the failing run, never the passing one, as video and trace. Read the artifact against the three buckets and find the first action that diverges. Form one hypothesis, change one thing, and verify statistically across hundreds of runs.

The structural insight underneath all of it is that the selector bucket is both the largest source of flake and the one you can eliminate rather than merely mitigate. Tests that describe intent instead of implementation do not decay when a class hash regenerates or a wrapper div appears, and tooling that records a video and a trace on every run turns the remaining timing and state flakes from mysteries into five-minute reads. Do those two things and your flaky test root cause analysis stops being a recurring tax and becomes an occasional, bounded task.

You do not have to rebuild your suite to start. Point an intent-based run at your single worst offender, the test everyone re-runs without reading, and see how it behaves with selectors out of the picture and a trace in your hand.

## FAQ

### What is the most common root cause of flaky tests?

Brittle selectors are the most common root cause of flaky tests in Selenium and Cypress suites. Locators tied to class hashes, DOM position, or `nth-child` chains break when the front end changes shape even though the user-facing behavior is unaffected. Timing races and shared test state are the next two most common causes. Classifying each failure into selectors, timing, or state is the fastest way to pick the right fix.

### How do I reproduce a flaky test reliably?

Run the single failing test in a tight loop of fifty to a few hundred iterations and record the pass-fail ratio. If it fails locally, you have a reproduction you can debug against; if it only fails on CI, throttle your CPU and network and run tests in parallel to force the race. The goal of this step is to make the failure happen on demand before you attempt any fix. A flake you cannot reproduce is a flake you cannot confirm you have fixed.

### Can AI browser automation actually reduce test flakiness?

Yes, primarily by removing the selector root cause. Because an AI agent resolves elements by intent at runtime rather than by a hard-coded locator, failures caused by class-hash regeneration, added wrapper elements, or reordered buttons stop happening. The trade-off is that very small local models can themselves be unreliable on long flows, so a mid-size or capable hosted model is the right choice for hard journeys. On a capable model, the net result is fewer total flakes than selector-based tests.

### How does the --record trace help with root cause analysis?

The `--record` flag captures a screenshot and a full `.webm` session video on any engine, and on the builtin engine it also captures a Playwright trace you can step through action by action. The video lets you classify a failure into the timing or state bucket in seconds by watching what actually happened on screen. The trace then confirms the hypothesis with DOM snapshots, network activity, and console output at every step. Together they turn a failing run into a readable artifact instead of a guessing game.

Ready to take selectors out of your flakiest tests? Install with `npm install -g browserbash-cli` and point a plain-English run at your worst offender. An account is optional, but if you want hosted run history and replay you can [sign up for the free dashboard](https://browserbash.com/sign-up).
