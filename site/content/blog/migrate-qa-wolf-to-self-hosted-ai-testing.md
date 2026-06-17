---
title: Migrate From QA Wolf to Self-Hosted AI Browser Testing
description: "A qa wolf alternative self hosted guide: bring browser testing in-house with BrowserBash Markdown suites, local LLMs, and a free run-history dashboard."
date: 2026-05-09
category: alternatives
---

If your QA Wolf contract is winding down and someone has asked you to bring testing back in-house, you are probably weighing a qa wolf alternative self hosted approach against just renewing for another year. That decision is rarely about whether managed QA worked. It usually worked fine. It is about cost, control, and the uncomfortable realization that your end-to-end coverage lives on someone else's infrastructure, written in a format you cannot easily export, billed in a way that scales with your test count rather than your team. This guide is for the engineer who has to make the migration real: what you actually own when the contract ends, what you have to rebuild, and how to do it without spending six weeks hand-porting flows into Playwright.

I will be honest about where QA Wolf is the better choice, because for some teams it is, and pretending otherwise would waste your time. But if you have decided to self-host, the path with BrowserBash is shorter than you think, because plain-English test suites do not require the same upfront authoring effort as selector-based code.

## What you are actually paying for with a managed QA service

QA Wolf is a managed end-to-end testing service. The pitch, broadly, is that you describe what needs to be tested and a combination of their team and tooling builds, maintains, and triages the suite for you, often with a coverage commitment and human investigation of failures. The exact terms, pricing tiers, and internal tooling are a matter of contract and are not fully public, so I will not invent numbers here. As of 2026, treat any specific dollar figure you see quoted secondhand with suspicion and check your own agreement.

What is worth naming honestly is the value model. You are paying for three things bundled together:

- **Authoring labor.** Someone other than your team writes the tests. That is real work you do not have to do.
- **Maintenance and triage.** When a test breaks, a human looks at it and tells you whether it is a real bug or a flaky locator. That triage is the part most teams underestimate when they bring testing back in-house.
- **Infrastructure.** Parallel browser runs, retries, and a dashboard, all hosted, so you never touch a CI runner config for the test execution itself.

When you cancel, all three of those disappear at once. The migration question is not "can I write tests myself" — of course you can. It is "can I replace the maintenance and triage layer cheaply enough that bringing it in-house actually saves money." That is where the tooling you choose matters more than the language it is written in.

### The lock-in nobody mentions until offboarding

The practical friction in any managed-service exit is the export. Tests authored inside a vendor's platform are often expressed in that vendor's abstractions. Even when the underlying engine is something standard like Playwright, the suite is wired to the vendor's runners, their auth handling, their data fixtures, and their reporting. You may get a code export, but a code export is not a working CI pipeline. You still have to stand up execution, secrets, parallelism, and a place to look at failures.

So when you evaluate a qa wolf alternative self hosted setup, evaluate the whole stack: authoring format, execution, secret handling, and the dashboard. A tool that only solves the authoring part leaves you to rebuild the other three.

## Why plain-English suites lower the migration cost

The expensive part of in-housing end-to-end tests is not running them. It is writing and maintaining them. A traditional Playwright or Cypress migration means re-expressing every flow as selectors, waits, and page objects, then owning the breakage every time a class name changes.

