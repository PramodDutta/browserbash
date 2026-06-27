---
title: How to Test a Next.js App Router Site with an AI Browser CLI
description: "Test Next.js App Router sites by asserting on rendered text through the accessibility tree, letting Playwright auto-wait handle hydration and streaming."
date: 2026-06-27
category: guide
---

To test a Next.js App Router site with an AI browser CLI, you write intent-based tests that assert on the text a real user sees, then let the runner wait for that text to appear instead of pinning to selectors or `data-testid` hooks. With [BrowserBash](https://browserbash.com/features), a free open-source (Apache-2.0) command-line tool from The Testing Academy, you describe each step in plain English in a markdown `_test.md` file, and the agent finds elements through the accessibility tree (roles, accessible names, states) the same way a screen reader would. That single choice solves most of what makes App Router hard to test: server components that render on the server, Suspense boundaries that stream content in chunks, and client navigation where the next view hydrates a beat after the URL changes. You assert on meaning, the runner waits for meaning to render, and the test stays green through redesigns that would shatter a selector script.

This guide is for engineers who already run a Next.js App Router app and want a concrete, honest read on how an agent-based runner handles its rendering model. I will show real `_test.md` files, explain where Playwright's built-in auto-wait carries the load, and name where this approach genuinely struggles. No overselling.

## Why App Router breaks selector-based tests

The App Router changed when and where your markup exists. Three of its core behaviors are exactly the ones that punish brittle tests.

**Server components render on the server.** A React Server Component never ships its logic to the browser. By the time the page reaches the client, that part of the tree is already HTML. That is good for tests in one sense (the content is real text, not a loading skeleton you have to outwait), but the markup is whatever your component library emitted, and component libraries love to churn class names between minor versions. A test that keys on `.css-1q2w3e4` is one dependency bump from red.

**Suspense boundaries stream content in.** When you wrap a slow data fetch in `<Suspense>`, Next.js sends the surrounding shell immediately and streams the boundary's real content when the data resolves. The user sees a fallback, then the content swaps in. A naive test that grabs the DOM the instant the URL loads sees the fallback, asserts on it, and either fails or, worse, passes on the skeleton and misses a broken data layer.

**Client navigation hydrates late.** Click a `<Link>` and the App Router does a client-side transition. The URL updates right away, but the destination view's interactive bits hydrate slightly after the route resolves. Tap a button in that window and a selector script can click a node that is not wired up yet.

Every one of these is a timing-and-shape problem. Selector scripts are bad at both: they assume a fixed shape (the selector) and a fixed moment (now). Intent-based tests fix the shape problem by describing what the user sees, and a Playwright-backed runner fixes the timing problem by waiting for that thing to actually be there.

## The core idea: assert on rendered text, not markup

BrowserBash tests are intent, not selectors. You write a markdown file, give it a title, list steps as a bulleted or numbered list, and the agent works out how to satisfy each step against the live page. It does not parse your CSS. It builds a view of the page from the accessibility tree plus the DOM, the roles and accessible names a browser exposes to assistive tech, and finds the "Add to cart" button because it is a button named "Add to cart," not because it is `button.btn-primary[data-testid="add"]`. If you want the full mechanics, see [how BrowserBash finds elements through the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree).

That decoupling is the whole game for App Router. Your server components can re-emit their entire class structure, your design system can rename every token, and a test that says "confirm the page shows the heading Dashboard" keeps passing because the accessible heading named "Dashboard" is still there. You are testing the contract the user actually experiences.

Here is a first `_test.md` against a marketing home page rendered as a server component.

```markdown
# Home page renders and links work

1. Go to https://example.com
2. Confirm the page shows a heading that says "Build faster with us"
3. Confirm there is a link named "Get started"
4. Click the link named "Get started"
5. Confirm the URL is the sign-up page and the heading says "Create your account"
```

Run it with:

```bash
browserbash testmd run ./home_test.md
```

Nothing in that file names a CSS class, an element ID, or a `data-testid`. Every assertion is on something a user can perceive: a heading's text, a link's accessible name, the destination of a navigation. When your team refactors the home page's markup next quarter, this test does not care.

## Handling Suspense and streaming with auto-wait

This is where App Router and an agent runner fit together cleanly. BrowserBash uses Playwright's built-in auto-wait under the hood, with a 15 second ceiling and no manual sleeps. You never write `wait 3 seconds`, because hardcoded sleeps are the thing that makes suites both slow and flaky. Instead, when a step asserts that some text is present, the runner waits for that text to be actionable, up to the ceiling, and proceeds the moment it appears.

For a Suspense boundary, that behavior is exactly right. The fallback shows, the data resolves, the real content streams in, and your assertion resolves at the streamed content rather than the skeleton. You did not have to know how long the fetch takes. You asserted on the end state and the runner waited for the end state.

```markdown
# Dashboard streams in user data

1. Go to https://example.com/dashboard
2. Confirm the page shows a heading that says "Welcome back"
3. Confirm the page shows the text "Your recent orders"
4. Confirm a table row mentions "Order #1042" appears
```

Step 4 is the interesting one. If "Order #1042" lives behind a `<Suspense>` boundary that streams after an API call, the runner does not fail because it was not there on first paint. It waits for the row to render, then asserts. The same test works whether that data resolves in 80 milliseconds on a warm cache or 1.8 seconds on a cold one. (Those numbers are illustrative, not measured.) What you must not do is assert on the fallback. Write your assertion against the resolved content, the thing you actually care about, and let auto-wait bridge the gap.

One honest caveat: auto-wait is bounded. If a streamed boundary regularly takes longer than the ceiling on a slow CI machine, the step times out and the run exits with code 3. That is usually a real signal (your data layer is slow) rather than a test defect, but it is a constraint you should know before you point this at a heavy dashboard. For a deeper look at how the runner copes with content that arrives in pieces, see [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## Client navigation and the hydration window

App Router's client transitions are the other classic trap. The URL changes, the new view paints, and for a short window the interactive elements are not yet hydrated. A script that fires a click in that window can hit a dead node.

Because BrowserBash asserts on rendered, actionable state, a step like "click the button named Subscribe" waits for that button to be present and actionable before clicking. Playwright's actionability checks (visible, enabled, stable, receives events) are doing the work, which means the click lands after hydration wires the handler up, not before. You get the human behavior, wait until the thing is genuinely clickable, then click, without writing any of the waiting yourself.

```markdown
# Client navigation into settings stays interactive

1. Go to https://example.com/app
2. Click the link named "Settings"
3. Confirm the URL is the settings page
4. Confirm the page shows a heading that says "Account settings"
5. Toggle the switch named "Email notifications"
6. Confirm the switch named "Email notifications" is now on
```

Steps 5 and 6 only make sense after hydration; a toggle that is not wired up will not flip. By asserting on the resulting state (the switch reads as on), the test verifies that hydration actually completed and the handler ran, not merely that a styled element exists. That is a stronger guarantee than most selector scripts bother to make, and you got it for free by describing the outcome.

## Composing flows with @import and variables

Real App Router apps gate most routes behind auth, and you do not want to re-describe login in every file. BrowserBash supports `@import` composition and `{{variables}}` with secret masking in logs, so you write the login flow once and pull it into every test that needs a session.

```markdown
# login_test.md

# Log in as a test user

1. Go to https://example.com/login
2. Fill the field named "Email" with {{EMAIL}}
3. Fill the field named "Password" with {{PASSWORD}}
4. Click the button named "Sign in"
5. Confirm the page shows a heading that says "Dashboard"
```

Then a protected flow imports it:

```markdown
# Create a project after logging in

@import ./login_test.md

1. Click the link named "New project"
2. Fill the field named "Project name" with "Launch checklist"
3. Click the button named "Create"
4. Confirm the page shows the text "Launch checklist"
```

The `{{EMAIL}}` and `{{PASSWORD}}` values come from your environment or config, and their values are masked in the logs so credentials never leak into CI output. The import means a change to your login screen is a one-file edit, not a find-and-replace across the suite. For the full syntax of titles, steps, imports, and variables, the [markdown test files tutorial](https://browserbash.com/blog/markdown-test-files-tutorial) walks through every piece.

## Running an App Router suite in CI

Once your `_test.md` files exist, wiring them into CI is straightforward. The flags that matter for a Next.js pipeline:

```bash
browserbash testmd run ./tests/dashboard_test.md \
  --agent \
  --headless \
  --record
```

`--agent` emits NDJSON so a pipeline can parse each step as structured events. `--headless` runs without a visible browser, which is what you want on a CI runner. `--record` captures a webm video and screenshots so a failure leaves you something to watch instead of a bare stack trace. A `Result.md` is written per run with the verdict and step log.

Exit codes drive the gate: 0 is pass, 1 is fail, 2 is error, 3 is timeout. A non-zero exit fails the job, exactly like any other test runner. If you want a shared view across runs, `--upload` opt-ins to a cloud dashboard (free runs kept 15 days), or you can keep everything local with `browserbash dashboard`. Nothing is uploaded unless you ask for it.

For the model, the default `auto` resolution checks Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist there). On a local model, nothing leaves your machine, which matters if your staging environment is behind a VPN or your fixtures contain real-looking PII. One practical note: small local models (8B or under) get flaky on long multi-step flows, so for a full checkout-style App Router journey, reach for a 70B-class model (Qwen3, Llama 3.3) or a hosted model. A short smoke test is fine on something small.

You can also skip the file entirely for quick checks and pass an objective inline:

```bash
browserbash run "Go to example.com, confirm the home heading says Build faster, click Get started, and confirm the sign-up page loads" --headless
```

## A worked example: a streaming product page

Pull it together on a page that uses all three App Router behaviors at once: a server-rendered shell, a Suspense boundary streaming reviews, and a client-navigated "Add to cart" that updates a cart badge after hydration.

```markdown
# Product page: shell, streamed reviews, add to cart

1. Go to https://example.com/products/widget-pro
2. Confirm the page shows a heading that says "Widget Pro"
3. Confirm the page shows the text "In stock"
4. Confirm the section named "Customer reviews" shows at least one review
5. Click the button named "Add to cart"
6. Confirm the cart shows "1 item"
7. Click the link named "Cart"
8. Confirm the page shows the text "Widget Pro" in the cart
```

Step 2 reads the server-rendered heading immediately. Step 4 waits on the streamed reviews boundary without a sleep. Step 5 clicks an element that only works post-hydration, and step 6 confirms the hydration-driven cart update actually happened. Each assertion is on perceivable state, so the test survives a markup refactor of any one of those regions. The agent handles iframes and Shadow DOM too, which matters if your reviews widget or payment field is embedded, since it reads the accessibility tree across those boundaries rather than giving up at the frame edge.

## Honest limits

This approach is not magic, and App Router exposes a few of its rougher edges.

**Pixel-exact and layout assertions are not its strength.** If your test needs to verify that a server component renders at a specific width, that a font loaded, or that two elements align to the pixel, an accessibility-tree-driven agent is the wrong tool. It reasons about roles and text, not geometry. Pair it with a dedicated visual-regression pass for those checks; do not expect it to catch a CSS-only break that leaves the text unchanged.

**Streaming that exceeds the wait ceiling will time out.** The 15 second auto-wait ceiling is a feature for flake control and a constraint for genuinely slow boundaries. A dashboard that streams a heavy report after several seconds on a cold CI box can trip the timeout (exit code 3). Sometimes that is the bug you wanted to find. Sometimes it is just a slow fixture, and you will need to make the test environment faster or scope the assertion to content that resolves in time.

**Ambiguous accessible names confuse the agent.** App Router apps that ship three buttons all named "Submit," or icon-only controls with no accessible name, give the agent a genuinely hard disambiguation problem. The fix is the same fix that helps real screen-reader users: give your controls distinct, meaningful accessible names. Good accessibility and good testability are the same work here, which is a nice property but does mean a poorly labeled app is harder to test this way.

**Determinism is lower than a scripted flow.** An agent decides each action against the live page, so two runs can take slightly different paths to the same goal. For your mission-critical, runs-on-every-commit spine, a deterministic Playwright script with explicit assertions is still the better choice. Use intent-based agent tests for the broad, frequently-changing surface of an App Router app and keep tight scripts for the few flows where you want zero variance.

**Small local models stumble on long flows.** Covered above, but worth repeating as a limit: an 8B local model will get lost in a ten-step App Router journey. Match the model to the flow, and benchmark on your own pages rather than trusting any general claim, including this one. If you want to go deeper on the runner's strategy for content that loads progressively, the guide on testing [lazy-loaded and infinite-scroll pages](https://browserbash.com/blog/test-lazy-loaded-and-infinite-scroll-pages) covers patterns that map directly onto streamed App Router lists.

## FAQ

### Do I need data-testid attributes to test a Next.js App Router app?

No. That is the point of the approach. The agent finds elements through the accessibility tree (roles and accessible names) and the DOM, not through CSS classes or `data-testid` hooks. You can add test ids if you like, but tests written against rendered text and accessible names survive markup refactors that would break id-coupled scripts. The one thing that genuinely helps is giving your interactive elements clear, distinct accessible names, which improves real accessibility at the same time.

### How does it handle Suspense and streaming without flaky sleeps?

It relies on Playwright's built-in auto-wait with a 15 second ceiling and no manual sleeps. When a step asserts that some text or element is present, the runner waits for it to be actionable and proceeds the moment it appears. For a Suspense boundary, you assert on the resolved, streamed content rather than the fallback, and auto-wait bridges however long the data fetch takes. If a boundary regularly exceeds the ceiling, the step times out (exit code 3), which is usually a real signal that the data layer is slow.

### Does it work with server components that render only on the server?

Yes, and they are actually the easy case. A server component arrives as real HTML with real text, so there is no loading skeleton to outwait. The agent reads the rendered heading or paragraph directly. The only thing to avoid is keying tests to the class names a server component emits, since component libraries churn those between versions. Assert on the text and the accessible structure instead.

### Can I run this in CI against a Next.js preview deployment?

Yes. Point the `Go to` step (or the inline `browserbash run` objective) at your preview URL, run with `--agent --headless`, and gate on the exit code (0 pass, 1 fail, 2 error, 3 timeout). Use `--record` to capture a webm and screenshots for failures. Pick a 70B-class or hosted model for long flows, since small local models get flaky past a handful of steps. You can learn the full markdown and CLI workflow at [browserbash.com/learn](https://browserbash.com/learn).
