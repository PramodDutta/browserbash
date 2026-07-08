---
title: Any MCP Client, One Browser Validator: BrowserBash
description: "Wire browserbash mcp into any MCP client for real-browser testing: stdio transport, three tools, and a structured verdict every host can trust."
date: 2026-07-28
category: agents
---

If you have started wiring tools into Claude Code, Cursor, Windsurf, Codex, or Zed, you have probably hit the same wall: your agent can read code, write code, and run unit tests, but it cannot tell you whether the thing actually works in a browser. That gap is exactly what a good mcp client browser testing tool exists to close, and it is why BrowserBash, [published on npm](https://www.npmjs.com/package/browserbash-cli) as `browserbash-cli`, ships an MCP server. One install, three tools, and any MCP-speaking client on your machine gains the ability to open a real Chrome, drive a plain-English flow, and get back a verdict it can branch on. It is not another abstraction bolted onto your agent's context window, it is a validation loop the agent calls the same way it calls any other tool, over the protocol it already understands.

This is a general-purpose guide to that wiring: how the stdio transport works, what the three tools expose, what the structured verdict looks like, and how to think about cost and caching once your agent is calling a browser dozens of times a day.

## Why MCP Clients Need a Real Browser Testing Tool

Model Context Protocol standardized how an AI client talks to external tools, but it did not solve the older problem of an agent being blind to running software. Your coding agent edits files. It does not open a page, click through a checkout flow, or watch a toast render after a form submit. Ask it "does the signup flow work now?" and it will, at best, run unit tests and infer. Unit tests assert on functions. They pass on a page that renders a blank white screen because the JavaScript bundle 404'd.

The fix is not a smarter model. It is giving the agent a tool that performs the check a human QA engineer would: open a real browser, do the thing, report pass or fail with evidence. That is the entire job of a browser testing tool built for MCP clients: close the loop between "I edited the code" and "I confirmed it works," without a human babysitting the confirmation.

Because MCP is a shared protocol, this only has to be built once. A browser validator that speaks MCP over stdio does not care whether the caller is Claude Code, Cursor, Codex, Windsurf, or Zed. The client sends a tool call, the server drives a browser, the client gets JSON back. That is why "any MCP client, one browser validator" is a realistic claim, not a slogan.

## What the BrowserBash MCP Server Actually Exposes

`browserbash mcp` starts the CLI's MCP server on stdio. No HTTP port, no separate daemon: your MCP host spawns the process, talks JSON-RPC over stdin/stdout, and tears it down when the session ends. That is the standard stdio transport MCP defines, the same shape every other local MCP server uses, so there is nothing BrowserBash-specific to learn about the protocol layer.

What is BrowserBash-specific is the three tools the server exposes:

- **`run_objective`**: takes one plain-English objective string ("Open the pricing page and verify the Pro plan shows $49/month") and runs it against a real browser session.
- **`run_test_file`**: takes the path to a `*_test.md` file and runs the committed test exactly as written, including any `@import` composition and `{{variable}}` substitution.
- **`run_suite`**: takes a folder of `*_test.md` files and runs them in parallel, using the same memory-aware orchestrator that powers `browserbash run-all` from the command line.

Every one of these three tools returns the same shape of result: a structured verdict object, not a wall of prose. That consistency is what makes BrowserBash usable across MCP clients with very different UI conventions for showing tool output. The client does not need to parse English to know what happened; it reads `status` and moves on.

Underneath, the MCP server drives the same engine and provider stack as the CLI: Stagehand by default (MIT-licensed, no selectors) or the builtin Anthropic tool-use engine when you need it, against your local Chrome, a CDP endpoint, or a cloud grid. Going through MCP does not change what BrowserBash can test, only how the result gets back to the agent that asked.

## Installing BrowserBash Into Any MCP Client

The install path is intentionally the same one-liner shape most MCP hosts use for local stdio servers. First the CLI itself, then registration with your client. For Claude Code, registration is a single command:

```bash
npm install -g browserbash-cli
claude mcp add browserbash -- browserbash mcp
```

That second line tells Claude Code: when you need the `browserbash` server, spawn `browserbash mcp` and talk to it over stdio. Cursor, Windsurf, Codex, and Zed support the same pattern, a command plus arguments registered against a server name, just through their own config UI or file instead of a CLI flag. The command never changes: `browserbash mcp`. What changes is where you paste it.

You do not need an API key to get started. BrowserBash resolves models Ollama-first: it looks for a local Ollama install before falling back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, failing with setup guidance instead of guessing if none are present. That means the MCP server can run entirely offline, with nothing about the objective, the page content, or the result leaving your machine, unless you deliberately point it at a hosted model or a cloud browser provider.

One honest caveat: very small local models, 8B parameters or fewer, get flaky on long multi-step objectives. A login-then-checkout-then-confirm flow is a lot of sequential judgment for a small model to hold together. If `run_objective` gives inconsistent verdicts on a complex flow, the fix is usually stepping up to a 70B-class local model (Qwen3 or Llama 3.3 in that range) or a hosted model for the hard flows specifically, keeping the small local model for quick smoke checks.

## Client-by-Client Notes That Actually Matter

The registration mechanics differ slightly by client, but a few things are worth knowing everywhere. `browserbash mcp` resolves relative paths (test files, `.browserbash/` config, cache) against the process's current working directory, normally wherever your MCP client was launched from. If `run_test_file` cannot find a test you know exists, check that the client spawned the server from the project root, not some unrelated shell location.

Environment variables need to pass through the spawn. If you are using `ANTHROPIC_API_KEY` or a saved auth profile, those must be visible to the environment the MCP host spawns the server in; most clients inherit your shell environment automatically when you register via a config file, but a few sandboxed setups need the variable set explicitly in the server's config entry.

Because BrowserBash reads project-level test files and config from `./.browserbash/`, register the MCP server per project rather than globally, or make sure your client's spawn command sets the working directory correctly per workspace. Claude Code and Cursor both scope MCP servers per project by default when you register from inside the project.

To verify the wiring, ask your agent to run a trivial objective, something like "check that example.com loads and the title contains Example." A tool call to `run_objective` followed by a structured result means the wiring is correct. If it hangs or errors, the most common cause is a missing model resolution path, not a broken MCP connection, so check your Ollama or API key setup before debugging the transport.

## The Three Tools in Practice

`run_objective` is the one you reach for constantly during active development. It takes a single English sentence and nothing else structural, which makes it the fastest way for an agent to sanity-check a change it just made. `run_test_file` is for anything you want repeatable and committed to source control: point it at a `*_test.md` file and it runs precisely what is written there, with variables substituted and imports resolved. `run_suite` is the one you want for pre-merge or pre-deploy gates, running a whole folder of tests in parallel rather than one at a time. Here is the CLI-equivalent shape of each, which is exactly what the corresponding MCP tool call carries:

```bash
browserbash run "Open http://localhost:3000/checkout, add the Pro plan to cart, and verify the total shows $49.00" --agent --headless
browserbash testmd run ./.browserbash/tests/checkout_test.md
browserbash run-all .browserbash/tests --junit out/junit.xml
```

The `run_objective` tool call carries the same objective string as the first line and returns the same structured verdict the `--agent` flag prints as NDJSON. Going through MCP instead of shelling out means your agent gets a typed tool call it can retry, branch on, or chain, rather than a subprocess whose stdout it has to parse.

An agent calling `run_objective` repeatedly during a debugging session is improvising a check each time; an agent calling `run_test_file` is running the same check a human wrote and reviewed. Use `run_objective` for exploratory verification while iterating, and graduate the flow into a `*_test.md` file once it is something you want checked the same way every time.

Over MCP, `run_suite` takes a directory path and returns an aggregate structured result for every test in that folder, using the same memory-aware concurrency the CLI's `run-all` computes from actual CPU and RAM, not a fixed worker count. Previously-failed tests run first, slowest tests next, so a failing suite fails fast instead of burning the full parallel budget on tests you already know pass.

## Reading the Structured Verdict

This is what makes BrowserBash useful as an MCP browser testing tool rather than just a browser automation tool with an MCP wrapper. Every tool call, regardless of which of the three you used, returns the same verdict shape: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`.

`status` is the field your agent should branch on: not a paragraph to interpret, a value to check. `summary` is a short human-readable line for when a person is reading the transcript, not for the agent's control flow. `final_state` captures what the page looked like at the end of the run, useful context if the agent needs to reason about why something failed. `assertions` is where deterministic `Verify` checks land, each with expected-vs-actual evidence when they fail. `cost_usd` is a per-run cost estimate from a bundled per-model price table, so you can see what a verification pass actually cost, not guess.

That last field matters more than it looks. An MCP client calling a browser validator repeatedly during an active debugging loop is running up real cost if the underlying model is a hosted one, and seeing `cost_usd` on every returned verdict is what lets you notice a runaway loop before it becomes a surprise bill.

## A Failed Test Is a Successful Validation

This trips people up the first time they wire an MCP browser tool into an agent loop: a failed test is not a tool error. The tool call succeeds. The browser opened, the flow ran, the check completed, and the answer happened to be "no, this does not work." That is the tool doing its job correctly.

The distinction matters for agent-side logic. If your agent treats every non-pass `status` as an exception to catch and retry, it will loop uselessly against a genuinely broken flow. The correct pattern: the MCP call itself either succeeds (a verdict, pass or fail) or fails (infra problem, timeout, bad test file), and only the latter is worth retrying. A `status: "failed"` verdict is data the agent should read and use to decide its next code change, not noise to swallow.

The CLI carries the same distinction through exit codes outside of MCP: `0` passed, `1` failed, `2` error, `3` timeout. BrowserBash separates "the check ran and told you the truth" from "the check could not run at all" everywhere in the product, not just in MCP.

## BrowserBash MCP vs. Rolling Your Own Browser Tool

A reasonable question once you see how this works: why not give your agent raw Playwright or Puppeteer tool calls and let it drive the browser step by step? Some teams do exactly that, and for narrow, well-understood flows it works. Here is the honest comparison.

| | BrowserBash MCP | Raw Playwright/Puppeteer tool calls |
|---|---|---|
| What the agent writes | One plain-English objective or a committed `*_test.md` file | Selector-by-selector click, type, and wait sequences |
| Result format | Structured verdict (`status`, `assertions`, `cost_usd`) | Whatever your custom tool wrapper returns, usually raw DOM state or screenshots |
| Deterministic checks | `Verify` steps compile to real Playwright assertions, no LLM judgment | You write and maintain the assertion logic yourself |
| Repeatability | Replay cache re-runs identical passing flows with zero model calls | Every run re-executes every step through the model, no built-in caching |
| CI integration | `--agent` NDJSON, exit codes, JUnit via `run-all`, official GitHub Action | You build the CI reporting layer yourself |
| Maintenance burden | Selector drift handled inside the flow interpretation, not your prompt | Selector changes break your hand-written step sequences directly |
| Best fit | Teams that want a validation layer, not a browser-scripting DSL | Teams that need extremely fine-grained control over a single, narrow, stable flow |

Neither approach is universally correct. Raw Playwright tool calls give total control over one narrow, rarely-changing interaction. BrowserBash's MCP server is built for the more common case: your agent, CI pipeline, or monitor needs to validate a flow described in English without you maintaining selector logic.

## Deterministic Assertions and testmd v2 Inside MCP Workflows

Plain-English objectives are great for exploration, but for anything you want to trust repeatedly, `Verify` steps matter. When a `*_test.md` file's steps use the recognized grammar (`URL contains`, `title is/contains`, `text visible`, `'name' button|link|heading visible`, element counts, stored value equals), BrowserBash compiles them to real Playwright assertions instead of asking a model to judge whether the page "looks right." A pass means the condition literally held; a fail comes back with expected-vs-actual evidence in the verdict's `assertions` array and in the `Result.md` file the CLI writes after every run. Any `Verify` line outside that grammar still runs, but agent-judged and flagged `judged: true`, so your MCP client can tell a fact from an opinion.

For flows that mix API setup with UI verification, `version: 2` frontmatter unlocks step-by-step execution against a single browser session, with two step types that never touch a model:

```markdown
---
version: 2
---

# Verify new user sees the welcome banner

1. POST https://api.example.com/users with body {"email": "{{unique.email}}", "plan": "pro"}
2. Expect status 201, store $.id as 'userId'
3. Open https://app.example.com/login and sign in as {{unique.email}}
4. Verify text visible "Welcome to Pro"
```

The API step seeds a user deterministically; the `Verify` step at the end checks the UI reflects it, also deterministically. Consecutive plain-English steps in between still run as grouped agent blocks on the same page, so you are not forced to hand-write every interaction, only the parts you want pinned down. Worth knowing before you wire this in: testmd v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway, and does not yet run against Ollama or OpenRouter directly. Keep v1 test files (no frontmatter, agent-judged throughout) for a fully local setup and reserve v2 for flows with Anthropic API access.

## Cost, Caching, and Keeping MCP Calls Cheap

An agent calling a browser validator on every iteration of a debugging loop can rack up model spend fast if nothing caches the repeat work. BrowserBash's replay cache exists for this pattern: the first green run of an objective or test records the actions it took, and the next identical run replays them directly against the browser with zero model calls, stepping the model back in only if the page actually changed. That turns a chain of expensive calls into mostly free ones after the first pass.

For suite-level runs, `run-all` supports sharding plus a hard budget stop, and `monitor` gives you a standing watch instead of an on-demand check, alerting only on pass-to-fail or fail-to-pass transitions and leaning on the replay cache to stay close to token-free:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00
browserbash monitor ./.browserbash/tests/checkout_test.md --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

Once a suite crosses its budget, BrowserBash stops launching new tests, reports the rest as `skipped`, exits with code `2`, and records the spend in both `RunAll-Result.md` and the JUnit `<properties>` block. That combination matters when `run_suite` is called from an MCP-driven CI step and you want a spend ceiling that cannot be silently exceeded. Every verdict's `cost_usd` field gives you the per-call number to reason about, whether you are watching one agent session or a week of monitor runs.

## When to Choose BrowserBash MCP (and When Not To)

BrowserBash's MCP server is the right fit when you want your MCP client, whichever one you use, to validate a running web app the way a person would: open a browser, do the flow, get a straight answer. It is a strong fit if you write English objectives faster than selectors, want a validation layer that survives across Claude Code, Cursor, Codex, or any future MCP host without rewriting anything, or want deterministic `Verify` checks for the parts of a flow you never want a model guessing about.

It is a weaker fit if your team already has a mature Playwright suite you do not want to translate; `browserbash import` converts specs to `*_test.md` files heuristically and without a model, but anything untranslatable lands in an `IMPORT-REPORT.md` rather than being silently dropped. It is also weaker if your flows are narrow and stable enough that hand-written selectors cost less to maintain than English. And it is not built for load testing, pixel-level visual regression, or sub-second timing precision; it is built for functional validation. If your workflow needs testmd v2's deterministic API steps but you are committed to a fully local, no-API-key setup, plan for that gap.

Be honest about which tool solves your actual problem. Cross-client portability and a structured verdict are only valuable if you actually needed them; if a hand-rolled Playwright wrapper already works for you, there is no urgency to switch. The [pricing page](https://browserbash.com/pricing) is worth a glance too: everything covered here runs on your own machine and stays free.

## FAQ

### What is an MCP client browser testing tool?

It is an MCP server that lets any MCP-speaking client (Claude Code, Cursor, Codex, Windsurf, Zed, and others) call out to a real browser and get back a structured pass or fail result, instead of the client having to script browser interactions itself. BrowserBash's `browserbash mcp` server is one implementation, exposing three tools (`run_objective`, `run_test_file`, `run_suite`) over the standard stdio transport.

### Do I need an API key to use BrowserBash's MCP server?

No. BrowserBash resolves models Ollama-first, checking for a local Ollama install before falling back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If none are configured it returns setup guidance rather than failing silently. You can run the MCP server fully local with no account and no key.

### How is a failed BrowserBash test different from an MCP tool call error?

A failed test still returns a successful tool call: the browser opened, the flow ran, and the verdict's `status` field says the check did not pass, along with evidence in `assertions`. An actual tool error is reserved for infrastructure problems like a timeout or a missing test file. Treating a failed verdict as data rather than an exception is the correct pattern for agent-side logic.

### Can I use BrowserBash's MCP tools alongside committed test files in CI?

Yes. `run_test_file` and `run_suite` both operate on the same `*_test.md` files you would run from the CLI with `browserbash testmd run` or `browserbash run-all`, including `@import` composition, `{{variable}}` templating, and the deterministic `Verify` grammar. That means a flow an agent validates ad hoc during development with `run_objective` can graduate into a committed test file that `run_suite` runs in your CI pipeline without any format changes.

Getting started takes one command, `npm install -g browserbash-cli`, then registering `browserbash mcp` with whichever MCP client you use. An account is optional; the free local dashboard or cloud run history is there when you want it, at [sign-up](https://browserbash.com/sign-up), not before. For a broader tour of what BrowserBash can do beyond MCP, the [features page](https://browserbash.com/features) and [learn](https://browserbash.com/learn) section cover the CLI end to end, and the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) are worth a look once you are ready to gate CI on real browser verdicts instead of just unit tests.
