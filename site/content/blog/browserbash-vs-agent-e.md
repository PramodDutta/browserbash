---
title: Agent-E vs BrowserBash: Research Agent or Production CLI
description: "Agent-E browser automation compared with BrowserBash: a research multi-agent web agent vs a free, npm-installable CLI with exit codes, recordings, and a QA dashboard."
date: 2026-02-03
category: agents
---

If you have been reading papers on autonomous web agents, you have probably bumped into Agent-E. It is one of the most-cited examples of agent-e browser automation: a hierarchical, multi-agent system that navigates real websites, distills the DOM into something a model can reason about, and pushes the published numbers on web-navigation benchmarks. It is genuinely impressive research. But there is a gap between "a research agent that scores well on WebVoyager" and "a tool my QA team runs in CI on a Tuesday afternoon," and that gap is exactly what this comparison is about. BrowserBash sits on the other side of it: a free, open-source command-line tool you install from npm, point at a real Chrome browser with one plain-English sentence, and read back as exit codes and recordings.

Before going further, a sourcing note. Every BrowserBash claim below maps to a real flag or command you can run today. For Agent-E, this article sticks to what is publicly documented — its architecture as described in its paper and open-source repository, the fact that it came out of work associated with Emergence AI, and its positioning as a research-grade autonomous web agent. Where a detail is not publicly specified (exact current maintenance status, a hosted SLA, pricing of any commercial offering), the article says so rather than inventing it. No fabricated benchmarks, no made-up features on either side.

## What Agent-E actually is

Agent-E is an autonomous web-navigation agent built on a hierarchical, multi-agent architecture. The design splits responsibility between a planner-style agent that decides *what* to do next and a browser-navigation agent that executes the concrete actions in the page. That separation is the headline idea: rather than one model trying to both plan a multi-step task and wrangle raw HTML, Agent-E layers the problem so each agent has a tighter job.

A second core idea is **DOM distillation**. Real web pages are enormous and noisy, and feeding a raw DOM to a language model wastes tokens and confuses the planner. Agent-E processes the page into a more compact, model-friendly representation so the agent can reason about the relevant interactive elements without drowning in markup. This is a meaningful contribution, and it is one of the reasons the project gets cited when people talk about how to make web agents actually work on long, real-world tasks.

Agent-E is open source and has been used as a reference implementation and a benchmark contender — it reported strong results on web-navigation evaluations like WebVoyager when it was published. That is the right frame for it: a research artifact and a foundation other people build on, associated with the broader agent work coming out of Emergence AI. As of 2026, treat the specifics of any commercial product, hosting, or support tier around it as not publicly specified, and check the project's own repository for current status before you depend on it.

What you should take away: Agent-E is built to push the frontier of *how capably an agent can navigate the open web*. That is a different goal than "give a QA engineer a dependable pass/fail in a pipeline," and the difference shows up everywhere once you start comparing.

## What BrowserBash is

BrowserBash starts from a blunter promise. You type a plain-English objective on the command line, an AI agent drives a real Chrome or Chromium browser step by step, and you get back a verdict plus structured results. No selectors, no page objects, no framework to assemble. Install it and run a sentence:

```bash
npm install -g browserbash-cli

browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the first product to the cart, and verify the cart badge shows 1"
```

The agent re-reads the page on each run and finds the fields and buttons the way a person would. If the verification clause is false, the run fails and the exit code says so. That is the whole interface for the simple case, and the design holds that simplicity as you scale into CI, cloud grids, committable test files, and recordings.

Under the hood BrowserBash runs two engines. The default is **Stagehand**, the MIT-licensed open-source automation library from Browserbase, built around resilient, self-healing actions. The second is a **builtin** engine: an in-repo Anthropic tool-use loop that additionally captures a Playwright trace when you record. You choose per run, and you do not have to care which one to get started.

On models, BrowserBash is Ollama-first. It auto-detects a local Ollama install before anything else, so the default path is free, local, and needs no API keys — nothing leaves your machine. If you want hosted brains it also speaks OpenRouter, including genuinely free hosted models such as `openai/gpt-oss-120b:free`, and Anthropic's Claude if you bring your own key. The resolution order is local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, and a `--model` flag overrides it per run. You can read the full setup on the [BrowserBash learn pages](https://browserbash.com/learn).

