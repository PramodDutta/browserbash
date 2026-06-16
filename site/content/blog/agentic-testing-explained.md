---
title: Agentic Testing: What It Is and Why QA Teams Care
description: "Agentic testing explained: how AI agents drive a real browser to a plain-English goal, how it differs from scripted automation, and where it fits in QA."
date: 2026-02-17
category: agents
---

Agentic testing is the practice of handing an AI agent a plain-English objective and letting it drive a real browser step by step until it reaches that goal, then return a verdict. Instead of writing a script that says "find the element with id `add-to-cart`, click it, assert the cart count is 1," you write "add a laptop to the cart and confirm the cart shows one item," and the agent figures out the clicks, the waits, and the checks on its own. That shift sounds small. It is not. It changes who can write a test, how brittle that test is when the UI moves, and what kind of failures you actually catch.

This article defines agentic testing precisely, contrasts it with scripted automation and the previous generation of "AI-assisted" tools, and walks through real projects in this space: Octomind, Momentic, and Skyvern. Then it shows how BrowserBash, a free open-source CLI, runs an autonomous agent against your local Chrome to a stated objective and hands you back a pass or fail you can put in CI. By the end you should be able to tell when an agentic approach earns its keep and when a plain Playwright script is still the right tool.

## What agentic testing actually means

The word "agentic" gets thrown around loosely, so let me pin it down. An agent, in the testing sense, is a loop: it observes the current state of the page, decides on a next action, takes that action, observes the result, and repeats until it has either satisfied the objective or run out of room to try. The model is in the driver's seat for the *decisions*. You supply the destination, not the turn-by-turn directions.

Contrast that with a traditional automated test. A Playwright or Selenium script is a fixed sequence of imperative commands. You decided, at authoring time, exactly which element to target and exactly what to assert. The runtime does not improvise. If the button moved from the header to a dropdown, the script does not "notice" and adapt; it throws a `TimeoutError` because the selector no longer matches. That rigidity is a feature when the app is stable and a liability when it is not.

Agentic testing sits on the far end of a spectrum:

- **Scripted automation** — you write every step and every selector. Maximum control, maximum maintenance.
- **AI-assisted authoring** — a model helps you *generate* a script, but the script that runs is still a fixed sequence. The intelligence is at write time, not run time.
- **Self-healing automation** — a fixed script, but when a selector breaks the tool tries alternative locators to keep going. The intelligence patches the script at run time.
- **Agentic testing** — there is often no durable selector-based script at all. The model perceives and decides on every step against a live goal.

Most teams that say "we use AI for testing" are somewhere in the middle two buckets. True agentic testing — where the agent owns the decision loop end to end — is newer, and it is the thing worth understanding because it behaves so differently.

### The core loop, concretely

Picture the objective "log in, add the wireless mouse to the cart, complete checkout, and verify the confirmation says thank you." A scripted test encodes maybe forty lines of locators and assertions. An agent receives that one sentence, takes a snapshot of the page (the DOM, the accessibility tree, sometimes a screenshot), reasons "I see a login form, I should fill the username and password," acts, re-observes, and only then decides the next move. It is reading the page the way a human tester reads it, not replaying a recording.

That is why an agent can absorb a layout change that would shatter a script. If the "Add to cart" button is now a different color, in a different spot, with different markup, the agent still sees a button labeled add to cart and clicks it. The objective did not change, so the test did not break.

## Why scripted automation hits a wall

Nobody is arguing scripted automation is bad. It is precise, fast, deterministic, and debuggable, and for a stable critical path it is hard to beat. The trouble is the maintenance tax, and that tax is what pushes teams toward agentic approaches.

Three forces drive the cost up. First, **selector churn**: every redesign, A/B test, or component-library upgrade can rename classes and reshuffle the DOM, and your locators rot. Second, **flakiness**: timing races, animations, and network jitter produce tests that pass nine times and fail the tenth, and chasing those is soul-destroying. Third, **authoring throughput**: writing good page objects is skilled work, and the backlog of "things we should have a test for" never shrinks because writing each one is slow.

Anyone who has owned a large Selenium suite knows test maintenance can eat a serious slice of total QA effort. Agentic testing attacks that line specifically. When the test is "a goal plus an agent," there is no selector to rot. You trade deterministic precision for resilience and authoring speed.

