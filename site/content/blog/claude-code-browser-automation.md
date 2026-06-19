---
title: Browser Automation in Claude Code With a Plain-English CLI
description: "Claude Code browser automation without an MCP server: wire BrowserBash in as a shell tool, write plain-English objectives, and get a verdict back."
date: 2026-01-16
category: agents
---

Claude Code writes code fast, but it cannot see the running app. It edits your React components, declares the checkout flow fixed, and hands you the verification bill. The cleanest way to close that gap is Claude Code browser automation that the agent can call like any other shell command: you describe what you want in plain English, an AI agent drives a real Chrome to do it, and a structured result comes back that Claude Code can branch on. No MCP server to register, no `mcp_servers` JSON to babysit, no selectors. This guide shows you how to wire [BrowserBash](https://www.npmjs.com/package/browserbash-cli) into Claude Code as a plain shell tool and use it for verification, data extraction, and end-to-end flows.

If you have already tried the Playwright MCP route and bounced off the config overhead, this is the other path. It trades a long-lived server process for a one-line command Claude Code already knows how to run.

## Why Claude Code needs a browser at all

Coding agents are blind in one very specific way. They are excellent at text — source files, diffs, stack traces, logs. They cannot perceive the running application. The hydrated DOM, the toast that says "saved," the redirect that lands on `/dashboard` instead of bouncing back to `/login` — none of that is in the diff. It only exists when a browser renders the code.

So when you ask Claude Code "does the login work now?", it has three bad options. It can declare victory blind and trust that the code looks right (this is how a missing `await` ships with a confident "Fixed ✅"). It can run the unit tests and call that coverage, even though unit tests happily pass on code that renders a blank white screen. Or it can scrape a test runner's console and infer success from English prose, which breaks the first time the log format changes.

None of those is verification. They are approximations that feel like proof until the demo. The honest fix is to give the agent a tool it can actually call: one that opens a real browser, performs the flow the way a user would, and returns a result the agent can act on without reading sentences. That is what Claude Code browser automation is for, and it is why a CLI — something Claude Code already invokes constantly through its Bash tool — is such a natural fit.

## The two ways to give Claude Code a browser

Today there are two broad patterns for browser control inside Claude Code, and they are not mutually exclusive.

**The MCP route.** Microsoft's [Playwright MCP](https://playwright.dev/docs/getting-started-mcp) exposes browser primitives over the Model Context Protocol. You register a server, Claude Code discovers its tools, and the agent calls `browser_navigate`, `browser_click`, and friends. It is well built and DOM-aware. The cost is setup and context: you maintain a server entry in your MCP config, and structured snapshots can eat into the context window on long sessions. Microsoft also shipped a Playwright CLI in early 2026 specifically to cut token usage by writing compact YAML snapshots to disk instead of streaming full accessibility trees, which tells you the context cost was real enough to engineer around.

**The shell-tool route.** Claude Code can run any command through its Bash tool. So instead of registering a protocol server, you give it a CLI that takes a plain-English objective and drives the browser end to end. The agent does not orchestrate twenty low-level clicks — it issues one high-intent command and reads the verdict. This is the path BrowserBash is built for, and it is the focus of the rest of this guide.

Here is the trade-off in one table.

| Dimension | Playwright MCP | BrowserBash as a shell tool |
| --- | --- | --- |
| Setup in Claude Code | Register an MCP server in config | None — it is already on your `PATH` |
| What the agent sends | Many low-level tool calls (click, type, snapshot) | One plain-English objective |
| Selectors / page objects | You still reason about the DOM | None — describe the goal |
| Context cost | Snapshots can be large; CLI variant mitigates | One command in, one structured result out |
| Output the agent reads | Tool results / accessibility tree | NDJSON or a verdict + extracted values |
| Real browser | Yes (Chromium) | Yes (your local Chrome via the local provider) |
| Model needed | Your Claude Code model | Configurable, including free local Ollama models |
| License | Apache-2.0 (MCP) / Apache-2.0 (CLI) | Apache-2.0 |

Neither is strictly better. If you want fine-grained, step-by-step browser control inside a single agent loop and you are comfortable maintaining a server, Playwright MCP is a strong choice and the better fit for tight per-action control. If you want Claude Code to delegate a whole flow — "log in, add two items to the cart, verify the total" — and get a clean pass/fail back, the shell-tool pattern is less to manage and less to think about.

## What BrowserBash is

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it once, write a plain-English objective, and an AI agent drives a real Chrome or Chromium step by step. No selectors, no page objects. At the end you get a verdict plus structured extracted values.

```bash
npm install -g browserbash-cli
browserbash run "go to news.ycombinator.com and tell me the title of the top story"
```

That is the whole surface for a first run. It requires Node 18+ and Chrome for the default local provider, and the latest version is 1.3.1. There is no account and no signup required to run it — you can install and execute against your own machine immediately. Full setup notes live in the [tutorials](https://browserbash.com/tutorials) and the [feature list](https://browserbash.com/features) breaks down what each command does.

The two pieces that matter for Claude Code are the **engine** (who interprets your English) and the **provider** (where the browser runs). By default the engine is Stagehand — the MIT-licensed library from Browserbase that gives the agent act / extract / observe / agent primitives and self-healing behavior — and the provider is `local`, meaning it drives the Chrome already on your laptop. You can switch the engine to `builtin`, an in-repo Anthropic tool-use loop driving Playwright, with `--engine builtin`. That builtin engine is also what kicks in automatically for the LambdaTest and BrowserStack providers.

## The model story: free local models first

This is the part that surprises people. BrowserBash is Ollama-first. The default model is `auto`, and it resolves in this order:

1. A local **Ollama** install, used as `ollama/<model>` — free, no API keys, and nothing leaves your machine.
2. An `ANTHROPIC_API_KEY` in your environment, which resolves to `claude-opus-4-8`.
3. An `OPENAI_API_KEY`, which resolves to `openai/gpt-4.1`.
4. Otherwise, a clear error telling you how to fix it.

Because Claude Code users almost always already have an `ANTHROPIC_API_KEY` set, BrowserBash will quietly use Claude for its own reasoning if no local model is present. But if you have Ollama running, you get a guaranteed $0 model bill for the browser-driving work — Claude Code reasons about your code, and a local model reasons about the browser, and neither sends your pages to a third party.

One honest caveat, because it will bite you otherwise. Very small local models (roughly 8B parameters and under) are flaky on long, multi-step objectives. They lose the thread, repeat actions, or give up halfway. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. For a three-step verification ("log in, open settings, confirm the email field shows the saved address") a small model is often fine. For a fifteen-step checkout across a flaky third-party payment iframe, reach for the bigger model. You can pin any backend explicitly:

```bash
# free local mid-size model
browserbash run "log in as test@acme.dev and confirm the dashboard loads" --model ollama/qwen3

# capable hosted model for a hard multi-step flow
browserbash run "complete checkout with the test card and read back the order number" --model claude-opus-4-8

# a 70B-class model via OpenRouter
browserbash run "filter products under $50 and count the results" --model openrouter/meta-llama/llama-3.3-70b-instruct
```

There is more on model selection and pricing trade-offs on the [pricing page](https://browserbash.com/pricing), which is worth a read before you wire this into CI where token costs add up.

## Wiring BrowserBash into Claude Code as a shell tool

The whole pitch is that there is nothing to register. Claude Code already has a Bash tool; `browserbash` is just a command on your `PATH` after the global install. There are three practical levels of integration, from least to most structured.

### Level 1: let Claude Code call it ad hoc

Once `browserbash-cli` is installed globally, you can simply tell Claude Code to use it:

> Use `browserbash run` to open http://localhost:3000/login, sign in with test@acme.dev / hunter2, and confirm the dashboard renders. Report pass or fail.

Claude Code will construct the command, run it through Bash, and read the result. For one-off verification during a coding session, this is often all you need. The agent gets a real browser without you touching any config file.

### Level 2: give it agent-mode output it can parse

For anything repeatable, you do not want Claude Code parsing English. Pass `--agent` and BrowserBash emits NDJSON — one JSON object per line. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the terminal line is a `run_end` object with a `status` of `passed`, `failed`, `error`, or `timeout`, a `summary`, a `final_state` object holding extracted values, and a `duration_ms`. Exit codes map cleanly: `0` passed, `1` failed, `2` error, `3` timeout.

```bash
browserbash run "log in and verify the account balance is visible" --agent
```

That exit code is the important part. Claude Code can run the command, check whether it exited `0`, and decide whether to keep going or report a failure — no prose parsing, no brittle string matching on log output. This is the contract that makes the shell-tool pattern reliable inside an autonomous loop. The same NDJSON stream is what makes BrowserBash equally at home in [Jenkins or GitHub Actions](https://browserbash.com/learn) as it is inside Claude Code.

### Level 3: commit the test as a Markdown file

The most durable integration is to stop writing objectives inline and commit them. BrowserBash reads Markdown test files (`*_test.md`) where each list item is a step. They support `{{variables}}` templating, `@import` composition so you can reuse a login block across flows, and secret-marked variables that get masked as `*****` in every log line. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./login_test.md
```

Now Claude Code's job changes shape. Instead of inventing a flow every time, it edits a committed test file, runs it, and reads the result. The test lives in version control next to the code it verifies, your teammates can read it without knowing Playwright, and the agent has a stable artifact to maintain. When Claude Code adds a feature, you can ask it to add a step to the relevant `_test.md`, run it, and confirm green before opening a pull request.

## A realistic Claude Code session

Here is how this plays out in practice. Suppose you ask Claude Code to fix a bug where the "Remember me" checkbox does not persist sessions. The agent reads the auth code, edits the cookie max-age, and would normally stop there with a hopeful comment. With BrowserBash available, you can instead instruct it to prove the fix:

```bash
browserbash run "go to http://localhost:3000/login, sign in as test@acme.dev with password hunter2, check 'Remember me', and confirm you land on /dashboard" --agent --record
```

The `--record` flag captures a screenshot and a `.webm` session video using bundled ffmpeg; on the builtin engine it also writes a Playwright trace. So when the run comes back `passed`, Claude Code can tell you it verified the flow *and* point you at a video to watch. When it comes back `failed`, you and the agent both have an artifact showing exactly where the browser went sideways — a far better signal than "the code looks right."

Every run is also kept on disk at `~/.browserbash/runs` with secrets masked, capped at the most recent 200. That means after a long Claude Code session you can review what the agent actually did in the browser, not just what it claimed. If you want a visual view of those runs, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — no account, nothing uploaded.

## Local-first, with an opt-in cloud

Privacy is the quiet advantage of this setup, and it matters more than it sounds. With the local provider and a local Ollama model, nothing about your application leaves your machine — not the pages, not the credentials, not the screenshots. Claude Code reasons over your code, BrowserBash drives your browser, and the whole loop is local. For anyone testing an internal tool or a pre-release feature behind auth, that is the difference between "I can use this" and "legal said no."

There is an optional cloud layer, and it is strictly opt-in. You link it once with `browserbash connect --key bb_...`, and then it only does anything on a run where you explicitly pass `--upload`. Without that flag, nothing leaves your machine — that is worth stating plainly because it is the opposite of how most "cloud-first" tools default. Free cloud runs are retained for 15 days. If you never run `connect`, that machinery simply does not exist for you. You can read more about the hosted side and grab a free key on the [sign-up page](https://browserbash.com/sign-up), but it is genuinely optional.

## Choosing your provider and engine for Claude Code

The default `local` provider is right for almost all Claude Code work, because the whole point is to verify the app you are actively building on `localhost`. But the other providers exist for real reasons, and they all take the same plain-English objective:

- **`local`** (default) drives your own Chrome. Fastest feedback loop, fully private, ideal for the inner dev loop with Claude Code.
- **`cdp`** connects to any Chrome DevTools Protocol endpoint via `--cdp-endpoint ws://...`. Useful when you already have a browser running somewhere — a container, a remote debugging session — and want BrowserBash to attach to it.
- **`browserbase`** runs the browser in Browserbase's cloud (needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`).
- **`lambdatest`** and **`browserstack`** run on those grids for cross-browser coverage, and both automatically switch to the builtin engine.

For engines, stick with the default Stagehand for most Claude Code verification — its self-healing behavior means a small UI change rarely breaks a test, which matters when an agent is editing the UI between runs. Switch to `--engine builtin` when you specifically want the Anthropic tool-use loop and a Playwright trace, or when you are on a grid provider that requires it.

```bash
# attach to an already-running Chrome via CDP
browserbash run "verify the search box returns results for 'laptop'" \
  --provider cdp --cdp-endpoint ws://127.0.0.1:9222/devtools/browser/abc
```

## When this is the right tool — and when it is not

Be honest with yourself about the job before you reach for any tool.

**Use BrowserBash as a Claude Code shell tool when** you want the agent to verify a real user flow and report a clean pass/fail; when you want to delegate a whole multi-step flow rather than orchestrate individual clicks; when privacy or a $0 model bill matters and you can run a local model; or when you want committed, human-readable Markdown tests that a non-Playwright teammate can read. It shines as the "prove it works" step at the end of a Claude Code change.

**Reach for Playwright MCP instead when** you need the agent to perform fine-grained, per-action browser control inside one continuous loop — inspecting the DOM between every click, making decisions mid-flow based on individual element state. That tight coupling is exactly what MCP's low-level primitives are built for, and it is a better fit than a one-shot objective when the logic genuinely needs to live inside the agent step by step.

**Reach for hand-written Playwright or Selenium when** you need deterministic, pixel-exact assertions that must behave identically on every run forever, or when you are validating precise computed values and cannot tolerate any model variability. An AI agent interpreting "confirm the total looks right" is more flexible but less exact than `expect(total).toBe('$49.99')`. For some test suites that exactness is non-negotiable, and that is fine — the tools coexist. BrowserBash even publishes a [case study](https://browserbash.com/case-study) showing where the natural-language approach pays off and where it does not.

A reasonable team uses all three: deterministic Playwright for the critical-path regression suite, Playwright MCP when an agent needs surgical browser control, and BrowserBash as the fast plain-English verifier Claude Code calls during the inner loop.

## Practical tips for a smooth setup

A few things will save you time once you start wiring this in.

**Set your model before CI matters.** On your laptop, `auto` resolving to your `ANTHROPIC_API_KEY` is convenient. In CI, be explicit with `--model` so you know exactly what you are paying for and which model is interpreting the flow. Surprise token bills come from leaving things implicit.

**Use `--timeout` on flaky flows.** Long objectives against slow staging environments can hang. The `--timeout <seconds>` flag bounds a run and gives you a clean `timeout` status (exit code `3`) that Claude Code can handle, instead of a stuck process.

**Start headed, then go headless.** While you are building a flow, watch the browser. Once it is stable, add `--headless` so it runs quietly in the background and in CI. Seeing the agent click through the page the first few times builds the trust you need to let it run unattended later.

**Keep objectives specific.** "Test the login" is vague; the agent has to guess. "Go to /login, sign in as test@acme.dev with password hunter2, and confirm you land on /dashboard" gives the agent — and any model driving it — a concrete target. Specific objectives are also where small local models stop failing.

**Let Claude Code own the Markdown tests.** Once you have a `_test.md` committed, your prompts to Claude Code get shorter: "add a step that checks the welcome email field" instead of re-describing the whole flow. The agent edits the file, runs it, reads `Result.md`, and you review a real artifact.

## FAQ

### How do I add browser automation to Claude Code without an MCP server?

Install BrowserBash globally with `npm install -g browserbash-cli` and it becomes a command on your `PATH` that Claude Code can run through its built-in Bash tool. There is no MCP server to register and no config file to maintain. You tell Claude Code to call `browserbash run` with a plain-English objective, and it gets a real browser plus a structured result back.

### Does Claude Code browser automation with BrowserBash need API keys?

Not necessarily. If you have Ollama installed, BrowserBash uses a free local model by default and nothing leaves your machine, so there are no keys and no model bill. If you do not have Ollama, it falls back to your existing `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. You also never need a BrowserBash account to run it locally.

### How does Claude Code read the result of a browserbash run?

Pass the `--agent` flag and BrowserBash emits NDJSON — one JSON object per line — ending in a `run_end` event with a clear status of passed, failed, error, or timeout. Exit codes match: 0 for passed, 1 failed, 2 error, 3 timeout. Claude Code checks the exit code or parses the final JSON line instead of reading English prose, which keeps the integration reliable.

### Is BrowserBash a replacement for Playwright MCP in Claude Code?

No, they solve different problems and can coexist. Playwright MCP gives the agent fine-grained, per-action control over the browser inside one loop, which is better when the logic must inspect the DOM between every click. BrowserBash is better when you want Claude Code to delegate a whole flow as a single plain-English objective and get a pass/fail verdict back with no server to manage.

Browser automation in Claude Code does not have to mean a server process and a config file. Install it, point Claude Code at it, and let the agent prove its own work in a real browser.

```bash
npm install -g browserbash-cli
```

Grab an optional free key and explore the docs at [browserbash.com/sign-up](https://browserbash.com/sign-up) — though you can start driving a browser from Claude Code today without an account.
