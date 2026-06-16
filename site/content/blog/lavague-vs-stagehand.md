---
title: LaVague vs Stagehand: Open-Source AI Automation
description: "LaVague vs Stagehand compared honestly for SDETs — design, stability, and a turnkey CLI that packages Stagehand with structured results and a $0 model bill."
date: 2026-02-07
category: comparison
---

If you have spent any time looking at open-source AI browser automation in the last year, the lavague vs stagehand question has probably landed on your desk. Both projects let an LLM drive a real browser from natural-language instructions instead of brittle CSS selectors, both are MIT-or-similar licensed, and both promise to replace some of the page-object grind that SDETs have lived with for a decade. They are not the same tool, though, and they were built by people solving different problems. This guide walks through how each one is designed, where each tends to wobble, and what it actually takes to ship one of them into a CI pipeline you can trust on a Monday morning.

I have run both against real flows — logins, multi-step checkouts, the kind of forms that hide a submit button behind a cookie banner. The short version: Stagehand is the steadier of the two for production-style automation today, LaVague is the more interesting research lineage, and neither ships as a turnkey command-line tool you can hand to a junior tester. That gap is where the rest of this article goes.

## LaVague vs Stagehand at a glance

Before the deep dive, here is the honest one-paragraph summary of each.

**LaVague** is an open-source framework, originally released by Mithril Security, aimed at building "Large Action Models" that turn an objective into browser actions. Its design leaned heavily on a Retrieval-Augmented Generation idea: pull the relevant chunks of the DOM, feed them to an LLM, and have the model emit Selenium or Playwright code that gets executed. It was one of the earlier projects to popularize the "describe the goal, let the model write the automation" pattern in open source. As of 2026, the public activity and roadmap around the original project are not as clearly maintained as they once were, so treat any specific feature claim as "check the repo today" rather than gospel.

**Stagehand** is an open-source (MIT) framework from Browserbase, built on top of Playwright. Instead of generating a whole script, it exposes a small, deliberate API — `act`, `extract`, `observe` — that you call from TypeScript or Python. You stay in control of the test structure; the AI only resolves the fuzzy parts, like "click the primary checkout button" or "extract the order total." That design choice is the single biggest practical difference between the two, and it is why Stagehand tends to behave more predictably in a suite.

| Dimension | LaVague | Stagehand |
| --- | --- | --- |
| Origin | Mithril Security | Browserbase |
| License | Open source (Apache-2.0, per repo) | MIT |
| Core idea | RAG over the DOM, model emits automation code | Atomic AI actions on top of Playwright |
| Browser engine | Selenium / Playwright (driver-based) | Playwright |
| Primary surface | Python framework | TypeScript-first, Python available |
| Control model | Agent generates and runs code | You write structure, AI fills the fuzzy steps |
| Maintenance signal (as of 2026) | Less clearly active | Actively maintained |
| Best fit | Research, experimentation, agentic exploration | Production-style web automation |

Everything in that table is publicly observable from the projects themselves. Where I am not certain — current maintenance cadence, exact provider support on a given day — I say so, because an honest comparison is worth more to you than a confident wrong one.

## How each one is designed

The design philosophy is where lavague vs stagehand stops being a spec-sheet exercise and starts mattering to your week.

### LaVague: generate the script, then run it

LaVague's mental model is closer to a coding agent than a test runner. You give it an objective and a URL. It inspects the page, retrieves the parts of the DOM it thinks are relevant, and asks the model to produce executable automation code — historically Selenium, later Playwright-flavored actions. That code runs, the page changes, and the loop repeats until the objective is met or the agent gives up.

The upside is flexibility. Because the model is writing fresh code each step, it can improvise around layouts it has never seen. For open-ended tasks — "go find the cheapest flight and tell me the price" — that improvisation is genuinely useful. It feels like watching an agent think.

