---
title: Plain-English Tests as Living Documentation
description: "Use english tests living documentation to keep user promises, executable steps, deterministic evidence, and review history together in Git."
date: 2026-11-19
category: guide
---

The idea behind **english tests living documentation** is simple: the most useful specification is readable by the people who define behavior and executable against the product that implements it. When a test sits beside code, changes through pull requests, and produces current evidence, it can document more than a wiki page that nobody knows is stale. The difficult part is preserving clarity without pretending that executable prose explains every requirement or that every passing run proves the whole system.

BrowserBash makes this pattern practical with committable `*_test.md` files. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser without selectors or page objects, and the CLI returns a deterministic verdict plus structured results. Variables, imports, deterministic Verify statements, API setup, Result.md, NDJSON, and JUnit connect the human specification to repeatable execution.

## What makes English tests living documentation

A readable test becomes living documentation when five conditions hold:

1. It describes a user promise in language stakeholders understand.
2. It lives under version control near the product or acceptance context.
3. It executes often enough that current status is known.
4. Its central outcomes are explicit and produce evidence.
5. People review and update it when behavior changes.

Plain English alone is not enough. A static scenario in a document can be clear but stale. An executable objective can be current but too vague to specify anything. A passing test can also be misleading if it selected the wrong record or relied on agent judgment for an undefined outcome.

Treat the file as the durable statement and run artifacts as dated evidence. The test says what should happen. `run_end.assertions`, Result.md, and CI status show what happened in a particular environment, revision, model, and time. Do not paste a permanent “PASS” into the specification or fabricate a verdict for an example.

Living documentation complements design docs, API contracts, architecture decisions, and exploratory charters. It is strongest for observable workflows, not for explaining internal rationale or every edge case.

## Write titles around user promises

A title should name an actor or context, business action, and observable outcome. “Workspace owner renews an expired plan and sees the new renewal date” communicates more than “Billing test.” Negative promises should be equally explicit: “Viewer cannot edit a closed report and sees read-only controls.”

Use product vocabulary consistently. If the interface distinguishes organizations, workspaces, and accounts, the tests should not use them interchangeably. A small glossary in the test directory helps QA, product, support, developers, and agents share the same nouns and lifecycle states.

Keep one bounded promise per file. A test that signs up, configures a workspace, invites users, purchases a plan, exports data, and deletes the account is hard to read and harder to diagnose. Split at stable business boundaries and compose shared setup through `@import` where it genuinely improves clarity.

Name files in lowercase kebab-case with the `*_test.md` suffix, such as `viewer-cannot-edit-closed-report_test.md`. Organize by business domain rather than temporary screen names. Stable names improve search, CI result tables, history, and links from requirements.

Use present tense and active voice. The test documents behavior now. Avoid ticket numbers as the only name because their meaning disappears outside the tracker. Link the issue in metadata or surrounding documentation while keeping the file meaningful on its own.

