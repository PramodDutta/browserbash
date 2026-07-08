---
title: Record a Browser Flow Once, Get a Plain-English Test
description: "A full browserbash record command tutorial: what gets captured, how password fields stay safe, and how to review the generated *_test.md file."
date: 2026-07-20
category: tutorial
---

Writing your first browser test is usually the easy part. Writing the tenth one, after you have already forgotten the exact button label and the login flow has three redirects, is where most people give up. This browserbash record command tutorial walks through the fix: click through a flow once in a real browser, and BrowserBash writes the plain-English `*_test.md` file for you. No selectors to hunt for, no locator strategy to debate, just a script that reads like the steps you actually took.

This is not a magic trick. `browserbash record` watches a small, well-defined set of DOM events, translates them into English sentences, and hands you a file you are expected to read before you commit it. That review step matters, and we will spend real time on it below, along with the one thing every recorder needs to get right: never letting a password touch the generated file.

## What browserbash record actually does

`browserbash record <url>` opens a visible Chromium browser pointed at the URL you give it. You then use the browser exactly as a human would: click a link, type into a search box, submit a login form, follow a redirect. Every meaningful interaction is captured by a small script injected into the page. When you are done, you press Ctrl-C in the terminal, and BrowserBash converts the captured interaction log into a `*_test.md` file written in the same plain-English format you would type by hand for `browserbash run` or `browserbash testmd run`.

