---
title: Automate Login and Form Filling From the Terminal With Plain English
description: "Learn to automate login form fill CLI flows in plain English: drive real Chrome, mask passwords, persist auth honestly, and verify the result."
date: 2026-02-10
category: use-case
---

Most automation tutorials start with a selector and end with a flaky test. This one starts with a sentence. If you want to automate login form fill CLI workflows without writing a single CSS path, page object, or `waitForSelector`, you describe the flow in plain English and let an AI agent drive a real Chrome browser to carry it out, fill the fields, submit, and tell you whether it actually worked. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI from The Testing Academy, and every command in this guide is real and runnable on your machine.

Login and form filling are the two flows everyone automates first and trusts least. They break on redesigns, leak credentials into logs, and stall the moment a field gets a new `id`. The terminal-first, intent-based approach fixes the first two problems cleanly and is honest about the third. By the end you'll be able to log into a site, fill a multi-field form, mask your password so it never appears in a log line, and persist your authenticated session so you don't re-login on every run. We'll also cover where this approach is genuinely the wrong tool, because pretending otherwise wastes your afternoon.

## Why plain English beats selectors for login and forms

A traditional login test is a contract pinned to markup. You find the email input by `#email`, the password by `[name="password"]`, the submit button by a `data-testid`, and you assert on a redirect URL. The day a designer renames `data-testid="login-btn"` to `data-testid="signin-btn"`, the test goes red even though login still works for every human. You spend the morning chasing a selector, not a bug. Multiply that across a signup, checkout, profile-edit, and password-reset form, and you have a maintenance tax that grows until the team stops trusting the suite.

