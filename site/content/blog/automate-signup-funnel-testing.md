---
title: Automate signup funnel testing
description: "Automate signup funnel testing with BrowserBash: register a new account in plain English, confirm email, and verify the dashboard loads in CI."
date: 2026-06-05
category: use-case
---

The signup funnel is the one flow you cannot afford to ship broken, and it is the flow your test suite is most likely to skip. Signup funnel testing means proving, end to end, that a brand-new person can land on your marketing page, fill the registration form, get past whatever email or phone verification you bolted on, and arrive at a dashboard that actually has their data in it. Every step in that chain is a place where revenue leaks. A required field that rejects valid input, a verification email that 404s on click, a dashboard that renders a blank state for the first session — any one of them quietly kills conversions, and none of them show up in a unit test.

This guide is for the SDET or founder who owns "can someone actually sign up right now?" and wants a check that runs on every deploy without a maintenance burden. I'll walk through what the registration-to-dashboard journey really contains, why selector-based suites struggle with the disposable, one-time nature of signup, and how [BrowserBash](https://www.npmjs.com/package/browserbash-cli) lets you write the whole funnel as plain-English objectives an AI agent drives in a real Chrome browser. I'll also be straight about where a hand-coded Playwright script is still the better tool.

## What "signup funnel testing" actually covers

People say "test the signup" and mean wildly different scopes. Before you automate anything, get specific about which links in the chain you are asserting. A complete signup funnel, for a typical SaaS product, looks like this:

1. **Landing.** The visitor hits a marketing page or a `/sign-up` route. There's a CTA, maybe a pricing toggle, maybe a "Start free" button that scrolls to or routes to the form.
2. **Registration form.** Name, work email, password (with a strength meter that rejects weak passwords), sometimes a company name or a "how did you hear about us" select. Inline validation fires as you type.
3. **Account creation.** Submit. The backend creates a user, possibly a workspace/org, and either logs you straight in or sends you to a "check your email" interstitial.
4. **Verification.** A confirmation email (or SMS) with a magic link or a 6-digit code. Clicking the link or entering the code flips `email_verified` to true and unblocks the account.
5. **Onboarding / first dashboard.** The verified user lands somewhere — a welcome wizard, an empty-state dashboard, or a populated one if you seed sample data. This is where you confirm the account is real and usable.

Signup funnel testing is the discipline of asserting each transition, not just the happy submit. The angle this article takes — **register, then verify the dashboard** — is the spine of the whole thing: you create a genuinely new account and prove the user reaches a working, authenticated dashboard on the other side. If that single journey is green on every deploy, you've covered the flow that matters most to growth.

### Why teams under-test it

Three reasons, and they're all understandable. First, signup is **stateful and one-time** — a registration test creates a real user, so you can't just re-run it with the same email; you need a fresh, unique identity each time. Second, it **crosses systems** — web form, app backend, an email or SMS provider, then back to the web. Most UI test tools live entirely inside the browser and have no clean way to read the verification email. Third, the funnel **changes constantly** because growth teams A/B test it relentlessly; a selector-based test written against last sprint's form is stale by the next experiment. So teams test login (stable, repeatable) and leave signup to manual smoke checks. Then a form regression ships on a Friday and nobody notices until Monday's signups crater.

## Why selectors make registration tests brittle

A traditional Playwright or Selenium signup test is a list of locators: `page.fill('#email', ...)`, `page.click('[data-testid="submit"]')`, `page.waitForSelector('.dashboard-header')`. That works the day you write it. It breaks the next time the growth team reorders the form fields, renames a `data-testid`, swaps the single-page form for a two-step wizard, or moves the CTA from a button to a link. None of those are real regressions — the funnel still works for users — but your suite goes red, and now you're maintaining tests instead of testing.

The deeper problem is coupling. A selector test is bound to the *markup*, while signup is one of the most frequently-restyled surfaces in your product. Growth wants to move the password field, shorten the form, add social login, test a new headline. Every experiment is a potential break for a brittle test, so either the suite rots or QA spends its week reattaching selectors to a form that keeps moving.

