---
title: Midscene vs Stagehand: AI UI Automation Compared
description: "Midscene vs Stagehand compared: visual-model UI automation versus DOM-grounded actions, plus BrowserBash, the free CLI that ships Stagehand with Ollama."
date: 2026-05-16
category: comparison
---

If you are building AI UI automation in 2026, the Midscene vs Stagehand question lands on your desk fast, because the two projects answer the same problem in genuinely different ways. Both let you stop hand-maintaining CSS and XPath selectors and instead tell a model what you want done on a page. But they disagree at the most basic level about *how the model should see the page*: Midscene leans on a visual model that reasons about screenshots and pixel coordinates, while Stagehand grounds its actions in the DOM and the accessibility tree. That single split shapes everything downstream — accuracy on weird layouts, token cost, latency, determinism, and how it behaves inside a canvas-heavy app. This guide compares them the way a senior SDET who has shipped both styles would, then shows where BrowserBash fits as a free CLI that ships Stagehand with Ollama by default.

I will name the real overlaps, say plainly where each tool is the better fit, and avoid inventing benchmarks or pricing that is not public. By the end you should be able to pick one without second-guessing, or know when to skip the SDK plumbing entirely.

## What Midscene and Stagehand actually are

Before comparing them, it is worth pinning down what each project is, because a lot of bad takes come from treating them as interchangeable. They are not.

**Midscene** (often written Midscene.js) is an open-source project for AI-driven UI automation. The core pitch is that you describe an action in plain language — "click the login button," "type the search term," "assert the cart shows two items" — and a model carries it out against the real page. Midscene is known for leaning into **visual understanding**: it can use vision-capable models to reason about what is actually rendered on screen, which means it can work in places where the DOM is unhelpful or absent. It ships integrations so you can call it from inside your test code and automation scripts, and it has support for a YAML-style authoring flow as well. As of 2026 it has a real following among engineers who want a selector-free experience without leaving their JavaScript or TypeScript stack.

**Stagehand** is an open-source browser automation framework from Browserbase, built on top of Playwright and released under the MIT license. Its bet is different. Instead of treating the page primarily as an image, Stagehand exposes a small, composable API — primitives like `act()` ("click the sign-in link"), `extract()` (pull structured data against a schema), and `observe()` (ask the page what actions are available) — plus an `agent()` mode for when you want full autonomy. Under the hood, Stagehand grounds those instructions in the page structure: the DOM and accessibility tree are the primary signal it feeds the model, so "click the login button" resolves to an actual element rather than a screen coordinate. Because the deterministic parts run as ordinary Playwright, you get the reliability characteristics of a mature, well-understood tool.

The shortest way to frame the split: **Midscene is screenshot-first; Stagehand is DOM-first.** Midscene asks the model to look at the page like a human would. Stagehand asks the model to act on the page like a developer would, against structured elements. Neither is "correct" in the abstract — they are optimized for different failure modes.

## The core difference: visual model vs DOM grounding

Almost everything else in the Midscene vs Stagehand comparison flows from this one architectural choice, so it is worth sitting with it.

### How a visual-model approach behaves

When a tool reasons primarily from a screenshot, it sees what you see. That is its superpower. A visual model does not care whether a button is a `<button>`, a `<div>` with an `onclick`, an icon font, or a sprite baked into a `<canvas>`. If a human can look at the pixels and know where to click, a good visual model usually can too. This is exactly why Midscene's approach shines on the pages that wreck DOM-based tools: `<canvas>` and WebGL apps, charting libraries, custom drawing surfaces, design tools, maps, and any UI where the meaningful content never lands in queryable HTML.

The tradeoffs are real and worth being honest about. Visual reasoning leans on capable multimodal models, and screenshots are token-heavy inputs, so you tend to pay more per step in both latency and cost. Coordinate-based clicking can also be sensitive to resolution, device pixel ratio, and dynamic layout shifts — the model has to re-localize the target each time the page moves. And because the model is interpreting an image rather than asserting against a stable element handle, two runs can disagree in ways that are harder to debug than a failed selector. None of this makes the visual approach wrong. It makes it the right tool for a specific class of pages, and a heavier one for ordinary form-and-button flows.

### How DOM grounding behaves

