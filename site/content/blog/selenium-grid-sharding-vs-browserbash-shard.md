---
title: Selenium Grid Sharding vs --shard in BrowserBash
description: "Selenium grid sharding vs browserbash shard: compare running a Grid for parallel test execution against run-all --shard i/n with zero infrastructure."
date: 2026-07-17
category: comparison
---

If you have ever spent an afternoon debugging why three of your Selenium Grid nodes are stuck at "starting" while a fourth silently OOMs mid-suite, the phrase selenium grid sharding vs browserbash shard probably already means something to you. Sharding a test suite across parallel workers is not a new idea, Selenium Grid has done it for over a decade with hub-and-node topology, and most CI systems can fan a suite out across machines given enough YAML. The question worth asking in 2026 is not "can I run tests in parallel" but "what does it cost me, in servers, in maintenance hours, and in cognitive overhead, to keep that parallelism alive." This article walks through what a Selenium Grid actually requires to shard reliably, what `browserbash run-all --shard i/n` gives you instead, and where the Grid still wins outright: real, guaranteed cross-browser and cross-OS coverage that a single-browser CLI cannot replicate.

## What Selenium Grid Sharding Actually Involves

Selenium Grid's sharding model is infrastructural. You stand up a hub (or, since Grid 4, a router plus distributor), register one or more nodes, and each node advertises a capacity of browser sessions it can host. Your test runner, whether that is TestNG's parallel `<suite>` config, pytest-xdist, or a custom thread pool, opens N `RemoteWebDriver` sessions against the hub, the hub schedules them onto whichever node has capacity, and your tests execute concurrently.

That sentence hides a lot of operational reality. To make it work in practice you need to:

- Provision node images (or containers) with the exact browser and driver versions your test matrix requires, then keep them patched as Chrome, Firefox, and Edge auto-update roughly every four to six weeks.
- Size node capacity correctly. Undersized nodes queue sessions and your "parallel" run degrades into a slow serial run with extra network hops. Oversized nodes crash under memory pressure, and a crashed node mid-suite produces the worst kind of failure: a `SessionNotCreatedException` that has nothing to do with your application under test.
- Manage session timeouts and zombie sessions. A test that hangs (uncaught alert, infinite wait) can pin a node slot until a timeout fires, silently reducing your effective parallelism for the rest of the run.
- Handle Grid version upgrades. Grid 3 to Grid 4 was a meaningful architecture change (hub/node to router/distributor/session-queue), and teams running self-hosted Grids had to plan migrations, not just bump a Docker tag.
- Decide between self-hosted (Docker Compose, Kubernetes with Selenoid or Moon, or raw VMs) and a managed grid vendor (BrowserStack, LambdaTest, Sauce Labs), each with its own pricing model, usually billed by concurrent session count or minutes consumed.

None of this is a criticism of Selenium Grid, it is simply what "grid" means: a piece of infrastructure that someone on your team owns, patches, and pages for. Teams that need real multi-browser, multi-OS coverage accept this cost because there is no substitute for it. Teams that just need "run my 200 tests faster" are often paying grid-operation tax for a problem that does not require a grid at all.

## What browserbash run-all --shard Actually Does

BrowserBash's `run-all` command is a memory-aware parallel orchestrator built into the CLI itself, no hub, no node registration, no separate service to deploy. Point it at a folder of `*_test.md` files and it computes concurrency from real CPU and RAM available on the machine it's running on, then launches child processes accordingly. Add `--shard i/n` and it slices the suite deterministically: shard 1/4 and shard 2/4 on two different CI runners will always agree on which tests belong to which shard, because the slice is computed against the sorted discovery order of test files, not against runtime ordering that could vary between machines.

```bash
# four parallel CI jobs, each running one quarter of the suite
browserbash run-all .browserbash/tests --shard 1/4 --junit out/junit-1.xml
browserbash run-all .browserbash/tests --shard 2/4 --junit out/junit-2.xml
browserbash run-all .browserbash/tests --shard 3/4 --junit out/junit-3.xml
browserbash run-all .browserbash/tests --shard 4/4 --junit out/junit-4.xml
```

