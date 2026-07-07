---
title: QA Wolf Parallel Runs vs a Local run-all Orchestrator
description: "QA Wolf runs suites on its cloud; run-all parallelizes on your machines with memory-aware concurrency and JUnit. Compare scale and cost."
date: 2026-07-05
category: comparison
---

Picture the moment this decision actually gets made. Your regression suite crossed 70 `_test.md` or `.spec.ts` files last quarter, and the nightly run that used to finish before anyone woke up now takes long enough that people quietly skip it before a release. Someone forwards a QA Wolf deck: their team owns the suite and it runs in parallel on their cloud infrastructure. Someone else points out that the CI runner sitting idle twenty hours a day could probably run those same seventy files in parallel too, if something orchestrated it. Both are true at once. What almost never gets asked in that meeting is the question this article answers: when your tests run in parallel, whose machines do the work, who capacity-plans them, and who eats it when a browser tab leaks memory at 2am. That is the infrastructure-ownership axis, a different question from "should we write our own tests or pay someone else to," which is the comparison most QA Wolf pieces, including [our own broader comparison](/blog/browserbash-vs-qa-wolf), tend to make. This one stays narrow: parallel execution, where it runs, who sizes it, what it costs.

## What "parallel" means on QA Wolf's side

QA Wolf is a managed service: their engineers build and maintain your end-to-end suite, and it runs on infrastructure they own and scale. From the customer's side, that scaling is invisible by design. You don't provision a runner, pick a concurrency number, or watch a process tree's memory climb. You describe what needs coverage, their team builds it, and it executes somewhere in their fleet on their schedule, with their engineers triaging what comes back before a failure reaches your inbox. That last part is a genuine value: automated parallel execution produces a pile of red and flaky runs no matter who operates it, and having a human filter that pile before it hits your team is work most engineering orgs would rather not staff themselves.

The trade sits where you'd expect a managed service to sit. Pricing is an ongoing contract scoped to the coverage you ask for, not a published self-serve rate, so there's no fixed number to point at here, and this piece won't invent one. You also don't get visibility into the scheduling itself: how many workers ran last night, what the concurrency ceiling was, why one shard ran slower than another. That's not a flaw, it's the nature of buying an outcome instead of operating a tool: the mechanism is theirs, the result is yours.

## What "parallel" means on run-all's side

`browserbash run-all` takes the opposite bet: it assumes you already have compute (a laptop, a self-hosted runner, a GitHub-hosted runner) and gives you a scheduler that fills it safely instead of a fleet that hides the math. The unit of work is one child process per test file, `browserbash testmd run <file> --agent --headless --result-path <path>`, so run-all runs the exact same command you'd run by hand, just many times at once with the flags filled in. Nothing here touches a BrowserBash-owned server: the parallelism is entirely local to whatever box invokes `run-all`.

Before launching anything, run-all computes an admission gate rather than guessing:

```
concurrency = max(1, min(requested, cpu_count, floor((total_ram - 2GB) / memory_budget)))
```

`requested` is whatever you pass to `--concurrency` (unbounded if unset), `cpu_count` comes from the machine, and the memory term reserves 2GB for the OS, then divides the remainder by `--memory-budget` (700MB per test by default) for a hard ceiling on how many test processes the box can hold. Once launched, each test still gets an independent watchdog: `--memory-cap` (default 2x the memory budget, so 1400MB) polls that test's whole process tree, Node plus every Chromium descendant, and sends `SIGTERM` then escalates to `SIGKILL` if one test balloons past its share, so a leaking tab is reported as an isolated infra failure instead of dragging every other worker down with it.

## The formula worked with two real machines

Because the concurrency number is arithmetic, not a black box, you can size it yourself before running the suite. Take an 8-vCPU, 16GB box with the default 700MB memory budget:

```
floor((16384MB - 2048MB) / 700MB) = floor(14336 / 700) = 20
concurrency = min(∞, 8, 20) = 8
```

CPU is the ceiling, not memory, so eight tests run at once, and you could push `--memory-budget` down or `--concurrency` up with more cores. Now take a smaller 4-vCPU, 4GB runner, the kind you might get on a budget CI plan:

```
floor((4096MB - 2048MB) / 700MB) = floor(2048 / 700) = 2
concurrency = min(∞, 4, 2) = 2
```

