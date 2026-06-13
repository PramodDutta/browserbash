---
title: Kane CLI vs BrowserBash: An Honest Comparison for AI Browser Automation
description: "Kane CLI vs BrowserBash compared on openness, cost, models, CI exit codes, and recordings. An honest look at two AI browser automation CLIs."
date: 2026-06-13
category: comparison
---

If you write end-to-end tests or build AI coding agents that need to drive a real browser, two command-line tools keep coming up in 2026: Kane CLI and BrowserBash. Both let you skip selectors and page objects and instead describe what you want in plain English, while an AI agent pilots a real Chrome browser and reports back a verdict. This Kane CLI vs BrowserBash comparison is written for engineers who have to actually pick one — so it stays factual, names the genuine overlaps, and is candid about where each tool is the better fit.

The short version: the two are more alike than most "X vs Y" posts would have you believe. They converge on the same core idea, the same NDJSON contract for automation, and even the same Apache-2.0 license. The real decision comes down to four things — whether you want an account-free local-first tool, how you want to pay for (or avoid paying for) model inference, what artifacts you need out of a run, and which ecosystem you're betting on. Let's get into the detail.

## What each tool actually is

**Kane CLI** is a terminal-native browser automation tool from TestMu AI (formerly LambdaTest), launched in 2026. You write an objective in natural language, Kane launches your locally installed Google Chrome over the DevTools Protocol, drives it step by step with no selectors or code, and returns structured results. It is positioned squarely as a verification layer for AI coding agents — it ships native adapters for Claude Code, Cursor, Codex CLI, and Gemini CLI — and it leans into features like converting plain-English flows into native Playwright code and pausing for a human when it hits an OTP or CAPTCHA. The CLI is open source under Apache-2.0, installs with `npm install -g @testmuai/kane-cli`, and requires you to authenticate with `kane-cli login` using credentials from a TestMu AI account.

