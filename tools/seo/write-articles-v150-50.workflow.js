export const meta = {
  name: 'browserbash-seo-write-v150',
  description: 'Write 50 SEO articles covering the v1.5.0/1.5.1 validation-layer features (MCP, assertions, auth, monitor, budgets, shard, import, record)',
  phases: [{ title: 'Write', detail: 'one agent per article, writes the .md file' }],
}

const BLOG = '/Users/promode/Documents/Personal_Projects/BrowserBash/browserbash-cli/site/content/blog'

// Spread publish dates across the weeks after the v1.5.0/1.5.1 ship date so the
// blog reads like an ongoing program, not a single dump.
const DATES = [
  '2026-07-09','2026-07-10','2026-07-11','2026-07-13','2026-07-14','2026-07-15',
  '2026-07-16','2026-07-17','2026-07-18','2026-07-20','2026-07-21','2026-07-22',
  '2026-07-23','2026-07-24','2026-07-25','2026-07-27','2026-07-28','2026-07-29',
  '2026-07-30','2026-07-31','2026-08-01','2026-08-03','2026-08-04','2026-08-05',
  '2026-08-06','2026-08-07','2026-08-08','2026-08-10','2026-08-11','2026-08-12',
]

const FACTS = `BROWSERBASH — GROUND TRUTH (use ONLY these facts about BrowserBash; never invent features):
- Free, open-source (Apache-2.0) natural-language browser automation CLI by The Testing Academy. Founder: Pramod Dutta.
- Install: \`npm install -g browserbash-cli\`. Command: \`browserbash\`. Latest version 1.5.1.
- Positioning: the open-source validation layer for AI agents. You write a plain-English objective; an AI agent drives a REAL Chrome/Chromium browser step by step (no selectors, no page objects) and returns a deterministic verdict plus structured results.
- Model story: Ollama-FIRST — defaults to free local models, no API keys, nothing leaves your machine. Auto-resolves local Ollama -> ANTHROPIC_API_KEY -> OPENAI_API_KEY -> OpenRouter. Supports OpenRouter and Anthropic Claude (bring your own key).
- MCP server (NEW in 1.5.0): \`browserbash mcp\` serves the CLI over the Model Context Protocol on stdio. One-line install into any MCP host: \`claude mcp add browserbash -- browserbash mcp\` (same idea for Cursor, Windsurf, Codex, Zed). Tools exposed: \`run_objective\` (one plain-English objective), \`run_test_file\` (a *_test.md file), \`run_suite\` (a folder, parallel). Each returns the structured verdict JSON: status, summary, final_state, assertions, cost_usd, duration_ms. A failed test is a successful validation — the tool call succeeds and the agent reads the verdict. BrowserBash is also listed on the official MCP Registry as \`io.github.PramodDutta/browserbash\`.
- Deterministic Verify assertions (NEW in 1.5.0): \`Verify\` steps in a testmd file compile to real Playwright checks (URL contains, title is/contains, text visible, \`'name' button|link|heading\` visible, element counts, stored value equals) — NO LLM judgment. A pass means the condition held; a fail comes with expected-vs-actual evidence in \`run_end.assertions\` and the Result.md assertion table. Verify lines outside the grammar still run, agent-judged, flagged \`judged: true\` so you can tell the difference.
- testmd v2 (NEW in 1.5.0): add \`version: 2\` frontmatter to a *_test.md file and steps execute ONE AT A TIME against a single browser session, with two deterministic step types that never touch a model: API steps (\`GET/POST/PUT/DELETE/PATCH url [with body {...}]\` + \`Expect status N[, store $.path as 'name']\`) for seeding data, and Verify steps for checking it through the UI. Consecutive plain-English steps run as grouped agent blocks on the same page. v1 files (no frontmatter) behave exactly as before; v2 currently drives the builtin engine (needs ANTHROPIC_API_KEY or an ANTHROPIC_BASE_URL gateway).
- Saved logins (NEW in 1.5.0): \`browserbash auth save <name> --url <login-url>\` opens a browser, you log in once, Enter saves the session (Playwright storageState). Reuse with \`--auth <name>\` on run/testmd/run-all/monitor, or \`auth:\` frontmatter in a test file. A profile whose saved origins do not cover the target start URL prints a warning instead of silently doing nothing.
- Monitor mode (NEW in 1.5.0): \`browserbash monitor <test|objective> --every 10m --notify <webhook>\` runs on an interval and alerts ONLY on pass<->fail state changes, both directions, never on every green run. Slack incoming-webhook URLs get Slack formatting automatically; other URLs get the raw JSON payload. The replay cache makes an always-on monitor nearly token-free.
- Cost governance (NEW in 1.5.0): \`run_end\` carries a \`cost_usd\` estimate from a bundled per-model price table (unknown models get no estimate rather than a wrong one). \`run-all --budget-usd 2.50\` (or \`--budget-tokens\`) stops launching new tests once the suite crosses the budget: remaining tests are reported \`skipped\`, the suite exits 2, and spend lands in \`RunAll-Result.md\` and JUnit \`<properties>\`.
- Sharding + viewport matrix (NEW in 1.5.0): \`run-all --shard 2/4\` runs a deterministic slice (computed on sorted discovery order, so parallel CI machines agree without coordination). \`--matrix-viewport 1280x720,390x844\` runs every test once per viewport, labeled in events/JUnit/results. A standalone \`--viewport WxH\` flag also works on single runs, both engines.
- Playwright import (NEW in 1.5.0): \`browserbash import <specs-or-dir>\` converts Playwright specs to plain-English *_test.md heuristically — NO model, deterministic and reproducible: goto/click/fill/press/check/selectOption, getBy* locators, common expects. \`process.env.X\` becomes \`{{X}}\` variables. Everything untranslatable lands in \`IMPORT-REPORT.md\` instead of being dropped or invented.
- Recorder (NEW in 1.5.0): \`browserbash record <url>\` opens a visible browser; click through the flow once and Ctrl-C writes a plain-English test. Password fields never leave the page — the capture script sends only a secret marker, the generated step reads \`Type {{password}} into ...\`.
- GitHub Action (NEW in 1.5.0): \`action.yml\` at the repo root installs the CLI, runs the suite, uploads JUnit/NDJSON/results artifacts, supports \`shard:\` matrix jobs and \`budget-usd:\`, and posts a self-updating PR comment with the verdict table. See browserbash-cli/docs/github-action.md.
- Older, still-true facts: replay cache (a green run records its actions; the next identical run replays them with zero model calls, and the agent steps back in only when the page changed), \`run-all\` memory-aware parallel orchestrator (concurrency derived from real CPU+RAM, previously-failed/slowest-first ordering, flaky detection), cheap-model routing (\`--model-exec\`, plan on a strong model, execute on a cheap one). Providers (--provider): local (default, your Chrome), cdp, browserbase, lambdatest, browserstack. Engines: stagehand (default, MIT, Browserbase) and builtin (in-repo Anthropic tool-use loop; required for lambdatest/browserstack).
- Agent mode: \`--agent\` emits NDJSON (one JSON event per line) on stdout. Exit codes: 0 passed, 1 failed, 2 error/infra/budget-stop, 3 timeout. Built for CI and AI coding agents — no prose parsing.
- Markdown tests: committable \`*_test.md\` files with \`@import\` composition and \`{{variables}}\` templating; secret-marked variables are masked as ***** in every log line. Writes a human-readable \`Result.md\` after each run.
- Local dashboard (\`browserbash dashboard\`, fully local, no account) and an optional free cloud dashboard (\`browserbash connect\` + \`--upload\`, 15-day retention).
- HONEST caveat to weave in where relevant: very small local models (~8B and under) can be flaky on long multi-step objectives; the sweet spot is a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a capable hosted model for hard flows. testmd v2 currently needs the builtin engine (Anthropic API or a compatible gateway) — it does not yet run on Ollama/OpenRouter directly.
- Links to use as internal links: https://browserbash.com/learn , https://browserbash.com/tutorials , https://browserbash.com/blog , https://browserbash.com/pricing , https://browserbash.com/features , https://browserbash.com/case-study , https://browserbash.com/sign-up , https://www.npmjs.com/package/browserbash-cli , https://github.com/PramodDutta/browserbash , https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md`

