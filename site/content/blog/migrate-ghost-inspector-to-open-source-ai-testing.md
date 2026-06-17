---
title: Migrate Ghost Inspector Tests to Open-Source AI Testing
description: "Looking for a ghost inspector alternative open source? Migrate recorded suites to version-controlled Markdown tests that run free and local."
date: 2026-04-29
category: alternatives
---

If you have run Ghost Inspector for any length of time, you know the shape of the deal: a clean recorder, scheduled runs from the cloud, screenshots and video on every step, and a monthly bill that grows with your test count and run frequency. It is a solid product. But plenty of teams reach a point where they want a **ghost inspector alternative open source** — something they can read in a pull request, run for free on their own laptop, and wire into CI without a per-test SaaS meter ticking in the background. This guide is a practical migration path: how to move off recorded suites and toward version-controlled, plain-English Markdown tests that run locally with BrowserBash, what you gain, and the honest places where staying on Ghost Inspector is still the right call.

I am not here to dunk on Ghost Inspector. It pioneered no-code browser recording for QA teams, the cloud scheduling is convenient, and its self-heal and visual diff features have saved real weekends. The question this article answers is narrower: if the recorder model, cloud-only execution, or consumption-style pricing has stopped fitting how your team works, what does a clean migration to an open, local, AI-driven approach actually look like? Let's get specific.

## Why teams look for a Ghost Inspector alternative open source

Recorded test platforms all share a few structural tradeoffs. None of them are dealbreakers on their own, but stack them up and you understand why an open-source path starts to look attractive.

**Tests live in a vendor database, not your repo.** A Ghost Inspector test is a sequence of recorded steps stored in their cloud, edited through their UI. That is great for non-engineers and bad for everyone who lives in Git. You cannot diff a recorded suite in a pull request, you cannot grep it, and you cannot branch it alongside the feature it covers. When a test changes, there is no commit explaining why.

**Execution is cloud-bound.** Runs happen on Ghost Inspector's infrastructure. For most marketing sites that is a feature — you get scheduling and geographic regions for free. For an app behind a VPN, a staging environment with no public URL, or a product with data-residency rules, shipping your DOM and screenshots to a third party is a real obstacle, sometimes a compliance one.

**Pricing scales with usage, not value.** Plans are tiered by test count and run volume. As your suite and run frequency grow, so does the bill — exactly when you most want to run more, not less. There is nothing wrong with SaaS pricing, but it caps how freely you experiment. You think twice before adding a test or bumping a schedule because each one nudges the meter.

**The recorder is brittle in a specific way.** Recorded steps capture selectors and coordinates at record time. Self-heal mitigates this, but a real redesign (a new checkout layout, a renamed field, a modal that now appears) often means re-recording. You are maintaining a script that describes *how* to click, not *what* you wanted to verify.

A **ghost inspector alternative open source** approach inverts each of these. Tests are text files in your repo. Execution defaults to your machine. The model can be a free local one, so the run bill is zero. And instead of recorded selectors, you write the intent in plain English and let an AI agent figure out the clicks on a live page.

## What BrowserBash is, in plain terms

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) command-line tool from The Testing Academy that drives a real Chrome or Chromium browser from a plain-English objective. You install it with one command:

```bash
npm install -g browserbash-cli
```

Then you describe what you want in a sentence, and an AI agent performs the steps in an actual browser — no selectors, no page objects, no recorder:

```bash
browserbash run "Go to the store, add a Sauce Labs Backpack to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

The agent navigates, reads the page, decides what to click, and returns a verdict plus structured results. The headline difference from Ghost Inspector is the execution and model story. BrowserBash is **Ollama-first**: by default it uses free local models through Ollama, so no API keys are required and nothing leaves your machine. It auto-resolves a provider in order — local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — so if you have a local model running, you get a $0 model bill by default. You can also point it at OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) or bring your own Anthropic Claude key for the hardest flows.

One honest caveat worth stating up front, because it shapes how you should migrate: very small local models (roughly 8B parameters and under) can get flaky on long, multi-step objectives. They lose the plot halfway through a ten-step checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when a flow is genuinely hard. Migrate your simple smoke tests to a small local model and they will fly; for a gnarly multi-page purchase flow, lean on a bigger model. More on this below.

## The core difference: recorded steps vs. version-controlled Markdown tests

This is the heart of the migration. Ghost Inspector stores a recorded sequence; BrowserBash stores a committable Markdown file where each list item is a step you wrote. These are called Markdown tests, and they look like this:

```markdown
# Checkout smoke test

