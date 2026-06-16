---
title: AI Smoke Testing: Catch Breakage Before Your Users Do
description: "AI smoke testing with BrowserBash: build fast plain-English smoke suites versus Ghost Inspector monitors, gate CI on clean 0/1 exit codes."
date: 2026-02-12
category: use-case
---

A smoke test exists to answer one question fast: did the last deploy break something a real user would hit in the first thirty seconds? AI smoke testing answers that question without you hand-writing and re-writing selectors every sprint. Instead of recording clicks or maintaining a page-object layer, you describe the critical flow in plain English, and an AI agent drives a real browser through it and reports pass or fail. This post walks through how to build a fast AI-driven smoke suite, how that compares to a recorder-and-monitor product like Ghost Inspector, and how to wire BrowserBash into CI so a clean `0` or `1` exit code becomes your deploy gate.

The pitch is simple. Smoke suites are the one place where test maintenance hurts most, because the flows are short, business-critical, and run constantly — which means they break constantly when the UI shifts under them. AI smoke testing trades brittle selectors for an agent that figures out the clicks on its own. Whether that trade is worth it depends on your team, your stack, and your tolerance for non-determinism, and this article tries to be honest about all three.

## What a smoke test is actually for

Before comparing tools, it helps to nail down the job, because "smoke test" gets stretched to mean almost anything. A smoke test is not a regression suite. It is not where you assert every validation message, check pixel alignment, or cover the long tail of edge cases. A smoke test answers exactly one thing: is this build healthy enough to let real users touch it?

That definition has teeth. A good smoke suite is short — five to fifteen flows, not five hundred. It covers breadth over depth: can a user log in, does the dashboard load, can someone complete the one transaction that pays your salary, does search return results. It runs fast enough to live inside a deploy pipeline without anyone resenting the wait. And it must fail for the right reasons. A smoke test that goes red because a designer renamed a CSS class is worse than no smoke test at all, because it teaches the team to click "deploy anyway." Once that reflex exists, your gate gates nothing.

That last property — failing for the right reasons — is exactly where AI smoke testing earns its keep. When the instruction is "click the Checkout button" instead of `page.locator('[data-testid="checkout-btn-v2"]')`, a front-end refactor that moves the button or rewrites its markup does not break the check. A human would still find the button; so does the agent. The test only goes red when a real person would also get stuck, which is precisely when you want the deploy to stop.

## Why selector-based smoke tests fail the wrong way

Every team that has run selector-based smoke tests in CI knows the failure pattern. The product is fine. Users are checking out happily. But the nightly smoke job is red and the release is blocked, because someone shipped a styling refresh that regenerated the utility classes a test was anchored to. An engineer gets pinged, opens the run, sees the "failure" is a stale `data-testid`, patches the selector, and re-runs. Multiply that by a dozen flows across a UI that changes every other sprint, and your smoke suite quietly becomes a part-time maintenance job that produces zero new coverage.

The deeper issue is that selectors encode *how the page is built*, while a smoke test cares about *what the user can do*. Those two things drift apart constantly. A button can move from a `<div>` to a `<button>`, get wrapped in a new component, or have its class names mangled by a fresh Tailwind build — and none of that changes whether a customer can complete checkout. Selector tests conflate structural change with functional breakage, so they cry wolf on the former and miss the point of the latter.

Recorder-based tools soften this with smarter element matching, but they do not escape it. Under the hood a recorded step still resolves to a selector or a coordinate, and when the match fails, the step fails. AI smoke testing changes the contract: you give an objective, the agent reads the live page the way a person would, and it decides which element satisfies the intent at runtime. The check is anchored to user intent, not DOM structure, which is the whole reason it tends to fail less often and for better reasons.

## What AI smoke testing looks like with BrowserBash

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with one command, write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects, no recorder. It returns a verdict plus structured results you can act on.

A smoke check is just an objective. Here is the canonical e-commerce flow:

```bash
npm install -g browserbash-cli

browserbash run "Go to shop.example.com, log in as test@example.com, \
add the first product to the cart, complete checkout, and verify the page \
shows 'Thank you for your order!'"
```

The agent navigates, finds the login fields, types the credentials, locates the add-to-cart control, walks the checkout, and confirms the success message — then tells you whether the objective was met. You did not write a single selector, and if the checkout button moves next week, the check still passes.

