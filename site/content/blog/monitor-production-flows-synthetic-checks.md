---
title: Monitor Production Flows With AI Synthetic Checks
description: "Production flow monitoring with BrowserBash AI synthetic checks: run login and checkout against prod on a schedule with video on failure, no per-check bill."
date: 2026-02-12
category: use-case
---

Most outages are not discovered by a dashboard. They are discovered by a customer who could not check out, who then tells a friend, who then tells your support queue. Production flow monitoring exists to close that gap: you drive the same login and checkout your users drive, on a schedule, against the live site, and you find out before they do. The usual way to buy this is a synthetic monitoring vendor like Checkly or Sauce Labs, billed per check. This guide shows a different shape using [BrowserBash](https://browserbash.com), a free, open-source CLI from The Testing Academy that runs an AI agent through a real Chrome browser, records a video when something breaks, and never charges you per check.

The core idea is simple. A synthetic check is just a robot pretending to be a customer at a fixed interval. Traditional tools make you script that robot with selectors and assertions, then meter you on how often it runs. BrowserBash lets you write the robot's job in plain English — "log in, add an item to the cart, complete checkout, confirm the order succeeded" — and the agent figures out the clicks. You run it from cron, a CI scheduler, or any box that can run Node, and the cost of the check itself is whatever your machine and model already cost you. On local models, that is zero.

## What production flow monitoring actually is

Production flow monitoring, sometimes called synthetic monitoring or active monitoring, is the practice of continuously exercising critical user journeys against your live environment from the outside. It is the opposite of passive monitoring, which waits for real traffic to generate errors. A synthetic check generates its own traffic on a fixed cadence so you get a heartbeat even at 3 a.m. when no real users are awake.

The journeys worth monitoring are the ones that make you money or define your product: sign-in, signup, search, add-to-cart, checkout, and any flow that touches a payment processor or an external dependency. These are exactly the flows that break in ways your unit tests never see, because they cross network boundaries you do not control — a CDN, a third-party auth provider, a Stripe or PayPal redirect, a feature flag that shipped at noon and silently disabled the "Place order" button.

### Synthetic checks versus uptime pings

A naive uptime monitor hits your homepage, gets a 200, and declares victory. That is nearly worthless for a transactional app. Your homepage can return 200 while the checkout API throws 500 on every request, while the login form posts to a dead endpoint, while the cart silently drops items. A real synthetic check has to *do the thing*: type credentials, click through a multi-step flow, and verify a success state that only appears when the whole chain worked. That is the difference between "the server is up" and "customers can actually buy."

### Why the live site, not staging

Teams already run these flows in CI against staging. That is good and you should keep doing it. But staging is not production. Staging has test Stripe keys, a different CDN config, smaller data sets, and no real DNS or TLS edge cases. The bugs that cost you revenue live in the gap between the two. Production flow monitoring deliberately runs against the real domain so you catch the config-only and infrastructure-only failures that never reproduce in a pre-prod environment.

## How BrowserBash runs a production synthetic check

BrowserBash takes a plain-English objective and an AI agent drives a real Chrome or Chromium browser step by step. There are no selectors to maintain and no page objects to keep in sync with a redesign. You describe the outcome; the agent reads the page, decides what to click, and returns a verdict plus structured results. Install it once:

```bash
npm install -g browserbash-cli
browserbash run "Go to shop.example.com, log in as the test user, add the first product to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

The agent opens a browser, performs the journey, and tells you whether it passed. For a monitoring use case the interesting part is what happens on failure and how you wire it into a scheduler, so let's build that up.

### Markdown tests you can commit and version

Typing a long objective on the command line is fine for a one-off, but a monitored flow deserves to live in your repo next to the code it guards. BrowserBash supports committable markdown tests — plain `*_test.md` files where each list item is a step. They support `@import` so you can compose a login fragment into many flows, `{{variables}}` for per-environment data, and secret-marked variables that get masked as `*****` in every log line. Here is a checkout monitor as a markdown test:

```bash
browserbash testmd run ./checkout_prod_test.md
```

A `checkout_prod_test.md` might read like this in spirit: go to the production store, sign in with `{{username}}` and the secret `{{password}}`, add a known in-stock item to the cart, proceed through checkout with the saved test card, and confirm the order confirmation text appears. Because the password is marked secret, it never shows up in the run log, the `Result.md` file BrowserBash writes after each run, or your CI output. That matters a lot when the same log might be uploaded to a dashboard or pasted into a ticket.

### Video and screenshots on failure

When a synthetic check fails at 3 a.m., the worst outcome is a red dot and no context. You wake up, you cannot reproduce it, and you waste an hour. BrowserBash's `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine, so a failed run leaves behind a watchable recording of exactly what the agent saw — the spinner that never resolved, the error toast, the checkout button that was disabled. On the in-repo builtin engine you also get a Playwright trace you can open in the trace viewer and step through frame by frame.

```bash
browserbash testmd run ./checkout_prod_test.md --record --headless
```

`--headless` keeps it invisible on a server with no display, and `--record` makes sure that if it breaks, you have the video. That single combination — record plus headless — is the heart of an unattended production monitor.

## Scheduling production checks without a per-check meter

There is no special "scheduler" product to buy here. A synthetic check is just a command, and your operating system already knows how to run commands on a schedule. On a Linux box, cron runs your checkout monitor every five minutes:

```bash
*/5 * * * * /usr/local/bin/browserbash testmd run /opt/monitors/checkout_prod_test.md --record --headless --agent >> /var/log/checkout-monitor.ndjson 2>&1
```

The `--agent` flag is what makes this production-grade. In agent mode, BrowserBash emits NDJSON — one JSON event per line — on stdout, and sets a meaningful exit code: `0` passed, `1` failed, `2` error, `3` timeout. Your cron job, CI scheduler, or a tiny wrapper script reads the exit code and decides whether to page someone. There is no prose to parse and no screen-scraping of human-readable output; the contract is machine-first by design.

### Alerting off exit codes

A few lines of shell turn an exit code into an alert. Run the check, and on a non-zero exit, fire your existing notifier — PagerDuty, Slack webhook, Opsgenie, an email, whatever you already run. The video and screenshot from the failed run are sitting on disk (or in the dashboard, if you opted in), so the alert can link straight to the evidence. You are not building a monitoring platform; you are gluing a command's exit code to a notifier you already own.

### Where the browser runs

By default the browser runs locally — it is your Chrome on the box executing the cron job. That is the cheapest and most private option. But the `--provider` flag lets you move the browser elsewhere with one switch: `cdp` points at any DevTools endpoint, and `browserbase`, `lambdatest`, and `browserstack` run the browser on those clouds if you want geographic distribution or a managed browser farm.

```bash
browserbash testmd run ./checkout_prod_test.md --provider lambdatest --record
```

This is genuinely useful for monitoring, because a real synthetic strategy checks from more than one region. You might run the local check from your primary data center and a LambdaTest-hosted check from another continent to catch CDN and DNS issues that only appear far from your origin.

## The model story and the honest caveat

This is where BrowserBash diverges most from a SaaS vendor. It is Ollama-first: by default it uses free local models, needs no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. So you can run a genuine $0-model-bill monitor on hardware you already have, which for a check that fires every five minutes around the clock is a real difference versus a metered cloud.

It also supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic Claude if you bring your own key. The flexibility is the point: you pick where intelligence comes from and you control the bill.

Now the honest part, because production monitoring is unforgiving and you should know the limits before you trust it. Very small local models — roughly 8B parameters and under — can be flaky on long, multi-step objectives. A four-step checkout that crosses a payment redirect is exactly the kind of task a tiny model will sometimes fumble, and a flaky monitor that cries wolf is worse than no monitor. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, for the hard flows. Use the tiny models for a simple "is the login page reachable and does sign-in succeed" check where the step count is low, and reserve the bigger model for the full checkout. Match the model to the difficulty of the flow and your false-positive rate stays sane.

## BrowserBash versus Checkly and Sauce Labs synthetic monitoring

Checkly and Sauce Labs both offer mature, well-built synthetic monitoring, and for a lot of teams they are the right answer. Checkly is built around Playwright-based browser checks with a polished dashboard, global check locations, and alerting baked in. Sauce Labs offers synthetic monitoring as part of a broad testing cloud. Both are commercial products that, as is standard for the category and as of 2026, bill based on usage — typically how many checks you run and how often. Exact current pricing and plan limits are not something I'll quote here because they change; check their pricing pages for the live numbers.

The honest framing is about trade-offs, not a knockout. Here is how the approaches differ on the axes that matter for production flow monitoring.

| Dimension | BrowserBash | Checkly | Sauce Labs synthetic |
| --- | --- | --- | --- |
| License / cost model | Free, open-source (Apache-2.0); you pay for compute/model only | Commercial SaaS, usage-based (per check) | Commercial, part of a paid testing cloud |
| How you author a check | Plain-English objective or committable markdown steps | Playwright scripts / code | Scripted checks |
| Per-check billing | None — runs on your scheduler, your hardware | Yes (as of 2026) | Yes, plan-based (as of 2026) |
| Where the browser runs | Local by default; cdp / Browserbase / LambdaTest / BrowserStack via one flag | Managed global locations | Managed global locations |
| Video on failure | `--record` → `.webm` + screenshot on any engine; trace on builtin | Provided in dashboard | Provided in dashboard |
| Hosted scheduler & alerting | Bring your own (cron / CI + your notifier) | Built in | Built in |
| Global check locations | Via hosted providers you choose | Built in, many regions | Built in |
| Data privacy | Can run fully local; nothing leaves your machine on local models | Cloud SaaS | Cloud SaaS |

Read that table honestly. The boxes where Checkly and Sauce Labs win are real and they are not small: a built-in global scheduler, managed check locations on every continent, integrated alerting, status pages, and a support contract. If you want to buy a complete monitoring product and never think about cron, a worker box, or a notifier integration again, a commercial synthetic vendor is the better fit and I would tell you to buy one.

### Where BrowserBash wins

BrowserBash wins on three things. First, cost structure: there is no per-check meter, so a check that runs every minute costs the same as one that runs hourly — your compute. On free local models the model bill is genuinely $0. Second, authoring: writing "log in and check out and confirm the thank-you page" in English is dramatically faster than maintaining a Playwright script, and it does not break when marketing reshuffles the checkout layout, because there are no selectors to rot. Third, privacy and control: you can run the entire thing on your own hardware with a local model and nothing about your production flow — URLs, test credentials, page contents — ever leaves your network.

### Where a commercial vendor wins

If your requirement is "I need checks running from twelve global locations with a hosted status page and PagerDuty integration that someone else maintains," BrowserBash makes you assemble that yourself from cron, a provider flag, and your own notifier. A vendor hands it to you turnkey. If you have no spare box to run a scheduler, or you specifically need the SOC2-papered, contractually-supported uptime guarantees that an enterprise buyer demands, the metered product is worth the bill. Credibility matters more than a sales pitch here: for many teams the right call is to buy the vendor, and that is a perfectly good outcome.

## A realistic monitoring setup, end to end

Here is how I would actually stand this up for a store, balancing the trade-offs above.

Start by writing two markdown tests and committing them next to your app code. The first is a light login check that runs often. The second is the full checkout, which runs less often because it is heavier and crosses a payment boundary. Both use `{{variables}}` so the same files point at production by swapping a data file, and both mark the password secret so it is masked everywhere.

For the login check, a small local model is fine; the flow is two or three steps. For the checkout, configure a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a hosted model so the multi-step journey is reliable. This split keeps your average cost near zero while keeping the hard flow trustworthy.

Schedule them with cron. The login check fires every minute or two; the checkout every five to fifteen minutes, which is plenty to catch a payment outage before it does serious damage. Every invocation uses `--agent --record --headless`. The `--agent` flag gives you the NDJSON stream and the exit code your wrapper reads; `--record` guarantees a video if it breaks; `--headless` keeps it server-friendly.

Wire the exit code to your existing alerting. A non-zero exit means a customer-facing flow is broken right now. The alert links to the recorded `.webm` and screenshot so whoever gets paged opens the video and sees the failure in ten seconds instead of trying to reproduce a 3 a.m. ghost.

### Optional: the dashboards

You do not need an account to run any of this. But BrowserBash gives you two optional dashboards if you want run history in a UI. There is a free, fully local dashboard:

```bash
browserbash dashboard
```

That runs entirely on your machine — no account, no upload. If you want shareable run history with video recordings and per-run replay that your whole team can open, there is a free cloud dashboard that is strictly opt-in. You connect it explicitly and upload only the runs you choose:

```bash
browserbash connect
browserbash testmd run ./checkout_prod_test.md --record --upload
```

Free uploaded runs are kept for 15 days. Nothing uploads unless you pass `--upload`, which is the right default for production data — you decide what leaves the box. For a deeper walkthrough of the run history and replay UI, the [features page](https://browserbash.com/features) covers what the dashboard shows.

### Reading the NDJSON stream

Because `--agent` emits one JSON event per line, you can do more than read an exit code. You can pipe the stream into a log aggregator, count how long each step took, and alert on a flow that *passed but got slow* — a checkout that still works but now takes 40 seconds is an early warning of a degrading dependency. The structured output makes those signals available without parsing prose, which is exactly why it was built for CI and AI coding agents in the first place. If you want to see how that integrates with a pipeline, the [Learn hub](https://browserbash.com/learn) has the agent-mode details.

## Pitfalls and how to avoid them

A few things will bite you if you skip them, and they are worth saying plainly.

**Test data on production is a real problem.** Running a real checkout against production means real orders unless you handle it. Use a dedicated test account, a test payment method your processor recognizes as non-charging, or a product SKU you immediately refund. Whatever you do, decide it on purpose — do not discover after a week that your monitor placed 2,000 live orders.

**Flaky monitors train people to ignore alerts.** This is the deadliest failure mode in all of monitoring. If your check fails spuriously twice a day, your team mutes it, and then it is useless the one time it is real. This is why the model choice matters: a too-small model on a long flow produces exactly this flakiness. Right-size the model, keep the heavy flows on a capable model, and add a one-retry-before-alert rule so a single transient hiccup does not page anyone.

**Secrets in logs.** A monitor that prints a production password into a log that gets shipped to a SaaS aggregator is a breach waiting to happen. Use the secret-marked `{{variables}}` so credentials show as `*****` in the run log and the `Result.md`. Verify it once by reading the output of a real run before you trust it in production.

**One region is not monitoring.** A check from a single box tells you that box can reach your site. Use the `--provider` flag to add a check from a hosted browser in another region so you catch CDN, DNS, and edge failures that only manifest geographically. You do not need many — two well-placed checks beat one.

For more worked examples of flows like login and checkout, the [BrowserBash blog](https://browserbash.com/blog) has companion guides on automating each one, and the [case study](https://browserbash.com/case-study) page shows the approach applied to a full store.

## When to choose which approach

Choose BrowserBash for production flow monitoring when you want control over cost and data, you are comfortable owning a small amount of scheduling glue, and you value plain-English checks that survive redesigns. It is an especially good fit for teams that already run their own infrastructure, care about keeping production credentials on their own hardware, and do not want a per-check meter dictating how often they monitor. The $0-model-bill option on local models makes high-frequency checks economically free, which changes what is worth monitoring.

Choose Checkly or a Sauce Labs-class vendor when you want a turnkey product with a hosted global scheduler, managed check locations, built-in alerting, a status page, and a support contract — and you would rather pay for that than assemble it. For an enterprise with compliance requirements and no appetite to run a worker box, that is money well spent.

Many teams will sensibly do both: a commercial vendor for the polished external-facing status page and a BrowserBash check on their own infrastructure for the deep, full-checkout flow they want to run constantly without watching a meter. These are not mutually exclusive, and using one does not mean abandoning the other.

## FAQ

### What is production flow monitoring and how is it different from uptime monitoring?

Production flow monitoring drives complete user journeys — login, search, add-to-cart, checkout — against your live site on a schedule and verifies a real success state, like an order confirmation. Uptime monitoring usually just pings a URL and checks for a 200 response. The difference matters because your homepage can return 200 while checkout is completely broken, so only a real flow check catches the failures that actually cost revenue.

### Does BrowserBash charge per synthetic check like Checkly or Sauce Labs?

No. BrowserBash is free and open-source under Apache-2.0, and it has no per-check meter. You run checks from your own scheduler on your own hardware, so a check that fires every minute costs the same as one that fires hourly. On free local models the model bill is genuinely zero; you only pay for hosted models or hosted browser providers if you choose to use them.

### How do I get a video when a production check fails?

Add the `--record` flag to your run. BrowserBash captures a screenshot and a full `.webm` session video via ffmpeg on any engine, so a failed run leaves a watchable recording of exactly what the agent saw. On the builtin engine you also get a Playwright trace you can open in the trace viewer. Combine it with `--headless` so it runs invisibly on a server, and the video sits on disk ready to link from your alert.

### Can I run production monitoring checks fully offline without sending data to a cloud?

Yes. BrowserBash is Ollama-first and defaults to free local models, so with the local provider nothing leaves your machine — no API keys, no uploads, no account. The browser is your local Chrome and the model runs locally. The cloud dashboard is strictly opt-in and only uploads runs when you pass `--upload`, so your production URLs and test credentials stay on your own infrastructure by default.

Production flow monitoring does not have to come with a per-check invoice. Install it with `npm install -g browserbash-cli`, write your login and checkout journeys as plain-English markdown tests, schedule them with cron using `--agent --record --headless`, and you have a real synthetic monitor that records video when it breaks. An account is optional — you only need one if you want the shared cloud dashboard, which you can grab at [browserbash.com/sign-up](https://browserbash.com/sign-up).