It is built and maintained by The Testing Academy (founder Pramod Dutta), it is free and open source under Apache-2.0, and the latest version is 1.3.1.

## The core difference: research capability vs. production contract

This is the distinction that should drive most decisions, so it is worth stating plainly.

Agent-E optimizes for **capability on open-ended web navigation**. Its multi-agent planning and DOM distillation exist to maximize how far an autonomous agent can get on a hard, multi-step task on an arbitrary site. That is the right thing to optimize when your question is "how good can a web agent be?" — research, prototyping a product feature, exploring what is possible.

BrowserBash optimizes for a **production contract**. The question it answers is narrower and more boring: "did this specific user flow work, and how do I prove it to a pipeline?" The unit of value is a verdict — exit code `0` for passed, `1` for failed, `2` for error, `3` for timeout — plus any structured data the objective asked it to capture, plus a video you can hand to whoever asks "what actually happened?"

Neither is better in the abstract; they aim at different deliverables. If you are building or studying an autonomous agent and you want maximum navigation capability with an architecture you can extend, Agent-E's research lineage is the natural starting point. If you are an SDET who needs a flow verified from the terminal or CI every time the build runs, and you need the answer in a form a script can trust, the agent-e browser automation approach is more than you need and harder to operationalize than a CLI built for exactly that job.

## Built for machines: NDJSON and exit codes

Where BrowserBash leans hardest is being callable by other programs — CI systems and AI coding agents in particular. Add `--agent` and stdout becomes NDJSON: one JSON object per line, a stable schema, with human-readable noise pushed to stderr.

```bash
browserbash run "Open https://staging.example.com/login, log in as {{user}} with password {{password}}, and store the logged-in display name as 'name'" \
  --agent --headless --timeout 120 \
  --variables '{"user":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

Step events stream as the run proceeds, and the final line is always a single `run_end` object carrying status, a summary, `final_state` with anything you asked it to `store ... as 'name'`, duration, and step count. The process exit code mirrors the verdict, so a calling program never parses prose to know what happened. A supervising agent reads the last line with `tail -1 | jq` and trusts the exit code. Notice the credentials ride in `--variables` with `"secret": true`, which masks them as `*****` in every log line and in the NDJSON stream itself.

That machine-first contract is the heart of BrowserBash's positioning. A research agent like Agent-E can of course be wrapped in a script — it is code, you can call it — but a documented NDJSON schema plus standardized exit codes is purpose-built plumbing for "a CI job or an AI calls a browser run like a function and reads the result without guessing." It is the difference between a capability you have to harness and a contract you can rely on. There is more on wiring this into pipelines on the [BrowserBash blog](https://browserbash.com/blog).

## Feature-by-feature comparison

Here is the honest side-by-side. Anything not publicly documented for Agent-E is marked as such rather than guessed.

| Dimension | Agent-E | BrowserBash |
| --- | --- | --- |
| Primary goal | Research-grade autonomous web navigation | Production QA verification from a CLI |
| Architecture | Hierarchical multi-agent + DOM distillation | One-sentence objective → real Chrome run → verdict |
| Install / interface | Clone repo, run as Python project | `npm install -g browserbash-cli`, run `browserbash` |
| Output | Task completion / agent trajectory | Verdict + structured `final_state` + exit codes |
| CI-native contract | Not the design focus; scriptable | `--agent` NDJSON + exit codes `0/1/2/3` |
| Models | LLM-driven (configure per the project) | Ollama-first, plus OpenRouter and Anthropic |
| Local / private by default | Depends on chosen model | Yes — local Chrome, local models, nothing uploaded unless asked |
| Recordings | Not a documented first-class feature | `--record`: screenshot + `.webm` + Playwright trace (builtin) |
| Committable tests | Not its focus | `*_test.md` with `@import` and `{{variables}}` |
| Dashboard | Not publicly specified | Optional free cloud + free local `dashboard` |
| Where the browser runs | Your environment | `--provider` local / cdp / browserbase / lambdatest / browserstack |
| License | Open source (check repo) | Apache-2.0, free |

The pattern in that table is consistent. Agent-E's columns describe a capable agent you build with; BrowserBash's columns describe an operational tool you run. If you cross-reference this against the [BrowserBash features page](https://browserbash.com/features) you will see the same theme — the product is shaped around getting a flow verified and evidenced, not around maximizing raw agent autonomy.

## Recordings, traces, and the dashboard: evidence for real QA

Capability is one thing; proof is another. When a checkout test fails at 2 a.m., "the agent could not complete the task" is not a useful artifact. You need to *see* what happened. This is where BrowserBash invests and where research-first agents typically do not.

Add `--record` to any run and BrowserBash captures a screenshot and a full `.webm` session video via ffmpeg on any engine. If you are on the builtin engine, it additionally captures a Playwright trace you can open in the trace viewer and step through DOM snapshot by DOM snapshot.

```bash
browserbash run "Log in to the store, add an item to the cart, complete checkout, and verify 'Thank you for your order!'" \
  --record --engine builtin
