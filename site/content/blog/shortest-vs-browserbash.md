---
title: Shortest vs BrowserBash for AI-Native E2E Testing
description: "A hands-on Shortest AI testing alternative comparison: in-code natural-language assertions vs framework-free markdown tests that run from any CI."
date: 2026-03-13
category: comparison
---

If you have been hunting for a Shortest AI testing alternative, you already know the appeal of the new generation of E2E tools: you describe what a test should do in plain English, an AI figures out the clicks, and you stop babysitting selectors. Shortest and BrowserBash both live in that world, but they make opposite bets about *where* your tests live and *how* they run. Shortest puts natural-language assertions inside your TypeScript test files, executed by a test runner. BrowserBash skips the runner entirely and runs framework-free markdown tests from any CI with real exit codes. This comparison is for engineers who have to actually pick one, so it stays factual and is candid about where each tool wins.

The short version: these tools overlap on the headline ("write tests in English, let AI drive the browser") and diverge on almost everything underneath — the language your tests are written in, the runtime dependency, the model story, and what it takes to get a green or red signal in CI. Let's get into the detail.

## What Shortest actually is

Shortest is an open-source, AI-powered E2E testing framework from Antiwork, published under the MIT license. The core idea is genuinely nice: you write tests in TypeScript using a `shortest()` function and pass it a plain-English description of the flow and the assertions you care about. Under the hood it is built on Playwright for browser control, and it uses a vision-capable LLM (Anthropic's Claude has been the documented default) to resolve those natural-language steps and assertions against the actual rendered page — it screenshots the page, reasons about it, and decides what to click or whether an assertion holds.

A Shortest test reads roughly like this in spirit: you import the framework, call `shortest('Log in with the test account and confirm the dashboard greeting appears')`, and the AI handles the mechanics. Because it sits on top of Playwright and runs inside a Node/TypeScript project, it slots into the same mental model as a Playwright or Jest suite — config file, test files, a runner command, CI that invokes that runner. For teams already deep in a TypeScript codebase who want AI assertions *inside* their existing test architecture, that is a strong fit.

I want to be precise about what is and isn't public. Shortest's exact current pricing, any hosted offering, model-version specifics, and roadmap are not fully specified in public docs as of 2026, and its model support beyond the documented Claude default has evolved — so I will hedge rather than invent numbers. What is clearly true and matters for this comparison: Shortest tests are **code** (TypeScript), they run through a **test runner / framework layer**, and the default execution path leans on a **hosted LLM API key** (Anthropic) to do the vision reasoning.

## What BrowserBash actually is

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy, founded by Pramod Dutta. You install it with `npm install -g browserbash-cli` (latest version 1.3.1), and you run it with the `browserbash` command. You write a plain-English objective; an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects, no test file scaffolding — and returns a verdict plus structured results.

The defining difference from Shortest is the model story. BrowserBash is **Ollama-first**: it defaults to free local models, so there are no API keys and nothing leaves your machine. It auto-resolves models in a clear order — local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — so if you have nothing configured, it tries to run locally and for free. It also supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic Claude if you bring your own key. On local models you can guarantee a $0 model bill. You can read the full feature tour on the [BrowserBash learn page](https://browserbash.com/learn).

One honest caveat, because it matters for E2E reliability: very small local models (around 8B parameters and under) can be flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the hardest flows. BrowserBash will happily run on a tiny model, but don't expect a 7B model to nail a ten-step checkout on the first try every time.

The second defining difference is the runtime. BrowserBash has **no test runner dependency**. There is no Jest, no Playwright Test config, no framework you must adopt. Its committable tests are plain markdown files, and its CI contract is exit codes plus NDJSON. That is the crux of this whole comparison.

## The honest overlap

Before the differences, it is worth naming what these two genuinely share, because pretending otherwise wouldn't help you decide:

- **Plain-English, selector-free intent.** Both let you describe a flow in natural language and have an AI resolve the mechanics against the live page, instead of you maintaining CSS or XPath selectors.
- **Open source.** Shortest is MIT; BrowserBash is Apache-2.0. Both are permissive licenses you can read, fork, and self-host.
- **Real browser, vision-aware reasoning.** Both drive an actual browser and use an LLM to look at the page and decide what to do. Neither is a pure DOM-scraping bot.
- **They can run the same kinds of flows.** Log in, navigate, fill a form, assert a success message. The classic example BrowserBash ships is logging into a store, adding an item to the cart, completing checkout, and verifying "Thank you for your order!" — exactly the kind of journey Shortest is designed for too.

That overlap is real. The decision is rarely about whether a tool *can* express a flow — both can. It is about the artifacts, the dependencies, and how the result lands in your pipeline.

## In-code assertions vs framework-free markdown

This is the heart of it. Shortest and BrowserBash answer "where does a test live?" differently.

With **Shortest**, a test is a TypeScript call inside your project. The natural-language assertion lives *in code*: `shortest('the order total should equal the sum of line items')`. That is powerful — you get the full TypeScript ecosystem around your tests, you can mix AI steps with regular Playwright code, you can share fixtures and helpers, and your tests are versioned alongside your app. The cost is that a test is now bound to a Node/TypeScript project and a runner. Someone has to maintain `tsconfig`, the framework version, the runner invocation, and the dependency tree. Non-TypeScript teams (a Python backend, a Go service, a no-code team) inherit a JavaScript toolchain just to write tests.

With **BrowserBash**, a test is a markdown file. You commit a `*_test.md` where each list item is a step, and you run it with the CLI. There is no runner to configure and no language to adopt. A test file looks like prose a PM could read, and it supports `@import` to compose shared steps and `{{variables}}` templating so you can parameterize environments and credentials. Variables marked as secrets are masked as `*****` in every log line, which matters the moment you put credentials in a test. After each run, BrowserBash writes a human-readable `Result.md` you can attach to a PR or read at a glance.

Here is a markdown test with a templated, secret-marked credential:

```bash
# login_test.md — each list item is a step
# Run it:  browserbash testmd run ./login_test.md \
#            --var base_url=https://staging.shop.test \
#            --var password={{secret:STAGING_PW}}

# 1. Go to {{base_url}}/login
# 2. Sign in as qa@shop.test with password {{password}}
# 3. Verify the text "Welcome back" appears in the header
```

The trade is real and cuts both ways. In-code assertions give you composability and a programming language when a flow gets genuinely complex (custom data setup, branching, computed expectations). Framework-free markdown gives you portability and a near-zero learning curve — but if you need to express tricky programmatic logic, you may find prose steps less precise than a few lines of TypeScript. Pick the model that matches your team, not the one that sounds more modern.

## Running in CI: exit codes and no prose parsing

E2E tools earn their keep in CI, so this deserves its own section.

Because Shortest runs through a test runner, its CI integration looks like any other Node test job: install dependencies, provide the model API key as a secret, run the test command, and let the runner's exit status gate the build. That is familiar and fine. The dependency you are taking on is the framework and its runner — and, in the default configuration, a hosted LLM key being present in CI for the vision calls.

BrowserBash is built to be a CI primitive on its own. Run it with `--agent` and it emits **NDJSON** — one JSON event per line on stdout — so a pipeline or an AI coding agent consumes structured events instead of scraping prose. The exit codes are unambiguous and stable: `0` passed, `1` failed, `2` error, `3` timeout. You can wire a gate without parsing a single line of human text:

```bash
# Headless smoke test in CI, structured output, hard pass/fail gate
browserbash run "Open https://shop.example, add the first product to the cart, \
  go to checkout, and verify the text 'Thank you for your order!' appears" \
  --headless --agent
# exit 0 = passed, 1 = failed, 2 = error, 3 = timeout
echo "exit code: $?"
```

The practical difference: with BrowserBash you can drop a single binary into *any* CI — GitHub Actions, GitLab, a cron box, a Bash script on a Raspberry Pi — and gate on the exit code with no test runner installed and, if you use a local or free hosted model, no paid API key in the secrets store. With Shortest, your CI inherits the Node/TypeScript test stack and (by default) a hosted model key. Neither is wrong; they suit different pipelines. For a deeper look at CI patterns, the [BrowserBash features page](https://browserbash.com/features) walks through agent mode end to end.

## Side-by-side comparison

Here is the honest matrix. Where Shortest's specifics are not public, the table says so rather than guessing.

| Dimension | Shortest | BrowserBash |
| --- | --- | --- |
| What a test is | TypeScript code (`shortest()` calls) | Plain markdown `*_test.md`, one step per list item |
| Test runner dependency | Yes — runs through a framework/runner | None — single CLI, no runner |
| Language required | TypeScript / Node | None (write prose; CLI is Node-installed) |
| Browser engine | Playwright under the hood | Real local Chrome/Chromium; Stagehand (default) or builtin engine |
| Default model path | Hosted LLM (Anthropic Claude documented) | Ollama-first local models; $0 on local |
| Bring-your-own key | Yes (API key expected by default) | Optional — local needs none; supports Anthropic + OpenRouter |
| Free hosted model option | Not publicly specified | Yes — OpenRouter free models e.g. `gpt-oss-120b:free` |
| License | MIT | Apache-2.0 |
| CI contract | Runner exit status | NDJSON (`--agent`) + exit codes 0/1/2/3 |
| Secret masking in logs | Not publicly specified | Yes — `{{secret}}` vars masked as `*****` |
| Composition | TypeScript imports/fixtures | `@import` + `{{variables}}` templating |
| Recordings | Not publicly specified | Screenshot + `.webm` video (`--record`); Playwright trace on builtin engine |
| Account to run | Not publicly specified | None; optional free dashboard is opt-in |

A note on fairness: several Shortest cells say "not publicly specified" because I would rather hedge than fabricate a competitor's features. If Shortest ships secret masking or built-in video that I could not confirm publicly, treat those rows as "verify in the current docs," not as a knock.

## Models, cost, and where the browser runs

Cost is where the two philosophies diverge hardest.

Shortest's vision-driven approach means an LLM call per meaningful step or assertion, and the documented default is a hosted Anthropic model — so your spend scales with how many tests you run and how chatty each one is. For many teams that is perfectly acceptable; hosted vision models are reliable and you are not babysitting infrastructure. But it is a metered cost, and it puts an API key in your CI secrets.

BrowserBash lets you run the same kind of flow for **$0 in model cost** by defaulting to local Ollama models. Nothing leaves your machine, no key is required, and your test bill does not scale with run count. The honest trade is the one above: small local models can wobble on long flows, so you either run a mid-size local model (Qwen3 / Llama 3.3 70B-class) or fall back to a capable hosted model for the gnarly journeys. The flexibility is the point — you can run free locally for the bulk of your suite and reach for Anthropic or an OpenRouter model only where you need the extra reasoning. If avoiding API keys is a hard requirement for you, the [no-API-keys workflow](https://browserbash.com/blog) is the whole reason BrowserBash exists.

There is also the question of *where the browser runs*. BrowserBash switches execution backends with one flag, `--provider`: `local` (your Chrome, the default), `cdp` (any DevTools endpoint), and managed grids `browserbase`, `lambdatest`, and `browserstack`. So you can develop locally for free and burst the same objective onto a cloud grid for cross-browser coverage without rewriting the test:

```bash
# Same objective, run on a LambdaTest cloud browser, with video + a trace
browserbash run "Log in, add a laptop to the cart, complete checkout, \
  and verify 'Thank you for your order!'" \
  --provider lambdatest --record --upload
```

Shortest, being Playwright-based, can target whatever browsers Playwright supports, but the grid-provider-as-a-flag model and the local-first default are BrowserBash's distinct posture.

## Recordings, dashboards, and debugging

When an E2E test fails at 2 a.m., artifacts are everything.

BrowserBash captures a screenshot and a full `.webm` session video (via ffmpeg) on any engine when you pass `--record`; the builtin engine additionally captures a Playwright trace you can open in the trace viewer and step through frame by frame. For run history and replay, there are two options, both free: a fully local dashboard via `browserbash dashboard` (nothing leaves your machine), and an optional cloud dashboard with run history, video recordings, and per-run replay — strictly opt-in via `browserbash connect` plus `--upload`. Free uploaded runs are kept for 15 days. No account is needed to run BrowserBash at all; the dashboard is a convenience, not a gate.

Shortest, sitting on Playwright, inherits Playwright's debugging primitives (traces, screenshots, the trace viewer) through that layer — that is a genuine strength of building on Playwright. Whether Shortest ships its own hosted run-history dashboard or video capture is not something I'll assert without current docs in front of me. If you live in the Playwright trace viewer already, Shortest's foundation will feel like home.

## When to choose Shortest

Shortest is the better pick when:

- **Your codebase is already TypeScript/Node and you want AI assertions inside it.** If your tests already live next to your app in a Node project, Shortest's in-code model is a natural extension rather than a new tool to bolt on.
- **You want to mix AI steps with deterministic Playwright code.** Complex data setup, computed expectations, and branching are easier to express in real code than in prose steps. Shortest lets you drop into TypeScript whenever the AI shorthand isn't precise enough.
- **You are comfortable with a hosted-model spend and a key in CI.** If a metered Anthropic bill and an API key in your secrets store are non-issues, the default path is smooth.
- **You want a single framework idiom across your whole suite.** Keeping every test as a `shortest()` call in one runner has real organizational value.

That is a legitimately good fit for a lot of teams, and if it describes yours, Shortest may simply be the right answer.

## When to choose BrowserBash

BrowserBash is the stronger [Shortest AI testing alternative](https://browserbash.com/learn) when:

- **You don't want a test runner or a TypeScript dependency.** Markdown tests run from a single CLI. A Python team, a Go team, or a QA pod that doesn't write JavaScript can author and run tests without adopting a JS toolchain.
- **A $0 model bill matters.** Ollama-first local models mean no API keys and no metered spend. You can run the bulk of a suite locally for free and reserve hosted models for the hardest flows.
- **You need a clean CI primitive.** NDJSON plus exit codes `0/1/2/3` drop into any pipeline with nothing else installed. No prose parsing, no runner, no key required for local models.
- **Secrets in tests are a concern.** `{{secret}}` variables are masked as `*****` in every log line, which is exactly what you want when credentials live in a committed test.
- **You want grid flexibility without rewriting tests.** One `--provider` flag moves the same objective from your local Chrome to Browserbase, LambdaTest, or BrowserStack.

If you want to try it on a real flow right now, the [case studies](https://browserbash.com/case-study) and the [pricing page](https://browserbash.com/pricing) (spoiler: the CLI is free) are good next stops.

## A realistic migration path

You do not have to choose religiously. A pragmatic team can run both: keep complex, data-heavy assertions as in-code Shortest tests where TypeScript precision pays off, and use BrowserBash markdown tests for the broad, fast smoke layer — the "is login broken, is checkout broken, did the homepage 500" checks that should run on every push, locally, for free, gated on an exit code. Because both express flows in plain English, the conceptual cost of running them side by side is low. Many teams discover that the framework-free smoke layer catches the majority of regressions, and the in-code suite handles the long tail.

## FAQ

### Is Shortest free and open source?

Yes. Shortest is open source under the MIT license, published by Antiwork, so you can read, fork, and self-host the framework itself. The thing that typically costs money is the model: the default execution path uses a hosted LLM (Anthropic Claude is documented), which is metered. BrowserBash is also open source (Apache-2.0) and can run entirely on free local models for $0 in model cost.

### Do I need to know TypeScript to use Shortest or BrowserBash?

For Shortest, effectively yes — tests are written as TypeScript code inside a Node project and run through a test runner, so a JavaScript/TypeScript toolchain is part of the deal. BrowserBash needs no programming language for the tests themselves; you write plain-English objectives or markdown `*_test.md` files and run them from the CLI. That makes BrowserBash easier for non-JavaScript teams to adopt.

### Can these tools run in CI without a paid API key?

BrowserBash can. With its Ollama-first defaults it runs on local models with no API keys, emits NDJSON in agent mode, and gates on exit codes 0, 1, 2, and 3 with no test runner installed. Shortest's documented default relies on a hosted model API key, so its standard CI path expects that key in your secrets. You can still bring a hosted key to BrowserBash if you want, but it is optional rather than required.

### What is the biggest difference between Shortest and BrowserBash?

Where the test lives and what it depends on. Shortest puts natural-language assertions inside TypeScript files executed by a test runner, which is great if you want AI steps inside an existing Node test suite. BrowserBash is framework-free: tests are markdown, there is no runner dependency, the default models are free and local, and CI integration is exit codes plus NDJSON from a single CLI.

If you want to test the framework-free, local-first approach yourself, install it with `npm install -g browserbash-cli` and point it at any flow you care about — no API key, no runner, no account required to start. When you're ready for run history and replay, the optional free dashboard is one command away; [sign up here](https://browserbash.com/sign-up) (an account is entirely optional).
