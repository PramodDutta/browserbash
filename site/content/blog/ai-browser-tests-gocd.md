---
title: Run AI Browser Tests in GoCD
description: "Learn to run AI browser tests GoCD stages with BrowserBash, structured output, preserved exit codes, deterministic verdicts, and promotion gates."
date: 2026-09-14
category: ci
---

ai browser tests gocd integration works best when you treat browser validation as a release contract, not as a loose shell command. GoCD supplies the orchestration boundary, while BrowserBash supplies a real Chrome or Chromium session, a deterministic verdict, and structured evidence that another system can read. That separation is useful for teams adding AI-driven navigation without giving up predictable CI behavior.

BrowserBash is a free, Apache-2.0 open-source natural-language browser automation CLI from The Testing Academy, founded by Pramod Dutta. You write a plain-English objective, an AI agent drives the page step by step without selectors or page objects, and the run ends with a verdict. Version 1.5.1 adds deterministic Verify assertions, testmd v2, MCP, cost controls, sharding, viewport matrices, saved login sessions, monitoring, import, and recording. This guide shows how to place those capabilities inside GoCD without hiding failures or confusing an agent decision with a deterministic check.

## Why ai browser tests gocd belong in the delivery path

A conventional end-to-end suite is excellent when the product surface is stable and the team wants precise, code-level control. Natural-language browser tests address a different seam. They are useful for smoke journeys that read like an operator's intent: open the preview URL, sign in, create an item, and confirm the item appears. BrowserBash lets the agent handle page interaction while explicit Verify lines handle conditions that must not depend on model judgment.

The distinction matters in CI. A model can choose how to reach a state, but your release gate should say exactly why it passed or failed. BrowserBash compiles supported Verify grammar into real Playwright checks. URL containment, exact or partial titles, visible text, named buttons, links, or headings, element counts, and stored-value equality can all produce expected-versus-actual evidence. A Verify line outside that grammar still runs, but it is marked `judged: true`. Reviewers can tell which result came from a deterministic check.

The orchestrator's job is narrower. GoCD should provide source, configuration, secrets, network reachability, a browser-capable runtime, and durable artifacts. BrowserBash should own browser actions and verdict semantics. GoCD treats the command exit status as the gate, and its artifact configuration can retain NDJSON, Markdown, and JUnit output for diagnosis. This boundary keeps the pipeline understandable when a test finds a real regression, the browser cannot start, a budget is exhausted, or the objective times out.

