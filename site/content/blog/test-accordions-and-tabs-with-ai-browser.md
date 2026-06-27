---
title: How to Test Accordions and Tabbed Interfaces With AI
description: "Test accordions and tabs by label, not index: click a tab or header by its visible name, assert the right panel shows, others hide, and ARIA roles match."
date: 2026-06-27
category: testing
---

To test accordions and tabs with an AI browser agent, you write the test as intent: "click the Shipping tab, confirm the shipping panel is visible and the Billing panel is hidden," and let the agent find the control by its visible label and accessible role, click it, and assert on the content that actually rendered. You never hardcode `.tab:nth-child(2)` or `#panel-3`. You name the tab the way a user names it, assert the panel by the text a user would read, and let the runner re-derive how to reach those elements from the live page on every run. That single shift, from index-and-selector to label-and-content, is what makes accordion and tab tests survive redesigns, reordered panels, and component-library swaps.

This guide shows how to do that with [BrowserBash](https://browserbash.com/features), a free open-source natural-language browser-automation and testing CLI. It covers clicking a tab or accordion header by label, asserting that the correct panel shows and siblings hide, checking ARIA `tab` and `tabpanel` roles and expanded state, composing reusable `*_test.md` files, wiring the result into CI, and the honest places where this approach gets harder.

## Why index-based tab and accordion tests rot

Tabs and accordions are the most reordered widgets on the web. A product page ships with Description, Specs, Reviews. Three sprints later marketing inserts a Shipping tab in second position, and every test that clicked "the second tab" is now silently testing the wrong panel. It does not throw. It clicks Shipping, asserts on Description content, and either fails confusingly or, worse, passes against the wrong thing.

The classic selector approach has three failure modes specific to these widgets:

- **Positional locators** (`nth-child`, `eq(1)`, array index) break the moment a panel is added, removed, or reordered.
- **Generated IDs and hashed classes** (`#tab-a8f3`, `.MuiTab-root-1842`) change on every component-library upgrade or build.
- **State coupling**: many accordion implementations keep collapsed panels in the DOM but hidden. A naive `getText()` reads collapsed content that no user can see, so the assertion lies.

An AI agent sidesteps all three because it does not target structure. It targets the thing a person targets: the word on the tab, and the words inside the panel.

## How the agent finds a tab or accordion header

BrowserBash finds elements through the accessibility tree (roles, accessible names, and states) plus the DOM, not CSS classes. A correctly built tab strip exposes each tab as `role="tab"` with an accessible name (the visible label), and the panel as `role="tabpanel"`. An accordion header is typically a `button` with `aria-expanded="true|false"` controlling a region below it. The agent reads those roles and names the same way a screen reader does, which is exactly why "click the Reviews tab" resolves to the right control regardless of where it sits or what classes it carries. For the mechanics of how that resolution works, see [how BrowserBash finds elements via the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree).

Two engines back this. The default engine, stagehand (MIT, by Browserbase), observes the live DOM each step and decides the next action from what is rendered right then. The alternative builtin engine runs an Anthropic tool-use loop, captures native Playwright traces, and re-derives the selector on every action from a fresh snapshot, never cached across runs. Either way the lookup is computed against current page state, not a stored script. This is not self-healing: nothing patches or remembers a saved selector. The agent re-derives from live state each run, so a reordered tab strip is a non-event.

A first interactive run:

```bash
browserbash run "On the product page, click the Reviews tab and confirm the reviews panel is showing"
```

The agent snapshots the page, locates a control with role `tab` and accessible name "Reviews", clicks it, re-snapshots, and reports what it observed. No selector ever left your sentence.

## Asserting the right panel shows and others hide

The whole point of a tab or accordion test is mutual exclusion (or, for multi-open accordions, the specific open set). Getting that right means asserting on three things, all by visible content:

1. The control you clicked is now selected or expanded.
2. The matching panel's content is visible.
3. The previously open panel's content is no longer visible.

Phrase the objective so all three are checked. Assert by content a user would read, not by index:

```bash
browserbash run "Click the Shipping tab. Verify the panel shows the text 'Free returns within 30 days'. Verify the Description panel content 'Crafted from recycled aluminum' is no longer visible."
```

Naming the disappearing text matters. A test that only checks the new panel appeared will pass even if the old panel never closed and both are stacked on screen, which is a real and common bug. Calling out the text that should vanish turns a half-test into a real one.

For accordions, the same logic applies to expand and collapse:

```bash
browserbash run "On the FAQ page, expand the 'How do refunds work?' item. Confirm its answer about a 5 to 7 day window is visible. Then expand 'How do I cancel?' and confirm the refunds answer is hidden, assuming this accordion allows only one open item."
```

That last clause matters. Some accordions are single-open (opening one closes the rest), others are multi-open. State the contract you expect so the agent asserts the right thing instead of guessing.

## Writing it as a reusable *_test.md file

Ad hoc `run` commands are great for exploring. For a suite you keep, write a Markdown test file. Tests are intent, not selectors: a `# title`, ordered or unordered steps, optional `@import` composition, and `{{variables}}` with secret masking in logs. Here is a tabbed product-detail test:

```markdown
# Product tabs show correct panels

1. Go to {{base_url}}/products/desk-lamp
2. Confirm the Description tab is selected by default
3. Confirm the panel shows "warm 2700K LED"
4. Click the Specifications tab
5. Confirm the panel shows "Weight: 1.2 kg"
6. Confirm the description text "warm 2700K LED" is no longer visible
7. Click the Reviews tab
8. Confirm the panel shows at least one star rating and a reviewer name
9. Confirm the specifications text "Weight: 1.2 kg" is no longer visible
```

Run it:

```bash
browserbash testmd run ./product_tabs_test.md
```

Each numbered line is a discrete objective the agent satisfies and checks against the live page. Notice step 6 and step 9: every tab switch asserts both the arrival and the departure. That is the discipline that catches "panels never hide" bugs.

An accordion test leans on expand, collapse, and ARIA state:

```markdown
# FAQ accordion expands and collapses

1. Go to {{base_url}}/faq
2. Confirm all answer panels start collapsed
3. Expand "What payment methods do you accept?"
4. Confirm the answer mentioning "Visa, Mastercard, and PayPal" is visible
5. Confirm the expanded header reports an expanded state to assistive tech
6. Expand "Do you ship internationally?"
7. Confirm the payment-methods answer is now hidden
8. Collapse "Do you ship internationally?"
9. Confirm no answer panels are visible
```

Step 5 nudges the agent to check `aria-expanded`, which a screen-reader user depends on. You can be that explicit because the agent reads the accessibility tree directly.

### Composing with @import and variables

If several pages share a tab widget (say a settings area with the same tab strip on every sub-page), factor the shared check into one file and import it. Variables keep the URL and any secrets out of the step text:

```markdown
# Settings tabs work on the billing page

@import ./shared/tab_strip_check_test.md

1. Go to {{base_url}}/settings/billing
2. Run the shared tab strip check
3. Confirm the Invoices tab shows the heading "Recent invoices"
```

Where a step needs a logged-in session, import a login file rather than repeating credentials:

```markdown
@import ./login_test.md
```

Secrets passed as `{{api_token}}` or `{{password}}` are masked in logs, so recordings and CI output do not leak them.

## Late-rendering panels and lazy tabs

Tabs and accordions frequently fetch their content on first open: click Reviews and a spinner appears while the API responds. You do not write sleeps for this. BrowserBash relies on Playwright's built-in auto-wait with a 15 second ceiling, so an assertion on "the reviews panel shows a reviewer name" naturally waits for that content to render before deciding. No manual `sleep`, no `waitForSelector`. If the panel never loads within the ceiling, the step fails with a real signal rather than a flaky guess. This is the same auto-wait that makes [browser automation without selectors](https://browserbash.com/blog/browser-automation-without-selectors) practical: you describe the end state, the runner waits for it.

## Choosing a model for these flows

The default model resolution is auto: it resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist there). Tab and accordion checks are usually short, shallow flows (open, assert, move on), so they are forgiving. Even so, small local models (8B and under) get flaky on longer sequences, like a settings area with eight tabs each carrying its own assertions. For a long accordion sweep, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model holds the thread far better. Running fully local means nothing leaves the machine, the right default for internal admin tools behind a login.

