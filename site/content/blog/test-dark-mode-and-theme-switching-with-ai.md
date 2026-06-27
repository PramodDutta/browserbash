---
title: Testing Dark Mode and Theme Switching With an AI Agent
description: "Test dark mode toggle behavior with an AI agent: flip the theme, confirm the visible UI state changed, and check it persists across a page reload."
date: 2026-06-27
category: testing
---

To test a dark mode toggle with an AI agent, you tell the agent to find the theme control, flip it, and then assert on what the page now looks like rather than on a CSS class name: the agent reads the toggle's accessible role and pressed state, confirms the visible UI actually switched (text on a dark surface, an icon that flipped from sun to moon, an `aria-pressed` that changed), and then reloads the page to verify the choice stuck. With BrowserBash you write that as a plain-English objective or a Markdown `*_test.md` file, and the agent locates the toggle through the accessibility tree, not a brittle selector. The honest catch, which I will get to in full, is that an AI agent verifies *state* and *behavior* reliably but is the wrong tool for pixel-exact color assertions. For "is this hex value exactly `#0d1117`," you want a different instrument, and I will name the right ones.

This post walks through the whole loop: flipping the toggle, asserting the visible state changed, checking persistence across reloads, pairing the run with screenshots for evidence, and the real limits you should know before you trust any of it.

## Why a dark mode toggle is awkward to test the old way

A theme switch looks trivial and tests like a hydra. The classic selector-based test grabs `button.theme-toggle`, clicks it, then asserts `document.body.classList.contains('dark')`. That works right up until a designer renames the class to `theme-dark`, moves the state from `<body>` to `<html data-theme>`, or swaps the whole thing for a CSS `color-scheme` media query plus a cookie. Now the selector is stale, the class assertion is wrong, and your "passing" test was only ever checking an implementation detail that has nothing to do with whether a user can actually switch themes.

The deeper problem is that dark mode lives in several places at once. The toggle is a button. The applied theme is a class, an attribute, an inline style, or a `prefers-color-scheme` override. The persistence is `localStorage`, a cookie, or a server-set preference. A test that hardcodes any one of those couplings tests your plumbing, not the user-visible promise: I clicked the thing, the page got dark, and it stayed dark when I came back.

An AI agent flips the framing. Instead of "assert the class is present," you assert the outcome a human would check. BrowserBash's agent finds elements through the accessibility tree (roles, accessible names, and states like pressed or checked) plus the DOM, so it does not care whether your toggle is a `<button>`, a `role="switch"` checkbox, or a styled `<div>` with the right ARIA. It cares that something named like a theme toggle exists, is operable, and that the page visibly responds when operated.

## The simplest run: flip it and confirm

The fastest way to sanity-check a toggle is a one-line objective. Install the CLI first:

```bash
npm install -g browserbash-cli
```

Then ask the agent to do the thing and tell you what it saw:

```bash
browserbash run "Go to https://example.com, switch the site to dark mode using the theme toggle, and confirm the page now uses a dark background with light text"
```

Under the default `stagehand` engine, the agent observes the live DOM on each step and decides its next action from what is actually rendered right then. So it opens the page, scans the accessibility tree for a control whose name or role reads like a theme or appearance toggle, activates it, then re-observes the page and reports whether the rendered state matches "dark background, light text." There is no selector to maintain because nothing was hardcoded. If you rename the class tomorrow, this run is unaffected, because the agent re-derives everything from live state on every run. (That is re-derivation from the current page, not a saved script that patches itself. BrowserBash does not keep a cached selector between runs.)

This is great for a smoke check, but a one-liner is not a test you commit. For that you want a `*_test.md` file.

## Writing it as a Markdown test

BrowserBash tests are intent, not selectors. A test is a Markdown file: a `# title`, a list of steps (ordered or unordered), optional `{{variables}}`, and `@import` for composing shared flows. Here is a focused `dark_mode_test.md`:

