---
title: Internationalization and Locale Testing With AI
description: "Internationalization locale testing guide for AI browser tests, translated strings, RTL layouts, currency formats, and viewport checks."
date: 2026-08-31
category: guide
---
internationalization locale testing is not just checking that a French label appears on a page. It is proving that translated journeys, right-to-left layouts, currency formatting, dates, addresses, and viewport constraints still let users complete real work. AI helps because it can navigate a real browser at the intent level, but the most important locale claims should still be verified deterministically. BrowserBash gives you plain-English journeys plus Verify checks, API setup, variables, and viewport runs for that balance.

## What internationalization locale testing should actually cover

internationalization locale testing should cover language, region, formatting, layout direction, and business behavior. A page can load the correct translation file and still fail because a German label wraps over a button, an Arabic layout places an icon in the wrong direction, a Japanese address form asks for the wrong fields, or a price uses the wrong currency symbol. The browser test has to act like a user in that locale.

AI helps when the flow is still recognizable by intent but the labels differ from the English baseline. A plain-English objective can say to open the French account settings, change the billing address, and verify the saved city. The agent can use page context, while deterministic Verify lines check the exact strings or stored values that matter.

Do not ask one locale test to prove every translation. Use focused journeys that represent revenue, activation, support, and account safety risk.

## BrowserBash tools for internationalization locale testing

BrowserBash is a free, open-source natural-language browser automation CLI from The Testing Academy, founded by Pramod Dutta and licensed under Apache-2.0. You install it with `npm install -g browserbash-cli` and run it with `browserbash`. The current version to write against is 1.5.1. Its positioning matters: it is the open-source validation layer for AI agents. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step, and the run returns a deterministic verdict plus structured results. It is not a selector framework, and it does not ask you to maintain page objects before you know whether a flow is worth automating.

The newer deterministic Verify assertions are the guardrail. In testmd v2, a `Verify` line that matches the grammar compiles to a real Playwright check for URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, or a stored value equals. That is not model judgment. A pass means the condition held in the browser, and a fail carries expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. Verify lines outside the grammar can still run, but they are marked `judged: true`, so you can separate deterministic checks from agent-judged observations.

Variables are especially useful for locale tests. A test can use `{{locale}}`, `{{currency}}`, `{{expectedCheckoutText}}`, or `{{country}}` without duplicating the whole flow. Secrets and secret-marked variables are masked in logs. Combine this with `--viewport` or `--matrix-viewport` to cover desktop and mobile layouts for the same translated journey.

## Viewport and locale examples

```bash
browserbash run "Open the German storefront with locale {{locale}}, add one product, and verify the cart total uses EUR formatting" --viewport 390x844 --agent

browserbash run-all tests/i18n --matrix-viewport 1280x720,390x844 --shard 1/2
```

The first command shows a single mobile run with a locale variable and agent output. The second command expands a locale folder across desktop and mobile viewports, with deterministic sharding if you split the suite. This is a practical pattern because many i18n bugs are viewport bugs: translated labels get longer, buttons wrap, menus clip, and right-to-left layouts expose spacing assumptions.

## Verify translated strings deterministically

For known copy, deterministic checks are better than model judgment. If the German checkout heading should say `Kasse`, Verify that exact text. If the Spanish button should be `Guardar`, Verify the named button. If the UI should open `/fr/factures`, Verify the URL contains the expected segment. This keeps internationalization locale testing from turning into a vague statement that the page looked localized.

```bash
cat > tests/locales_flow_test.md <<'EOF'
---
version: 2
auth: admin
---
POST https://api.example.com/locales with body {"name":"bb-{{RUN_ID}}"}
Expect status 201, store $.id as 'localesId'

Open https://app.example.com/locales/{{localesId}}
Verify text "Kasse" visible
EOF

browserbash run-test tests/locales_flow_test.md --agent
```

The API step can seed locale-specific data, such as an account, product, or address record. The UI step then verifies that the translated interface renders and the seeded record is visible. This avoids relying on whatever data happens to exist in a shared demo account.

