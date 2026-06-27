---
title: Testing Autocomplete and Typeahead Search Fields With AI
description: "Test autocomplete search with AI by typing a query, waiting for the async suggestion list, and selecting a result by its accessible name, no selectors."
date: 2026-06-27
category: testing
---

To test autocomplete search with AI, you describe the behavior in plain language: type a partial query, wait for the suggestion dropdown to load, and pick the option that matches. An AI browser agent handles the hard part, which is that the suggestion list arrives asynchronously after a debounce and the agent has to wait for real options to render before choosing one. Instead of hand-coding a selector for a `<ul>` that may not exist yet and a polling loop for it to fill, you write an intent like "type 'lon' into the city search and select London from the suggestions," and the agent observes the live page, waits for the list to appear, and clicks the matching option by its accessible name. This article shows how to do exactly that with [BrowserBash](https://browserbash.com/features), a free open-source (Apache-2.0) command-line tool from The Testing Academy, including runnable test files, how the auto-wait handles the async gap, and an honest section on where debounce timing and ranked results make this genuinely hard.

## Why autocomplete is harder to test than a plain input

A plain text field is a one-shot action: you type, the value lands, you assert. Autocomplete adds three moving parts that conspire to make selector-based tests brittle.

First, the suggestion list is **asynchronous**. When you type, the app waits a beat (the debounce) and fires a network request; the dropdown only renders once that request returns. So between "type the query" and "click the suggestion" there is a gap of unknown length, and a test that clicks too early clicks nothing.

Second, the dropdown is **conditional and transient**. It often does not exist in the DOM until you focus the field and type, and it disappears the moment you blur or pick a result. A selector written against it targets something that is absent most of the time.

Third, the contents are **dynamic and sometimes ranked**. The same three letters can surface a different ordered list depending on backend state, personalization, or the search index. A test pinned to "click the second item" is pinned to an ordering you do not control.

Selector-based frameworks can handle all of this, but you end up writing explicit waits for the list container, retry logic for the options, and assertions that tolerate ordering. The AI approach trades that plumbing for a description of the outcome and lets the agent re-derive the right element from whatever is on screen at the moment it looks.

## The core pattern: type, wait, select by name

Here is the smallest useful version. With BrowserBash you can run a one-off objective straight from the command line:

```bash
browserbash run "Go to the demo site, type 'lon' into the city search box, \
wait for the suggestion list to appear, and click the option for London"
```

The agent does four things in order. It finds the search box by its role and accessible name (a textbox labelled something like "City"), types the partial query, waits for the options to render, then clicks the option whose accessible name matches "London." It never asked for a CSS selector, and it does not assume the dropdown exists before it types: it looks at the page after typing, sees the list that appeared, and acts on it.

For anything you want to keep and re-run, write it as a Markdown test file instead. BrowserBash reads `*_test.md` files where the test is intent, not code: a title, a list of steps, and optional variables.

```markdown
# City autocomplete selects the right suggestion

1. Open https://demo.example.com/search
2. Type "lon" into the city search field
3. Wait for the suggestion dropdown to show options
4. Click the suggestion labelled "London"
5. Confirm the search field now contains "London"
```

Run it with:

```bash
browserbash testmd run ./city_autocomplete_test.md
```

Notice step 3. You are not telling the agent *how long* to wait or *what selector* to poll; you are stating the condition: options should be present. Under the hood this rides on Playwright's built-in auto-wait, which holds for an element to become actionable up to a 15-second ceiling, with no manual `sleep` calls anywhere. That ceiling absorbs the debounce-plus-network gap that makes autocomplete tricky. If the list takes 800ms to appear, the agent waits 800ms; if the backend is slow and it takes four seconds, the agent waits four seconds. You did not have to guess the number.

## Selecting by accessible name, not position

The reason this works without selectors is that the agent finds elements through the accessibility tree (roles, accessible names, and states) plus the DOM, not CSS classes. A well-built autocomplete renders its options as a listbox with `option` roles, and each option's visible text becomes its accessible name. So "click the suggestion labelled London" maps cleanly onto "find the `option` whose accessible name is London and click it."

This matters for three concrete reasons that bite position-based tests:

- **Ordering can change.** "Click the first option" breaks when the ranking shifts. "Click the option for London" does not, because it targets meaning, not slot.
- **The markup can change.** A refactor from `<li>` to `<div role="option">` keeps the accessible name "London" and keeps your test green, while a CSS-class selector would shatter.
- **Duplicate-ish entries get disambiguated by their full label.** If the list shows "London, UK" and "London, Ontario," you select on the fuller accessible name and the agent picks the right one.

This is the same element-finding model BrowserBash uses everywhere. The deep dive on [how BrowserBash finds elements via the accessibility tree](https://browserbash.com/blog/how-browserbash-finds-elements-accessibility-tree) explains why roles and names are a more stable target than CSS for exactly this kind of dynamic widget, and [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis) covers the same robustness against shifting, late-rendering content from the rendering angle.

## A fuller test: query, narrow, and commit

Real typeahead testing is rarely a single keystroke-to-click. Users type a few characters, see a list, type more to narrow it, then pick. Here is a test that exercises the narrowing behavior, where a lot of autocomplete bugs hide.

```markdown
# Typeahead narrows results as the query gets more specific

1. Open https://demo.example.com/search
2. Type "san" into the city search field
3. Wait for the suggestion list to appear
4. Confirm the suggestions include "San Francisco" and "San Diego"
5. Type "san fr" into the same field
6. Wait for the suggestion list to update
7. Confirm "San Francisco" is shown and "San Diego" is no longer in the list
8. Click the suggestion labelled "San Francisco"
9. Confirm the search field contains "San Francisco"
```

Two things are doing real work here. Step 4 asserts on *set membership* ("include these") rather than exact ordering, which keeps the test honest about what the product actually guarantees. Step 7 asserts that narrowing removed an option, the behavior most worth protecting, because a broken debounce or a stale-response race often shows up as the wrong city lingering in the list. The agent re-observes the live DOM between step 5's typing and step 8's click, so it always chooses from the list as it exists *right then*, never from a cached snapshot.

BrowserBash's default engine is `stagehand`, which observes the live DOM each step and decides the next action from what is rendered right then. The alternative `builtin` engine, an Anthropic tool-use loop, makes this even more explicit: it captures native Playwright traces and re-derives the selector on every action from a fresh page snapshot, never cached across runs. Either engine gives you the property you want for autocomplete: the agent looks at the current list before it picks, so a late-arriving or reordered set of suggestions does not desync the test.

## Composing autocomplete into larger flows

Autocomplete almost never stands alone. It is the city picker inside a booking form, the product search at the top of a catalog, the user lookup in an admin panel. BrowserBash test files compose with `@import`, so you can write the autocomplete interaction once and reuse it.

```markdown
# Book a trip starting from a searched city

@import ./login_test.md

1. Go to the booking page
2. Type "{{origin_query}}" into the origin city field
3. Wait for the suggestion list and click the option labelled "{{origin_city}}"
4. Type "{{dest_query}}" into the destination city field
5. Wait for the suggestion list and click the option labelled "{{dest_city}}"
6. Click "Search flights"
7. Confirm results show flights from "{{origin_city}}" to "{{dest_city}}"
```

The `{{variables}}` let you run the same flow across many city pairs from a data file or CI matrix, and any value marked secret is masked in logs so credentials from the imported `login_test.md` never leak into your output. For search specifically, the companion piece on how to [automate search functionality testing](https://browserbash.com/blog/automate-search-functionality-testing) covers the broader surface (empty results, no-match states, result counts) around the autocomplete widget itself.

## Asserting on suggestions, not just the final value

A weak autocomplete test only checks the field's final value. A good one also checks the *list* the user saw, because that is where most defects live. Useful assertions to state in plain language:

- **Presence:** "Confirm the suggestion list appears after typing." Catches a broken debounce or a dead endpoint.
- **Relevance:** "Confirm every suggestion contains the query text." Catches a backend returning garbage.
- **No-match:** "Type 'zzzqqq' and confirm the list shows a no-results message." Catches the empty-state path, which is frequently unstyled or crashing.
- **Keyboard path:** "Type 'lon', press ArrowDown, press Enter, and confirm London is selected." Catches keyboard accessibility regressions that mouse-only tests miss.

The keyboard case is worth calling out. Plenty of widgets work fine with a click but break arrow-key navigation, which screen-reader users depend on. Because the agent drives a real Chrome via Playwright, it can press real keys, so you test the keyboard commit path with the same intent-style step you use for clicking. Edge cases like the no-match state and malformed input pair naturally with the patterns in [automating form validation testing for edge cases](https://browserbash.com/blog/automate-form-validation-testing-edge-cases), since an autocomplete is, at bottom, an input with opinions.

## Running it in CI

Autocomplete tests earn their keep when they run on every deploy, because async suggestion bugs are exactly the kind that slip past a manual click-through. BrowserBash is built for that:

```bash
browserbash testmd run ./city_autocomplete_test.md \
  --headless --agent --record
```

The `--agent` flag emits NDJSON so a pipeline can parse each step, and exit codes are unambiguous: 0 pass, 1 fail, 2 error, 3 timeout. That timeout code is especially meaningful for autocomplete, because a code 3 tells you the suggestion list never rendered within the wait ceiling, a more actionable signal than a generic assertion failure. The `--record` flag saves a webm video plus screenshots, so when a typeahead test goes red you can watch the exact moment the dropdown failed to appear. A `Result.md` is written per run, and you can opt into a cloud dashboard with `--upload` (free runs kept 15 days) or stay entirely local with `browserbash dashboard`.

On the model side, the default `auto` setting resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free models exist. For a narrowing flow, a capable model matters: small local models (8B or smaller) get flaky on longer multi-step flows, so for a stubborn typeahead sequence reach for a 70B-class local model (Qwen3, Llama 3.3) or a hosted model. With a local model, nothing leaves your machine, the right default when your search queries internal or pre-release data.

## Honest limits: where this gets hard

AI-driven autocomplete testing removes the selector and timing plumbing, but it does not repeal physics. Be clear-eyed about these.

**Debounce timing is the big one.** The agent waits for the suggestion list to *appear*, and the auto-wait absorbs the debounce delay up to its 15-second ceiling. What it does not do is *measure* the debounce. If your requirement is "suggestions must not fire before 300ms of idle typing," that is a precise timing assertion, and an observe-and-act agent is the wrong tool for it; you want a unit-level or network-timing test for that contract. The agent verifies the *behavior* (the right options appear and the right one can be selected), not the *millisecond budget*.

**Rapidly mutating lists can race the observation.** If your suggestions reorder or churn continuously while the user is mid-type (live-streaming results, for instance), there is an inherent gap between when the agent reads the list and when it clicks. Re-deriving from live state on each action helps, but a list that changes underneath the click can still flake. Designs that settle the list once typing pauses are far more testable, by humans and agents alike.

**Ranking and personalization are not deterministic.** If "lon" returns a different top result per user or session, do not assert on position or on "the top suggestion." Assert on membership and on selecting a named option. The agent can only be as deterministic as the product is, and a personalized ranker is non-deterministic by design.

**Virtualized and infinite lists may hide options.** A list that virtualizes (renders only the visible slice) can keep a valid option out of the accessibility tree until you scroll. The agent can often scroll to find it, but a deeply buried result is slower and less reliable than one in a short, fully-rendered dropdown. Test against a query specific enough to surface the target near the top.

**Custom widgets that fake their roles will fight you.** The approach leans on listbox and option roles carrying correct accessible names. A div-soup autocomplete with no roles or labels gives the agent (and assistive tech, and your users) a weaker handle to grab. Ironically, the autocompletes hardest for an agent to test are usually the ones with real accessibility problems, so a failure here often points at a genuine bug worth fixing.

None of these are reasons to avoid AI for autocomplete. They are the boundary of what an observe-and-act agent is good for: excellent at the *functional* question (can a user type, see relevant suggestions, and pick the right one) and poor at the *precise-timing* question. Use it for the former, keep timing checks where they belong, and you get robust coverage without a single brittle selector.

## FAQ

### How does the AI know when the suggestion list has loaded?

It waits for the option elements to become present and actionable via Playwright's built-in auto-wait, with a 15-second ceiling and no manual sleeps. When you write "wait for the suggestion list to appear," the agent holds until options actually render, absorbing the debounce delay and the network round trip. If nothing renders within the ceiling, the run reports a timeout (exit code 3) rather than clicking empty space.

### Can it select a suggestion if the order changes between runs?

Yes, as long as you select by name rather than position. The agent finds the option through the accessibility tree by its accessible name (the visible label), so "click the option for London" works regardless of where London sits in the list. Avoid steps like "click the first suggestion" for any list whose ordering you do not control, since ranking and personalization can shift it.

### Can I test the debounce timing itself, like "no request before 300ms"?

Not precisely, and you should not try to with this tool. The agent verifies behavior (the right suggestions appear and the right one is selectable), not millisecond budgets. A strict "the request must not fire before 300ms" contract belongs in a unit test or a network-timing assertion. Use the AI agent for the functional flow and keep the timing micro-assertion in a layer built for it.

### Does it work with keyboard navigation, not just clicking?

Yes. Because the agent drives a real Chrome through Playwright, it can press real keys. Write a step like "type 'lon', press ArrowDown, then press Enter" and assert London ends up selected, which exercises the keyboard commit path that mouse-only tests skip. This is a good way to catch accessibility regressions in the dropdown.

## Where to go next

Start small: write one `*_test.md` that types a partial query, waits for the list, and selects a named option, then run it locally. Once that is green, compose it into the larger flow with `@import`, parameterize the queries with `{{variables}}`, and wire it into CI with `--headless --agent --record`. Keep assertions on set membership and named selection rather than position, and push strict debounce-timing checks down to a layer built for them. For more on how the agent reasons about pages that change underneath it, the [BrowserBash learn hub](https://browserbash.com/learn) is the natural next read. Autocomplete is one of the most selector-hostile widgets on the web, which is exactly why describing the outcome and letting an agent re-derive the element each run pays off here more than almost anywhere else.
