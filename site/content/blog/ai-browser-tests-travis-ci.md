---
title: Run AI Browser Tests on Travis CI
description: "Run ai browser tests travis ci with BrowserBash CLI, masked secrets, NDJSON verdicts, JUnit reports, budget controls, and exit-code gates."
date: 2026-08-26
category: ci
---

ai browser tests travis ci should behave like any other release gate: visible, repeatable, and strict about the process exit code. The practical setup is a Travis CI job that installs BrowserBash, runs committed Markdown tests, captures NDJSON, stores reports, and exits with the original verdict. BrowserBash is a free, open-source, Apache-2.0 natural-language browser automation CLI by The Testing Academy, founded by Pramod Dutta. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step, and the run returns a deterministic verdict plus structured results.

The CLI installs with `npm install -g browserbash-cli`, runs as `browserbash`, and the current version for this guide is 1.5.1. BrowserBash is the open-source validation layer for AI agents, but it is just as useful for human-owned CI. It removes selectors and page objects from the highest-level checks, emits NDJSON with `--agent`, and gives Travis CI an exit code it can trust. The package is on [npm](https://www.npmjs.com/package/browserbash-cli), and the broader capability set is summarized on the [BrowserBash features page](https://browserbash.com/features).

## Why ai browser tests travis ci belong in CI

Browser checks are most valuable when they catch failures that lower-level tests cannot see. A login page can compile and still reject every user. A dashboard can load and still hide the billing link. A checkout flow can pass API tests while the browser gets stuck behind a disabled button. Those are the cases where ai browser tests travis ci earn their place in the pipeline.

Traditional browser suites often fail for a different reason: the selector changed. A renamed class, a moved button, or a component rewrite can make the test red even when the user journey still works. BrowserBash takes a different path. It asks the agent to pursue the outcome in plain English, then reports whether the condition was met. You still need discipline, but you do not have to encode every click as a brittle DOM contract.

For Travis CI, the important contract is simple. The command exits 0 when validation passed, 1 when validation failed, 2 for an error, infrastructure issue, or budget stop, and 3 for timeout. That maps cleanly to CI. Do not parse a paragraph to decide whether the build is green. Let BrowserBash produce the status, then let Travis CI enforce it.

This does not replace unit tests, API contract tests, accessibility checks, or a strong Playwright suite. It complements them. Use BrowserBash when the risk is user-visible and the intent is easier to describe than the selector chain. Keep deterministic lower-level tests where code is cheaper and more precise.

## BrowserBash facts to pin before YAML

BrowserBash is Ollama-FIRST. With automatic model resolution, it looks for local Ollama first, then ANTHROPIC_API_KEY, then OPENAI_API_KEY, then OpenRouter. Local Ollama means free local models, no API keys, and nothing leaves your machine. In a managed CI runner, you will often choose a hosted model because the runner does not have enough hardware for a capable local model. BrowserBash supports Anthropic Claude and OpenRouter when you bring your own key.

Be honest about model quality. Very small local models, roughly 8B and under, can be flaky on long multi-step objectives. They can work for short smoke checks, but they may lose context during a checkout, admin workflow, or complex onboarding flow. The sweet spot is a mid-size local model, such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model for hard flows.

Markdown tests are the format you want in CI. A `*_test.md` file is committable, reviewable, and supports `@import` composition plus `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line. BrowserBash writes a human-readable `Result.md` after each run, and `run-all` can produce suite-level results and JUnit data.

Agent mode matters because it emits one JSON event per line on stdout. The final `run_end` event includes status, summary, final_state, assertions, cost_usd, and duration_ms. Unknown models get no cost estimate rather than a wrong one. That is the kind of predictable output CI systems and AI coding agents can consume without prose parsing.

## Complete .travis.yml for ai browser tests travis ci

Start with a suite command, not a one-off prompt inside the CI file. The CI file should orchestrate the run, while the test files describe the product behavior. The example below installs BrowserBash, runs `run-all tests`, captures NDJSON, gathers result files, and exits with the original status so Travis CI can gate correctly.

```yaml
language: node_js
node_js:
  - '20'
dist: jammy
addons:
  apt:
    packages:
      - chromium-browser
install:
  - npm install -g browserbash-cli
script:
  - |
    mkdir -p browserbash-artifacts
    set +e
    browserbash run-all tests \
      --agent \
      --budget-usd 2.50 \
      --matrix-viewport 1280x720,390x844 \
      2>&1 | tee browserbash-artifacts/browserbash.ndjson
    status=$?
    find . -name 'RunAll-Result.md' -o -name 'Result.md' -o -name '*.xml' | \
      while read file; do cp "$file" browserbash-artifacts/ 2>/dev/null || true; done
    exit $status
```

The wrapper is there for a reason. If the BrowserBash command fails and the shell exits immediately, you lose reports. If cleanup commands run and the script exits 0, you lose the real verdict. The pattern is to disable immediate exit, run BrowserBash, store `$?`, collect artifacts, then `exit $status`.

The suite uses `--budget-usd 2.50` so cost control is part of the command. BrowserBash 1.5.0 added cost governance: `run_end` carries an estimated `cost_usd` from a bundled per-model price table, and `run-all --budget-usd` or `--budget-tokens` stops launching new tests after the suite crosses the limit. Remaining tests are reported skipped, the suite exits 2, and spend appears in `RunAll-Result.md` and JUnit properties.

The viewport matrix runs each test at 1280x720 and 390x844. BrowserBash labels those runs in events, JUnit, and results. When wall-clock time becomes the problem, add deterministic sharding with `run-all --shard 2/4` across parallel jobs. Sorted discovery order makes shards agree without coordination between CI machines.

### Install and run commands for Travis CI

Keep the first command set boring. Install the CLI, confirm the version, then run the suite in agent mode. Once the pattern is stable, bake the CLI and browser into a custom image or a prepared runner.

```bash
npm install -g browserbash-cli
browserbash --version
browserbash run-all tests --agent --budget-usd 2.50 --matrix-viewport 1280x720,390x844
```

A single smoke objective is also valid during setup: `browserbash run "open the staging homepage and confirm the pricing link is visible" --agent`. Move that into a Markdown test once it becomes part of a merge gate. Reviewable files are easier to own than prompts hidden in YAML.

BrowserBash also has an MCP server added in 1.5.0. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio and exposes `run_objective`, `run_test_file`, and `run_suite`. A failed test is a successful validation call: the tool call succeeds and the agent reads the verdict. The same test suite can therefore serve ai browser tests travis ci and local AI-agent verification. For more patterns, use the [BrowserBash learning hub](https://browserbash.com/learn).

## Secrets, masked variables, and saved logins

In Travis CI, use repository environment variables for model keys, app credentials, staging URLs, and test users. The repository should contain references to secrets, not secret values. Use private environment variables, pass values as environment variables, and use BrowserBash templating for test inputs. Secret-marked variables are masked in every BrowserBash log line.

Saved logins reduce repeated auth work. `browserbash auth save <name> --url <login-url>` opens a browser, lets you log in once, and saves the session as Playwright storageState when you press Enter. Reuse it with `--auth <name>` on run, testmd, run-all, or monitor, or with `auth:` frontmatter in a test file. If the saved origins do not cover the target start URL, BrowserBash warns instead of silently doing nothing.

For pull requests from forks, be stricter. Many CI systems do not expose secrets to untrusted forks. Run unauthenticated smoke tests there, and reserve authenticated ai browser tests travis ci for trusted branches, internal PRs, or manually approved jobs. That policy keeps the validation useful without turning the CI log into a credential risk.

## NDJSON, exit codes, and deterministic verdicts

Travis CI should gate on the BrowserBash process status. The distinction between codes is useful during triage. Code 1 means the browser ran and the objective was not met. Code 2 points to infrastructure, configuration, or budget stop. Code 3 means timeout. Most teams should fail the gate for all three, but the owner and next action differ.

NDJSON is the right format for follow-up automation. A bot can read `run_end.status`, show `summary`, inspect `assertions`, and include `duration_ms` in a comment. A human can read `Result.md`. Travis CI can use the process status. Those three surfaces should agree.

BrowserBash deterministic Verify assertions make the verdict stronger where plain English is not enough. In testmd v2, `Verify` steps compile to real Playwright checks for URL, title, visible text, named buttons, links, headings, element counts, and stored values. Lines outside the grammar still run as agent-judged checks and are flagged `judged: true`, so you can separate deterministic assertions from judgment calls.

## Deterministic checks with testmd v2

Add `version: 2` frontmatter to a `*_test.md` file and BrowserBash executes steps one at a time against a single browser session. API steps and Verify steps never touch a model. Consecutive plain-English steps run as grouped agent blocks on the same page.

```bash
cat > tests/billing_test.md <<'EOF'
---
version: 2
auth: staging-admin
---

POST {{BASE_URL}}/api/test/customers with body {"plan":"pro"}
Expect status 201, store $.email as 'customerEmail'

Open {{BASE_URL}}/admin/customers
Search for {{customerEmail}}

Verify text "Pro" visible
Verify 'Edit customer' button visible
EOF
browserbash run tests/billing_test.md --agent
```

This is useful when the setup is mechanical but the user journey still matters. Seed a customer through an API, then confirm the UI shows the right plan. A failed deterministic Verify step includes expected-versus-actual evidence in `run_end.assertions` and the `Result.md` assertion table.

The caveat is important for ai browser tests travis ci. testmd v2 currently drives the builtin engine and needs ANTHROPIC_API_KEY or an ANTHROPIC_BASE_URL compatible gateway. It does not yet run on Ollama or OpenRouter directly. If your CI job is local-Ollama-only, keep v2 tests in a separate job or use v1 Markdown files until your engine setup supports v2.

## Reports, JUnit, and artifacts in Travis CI

Use your existing artifact or deployment mechanism. A good report set has three layers. The NDJSON stream is for machines and agents. `Result.md` and `RunAll-Result.md` are for humans. JUnit XML is for the CI test-report surface where available.

Do not make the first version too clever. Gather `Result.md`, `RunAll-Result.md`, XML files, and the NDJSON file into one directory. Once your repository settles on a consistent output layout, simplify the collector. The goal is to preserve enough evidence to debug a failed browser flow without rerunning the whole suite.

The BrowserBash GitHub Action follows the same idea: it installs the CLI, runs the suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs and budgets, and posts a self-updating PR comment with a verdict table. Even outside GitHub Actions, the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) is a useful reference for what artifacts belong in a CI run.

## Operational guardrails for ai browser tests travis ci

Treat each BrowserBash test as a product contract. The objective should name the result the user must see, not a private implementation detail. Good tests say the customer can open billing and see the active plan. Weak tests say to click the third item in a side menu. The first survives a layout cleanup. The second is just a selector hidden in English.

Keep test data explicit. If the target environment needs a user, project, invoice, or cart, create it through an API step or a known fixture. Do not depend on whatever happened to exist in staging yesterday. BrowserBash v2 API steps are a good fit for this when the builtin engine is available. For simpler suites, put setup in your app's normal seed command before the browser run.

Use the recorder and importer as accelerators, not as authority. `browserbash record <url>` opens a visible browser, lets you click through once, and writes a plain-English test when you stop. Password fields never leave the page; the generated step reads `Type {{password}} into ...`. `browserbash import <specs-or-dir>` converts Playwright specs heuristically and writes anything untranslatable to `IMPORT-REPORT.md` instead of inventing behavior. Review the output before it becomes a gate.

Decide what happens when a preview URL is missing. A browser test cannot validate a deployment that was never created. If Travis CI builds preview apps asynchronously, make the BrowserBash job wait for a healthy URL before it starts, or skip the job with a clear infrastructure status. Do not let the agent spend tokens refreshing a 404 page.

Keep each objective small enough that a human could execute it without losing the thread. If a single test covers login, settings, billing, reports, export, and logout, split it. Smaller checks produce clearer failures, better replay-cache hits, and faster reruns. They also make model choice easier because a mid-size local model or a cheaper hosted execution model has less context to hold.

Name the environment in the test variables and artifacts. When a reviewer opens a failed run later, they should see whether it targeted staging, preview, or production smoke checks without reconstructing the pipeline context from memory.

Finally, decide who owns failures. A failed test is a successful validation that found a mismatch. The owner should know whether to fix the product, adjust the test data, split a long objective, or move a deterministic check into Verify syntax. Without that ownership, Travis CI will collect artifacts but the team will still argue about whether red means real.

## Scaling ai browser tests travis ci without wasting budget

Start with one or two business-critical flows. Login, signup, checkout, billing, search, and admin access are better first candidates than a long tour of every page. Long objectives cost more, run slower, and stress weaker models. Short, well-owned tests are easier to trust.

Use the replay cache to keep stable green runs cheap. A green run records its actions; the next identical run can replay them with zero model calls, and the agent steps back in only when the page changed. Pair this with cost budgets and, when useful, cheap-model routing through `--model-exec`: plan on a strong model and execute on a cheaper one.

Monitor mode is separate from CI but useful for production checks. `browserbash monitor <test|objective> --every 10m --notify <webhook>` runs on an interval and alerts only when state changes from pass to fail or fail to pass. Slack incoming-webhook URLs get Slack formatting automatically; other URLs receive raw JSON.

## When to choose this CI pattern

Choose this setup when the repository already depends on Travis. BrowserBash is a good fit when the risk is user-visible and the expected behavior is easier to review as intent than as locator code. It is also a good fit when AI coding agents are changing UI code and need an independent browser verifier.

Choose Playwright or Selenium directly when you already have a stable suite and the flow is cheap to express in code. Deterministic code is still excellent for component-level behavior, exact interaction sequences, and heavily instrumented UI checks. Choose API tests when the browser adds no signal.

Choose MCP integration when the main consumer is an AI agent. Choose Travis CI integration when the main consumer is the delivery process. The same Markdown tests can support both paths, but the reporting surface and failure policy should match the audience. The [tutorial library](https://browserbash.com/tutorials) is a practical next stop after the first gate is passing.

## FAQ

### How do I run ai browser tests travis ci without leaking API keys?

Store model keys and application credentials in Travis CI secrets, then pass them as environment variables to the BrowserBash step. Do not echo them or commit them into Markdown files. For local Ollama runs, no API key is needed and nothing leaves the machine.

### What exit code should fail the Travis CI pipeline?

Most teams should fail the pipeline on every nonzero BrowserBash exit code. Code 1 is a failed validation, code 2 is an error or budget stop, and code 3 is timeout. You can route notifications differently, but the merge gate should stay strict.

### Can Travis CI publish BrowserBash JUnit results?

Yes, when your Travis CI setup has a JUnit reporting feature or artifact mechanism, collect the XML files from the suite run. Keep NDJSON and Markdown results too because they carry structured verdict details and readable summaries.

### Should I use local Ollama models for ai browser tests travis ci?

Use Ollama when the runner has enough hardware for a capable local model and privacy or cost control is a priority. Avoid tiny local models for long flows because they can be flaky. On small shared CI runners, a hosted model through Anthropic, OpenAI, or OpenRouter is usually steadier.

Run the first gate with `npm install -g browserbash-cli`, keep the account optional, and use the free [BrowserBash sign-up](https://browserbash.com/sign-up) only if you want the optional cloud dashboard with 15-day retention.
