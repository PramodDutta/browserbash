---
title: Add the Official BrowserBash GitHub Action to Your CI
description: "A hands-on browserbash github action tutorial: install the action, ship a verdict PR comment, shard a matrix job, and cap spend with budget-usd."
date: 2026-07-17
category: ci
---

If you have been running `browserbash run` locally and want the same plain-English checks gating every pull request, this browserbash github action tutorial walks through the whole setup: installing the official action, reading the self-updating PR verdict comment, splitting a suite across sharded matrix jobs, and capping spend with a budget-usd hard stop. By the end you will have a working workflow file you can drop into `.github/workflows/` today.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI. You write an objective like "log in and confirm the dashboard shows the account name," an AI agent drives a real Chrome browser to do it, and you get a deterministic pass/fail verdict back, no selectors, no page objects, no brittle CSS locators to maintain. The GitHub Action wraps that same CLI in a CI-friendly shell: it installs `browserbash-cli`, runs your `*_test.md` suite, uploads the artifacts, and posts a comment on the PR so reviewers do not have to click into Actions logs to see what broke.

## Why Run BrowserBash in CI Instead of Just Locally

Running `browserbash run "..."` on your own machine is a fine way to sanity-check a flow while you are building it. But the value of browser verification goes up sharply the moment it runs automatically on every pull request, before a human reviewer even looks at the diff. A plain-English test that catches a broken checkout flow on PR #482 is worth a lot more than the same test run manually three days later after the change already shipped.

The official GitHub Action exists because CI has different requirements than a laptop run. It needs a deterministic exit code that branch protection rules can key off, it needs artifacts that persist after the job finishes, and it needs a way to surface the result to a human without them digging through raw NDJSON in a log viewer. The action (`PramodDutta/browserbash@main`) handles all three: exit codes 0/1/2/3 map directly to job success or failure, JUnit XML and NDJSON get uploaded as build artifacts, and a formatted comment lands on the pull request itself.

This is also where the "open-source validation layer for AI agents" framing earns its keep. If your team already has an AI coding agent opening PRs, whether that is Claude Code, Cursor, Codex, or something in-house, BrowserBash in CI checks the agent's work against a real browser instead of just trusting the diff.

## Prerequisites Before You Wire Up CI

Before touching the workflow YAML, get three things in place:

1. **A test suite that already passes locally.** Do not debug flaky prompts in CI where feedback loops are slow. Write your `*_test.md` files under `.browserbash/tests/` and run them with `browserbash run-all .browserbash/tests` until they are green.
2. **A model key in GitHub Actions secrets.** Ollama-first only works when there is an Ollama daemon reachable from the runner, which most hosted GitHub runners do not have by default. In CI, the practical default is `ANTHROPIC_API_KEY` (BrowserBash also supports `OPENAI_API_KEY` and OpenRouter). Store it under repo Settings -> Secrets and variables -> Actions.
3. **`pull-requests: write` permission** on the workflow job, so the action can post and refresh the verdict comment. Without it, the run still produces a pass/fail exit code, you just lose the PR comment.

If you have never written a `*_test.md` file, the format is intentionally boring: a `#` title, numbered or bulleted steps in plain English, optional `@import` for shared setup steps, and `{{variable}}` placeholders for anything that should come from secrets or config rather than being hardcoded. Something like this is enough to get started:

```
# Login smoke test

- Go to {{BASE_URL}}/login
- Type {{TEST_EMAIL}} into the email field
- Type {{TEST_PASSWORD}} into the password field
- Click the "Sign in" button
- Verify the "Dashboard" heading is visible
```

That `Verify` line matters more than it looks. As of BrowserBash 1.5.0, `Verify` steps that match the built-in grammar (URL contains, title is/contains, text visible, a named button/link/heading visible, element counts, stored value equals) compile to real Playwright assertions instead of being judged by the model. That is the difference between a CI check you can trust for branch protection and one that occasionally rubber-stamps a broken page because an LLM decided "close enough." Any `Verify` line outside that grammar still runs, just agent-judged, and gets flagged `judged: true` in the output so you always know which kind of check you are looking at.

## Installing the Action: A Full Example Workflow YAML

Here is a complete workflow that installs Chrome on the runner, runs your suite with a budget cap, and posts the verdict comment. Save this as `.github/workflows/browserbash.yml`:

