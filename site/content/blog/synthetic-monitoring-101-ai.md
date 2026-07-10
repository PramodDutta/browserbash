---
title: Synthetic Monitoring 101 With AI Browser Tests
description: "Synthetic monitoring 101: turn real login, checkout, and search flows into 24/7 AI browser checks that catch breakage before your users do."
date: 2026-07-19
category: guide
---

If your status page is green but customers still cannot log in, your monitoring is lying to you. Welcome to synthetic monitoring 101, the practice of scripting a real user journey (log in, add to cart, check out) and replaying it against production on a schedule so you find breakage before a support ticket does. An uptime ping tells you the server answered. A synthetic check tells you the thing your business actually depends on still works. This guide walks through the difference, the flows worth watching, and how to stand up AI browser tests that read like plain English and run around the clock.

I have spent years writing synthetic checks in Selenium, then Playwright, and the recurring pain was never the browser. It was the maintenance. Every UI tweak broke a selector, every monitor drifted, and half the "outages" my checks reported were the checks themselves rotting. The interesting shift over the last year is that you can now describe the flow in a sentence and let an AI agent drive the browser, which changes the maintenance math for synthetic monitoring in a real way.

## What synthetic monitoring actually means

Synthetic monitoring means you generate synthetic (fake, scripted) traffic against your live application and measure whether a known-good journey succeeds. The word "synthetic" is the important part: you are not waiting for real users to hit a bug and complain. You are manufacturing the exact interaction you care about, on your schedule, from a controlled place, so the result is a clean signal you can alert on.

There are two broad families. Availability monitoring answers "is it up?" with a simple request. Transaction monitoring answers "does the critical path work?" by walking through multiple steps like a person would. Synthetic monitoring 101 is mostly about that second family, because that is where the money is. A login page that returns HTTP 200 while the submit button silently does nothing is technically "up" and completely broken.

Real user monitoring (RUM) is the sibling discipline. RUM instruments your actual visitors and reports what they experienced. It is honest and rich, but it is reactive: you only learn about the broken checkout after a real customer hit it. Synthetic monitoring is proactive. You run the two together. RUM tells you what happened; synthetic tells you what is about to happen at 3am when nobody is watching.

### Why "green dashboards, angry users" happens

The classic failure mode is monitoring the wrong layer. Teams watch CPU, memory, request latency, and HTTP status, all of which can look perfect while a third-party payment script fails to load, a feature flag misfires, or a CDN serves a stale bundle that breaks the cart. None of your infra metrics move. Your synthetic checkout check, on the other hand, would try to click "Pay" and get nowhere, and it would page you immediately.

## Uptime pings versus synthetic user flows

This is the single most common confusion in synthetic monitoring 101, so it is worth being precise. An uptime ping (also called a heartbeat or a health check) sends one request to a URL and looks at the response. A synthetic user flow opens a browser, navigates, types, clicks, waits for the right things to appear, and verifies an outcome that a human would recognize as success.

Here is the honest comparison, including where a plain uptime ping is genuinely the better tool.

| Dimension | Uptime ping / health check | Synthetic user flow |
| --- | --- | --- |
| What it proves | The endpoint responded | The journey completes end to end |
| Layers covered | Network, server, sometimes DB | Frontend JS, auth, third-party scripts, DB, everything the user touches |
| Catches broken checkout button | No | Yes |
| Catches expired TLS cert | Yes | Yes |
| Setup cost | Minutes | Higher (you script the flow) |
| Run cost | Near zero | Higher (a browser runs) |
| False negatives | Many (200-but-broken) | Few |
| Best for | Infra liveness, SSL, DNS, API 200 checks | Login, checkout, signup, search, any revenue path |

The takeaway is not "flows are better." It is "they answer different questions." Keep a cheap uptime ping on your API health endpoint and your marketing homepage, because a one-second request every 30 seconds is the right tool for liveness. Reserve the heavier synthetic browser flows for the three or four journeys that would cost you money or trust if they broke. Watching everything with a full browser is wasteful; watching your checkout with only a ping is negligent.

### The 200-but-broken trap in detail

A page can return a perfect 200 and still be dead to a user in a dozen ways. The bundle 404s so the app never hydrates. An analytics tag throws and blocks the click handler. A CORS change breaks the API call behind the "Submit" button. A cookie-consent modal now covers the login form. A price shows "undefined" because a field was renamed upstream. Every one of these ships a healthy status code, and every one of these is invisible to anything short of a real browser walking the flow. That gap is the entire reason synthetic transaction monitoring exists.

