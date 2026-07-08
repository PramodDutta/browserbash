---
title: Zed Editor and BrowserBash MCP: Test What You Just Shipped
description: "Set up Zed editor MCP browser testing with BrowserBash so you can validate a real Chrome flow from an editor prompt, no context switch."
date: 2026-07-27
category: agents
---

You just finished a change in Zed. The diff looks right, the type checker is quiet, and the natural next move is to alt-tab to a terminal, remember the URL, click through the flow by hand, and alt-tab back. That gap between "the code looks done" and "I watched it work in a real browser" is where most shipped bugs actually live, and it's exactly the seam zed editor mcp browser testing is meant to close. Zed speaks the Model Context Protocol natively, and BrowserBash ships an MCP server that turns a plain-English objective into a real Chrome run without leaving the editor. This post walks through wiring the two together and running an actual verification from a Zed prompt, start to finish.

## Why editor-native browser testing matters

Every AI coding agent has the same blind spot: it reads and writes text extremely well, and it cannot see a rendered page. It can tell you the login form now calls the right endpoint. It cannot tell you the modal actually closed, the redirect actually landed on `/dashboard`, or the toast actually said "saved" instead of silently failing behind a CORS error. That gap gets papered over constantly with confident commit messages that turn out to be wrong the moment a human opens the app.

Zed's context-server support changes the shape of that problem. Instead of the agent guessing or you tabbing away to check by hand, the model running inside Zed can call a tool that opens a browser, performs the flow, and returns a structured verdict it can read and act on. That's the whole idea behind zed editor mcp browser testing: keep the loop tight enough that "did this actually work" is one prompt away, not a five-minute context switch.

BrowserBash fits that role because it was built for exactly this handoff. It's free, open-source under Apache-2.0, and it doesn't require you to write a single Playwright selector. You give it an objective in English, it drives a real Chromium browser, and it hands back a verdict an agent (or a human) can trust.

## What Zed's context servers actually give you

Zed exposes external tools to its assistant through what it calls context servers, which is Zed's name for MCP servers. A context server is a long-running process that speaks MCP over stdio: Zed launches it, the server advertises a set of tools, and the model running inside Zed's assistant panel can call those tools mid-conversation the same way it would call any built-in editing tool.

The practical upshot is that once BrowserBash is registered as a context server, you don't need a separate CLI window or a copy-pasted terminal command. You type an objective in the assistant panel, the model decides to call BrowserBash's `run_objective` tool, BrowserBash opens a browser and executes the steps, and the result comes back into the same conversation where you're reading the diff. The browser run and the code you just wrote live in the same thread.

This is not unique to Zed. The same MCP contract works in Claude Code, Cursor, Windsurf, and Codex, because MCP is a protocol, not a vendor feature. What's specific to this setup is that Zed is fast, keyboard-driven, and increasingly the editor of choice for people who want AI assistance without a heavyweight IDE, which makes the "verify without leaving the editor" pitch land especially well there.

## Installing BrowserBash

Before touching Zed's config, get the CLI on your machine. It's a standard global npm install:

```bash
npm install -g browserbash-cli
```

That gives you the `browserbash` binary. You can sanity-check it works with a single objective before wiring it into Zed at all:

```bash
browserbash run "Open https://example.com and confirm the heading is visible" --headless
```

If that opens a browser (or runs headless and reports pass), you're ready to point Zed at the same binary. BrowserBash defaults to Ollama-first model resolution: it looks for a local Ollama model first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If none of those are configured it prints setup guidance instead of failing silently, so there's no surprise cost the first time you run it.

## Configuring BrowserBash as a Zed context server

Zed's context servers are configured in your Zed settings, in the `context_servers` block. The shape is a command plus arguments, the same pattern you'd use to register any MCP server, and BrowserBash's `mcp` subcommand is built to be dropped straight in:

```bash
browserbash mcp
```

That command starts the MCP server on stdio, no flags needed for the default local setup. In your Zed `settings.json`, add an entry that tells Zed to launch that command as a context server:

```bash
{
  "context_servers": {
    "browserbash": {
      "command": {
        "path": "browserbash",
        "args": ["mcp"]
      }
    }
  }
}
```

Restart Zed's assistant panel (or reload the window) and BrowserBash's three tools become available to whatever model you have configured in Zed. If you've used `claude mcp add browserbash -- browserbash mcp` with Claude Code before, this is the same idea in a different host: one binary, one subcommand, registered once.

A couple of things worth checking once it's wired up. First, confirm `browserbash` resolves on your `PATH` from wherever Zed launches its subprocesses, because editors sometimes inherit a leaner shell environment than your interactive terminal. If Zed can't find the binary, use the absolute path from `which browserbash` instead of the bare command. Second, if you're running against a hosted model rather than local Ollama, make sure the relevant API key is present in the environment Zed's context server process inherits, not just your terminal's `.zshrc`.

## The three tools BrowserBash exposes

Once registered, BrowserBash's MCP server advertises three tools, and the model decides which one fits the request:

| Tool | Input | What it does |
|---|---|---|
| `run_objective` | One plain-English objective string | Drives a real browser through the described flow and returns a structured verdict |
| `run_test_file` | Path to a `*_test.md` file | Runs a committed, versioned test with its own steps, variables, and imports |
| `run_suite` | Path to a folder of test files | Runs every test in the folder in parallel and aggregates the results |

Each tool returns the same shape of structured verdict: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. That consistency matters more than it sounds like it should, because it means the model calling the tool doesn't need different parsing logic depending on which one it used. A failed run is not an error from BrowserBash's point of view: the tool call succeeds, and the model reads a `status: "failed"` verdict the same way it reads a `status: "passed"` one. That's the difference between a tool that reports facts and a tool that only ever tells you good news.

## Walking through a real objective run

Here's the flow in practice. Say you just added a "forgot password" link to a login page and want to confirm it actually navigates somewhere before you write the backend logic. In Zed's assistant panel, after reviewing the diff, you type something like:

"Use BrowserBash to open the staging login page and verify a 'Forgot password?' link is visible and clicking it lands on a page with 'reset' in the URL."

The model recognizes this as a job for `run_objective`, formats the objective, and calls the tool. BrowserBash launches a Chromium browser (visible or headless depending on your config), reads the page, locates the link by its visible text rather than a brittle selector, clicks it, and checks the resulting URL. No `page.getByRole('link', { name: /forgot password/i })` was written by you or the model. That's the entire point of natural-language driving: the objective describes intent, and the engine figures out the DOM interaction.

When the run finishes, the verdict comes back into the same Zed conversation:

```
status: passed
summary: Located "Forgot password?" link, clicked it, confirmed URL contains "reset"
final_state: { url: "https://staging.example.com/reset-password" }
cost_usd: 0.00
duration_ms: 4210
```

`cost_usd: 0.00` there isn't a rounding error. If you're on local Ollama, most runs genuinely cost nothing beyond electricity, and BrowserBash's cost table only reports a real dollar figure when it recognizes the model you used. The model in Zed reads that verdict and can immediately tell you the link works, or if it says `status: "failed"`, it can read the `summary` field describing exactly what didn't match and suggest the fix, still without you touching a browser window yourself.

## Reading the verdict instead of trusting the vibes

The part that actually changes your workflow isn't the browser automation, it's the return shape. A model that just watched a screen recording or scraped console output has to *interpret* what happened, and interpretation is where confident wrong answers come from. A model that reads `assertions: [{ type: "url_contains", expected: "reset", actual: "reset-password", passed: true }]` doesn't have to interpret anything. It's a fact.

That structured `assertions` array is populated by BrowserBash's deterministic Verify grammar when you're running a committed test file with `Verify` steps, rather than a one-off objective. Verify lines like `Verify URL contains "reset"` or `Verify 'Forgot password?' link visible` compile to real Playwright checks, not LLM judgment calls. A pass means the condition literally held; a fail comes back with expected-vs-actual evidence, both in the MCP response and in the `Result.md` file BrowserBash writes after every run. Any Verify line outside that grammar still executes, but it's agent-judged and flagged `judged: true` in the output, so nothing pretends to be deterministic when it isn't.