There is no hub process to keep alive between runs. Each shard is just an invocation of the CLI with a different `i/n` argument, so it slots into any CI matrix (GitHub Actions `strategy.matrix`, GitLab parallel jobs, CircleCI parallelism) as a plain shell command. The official BrowserBash GitHub Action (documented at https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) supports `shard:` matrix jobs directly, so you get sharded CI without writing the fan-out logic yourself.

Concurrency within a single shard is also handled for you. `run-all`'s scheduler computes `min(requested, cpus, floor((effectiveMem - 2GB) / memoryBudget))`, so it will not schedule sixteen concurrent browser sessions on a runner with 8GB of RAM just because you asked for sixteen. It is cgroup-aware, which matters if you are on a containerized CI runner where the OS reports more memory than the container is actually allowed to use. Beyond that, it applies previously-failed-first and slowest-first ordering across the suite so that a flaky or slow test surfaces early instead of at minute 40 of a 45-minute run, and it flags flaky tests based on run history rather than making you build that detection yourself.

If you want to bound the spend of a sharded run rather than just its wall clock time, `--budget-usd` stops launching new tests once the suite crosses a cost threshold, reports the remainder as skipped, and exits with code 2 so CI treats a budget stop as distinct from a genuine test failure.

```bash
# bound cost across a 4-way sharded matrix, stop launching new tests past $2.50
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.50 --junit out/junit-2.xml
```

## The Core Trade-off: Infrastructure vs Browser Coverage

The honest way to frame selenium grid sharding vs browserbash shard is not "old tool vs new tool," it's a trade-off between two different things you can optimize for: infrastructure elimination and browser matrix breadth.

