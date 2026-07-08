---
title: Ship a CI Gate Built on a Verdict, Not a Vibe
description: "Build a CI gate on a deterministic test verdict, not an agent's narrative summary, using exit codes and real Playwright assertions."
date: 2026-07-30
category: guide
---

Most "AI-verified" CI gates today are built on a vibe. An agent runs a browser flow, writes three paragraphs about what it saw, and someone (a human reviewer, or worse, another agent) reads that summary and decides whether the deploy is safe. That is not a CI gate, that is a book report. A real CI gate needs a deterministic test verdict: a single, unambiguous signal your pipeline can branch on without anyone, human or model, having to interpret prose. This article makes the case for gating merges on assertions and exit codes instead of a narrative, and walks through the concrete mechanism BrowserBash uses to keep the two apart: deterministic checks that compile to real Playwright expectations, and agent-judged checks that get flagged as exactly that.

The distinction sounds academic until you've shipped a broken release because an agent's summary sounded confident. It happens more than teams admit, because narrative verdicts are persuasive by design. Language models are trained to produce fluent, reassuring text, and "the login flow works correctly and the dashboard loads as expected" reads like a pass even when the underlying check was fuzzy or wrong. A CI gate that trusts that sentence is trusting the model's writing quality, not its accuracy. The fix isn't to distrust AI agents entirely, it's to change what they're allowed to report: not "it worked," but a structured, deterministic test verdict that either matches an expected state or doesn't.

## Why a CI Gate Needs a Deterministic Test Verdict, Not a Narrative

Picture two failure reports from the same broken deploy. The first: "I navigated to the checkout page and attempted to complete the purchase flow. The page appeared to load correctly, though I noticed some minor layout differences that may not be significant. Overall the checkout process seems functional." The second: `assertion failed: expected URL to contain "/order-confirmed", got "/checkout?error=payment_declined"`. Only one of these tells you, without ambiguity, whether to block the merge.

The narrative version is not lying, exactly. It's doing what a language model does when asked to summarize a browser session: producing the most plausible-sounding account of what it saw, hedged just enough to sound careful. But "seems functional" is not a decision your pipeline can act on. Someone still has to read it, guess at intent, and decide whether "minor layout differences" is a blocker. That decision point reintroduces the exact human bottleneck CI was supposed to remove.

A deterministic test verdict removes the decision point entirely. It's a structured result: pass or fail, backed by a concrete comparison (URL equals X, element count equals N, stored value equals Y) that either held or didn't. There's no interpretation layer between the check and the gate. This is precisely why frameworks like Playwright and Cypress won on reliability before "AI testing" existed: `expect(page).toHaveURL(...)` either throws or it doesn't. The industry didn't move away from deterministic assertions because they were wrong, it moved toward AI-driven browser agents because writing and maintaining locator-based test code is slow and brittle. The right answer is combining an agent's ability to navigate a real UI in plain English with the old discipline of deterministic assertions at the moment that matters: the gate.

## What "Deterministic" Actually Means for a Test Verdict

"Deterministic" gets used loosely in AI tooling marketing, so it's worth being precise. A deterministic check has three properties: it does not ask a language model to judge the outcome, it produces the same result given the same page state every time, and its failure comes with concrete evidence you can diff against, not a summary you have to trust.

Compare that to what most "AI browser testing" tools actually ship today. The agent is told to "verify the order was placed" and it looks at the page, forms an opinion, and reports that opinion as the result. Two runs against the identical broken page can produce two different verdicts, because the model's read of ambiguous visual state isn't guaranteed to be stable. That's not a criticism of the underlying models, it's just what judgment does: it varies run to run. A CI gate cannot be built on a signal that varies when nothing about the system under test changed.

This doesn't mean judgment has no place. An agent's ability to read a page and decide "this looks like a pricing table" is genuinely useful, especially for exploratory checks and flows that are annoying to write locator-based code for. The mistake is letting that judgment silently become the gate. The fix is keeping judged results and deterministic results in separate buckets, labeled, so your pipeline only ever branches on the deterministic bucket.

## How BrowserBash Separates Judged Results from Deterministic Ones

This is the concrete mechanism, not an abstract principle. BrowserBash's testmd format supports `Verify` steps that compile to real Playwright checks when they match a known grammar: URL contains a substring, page title is or contains a string, specific text is visible, a `'name' button|link|heading` is visible, an element count matches, or a previously stored value equals an expected value. When a `Verify` line matches that grammar, BrowserBash runs the actual Playwright assertion under the hood. No model call, no judgment, just a real check against the DOM.

