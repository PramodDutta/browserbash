---
title: Save and Reuse Login Sessions With browserbash auth save
description: "Learn browserbash auth save login sessions: capture a storageState once, reuse it with --auth across run, testmd, and run-all, and avoid re-login flake."
date: 2026-07-15
category: tutorial
---

If you write end-to-end tests for anything behind a login wall, you already know the tax: every single test spends its first ten to thirty seconds typing a username, typing a password, clicking submit, and waiting for a redirect before the actual test even starts. Multiply that by a suite of forty tests and you are burning minutes of wall-clock time and, if you are driving an AI agent to do the typing, real model calls on a flow that never changes. `browserbash auth save` login sessions exist to remove that tax. You log in once, BrowserBash captures the resulting session, and every future run reuses it instead of repeating the same three clicks.

This is a walkthrough of the full auth workflow: saving a session, listing and deleting saved profiles, applying a saved session with `--auth`, wiring it into a testmd file's frontmatter, and the origin-coverage warning that saves you from a silent, confusing failure. I'll also cover where this fits in a CI pipeline and where it does not help at all.

## The Re-Login Tax: Why Every Test Logging In From Scratch Gets Expensive

BrowserBash gives every run a fresh browser context by default. That is a deliberate and correct default for isolation: no test should be able to see cookies or local storage left behind by a previous run. But it has a cost. If your product sits behind authentication, and most non-trivial products do, then "fresh context" also means "logged out." Every test objective that touches an authenticated page has to start by logging in.

For a handful of tests this is a rounding error. For a real suite it adds up in three separate ways. First, wall-clock time: a login form with an email, a password, an MFA skip, and a redirect to a dashboard easily eats fifteen to twenty seconds before your actual assertions start. In a suite of thirty authenticated tests running sequentially, that is ten-plus minutes spent doing nothing but re-establishing the same session over and over.

Second, if you are running on the `stagehand` engine or the `builtin` engine without a hot replay cache, an AI agent has to interpret "log in with these credentials" as a series of navigate/click/type actions every time. That is model calls, and model calls cost money and add latency, on a login flow that is identical run after run. BrowserBash's replay cache already helps here once a flow has been recorded once, but the cache is origin-pinned and tied to the exact objective text: change the test, and the login sequence inside it has to be re-learned.

Third, and this is the one that actually breaks CI: login flows are disproportionately flaky. CAPTCHAs, "verify it's you" email prompts, rate limiting on repeated logins from the same IP, session-limit errors when the same test account logs in from forty parallel shards at once. Every one of those failure modes is a login-page problem, not a problem with the feature you are actually trying to test. Re-running the login sequence in every single test is also re-running every single one of those failure modes in every single test.

Saved sessions attack all three problems at once by removing the login step from the test entirely. You do the login once, outside the test, and every test just starts already authenticated.

## How browserbash auth save Captures a Real Login Session

`browserbash auth save` is built on Playwright's `storageState`, the same mechanism Playwright itself uses for authenticated test setup. A storageState snapshot captures the cookies and local storage/session storage for the origins you visited during the save, which is enough for the vast majority of session-token and cookie-based auth schemes to survive into a brand-new browser context.

The command itself is simple:

```bash
browserbash auth save myapp --url https://app.example.com/login
```

This opens a real, visible browser window pointed at the URL you gave it. You log in exactly the way a human would: type your email, type your password, click through any MFA step your test account uses, wait for the redirect to land you on the authenticated page. Once you're logged in and looking at the page you'd expect a real session to land on, you press Enter in the terminal. BrowserBash captures the current storageState and writes it to a named profile, `myapp` in this example.

There's no scripting, no selectors to write, and nothing to record beyond the credentials themselves living wherever your normal login lives, whether that's a password manager, an env var you're typing by hand once, or a `{{variable}}` you paste into the password field. The point of `auth save` is that it happens once, interactively, and produces a reusable artifact.

## Walkthrough: Saving Your First Login Profile

Let's walk through the whole loop end to end for a fictional app with a standard email and password login.

Step one: save the session.

```bash
browserbash auth save staging-admin --url https://staging.example.com/login
```

The browser opens. You type the staging admin credentials into the form, click "Sign in," and watch it redirect to `/dashboard`. Once the dashboard renders, you switch back to the terminal and hit Enter. BrowserBash writes the `staging-admin` profile.