Selenium Grid's sharding exists to let you run the same suite concurrently against Chrome, Firefox, Edge, and Safari, on Windows, macOS, and Linux, at whatever session count your node fleet supports. That breadth is the entire point of the Grid's existence, sharding is a side effect of having many nodes available. If your product genuinely needs to be verified against six browser and OS combinations because a meaningful slice of your user base is on Safari on macOS or Edge on Windows 11, no CLI that drives a single local Chrome/Chromium instance is going to replace that. BrowserBash does not claim to: its provider list is local (your machine's Chrome), cdp (any CDP endpoint), browserbase, lambdatest, and browserstack, and the lambdatest/browserstack providers exist specifically because BrowserBash routes to them when you need grid-backed cross-browser execution. Notably, those two providers cannot run the default Stagehand engine at all, `src/runner.ts` auto-switches to the builtin Anthropic tool-use engine for grid execution, which tells you plainly that BrowserBash treats "I need a real grid" as a legitimate, supported path rather than something to route around.

`run-all --shard` exists to solve a narrower, more common problem: "I have 150 to 500 plain-English UI checks and I want them to finish in under ten minutes without running a hub." For that problem, the infrastructure Selenium Grid brings, node provisioning, capacity tuning, session queue monitoring, is pure overhead. You are not trying to prove your app works on Safari, you are trying to get a green or red verdict on your staging deploy before the next commit lands.

## Side-by-Side Comparison

| Dimension | Selenium Grid sharding | browserbash run-all --shard |
|---|---|---|
| Infrastructure to run | Hub/router + registered nodes (self-hosted or vendor-managed) | None, single CLI process per shard |
| Setup for N-way parallelism | Provision nodes, configure capacity, tune timeouts | `--shard i/n` flag, repeat with different `i` |
| Concurrency sizing | Manual (node count and capacity per node) | Automatic, derived from real CPU/RAM, cgroup-aware |
| Cross-browser coverage | Native, whatever browsers your nodes have installed | Not the design goal; delegate to lambdatest/browserstack providers when needed |
| Test authoring | Selectors, page objects, WebDriver code | Plain-English `*_test.md` steps, no selectors |
| Deterministic shard assignment across machines | Depends on your test runner's ordering logic | Guaranteed, computed on sorted discovery order |
| Flaky/slow test triage | You build it (or buy a reporting tool) | Built in: failed-first and slowest-first ordering, flaky flags from run history |
| Cost control mid-run | Not a Grid feature; handled at the CI or vendor billing layer | `--budget-usd` / `--budget-tokens` hard stop, remaining tests marked skipped, exit code 2 |
| Ongoing maintenance | Patch node images, upgrade Grid versions, monitor node health | `npm install -g browserbash-cli` upgrades the tool, no fleet to patch |
| Best fit | Verifying real multi-browser/multi-OS compatibility | Fast, cheap, parallel functional verification on one browser engine |

## Where a Real Selenium Grid Still Wins

It would be dishonest to pretend BrowserBash's shard flag makes Selenium Grid obsolete, and that is not the claim here. A Selenium Grid, self-hosted or through a vendor, is the correct tool when any of the following are true for your product:

**You need actual Safari or actual mobile Safari coverage.** WebKit's rendering and JS engine quirks are real and browserbash's default execution path is Chrome/Chromium via Playwright-driven automation. If your analytics show meaningful iOS Safari traffic, you need a grid node (or a device farm) running real Safari, not a Chromium instance configured to mimic it.

**Your compliance or contractual obligations name specific browser versions.** Enterprise software sold into regulated industries sometimes has support matrices baked into contracts: "supported on Chrome N-2, Firefox ESR, Edge current." Proving that requires actually running on those browsers, and a Grid (or a grid-backed vendor) is how you produce that evidence.

**You are already running hundreds of concurrent sessions across a large team.** If your organization has already amortized the cost of Grid operations, has a platform team dedicated to it, and gets genuine value from six-way browser matrices on every PR, ripping that out to chase infrastructure simplicity would be solving a problem you do not have.

**Your tests are written and you are not looking to rewrite them.** Selenium Grid sharding parallelizes existing WebDriver test suites. If you have thousands of stable Selenium tests and the pain point is purely "make CI faster," adding shards to your existing runner config is a much smaller lift than adopting a new test authoring format, even a plain-English one. (BrowserBash's `browserbash import` command converts existing Playwright specs to plain-English test files deterministically, with no model involved and an `IMPORT-REPORT.md` for anything it cannot translate cleanly, so migration friction is lower than it might first appear if you decide the format switch is worth it later.)

Where `run-all --shard` earns its place is the much larger population of teams whose actual requirement is "fast, parallel, reliable checks on one representative browser" for smoke tests, staging verification, and PR gates, not full cross-browser certification. Most functional regressions (broken flows, missing elements, wrong copy, broken redirects) show up identically in Chrome and Chromium; the browsers you'd add a Grid to catch are almost always rendering or CSS edge cases, not functional ones.

It also helps to be honest about what a Grid does not solve by itself. Standing up nodes gets you browser diversity, but it does not give you flaky-test triage, cost-aware scheduling, or deterministic shard assignment across machines, those are things you build on top of the Grid with your own tooling, a third-party reporting service, or manual spreadsheet tracking. Teams often underestimate this second layer of work when they compare "install Selenium Grid" against "install a CLI," because the Grid's setup cost is visible up front while its ongoing operational cost, the health monitoring, the node capacity tuning, the version drift between nodes, shows up gradually over months. That gradual cost is exactly what teams reaching for `run-all --shard` are usually trying to avoid, not the initial afternoon of setup.

## Combining Both: A Practical Pattern

These two approaches are not mutually exclusive, and the strongest CI setups we've seen use both, each for what it is good at. A common pattern:

1. Run the bulk of your functional suite with `browserbash run-all --shard i/n` on every commit, local Chromium, sharded four ways, done in a few minutes, zero grid infrastructure to babysit.
2. Run a much smaller, curated cross-browser subset (the handful of tests that actually exercise browser-specific behavior: date pickers, file uploads, CSS grid layouts) against a Selenium Grid or a grid vendor, nightly or on merge to main rather than on every PR.

This keeps your fast feedback loop cheap and infrastructure-free while still budgeting real grid time for the narrower question grids are built to answer. You can even route BrowserBash itself at a grid-backed provider for that second tier:

```bash
# route the same plain-English tests at a grid-backed provider for cross-browser coverage
browserbash run-all .browserbash/tests/cross-browser --provider lambdatest --junit out/xbrowser.xml
```

Because `lambdatest` and `browserstack` providers force the builtin engine (Stagehand cannot run against those grids), you will want `ANTHROPIC_API_KEY` set, or an `ANTHROPIC_BASE_URL` gateway pointed at a compatible model, for that path specifically. For the sharded local-Chromium path, BrowserBash's Ollama-first model resolution means you can run the whole thing with a free local model and no API key at all, which matters when you're sharding four to eight ways on every commit: keeping the marginal cost per shard at zero is the entire reason `--shard` exists as a separate, lighter-weight tool from grid-backed execution.

## A Note on Test Authoring Speed

Part of what makes `run-all --shard` cheap to adopt isn't just the missing infrastructure, it's what you're sharding. Selenium Grid sharding parallelizes suites written in selector-based code: `driver.findElement(By.cssSelector(...))`, page object classes, explicit waits. That code is durable once written but expensive to write and to maintain when the DOM changes.

`*_test.md` files sharded by `run-all` are plain English:

```
# Checkout flow smoke test
- Go to https://shop.example.com/cart
- Add the first item to cart
- Proceed to checkout
- Verify 'Place order' button visible
- Fill shipping address with {{shipping_address}}
- Verify text "Order confirmed"
```

No selector maintenance, and with testmd v2 (`version: 2` frontmatter) you can mix deterministic API calls with UI checks in the same file, useful for seeding state before a sharded UI check runs against it:

```
---
version: 2
---
# Seed and verify order status
- POST https://api.example.com/orders with body {"sku": "ABC123", "qty": 1}
- Expect status 201, store $.id as 'order_id'
- Go to https://shop.example.com/orders/{{order_id}}
- Verify text "Processing"
```

That `Verify` step compiles to a real Playwright assertion, not an LLM judgment call, so a shard's pass/fail is deterministic and reproducible, the same property you'd want from a Selenium Grid's assertion layer. When you're running the same suite four ways in parallel across CI runners, deterministic assertions matter more than usual: nondeterministic flakiness that would be annoying in a single serial run becomes four times as annoying, and four times as hard to reproduce, once it's sharded.

## When to Choose Which

Choose Selenium Grid (self-hosted or vendor) when your actual open question is "does this work on Safari / Firefox ESR / Edge on Windows," when you have an existing WebDriver suite you don't intend to rewrite, or when a platform team already owns grid operations and the marginal cost of one more shard is close to zero for you specifically.

Choose `browserbash run-all --shard i/n` when your actual open question is "did this commit break anything," when you want parallel execution without owning a hub or paying per concurrent session, when you're writing new checks and would rather write plain English than page objects, or when you want deterministic, reproducible shard assignment across CI runners without wiring that logic yourself.

Many teams will end up doing both, just not for the same tests. Use the CLI's [MCP server](https://browserbash.com/learn) integration if you want an AI coding agent (Claude Code, Cursor, Codex) to run sharded checks itself as part of its own verification loop, since `run_suite` over MCP returns the same structured verdict a human would get from the CLI. If you're new to the tool, the [tutorials](https://browserbash.com/tutorials) and [features](https://browserbash.com/features) pages walk through setup, and the [case study](https://browserbash.com/case-study) covers a real adoption story end to end.

## FAQ

### Does browserbash replace Selenium Grid?

No. BrowserBash's `run-all --shard` replaces the need for grid infrastructure when your goal is fast, parallel functional checks on one browser engine. It does not replace a Grid's core purpose, which is real multi-browser and multi-OS coverage. For that, BrowserBash routes to grid-backed providers (lambdatest, browserstack) rather than trying to simulate them.

### Can I run browserbash tests in parallel without a Selenium Grid?

Yes. `browserbash run-all <folder> --shard i/n` slices a test suite deterministically across parallel invocations, and the built-in scheduler sizes concurrency within each invocation from available CPU and RAM automatically, with no hub, node registration, or separate service required.

### How does browserbash decide how many tests to run concurrently?

The `run-all` scheduler computes `min(requested concurrency, CPU count, floor((effective memory - 2GB) / per-test memory budget))`, is aware of cgroup memory limits on containerized runners, and applies a per-test process-tree memory watchdog (`--memory-cap`) to prevent one runaway test from starving the others.

### Is shard assignment consistent across different CI machines?

Yes. Shard slices are computed against the sorted discovery order of test files, not runtime ordering, so shard 1/4 run on one CI runner and shard 2/4 run on a completely different runner will always agree on which tests belong to which shard.

If you want to see the difference between grid infrastructure and shard flags on your own suite, install it and try a sharded run: `npm install -g browserbash-cli`, then `browserbash run-all .browserbash/tests --shard 1/2` alongside `--shard 2/2` in a second terminal. An account is optional, sign up at https://browserbash.com/sign-up only if you want the free hosted dashboard on top of the local one.
