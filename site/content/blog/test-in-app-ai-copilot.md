---
title: Test an In-App AI Copilot Panel With Plain-English AI
description: "Learn how to test in app AI copilot panels: side-panels, suggestion chips, and apply-actions verified by intent with plain-English BrowserBash tests."
date: 2026-08-03
category: agents
---

Your product now ships an AI copilot in a side-panel: a chat surface, a row of suggestion chips, and an "apply" button that mutates the real document. It is the hardest thing in your app to test, because the output is non-deterministic. If you want to test an in app AI copilot the way you test a login form, you will fight two problems at once: the panel renders differently every session, and the response text is never the same twice. Selector-based frameworks were built for stable DOM and stable strings. A copilot has neither. This guide shows a different approach: describe what the copilot should *do* in plain English, let an AI agent drive a real browser to check it, and get a deterministic verdict back even when the underlying model output varies.

The core idea is intent-based verification. You do not assert that the panel returned the exact sentence "Here are three ways to improve this paragraph." You assert that a suggestion appeared, that clicking a chip populated the input, and that the apply-action changed the document in a way a human would recognize as correct. That shift, from string-matching to intent, is what makes copilot panels testable at all.

## Why copilot panels break traditional selectors

Walk through a normal Playwright or Cypress test of a copilot and you hit friction immediately. The panel is often a portal rendered outside the main DOM tree, so your usual container scoping misses it. Suggestion chips are generated from the model response, so their text, count, and order change per run. The streaming response means the DOM is in flux for several seconds, and a naive `expect(locator).toHaveText(...)` races the stream. The apply-action writes into a contenteditable or a rich-text editor whose internal structure you do not control.

You can paper over each of these with waits, retries, and loosened matchers, but the test rots fast. Every prompt tweak on the product side shifts the chip text, and your carefully pinned `getByText` assertion goes red on a working feature. That is the classic false-positive tax of testing generative UI with exact-match tools. The DOM churn is real, but the deeper issue is that you are asserting the wrong thing. You care whether the copilot *helped*, not whether it emitted a specific token sequence.

### The three surfaces you actually need to verify

A copilot panel decomposes into three testable surfaces, and it helps to name them:

- **The side-panel itself**: does it open, does it stay open, does it show a ready-to-type state, does it close and reopen without losing context.
- **Suggestion chips**: does the panel surface actionable suggestions, and does interacting with one do something sensible (populate the input, run the suggestion, or expand a detail view).
- **Apply-actions**: the moment the copilot's output crosses from the panel into your real document or form. This is the highest-value and highest-risk surface, because a wrong apply corrupts user data.

Test all three by their intended effect, not their literal rendering, and the flakiness mostly evaporates.

## The plain-English approach with BrowserBash

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) command-line tool that turns a plain-English objective into a real browser run. You write what should happen; an AI agent drives Chrome step by step, with no selectors and no page objects, and returns a deterministic verdict plus structured results. For a copilot panel, that means you can write "open the assistant panel, ask it to summarize the article, and confirm a summary appears" and let the agent figure out where the panel is and how to reach it.

Because the agent reasons about the page the way a person would, it tolerates the DOM churn that wrecks selector tests. A portal-rendered panel is just "the panel" to the agent. A chip whose text changed from "Shorten this" to "Make it concise" is still recognizably a suggestion chip. You describe intent once, and the agent re-derives the mechanics each run.

Install it globally and run a first check against a live copilot:

```bash
npm install -g browserbash-cli

browserbash run "Open https://app.example.com, click the assistant icon in the top-right to open the copilot side-panel, type 'summarize this page' into the chat input, submit, and confirm the panel shows a summary response with at least two sentences" --agent --headless
```

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or another AI agent can read the run without parsing prose. Exit codes are frozen and predictable: `0` passed, `1` failed, `2` error, `3` timeout. That combination, a stream of structured step events plus a clean exit code, is what lets you drop a copilot check into a pipeline and trust the result.

BrowserBash is Ollama-first: by default it uses a free local model and nothing leaves your machine, then falls back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or OpenRouter if you have one set. One honest caveat up front: very small local models (around 8B and under) get flaky on long multi-step objectives. For a multi-step copilot flow, a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model gives you far more reliable runs.

