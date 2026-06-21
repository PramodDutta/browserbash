---
title: Open-source RPA tools in 2026
description: "Open source RPA in 2026: an honest roundup of Robot Framework, Skyvern, TagUI, UI.Vision, OpenRPA, and where AI browser automation fits."
date: 2026-03-16
category: alternatives
---

If you are evaluating open source RPA in 2026, the landscape looks very different from the macro-recorder era. The category used to mean one thing: a desktop tool that watched you click around a Windows app and replayed the clicks later. That tool still exists, and for legacy desktop work it is still the right answer. But a second branch has grown next to it — AI agents that read a page and decide what to do — and the two now overlap enough that picking a tool is genuinely confusing. This guide is a roundup of the serious free and open-source options, what each one is good at, and where AI-driven browser automation changes the math. I work on one of the tools mentioned (BrowserBash), so I have flagged that section as the vendor talking and kept the rest straight, including where a competitor is the better call.

The short version: "RPA" is a fuzzy word that covers desktop automation, browser automation, document processing, and orchestration, and no single open-source project owns all of it. What you should choose depends almost entirely on *where your task lives* — on a desktop, in a browser, or across both.

## What "RPA" means in 2026 (and why the word is slippery)

Robotic Process Automation started as a way to bolt scripts onto software that had no API. A bank had a green-screen terminal, a web portal, and an Excel macro, and RPA was the glue that moved data between them by pretending to be a human: moving the mouse, typing into fields, reading values off the screen. That is still the core promise. The "robot" is a software agent that operates the user interface of other applications.

Two things have shifted the meaning since then.

First, the world moved to the browser. A large share of what used to be desktop RPA is now "drive a web app," because the systems people automate — CRMs, billing portals, admin dashboards, internal tools — are web apps. That makes browser automation the center of gravity for a lot of RPA work, even when the tool calls itself something else.

Second, large language models made plain-English automation real. Instead of recording exact clicks or hand-writing selectors, you describe an outcome and let a model figure out the steps. This is the AI branch, and it overlaps heavily with what people now call "AI browser automation" or "browser agents." Some of these tools market themselves as RPA; some do not. The capability is what matters, not the label.

So when someone says "open source RPA," they could mean any of: a Robot Framework keyword library, a vision-LLM browser agent, a Windows workflow designer, or a browser extension that records macros. This roundup covers all of those, grouped honestly so you can tell which branch you are standing in.

## The open-source RPA shortlist at a glance

Here is the map before the deep dives. Everything in this table is publicly known as of early 2026; where a fact is not public, I say "not publicly specified" rather than guess. Licenses and project ownership change, so verify the repo before you commit.

| Tool | Branch | Primary scope | Language / interface | License (as of 2026) | Plain-English / AI driven |
|------|--------|---------------|----------------------|----------------------|---------------------------|
| Robot Framework + RPA Framework (Robocorp) | Keyword automation | Web + desktop + API | Python / Robot syntax | Open source (Apache-2.0 family) | No — keyword/script based |
| Skyvern | AI browser agent | Browser | Python / API + SDK | AGPL-3.0 (core) | Yes — vision-LLM + DOM |
| TagUI | Script RPA | Web + GUI + data | English-like DSL | Open source (Apache-2.0) | Partial — natural-ish syntax |
| UI.Vision | Visual / desktop RPA | Browser + desktop | Browser extension + image/OCR | Open source (free tier) | Partial — visual + CU integration |
| OpenRPA | Enterprise desktop RPA | Windows desktop | Workflow designer (.NET) | Open source (MPL-2.0) | No — workflow based |
| BrowserBash | AI browser CLI | Browser only | Node CLI + test runner | Apache-2.0 | Yes — natural-language agent |

Read that as a starting map, not a verdict. The right pick depends on whether your task is desktop-shaped, browser-shaped, or both, and on whether you want a script you control or an agent that figures things out.

## Robot Framework and the Robocorp RPA Framework

If you want the most "engineering-grade" open-source RPA, this is usually where you land. Robot Framework is a mature, Python-based, keyword-driven automation engine that has been around for well over a decade. It was built for test automation but is fully general — it drives browsers (via Selenium or Playwright libraries), desktop apps, APIs, databases, and more through a large ecosystem of keyword libraries.

