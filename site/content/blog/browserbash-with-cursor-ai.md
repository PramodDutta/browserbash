---
title: Give Cursor a Browser: BrowserBash MCP Setup
description: "Set up cursor ai browser testing mcp with BrowserBash so Cursor can open a real Chrome, click through your changes, and return a verdict, not a guess."
date: 2026-07-22
category: agents
---

If you use Cursor for anything beyond toy scripts, you already know the pattern: it edits three files, runs the linter, and tells you the feature is "ready to test." It never actually looked at the page. Wiring up cursor ai browser testing mcp support with BrowserBash closes that gap, letting Cursor open a real Chrome instance, click through the flow it just built, and hand back a pass or fail instead of a confident guess. This is a practical, step-by-step setup guide, not a marketing pitch, and it ends with Cursor running its own checks against your app before it tells you a task is done.

## The problem: Cursor writes code, but it can't see your app

Cursor is genuinely good at reasoning about source. Give it a bug report and a stack trace and it will usually find the right file and propose a sane fix. What it cannot do on its own is perceive the rendered application. It doesn't know if the modal actually opens, if the form submission redirects to the right route, or if the "Save" button silently no-ops because an event handler got detached in a refactor. All of that only exists once a browser executes the JavaScript and paints the DOM.

So when you ask Cursor "did that fix work," it has three options, and all of them are weak. It can read its own diff and declare victory, which is exactly the failure mode that produces confident "Fixed! ✅" comments on pull requests that don't actually build. It can run your unit or component tests, which is useful but tells you nothing about whether a human-facing flow completes end to end, because unit tests happily pass against a component that renders a blank screen. Or it can ask you to check manually, which defeats the point of having an agent write the code in the first place.

None of those three options is verification. They're approximations that feel fine until the moment a customer hits the bug that any of them would have caught in thirty seconds. The fix isn't a smarter prompt. It's giving Cursor a tool it can call that opens an actual browser, drives the flow the way a real user would, and returns a structured result Cursor can branch on. That's what BrowserBash's MCP server is for.

## What the BrowserBash MCP server actually gives Cursor

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy. You give it a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step, no CSS selectors, no page objects, no brittle XPath, and returns a deterministic verdict along with structured results.

As of v1.5.0, BrowserBash ships a native MCP server: `browserbash mcp`. It serves the CLI over the Model Context Protocol on stdio, which means any MCP-capable host, Cursor included, can call it directly as a tool rather than shelling out to a CLI and scraping stdout. The server exposes three tools:

- **`run_objective`**: hand it one plain-English instruction (`"Log in with test@example.com and verify the dashboard loads"`) and it drives the browser and returns the verdict.
- **`run_test_file`**: point it at a committed `*_test.md` file so Cursor can re-run an existing, versioned test rather than improvising a new objective every time.
- **`run_suite`**: point it at a folder of test files and it runs them in parallel, useful once you've got more than a handful of checks.

Every call returns the same structured verdict JSON: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. This is the detail that actually makes the setup agent-native rather than just "another CLI wrapper": Cursor doesn't have to parse English output to figure out if something passed. A failed test is a successful tool call, not an error, so Cursor's loop stays intact even when the verdict is `fail`. It reads the JSON, sees `status: "fail"`, and knows exactly what to fix next.

BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so it's discoverable the same way any other registered MCP server is. The source is fully open on [GitHub](https://github.com/PramodDutta/browserbash), and the CLI itself ships as [`browserbash-cli` on npm](https://www.npmjs.com/package/browserbash-cli).

## Installing BrowserBash MCP into Cursor

The install is one command, then a registration step. First, make sure the CLI is on your machine, then register the MCP server the same way you would for Claude Code or any other MCP host, pointing it at the `browserbash mcp` subcommand. If you're used to adding MCP servers in Claude Code, the shape is identical:

```bash
npm install -g browserbash-cli
claude mcp add browserbash -- browserbash mcp
```

