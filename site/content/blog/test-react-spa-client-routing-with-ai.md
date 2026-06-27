---
title: Testing a React SPA With Client-Side Routing Using AI
description: "Test React SPA flows where routes change without full reloads using AI: wait for route transitions, assert on mounted components, write intent not selectors."
date: 2026-06-27
category: guide
---

To test a React SPA where routes change without full page loads and state lives in memory, you describe the user-visible outcome of each route transition in plain English and let an AI agent drive a real browser, reading the rendered page after every navigation instead of waiting for a hard reload that never comes. A single-page app rewrites the URL with the History API and swaps mounted components in place, so the classic signals a test runner relies on (a fresh document, a load event, a server response per page) are gone. An agent sidesteps this by checking what a human would check: did the heading I expected appear, is the right content on screen, did the click take me where it should. With BrowserBash you write that as an objective like `browserbash run "go to the dashboard, open the Billing tab, and confirm the saved cards list is visible"`, and the agent waits for the new view to mount, reads the live accessibility tree, and returns a verdict. No `waitForNavigation`, no guessing which `data-testid` survived the last refactor.

This guide is for engineers and SDETs who build React SPAs with React Router (or TanStack Router, or Next.js client navigation) and want a clear-eyed look at how an AI agent handles in-memory routing differently from a scripted flow. I will cover how to wait for route transitions without manual sleeps, how to assert on components that mount only after navigation, and how to phrase objectives around user intent rather than React internals or CSS classes. I will also be honest about where this approach struggles.

## Why client-side routing breaks conventional test assumptions

A multi-page app gives a test runner clean seams. Click a link, the browser sends a request, the server returns a new HTML document, the page reloads, and your runner knows the navigation finished because a load event fired. You can hang assertions off that boundary.

A React SPA erases the boundary. React Router intercepts the click, calls `history.pushState`, updates the URL bar, and re-renders a different component tree into the same document. There is no request for the page, no reload, no load event. The DOM for "the old route" is unmounted and the DOM for "the new route" is mounted, sometimes after an async data fetch, sometimes behind a `Suspense` boundary that shows a spinner first. State that a server-rendered app would keep in a session now lives in a React context or a store in memory, and it vanishes the moment someone does a real refresh.

For a scripted test, this is a minefield. You cannot wait for navigation because navigation in the browser sense never happens, so you end up waiting for a specific selector, which couples your test to the exact markup React produced and breaks every time someone renames a class. The test passes until a cosmetic refactor it should not care about quietly breaks it.

An AI agent does not have this problem in the same shape, because it never waited for a load event in the first place. It works the way a person does: act, look at what is on the screen, decide whether the goal is met. The route transition is just a thing that happens between "I clicked" and "I read the page again."

## How an AI agent waits for a route transition

The core trick is that the agent observes the live DOM after every action rather than blocking on a navigation primitive. BrowserBash's default engine, stagehand (MIT, from Browserbase), looks at the rendered page each step and decides the next action from what is on screen right then. The alternative builtin engine, an Anthropic tool-use loop, re-derives the target element on every action from a fresh snapshot and never caches a selector between runs. Either way, the agent re-reads reality after the click that triggered the route change, so a `pushState` swap is handled like any other DOM update.

Under the hood, BrowserBash leans on Playwright's built-in auto-wait, with a 15-second ceiling and no manual sleeps. When the agent acts on the element it expects on the new route (say, the "Billing" heading), Playwright waits for that element to be actionable, absorbing the time the new view takes to mount or a `Suspense` fallback to resolve. You never write `waitForTimeout` or `waitForURL`; you describe the destination and the agent confirms it arrived.

Here is the simplest version, a one-shot objective:

```bash
browserbash run "From the app home, click the Reports link in the sidebar, \
then confirm a page titled 'Monthly Reports' with a date-range filter is shown"
```

The agent clicks the sidebar link, the SPA swaps routes in memory, and the agent looks for the "Monthly Reports" title and the date-range filter. If the transition is slow because of a lazy-loaded chunk, the auto-wait covers it. If the route never resolves, the objective fails at the step where it stalled. There is more on this observe-and-decide loop in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

### Writing it as a reusable Markdown test

For anything you want to keep and rerun, write a `*_test.md` file. Tests in BrowserBash are intent expressed in Markdown: a title, a list of steps, optional `@import` composition, and `{{variables}}` masked in logs when they hold secrets. A route-transition test for a dashboard looks like this:

```markdown
# Dashboard route transitions

1. Go to {{base_url}}
2. Log in as {{user}} with {{password}}
3. Confirm the dashboard heading "Overview" is visible
4. Click the "Billing" tab in the left navigation
5. Confirm the URL path is /dashboard/billing
6. Confirm a "Saved payment methods" section is visible
7. Click the "Invoices" tab
8. Confirm an invoices table with at least one row is shown
```

Run it with:

```bash
browserbash testmd run ./dashboard_routes_test.md
```

