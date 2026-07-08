---
title: Gate Deploys on a Real Onboarding-Flow Verification
description: "Learn how onboarding flow verification CI gate works with BrowserBash: catch signup and first-value regressions before they reach prod."
date: 2026-07-25
category: use-case
---

Every team has a CI gate for unit tests, and most have one for API contracts. Almost none have an onboarding flow verification CI gate that actually opens a browser and walks a new user from signup to first value before a deploy ships. That gap is strange when you think about it: onboarding is the one flow every single paying customer touches, on the worst possible day for a bug, their first day. A broken checkout costs you a sale. A broken onboarding flow costs you a customer who never had the chance to become one, and you usually find out from a support ticket or a churn number three weeks later, not from a red build.

This article walks through why onboarding regressions are uniquely expensive to leave undetected, and how to build a CI gate around a signup-to-first-value flow using BrowserBash's testmd v2 format, deterministic Verify assertions, and the free GitHub Action. The goal is not "add more tests." It's to put one specific, high-leverage flow behind a gate that fails the build the same way a broken unit test does, with a verdict a CI runner can act on instead of a screenshot someone has to eyeball.

## Why Onboarding Is the Highest-Cost Place for a Silent Regression

Think about the shape of a typical bug's blast radius. A rendering glitch on a settings page three levels deep affects existing users who already trust you, who will likely retry, refresh, or file a ticket. A bug in the signup-to-first-value path affects people who have never used your product before and have zero accumulated goodwill. They don't know if the broken step is normal. They don't know who to email. Most of them just leave, and unlike a support ticket, a silent bounce doesn't show up in your bug tracker at all.

This asymmetry is why onboarding deserves its own CI gate rather than living inside a general end-to-end suite that runs nightly and gets triaged the next morning. A few properties make it different from most flows:

- **It's stateful and sequential.** Signup, email verification (or a magic link), a welcome screen, an initial setup step, and finally the moment the user sees value, like a dashboard populating or a first project being created. A regression in step 2 makes steps 3 through 5 untestable by anyone downstream, including your own QA team the next morning.
- **It's the highest-traffic path for anonymous users.** Marketing spend, trial signups, referral clicks, all of it funnels through onboarding. A broken step here doesn't fail one test case, it fails every new user simultaneously.
- **It's disproportionately touched by unrelated changes.** A CSS refactor, an auth library bump, a copy change from marketing, a new analytics snippet, a Clerk or Auth0 SDK update. None of these are "onboarding changes" in the PR title, and that's exactly the problem: the person merging them has no reason to think about onboarding at all.
- **It's rarely covered by unit tests.** Unit tests validate functions and components in isolation. Onboarding breaks at the seams: a redirect that fires before a cookie is set, a webhook that hasn't landed yet, a race between two async calls. Those seam bugs only show up when you actually drive the browser through the full sequence.

The fix isn't more manual QA passes before a release. It's a deterministic, scriptable check that runs the real flow, in a real browser, on every pull request, and blocks the merge if signup-to-first-value breaks. That's what an onboarding flow verification CI gate does, and it's a small, achievable slice of end-to-end testing, not a mandate to automate your entire app.

## What "Signup to First Value" Actually Means

Before writing any test, define the flow precisely. "Onboarding" is a vague word that means different things at different companies. For a CI gate to be worth maintaining, you need a concrete, short definition of the boundary: where does onboarding start, and where does it end?

A reasonable definition for most SaaS products:

1. **Start**: user lands on the signup page (or clicks "sign up" from marketing).
2. **Account creation**: email/password or SSO, whichever is the primary path.
3. **Verification, if applicable**: email confirmation or magic link. If you use a real inbox in CI, this is the step most teams skip testing because it's annoying to automate. Keep that limitation in mind, more on it below.
4. **First setup step**: workspace name, team invite, a preference question, whatever your product asks before letting the user in.
5. **First value moment**: the first screen where the user sees something they came for, an empty dashboard populated with a sample project, a first successful action, a report rendering. This is the end of the gate.

