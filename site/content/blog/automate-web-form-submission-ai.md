---
title: Automate web form submission with AI
description: "Automate form submission with an AI agent that fills, clicks submit, and verifies the success state — no selectors, run free and locally."
date: 2026-05-12
category: use-case
---

If you want to automate form submission and have it actually mean something, the job is not done when the last field is typed. It's done when something *clicked submit* and then *confirmed the form went through*. That third step — verification — is where most automation quietly falls apart. A script fills ten fields, presses the button, exits zero, and reports success while the server rejected the email format and the page never moved. The form looked submitted. It wasn't. This guide is about closing that gap: filling a real form, submitting it, and proving the submission landed, using an AI agent that drives a genuine browser instead of a wall of selectors.

The honest version up front: an AI doing this is not infallible. It can misread an ambiguous label, fumble a custom dropdown, or stall on a CAPTCHA the same way a tired human would. What it gives you is a workflow that survives the markup changing underneath it, and — critically — one that *checks its own work* by reading the page the way a person would, rather than trusting an exit code. I'll show how that plays out with [BrowserBash](https://browserbash.com/features), a free, open-source CLI built around exactly this loop, and I'll be straight about where a hand-written Playwright script is still the better tool.

## What "fill, submit, verify" actually requires

People say "automate the form" and picture one action. There are really three, and each fails differently.

**Fill** is the part everyone focuses on, and it's the easiest. You have values; the form has inputs; you map one to the other. Selector-based tools do this fine until the DOM shifts. An AI agent does it by reading labels and placeholders, so `Email address`, `Your email`, and `E-mail` all resolve to the same intent without you maintaining three selectors.

**Submit** sounds trivial — find the button, click it — but it's where flows branch. Some forms submit on the last field's Enter key. Some have a "Continue" that looks like a submit but only advances a wizard step. Some disable the button until a checkbox is ticked. A blind `click("#submit")` doesn't know the difference. An agent that reasons about the page can tell "this advances me" from "this finishes."

**Verify** is the step that separates real automation from theater. After the click, *what proves it worked?* A success toast, a thank-you page, a confirmation number, a redirect URL, a field that turned green, an email that arrived. Selector scripts usually assert on a hard-coded success element — and when the form silently fails validation instead, the assertion either times out with a cryptic error or, worse, passes against a stale element. This is the single most common reason "passing" form automation gives false confidence.

The reason AI is a genuinely good fit here is that the same model that filled the form can *look at the result and judge it*. It returns a plain verdict — passed or failed — plus the structured values it pulled off the confirmation screen. That's verification as a first-class output, not an afterthought you bolt on with another twenty lines.

## How BrowserBash automates a form submission end to end

BrowserBash is a CLI from The Testing Academy. You install it once, write a plain-English objective, and an AI agent drives a real Chrome browser step by step — no selectors, no page objects — then returns a verdict and any values it extracted.

```bash
npm install -g browserbash-cli

browserbash run "Go to https://example.com/contact. Fill the contact form with name Jane Doe, email jane@example.com, and message 'Pricing question for the enterprise plan'. Submit it. Confirm a success message appears and report the exact confirmation text."
```

Read that objective closely, because the structure is the whole point. It tells the agent to *fill*, to *submit*, and — the load-bearing clause — to *confirm a success message appears and report the exact confirmation text*. That last instruction is what turns a fire-and-forget click into a checked submission. The agent navigates, reads the form, types each value into the field whose label matches, finds and clicks the real submit control, waits for the page to settle, then looks for evidence the submission landed. The run finishes with a verdict and the confirmation text captured as a structured value you can log or assert on.

You write verification *into the objective*. If you don't ask the agent to confirm anything, it'll happily fill and submit and call it a day — same blind spot as a script. The discipline that makes this reliable is treating "and prove it worked" as a required sentence, not an optional one.

Under the hood, the default engine is **Stagehand** (MIT, by Browserbase), which exposes act / extract / observe / agent primitives and self-heals when the page shifts. There's also a **builtin** engine — an in-repo Anthropic tool-use loop driving Playwright — which is used automatically for the LambdaTest and BrowserStack providers. For most local form work you never touch this; `--engine stagehand|builtin` lets you switch when you do.

