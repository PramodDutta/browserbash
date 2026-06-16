---
title: Shortest vs BrowserBash: AI E2E in Jest or Standalone CLI
description: "A shortest testing alternative comparison: Shortest's natural-language E2E inside a Jest runner versus BrowserBash's framework-free markdown tests."
date: 2026-03-03
category: comparison
---

If you have been looking for a Shortest testing alternative, you have probably already worked out the core tension: Shortest puts AI-driven, natural-language end-to-end tests *inside* a Jest-style runner, while BrowserBash runs framework-free markdown tests from a standalone CLI. Both let you describe a flow in plain English and have an AI agent drive a real browser to check it. The difference is where that intelligence lives, what it costs to run, and which models you are allowed to point it at. This article walks through both honestly — including the places where Shortest is the better pick.

I have written enough flaky Selenium suites and over-engineered Playwright page objects to be skeptical of any "just describe your test in English" pitch. So this is not a hype piece. It is a working SDET's read on two tools that approach the same problem from opposite ends: one embeds AI tests in your existing JavaScript test runner, the other treats tests as committable markdown any tool — or AI agent — can run.

## What Shortest actually is

Shortest is an open-source AI-powered end-to-end testing framework from the Antiwork team (the same group behind Gumroad). The headline idea is that you write tests as natural-language assertions inside a familiar test-runner harness. Instead of a fixture full of `page.getByRole(...)` calls, you write something closer to:

```
shortest("Log in with a magic link and confirm the dashboard loads")
```

Under the hood, an AI agent interprets that sentence, drives a real browser using Playwright, and decides whether the described behavior happened. As of 2026, Shortest's published approach uses Anthropic's Claude (its computer-use style capability) to power the reasoning, and it runs your tests through a Jest-like execution model — `npm test` semantics, test files, describe/it ergonomics, the works. It is distributed as an npm package and is open source (MIT, per its public repository). Exact internals, model defaults, and pricing posture beyond "bring your Anthropic key" are not fully specified in a single canonical doc, so I will hedge rather than invent numbers.

The pitch is compelling for teams already living in a JavaScript/TypeScript test stack. You keep your runner, your CI invocation (`npm test`), your reporters, and your watch mode. The AI resolves intent into browser actions, but the *scaffolding* around it is the test runner you already know.

## What BrowserBash actually is