## Verifying intent, not exact copy

The single most useful habit when you test an in app AI copilot is to write assertions about outcomes a human could confirm, not strings a machine emitted. "The apply button inserted new text into the document" is a stable, checkable claim across a thousand runs. "The document now contains the exact phrase X" is a landmine.

BrowserBash gives you two layers to express this. Plain-English objectives let the agent judge fuzzy outcomes ("a summary appeared," "the tone looks more formal"). Deterministic `Verify` assertions compile to real Playwright checks with no model judgment at all, for the parts of the flow that *are* stable: the panel opened, a button is visible, the URL changed, a stored value equals what you expect. You mix the two so the deterministic scaffolding pins down structure while the agent judges the generative core.

Here is a committable Markdown test (`*_test.md`) for a copilot summarize-and-apply flow. It uses testmd v2, where steps run one at a time against a single browser session:

```bash
browserbash testmd run ./tests/copilot_apply_test.md --agent
```

And the test file itself:

```
---
version: 2
---
# Copilot summarize and apply

1. Open https://app.example.com/docs/welcome
2. Click the assistant icon to open the copilot side-panel
3. Verify 'Assistant' heading visible
4. Type "give me a one-paragraph summary" into the chat input and submit
5. Wait for the response to finish streaming
6. Verify text "Apply" visible
7. Click the Apply button to insert the summary into the document
8. Confirm the document body now contains a new summary paragraph that was not there before
```

Steps 3 and 6 are deterministic `Verify` lines: they compile to real Playwright visibility checks and pass or fail on structure alone. Step 8 is agent-judged, because "a new summary paragraph that was not there before" is exactly the kind of fuzzy outcome only a reasoning agent can confirm. When a `Verify` step fails, `run_end.assertions` and the generated `Result.md` carry expected-versus-actual evidence, so you see precisely which structural check broke.

### Testing suggestion chips by behavior

Suggestion chips deserve their own objective, because their whole purpose is to be clicked. You cannot pin the chip text, but you can verify the *behavior* of interacting with one:

```bash
browserbash run "Open the copilot panel on https://app.example.com, wait for suggestion chips to appear below the input, click the first suggestion chip, and confirm that clicking it either populated the chat input with text or triggered a new assistant response" --agent --headless
```

Notice the objective allows for two valid outcomes: the chip populated the input, or it fired a response. Copilots differ in this behavior, and a good intent-based test accepts any correct implementation rather than forcing one. That flexibility is the whole point. You are testing that the chip does something useful, not that it does one specific hardcoded thing.

## Handling authentication and stateful copilots

Most real copilots live behind a login, and many only unlock their good suggestions once there is real content on the page. Re-logging in on every test is slow and brittle. BrowserBash solves this with saved logins. You log in once, interactively, and reuse the session everywhere.

```bash
browserbash auth save acme --url https://app.example.com/login

browserbash run "Open the workspace, open the copilot side-panel, and confirm it greets the signed-in user by name" --auth acme --agent --headless
```

The `auth save` command opens a browser, you log in by hand, press Enter, and it stores the Playwright storageState. Every later run with `--auth acme` reuses that session. If a saved profile's origins do not cover the start URL you point it at, BrowserBash prints a warning instead of silently doing nothing, which saves you from the classic "why is it logged out" mystery. You can also set `auth:` in a test file's frontmatter so the whole suite inherits the session.

### Seeding state with deterministic API steps

Copilot behavior often depends on the data already in the document. A summarize action needs something to summarize; a "suggest next steps" action needs a task list to reason about. Rather than click through your UI to build that state, testmd v2 lets you seed it with deterministic API steps that never touch a model:

```
---
version: 2
auth: acme
---
# Copilot suggests next steps on a populated project

1. POST https://api.example.com/projects with body { "name": "Launch", "tasks": ["draft copy", "design hero"] }
2. Expect status 201, store $.id as 'projectId'
3. Open https://app.example.com/projects/{{projectId}}
4. Open the copilot side-panel and ask it to suggest the next step
5. Verify text "next step" visible
6. Confirm the suggestion references either "draft copy" or "design hero" from the project tasks
```

