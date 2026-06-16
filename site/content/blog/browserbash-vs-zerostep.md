---
title: ZeroStep vs BrowserBash: AI Steps Inside Playwright or CLI
description: "A ZeroStep alternative compared: in-framework ai() helpers for Playwright versus BrowserBash's standalone, local-first natural-language browser CLI."
date: 2026-02-26
category: comparison
---

If you already write Playwright tests and you want AI to take over the brittle parts, you have two very different shapes to choose from. ZeroStep bolts AI directly into your existing Playwright (or Jest) suite through `ai()` calls, so a single flaky step becomes a plain-English instruction inside code you already maintain. BrowserBash goes the other way: it is a standalone, natural-language browser automation CLI where the whole test is the objective, no Playwright file required. This is the honest ZeroStep alternative comparison for engineers deciding between an in-framework helper and a self-contained plain-English runner — what each one is actually good at, and where the other genuinely wins.

The decision is not "which is better." It is "which shape fits how your team already works." If you have a mature Playwright codebase and only want to soften the worst selectors, an in-framework helper is the lighter touch. If you want a test you can describe in one sentence, run with no selectors and no code, and keep model inference free and local, a standalone runner is the better fit. Let's get specific.

## What each tool actually is

**ZeroStep** is an AI plugin for Playwright (and Jest) that introduces an `ai()` function into your test files. Instead of writing `await page.locator('[data-testid="submit"]').click()`, you write something like `await ai("click the submit button", { page, test })`, and ZeroStep figures out the element at runtime by sending page context to its backend and translating your instruction into concrete browser actions. It is published as an open-source npm package by Reflect (the team behind the Reflect no-code testing product). The defining property is that it lives *inside* your Playwright test — you keep your test runner, your fixtures, your assertions, your CI config, your reporters. ZeroStep just replaces the selector-finding step with a natural-language one. Exact backend model details and the current state of its hosted service are not always fully specified in public docs, so treat anything beyond "it sends page context to a remote service to resolve `ai()` calls" as something to verify against its repo and pricing page at the time you adopt it.

