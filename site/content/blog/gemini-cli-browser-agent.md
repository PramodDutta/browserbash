---
title: Turn Gemini CLI Into a Browser Agent That Checks Its Own Work
description: "Give Gemini CLI a deterministic browser check so your gemini cli browser agent confirms a flow actually works after it writes the code."
date: 2026-05-01
category: agents
---

A coding agent that writes a login form and then tells you "Done, it works" has only done half the job. It generated the code. It never opened a browser. The gap between "the code compiles" and "a real user can actually sign in" is where most agent-built features quietly break. This guide walks through turning your gemini cli browser agent into something that closes that gap: after it writes a flow, it drives a real Chrome browser, runs the flow like a human would, and reports back a pass or fail with the values it actually saw on screen.

The trick is not asking Gemini CLI to "be more careful." The trick is handing it a deterministic browser check it can run as a shell command, read the exit code from, and react to. That turns a confident-but-blind code generator into an agent with a feedback loop. I'll show you exactly how to wire that up with BrowserBash, a free open-source CLI built for this, and I'll be honest about where the seams are.

## Why a Gemini CLI Browser Agent Needs a Verification Loop

Gemini CLI is Google's open-source (Apache-2.0) AI agent that lives in your terminal. It runs a ReAct loop — reason, then act — and it ships with built-in tools for reading and writing files, running shell commands, fetching web pages, and grounding answers in Google Search. You give it a goal in plain English and it works through the steps, pausing for your approval before it changes things. With a personal Google account you get Gemini 2.5 Pro and a generous free tier (60 requests per minute, 1,000 per day as of 2026), which is a big part of why so many developers reach for it.

Here's the problem that has nothing to do with how good the model is. When Gemini CLI finishes editing `LoginForm.tsx`, it has no native way to know whether a human can log in. Its `web_fetch` tool pulls down a page's HTML, but fetching is not the same as driving. A fetch can't click a button, fill a field, wait for a redirect, or read the toast that pops after submit. So the agent does the reasonable thing it can do: it reads the code it just wrote, convinces itself the logic looks right, and declares victory. Sometimes it's correct. Often there's a missing `await`, a wrong route, a disabled submit button, or a validation rule that fires too early — and none of that shows up until a human clicks through it.

A verification loop fixes this by giving the agent a way to act in the browser and, crucially, a way to **read a verdict back**. The agent writes code, runs a browser check, gets `exit 0` or `exit 1`, and either moves on or fixes the bug it just learned about. That second branch — fix the bug it just learned about — is the entire point. Without a verdict, there's nothing to react to.

## What "Deterministic" Means Here (and Why It Matters)

"Deterministic" is doing a lot of work in this article, so let's be precise. There are two layers, and conflating them is where people get into trouble.

The **browser driving** is AI-interpreted. You write an objective like "log in with the test account and confirm the dashboard loads," and a model reads the live page and decides what to click. That part is fuzzy by design — it's what lets you skip selectors and page objects.

The **contract back to Gemini CLI** is deterministic. The check emits a structured result: a status (`passed`, `failed`, `error`, `timeout`), an exit code, and extracted values in a fixed shape. Gemini CLI doesn't have to parse prose or guess what "looks good" means. It reads one line of JSON and an integer exit code. That's the deterministic surface your agent reacts to, and it's stable even though the clicks underneath were chosen by a model.

This distinction is why the pattern works inside an agent loop. If your verification step returned a paragraph of natural language, Gemini CLI would have to interpret it — adding a second layer of fuzziness on top of the browser fuzziness. By pinning the output to a machine contract, you get the flexibility of natural-language browser control with the reliability of a unit-test exit code.

## Meet BrowserBash: The Browser Check You Hand to the Agent

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and you get back a verdict plus structured extracted values. It was built to be called by other tools, which makes it a clean fit as the "eyes" for a gemini cli browser agent.

Installation is one command, and the only hard requirements are Node 18 or newer and Chrome for the local provider:

```bash
npm install -g browserbash-cli
browserbash run "go to localhost:3000/login, sign in with test@acme.dev / hunter2, confirm the dashboard heading is visible"
```

That's a one-shot run against your real local Chrome. No account, no API key, nothing leaves your machine if you're on a local model. The model story matters here, so let's be clear about it.

