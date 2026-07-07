# BrowserBash GitHub Action

Run your plain-English browser tests on every PR and get the verdict as a PR comment. The suite's exit code is the job verdict: `0` passed, `1` failed, `2` infra/budget stop, `3` timeout.

## Quick start

```yaml
name: browser-tests
on: pull_request

permissions:
  contents: read
  pull-requests: write   # for the verdict comment

jobs:
  browserbash:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-chrome@v1   # the local provider drives Chrome stable
      - uses: PramodDutta/browserbash@main
        with:
          tests: .browserbash/tests
          timeout: '180'
          budget-usd: '2.00'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Cloud grid instead of local Chrome

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

## Sharding across parallel jobs

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

The shard split is deterministic (sorted discovery order), so the four machines agree on the partition without coordination.

## Inputs

| Input | Default | What |
|---|---|---|
| `tests` | `.browserbash/tests` | Directory (or one file) of `*_test.md` |
| `provider` | `local` | `local`, `cdp`, `browserbase`, `lambdatest`, `browserstack` |
| `model` | auto | Model id; auto resolves from env keys |
| `timeout` | `300` | Per-test timeout (seconds) |
| `concurrency` | auto | Max parallel tests (auto = CPU + memory aware) |
| `shard` | none | Deterministic slice, e.g. `2/4` |
| `budget-usd` | none | Hard spend stop: remaining tests reported skipped, exit 2 |
| `version` | `latest` | browserbash-cli version to install |
| `comment` | `true` | Post/refresh the PR verdict comment |

## What you get

- **Exit code as verdict** — no output parsing, branch protection just works.
- **PR comment** with the suite table (pass/fail/timeout/skipped/flaky per test), refreshed in place on every push.
- **Artifacts**: JUnit XML (`browserbash-out/junit.xml`), the merged NDJSON event stream, per-test Result.md files.
- **Secrets stay secret**: put credentials in Actions secrets, pass them as `{{variables}}` files in your repo with `"secret": true` values, and they are masked in every log line and event.
