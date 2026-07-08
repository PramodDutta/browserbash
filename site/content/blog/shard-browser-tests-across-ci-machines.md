---
title: Shard 500 Browser Tests Across 4 CI Machines
description: "Learn to shard browser tests across CI machines with browserbash run-all --shard, deterministic slicing, and a ready GitHub Actions matrix."
date: 2026-08-03
category: ci
---

Once a browser suite crosses a few hundred tests, the math stops being forgiving. A 500-test suite that averages 25 seconds per test is three and a half hours on one machine, sequentially. Even with a healthy local concurrency setting you're looking at forty-five minutes to an hour before a pull request gets a verdict, and that's on a good day when nothing hangs. The fix isn't a faster runner, it's more runners. This is the practical guide to sharding browser tests across CI machines with BrowserBash: how the split works, why it doesn't need any coordination between workers, and how to wire it into a GitHub Actions matrix that actually finishes in minutes instead of hours.

Sharding sounds simple until you've watched it go wrong somewhere else. Two machines both silently run the same forty tests while a third sits idle. A shard depends on file discovery order that differs between a Mac laptop and a Linux CI runner, so "shard 2 of 4" means something different on each box. A flaky test lands in the same shard every single run and nobody notices the imbalance until the suite has been slow for three months. None of that is a law of physics, it's an implementation detail, and it's the detail BrowserBash's `run-all --shard` command was built to get right on the first try.

## Why sharding matters once you pass a few hundred tests

Most teams don't plan for sharding, they back into it. The suite starts at twenty tests and finishes in under a minute. It grows to a hundred and someone bumps the CI timeout. By three hundred, the pipeline is the thing people complain about in standup. By five hundred, you're either sharding or you're accepting a coffee break between every push and its verdict.

The core problem is that browser tests don't parallelize for free the way unit tests do. A unit test suite can run thousands of tests per second on one core because there's no browser to boot, no page to render, no network round trip to wait on. A browser-driven test, whether it's built on Playwright, Selenium, or BrowserBash's plain-English objectives, spends most of its wall-clock time waiting: waiting for a page load, waiting for a network response, waiting for an element to become interactive. You can raise concurrency on a single machine, but you're bounded by CPU cores and available memory long before you've used up the time savings that parallelism could theoretically give you.

Sharding gets around that ceiling by adding machines instead of just adding processes on one machine. Four CI runners each handling 125 of your 500 tests, each running its own internal concurrency on top of that, gets you a multiplicative speedup that a single beefier machine can't match. This is the same logic that made distributed build systems and distributed test runners standard practice for backend and frontend unit tests years ago. Browser suites are just catching up because the tooling to shard them reliably has lagged behind.

## How run-all --shard i/n actually works

BrowserBash's orchestrator, `run-all`, already does memory-aware parallel scheduling on a single machine: it looks at real CPU count and available RAM, derives a safe concurrency number, and orders tests so previously-failed and historically-slowest tests run first. Sharding extends that same command with a `--shard` flag that takes an `i/n` pair, meaning "give me slice `i` out of `n` total slices."

```bash
browserbash run-all .browserbash/tests --shard 2/4
```

That single command, run on four separate machines with `--shard 1/4`, `--shard 2/4`, `--shard 3/4`, and `--shard 4/4` respectively, splits your test directory into four roughly equal, non-overlapping groups. Each machine runs only its slice. Together the four machines cover the entire suite exactly once, with no test skipped and no test duplicated.

The mechanism behind that guarantee is simple on purpose: `run-all` first discovers every test file in the target directory, sorts that list deterministically, and then divides the sorted list into `n` contiguous or interleaved groups based on index. Machine 2 of 4 always gets the same tests as long as the test directory contents haven't changed, because sorting a fixed input always produces the same output. There's no negotiation between machines, no lock file, no shared database tracking who claimed which test. Each machine computes its own slice independently and they agree by construction, not by communication.

### Why sorted discovery order is the whole trick