Stagehand's DOM-first approach inverts those tradeoffs. By feeding the model the page's structure — element roles, labels, text, accessibility attributes — it turns "click the Add to Cart button under the second product" into a resolution against real nodes. That has a few concrete payoffs. Targets are described by their semantics, not their pixel position, so the same instruction survives a layout reflow that would move a coordinate. The model gets a more compact, structured representation than a full-resolution screenshot, which tends to mean fewer tokens and tighter latency. And when something fails, you can inspect which element it tried to act on, which is a far better debugging story than "the model clicked empty space."

The cost is the mirror image of Midscene's strength. When the meaningful UI is not in the DOM — a chart drawn to canvas, a video player's custom controls, a WebGL scene — DOM grounding has less to work with. Stagehand mitigates this in practice (it is built on Playwright and can fall back to richer strategies), but if your entire app is a drawing surface, a screenshot-native tool has a structural advantage there. This is the single most useful question to ask yourself when choosing: **is the thing I need to interact with actually in the DOM?** If yes, DOM grounding is usually faster, cheaper, and more repeatable. If no, a visual approach earns its keep.

## Reliability, determinism, and CI behavior

If you are using AI UI automation for one-off scrapes or research tasks, run-to-run variance barely matters. If you are running a suite 200 times a day in CI and it must give the same verdict each time, variance is a liability, and the two approaches behave differently here.

DOM-grounded actions tend to be more repeatable because the model is resolving against stable, named elements. Stagehand's design encourages you to script the deterministic parts in Playwright and only invoke the model at the exact step where a selector would be brittle. That keeps most of the run as ordinary, well-understood code, which is the opposite of flaky. Visual reasoning, by contrast, re-interprets an image every step; that flexibility is what lets it handle surprises, but it is also a source of non-determinism. Same task, two runs, occasionally two different paths.

There is a model-quality dimension here that applies to *both* tools and is easy to underestimate. AI UI automation is only as steady as the model driving it. A frontier hosted model will hold a long multi-step flow together far better than a small local one. This is not a knock on either project — it is physics of the current model landscape. Plan your model choice around the difficulty of the flow, not just the tool's name.

## Authoring model and developer experience

Both Midscene and Stagehand are, at heart, things you call from code. That is a feature for engineers and a friction point for everyone else.

With **Stagehand**, you write TypeScript (or JavaScript) that imports the library, constructs a Stagehand instance, and calls `act` / `extract` / `observe`, often interleaved with normal Playwright. If your team already lives in Playwright, this feels natural — you are adding AI calls at the brittle spots rather than rewriting your stack. With **Midscene**, you similarly wire its SDK into your project, or author flows in its YAML format; the natural home is inside code you write and own, with the model handling the visual reasoning at each step.

For a frontend engineer maintaining a test suite, "import a library and construct an agent" is fine. For a QA team without a dedicated automation engineer, that is often exactly the friction they were trying to escape. The artifact is still code: a `describe`/`it` block full of AI calls is not something a non-developer reviews comfortably in a pull request. That gap — between "I want AI to drive the browser" and "I do not want to maintain another SDK in my app" — is the opening that a CLI-first tool fills, which brings us to BrowserBash.

## Where BrowserBash fits: Stagehand, shipped, with Ollama by default

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. The relevant fact for this comparison: its default engine **is Stagehand**. So BrowserBash is not a third competitor that reinvents the grounding strategy — it is a packaged, batteries-included way to use Stagehand's DOM-grounded approach without writing the SDK glue yourself. You install one command, write a plain-English objective, and an AI agent drives a real Chrome step by step, then returns a verdict plus structured results. No selectors, no page objects, no `new Stagehand()` in your codebase.

The other big difference is the model story. Where wiring up either SDK usually pushes you toward a hosted API key, BrowserBash is **Ollama-first**: it defaults to free local models, so there are no API keys and nothing leaves your machine. It auto-resolves a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. You can guarantee a literal $0 model bill by staying on local models. If you want hosted muscle for a hard flow, it supports OpenRouter — including genuinely free hosted models such as `openai/gpt-oss-120b:free` — and Anthropic Claude with your own key.

Here is the honest caveat, because it matters for both Midscene and Stagehand too: very small local models (roughly 8B and under) can get flaky on long, multi-step objectives. The sweet spot is a mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model for the genuinely hard flows. Local-first is a real cost and privacy win; it is not a license to point an 8B model at a 15-step checkout and expect perfection.

```bash
# Install once
npm install -g browserbash-cli

# Default engine is Stagehand, default model is local Ollama — no keys
browserbash run "Search for 'wireless headphones', open the first result, and confirm the price is visible"
```

