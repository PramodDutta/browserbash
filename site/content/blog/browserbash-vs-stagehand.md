---
title: Stagehand vs BrowserBash: Library vs CLI for AI Browsers
description: "Stagehand vs BrowserBash compared: a TypeScript AI-browser library versus a free CLI that wraps it with markdown tests, NDJSON, and exit codes."
date: 2026-06-13
category: comparison
---

If you have spent any time around AI-driven browser automation, you have probably run into Stagehand vs BrowserBash as a question, and the honest answer is that they are not really competitors. Stagehand is a TypeScript library you import into your own code; BrowserBash is a command-line tool you run from a terminal or a CI job. The twist that makes the comparison interesting is that BrowserBash uses Stagehand as its default engine. So the real decision is not "which one is better" — it is "do I want to write code against a library, or do I want a full workflow handed to me?" This post lays out where the line falls, with real commands, an honest comparison table, and a clear take on when each one is the right tool.

## What Stagehand actually is

Stagehand is an open-source (MIT) AI browser automation framework from Browserbase. It sits on top of Playwright and adds a small, deliberate set of AI-powered primitives — typically expressed as `act`, `extract`, and `observe` — so that instead of writing brittle selectors you describe what you want in natural language and let a model resolve it against the live page. You write something like `await page.act("click the login button")` inside a Node.js or TypeScript project, wire up your own model provider, and Stagehand handles the act-of-driving-the-browser part.

That design is a genuine sweet spot for developers. You keep full programmatic control: loops, conditionals, your own assertion library, your own retry logic, custom data extraction into typed objects. Because it is a library, it composes with whatever you already have — a Playwright test runner, a scraping pipeline, a backend job. The cost of that flexibility is that you are writing and maintaining a codebase. You install dependencies, manage model credentials in code, structure your own project, and decide how results get reported. Nothing is wrong with that; it is simply what a library is for.

## What BrowserBash actually is

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) natural-language browser automation CLI. You install it once with `npm install -g browserbash-cli`, write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser and returns a verdict plus structured results. There is no project to scaffold, no selectors to maintain, and no page objects to write. The unit of work is a sentence, not a class.

Here is the entire "hello world":

```bash
browserbash run "Open https://news.ycombinator.com and verify the top story link is visible"
```

That command drives a real browser, plans its own steps, checks the assertion in the `verify` clause, and exits with a status code you can act on. Under the hood, BrowserBash ships two engines. The default is `stagehand` — yes, the same Stagehand described above, embedded and wired up for you. The second is `builtin`, an in-repo Anthropic tool-use loop that drives Playwright directly. You can switch between them with a flag, but most people never touch it because the default works.

The point worth sitting with: when you run BrowserBash with its default engine, **you are already running Stagehand**. BrowserBash is largely a question of what gets built on top of that engine — the CLI surface, the test format, the CI contract, the recordings, the dashboard.

## The relationship in one sentence

Stagehand is the AI-browser engine. BrowserBash is a batteries-included CLI and test workflow that can use Stagehand as that engine. Choosing between them is choosing your altitude: the library if you want to write code and own the orchestration, the CLI if you want to write sentences and have the orchestration, reporting, and CI integration handed to you.

## A side-by-side comparison

The table below sticks to well-known, factual differences in shape and posture. It is not a scorecard — several rows are genuinely "depends on what you are building."

| Dimension | Stagehand | BrowserBash |
| --- | --- | --- |
| Form factor | TypeScript / Node.js library you import | Global CLI you install and run |
| License | MIT, open source | Apache-2.0, open source |
| How you express intent | `act` / `extract` / `observe` calls in your code | Plain-English objective on the command line or in a markdown file |
| Setup | npm install into a project, write code | `npm install -g browserbash-cli`, run a command |
| Engine | Is the engine | Bundles Stagehand (default) plus a `builtin` Anthropic tool-use loop |
| Models | You wire up your provider in code | Auto-detects Ollama, then Anthropic, then OpenRouter; local Ollama is free and keyless |
| Where the browser runs | Local or Browserbase, configured in code | Local Chrome by default; `cdp`, `browserbase`, `lambdatest`, `browserstack` via one `--provider` flag |
| Test format | You write and structure tests yourself | Committable `*_test.md` files with steps, `@import`, and `{{variables}}` |
| CI contract | You build your own reporting | NDJSON stream via `--agent` plus stable exit codes (0/1/2/3) |
| Recordings | DIY with Playwright trace/video | `--record` captures screenshot + `.webm` video on any engine; builtin also emits a Playwright trace |
| Result history | Bring your own | Free local dashboard, plus optional cloud dashboard with `--upload` |
| Best fit | Custom apps and pipelines that need code-level control | Fast checks, smoke and journey tests, CI gates, AI coding agents |