This is the part worth sitting with, because it's the difference between a sharding feature that's reliable and one that quietly breaks under load. If the test discovery order were based on filesystem enumeration order, which on some filesystems is insertion order and on others is genuinely unspecified, then machine 1 and machine 2 could disagree about which tests belong in which shard. You'd either get gaps (a test nobody ran) or overlaps (a test two machines both ran, burning CI minutes and possibly producing two different verdicts for the same test).

By sorting the discovered test files (typically by path) before slicing, `run-all --shard` removes the filesystem's opinion from the equation entirely. Every machine, regardless of OS, container image, or how the checkout happened to lay files out on disk, produces the identical sorted list from the identical set of test files. Slicing that list by index is then a pure function: given the same sorted list and the same `i/n`, every machine computes the same shard. You don't need a coordinator process, you don't need machines to talk to each other before they start, and you don't need to pre-generate a shard manifest and check it into the repo. The coordination is implicit in the algorithm.

This matters more than it sounds like it should, because the alternative designs people reach for first (round-robin assignment from a live queue, a central dispatcher service, a checked-in shard map) all add a moving part that can fail, drift, or need maintenance. A deterministic, index-based split needs none of that. It only requires one invariant to hold: the set of test files has to be the same across all machines running the shard, which in practice just means "checkout the same commit," something CI already guarantees you.

## Setting up shards without stepping on each other

The practical workflow is: pick a shard count that matches how many parallel CI machines (or jobs) you want to spend on the suite, then launch that many `run-all` invocations, one per shard index, each pointed at the same test directory.

```bash
# Machine / job 1
browserbash run-all .browserbash/tests --shard 1/4 --junit out/junit-1.xml

# Machine / job 2
browserbash run-all .browserbash/tests --shard 2/4 --junit out/junit-2.xml

# Machine / job 3
browserbash run-all .browserbash/tests --shard 3/4 --junit out/junit-3.xml

# Machine / job 4
browserbash run-all .browserbash/tests --shard 4/4 --junit out/junit-4.xml
```

Each job writes its own JUnit file so your CI system's test reporting picks up results per shard, and most CI platforms will merge multiple JUnit artifacts into one combined view automatically. If a shard fails, only that shard's job goes red, which means you can see at a glance which slice of the suite has a problem instead of scrolling through one giant combined log looking for the failure.

You are not locked into four shards. Two shards halves your wall-clock time with half the machine cost of four. Eight shards gets you closer to "one test per worker" territory for extremely large suites, at the cost of more CI minutes billed in parallel and more per-job startup overhead (checkout, dependency install, browser download) eating into the time you saved. The sweet spot for most teams sits between four and eight shards: enough to bring a multi-hour suite down to single-digit minutes, not so many that startup overhead becomes the dominant cost.

### Shard count versus test count: a rough guide

| Suite size | Shards | Approx. tests per shard | Typical wall-clock win |
|---|---|---|---|
| 50 tests | 1-2 | 25-50 | Marginal, single machine is usually fine |
| 150 tests | 2-3 | 50-75 | Meaningful, cuts a 20-minute run to ~8 |
| 500 tests | 4-6 | 85-125 | Large, hours become tens of minutes |
| 1000+ tests | 8-10 | 100-125 | Necessary, single-machine runs become impractical |

These numbers assume each machine also runs its own internal `run-all` concurrency (BrowserBash derives that from CPU and RAM automatically), so the total speedup is shards multiplied by per-machine concurrency, not just the shard count alone.

## A GitHub Actions matrix example

GitHub Actions has a native `strategy.matrix` feature that's a near-perfect fit for `--shard i/n`, because it spins up one job per matrix entry automatically and runs them in parallel without you having to manually orchestrate four separate workflow files.

```yaml
name: browserbash-suite

on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm install -g browserbash-cli

      - name: Run shard ${{ matrix.shard }} of 4
        run: |
          browserbash run-all .browserbash/tests \
            --shard ${{ matrix.shard }}/4 \
            --junit out/junit-${{ matrix.shard }}.xml \
            --agent

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: junit-shard-${{ matrix.shard }}
          path: out/junit-${{ matrix.shard }}.xml
```

