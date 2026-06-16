---
title: AI Browser Testing for Healthcare SaaS Without PHI Leaks
description: "AI testing for healthcare SaaS without PHI leaks: run browser tests on local Ollama models so no DOM snapshots, screenshots, or patient data leave your machine."
date: 2026-04-18
category: use-case
---

If you build a healthcare product, every new tool gets the same first question before anyone cares whether it works: where does the data go? AI testing for healthcare SaaS sits right on that nerve, because the obvious way to add AI to a browser test — point a cloud recorder at your staging app and let it learn the flow — quietly ships your rendered pages, DOM snapshots, and whatever happens to be on screen to a third party. On a normal app that is a privacy footnote. On an app that renders names, dates of birth, MRNs, and visit notes, it is a potential PHI disclosure that your compliance team will not sign off on, and rightly so.

This article is about how to get the productivity of AI-driven browser testing without that exposure. I will walk through where PHI actually leaks in modern AI test tools, what a local-only stack looks like in practice, and how BrowserBash's Ollama-first design lets you run natural-language tests where nothing leaves your machine and there are no API keys to leak. I work on BrowserBash, so read the BrowserBash sections as the vendor talking. I have tried to keep the comparison honest, including the places where a hosted SaaS recorder is genuinely the better fit.

## Where PHI actually leaks in AI test tools

Before you can pick a tool, you need a clear mental model of *what gets sent where* during an AI-driven test run. The marketing copy rarely spells this out, so here is the plumbing.

A traditional Selenium or Playwright test never sends your page content anywhere. The selectors live in your code, the browser runs locally or on your CI runner, and the only network traffic is between your test and your own app. That is the privacy baseline healthcare teams are used to.

AI test tools break that baseline in three common ways:

- **The model call.** Natural-language test tools work by sending some representation of the page to a large language model so it can decide what to click next. That representation is usually a trimmed DOM, an accessibility tree, a screenshot, or all three. If the model runs in someone else's cloud, that page representation crosses your network boundary on every step.
- **The recording/training upload.** SaaS recorders that "learn" your app capture flows during authoring and often re-capture DOM snapshots on every run for self-healing. Those snapshots are stored on the vendor's infrastructure so the platform can diff them later. That is the feature working as designed, and it is also the part that worries auditors.
- **The dashboard artifacts.** Screenshots, session videos, and run history are frequently uploaded by default so you can review failures in a web UI. A screenshot of a failing patient-search page is, by definition, PHI if real data is on screen.

Notice that all three are about *page content*, not just credentials. You can rotate a leaked password. You cannot un-disclose a patient's name once it has been logged on a third-party server. That asymmetry is why "we use HTTPS" is not an answer here, and why a Business Associate Agreement (BAA), while necessary, is not sufficient on its own. The cleanest control is architectural: don't let the data leave in the first place.

### Why staging data is not a free pass

The standard rebuttal is "we only test against synthetic data, so there's no PHI." Sometimes true. Often not. Three things break that assumption in real healthcare engineering shops:

1. **Staging gets refreshed from production.** Many teams seed lower environments with masked or partially masked production data because synthetic data does not reproduce the bugs. Masking is imperfect, and an AI tool snapshotting the page does not know which fields were masked.
2. **You eventually test production.** Smoke tests, synthetic monitoring, and post-deploy verification often run against the live app with live data. The moment an AI recorder touches that environment, the data-flow question is no longer hypothetical.
3. **Free-text fields leak.** Even with synthetic patients, testers paste real-looking notes, and demo accounts accumulate real data over time. You cannot reliably guarantee a screenshot is clean.

So the conservative engineering position is to assume any page the tool sees *could* contain PHI, and to choose a tool whose data flow makes that assumption safe. That is the whole case for local-first AI testing.

## The case for local-only AI testing for healthcare SaaS

A local-only stack flips the data-flow diagram. The browser runs on your machine or your runner. The model that decides what to click runs on the same machine. The page representation — DOM, accessibility tree, screenshot — is generated, consumed, and discarded locally. Nothing about the page leaves your network boundary, because there is no remote model call and no upload step.

This is exactly the design BrowserBash leads with. BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step with no selectors and no page objects, and you get back a pass/fail verdict plus structured results. The part that matters for healthcare: it is **Ollama-first**. By default it resolves to a free local model running through Ollama on your own machine, so there are no API keys and nothing leaves your machine.

