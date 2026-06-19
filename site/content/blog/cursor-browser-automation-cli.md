---
title: "Give Cursor a Browser: Natural-Language Web Automation From the Terminal"
description: "Cursor browser automation with BrowserBash: let the Cursor agent run plain-English browser commands to test and navigate web apps from your terminal."
date: 2026-01-20
category: agents
---

Cursor is already excellent at writing code. What it is not naturally good at is *seeing* the web app that code produces. The moment you ask it to "check that the login flow works" or "confirm the pricing page renders the new tier," the agent has to guess, because it has no eyes on a real browser. That gap is exactly where Cursor browser automation comes in: you give the agent a CLI it can call, written in plain English, and it drives an actual Chrome window step by step. This walkthrough shows you how to wire BrowserBash into Cursor so the agent can navigate, test, and verify real web pages instead of hallucinating about them.

The short version: install one npm package, teach the agent one command, and now every time it needs to confirm something on a live site, it runs `browserbash run "..."` and reads back a structured verdict. No selectors, no Playwright boilerplate, no page objects for the agent to maintain. Let me show you how the pieces fit.

## Why Cursor needs a browser in the first place

Cursor, for anyone arriving fresh, is an AI-first code editor built on a fork of VS Code. Its Agent (Composer) mode can edit files across your repo, run terminal commands, and chain multi-step tasks. As of the 3.5 release in 2026 it also ships Cloud Agents that run in isolated VMs with their own browser and desktop access, and there are first-party browser capabilities surfacing in the product. Those are genuinely useful, but they live mostly in Cursor's cloud environment and are tied to your Cursor account and plan.

The day-to-day local loop is different. When you are coding on your own machine and you ask the agent to "make sure the signup form rejects an empty email," the most reliable thing the agent can do is run a shell command and read the output. Cursor is very good at exactly this: it proposes a terminal command, you (or an allowlist) approve it, it captures stdout, and it reasons over the result. That is the seam BrowserBash slots into. Instead of the agent writing a throwaway Playwright script, installing browsers, wiring selectors, and debugging timeouts, it runs a single natural-language command and gets back a clean pass/fail plus extracted data.

This matters because the failure mode of an AI coding agent without a browser is quiet and expensive. It edits the form validation, declares victory, and you find out three commits later that the button was disabled the whole time. Giving Cursor a real browser turns "I believe this works" into "I navigated to the page, submitted the form, and confirmed the error message appeared."

## What BrowserBash actually is

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, created by Pramod Dutta. You write a plain-English objective; an AI agent drives a real Chrome/Chromium browser one step at a time and returns a verdict along with structured extracted values. There are no selectors to maintain and no page object model to keep in sync with the UI.

Install is a single line:

```bash
npm install -g browserbash-cli
```

It needs Node 18 or newer and Chrome for the default local provider. The current version is 1.3.1. There is no account required to run it, and on local models nothing leaves your machine, which is the part that makes it comfortable to hand to an agent that might poke at internal or staging environments.

The model story is Ollama-first, and this is the detail that keeps your bill at zero. The default model is `auto`, which resolves in order: a local Ollama install becomes `ollama/<model>` (free, no keys); failing that, an `ANTHROPIC_API_KEY` selects `claude-opus-4-8`; failing that, an `OPENAI_API_KEY` selects `openai/gpt-4.1`; otherwise it errors with guidance. Run a capable local model and you have a guaranteed $0 model cost for every browser task the agent fires off.

One honest caveat before you build a workflow around this: very small local models (8B parameters and under) get flaky on long, multi-step objectives. They lose the plot halfway through a checkout flow. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. For Cursor verification tasks, which tend to be short and concrete ("submit this form, read the error"), even modest local models hold up fine. Save the big guns for end-to-end journeys.

## The Cursor setup, step by step

There are two ways to give the Cursor agent browser access through BrowserBash. The simple one is the terminal. The structured one is a project rule. You will probably want both.

### Step 1: Install and smoke-test outside Cursor

Before you involve the agent, prove the command works in your own shell. This is the single most important debugging habit with any tool you hand to Cursor: if a stdio command crashes silently inside the IDE, you want to already know it runs cleanly outside it.

```bash
npm install -g browserbash-cli
browserbash run "go to example.com and confirm the page heading says Example Domain"
```