## Right-to-left and layout risk

RTL testing needs more than text checks. Navigation order, icon direction, table alignment, side panels, carousels, and form labels can all break. BrowserBash can prove that the flow still completes and expected controls are visible. For strict layout symmetry, clipping, and spacing, add visual review or screenshot baselines. That division keeps BrowserBash in its functional lane while still giving the design team evidence for presentation defects.

A useful RTL smoke set usually includes sign in, primary navigation, search, a form submission, an empty state, and one data-dense view. Add mobile viewport coverage early because RTL plus narrow screens is where hidden overflow often appears.

## Currency, dates, and stored values

Locale testing often fails in the boring places: decimal separators, thousands grouping, date order, tax labels, postal codes, and currency conversions. If the backend returns a value, store it from an API step and Verify the UI representation when possible. If conversion rates are dynamic, avoid asserting a hard-coded number unless the test controls the rate. Assert the format and state you can actually own.

This is where API setup and UI verification work well together. Seed a product with a known price, open the storefront in a known locale, add the product, and Verify that the cart total uses the expected currency symbol or text. The agent drives the browser, but the critical business rule is explicit.

## When to choose AI for locale testing

Choose BrowserBash when the test is a user journey that benefits from intent-level navigation: checkout in German, profile update in Arabic, trial signup in Japanese, or invoice download in French. Choose lower-level unit or integration tests for translation key coverage, formatting libraries, and pure business logic. Choose visual regression when translated layouts must match approved baselines.

The model story is deliberately local-first. BrowserBash defaults to Ollama, so a team can start with free local models, no API keys, and no test prompt leaving the machine. Provider resolution then falls through to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and OpenRouter when you bring your own keys. For long, sensitive, or regulated flows, that default is useful. The honest caveat is that very small local models around 8B parameters and under can be flaky on long multi-step objectives. The sweet spot is usually a mid-size local model, such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model for hard flows.

The [learn section](https://browserbash.com/learn) and [tutorials](https://browserbash.com/tutorials) are a good starting point for building small flows before you expand locale matrices.

## Operational checklist

Keep locale test data explicit. Use fixture users per locale, seed records through APIs where possible, and avoid shared carts or accounts. Label results with viewport and locale so failures are searchable. Keep each objective short enough that a model can complete it reliably. Promote only the journeys that catch real product risk to scheduled monitors.

Monitor mode is intentionally quiet. `browserbash monitor <test|objective> --every 10m --notify <webhook>` runs on an interval and alerts only on pass-to-fail or fail-to-pass state changes. Slack incoming-webhook URLs get Slack formatting automatically, while other URLs receive the raw JSON payload. The replay cache makes a stable monitor cheap because a green run records its actions, and the next identical run can replay those actions with zero model calls unless the page changes.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for internationalization locale testing

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## FAQ

### What is internationalization locale testing?
It checks whether a product behaves correctly across languages, regions, writing directions, currencies, dates, and address formats. Good locale testing verifies behavior, not only whether a translation file exists.

### Can AI verify translated strings correctly?
AI can help navigate unfamiliar language flows, but critical translation checks should be deterministic. BrowserBash Verify steps can check visible text, headings, links, buttons, URLs, and stored values when the expected string is known.

### How should I test RTL layouts with BrowserBash?
Use a small set of high-risk journeys in RTL locales, combine desktop and mobile viewports, and verify functional state after navigation. Dedicated visual review or screenshot comparison may still be needed for strict alignment and clipping checks.

### Should locale tests use production data?
Usually no. Seed data with deterministic API steps or use safe fixture accounts, especially for currency, tax, and address scenarios. Production data can hide defects and create privacy risk.

Start locally with `npm install -g browserbash-cli`, then explore the optional [BrowserBash sign-up](https://browserbash.com/sign-up) path if you want the free cloud dashboard. An account is optional for local CLI validation, so you can try the workflow before connecting anything.