That trade is not free, and honesty matters here: agents are slower per run, they cost model inference, and they can be non-deterministic in ways a script never is. The point of this article is to help you spend that trade where it pays.

## The agentic testing landscape: Octomind, Momentic, Skyvern

The category is young, and the tools in it make genuinely different bets. Here is an honest read on three of the names you will hear, based on what each project describes publicly as of 2026. Where I am not certain of a detail, I say so rather than invent one.

### Octomind

Octomind positions itself around AI agents that generate and maintain end-to-end tests for web apps, with a strong emphasis on auto-discovery and self-maintenance — the agents explore your app, propose test cases, and update them as the UI changes. The pitch is aimed at teams who want coverage without hand-writing and hand-maintaining a Playwright suite, and Octomind's output has historically been Playwright-based so you are not locked out of the underlying code. Octomind has also invested in MCP (Model Context Protocol) integration so coding agents can drive test generation. If your pain is "we cannot keep our E2E suite alive as the product moves," Octomind is squarely aimed at you. Pricing tiers and the exact hosting model are best checked on their site, since they change; I will not quote numbers I cannot verify.

### Momentic

Momentic is a low-code/AI testing platform where you describe steps in natural language and the system executes and maintains them, with an editor experience and CI integration. The emphasis I have seen is on reliability and speed of authoring for product and QA teams who want something more visual than raw code but smarter than a record-and-replay tool. It blends natural-language steps with AI assertions. As with Octomind, treat specific plan pricing and any model details as "check the source," not gospel from this article.

### Skyvern

Skyvern is open-source and takes a notably autonomous stance: it uses LLMs plus computer vision to operate browser workflows from a prompt, designed to handle sites it has never seen without bespoke scripts. It leans heavily on understanding the page visually and via the DOM, which makes it interesting for workflows and automation beyond just QA — form filling, data extraction, multi-step processes. For testing specifically, Skyvern's autonomy is the draw and also the thing to validate carefully on your own flows, because more autonomy means more variance. Skyvern being open-source means you can self-host and inspect it, which some teams require.

### How they compare at a glance

| Tool | Openness | Primary shape | Best fit |
| --- | --- | --- | --- |
| Octomind | Generates Playwright; platform | Auto-discover + maintain E2E tests | Teams drowning in E2E maintenance |
| Momentic | Commercial platform | NL + low-code authoring, AI assertions | Product/QA teams wanting visual + AI |
| Skyvern | Open-source | Autonomous LLM + vision browser agent | Autonomous workflows and exploratory automation |
| BrowserBash | Open-source (Apache-2.0), CLI | Plain-English objective → verdict, local-first | CLI/CI users who want $0 local runs and a clean pass/fail |

Read that table as "different bets," not "ranked list." If you want a managed platform that owns maintenance for you, a hosted product is the better fit and I would not pretend otherwise. BrowserBash is for a different person: someone who lives in a terminal, wants the agent to run against their own Chrome, and wants a machine-readable result with no account required.

## Where BrowserBash fits

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it once and run agentic tests from your terminal:

```bash
npm install -g browserbash-cli

browserbash run "go to the demo store, log in as standard_user, add the first product to the cart, complete checkout, and verify the page says 'Thank you for your order!'"
```

