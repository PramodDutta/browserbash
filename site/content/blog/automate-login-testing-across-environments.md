---
title: Automate Login Testing Across Dev, Staging & Prod
description: "Automate login testing across dev, staging, and prod with one BrowserBash markdown test, {{variables}}, @import, and secret-masked credentials."
date: 2026-05-06
category: use-case
---

If your team has three login tests because you run in three environments, you have a maintenance problem dressed up as a test suite. The smart way to automate login testing is to write the journey once and feed it different data per environment, not to fork the script every time the dev, staging, and production URLs diverge. That is the whole idea behind this guide: a single BrowserBash markdown test, parameterized with `{{variables}}` and composed with `@import`, that logs in cleanly against any environment while keeping each password masked as `*****` in every log line. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI from The Testing Academy, and every command here is real.

Most teams arrive at the multi-environment login problem the hard way. They start with one Selenium IDE recording against staging, copy it for dev when the base URL changes, copy it again for prod, and six months later there are three nearly-identical `.side` files drifting apart. A field gets renamed once and you fix it in one file, forget the other two, and your dev pipeline goes green while staging quietly rots. This article shows a different shape: one test, three data files, zero duplicated steps.

## The real cost of one login test per environment

Authentication is the gate every other test walks through, so the login flow gets exercised constantly and copied constantly. The copying is where the rot starts.

When you maintain `login_dev.side`, `login_staging.side`, and `login_prod.side` as separate artifacts, the differences between them are tiny — usually just the base URL and a set of credentials — but the *steps* are identical: open the page, fill the email, fill the password, click sign in, confirm you reached the dashboard. You have triplicated the part that changes rarely (the steps) to vary the part that changes per run (the data). That is exactly backwards. The data should be the variable and the steps should be the constant, but file-per-environment forces the opposite.

The second cost is drift. Three files means three places a fix has to land. Humans are bad at fan-out edits, so over a quarter the files diverge: one has a cookie-banner dismissal step the others lack, another still clicks an old "Log in" button text that a redesign changed to "Sign in." Now the three environments are testing three slightly different things, which defeats the entire reason you have a staging environment — to rehearse exactly what production will do.

The third cost is secrets. A login test types a credential, and a recorded script tends to store that credential in plaintext inside the recording or a fixture file that gets committed. Multiply by three environments and you have three places a production password can leak into git history, CI logs, or an archived test report that outlives the run by months.

So the goal when you automate login testing properly is threefold: write the steps once, swap the data per environment, and never let a real secret appear in a log. BrowserBash markdown tests give you all three.

## How BrowserBash markdown tests work

A BrowserBash markdown test is a committable `*_test.md` file where each list item is a single step written in plain English. There are no selectors, no page objects, no `data-testid` to pin to. An AI agent reads your steps, drives a real Chrome browser to carry them out, and returns a pass or fail verdict plus structured results. After every run it writes a human-readable `Result.md` next to the test.

Two features make this work across environments:

- **`{{variables}}` templating.** Anywhere in a step you can drop a `{{name}}` placeholder, and BrowserBash substitutes a value you supply at run time. The same `login_test.md` becomes a dev test or a prod test depending only on the variables you pass.
- **`@import` composition.** A test file can import another, so shared steps (a reusable login fragment) live in one place and every higher-level journey pulls them in. Fix the login fragment once and every test that imports it inherits the fix.

And one feature makes it safe: **secret-marked variables are masked as `*****` in every log line.** You flag a variable as a secret, BrowserBash types its real value into the browser, but every place that value would otherwise be printed — console output, the `Result.md`, the agent's reasoning trace — shows asterisks instead. The password does its job and never shows its face.

Install is a single command:

```bash
npm install -g browserbash-cli
```

No account is required to run anything in this article. There is an optional free cloud dashboard you can opt into later, but the entire login workflow below runs locally.

## Write the login test once

Start with the shared fragment. This is the only place the login steps ever live.

`login_test.md`:

```markdown
# Login

- Go to {{baseUrl}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field
- Click the "Sign in" button
- Confirm the page shows "Welcome back" and a logout link is visible
```

