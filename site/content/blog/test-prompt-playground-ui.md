---
title: Test a Prompt-Playground UI With Plain-English Tests
description: "Learn how to test prompt playground UI flows (model pickers, temperature sliders, output panes) with plain-English BrowserBash tests, no selectors."
date: 2026-07-31
category: llm
---

If you ship an LLM product, the prompt playground is the surface your users touch first, and it is also the hardest thing to test with a traditional framework. To test a prompt playground UI you have to exercise a model picker, drag a temperature slider, toggle streaming, submit a prompt, and then wait for a non-deterministic token stream to land in an output pane that never renders the same twice. Selectors churn every sprint. Snapshot tests explode on every model update. This post shows how to describe those flows in plain English and let an AI agent drive a real browser through them, so your tests read like intent instead of brittle DOM plumbing.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors and no page objects, and you get back a deterministic verdict plus structured results. That model fits a prompt playground unusually well, because the parts of a playground that matter (did the right model get selected, did the output pane fill, did the token count update) are things you can describe in a sentence but would spend an afternoon encoding as locators.

## Why a prompt playground breaks conventional UI tests

A conventional Playwright or Cypress test assumes the page is a fixed tree of stable elements. Prompt playgrounds violate that assumption on almost every axis.

The output is non-deterministic by design. You send temperature 0.9 and ask for a poem, and the exact text differs on every run. A snapshot assertion against the response body is guaranteed to fail. You cannot pin the output, so any assertion has to target structure and behavior, not exact strings.

The controls are dense and custom. Temperature is usually a custom slider, not a native `<input type="range">`. The model picker is often a combobox that fetches its options from an API, so the DOM is not populated until a network round trip finishes. Streaming toggles, max-token steppers, top-p, system-prompt textareas, and stop-sequence chips all live in a settings drawer that opens and closes. The moment a designer reorganizes that drawer, every CSS selector you wrote points at nothing.

Timing is unpredictable. A streamed response fills the output pane token by token over anywhere from 400 milliseconds to 30 seconds depending on the model and prompt. Hardcoded waits are either flaky or slow. You need a test that waits for a condition (text appeared, spinner gone) rather than a fixed duration.

Model updates change everything downstream. When your team swaps the default model, the option label changes, the default parameter values change, and sometimes the output format changes. A test written against intent survives that. A test written against `[data-model-id="gpt-4o-mini"]` does not.

This is the exact seam where describing a flow in English beats encoding it in selectors. You are not testing that a specific `div` has a specific class. You are testing that a person could pick a model, set a temperature, run a prompt, and see an answer appear.

## Testing by intent instead of by selector

Here is the smallest possible example. Point BrowserBash at your playground and describe the whole flow as one objective.

```bash
npm install -g browserbash-cli

browserbash run "Open the prompt playground at http://localhost:5173, \
select the model named 'Claude Haiku' from the model picker, \
type 'Write a haiku about CI pipelines' into the prompt box, \
click Run, wait for a response to appear in the output pane, \
and store the response text as 'answer'" --agent --headless
```

The agent reads the page, finds the model picker without you naming its selector, opens it, chooses the matching option, fills the prompt, clicks the run control, and waits for the output pane to stop being empty. Because you asked it to store the response as `answer`, the structured result carries that value back out for downstream checks. The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or another AI agent can read the verdict without parsing prose. Exit codes are frozen and simple: `0` passed, `1` failed, `2` error, `3` timeout.

That single objective already covers the model picker, the prompt input, the run action, and the output pane. What it does not do yet is assert anything deterministic. Agent judgment is fine for "did a response appear," but for parameter controls you want a check that never involves a model's opinion. That is where deterministic Verify assertions come in.

## Deterministic assertions for parameter controls

The riskiest bugs in a playground are silent parameter bugs. The slider says 0.2 but the request goes out at the default 1.0. The model picker shows the new model but the backend still calls the old one. The max-tokens field caps at 256 but the UI lets you type 4096. None of these are visible in the output text, so an agent-judged "looks fine" will happily pass them.