## What BrowserBash adds on top of the engine

If both can drive a browser with natural language, the value of the CLI is everything around the act of driving. Four pieces stand out.

### Plain-English commands with model auto-detection

You do not configure a model provider in code. BrowserBash auto-detects what is available, preferring a local Ollama install first — free, local, no API keys — then Anthropic, then OpenRouter. That means the default path costs nothing and keeps everything on your machine. When you do want a hosted model, OpenRouter is a single flag away, including genuinely free options:

```bash
# Free and local by default (Ollama)
browserbash run "Search Wikipedia for 'capybara' and verify the article opens" --headless

# Or a free hosted model through OpenRouter
browserbash run "Open example.com and verify the page has a heading" \
  --model openrouter/openai/gpt-oss-120b:free --headless
```

This is a real divergence from the library posture. With Stagehand you decide and wire the model in your project's code; with BrowserBash the sensible default is chosen for you, and overriding it is a flag, not a refactor.

### Markdown tests you can commit

BrowserBash has a test format that has no direct equivalent in a bare library: committable markdown files where each list item is a step. They read like documentation and run like tests.

```markdown
# Checkout smoke

- Open {{base_url}}
- Log in as {{username}} with password {{password}}
- Add the Sauce Labs Backpack to the cart
- Go to checkout and fill first name 'Ada', last name 'Lovelace', postal code '94016'
- Finish the order
- Verify the page says 'Thank you for your order!'
```

Run it, and a `Result.md` report lands next to the file:

```bash
browserbash testmd run ./checkout_test.md --headless
```

The `@import` directive lets you compose shared steps (a reusable login block, for instance) across files, and `{{variables}}` are substituted at run time. Mark a value as secret and it shows up as `*****` in every log, console line, and report — so credentials never leak into your terminal history or CI output. With a library, this scaffolding is yours to design and build; here it is part of the tool.

### A CI contract that does not need prose parsing

This is the feature that matters most for automation, and it is the cleanest reason to reach for the CLI inside a pipeline or an AI coding agent. Add `--agent` and BrowserBash emits NDJSON — one JSON event per line, on a stable schema — instead of human prose. On top of that, the process exit code is the verdict:

```bash
browserbash run "Open {{base_url}}/login and verify the dashboard loads after login" \
  --agent --headless --timeout 120 \
  --variables '{"base_url":"https://app.example.com"}'
# Exit codes: 0 passed, 1 failed, 2 error, 3 timeout
```

A CI job, or another program, can branch on the exit code and read structured events line by line. Nobody has to scrape a log message to find out whether the test passed. If you were using Stagehand directly, you would build this reporting layer yourself — collecting results, serializing them, and defining your own success signal. BrowserBash standardizes it so any consumer, human or machine, reads the same contract.

### Recordings, providers, and a dashboard

Two more conveniences round out the workflow. First, `--record` captures a screenshot and a session video (a `.webm` stitched with ffmpeg) on either engine; the builtin engine additionally captures a Playwright trace you can open in the trace viewer. Second, where the browser runs is a runtime decision — local Chrome by default, or any DevTools endpoint, Browserbase, LambdaTest, or BrowserStack by changing a single flag:

```bash
# Record a run locally, then run the same objective on a cloud grid
browserbash run "Open {{base_url}} and verify the pricing page loads" --record --headless \
  --variables '{"base_url":"https://www.example.com"}'

browserbash run "Open {{base_url}} and verify the pricing page loads" \
  --provider lambdatest --headless \
  --variables '{"base_url":"https://www.example.com"}'
```

Note that the default Stagehand engine drives local and Browserbase sessions; the moment you target LambdaTest or BrowserStack, BrowserBash automatically switches to the builtin engine, which speaks the Anthropic API. You never pass `--engine builtin` yourself for that — the switch is automatic — but it does mean grid runs need `ANTHROPIC_API_KEY` (or `ANTHROPIC_BASE_URL` pointed at an Anthropic-compatible gateway).

Finally, results do not have to vanish when the terminal closes. Run `browserbash dashboard` for a free, private, local dashboard, or create a free account, run `browserbash connect --key bb_...`, and add `--upload` to push a run to the cloud dashboard for run history, recordings, and per-run replay. Nothing leaves your machine unless you pass `--upload`; on the free tier, cloud runs are kept for 15 days.

## What you give up by choosing the CLI

Being fair means naming the tradeoffs, and they are real.

