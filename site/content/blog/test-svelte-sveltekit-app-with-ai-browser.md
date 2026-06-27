---
title: How to Test a SvelteKit App With an AI Browser CLI
description: "Test a SvelteKit app in plain English: client-side routing, form actions, load functions, and stores-driven UI driven by an AI agent, no selectors."
date: 2026-06-27
category: testing
---

To test a SvelteKit app, you describe the user-visible outcome of each step in plain English and let an AI agent drive a real browser, reading the rendered page after every action instead of binding to CSS classes or waiting for a full reload that hydration and client-side routing make irrelevant. SvelteKit serves a server-rendered page, then hydrates it into a single-page app: routes change with `goto` and the History API, form actions submit and re-render in place, `load` functions fetch data before a view shows, and stores push reactive updates into the DOM without any navigation at all. The classic test signals (a fresh document per page, a load event, a server response you can hang an assertion on) mostly disappear after the first paint. An AI agent sidesteps this by checking what a human checks: did the heading appear, did the form show its success message, did the cart count tick up. With BrowserBash you write that as an objective like `browserbash run "go to /products, add the first item to the cart, and confirm the cart badge shows 1"`, and the agent waits for the reactive update, reads the live accessibility tree, and returns a verdict. No `waitForNavigation`, no guessing which generated `svelte-` class survived the last build.

This guide is for engineers and SDETs who build SvelteKit apps and want a clear-eyed look at how an AI agent handles hydration, client-side routing, form actions, `load` functions, and stores-driven UI. I will cover how to wait for transitions and reactive updates without manual sleeps, how to assert on content that mounts only after a `load`, how to test form actions, and how to phrase objectives around intent rather than Svelte internals. I will also be honest about where the approach struggles.

## Why SvelteKit breaks conventional test assumptions

A multi-page app gives a test runner clean seams. Click a link, the browser sends a request, the server returns a new HTML document, the page reloads, a load event fires, and your runner knows the navigation finished. You can hang assertions off that boundary.

SvelteKit erases the boundary after the first request. The initial page is server-rendered, then the client bundle hydrates it: Svelte attaches event handlers and reactive bindings to markup that already exists. From there the router intercepts link clicks, runs the `load` function, calls `history.pushState`, and swaps the page component in place. There is no second document, no reload, no load event for in-app navigation. Worse for a naive script, there is a window between server HTML arriving and hydration completing where the page looks done but is not interactive yet: click a button in that gap and nothing happens.

For a scripted test, this is a minefield. You cannot reliably wait for navigation, because in-app navigation never produces a browser-level navigation, so you wait for a specific selector instead, coupling the test to the exact markup Svelte compiled, including hashed class names that change between builds. The test passes until a cosmetic refactor it should not care about quietly breaks it. And the hydration gap produces the worst flake of all: a test that fails only when it runs fast enough to click before handlers attach.

An AI agent does not carry these assumptions. It never waited for a load event, and it never bound to a `svelte-1a2b3c` class. It works the way a person does: act, look at what is on screen, decide whether the goal is met. Hydration finishing, a route swapping, a store updating: those are just things that happen between "I acted" and "I read the page again." The reasoning behind that observe-and-decide loop is in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## How an AI agent waits for hydration and route transitions

The core trick is that the agent observes the live DOM after every action rather than blocking on a navigation primitive. BrowserBash's default engine, stagehand (MIT, from Browserbase), looks at the rendered page each step and decides the next action from what is on screen right then. The alternative builtin engine, an Anthropic tool-use loop, re-derives the target element on every action from a fresh snapshot and never caches a selector between runs. Neither keeps a saved selector script around: each run derives what it needs from live state, so a recompile that renames classes or a `pushState` swap is handled like any other DOM change, the distinction explored in [browser automation without selectors](https://browserbash.com/blog/browser-automation-without-selectors).