The **RPA Framework** is a collection of open-source libraries from Robocorp designed specifically for RPA use cases on top of Robot Framework and plain Python. It bundles the things process automation actually needs: browser control, Excel and PDF handling, email, file system work, HTTP, and cloud connectors. Robocorp also ships **RCC**, an open-source command-line tool for reproducible, isolated automation environments, which is one of the genuinely strong parts of the stack for anyone who has fought Python dependency hell in production.

One thing to know going in: Robocorp was acquired by Sema4.ai in 2024, and the offering now spans an open-source developer side (RPA Framework, RCC, the libraries) and a commercial enterprise AI-agent platform. The open-source pieces remain actively maintained in 2026 — recent releases even add Sema4.ai integration packages — but the company's center of gravity has clearly moved toward enterprise AI agents. For an open-source-first team that wants no vendor lock-in, the framework and RCC are still very usable on their own.

### Where it shines

Robot Framework is the right call when you want determinism, version control, and a real testing heritage. Your automations are text files. They diff cleanly in pull requests. They run in CI without drama. The keyword model is readable enough that a mixed QA/dev team can maintain it, and the library ecosystem means you rarely hit a wall. For document-heavy back-office automation — read this PDF, update that spreadsheet, post to this endpoint — the RPA Framework libraries do a lot of the boring work for you.

### Where it asks more of you

It is selector-based and script-based. There is no AI figuring out a changed layout for you; if a button moves or an id changes, your locator breaks and you fix it. That is a feature if you value predictability and a cost if you are automating brittle third-party UIs that change weekly. There is also a learning curve — Robot syntax plus the relevant libraries plus RCC is real surface area before your first robot ships.

## Skyvern: AI browser automation that markets itself as RPA

Skyvern is the clearest example of the new branch. It is an open-source (AGPL-3.0 for the core) project that automates browser-based workflows using vision LLMs plus DOM understanding, and it has picked up serious traction — north of 20,000 GitHub stars as of mid-2026. It ships a Playwright-compatible SDK, an API, and a no-code workflow builder, and it positions itself squarely at RPA-adjacent "WRITE" tasks: logging in, filling forms, downloading files, walking multi-step flows.

The pitch is that instead of hand-coding XPath for every site, Skyvern's models look at the page and figure out the interaction, which makes it more resilient to layout changes than a pure-selector script. The managed Skyvern Cloud adds the operational hard parts that pure open source leaves to you — anti-bot handling, a proxy network, CAPTCHA solving — while the self-hostable core stays open.

### Where it shines

Skyvern is a strong fit when your "RPA" is really *web* automation at scale and the target sites change often or vary across tenants. Because it leans on vision and the DOM rather than brittle locators, it handles a class of layout drift that would break a recorded macro. The workflow builder lowers the barrier for less code-heavy users, and the self-host option keeps you off a proprietary cloud if compliance matters.

### Where to be careful

The AGPL-3.0 license on the core is a real consideration for some companies — if you build a network service on top of a modified version, AGPL's source-sharing obligations apply, so check with whoever owns licensing decisions. And like every LLM-driven agent, it is browser-scoped: it automates web pages, not arbitrary desktop apps. Skyvern is honest about this boundary itself. For the desktop or cross-application half of RPA, it is not the tool.

## TagUI: free, English-like script RPA

TagUI is a free, open-source RPA tool from AI Singapore (a government-funded initiative), and it is one of the friendlier on-ramps in the category. It uses an English-like DSL — you write steps like `click`, `type`, `read`, `snap` in near-plain language — and it runs cross-platform on Windows, macOS, and Linux. It can drive web browsers, interact with GUI elements via image matching, and pull data out of pages. It remained actively maintained into 2026.

TagUI sits between the worlds. It is not a full AI agent — you still write the steps — but the syntax is approachable enough that non-programmers get productive quickly, and it bridges to Python when you need real logic. There is also a Python package (`tagui`) for people who would rather script it from Python directly.

### Where it shines

