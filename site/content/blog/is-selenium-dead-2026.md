---
title: Is Selenium Dead in 2026? An Honest Look at the Data
description: "Is Selenium dead in 2026? PyPI downloads, job postings, and market share say it's fading for new projects but far from gone. The honest data."
date: 2026-04-28
category: comparison
---

Every few months someone posts "is Selenium dead?" on Reddit and the thread turns into a 200-comment knife fight. So let's skip the vibes and look at what the numbers actually say in 2026. Short version: Selenium is not dead. Its Python package alone still pulls tens of millions of downloads a month, the project shipped a dozen releases last year, and there are more open job listings mentioning it than any other browser automation tool. But "not dead" and "what I'd start a new suite on" are two very different claims, and the data draws a hard line between them.

I've shipped and maintained Selenium suites that ran for years, and I've watched teams quietly migrate off them. This piece is an attempt to be honest about both things at once: Selenium is fading at the front edge of new projects while remaining enormous in the installed base. Then I'll make the case that the genuinely modern path — the thing that comes *after* the Playwright migration everyone's doing — looks less like another selector framework and more like describing what you want in plain English and letting an agent drive the browser.

## What "dead" would actually mean

Before we argue about a verdict, define the word. A software project can be "dead" in at least four different ways, and people smush them together:

- **Abandoned** — no commits, no releases, no maintainers answering issues.
- **Losing the new-project race** — greenfield teams pick something else by default.
- **Shrinking installed base** — existing suites are being torn out faster than new ones are added.
- **Culturally irrelevant** — nobody writes about it, talks about it, or hires for it.

Selenium is clearly **not abandoned**, and it's **not culturally irrelevant** (job demand proves that). Where it's genuinely struggling is the **new-project race**. So when this article says Selenium is "fading," I mean a specific thing: for a brand-new suite started today, fewer and fewer teams reach for it first. That's the claim the data supports. The "it's dead, delete it" claim it does not.

## The download numbers: still massive, still meaningful

Package downloads are the least gameable popularity signal we have, so start there.

Selenium's Python client still reports on the order of **50 million downloads per month on PyPI** as of 2025–2026. That is not a rounding error. A tool nobody used would not move that kind of volume. A big chunk of it is CI machines re-pulling the package on every pipeline run — which is itself the point: that many pipelines still depend on it.

Now compare the trajectory. Playwright went from under a million weekly npm downloads in 2021 to **north of 30 million weekly** in early 2026 — roughly a 3,000%+ climb in five years. (Exact weekly figures bounce around week to week, so treat any single number as a snapshot, not gospel.) Selenium's curve, by contrast, is flat-to-gently-declining. Flat at a huge number is still huge. But "flat" next to "vertical" is the whole story in one chart.

| Signal (2026, approximate) | Selenium | Playwright | Cypress |
| --- | --- | --- | --- |
| Package download volume | Very high, flat | Very high, steep growth | Moderate |
| GitHub stars | ~32k | ~74k | ~47k |
| Adoption among QA pros (survey) | ~22% | ~45% | ~14% |
| New-project default | Declining | Rising fast | Stable/niche |
| Open job postings (raw count) | Highest | Rising fast | Lower |

A few honesty notes on that table. Star counts and survey percentages come from public 2026 industry roundups and developer surveys; methodologies differ, so read them as directional, not precise. "Adoption among QA pros" in particular is a survey-population figure — it tells you what people *say* they use, which skews toward whoever answered the survey. The shape is reliable even when the decimal places aren't: Playwright pulled ahead, Selenium slid to second, Cypress holds a smaller dedicated slice.

## Job postings: the lagging indicator that protects Selenium

Here's the data point that keeps Selenium off the morgue slab. **There are still more open job listings mentioning Selenium than any other browser automation tool** — thousands on Indeed and LinkedIn in the US alone, more worldwide.

This surprises people who only watch the download charts, but it shouldn't. Job postings are a *lagging* indicator. They reflect the code that already exists and needs maintaining, not the code teams wish they were writing. A bank with 8,000 Selenium tests written between 2016 and 2023 needs to hire someone to keep them green in 2026. That req says "Selenium." It will say "Selenium" for years. None of that means a new team at that same bank would start fresh in Selenium today.