The `POST` and `Expect status` steps are pure HTTP, reproducible and model-free, so your test's *setup* is deterministic even though the copilot's *output* is not. That split is the whole trick to reliable generative-UI testing: make everything you can deterministic, and reserve agent judgment only for the genuinely fuzzy assertion at the end.

## Wiring copilot checks into CI and MCP

A copilot regression is easy to miss in manual QA because the output "looks fine." Automated checks in CI catch the failures humans skim past: the panel that stopped opening after a bundle change, the apply-action that silently no-ops, the suggestion chips that vanished. BrowserBash ships a [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) that installs the CLI, runs your suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with a verdict table.

Because copilot runs can call a hosted model and cost real money, you can cap spend per suite and shard across machines:

```bash
browserbash run-all ./tests/copilot --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

The `--shard 2/4` slice is computed on sorted discovery order, so four parallel CI machines each take a quarter of the tests without any coordination. `--budget-usd 2.00` stops launching new tests once the suite crosses the budget: the remaining tests report `skipped`, the suite exits `2`, and the spend lands in `RunAll-Result.md` and the JUnit properties. For a copilot suite that hits an LLM per run, that hard stop is a genuine safeguard against a runaway bill.

### Exposing copilot tests to your own agents over MCP

There is a neat recursion here: your copilot is an AI feature, and you can have another AI agent validate it. BrowserBash runs as an MCP server, so Claude Code, Cursor, Windsurf, Codex, or Zed can call your copilot tests as native tools.

```bash
claude mcp add browserbash -- browserbash mcp
```

That one line registers three tools in the host: `run_objective` (a single plain-English objective), `run_test_file` (a `*_test.md` file), and `run_suite` (a folder, run in parallel). Each returns the structured verdict JSON with `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. An important mental model: a failed copilot test is a *successful* validation. The MCP tool call succeeds and hands the agent a verdict; the agent reads that the copilot regressed and can act on it. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so discovery is one step in hosts that support it. If you are building your own agent workflows, the [tutorials](https://browserbash.com/tutorials) walk through the MCP setup end to end.

## Comparing your options for copilot testing

There is no single right tool, and it is worth being honest about where each approach wins. Here is how the common choices line up for the specific job of verifying a copilot panel.

| Approach | Handles non-deterministic output | DOM-churn tolerance | Setup effort | Best fit |
| --- | --- | --- | --- | --- |
| Playwright / Cypress (selectors) | Poor, exact matchers fight the stream | Low, portals and dynamic chips break locators | High, page objects per surface | Stable, deterministic UI |
| Manual QA | Good, a human judges intent | High, humans adapt | None, but not repeatable | Exploratory and design review |
| Vision-only AI testers | Good | Medium, screenshot drift | Medium | Pixel-level UI checks |
| BrowserBash (intent + deterministic Verify) | Good, agent judges fuzzy, Verify pins structure | High, agent re-derives mechanics | Low, plain-English objectives | Copilot panels, agentic UI, mixed flows |

The row that matters most for a copilot is the first column. Selector frameworks are excellent tools, and if you have a stable, deterministic form, they are faster and cheaper than any AI approach. The moment the thing under test emits variable output, exact matchers become a maintenance sinkhole, and an intent-based agent that judges outcomes earns its keep.

### When a selector framework is still the better choice

Do not rip out Playwright because you added a copilot. If most of your app is deterministic CRUD, keep testing it with deterministic selectors, which are faster, cheaper, and need no model. Reach for plain-English AI testing specifically for the surfaces that defeat selectors: the copilot panel, agent-generated content, dynamic recommendation feeds, and anything where "correct" is a judgment rather than a string. Many teams run both, and BrowserBash's `browserbash import` command can even convert existing Playwright specs to plain-English `*_test.md` files heuristically so you can migrate the flaky ones without rewriting from scratch. Read more on mixing the two in the [learn hub](https://browserbash.com/learn).

## Monitoring a live copilot in production

Copilots degrade in ways unit tests never see: the upstream model provider ships a quieter model, a prompt template change lands, a rate limit starts throttling suggestions. You want to know the moment the panel stops behaving, not when a user files a ticket. Monitor mode runs a check on an interval and alerts only when the verdict flips.

```bash
browserbash monitor ./tests/copilot_smoke_test.md --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ --auth acme
```

This runs your copilot smoke test every ten minutes and pings the Slack webhook only on a pass-to-fail or fail-to-pass transition, in both directions, never on every green run. Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload. The replay cache keeps the cost near zero: a green run records its actions, and the next identical run replays them with no model calls, stepping the agent back in only when the page actually changed. That makes an always-on copilot monitor cheap enough to leave running indefinitely.

### Reading the structured verdict

Every run writes a human-readable `Result.md` and, with `--agent`, emits NDJSON events. For a copilot test, the useful fields are the `assertions` block (each `Verify` line with pass or fail and expected-versus-actual evidence), the `final_state` summary of where the run ended, and `cost_usd` so you can watch spend trend over time. Verify lines that fall outside the deterministic grammar still run, but agent-judged, and get flagged `judged: true`, so you can always tell which assertions were strict Playwright checks and which were the agent's reasoning. That transparency matters when you are debugging a copilot flake: you want to know whether the panel structure broke or whether the model's answer simply drifted.

## A practical rollout plan

If you are adding copilot coverage from zero, sequence it so you get signal fast and cost stays controlled.

Start with one smoke test that opens the panel and confirms it reaches a ready state. That single check catches the most common and most embarrassing regression, a copilot that fails to open at all. Save an auth profile so the smoke test runs against a real signed-in workspace. Add a second test for the apply-action, since that is where user data is at risk, and lean on the agent-judged outcome ("the document changed in a recognizable way") rather than exact copy. Add a suggestion-chip test that accepts any correct interaction behavior. Wire all three into CI with a per-suite budget so a bad day at your model provider cannot drain your account. Finally, promote the smoke test to a production monitor on a ten-minute interval.

That is a full copilot testing story in five files, and every one of them is plain English you can read in a code review. Browse the [blog](https://browserbash.com/blog) for deeper walkthroughs of individual pieces, and check [pricing](https://browserbash.com/pricing) if you want the optional hosted dashboard, remembering that everything running on your own machine stays free forever.

## FAQ

### How do you test an AI copilot when the output changes every time?

You test by intent rather than by exact text. Instead of asserting the copilot returned a specific sentence, you assert that a response appeared, that it is the right shape (a summary, a suggestion, an applied edit), and that any structural elements like the panel and buttons are present. BrowserBash lets an AI agent judge those fuzzy outcomes while deterministic Verify steps pin down the stable structure, so a working feature stays green even as the generated text varies run to run.

### Can BrowserBash verify that a copilot suggestion chip actually works?

Yes. You write an objective describing the expected behavior, for example clicking the first suggestion chip and confirming it either populated the chat input or triggered a new response. The agent locates the chip even though its text and position change per session, then checks that interacting with it produced a sensible effect. Because you describe the intended behavior instead of a hardcoded string, the test accepts any correct implementation.

### Do I need an API key to test a copilot panel with BrowserBash?

Not necessarily. BrowserBash is Ollama-first and defaults to a free local model with nothing leaving your machine, so simple flows can run with no key at all. For long multi-step copilot flows, a mid-size local model or a hosted model gives more reliable results, since very small local models can get flaky on complex objectives. Note that testmd v2 currently drives the builtin engine, which needs an Anthropic API key or a compatible gateway.

### How can I monitor a copilot in production without huge model costs?

Use monitor mode with the replay cache. A passing run records its actions, and subsequent identical runs replay them with zero model calls, so an always-on monitor stays nearly token-free until the page actually changes. Monitor mode also alerts only when the verdict flips between pass and fail, so you get a Slack or webhook ping on a real regression rather than noise on every healthy run.

Ready to test your copilot panel by intent instead of brittle selectors? Install the CLI with `npm install -g browserbash-cli` and write your first plain-English check in minutes. An account is optional and everything on your machine is free, but if you want the hosted dashboard and monitors you can [sign up here](https://browserbash.com/sign-up).
