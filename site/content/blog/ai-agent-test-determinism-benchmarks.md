---
title: Are Agentic Tests Deterministic? Measuring Run-to-Run Drift
description: "Are AI tests deterministic? Agentic test determinism lives in the outcome, not the path. How to measure run-to-run drift and compute your own flake rate."
date: 2026-06-26
category: agents
---

Short answer: the model is stochastic, but a well-scoped agentic test can be deterministic in its outcome even when the path varies run to run. Those are two different properties, and conflating them is why "are AI tests deterministic" gets a confused answer. The language model that drives the browser samples tokens probabilistically, so the exact sequence of clicks it takes to log in and check a balance will differ between runs. That is path variation. What you actually care about, whether the same input reliably produces the same pass or fail verdict, is outcome determinism, and that one you can engineer toward and, more importantly, measure.

This article draws the line between the two precisely, explains the levers that push outcome determinism up, and then hands you a measurement method you can run today to compute the real flake rate for any test on your own application. No invented benchmark numbers. The method is the point, because the only determinism figure worth trusting is the one you generated against your app, your model, and your pages. Examples use [BrowserBash](https://browserbash.com/features), a free open-source CLI that drives a real Chrome browser from plain-English objectives.

## Two kinds of non-determinism, and only one is the enemy

The word "non-deterministic" gets thrown at agentic testing as if it settles the question. It does not, because it bundles two phenomena that behave completely differently.

### Path non-determinism is fine, and often desirable

When you tell an agent "log in as the test user and confirm the dashboard greets them by name," it has to decide which field is the email box, which control submits the form, and which heading counts as the greeting. On one run it might tab into the email field directly; on another it might click it first. It might wait a beat longer for a spinner. The path it walks is not byte-identical between runs.

This variation is not a defect. It is the feature that makes the test survive UI change. A hand-written selector test pins itself to `button.btn-primary[type="submit"]` and snaps the moment someone renames the class. The agent re-derives "the thing that submits this form" every run, so a class rename, a wrapper div, or a relocated button leaves it unbothered. Path non-determinism is the mechanism behind that resilience. If you suppressed it entirely you would be back to brittle scripting. For a deeper look at how an agent decides whether a changed page is still the same intent or a genuine break, see [how the agent tells a UI change from a real regression](https://browserbash.com/blog/ui-change-vs-real-regression-how-the-agent-decides).

### Outcome non-determinism is the real problem

Outcome non-determinism is when the same input, against an unchanged application, sometimes passes and sometimes fails. That is the precise definition of a flaky test. It has nothing to do with whether the click path varied. It is about whether the verdict is stable.

A test can have wildly varying paths and still be perfectly outcome-deterministic: ten runs, ten slightly different routes, ten passes. That test is doing its job. Another test can fail one run in eight for no application reason at all, and that is the failure mode that erodes trust, trains your team to re-run reds until they turn green, and eventually lets a real regression slip through because nobody believes the suite anymore. When an SDET asks whether agentic tests are deterministic, this is the property they should be asking about, and it is the one the rest of this article is built to move and to measure.

The reframe in one line: stop trying to make the path deterministic, and start driving the *outcome* deterministic. The mechanism for that is asserting on the outcome instead of the path.

## How to drive outcome determinism up

You raise outcome determinism the same way you raise reliability anywhere: reduce the number of places a run can legitimately diverge, and make the success condition unambiguous. Here are the levers, roughly in order of impact.

### Assert the outcome, not the path

This is the highest-leverage change and it is free. An objective phrased as a sequence of clicks ("click the menu, click Account, click the third tab, click Save") gives the agent a brittle script to follow and many chances to drift. An objective phrased as an invariant ("update the notification email to alerts@acme.com and confirm a success message appears") gives it a goal and a clear test for done.

```bash
# Path-shaped objective: many divergence points, ambiguous "done"
browserbash run "click the hamburger menu, then Account, then the third tab, then Save"

# Invariant-shaped objective: one clear success condition
browserbash run "update the notification email to alerts@acme.com and confirm a success message appears"
```

The invariant version is more outcome-deterministic because there is exactly one thing that means success, and the agent waits for that thing rather than guessing when a fixed sequence is finished. Vague success criteria are the quiet source of flake. "Checkout works" can be satisfied by accident; "the order summary shows exactly one item in size 10 with a non-zero subtotal" cannot. The discipline of writing invariant-based objectives is worth its own treatment, covered in [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants).

### Lower the temperature where the provider allows it

Temperature controls how much randomness the model uses when sampling its next token. Lower temperature means the model concentrates on its most likely choice, which reduces path variation and, at the margin, outcome variation on borderline decisions. It does not make the model deterministic (most hosted inference has other sources of non-determinism even at temperature zero), but on a flow where a run occasionally wanders, pulling the temperature down is a cheap thing to try. Not every backend exposes the knob, and the engines observe the live page regardless, so treat this as a tuning step, not a cure.

### Use a larger or more capable model on hard flows

Model strength shows up directly in outcome stability. A small local model handles a two- or three-step flow fine and then drifts on a long or ambiguous one, sometimes hallucinating an element that is not on the page. A larger model holds the chain together more consistently, which shows up as fewer spurious fails when you measure. BrowserBash is Ollama-first, and the default model is `auto`, which resolves in this order: a local Ollama model if one is running, then `ANTHROPIC_API_KEY`, then OpenRouter. The practical rule: keep a mid-size local model as your baseline and escalate to a 70B-class or hosted model on the specific flows that measure flaky. Choosing the right model for a given flow is its own topic, related to [why agents fail on multi-step tasks](https://browserbash.com/blog/why-ai-browser-agents-fail-multi-step-tasks).

```bash
# Escalate only the flows that measure flaky
browserbash run "reconcile the three open invoices and report which is overdue" --model claude-opus-4-8
```

### Make setup deterministic

A large share of "agent flake" is not the agent at all. It is the test starting from a different state each run. If the run depends on a record that another test mutated, or a cart total that drifts, the outcome will wobble for reasons that have nothing to do with the language model. Seed state through an API before the run rather than clicking through the UI to build it, and parameterize anything variable with `{{variables}}` so the same values flow in every time. Secret-marked variables are masked as `*****` in output, so you can commit the test and keep credentials in your environment or CI store. Deterministic inputs are a precondition for a deterministic verdict; you cannot measure model drift cleanly until the setup stops moving underneath you.

### Retry only genuinely transient infrastructure failures

There is a narrow, legitimate place for retries: a network blip, a cold container, a provider hiccup. BrowserBash makes this safe to automate because it separates failure modes by exit code. A timeout is exit code `3` and a clean error is `2`, both of which often mean "the environment misbehaved," whereas a real assertion failure is exit code `1` and means the behavior did not hold. Retry the `3` and `2` cases once; never blanket-retry the `1` case, because retrying a genuine failure until it flips green is how you manufacture a false pass rate and bury a real bug.

```bash
# Retry only transient infra failures (timeout=3, error=2), never assertion failure (1)
browserbash run "verify a guest can search the catalog and open a product page" --agent --headless
code=$?
if [ "$code" -eq 3 ] || [ "$code" -eq 2 ]; then
  echo "transient ($code), retrying once"
  browserbash run "verify a guest can search the catalog and open a product page" --agent --headless
  code=$?
fi
exit "$code"
```

The broader anti-flake discipline (intent-based objectives, condition-based waits, isolated data) is collected in [how to reduce flaky end-to-end tests](https://browserbash.com/blog/reduce-flaky-end-to-end-tests).

## Measure it: compute your own flake rate

Everything above is a hypothesis until you measure. The honest way to answer "is this test deterministic" is empirical: run the same test many times against an unchanged application, record pass or fail per run, and compute the pass rate. That observed pass rate is the outcome-determinism of that test, and one minus it is the test's flake rate. There is no shortcut and no vendor number that substitutes for it, because determinism depends on your pages, your model, and your data, not on someone else's demo.

### The method

1. Freeze the application and the test data so nothing legitimately changes between runs.
2. Run the exact same objective N times. Start with N=20 for a quick read; use 50 or 100 when you want a tighter estimate.
3. Record the verdict per run. With BrowserBash, branch on the exit code: `0` is pass, `1` is a real failure, `2`/`3` are infra noise you may choose to exclude or retry.
4. Compute pass rate = passes / total runs. That number is your per-test outcome determinism.
5. Repeat per flow. Determinism is a property of each individual test, not of "agents" in general, so a smoke check and a gnarly multi-step flow will land at different numbers.

### A runnable measurement loop

This Bash loop runs one objective N times, tallies the exit codes, and prints the pass rate. It uses `--agent` for machine-readable output and `--headless` so it runs clean in CI or a terminal.

```bash
#!/usr/bin/env bash
# flake-rate.sh — run one objective N times and report the observed pass rate
set -u

N="${N:-20}"
OBJECTIVE="log in as the test user and confirm the dashboard greets them by name"

pass=0; fail=0; infra=0

for i in $(seq 1 "$N"); do
  browserbash run "$OBJECTIVE" --agent --headless >/dev/null 2>&1
  code=$?
  case "$code" in
    0) pass=$((pass+1)); verdict="PASS" ;;
    1) fail=$((fail+1)); verdict="FAIL" ;;
    *) infra=$((infra+1)); verdict="INFRA($code)" ;;   # 2=error, 3=timeout
  esac
  printf 'run %2d/%s: %s\n' "$i" "$N" "$verdict"
done

# Pass rate over real verdicts only (exclude infra noise from the denominator)
real=$((pass+fail))
if [ "$real" -gt 0 ]; then
  rate=$(awk "BEGIN { printf \"%.1f\", ($pass/$real)*100 }")
  echo "----"
  echo "pass=$pass fail=$fail infra=$infra"
  echo "observed pass rate (flake-adjusted): ${rate}%  over $real real runs"
fi
```

Run it with a different N when you want a tighter estimate:

```bash
N=50 ./flake-rate.sh
```

Prefer to fan out instead of looping? An `xargs` matrix runs the iterations in parallel, which is faster but make sure each run is isolated (its own session and data) so parallel runs do not contaminate each other:

```bash
# Run 20 iterations, up to 4 in parallel; count the passes (exit 0)
seq 1 20 | xargs -P 4 -I{} sh -c \
  'browserbash run "log in and confirm the dashboard greets the user" --agent --headless >/dev/null 2>&1; echo $?' \
  | sort | uniq -c
```

In CI, the same idea becomes a build matrix: define N parallel jobs running the identical step, then aggregate pass/fail across them in a final job. Either way you end with the same artifact: a pass rate you generated, for a specific test, on your application.

### Reading the number

A test that passes 20 out of 20 is outcome-deterministic at the resolution you measured; that does not prove it never flakes, only that you did not observe flake in 20 trials, so a flaky-but-rare failure could still hide below your sample size. A test that lands at 17 out of 20 is telling you something concrete: that objective has a real outcome-determinism problem, and now you apply the levers above (tighten the invariant, escalate the model, fix the setup) and re-measure to confirm the number moved. The loop is not a one-time audit. It is the feedback signal you run every time you change a flaky objective, so you are reacting to evidence instead of vibes. Whenever you change a test, re-run the loop. The pass rate is your ground truth.

## Honest limits

Agentic testing carries real non-determinism, and pretending otherwise would be the kind of hype this tool is built to avoid. A few things are simply true.

LLM stochasticity is real and does not fully disappear. Even at low temperature, hosted inference can vary run to run, and the agent's reading of a busy page is a probabilistic act. You can drive outcome determinism high, but "high" is an empirical number you observe, not a guarantee you assume.

Small local models drift more than large or hosted ones. A model of 8B parameters or smaller is genuinely flaky on long or ambiguous flows, and it will show up as a lower pass rate when you run the loop, especially past six or eight steps. The 70B-class and hosted models hold together better. This is not a knock on local models (they are the right default for short flows, learning, and privacy) it is a reason to measure per flow and escalate where the number tells you to.

Most importantly, you must measure on your own application rather than trust a vendor number. Determinism is a function of your specific pages, your data setup, the model you run, and how you phrase the objective. A benchmark percentage from someone else's app tells you nothing about yours. The reason this article gives you a loop instead of a headline figure is exactly that: the only flake rate worth acting on is the one you generated.

None of this makes agentic tests unusable. It makes them measurable, which is better. A selector suite hides its fragility until a refactor detonates it; an agentic suite lets you put a number on its reliability before you trust it. Run the loop, read the number, fix the flaky flows, and re-run. That loop is the whole discipline.

## FAQ

### Are AI-driven agentic tests deterministic?

Not in the sense that the model produces identical token sequences every run, but yes in the sense that matters: a well-scoped test can be deterministic in its outcome (the same input reliably yields the same pass or fail) even while the path the agent takes varies. Path variation is desirable because it is what makes the test survive UI change. Outcome variation is the real flakiness, and you reduce it with invariant-based objectives, deterministic setup, and a capable-enough model, then confirm it by measuring the pass rate over many runs.

### How do I measure the flake rate of an agentic test?

Freeze your application and test data, run the exact same objective N times (start with 20), record the verdict per run, and compute pass rate = passes / total runs. With BrowserBash, branch on exit codes: `0` is pass, `1` is a real failure, and `2`/`3` are infrastructure noise you can exclude or retry. One minus the pass rate is the flake rate for that specific test. The runnable Bash loop in this article does the tally for you, and an `xargs` or CI matrix can run the iterations in parallel.

### Does lowering the model temperature make tests deterministic?

It helps but does not guarantee determinism. Lower temperature makes the model favor its most likely next token, which reduces path variation and can stabilize borderline decisions, so it is a cheap tuning step on a flow that occasionally wanders. But most hosted inference retains some non-determinism even at temperature zero, and not every backend exposes the setting. Treat it as one lever among several, and verify any improvement by re-running the measurement loop rather than assuming the change worked.

### Why does the same agentic test sometimes pass and sometimes fail?

Usually one of three causes: a vague objective that lets the agent interpret "done" differently each run, non-deterministic setup where the starting state drifts between runs, or a model too small for the flow's length and ambiguity. Fix them in that order: tighten the objective into a clear invariant, seed state via API with `{{variables}}` so inputs are identical, and escalate to a larger model on the hard flows. Then re-run the loop to confirm the pass rate actually moved.

## Get started

You can compute your own determinism numbers today, for free, against your real Chrome. Install the CLI, point the measurement loop at one flow you suspect is flaky, and read the pass rate:

```bash
npm install -g browserbash-cli
```

BrowserBash is free, open-source under Apache-2.0, and runs locally with no account required. The `--agent` NDJSON output and explicit exit codes (`0` passed, `1` failed, `2` error, `3` timeout) are what make the loop scriptable, so you can wire determinism measurement straight into CI. For more on engines, models, and writing objectives that hold steady, see [features](https://browserbash.com/features) and [learn](https://browserbash.com/learn).
