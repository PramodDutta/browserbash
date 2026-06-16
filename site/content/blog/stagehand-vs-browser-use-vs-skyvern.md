---
title: Stagehand vs browser-use vs Skyvern: Which AI Driver Wins?
description: "Stagehand vs browser-use vs Skyvern: an honest 2026 comparison of license, model story, and reliability for these AI browser drivers."
date: 2026-03-06
category: comparison
---

If you are weighing stagehand vs browser-use this year, you have already crossed a line that most teams are still standing on: you have decided that an AI agent should drive a real browser instead of you hand-writing selectors that break every sprint. Good. The problem is that the moment you commit to that idea, three serious open-source projects all raise their hands — Stagehand, browser-use, and Skyvern — and they look interchangeable from the README. They are not. They make different bets about how much control you keep, which model you feed them, and whether they want to be a library, an agent, or a platform. This guide compares all three honestly, says plainly where each one is the better pick, and then shows where a test-runner layer fits on top so you are not gluing this stack together yourself.

I have run AI browser agents against real login flows, multi-step checkouts, and the kind of janky internal admin panels that make Playwright scripts cry. So this is not a feature-table reblog. It is the practical version: what each tool actually is, what it costs you in engineering time, and how to choose.

## The three contenders at a glance

Before we get into the weeds, here is the honest one-line summary of each project as of early 2026. Treat anything marked "not publicly specified" as exactly that — I am not going to invent a number to fill a cell.

| | Stagehand | browser-use | Skyvern |
|---|---|---|---|
| What it is | A browser automation framework / library (extends Playwright) | An autonomous browser agent | A workflow + agent platform for browser tasks |
| Built by | Browserbase | browser-use (open-source project) | Skyvern (open-source project) |
| Primary language | TypeScript (Node) | Python | Python |
| License | MIT | MIT (open-source) | open-source (AGPL-style copyleft on the core, as of 2026) |
| Core idea | Mix deterministic Playwright code with AI `act`/`extract`/`observe` calls | Give the agent a goal, it plans and clicks autonomously | Map the page, then drive it with vision + LLM, wrapped in workflows |
| Model | Bring your own LLM (OpenAI, Anthropic, others) | Bring your own LLM | Bring your own LLM, vision-capable models favored |
| Hosted option | Browserbase (paid cloud browsers) | Hosted cloud offering exists | Managed cloud offering exists |
| Best fit | Engineers who want control + AI where it helps | "Just do the task" autonomy | Document-style and repeatable enterprise workflows |

The license column is the one I would tattoo on the back of my hand before a procurement conversation. We will come back to it, because it is the single most consequential difference for anyone shipping a product on top of these tools.

## Stagehand: the controllable middle ground

Stagehand is the project that understands something a lot of "AI does everything" demos forget: you do not actually want the AI to do everything. You want deterministic code for the 90% of a flow that never changes — navigate to this URL, wait for that network call — and you want AI for the 10% that is brittle, like "click the checkout button" on a page where the button's selector changes every deploy.

So Stagehand sits on top of Playwright and gives you three AI primitives. `act()` performs a natural-language action ("click the sign-in link"). `extract()` pulls structured data out of the page against a schema you define. `observe()` lets the agent look at the page and propose what it could do next, which you can cache and replay. The rest of the time you write normal Playwright. You can drop down to `page.goto()` and `page.locator()` whenever you want full determinism.

That hybrid model is the whole pitch, and it is a genuinely good one. It means a senior SDET can reach for AI surgically instead of handing the entire run over to a non-deterministic agent and hoping. It also means your tests are debuggable: when a Playwright step fails you get a stack trace, not a vibe.

The license is MIT, which is about as permissive as open source gets — you can embed it in a commercial product without the copyleft obligations that scare legal teams. Stagehand is built by Browserbase, who also sell hosted cloud browsers, so there is a clear commercial gravity well: the framework is free, the managed browser infrastructure is where they make money. That is a healthy, honest open-core setup, and you are under no obligation to use the paid side.

### Where Stagehand wins

If you are a team that already lives in Playwright and TypeScript, Stagehand is the lowest-friction adoption path of the three. You do not rewrite your suite. You sprinkle `act()` and `extract()` into the spots that keep breaking and leave the rest alone. For QA engineers who care about repeatability and want AI as a scalpel rather than a sledgehammer, it is the most comfortable fit.