Memory is the ceiling now, and run-all says so directly, logging the reasoning (`requested auto, cpus 4, mem-cap 2 (budget 700MB) -> 2`) rather than silently picking a number. That single log line is the real difference from the QA Wolf model: nobody has to trust a vendor's scheduling, the box tells you exactly why it chose 2 and what to change, a bigger runner, a lower `--memory-budget`, more `--shard` slices, if 2 isn't enough.

## A suite that actually runs this way

Here's a small but real regression test, using the deterministic `Verify` grammar (testmd v2, no LLM judgment on the assertions):

```markdown
---
version: 2
auth: shopper
---

# Checkout regression

- Open https://shop.example.com/cart
- Add the "Wireless Mouse" to the cart
- Click Checkout
- Fill the shipping form: name Jordan Lee, postal code 94103
- Click Place Order
- Verify the title contains "Order Confirmed"
- Verify the text "Thank you for your order" is visible
- Verify the URL contains "/orders/"
```

The `auth: shopper` line reuses a saved login (`browserbash auth save shopper --url https://shop.example.com/login`) instead of paying a login step on every one of N parallel workers, which matters more as N grows. Point run-all at a folder of files like this one:

```bash
browserbash run-all .browserbash/tests \
  --concurrency 6 \
  --memory-budget 700 \
  --memory-cap 1400 \
  --retries 1 \
  --shard 2/4 \
  --matrix-viewport 1280x720,390x844 \
  --budget-usd 3.00 \
  --junit out/junit.xml \
  --auth shopper
```

That one command shards the suite (this machine runs slice 2 of 4), doubles every test across two viewports, retries only on an infra failure (a crashed browser, never a real assertion failure) rather than masking bugs behind a retry, hard-stops launching new tests once estimated spend crosses $3 (remaining tests report `skipped` with a reason, not silently dropped), and writes JUnit XML any CI dashboard, Jenkins, GitLab, CircleCI, Buildkite, already reads. A merged NDJSON stream (`suite_start`, `test_start`, `test_end`, `test_kill` on a watchdog fire, `suite_end`) is there too, if you'd rather pipe the run elsewhere than parse text.

## The replay cache changes what "parallel" is for

The concurrency formula above assumes every test pays for a live model call on every step, the expensive case. It isn't the common case for long-lived regression suites. A green run records its resolved actions; the next run against the same origin replays them with zero model calls, near-free and deterministic, falling back to the model only once the page has changed enough that the cached action no longer applies. That matters for the parallel-infrastructure question specifically: once a suite's cache is warm, the bottleneck stops being model inference latency (what actually caps how many workers you can usefully run at once) and becomes ordinary browser and network I/O, which your hardware handles far more of at once. Practically, the concurrency ceiling computed above gets easier to hit on repeat runs: you're waiting on N Chromium instances loading pages, not N simultaneous LLM round-trips.

## Scaling past one box

Sooner or later a single machine's CPU or RAM ceiling stops being enough, and this is where the two models converge in spirit, if not in mechanism. QA Wolf solves it by adding more of their own workers behind the scenes. run-all solves it the way any horizontally-scaled system does: add more boxes and split the work deterministically.

