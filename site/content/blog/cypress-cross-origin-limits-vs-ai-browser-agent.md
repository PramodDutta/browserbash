---
title: Cypress Cross-Origin and Multi-Tab Limits vs an AI Agent
description: "Cypress does not drive multiple tabs and handles cross-origin carefully. See how an AI agent walks new-tab and multi-domain login flows."
date: 2026-07-05
category: comparison
---

A support rep opens a customer record in your internal console, clicks "View latest invoice," and lands on an invoice page hosted by your payments provider (Stripe, Chargebee, or similar) on a completely different domain. Click "Manage subscription" instead, and a second Chrome tab opens so the rep doesn't lose their place in the console. Neither is exotic; it's the same shape of problem as an SSO login that redirects to Okta or Auth0 before landing back on your app, a flow that crosses a domain boundary, sometimes in the same tab, sometimes in a new one. Write the invoice flow as a Cypress test and by the second assertion the runner stops testing your app and starts fighting its own architecture: a screen of red text about a cross-origin boundary, or a click that appears to do nothing because whatever it opened isn't in the tab Cypress is watching. Neither is a bug in your app. Both are Cypress working exactly as designed, and as documented.

This article is about that specific wall: what causes it, the two ways engineers currently paper over it, and what changes when the same flows become plain-English objectives for an AI browser agent, in this case [BrowserBash](https://browserbash.com), a free, open-source CLI that never had to live inside your page's JavaScript realm to begin with. It's also honest about the part of "multi-tab" that stays genuinely hard no matter what drives the browser.

## Where the wall actually is

Write the invoice flow the way you'd write any other Cypress test:

```javascript
describe('billing handoff', () => {
  it('shows the latest invoice', () => {
    cy.visit('/customers/CUST-4471')
    cy.get('[data-cy=view-invoice]').click()
    cy.get('[data-cy=invoice-total]').should('be.visible') // this line never runs
  })
})
```

The click works. The page navigates. And Cypress throws before your assertion gets a chance, with an error along the lines of "Cypress detected a cross origin error happened on page load," telling you the test tried to visit a different superdomain than the one it started on and that this part needs to be wrapped in `cy.origin()`. Nothing is misconfigured. The invoice page happens to live on a different domain than your app, and Cypress's runner enforces a same-origin boundary between the page it's driving and the page your test code was written against, roughly the boundary a browser enforces around a cross-origin iframe.

The second flow fails in a different shape entirely. `cy.get('[data-cy=manage-subscription]').click()` runs fine, a new tab opens in the real browser, and Cypress keeps looking at the tab it already had open, because that's the only tab it has ever been able to look at. The next assertion times out searching for an element that is sitting in a tab Cypress cannot see. Nothing crashed. The test just went blind the moment your app did something browsers do constantly.

## Why this happens on purpose

Cypress's own documentation is unusually candid about both of these, under a page literally called "Trade-offs": the runner cannot drive more than one browser tab at a time, by design, and cross-origin navigation needs an explicit escape hatch. Neither is an oversight; both fall directly out of how Cypress works. Test code runs inside the same browser tab, and largely the same JavaScript realm, as your app, injected into the page rather than driving it from outside. That is exactly what makes Cypress's time-travel debugger and automatic retries so pleasant to use, and it is exactly what makes a second tab or a second origin a foreign country the runner has no passport for.

`cy.origin()`, added later in the project's life, is the fix for the first half: you wrap the commands that need to run against the other domain in a callback scoped to that origin, and Cypress switches its execution context in and out for you.

```javascript
cy.origin('https://billing.examplevendor.com', () => {
  cy.get('[data-testid=invoice-total]').should('be.visible')
})
```

It works. It is also genuine ceremony: every `cy.origin()` callback runs in isolation, so you cannot close over a variable or a helper function defined outside it, only pass in plain, JSON-serializable data as a second argument. Session state doesn't automatically carry across the boundary either, which is why `cy.origin()` gets paired with `cy.session()` in most SSO test suites, to cache the cross-origin login instead of repeating it every run.

For the second half, multiple simultaneous tabs, there is no equivalent escape hatch, only workarounds that avoid the problem rather than solve it. The standard one for a plain `target="_blank"` link is to strip the attribute at runtime, or read the `href` and `cy.visit()` it directly, folding two tabs into the one Cypress can see. For links that open through a `window.open()` call in script, the accepted recipe is to stub the call and assert on what it was told to do, rather than ever touching the tab itself:

```javascript
cy.window().then((win) => {
  cy.stub(win, 'open').as('windowOpen')
})
cy.get('[data-cy=manage-subscription]').click()
cy.get('@windowOpen').should('be.calledWith', Cypress.sinon.match(/billing\.examplevendor\.com/))
```

That is a genuinely useful pattern, and it is honest about what it actually checks: that your app *asked* the browser to open the right URL, not that the destination renders correctly once it gets there. If the billing portal is down or shows the wrong plan, this test still passes.

## What changes when nothing runs inside the page

BrowserBash's engines don't have a page realm to escape from, because neither one runs inside the browser the way Cypress does. The default engine, Stagehand (MIT-licensed, from Browserbase), and the `builtin` engine (an in-repo Anthropic tool-use loop) both drive a real Chrome over Playwright, from outside the page, the same architectural category as Puppeteer, WebdriverIO, or Selenium. A browser context in that model can hold more than one open page at once; navigating to a different domain isn't a boundary the automation layer reasons about, it's just a URL.

That collapses the cross-origin half of the problem completely. The objective for the invoice hop doesn't know or care that the destination lives on a different domain:

```bash
browserbash run "Open {{base_url}}/customers/{{customer_id}}, click 'View latest invoice', \
and verify the resulting page's URL contains 'billing.examplevendor.com' and its title contains 'Invoice'" \
  --variables '{"base_url":"https://support.acmecrm.dev","customer_id":"CUST-4471"}' \
  --record
```

No wrapper, no serializable-argument rule, no separate cross-origin login cache to babysit. The same flow as a committable test, using testmd v2's deterministic `Verify` steps so the cross-origin check is a real assertion against the page's actual URL and title, never an LLM's read of a screenshot:

```markdown
---
version: 2
auth: support-rep
---
# Support console: billing handoff

- Open {{base_url}}/customers/{{customer_id}}
- Click "View latest invoice"
- Verify the URL contains 'billing.examplevendor.com'
- Verify the title contains 'Invoice'
- Go back to {{base_url}}/customers/{{customer_id}}
- Verify the 'Manage subscription' link is visible
```

```bash
browserbash testmd run billing_handoff_test.md --record
```

`auth: support-rep` reuses a session saved once with `browserbash auth save support-rep --url https://support.acmecrm.dev/login`, so the console login isn't retested every run, and the two `Verify` lines above compile to real, deterministic checks: a pass means the URL and title actually held those values, not a model's opinion of the page.

| | Cypress | AI browser agent (BrowserBash) |
|---|---|---|
| Cross-origin navigation | Needs `cy.origin()`, args must be serializable | Just a navigation; no wrapper |
| Cached login across the boundary | `cy.session()` paired with `cy.origin()` | Saved profile (`--auth <name>`) reused per run |
| Link that opens a new tab | Runner can't see it; strip `target` or stub `window.open` | Original tab is untouched by design; see below for reading the new tab itself |
| Pass/fail on the destination | Assertion code you write and maintain | `Verify the URL contains '...'` compiles to a real check, no model judgment |

## The part that's still genuinely hard

Be skeptical of anyone who claims an AI agent makes a second, simultaneously open tab a non-issue: reading a tab you aren't currently looking at is a real problem, not just a Cypress problem. BrowserBash's own architecture is an honest example. The `builtin` engine drives one Playwright page per run through a fixed set of tools (navigate, click, type, wait, extract, snapshot), with no dedicated tool to move its attention to a sibling tab that opened elsewhere in the same browser. Point it at "Manage subscription" today and the part it gets for free is the part Cypress needed a `window.open` stub to fake: a sibling page opening doesn't move the page object the agent is already holding, so the console's own tab and state are never touched. The part it doesn't do today is reach into that sibling tab and read what's on it, in the same run.

The honest, reliable pattern for that half isn't a flag, it's the same thing a careful SDET would do anyway: split it into two checks instead of one test straining to cover both tabs at once. Verify the handoff from the console's side (the link exists, it's clickable, the customer record is still showing afterward). Then, separately, point a second objective directly at the billing portal itself and verify what's on it there, the same way any other surface in your product gets its own coverage. That isn't a workaround bolted on to cover a gap. A console test and a billing-portal test are two different systems and probably shouldn't share one assertion regardless of what tool is driving either of them.

