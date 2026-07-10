---
title: Test Stytch Passwordless Auth in Plain English
description: "Learn to test Stytch auth (email magic links and SMS OTP) by writing plain-English objectives, plus the honest truth about real OTP delivery."
date: 2026-05-23
category: security
---

If you have ever tried to write an automated test for a passwordless login, you already know the pain. There is no password field to fill, the "credential" arrives in an inbox or an SMS a few seconds later, and the whole flow depends on timing you do not control. This guide shows you how to test Stytch auth by describing what a user does in plain English, letting an AI agent drive a real browser through the magic-link and one-time-passcode screens, and returning a deterministic verdict. It also stays honest about the one part nobody can hand-wave: getting a real code out of a real inbox.

Stytch is a popular passwordless authentication platform, and its email magic link and SMS OTP flows look simple on screen but are genuinely awkward to automate with selectors. The goal here is to keep your tests readable, keep them tied to user intent rather than brittle CSS, and be clear about where you still need real infrastructure. By the end you will have runnable commands, a committable test file, and a realistic sense of what an AI-driven approach can and cannot do for you.

## What Stytch actually does, and why it matters for testing

Stytch provides authentication primitives so product teams do not have to build login from scratch. Publicly, Stytch supports email magic links, SMS and WhatsApp one-time passcodes, passkeys, OAuth social logins, and embeddable UI components. The exact internal architecture and current pricing are not something I will invent here; check Stytch's own docs for the authoritative details. What matters for testing is the shape of the user experience, and that shape is consistent across passwordless providers.

A typical Stytch email flow goes like this: the user lands on a login screen, types an email address, clicks a "Continue" or "Send magic link" button, sees a "check your email" confirmation, opens the email, clicks the link, and lands authenticated inside the app. The SMS variant swaps the email for a phone number and asks the user to key a 6-digit code into an input on the same page. Both flows share one trait that breaks conventional test scripts: the credential is generated server-side and delivered out of band.

That out-of-band delivery is exactly why so many teams skip end-to-end coverage of their login and hope for the best. They mock the auth provider, or they test everything downstream of a pre-seeded session, and the real screens (the ones users actually touch) go untested. When Stytch ships a UI change or your integration drifts, nobody notices until a support ticket arrives.

## Why passwordless auth resists traditional automation

Classic UI automation binds a test to the page's structure. You write `page.click('#send-magic-link')` and `page.fill('input[name="otp"]', code)`, and the moment Stytch's embeddable component re-renders with a different class name or DOM order, your test snaps. Passwordless flows make this worse in three specific ways.

First, the confirmation screens are transient and easy to misread. A "we sent you a link" state and an error state can look structurally similar, so a selector-based assertion that only checks for an element's presence often passes when the flow actually failed.

Second, the credential retrieval step has no DOM at all. The magic link lives in an email; the OTP lives in a text message. No amount of clever selector work reaches into a mailbox. You need a separate channel.

Third, timing is nondeterministic. Delivery can take one second or fifteen. Hard-coded waits make suites slow and flaky, and polling logic bloats every test with retry code that has nothing to do with the behavior you meant to verify.

Testing by intent addresses the first and third problems directly and gives you a clean seam for the second. Instead of encoding structure, you describe the user's goal, and an agent figures out which element satisfies it right now. That is the core idea behind [BrowserBash](https://browserbash.com/features), the open-source validation layer this guide uses.

## Testing by intent: the plain-English approach

BrowserBash is a free, open-source CLI. You install it once, write an objective in ordinary English, and an AI agent drives a real Chrome browser step by step, then returns a verdict. There are no selectors and no page objects in the test itself.

```bash
npm install -g browserbash-cli

browserbash run "Open https://your-app.example/login, type qa+stytch@your-app.example into the email field, click the Send magic link button, and confirm a message about checking your email appears" --agent --headless
```

The `--agent` flag emits NDJSON, one JSON event per line, so CI and other AI tools can read the result without parsing prose. Exit codes are stable: 0 passed, 1 failed, 2 error, 3 timeout. That objective covers the front half of a Stytch email flow, the part with a real DOM, entirely by intent. If Stytch reshuffles its embeddable component tomorrow, the agent still finds the email field and the send button because you described their purpose, not their markup.