### The model story: local-first, $0 by default

The thing that makes this practical to run on every form you care about is cost. BrowserBash is **Ollama-first**. The default model is `auto`, resolved in this order: a local Ollama install (`ollama/<model>`, free, no keys); then `ANTHROPIC_API_KEY` (`claude-opus-4-8`); then `OPENAI_API_KEY` (`openai/gpt-4.1`); otherwise it errors with guidance. On a local model, nothing leaves your machine and your model bill is genuinely zero — which matters when the form you're testing has real customer data in adjacent fields.

The honest caveat: very small local models (8B and under) get flaky on long, multi-step objectives. A three-field contact form is fine on almost anything; a six-page application wizard with conditional branches is not. The sweet spot for harder flows is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. Pin whichever you want with `--model`:

```bash
# Free and local — great for short forms
browserbash run "Fill and submit the newsletter signup with email test@example.com, then confirm the 'thanks for subscribing' message" --model ollama/qwen3

# Hosted, for a long multi-step wizard that needs more reasoning
browserbash run "Complete the 4-step job application at https://careers.example.com/apply ... submit, and report the application reference number" --model claude-opus-4-8 --record
```

There's no account needed to run any of this. The [pricing page](https://browserbash.com/pricing) lays out where the optional cloud pieces sit, but the core loop is free and offline.

## Why selector scripts struggle with submit-and-verify

I've maintained enough Selenium and Playwright suites to say this without spite: traditional tools are excellent, and they are also where a lot of form automation goes to die. Three recurring failure modes:

**The markup moved.** A redesign renames `#contact-email` to `#email-field`, and every test touching that form goes red overnight. The form *works* — your selectors don't. An agent reading labels doesn't care about the ID.

**The submit button is a liar.** On multi-step forms, the script clicks what it thinks is submit, advances one step, asserts on a success element that doesn't exist yet, and fails with a confusing timeout. You spend an afternoon learning the form had three steps, not one.

**Verification is hand-rolled and shallow.** You assert `expect(page.locator(".toast")).toBeVisible()`. The toast class changes, or the success path now uses a redirect instead of a toast, and your "verification" is checking for a thing that no longer signals success. Meanwhile a *failed* submission — a server-side validation error rendered in a `.toast.toast--error` — can match your selector and turn the test green.

None of this means selectors are bad. It means the cost of keeping a selector suite green is proportional to how often the forms change, and for fast-moving products that cost is real. An agent trades that maintenance for a per-run inference cost and a bit of nondeterminism. Which trade is right depends on your situation, which is the next section.

## AI agent vs. scripted automation: an honest comparison

Here's how the approaches line up for the specific job of fill-submit-verify. I'm describing categories of tools honestly; where a specific competitor's internals aren't public, I say so rather than guess.

| Dimension | BrowserBash (AI agent) | Playwright / Selenium (scripted) | Hosted "autofill" form bots |
| --- | --- | --- | --- |
| How you target fields | Plain-English intent, reads labels | Hand-written selectors | Varies; often vendor heuristics |
| Survives markup changes | Yes, re-reads the page | No, selectors break | Usually, but vendor-dependent |
| Verifies the submission | Built into the objective; returns a verdict + extracted values | Manual assertions you write | Many *autofill only* and never confirm submission |
| Runs locally / offline | Yes, with local Ollama; $0 model cost | Yes | Typically cloud-only |
| Determinism | Lower; model can vary run to run | High | Vendor-dependent |
| Speed per run | Slower (inference per step) | Fast | Varies |
| Cost model | Free + open-source (Apache-2.0); local model = $0 | Free + open-source | Often subscription ($29–$349/mo range reported across the category as of 2026) |
| Best at | Changing forms, multi-step flows, ad-hoc checks, verification | Stable forms, high-volume CI, exact repeatability | Bulk consumer autofill, job applications |

A note on that "autofill only" row, because it's the crux of this article's angle. Independent testing across the consumer form-bot category in 2026 found that many AI job-application tools autofill fields but never actually submit, and fewer still confirm the submission landed. The exact submission rates vary by tool and aren't uniformly published. The takeaway isn't which vendor wins; it's that *filling is not submitting, and submitting is not verifying*. Any tool — BrowserBash included — only verifies if you make verification part of what you ask it to do.

