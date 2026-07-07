---
title: Checkly Playwright Checks vs Plain-English Monitors
description: "Checkly monitors are Playwright code you maintain; plain-English monitors read like intent and adapt to UI shifts. Compare authoring and upkeep."
date: 2026-07-05
category: comparison
---

A designer ships a cart-drawer redesign on a Tuesday afternoon. The "Add to cart" button moves out of the product card into a slide-out panel, and the PR quietly renames `data-testid="atc-button"` to `data-testid="cart-drawer-cta"`. Checkout itself is not broken. Twenty minutes after the deploy, the Checkly browser check that has been green for months goes red, and whoever is on call gets paged. They open the check, find a `page.click('[data-testid="atc-button"]')` call timing out, confirm by hand that a shopper can still buy the product, then spend the afternoon patching the selector and redeploying through the Checkly CLI. Nothing was ever down. A script just stopped matching the page it was written against.

That is what this article is actually about: not whether Checkly is a good monitoring platform (it is, and plenty of teams should keep paying for it), but what it costs, week over week, to author and keep green the browser check itself under two different models, a Playwright script you write and maintain, or a plain-English monitor an AI agent reads and adapts to. A broader Checkly vs BrowserBash comparison already covers pricing, regions, and alerting elsewhere on this site; this piece stays on one axis only: how the check gets written, what breaks it, and who can fix it.

## What actually breaks a Checkly Playwright check

A Checkly browser check is, underneath the dashboard, a Playwright script. Something close to this:

```javascript
// A Checkly browser check is fundamentally a Playwright script like this one.
const { chromium, expect } = require('@playwright/test');

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('https://shop.example.com');
await page.click('[data-testid="login-link"]');
await page.fill('#email', process.env.TEST_USER_EMAIL);
await page.fill('#password', process.env.TEST_USER_PASSWORD);
await page.click('button[type="submit"]');

await page.waitForSelector('[data-testid="atc-button"]', { timeout: 8000 });
await page.click('[data-testid="atc-button"]');
await page.click('[data-testid="cart-icon"]');
await page.click('text=Checkout');
await page.fill('#postal-code', '10001');
await page.click('text=Continue');
await page.click('text=Place order');

await expect(page.locator('h1')).toHaveText('Thank you for your order!');
await browser.close();
```

Checkly's "monitoring as code" pitch is genuinely good: this file lives in Git, gets reviewed in a PR, and deploys through the Checkly CLI or Terraform alongside the rest of your infrastructure. But look at what the check is pinned to. Every line references a `data-testid`, a CSS selector, or exact visible text, never the user's intent ("log in, add an item, check out"), always the current shape of the DOM. A renamed attribute, a button moved into a drawer, a cookie banner now covering the checkout button, or a new upsell modal blocking the next click: any of these breaks the script even though checkout is completely fine. Checkly's 2026 AI triage feature (marketed as Rocky) helps you find out *why* a check went red faster by digesting traces and network data, a real improvement over a bare stack trace at midnight, but it does not stop the break from happening or rewrite the selector for you. A human still opens the script and edits it by hand, and whoever reviews that PR needs to be fluent enough in Playwright locators to know the change is correct and not just different.

## Authoring the same check as a plain-English monitor

Here is the identical flow written as a BrowserBash `*_test.md` file, the plain-text format the CLI actually parses (`-`/`1.` list items are steps, `@import` splices in shared setup, `{{variable}}` gets substituted, and a `!secret` suffix masks the value in every log line):

```markdown
# Checkout monitor
- Go to {{baseUrl}}
- Log in as {{user}} with password {{password!secret}}
- Add the first product to the cart
- Open the cart and go to checkout
- Fill in the postal code 10001 and continue
- Place the order
- Verify the page shows "Thank you for your order!"
```

Run it once by hand, then put it on a schedule:

```bash
browserbash monitor ./checkout_test.md --every 10m --notify https://hooks.slack.com/services/T000/B000/XXXX
```

There are no selectors anywhere in that file. The agent reads the rendered page, roughly the way a person or a screen reader would, through labels, roles, and visible text, and decides what "the add to cart button" means on this render. Move that button into a drawer and rename its test id, and the monitor generally keeps working, because it was never looking for `[data-testid="atc-button"]`; it was looking for the thing a shopper would call "add to cart." Cosmetic churn, the kind that eats a Playwright-check afternoon, mostly stops mattering. And because the file is prose, anyone who can write a clear sentence, a QA analyst, a support engineer, a PM, can read the diff on a PR and judge whether it still describes the flow correctly, with no locator knowledge required.

## The honest gap: plain English alone is a judgment call

Do not let the last section oversell it. That "Verify the page shows..." line in a plain, version-1 file is not a check in the `expect()` sense, it is more English, judged by the same agent that clicked through the flow. A pass means the model believed the condition held: a useful signal, but not the same guarantee as an assertion that either matched or did not. For byte-level certainty on a specific URL, heading, or count inside an otherwise plain-English flow, you need `testmd` version 2.

