---
title: Test an AWS Amplify App With AI Browser Automation
description: "Learn how to test AWS Amplify branch previews with plain-English browser automation, deterministic assertions, and useful CI verdicts."
date: 2026-09-24
category: use-case
---

If you need to test aws amplify, the hard part is rarely opening a branch preview URL. The hard part is deciding whether that deployment is safe to merge, expressing the decision clearly, and returning evidence that both a person and a CI job can understand. A preview can build successfully while the navigation is broken, a form is unusable, or a critical call to action points at the wrong place. BrowserBash lets you describe the intended outcome in plain English, run it in a real Chrome or Chromium browser, and get a deterministic verdict with structured results.

BrowserBash is a free, open-source Apache-2.0 CLI from The Testing Academy, founded by Pramod Dutta. Version 1.5.1 positions it as an open-source validation layer for AI agents. It does not ask you to maintain selectors or page objects for every flow. An AI agent drives the browser step by step, while explicit Verify assertions can compile to real Playwright checks. That combination is useful for hosted frontend applications, branch previews, and full user journeys: intent handles navigation and interaction, then deterministic checks decide whether the deployment meets the release condition.

This guide shows a practical way to connect Amplify branch preview to BrowserBash, design useful checks, handle authentication, control cost, and gate a pull request without pretending that every AI-driven test is automatically deterministic.

## Why test aws amplify after the build

A successful deployment answers an infrastructure question: did the platform accept and publish the revision? It does not answer the product question: can a user complete the changed journey? Those are different signals. Build output can look clean while the deployed application has a runtime configuration mistake, a broken route, a missing asset, a client-side exception that blocks interaction, or an authentication redirect that lands on the wrong host.

The preview URL is the most honest place to catch these problems. It contains the actual built artifact, platform routing, environment configuration, and browser behavior associated with the proposed change. Testing only a local development server misses some of that surface area. Testing only production finds it too late. A short browser validation against a branch preview URL gives reviewers a focused answer before merge.

The useful unit is not "click these five selectors." It is a release objective such as: open the preview, find the pricing page, confirm the annual plan is visible, start signup, and verify the correct heading. That statement survives many harmless markup changes. BrowserBash can interpret the navigation, and a final Verify line can enforce the condition without asking a model to decide whether it looks right.

Keep the first gate narrow. A preview gate should catch high-impact regressions quickly, not duplicate the entire regression suite on every commit. Good candidates include the changed route, the primary navigation, one revenue or signup path, a logged-in critical path when credentials are available, and a deterministic assertion at the end. Broader suites can run on a schedule or before release.

## How BrowserBash can test test aws amplify

BrowserBash starts with a URL and an objective. The default Stagehand engine drives a real browser with natural-language instructions. No selector map or page object is required. For a quick manual check, install the CLI and pass the preview address as part of the objective:

```bash
npm install -g browserbash-cli
browserbash run "Open ${AMPLIFY_URL}, navigate to the main product page, and confirm the primary call to action is reachable"
browserbash run "Open ${AMPLIFY_URL}, check the changed user journey, and report any blocking state" --agent
```

The second command uses agent mode. In that mode, stdout is NDJSON, one JSON event per line, so a CI wrapper or coding agent does not need to scrape prose. Exit code 0 means passed, 1 means failed, 2 means an error, infrastructure failure, or budget stop, and 3 means timeout. Treat those meanings separately. A product failure should block a merge with useful evidence; an infrastructure error may call for a retry or an explicit "test could not run" status.

Model resolution is Ollama-first. BrowserBash checks local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. A local model requires no API key, and nothing leaves your machine. OpenRouter and Anthropic Claude are supported when you bring a key. This flexibility matters on contributor laptops, but CI runners need an available model endpoint and browser environment. Choose that environment deliberately instead of assuming a developer's local Ollama process exists in hosted CI.

There is an honest model-size tradeoff. Very small local models around 8B and under can be flaky on long, multi-step objectives. A mid-size local model such as Qwen3, a Llama 3.3 70B-class model, or a capable hosted model is a better fit for hard flows. You can also plan with a stronger model and execute routine actions with a cheaper one through `--model-exec`.

