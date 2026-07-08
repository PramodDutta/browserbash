---
title: Pre-Launch Smoke Checks Before a High-Traffic Day
description: "Run pre launch smoke checks high traffic teams trust: a fast BrowserBash run-all suite with a hard budget cap, plus a monitor watching all day."
date: 2026-07-27
category: use-case
---

The riskiest hour of a high-traffic launch is not the traffic itself. It's the thirty minutes before it, when a deploy went out the night before, DNS changed, a feature flag flipped, and nobody has actually clicked through checkout since. Pre launch smoke checks high traffic teams run in that window exist for one reason: to catch the thing that broke quietly, before ten thousand people find it for you. This is where a fast, scripted pass beats a person tabbing through the site from memory, and it's where a tool like BrowserBash earns its keep, because the whole point is a deterministic verdict, not a vibe.

This piece walks through building that pass: a tight `run-all` smoke suite with a hard cost ceiling, timed to finish minutes before a known traffic event (a sale, a product drop, a marketing email blast, a conference talk that's about to send a wave of signups your way), and then a `monitor` left running quietly through the day to catch regressions after the smoke suite has already gone home. None of this replaces load testing. It replaces the anxious manual click-through that QA and on-call engineers do at 5:58am before a 6am launch, and it does it in a way you can point to afterward and say "here's the exact verdict, here's when it ran, here's what it cost."

## Why Manual Pre-Launch Checks Fall Apart Under Time Pressure

Manual smoke testing before a big traffic day has a predictable failure mode. Someone opens the homepage, clicks through to a product page, adds something to cart, maybe checks out with a test card if they remember the flow, and calls it good. Under time pressure, coverage narrows to whatever the tester remembers off the top of their head, and the checklist that seemed thorough in a calm Tuesday standup gets skipped when the deploy is running fifteen minutes late and marketing is refreshing Slack asking if it's safe to send the email.

The other failure mode is worse: nobody runs anything at all, because the last person who tried it got a false alarm from a flaky selector and stopped trusting the check. This is the actual argument for automating pre-launch smoke checks with an approach that doesn't rely on brittle CSS selectors baked into a script six months ago. When the page markup shifts slightly (a redesign, an A/B test variant, a new cookie banner), a hardcoded Playwright locator breaks even though the feature underneath is fine. A plain-English objective, "add the first item to cart and verify the cart count shows 1," survives that kind of surface change because an AI agent is reading the page the way a person would, not matching a brittle selector.

## What a Pre-Launch Smoke Suite Should Actually Cover

A smoke suite is not a regression suite. It should be short, boring, and cover the handful of flows that would be catastrophic if broken on the day traffic arrives. For most commerce and SaaS sites that's some version of:

- Homepage loads and the primary CTA is visible
- Search or navigation returns results
- A logged-out user can add to cart / start a signup
- A logged-in user can reach checkout / the paywall / the dashboard
- Payment or signup form renders without a console error
- A critical API dependency (inventory, pricing, auth) responds

Ten to fifteen minutes of runtime, not two hours. If your smoke suite takes longer than the window you have before the event starts, it's not a smoke suite anymore, it's a full regression pass wearing a smoke suite's name tag. Keep it narrow on purpose. The monitor running through the rest of the day is what catches anything the narrow suite missed.

## Writing the Checks as Plain-English Test Files

BrowserBash tests live as committable `*_test.md` files, so the smoke suite is just a folder of markdown, reviewable in a pull request like any other code. A minimal cart-and-checkout smoke check looks like this:

```
# Homepage and add to cart smoke check

- Go to https://shop.example.com
- Verify the "Shop now" button is visible
- Search for "wireless headphones"
- Click the first search result
- Add the item to cart
- Verify the cart count shows "1"
```

`Verify` steps that match the built-in grammar (a named button or link is visible, text is visible, a stored value equals something, an element count) compile to real Playwright assertions, not an LLM's opinion about whether the page "looks right." That distinction matters a lot in a pre-launch window: you want a pass to mean the condition was actually checked, and a fail to come with expected-versus-actual evidence, not a guess. Steps outside that grammar still run and get judged by the agent, but they're flagged `judged: true` in the output so you always know which kind of verdict you're looking at.

For a flow that needs to seed state before checking the UI, `version: 2` frontmatter turns on deterministic API steps in the same file:

```
---
version: 2
---
# Checkout smoke check with seeded cart

1. POST https://api.example.com/cart/seed with body {"sku": "WH-2200", "qty": 1}
2. Expect status 200, store $.cartId as 'cartId'
3. Go to https://shop.example.com/cart/{{cartId}}
4. Verify the "Checkout" button is visible
5. Click "Checkout"
6. Verify the URL contains "/checkout"
```

The API step seeds a known cart state without burning a model call to click through "add to cart" by hand, then the plain-English steps drive the actual UI check. This is the kind of hybrid suite that testmd 2.0 was built for: fast, deterministic setup, agent-driven verification where it actually adds value. Worth knowing before you build a whole pre-launch suite around it: v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway pointed at a compatible model. It doesn't run against Ollama or OpenRouter directly yet.

## Running the Suite Fast, With a Hard Budget Cap

The command that actually matters on the morning of a launch is `run-all` with a budget ceiling:

```bash
browserbash run-all .browserbash/tests/smoke --budget-usd 1.50 --junit out/smoke-junit.xml
```

Two things happen here that you want on a high-traffic morning. First, `run-all`'s scheduler is memory-aware: it derives concurrency from actual CPU and RAM on the runner, not a hardcoded number, so a smoke suite of ten tests doesn't queue up serially on a small runner or overload a big one. Second, `--budget-usd` is a hard stop, not a soft warning. Once the running total (estimated from a bundled per-model price table) crosses the cap, `run-all` stops launching new tests, marks whatever's left as `skipped`, and exits code `2`. That's exactly the behavior you want thirty minutes before a launch: a suite that fails loudly and cheaply rather than one that quietly keeps burning API calls while you're trying to get a fast yes/no.

If you're running the smoke suite from CI right before a scheduled release, the GitHub Action wraps the same idea:

```yaml
- uses: browserbash/browserbash-action@v1
  with:
    tests: .browserbash/tests/smoke
    budget-usd: 1.50
    shard: 1/1
```

The action installs the CLI, runs the suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with the verdict table, so whoever's watching the release channel doesn't have to tail CI logs to know if the smoke pass is green. Full details are in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## Reading the Verdict Before You Walk Away

`run-all` in `--agent` mode emits NDJSON, one event per line, which is the format built for scripts and AI coding agents to consume without parsing prose:

```bash
browserbash run-all .browserbash/tests/smoke --agent --budget-usd 1.50 | tee smoke.ndjson
```

The exit code is the thing to gate on: `0` means every test in the suite passed, `1` means at least one failed, `2` means an error, infra problem, or the budget cap tripped, and `3` means a timeout. A CI gate or a release script can key off that exit code directly instead of scraping log text, which is the whole point of a deterministic verdict: no one has to eyeball a wall of console output at 5:58am to decide whether it's safe to flip the switch.

If you're running the smoke suite manually from a laptop rather than CI, the local dashboard gives you the same verdict in a browser tab, nothing leaves the machine:

```bash
browserbash dashboard
```

It's a fast way to glance at which of the ten smoke checks failed and why, without digging through NDJSON by hand.

## Leaving a Monitor Running Through the Event

A ten-minute smoke suite before launch tells you the site was healthy at 5:58am. It says nothing about 9am, when the CDN cache started serving something stale, or 2pm, when a downstream inventory service started timing out under real load. That's what `monitor` mode is for: instead of a one-shot pass, it runs a check on an interval for as long as the event lasts and alerts only when the pass/fail state actually changes.

```bash
browserbash monitor .browserbash/tests/smoke/checkout_smoke_test.md \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

The alerting behavior is the detail that keeps this useful instead of noisy: it fires on transitions, pass to fail or fail back to pass, never on every green run. You are not getting a Slack message every ten minutes all day telling you checkout still works. You get exactly one message when it stops working, and one more when it recovers. Point the same command at any webhook URL and it gets a raw JSON payload; Slack incoming-webhook URLs get formatted automatically, so the message that lands in the on-call channel is readable without someone pretty-printing JSON at 11am on the busiest day of the quarter.

Cost is a legitimate concern for anything running all day, and this is where the replay cache changes the math. A green run records its actions; the next identical run replays them with zero model calls and only steps back in if the page actually changed. An always-on monitor checking the same checkout flow every ten minutes for eight hours is, after the first pass or two, close to token-free, because most of those runs are replays, not fresh agent reasoning. That's a meaningfully different cost profile than re-running a full agentic pass every ten minutes for eight hours straight.

If your monitor needs to check a flow behind a login, saved auth profiles avoid re-logging-in on every single interval run:

```bash
browserbash auth save prod-shopper --url https://shop.example.com/login
browserbash monitor .browserbash/tests/smoke/logged_in_checkout_test.md \
  --auth prod-shopper \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

You log in once interactively, hit Enter to save the session, and every subsequent monitor tick reuses it. Worth a quick sanity check before the event starts: if the saved profile's origins don't cover wherever the monitor's start URL lands, BrowserBash prints a warning rather than silently running unauthenticated, which is exactly the kind of thing you want to catch in a dry run the day before, not during the event.

## What Happens When Something Breaks Mid-Day

When the monitor's state flips from pass to fail, the Slack (or webhook) alert is the trigger, but the useful part is what you do next, and that's the same `run_end` payload the smoke suite already produces: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, `duration_ms`. If a `Verify` step failed, the assertion table in the alert (and in the generated `Result.md`) shows expected versus actual, so the first thing an on-call engineer sees is "checkout button expected visible, not found" rather than a vague failure they have to reproduce from scratch.

This is also where an AI coding agent already wired to BrowserBash over MCP earns its place in the incident response. If Claude Code, Cursor, or another MCP host is already connected via `browserbash mcp`, whoever's on call can hand the failing test straight to their agent and ask it to re-run and investigate:

```bash
claude mcp add browserbash -- browserbash mcp
```

The agent calls `run_test_file` on the failing smoke check, gets back the same structured verdict JSON the monitor got, and can reason about the failure without anyone hand-copying error text between a terminal and a chat window. A failed test here is a successful validation: the tool call itself succeeds, and the agent's job is to read the verdict and act on it, the same design that makes `--agent` mode useful for CI.

## Wiring Smoke Checks Into CI Before the Event, Not Just On the Day

The smoke suite you run thirty minutes before a launch is only trustworthy if it's been running in CI all along, catching breakage before it ever reaches the branch that gets deployed for the event. Sharding keeps a growing smoke suite fast enough to run on every merge to the release branch:

```bash
browserbash run-all .browserbash/tests/smoke --shard 1/3 --budget-usd 0.75
browserbash run-all .browserbash/tests/smoke --shard 2/3 --budget-usd 0.75
browserbash run-all .browserbash/tests/smoke --shard 3/3 --budget-usd 0.75
```

Shards are computed deterministically from sorted discovery order, so three parallel CI jobs each running one shard agree on the split without any coordination between them, and the per-shard budget cap means a runaway test in shard 2 can't blow the whole pipeline's spend. If the launch needs to be verified across viewports (a lot of high-traffic events skew heavily mobile), the viewport matrix runs the same suite once per size without duplicating test files:

```bash
browserbash run-all .browserbash/tests/smoke --matrix-viewport 1280x720,390x844
```

Every result gets labeled by viewport in the NDJSON events, the JUnit output, and `RunAll-Result.md`, so a mobile-only checkout failure doesn't get buried inside an otherwise-green desktop run.

## Manual Checks vs Scripted E2E vs a Pre-Launch Smoke Suite

| Approach | Setup cost | Survives UI drift | Verdict clarity | Cost on a busy day |
|---|---|---|---|---|
| Manual click-through | None upfront, high per-run | N/A, human adapts | Depends on the tester's memory | Free but slow, doesn't scale to hourly checks |
| Hardcoded Playwright/Selenium E2E | High (selectors, page objects) | Breaks on markup changes | Deterministic if it runs at all | Cheap to run, expensive to maintain |
| BrowserBash smoke suite + monitor | Low, plain-English + optional Verify steps | Reads the page like a person, less selector-fragile | Deterministic on Verify steps, judged flagged separately | Bounded by `--budget-usd`, near-free on replay cache hits |

None of these fully replace the others. Plenty of teams keep a hardcoded Playwright suite for deep regression coverage and add a plain-English BrowserBash smoke layer specifically for the fragile, high-stakes minutes before an event, because that's where selector maintenance debt costs the most and where a fast, honest verdict matters more than exhaustive coverage.

## Who This Approach Is For (and Who It Isn't)

This setup fits teams that have a known high-traffic moment on the calendar: a scheduled sale, a product launch, a marketing send, a conference demo, an ad campaign going live. If your traffic is flat and unpredictable, the value shifts almost entirely to the always-on monitor and away from the pre-event smoke burst, and it's worth just running `monitor` continuously rather than building a special pre-launch ritual.

It's also not a substitute for load or performance testing. A smoke suite tells you the critical path works for one user at a time; it says nothing about whether checkout holds up under ten thousand concurrent carts. Pair it with whatever load-testing tool your infra team already trusts, and use BrowserBash for the functional correctness question load tests don't answer well: does the button actually do the right thing, does the form actually submit, does the cart actually show the right count.

And it's honest to say where the local-model story has real limits here. BrowserBash defaults to free local Ollama models with nothing leaving your machine, which is great for day-to-day development, but very small local models (roughly 8B parameters and under) get flaky on longer multi-step objectives, which is exactly the shape of a checkout flow. For a smoke suite you're betting the launch on, a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a hosted model via `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is the safer default, especially for the deterministic `version: 2` testmd flows, which need the builtin engine and an Anthropic-compatible API regardless of what model you use elsewhere.

## Building the Checklist a Day Ahead, Not the Morning Of

The single biggest predictor of whether pre-launch smoke checks actually help is whether they were written and tested the day before, not assembled in a panic the morning of. Write the test files, run them once against staging, run them once against production in read-only mode (no real checkout submission, seed and verify instead), and check the `--budget-usd` number is realistic for the model you're using. If you're migrating an existing Playwright smoke suite instead of writing from scratch, `browserbash import` will convert goto/click/fill/expect patterns heuristically, no model call involved, and drop anything it can't confidently translate into an `IMPORT-REPORT.md` so nothing silently gets dropped:

```bash
browserbash import ./tests/playwright/smoke
```

Or if there's no existing suite at all, `browserbash record` turns a single click-through of the critical flow into a plain-English test file plus a pre-warmed replay journal, which is often the fastest path to a first smoke suite the night before a launch:

```bash
browserbash record https://shop.example.com
```

Whichever way you get there, the checklist for the day before an event is short: suite runs green on staging, budget cap is set to something you'd be comfortable exceeding once by accident, the monitor's webhook is pointed at a channel someone is actually watching, and the auth profile (if any) covers the URLs the monitor will actually hit. That's a fifteen-minute review the afternoon before, and it's the difference between a smoke suite that catches the broken checkout button and one that just sits there unused because nobody trusted it enough to run it under pressure.

## FAQ

### What is a pre-launch smoke test and why run one before a high-traffic day?

A pre-launch smoke test is a short, targeted check of the handful of critical user flows (homepage load, search, add to cart, checkout, login) run right before a known traffic spike to catch breakage from a recent deploy or config change. It's not full regression coverage, it's a fast, narrow pass meant to answer one question: is it safe to send traffic right now.

### How do I set a hard cost limit on a BrowserBash test suite?

Pass `--budget-usd` to `run-all`, for example `browserbash run-all ./tests --budget-usd 1.50`. Once the running cost estimate crosses that number, `run-all` stops launching new tests, marks the rest as skipped, and exits with code 2, so a suite can't quietly overrun its budget during a launch window.

### Can BrowserBash monitor a site continuously during a launch day?

Yes, `browserbash monitor <test> --every 10m --notify <webhook>` runs a check on a repeating interval and sends an alert only when the pass/fail state changes, not on every successful run. The replay cache also makes repeated identical checks cheap, since most interval runs replay recorded actions instead of making fresh model calls.

### Does BrowserBash replace load testing before a big sale or launch?

No. BrowserBash checks functional correctness, whether a button, form, or checkout flow actually works, for a single simulated user at a time. It does not simulate concurrent traffic or measure infrastructure capacity, so it's meant to run alongside a dedicated load-testing tool, not instead of one.

If you want to try this before your next high-traffic day, install it with `npm install -g browserbash-cli` and write your first smoke suite against staging this afternoon rather than the morning of. An account isn't required to run any of this locally; [sign up](https://browserbash.com/sign-up) only if you want the optional cloud dashboard and monitor alerting history on top.
