---
title: Give Claude Code a Real Browser From the CLI (No MCP Server Needed)
description: "Claude Code browser automation CLI: wire BrowserBash in as a skill so the agent opens real Chrome, acts, and reads NDJSON verdicts — no MCP server."
date: 2026-04-24
category: agents
---

Claude Code can write a login flow, refactor a checkout, and patch a flaky form handler — but it cannot tell you whether any of that actually works in a browser unless you give it a way to drive one. The usual answer is to stand up a Model Context Protocol server, register a dozen browser tools, and hope the agent calls them in the right order. This article shows a simpler path to Claude Code browser automation from the CLI: wrap BrowserBash in a skill so the agent opens real Chrome, performs a plain-English objective, and reads a structured pass/fail verdict back as NDJSON. No MCP server to run, no tool registry to babysit, no persistent process. Just a command the agent already knows how to call.

That last point matters more than it sounds. Claude Code is, at its core, a thing that runs shell commands well. If your browser layer is a single binary that takes an English sentence and prints JSON, you are working with the grain of the agent instead of against it. This is the same agent-native niche [Kane CLI](https://github.com/LambdaTest/kane-cli) targets — give the coding agent a way to verify its own work in a real browser — and BrowserBash gets there with a model story that defaults to free, local inference.

## Why an MCP server is often the wrong tool for browser verification

MCP is a genuinely good protocol. It standardizes how an agent discovers and calls tools, and for stateful, long-lived integrations — a database connection, a design system, a ticketing system — it earns its keep. Browser verification inside a coding loop is a different shape of problem, and the MCP-server approach carries friction that is easy to underestimate.

A browser MCP server is a running process. Something has to start it, keep it alive, and tear it down. When it crashes mid-session — and headless browser processes do crash — your agent is holding a dead tool handle with no clean way to recover. You are debugging plumbing instead of the feature.

The tool surface is also wide. A typical Playwright-style MCP exposes navigate, click, type, screenshot, evaluate, wait_for_selector, and more, each a separate call the model has to sequence correctly. That gives the agent a lot of rope. It can click before the page settled, type into the wrong field, or burn ten turns re-snapshotting the DOM to figure out where it is. Every turn is latency, tokens, and a chance to go off the rails. The "reconnaissance-then-action" pattern that good browser MCPs document exists precisely because low-level tool surfaces are easy to misuse.

Contrast that with handing the agent one command that says "log in as the test user and confirm the dashboard greeting shows their name," and getting back a single object that says `passed` with the extracted greeting text. The agent does not orchestrate the browser. It states intent and reads a verdict. Orchestration is BrowserBash's job, inside one process invocation that exits cleanly whether it succeeded, failed, errored, or timed out.

None of this means MCP is bad. It means that for the specific job of "did the thing I just built work in a real browser," a CLI the agent shells out to is usually lower-friction. If you already run a browser MCP and like it, keep it — you can run both.

## What BrowserBash gives the agent

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it once:

```bash
npm install -g browserbash-cli
```

It needs Node 18 or newer and Chrome for the default local provider. From there, the unit of work is an objective written in plain English. There are no selectors, no page objects, no waits to tune. An AI agent inside BrowserBash drives a real Chrome or Chromium browser step by step and returns a verdict plus any structured values you asked it to extract.

The model story is the part that makes this comfortable to hand to a coding agent that may run dozens of checks a day. The default model is `auto`, resolved in this order: first a local [Ollama](https://browserbash.com/learn) install (free, no keys, nothing leaves your machine); then `ANTHROPIC_API_KEY` if present, which uses `claude-opus-4-8`; then `OPENAI_API_KEY`, which uses `openai/gpt-4.1`; otherwise it errors with guidance on what to set. On local models the model bill is a guaranteed zero, which is exactly what you want when the agent is calling the browser layer on a tight loop.

One honest caveat to internalize before you wire this up: very small local models (8B and under) get flaky on long, multi-step objectives — they lose the thread halfway through a checkout. The sweet spot for reliable agent-driven runs is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If your Claude Code skill keeps producing `error` verdicts on complex objectives, the model is usually the variable to change first, not the objective.

### The contract: NDJSON in, exit codes out

The feature that makes BrowserBash agent-native rather than just CLI-friendly is `--agent` mode. Add the flag and the tool emits NDJSON — one JSON object per line — instead of human prose. Progress events look like this:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}
```

And the run ends with a terminal event:

```json
{"type":"run_end","status":"passed","summary":"...","final_state":{},"duration_ms":0}
```

Exit codes mirror the terminal status: `0` passed, `1` failed, `2` error, `3` timeout. That is the entire contract. An agent — or a CI step — reads the last line for the verdict and the exit code for the gate, and never has to parse prose. If you have seen Kane CLI's `--agent --headless` NDJSON output, this will feel familiar by design; both tools converged on structured streams because prose parsing inside an agent loop is a reliability tax nobody wants to pay.

## Wiring BrowserBash into Claude Code as a skill

Claude Code skills are the clean way to teach the agent a new capability. A skill is a directory with a `SKILL.md` file: YAML frontmatter that describes when to use the skill, plus Markdown instructions that get injected into the conversation when the agent decides the skill is relevant. Skills can declare `allowed-tools`, ship reference docs, and include scripts. Crucially, the agent picks a skill by reading its description in plain language — so a well-written description is what makes the agent reach for the browser at the right moment.

Here is a minimal skill that gives Claude Code a browser. Create `.claude/skills/browser-check/SKILL.md` in your project:

```
---
name: browser-check
description: >
  Verify a web feature works in a real Chrome browser. Use after
  implementing or changing any UI flow (login, signup, checkout,
  forms, navigation) to confirm it actually works end to end.
  Drives real Chrome via the browserbash CLI and returns a
  structured pass/fail verdict.
allowed-tools: Bash
---

# Browser verification with BrowserBash

When you have changed a user-facing flow and want to confirm it works,
run a single BrowserBash objective in agent mode and read the verdict.

## How to run a check

Use this exact command shape:

    browserbash run "<plain-English objective>" --agent --headless

- Write the objective as a goal, not a click script. Say what a user
  would accomplish, e.g. "log in as test@example.com / Test1234 and
  confirm the dashboard shows 'Welcome'."
- `--agent` makes output NDJSON. Read the LAST line: it has
  "type":"run_end" with a "status" of passed | failed | error | timeout.
- Trust the exit code as the gate: 0 passed, 1 failed, 2 error, 3 timeout.
- If status is "error", it is usually setup (no Chrome, model not
  resolved). Surface the summary field to the user; do not retry blindly.
- On "failed", read the summary and final_state to explain WHAT broke,
  then propose a code fix.

## Extracting values

If the user needs a value off the page (an order ID, a total, a count),
ask for it in the objective: "...and report the order number shown on
the confirmation page." It comes back in final_state.

## Recording a run for the user

If the user wants evidence, add --record to capture a screenshot and a
.webm session video, then point them at the saved run.
```

That is the whole integration. No server, no MCP config, no tool registry. The agent now has a verb — "verify this in a browser" — and it knows the command, the contract, and how to read the result. When Claude Code finishes editing a login handler, the skill's description nudges it to open Chrome and check, rather than declaring victory on a green unit test that never touched the DOM.

### A concrete loop

Picture the agent has just refactored a signup form. With the skill loaded, a natural sequence is:

1. The agent runs `browserbash run "sign up with a new random email and a valid password, then confirm the app redirects to the onboarding screen" --agent --headless`.
2. BrowserBash opens real Chrome, drives the form, and streams step events.
3. The last NDJSON line reports `"status":"failed"` because the submit button stayed disabled.
4. The exit code is `1`, so the agent knows the gate failed without parsing anything.
5. The agent reads the summary, sees the button never enabled, inspects its own validation code, finds an off-by-one in a length check, fixes it, and re-runs the same objective until the verdict flips to `passed`.

The agent verified its own work against a real browser. That is the loop the agent-native browser tools are all chasing, and BrowserBash closes it with a command and a skill file rather than a running service.

## Beyond local Chrome: providers, engines, and CI

The skill above uses defaults — the `local` provider (your Chrome) and the `stagehand` engine. Both are swappable through real flags, and you do not have to teach the agent any of this until you need it.

Engines decide who interprets the English. The default `stagehand` engine (MIT, by Browserbase) gives the agent act / extract / observe / agent primitives with self-healing behavior. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright, and it is selected automatically for LambdaTest and BrowserStack runs. Switch explicitly with `--engine stagehand` or `--engine builtin`.

Providers decide where the browser physically runs, via `--provider`:

| Provider | Where the browser runs | What it needs |
| --- | --- | --- |
| `local` (default) | Your machine's Chrome | Chrome installed |
| `cdp` | Any DevTools endpoint | `--cdp-endpoint ws://...` |
| `browserbase` | Browserbase cloud | `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` |
| `lambdatest` | LambdaTest grid (auto `builtin` engine) | `LT_USERNAME` + `LT_ACCESS_KEY` |
| `browserstack` | BrowserStack grid (auto `builtin` engine) | `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` |

For a Claude Code skill running on a developer laptop, `local` is right almost always — it is free, it is fast, and nothing leaves the machine. The `cdp` provider is handy when the agent should attach to a browser you already have open (a logged-in session, a dev profile) instead of launching a fresh one. The cloud and grid providers matter when you graduate the same objectives into CI across many browser/OS combinations.

That graduation is smooth because the contract does not change. The same `--agent` NDJSON the skill reads on your laptop is what a CI job reads on a runner. A GitHub Actions or [Jenkins](https://browserbash.com/tutorials) step runs the objective headless, gates on the exit code, and the agent and the pipeline share a browser verification stage verbatim. The [features](https://browserbash.com/features) page and the broader [blog](https://browserbash.com/blog) cover the streaming contract in more detail.

### Useful flags to expose to the agent

A few `run` flags are worth mentioning in your `SKILL.md` so the agent can reach for them:

- `--record` captures a screenshot and a `.webm` session video via bundled ffmpeg; on the `builtin` engine it also writes a Playwright trace. Good for handing a human evidence of a failure.
- `--timeout <seconds>` caps a run so a stuck objective returns a clean `timeout` (exit `3`) instead of hanging the agent.
- `--headless` keeps Chrome invisible, which is what you want for any unattended or CI run.
- `--dashboard` opens the local dashboard for this run; `--upload` pushes the run to the cloud, but only if you have linked an account first.

Here is the kind of command the agent ends up running when a human wants proof:

```bash
browserbash run "log in as the demo user and confirm the dashboard shows three open tickets, then report the ticket titles" --agent --record --headless --timeout 120
```

One line, real Chrome, a verdict, extracted titles, and a video on disk if it fails.

## Markdown tests: when a check should outlive the conversation

`--agent` runs are perfect for the moment-to-moment loop, but the moment is ephemeral. When a flow is important enough to keep verifying — your core login, your checkout, your most-broken form — you want a check that lives in the repo and survives the conversation. BrowserBash markdown tests do that.

A `*_test.md` file is a committable test where each list item is a step. It supports `{{variables}}` for templating, `@import` for composing shared setup, and secret-marked variables that are masked as `*****` in every log line. After each run it writes a human-readable `Result.md`. You run one with:

```bash
browserbash testmd run ./login_test.md
```

This is a natural division of labor for an agent. Transient verification during a refactor uses `run --agent`. When the agent or the user decides "this flow needs a permanent guard," the skill can generate a `*_test.md` file, commit it, and the team now has a plain-English regression check that any future agent run — or any human — can execute. Because the steps are English, the test reads like documentation and does not rot the way selector-bound scripts do.

## Where your run data lives (and where it doesn't)

For a tool you are about to let an autonomous agent call repeatedly, "where does the data go" is a fair question. The honest answer for BrowserBash defaults is: nowhere off your machine.

Every run is written to disk at `~/.browserbash/runs`, with secrets masked and the store capped at 200 runs. That local history is what powers the optional local dashboard — `browserbash dashboard` serves a fully local UI on `localhost:4477`, and `--clear` wipes the store. No account, no network, no upload.

If you do want cloud history — to share a failing run with a teammate, say — it is strictly opt-in. You link an account once with `browserbash connect --key bb_...`, then add `--upload` to the specific runs you want pushed. Without `--upload`, nothing leaves your machine, period. Free cloud runs are kept for 15 days. You can read the boundaries on the [pricing](https://browserbash.com/pricing) page; the short version is that the agent loop works entirely offline on local models, and the cloud is an explicit choice you make per run.

## BrowserBash vs. the alternatives for Claude Code browser automation

There is real overlap in this space, and pretending otherwise helps nobody. Here is an honest read as of 2026.

| Approach | How the agent drives the browser | Model | License | Best when |
| --- | --- | --- | --- | --- |
| **BrowserBash skill** | Shell out to `browserbash run --agent`; read NDJSON + exit code | Ollama-first `auto`; or hosted (Claude / GPT) | Apache-2.0 | You want free local inference and a CLI the agent shells to; no server to run |
| **Kane CLI** | Native agent mode (`--agent --headless`) emitting NDJSON | Not publicly specified | Apache-2.0 | You want a polished agent-native CLI with native multi-agent support and a LambdaTest/TestMu grid path |
| **Playwright MCP server** | MCP tool calls (navigate, click, type, evaluate, …) | Whatever the agent uses (e.g. Claude) | Open source (MIT) | You want low-level DOM control and already live in the MCP ecosystem |

A few points of fairness. Kane CLI, from TestMu AI (formerly LambdaTest), is squarely in the same agent-native niche — terminal-native browser verification, plain-English objectives, `--agent --headless` NDJSON, and the same exit-code scheme (0/1/2/3). Its launch materials describe up to fifty steps per flow and one-command conversion of plain-English flows into native Playwright code, and it ships native support for Claude Code, Cursor, Codex, Gemini, and others. If your team is already on the LambdaTest/TestMu platform, or you specifically want that Playwright-code-generation step, Kane CLI is a strong, purpose-built fit and you should evaluate it on its own terms. Its underlying model is not publicly specified, so if guaranteed-local, $0 inference is a hard requirement, confirm that directly rather than assuming.

The Playwright MCP server is the better choice when you genuinely need fine-grained, low-level browser control inside the agent — manipulating individual elements, reading network requests, evaluating arbitrary JS as discrete steps. That control is the whole point of MCP, and BrowserBash deliberately trades it away for a higher-level "state intent, read verdict" contract. Different altitude, different job.

BrowserBash's distinct edge for this use case is the Ollama-first model story: the agent can run an unlimited number of browser checks on a local model with a guaranteed zero model bill and nothing leaving the machine, and it is Apache-2.0 so you can read every line of what is driving your browser. If those two properties matter to you, the skill approach in this article is the shortest path to a Claude Code agent that verifies its own work.

## When to choose the skill approach (and when not to)

**Reach for the BrowserBash skill when** you want Claude Code to verify UI work without standing up infrastructure; you value free local inference and on-machine data; you prefer a small, well-defined contract (intent in, verdict out) over a wide low-level tool surface; and you want the same command to work identically on your laptop and in CI. This is the common case for a developer or SDET who wants the agent to stop claiming a flow works without ever opening a browser.

**Look elsewhere when** you need the agent to perform fine-grained DOM surgery step by step — then a Playwright MCP's low-level tools fit better. If you are committed to the LambdaTest/TestMu ecosystem or want built-in Playwright code generation from flows, evaluate Kane CLI directly. And if your only available model is a tiny local one (8B or under) and you cannot run a mid-size model or reach a hosted one, expect flakiness on long objectives regardless of which tool you pick — that is a model limitation, not a tooling one.

You can also mix approaches. Nothing stops you from running a Playwright MCP for interactive debugging and a BrowserBash skill for verdict-style verification in the same project. They answer different questions.

## Try it in five minutes

Install the CLI, drop the `SKILL.md` into `.claude/skills/browser-check/`, and ask Claude Code to verify a flow you just changed. If you have Ollama running with a mid-size model, the whole thing is free and offline. If not, set `ANTHROPIC_API_KEY` and the `auto` model resolves to `claude-opus-4-8` automatically. Either way, the agent gets a real browser and a verdict it can act on — without you running a single extra service. For more end-to-end recipes, the [tutorials](https://browserbash.com/tutorials) and [case studies](https://browserbash.com/case-study) are good next stops.

## FAQ

### Do I need an MCP server to give Claude Code browser access?

No. You can wrap BrowserBash in a Claude Code skill so the agent shells out to the `browserbash run --agent` command and reads a structured NDJSON verdict. There is no server to start, keep alive, or tear down, and no tool registry to configure. The agent treats the browser as a single command that takes an English objective and returns a pass/fail result with an exit code.

### How does Claude Code know when to open the browser?

It reads the skill's description. A Claude Code skill is a `SKILL.md` file whose YAML frontmatter describes when the capability applies — for example, "verify a UI flow works in a real Chrome browser after changing it." When the agent finishes relevant work, that plain-language description is what prompts it to run a browser check rather than assuming the change works. A clear, specific description is the single biggest factor in the agent reaching for the browser at the right time.

### Is BrowserBash free to run with an AI agent?

Yes. BrowserBash is free and open-source under Apache-2.0, and it defaults to local Ollama inference, which means no API keys and a guaranteed zero model bill with nothing leaving your machine. You only pay a model provider if you explicitly choose a hosted model like Claude or GPT for harder flows. No account is needed to run it, and the optional local dashboard is also free.

### How is this different from Kane CLI?

They share the same agent-native niche: plain-English objectives, a real local Chrome, and an `--agent` mode that emits NDJSON with matching exit codes. Kane CLI, from TestMu AI, adds native multi-agent support and one-command conversion of flows into Playwright code, and its underlying model is not publicly specified. BrowserBash's distinguishing properties are its Ollama-first `auto` model resolution for free local inference and its fully open Apache-2.0 codebase; if your team is on the LambdaTest/TestMu platform, Kane CLI may be the better fit.

Ready to give your agent a browser? Install with `npm install -g browserbash-cli` and, if you want optional cloud history later, [sign up](https://browserbash.com/sign-up) — though an account is never required to run.
