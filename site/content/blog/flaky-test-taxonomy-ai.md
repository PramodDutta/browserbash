---
title: A Taxonomy of Flaky Tests and How AI Testing Helps
description: "A practical flaky test taxonomy (timing, order, data, environment) and which classes intent-based AI testing removes for good."
date: 2026-07-20
category: guide
---

Every test suite that has run long enough has a flaky test problem, and the reason a flaky test taxonomy matters is that "flaky" is not one bug. It is at least four different failures wearing the same red X. A timing race and a shared-fixture collision produce identical CI output (a test that passed yesterday and fails today with no code change), but the fix for one does nothing for the other. Treat all intermittent failures as one category and you end up adding blanket retries, muting the loudest offenders, and training your team to ignore red. Classify first, then fix. This guide gives you a working taxonomy of flakiness (timing, order dependence, test data, and environment), shows the tell-tale signature of each class, and is honest about which ones a plain-English, intent-based approach actually removes versus which ones no framework can save you from.

## Why "flaky" needs a taxonomy at all

A flaky test is any test whose pass or fail verdict changes without a corresponding change in the code under test. That definition is useful for detection and useless for repair. When you get a nondeterministic failure, the only question that matters is *why the nondeterminism exists*, and the source lives in a small number of places.

The cost of skipping classification is real. Teams that lump everything together reach for the universal painkiller: retries. A `--retries 3` flag turns a 20 percent flake into a roughly 0.8 percent visible failure, which feels like a fix and is actually a mask. The underlying race still corrupts data in production, the coupling bug still hides, and now the signal is buried under three green re-runs.

The taxonomy below is organized by root cause, not by symptom, because the symptom (intermittent red) is always the same. Each class has a signature you can detect, a real fix, and a clear answer to the question this article is really about: does moving to AI-driven, intent-based testing help here, or not?

## Class 1: Timing and synchronization flakiness

This is the largest bucket in almost every UI suite. The test asks the browser to do something before the browser is ready, and whether it wins the race depends on network latency, animation frames, CPU load on the CI runner, and a dozen other variables you do not control.

### What it looks like

The classic form is a hard-coded wait that is "usually" long enough. Someone writes `sleep(2000)` after a button click because the modal takes about a second and a half to animate in. On a fast laptop it passes every time. On a loaded CI runner the modal takes 2.3 seconds one run in eight, the assertion fires against a half-rendered DOM, and you flake. The other common form is a wait on the wrong condition: you wait for an element to be *present* in the DOM when what you needed was for it to be *visible and stable and not still animating*.

### The signature

Timing flakiness clusters around asynchronous boundaries: right after navigation, after an AJAX call, after any animated transition, and on anything with debounced input. It gets worse under load, so it shows up more on busy CI than on a laptop. If a failure disappears when you add a longer sleep, you have confirmed the class (and written a worse test).

### Where intent-based testing genuinely helps

This is the class where an AI agent driving a real browser earns its keep. When you write a step as an intention rather than a mechanical instruction, the agent takes a fresh snapshot of the page, decides whether the element it needs is actually actionable, and only then acts. There is no `sleep` for you to tune wrong because you never wrote a wait. You described the outcome and the agent synchronizes to the real state of the page.

With BrowserBash you write the objective in plain English and the agent handles readiness:

```bash
npm install -g browserbash-cli

browserbash run "Open https://app.example.com, click Checkout, \
  wait for the payment form, and store the order total as 'total'" \
  --agent --headless --timeout 120
```

There is no explicit timing anywhere in that objective. The agent snapshots, sees the payment form is not ready, waits for the actual condition, and proceeds. That removes the entire family of "my sleep was too short on CI" failures, the single most common flake in browser suites.

Be honest about the boundary, though. Intent-based synchronization removes *authoring* timing bugs (the ones you introduce by hard-coding waits). It does not remove a genuine application race, for example a front end that fires an event before its own state has settled. That is a real product bug and it *should* fail your test. The value of removing authoring flakiness is that the failures you have left are more likely true.

## Class 2: Order-dependence flakiness

An order-dependent test passes in one sequence and fails in another. It is the most dangerous class because it is invisible until you shard, parallelize, or shuffle, and by then you have a suite full of hidden coupling.

### What it looks like

