---
title: Windsurf and BrowserBash: Browser Verification via MCP
description: "Set up windsurf browser testing mcp with BrowserBash so Cascade can drive a real browser and verify UI changes instead of guessing."
date: 2026-07-25
category: agents
---

Windsurf's Cascade agent is good at editing code fast, but it cannot see what the browser actually renders after it finishes. That gap is exactly what windsurf browser testing mcp setups exist to close: you wire BrowserBash into Windsurf over the Model Context Protocol, and Cascade gets a tool it can call to open a real Chrome, perform a plain-English flow, and read back a structured verdict instead of assuming the diff worked. This piece walks through the setup, then a worked example of Cascade fixing a UI bug and using BrowserBash to prove the fix actually landed.

If you have used Cursor or Claude Code with an MCP-connected test runner, the shape here will feel familiar. What is different is the workflow Windsurf encourages: you describe an edit in the Cascade panel, Cascade makes the change across files, and instead of you tabbing over to a browser to eyeball it, Cascade itself runs the verification step and reads the result. The human stays in the loop for review, not for babysitting every click.

## Why Cascade needs a verification tool in the first place

Windsurf's Cascade agent reasons over source files, diffs, and terminal output. All of that is text, and Cascade is fast at it. What it cannot do natively is perceive a running page: whether a modal actually opened, whether a form submission redirected to the right route, whether a CSS change actually fixed the overlapping button it was supposed to fix. None of that exists in a diff. It only exists once a browser renders the code.

Left without a verification tool, an agent in this position has a few unsatisfying options. It can declare victory based on the code looking correct, which is how a one-line CSS typo or a missing `z-index` sails into a commit message that says the bug is fixed. It can run existing unit or component tests, which is useful but tests functions, not what a user actually sees on screen. Or it can ask you to check manually, which defeats a good chunk of the reason you wanted an agent doing the work.

A windsurf browser testing mcp connection gives Cascade a fourth option: call a tool, get a real answer. BrowserBash exposes that tool. Cascade sends a plain-English objective like "open the pricing page and confirm the annual toggle shows a discounted price," a real browser executes it, and the MCP response comes back as structured JSON: status, summary, and any values you asked it to extract. Cascade reads that JSON the way it reads a compiler error, and decides what to do next without you translating a screenshot into words for it.

## What BrowserBash actually is

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy that turns plain English into browser automation. You write an objective in natural language, an AI agent drives a real Chrome or Chromium browser step by step, no CSS selectors and no page-object boilerplate required, and it returns a deterministic pass/fail verdict along with structured results. It installs with `npm install -g browserbash-cli` and runs as the `browserbash` command, currently at version 1.5.1.

The model story matters if you care about running this for free: BrowserBash defaults to a local Ollama model, so nothing leaves your machine and you need no API key at all. If Ollama is not running, it falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, so you can bring a hosted key when you want a stronger model on a hard flow. Very small local models, in the 8B-and-under range, can be flaky on long multi-step objectives, so if Cascade is going to hand off multi-step verification tasks, a mid-size local model (Qwen3 or Llama 3.3 in the 70B class) or a capable hosted model handles it more reliably.

The part that makes this relevant to Windsurf specifically is `browserbash mcp`, added in version 1.5.0. It serves the CLI over the Model Context Protocol on stdio, exposing three tools: `run_objective` for a single plain-English task, `run_test_file` for a committed `*_test.md` file, and `run_suite` for a whole folder run in parallel. Any MCP-capable host, Windsurf included, can call these tools directly.

## Setting up windsurf browser testing mcp

The setup is three steps: install the CLI, register it as an MCP server in Windsurf, and confirm Cascade can see the tools.

First, install BrowserBash globally so the `browserbash` binary is on your PATH:

```bash
npm install -g browserbash-cli
```

Second, open Windsurf's Cascade panel and go to the MCP servers settings (the plug icon in the Cascade toolbar, or Windsurf Settings > Cascade > MCP Servers). Windsurf keeps its MCP server list in a JSON config you can edit directly. Add an entry for BrowserBash:

```bash
{
  "mcpServers": {
    "browserbash": {
      "command": "browserbash",
      "args": ["mcp"]
    }
  }
}
```

