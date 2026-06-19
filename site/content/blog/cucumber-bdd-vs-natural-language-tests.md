---
title: Cucumber BDD vs Real Natural-Language Tests: What's the Difference?
description: "A Cucumber BDD alternative that runs from plain English with no step definitions or regex glue — compared honestly against Gherkin, command by command."
date: 2026-06-05
category: comparison
---

If you have written Cucumber tests, you already know the dirty secret: the Gherkin reads like English, but it does not run like English. The moment you write `When I add a "blue widget" to the cart`, you still have to go write a step-definition method, match it with a Cucumber Expression or a regex, and wire it to Selenium or Playwright code that actually clicks things. That gap is exactly why people start hunting for a Cucumber BDD alternative — they wanted plain-language tests and got a translation layer instead. This article pulls the two apart. We will look at what Gherkin genuinely is, why the step-definition glue exists and is not going away, and what it means for a test to run *directly* from natural language with no step defs at all. BrowserBash is the natural-language example here, and I will be honest about where Cucumber is still the better choice.

## The promise of BDD, and the part nobody reads aloud

Behavior-Driven Development was a reaction to brittle, test-only thinking. The idea was sound: describe behavior in the language the business uses, get the whole team — product, QA, dev — in one room, and capture acceptance criteria as executable specifications. Cucumber and its Gherkin syntax became the most popular vehicle for that, with `Given/When/Then` scenarios living in `.feature` files that a non-programmer can supposedly read and even write.

In a demo, this is beautiful. A product manager looks at a feature file and nods along:

```gherkin
Feature: Checkout
  Scenario: Apply a valid coupon
    Given I am on the cart page with one item
    When I apply the coupon "SAVE10"
    Then the order total should drop by 10 percent
```

That is genuine English. The problem is what it does *not* contain: any instruction a computer can follow. There is nothing here that says how to find the coupon field, what to type, where to click, or how to read the order total. The feature file is a label on a box. The contents of the box — the part that does the work — live somewhere else entirely. And that somewhere else is where the natural-language illusion ends.

## What Gherkin actually requires: step definitions and glue

Here is the mechanical truth of Cucumber that gets glossed over in BDD intros. Every single line in a scenario must be matched, at runtime, to a *step definition*: a function in your programming language, annotated so Cucumber can connect the prose to the code.

In cucumber-js it looks like this:

```javascript
const { When } = require('@cucumber/cucumber');

When('I apply the coupon {string}', async function (code) {
  await this.page.fill('#coupon-input', code);
  await this.page.click('#apply-coupon');
});
```

That `{string}` is a Cucumber Expression — the modern, more human-friendly replacement for the regular expressions that older Cucumber projects leaned on. Plenty of real codebases still use regex directly, like `@When("^I apply the coupon \"([^\"]*)\"$")` in Java. Either way, the pattern's job is to parse the Gherkin line, pull out the arguments (`SAVE10`), and route them into a method that contains the *actual* automation: the selectors, the waits, the clicks, the assertions.

Cucumber calls the package where these live the **glue**. In a Java project you literally configure `glue = "com.example.steps"` so the runner knows where to find the code that binds prose to behavior. The name is honest. The plain English on top is glued to imperative automation code underneath, and you maintain both layers forever.

So the answer to "does Gherkin need step-definition code in 2026?" is an unambiguous yes. The Cucumber docs are clear that step definitions are required, and recent releases improved the *ergonomics* of the matching — Cucumber Expressions, better IDE support, parameter types — without removing the layer itself. You write English, then you write the code that makes the English mean something, then you keep them in sync.

## Where the BDD glue layer hurts

None of this is a knock on the BDD philosophy. The pain is operational, and if you have run a Cucumber suite past a few dozen scenarios you have felt all of it.

**Double maintenance.** A UI change — a renamed button, a moved field — breaks the step implementation, not the feature file. So you have a `.feature` that still reads perfectly and a green-looking spec that fails for reasons invisible in the prose. New team members read the scenario, assume it is the source of truth, and waste an afternoon before realizing the truth lives in the step file.

**Step-definition sprawl.** Teams accumulate hundreds of steps. Two engineers write `I log in` and `I sign in` that do the same thing. Someone writes an over-specified `Then the total should be exactly $54.00` that needs a new step for every total. The "library of reusable steps" becomes a graveyard you grep through hoping a match already exists.

