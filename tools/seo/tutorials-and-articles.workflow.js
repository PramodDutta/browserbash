export const meta = {
  name: 'browserbash-tutorials-and-articles',
  description: 'Research competitor keywords, then write 25+ in-depth tutorials + 100+ SEO articles for the BrowserBash blog',
  phases: [
    { title: 'Research', detail: 'agents scan KaneCLI / browse.sh / AI-agent keyword space' },
    { title: 'Write', detail: 'one agent per tutorial/article, writes the .md file' },
  ],
}

const BLOG = '/Users/promode/Documents/Personal_Projects/BrowserBash/browserbash-cli/site/content/blog'
const TARGET_ARTICLES = 115

// Spread publish dates so the blog reads like an ongoing program. Ascending so
// the /tutorials page (sorted ascending) shows lessons in curriculum order.
const DATES = [
  '2026-01-06','2026-01-09','2026-01-13','2026-01-16','2026-01-20','2026-01-23','2026-01-27','2026-01-30',
  '2026-02-03','2026-02-06','2026-02-10','2026-02-13','2026-02-17','2026-02-20','2026-02-24','2026-02-27',
  '2026-03-03','2026-03-06','2026-03-10','2026-03-13','2026-03-17','2026-03-20','2026-03-24','2026-03-27','2026-03-31',
  '2026-04-03','2026-04-07','2026-04-10','2026-04-14','2026-04-17','2026-04-21','2026-04-24','2026-04-28',
  '2026-05-01','2026-05-05','2026-05-08','2026-05-12','2026-05-15','2026-05-19','2026-05-22','2026-05-26','2026-05-29',
  '2026-06-02','2026-06-05','2026-06-09','2026-06-12','2026-06-16',
]

const FACTS = `BROWSERBASH — GROUND TRUTH (use ONLY these facts; never invent features):
- Free, open-source (Apache-2.0) natural-language browser automation CLI by The Testing Academy. Founder: Pramod Dutta.
- Install: \`npm install -g browserbash-cli\`. Command: \`browserbash\`. Latest version 1.3.1. Requires Node >= 18 and Chrome (for the local provider).
- You write a plain-English objective; an AI agent drives a REAL Chrome/Chromium browser step by step (no selectors, no page objects) and returns a verdict plus structured extracted values.
- Model story: Ollama-FIRST. Default model is \`auto\`, resolved: (1) local Ollama -> ollama/<model>, free, no keys; (2) ANTHROPIC_API_KEY -> claude-opus-4-8; (3) OPENAI_API_KEY -> openai/gpt-4.1; else error with guidance. Nothing leaves your machine on local models = guaranteed $0 model bill.
- HONEST caveat to weave in where relevant: very small local models (<=8B) are flaky on long multi-step objectives; sweet spot is a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a capable hosted model for hard flows.
- No account needed to run. Optional FREE local dashboard: \`browserbash dashboard\` (localhost:4477, fully local). Optional cloud dashboard: \`browserbash connect --key bb_...\` then \`--upload\` per run (opt-in; free cloud runs kept 15 days).
- Internal links to use: https://browserbash.com/tutorials , https://browserbash.com/learn , https://browserbash.com/blog , https://browserbash.com/pricing , https://browserbash.com/features , https://browserbash.com/case-study , https://browserbash.com/sign-up , https://www.npmjs.com/package/browserbash-cli , https://github.com/PramodDutta/browserbash`

const CLI_FACTS = `BROWSERBASH CLI SURFACE (the ONLY commands/flags that exist — never invent others):
ENGINES (who interprets the English): \`stagehand\` (default, MIT, by Browserbase — act/extract/observe/agent primitives, self-healing) and \`builtin\` (in-repo Anthropic tool-use loop driving Playwright; auto-used for LambdaTest/BrowserStack). Switch with \`--engine stagehand|builtin\`.
PROVIDERS (where the browser runs), \`--provider\`: \`local\` (default, your Chrome), \`cdp\` (any DevTools endpoint via \`--cdp-endpoint ws://...\`), \`browserbase\` (needs BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID), \`lambdatest\` (needs LT_USERNAME + LT_ACCESS_KEY, auto builtin engine), \`browserstack\` (needs BROWSERSTACK_USERNAME + BROWSERSTACK_ACCESS_KEY, auto builtin engine).
LLM BACKENDS: \`auto\` (default) or pin with \`--model\`: \`ollama/<model>\` (e.g. ollama/qwen3; OLLAMA_BASE_URL / OLLAMA_MODEL env), \`claude-opus-4-8\` (ANTHROPIC_API_KEY), \`openai/gpt-4.1\` / \`google/gemini-2.5-flash\` (Stagehand), \`openrouter/<vendor>/<model>\` (OPENROUTER_API_KEY, e.g. openrouter/meta-llama/llama-3.3-70b-instruct), or an Anthropic-compatible gateway via ANTHROPIC_BASE_URL.
COMMANDS: \`browserbash run "<objective>"\` (one-shot); \`browserbash testmd run ./file_test.md\` (markdown tests); \`browserbash dashboard\` (local dashboard; \`--clear\` wipes store); \`browserbash connect --key bb_...\` (link cloud).
KEY FLAGS on run: \`--provider\`, \`--engine\`, \`--model\`, \`--headless\`, \`--timeout <seconds>\`, \`--cdp-endpoint <ws-url>\`, \`--record\` (screenshot + .webm session video via bundled ffmpeg; builtin engine also writes a Playwright trace), \`--dashboard\` (open local dashboard on this run), \`--upload\` (push this run to cloud — requires connect; without it NOTHING leaves your machine), \`--agent\` (NDJSON output).
AGENT MODE: \`--agent\` emits NDJSON, one JSON object per line. Progress events: {"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}. Terminal: {"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}. Exit codes: 0 passed, 1 failed, 2 error, 3 timeout. Built for CI + AI coding agents (no prose parsing).
MARKDOWN TESTS (*_test.md): committable; each list item is a step; \`{{variables}}\` templating; \`@import\` composition; secret-marked variables masked as ***** in every log line; writes a human-readable Result.md after each run.
RUN STORE: every run kept on-disk at ~/.browserbash/runs (secrets masked, capped at 200).`

