export const meta = {
  name: 'browserbash-seo-write',
  description: 'Write ~3000-word SEO competitor articles to the BrowserBash blog',
  phases: [{ title: 'Write', detail: 'one agent per article, writes the .md file' }],
}

const BLOG = '/Users/promode/Documents/Personal_Projects/BrowserBash/browserbash-cli/site/content/blog'

// Spread publish dates Feb–Jun 2026 so the blog reads like an ongoing program.
const DATES = [
  '2026-02-03','2026-02-07','2026-02-12','2026-02-17','2026-02-21','2026-02-26',
  '2026-03-03','2026-03-06','2026-03-10','2026-03-13','2026-03-18','2026-03-24','2026-03-28',
  '2026-04-01','2026-04-04','2026-04-08','2026-04-11','2026-04-15','2026-04-18','2026-04-22','2026-04-25','2026-04-29',
  '2026-05-02','2026-05-06','2026-05-09','2026-05-13','2026-05-16','2026-05-20','2026-05-23','2026-05-27','2026-05-30',
  '2026-06-02','2026-06-04','2026-06-06','2026-06-08','2026-06-09','2026-06-10','2026-06-11',
]

const FACTS = `BROWSERBASH — GROUND TRUTH (use ONLY these facts about BrowserBash; never invent features):
- Free, open-source (Apache-2.0) natural-language browser automation CLI by The Testing Academy. Founder: Pramod Dutta.
- Install: \`npm install -g browserbash-cli\`. Command: \`browserbash\`. Latest version 1.3.1.
- You write a plain-English objective; an AI agent drives a REAL Chrome/Chromium browser step by step (no selectors, no page objects) and returns a verdict plus structured results.
- Model story: Ollama-FIRST — defaults to free local models, no API keys, nothing leaves your machine. Auto-resolves local Ollama -> ANTHROPIC_API_KEY -> OPENROUTER_API_KEY. Supports OpenRouter (including genuinely free hosted models such as openai/gpt-oss-120b:free) and Anthropic Claude (bring your own key). You can guarantee a $0 model bill on local models.
- HONEST caveat to weave in where relevant: very small local models (~8B and under) can be flaky on long multi-step objectives; the sweet spot is a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a capable hosted model for hard flows.
- No account needed to run. Optional FREE cloud dashboard (run history, video recordings, per-run replay) is strictly opt-in via \`browserbash connect\` + \`--upload\`. There is also a free, fully local dashboard: \`browserbash dashboard\`. Free uploaded runs are kept 15 days.
- Providers (where the browser runs), switched with one flag --provider: local (default, your Chrome), cdp (any DevTools endpoint), browserbase, lambdatest, browserstack.
- Engines: stagehand (default, MIT, by Browserbase) and builtin (an in-repo Anthropic tool-use loop).
- Agent mode: \`--agent\` emits NDJSON (one JSON event per line) on stdout. Exit codes: 0 passed, 1 failed, 2 error, 3 timeout. Built for CI and AI coding agents — no prose parsing.
- Markdown tests: committable \`*_test.md\` files (each list item is a step) with \`@import\` composition and \`{{variables}}\` templating; secret-marked variables are masked as ***** in every log line. Writes a human-readable \`Result.md\` after each run. Run with \`browserbash testmd run ./file_test.md\`.
- Recording: \`--record\` captures a screenshot AND a full \`.webm\` session video (via ffmpeg) on any engine; the builtin engine additionally captures a Playwright trace you can open in the trace viewer.
- Real example flow it can run: log in to a store, add an item to the cart, complete checkout, verify "Thank you for your order!".
- Links to use as internal links: https://browserbash.com/learn , https://browserbash.com/blog , https://browserbash.com/pricing , https://browserbash.com/features , https://browserbash.com/case-study , https://browserbash.com/sign-up , https://www.npmjs.com/package/browserbash-cli , https://github.com/PramodDutta/browserbash`

