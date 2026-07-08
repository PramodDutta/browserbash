---
title: Set Up the BrowserBash MCP Server in Claude Code
description: "Set up the BrowserBash MCP server in Claude Code with one command, then have Claude validate its own UI changes in a real browser."
date: 2026-07-09
category: tutorial
---

If you use Claude Code to build web apps, you have almost certainly hit this moment: Claude finishes a change, says it works, and you have no way to know that for sure until you open the browser yourself. The BrowserBash MCP server closes that gap. This guide walks through installing browserbash mcp inside Claude Code with a single `claude mcp add` command, explains exactly what the three exposed tools do, and then runs a real worked example where Claude Code makes a UI change and verifies it in an actual browser instead of asking you to trust the diff.

This is not a theoretical integration. BrowserBash is a free, open-source (Apache-2.0) CLI that drives a real Chrome or Chromium browser from plain-English instructions, no selectors, no page objects, and returns a deterministic verdict. When you wire it into Claude Code over the Model Context Protocol, you stop being the QA layer between "Claude says it's done" and "it's actually done." Claude becomes able to check its own work.

## Why Claude Code needs a browser validation layer

Claude Code is extremely good at editing files. It reads a bug report, opens the right components, makes a targeted change, and reasons clearly about why the fix should work. What it cannot do on its own is *watch the page render*. A CSS regression, a broken client-side redirect, a form that silently fails to submit because of a typo in an event handler, none of that shows up in a diff review. It only shows up when something opens a browser, performs the interaction a real user would perform, and checks the result.

Before MCP tools like this existed, the workaround was manual: Claude makes the change, you tab over to the browser, click through the flow yourself, and report back "still broken" or "looks good." That loop works, but it puts a human in the middle of every verification cycle, which defeats a lot of the point of having an agent that can work autonomously on a ticket end to end.

The BrowserBash MCP server removes the human from that loop when you want it removed. Claude Code can call a tool, get back a structured JSON verdict (status, summary, final state, assertions, cost, duration), and decide for itself whether to keep iterating or report the task done. That is the core shift MCP tools like this one enable: an agent needs a tool it can call and a verdict it can read, not a terminal it has to parse prose from.

## What the browserbash mcp server actually exposes

Running `browserbash mcp` starts the CLI in MCP server mode, communicating over stdio, the same transport Claude Code and most MCP hosts expect for locally-installed servers. It is not a separate product from the CLI you already use for `browserbash run` or `browserbash testmd run`, it is the same binary, wearing an MCP hat. Under the hood, the exact same engine and provider routing that powers ordinary CLI runs powers the MCP tool calls, so anything you already know about BrowserBash's model resolution (local Ollama first, then Anthropic, then OpenAI, then OpenRouter) and provider options (local Chrome, CDP, Browserbase, LambdaTest, BrowserStack) carries straight through.

Once connected, the server exposes three tools to the calling agent:

- **`run_objective`** takes a single plain-English objective, the same string you'd hand to `browserbash run "..."` on the command line, and executes it against a real browser. Use this for one-off checks: "go to localhost:3000, click the pricing tab, and verify the Enterprise plan is visible."
- **`run_test_file`** points at an existing `*_test.md` file and runs it exactly as `browserbash testmd run` would, including `@import` composition, `{{variables}}` substitution, and deterministic Verify assertions if the file uses them. This is the tool to reach for once you've got a committed regression test you want Claude re-running after every change.
- **`run_suite`** runs an entire folder of test files in parallel, mirroring `browserbash run-all`. Good for "did my change break anything else" checks across a whole `.browserbash/tests/` directory.

Every one of these tools returns the same structured verdict shape you'd get from `--agent` NDJSON on the CLI: a `status` (passed or failed), a human-readable `summary`, the `final_state` the browser ended up in, an `assertions` array when Verify steps ran, a `cost_usd` estimate, and `duration_ms`. That structure matters more than it sounds. A failed test is not an error from BrowserBash's perspective, it's a successful validation that correctly found a problem. The MCP tool call succeeds either way; Claude reads the `status` field and decides what to do next, the same way it would read a build failure and go fix the code.

## Installing browserbash mcp in Claude Code

The install is a single command, assuming you already have BrowserBash on your machine:

```bash
npm install -g browserbash-cli
```

With that in place, register the MCP server with Claude Code and confirm it registered correctly:

```bash
claude mcp add browserbash -- browserbash mcp
claude mcp list
```

The first command tells Claude Code: whenever you need the `browserbash` MCP server, spawn `browserbash mcp` as a subprocess and talk to it over stdio. There's no port to configure, no separate daemon to keep running, no auth token to generate for local use. Claude Code manages the subprocess lifecycle itself, starting it when the session needs a browser tool and tearing it down when the session ends. The second command lists everything registered; you should see `browserbash` with a connected status. If you start a new Claude Code session and ask it something like "what MCP tools do you have available," it should now mention `run_objective`, `run_test_file`, and `run_suite` alongside whatever else is configured.

### A note on model configuration before you run anything