The intent-based model inverts this. Instead of telling the machine *how* to find the email field, you tell it *what you want*: "log in as the standard user." The agent reads the page the way a person does — it sees a field labeled Email, a field labeled Password, and a button that says Login — and it acts. When the markup shifts but the page still *means* the same thing, the run still passes. That self-healing property is the single biggest reason teams move login and form tests off brittle selectors and onto natural language. You can read the longer argument in [why CSS selectors are brittle](https://browserbash.com/blog), but the short version is: humans don't log in by inspecting the DOM, so your most-run test shouldn't either.

The trade-off is real and worth naming up front. A selector is deterministic; an agent makes judgment calls. For a stable, high-frequency unit-level check, a hand-written selector is faster and cheaper to run. For end-to-end flows that change often and need to survive redesigns, plain English wins on total cost of ownership. Most teams end up with both.

## What you need before the first run

BrowserBash installs as a global npm package and drives the Chrome you already have. There is no account, no signup, and no API key required to run a local flow.

```bash
npm install -g browserbash-cli
browserbash --version
```

You need Node 18 or newer and a Chrome/Chromium install for the default local provider. The current release is 1.3.1; you can confirm the latest on [npm](https://www.npmjs.com/package/browserbash-cli). The one decision worth making before you type a real objective is which model interprets your English.

BrowserBash is Ollama-first. The default model is `auto`, and it resolves in a fixed order: first it looks for a local Ollama install and uses `ollama/<model>` — free, no keys, and nothing leaves your machine; if there's no Ollama, it falls back to `ANTHROPIC_API_KEY` and uses `claude-opus-4-8`; failing that, `OPENAI_API_KEY` and `openai/gpt-4.1`; otherwise it errors with guidance on how to fix it. For login and form filling specifically, model choice matters more than for simple navigation, and I'll be blunt about why in the next section.

If you want a visual record of what the agent did — useful when you're debugging a login that the agent thinks passed but you suspect didn't — there's a fully local dashboard at `localhost:4477`:

```bash
browserbash dashboard
```

Nothing in the dashboard leaves your machine. There's an optional cloud path too, but it's opt-in and we'll get to it.

## Your first automated login

Let's log into a real practice site. The classic SauceDemo standard-user flow is perfect because it's stable and public. Here's the whole thing as a one-shot run:

```bash
browserbash run "Go to https://www.saucedemo.com, log in with username standard_user and password secret_sauce, and confirm the products page is shown"
```

That single command launches a real Chrome window, navigates, finds the username and password fields by what they *mean* rather than by selector, types the credentials, clicks login, waits for the page to settle, and judges whether the products page actually loaded. You get back a verdict — passed or failed — plus any structured values the agent extracted. No selectors written, no page object created. If SauceDemo renamed its input IDs tomorrow, this run would still pass, because "log in with username X and password Y" doesn't depend on the markup.

A few things are happening under the hood that are worth understanding. By default, BrowserBash uses the Stagehand engine — the MIT-licensed library from Browserbase that exposes act/extract/observe/agent primitives and self-heals when an element moves. The other engine, `builtin`, is an in-repo Anthropic tool-use loop driving Playwright, and it's auto-selected when you target LambdaTest or BrowserStack. For local login and form work, the default Stagehand engine is the right call and you don't need to touch `--engine` at all. If you want to compare them, the [features page](https://browserbash.com/features) breaks down both.

Now the honest caveat I promised. The credentials are sitting in your shell history and, depending on how you wrote the command, possibly in your run logs. For a throwaway practice site that's fine. For anything real, you do not hardcode passwords into a `run` string — you use secret-marked variables, which is the next section and the reason markdown tests exist.

## Filling forms with multiple fields and validation

Login is the simplest form there is: two fields and a button. Real forms are messier — a signup page with first name, last name, email, password, confirm-password, a country dropdown, a checkbox for terms, and inline validation that yells at you if the passwords don't match. Plain English handles this without breaking a sweat, because you describe the *outcome* and let the agent figure out the field order.

```bash
browserbash run "On the registration page at https://example.com/signup, fill first name Priya, last name Shah, email priya@example.com, choose India as the country, accept the terms checkbox, set a password of Test1234! in both password fields, submit, and confirm the account-created message appears"
```

The agent reads each labeled field, fills it, ticks the checkbox, picks the dropdown value, and submits. Crucially, it then *verifies* — it doesn't just click submit and call it a day; it checks for the success message you asked about and reports failure if it's missing. That verification step is what separates an agent run from a dumb macro. A recorded Selenium IDE script will happily click a disabled button and pass; an agent that's told "confirm the account-created message appears" will fail honestly when validation blocks the submit.

For edge-case form work — deliberately-wrong inputs, boundary values, the "what happens if I leave email blank" cases — describe the bad input and the expected error in the same sentence. The agent types the bad value, attempts submit, and confirms the validation message instead of a success. There's a deeper treatment in the [tutorials](https://browserbash.com/tutorials) if you're building a full validation matrix.

## Keeping passwords out of every log line

Here is the part that separates a demo from something you'd run in CI. The moment a real credential enters a command, it leaks — into shell history, into CI build logs, into the on-disk transcript that outlives the run. BrowserBash solves this with markdown tests and secret-marked variables.

A markdown test is a committable `*_test.md` file where each list item is a step, `{{variables}}` get templated in at run time, and any variable you mark as secret is masked as `*****` in *every* log line — the live output, the saved transcript, the dashboard, all of it. Here's a login test as a file you can check into git without leaking anything:

```bash
browserbash testmd run ./login_test.md
```

Inside `login_test.md`, the steps read like English — "Go to the login page", "Enter {{username}}", "Enter the secret {{password}}", "Confirm the dashboard loads" — and you pass the real values at run time. The secret-marked `password` shows up as `*****` wherever it would otherwise print. After each run, BrowserBash writes a human-readable `Result.md` next to your test, so you get a clean artifact showing what happened, with the credential masked. This is the workflow you want for any login that touches a real account. The [variables and secrets guide](https://browserbash.com/learn) walks through the `@import` composition feature too, which lets you keep credentials in one imported file and reuse them across many tests.

Every run is also kept on disk at `~/.browserbash/runs` with secrets masked, capped at the last 200 runs. So even your local history is safe to look back through — the password isn't sitting in plaintext in a log you forgot about.

## Sessions and persisted auth state, honestly

This is the section most articles get wrong by overselling, so I'll be precise about what BrowserBash actually does and where a different tool is genuinely better.

The honest reality of "persisted auth state" is that it means one of two things: either you re-run the login each time (simple, slower, always works), or you save the authenticated session — cookies, localStorage, tokens — once and replay it so future runs skip the login entirely (faster, but fragile when sessions expire or sites rotate tokens).

BrowserBash's local provider is the default, and it drives *your* Chrome. That matters for sessions: when you run against your real Chrome profile, you inherit the cookies and logins already sitting in that profile. If you're already signed into a site in the Chrome that BrowserBash drives, an objective like "go to the dashboard and confirm my name appears in the header" can work without a fresh login, because the session is already there. That's the simplest, most reliable form of persisted auth — reuse the browser state you already have.

Beyond the local profile, BrowserBash also supports remote browsers via `--provider`: a raw DevTools endpoint with `cdp` (`--cdp-endpoint ws://...`), plus `browserbase`, `lambdatest`, and `browserstack` with their respective credentials. Connecting to a long-lived CDP endpoint you control is one way to keep a warm, already-authenticated browser around across runs.

Now the honest boundary. BrowserBash does not ship a dedicated, documented "export the storage state to a file and re-inject it next run" flag the way some purpose-built tools do. If your core need is to log in once, snapshot the full `storageState`, and replay that exact authenticated context across hundreds of fresh, isolated sessions — including saving an MFA "remember this device" trust so you never re-prompt — then a system designed around that, like [Browserbase Contexts](https://www.browserbase.com/templates/context), is the better fit for that specific job, and you should use it. As of 2026, that kind of first-class context snapshot/replay is not a documented BrowserBash flag, and I'm not going to pretend it is.

What BrowserBash gives you instead is pragmatic and covers most real cases: drive the profile that's already authenticated, or just log in at the top of the flow with a masked credential and let the agent carry on. For the vast majority of login-then-do-something tests, re-authenticating with a secret variable is more robust than replaying a stale storage snapshot anyway — token expiry is the silent killer of the snapshot-replay approach, as the [Stagehand storage-state issues](https://github.com/browserbash/stagehand/issues/1250) on GitHub show. Re-login never goes stale.

## Wiring it into CI and AI coding agents

A login or form flow that only runs when you type it by hand isn't automation; it's a parlor trick. The point of a CLI is that it composes — into shell scripts, CI pipelines, and the AI coding agents that now write half our glue code.

For machine consumption, use `--agent`, which switches the output to NDJSON — one JSON object per line, no prose to parse. You get progress events as the agent works, then a single terminal event with the verdict:

```bash
browserbash run "Log in with {{username}} and {{password}}, then confirm the account dashboard loads" --agent
```

Each step prints something like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. The exit codes are CI-native: `0` passed, `1` failed, `2` error, `3` timeout. That means a login check gates a deploy with a plain `if` in your pipeline — no log scraping, no regex against human text. This is the same surface an AI coding agent uses to verify its own work: it asks BrowserBash to log in and confirm a screen, reads the single JSON verdict, and decides whether the feature is done.

If you want artifacts from a CI run, add `--record` for a screenshot plus a `.webm` session video (the builtin engine also writes a Playwright trace), and `--headless` so it runs without a visible window on a build server. To push a run to the optional free cloud dashboard for sharing, you first link with `browserbash connect --key bb_...` and then add `--upload` per run — and without `--upload`, nothing leaves your machine. Free cloud runs are kept 15 days. The [github repo](https://github.com/PramodDutta/browserbash) has full CI examples if you're wiring this into Actions or Jenkins.

## How this compares to other terminal browser agents

Plain-English login and form filling from the terminal isn't unique to BrowserBash, and you should pick honestly. Facts about other tools below are stated conservatively; where a detail isn't publicly specified, I say so rather than guessing.

| Capability | BrowserBash | browser-use CLI | Stagehand + Browserbase |
| --- | --- | --- | --- |
| Plain-English login / form fill | Yes | Yes | Yes (via primitives in code) |
| License / cost | Apache-2.0, free | Open-source core | Stagehand MIT; Browserbase cloud paid |
| Local model, $0 bill | Yes (Ollama-first, default) | Supports local models | Model-dependent |
| Secret masking in logs | Yes (`*****`, every line) | Not the same first-class feature | Your code's responsibility |
| Dedicated storage-state snapshot/replay | No documented flag | Supports storage_state injection | Yes (Contexts) |
| Committable plain-text tests | Yes (`*_test.md`) | Script/code-driven | Code-driven |
| NDJSON for CI / agents | Yes (`--agent`) | Not publicly specified as identical | Build it yourself |

A few honest reads of that table. The [browser-use CLI](https://docs.browser-use.com/open-source/browser-use-cli) is a capable peer for natural-language browser control and explicitly supports injecting a cookies/localStorage snapshot to start authenticated — so if storage-state injection is your hard requirement, it has a more direct answer than BrowserBash does. Stagehand-plus-Browserbase is the strongest choice when you need first-class authenticated-context persistence at scale, including MFA-trust replay across many isolated cloud sessions; that's literally what Browserbase Contexts are built for. BrowserBash's edge is the combination most teams actually want day to day: committable plain-text tests, secrets masked everywhere by default, a genuinely free local model path, and machine-readable NDJSON for CI — all in one CLI with no account.

## When to choose this approach (and when not to)

Choose plain-English, terminal-first login and form automation when your flows change often, when you're tired of selector maintenance, when you want tests a non-developer can read and edit, and when keeping credentials out of logs is non-negotiable. It's an excellent fit for end-to-end smoke checks, signup and checkout flows, and synthetic monitoring of "can users still log in" against production. The free local model path makes it genuinely $0 to run at volume, which matters if you're checking login every five minutes.

Be careful in a few cases. Very small local models — anything 8B or under — are flaky on long multi-step objectives; a ten-field form with conditional logic can confuse them mid-flow. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model like Claude for the genuinely hard flows. If you pin a tiny model and your login test gets weird, that's almost always the cause, not the tool. Pin a bigger model with `--model` and re-run before you blame anything else.

Don't reach for this when you need microsecond-deterministic, high-frequency unit checks against stable markup — a hand-written selector is faster and cheaper there. And if your entire architecture depends on snapshotting one authenticated context and fanning it out across hundreds of isolated sessions with MFA-trust replay, use a tool built for that and let BrowserBash handle the flows where re-login or local-profile reuse is fine. The [pricing page](https://browserbash.com/pricing) lays out what's free versus optional, and there's a [case study](https://browserbash.com/case-study) if you want to see a real team's adoption path.

## A realistic end-to-end example

Let's tie it together into something you'd actually keep. Imagine you want a committable test that logs into your staging app with a masked password, edits the profile form, and confirms the change saved. As a markdown test it stays readable and safe to commit, and you run it the same way every time:

```bash
browserbash testmd run ./profile_update_test.md --record
```

The file's steps read like a checklist a teammate wrote: go to the login page, enter `{{username}}`, enter the secret `{{password}}`, confirm the dashboard, open profile settings, change the display name to `{{new_name}}`, save, and confirm the "Profile updated" toast. The `--record` flag gives you a screenshot and a video so when someone asks "did it really save," you have the receipt. The secret password is masked as `*****` in the `Result.md` artifact and the on-disk run. If you later want to share that run with a teammate who isn't on your machine, link the cloud dashboard once and add `--upload` to that run — and only that run leaves your machine.

That's the whole loop: plain English in, real Chrome driving, secrets masked, a verdict and artifacts out, and a file you can diff in a pull request. No selectors were harmed.

## FAQ

### Can I automate login and form filling without writing any code?

Yes. With BrowserBash you write the flow as a plain-English objective — for example, log in with a username and password and confirm the dashboard — and an AI agent drives a real Chrome browser to carry it out. There are no selectors, page objects, or scripts to write. You can run it as a one-shot command or save it as a committable markdown test that a non-developer can read and edit.

### How do I keep my password out of the logs when automating login?

Use a markdown test with a secret-marked variable. BrowserBash masks any secret variable as `*****` in every log line, in the live output, in the saved transcript, and in the on-disk run history kept at `~/.browserbash/runs`. You pass the real credential at run time, and it never appears in plaintext, which makes the test safe to commit and safe to run in CI.

### Does BrowserBash save my authenticated session between runs?

It reuses the session already in the Chrome profile it drives, so if you're signed in there, flows can skip a fresh login. It does not ship a dedicated flag to snapshot a full storage state and replay it across isolated sessions, so for that exact need a tool built around context persistence is a better fit. For most tests, re-logging in with a masked credential is more robust anyway, since saved sessions go stale when tokens expire.

### Is it really free to automate login flows at scale?

Yes, on the local path. BrowserBash is Apache-2.0 open source, needs no account to run, and is Ollama-first — when a local model handles the flow, nothing leaves your machine and your model bill is exactly $0. The optional cloud dashboard is opt-in and free for runs you explicitly upload, kept for 15 days. Pinning a capable hosted model for hard flows is the only thing that can cost money, and only if you choose it.

---

Ready to try it? Install the CLI and run your first login flow in plain English:

```bash
npm install -g browserbash-cli
```

No account is needed to run locally — but if you want the optional free cloud dashboard, [sign up here](https://browserbash.com/sign-up).