const RULES_ARTICLE = `WRITING RULES (published SEO article — high quality bar):
LENGTH: 2900-3400 words in the BODY (excluding frontmatter). Hard requirement — add genuine depth, not fluff.
FRONTMATTER (exactly this shape, first lines):
---
title: <the given title>
description: "<120-155 char meta description containing the primary keyword, in double quotes>"
date: <the given date>
category: <the given category>
---
BODY:
- Start with intro prose immediately after frontmatter. NO "# H1" line (template renders the title). First paragraph contains the primary keyword naturally within the first ~80 words.
- 7-11 \`##\` sections with descriptive, keyword-aware headers; \`###\` sub-sections where useful.
- Comparison/alternatives articles MUST include at least one markdown comparison TABLE.
- Include a clear decision section ("When to choose X", "Who it's for") — balanced and genuinely useful.
- 1-3 fenced \`\`\`bash blocks with REAL BrowserBash commands from the CLI surface (no invented flags).
- Internal links: 4-6 markdown links from the FACTS list, natural anchor text spread through the article.
- End with a \`## FAQ\` section: EXACTLY 4 \`### <question>\` headers, each a 2-4 sentence plain-text answer (no code blocks in answers — these power FAQPage schema). Questions = real search queries.
- Finish with a short closing CTA: \`npm install -g browserbash-cli\` and a link to https://browserbash.com/sign-up (account optional).
HONESTY (mandatory): never fabricate a competitor's pricing/model/architecture/features. If unknown say "not publicly specified" or "as of 2026". Name real overlaps honestly and say plainly where the competitor is the better fit. No invented benchmarks or customer stories.
SEO + HUMANIZATION: primary keyword in title, first 80 words, 2-3 \`##\` headers, ~0.8-1.4% density (never stuff). Write like a senior SDET who has used these tools. Vary sentence length, use "you", concrete specifics. NO AI-tells ("in today's fast-paced world", "in conclusion", "furthermore"/"moreover" piles, "it's worth noting", "delve", "tapestry", "robust" filler, em-dash overuse, empty intros).
OUTPUT: Write the complete markdown to the given file path with the Write tool. Then report.`

const RULES_TUTORIAL = `WRITING RULES (this is an in-depth, hands-on TUTORIAL — teach by doing, very thorough):
LENGTH: 2600-3600 words in the BODY (excluding frontmatter).
FRONTMATTER (exactly this shape, first lines):
---
title: <the given title>
description: "<120-155 char meta description containing the primary keyword, in double quotes>"
date: <the given date>
category: tutorial
---
BODY structure (follow closely):
- Intro prose immediately after frontmatter (NO "# H1" line). State plainly what the reader will be able to do by the end and put the primary keyword in the first ~80 words.
- A \`## What you'll need\` (prerequisites) section: Node >= 18, Chrome, the install command, and any keys/providers this lesson uses.
- A \`## <numbered step>\` sequence (e.g. "## Step 1 — ...") walking through the task end to end. EVERY step shows the EXACT command in a \`\`\`bash block AND describes the expected output/verdict. Use \`###\` sub-steps where needed.
- Where the lesson covers options/flags, include a markdown TABLE of the relevant flags/values and what each does (accurate to the CLI surface — no invented flags).
- A \`## Troubleshooting\` section with 3-5 real failure modes and fixes (e.g. small local model flakiness, ffmpeg missing for --record, provider keys not set, timeouts).
- A \`## When to use this\` / next-steps section linking to 2-3 sibling tutorials or the blog.
- End with a \`## FAQ\` section: EXACTLY 4 \`### <question>\` headers, each a 2-4 sentence plain-text answer (no code blocks in answers — powers FAQPage schema). Questions = real search queries.
- Finish with a short closing CTA: \`npm install -g browserbash-cli\` and a link to https://browserbash.com/sign-up (account optional).
ACCURACY: use ONLY commands/flags from the CLI surface. Every command must be runnable and correct. Prefer the free local (Ollama) path in examples unless the lesson is specifically about a paid provider.
INTERNAL LINKS: 4-6 markdown links, including https://browserbash.com/tutorials and https://browserbash.com/learn plus relevant others from the FACTS list.
VOICE: senior SDET pair-programming with the reader. Concrete, second person, vary sentence length. NO AI-tells. No fabricated output — describe realistic verdicts/NDJSON.
OUTPUT: Write the complete markdown to the given file path with the Write tool. Then report.`

// 27 hand-authored tutorials covering every CLI option/feature (curriculum order).
const TUTORIAL_SPECS = [
  { slug: 'install-browserbash-cli-tutorial', title: 'Install BrowserBash CLI: the complete setup guide', keyword: 'install browserbash cli', angle: 'Node + Chrome prerequisites, npm global install, verifying, first sanity run, uninstall.' },
  { slug: 'browserbash-first-run-tutorial', title: 'Your first BrowserBash run: browser automation in plain English', keyword: 'browserbash tutorial', angle: 'Anatomy of an objective, what the agent does step by step, reading the verdict and extracted values.' },
  { slug: 'browserbash-run-command-explained', title: 'The browserbash run command, every option explained', keyword: 'browserbash run command', angle: 'Deep dive on run: objective writing, --model, --headless, --timeout, output.' },
  { slug: 'browserbash-cli-flags-reference-tutorial', title: 'Every BrowserBash CLI flag, explained with examples', keyword: 'browserbash cli flags', angle: 'A reference tutorial: table of all flags across run/testmd/dashboard/connect with a runnable example each.' },
  { slug: 'browserbash-stagehand-vs-builtin-engine-tutorial', title: 'Stagehand vs builtin engine in BrowserBash: when to use each', keyword: 'browserbash engine', angle: 'How the two engines differ, --engine flag, why grids auto-use builtin, traces on builtin.' },
  { slug: 'browserbash-local-provider-tutorial', title: 'Run browser automation locally with BrowserBash', keyword: 'local browser automation cli', angle: 'The default local provider on your own Chrome, headed vs headless, zero keys.' },
  { slug: 'browserbash-cdp-endpoint-tutorial', title: 'Attach BrowserBash to any browser over CDP', keyword: 'browserbash cdp endpoint', angle: '--provider cdp + --cdp-endpoint, attaching to docker Chrome or a Playwright-managed browser.' },
  { slug: 'browserbash-browserbase-cloud-tutorial', title: 'Cloud browsers with BrowserBash and Browserbase', keyword: 'browserbase cli tutorial', angle: 'Keys, --provider browserbase, when cloud browsers beat local.' },
  { slug: 'browserbash-lambdatest-tutorial', title: 'Run AI browser tests on LambdaTest with BrowserBash', keyword: 'lambdatest ai testing cli', angle: 'LT keys, --provider lambdatest (auto builtin), --headless, recordings in the LT dashboard.' },
  { slug: 'browserbash-browserstack-tutorial', title: 'Run AI browser tests on BrowserStack with BrowserBash', keyword: 'browserstack ai testing', angle: 'BrowserStack keys, --provider browserstack (auto builtin), cross-browser runs.' },
  { slug: 'browserbash-ollama-local-models-tutorial', title: 'Free local browser automation with Ollama and BrowserBash', keyword: 'ollama browser automation', angle: 'ollama pull, auto-resolution, OLLAMA_MODEL/OLLAMA_BASE_URL, model size trade-offs.' },
  { slug: 'browserbash-openrouter-models-tutorial', title: 'Use any model via OpenRouter in BrowserBash', keyword: 'openrouter browser automation', angle: 'OPENROUTER_API_KEY, openrouter/<vendor>/<model>, free hosted models, cost control.' },
  { slug: 'browserbash-claude-anthropic-tutorial', title: 'Drive a browser with Claude using BrowserBash', keyword: 'claude browser automation', angle: 'ANTHROPIC_API_KEY, claude-opus-4-8, ANTHROPIC_BASE_URL gateways, builtin engine.' },
  { slug: 'browserbash-choosing-a-model-tutorial', title: 'Choosing the right model for BrowserBash', keyword: 'best model for browser automation', angle: 'auto resolution order, local vs hosted, when small models fail, picking by task difficulty.' },
  { slug: 'browserbash-agent-mode-ndjson-tutorial', title: 'BrowserBash agent mode: NDJSON output for CI and AI agents', keyword: 'browserbash agent mode', angle: '--agent event schema, parsing run_end, why no prose parsing, wiring to a coding agent.' },
  { slug: 'browserbash-exit-codes-ci-tutorial', title: 'BrowserBash exit codes and CI gating, explained', keyword: 'browserbash exit codes', angle: '0/1/2/3 meanings, failing a pipeline correctly, combining with --agent and --timeout.' },
  { slug: 'browserbash-markdown-tests-tutorial', title: 'Writing committable markdown tests with BrowserBash', keyword: 'markdown browser tests', angle: '*_test.md format, steps as list items, testmd run, Result.md, @import composition.' },
  { slug: 'browserbash-variables-and-secrets-tutorial', title: 'Variables and masked secrets in BrowserBash tests', keyword: 'browserbash variables and secrets', angle: '{{variables}} templating, secret-marked vars masked as ***** in logs, safe credentials.' },
  { slug: 'browserbash-recording-video-and-traces-tutorial', title: 'Record video, screenshots and traces with BrowserBash', keyword: 'browserbash record video', angle: '--record (.webm + screenshot via ffmpeg), Playwright trace on builtin, opening artifacts.' },
  { slug: 'browserbash-local-dashboard-tutorial', title: 'The free local BrowserBash dashboard', keyword: 'browserbash dashboard', angle: 'browserbash dashboard, --dashboard on a run, the run store, --clear, fully local.' },
  { slug: 'browserbash-cloud-dashboard-upload-tutorial', title: 'Connect and upload runs to the BrowserBash cloud dashboard', keyword: 'browserbash connect upload', angle: 'connect --key, --upload per run, opt-in privacy, 15-day retention, shareable run pages.' },
  { slug: 'browserbash-github-actions-tutorial', title: 'Run BrowserBash in GitHub Actions', keyword: 'browser automation github actions', angle: 'A full workflow YAML: install, --agent --headless, exit-code gating, artifacts.' },
  { slug: 'browserbash-jenkins-pipeline-tutorial', title: 'Run BrowserBash in a Jenkins pipeline', keyword: 'ai browser tests jenkins', angle: 'Jenkinsfile stage, headless, exit codes, archiving recordings.' },
  { slug: 'browserbash-headless-and-timeouts-tutorial', title: 'Headless mode and timeouts in BrowserBash', keyword: 'browserbash headless', angle: '--headless for servers/CI, --timeout tuning, debugging headless-only failures.' },
  { slug: 'browserbash-writing-reliable-objectives-tutorial', title: 'Writing reliable plain-English objectives for BrowserBash', keyword: 'natural language test objectives', angle: 'Prompt patterns for the agent: be specific, store values, verify, break up long flows.' },
  { slug: 'browserbash-extract-and-store-data-tutorial', title: 'Extract and store data from any page with BrowserBash', keyword: 'ai data extraction cli', angle: 'Objectives that store named values, reading final_state, structured extraction without selectors.' },
  { slug: 'browserbash-login-and-checkout-flow-tutorial', title: 'Automate a login-to-checkout flow with BrowserBash', keyword: 'automate login and checkout', angle: 'Multi-step journey as a markdown test with secrets, verifying "Thank you for your order!".' },
]

