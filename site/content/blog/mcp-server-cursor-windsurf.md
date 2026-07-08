---
title: Use BrowserBash as an MCP Server in Cursor and Windsurf
description: "Set up browserbash mcp inside Cursor and Windsurf so your AI agent can call run_objective to check its own UI changes before you do."
date: 2026-07-10
category: tutorial
---

If you build features with Cursor or Windsurf, you already know the pattern: the agent edits code, tells you it's done, and you tab over to the browser to see if that's actually true. BrowserBash MCP Cursor Windsurf integration closes that loop. It turns BrowserBash into a Model Context Protocol server that either editor can call directly, so the same agent that wrote the change can also drive a real browser and check its own work before it hands control back to you. No copy-pasting objectives into a terminal, no separate CLI window to babysit, just a tool call the agent makes on its own.

This is a practical setup guide, not a marketing pitch. You'll configure the BrowserBash MCP server in both Cursor and Windsurf, walk through a worked example in each editor where the agent calls `run_objective` to verify a UI change, and see exactly what comes back when it does. By the end you'll have a repeatable pattern you can drop into any project where an AI coding agent is making frontend changes it should be able to check itself.

## Why AI coding agents need a validation layer, not another assistant

Cursor and Windsurf are excellent at writing code. Neither one, on its own, knows if the code it wrote actually renders correctly, submits a form, or survives a redirect. The agent can read your diff and reason about intent, but it cannot open a browser, click a button, and tell you the modal actually appeared. That gap is why so many AI-assisted changes ship with a passing "looks good to me" from the model and a broken UI in production.

BrowserBash was built to be the piece that closes that gap: the open-source validation layer for AI agents. You give it a plain-English objective, it drives a real Chrome or Chromium browser step by step, no selectors or page objects to maintain, and it returns a deterministic verdict. Wiring it into Cursor or Windsurf as an MCP server means the coding agent doesn't just write the fix, it can also confirm the fix works, in the same conversation, without you switching context.

This matters more the deeper you get into agentic workflows. If you're running Cursor in "agent mode" or letting Windsurf's Cascade make multi-file changes autonomously, you want a feedback loop that doesn't depend on you manually re-checking every change. A tool call that returns `status: "passed"` or `status: "failed"` with structured evidence is a much better signal than the model's own optimistic self-report.

## What the BrowserBash MCP server actually exposes

`browserbash mcp` starts the BrowserBash CLI as an MCP server over stdio. Any MCP-compatible host, Cursor, Windsurf, Claude Code, Codex, Zed, can spawn it and get three tools:

- **`run_objective`**: takes a single plain-English objective, drives a browser through it, and returns the verdict. This is the one you'll use most from inside an editor, because it maps directly to "hey, go check that this works."
- **`run_test_file`**: runs a committed `*_test.md` file, the same format BrowserBash uses for regression suites, so the agent can execute an existing test instead of improvising a new objective each time.
- **`run_suite`**: runs every test in a folder in parallel, useful when the agent needs to check a broader slice of the app rather than one flow.

Every one of these returns the same shape of structured result: `status`, a human-readable `summary`, `final_state` (what the page looked like when the run ended), `assertions` (if the test used deterministic `Verify` steps), `cost_usd`, and `duration_ms`. Nothing here is fuzzy. A failed test is not an error from the tool's perspective, it's a successful validation that correctly reports "this doesn't work yet." The agent reads the JSON and decides what to do next, whether that's fixing the code and re-running, or reporting the failure to you.

BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so hosts that support registry-based discovery can find it without you hand-typing a config block, though for Cursor and Windsurf today you'll still add it manually the way you would any local MCP server.

## Installing BrowserBash before you touch either editor

Both editors expect the MCP server to be a command they can spawn, so install BrowserBash globally first:

```bash
npm install -g browserbash-cli
browserbash mcp
```

Running `browserbash mcp` directly in a terminal is worth doing once before you wire it into an editor: it starts the server and sits there waiting for stdio input, which confirms the binary is on your `PATH` and the install worked. Press Ctrl-C to stop it once you've confirmed that. If you see a "command not found" error instead, check that your global npm bin directory is on `PATH`, that's almost always the culprit when a globally installed CLI doesn't resolve.