The resolution order is worth knowing because it is a security property, not just a convenience. BrowserBash auto-resolves a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. If you never set those environment variables, there is no hosted path the tool *can* take, because there is no key for it to use. You can guarantee a $0 model bill and a zero-egress test run by simply not providing cloud credentials. For a regulated environment, "the credential to send data out does not exist on this box" is a much stronger control than "we trust the vendor not to retain it."

Here is the simplest possible run. No account, no key, no signup:

```bash
npm install -g browserbash-cli
browserbash run "Go to the staging patient portal, log in as the demo clinician, open the appointments list, and verify today's date appears"
```

That command spins up a real browser, drives it with a local model, and prints a verdict. The DOM it reasons over and any screenshot it takes stay on your machine.

### What "nothing leaves your machine" actually requires

I want to be precise, because "local" gets used loosely. For a BrowserBash run to be genuinely zero-egress of page content, three things have to hold, and all three are under your control:

- **Use the local provider.** BrowserBash's `local` provider is the default and runs the browser as your own Chrome on your own machine. The other providers (`cdp`, `browserbase`, `lambdatest`, `browserstack`) run the browser somewhere else, which is great for cross-browser coverage but means page content is processed on that remote endpoint. For PHI flows, stay on `local`.
- **Use a local model.** Keep `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` unset (or unavailable to the process) so resolution lands on Ollama. If you set a hosted key, the page representation goes to that provider on each step.
- **Do not opt into uploads.** BrowserBash does not upload anything unless you explicitly run `browserbash connect` and pass `--upload`. The cloud dashboard is strictly opt-in. There is also a fully local dashboard via `browserbash dashboard` if you want run history and replay without any network egress at all.

Get those three right and the test run is, from a data-residency standpoint, indistinguishable from running a local Playwright suite — except you authored it in English.

## How SaaS recorders like mabl and Testim handle data

Let me be fair to the category. SaaS AI test platforms exist because they solve real problems: low-code authoring, managed grids, self-healing locators, dashboards your QA leads love, and support contracts your procurement team understands. For many non-regulated teams they are an excellent choice, and I am not going to pretend otherwise.

But the cloud-native architecture that makes them convenient is the same architecture that makes the PHI conversation harder. Tools in this space — mabl and Testim are the commonly cited examples — are cloud platforms. The defining trait is that test creation and execution are coordinated through the vendor's service, which is what enables the cross-run intelligence (self-healing, flake detection, analytics). To do that intelligence, the platform needs to see and store representations of your pages over time. That is not a flaw; it is the mechanism.

I want to stay honest about specifics here. The exact data-handling details — what each vendor retains, for how long, in which region, and under what BAA terms — are governed by their contracts and security documentation, not by anything I can assert from the outside. As of 2026, treat the precise retention and PHI posture of any given SaaS recorder as **not publicly specified in a way I should quote**, and get it in writing from the vendor. Many enterprise testing vendors will sign a BAA and offer compliance certifications; whether that satisfies your specific risk model is a question for your privacy and security teams, not a blog.

What I *can* say architecturally is the trade-off, and it is the same for any cloud recorder:

| Concern | Local-first (BrowserBash on Ollama) | SaaS AI recorder (cloud platform) |
|---|---|---|
| Where the model runs | Your machine (local Ollama) | Vendor cloud |
| Page/DOM representation sent off-box | No | Yes, to drive the AI features |
| DOM snapshots stored remotely | No (unless you opt into `--upload`) | Typically yes, for self-healing/history |
| API keys / cloud credentials required | None for the local path | Account and credentials required |
| BAA needed to cover PHI exposure | Not for a local run (no egress) | Yes, and you must verify scope |
| Data egress as default behavior | No | Yes, by design |
| Cross-browser grid out of the box | Via opt-in providers, not default | Yes, managed |
| Low-code dashboard authoring | No — it's a CLI / Markdown tests | Yes |

Read that table as a description of two different bets, not a hit piece. If your highest priority is a managed, low-code platform and you have the legal apparatus to wrap a vendor in a BAA and verify their handling, a SaaS recorder is a reasonable, often excellent, choice. If your highest priority is that PHI never crosses a network boundary you do not own, a local-first tool removes the question instead of answering it.

## What a HIPAA-aware test run looks like in BrowserBash

Theory is cheap. Here is how the local-first approach plays out in the artifacts an engineering team actually lives with: committable tests, CI integration, secret handling, and reviewable runs.

### Committable Markdown tests with masked secrets

BrowserBash supports `*_test.md` files where each list item is a step. They live in your repo next to your code, go through code review, and use `{{variables}}` templating. Variables you mark as secret are masked as `*****` in every log line, so a clinician password never lands in plaintext in your CI output or a teammate's terminal scrollback.