// Fallback article specs (competitor + adjacent keywords). Deduped at runtime vs
// the 282 existing slugs; research specs are merged in front, then this tops up to TARGET.
const FALLBACK_ARTICLE_SPECS = [
  { slug: 'browserbash-vs-puppeteer', title: 'BrowserBash vs Puppeteer: AI automation vs scripted control', keyword: 'browserbash vs puppeteer', category: 'comparison', angle: 'Plain-English agent vs Puppeteer API; when scripted Puppeteer still wins.' },
  { slug: 'browserbash-vs-webdriverio', title: 'BrowserBash vs WebdriverIO for browser testing', keyword: 'browserbash vs webdriverio', category: 'comparison', angle: 'No-selector AI vs WebdriverIO; honest trade-offs.' },
  { slug: 'browserbash-vs-testcafe', title: 'BrowserBash vs TestCafe: which fits your team', keyword: 'browserbash vs testcafe', category: 'comparison', angle: 'Selector-free AI vs TestCafe.' },
  { slug: 'browserbash-vs-nightwatch', title: 'BrowserBash vs Nightwatch.js', keyword: 'browserbash vs nightwatch', category: 'comparison', angle: 'AI objectives vs Nightwatch commands.' },
  { slug: 'browserbash-vs-robot-framework', title: 'BrowserBash vs Robot Framework for web tests', keyword: 'browserbash vs robot framework', category: 'comparison', angle: 'Keyword-driven vs natural language.' },
  { slug: 'browserbash-vs-testim', title: 'BrowserBash vs Testim: open source vs AI test platform', keyword: 'browserbash vs testim', category: 'comparison', angle: 'Free OSS CLI vs hosted AI recorder; be honest where Testim fits.' },
  { slug: 'browserbash-vs-mabl', title: 'BrowserBash vs mabl', keyword: 'browserbash vs mabl', category: 'comparison', angle: 'CLI + local models vs mabl SaaS.' },
  { slug: 'browserbash-vs-functionize', title: 'BrowserBash vs Functionize', keyword: 'browserbash vs functionize', category: 'comparison', angle: 'OSS vs enterprise AI testing.' },
  { slug: 'browserbash-vs-testrigor', title: 'BrowserBash vs testRigor: plain-English testing compared', keyword: 'browserbash vs testrigor', category: 'comparison', angle: 'Both use English; CLI/local vs SaaS.' },
  { slug: 'browserbash-vs-katalon', title: 'BrowserBash vs Katalon Studio', keyword: 'browserbash vs katalon', category: 'comparison', angle: 'Lightweight CLI vs Katalon IDE.' },
  { slug: 'browserbash-vs-autify', title: 'BrowserBash vs Autify', keyword: 'browserbash vs autify', category: 'comparison', angle: 'OSS CLI vs Autify no-code AI.' },
  { slug: 'browserbash-vs-reflect', title: 'BrowserBash vs Reflect.run', keyword: 'browserbash vs reflect', category: 'comparison', angle: 'CLI vs recorded cloud tests.' },
  { slug: 'browserbash-vs-rainforest-qa', title: 'BrowserBash vs Rainforest QA', keyword: 'browserbash vs rainforest qa', category: 'comparison', angle: 'AI CLI vs crowd/AI QA.' },
  { slug: 'browserbash-vs-browser-use', title: 'BrowserBash vs browser-use (the Python library)', keyword: 'browserbash vs browser-use', category: 'comparison', angle: 'CLI + markdown tests vs a Python agent library.' },
  { slug: 'browserbash-vs-skyvern', title: 'BrowserBash vs Skyvern', keyword: 'browserbash vs skyvern', category: 'comparison', angle: 'CLI/testing focus vs Skyvern workflow automation.' },
  { slug: 'browserbash-vs-lavague', title: 'BrowserBash vs LaVague', keyword: 'browserbash vs lavague', category: 'comparison', angle: 'CLI vs LaVague agent framework.' },
  { slug: 'browserbash-vs-multion', title: 'BrowserBash vs MultiOn', keyword: 'browserbash vs multion', category: 'comparison', angle: 'OSS local CLI vs hosted agent API.' },
  { slug: 'browserbash-vs-agentql', title: 'BrowserBash vs AgentQL', keyword: 'browserbash vs agentql', category: 'comparison', angle: 'Objective-driven runs vs AgentQL queries.' },
  { slug: 'browserbash-vs-stagehand', title: 'BrowserBash vs Stagehand: CLI vs framework', keyword: 'browserbash vs stagehand', category: 'comparison', angle: 'BrowserBash uses Stagehand as an engine — CLI wrapper vs raw library.' },
  { slug: 'browserbash-vs-playwright-mcp', title: 'BrowserBash vs Playwright MCP', keyword: 'browserbash vs playwright mcp', category: 'comparison', angle: 'NL CLI vs the Playwright MCP server; they can compose via CDP.' },
  { slug: 'browserbash-vs-openai-operator', title: 'BrowserBash vs OpenAI Operator', keyword: 'browserbash vs openai operator', category: 'comparison', angle: 'Self-hosted OSS CLI vs hosted agent.' },
  { slug: 'browserbash-vs-claude-computer-use', title: 'BrowserBash vs Claude computer use for browsers', keyword: 'browserbash vs claude computer use', category: 'comparison', angle: 'Focused browser CLI vs general computer-use.' },
  { slug: 'browserbash-vs-selenium-grid', title: 'BrowserBash vs Selenium Grid', keyword: 'browserbash vs selenium grid', category: 'comparison', angle: 'AI objectives + cloud grids vs maintaining a Grid.' },
  { slug: 'browserbash-vs-puppeteer-vs-playwright', title: 'BrowserBash vs Puppeteer vs Playwright', keyword: 'puppeteer vs playwright vs browserbash', category: 'comparison', angle: 'Three-way: scripted vs scripted vs AI.' },
  { slug: 'kane-cli-alternatives-2026', title: 'Kane CLI alternatives in 2026', keyword: 'kane cli alternatives', category: 'alternatives', angle: 'Honest roundup incl. BrowserBash; where Kane CLI fits.' },
  { slug: 'browse-sh-alternatives-2026', title: 'browse.sh alternatives in 2026', keyword: 'browse.sh alternatives', category: 'alternatives', angle: 'Roundup of CLI browser-agent tools.' },
  { slug: 'browser-use-alternatives-2026', title: 'browser-use alternatives in 2026', keyword: 'browser-use alternatives', category: 'alternatives', angle: 'Library vs CLI options.' },
  { slug: 'skyvern-alternatives-2026', title: 'Skyvern alternatives in 2026', keyword: 'skyvern alternatives', category: 'alternatives', angle: 'AI browser automation roundup.' },
  { slug: 'testim-alternatives-2026', title: 'Testim alternatives in 2026', keyword: 'testim alternatives', category: 'alternatives', angle: 'OSS + SaaS options.' },
  { slug: 'mabl-alternatives-2026', title: 'mabl alternatives in 2026', keyword: 'mabl alternatives', category: 'alternatives', angle: 'Roundup with honest fit notes.' },
  { slug: 'katalon-alternatives-2026', title: 'Katalon alternatives in 2026', keyword: 'katalon alternatives', category: 'alternatives', angle: 'Lighter + AI-first options.' },
  { slug: 'testrigor-alternatives-2026', title: 'testRigor alternatives in 2026', keyword: 'testrigor alternatives', category: 'alternatives', angle: 'Plain-English testing options.' },
  { slug: 'puppeteer-alternatives-ai-2026', title: 'AI-powered Puppeteer alternatives in 2026', keyword: 'puppeteer alternatives', category: 'alternatives', angle: 'When to drop scripted control for AI.' },
  { slug: 'functionize-alternatives-2026', title: 'Functionize alternatives in 2026', keyword: 'functionize alternatives', category: 'alternatives', angle: 'Enterprise vs OSS.' },
  { slug: 'best-ai-browser-agents-2026', title: 'The best AI browser agents in 2026', keyword: 'best ai browser agent', category: 'alternatives', angle: 'Landscape map incl. BrowserBash.' },
  { slug: 'open-source-browser-automation-tools-2026', title: 'Open-source browser automation tools in 2026', keyword: 'open source browser automation', category: 'alternatives', angle: 'OSS-only roundup.' },
  { slug: 'can-chatgpt-control-a-web-browser', title: 'Can ChatGPT control a web browser?', keyword: 'can chatgpt control a browser', category: 'agents', angle: 'What it can/cannot do, and giving an agent a real browser via BrowserBash.' },
  { slug: 'can-claude-control-a-web-browser', title: 'Can Claude control a web browser?', keyword: 'can claude control a browser', category: 'agents', angle: 'Computer use vs a dedicated browser CLI.' },
  { slug: 'give-your-ai-agent-a-browser', title: 'How to give your AI agent a real browser', keyword: 'give ai agent a browser', category: 'agents', angle: '--agent NDJSON, exit codes, wiring to any agent loop.' },
  { slug: 'mcp-browser-automation-guide', title: 'MCP and browser automation: a practical guide', keyword: 'mcp browser automation', category: 'agents', angle: 'How BrowserBash composes with MCP-managed browsers via CDP.' },
  { slug: 'browser-automation-for-langchain-agents', title: 'Browser automation for LangChain agents', keyword: 'langchain browser automation', category: 'agents', angle: 'Shelling out to browserbash --agent from a tool.' },
  { slug: 'browser-automation-for-crewai', title: 'Browser automation for CrewAI agents', keyword: 'crewai browser automation', category: 'agents', angle: 'A browser tool for a crew.' },
  { slug: 'browser-tool-for-autogpt', title: 'A browser tool for AutoGPT-style agents', keyword: 'autogpt browser tool', category: 'agents', angle: 'Deterministic NDJSON over screen-scraping.' },
  { slug: 'autonomous-browser-agent-explained', title: 'Autonomous browser agents, explained', keyword: 'autonomous browser agent', category: 'agents', angle: 'How they work, limits, where BrowserBash sits.' },
  { slug: 'natural-language-web-scraping', title: 'Natural-language web scraping without selectors', keyword: 'natural language web scraping', category: 'use-case', angle: 'Store values from a page in English.' },
  { slug: 'ai-web-scraping-no-code', title: 'AI web scraping with no code', keyword: 'ai web scraping no code', category: 'use-case', angle: 'Objectives instead of scrapers.' },
  { slug: 'rag-from-live-web-pages', title: 'Building RAG context from live web pages', keyword: 'rag from web pages', category: 'agents', angle: 'Fetch + extract via a browser agent.' },
  { slug: 'self-hosted-browser-agent', title: 'Running a self-hosted browser agent', keyword: 'self-hosted browser agent', category: 'agents', angle: 'Local-only, no cloud, no keys.' },
  { slug: 'open-source-computer-use-alternative', title: 'An open-source alternative to computer use for the web', keyword: 'open source computer use', category: 'agents', angle: 'Browser-scoped, cheaper, deterministic.' },
  { slug: 'browser-tests-in-gitlab-ci', title: 'Run AI browser tests in GitLab CI', keyword: 'browser tests gitlab ci', category: 'ci', angle: '.gitlab-ci.yml with --agent --headless and exit-code gating.' },
  { slug: 'browser-tests-in-circleci', title: 'Run AI browser tests in CircleCI', keyword: 'browser tests circleci', category: 'ci', angle: 'config.yml job + artifacts.' },
  { slug: 'browser-tests-in-azure-devops', title: 'Run AI browser tests in Azure DevOps', keyword: 'browser tests azure devops', category: 'ci', angle: 'azure-pipelines.yml.' },
  { slug: 'nightly-ai-regression-tests', title: 'Nightly AI regression tests with BrowserBash', keyword: 'nightly regression tests ai', category: 'ci', angle: 'Cron-triggered suites + recordings.' },
  { slug: 'dockerized-ai-browser-tests', title: 'Dockerized AI browser tests', keyword: 'dockerized browser tests', category: 'ci', angle: 'CDP to a Chrome container.' },
  { slug: 'ai-smoke-tests-in-ci', title: 'AI smoke tests in your CI pipeline', keyword: 'ai smoke tests ci', category: 'ci', angle: 'Fast post-deploy checks.' },
  { slug: 'qa-automation-without-coding', title: 'QA automation without coding', keyword: 'qa automation without coding', category: 'use-case', angle: 'Markdown tests for non-coders.' },
  { slug: 'automate-web-form-submission-ai', title: 'Automate web form submission with AI', keyword: 'automate form submission', category: 'use-case', angle: 'Fill + submit + verify.' },
  { slug: 'automate-competitor-price-monitoring', title: 'Automate competitor price monitoring', keyword: 'automate price monitoring', category: 'use-case', angle: 'Extract prices on a schedule.' },
  { slug: 'test-stripe-checkout-with-ai', title: 'Test Stripe checkout with AI', keyword: 'test stripe checkout', category: 'use-case', angle: 'End-to-end checkout verification.' },
  { slug: 'test-oauth-login-with-ai', title: 'Test OAuth and SSO login with AI', keyword: 'test oauth login', category: 'use-case', angle: 'Google sign-in flow as a test.' },
  { slug: 'broken-link-checking-with-ai', title: 'Broken link checking with an AI browser', keyword: 'broken link checker ai', category: 'use-case', angle: 'Crawl + verify.' },
  { slug: 'accessibility-checks-with-ai-browser', title: 'Accessibility checks with an AI browser', keyword: 'ai accessibility checks', category: 'use-case', angle: 'Keyboard + landmark checks.' },
  { slug: 'screenshot-testing-with-ai', title: 'Screenshot testing with BrowserBash', keyword: 'screenshot testing ai', category: 'use-case', angle: '--record screenshots across pages.' },
  { slug: 'automate-signup-funnel-testing', title: 'Automate signup funnel testing', keyword: 'signup funnel testing', category: 'use-case', angle: 'Register + verify dashboard.' },
  { slug: 'monitor-uptime-with-ai-browser', title: 'Monitor uptime and critical journeys with an AI browser', keyword: 'uptime monitoring browser', category: 'use-case', angle: 'Synthetic monitoring in English.' },
  { slug: 'scrape-job-listings-with-ai', title: 'Scrape job listings with AI', keyword: 'scrape job listings', category: 'use-case', angle: 'Extract structured rows.' },
  { slug: 'automate-data-entry-web-apps', title: 'Automate data entry in web apps', keyword: 'automate data entry web', category: 'use-case', angle: 'Repeatable form filling.' },
  { slug: 'how-to-automate-a-browser-with-english', title: 'How to automate a browser using plain English', keyword: 'automate browser with english', category: 'guide', angle: 'From zero to a working run.' },
  { slug: 'how-to-test-a-website-without-selectors', title: 'How to test a website without selectors', keyword: 'test website without selectors', category: 'guide', angle: 'Why selectors break and how AI avoids them.' },
  { slug: 'how-to-run-browser-tests-free', title: 'How to run browser tests for free', keyword: 'free browser testing', category: 'guide', angle: 'Local Chrome + Ollama, $0.' },
  { slug: 'how-to-give-an-llm-a-browser', title: 'How to give an LLM a browser', keyword: 'give llm a browser', category: 'guide', angle: 'Agent mode wiring.' },
  { slug: 'how-to-debug-flaky-ai-browser-tests', title: 'How to debug flaky AI browser tests', keyword: 'flaky browser tests', category: 'guide', angle: 'Recordings, traces, model choice, timeouts.' },
  { slug: 'prompt-engineering-for-browser-agents', title: 'Prompt engineering for browser agents', keyword: 'prompt engineering browser agent', angle: 'Objective patterns that succeed.', category: 'guide' },
  { slug: 'how-to-choose-a-local-model-for-browser-automation', title: 'How to choose a local model for browser automation', keyword: 'local model for browser automation', category: 'llm', angle: 'Size vs reliability, Qwen3/Llama 3.3 70B.' },
  { slug: 'how-to-mask-secrets-in-browser-tests', title: 'How to mask secrets in browser tests', keyword: 'mask secrets browser tests', category: 'guide', angle: 'Secret-marked variables masked in logs.' },
  { slug: 'how-to-test-a-spa-with-ai', title: 'How to test a single-page app with AI', keyword: 'test spa with ai', category: 'guide', angle: 'Waiting, dynamic content, verification.' },
  { slug: 'can-ai-solve-captchas-honest-answer', title: 'Can AI browser tools solve CAPTCHAs? An honest answer', keyword: 'ai solve captcha', category: 'guide', angle: 'Honest limits; BrowserBash does not bypass CAPTCHAs.' },
  { slug: 'llama-vs-qwen-for-browser-automation', title: 'Llama 3.3 vs Qwen3 for browser automation', keyword: 'llama vs qwen browser automation', category: 'llm', angle: 'Both via Ollama; reliability notes.' },
  { slug: 'gpt-4-vs-claude-for-browser-automation', title: 'GPT-4 vs Claude for browser automation', keyword: 'gpt-4 vs claude browser', category: 'llm', angle: 'Engine/provider implications.' },
  { slug: 'cheapest-models-for-browser-automation', title: 'The cheapest models for browser automation', keyword: 'cheapest model browser automation', category: 'llm', angle: 'Free local + cheap OpenRouter.' },
  { slug: 'is-natural-language-testing-reliable', title: 'Is natural-language browser testing reliable?', keyword: 'is ai browser testing reliable', category: 'guide', angle: 'Honest reliability + how to harden.' },
  { slug: 'natural-language-vs-code-based-testing', title: 'Natural-language vs code-based test automation', keyword: 'natural language vs code testing', category: 'comparison', angle: 'Where each wins; hybrids.' },
  { slug: 'ai-browser-testing-for-startups', title: 'AI browser testing for startups', keyword: 'browser testing for startups', category: 'use-case', angle: 'Ship fast with thin QA.' },
  { slug: 'ai-browser-testing-for-agencies', title: 'AI browser testing for agencies', keyword: 'browser testing for agencies', category: 'use-case', angle: 'Per-client suites cheaply.' },
  { slug: 'ai-testing-for-shopify-stores', title: 'AI testing for Shopify stores', keyword: 'shopify checkout testing', category: 'use-case', angle: 'Cart-to-checkout journeys.' },
  { slug: 'ai-testing-for-wordpress-sites', title: 'AI testing for WordPress sites', keyword: 'wordpress site testing ai', category: 'use-case', angle: 'Forms, login, content checks.' },
  { slug: 'ai-testing-for-nextjs-apps', title: 'AI browser testing for Next.js apps', keyword: 'nextjs e2e testing ai', category: 'use-case', angle: 'SPA + SSR flows.' },
  { slug: 'migrate-from-selenium-to-browserbash', title: 'Migrating from Selenium to BrowserBash', keyword: 'migrate selenium to ai', category: 'guide', angle: 'Selector tests to English objectives.' },
  { slug: 'migrate-from-cypress-to-browserbash', title: 'Migrating from Cypress to BrowserBash', keyword: 'migrate cypress to ai', category: 'guide', angle: 'When and how.' },
  { slug: 'migrate-from-playwright-to-browserbash', title: 'Should you migrate from Playwright to BrowserBash?', keyword: 'migrate playwright to ai', category: 'guide', angle: 'Honest: keep Playwright + add AI.' },
  { slug: 'ai-browser-automation-pricing-explained', title: 'What AI browser automation really costs', keyword: 'ai browser automation cost', category: 'guide', angle: 'Local $0 vs hosted token costs.' },
  { slug: 'natural-language-browser-automation-for-product-managers', title: 'Natural-language browser automation for product managers', keyword: 'browser automation for pms', category: 'use-case', angle: 'PMs writing their own checks.' },
  { slug: 'end-to-end-testing-with-ai-for-beginners', title: 'End-to-end testing with AI for beginners', keyword: 'e2e testing for beginners', category: 'guide', angle: 'First suite from scratch.' },
  { slug: 'browser-automation-glossary', title: 'A browser automation glossary for 2026', keyword: 'browser automation glossary', category: 'guide', angle: 'Engine, provider, agent mode, CDP, headless defined.' },
  { slug: 'why-selectors-break-and-ai-fixes-it', title: 'Why CSS selectors break (and how AI fixes it)', keyword: 'css selectors break', category: 'guide', angle: 'Brittleness vs self-healing.' },
  { slug: 'browser-automation-without-api-keys', title: 'Browser automation without API keys', keyword: 'browser automation no api key', category: 'guide', angle: 'The local Ollama path.' },
  { slug: 'how-to-record-browser-test-videos', title: 'How to record browser test videos automatically', keyword: 'record browser test video', category: 'guide', angle: '--record .webm + trace.' },
  { slug: 'how-to-attach-to-chrome-with-cdp', title: 'How to attach automation to Chrome with CDP', keyword: 'attach to chrome cdp', category: 'guide', angle: '--cdp-endpoint walkthrough.' },
  { slug: 'ai-testing-for-design-systems', title: 'AI browser testing for design systems and component libraries', keyword: 'design system testing', category: 'use-case', angle: 'Story-by-story checks.' },
  { slug: 'ai-testing-for-crm-platforms', title: 'AI testing for CRM platforms', keyword: 'crm testing automation', category: 'use-case', angle: 'Record-heavy flows.' },
  { slug: 'ai-testing-for-banking-portals', title: 'AI testing for banking and finance portals', keyword: 'banking portal testing', category: 'use-case', angle: 'Secrets + careful scope.' },
  { slug: 'ai-testing-for-government-services', title: 'AI testing for government service portals', keyword: 'gov portal testing', category: 'use-case', angle: 'Accessibility + long forms.' },
  { slug: 'browserbash-for-solo-developers', title: 'BrowserBash for solo developers', keyword: 'testing for solo developers', category: 'use-case', angle: 'One person, real coverage.' },
  { slug: 'natural-language-api-and-ui-testing-together', title: 'Combining API and UI testing with AI', keyword: 'api and ui testing', category: 'guide', angle: 'UI via BrowserBash, API alongside.' },
  { slug: 'how-to-write-a-bug-repro-with-ai-browser', title: 'How to capture a bug reproduction with an AI browser', keyword: 'bug reproduction recording', category: 'use-case', angle: '--record a repro to share.' },
  { slug: 'ci-cd-browser-testing-best-practices-2026', title: 'CI/CD browser testing best practices in 2026', keyword: 'ci browser testing best practices', category: 'ci', angle: 'Agent mode + gating patterns.' },
  { slug: 'browserbash-vs-cypress-vs-playwright-vs-selenium', title: 'BrowserBash vs Cypress vs Playwright vs Selenium', keyword: 'browserbash vs cypress vs playwright vs selenium', category: 'comparison', angle: 'Four-way decision guide.' },
  { slug: 'free-alternatives-to-paid-test-platforms', title: 'Free alternatives to paid AI test platforms', keyword: 'free ai test platform', category: 'alternatives', angle: 'OSS-first stack.' },
  { slug: 'browser-automation-for-data-journalists', title: 'Browser automation for data journalists', keyword: 'browser automation journalism', category: 'use-case', angle: 'Extract from public sites ethically.' },
]