BrowserBash's model resolution defaults to Ollama-first: if you have a local model running, `run_objective` calls inside Cursor or Windsurf won't touch any API key at all, and nothing leaves your machine. If you'd rather use a hosted model for harder flows, set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your shell environment before you launch the editor, or point at OpenRouter. Small local models (roughly 8B parameters and under) tend to get flaky on longer multi-step objectives, so if your agent's checks involve several clicks and a form submission, a 70B-class local model or a capable hosted model will give you more consistent verdicts.

## Configuring the BrowserBash MCP server in Cursor

Cursor reads MCP server definitions from a JSON config, either project-scoped at `.cursor/mcp.json` in your repo, or global at `~/.cursor/mcp.json` for every project. Project-scoped is the better default for a browser-driving tool, since the objectives you'll want the agent to run are specific to whatever app lives in that repo.

Create or edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "browserbash": {
      "command": "browserbash",
      "args": ["mcp"]
    }
  }
}
```

Save the file, then open Cursor's settings and check the MCP panel, you should see "browserbash" listed with a green status indicator once Cursor has spawned the process and completed the handshake. If it shows red or doesn't appear, restart Cursor, MCP server changes usually require a full editor restart to pick up, not just a reload of the config file.

If you need to pass an API key or a project-specific env var into the server process, Cursor's config supports an `env` block alongside `command` and `args`:

```json
{
  "mcpServers": {
    "browserbash": {
      "command": "browserbash",
      "args": ["mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Don't commit a config file with a real key in it if `.cursor/mcp.json` is tracked in git. Keep secrets in your shell environment instead and let the config inherit them, or add `.cursor/mcp.json` to `.gitignore` if you must hardcode a key for a solo project.

## Configuring the BrowserBash MCP server in Windsurf

Windsurf's setup is nearly identical in shape but lives in a different file. Open Windsurf, go to the Cascade settings panel, and find "MCP Servers", or edit `~/.codeium/windsurf/mcp_config.json` directly:

```json
{
  "mcpServers": {
    "browserbash": {
      "command": "browserbash",
      "args": ["mcp"]
    }
  }
}
```

Windsurf's Cascade panel has a "Refresh" button next to the MCP server list that re-reads the config without a full app restart, which is a nice quality-of-life difference from Cursor if you're iterating on the setup. After refreshing, you should see `run_objective`, `run_test_file`, and `run_suite` listed as available tools when you expand the browserbash entry.

One thing worth knowing: Windsurf's Cascade agent sometimes asks for confirmation before calling a newly added MCP tool the first time, since it doesn't yet have a track record with it in that conversation. That's expected, approve it once and subsequent calls in the same session go through without a prompt. If you want fewer approval interruptions across a long session, some Windsurf versions expose a per-tool "always allow" toggle in the same MCP panel.

| | Cursor | Windsurf |
|---|---|---|
| Config file | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) | `~/.codeium/windsurf/mcp_config.json`, editable from the Cascade MCP panel |
| Picks up changes | Requires editor restart | "Refresh" button in the MCP panel |
| Tool approval | Prompted per tool on first call, per settings | Prompted per tool on first call, some versions offer "always allow" |
| Env vars | `env` block in the server entry | `env` block in the server entry |

Both editors treat BrowserBash the same way once configured: as a local process they spawn over stdio and talk to via the standard MCP tool-call protocol. The commands and JSON shape are portable, so if you switch between the two editors on the same project, you can reuse the same `command`/`args` pair in both config files.

## Worked example: Cursor checking its own login form fix

Say you ask Cursor's agent to fix a bug where the login form doesn't show a validation error when the password field is empty. Cursor edits the component, adds the missing validation message, and tells you it's fixed. Instead of trusting that, you prompt it to verify:

> "Use the browserbash run_objective tool to confirm the login form now shows a validation error when I submit with an empty password field on localhost:3000/login."

Cursor's agent translates that into a tool call roughly equivalent to:

```
run_objective(objective: "Go to localhost:3000/login, leave the password field empty, click the submit button, and confirm a validation error message appears near the password field")
```

BrowserBash launches a real Chromium instance, navigates to the login page, submits the empty form, and checks the DOM for the expected error state. It returns something like:

```json
{
  "status": "passed",
  "summary": "Validation error 'Password is required' appeared below the password field after submitting with an empty value.",
  "final_state": { "url": "http://localhost:3000/login", "title": "Sign in" },
  "assertions": [],
  "cost_usd": 0.0031,
  "duration_ms": 4820
}
```

Cursor reads that JSON back into the conversation and reports the passed verdict to you in plain language, with the underlying evidence available if you want to inspect it. If the fix had a bug, the verdict would come back `"status": "failed"` with a summary describing what actually happened, no error message rendered, or the wrong text, and the agent can loop back into the code before ever handing the change to you. That loop, edit, verify, re-edit if needed, is the entire point of wiring the MCP server in rather than just having the CLI available in a separate terminal.

## Worked example: Windsurf verifying a checkout flow after a refactor

Windsurf's Cascade agent tends to be used for larger multi-file changes, so a good test case is a refactor rather than a single-line fix. Suppose Cascade just refactored the checkout page's state management from local component state to a shared store, and you want to make sure the "add to cart" and "proceed to checkout" flow still works end to end.

You prompt:

> "Run browserbash run_objective against localhost:3000: add the first product to the cart, go to checkout, and verify the cart total shown matches the product price."

Cascade issues the equivalent call:

```
run_objective(objective: "On localhost:3000, add the first product on the page to the cart, navigate to the checkout page, and verify the displayed cart total equals the product's listed price")
```

Because this objective touches multiple pages and a piece of derived state (the total), it's a better fit for a mid-size model than a small local one, this is exactly the kind of multi-step flow where an 8B local model can lose track of what it already clicked. If you've got `ANTHROPIC_API_KEY` set in the environment BrowserBash's MCP process inherited, or a capable local model like a 70B-class Qwen or Llama build, the run should complete reliably.

A passing result looks like:

```json
{
  "status": "passed",
  "summary": "Cart total on checkout page ($42.00) matched the product price after adding one unit to the cart.",
  "final_state": { "url": "http://localhost:3000/checkout" },
  "cost_usd": 0.0058,
  "duration_ms": 7140
}
```

Cascade surfaces this back to you as confirmation that the refactor didn't break the price calculation, without you needing to click through the flow yourself. If the store refactor had introduced a stale-state bug where the total didn't update, the `summary` would say so directly, something like "Cart total displayed $0.00, expected $42.00", which is a far more actionable signal than "the tests pass" from a unit suite that never touched the rendered DOM.

## Reading the verdict: what each field in run_objective actually tells you

It's worth understanding what each field in the response means, because the agent's next action depends on parsing it correctly, and so does yours if you're reviewing the transcript.

`status` is the headline: `passed`, `failed`, `error`, or `timeout`, mirroring BrowserBash's CLI exit codes (0, 1, 2, 3 respectively) so the meaning is consistent whether you're running from a terminal, CI, or an MCP call. `summary` is a plain-English description of what happened, written for a human or an agent to read without parsing structured data. `final_state` captures where the browser ended up, useful for catching cases where a flow redirected somewhere unexpected even if the immediate check passed. `assertions` is populated when the underlying test used deterministic `Verify` steps, things like "URL contains /checkout" or "'Add to cart' button visible", each with an expected-vs-actual pair rather than a model's subjective judgment call. `cost_usd` and `duration_ms` matter once you start running these checks frequently inside an editor session, since every `run_objective` call spends a bit of model budget and browser time, and you'll want to notice if a particular objective is taking far longer than it should.

One honest caveat: not every objective can be checked deterministically. If your prompt asks the agent to judge something subjective, like whether a layout "looks right", the resulting check will be agent-judged rather than assertion-based, and BrowserBash flags that difference (`judged: true`) so you're not mistaking a model's opinion for a hard pass. For anything you care about being reproducible, phrase the objective around concrete, checkable conditions, an error message appearing, a URL changing, a specific piece of text showing up, rather than aesthetic judgments.

## Going further: testmd files, saved logins, and matching your CI

`run_objective` is the right tool for ad hoc checks during a coding session, but once a flow is worth checking repeatedly, promote it to a committed `*_test.md` file and have the agent call `run_test_file` instead. This keeps the check version-controlled and lets you add `version: 2` frontmatter to get deterministic API seeding alongside UI verification, useful when a checkout flow needs a product to exist before the agent can add it to a cart:

```markdown
---
version: 2
---
# Checkout total matches product price

1. POST https://localhost:3000/api/products with body {"name": "Test Widget", "price": 42.00}
   Expect status 201, store $.id as 'productId'
2. Go to localhost:3000, add the product with id {{productId}} to the cart, and proceed to checkout
3. Verify text "42.00" visible
```

The API step and the `Verify` step never touch a model at all, only the plain-English middle step does, which keeps the check fast and cheap while still exercising the real UI. Point the agent at this file with `run_test_file` instead of re-typing the objective every time, and it becomes a real regression check rather than a one-off.

If the flow you're checking requires being logged in, save a session once with `browserbash auth save checkout-user --url localhost:3000/login`, log in interactively when the browser opens, and reuse it with `--auth checkout-user` on future runs so the agent isn't re-authenticating on every single check. And if you eventually want the same checks running in CI rather than just inside your editor, the exact same `*_test.md` files work with `browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2` in a [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), so the checks Cursor or Windsurf ran locally during development are the same ones gating your pull requests.

## When to choose the MCP integration versus the plain CLI

The MCP server is the right call when you want the coding agent itself to decide, mid-conversation, whether to check its own work, without you manually switching to a terminal. It's a tight loop: agent writes code, agent calls `run_objective`, agent reads the verdict, agent either reports success or keeps iterating. That's genuinely useful for the kind of exploratory, multi-turn sessions Cursor and Windsurf are built around.

The plain CLI is still the better fit for scripted, repeatable pipelines, a pre-commit hook, a CI job, a nightly regression suite, anywhere a human isn't in the loop reading a conversation and the exit code is what matters, not a tool-call response an agent needs to reason about. It's also the more transparent option if you want to see the NDJSON stream directly rather than trusting an editor's summary of it. If you're comparing tools generally, browserbash's [features](https://browserbash.com/features) and [pricing](https://browserbash.com/pricing) pages cover both paths.

In practice, most teams end up using both: MCP inside the editor during active development, so the agent can self-check as it goes, and the CLI in CI via the GitHub Action, so the same tests run deterministically on every pull request regardless of which editor or agent wrote the change. Neither replaces the other, they cover different points in the same workflow. For a broader look at how teams structure that split, the [learn](https://browserbash.com/learn) section and [tutorials](https://browserbash.com/tutorials) walk through more end-to-end setups.

## FAQ

### How do I add BrowserBash as an MCP server in Cursor?

Add a `browserbash` entry to `.cursor/mcp.json` (project-scoped) or `~/.cursor/mcp.json` (global) with `"command": "browserbash"` and `"args": ["mcp"]`, then restart Cursor. The MCP panel in settings should show the server as connected, and the agent gets access to `run_objective`, `run_test_file`, and `run_suite`.

### Does the BrowserBash MCP server require an API key?

No. BrowserBash defaults to Ollama-first model resolution, so if you have a local model running, `run_objective` calls work with no API key and nothing leaves your machine. You can optionally set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or an OpenRouter key in the server's environment for harder or longer flows.

### Can Windsurf's Cascade agent verify its own UI changes automatically?

Yes, once you've added `browserbash` to `~/.codeium/windsurf/mcp_config.json`, Cascade can call `run_objective` mid-conversation to drive a real browser and check whether a change actually works, then read the structured verdict back into its response instead of just assuming success from the diff.

### What's the difference between run_objective and run_test_file in the MCP tools?

`run_objective` takes a single plain-English instruction and is meant for ad hoc checks during a coding session. `run_test_file` runs a committed `*_test.md` file, which is better once a check is worth repeating, since it's version-controlled and can include deterministic `Verify` assertions and API seeding steps rather than being re-typed each time.

Once the config is in place, checking your own work stops being a separate step you remember to do and becomes part of how the agent already works. Install it with `npm install -g browserbash-cli`, wire it into Cursor or Windsurf using the config above, and try it on the next fix you ask either editor to make. If you want a hosted dashboard for run history later on, [sign up](https://browserbash.com/sign-up) is optional and the CLI stays fully free either way.
