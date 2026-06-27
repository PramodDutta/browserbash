---
title: Testing Keyboard Navigation and Shortcuts With an AI Agent
description: "Test keyboard navigation, tab order, focus management, and app shortcuts with plain-English steps an AI agent runs in real Chrome instead of brittle selectors."
date: 2026-06-27
category: testing
---

To test keyboard navigation with an AI agent, you write a plain-English objective that says which keys to press and what visible result or focus state to confirm, then an agent drives a real Chrome browser and reports pass or fail. Instead of forty lines of `page.keyboard.press('Tab')` followed by fragile `document.activeElement` assertions, you write a sentence like "Tab through the login form in order, confirm focus lands on the email field first, then password, then the Sign in button, and confirm each shows a visible focus ring." The agent performs the steps, reads the page state after each keystroke, and tells you what it found. The same approach covers Enter and Escape behavior, modal focus traps, and application shortcuts like pressing `/` to focus a search box or `g` then `i` to jump to an inbox.

This article is specifically about keyboard testing, because keyboard testing is where intent-based automation earns its place. Tab order, focus management, and shortcuts are described in behavioral language to begin with, and they are exactly the checks that static rule scanners structurally miss. They are also tedious to verify by hand on every dialog and every page. I will show you the objectives to write, the markdown test files to commit, how to wire the run into CI, and an honest account of where an AI agent struggles with keyboard work. Keyboard access is an accessibility requirement first, so this connects directly to broader [AI accessibility testing](https://browserbash.com/blog/ai-accessibility-testing-guide), but it is also a plain functional concern: if your power users live on shortcuts, those shortcuts deserve tests.

## Why keyboard testing resists selector-based automation

Keyboard navigation is about operation, not markup. WCAG 2.1.1 (Keyboard) and 2.1.2 (No Keyboard Trap) ask whether you can actually drive the interface with keys and whether you can get back out, not whether the right attributes exist. A `<div role="button">` passes every "has a role" rule and still does nothing when you press Enter. A modal can carry a flawless `aria-modal="true"` and still trap focus because nobody wired up Escape. A scanner reads the attributes and moves on. You only catch the failure by pressing keys and watching where focus goes.

That behavioral nature is also what makes keyboard tests painful to script with selectors. A traditional Playwright keyboard test has two brittle halves. The first half presses keys, which is fine. The second half asserts the result, and that is where it rots: you compare `document.activeElement` against a hard-coded selector, you assert a class name on a focus ring, you check that a dropdown's `aria-expanded` flipped. Every one of those assertions is pinned to a structure that changes when a designer renames a class or a developer swaps a `<div>` for a `<button>`. The flow still works for a real user. The test breaks anyway.

There is a deeper mismatch too. Keyboard correctness is often a judgement about a whole sequence, not a single state. "Does focus order match the visual order?" is not one assertion. It is a comparison across every stop in the tab sequence. Encoding that as selectors means enumerating every element in the order you expect and asserting each one in turn, which is precisely the script that breaks the moment the form gains a field. An agent that reads the page between keystrokes can narrate the order it actually lands in and reason about whether that order is sane, which is the thing you wanted to know in the first place.

## How an AI agent presses keys and checks focus

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, write a plain-English objective, and an AI agent drives a real Chrome browser step by step. There are no selectors, no page objects, and no `await page.locator(...)`. The agent finds elements through the accessibility tree (roles, accessible names, and states) plus the DOM, which is the same surface a screen reader and a keyboard user rely on, so it is a natural fit for keyboard work.

It also does not cache a selector script between runs. On the default engine (stagehand, MIT, by Browserbase) the agent observes the live DOM each step and decides the next action from what is rendered right then. On the alternate built-in engine (an Anthropic tool-use loop) it re-derives the target on every action from a fresh accessibility snapshot and captures native Playwright traces. Either way the agent works from current state rather than a saved recording. That matters for keyboard tests because the thing you are checking, where focus is right now, is live state by definition.

A worked tab-order check looks like this:

```bash
browserbash run "Go to https://app.example.com/login. Starting from the top of the page, press Tab repeatedly and narrate the order focus lands in. Confirm the order is: email field, password field, the 'Remember me' checkbox, then the 'Sign in' button. Confirm every element shows a visible focus indicator. Report any element that cannot be reached by Tab and any place where the focus order jumps around illogically."
```

The agent navigates, presses Tab, reads the page state after each press, and reasons about whether the order is sane and whether anything is unreachable. It is doing what a manual tester does with their hands on the keyboard, except it writes the result into a structured verdict you can diff over time. Because the assertions are expressed in plain language ("focus lands on the Sign in button") rather than a selector, renaming the button's class or its DOM wrapper does not break the test. For more on why those plain-language checks hold up, see [how natural-language assertions work](https://browserbash.com/blog/natural-language-assertions-how-they-work) and [how BrowserBash finds elements via the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree).

## Tab order and focus management

Tab order is the first thing to test and the most common thing to break. Two failures dominate. The first is an interactive element you cannot reach with the keyboard at all, usually a custom dropdown or a clickable `<div>` that never got `tabindex="0"`. The second is focus order that does not match the visual order, so a sighted keyboard user tabs from the email field down to the footer and then back up to the password field. Both are behavioral, and both are easy to express:

```bash
browserbash run "Open https://app.example.com/settings. Press Tab from the top of the page through to the bottom and list, in order, the accessible name of every element that receives focus. Then tell me whether that order matches the visual top-to-bottom, left-to-right layout. Flag any interactive control (button, link, input, toggle) that the Tab key never reaches."
```

Focus management is the harder sibling of tab order, and it shows up after an action rather than during idle tabbing. When you open a menu, where does focus go? When you close a modal, does focus return to the control that opened it, or does it dump you back at the top of the page? When new content loads, does focus move to it or stay stranded? These are exactly the bugs that make a keyboard user lose their place, and they are invisible to a scanner because nothing in the markup is wrong. You verify them by performing the action and then asking where focus is:

```bash
browserbash run "Go to https://app.example.com. Open the account menu by activating the 'Account' button with Enter. Confirm focus moves into the menu. Close the menu with Escape and confirm focus returns to the 'Account' button, not to the top of the page."
```

## Enter, Escape, and modal traps

Enter and Escape carry implicit contracts that selector tests rarely cover. Enter on a focused button should activate it. Enter inside a single-line text field in a form should usually submit. Escape should close a menu, dismiss a dialog, or cancel an inline edit. The most valuable Escape test is the keyboard trap check from WCAG 2.1.2: if focus can move into a component, it must be able to move out using only the keyboard. Modals are the classic offender. The dialog opens, focus moves inside, and Tab cycles forever because the focus trap was scoped but Escape and the close button were never wired up.

```bash
browserbash run "Go to https://app.example.com/billing. Click 'Delete account' to open the confirmation dialog. Confirm focus moves into the dialog. Press Tab several times and confirm focus stays inside the dialog and cycles through its controls (it should not escape to the page behind it). Then press Escape and confirm the dialog closes and focus returns to the 'Delete account' button. Report failure if Escape does nothing or if Tab leaks focus to the page underneath."
```

That objective bundles three real checks: focus enters the dialog, focus is correctly trapped while it is open, and Escape provides a keyboard exit. Doing this by hand on every dialog in an app is the kind of tedium people skip, which is why these bugs ship. Handing it to an agent makes it cheap enough to run on every release.

## Application keyboard shortcuts

Beyond standard navigation keys, many apps ship their own shortcuts, and power users notice immediately when they break. A `/` to focus search, `?` to open a help overlay, `c` to compose, `g` then `i` to go to an inbox, `j` and `k` to move through a list, `Cmd+K` or `Ctrl+K` for a command palette. These are pure behavior: press a key, confirm a visible result. They are also genuinely awkward to script, because the "result" is often a focus change or an overlay that has no stable selector. Plain-English objectives handle them directly:

```bash
browserbash run "Go to https://app.example.com. Press the '/' key and confirm the search input becomes focused and ready for typing. Press Escape and confirm focus leaves the search input. Then press 'g' followed by 'i' and confirm the page navigates to the inbox view."
```

For a chorded shortcut like a command palette, name the chord and the expected result:

```bash
browserbash run "Open https://app.example.com. Press Ctrl+K (use Cmd+K on macOS) and confirm a command palette overlay appears with a focused text input. Type 'settings', confirm a matching result is highlighted, press Enter, and confirm the app navigates to the settings page."
```

A note on platform keys: Cmd versus Ctrl differs between macOS and other systems, so state both in the objective and let the agent pick the right one for the environment it runs in, or pin the platform in CI so the run is deterministic.

## Composable keyboard tests as markdown

For checks you run repeatedly, move the objective out of the shell and into a markdown test file. Tests are intent, not selectors. A `*_test.md` file is a title, a list of steps, optional `@import` composition, and `{{variables}}` whose values are masked in logs when they hold secrets. Here is a keyboard navigation suite:

```markdown
# Keyboard navigation: login and dashboard

1. Go to https://app.example.com/login
2. Press Tab and confirm focus lands on the email field
3. Type {{username}} into the focused email field
4. Press Tab and confirm focus lands on the password field
5. Type {{password}} into the focused password field
6. Press Tab and confirm focus lands on the "Sign in" button, with a visible focus ring
7. Press Enter and confirm the dashboard loads
8. Press the "/" key and confirm the dashboard search input becomes focused
9. Press Escape and confirm focus leaves the search input
```

Run it with:

```bash
browserbash testmd run ./keyboard_login_test.md
```

Because credentials live in `{{username}}` and `{{password}}` and are masked in logs, you can commit the test without leaking secrets. If you already have a login test, compose rather than duplicate:

```markdown
# Keyboard shortcuts after login

@import ./keyboard_login_test.md

1. Press "g" then "i" and confirm the inbox view loads
2. Press "j" twice and confirm the list selection moves down two rows
3. Press Enter and confirm the selected item opens
4. Press Escape and confirm the item closes and focus returns to the list
```

This style keeps keyboard behavior described as user intent. The agent re-derives how to reach each control from live state on every run, so the test does not carry a stale selector that needs patching when the markup shifts. That intent-first framing is the whole point of [testing user intent rather than clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants). One caveat worth stating plainly: re-deriving from live state is not the same as a tool that patches and saves a selector script for you. There is no cached script to repair, because there is no cached script at all.

## Wiring keyboard tests into CI

For CI, BrowserBash emits a machine signal and you wire the integration alongside it. The contract is the exit code: `0` pass, `1` fail, `2` error, `3` timeout. Your pipeline already knows how to fail a step on a non-zero exit, so no plugin or results parser is required. The `--agent` flag emits NDJSON, one JSON object per line, so a step can stream progress and read the terminal event:

```bash
browserbash testmd run ./keyboard_login_test.md \
  --agent \
  --headless \
  --record \
  --timeout 90
```

`--headless` runs without a visible window, `--timeout 90` caps the run so a hung flow fails the gate instead of stalling, and `--record` captures a `.webm` video and screenshots so a keyboard failure is a thirty-second watch instead of a guessing game. Each run also writes a human-readable `Result.md`. With the built-in engine you additionally get a native Playwright trace, which turns "the Escape test failed" into "the Escape test failed because the dialog's keydown handler never fired."

A minimal GitHub Actions job:

```yaml
name: keyboard-a11y
on: [push]
jobs:
  keyboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli
      - name: Run keyboard navigation tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          USERNAME: ${{ secrets.TEST_USERNAME }}
          PASSWORD: ${{ secrets.TEST_PASSWORD }}
        run: |
          browserbash testmd run ./keyboard_login_test.md \
            --agent --headless --record --timeout 120
      - name: Upload run artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: keyboard-run
          path: |
            ./Result.md
            ~/.browserbash/runs
```

If the run exits `0`, the keyboard flow held and the step passes. If it exits `1`, `2`, or `3`, the job fails and your existing notifications fire. BrowserBash does not natively post to Slack or open a Jira ticket; it produces the exit code, the NDJSON, the `Result.md`, and the recording, and you connect those to whatever you already use. A small follow-up step can parse the `run_end` line from the NDJSON and post the summary wherever your team watches builds.

On the model side, the default is `auto`, which resolves Ollama first (free, nothing leaves the machine), then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist there too). Pin the model explicitly in CI so a run is reproducible rather than depending on whatever happens to be installed on the agent. The provider defaults to `local` Chrome on the runner; if your runners cannot host Chrome, point at a DevTools endpoint with `--provider cdp` or use a hosted grid. For tuning, `browserbash dashboard` opens a fully local view, and cloud upload is opt-in per run with `--upload` (free cloud runs kept 15 days).