- Go to {{baseUrl}}
- Log in with username {{user}} and password {{password}}
- Add the first product to the cart
- Open the cart and proceed to checkout
- Fill shipping details and place the order
- Verify the page shows "Thank you for your order!"
```

Save that as `checkout_test.md` and run it:

```bash
browserbash testmd run ./checkout_test.md
```

A few things make this format a real upgrade over a recorded suite, not just a different storage location:

- **It is plain text in your repo.** It diffs cleanly in a pull request. A reviewer can see that you changed "place the order" to "place the order with express shipping" and understand the intent without replaying a recording.
- **`{{variables}}` templating** keeps environments and credentials out of the test body. You pass `baseUrl`, `user`, and `password` at run time, so the same file runs against local, staging, and production.
- **Secret masking is built in.** Variables marked as secrets are rendered as `*****` in every log line, so a password never lands in your CI output or a committed `Result.md`.
- **`@import` composition** lets you write a login flow once and import it into every test that needs it — the same DRY instinct you would apply to a page object, but in prose.
- **Each run writes a human-readable `Result.md`** next to the test, so you have a readable record of what passed and what the agent observed, without opening a dashboard.

The migration mindset shift is this: you stop maintaining *how to click* and start maintaining *what to verify*. When the checkout page gets redesigned, a recorded suite breaks on the changed selectors. A BrowserBash Markdown test usually does not change at all, because "complete checkout and verify the thank-you message" is still true. That is the durability you are buying.

## A step-by-step migration path off Ghost Inspector

You do not rip out Ghost Inspector on a Friday and pray on Monday. Run both in parallel and migrate in waves.

### 1. Inventory and triage your existing suites

Export or list your Ghost Inspector tests and sort them into three buckets: smoke tests (a handful of high-value flows you run constantly), regression tests (broad coverage, run less often), and one-offs (tests nobody trusts anymore — be honest, every suite has these). Migrate smoke first. They are short, high-value, and the fastest way to prove the new approach to skeptical teammates.

### 2. Rewrite each recorded test as an objective, not a transcript

Open a recorded test and read what it actually verifies. Ignore the individual clicks. Write the intent as a plain-English objective or a list of Markdown steps. A recording with forty captured actions usually collapses into five or six sentences a human would say out loud. Resist the urge to over-specify — "click the button with id `submit-btn-2`" is exactly the brittleness you are migrating away from. Say "submit the form" and let the agent find the button.

### 3. Parameterize environments and secrets

Replace hardcoded URLs and logins with `{{variables}}`. Mark credentials as secrets so they mask in logs. This is the moment to centralize anything you had scattered across recorded tests.

### 4. Run locally, free, and iterate

Run the new test on a local Ollama model first. For simple flows, a mid-size local model handles them at zero model cost. If a complex flow trips up your local model, switch to a capable hosted model for that one test rather than dumbing down the objective. You can capture evidence on any run:

```bash
browserbash run "Log in and verify the dashboard loads the user's name in the header" --record --headless
```

`--record` captures a screenshot and a full `.webm` session video via ffmpeg on any engine. The builtin engine additionally captures a Playwright trace you can open in the trace viewer — useful when a flaky test needs forensics. This is your replacement for Ghost Inspector's per-step screenshots and video, except the artifacts land on your disk for free.

### 5. Wire it into CI with agent mode

This is where BrowserBash earns its keep for a migration. Agent mode emits NDJSON — one JSON event per line on stdout — with stable exit codes: `0` passed, `1` failed, `2` error, `3` timeout. Your pipeline branches on the exit code; no dashboard scraping, no webhook parsing, no prose to interpret.

```bash
browserbash testmd run ./checkout_test.md --agent --headless
```

A run that previously depended on a Ghost Inspector cloud trigger and a callback now lives entirely inside your existing CI, gated by an exit code your build already understands. If you want a richer record, opt into the free cloud dashboard explicitly (more below) without changing how the test runs. The [learn section](https://browserbash.com/learn) walks through agent-mode events in detail.

### 6. Keep dashboards and history if you want them

Losing run history is the most common fear when moving off a hosted recorder. You do not have to. BrowserBash ships a free, fully local dashboard you launch with `browserbash dashboard` — no account, runs on your machine. If you want shareable history with video replay, the optional cloud dashboard is strictly opt-in via `browserbash connect` plus an `--upload` flag on the runs you choose to send. Free uploaded runs are retained for 15 days. Nothing uploads unless you ask it to, which is the inverse of a cloud-default platform.

## Ghost Inspector vs. BrowserBash: an honest comparison

| Dimension | Ghost Inspector | BrowserBash |
| --- | --- | --- |
| Authoring model | No-code recorder + visual editor | Plain-English objective or Markdown steps |
| Where tests live | Vendor cloud database | `*_test.md` files in your Git repo |
| Where it runs | Ghost Inspector cloud | Local Chrome by default; CDP, Browserbase, LambdaTest, BrowserStack via `--provider` |
| Model / AI | Self-heal & assertions (internal, as of 2026) | Local Ollama by default; OpenRouter or Anthropic optional |
| Run cost | Tiered by test count & run volume | $0 model bill on local models; tool is free |
| Data residency | DOM & screenshots sent to vendor cloud | Stays on your machine unless you opt in to upload |
| CI contract | Cloud triggers + API/webhooks | NDJSON + exit codes via `--agent` |
| Evidence | Per-step screenshots, video | `--record` screenshot + `.webm`; Playwright trace on builtin engine |
| Run history | Hosted dashboard (included) | Local `browserbash dashboard` (free) or opt-in cloud (15-day retention) |
| License | Commercial SaaS | Open source, Apache-2.0 |

A few rows deserve a fair reading rather than a scoreboard. Ghost Inspector's recorder is genuinely easier for a non-technical teammate to author in on day one — there is no denying that a point-and-click recorder has a lower floor than writing a sentence, even a plain-English one, if that person has never touched a terminal. And Ghost Inspector's cloud scheduling is turnkey: cron-style runs from multiple regions with zero infrastructure on your side. BrowserBash leaves scheduling to your CI or your own cron, which is more flexible but is work you now own. Be clear-eyed about both.

## Where BrowserBash runs: providers and engines

One migration worry is "but I relied on the cloud to run my browsers." BrowserBash decouples *where the browser runs* from *how you write the test* with a single `--provider` flag.

- **local** (default) drives the Chrome already on your machine.
- **cdp** connects to any Chrome DevTools Protocol endpoint — your own containerized Chrome, for instance.
- **browserbase**, **lambdatest**, and **browserstack** run the browser on those vendor grids when you need scale, real devices, or geographic coverage.

So if part of your Ghost Inspector value was "runs in the cloud across browsers," you can reproduce that by pointing BrowserBash at a grid:

```bash
browserbash testmd run ./checkout_test.md --provider lambdatest --record
```

Your test file does not change — only where the browser lives. That separation is exactly what a recorded suite cannot give you, because its steps are coupled to the environment they were recorded in.

On engines: BrowserBash ships two. **stagehand** (MIT, by Browserbase) is the default and handles most flows. **builtin** is an in-repo Anthropic tool-use loop that additionally captures a Playwright trace. For a migration, start on the default and reach for builtin when you want the trace viewer on a stubborn test.

## When to choose each tool

An honest comparison has to tell you when to *stay*.

**Stay on Ghost Inspector (or keep it alongside) if:**

- Your test authors are non-engineers who will never touch a terminal or Git, and the recorder is the only realistic on-ramp for them.
- You depend on turnkey cloud scheduling across regions and do not want to own that infrastructure in CI.
- Your tests are all on public marketing pages where data residency is a non-issue and the convenience of a hosted platform outweighs the bill.
- You are happy with the pricing and the recorded-suite maintenance burden is low for your app's rate of change.

**Migrate to an open-source, local approach with BrowserBash if:**

- You want tests in Git — diffable in pull requests, branchable with features, owned by the team rather than a vendor.
- You need local or self-hosted execution for VPN-gated, staging-only, or data-sensitive apps.
- You want a predictable cost: free tool, $0 model bill on local models, no per-test or per-run meter.
- Your team already lives in CI and wants a clean NDJSON + exit-code contract instead of cloud triggers and webhook parsing.
- You are tired of re-recording suites after every redesign and want intent-based tests that survive UI churn.

Many teams land in the middle: keep Ghost Inspector for a non-technical stakeholder's marketing checks, migrate the engineering-owned app flows to version-controlled Markdown tests. There is no rule that says you must pick one. The [case studies](https://browserbash.com/case-study) show a few hybrid setups in practice.

## Handling the hard parts honestly

Migrations fail when someone promises a clean one-to-one mapping that does not exist. A few rough edges to plan for:

**Long, fragile flows need a bigger model.** A twelve-step purchase with conditional modals is where a tiny local model wanders off. Either decompose it into smaller Markdown tests joined with `@import`, or run that specific test on a capable hosted model. Do not judge the whole tool by an 8B model's performance on your hardest flow; that is a known limit, not a surprise.

**Visual regression is a different job.** Ghost Inspector's pixel-diff visual comparisons are a specialized feature. BrowserBash verifies behavior and content — "the cart shows three items," "the banner says X" — and records screenshots and video as evidence. If pixel-perfect visual diffing is core to your QA, treat that as a separate concern rather than expecting the AI agent to replace it wholesale.

**Determinism takes a mindset shift.** An AI agent makes decisions, so two runs of an ambiguous objective can take slightly different paths. The fix is to write tighter objectives, naming the exact button text and the exact assertion string, and to use Markdown steps rather than one giant sentence for anything important. Tight intent gives you repeatable runs.

**Authoring onboarding is real work.** Writing a good plain-English objective is a skill, just a faster one to learn than maintaining selectors. The payoff is that anyone who can describe a flow in a sentence can author a test, a wider pool than people who can debug a recorded selector.

## A realistic first week

Here is a plan you can actually run. Day one: install the CLI, point it at a local Ollama model, and rewrite your most important smoke test as a Markdown file. Run it locally until it is green. Day two: parameterize it with `{{variables}}`, mark the password as a secret, and confirm the masking in the `Result.md`. Day three: add `--agent --headless` and wire it into one CI job, branching on the exit code. Day four: migrate two more smoke tests and stand up `browserbash dashboard` locally. Day five: pick one genuinely hard flow, try it on your local model, and if it struggles, switch that test to a hosted model.

By the end of that week you have proof: a real flow, version-controlled, running free and local, gated in CI, with evidence on disk. That is a stronger basis for a migration decision than a slide deck. The full command reference and more recipes live on the [BrowserBash blog](https://browserbash.com/blog), and you can compare plans on the [pricing page](https://browserbash.com/pricing), though for local runs there is nothing to pay.

## FAQ

### Is there a free open-source alternative to Ghost Inspector?

Yes. BrowserBash is a free, open-source (Apache-2.0) command-line tool that drives a real Chrome browser from plain-English objectives or version-controlled Markdown tests. It defaults to free local models through Ollama, so you can run tests with a $0 model bill and no account. It is a genuine ghost inspector alternative open source teams can adopt without a SaaS contract.

### How do I migrate recorded Ghost Inspector tests to BrowserBash?

Triage your suites, then rewrite each recorded test as a plain-English objective or a Markdown test file where each list item is a step. Replace hardcoded URLs and logins with `{{variables}}` and mark credentials as secrets so they mask in logs. Run the new tests locally to validate them, then wire them into CI with `--agent` for NDJSON output and stable exit codes. Migrate smoke tests first and run both tools in parallel until you trust the new suite.

### Does BrowserBash send my page data to the cloud like a hosted recorder?

No, not by default. BrowserBash runs the browser locally and uses local models first, so your DOM and screenshots stay on your machine. Uploading run history to the optional cloud dashboard is strictly opt-in via `browserbash connect` and an `--upload` flag on the runs you choose. There is also a fully local dashboard you launch with `browserbash dashboard` that needs no account.

### Can BrowserBash record video and screenshots like Ghost Inspector?

Yes. The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine, and the builtin engine additionally captures a Playwright trace you can open in the trace viewer. Those artifacts are written to your disk for free. If you opt in to the cloud dashboard, you also get per-run replay and hosted video for runs you upload.

Ready to move off recorded suites? Install the CLI with `npm install -g browserbash-cli`, rewrite your top smoke test as a Markdown file, and run it free and local today. An account is entirely optional — you only need one if you later want the hosted dashboard, which you can grab at [browserbash.com/sign-up](https://browserbash.com/sign-up).