Meanwhile Playwright postings are climbing fast — multiple sources put the year-over-year growth in the triple digits, with listings roughly tripling between 2024 and 2026. That's the *leading* indicator. When the leading indicator (new tool adoption, package growth) and the lagging indicator (job postings) point in opposite directions, you're looking at a market mid-transition, not a market that's settled. We are watching the slow part of an S-curve.

The practical read for your career: if you're maintaining a legacy suite, Selenium skills stay employable for a long time. If you're choosing what to *learn next*, the gradient points elsewhere.

## Why Selenium isn't being abandoned

It's worth being fair to the project, because "fading for new work" gets misquoted as "rotting." The Selenium project remains genuinely active. It shipped around a dozen releases in 2025 and continued into 2026 with the 4.4x line. The team has not been coasting:

- **WebDriver BiDi** support brings the bidirectional, event-driven capabilities that Selenium historically lacked — network interception, console log capture, better waiting primitives. This is the single most important modernization, because brittle waits were Selenium's biggest pain point and BiDi attacks that directly.
- **Selenium Manager** removed the ancient chore of manually matching driver binaries to browser versions. For anyone who lost an afternoon to a `chromedriver` mismatch, this alone was a relief.
- **Grid** continues to evolve for parallel and cross-browser execution at scale.

And Selenium's deepest moat is real: it *is* the W3C WebDriver standard in practice. It runs against essentially every browser, has official bindings for Java, Python, C#, JavaScript, Ruby and more, and is the lingua franca that commercial device clouds and enterprise CI systems were all built to accept. Twenty years of Stack Overflow answers exist for nearly any error you'll hit. For a large regulated organization that values a stable, vendor-neutral, standardized base, that maturity is frequently the deciding factor — and a perfectly rational one.

So no, Selenium is not dying of neglect. It's losing the greenfield default to tools that made the *common* path easier out of the box.

## Why new projects keep choosing something else

If the project is healthy, why is the new-project curve sliding? Because the defaults matter more than the ceiling, and the modern tools won on defaults.

**Auto-waiting.** Out of the box, classic Selenium does not wait for elements to be actionable, so suites accumulate `Thread.sleep` calls and hand-rolled explicit waits. That single gap is responsible for a huge share of the "Selenium is flaky" reputation. Playwright auto-waits by default. You can write disciplined, wait-correct Selenium — BiDi helps a lot — but you have to *choose* to, and a tired engineer at 6pm reaches for `sleep(2)`. Defaults are destiny.

**Setup and developer experience.** Modern tools ship with bundled browsers, built-in test runners, tracing, and recorders. Selenium historically asked you to assemble a runner, a reporter, a waiting strategy, and driver management yourself (Selenium Manager fixed the last one). More batteries included means faster time-to-first-green-test, and that first impression decides a lot of adoptions.

**The selector tax never went away.** This is the one even the modern frameworks didn't solve. Whether it's Selenium or Playwright, you're still authoring and maintaining CSS/XPath selectors and page objects. When the frontend team renames a div or restructures a component, your locators break — and they break *silently* until the suite goes red. Every SDET has spent a sprint fixing tests that found zero real bugs. That tax is the through-line connecting Selenium's pain to its successors' pain, and it's where the genuinely new generation of tooling tries something different.

## So where does that leave you in 2026?

Here's a clean decision framework, no hedging.

### Keep Selenium if:

- You have a large existing Selenium suite. **Do not rip out working tests to chase a trend.** A green Selenium suite is worth more than a half-migrated Playwright one. Migrate opportunistically, not religiously.
- You need the broadest possible browser/language matrix, including older or unusual browsers, or you're locked to a device cloud and CI stack built around WebDriver.
- You're in a regulated shop where a vendor-neutral W3C standard with a 20-year paper trail is a compliance asset, not just a preference.

### Start new work in Playwright (or Cypress) if:

- It's a greenfield web suite and you want the smoothest defaults — auto-waiting, tracing, parallelism — with the least ceremony.
- Your stack is JavaScript/TypeScript-first and you want the tooling to feel native to it.
- You're hiring and want to recruit into a growing skill pool rather than a maintenance one.

### Look at natural-language / agent-driven testing if:

- The selector-maintenance tax is your actual bottleneck — your team spends more time fixing locators than finding bugs.
- You want non-SDETs (PMs, support, designers) to contribute checks in plain English.
- You're already wiring AI coding agents into CI and want a tool that emits machine-readable output instead of prose.

These aren't mutually exclusive. The realistic 2026 stack is often "keep the legacy Selenium suite alive, write new flows in Playwright, and prototype the gnarly exploratory stuff in plain English." Tools earn their place by surface, not by tribe.

## The path after the migration: describe the test, don't script it

Step back and notice what every framework in this article has in common, Selenium and Playwright alike: you write code that names elements. Selectors, locators, page objects. That's the shared assumption nobody questioned for two decades — and it's the assumption that breaks every time the UI shifts.

The newer idea is to drop the selector layer entirely. Instead of `driver.findElement(By.cssSelector("#checkout-btn")).click()`, you write what you *want* — "add a product to the cart and complete checkout, then confirm the order number appears" — and an AI agent drives a real browser to make it happen, deciding for itself which element is the checkout button. No locators to maintain, because there are no locators.

That's what [BrowserBash](https://browserbash.com/features) does. It's a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You install it with npm, give it a plain-English objective, and an agent drives a **real Chrome browser** step by step — no selectors, no page objects — then returns a pass/fail verdict plus structured values it extracted along the way.

```bash
npm install -g browserbash-cli
browserbash run "go to the demo store, add any item to the cart, start checkout, and tell me the total price shown"
```

No selectors in that command. No page object. If the store reskins its checkout next quarter, that objective still reads the same — the agent re-finds the button on its own. That's the part the selector frameworks could never give you.

### Where the model actually runs (and why your bill can be $0)

This is the design choice I care about most. BrowserBash is **Ollama-first**. The default model is `auto`, which resolves in this order: (1) a local Ollama model if one's available — free, no API keys, and nothing leaves your machine; (2) `ANTHROPIC_API_KEY` if set, using `claude-opus-4-8`; (3) `OPENAI_API_KEY` using `openai/gpt-4.1`; otherwise it errors with guidance. On the local path your model bill is a guaranteed zero, which matters when your tests run hundreds of times a day in CI.

Honest caveat, because it would be malpractice to skip it: very small local models (8B and under) get flaky on long, multi-step objectives — they lose the plot halfway through a checkout. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. Pin whichever you want explicitly:

```bash
browserbash run "log in and confirm the dashboard greeting shows my name" --model ollama/qwen3
browserbash run "complete the multi-step signup wizard end to end" --model claude-opus-4-8
```

### Built for CI and AI agents, not just humans

For pipeline use, `--agent` emits NDJSON — one JSON object per line, a `step` event per action and a terminal `run_end` with the status and final state, plus real exit codes (0 passed, 1 failed, 2 error, 3 timeout). No prose to parse, which is exactly what you want when an AI coding agent or a Jenkins stage is reading the result. There's also a committable markdown test format (`*_test.md`) where each list item is a step, with `{{variables}}` templating and secrets masked as `*****` in every log line. Every run is saved on disk under `~/.browserbash/runs` with secrets masked. If you want a visual, `browserbash dashboard` runs a fully local dashboard on `localhost:4477` — nothing is uploaded unless you explicitly opt in with `--upload` after linking a free cloud account. You can learn the workflow from the [tutorials](https://browserbash.com/tutorials) and the deeper [learn](https://browserbash.com/learn) section.

## An honest accounting: where this approach is NOT the answer

I'd be doing the same thing the "Selenium is dead!" crowd does if I oversold the alternative. Natural-language testing is not a drop-in replacement for everything.