```markdown
# appointments_test.md

- Go to {{PORTAL_URL}}
- Log in with username {{CLINICIAN_USER}} and password {{CLINICIAN_PASS}}
- Open the "Today's Appointments" panel
- Verify a heading containing today's date is visible
- Verify the patient list table has at least one row
- Log out
```

Run it locally with secrets supplied at runtime, never committed:

```bash
browserbash testmd run ./appointments_test.md \
  --var PORTAL_URL=https://staging.portal.internal \
  --var CLINICIAN_USER=demo.clinician \
  --secret CLINICIAN_PASS=$CLINICIAN_PASS
```

Because `CLINICIAN_PASS` is marked as a secret, it shows up as `*****` in the logs and in the human-readable `Result.md` that BrowserBash writes after the run. The test ran on a real browser, driven by a local model, and the only place your credential existed was in your shell environment.

### CI integration without leaking artifacts

For pipelines, agent mode emits NDJSON — one JSON event per line on stdout — with no prose to parse, plus clean exit codes: `0` passed, `1` failed, `2` error, `3` timeout. That is enough to gate a deploy without any cloud round-trip.

```bash
browserbash run "Smoke test: log in to the portal and confirm the dashboard loads" \
  --agent --headless
echo "exit code: $?"
```

In a healthcare CI environment, the appeal is that this is a closed loop: your runner, your browser, your local model, your exit code. No third-party service is in the path that could log a page. If you want recordings for a failing run, `--record` captures a screenshot and a full `.webm` session video locally via ffmpeg; on the builtin engine it also captures a Playwright trace you can open in the trace viewer. Those artifacts stay on the runner unless you choose to upload them — and for PHI flows, you probably keep them local and short-lived, or scrub them in your pipeline before archiving.

### Reviewing runs without the cloud

When you do want a UI, run `browserbash dashboard` for a fully local dashboard with run history and replay. No egress, no account. The optional cloud dashboard (run history, video, per-run replay) only ever sees data if you run `browserbash connect` and pass `--upload`, and even then free uploaded runs are kept for 15 days. For non-PHI projects that opt-in is a nice convenience; for PHI projects, the local dashboard is the default you want.

## An honest caveat: model size matters

I am not going to oversell the local path, because that is exactly the kind of hype that gets a tool kicked out of a healthcare eval. The honest limitation: very small local models — roughly 8B parameters and under — can get flaky on long, multi-step objectives. They lose the thread on a ten-step clinical workflow, misread an ambiguous button, or declare success too early.

The practical sweet spot for serious local runs is a mid-size local model in the Qwen3 or Llama 3.3 70B class. Those are large enough to handle realistic multi-step flows reliably while still running entirely on your hardware, so you keep the zero-egress property. If you have the GPU budget, that is the configuration I would standardize on for healthcare test suites.

There is a second honest tension. If a particular flow is genuinely hard and your only reliable option is a capable hosted model, you face a real choice: accept the data-flow implications (with a BAA and a careful read of retention terms) for that specific flow, or keep it local and invest engineering time in decomposing the flow into smaller, model-friendly steps. For PHI pages, I lean hard toward the second. Break the big objective into several short `*_test.md` files composed with `@import`, each of which a mid-size local model can handle, rather than reaching for a frontier hosted model on a page full of patient data. The composition feature exists partly for this reason: smaller, deterministic units are both more reliable and easier to keep local.

## Choosing the right tool for your team

Here is the balanced decision guide. No tool is universally correct, and pretending otherwise would undercut the point of an honest comparison.

### When local-first AI testing is the right call

- **PHI or other regulated data can appear on the pages under test**, even occasionally, even in staging seeded from production. The architectural guarantee of no egress is worth more than any contractual promise of careful handling.
- **You want zero per-test model cost** and a hard ceiling on spend, which local Ollama models give you by construction.
- **Your team is comfortable in a CLI and Git**, prefers tests as code in `*_test.md` files, and wants natural-language authoring without a SaaS account.
- **You need a closed-loop CI gate** with exit codes and NDJSON and no third-party service in the path.

### When a SaaS AI recorder is the better fit

- **Your app has no regulated data and convenience wins.** A managed, low-code platform with a polished dashboard and a support contract is a perfectly good answer, and often a faster path for a large manual-QA team.
- **You need a managed cross-browser grid as table stakes** and do not want to operate one. SaaS recorders ship that; BrowserBash gets you there through opt-in providers like LambdaTest or BrowserStack, which means page content runs on those remote endpoints — fine for non-PHI, a careful decision for PHI.
- **Non-engineers author most tests** and you want a visual recorder over Markdown and a terminal.