The model story matters for smoke testing specifically, because smoke suites run *often*. BrowserBash is Ollama-first: by default it uses free local models, so no API keys are required and nothing leaves your machine. It auto-resolves a running local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so you can start at a guaranteed $0 model bill and only reach for a hosted model when you actually need one. OpenRouter is supported (including genuinely free hosted models such as `openai/gpt-oss-120b:free`), as is Anthropic Claude with your own key.

One honest caveat worth stating up front: very small local models (roughly 8B and under) can get flaky on long, multi-step objectives — they lose the thread halfway through a checkout. For smoke suites, which are short by design, the sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model for the genuinely hard flows. If your smoke check is "log in and load the dashboard," a small model is usually fine. If it is a six-step checkout with a payment iframe, give it more horsepower.

## What Ghost Inspector actually is

Ghost Inspector is a SaaS browser-testing and monitoring platform that has been around since the mid-2010s. The core workflow is a Chrome and Firefox extension recorder: you click through your app, the extension captures each interaction as a discrete step, and those steps become a test that runs in Ghost Inspector's cloud. You can schedule runs, trigger them from CI or an API, get screenshots and video on failure, run screenshot-based visual comparisons, and receive alerts when something breaks. A large share of teams use Ghost Inspector less as a test framework and more as a functional uptime monitor — a scheduled heartbeat on login, checkout, and other money flows.

It is a mature, well-supported product, and the monitoring angle is genuinely its strength. The recorder is approachable enough that a non-engineer can build a working check, the scheduled-run model means you get alerted when a critical flow goes down in production, and you never have to stand up browser infrastructure yourself. Pricing is subscription-based and tiered on run volume; exact plan numbers change over time, so treat any figure you see as "check the current pricing page" rather than gospel. As of 2026 the model remains a hosted SaaS — your tests, run history, screenshots, and video all live in Ghost Inspector's cloud by design. That is a feature if you want a managed monitor, and a constraint if you need everything to run inside your own network.

Where recorder tools traditionally struggle is maintenance, and it is fair to say Ghost Inspector has invested in smarter element matching to reduce the brittleness. It is better than a naive XPath recorder. But the fundamental shape is still record concrete steps, store them, replay them — and that is the shape AI smoke testing departs from.

## AI smoke suites vs Ghost Inspector monitors

These two tools attack the same pain from opposite ends. Ghost Inspector is "click to record, then let the cloud run it on a schedule and alert you." BrowserBash is "write what you want in English, let an AI agent figure out the clicks, and run it wherever you like — including entirely on your own laptop for free." Here is the honest side-by-side.

| Dimension | BrowserBash (AI smoke testing) | Ghost Inspector |
| --- | --- | --- |
| Authoring | Plain-English objective; agent infers steps | Record clicks via browser extension |
| Selectors / page objects | None | Steps resolve to selectors under the hood |
| Where it runs | Your Chrome by default; CDP, Browserbase, LambdaTest, BrowserStack via one flag | Vendor cloud (SaaS) |
| Model / AI | Ollama-first, local-by-default; OpenRouter or Anthropic optional | Recorder-based; AI matching details not publicly specified |
| Cost | Free, open-source; $0 on local models | Subscription, tiered on run volume |
| Data residency | Can run fully local; nothing leaves your machine | Tests and runs live in vendor cloud by design |
| Scheduled monitoring | Run on your own cron/CI; not a hosted monitor | Built-in scheduling and alerting |
| CI gating | `--agent` mode, exit codes 0/1/2/3 | API/CI triggers, status via API |
| Test artifacts | `--record` screenshot + `.webm` video; trace on builtin engine | Screenshots and video on failure |
| Versioning | Committable `*_test.md` files in your repo | Tests stored in vendor UI |

A few of these deserve plain language. Ghost Inspector's scheduled monitoring is a real advantage if what you want is a managed, always-on production heartbeat with alerting baked in — BrowserBash does not host a cron for you; you run it on your own CI or scheduler. On the other side, BrowserBash keeps your smoke tests as plain-text files in your own repository and can run with no vendor and no data leaving your network, which matters a lot to teams with compliance constraints or a strong "no SaaS in the test path" stance.

The maintenance story is where AI smoke testing genuinely pulls ahead. A recorded Ghost Inspector step is anchored to the page's structure; an objective is anchored to intent. When your front end gets refactored, the recorder is more likely to need a re-record, while the agent re-derives the path each run. That is not magic — see the determinism trade-off below — but for the short, breadth-first flows a smoke suite contains, it is usually a net win.

## Gating CI on clean 0/1 exit codes