That is the whole registration. BrowserBash speaks MCP over stdio, so there is no port to open and no separate process to keep alive outside of what Windsurf spawns when Cascade needs it. Save the config and refresh the MCP server list in Windsurf; you should see `browserbash` show up with three tools attached: `run_objective`, `run_test_file`, and `run_suite`.

Third, sanity-check the connection before you trust it inside a real task. Open a new Cascade conversation and ask it directly to use the tool:

```bash
browserbash run "Open https://example.com and confirm the page title contains 'Example Domain'" --agent --headless
```

Running that from a terminal first is a useful gut check independent of Windsurf: if it returns a clean verdict on its own, you know any failure inside Cascade is an MCP wiring issue, not a BrowserBash problem. Once that works, ask Cascade in the Cascade panel to "verify example.com loads using the browserbash tool" and watch it call `run_objective` on its own. If Windsurf lists the tool but the call errors out, check that `browserbash` resolves on the PATH Windsurf's spawned process actually uses; on macOS, GUI apps sometimes inherit a different PATH than your interactive shell, so an absolute path in the `command` field (for example `/usr/local/bin/browserbash` or wherever `which browserbash` points) sidesteps that entirely.

## Inside the verdict: what Cascade actually reads back

The reason this integration works cleanly is that the MCP response is structured, not prose. Every call to `run_objective`, `run_test_file`, or `run_suite` returns a JSON verdict with fields Cascade can branch on directly: `status` (passed or failed), a `summary`, the `final_state` of the page, any `assertions` that ran, a `cost_usd` estimate, and `duration_ms`. Nothing about that shape requires Cascade to parse English to figure out whether the test passed.

This is worth dwelling on because it is easy to assume "agent calls a testing tool" and "agent reads terminal output" are the same thing. They are not. If Cascade had to read a human-formatted pass/fail line from stdout, a change to that formatting, a stray warning printed above the result, or a slow-loading page that pushes the summary onto a second line would all be plausible ways for the agent to misread a failure as a pass. A structured JSON field does not have that failure mode. Cascade checks `status === "passed"` the same way it checks an exit code, and it is right every time the tool itself is right.

It is also worth being honest about what "a failed test is a successful validation" means here. When BrowserBash reports `status: "failed"`, the MCP tool call itself did not error, it succeeded at doing exactly what you asked: it drove the browser, hit the failure condition, and told you precisely that. Cascade does not need to disambiguate "the tool broke" from "the feature is broken." Those are different signals, and BrowserBash keeps them different.

## Worked example: Cascade fixes a UI bug and verifies it

Here is a concrete run to make this less abstract. Say your team's dashboard has a bug: the "Export CSV" button on the reports page is supposed to be disabled until at least one row is selected, but a recent change to the table component left it clickable regardless. You open Windsurf, point Cascade at the bug, and ask it to fix and verify.

Cascade reads the report table component, finds that the `disabled` prop on the export button was bound to a stale `hasSelection` variable that got shadowed by a local const during a refactor two weeks earlier. It renames the shadowing variable, rewires the prop, and saves the file. This is the part Cascade is genuinely good at: fast, mechanical, low-risk code editing once the root cause is found.

Now comes the part that used to require you. Instead of asking you to reload the dashboard and click around, Cascade calls the BrowserBash MCP tool directly:

```bash
browserbash run "Go to the reports page, confirm the Export CSV button is disabled with no rows selected, then select the first row and confirm the button becomes enabled" --agent --headless
```

Under the hood this is the same call Cascade makes through `run_objective` in the MCP session, just spelled out as a CLI invocation so you can see exactly what it is asking for. A real Chrome opens, lands on the reports page, checks the button's disabled state, clicks a row's checkbox, and checks the state again. The verdict comes back `status: "passed"`, with a `summary` noting both conditions held and a `final_state` showing the row selection and button state at the end of the run. Cascade reads that JSON, sees a clean pass, and reports back to you that the fix is verified, not just written.

If the fix had been incomplete, say the disabled state updated correctly but a leftover `pointer-events: none` never got removed so the button visually looked enabled but did not actually fire a click, BrowserBash's failure evidence would have caught it too, because the objective asks it to confirm the button becomes enabled and functionally clickable, not just visually different. That is the difference between a verification step that reads the DOM and one that reads pixels: a real browser executing real interactions surfaces the gap between "looks right" and "works."