const RESEARCH_BUCKETS = [
  { key: 'kane-cli', focus: 'Kane CLI (KaneAI / Kane CLI terminal browser agent) and the keywords it ranks for: terminal AI browser, CLI web agent, command-line browser automation. Propose BrowserBash article angles that target the same searches honestly.' },
  { key: 'browse-sh', focus: 'browse.sh and similar CLI/terminal browser-agent tools, the keywords they rank for, and adjacent searches (curl-style browsing, scriptable AI browser).' },
  { key: 'ai-agents-geo', focus: 'AI agents / chatbots that browse the web (ChatGPT, Claude, Gemini, operator, computer use, MCP, browser-use, Skyvern) and the high-intent questions people search — ideal for GEO and the on-site chatbot.' },
  { key: 'frameworks', focus: 'Playwright / Selenium / Cypress / Puppeteer ecosystems: comparison, alternatives, and migration searches not already covered.' },
]

const SPECS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    keywordNotes: { type: 'string' },
    specs: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          keyword: { type: 'string' },
          category: { type: 'string', enum: ['comparison','alternatives','guide','use-case','agents','ci','llm','security'] },
          angle: { type: 'string' },
        },
        required: ['slug','title','keyword','category','angle'],
      },
    },
  },
  required: ['specs'],
}