For Cursor specifically, add an entry to your MCP configuration (Cursor reads MCP server definitions from its settings, the same JSON shape most MCP hosts use) with `browserbash` as the command and `mcp` as the argument. Once that's saved and Cursor picks up the new server, `run_objective`, `run_test_file`, and `run_suite` show up as tools Cursor can call inside its agent loop, the same way it calls your linter or your test runner today. The [BrowserBash docs and tutorials](https://browserbash.com/tutorials) walk through the same registration flow for other MCP hosts like Claude Code, Windsurf, and Codex if your team runs more than one agent.

No API key is required to get started. BrowserBash resolves models Ollama-first: if you've got a local Ollama model running, it uses that, nothing leaves your machine, and there's no bill. If not, it falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. That fallback order matters for a Cursor setup specifically, because it means you can prototype the whole workflow for free on a local model before deciding whether a hosted model is worth paying for on harder flows.

## Your first Cursor + BrowserBash verification loop

The full list of exposed tools and their argument shapes is documented on the [BrowserBash features page](https://browserbash.com/features), but the workflow itself is simple once the MCP server is registered. You ask Cursor to fix a bug or ship a feature. Instead of stopping at "the diff looks right," you tell it (once, in your Cursor rules or just in the prompt) to verify the change with BrowserBash before reporting done. Cursor calls `run_objective` with something like:

> "Go to localhost:3000/signup, fill in a test email and password, submit the form, and verify the confirmation page shows 'Check your email'."

BrowserBash opens a real Chrome, performs those steps exactly as described, no selectors written by anyone, and returns the verdict JSON. If `status` is `pass`, Cursor tells you the fix is verified, not just written. If it's `fail`, Cursor reads the `summary` and `final_state` fields, which describe what actually happened on the page, and goes back to fix the real problem instead of guessing at a second attempt.

This is the difference between an agent that believes it shipped working software and one that can prove it. It also changes how you review Cursor's output: instead of re-running the app yourself to sanity-check every claim, you're reading a verdict that was already generated by driving the real UI.

## Making checks deterministic with Verify steps

Plain-English objectives are great for exploratory checks, but for anything you want Cursor to re-run repeatedly (a login flow, a checkout path, a form that keeps regressing), you want something more precise than "does this look okay to an LLM." That's what `Verify` steps are for.

BrowserBash's deterministic Verify assertions, added in v1.5.0, compile down to real Playwright checks, not LLM judgment. You can assert things like URL contains a string, page title is or contains text, specific text is visible, a named button, link, or heading is visible, element counts match, or a stored value equals an expected result. When a Verify line matches that grammar, the check runs without a model call at all, which is both faster and cheaper. A pass means the condition genuinely held; a fail returns expected-vs-actual evidence directly in `run_end.assertions`, so Cursor gets a precise diff instead of a vague summary. If you write a Verify line that falls outside that grammar, it still runs, just agent-judged, and it's flagged `judged: true` in the output so you always know which of your checks are deterministic and which aren't.

A minimal test file that Cursor can call via `run_test_file` looks like this:

```markdown
# Signup flow verification

- Go to http://localhost:3000/signup
- Fill in the signup form with {{email}} and {{password}}
- Submit the form
- Verify 'Check your email' text visible
- Verify url contains "/confirm"
```

That file lives in your repo, versioned like any other test asset, and Cursor can point `run_test_file` at it every time it touches signup-related code instead of re-describing the flow from scratch.

## Testmd v2: seeding data and verifying it through the UI in one pass

Real applications rarely let you test the UI in isolation. You need a user account to exist, an order to be seeded, a feature flag flipped, before the UI check makes sense. BrowserBash's testmd v2 format, also new in v1.5.0, handles this by mixing deterministic API steps with UI Verify steps in a single file, executed one step at a time against a single browser session.

Add `version: 2` to the frontmatter and you get two step types that never touch a model at all: API steps for setup (`GET/POST/PUT/DELETE/PATCH` a URL, optionally with a body, and `Expect status N`, optionally storing a response value as a variable), and Verify steps for checking the result through the UI. Consecutive plain-English steps in between still run as grouped, agent-judged blocks against the same page.

```markdown
---
version: 2
---

# Order confirmation with seeded data

- POST /api/orders with body {"item": "widget", "qty": 2}
- Expect status 201, store $.id as 'orderId'
- Go to http://localhost:3000/orders/{{orderId}}
- Verify 'widget' text visible
- Verify url contains "{{orderId}}"
```

This matters a lot in a Cursor workflow because it lets you hand Cursor a single file that both prepares state and checks the outcome, rather than relying on the agent to improvise API calls inside a plain-English objective (which it can do, but less reliably and with a model call on every run). One honest caveat: testmd v2 currently drives the builtin engine only, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It doesn't yet run directly on Ollama or OpenRouter, so if you're leaning on local models for everything else, v2 files are the one place you'll need a hosted key.

## Saved logins so Cursor isn't logging in every single check

Every BrowserBash run starts a fresh browser context, so without saved sessions, Cursor's verification loop would re-do your login flow on every single check, which is slow and adds an extra point of failure that has nothing to do with the thing you're actually testing.

`browserbash auth save` fixes this. Run it once, log in through the browser it opens, hit Enter, and it saves the session as a Playwright storageState profile:

```bash
browserbash auth save staging-user --url https://staging.yourapp.com/login
```

From then on, pass `--auth staging-user` on any run, testmd, or run-all call, or add an `auth:` line to a test file's frontmatter, and BrowserBash reuses that saved session instead of logging in fresh. If a saved profile's origins don't cover the target start URL, BrowserBash prints a warning instead of silently failing, so you'll know immediately if you pointed Cursor at the wrong environment. For a Cursor setup where the agent is going to call `run_test_file` dozens of times a day against a staging environment behind auth, this is the difference between a workflow that's actually usable and one that burns ten seconds on login theater every single call.

## Keeping token costs sane when an agent verifies its own work

Handing Cursor a tool it can call freely raises an obvious question: what stops it from burning through your model budget re-verifying the same flow twenty times while it iterates on a fix? BrowserBash has two mechanisms that matter here.

The first is the replay cache. A green run records the actions it took; the next identical run replays those recorded actions with zero model calls, and the agent only steps back in when the page actually changed. In a Cursor loop where the same signup or checkout flow gets re-verified repeatedly across small code edits, this turns most of those re-runs into near-free replays instead of fresh model-driven passes.

The second is explicit cost governance, new in v1.5.0. `run_end` events carry a `cost_usd` estimate pulled from a bundled per-model price table (models it doesn't recognize get no estimate rather than a wrong one, which matters if you're the kind of person who actually checks these numbers). If you're running a broader suite rather than one-off Cursor checks, `run-all --budget-usd` puts a hard ceiling on spend:

```bash
browserbash run-all .browserbash/tests --budget-usd 2.50 --shard 1/4
```

Once the suite crosses that budget, remaining tests are marked `skipped`, the run exits with code `2`, and the spend is recorded in both `RunAll-Result.md` and the JUnit `<properties>` block. For a Cursor-driven verification loop that might run many times a day, this is the guardrail that keeps an enthusiastic agent from quietly running up a bill while it hunts for a fix.

## BrowserBash MCP versus other ways Cursor could "see" the browser

There's more than one way to get a coding agent visibility into a running app, and it's worth being honest about where each one fits. Some Cursor users already use screenshot-based tools or Cursor's own preview pane to eyeball changes. Others reach for a general browser-automation MCP server that exposes raw Playwright actions (click, type, screenshot) rather than English objectives and structured verdicts.

| Approach | What Cursor gets | Deterministic pass/fail | Setup effort |
|---|---|---|---|
| Manual review (you check the app) | Nothing automatic; you're the verification | No, it's you deciding | None, but doesn't scale |
| Screenshot-only tools | A static image Cursor can look at | No, it's visual guessing | Low |
| Raw browser-automation MCP (click/type primitives) | Full control, but Cursor has to script every selector and step itself | Only if you hand-write assertions | Moderate to high, brittle to DOM changes |
| BrowserBash MCP (`run_objective` / `run_test_file`) | Plain-English objectives, real Chrome, structured verdict JSON | Yes, for Verify-grammar assertions; agent-judged elsewhere and clearly flagged | Low, one command to register |

The honest tradeoff: a raw automation MCP server gives you more fine-grained control if you already have detailed Playwright knowledge and want Cursor scripting exact selectors. BrowserBash trades that granularity for speed of setup and resilience to markup changes, since it works off plain-English intent rather than a selector map that breaks the moment a `div` gets a new class name. If your app's UI changes constantly and you don't want to maintain a selector library alongside your feature code, that tradeoff favors BrowserBash. If you need pixel-level control over exact DOM interactions for something unusually finicky, a lower-level automation library might still be the better tool for that specific case, and there's nothing stopping you from using both.

## Who this setup is actually for

This setup earns its keep for teams and solo developers using Cursor to ship UI-facing changes fast and who want more than a diff review before calling something done. If you want to see how a team folded this into an existing CI pipeline rather than a solo Cursor workflow, the [BrowserBash case study](https://browserbash.com/case-study) covers that in more depth. It's a particularly good fit if you're already writing (or willing to write) plain-English test files you can commit alongside your code, since `run_test_file` turns those into repeatable, versioned checks Cursor can call instead of re-describing the flow every time. It's also a strong fit if you want to keep the whole loop free: Ollama-first model resolution means you can run this entirely on your own machine with no API key and nothing leaving your laptop.

It's a weaker fit if your application has no meaningful browser-rendered UI at all (a pure API service doesn't need this), or if you need assertions far more exotic than the current Verify grammar covers, in which case you'll lean on agent-judged checks more than deterministic ones, which is still useful but not the crisp pass/fail you get from the Verify path. And if your team already has a mature Playwright test suite with detailed custom assertions, BrowserBash is worth pairing with that suite rather than replacing it outright, since `browserbash import` can convert existing Playwright specs into testmd files as a starting point rather than asking you to rewrite everything by hand.

## Putting it together in your Cursor rules

The last piece is making the verification step something Cursor does automatically rather than something you have to remember to ask for. Add a line to your Cursor project rules along the lines of: "After implementing a UI-facing change, call the BrowserBash `run_objective` or `run_test_file` MCP tool to verify the change against a running local instance before reporting the task complete. If the verdict is fail, fix the underlying issue and re-verify rather than reporting partial success." That one instruction turns every Cursor session working on your frontend into a session that checks its own work in a real browser instead of trusting its own diff. It won't catch everything, no automated check does, but it catches the class of bug that a confident agent is most likely to miss: the gap between code that looks correct and a page that actually works.

## FAQ

### How do I connect BrowserBash to Cursor as an MCP server?

Install the CLI with `npm install -g browserbash-cli`, then register `browserbash mcp` as an MCP server in Cursor's MCP configuration, the same way you'd add any other MCP tool. Once registered, Cursor gains access to the `run_objective`, `run_test_file`, and `run_suite` tools and can call them directly inside its agent loop.

### Does Cursor need an API key to use BrowserBash for browser testing?

Not necessarily. BrowserBash resolves models in this order: a local Ollama model first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If you have Ollama running locally, the whole loop works with no API key and nothing leaves your machine. Some features, like testmd v2, currently require the builtin engine and therefore an Anthropic-compatible key.

### What does BrowserBash return to Cursor after a browser check runs?

Every run returns structured verdict JSON containing `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. Cursor reads this directly rather than parsing prose output, and a failed check is still a successful tool call, so the agent can branch on the result and fix the real problem instead of erroring out.

### Can BrowserBash verify a change that requires being logged in?

Yes. Run `browserbash auth save <name> --url <login-url>` once to save a session as a Playwright storageState profile, then pass `--auth <name>` on subsequent runs or add an `auth:` line to a test file's frontmatter. This avoids re-running the login flow on every single verification call.

Getting this running takes about five minutes: `npm install -g browserbash-cli`, register `browserbash mcp` in Cursor, and write your first `run_objective` call. From there you can grow into committed test files, Verify assertions, and saved auth as your checks get more repeatable. An account is entirely optional; if you want the free cloud dashboard later, it's at [browserbash.com/sign-up](https://browserbash.com/sign-up), but the CLI, the MCP server, and everything in this guide works with nothing but a local install.
