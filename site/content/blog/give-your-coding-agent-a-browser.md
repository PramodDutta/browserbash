---
title: How to Give Your Coding Agent a Real Browser and a Verdict
description: "How to give an AI agent browser access so your coding agent self-verifies web changes: plain-English checks, NDJSON output, and exit-code verdicts."
date: 2026-03-20
category: agents
---

Your coding agent just refactored the checkout page. It moved a button, renamed a prop, touched the reducer that owns the cart total, and then told you the flow still works. It did not open a browser. It read its own diff, matched the change against a mental model of how React renders, and declared success. That is the single most expensive lie in agentic development, and the only durable fix is to give your AI agent browser access — a real Chrome it can drive and, more importantly, a verdict it can trust without parsing prose. This article is a practical recipe for closing that gap: you hand a plain-English check to a CLI, the CLI drives an actual browser, and your agent reads back a structured result plus an exit code. No screenshots to interpret, no test logs to scrape.

I have spent enough time wiring agents into real pipelines to know where the seams are. The hard part is never "can the agent click a button." The hard part is the handoff: how the agent expresses what it wants checked, and how it knows — in code — whether the check passed. Get that handoff wrong and you have a faster way to ship broken pages.

## The verification gap is the real bug

A coding agent has one structural blind spot. It generates text — code, config, commit messages — and text is all it can natively inspect. When the task is "make the login form submit without a full page reload," the agent can write a plausible `onSubmit` handler, but it cannot observe whether the network request fires, whether the spinner appears, or whether the dashboard actually renders afterward. It has no eyes.

Teams paper over this in three ways, and all three leak.

The first is **trust the diff**. The agent reads its own changes and asserts they work. This is how you ship a page where the button is centered, styled, and wired to a handler that throws on click. The code looks right. The page is broken.

The second is **run the unit tests**. Useful, but unit tests assert that functions return what you told them to return. They do not load the page, mount the component tree, hydrate, fire real events, or hit the actual API. A green unit suite over a white screen is a daily occurrence in frontend work.

The third is **screenshot and squint**. The agent drives a browser, captures a PNG, and pipes it back into a vision model to ask "does this look right?" This is slow, it burns tokens, and "looks right" is not a verdict you can branch on. A screenshot of a perfectly laid-out form says nothing about whether submit works.

What an agent actually needs is the same thing a CI job needs: a check that runs against the live page and returns a boolean. Passed or failed. That is the shape of a verdict, and it is the shape this recipe produces.

## What "a real browser and a verdict" actually means

There are two halves to giving an agent browser access, and people conflate them.

**The browser** is the easy half. Plenty of tools spawn Chrome and let something click around in it. Playwright drives browsers. Vercel Labs' agent-browser drives browsers. Browser-use drives browsers. The MCP ecosystem is full of servers that expose `navigate`, `click`, and `type` to an agent. Access to a browser is close to a commodity in 2026.

**The verdict** is the half that decides whether your agent self-verifies or just self-deludes. A verdict is a machine-readable answer to a yes/no question about the running app, plus the structured values the check pulled out along the way. "Did the order confirmation number appear after checkout, and what was it?" is a verdict-shaped question. The answer your agent needs back is not a paragraph and not a PNG — it is `{"status":"passed","final_state":{"order_number":"BB-48213"}}` and a process exit code of `0`.

The distinction matters because of how agents fail. Hand an agent a low-level browser driver and a fuzzy goal, and it will compose a sequence of clicks, then *narrate* whether it thinks the sequence worked. That narration is just more generated text — the exact thing you were trying to escape. To break the loop, the pass/fail decision has to be made by the tool against the real DOM.

BrowserBash is built around that second half. You write one plain-English objective, an AI agent drives a real Chrome step by step, and the run terminates with a verdict and the values it extracted. The `--agent` flag turns that into a stream your code can consume directly.

## The recipe: a plain-English check that returns NDJSON and an exit code

Here is the whole loop in one command. Your coding agent — Claude Code, Cursor, Codex, a homegrown harness, whatever you run — shells out to this after it edits the page:

```bash
browserbash run "Go to http://localhost:3000, log in with test@acme.dev / hunter2, \
add the 'Pro Annual' plan to the cart, complete checkout with card 4242 4242 4242 4242, \
and confirm an order number is shown. Extract the order number." \
  --agent --headless --timeout 90
```

Three things make this work as an agent handoff.

**The check is plain English.** The agent does not author a snapshot-click-fill sequence or maintain selectors. It writes the intent — the same sentence a human QA engineer would put in a ticket — and an AI agent inside BrowserBash figures out the steps against the live page. When the button moves next sprint, the sentence still describes a true intent, so nothing in the agent's prompt has to change.

