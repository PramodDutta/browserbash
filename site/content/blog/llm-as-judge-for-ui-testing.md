---
title: LLM-as-Judge for UI Testing: When It Works and When It Fails
description: "LLM as judge UI testing explained: where model-judged verdicts beat brittle selectors, where they quietly lie, and how to keep the two auditable."
date: 2026-08-06
category: llm
---

LLM as judge UI testing is the practice of letting a language model decide whether a screen looks right, instead of asserting an exact selector, attribute, or DOM node. You describe the outcome in plain English, an agent drives a real browser, and the model returns a verdict. It is a genuinely useful shift for anyone tired of maintaining page objects that shatter the moment a designer renames a class. It is also, if you are not careful, a way to ship tests that pass for the wrong reasons and fail for reasons no one can explain. This article is an honest map of both territories: where model-judged checks earn their keep, where they quietly mislead you, and how a single `judged: true` flag lets you keep the line between the two visible in every run.

## What "LLM as judge" actually means in a UI test

A traditional end-to-end test is a chain of precise instructions and precise assertions. Click the element with `data-testid="submit"`. Expect the URL to contain `/dashboard`. Expect an element matching `.welcome-banner` to be visible. Every step is a literal contract with the DOM. It is deterministic, which is a polite way of saying it breaks the instant the DOM changes, even when nothing a user cares about has changed.

An LLM-judged test replaces some or all of those literal contracts with intent. You write "log in and confirm the user lands on their dashboard" and hand it to an agent. The model reads the page, decides what "the dashboard" means, and reports pass or fail. Nobody wrote a selector. Nobody named a test id. The judgment lives in the model's read of the rendered page.

That is the appeal and the danger in one sentence. The model is flexible enough to survive a redesign, and flexible enough to declare victory when it should not. UI testing with an LLM judge is not a replacement for deterministic assertions; it is a second tool with a different failure mode, and the whole game is knowing which one you are holding.

