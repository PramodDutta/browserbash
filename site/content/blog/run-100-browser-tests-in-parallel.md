---
title: Running 100+ AI Browser Tests in Parallel Without Melting CI
description: "How to run browser tests in parallel with BrowserBash: parallel AI testing in CI via matrix fan-out, xargs -P, sharding, and NDJSON result aggregation."
date: 2026-06-26
category: ci
---

The short answer: each `browserbash run` (or `testmd run`) is its own independent operating-system process, so you scale browser tests horizontally by running many of those processes at once. One process drives one browser through one objective and exits with a code, and that property lets you run browser tests in parallel three composable ways: fan the suite out across CI runners with a matrix, pack many processes onto one big machine with `xargs -P`, and shard the suite by directory or tag. This post covers all three, then gets honest about the resource ceiling for parallel AI testing in CI, where the bottleneck is almost never the browser.

## Why one process per run is the thing that matters

Most parallel-testing pain comes from shared state: a worker pool, a reporter, a global config, where true isolation means fighting the framework. BrowserBash sidesteps that because the unit of execution is a plain process that launches a browser, runs the agent loop against a model, prints results, and returns, persisting nothing. Three consequences follow. Isolation is free: a crash in one run cannot corrupt another, because they share no memory. Aggregation is your job, not the tool's: each process emits its own NDJSON stream and exit code, and you collect them. And the scaling limit is resources, not architecture: you hit RAM or model inference throughput long before BrowserBash itself becomes the constraint. I use it here because it was built for this shape (NDJSON via `--agent`, four exit codes, remote browser providers) and is free and open source under Apache-2.0 (`npm install -g browserbash-cli`).

## Approach 1: CI matrix fan-out across runners

The cleanest way to run browser tests in parallel in CI is to let the provider give you parallel machines and split your test files across them. Each runner is a fresh box with its own CPU, RAM, and network, so concurrency across runners has no shared-resource problem until you hit your model backend. The pattern: enumerate your `*_test.md` files and have each matrix leg run only its share. The GitHub Actions workflow below shards a directory of TestMD files across four runners by index, picking every Nth file so adding files needs no change.

```yaml
name: parallel-browser-tests
on: [push]

jobs:
  browser-tests:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false          # one shard failing must not cancel the others
      matrix:
        shard: [0, 1, 2, 3]     # 4 parallel runners
        total: [4]
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install BrowserBash
        run: npm install -g browserbash-cli

      - name: Run this shard
        run: |
          set -uo pipefail
          # Stable, sorted list; pick every Nth file for this shard.
          mapfile -t files < <(find tests -name '*_test.md' | sort)
          status=0
          for i in "${!files[@]}"; do
            (( i % ${{ matrix.total }} != ${{ matrix.shard }} )) && continue
            browserbash testmd run "${files[$i]}" --headless --agent --model auto \
              >> "results-shard-${{ matrix.shard }}.ndjson"
            code=$?
            (( code > status )) && status=$code   # worst code wins
          done
          exit $status

      - name: Upload shard results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ndjson-shard-${{ matrix.shard }}
          path: results-shard-${{ matrix.shard }}.ndjson
```

Three details make this hold up. `fail-fast: false` is mandatory: without it, the first shard returning non-zero cancels the rest and you lose results from runs that were fine. `if: always()` uploads each shard's NDJSON even when it failed, so you debug reds from artifacts instead of re-running. And the per-shard `exit $status` propagates the worst exit code to gate the leg. It scales by adding entries to `shard` and bumping `total`, and because each runner only ever runs one browser at a time, no single runner melts; the cost moves to your model backend. GitLab Runner gives the same shape with `parallel: 4` and its `CI_NODE_INDEX` / `CI_NODE_TOTAL` variables (`CI_NODE_INDEX` is 1-based). The [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial) covers the wiring step by step, and the [cross-browser matrix guide](/blog/github-actions-matrix-cross-browser-ai-tests) extends it across engines.

## Approach 2: shell-level concurrency on one big machine

Sometimes you do not have a matrix, you have one fat box (a self-hosted runner with 64 GB of RAM) and want to use all of it. Here the tool is `xargs -P`, which runs a command over a list of inputs with a fixed number of parallel slots: the simplest Unix job pool.

```bash
#!/usr/bin/env bash
set -uo pipefail

# Up to 6 processes at once; each drives its own browser, writes its own NDJSON.
find tests -name '*_test.md' -print0 \
  | xargs -0 -P 6 -I {} bash -c '
      f="$1"
      out="results/$(basename "$f" .md).ndjson"
      browserbash testmd run "$f" --headless --agent --model auto > "$out"
      echo "exit=$? file=$f"
    ' _ {}

# xargs exits non-zero if any invocation did; gate the pipeline on that.
echo "pool exit code: $?"
```