Under the hood, BrowserBash leans on Playwright's built-in auto-wait, with a 15-second ceiling and no manual sleeps. When the agent acts on the element it expects (say the "Checkout" button on a freshly routed page), Playwright waits for that element to be present and actionable. This is what absorbs the hydration gap: if the button is in the DOM but its handler has not attached yet, the action retries within the ceiling until the click actually does something. You never write `waitForTimeout` or poll for a hydration flag; you describe the destination and the agent confirms it arrived and responds.

Here is the simplest version, a one-shot objective:

```bash
browserbash run "From the home page, click the Blog link in the header, \
then confirm a list of post titles is shown and click the first one to open it"
```

The agent clicks the header link, SvelteKit runs the route's `load` and swaps the page component, and the agent looks for the post list, then opens the first post. If hydration or a lazy chunk is slow, the auto-wait covers it. If the route never resolves, the objective fails at the step where it stalled.

### Writing it as a reusable Markdown test

For anything you want to keep and rerun, write a `*_test.md` file. Tests in BrowserBash are intent expressed in Markdown: a `#` title, a list of steps (`-` or numbered), optional `@import` composition, and `{{variables}}` masked in logs when they hold secrets. A route-transition test for a SvelteKit dashboard looks like this:

```markdown
# Dashboard route transitions

1. Go to {{base_url}}
2. Log in as {{user}} with {{password}}
3. Confirm the dashboard heading "Overview" is visible
4. Click the "Billing" link in the left navigation
5. Confirm the URL path is /dashboard/billing
6. Confirm a "Saved payment methods" section is visible
7. Click the "Invoices" link
8. Confirm an invoices table with at least one row is shown
```

Run it with:

```bash
browserbash testmd run ./dashboard_routes_test.md
```

Each numbered step is an intent, not a located action. Step 4 says "click the Billing link," not "click `nav a.svelte-7x9k2:nth-child(2)`." The agent finds the Billing link by its accessible role and name, clicks, waits for the new view, then checks steps 5 and 6 against the freshly mounted DOM. Because the test references user-visible things (a link labelled "Billing," a section titled "Saved payment methods"), it survives the markup churn and hashed classes that would shatter a selector-based script.

## Testing SvelteKit form actions

Form actions are where SvelteKit's progressive enhancement gets interesting to test. A `<form method="POST" action="?/login">` works without JavaScript (a real POST, a re-rendered page); with `use:enhance` it upgrades to a background fetch that patches the page in place, surfacing validation errors or success from the action's return value. You want to test both the happy path and the validation path, with assertions that do not care which mechanism fired.

Express it as intent and the agent does not need to know whether enhancement kicked in:

```markdown
# Login form action

1. Go to {{base_url}}/login
2. Enter {{user}} into the email field
3. Enter {{password}} into the password field
4. Click the "Sign in" button
5. Confirm the page shows the dashboard heading "Overview"
```

For the validation path, you are testing that the action returns a `fail(...)` and the page renders the error the user should see:

```markdown
# Login validation errors

1. Go to {{base_url}}/login
2. Enter "not-an-email" into the email field
3. Leave the password field empty
4. Click the "Sign in" button
5. Confirm an inline error reading "Enter a valid email address" is shown
6. Confirm an inline error about the password being required is shown
7. Confirm the page is still the login page, not the dashboard
```