Opt in with `version: 2` frontmatter and every step gets classified before the run starts into exactly one of three kinds: a deterministic HTTP call, a deterministic `Verify` assertion compiled to a real Playwright check with no model involved, or plain English for the agent. Only the third kind is judgment. Here is the same flow rewritten in v2, reusing a saved login session and seeding the cart through an API call instead of clicking through the catalog:

```markdown
---
version: 2
auth: shopper
---
# Checkout monitor (v2)
- POST {{base_url}}/api/test/seed-cart with body {"sku": "TSHIRT-RED", "qty": 1}
- Expect status 201, store $.cartId as 'cartId'
- Go to {{base_url}}/cart
- Click Checkout
- Fill in the postal code 10001 and continue
- Place the order
- Verify the text "Thank you for your order!" is visible
- Verify the URL contains '/order-confirmation'
- Verify the 'Order summary' heading is visible
```

The `auth: shopper` line means this file has no login step at all: it reuses a session saved once with `browserbash auth save shopper --url https://shop.example.com/login` (log in by hand, hit Enter, and every future run injects that storageState). The `POST` and `Expect status` lines run as a plain fetch call, no browser, no model, feeding the returned `cartId` into the run's state. The three `Verify` lines compile to real checks: a URL substring match, a visible-text wait, and a visible-heading wait, each polling for up to five seconds rather than taking one instant snapshot. A `Verify` line outside BrowserBash's nine-form grammar (URL, title, visible text, visible role, element count, stored-value equality) does not error out, it falls back to the agent and gets flagged `judged: true`, so you always know which kind of evidence you're looking at. The full grammar lives in [Playwright expect() assertions vs plain-English Verify steps](https://browserbash.com/blog/playwright-expect-assertions-vs-plain-english-verify), so this piece will not re-derive it.

## Turning either one into an always-on monitor

Authoring is only half the cost; the other half is what happens every ten minutes for the next year. `browserbash monitor` is unattended by default (headless unless told otherwise), keeps local history, and only fires `--notify` on a state *change*, pass to fail or back, not on every tick. A Slack incoming-webhook URL gets Slack-formatted automatically; anything else gets the raw JSON payload. That one design choice, alert-on-change rather than alert-on-every-run, is most of what keeps a scheduled check from turning into channel noise.

The reasonable worry with an AI-driven monitor is cost and drift: doesn't asking a model to "look at the page" every ten minutes get expensive, and isn't that one more place for a run to wander off script? The replay cache answers both. The first green run records its actions; every identical tick after that replays them directly with zero model calls, and only calls the model again to re-heal when the page genuinely changed. In practice an English monitor you wrote once does not re-derive "click add to cart" every ten minutes forever, it does that once, then replays a known-good path until something real shifts. Running a fleet of these through `run-all` instead of individual `monitor` processes, `--budget-usd` caps total spend and reports the remainder as skipped rather than letting one runaway flow burn through your budget. None of this replaces Checkly's hosted, multi-region scheduler and built-in alert routing, a genuinely different and valuable thing; the fuller infrastructure comparison lives in [Checkly vs BrowserBash for AI synthetic monitoring](https://browserbash.com/blog/checkly-vs-browserbash-synthetic-monitoring).

## Authoring and upkeep, side by side

| Dimension | Checkly Playwright check | BrowserBash plain-English monitor |
| --- | --- | --- |
| Written as | JS/TS script: selectors, waits, `expect()` | English sentences; `Verify` lines optionally compile to checks (v2) |
| Typically breaks on | Renamed or removed selectors, moved elements, a new modal blocking the click path | Cosmetic moves rarely matter; breaks when the described intent itself vanishes |
| Who can author or review it | Someone fluent in Playwright locators and matchers | Anyone who can write and read a clear sentence |
| Fixing a break | Edit the selector or wait, redeploy via the Checkly CLI | Usually nothing; if a `Verify` line stops matching, reword it |
| Assertion precision | Byte-exact: exact count, exact text, exact response | Nine deterministic `Verify` forms, plus agent judgment outside them, explicitly flagged `judged: true` |
| Seeding data | Fixtures and helpers you write into the script | A deterministic `POST ... / Expect status ...` step, no model involved |

## Bringing existing Checkly checks over

