---
title: Data-Driven AI Browser Tests With CSV and Variables
description: "Run data-driven browser tests in BrowserBash by feeding one markdown test many CSV rows through {{variables}}, with masked secrets and a CI loop pattern."
date: 2026-06-27
category: guide
---

To run **data-driven browser tests** in BrowserBash, you keep one markdown test that describes the flow in plain English, mark the parts that change as `{{variables}}`, and then run that same file once per row of input. The rows live in a CSV (or a set of environment variables), a small shell loop reads each row, exports its columns as variables, and invokes `browserbash testmd run` against the unchanged test file. Each row produces its own browser session, its own verdict, and its own NDJSON result, so testing signup with ten account types is the same test executed ten times with ten sets of values. This guide shows the exact loop, how to mask sensitive columns like passwords, how to wire it into CI, and where the approach honestly stops scaling.

The core idea is older than AI testing: separate the *what* of a test from the *data* it runs against. What is new is that BrowserBash lets the "what" be an intent written in English instead of a script bound to selectors, which means the same data-driven loop survives a redesign of the page it drives. BrowserBash is a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) natural-language browser automation CLI from The Testing Academy. Install it with `npm install -g browserbash-cli`. Every command below is real and runnable.

## What "data-driven" means with an intent-based test

In a classic data-driven framework you have one test method and a table of inputs. The method runs once per row, swapping in that row's values. The point is coverage without copy-paste: you do not write `testSignupAsAdmin`, `testSignupAsViewer`, and `testSignupAsBilling` as three near-identical functions; you write one `testSignup(accountType)` and feed it three rows.