Every matrix entry checks out the same commit, so every machine sees the same file set, sorts it the same way, and computes the same shard as its siblings without a single message passed between jobs. `fail-fast: false` is worth calling out specifically: without it, GitHub Actions cancels the remaining shard jobs the moment one shard fails, which defeats the purpose of sharding if you actually want to see every failure in one pass instead of fixing them one shard at a time across multiple pushes.

BrowserBash also ships an official GitHub Action (`browserbash-action@v1`) that wraps this install-and-run pattern, supports the same `shard:` input for matrix jobs, and posts a self-updating PR comment with a verdict table and recording links instead of leaving you to dig through job logs. The full reference for wiring it into a matrix is in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## Combining sharding with cost governance

Sharding multiplies your machine count, and if any of your tests run against a paid hosted model, it also multiplies how fast you can burn through a budget, since four machines calling out to a model API in parallel spend four times as fast as one. BrowserBash's `--budget-usd` flag on `run-all` caps spend per invocation, and because each shard is its own `run-all` process, the budget applies per shard, not globally across all shards unless you divide it yourself.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.50
```

If you're running four shards and want to cap total suite spend at ten dollars, set each shard's budget to $2.50. Once any shard crosses its budget, `run-all` stops launching new tests in that shard, marks the remainder `skipped`, exits with code `2`, and records the actual spend in that shard's `RunAll-Result.md` and JUnit `<properties>` block. This is also a good moment to lean on the replay cache: a shard whose tests have already passed once will replay recorded actions with close to zero model calls on the next run, which is often the difference between a $2.50 budget being comfortable and being tight.

## Sharding versus a viewport matrix: different axes, don't confuse them

It's worth being precise about what sharding does and doesn't do, because BrowserBash has a second matrix-shaped feature that solves a different problem: `--matrix-viewport`. Sharding splits *which tests* run on which machine. The viewport matrix runs *every* test once per listed viewport size, for cross-resolution coverage.

```bash
browserbash run-all .browserbash/tests --shard 1/4 --matrix-viewport 1280x720,390x844
```

These two flags compose: the command above takes shard 1's slice of tests and runs each one twice, once at desktop resolution and once at mobile resolution, both labeled distinctly in the NDJSON events, JUnit output, and Result.md files so you can tell a desktop failure from a mobile one. If you're setting up a suite that needs both parallel machines and multi-viewport coverage, think of shard count as "how many machines" and viewport list as "how many resolutions per test," and multiply them out when estimating total job count. Four shards times two viewports is eight parallel jobs, not four.

## Handling flaky tests and shard imbalance

A deterministic index-based split is fair by test count, but it isn't automatically fair by *runtime*. If your slowest twenty tests happen to sort into the same shard, that shard becomes the long pole even though every shard got the same number of files. In practice this is less of a problem than it sounds, for two reasons. First, `run-all`'s within-shard scheduling already orders previously-slowest and previously-failed tests first, which means a shard with a cluster of slow tests still finishes them as early as possible rather than discovering them at the end of the run. Second, most real suites have file paths that don't correlate strongly with test duration, so a sort-based split tends to average out reasonably well across shards once you're past a few dozen tests per shard.

If you do see one shard consistently lagging the others by a wide margin over several runs, the fix isn't a smarter sharding algorithm, it's usually splitting that shard's slow tests into their own dedicated test files with names that sort differently, or moving to a higher shard count so the imbalance gets diluted across more, smaller groups. Watching JUnit timing data per shard over a week of runs will tell you quickly whether this is worth doing or whether the variance is just normal CI noise.

Flaky tests deserve a separate mention here because sharding doesn't fix flakiness, and it can make it more visible in an uncomfortable way: a test that fails intermittently now fails intermittently in a specific shard's job, which can look like "shard 3 is broken" when the real issue is one flaky test sitting in shard 3's slice. `run-all`'s flaky detection tracks pass/fail history per test across runs (not per shard), so a genuinely flaky test gets flagged the same way whether it's shard 1 or shard 4 that happened to run it that day.

## Who should shard, and who shouldn't yet

Sharding is a scaling tool, not a starting point. If your suite runs in under five minutes on one machine with reasonable concurrency, adding a shard matrix adds CI configuration complexity and per-job startup overhead for a speedup you probably won't notice. The overhead of checking out code, installing dependencies, and warming up a browser on four separate machines can easily eat ninety seconds per job, which is real money against a suite that only takes three minutes to begin with.

The clear signal to shard is when your single-machine `run-all` time, even with its automatic concurrency tuning, stretches past ten or fifteen minutes and is trending up as the suite grows. At that point the math flips: the per-job overhead becomes a rounding error against the hours you're saving, and a four-way or eight-way shard turns a "go get coffee" pipeline back into a "wait at your desk" one. Teams running the full BrowserBash workflow, plain-English objectives in [`*_test.md`](https://browserbash.com/learn) files driven through `run-all`, tend to hit that fifteen-minute mark somewhere between two hundred and four hundred tests depending on how flow-heavy each test is, which lines up closely with the 500-test scenario this article opened with.

## Getting started

If you're new to `run-all` itself, start on a single machine without any shard flag and confirm the suite is stable and green before you introduce parallelism across machines: sharding a flaky suite just gives you four flaky jobs instead of one. Once the baseline is solid, pick a shard count using the table above, wire it into a matrix job on whichever CI platform you use (the GitHub Actions example translates directly to GitLab CI's `parallel: matrix` or CircleCI's `parallelism`, with shard index coming from the platform's own job-index variable instead of a hardcoded list), and watch the combined JUnit output for a run or two before you trust the timing numbers.

For teams pairing BrowserBash with an AI coding agent, the [MCP server](https://browserbash.com/features) exposes `run_suite` as a tool an agent can call directly, and that tool respects the same shard-aware `run-all` under the hood, so an agent validating a change locally uses the identical deterministic split your CI matrix uses. You can browse worked examples and more CI patterns in the [tutorials](https://browserbash.com/tutorials) section, and see how a full suite report looks in practice in the [case study](https://browserbash.com/case-study).

## FAQ

### How does browserbash run-all --shard split tests without a shared coordinator?

It sorts every discovered test file into one deterministic list, then divides that list by index using the `i/n` values you pass. Because sorting a fixed set of files always produces the same order, every machine running the same commit computes an identical slice independently, with no locking, database, or message passing required between machines.

### What shard count should I use for a 500-test suite?

Somewhere between four and six shards is a reasonable starting point for most 500-test suites, since it brings a multi-hour sequential run down to tens of minutes while keeping per-job startup overhead (checkout, install, browser download) small relative to the time saved. Watch the JUnit timing across a few runs and adjust up if any single shard is still your long pole.

### Can I combine sharding with a viewport matrix in BrowserBash?

Yes. `--shard i/n` and `--matrix-viewport` are separate axes that compose: shard controls which subset of tests a machine runs, and viewport matrix runs each of those tests once per listed screen size. Multiply the two together when estimating total parallel job count, since four shards times two viewports means eight jobs, not four.

### Does sharding fix flaky browser tests?

No, sharding only changes which machine runs which test, it doesn't change the test itself. A flaky test will still fail intermittently wherever its shard lands it, and `run-all`'s flaky detection tracks that pass/fail history per test across runs regardless of shard, so a genuinely flaky test gets flagged the same way no matter which slice it's in.

Sharding is a one-flag change once your suite is stable: install with `npm install -g browserbash-cli`, add `--shard i/n` to your existing `run-all` command, and let your CI matrix do the rest. An account is optional for all of this, but if you want the free cloud dashboard and PR comment history, [sign up here](https://browserbash.com/sign-up).