```markdown
# Dark mode toggle works and persists

1. Open {{baseUrl}}
2. Confirm the page starts in light mode (dark text on a light background)
3. Find the theme or appearance toggle and switch it to dark mode
4. Confirm the page is now in dark mode: light text on a dark background
5. Confirm the toggle now reports its pressed or "on" state
6. Reload the page
7. Confirm the page is STILL in dark mode after the reload
8. Switch the theme back to light mode
9. Confirm the page returns to light mode
```

Run it:

```bash
browserbash testmd run ./dark_mode_test.md
```

A few things are doing real work here. Step 5 asks the agent to check the toggle's *own* reported state, which maps onto the accessibility property a screen reader would announce (`aria-pressed`, `aria-checked`, or the `switch` role's checked state). That is a much stronger assertion than "a class exists somewhere," because it tests what assistive tech actually exposes to users. Steps 6 and 7 are the persistence check, and they are the part most hand-written toggle tests forget: a theme that resets on reload is a bug, and the only way to catch it is to actually reload and look again.

The `{{baseUrl}}` variable lets you point the same test at local, staging, and production without editing the file. Variables also get secret masking in logs, which matters less for a base URL and a lot for anything behind auth.

### Composing with a login flow

Most real apps gate theme preferences behind a session, because the preference is stored per user. If you already have a `login_test.md`, compose it in rather than copy-pasting steps:

```markdown
# Theme preference persists per logged-in user

@import ./login_test.md

1. Open the account settings or appearance section
2. Switch the theme to dark mode
3. Confirm the interface switched to dark mode
4. Reload the page and confirm dark mode survived the reload
5. Log out and log back in
6. Confirm the account is still in dark mode after a fresh login
```

Step 6 is the strongest persistence test of all: it proves the preference is stored server-side against the user, not just in the browser's `localStorage`. That distinction is invisible to a class-based assertion and obvious to an agent that just logs in again and looks.

## Asserting on visible state, not class names

The core skill in testing a theme switch with an AI agent is writing assertions that describe what a person sees. "The background is dark and the text is light" is a claim the agent can evaluate from the rendered page. "The body has class `dark`" is a claim about your source code that may or may not correspond to anything a user perceives.

Good, durable assertions for this topic look like:

- "The page background is now a dark color and the body text is light enough to read against it."
- "The theme toggle now reports an on or pressed state."
- "The navigation bar switched from a light surface to a dark one."
- "A previously dark-on-white card is now light-on-dark."

