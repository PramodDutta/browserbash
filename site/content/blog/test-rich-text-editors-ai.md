---
title: Test Rich-Text Editors (TipTap, Quill) With Plain-English Tests
description: "A practical guide to test rich text editor automation with plain-English AI tests for TipTap, Quill, and any contenteditable editor."
date: 2026-07-09
category: guide
---

Rich-text editors are where selector-based automation goes to die. If you have ever tried to write a Playwright or Cypress spec that clicks the Bold button, types a heading, drops in a code block, and then asserts that the saved HTML actually carries `<strong>` and `<h2>` tags, you already know the pain. This guide covers test rich text editor automation using plain-English tests that describe what a user does, not which DOM node to poke. The tools change (TipTap, Quill, Slate, ProseMirror, Lexical, CKEditor), but the testing problem stays the same: a `contenteditable` element with no stable structure, a floating toolbar, and output HTML that varies subtly between versions. BrowserBash lets an AI agent drive a real Chrome browser from an English objective, which turns out to be a much better fit for editors than brittle CSS locators.

## Why rich-text editors break traditional selectors

A `contenteditable` div is not a form field. It is a live DOM tree that the editor library rewrites on every keystroke. TipTap (built on ProseMirror) and Quill both maintain an internal document model and re-render the DOM to match it, which means the node you selected two lines ago may no longer exist. That single fact wrecks most of the assumptions selector-based tests rely on.

Here is what actually goes wrong when you point a classic framework at an editor:

- **Toolbar buttons have no stable identity.** TipTap's bold button might be a `<button>` with a dynamic class, an SVG icon with no label, or a menu item three layers deep in a bubble menu that only appears on selection. Quill uses `ql-bold` classes, but those are theme-specific and change if you swap the Snow theme for Bubble.
- **The cursor is invisible to the DOM.** Formatting applies to a selection range, not an element. To bold a word you must select that exact word first, and selection ranges are notoriously hard to script reliably.
- **Output HTML is not deterministic across versions.** Bold text may serialize as `<strong>`, `<b>`, or a `mark` node depending on the editor's schema. A test that greps for `<b>` passes today and fails after a minor upgrade.
- **Paste, drag, and slash-commands bypass the toolbar entirely.** Modern editors let you type `/heading` or paste Markdown. None of that maps cleanly to a `click()` call.

The result is a test file full of `page.locator('.ProseMirror').press('Control+b')` incantations that break the moment the editor library ships a patch. You end up maintaining the test more than the feature.

## The plain-English approach to editor testing

BrowserBash flips the model. Instead of naming DOM nodes, you write an objective in English and an AI agent figures out how to accomplish it against the live page. For rich-text editors this matters because intent survives a redesign that selectors do not. "Make the word Roadmap bold" means the same thing whether the editor is TipTap 2, TipTap 3, or a Quill rewrite. The agent snapshots the accessibility tree, decides how to select the word and apply formatting, and reports a verdict.

