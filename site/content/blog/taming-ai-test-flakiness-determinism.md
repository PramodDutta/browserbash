---
title: Taming AI Test Flakiness: Determinism in Agentic Tests
description: "AI test flakiness determinism explained: the replay cache, deterministic Verify and API steps, model choice, and flaky flags that steady agentic tests."
date: 2026-08-07
category: agents
---

If you have run a test where an AI agent drives the browser, you already know the strange new failure mode. The same plain-English objective passes on Monday and fails on Tuesday, and nothing in your app changed. That gap is the heart of ai test flakiness determinism: an agent that reads the page and decides what to do next introduces variance that a hand-written selector script never had. The good news is that flakiness in agentic tests is not a mystery you have to accept. It comes from specific, nameable sources, and each one has a lever you can pull. This article walks through those sources and the levers BrowserBash gives you to reduce them, so an agent-driven suite can be trustworthy enough to gate a deploy.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write an objective in plain English, an AI agent drives a real Chrome or Chromium browser step by step, and you get back a deterministic verdict plus structured results. That last phrase matters for this topic. The design pushes toward a stable verdict even though a language model sits in the loop.

## Why agentic tests go non-deterministic in the first place

A traditional Playwright or Selenium script is deterministic by construction. You wrote `page.click('#submit')`, so the same click happens every run. The only variance is the app and the network. Agentic tests move the decision of what to click into a model at runtime, and models are probabilistic. Ask the same model the same question twice and you can get two different token sequences, which means two different chains of browser actions.

That probabilistic core shows up in a few concrete ways. The agent might phrase its plan differently and take a longer path to the same goal. It might interpret an ambiguous instruction like "open the account page" as the profile menu on one run and a footer link on another. On a slow render it might act before the element is present, then recover, then not recover the next time. And small models make all of this worse. Very small local models, roughly 8B parameters and under, tend to lose the thread on long multi-step objectives, so a five-step login-and-checkout flow that a larger model nails will wobble on a tiny one.

None of this means agentic testing is unusable. It means you need to know which parts of your suite need judgment and which are just checks a machine should perform the same way every time. Determinism is not about removing the agent. It is about shrinking the surface where the agent can improvise, then pinning the rest.

### The two kinds of variance

It helps to separate variance into two buckets. The first is planning variance: the agent chooses a different route through the UI. The second is verdict variance: the same end state gets judged pass on one run and fail on another because a language model was asked "did this work?" and answered inconsistently.

Verdict variance is the more dangerous of the two, because it erodes trust directly. A flaky path that still reaches the right conclusion is annoying but survivable. A flaky verdict means your green build is a coin flip. BrowserBash attacks both, but it attacks verdict variance hardest, because that is where a test framework earns or loses its credibility.

## Lever one: the replay cache pins the happy path

The replay cache is the single biggest determinism win, and it works on a simple idea. When a run passes, BrowserBash records the concrete actions the agent took. The next time you run the identical objective, it replays those recorded actions with zero model calls. The agent only steps back in when the page has actually changed and a recorded action no longer applies.

Think about what that does to variance. On the first green run, the model made all the decisions. On every subsequent run against an unchanged page, there is no model in the loop at all, so there is nothing left to be probabilistic about. You have effectively compiled a fuzzy English objective down to a fixed action sequence, and you keep running the fixed version until the page forces a recompile.

This is why an always-on monitor becomes practical. Because the cache replays the happy path token-free, you can point a monitor at a critical flow and run it every few minutes without burning API budget on every green check.