BrowserBash `Verify` steps compile to real Playwright checks with no LLM judgment involved. A pass means the condition actually held. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable Result.md assertion table. The grammar covers the checks a playground needs: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, and a stored value equals a target.

You express these in a committable Markdown test file. Steps run top to bottom, plain-English steps get handled by the agent, and Verify lines get compiled to hard assertions.

```markdown
# Playground temperature control

- Open the prompt playground at {{base_url}}
- Open the settings drawer
- Set the temperature slider to 0.2
- Type "Summarize the CAP theorem in one sentence" into the prompt box
- Click Run
- Wait for a response to appear in the output pane

Verify: text "temperature: 0.2" visible
Verify: "Run" button visible
Verify: title contains "Playground"
```

The first block is intent. The Verify lines are contracts. If your UI echoes the active temperature somewhere in the request preview or a debug panel, that first Verify pins it deterministically. If a Verify line falls outside the supported grammar, BrowserBash still runs it, but agent-judged, and flags it with `judged: true` in the results so you can tell a hard assertion from a soft one at a glance. That distinction matters when you are triaging a red build at 2am and need to know whether a failure is a real regression or a model being fussy.

For a deeper tour of the Verify grammar and every assertion type, the [BrowserBash features page](https://browserbash.com/features) lays them out with examples.

## Seeding state deterministically with testmd v2

Playgrounds rarely start from a blank slate in a real product. There is a saved-prompts library, a history sidebar, usage quotas, and per-user model access. Testing the UI honestly means putting the backend into a known state first, then checking that the UI reflects it. Doing that seeding through the UI is slow and circular. Doing it through the API is fast and deterministic.

testmd v2 gives you both in one file. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session. Two step types never touch a model: API steps for seeding, and Verify steps for checking. Consecutive plain-English steps run as grouped agent blocks on the same page.

```markdown
---
version: 2
auth: playground-user
---
# Saved prompt appears in the library

POST {{api_url}}/prompts with body {"title": "Retry logic", "body": "Explain exponential backoff"}
Expect status 201, store $.id as 'prompt_id'

- Open the prompt playground at {{base_url}}
- Open the saved prompts library

Verify: text "Retry logic" visible
Verify: "Retry logic" link visible

- Click the saved prompt named "Retry logic"

Verify: text "Explain exponential backoff" visible
```

The API step seeds a prompt directly, captures its id, and then the agent block opens the library so the Verify steps can confirm the UI rendered what the API created. No flaky "create it through three modals first" dance. One honest caveat to plan around: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. For pure v1 objectives (no API or Verify steps), the local-model path is fully available.

The `auth: playground-user` line reuses a saved login so you are not re-authenticating every run, which is the next thing worth setting up.

## Reusing a login so every test starts signed in

Most playgrounds sit behind auth. Logging in on every test is slow, and encoding the login flow in each file is repetitive and fragile, especially if there is an OAuth hop or a magic link. BrowserBash saves a real browser session once and reuses it.

```bash
browserbash auth save playground-user --url https://app.example.com/login
```

That opens a browser, you log in by hand one time, press Enter, and it saves the Playwright storageState. From then on, pass `--auth playground-user` on any run, testmd, run-all, or monitor command, or set `auth:` in a test file's frontmatter as shown above. If a saved profile's origins do not cover the start URL you point it at, BrowserBash prints a warning rather than silently doing nothing, so a stale session fails loud instead of quiet.

This matters more for a playground than for a marketing page, because playground access is often gated by plan tier or feature flag. You can save one profile per tier (free-user, pro-user, admin) and run the same suite against each to confirm the model picker only offers the models that tier is entitled to.

## Handling streamed output and the output pane

The output pane is where timing bites hardest. A streamed answer arrives token by token, and a naive test either waits too long (slow suite) or too short (flaky failure). The plain-English approach sidesteps hardcoded sleeps because "wait for a response to appear in the output pane" is a condition, not a duration. The agent polls the page until the condition is true or the step times out.

For assertions on streamed content, target structure and existence rather than exact text. You cannot assert the poem equals a fixed string, but you can assert that the output pane is non-empty, that a copy button appeared next to the completed response, that the token counter moved above zero, and that the stop button reverted to a run button when streaming finished. Those are all deterministic Verify targets.

```markdown
# Streaming completes and controls reset

- Open the prompt playground at {{base_url}}
- Type "List three retry strategies" into the prompt box
- Click Run
- Wait for the streamed response to finish in the output pane

Verify: "Copy" button visible
Verify: "Run" button visible
Verify: text "tokens" visible
```

The Verify for a visible Run button is a clean way to confirm streaming ended, because most playgrounds swap Run for Stop during a stream and swap it back when the stream closes. You are testing the state machine of the control, which is deterministic, instead of the content, which is not.

If you want to actually inspect the generated text, store it and let a later step read it. The stored value flows into `run_end`, and you can Verify a stored value equals an expected string when the prompt is deterministic enough to produce stable output, for example temperature 0 with a factual single-token answer.

## Running the full matrix in CI

A playground is really a grid of combinations: several models times a few temperature presets times two or three viewports. You want that grid to run in parallel, stay inside a token budget, and split cleanly across CI machines. The `run-all` orchestrator handles all three.

```bash
browserbash run-all ./tests/playground \
  --shard 2/4 \
  --matrix-viewport 1280x720,390x844 \
  --budget-usd 2.00 \
  --junit out/junit.xml \
  --agent
```

Sharding computes a deterministic slice on the sorted discovery order, so four parallel machines each take `--shard 1/4` through `--shard 4/4` and agree on the split without coordinating. The viewport matrix runs every test once per viewport and labels each result in events, JUnit, and Result files, which catches the classic playground bug where the settings drawer overflows on mobile and the temperature slider becomes unreachable. The budget flag stops launching new tests once estimated spend crosses the limit: remaining tests report `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit `<properties>`. Cost estimates come from a bundled per-model price table, and unknown models get no estimate rather than a wrong one.

The orchestrator derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first, and flags flaky ones across runs. For the official GitHub Action that wires this into a pull request with a self-updating verdict comment, see the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## Keeping a live playground honest with monitors

Testing before merge is half the job. A playground can pass CI and still break in production the day a model provider changes a response header or a feature flag flips. Monitor mode runs a test or objective on an interval and alerts only when the pass or fail state changes, in either direction, never on every green run.

```bash
browserbash monitor ./tests/playground/smoke_test.md \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX/YYY/ZZZ \
  --auth playground-user
```

Slack incoming-webhook URLs get Slack formatting automatically. Any other URL gets the raw JSON payload, so you can route it to PagerDuty, a Lambda, or your own dashboard. The replay cache is what makes an always-on monitor practical: a green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. So a ten-minute smoke test on your playground costs almost nothing in tokens until something breaks, at which point the agent re-engages and you get one alert.

## Testing the playground from inside your AI agent

There is a second audience for playground tests: the AI coding agent that is building the playground. BrowserBash ships an MCP server so Claude Code, Cursor, Windsurf, Codex, or Zed can call it as a native validation tool.

```bash
claude mcp add browserbash -- browserbash mcp
```

That exposes three tools to the agent: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder run in parallel. Each returns the structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The key mental shift is that a failed test is a successful validation. The tool call succeeds and the agent reads the verdict, so when your coding agent changes the model picker and then calls `run_test_file` on the playground suite, it learns immediately whether it broke the temperature control, without you copy-pasting a stack trace. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`. The [tutorials section](https://browserbash.com/tutorials) walks through wiring it into each host.

## When plain-English tests are the wrong tool

Credibility matters more than a clean pitch, so here is where this approach is not the best fit.

If you need to assert exact pixel positions, computed CSS values, or precise color contrast ratios, a screenshot-diff tool or a direct Playwright assertion on computed styles is more appropriate. BrowserBash tests intent and behavior, not pixels.

If your assertion depends on exact generated text from a non-deterministic model, no framework can make that stable. Pin temperature to 0, use a factual prompt with a single correct answer, or assert on structure instead of content. This is a property of LLMs, not a limitation of any test runner.

If you are running a very small local model (roughly 8B parameters and under) against a long multi-step objective, it can be flaky. The sweet spot for hard flows is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. For a five-step playground smoke test a small local model is usually fine. For a twenty-step regression across every parameter, reach for something larger.

And if your team already has a stable Playwright suite that nobody is fighting, you do not need to rip it out. The honest move is to add plain-English tests where selectors hurt most (the parts of the playground that change every sprint) and keep the deterministic Playwright tests where they are cheap and stable. You can even migrate incrementally: `browserbash import` converts existing Playwright specs to plain-English test files heuristically, with no model in the loop, and anything it cannot translate lands in an `IMPORT-REPORT.md` rather than being silently dropped or invented.

A quick decision checklist: use plain-English BrowserBash tests when the flow is intent-shaped and the DOM is churny (model pickers, settings drawers, streaming output, multi-step wizards). Use deterministic Verify steps for the parameter contracts inside that flow. Use raw Playwright when you need pixel-precise or computed-style assertions. Use all three together in the same repo, because they are complementary, not competing.

## A realistic end-to-end example

Putting the pieces together, here is what a serious playground suite looks like. You save one auth profile per plan tier. You write a v2 test that seeds a saved prompt via API and confirms it renders. You write parameter tests with Verify steps pinning temperature, max tokens, and the active model label. You write a streaming test that checks the control state machine rather than the content. You run the whole grid in CI with sharding, a viewport matrix, and a budget cap, put a ten-minute monitor on the production smoke path, and let your coding agent call the same suite through MCP on every change.

The result is a test surface that reads like a description of what the playground is supposed to do, survives model swaps and drawer redesigns, and costs almost nothing to keep running because the replay cache handles the steady state. When something breaks, you get one alert with expected-versus-actual evidence, not a wall of selector-not-found noise. Browse the [BrowserBash blog](https://browserbash.com/blog) for more patterns like seeding, auth reuse, and CI integration.

## FAQ

### How do you test a prompt playground UI when the output is different every time?

Assert on structure and behavior instead of exact text. Check that the output pane is non-empty after running, that the run control reverts from Stop to Run when streaming finishes, and that a token counter or copy button appeared. If you truly need stable output, pin the temperature to 0 and use a factual prompt with a single correct answer, then Verify a stored value equals your expected string.

### Can I test model pickers and temperature sliders without writing selectors?

Yes. You describe the action in plain English, for example "select the model named Claude Haiku from the model picker" or "set the temperature slider to 0.2," and the AI agent locates and operates the control by reading the page. For the parameter values that must be exact, add deterministic Verify steps that compile to real Playwright checks so a silent mismatch fails the build with expected-versus-actual evidence.

### Does testing a playground with an AI agent cost a lot in tokens?

Not in steady state. The replay cache records a green run's actions and replays them on the next identical run with zero model calls, stepping the agent back in only when the page actually changed. An always-on ten-minute monitor is therefore nearly token-free until something breaks, and run-all supports a hard budget cap that skips remaining tests once estimated spend crosses your limit.

### How do I seed backend state before testing the playground UI?

Use testmd v2 by adding version 2 to a test file's frontmatter. You can then include deterministic API steps that call your backend directly to create prompts, quotas, or user state, capture returned values, and follow them with plain-English steps and Verify assertions that confirm the UI renders that state. Note that v2 currently runs on the builtin engine, which needs an Anthropic API key or a compatible gateway.

BrowserBash is free and open-source, and you can start testing your prompt playground UI in about a minute. Install it with `npm install -g browserbash-cli`, point it at your playground with a plain-English objective, and add Verify steps once the flow works. An account is optional, but if you want the free hosted dashboard and 15-day run history you can create one at https://browserbash.com/sign-up.