By default BrowserBash uses `auto` model resolution. It looks for a local [Ollama](https://browserbash.com/features) install first and uses it — free, no keys, fully local. If there's no Ollama, it falls back to `ANTHROPIC_API_KEY` (Claude), then `OPENAI_API_KEY` (GPT-4.1), and if none of those exist it errors with guidance instead of guessing. The reason this is nice for an agent loop: on a local model your verification step has a guaranteed $0 model bill, no matter how many times Gemini CLI re-runs it while iterating on a fix.

One honest caveat before you wire everything together. Very small local models (8B and under) are flaky on long, multi-step objectives — they lose the thread, click the wrong thing, or hallucinate a success. The sweet spot for reliable browser verification is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. For a tight single-purpose check like "log in and confirm the dashboard," a mid-size model is plenty. For a 12-step checkout with three conditional branches, lean bigger. You can read more about model trade-offs in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## The Core Pattern: Agent Mode and Exit Codes

The feature that makes BrowserBash a good citizen inside Gemini CLI is `--agent` mode. Add the flag and BrowserBash stops printing pretty prose and instead emits NDJSON — one JSON object per line, machine-readable, no ANSI color codes to strip.

```bash
browserbash run "log in with test@acme.dev / hunter2 and confirm the dashboard loads" --agent
```

Each step streams a progress event:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"opened /login"}
```

And the run ends with a terminal event that carries everything your agent needs:

```
{"type":"run_end","status":"passed","summary":"Dashboard loaded for test user","final_state":{"heading":"Welcome back"},"duration_ms":8421}
```

Then the exit code tells the same story at the OS level, which is what shell-based agents key off:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

This is the deterministic contract from the previous section, made concrete. Gemini CLI runs the command, checks the exit code, and reads the last NDJSON line if it wants the extracted values. A `failed` (exit 1) means the flow ran but the assertion didn't hold — the dashboard never appeared. An `error` (exit 2) means something broke before the assertion could even be evaluated — Chrome didn't launch, the URL 500'd. Those are different signals and you want your agent to treat them differently: a `failed` usually means "fix your code," an `error` often means "fix your environment."

## Step-by-Step: Wiring the Check Into Gemini CLI

There are two clean ways to give Gemini CLI access to a BrowserBash check. Pick based on how much structure you want.

### Option A: The GEMINI.md Convention (Simplest)

Gemini CLI reads a `GEMINI.md` file for project context — instructions it should follow on every task. This is the lowest-friction way to teach the agent your verification habit. Drop something like this into your repo root:

```
## Verification rule

After you finish any change to an auth, signup, or checkout flow, you MUST verify it
in a real browser before claiming success. Run:

  browserbash run "<plain-English description of the flow a user would do>" --agent

Read the exit code:
  - exit 0: the flow passed. You may report success.
  - exit 1: the flow FAILED. Read the run_end summary, find the bug, fix it, re-run.
  - exit 2 or 3: environment/timeout error. Check the dev server is running, then retry.