You did not import a library, construct an agent, or pick a grounding strategy. You got Stagehand's DOM-first behavior with a local model, from one line.

## Feature comparison at a glance

A table is the fastest way to see the shape of the Midscene vs Stagehand decision, and where BrowserBash sits relative to both. Where a fact is not publicly specified, I have said so rather than guessing.

| Dimension | Midscene | Stagehand | BrowserBash |
| --- | --- | --- | --- |
| Primary grounding | Visual / screenshot-first | DOM + accessibility tree | Stagehand engine (DOM-first) |
| What you author | SDK calls / YAML flows | TypeScript SDK on Playwright | Plain-English objective or `*_test.md` |
| License | Open source | MIT | Apache-2.0 |
| Built on | Its own visual stack | Playwright | Stagehand (default) + builtin engine |
| Local models out of the box | Depends on config | You wire model yourself | Ollama-first, $0 default |
| Strongest on | Canvas / WebGL / pixel-only UI | Standard DOM apps, repeatable CI | DOM apps with zero setup |
| CI machine output | You build it | You build it | `--agent` NDJSON + exit codes |
| Committable test files | YAML | Code | Markdown `*_test.md` with `@import` + `{{variables}}` |
| Account required | Per project | No | No (optional free dashboard) |

Read the table as a map, not a scoreboard. Midscene's visual grounding is a genuine advantage on canvas-heavy UIs that you should not wave away. Stagehand's DOM grounding wins on the bread-and-butter web apps that make up most QA work. BrowserBash's value is that it removes the setup tax on the Stagehand path and bolts on local-first models and CI-shaped output.

## CI, agent mode, and committable tests

This is where a packaged CLI pulls ahead of using either SDK directly, so it is worth detail.

When you run either Midscene or Stagehand inside your own harness, getting clean pass/fail signal and artifacts into a pipeline is doable, but it is plumbing you build and maintain. BrowserBash ships that contract. Its `--agent` mode emits **NDJSON** — one JSON event per line — on stdout, with no prose to parse, which is exactly what a CI job or an AI coding agent wants to consume. The exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. You wire it into a pipeline in minutes, not days.

```bash
# CI-friendly: machine-readable events, real exit codes, headless
browserbash run "Log in, add an item to the cart, complete checkout, and verify 'Thank you for your order!'" \
  --agent --headless
```

The other ergonomic win is **committable Markdown tests**. You can write a `*_test.md` file where each list item is a step, compose files together with `@import`, and template values with `{{variables}}`. Secret-marked variables are masked as `*****` in every log line, so credentials never leak into your run output. After each run BrowserBash writes a human-readable `Result.md`. That gives you a test artifact a non-developer can read and review in a pull request — the thing an SDK `describe`/`it` block does not.

```bash
# A committable, reviewable test with a masked secret
browserbash testmd run ./login_test.md --secret PASSWORD={{PASSWORD}}
```

