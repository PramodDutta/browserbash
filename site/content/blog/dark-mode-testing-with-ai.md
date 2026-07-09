---
title: Dark Mode and Theme Testing With AI
description: "Dark mode testing automation guide for AI browser checks, theme toggles, persisted preferences, Verify assertions, and record evidence."
date: 2026-09-01
category: guide
---
dark mode testing automation is easy to underestimate because a theme toggle looks small. In practice, theme bugs break sign-in pages, checkout buttons, charts, disabled controls, modals, and persisted user preferences. AI browser tests help by exercising the same journey a user would take, but they should not pretend to be pixel-perfect visual audits. BrowserBash is strongest when you use it to verify theme behavior, saved state, and critical flow completion in a real browser.

## Why dark mode testing automation is functional before it is visual

dark mode testing automation often starts with colors, but the first failures users notice are functional. They cannot read a disabled button. A modal close icon disappears. A chart legend becomes invisible. A saved preference resets on reload. A form error message has poor contrast and looks absent. Pixel tools can catch some of this, but a functional browser test proves whether the user can complete work in the selected theme.

BrowserBash is not a visual-regression engine. That honesty matters. Use it to switch themes, reload, navigate, and Verify key state. Use dedicated visual tooling when you need exact color tokens, screenshot baselines, or contrast review at scale. The best theme strategy combines both categories rather than forcing one tool to do everything.

AI is useful because theme controls are often buried in account settings, profile menus, or system preference screens. A plain-English objective can reach those paths without a selector model for every menu.

## BrowserBash fit for dark mode testing automation

BrowserBash is a free, open-source natural-language browser automation CLI from The Testing Academy, founded by Pramod Dutta and licensed under Apache-2.0. You install it with `npm install -g browserbash-cli` and run it with `browserbash`. The current version to write against is 1.5.1. Its positioning matters: it is the open-source validation layer for AI agents. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step, and the run returns a deterministic verdict plus structured results. It is not a selector framework, and it does not ask you to maintain page objects before you know whether a flow is worth automating.

The newer deterministic Verify assertions are the guardrail. In testmd v2, a `Verify` line that matches the grammar compiles to a real Playwright check for URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, or a stored value equals. That is not model judgment. A pass means the condition held in the browser, and a fail carries expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. Verify lines outside the grammar can still run, but they are marked `judged: true`, so you can separate deterministic checks from agent-judged observations.

For theme checks, deterministic Verify lines should focus on state that a browser can prove: a named toggle is visible, a settings heading is present, the URL is correct, text appears after reload, or a saved preference is shown. A model can describe that the page looks dark, but that should not be the only evidence for a release gate.

## Record the theme path once

Theme settings are often product-specific. The path might be Profile, Preferences, Appearance, or a command palette. Record mode is a good way to capture that path because a human can find it quickly. Then edit the generated test to remove unnecessary exploration and add deterministic Verify steps.

```bash
browserbash record https://app.example.com/account/theme

browserbash run "Open account settings, switch to dark mode, reload the page, and verify the dark theme is still selected" --agent
```

The record flow writes a plain-English test from your clicks. Password fields are handled with a secret marker, so sensitive values do not leave the page. Once the path is captured, the second command checks the core behavior through the agent and emits structured output.

## Persisted preference checks

A theme toggle that works only until reload is not done. Good dark mode testing automation verifies persistence. Switch to dark mode, reload, navigate to another important page, and confirm the UI still exposes the dark preference or expected state. If the product stores theme per account, use saved auth. If it stores theme per browser, make sure CI starts from a known storage state.

Saved logins reduce the need for brittle login setup. `browserbash auth save <name> --url <login-url>` opens a browser, lets you log in once, and saves a Playwright storageState when you press Enter. You can reuse it with `--auth <name>` on run, testmd, run-all, and monitor, or put `auth:` in test frontmatter. If the saved origins do not cover the target start URL, BrowserBash prints a warning instead of silently pretending the session was applied.

Saved auth should not hide state mistakes. If the saved storage already contains dark mode, a test that claims it switched from light to dark is weak. Use explicit setup or separate profiles for light, dark, and system preference scenarios.

## Testing prefers-color-scheme honestly

