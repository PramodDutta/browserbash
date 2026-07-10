---
title: Build a Flakiness Dashboard From BrowserBash Runs
description: "Build a flakiness dashboard from BrowserBash run history, flaky flags, NDJSON verdicts, assertions, duration, cost, and failure categories."
date: 2026-11-13
category: guide
---

A useful **flakiness dashboard** does not rank tests by how often they turn red. It shows when the same test produces inconsistent outcomes under comparable conditions, then preserves enough context to explain why. A product regression, browser startup error, timeout, model misunderstanding, and unstable test fixture all need different responses. Combining them into one failure-rate chart creates a colorful dashboard that sends engineers in the wrong direction.

BrowserBash supplies the raw material for a better view. Its `run-all` orchestrator keeps run history, identifies flaky behavior, and prioritizes previously failed and slow tests. Agent mode emits NDJSON events, human-readable results capture assertion evidence, and suite output includes JUnit. Version 1.5.0 also reports duration, estimated model cost when known, viewport labels, skipped budget outcomes, and deterministic assertion details. This guide turns those signals into an operational dashboard without pretending that one metric can diagnose every unstable test.

## Define what the flakiness dashboard should answer

Start with questions, not charts. A QA lead usually needs to know which tests changed status without a relevant product change, which failures are caused by infrastructure, which flows are getting slower or more expensive, and whether a retry hides a real defect. A test author needs the failed step, expected-versus-actual assertion, model and provider context, viewport, and recent outcome sequence.

Write a working definition: a flaky test alternates between pass and fail in comparable runs without an intentional application or test change that explains the difference. “Comparable” matters. A mobile viewport failure after desktop passes is not automatically flakiness. Neither is a test that fails consistently after a release. Segment the data before labeling it.

The dashboard should answer these questions:

- What is the current status and last transition time?
- How many pass-to-fail and fail-to-pass transitions occurred in the window?
- Which outcome category produced each nonpass run?
- Was the decisive assertion deterministic or agent-judged?
- Did environment, model, provider, engine, viewport, test content, or application revision change?
- Did a replay run behave differently from an agent-driven run?
- Who owns investigation, and what was the last disposition?

Keep raw events available. Aggregates are navigation aids, not evidence. A reviewer should be able to move from a red cell to `run_end.assertions`, Result.md, and the relevant CI artifact.

## Understand BrowserBash run signals and flaky flags

BrowserBash’s memory-aware `run-all` orchestrator derives concurrency from real CPU and RAM, runs previously failed and slow tests earlier, and detects flaky behavior from history. Those flags are a strong starting signal, but your dashboard should retain the outcomes that produced them rather than copying only a Boolean.

In `--agent` mode, stdout is NDJSON with one JSON event per line. That format is designed for CI and AI coding agents, so ingestion should parse JSON rather than scrape terminal prose. A completed MCP validation similarly returns structured verdict fields: status, summary, final_state, assertions, cost_usd, and duration_ms.

Process status adds a top-level category. Exit 0 means passed. Exit 1 means a validation failed. Exit 2 means an error, infrastructure problem, or budget stop. Exit 3 means timeout. Preserve the exit code and the structured status because they answer related but different questions. A suite can stop on budget with remaining tests marked skipped, which is not a flaky failure.

Deterministic Verify steps add high-value evidence. Recognized grammar becomes real Playwright checks for URL, title, visible text or named roles, element counts, and stored-value equality. Failed checks include expected and actual evidence. Verify prose outside the grammar still runs but is flagged `judged: true`. Your dashboard should segment judged assertions because model interpretation may contribute to variation.