**Regex and expression debugging.** When a step does not match, Cucumber throws an "undefined step" or, worse, silently matches the wrong definition because two patterns overlap. Debugging *why* `{string}` caught the wrong argument, or why your escaped-quote regex stopped matching, is a special kind of tedium that has nothing to do with the behavior you are testing.

**The "who actually writes these" problem.** The original BDD dream was business folks authoring scenarios. In practice, because every line needs a backing step definition, only engineers can extend the suite without breaking it. The non-technical author writes a new line, no step matches, the test errors, and the dream quietly dies. The prose becomes developer documentation with extra ceremony.

This is the backdrop against which "natural-language tests" started meaning something genuinely different.

## What "runs directly from natural language" actually means

There is a real, not-just-marketing distinction between *Gherkin-style English that needs glue* and *English that the runner interprets at execution time*.

In the second model there are no step definitions. You write the objective in plain language, and an AI agent reads the live page, decides what to click and type, performs the action against a real browser, and checks whether the goal was met. The interpretation happens at runtime, against the actual DOM, not at authoring time against a hand-written regex map. Nobody writes `When('I apply the coupon {string}', ...)`, because the agent figures out where the coupon field is by looking at the page.

This is what BrowserBash does. It is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it with `npm install -g browserbash-cli`, then hand it an objective:

```bash
browserbash run "Go to the cart, apply coupon SAVE10, and confirm the order total dropped by 10 percent"
```

An AI agent drives a real Chrome step by step — no selectors, no page objects, no step definitions — and returns a pass/fail verdict plus any structured values it extracted along the way. The English *is* the test. There is no second file to keep in sync because there is no second file.

To be precise about the architecture: BrowserBash uses an *engine* to interpret the English (the default is `stagehand`, the MIT-licensed library from Browserbase, with its act/extract/observe primitives and self-healing; there is also a `builtin` Anthropic tool-use loop driving Playwright). It uses a *provider* for where the browser runs (`local`, your own Chrome, is the default). And it uses an LLM backend to do the reasoning. We will get to the model question, because it matters and it is where the honesty lives.

## Side-by-side: Cucumber BDD vs natural-language tests

Here is the comparison condensed. Read it as "what is true of the category," not a slight on any one tool.

| Dimension | Cucumber (Gherkin BDD) | Natural-language tests (e.g. BrowserBash) |
|---|---|---|
| What you author | `.feature` file in Gherkin | A plain-English objective or a markdown test file |
| Glue layer | Required: step definitions + Cucumber Expressions/regex | None — agent interprets at runtime |
| How an action maps to the page | You write selectors inside step code | Agent reads the live DOM and decides |
| Reaction to UI change | Step code breaks; feature still "reads" fine | Agent re-reads the page; self-healing within reason |
| Who can extend it safely | Mostly engineers (every line needs backing code) | Anyone who can describe the goal in English |
| Determinism | High — same code runs every time | Lower — model interprets; varies with model quality |
| Cross-language support | First-class (Java, JS, Ruby, .NET, etc.) | Language-agnostic; you write English, not code |
| Offline / no external service | Yes, fully local | Yes with a local Ollama model; hosted models call out |
| Cost to run | Free (open source) | Free on local models ($0 model bill); hosted = API cost |
| Best fit | Stable, well-understood, high-volume regression | Exploratory, fast-changing UIs, plain-English smoke checks |

The two rows that deserve emphasis are **determinism** and **who can extend it safely**, because they pull in opposite directions. Cucumber's step layer is a tax, but that tax buys you a deterministic, version-controlled, code-reviewed contract. Natural-language execution removes the tax but introduces model variance. Neither is free; they just charge you in different currencies.

## The honest caveat: natural-language tests run on a model

This is the part a vendor comparison usually buries, so let me put it up front. When a test "runs directly from English," something has to do the interpreting, and that something is a language model. The quality of your test run is bounded by the quality of that model on multi-step browser tasks.