## Turning that objective into a committed test file

A one-off `run_objective` call is great for the fix-and-verify loop while Cascade is actively working, but you do not want to retype that objective by hand every time someone touches the reports page. Once the fix lands, ask Cascade to commit it as a `*_test.md` file so `browserbash mcp`'s `run_test_file` tool, or CI, can run it again on every future change:

```bash
# .browserbash/tests/export-button-state_test.md
# Export CSV button reflects row selection

- Go to the reports page
- Confirm the Export CSV button is disabled
- Select the first row
- Verify 'Export CSV' button visible
```

That `Verify` line is not just agent-judged prose. BrowserBash's deterministic assertion grammar compiles patterns like `'name' button|link|heading visible` into a real Playwright check rather than asking a model to eyeball a screenshot and guess. A pass means the condition literally held in the DOM; a fail comes back with expected-versus-actual evidence in the run's `assertions` block, which is exactly the kind of unambiguous signal an agent loop wants. Steps written in plain English outside that grammar still run fine, they are just flagged `judged: true` in the output so you always know which parts of a result are deterministic and which are model judgment.

From here, Cascade (or you, or a teammate) can re-run this exact check any time with:

```bash
browserbash testmd run .browserbash/tests/export-button-state_test.md --agent
```

or hand the whole test directory to Windsurf as a suite via the `run_suite` MCP tool, which runs everything in the folder in parallel and reports one aggregated result.

## Deterministic checks versus agent judgment

It is worth being precise about what "verified by BrowserBash" means, because not every check in a flow is equally strong. Deterministic Verify assertions, URL contains, title is or contains, specific text visible, a named button/link/heading visible, element counts, a stored value equals a target, compile to real Playwright expectations. There is no model in the loop deciding whether the condition held; the browser engine checked it directly. These are the checks you want gating anything Cascade treats as ground truth about whether a fix worked.

Everything else in a BrowserBash objective, the "click the right thing," "fill in this field," "notice that a toast appeared," is handled by an AI agent driving the browser the way a human would, and that agent's summary of what it saw is judgment, not a hard assertion. It is still far more reliable than Cascade guessing from a diff, because at minimum a real browser actually ran the flow, but it is a different confidence tier than a compiled assertion. When you write test files for Cascade to lean on for pass/fail gating, put your strongest claims (did the button become enabled, does the URL now say `/success`) into `Verify` lines that match the deterministic grammar, and let plain-English steps carry the sequencing (navigate here, click that, select this row) around them.

## Cost and speed: why this stays cheap even with Cascade calling it often

If Cascade is going to call BrowserBash every time it makes a UI change, token cost and wall-clock time both matter. Two things keep this workflow from getting expensive or slow as it scales up.

First, the model default. Running fully on local Ollama means every verification call Cascade makes costs nothing in API spend, at the cost of some slack on very long or ambiguous flows where a stronger model would take fewer wrong turns. If you want the reliability of a hosted model only for the runs that need it, BrowserBash's cost governance surfaces a `cost_usd` estimate on every `run_end` from a bundled per-model price table, so you are never guessing what a session cost after the fact.

Second, the replay cache. A green run records the actions it took; the next time an identical or near-identical run executes, BrowserBash replays those recorded actions directly instead of asking a model to re-derive them from scratch, and only falls back to the agent when the page actually changed. In a Cascade-driven loop where the same verification objective might run dozens of times across a session of iterative fixes, this is the difference between "every check burns model tokens" and "only the first check and the checks after real changes do."

For teams running these checks unattended rather than inside an active Cascade session, `browserbash monitor` runs a test or objective on an interval and alerts only on pass-to-fail or fail-to-pass state changes, in either direction, never on every green run:

```bash
browserbash monitor .browserbash/tests/export-button-state_test.md --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

That is a separate concern from the Cascade-in-the-loop workflow this article is mainly about, but it is worth knowing the same test file works both ways: interactively through MCP while Cascade is fixing something, and unattended on a schedule afterward to catch regressions nobody was actively working on.

## Windsurf browser testing MCP versus other verification approaches

There is more than one way to close the gap between "Cascade wrote code" and "the code works in a browser," and it is worth being straight about the tradeoffs rather than pretending BrowserBash is the only option.

| Approach | What it actually checks | Setup cost | Agent-native (structured verdict)? |
|---|---|---|---|
| Cascade reads the diff and asserts confidence | Nothing runtime; code shape only | None | No, this is the failure mode being solved |
| Unit or component tests | Function-level logic, not rendered UI | Existing suite, if you have one | Partially, pass/fail exists but misses visual/UX bugs |
| Manual check by a human after Cascade finishes | Whatever the human happens to look at | Zero setup, ongoing human time cost every run | No, this is a person, not a tool |
| Playwright/Selenium scripts written by hand | Exactly what the script's selectors target | High: selectors break on every UI refactor | Yes, but brittle and maintenance-heavy |
| BrowserBash via MCP | Real browser, plain-English objective, deterministic Verify assertions where used | Low: one `browserbash mcp` registration | Yes, structured JSON verdict Cascade reads directly |

The honest caveat here is that BrowserBash is not a replacement for a mature hand-written Playwright suite if you already have one and it is well-maintained; those scripts can target exact selectors and internal state in ways a plain-English objective sometimes cannot. What BrowserBash changes is the setup cost and the maintenance tax: no selectors to keep in sync with every refactor, and a tool interface Cascade can call the moment it finishes an edit rather than a suite someone runs separately, hours or days later.

## Who should wire this up, and who should skip it

This setup earns its keep for teams where Cascade, or any Windsurf-driven agent, is making UI-adjacent changes on a regular cadence: component libraries, dashboard apps, marketing sites, anything where "does the button work" and "does the page render right" are common questions after an edit. If Cascade is mostly touching backend logic, config files, or infrastructure code with no browser-facing surface, the MCP connection still works but you will not lean on it much.

It is also a good fit if your team already has zero browser test coverage and the alternative is genuinely nobody checking, because the setup cost is one JSON entry and an `npm install`, not a new test framework to learn. If you already have a mature Playwright suite with tight coverage and a CI pipeline that gates merges on it, BrowserBash via MCP is a complement for the fast interactive loop (Cascade verifying its own edit before you even see the diff), not a wholesale replacement for that suite's coverage.

One more honest limit: testmd v2, the newer per-step execution mode with API steps and deterministic Verify checks running against a single browser session, currently drives BrowserBash's builtin engine, which needs an `ANTHROPIC_API_KEY` or an Anthropic-compatible gateway rather than running directly on Ollama or OpenRouter. If you are committed to a fully local, zero-API-key setup, stick to v1 test files (no `version: 2` frontmatter) or the plain-English `run_objective` calls covered above; both work end to end on local models today.

## FAQ

### How do I connect BrowserBash to Windsurf over MCP?

Install BrowserBash globally with `npm install -g browserbash-cli`, then add an MCP server entry in Windsurf's Cascade MCP settings pointing `command` at `browserbash` and `args` at `["mcp"]`. Once Windsurf refreshes its MCP server list, Cascade has access to three tools: `run_objective`, `run_test_file`, and `run_suite`.

### Does Cascade need an API key to run browser verification through BrowserBash?

No. BrowserBash defaults to a local Ollama model, so nothing leaves your machine and no API key is required to run `run_objective` or `run_test_file` calls. If you want a stronger model for harder flows, or you need testmd v2's deterministic API and Verify steps, you can set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or an OpenRouter key and BrowserBash resolves in that order.

### What happens when the browser check fails, does the MCP call error out?

No, and this matters for how Cascade behaves. A failed verification is a successful tool call: `browserbash mcp` returns `status: "failed"` along with a summary and assertion evidence, so Cascade can read a real failure signal and decide to keep fixing, rather than the tool call itself throwing an error that looks like infrastructure trouble.

### Can I use BrowserBash with Windsurf without writing any test files?

Yes. `run_objective` takes a single plain-English instruction with no file to author, which is the natural fit for Cascade verifying an edit it just made in the same session. Test files (`*_test.md`) become useful once you want to re-run the same check later, in CI, or on a schedule via `browserbash monitor`.

Getting this running takes about the time it takes to run one npm install and edit one JSON file. Install with `npm install -g browserbash-cli`, wire the MCP entry into Windsurf, and let Cascade start proving its edits instead of just describing them. No account is required to use the CLI locally; if you later want the free cloud dashboard for run history across a team, sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up).