Notice what is and is not parameterized. The destination (`{{baseUrl}}`), the identity (`{{username}}`), and the secret (`{{password}}`) are variables, because those are the things that legitimately differ between dev, staging, and prod. The steps themselves — what it *means* to log in — are hardcoded, because logging in should mean the same thing everywhere. That separation is the whole trick.

Because the steps are plain English rather than selectors, the agent re-reads the live page on each run to find the email field, the password field, and the button. If staging renders a slightly different markup than production, or dev has an extra "skip onboarding" banner, the agent works around cosmetic differences the way a person would. You are encoding intent, not a brittle map of the DOM.

You run a markdown test with `testmd run`:

```bash
browserbash testmd run ./login_test.md \
  --var baseUrl=https://dev.example.com \
  --var username=qa@example.com \
  --secret password=devSecret123
```

The `--var` flags fill the plain placeholders. The `--secret` flag fills `{{password}}` *and* marks it for masking, so the value `devSecret123` never appears in the run output — you will see `*****` everywhere the test references it.

## Reuse the same test across dev, staging, and prod

Now the payoff. Three environments, one test file, three sets of variables. The cleanest way to manage the variables is to keep them out of your shell history entirely, but let's build up to that.

### The direct approach: variables on the command line

For a quick run against any environment, pass the variables inline:

```bash
# Dev
browserbash testmd run ./login_test.md \
  --var baseUrl=https://dev.example.com \
  --var username=qa@example.com \
  --secret password=$DEV_PW

# Staging
browserbash testmd run ./login_test.md \
  --var baseUrl=https://staging.example.com \
  --var username=qa@example.com \
  --secret password=$STAGING_PW

# Prod (read-only smoke account, please)
browserbash testmd run ./login_test.md \
  --var baseUrl=https://app.example.com \
  --var username=smoke@example.com \
  --secret password=$PROD_PW
```

Three commands, one test file. When the login form changes, you edit `login_test.md` once and all three commands keep working. Compare that to opening three Selenium IDE recordings and re-recording the changed step in each. Pull the real secret from an environment variable (`$PROD_PW`) that your CI secret store injects, so the literal password is never in the command text and never in your shell history.

### The committable approach: per-environment data files

Inline flags are fine for ad-hoc runs, but the version you commit should keep the environment data in named files. Create a small data file per environment and a thin wrapper test that imports the shared fragment.

`envs/dev.md`:

```markdown
- baseUrl: https://dev.example.com
- username: qa@example.com
```

`envs/prod.md`:

```markdown
- baseUrl: https://app.example.com
- username: smoke@example.com
```

`login_dev_test.md`:

```markdown
@import ./envs/dev.md
@import ./login_test.md
```

The wrapper does nothing but compose: it pulls in the dev data, then pulls in the shared login steps. The steps are *not* duplicated — they are imported. You now have a per-environment entry point whose entire body is two import lines, and the actual login logic exists exactly once in `login_test.md`. When you need to change how login works, you change one file and every wrapper inherits it automatically.

Secrets stay off disk. Even with committed data files, the password is never written into `envs/prod.md`. You still inject it at run time:

```bash
browserbash testmd run ./login_dev_test.md --secret password=$DEV_PW
```

This is the structure that scales. Add a fourth environment — a customer-specific tenant, a release-candidate URL — and you add one tiny data file and one two-line wrapper. You never touch the login steps.

### Compose login into longer journeys

The same `@import` that pulls login into a per-environment wrapper also pulls it into bigger end-to-end tests. A checkout journey, for example, can import the login fragment as its first move:

```markdown
@import ./login_test.md

- Click "Catalog" in the top navigation
- Add the first product to the cart
- Go to the cart and click "Checkout"
- Fill in the shipping form with realistic test data
- Place the order
- Confirm the page shows "Thank you for your order!"
```

Every journey that needs an authenticated session imports the one login fragment. There is a single source of truth for "how do I log in," and it is reused everywhere — across environments and across journeys.

## Keep credentials out of every log line

Secret handling is where multi-environment login automation usually goes wrong, because the production password is the one you most need to protect and the one most likely to end up somewhere it shouldn't.

BrowserBash's rule is simple: any variable you pass with `--secret` is masked as `*****` everywhere it would otherwise be printed. The agent still types the genuine value into the browser, so the login actually succeeds, but the value is scrubbed from:

- the live console output during the run,
- the `Result.md` report written afterward,
- the agent's step-by-step reasoning trace,
- any structured results emitted in agent mode.

That means you can paste a failing run's output into a ticket, commit a `Result.md` to a debugging branch, or stream agent-mode JSON into your CI logs, and the production credential is not riding along in plaintext.

Pair this with a secret store rather than literals. In CI, inject the password as a masked environment variable and reference it:

```bash
browserbash testmd run ./login_prod_test.md --secret password=$PROD_PW
```

Now the secret exists in exactly two protected places — your CI secret store and the live browser session — and nowhere else. It is not in the test file, not in the data file, not in your shell history, and not in any log. That is a meaningfully smaller blast radius than a credential baked into a recorded `.side` file or a committed fixture.

A small operational note: use a dedicated, low-privilege smoke account for production login checks, never a real customer or admin credential. The point of a prod login test is to confirm the gate opens, not to exercise privileged actions.

## Run it in CI across every environment

A multi-environment login test earns its keep in continuous integration, where you want a clear pass/fail per environment and no prose to parse. BrowserBash has an agent mode built for exactly this.

`--agent` emits NDJSON — one JSON event per line — on stdout, and the process exits with a meaningful code: `0` passed, `1` failed, `2` error, `3` timeout. Your pipeline reads the exit code; no scraping of human-readable output required.

