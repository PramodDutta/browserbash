---
title: Playwright MCP vs BrowserBash: Two Ways to Give AI a Browser
description: "Playwright MCP vs BrowserBash compared: MCP server tool calls vs a plain-English CLI with NDJSON and exit codes for AI agents."
date: 2026-06-13
category: comparison
---

If you are wiring an AI agent to a real browser in 2026, two names come up fast. Playwright MCP exposes browser actions to a model as a set of tools over the Model Context Protocol; BrowserBash hands the model a plain-English objective and returns a verdict you can gate a pipeline on. This Playwright MCP vs BrowserBash comparison is not about which project is "better" in the abstract — they solve overlapping problems from opposite ends. One gives your agent fine-grained primitives and lets it compose the run turn by turn. The other gives your agent a single function call with a stable contract. The right pick depends on who is driving, where the run executes, and how you find out whether it worked.

I'll keep the framing honest. Both tools are good at what they were built for, and most of the contrasts below are about shape and ergonomics, not capability gaps. Where I make a claim about Playwright MCP, it sticks to well-known, publicly documented behavior; where I make a claim about BrowserBash, it is something you can run yourself today.

## What "give AI a browser" actually means

There is a hidden fork in that phrase. "Give AI a browser" can mean two genuinely different architectures.

The first is **tools for an interactive model**. The agent — Claude, a Cursor or VS Code assistant, a custom loop — stays in charge. It decides to navigate, reads back the page, decides to click, reads again, and narrates the whole thing in its own context window. The browser is a set of capabilities the model reaches for, one action at a time, inside an ongoing conversation. This is the MCP model: a server advertises tools like `browser_navigate`, `browser_click`, `browser_snapshot`, and the host LLM calls them.

The second is **a browser run as a single function call**. You hand over one objective — "log in and confirm the dashboard loads" — and get back a structured result: passed or failed, what happened at each step, any values you asked it to extract. The orchestration happens inside the tool; your caller sees a verdict, not a transcript of clicks. This is the CLI model, and it is where BrowserBash lives. You can still call it from an AI agent — `browserbash run "..." --agent` is built precisely for that — but the agent consumes a result, it does not micromanage the browser.

Neither shape is universally correct. An interactive coding assistant exploring a flaky page benefits enormously from turn-by-turn control. A CI pipeline, or a coding agent that just needs to know "did my fix work," benefits from a one-shot call with an exit code. Hold that fork in your head; everything else follows from it.

## Playwright MCP in one paragraph

Playwright MCP is a Model Context Protocol server, maintained by the Playwright team, that exposes browser automation as MCP tools backed by Playwright's engine. An MCP-capable host — Claude Desktop, Claude Code, Cursor, VS Code, and a growing list of others — connects to it and the model gains a toolbox: navigate to a URL, click an element, type into a field, take an accessibility snapshot of the page, and so on. A notable design choice is that it leans on the accessibility tree rather than pixels, so the model reasons over structured page state instead of screenshots, which is fast and token-efficient. It inherits Playwright's mature cross-browser support and runs wherever you can run Node and a browser. If your workflow is "I am in an AI IDE and I want my assistant to poke at a web app while we work," Playwright MCP is a natural fit.

## BrowserBash in one paragraph

