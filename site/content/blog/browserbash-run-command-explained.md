---
title: The browserbash run command, every option explained
description: "A hands-on deep dive on the browserbash run command: writing good objectives plus --model, --headless, --timeout, --record, and structured output."
date: 2026-01-13
category: tutorial
---

By the end of this tutorial you'll be able to drive a real Chrome browser from one line of plain English and know exactly what every flag on the `browserbash run` command does. We'll start with the thing most people get wrong — the objective string itself — then walk through `--model`, `--headless`, `--timeout`, and the output flags one at a time, running each as a real command against a live site. The **browserbash run command** is the heart of the CLI: you give it an English goal, an AI agent navigates the page step by step (no selectors, no page objects), and it hands back a pass/fail verdict plus the structured values it pulled out along the way. I'll pair-program through it the way I'd onboard a new SDET on my team — concrete commands, realistic output, and the honest caveats nobody puts in the README.

BrowserBash is a free, open-source (Apache-2.0) CLI from [The Testing Academy](https://browserbash.com). It's Ollama-first, so the default examples below cost you exactly $0 and never send a byte off your machine. Let's get the prerequisites sorted, then take `run` apart piece by piece.

## What you'll need

- **Node.js 18 or newer.** Check with `node --version`. If you're behind, grab the current LTS from nodejs.org.
- **Google Chrome installed.** The default `local` provider drives your real Chrome install.
- **The CLI itself**, installed globally:

```bash
npm install -g browserbash-cli
```

- **A model backend.** For the free path you want [Ollama](https://browserbash.com/learn) running locally with a mid-size model pulled (more on model choice below). If you'd rather use a hosted model, set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your environment and `run` will find it.

No account is required to run anything in this tutorial. Confirm the install worked:

```bash
browserbash --version
```

You should see `1.3.1` (or newer). If the command isn't found, your global npm bin directory isn't on your `PATH` — fix that before continuing.

## Step 1 — Your first run, anatomy of the command

The shape of the command is dead simple: the word `run`, then a quoted English objective.

```bash
browserbash run "Go to example.com and confirm the page heading says 'Example Domain'"
```

That's a complete, valid run. Here's what happens when you hit Enter. BrowserBash resolves a model (with `auto`, it looks for a local Ollama server first), launches Chrome, and hands your objective to the agent. The agent works in a loop — observe the page, decide an action, act, observe again — until it believes the objective is met or it gives up. When it finishes, you get a verdict block in your terminal that reads roughly like this:

```
VERDICT: passed
Summary: Navigated to example.com; the page heading reads "Example Domain", matching the expectation.
Steps: 2 (navigate, verify heading)
Duration: 6.4s
```

Two things to internalize right now. First, the objective is the program. There's no second file, no selector list, no config — the English sentence *is* the test. Second, the verdict is a judgment the agent makes against your wording, which is exactly why the next step matters so much.

### How the agent interprets your English

By default `run` uses the **Stagehand** engine (MIT, by Browserbase), which exposes act / extract / observe / agent primitives and self-heals when the page shifts. There's a second engine, `builtin` — an in-repo Anthropic tool-use loop driving Playwright — which is selected automatically for the LambdaTest and BrowserStack providers. You usually don't touch the engine; just know that "who reads your English" is Stagehand unless you say otherwise with `--engine`.

## Step 2 — Write objectives the agent can actually pass

This is the highest-leverage skill in the whole tool, so it gets its own step. A vague objective produces a vague (and flaky) verdict. A precise objective produces a crisp, repeatable one.

Compare these two:

```bash
# Weak: what does "works" mean? The agent has to guess.
browserbash run "Check that the login works on https://practice.expandtesting.com/login"
```

```bash
# Strong: explicit inputs, explicit success condition, explicit thing to extract.
browserbash run "Go to https://practice.expandtesting.com/login, log in with username 'practice' and password 'SuperSecretPassword!', then confirm the page shows the text 'You logged into a secure area' and report the success message you see."
```

The second one wins because it gives the agent three things it craves:

1. **A concrete starting URL.** Don't make the agent search for your app.
2. **The exact inputs.** Spell out usernames, values to type, buttons to click.
3. **An unambiguous success condition** — a specific string or state, not the word "works."

When you ask the agent to *report* or *extract* a value, BrowserBash returns it as structured data alongside the verdict — that's the difference between "it passed" and "it passed and here is the order number it saw." Treat your objective like an acceptance criterion you'd hand a junior tester, and you'll get stable results.

### A quick rubric

| Objective ingredient | Weak version | Strong version |
| --- | --- | --- |
| Starting point | "the login page" | "https://practice.expandtesting.com/login" |
| Input data | "log in" | "log in with username 'practice' and password '...'" |
| Success condition | "it works" | "confirm the page shows 'You logged into a secure area'" |
| Extraction | (none) | "report the success message you see" |

## Step 3 — Pin the model with --model

With no flag, `run` uses `--model auto`, which resolves in a fixed order:

1. A **local Ollama** server, if one is reachable — used as `ollama/<model>`. Free, no API keys, nothing leaves your machine.
2. Else `ANTHROPIC_API_KEY` in your environment → `claude-opus-4-8`.
3. Else `OPENAI_API_KEY` → `openai/gpt-4.1`.
4. Else it errors out and tells you how to fix it.

That auto-resolution is convenient, but in a tutorial — and in CI — you want to be explicit. Pin the backend so a run is reproducible no matter whose machine it's on.

```bash
# Free local run against a mid-size Ollama model
browserbash run "Go to https://news.ycombinator.com and report the title of the top story" \
  --model ollama/qwen3
```

```bash
# Hosted Anthropic model (needs ANTHROPIC_API_KEY exported)
browserbash run "Go to https://news.ycombinator.com and report the title of the top story" \
  --model claude-opus-4-8
```

Here are the backends `--model` accepts:

| `--model` value | Backend | Keys / env needed | Notes |
| --- | --- | --- | --- |
| `auto` (default) | Ollama → Anthropic → OpenAI | none for local | Resolves in the order above |
| `ollama/<model>` | Local Ollama | none | e.g. `ollama/qwen3`; tune with `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| `claude-opus-4-8` | Anthropic | `ANTHROPIC_API_KEY` | Strong on long multi-step flows |
| `openai/gpt-4.1` | OpenAI (via Stagehand) | `OPENAI_API_KEY` | |
| `google/gemini-2.5-flash` | Google (via Stagehand) | Gemini key | Fast, cheap hosted option |
| `openrouter/<vendor>/<model>` | OpenRouter | `OPENROUTER_API_KEY` | e.g. `openrouter/meta-llama/llama-3.3-70b-instruct` |

You can also point at any Anthropic-compatible gateway by setting `ANTHROPIC_BASE_URL` and keeping the Anthropic model id.

### The honest caveat on local models

Free is great, but be realistic about size. Very small local models (roughly 8B parameters and under) are flaky on long, multi-step objectives — they lose the thread, click the wrong thing, or declare victory early. For single-step checks ("open this URL, read this heading") a small model is fine. For anything with a login, a form, and a confirmation, reach for a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model. That one choice fixes most "why did my run go sideways" reports.

## Step 4 — Control the window with --headless

By default you see Chrome pop up and the agent drives it in front of you, which is fantastic while you're authoring objectives — you watch exactly where it goes wrong. For CI, servers, or just getting your screen back, run headless:

```bash
browserbash run "Go to https://practice.expandtesting.com/login, log in with username 'practice' and password 'SuperSecretPassword!', and confirm you reach the secure area" \
  --model ollama/qwen3 \
  --headless
```

No window appears; the agent runs the same loop invisibly and prints the same verdict block at the end. My habit: author and debug an objective with the window visible, then add `--headless` once it's green so it's CI-ready. The verdict is identical either way — headless changes visibility, not behavior.

## Step 5 — Set a budget with --timeout

Some flows are quick; some genuinely take a while (slow apps, multi-page checkouts, a small model thinking hard). `--timeout` takes a value **in seconds** and caps the whole run. If the agent hasn't reached a verdict by then, the run ends as a timeout.

```bash
browserbash run "Go to https://practice.expandtesting.com and open the 'Web inputs' page, then confirm the form fields are visible" \
  --model ollama/qwen3 \
  --timeout 120
```

A timeout is a distinct outcome from a failure, and that distinction matters in scripts. In agent mode (next step) a timeout returns exit code `3`, separate from a logical failure (`1`). In practice: give local-model runs a generous timeout because they think more slowly than hosted ones; keep CI smoke checks tight so a hung run fails fast instead of blocking the pipeline.

## Step 6 — Get machine-readable output with --agent

Everything so far prints prose for a human. The `--agent` flag turns stdout into **NDJSON** — newline-delimited JSON, one object per line — so a script, a CI job, or an AI coding agent can consume the run without parsing English.

```bash
browserbash run "Go to https://practice.expandtesting.com/login, log in with username 'practice' and password 'SuperSecretPassword!', and confirm you reach the secure area" \
  --model ollama/qwen3 \
  --headless \
  --agent
```

You'll get a stream of step events followed by a single terminal event, looking like this:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened the login page"}
{"type":"step","step":2,"status":"passed","action":"type","remark":"Entered username and password"}
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked the Login button"}
{"type":"run_end","status":"passed","summary":"Reached the secure area.","final_state":{"message":"You logged into a secure area!"},"duration_ms":11840}
```

The process **exit code** carries the verdict so your shell can branch on it without reading a word:

| Exit code | Meaning |
| --- | --- |
| `0` | passed |
| `1` | failed (logical assertion didn't hold) |
| `2` | error (something broke — bad config, crash) |
| `3` | timeout (hit your `--timeout`) |

That's the whole point of agent mode: a browser run stops being something you watch and becomes something you can call like a function. Wire it into CI with a simple `if browserbash run ... --agent; then ...` and let the exit code decide.

## Step 7 — Capture evidence with --record and --dashboard

When a run fails and you weren't watching, you want artifacts. `--record` captures a screenshot plus a `.webm` session video using the bundled ffmpeg. On the `builtin` engine it additionally writes a Playwright trace you can open in the trace viewer.

```bash
browserbash run "Go to https://practice.expandtesting.com/login, log in with username 'practice' and password 'SuperSecretPassword!', and confirm you reach the secure area" \
  --model ollama/qwen3 \
  --record
```

Want to eyeball runs in a UI instead of the terminal? BrowserBash ships a fully local dashboard at `localhost:4477`:

```bash
browserbash dashboard
```

Or open the dashboard automatically for a single run with the per-run flag:

```bash
browserbash run "Go to example.com and confirm the heading reads 'Example Domain'" --dashboard
```

The dashboard is local and free — nothing is uploaded. There's also an opt-in cloud dashboard: run `browserbash connect --key bb_...` once, then add `--upload` to any run to push that run to the cloud (free cloud runs are kept 15 days). Without `--upload`, nothing ever leaves your machine. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200 runs), so you always have local history even without the dashboard.

## The full run flag reference

Here's every flag `run` accepts, in one table you can come back to:

| Flag | What it does |
| --- | --- |
| `--provider` | Where the browser runs: `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack` |
| `--engine` | Who interprets the English: `stagehand` (default) or `builtin` |
| `--model` | Pin the LLM backend (see Step 3); defaults to `auto` |
| `--headless` | Run Chrome without a visible window |
| `--timeout <seconds>` | Cap the whole run; a breach ends as a timeout |
| `--cdp-endpoint <ws-url>` | DevTools endpoint for `--provider cdp` |
| `--record` | Screenshot + `.webm` video (builtin engine also writes a Playwright trace) |
| `--dashboard` | Open the local dashboard for this run |
| `--upload` | Push this run to the cloud (requires `connect`) |
| `--agent` | Emit NDJSON instead of prose |

A couple of providers need credentials in your environment: `browserbase` wants `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`; `lambdatest` wants `LT_USERNAME` + `LT_ACCESS_KEY` (and auto-switches to the `builtin` engine); `browserstack` wants `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` (also auto `builtin`). For this tutorial we've stuck to the free `local` default.

## Troubleshooting

**"No model available" / run errors immediately.** With `--model auto` and no Ollama server running and no API keys set, `run` has nothing to resolve to, so it errors with guidance. Fix: start Ollama and pull a model (then pass `--model ollama/<model>`), or export `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. Being explicit with `--model` makes this failure obvious instead of mysterious.

**The agent wanders, clicks the wrong thing, or declares success too early.** Almost always a too-small local model on a too-long objective. Swap to a mid-size local model (Qwen3 / Llama 3.3 70B-class) or a hosted model like `claude-opus-4-8`, and tighten your objective per Step 2 — concrete URL, exact inputs, explicit success string. Small models are fine for single-step checks; they struggle on multi-step flows.

**`--record` produces no video.** Recording leans on the bundled ffmpeg. If the `.webm` is missing, you still get the screenshot, but check that nothing in your environment is shadowing or blocking the bundled binary. Re-running with the dashboard open (`--dashboard`) is a quick way to confirm the run itself succeeded while you sort out recording.

**Runs hit the timeout.** Either the flow genuinely needs more time or a slow local model is the bottleneck. Raise `--timeout` (it's in seconds), and remember timeout is exit code `3` in `--agent` mode, distinct from a real failure (`1`) — so don't treat a slow run as a broken feature.

**A cloud provider run says credentials are missing.** `--provider browserbase`, `lambdatest`, and `browserstack` each require their env vars set (listed above). If they're unset, the run errors before launching a browser. Export the keys, or fall back to `--provider local` to keep everything on your machine.

## When to use this

Reach for `browserbash run` whenever you want a one-shot, throwaway check from the command line — a quick smoke test, a "did the deploy break login," a one-off scrape of a value. When a check is worth keeping and reviewing in a pull request, graduate it to a committable markdown test (`browserbash testmd run ./flow_test.md`) where each list item is a step. From here, a few good next reads:

- [Browse all BrowserBash tutorials](https://browserbash.com/tutorials) for end-to-end walkthroughs.
- [The Learn hub](https://browserbash.com/learn) for setting up Ollama and choosing a local model.
- [The BrowserBash blog](https://browserbash.com/blog) for CI recipes, agent-mode patterns, and provider deep dives.
- [Features overview](https://browserbash.com/features) if you want the full map of engines, providers, and output modes.

## FAQ

### What does the browserbash run command do?

It runs a single browser automation task from one plain-English objective. An AI agent launches a real Chrome browser, works step by step to satisfy your sentence (no selectors or page objects), and returns a pass/fail verdict plus any structured values you asked it to extract. It's the one-shot entry point of the CLI, as opposed to the committable markdown tests you run with `testmd`.

### Is browserbash run free to use?

Yes. BrowserBash is free and open source under Apache-2.0, and with the default Ollama-first model resolution it runs entirely on your machine with no API keys and no per-run bill. You only pay if you choose to pin a hosted model like Claude or GPT, or use a paid cloud browser provider. No account is needed to run anything locally.

### How do I make browserbash run headless?

Add the `--headless` flag to your run command. Chrome then executes the same agent loop without opening a visible window, which is what you want for CI servers or background jobs. The verdict and output are identical to a visible run; headless only changes whether you see the browser, not how the agent behaves.

### What do the browserbash exit codes mean?

In `--agent` mode the process exit code carries the result so scripts can branch without parsing text. Code 0 means the run passed, 1 means it failed a logical check, 2 means an error occurred (such as bad config or a crash), and 3 means the run hit your `--timeout`. This lets you wire a run straight into a CI pipeline or another agent.

---

That's every option on `run`, from the objective string to the output flags. The fastest way to internalize it is to run the commands above against a real site and watch the verdicts. Install it and try one now:

```bash
npm install -g browserbash-cli
```

An account is optional, but if you want the cloud dashboard you can [sign up here](https://browserbash.com/sign-up).