The [BrowserBash feature overview](https://browserbash.com/features) is a useful companion if you need to decide which capabilities belong in the first rollout. Start with a small smoke suite around a deployed environment. Add wider journeys only after the artifact, security, and retry behavior is clear.

## Build the GoCD execution contract

A reliable stage job has four inputs: the checked-out `*_test.md` files, a reachable start URL, model configuration, and any required authentication profile. It has three outputs: process status, machine-readable events, and human-readable reports. Write those expectations down before adding YAML or SDK code.

BrowserBash `--agent` mode emits one JSON event per line on standard output. NDJSON is safer than prose scraping because a log collector can stream it, a later task can parse it line by line, and an AI coding agent can consume events without guessing at headings. Exit code 0 means passed, 1 means the product validation failed, 2 means an error, infrastructure problem, or budget stop, and 3 means timeout. Preserve those values instead of replacing every nonzero code with a generic failure.

Install the published CLI with `npm install -g browserbash-cli`, then invoke `browserbash`. Pinning version 1.5.1 in a controlled runner image can improve reproducibility. A floating global install is convenient for experiments but can change behavior when a new version ships. The package is available through the [browserbash-cli npm page](https://www.npmjs.com/package/browserbash-cli), and the source and license are visible in the [BrowserBash GitHub repository](https://github.com/PramodDutta/browserbash).

The minimal pipeline stage below shows the important shape. Adapt image policy, workspace paths, and artifact publication to your organization.

```bash
: "GoCD job task command"
npm install -g browserbash-cli
mkdir -p browser-results
browserbash run-all tests/browser --agent   > browser-results/events.ndjson
code=$?
cp -f RunAll-Result.md browser-results/ 2>/dev/null || true
exit $code
```

Do not pipe through a command that masks the original status. If you need `tee`, capture the BrowserBash status explicitly under your shell's pipeline rules. Also avoid interpreting exit code 1 as broken infrastructure. A failed test is a successful validation operation that found the product in the wrong state. That distinction becomes especially important when GoCD drives retries or alert routing.

## Design the BrowserBash suite for CI

Markdown tests are normal committable files ending in `*_test.md`. They support `@import` composition and `{{variables}}` templating, which makes it practical to share login, navigation, and cleanup fragments across environments. Secret-marked variables are rendered as `*****` in every log line. Keep the secret value in the CI secret store and keep the test intent in version control.

Use objectives at the level a human tester would describe. “Confirm the checkout page opens” is too weak if release safety depends on inventory, totals, and order confirmation. A better smoke flow states the meaningful business path, then uses deterministic Verify steps for release-critical outcomes. Avoid one enormous objective that crosses unrelated domains. Smaller tests produce clearer ownership, cleaner retries, and more useful artifacts.

testmd v2 adds `version: 2` frontmatter and runs steps one at a time in a single browser session. API steps can seed or mutate data without a model, and Verify steps can validate that data through the UI without a model. Consecutive plain-English steps are grouped into agent blocks on the same page. This is a strong pattern for preparing a known record through an API, navigating with natural language, and checking a precise UI result.

```bash
sed -n '1,20p' tests/browser/order_test.md

browserbash run-all tests/browser --agent   --matrix-viewport 1280x720,390x844   --budget-usd 2.50
```

The displayed test should contain `version: 2` frontmatter, an API GET, `Expect status 200`, a plain-English Open step, and a deterministic Verify text step. testmd v2 currently drives the builtin engine and needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run directly on Ollama or OpenRouter. If local-model execution is a hard constraint, use v1 test files for now and keep deterministic v2 adoption as a separate decision.

For additional examples, the [BrowserBash tutorials](https://browserbash.com/tutorials) cover test design and command usage. The important CI habit is to make assertions say what promotion depends on, not merely that the agent reached the end of an instruction list.

## Model, browser, and network choices

BrowserBash is Ollama-first. Its resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. Local models require no API keys and keep prompts on your machine. That is attractive on a trusted GoCD worker, especially when the tested environment or data cannot leave a private network.

Local does not automatically mean reliable for every flow. Very small models, roughly 8B parameters and under, can be flaky on long multi-step objectives. A mid-size local model such as Qwen3 or a Llama 3.3 70B-class model is a better starting point. Use a capable hosted model for hard flows when policy permits. Be explicit about that tradeoff in the pipeline instead of silently accepting variable results.

Provider and engine are separate choices. The default local provider drives Chrome on the worker. Other providers are `cdp`, `browserbase`, `lambdatest`, and `browserstack`. Stagehand is the default engine and is MIT licensed. The builtin engine is an in-repository Anthropic tool-use loop, and it is required for LambdaTest and BrowserStack. A remote browser can simplify container permissions, but it adds network, credentials, and vendor availability to the test path.

The stage job must reach the target URL, DNS, identity provider, APIs, and any remote browser endpoint. Verify this connectivity before blaming the model. Also ensure the container or runner has the libraries Chrome requires. A browser process that cannot start is exit code 2 territory, not a product failure.

## Make ai browser tests gocd deterministic enough to gate

“AI test” should not become an excuse for ambiguous promotion. Use the agent for navigation and interaction, then anchor the final decision with Verify grammar. The structured `run_end.assertions` data and Result.md assertion table record expected and actual evidence for deterministic checks. If a check is agent-judged, the `judged: true` marker makes that limitation visible.

The structured verdict returned at the end includes status, summary, final state, assertions, estimated `cost_usd`, and `duration_ms`. Unknown model prices do not receive a guessed cost. This is honest behavior and means your finance reporting should tolerate a missing estimate. For a suite, `run-all --budget-usd 2.50` or a token budget stops launching new tests once the threshold is crossed. Remaining tests are marked skipped, the suite exits 2, and spend is written to RunAll-Result.md and JUnit properties.

Sharding is deterministic. `run-all --shard 2/4` calculates a slice from sorted discovery order, so four workers agree without coordinating test allocation. A viewport matrix such as `--matrix-viewport 1280x720,390x844` runs each test once per viewport and labels results in events, JUnit, and reports. Use standalone `--viewport WxH` for a single run. Combine these carefully, because multiplying tests by viewports also multiplies browser time and potential model work.

Replay cache is often the largest cost and speed win. After a green run, BrowserBash records actions. The next identical run replays them with zero model calls, and the agent returns only if the page changed. This is different from caching the entire GoCD task. BrowserBash replay still exercises the browser against the current target, while an orchestrator-level cache may simply restore old output. For deployment gates, keep the live task uncached unless your cache key includes every environmental fact that makes a past verdict safe to reuse.

## Authentication and secret handling

Saved logins remove repeated interactive authentication from ordinary test runs. Run `browserbash auth save <name> --url <login-url>`, complete sign-in in the visible browser, and press Enter. BrowserBash stores Playwright `storageState`. Reuse it with `--auth <name>` on `run`, `testmd`, `run-all`, or `monitor`, or set `auth:` in test frontmatter.

Treat that profile as a credential. Encrypt it at rest, scope access to the validation job, avoid publishing it as an artifact, and rotate it when the underlying account changes. On ephemeral workers, retrieve the profile from a protected secret store into a temporary directory and remove it during cleanup. On persistent workers, isolate profiles by repository and environment. Never let an untrusted pull request execute with production storage state.

BrowserBash warns when the saved profile's origins do not cover the target start URL. That warning is valuable because a profile that silently does nothing can look like an agent navigation problem. Preserve warnings in logs, and fail early if your organization requires authenticated coverage.

Variables should carry environment-specific URLs and identifiers. Keep secret-marked inputs in GoCD's secret mechanism and pass only the needed values. Do not echo the raw environment, dump storage state, or archive the browser profile. Masking in BrowserBash logs protects its own output, but it cannot protect values printed by unrelated shell debugging.

## Artifacts, JUnit, and operational diagnosis

Store raw NDJSON even if your CI interface prefers JUnit. NDJSON preserves event ordering and structured detail, while JUnit provides broad compatibility with test views. Result.md and RunAll-Result.md give humans a quick narrative and assertion table. a job artifact directory should retain these outputs on both pass and failure, with a retention period aligned to incident and audit needs.

Artifact publication must run even when BrowserBash exits nonzero. In systems with explicit finalizers, use them. In shell-oriented jobs, capture the exit code, copy results, then return the original code. Never append `|| true` to the actual validation command merely to keep artifact upload alive. That turns a release gate into decoration.

The first triage question is which exit class occurred. Exit 1 points to a failed validation. Inspect assertions, final state, screenshots or browser evidence available through your chosen setup, and the target environment. Exit 2 points to startup, network, provider, credentials, model access, budget stop, or another infrastructure condition. Exit 3 means the allowed time elapsed. Different classes deserve different owners and retry policies.

A retry can be reasonable for a transient provider or network failure, but repeated product failures should remain failures. BrowserBash `run-all` already uses memory-aware concurrency derived from CPU and RAM, orders previously failed or slow tests first, and detects flaky behavior. Let that orchestrator control test parallelism before layering aggressive GoCD retries around the whole suite.

## Cost, performance, and scaling controls

Begin with a smoke tag or dedicated folder containing the few paths that decide whether promotion is safe. Run broad regression suites on a different cadence. This keeps the release gate short and gives teams room to use stronger models where they matter. Cheap-model routing with `--model-exec` can plan on a strong model and execute on a cheaper one, but validate the combination against your actual pages.

Set both a pipeline timeout and a BrowserBash budget. They solve different problems. Timeout limits wall-clock occupation of a worker. Budget limits new model consumption and marks unlaunched tests as skipped. Do not interpret a budget-stopped suite as green simply because no assertion failed. Exit code 2 correctly says the requested validation did not complete.

Use sharding when the suite is large enough to justify multiple workers. Keep all shards on the same commit, test inventory, base URL, viewport list, CLI version, and model policy. Aggregate their JUnit and NDJSON artifacts before promotion. If any shard fails, errors, times out, or stops on budget, the promotion decision should remain closed unless an authorized operator reviews the evidence.

GoCD treats the command exit status as the gate, and its artifact configuration can retain NDJSON, Markdown, and JUnit output for diagnosis. The best setup keeps logs streaming while artifacts remain durable. It also prevents concurrent tests from mutating the same account or record. Generate unique data through variables or testmd v2 API steps, and clean it up when the product supports safe cleanup.

## When to choose GoCD and when not to

Choose GoCD for ai browser tests gocd when the team already operates it, understands its security model, and can provide a browser-capable execution environment. GoCD is the better fit when value-stream visualization, environment promotion, and mature stage dependencies matter more than Kubernetes-native workflow objects. Adding a second orchestrator only for browser tests usually creates more ownership than value.

Choose BrowserBash when you want plain-English objectives, real-browser interaction without maintaining selectors or page objects, deterministic supported Verify checks, structured agent output, and local-model options. It is particularly useful as the open-source validation layer for AI agents because the caller receives a verdict rather than having to infer success from prose. The MCP server exposes the same idea through `run_objective`, `run_test_file`, and parallel `run_suite`; it is listed in the official MCP Registry as `io.github.PramodDutta/browserbash`.

Use conventional Playwright directly when you need exact low-level control, highly specialized browser instrumentation, or a mature selector-based suite your team can maintain efficiently. BrowserBash can import common Playwright patterns heuristically with `browserbash import <specs-or-dir>`, without a model, and records anything untranslatable in IMPORT-REPORT.md. That is a migration aid, not a promise that every advanced spec becomes equivalent natural language.

Use `browserbash record <url>` when a subject-matter expert can demonstrate a flow once. Ctrl-C writes a plain-English test, and password fields send only a secret marker so the generated step uses `{{password}}`. Review the resulting test and strengthen release-critical outcomes with deterministic Verify steps before gating a deployment.

## Rollout checklist for ai browser tests gocd

Start with one deployed nonproduction environment and two or three high-value smoke journeys. Pin BrowserBash 1.5.1, choose the provider and model explicitly, and prove that the worker can start Chrome and reach every dependency. Make one test intentionally fail in a safe branch to confirm that GoCD blocks promotion and still uploads artifacts. Do not publish a claimed passing result until the real run produces it.

Next, establish ownership for exit codes. Product teams investigate code 1. Platform teams investigate code 2. The owning team reviews code 3 against timeout and page behavior. Add JUnit to the CI test view, retain NDJSON and Markdown reports, and keep secrets and saved login profiles out of artifacts. Document how an operator distinguishes deterministic assertions from `judged: true` checks.

Then add budgets, replay, and concurrency. Measure duration and actual estimate coverage rather than inventing a savings percentage. Add a mobile viewport only if it represents a supported experience. Add shards only after isolation is sound. BrowserBash learning material can help reviewers understand the test format, while the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) is useful even outside GitHub because it demonstrates artifact, sharding, budget, and PR-reporting concepts.

Finally, decide whether monitoring should complement deployment gates. `browserbash monitor <test|objective> --every 10m --notify <webhook>` alerts only on pass-to-fail and fail-to-pass transitions, never on every green run. Slack incoming webhook URLs receive Slack formatting, while other webhooks receive raw JSON. The replay cache makes a stable always-on monitor nearly token-free. Keep monitoring ownership separate from a one-time release decision so alerts have a clear responder.

## FAQ

### How do I run ai browser tests gocd in CI?

Install BrowserBash in the GoCD execution environment, check out the Markdown tests, and run `browserbash run-all tests/browser --agent`. Preserve its exit code and upload NDJSON, JUnit, and Markdown results even when validation fails.

### Can ai browser tests gocd use a local model?

Yes. BrowserBash is Ollama-first, so local models require no API key and prompts stay on the machine. Very small models can struggle with long flows, so use a capable mid-size local model or a hosted model when the journey is difficult.

### How should GoCD interpret a failed BrowserBash test?

Exit code 1 means the validation ran and found a product failure, while code 2 means error, infrastructure trouble, or budget stop, and code 3 means timeout. Keep those categories distinct in retry rules, alerts, and promotion decisions.

### Are BrowserBash Verify steps deterministic?

Supported Verify grammar compiles to real Playwright checks and records expected-versus-actual evidence. Unsupported Verify wording can still run through the agent, but the result is marked `judged: true` so reviewers can see the difference.

Install version 1.5.1 with `npm install -g browserbash-cli` and begin with one meaningful smoke flow. You can optionally [create a BrowserBash account](https://browserbash.com/sign-up) for the free cloud dashboard, but an account is not required for local CLI use.