Step two: use it in a real test.

```bash
browserbash run "Open the billing settings page and verify the current plan is Pro" --auth staging-admin
```

Notice what's missing from that objective: there is no mention of logging in. The objective goes straight to the thing you actually want to verify, because the browser context BrowserBash spins up for this run is seeded with the storageState from `staging-admin` before the objective ever starts. The agent lands on billing settings already authenticated.

Step three: use it in a testmd suite. If you have a folder of tests that all assume an authenticated staging admin, you don't need to add `--auth` to every invocation manually if you're driving them through `run-all`:

```bash
browserbash run-all ./.browserbash/tests --auth staging-admin --junit out/junit.xml
```

Every test file in that directory gets the same seeded session before it starts. This is the pattern most teams land on: one saved profile per role (`staging-admin`, `staging-viewer`, `staging-billing-manager`) reused across dozens of test files.

### A Note on What "Logging In Once" Actually Buys You

It's worth being precise about what this removes and what it doesn't. It removes the login *steps* from your test's objective and from the agent's interpretation work. It does not remove the need to re-save the profile when the session itself expires, and it does not make your test immune to the app changing its login flow, because you're simply not exercising that flow anymore in the tests that use `--auth`. If you also want coverage of the login flow itself, keep at least one test that logs in the normal way without `--auth`, so a broken login page still gets caught somewhere in your suite.

## Managing Saved Sessions: List and Delete

Once you have more than one or two profiles, saved for different roles, different environments, or different test accounts, you need a way to see what you've got and clean up what you don't. BrowserBash's auth profiles are simple named files, and the `auth` subcommand family gives you the basic lifecycle operations to go with `save`: listing what's saved and deleting what's stale.

```bash
browserbash auth list
```

This surfaces the profiles you've saved by name, so you can confirm `staging-admin` exists before you reference it in a `--auth` flag, or check whether you already have a `prod-readonly` profile before saving a duplicate.

```bash
browserbash auth delete staging-admin
```

Delete a profile once it's stale, for example after rotating the test account's password, after the staging environment gets reset and every existing session token is invalidated, or simply because you renamed your role-based profiles and the old name is dead weight. A stale saved session isn't dangerous, but it is useless: the moment the underlying session token expires server-side, every test using that `--auth` profile will fail at the first authenticated page it tries to load, and the failure will look like a bug in your app rather than what it actually is, an expired cookie.

A practical habit: re-save (or delete and re-save) any long-lived profile on a schedule that matches your session's real expiry. If your app's sessions last 30 days, put a reminder on your calendar, not a cron job that guesses.

## Reusing a Session with --auth on run, testmd, and run-all

The `--auth <name>` flag works the same way across every command that spins up a browser session: `run`, `testmd run`, `run-all`, and `monitor`. That consistency matters because it means you can move a test between "run it once by hand" and "run it on a schedule" and "run it in CI" without changing how authentication is wired in.

```bash
# One-off run against a saved session
browserbash run "Check that the invoices tab shows at least 3 rows" --auth billing-viewer

# A single testmd file
browserbash testmd run ./.browserbash/tests/invoices_test.md --auth billing-viewer

# A whole suite, all seeded with the same session
browserbash run-all ./.browserbash/tests --auth billing-viewer --junit out/junit.xml

# A scheduled monitor, still authenticated, still alerting only on state changes
browserbash monitor "Verify the admin dashboard loads without errors" --auth staging-admin --every 10m --notify https://hooks.slack.com/services/XXX
```