[BrowserBash](https://browserbash.com/learn) is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy, with Pramod Dutta as founder. You install it with one command, write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects, no test-runner wiring. It returns a verdict plus structured results.

```bash
npm install -g browserbash-cli
browserbash run "Go to the demo store, add a hoodie to the cart, check out as a guest, and confirm the order page says Thank you for your order!"
```

The defining design choice is that BrowserBash is **Ollama-first**. Out of the box it points at free local models — no API keys, nothing leaving your machine — and only falls back to a hosted provider if you ask it to. It auto-resolves in this order: a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. That means you can run an entire E2E suite with a genuine $0 model bill, which is a fundamentally different cost story from a tool that assumes a hosted frontier model.

The other defining choice is the test format. BrowserBash tests are plain markdown — committable `*_test.md` files where each list item is a step. No JavaScript, no runner, no `package.json` test script required. The CLI runs them directly:

```bash
browserbash testmd run ./checkout_test.md
```

So the two diverge at the most basic level. Shortest asks: *what if your AI tests lived inside your JS test runner?* BrowserBash asks: *what if your tests were just markdown a CLI, a CI job, or another AI agent could run with zero framework underneath?*

## The honest overlap

Before the differences, it is worth being clear about how much these tools share, because it should shape your decision more than any feature checklist.

- **Natural-language, selector-free intent.** In both, you describe the goal in English and an agent figures out how to click, type, and navigate by reading the page the way a person does. Neither makes you maintain CSS or XPath selectors.
- **Real browsers, real Playwright lineage.** Shortest drives a real browser via Playwright. BrowserBash drives real Chrome/Chromium, and its default Stagehand engine plus its `--record` Playwright trace support sit squarely in the same Playwright ecosystem.
- **Anthropic Claude is a first-class option in both.** Shortest leans on Claude. BrowserBash supports Claude too — bring your own `ANTHROPIC_API_KEY` and it will use it. If you love Claude's reliability on hard multi-step flows, both can give it to you.
- **Open source.** Shortest is MIT; BrowserBash is Apache-2.0. Both are permissive enough for commercial use and self-hosting.
- **Built for modern AI-assisted workflows.** Both are meant for an era where you trust an LLM to interpret intent rather than hand-coding every step.

If your only requirement were "AI interprets my plain-English test against a real browser," you would be happy with either. The interesting decision lives one layer down: runtime model, test format, cost control, and CI ergonomics.

## Where the two genuinely differ

Here is the side-by-side, kept to facts and clearly-hedged unknowns.

| Dimension | Shortest | BrowserBash |
| --- | --- | --- |
| Test format | Natural-language calls inside JS/TS test files | Plain-English `*_test.md` markdown files (or one-shot `run` strings) |
| Runner | Jest-style test runner; `npm test` semantics | Standalone CLI; no runner required |
| Primary model story | Anthropic Claude (bring your key) | Ollama-first local models; falls back to Anthropic, then OpenRouter |
| $0-model-bill path | Not the default posture (hosted model assumed) | Yes — default local models, no API keys |
| Hosted model flexibility | Anthropic-centric (as of 2026) | Anthropic, plus OpenRouter incl. free hosted models like `openai/gpt-oss-120b:free` |
| Where the browser runs | Local (Playwright) | `--provider`: local, cdp, browserbase, lambdatest, browserstack |
| Composition | JS imports / test helpers | `@import` of shared markdown steps + `{{variables}}` templating |
| Secret handling | Your env vars, in JS | `{{secret}}` variables masked as `*****` in every log line |
| CI contract | Jest exit/reporters | `--agent` NDJSON, exit codes 0/1/2/3 |
| Account required | Anthropic account/key for the model | None to run; optional free dashboard is opt-in |
| License | MIT | Apache-2.0 |

A few of these deserve unpacking, because the table flattens nuance.

### Model flexibility and the cost question

This is the biggest practical gap. Shortest's design, as publicly described in 2026, assumes a capable hosted model — Anthropic Claude — to do the reasoning. That is a reasonable choice: Claude is strong at the multi-step, vision-plus-DOM reasoning these flows demand. But it also means every test run has a per-token cost, and your test data passes through a third-party API.

BrowserBash inverts that default. Because it is Ollama-first, your *baseline* is a local model with no key and no egress. For privacy-sensitive teams — fintech, healthcare, anything under a strict data-handling policy — that is not a nice-to-have, it is the difference between "allowed" and "not allowed." You can run the whole suite offline and bill exactly nothing for inference.

The honest caveat: this is not free magic. Very small local models (roughly 8B parameters and under) get flaky on long, multi-step objectives — they lose the thread, misread a page, or declare success too early. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If your machine cannot run a 70B-class model and you do not want to pay for hosted inference, your local results on complex checkouts will be uneven. BrowserBash gives you the *option* of $0; it does not pretend an 8B model matches Claude on a ten-step flow.

Where BrowserBash also wins is plain breadth. Through OpenRouter you can point at hundreds of hosted models, including genuinely free ones like `openai/gpt-oss-120b:free`, switch with an environment variable, and never touch your test files. If a new model lands next quarter, you try it by changing a key — not by waiting for the framework to support it.

### Framework-coupled vs framework-free

Shortest's "tests live in your Jest-style runner" model is a real advantage *if you already have that runner*. You inherit watch mode, parallelization, reporters, and a CI command your team already knows. New tests slot into existing test directories. For a TypeScript shop with a mature Jest/Vitest setup, that is low-friction.

BrowserBash's framework-free markdown is the opposite bet. A `checkout_test.md` is readable by a product manager, diffable in a pull request, and runnable by anything that can shell out — a CI job, a cron, or [an AI coding agent](https://browserbash.com/features). It does not assume Node tooling beyond the CLI itself. The cost is that you give up the runner conveniences Shortest hands you for free: if you want parallel sharding or a fancy HTML reporter, you wire that around the CLI yourself rather than inheriting it.

Here is what a BrowserBash markdown test looks like in practice, with composition and a masked secret:

```bash
# login_test.md
# - Go to https://app.example.com/login
# - Type {{username}} into the email field
# - Type {{password}} into the password field   <-- marked secret, logged as *****
# - Click "Sign in"
# - Confirm the page shows "Welcome back"

# checkout_test.md
# @import ./login_test.md
# - Add the first product to the cart
# - Proceed to checkout and pay as a guest
# - Confirm the page says "Thank you for your order!"

browserbash testmd run ./checkout_test.md
```

The `@import` pulls in the login steps, `{{username}}` and `{{password}}` come from variables, and the password — marked secret — is masked as `*****` in every log line and in the generated `Result.md`. That last detail matters more than it sounds: leaking a credential into CI logs is a real incident, and masking it at the framework level is safer than hoping nobody pastes a log into Slack.

### Where the browser runs

Shortest runs the browser locally through Playwright, which is the right default for most development. BrowserBash defaults to your local Chrome too, but it exposes a single `--provider` flag to move the browser elsewhere without rewriting a thing — a raw DevTools (CDP) endpoint, Browserbase, LambdaTest, or BrowserStack.

```bash
# Same test, run on a LambdaTest cloud browser instead of your laptop
browserbash testmd run ./checkout_test.md --provider lambdatest
```

If you need to verify a flow across a grid of real cloud browsers, or you are on a CI runner without a display, that one-flag switch is genuinely convenient. With a runner-coupled tool you generally configure the cloud target in code or in the runner's config, which is fine but less of a one-liner.

## CI ergonomics: NDJSON and exit codes vs the test runner

This is where the two philosophies show up most clearly.

Shortest, by living in a Jest-style runner, plugs into CI the way any JS test suite does: the runner's exit code gates the build, and you get the runner's reporters. If your pipeline already shows Jest output and your team reads it fluently, that consistency is worth a lot.

BrowserBash takes the standalone-CLI path. Run it with `--agent` and it emits NDJSON — one JSON event per line on stdout — designed to be consumed by programs, not parsed out of prose. Exit codes are stable and explicit: `0` passed, `1` failed, `2` error, `3` timeout. That makes it trivial to gate a pipeline or feed results to [an AI agent that orchestrates tests](https://browserbash.com/blog) without writing a brittle log scraper.

```bash
browserbash run "Sign in and confirm the billing page shows the Pro plan" \
  --agent --headless
echo "exit code: $?"   # 0 pass, 1 fail, 2 error, 3 timeout
```

Neither is better in the abstract. If your whole world is Jest reporters, Shortest's integration is smoother. If you are building tooling *around* test results — a dashboard, an agent loop, a custom gate — BrowserBash's NDJSON-and-exit-codes contract is cleaner to build on because there is nothing to parse.

## Evidence after a run: recordings, traces, and dashboards

When a flaky test fails at 2am, the artifact you get back decides how fast you fix it.

BrowserBash's `--record` flag captures a screenshot *and* a full `.webm` session video (via ffmpeg) on any engine. On the in-repo `builtin` engine, it additionally captures a Playwright trace you can open in the trace viewer and step through action by action. That trace viewer experience — DOM snapshots, network, the exact action timeline — is the gold standard for debugging a flaky E2E failure, and it comes from the shared Playwright lineage both tools sit on.

```bash
browserbash testmd run ./checkout_test.md --record
```

For run history beyond a single machine, BrowserBash offers two paths. There is a free, fully local dashboard (`browserbash dashboard`) and an optional free cloud dashboard with run history, video recordings, and per-run replay. The cloud option is strictly opt-in — you enable it with `browserbash connect` and add `--upload` to a run. No account is needed to run tests at all; the dashboard is a bonus, not a gate. Free uploaded runs are kept for 15 days.

Shortest's artifact story is whatever its Playwright layer and your runner's reporters give you, plus whatever the project ships on top — which I will not overstate, since the exact set of built-in recordings and dashboards is not something I can cite a canonical spec for as of 2026. If recordings and replay are central to your workflow, verify Shortest's current capabilities directly rather than taking my word; BrowserBash's `--record` and replay behavior is documented and concrete.

## Engines and how the agent thinks

BrowserBash ships two engines. The default is **Stagehand** (MIT, by Browserbase), a mature open-source layer for AI browser control. The alternative is **builtin**, an in-repo Anthropic tool-use loop that adds the Playwright trace capture mentioned above. You pick based on whether you want the Stagehand ecosystem's behavior or the tighter in-repo loop with trace output.

Shortest's reasoning loop is its own — a Claude-powered interpreter over Playwright. It is purpose-built and cohesive, which is a strength: fewer moving parts, one opinionated path. BrowserBash trades some of that cohesion for optionality (two engines, many providers, many models). If you want one blessed path and you are happy on Claude, Shortest's single-engine simplicity is a feature, not a limitation.

## When to choose Shortest

I want this to be useful, not a sales pitch, so here is where Shortest is the better tool — plainly.

- **You already live in a Jest/Vitest TypeScript stack.** If your team runs `npm test` a hundred times a day and your CI is built around a JS runner, Shortest slots in with almost no new mental model. That integration is real value.
- **You are all-in on Anthropic Claude and happy to pay for inference.** If your privacy posture allows hosted models and you want the strongest single model on hard flows without fiddling with local model setup, Shortest's Claude-first design is a clean fit.
- **You want AI tests to look like the rest of your test code.** Engineers who prefer assertions in TypeScript files, reviewed alongside unit tests in the same directory, will feel more at home in Shortest than in a separate markdown format.
- **You value a single opinionated path.** Fewer knobs can mean fewer ways to get it wrong. If you do not want to think about engines, providers, or model routing, Shortest's cohesion is an asset.

## When to choose BrowserBash

- **You want a genuine $0 model bill or strict data privacy.** Ollama-first local execution means no API keys and nothing leaving your machine by default. For regulated environments, this is often decisive. Just budget for a mid-size local model (Qwen3 / Llama 3.3 70B class) on complex flows; the smallest models will frustrate you.
- **You want model and provider flexibility.** Auto-resolution from local Ollama to Anthropic to OpenRouter, plus access to hundreds of hosted models including free ones, means you are never locked to one vendor's pricing or roadmap.
- **You want framework-free, committable tests.** Markdown `*_test.md` files with `@import` and `{{variables}}` are readable by non-engineers, diffable in PRs, and runnable by any CI job or AI agent — no Node test runner required.
- **You are wiring tests into agents or custom tooling.** The `--agent` NDJSON stream and clean exit codes are built for machines to consume. If you are building an [agent loop or a custom gate](https://browserbash.com/case-study), there is nothing to parse.
- **You need to move the browser to the cloud with one flag.** `--provider lambdatest` (or browserstack, browserbase, cdp) reroutes execution without touching the test. And `--record` gives you a `.webm` plus, on the builtin engine, a Playwright trace for debugging.

## A realistic migration note

If you are evaluating a Shortest testing alternative because you want off hosted-model costs, do not expect a literal one-to-one port. Shortest's tests are JavaScript calls; BrowserBash's are markdown. The translation is usually mechanical — each natural-language assertion becomes a markdown step list — but you will also re-think structure: shared setup moves into an `@import`ed login file, secrets move into masked `{{variables}}`, and your CI gate switches from a runner exit code to BrowserBash's `--agent` NDJSON and exit codes.

The upside of that re-think is that the resulting tests are usually more portable. A markdown test does not care whether it runs on your laptop, a CI runner, or a teammate's machine, and it does not assume a particular Node version or runner config. You can read more about the local-first model on the [BrowserBash pricing page](https://browserbash.com/pricing), or browse the source on [GitHub](https://github.com/PramodDutta/browserbash).

## FAQ

### Is BrowserBash a good Shortest testing alternative for teams that want free local models?

Yes — that is arguably its strongest reason to exist. BrowserBash is Ollama-first, so it defaults to free local models with no API keys and no data leaving your machine, which Shortest's Claude-first design does not offer by default. The honest caveat is that very small local models can be flaky on long flows, so plan to run a mid-size model in the Qwen3 or Llama 3.3 70B class for complex checkouts.

### Do I need to write JavaScript to use BrowserBash like I would with Shortest?

No. Shortest tests are natural-language calls inside JavaScript or TypeScript test files run by a Jest-style runner. BrowserBash tests are plain markdown `*_test.md` files where each list item is a step, run directly by the CLI with `browserbash testmd run`. You can also run a one-off objective as a single `browserbash run "..."` string without any file at all.

### Can both tools run in CI, and how do they report results?

Both can. Shortest reports through its test runner, so it integrates the way any Jest-style suite does, using the runner's exit code and reporters. BrowserBash uses a standalone CLI contract: run with `--agent` for NDJSON output (one JSON event per line) and rely on explicit exit codes — 0 passed, 1 failed, 2 error, 3 timeout — which is easy to gate on without parsing prose.

### Which tool gives better debugging artifacts when a test fails?

BrowserBash has a concrete, documented story: `--record` captures a screenshot and a full `.webm` video on any engine, and the builtin engine additionally captures a Playwright trace you can open in the trace viewer. It also offers a free local dashboard and an optional free cloud dashboard with per-run replay. Shortest's artifacts come from its Playwright layer and runner reporters; verify its current recording features directly, since they are not something I can cite from a single canonical spec as of 2026.

## Get started

If a framework-free, local-first approach fits how you want to test, BrowserBash takes about a minute to try. Install it and run your first plain-English flow:

```bash
npm install -g browserbash-cli
browserbash run "Open the demo store, add an item to the cart, check out, and confirm Thank you for your order!"
```

No account is required to run anything — the optional free dashboard is strictly opt-in. If you do want run history, recordings, and replay, you can [sign up for the free dashboard](https://browserbash.com/sign-up) whenever it is useful, not before. Either way, your tests stay as committable markdown you own, runnable on local models for a $0 inference bill.