```bash
browserbash monitor "Log in and confirm the dashboard loads" \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Monitor mode alerts only on pass-to-fail and fail-to-pass state changes, never on every green run. Combined with the cache, a stable flow stays quiet and cheap, and you hear about it the moment the state flips.

### What the cache does not fix

Be honest with yourself about the boundary. The cache pins a path you already validated. It does not make a genuinely ambiguous objective unambiguous, and it does not help the very first run of a brand-new test, which still relies fully on the model. If your app legitimately changes on every run (a rotating promo banner, a randomized layout), the cache will keep missing and the agent will keep stepping back in, so you get less determinism benefit there. Knowing that, you write your objectives to target the stable parts of the page and let deterministic checks handle the rest.

## Lever two: deterministic Verify assertions remove the model from the verdict

This is the lever that kills verdict variance. A `Verify` step in a testmd file compiles to a real Playwright check, with no language model judgment involved. If you write `Verify the page title contains "Dashboard"`, that becomes an actual title assertion. It passes when the condition genuinely held and fails with expected-versus-actual evidence attached, both in the `run_end.assertions` block and in the human-readable Result.md assertion table.

The grammar covers the checks you reach for most: URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and a stored value equals. Because these compile to Playwright, the same DOM state produces the same result every single time. There is no run where the model was feeling generous and called a broken page a pass.

BrowserBash is careful here rather than absolutist. If you write a `Verify` line that falls outside the deterministic grammar, it still runs, but it runs agent-judged and gets flagged `judged: true` in the output. That flag is the important part. You can look at any assertion and know instantly whether a machine checked it exactly or a model made a call. When you are debugging a flaky verdict, that distinction tells you where to look first.

A practical pattern: let the agent handle the fuzzy navigation, then land every real assertion on a deterministic `Verify`. The agent can wander a little on the way to the cart page, but the check "Verify the 'Checkout' button is visible" is bolted down. Your path can breathe while your verdict stays rigid.

## Lever three: testmd v2 and deterministic API steps

testmd v2 raises the ceiling on control. Add `version: 2` to a test file's frontmatter and the steps execute one at a time against a single browser session, instead of being joined into one big objective. That alone reduces variance, because each step is a smaller, more constrained ask.

More importantly, v2 introduces two step types that never touch a model. API steps let you call an endpoint directly with `GET`, `POST`, `PUT`, `DELETE`, or `PATCH`, optionally with a body, and assert on the response with `Expect status N`, storing values out of the JSON for later steps. Verify steps then check the result through the UI. The combination is powerful for the classic flaky scenario: you need known data to exist before the UI test can be trustworthy. Instead of asking the agent to click through a data-creation flow (slow, and a source of variance you do not care about), you seed the data over the API deterministically, then verify it in the browser.

```markdown
---
version: 2
---
# Order appears in history

POST /api/orders with body { "sku": "TSH-01", "qty": 2 }
Expect status 201, store $.id as 'orderId'

Open the orders page
Verify the text "TSH-01" is visible
Verify the 'Order #{{orderId}}' heading is visible
```

The API step is pure HTTP, fully reproducible. The plain-English step in the middle runs as an agent block on the same page. The Verify steps are deterministic checks. You have surrounded the one fuzzy step with hard walls on both sides, which is exactly the shape a stable agentic test should have.

One honest caveat: testmd v2 currently drives the builtin engine, which speaks the Anthropic API. So v2 needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. Your v1 files (no frontmatter) keep behaving exactly as before, so nothing you already wrote breaks.

## Lever four: model choice is a determinism decision

People treat model selection as a cost or speed question. For flakiness it is also a reliability question. A capable model plans more consistently and recovers from timing hiccups more gracefully, so it produces less planning variance on hard, multi-step flows.

BrowserBash is Ollama-first by design. It defaults to free local models, needs no API keys, and keeps everything on your machine. When you ask for `auto`, it resolves in order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. That default is great for privacy and cost, but you should size the model to the difficulty of the flow.

Here is the honest guidance. Very small local models, around 8B and under, are flaky on long multi-step objectives. They lose track of where they are in a flow. The sweet spot for reliability is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. For a two-step smoke check, a small model is fine. For a ten-step checkout with conditional branches, reach for something with more headroom, because the extra capability shows up directly as fewer flaky runs.

### Cheap-model routing without losing stability

You do not have to pay for the strong model on every action. Cheap-model routing lets you plan on a strong model and execute on a cheap one via `--model-exec`. The hard reasoning about what to do happens on the capable model, while the mechanical execution runs cheaply. You get much of the determinism benefit of the strong model on the part that matters most, the planning, without the full cost. If you are weighing this against your budget, the [pricing page](https://browserbash.com/pricing) lays out what stays free forever, and the short version is that anything running on your own machine does.

## Lever five: run history and flaky flags surface residual test flakiness

Some flakiness will survive every other lever, because some of it lives in your app or your infrastructure, not in the agent. The answer is not to pretend it is gone. It is to make it visible and to stop letting it hide.

The `run-all` orchestrator keeps run history and uses it two ways. First, it orders execution failed-first and slowest-first, so the tests most likely to break run early and you find out fast. Second, it does flaky detection: a test that flips between pass and fail across runs gets flagged as flaky. That flag is the honest signal you need. Instead of an intermittent failure quietly poisoning your confidence, you get a named, tracked flaky test you can quarantine or fix.

The orchestrator is also memory-aware. Its concurrency is derived from real CPU and RAM, so parallel runs do not starve each other into timeout-driven flakiness, which is a genuine source of false failures on loaded CI machines. Determinism is not only about the model. A test that fails because it was fighting nine siblings for memory is just as flaky as one that failed on a model whim, and the orchestrator addresses that class too.

## Putting the levers together in CI

Determinism compounds when you stack these. A realistic CI setup looks like this: deterministic `Verify` steps for every real assertion, API steps to seed data, a mid-size or hosted model for the hard suites, the replay cache warming the happy paths, and the orchestrator sharding the work and flagging flakes.

```bash
browserbash run-all .browserbash/tests \
  --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