### Where Stagehand makes you do more work

Stagehand is a framework, not an agent. It will not, out of the box, take a one-line goal like "buy the cheapest flight to Lisbon" and figure out the whole journey. You are still the author of the flow's structure; the AI just handles the squishy steps. If you wanted full autonomy, that is on you to build, and that is exactly where browser-use comes in.

## browser-use: full autonomy, Python-first

browser-use flips Stagehand's philosophy. Instead of you writing the skeleton and letting AI fill gaps, you hand browser-use a goal and it plans, navigates, clicks, scrolls, and reads the page until it decides the task is done or stuck. It is an agent in the truest sense — a loop of "look at the page, decide the next action, execute, repeat."

It is Python-first, which matters a lot depending on your stack. If your data team, your scraping pipelines, and your ML tooling already live in Python, browser-use drops in next to them naturally. It is MIT-licensed and open source, with a hosted cloud offering for people who do not want to manage browser infrastructure. You bring your own LLM and the quality of the run tracks closely to the quality of the model you give it — a frontier model will navigate a gnarly multi-step flow that a small model will faceplant on.

### Where browser-use wins

When the task is genuinely open-ended — "find me the three cheapest hotels under these constraints and put them in a spreadsheet" — browser-use shines because that is its native shape. You describe the outcome, not the path. For research-style automation, lead generation, scraping behind interactive UIs, and one-off "just go do this" jobs, the autonomy is the feature, not a liability.

### Where browser-use costs you

Autonomy is a double-edged sword for testing. A test is supposed to do the same thing every run so a failure means something changed in the app, not in the agent's mood. A fully autonomous agent can take a different path on Tuesday than it took on Monday, which is wonderful for getting a task done and miserable for a regression suite where determinism is the entire point. browser-use also leans on capable models to be reliable on long chains; the more steps in the journey, the more a weak model's error rate compounds. None of that is a knock on the project — it is just the nature of giving an agent the wheel. Match the tool to the job.

## Skyvern: workflows and vision for repeatable jobs

Skyvern is the platform-shaped option. Where Stagehand is a library and browser-use is an agent, Skyvern wraps the agent idea in a workflow engine and leans heavily on vision — it looks at the rendered page, not just the DOM — to handle layouts that defeat selector-based tools. The pitch is automating repeatable, often form-heavy business processes: filling government portals, invoice and procurement flows, multi-page applications that look slightly different every time but follow the same logical shape.

That vision-first approach is the interesting technical bet. A lot of enterprise pages are hostile to selectors — iframes, canvas-rendered widgets, dynamic IDs — and a model that can reason over a screenshot the way a person would is genuinely more resilient on those. Skyvern is open source with a managed cloud offering, and it is the one I would scrutinize most carefully on licensing. As of 2026 the core has historically used a copyleft (AGPL-family) license; the exact terms and any commercial-license carve-outs are something you should read on the current repository yourself rather than trust a blog to have right. If you are embedding it in a closed-source commercial product, do the license review before you write a line of integration code.

### Where Skyvern wins

For document-style, high-volume, repeatable enterprise workflows — the kind where the same task runs thousands of times against slightly varying pages — Skyvern's workflow model plus vision resilience is a strong fit. It is built for "operationalize this business process," not "write me a test."

### Where Skyvern is the wrong tool

If you are a small team that just wants to assert "the checkout flow still works" in CI, Skyvern is heavier than you need, and the copyleft licensing adds a question you may not want to answer. It is aimed up-market at process automation more than at the unit-of-work that QA engineers think in.

## stagehand vs browser-use vs Skyvern: how to actually choose

Here is the decision the way I would coach a team through it, stripped of marketing.

- **Choose Stagehand** if you are TypeScript/Playwright-native, you want AI applied surgically, and you care about MIT licensing and debuggable, mostly-deterministic flows.
- **Choose browser-use** if you are Python-native and the work is open-ended autonomy — research, scraping, "go accomplish this goal" — where a different path each run is acceptable or even desirable.
- **Choose Skyvern** if you are automating repeatable, vision-heavy enterprise processes at volume and you have done the license review.

Notice none of those three said "and it is also a great test runner." That is the gap. All three are excellent **engines** for driving a browser with AI. None of them is, by itself, the thing that turns a driver into a CI-friendly test suite with verdicts, exit codes, committable test files, video recording, secret masking, and a clean NDJSON stream for your pipeline. You can build that layer. Or you can pick up a tool that already shipped it.