TagUI is a great pick for teams that want something free, scriptable, and readable without standing up an enterprise platform. The English-like flow is genuinely easy to teach. For straightforward, repeatable web and GUI tasks — scrape this table daily, fill this form from a CSV, log in and download a report — it is fast to write and easy to hand off.

### Where it asks more of you

It is still step-based. You describe the actions, not just the outcome, so when a site changes you maintain the script. Image-based GUI matching is powerful but can be fiddly across resolutions and themes. And while the community is real, it is smaller than the Selenium/Playwright universe, so you lean more on the project's own docs than on a giant Stack Overflow corpus.

## UI.Vision: visual and desktop automation in the browser

UI.Vision (formerly Kantu) is an open-source RPA tool built around a browser extension, with strengths in visual automation: image recognition, OCR, web scraping, and codeless UI test automation. Because it can see the screen rather than only read the DOM, it crosses the browser boundary into desktop automation in a way most pure-web tools do not — it can automate things outside the browser using image and OCR matching, and it has leaned into integrating with computer-use-style models for AI-driven control.

### Where it shines

UI.Vision is a sensible choice when your automation needs *eyes* — visual checks, OCR on a rendered document, or driving something that has no clean DOM. The browser-extension model makes it approachable, and the visual/codeless approach suits people who are not going to write Robot syntax. The desktop reach via image recognition is a genuine differentiator among the "started in the browser" tools.

### Where to be careful

Image- and OCR-based automation is inherently more brittle than DOM-based: scaling, themes, and minor pixel changes can throw off a match, and it is slower than reading structured page data. Some advanced features sit behind a paid tier even though the core is free, so confirm the capabilities you need are in the open-source portion.

## OpenRPA: enterprise-style desktop RPA, open source

OpenRPA is an open-source (MPL-2.0) RPA platform aimed at the classic enterprise desktop use case — the UiPath/Automation Anywhere shape, but free. It is built on Microsoft Workflow Foundation, so you design automations as visual workflows, and it pairs with OpenFlow (and Node-RED) for orchestration, queues, and deployment. It is Windows-centric and strongest at desktop and Windows-application automation.

### Where it shines

If you need traditional, Windows-heavy desktop RPA with a visual designer and an orchestration layer — robots running on schedules, work queues, a management surface — and you do not want per-bot commercial licensing, OpenRPA is one of the few open-source options that targets that exact niche. For automating native Windows applications, it is far more at home than any browser-first tool here.

### Where to be careful

It is the heaviest setup on this list — the visual-workflow plus message-broker plus orchestration stack is real operational surface to maintain — and it is tied to the Windows/.NET world. If your team is on macOS or Linux, this is not your tool, and as with any niche open-source platform, check the maintenance cadence before betting a production process on it.

## Where BrowserBash fits (vendor section, read it as such)