The `-P 6` is the concurrency dial: six browsers and six inference streams in flight at once, tuned to the machine, not the suite size. Writing each run's NDJSON to its own file under `results/` keeps the streams from interleaving, the one thing that goes wrong if you redirect concurrent processes to a single file. `xargs` returns non-zero if any child did, so the script's own exit status is a coarse pass/fail gate.

The right `-P` is whichever of two ceilings you hit first: RAM for Chrome instances, or your model backend's concurrent-request capacity. On a single local Ollama instance, `-P 6` does not buy six concurrent inferences, because Ollama serializes requests.

## Approach 3: sharding by directory or tag

Index-modulo sharding balances files evenly but ignores meaning. Often you want shards that mean something (smoke versus regression, checkout versus search) so a failing shard tells you what broke without opening a log. By directory, point each shard at a folder; in a matrix that becomes one leg per directory (`matrix: { suite: [smoke, checkout, search, account] }`) running `./tests/${{ matrix.suite }}/*_test.md`. By tag, keep a naming convention in the filenames (`login_smoke_test.md`, `cart_regression_test.md`) and select with a glob fed into the same pool:

```bash
# Run only the smoke-tagged files, four at a time.
find tests -name '*_smoke_test.md' -print0 \
  | xargs -0 -P 4 -I {} browserbash testmd run {} --headless --agent
```

Both kinds of shard compose with the prior approaches: each shard can be a matrix leg and run its files with `xargs -P`. That two-level fan-out, M runners times P processes per runner, is how you reach 100+ concurrent tests. The only question left is whether your model backend can feed that many inference streams.

## The resource reality: each run needs a browser and an inference stream

Every concurrent `browserbash run` needs two things:

- **One browser instance.** That is real RAM, and a heavy page costs more than a light one. This is why `--headless` matters in CI: dropping the rendering surface and GPU compositor cuts the footprint per run, so default to it.
- **One model inference stream.** The agent loop is a conversation with a model (observe, decide the next action, repeat), so N concurrent runs means N concurrent request streams hitting your model backend.

The browser side scales with RAM. The model side is the bottleneck people underestimate, and how badly depends on where inference runs.


### The local Ollama ceiling

If you self-host a single Ollama instance and point everything at it, your real concurrency is roughly one, no matter how high you set `-P` or how many matrix legs you spin up. A single Ollama server processes requests largely serially. Twenty processes pointed at one box do not get twenty parallel inferences; they queue, with all twenty browsers launched and sitting idle holding RAM, so you pay the memory cost of twenty browsers and get the throughput of one. Local Ollama is excellent for low concurrency on one machine and a poor fit for high fan-out unless you stand up a pool of model servers.

### What actually scales: hosted models or a server pool

To run parallel AI testing in CI at scale, the inference backend has to handle concurrency:

