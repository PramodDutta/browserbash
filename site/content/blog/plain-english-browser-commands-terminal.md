---
title: Run Browser Commands in Plain English From Your Terminal
description: "Plain english browser automation terminal: type an objective like 'log in and add to cart' and get a recorded, verifiable run — no selectors, no scripts."
date: 2026-05-12
category: use-case
---

You do not need to be a QA engineer to drive a browser from a script anymore. With plain english browser automation terminal tools, you open a shell, type an objective like "log in and add the first product to the cart," press enter, and an AI agent drives a real Chrome window through the whole flow. It clicks, types, waits, and at the end hands you a verdict plus the values it pulled off the page. No CSS selectors. No `page.locator()`. No page-object files to maintain. If you are a backend engineer, a founder, or a frontend dev who has avoided test automation because the tooling felt like a second job, this is the unlock.

This article walks through how that actually works in the terminal, what the run gives back, where it holds up, and — honestly — where it does not. The tool I will use for every example is [BrowserBash](https://browserbash.com), a free, open-source CLI. Every command shown is real and runs today.

## What "plain English browser commands" actually means

The old contract for browser automation was simple and brutal: you tell the machine *exactly* where to click. `#login-email`, `button[type=submit]`, `.cart-badge span:nth-child(2)`. The machine does precisely that and nothing more. When the markup shifts — a designer renames a class, a framework upgrade re-nests a div — your script breaks, even though a human looking at the same page would have no trouble finishing the task.

Plain-English automation flips the contract. Instead of *where to click*, you describe *what you want to happen*. "Search for a wireless mouse, open the first result, and add it to the cart." An AI agent reads the live page, decides which element matches your intent, acts, then re-reads the page to see what changed. It loops like that — observe, decide, act, observe — until your objective is met or it gives up.

The practical difference for a non-QA developer is that you write the thing you already know how to say. You know what "log in" means on your own app. You do not need to know that the login button is the third `<button>` inside a `<form>` with an auto-generated Tailwind class. The agent figures that part out at runtime.

That is the whole pitch of [BrowserBash](https://browserbash.com/features): you write an objective, an agent drives a real browser, and you get a structured result back. There is no DSL to learn beyond English.

## A first run: log in and add to cart

Here is the canonical example for someone who has never touched a test framework. Install the CLI globally, then describe a flow.

```bash
npm install -g browserbash-cli
browserbash run "Go to the demo store, log in with user demo@example.com and password Test1234, search for a backpack, open the first result, and add it to the cart. Confirm the cart count shows 1."
```

A few things happen when you press enter. BrowserBash launches a real Chrome browser on your machine (the local provider is the default — it uses the Chrome you already have installed). An AI agent reads the first page, navigates, fills the login form, runs the search, clicks into the product, and clicks add-to-cart. It is not replaying a recording. It is making decisions step by step against whatever the page actually shows.

When it finishes, you get a verdict — passed or failed — and any values it was asked to confirm, like the cart count. If something went sideways (the password was wrong, the product was out of stock), the agent reports the failure in plain language instead of dumping a stack trace about a missing selector.

You need Node 18 or newer and Chrome installed for that local run. That is the entire setup. No account, no API key required to *run* — more on the model in a moment.

## What you get back: a verdict, extracted values, and a record

A run that just clicks around is a demo. A run you can trust in a pipeline or paste into a bug report needs to be *verifiable*. This is where the terminal output earns its keep.

Every BrowserBash run produces three things worth caring about:

1. **A verdict.** Passed, failed, error, or timeout. This is the headline — did the objective get met or not.
2. **Structured extracted values.** If you asked the agent to confirm the cart count or read back an order number, those come out as structured data, not a screenshot you have to eyeball.
3. **A record on disk.** Every run is saved locally at `~/.browserbash/runs`, with secrets masked and the store capped at the last 200 runs. You can go back and see what happened.

To make a run genuinely reviewable — the kind of thing you attach to a ticket or hand to a teammate — add `--record`:

```bash
browserbash run "Log in and add the first product to the cart, then verify the cart total is greater than zero." --record
```

The `--record` flag captures a screenshot plus a full `.webm` session video using a bundled copy of ffmpeg, so you do not have to install anything extra. If you are on the builtin engine (more on engines below), it also writes a Playwright trace you can open in the trace viewer. Now the run is not just "trust me, it worked" — it is a video of the browser doing the thing, sitting in a folder, ready to review.

That recorded-and-verifiable property is the part that turns a fun terminal trick into something a team can actually rely on. A flaky one-off is a party trick. A flow that returns a clear verdict and a video is evidence.

## How the agent reads a page without selectors

It is worth understanding, at least roughly, what is doing the thinking, because it explains both the magic and the limits.

BrowserBash separates two concerns: the *engine* that interprets your English, and the *provider* where the browser actually runs.

The default engine is **Stagehand**, the open-source (MIT) library from Browserbase. It exposes a small set of primitives the agent uses under the hood — act, extract, observe, and a higher-level agent loop — and it is built to self-heal when a page shifts slightly. When the layout moves a button or renames a class, the agent re-observes the page and adapts instead of throwing. That self-healing behavior is the technical reason cosmetic UI changes do not snap your flow the way they snap a hard-coded selector.

The alternative engine is **builtin**: an in-repo tool-use loop that drives Playwright directly. It is the engine BrowserBash uses automatically when you run against LambdaTest or BrowserStack grids. You can pick either explicitly:

```bash
browserbash run "Open the pricing page and tell me the price of the team plan." --engine builtin
```

The provider, set with `--provider`, decides *where* the Chrome lives. The default is `local` — your own machine, your own Chrome. You can also point at any DevTools endpoint with `cdp` and `--cdp-endpoint ws://...`, or run on cloud grids like `browserbase`, `lambdatest`, or `browserstack` when you need browsers you do not have locally. For a developer just trying to check a flow on their own app, `local` is all you need and it is the default, so you never have to think about it.

## The model question: free local, or hosted for hard flows

Here is where BrowserBash makes a deliberate choice that matters for both cost and privacy, and where I want to be straight with you about the trade-offs.

The default model setting is `auto`, and it resolves in this order:

1. **Local Ollama first.** If you have [Ollama](https://ollama.com) running, BrowserBash uses your local model — `ollama/<model>`. It is free, needs no API keys, and *nothing leaves your machine*. Your login credentials, your internal staging URLs, the page content — none of it gets sent to a third party. For anyone testing an unreleased product or a regulated app, that is a real feature, not a footnote.
2. **Anthropic.** If `ANTHROPIC_API_KEY` is set, it uses `claude-opus-4-8`.
3. **OpenAI.** If `OPENAI_API_KEY` is set, it uses `openai/gpt-4.1`.
4. Otherwise it errors with guidance on how to pick one.

Ollama-first means the honest default for a curious developer is a guaranteed $0 model bill. You run everything locally, free, private.

Now the caveat, because it would be dishonest to skip it: **very small local models (8B parameters and under) are flaky on long, multi-step objectives.** They lose the thread halfway through a six-step checkout. If your objective is short — "log in and confirm the dashboard loads" — a small local model is often fine. If your objective is a long, branching flow, you want either a mid-size local model (think Qwen3 or a Llama 3.3 70B-class model, if your machine can run it) or a capable hosted model.

You can pin the model explicitly whenever you want predictable behavior:

```bash
# Free and private, mid-size local model
browserbash run "Complete the full checkout: add two items, apply coupon SAVE10, fill shipping, and confirm the order total." --model ollama/qwen3

# Hosted model for a hard, branching flow
browserbash run "Complete the full checkout with a saved card and confirm the order number." --model claude-opus-4-8
```

You can also route through OpenRouter (`openrouter/<vendor>/<model>`, e.g. `openrouter/meta-llama/llama-3.3-70b-instruct`), use `google/gemini-2.5-flash` on Stagehand, or point at an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`. The point is you are not locked into one vendor, and the free local path is real — just match the model size to the difficulty of the flow.

## Where this fits next to writing a Playwright script

If you have written Playwright or Selenium before, the natural question is: when do I reach for plain English, and when do I still write code? Here is an honest split.

| Situation | Plain-English run | Hand-written Playwright |
| --- | --- | --- |
| You don't know the page's selectors | Strong fit — describe intent | You'd have to inspect the DOM first |
| One-off check, "does this flow still work?" | Strong fit — type it, run it | Overkill for a throwaway |
| UI changes cosmetically every sprint | Self-healing handles it | Selectors break, you rewrite |
| Deterministic, pixel-exact assertions | Weaker — agents reason, not pixel-diff | Strong fit — full control |
| Massive suite, thousands of cases, tight CI budget | Per-run model cost / latency adds up | Cheaper and faster at huge scale |
| You need the exact same steps every time, byte-for-byte | An agent may pick a different valid path | Deterministic by construction |

The truthful summary: plain-English automation is fantastic for *exploration, smoke checks, and flows where the UI is in flux*, and for people who do not want to maintain selector code. Hand-written Playwright still wins when you need strict determinism, microsecond-level speed across thousands of cases, or assertions an agent's reasoning is not built for.

These are not mutually exclusive. A common pattern is to use plain-English runs to prove a flow works and catch regressions during active development, then invest in hand-written tests for the handful of critical paths that must be locked down forever. BrowserBash is built to live in that first slot well, and its `--record` output gives you the artifacts to decide what is worth promoting into a permanent suite. The [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections walk through more of these patterns if you want to go deeper.

## The wider landscape: who else does plain-English browsing

You should know what else is out there, because honestly, this is a busy category in 2026 and the right tool depends on what you are doing.

- **Stagehand** (Browserbase) is the engine BrowserBash uses by default. As a standalone TypeScript SDK, it is excellent if you are a developer who wants to weave `act`/`extract`/`observe` calls directly into your own code. If you want to *write a program*, Stagehand-the-SDK is a great fit; BrowserBash wraps it so you can stay in the terminal with English only.
- **Browser Use** is a popular open-source Python framework with strong benchmark numbers and a large community. If your team is Python-first and wants a library to build agents into a bigger application, it is a serious option.
- **Skyvern** is open-source (AGPL-3.0) and leans on computer vision plus LLMs; it supports bringing your own model including Ollama. If you specifically need vision-heavy automation and are comfortable self-hosting, it is worth a look.
- **Kane CLI** from TestMu AI (formerly LambdaTest) launched in 2026 as a terminal-first, plain-English browser tool with native hooks into coding agents. Its specific pricing and model details are best checked on its own docs as of 2026; I will not invent numbers here.

Where BrowserBash earns its place in that list: it is a CLI, not a library, so a non-QA developer never opens an editor; it is Ollama-first, so the honest default is free and private; and it produces a recorded, verifiable run with a clear verdict out of the box. If you would rather embed automation deep into application code, an SDK like Stagehand or Browser Use may suit you better, and that is a fine choice. The [BrowserBash blog](https://browserbash.com/blog) and [case study](https://browserbash.com/case-study) go further into where it shines.

## Making runs repeatable: markdown tests and CI

Typing an objective at the prompt is great for a one-off. But you will eventually want to *commit* a flow so it runs the same way for the whole team, and you will want it in CI. BrowserBash has two features for that, and neither requires you to learn a programming language.

### Committable markdown tests

You can write a test as a markdown file — `something_test.md` — where each list item is a step in plain English. It supports `{{variables}}` for things like usernames and URLs, `@import` so you can compose shared setup (a login flow imported into many tests), and secret-marked variables that get masked as `*****` in every log line so credentials never leak into your logs. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md
```

Because it is just markdown, it lives in your repo next to your code, gets reviewed in pull requests, and reads like documentation. A product manager can open the file and understand exactly what is being checked. That is a meaningfully lower bar than asking everyone to read a Playwright spec.

### Wiring it into a pipeline

For CI and for AI coding agents, there is `--agent` mode, which emits NDJSON — one JSON object per line — instead of prose. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate"}`, and the run ends with a terminal object carrying the status, a summary, and the final extracted state. Exit codes are standard: `0` passed, `1` failed, `2` error, `3` timeout.

```bash
browserbash run "Log in and confirm the dashboard loads without errors." --agent --headless --timeout 90
```

Your CI step checks the exit code; an AI coding agent parses the NDJSON to know exactly what happened without guessing from prose. `--headless` runs without a visible window for servers, and `--timeout` (in seconds) caps how long a run can take. This is how a plain-English objective stops being a desk toy and becomes a gate in your pipeline.

## Seeing your runs: the local dashboard

Some people live in the terminal and never want to leave. Others want to scroll through past runs visually. BrowserBash gives you both.

```bash
browserbash dashboard
```

That starts a fully local dashboard on `localhost:4477`. It reads the same on-disk run store, so you see your history, verdicts, and recordings in a browser UI — and it is entirely local, nothing uploaded. If you want a run to open the dashboard automatically, add `--dashboard` to that run.

There is also an *optional, opt-in* cloud dashboard for sharing. You link it once with `browserbash connect --key bb_...`, then add `--upload` to any run you specifically want to push. The defaults matter here: **without `--upload`, nothing leaves your machine.** Uploading is something you choose per run, not a thing that happens silently. Free cloud runs are kept for 15 days. For most local development you never need it; it exists for when you want to send a teammate a link instead of a file.

## Who this is for, and who should keep scripting

Let me be direct about fit, because the wrong tool wastes everyone's time.

**Reach for plain-English terminal runs if you are:**

- A backend or frontend developer who needs to check a user flow but has never wanted to own a selector suite.
- A founder or solo builder who wants to smoke-test signup, login, and checkout before every deploy without hiring QA.
- A team dealing with a UI that changes constantly, where hard-coded selectors are a maintenance tax you keep paying.
- Anyone who needs the run to stay private — Ollama-first means your app's pages and credentials never leave your laptop.
- Someone wiring browser checks into CI or into an AI coding agent, where the NDJSON contract is cleaner than parsing prose.

**Keep writing hand-coded tests if you are:**

- Running thousands of cases on a tight CI budget where per-run model latency and cost add up.
- Asserting pixel-exact or strictly deterministic outcomes where an agent's reasoning is the wrong tool.
- Maintaining a mature, stable suite where the selectors rarely break and rewriting it buys you nothing.

Most real teams sit in both camps. Use plain English to move fast and catch regressions while a feature is in flux; promote the few truly critical paths into locked-down scripts once they stabilize. The honest answer is "both, for different jobs," and any vendor who tells you their tool replaces all of testing is selling, not helping. You can compare what is free versus optional on the [pricing page](https://browserbash.com/pricing) — the CLI itself is free and open-source under Apache-2.0.

## A realistic first hour

If you want to actually try this, here is a sane path. Install the CLI. Run one short objective against your own app's login — keep it small so a local model handles it cleanly. Add `--record` and open the resulting video to see what the agent did. Then write a single `_test.md` file for your most important flow, run it with `testmd run`, and read the generated `Result.md`. By the end of that hour you will know whether plain-English automation fits the way you work, and you will not have written a single selector.

If the short runs feel solid but a long checkout flow gets shaky, that is your signal to bump up the model — a mid-size local model or a hosted one — rather than abandoning the approach. The flakiness is almost always model capacity on long objectives, not the idea itself.

## FAQ

### Can I really run browser automation from the terminal without writing any code?

Yes. You install the CLI, type an objective in plain English like "log in and add to cart," and an AI agent drives a real Chrome browser to complete it. You never write selectors, page objects, or test scripts. For repeatable flows you can write plain-English steps in a markdown file, which is still not programming — it reads like documentation and lives in your repo.

### Is plain-English browser automation free, and does my data stay private?

The BrowserBash CLI is free and open-source under Apache-2.0, and the default model resolution is Ollama-first, so if you run a local model nothing leaves your machine and your model bill is $0. You only pay if you choose a hosted model like Claude or GPT by setting an API key. There is no account required just to run, and uploads to the optional cloud dashboard are opt-in per run.

### Will the run break when the website's layout changes?

Cosmetic changes — a renamed CSS class, a moved button, a slightly different layout — generally do not break a plain-English run, because the agent re-reads the live page and adapts instead of matching a fixed selector. The default Stagehand engine is built to self-heal in exactly these cases. Large structural redesigns can still trip an agent up, but the everyday churn that snaps hard-coded selectors usually does not.

### How is this different from writing a Playwright or Selenium test?

A Playwright or Selenium test tells the browser exactly where to click and breaks when those locations change; a plain-English run describes the goal and lets an AI agent decide how to reach it. Plain English wins for exploration, smoke checks, and UIs in flux, and for people who do not want to maintain selector code. Hand-written tests still win for strict determinism, pixel-exact assertions, and very large suites where per-run model cost matters — many teams use both.

## Get started

Open a terminal and try one objective against your own app:

```bash
npm install -g browserbash-cli
browserbash run "Log in and add the first product to the cart, then confirm the cart count is 1." --record
```

No account is needed to run it locally. If you later want to share runs or use the cloud dashboard, you can [sign up](https://browserbash.com/sign-up) — but it stays optional. Type what you want in plain English, get a recorded, verifiable result, and skip the selectors entirely.