Because `browserbash mcp` shares the CLI's model resolution logic, the objectives Claude Code sends through it still need a model to actually drive the browser. If you have Ollama running locally with a reasonably capable model pulled (something in the 70B class, or a strong mid-size model like a recent Qwen3 build), BrowserBash will use that by default and the entire loop, Claude Code planning plus BrowserBash executing, costs nothing beyond your own compute. If you'd rather point BrowserBash at a hosted model for reliability on harder flows, set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the environment Claude Code launches from, or configure OpenRouter. Worth saying plainly: very small local models, roughly 8B parameters and under, tend to get flaky on multi-step objectives that involve several clicks and navigations in sequence. If you see BrowserBash losing the thread partway through a flow, that's usually the first thing to check, not a bug in the integration.

### Same setup, other hosts

The same registration pattern works for other MCP-capable hosts. Cursor, Windsurf, Codex, and Zed all accept a similar "run this binary over stdio" server definition, the command is always some variation of pointing the host's MCP config at `browserbash mcp`. If you're standardizing a team on multiple agent tools, you only need to learn this pattern once. BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, which some hosts can use for discovery instead of a manual config entry.

## A worked example: Claude Code fixes a bug and checks its own fix

Here's where this stops being abstract. Say you're working in a small Next.js app and you've got a bug: the "Add to cart" button on a product page doesn't update the cart count badge in the header after a successful add. You tell Claude Code:

> "Fix the cart badge not updating when a product is added. Then verify the fix works by adding the classic-tee product to the cart and confirming the badge shows the new count."

Claude Code does what it normally does first: it reads the relevant components, finds that the badge is reading from a stale context value instead of subscribing to the cart state update, and patches the state subscription. That part of the loop hasn't changed. What's different is the next step. Instead of telling you "this should fix it" and stopping, Claude Code (having the `browserbash` MCP tools available) calls `run_objective` with something like:

```
Go to localhost:3000/products/classic-tee, click "Add to cart", and verify the cart badge in the header shows "1"
```

BrowserBash spins up a real Chrome, navigates to the running dev server, finds the "Add to cart" button by reading the actual rendered page (no selector Claude had to write or guess), clicks it, and checks the header badge. Two outcomes are possible here, and both are useful.

**If the fix worked**, the tool returns a `passed` status with a summary describing what happened: the badge went from showing nothing (or a stale "0") to showing "1" after the click. Claude Code reads that structured result and can now tell you, honestly, that the fix is verified, not just written. That's a materially different claim than "I edited the file and it looks right to me."

**If the fix didn't fully work**, say the badge still shows the old value because there was a second stale reference somewhere else in the codebase, BrowserBash returns a `failed` status with the actual final state: what the badge showed, what was expected. Claude Code reads that failure, goes back into the code, finds the second reference (maybe a memoized selector that also needed invalidating), fixes it, and calls `run_objective` again. This is the loop that actually earns the word "autonomous": write code, check it against reality, fix what's wrong, check again, without you manually tabbing between editor and browser five times.

### Locking the check in as a regression test

A one-off `run_objective` call is great for the moment, but you don't want to re-describe the cart badge flow in English every time you touch checkout code. Once the fix is verified, it's worth asking Claude Code to save the check as a committed test file:

```bash
browserbash record http://localhost:3000/products/classic-tee
```

Recording opens a visible browser; you click through the add-to-cart flow once, hit Ctrl-C, and BrowserBash writes a plain-English `*_test.md` file plus a pre-warmed replay journal, so the next run of that exact flow costs close to nothing in model calls. From here on, Claude Code (or you, or a CI job) can call `run_test_file` against that saved test any time cart logic changes, and get a deterministic answer without re-explaining the flow.

If you want the check to be genuinely deterministic rather than agent-judged, add a Verify line that BrowserBash compiles to a real Playwright assertion instead of an LLM opinion:

```
# Cart badge updates after add to cart

- Go to /products/classic-tee
- Click "Add to cart"
- Verify text "1" visible
```

That `Verify text "1" visible` line matches BrowserBash's deterministic assertion grammar, so it runs as an actual Playwright check with expected-vs-actual evidence on failure, not a judgment call by the model. Anything outside that grammar still runs, just flagged `judged: true` in the results so you always know which checks are hard facts and which are agent opinions.

## Building a fuller test-and-fix loop with testmd v2

For flows that mix API setup with UI verification, testmd v2 is worth knowing about even in a Claude Code MCP context, because `run_test_file` runs whatever version the file declares. A v2 file executes steps one at a time against a single browser session, and lets you seed state through an API call before checking it in the UI, without spending a model call on the setup step:

```markdown
---
version: 2
---

# Cart reflects seeded item

- POST /api/cart/seed with body {"sku": "classic-tee", "qty": 1}
  Expect status 200, store $.cartId as 'cartId'
- Go to /cart
- Verify text "classic-tee" visible
- Verify text "1" visible
```

