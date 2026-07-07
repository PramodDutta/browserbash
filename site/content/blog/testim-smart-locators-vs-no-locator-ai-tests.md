---
title: Testim Smart Locators vs No-Locator AI Tests
description: "Testim ranks multiple locators to survive DOM change; an agent finds elements from the accessibility tree with none to store. Compare resilience."
date: 2026-07-05
category: comparison
---

Picture a shipments console at a mid-size logistics SaaS. A Testim flow recorded months ago clicks the cancel icon on the row for shipment SH-88421, confirms in a modal, and checks that the status badge flips to "Cancelled." The icon carries no visible text and no `id`, so Testim's recorder built its locator from whatever else it could find: a class name, the icon's position among its siblings, and the DOM structure of the row wrapping it.

Then a normal sprint lands. The frontend team swaps hand-rolled buttons for a design-system `IconButton` (a new hashed class, an extra wrapper `span` for a tooltip library), and product adds a "Carrier" column between "Status" and the action icons, shifting every row's action cell one slot right. Nothing about the feature changed, but three attributes Testim's locator depends on moved in the same release: class, DOM structure, and sibling position. A plain single-attribute CSS selector cannot survive that, and it sits close to the edge of what Testim's own multi-attribute "smart" locator can survive too. This article covers how that locator technology actually works, where its redundancy earns its keep, where several attributes moving at once still causes trouble, and what changes when a test stores no locator at all and instead reads the page fresh on every run.

## How Testim Smart Locators actually work

Testim, now part of Tricentis, built its reputation on this specific feature. When you record a step in its visual editor, the underlying algorithm walks the DOM from the page root down to the clicked element and collects candidate attributes not just from that element but from its chain of parents too: `id`, `name`, CSS classes, visible text, ARIA attributes, and structural position among siblings.

Each captured attribute gets a confidence weight based on how likely it is to stay stable, unique human-readable text scores higher than a build-generated class hash, for example, and Testim's editor shows this as a star rating next to each attribute. All of it becomes one composite fingerprint. At runtime, the matching engine scores every plausible live candidate against that fingerprint using the same weights and picks whichever scores highest. It is a best-match decision, not an exact-match requirement, which is why a single renamed class does not sink it the way it would a bare CSS selector.

Testim also runs an ongoing repair process called Auto Improve. According to Testim's own documentation, when a locator's live match score drops (the published threshold is below 70%), the platform automatically computes a better locator from recent run history, tests the candidate, and replaces the degraded locator with the improved one if it holds up, no human required. One documented exception: Auto Improve leaves a locator alone if you have manually edited it, on the assumption you changed it for a reason.

## Why the feature exists

A hand-written CSS or XPath locator pins one attribute and hopes it survives. Anyone who has maintained a few hundred Selenium or Playwright tests through two or three frontend migrations has watched a routine dependency bump turn into an afternoon of patching selectors: one `id` removed here, one class renamed by a CSS-in-JS build step there. Smart Locators remove that guessing: instead of asking an engineer to predict which single attribute survives six months out, Testim captures dozens of candidates at record time and lets a weighted score decide, continuously, without anyone reopening the test every time one signal moves. It also lowers who can maintain the suite; a recorded flow with a self-scoring locator underneath is legible to a manual QA engineer who has never opened a terminal, which a `driver.findElement(By.xpath(...))` chain is not.

## Where Smart Locators genuinely help

Credit where it is due. Scoring many weighted attributes instead of pinning one is a real structural improvement: partial drift, one renamed class, one shifted sibling index, one dropped `id`, does not sink the whole locator, because other attributes in the fingerprint keep pointing at the right element. Auto Improve closes the loop over the test's whole lifetime rather than just at record time, so a degrading locator gets a chance to repair itself between runs instead of quietly rotting until someone notices a failed build. And because a fix lives inside one managed editor, repairing it once fixes every future run of that step, instead of a page-object file someone has to remember to update across a repository. The visual, low-code authoring model puts all of this in reach of testers who are not writing automation code at all, a genuine unlock for QA orgs built around manual testers.

## Where they still break

### A fingerprint is still stored, just spread across more attributes

Auto Improve repairs a weighted fingerprint incrementally, between runs, using history built from a specific DOM shape captured at record time. It is not re-deriving the element from nothing on every execution the way a live read would. The scenario above is the case where that matters: a redesign that changes class, structure, and layout together in one release can drop a fingerprint's score too far, too fast, for Auto Improve to repair with confidence. The step fails, and the fingerprint needs a manual re-record. Testim's own carve-out, that it will not touch a locator you have manually edited, is a quiet admission that plenty of locators still end up needing a human hand eventually.

