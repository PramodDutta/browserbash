---
title: Browser Automation for Codex CLI: Let Your Agent Verify the UI
description: "Add codex cli browser automation: a verify step that drives real Chrome and returns a pass/fail verdict via NDJSON, closing the generate-then-verify gap."
date: 2026-04-28
category: agents
---

OpenAI's Codex CLI is good at writing code and surprisingly good at running it. Ask it to fix a broken signup form and it will edit the component, run your unit tests, read the output, and iterate. But there is a gap that unit tests do not close: did the change actually work in a real browser? That is where codex cli browser automation comes in — a verification step that drives Chrome to a plain-English goal, then hands a machine-readable verdict back to the agent so it can keep looping until the UI is genuinely fixed. This tutorial shows you how to wire that step in using NDJSON output, without turning your agent into a Playwright maintainer.

If you have used Codex CLI for any frontend work, you already know the failure mode. The agent confidently reports "the fix is complete," you switch to the browser, and the button still does nothing. The agent never saw the rendered page — it reasoned about the DOM from the source, not from what Chrome actually painted. Closing that loop — generate, then verify against a real browser — is the single highest-leverage thing you can add to a Codex CLI workflow this year.

## The generate-then-verify gap in Codex CLI

Codex CLI runs as a local agent that can execute shell commands. That is its superpower: it can run `npm test`, `tsc --noEmit`, `eslint`, `curl localhost:3000`, read every line of output, and decide what to do next. For backend logic and pure functions, that loop is tight and trustworthy. A failing assertion is unambiguous, and the agent reacts to it.

Frontend is different. A React component can compile, pass type-checking, and render a button that is invisible because a CSS change pushed it behind a modal overlay. Your unit tests mock the click handler, so they stay green. The bug only exists in the browser, at runtime, after hydration. Codex CLI cannot see it unless something puts a real browser in the loop and reports back in a format the agent can parse.

There are three ways people try to close this gap today:

1. **A human checks the browser.** Reliable, but it defeats the point of an autonomous agent. You become the verification oracle, clicking through flows the agent should be checking itself.
2. **Playwright tests the agent writes and maintains.** Powerful and precise, but now the agent has to author selectors, fixtures, and assertions — and keep them green as the UI moves. Brittle selectors are exactly the kind of debt that slows agents down.
3. **A natural-language verify step.** You describe the expected outcome in English, a browser agent drives Chrome to check it, and it returns a structured pass/fail. No selectors to maintain, and the output is built for a machine to read.