```bash
browserbash testmd run ./login_prod_test.md \
  --secret password=$PROD_PW \
  --agent \
  --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg, so when a login check fails at 3 a.m. you have a video of exactly what the browser saw — the cookie banner that blocked the button, the SSO redirect that stalled, the unexpected maintenance page. On the builtin engine you also get a Playwright trace you can open in the trace viewer.

A typical CI matrix runs the same wrapper test against each environment in parallel, each job injecting its own secret. Because the login logic is shared, a fix to `login_test.md` ships to all three matrix legs at once — there is no per-environment script to update. If you want to keep run history, videos, and per-run replay, you can opt in to the free cloud dashboard with `browserbash connect` and add `--upload`; uploaded runs are kept 15 days. There is also a fully local dashboard via `browserbash dashboard` if you would rather nothing leave your machine. Either is strictly optional — the CI gate above works with no account at all. The full set of flags and engines is documented in the [features overview](https://browserbash.com/features) and the [learn hub](https://browserbash.com/learn).

## BrowserBash vs. per-environment Selenium IDE scripts

Selenium IDE is a fine recorder, and for a single environment it gets you a login test fast. The friction shows up specifically in the multi-environment case this article is about. Here is an honest side-by-side. Where Selenium IDE's behavior is configuration-dependent or not fixed, this says so rather than inventing a number.

| Concern | Per-environment Selenium IDE scripts | One BrowserBash markdown test |
| --- | --- | --- |
| Files to maintain for 3 envs | Typically one recording per environment | One `*_test.md` plus tiny per-env data files |
| Varying data per environment | Possible via variables/parameters, but commonly handled by copying the script | First-class `{{variables}}` + `--var`/`--secret` |
| Sharing login into other journeys | Reusable test feature exists; setup varies by team | Native `@import` composition |
| Locating elements | Recorded selectors that drift on redesign | Plain-English intent, re-read live each run |
| Secret masking in logs | Not a built-in guarantee; depends on setup | Secret variables masked as `*****` everywhere |
| CI signal | Runs via `selenium-side-runner`; you parse output | `--agent` NDJSON + exit codes 0/1/2/3 |
| Failure evidence | Screenshots via plugins/config | `--record` screenshot + `.webm` video built in |
| Cost | Free, open source | Free, open source (Apache-2.0) |

The honest read: if you only ever test one environment, have an existing library of stable Selenium IDE recordings, and your team already knows that tool cold, there is no urgent reason to switch. Selenium IDE is mature, the export-to-code path is well-trodden, and a working recording you do not have to touch is worth keeping.

BrowserBash pulls ahead precisely when the environment count is greater than one and the UI is in motion. The combination of one parameterized test, `@import` reuse, and built-in secret masking is purpose-built for "same flow, different data, keep the password quiet." If that is your situation, the maintenance math favors the single-test approach quickly.

## When to choose each approach

Choosing well matters more than picking the newest tool. Here is where each fits.

**Choose one parameterized BrowserBash test when:**

- You run the same login flow against two or more environments and are tired of fixing the same step in multiple files.
- Your login UI changes often enough that recorded selectors are a recurring maintenance tax.
- You need credentials masked in logs by policy, and you'd rather get that for free than build it.
- You want the test to live in git as a readable `*_test.md` that a non-engineer can review.
- You want CI-native signal (NDJSON + exit codes) and built-in video evidence without bolting on plugins.

**Stick with your existing per-environment scripts when:**

- You test a single, stable environment and the recordings already pass reliably.
- Your team has deep Selenium IDE muscle memory and no appetite to change tooling right now.
- You depend on a specific Selenium IDE export or plugin in your pipeline that you are not ready to replace.

**A pragmatic note on models.** BrowserBash is Ollama-first: it defaults to free local models, needs no API keys, and nothing leaves your machine, so you can guarantee a $0 model bill. Be honest with yourself about model size, though. Very small local models (around 8B and under) can get flaky on long multi-step objectives. A login flow is short, so a small model often handles it, but if you chain login into a long checkout journey, lean on a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. BrowserBash auto-resolves a local Ollama install first, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY`, and OpenRouter even exposes genuinely free hosted models like `openai/gpt-oss-120b:free` if you want hosted muscle at no cost. You can read more real-world flows on the [BrowserBash blog](https://browserbash.com/blog) and see outcomes in the [case studies](https://browserbash.com/case-study).

## A migration path that won't break your week

You do not have to rip out your existing scripts to get the benefit. A staged migration works well.

First, write the shared `login_test.md` fragment and prove it against dev with inline `--var` and `--secret` flags. This takes minutes and risks nothing — your old scripts keep running.

Second, add per-environment data files and two-line wrapper tests for staging and prod. Run them by hand and compare the verdicts to what your Selenium IDE scripts report. When they agree for a sprint, you have earned confidence.

Third, wire the wrappers into CI with `--agent` and `--record`, one matrix leg per environment, each injecting its own secret. Watch the exit codes. Once the new gate has caught a real regression — or cleanly passed a release the old gate also passed — retire the duplicated recordings.

Fourth, fold login into your longer journeys via `@import`, so authenticated end-to-end tests stop carrying their own copy of the login steps. At that point you have one definition of "log in" feeding every test in every environment, which is the whole goal.

The throughline is that every step is reversible and additive. You are never in a half-migrated state where nothing works; you are running old and new side by side until the new earns its place.

## FAQ

### How do I run the same login test across multiple environments?

Write the login steps once in a `*_test.md` file and replace the environment-specific parts — base URL, username, password — with `{{variables}}`. Then run the same file per environment, passing different values with `--var` for normal data and `--secret` for the password. The steps never change between environments; only the variables do, which is what lets one test cover dev, staging, and prod.

### How does BrowserBash keep passwords out of logs?

Any variable you pass with the `--secret` flag is masked as `*****` everywhere BrowserBash would otherwise print it — console output, the `Result.md` report, the agent's reasoning trace, and agent-mode JSON. The real value is still typed into the browser so the login succeeds, but it never appears in any log line. Combine that with injecting the password from a CI secret store so the literal value is never in your files or shell history either.

### Can I reuse one login test inside larger end-to-end journeys?

Yes. BrowserBash markdown tests support `@import`, so you keep the login steps in a single fragment and pull them into any longer test with one `@import ./login_test.md` line. A checkout or account-settings journey imports the same login fragment as its first step, which means there is exactly one definition of how to log in, reused everywhere instead of copied.

### Do I need API keys or an account to automate login testing?

No. BrowserBash is Ollama-first and defaults to free local models, so you can run login tests with no API keys and no account, and nothing leaves your machine. If you want a hosted model you can supply an Anthropic or OpenRouter key, and there are genuinely free hosted options on OpenRouter. The optional cloud dashboard for run history and video replay is strictly opt-in and is not required to run any test.

Stop maintaining one login script per environment. Write the flow once, vary the data with `{{variables}}`, compose it with `@import`, and let secret masking keep every password as `*****`. Install with `npm install -g browserbash-cli`, point it at your dev URL first, and work outward to staging and prod. No account is needed to start, but if you want run history and video replay later you can [sign up for free](https://browserbash.com/sign-up).