### A pragmatic hybrid

Plenty of healthcare orgs land in the middle, and that is fine. Use BrowserBash on the local provider with a mid-size local model for anything that touches PHI — patient search, scheduling, chart views, anything with real names on screen. Use whatever managed platform you already pay for on the marketing site, the public docs, the unauthenticated sign-up funnel, and other pages that never render patient data. Routing tests by data-sensitivity is a clean, auditable policy your security team can actually reason about, and it lets each tool do what it is best at.

If you want to go deeper on how the agent drives a browser from plain English, the [BrowserBash learn hub](https://browserbash.com/learn) walks through the model resolution order and provider flags, and the [features overview](https://browserbash.com/features) lists what each engine captures. For more worked examples like this one, the [BrowserBash blog](https://browserbash.com/blog) has additional use-case write-ups, and the [pricing page](https://browserbash.com/pricing) spells out exactly what is free (the CLI and local runs are, fully).

## A realistic first week with the local stack

If you are evaluating this for a healthcare product, here is a concrete sequence that respects the data-flow rules from day one.

Start by installing the CLI and confirming a local model is in the loop before you point it at anything sensitive. Run a throwaway objective against a public page first so you can see the verdict format and confirm no keys are set. Then write your first `*_test.md` against a non-PHI page of your own app — a login screen with a demo account is ideal — and get the secret-masking behavior in front of your security reviewer early. The `*****` masking in logs and `Result.md` is usually the detail that makes a skeptical reviewer relax.

Once the pattern is approved, scale it by composition rather than by reaching for bigger models. Build a small library of short, single-purpose test files — log in, open a panel, verify a heading, log out — and stitch them into larger journeys with `@import`. Keep each unit small enough for a mid-size local model to nail consistently. Wire the whole thing into CI with `--agent --headless` and gate on exit codes. Keep `--record` artifacts local and short-lived, and use `browserbash dashboard` for review instead of any upload. By the end of the week you have natural-language tests, no egress, no per-test bill, and an audit story that fits on one slide: the page content never left the runner because the model that read it ran on the runner.

That last sentence is the whole value proposition for regulated teams. AI test authoring used to force a choice between productivity and data control. Local-first tooling collapses that trade-off for the majority of flows, and reserves the harder hosted-model conversation for the genuinely rare cases where you actually need it.

## FAQ

### Is AI browser testing HIPAA compliant?

The tool itself is not "HIPAA compliant" or not — compliance depends on how the data flows. An AI test tool that runs the model locally and never uploads page content can keep PHI inside your network boundary, which removes the third-party disclosure question entirely. A cloud-based recorder that sends DOM snapshots or screenshots to a vendor needs a signed BAA and a careful review of the vendor's retention and handling before it can be used on PHI pages.

### Does BrowserBash send my page data to the cloud?

Not on the default local path. BrowserBash is Ollama-first: it resolves a local model and runs a real browser on your own machine, so the DOM and screenshots it reasons over stay local. It only uploads anything if you explicitly run browserbash connect and pass the --upload flag, and there is also a fully local dashboard if you want run history without any egress at all.

### Can I run AI tests without any API keys?

Yes. If you do not set ANTHROPIC_API_KEY or OPENROUTER_API_KEY, BrowserBash falls back to a free local Ollama model, so there are no keys to manage or leak and no per-test cost. For healthcare flows this is also a security control, because without a cloud credential on the machine there is no path the tool can use to send page data out.

### What local model should I use for reliable healthcare test flows?

For real multi-step clinical workflows, use a mid-size local model in the Qwen3 or Llama 3.3 70B class. Very small models around 8B parameters and under can get flaky on long objectives and may declare success too early. If your hardware cannot run a 70B-class model, decompose big flows into short, single-purpose test files so a smaller local model can handle each step reliably.

## Try it without sending a single byte off your machine

You can have a natural-language browser test running on a local model in about a minute, with no account and no keys. Install the CLI and run your first objective:

```bash
npm install -g browserbash-cli
browserbash run "Open the demo portal and verify the dashboard loads"
```

An account is entirely optional — the CLI and all local runs are free forever. If you later want the opt-in cloud dashboard for non-PHI projects, you can [sign up here](https://browserbash.com/sign-up), but for anything that touches patient data, the local stack is the one to standardize on.