const RULES = `WRITING RULES (this is a published SEO article — quality bar is high):
LENGTH: 2900–3400 words in the BODY (excluding frontmatter). Hard requirement — count and hit it. Do not pad with fluff; add genuine depth, examples, and sub-sections to reach length.
FRONTMATTER (exactly this shape, first lines of the file):
---
title: <the given title>
description: "<a 120–155 char meta description containing the primary keyword, in double quotes>"
date: <the given date>
category: <the given category>
---
BODY:
- Start with the intro prose immediately after the frontmatter. DO NOT put a "# H1" title line — the site template renders the title. First paragraph must contain the primary keyword naturally within the first ~80 words.
- 7–11 \`##\` sections with descriptive, keyword-aware headers; use \`###\` sub-sections where it adds depth.
- Comparison articles MUST include at least one markdown comparison TABLE.
- Include a clear decision section ("When to choose X", "Who it's for") — be genuinely useful and balanced.
- Include 1–3 fenced \`\`\`bash code blocks with REAL BrowserBash commands relevant to the topic (e.g. browserbash mcp, browserbash run "...", --agent, --auth, browserbash monitor --every 10m --notify, run-all --shard 2/4 --budget-usd 2, browserbash import, browserbash record, testmd frontmatter version: 2 with an API step + Verify step).
- Internal links: 4–6 markdown links chosen from the FACTS link list, with natural anchor text spread through the article (not a dump).
- End with a \`## FAQ\` section containing EXACTLY 4 \`### <question>\` headers, each followed by a 2–4 sentence plain-text answer (no code blocks inside answers — these power FAQPage structured data). Questions should be real search queries.
- Finish with a short closing paragraph CTA: the install command \`npm install -g browserbash-cli\` and a link to https://browserbash.com/sign-up (note an account is optional).
HONESTY (mandatory brand voice):
- NEVER claim "self-healing" as a headline capability of BrowserBash. NEVER invent benchmark numbers or fabricate a PASS/verdict that didn't happen. If a fact about a competitor is not publicly known, say "not publicly specified" and move on — never fabricate a competitor's pricing, model, or internal architecture.
- Name the REAL overlaps honestly and say plainly where a competitor or an alternative approach is the better fit. Credibility > hype.
- NEVER use an em dash (—) anywhere in the article. Use a comma, period, colon, parentheses, or "and" instead. This is a hard rule, not a style preference.
SEO + HUMANIZATION:
- Primary keyword in: title, first 80 words, 2–3 \`##\` headers, and naturally throughout (~0.8–1.4% density — NEVER keyword-stuff). Use synonyms/variants.
- Write like a senior SDET or AI-agent builder who has actually used these tools. Vary sentence length. Use concrete specifics and second person ("you"). NO AI-tells: avoid "In today's fast-paced world", "In conclusion", "Furthermore"/"Moreover" pile-ups, "It's worth noting", "delve", "tapestry", "robust" filler, and empty intros. No fabricated quotes or fake customer stories.
OUTPUT: Write the complete markdown (frontmatter + body) to the file path given. Then report the result.`

