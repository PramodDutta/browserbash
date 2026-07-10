---
title: Test Mobile Nav Drawers and Hamburger Menus With AI
description: "Mobile nav drawer testing with AI: verify hamburger toggles, off-canvas drawers, and menu links by intent on small viewports, no selectors needed."
date: 2026-08-08
category: guide
---

Mobile nav drawer testing is one of those chores that never gets easier with traditional tooling. The hamburger button sits at the top of nearly every responsive site, the drawer slides in from the left or right, a backdrop dims the page, and somewhere in that animation your selector-based test flakes because the element was still transitioning when the click fired. You know the pattern. You write a `waitForSelector`, then a `waitForTimeout`, then a retry, and the test still goes red on a slow CI runner. This guide walks through a different approach: describing what a real user does to the drawer in plain English and letting an AI agent drive a real Chrome at a phone-sized viewport to confirm it actually works.

The tool doing the driving here is [BrowserBash](https://browserbash.com/features), a free and open-source natural-language browser automation CLI. You write an objective like "tap the hamburger menu and open the account page," and an AI agent opens a real browser, finds the toggle, waits for the drawer, clicks the link, and returns a deterministic verdict. No CSS selectors, no page objects, no manual sleeps tuned to a specific animation duration. That intent-first model is exactly what off-canvas navigation needs, because the thing you actually care about is behavior, not the class name on a `<div>` that your designer will rename next sprint.

## Why mobile drawer navigation breaks conventional tests

Off-canvas menus are deceptively hard to automate. On desktop the nav is usually a flat row of links that is always in the DOM and always visible. On mobile the same links are collapsed behind a toggle, moved into a container that is translated off-screen with `transform: translateX(-100%)`, and revealed by a class toggle plus a CSS transition. That single design decision introduces at least four failure modes that selector-based suites handle badly.

First, there is the animation race. The drawer is present in the DOM before it is visible, so a naive `click` on a link inside the drawer can succeed at the DOM level while the element is still sliding into place and not yet interactable. You get a click that registers on nothing, or on the backdrop, and the assertion downstream fails for a reason that has nothing to do with your actual feature.

Second, there is `display: none` versus `visibility` versus `transform`. Different UI frameworks hide the drawer in different ways. Some remove it from the accessibility tree entirely until opened, some keep it mounted and shift it off-screen, and some lazy-mount the whole thing on first tap. A test written against one implementation quietly breaks when the team swaps component libraries, even though the user-facing behavior is identical.

Third, focus trapping and body scroll lock. A correct drawer traps keyboard focus inside itself and prevents the page behind it from scrolling, real accessibility requirements that are almost never tested because a selector-based assertion for "focus stayed inside the drawer" is tedious and fragile.

Fourth, the close paths. A drawer can be dismissed by tapping the backdrop, tapping a close icon, pressing Escape, or navigating away. Each path is a separate branch, and most suites test one and hope the rest work. When you describe intent instead of mechanics, "close the menu" covers the behavior regardless of which affordance the user reaches for.

### The viewport is the whole point

None of this matters at 1280 pixels wide, because the hamburger never appears. Mobile nav drawer testing only means something when you run at a phone viewport, so the browser actually collapses the navigation and mounts the drawer. If your CI runs everything at desktop width, you are not testing the drawer at all, you are testing the desktop nav and pretending. Setting the viewport correctly is not a nice-to-have here, it is the precondition that makes the test valid.

## Set the viewport and describe the drawer flow

BrowserBash takes a viewport flag on single runs, and it works on both engines. That means you can force a 390x844 canvas (a common iPhone-class size) and the site will render its mobile layout, hamburger and all. Here is the simplest possible drawer check.

```bash
npm install -g browserbash-cli

browserbash run "Open https://your-app.com on a phone. Tap the hamburger menu in the top bar, wait for the navigation drawer to slide open, then tap the 'Pricing' link and confirm the pricing page loads." \
  --viewport 390x844 \
  --agent \
  --headless
```

Read that objective the way a human tester would read a test case. You are not telling the agent which element to click by its selector. You are telling it the sequence a person performs: open the site at phone size, tap the hamburger, wait for the drawer, tap a named link, confirm the destination. The agent snapshots the page, reasons about which element is the hamburger toggle (the accessibility tree, the button labels, the icon), clicks it, waits for the drawer to settle, and continues. Because it is driving a real Chrome, the CSS transition runs for real and the agent sees the drawer in its final open state before it acts on the links inside.

The `--agent` flag emits NDJSON, one JSON event per line, so a CI job or an AI coding agent can consume the run without parsing prose. Exit codes are frozen and predictable: 0 for passed, 1 for failed, 2 for an error or infrastructure problem, 3 for a timeout. That contract is what lets you drop this straight into a pipeline gate. If you are new to the objective-writing style, the [tutorials](https://browserbash.com/tutorials) walk through phrasing objectives that the agent interprets reliably.

### Local models first, no API keys required

By default BrowserBash is Ollama-first. It resolves a local model before it ever reaches for a hosted API, so nothing leaves your machine and you do not need to hand over a key to try it. The resolution order runs local Ollama, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. For a short drawer flow like the one above, a mid-size local model handles it fine. Be honest with yourself about model size, though: very small local models (roughly 8B parameters and under) get flaky on long multi-step objectives. The sweet spot for anything with branching or many steps is a 70B-class local model such as Qwen3 or Llama 3.3, or a capable hosted model when the flow is genuinely hard.

## Make the assertions deterministic with Verify steps

The plain-English run above is great for exploration and for catching gross breakage, but the pass or fail near the end ("confirm the pricing page loads") is judged by the model. For a menu link that could be acceptable. For anything you gate a release on, you want a check that does not depend on model judgment at all. That is what Verify steps are for.

In a committable `*_test.md` file you write `Verify` lines that compile to real Playwright checks: URL contains a string, title is or contains text, specific text is visible, a named button or link or heading is visible, element counts, a stored value equals something. There is no LLM in that path. A pass means the condition literally held in the browser, and a fail comes with expected-versus-actual evidence in the `run_end.assertions` block and in the Result.md assertion table. Verify lines that fall outside the supported grammar still run, but they are agent-judged and flagged `judged: true` so you can always tell which of your assertions were deterministic and which were interpreted.

Here is a drawer test written as a markdown file. Save it as `drawer_test.md`.

```bash
# Mobile nav drawer opens and links work

- Open https://your-app.com at a phone-sized viewport
- Tap the hamburger menu button in the header
- Wait for the navigation drawer to finish sliding open
- Verify 'Pricing' link visible
- Tap the 'Pricing' link inside the drawer
- Verify URL contains /pricing
- Verify 'Plans' heading visible
```

Run it with the same viewport flag:

```bash
browserbash testmd run ./drawer_test.md --viewport 390x844 --agent
```

The three `Verify` lines are deterministic. "Verify 'Pricing' link visible" checks that a link with that accessible name is actually visible in the open drawer, which is exactly the animation-race problem from earlier, solved without a hand-tuned sleep. "Verify URL contains /pricing" confirms the navigation happened. "Verify 'Plans' heading visible" confirms the destination rendered its content. Everything between the Verify lines is the agent doing the tapping and waiting. You get the readability of plain English with the rigor of real Playwright assertions where it counts.

### A word on close paths and focus

You can extend the same file to cover the dismiss behavior, which is the branch most teams skip. Add steps that tap the backdrop or press Escape, then verify the drawer's links are no longer visible. Because "the drawer is closed" reads naturally as "the Pricing link is not visible on the collapsed page," you can assert it with a visibility check rather than reaching into implementation details about transforms and classes. That keeps the test valid across a component-library swap, which is the whole reason to test by intent.

## Run the drawer suite across multiple phone viewports

One phone size is a start, but real bugs hide at the boundaries. A drawer that works at 390 wide can overflow at 360, and a small tablet at 600 might still show the hamburger while your CSS breakpoint expects the desktop nav. This is where the viewport matrix earns its keep. Instead of writing three copies of the same test, you run the suite once per viewport and let the orchestrator label each result.

```bash
browserbash run-all ./tests \
  --matrix-viewport 360x800,390x844,414x896 \
  --junit out/junit.xml \
  --agent
```

Every test in the `tests` folder runs once at each of the three viewports, and each result is labeled by viewport in the events, the JUnit output, and the Result.md summary. If the drawer breaks at 360 but passes at 390, you see exactly that, with the viewport attached to the failure. The `run-all` orchestrator is memory-aware: it derives concurrency from real CPU and RAM, orders previously-failed and slowest tests first so you learn about breakage sooner, and flags flaky tests across runs. For a broader look at how the parallel runner schedules work, the [learn hub](https://browserbash.com/learn) covers the orchestration model in depth.

### Sharding for bigger suites

Once your responsive suite grows past a handful of files, split it across CI machines with sharding. The slice is computed on sorted discovery order, so parallel machines agree on who runs what without any coordination or shared state.

```bash
browserbash run-all ./tests --shard 2/4 --matrix-viewport 360x800,390x844 --budget-usd 2
```

That command runs the second of four deterministic slices, still across both phone viewports, and stops launching new tests once the suite crosses two dollars of estimated spend. The budget stop is a real guardrail: remaining tests report as `skipped`, the suite exits 2, and the spend lands in the RunAll-Result.md summary and the JUnit properties. When you run local models the cost is effectively zero, but the budget flag matters the moment you point a hard suite at a hosted model.

## Keep the drawer green with monitor mode

A drawer that passes in CI can still break in production, usually because a marketing tag manager injects a script that steals the tap, or a CSS deploy shifts the toggle's z-index behind an overlay. Monitor mode runs a test or objective on an interval and alerts only when the pass or fail state changes, in both directions. It does not spam you on every green run, and it tells you when a broken drawer recovers, too.

```bash
browserbash monitor ./drawer_test.md \
  --viewport 390x844 \
  --every 10m \
  --notify https://hooks.slack.com/services/your/webhook/url
```

Because the notify URL is a Slack incoming webhook, the alert gets Slack formatting automatically. Point it at any other URL and you get the raw JSON payload instead, which is handy for routing into your own alerting stack. The replay cache is what makes an always-on monitor practical: a green run records its actions, and the next identical run replays them with zero model calls, with the agent stepping back in only when the page actually changed. So a drawer monitor that fires every ten minutes stays nearly token-free until the drawer breaks, at which point the agent wakes up, notices the difference, and the state flips to fail.

## Reuse logins so gated menus are testable

Plenty of nav drawers only show their full contents when you are signed in. The account link, the billing page, the sign-out button, all of that lives behind auth. Re-logging in at the start of every test is slow and noisy, and it drags a password through your run. BrowserBash handles this with saved logins.

```bash
browserbash auth save acme --url https://your-app.com/login
```

That opens a browser, you log in once by hand, and pressing Enter saves the session as a Playwright storageState profile. From then on, pass `--auth acme` on any run, testmd, run-all, or monitor invocation, or set `auth:` in a test file's frontmatter, and the run starts already authenticated. If the profile's saved origins do not cover the start URL you gave it, BrowserBash prints a warning instead of silently doing nothing, so you find out immediately rather than debugging a mysteriously empty drawer.

```bash
browserbash testmd run ./account_drawer_test.md --auth acme --viewport 390x844 --agent
```

Now your drawer test can tap the hamburger, tap "Account," and verify the authenticated destination, without a login flow cluttering every test and without your password touching the objective text.

## Generate the first drawer test instead of writing it

If you already have a mobile flow in your head but do not want to write the objective from scratch, record it. The recorder opens a visible browser, you click through the flow once (open the drawer, tap a link, land on the page), and Ctrl-C writes a plain-English test file. Password fields are protected: the capture script sends only a secret marker, never the real value, so a recorded login step reads `Type {{password}} into ...` rather than leaking your credentials into a committed file.

```bash
browserbash record https://your-app.com
```

Teams migrating an existing Playwright suite have a second on-ramp. The import command converts Playwright specs to plain-English `*_test.md` files heuristically and deterministically, with no model involved. It handles goto, click, fill, press, check, selectOption, the getBy* locators, and common expects, and it turns `process.env.X` references into `{{X}}` variables. Anything it cannot translate cleanly lands in an IMPORT-REPORT.md rather than being silently dropped or invented, so you know exactly what still needs a human pass.

```bash
browserbash import ./e2e/mobile-nav.spec.ts
```

That gets your existing hamburger-menu spec into the intent-first format, where you can then swap brittle selector clicks for "tap the hamburger menu" and add deterministic Verify lines around the parts that gate releases.

## Wire the drawer test into your AI coding agent

The reason mobile nav drawer testing pairs so well with AI agents is that the agent building your feature can also validate it. BrowserBash ships an MCP server, so any Model Context Protocol host (Claude Code, Cursor, Windsurf, Codex, Zed) can call it as a native tool. One line adds it.

```bash
claude mcp add browserbash -- browserbash mcp
```

The server exposes three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a whole folder in parallel. Each returns the structured verdict JSON, with status, summary, final_state, assertions, cost_usd, and duration_ms. The important mental model here is that a failed test is a successful validation. The tool call itself succeeds and the agent reads the verdict, so when your coding agent finishes wiring up a new drawer and asks BrowserBash to confirm the "Settings" link works at 390x844, a red verdict is signal, not an error. The agent sees the assertion evidence, fixes the CSS, and re-runs. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, and it is the open-source validation layer these agents reach for when they need to know whether the thing they just built actually behaves.

## When this approach is the right fit, and when it is not

Intent-first, AI-driven drawer testing shines in a few clear situations, and it is worth being honest about where a different tool wins.

It is a strong fit when your UI churns fast and selectors rot, when you want the same test to survive a component-library swap, when you care about behavior across several phone viewports, and when an AI coding agent is doing the building and wants a validation layer it can call directly. It is also a good fit for cross-functional teams, because a PM can read "tap the hamburger, open Pricing, confirm the plans page" and know exactly what is covered.

It is not the right tool for microsecond-precise timing assertions on the drawer's animation curve, or for unit-level coverage of a single React component in isolation. If you need to assert that a transition runs for exactly 240 milliseconds with a specific easing function, a jsdom-based component test or a Playwright test with explicit animation control is the better instrument. And if your only concern is a static snapshot of the closed nav bar, a plain screenshot diff is cheaper than spinning up an agent. The comparison below lays out the trade-off directly.

| Concern | Selector-based E2E | Screenshot diff | AI-driven (BrowserBash) |
| --- | --- | --- | --- |
| Survives selector or class renames | No | Partial | Yes |
| Handles drawer animation races | Manual waits | N/A | Agent waits for settled state |
| Tests behavior across viewports | Copy per size | Copy per size | `--matrix-viewport` one run |
| Readable by non-engineers | No | Somewhat | Yes, plain English |
| Deterministic pass/fail gate | Yes | Yes | Yes, via Verify steps |
| Precise animation-timing assertions | Yes | No | No |
| Setup cost for a new flow | High | Medium | Low, or record it |

The honest read is that these tools are complementary. Keep your fast component tests for the internals of the drawer widget. Use AI-driven runs for the user-facing journey through the drawer, the part that keeps breaking for reasons unrelated to any one component, and gate the release-critical steps with deterministic Verify assertions. You can see how teams combine these layers in the [case studies](https://browserbash.com/case-study).

## FAQ

### How do I test a hamburger menu without writing CSS selectors?

You describe the user's intent in plain English and let an AI agent find and operate the elements. With BrowserBash you write an objective like "tap the hamburger menu and open the Pricing link," set a phone viewport, and the agent snapshots the page, identifies the toggle by its accessible label and role, waits for the drawer to open, and clicks the link. No selector or page object is needed, so the test survives class renames and component-library swaps.

### What viewport should I use for mobile nav drawer testing?

Use a real phone-class size so the site renders its mobile layout and actually mounts the drawer. A common choice is 390x844, which mirrors an iPhone-class viewport, and you should also test the boundaries where breakpoints flip, such as 360 wide and around 600 wide. BrowserBash accepts a `--viewport WxH` flag on single runs and a `--matrix-viewport` list on suites, so you can run the same drawer test once per size and see which viewport breaks.

### Are AI-driven drawer tests deterministic enough to gate a release?

Yes, when you use Verify steps. Plain-English steps are interpreted by the model, but Verify lines compile to real Playwright checks (URL contains, text visible, named link or heading visible, element counts) with no LLM judgment. A pass means the condition literally held in the browser, and a fail ships expected-versus-actual evidence in the run_end assertions block, so you can gate CI on the deterministic parts while keeping the flexible navigation steps agent-driven.

### Can my AI coding agent run these drawer tests itself?

Yes. BrowserBash ships an MCP server, so hosts like Claude Code, Cursor, Windsurf, and Codex can call it with one install line. The agent invokes run_objective, run_test_file, or run_suite and reads back structured verdict JSON with status, assertions, cost, and duration. A failing test returns a successful tool call with a fail verdict, so the agent treats the red result as feedback, fixes the code, and re-runs until the drawer behaves.

Mobile nav drawer testing stops being a flaky chore when you test by intent at a real phone viewport and pin the release-critical checks with deterministic Verify steps. Install the CLI with `npm install -g browserbash-cli`, force a 390x844 canvas, and describe the drawer flow the way a user would tap through it. It is free, open-source, and runs on local models by default, so you can try it today. An account is optional, but if you want the hosted dashboard you can grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up).
