---
title: BrowserBash vs Stagehand: What Is the Actual Difference?
description: "BrowserBash vs Stagehand: the difference between BrowserBash and Stagehand is one is built on the other. BrowserBash is a CLI that runs on Stagehand."
date: 2026-06-26
category: comparison
---

The short, honest answer to "how does BrowserBash differ from Stagehand" is this: BrowserBash is not a competitor to Stagehand. BrowserBash is built on Stagehand. Stagehand is BrowserBash's default engine. So this is not a "pick one of two rivals" question. It is a "library versus a CLI built on that library" question, which is a very different thing to reason about.

This came up directly on Product Hunt, where Olli Paloviita asked, "How does this differ from stagehand?" It is a fair and common question, because both projects put natural-language browser automation front and center, and from a distance they can look like the same category. They are not the same layer. Stagehand (MIT, by Browserbase) is a TypeScript SDK you import into your own code. BrowserBash (Apache-2.0, by The Testing Academy) is a command-line tool and test runner that wraps Stagehand so you can write and run browser tests from your terminal or CI without writing TypeScript at all.

This article explains the layers precisely, shows where each one is the right choice, and is fair about Stagehand throughout, because Stagehand is genuinely excellent and BrowserBash depends on it.

## The one-sentence version

Stagehand is the engine. BrowserBash is the car built around that engine: the seats, the dashboard, the pedals, the ignition, plus the workshop that records what happened on every drive.

You can drive the engine directly if you want to build a custom vehicle. Most people who just need to get somewhere want the car.

## Layer one: what Stagehand actually is

Stagehand is a TypeScript SDK and framework from Browserbase, released under the MIT license. It gives you AI browser automation primitives that you call programmatically from your own Node or TypeScript code. The core surface is small and well chosen:

- `act` performs an action described in natural language, for example clicking a button or filling a field.
- `observe` looks at the page and tells you what actions are possible, which you can then feed back into `act` for more deterministic, reviewable steps.
- `extract` pulls structured data out of the page against a schema you define.
- An `agent` loop lets the model take multiple steps toward a higher-level goal on its own.

The mental model is "import a library, write code." You install Stagehand, you open a page, and you author your automation in TypeScript, mixing AI primitives with ordinary Playwright calls when you want precise control. Stagehand sits on top of Playwright, so you keep full access to the underlying browser when natural language is not the right tool for a given step. That blend, AI where it helps and raw Playwright where you need determinism, is one of the things Stagehand does well.

Because it is an SDK, Stagehand is the right tool when you are building software. If you are writing a custom automation app, an internal data pipeline, or a product feature that drives a browser, you want to call these primitives yourself and own the control flow. That is exactly what Stagehand is for, and it is good at it.

Stagehand also moves fast. It is actively developed and ships new capabilities at a steady clip. We will come back to what that means for BrowserBash in the honest-limits section, because it matters.

## Layer two: what BrowserBash actually is

BrowserBash is a batteries-included CLI and test runner. It does not reinvent the AI automation primitives. It wraps an engine and adds everything around that engine you need to actually run browser tests in a real workflow without writing TypeScript.

