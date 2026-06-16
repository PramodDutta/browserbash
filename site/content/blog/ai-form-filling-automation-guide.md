---
title: AI Form-Filling Automation: Handle Any Form Without Selectors
description: "AI form filling automation that handles dynamic and multi-step forms without selectors. Fill fields by intent and mask secret variables in logs."
date: 2026-02-21
category: use-case
---

AI form filling automation is the practice of letting a model read a live page, decide which field means what, and type the right value into each one — without you hand-writing a single selector. Instead of `page.fill("#email", ...)` followed by twelve more lines pinning every input to a brittle DOM path, you hand an agent a plain-English objective and a small bag of values, and it drives a real browser the way a person would: look at the form, find the email field, type the address, move to the next one. For the forms that break scripted automation — multi-step wizards, conditionally rendered fields, address autocompletes, dynamic validation — this is less a convenience and more a survival strategy. This guide explains how it works, where it earns its keep, where it doesn't, and how to run it for free with [BrowserBash](https://browserbash.com/features), an open-source CLI built around the idea.

The honest framing up front: this is not magic. A model filling a checkout form can misread a label, pick the wrong option in an ambiguous dropdown, or stall on a CAPTCHA the way a junior tester would. What it buys you is resilience to the one thing that wrecks selector scripts more than anything else — the markup changing underneath you.

## Why forms are where selector scripts go to die

Most tutorials use a login form as the "hello world" because it's the easy case: two fields and a button. Real forms are nothing like that. They are the most JavaScript-heavy, most frequently redesigned, most state-dependent part of any app — exactly what selectors handle worst.

Consider what a typical "simple" signup or checkout form actually does on a modern stack:

- **Fields appear and disappear based on prior answers.** Pick "Business" as account type and a VAT field materializes. Choose "Ship to a different address" and six inputs slide in. A selector written against the collapsed state has nothing to bind to until the field exists.
- **Inputs aren't real inputs.** A "dropdown" is a styled `<div>` listening for clicks, not a `<select>`. A date picker is a calendar widget. A phone field is three boxes that auto-advance. `fill()` on any of these silently does nothing or throws.
- **Validation rewrites the DOM as you type.** Inline errors inject and remove wrapper elements, shifting every `nth-child` index downstream. The selector was correct when you wrote it and wrong by the time the test reaches it.
- **The markup is generated.** CSS-in-JS class names like `css-1q8x7h` are recomputed on every dependency bump, so a selector keyed to one breaks on a build that touched no source you care about.

None of these are bugs. They're normal frontend behavior. But each one couples your test to an implementation detail — the DOM path — when what you actually care about is the behavior: the form accepts valid data and rejects invalid data. AI form filling automation moves the fragile part, the field-targeting logic, out of your codebase and into a model that re-derives it on every run against whatever the page actually looks like right now.

## How filling fields by intent works

Here's the mental model. A selector-based tool needs you to answer "where is the email field?" with a path. An agent answers with a description and resolves it against the live page at runtime.

When you give BrowserBash an objective like "fill the registration form with a test user and submit," the agent does roughly what you'd do by hand:

1. It looks at the rendered page — the accessibility tree, visible labels, placeholder text, surrounding context.
2. It reasons about which element corresponds to each piece of data. "Email" matches the input whose label, placeholder, or aria-name says email, regardless of its CSS class or position.
3. It performs a real interaction — focusing the field, typing the value — through a genuine Chrome/Chromium browser, not a synthetic DOM write.
4. It observes the result, including validation errors or newly revealed fields, and decides what to do next.

That last step is the one selector scripts can't do. Because the agent re-reads the page after each action, a conditionally rendered field that appears after you pick "Business" is just there on the next look, and the agent fills it. No waiting logic you forgot to add, no race condition, no selector for an element that didn't exist yet.

You describe intent; the model handles the targeting. When a designer renames a wrapper class or reorders two fields next sprint, nothing in your test changes, because your test never mentioned the class or the order. It said "fill in the email," and email is still email.

### What "by intent" looks like in practice

BrowserBash is a natural-language CLI. You write the objective in English and an AI agent drives a real browser step by step, then returns a verdict plus structured results. A basic form fill is one command:

```bash
browserbash run "Go to https://demo.shop/signup, fill the registration \
  form with first name Ada, last name Lovelace, email ada@example.com, \
  choose Business account type, agree to the terms, and submit. \
  Confirm you land on the welcome page."
```

There are no selectors anywhere in that. "The registration form," "Business account type," "the terms" — those are descriptions a human would use, and the agent resolves them against the page. For a multi-step wizard, you describe the steps in order and the agent walks through them, clicking Next and filling whatever each page presents.

## Multi-step wizards and dynamic forms

The hardest forms for traditional automation are the multi-page kind: onboarding that spans five screens, a checkout that goes cart → shipping → payment → review, an insurance quote that branches on a dozen earlier answers. Scripted automation stitches these together with a long chain of selectors and explicit waits, and every join is a place to break.

Agents handle multi-step flows more naturally because the model carries the objective across steps and re-evaluates each page. You don't pre-declare every field on page three; you declare the goal, and when the agent gets to page three it reads what's there.

A checkout objective reads almost like a test plan in English:

```bash
browserbash run "Log in to the store, add the first product to the cart, \
  go to checkout, fill shipping with a test address, select the cheapest \
  shipping option, enter the test card, place the order, and verify the \
  page shows 'Thank you for your order!'"
```

That single objective spans login, search, cart, a multi-page checkout, a dynamic shipping list, and a final check. A selector script for the same flow is dozens of brittle lines; here it's the user story itself.

The honesty caveat matters here. Long multi-step objectives are where model quality shows. Very small local models — roughly 8B parameters and under — can lose the thread on a ten-step flow: they fill the wrong field, forget a step, or hallucinate a button that isn't there. The sweet spot for hard, branching forms is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model. For a two-field login a tiny model is fine; for a five-page underwriting wizard, give the agent a better brain.

## Handling secret values without leaking them

Forms need secrets. Passwords, API tokens, test credit cards — the moment you automate form filling at scale, you're feeding sensitive values into a tool that logs what it does. The naive approach prints those values straight into your CI logs, terminal scrollback, and any run history you keep. That's a credential leak waiting to happen.

BrowserBash addresses this with `{{variables}}` templating and secret masking. You define the values your form needs as variables, mark the sensitive ones as secret, and BrowserBash substitutes the real value into the action while writing `*****` to every log line. The agent types the real password into the field; your logs never see it.

This lives in BrowserBash's Markdown test format — committable `*_test.md` files where each list item is a step. Here's a login-and-update-profile flow with a masked password.

```bash
browserbash testmd run ./profile_test.md
```

```markdown
# Update profile

- Go to {{baseUrl}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field
- Click Sign in
- Go to the profile settings page
- Change the display name to {{displayName}}
- Save and confirm the page shows "Profile updated"
```

`password` is declared as a secret variable, so even though the agent types the real value into the field, every log line and the written `Result.md` show `*****` instead. The same masking applies to API keys and test card numbers. You get a committable, reviewable form test that a teammate can read in a pull request without ever seeing the credentials baked into it.

The Markdown format has two more properties that matter for forms. First, `@import` composition: a login flow you write once can be imported into every form test that needs an authenticated session, so you're not copy-pasting the same six steps into twenty files. Second, every run writes a human-readable `Result.md` summarizing what happened — useful when a form test fails and you need to see which step the agent got stuck on without rerunning anything.

## The model story: local-first, $0 by default

A fair question about any AI tool is "what does it cost to run and where does my data go?" For form filling that second question is sharp, because you're piping real (even if test) personal data and credentials through the model.

BrowserBash is Ollama-first. By default it uses free local models through your own Ollama install — no API keys, nothing leaving your machine. For form automation that's the privacy story you want: page contents, the values you type, and the credentials all stay local. It auto-resolves a provider chain — local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — so it uses what you have without you wiring anything up.

If you'd rather use a hosted model, it supports OpenRouter (including genuinely free options like `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key. The trade-off is the usual one:

| Setup | Cost | Data leaves machine | Best for |
|---|---|---|---|
| Local Ollama (default) | $0 | No | Privacy-sensitive forms, credentials, offline work |
| Mid-size local (Qwen3 / Llama 3.3 70B-class) | $0 (your hardware) | No | Hard multi-step wizards, branching forms |
| OpenRouter free model | $0 | Yes | Quick trials without local GPU |
| Anthropic Claude (your key) | Per-token | Yes | Maximum reliability on the gnarliest flows |