BrowserBash is Ollama-first by design. The default model is `auto`, which resolves in order: a local Ollama model if you have one (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` → `claude-opus-4-8`, then `OPENAI_API_KEY` → `openai/gpt-4.1`, otherwise it errors with guidance. The local-first path is genuinely a $0 model bill and full privacy — your DOM never leaves your laptop.

Here is the caveat I would want a teammate to tell me: very small local models (roughly 8B parameters and under) get flaky on long, multi-step objectives. They lose the thread, click the wrong thing on step seven of ten, or hallucinate a success. The sweet spot for reliable local runs is a mid-size model — a Qwen3 or Llama 3.3 70B-class model — or a capable hosted model for genuinely hard flows. If you try to run a complicated checkout regression on a tiny quantized 7B model, you will conclude natural-language testing "doesn't work," when really you under-provisioned the brain.

You pin the model explicitly when you want determinism in your CI:

```bash
browserbash run "Log in, open billing, and verify the plan shows Pro" \
  --model openrouter/meta-llama/llama-3.3-70b-instruct \
  --headless --record
```

That single flag is the natural-language equivalent of locking a dependency version. Cucumber does not have this concern at all — its determinism comes for free from running the same compiled code. That is a real Cucumber advantage, and pretending otherwise would be dishonest.

## A note on the broader Cucumber-alternative landscape

BrowserBash is not the only tool people reach for when they tire of step definitions, and it would be misleading to imply it is. If you are evaluating a Cucumber BDD alternative seriously, you should know the field, including where these other tools are genuinely the better pick.

**Karate** is frequently cited as the strongest open-source Cucumber alternative. It keeps Gherkin syntax but bakes the step library in, so you stop writing your own step definitions for API work, and it folds API testing, mocking, performance, and UI into one framework. If your testing is API-heavy, Karate is excellent and you may not need an agent at all.

**Testsigma** and several other commercial platforms offer NLP-driven, low-code authoring where you compose tests from natural-language building blocks in a hosted IDE. Their exact model architecture and pricing are not something I will quote precisely here — treat those as commercial details to verify on their sites as of 2026 — but the category exists and is mature for teams that want a managed, non-CLI experience.

**Robot Framework, SpecFlow/Reqnroll, JBehave, Behave** are all keyword- or BDD-style frameworks that, like Cucumber, still rely on a backing implementation layer. They reduce ceremony in places but do not eliminate the glue concept.

Where BrowserBash specifically differs from most of that list: it is a free, open-source CLI that runs the test by *driving a real browser with an AI agent from a one-line English objective*, with a local-first model story so you can run it with no account and no cloud at all. If your priority is "plain English in, real Chrome driven, $0 and private," that is the niche it occupies. If your priority is "deterministic, cross-language, business-readable regression at scale," classic Cucumber or Karate may serve you better. You can read more about the approach on the [BrowserBash features page](https://browserbash.com/features) and walk a hands-on path in the [tutorials](https://browserbash.com/tutorials).

## What committable natural-language tests look like

A fair objection to AI-driven testing is "one-off CLI commands are not a test suite." Agreed. The version-controlled, reviewable artifact matters, and it is exactly where BDD earned its keep. BrowserBash answers this with markdown tests — committable `*_test.md` files where each list item is a step.

```bash
browserbash testmd run ./checkout_test.md
```

A markdown test reads close to a Gherkin scenario but with a crucial difference: there is no backing step-definition file. The steps are the implementation. The format supports `{{variables}}` templating, `@import` composition so you can reuse common flows, and secret-marked variables that get masked as `*****` in every log line. After each run it writes a human-readable `Result.md`. So you get the thing BDD promised — a readable, shareable spec under version control that the whole team can follow — without the second layer of glue code you have to maintain in lockstep.

For CI specifically, the `--agent` flag turns runs into NDJSON: one JSON object per line, with `step` progress events and a terminal `run_end` carrying a status and a structured `final_state`. Exit codes are honest — `0` passed, `1` failed, `2` error, `3` timeout — so your pipeline can branch on them without parsing prose. Every run is also kept on disk under `~/.browserbash/runs` (secrets masked, capped at 200) for after-the-fact inspection. If you want a visual, `browserbash dashboard` runs a fully local dashboard at localhost:4477. None of that requires a Cucumber-style glue package. There is more on the agent/NDJSON workflow in the [BrowserBash docs and learn hub](https://browserbash.com/learn).

## When to choose Cucumber BDD

Let me be the senior engineer who tells you *not* to switch when switching is wrong. Stick with Cucumber if any of these describe you.

You have a large, stable regression suite where the cost of writing step definitions has already been paid and the UI rarely churns. Cucumber's determinism is a feature there, not a bug, and you do not want a model reinterpreting a flow that has been green for two years.

You operate in a regulated or contract-heavy environment where the executable specification *is* a deliverable — the `.feature` files are reviewed by stakeholders, attached to acceptance sign-off, and traced to requirements. That ceremony is the point, and a runtime-interpreted English objective will not satisfy an auditor who wants the exact, deterministic steps captured in version control.

You need true multi-language teams sharing one BDD vocabulary across Java, .NET, Ruby, and JavaScript services. Cucumber's cross-language maturity is hard to beat.

And you simply want maximum determinism with zero model variance and zero per-run cost ceiling concerns. Code that runs the same way every time has a real, lasting value.

## When to choose natural-language tests

Reach for natural-language, agent-driven tests when the glue layer is the bottleneck rather than the value.

Choose them for fast-moving UIs where step definitions break weekly and the maintenance is eating your QA time. An agent that re-reads the page each run absorbs a lot of churn that would otherwise be a step-code fix.

Choose them for exploratory and smoke testing where you want a non-engineer to write a check by describing the goal — "make sure a new user can sign up and see the dashboard" — and have it actually run, today, without filing a ticket for someone to author a step definition.

Choose them when privacy and cost rule out hosted services: a local Ollama model means nothing leaves your machine and the model bill is genuinely zero. And choose them when you are wiring tests into an AI coding agent or CI and want structured NDJSON in, exit codes out, rather than HTML reports a human has to read.

A pragmatic shop often runs *both*: Cucumber or Karate for the deterministic regression core, and natural-language runs for the long, churny tail of smoke checks and exploratory flows that were never worth a step-definition investment. They are not mutually exclusive, and the comparison is not a war. If you want to see worked examples of the agent-driven side, the [BrowserBash blog](https://browserbash.com/blog) and [case studies](https://browserbash.com/case-study) go deeper than this overview.

## A realistic migration path off step definitions

If the step-definition tax is what is driving you, you do not have to rip out Cucumber on day one. A low-risk path:

1. Keep your existing Cucumber suite running as-is. Touch nothing that is green and stable.
2. Pick the *flakiest* feature — the one whose step definitions you rewrite most often — and re-express its scenarios as BrowserBash markdown tests. No step defs to port; you are translating English to English.
3. Run both for a sprint. Compare false-failure rates and maintenance time honestly. Pin a mid-size model so the comparison is fair.
4. For new exploratory or smoke coverage where you would otherwise have written fresh step definitions, default to the natural-language path and skip the glue entirely.

This keeps Cucumber's determinism where it earns its place and routes the high-churn work to the layer that does not need glue. It is free to try — `browserbash` needs only Node 18+ and a local Chrome, runs with no account, and a local model costs nothing. Pricing for the optional cloud pieces is on the [pricing page](https://browserbash.com/pricing), and the package itself lives on [npm](https://www.npmjs.com/package/browserbash-cli).

## FAQ

### Does Cucumber Gherkin still need step definitions and regex in 2026?

Yes. Gherkin feature files are not executable on their own — every scenario line must be matched to a step-definition function via a Cucumber Expression or a regular expression, and that code lives in a configured "glue" package. Recent Cucumber releases made the matching friendlier with Cucumber Expressions and better tooling, but they did not remove the step-definition layer itself.

### What is the difference between Cucumber and a natural-language test that runs from plain English?

Cucumber's English is a label that must be glued to hand-written automation code through step definitions. A true natural-language test, like a BrowserBash objective, is interpreted at runtime by an AI agent that reads the live page and decides what to do, so there is no step-definition file to write or maintain. The English is the executable test rather than a description sitting on top of one.

### Is there a free, open-source Cucumber BDD alternative with no step definitions?

Yes. BrowserBash is a free, Apache-2.0 licensed CLI that runs plain-English objectives against a real Chrome browser with no step definitions, page objects, or selectors. With a local Ollama model it runs entirely on your machine for a $0 model bill and no account, and it stores committable markdown tests so you still get a version-controlled, readable spec.

### Are natural-language tests reliable enough to replace Cucumber?

It depends on the model and the flow. Capable models handle multi-step browser tasks well, but very small local models (around 8B parameters and under) get flaky on long objectives, so a mid-size or hosted model is the reliable choice for hard flows. Cucumber still wins on raw determinism, so many teams keep it for stable regression and use natural-language tests for fast-changing or exploratory coverage rather than replacing one wholesale.

Ready to test without writing step definitions? Install it with `npm install -g browserbash-cli` and run your first plain-English check in minutes. No account is required to run locally — but if you want the optional cloud dashboard, you can [sign up here](https://browserbash.com/sign-up).
