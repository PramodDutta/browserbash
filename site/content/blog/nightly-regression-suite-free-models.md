---
title: Run a Nightly Regression Suite on Free Local Models
description: "Build a nightly regression suite free ai models can run end to end with BrowserBash, cron, and Ollama, with zero API cost and honest limits."
date: 2026-07-21
category: use-case
---

If you have ever stared at a testing budget line item that reads "LLM API calls: $340/month" and wondered whether that number has to exist, this article is for you. A nightly regression suite free ai models can drive end to end, with no API key and nothing leaving your machine, is not a hypothetical: it is a cron job, a folder of plain-English test files, and a local Ollama model doing the driving through BrowserBash. This post walks through building that setup from scratch, including where a mid-size local model holds up under real regression pressure and where it quietly falls apart.

The pitch for local-model regression testing is simple. Nightly suites run unattended, usually against a staging environment, usually re-checking the same handful of critical paths (login, checkout, search, account settings) that rarely change in structure even when the UI around them does. That repetitiveness is exactly the profile where a free local model, paired with a deterministic replay cache, earns its keep. You are not asking the model to reason about novel edge cases at 2am; you are asking it to walk the same door it walked last night, and to notice loudly when the door has moved.

## Why Free Local Models Work for Nightly Regression

BrowserBash resolves its model provider in a fixed order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. That means if you have Ollama running with a model pulled, you get browser automation with zero API spend by default, no flags required. For a nightly job that might run 30, 60, or 100 test files every single night, that default matters. A hosted model at even a fraction of a cent per step adds up fast once you multiply by test count times nights times months. A local model costs electricity.

The second reason this works specifically for *regression* suites, as opposed to exploratory testing, is BrowserBash's replay cache. The first time a test runs, the agent (local model or otherwise) actually reasons through each step: find the login field, click it, type the credential, click submit. That sequence of actions gets recorded. On the next run against the same origin, if nothing changed, BrowserBash replays those recorded actions directly, without invoking the model at all. Only when the page has actually changed does the agent step back in to figure out the new path. For a nightly suite that runs against a fairly stable staging environment, this means most nights are near-zero model calls, and the ones that do need reasoning are already lower stakes because you are paying with local compute you already own.

None of this is "self-healing" in the sense some vendors market it. When the replay cache misses, the model has to re-figure out the flow using the same reasoning it used the first time, just against a slightly different page. That works well when the change is a moved button or a renamed label. It works less well when the change is a fundamentally different flow (a new multi-step checkout instead of a single-page one), and no amount of local model horsepower fixes a test that is now checking the wrong thing conceptually.

## Setting Up Ollama and BrowserBash

Start with the two installs. Ollama needs to be running locally with a model pulled before BrowserBash will pick it up automatically.

```bash
# install BrowserBash globally
npm install -g browserbash-cli

# pull a mid-size model (see model sizing section below)
ollama pull qwen3:32b
```

With Ollama serving that model, a single BrowserBash run needs no configuration at all:

```bash
browserbash run "Go to https://staging.example.com/login, sign in with test@example.com and TestPass123, and confirm the dashboard loads" --headless --timeout 120
```

If Ollama is running and a model is pulled, BrowserBash finds it without you setting an API key or a `--provider` flag. That is the whole point of the Ollama-first resolution order: the free path is also the path of least resistance, not an obscure flag you have to remember.

For a nightly suite, though, you are not running one objective, you are running a folder of them.

## Structuring the Test Suite as Markdown Files

BrowserBash tests live as committable `*_test.md` files: plain-English steps, `@import` for shared setup, `{{variables}}` for anything environment-specific or secret. A typical login-and-checkout regression file looks like this:

```
# Login and add to cart

@import ./shared/login.md

- Search for "wireless mouse" in the search bar
- Click the first product result
- Click "Add to cart"
- Verify 'Cart' link text contains "1"
- Verify text "wireless mouse" visible
```