If you have a pile of Checkly browser checks and want a head start rather than a rewrite from scratch, `browserbash import <specs-or-dir>` converts Playwright spec files into a first-draft `*_test.md` heuristically, no model involved, so the output is reproducible. It handles the common surface: `goto`/`click`/`fill`/`press`/`check`/`selectOption`, `getBy*` locators, and common `expect()` forms like `toHaveURL`, `toHaveTitle`, and `toBeVisible`. `process.env.X` becomes `{{X}}` variables, with secret-looking names pre-marked `!secret`. Since a Checkly check is fundamentally a Playwright script, this works best on fairly standard locators rather than deeply custom helpers; anything it cannot confidently translate lands in `IMPORT-REPORT.md` instead of being dropped or guessed at. Treat the output as a draft to tighten, not a finished monitor. See [moving a Playwright suite to BrowserBash](https://browserbash.com/blog/migrate-playwright-suite-to-browserbash) for the deeper walkthrough.

## What plain-English monitors do not fix

Being straight about the limits matters most right here. An agent-driven run is not deterministic the way a fixed script is: two ticks of the same monitor can take a slightly different path, and a weak model can occasionally misjudge an ambiguous instruction. This is adaptive, not psychic, and it is not "self-healing" in the sense of quietly fixing a genuinely broken flow; it adapts to layout drift, it does not diagnose your bugs. Small local models (roughly 8B parameters and under) are the wrong choice for a long, multi-step checkout monitor specifically because they lose the thread on longer objectives; a mid-size local model or a capable hosted model is the right call past a handful of steps, and that is a per-flow choice, not one you can skip. The nine-form `Verify` grammar is also intentionally narrow: the moment an assertion needs an exact network payload, a response header, or a timing budget, that is still Playwright's and Checkly's home turf.

## Where Checkly's code-first model is still the right call

Keep writing Playwright for the checks where the assertion has to be exact and the surface barely changes: a payment webhook's response shape, a specific status code on a specific endpoint, a login page that has not been touched in two years and is not about to be. If your team already lives in TypeScript and treats that precision as a feature rather than a tax, code-first checks are the correct tool, not a workaround.

## Where the authoring cost catches up with you

Reach for plain-English monitors on the flows that actually eat on-call time: checkout, signup, search, account settings, the human-shaped journeys a designer or growth team touches every sprint. Those are exactly the flows where a Playwright check's selectors rot fastest, and where a sentence-authored monitor keeps working through a redesign that changes nothing about what a shopper is actually trying to do. See the [features page](https://browserbash.com/features) for the full list of engines, providers, and assertion types.

Try it against your own checkout flow before deciding either way: `npm install -g browserbash-cli`, write the seven-line file above with your real URL, and run `browserbash testmd run ./checkout_test.md --record` to watch the agent do it once. No account is required for any of that. If you later want run history, video, and per-run replay for your monitors, [creating a free account](https://browserbash.com/sign-up) and adding `--upload` is optional, not a gate.

## FAQ

### Is there a Checkly alternative that does not require writing Playwright?

Yes. BrowserBash is a free, open-source (Apache-2.0) CLI where you describe the check in plain English and an AI agent drives a real Chrome browser to carry it out, no selectors or page objects required. It is a CLI, not a hosted platform, so you bring your own scheduler (`browserbash monitor`, cron, or CI) instead of Checkly's managed infrastructure, but the authoring side, the part that actually breaks under UI changes, needs no Playwright code at all.

### Do plain-English monitors replace Checkly's Playwright checks entirely?

Not for every check. Plain-English monitors are strongest on human-shaped journeys like login, checkout, and signup, where selector rot from routine redesigns is the real cost. For byte-exact assertions, an exact network response, a specific status code, an exact element count on a stable page, a hand-written Playwright check is still the better tool. Most teams end up running both, matched to the flow.

### How precise can a plain-English monitor actually be?

More precise than a fully agent-judged instruction if you opt into `testmd` version 2. Its `Verify` steps compile to real, no-model checks across nine forms: URL contains, title is or contains, text visible, a named role visible, element count, and stored-value equality. Anything outside that grammar still runs, but falls back to agent judgment and is flagged `judged: true`, so you always know which kind of evidence backed a pass.

### What happens when a Verify line does not match the deterministic grammar?

It does not fail the run or throw an error. BrowserBash falls back to having the agent judge that line the way it judges any plain-English step, and marks the result `judged: true` so a CI gate, dashboard, or teammate reading `Result.md` can tell a compiled check from an opinion instead of treating both the same.

### Can existing Checkly Playwright checks be converted to plain-English monitors?

Partially, as a starting draft. `browserbash import <specs-or-dir>` heuristically converts Playwright spec files, common actions, `getBy*` locators, and standard `expect()` matchers, into a first-draft `*_test.md`, no model involved, so output is reproducible. Since Checkly checks are Playwright scripts under the hood, this works best on fairly standard locators. Anything it cannot translate lands in `IMPORT-REPORT.md` rather than being dropped, and the draft still needs review.

### Does an English-authored monitor cost more to run on a schedule than a Playwright script?

Not once it has run successfully. The replay cache records a green run's actions and replays them on later ticks with zero model calls, calling the model again only when the page has genuinely changed enough to need re-healing. The real cost difference is upkeep time: an English monitor's model calls are mostly a one-time authoring cost, while a Playwright check's cost shows up later as engineering time whenever the UI shifts.