Do not report a flow as working until BrowserBash exits 0.
```

Because Gemini CLI can run shell commands as a built-in tool, this is all it needs. The next time it edits a login flow, it'll run the check, and — this is the good part — when the check fails, the `run_end` summary is descriptive enough that the agent usually knows what to fix. "Submit button stayed disabled after filling the form" points straight at a validation bug. The agent reads that, patches the code, and runs the check again. That's the loop, and you built it with a markdown file.

### Option B: Expose BrowserBash as an MCP Server (More Structured)

Gemini CLI supports the Model Context Protocol, the open standard for giving an agent access to external tools. If you'd rather expose browser verification as a first-class tool with a typed signature instead of a shell convention, you can wrap the BrowserBash command in a small MCP server and register it in your Gemini CLI settings. The agent then sees a `verify_browser_flow` tool it can call directly, and the NDJSON result flows back as a structured tool response.

Both options run the exact same underlying check. MCP gives you a cleaner tool boundary and better visibility in the Gemini CLI tool log; the `GEMINI.md` route gets you running in two minutes. Start with A, graduate to B if you're standardizing this across a team. The [BrowserBash learn hub](https://browserbash.com/learn) has deeper material on the agent-mode contract if you go the MCP route.

## A Realistic Walkthrough: Building and Verifying a Signup Flow

Let's make this concrete with a flow that breaks in a believable way. You ask Gemini CLI to add email signup to a Next.js app. It writes the form component, the API route, and a redirect to `/welcome` on success. It tells you it's done.

Now the verification rule kicks in. The agent runs:

```bash
browserbash run "go to localhost:3000/signup, enter a new email and password, submit, and confirm you land on the welcome page with a greeting" --agent --record
```

The `--record` flag tells BrowserBash to capture a screenshot and a `.webm` session video (it bundles ffmpeg for this). On the builtin engine it also writes a Playwright trace. You don't need recording for the agent loop to work, but when a check fails it's the difference between "something went wrong" and watching the exact moment the form rejected the submit.

Say the run comes back:

```
{"type":"run_end","status":"failed","summary":"Submitted form but stayed on /signup; an error message 'Email already in use' appeared","duration_ms":11200}
```

Exit code 1. Now Gemini CLI has something real to chew on. The summary tells it the form submitted but hit a uniqueness collision — the test used a hardcoded email that already exists. The agent realizes the check needs a unique email per run, adjusts the objective to use a randomized address, and re-runs. This time:

```
{"type":"run_end","status":"passed","summary":"Signed up and landed on /welcome, greeting 'Hi there' visible","final_state":{"greeting":"Hi there"},"duration_ms":9050}
```

Exit 0. The agent reports success, and this time the claim is backed by a browser that actually completed the flow. Notice what happened: the first failure wasn't even a bug in the generated code — it was a bug in the test data. A blind agent would have shipped the feature; the verification loop caught a real-world wrinkle before you did. That's the kind of thing that builds trust in agent-written features over time.

If you want a persistent view of these runs, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — every run, its verdict, the recording, the extracted values. It's all on-disk and nothing is uploaded. The run store lives at `~/.browserbash/runs` (secrets masked, capped at 200), so even without the dashboard the agent's history is auditable after the fact.

## Committing the Check: Markdown Tests for Repeatable Flows

One-shot `run` commands are perfect for the inner agent loop, but for flows you care about long-term you want something committable. BrowserBash markdown tests (`*_test.md`) are exactly that — a plain markdown file where each list item is a step, with `{{variables}}` templating and `@import` for composing shared setup.

A `signup_test.md` might look like:

```bash
browserbash testmd run ./signup_test.md
```

The file itself is readable by anyone on the team — product, QA, a future you — because it's English steps, not selectors. Variables marked as secret are masked as `*****` in every log line, and after each run BrowserBash writes a human-readable `Result.md`. The payoff for the agent workflow: Gemini CLI can run the same committed test it ran during development, in CI, on every PR. The flow the agent verified locally is the flow your pipeline verifies on every push. No drift between "the agent said it worked" and "the test suite says it works," because they're the same artifact. There's a good [case study](https://browserbash.com/case-study) on this pattern if you want to see it at scale.

## Where the Browser Runs: Local, CDP, or Cloud Grids

By default BrowserBash uses the `local` provider — your own Chrome. For an agent verifying a localhost dev server, that's almost always what you want: fast, free, and the browser sees exactly what you see. But the provider is swappable with `--provider`, which matters once you move beyond your laptop.

| Provider | When to use it | Needs |
| --- | --- | --- |
| `local` (default) | Verifying a localhost dev server; everyday agent loops | Chrome installed |
| `cdp` | Attaching to an existing browser / DevTools endpoint | `--cdp-endpoint ws://...` |
| `browserbase` | Cloud browsers for headless CI without a local Chrome | `BROWSERBASE_API_KEY` + project ID |
| `lambdatest` | Cross-browser grids (auto-uses builtin engine) | `LT_USERNAME` + `LT_ACCESS_KEY` |
| `browserstack` | Cross-browser grids (auto-uses builtin engine) | `BROWSERSTACK_USERNAME` + access key |

For the gemini cli browser agent loop specifically, stick with `local` while developing — it's the tightest feedback cycle. Reach for a cloud provider when the same check needs to run in CI where there's no display, or when you need to confirm the flow works in a browser you don't have installed. The `cdp` provider is the quiet hero for one specific case: if your agent already has a browser open (say, an MCP-driven session), you can point BrowserBash at that same DevTools endpoint instead of launching a second Chrome.

There's also an engine choice. The default `stagehand` engine (MIT, by Browserbase) interprets your English with act/extract/observe/agent primitives and self-heals when a page shifts. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright, and it's auto-selected for LambdaTest and BrowserStack. Switch with `--engine` if you have a reason; for local verification the default is the right call.

## When This Pattern Is Worth It (and When It Isn't)

I'd rather you skip this setup than bolt it onto a workflow where it adds friction without payoff. Here's the honest breakdown.

**This pattern earns its keep when:**

- Gemini CLI is generating or modifying user-facing flows — auth, signup, checkout, onboarding — where "the code looks right" and "a human can complete it" routinely diverge.
- You're iterating fast and want the agent to catch its own mistakes before they reach you, instead of you manually clicking through every change.
- You want the same verification to run in CI later, so the agent's local check and your pipeline check are literally the same file.
- You're cost-sensitive and want verification on a free local model so re-running during a fix loop doesn't run up a bill.

