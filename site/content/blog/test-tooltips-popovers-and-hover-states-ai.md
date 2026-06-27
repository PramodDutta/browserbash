---
title: How to Test Tooltips, Popovers, and Hover States With AI
description: "Test tooltips and hover states with AI by hovering an element, letting auto-wait surface the popover, asserting its visible text or role, then dismissing it."
date: 2026-06-27
category: testing
---

To test tooltips and hover states with AI, you write the test as intent: hover the element that triggers the tooltip, wait for the tooltip to render, assert on its visible text or accessibility role, then move the pointer away and confirm it disappears. With BrowserBash you express that as plain English in a `*_test.md` file or a one-line `browserbash run` objective, and the agent hovers the trigger, reads the accessibility tree to find the popover that just appeared, and checks the text you named. Playwright's built-in auto-wait handles the timing gap between hover and render (up to a 15 second ceiling, no manual sleeps), so you never hardcode a delay. The honest caveat up front: hover-only UI is fragile to test anywhere, because a tooltip that exists only while the cursor is physically over an element is hard to observe reliably. The durable move is to assert on the text or role the tooltip exposes, not on pixel position or CSS class, and to prefer components that stay reachable by keyboard or click.

## Why hover UI is hard to test at all

A tooltip is born when the pointer enters an element, lives while the cursor stays, and dies the moment it leaves. That lifecycle fights automation in three ways.

First, timing. The tooltip almost never appears on the same tick as the hover. There is usually a deliberate delay (often a few hundred milliseconds) so tooltips do not flicker as a user sweeps across a toolbar. A naive test that hovers and asserts immediately reads an empty DOM and fails intermittently.

Second, discoverability. Many tooltips are not in the DOM until you hover, and then they get injected into a portal at the end of `<body>`, far from the trigger in the markup. You cannot find them by walking down from the button you hovered; you have to look across the whole rendered tree for the popover that just appeared.

Third, dismissal. To verify a tooltip is dismissible you move the pointer elsewhere and check the element is gone, and "gone" has the same timing problem in reverse since the tooltip may fade out over a transition.