I work on [BrowserBash](https://browserbash.com/features), so weigh this accordingly. BrowserBash is a free, Apache-2.0, natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, give it a plain-English objective, and an AI agent drives a real Chrome/Chromium browser step by step — no selectors — then returns a verdict plus structured values.

Here is the honest positioning, and it is the whole point of this article: **BrowserBash is browser-scoped, not general computer use.** It automates web browsers. It does not control your operating system, click around native desktop apps, or read arbitrary windows. For true desktop or cross-application RPA — the green-screen terminal, the legacy Windows client, the Excel-to-SAP shuffle — a computer-use model or a desktop RPA tool like OpenRPA or UI.Vision is the right fit, and BrowserBash is not a replacement.

Where BrowserBash wins is the case that turns out to be most of modern "RPA": the task lives in a browser. There, working from the DOM rather than screenshot pixels makes it cheaper, faster, more deterministic, and far more CI-friendly than a pixel-based desktop agent pointed at a web page. You can run it entirely on free local models through Ollama — the default `auto` mode tries local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY` — so a `$0` bill where nothing leaves your machine is a real option, not a teaser.

```bash
# Plain-English objective, real local Chrome, default Stagehand engine
browserbash run "log in with the demo account, open Billing, and read the current plan name and next invoice date"
```

Under the hood it uses two engines: `stagehand` (the default, MIT-licensed, DOM-aware act/extract/observe framework from Browserbase) and a `builtin` Anthropic tool-use loop. You can point it at different places to run via `--provider`: `local`, `cdp`, `browserbase`, `lambdatest`, or `browserstack`. For pipelines, `--agent` switches stdout to NDJSON with stable exit codes (0/1/2/3), which is the part desktop RPA tools usually make you build yourself.

```bash
# CI-friendly: machine-readable output + meaningful exit code
browserbash run "submit the contact form and confirm the success toast" --agent --headless --timeout 120
```

You can also commit automations as Markdown test files (`*_test.md`) with `{{variables}}` and masked secrets, and run them through the test runner, optionally against a cloud grid:

```bash
# Reusable, reviewable test file with variables + masked secrets
browserbash testmd run ./.browserbash/tests/login_test.md --record
```

That `--record` flag captures a `.webm` video plus a screenshot (and a Playwright trace on the builtin engine), which is useful evidence when a flow breaks. There is a local dashboard, and an optional cloud one if you want to share runs.

One honest caveat that applies to every AI tool in this roundup, BrowserBash included: tiny local models (roughly 8B and under) are flaky on long multi-step objectives. The sweet spot is a Qwen3 / Llama 3.3 70B-class model or a hosted one. If you try to run a twelve-step checkout on a 3B model, you will be disappointed, and that is a property of the model, not the harness. There is more on model selection and setup in the [tutorials](https://browserbash.com/tutorials) and the [learn](https://browserbash.com/learn) docs.

## Comparing the two branches: scripts vs. agents

Step back from individual tools and two philosophies are competing under the "open source RPA" banner. Knowing which one you want narrows the field fast.

| Dimension | Script/keyword RPA (Robot Framework, TagUI, OpenRPA) | AI agent RPA (Skyvern, BrowserBash, browser agents) |
|-----------|------------------------------------------------------|------------------------------------------------------|
| How you author | Record steps or write selectors/keywords | Describe the outcome in plain English |
| Resilience to UI change | Breaks when locators change; you fix it | Adapts to many changes; can drift unpredictably |
| Determinism | High — same steps every run | Lower — model decides; varies run to run |
| Desktop / OS tasks | Yes (OpenRPA, UI.Vision, TagUI GUI mode) | No — browser-scoped (or a separate computer-use model) |
| Cost model | Free to run; no per-step inference | Free on local models; hosted models cost per run |
| Debuggability | Step-level, explicit | Verdict + trace/record; reasoning is fuzzier |
| Best for | Stable, repeatable, document-heavy processes | Changing web UIs, exploratory flows, fast authoring |

Neither branch is strictly better. Script RPA rewards stable processes and punishes churn; agent RPA rewards churn and exploratory work and punishes anyone who needs bit-for-bit determinism. Plenty of real systems use both: a Robot Framework backbone for the parts that never change, and an AI agent for the flaky third-party web step in the middle.

## When to choose which: an honest decision guide

Here is how I would actually pick, given a specific task.

**Choose Robot Framework + RPA Framework** when you want engineering-grade, version-controlled automation across web, desktop, and APIs, you value determinism over adaptiveness, and your team can absorb the learning curve. It is the best "serious open-source RPA platform" answer for mixed document/web/API back-office work, and RCC solves real production environment problems.

**Choose OpenRPA** when the task is genuinely desktop and Windows-centric — native apps, work queues, scheduled robots — and you want a free alternative to commercial enterprise RPA suites. No browser-first tool, including BrowserBash, replaces it for native Windows automation. This is where the desktop-RPA category beats the browser-scoped tools outright.

**Choose UI.Vision** when you need visual automation or OCR, or you must cross the browser boundary into the desktop with image matching, and a codeless browser-extension approach suits your users. Accept the trade-off that image/OCR matching is more brittle and slower than DOM-based automation.

**Choose TagUI** when you want a free, readable, English-like script tool that non-programmers can pick up quickly for straightforward web and GUI tasks, and you do not need a full enterprise platform.

**Choose Skyvern** when your RPA is really web automation at scale across changing or multi-tenant sites, you want an AI agent rather than selectors, and you are comfortable with AGPL-3.0 on the self-hosted core (or you use their cloud for the anti-bot/proxy/CAPTCHA layer).

**Choose BrowserBash** when the task lives in a browser, you want plain-English objectives without selectors, and you want a CLI that drops into CI with NDJSON output and real exit codes, run on free local models for a `$0` bill if you like. Do not choose it for OS-level or native-desktop automation — that is explicitly out of scope, and one of the desktop tools above is the right call there. If you have been wrestling a [computer-use model](https://browserbash.com/blog) just to drive web pages, the browser-scoped, DOM-based approach is usually cheaper, faster, and more deterministic for that specific job.

A reasonable real-world architecture: OpenRPA or Robot Framework for the desktop and document spine, and an AI browser agent (Skyvern or BrowserBash, depending on whether you want a platform or a CLI) for the web steps that change too often to keep re-selecting. You can see worked browser examples in the [case studies](https://browserbash.com/case-study), and the [pricing](https://browserbash.com/pricing) page spells out that the CLI itself is free and open source.

## Practical evaluation checklist before you commit

Whichever way you lean, run these checks on the actual repo before you build a process on it. Open-source claims age, and "open source" can mean very different things.

- **Verify the license today.** Apache-2.0, MIT, MPL-2.0, and AGPL-3.0 carry very different obligations. AGPL matters if you ship a network service. Read the LICENSE file, not a blog post.
- **Check maintenance cadence.** Recent commits, release dates, open-issue response. A starred-but-stale repo is a liability for production automation.
- **Confirm scope honestly.** Browser-only, desktop-only, or both? Do not assume a browser agent can drive your native app, or that a desktop tool handles modern single-page apps gracefully.
- **Separate free core from paid cloud.** Several tools keep the engine open but put anti-bot, proxies, CAPTCHA, or orchestration behind a commercial tier. Make sure what you need is in the open part.
- **Test on your worst page, not the demo.** The friendly login form is not the test. Point the tool at your flakiest, most JS-heavy flow and watch it run a few times first.
- **For AI tools, pin a model.** Output quality tracks the model. Decide on a local 70B-class model or a hosted one and benchmark your real flow; tiny models will embarrass any agent on long tasks.

Do that, and the "best open source RPA" question stops being abstract. It resolves to a concrete pick for your concrete task, which is the only ranking that matters.

## FAQ

### What is the best open-source RPA tool in 2026?

There is no single winner, because RPA spans desktop, browser, and document automation. For engineering-grade, cross-surface automation, Robot Framework with Robocorp's RPA Framework is a top choice; for native Windows desktop work, OpenRPA fits; and for AI-driven web automation, Skyvern and BrowserBash lead the browser-scoped branch. Pick based on where your task actually lives.

### Is open-source RPA really free, or are there hidden costs?

The core engines listed here are genuinely free and open source, but "free to download" is not the same as "free to run at scale." Several projects keep the engine open while charging for cloud orchestration, anti-bot handling, proxies, or CAPTCHA solving. AI-driven tools can also incur model-inference costs unless you run local models, and every option carries the real cost of setup and maintenance time.

### Can AI browser agents replace traditional RPA?

Only for the browser part. AI browser agents like Skyvern and BrowserBash are excellent at web tasks and adapt to changing UIs far better than selector scripts, but they do not control the desktop, native applications, or the operating system. Traditional desktop RPA tools and general computer-use models still own that territory, so most real systems combine both rather than replacing one with the other.

### What is the difference between RPA and AI browser automation?

Classic RPA records or scripts exact steps — clicks, keystrokes, selectors — and replays them deterministically across desktop and web. AI browser automation instead takes a plain-English objective and lets a model decide the steps by reading the page, which is more resilient to layout changes but less predictable run to run. The categories now overlap heavily in the browser, where many "RPA" tasks actually live.

## Get started

If your RPA task lives in a browser and you want plain-English objectives without selectors, BrowserBash is free and open source:

```bash
npm install -g browserbash-cli
```

Run a local objective in seconds, wire it into CI with `--agent`, or commit reusable Markdown tests. An account is optional — create one only if you want the cloud dashboard at [browserbash.com/sign-up](https://browserbash.com/sign-up).