For a one-shot `run_objective` call there's no test file, so the agent-judged path is what you're getting by default, which is fine for exploratory "does this basically work" checks from inside Zed. When you want the harder guarantee, that's the cue to graduate the flow into a real test file.

## From a Zed prompt to a committed test file

A one-off objective is great for the moment you're in, but it doesn't survive past the conversation. Once a flow matters enough to check more than once, promote it to a `*_test.md` file in your repo's `.browserbash/tests/` directory, and Zed's assistant can call `run_test_file` against it going forward instead of re-typing the objective every time.

Here's what that file looks like with testmd v2's deterministic step types, mixing an API call to seed state with a UI Verify step:

```bash
---
version: 2
---
# Password reset link works

1. POST https://staging.example.com/api/test/reset-token with body {"email": "qa@example.com"}
2. Expect status 201, store $.token as 'resetToken'
3. Open the staging login page
4. Click the "Forgot password?" link
5. Verify URL contains "reset"
6. Verify 'Reset your password' heading visible
```

Steps 1 and 2 are API steps: no model call, no browser, just an HTTP request and a deterministic status/body check that stores a value for later. Steps 3 and 4 are plain-English UI steps, grouped and run against the same browser session. Steps 5 and 6 are Verify steps compiled to real assertions. That's testmd v2 in a nutshell: the parts of your flow that are naturally deterministic (API calls, exact assertions) skip the model entirely, and only the fuzzy human-shaped part ("click the forgot password link") goes through natural-language driving. Worth noting: v2 currently drives BrowserBash's builtin engine, which needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway; it doesn't yet run directly on Ollama or OpenRouter the way `run_objective` does.

Once that file exists, the Zed conversation gets simpler: "run the password reset test" is enough, because the model calls `run_test_file` with the path and reads back the same structured verdict, now backed by real assertions instead of a judgment call.

## Saved logins so you're not testing the login form every time

Most flows worth checking live behind auth, and re-logging in on every single run from inside an editor prompt gets old fast. BrowserBash's saved-login profiles solve this once:

```bash
browserbash auth save staging --url https://staging.example.com/login
```

That opens a browser, you log in by hand once, hit Enter, and BrowserBash captures the session as a Playwright storageState profile. From then on, any run, whether triggered from Zed's assistant, a terminal, or CI, can reuse it:

```bash
browserbash run "Verify the billing page shows the current plan" --auth staging --headless
```

or as `auth: staging` frontmatter in a test file. If the saved profile's origins don't cover wherever you're pointing the run, BrowserBash prints a warning instead of quietly running unauthenticated, which saves you from staring at a false "failed" verdict wondering why the dashboard never loaded.

## Keeping the model story honest inside the editor

It's worth being direct about what running BrowserBash from inside Zed actually costs, because "AI-driven browser testing" gets oversold constantly. If you're on local Ollama with a mid-size model (Qwen3 or Llama 3.3 in the 70B class), most objective runs from Zed cost nothing but time and local compute. Small local models, the 8B-and-under range, get flaky on longer multi-step objectives: they'll lose track of the flow three steps in and either give up or click the wrong thing. That's not a BrowserBash-specific problem, it's a known limitation of small models doing multi-step tool reasoning, and the honest fix is either a bigger local model or a hosted one (Claude, or anything reachable through `ANTHROPIC_API_KEY` or OpenRouter) for the flows that genuinely need it.

The replay cache helps here regardless of which model you're on. A green run records the actions it took; the next identical run replays them with zero model calls, and the model only steps back in when the page actually changed. That means the second, third, and fiftieth time you ask Zed to verify the same flow, most of the cost and latency disappear, because there's nothing left to figure out.

## From Zed prompt to CI, without rewriting anything

The reason it's worth graduating a Zed-triggered objective into a committed test file isn't just repeatability inside the editor, it's that the exact same file runs in CI unchanged. BrowserBash ships an official GitHub Action that installs the CLI, runs your suite, and posts a self-updating PR comment with the verdict table, uploading JUnit and NDJSON artifacts along the way. Full setup is in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