This article is about option three, because it fits how Codex CLI already works — call a command, read its output, react. The piece that makes it click is a tool that emits clean NDJSON instead of prose. [BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source CLI built exactly for that, so it is the example throughout. But the pattern — verify the UI with a real browser and feed structured results back — applies no matter which tool you reach for.

## What Codex CLI can already do with a browser

Before adding anything, it is worth being precise about what Codex CLI offers out of the box, because the honest picture matters for deciding what to bolt on.

Codex CLI executes shell commands, so anything you can script, it can run. It also supports the Model Context Protocol (MCP): you register servers in `~/.codex/config.toml` (or a project-scoped `.codex/config.toml`), and those servers expose tools the agent can call. A common setup is the Playwright MCP server:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

That gives a Codex session low-level browser primitives — navigate, click, type, screenshot, read console messages, capture network requests, snapshot the accessibility tree. Separately, OpenAI added an embedded-browser capability to the Codex experience in 2026 where the agent can operate a Chromium window, annotate pages, and take screenshots; the exact surface and availability evolve, so check the current Codex changelog rather than a blog post. The point here is not to compete with any of that. It is to add a layer most of those primitives do not give you: a **verdict**.

Playwright MCP exposes actions. It will navigate and click and screenshot beautifully. What it does not do on its own is answer the question "did the checkout flow succeed — yes or no, and with what exit code?" You still have to interpret the screenshots and the DOM yourself, or write the assertion logic. For an autonomous agent that needs to decide whether to keep working or stop, the missing piece is a clean, structured pass/fail signal. That is the gap NDJSON output fills.

## Why NDJSON is the right interface for an agent

NDJSON — newline-delimited JSON — is one JSON object per line. It is boring, and that is exactly why it works for agents. Each line is independently parseable, you can stream it, and there is no prose to misread.

When you run BrowserBash with the `--agent` flag, that is what you get. Every step the browser agent takes emits a line like:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened the pricing page"}
```

And when the run finishes, a single terminal event tells the whole story:

```json
{"type":"run_end","status":"passed","summary":"Monthly toggle switched to annual and the price updated to $290/yr","final_state":{"plan":"Pro","price":"$290/yr"},"duration_ms":18342}
```

The terminal status is `passed`, `failed`, `error`, or `timeout`, and the process exit code matches: `0` passed, `1` failed, `2` error, `3` timeout. For Codex CLI this is ideal. The agent runs a command, gets an exit code it already understands, and can read the `summary` and `final_state` to know exactly what happened. No screenshot interpretation, no "the page looks correct" hand-waving, no parsing English. If exit code is `1`, the fix did not work, and the agent has a concrete `summary` to act on.

This is the difference between a tool that *acts* on a browser and a tool that *reports on* a browser in a way an agent can consume. Codex CLI is a consumer of structured output by design. Give it structured output and the loop closes itself.

## Setting up the verify step

Here is the actual setup. It takes about two minutes and needs no account.

First, install BrowserBash. It is an npm package; you need Node 18 or newer and Chrome installed for the default local provider.

```bash
npm install -g browserbash-cli
browserbash run "go to localhost:3000, click the Sign up button, and confirm a registration form appears" --agent
```

That second command is the whole idea in one line. You wrote a plain-English objective, an AI agent drove your real Chrome browser step by step — no selectors, no page objects — and it streamed NDJSON to stdout ending in a `run_end` verdict with a matching exit code.

On models: BrowserBash defaults to `auto`, which resolves Ollama first. If you have a local Ollama model running, the run is free and nothing leaves your machine — a real consideration when you are verifying internal staging environments. If not, it falls back to `ANTHROPIC_API_KEY` (Claude) and then `OPENAI_API_KEY` (GPT-4.1). One honest caveat worth stating up front: very small local models (8B and under) get flaky on long, multi-step objectives. They will nail "click the login button and check the dashboard loads" but wander on a six-step checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. Keep your verify objectives tight and you will get reliable results even on modest hardware.

Now connect it to Codex CLI. You do not need an MCP server for this — Codex CLI runs shell commands, so the simplest integration is to tell the agent, in your `AGENTS.md` or session prompt, that the verify command exists and how to read its exit code:

> After making frontend changes, run `browserbash run "<objective describing expected UI state>" --agent` against the running dev server. Exit code 0 means the UI is correct. Any non-zero exit means the change did not work — read the `summary` and `final_state` in the final NDJSON line and fix it.

That is the entire contract. Codex CLI already knows how to run a command and branch on its exit code. You have just given it eyes.

## A real Codex CLI loop, start to finish

Let me walk through a concrete session so the pattern is not abstract.

Suppose you ask Codex CLI to "make the email field show an inline validation error when the user types an invalid address." The agent edits the form component, adds a regex check, wires it to an `onBlur` handler, and runs the unit tests. They pass, because the unit test calls the validator directly. Without a verify step, Codex CLI stops here and tells you it is done. In the browser, the error message never renders because the agent bound the handler to the wrong event and React never fires it on blur.

With the verify step, the loop continues. Codex CLI runs:

```bash
browserbash run "on localhost:3000/signup, type 'not-an-email' into the email field, click away, and confirm an inline validation error message appears under the field" --agent --timeout 60
```

The browser agent opens Chrome, finds the email field by reading the page (not by a selector you wrote), types the bad value, blurs, looks for an error message, finds none, and emits:

```json
{"type":"run_end","status":"failed","summary":"No inline validation error appeared after entering an invalid email and blurring the field","final_state":{"error_visible":false},"duration_ms":9120}
```

Exit code `1`. Codex CLI reads `summary`, understands the error never rendered, goes back to the component, notices the handler is on `onChange` with a guard that suppresses it, fixes the binding, and runs the verify command again. This time the error renders, the verdict is `passed`, exit code `0`, and the agent legitimately reports success — because a real browser confirmed it. That is the generate-then-verify loop working as designed, with the agent self-correcting against ground truth instead of against its own assumptions.

You can make these runs auditable, too. Add `--record` and BrowserBash captures a screenshot plus a `.webm` session video (the builtin engine also writes a Playwright trace), so when a verify fails you have the footage to review without re-running anything. For more on how agents consume these events, the [BrowserBash blog](https://browserbash.com/blog) covers the NDJSON event schema in detail.

## Codex CLI verification options compared

There is no single right answer here. The honest comparison is about what you are optimizing for. Here is how the main approaches stack up for a Codex CLI workflow.

| Approach | Selectors to maintain | Built-in pass/fail verdict | Local / private option | Best for |
| --- | --- | --- | --- | --- |
| Human checks browser | None | N/A (you are the oracle) | Yes | One-off changes, design review |
| Playwright tests (agent-authored) | Yes | Yes, if assertions written | Yes | Stable, high-value regression suites |
| Playwright MCP server | No (agent drives live) | No — actions only, you interpret | Yes | Exploratory browsing, live DOM state |
| Codex embedded browser | No | No — screenshots you interpret | Depends on setup | Visual annotation, pointing at UI |
| NL verify via NDJSON (BrowserBash `--agent`) | None | Yes — `passed/failed` + exit code | Yes (local Ollama) | Autonomous verify loops in CI and agents |

A few honest notes on this table. Playwright MCP is excellent and, for some teams, all they need — if your agent is comfortable interpreting snapshots and you do not want another dependency, it is a fine, free choice. Agent-authored Playwright tests are the right call when you want a committed, deterministic regression suite that runs the same way every time; a natural-language verify step is fuzzier by nature because an LLM interprets the goal. The NL-plus-NDJSON approach wins specifically when you want zero selector maintenance *and* a clean machine verdict the agent can branch on without writing assertion code.

## When a natural-language verify step is the right call

This pattern is not for every test you will ever write. Be clear-eyed about where it shines and where it does not.

**Reach for an NL verify step when:**

- You are running an autonomous agent loop (Codex CLI, a CI job, a cron) that needs a yes/no answer to keep going, and you do not want the agent spending tokens authoring and debugging selectors.
- The flow changes often. Marketing pages, onboarding, dashboards mid-redesign — anything where a committed Playwright suite would spend half its life red because a `data-testid` moved.
- You want privacy. Verifying an internal staging build with a local Ollama model means nothing leaves your machine and there is no model bill.
- You are checking *outcomes*, not pixel-exact layouts. "The cart shows one item," "an error appears," "the price updated" — semantic checks an LLM reads well.

**Stick with committed Playwright (or another scripted framework) when:**

- You need byte-for-byte deterministic regression runs that never vary between executions.
- You are doing precise visual regression or pixel-diffing, which is a different job entirely.
- The flow is stable and high-stakes enough to justify the maintenance — a payment path you want pinned down with exact assertions.

The mature setup is usually both. Keep your hardened Playwright suite for the critical, stable paths, and add an NL verify step for the fast-moving surfaces and the agent's inner loop. They are not competitors; they cover different risk. The [BrowserBash features overview](https://browserbash.com/features) lays out where the natural-language approach fits a broader QA strategy.

### A note on the model you choose

Your verify step is only as reliable as the model interpreting the objective. A throwaway 3B model will hallucinate that a button exists, or get lost three steps into a flow, and you get false passes — the worst possible failure for a verification tool. If you are going to trust the verdict in an autonomous loop, use a model that can actually follow multi-step instructions. For the hard flows, pin a capable model explicitly:

```bash
browserbash run "log in as test@example.com, open the billing page, switch the plan to annual, and confirm the invoice preview shows the discounted total" --model claude-opus-4-8 --agent --record
```

For everyday checks against a local environment, a mid-size local model keeps it free and private. The [BrowserBash learn pages](https://browserbash.com/learn) walk through model selection and objective phrasing in more depth.

## Making verify steps committable with markdown tests

One-off `run` commands are great for the agent's inner loop, but you will want some checks pinned in the repo so every Codex CLI session — and your CI — runs the same verification. BrowserBash supports markdown test files for exactly this.

A `*_test.md` file is committable. Each list item is a step, you can template values with `{{variables}}`, compose files with `@import`, and any secret-marked variable is masked as `*****` in every log line so credentials never leak into output. After each run it writes a human-readable `Result.md`. You run the file with:

```bash
browserbash testmd run ./signup_test.md
```

Now your verify logic lives in version control next to the code it guards. When Codex CLI touches the signup flow, you can have it run the markdown test as the verification gate, and the masked-secrets behavior means you can keep login steps in the file without exposing passwords in the agent's transcript. Because the steps are plain English, a teammate who has never seen Playwright can read and edit them. There are worked examples in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Seeing what the agent saw

When a verify step fails inside an autonomous loop, "exit code 1, summary says the button did nothing" is usually enough for Codex CLI to act. But when *you* need to debug why a check is behaving oddly — a flaky element, a slow-loading widget, an objective the agent misread — you want to see the run, not just read about it.

Run `browserbash dashboard` to open a fully local dashboard on `localhost:4477`. Nothing is uploaded; it reads from the on-disk run store at `~/.browserbash/runs`, where every run is kept (secrets masked, capped at the most recent 200). You get a visual timeline of steps, screenshots, and any recorded video, which makes it obvious whether the agent failed because the UI was actually broken or because your objective was ambiguous. That distinction matters when you are tuning verify steps — a badly phrased objective produces false failures, and the dashboard is how you catch them.

If you want runs visible to a team or a CI dashboard, there is an opt-in cloud path: `browserbash connect --key bb_...` links your machine, and then `--upload` on a run pushes just that run to the cloud (free cloud runs are kept 15 days). Without `--upload`, nothing leaves your machine — the default is local and private, which is the right posture when an agent is poking at staging. Pricing and the cloud option are spelled out on the [BrowserBash pricing page](https://browserbash.com/pricing).

## Putting it all together

The whole point of an autonomous coding agent is that it does not stop until the work is actually done. For backend code, Codex CLI gets there because it can run tests and read failures. For frontend code, it has historically stopped short — confident, and wrong, because it never saw the rendered page. A natural-language verify step backed by NDJSON closes that gap with the smallest possible amount of new machinery: one command, an exit code Codex CLI already understands, and a structured summary it can act on.

You do not have to rebuild your testing strategy to get this. Keep your Playwright suite where it earns its keep, and add a verify step for the fast-moving surfaces and the agent's inner loop. Start with a single `browserbash run "..." --agent` after frontend changes, watch the exit codes flow, and graduate the checks you care about into committable markdown tests. The result is a Codex CLI that checks its own UI work against a real browser before it claims success — which is what you wanted from an autonomous agent in the first place.

## FAQ

### Does Codex CLI have built-in browser automation?

Codex CLI can run shell commands and connect to MCP servers, so you can give it browser tools — most commonly the Playwright MCP server, configured in `~/.codex/config.toml`. OpenAI has also added embedded-browser capabilities to the Codex experience in 2026, though the exact surface evolves, so check the current changelog. What none of these provide on their own is a structured pass/fail verdict, which is why teams add a natural-language verify step that returns one.

### How do I make Codex CLI verify a UI change actually worked?

Add a verify step that drives a real browser to a plain-English goal and returns a machine-readable result. With BrowserBash you run a command like `browserbash run "click signup and confirm the form appears" --agent`, which emits NDJSON ending in a `passed` or `failed` verdict with a matching exit code. Tell Codex CLI in your AGENTS.md to run that command after frontend changes and treat a non-zero exit as a failure to fix.

### What is NDJSON and why does it help AI coding agents?

NDJSON is newline-delimited JSON — one independent JSON object per line — which is trivial for a program to parse and stream. For an AI coding agent, it removes the guesswork of interpreting prose or screenshots: each step and the final verdict arrive as structured data with a known schema. Codex CLI consumes the exit code and the final `summary` and `final_state` fields directly, so it can branch on whether the UI check passed without any natural-language parsing.

### Is this a replacement for Playwright tests?

No, and treating it as one is a mistake. Committed Playwright tests are the right tool for deterministic, high-stakes regression suites and for precise visual diffing. A natural-language verify step is better for fast-moving UI and for an agent's inner loop, where you want zero selector maintenance and a clean verdict. Most mature setups use both: scripted tests for the stable critical paths, and an NL verify step for everything that changes often.

Add a real-browser verify step to your Codex CLI workflow in two minutes. Install with `npm install -g browserbash-cli`, point it at your dev server with `--agent`, and let your agent check its own UI work. It is free and open-source, no account required — and if you want team-visible cloud runs later, you can [sign up](https://browserbash.com/sign-up) anytime.