Test A logs in and leaves a session cookie set. Test B never logs in but happens to run after A and inherits the session, so B passes. Run B alone, or first because the scheduler put it on a different shard, and B fails because it was silently depending on A's side effect. The shared state can be a cookie, a database row, a global variable, a file on disk, or a logged-in browser context that was never reset.

### The signature

Order dependence reveals itself the moment execution order changes. The tell is a test that passes in the full suite but fails in isolation, or fails only on certain shards. If turning on parallelism or adding `--shard` suddenly lights up failures that were green in a single-threaded run, you are looking at order dependence, not timing.

### Where intent-based testing helps, and where it does not

Here the honest answer is mixed. The single biggest source of order dependence in browser tests is shared browser state (a context that carries cookies and local storage from the previous test). BrowserBash gives every run a fresh browser context by default, so tests do not silently inherit a logged-in session from whatever ran before them. That eliminates the most common UI-level order coupling for free.

For the classic "logging in every test is slow, so people share sessions" tradeoff, saved logins break the tension. You capture the session once and each test loads it independently, so there is no incentive to chain tests together:

```bash
browserbash auth save acme --url https://app.example.com/login

browserbash run "Go to the billing page and verify the plan is Pro" \
  --auth acme --agent
```

Every test that uses `--auth acme` starts from the same clean, known-good session with no dependence on execution order. To go deeper on this pattern, the [saved-login and session docs on the tutorials page](https://browserbash.com/tutorials) walk through profiles per environment.

What intent-based testing does *not* fix is order dependence in your *backend* state. If test A creates a user that test B assumes exists, no browser framework rescues you. That coupling lives in your data setup, the next class.

## Class 3: Test data and fixture flakiness

Data flakiness comes from tests that assume a specific state of the world that other tests, other runs, or real users can change underneath them.

### What it looks like

The textbook case is a unique-constraint collision. A signup test registers `qa@example.com`. It passes the first time and fails every time after because the account now exists. Someone "fixes" it with a teardown that deletes the row, the teardown flakes once, and now the collision is intermittent. Another form is a hard-coded assertion against live data: "the dashboard shows 1,240 orders" is true the day you write it and false the next morning. A third is parallel workers racing for the same fixture row.

### The signature

Data flakiness correlates with *repetition and concurrency* rather than load or order. The test fails the second time you run it, or when two workers hit the same seed data at once, or at a date boundary. If wiping the database green-lights a stuck test, you have found this class.

### Where deterministic seeding beats the LLM

This is the class where the honest answer is: do not use an AI agent to set up your data. Language-model-driven UI clicking is the wrong tool for creating a known starting state, because it is slower, costs tokens, and reintroduces nondeterminism into the exact place you need determinism.

BrowserBash's answer is testmd v2, where you can seed state with deterministic API steps that never touch a model, then verify the result through the UI. The API step is plain HTTP and fully reproducible; only the human-facing check runs as an agent step:

```markdown
---
version: 2
---
# New order appears on the dashboard

POST https://api.example.com/orders with body { "item": "Widget", "qty": 3 }
Expect status 201, store $.id as 'orderId'

Open https://app.example.com/dashboard and search for order {{orderId}}
Verify text "Widget" is visible
Verify "Order {{orderId}}" heading is visible
```

The `POST` creates a fresh, uniquely-identified order every run, so there is no collision and no reliance on pre-existing data. The `Verify` steps compile to real Playwright checks with no LLM judgment, so the assertion is deterministic too. You have removed data flakiness by controlling the data, not by hoping the UI cooperates. One honest caveat: testmd v2 currently runs on the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible gateway, so it is not yet an Ollama-only path. And rather than assert against a hard-coded literal that rots, `Verify` lets you check a stored value equals what you inserted.

## Class 4: Environment and infrastructure flakiness

This class has nothing to do with your test logic. The test is correct and the world moved.

### What it looks like

A CI runner runs out of memory and kills the browser process mid-run. A third-party API you depend on has a bad thirty seconds. A DNS hiccup makes a page load time out. A browser version bump on the CI image changes a default and breaks a selector. None of these are your test's fault, and all of them show up as intermittent red.

### The signature

Environment flakiness correlates with *infrastructure events* and is usually not reproducible locally. The failures cluster in time (a batch of tests fail in the same ten-minute window and then recover), touch unrelated tests at once, and often carry infra-level error messages (OOM kills, connection resets, TLS errors) rather than assertion failures.

### What actually helps

No testing framework "fixes" a bad CI runner, and any tool that claims to is selling you something. What a good tool can do is make the class *legible* so you stop misclassifying infra noise as test bugs. Two things help concretely.

First, distinguishing an infra error from a test failure at the exit-code level. BrowserBash uses exit code 2 for error and infra problems, separate from exit code 1 for a genuine test failure and 0 for pass, so your CI can retry infra errors without retrying real failures (the [agent-mode and exit-code reference](https://browserbash.com/learn) covers the full contract). Retrying *only* exit code 2 hides only the infra noise.

Second, memory-aware orchestration. A huge fraction of "environment" flakiness on self-hosted runners is really self-inflicted: you launched more parallel browsers than the box has RAM for, and the OOM killer did the rest. The `run-all` orchestrator (`browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00`) derives its concurrency from real CPU and memory rather than a number you guessed, and it enforces a per-test memory cap, which turns a class of "random" OOM flakes into a non-event.

Deterministic sharding matters here too: the `--shard 2/4` slice is computed on sorted discovery order, so four CI machines agree on who runs what with no coordination and no chance of two shards racing over the same test. That is one less source of environment nondeterminism.

## A side-by-side view of the four classes

Pulling it together, here is how the four classes compare on the dimensions that decide your fix.

| Class | Root cause | Detection signature | Does intent-based AI testing remove it? |
|-------|------------|---------------------|------------------------------------------|
| Timing | Acting before the page is ready | Worse under load, cured by longer sleeps | Yes, for authoring waits. No for genuine app races. |
| Order dependence | Shared state between tests | Passes in suite, fails in isolation or on shards | Mostly, via fresh contexts and saved logins. Not for backend coupling. |
| Test data | Collisions, stale literals, races on fixtures | Fails on repeat or under concurrency | Indirectly, via deterministic API seeding, not via the agent. |
| Environment | CI, network, browser, memory | Clusters in time, not reproducible locally | No. But it becomes legible via exit codes and memory-aware runs. |

The pattern in that last column is the honest headline: intent-based, AI-driven testing meaningfully removes *authoring-induced* flakiness (the timing waits and shared-context coupling you accidentally wrote) and gives you deterministic tools (API steps, `Verify`, exit codes, memory-aware orchestration) for the classes an agent should not touch. It cannot remove flakiness that comes from a real bug in your app or your infrastructure, and that is a feature, not a gap. Those failures are true and you want to see them.

## How intent-based testing changes the flakiness math

Traditional selector-based tests carry a fifth, quieter kind of flakiness: brittleness to markup change. A `div.card:nth-child(3) > button.primary` selector breaks when a designer reorders the layout, even though the feature works perfectly. That is not nondeterminism in the strict sense, but it *feels* like flakiness because the test went red without a product regression.

Intent-based testing sidesteps this by describing *what* you want rather than *how* to find it. When you write "click the Checkout button," the agent locates the checkout affordance from the current page snapshot rather than a frozen CSS path, so a class reorder or a wrapper `div` does not break the test. This is resilience to markup drift, not a claim that tests never break. If you rename "Checkout" to "Pay now," the intent changed and the test *should* need a look.

There is also a model-quality caveat worth stating plainly. Very small local models (roughly 8B parameters and under) can themselves be a source of nondeterminism on long, multi-step objectives, because a weaker model occasionally makes a different decision on a hard step. For genuinely tricky flows the sweet spot is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model, as the [model and engine notes on the features page](https://browserbash.com/features) lay out.

## A workflow for triaging flakiness by class

Detection is only half the job. Here is a practical loop for actually driving flakiness down, class by class, instead of drowning it in retries.

### Step 1: Reproduce with order and concurrency turned up

Before you touch a suspected flaky test, run the suite sharded and parallel a few times. Order dependence and data races only surface under concurrency, so a green single-threaded run tells you nothing. The `run-all` orchestrator with `--shard` and its failed-first ordering is built to shake these loose, and it flags tests it has seen flake before.

### Step 2: Read the signature, then assign a class

Use the detection column from the table. Cured by a longer wait? Timing. Fails only in isolation or on a new shard? Order dependence. Fails on the second run or under concurrency? Data. Clusters in time with infra errors and will not reproduce locally? Environment. Most bad flaky-test "fixes" are a real fix for the wrong class.

### Step 3: Apply the class-appropriate remedy

Timing: rewrite the step as an intention and delete the sleep. Order dependence: give the test its own fresh context and saved login, and remove any assumption about what ran before. Data: seed with a deterministic API step and assert with `Verify` against the value you inserted. Environment: retry only exit code 2, cap memory, and pin your browser and Node versions.

### Step 4: Watch the fix hold over time

A flake fix is not proven by one green run. Put the previously-flaky test on a monitor so a regression pages you instead of hiding until the next release.

```bash
browserbash monitor .browserbash/tests/checkout_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode alerts only on pass-to-fail and fail-to-pass transitions, not on every green run, so a genuinely fixed test stays quiet and a re-emerging flake surfaces immediately. The replay cache keeps an always-on monitor nearly token-free, so it is cheap to leave running on your ten most historically flaky tests. See the [case-study writeups](https://browserbash.com/case-study) for how teams structure this.

## When intent-based testing is not the answer

Balance matters, so here is where you should reach for something else. If your flakiness is dominated by pure API contract races with no UI involved, a fast API-level harness serves you better than any browser agent, and BrowserBash's own API steps exist precisely so you do not drive a browser for something HTTP can assert directly. If you need pixel-perfect visual regression, use a dedicated screenshot-diffing tool; intent-based checks confirm the checkout button is present and clickable, not that it is two pixels to the left. And if your entire problem is a flaky third-party dependency, the real fix is a contract test plus a mock.

The point of a taxonomy is to route each problem to its cheapest correct solution. Intent-based, AI-driven browser testing is the right tool for timing and markup-drift flakiness, and a strong tool for order and data flakiness when paired with fresh contexts, saved logins, and deterministic seeding. It is the wrong tool for infra flakiness, pure API races, and visual diffing, and saying so plainly is what makes the recommendation trustworthy. The [BrowserBash repository on GitHub](https://github.com/PramodDutta/browserbash) has the full docs and example suites.

## Putting the taxonomy to work

Start small. Pick your five noisiest tests, the ones your team already re-runs on reflex, and classify each using the signatures above. You will find they are not the same bug: one is a hard-coded wait, one inherits a session, one collides on a unique email, one just runs when your CI box is starved for RAM. Fix each with its class-appropriate remedy, monitor the survivors, and retry only exit code 2 so infra noise stops masquerading as test failures. The suite gets quieter not because you hid the red, but because you finally aimed each fix at the right target.

## FAQ

### What is a flaky test taxonomy and why does it matter?

A flaky test taxonomy is a way of classifying intermittent test failures by their root cause instead of their symptom, since every flake looks identical on a CI dashboard (a red X with no code change). The four core classes are timing, order dependence, test data, and environment. It matters because each class needs a different fix, so treating them as one problem leads teams to blanket retries that hide the failure rather than resolve it.

### Does AI-driven testing eliminate flaky tests?

No, and any tool that claims total elimination is overselling. Intent-based AI testing genuinely removes authoring-induced flakiness, such as hard-coded timing waits and shared-context order coupling, because the agent synchronizes to the real page state and each run gets a fresh browser context. It does not remove flakiness caused by a real race in your application or by infrastructure problems like out-of-memory kills, and those failures are true signals you want to keep seeing.

### How do I tell timing flakiness apart from order-dependence flakiness?

Timing flakiness gets worse under CPU or network load and disappears if you add a longer wait, because the test acts before the page is ready. Order dependence is different: the test passes inside the full suite but fails in isolation or on a different parallel shard, because it was silently relying on state left by an earlier test. If turning on parallelism lights up new failures, suspect order dependence, not timing.

### Should I use an AI agent to set up test data?

Generally no. Setting up a known starting state is exactly where you want determinism, and driving a browser with a language model to create data is slower, costs tokens, and reintroduces nondeterminism where you least want it. The better pattern is a deterministic API step that seeds a uniquely-identified record with plain HTTP, then a UI verification step to confirm it appears, which is what testmd v2 supports with API steps and compiled Verify assertions.

Ready to classify and kill your flaky tests instead of retrying them? Install the CLI with `npm install -g browserbash-cli` and start writing plain-English tests today. An account is optional and everything runs locally by default, but if you want hosted history and monitors you can grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up).