BrowserBash is a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) command-line tool for natural-language browser automation. You write an objective in plain English; an AI agent drives a real Chrome or Chromium browser and returns a verdict plus structured results — no selectors, no page objects. It ships two engines: `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin` (an in-repo Anthropic tool-use loop). It is model-flexible and Ollama-first, so it runs against free local models with no API keys, and also speaks OpenRouter (including free models) and Anthropic Claude if you bring a key. Crucially for agents and CI, `--agent` mode emits NDJSON with a stable schema and maps the verdict onto process exit codes. You install it with `npm install -g browserbash-cli` and you can read the full command reference on the [BrowserBash learn pages](https://browserbash.com/learn).

## The core architectural difference

Here is the distinction that drives every practical tradeoff: **where does the agent loop live?**

With Playwright MCP, the loop lives in the host LLM. Your model is the orchestrator. It calls `browser_snapshot`, the page state comes back into its context, it reasons, it calls `browser_click`, and around it goes. That is powerful and transparent — the model sees everything — but it also means the browser session is only as good as the model driving it, and every page snapshot consumes context window. You need an MCP host to use it at all; it is fundamentally a component inside an agentic conversation.

With BrowserBash, the loop lives inside the CLI. You (or your CI job, or your coding agent) issue one command. Internally, the chosen engine runs its own plan-act-observe cycle against the browser until the objective is met or a guardrail trips. Your caller is not in that loop — it waits for the process to exit and reads the result. That makes BrowserBash usable with no MCP host at all: it is a binary you run from a shell, a Makefile, a GitHub Actions step, or a `subprocess.run()`. And because the loop is encapsulated, the contract you depend on is small and stable — NDJSON lines and an exit code — rather than a free-form conversation you have to interpret.

This is why the two can coexist rather than compete. In fact, BrowserBash can attach to a browser that something else launched, including a browser already under Playwright MCP's control, by pointing at its DevTools endpoint:

```bash
browserbash run "Confirm the cart shows 2 items and the subtotal is not zero" \
  --provider cdp \
  --cdp-endpoint ws://localhost:9222/devtools/browser/<id> \
  --agent
```

That command runs BrowserBash's agent against an existing Chrome DevTools Protocol endpoint instead of launching its own browser — a clean way to let an interactive MCP session set up state and then fire a one-shot, exit-code-gated assertion over it.

## A side-by-side run

The clearest way to feel the difference is to look at what you, the human or the calling system, actually write.

With an MCP-driven assistant, you prompt the model in natural language and *it* emits a sequence of tool calls — `browser_navigate`, then `browser_snapshot`, then `browser_click`, then another snapshot to confirm. You see those calls scroll by in your IDE. There is no single artifact you "ran"; there is a conversation that produced browser actions. Great for working alongside the agent, less great for putting in a cron job.

With BrowserBash, the same intent is one line, and it is the same line whether a human or a machine runs it:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as {{username}} with password {{password}}, and verify the page says 'You logged into a secure area'" \
  --headless \
  --variables '{"username":"tomsmith","password":{"value":"SuperSecretPassword!","secret":true}}'
```

That is runnable exactly as printed — the demo credentials are published on the login page itself. The `verify` clause is the assertion: if the text is missing, the run fails with a non-zero exit code. The password is marked `"secret": true`, so it shows as `*****` in every log line. There is one command, one verdict, one place to check what happened.

And when the caller is an AI coding agent rather than a person, you add `--agent` and read the machine stream instead of prose:

```bash
out=$(browserbash run "Open $URL and store the page title as 'title'" --agent --headless)
code=$?
title=$(echo "$out" | tail -1 | jq -r '.final_state.title')
```

Every stdout line is one JSON object; the last line is always a `run_end` event carrying `status`, a `summary`, and any values you asked it to `store ... as 'name'`. The exit code mirrors the verdict — `0` passed, `1` failed, `2` error, `3` timeout — so a supervising agent never has to guess success from English. This NDJSON-plus-exit-code contract is covered in depth across the [BrowserBash blog](https://browserbash.com/blog).

## Feature comparison

The table below sticks to well-known, publicly documented behavior for Playwright MCP and to verifiable behavior for BrowserBash. It is a comparison of design choices, not a scoreboard.

| Dimension | Playwright MCP | BrowserBash |
| --- | --- | --- |
| Primary interface | MCP server exposing browser tools to an LLM host | CLI: `browserbash run "objective"` |
| Who runs the loop | The host model, action by action | The CLI engine, internally |
| Needs an MCP host? | Yes — Claude Desktop/Code, Cursor, VS Code, etc. | No — runs from any shell, CI step, or subprocess |
| How you express intent | Natural-language prompt to the model, which emits tool calls | One plain-English objective string; no selectors |
| Underlying engine | Playwright | `stagehand` (default, MIT) or `builtin` (Anthropic tool loop) |
| Page understanding | Accessibility-tree snapshots | Engine-driven (Stagehand's self-healing model) |
| Machine-readable output | MCP tool results inside the conversation | NDJSON stream with a stable schema (`--agent`) |
| Pass/fail signal | The model interprets results | Process exit codes: 0 / 1 / 2 / 3 |
| Model / LLM | Provided by the MCP host | Ollama-first (free, local), OpenRouter (incl. free), or Claude |
| Where the browser runs | Local (and remote per your setup) | local, cdp, browserbase, lambdatest, browserstack via `--provider` |
| Committable test format | Not its focus | `*_test.md` files via `testmd run`, with `@import` and `{{variables}}` |
| Recordings | Via Playwright tooling | `--record` for screenshot + `.webm` video on any engine; trace on `builtin` |
| License | Open source (Apache-2.0) | Open source (Apache-2.0) |

A few honest notes on that table. Playwright MCP's accessibility-tree approach is genuinely elegant and fast, and Playwright's cross-browser maturity is a real, hard-won asset. BrowserBash's distinctiveness is not that it does something Playwright cannot — it is that it packages a browser run as a self-contained, gateable unit with a small contract, free local models, and a committable Markdown test format. Different shape, different job.

## The CI and "agent verifies its own work" story

This is where the architectural difference stops being philosophical. Consider an AI coding agent that just opened a pull request and needs to know whether its frontend change still renders the login form.

If the agent's only browser access is an interactive MCP session, "did it work" is an inference the agent makes by reading snapshots — useful while pairing, awkward to encode as a hard gate. There is no single boolean to branch a pipeline on.

With BrowserBash, the same check is a function call with a contract:

```bash
out=$(browserbash run "Open {{base_url}}/login, log in as {{username}} with password {{password}}, and store the logged-in user name as 'user_name'" \
  --agent --headless --timeout 120 \
  --variables '{"base_url":"https://staging.example.com","username":"qa@example.com","password":{"value":"hunter2","secret":true}}')
code=$?

case $code in
  0) echo "PASS — attach run_end to the PR" ;;
  1) echo "FAIL — the app is broken, investigate the diff" ;;
  2) echo "ERROR — infra/agent problem, retry once" ;;
  3) echo "TIMEOUT — raise --timeout or split the objective" ;;