## Where BrowserBash fits: the test-runner layer on top

This is the part where I am going to be straight with you about what BrowserBash is and is not, because the whole point of this article is honesty over hype.

BrowserBash is not a fourth competing AI driver. It is the test-runner layer that sits **on top** of a driver. And here is the relevant detail for this comparison: BrowserBash ships **Stagehand as its default engine** — the same MIT-licensed Browserbase project we just spent a section praising — plus a second `builtin` engine that runs an in-repo Anthropic tool-use loop. You switch with one flag. So the "stagehand vs browser-use" question, from BrowserBash's seat, is partly settled by adopting the best parts of Stagehand and wrapping them in the harness an SDET actually needs.

What does that harness give you that a raw driver does not?

You write a plain-English objective and an AI agent drives a real Chrome step by step — no selectors, no page objects — then returns a pass/fail verdict plus structured results. A real flow it runs end to end: log in to a store, add an item to the cart, complete checkout, and verify "Thank you for your order!" appears.

```bash
npm install -g browserbash-cli
browserbash run "Log in, add the blue mug to the cart, check out, and verify the order confirmation message"
```

The model story is the part teams underrate. BrowserBash is Ollama-first: it defaults to **free local models**, no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — so you can guarantee a $0 model bill by staying local. It also supports OpenRouter (including genuinely free hosted models like `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key. The honest caveat, the same one that applies to browser-use and Skyvern: very small local models (~8B and under) get flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the hard flows. That is not a BrowserBash limitation; it is physics of small models, and any of these three tools hits the same wall.

### Built for CI and AI coding agents

The feature that separates a test runner from a driver is the output contract. Run with `--agent` and BrowserBash emits NDJSON — one JSON event per line on stdout — with real exit codes: `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, no scraping a model's chatty summary to figure out if the build should go red.

```bash
browserbash run "Search for 'wireless headphones' and confirm at least 5 results load" --agent --headless
```

That is the difference between "an agent did a thing" and "my pipeline knows whether to fail the build." If you have wired Playwright into CI before, you already know how much that contract is worth.

### Committable tests, video, and secret masking

BrowserBash supports Markdown tests — committable `*_test.md` files where each list item is a step, with `@import` for composition and `{{variables}}` for templating. Secret-marked variables get masked as `*****` in every log line, which is the kind of detail you only appreciate after you have leaked a password into a CI log once. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./login_test.md --record --upload
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine; the `builtin` engine additionally captures a Playwright trace you can open in the trace viewer. There is a free, fully local dashboard (`browserbash dashboard`) and an optional free cloud dashboard with run history and per-run replay, strictly opt-in via `browserbash connect` and `--upload`. No account is needed to run anything locally. If you want the deeper how-to, the [BrowserBash docs and learn hub](https://browserbash.com/learn) walk through each piece, and the [features page](https://browserbash.com/features) lays out the full surface.

### Where the browser runs is one flag

Stagehand, browser-use, and Skyvern all make you think about *where* the browser executes. BrowserBash collapses that into a `--provider` flag: `local` (your Chrome, the default), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, or `browserstack`. Develop locally for free, then point the same test at a cloud grid for cross-browser coverage without rewriting anything.

```bash
browserbash run "Complete the checkout flow and verify the confirmation page" --provider lambdatest --record
```

## A fair comparison: the test-runner column

To keep this honest, here is the same table extended with the dimension that matters if your actual goal is testing, not general automation. This is not "BrowserBash beats them" — it is "BrowserBash is a different layer, and here is how the engines slot underneath it."

| Capability | Stagehand | browser-use | Skyvern | BrowserBash |
|---|---|---|---|---|
| Role | Driver/library | Autonomous agent | Workflow platform | Test runner over a driver |
| Default license posture | MIT | MIT | copyleft (verify) | Apache-2.0 |
| Local, zero-API-key models | BYO LLM | BYO LLM | BYO LLM | Yes, Ollama-first default |
| Pass/fail verdict + exit codes | Build it | Build it | Workflow-level | Built in (`--agent`) |
| Committable plain-text tests | Code | Code | Workflows | `*_test.md` files |
| Session video out of the box | Via infra | Via infra | Platform | `--record` (.webm) on any engine |
| One-flag cloud browser swap | Browserbase | Cloud option | Cloud | `--provider` (5 targets) |

The thing I want you to take from that table is not a winner. It is the realization that "AI browser driver" and "AI test runner" are two different products, and you were probably shopping for both without separating them.

## When you should NOT use BrowserBash

Credibility means saying this out loud. If you are building open-ended autonomous automation — an agent that researches the web and accomplishes fuzzy goals where a different path each run is fine — browser-use is the more natural shape and you should use it directly. If you are operationalizing high-volume, vision-heavy enterprise process automation, Skyvern's workflow engine is purpose-built for that and BrowserBash is not trying to be. And if you are deep in a Playwright + TypeScript codebase and you only want to sprinkle AI into a few brittle steps without any test-runner opinionation, using Stagehand on its own is perfectly reasonable — BrowserBash just gives you the harness around it.

BrowserBash earns its place when the job is **testing**: you want plain-English flows, deterministic pass/fail in CI, committable tests your whole team can read, recordings for the failures, and a free local model story so the bill is $0. For that job, the test-runner layer is the missing piece, and it happens to ship the best MIT engine of the three as its default. If you want to see how teams put this into a pipeline, the [case studies](https://browserbash.com/case-study) and the [blog](https://browserbash.com/blog) have concrete walkthroughs, and [pricing](https://browserbash.com/pricing) is worth a look mostly to confirm how much stays free.

## Putting it together in a real pipeline

Here is the mental model I would leave a team with. Your engine is the muscle — Stagehand, browser-use, or Skyvern, picked by the philosophy that matches your work. Your runner is the nervous system — the thing that decides what "done" and "failed" mean, records evidence, masks secrets, and speaks a protocol your CI understands.

If your work is testing, BrowserBash gives you the nervous system and bundles a great muscle (Stagehand, MIT) plus its own `builtin` Anthropic engine, so you can start without choosing. Run local and free while you iterate, flip a single `--provider` flag when you need a cloud grid, and turn on `--agent` when you wire it into the build. The point of an AI driver was never to watch an agent do something impressive once. It was to make a flow you cannot easily script run reliably, on every commit, and tell you the truth when it breaks.

## FAQ

### What is the difference between Stagehand and browser-use?

Stagehand is a TypeScript framework that extends Playwright and lets you call AI surgically with `act()`, `extract()`, and `observe()` while keeping the rest of your flow as deterministic code. browser-use is a Python-first autonomous agent: you give it a goal and it plans and executes the whole journey on its own. Stagehand trades autonomy for control and repeatability; browser-use trades repeatability for hands-off autonomy. Both are MIT-licensed and both let you bring your own LLM.

### Is Stagehand, browser-use, or Skyvern better for automated testing?

For repeatable regression testing, Stagehand's controllable, mostly-deterministic model is the closest fit of the three, because tests need to do the same thing every run. browser-use is better for open-ended automation than for deterministic test suites, and Skyvern is aimed at high-volume enterprise process automation rather than CI tests. If your real goal is a test suite with pass/fail verdicts and CI integration, a test-runner layer like BrowserBash over a driver gets you there faster than wiring any of them up raw.

### Are these AI browser drivers actually free to use?

Stagehand and browser-use are MIT-licensed open source, and Skyvern's core is open source under a copyleft license you should verify on the current repository. The model bill is separate: all three ask you to bring your own LLM, so your real cost is whatever API you feed them. BrowserBash is Apache-2.0 and defaults to free local Ollama models with no API keys, so the model bill can genuinely be $0 if you stay local.

### Can I run an AI browser agent in CI without parsing prose output?

Yes. The problem with raw agents is they tend to emit a chatty natural-language summary that your pipeline has to interpret. BrowserBash solves this with `--agent`, which emits NDJSON — one JSON event per line — and real exit codes (0 passed, 1 failed, 2 error, 3 timeout). That gives your CI a clean machine-readable contract instead of forcing it to guess whether a build should go red.

Ready to put a test-runner layer over the best MIT engine of the three? Install it with `npm install -g browserbash-cli` and run your first plain-English flow in under a minute. No account is required to run locally — though you can grab the optional free cloud dashboard anytime at [browserbash.com/sign-up](https://browserbash.com/sign-up).
