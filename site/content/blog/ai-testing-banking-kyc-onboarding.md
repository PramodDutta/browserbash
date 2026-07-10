---
title: AI Testing for Banking KYC and Onboarding Flows
description: "AI testing banking KYC flows by intent, not selectors. Test document upload, liveness, and onboarding steps with honest coverage limits."
date: 2026-06-26
category: use-case
---

Bank onboarding is the hardest thing your QA team will ever automate, and AI testing banking KYC flows is where most selector-based suites quietly fall apart. A new-customer journey touches an identity form, a document upload widget rendered by a third-party SDK, a liveness check that spins up a camera, an OTP gate on a phone number you do not control, and a risk decision that may route the applicant to manual review. Each step has its own iframe, its own timing, its own vendor. Write it as CSS selectors and you sign up to babysit brittle locators forever. This article walks through how to test these flows by intent, which parts an AI browser agent handles well, and the parts that need a human, a sandbox, or a mock. I will be honest about the limits, because pretending an agent can beat a liveness check just gets you a false green in production.

## Why KYC onboarding breaks traditional test automation

Know Your Customer onboarding is a regulated obligation, not a nice-to-have. Under most banking regimes a financial institution has to verify identity, screen against sanctions and PEP lists, and record proof before an account goes live. That translates into a UI flow with a lot of moving parts, and every part is a place where a scripted test can snap.

The first problem is third-party widgets. Document capture and liveness are almost never built in-house. You embed a vendor SDK, and those components render inside iframes with obfuscated, hashed class names that change on every release. A locator like `div.sc-1x9f8a2` is a time bomb: when the vendor ships a minor update, your suite goes red and nobody touched your code.

The second problem is state and timing. A KYC flow is a wizard. Step two depends on the OCR result of step one, and the "Continue" button stays disabled until a background verification call resolves. Your test has to wait for the right signal, not a fixed sleep, or you get flaky failures that erode trust in the whole suite.

The third problem is data. You cannot run the same applicant through onboarding a hundred times, because a real KYC backend deduplicates on identity. Each run wants a fresh persona: a unique name, a national ID pattern, an email, a phone. Hard-code one applicant and your second run collides with your first.

