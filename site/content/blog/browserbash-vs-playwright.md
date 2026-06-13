---
title: Playwright vs BrowserBash: Selectors vs Plain English
description: "Playwright vs BrowserBash: when code-first selectors win, when plain-English AI tests win, and how to run both in one CI pipeline."
date: 2026-06-13
category: comparison
---

Playwright vs BrowserBash is not really a fight, and treating it like one leads teams to the wrong tool for the wrong job. Playwright is a mature, code-first browser automation framework: you write TypeScript or Python, target elements with locators, and get fast, deterministic execution with first-class tooling. BrowserBash is the opposite end of the spectrum — you write a plain-English objective, an AI agent drives a real Chrome browser, and you get back a verdict plus structured results with no selectors to maintain. This post compares the two honestly, shows where each one earns its keep, and makes the case that the realistic answer for most teams is "both," wired into the same pipeline.

I am not going to pretend BrowserBash replaces Playwright for everyone. Playwright is excellent, and a large, stable suite of Playwright tests is one of the best assets a QA team can own. What I will argue is that there is a band of work — new coverage you need today, UIs that churn weekly, smoke and journey tests a product manager should be able to read — where writing and maintaining selectors is pure overhead, and that is exactly the band where plain English wins.

## What Playwright actually gives you

It is worth being precise about Playwright's strengths, because they are real and they are the reason it is everywhere.

**Auto-waiting locators.** Modern Playwright leans on the `Locator` API and role-based queries (`getByRole`, `getByLabel`, `getByText`). Locators are lazy and auto-wait: before a click or assertion, Playwright checks that the element is attached, visible, stable, and actionable. This killed a whole category of flakiness that plagued older tools, and it is a genuinely good design.

**Speed and parallelism.** A Playwright action is a direct protocol command — milliseconds, not seconds. The test runner shards across workers and machines out of the box, so an 800-test suite finishes in minutes on enough CPUs. For large regression walls, nothing about an AI agent competes with this.

**Tooling.** Codegen records your clicks into a starting script. The Trace Viewer gives you a time-travel debugger with DOM snapshots, network, and console for every action. Web-first assertions like `await expect(locator).toHaveText(...)` retry until they pass or time out. This tooling is mature and, frankly, hard to beat.

**Determinism.** The same script runs the same way every time. When it fails, it fails identically, which makes failures reproducible and CI gates trustworthy.

None of that is in dispute. The cost shows up elsewhere.

## What code-first costs you

Every Playwright test is code, and code has carrying cost. Someone writes the locators, keeps them in page objects or fixtures, and patches them when the frontend changes. A renamed test id, a restructured DOM, a component-library upgrade — any of these can turn a green suite red for reasons that have nothing to do with the product being broken. Teams build elaborate locator strategies and `data-testid` conventions specifically to fight this, and that discipline is itself an ongoing tax.

There is also an authoring-speed cost. Spinning up a new end-to-end test means a real engineering task: find the elements, write the steps, wire the assertions, handle the waits the auto-waiting does not cover. For a flow you will run forever, that investment pays off. For a one-off check, an exploratory pass, or coverage you needed yesterday, it is friction. Worse, the friction lands at the exact moment you can least afford it — a feature just shipped, a regression just slipped through, and the test you wish you had does not exist yet because writing it was never the fast path.

And there is a readability cost. A Playwright test is legible to engineers who know the codebase. It is not legible to the product manager who owns the feature, the support lead who reported the bug, or the designer who changed the layout. The test and the intent live in different languages.

BrowserBash attacks exactly these three costs, and pays for it elsewhere.

## What BrowserBash does differently

