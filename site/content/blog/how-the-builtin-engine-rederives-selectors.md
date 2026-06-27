---
title: How the Builtin Engine Re-Derives Selectors Each Action
description: "How the builtin engine works in BrowserBash: an Anthropic tool-use loop that re-derives the selector from a fresh page snapshot on every action, never cached."
date: 2026-06-27
category: agents
---

The builtin engine in BrowserBash works as an Anthropic tool-use loop that takes a fresh snapshot of the page before every action, asks the model which element matches the current step, derives a selector from that snapshot right then, acts on it, and discards the selector. Nothing is cached between actions, and nothing is cached between runs. There is no saved selector script on disk that the engine replays tomorrow. Each action starts from the live state of the page as it exists at that moment, which is why a button that moved, got renamed, or rendered late does not break the run the way a hard-coded CSS path would. This is not self-healing, because nothing is patched and nothing is stored to be repaired later. The engine simply never commits to a selector long enough for it to go stale.

[BrowserBash](https://browserbash.com/features) is a free, open-source, Apache-2.0 natural-language browser-automation and testing CLI from The Testing Academy. You install it with `npm install -g browserbash-cli` and drive it with plain-English objectives. It ships two engines: the default `stagehand` engine (MIT-licensed, by Browserbase) and the alternative `builtin` engine. This article is about the builtin one: what the loop does on each step, how it derives a selector from a snapshot, why it captures native Playwright traces, and where the approach has real limits. For the side-by-side decision of which engine to pick, the [Stagehand vs builtin engine tutorial](https://browserbash.com/blog/browserbash-stagehand-vs-builtin-engine-tutorial) covers that.

## A loop, not a script

A traditional Selenium or Playwright test is a script. You write `page.click("#submit")` once, that selector is baked into the file, and it runs the same way every time until the markup changes and the selector stops matching. The selector is a commitment made at authoring time: fast and deterministic, but brittle, because the page is free to change underneath a string you wrote weeks ago.

The builtin engine inverts that. There is no authored selector at all. What you author is intent: an objective like "log in and confirm the dashboard shows a balance," or a Markdown test file with steps in plain English. At run time the engine turns that intent into a sequence of actions, and for each action it does the following:

1. Take a fresh snapshot of the current page (the accessibility tree plus DOM structure).
2. Send that snapshot, the current step, and the history so far to the model as a tool-use request.
3. The model picks the target element and the action (click, type, select, assert).
4. The engine derives a concrete selector for that element from the snapshot it just took.
5. Playwright performs the action, with its built-in auto-wait handling timing.
6. The engine records the result to the trace and loops to the next step.

The key word is *fresh*. Step 1 happens again before every action. The snapshot the model saw for "click the cart icon" is not the snapshot it uses for "click checkout." Each decision is made against the page as it is right now, not as it was when the run started and certainly not as it was during yesterday's run.

## What "re-derive on every action" actually means

The phrase is easy to wave at, so be precise. It means three concrete things.

First, the selector is computed from the current snapshot, not retrieved from anywhere. When the engine needs to click the submit button, it reads the accessibility tree it just captured, finds the node the model chose (by role and accessible name, with DOM as backup), and produces a selector that targets that node as it currently exists. If the button now reads "Continue" instead of "Submit," the model is looking at "Continue" in this snapshot, so the derived selector targets "Continue." There was never a "Submit" string to mismatch.

Second, nothing survives the action. Once Playwright has clicked the element, the derived selector is done. It lives in the trace as a record, but it is not kept around to reuse. The next action starts from a new snapshot and derives its own selector independently.

Third, nothing survives the run. This is the part people assume must be false, because caching feels like an obvious optimization. The builtin engine does not write a selector file at the end of a passing run and replay it next time. Tomorrow's run takes its own fresh snapshots and derives its own selectors from scratch. That is the deliberate trade: you pay snapshot-and-reason cost on every action in exchange for never inheriting a stale selector. The engine finds elements through the accessibility tree (roles, accessible names, states) plus DOM rather than CSS classes, the approach detailed in [how BrowserBash finds elements with the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree). Classes and IDs churn constantly; roles and accessible names are far more stable, because they are tied to what the element *is* and what it *says*, not to how it was styled.

### Why this is not self-healing

It is tempting to file this under self-healing tooling, and the distinction matters. Self-healing normally means the tool keeps a selector, notices it broke, and patches it, either rewriting the stored locator or trying a ranked list of fallbacks. There is a saved artifact that gets repaired.

The builtin engine has no such artifact. It does not keep a selector to break, so there is nothing to heal. It re-derives from live state every time, so it never reaches the failure condition that healing exists to recover from. The outcome can look similar (a renamed button does not fail the run), but the mechanism differs: a self-healing tool tries to make old intent fit new markup, while the builtin engine re-reads the page and re-decides what to do. That also means it can notice when a change is not cosmetic but a real regression, a judgment covered in [UI change vs real regression: how the agent decides](https://browserbash.com/blog/ui-change-vs-real-regression-how-the-agent-decides).

## The Anthropic tool-use loop, concretely

Under the hood the builtin engine is an Anthropic-style tool-use loop. The model gets a small set of tools (navigate, click, type, select, assert, extract), each with a schema. On each turn the engine sends the current snapshot and the running objective, and the model responds with a tool call: which tool, against which element, with what arguments. The engine executes that call via Playwright, captures the result, and feeds it into the next turn. The loop continues until the objective is met or the engine cannot proceed.

This is why the snapshot is the unit of truth. The model acts on what the latest snapshot and tool result tell it, not on a memory of the DOM from three steps ago. If a step renders late, Playwright's auto-wait (15-second ceiling, no manual sleeps) holds the action until the element is actionable, and the snapshot the model reasons over reflects the settled page. You do not insert waits or retries; the loop plus auto-wait absorbs that.

Here is the simplest invocation:

```bash
browserbash run "log in as the demo user and confirm the dashboard shows a balance" --engine builtin
```

The objective is intent. The engine breaks it into steps, snapshots before each, derives selectors per action, and verifies the final assertion against a fresh read of the dashboard. You wrote zero selectors.

## Tests are intent, and intent composes

Because the engine derives selectors at run time, the test file never mentions them. A BrowserBash Markdown test (`*_test.md`) is a title, a list of steps, and optional composition:

```markdown
# Checkout smoke

1. Go to {{base_url}}
2. Log in as {{demo_user}} with password {{demo_password}}
3. Add the first product to the cart
4. Open the cart and proceed to checkout
5. Confirm the order summary shows a total
```

Run it with:

```bash
browserbash testmd run ./checkout_smoke_test.md
```

Notice what is absent: no `#cart-icon`, no `button.checkout-btn`, no XPath. Step 4 says "open the cart," and at run time the engine snapshots the page, finds the element whose role and accessible name match the cart, derives a selector for it as it exists right then, and clicks it. If the cart icon moved or got a new label between sprints, the step is unchanged, because it was never tied to where the cart was or what it was called.

The `{{variables}}` are filled from your environment or config, and secret values are masked in logs so a password does not leak into output. Tests also compose with `@import`, so a login flow lives in one file and every other test reuses it:

```markdown
# Account settings

@import ./login_test.md

1. Open the account menu
2. Go to settings
3. Toggle email notifications off
4. Confirm the setting saved
```

The imported `login_test.md` is itself intent, so the same re-derivation applies to every step it contributes. There is no shared selector library to keep in sync, because there are no selectors. If you come from a page-object world, this is the strange part: there is no page object, because the thing it exists to centralize does not exist here.

## The traces are native Playwright traces

While the loop runs, the builtin engine captures native Playwright traces. This is not a custom log dressed up to look like Playwright. It is the real `.zip` trace that the Playwright trace viewer opens, with the action timeline, before-and-after DOM snapshots per step, console output, and network activity. Because the engine drives the page through Playwright, the trace is the genuine article.

That matters specifically for understanding re-derivation, because the trace is where you can *see* it happen. Open a builtin run's trace and step through the timeline: each action has its own before snapshot, captured fresh, and you can watch the page state the model reasoned over at that exact step. If a run did something surprising, the trace shows the page as it actually was at the moment of the decision, which is usually enough to explain it. The full artifact-by-artifact walkthrough lives in [reading the Playwright trace from BrowserBash](https://browserbash.com/blog/read-a-playwright-trace-from-browserbash), including how the trace fits alongside the video and `Result.md`.

To produce a trace plus a video and screenshots:

```bash
browserbash run "complete checkout for the first product" --engine builtin --record
```

Every run also writes a plain-English `Result.md` summarizing what the agent did and where it stopped, on any engine. On builtin you additionally get the native Playwright trace for deep inspection.

## How this differs from the stagehand default

The default `stagehand` engine also avoids hard-coded selectors and decides actions from the live DOM. The difference is in the loop and the artifacts, not in "one uses selectors and the other does not." Stagehand observes the live DOM each step and decides the next action from what is rendered right then; it is the default because it suits the broad common case. The builtin engine is the Anthropic tool-use loop above, and its defining practical features are the native Playwright traces and the per-action snapshot-and-derive cycle. Both engines commit nothing at authoring time, so neither inherits a stale CSS path. You reach for builtin when you want the native trace to debug with, or when a grid provider forces it.

## Models, and why the choice matters here

The builtin loop sends a snapshot and a step to a model and gets back a tool call. Whether that call is right depends on the model. BrowserBash resolves it with `auto` by default: Ollama first if running, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free hosted models exist. Running locally means nothing leaves the machine, a real privacy win for internal apps.

The honest caveat: small local models (8B or smaller) are flaky on long, multi-step flows. Because every action is an independent snapshot-and-decide, a weak model can misread a snapshot at step 9 of a 14-step flow and pick the wrong element, and re-derivation does not protect you from a bad reasoning step. For hard flows, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model holds the plan together far more reliably. More is on the [features page](https://browserbash.com/features) and the [learn hub](https://browserbash.com/learn).

## Running it in CI

The same loop runs unattended. For CI, `--agent` emits NDJSON so a pipeline can parse each step, and exit codes are explicit: `0` pass, `1` fail, `2` error, `3` timeout. Add `--headless` for no display and `--record` for the webm and screenshots:

```bash
browserbash testmd run ./checkout_smoke_test.md \
  --engine builtin --headless --agent --record
```

If the run exits `1`, a real assertion failed; `3` is the timeout ceiling; `2` errored before a verdict. Because builtin produces a native Playwright trace, a failed CI run leaves an artifact you can open locally in the trace viewer to see the exact snapshot at the failing step, rather than a stack trace pointing at a selector string. You can opt in to a cloud dashboard with `--upload` (free runs kept 15 days), run a local one with `browserbash dashboard`, and select providers with `--provider local|cdp|browserbase|lambdatest|browserstack`.

## Honest limits

Re-deriving on every action is not free.

**It is slower than a cached script.** A script with hard-coded selectors just clicks; the builtin engine pays a snapshot-and-model-call cost on every action. For a stable page that genuinely never changes, that cost buys you nothing a plain script would not. The approach earns its keep when pages change, when you do not want to maintain selectors, or when you want intent-level tests. On a frozen page with a long suite, a traditional script is faster.

**A bad model produces bad selections.** The engine derives a selector for the element the model chose. If the model chose wrong (the second "Add to cart" when you meant the first, an ambiguous accessible name), the derived selector faithfully targets the wrong element. Re-derivation protects against the page changing, not against the model misreading it. This is exactly why small local models are risky on long flows.

**Ambiguity is still ambiguity.** Three visually identical "Edit" buttons with the same accessible name and no distinguishing context do not get magically disambiguated by a fresh snapshot. Writing the step with more context ("edit the row for the demo user") helps, but the underlying ambiguity is a property of the page.

**Heavy non-determinism can still bite.** Auto-wait handles late elements up to its 15-second ceiling, but a page that renders different content on every load can still produce diverging runs. Re-derivation makes the engine robust to *structural* change, not to genuine randomness in what the page shows.

These are mostly inherent to driving a browser with a model rather than a script. The honest summary: re-derivation buys robustness to page change at the cost of speed and a dependence on model quality.

## FAQ

### Does the builtin engine cache selectors between runs?

No. It does not write a selector file at the end of a run and replay it next time. Every run takes its own fresh snapshots and derives its own selectors from scratch. That is slower than replaying a cached script and is deliberate: you never inherit a stale selector from a previous run, because no selector survives to be inherited.

### Is the builtin engine self-healing?

No, and the distinction is real. Self-healing tools keep a stored selector, detect when it breaks, and patch it or fall back to a ranked alternative. The builtin engine keeps no stored selector, so there is nothing to break or repair. It re-derives from the live page on every action, so it never reaches the failure state that healing exists to recover from.

### What makes the traces "native" Playwright traces?

The builtin engine drives the browser through Playwright, so the trace it captures is the real Playwright `.zip` trace, not a custom format. You open it in the standard Playwright trace viewer and get the action timeline, before-and-after DOM snapshots per step, console output, and network activity. That is what lets you see the exact snapshot the engine reasoned over at each action.

### Do I need a big model for re-derivation to work well?

You need a model good enough to read each fresh snapshot and pick the right element. Re-derivation protects you from the page changing, not from a model misreading it. Small local models (8B or smaller) are flaky on long multi-step flows for that reason. For hard flows, use a 70B-class local model (Qwen3, Llama 3.3) or a hosted model; for short, well-scoped objectives, a smaller model is often fine.

## Where this leaves you

The builtin engine's whole personality comes from one design choice: never commit to a selector. Snapshot the live page before every action, let the model pick the element, derive a selector from that snapshot, act, and discard it. Nothing is cached across actions, nothing is cached across runs, and nothing is patched, which is why it is not self-healing and does not need to be. You write intent in plain English or in a `*_test.md` file, the engine handles the rest at run time, and the native Playwright trace lets you watch every re-derivation if you need to. Install it with `npm install -g browserbash-cli`, run an objective with `--engine builtin --record`, and open the trace to see the loop in motion.
