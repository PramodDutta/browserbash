---
title: Browser Automation for Gemini CLI Using BrowserBash
description: "Wire gemini cli browser automation with BrowserBash: let Gemini CLI browse, fill forms, and extract data from a real Chrome via shell and NDJSON."
date: 2026-01-23
category: agents
---

Gemini CLI is great at reasoning over your repo and running shell commands, but it cannot see a web page. Ask it to confirm that your checkout flow still works after a deploy, and it will read your code, guess, and tell you it is fine. That is the gap gemini cli browser automation has to close: the agent needs a tool that opens a real browser, performs the steps a human would, and hands back a verdict it can trust. BrowserBash is built to be exactly that tool — a free, open-source CLI that turns a plain-English objective into actions in a real Chrome and returns a structured result Gemini CLI can read.

This guide shows the practical wiring. You will see how Gemini CLI's `run_shell_command` tool calls BrowserBash to browse pages, fill forms, and extract data; how the `--agent` NDJSON mode gives the model a clean machine-readable result instead of prose it has to parse; and where the honest limits are. No invented features, no benchmarks — just the integration as it actually works in early 2026.

## Why Gemini CLI needs a browser tool at all

Gemini CLI, Google's open-source terminal agent, runs a reason-and-act loop over a set of built-in tools: file operations, web fetch, Google Search grounding, and shell command execution through its `run_shell_command` tool. It is genuinely good at the things a terminal agent should be good at. The one thing it cannot do natively is drive a live browser through a stateful, JavaScript-heavy flow — log in, click through three screens, wait for an async render, and report what actually happened.

`web_fetch` gets you the static HTML of a single URL. That is not the same as automation. A modern app renders client-side, gates content behind a session, and changes the DOM after every interaction. To verify a real user journey you need something that controls an actual browser, and the cleanest way to give a CLI agent that capability is another CLI it can shell out to.

That is the design BrowserBash leans into. It is a command, not a library you have to embed. Gemini CLI already knows how to run commands. So instead of writing a custom MCP server or a Playwright harness, you let the agent call `browserbash run "..."` and read the result. The agent stays in charge of the plan; BrowserBash owns the browser.

### The two ways to connect them

There are two clean integration paths, and you will probably use both:

1. **Shell out directly.** Gemini CLI's `run_shell_command` tool runs `browserbash run "<objective>"` and reads stdout. Zero extra setup beyond installing BrowserBash. Good for ad-hoc "go check this for me" requests inside an interactive session.
2. **Agent mode (NDJSON).** Run BrowserBash with `--agent` so every step is a JSON line and the final result is a single JSON object, with the exit code as the verdict. This is the path you want when Gemini CLI is orchestrating a multi-step task and needs a stable contract instead of human prose.

Both run the same engine and the same real browser. The difference is purely in how the output is shaped for the caller. We will use both below.

## Installing BrowserBash so Gemini CLI can call it

BrowserBash is a single npm install. It needs Node 18 or newer and a local Chrome for the default provider.

```bash
npm install -g browserbash-cli
browserbash run "go to example.com and confirm the page has a heading that says Example Domain"
```

