---
title: Accessibility-First Testing With AI and axe-core
description: "Accessibility first testing pairs role and name intent assertions with deterministic axe-core audits so AI agents catch a11y regressions in one run."
date: 2026-07-26
category: guide
---

Most teams bolt accessibility on at the end, usually after a launch, sometimes after a complaint. Accessibility first testing flips that: you write the a11y contract before or alongside the feature, and every run checks it. When an AI agent drives the browser by role and name instead of brittle CSS selectors, the test itself becomes an accessibility probe. If the agent cannot find the "Submit" button by its accessible name, neither can a screen reader user. Pair that intent-level checking with a deterministic axe-core audit in the same run and you get two complementary signals: did the flow work through the accessibility tree, and does the rendered DOM pass automated WCAG rules. This guide shows how to combine both with plain-English tests, using [BrowserBash](https://browserbash.com/features), the open-source validation layer for AI agents.

## Why accessibility-first testing is different

Traditional end-to-end tests target implementation details. A Playwright script might click `#checkout-btn-2` or `.MuiButton-root:nth-child(3)`. Those selectors say nothing about whether a real user, or an assistive technology, can perceive and operate the control. You can have a fully "passing" suite over a page that is completely unusable with a keyboard or a screen reader.

Accessibility-first testing starts from the opposite end. It asks: what is the user's intent, and what is the accessible name of the thing they interact with? When you write a step like "click the Add to cart button," an AI agent has to resolve that against the accessibility tree, the same structure a screen reader consumes. The button needs a role of `button` and an accessible name of "Add to cart." If a developer swaps in a bare `<div onClick>` with no role and no label, the agent stalls in exactly the place a blind user would, and your test fails for the right reason.

This is not a replacement for axe-core or manual audits. It is a different layer. Intent-based interaction catches operability and naming problems that static analyzers miss, because it exercises the flow. Axe-core catches rule-based violations (contrast ratios, missing form labels, invalid ARIA) that a happy-path click-through would sail past. Run both and you cover far more of WCAG than either does alone.

### The two signals, side by side

| Signal | What it checks | Deterministic? | Catches |
| --- | --- | --- | --- |
| Role/name intent assertions | Can the flow be completed through the accessibility tree | Yes, when written as Verify steps | Missing roles, unlabeled controls, unreachable actions, focus traps |
| axe-core audit | Rule violations in the rendered DOM | Yes | Contrast, missing alt text, form-label gaps, ARIA misuse, landmark issues |
| Manual screen reader pass | Real qualitative experience | No | Reading order, verbosity, cognitive load |

The first two are automatable and belong in CI. The third stays human. Accessibility-first testing is about squeezing everything possible into those first two columns so the human review time goes toward genuinely subjective issues.

## How BrowserBash turns intent into an a11y check

BrowserBash takes a plain-English objective and hands it to an AI agent that drives a real Chrome or Chromium browser step by step. There are no selectors and no page objects. You describe what a user does, the agent figures out how, and you get back a deterministic verdict plus structured results.

The accessibility angle falls out of how the agent perceives the page. It works from an accessibility-tree snapshot, so when you tell it to interact with "the Search link" or "the Email field," it resolves those against roles and accessible names. That resolution is the test. A control with a proper role and name is easy to find; a mislabeled or role-less control is not.

Here is the simplest possible accessibility-first run:

```bash
npm install -g browserbash-cli

browserbash run "Open https://example.com, click the 'Get started' link, \
verify a 'Sign up' heading is visible, and store the page title as 'pageTitle'" \
  --agent --headless
```

The agent has to find "Get started" as a link and "Sign up" as a heading. If either lacks the right role or accessible name, the run fails and tells you where. Because you passed `--agent`, you get NDJSON on stdout: one JSON event per step plus a final `run_end` event carrying the verdict, so CI reads structured data instead of parsing prose. The exit codes are frozen and predictable: `0` passed, `1` failed, `2` error, `3` timeout.

The model story matters here for cost and privacy. BrowserBash is Ollama-first: it defaults to free local models with no API keys, so nothing leaves your machine. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For accessibility runs on a developer laptop, a local model keeps everything offline. One honest caveat: very small local models (around 8B and under) get flaky on long multi-step flows, so for a deep accessibility audit across many pages, reach for a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model.

## Making role and name assertions deterministic with Verify

Agent judgment is powerful but, on its own, non-deterministic. For an accessibility contract you want a hard yes or no, not "the model thinks the button was there." BrowserBash's Verify assertions solve this. Inside a committable `*_test.md` file, `Verify` steps compile to real Playwright checks with no LLM judgment involved.

The grammar covers exactly the things accessibility-first testing cares about: URL contains, title is or contains, text visible, and crucially `'name' button|link|heading visible`, element counts, and stored-value equality. That `'name' role visible` form is a direct role-and-name assertion. It passes only if an element with that role and that accessible name is actually present and visible.

```
# Checkout accessibility contract

- Open https://shop.example.com
- Add the first product to the cart

Verify: 'Cart' link visible
Verify: 'Proceed to checkout' button visible
Verify: text "Your cart" visible

- Go to the checkout page

Verify: 'Email' textbox visible
Verify: 'Place order' button visible
Verify: title contains "Checkout"
```

Each `Verify` line becomes a Playwright expectation. A pass means the condition genuinely held. A fail arrives with expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table that BrowserBash writes after every run. If you write a Verify line the grammar does not recognize, it still runs, but agent-judged and flagged `judged: true`, so you can always tell a deterministic check from a judged one.

For accessibility work this distinction is the whole game. `Verify: 'Place order' button visible` failing means there is no element exposing a button role with the accessible name "Place order." That is a concrete, reproducible accessibility defect, not a flaky model opinion. You can put it in front of reviewers and file it against WCAG 4.1.2 (Name, Role, Value) with confidence.

### Writing role assertions that map to WCAG

A few patterns pay off. Assert headings by name to lock down document structure and reading order (WCAG 1.3.1 and 2.4.6). Assert that form controls are reachable by their labels, which is your operational check on WCAG 1.3.1 and 3.3.2 for labels. Assert link and button names read as meaningful out of context, which pushes back on "click here" and unlabeled icon buttons. When these hold across a suite, you have a machine-verifiable floor under your accessible naming.

## Layering axe-core into the same run

Intent assertions prove the flow works through the accessibility tree. They do not check color contrast, alt text, duplicate IDs, or ARIA validity. That is axe-core's job. The accessibility-first pattern is to run both against the same page state so a single test tells you the flow is operable and the DOM passes automated rules.

BrowserBash drives a real browser, so you have a live page to audit. The practical approach is to let the agent walk the flow (proving reachability and naming), then run an axe-core audit at the key states and assert on the results. Because axe-core produces a structured JSON report (violations grouped by rule, each with impact and affected nodes), it slots naturally into the deterministic side of your suite: you extract the violation count and Verify it is zero, or below an agreed threshold, at each checkpoint.

```bash
browserbash run "Open https://app.example.com/dashboard, wait for the main \
content to load, then extract the number of critical accessibility \
violations on the page as 'a11yCritical'" \
  --agent --headless --provider local
```

Think of the division of labor this way. The agent handles the parts that need perception and navigation: get to the right page, wait for the right state, read a value out of the DOM. Axe-core, injected into that page, handles the rule engine. You then Verify the extracted number. If `a11yCritical` is not zero, the run fails with the count captured in the results, and your CI job goes red on a real WCAG regression rather than on a selector that moved.

### Choosing your axe-core rule set

Axe-core lets you scope rules by tag: `wcag2a`, `wcag2aa`, `wcag21aa`, `best-practice`, and more. Decide your bar up front. Most teams gate CI on `wcag2a` and `wcag2aa` violations at "serious" and "critical" impact, and treat "moderate" and "minor" as advisory. Encode that decision in what you extract and Verify, so the pass or fail is unambiguous and the same on every machine. Keeping the threshold explicit in the test file means a new engineer reads the contract without guessing which violations "count."

## A complete accessibility-first test with testmd v2

The examples so far mix agent steps and deterministic checks loosely. testmd v2 makes that structure first-class. Add `version: 2` to a test file's frontmatter and steps execute one at a time against a single browser session. Two deterministic step types never touch a model: API steps for seeding data, and Verify steps for checking it through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

For accessibility testing, API steps are quietly valuable. You often need a specific state (a logged-in user with items in a cart, a form pre-filled with an edge-case value) to reach the screen you actually want to audit. Seeding that over the API instead of clicking through it keeps the test focused on the accessibility of the target screen.

```
---
version: 2
---

# Order confirmation accessibility audit

POST https://api.example.com/carts with body { "sku": "A-100", "qty": 2 }
Expect status 201, store $.cartId as 'cartId'

- Open https://shop.example.com/cart/{{cartId}}
- Proceed to the checkout and place the order using the saved test card

Verify: title contains "Order confirmed"
Verify: 'Order confirmed' heading visible
Verify: 'Download receipt' link visible
Verify: text "Your order number is" visible
```

The API step seeds a cart deterministically and stores the id. The agent block navigates and completes checkout using perception and naming. Then a run of Verify steps locks down the confirmation screen's accessible structure: the title, the confirmation heading, the receipt link's accessible name, and confirmation text. Nothing about that assertion block depends on model judgment, so it is safe to gate a release on.

One thing to keep in mind: testmd v2 currently drives the builtin engine, which speaks the Anthropic API (or an `ANTHROPIC_BASE_URL` gateway). It does not yet run on Ollama or OpenRouter directly. If you rely on fully local models for the agent portions, keep those flows on v1 for now and use v2 where you have a hosted key or a gateway. You can read more about the test format and step types in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Running the audit across a real suite

A single page is a start; accessibility is a whole-site property. Once you have per-page accessibility-first tests, run them as a suite and let the orchestrator handle scale. BrowserBash's `run-all` is memory-aware: it derives concurrency from real CPU and RAM, orders previously-failed and slowest-first, and flags flaky tests. That ordering matters for a11y work because a newly-introduced violation usually clusters in the pages that just changed, and failed-first surfaces it sooner.

```bash
browserbash run-all ./a11y-tests \
  --shard 2/4 \
  --budget-usd 2 \
  --junit out/a11y-junit.xml
```

Sharding splits the suite deterministically on sorted discovery order, so four parallel CI machines each take a quarter without any coordination. The budget flag is a guardrail: `run_end` carries a `cost_usd` estimate from a bundled per-model price table, and `--budget-usd 2` stops launching new tests once the suite crosses the budget. Remaining tests report `skipped`, the suite exits `2`, and spend lands in `RunAll-Result.md` and the JUnit properties. If your accessibility suite uses hosted models, that stop-loss keeps a runaway run from surprising you.

The JUnit output drops straight into any CI dashboard, so accessibility failures show up next to your functional failures rather than in a separate silo. That co-location is deliberate: treating a11y regressions as first-class test failures, not a separate "audit" people ignore, is most of what "accessibility-first" means in practice.

### Testing multiple viewports

Accessibility changes with viewport. A control that is a labeled button on desktop can collapse into an unlabeled icon on mobile, and reflow (WCAG 1.4.10) only shows up at narrow widths. BrowserBash runs a viewport matrix: `run-all --matrix-viewport 1280x720,390x844` runs every test once per viewport, labeled in events, JUnit, and results. Running your role-and-name assertions at both a desktop and a mobile width catches responsive accessibility regressions that a single-viewport suite hides.

## Continuous accessibility monitoring

Accessibility regresses silently. A content update strips an alt attribute, a design tweak drops contrast below 4.5:1, a framework upgrade changes how a component exposes its role. None of these throw a runtime error, so nothing tells you until a user does. Monitor mode closes that gap.

```bash
browserbash monitor ./a11y-tests/checkout.md \
  --every 30m \
  --notify https://hooks.slack.com/services/T00/B00/xxxx
```

This reruns your accessibility contract on an interval and alerts only when the verdict flips, pass to fail or fail back to pass, never on every green run. So you hear about the moment a checkout heading loses its role, not once every thirty minutes forever. Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload for your own tooling.

The economics work because of the replay cache. A green run records its actions; the next identical run replays them with zero model calls, and the agent only steps back in when the page actually changed. For an always-on accessibility monitor that is nearly token-free in steady state, and the model wakes up precisely when something shifted, which is exactly when you want a fresh accessibility read. Combined with a webhook, you get synthetic accessibility monitoring for the price of the occasional changed-page run.

## Where this approach fits, and where it does not

Accessibility-first testing with an AI agent plus axe-core is strong at a specific band of problems. It is honestly not a total solution, and pretending otherwise would undersell the parts that still need humans.

### What it covers well

It is excellent at operability and naming: can a user reach and operate every control through the accessibility tree, and does each control announce a meaningful role and name. It is excellent at catching rule-based regressions via axe-core, run continuously so violations are caught the day they land, not the quarter someone audits. And because the agent works from the accessibility tree, your functional tests double as accessibility tests at no extra authoring cost, which is the cheapest a11y coverage you will ever add.

### What still needs a human

Screen reader experience is qualitative. Automated tools, axe-core included, catch a well-cited minority of WCAG issues; the exact fraction is debated and depends on the site, so treat "we pass axe-core" as a floor, not a ceiling. Reading order that is technically valid but confusing, verbose ARIA that is correct but exhausting, focus management that works but feels disorienting, cognitive load, plain-language clarity: these need a person, ideally a person who uses assistive technology daily. Use the automated layer to clear the mechanical violations so your human reviewers spend their time on judgment, not on counting missing alt attributes.

### When a dedicated tool is the better fit

If you want a deep, standalone axe-core report with per-rule remediation guidance and a polished HTML dashboard, a dedicated accessibility platform will give you a richer report than a CLI verdict. If your team already lives in a specific a11y tool's ecosystem, keep it. BrowserBash's edge is integration: accessibility checks that live in the same plain-English suite as your functional tests, gate the same CI, and run continuously without a separate pipeline. Use it as the always-on floor and bring in a specialized auditor for the deep periodic review. You can see how teams combine these layers on the [BrowserBash case study page](https://browserbash.com/case-study), and the full command reference lives in [the docs and learn section](https://browserbash.com/learn).

## Wiring it into CI with the GitHub Action

The last mile is making accessibility failures block merges. BrowserBash ships a GitHub Action that installs the CLI, runs your suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating PR comment with the verdict table. For accessibility-first testing that PR comment is the payoff: a reviewer sees, right on the pull request, that the "Place order" button lost its accessible name, before the change ever reaches production. Setup lives in the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), and the project source, including the builtin engine and Verify grammar, is on [GitHub](https://github.com/PramodDutta/browserbash).

Because the assertions are deterministic, the PR comment does not hedge. A red "Place order button visible: FAILED, expected visible, found none" is a fact a developer can act on immediately, with the exact accessible name and role that went missing. That is the difference between an accessibility check that people trust and gate on, and one they learn to ignore.

## FAQ

### What is accessibility-first testing?

Accessibility-first testing means writing and running accessibility checks as part of your normal test suite from the start, rather than auditing for a11y at the end of a project. In practice it combines two signals: interacting with the page by role and accessible name (so the test itself proves the flow works through the accessibility tree) and running a deterministic axe-core audit for rule-based violations like contrast and missing labels. The goal is to catch operability and WCAG regressions the day they land, not months later.

### Does AI-driven testing replace axe-core?

No, and it should not try to. AI-driven, intent-based testing checks whether a user can reach and operate controls by their accessible role and name, which exercises the flow the way a screen reader user would. Axe-core checks rule violations in the rendered DOM, such as color contrast, invalid ARIA, and missing form labels, that a happy-path click-through would never surface. They are complementary layers, and the strongest setup runs both against the same page state in one test.

### How does BrowserBash make accessibility assertions deterministic?

BrowserBash uses Verify steps inside a test file that compile to real Playwright checks with no model judgment. An assertion like a named button being visible passes only if an element with that button role and that exact accessible name is present and visible, and a failure comes with expected-versus-actual evidence. That means an accessibility failure is reproducible and filable against a specific WCAG criterion, rather than a flaky opinion from a language model.

### Can accessibility tests run for free on local models?

Yes, for the agent-driven parts. BrowserBash is Ollama-first and defaults to free local models with no API keys, so your accessibility runs can stay entirely on your machine. The caveat is that very small local models (around 8B and under) can be flaky on long multi-step flows, so a mid-size local model or a capable hosted model works better for deep audits. Note that testmd v2 with its API and Verify step types currently needs the builtin engine, which uses a hosted Anthropic key or a compatible gateway.

Ready to add an accessibility floor to your suite? Install with `npm install -g browserbash-cli` and start writing role-and-name assertions today. An account is optional and everything runs locally, but if you want hosted dashboards and continuous monitoring you can [sign up here](https://browserbash.com/sign-up).