By default BrowserBash is Ollama-first. It looks for a local model before reaching for any hosted API, so nothing has to leave your machine and you do not need to hand over an API key to try it. It auto-resolves in a sensible order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. One honest caveat worth setting up front: very small local models (roughly 8B parameters and under) get flaky on long multi-step objectives. For a multi-screen auth flow, lean on a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model. The [tutorials](https://browserbash.com/tutorials) walk through model selection in more depth.

## Writing a committable Stytch test in a markdown file

One-liners are great for exploration, but real suites live in files you commit next to your code. BrowserBash uses `*_test.md` files: a title, a list of steps, `{{variables}}` for templating, and `Verify` steps that compile to deterministic Playwright checks instead of asking a model to judge.

Here is a Stytch email magic link test written as a v2 test file. The `version: 2` frontmatter makes steps run one at a time against a single browser session, and it lets you mix deterministic assertions with plain-English actions.

```bash
cat > stytch_magic_link_test.md <<'EOF'
---
version: 2
---
# Stytch email magic link request

- Open https://your-app.example/login
- Type {{qa_email}} into the email address field
- Click the "Send magic link" button

Verify text "Check your email" is visible
Verify "Resend" button visible
EOF

browserbash testmd run ./stytch_magic_link_test.md --agent
```

The three plain-English steps run as an agent block on the same page. The two `Verify` lines are deterministic: "text visible" and "'name' button visible" are part of the Verify grammar, so they compile to real Playwright expectations with no LLM judgment. A pass means the condition genuinely held; a fail arrives with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable `Result.md` that gets written after every run. That split matters for auth testing, where you want the "did the confirmation actually render" check to be a hard, non-negotiable assertion rather than a model's opinion.

Note that testmd v2 currently runs on the builtin engine, which speaks the Anthropic API (or an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`). It does not yet run directly on Ollama or OpenRouter. If you are staying fully local for now, keep your deterministic seeding lighter and drive the flow with a plain `browserbash run` objective on a local model instead.

## The honest problem: getting a real code out of a real inbox

Here is where I refuse to hand-wave, because the angle of honest testing is the whole point. Everything above verifies that your app *requests* a magic link or OTP correctly. It does not, by itself, retrieve the actual code Stytch delivers and complete the login. Reaching into a live mailbox or SMS gateway is a genuinely separate concern, and any tool that claims to make it trivial is selling you something.

There are three realistic strategies, and they trade off differently.

### Strategy 1: a controlled test environment with known codes

The cleanest approach is to make delivery deterministic in non-production. Many teams configure a staging environment where the OTP is fixed or where the code is surfaced through a test-only endpoint. If your staging setup returns the code you can then inject it as a variable and drive the rest of the flow by intent:

```bash
browserbash run "Open the login page, request an SMS code for {{test_phone}}, then type {{otp_code}} into the verification input and confirm the dashboard loads" --agent --headless
```

Secret-marked variables are masked as `*****` in every log line, so a real code or token never leaks into your CI output. This strategy is fast and non-flaky, and it is the right default for most suites. Its limit is honesty of coverage: you are testing your UI and your integration wiring, not Stytch's actual delivery pipeline.

### Strategy 2: a real test mailbox for true end-to-end coverage

If you genuinely need to prove that an email lands and its link works, you need a real inbox your test can read. In practice that means an IMAP-accessible mailbox (or a transactional email testing service) that you poll for the newest Stytch message, extract the magic link, and navigate to it. This is the part that needs infrastructure you set up outside the browser. BrowserBash drives the browser side of the flow by intent, but you supply the code or link as a variable after your mailbox tooling has fetched it. Be clear-eyed that this path is slower and has more moving parts, which is exactly why teams reserve it for a small number of critical happy-path checks rather than every test.

### Strategy 3: skip credential retrieval and seed a session

Sometimes the login itself is not what you are testing; you just need to be authenticated so you can test something downstream. In that case, do the auth once by hand and reuse the session, which the next section covers.

Whichever you pick, name the tradeoff in your test's title so the next engineer knows what it does and does not cover. A test called "Stytch email request renders confirmation" is honest. A test called "Stytch full login works" had better actually retrieve and use a real code.

## Reusing a session so you do not re-authenticate every test

Passwordless flows are expensive to run repeatedly. If every test in your suite has to complete a magic-link dance, your suite is slow and your Stytch usage metrics look strange. BrowserBash's saved logins solve this. You authenticate once, interactively, and BrowserBash captures the session as a Playwright storageState profile.

```bash
browserbash auth save stytch-qa --url https://your-app.example/login

browserbash testmd run ./dashboard_smoke_test.md --auth stytch-qa --agent
```

The first command opens a browser, you complete the real Stytch login yourself (magic link, OTP, passkey, whatever your app uses), and pressing Enter saves the session. From then on, `--auth stytch-qa` on any `run`, `testmd`, `run-all`, or `monitor` command starts already logged in. You can also put `auth:` in a test file's frontmatter. If a saved profile's origins do not cover the start URL you point it at, BrowserBash prints a warning instead of silently doing nothing, which saves you an hour of confusion.

This pattern lets you keep exactly one or two tests that exercise the real login flow, and let every other test assume an authenticated session. That is the sane division of labor: prove the auth works in a couple of focused tests, then stop paying the login tax everywhere else. The [case studies](https://browserbash.com/case-study) show teams structuring suites this way.

## Wiring Stytch auth tests into CI

Once your tests exist as committed markdown, running them in CI is the easy part. The `run-all` orchestrator discovers a folder of tests and runs them with concurrency derived from real CPU and RAM, ordering previously-failed and slowest tests first, and flagging flaky ones.

```bash
browserbash run-all ./tests/auth --junit out/junit.xml --agent

browserbash run-all ./tests --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

The second command shows two features that matter at scale. Sharding with `--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four parallel CI machines agree on the split without coordinating. The `--budget-usd` flag stops launching new tests once estimated spend crosses your cap; remaining tests report `skipped`, the suite exits 2, and the spend lands in the results file and JUnit properties. For auth suites that call hosted models, that budget guard is a cheap insurance policy against a runaway run.

If you want continuous coverage rather than per-commit coverage, monitor mode runs a test on an interval and alerts only when the pass/fail state changes, in either direction, never on every green run.

```bash
browserbash monitor ./stytch_magic_link_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

Because the replay cache records a green run's actions and replays them with zero model calls until the page actually changes, an always-on monitor of your Stytch login screen is nearly token-free. The agent only steps back in when something on the page shifts, which for a login screen usually means Stytch shipped a change worth knowing about.

There is a first-class GitHub Action too. It installs the CLI, runs your suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating PR comment with the verdict table. The setup lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## BrowserBash and code-based auth testing: an honest comparison

Plain-English testing is not a universal replacement for Playwright or Cypress scripts. It is a different tool with a different sweet spot. Here is a candid comparison for the specific job of testing Stytch passwordless flows.

| Concern | Plain-English (BrowserBash) | Hand-written Playwright/Cypress |
| --- | --- | --- |
| Resilience to Stytch UI changes | High: intent finds the element | Low: selectors break on re-render |
| Test readability for non-engineers | High: it is just English | Medium: code, not prose |
| Deterministic assertions | Yes, via `Verify` steps | Yes, native expectations |
| Retrieving a real OTP from a mailbox | You supply it as a variable | You write the IMAP polling |
| Fine-grained network mocking | Not the focus | Full control |
| Speed on a warm replay cache | Very fast, near token-free | Fast, no model cost ever |
| Setup to first passing test | Minutes | Hours |

The pattern that works best in practice is layered. Use plain-English tests for the user-facing flows where selector churn hurts most, which is exactly where a third-party embeddable auth component sits. Keep code-based tests for the surgical cases: deep network interception, precise mocking of Stytch's API responses, or bespoke mailbox-polling logic you want in your own repo. If your team already has a mature Playwright suite, BrowserBash's `import` command can convert existing specs to plain-English test files heuristically and reproducibly, dropping anything untranslatable into an `IMPORT-REPORT.md` rather than silently guessing.

### When to choose the plain-English approach

Reach for BrowserBash first when the Stytch screens change often, when you want QA folks or PMs to read and edit the tests, when you are validating output from an AI coding agent and need a verdict a machine can consume, or when you want an always-on monitor that pings you only when your real login page breaks. It is genuinely strong for the "did the confirmation render, did the button appear, did we land on the dashboard" checks that make up most auth coverage.

### When a code-based tool is the better fit

Prefer hand-written code when your test's core purpose is network-level mocking of the auth provider, when you need to assert on exact API payloads Stytch returns, or when you are building elaborate mailbox and SMS-gateway polling that you want fully in your own control with no model in the loop. Being honest about this boundary is the point. A tool that claims to do everything usually does the important things badly. You can read more on the [BrowserBash blog](https://browserbash.com/blog) about combining both.

## A realistic end-to-end shape

Putting it together, a sensible Stytch test suite looks like this. One focused test proves the email magic link request renders its confirmation, using deterministic `Verify` steps. If your staging environment exposes codes, a second test injects a known code as a masked variable and drives the OTP screen through to the dashboard. A single, deliberately slow end-to-end test uses a real test mailbox to fetch an actual link, and you accept that it is the flakiest one and quarantine it if delivery hiccups. Everything else in your suite runs against a session you saved once with `auth save`, so no other test pays the login cost.

That structure is honest about what each layer proves, fast where it can be, and thorough where it needs to be. It also degrades gracefully: if the mailbox test flakes on a slow delivery, your confirmation-render and session-reuse tests still tell you whether the login UI itself is healthy. You can browse more patterns on the [learn hub](https://browserbash.com/learn) as your suite grows.

## FAQ

### Can BrowserBash automatically read the OTP from my email to complete a Stytch login?

Not on its own. BrowserBash drives the browser through the request and verification screens by intent, but retrieving a real code from a live inbox or SMS is separate infrastructure you set up outside the browser, such as an IMAP-accessible test mailbox. In practice you fetch the code with your mailbox tooling and pass it into the flow as a masked variable, or you use a staging environment with known codes. Reserve true mailbox-based end-to-end tests for a small number of critical checks.

### Do I need an API key or paid account to test Stytch auth with BrowserBash?

No. BrowserBash is free and open-source under Apache-2.0, and it is Ollama-first, so it defaults to a local model with no API key and nothing leaving your machine. If you want to use the builtin engine for testmd v2 features, that path needs an Anthropic API key or a compatible gateway. Very small local models can be flaky on long multi-step auth flows, so a mid-size local model or a capable hosted model gives you the most reliable results.

### How do I stop re-authenticating Stytch in every single test?

Use saved logins. Run `browserbash auth save` once, complete the real Stytch login yourself in the browser it opens, and BrowserBash captures the session as a Playwright storageState profile. Then pass `--auth <name>` to any run, testmd, run-all, or monitor command, or set it in a test file's frontmatter, and that test starts already authenticated. Keep one or two tests that exercise the real login and let everything else reuse the saved session.

### Will these tests break when Stytch updates its login UI?

They are far more resilient than selector-based scripts because you describe intent rather than DOM structure, so the agent still finds the email field or the send button after a re-render. The deterministic `Verify` steps also give you clear expected-versus-actual evidence when something genuinely changes. A good use of monitor mode is to watch your Stytch login page on an interval and alert you only when the pass or fail state flips, which usually means Stytch shipped a change worth reviewing.

Ready to test your Stytch passwordless flows without wrestling selectors? Install the CLI with `npm install -g browserbash-cli`, write your first objective in plain English, and let an AI agent drive a real browser to a deterministic verdict. Creating an account is optional and everything runs locally by default, but if you want the free cloud dashboard you can sign up at https://browserbash.com/sign-up.
