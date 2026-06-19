---
title: Free, Open-Source Terminal Browser Agent: Bring Your Own Model
description: "A free open source terminal browser agent that runs in your shell, drives real Chrome, and lets you bring your own model via Ollama or OpenRouter."
date: 2026-05-29
category: alternatives
---

If you are shopping for a free open source terminal browser agent, you have probably already noticed the pattern. Most of the polished options either lock you into one model vendor, route every page through someone else's cloud, or quietly meter your runs. The thing that drew you to a terminal-first tool in the first place — control — gets diluted the moment a hosted agent decides which LLM you may use and where the browser actually runs. This guide is for the person comparing those hosted agents and wondering whether there is a self-hosted, bring-your-own-model path that does not hand the keys to a vendor.

There is, and I work on one of them, so read the BrowserBash sections as the vendor talking. I have tried to keep the rest honest, including the spots where another tool is the better pick. The short version: BrowserBash is an Apache-2.0 CLI that runs in your shell, drives a real Chrome browser from a plain-English objective, and resolves models in an Ollama-first order so the default path costs you nothing and sends nothing off your machine. You can pin a hosted model when you want one, but you are never forced to.

## What "terminal browser agent" should actually mean

The phrase gets used loosely, so let me pin it down before comparing anything. A terminal browser agent is three things stacked together:

1. **A command-line entry point.** You invoke it from a shell, pipe it, script it, drop it into CI. No Electron window, no SaaS dashboard you have to keep open, no browser extension you click.
2. **A real browser underneath.** Not an HTTP client pretending to be a browser. An actual Chrome or Chromium instance that renders JavaScript, holds cookies, runs the same engine your users run.
3. **An agent loop.** You give it an objective in English — "log in, open billing, confirm the plan says Pro" — and a model decides each step: navigate, click, type, read, repeat, until the goal is met or it gives up.

Stack those three and you get something genuinely useful for testing, scraping, monitoring, and filling repetitive web forms. The trouble is that the "agent loop" part needs a language model, and that is exactly where most products quietly take control away from you. Some ship their own tuned model and bill per run. Some let you pick a model but only from a cloud menu. Some run the browser on their infrastructure so your session, your cookies, and your data leave your laptop on every single task.

A *free, open-source* terminal browser agent should let you opt out of all three of those. That is the bar this article holds every tool to.

## Why "bring your own model" is the whole game

"Bring your own model" (BYO-model, or BYOM) sounds like a checkbox feature. It is closer to a philosophy, and it changes the economics and the risk profile of everything downstream.

Consider the failure modes you are insuring against:

- **Pricing changes.** A hosted agent reprices, adds a seat minimum, or sunsets the free tier. If your automation is welded to their model and their runtime, you migrate under duress.
- **Model deprecation.** The specific model your flows were tuned against gets retired. With BYOM you swap the model string and keep going. Without it you wait for the vendor.
- **Data residency.** Your objective might touch a staging environment with real customer records, an internal admin tool, or a logged-in account. If the only way to run is "our cloud," that data crosses a boundary you may not be allowed to cross.
- **Cost at scale.** One demo run is cheap. Ten thousand monitoring runs a month against a frontier API is a budget line. A capable local model on hardware you already own is a flat $0 per run after setup.

BYOM is the lever that lets you tune all of these per task. A throwaway smoke test against a public marketing site? Run it on a local model, free, offline-friendly. A gnarly multi-step checkout against a flaky third-party payment page? Pin a capable hosted model for that one run and eat the API cost where it actually buys you reliability. The point is that *you* make that call, run by run, not a vendor's pricing page.

This is where BrowserBash's model story matters. The default model is `auto`, and it resolves in a deliberate order:

1. A local **Ollama** server, if one is running, as `ollama/<model>` — free, no keys, nothing leaves the machine.
2. Otherwise `ANTHROPIC_API_KEY` if set, mapping to `claude-opus-4-8`.
3. Otherwise `OPENAI_API_KEY`, mapping to `openai/gpt-4.1`.
4. Otherwise a clear error that tells you how to fix it.

Ollama-first is the deliberate choice. The path of least resistance is the free, local, private one. You have to opt *in* to spending money, not opt out.

## Installing and running it in under a minute

There is no account, no sign-up wall, and no key required to get a first run on the board. If you have Node 18 or newer and Chrome installed, this is the whole onboarding:

```bash
npm install -g browserbash-cli
browserbash run "go to news.ycombinator.com and tell me the top story title"
```

