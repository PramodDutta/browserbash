---
title: AI Browser Testing for a Crypto Exchange UI
description: "AI testing a crypto exchange means validating order-book, trade, and wallet UIs by intent, no selectors, no real funds, and honest on 2FA."
date: 2026-06-27
category: use-case
---

A crypto exchange UI is one of the meanest surfaces in web software to test. AI testing a crypto exchange means pointing an agent at the order book, the trade ticket, and the wallet screen, describing what a real trader would do in plain English, and getting a deterministic verdict back, all without touching a live balance. The prices tick every few hundred milliseconds. The order book redraws constantly. Balances update over WebSockets. A limit order that filled changes three panels at once. Traditional selector-based tests break the moment the frontend team renames a CSS class or reshuffles a virtualized list, and on an exchange those changes ship weekly. This is exactly the kind of high-churn, high-stakes surface where an AI agent that reads the page like a human holds up better than a brittle locator.

This article walks through how to validate a trading interface with [BrowserBash](https://browserbash.com/features), the open-source natural-language browser automation CLI. You write objectives, an AI agent drives a real Chromium browser step by step, and you get a structured pass or fail. We will be honest about the parts that are genuinely hard, especially 2FA and never trading with real money, and where a plain deterministic script is still the smarter call.

## Why crypto exchange UIs break normal test suites

Most end-to-end failures on an exchange are not real bugs. They are test infrastructure crumbling under a UI that was built for speed, not for stable selectors.

Start with the order book. It is almost always a virtualized list: only the visible rows exist in the DOM, and they recycle as you scroll. Your `nth-child(5)` selector points at a different price level every second. The bids and asks are color-coded, right-aligned, and often rendered in a canvas depth chart that has no DOM text at all. A selector-based framework has nothing to grab.

Then the trade ticket. Buy and sell tabs, market versus limit versus stop, a price field, an amount field, a percentage slider (25/50/75/100 of balance), a total, and a fee estimate that recalculates as you type. Half of these fields are linked: change the amount and the total updates, drag the slider and the amount updates. A script that fills fields in the wrong order fights the reactive form and loses.

The wallet and balances view adds real-time state. Deposits arrive over a socket. A filled order moves funds from "available" to "in order" and back. Your assertion about a USDT balance is racing an update you did not trigger.

An AI agent sidesteps most of this because it works from intent. "Place a limit buy for 0.01 BTC at a price 5 percent below the current market price" does not care what the price field is called. The agent reads the current price off the page, does the math, finds the labeled input, and types. When the frontend team renames a class, the objective still reads the same and the run still passes. That resilience is the whole reason to reach for AI-driven browser testing on a surface this volatile.

## Testing against a testnet, never real funds

Rule zero: do not run automated trades against a production account with real balances. Every serious exchange stack has a sandbox or testnet, and that is where your AI tests belong.

Bitcoin has signet and testnet. Ethereum has Sepolia and Holesky. Most exchanges expose a demo or paper-trading environment with faucet-funded test balances that behave like the real thing but settle nothing. Point BrowserBash at that host. If your team only has staging with mocked market data, that works too, as long as the money is fake.

Here is a first objective run against a demo trading environment. The agent opens the page, reads the live price, and stores it as a variable you can assert on later.

```bash
npm install -g browserbash-cli

browserbash run "Open https://demo.exchange.test/trade/BTC-USDT, \
wait for the order book to load, read the current BTC price from the \
ticker and store it as 'spot_price', then confirm the buy and sell \
tabs are both visible" --agent --headless --timeout 120
```

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or an AI coding agent can read the verdict without parsing prose. Exit codes are frozen and simple: 0 passed, 1 failed, 2 error, 3 timeout. A failed trading assertion is a real signal, not a crashed harness, and your pipeline can branch on it cleanly.

The Ollama-first model story matters here for a reason that has nothing to do with cost. BrowserBash defaults to free local models, so nothing about your staging exchange, its URLs, or its DOM leaves your machine unless you opt into a hosted model. For a financial product under compliance review, "the page contents never left the laptop" is a sentence you want to be able to say.

## Writing the trade flow as a committable test

One-off objectives are fine for exploration. For a suite you commit to the repo, use a Markdown test file. It reads like a runbook, it lives in version control next to the code, and anyone on the team can edit it without knowing a testing DSL.

A `*_test.md` file is a title, a list of plain-English steps, optional `{{variables}}`, and `@import` for shared setup. Secret-marked variables get masked to `*****` in every log line, which you want when an API key or a wallet passphrase is in scope.

```
# Limit buy on BTC-USDT

- Open https://demo.exchange.test/trade/BTC-USDT
- Read the current BTC price and store it as 'market_price'
- Click the Buy tab, then the Limit order type
- Type an amount of 0.01 into the amount field
- Set the limit price to 5 percent below {{market_price}}
- Review the order summary and confirm the total and fee are shown
- Click Place Buy Order
- Verify: text "Order placed" is visible
- Verify: 'Open Orders' heading is visible
```

Run it with the testmd command, and BrowserBash writes a human-readable `Result.md` after the run so a non-engineer can see exactly what the agent did and where it landed.

```bash
browserbash testmd run ./.browserbash/tests/limit-buy_test.md --agent
```

Those `Verify:` lines are doing something specific, and it is worth slowing down on.

### Deterministic Verify assertions on the trade ticket

A verdict on a trading UI cannot be a vibe. If you ask an LLM "did the order go through?" it might hallucinate a yes off a stale toast. BrowserBash compiles `Verify` steps to real Playwright checks with no model judgment in the loop. `Verify: text "Order placed" is visible` becomes an actual visibility assertion. `Verify: 'Open Orders' heading is visible` checks a real heading role. URL contains, title is or contains, element counts, and stored-value equality are all supported.

A pass means the condition physically held on the page. A fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table, so when the order confirmation does not appear you get the actual page state, not a shrug. Verify lines that fall outside the deterministic grammar still run, but they are agent-judged and flagged `judged: true`, so you always know which verdicts were mechanical and which were an opinion. On a financial flow, you want as many mechanical ones as you can get. Read more on how the [Verify grammar and structured results](https://browserbash.com/learn) fit together.

## Seeding order state with API steps, checking it in the UI

Here is the pattern that makes exchange testing actually tractable. Placing a resting limit order through the UI, waiting for it to sit in the book, then verifying it appears in "Open Orders" is slow and flaky if you drive every click. Instead, seed the state through the exchange API, then verify it through the UI. That hybrid is what testmd v2 is built for.

Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session. Two step types never touch a model at all: API steps for seeding, and Verify steps for checking. Consecutive plain-English steps still run as grouped agent blocks on the same page.

```
---
version: 2
auth: demo-trader
---

# Resting limit order shows in the UI

- POST https://demo.exchange.test/api/v1/orders with body {"symbol":"BTC-USDT","side":"buy","type":"limit","price":58000,"qty":0.01}
- Expect status 201, store $.orderId as 'order_id'
- Open https://demo.exchange.test/trade/BTC-USDT
- Click the Open Orders tab
- Verify: text "58000" is visible
- Verify: text "{{order_id}}" is visible
- DELETE https://demo.exchange.test/api/v1/orders/{{order_id}}
- Expect status 200
```

The API step creates a real resting order in the sandbox and captures its id with a JSONPath expression. The UI steps confirm the trader actually sees it in the order panel. The final API step cancels the order so the test cleans up after itself and the next run starts from a known state. That last part matters more on an exchange than almost anywhere else: leftover open orders from a previous run will poison your next assertion about the order count.

One honesty note the docs are firm about: testmd v2 currently drives the builtin engine, which speaks the Anthropic API (or an `ANTHROPIC_BASE_URL` gateway). It does not yet run on Ollama or OpenRouter directly. So the fully local, no-key story applies to plain objectives and v1 test files. The moment you want per-step API seeding, you are on the builtin engine with a key. That is a real constraint, not a footnote to bury.

## The honest problem: 2FA, wallets, and OTP

If your exchange login requires a time-based one-time code, a hardware key, or an email magic link, an AI agent cannot conjure that secret for you, and it should not pretend to. This is the part of exchange testing that no browser automation tool waves away, and anyone who tells you otherwise is selling you a flake.

There are three practical ways through it, in rough order of how much they compromise your security posture.

The cleanest option is to test in an environment where 2FA is disabled for a dedicated test account. Most exchange staging setups support this. Your automation account is not a real user, it has no real funds, and turning off its second factor in the sandbox costs you nothing.

The next option is a saved session. BrowserBash lets you log in by hand once, including the 2FA prompt, and reuse that authenticated state afterward. You run `browserbash auth save <name> --url <login-url>`, a browser opens, you complete the full login including the OTP, press Enter, and the Playwright storageState is saved. Every later run reuses it with `--auth <name>` on run, testmd, run-all, or monitor, or with `auth:` frontmatter in the test file. You paid the 2FA tax once, by hand, and the suite coasts on the saved cookie until it expires.

```bash
# Log in by hand once, 2FA included, then save the session
browserbash auth save demo-trader --url https://demo.exchange.test/login

# Every later run skips the login wall entirely
browserbash run "Open the wallet page and store the available USDT \
balance as 'usdt_avail'" --auth demo-trader --agent
```

A profile whose saved origins do not actually cover your target start URL prints a warning instead of silently doing nothing, so you find out immediately if the session is stale rather than watching every test fail at the login wall.

The third option, a programmatic TOTP seed shared with the test so it can generate codes, is technically possible but you should think hard before doing it. It means a valid 2FA secret is sitting in your CI. On a sandbox account with no funds, that may be an acceptable trade. On anything touching real money, it is not. Be deliberate, keep it out of the repo, and scope it to the fake-money environment only. When in doubt, the saved-session route keeps the secret on the human side of the line, which is where it belongs.

## Wallet, deposit, and balance checks under real-time updates

The wallet screen is where AI browser testing earns its keep, because balances change from events you did not trigger. A deposit confirms. Another session's order fills. The number moves on its own.

The tactic that works is to anchor on labeled values, not positions. "Read the available USDT balance and store it as usdt_avail" tells the agent to find the value next to the USDT label, wherever it currently sits in a reflowing table. Then you make a change (place an order that reserves funds) and assert on the delta, not the absolute number. If available USDT was 10000 and you place a limit buy that reserves 580, the available figure should drop and "in order" should rise by the same amount. That relationship holds regardless of what other traffic hit the account.

For deposit flows, treat the confirmation as an async event with a bounded wait. "Wait for the deposit status to change from pending to completed, up to 60 seconds" lets the agent poll the UI the way a human would, refreshing and watching, instead of asserting once and failing on a race. The agent's step-by-step loop is naturally suited to "keep checking until the page says done," which is awkward to express in a flat script.

One caveat worth stating plainly: very small local models, roughly 8B parameters and under, get flaky on long multi-step objectives like a full deposit-then-trade-then-withdraw journey. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, for the genuinely hard flows. A tiny model will happily lose the thread halfway through a ten-step wallet reconciliation. Right-size the model to the length of the flow.

## Running the full suite: parallel, sharded, and budgeted

Once you have a dozen trading tests (market buy, limit buy, stop order, cancel, partial fill, deposit, withdraw request, balance reconciliation), run them as a suite. The `run-all` orchestrator derives concurrency from your real CPU and RAM, orders previously-failed and slowest tests first so failures surface early, and flags flaky tests it sees pass and fail across runs.

For CI, sharding and a spend cap keep things predictable. `--shard 2/4` runs a deterministic quarter of the suite, computed on sorted discovery order so four parallel machines agree on the split without coordinating. `--budget-usd` stops launching new tests once estimated spend crosses the line, marks the rest `skipped`, and exits 2, so a runaway hosted-model bill on a bad day is capped.

```bash
# One CI machine runs its shard, with a hard spend ceiling
browserbash run-all .browserbash/tests \
  --shard 2/4 --budget-usd 2.00 \
  --junit out/junit.xml --agent
```

The cost estimate rides along in every `run_end` as `cost_usd`, drawn from a bundled per-model price table (unknown models get no estimate rather than a made-up one), and the total lands in `RunAll-Result.md` and the JUnit `<properties>`. If you wire this into a pull request via the [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), you get a self-updating PR comment with the verdict table on every push.

The replay cache is what makes an exchange suite affordable to run often. A green run records its actions; the next identical run replays them with zero model calls, and the agent steps back in only when the page actually changed. On a stable trade flow that means most reruns cost nothing, and the agent's intelligence is spent only on the steps that genuinely drifted.

## Monitoring a live (or staging) exchange for regressions

Exchanges are always-on products, so testing should not stop at CI. Monitor mode runs a test or objective on an interval and alerts only when the verdict flips, pass to fail or fail back to pass, never on every green run. That is the right signal-to-noise for a status channel: silence when healthy, a ping the moment the trade ticket breaks.

```bash
browserbash monitor ./.browserbash/tests/limit-buy_test.md \
  --auth demo-trader --every 10m \
  --notify https://hooks.slack.com/services/XXXX/YYYY/ZZZZ
```

Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload for your own pipeline. Because the replay cache carries the heavy lifting, an always-on ten-minute monitor on a stable flow is nearly token-free. Keep it pointed at staging or a demo account, not a funded production login, for the same reason as everything else in this article.

## Where a plain script still wins

AI browser testing is not the answer to every exchange test, and pretending otherwise would be the kind of hype this project deliberately avoids.

If you are load-testing the matching engine, hammering the order API at a thousand requests per second to measure fill latency, an AI agent driving a browser is the wrong tool by a wide margin. That is a job for a raw HTTP load generator against the API, no UI in the loop. If you are verifying exact numeric correctness of a fee calculation across ten thousand price and quantity combinations, a table-driven unit test on the pricing function is faster, cheaper, and more thorough than any browser run. And if a flow is genuinely static, a login form that has not changed in two years, a well-written deterministic Playwright script has slightly lower latency and zero model dependency.

The place AI testing wins is the volatile, human-shaped, frequently-redesigned surface: the order book that redraws, the trade ticket that gets reworked every sprint, the wallet view that reflows. That is most of what a trader actually touches, and it is where selector maintenance eats your week. Use the AI agent for the UI journeys, keep deterministic API and unit tests for the math and the load, and let the two layers cover each other. If you are weighing the approaches, the [BrowserBash tutorials](https://browserbash.com/tutorials) walk through several of these hybrid patterns end to end.

## FAQ

### Is it safe to run AI testing on a crypto exchange with real money?

No. Never point automated tests at a production account holding real balances. Use a sandbox, testnet, or demo trading environment with faucet-funded test money that settles nothing, and confirm the account has no real funds before any run. Every reputable exchange stack offers such an environment precisely so that automated trading tests cannot cause real losses.

### How does BrowserBash handle two-factor authentication on an exchange login?

An AI agent cannot generate your 2FA secret, and BrowserBash does not pretend to. The recommended path is to log in by hand once with the auth save command, complete the full login including the OTP, and reuse that saved Playwright session on later runs with the auth flag. Alternatively, use a dedicated test account with 2FA disabled in the sandbox. A shared TOTP seed is technically possible but should stay scoped to fake-money environments only.

### Can an AI agent reliably read a virtualized order book?

Yes, within reason, because the agent reads the visible rendered page the way a human trader does rather than relying on DOM positions that recycle as the list scrolls. Anchor your objectives on labeled values and relationships, such as reading the current price or asserting that available balance dropped by the reserved amount, instead of fixed row positions. For long multi-step journeys, use a mid-size or hosted model, since very small local models can lose the thread on complex flows.

### Do I need an API key to test a crypto exchange UI with BrowserBash?

Not for plain objectives or v1 Markdown tests, which run on free local Ollama models by default with nothing leaving your machine. You only need a key for the builtin-engine features, most notably testmd v2 with its deterministic API seeding steps, which currently require an Anthropic key or a compatible gateway. Choose the local path for exploratory UI checks and the keyed path when you want per-step API-plus-UI hybrid tests.

Crypto exchange UIs are volatile by design, and that is exactly the surface where testing by intent beats maintaining a wall of selectors. Install the CLI with `npm install -g browserbash-cli`, point it at your sandbox, and describe a trade the way a real user would. An account is optional and everything runs locally by default, so you can start today and [sign up](https://browserbash.com/sign-up) only if you later want hosted dashboards and monitoring.