That second line is the smoke test. If it opens Chrome, drives to the page, and prints a passed verdict, you are ready to wire it into Gemini CLI. There is no account, no API key, and nothing to sign up for to run locally. The full surface is on the [BrowserBash features page](https://browserbash.com/features), and the package itself lives on [npm](https://www.npmjs.com/package/browserbash-cli).

The model story matters here, because Gemini CLI users are a cost-sensitive crowd and often already run local models. BrowserBash defaults to `auto`, which resolves in this order: a local Ollama install first (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` if present, then `OPENAI_API_KEY`, otherwise it errors with guidance. So you can keep BrowserBash entirely local on Ollama while Gemini CLI talks to Google's models — two separate model budgets, and the browser half can be a flat $0.

One honest caveat before you wire anything: very small local models (8B and under) get flaky on long multi-step objectives. They will nail "open this page and read the price" and then lose the thread on a six-step checkout. The sweet spot for hard flows is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model. Keep your objectives tight and you can run smaller; throw a 12-step journey at an 8B model and you will see it wander.

## Browsing and reading a page from inside Gemini CLI

Start with the simplest useful thing: have Gemini CLI open a page and tell you what is on it. In an interactive session you can prompt the agent in plain English, and it will choose to run a shell command. The command it should run looks like this:

```bash
browserbash run "open https://news.ycombinator.com and extract the titles and points of the top 5 stories"
```

BrowserBash drives a real Chrome to the page, reads the rendered DOM (not a static fetch), and returns a verdict plus the extracted values as structured data. Because you wrote a plain-English objective, there are no selectors, no page objects, and nothing to maintain when the site's markup shifts next week. The engine figures out how to find the elements.

To make this reliable as a Gemini CLI habit, add an instruction to your project's context so the agent reaches for BrowserBash when a task needs a live browser. Something as plain as: *"When a task requires checking a real web page, run `browserbash run` with a clear objective and read the result."* Gemini CLI's tool-use loop will pick it up and call the command when the situation calls for it. If you prefer a packaged setup, you can wire BrowserBash through Gemini CLI's extension/MCP configuration in `~/.gemini/settings.json`, but for a CLI-to-CLI handoff the shell path is the least moving parts.

For deeper data-extraction patterns — pagination, structured output shaping, multi-record scrapes — the [BrowserBash tutorials](https://browserbash.com/tutorials) walk through real objectives end to end.

## Filling forms: the part static fetch can never do

This is where a real browser earns its keep. Forms are stateful, validated client-side, and often multi-step. `web_fetch` cannot type into them. BrowserBash can.

Tell the agent what outcome you want, in the same plain English you would use to brief a junior tester:

```bash
browserbash run "go to the staging signup page at https://staging.myapp.test/signup, fill in a test account with email qa+gem@myapp.test and a valid password, submit the form, and confirm the dashboard loads"
```

BrowserBash navigates, locates the fields by intent rather than by brittle CSS path, types, submits, waits for the async transition, and checks that the dashboard actually rendered. The verdict tells Gemini CLI whether the flow passed, and any values you asked it to capture come back structured. If the signup silently fails — a 422 you never see, a validation message that blocks submit — you get a failed verdict instead of a false "looks good."

A few things make this practical inside an agent loop:

- **No selectors to keep in sync.** When the signup form gets restyled, your objective still reads the same. That is the whole point of the natural-language approach — the maintenance surface is a sentence, not a locator file.
- **Real waits.** The agent observes the page between steps, so it does not race ahead before the dashboard mounts. You are not hand-coding `waitForSelector` calls.
- **Secrets stay maskable.** If you graduate from one-shot runs to committed markdown tests (more on that below), variables marked as secret are masked as `*****` in every log line, so a password never lands in plaintext in your run history.

The deeper mechanics of intent-based form filling are covered in the [BrowserBash learn hub](https://browserbash.com/learn) if you want to understand why this holds up better than recorded selectors.

## Extracting structured data the agent can act on

Browsing and form-filling are inputs; extraction is the output Gemini CLI usually wants. The agent's job is often "go find X and then do something with X." BrowserBash returns extracted values as structured data, which is exactly what a downstream reasoning step needs.

Say Gemini CLI is helping you triage a pricing change. You want it to read your live pricing page and compare it against what your config file claims. The browser half is one command:

```bash
browserbash run "open https://browserbash.com/pricing and extract every plan name with its monthly price as structured data"
```

Gemini CLI runs that, gets back the plan/price pairs, and can then diff them against your repo using the file tools it already has. The agent never has to parse a screenshot or scrape HTML by hand — it gets clean fields. That is the division of labor that makes the pairing work: BrowserBash handles the messy real-world browser, Gemini CLI handles the reasoning over the result.

For the cleanest handoff, use agent mode so the result is JSON, not prose.

## Agent mode: the NDJSON contract that makes this robust

When Gemini CLI is orchestrating rather than chatting, prose output is a liability. A summary sentence can be phrased ten different ways, and the model wastes tokens (and sometimes makes mistakes) parsing it. BrowserBash's `--agent` flag exists for exactly this caller.

```bash
browserbash run "log into https://staging.myapp.test with the seeded QA user and confirm the account settings page is reachable" --agent
```

With `--agent`, stdout is NDJSON — one JSON object per line. Progress events look like:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}
```

And the run ends with a single terminal object:

```
{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}
```

Two properties make this ideal for Gemini CLI orchestration. First, the **exit code is the verdict**: `0` passed, `1` failed, `2` error, `3` timeout. Gemini CLI's `run_shell_command` tool surfaces exit codes, so the agent can branch on a number instead of interpreting a sentence. Second, the schema is **stable**, so an instruction like "read the last NDJSON line and use its `status` field" keeps working across releases. This is the same machine-caller design we cover in depth on the [BrowserBash blog](https://browserbash.com/blog), and it is what separates a flaky "agent reads the logs" setup from a dependable one.

A realistic Gemini CLI workflow then becomes: deploy to staging via shell, run the BrowserBash smoke check in `--agent` mode, branch on the exit code, and if it failed, capture the `summary` and `final_state` to explain why. The agent stays in control of the plan; BrowserBash gives it eyes and a clean signal.

### Add `--record` when you need evidence

For flows where a human will review the result, add `--record`. BrowserBash captures a screenshot and a `.webm` session video via bundled ffmpeg (the builtin engine also writes a Playwright trace). When Gemini CLI reports "the checkout test failed," it can point you to an actual video of the failure instead of a vague summary. That is the difference between an agent you trust and one you double-check.

## Choosing engines, providers, and models for the pairing

BrowserBash separates three concerns, and each maps to a sensible default for Gemini CLI users.

| Concern | Flag | Default | When to change it |
| --- | --- | --- | --- |
| Engine (interprets the English) | `--engine` | `stagehand` | Use `builtin` for the in-repo Anthropic tool-use loop, or when targeting LambdaTest / BrowserStack (auto-selected) |
| Provider (where the browser runs) | `--provider` | `local` (your Chrome) | `cdp` for any DevTools endpoint, plus `browserbase`, `lambdatest`, `browserstack` for hosted grids |
| Model (the LLM backend) | `--model` | `auto` | Pin `ollama/qwen3` for free local, or a hosted model for hard flows |

For most Gemini CLI users, the defaults are right: Stagehand engine, local Chrome, `auto` model resolving to your local Ollama. That keeps the browser half free and fully on-machine. If you are running Gemini CLI in CI where there is no display, add `--headless`. If your hard flows wander on a small local model, pin a capable one with `--model` rather than fighting the objective.

A note on honesty about scope. Gemini CLI can absolutely call the Playwright MCP server directly for browser control, and if you want to write explicit `browser_navigate` / `browser_click` / `browser_type` tool calls and manage the steps yourself, that is a legitimate path — it is lower-level and more deterministic, and for some teams that determinism is the point. BrowserBash sits one level up: you describe the outcome, an AI agent figures out the steps, and you get a verdict. If your flows are stable and you want pixel-precise scripted control, low-level Playwright MCP may suit you better. If you want to hand the agent an objective and stop maintaining selectors, BrowserBash is the better fit. They are not the same tool wearing different hats.

## When to use BrowserBash with Gemini CLI (and when not to)

Reach for this pairing when:

- **You want post-deploy verification inside an agent loop.** Gemini CLI deploys, BrowserBash checks the live flow, the exit code drives the next step. This is the strongest use case.
- **The task needs a real, stateful browser** — login, multi-step forms, async renders — that `web_fetch` cannot touch.
- **You want the browser half to be free and local.** Ollama-first means $0 model bill on the automation side, which fits the cost-conscious Gemini CLI crowd.
- **You are tired of maintaining selectors.** Plain-English objectives survive UI restyles that would break a scripted suite.

Be honest about when it is the wrong tool:

- **Hard, long flows on a tiny local model.** An 8B model will drift on a 12-step objective. Use a 70B-class model or a hosted one, or split the flow.
- **You need millisecond-deterministic, scripted control.** If you want to assert on exact DOM nodes in a fixed sequence, low-level Playwright MCP gives you that determinism more directly.
- **Pure static scraping of one URL.** If `web_fetch` already returns what you need from a static page, you do not need a browser at all.

For teams weighing the cost side, the [BrowserBash pricing page](https://browserbash.com/pricing) lays out the free local path versus the optional cloud add-ons, and the [case studies](https://browserbash.com/case-study) show how the natural-language approach holds up on real flows.

## A complete example: agent-driven checkout verification

Here is the whole loop in one place, the way it runs in practice. Gemini CLI is asked to ship a pricing change and confirm checkout still works.

```bash
browserbash run "open https://staging.myapp.test, add the Pro plan to the cart, proceed to checkout, fill the test card 4242 4242 4242 4242 with any future expiry, submit, and confirm the order success page loads" --agent --record --headless
```

The agent drives a real headless Chrome through the full purchase, records a video, and emits NDJSON. Gemini CLI reads the final `run_end` line, checks `status`, and branches: on `passed` it moves on; on `failed` it pulls `summary` and `final_state` into its explanation and points you to the recorded `.webm`. Every run is also saved on-disk under `~/.browserbash/runs` (secrets masked, capped at 200), so there is a local audit trail without anything leaving your machine. Nothing is uploaded unless you explicitly run `browserbash connect` and pass `--upload` per run — by default the whole thing stays local.

That is gemini cli browser automation working end to end: the terminal agent plans and reasons, BrowserBash sees and acts, and the two talk over a clean exit-code-and-JSON contract.

## FAQ

### How do I connect Gemini CLI to a browser automation tool?

The simplest path is to let Gemini CLI's `run_shell_command` tool call `browserbash run "<objective>"` and read the output. Install BrowserBash with `npm install -g browserbash-cli`, then add a line to your project context telling the agent to use it when a task needs a live browser. For orchestrated, machine-readable runs, add the `--agent` flag so Gemini CLI gets NDJSON and an exit-code verdict instead of prose.

### Can Gemini CLI fill out web forms and extract data?

Not on its own — its native `web_fetch` only retrieves static HTML and cannot type into stateful, JavaScript-driven forms. By shelling out to BrowserBash, Gemini CLI can drive a real Chrome to fill multi-step forms, submit them, wait for async renders, and get extracted values back as structured data. You write the objective in plain English, and the agent figures out the steps without selectors.

### Does BrowserBash cost money to use with Gemini CLI?

No. BrowserBash is free and open-source under Apache-2.0, with no account needed to run locally. Its default `auto` model resolves to a local Ollama install first, so the browser half can run at $0 with nothing leaving your machine. Optional hosted models and a cloud dashboard exist but are strictly opt-in.

### What is the difference between BrowserBash and the Playwright MCP for Gemini CLI?

Playwright MCP exposes low-level, scripted browser tools (navigate, click, type) that the model sequences itself, which is more deterministic if your flows are stable. BrowserBash sits one level higher: you give it a plain-English objective, an AI agent drives a real browser through the steps, and you get a verdict plus structured data with no selectors to maintain. Choose Playwright MCP for pixel-precise scripted control, and BrowserBash when you want to stop maintaining locators and hand the agent an outcome.

Ready to give Gemini CLI a real browser? Install it with `npm install -g browserbash-cli` and start with a one-line objective today. An account is optional — you can [sign up](https://browserbash.com/sign-up) for the free cloud dashboard whenever you want shareable run history, or stay fully local forever.