That is the full loop. The CLI launches your local Chrome, an agent reads the page, takes steps, and prints a verdict plus any structured values it extracted. With a local Ollama model resolved by `auto`, that run cost you nothing and sent nothing anywhere.

If you want to bring a specific model instead of letting `auto` decide, you pin it with `--model`. Three common BYOM shapes:

```bash
# Free + local: a mid-size model served by Ollama
browserbash run "log in and confirm the dashboard greeting" --model ollama/qwen3

# Bring your own OpenRouter key: any vendor/model OpenRouter exposes
browserbash run "extract all pricing tiers as JSON" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct

# Bring a hosted Anthropic model for a hard multi-step flow
browserbash run "complete the 3-step signup and report the final URL" --model claude-opus-4-8
```

OpenRouter is the interesting one for BYOM specifically, because a single `OPENROUTER_API_KEY` gives you a menu of vendors and open-weight models behind one billing relationship. You can point BrowserBash at a Llama, a Qwen, a Mistral, or a frontier model without juggling four separate provider accounts. And if you run an Anthropic-compatible gateway in-house, you can route through it by setting `ANTHROPIC_BASE_URL` — useful for teams that proxy all LLM traffic through a single audited endpoint.

The [features page](https://browserbash.com/features) has the full surface, and the [tutorials](https://browserbash.com/tutorials) walk through first runs end to end if you want a guided start.

## The honest caveat: small local models are flaky on long flows

I am not going to pretend local-and-free is a free lunch on every task. It is not.

Very small local models — roughly 8 billion parameters and under — are genuinely flaky on long, multi-step objectives. They lose the thread halfway through a checkout, hallucinate a button that is not there, or declare victory on step two of a six-step flow. For a one-shot "read this number off this page" task, a small model is fine and fast. For "log in, navigate three menus deep, fill a form, submit, and verify a confirmation," they fall over often enough that you will not trust the result.

The sweet spot for local is a mid-size model — think Qwen3 or a Llama 3.3 70B-class model — which has enough reasoning headroom to hold a multi-step plan together. That is a real hardware ask; you need a machine that can serve a 70B-class model at usable speed. If you do not have that, the honest answer is to pin a capable hosted model for the hard flows and keep local for the cheap, short ones. BYOM is exactly what lets you make that trade per run instead of being stuck on one side of it.

I would rather tell you this up front than have you blame the tool when an 8B model wanders off mid-checkout. The agent is only as good as the brain you give it.

## How BrowserBash compares to other open-source terminal browser agents

There is a real and healthy field of open-source browser agents in 2026. The most-cited are **browser-use** (Python), **Stagehand** (TypeScript, by Browserbase), and **Skyvern**. All three are legitimate and well-built. Here is an honest, fact-checked snapshot of where each sits on the dimensions a BYOM searcher cares about. Where a detail is not publicly nailed down, I say so rather than guess.

| Tool | Primary form factor | License | Local model path | Built-in CLI verdict / exit codes | Where the browser runs by default |
|------|--------------------|---------|------------------|-----------------------------------|-----------------------------------|
| **BrowserBash** | CLI (`browserbash run`) | Apache-2.0 | Ollama-first by default; OpenRouter, Anthropic, OpenAI, or in-house gateway | Yes — verdict + NDJSON `--agent` mode, exit codes 0/1/2/3 | Your local Chrome |
| **browser-use** | Python library | Open source (MIT, as of 2026) | Yes, via Ollama and LangChain providers | Library-level; you wire your own CI contract | Local Playwright browser you launch |
| **Stagehand** | TypeScript library | MIT | Ollama documented but "not recommended"; works best with hosted LLMs | Library-level; you build the harness | Local or Browserbase cloud |
| **Skyvern** | Service + library | Open source (AGPL-style, as of 2026) | Yes, via Ollama / LiteLLM / OpenAI-compatible endpoints | Service-oriented; API-driven | Self-hosted or their cloud |

A few honest reads of that table:

**browser-use is the better pick if you live in Python and want full agent autonomy as a library.** It has strong Ollama support, a large community, and gives you raw control over the loop. If you would rather import a package and write Python than invoke a CLI, start there. BrowserBash is a CLI-first tool; that is a different ergonomic preference, not a quality gap.

**Stagehand is excellent if you want hybrid AI-plus-code control in TypeScript** and you are comfortable on hosted models. As of 2026 its own docs list Ollama as supported-but-not-recommended, so if your hard requirement is "must run great on a local model," that is a point against it for your use case specifically. Notably, BrowserBash *uses* Stagehand as its default engine — more on that next — so this is less a rivalry than a layering.

**Skyvern shines as a self-hosted service** with strong local-model flexibility via LiteLLM. If you want an API-driven service you run on your own infrastructure rather than a CLI on a developer laptop, Skyvern is squarely aimed at you.

So where does BrowserBash earn its place? It is the option that is a *finished CLI* out of the box — verdicts, exit codes, recorded sessions, committable tests — with an Ollama-first default and a BYOM menu that spans local and hosted without you wiring any of it. You are not assembling a harness; you are running a command. For a fuller field comparison, the [blog](https://browserbash.com/blog) has several head-to-head pieces.

### Engines and providers: two axes, not one

One thing that trips people up: in BrowserBash, *who interprets the English* and *where the browser runs* are separate choices.

The **engine** is the interpreter. The default is `stagehand` (MIT, by Browserbase) with its act/extract/observe/agent primitives and self-healing behavior. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright, which is auto-selected for LambdaTest and BrowserStack grids. Switch with `--engine stagehand|builtin`.

The **provider** is where the browser actually lives. The default is `local` — your own Chrome. You can also point at any DevTools endpoint with `cdp` and `--cdp-endpoint ws://...`, or run on Browserbase, LambdaTest, or BrowserStack with the appropriate credentials. For a BYOM, privacy-first setup, the defaults — `local` provider, `auto` (Ollama-first) model — are exactly what you want. Nothing about the local path requires any cloud account at all.

## No-vendor-lock-in checklist

If avoiding lock-in is the reason you are reading this, here is the concrete checklist. A tool that passes all of these is genuinely hard to get trapped by:

- **Permissive license.** BrowserBash is Apache-2.0. You can read it, fork it, ship it inside your own product. The source lives on [GitHub](https://github.com/PramodDutta/browserbash).
- **No mandatory account.** You can install from [npm](https://www.npmjs.com/package/browserbash-cli) and run forever without signing up for anything.
- **Local-by-default execution.** The browser runs on your machine; with a local model, the objective and the page data never leave it. The `--upload` flag is opt-in per run, and without it nothing is transmitted.
- **Model portability.** Ollama, OpenRouter, Anthropic, OpenAI, or an Anthropic-compatible gateway. Swap the `--model` string and you are on different infrastructure with zero code changes.
- **Committable artifacts you own.** Markdown tests (`*_test.md`) live in your repo. Runs are stored on disk at `~/.browserbash/runs`. There is no proprietary format holding your test suite hostage in someone's cloud.

That last point matters more than it looks. Markdown tests are plain files: each list item is a step, `{{variables}}` template values in, `@import` composes shared flows, and secret-marked variables are masked as `*****` in every log line. After each run BrowserBash writes a human-readable `Result.md`. You can diff these, review them in a PR, and run them on any machine that has the CLI. That is the opposite of lock-in.

```bash
# Run a committed markdown test suite — same on your laptop and in CI
browserbash testmd run ./login_test.md
```

## Privacy, dashboards, and what leaves your machine

A fair question for any agent that touches logged-in sessions: what actually gets transmitted? With BrowserBash the answer is deliberately boring.

On the default local path — `local` provider plus an Ollama model — nothing leaves your machine. The browser is yours, the model is yours, the run store is a folder on your disk. There is no telemetry beacon you have to trust.

If you *want* a UI, there is a free local dashboard. Run `browserbash dashboard` and it serves at `localhost:4477`, fully local, reading the same on-disk run store. No account, no cloud. There is also an optional **cloud** dashboard for teams who want shareable runs: you link it once with `browserbash connect --key bb_...`, and then push individual runs with `--upload`. Free cloud runs are kept 15 days. The critical detail is that uploading is per-run and opt-in — if you never pass `--upload`, nothing is pushed, full stop. The [pricing page](https://browserbash.com/pricing) lays out the cloud side honestly; the local side is free and always will be.

```bash
# Record a run (screenshot + .webm video), keep it entirely local
browserbash run "walk the full checkout and verify the order total" --record

# Open the local dashboard for this run — nothing uploaded
browserbash run "smoke test the homepage" --dashboard
```

The `--record` flag writes a screenshot and a `.webm` session video via bundled ffmpeg; on the builtin engine it also writes a Playwright trace. These land on your disk, not a server.

## Wiring it into CI and AI coding agents

The terminal-first design pays off most when you stop running it by hand. Two integration points make BrowserBash comfortable in automated pipelines.

First, **`--agent` mode emits NDJSON** — one JSON object per line, no prose to parse. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}` and the terminal event is a `run_end` object with a status, a summary, and a `final_state`. Exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. That contract is built for two consumers — a CI job that gates on the exit code, and an AI coding agent that needs structured output it can reason about without scraping human text.

```bash
# CI-friendly: structured NDJSON, exit code gates the build
browserbash run "verify the signup form rejects a blank email" --agent --headless
```

Second, because the model is BYO, your CI can run on whatever is cheapest and most appropriate for that pipeline. A nightly smoke suite against public pages can run on a local Ollama box for $0. A pre-release gate against a tricky third-party flow can pin a hosted model for that job only. You set the `--model` per command, so different pipelines can make different cost-versus-reliability calls without forking your tests.

If you are pairing this with an AI coding agent that writes and runs browser checks for you, the NDJSON contract plus committable markdown tests is the combination that makes the loop reliable. The [learn hub](https://browserbash.com/learn) goes deeper on the agent-mode event schema, and there are real-world write-ups on the [case study page](https://browserbash.com/case-study).

## When to choose a BYO-model terminal agent — and when not to

Let me be balanced about this, because the honest answer is "it depends on the task."

**Choose a free, open-source, BYO-model terminal agent like BrowserBash when:**

- You want runs that cost $0 and stay on your machine for the bulk of your work.
- You care about not being locked to one model vendor or one cloud runtime.
- You live in the terminal and want CI-grade output (exit codes, NDJSON) without building a harness.
- Your tasks touch logged-in sessions or sensitive environments where data residency matters.
- You have, or can pin, a capable-enough model — mid-size local for hard flows, or a hosted model when you choose.

**Lean toward a different tool when:**

- You want a Python library you import and drive yourself — **browser-use** is the cleaner fit.
- You want tight AI-plus-code hybrid control in TypeScript and are happy on hosted models — **Stagehand** is purpose-built for that (and BrowserBash runs on it under the hood).
- You want a self-hosted *service* with an API rather than a developer-laptop CLI — **Skyvern** is aimed there.
- Your tasks are full desktop automation, not browser-only — none of these replace a computer-use-class agent for driving native apps.

The reason BYOM matters across all of these is that it removes the single worst migration risk: being unable to leave. With a permissive license, local execution, and a swappable model string, the cost of changing your mind later is low. That is the real product, more than any single feature.

## FAQ

### Is BrowserBash really free to use?

Yes. The CLI is Apache-2.0 licensed and free to install from npm with no account required. On the default local path — your own Chrome plus a local Ollama model — there is no model bill at all, because nothing is sent to a paid API. You only pay if you deliberately pin a hosted model like Claude or an OpenRouter vendor for a given run.

### Can I run a terminal browser agent fully offline with my own model?

Largely, yes. With Ollama serving a model on your machine and the default `local` provider, the agent loop and the browser both run locally, so no LLM traffic leaves your laptop. The honest limit is that the agent still needs internet to reach the actual websites you are automating, and very small local models struggle with long multi-step objectives — a mid-size model is the sweet spot.

### What does bring-your-own-model mean for cost and lock-in?

Bring-your-own-model means you supply the LLM rather than the tool dictating one. You can route through Ollama for free local runs, OpenRouter for many vendors under one key, Anthropic or OpenAI directly, or an in-house gateway. Because you swap a single `--model` string with no code changes, you are not tied to any one vendor's pricing or model lifecycle, which is the core of avoiding lock-in.

### How is this different from browser-use, Stagehand, or Skyvern?

All four are legitimate open-source browser agents, and BrowserBash actually uses Stagehand as its default engine. The difference is form factor and defaults: BrowserBash is a finished CLI with built-in verdicts, exit codes, NDJSON output, and committable tests, defaulting to a private, Ollama-first, local-Chrome path. browser-use is a Python library, Stagehand a TypeScript library that leans on hosted models, and Skyvern a self-hosted service — pick by which shape fits your workflow.

Ready to try a BYO-model terminal browser agent? Install it and run your first objective in under a minute:

```bash
npm install -g browserbash-cli
```

No account is needed to run locally. If you later want shareable cloud runs, you can [sign up](https://browserbash.com/sign-up) — but it stays entirely optional.