[BrowserBash](https://browserbash.com/features) is built around exactly that distinction. It is a free, open-source natural-language browser automation CLI. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors and no page objects, and you get a verdict plus structured results. Crucially, it does not pretend every check is equal. Some checks compile to real Playwright assertions with zero model judgment. Others are judged by the model. And BrowserBash tells you, in the output, which is which.

## Where LLM-as-judge genuinely works

Model-judged verdicts shine wherever the intent is stable but the implementation is volatile. A few concrete cases from real UI work.

### Redesigns and component churn

A marketing team reskins the pricing page every quarter. The class names change, the grid collapses into cards, the CTA moves. A selector-based test needs a rewrite each time. An objective like "confirm the pricing page shows three plans and a way to start a free trial" survives all of it, because the model judges the rendered outcome, not the markup. When your churn rate on markup is high and your churn rate on intent is near zero, an LLM judge is the cheaper long-term contract.

### Content and copy that a human would recognize but a regex would not

"Verify the confirmation message reassures the user their order shipped." There is no clean selector for reassurance. A human reviewer glances and knows. A model can approximate that glance. This is the softest, most subjective end of testing, and it is precisely where deterministic assertions have never had a good answer. An LLM judge at least gives you *something* automatable here, as long as you treat its verdict as advisory rather than gospel.

### Exploratory and smoke coverage on flows you have not hardened yet

Early in a project, before you know which flows matter, writing 40 precise assertions is premature. A handful of plain-English objectives gives you fast, cheap smoke coverage. You can point BrowserBash at a new feature the day it lands:

```bash
browserbash run "Open the app, sign up with a new email, and confirm the onboarding checklist appears" --agent --headless
```

That single line is worth more on day one than a perfectly engineered page object you will delete in a sprint. The model absorbs the ambiguity you have not yet resolved.

### Driving the flow, even when a human judges the result

There is a subtler win. Even when you want a hard, deterministic assertion at the end, you often still want an LLM to *drive*. Navigating a multi-step checkout without selectors, handling a cookie banner that appears half the time, clicking through an interstitial: that is agent work. LLM-as-judge and LLM-as-driver are separable, and you can pair a smart driver with a strict, non-judged final check. More on that below, because it is the pattern that makes all of this trustworthy.

## Where LLM-as-judge fails, and why it fails quietly

Now the honest part. Model-judged UI testing has failure modes that deterministic assertions simply do not have, and the worst ones are silent.

### False passes are the real hazard

A flaky selector that fails loudly is annoying. A model that reports PASS on a broken page is dangerous, because a green run buys trust you did not earn. Models are agreeable. Ask "did the user log in successfully?" on a page that half-loaded, and a model may generously decide the visible header counts as success. The test goes green. The bug ships. Nobody looks, because why would you look at a passing test.

### Non-determinism across runs

The same page can yield different verdicts on different runs, especially near the boundary of "good enough." Deterministic assertions give you the same answer every time by construction. A judge does not. For a gate that blocks a deploy, run-to-run variance is not a quirk, it is a liability. You cannot bisect a regression cleanly when the oracle itself wobbles.

### Small local models drift on long flows

BrowserBash defaults to local models through Ollama first, which is excellent for privacy and cost. But be honest about the tradeoff: very small local models, roughly 8B parameters and under, get flaky on long multi-step objectives. They lose the thread, forget an earlier step, or misjudge a subtle state. The sweet spot for hard flows is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. If you are judging a ten-step flow with a 7B model, the failure you see may be the judge, not the app.

### No evidence by default

When a selector assertion fails, you know exactly what was expected and what was found. When a naive model judge fails, you often get "it looked wrong," which is not a bug report. Without expected-versus-actual evidence, a failing judged check sends an engineer on an unguided hunt. Evidence is not a nice-to-have here; it is the difference between a triageable failure and a shrug.

## The deterministic alternative, and why you still want both

The answer to a flaky judge is not to abandon models. It is to compile the checks that *can* be deterministic into real, literal assertions, and reserve the judge for the checks that genuinely cannot be.

BrowserBash does this with `Verify` steps in a testmd file. A `Verify` line that fits a defined grammar compiles to a real Playwright check with no LLM judgment at all. The supported forms cover most of what a UI assertion actually needs:

- URL contains a string
- title is or contains a string
- specific text is visible
- a named button, link, or heading is visible (`'Checkout' button visible`)
- element counts
- a stored value equals an expected value

A pass means the condition literally held. A fail comes with expected-versus-actual evidence, both in the `run_end.assertions` block and in the human-readable Result.md assertion table. That is the deterministic half: reproducible, evidence-backed, and immune to a model's mood.

Here is the part that makes the whole approach auditable rather than muddled. A `Verify` line that falls *outside* the grammar still runs, but it runs agent-judged, and BrowserBash flags it `judged: true`. You are never left guessing whether a given check was a hard Playwright assertion or a model's opinion. The flag is right there in the structured output.

### The judged flag as an audit trail

Think about what `judged: true` buys you at scale. You can scan a suite and count exactly how many of your assertions are deterministic and how many rest on model judgment. You can set a policy: deploy gates may only depend on non-judged checks, while judged checks are advisory and reported but never block. You can watch the ratio over time and deliberately migrate high-value judged checks into the deterministic grammar as the flow stabilizes. Without that flag, "we use AI for testing" is a black box. With it, you have a ledger.

## A comparison you can reason about

| Dimension | Deterministic `Verify` (no LLM) | LLM-judged check (`judged: true`) |
| --- | --- | --- |
| Reproducibility | Same verdict every run | Can vary run to run near the boundary |
| Evidence on failure | Expected vs actual, in assertions table | Model's read; weaker unless prompted well |
| Survives a redesign | No, breaks on markup change | Often yes, judges intent |
| False-pass risk | Very low | Real, and silent |
| Handles subjective copy | No | Yes, approximately |
| Cost per run | Near zero on replay | Model call unless cached |
| Good for deploy gates | Yes | As advisory signal, not sole gate |
| Setup effort | Must fit the grammar | Just write the sentence |

Read that table as a division of labor, not a contest. The deterministic column is your gate. The judged column is your reach into the ambiguous. A mature suite uses both on purpose and knows, per check, which one it is leaning on.

## The pattern that makes it trustworthy: seed deterministically, judge narrowly

The strongest setup combines a deterministic backbone with agent flexibility in the middle and a hard assertion at the end. BrowserBash's testmd v2 format is built for exactly this shape. Add `version: 2` to a test file and steps execute one at a time against a single browser session. Two step types never touch a model: API steps that seed or check data, and `Verify` steps. Consecutive plain-English steps run as grouped agent blocks on the same page.

So you seed state through an API with a deterministic step, let the agent drive the UI in plain English, then close with a deterministic `Verify` that cannot be talked into a false pass.

```
---
version: 2
---

# Order confirmation shows the seeded order

POST /api/test/orders with body { "item": "Blue Mug", "qty": 2 }
Expect status 201, store $.id as 'orderId'

Open the orders page and click the most recent order

Verify text "Blue Mug" is visible
Verify title contains "Order"
```

The `POST` and both `Verify` lines are deterministic. The "Open the orders page and click the most recent order" line is the agent doing what agents are good at. The judgment about whether the right order appears is a literal text check, not a vibe. That is how you get the flexibility of an LLM driver without inheriting the false-pass risk of an LLM judge on the assertion that matters.

One honest constraint: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly. If your whole point is fully local execution, v2 is not there yet, and you should keep judged checks in v1 files on a local model for now. The [tutorials](https://browserbash.com/tutorials) walk through both paths.

## Cost, caching, and why judged checks are not as expensive as you fear

A reasonable objection to LLM-as-judge is cost. Every judged check is a model call, and model calls add up across a suite run hundreds of times a day. BrowserBash blunts this in two ways.

First, the replay cache. A green run records its actions. The next identical run replays them with zero model calls, and the agent only steps back in when the page actually changed. For a stable flow, your judged check effectively costs nothing on the repeat runs, which is most of them.

Second, cost is measured, not guessed. Every `run_end` carries a `cost_usd` estimate from a bundled per-model price table. Unknown models get no estimate rather than a wrong one, which is the honest choice. You can cap a suite hard:

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

Once the suite crosses the budget, BrowserBash stops launching new tests, reports the remainder as `skipped`, exits with code 2, and records the spend in RunAll-Result.md and JUnit properties. Combined with `--model-exec` cheap-model routing, where you plan on a strong model and execute on a cheaper one, the running cost of a judged suite is controllable rather than open-ended. The [pricing page](https://browserbash.com/pricing) lays out what stays free forever, which is everything that runs on your machine.

## Keeping judged checks honest in CI and monitoring

The `judged: true` flag matters most where humans stop looking: continuous integration and always-on monitors.

In CI, `--agent` mode emits NDJSON, one JSON event per line, with `step` and `run_end` events. Exit codes are frozen and unambiguous: 0 passed, 1 failed, 2 error or infra or budget-stop, 3 timeout. Your pipeline can read the `assertions` array, split it by the `judged` flag, and enforce policy in code. A common rule: fail the build only on a non-judged assertion failure, and surface judged failures as warnings on the PR. The official GitHub Action posts a self-updating PR comment with the verdict table, so reviewers see judged and deterministic results side by side without digging through logs.

For monitoring, the flag keeps you from paging a human at 3 a.m. over a model's mood swing. BrowserBash monitor mode alerts only on pass-to-fail and fail-to-pass state changes, never on every green run:

```bash
browserbash monitor ./checkout_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Because the replay cache makes an always-on monitor nearly token-free, you can afford to watch a critical flow every ten minutes. Point that monitor at a test whose final gate is a deterministic `Verify` and you get the best of both: an agent driving the real flow, a hard assertion deciding the verdict, and Slack pinged only when the state actually flips. If you must monitor a judged check, know that its state changes will be noisier, and treat the alert as "look at this," not "the site is down."

## A pragmatic decision guide

When should you reach for a model judge, and when should you insist on a deterministic assertion?

**Choose an LLM-judged check when:**

- The intent is stable but the markup changes often, so selectors are a maintenance tax.
- The thing you are checking is subjective, like tone, reassurance, or "does this look like an error state."
- You are smoke-testing a new flow you have not hardened and want coverage today, not next sprint.
- You need an agent to *drive* an unpredictable path, even if the final assertion is deterministic.

**Choose a deterministic `Verify` when:**

- The check gates a deploy or blocks a merge. Gates must be reproducible.
- You need clean expected-versus-actual evidence for fast triage.
- The condition fits the grammar cleanly: URL, title, visible text, a named button or link or heading, a count, a stored value.
- Run-to-run stability matters more than surviving a redesign.

**Use both, deliberately, when:** the flow is real and important. Seed with API steps, drive with plain-English agent blocks, assert with `Verify`. Let the `judged: true` flag record where you leaned on judgment so future-you can migrate those checks into the deterministic grammar as the flow settles.

The mistake is not using an LLM judge. The mistake is not knowing you did. A suite where half the assertions are quietly model opinions, unlabeled, is a suite whose green is meaningless. A suite that labels every judged check and gates only on the deterministic ones is one you can actually trust. You can migrate a whole legacy suite toward this with `browserbash import`, which converts Playwright specs to plain-English tests heuristically with no model in the loop, and drops anything untranslatable into an IMPORT-REPORT.md instead of inventing it. From there you decide, check by check, which assertions stay literal and which become judged.

## Getting started

If you want to see the split for yourself, install the CLI and run one objective, then convert a real check into a deterministic `Verify` and watch the `judged` flag flip in the output. The [GitHub repository](https://github.com/PramodDutta/browserbash) and the [blog](https://browserbash.com/blog) have deeper walkthroughs, and the [learn hub](https://browserbash.com/learn) covers testmd end to end.

## FAQ

### Is LLM-as-judge reliable enough for UI testing?

It is reliable for the right jobs and unreliable for the wrong ones. Model judgment works well for subjective checks and flows with volatile markup but stable intent, and it is risky as the sole gate for a deploy because it can produce silent false passes and vary run to run. The practical answer is to use it alongside deterministic assertions, gate on the deterministic ones, and keep judged checks advisory and clearly labeled.

### How is a deterministic assertion different from an LLM-judged check in BrowserBash?

A deterministic `Verify` step compiles to a real Playwright check with no model involvement, so a pass means the condition literally held and a fail comes with expected-versus-actual evidence. An LLM-judged check runs when a Verify line falls outside the supported grammar; the model decides the outcome and BrowserBash marks it `judged: true` in the structured output. The flag lets you tell exactly which verdicts were literal and which rested on model judgment.

### Do I need an API key to run LLM-judged UI tests?

Not for the default path. BrowserBash is Ollama-first and can run entirely on free local models with no API keys and nothing leaving your machine. Note two things: very small local models around 8B and under get flaky on long multi-step flows, so a mid-size or hosted model is better for hard cases, and testmd v2 currently needs the builtin engine with an Anthropic key or a compatible gateway rather than Ollama directly.

### How do I stop LLM judgment from making my test suite non-deterministic?

Push every check you can into the deterministic `Verify` grammar, which covers URL, title, visible text, named buttons or links or headings, counts, and stored values, and reserve model judgment for checks that genuinely cannot be expressed literally. Gate your CI only on non-judged assertions by reading the `judged` flag in the NDJSON output, and use testmd v2 to seed state through deterministic API steps so the model never has to guess about data it could have been told.

Ready to try it? Install with `npm install -g browserbash-cli` and run your first objective in under a minute. An account is optional and everything on your machine stays free, but if you want the hosted dashboard you can [sign up here](https://browserbash.com/sign-up).