If you've already got the destination open by hand, `--provider cdp` attaches to that running Chrome instead of launching a fresh one; without also passing `--auth` or `--viewport`, it reuses the browser's existing context and first open page rather than starting a blank tab, useful for checking something you or a teammate already navigated to, though it's the first open page, not automatically the newest tab.

## CI without the origin bookkeeping

Whatever the flow, the pipeline signal is the same either way. Add `--agent` and a run emits NDJSON, one JSON object per line, ending in a single `run_end` event with a `status` of `passed`, `failed`, `error`, or `timeout`; exit codes map straight to that: `0` passed, `1` failed, `2` error, `3` timeout. A CI step checking whether the billing handoff still lands on the right domain doesn't need to know anything about superdomains, `cy.origin()`, or which tab a click opened in, it just checks the exit code:

```bash
browserbash run "Open {{base_url}}/customers/{{customer_id}}, click 'View latest invoice', \
and verify the URL contains 'billing.examplevendor.com'" --agent --headless --timeout 60
echo "exit: $?"
```

## Where Cypress is still the right call

None of this makes Cypress worse for what it's built for. If your product is mostly one origin, mostly one tab, and you want the fastest possible inner loop with a time-travel debugger and a mature ecosystem behind it, Cypress remains an excellent, well-supported default, and `cy.origin()` genuinely closed most of the gap on occasional cross-domain hops. Where it keeps costing you is the shape of app this article opened with: outsourced billing, support tooling, partner portals and SSO, anything where "opens in a new tab" or "hands off to a different domain" isn't the exception, it's Tuesday. That's the specific, narrow wall this article is about, worth naming precisely instead of writing off "Cypress is bad at cross-origin" in general: for a lot of teams it isn't, until the day it very specifically is. More breakdowns like this one live on the [BrowserBash blog](https://browserbash.com/blog), and the full engine and provider list is on the [features](https://browserbash.com/features) page.