```

For run history across many executions there are two opt-in dashboards. The fully local one needs nothing external:

```bash
browserbash dashboard
```

That serves run history and replays from your own machine. If you want a shareable cloud view — run history, video recordings, per-run replay — connect once and upload explicitly:

```bash
browserbash connect
browserbash run "Verify the pricing page loads and the Pro plan shows the annual price" --upload
```

Three honest details. The cloud dashboard is strictly opt-in: no account is needed to run BrowserBash at all, and nothing is uploaded unless you pass `--upload`. The cloud dashboard is free. And free uploaded runs are retained for 15 days, so treat the cloud as a sharing and triage layer, not a permanent archive — keep anything you need long-term locally. You can see the plan details on the [BrowserBash pricing page](https://browserbash.com/pricing).

For Agent-E, a recording-and-replay dashboard for QA workflows is not a documented first-class feature as of 2026 — which makes sense, because that is not what a research navigation agent is for. If you needed that, you would build it.

## Committable tests in plain English

Ad-hoc runs are fine for exploration. Real QA needs tests that live in the repo, get reviewed, and run the same way for everyone. BrowserBash handles this with Markdown test files — committable `*_test.md` documents where each list item is a step.

```markdown
# checkout_test.md
- Open {{base_url}}
- Log in as {{user}} with password {{password}}
- Add the first product to the cart
- Go to checkout and complete the purchase
- Verify the page shows "Thank you for your order!"
```

```bash
browserbash testmd run ./checkout_test.md \
  --variables '{"base_url":"https://shop.example.com","user":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

You get `@import` composition so shared setup (a login flow, a common header check) lives in one file and is reused across suites, and `{{variables}}` templating so the same test runs against staging and production by swapping inputs. Secret-marked variables are masked as `*****` in every log line, which matters the moment a CI log is visible to people who should not see credentials. After each run BrowserBash writes a human-readable `Result.md` you can open, diff, or attach to a ticket.