The practical guidance: start local. For login forms and short flows, a small local model gets you a $0 bill and full privacy. When you hit a long, branching form that a small model fumbles, step up to a mid-size local model before reaching for a paid API — that usually fixes flakiness without spending anything or sending data off-box. Keep the hosted option for the genuinely hard flows where reliability is worth a few cents a run. There's more on running [browser automation without API keys](https://browserbash.com/learn) if cost is what's holding you back.

## Putting it in CI: agent mode and exit codes

Form tests aren't worth much if they only run on your laptop. The point is to catch a broken signup or checkout before it ships, which means running them in CI on every deploy. BrowserBash has a mode for that.

`--agent` makes BrowserBash emit NDJSON — one JSON event per line on stdout — instead of prose. Your pipeline or an AI coding agent reads the stream event by event; there's no scraping human-readable text. The exit code tells the pipeline the verdict: `0` passed, `1` failed, `2` error, `3` timeout. That's a clean contract for a CI gate.

```bash
browserbash run "Fill the contact form with test data and verify the \
  success message appears" --agent --headless
```

Run that in a GitHub Actions step, key the job on the exit code, and a regression that breaks your contact form turns the build red — without anyone parsing logs. Because the agent targets fields by intent, the test survives the routine markup churn that would otherwise have you patching selectors every sprint. The relevant comparison is maintenance cost over a quarter, not pass rate on day one: two suites might both pass today, but only the intent-based one keeps passing through three frontend refactors.

To debug a form test that failed in CI, add recording. `--record` captures a screenshot and a full `.webm` session video on any engine, so you can watch exactly where the agent went wrong — which field it misread, where validation blocked it. On the builtin engine you also get a Playwright trace for the trace viewer.

```bash
browserbash run "Complete the multi-step checkout with test data" \
  --record --upload
```