BrowserBash locates elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, which matters here because tooltips and popovers have well-defined ARIA semantics. A real tooltip is exposed with `role="tooltip"`; an interactive popover is often a `dialog` or `menu`. Targeting those roles and the visible text inside them is far more stable than targeting `.tooltip-inner.show`. For more on how the agent copes with content that appears and disappears, see [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## The basic shape: hover, wait, assert, dismiss

Here is the smallest possible test. An icon button with no visible label has a tooltip that explains what it does. We hover it, confirm the tooltip text, then move away and confirm it is gone.

```markdown
# Settings icon shows a tooltip

1. Go to https://app.example.com/dashboard
2. Hover over the gear icon button in the top toolbar
3. Confirm a tooltip appears with the text "Open settings"
4. Move the pointer to the page heading
5. Confirm the "Open settings" tooltip is no longer visible
```

Save that as `tooltip_test.md` and run it:

```bash
browserbash testmd run ./tooltip_test.md
```

Notice what is not in the file: no `mouseover` event name, no `waitForSelector`, no `setTimeout`, no selector at all. You named the trigger ("the gear icon button in the top toolbar") and what you expect ("a tooltip with the text Open settings"). The agent finds the gear button by its accessible name and toolbar context, hovers, and waits for the tooltip to render before reading it. That wait is Playwright's auto-wait, which polls until the element is present and stable or the 15 second ceiling is reached, so the delay is implicit in "confirm a tooltip appears."

Step 4 is the load-bearing part of the dismissal check. You cannot assert "the tooltip is gone" without first doing something that dismisses it. Moving the pointer to another element (the heading) fires the mouse-leave on the trigger, which tells the application to hide the tooltip, and step 5 then asserts the absence.

## Assert on text and role, not position

The most important habit for hover tests is to assert on what the tooltip says and what it is, never on where it sits or what class it carries.

A brittle assertion, even phrased in English, looks like "confirm a `div` with class `tooltip` appears 8 pixels above the button": that asks the agent to verify implementation details that change every time a designer touches the component. A durable assertion looks like "confirm a tooltip with the text Delete this row appears." The text is the contract the user experiences, and if it is right and exposed as a tooltip, the feature works regardless of class names or offsets.

```markdown
# Destructive action tooltip warns the user

1. Go to https://app.example.com/records/42
2. Hover over the trash icon in the row actions
3. Confirm a tooltip appears that says "Delete this row permanently"
4. Confirm the tooltip is exposed with the tooltip role
5. Move the pointer away and confirm the tooltip disappears
```

Step 4 asks for the role explicitly. That is optional but valuable: a `title` attribute tooltip and a real ARIA `role="tooltip"` element look identical to a sighted mouse user, but only the latter is announced to assistive technology. If your acceptance criteria include accessibility, naming the role in the test turns a visual check into a semantics check. Because BrowserBash reads the accessibility tree, asking it to verify the tooltip role is a first-class thing it can do, not a hack. The same philosophy of describing the user-visible outcome rather than the DOM internals is covered in depth in [natural-language assertions and how they work](https://browserbash.com/blog/natural-language-assertions-how-they-work).

## Popovers with interactive content

A tooltip is read-only text. A popover is richer: a hover (or click) opens a small floating panel that can contain links, buttons, or a form. A user-profile chip that reveals a card with "View profile" and "Send message" buttons on hover is a popover, not a tooltip. Testing it means opening it, interacting inside it, and confirming the right thing happened.

```markdown
# User chip popover exposes profile actions

1. Go to https://app.example.com/team
2. Hover over the avatar for "Ada Lovelace"
3. Confirm a popover appears showing "Ada Lovelace" and a "View profile" button
4. Move into the popover and click "View profile"
5. Confirm the page navigates to Ada Lovelace's profile
```

Step 4 hides a real subtlety. To click a button inside a hover-triggered popover, the pointer has to travel from the avatar into the panel without crossing empty space that would close it. Well-built popovers add an invisible bridge or a close delay so the user can reach the panel. The phrase "move into the popover and click" lets the agent treat that as one continued interaction. If your popover closes the instant the pointer leaves the avatar, that is a real product bug, and the test surfaces it as a failure to find the button, which is the correct outcome.

Popovers share a lot of behavior with modals and toasts, because all three are floating, conditionally rendered layers. If you are testing a mix of them, the patterns in [testing modals, toasts, and notifications with AI](https://browserbash.com/blog/test-modals-toasts-and-notifications-with-ai) carry straight over.

## Composing hover tests with @import

Tooltip checks rarely live alone. They tend to be one assertion inside a longer flow: log in, open a screen, then verify the help affordances on it. BrowserBash lets you compose tests with `@import`, so the setup lives in one file and the hover assertions in another.

```markdown
# Toolbar help tooltips after login

@import ./login_test.md

1. Go to https://app.example.com/editor
2. Hover the bold button and confirm a tooltip "Bold (Ctrl+B)"
3. Move away, then hover the italic button and confirm "Italic (Ctrl+I)"
4. Move away, then hover the link button and confirm "Insert link (Ctrl+K)"
5. Move the pointer to the canvas and confirm no tooltip is visible
```

The `@import ./login_test.md` line pulls in a reusable login flow, including any `{{variables}}` it references. Secrets such as `{{password}}` are masked in logs, so a composed hover test that runs behind authentication does not leak credentials into your CI output. The repeated "move away, then hover the next" rhythm is deliberate: each tooltip must clear before the next one is asserted, otherwise you can get two tooltips briefly coexisting and a confusing assertion.

## Wiring hover tests into CI

Tooltip tests earn their keep when they run on every pull request, because hover affordances are exactly the kind of detail that silently breaks during a refactor. BrowserBash is built to feed CI: `--agent` emits NDJSON (one JSON object per line) that you can parse, `--headless` runs without a display, `--record` captures a `.webm` video and screenshots, and the process exits with a code that carries the verdict (0 pass, 1 fail, 2 error, 3 timeout). A `Result.md` is written per run for humans to read.

Here is a minimal GitHub Actions step:

```yaml
- name: Run tooltip and popover checks
  run: |
    browserbash testmd run ./tests/tooltip_test.md \
      --headless --agent --record \
      | tee tooltip-run.ndjson
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Upload artifacts on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: tooltip-evidence
    path: |
      tooltip-run.ndjson
      Result.md
      *.webm
      *.png
```

The honest framing: BrowserBash emits the signal, and you wire the integration around it. It does not natively post to Slack or open a Jira ticket. What it gives you is a clean exit code your CI gates on, an NDJSON stream you can transform, a `Result.md` to attach, and recorded media to inspect when a hover assertion fails. If you want a Slack ping on failure, you read the exit code in a shell step and call the Slack webhook yourself. A tiny gate looks like this:

```bash
browserbash testmd run ./tests/tooltip_test.md --headless --agent \
  > run.ndjson
code=$?
if [ "$code" -ne 0 ]; then
  echo "Tooltip checks failed with exit code $code"
  # post run.ndjson tail and Result.md to your channel of choice
  exit "$code"
fi
```

For hover tests in particular, `--record` is worth turning on by default. When a tooltip assertion fails, the most common question is "did the tooltip never appear, or did it appear and say the wrong thing, or did it appear and then vanish too fast?" The `.webm` answers that in seconds, where a stack trace cannot. Recording the run turns a flaky-looking failure into a diagnosable one. More on keeping these runs stable is in [reduce flaky end-to-end tests](https://browserbash.com/blog/reduce-flaky-end-to-end-tests).

## Timing: let auto-wait do the work

The number one cause of flaky tooltip tests in traditional suites is a hardcoded sleep that is too short on a slow CI machine and wasteful on a fast one. BrowserBash does not use manual sleeps. It relies on Playwright's built-in auto-wait, which polls for the element to be present and actionable, with a 15 second ceiling. When you say "confirm a tooltip appears," the agent keeps checking until the tooltip is there or the ceiling is hit.

This matters in both directions. For appearance, auto-wait absorbs the deliberate few-hundred-millisecond show delay that good tooltips use, plus any animation, without you knowing the exact number. For disappearance, "confirm the tooltip is no longer visible" waits out the fade transition rather than racing it. You describe the end state, and the wait is the agent's problem.

The one place you may still need to be explicit is a tooltip that requires the pointer to dwell for an unusually long time before showing (some help systems use a one-second-plus delay to avoid noise). If that delay is near or past the 15 second ceiling, the test cannot wait it out. That is rare, and arguably a UX smell, but it is the boundary to know about.

## Choosing a model for hover flows

Hover tests are short and visual, which is friendly to smaller models, but the multi-step "hover, read, move, re-check" rhythm still benefits from a capable model. BrowserBash resolves the model automatically by default: it tries Ollama first (fully local, nothing leaves the machine), then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free models exist.

For local runs, small models (8B and under) tend to get flaky on longer flows: they may lose track of which tooltip they just dismissed, or assert on the previous one. For a quick single-tooltip check, a small local model is often fine. For a toolbar with eight tooltips checked in sequence, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model holds the thread far better. The default engine, Stagehand (MIT, by Browserbase), observes the live DOM each step and decides the next action from what is rendered right then, which suits hover UI because the page genuinely changes shape between steps. The alternative builtin engine (an Anthropic tool-use loop) captures native Playwright traces and re-derives the selector on every action from a fresh snapshot, never cached across runs, which is useful when you want trace artifacts for a flaky hover bug. You can see the engine and provider options on the [features page](https://browserbash.com/features).

## Honest limits: where this gets hard

Hover testing has real edges, and pretending otherwise helps no one.

Pure-hover UI with no keyboard or click path is the worst case. If a tooltip only ever appears on mouse hover and is never reachable by tab focus or a click, then it is inaccessible to keyboard users and harder for any automation to verify deterministically. The agent can hover, but a tooltip whose visibility depends on a continuously held physical cursor position is intrinsically racy. The fix is mostly a product fix: make the affordance reachable by focus or click too. A tooltip that shows on focus as well as hover is both more accessible and far easier to test, and you can then assert on the focus path instead.

Native `title` attribute tooltips are a second limit. When a tooltip is just an HTML `title` attribute, the browser draws it with the operating system, outside the DOM and outside the accessibility tree's hovered-content view. There is no `role="tooltip"` element to find because the OS owns the rendering. The agent can confirm the `title` attribute value exists on the element, but it cannot reliably observe the gray OS bubble that appears. If your "tooltip" is a `title` attribute, test the attribute's presence and value, and accept that the visual bubble itself is out of reach.

Tooltips that depend on exact pointer coordinates are a third. Charts and maps sometimes show a tooltip only when the cursor is over a specific data point at specific pixels. Describing "hover the third bar in the revenue chart" works when the bar has an accessible name or label, but a bare SVG region with no semantics is hard to target by intent. The mitigation is to add accessible names to chart elements, which helps screen-reader users and the agent equally.

Finally, animation-heavy tooltips can produce timing assertions that are genuinely ambiguous. If a tooltip fades out over a long transition, "is it gone yet" has no crisp answer mid-fade. Auto-wait will settle once the element is removed or hidden, but if the application leaves a zero-opacity element in the DOM forever, the absence check can read as still-present. The remedy is to assert on a state the application actually reaches (the element being removed, or hidden from the accessibility tree) rather than opacity. When in doubt, prefer asserting the positive: that the next thing the user does works, which implicitly proves the tooltip got out of the way.

## A complete example you can adapt

Putting it together, here is a realistic file that covers a tooltip, a popover, and a dismissal, behind a login, ready for CI.

```markdown
# Help affordances on the editor toolbar

@import ./login_test.md

1. Go to https://app.example.com/editor/new
2. Hover the "Insert image" icon button
3. Confirm a tooltip appears reading "Insert image"
4. Confirm the tooltip is exposed with the tooltip role
5. Move the pointer to the document title field
6. Confirm the "Insert image" tooltip is no longer visible
7. Hover the "Share" button to open its popover
8. Confirm a popover appears with a "Copy link" button and a "Manage access" link
9. Move into the popover and click "Copy link"
10. Confirm a confirmation message "Link copied" appears
11. Move the pointer to the canvas and confirm the popover has closed
```

Run it locally while iterating:

```bash
browserbash testmd run ./tests/help_affordances_test.md
```

And in CI, headless with evidence:

```bash
browserbash testmd run ./tests/help_affordances_test.md \
  --headless --agent --record > help.ndjson
```

Every step is phrased as user intent. No selectors, no class names, no sleeps. The agent finds each control by its accessible name, hovers, waits out the show delay via auto-wait, reads the tooltip or popover from the accessibility tree, and checks the text you specified. When it breaks, the NDJSON tells your pipeline what failed and the `.webm` shows you why. To go deeper on the testing patterns behind all of this, the [learn hub](https://browserbash.com/learn) collects the guides in order.

## FAQ

### How do I wait for a tooltip without a hardcoded sleep?

You do not add a wait at all. You write "confirm a tooltip appears with the text ..." and BrowserBash uses Playwright's built-in auto-wait to poll until the tooltip is present and stable, up to a 15 second ceiling. The deliberate show delay that tooltips use (and any fade animation) is absorbed by that polling, so the test is neither too fast on a slow CI machine nor wasteful on a fast one. The only case where this breaks down is a tooltip whose show delay is itself near 15 seconds, which is rare and usually a UX problem worth fixing.

### Should I assert on the tooltip's CSS class or its text?

Its text, and optionally its role. BrowserBash locates elements through the accessibility tree and DOM rather than CSS classes, so the durable assertion is the visible text the user reads ("Delete this row permanently") plus, if accessibility matters, that the element carries `role="tooltip"`. Asserting on a class like `.tooltip-inner.show` couples your test to implementation details that change whenever the component is restyled, and it tells you nothing about whether the user actually sees the right message.

### How do I test that a tooltip gets dismissed?

Do something that should dismiss it, then assert its absence. Concretely, after confirming the tooltip appeared, add a step that moves the pointer to a different element (which fires the mouse-leave on the trigger), then a step that confirms the tooltip is no longer visible. The dismissal assertion has the same auto-wait behavior as appearance, so a fade-out transition is waited out. If the tooltip never clears, prefer asserting on a state the app truly reaches, such as the element being removed from the accessibility tree, rather than on opacity.

### Can BrowserBash test native browser title-attribute tooltips?

Only partially, and this is an honest limit. A native `title` attribute tooltip is drawn by the operating system, outside the DOM and the accessibility tree, so there is no `role="tooltip"` element to find and the gray OS bubble cannot be reliably observed. What you can do is confirm the element carries the expected `title` value. If real, observable tooltip behavior matters, switch the component to an ARIA tooltip that renders in the DOM and shows on focus as well as hover, which is both more accessible and fully testable.