```yaml
name: browser-tests
on: pull_request

permissions:
  contents: read
  pull-requests: write   # required for the verdict comment

jobs:
  browserbash:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-chrome@v1   # local provider drives Chrome stable
      - uses: PramodDutta/browserbash@main
        with:
          tests: .browserbash/tests
          timeout: '180'
          budget-usd: '2.00'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

A few things worth calling out that trip people up the first time:

- **`browser-actions/setup-chrome@v1` is a separate step, not baked into the BrowserBash action.** The default `local` provider drives whatever Chrome is on the runner's PATH, so you need to install it explicitly. If you skip this step on `ubuntu-latest`, the run fails at the provider-launch stage, not at the test level, so check the raw logs rather than the PR comment if that happens.
- **`timeout` is per-test, in seconds, not per-suite.** A `timeout: '180'` means each individual `*_test.md` file gets three minutes before it is marked `timeout` (exit code 3 for that test). Long multi-step flows may need this bumped; fast smoke tests can go lower to fail faster.
- **`ANTHROPIC_API_KEY` goes in `env:`, not `with:`.** Action inputs (`with:`) are for configuration; secrets go through the environment so they never get echoed into step output or the action's own logs.

If your team runs on a device lab instead of local Chrome, swap the provider input:

```yaml
      - uses: PramodDutta/browserbash@main
        with:
          tests: .browserbash/tests
          provider: lambdatest
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          LT_USERNAME: ${{ secrets.LT_USERNAME }}
          LT_ACCESS_KEY: ${{ secrets.LT_ACCESS_KEY }}
```

Grid providers like LambdaTest and BrowserStack cannot run the default Stagehand engine, BrowserBash auto-switches to the `builtin` engine for those providers, which is why you still need `ANTHROPIC_API_KEY` even though the browser itself is remote.

## Understanding the Self-Updating PR Verdict Comment

The headline feature of the action, and the reason most teams adopt it over calling the CLI directly in a raw shell step, is the PR comment. When `comment: true` (the default), the action posts a single comment on the pull request summarizing every test in the suite: pass, fail, timeout, skipped, and flaky counts, one row per test file. On the next push to the same PR, instead of stacking a new comment underneath the old one, it edits the existing comment in place.

That matters for review hygiene. A PR that goes through five pushes before merge does not end up with five separate BrowserBash comments burying the actual code review discussion, it has one comment that always reflects the latest run. Reviewers scroll to it once, see the current state, and do not have to reconstruct history from a comment thread.

The comment content comes directly from the same data that lands in JUnit and Result.md, there is no separate CI-only verdict logic. If a test fails, the comment reflects the actual exit code and, where `Verify` assertions ran, the same expected-vs-actual evidence you would see locally.

If you would rather keep the exit code as your only gate and skip the comment (some teams prefer a quieter PR timeline and rely purely on the required-check UI), set `comment: false` in the `with:` block. You still get the JUnit and NDJSON artifacts either way.

## Sharding Your Suite Across Matrix Jobs

A suite of a handful of tests runs fine as a single job. A suite of forty tests, each driving a real browser through several steps, adds up fast if it all runs sequentially in one runner. This is where sharding pays off, splitting the suite across parallel matrix jobs so wall-clock CI time stays flat as the suite grows.

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

The shard split is computed deterministically from sorted discovery order of the test files, so four separate runners, each spun up independently with no shared state, agree on exactly which tests belong to which shard without any coordination step. That keeps shard timing predictable run to run and makes it easy to spot a shard that has drifted slow.

If you are running the CLI directly outside the action wrapper (say, in a custom script step, or locally to debug a specific shard's behavior before pushing), the same flag works standalone:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2
```

One practical note: sharding splits by test file count, not estimated runtime. If one test is dramatically slower than the rest, that shard finishes later even with an even split. Keep individual test files reasonably scoped and this rarely becomes a real problem.

## Setting a Budget Hard Stop with budget-usd

Every `run_end` event in BrowserBash carries a `cost_usd` estimate, computed from a bundled per-model price table. Models the table does not recognize get no estimate rather than a fabricated one, which matters if you are experimenting with a newer model id the table has not caught up with yet. In CI, where a suite runs unattended on every push, that per-test estimate rolls up into something more useful: a hard spending ceiling for the whole run.

