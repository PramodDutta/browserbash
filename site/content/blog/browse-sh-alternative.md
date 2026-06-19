---
title: A Free, Open-Source browse.sh Alternative for Driving the Browser From the CLI
description: "A free, open-source browse.sh alternative: BrowserBash drives real Chrome from the CLI in plain English, Ollama-first, with a $0 local model bill."
date: 2026-06-16
category: alternatives
---

If you landed on browse.sh, you were probably looking for a clean way to let an agent drive a browser from the terminal instead of wiring up Playwright by hand. That is exactly the itch this article is about. If you want a free, open-source browse.sh alternative that leans on plain English instead of a stack of low-level primitives, BrowserBash is built for that workflow: you write a sentence describing what you want, an AI agent drives a real Chrome browser step by step, and you get back a pass/fail verdict plus the structured values it pulled out. No selectors, no page objects, and on a local model, no model bill at all.

This is not a hit piece on browse.sh. It is a genuinely good tool from the Browserbase team, and for a lot of agent-engineering work it is the right call. The goal here is an honest side-by-side so you can pick the one that matches how you actually work. I will be precise about what is publicly documented and what is not, because guessing at a competitor's internals helps nobody.

## What browse.sh actually is

browse.sh is two things bolted together, and it helps to keep them separate in your head.

The first is the **Browse CLI** (`npm install -g browse`, command `browse`, also referenced as `bb`). It is a terminal-native tool that lets an agent drive a browser with primitives — open a page, snapshot it, click, scroll, type, hover, press keys, take screenshots, set the viewport, wait. It can fetch page content, run web searches, manage sessions and contexts, and deploy serverless browser functions. You start against a local Chrome while developing and then move the same workflow onto Browserbase's hosted browsers when you need them.

The second is the **skills catalog** at browse.sh itself: an open, curated set of 100+ reusable `SKILL.md` recipes that teach an agent how to navigate specific real-world sites. The pitch is that instead of your agent rediscovering how to log into some SaaS dashboard every time, it installs a durable playbook with one command. That catalog is a real differentiator and worth saying out loud — it is the part of the browse.sh story that BrowserBash does not try to replicate.

A few things are **not publicly specified** as of 2026, and I am not going to invent them: the exact license of the Browse CLI, its pricing model beyond "local is free, cloud is Browserbase," and whether it requires or bundles a particular LLM. The Browserbase site lists it under "Open Source" with a GitHub repo, but I will not state a specific license I cannot confirm. Where I compare on those axes below, I say "not publicly specified" rather than make something up.

## What BrowserBash is

