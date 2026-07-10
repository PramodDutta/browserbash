---
title: Run AI Browser Tests in Kubernetes Pods
description: "Run isolated ai tests kubernetes workflows with ephemeral Chrome pods, private CDP services, deterministic checks, budgets, and CI diagnostics."
date: 2026-10-05
category: guide
---

ai tests kubernetes becomes useful when the browser environment is treated as a first-class test dependency, not a mysterious process that happens to exist on a runner. With Kubernetes browser pods, you can let BrowserBash express the journey in plain English while a real Chrome or Chromium instance performs every step. The goal is not merely to make a demo open a page. It is to build a repeatable validation path with a clear verdict, useful evidence, controlled cost, and failures your team can classify.

BrowserBash is a free, Apache-2.0, open-source browser automation CLI from The Testing Academy, founded by Pramod Dutta. Version 1.5.1 positions it as an open-source validation layer for AI agents. You write an objective without selectors or page objects, an AI agent drives the browser, and the CLI returns deterministic status plus structured results. This guide focuses on the infrastructure boundary around that loop, including what Kubernetes browser pods solves, what it does not solve, and how to keep the browser connection honest.

## How ai tests kubernetes fits the BrowserBash execution model

BrowserBash separates intent from browser placement. The intent can be a one-line objective or a committable `*_test.md` file. The browser can be your local Chrome, a CDP endpoint, Browserbase, LambdaTest, or BrowserStack, depending on the provider and engine constraints. For this setup, the important boundary is an ephemeral Chrome pod addressed through a private CDP service. BrowserBash remains responsible for interpreting the objective, producing events, and reporting the verdict.

That separation is easy to underestimate. ephemeral isolation, schedulable browser capacity, and cluster-native cleanup. It does not automatically guarantee deterministic application state, stable networking, or reliable model planning. You still need to control the browser build, test data, viewport, secrets, and the endpoint lifecycle. The payoff is architectural clarity: an infrastructure failure can be distinguished from a product assertion failure instead of collapsing into one vague timeout.

The default engine is Stagehand, an MIT-licensed Browserbase project. BrowserBash also has an in-repository builtin engine based on Anthropic tool use, which is required for LambdaTest and BrowserStack. The `cdp` provider is the natural fit when a reachable DevTools endpoint already exists. Provider selection tells BrowserBash where Chrome lives; it does not turn an arbitrary WebDriver address into CDP.

