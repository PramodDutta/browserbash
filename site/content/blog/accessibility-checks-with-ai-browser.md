---
title: Accessibility checks with an AI browser
description: "AI accessibility checks for keyboard navigation and ARIA landmarks, run in real Chrome with plain-English objectives instead of brittle selectors."
date: 2026-05-29
category: use-case
---

Most teams that "do accessibility" run axe-core in CI, see a green check, and move on. Then a keyboard-only user files a ticket because they tabbed past the checkout button into a modal they could not escape. That is the gap AI accessibility checks are built to close: the behavioral layer that a static rule engine cannot reach. A scanner can confirm a button has an accessible name. It cannot confirm you can actually reach that button with the Tab key, that focus lands somewhere sensible after you press Enter, or that the page is carved into landmarks a screen-reader user can jump between. Those are things you have to *do* to a real browser, and that is exactly where an AI agent driving real Chrome starts to earn its place next to your existing tooling.

This article is narrow on purpose. I am not going to rehash the whole WCAG 2.2 surface. I want to go deep on two checks that rule scanners structurally miss and that humans waste hours doing by hand: keyboard navigation and ARIA landmark structure. By the end you will know what each check actually proves, where an AI agent helps versus where it does not, and how to wire both with [BrowserBash](https://browserbash.com/features) so they run on your laptop for free and in CI without a brittle selector in sight.

## Why keyboard and landmark checks resist automation

Static analyzers like axe-core, Pa11y, and Lighthouse parse the rendered DOM and the accessibility tree, then apply deterministic rules. Is there an `alt` attribute? Does this input have an associated label? Is the contrast ratio at least 4.5:1? These are genuine WCAG success criteria, and a rule engine checks them fast, consistently, and for almost nothing. If you are not already running axe in CI, stop reading and go add it first. Nothing here replaces it.

But the accessibility community has repeated the same number for years: automated rule scanners catch somewhere between a third and a half of WCAG issues, depending heavily on the page. Treat any precise percentage with suspicion. The direction is not in dispute. A large slice of real failures are simply not expressible as a DOM rule.

Keyboard navigation is the cleanest example. WCAG 2.1.1 (Keyboard) and 2.1.2 (No Keyboard Trap) are about *operation*, not markup. A `<div role="button">` passes the "has a role" rule and still does nothing when you press Enter. A modal can have a perfect `aria-modal="true"` attribute and still trap your focus because nobody wired up the Escape key. A scanner sees the attributes and shrugs. You only catch the trap by pressing Tab, Tab, Tab and watching where the focus ring goes.

WCAG 2.2 added a criterion that drives this home. Success criterion 2.4.11, Focus Not Obscured (Minimum), is widely described as the only 2.2 criterion that can be fully automated, precisely because the rest of the focus-related rules need behavior. A focus ring can be perfectly styled (2.4.7) and still get hidden behind a sticky header or a cookie banner the moment you tab to it. Proving that requires moving focus and looking at the viewport.

Landmarks are the other half of this story. ARIA landmark roles — `banner`, `navigation`, `main`, `complementary`, `contentinfo`, `search` — and their HTML5 equivalents (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`) let a screen-reader user jump straight to a region instead of tabbing through 40 nav links to reach content. A scanner can tell you whether a landmark exists and whether it is labeled. It cannot tell you whether the *structure* is coherent: one `main`, no orphaned content outside any region, navigation that is actually marked as navigation rather than a bare `<div>`. That is a judgement about the whole page, and judgement is what an AI agent brings.

## What an AI browser actually does for these checks

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, write a plain-English objective, and an AI agent drives a real Chrome browser step by step — no selectors, no page objects, no `await page.locator(...)`. It returns a pass/fail verdict plus structured values it extracted along the way.

The reason that model fits accessibility work is that accessibility checks are described in behavioral language to begin with. "Tab through the page and confirm every interactive element is reachable and shows a visible focus indicator" is already a test specification. You do not need to translate it into 30 lines of `page.keyboard.press('Tab')` followed by fragile assertions about `document.activeElement`. You hand the sentence to the agent and it performs the steps, observing the page between each one.

A worked keyboard check looks like this:

```bash
browserbash run "Go to https://app.example.com/checkout. Using only the Tab and Shift+Tab keys, move through every interactive element on the page in order. For each element, confirm it has a visible focus indicator. Report any element that cannot be reached by keyboard, any focus order that jumps around illogically, and whether pressing Tab ever gets stuck in a loop you cannot escape (a keyboard trap)."
```

The agent navigates, presses Tab, reads the page state after each press, and reasons about whether the focus order is sane and whether anything is unreachable. It is doing what a manual tester does with their hands on the keyboard, except it writes down what it found in a structured verdict you can diff over time.

For landmarks, the objective describes the structure you expect:

```bash
browserbash run "Open https://app.example.com. Inspect the page's landmark structure. Confirm there is exactly one main landmark, a navigation landmark for the primary nav, a banner for the header, and a contentinfo for the footer. Report any content that sits outside every landmark, any duplicate landmarks of the same type that lack distinguishing labels, and whether a screen-reader user could navigate the page by region."
```

A worthwhile honesty note before you copy these. The agent is reasoning about the page, not running a formal WCAG conformance engine. It will not give you a legally defensible audit. What it gives you is fast, repeatable behavioral coverage that catches the class of bugs axe never sees — and it does that in language your whole team can read and edit.

## Keyboard navigation: the checks worth automating

Not every keyboard check is equally valuable to automate. Here is how I prioritize them, roughly in order of how often they break in production.

### Reachability and focus order

The first and most common failure: an interactive element you cannot reach with the keyboard at all, usually a custom dropdown or a clickable `<div>` that never got `tabindex="0"`. The second: focus order that does not match the visual order, so a sighted keyboard user tabs from the email field to the footer and back up to the password field. Both are behavioral. Ask the agent to tab through and narrate the order it lands in, then compare that against the order a sighted user would expect.

### Keyboard traps

WCAG 2.1.2 is unambiguous: if keyboard focus can move *into* a component, it must be able to move *out* using only the keyboard. Modals are the classic offender. The dialog opens, focus moves inside, and Tab cycles forever because nobody scoped the focus trap to also honor Escape and a close button. An agent can open the modal, attempt to tab out, attempt Escape, and report whether it escaped — a check that is genuinely tedious to do by hand on every dialog in your app.

### Visible focus and Focus Not Obscured

WCAG 2.4.7 wants a visible focus indicator; WCAG 2.4.11 (new in 2.2) wants that indicator not to be hidden behind sticky headers, cookie banners, or chat widgets when you tab to an element low on the page. The agent can tab to elements that sit under a sticky header and report whether the focus ring is still at least partially visible. This is one of the few places where behavioral testing and the "only fully automatable 2.2 criterion" overlap nicely.

### Activation and post-action focus

Pressing Enter or Space on a control should do something, and focus should land somewhere sensible afterward — not vanish to the top of the document. After you submit a form with errors, focus should move to the first error or to a summary, not stay on a now-disabled button. Describe the expected post-action focus in your objective and let the agent verify it.

If you want a deeper tour of how agents reason about these versus a pure rule engine, the broader [BrowserBash tutorials](https://browserbash.com/tutorials) and the [learn hub](https://browserbash.com/learn) cover the act/observe loop in more detail.

## Landmark and region checks worth automating

Landmarks are quieter than keyboard bugs — nothing visibly breaks — but they are the difference between a screen-reader user reaching your content in two keystrokes versus forty. The checks I automate:

- **Exactly one `main`.** Multiple `main` landmarks (or zero) confuse assistive tech. The agent confirms there is precisely one and that the primary content lives inside it.
- **No orphaned content.** Every meaningful block of content should sit inside *some* landmark. Content floating outside all regions is invisible to region-based navigation. The agent reports anything stranded.
- **Distinguishable duplicate landmarks.** Two `navigation` landmarks are fine — a primary nav and a footer nav — but only if each has an `aria-label` so a screen reader can tell them apart. The agent flags duplicates that share a role and lack labels.
- **Semantic nav, not div soup.** A row of links wrapped in a bare `<div>` is not a landmark. The agent can tell you whether your "navigation" is actually marked up as navigation.
- **Heading structure that mirrors the regions.** Landmarks and headings work together. A logical `h1` → `h2` → `h3` outline that matches the page's regions is what lets users build a mental map. The agent can read the heading outline and report skipped levels.

None of these are caught reliably by attribute rules alone, because the failure is about the relationship between regions, not the presence of one attribute. This is the same reasoning gap that makes AI accessibility checks useful: the agent looks at the whole page and judges coherence.

## AI agent versus rule scanner versus manual audit

Be honest with yourself about what each tool is for. They are layers, not competitors.

| Capability | Rule scanner (axe, Pa11y) | AI browser (BrowserBash) | Manual AT audit |
| --- | --- | --- | --- |
| Missing `alt`, missing labels, contrast | Excellent, deterministic | Possible but overkill | Slow, error-prone |
| Keyboard reachability and focus order | Cannot judge | Strong | Gold standard |
| Keyboard traps (2.1.2) | Cannot judge | Strong | Gold standard |
| Landmark structure coherence | Partial (presence only) | Strong | Gold standard |
| Focus Not Obscured (2.4.11) | Automatable | Good | Reliable |
| Meaningful `alt` text quality | Cannot judge | Good | Gold standard |
| Legal conformance sign-off | No | No | Yes |
| Cost per run | Near zero | $0 on local models | High (human time) |
| Runs unattended in CI | Yes | Yes | No |

The pattern that works: axe-core catches the high-volume, deterministic violations on every commit. An AI browser covers the behavioral middle — keyboard flows and landmark coherence — on your critical paths, also on every commit. A human assistive-technology user audits before major releases and signs off on conformance. The AI layer does not replace the human; it stops the human from spending their scarce time re-discovering the same Tab-key regression you introduced last sprint.

Where is the rule scanner simply better? Anything deterministic and high-frequency. Contrast, missing alt, duplicate IDs, invalid ARIA attribute values — run those in axe and do not pay an LLM to reason about them. Where is the human strictly better? Conformance sign-off, nuanced screen-reader experience, and anything you will defend in an accessibility complaint. The AI browser lives squarely in between.

## The local-first, zero-cost model story

The detail that makes this practical for accessibility teams is that BrowserBash is Ollama-first. The default model is `auto`, which resolves in a clear order: if you have a local Ollama running, it uses `ollama/<model>` — free, no API keys, and nothing leaves your machine; otherwise it falls back to an `ANTHROPIC_API_KEY` (`claude-opus-4-8`), then an `OPENAI_API_KEY` (`openai/gpt-4.1`), and if none are set it errors with guidance instead of failing silently.

For accessibility work that often runs against staging environments and internal tools, "nothing leaves your machine" is not a nicety — it is sometimes a hard requirement. On a local model your model bill is a guaranteed $0, and your unreleased UI never touches a third-party API.

The honest caveat: very small local models (8B and under) get flaky on long, multi-step objectives, and a full keyboard sweep of a busy page *is* a long objective. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If you try to run a 40-element Tab sweep on a 7B model, expect it to lose the thread. Pin a stronger model when the flow is hard:

```bash
browserbash run "Tab through every field in the registration form at https://staging.example.com/signup, confirm focus order matches visual order, and verify focus moves to the first error after an invalid submit." --model ollama/qwen3 --record
```

The `--record` flag captures a screenshot and a `.webm` session video (via bundled ffmpeg), which is genuinely useful for accessibility evidence — you get a clip of the focus ring moving through the page that you can attach to a ticket or a compliance log. With the builtin engine you also get a Playwright trace.

You can pick the interpreter engine too. The default `stagehand` engine (MIT, by Browserbase) gives you act/extract/observe/agent primitives with self-healing; the `builtin` engine runs an in-repo Anthropic tool-use loop over Playwright. Switch with `--engine stagehand` or `--engine builtin`. For most accessibility checks the default is fine.

## Putting checks in CI without a flaky selector in sight

A one-off `run` is good for exploring. For a real accessibility gate you want checks committed to the repo and runnable on every push. BrowserBash has markdown tests for exactly this. You write a `*_test.md` file where each list item is a step, use `{{variables}}` for environment-specific values, and `@import` to compose shared setup. It writes a human-readable `Result.md` after each run.

A keyboard-and-landmark test file might read:

```bash
browserbash testmd run ./a11y_keyboard_test.md
```

Inside that file, steps are plain English: navigate to the page, tab through the interactive elements, confirm focus order, open the cart modal, attempt to escape it with the keyboard, and assert the landmark structure. Because the steps are English and committed to git, a non-engineer on your accessibility team can read and edit them — which is usually who owns these checks anyway.

For wiring into a pipeline, run with `--agent`. That switches output to NDJSON: one JSON object per line, with `step` progress events and a terminal `run_end` object carrying `status` and a `final_state`. Exit codes are unambiguous — 0 passed, 1 failed, 2 error, 3 timeout — so your CI step fails the build on a regression without any prose parsing. This is the part that turns a manual ritual into a gate.

```bash
browserbash run "Tab through https://app.example.com/checkout and report any keyboard trap or unreachable control." --agent --timeout 180
```

Every run is also kept on-disk at `~/.browserbash/runs` (secrets masked, capped at 200 entries), so you have a local history even without any cloud setup. If you want a visual view, `browserbash dashboard` opens a fully local dashboard at localhost:4477 — no account, nothing uploaded. There is an optional cloud dashboard too: `browserbash connect --key bb_...` links it, then `--upload` pushes a specific run (opt-in per run; without `--upload`, nothing leaves your machine; free cloud runs are kept 15 days). For accessibility work against internal staging, I usually leave everything local.

## A realistic workflow for an accessibility sprint

Here is how I would actually sequence this on a real team, rather than in a demo.

Start with axe-core in CI on every commit. That is your deterministic floor. Then add a small set of BrowserBash markdown tests covering your three or four most critical flows — sign-up, login, checkout, and your primary dashboard — focused specifically on keyboard reachability, traps, and landmark structure, since those are the behavioral bugs axe misses. Run them locally on a mid-size Ollama model so the cost stays at zero and the staging UI never leaves your network.

Wire those markdown tests into CI with `--agent` so a new keyboard trap fails the build. Keep `--record` on for the checkout flow specifically, because that is the one where you will want video evidence when someone disputes whether the bug is real. Reserve human assistive-technology testing for pre-release sign-off and anything legally sensitive — the AI layer means your human tester walks in to a UI that has already had the obvious Tab-key regressions filtered out, so they spend their hour on nuance instead of re-finding the same broken modal.

The teams who get the most out of this treat the AI browser as the layer that *enforces what they already learned*. Every time a manual audit finds a keyboard trap, you add a one-sentence markdown step that would have caught it. Over a few sprints you accumulate a behavioral accessibility suite that runs in minutes, costs nothing, and reads like English. If you want to compare that approach against other tools before committing, the [BrowserBash comparison and case-study material](https://browserbash.com/case-study) and the [pricing page](https://browserbash.com/pricing) lay out where it fits and where it does not.

## Where this approach falls short

I would be doing you a disservice to pretend the AI layer is a clean win everywhere. Three honest limits.

First, it is non-deterministic. An LLM agent can describe the same page slightly differently across runs, and on a borderline focus-order question it might call it a pass one day and a warning the next. For deterministic facts — does this image have alt text — that variability is a downgrade from a rule engine, which is exactly why you keep axe doing the deterministic work.

Second, it is not a conformance audit. The agent reasons about WCAG concepts; it does not run the formal test procedures that an accessibility specialist follows for a VPAT or a legal sign-off. Use it to *find and prevent* bugs, not to *certify* compliance.

Third, it cannot fully replicate the lived screen-reader experience. It can reason about landmarks and announce-ability, but the actual texture of NVDA or VoiceOver reading your page — the verbosity, the pacing, the small annoyances — is something only a real assistive-technology user feels. The AI browser shrinks the surface a human needs to cover; it does not erase it.

Hold those three caveats and the value is clear: AI accessibility checks give you cheap, repeatable, behavioral coverage of the keyboard and landmark bugs that rule scanners miss and humans are too expensive to re-check on every commit. That is a real slot in the testing stack, not a replacement for anything in it.

## FAQ

### Can AI accessibility checks replace axe-core?

No, and you should not try. Axe-core is a deterministic rule engine that catches high-volume violations like missing alt text, missing labels, and contrast failures perfectly and for almost nothing. AI accessibility checks cover the behavioral layer axe cannot reach — keyboard reachability, traps, and landmark coherence. Run both: axe as your deterministic floor, an AI browser for behavior.

### How do you test keyboard navigation with an AI browser?

You write a plain-English objective describing the keyboard flow, such as tabbing through every interactive element and confirming focus order and visible focus indicators, then BrowserBash drives a real Chrome browser to perform those keystrokes and report what it found. The agent presses Tab and Shift+Tab, reads the page state after each press, and flags unreachable controls or keyboard traps. No selectors or scripted key presses are required.

### Does this work for ARIA landmark and region checks?

Yes. You describe the landmark structure you expect — one main, labeled navigation, a banner header, a contentinfo footer — and the agent inspects the page and reports orphaned content, duplicate unlabeled landmarks, and whether a screen-reader user could navigate by region. This is structural reasoning that attribute-only rules miss, since the failure is about how regions relate rather than the presence of a single attribute.

### Is an AI accessibility check enough for legal WCAG compliance?

No. The agent reasons about WCAG concepts but does not run the formal conformance procedures an accessibility specialist follows for a VPAT or legal sign-off, and it cannot fully replicate a real screen-reader user's experience. Use AI accessibility checks to find and prevent bugs cheaply on every commit, then keep a human assistive-technology audit for release sign-off and anything legally sensitive.

Ready to add behavioral accessibility coverage that runs locally for free? Install with `npm install -g browserbash-cli` and start with a single keyboard sweep. An account is optional — everything runs on your machine — but if you want the cloud dashboard you can [sign up here](https://browserbash.com/sign-up).