const RESULT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    file: { type: 'string' },
    wordCount: { type: 'number' },
    ok: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['slug', 'file', 'wordCount', 'ok'],
}

const specs = [
  // A. Feature tutorials
  { slug: 'mcp-server-setup-claude-code', title: 'Set Up the BrowserBash MCP Server in Claude Code', keyword: 'browserbash mcp server claude code', category: 'tutorial', angle: 'Step-by-step setup of browserbash mcp inside Claude Code (claude mcp add), what the three tools do, and a worked example of Claude Code validating a UI change it just made.' },
  { slug: 'mcp-server-cursor-windsurf', title: 'Use BrowserBash as an MCP Server in Cursor and Windsurf', keyword: 'browserbash mcp cursor windsurf', category: 'tutorial', angle: 'Configuring the BrowserBash MCP server inside Cursor and Windsurf settings, with a worked example of each agent calling run_objective to check its own work.' },
  { slug: 'official-mcp-registry-install', title: 'Install BrowserBash From the Official MCP Registry', keyword: 'browserbash official mcp registry', category: 'tutorial', angle: 'Explains what the official MCP Registry is, why io.github.PramodDutta/browserbash being listed there matters for discoverability, and how any MCP client can pull it in.' },
  { slug: 'testmd-v2-api-steps-tutorial', title: 'testmd v2: Seed Data With API Steps, Verify With the UI', keyword: 'testmd v2 api steps tutorial', category: 'tutorial', angle: 'Hands-on tutorial building a hybrid API+UI test file with version: 2 frontmatter, a POST seed step, an Expect status + store, and a Verify step, explaining why this beats one giant English objective.' },
  { slug: 'deterministic-verify-assertions-tutorial', title: 'Write Deterministic Verify Assertions in BrowserBash', keyword: 'deterministic verify assertions tutorial', category: 'tutorial', angle: 'Pure how-to on the Verify grammar (URL contains, title is, text visible, role visible, count, stored equals), reading the run_end.assertions block, and what happens when a Verify line falls outside the grammar.' },
  { slug: 'auth-save-reuse-login-sessions', title: 'Save and Reuse Login Sessions With browserbash auth save', keyword: 'browserbash auth save login sessions', category: 'tutorial', angle: 'Walkthrough of browserbash auth save/list/delete and --auth, why storageState reuse matters for suites that sit behind a login, and the origin-coverage warning.' },
  { slug: 'monitor-mode-production-checks-tutorial', title: 'Turn Any Test Into a Production Monitor With browserbash monitor', keyword: 'browserbash monitor mode production checks', category: 'tutorial', angle: 'Tutorial on browserbash monitor --every --notify, the pass<->fail-only alert rule, Slack webhook autodetection, and why the replay cache keeps a 24/7 monitor nearly token-free.' },
  { slug: 'github-action-browserbash-tutorial', title: 'Add the Official BrowserBash GitHub Action to Your CI', keyword: 'browserbash github action tutorial', category: 'ci', angle: 'Setup guide for the browserbash-action, the self-updating PR verdict comment, sharded matrix jobs, and the budget-usd hard stop, with a full example workflow YAML.' },
  { slug: 'browserbash-import-playwright-tutorial', title: 'Import an Existing Playwright Suite Into Plain English', keyword: 'browserbash import playwright tutorial', category: 'tutorial', angle: 'Hands-on walkthrough of browserbash import on a real Playwright spec file, reading IMPORT-REPORT.md for what did not translate, and reviewing the generated test before trusting it.' },
  { slug: 'browserbash-record-command-tutorial', title: 'Record a Browser Flow Once, Get a Plain-English Test', keyword: 'browserbash record command tutorial', category: 'tutorial', angle: 'Tutorial on browserbash record end to end: what gets captured, how password fields are handled, and reviewing/editing the generated *_test.md before committing it.' },

  // B. Agent-specific integration guides
  { slug: 'browserbash-with-claude-code', title: 'Validate Claude Code Work With a Real Browser', keyword: 'claude code browser testing validation', category: 'agents', angle: 'Explains the workflow of Claude Code writing a feature, then calling BrowserBash MCP tools to prove the UI actually works, with a concrete before/after example.' },
  { slug: 'browserbash-with-cursor-ai', title: 'Give Cursor a Browser: BrowserBash MCP Setup', keyword: 'cursor ai browser testing mcp', category: 'agents', angle: 'How Cursor users wire in the BrowserBash MCP server so Cursor can check its own frontend changes in a real Chrome instead of guessing.' },
  { slug: 'browserbash-with-github-copilot-workspace', title: 'GitHub Copilot Workspace and BrowserBash: Closing the Loop', keyword: 'github copilot workspace browser verification', category: 'agents', angle: 'Discusses the verification gap in AI coding workflows generally and how pointing Copilot Workspace changes at BrowserBash NDJSON/MCP output closes it.' },
  { slug: 'browserbash-with-openai-codex-cli', title: 'OpenAI Codex CLI and BrowserBash: Verify What Codex Built', keyword: 'openai codex cli browser testing', category: 'agents', angle: 'Shows Codex CLI shelling out to browserbash run --agent to check a page it just modified, reading the NDJSON verdict, and gating further work on the exit code.' },
  { slug: 'browserbash-with-windsurf', title: 'Windsurf and BrowserBash: Browser Verification via MCP', keyword: 'windsurf browser testing mcp', category: 'agents', angle: 'MCP setup for Windsurf plus a worked example of Windsurf running a test file after a UI edit.' },
  { slug: 'browserbash-with-zed-editor', title: 'Zed Editor and BrowserBash MCP: Test What You Just Shipped', keyword: 'zed editor mcp browser testing', category: 'agents', angle: 'Configuring the BrowserBash MCP server for Zed and walking through a real objective run triggered from an editor prompt.' },
  { slug: 'browserbash-with-any-mcp-client', title: 'Any MCP Client, One Browser Validator: BrowserBash', keyword: 'mcp client browser testing tool', category: 'agents', angle: 'General-purpose guide to wiring browserbash mcp into any MCP-speaking client, covering the stdio transport, the three tools, and the structured verdict contract every host can rely on.' },
  { slug: 'why-ai-coding-agents-need-a-browser-verifier', title: 'Why AI Coding Agents Need a Real Browser to Verify Their Work', keyword: 'ai coding agent browser verification', category: 'agents', angle: 'Argues the core validation-layer thesis: agents that only read their own diff cannot know if a page renders correctly, and a deterministic browser verdict is the missing feedback loop.' },

  // C. Problem/solution guides
  { slug: 'stop-ai-agents-claiming-tests-pass', title: 'Stop AI Agents From Claiming Tests Pass When They Do Not', keyword: 'ai agent false pass test verification', category: 'guide', angle: 'Explains the false-pass problem in agent-judged verdicts and how deterministic Verify assertions plus judged: true flagging make the difference visible and auditable.' },
  { slug: 'budget-cap-ai-test-suite', title: 'Put a Hard Dollar Cap on Your AI Test Suite', keyword: 'ai test suite budget cap', category: 'guide', angle: 'Practical guide to run-all --budget-usd and --budget-tokens: how the stop works, what happens to remaining tests, and how to size a budget for a real suite.' },
  { slug: 'cost-per-test-run-tracking', title: 'Track Cost Per Test Run With BrowserBash cost_usd', keyword: 'cost per test run tracking', category: 'guide', angle: 'Shows how cost_usd is estimated, where it shows up (run_end, RunAll-Result, JUnit properties), and how to build a simple cost dashboard from it.' },
  { slug: 'shard-browser-tests-across-ci-machines', title: 'Shard 500 Browser Tests Across 4 CI Machines', keyword: 'shard browser tests ci machines', category: 'ci', angle: 'Walks through run-all --shard i/n, why the slice is computed on sorted discovery order so machines agree without coordination, and a GitHub Actions matrix example.' },
  { slug: 'cross-viewport-testing-matrix-tutorial', title: 'Test Every Viewport in One Command: --matrix-viewport', keyword: 'cross viewport testing matrix', category: 'tutorial', angle: 'Tutorial on --matrix-viewport and --viewport, reading per-cell labels in JUnit/events, and when a viewport matrix actually catches real bugs.' },
  { slug: 'slack-alerts-for-broken-production-flows', title: 'Get a Slack Alert the Moment a Production Flow Breaks', keyword: 'slack alerts production flow monitoring', category: 'use-case', angle: 'End-to-end setup: a login test, browserbash monitor --notify pointed at a Slack incoming webhook, and what the alert looks like on both the break and the recovery.' },
  { slug: 'seed-data-api-then-verify-ui', title: 'Seed Data Over the API, Verify It in the UI', keyword: 'api seed data ui verification testing', category: 'guide', angle: 'The arrange-act-assert pattern implemented with testmd v2: a POST to seed a record, storing its id, then a UI flow that verifies it renders correctly.' },
  { slug: 'arrange-act-assert-in-markdown', title: 'Arrange-Act-Assert Tests in Plain Markdown', keyword: 'arrange act assert markdown tests', category: 'guide', angle: 'Explains the classic AAA testing pattern and shows it mapped directly onto a testmd v2 file: API arrange, English act, Verify assert, all in one committable document.' },
  { slug: 're-login-every-test-problem', title: 'The Re-Login-Every-Test Tax, and How to Kill It', keyword: 're-login every test automation', category: 'guide', angle: 'Names the real cost of fresh-context-per-test (slow suites, rate limits, captcha walls) and shows browserbash auth save/--auth as the fix, with before/after suite timing.' },
  { slug: 'flaky-vs-real-regression-evidence', title: 'Flaky Test or Real Regression? Read the Evidence, Not the Vibe', keyword: 'flaky test vs real regression', category: 'guide', angle: 'Uses deterministic assertion evidence (expected vs actual) plus run history flaky flags to help a team decide whether a red build is a real regression or noise, honestly noting BrowserBash does not auto-classify this yet.' },

  // D. New honest comparisons
  { slug: 'browserbash-mcp-vs-playwright-mcp', title: 'BrowserBash MCP vs Microsoft Playwright MCP', keyword: 'browserbash mcp vs playwright mcp', category: 'comparison', angle: 'Honest comparison of the two MCP servers: Playwright MCP as a general low-level browser-control primitive vs BrowserBash MCP as a purpose-built test/verdict layer with assertions, cost, and exit-code semantics built in.' },
  { slug: 'browserbash-mcp-vs-browser-use-mcp', title: 'BrowserBash vs Browser Use: Which MCP Server for Testing', keyword: 'browserbash vs browser use mcp testing', category: 'comparison', angle: 'Compares BrowserBash MCP (testing-first, deterministic assertions, free local models) against Browser Use as a general web-agent framework, naming where Browser Use is the better fit for open-ended browsing tasks.' },
  { slug: 'browserbash-record-vs-playwright-codegen', title: 'browserbash record vs playwright codegen: Two Ways to Capture a Flow', keyword: 'browserbash record vs playwright codegen', category: 'comparison', angle: 'Compares what you get after each tool finishes: a TypeScript spec from codegen vs a plain-English committable test plus a pre-warmed replay journal from browserbash record.' },
  { slug: 'github-actions-browserbash-vs-circleci-orb', title: 'BrowserBash GitHub Action vs a Custom CircleCI Orb', keyword: 'browserbash github action vs circleci orb', category: 'ci', angle: 'Compares the zero-config browserbash-action (PR comment, sharding, budget built in) against hand-rolling an equivalent CircleCI orb, honestly noting CircleCI users still need to DIY the wiring.' },
  { slug: 'testrigor-record-vs-browserbash-record', title: 'testRigor Recorder vs browserbash record: Free vs Paid Capture', keyword: 'testrigor recorder vs browserbash record', category: 'comparison', angle: 'Compares testRigor recorded natural-language tests (paid plans) against the free, open-source browserbash record command and its plain-English output.' },
  { slug: 'mabl-monitoring-vs-browserbash-monitor-mode', title: 'Mabl Monitoring vs BrowserBash Monitor Mode', keyword: 'mabl monitoring vs browserbash monitor', category: 'comparison', angle: 'Compares Mabl hosted synthetic monitoring against browserbash monitor running locally or in CI, honestly noting Mabl includes hosted scheduling BrowserBash does not.' },
  { slug: 'datadog-synthetics-vs-browserbash-monitor', title: 'Datadog Synthetics vs a Free BrowserBash Monitor', keyword: 'datadog synthetics vs browserbash monitor', category: 'comparison', angle: 'Compares Datadog Synthetic Monitoring (hosted, priced per check) with a self-run browserbash monitor loop plus webhook alerts, and when the hosted option is worth paying for.' },
  { slug: 'postman-newman-vs-testmd-api-steps', title: 'Postman/Newman vs testmd v2 API Steps for Pre-Test Seeding', keyword: 'postman newman vs testmd api steps', category: 'comparison', angle: 'Compares running a separate Postman/Newman collection to seed data before UI tests against doing it inline with testmd v2 API steps in the same file.' },
  { slug: 'github-copilot-vs-browserbash-for-verification', title: 'GitHub Copilot Writes Code, BrowserBash Verifies It', keyword: 'github copilot code verification browser testing', category: 'comparison', angle: 'Not a rivalry piece: explains the complementary roles, Copilot for generation, BrowserBash MCP for the browser-level verdict Copilot cannot produce on its own.' },
  { slug: 'selenium-grid-sharding-vs-browserbash-shard', title: 'Selenium Grid Sharding vs --shard in BrowserBash', keyword: 'selenium grid sharding vs browserbash shard', category: 'comparison', angle: 'Compares maintaining a Selenium Grid for parallel sharded runs against run-all --shard i/n with no grid to operate, naming where a Selenium Grid still wins (real cross-browser coverage).' },

  // E. Use-case builds
  { slug: 'verify-stripe-checkout-plain-english', title: 'Verify a Stripe Checkout Flow With Plain English and Real Assertions', keyword: 'stripe checkout testing plain english', category: 'use-case', angle: 'Worked example testing a Stripe-powered checkout: an English objective to complete checkout, then Verify steps confirming the confirmation page and order total.' },
  { slug: 'monitor-saas-login-page-uptime', title: 'Monitor Your SaaS Login Page for Silent Regressions', keyword: 'saas login page monitoring', category: 'use-case', angle: 'Builds a browserbash monitor loop watching a login page, explaining why silent auth regressions are especially costly and how the pass-to-fail alert catches them fast.' },
  { slug: 'nightly-regression-suite-free-models', title: 'Run a Nightly Regression Suite on Free Local Models', keyword: 'nightly regression suite free ai models', category: 'use-case', angle: 'Builds a cron-scheduled run-all suite on Ollama models with no API cost, honestly covering where a mid-size local model is reliable enough and where it is not.' },
  { slug: 'verify-ai-generated-ui-before-merge', title: 'Verify AI-Generated UI Before You Merge the PR', keyword: 'verify ai generated ui before merge', category: 'use-case', angle: 'A CI-gate use case: an AI coding agent opens a PR, the GitHub Action runs the affected test file, and the merge is blocked on a real verdict rather than a self-report.' },
  { slug: 'test-multi-tenant-saas-with-auth-profiles', title: 'Test a Multi-Tenant SaaS With Saved Auth Profiles Per Tenant', keyword: 'multi tenant saas testing auth profiles', category: 'use-case', angle: 'Shows saving one auth profile per tenant with browserbash auth save and running the same test file with --auth swapped per tenant in run-all.' },
  { slug: 'convert-manual-test-cases-to-testmd', title: 'Convert Manual Test Cases Into Committable testmd Files', keyword: 'convert manual test cases to testmd', category: 'guide', angle: 'Practical guide for a manual QA team turning existing written test cases into *_test.md files step by step, including where to add Verify steps for the checks they already do by eye.' },
  { slug: 'onboarding-flow-verification-ci', title: 'Gate Deploys on a Real Onboarding-Flow Verification', keyword: 'onboarding flow verification ci gate', category: 'use-case', angle: 'Builds a CI gate around a signup-to-first-value onboarding flow using testmd v2, explaining why onboarding is the highest-cost place for a silent regression.' },
  { slug: 'black-friday-load-day-smoke-checks', title: 'Pre-Launch Smoke Checks Before a High-Traffic Day', keyword: 'pre launch smoke checks high traffic', category: 'use-case', angle: 'Shows a fast smoke-check run-all suite with a tight budget-usd cap timed right before a known high-traffic event, and a monitor left running through the day.' },
  { slug: 'internal-admin-tool-coverage-cheap', title: 'Cover the Internal Admin Tool Nobody Wanted to Test', keyword: 'internal admin tool testing coverage', category: 'use-case', angle: 'Makes the case for covering low-priority internal tools cheaply with plain-English objectives on free local models instead of skipping coverage entirely.' },
  { slug: 'api-plus-ui-hybrid-suite-example', title: 'A Real Hybrid API and UI Suite in One testmd File', keyword: 'hybrid api ui testing testmd', category: 'tutorial', angle: 'A complete worked example: multiple API seed steps, a multi-step English UI flow, and closing Verify assertions, all inside one version: 2 testmd file, explained step by step.' },
  { slug: 'verdict-not-vibes-ci-gate', title: 'Ship a CI Gate Built on a Verdict, Not a Vibe', keyword: 'ci gate deterministic test verdict', category: 'guide', angle: 'Argues for gating merges on deterministic assertions and exit codes rather than an agent narrative summary, using BrowserBash judged vs deterministic flagging as the concrete mechanism.' },
  { slug: 'from-zero-to-first-mcp-validated-pr', title: 'Zero to a Browser-Validated PR in 10 Minutes', keyword: 'browser validated pull request tutorial', category: 'tutorial', angle: 'A fast end-to-end onboarding tutorial: install, MCP setup in an agent host, write one test file, wire the GitHub Action, open a PR and see the verdict comment.' },
]