The downside is the same thing. Generated code is non-deterministic by nature. Two runs of the same objective can take different paths, click different elements, and fail in different places. When a step breaks, you are debugging code the model wrote on the fly, which is harder than debugging code you wrote yourself. For exploratory research that trade is fine. For a regression suite that has to pass the same way every night, it is a tax.

### Stagehand: keep the human in the structure

Stagehand inverts the relationship. You write the test skeleton in Playwright like you normally would — navigate here, wait for that, assert this. At the points where a hard-coded selector would be brittle, you call an AI primitive instead:

- `act("click the sign-in button")` performs one fuzzy action.
- `extract({ instruction: "get the order total", schema })` pulls structured data back out against a schema you define.
- `observe()` returns candidate actions on the page so you can preview what the model would do before it does it.

Because the AI is scoped to individual steps and everything else is deterministic Playwright, the blast radius of a flaky model decision is one line, not the whole script. You also get Playwright's mature waiting, tracing, and parallelism for free. That is a meaningful stability advantage, and it is the main reason Stagehand has become the more common pick for teams putting AI automation near production.

The cost is that Stagehand is still a library you assemble. You write code, manage a Node or Python project, wire up a model provider, and handle results yourself.

## Stability in practice: what actually breaks

Marketing copy never tells you about the failures, so here is the field report.

**Small models lie convincingly.** Both frameworks are only as good as the model behind them. With a weak model, the agent will confidently click the wrong element, hallucinate a button that is not there, or declare success on a page that never loaded. This is not a knock on either project — it is the nature of LLM-driven automation in 2026. Plan your model choice as carefully as you plan your selectors.

**Code generation amplifies variance.** LaVague's generate-and-run loop means the same objective can succeed at 9am and fail at 9:05 because the model took a different path. You can mitigate with lower temperature and tighter prompts, but you are managing variance, not eliminating it.

**Scoped actions contain the damage.** Stagehand's per-step model means a bad decision usually surfaces as one failed `act` call you can inspect, retry, or replace with a deterministic selector. That containment is the difference between a five-minute fix and an evening of bisecting generated scripts.

**Long flows are where everything frays.** A three-step task is easy for almost any setup. A twelve-step checkout with a coupon, an address form, and a payment iframe is where flaky models fall apart in both frameworks. The honest takeaway: keep objectives focused, assert often, and do not ask a single AI call to carry an entire end-to-end journey.