```bash
# Local, private, good enough for a 3-tab product page
browserbash run "Click each tab on the product page and confirm its panel renders" --provider local

# Hosted model for a long settings-area accordion sweep
ANTHROPIC_API_KEY=sk-... browserbash testmd run ./settings_accordion_test.md
```

## Wiring tab and accordion tests into CI

In CI you want a machine-readable signal and artifacts, not a human watching a browser. BrowserBash emits that signal and you wire the integration alongside it. BrowserBash does not natively post to Slack or open Jira tickets; it produces the data, and you forward it.

The pieces:

- `--agent` emits NDJSON (one JSON event per line) you can parse step by step.
- Exit codes: `0` pass, `1` fail, `2` error, `3` timeout.
- `--headless` runs without a visible window.
- `--record` captures webm video plus screenshots, invaluable for a "panel never closed" failure you cannot reproduce locally.
- A `Result.md` is written per run with a human-readable summary.
- `--upload` is opt-in: it pushes the run to a free cloud dashboard (runs kept 15 days). A local dashboard is available via `browserbash dashboard`.

A GitHub Actions job that gates a deploy on the tab suite:

```yaml
name: ui-widgets
on: [push]

jobs:
  tabs-accordions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g browserbash-cli
      - name: Run tab and accordion tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BASE_URL: ${{ vars.BASE_URL }}
        run: |
          browserbash testmd run ./tests/product_tabs_test.md \
            --headless --agent --record \
            --var base_url="$BASE_URL" \
            | tee tabs.ndjson
      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tab-run
          path: |
            tabs.ndjson
            Result.md
            ./**/*.webm
```