Each numbered step is an intent, not a located action. Step 4 says "click the Billing tab," not "click `nav > ul > li:nth-child(2) > a.tab-link`." The agent finds the Billing tab by its accessible role and name, clicks, waits for the new view, then checks steps 5 and 6 against the freshly mounted DOM. Because the test references user-visible things (a tab labelled "Billing," a section titled "Saved payment methods"), it survives the markup churn that would shatter a selector-based script. That durability is the whole argument in [browser automation without selectors](https://browserbash.com/blog/browser-automation-without-selectors).

## Asserting on dynamically mounted components

The harder half of SPA testing is not the navigation, it is asserting on content that only exists after the route mounts and its data loads. A route component often renders a loading state first, fires a fetch, then renders the real content when the promise resolves, and your assertion has to land on the resolved state, not the spinner. Because the agent reads the accessibility tree (roles, accessible names, states) plus the DOM rather than CSS classes, it naturally targets that settled content. When you tell it to confirm "a saved cards list is visible," it looks for a list structure with card entries by their accessible names, not for a `.card-list` class that might be a skeleton placeholder, and the auto-wait holds until the real list mounts or the ceiling is hit.

Phrase assertions around what the user would see and read, with enough specificity that a spinner cannot satisfy them:

```markdown
# Project detail loads after route change

1. Go to {{base_url}}/projects
2. Click the project named "Apollo"
3. Confirm the project detail view shows the heading "Apollo"
4. Confirm a "Team members" section lists at least 3 names
5. Confirm a "Recent activity" feed shows at least one entry with a timestamp
```

Steps 4 and 5 are deliberately concrete. A loading skeleton has no names and no timestamps, so the agent keeps waiting (within the ceiling) until the fetched data renders. You are encoding the same judgment a human tester applies: an empty shell is not a loaded page. This is the practical face of testing user intent, covered in [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants).

### In-memory state and what a refresh destroys

SPAs keep state in memory: an auth token in a context, a filter selection in a store, a form's progress. Two things are worth testing, and the agent handles both as plain intent. First, that state persists across in-app route changes:

```markdown
# Filter state survives navigation

1. Go to {{base_url}}/orders
2. Set the status filter to "Shipped"
3. Confirm the orders list shows only shipped orders
4. Click an order to open its detail view
5. Click the browser back control
6. Confirm the status filter still reads "Shipped"
```

Second, and often the real bug, that a hard refresh restores state or fails gracefully rather than dumping the user on a broken screen. Navigate directly to a deep route and confirm the app rehydrates:

```markdown
# Deep link rehydrates

1. Go to {{base_url}}/orders/12345
2. Confirm the order detail for order 12345 is shown, not a 404 or a blank page
```

Direct navigation is exactly where client-routing apps tend to break in production (the server has to serve the SPA shell for unknown paths), and it is trivial to express as intent.

## Writing objectives that describe intent, not React internals

The biggest mistake porting a mental model from unit tests is reaching for implementation detail. The agent does not know or care that your route is a `<Route element={<BillingPage />}>` or that the tab uses `useNavigate`. It reads the page like a user, so write objectives the way you would describe the task to a new teammate.

Good objectives name visible, stable things: a tab's label, a heading's text, a button's accessible name, a count of items. Weak objectives name things the user never sees: component names, hook calls, route config, CSS classes, `data-testid` attributes.

| Instead of this (implementation) | Write this (intent) |
| --- | --- |
| Wait for `<BillingPage>` to mount | Confirm the "Billing" page heading is visible |
| Assert `route.pathname === '/billing'` | Confirm the Billing view is shown |
| Click `[data-testid="tab-2"]` | Click the "Invoices" tab |
| Check `.MuiSkeleton` is gone | Confirm the invoices table shows real rows |
| Verify Redux `cart.items.length` | Confirm the cart shows 2 items |

The intent column reads like acceptance criteria, so a product manager can review it and a new engineer can understand it without opening the source. That readability is part of the point: a `*_test.md` file doubles as living documentation of how the app is supposed to behave, an idea explored in [Markdown tests as living documentation](https://browserbash.com/blog/markdown-tests-living-documentation).

### Composing flows with @import and variables

Most SPA journeys begin authenticated, and you do not want to rewrite the login steps in every file. Factor the shared prefix into its own test and import it:

```markdown
# login_test.md
1. Go to {{base_url}}
2. Click "Sign in"
3. Enter {{user}} into the email field
4. Enter {{password}} into the password field
5. Click the "Log in" button
6. Confirm the dashboard heading "Overview" is visible
```

```markdown
# billing_routes_test.md
@import ./login_test.md

1. Click the "Billing" tab
2. Confirm the URL path is /dashboard/billing
3. Confirm the "Saved payment methods" section is visible
4. Add a new card with number {{card_number}}
5. Confirm the card ending in the last four digits appears in the list
```

The `{{password}}` and `{{card_number}}` values are supplied at runtime and masked in logs, so secrets never leak into CI output. The `@import` keeps each route-level test focused on the transition it exercises, while the login flow lives in one place.

## Running SPA route tests in CI

Client-routing tests earn their keep running on every deploy. The `--agent` flag emits NDJSON, one JSON event per line, and the process returns unambiguous exit codes: `0` passed, `1` failed, `2` error, `3` timeout. Your pipeline branches on the exit code and never parses English.

```bash
browserbash testmd run ./billing_routes_test.md \
  --agent --headless --record
```

The `--record` flag captures a webm video plus screenshots, so when a route transition fails in CI at 3 a.m. you can watch exactly what the agent saw: the spinner that never resolved, the blank screen after a deep-link refresh, the tab that went to the wrong view. A `Result.md` is written per run summarizing the verdict and steps. On the builtin engine you also get native Playwright traces for the trace viewer, the surface scripted Playwright users already know. Switch where the browser runs with `--provider local|cdp|browserbase|lambdatest|browserstack` without touching the test text, and opt into the free cloud dashboard with `--upload` (uploaded runs kept 15 days) or keep everything local with `browserbash dashboard`. The [features overview](https://browserbash.com/features) lays out the full set of flags.

## The honest limits: where AI struggles with SPA routing

I would be overselling if I left it there, so here is where this approach genuinely strains on SPA work.

Model capability is the hard ceiling. The agent's reliability on a long, multi-route journey is bounded by the reasoning ability of the model driving it. BrowserBash defaults to auto model resolution (Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free hosted models exist), and running fully local means nothing leaves your machine. But small local models of roughly 8B parameters and under get flaky on long flows: they lose track of which route they are on, declare a half-loaded page "done," or click the wrong tab. For a journey that threads through five or six route transitions, use a 70B-class local model (Qwen3, Llama 3.3) or a capable hosted model. Match the model to the difficulty of the journey.

Timing races are real. The 15-second auto-wait ceiling is generous, but a route that lazy-loads a large chunk on a cold cache can exceed it and produce a flaky fail that is about infrastructure, not your app. The fix is usually to assert on a concrete settled signal (a count, a specific label) rather than something a skeleton can fake, but a genuinely slow route can still trip the ceiling.

Distinguishing "still loading" from "actually empty" is hard, for the agent and for humans. A legitimately empty list (a new user with no orders) and a list that failed to load can look similar. If your empty state and loading state are visually ambiguous, write the assertion to disambiguate them (confirm an explicit "No orders yet" message versus confirming rows).

Non-determinism is inherent. The agent may take a slightly different but equally valid path on two runs when there are multiple ways to reach a route. For the verdict this rarely matters, but for an audit-grade flow that demands byte-identical behavior every run, a deterministic Playwright script is the better tool. The mature framing is not "AI replaces Playwright." It is: keep deterministic scripts for the stable, mission-critical spine, and use agent journeys for the broad, fast-changing long tail of route flows too expensive to script and maintain. Playwright remains excellent at what it does, and BrowserBash uses it under the hood for exactly that reason. You can go deeper through [BrowserBash learn](https://browserbash.com/learn).

## FAQ

### How does an AI agent know a React route transition finished?

It does not wait for a browser load event, because client-side routing never fires one. Instead it acts (clicks the link or tab), then re-reads the live DOM and accessibility tree to check whether the content it expects on the new route is present. Playwright's built-in auto-wait, with a 15-second ceiling, absorbs the time the new view takes to mount or a Suspense fallback to resolve, so you never write a manual sleep or a `waitForNavigation` call.

### How do I assert on a component that only mounts after navigation and a data fetch?

Phrase the assertion around settled, user-visible content with enough specificity that a loading skeleton cannot satisfy it. Ask the agent to confirm "a team members section lists at least 3 names" rather than "the section exists." Because the agent reads accessible roles and names instead of CSS classes, and the auto-wait holds until real content appears, it lands on the resolved state rather than the spinner, as long as your loaded and loading states are distinguishable.

### Can I test that in-memory SPA state survives a hard refresh?

Yes, and you should, because direct navigation to a deep route is where client-routing apps often break. Have the agent navigate straight to a deep URL like `/orders/12345` and confirm the order detail renders rather than a 404 or a blank page. You can also test that filter or form state persists across in-app route changes and a browser back action by expressing each step as plain intent in a `*_test.md` file.

### Should I replace my Playwright SPA tests with AI agents?

Not wholesale. Keep deterministic Playwright scripts for your mission-critical, rarely-changing spine, such as login and payment routes, where you want sub-second feedback and zero variance. Use AI agent journeys for the broad, frequently-changing long tail of route flows where selector maintenance would otherwise eat your week. Many teams run both and know which flow belongs in which bucket.

Ready to test your SPA's route transitions in plain English? Install the CLI with `npm install -g browserbash-cli`, write a one-line objective or a `*_test.md` file, and watch an agent navigate your app through every in-memory route change. It is free, open source (Apache-2.0), and runs locally with no account needed.