**BrowserBash** is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy, founded by Pramod Dutta. The model is different at the root: you do not embed AI into a Playwright file — you write a plain-English objective and an AI agent drives a real Chrome or Chromium browser step by step, then returns a verdict plus structured results. No selectors, no page objects, no test file scaffolding. It installs with `npm install -g browserbash-cli`, the command is `browserbash`, and the latest version is 1.3.1. The headline architectural choice is that it is Ollama-first: it defaults to free local models, needs no API keys, and nothing leaves your machine unless you opt in. You can read the full feature tour on the [BrowserBash learn page](https://browserbash.com/learn).

So the split is clean. ZeroStep makes your existing Playwright tests smarter, one call at a time. BrowserBash replaces the test file entirely with an objective. Both kill selectors; they just kill them at different altitudes.

## The core architectural difference: in-framework vs standalone

This is the whole comparison in one line, so it's worth slowing down on.

ZeroStep is a **dependency you add to a Playwright project**. Your test still looks like a Playwright test. You still run `npx playwright test`. You still get Playwright's trace viewer, its retries, its parallelism, its HTML reporter. The `ai()` calls are surgical: you reach for them only on the steps where selectors hurt, and you leave the rest of your Playwright code exactly as it is. That is a genuine strength. If you have hundreds of stable tests and a handful of flaky ones, you do not rewrite anything — you swap a brittle locator for an `ai()` line and move on. The blast radius is tiny.

BrowserBash is a **self-contained runner**. There is no Playwright file to host it in; the objective *is* the test. You hand it a sentence — "log in as the demo user, add a laptop to the cart, check out, and confirm the order succeeded" — and the agent reads the page, decides what to click, and tells you whether it worked. The cost is that you are not extending an existing Playwright suite; the benefit is that there is nothing to extend. No page objects to keep current, no selector layer to maintain, no test scaffolding to write before you can describe a flow. For teams that do not already live in Playwright, or who want a smoke test in sixty seconds, that is a much lower starting cost.

Here's the practical tell. If your answer to "where does the test live?" is "in our Playwright repo, next to the other tests," ZeroStep slots in cleanly. If your answer is "I just want to describe the flow and get a pass/fail," BrowserBash is built for exactly that.

## Side-by-side comparison

| Dimension | ZeroStep | BrowserBash |
| --- | --- | --- |
| Shape | `ai()` helper inside Playwright / Jest | Standalone natural-language CLI |
| Test artifact | Your existing Playwright test file | A plain-English objective (or `*_test.md`) |
| Selectors required | No (for `ai()` steps) | No |
| Where the model runs | Remote service resolves `ai()` calls | Ollama-first: local by default, no keys |
| Bring-your-own-key | Not the primary model story | Anthropic or OpenRouter (incl. free hosted) |
| $0 model bill possible | Not publicly guaranteed | Yes, on local models |
| Browser | Playwright-driven Chromium | Real Chrome/Chromium; CDP, cloud providers |
| Account to run | Service/credentials as documented | None to run; cloud dashboard opt-in |
| CI output | Playwright reporters | NDJSON agent mode + exit codes 0/1/2/3 |
| Recordings | Via Playwright trace | `--record` screenshot + `.webm`; trace on builtin |
| License | Open source (verify current terms) | Apache-2.0 |

A note on honesty: some ZeroStep cells say "verify" or "as documented" on purpose. Its service model, pricing, and backend model have shifted over its lifetime and are not always pinned down in public materials as of 2026. I'd rather flag that than invent a number. Check the repo and its pricing page before you commit a suite to it.

## Models and cost: the divide that shows up on the invoice

This is where the two tools diverge most in day-to-day economics.

BrowserBash is **Ollama-first**. Out of the box it prefers a free local model on your own hardware — no API keys, no per-token cost, no data egress. It auto-resolves the model layer in a fixed order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. Beyond local models it supports OpenRouter, including genuinely free hosted models such as `openai/gpt-oss-120b:free`, and Anthropic's Claude directly if you bring your own key. The practical upshot: you can run an entire suite at zero marginal model cost and switch brains per run with a single flag when a flow needs more horsepower. The default position of the cost lever is free, and you hold the lever.

ZeroStep resolves `ai()` calls by sending page context to a remote service. That means the model layer is part of a hosted offering rather than a "point it at my own Ollama" arrangement you control end to end. What that costs, and whether a free tier exists at the volume you need, is something to confirm on its pricing page at adoption time rather than take on faith here — I won't fabricate a figure. The architecturally important point stands regardless of the exact price: with ZeroStep, page content and instructions travel to a remote service to be resolved; with BrowserBash on local models, prompts and page content can stay entirely on your machine.

Two consequences follow. On **predictability of cost**, BrowserBash lets you guarantee a $0 model bill by staying local — useful for high-volume suites or budget-constrained teams. On **data residency**, the local-model default means sensitive page content never has to leave the box, which matters for regulated apps. If neither is a constraint and you'd rather not run a local model at all, a managed remote resolver is a legitimately nicer experience: no GPUs, no model pulls, no wondering which local model is reliable.

### The honest caveat on local models

In the interest of credibility: very small local models — roughly 8B parameters and under — can be flaky on long, multi-step objectives. The free path is real, but the sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model when a flow is genuinely hard. BrowserBash hands you the lever; you still have to pull it thoughtfully. ZeroStep sidesteps this by resolving steps remotely, which is a fair point in its favor if you don't want to think about model selection at all.

## Where the browser runs and what you get back

ZeroStep drives the Chromium that Playwright drives. That's both a constraint and a gift: you inherit Playwright's whole runtime — its waiting, its tracing, its parallel workers — but you're also tied to it. Your recordings come from Playwright's trace viewer, your reports from Playwright's reporters.

BrowserBash is more flexible about *where* the browser lives. The default provider is `local` (your own Chrome), but one `--provider` flag switches the execution target to `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, or `browserstack`. So you can develop against your local Chrome and then run the identical objective on a cloud grid for cross-browser coverage without rewriting a thing. Under the hood it offers two engines: `stagehand` (the default, MIT-licensed, by Browserbase) and `builtin` (an in-repo Anthropic tool-use loop).

On artifacts, BrowserBash's `--record` flag captures a screenshot *and* a full `.webm` session video via ffmpeg on any engine; the builtin engine additionally writes a Playwright trace you can open in the trace viewer. So even though BrowserBash is not a Playwright plugin, you can still land on a Playwright trace when you want one. There's a deeper tour of these on the [features page](https://browserbash.com/features).

## CI and AI-agent integration

If you're wiring either tool into a pipeline, the integration stories differ in kind.

ZeroStep's CI story is Playwright's CI story. You run `npx playwright test`, you consume Playwright's exit code and HTML report, and your existing Playwright CI config carries over untouched. That is a real advantage if your pipeline is already Playwright-shaped — there's nothing new to learn.

BrowserBash ships a purpose-built machine interface. Run with `--agent` and it emits NDJSON — one JSON event per line on stdout — with a stable terminal event, so a CI job or an AI coding agent can consume structured events instead of scraping prose. The exit codes are explicit: `0` passed, `1` failed, `2` error, `3` timeout. That design is aimed squarely at CI gates and at AI agents (Claude Code, Cursor, and friends) that need a clean contract rather than a human-readable log. You can read more about that pattern in the post on [AI agents driving browsers with NDJSON](https://browserbash.com/blog).

```bash
# Headless CI smoke test, machine-readable output, fail the build on a bad run
browserbash run "open the pricing page and confirm the Pro plan shows a monthly price" \
  --agent --headless
echo "exit code: $?"   # 0 pass, 1 fail, 2 error, 3 timeout
```

Both approaches are legitimate. ZeroStep keeps you inside one toolchain. BrowserBash gives you a language-agnostic NDJSON contract that any orchestrator can read, which is the better fit when the consumer is another program rather than a human.

## Committable tests: ai() lines vs Markdown steps

ZeroStep tests are committable because they're just Playwright files — they live in your repo, get reviewed in PRs, and run like any other test. The `ai()` calls read clearly in a diff, which is a nice readability win over a wall of CSS selectors.

BrowserBash takes a different route to the same goal with **Markdown tests**. You write a committable `*_test.md` file where each list item is a step, compose shared flows with `@import`, and parameterize with `{{variables}}`. Crucially, variables you mark as secret are masked as `*****` in every log line, so credentials never leak into output. After each run it writes a human-readable `Result.md`. A login test reads like documentation a non-engineer can follow:

```bash
# Run a committable Markdown test with a templated, masked secret
browserbash testmd run ./checkout_test.md \
  --var username="demo@shop.test" \
  --var password="{{secret:STORE_PASSWORD}}"
```

The trade-off is real. ZeroStep's tests are code, so they get the full power of a programming language — loops, conditionals, helper functions, custom assertions. BrowserBash's Markdown tests are plain-language and reviewable by anyone, but they're declarative steps, not a general-purpose program. If your tests need arbitrary logic, code wins. If you want tests a product manager can read and edit, Markdown wins.

## Dashboards, recordings, and run history

ZeroStep leans on Playwright's tooling for observability — traces, the HTML reporter, whatever you've wired into your Playwright setup. There's no separate dashboard concept inherent to the `ai()` model itself beyond what Reflect's broader product offers, which you'd evaluate separately.

BrowserBash gives you two distinct paths, both free, and both optional. There's a fully local dashboard via `browserbash dashboard` — run history and per-run replay with nothing leaving your machine. And there's an optional cloud dashboard, strictly opt-in: you run `browserbash connect` once and pass `--upload` on a run to push run history, video recordings, and per-run replay to it. Free uploaded runs are kept for 15 days. The important word is *opt-in* — you can run BrowserBash forever and never touch a cloud service. Compare the tiers on the [pricing page](https://browserbash.com/pricing).

```bash
# Record a full run and push it to the free cloud dashboard for replay
browserbash run "log in, add a laptop to the cart, and complete checkout; \
verify the page shows 'Thank you for your order!'" \
  --record --upload
```

## When to choose ZeroStep

Be honest with yourself about your starting point. ZeroStep is the better fit when:

- **You already have a mature Playwright (or Jest) suite.** You don't want to leave it; you just want the flaky 5% of steps to stop breaking on every redesign. `ai()` is a scalpel, not a rewrite.
- **Your tests need real code.** Loops over data sets, conditional branches, custom assertions, shared TypeScript helpers — a Playwright file gives you a full language. A declarative runner can't match that for complex logic.
- **You're standardized on Playwright tooling.** Your CI, reporters, trace viewer, and team muscle memory are all Playwright. Staying in-framework means zero new concepts.
- **You'd rather not manage a model at all.** Remote resolution of `ai()` calls means you never think about local model selection. If you don't want a GPU or an Ollama pull in your life, that's a genuine convenience.

In short: if Playwright is your home and you want to stay there, an in-framework helper is the lighter, more natural move.

## When to choose BrowserBash

BrowserBash is the better fit when:

- **You don't already live in Playwright** — or you want a test you can write as a single English sentence with no file scaffolding at all. The objective is the test.
- **Cost or data residency is a constraint.** The Ollama-first default lets you guarantee a $0 model bill and keep page content on your own machine. For regulated apps or high-volume suites, that's decisive.
- **You want flexible execution targets.** One `--provider` flag moves the same objective from your local Chrome to BrowserBase, LambdaTest, or BrowserStack. Develop locally, run on a cloud grid, no rewrite.
- **The consumer is a machine.** `--agent` NDJSON plus explicit exit codes give CI and AI coding agents a clean contract instead of prose to parse.
- **You want plain-language, committable tests.** Markdown `*_test.md` files with `@import` and masked `{{secret}}` variables are reviewable by anyone on the team, not just engineers.
- **You want it to be free and account-free to start.** Install from [npm](https://www.npmjs.com/package/browserbash-cli), run, done. The dashboards are opt-in.

If you want a self-contained runner that's local-first, free, and describes flows in plain English, BrowserBash is built for that. Real teams have written up how this plays out in practice on the [case study page](https://browserbash.com/case-study).

## A realistic migration path

You don't have to pick sides forever. A pragmatic pattern: keep ZeroStep for the deep, logic-heavy regression tests that genuinely need a programming language inside your Playwright suite, and use BrowserBash for fast, sentence-sized smoke tests and for the CI/AI-agent surface where NDJSON and a $0 model bill matter most. They solve overlapping problems at different altitudes, and there's no rule that says one repo can't use both.

If you're starting fresh, though, weigh the starting cost honestly. ZeroStep assumes a Playwright project already exists; if it doesn't, you're adopting Playwright *and* an AI plugin. BrowserBash assumes nothing — a single `npm install -g browserbash-cli` and an objective gets you a verdict. For greenfield smoke testing, that's the shorter road. For extending an established Playwright codebase, ZeroStep is the smaller change.

## FAQ

### Is BrowserBash a good ZeroStep alternative?

Yes, with a caveat about shape. ZeroStep adds `ai()` calls inside your existing Playwright tests, while BrowserBash is a standalone CLI where a plain-English objective *is* the test. If you want to keep your Playwright suite and only soften flaky steps, ZeroStep is the lighter touch. If you'd rather describe flows in one sentence, run them with no code, and keep models free and local, BrowserBash is the stronger ZeroStep alternative.

### Does BrowserBash require an account or API keys to run?

No. BrowserBash installs with `npm install -g browserbash-cli` and runs immediately with no account and no API keys, because it defaults to free local models through Ollama. You only need a key if you choose a hosted model from Anthropic or OpenRouter. The cloud dashboard is strictly opt-in via `browserbash connect`, and a fully local dashboard is available with `browserbash dashboard`.

### Can I run BrowserBash tests in CI like Playwright tests?

Yes. Run with the `--agent` flag and BrowserBash emits NDJSON — one JSON event per line — plus explicit exit codes: 0 passed, 1 failed, 2 error, 3 timeout. That gives your CI gate or an AI coding agent a clean machine-readable contract instead of prose to parse. You can also commit `*_test.md` Markdown tests and run them with `browserbash testmd run`.

### Is ZeroStep free and open source?

ZeroStep is published as an open-source npm package by Reflect, but its `ai()` calls are resolved by a remote service, and pricing or free-tier limits for that service have changed over time and aren't always fully specified in public docs. Check its current repository and pricing page before adopting it. BrowserBash, by contrast, is Apache-2.0 and can run at zero model cost on local models.

Ready to try the standalone, local-first approach? Install it with `npm install -g browserbash-cli` and run your first plain-English objective in under a minute. An account is optional — you only need one if you want the free cloud dashboard, which you can create at [browserbash.com/sign-up](https://browserbash.com/sign-up).
