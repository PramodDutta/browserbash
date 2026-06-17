---
title: Automate Multi-Step Workflow Testing With AI
description: "Automate multi-step workflow testing with BrowserBash: chain login, configure, submit, and verify as one AI-driven markdown test that survives UI shifts."
date: 2026-02-03
category: use-case
---

The hardest tests to keep green are not the single-page ones. They are the long ones — the journey that logs a user in, walks them through three configuration screens, submits a form, and then confirms the system did what it promised. When you automate multi-step workflow testing the old way, you are stringing together a dozen brittle selectors across half a dozen pages, and any one of them can snap the whole chain. This guide shows a different approach: you describe the entire workflow in plain English, and an AI agent drives a real Chrome browser through every step, recovering from the intermediate UI shifts that quietly break recorded Katalon or Leapwork flows. The tool is [BrowserBash](https://browserbash.com), a free, open-source CLI, and every command here is real.

A multi-step workflow is where automation earns its keep and where it fails most often. The failure is rarely the test logic — it is the gap between what you recorded last month and what the page looks like today. A relocated "Next" button, a renamed field, an extra confirmation modal that ships on a Tuesday, and the recorded path no longer matches reality. BrowserBash treats the workflow as intent rather than a script of coordinates, which is exactly what makes it survive the churn that shreds locator-based chains.

## Why long workflows break more than short ones

A single-page test has one chance to fail. A four-stage workflow has four — and the failure probability compounds. If each step has a 95% chance of finding its element after a sprint of UI changes, a single-page test passes 95% of the time. A five-step workflow passes 0.95⁵, which is about 77%. Stretch it to ten steps and you are below a coin flip. That math is why your end-to-end suite is the flakiest thing you own, even when each individual locator looked fine in isolation.

The compounding gets worse because workflow steps are *stateful*. Step three depends on step two having completed. If the agent or the recorded script lands on the wrong page because a button moved, every subsequent assertion fails too, and your failure report is a wall of red that all traces back to one cosmetic change three screens earlier. You spend an afternoon debugging the symptom instead of the cause.

Then there is the intermediate-state problem nobody warns you about. Real applications insert things mid-flow: a "we've updated our terms" interstitial, a feature-flagged tour popup, a slow-loading spinner the recorder captured as an empty frame, an A/B-tested layout that renders differently for half your CI runs. A recorded flow has no concept of "work around the unexpected." It replays the exact sequence it captured, and the moment reality diverges, it stops. This is the single biggest reason recorded Katalon and Leapwork journeys go red without the product actually being broken.

## How an AI agent chains steps without selectors

BrowserBash inverts the model. Instead of recording *where* to click, you write *what* to accomplish, and an AI agent reads the live page on every step to figure out how. You hand it an objective like "log in, configure a project, submit it, and verify the success banner," and it drives a real Chrome browser one action at a time — looking at the actual DOM, deciding the next move, and re-checking after each action.

Because the agent re-reads the page every step, it is not following a frozen map. If the "Continue" button moved from the bottom-right to a sticky header, the agent still finds it, because it is looking for the thing that continues the workflow, not for a CSS path that happened to point at it in March. If a cookie banner appears between step two and step three, the agent sees it, dismisses it, and carries on — no selector for the banner was ever written, because none was needed.

That is the core of how BrowserBash handles multi-step workflow testing: each step is described in human terms, and the recovery from intermediate UI shifts is a property of the agent reading the page, not a special case you coded. You did not anticipate the terms-of-service interstitial; the agent handled it anyway because its job is to reach the objective, not to replay a recording.

### The honest caveat about model size

This resilience is real, but it depends on the model behind the agent. BrowserBash is Ollama-first — it defaults to free local models with no API keys and nothing leaving your machine — and that is genuinely useful. But a long multi-step objective is the hardest thing you can ask a model to do. Very small local models (roughly 8B parameters and under) can lose the plot halfway through a ten-step flow: they forget which page they are on, re-do a step, or hallucinate a success. For short tasks they are fine. For long workflows, the sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. Be honest with yourself about flow length when you pick a model, and you will save yourself a lot of confusing failures.

## Walking through a real four-stage workflow

Let's make this concrete with the canonical shape of a business workflow: **log in → configure → submit → verify**. Install the CLI first:

```bash
npm install -g browserbash-cli
```

The simplest version is a single objective passed on the command line. BrowserBash drives a real browser through the whole chain and returns a verdict plus structured results:

```bash
browserbash run "Go to https://app.example.com, log in as qa@example.com,
create a new project named 'Q1 Launch', set its visibility to Private,
click Submit, and verify the page shows 'Project created successfully'"
```

That one command exercises four stages. The agent navigates, authenticates, fills the configuration screen, submits, and checks the final state. If the visibility toggle is a dropdown this week and a set of radio buttons next week, the agent adapts, because you told it the *intent* ("set visibility to Private") rather than the widget.

For anything you want to keep and run repeatedly, the inline string is the wrong home. That brings us to markdown tests.

## Committing the workflow as a markdown test

BrowserBash lets you write workflows as `*_test.md` files where each list item is a step. These are plain text, they live in your repo next to the code they guard, and they review like any other file in a pull request. Here is the same four-stage flow as a committable test:

```markdown
# Project Creation Workflow

- Go to {{baseUrl}} and sign in as {{username}} with password {{password}}
- Confirm the dashboard shows a "New Project" button
- Click "New Project"
- Set the project name to "Q1 Launch"
- Set visibility to Private
- Click Submit
- Verify the page shows "Project created successfully"
- Verify the new project appears in the project list
```

Run it with:

```bash
browserbash testmd run ./project_creation_test.md \
  --var baseUrl=https://app.example.com \
  --var username=qa@example.com \
  --secret password=$QA_PASSWORD
```

A few things are doing real work here. The `{{variables}}` templating means the same test runs against staging, a preview deploy, or production by swapping one value. The `--secret` flag marks the password as sensitive, and BrowserBash masks it as `*****` in every log line — it never lands in your CI output, your shell history, or an archived run transcript. After the run, BrowserBash writes a human-readable `Result.md` next to the test so you can read exactly what happened, step by step, without parsing JSON.

### Composing workflows with @import

Long workflows share prefixes. Almost every authenticated journey starts with the same login steps. Rather than copy-paste them into every file, BrowserBash supports `@import` composition. Put your login steps in `login_test.md` and pull them into any workflow:

```markdown
# Checkout Workflow

@import ./login_test.md

- Search for "wireless headphones"
- Add the first result to the cart
- Proceed to checkout
- Verify the page shows "Thank you for your order!"
```

Now the login flow is defined once. When your auth UI changes, you fix one file and every workflow that imports it benefits. This is the same maintainability win that page objects give selector-based suites, except the imported steps are plain English and do not encode a single locator. The login is the most-edited screen in most products, and centralizing it pays off immediately.

## Where recorded flows in Katalon and Leapwork struggle

Both Katalon and Leapwork are mature, capable tools with real strengths, and for a lot of teams they are the right choice. Katalon Studio is a long-established codeless-and-code testing platform with broad protocol support and a large community. Leapwork is a visual, flowchart-style no-code automation platform aimed at business users who do not write code. Neither is a toy, and this is not a takedown.

The honest friction is specific and structural: both lean heavily on captured, selector-bound steps. When you record a flow, the tool stores a reference to each element — an XPath, a CSS path, an attribute match, or a visual anchor. That reference is a snapshot of the page at record time. Katalon mitigates this with self-healing locators that try fallback strategies when the primary selector misses, and Leapwork's visual approach has its own resilience model. These features help. But they are fundamentally repairing a broken map, not re-reading the territory. When a workflow inserts a brand-new step mid-flow — an interstitial, a redesigned configuration screen, a reordered wizard — a self-healing locator has nothing to heal toward, because the step it is looking for is not where the recording said it would be.

That intermediate-state divergence is exactly where an objective-driven agent behaves differently. It does not have a recording to diverge from. It reads whatever page is in front of it and decides the next action toward the goal, so a newly inserted screen is just another page to navigate, not a missing waypoint that halts replay.

I want to be precise about what is and is not public here. The exact internals of Katalon's self-healing and Leapwork's element-matching are their own implementations and are not fully publicly specified in a way I can cite line by line, so I will not pretend to. Pricing for both is commercial and tier-dependent and not published as a flat number I can quote reliably as of 2026 — check their sites for current figures. What I can say plainly is the architectural difference between "replay a captured sequence" and "reason about the live page each step," and that difference is what shows up when the UI shifts under a long workflow.

### A balanced comparison

| Dimension | BrowserBash | Katalon | Leapwork |
| --- | --- | --- | --- |
| Core model | AI agent reads live page each step | Recorded + scripted, self-healing locators | Visual flowchart, recorded elements |
| Selectors required | None — plain-English intent | Yes (with healing fallbacks) | Yes (visual element capture) |
| Mid-flow UI shift recovery | Agent reasons to the goal | Heals toward known elements | Re-anchors to captured visuals |
| License | Apache-2.0, free, open-source | Commercial (free tier exists) | Commercial |
| Local / private runs | Yes, Ollama-first, $0 model bill | Cloud/desktop, vendor-defined | Cloud/desktop, vendor-defined |
| Best for | NL workflows, CI, AI coding agents | Broad codeless + code teams, multi-protocol | No-code business users, visual flows |
| Determinism | Lower (agent makes choices) | Higher (replays a script) | Higher (replays a flow) |

Read that last row carefully, because it cuts the other way. A recorded flow is *more* deterministic than an AI agent. If your workflow is stable, your selectors are clean, and you need byte-for-byte reproducibility every run, a recorded tool is genuinely the better fit — it does the same thing every time, and "the same thing every time" is a feature for compliance-grade regression. An agent makes decisions, and decisions introduce variance. The trade you are making with BrowserBash is variance in exchange for resilience to change. Know which one your workflow actually needs.

## Recording, replay, and proving what happened

When an AI agent makes the decisions, you want a way to see what it did. BrowserBash captures evidence on demand. Add `--record` to any run and it saves a screenshot plus a full `.webm` session video via ffmpeg:

```bash
browserbash testmd run ./project_creation_test.md --record
```

The default engine is Stagehand (MIT, by Browserbase). There is also a `builtin` engine — an in-repo Anthropic tool-use loop — and when you record with it, BrowserBash additionally captures a Playwright trace you can open in the trace viewer and step through frame by frame. For a workflow that failed at step seven, that trace is the difference between "it broke somewhere" and "the agent clicked the wrong toggle because two fields had identical labels."

For run history beyond a single machine, there is an optional, free, opt-in cloud dashboard. You enable it with `browserbash connect` and push runs with `--upload`; it stores run history, video recordings, and per-run replay. Uploaded free runs are kept for 15 days. None of this is required — no account is needed to run BrowserBash at all — and if you want a dashboard without uploading anything, `browserbash dashboard` runs a fully local one. You can read more about these options on the [features page](https://browserbash.com/features) and the [pricing page](https://browserbash.com/pricing).

## Wiring multi-step workflows into CI

A workflow test only pays off if it runs automatically. BrowserBash has an agent mode built for exactly this. Pass `--agent` and it emits NDJSON — one JSON event per line — on stdout, with no prose to parse. Exit codes are clean: `0` passed, `1` failed, `2` error, `3` timeout. That is everything a CI pipeline or an AI coding agent needs to gate a merge:

```bash
browserbash testmd run ./project_creation_test.md \
  --agent --headless \
  --var baseUrl=$STAGING_URL \
  --secret password=$QA_PASSWORD
```

In a GitHub Actions step, you check the exit code and you are done — green merges, red blocks. Because the test is a committed markdown file, the workflow definition lives in the same pull request as the feature it covers, so the test and the code evolve together instead of drifting apart in a separate test-management tool. If you have a CI agent that reads tool output, the NDJSON stream gives it structured events to act on rather than a log it has to interpret. There is a deeper walkthrough of the markdown and agent-mode workflow on the [BrowserBash learn hub](https://browserbash.com/learn).

### Running the same workflow across providers

The browser does not have to run on your laptop. BrowserBash switches where the browser lives with a single `--provider` flag. The default is `local` (your own Chrome). You can also point at any DevTools endpoint with `cdp`, or run on a cloud grid — `browserbase`, `lambdatest`, or `browserstack` — for cross-browser coverage of the same workflow:

```bash
browserbash testmd run ./project_creation_test.md \
  --provider lambdatest --upload
```

The workflow definition does not change. You wrote the journey once in plain English, and you can run it locally for fast feedback and on a cloud grid for breadth, without rewriting a single step. That separation between *what the workflow is* and *where it runs* is one of the practical advantages of the intent-based approach.

## When to choose an AI agent, and when not to

Be deliberate. Here is the honest decision guide.

**Choose BrowserBash for multi-step workflow testing when:** your UI changes often and your recorded flows keep breaking on cosmetic edits; your workflows hit intermediate states (interstitials, A/B layouts, feature-flagged steps) that recorders cannot anticipate; you want tests that review like code in a pull request; you need a $0 model bill and full local privacy; or you are feeding a CI pipeline or AI coding agent that wants structured NDJSON output instead of a brittle script. It is also a strong fit when writing and maintaining selectors is the bottleneck slowing your team down.

**Stick with a recorded tool like Katalon or Leapwork when:** you need byte-for-byte deterministic replay for compliance or regulated regression; your application is stable and your selectors are clean, so resilience to change is not the problem you are solving; your team is non-technical and prefers a fully visual, drag-and-drop builder with vendor support; or you depend on protocol breadth (mobile, desktop, API in one tool) that a web-focused CLI does not cover. There is no shame in this — if determinism matters more than adaptability for your suite, the recorded tool is the right call.

Many teams land on both. They keep their stable, high-value regression flows in a recorded tool and use BrowserBash for the volatile, fast-changing surfaces and for exploratory or ad-hoc verification where writing selectors would be a waste of time. You can see how teams frame these trade-offs in the [case studies](https://browserbash.com/case-study).

## A note on what "verify" really means

The fourth stage of the canonical workflow — verify — is where AI agents quietly shine and where you should also be most careful. A recorded assertion checks a specific element for specific text. An AI agent verifying "the project was created successfully" reads the page and judges whether the outcome matches the intent, which means it can catch a success that rendered in an unexpected place. It also means the verdict is a judgment, not a string match, so you should make your verification steps concrete. "Verify the page shows 'Project created successfully'" is a sharper instruction than "verify it worked," and the sharper instruction produces a more reliable verdict. Write your final assertions to reference exact, observable text or state. The agent is good at finding things; give it an unambiguous target and it will be more trustworthy than a vague one.

This is also where the model-size caveat returns. A capable model verifies an outcome well. A tiny local model is more likely to declare victory prematurely on a long flow because it has lost track of where it is. If your verification matters — and on a submit-and-confirm workflow it always does — use a model with the headroom to reason about the full sequence.

## FAQ

### How do I automate a multi-step workflow that spans several pages?

Write the whole journey as one objective or as a single `*_test.md` file where each list item is a step, then run it with `browserbash testmd run`. The AI agent drives a real browser across every page in sequence, reading each page live and recovering from intermediate changes like new modals or relocated buttons. Because the steps describe intent rather than selectors, the workflow keeps working when the UI shifts between pages.

### Why do my recorded Katalon or Leapwork flows break when the UI changes?

Recorded flows store a reference to each element captured at record time, so when a button moves, a field is renamed, or a new step is inserted mid-flow, the captured path no longer matches the live page. Self-healing locators help repair a broken reference but cannot navigate a step that was not in the recording. An objective-driven agent has no recording to diverge from — it reads whatever page is in front of it and reasons toward the goal, which is why it tends to survive mid-flow changes that halt a replay.

### Can I run multi-step workflow tests in CI without parsing log output?

Yes. Pass `--agent` and BrowserBash emits NDJSON, one JSON event per line, with clean exit codes: 0 passed, 1 failed, 2 error, 3 timeout. Your pipeline gates merges on the exit code and your AI coding agent can act on the structured events directly, so there is no prose to scrape. Combine it with `--headless` for a standard CI runner.

### Is a small local model good enough for long workflows?

For short tasks, yes — small local models handle a few steps fine and cost nothing to run. For long multi-step objectives, very small models (around 8B parameters and under) can lose track of which page they are on or declare success prematurely. The reliable sweet spot for long flows is a mid-size local model like Qwen3 or a Llama 3.3 70B-class model, or a capable hosted model when the workflow is especially hard.

Ready to automate multi-step workflow testing without the selector maintenance? Install the CLI with `npm install -g browserbash-cli`, write your first login-configure-submit-verify flow as a markdown test, and run it against a real browser in minutes. No account is required to run it locally, but if you want free cloud run history and replay, you can [sign up here](https://browserbash.com/sign-up) — it is entirely optional.