BrowserBash keeps that structure but changes two things. First, the test is a markdown file that reads as a list of plain-English steps, not a method full of `page.click()` calls. Second, the agent finds elements by reading the live page (roles, accessible names, states from the accessibility tree, plus the DOM) rather than matching CSS selectors, so the same row of data drives the same intent even after the form moves. If you have not seen the markdown format yet, the [markdown test files tutorial](https://browserbash.com/blog/markdown-test-files-tutorial) walks through it from scratch.

The data itself enters through `{{variables}}`. Any token like `{{email}}` or `{{accountType}}` in the test gets substituted at run time from a value you supply. Supply different values per run and you have a data-driven loop. The full mechanics of templating and secret-marking are covered in the [variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial); this guide assumes the basics and focuses on driving many rows.

## A single parametrized signup test

Start with one test file that describes signup once and leaves the row-specific parts as variables. Call it `signup_test.md`.

```markdown
# Signup smoke test

Variables:
- baseUrl: https://app.example.com
- email: {{email}}
- password: {{password}}
- accountType: {{accountType}}

1. Go to {{baseUrl}}/signup
2. Enter {{email}} into the email field
3. Type {{password}} into both the password and confirm-password fields
4. In the "Account type" dropdown, choose {{accountType}}
5. Accept the terms checkbox and click Create account
6. Confirm the page shows "Verify your email" or an onboarding step
7. Confirm the welcome screen reflects the {{accountType}} plan
```

Notice there is not a single selector here. Step 4 says "the Account type dropdown" and lets the agent find it by its accessible name; step 7 states an outcome to verify rather than an element to click. That matters for data-driven runs because your rows will vary the account type, and the agent reads whatever option list the page actually renders for each value. If you want a deeper walk-through of testing registration specifically, see [automate signup flow testing](https://browserbash.com/blog/automate-signup-flow-testing).

You can run this once by hand to prove it works before you loop:

```bash
browserbash testmd run ./signup_test.md \
  --var email="qa+admin@example.com" \
  --var password="Str0ng-Pass!42" \
  --var accountType="Admin"
```

That single invocation is the atom. Everything that follows is just calling this atom once per row of a CSV, with the values swapped.

## The CSV loop pattern

Put your rows in a CSV. Keep the header names identical to the variable names in the test so the mapping is obvious.

```csv
email,password,accountType
qa+admin@example.com,Str0ng-Pass!42,Admin
qa+viewer@example.com,V13w-Only!7,Viewer
qa+billing@example.com,B1ll-Me!99,Billing
qa+trial@example.com,Tr14l-Run!3,Trial
```

A plain shell loop reads the file, skips the header, splits each line on commas, and runs the test once per row. This is intentionally low-tech: no test runner, no framework, just a process per row.

```bash
#!/usr/bin/env bash
set -euo pipefail

CSV="accounts.csv"
PASS=0
FAIL=0

# Skip the header line, then read each row.
tail -n +2 "$CSV" | while IFS=, read -r email password accountType; do
  echo "=== Running signup for: $accountType ($email) ==="

  if browserbash testmd run ./signup_test.md \
       --var email="$email" \
       --var password="$password" \
       --var accountType="$accountType" \
       --headless; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "ROW FAILED: $accountType"
  fi
done

echo "Passed: $PASS  Failed: $FAIL"
```

Each iteration is a fresh `browserbash testmd run` process. It launches its own browser, drives the agent through the seven steps with that row's values, writes its own `Result.md`, and exits with a code. Exit `0` means the row passed; non-zero means it did not. Because the unit of work is a whole OS process, one bad row cannot corrupt another. A crash on the "Billing" row leaves the "Trial" row untouched.

If you would rather not hand-write the parser, `csvkit`'s `csvcut` or a two-line Python reader can feed the same loop. The shape does not change: read row, export columns as `--var` flags, run the file.

### Driving from environment variables instead

Sometimes the data is not a file you own but values already in the environment, for example a CI secret store or a `.env` per stage. BrowserBash reads variables from the process environment too, so you can drop the `--var` flags entirely when the names line up:

```bash
export email="qa+admin@example.com"
export password="Str0ng-Pass!42"
export accountType="Admin"

browserbash testmd run ./signup_test.md --headless
```

This is handy when one stage of a pipeline only ever tests one account type, and you want the same `signup_test.md` reused across stages with different injected environments. The test file never changes; only what surrounds it does.

## Masking sensitive columns

A CSV of signup data almost always has a password column, and sometimes an API token or a card number for billing rows. You do not want those values printed in your terminal, your CI log, or the on-disk run store. BrowserBash masks any variable you mark as a secret, rendering it as `*****` everywhere it would otherwise appear.

Mark the secret columns explicitly when you run. The value is still used to fill the form; it is only the *display* that gets masked.

```bash
browserbash testmd run ./signup_test.md \
  --var email="$email" \
  --secret password="$password" \
  --var accountType="$accountType" \
  --headless
```

With `--secret password=...`, the agent still types the real password into both fields, but every log line, the NDJSON event stream, and the written `Result.md` show `*****` in place of the characters. In a data-driven run this matters more than in a one-off, because a loop over fifty rows prints fifty times as many opportunities to leak a credential into scrollback or a build artifact.

A practical tip for the CSV itself: if the file contains real secrets, do not commit it. Keep a committed `accounts.example.csv` with fake values for documentation, add the real `accounts.csv` to `.gitignore`, and generate or fetch it at run time from your secret store. The masking protects the logs; `.gitignore` protects the repo. You want both. The credential-handling rationale in more depth lives on the [features page](https://browserbash.com/features).

## Wiring the loop into CI

In CI the loop is the same, with three additions: run headless, capture each row's machine-readable result, and decide a job-level pass or fail from the collection. BrowserBash's `--agent` flag emits NDJSON (one JSON object per line) so you can aggregate verdicts without scraping human text. Exit codes are stable: `0` pass, `1` fail, `2` error, `3` timeout.

Here is a GitHub Actions step that runs the CSV loop and fails the job if any row failed:

```yaml
name: data-driven-signup
on: [push]

jobs:
  signup-matrix:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install BrowserBash
        run: npm install -g browserbash-cli

      - name: Run signup across all account types
        run: |
          fail=0
          tail -n +2 accounts.csv | while IFS=, read -r email password accountType; do
            echo "::group::$accountType"
            browserbash testmd run ./signup_test.md \
              --var email="$email" \
              --secret password="$password" \
              --var accountType="$accountType" \
              --agent --headless \
              >> "results-$accountType.ndjson" || fail=1
            echo "::endgroup::"
          done
          exit $fail
```

Each row appends its NDJSON to a per-account file, so you finish the job with one artifact per account type that a later step can parse, summarize, or upload. Add `--record` if you want a webm video and screenshots for each row to debug a failure after the fact. The deeper CI mechanics, including matrix fan-out and `xargs -P` packing, are in [run 100 browser tests in parallel](https://browserbash.com/blog/run-100-browser-tests-in-parallel); the data-driven loop here is complementary to that, and the two compose.

### Sequential rows versus a CI matrix

The shell loop above runs rows one after another in a single job. That is the right default for a handful of account types: it is simple, the logs are linear, and you do not multiply your model-inference cost across machines. When your row count grows past what one job can finish in your time budget, promote the CSV into a CI matrix so each row (or each shard of rows) lands on its own runner and they execute concurrently. The test file and the variable contract stay identical; only the orchestration around them changes.

## Composing data-driven tests with @import

Real signup suites are not one file. You usually log in, then do something as that account. BrowserBash supports `@import` so you can compose a shared flow into many tests without duplicating steps. A data-driven run benefits from this directly: write the login once, import it, and let the variables flow through.

```markdown
# Create a project as a given account type

@import ./signup_test.md

1. From the dashboard, click "New project"
2. Name it "{{accountType}}-smoke"
3. Confirm the project appears in the project list
```

When the loop sets `{{accountType}}` per row, both the imported signup steps and the project-creation steps see the same value. You get end-to-end coverage per account type from one composed file plus one CSV. The import keeps the shared part DRY; the variables keep the rows distinct.

## Honest limits

Data-driven AI browser tests are genuinely useful, but they are not free of trade-offs, and pretending otherwise helps no one.

**Each row costs a real browser session and real model inference.** Unlike a unit test where a thousand rows are cheap, every row here drives a live browser through an agent loop that calls a model on each step. Ten account types are fine. A CSV with ten thousand rows is not a data-driven test, it is a load test you did not mean to write, and the bottleneck will be model throughput and RAM long before BrowserBash itself. Keep data-driven suites focused on *distinct behaviors* (account types, locales, plan tiers, edge-case inputs), not on brute-force volume. If you need volume, that is a different tool.

**Small local models get flaky on long, multi-step rows.** The default model resolution is `auto`: it prefers a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (which has free models). Local means nothing leaves your machine, which is great for a CSV full of real test credentials. But models at or below roughly 8B parameters tend to lose the thread on long flows, and a data-driven row that is login plus signup plus project creation is a long flow. For hard multi-step rows, use a 70B-class local model (Qwen3, Llama 3.3) or a hosted model. The [learn page](https://browserbash.com/learn) covers picking a model.

**Parallel rows are bounded by resources, not by the tool.** You can run rows concurrently, but each concurrent row is another browser plus another inference stream. On a laptop, three or four concurrent rows is realistic; past that you contend for RAM and your model backend's rate limit. The honest ceiling on parallel data volume is your hardware and your model quota, and no amount of CSV cleverness changes that.

**Non-determinism is real and you should design for it.** An agent reading a live page can occasionally make a different choice than it did last run, especially on ambiguous UI. For data-driven runs this shows up as a row that passes four times and flakes once. Auto-wait (Playwright's built-in waiting, with a 15-second ceiling and no manual sleeps) removes the *timing* class of flake, but it does not make the model deterministic. Treat a single red row as a signal to look, not as proof of a product bug, and keep your objectives specific enough that the agent has one obvious path.

**CSV parsing in pure shell is fragile.** The `IFS=,` loop shown above breaks on values that contain commas, quotes, or newlines, for example a display name like `"Doe, John"`. For anything beyond simple columns, parse the CSV with `csvkit` or a short Python reader and feed clean values into the run. Do not push shell string-splitting further than it wants to go.

## FAQ

### How do I feed a CSV into a BrowserBash test?

Keep one markdown test with `{{variables}}` for the parts that change, name your CSV columns to match those variables, then loop over the CSV in a shell script. For each row, pass the columns as `--var name=value` flags (or `--secret name=value` for sensitive ones) to `browserbash testmd run ./file_test.md`. Each row is an independent run with its own browser, verdict, and result file. BrowserBash does not parse CSV itself; the loop does, which keeps the test file clean and tool-agnostic.

### Can I mask passwords and tokens from a CSV column?

Yes. Pass the sensitive column with `--secret name=value` instead of `--var name=value`. The real value is still typed into the page, but it renders as `*****` in every log line, in the NDJSON `--agent` stream, and in the on-disk `Result.md`. Combine that with adding the real CSV to `.gitignore` and committing only an example file with fake values, so secrets stay out of both your logs and your repository.

### How many rows can I run in parallel?

That depends on your hardware and model backend, not on BrowserBash. Each row is a full browser session plus a model-inference stream, so concurrency is bounded by RAM and your model's rate limit. On a typical laptop, expect three or four concurrent rows before contention; in CI, fan rows out across runners with a matrix so each gets its own box. These numbers are illustrative, not benchmarked, so measure on your own setup before committing to a row count.

### Do data-driven tests still work after the page is redesigned?

Generally yes, because the agent finds elements by reading the live page (accessibility roles, accessible names, states) rather than by matching cached CSS selectors. It re-derives what to click from the rendered page on every run, so a moved field or renamed button usually still resolves. This is re-derivation from live state, not a saved script that patches itself. It is not magic: if a redesign removes the concept your row depends on (say, account types disappear), the row will correctly fail because the intent can no longer be satisfied.

## Wrapping up

Data-driven testing in BrowserBash is deliberately boring in the best way: one intent-based markdown test, `{{variables}}` for the parts that vary, a CSV or environment supplying rows, and a shell loop running the same file once per row. Secrets get masked with `--secret`, CI aggregates per-row NDJSON and exit codes, and `@import` keeps shared flows out of every file. The intent-based core is what makes it durable, because the same loop survives the page redesigns that would break a selector-bound data table. Keep the rows focused on distinct behaviors, respect the resource ceiling on parallel volume, and reach for a larger model when the rows get long. Within those limits, you get broad coverage of account types, locales, and plan tiers from one small file and a handful of lines of shell.