const RESULT = {
  type: 'object', additionalProperties: false,
  properties: {
    slug: { type: 'string' }, file: { type: 'string' }, wordCount: { type: 'number' },
    kind: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' },
  },
  required: ['slug','file','wordCount','ok'],
}

function buildPrompt(spec, date) {
  const file = `${BLOG}/${spec.slug}.md`
  const isTut = spec.kind === 'tutorial'
  const rules = isTut ? RULES_TUTORIAL : RULES_ARTICLE
  const cat = isTut ? 'tutorial' : spec.category
  return `Write ONE ${isTut ? 'in-depth, hands-on TUTORIAL' : 'high-quality ~3000-word SEO article'} for the BrowserBash blog, then save it.

SPEC:
- Title: ${spec.title}
- Primary keyword: ${spec.keyword}
- Category (frontmatter): ${cat}
- Angle: ${spec.angle}
- Publish date (frontmatter): ${date}
- Save to this EXACT path (Write tool): ${file}

${FACTS}

${CLI_FACTS}

${rules}

Now: ${isTut ? 'research from the CLI surface above (every command must be accurate)' : `research ${spec.keyword} accurately and honestly (hedge where competitor facts are not public)`}, write the full markdown (hit the length requirement), and use the Write tool to save it to ${file}. After writing, report slug="${spec.slug}", the file path, kind="${spec.kind}", an accurate body wordCount, ok=true if it has valid frontmatter (category: ${cat}) + a ## FAQ with 4 questions + meets length, else ok=false with a note.`
}

