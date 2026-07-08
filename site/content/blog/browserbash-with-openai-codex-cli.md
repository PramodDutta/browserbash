---
title: OpenAI Codex CLI and BrowserBash: Verify What Codex Built
description: "Wire OpenAI Codex CLI browser testing into your workflow: shell out to browserbash run --agent, read the NDJSON verdict, and gate commits on the exit code."
date: 2026-07-24
category: agents
---

OpenAI Codex CLI is good at writing code. It is not good at looking at the page it just changed and telling you whether the button actually works. That gap is where most "the agent said it was done" incidents come from: Codex edits a component, runs the unit tests, sees green, and reports success, while the signup form it touched is silently broken in a real browser. OpenAI Codex CLI browser testing is not something Codex does natively, and it should not have to, because that job already has a purpose-built tool: shell out to `browserbash run --agent`, parse the NDJSON it prints, and let the exit code decide whether Codex's work is actually done.

This post walks through that pattern end to end: why a code-writing agent needs an external verifier, how to invoke BrowserBash from inside a Codex session (or from a script Codex calls), how to read the verdict it returns, and how to build a real gate around it so Codex cannot mark a task complete when the browser disagrees.

## Why a coding agent can't verify its own UI work

Codex CLI operates on files. It reads a diff, writes a diff, and its feedback loop is whatever `npm test`, `tsc`, or a linter tells it. None of that touches a rendered page. A component can pass every unit test and still ship a form that submits to the wrong endpoint, a modal that never closes, or a button whose click handler silently throws in production because of a stale import.

The honest failure mode isn't that Codex lies about its work. It's that Codex has no eyes. It cannot open Chrome, click through the flow it just changed, and confirm the outcome a human would check for. Asking it to "test in the browser" without tooling just means it re-reads its own diff and reasons about what should happen, which is exactly the blind spot that ships regressions.

The fix isn't a smarter model. It's giving the agent a deterministic tool that actually drives a browser and returns a verdict Codex can act on programmatically, the same way it already acts on a failing `tsc` exit code.

## What BrowserBash adds to the loop

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy. You describe what should happen in plain English, an AI agent drives a real Chrome or Chromium browser step by step (no selectors, no page objects to maintain), and the CLI returns a deterministic pass/fail verdict plus structured results. Positioning-wise, it's the open-source validation layer for AI agents: something Codex, Claude Code, Cursor, or any other coding agent can call after making a change to confirm the change actually works, not just that it compiles.

The part that matters for this workflow is `--agent` mode. Run any objective with that flag and BrowserBash stops printing human-readable prose and instead emits NDJSON, one JSON object per line, on stdout. Each `step` event describes an action the driving agent took inside the browser, and a final `run_end` event carries the verdict: `status`, a `summary`, `final_state`, any `assertions` that were checked, `cost_usd`, and `duration_ms`. That's a payload built to be machine-read, which is exactly what a script sitting between Codex and a git commit needs.

Model resolution is Ollama-first: BrowserBash tries a local Ollama model before it falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. That means the verification step can run on your machine with zero API cost if you already have Ollama running, which matters if Codex is calling it dozens of times in a session.

## The core pattern: shell out, read NDJSON, gate on exit code

The shape of this integration is simple on purpose. Codex CLI, after editing a file, runs a shell command. That command is `browserbash run "<objective>" --agent --headless`. BrowserBash exits with one of four codes: `0` passed, `1` failed, `2` error (infra problem, budget stop), `3` timeout. Codex reads that exit code the same way it reads a failing test runner's exit code, and only proceeds to the next step, or reports success to you, if it's `0`.

```bash
browserbash run "Go to http://localhost:3000/signup, fill the email field with test@example.com, fill the password field with a valid password, click Create account, and confirm the dashboard page loads with a welcome message" --agent --headless --timeout 90
```

Piped through `--agent`, that command prints a stream like this (trimmed):