```
Verify: URL contains "/order-confirmed"
Verify: 'Order Confirmed' heading visible
Verify: stored value 'orderTotal' equals "129.00"
```

When a `Verify` line doesn't match that grammar (say, "verify the page feels trustworthy" or "verify the layout looks professional"), BrowserBash still runs it, because plain-English exploratory checks have real value. But the result comes back flagged `judged: true` in the structured output. That flag is the whole point: the difference between a result you can gate a merge on and a result you should read but not automate around. Your CI config can fail the build on any deterministic assertion failure while treating judged results as informational, logged but not blocking, or escalated to a human reviewer instead of an automatic rejection. Most teams writing plain-English checks don't design a formal grammar first, they write what a human would say, and BrowserBash's job is recognizing when that sentence maps cleanly onto something Playwright can assert, and being honest when it doesn't.

## Building the Gate: Exit Codes, Verify Steps, and testmd v2

The mechanism starts with the same contract every CI tool has honored for decades: exit codes. BrowserBash exits `0` on a pass, `1` on a fail, `2` on an error (including a budget stop), and `3` on a timeout. `--agent` mode emits NDJSON, one JSON object per line, ending in a `run_end` event carrying `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. Your CI step doesn't parse a paragraph to decide what happened, it reads a machine-produced field.

For the deterministic layer specifically, testmd v2 is the shape to reach for. Add `version: 2` to a test file's frontmatter and steps execute one at a time against a single browser session, with two step types that never touch a model at all: API steps for seeding or checking backend state, and Verify steps for confirming it through the UI.

```
---
version: 2
---
# Checkout completes and total is correct

1. POST https://api.example.com/cart with body {"sku": "SKU-4471", "qty": 2}
2. Expect status 201, store $.total as 'expectedTotal'
3. Open the checkout page and log in as the demo user
4. Verify: stored value 'expectedTotal' equals "129.00"
5. Verify: 'Order Confirmed' heading visible
```

The API step and both Verify steps are deterministic: no model call, no judgment, a real HTTP request and two real Playwright checks. The plain-English navigation step in the middle uses the agent, because logging in and reaching checkout is exactly the kind of flow where a plain-English objective beats maintaining locator chains. That's the split in one file: agent for navigation, deterministic checks for the parts your gate needs to trust.

Run it with `--agent` and the exit code plus the `assertions` block in `run_end` is everything the pipeline needs:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md --agent --headless --timeout 120
```

## A Real CI Gate Walkthrough

Here's what this looks like end to end in a GitHub Actions job. A pull request touches the checkout flow. The workflow installs BrowserBash, runs the test file above against a preview deployment, and gates the merge on the exit code, nothing else.

```bash
npm install -g browserbash-cli
browserbash testmd run ./.browserbash/tests/checkout_test.md \
  --agent --headless --timeout 120 --auth demo-user
echo "exit code: $?"
```

If the API seed step fails (a 500 instead of a 201), the run stops with exit `1` and the `assertions` block shows exactly which expectation failed, expected versus actual. If the seed succeeds but the UI never shows the confirmed order, the Verify steps fail with the same structured evidence. Either way, the pull request gets a red check with a concrete reason, not a paragraph someone interprets before deciding whether to block the merge.

The official BrowserBash GitHub Action wraps this pattern further: it installs the CLI, runs the suite, uploads NDJSON and JUnit artifacts, and posts a self-updating PR comment with a verdict table, so reviewers see the result inline without opening a log. Details are in the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## Judged Flags: Why "judged: true" Is a Feature, Not a Bug

It's tempting to see the `judged: true` flag as an admission of weakness, as if BrowserBash is confessing it couldn't figure out how to make a check deterministic. The opposite is true. Most "AI-verified" tools don't distinguish judged results from deterministic ones at all, everything comes back as a single pass/fail with equal apparent confidence, and you have no way to know which results are backed by a real assertion and which are backed by a model's read of a screenshot.

That's the actual risk in AI-driven testing right now: not that judgment is unreliable (it's a genuinely useful capability), but that it gets presented with the same authority as a deterministic check, so teams end up gating production deploys on results indistinguishable from an educated guess. A flag that says "this one was judged, not asserted" is the tool being honest about the limits of what it just did. Build a CI policy around that honesty: block on deterministic failures automatically, surface judged failures for a human to glance at, and convert your most-relied-on judged checks into Verify steps as your suite matures.