The [BrowserBash learning center](https://browserbash.com/learn) provides a starting point for objective design, but the product glossary and promise naming belong to your team.

## Make steps readable without turning them into selectors

Plain-English steps should express what a user is trying to do. “Open order {{orderId}} and request cancellation” survives a table-to-card redesign. “Click the second row and the red button on the right” documents today’s layout rather than behavior.

Include enough context to remove dangerous choices. “Delete a customer” is not acceptable. “Open isolated customer {{customerId}}, confirm the displayed email equals {{testEmail}}, and delete that customer” identifies the owned fixture. Destructive flows need explicit environments and cleanup.

Use `{{variables}}` for values that change by environment or run. Name them by meaning: `{{previewUrl}}`, `{{seededInvoiceId}}`, and `{{standardMemberEmail}}`. Secret-marked variables are masked as `*****` in every log line. Never embed a password or live token merely because Markdown feels less like code.

Use `@import` for small shared state, such as an authenticated member, not for long hidden journeys. Deep imports harm documentation because reviewers must chase several files to understand one promise. If a shared fragment changes, review every dependent test’s meaning.

Avoid subjective phrases such as “looks good,” “works correctly,” and “loads fast.” They may belong in exploratory charters, but executable documentation needs observable outcomes or acknowledged judgment. Performance requirements need measurements and thresholds in an appropriate layer.

The [BrowserBash tutorials](https://browserbash.com/tutorials) can help authors see practical Markdown patterns.

## Let deterministic assertions document the contract

BrowserBash 1.5.0 introduced deterministic Verify grammar. Recognized lines compile to real Playwright checks for URL contains, title is or contains, visible text, a named button, link, or heading, element counts, and stored-value equality. No model decides whether these conditions held.

A failed assertion includes expected-versus-actual evidence in `run_end.assertions` and the Result.md assertion table. That makes the Verify line both specification and diagnostic anchor. One condition per line gives the clearest documentation.

Verify prose outside the grammar still runs through agent judgment and is flagged `judged: true`. Keep that flag visible in review and reports. Agent-judged observations can be useful, but they should not masquerade as deterministic contract checks.

Choose stable assertions. Exact copy belongs in the contract when legal language or a critical user instruction must remain exact. Otherwise, a stable heading, role, URL state, element count, or stored business value may document intent better. Too many incidental assertions turn a readable promise into a snapshot of the current screen.

Tie the assertion to the subject. If setup creates order 481, the UI test should operate on the stored order and verify its ID or unique value. A generic confirmation heading can pass for the wrong record.

```bash
browserbash testmd tests/orders/member-cancels-order_test.md --agent
browserbash run-all tests/orders --budget-usd 2.50 --agent
```

Agent mode emits one NDJSON event per line. Machines use structured events; humans can read Result.md. Neither requires scraping conversational prose.

## Use testmd v2 to document state and behavior together

With `version: 2` frontmatter, a Markdown test executes steps one at a time against one browser session. Deterministic API steps support GET, POST, PUT, DELETE, and PATCH, body data, expected statuses, and stored JSON-path values. Consecutive plain-English steps run as grouped agent blocks on the same page. Verify steps remain deterministic when they match the grammar.

This creates an unusually readable state narrative. A file can say that it creates a pending request through the API, expects 201 and stores the request ID, opens the product as an approver, approves that request, and verifies the stored ID and approved status through the UI. Setup, action, and outcome stay together.

Avoid making every internal setup detail part of the public specification. Include enough to make state reproducible, and use shared helpers or lower-level tests for implementation-heavy fixture logic. The Markdown test should remain understandable to a reviewer who cares about behavior.

Compatibility is a real limitation. testmd v2 currently drives the builtin engine and requires `ANTHROPIC_API_KEY` or an `ANTHROPIC_BASE_URL` compatible gateway. It does not yet run directly on Ollama or OpenRouter. v1 files without frontmatter behave as before. Document which lane supports which version so the repository does not contain apparently executable specifications that a team’s standard environment cannot run.

API steps also require safe data rules. Use unique records, low-privilege credentials, and idempotent cleanup. A readable specification is not permission to mutate shared production state.

## Keep authentication and environments explicit

Authentication is part of the scenario when role or session state matters. BrowserBash saved logins make that context reusable. Run `browserbash auth save <name> --url <login-url>`, complete login in the opened browser, and press Enter to save Playwright storageState. Reuse it with `--auth <name>` on run, testmd, run-all, or monitor, or declare `auth:` in frontmatter.

If the saved profile’s origins do not cover the target start URL, BrowserBash prints a warning instead of silently doing nothing. Treat that warning as missing documentation: either the target environment changed or the profile is wrong.

Use profile names that communicate role and environment, without containing secrets. `preview-standard-member` is clearer than `login1`. Store session material according to security policy and use dedicated low-privilege accounts. Do not commit personal storageState.

Pass base URLs through variables so one behavioral test can run locally and on previews. Record environment, application revision, model, provider, engine, viewport, and test revision with results. A living specification can be shared, while execution evidence remains contextual.

BrowserBash defaults to local Chrome and Ollama. Automatic model resolution continues to Anthropic, OpenAI, and OpenRouter credentials. Local Ollama needs no API key and keeps data on the machine. Document the supported model so current evidence is reproducible.

Very small local models around 8B and under may be flaky on long objectives. Keep living specifications bounded, and use a mid-size Qwen3 model, Llama 3.3 70B-class model, or capable hosted model for hard flows.

## Generate drafts with import and recording, then review them

Existing Playwright tests can seed living documentation through `browserbash import <specs-or-dir>`. The importer uses no model and is deterministic and reproducible. It heuristically translates common goto, click, fill, press, check, selectOption, getBy locators, and expectations. `process.env.X` becomes `{{X}}`.

Anything untranslatable is written to `IMPORT-REPORT.md` rather than dropped or invented. Read that report first. Custom fixtures or expectations can carry the essential behavior. Imported prose may still describe locators and mechanics, so rewrite it around user intent.

The recorder offers a bridge from manual knowledge. `browserbash record <url>` opens a visible browser. Click through once, press Ctrl-C, and BrowserBash writes a plain-English test. Password fields never leave the page; the capture script sends only a secret marker, and output uses `{{password}}`.

```bash
browserbash import tests/playwright
browserbash record https://preview.example.test
```

A recording documents what one tester did, including detours and incidental data. Review the target role, selection rule, environment, and expected results. Add deterministic Verify lines and remove steps that do not contribute to the promise.

Generated drafts accelerate capture. Human review turns them into documentation.

## Review English tests as semantic code changes

Pull-request review should begin with the promise, not syntax. Can the reviewer identify the actor, starting state, action, and observable outcome? Is the expected behavior agreed? Would a harmless UI redesign preserve the instructions?

Then inspect data and safety. Are records unique and owned? Are destructive actions constrained? Are secrets marked? Is saved authentication appropriate? Can parallel runs collide? Is cleanup idempotent?

Inspect every Verify line in an actual run. Confirm deterministic assertions appear as such and unsupported prose is marked `judged: true`. Review expected and actual evidence from an intentional failure before promoting a test to a gate.

Treat wording changes as behavior changes when they alter selection, scope, or expected state. “Open the newest invoice” and “Open invoice {{invoiceId}}” can exercise different records. Keep purely editorial updates separate where possible so history stays intelligible.

Require an owner and lane. A document that nobody executes or investigates will decay. Blocking tests need stable evidence. Advisory and exploratory tests need review routines too.

Use the [open-source BrowserBash repository](https://github.com/PramodDutta/browserbash) to verify current implementation rather than accepting unsupported claims generated during review.

## Connect documentation to CI, PRs, and MCP agents

BrowserBash exit codes provide a stable automation contract: 0 passed, 1 failed validation, 2 error, infrastructure problem, or budget stop, and 3 timeout. The documentation should not call every nonzero result a product failure. CI comments should identify whether evidence is failed, inconclusive, timed out, or skipped.

The official GitHub Action installs the CLI, runs suites, uploads JUnit, NDJSON, and result artifacts, supports shard matrices and USD budgets, and posts a self-updating PR verdict comment. See the [GitHub Action documentation](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). A stable link from the test file to current artifacts closes the loop between specification and evidence.

BrowserBash also serves MCP over stdio with `browserbash mcp`. Its `run_objective`, `run_test_file`, and `run_suite` tools return status, summary, final_state, assertions, cost_usd, and duration_ms. It is listed on the official MCP Registry as `io.github.PramodDutta/browserbash`.

A failed validation remains a successful MCP tool call. A coding agent must read verdict status and assertion evidence. This lets an agent change code, run the relevant living specification, and report evidence without mistaking transport success for product success.

Keep human authority. An agent can propose a test update, but reviewers decide whether it accurately documents the product promise and is safe to execute.

### Keep living documentation current at suite scale

`run-all` derives concurrency from CPU and RAM, runs previously failed and slow tests first, and detects flaky behavior. Run history is important because a file that exists but regularly alternates outcomes is not trustworthy documentation of current behavior.

Replay records actions after a green run. An identical next run can replay with zero model calls, and the agent steps back in when the page changes. This keeps repeated execution economical, but it does not certify semantic equivalence after change. Deterministic assertions and review still own meaning.

Version 1.5.0 estimates `cost_usd` from a bundled model-price table. Unknown models have no estimate rather than an incorrect one. USD or token suite budgets stop launching new tests after crossing the threshold, mark the rest skipped, exit 2, and record spend in RunAll-Result.md and JUnit properties. Skipped documentation is not current evidence.

Sharding creates deterministic slices from sorted discovery order, while viewport matrices label every result. Aggregate all shards and report missing runs as unknown. Add viewports only where responsive behavior changes the promise.

Schedule a quarterly documentation audit. Archive removed features, merge duplicate promises, update vocabulary and owners, inspect flaky tests, and identify files that have not run recently. Delete stale tests rather than preserving a false historical museum.

The local dashboard works with `browserbash dashboard` and needs no account. An optional free cloud dashboard uses `browserbash connect` and `--upload`, with 15-day retention. Review data policy before uploads.

## When English tests living documentation is the right fit

Use it for cross-functional user journeys, permissions, lifecycle transitions, and workflows where the intent is more stable than the screen structure. It is especially helpful when product, QA, developers, and support all need to read the same behavioral artifact.

Use conventional Playwright when exact browser mechanics, complex fixtures, or low-level events are clearer in code. Use API contracts, schemas, architecture docs, and decision records for information a browser test cannot explain. Use human exploratory charters for novelty and subjective evaluation.

Do not force every requirement into English automation. A calculation is better documented by examples and unit tests. A security invariant needs lower-level enforcement and tests. A usability goal needs human research, even if browser checks confirm that required controls exist.

The best documentation system links these artifacts rather than declaring one format the source of all truth. Plain-English tests earn their place by joining readable promises with current browser evidence.

Browse the [BrowserBash blog](https://browserbash.com/blog) for more workflow patterns, then adapt the structure to your repository and review culture.

Create a small documentation index rather than a second source of truth. The index can group files by business capability, name owners, link related requirements, and display the latest executed status. It should derive paths and results from the repository and CI instead of copying step text. When a test is renamed or retired, update the index in the same pull request.

Decide how readers interpret age. A green result from six months ago does not prove today’s behavior. Show the application revision, test revision, environment, and execution time next to status, then define how recent evidence must be for each risk tier. A critical merge test may run on every relevant change, while a low-risk administrative flow runs weekly.

Preserve failed history. Living documentation is more credible when readers can see that a promise broke, what assertion failed, and which change restored it. Do not overwrite all artifacts with the latest green result. Retain enough structured history for the team’s incident and compliance needs, subject to data policy.

Finally, teach readers what the files cannot prove. A visible disabled button does not establish server authorization. A completed checkout does not exhaust every tax combination. A desktop run says nothing about mobile unless responsive behavior was exercised. Short limitation notes make the documentation useful for decisions instead of turning it into a ceremonial catalog.

## FAQ

### What are plain-English tests as living documentation?

They are readable behavioral specifications stored under version control and executed against the product. Their committed text states the promise, while structured run artifacts provide dated evidence for a specific revision and environment.

### Can nontechnical stakeholders review BrowserBash tests?

Yes. The objectives and Markdown steps use product language rather than selectors or page objects. Technical reviewers still need to confirm data, authentication, deterministic assertion behavior, and execution configuration.

### Do living documentation tests replace product requirements?

No. They document observable examples and promises, not every rationale, policy, or design decision. Link them with requirements, architecture records, API contracts, and exploratory findings.

### How do you stop living documentation from becoming stale?

Run it regularly, show current status and artifacts in CI, assign owners, review semantic changes, and audit unused or flaky tests. A file that no longer executes or reflects current vocabulary should be repaired or archived.

Commit one important user promise beside the code and keep its evidence current. Install BrowserBash 1.5.1 using `npm install -g browserbash-cli`; an [optional account](https://browserbash.com/sign-up) supports cloud uploads, while local use requires none.
