---
title: Open-source browser automation tools in 2026
description: "A practical 2026 roundup of open source browser automation tools, from Playwright and Selenium to AI agents like Stagehand, browser-use, and BrowserBash."
date: 2026-03-03
category: alternatives
---

If you are picking a stack today, the good news is that open source browser automation has never been more crowded or more capable. The classic libraries — Selenium, Puppeteer, Playwright, the core Cypress runner — are all free and source-available, and a newer wave of AI-driven agents has landed on top of them. This roundup sticks to tools you can `git clone`, read, fork, and run without a sales call. No proprietary SaaS in the main lineup, no "open core with the useful bits paywalled" sleight of hand. Just the OSS options a senior SDET would actually shortlist in 2026, what each is good at, and where the lines between them have moved.

I work on one of the tools below (BrowserBash), so read that section as the vendor talking. I have tried to keep everything else honest, including the parts where another tool is the better pick for your situation.

## What "open source" actually buys you here

Before the lineup, it is worth being precise, because "open source" gets stretched a lot in this space.

A genuinely open source tool means you can run it locally with no license key, read the source to understand a failure, and self-host or fork if the vendor's roadmap diverges from yours. Several "open source AI browser" projects are really open SDKs that default to a paid hosted model or a paid cloud browser — the code is MIT, but the experience assumes you are paying someone. That is a legitimate model, but it changes your bill and your data posture, so I will flag it per tool.

Two layers matter independently in 2026:

- **The driver** — the thing that actually talks to a real browser (WebDriver, CDP, or a wrapper over them). Selenium, Puppeteer, and Playwright live here. They are deterministic: you write selectors and steps.
- **The interpreter** — an AI layer that turns plain-English intent into those low-level actions at runtime. Stagehand, browser-use, Skyvern, and BrowserBash live here. They trade some determinism for resilience to UI changes.

Most teams in 2026 use both: a deterministic driver for the flows that rarely change, and an AI interpreter for the brittle, frequently-redesigned paths where selector maintenance was eating your week.

## The deterministic classics: Selenium, Puppeteer, Playwright

These are the load-bearing walls. If you have shipped web tests in the last decade you know them, but the 2026 status is worth restating because the AI wave sits on top of these, not instead of them.

### Selenium

Selenium is the original, licensed under Apache-2.0, and still the broadest by reach. It speaks the W3C WebDriver standard, drives every major browser, and has bindings for Java, Python, C#, Ruby, and JavaScript. Selenium Grid remains the reference answer for fan-out across a real browser/OS matrix, and a huge amount of enterprise CI is built on it. The architecture is older and chattier than CDP-native tools, and you feel that in flake and in the amount of explicit waiting you write. But if your org standardized on Selenium years ago, the ecosystem depth is hard to walk away from.

### Puppeteer

Puppeteer is Google's Node library for driving Chrome and Chromium over the Chrome DevTools Protocol, under Apache-2.0. It is the cleanest path if your world is Node-and-Chromium and your job is screenshots, PDF generation, scraping, or fast headless automation. It added Firefox support over time, but its heart is Chromium. For an AI agent that only needs Chrome, Puppeteer is a lean, low-overhead foundation, which is exactly why a lot of agent frameworks wrap it.

### Playwright

Playwright, Apache-2.0 and led by Microsoft (originally by ex-Puppeteer engineers), is the one most green-field teams land on in 2026. Cross-browser across Chromium, Firefox, and WebKit, with auto-waiting, network interception, tracing, and bindings in TypeScript/JavaScript, Python, .NET, and Java. Its accessibility-tree snapshot is also why so many AI agents reach for it: the a11y tree is a compact, semantic view of the page that an LLM can read far more cheaply than a full DOM dump. When people say "the agent picked Playwright," that is usually why.

Here is the deterministic tier at a glance.

| Tool | License | Languages | Browsers | Sweet spot |
|------|---------|-----------|----------|------------|
| Selenium | Apache-2.0 | Java, Python, C#, Ruby, JS | All major | Broad enterprise matrix, Grid fan-out |
| Puppeteer | Apache-2.0 | JS/TS (Node) | Chromium (Firefox partial) | Lean Chrome scraping, PDFs, screenshots |
| Playwright | Apache-2.0 | TS/JS, Python, .NET, Java | Chromium, Firefox, WebKit | Modern cross-browser E2E, agent foundation |