You should see a Chrome window open, the agent navigate, and a verdict print to the terminal. If you are running Ollama locally, pull a mid-size model first (`ollama pull qwen3`) so `auto` has something good to resolve to. If you would rather use a hosted model, export `ANTHROPIC_API_KEY` and `auto` picks `claude-opus-4-8` without any flags.

### Step 2: Let Cursor run it as a terminal command

Cursor's Agent mode runs terminal commands as a native capability. In recent versions (3.6 and above), MCP and terminal commands share the same approval model: allowlisted commands run immediately, and everything else is routed through Cursor's safety classifier in Auto-review mode. The practical move is to add `browserbash` to your allowlist so the agent can call it without a prompt every single time.

Now you can simply tell the agent what you want in natural language and let it construct the command. A prompt like "use browserbash to verify the contact form shows a validation error on empty submit" leads the agent to run something close to this:

```bash
browserbash run "open http://localhost:3000/contact, click Submit without filling anything, and confirm a validation error appears for the email field"
```

The agent reads the verdict, and if it failed, it goes back and fixes the validation code. That loop, edit then verify in a real browser then edit again, is the whole point.

### Step 3: Make it agent-native with `--agent`

Plain prose output is fine for a human, but for an agent that has to parse results reliably, BrowserBash has an agent mode. The `--agent` flag emits NDJSON, one JSON object per line. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the terminal event looks like `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...}`. Exit codes are unambiguous: 0 passed, 1 failed, 2 error, 3 timeout.

This is the format you want Cursor consuming. The agent does not have to interpret English prose; it reads the `run_end` status and the exit code, which removes a whole class of "the agent misread the output" mistakes.

```bash
browserbash run "log in at http://localhost:3000 with the demo account and confirm the dashboard greeting shows the username" --agent
```

Because exit codes are real, the agent can branch cleanly: exit 0 and move on, anything else and read `summary` to decide what to fix.

### Step 4: Capture the setup as a Cursor project rule

Telling the agent "use browserbash" works, but it relies on you remembering to say it. Cursor reads project rules and config from your repo, including MCP config at `.cursor/mcp.json` and rule files that shape agent behavior. The durable pattern is to drop a short rule into your project that says, in effect: *when you need to verify behavior in a browser, run `browserbash run "<objective>" --agent` and treat exit code 0 as a pass.* Once that rule exists, every teammate's Cursor agent picks up the same habit without anyone re-explaining it.