### Position is a scored attribute, and position is what breaks on duplicate rows

The same attribute set that includes structural and positional signal becomes a liability the moment a page has several similar elements: a table of shipment rows, a list of edit icons, a repeated card grid. A weighted match leaning partly on "the Nth interactive element inside this container" is, by construction, vulnerable to exactly what happened in the Carrier-column example: insert one column, or change the default sort, and the position signal that used to identify row 4's cancel icon now points at row 5's. Unique text or an `id` can rescue the match, but an icon-only button with neither is left leaning on the one signal that just moved.

### The fingerprint only survives inside the platform

The stored fingerprint, its weights, and the run history Auto Improve reasons over all live inside Testim's hosted service. That is not a defect so much as the deal that comes with a managed platform, but it does mean the resilience is not portable. You cannot export a Smart Locator into a Playwright suite if your team changes tools later, and the healing only runs while you are logged in and paying for the platform doing it.

## What changes when there's no locator to store

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. It has no fingerprint, no weighted attribute list, and no Auto Improve pass to run, because it never stores an identifier for an element in the first place. Its builtin engine gives the model a `snapshot` tool that returns the page's accessibility tree, the same structured tree of roles, accessible names, and visible text a screen reader consumes, rather than a DOM dump or a cached selector. The model reads that tree fresh on every step and decides which node satisfies your instruction in the moment; there is no `id`, class, or sibling index saved anywhere to go stale. The default `stagehand` engine (MIT-licensed, from Browserbase) resolves in the same spirit, reasoning over what is currently rendered instead of replaying a stored path.

```bash
npm install -g browserbash-cli

browserbash run "Open the shipments console, cancel shipment SH-88421, confirm the cancellation in the dialog, and verify the status badge for that row reads 'Cancelled'" --headless
```

Nothing in that sentence names a class, an `id`, or a row position. The agent finds "the cancel icon on the row for SH-88421" by reading the row's own visible content, the way a person scanning the table would, so an inserted Carrier column or a new wrapper span around the icon is simply not part of what it was keying on to begin with.

For a suite you want to commit and review like application code, the same flow becomes a markdown test:

```markdown
# Cancel a shipment from the console

- Open {{console_url}}
- Cancel shipment SH-88421
- Confirm the cancellation in the dialog
- Verify: the status badge for shipment SH-88421 reads "Cancelled"
```

```bash
browserbash testmd run ./cancel_shipment_test.md --agent --headless
echo "exit code: $?"
```

That `Verify:` line compiles to a real, deterministic check, not an LLM's opinion about whether the run "looked right." The run exits `0` on pass, `1` on a failed verification, `2` on an error, and `3` on timeout, and `--agent` streams NDJSON `step` and `run_end` events so CI, or another AI agent, can gate on structured data instead of a dashboard. The replay cache narrows the speed and cost gap here too: once a run is green, the next run replays its recorded actions with zero model calls, near-free and deterministic, until the page changes enough that a cached action no longer applies, at which point it falls back to a fresh read of the live page rather than confidently clicking whatever used to be there. More on how the two engines resolve elements is on the [BrowserBash features page](https://browserbash.com/features).

## Testim Smart Locators vs no locator, side by side

| Concern | Testim Smart Locators | No-locator AI (BrowserBash) |
| --- | --- | --- |
| Stores an identifier per element | Yes, a weighted multi-attribute fingerprint | No, nothing stored per element |
| Survives one attribute changing | Yes, other weighted attributes cover for it | Yes, re-reads current role, name, and text |
| Survives several attributes changing at once | Only if Auto Improve finds a confident replacement | Yes, there is no stale baseline to fall behind |
| Near-identical rows or cards | Position is a scored attribute, vulnerable to reordering | Model matches on the row's own visible content |
| Repair mechanism | Automatic Auto Improve below roughly 70% confidence, or manual re-record | No repair needed; replay cache re-resolves on a miss |
| Authoring | Visual recorder, no scripting required | Plain-English sentence or markdown steps |
| Where the locator lives | Inside the hosted Testim platform | Nowhere; resolved fresh, cache is optional and local |
| Portable outside the vendor | No | Yes, engine- and provider-agnostic |
| Determinism | High once healed, same fingerprint each stable run | Goal-deterministic, gated by `Verify:` plus exit code |
| Cost model | Commercial platform pricing | Free; local Ollama free, hosted models metered |
| CI signal | Platform run reports and dashboards | Exit codes 0/1/2/3 plus NDJSON `--agent` events |

Read the authoring row honestly: a manual tester with no coding background can build and maintain a Testim flow end to end in a visual editor. BrowserBash does not try to replace that for a team that has standardized on a no-code platform and staffed around it.