The API step is deterministic and never touches a model at all, only the plain-English UI steps do. This is a good shape for Claude Code to reach for once a flow gets complex enough that pure browser-driving is slower or flakier than seeding data directly. Note that testmd v2 currently drives BrowserBash's builtin engine, which needs `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` gateway rather than Ollama or OpenRouter directly, so keep that in mind if you're running fully local otherwise.

## Reading the verdict correctly

One detail worth spelling out because it trips people up the first time: a `failed` status from `run_objective` or `run_test_file` is not an error condition for the MCP call itself. The tool call succeeded, it did exactly what it was asked, opened a browser, tried the flow, and observed that the expected outcome didn't happen. That distinction matters for how Claude Code (or any agent) should be prompted to behave. If you tell Claude to "run the verification and report back," a failed verdict should trigger another round of investigation and fixing, not a shrug. If you tell Claude to "run the verification and stop either way," it should surface the failure summary and assertion evidence to you directly rather than silently retrying forever.

The `assertions` array in the returned JSON is where the deterministic checks live, each with expected value, actual value, and pass/fail. The `cost_usd` field is a real estimate pulled from a bundled per-model price table, useful if you're running this loop many times a day and want Claude Code to be cost-aware about how many verification passes it burns on a single bug fix. Unknown or unlisted models simply don't get a cost estimate rather than a fabricated one.

## Where this fits versus running BrowserBash by hand

You don't have to choose between the MCP integration and the plain CLI, they're the same engine and most teams end up using both. Run `browserbash run "..."` or `browserbash testmd run` directly from your terminal or CI pipeline when you want a human-driven or scripted check with `--agent` NDJSON output for machine parsing. Reach for the MCP server specifically when you want an agent like Claude Code to decide on its own, mid-session, that it needs to validate something, without you having to hand it a shell command to run. The GitHub Action wraps the same CLI for pull-request checks with a self-updating verdict comment, so the same tests you record locally and verify through Claude Code can gate merges too, see the [github action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) for that setup.

If you're newer to BrowserBash generally, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections walk through the CLI itself, and the [features](https://browserbash.com/features) page covers the full list, replay caching, auth profiles, monitor mode, and the rest, most of which apply just as well when the caller is Claude Code instead of you.

## Common setup problems and how to read them

A few things go wrong often enough to call out directly.

**"browserbash mcp" exits immediately or Claude Code shows it disconnected.** Almost always this means `browserbash-cli` isn't actually on the `PATH` that Claude Code's subprocess inherits, especially if you installed it inside an nvm-managed Node version and Claude Code launches from a shell that doesn't source your nvm setup. Confirm with `which browserbash` in the same terminal you use to launch `claude`.

**Objectives time out or come back with confusing failures.** Check what model BrowserBash actually resolved to. If it silently fell back to a small local Ollama model because your `ANTHROPIC_API_KEY` wasn't in the environment Claude Code inherited, that's usually the culprit on anything more than a two- or three-step flow.

**The browser BrowserBash opens can't reach your dev server.** Provider defaults to `local`, meaning your own Chrome, so `localhost` URLs should just work. If you've configured a remote provider like Browserbase, LambdaTest, or BrowserStack for other runs, remember those browsers are not on your machine and can't see a `localhost` dev server unless you've set up a tunnel.

**Verify steps run as `judged: true` when you expected a deterministic check.** This means the Verify line's wording didn't match BrowserBash's assertion grammar exactly. Stick to the documented patterns (URL contains, title is/contains, text visible, `'name' button|link|heading` visible, element counts, stored value equals) if you need the hard pass/fail guarantee rather than an agent's best guess.

## FAQ

### How do I install the BrowserBash MCP server in Claude Code?

Install the CLI globally with `npm install -g browserbash-cli`, then register it with Claude Code using `claude mcp add browserbash -- browserbash mcp`. Claude Code manages the subprocess over stdio from that point on, no port or separate daemon required. Run `claude mcp list` to confirm it connected.

### What tools does the browserbash MCP server expose to Claude Code?

Three tools: `run_objective` for a single plain-English browser task, `run_test_file` for running a committed `*_test.md` file (including deterministic Verify assertions), and `run_suite` for running a whole folder of tests in parallel. Each returns structured JSON with status, summary, final state, assertions, cost, and duration.

### Does BrowserBash need an API key to work with Claude Code?

Not necessarily. BrowserBash resolves models in this order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If you have a capable model running locally through Ollama, the whole loop runs with no API key and no cost. Hosted models generally handle longer, multi-step flows more reliably than small local models under about 8B parameters.

### Can Claude Code use BrowserBash to verify its own code changes automatically?

Yes, that's the core use case. Once the MCP server is registered, Claude Code can call `run_objective` or `run_test_file` after making a change, read back a pass or fail verdict with evidence, and decide whether to keep fixing or report the task complete, without a human manually opening a browser to check.

Setting this up takes about two minutes: `npm install -g browserbash-cli`, then `claude mcp add browserbash -- browserbash mcp`. From there, every Claude Code session in that project can open a real browser and check its own work instead of asking you to. If you want a hosted dashboard for run history on top of the local setup, [creating a free account](https://browserbash.com/sign-up) is optional, everything above works entirely on your own machine either way.