### When to choose an AI agent

Reach for BrowserBash or a similar agent when:

- The form **changes often** and you're tired of selector churn.
- It's **multi-step or conditional**, and a script would need branching logic per path.
- You need **verification you can trust** — a verdict plus the confirmation number, not a green checkmark against a brittle locator.
- You want **ad-hoc checks** without writing a test file ("does the demo-request form still email me?").
- **Privacy or cost** rule out cloud tools — local Ollama keeps data and the bill on your machine.

### When a scripted tool is the better fit

Be honest with yourself and stay on Playwright or Selenium when:

- The form is **stable** and you submit it **thousands of times** in CI where every millisecond and every deterministic assertion counts.
- You need **byte-exact repeatability** — same inputs, same path, every single time, for compliance or load purposes.
- You're doing **pure load generation**, where reasoning per step is wasted cost.

A pragmatic team often uses both: scripted suites for the stable high-volume core, an agent for the flaky, frequently-redesigned forms and for verification-heavy smoke checks. The [features page](https://browserbash.com/features) and the [tutorials](https://browserbash.com/tutorials) cover where each shines.

## Making verification trustworthy

Since verification is the headline, it deserves more than one line. A few patterns that make agent-driven confirmation reliable.

**Name the evidence.** Don't say "make sure it worked." Say what "worked" looks like: "confirm a green success banner reading 'Message sent' appears" or "report the confirmation number shown on the thank-you page." The more concrete the success signal, the less room for the agent to rationalize a near-miss.

**Ask for the value, not just a yes.** Telling the agent to *report the exact confirmation text* or *extract the reference number* forces it to actually find that artifact on the page. A boolean is easy to fake; a specific extracted string is not. Those structured values come back in the run output, so you can assert on them downstream.

**Verify the negative when it matters.** For validation testing, flip it: "submit with an invalid email and confirm the form rejects it with an error message — do not let it submit." Now you're testing that the form *stops* bad input, which is its own kind of verification.

**Keep a record.** Add `--record` and the run captures a screenshot plus a `.webm` session video via bundled ffmpeg (the builtin engine also writes a Playwright trace). When a submission verification fails, you have the video of exactly what the agent saw — far faster to diagnose than a stack trace. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200 runs), so you have history without setting anything up.

## Handling credentials and sensitive form data

Forms collect sensitive data, and automation that fills them needs the same care. Two things matter.

First, the local model story is a privacy feature, not just a cost one. On a local Ollama model nothing leaves your machine — the page contents, the values you typed, the confirmation details all stay local. There's no `--upload` happening by default; without it, nothing is sent anywhere. The optional cloud dashboard is strictly opt-in: you'd run `browserbash connect --key bb_...` once and then add `--upload` per run to push that run's record (free cloud runs are kept 15 days). If you never do that, your form data never goes to a server. The [credentials and secrets safety guide](https://browserbash.com/blog) goes deeper on this.

Second, for repeatable, committable form tests, use **markdown tests** instead of inline objectives. A `*_test.md` file is a checklist where each list item is a step, with `{{variables}}` templating and `@import` for composition. The part that matters for sensitive data: **secret-marked variables are masked as `*****` in every log line**, so a password or API token you template into a login-then-submit flow never appears in plaintext output. After each run it writes a human-readable `Result.md` you can read or attach to a ticket.

```bash
browserbash testmd run ./contact-form_test.md
```

That gives you a form-submission check that lives in your repo, runs in CI, masks its secrets, and produces a readable report — without anyone hand-maintaining selectors.

## Wiring submit-and-verify into CI

The reason this isn't just a local convenience is `--agent` mode. Add the flag and BrowserBash emits **NDJSON** — one JSON object per line — instead of prose. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal object: `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. The `final_state` is where your extracted confirmation values land.

Exit codes are honest: `0` passed, `1` failed, `2` error, `3` timeout. So a pipeline step that submits a form and *verifies* the confirmation can gate a deploy on the real outcome, with no prose parsing.

```bash
browserbash run "Submit the demo-request form at https://example.com/demo with realistic test data, then confirm the booking confirmation page loads and report the meeting time it shows" --agent --headless --timeout 90
```

