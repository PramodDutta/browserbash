---
title: LaVague vs BrowserBash: Two Takes on AI Web Agents
description: "LaVague vs BrowserBash compared: World Model agents that emit Selenium code vs a free, plain-English CLI with NDJSON, exit codes, and local LLMs."
date: 2026-06-13
category: comparison
---

Put "LaVague vs BrowserBash" side by side and you are really comparing two philosophies of what an AI web agent should be. Both let you write an objective in plain English and hand the clicking to a model instead of a hand-tuned selector. But they answer the next question — *what do I actually get back?* — in opposite ways. LaVague is a Python framework built around a Large Action Model that reasons about a page and emits Selenium or Playwright code to drive it. BrowserBash is a free, open-source command-line tool that drives a real Chrome browser from one sentence and returns a verdict plus structured results, no framework assembly required. This article walks through both honestly, where each fits, and how to decide.

A note on sourcing before we start: every claim about BrowserBash below maps to a real flag or command you can run today. For LaVague, this post sticks to well-known, publicly documented facts — its architecture, that it is open source under Apache-2.0, that it is a Python package, and that it generates and runs Selenium/Playwright code. No competitor pricing, internal benchmarks, or invented features. Where something is genuinely a judgment call, it is labeled as one.

## What LaVague is

LaVague describes itself as a Large Action Model framework for building AI Web Agents. The mental model has two moving parts. A **World Model** takes your objective and the current state of the page and produces a set of instructions. An **Action Engine** then "compiles" those instructions into actual automation code — Selenium or Playwright — and executes it against the live site. By default it reasons with OpenAI's `gpt-4o`, though the LLM is customizable. There is also **LaVague QA**, a companion tool aimed at QA engineers that turns Gherkin specifications into integratable tests by leaning on the same framework.

The important design choice here is that LaVague is *generative in the automation-code sense*. The agent is not just clicking; it is producing webdriver code as an artifact of solving the objective. For a developer building a product feature — "let my users describe a task and have an agent carry it out in their browser" — that is a powerful primitive. You embed the framework in a Python application, wire up your model and driver, and you have an agent you can extend, inspect, and shape in code.

That power has a shape. LaVague is a framework, which means you assemble it: install the Python packages, choose and configure an LLM, pick a driver, and write the Python that orchestrates the World Model and Action Engine for your use case. It rewards teams who want an agent *inside* a Python codebase and are comfortable owning that integration.

## What BrowserBash is

BrowserBash starts from a narrower, blunter promise: you type a plain-English objective on the command line, an AI agent drives a real Chrome or Chromium browser, and you get back a pass/fail verdict and structured results. There are no selectors, no page objects, and nothing to assemble. Install it and run a sentence:

```bash
npm install -g browserbash-cli

browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first product to the cart, and verify the cart badge shows 1"
```

The agent re-reads the page on each run and figures out where the fields and buttons are the way a person would. If the verification clause is false, the run fails. That is the whole interface for the simple case — and the design keeps that simplicity even as you scale up to CI, cloud grids, and committable test files.

Under the hood BrowserBash runs two engines. The default is **Stagehand**, the MIT-licensed open-source automation library from Browserbase, built around resilient, self-healing actions. The second is a **builtin** engine: an in-repo Anthropic tool-use loop that additionally captures a Playwright trace when you record. You pick per run; you do not have to care which one to get started.

On models, BrowserBash is Ollama-first. It auto-detects a local Ollama install before anything else, so the default path is free, local, and needs no API keys. If you want hosted brains, it also speaks OpenRouter — including genuinely free models like `openai/gpt-oss-120b:free` — and Anthropic's Claude if you bring your own key. The resolution order is Ollama, then Anthropic, then OpenRouter, and one `--model` flag overrides it per run.

## The core difference: code artifact vs. live verdict

This is the distinction that should drive most decisions.

LaVague's output is **automation code that runs**. The agent reasons about the page and the Action Engine compiles instructions into Selenium or Playwright calls. That is ideal when the generated automation *is* the point — you want a webdriver script as a tangible result, or you are building a product where users' objectives become browser actions inside your Python app.

BrowserBash's output is a **verdict and structured data**. You do not get a Selenium script back; you get exit code `0` for passed, a one-line summary, and any values the objective asked it to capture. The unit of value is "did the flow work, and what did we learn," not "here is reusable webdriver code." For testing, monitoring, and wiring browser checks into pipelines or AI coding agents, that is usually what you actually want.

Neither is better in the abstract. They optimize for different deliverables. If you are thinking "I need an agent embedded in my application that produces and runs browser code," LaVague's model fits naturally. If you are thinking "I need to verify a user flow from the terminal or CI and get a clean pass/fail," BrowserBash's model fits naturally.

## Built for machines: NDJSON and exit codes

Where BrowserBash leans hard is being callable by other programs — CI systems and AI coding agents in particular. Add `--agent` and stdout becomes NDJSON: one JSON object per line, stable schema, human-readable noise pushed to stderr.