// ---- Phase 1: research competitor keywords ----
phase('Research')
const existing = new Set(["agentic-testing-explained","ai-accessibility-testing-guide","ai-agent-browser-automation","ai-agents-driving-browsers-ndjson","ai-browser-testing-cli","ai-browser-tests-jenkins-pipeline","ai-data-extraction-from-websites","ai-end-to-end-testing-guide","ai-form-filling-automation-guide","ai-login-flow-testing","ai-smoke-testing-guide","ai-test-case-generation-guide","ai-testing-for-b2b-saas-dashboards","ai-testing-for-ecommerce-product-catalogs","ai-testing-for-edtech-and-lms-platforms","ai-testing-for-fintech-apps","ai-testing-for-healthcare-saas-hipaa","ai-testing-for-internal-tools-and-back-office","ai-testing-for-marketplaces-two-sided-flows","ai-testing-for-mobile-web-responsive","ai-testing-for-travel-and-booking-sites","ai-testing-tools-for-no-code-teams","ai-tools-for-sdets","ai-visual-regression-testing-guide","anthropic-computer-use-alternatives-2026","appium-alternative-web-ai-testing","appium-alternatives-web-testing-2026","appium-vs-browserbash-for-mobile-web","appium-vs-playwright","appium-vs-selenium","applitools-alternatives-visual-testing-2026","applitools-vs-percy","autify-alternatives-2026","automate-account-deletion-and-gdpr-flows","automate-checkout-testing-stripe-paypal","automate-competitor-monitoring-web-changes","automate-customer-support-portal-testing","automate-data-extraction-from-websites-cli","automate-form-validation-testing-edge-cases","automate-login-testing-across-environments","automate-multi-step-workflow-testing","automate-price-monitoring-with-ai-agent","automate-saas-onboarding-flow-testing","automate-search-functionality-testing","automate-signup-flow-testing","automate-subscription-billing-flow-testing","autonomous-testing-platforms-guide","best-ai-browser-automation-tools","best-ai-testing-tools-2026","best-ai-web-scraping-tools-2026","best-anthropic-computer-use-alternatives","best-applitools-alternatives-for-ai-testing","best-browserbase-alternatives-2026","best-codeless-automation-frameworks-2026","best-end-to-end-testing-frameworks-2026","best-llm-browser-agents-2026","best-natural-language-testing-tools-2026","best-no-code-test-automation-tools-2026","best-self-healing-test-automation-tools-2026","best-testrigor-alternatives-2026","browse-sh-alternatives","browser-automation-for-developers-pre-commit","browser-automation-for-growth-marketers","browser-automation-for-indie-hackers","browser-automation-for-product-managers","browser-automation-for-qa-teams-scaling","browser-automation-for-startup-founders","browser-automation-without-api-keys","browser-automation-without-selectors","browser-testing-circleci-natural-language","browser-testing-github-actions-ci","browser-use-vs-stagehand","browserbase-alternatives-2026","browserbase-vs-steel-dev","browserbash-vs-accelq","browserbash-vs-agent-e","browserbash-vs-anchor-browser","browserbash-vs-anthropic-computer-use","browserbash-vs-appium","browserbash-vs-applitools","browserbash-vs-autify","browserbash-vs-autogpt-browsing","browserbash-vs-browse-sh","browserbash-vs-browser-use","browserbash-vs-browserbase","browserbash-vs-browserless","browserbash-vs-bugbug","browserbash-vs-chatgpt-operator","browserbash-vs-checkly","browserbash-vs-claude-in-chrome","browserbash-vs-codeceptjs","browserbash-vs-convergence-ai","browserbash-vs-cypress","browserbash-vs-fellou","browserbash-vs-functionize","browserbash-vs-genspark","browserbash-vs-ghost-inspector","browserbash-vs-hyperbrowser","browserbash-vs-hyperwrite","browserbash-vs-induced-ai","browserbash-vs-kane-cli","browserbash-vs-katalon","browserbash-vs-lavague","browserbash-vs-leapwork","browserbash-vs-mabl","browserbash-vs-manus","browserbash-vs-meticulous","browserbash-vs-midscene","browserbash-vs-momentic","browserbash-vs-multion","browserbash-vs-nightwatch","browserbash-vs-nova-act","browserbash-vs-octomind","browserbash-vs-openai-operator","browserbash-vs-percy","browserbash-vs-playwright-mcp","browserbash-vs-playwright","browserbash-vs-project-mariner","browserbash-vs-puppeteer","browserbash-vs-qa-wolf","browserbash-vs-rainforest-qa","browserbash-vs-ranorex","browserbash-vs-reflect","browserbash-vs-robot-framework","browserbash-vs-sauce-labs","browserbash-vs-selenium-ide","browserbash-vs-selenium","browserbash-vs-shortest","browserbash-vs-skyvern","browserbash-vs-smartbear","browserbash-vs-stably","browserbash-vs-stagehand","browserbash-vs-steel-dev","browserbash-vs-taiko","browserbash-vs-testcafe","browserbash-vs-testcomplete","browserbash-vs-testim","browserbash-vs-testrigor","browserbash-vs-testsigma","browserbash-vs-tricentis-tosca","browserbash-vs-virtuoso","browserbash-vs-webdriverio","browserbash-vs-webvoyager","browserbash-vs-zerostep","browserstack-ai-test-automation","bugbug-alternatives-2026","checkly-alternatives-synthetic-monitoring-2026","checkly-vs-browserbash-synthetic-monitoring","checkly-vs-ghost-inspector","ci-cd-browser-smoke-tests","ci-exit-codes-no-parsing","claude-computer-use-vs-operator","claude-in-chrome-vs-cli-testing","cloud-browser-infrastructure-compared","codeceptjs-alternatives-2026","codeceptjs-vs-playwright","codeless-test-automation-tools-compared","computer-use-agents-for-testing","continuous-testing-with-ai","convert-selenium-ide-recordings-to-plain-english","cross-browser-testing-with-ai","cross-grid-one-flag","cypress-vs-puppeteer","ecommerce-checkout-test-automation-ai","exploratory-testing-ai-agent","flaky-test-root-cause-analysis","form-testing-automation","free-ai-browser-automation","free-playwright-alternatives","functionize-alternatives-2026","ghost-inspector-alternatives-2026","github-actions-matrix-cross-browser-ai-tests","google-project-mariner-alternatives-2026","google-project-mariner-vs-operator","headless-browser-automation-guide","how-ai-agents-verify-web-apps","how-to-replace-selenium-ide-with-ai","integrate-ai-browser-tests-gitlab-ci","kane-cli-alternatives","katalon-vs-selenium","lambdatest-natural-language-testing","lambdatest-vs-browserstack-ai-test-migration","lavague-vs-stagehand","llm-powered-qa-guide","local-llm-browser-testing","magnitude-vs-browserbash","manus-ai-alternatives-browser-tasks-2026","markdown-test-files-tutorial","markdown-tests-living-documentation","meticulous-alternatives-2026","meticulous-vs-ai-agent-testing","midscene-alternatives-2026","midscene-vs-browserbash","midscene-vs-stagehand","midscene-vs-zerostep-vs-browserbash","migrate-anthropic-computer-use-to-browser-cli","migrate-checkly-to-ai-browser-monitoring","migrate-codeceptjs-to-natural-language-tests","migrate-cypress-tests-to-ai-browser-automation","migrate-from-sauce-labs-to-open-source-ai-testing","migrate-ghost-inspector-to-open-source-ai-testing","migrate-playwright-suite-to-browserbash","migrate-puppeteer-scripts-to-plain-english","migrate-qa-wolf-to-self-hosted-ai-testing","migrate-rainforest-qa-to-ai-agent-testing","migrate-robot-framework-to-ai-browser-testing","migrate-selenium-to-natural-language-testing","migrate-testcafe-tests-to-ai-cli","migrating-from-testcomplete-to-ai-tests","momentic-alternatives-2026","monitor-production-flows-synthetic-checks","natural-language-browser-automation","natural-language-test-automation-guide","natural-language-web-scraping","ndjson-agent-mode-tutorial","octomind-alternatives-2026","octomind-vs-meticulous","ollama-free-local-stack","open-source-selenium-alternatives","openai-operator-alternatives-2026","openrouter-free-models-browser-testing","openrouter-free-models-ci-browser-testing","openrouter-hundreds-of-models","operator-vs-browser-use","page-object-model-alternatives","percy-alternatives-visual-regression-2026","plain-english-end-to-end-tests","playwright-mcp-vs-browser-use","playwright-vs-cypress","playwright-vs-puppeteer","playwright-vs-webdriverio","prompt-based-browser-automation-guide","qa-automation-without-code","qa-wolf-alternatives-2026","qa-wolf-vs-browserbash-for-startups","qa-wolf-vs-mabl","rainforest-qa-alternatives-2026","ranorex-alternatives-2026","record-browser-test-videos-cli","reduce-flaky-end-to-end-tests","reflect-run-alternatives-2026","reflect-vs-rainforest-qa","regression-testing-with-ai-agents","replace-page-objects-with-plain-english","robot-framework-alternatives-2026","robot-framework-vs-ai-testing","robot-framework-vs-selenium","run-browser-tests-on-browserbase-tutorial","run-browser-tests-with-ollama","sauce-labs-alternatives-2026","sauce-labs-vs-browserbash-cross-browser","sauce-labs-vs-browserstack","secret-handling-ai-browser-tests-ci","secrets-masking-credential-safety","selenium-ide-alternatives-2026","selenium-ide-vs-cypress","selenium-page-objects-vs-plain-english","selenium-vs-cypress","selenium-vs-playwright","self-healing-test-automation-explained","shortest-vs-browserbash","skyvern-vs-browser-use","smoke-test-staging-before-deploy","smoke-tests-in-plain-english","stagehand-vs-browser-use-vs-skyvern","stagehand-vs-skyvern","synthetic-monitoring-with-ai-agents","taiko-alternatives-2026","taiko-vs-browserbash","test-automation-for-startups","test-automation-roi-calculator","testcafe-vs-cypress","testcomplete-alternatives-2026","testim-vs-mabl","testrigor-alternatives-2026","testrigor-vs-testim","testsigma-alternatives-2026","testsigma-vs-testrigor","tricentis-tosca-alternatives-2026","use-ollama-models-for-browser-test-automation","web-agent-benchmarks-explained","why-css-selectors-are-brittle"])
const research = await parallel(RESEARCH_BUCKETS.map((b) => () =>
  agent(
    `You are an SEO strategist for BrowserBash (a free, open-source natural-language browser-automation CLI). ` +
    `Use WebSearch/WebFetch to research: ${b.focus}\n\n` +
    `Return up to 18 NEW article specs that target real search keywords in this space. Each spec: a short kebab-case slug (a-z0-9-), a compelling title, the primary keyword, a category from the allowed enum, and a one-line angle. ` +
    `Honest brand voice: never fabricate competitor pricing/features. Avoid generic duplicates. Also return a short keywordNotes summary of what competitors rank for.`,
    { label: `research:${b.key}`, phase: 'Research', schema: SPECS_SCHEMA }
  )
))
const researched = research.filter(Boolean).flatMap((r) => (r.specs || []))
research.filter(Boolean).forEach((r, i) => r.keywordNotes && log(`[${RESEARCH_BUCKETS[i]?.key}] ${String(r.keywordNotes).slice(0, 240)}`))
log(`Research returned ${researched.length} candidate specs`)