Keep the rule short and specific. List the exact command shape, the meaning of the exit codes, and a note that local mode keeps everything on-device. The agent does the rest. If you want a deeper menu of objectives to crib from, the [BrowserBash tutorials](https://browserbash.com/tutorials) and the [learn hub](https://browserbash.com/learn) are good starting points.

## A real Cursor loop: edit, verify, repeat

Here is what a concrete session feels like. Say you are building a checkout page and you just changed the discount-code logic. You tell Cursor: "Apply the SAVE20 code and confirm the total drops by 20 percent." The agent runs:

```bash
browserbash run "go to http://localhost:3000/checkout, add the SAVE20 discount code, and confirm the order total decreased by 20 percent" --agent
```

The NDJSON streams back. Step one navigates. Step two finds and fills the code field. Step three reads the total. The `run_end` event reports `failed` with a summary saying the total did not change. The agent reads that, opens your discount handler, spots that the code comparison is case-sensitive and the input was uppercased on one side only, fixes it, and re-runs the exact same command. This time `run_end` is `passed`, exit code 0. You watched the whole thing happen against a real Chrome window, not a mock.

That is the difference between an agent that *claims* a feature works and one that *checked*. And because the objective is plain English, when the UI changes next sprint and the discount field moves, the command does not break the way a hard-coded selector would. The agent re-interprets the page each run.

For flows you run constantly, you do not even need the agent to retype the objective. BrowserBash supports committable markdown tests. A `*_test.md` file lists each step as a list item, supports `{{variables}}` templating and `@import` composition, masks secret-marked variables as `*****` in every log line, and writes a human-readable `Result.md` after each run. The agent (or your CI) runs them with:

```bash
browserbash testmd run ./checkout_test.md
```

Now the regression lives in your repo next to the code, and Cursor can run it the same way a human would. There is more on the testing workflow in the [features overview](https://browserbash.com/features).

## Engines and providers: what to leave alone, what to change

BrowserBash separates *who interprets the English* (the engine) from *where the browser runs* (the provider). For Cursor work you can largely ignore the knobs, but it helps to know they exist.

The default engine is `stagehand` (MIT-licensed, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals against minor UI drift. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright; it is selected automatically for LambdaTest and BrowserStack runs. You switch with `--engine stagehand|builtin`. For local verification you will almost never touch this.

The default provider is `local`, which uses your own Chrome. That is the right choice for Cursor, because the browser opens on your machine, against your localhost, with nothing leaving the device on local models. Other providers exist for when you outgrow local: `cdp` attaches to any DevTools endpoint over `--cdp-endpoint ws://...`, and `browserbase`, `lambdatest`, and `browserstack` run in their respective clouds (each needs its own credentials). The cloud providers matter for cross-browser matrices, not for the inner-loop "does my localhost work" check that dominates Cursor sessions.

A few `run` flags earn their keep with an agent:

| Flag | What it does | Why Cursor cares |
| --- | --- | --- |
| `--agent` | NDJSON output, one JSON object per line | Reliable machine parsing; no prose guessing |
| `--headless` | Runs Chrome without a visible window | Faster, quieter runs in CI or background tasks |
| `--timeout <seconds>` | Caps the run | Stops a stuck flow from hanging the agent |
| `--record` | Screenshot plus `.webm` video (builtin also writes a Playwright trace) | A visual artifact when a run fails and the agent needs evidence |
| `--dashboard` | Opens the local dashboard for this run | Eyeball the run history without leaving your machine |
| `--upload` | Pushes this run to the cloud (needs `connect` first) | Opt-in sharing; without it nothing leaves your machine |

The `--upload` flag deserves a clear note because privacy is the whole reason teams trust an agent with internal apps. By default nothing is uploaded. You only get cloud runs if you first link with `browserbash connect --key bb_...` and then add `--upload` per run. There is also a fully local dashboard at `localhost:4477` via `browserbash dashboard` that never phones home. Every run is kept on disk at `~/.browserbash/runs` with secrets masked, capped at 200. So even without any dashboard, the agent has a durable, inspectable history of what it did. You can read the boundary between local and cloud on the [pricing page](https://browserbash.com/pricing); the free local path covers the entire Cursor workflow described here.

## BrowserBash versus Cursor's own browser tools

It is fair to ask: Cursor is adding browser capabilities itself, so why bolt on a separate CLI? The honest answer is that they solve overlapping but different problems, and for a lot of teams the right move is to use both.

Cursor's first-party browser tools, as of 2026, are strongest inside Cursor's own environment, particularly the Cloud Agents that run in isolated VMs with browser and desktop access. They are deeply integrated with the agent UI, they require no extra install, and they are the natural choice when the work already lives in Cursor's cloud. Some of the exact capabilities, limits, and pricing of the in-product browser tooling are evolving and not always publicly pinned down at any given moment, so treat specifics as "as of 2026" and check Cursor's own docs for the current state.

Where BrowserBash fits is the local, command-shaped, model-agnostic case:

| Dimension | BrowserBash CLI | Cursor's built-in browser tools |
| --- | --- | --- |
| Where it runs | Your machine (local Chrome) by default | Strongest in Cursor's cloud/VM environment |
| Cost model | $0 on local Ollama models; no account to run | Tied to your Cursor plan; specifics as of 2026 |
| Model choice | Ollama, Anthropic, OpenAI, OpenRouter, gateways | Cursor's own model routing |
| Interface | A shell command any agent or CI can call | Integrated into Cursor's agent UI |
| Portability | Same command in Cursor, Claude Code, CI, or a plain terminal | Cursor-specific |
| License | Open source, Apache-2.0 | Proprietary product feature |

The portability row is the one I would underline. Because BrowserBash is just a command with NDJSON output and real exit codes, the exact same verification you teach Cursor also runs in Claude Code, in a GitHub Action, or in your own terminal at 2am when you are debugging without an IDE open. You are not locked into one agent's idea of a browser.

### When Cursor's own tools are the better fit

Be honest with yourself about the boundary. If your work already happens inside Cursor's Cloud Agents, if you want zero extra installs, or if you need the browser to live in the same isolated VM as the agent's other actions, Cursor's native tooling is the cleaner path and you should reach for it. BrowserBash is not trying to replace that.

### When BrowserBash is the better fit

Reach for BrowserBash when you want the browser to run locally against your own Chrome and localhost, when you want a guaranteed $0 model bill using local Ollama, when you need the same verification to run identically across multiple agents and CI, or when you want committable markdown tests living in the repo. The model-agnostic, open-source, terminal-first design is the draw.

## Keeping the agent honest: tips from real use

A handful of habits make the Cursor-plus-BrowserBash loop far more reliable.

Write objectives the way you would brief a careful junior tester. "Verify the login works" is vague; "log in with email demo@x.com, confirm the URL changes to /dashboard, and confirm the header shows the user's name" gives the agent concrete success conditions it can actually check. The more specific the objective, the cleaner the verdict.

Prefer `--agent` for anything the agent consumes, and reserve human-readable output for when *you* are watching. Mixing the two is where misread results creep in.

Use `--timeout` defensively. An agent that fires a browser command with no cap can hang your whole Cursor session if a page never loads. A 60-second ceiling fails fast and lets the agent move on or retry.

When a verification fails in a way that surprises you, add `--record` and look at the `.webm` or screenshot. Half the time the "bug" is that your localhost was serving a stale build, and the video shows it instantly.

Push stable flows into `*_test.md` files. The agent improvising a fresh objective every run is fine for exploration, but for the checks you care about, a committed markdown test is reproducible, reviewable in a pull request, and runnable by CI without an agent at all. The [BrowserBash blog](https://browserbash.com/blog) has more patterns, and the [case studies](https://browserbash.com/case-study) show how teams structure these.

Finally, keep secrets in secret-marked variables. BrowserBash masks them as `*****` in every log line, which matters a lot the moment an agent's run output ends up pasted into a chat, a ticket, or a CI log.

## Putting it together

The mental model is simple. Cursor is the brain that reads your code and decides what to change. BrowserBash is the pair of eyes that confirms the change actually did something in a real browser. You connect them with one shell command and, ideally, one project rule. The agent edits, runs `browserbash run "..." --agent`, reads the exit code, and either moves on or fixes what it just broke. Because everything runs locally on a free model by default, you can let the agent verify as often as it likes without watching a meter.

That tight, cheap, real-browser feedback loop is what turns Cursor from a confident code generator into an agent that checks its own work. And because the interface is a portable command rather than a proprietary integration, the muscle you build here carries over to every other agent and CI pipeline you touch.

## FAQ

### Can the Cursor agent run BrowserBash commands by itself?

Yes. Cursor's Agent mode runs terminal commands as a native capability, so once BrowserBash is installed globally it can call `browserbash run "..."` directly. Add the command to Cursor's allowlist so it runs without an approval prompt every time, and use the `--agent` flag so the agent reads structured NDJSON and exit codes instead of parsing prose.

### Does BrowserBash send my web pages or data to the cloud?

No, not unless you explicitly opt in. The default local provider runs against your own Chrome, and on local Ollama models nothing leaves your machine. Cloud upload only happens if you first link with `browserbash connect` and then add `--upload` to a specific run. Without those steps, run history stays on disk at `~/.browserbash/runs` with secrets masked.

### Do I need an API key or paid model to use BrowserBash with Cursor?

No. The default `auto` model resolves to a local Ollama model first, which is free and requires no keys, giving you a guaranteed $0 model bill. If you prefer a hosted model, setting `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` lets `auto` pick one automatically. For long multi-step flows a mid-size local model or a capable hosted model works best, since very small local models get unreliable.

### How is this different from Cursor's built-in browser tools?

Cursor's native browser tooling is strongest inside its own cloud and VM environment and is tied to your Cursor plan, while BrowserBash is an open-source CLI that runs locally against your own Chrome by default. BrowserBash is model-agnostic and portable, so the same command works in Cursor, in CI, or in any other agent. If your work already lives in Cursor's Cloud Agents, the built-in tools may be the simpler choice; for local, free, repeatable verification, BrowserBash fits better.

Give your Cursor agent a real browser today. Install with `npm install -g browserbash-cli`, point it at your localhost, and let it verify its own work. Want the optional cloud dashboard and run sharing? An account is free and optional at [browserbash.com/sign-up](https://browserbash.com/sign-up).