- **Determinism.** A selector-based assertion is exactly as precise as you wrote it. An agent makes judgment calls. For a tight, well-understood regression check where you know the exact element and exact expected text, a Playwright assertion is more predictable, and that predictability is a feature. Use the right tool.
- **Cross-browser at industrial scale.** If your contract requires certified runs across a dozen browser/OS combinations on a device cloud, Selenium's W3C standardization and ecosystem are purpose-built for that. BrowserBash's local provider drives Chrome/Chromium; for hosted grids it can target other providers, but Selenium remains the safer default for a giant certified matrix.
- **Tiny-model flakiness.** Said above, worth repeating: don't run hard multi-step flows on an 8B local model and then blame the approach. Size the model to the job.
- **Twenty years of answers.** When something breaks at 2am, Selenium has two decades of Stack Overflow threads. A newer tool has fewer. That gap closes over time, but it's real today.

The point of natural-language testing isn't to replace your assertion-precise regression suite. It's to kill the selector-maintenance tax on the flows where that tax is highest, and to let more of your team write checks at all. Those are big wins. They are not *every* win.

## The verdict, with the data behind it

So, is Selenium dead in 2026? No. The download volume is too large, the project is too actively maintained, and the job market is too deep for that word to apply. Anyone telling you to delete your working Selenium suite is selling something.

But the trajectory is unambiguous. New projects increasingly start on Playwright. Selenium's adoption among practitioners slid to roughly half of Playwright's. Its download curve is flat while Playwright's is vertical. Its job postings lead only because they're a lagging indicator counting the enormous code that already exists. Read together, the honest summary is: **Selenium is a maintenance-mode default, not a greenfield default.** It will be employing people and running pipelines for years. It is also no longer the obvious first choice for code you write today.

And the most interesting part isn't even the Selenium-vs-Playwright scoreboard — it's that both of them share the selector assumption that the next generation of tools is trying to retire. If your real pain is locator churn, the move isn't "Selenium to Playwright." It's "stop writing selectors at all." That's the shift worth watching, and it's the one BrowserBash is built around. Browse the [blog](https://browserbash.com/blog), check the [pricing](https://browserbash.com/pricing) (the CLI is free and open source), and read a [case study](https://browserbash.com/case-study) if you want to see the approach applied to real flows.

## FAQ

### Is Selenium still worth learning in 2026?

Yes, with a caveat. Selenium still has the most open job postings of any browser automation tool because of its massive installed base, so the skill stays employable and useful for maintaining existing suites. But if you're choosing what to learn for new projects, Playwright is growing far faster and is the more future-facing bet. Ideally learn the WebDriver concepts Selenium teaches, then add a modern tool on top.

### Is Playwright replacing Selenium?

For new projects, increasingly yes. Playwright overtook Selenium in practitioner adoption surveys in 2026 and its download growth dwarfs Selenium's. But "replacing" is too strong for the installed base — there are millions of existing Selenium tests that aren't going anywhere soon, and Selenium remains the standard for very broad cross-browser and cross-language matrices. It's a generational shift in progress, not a finished swap.

### Why does Selenium still have so many job postings if it's declining?

Because job postings are a lagging indicator. They reflect the code that already exists and needs maintaining, not what teams would start fresh today. A company with thousands of Selenium tests written years ago still needs engineers to keep them green, so those reqs say "Selenium" even as the same company might start new work in Playwright. Leading indicators like package growth and new-project adoption tell the forward-looking story.

### What comes after Selenium and Playwright?

The emerging direction is natural-language, agent-driven testing, where you describe the goal in plain English and an AI agent drives a real browser without any selectors or page objects. Tools like BrowserBash run a local Chrome with a local Ollama model for a zero model bill and machine-readable NDJSON output for CI. It doesn't replace precise assertion-based regression suites, but it removes the selector-maintenance tax that both Selenium and Playwright still carry.

Selenium isn't dead — it's in maintenance mode while the frontier moves on. If your bottleneck is selectors breaking every sprint, try describing your tests instead of scripting them:

```bash
npm install -g browserbash-cli
```

It's free and open source, and no account is required to run it. If you want the optional cloud dashboard later, [sign up here](https://browserbash.com/sign-up) — but the CLI works fully on your machine on day one.