// ---- Build the final write list: tutorials + (research-first, fallback top-up) articles ----
const tutorialSlugs = new Set(TUTORIAL_SPECS.map((t) => t.slug))
const taken = new Set([...existing, ...tutorialSlugs])
const slugOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{2,80}$/.test(s)

const articleSpecs = []
for (const c of [...researched, ...FALLBACK_ARTICLE_SPECS]) {
  if (articleSpecs.length >= TARGET_ARTICLES) break
  if (!c || !slugOk(c.slug) || taken.has(c.slug)) continue
  taken.add(c.slug)
  articleSpecs.push(c)
}
log(`Final plan: ${TUTORIAL_SPECS.length} tutorials + ${articleSpecs.length} articles = ${TUTORIAL_SPECS.length + articleSpecs.length} new posts`)

const allSpecs = [
  ...TUTORIAL_SPECS.map((t) => ({ ...t, kind: 'tutorial' })),
  ...articleSpecs.map((a) => ({ ...a, kind: 'article' })),
]

// ---- Phase 2: write every post ----
phase('Write')
const out = await pipeline(allSpecs, (spec, _orig, i) =>
  agent(buildPrompt(spec, DATES[i % DATES.length]), { label: `write:${spec.slug}`, phase: 'Write', schema: RESULT })
)
const done = out.filter(Boolean)
const ok = done.filter((r) => r && r.ok)
const short = done.filter((r) => r && (!r.ok || r.wordCount < 2500))
log(`Wrote ${done.length}/${allSpecs.length} posts; ${ok.length} ok; ${short.length} flagged short/invalid`)
return {
  requested: allSpecs.length,
  tutorials: TUTORIAL_SPECS.length,
  articles: articleSpecs.length,
  written: done.length,
  ok: ok.length,
  flagged: short.map((r) => ({ slug: r.slug, words: r.wordCount, note: r.note || '' })),
  slugs: done.map((r) => r.slug),
}