This is the part of the workflow that a research agent simply is not built to own. Agent-E is an agent; turning it into a versioned, reviewable test suite with secret masking and templating is engineering you would do yourself. With BrowserBash it is the documented happy path, and you can walk through more of it in the [BrowserBash case study](https://browserbash.com/case-study).

## Where the browser runs: providers and grids

Agent-E runs the browser in your environment. BrowserBash defaults to the same — your local Chrome, fully private — but lets you change where the browser lives with one flag. The same plain-English objective runs unchanged across providers:

- `--provider local` (default): your own Chrome, nothing leaves the machine.
- `--provider cdp`: attach to any Chrome DevTools Protocol endpoint, including a browser you already have running.
- `--provider browserbase`, `--provider lambdatest`, `--provider browserstack`: run on a hosted grid for scale or cross-environment coverage.

```bash
browserbash run "Open the login page, sign in, and confirm the dashboard greeting shows the user's name" \
  --provider lambdatest --headless --agent
```

The objective text does not change when you switch providers — only the flag does. That is the kind of operational ergonomics that matters when you go from "it works on my laptop" to "it runs on 12 browser/OS combinations in CI," and it is a deliberately product-shaped concern rather than a research one.

## An honest caveat about model size

No comparison is worth reading if it only flatters one side, so here is the real constraint with BrowserBash. The Ollama-first, $0-on-local-models story is genuine, but very small local models — roughly 8B parameters and under — can be flaky on long, multi-step objectives. They lose the plan, click the wrong thing, or declare victory early. That is not unique to BrowserBash; it is a property of small models doing hard agentic work, and it is exactly the kind of problem Agent-E's hierarchical planning was designed to mitigate at the research level.

The practical fix is to match model to task. For short, well-scoped flows a small local model is often fine and free. For longer or trickier objectives, the sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. BrowserBash makes that swap a one-flag change, so you keep your $0 default and reach for more horsepower only when a specific test needs it. Be skeptical of any tool — this one included — that claims a tiny local model nails every complex web flow every time. It does not, and saying otherwise would be dishonest.

## When to choose Agent-E

Choose Agent-E when your work is about the *agent itself*. If you are researching autonomous web navigation, benchmarking against WebVoyager-style evaluations, or building a product feature where an autonomous agent has to handle genuinely open-ended tasks on arbitrary sites, Agent-E's hierarchical architecture and DOM distillation are exactly the kind of foundation you want. You are comfortable working in the codebase, you want to extend or study the agent's reasoning, and a reusable, capable navigation primitive is the deliverable.

It is also a reasonable choice when you specifically want a multi-agent planning architecture as a reference design and intend to own the integration, the model configuration, and any tooling for evidence or CI yourself. That is real engineering, and Agent-E gives you a strong place to start.

It is the wrong choice if your actual need is "verify these ten flows on every deploy and fail the build if one breaks." You can get there with enough glue, but you would be rebuilding a CLI, an NDJSON contract, recordings, and a dashboard that already exist elsewhere.

## When to choose BrowserBash

Choose BrowserBash when you need a flow verified, evidenced, and wired into automation — not when you need to push the frontier of agent capability. It is for SDETs and developers who want to write a sentence, get a trustworthy pass/fail, see a video when something breaks, and call the whole thing from CI or an AI coding agent without parsing prose.

Concretely, reach for BrowserBash when you want to install in seconds with `npm install -g browserbash-cli`, keep everything local and free with Ollama, commit plain-English tests that your team reviews, get `--record` videos and traces for failures, and switch to a hosted grid with one `--provider` flag when you scale. The `--agent` NDJSON mode and exit codes mean a pipeline or a supervising agent treats a browser check like any other command that returns 0 or non-zero.

The fair summary: Agent-E is a research-grade agent you build with; BrowserBash is a production CLI you run with. Plenty of teams will use both — Agent-E or similar research agents to explore what is possible, BrowserBash to ship dependable QA on top of the same plain-English idea.

## FAQ

### Is Agent-E free and open source?

Agent-E is publicly available as an open-source research project associated with work from Emergence AI, and it has been used as a reference web-navigation agent and benchmark contender. Check the project's own repository for the exact license and current maintenance status, since those can change over time. BrowserBash, for comparison, is free and open source under Apache-2.0 and installable with `npm install -g browserbash-cli`.

### Can I use Agent-E for QA testing in CI?

You can script almost anything, but Agent-E is built as a research navigation agent rather than a CI-native test runner, so you would build the result-parsing, exit-code, recording, and reporting layers yourself. BrowserBash ships those out of the box: `--agent` emits NDJSON with a stable schema, exit codes are `0` passed, `1` failed, `2` error, and `3` timeout, and it writes a human-readable `Result.md` after each run. For pipeline use, that contract is the practical difference.

### Does BrowserBash need API keys or an account?

No. BrowserBash is Ollama-first and auto-detects a local model, so the default path needs no API keys and no account, and nothing leaves your machine. You only add a key if you choose a hosted model like Anthropic Claude or OpenRouter, and you only create an account if you want the optional free cloud dashboard via `browserbash connect` and `--upload`. A fully local dashboard is also available with `browserbash dashboard`.

### Which is better, Agent-E or BrowserBash?

They are built for different jobs, so "better" depends on yours. If you are researching or building autonomous web agents and want maximum navigation capability with an extensible multi-agent architecture, Agent-E is the better fit. If you are an SDET or developer who needs to verify real user flows from the terminal or CI, with recordings, secret masking, committable tests, and exit codes, BrowserBash is the better fit.

---

If your goal is dependable, evidenced QA rather than frontier agent research, install the CLI side of this comparison: `npm install -g browserbash-cli`, then run your first plain-English flow against a real browser. It is free and open source (Apache-2.0), local by default with no API keys, and you can reach for the cloud dashboard, grids, and recordings only when you want them. Create a free account — optional — at [browserbash.com/sign-up](https://browserbash.com/sign-up) when you are ready to share runs with your team.