**It's overkill or the wrong tool when:**

- The change is pure backend logic or a library function with no browser surface — a normal unit test is faster and more precise. Don't drive a browser to test a date-parsing function.
- You need pixel-level visual regression or exhaustive cross-browser matrices on every commit. BrowserBash verifies *behavior* — "can the user complete this flow" — not pixel diffs. A dedicated visual-regression tool is the better fit there.
- Your flow depends on a tiny local model and a 15-step objective. As noted, sub-8B models get unreliable on long chains; either shorten the objective into smaller checks or use a bigger model.

A reasonable middle path: let Gemini CLI write conventional unit and integration tests for logic, and reserve the browser check for the end-to-end "a real user can do the thing" assertion that unit tests structurally can't make. The two aren't competitors. You can compare where BrowserBash fits against other approaches on the [pricing](https://browserbash.com/pricing) and [blog](https://browserbash.com/blog) pages, both of which stay candid about what it does and doesn't do.

## Keeping It All Private (or Sharing When You Want To)

A real concern with agentic browser automation: where does your data go? On a local model with the `local` provider, the answer is nowhere — the page never leaves your machine, and the model runs on your hardware via Ollama. That's a clean story for verifying flows that touch real credentials or pre-release features.

If you *want* to share a run — to show a teammate why a check failed, or to keep a history beyond your laptop — that's opt-in and explicit. Run `browserbash connect --key bb_...` once to link the optional cloud dashboard, then add `--upload` to any individual run you want pushed. Without `--upload`, nothing leaves your machine, full stop. Free cloud runs are kept 15 days. The default posture is private; sharing is a deliberate flag, not something that happens behind your back. For an agent loop running dozens of checks an hour, that default matters — you don't want every iteration silently uploaded.

## Putting the Whole Loop Together

Step back and look at what you've built. Gemini CLI brings the reasoning, the file editing, the multi-step planning, and a generous free tier. BrowserBash brings the one thing the agent structurally lacks: a way to act in a real browser and read back a deterministic verdict. The `--agent` NDJSON contract and exit codes are the bridge — a stable, machine-readable surface that an autonomous agent can react to without parsing prose.

The result is an agent that doesn't just claim a flow works. It opens Chrome, does what a user would do, and either passes or hands itself a specific, actionable failure to fix. The first time you watch Gemini CLI catch and repair its own broken signup flow without you touching the keyboard, the value clicks. Start with a `GEMINI.md` rule and a single `browserbash run --agent` command, expand to committed markdown tests, and wire it into CI when you're ready. Every step uses the same check, so nothing drifts.

## FAQ

### Can Gemini CLI control a browser on its own?

Gemini CLI doesn't drive a browser natively — its built-in tools cover file operations, shell commands, web fetching, and Google Search grounding. Fetching a page's HTML isn't the same as clicking through a flow. To give it real browser control you add a tool it can call, either through an MCP server or, more simply, by letting it run a shell command like BrowserBash that drives Chrome and returns a structured verdict.

### How does a gemini cli browser agent know whether a flow actually passed?

It reads a deterministic contract, not prose. When you run BrowserBash with the `--agent` flag, it emits one NDJSON `run_end` line with a status and extracted values, and the process exits 0 for passed, 1 for failed, 2 for error, and 3 for timeout. Gemini CLI checks that exit code and reacts — reporting success on 0, or reading the failure summary and fixing the bug on 1.

### Do I need an API key or a paid model to verify flows with BrowserBash?

No. BrowserBash defaults to `auto` model resolution, which uses a local Ollama install first — free, no keys, and nothing leaves your machine. It only falls back to a hosted model like Claude or GPT-4.1 if you've set those API keys and have no local model. Just note that very small local models under 8B can be unreliable on long multi-step flows, so a mid-size local model is the safer choice for verification.

### Will my pages or credentials get uploaded anywhere?

Not unless you explicitly opt in. With the default local provider and a local model, the page and data never leave your machine. Uploading a run to the optional cloud dashboard requires first linking with `browserbash connect` and then adding `--upload` to that specific run. Without the `--upload` flag, every run stays entirely on-disk in `~/.browserbash/runs` with secrets masked.

Ready to give your agent eyes? Install it with `npm install -g browserbash-cli` and start with a single `--agent` run against your local app. An account is optional — but if you want the cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up).