function buildPrompt(spec, date) {
  const file = `${BLOG}/${spec.slug}.md`
  return `Write ONE high-quality, ~3000-word SEO blog article for the BrowserBash blog, then save it.

ARTICLE SPEC:
- Title: ${spec.title}
- Primary keyword: ${spec.keyword}
- Category: ${spec.category}
- Angle: ${spec.angle}
- Publish date (frontmatter): ${date}
- Save to this EXACT path (Write tool): ${file}

${FACTS}

${RULES}

Now: write the full article (2900–3400 words body) grounded ONLY in the GROUND TRUTH facts above, and use the Write tool to save the complete markdown to ${file}. After writing, report slug="${spec.slug}", the file path, an accurate wordCount of the body, ok=true if you wrote >=2900 words with valid frontmatter, zero em dashes, and a ## FAQ with 4 questions, else ok=false with a note.`
}

phase('Write')
const out = await pipeline(specs, (spec, _orig, i) =>
  agent(buildPrompt(spec, DATES[i % DATES.length]), { label: `write:${spec.slug}`, phase: 'Write', schema: RESULT })
)
const done = out.filter(Boolean)
const ok = done.filter((r) => r && r.ok)
const short = done.filter((r) => r && (!r.ok || r.wordCount < 2900))
log(`Wrote ${ok.length}/${specs.length} articles ok; ${short.length} flagged short/invalid`)
return { total: specs.length, ok: ok.length, flagged: short.map((r) => r.slug) }