If you are not doing anything AI-shaped yet, one of these three is your answer, and the choice mostly comes down to your existing language and how much cross-browser coverage you truly need. None of them understands "log in and check the invoice total" — you still write every selector and assertion by hand. That is the gap the next tier fills.

## The AI interpreter wave: natural-language automation

The shift since 2024 is that you can describe intent in English and let a model resolve it against the live page at runtime. Click the submit button survives a redesign that moves or renames the button, because the model re-finds it each run instead of relying on a frozen selector. That resilience is the whole pitch. The cost is non-determinism, latency, and a model bill — unless the tool lets you run a local model, which is where the open source story gets interesting.

### Stagehand

Stagehand, by Browserbase, is MIT-licensed and one of the most-adopted AI browser frameworks of 2026. It gives you four primitives — `act`, `extract`, `observe`, and `agent` — so you can mix deterministic code with AI for just the flexible parts, instead of handing an opaque agent the whole task. The v3 rewrite (early 2026) went CDP-native, dropping the hard Playwright dependency and improving performance on complex DOM interactions. Stagehand runs locally against any Chromium browser; Browserbase's cloud (session replay, captcha handling, managed browsers) is the optional paid layer. It is available in TypeScript and Python. If you want a library you embed in your own code, Stagehand is excellent and genuinely OSS at the core.

### browser-use

browser-use is an MIT-licensed Python library that wraps a browser (Playwright under the hood) and hands a capable LLM the controls to complete a task end to end. It has a large, active community and is one of the most popular "give the agent a goal and let it go" projects. It is agent-first by design — great for autonomous, exploratory tasks; less aimed at committable, deterministic regression suites. You bring your own model, and in practice people point it at a strong hosted model for hard multi-step flows.

### Skyvern

Skyvern is open source on GitHub (AGPL-3.0, with a commercial option) and takes a vision-first swarm-of-agents approach plus computer vision to operate on sites it has never seen, mapping visual elements to actions without XPaths. It is aimed squarely at production workflow automation — think filling the same gnarly form across thousands of vendor portals. The AGPL license matters: if you embed Skyvern in a network service you distribute, AGPL's obligations apply, so check with whoever owns licensing before you build a product on it. For internal automation it is a strong, battle-tested choice.

### BrowserBash

BrowserBash is the tool I work on: a free, Apache-2.0 natural-language browser automation CLI from The Testing Academy. The angle is different from the libraries above. It is a command, not a framework. You install it with `npm install -g browserbash-cli`, write a plain-English objective, and an AI agent drives a real Chrome step by step — no selectors, no page objects — then returns a pass/fail verdict plus structured extracted values. The design goal was "the AI part should be a CLI you can put in CI today," not "a library you wire up over a sprint."