[BrowserBash](https://browserbash.com/features) attacks that coupling. You describe the funnel the way a user experiences it — "register with the email and password I give you, then confirm you land on a dashboard" — and an AI agent figures out the fields and buttons on the live page at run time. There's no `#email`, no `data-testid`, no explicit wait. When growth reorders the fields, the agent still finds them. That's the whole point of describing intent instead of mechanics.

## How BrowserBash drives the register-and-verify flow

BrowserBash is a free, open-source CLI from The Testing Academy. You install it once, write a plain-English objective, and an AI agent drives a real Chrome browser step by step, returning a pass/fail verdict plus any structured values you asked it to extract. There are no selectors and no page objects anywhere in your tests.

Install it and run your first signup check:

```bash
npm install -g browserbash-cli

browserbash run "Go to https://staging.example.com/sign-up, register a new account with name 'Test User', email 'qa+run1@example.com', and password 'Str0ng-Passw0rd!', submit the form, and verify you reach a page that confirms the account was created. Store the post-signup heading as confirmation."
```

The agent opens Chrome, finds the form, types the values, clicks the real submit button, waits for the page to settle, and checks that the confirmation appeared. You get a verdict and the extracted `confirmation` value back. No locators were harmed.

### The model story: $0 by default

BrowserBash is **Ollama-first**. The default model is `auto`, which resolves in order: a local Ollama install (free, no API keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (`claude-opus-4-8`), then `OPENAI_API_KEY` (`openai/gpt-4.1`). If you have Ollama running, your entire signup suite costs nothing and never sends a byte of your staging data to a third party — which matters when a registration test handles real-ish PII.

Be honest with yourself about model size, though. A signup-to-dashboard journey is a genuinely long, multi-step objective: navigate, fill five fields, submit, wait, read an email, click a link, verify a dashboard. Very small local models (8B and under) get flaky on chains that long — they lose track of the goal or misread a confirmation screen. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model when the flow is hard. You can pin the model explicitly when you want determinism:

```bash
# Free, fully local — good once you've sized up from a tiny model
browserbash run "register a new account at https://staging.example.com/sign-up ..." --model ollama/qwen3

# A hosted model for the hardest flows, with a generous timeout for email round-trips
browserbash run "register and verify the dashboard ..." --model claude-opus-4-8 --timeout 180
```

## Handling email verification — the step that trips most tools

The hardest part of signup funnel testing isn't the form; it's the email in the middle. Your registration flow sends a confirmation link or a code, and the account stays half-dead until that link is clicked. A browser-only test tool can't read your inbox, so most teams either stub verification out (and stop testing the real flow) or skip it entirely.

BrowserBash drives a real browser, so the practical pattern is to use a web-accessible test inbox and let the agent read it like a person would. Point your staging signups at a catch-all or a disposable-inbox service that has a web UI (the kind QA teams already use for email testing), then write the verification as two linked objectives — or one longer one — that the agent walks through:

```bash
browserbash run "Open https://inbox.example-test.com, find the most recent email to qa+run1@example.com with a subject about confirming your account, open it, and click the verification link. Then verify the resulting page shows the account is now active or redirects to a dashboard."
```

Because the agent navigates the inbox UI the same way it navigates your app, you're testing the *actual* email — the real subject line, the real link, the real landing behavior — not a mock. If your verification is a 6-digit code instead of a link, ask the agent to extract it: "read the 6-digit confirmation code from the email and store it as `code`," then feed that into the next step where it types the code into your verification field.

### Generating a unique identity each run

Signup is one-time by nature, so reusing `qa+run1@example.com` fails the second time with "email already registered." Use the plus-addressing trick (`qa+<timestamp>@example.com` all routes to one inbox) or a per-run variable. Markdown tests make this clean with `{{variables}}` templating — generate the unique email in CI and pass it in, so every run registers a genuinely fresh account and your assertions stay honest.

## Verifying the dashboard, not just the redirect

Reaching `/dashboard` is not the same as the dashboard *working*. The most common first-session bug is an empty or broken initial state: the welcome wizard throws, the data grid spins forever because the new org has no seed data, or the user's name renders as `undefined`. A test that only checks the URL changed will happily pass through all of those.

So make your final assertion about something a real user would see and care about. Be specific:

- **Identity is correct.** "Verify the page shows a greeting containing the name 'Test User' or the email I registered with." This catches the `Hello, undefined` class of bug.
- **The authenticated shell rendered.** "Verify a navigation element with a 'Log out' or 'Account' option is visible" — proof you're actually logged in, not bounced back to the login page.
- **First-run state is sane.** "Verify the dashboard shows either an onboarding step or an empty-state message, and that no error or 'something went wrong' text is present." A fresh account legitimately has no data; the test should accept the empty state but reject an actual error.

BrowserBash's `extract`/`store ... as` lets you pull values out of that dashboard and return them in the structured result, so a downstream CI step (or an AI coding agent) can assert on them without parsing prose. That structured output is the difference between "the test passed" and "the test passed and here is the org ID it created."

## Wiring the full funnel into CI

A signup check is only worth it if it runs on every deploy. BrowserBash is built for that. The `--agent` flag turns the run into machine-readable NDJSON — one JSON object per line — with progress events and a terminal `run_end` carrying the status and any extracted state. Exit codes do the gating for you: `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, no scraping logs.

For anything you run repeatedly, move it out of a one-shot string and into a committable markdown test. A `*_test.md` file is just a list of steps, supports `{{variables}}` templating and `@import` composition, masks any secret-marked variable as `***** ` in every log line, and writes a human-readable `Result.md` after each run. Your signup funnel becomes a reviewable artifact your team can diff in pull requests.

```bash
# In CI: machine-readable, headless, with room for the email round-trip
browserbash testmd run signup_funnel_test.md \
  --agent --headless --timeout 240 \
  --variables-file ./ci-vars.json
```

Mark the test password and any API keys as secret in your variables file so they never appear in CI logs. Pass a per-run unique email in through that same file. Turn on `--record` when you need to debug a failure — it captures a screenshot plus a `.webm` session video (the builtin engine also writes a Playwright trace), which is exactly what you want when a flaky signup fails at 3 a.m. and you need to see *where* the agent and your form disagreed. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200), so you always have recent history without setting anything up.

If you want a shareable view of those runs, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — no account, nothing uploaded. When you want history your whole team can see, `browserbash connect --key bb_...` links a free cloud dashboard and you opt in per run with `--upload`; without that flag, nothing leaves your machine. The [pricing page](https://browserbash.com/pricing) has the details, but the headline is that the CLI itself is free and open source under Apache-2.0.

## A repeatable signup-testing workflow

Here's the loop that works in practice, start to finish.

Begin in development with a single `browserbash run "..."` objective and a visible browser so you can watch the agent fill your form. Use a unique email and a specific final `verify` about the dashboard. Tighten the wording until it passes reliably — when the agent hesitates, it's usually because your instruction was ambiguous, not because the tool is broken. "Verify a dashboard" is weak; "verify the page shows a greeting with the registered name and a visible 'Log out' control" is strong.

Once the happy path is solid, add the **rejection paths** that protect your funnel. Write a companion objective that submits a weak password and asserts the strength validation blocks it, and another that submits a duplicate email and asserts the "already registered" error. These are the assertions that catch a backend that silently accepts garbage — far more valuable than the third variation of the happy path.

Then move the steps into `signup_funnel_test.md`, parameterize the email and password as `{{variables}}`, and mark the password secret. Because most of your other authenticated tests start from a logged-in account, expose the registration as an `@import` helper so they don't each re-implement it.

Finally, wire it into CI with `--agent --headless --timeout` and a `--variables-file` from your secret store, generating a fresh unique email per run. The exit code gates the merge. Turn on `--record` for failures, and reach for a different `--provider` when you need the funnel verified on a real cross-browser grid. The [tutorials](https://browserbash.com/tutorials) walk through each of these stages with full examples.

## Where a hand-coded script is still the better call

I'd be lying if I said AI-driven signup testing wins every time. Be clear-eyed about the trade-offs.

| Concern | BrowserBash (AI-driven) | Hand-coded Playwright/Cypress |
| --- | --- | --- |
| Survives form redesigns | Strong — describes intent, finds fields at run time | Brittle — selectors break on markup changes |
| Reads the verification email | Natural — agent navigates a web inbox like a user | Possible but you wire up an IMAP/API client yourself |
| Setup speed | Minutes — install, write one English objective | Hours — locators, waits, page objects, email plumbing |
| Per-run cost | $0 on local Ollama; pennies on a hosted model | $0 model cost, but engineer time to build and maintain |
| Determinism | Lower — an agent can interpret a step two ways | Higher — same selectors, same path, every time |
| Sub-second precision timing | Not the tool for it | Better — exact waits, network assertions |
| Existing large suite | New thing to adopt | You already have the framework |

Choose a hand-coded script when you need byte-exact determinism, when you're asserting on precise network requests or response timing, or when you already maintain a healthy Playwright suite and signup is just one more spec. Choose BrowserBash when the funnel changes often enough that selectors are a tax, when you want the verification email tested for real without building an email client, or when you want a check running this afternoon instead of next sprint. Plenty of teams run both — a thin AI-driven smoke test that proves "a human can sign up right now," backing a deeper deterministic suite for the edge cases. The [case studies](https://browserbash.com/case-study) show a few of those setups in practice.

## Who this is for

If you're a founder who wants a single command that answers "can someone sign up right now?" before every deploy, this is squarely for you — the setup is minutes and the model bill can be zero. If you're an SDET drowning in selector maintenance on a funnel the growth team won't stop A/B testing, the intent-based approach removes the coupling that's costing you. And if you're a small team with no dedicated QA, a committable `signup_funnel_test.md` gives you a real end-to-end safety net without a framework to learn. The [learn hub](https://browserbash.com/learn) is the place to go deeper once you've run your first check.

## FAQ

### How do I automate signup funnel testing without writing selectors?

Describe the funnel as a plain-English objective and let an AI agent drive a real browser. With BrowserBash you write something like "go to the sign-up page, register a new account with this email and password, confirm the email, and verify you reach a working dashboard," and the agent finds every field and button on the live page at run time. There are no CSS selectors, XPaths, or page objects to write or maintain, which is why these tests survive the redesigns that break selector-based suites.

### Can a browser automation tool actually click the email verification link?

Yes, if you point your test signups at an inbox that has a web interface. BrowserBash drives a real Chrome browser, so it can open a web-accessible test inbox, find the most recent confirmation email, and click the verification link exactly as a person would. For code-based verification you can ask the agent to read the 6-digit code out of the email and type it into your verification field. This tests the real email — real subject, real link, real landing page — rather than a stubbed mock.

### How do I stop the signup test failing on "email already registered"?

Generate a unique email address for every run instead of reusing a fixed one. The simplest approach is plus-addressing, where `qa+1717545600@example.com` and `qa+1717631999@example.com` both route to the same real inbox but register as distinct accounts. In CI, generate the unique value per run and pass it in through a BrowserBash variables file using `{{variables}}` templating, so each run creates a genuinely fresh account and your assertions stay honest.

### Does running signup tests send my staging data to a cloud service?

Not unless you choose to. BrowserBash is Ollama-first, so if you have a local model running, the entire test runs on your machine and no data leaves it — the model bill is also $0. Run history is kept locally at `~/.browserbash/runs` with secrets masked, and the local dashboard at localhost:4477 needs no account. The only time anything is uploaded is when you explicitly link a cloud dashboard with `connect` and pass `--upload` on a specific run; without that flag, everything stays local.

---

Ready to prove a real person can register and reach a working dashboard on every deploy? Install with `npm install -g browserbash-cli`, point it at your staging signup, and write the funnel as one plain-English objective. BrowserBash is free and open source under Apache-2.0 — [create a free account](https://browserbash.com/sign-up) when you want shareable run history, though you never need one to run a single check.