System preference is different from an in-app toggle. A product may support light, dark, and system. BrowserBash can validate the user-facing behavior, but environment-level media emulation may belong in Playwright config, CI browser flags, or provider capabilities. Do not claim coverage of `prefers-color-scheme` unless the environment actually sets it.

A practical split is to use BrowserBash to verify the product state after entering each mode, and use lower-level browser automation or visual tooling to enforce exact media-query rendering. If your app exposes a System option, Verify that selecting it saves correctly and that critical flows still work under the configured environment.

## Use API setup for theme state

```bash
cat > tests/theme_flow_test.md <<'EOF'
---
version: 2
auth: admin
---
POST https://api.example.com/theme with body {"name":"bb-{{RUN_ID}}"}
Expect status 201, store $.id as 'themeId'

Open https://app.example.com/theme/{{themeId}}
Verify 'Dark mode' button visible
EOF

browserbash run-test tests/theme_flow_test.md --agent
```

If your backend stores theme preference, an API step can seed the account before the UI opens. That is cleaner than clicking through settings in every test. The UI test can then verify the expected setting appears and a critical page remains usable. Remember the current testmd v2 limitation: it needs the builtin engine with Anthropic credentials or a compatible gateway, and it does not yet run directly on Ollama or OpenRouter.

## Where visual tools still lead

Dark mode has real visual requirements. Contrast, chart palette, focus ring color, screenshots, skeleton loaders, disabled states, and image assets need review. BrowserBash can catch functional breakage around those elements, but pixel acceptance belongs in a visual regression or accessibility workflow. That is not a weakness. It is a clean separation of responsibilities.

For example, let a visual tool compare the account dashboard in light and dark themes. Let BrowserBash sign in, switch the theme, reload, open billing, and Verify that the payment method heading and save button are visible. Together they answer both presentation and behavior.

## Who should automate dark mode this way

Use this approach if theme state touches important user journeys, account preferences, checkout, dashboards, or data visualizations. A small marketing site may need visual checks more than agent-driven flows. A SaaS product with complex settings needs functional theme validation because the user can break their own experience by changing a preference.

The model story is deliberately local-first. BrowserBash defaults to Ollama, so a team can start with free local models, no API keys, and no test prompt leaving the machine. Provider resolution then falls through to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and OpenRouter when you bring your own keys. For long, sensitive, or regulated flows, that default is useful. The honest caveat is that very small local models around 8B parameters and under can be flaky on long multi-step objectives. The sweet spot is usually a mid-size local model, such as a Qwen3 or Llama 3.3 70B-class model, or a capable hosted model for hard flows.

For broader examples, use the [BrowserBash features page](https://browserbash.com/features), the [open-source repo](https://github.com/PramodDutta/browserbash), and the [tutorials](https://browserbash.com/tutorials) to connect theme tests with normal browser validation workflows.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## Implementation checklist for dark mode testing automation

A final practical rule: keep the first version small, inspect the evidence, and only then expand the suite. BrowserBash works best when objectives are specific, data is controlled, and the pass or fail claims are explicit. That habit matters more than the number of tests you create in the first week.

## FAQ

### What should dark mode testing automation verify?
Verify the user can switch themes, the setting persists after reload, key controls remain visible, and important flows still work. Also check saved preference behavior for signed-in and signed-out states when the product supports both.

### Can BrowserBash do pixel-perfect theme testing?
No. BrowserBash is functional-first, so it is useful for checking theme workflows and deterministic UI state. Use a visual regression tool when you need pixel-level color, spacing, or screenshot baseline enforcement.

### How do I test prefers-color-scheme with AI tests?
You can run separate scenarios for system, light, and dark preferences, then verify the product state that should result. BrowserBash can drive the flow, but environment-level media emulation may still belong in your browser test harness or CI setup.

### Why do theme tests fail only in CI?
Theme tests often expose race conditions, missing persisted settings, different default OS preferences, or contrast issues hidden by local browser state. Saved auth and explicit Verify checks make those differences easier to diagnose.

Start locally with `npm install -g browserbash-cli`, then explore the optional [BrowserBash sign-up](https://browserbash.com/sign-up) path if you want the free cloud dashboard. An account is optional for local CLI validation, so you can try the workflow before connecting anything.