## FAQ

### Why does Cypress throw a cross-origin error?

Because Cypress's test runner enforces a same-origin, technically same-superdomain, boundary between the page it started on and any page your test tries to interact with. It isn't a bug in your test or your app; it's Cypress telling you the current step needs to be wrapped in a `cy.origin()` block, which switches its execution context to the new domain for you.

### Can Cypress test a link that opens in a new browser tab?

Not directly. Cypress can only drive one browser tab at a time by design, so a link with `target="_blank"` or a `window.open()` call opens a tab Cypress's runner cannot see or assert on. The common workarounds are to strip the `target` attribute and `cy.visit()` the destination URL directly in the same tab, or to stub `window.open` and assert it was called with the expected URL, which checks that your app asked to open the right place without ever driving what's actually on that page.

### Does cy.origin() fully remove Cypress's cross-origin limitation?

It removes most of the practical pain for a single cross-domain hop, but it adds real ceremony: every `cy.origin()` callback runs in isolation, so you can't close over outer variables or helper functions, only pass in plain serializable data, and session state doesn't automatically carry across the boundary, which is why it's usually paired with `cy.session()` for cached logins. It's a genuine improvement, not a removal of the underlying architecture.

### How does an AI browser agent handle a cross-origin redirect differently?

Tools like BrowserBash drive Chrome from outside the page over Playwright, the same architectural category as Puppeteer or Selenium, rather than injecting test code into the page's own realm. A cross-origin redirect is just a navigation, so there's no equivalent of `cy.origin()` to write. The plain-English objective describes the click and the destination, and a `Verify the URL contains '...'` step in a testmd v2 file compiles to a real, deterministic check against the resulting page.

### Can BrowserBash check the content of a second, separately opened browser tab in the same run?

Not reliably today. The builtin engine drives one browser page per run through a fixed tool set with no dedicated "switch tab" action, so while a sibling tab opening never disturbs the original page the agent is already on, reading what's inside that new tab in the same run isn't a solved problem yet. The honest pattern is to split it into two checks: verify the handoff from the original page, then run a second, separate objective pointed directly at the destination to verify what's actually there.

### Do I need to replace my Cypress suite to fix this one limitation?

No. Most teams keep Cypress for what it's genuinely good at, single-origin, single-tab, JavaScript-heavy flows with fast, debuggable feedback, and add a plain-English, AI-driven check specifically for the flows that cross domains or hand off to a new tab, which tend to be a small, identifiable slice of a suite rather than the whole thing.