Sharding is deterministic on purpose. `--shard 2/4` computes its slice on sorted discovery order, so four parallel CI machines agree on who runs what without any coordination. That is determinism at the fleet level, not just the test level. The `--budget-usd` guard stops launching new tests once spend crosses your cap: remaining tests report `skipped`, the suite exits 2, and the spend lands in RunAll-Result.md and the JUnit properties. A budget stop is not a flaky failure, and the exit codes keep the two distinct.

Speaking of exit codes, they are a frozen contract and part of what makes the whole thing machine-trustworthy: 0 passed, 1 failed, 2 error or infra or budget-stop, 3 timeout. Run with `--agent` and you get NDJSON, one JSON event per line, built for CI and AI coding agents so nothing has to parse prose. A deterministic verdict is only useful if the thing consuming it can read it without guessing, and that is the point of the structured output.

### Determinism levers at a glance

| Source of flakiness | Lever | What it does |
| --- | --- | --- |
| Model re-plans the happy path | Replay cache | Replays recorded actions, zero model calls until the page changes |
| Verdict judged inconsistently | Deterministic `Verify` | Compiles to real Playwright checks, no LLM in the verdict |
| Data not present before UI check | testmd v2 API steps | Seed data over HTTP, fully reproducible |
| Weak model loses the thread | Model choice | Mid-size or hosted model for hard multi-step flows |
| Timing and resource contention | Memory-aware `run-all` | Concurrency sized to real CPU and RAM |
| Residual intermittent failures | Flaky flags + history | Surfaces and tracks flakes instead of hiding them |

## When agentic testing is the right call, and when it is not

Being balanced here matters more than selling. Agentic tests earn their keep when the UI changes often enough that hand-maintained selectors are a tax you keep paying, when you want tests a non-engineer can read and edit, and when you are validating AI agents or AI-built features where the whole point is behavior in plain terms. The natural-language layer plus deterministic assertions gives you readability without giving up a rigid verdict.

They are the weaker choice in a few honest cases. If you have a stable, mature UI and a mature Playwright suite that rarely breaks, the marginal benefit of an agent is small and you are adding a probabilistic component you do not need. If you require microsecond-level performance assertions or deeply deterministic unit-level checks, stay in a pure code framework. And if your only option is a very small local model on genuinely long flows, temper your expectations: that combination is where flakiness is hardest to tame, and you should either size up the model or shorten the flows.