If you want run history, video recordings, and per-run replay, there is an optional free cloud dashboard via `browserbash connect` plus `--upload` (strictly opt-in; free uploaded runs are kept 15 days), and a fully local dashboard with `browserbash dashboard`. No account is required to run anything. For deeper walk-throughs, the [learn hub](https://browserbash.com/learn) and the [blog](https://browserbash.com/blog) cover the testmd format and agent mode in detail.

## Recording, providers, and where the browser runs

A practical concern that neither the Midscene nor Stagehand README solves for you out of the box is artifacts and execution location. BrowserBash handles both.

For evidence, `--record` captures a screenshot *and* a full `.webm` session video (via ffmpeg) on any engine. If you switch to the in-repo `builtin` engine (an Anthropic tool-use loop), it additionally captures a Playwright trace you can open in the trace viewer. That is the kind of artifact you actually want when a flaky run fails at 3 a.m. and you need to see what the agent saw.

For *where* the browser runs, a single `--provider` flag moves the whole run: `local` (the default, your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, or `browserstack`. So you can develop locally on free models and then fan the same objective across a cloud grid for cross-browser coverage without rewriting anything.

```bash
# Same objective, run on a cloud grid with a video recording
browserbash run "Open the pricing page and confirm the Pro plan lists annual billing" \
  --provider lambdatest --record
```

Midscene and Stagehand can of course be pointed at remote browsers too — Stagehand has a natural relationship with Browserbase — but you assemble that yourself. With BrowserBash it is one flag.

## When to choose Midscene

Be honest with yourself about your app. Choose Midscene when the UI you are automating is genuinely *visual* — a `<canvas>` or WebGL app, a design or whiteboard tool, a charting-heavy dashboard, a map, a game, or any surface where the meaningful content never makes it into queryable HTML. In those cases a screenshot-native model is not just convenient, it is the only approach that has the right signal to work with. Choose Midscene, too, if you are a JavaScript or TypeScript engineer who wants visual AI assertions inside an existing suite and you are comfortable owning an SDK. If your pages are pixels, Midscene is the better fit, and I would not try to talk you out of it.

## When to choose Stagehand

Reach for Stagehand when you are automating standard web applications — forms, buttons, tables, multi-step flows over real HTML — and you care about repeatability and cost. DOM grounding gives you more deterministic, cheaper, more debuggable runs on exactly the kind of app most teams test. Stagehand is also the right call when you already live in Playwright and want to add AI surgically at the brittle steps rather than rewriting your stack, or when you want the option to scale into Browserbase's infrastructure. If your UI is in the DOM and you want control, Stagehand is the stronger primitive.

## When BrowserBash is the better call

Pick BrowserBash when you want Stagehand's DOM-grounded behavior **without** the setup: no `new Stagehand()` in your repo, no API key wrangling, no CI plumbing to build. It is the right fit if you are a QA-leaning team that wants a CLI and committable Markdown tests instead of an SDK, if data residency matters and you want runs to stay on local models for a guaranteed $0 bill, or if you need clean NDJSON and real exit codes for CI and AI coding agents on day one. It is also a fast way to *try* the DOM-grounded approach before committing to writing Stagehand code yourself — and if you later hit a canvas-only screen, you now know to evaluate a visual tool for that surface specifically. Compare the trade-offs on the [pricing page](https://browserbash.com/pricing) and the [case study](https://browserbash.com/case-study) if you want concrete numbers.

## A realistic example flow

To make this less abstract, here is a flow all three approaches can run, and how BrowserBash expresses it. The objective is the kind of thing that breaks selector-based suites every release: log into a store, add an item to the cart, complete checkout, and verify the confirmation text.

```bash
browserbash run "Log in with the test account, add the first product to the cart, \
go through checkout, and verify the page shows 'Thank you for your order!'" \
  --record --agent
```

With Stagehand directly, you would author this as a TypeScript script mixing Playwright navigation with `act()` and `extract()` calls, then build your own pass/fail reporting. With Midscene, you would call its SDK and let the visual model resolve each step from screenshots. With BrowserBash you wrote one English sentence, got DOM-grounded Stagehand execution on a local model, a `.webm` recording, and NDJSON your pipeline can read. Same outcome, very different amount of code you own.

## FAQ

### Is Midscene or Stagehand better for AI UI automation?

It depends on your app. Midscene's visual, screenshot-first approach is better when the UI lives in pixels — canvas, WebGL, charts, maps, or design tools where the DOM is unhelpful. Stagehand's DOM grounding is better for standard web apps because it is more repeatable, cheaper per step, and easier to debug. Match the tool to whether your target elements are actually in the DOM.

### What is the difference between Midscene and Stagehand?

The core difference is how each tool perceives the page. Midscene leans on a visual model that reasons about screenshots and pixel positions, while Stagehand grounds its actions in the DOM and accessibility tree on top of Playwright. That split drives everything downstream: accuracy on canvas-heavy pages, token cost, latency, and how deterministic your CI runs are.

### Does BrowserBash use Stagehand?

Yes. Stagehand is BrowserBash's default engine, so you get its DOM-grounded behavior without writing any Stagehand code. BrowserBash also ships an in-repo builtin engine based on an Anthropic tool-use loop. You pick the engine with a flag and otherwise just write a plain-English objective.

### Can I run Midscene or Stagehand alternatives with local models for free?

BrowserBash is Ollama-first and defaults to free local models, so you can run with no API keys and keep everything on your machine for a $0 model bill. Be aware that very small local models (around 8B and under) can be flaky on long multi-step flows; a mid-size local model like Qwen3 or Llama 3.3 70B-class, or a capable hosted model, is the sweet spot for hard tasks.

Ready to try the DOM-grounded approach without the SDK setup? Install with `npm install -g browserbash-cli` and run your first plain-English objective in under a minute. An account is optional — you can [sign up](https://browserbash.com/sign-up) for the free dashboard whenever you want run history and replays, or stay fully local forever.
