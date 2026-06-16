---
title: "Prompt-Based Browser Automation: Write Prompts, Not Scripts"
description: "Prompt-based browser automation explained: write plain-English prompts instead of selectors, contrast browser-use and Stagehand, and run prompts as tests."
date: 2026-03-13
category: guide
---

Prompt-based browser automation is the practice of telling a browser what to do in plain language and letting a model translate that intent into clicks, typing, scrolling, and assertions against a live page. Instead of hand-authoring `await page.getByRole('button', { name: 'Checkout' }).click()`, you write "add the backpack to the cart, go to checkout, and confirm the order succeeds." A model reads the actual DOM on each run, picks the element that matches your intent, performs the step, and reports back whether it worked. The script you used to maintain by hand becomes a prompt you maintain in English. This guide walks through how that shift works, how the two leading open-source approaches — browser-use and Stagehand — differ, and how a CLI like [BrowserBash](https://www.npmjs.com/package/browserbash-cli) turns a prompt into a committable test file.

The reason this matters is not novelty. It is where the difficulty lives. In traditional automation, the hard part is the frozen mapping between human intent and CSS selectors: you solve it once, then babysit it forever as the frontend drifts. Prompt-based automation moves that mapping into a model that re-derives it every run. That trade has real costs and real benefits, and the honest version of this article covers both.

## What "prompt-based browser automation" actually means

Classic browser automation is a translation problem you solve once and then maintain indefinitely. A person knows the goal — "log in and check the dashboard loads" — and converts it into precise instructions: find the email field by selector, type, find the password field, type, find the submit button, click, wait for navigation, assert an element exists. That script is fast and deterministic. It is also brittle. Rename a class, restructure the DOM, or change a `data-testid`, and the translation snaps. A human has to go fix it.

Prompt-based browser automation keeps the goal in English and lets the model do the translating, fresh, on every run. You supply a prompt. An agent reads the live page — usually a serialized accessibility tree or a filtered list of interactive elements — decides which element matches your description, acts, observes the result, and loops until the objective is met or it gives up. Nothing in your prompt names a selector. When the "Sign in" button moves from the header to a dropdown, a selector-based script breaks and a prompt-based one usually just finds the button in its new spot, because "click the sign-in button" is still true.

That is the whole pitch in one sentence: **you describe the destination, not the turn-by-turn directions.** The model handles the directions, and it re-plans the route whenever the road changes.

### The three things a prompt-based agent does on every step

It helps to picture the loop, because the abstraction hides real work:

1. **Perceive.** Read the current page state — typically the accessibility tree plus visible text, sometimes a screenshot for vision-capable models — and compress it into something a model can reason over within a token budget.
2. **Decide.** Given your prompt and the current state, choose the next concrete action: click this element, type this value, scroll, wait, or declare the objective met or failed.
3. **Act and verify.** Execute the action against the real browser, observe what changed, and feed that back into the next iteration.

Every claim about prompt-based automation — its resilience, its slowness, its occasional confusion — traces back to this loop. The model is genuinely looking at the page each time, which is why a renamed button rarely matters and why a model that is too small can wander off on step seven of a ten-step flow.

## Why prompts beat scripts for change-heavy work

The strongest case for prompt-based browser automation is maintenance cost on UIs that change often. If you run a product where the frontend ships weekly, your selector-based suite is in a constant low-grade war with your own developers. Every redesign, every component-library bump, every A/B test variant is a chance for a locator to go stale. The test did not catch a bug; the bug is in the test.

A prompt sidesteps a large class of those failures because it does not encode the structure of the page, only the intent. "Verify the order confirmation says thanks for your order" survives a checkout redesign that would have shattered a dozen selectors. You are describing user-visible truth, and user-visible truth is exactly what a test should assert.

There is a second, quieter benefit: prompts are readable by people who do not write Playwright. A product manager can read "log in, add the premium plan to the cart, apply coupon SAVE20, and confirm the total drops to $79" and tell you whether the test asserts the right thing. They cannot do that with a wall of `getByTestId` calls. That readability is not cosmetic — it is what lets the people who know the requirements review the tests that protect them.

### Where scripts still win, plainly

Prompt-based automation is not a free lunch, and pretending otherwise costs you credibility the first time it flakes. Be honest about the limits:

- **Speed and cost.** A model-in-the-loop step is slower than a compiled selector and, on hosted models, costs tokens. For a 2,000-case regression suite that runs on every commit, deterministic Playwright is usually the right tool. Prompts shine on the high-value, change-prone flows — login, signup, checkout, onboarding — not on exhaustively enumerating every edge case.
- **Determinism.** A selector clicks the same node every time. A model can, occasionally, choose a different reasonable element or phrase an assertion differently across runs. Good tooling pins this down, but it is a real property to design around.
- **Pixel-exact assertions.** "Is this button #2f80ed?" is a job for a selector and a computed-style check, not a prompt. Use the right tool.

The mature stance is a blend: deterministic code for the dense, stable core of your suite, and prompts for the brittle, business-critical flows where maintenance has been eating your week. Anyone selling you "delete all your Playwright" is overselling.

## browser-use vs Stagehand: two philosophies of the same idea

If you have wired an LLM to a browser in the last year, you have hit both names. They sit at opposite ends of one spectrum: how much control you hand the model versus how much you keep in your own code.

**browser-use** is an open-source Python framework for giving an LLM end-to-end control of a browser. You install it with pip, create an agent with a task string and a model client, and let it run. The library owns the perceive-decide-act loop: it reads the page's interactive elements, serializes them for the model, executes whatever the model picks, and loops until the task is done or it bails. The design value is autonomy. You describe a goal and the agent owns the entire journey, which makes it a natural fit for open-ended tasks where you genuinely cannot enumerate the steps up front — research flows, "find X and fill in Y," RPA over sites you do not control.

**Stagehand** is an open-source framework from Browserbase, built on Playwright and released under the MIT license. Its bet is the opposite. Rather than one big autonomous loop, Stagehand exposes a small, composable API — primitives like `act()` ("click the login button"), `extract()` (pull structured data against a schema), and `observe()` (ask the page what actions are available) — plus an `agent()` mode for when you do want autonomy. The headline is control. You can write a mostly deterministic Playwright script and drop in a single AI call exactly where a selector would be brittle. When the model is not invoked, you are running plain Playwright, with all the reliability that implies.

The shortest framing: **browser-use is autonomy-first; Stagehand is control-first.** One drives the whole car; the other hands you the wheel and helps on the tricky corners.

### A side-by-side

The table below sticks to what is publicly established about each project as of 2026. Where a detail is not publicly specified, I say so rather than invent it.

| Dimension | browser-use | Stagehand | BrowserBash |
| --- | --- | --- | --- |
| Primary language | Python | TypeScript / Node | Node CLI (no code to write) |
| Core philosophy | Autonomy-first agent loop | Control-first primitives + optional agent | Plain-English objective, agent drives a real browser |
| You write | A task string + model wiring | Playwright + `act`/`extract`/`observe` calls | An English objective or a markdown test |
| License | Open source (MIT) | MIT | Apache-2.0 |
| Model setup | Bring your own model client | Bring your own model client | Ollama-first local default; auto-resolves to Anthropic or OpenRouter keys |
| Built-in CI mode | Not a turnkey CLI contract | Library, you wrap it | `--agent` NDJSON + exit codes 0/1/2/3 |
| Where it shines | Open-ended autonomous tasks | Deterministic flows with surgical AI | Ready-to-run CLI, local-first, prompt-as-test |

Read that table as a map, not a scoreboard. If you are building a custom Python product around autonomous browsing, browser-use is a strong, honest pick and you should use it. If you are a TypeScript team that wants AI only at the brittle steps of an otherwise deterministic script, Stagehand is excellent and gives you the most control. BrowserBash is not trying to replace either library; it is built on Stagehand as its default engine and wraps the whole thing in a CLI so you can run a prompt without writing any wiring at all.

## How BrowserBash turns a prompt into something you run

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it once and give it an English objective; an AI agent drives a real Chrome or Chromium step by step — no selectors, no page objects — and returns a verdict plus structured results.

```bash
npm install -g browserbash-cli
browserbash run "log in to the demo store, add the first product to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

That command does the full loop described earlier: it perceives the page, decides each next action, acts against your local browser, and ends with a pass or fail. You did not write a single locator. You wrote the thing a stakeholder would actually say.

Two design choices make BrowserBash distinct from rolling your own browser-use or Stagehand setup. First is the model story. BrowserBash is **Ollama-first**: by default it talks to free local models, no API keys, nothing leaving your machine. It auto-resolves a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so the same command works whether you are offline on local models or pointed at a hosted one. You can guarantee a $0 model bill by staying local. The honest caveat: very small local models (roughly 8B and under) get flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model when the flow is genuinely hard. If a run wanders, the model is usually the lever to pull, not the prompt.

Second is where it runs. The default `local` provider drives your own Chrome. One `--provider` flag retargets the same prompt at a CDP endpoint, Browserbase, LambdaTest, or BrowserStack — useful when you want the prompt local for development and on a cross-browser grid for CI.

```bash
browserbash run "sign in and confirm the dashboard loads" --provider lambdatest
```

There is more on the model and provider story in the [BrowserBash learn hub](https://browserbash.com/learn), and a fuller capability breakdown on the [features page](https://browserbash.com/features).

## Prompt-as-test: markdown files with {{variables}} and @import

A one-off `run` command is great for exploration. But a prompt you cannot commit, diff, and re-run is not a test — it is a demo. This is where prompt-based automation earns its place in a real engineering workflow, and where BrowserBash's markdown tests come in.

A BrowserBash markdown test is a committable `*_test.md` file where each list item is a step. It reads like documentation because it is documentation, and it runs because the agent executes each line in order.

```markdown
# Checkout smoke test

- Go to {{baseUrl}}
- Log in as {{username}} with password {{password}}
- Add the first product to the cart
- Open the cart and proceed to checkout
- Fill shipping details and place the order
- Verify the page shows "Thank you for your order!"
```

Two features turn this from a cute file into a maintainable test asset. **`{{variables}}` templating** lets you parameterize the prompt — base URLs, usernames, coupon codes — so one test file runs against staging and production without edits. Crucially, secret-marked variables are masked as `*****` in every log line, so a password never lands in your terminal scrollback, your CI logs, or your `Result.md`. **`@import` composition** lets you factor shared setup (a login sequence, a fixture reset) into one file and pull it into many, the same way you would extract a helper function — except the helper is English.

You run a markdown test like this:

```bash
browserbash testmd run ./checkout_test.md \
  --var baseUrl=https://staging.example.com \
  --var username=demo \
  --secret password=$STORE_PASSWORD
```

After each run, BrowserBash writes a human-readable `Result.md` next to your test — a plain account of what the agent did and whether the objective passed, with secrets masked. That artifact is reviewable by anyone, which closes the loop on the readability benefit: the people who own the requirements can read both the test and its result.

### Why this beats a brittle script as living documentation

A selector-heavy test rots into a thing only its author can read. A markdown prompt-test stays legible. When the checkout flow changes, you often do not touch the test at all — the agent re-derives the path. When the *requirement* changes, you edit one English line, and the diff in code review reads like a sentence: "Verify the page shows 'Order received'" instead of "Thank you for your order!". That is a review a product owner can actually do. There is a step-by-step walkthrough of this pattern in the [BrowserBash blog](https://browserbash.com/blog) if you want a worked example.

## Wiring prompts into CI and AI coding agents

The other half of "is this a real test" is whether a machine can run it unattended and know the result without parsing prose. BrowserBash's `--agent` mode emits NDJSON — one JSON event per line on stdout — and sets meaningful exit codes: `0` passed, `1` failed, `2` error, `3` timeout. No regex over human sentences, no scraping a log. Your CI step or your AI coding agent reads structured events and a clean exit code.

```bash
browserbash run "verify the login form rejects a wrong password and shows an error" \
  --agent --headless
```

In a GitHub Actions job, that exit code is your pass/fail. In an autonomous coding agent's loop, the NDJSON stream is a feed it can reason over while it iterates on a fix. This is the piece that makes prompt-based automation more than a clever local toy: it slots into the same machinery that runs your unit tests.

When something does fail and you need to see what happened, add `--record`. It captures a screenshot and a full `.webm` session video via ffmpeg on any engine; on the builtin engine it additionally captures a Playwright trace you can open in the trace viewer. BrowserBash ships two engines — `stagehand` (the default, MIT, by Browserbase) and `builtin` (an in-repo Anthropic tool-use loop) — and recording works across both.

```bash
browserbash testmd run ./checkout_test.md --record --upload
```

The `--upload` flag is strictly opt-in. With no account at all, everything runs locally and you can browse history in a free local dashboard via `browserbash dashboard`. If you want run history, video recordings, and per-run replay in a hosted view, `browserbash connect` plus `--upload` pushes runs to a free cloud dashboard; free uploaded runs are kept 15 days. You never need an account to run a single test — uploading is a convenience, not a gate.

## When to choose which approach

Here is the decision the way I would give it to a teammate.

**Reach for browser-use** when you are building a custom Python application around autonomous browsing — an agent that researches, navigates sites you do not control, and completes open-ended tasks where you cannot list the steps in advance. Its autonomy-first design is the right shape for that, and it is a serious, well-supported project. If your problem is "let an agent figure out the whole journey," browser-use is likely the better fit, and I would not talk you out of it.

**Reach for Stagehand** when you are a TypeScript team that wants a mostly deterministic Playwright script with surgical AI calls at the few steps where selectors are brittle. You keep maximum control, you keep Playwright's reliability where it matters, and you pay for the model only at the exact spots you choose. For teams that already live in Playwright and want to stay there, this is the most controllable option on the table.

**Reach for BrowserBash** when you want the prompt-based workflow as a ready-to-run tool rather than a library to integrate — when you want to type an English objective and get a verdict, commit prompts as `*_test.md` files with `{{variables}}` and `@import`, run them in CI with NDJSON and exit codes, and keep your model bill at $0 on local models with no keys and no data leaving your machine. It is built on Stagehand, so you inherit that engine's control-first reliability, but you skip the wiring. The honest boundary: if you need a deep custom Python agent loop, use browser-use; if you need to embed AI calls inside an existing TypeScript Playwright codebase, use Stagehand directly. BrowserBash is for the person who wants the result without building the harness.

A useful tiebreaker: how often does your UI change, and who needs to read the tests? High change plus non-engineer reviewers points hard at prompts. Stable UI plus a 2,000-case matrix points at deterministic code. Most teams need both, and the [pricing page](https://browserbash.com/pricing) and a few real [case studies](https://browserbash.com/case-study) can help you size where the line falls for you.

## A realistic first week with prompt-based automation

If you are adopting this, do not try to convert your whole suite. Pick the one flow that has wasted the most of your time on selector maintenance — usually login or checkout — and write it as a single prompt. Run it locally with `browserbash run`. Once it passes reliably, promote it to a `*_test.md` file, parameterize the environment with `{{variables}}`, mask the password as a secret, and wire it into CI with `--agent`. That is a complete, honest proof of value in a day, and it tells you whether your model choice holds up on your real flows before you bet anything bigger on it.

Watch two things during that week. First, model size: if a long flow drifts, move from a tiny local model to a 70B-class local model or a hosted one before you blame the approach. Second, assertion phrasing: prompts assert best against user-visible truth ("the page shows 'Thank you for your order!'"), not internal structure. Write assertions a customer could verify, and the agent will too.

## FAQ

### What is prompt-based browser automation?

Prompt-based browser automation means describing what you want a browser to do in plain language and letting an AI model translate that intent into clicks, typing, and assertions against a live page. The model reads the real DOM on each run and chooses the matching elements, so your prompt never names a CSS selector. It trades some speed and determinism for far lower maintenance on UIs that change often.

### Is browser-use or Stagehand better for prompt-based automation?

It depends on how much control you want. browser-use is autonomy-first and great for open-ended Python agents that own the whole journey, while Stagehand is control-first and ideal for TypeScript teams who want deterministic Playwright with surgical AI calls. Neither is strictly better; pick browser-use for autonomous tasks and Stagehand when you want to keep the wheel. BrowserBash builds on Stagehand to offer the same workflow as a ready-to-run CLI.

### Can I run prompt-based browser tests without API keys?

Yes. BrowserBash is Ollama-first and defaults to free local models, so no API keys are required and nothing leaves your machine. It auto-resolves a local Ollama install first, then falls back to an Anthropic or OpenRouter key if you set one. Very small local models can be flaky on long flows, so a mid-size local model or a capable hosted model is the sweet spot for hard objectives.

### How do you turn a prompt into a repeatable test?

You write the prompt as a committable markdown file where each list item is a step, then run it with a command like `browserbash testmd run ./file_test.md`. The file supports `{{variables}}` for parameterizing environments and `@import` for sharing common setup, and secret-marked variables are masked in every log. After each run it writes a human-readable `Result.md`, and `--agent` mode gives CI structured NDJSON output plus exit codes.

Ready to write prompts instead of scripts? Install the CLI with `npm install -g browserbash-cli` and run your first English objective against a real browser in under a minute. No account is needed to run anything locally; an optional free dashboard is available at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you later want hosted run history and replays.