If you are migrating rather than starting fresh, you do not have to rewrite by hand. The importer converts Playwright specs to plain-English test files heuristically, with no model, so the conversion itself is deterministic and reproducible. Common actions and locators translate, `process.env.X` becomes a `{{X}}` variable, and anything untranslatable lands in an IMPORT-REPORT.md instead of being silently dropped or invented.

```bash
browserbash import ./tests/e2e --out .browserbash/tests
```

You can also capture a flow by hand with `browserbash record <url>`, click through it once, and get a plain-English test out, with password fields never leaving the page. Between import and record, you can seed a deterministic-by-design suite quickly and then harden it with `Verify` steps. There is more on both in the [tutorials](https://browserbash.com/tutorials) and the wider [feature set](https://browserbash.com/features).

## Determinism for the agents themselves

There is a second audience for a deterministic verdict: other AI agents. BrowserBash ships an MCP server, so a coding agent can use it as its validation layer. Run `browserbash mcp` and it serves the CLI over the Model Context Protocol on stdio, and a one-line install drops it into any MCP host.

```bash
claude mcp add browserbash -- browserbash mcp
```

The exposed tools are `run_objective`, `run_test_file`, and `run_suite`, and each returns the structured verdict JSON: status, summary, final_state, assertions, cost_usd, duration_ms. The design choice that matters for determinism is subtle but important: a failed test is a successful validation. The tool call succeeds and the agent reads the verdict from the payload. The agent is not left guessing whether an error meant the harness broke or the app broke, because those are different things with different fields. When an agent writes code and needs to know if it works in a browser, a structured pass or fail it can trust is exactly the determinism this article is about, delivered to a machine instead of a human. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, with worked examples on the [learn hub](https://browserbash.com/learn) and the [blog](https://browserbash.com/blog).

## A short checklist for a steadier suite

Before you trust an agentic suite to gate deploys, run through this. Are your real assertions written as deterministic `Verify` steps rather than left to agent judgment? Are you seeding required data with API steps instead of clicking through creation flows? Is your model sized to the hardest flow in the suite? Are your happy paths warm in the replay cache so reruns are token-free? Are flaky tests flagged rather than quietly retried into a false green? Answer yes to those and you have shrunk the agent's freedom to the spots that need judgment and pinned everything else. That is what taming ai test flakiness determinism looks like in practice: not the absence of an agent, but an agent boxed in by deterministic walls.

## FAQ

### What causes flakiness in AI-driven browser tests?

Flakiness in agentic tests comes from the language model at the core making probabilistic decisions. The same objective can produce different action paths on different runs, and a model asked to judge a pass-or-fail verdict can answer inconsistently. Timing issues, weak or very small models on long flows, and infrastructure contention add more variance on top. The fix is to constrain where the model is free to improvise and pin everything else with deterministic checks.

### How does BrowserBash make agentic tests more deterministic?

BrowserBash reduces variance with several levers. The replay cache records a passing run's actions and replays them with zero model calls until the page changes. Deterministic Verify steps compile to real Playwright checks so the verdict never depends on model judgment. testmd v2 adds API steps for reproducible data seeding, and the run-all orchestrator flags flaky tests and sizes concurrency to real hardware.

### Are AI browser tests reliable enough for CI?

They can be, if you set them up with determinism in mind. Land every real assertion on a deterministic Verify step, seed data with API steps, warm your happy paths in the replay cache, and size your model to the hardest flow. With the frozen exit-code contract and NDJSON agent output, CI can consume a stable verdict without parsing prose. Suites built loosely, with agent-judged assertions and undersized models, will be less reliable.

### Does model choice affect test flakiness?

Yes, significantly. A more capable model plans more consistently and recovers from timing hiccups better, which means less planning variance on hard multi-step flows. Very small local models, around 8B and under, tend to lose the thread on long objectives, so the sweet spot for reliability is a mid-size local model in the 70B class or a capable hosted model. Cheap-model routing lets you plan on a strong model and execute on a cheaper one to balance cost against stability.

Ready to steady your agentic suite? Install with `npm install -g browserbash-cli` and start writing tests in plain English today. An account is optional, but if you want the hosted dashboard you can [sign up here](https://browserbash.com/sign-up).
