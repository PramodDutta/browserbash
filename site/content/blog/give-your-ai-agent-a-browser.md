---
title: How to give your AI agent a real browser
description: "Give your AI agent a browser it can actually drive: BrowserBash --agent NDJSON, exit-code verdicts, and wiring patterns for any agent loop."
date: 2026-03-13
category: agents
---

Your coding agent can write the fix, open the pull request, and explain its reasoning in three tidy paragraphs. What it usually cannot do is open the page and look. That gap is the whole problem, and it is why people want to give an AI agent a browser in the first place — not a screenshot taken once by a human, not a flaky end-to-end suite written six months ago, but a live Chrome session the agent drives itself, mid-task, to confirm the thing it just changed still works. The hard part is rarely the browser. It is the wiring: how the agent issues an objective, how it reads the result without parsing English, and how it tells "the app is broken" apart from "my tooling fell over."

This is a practical guide to closing that gap with [BrowserBash](https://www.npmjs.com/package/browserbash-cli), a free, open-source CLI from The Testing Academy. The angle here is the machine interface specifically: the `--agent` flag, the NDJSON contract it emits, the exit codes that carry the verdict, and how you bolt all of that onto whatever agent loop you already run. By the end you should be able to call a real browser from your agent the way you'd call any other function — pass arguments, get back a typed result, branch on the outcome.

## Why an AI agent needs a browser, not a screenshot

Static context is the trap. A lot of agent setups hand the model a screenshot or a DOM dump and call it "vision." That tells the agent what the page looked like at one instant. It does not let the agent type into the search box, submit the form, wait for the spinner, and check what the page looks like *after* — which is the part that actually verifies a change.

A real browser session gives the agent the loop it needs: observe, act, observe again, decide. Think about a login flow. To know login still works, something has to fill the email field, fill the password field, click submit, wait for navigation, and confirm the dashboard rendered. No single screenshot covers that. You need a driver that can take five or fifteen ordered actions against live Chrome and report what happened at each step.

The traditional way to give a process that driver is a Playwright or Selenium script. Those work, but they are brittle in exactly the way agents are supposed to fix: a script that targets `button.btn-primary` breaks the day a designer renames the class to `button-cta`, even though any human (or any model) can see it's still the "Submit" button. The whole point of an agentic approach is that the agent reasons about the page from its objective — "log in and confirm the dashboard loads" — instead of from selectors that rot. BrowserBash leans into that: you write a plain-English objective, an AI agent interprets it against real Chrome step by step, and you get back a verdict plus any structured values it extracted. No selectors, no page objects, no maintenance tax when the markup shifts.

## What "give an AI agent a browser" means with BrowserBash

Install is one line, and there's no account, no signup gate, nothing to provision before your agent can call it:

```bash
npm install -g browserbash-cli
browserbash run "Open https://example.com and store the page title as 'title'"
```

That's the human-facing shape. You write an objective in English; an LLM-backed agent drives a real Chrome/Chromium browser to satisfy it. You need Node 18 or newer and Chrome installed for the default local provider. The latest version as of this writing is 1.3.1, licensed Apache-2.0.

Two pieces of vocabulary matter because they're the only two dials you tune for an agent integration:

- The **engine** is who interprets the English. The default is `stagehand` (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when the page shifts. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright. You switch with `--engine stagehand|builtin`.
- The **provider** is where the browser physically runs. The default is `local` — your own Chrome on your own machine. You can also point at any DevTools endpoint with `cdp`, or run on a cloud grid like Browserbase, LambdaTest, or BrowserStack.

For most "give my agent a browser" cases you leave both on the defaults and move on. The interesting choices are the model behind the agent and the output format, which is where the rest of this guide lives. There's a fuller breakdown of these on the [features page](https://browserbash.com/features) if you want the whole surface.

## The model story: Ollama-first, $0 by default

A browser tool that quietly bills you per run is a non-starter for an agent that fires dozens of verification calls a day. BrowserBash defaults to `auto`, and `auto` resolves in a deliberate order:

1. A local **Ollama** install, if it finds one. That becomes `ollama/<model>` — free, no API keys, and nothing leaves your machine. For an agent loop running constantly, this is the guaranteed-zero-model-bill path.
2. `ANTHROPIC_API_KEY`, if set, which resolves to `claude-opus-4-8`.
3. `OPENAI_API_KEY`, which resolves to `openai/gpt-4.1`.
4. Otherwise it errors with guidance instead of silently failing.

You can always pin the model explicitly with `--model` — `ollama/qwen3`, `claude-opus-4-8`, `openai/gpt-4.1`, `google/gemini-2.5-flash`, an OpenRouter route like `openrouter/meta-llama/llama-3.3-70b-instruct`, or an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`.

Here's the honest caveat, and it matters more for agents than for one-off human runs: very small local models — roughly 8B parameters and under — get flaky on long, multi-step objectives. They'll nail "open this page and grab the title" and then lose the plot on a ten-step checkout. The sweet spot for unattended agent work is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model for the genuinely hard flows. If your agent is going to drive a fifteen-step journey unsupervised, don't hand the wheel to a 3B model and expect determinism. Match the model to the objective length, and keep the cheap local model for the short stuff.

## The agent interface: `--agent` and NDJSON

This is the part that makes a browser callable from an agent loop. Add `--agent` to any run and BrowserBash stops printing prose and starts emitting **NDJSON** — newline-delimited JSON, one object per line, on stdout. Human-readable noise goes to stderr, so your agent's parser never sees it.

```bash
browserbash run "Open https://example.com/login, log in, and store the user name as 'user_name'" \
  --agent --headless --timeout 120
```

While the run executes, you get a stream of step events:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}
```

Each step carries an index, a status, the action the agent took (`navigate`, `click`, `type_text`, `extract`, and so on), and a short remark. Because they stream as they happen, a supervising agent can log progress, surface a live trail, and notice a stall early instead of waiting for the whole run to finish.

The last line is always a single terminal event:

```json
{"type":"run_end","status":"passed","summary":"...","final_state":{"user_name":"Q. Tester"},"duration_ms":48211}
```

`status` is one of `passed`, `failed`, `error`, or `timeout`. `final_state` carries every value the objective asked it to capture — anything phrased as `store ... as 'name'` lands here as a key. `summary` is a one-line human-readable verdict you can attach to a log or a PR comment. That's the contract: a stream of steps you can ignore or watch, terminated by exactly one structured result your agent reads with `tail -1 | jq`.

The reason this beats prose is stability. A human-readable test report changes wording every release; an NDJSON schema doesn't. Your agent's integration doesn't break because someone reworded a success message. There's a deeper dive on this contract in the [tutorials](https://browserbash.com/tutorials) if you want worked examples.

## Exit codes are the real API

NDJSON tells your agent *what* happened. The exit code tells it *what to do about it*, and that's the piece most home-grown integrations get wrong. BrowserBash maps the verdict straight onto the process exit code:

| Exit code | Meaning | What the agent should do |
|-----------|---------|--------------------------|
| `0` | passed | The app works. Continue, mark the check green. |
| `1` | failed | A real assertion failed — the app is broken. Investigate the diff. |
| `2` | error | Tooling or infrastructure error, not the app. Retry once, maybe on another provider. |
| `3` | timeout | The run ran out of time. Raise `--timeout` or split the objective. |

That four-way split is the whole reason an agent loop stays robust. The dangerous failure mode is conflating "the login page is broken" with "Chrome failed to launch" — one means investigate your code, the other means retry your tooling. If your agent infers success or failure by grepping stdout for the word "passed," it will eventually be fooled. The exit code never lies, and it's a single integer your loop already knows how to branch on.

## Wiring it to any agent loop

The minimal integration is three lines of shell, and it slots into any agent that can shell out:

```bash
out=$(browserbash run "Open https://example.com and store the page title as 'title'" --agent --headless)
code=$?
title=$(echo "$out" | tail -1 | jq -r '.final_state.title')
```

`out` holds the full NDJSON stream, `code` holds the verdict, and the last line parsed by `jq` gives you the structured result. From there, branching is ordinary control flow. Here's the pattern fleshed out into something an agent's tool wrapper would actually run, including credentials passed safely rather than inlined into the objective:

```bash
out=$(browserbash run "Open the staging login page, log in, and store the logged-in user name as 'user_name'" \
  --agent --headless --timeout 120)
code=$?

echo "$out" | jq -c 'select(.type=="step")'        # the step trail for the agent's log
summary=$(echo "$out" | tail -1 | jq -r '.summary')

case $code in
  0) echo "PASS: $summary" ;;
  1) echo "FAIL: $summary — surface the run_end to the user" ;;
  2) echo "INFRA: $summary — retry once" ;;
  3) echo "TIMEOUT: $summary — split the objective and retry" ;;
esac
```

A few rules keep these integrations healthy, and they generalize across whatever agent framework you're on:

**Always pass `--agent` from a machine caller.** Prose output is for humans reading a terminal. The moment an agent is the reader, NDJSON is non-negotiable.

**Phrase every extraction as `store ... as 'name'`.** That's the contract that puts values into `run_end.final_state`. If you want the order total back, say "store the order total as 'order_total'," and read `final_state.order_total`. Vague objectives produce vague final states.

**Keep objectives under roughly fifteen steps.** Long objectives are where small models drift and timeouts bite. If a flow is genuinely long, split it into multiple `browserbash run` calls — which also lets your agent run independent checks in parallel — or move it into a markdown test file (more on that below).

**Trust the exit code, never the prose.** Branch on `$?`. Treat `summary` as something to show a human, not something to parse.

**Pin the provider explicitly in CI.** Don't let `auto` surprise you on a build agent. Use `--provider local` for a local Chrome, a cloud grid when you need scale, or attach to a browser your agent already manages with `--cdp-endpoint ws://...` — that last one is exactly how you'd hook BrowserBash onto a Chrome that, say, a Playwright MCP server already launched, instead of spawning a second browser.

## Markdown tests: when one objective isn't enough

Sometimes the thing you want to give your agent isn't a single ad-hoc objective but a repeatable, committable suite. BrowserBash supports markdown test files (`*_test.md`) for exactly this, and they're a clean fit for agent workflows because they're plain text the agent can read, write, and version:

```bash
browserbash testmd run ./checkout_test.md
```

Each list item in the file is a step. You template values with `{{variables}}`, compose files with `@import`, and mark secrets so they're masked as `*****` in every log line — which matters a lot when an agent transcript gets logged verbatim somewhere you didn't expect. After each run it writes a human-readable `Result.md`, so you get a machine path (NDJSON when you add `--agent`) and a human path from the same source of truth. The committable angle is the real win: your agent can generate a test file, commit it, and re-run it on every future change, turning a one-time verification into a regression check. The [learn](https://browserbash.com/learn) section walks through the templating syntax in detail.

## Watching the browser: records, dashboards, and the run store

Giving an agent a browser also means giving yourself a way to see what the agent did, especially when a run comes back `failed` and you need to know why.

`--record` captures a screenshot plus a `.webm` session video via bundled ffmpeg; on the `builtin` engine it also writes a Playwright trace you can open in the trace viewer. That turns an opaque `exit 1` into a watchable replay — invaluable when the failure is something subtle like a cookie banner that intercepted the click.

Every run is also kept on disk at `~/.browserbash/runs` automatically, with secrets masked and a cap of 200 runs. So even without flags, your agent's last hundred-odd browser sessions are sitting there for inspection.

For a live view, `browserbash dashboard` opens a fully local dashboard on `localhost:4477` — no account, nothing uploaded, `--clear` wipes the store. If you do want shareable runs, the cloud path is strictly opt-in: `browserbash connect --key bb_...` links the account, and then you add `--upload` per run to push that specific run. Without `--upload`, nothing leaves your machine — which is the right default for an agent that might be driving a browser through an internal staging environment. Free cloud runs are kept 15 days. The [pricing page](https://browserbash.com/pricing) lays out what's free versus paid; the short version is that the local path costs nothing.

## How this compares to other ways to give an agent a browser

There's no shortage of options in 2026, and being honest about where each fits is more useful than pretending BrowserBash is always the answer.

| Approach | What it is | Best fit |
|----------|------------|----------|
| BrowserBash `--agent` | English objective → real Chrome → NDJSON + exit-code verdict | Agent loops and CI that need a callable, parseable browser with a $0 local default |
| Raw Playwright / Selenium | Hand-written selector scripts | Deterministic flows you'll maintain by hand; pixel-precise control |
| Hosted browser-agent products (e.g. OpenAI Operator) | Consumer-facing autonomous web agents | Interactive, human-in-the-loop tasks; specifics vary by vendor and aren't all publicly documented |
| Playwright MCP / CDP attach | Low-level browser control exposed to an agent | Agents that want to drive the browser action-by-action themselves |

A few honest notes. If your flow is fully deterministic and you're happy maintaining selectors, raw Playwright will be faster and more predictable than any model-in-the-loop approach — there's no LLM latency and no nondeterminism. BrowserBash earns its keep when the markup churns and you'd rather express intent than selectors, and when you need a stable machine contract for an agent rather than a script you babysit.

The hosted autonomous-agent products are aimed at a different job: a human watching an agent do a task in a chat UI, often with manual checkpoints. Their exact model lineups, pricing tiers, and architectures aren't all publicly specified and shift frequently, so I won't put numbers on them here. What I can say plainly is that they're not built as a `--agent` NDJSON tool you call from your own loop and branch on an exit code — that CI-callable, scriptable shape is where BrowserBash is specifically designed to fit. And if your agent wants to drive the browser itself, action by action, a lower-level CDP or Playwright MCP setup may suit you better; BrowserBash's `--cdp-endpoint` actually composes with that, attaching to a browser the agent already controls. There's a worked [case study](https://browserbash.com/case-study) if you want to see the pattern end to end.

## When to choose BrowserBash for your agent

Reach for it when most of these are true: you have an agent (a coding agent, a CI bot, an orchestration script) that needs to *verify* something in a real browser; you want a stable machine interface rather than scraped prose; you'd rather write objectives than maintain selectors; and you care about keeping the model bill at zero with local inference. The `--agent` flag, the NDJSON schema, and the exit-code verdict were built for exactly that caller.

Lean elsewhere when your flow is fully deterministic and selector-stable and you're fine maintaining a Playwright script by hand, or when you specifically want a human-in-the-loop consumer agent experience rather than a headless tool call. Tools are not religions; pick the one whose shape matches your loop.

If you're somewhere in between, the cheapest experiment is to install the CLI, point it at one real flow with `--agent`, and read the exit code. You'll know within a run or two whether the contract fits how your agent thinks. The full command surface lives on [npm](https://www.npmjs.com/package/browserbash-cli) and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly how the loop works before you trust it.

## FAQ

### How do I give my AI agent a browser without writing selectors?

Install BrowserBash with `npm install -g browserbash-cli`, then have your agent shell out to `browserbash run "<objective>" --agent`. You write the goal in plain English, an LLM-backed agent drives real Chrome to satisfy it, and you get back NDJSON plus an exit-code verdict. There are no selectors or page objects to maintain — the agent reasons about the page from your objective, so it tolerates markup changes that would break a hand-written script.

### How does my agent know if the browser run passed or failed?

By the process exit code, not by reading text. BrowserBash returns `0` for passed, `1` for a real app failure, `2` for a tooling or infrastructure error, and `3` for a timeout. Your agent branches on `$?` — `1` means investigate the change, `2` means retry once, `3` means raise `--timeout` or split the objective. The final NDJSON `run_end` line carries a matching status and a one-line summary for human-readable logs.

### Does giving my agent a browser cost money per run?

Not on the default local path. BrowserBash runs your own Chrome locally, and with a local Ollama model nothing leaves your machine and there's no model bill at all. You only pay if you opt into a hosted model with an API key, or push runs to the optional cloud dashboard with `--upload` after connecting. Both are opt-in; the zero-cost local loop is the default.

### Can a small local model drive a real browser reliably?

For short objectives, yes — a small model handles "open this page and grab the title" fine. For long multi-step flows, very small models (roughly 8B and under) tend to drift and lose the plot. The reliable sweet spot for unattended agent work is a mid-size local model like Qwen3 or a Llama 3.3 70B-class model, or a capable hosted model for the genuinely hard flows. Match the model to the length of the objective.

Ready to give your agent a real browser? Install it with `npm install -g browserbash-cli` and start with a single `--agent` run. An account is optional — grab one only if you want the cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