For setup details and smaller examples, the [BrowserBash learning guide](https://browserbash.com/learn) and hands-on tutorials provide useful starting points.

## Designing a reliable Amplify branch preview merge gate

Start by defining what "safe to merge" means for this change. Avoid objectives such as "test the whole website." They have an unclear boundary, produce noisy failures, and make it hard to tell what should block the pull request. Prefer one business outcome per test file, with a small number of observable conditions.

A strong preview test has three layers. First, prove that the deployment responds and the intended route loads. Second, complete the behavior affected by the pull request. Third, assert a stable result. For a navigation change, the result might be a URL fragment and visible heading. For a form change, it might be a confirmation state. For a content release, it might be exact visible copy and the expected number of cards.

Use the deployment URL as data, not hard-coded test logic. Your CI system should wait until AWS Amplify has produced a branch preview URL, place it in an environment variable, and only then launch BrowserBash. The exact mechanism for discovering that URL depends on your repository and platform integration, so keep it outside the test. This separation makes the Markdown reusable on local previews, pull requests, and the production Amplify domain.

Also decide how to handle a missing URL. Do not quietly fall back to production, because a green production run would say nothing about the proposed revision. Fail the setup step with a clear message. If the preview is protected or temporarily unavailable, report that as infrastructure rather than recasting it as a product assertion failure.

### Use stable intent and stable evidence

Natural language does not mean vague language. Name the route, role, visible label, and expected outcome. "Open the account page as a returning user, choose Billing, and verify the Current plan heading is visible" is easier to execute and debug than "make sure billing works."

Keep deterministic facts in Verify steps where possible. URL, title, text visibility, accessible roles, element counts, and stored values are good assertions. Visual polish, writing quality, and whether a layout "feels correct" remain judgment calls. BrowserBash flags out-of-grammar Verify lines with `judged: true`, which prevents an agent opinion from masquerading as a Playwright assertion.

## Create committable tests with deterministic Verify assertions

BrowserBash test files use the `*_test.md` convention, support `{{variables}}` templating, and allow `@import` composition. After each run, BrowserBash writes a human-readable `Result.md`. Secret-marked variables are masked as `*****` in every log line, which is important when a pull request job publishes artifacts.

Version 1.5.0 added deterministic Verify assertions. Supported grammar includes URL contains, title is or contains, visible text, a named button, link, or heading being visible, element counts, and stored value equality. Those compile to real Playwright checks. When one fails, expected-versus-actual evidence appears in `run_end.assertions` and the Result.md assertion table.

For flows that need test data, testmd v2 can run API and browser steps in one browser session. API steps such as GET, POST, PUT, DELETE, and PATCH do not touch a model. An `Expect status` clause can store a JSON path for later use. Consecutive plain-English lines run as grouped agent blocks, and deterministic Verify steps inspect the resulting UI.

```bash
cat > checkout_test.md <<'TEST'
---
version: 2
variables:
  base_url: "{{AMPLIFY_URL}}"
---
POST {{base_url}}/api/test-data with body {"plan":"starter"}
Expect status 201, store $.id as 'account_id'

Open {{base_url}} and navigate to the account created for {{account_id}}
Choose the starter plan and continue to the summary

Verify URL contains "/summary"
Verify 'Order summary' heading visible
Verify text "Starter" visible
TEST

browserbash testmd checkout_test.md --agent
```

The shell snippet illustrates file contents, but commit the Markdown file normally rather than generating it on every job. Version 2 currently uses the builtin engine and needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run directly on Ollama or OpenRouter. If that dependency does not fit your pipeline, use a version 1 file without frontmatter, or run a direct objective and reserve deterministic checks for a compatible environment.

BrowserBash preserves version 1 behavior, so adopting version 2 is not an all-at-once migration. You can keep existing flows and introduce API seeding or deterministic step execution only where it changes the reliability of the gate.

## A reliable way to test aws amplify in CI

A clean pipeline has an explicit sequence: build the preview, obtain its URL, wait for it to become reachable, run a small BrowserBash suite, publish results, and map the exit code to the pull request check. The waiting step should have a deadline. Without one, a platform delay can leave a job hanging until the CI provider kills it, which produces a poor diagnostic.

BrowserBash includes a GitHub Action at the repository root. It installs the CLI, runs a suite, uploads JUnit, NDJSON, and result artifacts, and posts a self-updating pull request comment with a verdict table. It supports `shard:` for matrix jobs and `budget-usd:` for spend limits. The [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) is the right source for the current inputs and workflow shape.

Whether you use the action or call the CLI directly, retain structured output. NDJSON is better for machine consumers, JUnit integrates with test reporting, and Result.md helps a reviewer understand what happened. Do not reduce all outcomes to a single red icon. Preserve failed assertions, final state, duration, and infrastructure errors.

MCP offers another integration path for AI coding agents. Running `browserbash mcp` serves BrowserBash over stdio. The tools are `run_objective`, `run_test_file`, and `run_suite`; each returns verdict JSON containing status, summary, final_state, assertions, cost_usd, and duration_ms. A failed test is a successful validation call, so the MCP invocation succeeds and the calling agent reads the failed verdict. That distinction prevents protocol errors from being confused with product failures.

```bash
claude mcp add browserbash -- browserbash mcp
browserbash run-all tests/preview --shard 2/4 --budget-usd 2.50 --agent
browserbash run-all tests/preview --matrix-viewport 1280x720,390x844 --agent
```

The server is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`. Cursor, Windsurf, Codex, and Zed can use the same stdio command pattern supported by their MCP configuration.

## Authentication, secrets, and preview isolation

Protected previews and logged-in journeys need more care than public smoke tests. BrowserBash saved logins let you authenticate once with `browserbash auth save <name> --url <login-url>`. A visible browser opens, you complete login, and pressing Enter stores Playwright storageState. Reuse it with `--auth <name>` on run, testmd, run-all, or monitor, or add `auth:` frontmatter to a test.

The CLI warns when the saved profile's origins do not cover the target start URL. That warning matters for preview hosts. A session saved against the production Amplify domain may not be valid for a branch preview URL, even when the application looks identical. Never suppress that mismatch and assume authentication worked. Decide whether the preview shares an authentication origin, needs a dedicated test identity, or should exercise only public behavior.

Treat preview data as disposable and scoped. Use an account created for automation, avoid real customer records, and seed only the minimum state needed. If the application supports an API-based fixture path, a testmd v2 API step can create the record and store its identifier. Clean-up can be part of the API workflow where the system permits it.

Variables belong in the CI secret store or protected environment configuration, not in committed objectives. BrowserBash masking protects secret-marked variables in logs, but it does not make an accidentally committed credential safe. Keep artifacts long enough for diagnosis, review what they contain, and apply the same access policy you use for screenshots and browser traces.

For the broader feature surface, including local and cloud reporting options, see the [BrowserBash features overview](https://browserbash.com/features).

## Keep the suite fast, affordable, and diagnostic

A merge gate earns trust when it is quick enough to run on every meaningful update and specific enough to explain a failure. Split long objectives into independent test files where the state permits it. This produces clearer results and gives the run-all orchestrator useful scheduling choices. BrowserBash derives concurrency from real CPU and RAM, prioritizes previously failed and slow tests, and reports flaky behavior.

Replay cache is especially valuable on preview workflows. A green run records its actions. The next identical run replays those actions with zero model calls, and the agent steps back in only if the page changed. That makes repeated validation cheaper without claiming that changed interfaces will always work automatically. Cache keys and test inputs should still distinguish different preview URLs and revisions where the content differs.

Cost governance protects a busy repository. Every `run_end` event includes a `cost_usd` estimate based on a bundled per-model price table. Unknown models get no estimate rather than a fabricated number. With `run-all --budget-usd 2.50` or `--budget-tokens`, BrowserBash stops launching new tests after the suite crosses the limit. Remaining tests are marked skipped, the suite exits 2, and spend is written to RunAll-Result.md and JUnit properties. A budget stop is not a passing gate, so configure CI to surface it distinctly.

Sharding distributes sorted test discovery deterministically. For example, `--shard 2/4` gives four workers slices that agree without coordinating. A viewport matrix runs each test at sizes such as 1280x720 and 390x844, labeling the viewport in events, JUnit, and results. Use matrices for flows where responsive layout can change usability, not as a reflex for every backend-only change.

For recurring confidence after merge, monitor mode runs a test or objective on an interval. It notifies only when state changes from pass to fail or fail to pass, never for every green run. Slack incoming-webhook URLs receive Slack formatting; other webhook URLs receive raw JSON. The replay cache makes an unchanged always-on monitor nearly token-free. Preview environments are usually temporary, so point long-lived monitors at the production Amplify domain instead.

## Failure triage without blaming the model

When a gate fails, first classify the layer. Could BrowserBash reach the preview? Did authentication apply to the target origin? Did the browser interaction fail before the assertion? Did a deterministic assertion receive an unexpected actual value? Or did the command end with timeout or infrastructure exit code? This sequence keeps teams from dismissing every failure as "AI flakiness."

Deterministic assertion evidence is the strongest starting point. If a heading was expected but absent, inspect the expected-versus-actual record and Result.md. Then reproduce against the same preview URL. If the objective took a wrong path, tighten the instruction with an accessible label or route, reduce the number of goals in that test, and check whether the model is adequate for the flow.

A failed test is useful information, not a broken tool call. That principle is explicit in the MCP contract and should also shape CI. Let the test command complete, archive its results, then block merge based on status. If you stop the job before publishing artifacts, the reviewer loses the evidence needed to decide whether the code, environment, or test should change.

Flaky tests deserve a bounded response. Re-run once when the failure is plausibly environmental, but do not retry until green. Track repeated pass-fail changes and either make the intent more precise, move a fact into deterministic Verify grammar, improve test data isolation, or select a more capable model. Small local models are excellent for short smoke paths, but a complex authenticated journey may justify a stronger local or hosted model.

You can inspect examples and release-focused writing on the [BrowserBash blog](https://browserbash.com/blog), while the open-source implementation is available in the [GitHub repository](https://github.com/PramodDutta/browserbash).

## When to choose BrowserBash for AWS Amplify

Choose BrowserBash when reviewers can state the desired user outcome more easily than they can maintain selectors, and when your pipeline benefits from structured verdicts that an AI agent can consume. It fits teams adopting AI coding agents, repositories with many short-lived previews, and SDETs who want intent-driven navigation backed by explicit checks. It is also attractive when local-first model execution and an Apache-2.0 codebase matter.

A conventional Playwright suite is often the better fit when you need precise control over every event, extensive network interception, deeply customized fixtures, or a mature selector-based framework that already runs reliably. BrowserBash itself uses real browser automation and compiles supported Verify lines to Playwright checks, but natural-language execution is a different abstraction. You do not need to replace a healthy lower-level suite. A practical split is BrowserBash for intent-level preview smoke tests and Playwright for detailed component contracts and carefully engineered regression paths.

Manual exploratory testing remains better for visual nuance, unfamiliar behavior, and questions that have not yet become assertions. Screenshot comparison tools are better when pixel-level drift is the release risk. API tests are faster and more direct for service contracts. The best preview gate combines layers instead of asking one tool to prove everything.

Avoid BrowserBash as the only gate when the objective is extremely long, the environment is nondeterministic, or the test depends on subjective visual approval. Also account for the current testmd v2 engine constraint. If your policy permits only Ollama or OpenRouter and you require v2 API plus deterministic step execution, that combination is not supported directly today. Use version 1, direct objectives, a compatible Anthropic gateway, or a different test layer until the constraint changes.

The practical decision is simple: use BrowserBash where intent makes the test easier to author and review, and anchor the release decision in deterministic evidence wherever possible. Keep other tools where their precision is the advantage.

## FAQ

### How do I test aws amplify in a pull request?

Wait for AWS Amplify to publish the preview, pass its URL to a focused BrowserBash objective or `*_test.md` suite, and run with `--agent` for NDJSON output. Map exit codes carefully and publish Result.md or JUnit evidence before deciding whether to merge.

### Can BrowserBash run against a protected AWS Amplify preview?

Yes, when the browser can access it and you provide the required authentication. Saved login profiles can be reused with `--auth`, but BrowserBash warns if the saved origins do not cover the preview's start URL.

### Are BrowserBash Verify steps deterministic?

Verify lines that match the supported grammar compile to real Playwright checks and return expected-versus-actual evidence. Lines outside that grammar can still run with agent judgment, but they are marked `judged: true` so you can distinguish them.

### Does BrowserBash require a paid AI API key?

No. It defaults to free local Ollama models, needs no API key, and keeps data on your machine. Hard flows may work better with a mid-size local or capable hosted model, and testmd v2 currently requires the builtin engine with Anthropic or a compatible gateway.

Install version 1.5.1 with `npm install -g browserbash-cli`, point a focused check at your preview, and keep the evidence with the pull request. You can also [create an optional BrowserBash account](https://browserbash.com/sign-up) for cloud dashboard use; an account is not required.