Write this down as a one-paragraph spec before you write a single test step. It forces a conversation with product and design about what "done" actually looks like, and it keeps the gate narrow enough to maintain. A gate that tries to cover every branch of onboarding (SSO plus email plus invite-only plus every locale) becomes a maintenance burden nobody wants to own. Start with the single most common path, the one 80% of your signups take, and expand later.

## Building the Flow with testmd v2

BrowserBash's testmd v2 format is a good fit for onboarding gates specifically because onboarding flows mix two kinds of work: things you'd normally seed through an API (creating a test account, resetting state) and things that have to be checked through the actual UI (does the welcome screen render, does the dashboard populate). testmd v2 lets both live in the same file, in the order they naturally happen, executed one step at a time against a single browser session.

Add `version: 2` to the frontmatter and you get two deterministic step types that never touch a model, plus plain-English steps for anything that still needs an agent to interpret the page.

```markdown
---
version: 2
---
# Onboarding: Signup to First Dashboard

1. POST https://api.example.com/test/reset-account with body {"email": "{{TEST_EMAIL}}"}
   Expect status 200

2. Go to https://app.example.com/signup and sign up with email {{TEST_EMAIL}} and password {{TEST_PASSWORD}}

3. Verify 'Welcome' heading visible

4. Fill in the workspace name field with "QA Workspace" and click Continue

5. Verify url contains "/dashboard"

6. Verify 'Create your first project' button visible
```

Step 1 is an API step: it resets the test account through your backend before the browser even opens, so the gate isn't flaky because a previous run left a half-signed-up user behind. Steps 3, 5, and 6 are Verify steps compiled to real Playwright checks, no LLM judgment involved: a pass means the condition literally held on the page, a fail comes back with expected-vs-actual evidence. Steps 2 and 4 are plain-English and run as an agent-driven block, because the exact DOM structure of a signup form is exactly the kind of thing you don't want to hardcode a selector for, it changes every time design touches the page.

This mix is the point. You get deterministic assertions where determinism matters (did the dashboard actually load, is that URL correct) and natural-language flexibility where the UI is likely to shift under you (form fields, button labels, layout). It's worth being direct about testmd v2's current shape: it drives the builtin engine, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway, it doesn't run on Ollama or OpenRouter directly yet. If your CI environment is already using a hosted Claude key for other tooling, this is a non-issue. If you're fully local-model-only in CI, keep the onboarding gate on v1 plain-English steps until that changes, and layer Verify assertions in a v1 file instead, which still get you deterministic checks without the v2 execution model.

## Handling the Auth and Session Problem

A signup-to-first-value flow inherently starts from a logged-out state, which is convenient, you don't need saved auth for the gate itself. But if your onboarding flow includes an invite step, or if you want a second test that verifies a returning user's first-value experience (post-onboarding dashboard, not the fresh signup), saved logins solve the re-login tax cleanly.

```bash
browserbash auth save qa-returning-user --url https://app.example.com/login
```

This opens a browser, you log in once, hitting Enter saves the session as a Playwright storageState. Any later run adds `--auth qa-returning-user` or sets `auth:` in a test file's frontmatter, and skips the login flow entirely. For the onboarding gate specifically, reserve this for adjacent flows (returning-user dashboard, invited-teammate acceptance) rather than the core signup path, since testing signup from a pre-authenticated session defeats the point.

If your product uses email verification or a magic link as a hard gate before first value, be honest about the limitation: BrowserBash doesn't have a built-in mailbox integration today. Two workarounds keep the gate real: either your test environment exposes a backdoor endpoint that returns the verification token directly (many teams already have this for their own manual QA), or you configure a test-mode flag on the account so verification auto-passes in the environment CI runs against. Either way, wire it in as an API step ahead of the UI steps, the same way the reset-account call works above, so the deterministic parts of the flow stay deterministic.

## Wiring the Gate into CI

Once the test file passes locally, the mechanical part is short. BrowserBash ships an official GitHub Action that installs the CLI, runs the suite, and posts a self-updating PR comment with a verdict table.