## Cost and Budget as Part of the Gate

A CI gate that can silently rack up model spend isn't fully deterministic either, not in outcome but in cost. BrowserBash's `run_end` event carries a `cost_usd` estimate pulled from a bundled per-model price table (models it doesn't recognize get no estimate rather than a fabricated one). For a suite, `run-all --budget-usd` turns that estimate into a hard stop.

```bash
browserbash run-all .browserbash/tests --budget-usd 2.50 --junit out/junit.xml
```

Cross that budget mid-suite and BrowserBash stops launching new tests, marks the remaining ones `skipped`, and exits `2`. That number lands in both `RunAll-Result.md` and the JUnit `<properties>` block, so a runaway suite shows up as an infrastructure failure in your dashboard, not a mystery bill at month end. Pairing a cost ceiling with a deterministic pass/fail gate means your pipeline fails closed on both axes.

## Sharding, Matrix, and Scaling the Gate Across a Suite

A gate that only checks one flow isn't much of a gate. As a suite grows, the same determinism discipline needs to scale with it. `run-all` supports sharding for parallel CI machines and a viewport matrix for cross-device coverage, both computed the same deterministic way every time so parallel runners never duplicate or drop work.

```
browserbash run-all .browserbash/tests --shard 2/4 --matrix-viewport 1280x720,390x844
```

Shards are computed from sorted discovery order, so four CI machines each running `--shard i/4` agree on the split without any coordination step between them, no shared lock file, no race. The viewport matrix runs every test once per viewport and labels the result in events, JUnit, and Result.md, so a mobile-only regression doesn't hide behind a desktop pass. None of this changes the gate mechanism, it's still exit codes and structured assertions, just applied across more of the surface a real release touches. The orchestrator also runs previously-failed and historically slow tests first, so a real regression surfaces in the first few minutes of a pipeline run, not the tail end of a forty-minute suite.

## Where Vibe-Based Gating Still Sneaks In (and How to Catch It)

Even with a deterministic mechanism available, vibe-based gating creeps back in through habits that feel harmless. The most common one: writing a `Verify` line that's technically prose but that a developer assumes is being asserted, because it reads like an assertion. "Verify the total is correct" doesn't match BrowserBash's grammar (there's no literal value to compare), so it runs judged, flagged accordingly. If nobody checks that flag in CI config, the pipeline either treats it like a hard assertion failure or, worse, silently passes it through logic that only checks `status === "passed"` without looking at whether any individual result was judged.

The second common leak is trusting an agent's `summary` field as if it were the verdict. `summary` is useful for a human reading a failed build, it explains in plain English roughly what happened, but it is not the gate. The gate is `status` and the `assertions` array. A CI script that greps the summary for "success" has rebuilt the exact log-parsing anti-pattern this whole approach is meant to replace, just one layer downstream.

The table below is a quick way to audit whether a given check in your suite is actually gate-worthy or just gate-shaped.

| Signal | Deterministic (gate-worthy) | Judged (informational only) |
|---|---|---|
| Source | Real Playwright assertion (URL, title, text, count, stored value) | Model's read of page state |
| Repeatability | Same page state, same result every time | Can vary run to run on ambiguous state |
| Evidence on failure | Expected vs. actual values in `assertions` | A written explanation, no structured diff |
| Flag in output | Not marked `judged` | `judged: true` |
| Right place in CI | Block the merge automatically | Log it, surface to a human, don't auto-block |
| Cost profile | Often zero model calls (API + Verify steps) | Always at least one model call |

Run that audit on your existing test files periodically. As you find judged checks that consistently matter, rewrite them as Verify steps that hit the grammar (a specific URL, a specific heading, a stored value) rather than leaving them as prose your gate silently trusts.

## When to Choose a Deterministic Gate vs. an Agent Narrative

None of this argues for throwing away agent narratives. A written summary is the right tool when a human will read the result and make the call: exploratory smoke tests during active development, a nightly crawl looking for anything that looks broken, a one-off bug investigation. In those contexts, "the page seems to have a rendering issue in the sidebar" is useful precisely because a person decides what to do next.