**Programmatic control.** A library lets you wrap browser actions in arbitrary code — loops over a thousand database rows, complex branching, custom typed extraction into your own data structures, bespoke retry policies. The CLI is intentionally higher-level. You get an objective and a verdict, NDJSON events, and markdown composition, but you are not writing TypeScript around each `act` call. If your task is "scrape these 5,000 product pages into a typed schema with custom error handling per category," that is a Stagehand-in-your-own-code job, not a one-line CLI invocation.

**Embedding in an existing app.** If browser automation is one step inside a larger Node.js service — a backend that, say, logs into a partner portal as part of a workflow — importing Stagehand directly keeps everything in one process and one language. Shelling out to a CLI from inside that service is possible, but a library is the more natural fit there.

**Determinism and path control.** This applies to any LLM-driven approach, including Stagehand itself, but it is worth stating plainly. An agent plans at run time, so two runs may take slightly different routes to the same goal. BrowserBash narrows the gap with explicit `verify` steps, timeouts, and exit codes as the contract — runs are goal-deterministic, not path-deterministic. If you need bit-identical execution traces, neither of these AI approaches replaces a hand-written, selector-based suite.

## When to choose which

Reach for **Stagehand directly** when:

- Browser automation lives inside a larger TypeScript or Node.js codebase and you want it in-process.
- You need code-level control: custom loops, conditionals, typed extraction, or bespoke retry and error handling.
- You are building your own product or pipeline and want the engine without an opinion about CLI shape, test format, or reporting.

Reach for **BrowserBash** when:

- You want to write a sentence and get a verdict without scaffolding a project.
- You need committable, human-readable tests (`*_test.md`) that double as living documentation.
- You are wiring tests into CI or an AI coding agent and want NDJSON plus exit codes instead of a reporting layer you have to build.
- You want free, local, keyless model runs by default, with hosted models one flag away.
- You want screenshots, session videos, traces, cross-provider runs, and an optional dashboard without assembling them yourself.

And here is the both/and that the architecture makes possible: because BrowserBash bundles Stagehand, a team can prototype a flow on the command line in seconds, decide it needs deep programmatic control, and reach for the Stagehand library directly — without changing the underlying engine they have already validated against. The mental model is continuous, not a rewrite.

A practical middle path many teams land on: use the CLI for everything that benefits from speed and a clean CI contract — smoke tests, journey checks, quick ad-hoc verifications, agent-driven tasks — and drop down to Stagehand-in-code only for the genuinely custom, deeply programmatic jobs. You can dig deeper into the command surface and patterns on the [BrowserBash learn pages](https://browserbash.com/learn), browse more comparisons and guides on the [blog](https://browserbash.com/blog), or just grab it from the [npm package page](https://www.npmjs.com/package/browserbash-cli) and try a one-liner now.

## FAQ

### Is BrowserBash just a wrapper around Stagehand?

Not exactly. BrowserBash uses Stagehand as its default engine, so on the default path you are running Stagehand. But it also ships a second `builtin` engine (an Anthropic tool-use loop on Playwright) and adds a CLI, committable markdown tests, NDJSON output with stable exit codes, recordings, cross-provider runs, and a dashboard. It is best described as a batteries-included workflow built on top of the engine, not a thin wrapper.

### Can I use Stagehand directly and BrowserBash on the same project?

Yes, and it is a reasonable pattern. Use the BrowserBash CLI for fast checks, smoke and journey tests, and CI gates where a sentence plus an exit code is enough. Drop down to the Stagehand library in your own code for tasks that need loops, typed extraction, or custom control flow. Because BrowserBash bundles Stagehand, both layers share the same underlying engine.

### Do I need API keys or a paid model to run BrowserBash?

No. BrowserBash is free and open source, and it auto-detects models in the order Ollama, then Anthropic, then OpenRouter. With a local Ollama install, runs are free and keyless and nothing leaves your machine. Hosted options are available when you want them — including free models through OpenRouter — but they are optional, not required.

### Which one is faster to get started with?

For a quick browser check, the CLI is faster: install once with `npm install -g browserbash-cli` and run a single `browserbash run "..."` command, no project required. Stagehand is faster to get started with when you are already inside a TypeScript project and want to call `act`, `extract`, and `observe` from your own code. The right answer depends on whether you want a workflow handed to you or you want to write the orchestration yourself.

---

Ready to try the plain-English approach? [Create a free account](https://browserbash.com/sign-up) to push runs to the cloud dashboard, or just `npm install -g browserbash-cli` and run your first one-liner — BrowserBash is free and open source, and the default path keeps everything local with no API keys.