```yaml
      - uses: PramodDutta/browserbash@main
        with:
          tests: .browserbash/tests
          budget-usd: '2.00'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Once the running total crosses the ceiling, `run-all` stops launching new tests. Anything not yet started gets reported as `skipped`, not silently dropped, so the PR comment and JUnit output both show exactly which tests never ran. The suite exits with code 2 (infra/budget stop, distinct from a normal test failure), and the spend total lands in both `RunAll-Result.md` and the JUnit `<properties>` block.

This is worth setting even on suites you are not worried about cost for, since it doubles as a circuit breaker against a misbehaving prompt burning through API calls unattended overnight. A budget stop is a better failure mode than an Actions bill that surprises you at the end of the month.

The equivalent CLI flag if you want to test the behavior locally before wiring it into CI:

```bash
browserbash run-all .browserbash/tests --budget-usd 2.50
```

You can also cap by token count instead of dollars with `--budget-tokens`, useful if you are on a provider whose per-token pricing is not yet in the bundled price table and want the hard stop without relying on a cost estimate at all.

### Combining Budget and Sharding Correctly

One thing that catches teams by surprise: `budget-usd` is scoped per job, not per suite. If you shard across four matrix jobs and set `budget-usd: '2.00'` on each, you are actually authorizing up to eight dollars total, not two. Either divide your intended total suite budget by the shard count, or accept that sharding trades a lower per-job ceiling for faster wall-clock time at a higher aggregate spend cap, just decide on purpose rather than by accident.

## Reading the Artifacts: JUnit, NDJSON, and Result.md

The PR comment is the fast read for a human reviewer, but the artifacts are what feed the rest of your CI tooling. The action uploads three things on every run:

- **JUnit XML** (`browserbash-out/junit.xml`): the format basically every CI dashboard and flaky-test tracker already knows how to parse. Point your existing JUnit ingestion at this file and BrowserBash slots into whatever reporting pipeline you already have.
- **The merged NDJSON event stream**: one JSON object per line, `step` and `run_end` events for every test. Same schema as `browserbash run --agent` locally, and new fields are always additive, so nothing parsing this today breaks later.
- **Per-test Result.md files**: the human-readable writeup, including the assertion table for any `Verify` steps that ran deterministically. Open this when a test fails and you want the expected-vs-actual detail without wading through raw NDJSON.

Downloading these from a failed run and diffing against the last known-good run is often faster than reproducing locally, especially for anything provider-specific that would not show up on your local Chrome anyway.

## Handling Auth and Secrets in CI

Most real test suites need to log in before they can check anything interesting, and re-authenticating on every single test run adds both time and flakiness (login forms are exactly the kind of UI that changes and breaks brittle flows). BrowserBash's saved-login feature helps here even inside CI. You still generate the saved session once, interactively, outside of CI:

```bash
browserbash auth save staging-user --url https://staging.example.com/login
```

That opens a browser, you log in by hand, hit Enter, and it saves a Playwright storageState profile under `~/.browserbash/`. Reference it in a test file's frontmatter or via `--auth staging-user` on the run command. Credentials themselves belong in Actions secrets, referenced as `{{variables}}` in your test files with a secret-typed values file, never hardcoded into a `*_test.md`. Marked-secret variables are masked as `*****` in every log line and NDJSON event, which matters once your run logs are sitting in a public or semi-public Actions history.

If a saved auth profile does not cover the origin your test starts on, BrowserBash prints a warning rather than silently failing to log in.

## Going Further: testmd v2 and Migrating Existing Tests

Once the basic action is running green on every PR, two adjacent features round out a real CI setup. If part of your suite needs to seed data through an API before checking it through the UI, add `version: 2` frontmatter to a test file and mix deterministic API steps with UI steps in the same run:

```
---
version: 2
---
# Seed and verify an order

- API: POST {{BASE_URL}}/api/orders with body {"sku": "widget-1", "qty": 2}
  Expect status 201, store $.id as 'orderId'
