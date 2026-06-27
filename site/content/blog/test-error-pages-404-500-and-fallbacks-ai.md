---
title: Testing 404, 500, and Error Fallback Pages With an AI Agent
description: "Test 404 and 500 error pages with an AI agent: visit a bad route, assert the not-found copy, confirm nav still works, and verify graceful error fallbacks."
date: 2026-06-27
category: testing
---

To test 404 and 500 error pages with an AI agent, you point it at a bad route, tell it in plain English what the user should see, and let it read the rendered page the way a person would. With BrowserBash you write something like `browserbash run "go to /this-page-does-not-exist and confirm a not-found page appears with a link back to the home page that works"`. The agent loads the route, looks at the accessibility tree and DOM of whatever rendered, checks that the not-found copy is visible, clicks the home link, and confirms it lands somewhere real. No CSS selector for the error container, no hardcoded status-code assertion, no fixture HTML. You describe the user-visible outcome and the agent reads the page to confirm it. The same pattern covers 500 pages, error boundaries, and offline fallbacks: you assert on what the user sees, not on internal status codes the user never notices.

This post walks through testing each error surface concretely: a 404 not-found route, a 500 or server-error fallback, a client-side error boundary, and a graceful degradation state. It shows real `browserbash run` commands, reusable `*_test.md` files, the CI wiring, and an honest section on where an agent reading the page struggles with error states specifically.

## Why error pages are awkward to test the old way

Error pages are the part of an app that exists precisely for the moments when something is wrong, which is exactly when your normal test fixtures are not there to help. A 404 page only shows up on routes you did not build. A 500 page only shows up when the backend is unhappy. An error boundary only renders when a component throws. So the classic approach has two problems.

First, the markup is often an afterthought. Error templates get less design attention than the happy path, so their structure changes between framework upgrades, gets restyled, or moves from a custom component to a framework default and back. A test pinned to `.error-404 .message` breaks the moment someone swaps the template, even though the user-facing behavior (a clear message and a way out) is unchanged.

Second, the thing you actually care about is not a status code. A page can return HTTP 200 and still be a broken experience if it renders a blank white screen. A page can return 404 and be a perfectly good experience if it shows helpful copy and working navigation. Users do not read status codes. They read the page. Tests that assert only on `response.status === 404` miss the entire class of bugs where the status is right but the rendered page is wrong, or the status is wrong but the page looks fine.