```bash
browserbash run "Open https://staging.example.com/login, log in as {{user}} with password {{password}}, and store the logged-in display name as 'name'" \
  --agent --headless --timeout 120 \
  --variables '{"user":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

Step events stream as the run proceeds, and the final line is always a single `run_end` object carrying status, a summary, `final_state` with anything you asked it to `store ... as 'name'`, duration, and step count. The process exit code mirrors the verdict — `0` passed, `1` failed, `2` error, `3` timeout — so a calling program never has to parse prose to know what happened. A supervising agent reads the last line with `tail -1 | jq` and trusts the exit code. Notice the credentials ride in `--variables` with `"secret": true`, which masks them as `*****` in logs and in the NDJSON stream itself.

That machine-first contract is the heart of BrowserBash's positioning, and you can read more about wiring it into pipelines and coding agents on the [BrowserBash blog](https://browserbash.com/blog). A general-purpose agent framework like LaVague can of course be scripted, but a documented NDJSON schema plus standardized exit codes is purpose-built plumbing for "an AI or a CI job calls a browser run like a function."

The practical payoff shows up when an objective needs to *return data*, not just pass. Phrase the capture with `store ... as 'name'` and the value lands in `run_end.final_state`, ready for the next step in a script:

```bash
out=$(browserbash run "Open https://news.ycombinator.com and store the title of the top story as 'headline'" --agent --headless)
code=$?
headline=$(echo "$out" | tail -1 | jq -r '.final_state.headline')
echo "exit=$code top=$headline"
```

There is no HTML parsing, no selector for the headline element, and no second tool to extract the value — the agent reads the page, the objective names what to keep, and `jq` pulls it off the final line. That is a different unit of work than generating a Selenium script that you then run and scrape; the structured result *is* the deliverable.

## Committable tests in Markdown

BrowserBash also ships a format that has no direct one-to-one in LaVague's core: Markdown tests. You write a `*_test.md` file where each list item is a step, compose shared steps with `@import`, and template values with `{{variables}}` (secrets masked as `*****`). It runs and writes a `Result.md` report next to the file.

```bash
browserbash testmd run ./checkout_test.md --headless --record --upload
```

These files live in your repo and read like documentation a product manager could review. It is worth being precise and fair here, because the comparison is easy to muddle: LaVague's QA tooling famously converts **Gherkin** specs into tests, which is a related but different idea — Gherkin in, generated test code out. BrowserBash's Markdown tests are the runnable artifact themselves; the steps you write *are* the test, executed by the agent each run with a `Result.md` as the report. Both reduce the gap between "what we wrote down" and "what we run," from different directions.

## Where the browser runs, and recordings

A practical axis people forget until they hit it: *where does the browser actually execute?* BrowserBash treats this as a single flag. The default provider is `local` — your own Chrome. From there you can point at any DevTools endpoint with `cdp`, or switch to a cloud grid with one word:

```bash
browserbash run "Open the pricing page and verify the FAQ section is present" \
  --provider lambdatest --headless --record
