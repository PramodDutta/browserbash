---
title: Testing Rich Text and WYSIWYG Editors With an AI Agent
description: "Test rich text editor flows with an AI agent that types into contenteditable, clicks formatting toolbars by accessible name, and asserts on rendered output."
date: 2026-06-27
category: testing
---

To test a rich text editor with an AI agent, you describe the content and formatting you want in plain English ("type a paragraph, select the first sentence, make it bold, then add a two-item bullet list") and the agent types into the contenteditable region, clicks the toolbar buttons it can see by their accessible names, and reads the rendered result back to confirm it. You never write a selector for a `<div contenteditable>`, never figure out which iframe TinyMCE mounted its body into, and never add a `sleep` to wait for the toolbar to initialize. This guide shows how that works with [BrowserBash](https://browserbash.com/features), where it is reliable across TinyMCE, CKEditor, and Quill, and the honest limits on asserting deep formatting state.

The framing up front: editors are one of the harder things to automate by any method, AI or not. A well-built editor that exposes a real toolbar with labeled buttons and a focusable editing surface is workable for an agent. An editor that paints its own canvas or hides everything behind unlabeled icon buttons is hard for an agent for the same reasons it is hard for a screen reader. The agent is good at the editors built to be operable and honest about the ones that were not.

## Why rich text editors break scripted automation

Most automation tutorials avoid WYSIWYG editors because they are genuinely awful to script. A login form is two inputs and a button. A rich text editor is a small application: an editing surface that is not a normal input, a floating toolbar that mutates the DOM as you select text, content state held in a model the visible HTML only approximates, and frequently an iframe in the middle of it all. Selector-based tests struggle here for predictable reasons.

- **The editing surface is not an input.** You cannot `fill()` a rich text editor like a text box. TinyMCE classically renders its body inside an `<iframe>`, so the editable element lives in a separate document, while CKEditor 5 and Quill use a `contenteditable` `<div>`. Each needs you to focus the right node and dispatch real key events. A script that calls `fill("#editor", ...)` either throws or silently writes nothing.
- **Toolbars are icon soup.** Bold, italic, lists, and headings are usually icon-only buttons. If they carry a proper `aria-label` or `title`, they are findable. If they are bare `<span>`s, a selector has to key on a brittle internal class like `.ql-bold` or `.tox-tbtn--bold`, which changes between major versions.
- **Content state is a model, not the DOM.** The HTML you read back is a serialization of an internal document model, and editors normalize aggressively. Type `<b>` and you might get `<strong>`. Asserting on exact markup couples your test to the editor's serializer, an implementation detail you do not control.
- **Selection is stateful and invisible.** Formatting depends on what is selected, and selection is not in the DOM tree you can match against. To bold "the first sentence" a script has to programmatically set a range, which is fiddly and editor-specific. Paste, undo, and autosave then rewrite the structure again.

None of this is a bug. It is what a real editor does. But every one of these behaviors couples a scripted test to an implementation detail when what you actually care about is the behavior: a user can type content, format it, and the formatted content is saved and rendered.

## How an AI agent drives a contenteditable editor

BrowserBash does not match CSS classes. It finds elements through the accessibility tree, the same structured representation of the page that assistive technology consumes, combined with the DOM. A reasonably built editor is, to that tree, more legible than its tangled markup suggests:

- The editing surface usually exposes a `textbox` role with `aria-multiline="true"`, often with an accessible name like "Rich Text Area".
- Toolbar buttons expose `button` roles with accessible names ("Bold", "Bullet list", "Heading 2") drawn from their `aria-label` or `title`, and a pressed state (`aria-pressed`) when a format is active.
- The toolbar container is frequently grouped as a `toolbar` role, giving the agent a stable place to look for controls.

So when you tell the agent to write and format content, it does roughly what a person relying on a screen reader would do: click into the editing surface to focus it, type the text, select the part to format, then click the toolbar button whose accessible name matches. Because it re-reads the live page after each action, the floating toolbar that appears only after you select text is just there on the next look. There is a deeper explanation of this resolution process in [how BrowserBash finds elements via the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree).

The key shift is the same one that helps with any dynamic component: you describe intent, and the model resolves it against whatever is rendered right now. The default engine, Stagehand, observes the DOM each step and decides the next action from what is on screen at that moment. The alternative builtin engine runs an Anthropic tool-use loop and re-derives the target from a fresh snapshot on every action, never reusing a cached selector across runs. Either way, nothing in your test names a `contenteditable` node, a `.ql-toolbar` class, or an iframe index. The general approach to forms-by-intent carries straight over from [AI form-filling automation](https://browserbash.com/blog/ai-form-filling-automation-guide).

### The iframe and Shadow DOM problem, handled

The single most common reason a TinyMCE test fails is the iframe. The editable body is a separate document, and a Playwright or Selenium script has to explicitly switch frame context before it can type. Forget the frame switch and every interaction misses. BrowserBash handles iframes and Shadow DOM as part of how it resolves elements, so you do not declare a frame. The agent finds the editing surface wherever it actually lives, including inside the iframe TinyMCE creates or the shadow root some component-library editors hide their toolbar in. You describe "the editor body" and the boundary is the agent's problem, not yours.

## Writing an editor test by intent

Here is the simplest case: type into the editor, apply bold, and confirm. As a one-off objective from the command line:

```bash
browserbash run "Go to https://demo.app/compose, click into the rich \
  text editor, type 'Release notes for v2', select that text, click \
  Bold, and confirm the heading renders in bold in the editor"
```

There is no selector anywhere in that. "The rich text editor", "Bold", "the heading" are descriptions a person would use, and the agent resolves them against the page. The final clause is an assertion: the agent reads the rendered content back and the run fails if the text is not bold.

The same flow becomes a committable test as a Markdown `*_test.md` file, which reads like a test plan and survives redesigns because it never mentions markup:

```markdown
# Compose and format a post

1. Go to https://demo.app/compose
2. Click into the rich text editor to focus it
3. Type "Quarterly update" on the first line
4. Select the line "Quarterly update" and apply Heading 2
5. Press Enter and type "Highlights from the team:"
6. Below it, add a bullet list with three items: "Shipped search", "Cut p95 latency", "Onboarded two customers"
7. Confirm the editor shows a Heading 2, a paragraph, and a three-item bullet list
```

Run it with:

```bash
browserbash testmd run ./compose_test.md
```

Step 4 and step 6 describe formatting by name, not by toolbar coordinates. The agent finds the "Heading 2" and "Bullet list" controls by their accessible names and clicks them. You did not tell it the toolbar is in an iframe or that the list button is the seventh icon. It reads what is on the page and matches on meaning.

### Parameterizing content with variables

Real content is rarely a fixed string. Use `{{variables}}` so the body text is decided in your harness, and secret values are masked in logs:

```markdown
# Publish a draft as a known author

1. Go to https://demo.app/editor
2. Click into the editor and type {{body_text}}
3. Select the first sentence and click Bold
4. Click Publish
5. Confirm the published article page shows {{body_text}} with the first sentence in bold
```

```bash
browserbash testmd run ./publish_test.md \
  --var body_text="The launch is live. Here is what changed." \
  --var api_token="{{from-your-secret-store}}"
```

The article body is now data, not hard-coded, and any secret you pass (an auth token, a draft key) is masked in the run log rather than printed. For larger flows that publish many records in a loop, the patterns in [automating data entry in web apps](https://browserbash.com/blog/automate-data-entry-web-apps) apply directly to bulk-publishing content.

## Asserting on formatting and rendered output

This is where you have to be precise about what you assert, because rich text gives you two surfaces to check and they are not equally reliable.

**Assert on rendered, visible state where you can.** The strongest assertion is one a human reviewer could also make by looking: "the heading is bold", "there is a three-item bullet list". The agent reads the rendered editor or the published page through the accessibility tree and the visible content, so "confirm the list has three items" or "confirm the title is a level-2 heading" are checks it can do honestly, because a correctly built editor exposes a `heading` role with a level and a `list` role with `listitem` children.

**Be cautious asserting on exact HTML.** Editors normalize markup. If your assertion says the output must contain `<strong>` but the editor emits `<b>`, the run fails on a serialization detail rather than a real defect. When you need to check stored markup, assert on the meaningful shape ("the saved content contains a bulleted list and one bold run") rather than a byte-exact string, or verify it downstream where your own renderer has normalized it.

**Active-state checks.** A good toolbar marks the active format with `aria-pressed="true"`, so you can write a check like "with the cursor inside the bold text, confirm the Bold button shows as active." If the editor only restyles the button with CSS and never sets `aria-pressed`, the agent cannot tell the button is active, the same blind spot a screen reader has, and that is a real accessibility finding worth filing rather than a tool failure. For volatile floating toolbars that mount and unmount as selection changes, the broader behavior is covered in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

Late-rendering toolbars and editors that initialize asynchronously are handled by Playwright's built-in auto-wait under the hood, with a 15-second ceiling and no manual sleeps. When you click into the page and the editor hydrates a moment later, the agent waits for the surface to be actionable rather than racing it.

## Running editor tests in CI

Once an editor flow is a `*_test.md` file, it drops into a pipeline like any other check. The `--agent` flag emits NDJSON so a runner can consume structured events, and the exit codes are clean: 0 passed, 1 failed, 2 error, 3 timeout.

```bash
browserbash testmd run ./compose_test.md \
  --agent --headless --record
```

`--headless` runs without a visible browser, and `--record` captures a webm video plus screenshots, which matters a lot for editor tests because "the bold did not apply" is far easier to diagnose from a short clip than from a log line. A `Result.md` is written per run. Add `--upload` to opt into the cloud dashboard (free runs are kept 15 days), or run `browserbash dashboard` for a local view. Point at remote browsers with `--provider local|cdp|browserbase|lambdatest|browserstack` to confirm the editor behaves the same across engines, which matters because contenteditable behavior differs subtly between Chromium, Firefox, and WebKit.

Use `@import` to reuse a login flow ahead of the compose check rather than copy-pasting it:

```markdown
# Logged-in author publishes a formatted post

@import ./login_test.md

1. Go to https://demo.app/editor
2. Click into the editor and type {{title}}
3. Select the title and apply Heading 1
4. Add a paragraph and a numbered list of {{steps}}
5. Click Publish and confirm the post renders with the heading and list intact
```

## Honest limits: where this struggles on editors

This section is the point. An intent-based agent is not the right tool for every editor, and pretending otherwise would set you up to be burned.

- **Unlabeled icon toolbars.** If Bold, Italic, and the list buttons are bare icons with no `aria-label`, `title`, or accessible name, there is little for the accessibility tree to expose, and the agent is reduced to guessing from position or visuals. That is far less reliable than matching a named button. The editors that are easy for an agent are the ones that are easy for a screen reader, and an unlabeled toolbar is itself a real accessibility problem worth fixing.
- **Canvas or fully custom editing surfaces.** Some editors (notably some collaborative or design-focused ones) render the editing area on a `<canvas>` or with heavily virtualized DOM that does not expose normal text or roles. There is little structure for the agent to read, and typing and selection become unreliable, for the same reasons they are hard for assistive tech.
- **Precise selection and cursor placement.** "Select the second word of the third paragraph and italicize only it" asks the agent to place a selection with character-level precision. It does coarse selections (a line, a sentence you name, all the text) well, but fine-grained sub-word selection is where it is weakest. If exact boundaries matter, assert on the rendered result, or cover that case with a unit test against the editor's API.
- **Exact markup assertions are brittle, and complex paste or tables are variable.** Editors normalize HTML, so do not assert on byte-exact output unless you control the serializer. Pasting from Word, nested tables, and media embeds invoke the editor's most idiosyncratic code paths; the agent drives the common ones but these are worth recording to confirm what actually happened.
- **It is model-dependent, not fully deterministic.** A selector script clicking a fixed toolbar button is deterministic; an agent reasoning about an editor is not, in the strict sense. The default model resolution is auto: Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist). Small local models (8B and under) get flaky on long editing flows with many formatting steps; a 70B-class local model (Qwen3, Llama 3.3) or a capable hosted model handles them far more reliably. Local means nothing leaves your machine, which is worth it when the draft content is sensitive.

The decision rule is the same as for any widget: the more the editor changes and the more accessible it is, the more an intent-based agent beats selectors. The more static and performance-critical the flow, and the more you need character-exact selection assertions, the more a traditional Playwright or Selenium script (or a unit test against the editor's own API) earns its place. Many teams run both, which is a sensible split. To go deeper on the building blocks, the [learn](https://browserbash.com/learn) section walks through intent-based testing from the start.

## Getting started

The path from zero to a working editor test is short, and a local run needs no account and nothing to configure.

```bash
npm install -g browserbash-cli
browserbash run "Open https://demo.app/compose, click into the rich \
  text editor, type a short paragraph, make the first line a Heading 2, \
  add a two-item bullet list below it, and confirm the editor shows a \
  heading and a list"
```

That drives your local Chrome with a local model and prints a verdict plus structured results, so nothing leaves your machine. From there the progression is natural: turn the throwaway objective into a committable `*_test.md` file, parameterize the body text with `{{variables}}`, compose shared setup with `@import`, and wire `browserbash testmd run --agent` into CI. You end up with an editor test that reads like documentation, types into the right surface even inside an iframe, finds the formatting controls by name, and does not shatter the next time someone bumps the editor to a new major version.

## FAQ

### How do I test a contenteditable editor without writing selectors?

You describe the content and formatting in plain English and let the agent find the surface and controls. With BrowserBash you write an objective like "click into the editor, type this text, select the first line, and apply Heading 2", and the agent resolves the editing surface and the toolbar buttons through the accessibility tree (the `textbox` role for the body, `button` roles with accessible names like "Bold" for the toolbar). You never write a CSS selector for a `contenteditable` div or a toolbar class, so the test keeps working when the editor is re-rendered or upgraded.

### Does it work with TinyMCE, CKEditor, and Quill?

Yes, because it resolves elements by role and accessible name rather than by each editor's internal classes. The main difference between them is structural: TinyMCE classically puts its body inside an iframe, while CKEditor 5 and Quill use a contenteditable div in the main document. BrowserBash handles iframes and Shadow DOM as part of finding elements, so you do not declare a frame for TinyMCE. The one thing that matters across all three is whether the toolbar buttons carry accessible names; well-configured instances do.

### Can it assert that text is actually bold or in a list?

It can assert on rendered, visible state reliably, and you should prefer that. "Confirm the title renders as a bold heading" or "confirm the list has three items" are checks the agent makes by reading the rendered content and roles (`heading`, `list`, `listitem`). Be cautious asserting on exact HTML, because editors normalize markup (a `<b>` may become `<strong>`), so a byte-exact string check can fail on a serialization detail rather than a real bug. Assert on the meaningful shape and the visible result instead.

### What is the hardest editor case for an AI agent?

Three things: unlabeled icon-only toolbars (nothing for the accessibility tree to read), canvas or heavily virtualized editing surfaces (no normal text or roles to find), and character-precise sub-word selection (the agent does coarse selections well but fine ones poorly). For the first two, the difficulty mirrors what a screen reader faces, and an unlabeled toolbar is itself an accessibility bug worth fixing. For precise selection, assert on the rendered result rather than scripting the exact selection, or cover that narrow case with a unit test against the editor's API.

Ready to test your hardest editor without a single selector? Install with `npm install -g browserbash-cli` and point it at a compose or publish flow. BrowserBash is free and open-source (Apache-2.0), so a local run costs nothing and never leaves your machine.
