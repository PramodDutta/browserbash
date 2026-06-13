---
title: Regression Testing With AI Agents: A Practical Playbook
description: "Build a regression suite with AI agents and committable markdown tests. A practical playbook for stable, selector-free browser regression checks."
date: 2026-06-13
category: use-case
---

Regression testing with AI agents flips the most expensive part of a test suite on its head: instead of maintaining brittle selectors that snap every time the UI moves, you write plain-English checks that an agent re-interprets against the live page on every run. This playbook is about building one specific thing — a committable, reviewable regression suite made of markdown files — and running it the same way locally, in CI, and across real browsers. The tool throughout is [BrowserBash](https://browserbash.com), a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You describe what should stay true; an AI agent drives a real Chrome/Chromium browser and returns a verdict plus structured results. Every command below is real and runs as printed.

A regression suite has a different job than an exploratory test or a one-off smoke check. Its entire purpose is to answer one question on a schedule — *did anything that used to work stop working?* — and to answer it the same way every time, so a red result means a real change in product behavior and nothing else. That stability requirement is exactly where selector-based suites struggle and where an agent-driven approach earns its place. The rest of this article is the practical build: what to put in the suite, how to write checks that do not drift, how to structure the files, and how to wire it into CI so it gates merges.

## Why regression suites rot, and what AI agents change

The dirty secret of most regression suites is that they spend more engineering time being maintained than being written. The tests themselves are fine; the bindings to the DOM are what rot. A check that reads `await page.locator('[data-testid="checkout-submit"]').click()` is precise the day it is written and a liability the day a designer renames the attribute or moves the button into an overflow menu. The feature still works, the test goes red, and an engineer spends an afternoon discovering nothing was broken except the selector. When a suite cries wolf often enough, teams stop trusting it: they re-run red builds, add blanket retries, and eventually mute the flakiest specs. A muted regression test is worse than no test, because it advertises coverage that does not exist.

Regression testing with AI agents attacks the root cause: you do not bind to the DOM at all. You write the *intent* — "Click the Checkout button and confirm the order summary shows a total" — and on every run the agent reads the current page, locates the button the way a person would, and decides whether the assertion holds. A renamed attribute changes nothing, because the test never referenced the attribute; the check only goes red when the thing you actually care about — the order summary, the total — is genuinely missing. That is the property a regression suite needs more than any other: failures that mean something.

There is a fair counterpoint: an agent re-reading a page is not free, and not as instantaneous as a hard-coded selector click. The trade is run cost against maintenance cost — and for a regression suite, which reruns the *same* flows over and over while the UI underneath them changes, maintenance cost is the dominant term. That is exactly where the trade pays off. Use the agent where the churn is.

## What belongs in a regression suite (and what does not)

Before writing a single check, decide what the suite is *for*. A regression suite is not a place to verify every edge case or fuzz inputs — that is the job of unit and integration tests. It guards the handful of flows whose breakage would be a genuine incident:

- **Critical user journeys.** Sign-up, login, the primary "happy path" your product is built around — add-to-cart through checkout, create-a-project, send-a-message. If one of these breaks, you want to know before your users do.
- **High-traffic, high-revenue surfaces.** The pricing page rendering its plan cards, the search box returning results, the dashboard loading after login — the pages where a silent break is most expensive.
- **Flows that have broken before.** Every incident is a vote for a regression test. The bug that shipped last quarter because nobody re-checked the password-reset flow is exactly the check you add this quarter.

What to leave out is just as important. Resist the urge to convert your entire manual test plan into agent checks. A bloated regression suite is slow, costs more to run, and dilutes the signal — the more flows you cover, the more likely some unrelated flake turns the whole run red. Keep it lean: twelve well-chosen flows that gate every merge beat two hundred that run nightly and get ignored, and you can always grow the suite by adding the next flow that breaks. If you would page someone at 2 a.m. because the flow is down, it belongs in the regression suite.

## Install BrowserBash and run your first regression check

Install the CLI globally from npm — the package is [browserbash-cli](https://www.npmjs.com/package/browserbash-cli):

```bash
npm install -g browserbash-cli
```

The agent needs a model to drive it. BrowserBash is Ollama-first: it auto-detects a local Ollama install and runs against it for free, no API keys, nothing leaving your machine. If you have Ollama, pull a capable model:

```bash
ollama pull qwen3
```

A note for regression work specifically: multi-step flows reward a stronger model. Small models in the 8B-and-under range tend to wander when a check has six or seven steps, which shows up as flaky runs — the exact thing a regression suite exists to *not* have. A Qwen3 or Llama 3.3 70B-class model is the reliable sweet spot. If you would rather not run anything locally, BrowserBash also auto-detects an Anthropic key, then falls back to OpenRouter, which includes free hosted models such as `openai/gpt-oss-120b:free`. The resolution order is Ollama, then Anthropic, then OpenRouter.

The fastest way to feel the loop is a one-shot objective. This runs as printed against a public practice login app whose demo credentials are published on its own page:

```bash
browserbash run "Open https://practicetestautomation.com/practice-test-login/, type 'student' into the username field and 'Password123' into the password field, click Submit, confirm the text 'Congratulations' is visible, and store the page heading as 'heading'" --headless
```

The agent opens a real browser, works through the objective, and prints a verdict plus any stored values; `store ... as 'heading'` is how you pull a structured value out of a run for a later stage. A single `browserbash run` is perfect for a smoke check, but a regression *suite* wants something you can commit, review in a pull request, and rerun unchanged for months. That is the next section.

## Build the suite with committable markdown tests

BrowserBash's format for a durable suite is the **markdown test**: a committable `*_test.md` file where each list item is one step the agent executes. It reads like a checklist a human could follow, which is exactly why it works as regression documentation — a reviewer who has never opened a test framework can tell whether the check is correct.

Here is `login_test.md`, a complete regression check for the login flow:

```markdown
# Login regression

- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field
- Click the "Sign in" button
- Verify the dashboard heading is visible
- Verify the "Log out" button is visible
```

Run it with `testmd run`:

```bash
browserbash testmd run login_test.md
```

The agent executes the list one item at a time, judges the result, and writes a `Result.md` next to the file recording the verdict, per-step outcomes, and any stored values. For authoring you will usually want a visible window; for unattended runs add `--headless`.

The single most important habit for a *regression* suite is to **assert often**. An action step ("Click Sign in") tells the agent what to do; a `Verify ...` step turns intent into a hard check that fails the run if it does not hold. Without checkpoints, an agent can technically "complete" a flow while landing somewhere wrong and still report success — and a regression suite that passes when the product is broken is worthless. Treat every meaningful state change as a place to drop a `Verify`; the checkpoints are what make these files *tests* rather than scripts.

A second habit: one action per line. "Type the username, type the password, and submit" in a single bullet asks the agent to plan three things at once, which is where wandering creeps in. The [learn pages](https://browserbash.com/learn) cover the full grammar of action and checkpoint steps.

### Keep secrets out of the files with variables

Notice the `{{base_url}}`, `{{username}}`, and `{{password}}` placeholders above. Hard-coding a staging URL and a password into a committed test file is a problem twice over: the file only runs against one environment, and the password is now in your Git history forever. The `{{variable}}` syntax fixes both. Anywhere you write `{{name}}` in a step, BrowserBash substitutes a value at run time from a variables JSON file:

```json
{
  "base_url": "https://staging.example.com",
  "username": "qa@example.com",
  "password": { "value": "s3cr3t-pass", "secret": true }
}
```

A plain `"key": "value"` is a normal substitution. The object form `{ "value": "...", "secret": true }` marks a value as a secret, and a secret is **masked as `*****`** everywhere it would otherwise appear — console output, logs, and the `Result.md` report. The agent still uses the real value to drive the browser; you simply never see it printed. That masking is what makes it safe to commit a `_test.md` that *references* `{{password}}`: the sensitive value lives in a separate file you keep out of version control. The same check now runs against staging, a preview, or a production-like environment by swapping which variables file you point at — the test never changes.

### Factor shared steps with @import

Almost every authenticated regression check starts the same way: open the login page, sign in, confirm you landed. Copy-pasting that prelude into twenty files means twenty places to fix when the login form changes — the exact maintenance tax you adopted an agent to avoid. `@import` removes it. Put the shared steps in their own markdown file (these helpers skip the `_test.md` suffix, since they are shared steps, not standalone tests):

```markdown
- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field
- Click the "Sign in" button
- Verify the dashboard heading is visible
```

Then pull it into any test exactly where those steps belong in the flow:

```markdown
# Checkout regression

@import ./helpers/login.md

- Open {{base_url}}/products
- Click "Add to cart" on the first product
- Go to the cart and click "Checkout"
- Verify the order summary shows a total
- Store the order id as 'order_id'
- Verify the "Place order" button is visible
```

Mechanically, `@import` splices the helper's steps into the test at that line, in order, so the agent sees one flat sequence — exactly as if you had typed the login steps inline. The payoff is the maintenance win every regression suite needs: when the login field is renamed or the sign-in button moves, you fix `helpers/login.md` once and every check that imports it is fixed. Twenty tests that each begin with the same login no longer mean twenty edits.

A sensible layout for the whole suite:

```text
.browserbash/
├── tests/
│   ├── helpers/
│   │   └── login.md
│   ├── login_test.md
│   ├── checkout_test.md
│   └── search_test.md
└── variables/
    ├── staging.json
    └── preview.json
```

Keep helpers small and imperative — one action per line, the same rules as any test — and name them for the flow they encapsulate (`login.md`, `add_to_cart.md`, `open_admin.md`).

## Make it deterministic enough to trust

"Deterministic" is a strong word for anything involving a model, so be precise about what a regression suite needs: not identical internal steps, but a verdict that is the same whenever the product behavior is the same. You get there by removing the variance you control. Four habits do most of the work.

**Assert on outcomes, not incidental details.** "Verify the order summary shows a total" is robust; "Verify the total is exactly $49.00" is fragile if prices, taxes, or test data drift, and it will flake for reasons that are not regressions. Pin the *invariant* — a total is shown, the confirmation appears, the count increased — and leave volatile specifics to other test layers.

**Stabilize your test data.** The fastest way to make an agent-driven suite flaky is to point it at data that changes underneath it. Use a dedicated test account, seed a known product, and prefer flows whose expected end-state does not depend on yesterday's activity — a path that is true every day.

**Keep each check focused.** A test that does one job fails for one reason, and a single-reason failure is debuggable. A mega-test that logs in, searches, adds to cart, checks out, and logs out has six ways to go red and tells you nothing about which behavior regressed. Split by flow; each `*_test.md` is one journey.

**Bound the run.** Pair runs with `--timeout` (seconds) so a hung page becomes a clean `timeout` verdict instead of a job that runs forever. In a regression context a timeout is a distinct signal from a failure — usually the environment was slow, not that the product broke — and BrowserBash keeps them as separate exit codes.

## Run the whole suite in CI with exit codes

A regression suite that only runs when someone remembers to run it is not a regression suite — the point is to gate merges automatically. The `--agent` flag switches a run into machine mode: it emits NDJSON (one JSON event per line, on a stable schema) on stdout and human-readable progress on stderr. But the part that makes CI integration trivial is the **exit code** — you never parse prose to decide pass or fail. Every `browserbash run` and `browserbash testmd run` terminates with one of four codes:

| Exit code | Meaning | Typical CI response |
|---|---|---|
| `0` | passed | continue |
| `1` | failed — a `Verify` checkpoint did not hold | fail the build; a human should look |
| `2` | error — infrastructure or agent problem | retry once, then fail |
| `3` | timeout — the run outlived its `--timeout` budget | retry once or raise the budget |

The granularity is what makes this trustworthy. A `1` is a *product* signal — a checkpoint broke, behavior changed — and silently retrying it until it passes is how teams train themselves to ignore red; a `2` or `3` is an *environment* signal worth one automatic retry. Because the codes are distinct, your pipeline treats a real regression and an infrastructure flake differently without reading a single line of output.

Here is a GitHub Actions job that parallelizes the suite, one matrix entry per flow, with each flow keeping its own verdict and its own artifact:

```yaml
name: regression
on:
  push:
    branches: [main]
  pull_request:

jobs:
  regression:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        flow: [login, checkout, search]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli

      - name: Run ${{ matrix.flow }} regression
        run: |
          browserbash testmd run ./.browserbash/tests/${{ matrix.flow }}_test.md \
            --agent --headless --timeout 180 > ${{ matrix.flow }}.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          APP_PASSWORD: ${{ secrets.APP_PASSWORD }}

      - name: Upload NDJSON
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.flow }}-ndjson
          path: ${{ matrix.flow }}.ndjson
```

Three details are doing the quiet work. `fail-fast: false` lets every flow report its own result instead of cancelling siblings the moment one goes red. The redirect (`> login.ndjson`) captures the clean NDJSON on stdout while the Actions log still shows readable progress on stderr. And `if: always()` on the upload step means a *failing* run — exactly when you most want the evidence — still archives its artifact. There is no "parse results" step, because the run step already failed precisely when the regression check failed.

The final NDJSON line is always a single `run_end` event carrying the verdict, duration, and any stored values, so `tail -1 login.ndjson | jq` pulls the result and the `order_id` you captured. There is a fuller treatment of CI wiring, secrets, and matrix patterns on the [BrowserBash blog](https://browserbash.com/blog).

## Capture evidence: recordings, video, and traces

When a regression check fails on a machine you are not sitting at, "it failed" is rarely enough; you want to see what the agent saw. The `--record` flag captures a screenshot **and** a session video (a `.webm`, stitched with ffmpeg) on either engine:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md --headless --record
```

BrowserBash ships two engines: the default **Stagehand** engine (the MIT-licensed AI browser-automation framework from Browserbase) and a **builtin** engine (an in-repo Anthropic tool-use loop driving Playwright). Recording on the builtin engine additionally captures a Playwright trace you can step through frame by frame. A common CI pattern keeps artifacts small by recording only on a real failure: capture the exit code, and if it is a `1`, re-run once with `--record` to produce the replay.

## Scale across real browsers and push history to a dashboard

A regression suite often needs to prove a flow works on more than the runner's own Chrome. The same `*_test.md` files run on a remote browser grid by switching one flag — `--provider`:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md \
  --provider lambdatest --headless --record
```

The supported providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. The test files do not change — the agent reads the same steps, asserts the same checkpoints, and writes the same `Result.md`. Where the browser physically runs is a deployment detail, not a rewrite.

By default, nothing leaves your machine. If you want regression *history* across runs, replayable recordings, and a per-run timeline in one place, create a free account, connect the CLI, then add `--upload` to the runs you want pushed:

```bash
browserbash connect --key bb_xxxxxxxx
browserbash testmd run ./.browserbash/tests/checkout_test.md --record --upload
```

`--upload` sends that run — verdict, recording, and metadata — to the cloud dashboard, where you get run history and per-run replay. That history is genuinely useful for regression: it turns "the checkout test went red" into "it passed for forty days and broke on this commit," the trend a regression suite exists to surface. Cloud runs are kept for 15 days on the free tier. Prefer to keep everything local? Run the free, private built-in dashboard with `browserbash dashboard`. The rule is worth repeating: **nothing leaves your machine unless you pass `--upload`.**

## A regression workflow that holds up

Put the pieces together and a durable pattern emerges. Pick a *lean* set of critical flows and write each as its own `*_test.md` file under version control. Factor every repeated prelude into a `helpers/` file and pull it in with `@import`, so a UI change to login is one edit, not twenty. Push environment-specific and sensitive values into a variables JSON file, marking secrets `secret: true`. Make every meaningful state change a `Verify` checkpoint, and assert on invariants rather than volatile specifics. Run with a visible browser while you author, then `--headless --agent --timeout` in CI, where the exit code gates the merge and the four codes let you tell a real regression (`1`) from an infrastructure flake (`2`/`3`). Add `--record` to anything that can fail unattended, and `--upload` only when you want the run in the dashboard's history.

The result is a regression suite that reads like documentation, survives the UI churn that shatters selector scripts, and is reviewable by people who would never open a test framework. That is the whole promise of regression testing with AI agents: you spend your time deciding *what* must stay true, and almost none of it maintaining bindings to *how* the page is wired today.

## FAQ

### Is AI-agent regression testing reliable enough to gate merges?

Yes, when you build for it. The key is asserting on invariants rather than volatile specifics, stabilizing test data, keeping each check focused on one flow, and bounding runs with `--timeout`. With those in place, a BrowserBash regression run flips red only when product behavior actually changes, and the four-way exit code (`0` passed, `1` failed, `2` error, `3` timeout) lets your pipeline distinguish a genuine regression from an infrastructure flake before deciding whether to fail the build.

### How is this different from a Playwright or Selenium regression suite?

The difference is what the test binds to. Selector-based suites reference the DOM directly — a `data-testid`, a CSS path — so they break when the markup changes even if the feature works, which is the main source of regression-suite maintenance. BrowserBash checks describe intent in plain English, and the agent re-reads the live page on every run to satisfy them, so a renamed attribute changes nothing. The trade is run cost for maintenance cost, which favors regression suites because they rerun the same flows while the UI underneath them churns.

### How do I keep credentials out of my committed regression tests?

Use `{{variables}}`. Anywhere a test references `{{password}}`, BrowserBash substitutes the value at run time from a separate variables JSON file, and a value written as `{ "value": "...", "secret": true }` is masked as `*****` in console output, logs, and the `Result.md` report. The committed `*_test.md` only ever references the placeholder, never the secret — keep the variables file out of version control or inject it from a secrets manager, and the password never reaches your Git history.

### Can I run the same regression suite across multiple browsers?

Yes — the provider is a single flag and the test files do not change. The default `local` provider drives your own Chrome/Chromium; switching to `--provider lambdatest` (or `browserstack`, `browserbase`, or `cdp` for any DevTools endpoint) runs the identical `*_test.md` files on a remote grid. The agent reads the same steps, asserts the same checkpoints, and writes the same `Result.md`, so cross-browser coverage is a deployment choice rather than a separate suite to maintain.

---

Ready to build your regression suite? [Create a free account](https://browserbash.com/sign-up) and try it on a real flow today. BrowserBash is free and open source (Apache-2.0) — install it with `npm install -g browserbash-cli`, write a `*_test.md` checklist, run `browserbash testmd run`, and let plain-English checks and exit codes — not brittle selectors and log parsing — decide whether your build stays green. Nothing leaves your machine unless you pass `--upload`.
