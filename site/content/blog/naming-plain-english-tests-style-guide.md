---
title: A Style Guide for Naming Plain-English Tests
description: "Use this plain english test style guide to write clear objectives, stable test names, reviewable steps, and useful failure evidence."
date: 2026-11-11
category: guide
---

A **plain english test style guide** sounds almost unnecessary until a suite contains “Check checkout,” “Make sure checkout works,” and “Test the whole buying flow.” All three are understandable to their authors. None tells a reviewer which user, starting state, action, or outcome matters. Natural-language browser automation removes selector syntax, but it does not remove the need for precise test design. In fact, readable instructions make ambiguity easier to overlook because every sentence feels familiar.

BrowserBash accepts a plain-English objective, lets an AI agent drive a real Chrome or Chromium browser step by step, and returns a deterministic verdict with structured results. Your words are therefore both documentation and executable input. This guide gives those words a consistent shape so a human can review them, an agent can act on them, and deterministic checks can decide whether the promised behavior held.

## Why a plain English test style guide matters

Traditional browser tests expose implementation choices in code: locators, waits, page objects, fixtures, and assertions. Plain-English tests move much of that surface into intent. That reduces mechanical noise, yet it makes language quality part of test reliability. “Open the account” could mean visit an account page, click a menu, create an account, or open a specific saved record.

A style guide creates shared expectations without turning English into a programming language. It helps authors choose the right scope, reviewers identify missing preconditions, and maintainers search the suite. It also separates two jobs that should remain distinct:

- Agent instructions describe how to reach or exercise behavior.
- Deterministic Verify statements define the conditions that constitute a pass.

The guide should be short enough to remember and strict only where consistency provides value. Teams do not need to police whether an author writes “select” or “choose” in every sentence. They do need agreement on whether names include roles, how destructive actions are labeled, and what counts as an observable result.

Treat file names, test titles, steps, variables, and assertions as separate naming layers. A good file name supports discovery. A good title helps a reviewer understand risk. A good step tells the agent what to do without prescribing fragile mechanics. A good Verify line states one check that can produce useful expected-versus-actual evidence.

## Name tests as user promise plus observable outcome

The strongest naming pattern is:

`<role or context> can <business action> and sees <observable outcome>`

Examples include “Member can renew an expired subscription and sees the new renewal date,” “Guest cannot open the billing page and sees the sign-in prompt,” and “Support agent closes a duplicate ticket and sees it removed from the active queue.” These names tell a reviewer who acts, what changes, and how success becomes visible.

Not every title needs the exact words “can” and “sees.” The pattern is a thinking aid, not a linter rule. “Expired invitation redirects a guest to request a new link” is concise and complete. “Checkout test” is not. Prefer an outcome over a screen name because pages are containers, while tests protect behavior.

Use present tense. Test results describe the product’s current behavior, so “Admin exports the filtered report” is clearer than “Admin will be able to export.” Use active voice when there is a meaningful actor. “Manager approves a pending expense” identifies responsibility better than “A pending expense is approved.”

Include the role only when it affects permissions, data, or expectations. Adding “user” to every name creates noise. “Search returns matching products” needs no role if search is public. “Auditor can view but cannot edit a closed report” does.

State the negative rule explicitly. “Restricted project access” could test several things. “Nonmember cannot open a private project and sees a not-found page” states both the prohibited action and the public behavior. Do not reveal sensitive existence through a title if the repository or reports have a wider audience than the application data.

## Use file names that sort, search, and compose cleanly

BrowserBash Markdown tests use the `*_test.md` suffix. Choose lowercase kebab-case before that suffix, for example `member-renews-expired-subscription_test.md`. A predictable convention works across shells, CI, editors, and code review links. Avoid spaces, punctuation, and internal ticket numbers as the only identifier.

Keep the stable behavior in the file name. Ticket IDs, sprint labels, and dates become stale. If traceability matters, place an issue link or requirement identifier in test metadata or nearby documentation. A file named `BUG-4812_test.md` says nothing after the issue tracker is archived. `guest-expired-invitation_test.md` remains findable.

Use domain-first folders for suites with many tests:

```text
tests/
  auth/
    member-signs-in_test.md
    locked-member-cannot-sign-in_test.md
  billing/
    owner-updates-card_test.md
    member-cannot-view-invoices_test.md
```

The folder provides context, so do not repeat it mechanically in every file. `billing-owner-updates-billing-card-in-billing-settings_test.md` is cumbersome inside `tests/billing/`. Prefer names that fit comfortably in test reports and PR comments.

Use `@import` composition for shared setup or reusable fragments, but name imports by the state they establish, not their current clicks. `authenticated-standard-member.md` is more stable than `click-login-and-fill-user.md`. Imports should remain small and transparent. A reviewer should not need to open five nested fragments to know what a test does.

Variables use `{{name}}` templating. Name them by meaning, such as `{{previewUrl}}`, `{{standardMemberEmail}}`, and `{{orderId}}`. Avoid `{{value1}}` or `{{testData}}`. Secret-marked variables are masked as `*****` in every log line, so identify secrets properly and never embed passwords directly in a step or title.

## Write objectives with bounded intent

A plain-English objective should be specific enough to guide action and broad enough to survive harmless layout change. “Using the standard member account, open the newest unpaid invoice, download its PDF, and confirm the invoice number matches the page” describes intent. “Click the second row, then click the blue icon at x=842” describes an implementation. “Check invoices” describes too little.

Bound the objective with four elements when relevant:

1. Starting context: URL, role, authentication profile, or known state.
2. Business action: the operation the user is trying to complete.
3. Selection rule: how to identify the right record without layout coordinates.
4. Observable result: what should be true at the end.

Use one business journey per test. A long objective that signs up, configures a workspace, invites five roles, creates a project, buys a plan, exports data, and deletes the account is hard to diagnose. It also magnifies the known weakness of very small local models, roughly 8B and under, on long multi-step tasks. Split the journey at stable business boundaries and reuse setup where appropriate.

Avoid subjective adjectives unless the requirement is genuinely subjective. “Verify the dashboard looks good” has no shared standard. “Verify the dashboard heading and the three account summary cards are visible” is reviewable. Performance terms need thresholds and an appropriate measurement layer. “Loads quickly” should not become a browser-agent judgment if the actual requirement is a two-second response budget.