- **A hosted model** via `ANTHROPIC_API_KEY` (Anthropic) or `OPENROUTER_API_KEY` (OpenRouter), both built for concurrency. `--model auto` resolves in order (local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`), so in CI you set one of those secrets and `auto` picks it up. Now 16 concurrent runs are 16 concurrent API calls in parallel.
- **A pool of model servers**, multiple Ollama (or vLLM) instances behind a load balancer, if you want to stay self-hosted and still fan out. Real infrastructure work, but it removes the serialization wall.

### Offload the browsers too: remote providers

Even with model concurrency solved, running many Chromium instances on your CI runner eats its RAM. Move the browsers off the box with a remote provider: BrowserBash supports `--provider local | cdp | browserbase | lambdatest | browserstack`. With `--provider browserbase` (or `lambdatest` / `browserstack`), the browser runs in the provider's cloud and your runner only orchestrates, holding almost no browser memory locally. That decouples your concurrency ceiling from your runner's RAM at the cost of per-session pricing, and pairing it with a hosted model is the cleanest high-concurrency setup: the CI box becomes a thin coordinator while both heavy resources live elsewhere.

## Aggregating results and gating the pipeline

`--agent` switches output from prose to NDJSON: one JSON event per line. Because it is line-delimited, concatenating the per-run files (redirect each run to its own to avoid interleaving) gives you one stream `jq` can read:

```bash
cat results/*.ndjson > all-results.ndjson

# Count outcomes across the whole parallel run.
jq -rs 'map(select(.type=="result")) | group_by(.status)[]
        | "\(.[0].status): \(length)"' all-results.ndjson
```

The full event schema is in the [NDJSON agent-mode tutorial](/blog/ndjson-agent-mode-tutorial); the point is that NDJSON is the aggregation contract every process speaks, so collecting 100 runs is a `cat` and a `jq` away. Gating is the exit code, and BrowserBash returns four:

- **0** (pass): the objective was met.
- **1** (fail): the agent reached a verdict and the assertion did not hold. A real product bug.
- **2** (error): something broke before a verdict (a crash, a misconfiguration, an unreachable model).
- **3** (timeout): the run exceeded its time budget.

Each matrix leg propagates the worst exit code of its shard, and the job is red if any leg is red. Four codes beat a boolean at high concurrency: a `1` is a bug to file, but a wall of `2`s usually means your model backend is overloaded or your runner is out of RAM. The [exit-codes guide](/blog/browserbash-exit-codes-ci-tutorial) spells out each code and how to branch on it.

## Honest limits

Parallel AI browser testing is powerful, but it has hard edges. Plan around these.

**Single local Ollama is a concurrency dead end.** One Ollama instance serializes generations, so high `-P` just stacks idle browsers in a queue while one model grinds. Real self-hosted fan-out needs a pool of model servers, genuine infrastructure to build and operate.

**RAM per Chrome instance caps a single machine.** Every concurrent run holds a browser, and headless Chromium still consumes real memory per instance, until the box swaps or the OOM killer reaps processes. `--headless` lowers the cost but does not remove it; beyond one machine's RAM, fan out across matrix runners or offload with `--provider browserbase`. I am deliberately not quoting a megabytes-per-tab number, because it varies by page weight and Chromium version, so measure it on your own pages first.

**Hosted model cost scales roughly linearly with concurrency.** Twenty concurrent runs are twenty billed streams, and per-token pricing means your bill tracks concurrency times steps per run. A nightly suite of 100 multi-step journeys is a real line item, so budget it, and consider free OpenRouter models for non-critical lanes (with the rate limits that implies). The same applies to remote browser providers: per-session pricing times sessions.

**Flaky-run isolation is on you.** Clean isolation also means a single agent misreading a screen produces a lone red in an otherwise green suite, and at 100 runs the odds at least one has a bad inference are not tiny. The mitigations are ordinary: use a capable enough model for hard flows (small local models are flaky on long multi-step objectives) and keep objectives tight. BrowserBash does not silently retry or self-heal a failed run; the exit code is the honest verdict, so build retry-on-flake into your pipeline if you want it (re-run the shard, compare).

## FAQ

### How many BrowserBash tests can I run in parallel at once?

As many as your two ceilings allow: RAM for browsers and concurrency capacity for model inference. The architecture imposes no cap. With a single local Ollama you are effectively serial, so plan for one concurrent run. With a hosted model and either a big machine or a CI matrix, dozens to 100+ is reachable, limited by rate limits, RAM, and budget. Use `--provider browserbase` to take browser RAM off your runner and push the ceiling higher.

### Why do my parallel runs not get faster when I increase xargs -P?

Almost always because they share one local Ollama instance, which serializes requests: the browsers parallelize fine, but the single inference backend is the wall. Fix it by pointing at a hosted model, or by standing up a pool of model servers behind a load balancer.

### Should I run browsers on my CI machine or use a remote provider?

If your suite fits in your runner's RAM with `--headless`, local browsers (`--provider local`) are simplest and have no per-session cost. Once concurrency outgrows your RAM, switch to `--provider browserbase` (or `lambdatest` / `browserstack`) so browsers run in the provider's cloud and your runner only orchestrates, trading per-session pricing for headroom.

## Where to go next

The pattern is small enough to hold in your head: one process per test, fan out with a matrix and a job pool, shard by meaning, and respect the two ceilings of RAM and inference throughput. Pick a hosted model and `--provider browserbase` to go big, keep local Ollama for low-concurrency lanes, and gate on exit codes with NDJSON. To wire this into a pipeline, start with the [GitHub Actions tutorial](/blog/browserbash-github-actions-tutorial) and the [cross-browser matrix guide](/blog/github-actions-matrix-cross-browser-ai-tests); for machine-readable output read the [NDJSON agent-mode tutorial](/blog/ndjson-agent-mode-tutorial), and to gate correctly the [exit-codes guide](/blog/browserbash-exit-codes-ci-tutorial). See [Features](/features) and [Learn](/learn) for the full command surface. BrowserBash is free and open source under Apache-2.0: install it with `npm install -g browserbash-cli` and run your first test in parallel today.