- Go to {{BASE_URL}}/orders/{{orderId}}
- Verify the "Order Confirmed" heading is visible
```

The API step never touches a model at all, it is a plain HTTP call with a status and JSON-path assertion, which makes it fast and free to run on every push. Note testmd v2 currently drives the builtin engine (needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway), it does not yet run directly on Ollama or OpenRouter.

If you are migrating an existing Playwright suite rather than starting from scratch, `browserbash import` converts specs heuristically, no model involved, fully deterministic. Anything it cannot translate lands in an `IMPORT-REPORT.md` file instead of being silently dropped, so you always know what still needs a manual pass. Also worth knowing about once the action is stable: `browserbash monitor <test> --every 10m --notify <webhook>` runs the same suite on a schedule outside of PR gating and alerts only on pass-to-fail or fail-to-pass state changes, useful for catching a production regression between deploys rather than only at merge time.

## When to Choose This Action, and When Not To

The GitHub Action is a good fit if you already have (or are willing to write) a handful of `*_test.md` files that check real user-facing flows, and you want those checks running automatically on every pull request without maintaining a Playwright test harness by hand. It is a particularly strong fit for teams whose PRs are increasingly opened by AI coding agents, where a plain-English behavioral check catches regressions a code-only review would miss.

It is a weaker fit if your team already has a mature, fast, deterministic Playwright or Cypress suite covering the same flows and nobody is asking for natural-language authoring. BrowserBash is not trying to replace a well-maintained existing E2E suite, it is aimed at the gap where writing and maintaining selector-based tests is the bottleneck, or where an AI agent needs a way to self-verify its own changes without a human writing test code for it first. If your team's pain point is raw test speed at massive scale rather than authoring friction, a hand-tuned Playwright suite run directly (with no LLM in the loop at all) will usually be faster and cheaper per run.

## Troubleshooting Common CI Failures

A short list of the failures that show up most often in the first week a team adopts this action:

**The job fails immediately with a browser launch error.** Almost always a missing `browser-actions/setup-chrome@v1` step (or equivalent) before the BrowserBash action. The `local` provider needs an actual Chrome binary on the runner.

**Tests pass locally but time out in CI.** GitHub-hosted runners are meaningfully slower and have less available memory than most developer laptops. Bump the `timeout` input before assuming the test itself is broken, and check whether concurrency (auto-detected from CPU and memory) is running more tests in parallel than the runner can comfortably handle.

**The PR comment never appears.** Check that `pull-requests: write` is actually set in the job's `permissions:` block. This is the single most common setup mistake, the run itself still succeeds or fails correctly, the comment step just silently has nothing to work with.

**Exit code 2 with tests reported as skipped.** That is the budget-usd hard stop doing its job, not a bug. Either the suite genuinely got more expensive (a model change, a longer flow added), or your per-shard budget math needs revisiting per the sharding section above.

Once your test suite is green locally with `browserbash run-all .browserbash/tests`, wiring in the action itself is a short job from there: add the workflow YAML above, set `ANTHROPIC_API_KEY` as a repo secret, grant `pull-requests: write`, and push. The PR comment, the JUnit artifacts, and the budget stop are all live without any further configuration. If you want to see the underlying CLI behavior before committing to the CI wiring, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections walk through writing your first `*_test.md` file end to end, and the [case studies](https://browserbash.com/case-study) page has examples of how other teams structured their suites.

## FAQ

### Does the BrowserBash GitHub Action require a paid account?

No. The action, the CLI, and every feature described in this guide, sharding, the budget-usd stop, Verify assertions, the PR comment, are free and open-source. You need a model API key (Anthropic, OpenAI, or OpenRouter) since GitHub-hosted runners cannot reach a local Ollama daemon, but that is a cost from the model provider, not from BrowserBash.

### How is the browserbash-action different from just running the CLI in a shell step?

You could install the CLI with `npm install -g browserbash-cli` and call `browserbash run-all` directly in a plain run step, and the exit code would still gate the job correctly. The dedicated action adds the parts that take real effort to build yourself: the self-updating PR comment, standardized artifact upload for JUnit, NDJSON, and Result.md, and typed inputs for sharding and budget instead of hand-assembled flag strings.

### Can I use the GitHub Action with a device farm like LambdaTest or BrowserStack instead of local Chrome?

Yes, set the provider input to lambdatest or browserstack and supply the corresponding grid credentials as secrets. Grid providers cannot run the default Stagehand engine, BrowserBash automatically switches to the builtin engine for those providers, which still requires ANTHROPIC_API_KEY to be set even though the browser session itself runs remotely.

### What happens if my suite hits the budget-usd limit halfway through?

The suite stops launching new tests once the running cost estimate crosses the ceiling you set. Tests that already started finish normally, whatever has not started yet is marked skipped instead of being dropped or hidden, the job exits with code 2, and the total spend is recorded in both the JUnit properties and the Result.md output so you can see exactly what happened.

Ready to try it. Install the CLI with `npm install -g browserbash-cli`, write your first `*_test.md`, and once it is green locally, drop the workflow above into `.github/workflows/`. An account is optional, sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) only if you want the free cloud dashboard for shared run history across your team.