The [BrowserBash learning center](https://browserbash.com/learn) provides useful background for objective-based automation. Your local style guide should add examples from your product because domain language is where most ambiguity appears.

## Prefer business language over UI choreography

Write what a user recognizes. “Choose the annual plan” is better than “Click the third radio input.” “Open the order with reference {{orderRef}}” is better than “Click row four.” This lets the agent locate controls based on accessible text and page meaning without committing the test to a selector or page object.

Business language is not permission to be vague. “Handle the order” could mean edit, fulfill, refund, cancel, or archive it. Use the product’s own nouns and verbs. If the interface calls a record a “workspace,” do not alternate between workspace, organization, tenant, and account unless those are truly different concepts.

Name controls when they disambiguate intent. BrowserBash deterministic Verify grammar can check that a `'name' button`, link, or heading is visible. A step such as “Select the Premium plan and use the Continue button” is reasonable when there are several ways forward. Avoid adding control types merely to imitate locator syntax.

Do not encode transient visual attributes. Color can be part of an accessibility or brand requirement, but it should not be the default way to identify an action. Text, role, associated record, and user purpose are usually more stable. Likewise, avoid “top,” “left,” “first,” and “last” unless order itself is the requirement.

State how to choose among repeated items. “Open a product” leaves the agent free to pick any item and makes later evidence hard to compare. “Open the product named {{productName}}” is deterministic. “Open the first available product sorted by lowest price” is valid only if the sort and availability are relevant to the scenario.

## Separate action steps from deterministic Verify steps

BrowserBash 1.5.0 compiles recognized Verify steps into real Playwright checks. Supported conditions include URL contains, title is or contains, text visible, a named button, link, or heading visible, element counts, and stored value equals. No model decides these outcomes. A pass means the condition held, and a failure records expected-versus-actual evidence in `run_end.assertions` and Result.md.

Write one observable proposition per Verify line. “Verify the confirmation heading and order number are visible and the URL contains success” combines three possible failures. Three checks produce better evidence and make review easier. Name the exact text only when exact copy is the requirement. If content is personalized or localized, verify a stable heading, role, or stored value instead.

Verify lines outside the grammar still run through agent judgment and are marked `judged: true`. That fallback is useful, but authors should not accidentally assume their prose compiled to a deterministic check. Review the structured assertions during test creation. If a merge gate requires deterministic evidence, reject or explicitly approve judged assertions.

testmd v2 makes the separation even clearer by executing steps one at a time in a single browser session. Deterministic API steps can seed data, then grouped plain-English agent blocks navigate the UI, and deterministic Verify steps check results.

```bash
browserbash testmd tests/billing/owner-renews-plan_test.md --agent
browserbash run-all tests/billing --budget-usd 2.50 --agent
```

A v2 file needs `version: 2` frontmatter and currently uses the builtin engine, which requires an Anthropic API key or compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run directly on Ollama or OpenRouter. Do not publish a team convention that assumes v2 works with every model path.

## Apply a consistent vocabulary and grammar

Build a small glossary from the product, not a giant list of forbidden words. Define roles, core objects, lifecycle states, and high-impact actions. For example, distinguish “member” from “workspace owner,” “disable” from “delete,” and “draft invoice” from “unpaid invoice.” Link the glossary from the test directory README so product, engineering, and QA use the same terms.

Use imperative sentences for executable steps: “Open the billing settings.” Use descriptive present tense for titles: “Workspace owner updates the billing card.” Keep each step focused on one action or a tightly coupled action-result pair. Numbered steps can help discussion, but the Markdown format and runner behavior should remain the source of execution order.

Avoid pronouns when their referent could change. “Open it and delete it” is short but fragile after another step is inserted. “Open order {{orderId}} and delete that order” is clearer. Pronouns are fine inside a tight sentence where only one object exists.

Use positive instructions for actions and explicit negative assertions for prohibitions. “Do not accidentally click Delete” is not a useful executable instruction. “Open the member menu without changing account data” gives a boundary, while “Verify button 'Delete account' is not visible” would need to match the actual supported grammar or be identified as agent-judged.

Avoid politeness filler. “Please kindly navigate to” adds tokens without intent. Avoid commentary such as “This should be easy” or “Obviously.” The test is a specification, not a conversation with the model.

Numbers and dates need formats. “Choose a recent date” is unstable. “Choose tomorrow in the account timezone” may be appropriate if the test runtime knows that timezone. For fixed fixtures, use `{{renewalDate}}` and make its source explicit. Currency expectations need amount and currency, not an unqualified number.

## Review names and steps with a practical checklist

Review the title first without opening the file. Can you identify the protected promise and likely owner? Does it distinguish this test from nearby scenarios? Would the title still make sense if the UI layout changed?

Then review the setup. Is the user role named when permissions matter? Is authentication supplied through a saved profile or a safe variable rather than embedded credentials? BrowserBash saved logins can be created with `browserbash auth save <name> --url <login-url>` and reused through `--auth <name>` or `auth:` frontmatter. A saved profile whose origins do not cover the target start URL produces a warning, which reviewers should not ignore.

Review every noun. Does “account” refer to the same product object in every step? Is the selection rule unique? Could a clean environment and a data-rich environment choose different records? Check destructive actions for an explicit fixture and cleanup plan.

Review every outcome. Is it observable in the browser or through a deterministic stored value? Does each Verify line fit the supported grammar? Is a judged assertion acceptable for this suite? Open the generated Result.md and structured agent output at least once before approving a new blocking test.

Finally, perform the “harmless redesign” test. Imagine the button moves, a panel becomes a dialog, or table rows become cards while names and behavior stay the same. If the instruction breaks only because it describes position or widget mechanics, rewrite it around intent. If the redesign changes the user contract, keeping the old instruction may be exactly right.

The open-source [BrowserBash repository](https://github.com/PramodDutta/browserbash) is the right place to inspect implementation and current documentation when a language behavior is unclear.

## When to use plain English tests, code, or both

Plain-English tests are a strong fit for user journeys that reviewers across QA, product, and engineering should understand. They work well when the interface changes more often than the underlying intent, and when an agent’s ability to interpret labels and context reduces locator maintenance.

Conventional Playwright code is often better for narrow DOM mechanics, precise timing measurement, extensive custom fixtures, or browser behavior that depends on low-level events. Unit and API tests remain better for pure calculations, schemas, and exhaustive input combinations. A readable browser objective should not absorb work that a smaller test can verify faster and more precisely.

Use both when an agent performs flexible navigation but deterministic checks own the outcome. BrowserBash is positioned as the open-source validation layer for AI agents, not as a claim that all automation should become prose. Its Apache-2.0 CLI can also sit behind MCP so coding agents call `run_objective`, `run_test_file`, or `run_suite` and receive structured verdict JSON.

For existing Playwright suites, `browserbash import <specs-or-dir>` converts common actions and expects heuristically without a model. It handles goto, click, fill, press, check, selectOption, getBy locators, and common expectations. Untranslatable material goes to `IMPORT-REPORT.md` instead of being invented or dropped. Imported wording should still pass through this style guide because mechanical translation cannot know your preferred business terms.

```bash
browserbash import tests/playwright
browserbash record https://preview.example.test
```

The recorder offers another starting point. `browserbash record <url>` opens a visible browser, captures the flow, and writes a plain-English test when you press Ctrl-C. Password fields never leave the page; the generated instruction uses `{{password}}`. Recorded steps document what you did, but they still need editing into a bounded user promise with explicit assertions.

## Evolve the plain English test style guide with evidence

Start with one page: naming pattern, file convention, preferred product vocabulary, examples of strong and weak objectives, Verify rules, and the review checklist. Apply it to a small suite before adding exceptions. The [BrowserBash tutorials](https://browserbash.com/tutorials) can supply setup context, while your examples should come from real product flows.

Use failure reviews to improve the guide. If several tests misinterpret “open the latest invoice,” define whether latest means creation date, issue date, or current sort order. If tests fail after copy changes that did not affect behavior, decide which phrases represent product contracts and which should be generalized. Add a rule only when it prevents a recurring problem.

Do not chase uniform sentence style at the expense of readability. Two authors can write slightly different but equally precise instructions. The guide exists to preserve meaning, not voice. Automated linting should focus on mechanical rules such as suffixes, forbidden embedded secrets, missing frontmatter, or unsupported required Verify grammar.

Version important semantic changes. Renaming a product role across the suite may be necessary, but reviewers need to know whether behavior changed or vocabulary merely caught up. Keep commits focused so plain-English diffs remain useful living documentation.

BrowserBash’s replay cache rewards stable objectives: a green run records actions and an identical next run can replay with zero model calls, while the agent steps back in when the page changes. Clear, consistent naming does not guarantee replay, but gratuitous wording churn can make test history and review harder to follow.

For broader examples and updates, browse the [BrowserBash blog](https://browserbash.com/blog). If you use the optional cloud dashboard, remember that uploads have 15-day retention. The local dashboard runs with `browserbash dashboard`, stays local, and requires no account.

## FAQ

### How should I name a plain-English browser test?

Name the user role or context, the business action, and the observable outcome. “Guest requests a password reset and sees a confirmation” is more useful than “Password reset test” because it states the protected promise.

### How long should a plain-English test objective be?

Keep it to one bounded business journey with explicit starting context and outcome. Split long objectives at stable business boundaries, especially when using smaller local models that can struggle with extended multi-step flows.

### Should plain-English tests mention buttons and links?

Mention a control when its accessible name or role disambiguates the intended action. Avoid position, color, coordinates, and widget choreography unless those properties are themselves part of the requirement.

### Are BrowserBash Verify steps judged by an AI model?

Recognized Verify grammar compiles to deterministic Playwright checks and does not use model judgment. Lines outside that grammar still run as agent-judged assertions and are marked `judged: true`, so reviewers can distinguish them.

Adopt the guide with one small, reviewed suite, then refine it from real failures. Install BrowserBash 1.5.1 with `npm install -g browserbash-cli`; an [optional BrowserBash account](https://browserbash.com/sign-up) is available for cloud uploads, while the CLI and local dashboard work without one.