esac
```

The agent never parses prose. Exit `1` means a real assertion failed; exit `2` means the tooling or infrastructure failed and a retry is reasonable; exit `3` means raise the timeout or break the objective into smaller runs. That separation — app failure versus tooling failure, as distinct codes — is exactly what makes the integration robust enough to gate merges.

## Cross-browser cloud, with one flag

There is also a deployment dimension. Playwright MCP runs where you run it. BrowserBash treats *where the browser executes* as a swappable provider. By default it drives your local Chrome, but the same objective can run on a cloud grid by changing a single flag:

```bash
browserbash run "Open the pricing page and verify the Enterprise plan card is visible" \
  --provider lambdatest \
  --headless
```

Swap `lambdatest` for `browserstack` or `browserbase` without touching the objective, or point `--provider cdp` at any DevTools endpoint to attach to a browser you already manage. The objective is portable; only the execution target changes. Nothing leaves your machine unless you opt in — pass `--upload` to push a run to the cloud dashboard, or run the free local dashboard with `browserbash dashboard` to replay runs privately.

## When to choose which

Be guided by who is driving and what you need out the other end.

**Choose Playwright MCP when** an interactive AI assistant is the primary user — you are inside Cursor, VS Code, Claude Code, or Claude Desktop and you want the model to explore, click, and read pages turn by turn as part of a working session. Pick it when you value the model seeing every intermediate page state in its own context, when accessibility-tree snapshots and Playwright's cross-browser breadth matter to you, and when the host MCP environment is already where your work happens. It shines as a capability inside an agentic conversation.

**Choose BrowserBash when** you want a browser run to be a self-contained unit with a hard verdict — a CI gate, a smoke test, a coding agent confirming its own fix without you babysitting snapshots. Pick it when you need NDJSON plus exit codes rather than prose to interpret, when you want free local models via Ollama and no API keys, when committable `*_test.md` files that a product manager can read in review are valuable, or when you need to flip the same objective onto a cloud grid with one flag. It shines as a function you call and trust the result of.

And note that "either/or" is a false choice. A realistic setup uses an MCP assistant to develop and debug a flow interactively, then encodes the stable version as a BrowserBash objective or a Markdown test so CI can run it on every push. BrowserBash's `--provider cdp` even lets it assert over a browser the MCP session left running. Different tools, same browser, complementary jobs.

## A committable test, since CLIs invite version control

One thing a CLI unlocks that a conversational tool does not naturally is a test file you can commit and diff. BrowserBash turns the same plain-English steps into a Markdown document where each list item is a step:

```markdown
# Login smoke test