It is free and open source (Apache-2.0), installs in one line, and defaults to local Ollama models so nothing leaves your machine unless you point it at a hosted model. You can read the fuller philosophy on the [BrowserBash learn pages](https://browserbash.com/learn), but the short version is: you describe the outcome, an agent drives real Chrome, and you get a deterministic pass or fail back.

```bash
npm install -g browserbash-cli

browserbash run "Open the TipTap demo at https://tiptap.dev/product/editor. Type 'Release notes' on the first line, select that text, and make it a Heading 1. Then verify the heading shows large bold text." --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, so you can pipe the run into CI or an AI coding agent without parsing prose. Exit codes are frozen and simple: 0 passed, 1 failed, 2 error, 3 timeout. That contract is what makes editor tests usable in a pipeline instead of a demo.

### What "by intent" buys you

When you test by intent, you stop encoding the editor's implementation details into your suite. Consider a single formatting assertion. A selector test needs to know the toolbar markup, the keyboard shortcut, and the output tag. An intent test needs one sentence: "the word Roadmap should appear bold." If TipTap changes its bold button from a `<button>` to a menu item, the selector test breaks and the intent test does not. You are testing the user-visible behavior, which is the thing you actually care about.

## Typing and formatting content in contenteditable editors

The core loop for editor testing is: place the cursor, type content, apply a format, and confirm the format stuck. BrowserBash handles all four steps from plain English because the agent can see the rendered page the way a user does.

A few patterns that come up constantly with TipTap and Quill:

- **Typing structured content.** "Type a paragraph, press Enter, then type a bulleted list with three items: Draft, Review, Publish." The agent types into the focused editor and uses Enter and list toggles as a person would.
- **Applying inline marks.** "Select the phrase 'ship it' and make it italic and bold." Selection plus two marks, described once.
- **Block-level transforms.** "Turn the current line into a code block and paste `const x = 1` into it." Code blocks are a classic selector nightmare because the editor wraps them in nested `<pre><code>` nodes.
- **Slash commands and menus.** "Type '/' to open the command menu, choose 'Heading 2', and type 'Background'." The agent reads the popup menu from the accessibility snapshot and picks the right item.

Because the agent works from a snapshot of the real page, it adapts to whichever editor you throw at it. The same phrasing works against a TipTap playground, a Quill demo, or your own app's editor behind a login. That portability is the whole point of test rich text editor automation done by intent: one objective, many editors.

### Handling the login wall in front of your editor

Most real editors live behind authentication, a docs app, a CMS, a comment box. Re-logging in for every editor test is a tax you should not pay. Save the session once and reuse it:

```bash
browserbash auth save cms --url https://app.example.com/login

browserbash run "Open https://app.example.com/documents/new, type 'Weekly Update' as an H1, add a bulleted list of three items, and verify all three list items are visible." --auth cms --agent
```

`browserbash auth save` opens a browser, you log in by hand once, press Enter, and it stores the Playwright storageState. Every later run with `--auth cms` reuses that session. If the saved profile does not cover the start URL's origin, BrowserBash prints a warning instead of silently doing nothing, which saves you from the classic "why is my test on the login page" confusion.

## Asserting formatted content deterministically

Driving the editor is half the job. The other half is proving the content came out right, and this is where a lot of AI-testing tools get vague. BrowserBash separates two kinds of checks so you always know which one you got.

By default, a plain-English "verify" is agent-judged: the model looks at the page and decides if the claim holds. That is flexible but subjective. For anything you gate a merge on, you want deterministic assertions instead. BrowserBash's `Verify` steps compile to real Playwright checks with no LLM judgment involved: URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and stored-value equality. A pass means the condition actually held. A fail comes back with expected-versus-actual evidence in the `run_end.assertions` block and in the human-readable Result.md assertion table.

For an editor, deterministic assertions map naturally onto rendered output:

- "Verify heading 'Release notes' is visible" confirms the H1 transform applied.
- "Verify text 'Draft' is visible" confirms a list item rendered.
- Element counts confirm the list has exactly three items, not two or four.

Any Verify line that falls outside the deterministic grammar still runs, but agent-judged and flagged `judged: true` in the output, so you can always tell a compiled assertion from a model opinion. That honesty about which checks are deterministic is a real differentiator; you never have to guess whether a green result was measured or estimated. The [features overview](https://browserbash.com/features) lays out the full assertion grammar if you want the exact list.

## A committable testmd file for a TipTap editor

Ad-hoc `run` commands are great for exploration. For a suite you commit to the repo, use a `*_test.md` file. These are plain Markdown with a title, numbered or bulleted steps, `@import` composition, and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, and each run writes a human-readable Result.md.

testmd v2 is where editor testing gets powerful. Add `version: 2` to the frontmatter and steps execute one at a time against a single browser session. You get two deterministic step types that never touch a model: API steps for seeding data, and Verify steps for checking it through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page.

Here is a realistic editor test that seeds a document over the API, opens it in the UI, formats content, and asserts the result:

```bash
cat > editor_test.md <<'EOF'
---
version: 2
auth: cms
---
# TipTap heading and list formatting

1. POST https://app.example.com/api/docs with body { "title": "Draft doc" }
2. Expect status 201, store $.id as 'docId'
3. Open https://app.example.com/docs/{{docId}}/edit
4. Type 'Release notes' on the first line and make it a Heading 1
5. Press Enter and type a bulleted list with items: Draft, Review, Publish
6. Verify heading 'Release notes' is visible
7. Verify text 'Draft' is visible
8. Verify text 'Publish' is visible
EOF

browserbash testmd run ./editor_test.md
```

Steps 1 and 2 are deterministic API calls that create the document and capture its ID with no model involvement. Steps 4 and 5 are agent-driven formatting against the live editor. Steps 6 through 8 are deterministic Verify checks that compile to Playwright assertions. You get seeding, driving, and asserting in one committable file. A note on honesty: testmd v2 currently drives the builtin engine, which needs an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run on Ollama or OpenRouter directly, so plan your editor v2 suites around a hosted or gateway model.

## TipTap versus Quill: does the editor library change your tests?

One of the quieter benefits of intent-based testing is that the same objective phrasing works across editor libraries. The differences between TipTap and Quill matter enormously to a selector-based test and almost not at all to a plain-English one. Here is how the two common editors stack up from a testing standpoint.

| Concern | TipTap (ProseMirror) | Quill | Selector test impact | Plain-English test impact |
| --- | --- | --- | --- | --- |
| Toolbar markup | Custom, app-defined, often headless | `ql-*` classes, theme-specific | High: locators differ per app and theme | None: agent reads the rendered toolbar |
| Bold serialization | `<strong>` or `mark` node | `<strong>` | Medium: output tag varies | None: assert visible bold text, not the tag |
| Lists | ProseMirror list nodes | Quill `<ol>`/`<ul>` deltas | Medium: nesting differs | None: assert item text and count |
| Slash / command menu | Common in TipTap apps | Rare | High: popup markup is bespoke | Low: agent reads the menu |
| Code blocks | `<pre><code>` with language | `<pre>` block | High: nested nodes | None: assert code text visible |

The honest read: if your app pins one editor version forever and you have a stable, well-labeled toolbar, a hand-written Playwright test can be faster and cheaper than an AI agent. Selector tests have zero model cost and millisecond execution. Where BrowserBash wins is durability across editor upgrades, coverage of paste and slash-command flows that are painful to script, and the fact that a QA engineer who does not know the DOM can write and read the tests. The [tutorials](https://browserbash.com/tutorials) walk through both styles on real pages.

### When a hand-written selector test is still the better call

Be balanced here. Reach for a classic Playwright spec instead of BrowserBash when: you are testing a single stable editor with a labeled toolbar, you need sub-second execution on thousands of runs, or you are asserting exact serialized HTML byte-for-byte (a schema-conformance test where the specific tag matters). Intent-based testing shines on behavior and durability, not on byte-exact output. Use the right tool for the assertion you actually care about.

## Keeping editor tests green over time

Editors get patched constantly, which means an editor test suite that passes today can rot fast. Two features make an always-on editor suite practical.

**The replay cache** records the agent's actions on a green run, then replays them on the next identical run with zero model calls. The agent only steps back in when the page actually changed. For editor tests this is a big deal: the expensive part (the model deciding how to select and format text) happens once, and every subsequent run is nearly free until the editor's UI shifts. That is what makes a monitor economical.

**Monitor mode** runs a test or objective on an interval and alerts only when the pass or fail state flips, in either direction, never on every green run:

```bash
browserbash monitor ./editor_test.md --every 30m --notify https://hooks.slack.com/services/XXX/YYY/ZZZ
```

Point that at your production editor and you get a synthetic check that pings Slack the moment formatting breaks after a deploy, and stays quiet the rest of the time. Slack incoming-webhook URLs get Slack formatting automatically; other URLs get the raw JSON payload. Because the replay cache carries the run, an always-on editor monitor is nearly token-free. If you want to see how teams wire this into a real workflow, the [case studies](https://browserbash.com/case-study) show monitors in production.

### Running the editor suite in CI across viewports

Editors behave differently on a phone than on a desktop. A bubble menu that appears on hover may need a long-press on mobile, and toolbar overflow changes at narrow widths. Run your editor suite across viewports and shard it across CI machines in one command:

```bash
browserbash run-all ./tests --matrix-viewport 1280x720,390x844 --shard 2/4 --budget-usd 2.00 --junit out/junit.xml
```

`--matrix-viewport` runs every editor test once per viewport, labeled in events, JUnit, and results, so a mobile toolbar regression cannot hide. `--shard 2/4` runs a deterministic slice computed on sorted discovery order, so four parallel CI machines agree on the split without any coordination. `--budget-usd 2.00` stops launching new tests once the suite crosses the budget: remaining tests report `skipped`, the suite exits 2, and the spend lands in RunAll-Result.md and the JUnit properties. That last one matters for AI-driven suites where a runaway editor test could otherwise burn tokens on a stuck page.

## Wiring editor tests into your AI agent stack

If you build with AI coding agents, BrowserBash doubles as their validation layer. The MCP server exposes the CLI over the Model Context Protocol on stdio, so Claude Code, Cursor, Windsurf, Codex, or Zed can call it as a native tool. One line adds it:

```bash
claude mcp add browserbash -- browserbash mcp
```

That gives the agent three tools: `run_objective` for a single objective, `run_test_file` for a `*_test.md` file, and `run_suite` for a folder run in parallel. Each returns structured verdict JSON (status, summary, final_state, assertions, cost_usd, duration_ms). The key design point: a failed editor test is a successful validation. The tool call succeeds and hands the agent a fail verdict to act on, so your coding agent can implement a TipTap feature, ask BrowserBash to verify the bold-and-list flow, read the evidence, and fix its own regression before you see it. BrowserBash is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, and the full source lives on [GitHub](https://github.com/PramodDutta/browserbash) if you want to inspect exactly what the agent runs.

For teams migrating an existing editor suite, `browserbash import` converts Playwright specs to plain-English test files heuristically, with no model and fully reproducible. It translates `goto`, `click`, `fill`, `press`, `check`, `selectOption`, `getBy*` locators, and common expects; `process.env.X` becomes a `{{X}}` variable; and anything untranslatable lands in an IMPORT-REPORT.md rather than being dropped or silently invented. It will not perfectly translate a gnarly `contenteditable` selection sequence, but it gets the navigation and setup scaffolding off your plate so you can rewrite just the formatting steps by intent.

## A pragmatic workflow for editor coverage

Putting it together, here is a workflow that has held up well for teams testing rich-text features:

1. **Record the happy path once.** Run `browserbash record` against your editor, click through a real formatting flow, and Ctrl-C writes a plain-English test. Password fields never leave the page: the capture sends only a secret marker and the generated step reads `Type {{password}} into ...`.
2. **Harden the assertions.** Convert the important checks to deterministic `Verify` steps so a merge gate depends on measured conditions, not model opinions.
3. **Seed with API steps.** For editors that need a document to exist first, use testmd v2 API steps to create it deterministically instead of clicking through your app's new-document flow.
4. **Save the login.** One `browserbash auth save` kills the re-login tax for the whole suite.
5. **Run across viewports in CI.** Shard the suite, cap the budget, and matrix the viewports so mobile toolbar regressions surface.
6. **Monitor production.** Point a monitor at the live editor on an interval and let the replay cache keep it nearly free.

None of these steps require you to name a single DOM node inside the editor. That is the entire pitch of test rich text editor automation by intent: you describe formatting the way a writer thinks about it, and the agent handles the ProseMirror internals. For a broader map of where BrowserBash fits, the [blog](https://browserbash.com/blog) has comparisons and deeper dives.

## FAQ

### How do you automate testing for a contenteditable rich-text editor?

Point an AI-driven tool like BrowserBash at the live page and describe the formatting in plain English, such as "select the heading and make it bold." The agent snapshots the rendered editor, applies the selection and format the way a user would, and returns a verdict. This avoids the brittle CSS locators that break every time the editor library re-renders its DOM, which is the main reason contenteditable editors are hard to test with traditional selector-based frameworks.

### Can BrowserBash test both TipTap and Quill with the same tests?

Yes, because the tests describe intent rather than implementation. An objective like "make the first line a Heading 1 and add a three-item bulleted list" means the same thing to a TipTap editor and a Quill editor, so the agent adapts to whichever toolbar and DOM structure it finds. Selector-based tests would need separate locators for each library, but a plain-English objective is portable across editors and even across editor version upgrades.

### How do you assert that formatting was applied correctly?

Use deterministic Verify steps, which compile to real Playwright checks with no model judgment, for example verifying a named heading is visible or that a list has an exact number of visible items. A pass means the condition actually held, and a fail returns expected-versus-actual evidence in the run_end assertions block and the Result.md table. Any verify that falls outside the deterministic grammar still runs but is agent-judged and flagged so you can tell a measured check from a model opinion.

### Does testing rich-text editors with AI cost money on every run?

Not after the first green run. The replay cache records the agent's actions and replays them with zero model calls on the next identical run, so the expensive model reasoning happens once and later runs are nearly free until the editor UI changes. BrowserBash also defaults to free local Ollama models, and suite runs can enforce a hard budget cap so an AI-driven editor suite never surprises you with runaway token spend.

Ready to stop maintaining editor selectors? Install with `npm install -g browserbash-cli`, point it at your TipTap or Quill editor, and write your first formatting test in one English sentence. An account is optional, but you can grab one at [browserbash.com/sign-up](https://browserbash.com/sign-up) to sync runs to the free dashboard.