A deterministic gate is the right tool when the outcome decides something automatically: does this pull request merge, does this deploy go to production, does this on-call alert page someone at 2am. Anywhere the result triggers an action without a human in the loop first, it needs to be a structured verdict backed by a real assertion, not a summary. The same logic applies to `monitor` checks that alert on state changes: the pass/fail transition needs to be deterministic, because an alert that fires on a model's mood swing trains your team to ignore alerts.

```
browserbash monitor ./.browserbash/tests/checkout_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Monitor mode alerts only on pass-to-fail and fail-to-pass transitions, not on every run, which is exactly the discipline a deterministic gate needs at the alerting layer too: silence when nothing changed, signal only when the verdict flips. The [BrowserBash learn hub](https://browserbash.com/learn) and [tutorials](https://browserbash.com/tutorials) walk through setting monitor and CI gates side by side if you're building both.

Most real suites end up mixed, and that's fine. A handful of high-value flows (checkout, signup, payment, anything touching money or account state) get the full testmd v2 treatment with API seeding and Verify assertions, gated hard. Everything else can stay plain-English and agent-judged, useful for catching regressions a human reviews, without being wired to block a merge on its own. The mistake isn't using judgment, it's not knowing which bucket a check landed in.

## Getting Started With a Verdict-Based Gate

If you're retrofitting this onto an existing suite, the fastest path is not a rewrite. Run your current plain-English tests once with `--agent` and look at the `assertions` array in `run_end`: anything empty or missing means every check in that file was judged, prose in, prose-shaped verdict out. Pick the files that gate something that actually matters (a deploy, a release, an on-call page) and rewrite their critical checks as Verify lines that hit the deterministic grammar. Add `version: 2` frontmatter if you also want API-level seeding in the same file, instead of relying on the UI to set up state the agent then has to navigate through.

From there, wire the exit code into your pipeline exactly like any other check: `browserbash testmd run ... --agent || exit 1` in a shell step, or point the official GitHub Action at the file and let it post the verdict table on the pull request. The [BrowserBash blog](https://browserbash.com/blog) has walkthroughs for specific CI platforms, and the [case study page](https://browserbash.com/case-study) covers a team's before-and-after moving off log-parsed gates. If you already maintain a locator-based Playwright suite, you don't have to choose: import your existing specs with `browserbash import` and layer Verify steps on top of the flows worth converting to plain English.

```
browserbash import ./tests/playwright --out ./.browserbash/tests
```

Untranslatable pieces land in `IMPORT-REPORT.md` instead of being silently dropped or guessed at, the same honesty principle running through the whole tool: say what's deterministic, say what's judged, never present a guess as a verdict.

## FAQ

### What's the difference between a deterministic and a judged test result in BrowserBash?

A deterministic result comes from a real Playwright assertion, a Verify step that matched BrowserBash's grammar for URL, title, text, element count, or stored-value checks, and it produces the same outcome every time given the same page state. A judged result comes from the AI agent's read of the page and is flagged `judged: true` in the output, meaning it's useful information but shouldn't be treated with the same automatic authority as a deterministic assertion.

### Can I gate a CI pipeline on BrowserBash exit codes alone?

Yes. BrowserBash exits `0` on pass, `1` on fail, `2` on error or a budget stop, and `3` on timeout, and these codes are treated as frozen public contracts the tool won't break. A CI step can simply check the exit code without parsing any output at all, though reading the `assertions` block in `--agent` NDJSON output gives you the specific evidence behind a failure.

### Does testmd v2 with Verify steps require an API key?

testmd v2 currently drives BrowserBash's builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway; it does not yet run directly on Ollama or OpenRouter. Once you're on the builtin engine, the API steps and Verify steps themselves make zero model calls, only the plain-English navigation steps in a file consume model calls.

### How is this different from just parsing an AI agent's summary text for pass or fail?

Parsing summary text means trusting a language model's fluent prose to accurately reflect a structured outcome, and that prose can vary in wording and confidence even when the underlying result is identical, or worse, sound confident about a partial or wrong check. Reading `status` and the `assertions` array instead means your gate reacts to a concrete comparison (expected value versus actual value) that either held or didn't, with no interpretation step in between.

Wiring a deterministic test verdict into your gate isn't a big lift: install with `npm install -g browserbash-cli`, add `version: 2` and a couple of Verify lines to the test that guards your riskiest flow, and point your pipeline at the exit code. An account is optional, sign up only if you want the free cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