With [BrowserBash](https://www.npmjs.com/package/browserbash-cli) you describe the goal in plain English and an AI agent figures out the steps against a real browser. There are no locators because the agent re-reads the page on every run and finds elements the way a person would. Install once and run:

```bash
npm install -g browserbash-cli

browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the 'Sauce Labs Backpack' to the cart, open the cart, and verify the backpack is listed" \
  --headless
```

That command is runnable as printed — the demo credentials are published on the login page itself. The `verify` clause is the assertion: if the backpack is not in the cart, the run fails with a non-zero exit code. No page object, no selectors, no waits to tune.

Two engines sit underneath. The default is **stagehand** (the MIT, open-source engine from Browserbase), built around self-healing, resilient automation. The alternative is **builtin**, an in-repo Anthropic tool-use loop that additionally captures a Playwright trace when you record — so even the AI path can hand you the same Trace Viewer artifact Playwright users already know.

On models, BrowserBash is Ollama-first: it auto-detects a local Ollama install before anything else, which means free, local inference with no API keys. It also supports OpenRouter — including genuinely free models such as `openai/gpt-oss-120b:free` — and Anthropic Claude if you bring your own key. The detection order is Ollama, then Anthropic, then OpenRouter, so the default experience costs nothing.

### Committable tests in markdown

The CLI one-liner is great for quick checks, but real suites need to live in the repo. BrowserBash uses markdown test files where each list item is a step:

```markdown
# Checkout smoke test

- Open https://www.saucedemo.com
- Log in as {{user}} with password {{password}}
- Add the "Sauce Labs Backpack" to the cart
- Open the cart and proceed to checkout
- Fill first name "Ada", last name "Lovelace", zip "94016"
- Continue and finish the order
- Verify the page shows "Thank you for your order!"
```

Run it, and a `Result.md` report lands next to the file:

```bash
browserbash testmd run ./checkout_test.md --headless \
  --variables '{"user":"standard_user","password":{"value":"secret_sauce","secret":true}}'
```

The `@import` directive composes shared steps (a reusable login block, for instance), and `{{variables}}` keep environments and credentials out of the file. Anything marked `secret` is masked as `*****` everywhere it would otherwise print. This is the BrowserBash analog to Playwright fixtures and page objects — except the "objects" are sentences, and a non-engineer can read the diff in a pull request.

## Side by side

Here is an honest, high-level comparison. The Playwright column reflects well-known facts about the framework; nothing here is invented.

| Dimension | Playwright | BrowserBash |
|---|---|---|
| Test authoring | TypeScript / Python code with locators | Plain-English objective or markdown steps |
| Element targeting | Explicit locators (`getByRole`, CSS, etc.) | AI agent finds elements at run time, no selectors |
| Execution model | Direct protocol commands, deterministic | LLM agent plans steps per run, goal-deterministic |
| Speed per action | Milliseconds | Seconds (includes model inference) |
| Parallelism | Built-in sharding across workers/machines | Run files in parallel via your CI matrix |
| Flakiness model | Auto-waiting locators reduce timing flakes | Self-healing; re-reads page, tolerates UI churn |
| Maintenance on UI change | Update locators / page objects | Often none — the agent adapts |
| Debugging artifacts | Trace Viewer, video, screenshots | Screenshot + `.webm` video; trace on builtin engine |
| CI contract | Test runner exit status + reporters | Exit codes 0/1/2/3 + NDJSON events |
| LLM / model cost | None | Free with local Ollama; paid models optional |
| Readable by non-engineers | No | Yes |
| License | Apache-2.0, open source | Apache-2.0, open source |

A few cells deserve a footnote. Playwright's parallelism is a property of its test runner; BrowserBash parallelizes at the file level through whatever CI matrix you already use, which is coarser but perfectly adequate for smoke and journey suites. And "goal-deterministic" is the key honest caveat on the BrowserBash side — covered next.

## The honest tradeoffs

**Determinism is the big one.** Playwright executes the same instructions every run and fails identically. A BrowserBash agent plans at run time, and two runs can take slightly different paths to the same goal. BrowserBash narrows the gap with explicit `verify` steps, a `--max-steps` cap, a `--timeout`, and exit codes as the contract — runs are goal-deterministic, not path-deterministic. If you need bit-identical execution traces for a compliance suite, Playwright wins, full stop.

**Speed.** A Playwright click is milliseconds; every BrowserBash step includes a model inference round trip. For a 12-test smoke suite the difference is irrelevant. For an 800-test regression wall it is disqualifying. Keep the big regression suite in Playwright; that is what it is for.

**LLM cost and reliability.** Every agent step costs tokens, though you hold the levers: the default local Ollama path is free, and you can swap models per run when you want more capability. The flip side is that very small local models (roughly 8B and under) get flaky on long multi-step objectives — a capable model in the Qwen3 or Llama 3.3 70B class behaves much better. This is a real operational consideration, not a footnote.

**Tooling maturity.** Playwright's Trace Viewer and codegen are battle-tested across millions of runs. BrowserBash records a screenshot and a stitched `.webm` video on any engine (and a Playwright trace on the builtin engine), which is genuinely useful, but the surrounding ecosystem is younger. BrowserBash is an open-source MVP and is upfront about that.

## Where each approach wins

Reach for **Playwright** when you have a large, stable regression suite; when per-test budgets are sub-second; when you need pixel-precise interactions or low-level network interception; when a fully deterministic, network-free execution trace is mandatory; and when your authors are engineers who live in the codebase.

Reach for **BrowserBash** when you need new coverage today and cannot afford to write locators first; when the UI churns weekly and selector maintenance is eating your week; for smoke tests, happy-path journeys, and post-deploy sanity checks; when you want a test a product manager can read and approve in review; and when you want to run everything locally and for free with Ollama before any model bill exists.

The realistic pattern is coexistence, not replacement. A team I would describe as typical — the scenario is illustrative, a composite rather than one real customer — keeps its full Playwright regression suite exactly where it is, and moves the dozen flows that churn the most into markdown BrowserBash tests. Both run in the same pipeline. Both gate merges. And critically, both report to CI through the same kind of pass/fail contract, so the merge gate does not care which tool produced the verdict.

## Running both in one pipeline

Because BrowserBash's interface is exit codes plus NDJSON — not prose you have to grep — it slots into CI next to Playwright cleanly. The `--agent` flag makes the contract explicit: NDJSON events stream to stdout, human-readable logs go to stderr, and the process exit code is the verdict (`0` passed, `1` failed, `2` error, `3` timeout).

```yaml
name: e2e
on: [push]
jobs:
  playwright:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test          # the big deterministic regression wall

  browserbash-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli
      - run: browserbash testmd run ./tests/checkout_test.md --agent --headless --timeout 180 > smoke.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: smoke-ndjson
          path: smoke.ndjson
```

There is no "parse results" step on the BrowserBash job — the run fails exactly when the test fails, because the exit code is the verdict. The terminal NDJSON line carries the structured summary you might want downstream:

```json
{"type":"run_end","status":"passed","summary":"Checkout flow verified","duration_ms":48211,"steps_executed":9,"provider":"local"}
```

Pull any field with `jq` and you are done — no scraping, no regex against log text that a tooling upgrade might silently change.

## Recordings and cloud grids, without changing the test

Two more places where BrowserBash mirrors capabilities Playwright users expect. First, recording: add `--record` to any run to capture a screenshot and a stitched `.webm` session video on either engine (the builtin engine adds a Playwright trace), which is your replay when a smoke test fails at 2 a.m.

Second, where the browser actually runs. By default BrowserBash drives your local Chrome. One flag moves the same test onto a cloud grid — `--provider lambdatest` (or `browserstack`, or `browserbase`), or `--provider cdp` to attach to any DevTools endpoint — without editing a single step:

```bash
browserbash testmd run ./checkout_test.md --provider lambdatest --record --agent --headless
```

This parallels how Playwright lets you point the same tests at different browsers and remote environments, except here the only thing that changes is one CLI flag and the test prose stays put.

If you want the run history and per-run replay experience, BrowserBash has a dashboard too. A free private local one runs with `browserbash dashboard`. For a shared cloud view, create a free account, authenticate with `browserbash connect --key bb_...`, and add `--upload` to push a run up for history and replay. Nothing leaves your machine unless you pass `--upload` — local-first and private by default. There is more on engines, providers, and markdown tests in the [BrowserBash docs](https://browserbash.com/learn), and the [blog](https://browserbash.com/blog) has deeper dives on CI exit codes and the markdown test format.

## A pragmatic migration path

You do not rewrite anything. The sane way to adopt BrowserBash alongside Playwright is incremental:

1. Leave the entire Playwright regression suite untouched. It is an asset; treat it like one.
2. Find the three to five tests that break most often for selector reasons, not product reasons. These are your churn victims.
3. Re-express each as a markdown `*_test.md` file — steps in plain English, `{{variables}}` for env and secrets, `@import` for the shared login block.
4. Run them locally for free against Ollama, confirm the verdicts, then add them to CI as a separate job that gates merges by exit code.
5. As you write *new* coverage for fast-moving features, default to plain English and only drop down to Playwright when you hit a case that genuinely needs deterministic, low-level control.

After a few weeks you have a suite that splits along the natural seam: deterministic, high-volume, pixel-precise checks in Playwright; fast-moving, human-readable, low-maintenance flows in BrowserBash. Neither tool is doing the other's job badly.

A useful way to decide which side a given test belongs on is to ask one question: when this test fails, is the most likely cause a real product defect or a brittle selector? If it is a defect — payment math, an auth boundary, a data-table edge case — keep it in Playwright, where deterministic execution and the Trace Viewer make the failure precise and reproducible. If it is selector churn on a screen the design team touches every sprint, that test is a maintenance liability in code form, and it is a strong candidate to become a plain-English BrowserBash step that simply adapts. Over time this question, applied test by test, draws the boundary for you without anyone having to mandate a policy from the top.

It is also worth saying what does not change. Your CI configuration, your branch protections, your artifact storage, and your notification wiring all stay the same, because both tools speak the only language a merge gate cares about — a process exit code. That is the quiet reason the two coexist so easily: there is no new orchestration layer to learn, no glue service to operate, just one more job that passes or fails like every other job already does.

## FAQ

### Is BrowserBash a replacement for Playwright?

No, and it is not pitched as one. Playwright is the better choice for large deterministic regression suites, sub-second per-test budgets, and pixel-precise or low-level network work. BrowserBash is the better choice for new coverage you need quickly, UIs that change often, and smoke or journey tests that should be readable by non-engineers. Most teams run both, gated by the same CI exit-code contract.

### Can I keep my existing Playwright tests and add BrowserBash?

Yes — that is the recommended path. You change nothing about your Playwright suite. You add BrowserBash as a separate CI job for the handful of fast-moving flows where selector maintenance hurts most, run them locally for free against Ollama first, then let them gate merges by exit code just like your other tests.

### How does BrowserBash handle flakiness without explicit waits?

The default Stagehand engine re-reads the page on each run and is built around self-healing automation, so it adapts to layout and markup changes that would break a hardcoded locator. Reliability scales with model capability: very small local models get flaky on long multi-step objectives, while a Qwen3 or Llama 3.3 70B class model handles them well. You also bound runs with explicit `verify` steps, `--max-steps`, and `--timeout`.

### Does BrowserBash cost money to run?

The tool itself is free and open source under Apache-2.0, and it is Ollama-first, so the default path runs models locally with no API keys and no per-run cost. You can optionally use OpenRouter (including free models) or your own Anthropic key when you want more capability, swapping models per run with a single flag. Nothing is uploaded anywhere unless you explicitly pass `--upload`.

---

Ready to put plain English next to your Playwright suite? It is free and open source — install with `npm install -g browserbash-cli`, run your first test locally against Ollama, and [create a free account](https://browserbash.com/sign-up) when you want cloud run history and per-run replay.