Pipe that to a file, read the last line, branch on `status`. Because the verification is part of the objective, a green pipeline now means "the form actually went through and we saw proof," not "a button got clicked." That's the whole reason the angle of this piece is fill *plus* submit *plus* verify rather than just fill. The [learn hub](https://browserbash.com/learn) has fuller CI walkthroughs, and there are real-world write-ups on the [case study page](https://browserbash.com/case-study).

## A realistic worked example: multi-step signup

Single-field contact forms are the easy demo. The honest test of any approach is a multi-step flow, so here's one shaped like a real signup wizard.

```bash
browserbash run "Go to https://app.example.com/signup. Step 1: enter email founder@startup.test and a strong password, click Continue. Step 2: fill company name 'Startup Test Inc', team size 11-50, click Continue. Step 3: accept the terms checkbox and click Create account. Then confirm you land on the onboarding screen and report the welcome heading text and any account ID shown." --model claude-opus-4-8 --record
```

Three things to notice. The objective spells out each *step* and the button that advances it, so the agent doesn't mistake a "Continue" for the final "Create account." It pins a capable hosted model because a three-step wizard is past the comfort zone of an 8B local model — match the model to the difficulty. And the verification clause asks for *the welcome heading text and any account ID* — concrete artifacts that only exist if the account was genuinely created. If the agent reports those values, the signup worked. If it reports a stuck-on-step-2 state, you've caught a real bug, with the `--record` video to prove it.

This is the difference between automation that fills forms and automation that *finishes and confirms* them. The first saves typing. The second tells you the truth about whether your form works.

## A short, honest list of limitations

So you go in clear-eyed:

- **CAPTCHAs and bot walls** can stop the agent cold — the same as they'd slow a human, by design. BrowserBash doesn't ship a CAPTCHA solver.
- **Nondeterminism** is real. A model may pick a slightly different path between runs. For exact, repeatable submission at scale, a scripted tool wins.
- **Small models struggle** on long flows. Don't judge the approach by an 8B model failing a six-step wizard — that's the wrong tool for that job.
- **Speed.** Inference per step is slower than a compiled selector script. For one-shot checks and changing forms that's a fine trade; for a million submissions it isn't.

Knowing these makes you better at choosing when to use it — which is more useful than a tool that pretends it has no edges.

## FAQ

### How do I automate form submission without writing selectors?

Use an AI agent that reads the page instead of targeting elements by ID or CSS path. With BrowserBash you write a plain-English objective like "fill the contact form with this data, submit it, and confirm a success message" and the agent maps your values to fields by reading their labels. Because there are no selectors to maintain, the automation keeps working when the form's markup changes.

### Can AI form automation verify that the submission actually succeeded?

Yes, but only if you ask it to. Verification is part of the objective you write — instruct the agent to confirm a specific success signal and report a concrete value like the confirmation number or thank-you text. It returns a pass/fail verdict plus those extracted values, so a "passed" run means real evidence was seen on the page, not just that a button got clicked.

### Is it free to automate form submissions this way?

Yes. BrowserBash is free and open-source under Apache-2.0, and it's Ollama-first, so with a local model running there are no API keys and no model bill — nothing leaves your machine. You can optionally use a hosted model by setting an API key, which costs money per run, and that's worth it for long multi-step forms where small local models get flaky.

### What's the difference between filling a form and submitting it with automation?

Filling means typing values into fields; submitting means clicking the right control to send the form; verifying means confirming the server accepted it. Many consumer autofill tools do only the first step and never actually submit, and fewer confirm the result. The fill-submit-verify loop matters because a form can look completed while the submission silently failed validation, which is why verification should always be the final step.

## Get started

Install the CLI and run your first fill-submit-verify in under a minute:

```bash
npm install -g browserbash-cli
```

BrowserBash is on [npm](https://www.npmjs.com/package/browserbash-cli) and [GitHub](https://github.com/PramodDutta/browserbash). No account is needed to run it locally — but if you want the optional free cloud dashboard, you can [sign up here](https://browserbash.com/sign-up). Write the objective, ask it to confirm the result, and let the agent prove the form went through.
