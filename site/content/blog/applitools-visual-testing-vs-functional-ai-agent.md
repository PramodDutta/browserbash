---
title: Applitools Visual Testing vs a Functional AI Agent
description: "Applitools compares pixels and layout; an AI agent verifies behavior and flows. See what each catches, and why teams often run both, not one."
date: 2026-07-05
category: comparison
---

A mid-size HR SaaS team ships a routine release to its job-listing publisher. Applitools, wired into their Cypress tests, walks through its usual checkpoints: the listing form, the "Job published" toast, the public careers page. Every screenshot matches baseline. Green across the board, deploy approved.

Twenty minutes later a recruiter files a support ticket. She published four job listings that morning. None show up on the public careers page.

The bug is a shape visual testing was never built to see. A backend validation change had quietly started rejecting a field format the frontend still sent the old way, so the API returned a 500, but the frontend's success handler assumed the happy path and fired its toast regardless, a classic optimistic-UI bug where the "it worked" message is decoupled from whether it actually worked. The toast rendered exactly like yesterday: same banner, same copy, same layout. Applitools' baseline matched perfectly, because the pixels never changed, and no image diff was ever going to check whether a row actually got written to the database.

Flip the scenario a week later. A designer ships a spacing-token update; nobody touches the publishing logic. But the careers page's card grid, which relies on that token for its margin, now renders with adjacent cards overlapping on narrower viewports. The publish flow still works: the job saves, the listing appears, the data is correct. A functional check that only verifies "does the job appear on the careers page" passes without complaint, because the element is technically present in the DOM, just stacked under its neighbor. Applitools catches this one instantly, exactly the class of bug its comparison engine exists for.

Neither team did anything wrong by running the tool they ran. They were just answering different questions with a check that can't see through to the other one.

## "Applitools functional testing" is a slightly mixed-up search, and worth untangling

If you landed here searching some version of "applitools functional testing," you're probably asking one of two things. First: can Applitools's visual checks stand in for a functional test suite? No. Second: what do you actually pair with Applitools to get functional coverage? That's worth answering properly.

Applitools does not drive a user flow on its own. It has no concept of clicking a login button, filling a form, or asserting a checkout completed. Every checkpoint (an `eyes.check()` call, in SDK terms) sits inside a functional test you already wrote in Selenium, Cypress, Playwright, WebdriverIO, or a harness like Storybook. Your code drives the flow, log in, navigate, submit, wait, and Applitools's job starts and ends at "capture this frame and compare it to last time." It's a visual layer bolted onto a functional skeleton that has to exist first. Install it with no functional suite underneath and you get a well-organized dashboard of passing screenshots, and zero coverage on whether the application does anything at all.

## What Applitools is actually built to catch

Applitools' core product, commonly called Eyes, is a visual comparison engine marketed as Visual AI. You capture a baseline screenshot, and on every subsequent run the engine compares the new render against it using AI-assisted comparison rather than a naive pixel diff, ignoring anti-aliasing noise while still flagging a button that moved or text that overflowed. Around that engine sits the Ultrafast Test Cloud, which renders one captured DOM snapshot across many browser and device combinations without you provisioning each environment, plus a dashboard for reviewing diffs and baseline approvals. It's a commercial platform; exact pricing changes over time, so check Applitools' own site rather than trust a number quoted secondhand.

What it's genuinely excellent at: catching bugs where the DOM is fine but the page looks wrong to a human. A CSS regression that shifts a button off-screen, a web font that falls back to a system typeface, a z-index conflict that buries a modal, a responsive breakpoint that mangles a table on tablet. None of those necessarily fail a functional assertion, since the element still exists, is still clickable, still holds the right text. They just look broken. That's Applitools' entire reason for existing, and within that lane it does work no functional suite can replicate.

## What a functional AI agent checks instead

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. Install it with `npm install -g browserbash-cli`, write a plain-English objective, and an AI agent drives a real Chrome browser step by step to accomplish it, reading the live page at each step and returning a pass/fail verdict plus any values you asked it to extract. There's no baseline to capture and no image to diff. The question it answers is closer to "did the thing the user was trying to do actually happen," which for the job-listing bug above means checking the one fact that mattered: does the listing exist on the public careers page after publishing, not whether a toast rendered on schedule.