By default, that engine is Stagehand. BrowserBash currently pins Stagehand v3.5.0. BrowserBash also ships an alternative builtin engine, an Anthropic tool-use loop that drives the browser and captures native Playwright traces, which you can choose when you want trace artifacts or a different execution style. If you want a deeper look at how the two engines differ and when to pick each, there is a dedicated walkthrough in [Stagehand vs the builtin engine](https://browserbash.com/blog/browserbash-stagehand-vs-builtin-engine-tutorial).

On top of whichever engine you choose, BrowserBash adds the parts that turn "an automation primitive" into "a test you can ship":

### Plain-English runs, no code

You can run a one-off objective straight from the shell:

```bash
browserbash run "go to the pricing page and confirm the Pro plan shows a yearly price"
```

No TypeScript file, no imports, no build step. You describe the goal, the agent drives the browser, and you get a verdict back. For more on why this goal-first style behaves differently from scripted automation, see [agentic testing explained](https://browserbash.com/blog/agentic-testing-explained).

### Committable test files

Beyond one-off runs, BrowserBash uses `*_test.md` files you keep in your repo and review like any other code. They support `@import` so you can compose shared steps (a login flow, a setup block) across many tests, and `{{variables}}` for parameterizing runs. Secrets are masked, so a value you pass in as a credential does not leak into logs or output.

```markdown
@import ./flows/login_test.md

# Checkout smoke test
- Add the {{product}} to the cart
- Complete checkout with the saved card
- Confirm the page says "Thank you"
```

A file like that diffs cleanly in a pull request, which a chat transcript never does.

### CI-ready output and exit codes

For automation, BrowserBash emits `--agent` NDJSON output, one structured JSON object per line, so another program can consume the run step by step. It returns meaningful exit codes for pipelines:

- `0` pass
- `1` fail
- `2` error
- `3` timeout

That is what lets a build gate on a result. If you want a concrete pipeline, the [GitHub Actions tutorial](https://browserbash.com/blog/browserbash-github-actions-tutorial) wires this into a workflow end to end.

### Evidence on every run

With `--record`, BrowserBash captures a webm video and screenshots of the run. On the builtin engine you also get native Playwright traces. When a test fails at 3am, you have the artifact to see what happened instead of guessing.

### Multiple execution providers

The same test can run in different places by switching one flag:

```bash
browserbash run "..." --provider local
browserbash run "..." --provider cdp
browserbash run "..." --provider browserbase
browserbash run "..." --provider lambdatest
browserbash run "..." --provider browserstack
```

Local for development, CDP to attach to a running Chrome, or a cloud grid (Browserbase, LambdaTest, BrowserStack) for scale and cross-browser coverage.

### Local-first model defaults

BrowserBash defaults to Ollama, running a local model. That means free, no API key required, and nothing leaves your machine. If you set an API key, it auto-resolves to Anthropic or OpenRouter instead. You opt in to a hosted model rather than being forced into one to get started.

### Dashboards

BrowserBash ships a local dashboard for browsing your runs, and an optional, opt-in cloud dashboard if you want shared history across a team. The cloud piece is opt-in, not on by default.

None of this replaces Stagehand. All of it sits on top of Stagehand (or the builtin engine) to make the engine usable as a test tool from the terminal.

## The comparison table

| | Stagehand | BrowserBash |
|---|---|---|
| Layer | Library / SDK (the engine) | CLI and test runner (built on the engine) |
| Built by | Browserbase | The Testing Academy |
| License | MIT | Apache-2.0 |
| Language to use it | TypeScript / Node | None required; plain English and Markdown |
| How you use it | `import` it, write code, call `act` / `observe` / `extract` / `agent` | `browserbash run "..."` or run a `*_test.md` file |
| Primary job | Programmatic AI browser automation primitives | Running browser tests in a workflow or CI |
| Relationship | The default engine inside BrowserBash | Wraps Stagehand (pinned v3.5.0) plus a builtin engine |
| Test files | You design your own structure in code | `*_test.md` with `@import` and `{{variables}}` |
| CI integration | You build it yourself | NDJSON output, exit codes 0/1/2/3 |
| Run evidence | Whatever you wire up via Playwright | `--record` video and screenshots; Playwright traces on builtin |
| Providers | You configure the browser yourself | `--provider local\|cdp\|browserbase\|lambdatest\|browserstack` |
| Model | You choose and configure | Ollama-first local default; auto-resolves to Anthropic or OpenRouter |

Read that table as "different altitudes," not "winner and loser." Stagehand gives you primitives and the freedom to assemble them. BrowserBash gives you an opinionated way to run them as tests with no assembly required.

## When to use Stagehand directly

Reach for Stagehand when you are building software in TypeScript and you want to call the primitives yourself. Specifically:

- You are writing a custom automation application, not just running tests.
- You need to interleave AI steps with bespoke in-process logic: conditional branching, loops, calls to your own services, custom data handling between steps.
- You want to embed browser automation as a feature inside a larger Node or TypeScript codebase.
- You want the newest Stagehand capabilities the moment they ship, ahead of any pinned version.

In all of those cases, the SDK is the better fit, and putting a CLI in front of it would only get in your way. Stagehand is designed for programmatic control, and that is precisely what you want here.

## When to use BrowserBash

Reach for BrowserBash when you want to write and run browser tests from the terminal or CI today, without writing code. Specifically:

- You want plain-English tests you can author and run in minutes, no TypeScript project to set up.
- You want committable `*_test.md` files that live in your repo and get reviewed in pull requests.
- You need CI exit codes and machine-readable output to gate a build.
- You want video, screenshots, and traces on failures without wiring up the capture yourself.
- You want to run the same test locally for free on a local model, then against a cloud grid for scale, by changing one flag.

If your goal is "get reliable browser tests running in my pipeline this afternoon," BrowserBash is the shorter path, because the test-runner scaffolding is already built. For more on how it copes with the moving targets that break scripted tests, see [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis).

## Honest limits

Two things deserve a straight answer, because pretending otherwise would not help you decide.

First, BrowserBash pins a Stagehand version, currently v3.5.0. Stagehand moves fast and ships improvements regularly. A pinned dependency means BrowserBash can lag the very latest Stagehand release until BrowserBash updates the pin. If you specifically need a brand-new Stagehand feature the day it lands, using Stagehand directly is the way to get it, and that is a real and legitimate reason to skip the CLI. Pinning is a deliberate stability tradeoff: it keeps BrowserBash runs reproducible, at the cost of being a step behind the bleeding edge.

Second, if you need to script complex custom logic in-process, weaving AI steps together with your own code and control flow, the SDK is the better fit. BrowserBash is built around running tests, not around being a general programming surface. The moment your needs look more like "a program that happens to drive a browser" than "a test I want to run and gate on," Stagehand is the right layer to work at.

Neither of these is a knock on Stagehand. Both follow directly from the fact that BrowserBash is a CLI on top of Stagehand, not a replacement for it.

## So which is it, BrowserBash or Stagehand?

It is rarely either-or, because they are not the same thing. If you are building automation software in TypeScript, use Stagehand and call its primitives. If you want to run browser tests from your terminal or CI without writing code, use BrowserBash, which runs Stagehand for you and adds the test-runner scaffolding around it. Plenty of teams could reasonably use Stagehand in a product feature and BrowserBash for their test suite at the same time, with no conflict, because one is the engine and the other is the test tool built on it.

Install BrowserBash:

```bash
npm install -g browserbash-cli
```

You can read more about what it includes on the [features page](https://browserbash.com/features), and work through guided examples on the [learn page](https://browserbash.com/learn).

## FAQ

### Is BrowserBash a fork of Stagehand?

No. BrowserBash does not fork Stagehand. It depends on Stagehand as its default engine, at a pinned version (currently v3.5.0), and wraps it with a CLI, a test-file format, CI output, recording, multiple providers, and dashboards. Stagehand remains its own MIT-licensed project by Browserbase, used as a dependency.

### Can I use BrowserBash without Stagehand?

Yes. Stagehand is the default engine, but BrowserBash also ships an alternative builtin engine, an Anthropic tool-use loop that drives the browser and captures native Playwright traces. You can select that engine instead when you want trace artifacts or a different execution style.

### Do I need to know TypeScript to use BrowserBash?

No. That is much of the point. With BrowserBash you write objectives in plain English, either inline with `browserbash run "..."` or in `*_test.md` files. You write TypeScript only if you choose to use Stagehand directly as an SDK, which is a separate path.

### Why would I use Stagehand directly instead of BrowserBash?

Two main reasons. First, if you are building a custom automation app and want to call the AI primitives programmatically with your own in-process logic, the SDK is the right layer. Second, because BrowserBash pins a Stagehand version, the SDK gives you access to the newest Stagehand features the moment they ship, ahead of the pin. For running committable tests in CI without code, BrowserBash is the faster path; for programmatic control and bleeding-edge features, Stagehand is.