An agent that reads the rendered page sidesteps both. It does not care which template produced the words "Page not found" as long as those words are visible to a user. It checks the lived experience, which is the thing your error pages exist to provide. For the deeper mechanics of how the agent turns "confirm a not-found page appears" into a pass or fail, see [how natural-language assertions work](https://browserbash.com/blog/natural-language-assertions-how-they-work).

## Testing a 404 not-found route

Start with the simplest case: a route that does not exist should render a not-found page, and the user should be able to get back to safety.

The one-liner:

```bash
browserbash run "navigate to https://staging.example.com/no-such-page-12345 \
  and confirm a 'page not found' message is visible, \
  then click the link back to the home page \
  and confirm the home page loads with its main navigation"
```

A few things are happening here that matter. The agent finds the not-found message by its visible text and role, not by a class name, so a redesign of the error template does not break the test. It then looks for a link back home by its accessible name (the link text or aria-label), clicks it, and confirms the destination actually rendered. That last step is the one teams forget: a 404 page with a broken "go home" link is still a dead end for the user, and asserting only that the message appeared would have passed it.

For something you run every release, move it into a Markdown test file so it reads like a spec and lives in version control:

```markdown
# 404 page shows helpful copy and a working way out

1. Go to {{base_url}}/this-route-does-not-exist
2. Confirm the page shows a clear "not found" message, not a blank screen
3. Confirm there is a visible link or button to return to the home page
4. Click that link
5. Confirm the home page loads and its primary navigation is visible
6. Confirm the URL is now the home page URL, not the bad route
```

Run it:

```bash
browserbash testmd run ./not_found_test.md
```

The `{{base_url}}` variable lets the same file run against local, staging, and production by passing the value at runtime. Step 2 is deliberately phrased as "not a blank screen" because that is the real failure mode: a misconfigured route that returns an empty body still technically loads, and you want the test to catch that the page has actual content. Because the agent reads the page rather than a status code, "not a blank screen" is something it can genuinely evaluate.

### Asserting the URL did not silently redirect

A subtle 404 bug is the silent redirect: a bad route quietly bounces the user to the home page instead of telling them the page does not exist. That looks fine to a naive test (the user ends up somewhere valid) but it hides broken links from everyone, including search crawlers. To catch it, assert on the intermediate state before any navigation:

```markdown
# Bad route stays on a not-found page, does not silently redirect

1. Go to {{base_url}}/old-deleted-article
2. Confirm the page clearly communicates the content was not found
3. Confirm the browser did not redirect to the home page or a generic landing page
4. Confirm the page offers a search box or links to help the user continue
```

Here you are testing an invariant ("a bad URL must announce itself, not paper over the problem"), which is exactly the kind of intent-level check that survives UI churn. More on that style of test in [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants).

## Testing a 500 or server-error fallback

A 500 page is harder to trigger on purpose, because by definition it shows up when the server breaks. You have a few honest options, and the test itself is the same once you can reach the page.

The most reliable approach is to have a route that deliberately errors in your staging or test build, gated behind an environment flag so it never ships to production. Many teams already keep a `/debug/throw` or `/__test/error` endpoint for exactly this. Point the agent at it:

```bash
browserbash run "navigate to https://staging.example.com/__test/server-error \
  and confirm a friendly error page is shown that tells the user something went wrong \
  on our end, offers a way to retry or go back, \
  and does not leak a raw stack trace or internal error details"
```

That last clause is the high-value one. The most common 500-page bug in real apps is not the absence of an error page, it is an error page that dumps a stack trace, a database error string, or an internal file path to the user. An agent reading the visible page can be asked directly to confirm that no raw technical error text is shown, which is awkward to express as a selector assertion but natural as an instruction.

As a `*_test.md` file:

```markdown
# Server error renders a safe, friendly fallback

1. Go to {{base_url}}/__test/server-error
2. Confirm the page tells the user something went wrong on the server side
3. Confirm the message is human-readable, not a raw stack trace or error code dump
4. Confirm there is a retry button or a link back to a working page
5. Confirm no internal details (file paths, SQL, environment variable names) are visible
6. Confirm the site header or branding is still present so the user knows where they are
```

Step 5 is worth keeping even though it reads like a security check, because a leaking 500 page is both a UX failure and an information-disclosure problem. The agent evaluates it the same way a careful human reviewer would: by reading what is on the screen.

### When you cannot trigger a real 500

If you genuinely cannot make the server return a 500 in your test environment, you can still test the fallback rendering by intercepting a key API call and forcing it to fail. The agent drives the browser; you control the network around it. Wire a proxy or use a build flag that makes one backend call return a 500, then ask the agent to confirm the UI degrades gracefully rather than hanging or showing a blank panel. Be honest in the test name that you are simulating the failure, so nobody mistakes it for a true end-to-end 500.

## Testing client-side error boundaries

Single-page apps fail differently. A component throws during render, and instead of a server status code you get a client-side error boundary (React, Vue, Svelte, and friends all have a version of this). The HTTP response was a clean 200; the breakage happened in the browser. This is the case where reading the rendered page is not just convenient, it is the only thing that works, because the network layer saw nothing wrong.

A typical setup: a route or a widget that you can push into a broken state, for instance a product page for an item whose data is malformed. The test:

```markdown
# Error boundary catches a thrown component and shows a fallback

1. Go to {{base_url}}/product/known-broken-fixture
2. Confirm the page does not show a blank white screen
3. Confirm an error-boundary fallback message is visible, like "Something went wrong"
4. Confirm the rest of the page chrome (header, footer, navigation) is still usable
5. Click the site logo or home link
6. Confirm navigation away from the broken view works and the app recovers
```

Step 4 captures the difference between a good and a bad error boundary. A boundary scoped too wide takes down the whole app when one widget fails. A boundary scoped well contains the damage to the broken section and leaves the rest navigable. The agent confirms that the header and navigation are still usable while the broken region shows its fallback, which is precisely the behavior you want and precisely what a status-code test cannot see.

Because the error boundary renders asynchronously after the failed component tries to mount, there can be a short flash of loading state before the fallback appears. You do not write a manual sleep for this. BrowserBash leans on Playwright's built-in auto-wait with a ceiling of 15 seconds, so the agent waits for the fallback content to actually be present before it judges the step. The same dynamic-content handling that covers spinners and lazy-loaded panels covers the delayed appearance of an error fallback; there is more on that in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## Testing graceful degradation and offline fallbacks

The last family is the soft failure: the app is up, but a dependency is down or slow, and a good app degrades gracefully instead of breaking. Think of a dashboard where the live-data widget cannot reach its service, or a page that should show a cached or empty state when an upstream API times out.

```markdown
# Dashboard degrades gracefully when a data widget cannot load

1. Go to {{base_url}}/dashboard?simulate=widget-timeout
2. Confirm the overall dashboard still renders and is navigable
3. Confirm the failing widget shows an inline "couldn't load, try again" state
4. Confirm the rest of the widgets that did load are visible and correct
5. Confirm a retry control is available on the failing widget
```

The win here is the same as everywhere else in this post: you are describing the visible outcome a user experiences, and the agent reads the page to confirm it. The agent locates the failing widget by its accessible name and the text of its error state, not by a brittle DOM path, and it confirms the surrounding widgets are intact. That is an assertion about the whole rendered experience, which is hard to express as a set of selector checks but trivial to express as an instruction.

## Wiring error-page tests into CI

Error-page tests earn their keep in CI, because regressions in error handling are exactly the kind of thing nobody notices manually until a real user hits a real bad route. The wiring follows the same shape as any BrowserBash CI run.

Use `--agent` to get machine-readable NDJSON on stdout, `--headless` because CI has no display, and `--record` so a failure leaves you a webm video and screenshots to look at. The exit code is the contract: `0` pass, `1` fail, `2` error, `3` timeout. A `Result.md` is written per run as a human-readable summary, and the per-step NDJSON is there for any dashboard or log aggregator you point it at.

A minimal GitHub Actions job:

```yaml
name: error-page-tests
on:
  pull_request:
  schedule:
    - cron: "0 7 * * *"   # also run daily, error routes rot quietly

jobs:
  error-pages:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      BASE_URL: https://staging.example.com
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g browserbash-cli

      - name: 404 not-found page
        run: |
          browserbash testmd run ./tests/not_found_test.md \
            --agent --headless --record \
            --var base_url=$BASE_URL

      - name: 500 server-error fallback
        run: |
          browserbash testmd run ./tests/server_error_test.md \
            --agent --headless --record \
            --var base_url=$BASE_URL

      - name: client-side error boundary
        run: |
          browserbash testmd run ./tests/error_boundary_test.md \
            --agent --headless --record \
            --var base_url=$BASE_URL

      - name: upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: error-page-evidence
          path: |
            **/Result.md
            **/*.webm
            **/*.png
```

Each step exits non-zero on a failed assertion, so the job goes red the moment a 404 page loses its home link or a 500 page starts leaking a stack trace. The `if: failure()` upload step hands you the recording and the `Result.md` for the exact run that broke, so you are debugging from evidence, not from a one-line "assertion failed."

If you want a step to gate the build on a specific error surface, read the exit code directly:

```bash
browserbash testmd run ./tests/server_error_test.md --agent --headless
status=$?
if [ "$status" -eq 1 ]; then
  echo "Server-error fallback regressed (failed assertion)" >&2
  exit 1
elif [ "$status" -eq 3 ]; then
  echo "Server-error test timed out, the error route may be hanging" >&2
  exit 1
fi
```

One honest note on integrations: BrowserBash emits the signal (exit code, NDJSON, `Result.md`, recordings) and you wire the rest alongside it. It does not natively post to Slack, open a Jira ticket, or update a status page. If you want a red 404 test to ping a channel, you add that step in your CI YAML reading the exit code, the same as any other check. For an opt-in hosted view of runs you can add `--upload` (free runs are kept 15 days), or run `browserbash dashboard` for a local dashboard. The mechanics of feeding the NDJSON stream to a watcher are covered in [agentic testing explained](https://browserbash.com/blog/agentic-testing-explained).

## Composing error tests with @import

Error checks tend to share setup. Many error pages only make sense to a logged-in user, or you want to confirm that hitting an error and recovering still leaves the user authenticated. The `@import` directive lets you compose a login flow into your error test without duplicating it:

```markdown
# Authenticated user hits a 404 and recovers without losing their session

@import ./login_test.md

1. Go to {{base_url}}/account/no-such-subpage
2. Confirm a not-found message is visible inside the account area
3. Confirm the account navigation sidebar is still present
4. Click "Dashboard" in the account navigation
5. Confirm the dashboard loads and the user is still logged in
```

Credentials referenced as `{{variables}}` are masked in logs, so a recording or NDJSON stream from this run will not leak the password even though the login ran. That keeps your error-recovery tests safe to upload or attach to a CI artifact.

## Honest limits: where an agent struggles on error pages

Error states are one of the areas where you should keep your expectations grounded, because they push on a few real weaknesses.

Triggering the real failure is your job, not the agent's. BrowserBash drives the browser and reads the page; it does not make your server return a 500 or force a component to throw. You have to provide the broken state, whether that is a gated test route, a forced API failure, or a malformed fixture. The agent tests the fallback once you can reach it, but reaching it reliably is on your infrastructure, and a flaky way of triggering the error makes a flaky test.

Distinguishing "intended error page" from "accidental broken page" is genuinely hard. An agent reading the page sees words and structure. If your real 500 page and an accidental blank-with-a-spinner look similar enough, the agent can be fooled in either direction. Phrase assertions around specific, intended copy ("tells the user something went wrong on our end") rather than vague checks ("an error appears"), so the agent has a concrete target that an accidental breakage would not match.

Status codes are not directly visible to the agent. The agent reads the rendered page, which is the point of this whole approach, but it means a page that returns the wrong HTTP status while rendering correct-looking content (a 200 on a not-found page, which hurts SEO) is not something the rendered-page check alone will catch. If the status code matters to you, assert it separately at the network or HTTP level; treat the agent's page-reading as complementary to, not a replacement for, a status-code check.

Small local models drift on multi-step error flows. Error-recovery tests often chain several steps (hit the error, read it, click recover, confirm recovery). Models at or under 8B parameters get flaky on longer flows like this, sometimes declaring success after the error appears without completing the recovery steps. For these chains, use a 70B-class local model (Qwen3, Llama 3.3) or a hosted model. With model resolution set to auto, BrowserBash resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (which has free models), and running local means nothing leaves the machine, which is appealing for staging environments behind a VPN.

Non-deterministic error copy is a trap you can set for yourself. If your error pages randomize their wording ("Oops!" vs "Something broke" vs a rotating set of apologies), an assertion on exact phrasing will be flaky for reasons that have nothing to do with a real regression. Assert on the stable intent (an error is communicated and a recovery path exists) rather than the exact words when the words are deliberately varied.

## FAQ

### How do I test a 404 page without writing a CSS selector for the error element?

You describe the user-visible outcome and let the agent read the page. Run `browserbash run "go to a non-existent route and confirm a not-found message is visible and the link home works"`, or put the same steps in a `*_test.md` file. The agent finds the message by its visible text and role and finds the home link by its accessible name, so the test does not break when the error template is restyled or swapped. It locates elements through the accessibility tree and DOM rather than CSS classes, which is what keeps the assertion stable across redesigns.

### Can the agent check that my 500 page does not leak a stack trace?

Yes, and it is one of the more valuable error checks you can write. Add a step like "confirm no raw stack trace, file paths, SQL, or internal error details are visible." Because the agent reads the rendered page the way a person would, it can confirm the absence of technical noise that a selector-based test would never think to look for. You do still need to be able to trigger the 500 (a gated test route or a forced API failure), since BrowserBash drives and reads the browser but does not break the server for you.

### How does this work for client-side error boundaries that return HTTP 200?

It works better here than anywhere else, because the network layer saw a clean 200 and only the browser knows something broke. Point the agent at a route or state that throws during render, then assert that a fallback message is visible, the page is not a blank white screen, and the surrounding navigation still works. The agent waits for the fallback to actually render (Playwright auto-wait, 15-second ceiling, no manual sleeps) before judging, so the brief loading flash before the boundary catches does not cause a false failure.

### Do I still need a separate status-code check?

If the HTTP status matters to you (for SEO, a not-found route really should return 404, not 200), then yes, keep a separate status-code assertion at the network or HTTP level. The agent reads the rendered page, which catches the large class of bugs where the page is broken regardless of status, but it does not directly inspect the status code. Treat the two as complementary: the agent confirms the experience is right, a status check confirms the protocol is right.

## Where to go next

Error pages are a small, high-leverage place to start with agent-driven testing, because the assertions are about visible experience and the markup churns enough to punish brittle selectors. Write one `not_found_test.md`, one `server_error_test.md`, and one `error_boundary_test.md`, wire them into the CI job above, and you have continuous coverage on the surfaces that only matter when something has already gone wrong.

BrowserBash is free and open source (Apache-2.0) from The Testing Academy. Install it with `npm install -g browserbash-cli`. See the [features overview](https://browserbash.com/features) for the full set of providers and flags, and the [learn section](https://browserbash.com/learn) for more end-to-end walkthroughs.