The reason AI smoke testing is usable in a real pipeline is that BrowserBash speaks CI natively. Run any objective with `--agent` and it emits NDJSON — one JSON event per line on stdout — and sets a process exit code you can branch on:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

No prose parsing, no scraping a log for the word "success," no flaky regex on a status page. Your pipeline checks `$?` and moves on. That is the whole game for a deploy gate.

```bash
browserbash run "Open https://staging.example.com, sign in with the test \
account, and confirm the dashboard shows the welcome banner" \
  --agent --headless
```

If the agent met the objective, the command exits `0` and your deploy proceeds. If checkout is broken, it exits `1` and the pipeline stops the release — exactly the behavior you want from a smoke gate. Because the contract is an exit code rather than parsed text, this drops cleanly into GitHub Actions, GitLab CI, Jenkins, or whatever you run, and into AI coding agents that need a machine-readable verdict.

For a richer failure report, add `--record` to capture a screenshot and a full `.webm` session video (via ffmpeg) on any engine. The builtin engine additionally captures a Playwright trace you can open in the trace viewer, so when a smoke check goes red you have a video of exactly where the agent got stuck instead of a one-line stack trace.

```bash
browserbash run "Add an item to the cart and complete checkout on \
shop.example.com" --agent --record --headless
```

If you want run history, per-run replay, and video without standing up your own storage, the optional free cloud dashboard is strictly opt-in via `browserbash connect` and an `--upload` flag, and free uploaded runs are kept for 15 days. Prefer to keep everything in-house? There is a free, fully local dashboard via `browserbash dashboard`. Either way, no account is needed just to run a smoke check.

## Committable smoke suites with Markdown tests

A smoke suite should live in version control next to the code it protects, not in a vendor UI you have to log into. BrowserBash supports committable Markdown tests: `*_test.md` files where each list item is a step. They support `@import` composition so you can share a login flow across checks, and `{{variables}}` templating so the same suite runs against staging and prod. Variables marked as secrets are masked as `*****` in every log line, so a smoke run that types a password never leaks it into CI output.

```bash
browserbash testmd run ./checkout_smoke_test.md \
  --var baseUrl=https://staging.example.com \
  --secret password=$TEST_PASSWORD \
  --agent
```

A `checkout_smoke_test.md` might read like prose — "Go to `{{baseUrl}}`", "Log in as the test user", "Add the first product to the cart", "Complete checkout", "Verify the page shows 'Thank you for your order!'" — and BrowserBash writes a human-readable `Result.md` after each run so non-engineers can read what happened without opening a CI log. This is the part recorder tools structurally cannot match: your smoke suite is plain text, diffable in pull requests, and reviewable like any other code change.

### Running the same suite anywhere