That `Verify` line is not agent judgment, it compiles to a real Playwright assertion (a text-visibility check and an element-text check), so even when the reasoning steps above it were handled by a local model, the pass/fail line itself is deterministic. This distinction matters a lot for a nightly suite you plan to trust unattended: you want a local model deciding how to navigate a flow, but you do not want it deciding whether the assertion at the end passed. `Verify` steps in the recognized grammar (URL contains, title is/contains, text visible, a named button/link/heading visible, element counts, stored value equals) skip the model entirely and get checked directly against the page. Anything outside that grammar still runs, just agent-judged, and gets flagged `judged: true` in the results so you can tell which assertions are hard checks and which are opinions.

Organize your nightly suite as a folder, one file per critical path, with shared login or setup steps pulled in via `@import` so you are not repeating six lines of credentials logic in every file. Keep the folder in version control, next to the app it tests, the same way you would keep Playwright specs. The [tutorials](https://browserbash.com/tutorials) walk through the full `*_test.md` grammar if you want more examples before writing your own.

## Wiring Up run-all for the Whole Suite

A single `browserbash run` command does not scale to a real regression suite. `run-all` is the orchestrator: point it at a directory, and it discovers every `*_test.md` file, runs them with memory-aware parallelism, and produces a suite-level verdict.

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml --headless
```

Concurrency is derived from actual CPU and RAM on the machine running the job, not a hardcoded worker count, so the same command behaves sensibly whether you are running it on a beefy CI runner or a laptop left on overnight. `run-all` also orders tests failed-first and slowest-first based on run history, so if last night's run left three tests red, tonight's run surfaces those results early instead of burning through 40 minutes of green tests before you learn something broke.

Because you are running a nightly suite unattended, it is worth adding a `--budget-usd` ceiling even when you expect the whole run to be local and free. Some nights your Ollama process might not be running (a restart, a crashed service), and BrowserBash's provider resolution will fall through to a hosted key if one is configured as a fallback. A budget stop protects against that scenario burning real money while you are asleep:

```bash
browserbash run-all .browserbash/tests --junit out/junit.xml --budget-usd 2.00 --headless
```

If the suite crosses that budget, `run-all` stops launching new tests, marks the remainder `skipped`, exits with code 2, and records the spend in both `RunAll-Result.md` and the JUnit `<properties>` block, so the failure is visible in whatever CI or log aggregation you already have.

## Scheduling the Nightly Run with Cron

The scheduling half of this is intentionally boring: cron. There is nothing BrowserBash-specific about triggering a shell script on an interval, which is a feature, not a gap, because it means you can run this on any machine you already control, no new infrastructure required.

A minimal crontab entry, running at 2am server time:

```bash
0 2 * * * cd /opt/myapp && /usr/local/bin/browserbash run-all .browserbash/tests --junit out/junit-$(date +\%Y\%m\%d).xml --headless --budget-usd 2.00 >> /var/log/browserbash-nightly.log 2>&1
```

A few practical notes if you go this route. First, cron jobs run with a minimal environment, so make sure Ollama is set up as a system service (or otherwise guaranteed running) before the cron job fires, not something you start manually each morning. Second, use `--headless` for anything unattended; a headed browser popping up on a server with no display attached will just fail. Third, timestamp your JUnit output so you keep a rolling history instead of overwriting last night's results, which matters when you are trying to spot a flaky test versus a real regression across several nights.

If you would rather not manage a crontab and want alerting baked in, BrowserBash's monitor mode is a lighter-weight alternative for a subset of your suite (the handful of paths you truly cannot afford to have silently break):

```bash
browserbash monitor .browserbash/tests/checkout_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Monitor mode alerts only on state changes, pass to fail or fail to pass, never on every green check, and because it reuses the same replay cache, an always-on monitor stays close to token-free between actual page changes. Cron plus `run-all` is the right shape for a full nightly suite with dozens of files; monitor mode is the right shape for three or four paths you want checked every few minutes, not once a night.

## Model Sizing: What Actually Works Overnight

This is the part where honesty matters more than enthusiasm. Not every local model that Ollama can run is a good fit for driving a browser through a multi-step regression flow, and pretending otherwise sets you up for a suite full of confusing, non-reproducible failures.

Very small local models, roughly 8B parameters and under, are flaky on long multi-step objectives. They tend to lose track of what step they are on, misread a page state, or declare a flow complete when it is not. For a nightly suite where you are not there to watch it run, that flakiness is expensive in a different currency than API cost: it is expensive in trust. A test that fails for no reproducible reason trains your team to ignore the nightly report, which defeats the entire point of running one.

The sweet spot for unattended regression work is a mid-size local model in the Qwen3 or Llama 3.3 70B-class range, or a capable hosted model reserved specifically for your hardest flows. These models are large enough to hold a multi-step objective in context, read a page snapshot accurately, and recover reasonably when a replay cache miss forces them to re-derive a flow. They are not infallible, and they are slower per step than a small model, but for an overnight job where wall-clock time is cheap and correctness is the thing you are actually buying, that tradeoff favors the bigger model every time.

Here is a rough field guide, based on how these size classes tend to behave against real staging apps rather than benchmark numbers, which BrowserBash makes no claims about and this article will not invent either:

| Model class | Nightly regression fit | Where it struggles |
|---|---|---|
| ~7-8B local (Llama 3.1 8B, Qwen2.5 7B) | Weak. Fine for a single simple objective, unreliable across a full suite | Multi-step flows, ambiguous page states, longer objectives |
| ~30-32B local (Qwen3 32B class) | Good default for most nightly suites | Very dynamic pages, heavy JS-driven UI shifts, subtle visual regressions |
| ~70B local (Llama 3.3 70B class) | Strong, closest to hosted-model reliability for structured flows | Slower per step, needs meaningfully more RAM/VRAM to run well |
| Hosted Claude / OpenAI (bring your own key) | Best reliability, worth it for your 3-5 highest-value flows | Not free, defeats part of the "zero cost" premise if used suite-wide |

A practical pattern many teams land on: run the bulk of the nightly suite (the 80% of tests checking stable, well-understood flows) on a 30-70B local model for zero cost, and reserve a hosted model, gated behind an environment variable that is only set for a handful of test files, for the two or three flows that are genuinely gnarly (complex multi-tab checkout, a flow with heavy conditional logic). That is not something BrowserBash automates for you today, but nothing stops you from splitting your test folder into `tests/local/` and `tests/hosted/` and running two `run-all` invocations with different environment variables in your cron script.

## Handling Login State Without Re-Authenticating Every Test

One thing worth calling out for nightly suites specifically: every test in BrowserBash gets a fresh browser context by default, which means without saved auth, your login sequence runs at the top of every single file, every single night. For a 40-file suite, that is 40 logins, each one a multi-step flow a local model has to reason through, each one a place a small model can stumble.

Saved logins fix this. Run the login flow once interactively, save the session, then reference it by name from every test file that needs to start already authenticated:

```bash
browserbash auth save staging-user --url https://staging.example.com/login
```

That opens a browser, you log in by hand once, hit Enter, and BrowserBash saves the session (a Playwright storageState) under that name. From then on, either pass `--auth staging-user` on the command line or add an `auth:` frontmatter line to a test file, and that test starts already logged in, no login steps required, no model reasoning spent re-deriving a flow it already knows works. This alone measurably cuts down on how much reasoning a local model has to do per nightly run, which both speeds up the suite and reduces the surface area where a smaller model can go wrong.

## Getting Deterministic Setup Data with testmd v2

A recurring pain point in nightly regression is state: a checkout test needs a cart with items in it, an admin test needs a user account in a specific state, and getting there through pure UI clicking is slow and adds more model-reasoned steps than you want. testmd v2 addresses this by letting a test file mix deterministic API steps with UI verification, all in one session:

```
---
version: 2
---
# Seed cart then verify checkout page

POST https://staging.example.com/api/cart/items with body {"sku": "MOUSE-01", "qty": 1}
Expect status 201, store $.cart.id as 'cartId'

- Go to https://staging.example.com/checkout
Verify text "MOUSE-01" visible
Verify stored 'cartId' value equals "expected-cart-id"
```

The API step and the `Verify` lines are fully deterministic, no model involved at all. Only the plain-English navigation step in the middle needs the agent. This is a good pattern to lean on for nightly suites where you want maximum reliability: push as much setup and assertion as possible into the deterministic API/Verify layer, and reserve the model-driven steps for the parts that genuinely require reading and interacting with a rendered page. Worth flagging honestly: testmd v2 currently runs on the builtin engine, which needs `ANTHROPIC_API_KEY` or a compatible gateway, not Ollama directly. If your whole point is zero API cost, keep v2 files to a small, high-value subset of your suite and run the rest on plain v1 files against your local model.

## Reading the Results Without Watching the Run

Nightly runs are, by definition, unattended, so the output format matters more than it would for a run you are watching live. `run-all --junit` produces a JUnit XML file that slots into whatever CI dashboard or log pipeline you already have, and BrowserBash writes a human-readable `Result.md` per test alongside it, useful for the morning-after read where you want the actual assertion evidence, not just a pass/fail count. For teams that want a lighter-weight way to browse recent nightly history without standing up any infrastructure, the local dashboard shows recent runs entirely from disk:

```bash
browserbash dashboard
```

Nothing in the local dashboard leaves your machine, which fits the same zero-cost, zero-dependency spirit as the local-model setup itself. If you eventually want the nightly history visible to a team rather than just the machine that ran it, the optional cloud dashboard (`browserbash connect` plus `--upload`) gives 15-day retention without requiring you to change anything about how the suite itself runs.

## When This Setup Is the Right Fit, and When It Isn't

Be honest with yourself about what a nightly regression suite free ai models can drive is actually good at. It is a strong fit for stable, well-trodden critical paths on a staging environment you control, where the replay cache does most of the work most nights and a mid-size local model only has to reason from scratch occasionally. It is a weaker fit for a product in a phase of rapid, structural UI churn, where the replay cache misses constantly and you are leaning on model reasoning every single run, which is exactly where a smaller local model's flakiness shows up most.

If your team is pre-product-market-fit and shipping structural changes weekly, you will get more value running fewer tests, on a stronger model, less often, than running a large suite nightly on a small local model that keeps producing noisy failures nobody trusts. If your product has settled into a stable core with a handful of flows that genuinely must not break, this is close to the ideal setup: cron, `run-all`, a 30-70B local model, saved auth, and a `--budget-usd` safety net, running every night for the cost of the electricity it takes to run Ollama. The [features page](https://browserbash.com/features) and [case studies](https://browserbash.com/case-study) are worth a read if you are still deciding whether a nightly suite like this fits your team's stage.

For teams already standardized on GitHub, the same test files and the same `run-all` invocation work in CI through the [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), so a nightly cron job on a spare machine and a pull-request check in CI can share one test suite instead of maintaining two. And if you want an AI coding agent (Claude Code, Cursor, or similar) to be able to trigger these same regression checks on demand rather than waiting for the nightly cron, the [MCP server](https://browserbash.com/features) exposes `run_suite` as a tool call any MCP-compatible agent can invoke directly.

## FAQ

### Can BrowserBash run a full regression suite with zero API cost?

Yes, as long as Ollama is running locally with a model pulled, BrowserBash resolves to that local model automatically before checking for any hosted API keys. Combined with the replay cache, which skips the model entirely on unchanged pages, most nightly runs against a stable staging environment end up making very few or zero model calls after the first run establishes the cache.

### What is the smallest local model that works reliably for nightly tests?

Models around 8B parameters and under tend to be flaky on multi-step objectives and are not recommended for unattended nightly runs. A mid-size model in the 30B to 70B class (Qwen3 or Llama 3.3 class) is a more reliable baseline, trading some speed for meaningfully better consistency across a full suite.

### How do I stop a nightly run from silently costing money if it falls back to a hosted model?

Add `--budget-usd` to your `run-all` command. If the suite's estimated spend crosses that threshold, BrowserBash stops launching new tests, marks the rest skipped, exits with code 2, and records the spend in the results and JUnit output, so a fallback to a paid provider cannot run unchecked overnight.

### Do I need to log in at the start of every test file in a nightly suite?

No. Save a session once with `browserbash auth save <name> --url <login-url>`, then reference it with `--auth <name>` or an `auth:` frontmatter line in each test file. Tests start already authenticated, which cuts down on both run time and the amount of model reasoning needed per test.

Getting started takes one command: `npm install -g browserbash-cli`. Pull a model in Ollama, drop your first test file in a `.browserbash/tests` folder, and wire up a cron entry when you are ready to let it run unattended. An account is entirely optional; [sign up](https://browserbash.com/sign-up) only if you want the cloud dashboard later.