Step 5 and 6 target the user-visible error text that your action returned and the template rendered. Because the agent reads the accessibility tree (roles, accessible names, states) plus the DOM rather than CSS classes, it finds the error message by its text and association with the field, not by a `.error-text` class that a refactor might rename. Step 7 guards against a false pass where a broken form silently navigated anyway. This is testing user intent rather than the wiring underneath, which is the core idea in [agentic testing explained](https://browserbash.com/blog/agentic-testing-explained).

### Multi-field forms and secret masking

For a signup or checkout form with many fields, keep each step a plain instruction and pass sensitive values as variables:

```markdown
# Signup form action

1. Go to {{base_url}}/signup
2. Enter {{full_name}} into the "Full name" field
3. Enter {{email}} into the email field
4. Enter {{password}} into the password field
5. Enter {{password}} into the "Confirm password" field
6. Check the "I agree to the terms" checkbox
7. Click the "Create account" button
8. Confirm a "Welcome, {{full_name}}" message is shown
```

The `{{password}}` value is supplied at runtime and masked in logs, so the secret never lands in CI output. The agent fills each field by its visible label, so a designer reordering the form or swapping the input markup does not break the test.

## Asserting on load functions and data-driven views

The harder half of SvelteKit testing is not the navigation, it is asserting on content that only exists after a `load` function resolves. A universal `load` runs on the server for the first hit and on the client for in-app navigations; a client-only `load` may fetch after mount. Either way your assertion has to land on the loaded content, not an intermediate state, and an `{#await}` block or a loading indicator can sit in between.

Phrase assertions around settled, user-visible content with enough specificity that a loading state cannot satisfy them:

```markdown
# Product detail loads after route change

1. Go to {{base_url}}/products
2. Click the product named "Trail Runner 2"
3. Confirm the product detail view shows the heading "Trail Runner 2"
4. Confirm a price is shown in the format like $129.00
5. Confirm a "Add to cart" button is enabled
6. Confirm a reviews section lists at least one review with a star rating
```

Steps 4 through 6 are deliberately concrete. A loading skeleton has no price, no enabled button, and no reviews, so the agent keeps waiting (within the 15-second ceiling) until the `load` resolves and the data renders. You are encoding the same judgment a human tester applies: an empty shell is not a loaded page.

Two SvelteKit-specific cases are worth testing directly. First, a deep link, which forces the server-side `load` path and confirms the page renders for a cold direct hit, not just for in-app navigation:

```markdown
# Deep link renders server-side

1. Go to {{base_url}}/products/trail-runner-2
2. Confirm the product detail for "Trail Runner 2" is shown, not a 404 or blank page
3. Confirm the price and an "Add to cart" button are visible
```

Direct navigation is exactly where client-routing apps tend to break in production, the same failure mode covered for React in [testing a React SPA with client-side routing](https://browserbash.com/blog/test-react-spa-client-routing-with-ai), and it is trivial to express as intent. Second, the SvelteKit error boundary, which renders `+error.svelte` when a `load` throws. Confirm a genuinely missing resource produces your error page, not a white screen:

```markdown
# Missing product shows error page

1. Go to {{base_url}}/products/does-not-exist
2. Confirm an error page with the message "Product not found" is shown
3. Confirm a link back to "All products" is present
```

## Testing stores-driven reactive UI

Svelte stores are where the DOM updates with no navigation at all. A writable store (a cart, a theme toggle, a notification count) changes and every subscribed piece of UI re-renders reactively. There is no URL change and no `load`, just a value flowing into the DOM. An AI agent handles this exactly like any other DOM update: it acts, then re-reads the page, so a reactive change is visible the same way a route swap is.

```markdown
# Cart store updates reactively

1. Go to {{base_url}}/products
2. Confirm the cart badge in the header shows 0 or no count
3. Click "Add to cart" on the first product
4. Confirm the cart badge in the header shows 1
5. Click "Add to cart" on the second product
6. Confirm the cart badge shows 2
7. Open the cart
8. Confirm the cart lists 2 items with a subtotal
```

The badge count is driven entirely by the store, with no page transition. The agent confirms the count after each add by re-reading the header. Because it targets the badge by its role and accessible name and the number it displays, not a `.cart-count` class, a restyle of the badge does not break the test. The same one-line intent style tests a persisted store: toggle dark mode, reload, and confirm the page is still dark, which checks that the store value was saved to `localStorage` and rehydrated, behavior scripted tests get verbose about.

### Writing objectives that describe intent, not Svelte internals

The biggest mistake when porting a unit-test mental model is reaching for implementation detail. The agent does not know or care that your route is `+page.svelte`, that the cart is a `writable`, or that the form uses `use:enhance`. It reads the page like a user, so write objectives the way you would describe the task to a new teammate.

| Instead of this (implementation) | Write this (intent) |
| --- | --- |
| Wait for `+page.svelte` to hydrate | Confirm the "Billing" page heading is visible |
| Assert `$page.url.pathname === '/billing'` | Confirm the URL path is /billing |
| Click `.svelte-7x9k2 button` | Click the "Add to cart" button |
| Read the `cart` store length | Confirm the cart badge shows 2 |
| Check the `?/login` action returned `fail` | Confirm an inline "Enter a valid email" error is shown |

The intent column reads like acceptance criteria, so a product manager can review it and a new engineer can understand it without opening the source. A `*_test.md` file doubles as living documentation of how the app is supposed to behave.

### Composing flows with @import and variables

Most SvelteKit journeys begin authenticated, and you do not want to rewrite login in every file. Factor the shared prefix into its own test and import it:

```markdown
# login_test.md
1. Go to {{base_url}}/login
2. Enter {{user}} into the email field
3. Enter {{password}} into the password field
4. Click the "Sign in" button
5. Confirm the dashboard heading "Overview" is visible
```

```markdown
# billing_routes_test.md
@import ./login_test.md

1. Click the "Billing" link
2. Confirm the URL path is /dashboard/billing
3. Confirm the "Saved payment methods" section is visible
4. Add a new card with number {{card_number}}
5. Confirm the card ending in the last four digits appears in the list
```

The `{{password}}` and `{{card_number}}` values are supplied at runtime and masked in logs, so secrets never leak into CI output. The `@import` keeps each route-level test focused on the transition it exercises, while the login flow lives in one place.

## Running SvelteKit tests in CI

SvelteKit tests earn their keep running on every deploy. The `--agent` flag emits NDJSON, one JSON event per line, and the process returns unambiguous exit codes: `0` passed, `1` failed, `2` error, `3` timeout. Your pipeline branches on the exit code and never parses English.

```bash
browserbash testmd run ./billing_routes_test.md \
  --agent --headless --record
```

The `--record` flag captures a webm video plus screenshots, so when a form action fails in CI at 3 a.m. you can watch exactly what the agent saw: the validation error that never rendered, the blank screen after a deep-link `load` threw, the cart badge that stuck at zero because the store did not update. A `Result.md` is written per run summarizing the verdict and each step. On the builtin engine you also get native Playwright traces for the trace viewer, the surface scripted Playwright users already know.

A minimal GitHub Actions step that fails the build when the agent fails:

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli
      - run: |
          browserbash testmd run ./tests/billing_routes_test.md \
            --agent --headless --record
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          base_url: ${{ secrets.STAGING_URL }}
          user: ${{ secrets.TEST_USER }}
          password: ${{ secrets.TEST_PASSWORD }}
```

Because BrowserBash returns exit code `1` on a failed assertion, the `run` step fails the job with no extra glue: the shell propagates the non-zero code. Be clear-eyed about the boundary here: BrowserBash emits the signal (the exit code, the NDJSON stream, the `Result.md`, the recorded artifacts), and you wire whatever integration consumes it. It does not natively post to Slack or open a Jira ticket. If you want a Slack ping on failure, you read the exit code in a following step and call your webhook yourself:

```yaml
      - name: Notify on failure
        if: failure()
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"SvelteKit e2e failed on '"$GITHUB_SHA"'"}' \
            "${{ secrets.SLACK_WEBHOOK }}"
```

Switch where the browser runs with `--provider local|cdp|browserbase|lambdatest|browserstack` without touching the test text, and opt into the free cloud dashboard with `--upload` (uploaded runs kept 15 days) or keep everything local with `browserbash dashboard`. The [features overview](https://browserbash.com/features) lays out the full set of flags.

## The honest limits: where AI struggles with SvelteKit testing

I would be overselling if I left it there, so here is where this approach genuinely strains on SvelteKit work.

Model capability is the hard ceiling. The agent's reliability on a long, multi-step journey is bounded by the reasoning ability of the model driving it. BrowserBash defaults to auto model resolution (Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free hosted models exist), and running fully local means nothing leaves your machine. But small local models of roughly 8B parameters and under get flaky on long flows: they lose track of which route they are on, declare a half-loaded page "done," or click the wrong link. For a journey that threads through a login, several route transitions, a form action, and a stores-driven assertion, use a 70B-class local model (Qwen3, Llama 3.3) or a capable hosted model. Match the model to the difficulty of the journey.

Timing races are real. The 15-second auto-wait ceiling is generous and usually covers the hydration gap, but a route whose `load` calls a slow upstream API on a cold cache can exceed it and produce a flaky fail that is about infrastructure, not your app. The fix is usually to assert on a concrete settled signal (a price, a specific label, a row count) rather than something a skeleton can fake, but a genuinely slow `load` can still trip the ceiling.

Distinguishing "still loading" from "actually empty" is hard, for the agent and for humans. A legitimately empty list (a new user with no orders) and a list whose `load` failed can look similar. If your empty state and loading state are visually ambiguous, write the assertion to disambiguate them: confirm an explicit "No orders yet" message versus confirming rows.

The pre-hydration interactive gap can still bite. The auto-wait absorbs most of it, but if a button is visible and clickable in the DOM before its Svelte handler attaches, an early action can register as a no-op and the agent may need a retry, occasionally surfacing as intermittent slowness rather than a clean failure. Asserting on the post-action result (not just that you clicked) lets the agent notice the no-op and try again within the ceiling.

Non-determinism is inherent. The agent may take a slightly different but equally valid path on two runs when there are multiple ways to reach a goal. For the verdict this rarely matters, but for an audit-grade flow that demands byte-identical behavior every run, a deterministic Playwright script is the better tool. The mature framing is not "AI replaces Playwright." It is: keep deterministic scripts for the stable, mission-critical spine (login, payment), and use agent journeys for the broad, fast-changing long tail of flows too expensive to script and maintain. Playwright remains excellent at what it does, and BrowserBash uses it under the hood for exactly that reason. You can go deeper through [BrowserBash learn](https://browserbash.com/learn).

## FAQ

### How does an AI agent know a SvelteKit route transition or hydration finished?

It does not wait for a browser load event, because in-app navigation and hydration never fire one for the agent to catch. Instead it acts (clicks the link), then re-reads the live DOM and accessibility tree to check whether the content it expects on the new route is present and interactive. Playwright's built-in auto-wait, with a 15-second ceiling, absorbs the time the page component takes to mount, a `load` to resolve, or handlers to attach during hydration, so you never write a manual sleep or a `waitForNavigation` call.

### Can I test SvelteKit form actions, including validation errors?

Yes. Write each step as plain intent: fill the fields by their visible labels, click the submit button, then confirm the user-visible outcome. For the happy path that is a success message or a navigation to the next page. For validation, confirm the specific inline error text your action returned via `fail(...)` and rendered, and add a step confirming the page did not navigate. The agent finds the error by its text and field association, not a CSS class, so it works whether or not `use:enhance` upgraded the form to a background fetch.

### How do I assert on content that only appears after a load function resolves?

Phrase the assertion around settled, user-visible content with enough specificity that a loading state cannot satisfy it. Ask the agent to confirm "a price is shown" and "a reviews section lists at least one review" rather than "the page exists." Because the agent reads accessible roles and names instead of CSS classes, and the auto-wait holds until real content appears, it lands on the resolved state rather than an `{#await}` placeholder, as long as your loaded and loading states are distinguishable.

### Should I replace my Playwright SvelteKit tests with AI agents?

Not wholesale. Keep deterministic Playwright scripts for your mission-critical, rarely-changing spine, such as login and payment routes, where you want sub-second feedback and zero variance. Use AI agent journeys for the broad, frequently-changing long tail of route flows, form actions, and stores-driven UI where selector maintenance and hashed class names would otherwise eat your week. Many teams run both and know which flow belongs in which bucket.

Ready to test your SvelteKit app in plain English? Install the CLI with `npm install -g browserbash-cli`, write a one-line objective or a `*_test.md` file, and watch an agent navigate your app through hydration, route changes, form actions, and reactive store updates. It is free, open source (Apache-2.0), and runs locally with no account needed.