The provider is where the browser actually runs, switched with a single `--provider` flag: `local` (the default, your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, or `browserstack`. So you can develop a smoke check against your local browser at zero cost, then run the exact same objective across a cloud grid for cross-browser coverage at release time — no rewrite.

```bash
browserbash testmd run ./checkout_smoke_test.md \
  --provider lambdatest --agent --record
```

The two engines give you a further choice: `stagehand` (the default, MIT-licensed, by Browserbase) or `builtin` (an in-repo Anthropic tool-use loop that also captures the Playwright trace). For smoke testing you rarely need to think about this — the default is fine — but the option is there when you want the trace viewer artifact.

## The honest trade-off: determinism

It would be dishonest to sell AI smoke testing as strictly better. The real cost is non-determinism. A selector-based check does the same thing every run; an AI agent reasons about the page each time, and reasoning introduces variance. Most of the time that variance is exactly what you want — it is why the agent survives a UI refactor a recorder would choke on. But it means an AI smoke check can occasionally take a different path, and on a marginal flow with a tiny model, it can occasionally be wrong.

Three practical mitigations keep this in check. First, keep smoke objectives short and unambiguous — "log in and confirm the dashboard loads" leaves little room for the agent to wander, while "test the entire account settings area" invites it. Second, match the model to the flow: small local models for trivial checks, a mid-size local or hosted model for multi-step money flows. Third, when a deploy gate truly cannot tolerate a flaky red, you can still pin the most fragile steps in a Markdown test with very explicit instructions. The goal is not to pretend the trade-off does not exist; it is to put the determinism where you need it and the flexibility everywhere else.

If your team's hard requirement is byte-identical reproducibility on every run — say, a compliance smoke check that must do precisely the same thing forever — a scripted or recorder-based approach is the more honest fit, and Ghost Inspector's deterministic replay is a real point in its favor there. For the far more common case, where you want a smoke gate that survives normal UI churn and stops crying wolf, AI smoke testing is the better trade.

## When to choose which

Here is the balanced call, stated plainly.

**Choose Ghost Inspector when** you want a managed, always-on production monitor with built-in scheduling and alerting and you would rather not run your own cron; when non-engineers need to author checks through a recorder UI; when you are comfortable with a SaaS holding your tests, history, and video; and when deterministic, identical replay matters more than surviving UI churn. It is a solid, mature monitoring product and for that job it is genuinely good.

**Choose BrowserBash for AI smoke testing when** you want smoke tests authored in plain English with zero selector maintenance; when you need a clean `0`/`1` exit code to gate a deploy in CI; when data residency matters and you want the option to run fully local with no API keys and a $0 model bill; when you want your smoke suite committed to your repo as diffable Markdown; and when you would rather start free and open-source than commit to a subscription. The further reading at [browserbash.com/learn](https://browserbash.com/learn) and the [feature overview](https://browserbash.com/features) go deeper on each of these.

For a lot of teams the answer is not exclusive. You might keep a Ghost Inspector monitor on the single production flow you care about most, and run a broader AI smoke suite in CI on every pull request so breakage is caught *before* it ships rather than after. The two are complementary more than they are rivals.

## A pragmatic smoke-testing playbook

If you are starting from scratch, here is a lean path that works.

Begin by listing your money flows — the three to seven things that, if broken, would cost you customers or revenue today. For most products that is login, the primary transaction (checkout, signup, booking), and the main dashboard or search. Write each as a one-line objective and run it locally with the default free model to confirm the agent can complete it. Then convert the keepers into `*_test.md` files with `{{variables}}` so the same suite hits staging and production, masking any credentials as secrets.

Wire the suite into CI with `--agent` and let the exit code gate the deploy — `0` ships, `1` blocks. Add `--record` so every failure ships with a video, which collapses the "why did it fail" investigation from minutes to seconds. Run the local model in CI to keep the bill at zero, and reserve a hosted model for the one or two flows that genuinely need it. Finally, review your suite the way you review code: it lives in the repo, so a change to checkout that would break the smoke check shows up in the same pull request. That is the workflow recorder-and-monitor tools cannot give you, and it is the reason AI smoke testing tends to stay healthy instead of rotting into a maintenance chore.

## FAQ

### What is AI smoke testing?

AI smoke testing uses an AI agent to drive a real browser through your most critical flows from a plain-English objective, instead of scripted selectors or recorded clicks. You describe what a user should be able to do — log in, check out, load the dashboard — and the agent figures out the steps and reports pass or fail. Because the check is anchored to user intent rather than DOM structure, it survives UI refactors that would break a traditional selector-based smoke test.

### How is BrowserBash different from Ghost Inspector for smoke tests?

Ghost Inspector is a hosted SaaS recorder and monitor: you record clicks, store them in the vendor cloud, and run them on a schedule with built-in alerting. BrowserBash is a free, open-source CLI where you write a plain-English objective and an AI agent drives the browser, running locally by default with no API keys. Ghost Inspector wins for managed production monitoring; BrowserBash wins for selector-free CI smoke gates, committable Markdown tests, and full local data residency.

### Can AI smoke tests gate a CI/CD pipeline?

Yes. BrowserBash's `--agent` mode emits NDJSON on stdout and sets a process exit code — `0` for passed, `1` for failed, `2` for error, `3` for timeout — so your pipeline branches on the exit code with no log parsing. A `0` lets the deploy proceed and a `1` blocks the release, which is exactly the contract a deploy gate needs. It drops into GitHub Actions, GitLab CI, Jenkins, or any runner that can read an exit status.

### Do AI smoke tests cost money to run?

Not necessarily. BrowserBash is Ollama-first and defaults to free local models, so you can run a full smoke suite at a guaranteed $0 model bill with nothing leaving your machine. If you want a hosted model for a hard flow, it supports OpenRouter — including genuinely free models like `openai/gpt-oss-120b:free` — and Anthropic Claude with your own key. The tool itself is free and open-source under Apache-2.0, and no account is required to run.

Ready to catch breakage before your users do? Install the CLI with `npm install -g browserbash-cli`, point a plain-English smoke check at your staging URL, and wire the exit code into CI. You can start entirely local and free; if you later want run history and video replay, sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) — an account is optional, not required.
