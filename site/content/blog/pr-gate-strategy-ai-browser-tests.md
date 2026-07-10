---
title: A PR-Gate Strategy With AI Browser Tests
description: "Build a practical pr gate strategy ai tests can enforce with exit codes, risk tiers, deterministic checks, and useful PR verdict comments."
date: 2026-11-10
category: ci
---

A good **pr gate strategy ai tests** can support is not “run every browser journey and block on anything red.” That policy turns slow, probabilistic work into a merge queue tax. A useful gate is smaller and more deliberate: protect a few business-critical promises, use deterministic assertions for the final decision, classify infrastructure errors separately, and give reviewers enough evidence to act. BrowserBash fits this design as an open-source validation layer for AI agents. It drives a real Chrome or Chromium browser from plain-English objectives, then returns a structured verdict that CI can consume without scraping prose.

This guide develops that gate from first principles. The goal is not to make AI the authority over a pull request. The goal is to let an agent perform adaptable browser work while code, explicit checks, and a documented policy retain authority over merge. That distinction makes the resulting pipeline faster to trust and easier to debug.

## What a PR gate strategy AI tests can enforce must decide

Every merge gate answers three questions, whether the team has written the answers down or not:

1. Which product risks deserve to delay a merge?
2. Which outcomes are reliable enough to make that decision?
3. What should happen when the test system itself cannot produce an outcome?

Start with risk, not with the number of existing tests. A checkout change might need a blocking happy-path purchase, a blocking verification that an unavailable item cannot be purchased, and several nonblocking exploratory journeys. A typography change might need only a fast page-load and navigation smoke check. The same suite should not be attached indiscriminately to both pull requests.

Browser tests also have several kinds of failure. The application can violate an expected condition. The browser or provider can fail to start. A test can time out. An AI-driven navigation step can misunderstand an ambiguous instruction. Treating all four as “the PR is bad” hides useful information. BrowserBash makes the distinction visible through process exit codes and agent-mode events: 0 means passed, 1 means failed, 2 means an error, infrastructure problem, or budget stop, and 3 means timeout.

That gives you a clean policy surface. A product failure can block immediately. An infrastructure error can trigger one controlled retry and then request human review. A timeout can be nonblocking during an adoption period, then become blocking only after its cause is understood. The policy should live next to the workflow so reviewers can see why a job blocked.

## Build a small blocking tier before expanding coverage

The first blocking tier should contain tests that are important, independent, and quick enough to run on every relevant pull request. “Important” means a regression would justify stopping the merge. “Independent” means the test creates or locates its own state and does not depend on another test having run. “Quick enough” is contextual, but the total needs to fit your team’s feedback loop.

A practical three-tier model works well:

| Tier | Typical contents | Merge behavior | Run timing |
| --- | --- | --- | --- |
| Blocking smoke | Sign-in, core navigation, one primary transaction, access-control checks | Blocks on confirmed product failure | Every relevant PR |
| Advisory regression | Broader roles, secondary flows, cross-page journeys | Posts results, does not block initially | PR or post-merge |
| Scheduled exploration | Long objectives, unusual data, wide viewport coverage | Creates follow-up work | Nightly or on demand |

Do not promote a test merely because it passed several times. Promote it when its expected outcome is explicit, its data setup is controlled, and its failure has a clear owner. Conversely, demote a test that regularly produces ambiguous evidence. A flaky red gate trains engineers to rerun jobs instead of investigating them.

Path filters can keep the blocking set relevant. Changes to authentication code can run login, logout, session-expiry, and protected-page tests. Changes to catalog rendering can run search and product-detail checks. Keep a tiny universal smoke test for integration problems that cross boundaries, but avoid using path filters as a claim that dependencies are perfectly understood. A scheduled full suite remains useful.