These survive refactors because they describe outcomes. If you want the deeper mechanics of why an agent can turn an English sentence into a pass or fail, and where that reasoning is solid versus shaky, I wrote that up separately in [how natural-language assertions work](https://browserbash.com/blog/natural-language-assertions-how-they-work). The short version: the agent grounds each assertion in the accessibility tree and the rendered DOM, so a claim about a *role* or a *visible text relationship* is far more reliable than a claim about an exact pixel value.

There is a subtle trap worth naming. "Light text on a dark background" is a relational, perceptual claim, and the agent is good at the relation (light versus dark) but should not be trusted on the absolute (is it precisely this token). Keep your English assertions relational and you stay inside the agent's strong zone.

## Handling the system-preference case

Modern apps usually support three states, not two: light, dark, and "follow the system." That third state is governed by the `prefers-color-scheme` media query, and it is genuinely harder to test because the input is the operating system or browser setting, not a button on the page.

You can still cover the in-app part:

```markdown
# Theme respects the explicit choice over system default

1. Open {{baseUrl}}
2. Open the appearance settings
3. Set the theme explicitly to dark (not "system")
4. Confirm the page is in dark mode
5. Reload and confirm dark mode persists
6. Set the theme to "system" or "auto"
7. Confirm the appearance control now shows "system" or "auto" as selected
```

Note what step 7 does and does not claim. It checks that the *control* registered the "system" choice, which is in-page and verifiable. It does not assert what color the page becomes, because that depends on the host environment's `prefers-color-scheme`, which the agent is not driving. Forcing the OS-level media query is outside a plain-English browser run; if you need that, a lower-level Playwright script with `page.emulateMedia({ colorScheme: 'dark' })` is the right tool, and there is no shame in keeping one such script alongside your agent tests for that single case. Be fair to Playwright here: media emulation is exactly what it is built for, and an agent is not a replacement for it.

## Pairing the run with screenshots and video

State assertions tell you pass or fail. Screenshots tell you *why*, and they give a human reviewer something to glance at. BrowserBash records evidence with a flag:

```bash
browserbash testmd run ./dark_mode_test.md --record
```

`--record` captures a `.webm` video plus screenshots for the run, and a `Result.md` is written per run summarizing what happened. For a theme test this is unusually valuable: a before/after pair (light, then dark) is the single most legible artifact you can hand a designer or a PM. They do not read your assertions; they look at two thumbnails and instantly see whether the switch worked.

If your whole reason for testing is the visual side, lean into evidence capture as its own workflow. I cover the capture-everything approach in [screenshot testing with AI](https://browserbash.com/blog/screenshot-testing-with-ai), and the practical mechanics of saving and reviewing run videos in [recording browser test videos from the CLI](https://browserbash.com/blog/record-browser-test-videos-cli). Both pair naturally with a dark-mode suite, because a theme bug is often something you *see* before any assertion can name it.

For local viewing you can open `browserbash dashboard` to browse runs, or add `--upload` to opt into the cloud dashboard (free runs are kept 15 days). Neither is required; the artifacts land in a run folder on disk either way.

## Running it in CI

A theme test earns its keep when it runs on every deploy. BrowserBash is built for that:

```bash
browserbash testmd run ./dark_mode_test.md --headless --agent --record
```

`--agent` emits NDJSON so a pipeline can parse each step as structured events, and the exit codes are unambiguous: `0` pass, `1` fail, `2` error, `3` timeout. `--headless` runs without a visible browser, and `--record` keeps the `.webm` so a failed dark-mode run leaves you a video to inspect instead of a wall of logs. A minimal gate looks like any other command step: run it, and let the exit code fail the build.

One CI-specific nicety for theme tests: late-rendering toggles are common, because theme controls often live in a menu or a settings drawer that hydrates after first paint. BrowserBash leans on Playwright's built-in auto-wait with a 15-second ceiling and no manual sleeps, so a toggle that appears a beat late is handled without you sprinkling `sleep` calls through the test. You describe the intent ("find the theme toggle"); the wait is the engine's problem.

## Choosing a model, and when to switch engines

Flipping a toggle and checking a relational visual claim is a short, low-branching flow, which is forgiving on model choice. By default BrowserBash resolves `auto`: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist there). For a quick local toggle check, a small local model can be enough, and nothing leaves your machine. The honest failure mode: small local models (8B and under) get flaky on longer flows, and the log-out-and-back-in persistence test above is long enough to trip them. For that one, reach for a 70B-class local model (Qwen3, Llama 3.3) or a hosted model. There is a fuller treatment of this tradeoff on the [features page](https://browserbash.com/features) and in the [learn](https://browserbash.com/learn) section.

If a toggle intermittently fails to register, switch to the `builtin` engine with `--engine builtin`. It is an Anthropic tool-use loop that captures native Playwright traces and re-derives the selector on every action from a fresh snapshot, never cached across runs. The trace is gold for a flaky toggle: you get a timeline of exactly what the agent saw and clicked, which is often how you discover the real bug is that the toggle is covered by an invisible overlay for 200ms after the menu opens. The default `stagehand` engine (MIT, by Browserbase) observes the live DOM each step instead; both re-derive from current state rather than replaying a saved script.

## Honest limits: where this struggles

I would rather you trust this for the right things than oversell it, so here is the unvarnished list.

**Pixel-exact color is out of scope.** An AI agent can tell you the background went from light to dark and that text contrast looks readable. It cannot reliably tell you the surface is exactly `#0d1117` or that your brand purple rendered at precisely the right value. If your test is "the dark theme uses these exact tokens," you want a real visual-diff tool with a pinned baseline, not an agent. I walk through where intent-based checks end and pixel diffing begins in the [AI visual regression testing guide](https://browserbash.com/blog/ai-visual-regression-testing-guide). Pair the two: the agent for "did the theme switch and is it readable," a diffing platform for "is every token byte-exact."

**Contrast and accessibility ratios need a real checker.** "The text looks readable on the dark background" is a perceptual judgment, not a WCAG contrast-ratio measurement. If you need to assert a 4.5:1 ratio, run an actual axe-style audit; do not ask the agent to eyeball it and call it compliance.

**System-preference (`prefers-color-scheme`) is not driven by the agent.** As covered above, the agent operates the page, not the OS. Testing how your app responds to a *system* dark-mode setting is a Playwright media-emulation job. Keep one small script for it.

**Flicker and flash-of-wrong-theme can slip through.** A flash-of-unstyled-content bug (the page loads light for 100ms then snaps to dark) is something slow-connection users see and hate, but a pass/fail state assertion checks the *settled* state and may miss it. Your best catch here is the `--record` video and a human glance.

**Subtle theme bugs are still subtle.** If dark mode is mostly right but one specific card kept a white background, a high-level "the page is in dark mode" assertion can pass while the bug ships. Write per-region assertions for the surfaces you care about, and lean on screenshots so a reviewer catches what the assertions did not name.

**Non-determinism is real.** An agent reasons, and reasoning varies run to run more than a hardcoded selector does. For a flow this short the variance is small but not zero; budget for the occasional re-run and prefer relational assertions, which have the widest margin.

None of this makes BrowserBash a bad fit for theme testing. It makes it a *state and behavior* tool, which is exactly what most theme bugs are. Reach for pixel diffing, contrast auditing, and media emulation as complements, not competitors.

## FAQ

### How do I test that a dark mode toggle persists after a page reload?

Add explicit reload steps to your test and re-assert the visible state afterward. In a `*_test.md` file, switch to dark mode, then add a step like "Reload the page" followed by "Confirm the page is still in dark mode." For per-user persistence (a server-stored preference), go further: log out and log back in, then confirm the theme survived a fresh session. The agent re-observes the rendered page after each reload, so it is checking what the user would actually see, not a cached value. This reload-and-recheck pattern is the single most important part of a theme test, and it is the step most hand-written toggle tests skip.

### Can an AI agent check the exact dark mode colors?

No, and you should not ask it to. An AI agent reliably confirms *relational* visual state ("the background went dark, the text is light and readable") but is the wrong tool for absolute color assertions like "this surface is exactly `#0d1117`." For byte-exact token verification, use a dedicated visual-regression tool with a pinned baseline. The healthy split is to let the agent confirm the theme switched and remains usable, and let a pixel-diff platform guard the exact values. Keep your English assertions relational and you stay inside the agent's strong zone.

### How does the agent find the theme toggle without a CSS selector?

BrowserBash finds elements through the accessibility tree (roles, accessible names, and states like pressed or checked) combined with the DOM, not CSS classes. So it looks for a control that reads like a theme or appearance toggle and is operable, whether that is a `<button>`, a `role="switch"` checkbox, or a styled element with correct ARIA. It also handles iframes and Shadow DOM, which matters if your toggle lives inside a web component. Because the agent re-derives the element from the live page on every run, renaming a class or restructuring the markup does not break the test.

### Should I use BrowserBash or Playwright for theme testing?

Use both, for different parts. BrowserBash is excellent for the user-visible behavior: did the theme switch, does it persist, does the toggle report the right state, all written in plain English that survives refactors. Playwright is the right tool for the lower-level cases an agent cannot drive, especially `page.emulateMedia({ colorScheme: 'dark' })` to test how your app responds to a *system* preference, and for byte-exact screenshot baselines. They are complementary. A pragmatic suite uses BrowserBash for the behavioral and persistence checks and keeps a couple of targeted Playwright scripts for media emulation and pixel-pinned visuals.

## Wrapping up

Testing a dark mode toggle with an AI agent comes down to three moves: flip the control, assert on the *visible* state rather than a class name, and reload to prove the choice persisted. BrowserBash makes each move a sentence of plain English, finds the toggle through the accessibility tree so renames do not break you, and drops a video plus a `Result.md` so a human can verify at a glance. Stay relational in your assertions, lean on screenshots for the things assertions cannot name, and hand the pixel-exact and system-preference cases to the tools built for them. Do that and you have a theme test that checks the thing your users actually care about: I clicked it, the page got dark, and it stayed that way.