## Honest limits of AI keyboard testing

This approach has real edges, and keyboard work exposes some of them more than other testing does.

**It is not a formal conformance engine.** The agent reasons about whether focus order and key behavior are sane. It does not produce a legally defensible WCAG audit. Keep running a static scanner for the rules a scanner is good at, and treat the agent as the behavioral layer on top. For the division of labor, the [accessibility testing guide](https://browserbash.com/blog/ai-accessibility-testing-guide) lays it out.

**Exact focus-ring pixels are hard to judge.** The agent can confirm an element appears focused and that a visible indicator is present, but it is not a pixel-diff tool. If your requirement is "the focus outline is exactly 2px solid #0050FF and offset 2px," that is a visual-regression assertion, and a screenshot-diffing tool will be more precise than a reasoning agent describing what it sees.

**Timing-sensitive and held-key interactions are weak spots.** Shortcuts that depend on key-repeat, precise key-down/key-up timing, or rapid chords pressed within a tight window are not where a step-by-step agent shines. Playwright's built-in auto-wait (a 15-second ceiling, no manual sleeps) handles late-rendering elements well, but it does not reproduce a human mashing `j` ten times in half a second. For those, a tightly scripted keyboard test is still the better tool.

**Small local models drift on long key sequences.** A keyboard suite that tabs through thirty elements is a long multi-step objective, and very small local models (8B parameters and under) can lose the plot, miss a stop, or declare success early. For anything beyond a few keystrokes, run a 70B-class local model (Qwen3 or Llama 3.3) or a capable hosted model. Local keeps everything on the machine; hosted buys reliability on the harder flows. Keep objectives narrow either way, and a long tab-order walk is more reliable split into a few focused tests than crammed into one.

**Non-determinism is the standing tax.** The same objective can take a slightly different path run to run. That is what lets a test survive UI churn, and it is also why a one-off failure can be annoying to reproduce. Mitigate it the usual way: keep each objective unambiguous, name the exact focus state or visible result you expect, and capture `--record` artifacts so a failure is inspectable rather than a mystery.

If you want to go deeper on writing good objectives and composing suites, the [learn hub](https://browserbash.com/learn) walks through the patterns end to end.

## FAQ

### How do I test tab order with an AI agent?

Write an objective that tells the agent to press Tab from the top of the page and narrate the order focus lands in, then state the order you expect by accessible name. For example: "Press Tab repeatedly and confirm focus moves through the email field, password field, then the Sign in button, and flag any control the Tab key never reaches." The agent presses the keys, reads where focus actually goes after each press, and reports whether the order matches and whether anything is unreachable. Because you describe the elements by name rather than by selector, renaming a class or restructuring the DOM does not break the test.

### Can an AI agent test custom keyboard shortcuts like Cmd+K?

Yes. Name the key or chord and the visible result you expect: "Press Ctrl+K (Cmd+K on macOS) and confirm a command palette overlay appears with a focused input." The agent sends the keystroke and checks the page state, so shortcuts whose result is a focus change or an overlay with no stable selector are straightforward to verify. State both the macOS and non-macOS keys in the objective, or pin the platform in CI, so the run is deterministic. The weak spot is shortcuts that depend on precise key-repeat or sub-second chord timing, which a step-by-step agent does not reproduce well.

### How does keyboard testing relate to accessibility testing?

Keyboard access is a core accessibility requirement: WCAG 2.1.1 says everything must be operable by keyboard, and 2.1.2 says focus must never be trapped. So every keyboard test you write is also an accessibility test of behavior that static scanners like axe-core structurally miss, since those rules are about operation, not markup. Keep the scanner for the rules it checks well (labels, contrast, alt text) and use the agent for the behavioral layer: reachability, focus order, focus return after dialogs, and keyboard traps.

### Do I need to write Playwright code to test keyboard navigation?

No. You write the steps in plain English, either inline with `browserbash run "..."` or in a committed `*_test.md` file run with `browserbash testmd run`. The agent drives a real Chrome browser using Playwright under the hood, including its built-in auto-wait for late-rendering elements, but you never write `page.keyboard.press(...)` or assert on `document.activeElement` yourself. You describe the keys to press and the focus state or visible result to confirm, and the agent handles the mechanics and the verdict.
