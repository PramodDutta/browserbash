---
title: Managing Staging and Prod Test Environments With Variables
description: "Test multiple environments with one set of intent-based tests. Swap base URLs and credentials through variables and config to cover dev, staging, and prod."
date: 2026-06-27
category: guide
---

To test multiple environments with the same tests, keep the test intent fixed and move everything that changes between environments (the base URL, the credentials, a few feature toggles) into variables, then supply a different set of values per run. With [BrowserBash](https://browserbash.com), your `*_test.md` files describe what a person does in plain English, and a `{{baseUrl}}` placeholder plus a `Secrets:` block let you point the exact same test at dev, staging, or prod by changing nothing but the values you inject at run time. The test that logs in and checks the dashboard is written once. The environment is data, not code.

That is the whole trick, and the rest of this guide makes it concrete: how to structure the variables, how to keep credentials out of logs across three environments, how to share a login flow with `@import` so you are not maintaining it in four places, and the honest part about why running write-heavy tests against production is a trap you should design around rather than ignore.

## Why environment config belongs in variables, not in the test

A test encodes intent: open the login page, sign in, confirm the dashboard loads. None of that intent changes between staging and prod. What changes is the address and the keys. If you bake `https://staging.example.com` into the steps, you have welded the intent to one environment, and now you need a near-duplicate file to hit prod. Two files drift. One gets a new assertion the other never receives, and three sprints later your prod smoke test is quietly checking last quarter's UI.

The fix is the separation good config has always wanted: the test holds the behavior, variables hold the environment. In BrowserBash a test is a Markdown file (the `markdown-test-files-tutorial` linked below covers the format), with a `Variables:` block for plain values and a `Secrets:` block for sensitive ones. You reference them in steps with `{{name}}`, and substitution happens before the AI agent reads the step, so `Go to {{baseUrl}}/login` becomes a real URL at run time. Swap the value, hit a different environment, run the identical behavior.

Because BrowserBash tests are intent-based, this is more durable than the same pattern in a selector framework. The agent re-reads the live page each run and locates elements through the accessibility tree (roles, accessible names, states) plus the DOM, so a staging build with a slightly different button label or a reordered form does not break the run the way a hardcoded CSS selector would. The environment differences that usually multiply your maintenance (staging has a debug banner, prod has a cookie wall, dev autofills a field) are things the agent works around rather than things you encode. You vary the data, not the test.

## The env-per-run pattern

Start with a single test that is environment-agnostic. Everything that differs per environment is a `{{placeholder}}`.

```markdown
# Login and dashboard smoke

Variables:
- baseUrl: ${BASE_URL}
- username: ${APP_USERNAME}

Secrets:
- password: ${APP_PASSWORD}

Steps:
- Go to {{baseUrl}}/login
- Type {{username}} into the Username field
- Type the password into the Password field
- Click the Login button
- Verify the page shows the account dashboard with a "Welcome" heading
```

Notice there is no environment named anywhere in the file. `baseUrl`, `username`, and `password` all read from environment variables with the `${VAR}` syntax. The file is safe to commit to a public repo: it contains the names of variables, never a real host or a real credential. Which environment you hit is decided entirely by what you export when you run it.

Now keep a tiny `.env`-style snippet per environment, sourced from your secret store rather than committed. Dev:

```bash
BASE_URL=https://dev.example.com \
APP_USERNAME=dev_qa \
APP_PASSWORD="$DEV_QA_PASSWORD" \
browserbash testmd run ./login_test.md
```

Staging:

```bash
BASE_URL=https://staging.example.com \
APP_USERNAME=staging_qa \
APP_PASSWORD="$STAGING_QA_PASSWORD" \
browserbash testmd run ./login_test.md
```

Production (read-only, more on that below):

```bash
BASE_URL=https://app.example.com \
APP_USERNAME=prod_monitor \
APP_PASSWORD="$PROD_MONITOR_PASSWORD" \
browserbash testmd run ./login_test.md --headless
```

Same file, three environments, zero edits to the test. The variables are scoped to the single command, so the password never becomes a lingering `export` in your shell session, and because it lives in the `Secrets:` block it is masked as `*****` in every log line, in the per-run `Result.md`, and in any NDJSON the agent emits. The `automate-login-testing-across-environments` post linked at the end walks through this login-specific case in more depth.

### Keeping the per-environment values organized

A common pattern is one small script per environment that exports the right values and forwards to BrowserBash. A wrapper like `./run-env.sh staging ./login_test.md` that sets the three variables and calls `browserbash testmd run "$2"` keeps the matrix readable, and it gives you one obvious place to add a new environment. The point is not the wrapper; it is that the environment definition lives in exactly one spot, and the test never learns which environment it is in.

If you would rather drive a one-off objective than a file, the same variables flow through `browserbash run`:

```bash
BASE_URL=https://staging.example.com \
browserbash run "Open {{baseUrl}}/pricing and verify the page lists three plan tiers"
```

For the full menu of flags and providers, the [features page](https://browserbash.com/features) lays out what the runner exposes.

## Share the login flow with @import

Every authenticated test across every environment needs the same login. Copy-pasting those four login steps into a dozen files means a dozen places to fix when the flow changes, and a dozen places where the same secret gets re-declared. BrowserBash composes tests with `@import`, so you write the login once and pull it into any test that needs an authenticated session.

Put the reusable login in its own file, environment-agnostic exactly as before:

```markdown
# login_test.md

Variables:
- baseUrl: ${BASE_URL}
- username: ${APP_USERNAME}

Secrets:
- password: ${APP_PASSWORD}

Steps:
- Go to {{baseUrl}}/login
- Type {{username}} into the Username field
- Type the password into the Password field
- Click the Login button
- Verify a logout link is visible
```

Then import it at the top of a feature test:

```markdown
# checkout_test.md

@import ./login_test.md

Steps:
- Go to {{baseUrl}}/cart
- Verify the cart shows at least one item
- Click "Proceed to checkout"
- Verify the order summary page loads with a total amount
```

The imported file contributes its steps and its variable declarations, so `{{baseUrl}}` resolves the same way in the checkout steps as it does in the login steps. Run `checkout_test.md` against staging, and both the imported login and the checkout body hit staging, because they read the same `${BASE_URL}`. Change the login flow (a new consent checkbox, a relocated submit button) and you change it in one file; every importing test and every environment inherits the fix. The `browserbash-variables-and-secrets-tutorial` linked below goes deeper on how variable scoping interacts with imports.

This composition is what makes the env-per-run pattern scale past a single smoke test. Your whole authenticated suite shares one login definition and one set of environment variables, and adding a new environment is still just a new set of values.

## Prod-safe, read-only checks

Here is the honest part. Pointing the same test at production is technically a one-line change, and that is exactly why it is dangerous. The test that signs up a user and places an order is wonderful on staging and a liability on prod, where it creates a real account and a real order in your real database every time CI runs. Treat production as a place for read-only verification, and design your suite so the destructive tests cannot reach it by accident.

A few practical guardrails that have held up:

- **Split your tests by blast radius.** Keep a `smoke/` set of pure read checks (load the homepage, log in with a dedicated monitoring account, confirm the dashboard renders, check a public pricing page) and a separate `flows/` set that writes data. Only `smoke/` ever runs against prod. The `smoke-test-staging-before-deploy` guide linked below describes how to build that read-only set.

- **Use a dedicated, low-privilege prod account.** The `prod_monitor` user in the examples above should be able to log in and see its own dashboard and nothing else. No admin, no payment methods, no ability to mutate shared state. If a test misbehaves, the damage ceiling is one throwaway account looking at its own data.

- **Phrase prod steps as observations, not actions.** `Verify the page shows the account dashboard` is safe. `Add the premium plan to the cart and complete checkout` is not something prod should ever see. Because BrowserBash steps are literal English, the difference is visible in plain reading, which makes a prod test file easy to review for safety before it ships.

- **Let auto-wait absorb prod's slower, real-data pages.** Production often renders more slowly than a seeded staging box because it is serving real traffic and real data volumes. BrowserBash leans on Playwright's built-in auto-wait, up to a 15-second ceiling, with no manual sleeps, so a dashboard that takes a beat longer on prod is handled the same way a fast staging render is. You do not tune timeouts per environment.

- **Run prod checks headless and recorded.** Add `--headless` for CI and `--record` to capture a webm plus screenshots, so when a prod smoke check fails at 3 a.m. you have a video of exactly what the agent saw instead of a stack trace.

The mindset that matters: production tests answer "is the deployed thing alive and correct from a user's point of view," not "does the full purchase funnel work end to end." The funnel belongs to staging, where you can seed and tear down freely.

## Wiring it into CI across environments

The environment matrix maps cleanly onto a CI matrix. Each environment is a job that exports its own `BASE_URL` and credential variables (from the CI secret store) and runs the appropriate test set. BrowserBash is built for this: pass `--agent` to emit NDJSON for machine parsing, and read the exit code, which is `0` for pass, `1` for fail, `2` for error, and `3` for timeout. A staging job can run the full `flows/` suite and block the deploy on a non-zero exit; the prod job runs only `smoke/` after the deploy and pages you if it returns anything but `0`.

```bash
# staging gate, full flows
BASE_URL=$STAGING_URL APP_USERNAME=$STAGING_USER APP_PASSWORD=$STAGING_PASS \
  browserbash testmd run ./flows/checkout_test.md --headless --agent

# prod post-deploy, read-only smoke
BASE_URL=$PROD_URL APP_USERNAME=$PROD_MONITOR APP_PASSWORD=$PROD_MONITOR_PASS \
  browserbash testmd run ./smoke/dashboard_test.md --headless --agent --record
```

Each run writes a `Result.md` you can attach as a build artifact, and `--record` gives you the video when a check is red. If you want the runs collected in one place, `--upload` opts a run into the free cloud dashboard (runs are kept for 15 days), or `browserbash dashboard` serves a local dashboard with nothing leaving your machine. Which model drives the agent is up to you: the default `auto` resolution checks Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free hosted models exist there), so a local run leaks nothing off the box, and a hosted model is one env var away when you want more horsepower.

## A note on model choice for multi-environment runs

Environment-spanning suites tend to be longer flows: log in, navigate, verify several things. Small local models (roughly 8B and under) get flaky on long multi-step objectives, so if you run everything locally for privacy, a 70B-class model such as Qwen3 or Llama 3.3 is the dependable floor, and a hosted model is the pragmatic choice for the hardest flows. This matters more when you run the same test across three environments, because a model that wanders one time in ten will eventually wander on the environment you care about most.

## Honest limits

This pattern is good, not magical, and the rough edges are worth naming.

**Environments that differ in behavior, not just address, still need thought.** If staging has a feature flag on and prod has it off, the same test can legitimately reach different screens. Variables swap the URL and the credentials cleanly, but a genuine behavioral fork (a step that should run on staging and must not on prod) is something you handle by keeping separate test files or separate step sets, not by templating a single file into doing two contradictory things. Variables are for values, not for branching logic.

**The agent re-derives elements every run, which is resilient but not free.** Re-reading the live page on each step is what lets one test survive UI churn across environments, and it is deliberately not a cached, saved selector script. The cost is that a run does real perception work each time, so it is slower than replaying a recorded locator, and on a flow that genuinely renders differently between environments the agent may make a different choice on staging than on prod. That is usually correct, but it means runs are not bit-for-bit identical the way a brittle selector script is. Determinism and durability trade against each other here, and BrowserBash chooses durability.

**Prod safety is a discipline, not a setting.** Nothing in the tool stops you from pointing a destructive `flows/` test at your production `BASE_URL`. The guardrails above (split suites, low-privilege accounts, observation-only steps) are conventions you enforce, and a careless export can still aim a write-heavy test at prod. Review prod test files for safety the way you would review a database migration.

**Secret masking covers logs, not your secret store.** Marking a value secret masks it to `*****` in BrowserBash's own output. It does not manage where the value comes from. You are still responsible for getting `APP_PASSWORD` out of your CI secret store and into the environment safely; the tool protects the value once it has it, not before.

**Visual and timing differences between environments are not assertions you get for free.** "Verify the dashboard loads" checks that the page is there and correct in content. It does not catch that prod's hero image is 200ms slower or that a staging-only banner is misaligned. Those need explicit steps, and some pixel-level differences are genuinely hard to phrase as plain-English checks.

For a broader walkthrough of the building blocks (test files, variables, providers), the [learn section](https://browserbash.com/learn) is the place to start, and the linked posts below drill into each piece of this workflow.

## FAQ

### How do I run the same test against staging and prod?

Write the test once with `{{baseUrl}}` and credential placeholders, reading their values from environment variables in the `Variables:` and `Secrets:` blocks. Then run `browserbash testmd run ./test.md` with a different `BASE_URL` and credentials exported per environment. The test file never changes; only the injected values do. Scope the variables to the single command so they do not linger in your shell, and the secret stays masked as `*****` in all output. See [automate-login-testing-across-environments](https://browserbash.com/blog/automate-login-testing-across-environments) for the login-focused version of this.

### Where should environment URLs and credentials live?

Out of the test file. Put environment names of variables in the file (`${BASE_URL}`, `${APP_PASSWORD}`) and supply the real values from your CI secret store or a local environment per run. This keeps the test safe to commit, keeps real hosts and credentials out of version control, and makes adding a new environment a matter of providing a new set of values rather than editing tests. The [browserbash-variables-and-secrets-tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial) covers the variable and secret mechanics end to end.

### Is it safe to run tests against production?

Run only read-only checks against production: log in with a dedicated low-privilege account, confirm pages render, verify content, and never write data. Keep destructive flows (sign-ups, orders, deletions) on staging where you can seed and tear down. Split your suite so only the read-only set can reach prod, phrase prod steps as observations rather than actions, and review prod test files the way you would review a migration. The [smoke-test-staging-before-deploy](https://browserbash.com/blog/smoke-test-staging-before-deploy) guide shows how to build that read-only set.

### Can I share one login flow across all my environment tests?

Yes, with `@import`. Put the login steps and their variable declarations in `login_test.md`, then add `@import ./login_test.md` at the top of any feature test. The imported login reads the same `${BASE_URL}` and credentials as the rest of the test, so importing it once gives every environment the right login automatically. Change the flow in one file and every importing test inherits the fix. The [markdown-test-files-tutorial](https://browserbash.com/blog/markdown-test-files-tutorial) explains the full file format including imports.