```yaml
# .github/workflows/onboarding-gate.yml
name: Onboarding Flow Gate
on: pull_request

jobs:
  verify-onboarding:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PramodDutta/browserbash-action@v1
        with:
          test: .browserbash/tests/onboarding_test.md
          budget-usd: 1
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Full setup, including matrix and budget options, is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). The exit codes are the contract CI depends on: `0` for a genuine pass, `1` for a failed assertion or agent-judged failure, `2` for an error or a budget stop, `3` for a timeout. A PR that breaks the welcome screen, or silently redirects to the wrong post-signup URL, fails the build the same way a broken unit test would, with a comment showing exactly which Verify step failed and what it expected versus what it found.

If you want to run this locally before it ever hits CI, or from any agent, the same test file works through the MCP server. Adding it to Claude Code is one line, `claude mcp add browserbash -- browserbash mcp`, and the same idea applies to Cursor, Windsurf, Codex, or Zed. Once added, an agent inside your editor can call `run_test_file` on the onboarding test directly and read back the structured verdict, status, summary, assertions, cost, and duration, without you leaving your editor. A failed run through MCP is not an error the tool call chokes on, it's a successful validation that surfaced a real problem, which matters if you're wiring this into an agent-driven review workflow rather than just human-triggered CI.

## Keeping the Gate Cheap and Fast

A CI gate that costs real money per run or takes ten minutes to come back will get disabled the first time someone's in a hurry, that's just how these things go in practice. Two BrowserBash features exist specifically to keep an always-on gate affordable and quick without weakening what it catches.

The replay cache is the bigger lever. The first green run of the onboarding test records the actions the agent took to get through signup. Every subsequent run on an unchanged flow replays those exact actions with zero model calls, and the agent only steps back in when the page has actually changed. For a flow that runs on every PR, that's the difference between paying for an LLM call on every merge and paying for one only when the onboarding UI genuinely moves.

Cost governance closes the loop for teams running more than one gate. If your onboarding suite grows to cover a couple of variants (email signup, SSO signup, invited-teammate acceptance), a shared budget stops it from becoming a line item nobody notices until the invoice arrives:

```bash
browserbash run-all .browserbash/tests/onboarding --budget-usd 2 --junit out/junit.xml
```

`run_end` carries a `cost_usd` estimate from a bundled per-model price table (unknown models simply get no estimate rather than a misleading one). Cross `--budget-usd 2` and remaining tests in the run report as `skipped` rather than silently burning through spend, the suite exits `2`, and the actual number lands in both `RunAll-Result.md` and JUnit's `<properties>` block so it shows up next to your other CI metrics.

## Recording the Flow Instead of Writing It by Hand

If you'd rather not hand-write the testmd file, `browserbash record https://app.example.com/signup` gets you most of the way there in one pass. It opens a visible browser, you click through the actual signup flow once, end to end, and Ctrl-C writes a plain-English `*_test.md` file from what you did.

This is a genuinely good fit for onboarding specifically, because the flow is linear and you're going to walk through it anyway to sanity-check it manually before shipping the gate. One caveat worth internalizing: password fields never leave the page during recording, the capture script sends only a secret marker, so the generated step reads `Type {{password}} into the password field` rather than embedding a literal credential. You'll still want to open the generated file afterward and add the API reset step at the top and any Verify assertions you want to be deterministic, recording gives you the skeleton, not the finished, hardened gate.

If your team is migrating existing Playwright specs that already cover parts of onboarding, `browserbash import tests/onboarding.spec.ts` converts them heuristically, no model involved, fully deterministic. Anything it can't translate lands in an `IMPORT-REPORT.md` instead of being silently dropped or invented, so you know exactly what still needs a human pass.

## Making It Actionable in Slack, Not Just in CI

A gate that only runs on pull requests catches regressions introduced by code changes, but onboarding also breaks from things that never touch your repo: a third-party auth provider outage, a DNS change, an expired SSL cert on a subdomain the signup flow redirects through, a feature flag flipped in a dashboard nobody thought of as "deploying." Monitor mode extends the same test file into a standing check against production itself.

```bash
browserbash monitor .browserbash/tests/onboarding_test.md --every 10m --notify https://hooks.slack.com/services/XXX
```

This runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes in either direction, not on every green run, so you don't train your team to ignore a noisy channel. Slack incoming-webhook URLs get formatted automatically, any other URL gets the raw JSON payload, so it's just as easy to route into PagerDuty or a custom webhook. Because the replay cache applies here too, an always-on monitor checking your live onboarding flow every ten minutes stays close to token-free between real UI changes, which is what makes "run it forever" actually practical instead of a line item someone eventually cuts.

## Where a Deterministic Gate Still Falls Short

Being straight about limits here matters more than usual, because onboarding is exactly the kind of flow teams over-promise on. A Verify-based gate catches structural breaks: a missing element, a wrong URL, a button that no longer appears, a redirect that goes to the wrong place. It's excellent at catching "the deploy broke this" in a way CI can act on automatically.

It's not a replacement for watching real signup funnel metrics. A gate testing one account, one browser, one viewport, on a schedule, won't catch a subtle conversion drop caused by a slower page load, a confusing new copy change that technically renders fine, or a payment provider silently declining a specific card type. Pair the CI gate with your product analytics, not instead of them. The gate's job is narrow and mechanical: does the happy path still mechanically work after this deploy. Leave the "are users actually converting" question to your funnel dashboards, where it belongs.

It's also worth sizing expectations on the model side if you're running the builtin engine locally rather than against a hosted Claude key. Very small local models, in the 8B-and-under range, tend to get flaky on longer multi-step objectives like a full signup flow. A mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the harder branches, is the more reliable choice once your onboarding test grows past three or four plain-English steps.

## Getting Started This Week

You don't need to automate every branch of onboarding to get value from this. Pick the single most common signup path, the one most of your users actually take, write the five or six steps that get from landing page to first value, add one API reset step so the test is reproducible, and wire it into a PR-triggered GitHub Action with a small budget cap. That's a working gate in an afternoon, not a quarter-long testing initiative.

From there, expand deliberately: add a second variant only when you have evidence it's worth the maintenance (SSO, invited teammate, a second locale), layer monitor mode on production once the CI gate has proven stable for a couple of weeks, and keep the Verify assertions as the backbone so failures come back as evidence, not vibes. Browse more patterns like this on the [tutorials page](https://browserbash.com/tutorials) and the [learn section](https://browserbash.com/learn), or see how other teams have framed similar gates in the [case study](https://browserbash.com/case-study).

## FAQ

### What is an onboarding flow verification CI gate?

It's an automated check that runs the actual signup-to-first-value user journey in a real browser on every pull request or deploy, and fails the build if any step breaks. Unlike unit or API tests, it exercises the full sequence a new user experiences, including redirects, form submissions, and the first screen where they see value, so regressions in the seams between systems get caught before merge instead of after a customer hits them.

### How is this different from a general end-to-end test suite?

A general end-to-end suite tries to cover many flows and often runs nightly, with failures triaged the next morning after they've already shipped. An onboarding-specific gate is narrower by design, one flow, blocking, and wired into the pull request itself, so a broken signup path never reaches production in the first place. Scope discipline is what keeps it maintainable rather than becoming another suite nobody trusts.

### Can I test onboarding without writing Playwright selectors?

Yes. BrowserBash's testmd format lets you write onboarding steps in plain English, "sign up with email X and password Y," and an AI agent drives a real browser through them without hardcoded selectors. For the parts you want fully deterministic, like confirming a URL or an element's presence, testmd v2's Verify steps compile to real Playwright checks with no model judgment involved.

### Does this replace monitoring my signup conversion funnel?

No. A CI gate confirms the flow is mechanically working, the right elements render, the right URL loads, after a specific deploy. It won't catch a conversion drop caused by slow page loads, confusing copy, or a third-party payment decline pattern. Keep the gate as your regression safety net and your analytics funnel as the tool for measuring actual user behavior and conversion.

Getting a gate like this running takes about as long as reading this article: `npm install -g browserbash-cli`, write the test file above, and point a GitHub Action at it. No account is required to run it locally, and if you want the free cloud dashboard or hosted retention later, [sign up here](https://browserbash.com/sign-up) when you're ready.
