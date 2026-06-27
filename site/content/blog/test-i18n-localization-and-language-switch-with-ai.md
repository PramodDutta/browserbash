---
title: Testing i18n Localization and Language Switching With AI
description: "Test localization i18n with AI: switch locale, verify translated strings render, and check RTL layouts using plain-English tests across many languages."
date: 2026-06-27
category: testing
---

To test localization and i18n with AI, you drive the site to switch its language, then assert in plain English that the expected translated strings render and that right-to-left layouts mirror correctly. With [BrowserBash](https://browserbash.com), a free open-source (Apache-2.0) natural-language testing CLI by The Testing Academy, you write the locale switch and the expected text as a sentence, run the same test across every language with `{{variables}}`, and let an AI agent read the rendered page to confirm the translation is actually there. You install it with `npm install -g browserbash-cli`, write a short markdown test, and run it once per locale. This post shows the exact commands, a data-driven multi-locale pattern, how RTL checks work, and the honest limits of catching untranslated strings this way.

The reason this matters: traditional i18n tests pin a CSS selector to a node and then hardcode the expected string for one language. The moment a translator reorders a sentence, a designer renames a class, or you add Arabic, the selector layer cracks. When the test is intent instead of selectors, "run it in German, then Japanese, then Arabic" stops being three test files and becomes one file run three times with a different variable.

## Why localization testing is hard, and where AI helps

Localization testing has three jobs that are easy to describe and tedious to automate. First, you have to get the site into the target locale, which can mean a language switcher in the header, a `?lang=` query parameter, a cookie, or a separate URL path like `/de/`. Second, you have to confirm the translated strings actually appear on the page, not just that a translation file exists somewhere in the repo. Third, for right-to-left languages such as Arabic, Hebrew, Farsi, and Urdu, you have to confirm the layout itself mirrors: text aligns right, the reading direction flips, and components like breadcrumbs and carousels reverse.

Selector-based suites struggle with all three. A language switcher often has different DOM in different locales. The translated string you want to assert on is, by definition, different per language, so you end up with a giant lookup table of expected values keyed by locale, maintained by hand. And RTL is the worst of the three, because direction is a layout property that a class-name assertion barely touches.

An AI agent changes the shape of the problem. BrowserBash describes *what* should happen ("switch the language to French and confirm the navigation reads Accueil") and the agent figures out *how* on the live page. It finds the language switcher through the accessibility tree (roles, accessible names, and states) rather than a brittle CSS class, so a redesigned switcher does not break the test. And because the assertion is a plain-English claim about what the reader should see, you can swap the expected string per locale with a variable instead of a code branch. To be clear about what BrowserBash is not: it re-derives elements from the live page on every run, but it does not patch or keep a saved selector script for you. There is no cached locator that silently drifts. Each run reads the page as it is right then. You can read more about how the agent turns a sentence into a pass or fail verdict in [how natural-language assertions work](https://browserbash.com/blog/natural-language-assertions-how-they-work).

## Install and a first locale switch

BrowserBash ships on npm and installs globally:

```bash
npm install -g browserbash-cli
browserbash --version
```

The fastest way to feel the workflow is a single ad-hoc run. Point an objective at your site and describe both the switch and the expected result in one sentence:

```bash
browserbash run "Go to https://example.com, open the language menu, \
  switch the language to French, and confirm the main navigation \
  shows 'Accueil' and 'Connexion'"
```

The agent loads the page, locates the language menu by its role and accessible name, selects French, waits for the page to settle, then reads the rendered navigation and checks for the two French strings. If they are present, the verdict is `passed`. If the switcher is missing, the menu never opens, or the navigation still reads English, the verdict is `failed`, and the result explains what the agent actually saw.

Two things are worth noticing. There is no selector anywhere in that command, and there is no manual wait. BrowserBash relies on Playwright's built-in auto-wait with a 15-second ceiling, so a translation that loads a beat late after an async locale fetch is handled without you sprinkling `sleep` calls. That late-element handling is the same mechanism described in the [cross-browser testing guide](https://browserbash.com/blog/cross-browser-testing-with-ai), and it matters more for i18n than most flows, because switching locale frequently triggers a re-render or a network round trip.

## A reusable markdown test for one locale

Ad-hoc runs are great for exploration. For something you keep, write a markdown test. BrowserBash tests are `*_test.md` files: a `#` title, then `-` or numbered steps, with `{{variables}}` for the values that change per environment or per locale.

```markdown
# Switch to French and verify navigation

1. Open {{base_url}}
2. Open the language switcher in the page header
3. Select the language "{{language_name}}"
4. Confirm the page language is now {{lang_code}}
5. Confirm the main navigation contains the text "{{nav_home}}"
6. Confirm the main navigation contains the text "{{nav_login}}"
```

Run it with the per-locale values supplied on the command line:

```bash
browserbash testmd run ./locale_switch_test.md \
  --var base_url=https://example.com \
  --var language_name=Français \
  --var lang_code=fr \
  --var nav_home=Accueil \
  --var nav_login=Connexion
```

The structure is the asset. The steps never change between languages. Only the variables move. Step 4, "confirm the page language is now fr," asks the agent to check the document language, which most sites expose through the `lang` attribute on the `<html>` element and which the agent can read from the page state. Steps 5 and 6 are the substance: they assert that the actual translated strings render, which is the check a translation-file-exists test can never make. For a deeper look at how variables and masking work, see the [variables and secrets tutorial](https://browserbash.com/blog/browserbash-variables-and-secrets-tutorial).

## Data-driven runs across every locale

The payoff arrives when you run that one file across your whole language set. Because each locale is just a set of variables, a shell loop fans the identical test across all of them. Define the matrix once and iterate:

```bash
#!/usr/bin/env bash
# locales.tsv columns: lang_name  lang_code  nav_home   nav_login
while IFS=$'\t' read -r name code home login; do
  echo "=== Testing locale: $code ==="
  browserbash testmd run ./locale_switch_test.md \
    --var base_url=https://example.com \
    --var language_name="$name" \
    --var lang_code="$code" \
    --var nav_home="$home" \
    --var nav_login="$login" \
    --agent --headless --timeout 120
done < locales.tsv
```

A `locales.tsv` for that loop might read:

```
Français	fr	Accueil	Connexion
Deutsch	de	Startseite	Anmelden
日本語	ja	ホーム	ログイン
Español	es	Inicio	Iniciar sesión
العربية	ar	الرئيسية	تسجيل الدخول
```

One markdown file, one loop, every language covered. Adding a locale is one new row, not a new test. The `--agent` flag makes each run emit NDJSON, and `--headless` keeps it fast for CI. Exit codes do the aggregation for you: `0` is pass, `1` is a failed assertion, `2` is an error, and `3` is a timeout. A CI orchestrator reads those codes per locale and turns the build red on the exact language that regressed, without parsing prose. If you would rather keep the expected strings in the file itself instead of on the command line, `@import` composition lets you split a shared setup test from the per-locale assertions, which keeps each file small and readable as [living documentation](https://browserbash.com/blog/markdown-tests-living-documentation).

## Checking RTL layout, not just translated text

Right-to-left languages need a different kind of assertion, because the bug you are hunting is rarely a missing string. It is a layout that did not mirror. The text translated fine, but it still hugs the left edge, or a back arrow still points the wrong way, or a progress stepper runs in the wrong order. These are claims about visual direction, and you can phrase them in plain English for the agent to evaluate against the rendered page.

```markdown
# Arabic RTL layout check

1. Open {{base_url}}
2. Switch the language to "العربية"
3. Confirm the page direction is right-to-left
4. Confirm the main heading text is aligned to the right side of the page
5. Confirm the navigation menu items read from right to left
6. Confirm the page heading shows the Arabic text "{{heading_ar}}"
```

Step 3 maps cleanly onto something deterministic: the `dir="rtl"` attribute on the document or a container, which the agent can read from page state. That is the most reliable RTL check you can write, so lead with it. Steps 4 and 5 are softer. The agent reasons about alignment and order from the rendered layout and the accessibility tree, and these checks are genuinely useful for catching a container that forgot to flip, but they are judgment calls, not pixel measurements. Treat them as a strong smoke signal that something mirrored, not as a guarantee that every element is perfectly placed. Step 6 brings it back to solid ground by asserting on a known translated string.

A practical tip: keep the deterministic checks (direction attribute, specific translated strings) as your gating assertions and the layout-reasoning checks as supplementary. That way a real failure is unambiguous and a soft check that the agent reads conservatively does not flap your build.

## Choosing a model for multilingual runs

The agent is powered by a language model, and the model choice matters more for i18n than for English-only flows, because the agent has to read and reason about non-Latin scripts, accented characters, and RTL text. BrowserBash defaults to `auto`, which resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, where free models exist. Running a local model means nothing leaves your machine, which is appealing when your staging content is under embargo.

The honest caveat: small local models (roughly 8B parameters and under) get flaky on long multilingual flows and can misread or hallucinate translated strings, especially in scripts they were lightly trained on. For a serious locale sweep, prefer a 70B-class local model such as Qwen3 or Llama 3.3, or a hosted model for the hardest flows. If you are validating that a specific Japanese or Arabic string rendered exactly, the model's grasp of that script is the limiting factor, so test your model choice on one tricky locale before trusting it across thirty. You can see the full provider and model story on the [features page](https://browserbash.com/features).

## Wiring it into CI

A multi-locale sweep belongs in the pipeline, and BrowserBash was built for that. Run each locale headless with the agent flag, capture artifacts on the locales you care about, and let exit codes drive the build:

```bash
browserbash testmd run ./locale_switch_test.md \
  --var base_url=$STAGING_URL \
  --var language_name=العربية \
  --var lang_code=ar \
  --var nav_home=الرئيسية \
  --var nav_login="تسجيل الدخول" \
  --agent --headless --record --timeout 150
```

The `--record` flag captures a `.webm` video and screenshots, which is invaluable for RTL because a reviewer can glance at the recording and immediately see whether the layout mirrored. Every run also writes a `Result.md` you can attach to the build. If you want a shareable view, add `--upload` to opt into the free cloud dashboard, where runs are kept for fifteen days, or run `browserbash dashboard` to keep everything local. For RTL especially, the recorded video is often the fastest way to confirm a regression, because a one-line failure message cannot show you that the carousel arrows pointed the wrong way.

## Honest limits: where this struggles

This approach is strong, but it is not magic, and localization is a domain where being honest about gaps saves you from false confidence.

It does not catch every untranslated string. BrowserBash asserts on the strings you name. If you ask it to confirm the navigation reads `Accueil` and it does, the test passes even if a footer link three sections down is still in English. The agent verifies the claims you wrote, not the entire page. Catching every stray untranslated string is a different problem, closer to a full-page extraction and dictionary comparison, and a per-assertion test will not do it for you. The practical mitigation is to assert on the strings that matter most per page and accept that a handful of low-traffic strings can slip through.

Pseudolocalization and truncation are hard. A common i18n bug is a German string overflowing a button that fit the English one, or a layout breaking under pseudolocalized text. The agent can sometimes notice obviously broken layout, but it does not measure pixel overflow or clipping reliably, so do not lean on it as your truncation gate. A screenshot diff or a dedicated visual tool is better for that specific class of bug.

RTL layout checks are reasoning, not measurement. As covered above, the `dir` attribute and specific strings are solid, but "is this aligned correctly" is the agent's judgment about the rendered page, not a coordinate assertion. It is a good smoke check and a poor pixel-perfect oracle.

Exact-string assertions on rare scripts depend on the model. A small model may misread a Thai or Arabic string and either pass something wrong or fail something correct. This is a model-capability limit, not a BrowserBash bug, and the fix is a larger or hosted model for those locales. Any performance numbers here would be illustrative only; benchmark on your own content before you trust a model on a script.

Compared with a hand-written Playwright or Selenium suite, the tradeoff is clear and fair. A coded suite with explicit selectors and a pixel-diff library can make stronger guarantees about exact placement and exhaustive string coverage, at the cost of significant maintenance every time the design or the translations change. BrowserBash trades some of that exactness for tests that survive redesigns and read like acceptance criteria. For most teams the right answer is both: BrowserBash for the broad, readable, fast-moving locale sweep, and a targeted visual-diff tool for the handful of pages where pixel-exact layout is contractual.

## FAQ

### How do I test that a site switches languages correctly with AI?

Write a plain-English objective or a `*_test.md` test that opens the page, performs the locale switch (menu, query parameter, or path), and then asserts the expected translated strings render. Run `browserbash run "switch to French and confirm the nav reads Accueil"` for a quick check, or `browserbash testmd run ./locale_switch_test.md` with per-locale `{{variables}}` for something repeatable. The agent finds the switcher through the accessibility tree, so you never write a selector.

### Can BrowserBash verify right-to-left (RTL) layouts for Arabic or Hebrew?

Partly, and you should split the checks. The reliable one is asserting the document direction is right-to-left, which maps to the `dir="rtl"` attribute the agent reads from page state, plus asserting that specific Arabic or Hebrew strings render. The softer checks, like "is the heading aligned right" or "do the menu items read right to left," are the agent's reasoning about the rendered layout, useful as a smoke signal but not a pixel measurement. Pair them with `--record` so a reviewer can eyeball the video.

### How do I run the same test across many locales without copying files?

Keep one markdown test with `{{variables}}` for the language name, code, and expected strings, then loop a shell script over a list of locales, passing each row's values with `--var`. The file never changes; only the variables move. Each run emits NDJSON under `--agent` and returns an exit code (`0` pass, `1` fail, `2` error, `3` timeout), so CI can flag the exact language that regressed.

### Will it catch a string that was never translated?

Only if you assert on it. BrowserBash checks the claims you write, so it confirms the strings you name are present and translated, but it will not flag an untranslated footer link you never mentioned. Full-page untranslated-string detection is a different job, closer to extracting all text and comparing against a dictionary. Assert on the strings that matter most per page, and treat exhaustive coverage as a separate tool's responsibility.

## Try it free

Testing localization and i18n with AI removes the most brittle part of the job: a selector-and-lookup-table layer that broke every time a translator or designer touched the page. With BrowserBash you write the locale switch and the expected translated strings as plain English, run one markdown file across every language with `{{variables}}`, and check RTL direction and specific strings reliably while keeping honest about what layout reasoning can and cannot prove. It is free and open source under Apache-2.0, Ollama-first so you can start with zero API keys, and ready for CI with NDJSON and clean exit codes. Install it with `npm install -g browserbash-cli`, write your first `*_test.md`, and fan it across your locales. Start at [https://browserbash.com/learn](https://browserbash.com/learn).
