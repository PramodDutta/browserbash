---
title: Testing a Web3 dApp Wallet-Connect Flow With AI
description: "AI testing web3 dapp wallet-connect flows honestly: what MetaMask popups block, and the connect state you can still assert around them."
date: 2026-06-28
category: use-case
---

If you have ever tried automating a Web3 dApp, you already know the wall you hit: the wallet lives in a browser extension popup, and that popup is not part of your page. AI testing a web3 dapp sounds like it should smooth this over, and it does help, but only if you are honest about where the browser boundary sits. An AI agent driving a real Chrome window can click your "Connect Wallet" button, read the modal that appears, and verify every piece of connect state your dApp renders. What it cannot do is reach into the MetaMask extension surface and approve a transaction for you, because that surface is deliberately walled off from page automation. This guide walks the exact line between the two.

The good news is that most of what you actually want to test lives on the page, not inside the extension. Your dApp reads the wallet, then updates its own DOM: a truncated address in the header, a network badge, a token balance, a gated button that flips from disabled to enabled. Those are all assertable in plain English with a tool like [BrowserBash](https://browserbash.com/features), the open-source validation layer for AI agents. You describe the flow, the agent drives a real browser, and you get a deterministic verdict. Let me show you what is realistic, what is not, and how to structure a suite that stays green without pretending the wallet popup does not exist.

## Why wallet popups break normal automation

A wallet like MetaMask, Rabby, or Coinbase Wallet is a browser extension. When your dApp calls `window.ethereum.request({ method: 'eth_requestAccounts' })`, the browser opens a separate extension popup that is chrome-privileged and rendered outside the page's DOM. Page-level automation, whether that is Playwright, Selenium, or an AI agent driving the same Playwright surface underneath, works inside the tab. The extension popup is not the tab.

This is not a bug in any tool. It is a security boundary that exists precisely so that a malicious page cannot script your wallet into signing something. The same wall that protects a real user from a phishing dApp also stops your test harness from clicking "Confirm" inside MetaMask. Any framework that claims to fully automate a real MetaMask popup is either injecting a special test build of the extension, mocking the provider entirely, or using a headful hack that is fragile across MetaMask releases.

So the honest framing for AI testing a web3 dapp is a split:

- **In-page, fully testable:** the connect button, the wallet-selection modal your dApp renders, the connected-address display, network switching prompts your UI shows, gated content, error toasts, and disconnect flows.
- **Out-of-page, not directly clickable:** the actual MetaMask approval popup, the seed-phrase entry, the transaction-confirm screen inside the extension.

Once you accept that split, your test strategy gets a lot cleaner. You stop trying to drive the extension and start asserting hard on the state your dApp produces around it.

## What an AI agent can genuinely verify in a connect flow

Here is the part people underestimate. The connect state a dApp exposes is rich, and almost all of it is deterministic DOM. When you write a plain-English objective, the agent snapshots the page, finds the elements by their accessible role and text (not brittle CSS selectors), and acts. That means you can assert:

- The **"Connect Wallet" button** is visible before connection and the wallet-picker modal opens when clicked.
- The list of **available connectors** (MetaMask, WalletConnect, Coinbase Wallet) renders with the right labels.
- After a connection is established, the **truncated address** (something like `0x12ab...cd34`) shows in the header.
- The **network name or chain badge** matches the expected chain (Ethereum Mainnet, Base, Arbitrum).
- **Gated UI** flips: a "Mint" or "Swap" button that was disabled becomes enabled, or a "Please connect your wallet" banner disappears.
- The **disconnect** path returns the UI to its logged-out state.

None of that requires touching the extension popup. It requires a browser that already has a wallet in a known state, plus assertions on what your dApp renders. BrowserBash handles the first with saved logins and the second with deterministic Verify steps. Here is the simplest possible smoke check:

```bash
npm install -g browserbash-cli

browserbash run "Open the dApp at https://app.example-dex.xyz, confirm the 'Connect Wallet' button is visible, click it, and confirm a wallet selection modal appears listing MetaMask and WalletConnect" --agent --headless
```

The `--agent` flag emits NDJSON so a CI pipeline or a coding agent can read the verdict without parsing prose. Exit code 0 means passed, 1 means the assertion failed, 2 is an infra error, 3 is a timeout. That contract is stable, which is what you want when the check runs on every pull request.

## Getting a wallet into a known state without touching the popup

The recurring problem in Web3 test automation is state: the wallet needs an unlocked account, a funded balance, and a selected network before your dApp can do anything interesting. You cannot click through the MetaMask onboarding on every run. There are three practical routes, and each has an honest tradeoff.

### Option 1: A pre-seeded browser profile with saved session

If your test wallet is already unlocked in a persistent browser profile, you want to reuse that session rather than log in every run. BrowserBash saves a Playwright storageState with `auth save` and replays it with `--auth`:

```bash
browserbash auth save testwallet --url https://app.example-dex.xyz
# a browser opens; get the wallet into the state you want, then press Enter to save

browserbash run "Open the dApp, verify the header shows a connected address starting with 0x, and verify the network badge reads 'Base'" --auth testwallet --agent
```

Be honest about the limit here: storageState captures cookies and local storage for the page origins you visited, which covers a lot of dApp connect state (WalletConnect sessions, cached account, selected chain in your app's own storage). It does not capture the full internal state of the MetaMask extension itself. For dApps that persist their connection in their own storage, this works well. For flows that require a fresh extension approval every time, you will still hit the popup wall, and that is the case for option 3.

### Option 2: Mock the provider (injected test wallet)

Many teams inject a headless signer as `window.ethereum` in a test build, using something like a viem or ethers test account. Your dApp cannot tell the difference at the JS level, and there is no popup at all because the injected provider auto-approves. An AI agent then drives the fully in-page flow end to end, including what would have been the confirm step, because your mock resolves it silently.

This is the most reliable route for deep flow coverage, and it is honest to say it is also the one that tests the least "real" wallet. You are validating your dApp's logic, not MetaMask's UI. That is usually the right trade for CI: you own your dApp, you do not own MetaMask, and MetaMask has its own tests. Use a mocked provider for the deep swap/mint logic and keep a thin real-wallet smoke test for the connect handshake.

### Option 3: Accept the popup boundary and assert around it

Sometimes you genuinely need the real extension in the loop, for example a manual pre-release check. Here the AI agent drives everything up to the popup, a human approves inside MetaMask, and then the agent resumes and verifies the post-approval state. You script the deterministic halves and let a person do the one click that automation is not allowed to do. It is slower and not CI-friendly, but it is real, and being clear about that beats pretending a tool clicked a popup it never could.

## Writing the connect-flow test as a committable file

Ad-hoc `run` commands are fine for exploration. For anything you want in CI, put the flow in a `*_test.md` file so it is committable, reviewable, and diffable. The plain-English steps read like a manual test script, and Verify steps compile to real Playwright checks with no model judgment, so a pass genuinely means the condition held.

```markdown
# Wallet connect smoke test

- Open the dApp at https://app.example-dex.xyz
- Click the "Connect Wallet" button
- Confirm a wallet selection modal appears
- Select MetaMask from the list

Verify: text "0x" is visible
Verify: 'Disconnect' button visible
Verify: text "Base" is visible
```

Run it with the saved wallet session:

```bash
browserbash testmd run ./wallet_connect_test.md --auth testwallet --agent
```

When a Verify line fails, you get expected-vs-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md` the run writes out. So if your dApp silently drops the address after a network switch, the failure tells you the "0x" text was expected visible and was not, instead of a vague "test failed". That difference matters when someone is triaging a red build at 6pm. The deterministic Verify grammar and the parser rules are covered in more depth in the [BrowserBash learn docs](https://browserbash.com/learn).

### Seeding on-chain-adjacent data with API steps

Real dApp tests often need backend state too: an indexer entry, a user profile, a price feed the UI reads. testmd version 2 lets you mix deterministic API calls with UI checks in one file, executed one step at a time against a single browser session. The API steps never touch a model, so they are fast and reproducible:

```markdown
---
version: 2
auth: testwallet
---

# Connect and see seeded position

POST https://api.example-dex.xyz/test/positions with body {"wallet": "0xabc...", "pool": "ETH-USDC"}
Expect status 201, store $.id as 'positionId'

- Open the dApp portfolio page
- Confirm the connected address is shown in the header

Verify: text "ETH-USDC" is visible
Verify: 'Manage' button visible
```

One honest caveat: testmd v2 currently runs on the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible gateway. It does not yet run directly on local Ollama or OpenRouter. For pure connect-state UI smoke tests without API steps, the default engine and a local model are fine.

## Where AI testing helps and where it does not

Let me be balanced, because credibility matters more than a sales pitch. AI-driven testing shines in Web3 for a specific reason: dApp UIs change constantly, and selector-based tests rot fast. A locator tied to `.css-1x9f3a2` breaks the moment your design system reshuffles class names, and Web3 frontends reshuffle often. An agent that finds "the Connect Wallet button" by its role and text survives that churn. You describe intent, not structure.

But AI testing is not a universal answer, and here is where a traditional approach wins:

| Scenario | Better fit | Why |
|---|---|---|
| Fully in-page connect state, changing UI | AI agent (BrowserBash) | Plain-English intent, no brittle selectors, survives redesigns |
| Real MetaMask popup approval in CI | Mocked provider or Synpress-style setup | The extension popup is out of page reach for any page-level tool |
| Deep swap math, exact slippage assertions | Unit tests + injected signer | Deterministic numeric logic belongs in unit tests, not a browser |
| Contract-level correctness | Foundry / Hardhat tests | On-chain logic is not a UI concern at all |
| One-off exploratory check | AI agent `run` command | Fastest path from "does this work" to a verdict |

The honest headline: use AI testing for the UI and connect-state layer of your dApp, use injected providers or dedicated Web3 test frameworks for the popup-signing path, and use contract-level tools for on-chain logic. BrowserBash does not claim to sign transactions inside MetaMask, and any tool that says it fully automates the real extension deserves a close read of how. Anthropic's own guidance on agentic testing points the same direction: agents are strong at intent-level flows and weak at privileged surfaces they cannot see.

### The flakiness reality with small local models

One more honest note, because it bites people. If you run the agent on a very small local model (roughly 8B parameters and under), long multi-step objectives can get flaky: the model loses the thread on step seven of a ten-step flow. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the harder flows. For a two-or-three-step connect smoke test, small models are usually fine. For a full portfolio-and-swap journey, size up. This is a real tradeoff, not a knock on local-first testing, which is genuinely the right default for privacy and cost.

## Wiring the connect suite into CI

A connect-flow test is only useful if it runs automatically. Because `--agent` mode speaks NDJSON with stable exit codes, dropping it into any pipeline is mechanical. The replay cache is what makes this cheap: a green run records the agent's actions, and the next identical run replays them with zero model calls, stepping the model back in only when the page actually changed. For a connect flow that rarely changes, that means near-free reruns.

You can run a whole folder of dApp tests in parallel and shard across CI machines:

```bash
browserbash run-all ./web3-tests --shard 1/2 --budget-usd 2 --junit out/junit.xml --agent
```

The `--shard 1/2` slice is computed on sorted discovery order, so two CI machines split the suite without coordinating. `--budget-usd 2` stops launching new tests once estimated spend crosses two dollars, marks the rest skipped, and exits 2, which is a nice guardrail when an agent flow goes sideways and starts burning tokens. The JUnit output plugs straight into whatever CI you already run. If you use GitHub Actions, the official action installs the CLI, runs the suite, uploads artifacts, and posts a self-updating PR comment with the verdict table; the setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

### Monitoring a live dApp connect endpoint

Beyond CI, you often want to know if the connect flow breaks in production, for example after a wallet-library upgrade or a chain RPC hiccup. Monitor mode runs a test on an interval and alerts only when the pass/fail state flips, so you are not spammed on every green run:

```bash
browserbash monitor ./wallet_connect_test.md --every 10m --notify https://hooks.slack.com/services/XXX --auth testwallet
```

Slack webhook URLs get Slack formatting automatically; other URLs get the raw JSON payload. Combined with the replay cache, an always-on connect monitor is nearly token-free because it replays the recorded actions until something actually changes on the page. That is a cheap early-warning system for the single flow every dApp user hits first.

## A realistic end-to-end connect journey

Let me put the pieces into one concrete sequence, the kind you would actually commit. The goal is to cover the full in-page connect lifecycle without lying about the popup.

1. **Pre-state:** a saved `testwallet` session where your dApp already trusts a WalletConnect or injected account, captured once with `auth save`.
2. **Logged-out assertion:** open the dApp fresh, verify the "Connect Wallet" button is present and no address is shown.
3. **Open the picker:** click connect, verify the wallet-selection modal lists your supported connectors.
4. **Connected assertion:** with the session restored, verify the truncated address, the correct network badge, and that a previously gated action button is now enabled.
5. **Network mismatch path:** if your dApp shows a "Wrong network, switch to Base" prompt on the wrong chain, verify that prompt renders and that the switch CTA is visible. You are testing your UI's response, not driving the extension's network switcher.
6. **Disconnect:** click disconnect, verify the UI returns to the logged-out state and the address disappears.

Every one of those steps is in-page and deterministic. The one thing you deliberately do not automate is the MetaMask approval popup itself, and for CI you sidestep it entirely with a mocked provider or a persisted session. That is the whole trick: aggressively test the state your dApp owns, and route the extension-owned step to either a mock or a human. You can see similar connect-and-verify patterns broken down step by step in the [BrowserBash tutorials](https://browserbash.com/tutorials).

If you are migrating an existing Playwright suite, the importer converts specs to plain-English test files deterministically, with no model in the loop. Anything it cannot translate lands in an `IMPORT-REPORT.md` rather than being silently dropped, so you know exactly which parts of your old wallet tests need a human rewrite:

```bash
browserbash import ./e2e/wallet-connect.spec.ts
```

`process.env.X` references become `{{X}}` variables, and `getBy*` locators and common expects translate cleanly. The extension-popup workarounds in your old suite (whatever Synpress or custom-extension hackery you had) will show up in the report, which is a useful audit of exactly where your coverage depended on out-of-page tricks.

## Practical tips that save you a bad afternoon

A few things learned the hard way that apply specifically to AI testing a web3 dapp connect flow:

**Assert on address prefix, not the full address.** Test wallets rotate. Verifying that text "0x" is visible plus a "Disconnect" button is present is far more stable than hardcoding a full 42-character address that changes when someone regenerates the test account.

**Treat the network badge as a first-class assertion.** A huge share of "the dApp is broken" reports are actually wrong-network states. Explicitly verifying the chain name renders catches an entire class of production incidents that a connect-only test misses.

**Mask your secrets.** If a test needs a private key or an RPC key as a variable, mark it secret so it is masked as five asterisks in every log line. The recorder also protects password fields: they never leave the page, only a secret marker is captured, so a recorded flow does not leak credentials into the generated test.

**Keep the deep logic in unit tests.** Do not try to assert exact swap output amounts or slippage through the browser. Those belong in Foundry or a viem test. Keep the AI browser test focused on the connect-and-render layer where it is strongest, and let it stay fast and green.

**Run local-first by default.** The Ollama-first model story means your connect smoke tests can run entirely on your machine with no API keys and nothing leaving the box, which is a real plus when a test wallet's session is sitting in that browser profile. Reach for a hosted model only for the genuinely hard multi-step journeys. The [pricing page](https://browserbash.com/pricing) spells out what stays free forever (everything that runs on your machine) versus the optional hosted extras.

The pattern that holds up: describe the connect flow in plain English, verify the in-page state deterministically, mock or persist the wallet so you never fight the popup, and wire it into CI with a budget cap and a monitor. You get durable coverage of the flow every user touches first, without pretending your test harness can do something the browser security model forbids.

## FAQ

### Can an AI agent click the MetaMask popup to approve a transaction?

No, and any tool that claims to fully automate the real MetaMask popup should be examined closely. The extension popup is chrome-privileged and rendered outside the page's DOM, so page-level automation cannot reach it by design. For CI you sidestep this with an injected or mocked provider that auto-approves, and for a manual pre-release check a human approves the popup while the agent drives the deterministic steps around it.

### What parts of a Web3 connect flow can I actually test with AI?

Everything your dApp renders in the page: the "Connect Wallet" button, the wallet-selection modal, the truncated connected address, the network badge, gated buttons flipping from disabled to enabled, wrong-network prompts, error toasts, and the disconnect path. These are all deterministic DOM that an AI agent can find by role and text and assert on without any brittle selectors. The only thing off-limits is the extension popup itself.

### How do I keep a test wallet logged in across runs?

Use a saved browser session. BrowserBash captures a Playwright storageState with the auth save command, and you replay it on later runs with the auth flag, which restores cookies and local storage for the origins you visited. This covers most dApp connect state, including WalletConnect sessions and a cached account in your app's own storage. It does not capture the full internal state of the MetaMask extension, so flows needing a fresh extension approval still hit the popup boundary.

### Is AI testing better than Playwright or Synpress for dApps?

They solve different layers. AI testing is stronger for the changing in-page UI and connect state because it works by intent and survives redesigns that break selector-based tests. Synpress and custom extension setups are the right tool when you genuinely need the real MetaMask popup in the loop, and unit tests plus Foundry own the on-chain logic. A good dApp suite usually combines all three rather than picking one.

Ready to try it on your own dApp? Install with `npm install -g browserbash-cli` and write your first connect-flow objective in plain English. An account is optional, but if you want the free cloud dashboard and retention you can grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up).