`--shard i/n` slices the suite by sorted discovery order, so every machine agrees on the same partition without coordinating. Wired into a CI matrix with the [official GitHub Action](https://browserbash.com/features), it looks like this:

```yaml
jobs:
  browserbash:
    strategy:
      matrix:
        shard: ['1/4', '2/4', '3/4', '4/4']
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-chrome@v1
      - uses: PramodDutta/browserbash@main
        with:
          tests: .browserbash/tests
          shard: ${{ matrix.shard }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Four matrix jobs, four machines, one deterministic split, no coordination needed. It's a poor man's version of a cloud fleet: you're explicitly the one deciding how many machines to add and paying for each, but it scales as far as your CI budget lets it, and every machine runs the same open-source binary, writing the same JUnit and NDJSON artifacts you already own.

## What each model actually costs

run-all itself has no price tag; it's part of the free, open-source CLI. The variable cost is model inference, and you control it directly: `--budget-usd` and `--budget-tokens` cap spend per suite run, the replay cache drives repeat runs toward zero additional model cost, and you can point the whole suite at a local Ollama model and run it for nothing if your flows fit what the model can follow reliably (small local models under roughly 8B parameters get flaky on long flows; a 70B-class or hosted model is the more dependable choice for anything non-trivial). The only other cost is compute you likely already pay for, your existing CI minutes or your own hardware.

QA Wolf's cost is a recurring service contract sized to the coverage you request, not a published table, and it buys something run-all doesn't: a team on the other end sizing the infrastructure, watching it, and triaging what it produces. Neither pricing model is free, they charge for different things: one for cloud compute plus headcount you don't have to hire, the other for compute you already own plus a formula and a config file.

## Where QA Wolf's infrastructure model wins

Be honest about this one. If your team does not want an engineer thinking about runner sizing, memory watchdogs, or shard math, and would rather that category of problem not exist on your plate, paying someone else to own it is a legitimate answer, not a lesser one. The same goes for triage: a scheduler, however well designed, reports `passed`, `failed`, `timeout`, or `infra` and hands you a screenshot and a DOM excerpt on a `Verify` failure. It does not look at that evidence and tell you which failure is a real regression worth paging someone for. That read still requires a person, and QA Wolf's model bundles that person in.

## Where owning the box wins

Every artifact run-all produces, the JUnit XML, the merged NDJSON stream, the per-test `Result.md` files, the run history used for failed-first ordering, lands in a folder on a machine you control, in a format any CI dashboard already reads. There's no vendor portal, no minimum contract, no coordination loop for adding a test: you write the Markdown file and commit it next to the code it covers. The concurrency ceiling is a number you can see, log, and change yourself; the memory watchdog is a config flag, not a black box; the spend cap stops the suite at an exact dollar figure you set, visible in the event stream, not a monthly invoice reconciled after the fact. Because the replay cache makes reruns of stable flows nearly free, the marginal cost of running your suite in parallel, again and again, trends toward the cost of the hardware alone.

## A cheap way to test the decision

You don't have to guess which side of this trade fits before committing to either. Point `run-all` at your existing suite, or a representative slice, on the CI runner you already have, run it in parallel for a week, and look at two numbers: wall-clock time and actual dollars spent on model calls. That gives you a real baseline to hold a QA Wolf quote against, and the two aren't mutually exclusive: some teams keep a vendor-run nightly regression net for the coverage-and-triage problem while using `run-all` for the fast, git-committed smoke suite that gates every pull request. Install it with `npm install -g browserbash-cli` and try the math on your own hardware before deciding whose infrastructure problem this needs to be.

## FAQ

### Does run-all execute on any BrowserBash-owned cloud infrastructure?
No. `run-all` spawns local child processes on whatever machine invokes it: your laptop, a self-hosted runner, or a GitHub-hosted runner. Nothing routes through BrowserBash servers. Point a test's `--provider` at a remote grid like Browserbase, LambdaTest, or BrowserStack and the browser itself runs there, but the scheduling and watchdogs stay entirely local.

### How many tests can run-all actually run in parallel?
Whatever the concurrency formula computes for the box you're on: the smaller of what you request with `--concurrency`, your CPU count, and `(total RAM minus a 2GB reserve) / --memory-budget`. There's no fixed ceiling in the tool; the ceiling is your hardware, and run-all logs exactly which term won.

### What stops one runaway browser tab from taking down the whole parallel run?
`--memory-cap` (default 2x `--memory-budget`, so 1400MB) watches each test's entire process tree, Node plus every Chromium descendant, and sends `SIGTERM` then `SIGKILL` if it crosses the cap. That test is reported as an isolated infra failure; the rest of the batch keeps running.

### Can I match QA Wolf's cloud-scale feel with run-all?
Partially. `--shard i/n` splits the suite deterministically across a CI matrix, so adding machines behaves like adding cloud workers. The difference is you're the one provisioning and paying for each runner; no fleet appears behind the scenes for you.

### Does run-all replace a QA Wolf contract?
Depends what's actually scarce on your team, compute or people. If the bottleneck is getting an existing suite to run in parallel faster, run-all removes it for free on hardware you already have. If the bottleneck is nobody having time to write or maintain the tests, or triage the failures, that's a people problem an orchestrator doesn't solve, and it's what a managed service actually sells.

### Does run-all cost anything per test the way extra cloud workers might?
The orchestrator is free and open source. The only variable cost is model inference, which you can cap hard with `--budget-usd` / `--budget-tokens`, run at $0 on a local Ollama model, and shrink further on repeat runs because the replay cache skips the model entirely on unchanged flows.