If you want a broader survey of how these tools stack up against the wider field, the [BrowserBash learn hub](https://browserbash.com/learn) collects the patterns that hold up across frameworks.

## Where BrowserBash fits: Stagehand, packaged

Here is the practical problem with both libraries. You cannot hand a Playwright-plus-Stagehand TypeScript project to a manual tester and expect a clean run on day one. There is a Node toolchain, a model provider to configure, API keys to manage, and results to parse yourself. The intelligence is there; the packaging is not.

BrowserBash is the packaging. It is a free, open-source (Apache-2.0) command-line tool from The Testing Academy that wraps **Stagehand as its default engine** and turns the whole thing into one command. You install it globally, write a plain-English objective, and an AI agent drives a real Chrome browser step by step — no selectors, no page objects — then returns a verdict plus structured results you can actually consume.

```bash
npm install -g browserbash-cli

browserbash run "log in with test@shop.dev, add the first product to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

That is the same Stagehand engine you would otherwise stand up yourself, minus the project scaffolding. You get the steady, scoped-action design of Stagehand without writing the harness around it. If you want the in-repo alternative, BrowserBash also ships a `builtin` engine — an Anthropic tool-use loop — that you can switch to for flows where you want the model reasoning closer to the metal. You can read more about both on the [features page](https://browserbash.com/features).

### The model story: $0 by default

This is the part SDETs on a budget care about most. BrowserBash is **Ollama-first**. By default it talks to a free local model on your machine — no API keys, nothing leaves your laptop, and a guaranteed $0 model bill. It auto-resolves in order: a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. So you can start free and graduate to a hosted model only when a flow actually needs the horsepower.

Be honest with yourself about model size, though. Very small local models (roughly 8B parameters and under) get flaky on long multi-step objectives — they lose the thread halfway through a checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. BrowserBash also supports OpenRouter, including genuinely free hosted models such as `openai/gpt-oss-120b:free`, and Anthropic's Claude if you bring your own key. Same intelligence story as running Stagehand directly, but the model resolution is handled for you.

## Structured results: the part libraries leave to you

Both LaVague and Stagehand give you Python or TypeScript objects and then step back. Wiring those into CI — exit codes, machine-readable logs, artifacts — is your job. BrowserBash treats that as a first-class feature, which is what makes it usable by both humans and other AI agents.

### Agent mode for CI and coding agents

Run with `--agent` and BrowserBash emits NDJSON — one JSON event per line on stdout — with clean exit codes: `0` passed, `1` failed, `2` error, `3` timeout. No prose to parse, no regex against log output. This is built for pipelines and for AI coding agents that need to call a browser test and read the result programmatically.

```bash
browserbash run "search for 'wireless headphones', open the first result, confirm the price is visible" --agent --headless
```

Pipe that into a CI step, check the exit code, and you have a gate. There is a deeper write-up of this pattern on the [BrowserBash blog](https://browserbash.com/blog) if you want to see it wired end to end.

### Committable Markdown tests

For repeatable suites, BrowserBash supports `*_test.md` files where each list item is a step. They support `@import` composition and `{{variables}}` templating, and any variable you mark as a secret is masked as `*****` in every log line. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md
```

A test file might template the login like this, keeping the password out of every log:

```bash
# checkout_test.md
- Go to https://shop.dev/login
- Log in as {{username}} with password {{password!secret}}
- Add the first product to the cart
- Complete checkout and verify "Thank you for your order!"
```

You commit that file next to your code, diff it in review, and run it anywhere. Neither LaVague nor Stagehand ships this format out of the box — it is the layer BrowserBash adds on top.

### Recording and replay

Pass `--record` and BrowserBash captures a screenshot and a full `.webm` session video via ffmpeg on any engine. On the `builtin` engine it additionally captures a Playwright trace you can open in the trace viewer. When a flaky run fails at 3am, the video tells you what the model actually saw.

## Where the browser runs: providers

A detail that matters for scale. Stagehand on its own runs wherever you point Playwright. BrowserBash makes the execution target a single flag, `--provider`:

| Provider | What it is |
| --- | --- |
| `local` (default) | Your own Chrome on your machine |
| `cdp` | Any Chrome DevTools Protocol endpoint |
| `browserbase` | Browserbase cloud browsers |
| `lambdatest` | LambdaTest cloud grid |
| `browserstack` | BrowserStack cloud grid |

So you can develop locally against your real Chrome, then run the identical objective on a cloud grid for cross-environment coverage without rewriting anything.

```bash
browserbash run "complete the guest checkout flow and verify the confirmation page" --provider lambdatest --record
```

That portability is the kind of thing you would otherwise build yourself around a raw Stagehand setup.

## Optional dashboards (strictly opt-in)

No account is needed to run BrowserBash — that is worth repeating, because it is unusual. Everything above works offline with a local model and no sign-up. If you do want run history and replay, there are two paths:

- A free, fully **local** dashboard: `browserbash dashboard`. Nothing leaves your machine.
- A free **cloud** dashboard with run history, video recordings, and per-run replay, which is strictly opt-in via `browserbash connect` and the `--upload` flag. Free uploaded runs are kept for 15 days.

```bash
browserbash run "verify the pricing page loads and the annual toggle works" --upload
```

You can compare what the free tier covers on the [pricing page](https://browserbash.com/pricing). The point is that observability is available without being mandatory, which is the opposite of most commercial AI-testing platforms.

## When to choose each tool

Here is the genuinely balanced decision guide. None of these tools is universally best; they fit different jobs.

### Choose LaVague when

You are doing research or open-ended agentic exploration, you want to study the generate-and-run pattern, or you are building something where the agent improvising its own automation code is the point rather than a liability. LaVague's lineage in Large Action Models makes it a good place to learn how these systems think. Just go in clear-eyed about maintenance status as of 2026 and the variance that comes with code generation.

### Choose Stagehand when

You are writing production-style web automation in TypeScript or Python and you want AI to handle only the fuzzy parts while you keep deterministic control of the structure. Stagehand's scoped `act`/`extract`/`observe` model on top of Playwright is the steadier choice for suites that have to pass the same way every night. If your team is comfortable owning a Node or Python project and wiring up results yourself, use Stagehand directly — it is excellent, and BrowserBash builds on it precisely because it is good.

### Choose BrowserBash when

You want Stagehand's stability without the assembly. You need a single command instead of a project, structured NDJSON results for CI, committable Markdown tests with secret masking, recording and replay, a one-flag switch between local Chrome and cloud grids, and a $0 default model bill on local models. It is the right pick when you want to hand AI browser testing to a teammate who should not have to stand up a TypeScript harness first. It is also the right pick for AI coding agents that need a browser-test tool with clean exit codes.

If your flows are mostly login and checkout regressions, browse the [case study](https://browserbash.com/case-study) to see the kind of objectives that hold up well in practice.

## A worked example: the same checkout, three ways

To make the difference concrete, picture one task: log in to a store, add an item to the cart, complete checkout, and verify the page shows "Thank you for your order!"

With **LaVague**, you would point the agent at the store, give it the objective, and let it generate and run automation code step by step. It might succeed beautifully on the first try and take a slightly different path on the second. Great for exploration, nerve-wracking for a nightly gate.

With **Stagehand**, you would write a Playwright test that navigates to the login page, calls `act("log in as the test user")`, asserts the cart count, calls `act("complete checkout")`, and then `extract`s the confirmation text against a schema. Solid and repeatable — once you have built the project around it.

With **BrowserBash**, it is the command you already saw, optionally as a committed `*_test.md` file, with `--agent` for the CI exit code and `--record` for the video when it fails. Same Stagehand engine underneath, none of the scaffolding. That is the whole pitch: keep the engine that earned its reputation, drop the setup tax.

## FAQ

### Is LaVague or Stagehand better for production test automation?

For production-style web automation today, Stagehand is generally the steadier choice because its scoped `act`/`extract`/`observe` design keeps you in deterministic control while the AI only handles fuzzy steps. LaVague's generate-and-run approach is more flexible for open-ended exploration but introduces more run-to-run variance. As of 2026, Stagehand also shows clearer active maintenance, which matters for anything you depend on nightly.

### Is Stagehand free and open source?

Yes. Stagehand is MIT-licensed and open source, maintained by Browserbase, and built on top of Playwright. You can use it without paying for the framework itself, though you still bring your own model provider and pay any model costs separately. BrowserBash uses Stagehand as its default engine and is itself free and open source under Apache-2.0.

### Can I run AI browser automation without paying for API keys?

Yes, if you use BrowserBash. It is Ollama-first and defaults to a free local model, so you can run with a guaranteed $0 model bill and nothing leaving your machine. The honest caveat is that very small local models can get flaky on long multi-step flows, so a mid-size local model or a capable hosted model is worth it for hard objectives.

### How is BrowserBash different from using Stagehand directly?

BrowserBash packages Stagehand into a turnkey CLI so you skip the project setup. You get one install command, plain-English objectives, structured NDJSON results with CI exit codes, committable Markdown tests with secret masking, video recording and replay, a one-flag switch between local Chrome and cloud grids, and automatic model resolution. With Stagehand alone you assemble all of that yourself in a Node or Python project.

Both LaVague and Stagehand are strong open-source contributions to AI browser automation, and if you want the raw libraries, use them. If you want Stagehand's stability delivered as a single command with structured results, install BrowserBash with `npm install -g browserbash-cli` and write your first plain-English test in minutes. No account is required to run it, but if you ever want free run history and replay you can [sign up](https://browserbash.com/sign-up) whenever it suits you.