There are no selectors in that command and no page object behind it. An AI agent drives a real Chrome (or Chromium) browser step by step toward the objective and returns a verdict plus structured results. That is agentic testing in one line. If you want to see the full set of run options and flags, the [features page](https://browserbash.com/features) lays them out, and the [learn section](https://browserbash.com/learn) walks through first runs.

### Local-first, $0 by default

The detail that sets BrowserBash apart from most of the category is the model story. It is **Ollama-first**: by default it points at free local models, so there are no API keys to manage and nothing leaves your machine. It auto-resolves in order — local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — so it uses whatever you have without ceremony. You can run a genuinely $0 model bill on local models, which matters when you are firing hundreds of agentic runs in CI and do not want a per-step inference invoice.

You are not locked to local, though. BrowserBash supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic's Claude with your own key. The honest caveat: very small local models, roughly 8B parameters and under, get flaky on long multi-step objectives. They lose the thread, repeat actions, or hallucinate a success. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If your objective is "click login, type two fields, assert a heading," a small model is fine. If it is a ten-step checkout with conditional dialogs, give the agent a bigger brain.

### A verdict you can put in CI

Agentic testing is only useful in a pipeline if the result is machine-readable. Prose like "I think the checkout worked!" is useless to a CI job. BrowserBash has an **agent mode** built for exactly this:

```bash
browserbash run "log in and confirm the dashboard shows the user's name" --agent --headless
```

With `--agent`, BrowserBash emits NDJSON — one JSON event per line on stdout — so a CI step or an AI coding agent can parse events without scraping prose. The exit codes are stable and unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. That contract is the bit that makes agentic testing safe to automate. Your pipeline gates on the exit code; your logs capture the structured events. The reasoning behind that design is covered in the post on [AI agents driving browsers with NDJSON](https://browserbash.com/blog), if you want the deeper version.

## Making agentic tests repeatable: markdown tests

A fair criticism of pure agentic testing is that a one-shot English sentence is hard to review, version, and share. BrowserBash answers that with **markdown tests** — committable `*_test.md` files where each list item is a step, with `@import` composition and `{{variables}}` templating. You get the readability of plain English with the discipline of a file in your repo that code review can see.

```bash
browserbash testmd run ./checkout_test.md
```

A markdown test reads like a checklist a human would follow:

```markdown
# Checkout smoke test

- Go to {{baseUrl}}
- Log in with username {{user}} and password {{password}}
- Add the first product to the cart
- Proceed to checkout and fill shipping details
- Verify the page shows "Thank you for your order!"
```

Secret-marked variables are masked as `*****` in every log line, so a password in `{{password}}` never leaks into your CI output or a shared run log. After each run BrowserBash writes a human-readable `Result.md`, so a non-technical stakeholder can read what happened without opening a trace. This is the bridge between "an agent did something" and "we have a test asset our team owns." For a worked example, the [login flow case study](https://browserbash.com/case-study) shows a real flow end to end.

## When agentic testing is the right call (and when it is not)

Here is the balanced part. Agentic testing is a tool, not a religion. Use it where its strengths line up with your problem.

### Reach for agentic testing when

- **The UI changes often.** Early-stage products, frequent redesigns, and heavy A/B testing punish brittle selectors. An agent that reads the page tolerates churn that would break a script daily.
- **You want coverage fast.** Writing one English objective is minutes; writing a robust page-object test is longer. For smoke checks across many flows, agents close the gap quickly.
- **The flow is exploratory or fuzzy.** "Make sure a new user can sign up and reach the dashboard" is a goal an agent can pursue even if the exact path varies. A script would need every branch enumerated.
- **You want non-coders contributing tests.** A product manager can write a plain-English objective or a markdown test. They cannot write a Playwright page object.

### Stick with scripted automation when

- **You need microsecond-precise, deterministic assertions** on a stable critical path. A login that has not changed in two years does not need an agent deciding what to do; a five-line script is faster, cheaper, and never surprises you.
- **Run cost or speed is critical at huge scale.** Thousands of runs per hour with tight latency budgets favor deterministic scripts over model inference, unless you are running small local models where the marginal cost is near zero.
- **The failure must be reproducible byte-for-byte.** Compliance-grade evidence sometimes demands an exact, replayable sequence. Agents introduce variance by design.

In practice most mature teams run **both**: scripted tests on the unchanging money paths, agentic tests on the churny surface area and for exploratory coverage. BrowserBash is deliberately built to slot into that mixed world rather than replace your existing suite. You can keep your Playwright tests and add `browserbash run` calls where selectors keep breaking.

## Trust, evidence, and debugging an agent

The first objection any senior SDET raises is fair: "If I cannot see what the agent did, I cannot trust the green checkmark." Agentic testing lives or dies on evidence.

BrowserBash records what happened so a pass is auditable. The `--record` flag captures a screenshot and a full `.webm` session video (via ffmpeg) on any engine, so you can watch the agent's actual run. On the **builtin** engine — an in-repo Anthropic tool-use loop — it additionally captures a Playwright trace you can open in the trace viewer, which is the same debugging surface your team already knows.

```bash
browserbash run "complete the checkout and verify the order confirmation" --record --upload
```

There are two engines to know about. The default, **stagehand** (MIT, by Browserbase), is the reliable workhorse for most objectives. The **builtin** engine is the Anthropic tool-use loop with the bonus of native Playwright traces. You pick the engine that fits how you want to debug.

For run history without standing up infrastructure, there is an optional, strictly opt-in cloud dashboard — `browserbash connect` plus `--upload` — that stores run history, video recordings, and per-run replay. It is free, and free uploaded runs are kept for fifteen days. If you would rather keep everything on your machine, `browserbash dashboard` gives you a fully local dashboard with no upload at all. No account is needed to *run* BrowserBash; the cloud piece is a convenience, not a gate. Pricing details, including what stays free, are on the [pricing page](https://browserbash.com/pricing).

### Where the browser actually runs

Agentic testing does not have to mean "on my laptop." BrowserBash switches where the browser runs with a single `--provider` flag: `local` (the default, your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. The agent logic is identical; only the execution surface moves. So you can develop a test against local Chrome and then run the exact same objective across a cloud grid for cross-browser coverage:

```bash
browserbash run "verify the pricing page loads and the annual toggle works" --provider lambdatest --record
```

That separation — agent decisions in one place, browser execution swappable underneath — is what lets agentic testing scale past a single machine without rewriting anything.

## A realistic adoption path

If you are sold enough to try it, do not boil the ocean. Start with one annoying flow — the one whose script breaks every other sprint. Express it as a single `browserbash run` objective against local Chrome with a mid-size local model, and watch it with `--record`. Once it passes reliably a few times, promote it to a committed `*_test.md` so it lives in version control and code review can see it. Then wire `--agent --headless` into a CI job and gate on the exit code. Only after that, if you want cloud history or cross-browser runs, add `--upload` or a `--provider` flag. Each step is reversible and adds one capability, so you are never betting the suite on day one.

Keep your scripted tests the whole time. The win is not replacing them; it is killing the maintenance on the parts of your app that change fastest while keeping deterministic coverage where it matters. If you want a broader survey of where this category is going, the [BrowserBash blog](https://browserbash.com/blog) tracks the agent landscape as it moves.

## FAQ

### What is agentic testing in simple terms?

Agentic testing is when you give an AI agent a plain-English goal — like "log in and add an item to the cart" — and the agent drives a real browser step by step to accomplish it, then reports whether it succeeded. You do not write selectors or a fixed script; the model decides each action by looking at the page. It differs from scripted automation because the intelligence runs at test time, not just when the test was written.

### How is agentic testing different from self-healing test automation?

Self-healing automation starts from a fixed, selector-based script and only improvises when a locator breaks, trying alternative selectors to keep the original script alive. Agentic testing often has no durable script at all — the agent perceives the page and decides every step against a live objective. Self-healing patches a recording; an agentic tool reasons about the goal from scratch on each run, which makes it far more tolerant of large UI changes.

### Does agentic testing replace Playwright or Selenium?

Not usually, and you should be skeptical of anyone who says it does. Deterministic scripts are still faster, cheaper, and more precise for stable critical paths, and agentic tests add variance and model cost. Most mature teams run both: scripted tests on the unchanging money paths and agentic tests on fast-changing or exploratory surfaces. BrowserBash is built to sit alongside an existing suite rather than rip it out.

### Can I run agentic testing for free without sending data to the cloud?

Yes. BrowserBash is Ollama-first, so by default it uses free local models with no API keys, and nothing leaves your machine. You can guarantee a $0 model bill on local models, and the local `browserbash dashboard` keeps run history on your own computer. The optional cloud dashboard is strictly opt-in via `browserbash connect` and `--upload`; you never need an account just to run a test.

Agentic testing is not magic, but it is a genuinely different way to get coverage on apps that move too fast for brittle scripts. The quickest way to feel the difference is to point an agent at a flow that keeps breaking and watch it adapt. Install with `npm install -g browserbash-cli`, write one plain-English objective, and run it against your own Chrome. An account is optional — if you later want cloud run history, you can [sign up](https://browserbash.com/sign-up), but the CLI is yours to use today for $0.