const RULES = `WRITING RULES (this is a published SEO article — quality bar is high):
LENGTH: 2900–3400 words in the BODY (excluding frontmatter). This is a hard requirement — count and hit it. Do not pad with fluff; add genuine depth, examples, and sub-sections to reach length.
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
- Comparison/alternatives articles MUST include at least one markdown comparison TABLE.
- Include a clear decision section ("When to choose X", "Who it's for") — be genuinely useful and balanced.
- Include 1–3 fenced \`\`\`bash code blocks with REAL BrowserBash commands (e.g. browserbash run "...", --agent, --headless, --record, --upload, --provider lambdatest, testmd run, {{variables}} with a secret).
- Internal links: 4–6 markdown links chosen from the FACTS link list, with natural anchor text spread through the article (not a dump).
- End with a \`## FAQ\` section containing EXACTLY 4 \`### <question>\` headers, each followed by a 2–4 sentence plain-text answer (no code blocks inside answers — these power FAQPage structured data). Questions should be real search queries.
- Finish with a short closing paragraph CTA: the install command \`npm install -g browserbash-cli\` and a link to https://browserbash.com/sign-up (note an account is optional).
HONESTY (mandatory brand voice — like the Kane CLI comparison):
- NEVER fabricate a competitor's pricing, model, internal architecture, or features that are not publicly known. If unknown, say "not publicly specified" or "as of 2026" and move on. Do not invent benchmarks or stats.
- Name the REAL overlaps honestly and say plainly where the competitor is the better fit. Credibility > hype. An honest comparison that sometimes favors the competitor is the goal.
SEO + HUMANIZATION:
- Primary keyword in: title, first 80 words, 2–3 \`##\` headers, and naturally throughout (~0.8–1.4% density — NEVER keyword-stuff). Use synonyms/variants.
- Write like a senior SDET who has actually used these tools. Vary sentence length. Use concrete specifics and second person ("you"). NO AI-tells: avoid "In today's fast-paced world", "In conclusion", "Furthermore"/"Moreover" pile-ups, "It's worth noting", "delve", "tapestry", "robust" filler, em-dash overuse, and empty intros. No fabricated quotes or fake customer stories.
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

const specs = [{"slug":"browser-automation-for-startup-founders","title":"Browser Automation for Founders Who Are Also QA","keyword":"browser automation for startup founders","category":"use-case","angle":"Speaks to early founders doing their own testing, showing how a free BrowserBash CLI with local models lets them verify critical flows nightly via cron and NDJSON, instead of paying for Reflect or QA Wolf early."},{"slug":"automate-customer-support-portal-testing","title":"Automate Support Portal & Ticketing Flow Testing","keyword":"support portal testing automation","category":"use-case","angle":"Targets teams testing help-center search, ticket submission, and chat widgets in plain English, with BrowserBash's agent navigating embedded third-party widgets that frustrate fixed CodeceptJS or Taiko selectors."},{"slug":"ai-testing-for-internal-tools-and-back-office","title":"AI Testing for Internal Tools & Back-Office Apps","keyword":"ai testing for internal tools","category":"use-case","angle":"Shows teams how to cover low-priority-but-critical internal admin tools with plain-English BrowserBash tests on free local models, finally automating the apps no one wanted to write Selenium for."},{"slug":"migrate-selenium-to-natural-language-testing","title":"Migrate Selenium Tests to Natural Language in 2026: A Guide","keyword":"migrate selenium to natural language testing","category":"guide","angle":"Step-by-step on retiring brittle Selenium WebDriver locators and rewriting flows as plain-English objectives, with BrowserBash shown as the free CLI that drives Chrome from English instead of XPath/CSS selectors."},{"slug":"migrate-cypress-tests-to-ai-browser-automation","title":"How to Migrate Cypress Tests to AI Browser Automation","keyword":"migrate cypress tests to ai","category":"guide","angle":"Walks Cypress users through mapping cy.get/cy.intercept patterns to AI-driven objectives, positioning BrowserBash as a zero-selector, language-agnostic replacement that still returns pass/fail verdicts."},{"slug":"migrate-playwright-suite-to-browserbash","title":"Move a Playwright Suite to BrowserBash: Migration Tutorial","keyword":"migrate playwright tests to browserbash","category":"guide","angle":"Practical conversion guide turning Playwright page objects and spec files into Markdown *_test.md files with @import and {{variables}}, honestly noting where Playwright code still wins and where AI objectives reduce maintenance."},{"slug":"migrate-puppeteer-scripts-to-plain-english","title":"Replace Puppeteer Scripts With Plain-English Browser Tests","keyword":"migrate puppeteer to natural language","category":"guide","angle":"Shows how to swap imperative Puppeteer page.click/page.evaluate chains for English objectives, with BrowserBash driving real Chromium via Stagehand and emitting structured results."},{"slug":"replace-page-objects-with-plain-english","title":"Replace the Page Object Model With Plain English in 2026","keyword":"replace page object model with plain english","category":"guide","angle":"Argues the POM maintenance tax (selector files per page) is avoidable and demonstrates BrowserBash's objective-first Markdown tests as the modern, locator-free alternative."},{"slug":"integrate-ai-browser-tests-gitlab-ci","title":"Run AI Browser Tests in GitLab CI: A Complete Tutorial","keyword":"ai browser testing gitlab ci","category":"ci","angle":"End-to-end GitLab CI pipeline guide using BrowserBash's --agent NDJSON output and exit codes (0/1/2/3) so jobs pass or fail without log scraping, with masked CI secrets."},{"slug":"ai-browser-tests-jenkins-pipeline","title":"AI Browser Testing in a Jenkins Pipeline: 2026 Setup Guide","keyword":"ai browser tests jenkins pipeline","category":"ci","angle":"Declarative Jenkinsfile walkthrough wiring BrowserBash into stages, capturing .webm video artifacts with --record and gating builds on exit codes instead of brittle assertions."},{"slug":"browser-testing-circleci-natural-language","title":"Natural-Language Browser Testing on CircleCI: Step by Step","keyword":"natural language browser testing circleci","category":"ci","angle":"Configures a CircleCI orb-free job that installs browserbash-cli, runs Markdown tests, and uploads run history to the free dashboard, contrasting it with maintaining Selenium grids in CI."},{"slug":"migrate-from-sauce-labs-to-open-source-ai-testing","title":"Migrate From Sauce Labs to Open-Source AI Browser Testing","keyword":"sauce labs alternative open source","category":"alternatives","angle":"Cost-and-control migration story for teams leaving Sauce Labs grids, showing BrowserBash's free local runs plus one-flag cloud providers (LambdaTest, BrowserStack, Browserbase) when grid scale is still needed."},{"slug":"run-browser-tests-on-browserbase-tutorial","title":"Run AI Browser Tests on Browserbase With One Flag","keyword":"run browser tests on browserbase","category":"guide","angle":"Hands-on tutorial pointing BrowserBash at Browserbase via --provider browserbase for headless cloud Chrome, explaining when remote sessions beat local Chromium for parallel runs."},{"slug":"lambdatest-vs-browserstack-ai-test-migration","title":"LambdaTest vs BrowserStack: Migrating to AI-Driven Tests","keyword":"lambdatest vs browserstack ai testing","category":"comparison","angle":"Compares the two cloud grids for natural-language test runs and shows BrowserBash hitting either via a single --provider flag, so you switch vendors without rewriting a line of test logic."},{"slug":"use-ollama-models-for-browser-test-automation","title":"Use Local Ollama Models to Drive Browser Tests (No API Keys)","keyword":"ollama browser test automation","category":"llm","angle":"Tutorial on configuring BrowserBash's Ollama-first local stack so test data and prompts never leave the machine, including model picks and when a local LLM is good enough vs cloud Claude."},{"slug":"openrouter-free-models-ci-browser-testing","title":"Run Browser Tests on OpenRouter Free Models in CI","keyword":"openrouter free models browser testing ci","category":"llm","angle":"Shows wiring BrowserBash to OpenRouter free models like openai/gpt-oss-120b:free for zero-cost CI runs, with notes on rate limits and falling back to Anthropic for harder flows."},{"slug":"secret-handling-ai-browser-tests-ci","title":"Secret Handling for AI Browser Tests in CI: 2026 Guide","keyword":"secrets in ci browser testing","category":"security","angle":"Security-focused tutorial on passing credentials as {{variables}} that BrowserBash masks in logs and dashboard output, mapped to GitHub Actions, GitLab, and Jenkins secret stores."},{"slug":"migrate-robot-framework-to-ai-browser-testing","title":"Migrate Robot Framework Suites to AI Browser Testing","keyword":"migrate robot framework to ai testing","category":"guide","angle":"Converts Robot Framework keyword-driven .robot files and SeleniumLibrary calls into BrowserBash Markdown objectives, honestly weighing Robot's structure against AI's lower locator upkeep."},{"slug":"migrate-codeceptjs-to-natural-language-tests","title":"From CodeceptJS to Natural-Language Browser Tests","keyword":"migrate codeceptjs to natural language","category":"guide","angle":"Maps CodeceptJS's BDD-style I.click/I.see syntax to BrowserBash plain-English objectives, showing the migration removes the helper/locator layer while keeping readable scenarios."},{"slug":"migrate-testcafe-tests-to-ai-cli","title":"Migrate TestCafe Tests to an AI Browser Automation CLI","keyword":"migrate testcafe to ai automation","category":"guide","angle":"Guides TestCafe users replacing Selector/ClientFunction code with English objectives in BrowserBash, covering auth flows and where TestCafe's proxy model differs from agent-driven Chrome."},{"slug":"github-actions-matrix-cross-browser-ai-tests","title":"Cross-Browser AI Tests in a GitHub Actions Matrix","keyword":"github actions matrix cross browser ai tests","category":"ci","angle":"Builds a GitHub Actions matrix that fans BrowserBash runs across providers and browsers, using exit codes for clean job status and --upload for replayable run history."},{"slug":"migrate-ghost-inspector-to-open-source-ai-testing","title":"Migrate Ghost Inspector Tests to Open-Source AI Testing","keyword":"ghost inspector alternative open source","category":"alternatives","angle":"Migration path off Ghost Inspector's recorded suites toward version-controlled Markdown tests in BrowserBash, emphasizing free local runs and no per-test SaaS pricing."},{"slug":"migrate-rainforest-qa-to-ai-agent-testing","title":"Replace Rainforest QA With an AI Agent Testing CLI","keyword":"rainforest qa alternative ai","category":"alternatives","angle":"Shows teams swapping Rainforest QA's crowd/no-code runs for self-hosted AI agent objectives in BrowserBash, keeping plain-English readability while cutting cost and adding CI exit codes."},{"slug":"convert-selenium-ide-recordings-to-plain-english","title":"Convert Selenium IDE Recordings to Plain-English Tests","keyword":"convert selenium ide to natural language","category":"guide","angle":"Tutorial translating exported Selenium IDE .side click-and-type recordings into resilient BrowserBash objectives, explaining why recorded selectors break and AI intent does not."},{"slug":"migrate-qa-wolf-to-self-hosted-ai-testing","title":"Migrate From QA Wolf to Self-Hosted AI Browser Testing","keyword":"qa wolf alternative self hosted","category":"alternatives","angle":"For teams ending a QA Wolf managed-service contract, shows how to bring testing in-house with BrowserBash Markdown suites, local LLMs, and a free dashboard for run history and video."},{"slug":"migrate-checkly-to-ai-browser-monitoring","title":"From Checkly to AI Browser Checks in Plain English","keyword":"checkly alternative ai browser monitoring","category":"alternatives","angle":"Migrates Checkly Playwright-based synthetic checks into scheduled BrowserBash objectives run in CI, honestly noting Checkly's hosted scheduling vs BrowserBash's free, code-light local checks."},{"slug":"migrate-anthropic-computer-use-to-browser-cli","title":"From Anthropic Computer Use to a Focused Browser Test CLI","keyword":"anthropic computer use browser testing alternative","category":"agents","angle":"Explains why a general Computer Use agent is overkill for web QA and shows migrating those prompts into BrowserBash's browser-scoped builtin engine with deterministic exit codes and recorded traces."}]

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

Now: research from your knowledge (be accurate and honest about ${spec.keyword} and any named competitor — hedge where facts are not public), write the full article (2900–3400 words body), and use the Write tool to save the complete markdown to ${file}. After writing, report slug="${spec.slug}", the file path, an accurate wordCount of the body, ok=true if you wrote >=2900 words with valid frontmatter and a ## FAQ with 4 questions, else ok=false with a note.`
}

phase('Write')
const out = await pipeline(specs, (spec, _orig, i) =>
  agent(buildPrompt(spec, DATES[i % DATES.length]), { label: `write:${spec.slug}`, phase: 'Write', schema: RESULT })
)
const done = out.filter(Boolean)
const ok = done.filter((r) => r && r.ok)
const short = done.filter((r) => r && (!r.ok || r.wordCount < 2900))
log(`Wrote ${ok.length}/${specs.length} articles ok; ${short.length} flagged short/invalid`)
return {
  requested: specs.length,
  written: done.length,
  ok: ok.length,
  flagged: short.map((r) => ({ slug: r.slug, words: r.wordCount, note: r.note || '' })),
  slugs: done.map((r) => r.slug),
}