```
{"type":"step","action":"navigate","target":"http://localhost:3000/signup","status":"ok"}
{"type":"step","action":"type","target":"input[name=email]","status":"ok"}
{"type":"step","action":"click","target":"button:has-text(\"Create account\")","status":"ok"}
{"type":"run_end","status":"failed","summary":"Dashboard did not load; app redirected back to /signup with a validation error visible","final_state":{"url":"http://localhost:3000/signup"},"cost_usd":0.0,"duration_ms":8421}
```

That's the artifact Codex needs. Not a description of what should happen, evidence of what did happen, with a machine-checkable status field and a summary a human (or the agent itself) can read to understand why. When the exit code is `1`, Codex's next move isn't "assume it's fine," it's "read `run_end.summary`, go back into the code, and try again." That's the gate. It turns "the agent thinks it's done" into "the browser confirmed it's done."

## A worked example: Codex fixes a signup form

Say you ask Codex CLI to fix a bug where the signup form on a Next.js app doesn't redirect after a successful submission. Codex finds the handler, patches the redirect call, and would normally stop there and tell you it's fixed. Instead, wire a post-edit step into the session (either as an explicit instruction in your Codex prompt, or as a script Codex is told to always run after touching files under `app/signup/`):

```bash
npm run build && npm run start -- -p 3939 &
sleep 3
browserbash run "Open http://localhost:3939/signup, sign up with a new random email and a valid password, and verify you land on /dashboard with a heading that says Welcome" --agent --headless --timeout 60
echo "exit code: $?"
```

Three outcomes are possible, and each one changes what Codex does next:

- **Exit 0.** The verdict says the redirect happened and the dashboard rendered. Codex can report the fix as verified, not just applied.
- **Exit 1.** BrowserBash's `run_end.summary` says the page stayed on `/signup` with a validation error visible. Codex reads that, realizes the redirect fires before an async validation call resolves, and goes back to the code with an actual repro description instead of guessing.
- **Exit 2 or 3.** Something infrastructural broke (dev server not up yet, a budget stop, a timeout because the page hung). This is not a verdict on the code, it's a signal to fix the harness (bump the sleep, raise `--timeout`) and re-run.

None of this requires Codex to understand browser automation. It requires Codex to run a command, check `$?`, and branch. That's a pattern every coding agent already knows how to do; the same discipline you'd want on `npm test`, applied to the one layer unit tests can't see.

## Using the MCP server instead of raw shell calls

Shelling out works everywhere, but if your Codex setup supports MCP tool calls directly, BrowserBash also ships an MCP server (new in 1.5.0) that removes even the exit-code parsing step. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, and it installs into an MCP-capable host in one line:

```bash
claude mcp add browserbash -- browserbash mcp
```

The same idea applies to Codex, Cursor, Windsurf, or Zed, wherever the host supports adding a stdio MCP server. Once connected, three tools become available to the agent: `run_objective` for a single plain-English check, `run_test_file` for a committed `*_test.md` file, and `run_suite` for a whole folder run in parallel. Each tool call returns the same structured verdict JSON as `--agent` mode: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, `duration_ms`, but as a direct tool response instead of something to parse off stdout.

This matters for one specific reason: a failed test through MCP is a successful tool call. The MCP call itself succeeds, and the agent reads a `status: "failed"` field in the response. That distinction keeps the coding agent's tool-use loop clean, it never has to special-case a nonzero process exit code inside an MCP client, it just reads the verdict like any other structured tool result and decides what to do next. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so any MCP-aware discovery flow can find it without a manual URL.

## Deterministic Verify assertions, not vibes