For larger suites, `run-all` handles sharding and budget limits so CI time and spend stay bounded:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

That's the same test file you asked Zed's assistant to run interactively, now running as one deterministic slice of a four-way CI matrix with a hard dollar ceiling. Nothing about the test needed to change between "I checked this from my editor" and "this runs on every PR." That continuity, prompt in the editor now, CI job later, same file both times, is the actual payoff of building on committed markdown tests instead of one-off natural-language runs that vanish when the chat closes.

## Watching the same test over time

Once something is committed and passing, the last piece is noticing when it stops. `browserbash monitor` runs a test or objective on an interval and alerts only on pass-to-fail or fail-to-pass transitions, not on every green tick:

```bash
browserbash monitor .browserbash/tests/password_reset_test.md --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

Because the replay cache kicks in for an always-on monitor like this, the recurring cost stays close to zero once the flow has run cleanly once. You get a Slack ping the moment the flow actually breaks, not a wall of green noise, and the same test file you first ran from a Zed prompt is now doing continuous duty.

## Who this setup is actually for

This workflow earns its keep for people who are already living in Zed and already writing code with AI assistance in the loop, where the missing piece is "did the thing I just described actually happen in a browser." It's a poor fit if you need heavy DOM-level control, custom network interception, or component-level testing, that's still Playwright or Cypress territory, and BrowserBash isn't trying to replace either. It also won't help if your team has zero appetite for LLM-driven test authoring at all; the whole model rests on trusting an agent to interpret plain English into browser actions, backed by deterministic Verify checks where it counts, not on eliminating judgment entirely.

Where it does earn its keep: solo devs and small teams who want a verification step that lives in the same window as the code, teams already using MCP-native tools like Claude Code or Cursor who want the same validation layer available in Zed too, and anyone tired of the "looks done, isn't tested" gap between a diff and a working feature.

## Setting it up in five minutes

To recap the concrete steps: install the CLI globally, confirm `browserbash run "..."` works from your terminal, add a `context_servers` entry in Zed's settings pointing at `browserbash mcp`, restart the assistant panel, and ask it to verify something on a real page. From there, promote anything you check more than once into a `*_test.md` file so it survives past the conversation and runs identically in CI. Check the [tutorials](https://browserbash.com/tutorials) for more testmd examples and the [learn](https://browserbash.com/learn) section for engine and provider details if you're routing to Browserbase or a Selenium grid instead of local Chrome.

## FAQ

### Does Zed support MCP servers natively?

Yes. Zed calls them context servers, and they're configured in Zed's settings under a `context_servers` block with a command and arguments, the same underlying MCP protocol used by Claude Code, Cursor, and Codex. Once registered, any tools the server advertises become callable from Zed's assistant panel mid-conversation.

### Do I need an API key to test browser flows from Zed with BrowserBash?

No, not by default. BrowserBash resolves models in order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, so a local Ollama model with no keys configured works out of the box. You only need a key if you want a hosted model for harder multi-step flows or to use testmd v2's deterministic step types, which currently require the builtin engine.

### What happens if a BrowserBash test fails when triggered from Zed?

The MCP tool call still succeeds; BrowserBash returns a structured verdict with `status: "failed"` and a `summary` describing what happened, so the model reading the result in Zed can react to it directly instead of the tool call erroring out. That's deliberate: a failed test is a successful validation, because it told you something true.

### Can the same test I run from Zed also run in CI?

Yes, unchanged. Any `*_test.md` file you promote from a Zed-triggered objective runs identically via `browserbash run-all` locally or through BrowserBash's official GitHub Action in CI, including sharding and budget limits for larger suites. There's no separate "CI version" of the test to maintain.

Wiring BrowserBash into Zed takes about as long as reading this article: install the CLI, add one `context_servers` entry, and the next diff you finish gets a real browser check without ever leaving the editor. Get started with `npm install -g browserbash-cli`, and if you want run history synced across machines, [sign up for a free account](https://browserbash.com/sign-up), though nothing about local testing or the Zed integration requires one.