This is exactly the shape of problem an intent-driven agent is built for. Instead of naming elements, you describe what a person would do, and [an AI agent drives a real Chrome browser](https://browserbash.com/features) step by step.

## How AI testing banking KYC flows works with an intent-driven agent

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser (no selectors, no page objects), and you get back a deterministic verdict plus structured results. For a KYC onboarding flow, that shift matters more than usual, because the fragile parts (vendor iframes, dynamic wizards) are the parts you were dreading writing by hand.

Here is the simplest possible smoke test against an onboarding sandbox:

```bash
npm install -g browserbash-cli

browserbash run "Open the bank onboarding sandbox at https://sandbox.example-bank.test/onboard, \
click Get Started, fill the personal details form with a test applicant, and confirm the \
page advances to the identity verification step" --agent --headless --timeout 180
```

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or an AI coding agent can read the verdict without parsing prose. Exit codes are frozen and boring on purpose: `0` passed, `1` failed, `2` error or infra or budget-stop, `3` timeout. That determinism is what makes an agent-driven test trustworthy in a pipeline.

By default BrowserBash is Ollama-first. It defaults to free local models, needs no API keys, and nothing leaves your machine, which is a real consideration when your test data looks like personally identifiable information even in a sandbox. It auto-resolves a local Ollama model first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For a multi-step KYC wizard I will be blunt: very small local models (around 8B and under) get flaky on long flows. Use a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model when the flow has more than a handful of dependent steps. A KYC onboarding path is exactly that kind of flow.

## Mapping the onboarding journey into testable steps

Break a typical retail-bank onboarding into stages, and it is easier to see what to automate versus fake:

1. **Landing and consent.** Marketing page, "Open an account," terms and privacy consent checkboxes.
2. **Personal details.** Name, date of birth, address, sometimes employment and income.
3. **Contact verification.** Email link or an OTP sent to a phone number.
4. **Document upload.** Passport, driving licence, or national ID, front and back, via a vendor SDK.
5. **Liveness / selfie.** A camera check that compares a face to the document photo.
6. **Risk and decision.** Sanctions/PEP screening, an internal risk score, then approved, referred, or declined.

Stages 1, 2, and 6 are pure UI logic and an agent handles them well: form fills, conditional branches, decision-screen assertions. Stages 3, 4, and 5 are where honesty starts to matter, covered one at a time below. The goal is not to pretend the agent conquers everything. It is to automate the majority that is genuinely automatable and build honest scaffolding for the rest.

## Testing the identity form with deterministic assertions

The personal-details step is where deterministic checks earn their keep. You do not want an LLM *judging* whether the form advanced. You want a real Playwright-grade assertion that the URL changed, the right heading appeared, and a stored value matches.

BrowserBash gives you `Verify` steps in a committable `*_test.md` file. Verify lines that match the grammar (URL contains, title is or contains, text visible, a named button/link/heading visible, element counts, stored value equals) compile to real Playwright checks with no LLM judgment. A pass means the condition held; a fail arrives with expected-versus-actual evidence in `run_end.assertions` and in the human-readable Result.md assertion table.

Here is a testmd v2 file that seeds a fresh applicant through your test API, then drives the UI and verifies the outcome:

```markdown
---
version: 2
---

# KYC onboarding: personal details advances to identity step

POST https://sandbox.example-bank.test/api/test-applicants with body {"tier": "retail"}
Expect status 201, store $.applicantId as 'applicantId'

Open https://sandbox.example-bank.test/onboard and click Get Started
Fill the personal details form for applicant {{applicantId}} with a valid UK address
Click Continue

Verify URL contains /onboard/identity
Verify heading 'Verify your identity' visible
Verify 'Upload document' button visible
```

The `version: 2` frontmatter makes steps execute one at a time against a single browser session. The API step seeds data deterministically and never touches a model, so you get a unique applicant every run without collision. The plain-English steps run as an agent block on the same page, and the `Verify` lines lock down the result deterministically. One honest caveat: testmd v2 currently drives the builtin engine, so it needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway, and does not yet run on Ollama or OpenRouter directly. If you are committed to fully local, keep v1 files for those flows for now.

### Generating unique applicants per run

Because KYC backends deduplicate on identity, feed a new persona each time. The cleanest pattern is the API seed step above: your harness mints an applicant record and hands back an ID, so the UI just references it. If your sandbox has no seeding endpoint, generate the persona in the objective text and store the values, then assert them later with a Verify line. The point is that the applicant is fresh and the assertion is deterministic, not agent-guessed.

## The honest part: document upload and liveness limits

This is the section that separates an honest KYC testing strategy from wishful thinking. An AI browser agent is very good at clicking through UI. It cannot, and should not pretend to, hold a real passport up to a webcam or pass a genuine liveness challenge. If your test claims to have completed a real biometric check, that is a false green, and a false green in an onboarding suite is worse than no test at all.

### Document upload

File upload has two flavors. If the vendor widget exposes a standard file input, an agent can attach a fixture image and the OCR pipeline runs against your sandbox document set. That is worth automating: you assert that the upload was accepted, that OCR extracted the expected name and document number, and that the flow advanced. If the widget uses a live camera stream instead, the browser cannot inject a real capture unless you feed a fake media stream at the browser level (Chromium's `--use-file-for-fake-video-capture` style flags), and even then you are testing the plumbing, not the vision model's real decision.

The pragmatic split: test that your sandbox's happy-path fixtures flow through correctly, and test the rejection paths (blurry image, expired document, mismatched name) using the vendor's documented sandbox test values. Most identity vendors publish sandbox document sets that deterministically return "approved," "rejected," or "review." Those are predictable, so they automate well. A real-world adversarial capture belongs in manual and vendor-side testing.

### Liveness and selfie checks

Liveness is designed specifically to resist automation. That is the whole point of it, so do not fight it. In a test environment, use the vendor's liveness sandbox mode, which returns a scripted pass or fail without a real face. Your agent drives the UI up to the handoff, the sandbox returns a deterministic result, and you assert on the downstream decision screen. If your vendor has no sandbox liveness mode, this step stays a manual checkpoint, and your suite should explicitly skip and record it rather than fake a pass. Marking a step out-of-scope honestly is a feature, not a gap.

## OTP, email verification, and the contact step

Phone OTP and email magic links are the other place scripts get stuck. An agent cannot read an SMS to a real carrier number. The standard testing patterns still apply and the agent slots into them cleanly:

- **Sandbox fixed OTP.** Most banking sandboxes accept a fixed code (often `000000` or `123456`) for test numbers. Your objective types the known code and the flow proceeds.
- **Test mailbox / IMAP.** For email verification, point the applicant at a test mailbox you control and have the harness retrieve the link. If you are keeping it fully UI-driven, an agent can open a webmail sandbox tab and click the verification link, though a mailbox API is more robust.
- **Provider test hooks.** Twilio, Vonage, and similar providers offer test credentials and magic numbers that return predictable codes.

The reason this matters: the contact-verification step gates everything after it. If you cannot get past OTP deterministically, you cannot test document upload or the decision screen. Solve OTP with a sandbox fixed code first, and the rest of the wizard opens up. There are more walkthroughs in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Reusing a verified session to skip repeated login

Onboarding tests often start from an authenticated staff or partner portal, or they resume a partially completed application. Re-driving login on every run is slow and noisy, so BrowserBash lets you save a login once and reuse it. Run `browserbash auth save bank-staff --url <login-url>` and it opens a browser, you log in once, press Enter, and it stores the Playwright storageState. Reuse it with the `--auth bank-staff` flag on run, testmd, run-all, or monitor, or with `auth:` frontmatter in a test file. If a saved profile's origins do not cover the target start URL, it prints a warning rather than silently doing nothing, which saves a confusing empty run when a staff portal spans two domains.

## Running the full onboarding suite in CI

A real KYC test suite is not one file. It is the happy path, plus each rejection branch (blurry document, expired ID, sanctions hit, underage applicant, address mismatch), plus each decision outcome (approved, referred, declined). That is a folder of `*_test.md` files, and you want them run in parallel, sharded across CI machines, and cost-bounded when a hosted model is in play.

```bash
# One CI machine runs shard 2 of 4, with a hard spend ceiling
browserbash run-all ./tests/kyc --shard 2/4 --budget-usd 2.50 \
  --junit out/kyc-junit.xml --agent
```

The `run-all` orchestrator is memory-aware: concurrency is derived from real CPU and RAM, previously-failed and slowest tests run first, and it flags flaky tests. `--shard 2/4` computes a deterministic slice on sorted discovery order, so four parallel CI machines agree on who runs what without coordinating. `--budget-usd 2.50` stops launching new tests once the suite crosses the budget, reports the remainder as `skipped`, exits `2`, and records the spend in `RunAll-Result.md` and the JUnit `<properties>`. For a regulated flow where every run can trigger paid model calls and paid vendor sandbox calls, a hard budget ceiling is not optional.

If you already have a Playwright KYC suite, `browserbash import <specs-or-dir>` converts specs to plain-English `*_test.md` files heuristically and deterministically, with no model involved. `process.env.X` becomes `{{X}}` variables, and anything it cannot translate lands in an `IMPORT-REPORT.md` instead of being silently dropped or invented. It is a migration aid, not magic, but it gets you off brittle vendor-iframe selectors quickly.

For teams wiring this into GitHub, the [official GitHub Action](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) installs the CLI, runs the suite, uploads JUnit, NDJSON, and results artifacts, supports shard matrix jobs and a budget cap, and posts a self-updating PR comment with the verdict table.

## Monitoring live onboarding as a synthetic check

Onboarding is revenue-critical. If the upload widget breaks in production after a vendor SDK update, you want to know in minutes, not from a support ticket. Monitor mode runs a test on an interval and alerts only on state changes, both directions, never on every green run.

```bash
browserbash monitor ./tests/kyc/happy-path_test.md \
  --every 10m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Slack incoming-webhook URLs get Slack formatting automatically; any other URL gets the raw JSON payload. And because the replay cache records a green run's actions and replays them with zero model calls on the next identical run (the agent steps back in only when the page actually changed), an always-on onboarding monitor is nearly token-free. That is the difference between a synthetic check you can afford to run every ten minutes and one you cannot.

## A pragmatic coverage matrix for KYC testing

Here is how I would divide an onboarding flow between automated agent tests, sandbox-deterministic tests, and human checkpoints. Balanced, not hype:

| Onboarding stage | AI agent (BrowserBash) | Needs sandbox/mock | Human checkpoint |
| --- | --- | --- | --- |
| Landing + consent | Full | No | No |
| Personal details form | Full, with Verify assertions | No | No |
| Email verification | Yes, via test mailbox | Test mailbox | No |
| Phone OTP | Yes, with fixed sandbox code | Provider test number | No |
| Document upload (file input) | Yes, with fixture images | Vendor sandbox docs | Spot-check real captures |
| Document upload (live camera) | Plumbing only | Fake media stream | Yes |
| Liveness / selfie | Handoff + downstream only | Vendor liveness sandbox | Yes |
| Sanctions / PEP screening | Assert decision screen | Sandbox screening results | Compliance review |
| Approved / referred / declined | Full assertion | Deterministic sandbox outcomes | No |

The honest reading: an intent-driven agent covers most of the flow end to end, sandbox modes cover the deterministic security-sensitive steps, and a small set of genuinely adversarial checks (real biometric capture) stay human. Anyone who tells you an agent fully automates a real liveness check is selling you a false green.

## When BrowserBash is the right tool, and when it is not

BrowserBash fits KYC onboarding testing well when your flow has fragile third-party widgets, dependent wizard steps, and a sandbox with deterministic test values. Testing by intent means a vendor SDK reskin does not break your suite the way a hashed-class selector would. The free, local-first model story helps when your test personas resemble PII, and the deterministic `Verify` assertions plus frozen exit codes make it CI-trustworthy.

It is not the right tool for a few cases, and I would rather say so. Testing the vendor's own biometric matching accuracy is the vendor's job with their own harness, not a browser agent's. If your onboarding has zero sandbox and you cannot seed applicants or fix OTP codes, no automation tool will save you until you build that test surface. And if your team is happy with a stable Playwright suite that rarely breaks, an agent adds cost (model calls) without proportional benefit; use `--model-exec` cheap-model routing and the replay cache to blunt that, but be clear-eyed about the trade. You can compare approaches on the [BrowserBash pricing page](https://browserbash.com/pricing), where the guardrail is simple: anything that runs on your machine stays free.

For AI-agent builders, there is a second angle. BrowserBash ships an MCP server, so your coding agent can validate an onboarding change it just wrote. `claude mcp add browserbash -- browserbash mcp` wires it into any MCP host, and the agent calls `run_test_file` or `run_suite` and reads back the structured verdict. A failed KYC test is a successful validation: the tool call succeeds and the agent learns the flow regressed. There are more integration patterns on the [BrowserBash learn hub](https://browserbash.com/learn).

## FAQ

### Can an AI agent pass a real liveness or selfie check during KYC testing?

No, and it should not try. Liveness checks are specifically engineered to resist automation, so a genuine pass would defeat their purpose. In testing you use the vendor's liveness sandbox mode, which returns a scripted pass or fail without a real face, and your agent drives the UI up to that handoff and asserts on the downstream decision screen. If a tool claims to complete a real biometric check automatically, treat that as a false green and a security risk.

### How do you generate unique applicants so KYC deduplication does not block repeat runs?

Seed a fresh applicant through a test API step at the start of each run. In a testmd v2 file you can POST to your sandbox's test-applicant endpoint, expect a 201, store the returned ID, and reference it in the UI steps. That step is deterministic and never calls a model, so every run gets a unique identity and you avoid the collisions that happen when you hard-code one applicant against a deduplicating backend.

### Does testing onboarding flows with BrowserBash send my test PII to the cloud?

Not by default. BrowserBash is Ollama-first, meaning it defaults to free local models with no API keys, and nothing leaves your machine unless you opt in. For long multi-step KYC wizards, use a mid-size local model such as a Qwen3 or Llama 3.3 70B-class model, since very small models under about 8B get flaky on long flows. Note that testmd v2 with API steps currently needs the builtin engine, which uses the Anthropic API or a compatible gateway.

### How do I get alerted when a production onboarding flow breaks?

Use monitor mode to run a happy-path onboarding test on an interval. It alerts only on state changes, pass to fail or fail to pass, so you are not spammed on every green run, and Slack webhook URLs get formatted automatically. Because the replay cache replays a green run's actions with zero model calls until the page actually changes, an always-on onboarding monitor running every ten minutes stays nearly token-free.

Onboarding is where a bank wins or loses a customer in the first five minutes, so its tests deserve to be intent-driven, honest about biometric limits, and cheap enough to run continuously. Install with `npm install -g browserbash-cli`, point it at your onboarding sandbox, and start with the happy path before you branch into rejection cases. An account is optional, but if you want the free cloud dashboard and hosted retention you can [sign up here](https://browserbash.com/sign-up).
