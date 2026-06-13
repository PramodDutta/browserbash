---
title: Testing Login Flows With AI (and Keeping Secrets Safe)
description: "AI login flow testing in plain English with BrowserBash. Drive a real browser, assert the result, and mask passwords as ***** with secret variables."
date: 2026-06-13
category: use-case
---

The login form is the most-tested and most-neglected screen in your product. Every user crosses it, every session depends on it, and yet the test that guards it is usually the flakiest thing in the suite — a wall of selectors pinned to a `data-testid` that a redesign quietly renamed last sprint. This post is about a different way to do AI login flow testing: you write the login journey as plain English, an AI agent drives a real Chrome browser to carry it out and judge whether it worked, and — critically — your password never appears in a single log line. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command here is real and runnable.

Two problems have to be solved together. The first is resilience: a login test that breaks every time the markup shifts is worse than no test, because it trains your team to ignore red. The second is secret hygiene: a login test types a credential, and credentials leak into shell history, CI logs, and archived transcripts that outlive the run by months. BrowserBash addresses both — intent-based steps for the first, secret-marked variables for the second — and this guide walks through how.

## Why login tests rot faster than anything else

Authentication UIs are a moving target. They accumulate features other screens never do: a "remember me" checkbox, social-login buttons, a CAPTCHA that appears under load, an SSO redirect, a two-step prompt, a cookie banner stacked on top. Each is a chance for a selector to drift. And because the login step is the *prerequisite* for nearly every other end-to-end test you own, one broken locator in the login helper turns your whole journey suite red at once. The failure is loud, the cause is cosmetic, and the debugging is a scavenger hunt through the DOM.

Selector-based frameworks manage this with page objects and centralized locators, which helps — you fix the login in one file instead of twelve. But you are still maintaining a hardcoded map of the page, and the map goes stale every time the territory changes. The deeper issue is that the test encodes *how* to find the username field rather than *what* logging in means. Change the "how" and the test forgets the "what."

The plain-English approach inverts that. You describe what a person does — open the page, type the email, type the password, click sign in, confirm you landed on the dashboard — and the agent re-reads the live page on every run to find those elements the way a human would. The test encodes intent, so a renamed class or a relocated button is something the agent works around, not something that breaks the build. That single shift is why these tests survive the exact UI churn that shreds a locator script.

## Your first AI login test in five minutes

Install the CLI globally from npm:

```bash
npm install -g browserbash-cli
```