The [BrowserBash feature guide](https://browserbash.com/features) describes these capabilities, while the [open-source repository](https://github.com/PramodDutta/browserbash) is the place to inspect current event and result behavior before binding a long-lived schema.

## Design a run-history schema before building charts

Use one immutable row per test attempt, not one mutable row per test. Store a separate normalized test identity so renamed paths can be mapped deliberately rather than guessed. At minimum, capture:

| Field group | Suggested fields | Why it matters |
| --- | --- | --- |
| Identity | test path, objective hash, suite, owner | Groups comparable attempts |
| Revision | application SHA, test SHA, branch, run ID | Separates regressions from instability |
| Execution | started time, duration, engine, model, provider | Explains environment variation |
| Context | viewport, shard, auth profile name, target host | Prevents false comparisons |
| Outcome | verdict status, process exit, summary, final state | Drives current health |
| Assertions | deterministic count, judged count, expected, actual | Supports diagnosis |
| Economics | tokens if available, cost estimate, replay indicator | Finds expensive instability |
| Operations | retry number, incident link, disposition | Stops repeated rediscovery |

Do not store secrets or raw saved authentication state. Profile names may be useful context, but Playwright storageState and secret values do not belong in analytics. BrowserBash masks secret-marked variables as `*****` in logs; your ingestion path should preserve that protection and apply its own access rules.

Store source artifact references rather than copying every screenshot or report into the analytical table. CI retention may be shorter than the trend window, so retain the small assertion and outcome fields needed for history while linking to larger artifacts when still available.

Hash normalized test content if you need to distinguish a wording change from unchanged execution. Keep the actual repository SHA too. Normalization rules must be conservative. Whitespace-only changes may be equivalent, while a single changed noun can direct the agent to a different record.

## Ingest NDJSON, JUnit, and Result.md safely

Run suites with agent output redirected to an artifact. Capture the BrowserBash exit code before any summarizing pipeline changes it. The exact CI syntax varies, but the execution itself is straightforward:

```bash
npm install -g browserbash-cli
browserbash run-all tests/browser \
  --agent \
  --budget-usd 3.00 \
  > browserbash.ndjson
```

Read the file line by line and validate each JSON object. Keep unknown event types instead of failing the whole import; schema evolution should not erase a run. Use an idempotency key built from CI run ID, test identity, viewport, shard, and attempt number so retried upload jobs do not duplicate history.

JUnit is valuable for generic CI test views and includes suite properties such as spend. NDJSON should remain the richer event source. Result.md is designed for humans, including an assertion table, and should be linked as evidence rather than treated as the primary machine schema.

The official GitHub Action at the repository root installs the CLI, runs the suite, uploads JUnit, NDJSON, and results, supports shard matrix jobs and `budget-usd`, and posts a self-updating PR verdict comment. Follow the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) rather than reverse-engineering a workflow from screenshots.

If an AI agent calls BrowserBash through MCP, ingest the returned structured verdict. `browserbash mcp` exposes `run_objective`, `run_test_file`, and `run_suite` over stdio. A failed test is a successful validation tool call, so the collector must inspect verdict status rather than interpreting tool-call success as pass.

## Calculate flakiness without hiding uncertainty

The simplest useful metric is transition rate: count adjacent comparable attempts where status changes between pass and fail, divided by comparable transitions. This highlights alternating outcomes better than raw failure rate. A test that fails ten consecutive times likely has a stable regression. A test that alternates five times deserves flakiness investigation.

Do not include error, timeout, or skipped states in a binary pass-fail calculation without labeling the choice. Show separate rates:

- Product validation failure rate, based on exit 1 and verdict evidence.
- Infrastructure or execution error rate, associated with exit 2 where applicable.
- Timeout rate, associated with exit 3.
- Skip rate, including budget-stopped tests.
- Pass-fail transition rate among comparable completed validations.

Add a minimum sample threshold. One pass and one fail is an important signal, not a statistically stable rate. Label it “needs more runs” and show the sequence. Avoid invented confidence scores that imply more certainty than the data supports.

Weight recent runs for triage only if the unweighted history remains visible. A test fixed yesterday should fall down the current queue, but the past incident still informs maintenance decisions. Use fixed windows such as last 20 comparable runs and last 30 days so teams can explain the number.

Segment before calculating. Model, engine, provider, viewport, target environment, test content hash, and application revision can all change behavior. If a 390x844 result fails consistently and 1280x720 passes consistently, you found a responsive defect or viewport-specific expectation, not flakiness.

## Build flakiness dashboard views that lead to action