Two things to flag here. First, `--auth` is a session-context flag, not a per-step instruction: it applies before the objective or test file starts, so the agent (or the deterministic Verify steps, if you're on testmd v2) never sees or reasons about the login itself. Second, because it composes cleanly with `--agent`, `--budget-usd`, `--shard`, and every other run-all flag, you can build a CI matrix where every shard is authenticated the same way without special-casing anything:

```bash
browserbash run-all ./.browserbash/tests --auth staging-admin --shard 2/4 --budget-usd 2.00
```

That command runs shard 2 of 4, all pre-authenticated as `staging-admin`, with a hard budget stop at two dollars of estimated model spend for that shard. Auth reuse and cost governance stack without any interaction effects, because seeding a session happens before the objective-driving loop starts spending anything.

## Wiring Auth Into testmd Files with the auth: Frontmatter

Passing `--auth` on the command line works, but it means every person or CI job that invokes a given test file has to remember to pass the right profile name. For test files that always need the same role, it's more reliable to bake that requirement into the file itself with `auth:` frontmatter:

```markdown
---
auth: staging-admin
---

# Verify billing plan shows Pro tier

- Open the billing settings page
- Verify 'Pro' text visible
- Verify 'Downgrade' button visible
```

Now `browserbash testmd run ./billing_test.md` on its own, with no `--auth` flag at all, will still seed the `staging-admin` session, because the requirement travels with the file. This is the same pattern testmd already uses for `@import` and `{{variables}}`: put the thing that shouldn't vary run to run into the file, keep the command line for the things that should.

If you're on testmd v2 (`version: 2` frontmatter), the same `auth:` field works alongside API steps and Verify steps. A common v2 pattern is to authenticate once via `auth:`, seed some server-side state with an API step, then check it through the UI with a deterministic Verify:

```markdown
---
version: 2
auth: staging-admin
---

# Confirm a newly created invoice appears in the UI

1. POST https://api.staging.example.com/invoices with body {"amount": 4200, "customer": "acme-co"}
2. Expect status 201, store $.id as 'invoiceId'
3. Open the invoices list page
4. Verify text visible '{{invoiceId}}'
```

Notice that the API step in line 1 and 2 doesn't need the saved browser session at all, it's a plain HTTP call. The `auth:` frontmatter matters for step 3 onward, where the browser needs to load an authenticated page. Because testmd v2 currently drives the builtin engine, this specific combination needs `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway configured; that's a testmd v2 constraint, not an auth one, and it's worth knowing before you build a whole suite around it.

## The Origin-Coverage Warning: What It Means and Why It Matters

Here's the failure mode that saved sessions exist to prevent you from hitting silently: you save a profile against `https://app.example.com`, but the test you run it against actually starts on `https://admin.example.com`, a different subdomain, or worse, an entirely different domain that your app federates auth to. Cookies and storage captured for one origin do not automatically apply to another; that's how browsers work, and it's also how they should work from a security standpoint.

Playwright's storageState format records which origins it has state for. BrowserBash checks the target start URL of a run against the origins covered by the `--auth` profile you passed. If the origins don't overlap, instead of quietly proceeding with an unauthenticated context and leaving you to figure out why every downstream step is behaving like a logged-out user, BrowserBash prints a warning telling you the saved profile doesn't cover the origin you're about to hit.

This matters more than it sounds like on first read. The alternative to a warning is a confusing failure: your test objective says "verify the dashboard shows the user's name," the agent lands on a login page instead, and if it's not explicitly told to expect that, it may try to guess its way through a login form with no credentials, burn a chunk of its step budget, and fail with a vague timeout rather than a clear "this session doesn't apply here" message. The origin-coverage warning turns a confusing 15-minute debugging session into something you see immediately, at the point where the mismatch actually happened.

Practically, this means multi-domain apps need multiple saved profiles, one per origin that hosts an authenticated surface you test against. An app with `app.example.com` for the main product and a separate `admin.example.com` for internal tooling needs two profiles even if the same login credentials happen to work on both, because the origins where the resulting cookies live are different.

## Auth Save in Practice: Monitor Mode and CI Suites

Saved sessions pull the most weight in two places: long-running monitors and CI suites that run the same authenticated checks repeatedly.

For monitor mode, `browserbash monitor` combined with `--auth` is close to the intended use case for synthetic uptime-style checks on an authenticated surface, like "does the logged-in dashboard still render without an error banner every ten minutes":

```bash
browserbash monitor "Open the dashboard and verify no error banner is visible" --auth prod-readonly --every 10m --notify https://hooks.slack.com/services/XXX
```

Monitor mode already alerts only on pass/fail state changes, not on every green run, and the replay cache makes an always-on monitor nearly token-free once the flow has been learned once. Reusing a saved session on top of that means the monitor also isn't spending any of its cycles re-logging-in every ten minutes, which matters if the login page itself is rate-limited or if repeated logins from a monitoring account would otherwise look suspicious to your own app's fraud detection.

For CI, the pattern is usually: save the profile once, interactively, on a developer machine or in a controlled setup step, then reference it by name in every job. If you're using the [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), the same `--auth` flag and `auth:` frontmatter both work unchanged, since the Action is just running the CLI under the hood. What you do need to think about is where the saved profile file itself lives in CI: it has to be present on the runner before the job starts, whether that's committed as a controlled artifact for a low-stakes staging account, restored from a secrets-backed cache step, or re-saved fresh at the start of a scheduled job using credentials pulled from your secret store.

## What's Actually Inside a Saved Profile (and What Isn't)

A saved profile is a Playwright storageState capture: cookies and local/session storage for the origins visited during the save. That's genuinely powerful for the common case, session-cookie and token-based auth, which covers most web apps, but it's worth being honest about what it doesn't do.

It doesn't capture anything that lives outside browser storage, so auth schemes that depend on a hardware key touch, a rotating TOTP code checked server-side per request, or a short-lived token refreshed via a background JS timer that your capture window didn't happen to run long enough to see, may not survive cleanly into a new context. It also doesn't magically extend a session's server-side lifetime: if your backend expires sessions after an hour of inactivity, a saved profile from yesterday is dead weight today, regardless of what BrowserBash thinks it captured. And it's scoped to the origins it saw, which is exactly what the origin-coverage warning above is there to catch.

None of this makes saved sessions unreliable for their actual job. It just means "save once, use forever" isn't quite the right mental model. "Save once, use until the session naturally expires, then save again" is closer to the truth, and for most staging and test environments, that's a re-save every few days to weeks, not every run.

## When to Use Saved Sessions vs Logging In Every Time

| Situation | Better fit |
|---|---|
| Suite has 10+ tests that all need the same authenticated role | Saved session with `--auth` |
| You want explicit coverage of the login flow itself | At least one test that logs in fresh, no `--auth` |
| Scheduled monitor checking an authenticated page every few minutes | Saved session, strongly |
| App uses hardware-key MFA or per-request TOTP validation | Login flow may not survive a saved session; test it manually or adapt |
| Multi-domain app (main site + separate admin subdomain) | One saved profile per origin, watch for the coverage warning |
| One-off exploratory run against a throwaway environment | Not worth saving a profile for a single use |
| CI suite where the test account's session expires faster than your CI cadence | Re-save on a schedule that matches expiry, or save fresh at job start |

The short version: if you're running the same authenticated check more than a couple of times, `--auth` pays for itself almost immediately in both time saved and flake avoided. If you're running something once, or if the thing you actually care about testing is the login page itself, skip it and log in fresh.

## FAQ

### How do I save a login session with browserbash?

Run `browserbash auth save <name> --url <login-url>`. A real browser window opens at that URL, you log in the normal way, and once you're looking at the authenticated page you'd expect, press Enter in the terminal to capture and save the session under the name you chose.

### Does browserbash auth save store my password?

No. It captures the resulting session state, cookies and local/session storage from the origins you visited, using Playwright's storageState format. It doesn't record your credentials, keystrokes, or the login form fields themselves; you type your password directly into the browser during the save, and only the outcome of that login is saved.

### Why did I get an origin-coverage warning when using --auth?

The warning means the saved profile's captured origins don't cover the URL your run or test actually starts on, for example a profile saved against `app.example.com` used on a test that starts at `admin.example.com`. Save a separate profile against the origin the test actually hits, and pass the matching profile name to `--auth`.

### Can I use a saved auth session in CI and in scheduled monitors?

Yes. The `--auth <name>` flag and the `auth:` testmd frontmatter both work identically across `run`, `testmd run`, `run-all`, and `monitor`, so the same saved profile can back a one-off local run, a CI suite via [the official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), and a `browserbash monitor --every 10m` check, as long as the saved profile file is present wherever the command runs.

If you're maintaining a suite that sits behind a login, `browserbash auth save` is one of the fastest wins available: install with `npm install -g browserbash-cli`, save a profile against your staging login once, and point your existing tests at it with `--auth`. Check the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections for more walkthroughs, browse the [blog](https://browserbash.com/blog) for deeper dives, or [sign up](https://browserbash.com/sign-up) for the free cloud dashboard, an account is entirely optional and everything above works from the CLI alone.