You need a model to drive the agent. BrowserBash is Ollama-first: it auto-detects a local [Ollama](https://ollama.com) install and uses it for free, with no API keys and nothing leaving your machine. If you have Ollama, pull a capable model:

```bash
ollama pull qwen3
```

A note from experience: small models in the 8B-and-under range tend to wander on multi-step objectives, and login flows are multi-step. A Qwen3 or Llama 3.3 70B-class model is the reliable sweet spot. If you would rather not run a local model, BrowserBash also auto-detects an Anthropic key, then falls back to OpenRouter — which includes genuinely free hosted models such as `openai/gpt-oss-120b:free`. The resolution order is Ollama, then Anthropic, then OpenRouter, so you can be running on whatever you already have.

Now write your first login test as a single sentence. This one is fully runnable as printed, because it targets a public practice app whose demo credentials are published on its own login page:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as tomsmith with password SuperSecretPassword!, and verify the page says 'You logged into a secure area'"
```

That is a complete login test: it navigates, authenticates, and asserts. A Chrome window opens, the agent finds the username and password fields and the submit button on its own, types, clicks, and checks for the success text. The `verify` clause is the assertion — if that text is missing, the run fails. You did not write a selector, a wait, or a page object.

When you want it to run without a visible window — in CI, or just in the background — add `--headless`:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, log in as tomsmith with password SuperSecretPassword!, and verify the page says 'You logged into a secure area'" --headless
```

The example above hardcodes a *published demo* password on purpose, because the whole point of the practice app is that the credential is public. For any login that matters, you must not do this — and the rest of this guide is about why and how.

## The part most tutorials skip: keeping the password out of your logs

Here is the uncomfortable truth about login testing. The objective text you pass to the agent shows up in logs and structured events, because that is how the tool tells you what it did. So the instant you write a real password into the objective — `log in as ... with password hunter2` — that password is in your terminal scrollback, your shell history file, and any log your CI system retains. Login tests leak credentials not through some exotic exploit but through the most mundane path imaginable: somebody typed the secret into a command.

BrowserBash's answer is a simple rule and a mechanism to enforce it. The rule: **never inline a credential in the objective — always pass it through a `{{variable}}`.** The mechanism: variables can be marked secret, and secret values are masked as `*****` in every log line and every NDJSON event the tool emits.

You write `{{placeholders}}` in the objective and supply their values as JSON. Anything sensitive gets the `{"value": "...", "secret": true}` shape:

```bash
browserbash run "Open {{base_url}}/login, log in as {{username}} with password {{password}}, and verify the dashboard heading is visible" \
  --headless \
  --variables '{"base_url":"https://staging.example.com","username":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

Because the password carries `"secret": true`, what the agent *does* is real — it types the actual value into the field — but what the log *shows* is the mask. The line that would have exposed your credential reads instead:

```text
Type ***** into the password field
```

The non-secret values stay readable on purpose. `base_url` and `username` appear in plain text so you can still tell at a glance which environment a run hit and which account it used — debuggability you want — while the one thing that must never surface stays hidden. Point `{{base_url}}` at staging in development and at a preview deployment in CI, and the same objective travels everywhere without an edit.

One detail worth internalizing: the masking covers BrowserBash's own output — its logs and its NDJSON. It cannot scrub a password you hand-typed as a literal into the objective (that is what the `{{vars}}` rule prevents), it cannot clean a CI runner that echoes the whole command line back, and it cannot stop your application under test from printing a secret on the page itself. Masking is one layer in a stack that still includes credential rotation, a secret store, and short log retention. What it removes is the test *tooling* as a source of the leak.

## Where variables come from, and why that matters for secrets

Variables in BrowserBash load from four places, and the precedence order is the whole reason the system is safe to use across a team and a pipeline. From lowest priority to highest:

1. Global directory: `~/.browserbash/variables/*.json` — per-workstation, never committed.
2. Project directory: `./.browserbash/variables/*.json` — committed, reviewable defaults.
3. `--variables-file <path>` — a file you point at explicitly.
4. `--variables '<json>'` — inline on the command line, wins over everything.

A sensible split falls right out of that ordering. Put your *non-secret* defaults — `base_url`, a seeded test username — in the project directory, where they live in git and reviewers can see them. Keep each engineer's *personal* staging credential in the global directory on their own machine, never committed. In CI, write an ephemeral file from your secret store and pass it with `--variables-file`. Reserve inline `--variables` for ad-hoc overrides, knowing it beats everything else.

A CI-injected `login.vars.json` looks like this:

```json
{
  "base_url": "https://staging.example.com",
  "username": "qa-runner@example.com",
  "password": { "value": "FROM_SECRET_STORE", "secret": true }
}
```

There is a real reason to prefer `--variables-file` over inline `--variables` specifically in CI: some runners echo the command line itself into their logs, and a secret sitting inside a flag would sail straight past the masking. A file sourced from the secret store sidesteps that — the value never appears on a command line at all, and the file dies with the job. Plain and secret values coexist happily in the same file; only the marked ones get masked, so everything else stays legible.

## Make it committable: a reusable login markdown test

A one-line objective is perfect for a quick check, but the login test you actually depend on belongs in version control where it can be reviewed, diffed, and — most importantly — reused by every other test that needs to authenticate first. BrowserBash's format for that is the markdown test: a file ending in `_test.md` where each list item is one step, and `{{variables}}` work exactly as they do on the command line.

Here is a standalone `login_test.md`:

```markdown
# Login flow

- Open {{base_url}}/login
- Log in as {{username}} with password {{password}}
- Verify the page shows the dashboard heading
- Verify a "Log out" link is visible
- Store the logged-in user's display name as 'display_name'
```

Run it:

```bash
browserbash testmd run login_test.md --headless
```

After the run, BrowserBash writes a `Result.md` next to the file — the verdict, what happened at each step, and any values the test stored (like `display_name` above). That report is readable by anyone: manual testers attach it to bug reports, and reviewers see test *changes* as plain-English diffs in a pull request. A login-test review stops being "trust me, the locators are right" and becomes a conversation about what signing in should do. And because the password came through a secret variable, the `Result.md` shows `*****` wherever the credential was used — the artifact is safe to attach to a ticket.

The real payoff arrives the moment you have a second test, because every authenticated flow you own starts with the same login. Rather than copy those steps into a dozen files, put the login in a helper and splice it in with `@import`:

```markdown
# Create invoice (authenticated)

@import ./helpers/login.md

- Click the New Invoice button
- Fill the customer field with {{customer_name}}
- Add a line item 'Consulting' priced at 1200
- Save the invoice and verify the status badge says 'Draft'
- Store the invoice number as 'invoice_number'
```

Imported steps are inserted in place, so every test authenticates identically and a login change is a one-file fix instead of a twelve-file hunt. The `{{placeholders}}` resolve from the JSON files in `./.browserbash/variables/` or `~/.browserbash/variables/`, so dev and CI target different environments without touching the test. There is a deeper write-up of the `@import` and variables pattern over on the [BrowserBash blog](https://browserbash.com/blog).

## Writing login steps the agent gets right the first time

The agent is capable, but wording is what separates a dependable login test from a flaky one. A few rules earn their keep on every authentication test you write.

**Make the post-login assertion explicit.** The most common mistake is stopping at "log in" and never checking what *logging in produced*. A login that silently fails to a generic error page can still "complete" the click. End the test with something the agent can unambiguously check: `verify the page shows the dashboard heading`, or `verify a "Log out" link is visible`, or `verify the URL contains '/app'`. A specific success condition is the difference between testing the click and testing the outcome.

**Test the failure path too, not just the happy one.** A login screen's job includes *rejecting* bad credentials, and that behavior breaks silently more often than you would think. Write a companion objective that asserts the rejection: `Open {{base_url}}/login, attempt to log in as {{username}} with password 'wrong-password', and verify an error message about invalid credentials appears`. If a regression ever lets a bad password through, this test catches it — and it is one sentence.

**Describe what a user sees, not what the DOM contains.** Say "Click the Sign in button," not "Click the element with id `submit-btn`." Staying above the markup is the entire point; referencing implementation detail throws away the resilience you came for.

**Capture what you will need downstream with "store ... as".** When login produces something later steps want — the user's display name, a session-scoped account ID, a tenant name — phrase it as `store the logged-in user's display name as 'display_name'`. BrowserBash surfaces stored values in its structured output, which is how the rest of your suite and your CI consumers get at them.

Apply those four and your login test stops being the suite's weakest link and becomes the thing you trust to gate every authenticated journey behind it. There is a fuller treatment of step-writing craft in the [learn section](https://browserbash.com/learn).

## Running login tests in CI without parsing prose

A login test you cannot run automatically is a demo, not a safety net. BrowserBash is built to gate merges, and it does so without making your pipeline read prose. Two facts make the integration clean.

First, **the exit code is the verdict**: `0` passed, `1` failed, `2` error, `3` timeout. Your CI step succeeds or fails on that code alone — no log scraping. Second, the `--agent` flag switches stdout to **NDJSON**: one JSON object per line, with a stable schema, while everything human-readable goes to stderr. Step events stream as they happen, and the final line is always a single `run_end` event carrying the status, a summary, and every value the test stored. Because the schema is stable, AI coding agents can call BrowserBash and read the `run_end` event to verify their own login changes in a real browser, rather than guessing from output.

Here is a CI-shaped login run that pulls secrets from a file written out of the secret store, masks the password in every emitted line, and bounds the run with a timeout:

```bash
# Write the secret file from the CI secret store, then run headless with NDJSON
printf '%s' "$LOGIN_VARS" > login.vars.json
browserbash testmd run login_test.md --agent --headless --timeout 180 \
  --variables-file login.vars.json > login.ndjson
```

A minimal GitHub Actions job wires that together — note that the secret is injected as an environment variable and only ever lands in a file, never on the command line:

```yaml
- run: npm install -g browserbash-cli
- run: |
    printf '%s' "$LOGIN_VARS" > login.vars.json
    browserbash testmd run login_test.md --agent --headless --timeout 180 \
      --variables-file login.vars.json > login.ndjson
  env:
    LOGIN_VARS: ${{ secrets.LOGIN_VARS_JSON }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The exit code fails the job exactly when login fails, `--timeout` caps any run that would otherwise hang on a stuck SSO redirect, and the password appears as `*****` in `login.ndjson` and in the job log. The file `login.vars.json` exists only for the duration of the job. The [learn section](https://browserbash.com/learn) has the full NDJSON event schema and the `jq` patterns for reading `run_end` if you want to extract stored values like `display_name` downstream.

## Capturing evidence when a login fails

When a login test fails — an SSO loop, a CAPTCHA that fired under load, a redirect that 500'd — a verdict alone is rarely enough to diagnose it. Turn on recording. The `--record` flag captures a screenshot and a session video (a `.webm` stitched with ffmpeg) on any engine; the builtin engine additionally captures a Playwright trace.

```bash
browserbash testmd run login_test.md --record --headless
```

Everything stays on your machine by default — nothing is uploaded unless you ask. There is a free, private local dashboard for browsing runs and replays:

```bash
browserbash dashboard
```

And when you want shareable run history with per-run replay — handy for showing a backend engineer exactly where the auth redirect broke — create a free account, connect once, and push a run to the cloud dashboard with `--upload`:

```bash
browserbash connect --key bb_your_key_here
browserbash testmd run login_test.md --record --upload --headless
```

Cloud runs on the free tier are retained for 15 days. The privacy default is the part to underline, and it matters more for login tests than for anything else: `--upload` is opt-in, so a recording of an authentication flow never leaves your laptop unless you explicitly send it. Combined with secret masking, that means even an uploaded recording's logs show `*****` rather than the credential.

## Running login tests on a real cross-browser grid

Login is exactly the flow you want to verify across browsers, because authentication quirks — cookie handling, SameSite behavior, redirect timing — differ between engines. BrowserBash treats *where the browser runs* as a runtime decision, controlled by `--provider`, with no test edits:

```bash
# Local Chrome (default) — watch the login run during development
browserbash testmd run login_test.md

# A cloud grid in CI — same file, one flag
browserbash testmd run login_test.md --provider lambdatest --headless
```

The providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. One behavior to know about: the default Stagehand engine cannot attach to LambdaTest or BrowserStack sessions, so when you pass one of those providers BrowserBash automatically switches to its builtin engine, which speaks the Anthropic API — meaning those grid runs need `ANTHROPIC_API_KEY` set (or `ANTHROPIC_BASE_URL` pointed at an Anthropic-compatible gateway). You never pass an engine flag yourself; the switch is automatic, and the same `login_test.md` — secret variables and all — runs unchanged across every provider.

## A repeatable login-testing workflow

Putting it together, here is the loop that works in practice. Start by writing the login as a single `browserbash run "..."` objective with `{{variables}}` for every credential, marking the password secret, and watch it execute locally with a visible browser so you can see where the agent's understanding diverges from yours. Tighten the wording until it passes reliably — a specific post-login `verify`, user-visible language, `store ... as` for the values you need. Add a companion objective for the rejection path so a bad password is proven to fail. Move the steps into `login_test.md`, and because every other authenticated test starts here, expose it as an `@import` helper. Wire it into CI with `--agent --headless --timeout` and a `--variables-file` sourced from your secret store, letting the exit code gate the merge while the password stays masked. Turn on `--record` for the failures you need to diagnose, and reach for `--provider` when you need the login verified on a grid. Each stage is small, the secret never touches a command line or a log, and nothing you wrote in the first step gets thrown away in the last.

## FAQ

### How does BrowserBash keep my password out of test logs?

Pass the password through a `{{variable}}` and mark it as `{"value":"...","secret":true}` in your `--variables` JSON or variables file. BrowserBash substitutes the real value at run time so the agent actually logs in, but masks it as `*****` in every log line and in the NDJSON `run_end` event. The one rule you must follow is never to type the credential directly into the objective string, since objective text is logged verbatim.

### Can I test that login *rejects* a wrong password, not just that it accepts the right one?

Yes, and you should. Write a second objective that attempts the login with a deliberately wrong password and asserts the failure, for example: `attempt to log in as {{username}} with password 'wrong-password', and verify an error message about invalid credentials appears`. The `verify` clause makes the expected rejection a pass condition, so the test fails loudly if a regression ever lets a bad credential through.

### Where should I store credentials so they are not committed to git?

Keep non-secret defaults like the base URL and a test username in the project directory (`./.browserbash/variables/`), which is fine to commit. Keep actual secrets out of the repo: personal credentials go in the per-workstation global directory (`~/.browserbash/variables/`), and CI credentials come from your secret store written to an ephemeral file passed with `--variables-file`. Prefer the file over inline `--variables` in CI, because some runners echo the command line and a secret in a flag would bypass masking.

### Do I really not need any selectors for the login form?

Correct — no locators, no page objects, no explicit waits. You describe each step as a user would ("Log in as {{username}}," "Verify a 'Log out' link is visible") and the agent finds the fields and buttons on the live page at run time. That is exactly why these login tests survive the redesigns that break selector-based suites: there is no hardcoded reference to the markup to go stale.

---

Ready to make your most fragile login test resilient and your credentials invisible to the logs? Install with `npm install -g browserbash-cli` from the [npm package page](https://www.npmjs.com/package/browserbash-cli), then [create a free account](https://browserbash.com/sign-up) when you want shareable run history and cloud replays. BrowserBash is free and open source under Apache-2.0 — point it at your staging login, mark the password secret, and run it once.