## The flows actually worth watching

You do not monitor everything. You monitor the paths where failure is expensive and silence is likely. Rank your journeys by "revenue or trust lost per hour of breakage" and start at the top. For most products the shortlist looks like this.

- **Login and session.** If people cannot get in, nothing else matters. Watch a real credential-based login, not just that the login page renders.
- **Signup and activation.** A broken signup is a silent leak: nobody complains because they never became a customer.
- **Checkout or payment.** The most expensive minute of downtime you have. Walk cart to confirmation.
- **Search and core navigation.** The primary way users find value. A search box that returns nothing is a quiet catastrophe.
- **Any flow with a third party in the path.** Payments, auth providers, chat widgets, and analytics are the parts most likely to break without your deploy.

For each, define what "success" concretely means. Not "the page loaded" but "the order confirmation number is visible" or "the account menu now shows the logged-in username." That verifiable end state is what separates a real synthetic check from a screenshot you have to eyeball. The [features overview](https://browserbash.com/features) breaks down the assertion types that let you pin down these outcomes precisely.

## Where AI browser tests change the equation

Traditional synthetic transaction monitoring has a maintenance tax that scales with your UI churn. Every renamed class, restructured DOM, or A/B test can break a hardcoded selector, and a broken check that cries wolf gets muted, and a muted check protects nothing. This is the quiet reason a lot of synthetic monitoring programs decay: not that the concept is wrong, but that the upkeep outruns the team.

AI browser tests attack that tax directly. Instead of `page.locator('#login-btn.primary')`, you write "click the Log in button." An AI agent reads the live page, figures out which element you mean, and drives it. When the button moves or gets restyled, the sentence still describes it correctly, so the check keeps passing without a code change. You are describing intent, not encoding structure.

This is the approach [BrowserBash](https://github.com/PramodDutta/browserbash) takes. It is a free, open-source (Apache-2.0) command-line tool from The Testing Academy that turns plain-English objectives into real browser runs and returns a deterministic verdict. You install it once and describe the journey:

```bash
npm install -g browserbash-cli

# A single synthetic check, run once from your terminal
browserbash run "Go to https://shop.example.com, add the first product to the cart, \
proceed to checkout, and confirm the order summary shows a total" --headless
```

Under the hood an agent drives a real Chrome browser step by step, no selectors and no page objects, and hands back a pass or fail plus a structured summary of what it saw. That is a synthetic transaction check with roughly the setup cost of writing a sentence. The [learn section](https://browserbash.com/learn) covers the objective-writing style in more depth if you want your checks to be robust rather than brittle.

### Being honest about the tradeoffs

An AI agent driving a browser is not free and it is not magic. A run costs more than a one-line HTTP ping, both in time and, if you use a hosted model, in tokens. Very small local models (around 8B parameters and under) can be flaky on long multi-step objectives, so a login-plus-checkout flow deserves a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model rather than the tiniest thing you can run. And an AI judging "did this look right" is inherently softer than a hardcoded assertion. The good news is you do not have to accept soft judgment where you want hard guarantees, which is the next section.

## Making the verdict deterministic

The word that should make any monitoring engineer nervous about "AI checks" is nondeterminism. An alert you cannot trust is worse than no alert. So the design goal is to let the AI handle the fuzzy navigation while the pass/fail decision stays deterministic and explainable.

BrowserBash does this with `Verify` steps in a Markdown test file. The agent drives the flow in plain English, but a `Verify` line compiles to a real Playwright check with no model judgment involved: URL contains, title is or contains, text visible, a named button or link or heading visible, element counts, or a stored value equals. A pass means the condition literally held. A fail comes with expected-versus-actual evidence, so when your synthetic checkout check goes red you get "expected text 'Order confirmed' to be visible, but it was not" rather than a vague vibe.

You keep these as committable `*_test.md` files with `{{variables}}` for anything environment-specific, and secret-marked variables are masked as `*****` in every log line so credentials never leak into your monitoring output. A checkout monitor might look like this:

```markdown
# Checkout smoke check

- Go to https://shop.example.com and search for "wireless headphones"
- Add the first result to the cart
- Open the cart and proceed to checkout
- Verify text "Order Summary" is visible
- Verify the "Place order" button is visible
```

Everything above the `Verify` lines is agent-driven and resilient to UI change. The `Verify` lines are the hard contract you alert on. That split is what makes an AI synthetic check trustworthy enough to page a human at 3am.

### Seeding state with deterministic API steps

Real checkout flows often need prior state: a logged-in user, an item in inventory, a coupon that exists. testmd v2 (add `version: 2` to the frontmatter) runs steps one at a time against a single browser session and adds deterministic API steps that never touch a model. You can `POST` to seed a cart or fetch a token, `Expect status 200` and store a value, then let the agent drive the UI and `Verify` the result. It is a clean way to build a synthetic check that exercises the real UI without depending on flaky test data. Note that v2 currently runs on the builtin engine, which needs an Anthropic API key or a compatible gateway, so it is not yet an Ollama-only path.

## Running checks 24/7 with monitor mode

A synthetic check you run by hand is a demo. Synthetic monitoring is that same check running on an interval, forever, alerting you the moment the state flips. BrowserBash ships this as monitor mode:

```bash
# Run the checkout check every 10 minutes and alert Slack on state changes
browserbash monitor ./checks/checkout_test.md \
  --every 10m \
  --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

The behavior that matters here is alert hygiene. Monitor mode alerts only on pass-to-fail and fail-to-pass transitions, in both directions, and never on every green run. You get pinged when checkout breaks and pinged again when it recovers, and in between you get silence. That is the difference between an alert channel people watch and one they mute in week two. Slack incoming-webhook URLs get Slack formatting automatically; any other URL receives the raw JSON payload so you can wire it into PagerDuty, Opsgenie, or your own handler.

There is a cost angle too. An always-on browser monitor sounds expensive, but the replay cache makes it nearly token-free in steady state. A green run records the actions it took; the next identical run replays them with zero model calls, and the agent only steps back in when the page actually changed. So your monitor spends model tokens on the day the UI shifts, not on every one of the hundreds of runs where nothing moved. That is what makes a 10-minute interval practical rather than a budget hole.

### Authenticated flows without re-logging-in every run

Most valuable journeys sit behind a login, and logging in on every single monitor run is slow, token-hungry, and hammers your auth provider with synthetic traffic. Save the session once and reuse it:

```bash
# Log in by hand one time; the session is saved
browserbash auth save shopadmin --url https://shop.example.com/login

# Every monitor run reuses that saved session
browserbash monitor ./checks/dashboard_test.md --auth shopadmin --every 15m
```

`auth save` opens a browser, you log in once, and pressing Enter saves the Playwright storageState. After that, `--auth shopadmin` on any run, testmd, run-all, or monitor command reuses it, and you can also set `auth:` in a test file's frontmatter. If the saved profile does not cover your target start URL, you get a warning instead of a silent no-op, which saves you from the classic "why is my logged-in check hitting the login wall" head-scratch.

## Fitting AI synthetic checks into CI and agents

Synthetic monitoring is not only a production concern. The same plain-English checks make excellent pre-deploy gates, and this is where the tooling pays off twice. In `--agent` mode BrowserBash emits NDJSON (one JSON event per line) with frozen exit codes: 0 passed, 1 failed, 2 error or infra or budget-stop, 3 timeout. No prose parsing, so a CI job or an AI coding agent reads the verdict directly.

```bash
# Run a folder of checks in CI, shard across machines, cap spend
browserbash run-all ./checks \
  --shard 2/4 \
  --budget-usd 2.00 \
  --junit out/junit.xml \
  --agent
```

`--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four parallel CI machines agree on who runs what with no coordination. `--budget-usd 2.00` stops launching new tests once the suite crosses the budget, reports the rest as `skipped`, and exits 2, so a runaway model bill cannot happen silently. The memory-aware orchestrator derives concurrency from real CPU and RAM and runs previously-failed and slowest tests first, which surfaces breakage sooner. If you deploy from GitHub, the official [GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) wires all of this into a PR comment with a verdict table.

There is a second, newer reason this matters: AI agents themselves need a validation layer. If you have a coding agent shipping frontend changes, it needs a way to confirm the change actually works in a browser. BrowserBash runs as an MCP server (`browserbash mcp` over stdio) that any MCP host can call. One line adds it to Claude Code, Cursor, Windsurf, Codex, or Zed:

```bash
claude mcp add browserbash -- browserbash mcp
```

The host gets tools like `run_objective`, `run_test_file`, and `run_suite`, each returning the structured verdict JSON. Importantly, a failed test is a successful validation: the tool call succeeds and the agent reads the red verdict and fixes its own work. That reframes synthetic checks as guardrails for autonomous agents, not just for humans.

## A practical rollout plan

You do not stand up a full synthetic monitoring program on day one. Start narrow and earn the coverage.

1. **Pick your single most expensive flow.** Usually checkout or login. Write it as one plain-English objective and run it once by hand to confirm it passes for real.
2. **Harden it into a testmd file.** Add `Verify` steps for the concrete success state so the verdict is deterministic, and move any credentials into masked `{{variables}}`.
3. **Save the auth session** if the flow is behind a login, so the check does not re-authenticate every run.
4. **Point monitor mode at it** on a sane interval (10 to 15 minutes for a critical flow) and wire the webhook to the channel your on-call actually watches.
5. **Add the next flow, then the next.** Three or four well-chosen synthetic checks beat thirty flaky ones. Keep cheap uptime pings on the liveness stuff and reserve browser flows for the money paths.

If you already have Playwright or Selenium specs, you do not have to rewrite them by hand. `browserbash import` converts Playwright specs to plain-English test files heuristically and deterministically (no model), turning `goto`, `click`, `fill`, `press`, and common expects into English steps and mapping `process.env.X` to `{{X}}` variables. Anything it cannot translate lands in an `IMPORT-REPORT.md` rather than being silently dropped. And if you are starting fresh, `browserbash record <url>` opens a visible browser, you click through the flow once, and Ctrl-C writes the test for you, with password fields never leaving the page. The [tutorials](https://browserbash.com/tutorials) walk through each of these paths end to end.

## Common mistakes in synthetic monitoring

A few patterns show up over and over, and all of them are avoidable.

**Monitoring the homepage and calling it done.** Your homepage rarely breaks and rarely makes money. Monitor the flows behind it.

**Alerting on every run instead of state changes.** If your monitor pings the channel on all 144 green runs a day, people mute it, and a muted monitor is worthless. Alert on transitions only.

**Hardcoding brittle selectors into a "monitor."** This is how synthetic programs die: the checks break faster than the app does. Describing intent in plain English is the whole point of moving to AI-driven checks.

**Running full browser flows for liveness.** A one-second uptime ping is the correct tool for "is the API up." Do not spend a browser run on a question a `curl` can answer.

**No masking on credentials.** Synthetic checks handle real logins. If those secrets show up in plaintext logs, your monitoring is now a leak. Use masked variables from the start.

Get those five right and you have a synthetic monitoring setup that stays trustworthy long enough to actually save you, which is the entire point.

## FAQ

### What is the difference between synthetic monitoring and real user monitoring?

Synthetic monitoring runs scripted, controlled journeys against your application on a schedule, so you catch breakage proactively before real customers hit it. Real user monitoring instruments your actual visitors and reports what they experienced, which is rich and honest but reactive. They are complementary: synthetic warns you at 3am when no one is on the site, and RUM tells you what real traffic actually encountered. Most mature teams run both.

### Is an uptime ping enough, or do I need synthetic user flows?

An uptime ping only proves the endpoint responded, which misses the huge class of failures where a page returns HTTP 200 but the checkout button does nothing. Synthetic user flows walk the whole journey in a real browser and verify a human-recognizable success state, so they catch broken frontends, failed third-party scripts, and expired sessions. Keep cheap pings for liveness, SSL, and API health, and use synthetic browser flows for login, signup, checkout, and search. They answer different questions, so run both.

### How often should synthetic checks run?

It depends on how expensive the flow is and how fast you need to know. Critical revenue paths like checkout and login usually run every 5 to 15 minutes, while lower-stakes flows can run every 30 to 60 minutes. The main constraint used to be cost, but a replay cache that makes steady-state runs nearly token-free lets you monitor important flows aggressively without a runaway bill. Match the interval to your acceptable time-to-detection.

### Can AI browser tests be reliable enough to alert on?

Yes, if you keep the pass/fail decision deterministic rather than leaving it to model judgment. Let the AI agent handle the fuzzy navigation, which is resilient to UI changes, but compile your success conditions to real assertions that either held or did not, with expected-versus-actual evidence on failure. Alert only on pass-to-fail and fail-to-pass transitions to avoid noise, and use a mid-size or hosted model for long multi-step flows since very small local models can be flaky. Done that way, the alert is trustworthy enough to page on.

Ready to turn your critical flows into 24/7 synthetic checks? Install the CLI with `npm install -g browserbash-cli`, write your first check as a plain-English sentence, and point monitor mode at it. An account is optional, but if you want hosted retention and a shared dashboard you can [sign up here](https://browserbash.com/sign-up) and keep everything else running free on your own machine.