The optional `--upload` flag sends the run to the free cloud dashboard for run history, video, and per-run replay. It's strictly opt-in — you connect once with `browserbash connect` — and free uploaded runs are kept 15 days. If you'd rather keep everything local, `browserbash dashboard` gives you a fully local dashboard with no upload at all. The full breakdown of engines and providers lives in the [BrowserBash repo on GitHub](https://github.com/PramodDutta/browserbash).

## Where the browser runs: providers for scale

By default the agent drives your own local Chrome — fast, free, watchable. But sometimes you need the form filled somewhere else: across real browser/OS combinations, or at parallel scale without spinning up browsers on your runner.

BrowserBash switches where the browser runs with a single `--provider` flag, and your objective doesn't change:

- **local** (default) — your own Chrome, $0, full privacy.
- **cdp** — any DevTools endpoint, so you can point at a browser you manage.
- **browserbase**, **lambdatest**, **browserstack** — managed cloud grids for cross-browser coverage and scale.

So a form test you validated locally can run against a real Safari on a cloud grid by adding one flag:

```bash
browserbash run "Fill and submit the booking form, verify confirmation" \
  --provider lambdatest --headless
```

That matters because form bugs are often browser-specific: a date picker that works in Chrome misbehaves in Safari, an autocomplete that fires in Firefox doesn't in Edge. Running the same intent-based test across a grid without rewriting a line is leverage selectors never gave you, since a selector tuned to one browser's quirks often needed per-browser babysitting anyway.

## When to use AI form filling automation — and when not to

Honesty over hype. Intent-based form filling is the right tool for a specific set of jobs, and the wrong tool for others.

### Strong fit

- **Forms that change often.** If your signup or checkout gets redesigned every quarter, the savings from not having selectors are immediate. This is the headline use case.
- **Dynamic and multi-step forms.** Conditional fields, branching wizards, custom dropdowns and date pickers — the cases where `fill()` fails and agents shine.
- **End-to-end smoke tests of critical flows.** "Can a user actually sign up / check out / book?" answered in plain English, run on every deploy.
- **Exploratory and ad-hoc filling.** One-off "fill this form with test data and tell me what breaks" tasks where a script isn't worth it.
- **Privacy-sensitive form data.** Local-first models mean credentials and personal data you type never leave your machine.

### Weak fit (be honest)

- **High-volume submission.** To hammer a form ten thousand times for load testing, a direct HTTP or selector-based script is faster and cheaper than an agent reasoning about each field.
- **Forms behind hard CAPTCHA.** An agent driving a real browser is more human-like than a raw script, but a CAPTCHA designed to stop automation stops it too. That's the CAPTCHA working as intended.
- **Never-changing forms in a tight loop.** If a form genuinely never changes and you run it constantly, a stable selector script has lower per-run overhead. Agents earn their keep when the page is volatile.
- **Pixel-exact field validation.** If your assertion is "this error is exactly 2px from the field," that's a visual test, and you want a different tool.

The decision rule is simple: the more a form changes and the more dynamic it is, the more an intent-based agent beats selectors. The more static and performance-critical, the more a traditional script wins. Many teams run both — agents for the flaky flows, scripts for the stable, high-volume ones. There's a deeper treatment of this trade in the writeup on [browser automation without selectors](https://browserbash.com/blog).

### A quick comparison

| Concern | Selector script | AI form filling automation |
|---|---|---|
| Conditional / dynamic fields | Manual waits, brittle | Re-reads page each step |
| Markup refactor | Breaks, needs patching | Usually survives |
| Custom dropdowns / date pickers | Special handling per widget | Treated like a human would |
| Authoring effort | Per-field selectors | One English objective |
| High-volume / load | Faster | Slower, more overhead |
| Determinism | Fully deterministic | Model-dependent |
| Secret handling | DIY | Built-in `{{secret}}` masking |

Neither column is "better" in the abstract. They're better at different jobs, and knowing which is which is the skill.

## Getting from zero to a working form test

If you want to try this, the path is short. Install the CLI, point it at a form, describe what to fill. No account, no signup, nothing to configure for a local run.

```bash
npm install -g browserbash-cli
browserbash run "Open https://httpbin.org/forms/post, fill the customer \
  name with Ada, pick medium pizza size, add bacon as a topping, set \
  delivery time to 18:30, and submit the order"
```

That runs against your local Chrome with a local model and prints a verdict plus structured results. From there, the progression is natural: convert the throwaway objective into a committable `*_test.md` file, parameterize the values with `{{variables}}`, mark the sensitive ones secret, and wire `browserbash testmd run` into CI with `--agent`. Now you have a form test that reads like documentation, survives redesigns, and never leaks a credential to your logs.

For teams, the [case studies](https://browserbash.com/case-study) show how this scales to whole suites of critical-flow checks, and the [pricing](https://browserbash.com/pricing) page lays out what stays free.

## FAQ

### Can AI fill forms without writing CSS or XPath selectors?

Yes. With an intent-based tool like BrowserBash you describe the field in plain English — "the email field," "the Business account type" — and an AI agent resolves it against the live page and types the value. You never write a CSS or XPath selector, and the test keeps working when the markup changes, because it targets fields by meaning rather than DOM path.

### How does AI form filling automation handle multi-step and dynamic forms?

Because the agent re-reads the page after each action, it handles conditional fields and multi-page wizards naturally. When a new field appears after an earlier answer, the agent sees it on the next look and fills it, with no pre-declared waits or selectors. You describe the steps in order, and the model carries that objective across every screen of the flow.

### How are passwords and secrets protected when automating forms?

BrowserBash uses `{{variables}}` templating with secret marking. You define sensitive values like passwords or test card numbers as secret variables, and the tool substitutes the real value into the field while writing `*****` to every log line and to the generated Result.md. The agent types the real credential, but your logs and run history never expose it.

### Is AI form filling reliable enough to use in CI?

For most form flows, yes, especially with agent mode. The `--agent` flag emits NDJSON and returns clean exit codes (0 passed, 1 failed, 2 error, 3 timeout) so a pipeline can gate on the result without parsing prose. Reliability scales with model quality: short forms run fine on small local models, while long branching wizards do better on a mid-size or capable hosted model.

Ready to fill any form without a single selector? Install with `npm install -g browserbash-cli` and point it at your hardest signup or checkout — an account is optional, and you can grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up) when you want cloud run history and video replay.