The [BrowserBash feature overview](https://browserbash.com/features) is a useful reference when choosing capabilities, but the tier policy belongs to your repository. Tool defaults cannot know the blast radius of your product.

## Make deterministic assertions the merge authority

Natural-language navigation and deterministic validation solve different problems. An agent is useful when it needs to interpret a page, locate a control without a selector, and adapt its actions. A merge gate needs a crisp, reproducible condition at the end. BrowserBash 1.5.0 separates these responsibilities with deterministic `Verify` steps in Markdown tests.

Recognized Verify grammar compiles to real Playwright checks. It can check that a URL contains a value, a title equals or contains text, text is visible, a named button, link, or heading is visible, an element count matches, or a stored value equals an expectation. These checks do not ask a model whether the page “looks correct.” A failure includes expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table.

That boundary matters. Consider “Confirm the account dashboard is healthy.” It is readable but too broad for a gate. Does healthy mean a 200 response, a visible account heading, no error banner, or correct subscription data? Replace it with navigation intent followed by narrow conditions. If a Verify line falls outside the deterministic grammar, BrowserBash still runs it as an agent-judged assertion and flags it with `judged: true`. Your CI policy can allow such evidence in advisory tests while rejecting it as the sole basis for a blocking decision.

testmd v2 can also seed data through deterministic API steps and check the result through the UI in one browser session. API steps support GET, POST, PUT, DELETE, and PATCH, with status expectations and stored JSON-path values. Plain-English steps between them run in grouped agent blocks on the same page.

```bash
cat checkout-pr_test.md
# frontmatter: version: 2
# POST https://preview.example.test/api/carts with body {"sku":"starter"}
# Expect status 201, store $.id as 'cartId'
# Open the preview store and complete checkout for cart {{cartId}}
# Verify text 'Order confirmed' is visible

browserbash testmd checkout-pr_test.md --agent
```

The comments above illustrate file content without adding another fenced language format. In the real file, use valid YAML frontmatter and unprefixed steps. testmd v2 currently drives the builtin engine and needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run directly on Ollama or OpenRouter. If that dependency does not suit your PR environment, keep v1 tests and deterministic checks that match your current engine, or reserve v2 for a separate lane.

## Use exit codes without losing structured evidence

An exit code is ideal for the final gate because every CI system understands it. It is not enough for diagnosis. Run BrowserBash in `--agent` mode so stdout contains NDJSON, one JSON event per line, and preserve that output as an artifact. The workflow can use the process status for pass or block while a summary step reads structured fields for the PR comment.

```bash
npm install -g browserbash-cli
browserbash run-all tests/pr-gate \
  --agent \
  --budget-usd 2.00 \
  > browserbash.ndjson
status=$?
exit "$status"
```

Be careful with shell pipelines. Depending on the shell, redirecting and piping through another command can obscure the original process exit code. Capture it explicitly or enable the appropriate pipe-failure behavior in the CI runner. Test the workflow with a known failing assertion, a forced timeout, and a missing credential before calling the gate complete.

BrowserBash’s meanings support a more useful check than “nonzero equals application regression”:

- Exit 0: the selected tests passed.
- Exit 1: at least one validation failed. In the blocking tier, this should normally block merge.
- Exit 2: an execution error, infrastructure error, or budget stop occurred. The result is inconclusive, not evidence that the product failed.
- Exit 3: execution timed out. Treat it as its own operational signal.

The distinction is especially important over MCP. `browserbash mcp` exposes `run_objective`, `run_test_file`, and `run_suite`. A failed test is a successful validation tool call, so an AI coding agent receives the structured verdict rather than an MCP transport error. The agent must inspect `status`, not assume that tool-call success means test pass.

## Design PR verdict comments for decisions, not decoration

A PR verdict comment should let a reviewer answer four things quickly: what ran, what failed, whether merge is blocked, and where the evidence lives. It should not paste a full event stream or ask the reviewer to interpret an AI narrative.

The official GitHub Action at the repository root installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, and posts a self-updating PR comment with a verdict table. A self-updating comment avoids adding a new wall of output after every push. The action also supports sharded matrix jobs and a USD budget. See the [BrowserBash GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) for the current workflow shape.

A useful comment row includes test name, viewport when relevant, final status, duration, estimated cost when known, deterministic assertion counts, and an artifact link. Put a short policy statement above the table: “Blocking smoke failures prevent merge. Advisory failures do not. Infrastructure errors require rerun or QA approval.” This removes ambiguity when a yellow result appears.

Show assertion evidence for failures, especially expected and actual values. If an assertion was agent-judged, label it. If a test was skipped because the budget was crossed, say “skipped,” not “passed” or “not run.” BrowserBash reports remaining tests as skipped on a budget stop and exits 2. That outcome should never silently satisfy a required check.

Keep the check name stable. Branch protection usually refers to a named status check, so renaming a matrix job can accidentally remove the protection or leave a branch waiting for a check that no longer exists. If you shard, add a final aggregation job with the stable protected name rather than protecting each temporary shard name.

## Control cost, concurrency, sharding, and viewports

PR tests compete for compute and attention. BrowserBash’s `run-all` orchestrator derives concurrency from actual CPU and RAM, orders previously failed and slower tests first, and tracks flaky behavior. That helps surface useful results early, but CI design still needs explicit limits.

Use `--budget-usd` or `--budget-tokens` as a circuit breaker, not as a normal stopping condition. In version 1.5.0, `run_end` includes a `cost_usd` estimate from a bundled per-model price table. Unknown models receive no estimate rather than a fabricated one. When the suite crosses its budget, BrowserBash stops launching new tests, marks the remainder skipped, exits 2, and writes spend into RunAll-Result.md and JUnit properties.

Sharding lets several CI machines share a large gate without coordinating discovery state. `run-all --shard 2/4` selects a deterministic slice based on sorted discovery order, so all four workers agree. A final job should download their outputs and fail if any required shard failed or never reported.

Viewport matrices deserve risk-based use. `--matrix-viewport 1280x720,390x844` runs every selected test once at both sizes and labels results in events, JUnit, and reports. This doubles work, so apply it to flows with responsive behavior rather than every administrative journey. For one targeted run, `--viewport WxH` works with both engines.

```bash
browserbash run-all tests/pr-gate \
  --shard 2/4 \
  --matrix-viewport 1280x720,390x844 \
  --budget-usd 2.00 \
  --agent
```

Replay changes the cost picture. A green run records actions, and the next identical run can replay them with zero model calls. If the page changed, the agent steps back in. This makes stable PR checks much cheaper over time, but you should not promise that every run will replay. Changed preview URLs, data, authentication, or UI can require fresh reasoning.

## Handle authentication, data, and preview environments

Many PR gates fail for environmental reasons that have little to do with the change. Treat preview URL discovery, credentials, login state, and seed data as first-class inputs.

Saved logins reduce repetitive authentication. `browserbash auth save <name> --url <login-url>` opens a browser, lets a person log in once, and saves Playwright storageState after Enter. Reuse the profile with `--auth <name>` on run, testmd, run-all, or monitor, or set `auth:` in test frontmatter. If the profile’s saved origins do not cover the target start URL, BrowserBash prints a warning instead of silently doing nothing.

For CI, decide how that state is provisioned and protected. A developer’s local profile should not be copied casually into a hosted runner. Prefer a dedicated low-privilege test account, short-lived credentials, and an environment-specific authentication setup. Secret-marked template variables are masked as `*****` in every log line, but masking is not a substitute for limiting account permissions.

Use API setup when UI setup is not the behavior under test. Creating a cart, user, or feature-flag state through an API can remove minutes of agent navigation and reduce the number of ambiguous failure points. testmd v2 supports that pattern directly. Cleanup should be idempotent so a canceled job does not poison the next run.

Preview readiness also needs a deterministic wait. Do not launch browser tests merely because deployment started. Poll a health endpoint or wait for the platform’s completed-deployment signal, then run a small browser probe. If the preview expires while a reviewer reruns the job, report an infrastructure error rather than turning it into a product assertion failure.

## Choose models for a PR gate strategy AI tests can support

BrowserBash is Ollama-first. Its automatic model resolution checks local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. Local models need no API key and keep data on your machine. That is attractive for development and private repositories, but a hosted CI runner does not automatically have your local Ollama service.

Very small local models, roughly 8B parameters and under, can be flaky on long, multi-step objectives. A mid-size local model such as Qwen3, a Llama 3.3 70B-class model, or a capable hosted model is a more credible choice for difficult flows. Keep blocking objectives short even with a strong model. Model quality should not compensate for a vague test.

Cheap-model routing can plan with a strong model and execute with `--model-exec` on a less expensive model. Introduce that optimization after the baseline gate is stable, and compare failure categories rather than pass rate alone. A cheap executor that frequently misunderstands one control can increase rerun cost and reviewer fatigue.

Provider choice follows environment needs. The local provider uses your Chrome and is the default. Other providers are cdp, Browserbase, LambdaTest, and BrowserStack. Stagehand is the default engine. The builtin in-repository Anthropic tool-use loop is required for LambdaTest and BrowserStack, and for testmd v2. These constraints should be visible in the workflow documentation so a provider change does not unexpectedly invalidate tests.

For setup examples beyond the gate itself, use the [BrowserBash tutorials](https://browserbash.com/tutorials) and the package’s [npm page](https://www.npmjs.com/package/browserbash-cli).

## When to choose blocking, advisory, or no AI gate

Choose a blocking AI browser test when the flow represents a material user promise, its state can be controlled, its final conditions can be expressed deterministically, and the team is willing to investigate every red result. Sign-in, permissions, checkout confirmation, and destructive-action safeguards are common candidates.

Choose an advisory test when the objective is valuable but interpretation remains broad. Visual polish, complex recommendations, long cross-system journeys, and newly written tests belong here until their behavior is understood. Advisory does not mean ignored. Give the result an owner and review it during the pull request without making it a mechanical merge condition.

Choose no AI gate when a lower-level test provides a faster and more precise answer. A pure price calculation belongs in a unit test. An API schema belongs in a contract test. A single stable DOM property may be better served by a conventional Playwright test if your team already maintains that layer effectively. BrowserBash overlaps with browser automation, but it is not a reason to replace every selector-based check.

Also avoid a PR gate for very long exploratory objectives that depend on volatile third-party systems. Schedule them, monitor them, or run them during release qualification. The best gate is not the broadest suite. It is the smallest trustworthy set that changes merge decisions for good reasons.

## Roll out the PR gate strategy in four stages

First, run two or three candidate smoke tests in advisory mode for a week or a representative set of pull requests. Record product failures, instruction misunderstandings, timeouts, infrastructure errors, durations, and model costs. Rewrite ambiguous objectives and add deterministic Verify steps.

Second, make only one highly stable journey blocking. Publish the exit-code policy in the workflow and pull request template. Require an artifact for every nonzero result. This stage tests team behavior as much as software behavior: do reviewers investigate, or do they reflexively rerun?

Third, add risk-based path filters and a small mobile viewport slice. Set a budget high enough that a normal gate completes, then alert on approaching it. If a budget stop occurs regularly, reduce scope or fix cost rather than teaching developers that exit 2 is normal.

Fourth, add shard aggregation and promote additional tests one at a time. Review flaky flags and run history monthly. Demote tests whose signal has degraded, and keep scheduled coverage for flows that do not justify merge latency.

The [learning center](https://browserbash.com/learn) can help teammates understand objectives and results, while the local dashboard provides a fully local view without an account. An optional free cloud dashboard is available through `browserbash connect` and `--upload`, with 15-day retention. Decide whether uploads fit your data policy before enabling them.

## FAQ

### Should AI browser tests block every pull request?

No. Block only on short, business-critical flows with controlled state and deterministic final assertions. Broader or newly introduced objectives should run as advisory checks until their reliability and ownership are established.

### What BrowserBash exit code should fail a PR gate?

Exit 1 represents a failed validation and normally blocks a required smoke tier. Exit 2 is an error, infrastructure problem, or budget stop, while exit 3 is a timeout, so define explicit retry and review policies for those inconclusive outcomes.

### Can a failed BrowserBash MCP test still be a successful tool call?

Yes. Validation failure is returned as a structured verdict, not an MCP transport failure. The calling agent must inspect the verdict status, assertions, summary, final state, cost, and duration rather than relying on tool-call success.

### Is a local model reliable enough for merge gating?

It can be for short, well-written flows, especially with a capable mid-size model. Very small local models around 8B and under may be flaky on long objectives, so validate your chosen model and keep deterministic assertions in charge of the final decision.

Start with one trustworthy gate, install version 1.5.1 using `npm install -g browserbash-cli`, and expand only when the evidence supports it. You can also [create an optional BrowserBash account](https://browserbash.com/sign-up) for cloud dashboard uploads, but local use needs no account.
