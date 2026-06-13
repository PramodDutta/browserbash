---
title: Form Testing Automation: Inputs, Radios, Checkboxes in Plain English
description: "Form testing automation in plain English: drive inputs, radios, checkboxes, and dropdowns in a real browser with BrowserBash. No selectors needed."
date: 2026-06-13
category: use-case
---

Forms are where your application meets reality, and they are where automated tests go to die. A single signup or settings page can carry a dozen text inputs, a cluster of radio buttons, a stack of checkboxes, two or three dropdowns, a date field, and a submit button that only enables once the right combination is set. Every one of those controls is a separate selector, a separate wait, and a separate chance for a redesign to turn your suite red for reasons that have nothing to do with whether the form actually works. This article is a practical guide to **form testing automation** done a different way: you write what a person would do — type this, choose that option, check these boxes, submit — in plain English, and an AI agent drives a real Chrome browser to carry it out and return a pass/fail verdict with structured results. The tool is [BrowserBash](https://browserbash.com), a free, open-source (Apache-2.0) command-line tool, and every command below is real and runnable.

The shift is small to describe and large in consequence. Instead of writing code that translates "select the second shipping option and accept the terms" into a chain of `findElement` calls, `.check()`, `.selectByVisibleText()`, and explicit waits, you write that sentence. The agent reads the live page, finds the radio group and the checkbox and the submit button the way a human would, and acts. When a redesign renames an input's `id` or reshuffles a fieldset next sprint, the test does not notice, because it was never pinned to the markup in the first place.

## Why form controls break selector-based tests

It is worth being precise about *why* forms are the worst-case scenario for traditional automation, because that is exactly where the plain-English approach earns its keep.

Form controls are heterogeneous in a way that other UI is not. A button is a button, but "set this field" means six different mechanics depending on the control. A text input takes typed characters. A native `<select>` wants `selectByVisibleText` or an option value. A custom dropdown built from `<div>`s wants a click to open, a scan of a floating list, and a click on the right item. A radio group requires clicking exactly one option and trusting the others deselect. A checkbox toggles, so "check it" is only correct if it was unchecked to begin with — and an idempotent "ensure it is checked" is different code again. A real form mixes all of these on one screen, and your selector script needs a bespoke incantation for each.

Forms are also stateful and conditional. The shipping section appears only after you pick "deliver." The "other" text box unlocks only when you select the "Other" radio. The submit button stays disabled until a required checkbox is ticked. A coupon field slides in after you click "Have a code?" Each conditional path is another branch your locator logic has to anticipate and another wait you have to tune to the millisecond, or the test flakes.

And forms churn. Signup, checkout, onboarding, and settings are among the most-edited screens in any product, perpetually reworked by growth and design teams. The *experience* can be stable while the markup underneath shifts constantly — a renamed class here, a new wrapper `<div>` there, a field reordered for a layout test. Selector scripts are bolted to that markup, not to the experience, so they break on cosmetic change. The result is a suite that is most expensive to maintain precisely where coverage matters most. Plain-English form testing inverts that: because the agent re-reads the rendered page on every run and reasons about intent, the renamed input or the relocated checkbox usually costs nothing.

## What "form testing in plain English" actually means here

"AI testing" gets thrown around loosely, so let's be exact about what BrowserBash does with a form. A test here is a sequence of plain-English instructions an agent reads, plans against the actual rendered page, and executes one step at a time in a real browser. You will use two shapes:

- A **one-off objective** passed to `browserbash run "..."` — ideal for a quick check or a single CI verification step.
- A **committable markdown test** (a `*_test.md` file) where each list item is one step — the format for tests you keep, version, and review in pull requests.

Under the hood, BrowserBash ships two engines. The default is **stagehand**, the MIT-licensed AI browser-automation engine from Browserbase, built around resilient, self-healing actions. The second is **builtin**, an in-repo Anthropic tool-use loop driving Playwright that additionally captures a Playwright trace when you record. You rarely choose engines by hand; for local runs the default is what you want. Either way the defining property holds: the agent observes the page fresh on every step, so your test describes the form, not its DOM. That single property — intent over structure — is why a plain-English form test survives the UI churn that shatters a selector script, and why it reads like documentation a product manager can review.

## Install and run your first form test in five minutes

Install the CLI globally from npm:

```bash
npm install -g browserbash-cli
```

You need a model to drive the agent. BrowserBash is **Ollama-first**: it auto-detects a local [Ollama](https://ollama.com) install and uses it for free, with no API keys and nothing leaving your machine. If you have Ollama, pull a capable model:

```bash
ollama pull qwen3
```

A note from experience: small models in the 8B-and-under range tend to wander on forms with many controls, because each control is a decision. A Qwen3 or Llama 3.3 70B-class model is the reliable sweet spot. If you would rather not run a local model, BrowserBash also auto-detects an Anthropic key, then falls back to OpenRouter — which includes genuinely free hosted models such as `openai/gpt-oss-120b:free`. The resolution order is Ollama, then Anthropic, then OpenRouter, so you can be running in minutes on whatever you already have.

Now exercise a real form control as a single sentence. This one is fully runnable as printed, because it targets a stable public practice page — the checkboxes demo on The Internet:

```bash
browserbash run "Open https://the-internet.herokuapp.com/checkboxes, check the first checkbox, uncheck the second checkbox, and verify the first checkbox is checked and the second is not"
```

That is a complete checkbox test: it navigates, sets two controls to a known state, and asserts the result. A Chrome window opens, the agent reads the page, finds the two checkboxes — the first starts unchecked, the second starts checked — toggles each to the target state, and verifies. The `verify` clause is the assertion: if either box is in the wrong state, the run fails. You wrote no selectors, no `.check()`, no waits.

When you are ready to run without a visible window — in CI, or just in the background — add `--headless`:

```bash
browserbash run "Open https://the-internet.herokuapp.com/checkboxes, check the first checkbox, uncheck the second checkbox, and verify the first checkbox is checked and the second is not" --headless
```

Dropdowns are the other control most tutorials fumble, and the agent handles them the same way a person does — by reading the visible options rather than guessing at an option value. Here is a runnable native-`<select>` example:

```bash
browserbash run "Open https://the-internet.herokuapp.com/dropdown, select 'Option 2' from the dropdown, and verify 'Option 2' is the selected value" --headless
```

Notice what you did *not* do in either case: you did not say "the element with `id` `checkbox-1`," you did not call `selectByVisibleText`, and you did not distinguish a native `<select>` from a custom one. You described the control by what the user sees — "the first checkbox," "'Option 2' from the dropdown" — and the agent figured out the mechanics. That is the whole game.

## Driving every kind of control with words

A real form is more than one control, so it helps to see how each kind is phrased. The pattern is always the same: describe the control by its visible label and the outcome you want, not the mechanism. These are illustrative steps for a typical registration form (point the objective at your own staging URL):

- **Text and email inputs** — "Fill the email field with `qa@example.com`," "Type `Bo Basher` into the full name field." The agent locates the field by its label or placeholder and types the literal value.
- **Password inputs** — phrase exactly like a text field, but pass the value through a secret variable so it never lands in a log (covered below): "Fill the password field with `{{password}}`."
- **Radio buttons** — "Select the 'Express shipping' option," "Choose 'Female' for gender." Because a radio group is single-select, naming one option is enough; the agent does not need to be told the others deselect.
- **Checkboxes** — "Check the 'I agree to the terms' box," "Uncheck 'Send me marketing emails.'" State the desired end state and the agent toggles toward it; you are describing where the control should end up, which is more robust than a blind click.
- **Dropdowns and comboboxes** — "Select 'United States' from the country dropdown." This wording works whether the control is a native `<select>` or a custom widget, because the agent reads the rendered options either way.
- **Sliders, date pickers, and multi-selects** — "Set the quantity slider to 3," "Pick June 15, 2026 in the start-date field," "In the skills list, select 'Testing' and 'Automation.'" Describe the target value; the agent works out the interaction.

The single most valuable habit across all of these is to **describe what a user sees, not what the DOM contains.** Say "Select the 'Express shipping' option," not "Click the input with `value='express'`." Staying above the markup is the entire point of the approach; the moment you reference an `id` or a CSS path, you have thrown away the resilience you came for and reintroduced the exact thing that goes stale.

## Don't just set the field — assert what it produced

The most common mistake in form testing is stopping at "fill it in" and never checking what filling it in *did*. A form that silently swallows a value, or accepts an invalid email, or leaves the submit button disabled, can still "complete" every step you wrote. The fix is to make the outcome an explicit `verify` the agent can check.

There are three outcomes worth asserting on almost every form. The first is **the success state after submit** — the confirmation message, the redirect, the new record. The second is **field-level validation**: that a required field left blank, or a malformed email, produces the error it should. The third is **conditional UI**: that selecting a radio reveals the dependent field, or that ticking the required checkbox enables the submit button. All three are one sentence each.

Here is a runnable end-to-end example on a public multi-field form — Selenium's the-internet login page is a tiny form with a username, a password, and a submit button, and it asserts the result:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, fill the username field with 'tomsmith', fill the password field with 'SuperSecretPassword!', click the Login button, and verify the page says 'You logged into a secure area'" --headless
```

And here is the negative path — proving the form *rejects* bad input, which breaks silently more often than you would think:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, fill the username field with 'tomsmith', fill the password field with 'wrong-password', click the Login button, and verify an error message about invalid credentials appears" --headless
```

Two sentences, two of the three outcomes covered, zero selectors. The `verify` clause is what turns "the agent clicked submit" into "submission produced the right result," and it is the difference between a form test that protects you and one that just exercises the UI. There is a fuller treatment of writing assertions that the agent reads correctly in the [learn section](https://browserbash.com/learn).

## Keeping secrets out of form-test logs

Forms collect sensitive data — passwords, card numbers, personal details — and the moment you write one of those into an objective string, it lands in your terminal scrollback, your shell history, and any log your CI retains, because objective text is logged verbatim so the tool can tell you what it did. BrowserBash's answer is a strict rule and a mechanism to enforce it. The rule: **never inline a secret in the objective — always pass it through a `{{variable}}`.** The mechanism: variables can be marked secret, and secret values are masked as `*****` in every log line and every structured event.

You write `{{placeholders}}` in the objective and supply values as JSON; anything sensitive gets the `{"value": "...", "secret": true}` shape:

```bash
browserbash run "Open {{base_url}}/register, fill the email field with {{email}}, fill the password field with {{password}}, check the 'I agree to the terms' box, submit, and verify a welcome message appears" \
  --headless \
  --variables '{"base_url":"https://staging.example.com","email":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

Because the password carries `"secret": true`, what the agent *does* is real — it types the actual value into the field — but what the log *shows* is the mask. The line that would have leaked the credential reads instead:

```text
Type ***** into the password field
```

Non-secret values like `base_url` and `email` stay readable on purpose, so you can still tell which environment a run hit, while the one value that must never surface stays hidden.

Variables load from four places, and the precedence order is the whole reason this is safe across a team and a pipeline. From lowest priority to highest: the global directory `~/.browserbash/variables/*.json` (per-workstation, never committed); the project directory `./.browserbash/variables/*.json` (committed, reviewable defaults); `--variables-file <path>` (a file you point at explicitly); and inline `--variables '<json>'` (wins over everything). A sensible split falls right out of that: put non-secret form defaults like `base_url` in the project directory where reviewers see them, keep each engineer's personal staging credential in the global directory on their own machine, and in CI write an ephemeral file from your secret store and pass it with `--variables-file`. Prefer the file over inline `--variables` in CI specifically because some runners echo the command line into their logs, and a secret in a flag would sail straight past the masking — a file sourced from the secret store never appears on a command line at all.

## Make it committable: a reusable form markdown test

A one-line objective is perfect for a quick check, but the form test you actually depend on belongs in version control where it can be reviewed, diffed, and reused. BrowserBash's format for that is the markdown test: a file ending in `_test.md` where each list item is one step, and `{{variables}}` work exactly as they do on the command line.

Here is a `register_test.md` that drives the full spread of controls — inputs, a radio group, checkboxes, and a dropdown — and asserts the result:

```markdown
# Registration form

- Open {{base_url}}/register
- Fill the full name field with 'Bo Basher'
- Fill the email field with {{email}}
- Fill the password field with {{password}}
- Select the 'Developer' option for role
- Choose 'United States' from the country dropdown
- Check the 'I agree to the terms' box
- Uncheck the 'Subscribe to marketing emails' box
- Click the Create account button
- Verify a welcome message for 'Bo Basher' is shown
- Store the new account's confirmation number as 'confirmation_number'
```

Run it:

```bash
browserbash testmd run register_test.md --headless
```

After the run, BrowserBash writes a `Result.md` next to the file — the verdict, what happened at each step, and any values the test stored (like `confirmation_number` above). That report is readable by anyone: manual testers attach it to bug reports, and reviewers see test *changes* as plain-English diffs in a pull request. A form-test review stops being "trust me, the locators are right" and becomes a conversation about what the form should do. Because the password came through a secret variable, the `Result.md` shows `*****` wherever the credential was used, so the artifact is safe to attach to a ticket.

The real payoff arrives when you have several forms that share steps. Many of your form tests start by logging in; rather than copy those steps into every file, put them in a helper and splice them in with `@import`:

```markdown
# Update billing details (authenticated)

@import ./helpers/login.md

- Open {{base_url}}/settings/billing
- Fill the card number field with {{card_number}}
- Select 'Visa' as the card type
- Check the 'Set as default payment method' box
- Click Save
- Verify the page shows 'Billing details updated'
```

Imported steps are inserted in place, so every test authenticates identically and a login change is a one-file fix instead of a many-file hunt. The `{{placeholders}}` resolve from the JSON files in `./.browserbash/variables/` or `~/.browserbash/variables/`, so dev and CI target different environments without touching the test. There is a deeper write-up of the `@import` and variables pattern over on the [BrowserBash blog](https://browserbash.com/blog).

## Running form tests in CI without parsing prose

A form test you cannot run automatically is a demo, not a safety net. BrowserBash is built to gate merges, and it does so without making your pipeline read prose. Two facts make the integration clean.

First, **the exit code is the verdict**: `0` passed, `1` failed, `2` error, `3` timeout. Your CI step succeeds or fails on that code alone — no log scraping. Second, the `--agent` flag switches stdout to **NDJSON**: one JSON object per line, with a stable schema, while everything human-readable goes to stderr. Step events stream as they happen, and the final line is always a single `run_end` event carrying the status, a summary, and every value the test stored. Because the schema is stable, AI coding agents can call BrowserBash and read the `run_end` event to verify their own form changes in a real browser, rather than guessing from output.

Here is a CI-shaped run that pulls secrets from a file written out of the secret store, masks them in every emitted line, and bounds the run with a timeout:

```bash
# Write the secret file from the CI secret store, then run headless with NDJSON
printf '%s' "$FORM_VARS" > form.vars.json
browserbash testmd run register_test.md --agent --headless --timeout 180 \
  --variables-file form.vars.json > form.ndjson
```

A minimal GitHub Actions job wires that together — the secret is injected as an environment variable and only ever lands in a file, never on the command line:

```yaml
- run: npm install -g browserbash-cli
- run: |
    printf '%s' "$FORM_VARS" > form.vars.json
    browserbash testmd run register_test.md --agent --headless --timeout 180 \
      --variables-file form.vars.json > form.ndjson
  env:
    FORM_VARS: ${{ secrets.FORM_VARS_JSON }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The exit code fails the job exactly when the form test fails, `--timeout` caps any run that would otherwise hang on a stuck async validation, and any secret appears as `*****` in `form.ndjson` and in the job log. The file `form.vars.json` exists only for the duration of the job. The [learn section](https://browserbash.com/learn) has the full NDJSON event schema and the `jq` patterns for reading `run_end` if you want to extract stored values like `confirmation_number` downstream.

## Capturing evidence when a form test fails

When a form test fails — a validation error you did not expect, a submit button that stayed disabled, a dropdown that never opened — a verdict alone is rarely enough to diagnose it. Turn on recording. The `--record` flag captures a screenshot and a session video (a `.webm` stitched with ffmpeg) on any engine; the builtin engine additionally captures a Playwright trace.

```bash
browserbash testmd run register_test.md --record --headless
```

Everything stays on your machine by default — nothing is uploaded unless you ask. There is a free, private local dashboard for browsing runs and replays:

```bash
browserbash dashboard
```

And when you want shareable run history with per-run replay — handy for showing a designer exactly which field validation broke — create a free account, connect once, and push a run to the cloud dashboard with `--upload`:

```bash
browserbash connect --key bb_your_key_here
browserbash testmd run register_test.md --record --upload --headless
```

Cloud runs on the free tier are retained for 15 days. The privacy default is worth underlining: `--upload` is opt-in, so a recording of a form full of personal data never leaves your laptop unless you explicitly send it, and combined with secret masking, even an uploaded recording's logs show `*****` rather than the credential.

## Running form tests on a real cross-browser grid

Forms are exactly where browser quirks bite — date inputs render differently, native `<select>` styling diverges, autofill behaves its own way per engine — so you want to verify them across browsers. BrowserBash treats *where the browser runs* as a runtime decision, controlled by `--provider`, with no test edits:

```bash
# Local Chrome (default) — watch the form fill during development
browserbash testmd run register_test.md

# A cloud grid in CI — same file, one flag
browserbash testmd run register_test.md --provider lambdatest --headless
```

The providers are `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. One behavior to know: the default Stagehand engine cannot attach to LambdaTest or BrowserStack sessions, so when you pass one of those providers BrowserBash automatically switches to its builtin engine, which speaks the Anthropic API — meaning those grid runs need `ANTHROPIC_API_KEY` set (or `ANTHROPIC_BASE_URL` pointed at an Anthropic-compatible gateway). You never pass an engine flag yourself; the switch is automatic, and the same `register_test.md` — secret variables and all — runs unchanged across every provider.

## A repeatable form-testing workflow

Putting it together, here is the loop that works in practice. Start by exercising one control as a single `browserbash run "..."` objective — a checkbox, a dropdown, a radio — and watch it execute locally with a visible browser so you can see where the agent's understanding diverges from yours. Phrase each control by its visible label and the outcome you want, mark any secret with `{"secret": true}`, and end with a specific `verify` so you are testing what the field *produced*, not just that it was touched. Add a negative-path objective so invalid input is proven to be rejected. Move the steps into a `*_test.md` file, factor shared setup like login into an `@import` helper, and let stored values flow out via `store ... as`. Wire it into CI with `--agent --headless --timeout` and a `--variables-file` sourced from your secret store, letting the exit code gate the merge while secrets stay masked. Turn on `--record` for the failures you need to diagnose, and reach for `--provider` when you need the form verified on a grid. Each stage is small, no secret touches a command line, and nothing you wrote in the first step is thrown away in the last.

## FAQ

### How do I test checkboxes and radio buttons without writing selectors?

Describe the control by its visible label and the state you want, and let the agent do the mechanics. For a checkbox, write "Check the 'I agree to the terms' box" or "Uncheck 'Send me marketing emails'" — stating the desired end state is more robust than a blind click. For a radio group, naming one option is enough, because the group is single-select: "Select the 'Express shipping' option." The agent reads the live page, finds the control, and toggles it without any `id`, class, or `.check()` call from you.

### How does BrowserBash handle dropdowns and custom select widgets?

The same plain-English phrasing works for both native `<select>` elements and custom dropdowns built from `<div>`s, because the agent reads the rendered options rather than guessing at an option value. You write "Select 'United States' from the country dropdown" and the agent opens the control if needed, scans the visible choices, and clicks the right one. You do not call `selectByVisibleText` or distinguish native from custom controls in your step.

### How do I keep passwords and card numbers out of my form-test logs?

Pass the sensitive value through a `{{variable}}` and mark it as `{"value":"...","secret":true}` in your `--variables` JSON or variables file. BrowserBash substitutes the real value at run time so the agent actually fills the field, but masks it as `*****` in every log line and in the NDJSON `run_end` event. The one rule to follow is never to type the secret directly into the objective string, since objective text is logged verbatim; in CI, prefer `--variables-file` over inline `--variables` so the value never appears on a command line a runner might echo.

### Can I assert that a form rejects invalid input, not just that it accepts good input?

Yes, and you should, because validation breaks silently more often than the happy path. Write a second objective or step that supplies deliberately invalid input — a malformed email, a blank required field, a wrong password — and assert the expected error with a `verify` clause, for example "fill the password field with 'wrong-password', click Login, and verify an error message about invalid credentials appears." The `verify` turns the expected rejection into a pass condition, so the test fails loudly if a regression ever lets bad input through.

---

Ready to make your most fragile form test resilient and your secrets invisible to the logs? Install with `npm install -g browserbash-cli` from the [npm package page](https://www.npmjs.com/package/browserbash-cli), then [create a free account](https://browserbash.com/sign-up) when you want shareable run history and cloud replays. BrowserBash is free and open source under Apache-2.0 — point it at your staging signup form, describe the controls in plain English, and run it once.