Start with the [BrowserBash features overview](https://browserbash.com/features) if you need to align the provider, engine, and reporting vocabulary before changing CI. The distinction matters especially for ai tests kubernetes, because the browser may be healthy while the connection route is wrong, or the route may be healthy while the application assertion correctly fails.

## Build a reliable ai tests kubernetes topology

A minimal topology has three actors: the BrowserBash process, a real browser, and the application under test. The model provider is a fourth actor for agent-driven steps unless a replay is used. Draw the network route between them before writing workflow YAML. The browser must reach the application, BrowserBash must reach the browser control endpoint, and the CLI must reach the selected model unless it runs Ollama locally.

Create a short-lived Chrome pod for the job, expose its DevTools port only through a namespace-scoped Service, and wait for the DevTools version endpoint before starting BrowserBash. Apply CPU and memory requests as well as limits. Use a unique Service or predictable job identity so parallel runs cannot attach to the wrong browser.

Protect the endpoint as seriously as shell access. A DevTools connection can navigate, inspect page content, execute browser actions, and observe authenticated state. Use short-lived allocation, private networking, and job-scoped credentials where the surrounding platform supports them. Do not print a credential-bearing WebSocket URL into public CI logs. Redact it at the logging boundary, not after artifacts have already been uploaded.

Readiness needs a concrete definition. A running process or scheduled pod is not enough. Wait until Chrome's DevTools metadata endpoint responds and the advertised target can be reached from the same environment that will run BrowserBash. Then begin the objective. This small gate prevents model calls from being wasted on a browser that never became attachable.

Use a dedicated browser profile per job. Reusing a profile can leak cookies, local storage, feature flags, and service worker state across runs. BrowserBash has a separate saved-login feature for intentional reuse: `browserbash auth save <name> --url <login-url>` stores Playwright storageState, and `--auth <name>` applies it to run, testmd, run-all, or monitor. If saved origins do not cover the target start URL, BrowserBash warns instead of silently ignoring the mismatch.

## Configure the CLI and prove the connection

Install the published CLI and begin with one short, observable objective. Keep the first check smaller than the production journey. You want to prove browser allocation, endpoint reachability, navigation, model resolution, and result emission with the fewest moving parts.

```bash
npm install -g browserbash-cli
browserbash run-all tests --provider cdp --shard 2/4 --budget-usd 2.50
browserbash run "Open the admin page and verify the Users heading is visible" --provider cdp --agent
```

The example deliberately uses supported BrowserBash commands and flags. Your infrastructure still has to supply the CDP endpoint through its documented configuration path. Endpoint syntax and authentication are deployment-specific, so avoid copying a guessed environment variable from an unrelated browser service. Confirm the current CLI interface with `browserbash --help` and the endpoint format with your Kubernetes browser pods documentation.

For machine consumption, `--agent` emits NDJSON, one JSON event per line, on stdout. Exit code 0 means passed, 1 means failed, 2 means an error, infrastructure problem, or budget stop, and 3 means timeout. Your CI wrapper should preserve those distinctions. Turning every nonzero result into a generic red job discards the exact signal needed to decide whether the product, browser service, budget, or timeout policy needs attention.

A failed validation is not a broken tool invocation. This principle is explicit in the MCP integration and is useful in shell CI too. The automation ran successfully when it reached a deterministic check and proved the condition false. Treat the verdict as data, preserve the assertion evidence, and let the pipeline policy decide whether that failed validation blocks a merge.

The [step-by-step tutorials](https://browserbash.com/tutorials) are a useful next stop for authoring objectives after connectivity works. Do not start by asking the agent to log in, seed data, traverse six pages, download a file, and verify five business rules. Grow the flow one boundary at a time.

## Make the browser and environment reproducible

Reproducibility is a bill of materials plus controlled state. It is not simply "we used a container" or "the job ran on the same runner label." For ai tests kubernetes, capture enough context to recreate the browser behavior without guessing.

Pin the browser image and node architecture, then set requests high enough to avoid CPU starvation during page rendering. Use topology rules only when they solve a measured latency or capacity problem. A pod restart should produce an infrastructure result, not be misreported as a product regression.


| Layer | Pin or record | Why it matters |
|---|---|---|
| Browser | Exact build or image digest | Rendering and DevTools behavior can change |
| Runtime | Node version and BrowserBash 1.5.1 | Keeps CLI behavior consistent |
| Display | Viewport, fonts, locale, timezone | Changes layout, text, and date output |
| Provider | local or cdp and endpoint identity | Explains where the real browser ran |
| Model | Resolved model and provider route | Affects planning on agent-driven steps |
| Application | Build, base URL, and seed state | Prevents environment drift from looking like automation drift |


The viewport deserves explicit treatment. BrowserBash supports `--viewport WxH` on single runs with both engines. For suites, `run-all --matrix-viewport 1280x720,390x844` executes every test once per viewport and labels events, JUnit, and results. A viewport matrix is useful when responsive breakpoints change navigation or control visibility. It is not a substitute for testing different browser builds or operating systems.

Control application state just as carefully. A perfectly pinned browser still produces unstable results if accounts retain data from an earlier job, feature flags vary, or a shared environment is being deployed during the suite. Prefer job-specific users and idempotent seed operations. When cleanup is risky, create isolated data with a run identifier and expire it through a separate retention policy.

BrowserBash's replay cache helps once a green path is stable. A successful run records actions, and the next identical run can replay them with zero model calls. If the page changes, the agent steps back in. Replay reduces cost and latency, but it should not excuse uncontrolled state. Scope caches carefully to the application build, test identity, and environment so a hit means what you think it means.

## Add deterministic checks with testmd v2

Plain-English navigation is valuable, but release gates often need assertions whose semantics do not depend on model judgment. BrowserBash 1.5.0 introduced deterministic `Verify` steps. Supported grammar compiles into real Playwright checks for URL contains, title is or contains, visible text, named button, link, or heading visibility, element counts, and stored-value equality.

A pass means the condition held. A failure includes expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. A Verify line outside the deterministic grammar still runs as an agent-judged check and is marked `judged: true`. Review that field in critical gates. The wording may look assertive while the execution mode is different.

testmd v2 adds `version: 2` frontmatter and executes steps one at a time in a single browser session. API steps can seed or inspect data without using a model, and deterministic Verify steps can check the UI. Consecutive plain-English steps are grouped into agent blocks on the same page.

```bash
browserbash mcp
claude mcp add browserbash -- browserbash mcp
browserbash run-all tests --provider cdp --shard 2/4 --budget-usd 2.50
```

A v2 test can use an API sequence such as `GET https://example.test/api/profile`, followed by `Expect status 200, store $.name as 'name'`, then an agent navigation step, and finally `Verify stored value 'name' equals 'Ada'`. Keep secrets in `{{variables}}`; secret-marked variables are masked as `*****` in every log line. Use `@import` to compose shared setup without cloning it across tests.

There is an important limitation: testmd v2 currently drives the builtin engine and needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run directly on Ollama or OpenRouter. v1 files without frontmatter continue to behave as before. This may affect architecture more than Kubernetes browser pods, so decide whether deterministic v2 orchestration or an Ollama-first path has priority for this suite.

## Control model choice, cost, parallelism, and caching

BrowserBash is Ollama-first. It defaults to free local models, requires no API key, and keeps data on your machine. Resolution proceeds from local Ollama to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. OpenRouter and Anthropic Claude are supported with your own key. In a distributed setup, "local" means local to the BrowserBash process, not necessarily local to Kubernetes browser pods.

Model capacity matters. Very small local models around 8B parameters and under can be flaky on long, multi-step objectives. A mid-size local model such as Qwen3, a Llama 3.3 70B-class model, or a capable hosted model is a more realistic choice for hard flows. Keep short validations on the cheapest model that proves reliable. Cheap-model routing with `--model-exec` lets a strong model plan while a cheaper model executes.

Cost governance belongs in the suite command, not in a spreadsheet reviewed next month. Each `run_end` can include a `cost_usd` estimate from the bundled per-model price table. An unknown model gets no estimate instead of a fabricated number. `run-all --budget-usd 2.50` or `--budget-tokens` stops launching new tests after the suite crosses the budget. Remaining tests are marked skipped, the suite exits 2, and spend appears in RunAll-Result.md and JUnit properties.

Parallelism must respect both browser and model capacity. BrowserBash's run-all orchestrator derives concurrency from real CPU and RAM, orders previously failed and slow tests first, and detects flaky behavior. `--shard 2/4` selects a deterministic slice based on sorted discovery order, allowing CI machines to agree without a coordinator. Browser infrastructure still needs matching capacity. Starting eight agent jobs against a service that can host two Chromes creates queue noise, not speed.

See the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) for the repository-root `action.yml`. It installs the CLI, runs the suite, uploads JUnit, NDJSON, and result artifacts, supports shard matrix jobs and `budget-usd`, and maintains a verdict table in a self-updating pull request comment.

## Diagnose ai tests kubernetes failures by layer

Do not rerun first. Classify first. A rerun can erase the evidence, consume budget, and turn a deterministic infrastructure defect into a misleading flaky label. Begin with the exit code and the last structured event, then move outward through the layers.

Inspect pod phase, restart count, events, readiness, Service endpoints, NetworkPolicy, Chrome logs, and cgroup pressure. Query CDP from the BrowserBash pod because cluster DNS and policy can differ from an operator shell.

Next inspect navigation evidence. Did Chrome resolve the application hostname from its own environment? Did it receive the expected HTTP response? Was a proxy, certificate, consent screen, or authentication redirect inserted? A remote browser can have a different network view from the BrowserBash process. Running `curl` beside the CLI proves only the runner path, not the browser path.

Then inspect the assertion record. Deterministic Verify results give expected and actual evidence. Agent-judged lines are flagged. Preserve Result.md, NDJSON, JUnit, browser logs, and the infrastructure allocation identifier together. The local dashboard, started with `browserbash dashboard`, is fully local and requires no account. An optional free cloud dashboard is available through `browserbash connect` and `--upload`, with 15-day retention.

Routing multiple test jobs to one mutable Service without session isolation is the failure pattern to put near the top of your runbook. Also define timeouts at each layer. Allocation timeout, endpoint readiness timeout, objective timeout, and suite timeout answer different questions. A single thirty-minute job timeout tells you only that the cleanup finally occurred.

For recurring production checks, monitor mode runs a test or objective on an interval and sends a webhook only when state changes from pass to fail or fail to pass. It does not notify on every green run. Slack incoming-webhook URLs receive Slack formatting; other URLs receive raw JSON. The replay cache can make an always-on monitor nearly token-free when the journey remains unchanged.

## When to choose Kubernetes browser pods, and when not to

Choose this pattern when your delivery platform already uses Kubernetes and browser workloads need elastic, isolated capacity. It is especially useful when the organization wants plain-English browser validation without reintroducing selector-heavy page objects solely to connect to centralized infrastructure. The browser remains real, results remain structured, and deterministic assertions can carry release-gate semantics.

Do not choose it merely because remote browser architecture sounds more mature. A local provider is the simplest default when one runner and one Chrome satisfy the trust, capacity, and reproducibility requirements. Avoid this pattern when the cluster overhead exceeds the value for a small suite or networking policy cannot protect CDP. Complexity must buy isolation, capacity, locality, or repeatability that you can name and measure.

Traditional Playwright code is the better fit when engineers need exact control over every locator, event, network interception, browser context, and retry branch. Selenium WebDriver is often the better fit when an established organization depends on WebDriver language bindings, mature Grid operations, and a large page-object estate. BrowserBash overlaps with both at the browser-validation layer, but its value is natural-language intent, agent navigation, structured verdicts, replay, and deterministic Verify checks where supported.

The MCP server is compelling for AI coding agents. `browserbash mcp` exposes `run_objective`, `run_test_file`, and `run_suite` over stdio. Each returns structured verdict JSON with status, summary, final_state, assertions, cost_usd, and duration_ms. BrowserBash is listed in the official MCP Registry as `io.github.PramodDutta/browserbash`. Use MCP when an agent host should request validation directly. Use the CLI when a shell pipeline, developer, or CI workflow owns orchestration.

If you are evaluating the broader workflow, read the [learning hub](https://browserbash.com/learn) and inspect the [open-source repository](https://github.com/PramodDutta/browserbash). Apache-2.0 licensing makes the implementation inspectable, but operational fitness still comes from a proof against your application, network, browser image, and failure policies.

## A practical rollout checklist

Begin with one public, read-only page and one deterministic assertion. Record BrowserBash 1.5.1, Node, browser build, architecture, viewport, locale, provider, endpoint allocation, model route, and application build. Make the run pass twice, then deliberately break the expected condition and confirm the pipeline reports a validation failure rather than infrastructure error.

Add authentication next. Save a login profile intentionally, scope it to the right origins, and verify secret masking in NDJSON and Result.md. Rotate or invalidate the profile on the same schedule as its underlying account. Never bake an active session into a reusable public browser image.

Introduce suite parallelism only after a single run is diagnosable. Set browser capacity, runner capacity, and model concurrency explicitly. Add a budget, then shard on sorted discovery order. Preserve artifacts even when the job exits 1, 2, or 3. A report that disappears on failure is least available when it matters most.

Finally, test cleanup by killing the job mid-run. The browser allocation should expire, credentials should become useless, temporary data should be bounded, and the next run should receive a fresh profile. Document the owner for browser images, endpoint security, model keys, test data, and triage. ai tests kubernetes becomes dependable when every boundary has an owner and evidence.

## FAQ

### Can BrowserBash run ai tests kubernetes without CSS selectors?

Yes. You provide a plain-English objective or Markdown test, and the agent drives a real Chrome or Chromium browser without page objects or selectors. Deterministic Verify grammar compiles supported assertions to Playwright checks, while unsupported Verify wording is clearly flagged as agent-judged.

### Does Kubernetes browser pods require a paid AI model?

No. BrowserBash is Ollama-first and can use free local models with no API keys, so nothing needs to leave the machine running the CLI. Hard, long flows are usually more reliable with a mid-size local model or a capable hosted model, and testmd v2 currently requires the builtin engine through Anthropic or a compatible gateway.

### How should CI interpret a failed BrowserBash assertion?

Treat it as a completed validation whose verdict is failed, not automatically as an infrastructure crash. Use NDJSON, exit code 1, assertion evidence, Result.md, and JUnit output to apply your merge policy; reserve exit code 2 for errors, infrastructure issues, or budget stops, and exit code 3 for timeouts.

### Is an account required to use BrowserBash?

No. The CLI, local models, local dashboard, Markdown tests, and structured results can run without a BrowserBash account. The optional free cloud dashboard uses `browserbash connect` and `--upload`, and retains uploaded data for 15 days.

Install version 1.5.1 with `npm install -g browserbash-cli`, run one bounded validation, and expand only after its evidence is useful. You can also [sign up for the optional dashboard](https://browserbash.com/sign-up) if shared cloud visibility helps your team.