The piece that makes it stand out in an OSS roundup is the model story. BrowserBash is Ollama-first. The default model is `auto`, which resolves in order: a local Ollama install (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` (Claude), then `OPENAI_API_KEY` (GPT-4.1), otherwise it errors with guidance. On a local model your model bill is a guaranteed zero. You can read more on the [features page](https://browserbash.com/features) and the [tutorials](https://browserbash.com/tutorials).

Honesty up front, because it matters when you choose: very small local models (8B and under) are flaky on long multi-step objectives. They will nail a single login or a short extraction and then lose the thread on a ten-step checkout. The sweet spot for local is a mid-size model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you only have an 8B model and a hard objective, that is a case where a hosted-model tool — or BrowserBash pointed at a hosted model — will serve you better than pretending the small model is enough.

## Comparing the AI tier honestly

Here is the natural-language tier side by side. Where a fact is not publicly documented, I have said so rather than guess.

| Tool | License | Form factor | Local-model path | CI-native verdict | Best for |
|------|---------|-------------|------------------|-------------------|----------|
| Stagehand | MIT | Library (TS/Python) | Yes (BYO model) | You build it | Embedding AI steps in your own code |
| browser-use | MIT | Library (Python) | Yes (BYO model) | You build it | Autonomous goal-driven agents |
| Skyvern | AGPL-3.0 (+ commercial) | Service/SDK | Not publicly specified as a $0 default | Partial, workflow-oriented | Production form/workflow automation at scale |
| BrowserBash | Apache-2.0 | CLI | Yes, Ollama-first, $0 default | Yes — exit codes + NDJSON | Drop-in CLI for CI and AI coding agents |

The honest read: if you want a **library** to compose AI steps into your own automation code, Stagehand or browser-use are the strongest OSS picks, and Stagehand's primitive split is especially clean. If you need **vision-first automation across unseen sites at production scale**, Skyvern is purpose-built for that, license terms permitting. If you want a **command you run in CI today** that defaults to a free local model and emits machine-readable results, that is the lane BrowserBash was built for. These overlap, but they are not the same job.

## Where BrowserBash actually fits

Two design choices separate BrowserBash from the libraries, and they are the reasons to pick it — or to skip it.

It is built for pipelines and for AI coding agents, not for hand-composition. Run it one-shot:

```bash
browserbash run "go to the staging login page, sign in with the test account, and confirm the dashboard shows a welcome message"
```

Add `--agent` and you get NDJSON — one JSON object per line, a `step` event per action and a `run_end` with status and a structured `final_state`. Exit codes are real: `0` passed, `1` failed, `2` error, `3` timeout. That means no prose parsing in CI, and an AI coding agent can read the stream directly. You can also keep tests as committable markdown:

```bash
browserbash testmd run ./checkout_test.md
```

Each list item in that file is a step, `{{variables}}` get templated, secret-marked values are masked as `*****` in every log line, and a human-readable `Result.md` is written after each run. That is the part libraries leave to you.

The provider and engine split keeps it flexible without locking you in. The interpreter (engine) is either `stagehand` (the default — yes, BrowserBash can use Stagehand under the hood) or `builtin` (an in-repo Anthropic tool-use loop over Playwright). The browser (provider) defaults to your local Chrome but can point at any CDP endpoint, or at Browserbase / LambdaTest / BrowserStack when you need a cloud grid:

```bash
browserbash run "open the pricing page and extract every plan name and monthly price" --record --model ollama/qwen3
```

`--record` captures screenshots and a `.webm` session video via bundled ffmpeg (the builtin engine also writes a Playwright trace). Every run is kept on disk at `~/.browserbash/runs` with secrets masked. Nothing leaves your machine unless you opt in: there is a fully local dashboard (`browserbash dashboard` on localhost:4477), and an optional cloud dashboard you link with `browserbash connect` and push to per-run with `--upload`. Without `--upload`, nothing is uploaded. There is no account required to run it; details are on the [pricing page](https://browserbash.com/pricing) (it is free) and the [GitHub repo](https://github.com/PramodDutta/browserbash).

When is BrowserBash the **wrong** call? If you need a programmable library to interleave AI and code at a fine grain, reach for Stagehand — a CLI is the wrong shape for that. If you need a desktop agent that drives non-browser apps, none of the browser-native tools here, BrowserBash included, replace a computer-use-class agent.

## Deterministic vs AI: a decision guide

The most common mistake I see in 2026 is treating this as either/or. It is not.

**Use a deterministic driver (Selenium / Puppeteer / Playwright) when:**

- The flow is stable and you run it thousands of times a day — you want speed and zero model latency.
- You need exact, repeatable behavior and pixel-perfect assertions.
- You are doing high-volume scraping or PDF/screenshot generation where an LLM adds cost without value.
- Cross-browser coverage across WebKit/Firefox/Chromium is a hard requirement (Playwright).

**Use an AI interpreter (Stagehand / browser-use / Skyvern / BrowserBash) when:**

- The UI changes often and selector maintenance is eating real engineering time.
- You are testing something new and writing the selectors up front is not worth it yet.
- The task is described better in English than in code ("confirm the order total matches the cart").
- You are wiring browser checks into an AI coding agent's loop and want a natural-language interface and machine-readable output.

**Most teams want both.** Keep your stable regression suite in Playwright. Put the flaky, frequently-redesigned, or exploratory paths behind an AI interpreter. BrowserBash markdown tests sit comfortably next to a Playwright suite in the same repo, and the two solve different halves of the problem. There is a worked walkthrough on the [learn page](https://browserbash.com/learn) and more patterns on the [blog](https://browserbash.com/blog).

## Cost, data, and the local-model question

For an OSS roundup, the part that actually decides budgets in 2026 is the model bill, not the framework license. Every tool in the AI tier is free to install. The recurring cost is tokens.

Three of the four AI tools (Stagehand, browser-use, BrowserBash) can run against a local model, so your token bill can be exactly zero if you self-host. The catch is the one I flagged earlier: local model quality is the constraint, not the framework. A 70B-class local model on decent hardware handles real multi-step flows; an 8B model handles short ones and starts hallucinating steps on long ones. Budget your hardware, or accept a hosted-model bill for the hard 10% of flows and keep local for the easy 90%.

Data posture follows from the same choice. On a local model, nothing about the page or your credentials leaves the machine — which is why regulated teams keep gravitating to local-first tools. The moment you call a hosted model, page content and instructions go to that provider, so check your data agreements. BrowserBash makes the boundary explicit: local by default, and the only thing that ever leaves your machine is a run you deliberately mark `--upload`. With other libraries you are responsible for knowing where your model calls go.

## How to choose in five minutes

A quick triage if you just want an answer:

- **Stable suite, no AI yet, cross-browser:** Playwright. Selenium if you are already invested there or need the widest matrix.
- **Chrome-only scraping, screenshots, PDFs:** Puppeteer.
- **Embed AI steps inside your own code:** Stagehand (cleanest primitives) or browser-use (autonomous goals).
- **Vision-first automation across many unseen sites, at scale:** Skyvern — mind the AGPL terms.
- **A CLI you drop into CI today, free local model by default, machine-readable output, runs next to your Playwright suite:** BrowserBash.

None of these is a trap. They are different shapes for different jobs, and the strongest 2026 stacks usually combine a deterministic driver with one AI interpreter rather than betting the whole thing on either side. Case studies of teams mixing both are on the [case study page](https://browserbash.com/case-study).

## FAQ

### What is the best open source browser automation tool in 2026?

There is no single best — it depends on the job. For deterministic cross-browser testing, Playwright is the most common 2026 pick, with Selenium for the widest enterprise matrix and Puppeteer for lean Chrome work. For natural-language AI automation, Stagehand and browser-use are the leading libraries, and BrowserBash is the strongest fit if you want a ready-made CLI with a free local-model default. Pick by form factor and whether you need determinism or resilience to UI changes.

### Are AI browser automation tools really open source or just free SDKs?

Both kinds exist, so read the fine print. Stagehand (MIT) and browser-use (MIT) are genuinely open source at the core but assume you bring your own model, and they default to paid hosted models in most real usage. Skyvern is AGPL-3.0 with a commercial option, which carries network-service obligations. BrowserBash is Apache-2.0 and defaults to a free local Ollama model with no keys, so it can be both open source and zero-cost to run.

### Can I run open source browser automation without paying for an AI model?

Yes, in two ways. The deterministic tools — Selenium, Puppeteer, Playwright — use no AI model at all, so there is never a token bill. Among AI tools, BrowserBash, Stagehand, and browser-use can run against a local model via Ollama or similar, which keeps your model cost at zero. The trade-off is that small local models (8B and under) struggle on long multi-step flows; a mid-size 70B-class local model is the practical sweet spot.

### Do I need to replace Playwright or Selenium with an AI agent?

No, and most teams should not. The strongest 2026 stacks keep a deterministic Playwright or Selenium suite for stable, high-volume flows and add an AI interpreter only for the brittle or frequently-redesigned paths where selector maintenance is expensive. BrowserBash markdown tests, for example, live in the same repo alongside a Playwright suite and handle the half of the problem that selectors handle badly.

Open source browser automation in 2026 is less about one winner and more about composing the right two layers. Start with a deterministic driver you trust, then add an AI interpreter where the UI keeps moving under you. If you want the AI layer to be a single command with a free local-model default and CI-ready output, install BrowserBash and run one objective end to end:

```bash
npm install -g browserbash-cli
```

No account needed to run it — sign up only if you want the optional cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