## The honest tradeoffs

Where Testim pulls ahead: once a fingerprint is healthy, scoring it against the live DOM is a fast, in-process comparison, no model call, no round trip to an LLM provider. For a large regression suite run many times a day, that speed, plus the flat cost of a commercial platform, is a real advantage, and a visual editor is a genuine unlock for teams whose test maintainers are not engineers.

Where the no-locator approach pulls ahead is the exact failure mode from the opening scenario: a release that changes class, structure, and layout together. Nothing is stored, so there is no fingerprint to fall behind the current DOM and no Auto Improve pass that might come up short. The replay cache closes most of the cost gap for a flow that already ran green once, and unlike a degraded fingerprint, a cache miss falls back to reading the actual page instead of confidently acting on stale information.

Be honest about the limits here too. A cache-cold run costs seconds, and with a hosted model, tokens, where a healthy Smart Locator match is close to instant and free. Runs are goal-deterministic, not path-deterministic: two runs of the same objective can take slightly different steps to the same verified outcome, which matters if your process needs an identical execution trace rather than a verified end state. And the agent is only as capable as the model behind it: small local models (roughly 8B parameters and under) are flaky on a multi-step flow like a cancellation with a confirmation dialog, where a larger or hosted model is meaningfully steadier.

Neither tool removes all maintenance. Testim moves it from "rewrite a selector" to "confirm or nudge an Auto Improve suggestion." BrowserBash moves it from "fix a locator" to "fix the wording of an objective, add a missing `Verify:` step, or move up to a stronger model."

## A short decision checklist

- Do the people keeping your suite green write code? If most maintainers are manual QA without a scripting background, a visual recorder with a self-scoring locator is a real fit a CLI does not replace.
- Does your release process change several visual attributes of one element at once, styling, structure, and layout together? That is where a stored fingerprint's score can drop faster than an automatic repair can keep up.
- Do your pages have several near-identical rows or icon-only actions with no unique text? Position-based scoring is more fragile there than reading a row's own content.
- Do you need the test to live as a plain-text file in the same repository and pull requests as the application code, with no vendor account required to read it? That favors describing the page instead of storing anything about it.
- Is the flow simple enough to try both ways in an afternoon? Recording it once in Testim and writing the same flow as one `browserbash run` sentence costs little to compare directly.

## FAQ

### Do Testim Smart Locators eliminate test maintenance entirely?

No. They reduce how often one attribute change breaks a test, by scoring several weighted attributes from the element and its parents instead of pinning a single CSS or XPath string, and Auto Improve repairs a degraded locator automatically in many cases. But Testim's own documentation carves out an exception for locators you have hand-edited, and when several attributes move in the same release, a confident automatic repair is not guaranteed, so manual re-recording still happens.

### What does Testim's roughly 70% locator confidence score mean?

It is the threshold at which Auto Improve triggers a repair attempt. According to Testim's documentation, when a locator's live match score drops below about 70%, the platform analyzes recent run history, computes a candidate replacement, tests it, and swaps it in automatically if it holds up, no editor visit required for that specific fix.

### Does BrowserBash use any stored locator, smart or otherwise?

No. Its agent reads the live, rendered page, through the accessibility tree in the builtin engine, on every step of every run, and decides which element satisfies your plain-English instruction in that moment. Nothing like an id, class, position, or fingerprint is saved between runs to go stale or need healing. The optional replay cache stores resolved actions for speed, not a locator, and falls back to a fresh read the moment a cached action no longer matches the page.

### Is a no-locator AI test as fast and cheap as a healthy Testim Smart Locator match?

Not on a cache-cold run: a scored, in-process fingerprint match beats a live accessibility-tree read on raw speed and cost every time. BrowserBash's replay cache closes most of that gap for a flow that has already run green once, replaying recorded actions with zero model calls until the page changes enough to need a fresh resolution.

### How does BrowserBash handle a table with near-identical rows, where Testim's position attribute is weakest?

The objective usually carries the distinguishing detail itself, an order number, an email, a status badge's text, so the agent matches the row by that content instead of by its index among siblings. That sidesteps the failure mode where a stored position attribute points at the wrong row after a column is added or a sort order changes, because no position was ever recorded to begin with.

### Can a team run Testim and BrowserBash side by side?

Yes, and no migration is required. A curated Testim suite maintained by non-technical testers can stay exactly as it is, while a handful of plain-English `*_test.md` files, run with `browserbash testmd run`, cover the developer-driven smoke checks and CI gates a full platform login is overkill for.

If you are staring at a locator that Auto Improve could not save, install the CLI with `npm install -g browserbash-cli` and try describing the element instead. It costs one command to compare against the fingerprint you already have.