```

Swap `lambdatest` for `browserbase`, `browserstack`, or back to `local` without touching the objective. The `--record` flag captures a screenshot and a session video (`.webm`, stitched with ffmpeg) on any engine, and on the builtin engine it also captures a Playwright trace. Add `--upload` after connecting an account and the run — history, recordings, per-run replay — lands in a cloud dashboard; there is also a fully private, free local dashboard via `browserbash dashboard`. Nothing leaves your machine unless you pass `--upload`. LaVague, being driver-based, naturally runs wherever your configured Selenium or Playwright driver points, including remote grids you set up — the difference is configuration in code versus a one-word CLI switch and built-in recording.

## Side-by-side comparison

The table sticks to widely known, publicly documented facts. Anything not publicly established is marked "varies by setup" rather than guessed.

| Dimension | LaVague | BrowserBash |
|---|---|---|
| Primary form | Python framework / library | Command-line tool (CLI) |
| Install | `pip install lavague` | `npm install -g browserbash-cli` |
| License | Apache-2.0 (open source) | Apache-2.0 (open source) |
| Core idea | World Model + Action Engine generate and run automation code | AI agent drives a real browser from one English objective |
| What you get back | Executed Selenium/Playwright actions (code-centric) | Verdict + structured `final_state` results |
| Default LLM | OpenAI `gpt-4o` (customizable) | Ollama-first (local, free); OpenRouter; Anthropic — auto-detected |
| Local / free models | Supported via configurable LLM | First-class default; free OpenRouter models too |
| Engines | Selenium / Playwright / Chrome Extension drivers | Stagehand (default, MIT) and builtin (Anthropic tool-use loop) |
| Machine output | Scriptable (it's a library) | `--agent` NDJSON, stable schema, exit codes 0/1/2/3 |
| Committable test format | LaVague QA: Gherkin → generated tests | Markdown `*_test.md` steps with `@import` + `{{variables}}` |
| Cloud grids | Wherever your driver points (configured in code) | One flag: `--provider lambdatest`/`browserstack`/`browserbase`/`cdp` |
| Recording | Depends on your driver/tooling | `--record` screenshot + `.webm` video; trace on builtin |
| Best fit | Building AI web agents inside a Python app | Testing, monitoring, CI, and AI-coding-agent verification |

If you want the runnable command reference for everything in the BrowserBash column, it is on the [Learn page](https://browserbash.com/learn), and the package itself is on [npm](https://www.npmjs.com/package/browserbash-cli).

## When to choose LaVague

Reach for LaVague when the agent is a feature of *your* product, not just a test runner. If you are a Python team building an application where end users describe tasks and an agent carries them out in a browser — and you want the World Model / Action Engine architecture to extend, the generated webdriver code as a real artifact, and full control of the orchestration in your own codebase — a framework is the right tool. You are explicitly choosing to own integration in exchange for depth and flexibility.

LaVague also makes sense when you are already standardized on Python and Selenium/Playwright and want an AI layer that produces and runs code in that same world, or when the Gherkin-to-test path of LaVague QA matches how your team already specifies behavior. The framework shape that costs you assembly time is the same shape that lets you bend it to a product you are shipping.

## When to choose BrowserBash

Reach for BrowserBash when you want a browser check to behave like a Unix tool: one command in, a clear verdict out, trivially scriptable. The sweet spots are concrete. Smoke and journey tests you need today without writing page objects. Synthetic monitoring where a plain-English objective beats a brittle selector script. CI gates that key off an exit code instead of parsed logs. And — increasingly the headline use case — letting an AI coding agent verify its own UI changes in a real browser by calling `--agent` and reading NDJSON, so it never declares victory blind.

It is also the lower-friction choice when "free and local" matters from minute one. The Ollama-first default means no API keys and nothing leaving your machine; OpenRouter's free models and bring-your-own Claude are there when you want more capability, switchable per run with `--model`. You install one global npm package and you are running sentences, with cloud grids, recordings, Markdown tests, and an optional dashboard available when you grow into them — without standing up a framework first.

A fair summary: LaVague optimizes for *building agents that generate and run browser code inside an application*; BrowserBash optimizes for *running and verifying browser flows from the terminal and CI with as little ceremony as possible*. Many teams could even use both — LaVague where an agent ships as a product feature, BrowserBash where browser checks need to gate a pipeline.

## A note on honesty about AI agents

Both tools inherit the same caveat, and pretending otherwise helps nobody: an LLM plans at run time, so AI-driven browser automation is goal-deterministic, not path-deterministic. Two runs may take slightly different routes to the same outcome. That is true of any World Model and true of any agentic CLI. BrowserBash narrows the gap with explicit `verify` clauses, a `--max-steps` cap, a `--timeout`, and exit codes as the contract — which is exactly why it is comfortable for smoke and journey gates but is not a drop-in for trace-identical compliance suites. Whichever side of "LaVague vs BrowserBash" you land on, design your assertions and bounds deliberately rather than trusting a model to be perfectly repeatable. That clarity is worth more than any marketing claim.

## FAQ

### Is BrowserBash a drop-in replacement for LaVague?

Not exactly, because they produce different things. LaVague is a Python framework whose agent generates and runs Selenium/Playwright code, ideal for embedding an AI web agent inside an application. BrowserBash is a CLI that drives a real browser from one sentence and returns a pass/fail verdict plus structured results, ideal for testing, monitoring, and CI. If your goal is verifying flows from the terminal, BrowserBash replaces a lot of glue; if your goal is shipping an agent as a product feature in Python, LaVague's framework model is the better fit.

### Do both tools support local and free models?

Yes, from different starting points. LaVague defaults to OpenAI's `gpt-4o` but is explicitly customizable, so you can configure other models. BrowserBash is Ollama-first by design — it auto-detects a local Ollama install before anything else, so the default path is free, local, and key-free — and additionally supports OpenRouter (including free models) and Anthropic Claude with your own key, switchable per run with `--model`.

### Which is better for CI pipelines and AI coding agents?

BrowserBash is purpose-built for that. The `--agent` flag emits NDJSON with a stable schema, and the process exit code is the verdict — `0` passed, `1` failed, `2` error, `3` timeout — so a CI job or supervising agent reads the result without parsing prose. A general framework like LaVague can be scripted, but standardized machine output plus exit codes is plumbing BrowserBash ships specifically for callers that are programs, not people.

### Are both projects open source and free to start?

Yes. LaVague is open source under Apache-2.0 and installable via `pip install lavague`. BrowserBash is free and open source under Apache-2.0, installable via `npm install -g browserbash-cli`, built by The Testing Academy. BrowserBash keeps everything local by default — nothing leaves your machine unless you explicitly pass `--upload` to push a run to the optional cloud dashboard.

---

Ready to try the CLI side of this comparison? Create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up), then `npm install -g browserbash-cli` and run your first sentence against a real browser. BrowserBash is free and open source (Apache-2.0) — start local with no API keys, and reach for the cloud dashboard, grids, and recordings only when you want them.