Because the run exits non-zero on a failed assertion, the job fails the build automatically. To forward a failure to Slack, read the exit code and parse the NDJSON yourself:

```bash
browserbash testmd run ./tests/product_tabs_test.md --headless --agent | tee tabs.ndjson
status=$?
if [ $status -ne 0 ]; then
  summary=$(grep '"type":"step"' tabs.ndjson | tail -1)
  curl -s -X POST "$SLACK_WEBHOOK" \
    -H 'Content-type: application/json' \
    -d "{\"text\":\"Tab tests failed (exit $status): $summary\"}"
fi
```

That is the honest shape of every integration: BrowserBash gives you the exit code, the NDJSON, the `Result.md`, and the `--record` artifacts, and a few lines of shell turn them into a Slack ping, a Jira comment, or a status check. For more on what each NDJSON event contains and how the loop reasons, see [agentic testing explained](https://browserbash.com/blog/agentic-testing-explained).

## Iframes and Shadow DOM tabs

Two structural cases trip up brittle frameworks and are worth calling out because the agent handles them. Tabbed embeds (a help-center widget, a payment panel) often live in an `iframe`. Design-system tab components built on web components (Lit, Stencil) hide their structure inside Shadow DOM. The agent traverses both: it reads the accessibility tree across iframe and Shadow DOM boundaries, so "click the Card tab inside the checkout widget" resolves even when that widget is an isolated iframe. You do not switch frames or pierce shadow roots by hand the way you would in raw Playwright or Selenium.

## Honest limits

This approach is not magic, and these widgets expose its rough edges more than most.

**Purely visual tabs with no semantics.** If a "tab strip" is a row of `div`s with click handlers, no `role`, no accessible name, and panels toggled only by a CSS class, the agent has less to grip. It can often still infer from visible text and position, but the lookup is shakier than on a proper `role="tab"` strip. The fix doubles as an accessibility win: give the widget real roles and names. The agent's difficulty here mirrors a screen-reader user's, which is a signal worth heeding.

**Animated transitions.** Accordions that slide open over a long animation can leave content mid-transition when the agent snapshots. Auto-wait usually covers it, but a 600ms ease on a large panel can occasionally race an assertion. If you see intermittent flake, it is almost always animation timing; asserting on stable text that lands after the animation helps.

**Hidden versus removed.** "Is the old panel hidden?" is easy when the panel is removed and its text is gone. It is subtler when the implementation keeps the panel in the DOM at `opacity: 0` or `visibility: hidden`. The agent reasons about visible content, so asserting on what a user can actually read is reliable; asserting on raw DOM presence is not what this tool is for.

**Near-identical panels.** A FAQ where several questions share phrasing can make "expand the refunds question" ambiguous. Use the most distinctive words from the real label to disambiguate.

**Determinism.** An agent makes decisions, so two runs are not byte-identical the way a fixed script is. For tab and accordion flows the variance is low (the action space is small), but if you need exact, repeatable, line-by-line behavior on a stable critical path, a hand-written Playwright assertion is still the more predictable tool. Agentic checks earn their keep on resilience to change, not determinism.

## FAQ

### How do I click a specific tab without using its index or CSS class?

Name it by its visible label in the objective: "click the Reviews tab." BrowserBash resolves the control through the accessibility tree, matching `role="tab"` with the accessible name "Reviews," so the click lands regardless of the tab's position in the strip or its generated classes. If two tabs share similar text, add a distinguishing word from the real label.

### How do I assert that the wrong panel is hidden, not just that the right one shows?

Name the text that should disappear. Write the assertion as two parts: "confirm the Shipping panel shows 'Free returns' AND the Description text 'recycled aluminum' is no longer visible." Checking only the new panel will pass even when the old one stays open, which is a common real bug. Asserting on the vanishing text catches it.

### Can it verify ARIA roles and aria-expanded on accordions?

Yes. The agent reads roles, accessible names, and states directly from the accessibility tree, so you can write steps like "confirm the expanded header reports an expanded state to assistive tech," which checks `aria-expanded`. That is also why poorly-built widgets with no roles are harder for the agent: the same semantics screen readers need are the semantics it uses.

### What about tabs inside an iframe or a Shadow DOM web component?

Both are handled. The agent traverses iframe and Shadow DOM boundaries when reading the accessibility tree, so "click the Card tab in the checkout widget" works even when that widget is an isolated iframe or a Lit-based web component. You do not manually switch frames or pierce shadow roots.

## Where to go next

Tabs and accordions are one slice of the dynamic-UI problem. The same label-and-content discipline applies to grids and lists: see [testing data tables, sorting, and pagination with AI](https://browserbash.com/blog/test-data-tables-sorting-pagination-with-ai) for asserting order and page state by visible content. To go hands-on with example test files and the full command reference, start at [the BrowserBash learn hub](https://browserbash.com/learn). Install it with `npm install -g browserbash-cli`, point a `run` at your trickiest tab strip, and watch it find the right panel by name.