The landing page should be a triage table, not a pie chart. Sort by current operational impact: blocking tests with recent transitions, high-frequency infrastructure errors, repeated timeouts, then advisory instability. Show owner, current status, last ten-run sparkline, transition count, failure category, duration trend, and last disposition.

A test detail page should show a chronological lane. Each attempt needs revision, status, exit code, viewport, model, provider, replay state when available, duration, cost estimate, assertion summary, and artifact links. Overlay test-content changes and application deployments. This often makes the cause visible without statistical machinery.

Add a failure-signature view. Group deterministic assertion failures by assertion type plus normalized expected and actual shape. Group infrastructure errors by stable error category. Do not group solely by an AI-generated summary because wording can vary. Agent summaries are useful supporting context.

Add an economics view for unstable tests. A flaky long flow costs more than a stable short one, both in model calls and human investigation. Plot estimated cost and duration by test. BrowserBash uses a bundled per-model price table for `cost_usd`; unknown models have no estimate rather than an incorrect value. Display “unknown,” not zero.

Add a quarantine view if the team uses quarantine. Include reason, owner, date, linked issue, review deadline, and what still runs. Quarantine must not become deletion from visibility. A quarantined test should continue on a schedule or advisory lane so evidence accumulates.

## Distinguish product, test, model, and infrastructure instability

Classification is the most valuable dashboard feature and the easiest to oversimplify. Use explicit categories with an “unknown” state:

1. Product nondeterminism: race conditions, inconsistent data, eventual consistency, or responsive defects.
2. Test design: ambiguous objective, unstable record selection, shared mutable state, or unsupported judged assertion.
3. Model behavior: different interpretation or action under comparable page state.
4. Environment and provider: browser startup, network, preview expiry, remote provider, or resource exhaustion.
5. Authentication and data: expired session, uncovered origin, missing fixture, or collision.
6. Expected change: application or test revision explains the outcome.

Automate hints, not final blame. A timeout after duration steadily rises suggests performance or environment pressure. A deterministic stored-value mismatch points more directly at data or product behavior. A `judged: true` assertion that alternates with identical screenshots suggests the assertion wording or model, but neither proves causality alone.

Require a human disposition for high-impact recurring cases. Store the reason and evidence. Over time, this labeled history becomes more useful than a generic flaky flag because it reveals systemic causes such as one unreliable preview service or a family of vague selection instructions.

Very small local models around 8B and under can be flaky on long multi-step objectives. A capable mid-size local Qwen3 model, a Llama 3.3 70B-class model, or a hosted model is a better baseline for hard flows. Still, model upgrades should follow diagnosis. A shared-data collision will remain flaky with a stronger model.

## Track replay, cost, and performance together

BrowserBash replay records actions after a green run. The next identical run can replay them with zero model calls, and the agent steps back in if the page changed. This makes frequent monitors and stable suites economical, but it introduces an important analytical dimension: replayed and agent-driven attempts are not identical execution modes.

Compare duration and outcomes by replay state when the event data exposes enough context. A flow that passes during replay but fails when the agent re-enters may have ambiguous instructions. A flow that fails during replay after a subtle UI change may reveal whether change detection and fallback behaved as expected. Do not label either automatically; inspect the event sequence.

Cost trends also need replay context. A median near zero may hide occasional expensive recovery runs. Show p50 and p95 or a simple distribution, not only average. Since unknown model prices do not receive estimates, calculate coverage of the cost field beside any total.

Monitor mode is another useful source. `browserbash monitor <test|objective> --every 10m --notify <webhook>` alerts only on pass-to-fail and fail-to-pass transitions, never every green run. Slack incoming webhooks get Slack formatting, while other URLs receive raw JSON. Its transition events can feed the same history store.

```bash
browserbash monitor tests/checkout/smoke_test.md \
  --every 10m \
  --notify https://hooks.example.test/browserbash
```

Monitor data differs from PR data because application revisions, traffic, and environment state may change between intervals. Label the source lane and join deployment metadata before declaring flakiness.

## When to use the local dashboard or build your own