- Open {{base_url}}/login
- Log in as {{username}} with password {{password}}
- Verify the page shows "You logged into a secure area"
```

Run it with `browserbash testmd run ./login_test.md --headless`, and a `Result.md` report lands next to the file. Shared steps compose with `@import`, secrets in `{{variables}}` mask to `*****`, and the whole thing lives in your repo next to the code it verifies. You can grab the CLI from [npm](https://www.npmjs.com/package/browserbash-cli) and have a committable test running in a couple of minutes. This is a different surface area than an interactive MCP server aims at — and a good example of how the CLI shape leads naturally to version-controlled, reviewable tests.

## The honest summary

Playwright MCP and BrowserBash are not really fighting over the same square foot. Playwright MCP gives an interactive model fine-grained browser tools over MCP, with the agent loop in the host and the model seeing every page state — ideal for working alongside an AI assistant. BrowserBash packages a browser run as one plain-English call with a small, stable contract — NDJSON, exit codes, committable Markdown tests, free local models, and a one-flag jump to cloud grids — ideal for CI and for agents that need a verdict rather than a transcript. Pick by whether your primary user is an interactive model or a pipeline, and remember you can use both: explore with one, gate with the other.

## FAQ

### Is Playwright MCP a replacement for BrowserBash, or vice versa?

Neither replaces the other; they target different shapes of the same problem. Playwright MCP exposes browser tools to an interactive model inside an MCP host, which is great for exploratory, turn-by-turn work. BrowserBash wraps a whole run into one CLI call with NDJSON output and exit-code verdicts, which is great for CI and for agents that need a clean pass/fail. Many teams use an MCP assistant to develop a flow and BrowserBash to gate it.

### Can BrowserBash run without an AI coding assistant or MCP host?

Yes. BrowserBash is a standalone CLI you install with `npm install -g browserbash-cli` and run from any shell, Makefile, CI step, or subprocess — no MCP host required. It runs Ollama-first with free local models and no API keys, and you can also point it at OpenRouter or Anthropic Claude. The plain-English objective and the result contract are the entire interface.

### How does BrowserBash report success or failure to a pipeline?

Through process exit codes and NDJSON. With `--agent`, stdout is one JSON object per line and the final `run_end` line carries the status and any extracted values, while the exit code mirrors the verdict: 0 passed, 1 failed, 2 error, 3 timeout. A pipeline or supervising agent branches on the exit code and never has to parse human-readable prose.

### Can BrowserBash and Playwright MCP share the same browser?

Yes, through the Chrome DevTools Protocol. If a Playwright MCP session — or any tool — leaves a browser running on a DevTools endpoint, you can point BrowserBash at it with `--provider cdp --cdp-endpoint ws://localhost:9222/devtools/browser/<id>` and run a one-shot, exit-code-gated assertion over that existing session. It is a clean way to set up state interactively and then verify it deterministically.

---

BrowserBash is free and open source, and the fastest way to see the difference is to run an objective yourself. [Create a free account](https://browserbash.com/sign-up) to push runs to the cloud dashboard with `--upload`, or stay entirely local — nothing leaves your machine unless you ask it to.