That's the direct answer to the second search intent: if you have no functional suite, or you're tired of maintaining Selenium page objects that break on every refactor, this is what you pair with Applitools instead of hand-writing one. The plain-English objective is the functional test; no separate framework to stand up first.

Two engines run underneath: `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin` (an in-repo Anthropic tool-use loop driving Playwright). Bring your own model, Claude, OpenAI, OpenRouter, or a free local model through Ollama, so a check runs at zero cost if you size the model right. It drives local Chrome by default, or a CDP endpoint, Browserbase, LambdaTest, or BrowserStack. More on the engines and providers is on the [BrowserBash features page](https://browserbash.com/features).

## Same release, two different verdicts: the pattern by bug type

The job-listing incident isn't a one-off; the same pattern repeats across almost every UI. Worth seeing several instances side by side rather than one anecdote.

| Bug pattern | Applitools (visual) | Functional AI agent |
| --- | --- | --- |
| Success toast fires regardless of a failed API call (optimistic UI decoupled from real state) | Passes, screenshot matches baseline | Fails, the expected end state never appears |
| Design-token spacing change causes cards or rows to overlap | Fails, flags the visual diff | Passes, the element is present in the DOM |
| Link or button points at a dead or 404'd endpoint but renders with correct styling | Passes, appearance unchanged | Fails, agent never reaches the expected destination |
| Web font fails to load, falls back to a default system typeface | Fails, or flags a diff depending on the layout shift | Usually passes, text is still present and readable |
| Multi-step form silently skips a required step (client-side state bug) | Passes if each screen matches its own baseline | Fails, agent never reaches the final confirmation state |
| Modal buried behind another element by a z-index regression | Fails, diff shows the modal missing or displaced | Depends: fails if the agent can't reach the modal, passes if it can still reach the DOM node |

Read the last row carefully: it's the nuance most comparisons skip. A functional agent that resolves elements by role or visible text, not pixel position, can sometimes still complete a task even when the layout is visibly broken, a button pushed off-screen but still in the accessibility tree. That's exactly why a functional pass is not proof a page renders correctly, and it's the whole argument for running both layers rather than trusting one to cover the other's territory.

## A functional check that needs no Applitools baseline at all

Here's the job-listing scenario as an actual runnable check, no visual baseline required:

```bash
browserbash run "Log in as an admin, publish a new job listing titled \
  'Senior QA Engineer', then open the public careers page and confirm \
  the 'Senior QA Engineer' listing appears with a live 'Apply' link" \
  --record
```

Committed to git and reviewed like any other artifact, the same check as a Markdown test file with a deterministic assertion:

```markdown
# Job listing publishes and appears on the careers page
- Open {{adminUrl}} and log in with {{adminUser}} and {{adminPassword}}
- Create a new job listing titled "Senior QA Engineer" in the Engineering department
- Click Publish
- Open {{careersUrl}}
- Verify: the careers page lists a job titled "Senior QA Engineer" with an active Apply link
```

That `Verify:` line compiles to a real, deterministic check, not an LLM's subjective read on whether the run "seemed fine." The `{{adminPassword}}` variable, marked as a secret, is masked as `*****` in every log line and in the `Result.md` written after. The run exits `0` on a full pass, `1` if verification fails, `2` on error, `3` on timeout, codes your CI branches on without parsing prose. Run it with `browserbash testmd run ./job_listing_test.md`.

## Wiring both layers into one pipeline

The two checks aren't competing for the same pull request gate. They're occupying different ones.

```bash
# Functional gate: does the listing actually get published and appear?
browserbash run "log in as admin, publish a job listing, and confirm it \
  appears on the public careers page with a working Apply link" \
  --agent --headless --record
echo "functional exit code: $?"   # 0 pass, 1 fail, 2 error, 3 timeout
```

Run that alongside your existing Applitools checkpoint, in the same suite or a separate CI job. If the functional gate goes red, the "Job published!" toast is lying, and nobody should be debating spacing tokens yet. If Applitools flags a diff on the same page, the listing worked but the careers grid needs a design review. Neither substitutes for the other; a clean run on both is what tells you the release is safe.

For a bigger suite, `run-all` runs a whole directory of testmd files with memory-aware concurrency and writes a JUnit report, and the official GitHub Action posts the verdict to the PR with a table and recording links. If an AI coding agent built the feature, `claude mcp add browserbash -- browserbash mcp` exposes run, testmd, and run-all as MCP tools, so it can validate its own change against a real browser before a human, or an Applitools baseline, sees it.

## When Applitools alone is the right call, and when it isn't

Be honest about where each tool's job actually ends.

Applitools on its own is enough when functional coverage is already solid, mature Selenium, Cypress, or Playwright suites that genuinely exercise the flows, and what's missing is purely visual: a design regression, a font failure, a layout break across viewports. Bolt a checkpoint onto tests that already work and you get real value with no functional gap to backfill.

It's not enough, no matter how well-tuned its diff engine is, when there's no functional layer at all, or that suite has decayed into brittle page objects nobody wants to touch. A perfect visual baseline says nothing about whether the "Publish" button actually publishes, and that's the gap a functional agent closes, without asking you to author Selenium locators first.

## The honest caveat on model-driven functional checks

A functional agent's judgment comes from a model, so size it to the job. Small local models, roughly 8B parameters and under, get flaky on longer multi-step objectives like the flow above, fine on one tight assertion, but they wander across five or six steps. A mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows, is steadier, and staying local keeps the bill at zero. Worth knowing too: these runs are goal-deterministic, not path-deterministic, two runs can take slightly different steps to the same verified end state, unlike a pixel diff's exact match. Once a run goes green, the replay cache replays its recorded actions with no model call at all, narrowing the cost gap, though it's no substitute for sizing the model right the first time.

## FAQ

### Does Applitools do functional testing?

No, not on its own. Applitools is a visual comparison engine: it captures a screenshot and compares it to a stored baseline. The functional actions, logging in, clicking, filling forms, asserting an outcome, come from the Selenium, Cypress, Playwright, or WebdriverIO test you write around it. It checks what a frame looks like at a chosen point; it doesn't decide what to click next or verify a backend call succeeded.

### Can Applitools replace my functional test suite?

No. Applitools needs a functional test to run inside of; it has no mechanism for driving a multi-step flow on its own. A thin or nonexistent suite plus Applitools gives you visual coverage on whatever screens you capture, but zero coverage on whether the application's behavior is correct. You'd still need a functional layer, hand-written or an AI agent like BrowserBash, to answer that.

### What's the actual difference between visual testing and functional testing?

Visual testing asks whether a rendered page looks the way it did before, or the way a design spec says it should, by comparing images. Functional testing asks whether a user's action produced the correct outcome: the right data saved, the right page reached, the right state changed, regardless of how the screens looked along the way. A page can pass one and fail the other, which is why relying on just one leaves you blind to the other's failure mode.

### Do I need a separate tool for functional testing if I already use Applitools?

If your existing Selenium, Cypress, or Playwright suite already exercises your flows and Applitools sits inside it as a visual checkpoint, you may already have both layers covered. If Applitools is your only automated check and nothing verifies actions complete correctly on the backend, that's a real functional gap, worth closing with a maintained suite or a plain-English agent that doesn't require one to be authored first.

### Is BrowserBash free to run alongside Applitools?

Yes. BrowserBash is free and open-source under Apache-2.0, no account required. Point it at a fully local Ollama model for a zero-dollar bill, or bring your own Claude, OpenAI, or OpenRouter key for harder flows. It runs as its own functional layer alongside an Applitools visual checkpoint, gating on a different question entirely, so there's no overlap in what you're paying for.

If your last incident was a page that looked perfect and did nothing, or one that worked perfectly and looked broken, that's not a reason to pick a side, it's a reason to run a check for each question. Install BrowserBash with `npm install -g browserbash-cli`, point a plain-English objective at the flow your last incident actually broke, and let it verify what your Applitools baseline was never going to see. Read more on [browserbash.com](https://browserbash.com), and when you want run history or shared recordings, [sign up](https://browserbash.com/sign-up) for the free dashboard, no account required.