A worry with LLM-driven verification is obvious: what if the verifying agent hallucinates a pass? BrowserBash addresses that directly with `Verify` steps that compile to real Playwright checks instead of asking a model to judge the screen. Write a `*_test.md` file with lines like `Verify URL contains "/dashboard"` or `Verify 'Welcome' text visible`, and those compile to actual DOM assertions, an exact URL substring match, a real `getByText` visibility check, an element count, a stored-value equality. No model call happens for that specific line. A pass means the condition provably held; a fail comes back with expected-vs-actual evidence in `run_end.assertions` and in the generated `Result.md`.

Verify lines that fall outside that fixed grammar still execute, but the agent judges them, and BrowserBash flags those with `judged: true` in the output so you can always tell a deterministic check from an LLM's opinion. That's the honest line: some things (was the user redirected, does this text exist) can be checked without a model at all, and BrowserBash checks those without one; other things (does this page look visually broken) still need judgment, and it says so rather than pretending otherwise.

For a Codex integration, that distinction is worth using directly. Instead of a loose plain-English objective, commit a small `*_test.md` file per feature area and point Codex at it:

```markdown
---
version: 2
---
# Signup smoke check

1. POST /api/test/reset-user with body {"email": "test@example.com"}
2. Expect status 200
3. Open /signup, fill the form with test@example.com and a valid password, click Create account
4. Verify URL contains "/dashboard"
5. Verify 'Welcome' text visible
```