**BrowserBash** is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy. The model is the same on the surface: you write a plain-English objective, an AI agent drives a real Chrome or Chromium browser, and you get back a verdict plus structured results — no selectors, no page objects. Where it diverges is the stack underneath. BrowserBash is Ollama-first, which means it defaults to free local models with no API keys and nothing leaving your machine. It installs with `npm install -g browserbash-cli` and runs immediately with no account and no login step. You can read the full feature tour on the [BrowserBash learn page](https://browserbash.com/learn).

So both tools answer the same question — "how do I test a web app without maintaining brittle selectors?" — the same way at the surface. The interesting differences are one layer down.

## The honest overlap (and why it matters)

It is worth being explicit about how much these two share, because it changes how you should reason about the choice. A surprising amount carries over from one tool to the other:

- **Plain-English, selector-free control.** Both operate on intent. You describe the goal; the agent figures out how to click, type, and navigate by reading the page the way a person would.
- **Real local Chrome by default.** Neither is a headless-only sandbox by default. Both drive a real Chrome/Chromium instance on your machine, and both can attach to an existing browser over a DevTools (CDP) endpoint.
- **The same NDJSON automation contract.** Run either in agent mode and you get newline-delimited JSON — one JSON event per line, with a stable terminal event — designed to be consumed by CI and by other programs, not parsed out of prose.
- **Identical exit-code semantics.** Both use `0` passed, `1` failed, `2` error, `3` timeout. If you have written a CI gate for one, the branching logic transfers directly to the other.
- **Committable Markdown tests.** Both support `*_test.md` files where each list item is a step, both support `@import` to compose shared steps, and both write a human-readable `Result.md` after a run.
- **Apache-2.0 licensing on the CLI.** Both projects publish the CLI under the same permissive license.

That overlap is real, and pretending otherwise would not help you choose. The decision is rarely about whether you *can* do something — it is about defaults, dependencies, and what comes out the other end.

## Openness and the account question

Both CLIs are open source under Apache-2.0, so on the strict license axis they tie. But "open source" and "runs without an account" are different properties, and this is the first place the tools genuinely part ways.

BrowserBash runs with zero accounts. Install it from [npm](https://www.npmjs.com/package/browserbash-cli), point it at an objective, and it works. There is no login, no key to paste, no dashboard you must provision before the first run. A cloud dashboard exists and is free to create, but it is strictly opt-in: you only touch it if you run `browserbash connect` and pass `--upload` on a run. Nothing leaves your machine otherwise. There is also a fully local, private dashboard (`browserbash dashboard`) if you want run history and replay without any cloud at all.

Kane CLI, by contrast, requires authentication before first use. The documented flow is `kane-cli login`, with credentials (an access key) obtained from the TestMu AI dashboard under Settings → Keys; CI uses a non-interactive `kane-cli login --username <u> --access-key <k>`. The CLI source is open, but using it is coupled to a TestMu AI account. That is a reasonable design for a product that wants to tie runs back to a managed Test Manager — but it is a real difference if your goal is to clone a repo and run a smoke test in sixty seconds with nothing else set up, or if account provisioning is a friction point in your environment.

If account-free, local-first operation is a hard requirement — for an air-gapped CI runner, a privacy-sensitive client, or just minimizing setup — BrowserBash has the edge here. If you are already a TestMu AI / LambdaTest customer and want runs to land in that dashboard automatically, Kane's login-first model is working as intended rather than getting in your way.

## Models and cost: the biggest practical divide

This is where the two tools differ the most in day-to-day economics, and it deserves the most space.

BrowserBash is **Ollama-first**. Out of the box it prefers a free, local model running on your own hardware — no API keys, no per-token cost, no data egress. It auto-detects what you have available, checking for Ollama first, then Anthropic, then OpenRouter. Beyond local models, it supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic's Claude directly if you bring your own key. The practical upshot is that you can run a full suite at zero marginal model cost, and switch "brains" per run with a single flag when a flow needs a more capable model. You hold the cost lever directly, and the default position of that lever is free.

Kane CLI's documentation does not publish which LLM powers it, and that is the honest state of what is publicly stated — so I will not guess. What the public materials do indicate is that the product has paid components: coverage of the launch references bonus credits for teams activating a paid plan, and cloud capabilities offered through TestMu AI's plans, even though local CLI runs are described as free to use. In other words, the model layer is part of the managed TestMu AI offering rather than a "bring your own Ollama" arrangement you control end to end.

Two consequences follow. On **predictability of cost**, BrowserBash lets you guarantee a $0 model bill by staying on local models — useful for high-volume suites or budget-constrained teams. On **data residency**, its local-model default means prompts and page content can stay entirely on your machine, which matters for regulated or sensitive applications. If neither is a constraint for you and you would rather not run a local model, a managed model layer is a legitimately nicer experience — no GPUs, model pulls, or worrying about which local model is reliable on multi-step flows.

A small but real caveat on the BrowserBash side, in the interest of honesty: very small local models (roughly 8B parameters and under) can be flaky on long multi-step objectives. The free path is real, but the sweet spot is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model when a flow is genuinely hard. The lever is yours, but you do have to pull it thoughtfully.

## CI integration

Here the tools are close to interchangeable, which is good news if you are standardizing a pipeline.

Both emit NDJSON in agent mode and both use the same four exit codes, so a CI gate written against one is nearly a drop-in for the other. A BrowserBash CI invocation looks like this:

```bash
# Headless, machine-readable, fails the job on a failed verdict
browserbash run "Open https://example.com, sign in as {{user}} with password {{pass}}, and verify the dashboard shows 'Welcome back'" \
  --agent \
  --headless \
  --variables '{"user":"qa@example.com","pass":{"value":"hunter2","secret":true}}'
echo "exit: $?"   # 0 passed, 1 failed, 2 error, 3 timeout
```

The `--agent` flag switches output to one JSON event per line with a stable schema, `--headless` runs Chrome with no window for the runner, and the secret-marked variable is masked as `*****` in every log line. The exit code is the contract — your pipeline branches on it, no prose parsing required. You can wire the same NDJSON stream into an AI coding agent that needs a reliable "did it actually work in a browser" signal. There is more on this pattern on the [BrowserBash blog](https://browserbash.com/blog).

Kane CLI covers the same ground: `--headless` for CI, `--agent` for NDJSON (its docs note agent mode is required for any scripted use), `--max-steps` and `--timeout` to bound a run, and the identical 0/1/2/3 exit codes, with documented runs in GitHub Actions, GitLab CI, Jenkins, and Bitbucket Pipelines. Kane also offers a distinctive Playwright export — converting a plain-English flow into native Playwright code with two-way migration — genuinely useful if your end state is a maintained Playwright suite rather than a standing natural-language test. BrowserBash does not position itself as a Playwright code generator; it keeps the natural-language test (or the Markdown file) as the durable artifact.

For the Markdown-test path, the commands are nearly mirror images. BrowserBash:

```bash
# Run a committable Markdown test; writes a Result.md next to the file
browserbash testmd run ./checkout_test.md --headless
```

Kane uses `kane-cli testmd run <path>` with the same `*_test.md` convention, `@import` composition, and a `Result.md` output — and it caches steps so subsequent runs replay from cache with no model cost. BrowserBash's testmd flow is the same shape; the difference in the model story (local-first and free vs. managed) is the part that actually distinguishes them, not the testmd ergonomics.

## Recordings and run artifacts

This is the second axis where BrowserBash has a clear, concrete edge, and it matters a lot for debugging flaky runs and for sharing evidence with non-engineers.

BrowserBash captures rich artifacts on demand. Pass `--record` and it captures a screenshot **and** a full session video (a `.webm`, stitched together with ffmpeg) on any engine. On its built-in engine it additionally captures a Playwright trace you can open in the Playwright trace viewer for step-by-step, network-and-DOM-level debugging. Those artifacts can stay entirely local, or you can push a run to the cloud dashboard with `--upload` for run history and per-run replay:

```bash
# Capture a screenshot + session video, and push the run to the dashboard
browserbash run "Add the first product to the cart and verify the cart count is 1" \
  --record \
  --upload
```

Kane CLI's public documentation emphasizes step caching and replay-from-cache for its Markdown tests (re-running a cached flow quickly and cheaply), and uploading results to the TestMu AI Test Manager for session history. What it does not document publicly is an on-any-engine video capture or a downloadable Playwright trace in the way BrowserBash does. If a recorded `.webm` of the session or a local Playwright trace is part of your debugging or reporting workflow, that is a specific BrowserBash strength today. If your idea of "artifact" is a managed run history in a hosted Test Manager, Kane's integration is the more natural fit — especially if you are already living in that dashboard.

## Cross-browser and cloud grids

Both tools can reach beyond your local Chrome, but the framing differs.

BrowserBash treats *where the browser runs* as a provider you switch with one flag. The default is `local` (your Chrome). From there you can target `cdp` (any DevTools endpoint), or cloud device clouds including `browserbase`, `lambdatest`, `browserstack` — one flag, `--provider lambdatest`, moves the same plain-English run onto that grid. It is also engine-flexible: a `stagehand` engine (the default, MIT-licensed, from Browserbase) and a `builtin` engine (an in-repo Anthropic tool-use loop) you can choose between.

```bash
# Same objective, run on a cloud grid instead of local Chrome
browserbash run "Open the pricing page and verify the FAQ section loads" \
  --provider lambdatest \
  --headless
```

Kane CLI runs against local Chrome by default and can attach to a remote Chrome via `--cdp-endpoint` or a Playwright WebSocket endpoint via `--ws-endpoint`. Broader distributed cloud-grid execution is part of the TestMu AI platform rather than a single CLI provider flag. The notable nuance: because BrowserBash lists LambdaTest as one of its providers, you can point BrowserBash itself at the LambdaTest grid — so this is not strictly either/or at the infrastructure layer.

## Side-by-side comparison

This table sticks to publicly stated, well-known facts. Where Kane's public docs do not specify something, it is marked as such rather than guessed.

| Dimension | BrowserBash | Kane CLI |
| --- | --- | --- |
| Maker | The Testing Academy | TestMu AI (formerly LambdaTest) |
| License (CLI) | Apache-2.0, open source | Apache-2.0, open source |
| Install | `npm install -g browserbash-cli` | `npm install -g @testmuai/kane-cli` |
| Account / login required | No — runs immediately | Yes — `kane-cli login` with TestMu AI credentials |
| Interaction model | Plain English, no selectors | Plain English, no selectors |
| Default model story | Ollama-first, free local models, no API keys; OpenRouter (incl. free models) and Claude (BYO key) | Not publicly specified; managed via TestMu AI; paid plans referenced |
| Guaranteed $0 model cost path | Yes, via local Ollama | Not documented |
| Browser by default | Local Chrome/Chromium | Local Chrome (DevTools Protocol) |
| Remote/attach | CDP endpoint | `--cdp-endpoint`, `--ws-endpoint` |
| Cloud grids | One flag: local, cdp, browserbase, lambdatest, browserstack | Platform feature (TestMu AI) |
| Engines | stagehand (default, MIT) + builtin | Single engine |
| Agent output | NDJSON, stable schema | NDJSON, stable schema |
| Exit codes | 0 / 1 / 2 / 3 | 0 / 1 / 2 / 3 |
| Markdown tests | `*_test.md`, `@import`, `Result.md` | `*_test.md`, `@import`, `Result.md` (cached replay) |
| Playwright code export | No (NL/Markdown is the artifact) | Yes (two-way migration) |
| Session video / trace | `--record`: screenshot + `.webm` video; builtin adds Playwright trace | Cache-replay; not documented as video/trace export |
| Dashboard | Free cloud (opt-in `--upload`) + free local dashboard | TestMu AI Test Manager |
| Privacy default | Nothing leaves your machine unless `--upload` | Account-coupled; results upload to Test Manager |
| AI-agent adapters | NDJSON contract for any agent | Native adapters: Claude Code, Cursor, Codex CLI, Gemini CLI |
| Human-in-the-loop | — | Pauses for OTP/CAPTCHA, then continues |

## When to choose which

Neither tool is strictly better; they optimize for different priorities. Here is the honest decision guide.

**Choose BrowserBash when:**

- You want to run with **no account and no API keys** — clone, install, and test in a minute.
- **Cost predictability matters** and you want a guaranteed free model path via local Ollama, or the option of free hosted models on OpenRouter.
- **Data residency or privacy** is a constraint and you want prompts and page content to stay on your machine by default.
- You need **session videos or a Playwright trace** as first-class run artifacts for debugging and for sharing with non-engineers.
- You want to **switch where the browser runs with one flag** across local, CDP, and cloud grids including Browserbase, LambdaTest, and BrowserStack — and to choose between two engines.
- You want a **free, private local dashboard** for run history without any cloud dependency.

**Choose Kane CLI when:**

- You are **already on TestMu AI / LambdaTest** and want runs to flow into that Test Manager and broader platform automatically.
- You want **native, first-party adapters** for Claude Code, Cursor, Codex CLI, and Gemini CLI rather than wiring an NDJSON stream yourself.
- Your end goal is a **maintained Playwright suite** and you value the plain-English-to-Playwright code export with two-way migration.
- You want built-in **human-in-the-loop handling** of OTP and CAPTCHA steps without scripting it.
- You prefer a **managed model layer** and would rather not run or tune a local model.

A useful way to frame it: BrowserBash optimizes for *open, local-first, low-cost, artifact-rich* automation that any agent can consume through a stable contract. Kane CLI optimizes for *a polished managed experience* integrated with the TestMu AI platform and first-party IDE adapters. Because they share the NDJSON contract and exit codes, trialing both is low-effort — put each behind the same CI gate and compare the verdicts and artifacts directly.

## A note for AI coding agents

If your real consumer is an AI coding agent — Claude Code, Cursor, or your own harness — the relevant question is "how cleanly can the agent get a trustworthy browser verdict?" Both answer with NDJSON and identical exit codes, so either integrates without prose parsing. Kane ships first-party adapters for several popular agents, a real convenience. BrowserBash's bet is that a stable, documented NDJSON stream plus exit codes is the universal interface any agent can target today, with the added properties of free local models and optional recordings for when a run needs human review.

## FAQ

### Is BrowserBash a drop-in replacement for Kane CLI?

In many respects they are interchangeable at the interface level: both are plain-English, selector-free CLIs that drive real Chrome, both emit NDJSON with identical 0/1/2/3 exit codes, and both support `*_test.md` files with `@import`. So a CI gate or agent integration built for one usually transfers with minimal change. The real differences are defaults and dependencies — BrowserBash needs no account and is Ollama-first and free, while Kane is account-coupled with a managed model layer and first-party IDE adapters.

### Which one is actually free?

BrowserBash is free and open source end to end, and it can run at zero marginal model cost on local Ollama with no API keys. Kane CLI's local runs are described as free to use and its CLI is open source under Apache-2.0, but its public materials reference paid plans and cloud capabilities through TestMu AI. If a guaranteed $0 model bill and no account are your priorities, BrowserBash is the clearer fit.

### Can either tool run on a cloud device grid like LambdaTest?

Yes, and notably BrowserBash treats this as a one-flag switch: `--provider lambdatest` (or browserbase, browserstack) moves the same plain-English run onto that grid, while local stays the default. Kane CLI runs against local Chrome by default and can attach to a remote browser via `--cdp-endpoint` or `--ws-endpoint`, with broader distributed execution provided through the TestMu AI platform. Because BrowserBash lists LambdaTest as a provider, the two are not strictly either/or at the infrastructure layer.

### Do I get a video recording of the run?

With BrowserBash, yes — pass `--record` and it captures a screenshot plus a full `.webm` session video on any engine, and the built-in engine additionally produces a Playwright trace you can open in the trace viewer. Kane CLI's public documentation emphasizes cached replay of Markdown tests and uploading results to its Test Manager rather than an on-any-engine video or downloadable trace. If a shareable session recording or local trace is part of your workflow, that is a current BrowserBash strength.

---

If you want to try the open, local-first approach, [create a free account](https://browserbash.com/sign-up) — though you do not even need one to start. BrowserBash is free and open source: `npm install -g browserbash-cli`, write a sentence, and let an AI agent drive a real browser and hand you a verdict. Keep your runs entirely local, or opt in with `--upload` whenever you want cloud history and replay.
