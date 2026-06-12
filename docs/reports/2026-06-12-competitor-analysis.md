# Competitor Analysis — browse.sh & Kane CLI vs BrowserBash

**Date:** 2026-06-12 · Two independent research agents, all claims verified against live pages (sources at bottom of each section).

## TL;DR

| | browse.sh / Browse CLI (Browserbase) | Kane CLI (TestMu AI / LambdaTest) | BrowserBash |
| --- | --- | --- | --- |
| What it is | Skill catalog + deterministic browser *primitives* for agents you already run | Hosted-LLM agentic CLI, near-identical surface to ours | Open natural-language agent CLI |
| Account required | No (cloud features need Browserbase) | **Yes — mandatory login before any run** | **No, ever** |
| LLM | None built in (host agent's brain) | Hosted KaneAI, **credit-metered** ($0/200cr → $99/10k cr) | **Yours: Ollama free/local, Anthropic, OpenRouter** |
| Source | MIT, open | Apache-2.0 repo but **engine ships as closed binaries** | **Apache-2.0, full source** |
| Test runner | None | `*_test.md` (same idea as ours) | `*_test.md` + `@import` |
| Clouds | Browserbase only | TestMu/LambdaTest grid only | **Browserbase + LambdaTest + BrowserStack + any CDP** |
| Privacy | Cloud-centric | **Every run uploads to their dashboard** | **Local by default, nothing phones home** |

## Features they have that we don't (roadmap candidates, priority order)

1. **Step caching & replay** (Kane) — first run agentic, replays cost zero LLM tokens. Their best CI argument; directly answers "AI tests are slow/expensive". *Effort: high, value: highest.*
2. **Playwright code export** (Kane) — `testmd export` to native Playwright. Adoption de-risker. *Effort: medium.*
3. **DevTools checkpoints** (Kane) — assert on network 5xx, console errors, LCP budgets, cookies. *Effort: medium.*
4. **Agent-skill installer** (Kane: `npx @testmuai/kane-cli-skill`; browse.sh: Claude Code plugin) — one command seeds Claude Code/Cursor/Codex with "use this tool". Cheap, high-leverage distribution. *Effort: LOW — do before/at launch.*
5. **Skill/playbook catalog + llms-full.txt** (browse.sh: 500+ site playbooks) — content moat, community-buildable. *Effort: large, content-driven.*
6. **Record live run → committed test** (Kane) — `run --name x` writes `x_test.md`. *Effort: low-medium.*
7. **Persistent sessions/auth contexts, network tailing, serverless deploys** (browse.sh cloud) — platform plays, defer.

## Our USPs (landing-ready, now live on the site)

- **No signup, ever** — install and automate in 60 s; no login command, no credits, no dashboard upload.
- **Open source all the way down** — Apache-2.0 with the agent loop in the repo (Kane ships closed binaries).
- **Your models, your machine** — Ollama local free/private/unmetered; Anthropic/OpenRouter one flag away.
- **Cloud-neutral** — the only tool of the three running on Browserbase *and* LambdaTest *and* BrowserStack.
- **Private by default** — runs never leave the machine unless pointed at a cloud.
- **Built for CI** — exit codes 0/1/2/3 + NDJSON; pipelines need zero parsing.

## Positioning verdict

- **vs browse.sh:** different layer — they hand tools to an agent you already pay for; BrowserBash *is* the agent. Own the QA/CI story (test runner, verdicts, secrets) which Browserbase doesn't tell.
- **vs Kane CLI:** "open-source Kane CLI without the login" practically writes itself. They're 8 weeks old, 213 stars, ~530 weekly downloads — beatable, but moving fast on agent distribution. Match their skill-installer play immediately.
- **Shared lesson:** both monetize lock-in (cloud, credits). Our counter-position is structural, not cosmetic — keep "no account / no meter / no lock-in" as the headline differentiator.

### Sources
browse.sh, browserbase.com (product/pricing/blog), docs.browserbase.com, github.com/browserbase/stagehand + /skills, npm `browse`; testmuai.com/kane-cli + docs + launch blog, github.com/LambdaTest/kane-cli, npm `@testmuai/kane-cli*`, PRNewswire/Yahoo Finance/HackerNoon coverage. Full agent reports preserved in session transcript.