That `version: 2` frontmatter (new in 1.5.0) runs steps one at a time against a single browser session, with API steps for seeding state deterministically and Verify steps for checking the result through the UI, no model call for either. Consecutive plain-English steps still group into agent-driven blocks. testmd v2 currently drives the builtin engine, so it needs `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway pointed at a compatible model; it does not yet run directly on Ollama or OpenRouter. Codex would run this with `browserbash testmd run .browserbash/tests/signup_test.md --agent` and read the same NDJSON `run_end` event as before.

## Handling logins, cost, and flaky checks in a Codex loop

Two practical issues show up fast once Codex is calling BrowserBash repeatedly across a session: authenticated flows and per-call cost.

For anything behind a login, save a session once instead of re-authenticating on every check. `browserbash auth save <name> --url <login-url>` opens a browser, you log in by hand once, and hitting Enter saves a Playwright storageState under that name. Every later call adds `--auth <name>` (or an `auth:` frontmatter line in a `*_test.md` file) and skips the login screen entirely. If the saved profile's origins don't cover the page you're checking, BrowserBash prints a warning instead of quietly doing nothing, which matters when a Codex session is running unattended and needs to notice the check didn't actually run against the intended page.

For cost, every `run_end` event carries a `cost_usd` estimate pulled from a bundled per-model price table (unknown models simply get no estimate, rather than a fabricated one). If Codex is looping through many small verification calls in a single session, running under `run-all` with `--budget-usd` stops launching new checks once the suite crosses a spend ceiling, marks the rest `skipped`, and exits `2` so the caller knows it was a budget stop and not a real failure:

```bash
browserbash run-all .browserbash/tests --shard 1/2 --budget-usd 2.00 --junit out/junit.xml
```

On flakiness: BrowserBash is honest that very small local models, roughly 8B parameters and under, can be unreliable on longer multi-step objectives. If Codex's verification checks are simple (one form, one redirect), a small local model through Ollama is usually fine and free. For anything with more steps or more ambiguity, a mid-size local model (Qwen3 or Llama 3.3 in the 70B class) or a capable hosted model gives more consistent verdicts. Keep the objectives narrow rather than compensating for a weak model with a longer prompt; a five-step Verify runs more reliably than a fifteen-step one regardless of model size.

## BrowserBash vs. other ways to verify Codex's changes

There's more than one way to close this loop, and it's worth being direct about where each one fits.

| Approach | What it actually checks | Model calls per check | CI-friendly exit code |
|---|---|---|---|
| Unit/integration tests (Jest, Vitest) | Function-level and component-level behavior, no real browser | None | Yes |
| Playwright/Selenium scripts you write by hand | Exact behavior you coded assertions for | None | Yes |
| Codex re-reading its own diff | What the code should do, not what it does | N/A (reasoning only, no execution) | No |
| BrowserBash `--agent` / MCP | Real rendered page behavior, deterministic where possible | Zero with Ollama + replay cache warm, otherwise one agent run | Yes (0/1/2/3) |

Hand-written Playwright specs are still the right call when a flow is stable, high-traffic, and worth the maintenance cost of selector upkeep, BrowserBash's own `browserbash import` command exists specifically to convert existing Playwright specs into plain-English testmd files so you're not choosing one or the other permanently. Where BrowserBash earns its place in a Codex loop specifically is the fast, throwaway check: "did the thing I just changed actually work," run immediately after an edit, without writing or maintaining a selector-based script for every small fix Codex makes. It's also worth being clear that a replay cache (a passing run records its actions, and an identical follow-up run replays them with no model calls at all) makes repeated checks on the same flow close to free in tokens, which is exactly the access pattern a Codex loop generates.

## When to wire this in, and when not to

This pattern earns its keep when Codex is making changes to anything a user clicks: forms, navigation, auth flows, checkout, dashboards. Any time "the tests pass" and "the feature works" could diverge, that's the signal to add a verification step Codex can't talk its way past.

It's less necessary for pure backend or library changes where unit tests already cover the actual behavior and there's no rendered surface to check. Forcing a browser check onto a change that never touches the DOM just adds latency to the loop for no signal. Use judgment: gate UI-touching diffs, skip the rest.

It's also not a replacement for a real regression suite. Treat BrowserBash checks in a Codex loop as fast, cheap, per-change verification, and keep a proper `run-all` suite (with sharding, `run-all --shard 2/4`, and JUnit output for CI) as the thing that runs on every PR regardless of which agent touched the code. The [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) covers that second layer, posting a verdict table as a PR comment so a human reviewer sees the same signal Codex saw.

If you want a broader walkthrough of testmd syntax, Verify grammar, and the MCP tool set before wiring any of this in, the [learn](https://browserbash.com/learn) section and the [tutorials](https://browserbash.com/tutorials) page cover both in more depth than fits here, and the [case study](https://browserbash.com/case-study) page has a longer example of a team using the same verify-after-change pattern in CI.

## FAQ

### Can OpenAI Codex CLI test in a real browser on its own?

No. Codex CLI edits files and runs commands like test runners or linters, but it has no built-in way to render a page and observe the result. To get real OpenAI Codex CLI browser testing, you shell out to an external tool, like `browserbash run --agent`, that actually drives Chrome and returns a verdict Codex can read.

### How does Codex know whether a browser check passed or failed?

BrowserBash exits with a standard code: `0` for passed, `1` for failed, `2` for an error or budget stop, and `3` for a timeout. In `--agent` mode it also prints NDJSON with a final `run_end` event containing `status` and a `summary`, so Codex can branch on the exit code and read the summary to understand what went wrong.

### Does verifying Codex's output with BrowserBash cost extra API tokens?

Not necessarily. BrowserBash resolves models Ollama-first, so a local model on your machine runs the verification for free. If a check is repeated against an unchanged flow, the replay cache replays the recorded actions with zero model calls at all, and `run-all --budget-usd` caps spend if you are running many checks through a hosted model.

### What's the difference between browserbash run --agent and the MCP server for this workflow?

`--agent` mode is a CLI call: you shell out, get NDJSON on stdout, and read the exit code and the final `run_end` line. The MCP server (`browserbash mcp`) exposes the same verdict as a direct tool response inside an MCP-capable host, so a failed check is a successful tool call with a `status: "failed"` field, no stdout parsing required. Use whichever your Codex setup supports; both return the same structured data.

Install it with `npm install -g browserbash-cli` and point Codex at it the next time it touches a form, a redirect, or anything else a user actually clicks. An account is optional; sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) only if you want the free cloud dashboard on top of the local one.