**The output is NDJSON.** With `--agent`, stdout is newline-delimited JSON: one object per line, stable schema, no prose. Progress events look like this:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened localhost:3000"}
{"type":"step","step":2,"status":"passed","action":"fill","remark":"Entered login credentials"}
```

And the run terminates with a single terminal event your agent keys off:

```json
{"type":"run_end","status":"passed","summary":"Checkout completed; order number shown","final_state":{"order_number":"BB-48213"},"duration_ms":41200}
```

Your agent reads the last line, pulls `status` and `final_state.order_number`, and moves on. No regex over human log lines, no format drift between releases.

**The exit code is the verdict.** BrowserBash maps the outcome to a process exit code: `0` passed, `1` failed, `2` error, `3` timeout. That is the part that makes this composable with everything else a shell can do. `&&` chains, CI gates, `if` blocks — they all already speak exit codes. Your agent does not need to understand NDJSON at all to make a decision; it can branch on `$?`.

```bash
if browserbash run "Open the dashboard and confirm the revenue chart renders with data" \
     --agent --headless --timeout 60; then
  echo "verified — safe to commit"
else
  echo "regression — agent should re-open the diff"
fi
```

That `if` is the whole point. The agent edited code, asked a real browser a real question, and got a binary answer it can act on without a second model call.

## Why NDJSON plus exit codes beats screenshots and prose

It is worth being concrete about why this specific output contract matters for agents, because it is not an aesthetic choice.

**Determinism.** A model asked to read a screenshot or a paragraph of log output gives you a probabilistic interpretation. The same run can be summarized two different ways. An exit code is the same every time for the same outcome. When you are gating commits, you want the boring, deterministic signal.

**Token cost.** Piping a PNG into a vision model on every verification is expensive and slow, and you do it on every iteration of the loop. NDJSON terminal events are a few hundred bytes; the agent reads one line.

**No prose parsing.** Human-readable test reports change wording between releases. The moment your agent depends on matching the string "Test passed" you have coupled it to a format nobody promised to keep stable. A typed schema — `type`, `status`, `final_state` — is a contract.

**Extracted values, not just pass/fail.** A verdict that is only a boolean tells you the flow worked. `final_state` tells you *what happened* — the order number, the displayed total, the confirmation email address — so the agent can feed those values into the next step, assert on them, or log them. That is the difference between "checkout passed" and "checkout passed and produced order BB-48213 for $199."

Here is the same contrast in a table.

| Signal the agent reads back | Deterministic? | Token cost per check | Structured data? | Branch on it directly? |
| --- | --- | --- | --- | --- |
| Self-narration ("I think it works") | No | Low | No | No |
| Screenshot into a vision model | No | High | No | No |
| Human-readable test log (grep "PASS") | Fragile | Medium | No | Sort of |
| NDJSON + exit code | Yes | Low | Yes (`final_state`) | Yes (`$?`) |

The bottom row is the one you want an agent building on.

## How the engines and providers fit the loop

BrowserBash separates two concerns that other tools weld together: who *interprets* your English, and where the *browser* runs. Both matter when you are wiring this into an agent.

The interpreter is the **engine**. The default is `stagehand` (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when the page shifts. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright; it is used automatically for the LambdaTest and BrowserStack providers. You switch with `--engine stagehand|builtin`. For a local self-verification loop, the default is fine — you rarely touch this.

The location is the **provider**, set with `--provider`. The default is `local`: your own Chrome, which is exactly what you want when an agent is verifying changes on `localhost`. There is also `cdp` to attach to any DevTools endpoint (`--cdp-endpoint ws://...`), and hosted grids — `browserbase`, `lambdatest`, `browserstack` — for when you need a browser the agent's machine does not have. Most of the time, an agent verifying its own diff runs against `local` and nothing leaves the box.