BrowserBash is a free, open-source (Apache-2.0) command-line tool from [The Testing Academy](https://browserbash.com/features), built by Pramod Dutta. You install it with `npm install -g browserbash-cli`, the command is `browserbash`, and the current version is 1.3.1. It needs Node 18 or newer and a local Chrome for the default provider.

The core idea is different from a primitives CLI. You do not script `click` then `type` then `waitForSelector`. You write an objective in plain English, and an AI agent figures out the steps, drives a real Chrome or Chromium browser, and reports back. Here is the whole thing:

```bash
browserbash run "Go to the demo store, search for 'wireless mouse', open the first result, and tell me the price and whether it is in stock"
```

That run navigates, searches, clicks, reads the page, and returns a verdict (passed/failed) plus the structured values it extracted — the price, the stock status. There is no selector in that command because there is no selector anywhere. The agent reads the page the way a person would and decides what to do next.

The other defining choice is the model story, and it is the reason this is a real cost story and not just marketing. BrowserBash is **Ollama-first**. The default model is `auto`, and it resolves in this order:

1. A local **Ollama** server, used as `ollama/<model>` — free, no API keys, nothing leaves your machine.
2. An `ANTHROPIC_API_KEY` in your environment, resolving to `claude-opus-4-8`.
3. An `OPENAI_API_KEY`, resolving to `openai/gpt-4.1`.
4. Otherwise it errors with guidance on how to set one of those up.

Run it on a local model and your model bill is a guaranteed $0, because the inference happens on your hardware. That is the headline difference for anyone watching token spend.

I will be honest about the catch, because it matters: very small local models (8B parameters and under) are flaky on long, multi-step objectives. They lose the thread, hallucinate a step that is not on the page, or declare victory early. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. If you try to run a twelve-step checkout on a 3B model, you will have a bad time, and that is true of every NL-driven browser tool, not just this one.

## browse.sh vs BrowserBash: the honest table

Here is the side-by-side. "Not publicly specified" means exactly that — I checked and the public pages do not state it.

| Dimension | browse.sh (Browse CLI) | BrowserBash |
| --- | --- | --- |
| Install | `npm install -g browse` | `npm install -g browserbash-cli` |
| Command | `browse` / `bb` | `browserbash` |
| Interaction model | Low-level primitives (click, type, snapshot, scroll) + reusable SKILL.md recipes | Plain-English objective; agent plans and executes the steps |
| License | Listed as open source; specific license not publicly specified | Apache-2.0 |
| Cost | Local browser free; cloud via Browserbase; pricing not detailed on public pages | Free CLI; $0 model bill on local Ollama; you only pay if you opt into a hosted model |
| Required LLM | Not publicly specified | Ollama-first `auto`; or Anthropic / OpenAI / OpenRouter / Gemini if you pin one |
| Local browser | Yes (local Chrome) | Yes (your Chrome, default provider) |
| Cloud browser | Browserbase hosted | Browserbase, LambdaTest, BrowserStack, or any CDP endpoint |
| Reusable site recipes | 100+ skills catalog (a real strength) | Markdown tests (`*_test.md`), committable, with variables and imports |
| Built for CI / agents | Terminal-native, chainable | `--agent` NDJSON output, typed exit codes |
| Privacy on local model | Local browser available | Nothing leaves your machine unless you explicitly `--upload` |

The one-line summary: browse.sh is a primitives CLI plus a shared skills marketplace; BrowserBash is a natural-language agent that drives a real browser and runs free on local models. Different shapes, overlapping jobs.

## The interaction model is the real fork in the road

Everything else flows from one decision: do you want to tell the browser *how* or tell it *what*.

With a primitives CLI, you (or your coding agent) are still authoring the sequence. Open this URL, snapshot, find the search box, type into it, press Enter, wait, click the first result. That is explicit and predictable, which is genuinely valuable — you know exactly what will happen and in what order. The skills catalog softens this by packaging known sequences for known sites, so your agent does not re-derive them each time.

With BrowserBash you skip the sequence entirely. You hand over the objective and the agent decides the steps at runtime by reading the actual page. The upside is obvious: when a site ships a redesign and moves the search box, a selector-based script breaks and a plain-English objective usually does not, because "search for wireless mouse" still describes a thing the page can do. The cost is that you trade some determinism for adaptability, and you lean on the model's judgment for each step.

Under the hood, BrowserBash has two engines that interpret your English, and you pick with `--engine`:

- **`stagehand`** (the default) is the MIT-licensed library from Browserbase — yes, the same company behind browse.sh — exposing `act`, `extract`, `observe`, and `agent` primitives with self-healing behavior. It is good at recovering when the page is not quite what it expected.
- **`builtin`** is an in-repo Anthropic tool-use loop driving Playwright directly. It is used automatically for the LambdaTest and BrowserStack providers, and it writes a Playwright trace on top of the screenshots and video.

That Stagehand detail is worth dwelling on. BrowserBash's default engine is built by the same team that builds browse.sh. So this is not "our framework versus their framework" at the lowest layer — BrowserBash sits on top of Stagehand and wraps it in a plain-English CLI with the Ollama-first model resolution, a run store, markdown tests, and dashboards. If you like the Browserbase ecosystem but want an NL-first CLI that defaults to a free local model, that is a clean fit rather than a betrayal of it. There is more on the engine split and primitives in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Where the browser runs: providers

A browser-driving CLI is only as portable as the places it can run the browser. browse.sh runs locally or on Browserbase. BrowserBash gives you a wider set through `--provider`:

- `local` (default) — your own Chrome on your machine.
- `cdp` — any Chrome DevTools Protocol endpoint via `--cdp-endpoint ws://...`, which is how you point at a remote or containerized Chrome you already run.
- `browserbase` — Browserbase's hosted browsers (needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`).
- `lambdatest` — needs `LT_USERNAME` and `LT_ACCESS_KEY`, and switches to the builtin engine automatically.
- `browserstack` — needs `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`, also builtin engine.

The practical read: if your team already has a LambdaTest or BrowserStack account for cross-browser coverage, BrowserBash drops onto it without you re-platforming. And the `cdp` option means "any DevTools endpoint" — you are not locked to one cloud vendor's browsers. browse.sh's tight Browserbase integration is excellent if Browserbase is where you live; BrowserBash is more agnostic about where the pixels render.

## Cost and privacy, stated plainly

This is where the two tools differ most for a budget-conscious team, so let me be careful and fair.

browse.sh runs a local browser for free during development. Its cloud path is Browserbase, and the public pages I can see do not lay out a price for that, nor do they specify a required model — so I will not put numbers in browse.sh's mouth. If you adopt it, check Browserbase's current pricing for the hosted side yourself.

BrowserBash's cost story is concrete because the model is yours. On the default local path, the CLI is free and the inference runs on your own machine through Ollama, so the model bill is genuinely $0 — there is no token meter running. You only start paying if you *choose* to pin a hosted model (`--model claude-opus-4-8`, an OpenAI or Gemini model through Stagehand, or an OpenRouter model) for a flow your local model cannot handle. That is opt-in, per your decision, not a default. The [BrowserBash pricing page](https://browserbash.com/pricing) spells out that the tool itself is free and open source.

Privacy is the twin of cost here. On a local model with the local provider, nothing about your run leaves your machine — not the pages, not the screenshots, not the extracted values. BrowserBash only sends data off-box when you explicitly add `--upload` to push a run to the optional cloud dashboard, and that requires you to have linked an account first. Without `--upload`, nothing leaves. For anyone testing internal tools, pre-release pages, or anything behind auth that should not touch a third-party service, that default matters.

## Committable tests, not just one-off commands

A one-shot `run` is great for exploration. But if you are an SDET, you want something you can commit, review in a PR, and replay in CI. This is a place where BrowserBash adds a layer that a pure primitives CLI does not emphasize.

BrowserBash markdown tests are plain `*_test.md` files where each list item is a step written in English. They support `{{variables}}` templating and `@import` composition so you can share a login flow across suites. Variables marked as secret are masked to `*****` in every log line, and each run writes a human-readable `Result.md` you can attach to a ticket or read at a glance. You run one like this:

```bash
browserbash testmd run ./checkout_test.md
```

Because the steps are English, a non-author can read the test and understand the intent without decoding selectors. That is a real review-time win on a team. There is a fuller walkthrough on the [BrowserBash learn pages](https://browserbash.com/learn), and worked examples on the [blog](https://browserbash.com/blog).

Every run, one-shot or markdown, is also kept on disk at `~/.browserbash/runs` with secrets masked and a cap of 200 entries, so you always have local history without opting into anything cloud.

## Built for CI and AI coding agents

If your real consumer is not a human but another agent — Claude Code, Cursor, a CI job — you want machine-readable output, not prose you have to parse. browse.sh leans on this too, being terminal-native and chainable. BrowserBash's version is `--agent`:

```bash
browserbash run "Log in with the test account and confirm the dashboard shows a welcome banner" --agent --record --timeout 90
```

With `--agent`, you get NDJSON — one JSON object per line. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the terminal event is `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. Exit codes are typed: `0` passed, `1` failed, `2` error, `3` timeout. A CI step can branch on the exit code alone and never touch the prose. An orchestrating agent can read each line as it streams.

The flags in that example are the ones I reach for most. `--record` captures a screenshot and a `.webm` session video via bundled ffmpeg (and on the builtin engine, a Playwright trace), which is what you want when a flaky run needs evidence. `--timeout` caps the run in seconds so a stuck agent does not hang your pipeline. `--headless` runs without a visible window for CI. These are the real flags — there is no invented surface here.

## Dashboards: local-first, cloud optional

You do not need an account to use BrowserBash at all. But when you want a UI over your runs, there are two, and the default one is fully local:

- `browserbash dashboard` opens a local dashboard at `localhost:4477`. It reads your on-disk run store, runs entirely on your machine, and `--clear` wipes the store if you want a clean slate. You can also pop it open for a single run with `--dashboard`.
- The cloud dashboard is opt-in. You link it with `browserbash connect --key bb_...` and then add `--upload` per run to push that run up. Free cloud runs are kept for 15 days. Without `connect` and `--upload`, nothing is uploaded.

That ordering — local by default, cloud only if you ask — is the same principle as the model and privacy story. The free path is the complete path; the cloud is an add-on, not a gate.

## When to choose browse.sh

I would genuinely reach for browse.sh over BrowserBash when:

- **You want the skills catalog.** If your agent needs to navigate a long tail of specific third-party sites and you would rather install a vetted `SKILL.md` than have a model rediscover each one, that catalog is the whole point and BrowserBash has no equivalent.
- **You are already deep in Browserbase.** Sessions, contexts, serverless browser functions, hosted browsers — if that is your platform, the Browse CLI is the native citizen and the integration is tighter.
- **You want explicit, deterministic primitives.** If you prefer to author the exact click/type/snapshot sequence and know precisely what will run, a primitives CLI gives you that control directly, without delegating step planning to a model.

That is a real set of strengths. If those describe you, use browse.sh and do not look back.

## When to choose BrowserBash

Reach for BrowserBash when:

- **You want a $0 model bill.** Ollama-first means local inference and no token meter. For high-volume runs or budget-tight teams, that is decisive.
- **You want plain English, not selectors.** Writing "search for a product and read the price" beats authoring a primitive sequence, and it survives redesigns better.
- **Privacy is non-negotiable.** Local model plus local provider means nothing leaves your machine unless you explicitly `--upload`. Good for internal tools and pre-release pages.
- **You live in CI or drive it from another agent.** NDJSON output and typed exit codes are built for that, no prose parsing.
- **You want committable, reviewable tests.** Markdown tests with masked secrets and a human-readable `Result.md` fit a normal PR workflow.
- **You want vendor-flexible browsers.** Local, any CDP endpoint, Browserbase, LambdaTest, or BrowserStack, switched with one flag.

And the honest caveat once more so nobody is surprised: pair it with a mid-size local model or a capable hosted one for hard, long flows. An 8B model will frustrate you on a twelve-step objective. Read the [case studies](https://browserbash.com/case-study) for the kinds of flows that hold up well in practice.

## A realistic adoption path

If you are migrating off a primitives mindset, here is the order I would do it in. Start with one exploratory `run` against a flow you know well, on a local Ollama model, just to feel the plain-English loop. Then convert that flow into a `*_test.md` so it is committable and reviewable. Add `--record` so you have video and screenshots when something goes sideways. Wire it into CI with `--agent` and branch on the exit code. Only then, if a particular flow is too hard for your local model, pin a hosted model for that one flow with `--model`. You will end up paying for inference only on the runs that actually need it, which is the whole economic argument.

## FAQ

### What is the best free, open-source browse.sh alternative?

BrowserBash is a free, Apache-2.0 licensed, natural-language browser automation CLI that works well as a browse.sh alternative for people who want to drive a real Chrome browser from the terminal. Instead of low-level primitives, you write a plain-English objective and an agent executes it. Because it is Ollama-first, you can run it on a local model with a guaranteed $0 model bill, and the tool itself is free to install with `npm install -g browserbash-cli`.

### Does BrowserBash require an API key or a paid model?

No. The default `auto` model resolution prefers a local Ollama server, which needs no API keys and keeps everything on your machine. If you do not have Ollama, it will use an Anthropic or OpenAI key from your environment if one is present, or guide you to set one up. You only pay for inference if you deliberately pin a hosted model for a hard flow.

### How is BrowserBash different from the browse.sh Browse CLI?

The Browse CLI drives the browser with explicit primitives (click, type, snapshot, scroll) and pairs them with an open catalog of reusable site skills. BrowserBash instead takes a plain-English objective and lets an AI agent plan and run the steps against a real page, returning a verdict plus extracted values. BrowserBash is Apache-2.0 and Ollama-first; browse.sh's specific license and required model are not publicly specified as of 2026.

### Can I run BrowserBash in CI and on cloud browsers?

Yes. The `--agent` flag emits NDJSON with typed exit codes (0 passed, 1 failed, 2 error, 3 timeout), which is built for CI pipelines and AI coding agents. For where the browser runs, you can use your local Chrome, any CDP endpoint, Browserbase, LambdaTest, or BrowserStack, switching with the `--provider` flag without rewriting your tests.

## Try it

If a plain-English, local-first, $0-model-bill workflow sounds like the browse.sh alternative you were after, it is one command away:

```bash
npm install -g browserbash-cli
```

You do not need an account to run it. If you later want the cloud dashboard and shared run history, you can [sign up here](https://browserbash.com/sign-up) — but the free local path is the complete tool, and it always will be.