[BrowserBash](https://browserbash.com/features) takes a different shape. It is a free, open-source (Apache-2.0) command-line tool that drives a real Chrome or Chromium browser from a plain-English objective. You write what you want to verify; an AI agent figures out the steps, clicks the buttons, types into the fields, and returns a verdict plus structured results. No selectors. No page-object hierarchy to maintain. When a button moves or a class name changes, the agent adapts because it is reading the page the way a person would, not matching a brittle CSS path.

That property is exactly what makes a managed-to-self-hosted migration cheaper than a like-for-like Playwright rebuild. You are not translating a vendor's scripts line by line. You are restating the intent of each flow in a sentence or two.

Here is the canonical example, the kind of flow QA Wolf would have covered for you:

```bash
browserbash run "Go to the store, log in as standard_user, add the first backpack to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

One command, one real browser, one verdict. There is no server to start, no driver to match, no capabilities object. If you have ever spent an afternoon on a chromedriver version mismatch, the absence of that ceremony is the point.

### The honest caveat about model size

Plain-English testing is only as reliable as the model interpreting it, and I am not going to oversell this. Very small local models, roughly 8B parameters and under, can get flaky on long multi-step objectives. They lose the thread on a ten-step checkout or misread an ambiguous confirmation screen. For a migration where these tests are your safety net, that flakiness is not acceptable.

The fix is straightforward: use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or point at a capable hosted model for the genuinely hard flows. The sweet spot for serious suites is a 70B-class local model on a machine with enough memory, or a hosted model when you want maximum reliability and do not mind a small API bill. Tiny models are fine for smoke checks and demos; they are not what you build your regression coverage on.

## Bringing tests in-house with committable Markdown suites

For a real regression suite you want tests that live in your repository, get reviewed in pull requests, and run in CI — not ad-hoc commands typed into a terminal. BrowserBash supports this through Markdown tests: committable `*_test.md` files where each list item is a step.

A checkout suite that replaces a QA Wolf flow might look like this:

```markdown
# Checkout smoke test

@import ./fragments/login_test.md

- Add the first backpack to the cart
- Open the cart and click Checkout
- Fill in first name {{firstName}}, last name {{lastName}}, and zip {{zip}}
- Continue and finish the order
- Verify the page shows "Thank you for your order!"
```

Run it with:

```bash
browserbash testmd run ./checkout_test.md
```

A few details matter for teams coming off a managed service:

- **`@import` composition.** You write the login flow once and import it into every suite that needs an authenticated session. This is the equivalent of shared fixtures, but in readable prose. It keeps your suite DRY without a framework.
- **`{{variables}}` templating.** Test data lives outside the steps. You parameterize accounts, search terms, and quantities, which means one suite covers many cases.
- **Secret masking.** Variables marked as secrets render as `*****` in every log line. Your staging password never lands in a CI log in plaintext. For a security-conscious team that just took testing back in-house, that default matters.
- **Readable output.** Every run writes a human-readable `Result.md` next to the suite, so a teammate can read what happened without re-running anything.

Here is the password-as-secret pattern, which you will use on day one:

```bash
browserbash testmd run ./login_test.md \
  --var username=standard_user \
  --secret password=$STAGING_PASSWORD
```

The value of `password` is masked everywhere it would otherwise appear. That is the kind of small, correct default that separates a tool you can trust with production credentials from one you cannot.

### Why Markdown beats a raw code export

When you offboard from any managed vendor, you might get a pile of generated Playwright. That code is real, but it is also the most expensive artifact to maintain, because it is full of selectors that break and waits you did not write. A Markdown suite is intentionally higher-level. It survives a redesign that would shatter a selector-based test, because "click Checkout" does not care what the checkout button's class is this week. You trade some determinism for a large reduction in maintenance, which is precisely the maintenance layer you are trying to replace cheaply.

## A real $0 model bill with local LLMs

The single biggest fear in moving off a managed service is that you are just trading a predictable invoice for an unpredictable one. With BrowserBash, the model bill can genuinely be zero, because it is Ollama-first by default.

When you run a command, BrowserBash auto-resolves a model in this order: a local Ollama instance first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. If you have Ollama running with a capable model pulled, nothing leaves your machine. No API keys, no per-run charges, no data sent to a third party. For a team that just left a service specifically to control cost and data residency, that default is the whole argument.

You have three honest cost paths:

| Model path | Cost | Data leaves your machine | Best for |
|---|---|---|---|
| Local Ollama (Qwen3 / Llama 3.3 70B) | $0 | No | Privacy-sensitive suites, predictable spend, regulated environments |
| OpenRouter free hosted (e.g. `openai/gpt-oss-120b:free`) | $0 | Yes | No local GPU, want a bigger model, non-sensitive flows |
| Anthropic Claude (your own key) | Pay per token | Yes | Hardest multi-step flows where reliability is worth the spend |

The free OpenRouter tier is worth calling out because it is not a trial gimmick. Genuinely free hosted models like `openai/gpt-oss-120b:free` exist, so a team without a local GPU can still run a larger, more reliable model at no charge for non-sensitive tests. You give up the privacy guarantee — the page content goes to the hosted provider — but you keep the zero bill.

The trade-off is the one named earlier. Local models give you privacy and a flat $0 cost, but you need enough hardware to run a 70B-class model well, and tiny models will struggle on long flows. Hosted models give you reliability without the hardware, at the price of either a small bill (Claude) or sending data off-box (free OpenRouter). Pick per suite. There is no single right answer, and the [pricing page](https://browserbash.com/pricing) lays out the options without forcing you into one.

## Replacing the dashboard: run history and video for free

A managed service gives you a dashboard with run history, failure triage, and replay. Losing that is the part teams feel most acutely after offboarding, because suddenly a failure is just a red line in a CI log with no video and no history.

BrowserBash covers this two ways, and both are free.

**Local dashboard.** Run `browserbash dashboard` and you get a fully local view of your runs on your own machine. No account, no upload, nothing leaves the box. For a team that wants the triage experience without any cloud dependency, this is the answer.

**Optional cloud dashboard.** If you want shareable run history, video recordings, and per-run replay that a teammate can open from a link, that exists too, and it is strictly opt-in. You connect once and pass an upload flag:

```bash
browserbash connect
browserbash run "Complete checkout and verify the confirmation page" --record --upload
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine. With the builtin engine you also get a Playwright trace you can open in the trace viewer, which is the closest thing to stepping through a failure frame by frame. Free uploaded runs are kept for 15 days, which is plenty for "show me what broke on last night's run." An account is optional and you only create one if you want the hosted dashboard; everything else runs without one. You can read more about the workflow on the [learn pages](https://browserbash.com/learn).

This is the honest gap-closer for the triage layer. You will not get a human looking at every failure for you — that was QA Wolf's labor, and it is the thing you are choosing to bring in-house. What you get instead is a video of exactly what the agent saw, so your own engineer can triage in two minutes instead of twenty.

## Wiring it into CI: the part managed services hid from you

When QA Wolf ran your suite, you never thought about CI for the tests themselves. Now you do. The good news is that BrowserBash was built for it.

Agent mode emits NDJSON — one JSON event per line on stdout — so a CI step or an AI coding agent can consume results without parsing prose:

```bash
browserbash run "Log in and verify the dashboard loads" \
  --agent --headless --record
```

Exit codes are the contract:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

That means your pipeline gates on the exit code directly, the way it would for any other test runner. No screen-scraping a log to decide if the build is green. The `--headless` flag runs without a visible window for CI runners, and `--record` still captures video so a failed run leaves an artifact you can watch.

A typical GitHub Actions or Jenkins step becomes: install the CLI, run the Markdown suite in agent mode, let the exit code fail the build, and upload the recorded `.webm` as a build artifact. The whole testing layer now lives in your repo and your pipeline, owned by your team, with no external service in the critical path of a deploy.

### Choosing where the browser runs

By default the browser is your local Chrome, which is free and fine for most CI. But if you need cross-browser coverage or scale that a single runner cannot provide, the provider is one flag:

```bash
browserbash run "Complete checkout on Safari" --provider lambdatest
```

Supported providers are `local` (default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. This is the escape hatch for the one capability a single local runner lacks: real cross-browser, real-device-grade execution. You keep your authoring format and your dashboard; only the execution surface changes. That separation is the point — you are not locked into where the browser runs.

## QA Wolf vs. self-hosted BrowserBash: an honest comparison

No tool wins every row. Here is the comparison as I would give it to a colleague, including the rows where the managed service is plainly better.

| Dimension | QA Wolf (managed) | BrowserBash (self-hosted) |
|---|---|---|
| Who writes the tests | Their team + tooling | Your team, in plain English |
| Who triages failures | Human investigation included | Your engineer, with recorded video to help |
| Authoring format | Vendor abstractions (export varies) | Committable `*_test.md` in your repo |
| Model / inference cost | Bundled into contract | $0 on local models; free or paid hosted options |
| Data residency | Runs on vendor infrastructure | Local-first; nothing leaves the box by default |
| Dashboard | Hosted, included | Free local + free opt-in cloud (15-day retention) |
| CI integration | Managed for you | NDJSON + exit codes, you own the pipeline |
| Cross-browser / device cloud | Handled by service | One flag to LambdaTest / BrowserStack / Browserbase |
| Hand-holding | High — that is the product | Low — you own it |

The rows where QA Wolf wins are real. If your team has no bandwidth to triage failures, the human-in-the-loop investigation is genuinely valuable and hard to replicate with tooling alone. If you have no in-house QA at all and no plan to build it, a managed service is a reasonable answer and bringing testing in-house will likely cost you more in engineer-hours than it saves in invoices.

### When to choose self-hosted

Bring testing in-house with a tool like BrowserBash when:

- You have at least one engineer who can own the suite. Self-hosting trades an invoice for ownership, and ownership needs an owner.
- Cost predictability or data residency matters. Local models give you a flat $0 bill and keep page content on your machine, which a managed cloud service cannot promise.
- You want tests in your repo, reviewed in PRs, versioned with your code. A Markdown suite is just files in git.
- Your flows are mostly standard web interactions — logins, forms, checkouts, dashboards. This is exactly the agent's sweet spot.

### When to stay managed

Stay with a managed service when:

- You have no QA capacity and no plan to build it, and the failure-triage labor is the actual product you are buying.
- Your contract terms are favorable and the all-in cost is genuinely lower than the engineer-time of self-hosting. Run that math honestly.
- Your flows are unusually exotic and you value a vendor's commitment to keep them green more than you value owning the suite.

Credibility beats hype here. If the managed math wins for you, it wins. But for a large number of teams, the in-house cost is lower than it looks once plain-English suites remove the authoring tax, and that is the case worth taking seriously. There are concrete [case studies](https://browserbash.com/case-study) if you want to see how the pieces fit in practice.

## A pragmatic migration plan

If you have decided to move, here is the sequence I would run, in order, to keep the risk low.

1. **Inventory the suite you are losing.** List every flow QA Wolf currently covers, ranked by business criticality. Checkout and login first; the long tail later.
2. **Restate the top flows as one-line objectives.** Before writing any Markdown, run each critical flow as a single `browserbash run "..."` command against staging. This validates that the agent can drive the flow at all, in minutes, before you invest in a committable suite.
3. **Pick your model per tier.** Local 70B-class for the bulk, hosted for the two or three flows that are long and finicky. Do not put your hardest regression on an 8B model and then blame the tool when it wobbles.
4. **Promote validated flows into `*_test.md` files.** Add `@import` for shared login, `{{variables}}` for data, and `--secret` for credentials.
5. **Stand up CI.** Run in `--agent --headless` mode, gate on exit codes, upload recorded video as artifacts.
6. **Replace the dashboard.** Start with `browserbash dashboard` locally; add `connect` + `--upload` if you want shareable history and replay.
7. **Run both in parallel for one cycle.** Keep QA Wolf live for one billing cycle while your in-house suite runs alongside it. Compare verdicts. Cancel only once your suite has caught what theirs caught.

That parallel-run step is the one teams skip and regret. Overlapping for a single cycle is cheap insurance against discovering a coverage gap the week after you cancel. You can browse more migration write-ups and patterns on the [BrowserBash blog](https://browserbash.com/blog).

## FAQ

### Is BrowserBash a true self-hosted alternative to QA Wolf?

Yes, with an honest boundary. BrowserBash is a free, open-source CLI you run on your own machines, with local-first models so nothing has to leave your infrastructure. It replaces the authoring, execution, and dashboard layers of a managed service. What it does not replace automatically is the human failure-triage labor that a managed service performs for you — that work moves to your team, aided by recorded video of every run.

### Can I really run browser tests with no API keys and a zero model bill?

Yes. BrowserBash defaults to a local Ollama model, so with Ollama running and a capable model pulled, you pay nothing and no data leaves your machine. If you lack a local GPU, you can use a genuinely free hosted model through OpenRouter, such as `openai/gpt-oss-120b:free`, though page content then goes to the hosted provider. Paid hosted models like Claude are an option only when you want maximum reliability on the hardest flows.

### How do I keep my QA Wolf tests in version control after migrating?

You rewrite each flow as a committable Markdown test, a `*_test.md` file where every list item is a step. These files live in your repository, get reviewed in pull requests, and run in CI like any other code. Use `@import` to share a login flow across suites and `{{variables}}` with secret masking to keep test data and credentials out of the steps and out of your logs.

### Will small local models be reliable enough for my regression suite?

Not for everything. Very small local models, around 8B parameters and under, can get flaky on long multi-step objectives, which is the wrong place to cut corners on a regression suite. Use a mid-size local model in the Qwen3 or Llama 3.3 70B class for serious coverage, or point at a capable hosted model for the hardest flows. Reserve tiny models for quick smoke checks where an occasional miss is harmless.

Ready to bring testing in-house? Install the CLI with `npm install -g browserbash-cli`, point it at a staging flow, and watch it run in a real browser. An account is optional — everything runs locally by default — but if you want shareable run history and video replay, you can [sign up](https://browserbash.com/sign-up) for the free dashboard whenever you are ready.