Choose `browserbash dashboard` when you want a fully local view, no account, and quick access to BrowserBash runs on one machine. It is the lowest-effort option for individual development and initial investigation. The optional free cloud dashboard uses `browserbash connect` plus `--upload` and retains data for 15 days. Review data policy before uploads.

Build a custom flakiness dashboard when you need longer retention, cross-repository ownership, joins with deployments and incidents, organization-specific classification, or custom service-level reporting. Use the structured outputs as inputs rather than parsing prose. Keep the custom layer thin until the team has proven which questions recur.

Use an existing CI test analytics platform when it already ingests JUnit and owns your organization’s triage process. You may lose some BrowserBash-specific dimensions unless the platform accepts custom properties, but a shared workflow can be more valuable than a perfect isolated dashboard.

Do not build a dashboard if nobody owns the queue. A weekly report with five unstable tests, evidence links, and named owners beats a sophisticated unattended portal. Start with the operational meeting and then automate the view it needs.

The [BrowserBash pricing page](https://browserbash.com/pricing) explains available product options, and the [tutorial library](https://browserbash.com/tutorials) helps teams establish consistent runs before centralizing analytics.

## Operate a weekly flakiness review

Set a small service objective: every new blocking-test transition gets classified within one working day, and every quarantined test has an owner and review date. Adjust the timing to your team, but make it explicit.

During review, look at outcome sequence before rate, then assertion evidence, content and application revisions, environment dimensions, duration, replay, and cost. Decide whether to fix product behavior, clarify the test, isolate data, change execution resources, adjust the model, or demote the test. Record the decision in the dashboard.

Avoid “rerun until green” as a disposition. A controlled retry can distinguish transient infrastructure trouble, but repeated reruns destroy information and normalize an unreliable gate. Store every attempt, including manual reruns.

Review the dashboard itself quarterly. Remove metrics that never change decisions. Add dimensions only after a recurring unknown category demonstrates their value. Audit ingestion for missing shards and budget skips. A green chart built from partial suites is worse than no chart.

Finally, publish the taxonomy and ownership rules near the tests. The dashboard should make a shared process visible, not become the only place that process exists.

One useful final audit is to compare dashboard totals with CI discovery totals for every day and shard. BrowserBash sharding uses deterministic slices based on sorted discovery order, so four `1/4` through `4/4` workers should collectively account for the discovered suite. Missing uploads can otherwise make unstable tests disappear from the denominator. Track collector failures as operational incidents and backfill from retained NDJSON when possible. Also display the time zone and window boundary used by every trend. Teams distributed across regions can interpret “today” differently, and scheduled monitors near midnight can move between buckets without any behavioral change. Small data-contract details like these determine whether engineers trust the dashboard during an incident. Document every exclusion from the denominator, including canceled workflows and intentionally filtered tests. Hidden exclusions make comparisons meaningless.

Audit ingestion and denominator reconciliation weekly with a named owner.

## FAQ

### What is a flakiness dashboard for browser tests?

It is a history view that identifies inconsistent outcomes across comparable runs and links them to evidence. A useful dashboard separates product failures, infrastructure errors, timeouts, skips, model variation, and test-design problems.

### How does BrowserBash detect flaky tests?

Its memory-aware run-all orchestrator uses run history to flag flaky behavior and prioritizes previously failed and slow tests. Keep the underlying outcome sequence and context in your analytics so a flag can be investigated rather than treated as a diagnosis.

### Should retries be excluded from flakiness metrics?

No. Store every attempt and mark retry order explicitly. Excluding failed first attempts makes the suite appear healthier and hides the developer time and compute consumed by reruns.

### Can BrowserBash monitor results feed a flakiness dashboard?

Yes. Monitor mode emits alerts only when state changes between pass and fail, and non-Slack webhooks receive raw JSON. Label monitor runs separately and join deployment or environment changes before comparing them with PR runs.

Start with immutable run records and one triage table. Install BrowserBash 1.5.1 using `npm install -g browserbash-cli`; you can [sign up for the optional cloud dashboard](https://browserbash.com/sign-up), while local execution and the local dashboard require no account.