That last point matters for cost and privacy, and it leads into the model story, which is the part most "give your agent a browser" guides get hand-wavy about. You can read the full breakdown of [BrowserBash's features](https://browserbash.com/features), but the short version follows.

## The model story: Ollama-first, $0 by default

Every step the AI agent takes inside BrowserBash needs a model to reason about the page. The default model is `auto`, and it resolves in a deliberate order:

1. A **local Ollama** install, if present, becomes `ollama/<model>` — free, no keys, nothing leaves your machine.
2. Otherwise an `ANTHROPIC_API_KEY` selects `claude-opus-4-8`.
3. Otherwise an `OPENAI_API_KEY` selects `openai/gpt-4.1`.
4. Otherwise it errors with guidance instead of guessing.

For an agent loop that fires on every code change, the economics of "local by default" are the whole game. If your verification model runs on Ollama, your model bill for self-verification is exactly zero, no matter how many times the agent re-checks its work. When each check costs nothing, you verify after every meaningful edit instead of batching at the end.

Now the honest caveat, because this is where the local-model dream meets reality. **Very small local models — roughly 8B parameters and under — are flaky on long, multi-step objectives.** They will navigate a single page fine and then lose the thread on a six-step checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. If your agent's verification keeps failing on a flow you know works, the model is the first thing to size up — pin it explicitly and re-run:

```bash
browserbash run "Complete the full signup, email verification, and onboarding wizard, \
then confirm the user lands on the empty-state dashboard" \
  --agent --model ollama/qwen3 --record --timeout 180
```

You can also pin a hosted model with `--model claude-opus-4-8`, route through `openrouter/<vendor>/<model>` with an `OPENROUTER_API_KEY`, or point `ANTHROPIC_BASE_URL` at a compatible gateway. The recipe does not change; only the brain behind the browser does. The [tutorials](https://browserbash.com/tutorials) walk through model selection in more depth.

## Wiring it into a real agent loop

Let me make this concrete with the shape of an actual self-verifying loop, the kind people call a "Ralph Wiggum loop" — edit, verify, and if the verdict is bad, feed the failure back and edit again.

1. **The agent makes a change.** It edits the React components, updates the reducer, saves the files, and the dev server hot-reloads `localhost:3000`.
2. **The agent runs the check.** It shells out to `browserbash run "<plain-English objective>" --agent`. It does not interpret the page itself; it delegates that to a real browser.
3. **The agent reads the last NDJSON line and the exit code.** On `0`, it pulls `final_state`, confirms the extracted values match expectations, and commits. On non-zero, it reads the `summary` and the last `passed` step to localize where the flow broke.
4. **On failure, it re-opens the diff with context.** "Checkout failed at step 4, action `click`, remark: submit button did not trigger a network request" is a precise, machine-generated bug report the agent can act on. That is far better feedback than a screenshot, because it names the failing action.

The key design property is that step 3 is deterministic. The agent is not asking another model "did it work?" — it is reading an exit code. The model's judgment is spent on *fixing* the code, not on *deciding whether the page works*. That separation is what keeps the loop from spiraling.

For changes that genuinely need eyes on them — a layout regression, a chart that renders but renders wrong — add `--record`. BrowserBash captures a screenshot and a `.webm` session video via bundled ffmpeg, and on the `builtin` engine it also writes a Playwright trace. The agent still branches on the exit code; the artifacts are there for the human who reviews the PR. You can browse a few worked examples on the [BrowserBash blog](https://browserbash.com/blog) and in the [case studies](https://browserbash.com/case-study).

## Committable checks: markdown tests for the flows that matter

One-shot `run` commands are perfect for a transient verification inside an agent loop. But some checks deserve to live in the repo — the critical-path flows you never want to regress. BrowserBash has a second format for those: markdown tests.

A `*_test.md` file is a plain markdown list where each item is a step. It supports `{{variables}}` templating, `@import` for composing shared setup, and secret-marked variables that get masked as `*****` in every log line. You run it the same way, and after each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md --agent
```

The advantage for an agentic team is that these files are reviewable in a pull request. A human reads the test as English and approves it; the agent runs it on every change and reads the verdict as NDJSON. The same artifact serves both readers. That is a genuinely nice property — the spec and the executable check are the same file, and neither side has to translate. The [learn hub](https://browserbash.com/learn) covers the markdown test format end to end.

Every run, whether one-shot or markdown, is also kept on disk at `~/.browserbash/runs` with secrets masked and the store capped at 200 runs, so an agent can look back at what it checked recently without re-running.

## How this compares to handing the agent a low-level browser driver

This is the honest part. BrowserBash is not the only way to give an agent browser access, and for some teams a lower-level tool is the better fit. Here is the real trade-off.

**Vercel Labs' agent-browser** is a fast, well-built CLI that hands your agent the accessibility tree. The agent takes a snapshot, gets back interactive elements as refs like `@e1` and `@e2`, and composes `click @e1` / `fill @e2` sequences itself. It is token-efficient and precise, and it gives the agent fine-grained control. The cost is that *the agent is responsible for the verdict*. It drives the steps, and it decides whether the result is correct — which puts the pass/fail judgment back in the model's hands. If you want maximum control and your agent is strong at composing low-level sequences, that control is a feature, and agent-browser is a great choice. We compare them honestly in a dedicated [agent-browser alternative](https://browserbash.com/blog) write-up.

**Playwright MCP** (Microsoft's official server) exposes around three dozen browser tools to an agent over MCP — `browser_navigate`, `browser_click`, `browser_snapshot`, and so on — plus persistent state for iterative reasoning over page structure. It is the natural pick when your agent already speaks MCP and you want it reasoning step-by-step over the accessibility tree inside its own loop. Same trade-off as agent-browser: the agent composes the steps and owns the conclusion.

The distinction is altitude, not quality. Those tools hand the agent **primitives** and let it build the check and judge the result. BrowserBash hands the agent **a check** and returns **a verdict**. One sentence in, an exit code out.

| | Low-level driver (agent-browser, Playwright MCP) | BrowserBash `--agent` |
| --- | --- | --- |
| Agent writes | A sequence of click/fill commands against refs | One plain-English objective |
| Who decides pass/fail | The model, from its own actions | The tool, against the live DOM |
| Output | Refs, snapshots, tool results | NDJSON events + `final_state` + exit code |
| Breaks when UI shifts | Refs go stale; agent re-snapshots | Intent still holds; agent re-runs the sentence |
| Best when | You want maximum low-level control | You want a deterministic verdict per check |

### When a low-level driver is the better fit

Reach for agent-browser or Playwright MCP when you need surgical control over individual interactions, when your agent is genuinely good at composing click sequences and you want it reasoning over raw page structure, or when you are already deep in an MCP-native setup and adding another shell-out is friction. If the goal is "let the agent explore and decide," a primitive-level driver gives it room.

### When BrowserBash is the better fit

Reach for BrowserBash when the goal is self-verification with a clean handoff: the agent should express *what to check* in one sentence and get back a deterministic pass/fail it can branch on without a second model call. It fits especially well when you want $0 verification on local models, when you want the same check to be both a committed markdown test and a CI gate, and when you want extracted values (`final_state`) back, not just a boolean. If you have ever watched an agent screenshot a page and then confidently misread it, this is the shape that fixes it.

Be honest with yourself about which problem you have. If your agents already verify reliably with a low-level driver, you do not need to switch. If they keep declaring victory blind, you need a verdict — and that is what this recipe is for.

## A few practical guardrails

A handful of things I would tell anyone wiring this into an agent for the first time.

**Always set `--timeout`.** An agent that shells out without a timeout can hang a CI job on a flow that never completes. Give every check a ceiling in seconds. A timeout produces exit code `3`, which your agent can treat distinctly from a real failure.

**Keep `--upload` off unless you mean it.** By default nothing leaves your machine. The optional cloud dashboard exists — you link it with `browserbash connect --key bb_...` and then opt in per run with `--upload`, and free cloud runs are kept 15 days — but for local self-verification you do not need it. There is also a fully local dashboard at `browserbash dashboard` on `localhost:4477` if you want to eyeball runs without any cloud at all.

**Mask your secrets.** In markdown tests, mark credential variables as secret so they show as `*****` in every log line and in the on-disk run store. An agent that logs NDJSON to your CI output should never leak a password into the build log.

**Right-size the model before you blame the flow.** If a check fails on a flow you have verified by hand, swap to a mid-size or hosted model and re-run before assuming the page is broken. Small local models failing a long flow is a model problem wearing a regression's costume.

That is the whole recipe. Install once, write the check as a sentence, branch on the exit code. Pricing for the optional hosted pieces is on the [pricing page](https://browserbash.com/pricing), but the core loop — local Chrome, local model, NDJSON, exit code — costs nothing and stays on your machine.

## FAQ

### How do I give an AI agent browser access without writing selectors?

Install a natural-language browser CLI and have your agent shell out to it with a plain-English objective. With BrowserBash you run `browserbash run "<what to check>" --agent`, and an AI agent drives a real Chrome step by step, figuring out the clicks and fills itself. There are no selectors, page objects, or refs for your agent to maintain, so the check survives most UI changes because it describes intent rather than DOM structure.

### What output format should a coding agent read instead of screenshots?

Use NDJSON plus a process exit code, not screenshots or prose logs. NDJSON gives one JSON object per line with a stable schema, so your agent reads the terminal `run_end` event for `status` and `final_state` without parsing free text. The exit code (0 passed, 1 failed, 2 error, 3 timeout) lets the agent branch deterministically in a shell `if` block, which is far more reliable than piping a PNG into a vision model on every check.

### Does running browser checks for my agent cost money per run?

Not if you run on a local model. BrowserBash defaults to `auto`, which uses a local Ollama install first, so nothing leaves your machine and your model bill for verification is zero regardless of how often the agent re-checks. You only pay if you opt into a hosted model with an API key or use a paid browser grid, and the local dashboard and local Chrome provider are free.

### Can the same browser check work as both a committed test and a CI gate?

Yes. BrowserBash markdown tests (`*_test.md`) are plain-English, committable files where each list item is a step, with templating, imports, and masked secrets. A human reviews the file in a pull request as readable English, while your agent or CI runs it with `browserbash testmd run` and reads the verdict as NDJSON and an exit code. The same artifact serves the human reviewer and the machine gate, so the spec and the executable check never drift apart.

Ready to give your coding agent a browser and a verdict it can trust? Install it and run your first check in under a minute:

```bash
npm install -g browserbash-cli
```

No account needed to run — but if you want the optional cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up) when you are ready.