The output is not a Playwright script full of CSS selectors and `page.locator()` calls. It is sentences: "Click the 'Sign in' button", "Type {{email}} into the Email field", "Verify text 'Welcome back' is visible". That distinction is the whole point of [BrowserBash](https://browserbash.com/features). A recorded Playwright script breaks the moment a class name changes. A recorded plain-English test survives layout churn because the agent driving it at replay time is reasoning about intent, not replaying exact DOM coordinates.

Here is the basic command:

```bash
browserbash record https://app.example.com/login
```

That opens the browser. You log in, click through to a dashboard, maybe open a settings page, and press Ctrl-C when you have covered the flow you care about. BrowserBash then writes a file, by default named after the page title or URL slug, something like `login_test.md`, into your working directory or wherever you point it with an output flag.

## Installing BrowserBash and running your first recording

If you have not installed the CLI yet, it is one command, pulling the [browserbash-cli package](https://www.npmjs.com/package/browserbash-cli) from npm:

```bash
npm install -g browserbash-cli
```

No API key is required to get started. BrowserBash resolves models Ollama-first: if you have a local model running, it uses that, and nothing about your recording or your test run leaves your machine. If you do not have Ollama installed, it falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, in that order. For recording specifically, no model call happens during the capture itself, since the record command is deterministic event capture, not an LLM watching you click. The model only enters the picture later, when you actually run the generated test with an agent-driven engine.

To try the recorder end to end, pick a flow you would want tested and run:

```bash
browserbash record https://your-app.example.com
```

Do the thing you want tested. Log in. Search for a product. Add it to a cart. Whatever your critical path is. When you are done, hit Ctrl-C. BrowserBash will print the path to the generated test file. Open it in your editor before you do anything else with it, which is the subject of most of the rest of this article.

## What gets captured during a recording session

The recorder is intentionally narrow in scope. It is not trying to capture every mouse movement or hover state, because that would produce a brittle, verbose test nobody wants to maintain. It captures the interactions that map cleanly onto the plain-English step grammar BrowserBash already understands:

- **Navigation**: the starting URL and any full-page navigations that happen as a result of your clicks (redirects after login, link clicks that load a new page).
- **Clicks**: on buttons, links, and other interactive elements, captured with enough context (visible text, role) to describe them in English rather than a brittle CSS path.
- **Text input**: typing into text fields, search boxes, and textareas, captured as the field's accessible label or placeholder plus the value you typed.
- **Selections**: choosing an option from a dropdown or select element.
- **Checkbox and radio interactions**: toggling a checkbox or picking a radio option.
- **Form submissions**: pressing Enter or clicking a submit button that sends a form.

What it deliberately does not capture is anything that would make the resulting file unreadable or unstable: raw pixel coordinates, scroll position, hover-only states with no semantic action, or the internal component tree of a JavaScript framework. The generated step for a click is "Click the 'Add to cart' button", not `page.click('div.sc-8f92a > button:nth-child(3)')`. If the button's visible text is stable, the step is stable, even if the underlying markup gets refactored next sprint.

This is also why the review step later in this tutorial is non-negotiable. The recorder does its best to describe what you clicked using visible, human-readable labels, but ambiguous pages, icon-only buttons, or dynamically generated text can produce a description that is technically accurate but not the phrasing you would have chosen. You are the editor. The recorder is a fast first draft.

### A worked example

Say you record a login and search flow on a demo shop. A typical raw capture, before you touch it, might turn into something close to this:

```markdown
# login_test

1. Go to https://shop.example.com/login
2. Type {{email}} into the Email field
3. Type {{password}} into the Password field
4. Click the 'Sign in' button
5. Verify text 'Welcome, Jordan' is visible
6. Type "wireless headphones" into the Search field
7. Click the 'Search' button
8. Verify text 'results for "wireless headphones"' is visible
```

Notice two things already. First, the email and password were both turned into `{{variables}}`, not hardcoded values. Second, no plaintext password appears anywhere in that file. That is not an accident, and it is worth its own section.

## How password fields are handled

This is the part of the recorder that matters most if you plan to commit generated tests to a shared repository, and it is worth being precise about, since "password handling" is exactly the kind of claim that should not be vague in a tutorial like this.

When the recorder detects that you are typing into a field of `type="password"`, it does not capture the characters you type. The capture script running in the page sends only a secret marker back to the recorder process, never the literal keystrokes. The generated step reads `Type {{password}} into the Password field`, using the same `{{variable}}` templating syntax BrowserBash already uses everywhere else, including in your `.browserbash/variables/` files and in Verify steps. Your actual password never becomes a string sitting in a Markdown file in your git history.

This matters for two separate reasons. The obvious one is that nobody wants their real password committed to source control, even accidentally, even for a throwaway staging account. The less obvious one is that it forces you into the correct pattern for BrowserBash tests generally: secrets belong in variables, not inline in the test file. Every `*_test.md` file BrowserBash runs already treats secret-marked variables this way; every log line that would print a secret masks it as `*****`. The recorder is just applying that same rule at the point of capture instead of leaving it to you to remember afterward.

In practice, this means the generated test file references `{{password}}` (or `{{email}}`, or whatever variable name matches the field's label), and you supply the actual value at run time through a variables file or environment-backed variable, the same way you would for any hand-written test:

```bash
browserbash testmd run ./.browserbash/tests/login_test.md
```

with a `.browserbash/variables/login_test.json` (or your global `~/.browserbash/variables/`) holding the real credentials locally, never in the file itself, and never in git.

If you record a flow that also includes other sensitive fields, credit card numbers, API tokens pasted into a settings page, security answers, treat the generated file the same way you would treat any test that touches secrets: check what variable name got assigned, confirm it is not accidentally holding a literal value, and move anything sensitive into your variables store before you commit. The recorder handles the one field type (`type="password"`) it can detect with certainty. It is not a general-purpose secret scanner, and you should not treat it as one for a field that is technically `type="text"` but happens to hold a token.

## Anatomy of the generated *_test.md file

The file the recorder writes is a normal BrowserBash test, which means everything you already know about the `*_test.md` format applies to it unchanged. A `#` line names the test. Steps are a numbered or bulleted list. `{{variables}}` get substituted at run time. `@import` composition works if you later want to split a long recorded flow into reusable pieces, say pulling the login sequence into its own file and importing it at the top of three other recorded tests instead of repeating it.

A recorded file typically has this shape:

```markdown
# checkout_flow_test

1. Go to https://shop.example.com
2. Click the 'Sign in' button
3. Type {{email}} into the Email field
4. Type {{password}} into the Password field
5. Click the 'Continue' button
6. Click the 'Wireless Headphones' link
7. Click the 'Add to cart' button
8. Click the cart icon
9. Click the 'Checkout' button
10. Verify text 'Order Summary' is visible
11. Click the 'Place order' button
12. Verify text 'Thank you for your order' is visible
```

Every step in there is something you did, phrased the way BrowserBash's own step grammar expects. Steps 10 and 12 are Verify assertions, and this is a good moment to mention that Verify steps written in the supported grammar (URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, a stored value equals something) compile to real Playwright checks with no LLM judgment involved. If the recorder produces a Verify step that happens to match that grammar, you get a deterministic pass or fail with expected-versus-actual evidence on failure, not an agent's opinion about whether the text looked "close enough."

If you want that level of determinism throughout a recorded flow, particularly for anything that seeds or checks data outside the UI, you can hand-add `version: 2` frontmatter and mix in explicit API steps after recording:

```markdown
---
version: 2
---

# checkout_flow_test

1. GET https://api.example.com/health
2. Expect status 200

3. Go to https://shop.example.com
4. Click the 'Sign in' button
5. Type {{email}} into the Email field
6. Type {{password}} into the Password field
7. Click the 'Continue' button
8. Verify text 'Welcome back' is visible
```

The recorder itself will not write API steps for you, since it only observes what happens inside the browser tab, but nothing stops you from editing the output afterward to add them. That is exactly the workflow this tutorial is arguing for: record the UI portion once, then hand-tune the parts a recorder cannot see.

## Reviewing and editing the generated test before committing

Treat the recorder's output as a pull request from a fast, literal-minded collaborator who was watching over your shoulder. It got the sequence right. It did not necessarily get the phrasing, the scope, or the assertions right, and it is on you to fix that before the file goes into version control. A few things worth checking every time:

**Prune incidental clicks.** If you fat-fingered a nav link mid-recording and clicked back, that extra round trip is now baked into the test. Delete it. A recorded test should read like the intended flow, not a literal transcript of every misclick.

**Tighten vague step descriptions.** Icon-only buttons or dynamically labeled elements sometimes get captured with a generic description like "Click the button". Replace that with something an agent (and a human six months from now) can act on unambiguously: "Click the trash icon next to the second cart item."

**Add Verify steps the recorder could not know you wanted.** The recorder captures what you clicked and typed, not what you were checking for. If you visually confirmed a success toast appeared but never clicked anything as a result, that check will not show up in the generated file automatically. Add it: `Verify text 'Changes saved' is visible`. This is the single most common gap in recorded tests, and it is worth a second pass through the file specifically hunting for assertions you made with your eyes but never encoded.

**Confirm variable names make sense.** The recorder infers variable names from field labels. A field labeled "Work email" might become `{{Work_email}}` or something close to it depending on the label text. Rename it to match your project's existing variable conventions before you commit, so `login_test.md` and `checkout_test.md` share the same `{{email}}` name instead of drifting into three near-duplicate variables across your suite.

**Decide what stays hardcoded versus what becomes a variable.** The recorder templatizes password fields automatically and often does the same for anything it recognizes as an email field. Everything else, a search term, a product name, a quantity, gets captured as the literal string you typed. Decide deliberately whether that literal should stay (fine for a smoke test checking one specific product page) or become a `{{search_term}}` variable (better if you want to reuse the same flow against different data).

**Run it once before you trust it.** Nothing in this review process substitutes for actually executing the file:

```bash
browserbash testmd run ./login_test.md --agent
```

Watch the NDJSON `step` events scroll by, or read the generated `Result.md` afterward. If a step the recorder wrote does not match what you meant, this is where it surfaces, before it becomes a flaky CI failure three weeks from now that nobody remembers recording. The [tutorials library](https://browserbash.com/tutorials) has more examples of reading and debugging that output if the NDJSON format is new to you.

## Combining recorded tests with the rest of the toolchain

A recorded test is not a special case once it is saved. It runs through the exact same pipeline as a hand-written one, which means every other v1.5 feature applies to it without modification.

Pair it with saved auth to skip re-recording the login sequence every time:

```bash
browserbash auth save shop-staging --url https://shop.example.com/login
browserbash testmd run ./checkout_flow_test.md --auth shop-staging
```

Put it on a schedule with monitor mode so a recorded checkout flow becomes an always-on synthetic check, alerting only when the state actually flips from pass to fail:

```bash
browserbash monitor ./checkout_flow_test.md --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

Run it in CI through the official GitHub Action, where the first green run seeds the replay cache and subsequent identical runs execute close to token-free, only falling back to the agent when the page actually changed. Details on wiring that up live in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

If you are recording several flows for the same application, consider running them as a suite with sharding and a cost ceiling so a bad recording cannot blow your CI budget:

```bash
browserbash run-all .browserbash/tests --shard 1/2 --budget-usd 2
```

None of this is unique to recorded tests specifically. That is the appeal: `browserbash record` is a faster way to arrive at the same `*_test.md` format everything else in the CLI already understands, not a parallel system with its own rules.

## When to use browserbash record, and when to write the file by hand

Recording is the right tool when you already have a working flow to click through, a staging environment, a demo account, a real product, and you want a first draft fast. It shines for onboarding flows, checkout paths, settings changes, anything with more than four or five steps where typing the plain-English sentences by hand would take longer than clicking through the UI once.

It is the wrong tool when the flow does not exist as clickable UI yet, when you are testing edge cases that require deliberately malformed input a normal click-through would never produce, or when the assertions you care about are more about API responses and data state than visible UI text (that is what testmd v2 API steps are for, and the recorder does not generate those). It also is not a substitute for thinking about what "correct" means for your app. The recorder faithfully captures what you clicked; it has no opinion on whether the flow you clicked through was actually the right one to test.

## Who this is for

If your team is still writing browser tests by hand, one `page.click()` at a time, and losing time every time a class name changes, a recorded plain-English test is a meaningfully lower-maintenance artifact. It reads clearly enough that a non-engineer on your QA team can review it and suggest a missing Verify step. It survives the kind of frontend refactor that breaks a locator-based test outright, because the agent replaying it is matching intent and visible text, not a brittle selector path. For teams already comfortable maintaining Playwright specs directly, `browserbash import` runs the opposite direction, converting existing Playwright specs into this same plain-English format, so recording and importing meet in the middle at the same `*_test.md` file whichever direction you came from.

## FAQ

### Does browserbash record work with every website?

It works with standard HTML forms, links, and buttons on any site you can load in Chromium, including single-page apps built with common frameworks. Pages that rely heavily on non-standard custom elements or canvas-based UI (drawing tools, some data grids) may produce vaguer step descriptions that need more manual cleanup, since the recorder relies on visible text and accessible roles to describe what you clicked.

### Is my password ever written to the generated test file?

No. The recorder detects `type="password"` fields and captures only a secret marker from the page, never the characters you type. The generated step uses a `{{password}}` variable placeholder, and the real value lives in your local variables file or environment, the same pattern BrowserBash uses for every other secret in a test.

### Can I edit the generated test file after recording?

Yes, and you should. The file is a normal `*_test.md` file with no special "recorded" marker or lock. Open it in any editor, prune extra steps, add Verify assertions the recorder could not infer, rename variables, and add `@import` composition or `version: 2` API steps exactly as you would in a hand-written test.

### How is a recorded test different from a Playwright codegen script?

A Playwright codegen script is a program that replays exact CSS or XPath selectors, and breaks when the underlying markup changes even if the page looks identical to a user. A BrowserBash recorded test is a plain-English `*_test.md` file that an AI agent interprets step by step at run time, matching visible text and roles rather than brittle selectors, so it tends to survive markup refactors that would break a locator-based script outright.

Recording a flow once beats typing every step by hand, and it is still free. Install the CLI with `npm install -g browserbash-cli`, point `browserbash record` at your app, and click through the path you want covered. An account is entirely optional; you can [sign up](https://browserbash.com/sign-up) later if you want the free cloud dashboard, but everything in this tutorial runs locally without one.
