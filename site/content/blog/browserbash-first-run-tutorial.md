---
title: Your first BrowserBash run: browser automation in plain English
description: "A hands-on browserbash tutorial: write a plain-English objective, watch the AI agent drive real Chrome, and read the verdict plus extracted values."
date: 2026-01-09
category: tutorial
---

By the end of this browserbash tutorial you'll have installed the CLI, written your first plain-English objective, watched an AI agent drive a real Chrome window step by step, and read back a clean verdict with structured extracted values. No selectors. No page objects. No `await page.locator(...)`. You describe what you want in a sentence, and the agent figures out the clicks.

I'm going to treat this like a pairing session. We'll start with the cheapest possible setup — a local model running on your own machine, no API keys, no cloud, a guaranteed zero-dollar model bill — then dissect exactly what happens when you hit Enter. The interesting part isn't the install; it's learning to *read* a run: what the agent did, why it said "passed," and where the values it pulled off the page actually come from. Once you can read a run, you can write objectives that work the first time.

If you've ever stared at a flaky `getByRole` test and wished you could just *tell* the browser what to do, this is that.

## What you'll need

Nothing exotic. Here's the checklist before we run anything:

- **Node.js 18 or newer.** Check with `node -v`. If you're on an older line, grab the latest LTS.
- **Google Chrome installed.** The default `local` provider drives your real, on-disk Chrome. If you can launch Chrome by hand, you're set.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

- **A model the agent can think with.** This is the one real decision. BrowserBash is **Ollama-first**: if you have [Ollama](https://ollama.com) running locally, the agent uses it for free and *nothing leaves your machine*. We'll use that path for the whole lesson. If you'd rather use a hosted model, set `ANTHROPIC_API_KEY` (resolves to `claude-opus-4-8`) or `OPENAI_API_KEY` and skip the Ollama step — the commands are identical.

Confirm the install landed:

```bash
browserbash --version
```

You should see `1.3.1` (or newer). If the command isn't found, your global npm bin directory isn't on your `PATH` — more on that in Troubleshooting.

### Pull a local model (the free path)

Very small models choke on long, multi-step objectives — that's the honest caveat up front. A 3B model will navigate fine and then forget what it was doing by step five. The sweet spot for local is a mid-size model in the Qwen3 / Llama 3.3 70B class. If your machine can run it, pull one:

```bash
ollama pull qwen3
```

If 70B-class is too heavy for your hardware, a capable hosted model (`ANTHROPIC_API_KEY` → `claude-opus-4-8`) will sail through hard flows where a small local model stumbles. Pick the brain that fits your box; the rest of the tutorial doesn't change.

## Step 1 — Run your first objective

Let's not overthink the first one. We'll point the agent at a stable, well-known page and ask it to read something back. Open a terminal and run:

```bash
browserbash run "Go to https://example.com and tell me the main heading on the page"
```

That's the whole program. A plain-English sentence in quotes after `run`.

Here's what happens, in order:

1. BrowserBash resolves the model. With `auto` (the default) it looks for local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. With Ollama up, you're on the free local path.
2. It launches a **real Chrome window** via the `local` provider. You'll see it pop open — this is not a screenshot service, it's an actual browser.
3. The agent reads the objective, decides the first action (navigate to the URL), executes it, looks at the resulting page, and decides the next action.
4. When it's satisfied the objective is met, it stops and prints a verdict.

For this objective the agent navigates, observes the page, finds the `<h1>`, and finishes. In your terminal you'll get a short human-readable summary — a **passed** verdict and a one-line remark along the lines of *"The main heading on the page is 'Example Domain'."*

The Chrome window closes when the run ends. If you want to watch it work without it racing ahead, that's fine — the default is a visible (headed) browser precisely so you can see what the agent sees.

### Run it headless

Once you trust a flow, you usually don't want a window flashing open. Add `--headless`:

```bash
browserbash run "Go to https://example.com and tell me the main heading on the page" --headless
```

Same verdict, no visible window. This is the mode you'll use in CI.

## Step 2 — The anatomy of a good objective

This is the part most people skip and then wonder why the agent wandered off. An objective is not a magic wish — it's an instruction to a capable but literal assistant. The best objectives have three parts:

- **A starting point** — where to go. *"Go to https://news.ycombinator.com"*
- **An action or path** — what to do once there. *"open the top story"*
- **A success condition or extraction** — how you (and the agent) know it worked, and what to bring back. *"and tell me the article title and the number of comments"*

Put those together and you get an objective that's specific enough to succeed and verifiable enough to trust:

```bash
browserbash run "Go to https://news.ycombinator.com, open the top story, and report the article title and the number of comments"
```

Compare that to a vague version like *"check the news."* The agent has no destination, no action, and no finish line — it'll either guess or give up. Specificity is the entire skill. Think of it as writing an acceptance criterion, not a wish.

A few habits that pay off immediately:

- **Name the thing the way a human would see it.** *"click the green Sign in button"*, not *"click the element with id=login"*. The agent reads the page like a person; describe it like one.
- **State the success condition explicitly** when it isn't obvious. *"...confirm the dashboard shows a Welcome message"* gives the agent a target to verify against, which directly drives the verdict.
- **Ask for exactly the values you want back.** If you say *"report the order total and the confirmation number"*, those land in the structured output as named fields. Vague asks produce vague extractions.

### Anatomy at a glance

| Part of the objective | What it does | Example |
| --- | --- | --- |
| Starting point | Tells the agent where to begin | "Go to https://example.com/login" |
| Action / path | The steps to perform on the page | "log in with the test account and open Settings" |
| Success condition | How the agent decides passed vs. failed | "confirm the page shows 'Profile updated'" |
| Extraction request | The named values to return | "report the email on file and the plan name" |

You don't need all four every time — a pure read-back has no action — but the more of these you supply, the more deterministic the run.

## Step 3 — Read the verdict and the extracted values

A run produces two things you care about: a **verdict** (did the objective succeed?) and **extracted values** (the structured data the agent pulled off the page).

The verdict is one of `passed`, `failed`, `error`, or `timeout`:

- **passed** — the agent met the success condition.
- **failed** — the agent finished but the success condition wasn't met (e.g., it expected a "Welcome" message that never appeared).
- **error** — something broke mid-run (a model issue, a navigation that threw).
- **timeout** — the run exceeded its time budget before finishing.

The extracted values are the named fields you asked for in the objective. Ask for "the article title and the number of comments" and the agent returns those as discrete, labeled pieces of data — not a wall of prose you have to regex. This is the difference between scraping and *asking*: you name the fields, the agent fills them in.

### See the machine-readable output with `--agent`

The human summary is friendly, but the moment you want to do anything programmatic — gate a CI job, feed another tool, log a run — switch to **agent mode**. Add `--agent` and BrowserBash emits **NDJSON**: one JSON object per line, no prose to parse.

```bash
browserbash run "Go to https://news.ycombinator.com, open the top story, and report the article title and the number of comments" --agent
```

You'll get a stream of step events as the agent works, then one terminal event. The step events look like this (one per line):

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Navigated to news.ycombinator.com"}
{"type":"step","step":2,"status":"passed","action":"click","remark":"Opened the top story"}
```

And the run finishes with a single `run_end` line carrying the verdict, a summary, the extracted values in `final_state`, and a duration:

```json
{"type":"run_end","status":"passed","summary":"Reported title and comment count for the top story","final_state":{"article_title":"...","comment_count":"..."},"duration_ms":18420}
```

That `final_state` object is where your extracted values live. The keys are derived from what you asked for — that's why naming the values clearly in the objective matters.

### Exit codes: the part CI actually reads

Every run sets a process exit code, and they map straight to the verdict:

| Exit code | Meaning |
| --- | --- |
| `0` | passed |
| `1` | failed |
| `2` | error |
| `3` | timeout |

So in a pipeline you don't even need to read the JSON to gate a job — `browserbash run "..." --agent` returns non-zero on anything that isn't a clean pass, and your CI step fails on its own. The NDJSON is there when you want the details.

## Step 4 — Record the run so you can prove what happened

When a run does something surprising, you want receipts. The `--record` flag captures a screenshot and a `.webm` session video using a bundled ffmpeg:

```bash
browserbash run "Go to https://news.ycombinator.com, open the top story, and report the article title and the number of comments" --record
```

After the run you get a video of the browser doing exactly what the agent decided, frame by frame. This is gold for debugging a `failed` verdict — you watch the agent click the wrong tab and instantly understand why your success condition wasn't met. (If you're on the `builtin` engine, `--record` also writes a Playwright trace alongside the video, which you can open in the Playwright trace viewer.)

### See it in the local dashboard

Prefer a UI to staring at terminal output? BrowserBash ships a **fully local** dashboard. It runs on your machine, on `localhost:4477`, and nothing is uploaded anywhere.

```bash
browserbash dashboard
```

Open the URL it prints and you'll see your run history with verdicts, steps, and any recordings. To open the dashboard automatically for a specific run, pass `--dashboard` on the `run` command itself:

```bash
browserbash run "Go to https://example.com and report the heading" --dashboard
```

Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at the most recent 200), so the dashboard is just a nice window onto data you already have locally.

## Step 5 — The flags you'll actually reach for

You've now used the important ones. Here's the working set for `browserbash run`, so you know what's in the box:

| Flag | What it does |
| --- | --- |
| `--provider <name>` | Where the browser runs: `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack` |
| `--engine <name>` | Who interprets the English: `stagehand` (default) or `builtin` |
| `--model <name>` | Pin the LLM, e.g. `ollama/qwen3`, `claude-opus-4-8`, `openai/gpt-4.1` |
| `--headless` | Run Chrome without a visible window |
| `--timeout <seconds>` | Cap how long the run may take before a `timeout` verdict |
| `--cdp-endpoint <ws-url>` | DevTools endpoint for the `cdp` provider |
| `--record` | Capture screenshot + `.webm` video (builtin engine also writes a Playwright trace) |
| `--dashboard` | Open the local dashboard for this run |
| `--upload` | Push this run to the cloud (requires `connect` first; opt-in) |
| `--agent` | Emit NDJSON instead of the human summary |

Two of these deserve a sentence each. The **engine** is the interpreter: `stagehand` (the default, MIT-licensed, by Browserbase) uses act/extract/observe primitives and self-heals when a page shifts; `builtin` is an in-repo Anthropic tool-use loop driving Playwright and is selected automatically for the LambdaTest and BrowserStack providers. The **model** is the brain; leaving it on `auto` and running Ollama keeps everything local and free.

### Pin a model explicitly

If you have several models around and want to be deliberate, name one:

```bash
browserbash run "Go to https://example.com and report the heading" --model ollama/qwen3
```

That removes all ambiguity from the `auto` resolution and is what I'd commit into a team script so everyone runs the same brain.

## Troubleshooting

Real failure modes you'll hit on your first day, and how to clear them.

### The agent wanders or gives up on a multi-step objective

Almost always the model is too small. A `<=8B` local model can navigate but loses the thread on long, multi-step flows — it'll do steps one and two, then forget the success condition. Move up to a mid-size local model (Qwen3 / Llama 3.3 70B-class) or point at a capable hosted model with `--model claude-opus-4-8` (set `ANTHROPIC_API_KEY` first). The objective text usually isn't the problem; the brain is.

### `browserbash: command not found` after install

The global npm bin directory isn't on your `PATH`. Run `npm bin -g` to see where global binaries land, then add that directory to your `PATH` in your shell profile. Reopen the terminal and `browserbash --version` should resolve.

### `--record` produces no video

Recording uses a bundled ffmpeg to mux the `.webm`. If your environment strips bundled binaries or you're in a locked-down container, the video step can fail while the run itself still passes. Confirm the run actually completed (check the verdict), and run somewhere ffmpeg can execute. The screenshot capture is lighter-weight and will usually still land even when video doesn't.

### Runs end in `timeout`

The default time budget was exceeded — common on slow pages or heavy flows. Raise it with `--timeout`, e.g. `--timeout 180` for three minutes. If timeouts persist on a *simple* objective, the model is likely deliberating too long per step; a faster or larger model often resolves it. Remember `timeout` exits with code `3`, so a flaky CI step here is the budget talking, not your objective.

### "No model available" or a key error on startup

You're not on the local path and no key is set. Either start Ollama and pull a model (free, local), or export `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` so `auto` can resolve a hosted model. The error message tells you exactly which path it's missing — read it; it's written to be actionable.

## When to use this

Reach for a one-shot `browserbash run` when you want a quick check or a single extraction — "is the pricing page showing the right plan names?", "did the login flow land on the dashboard?", "pull the order total off this confirmation page." It's the fastest way to turn a question about a live page into an answer.

When the flow becomes something you want to keep and re-run, graduate to committable markdown tests with `browserbash testmd run ./checkout_test.md`, where each list item is a step, `{{variables}}` template your inputs, and secret-marked values get masked as `*****` in every log line.

From here, a few good next stops:

- The full library of step-by-step lessons at [browserbash.com/tutorials](https://browserbash.com/tutorials).
- Deeper concept pieces — engines, providers, how the agent plans — at [browserbash.com/learn](https://browserbash.com/learn).
- More walkthroughs and write-ups on the [BrowserBash blog](https://browserbash.com/blog).
- The complete flag and provider matrix on the [features page](https://browserbash.com/features).
- The source, issues, and README on [GitHub](https://github.com/PramodDutta/browserbash).

## FAQ

### What is BrowserBash and how is it different from Playwright or Selenium?

BrowserBash is a free, open-source CLI that drives a real Chrome browser from a plain-English objective instead of hand-written selectors. With Playwright or Selenium you script every locator and assertion yourself; with BrowserBash an AI agent reads the page, decides the clicks, and returns a verdict plus structured values. It's complementary — you can even run it on the same machines as your existing suite.

### Do I need an API key or an account to run BrowserBash?

No on both counts. If you have Ollama running locally, the agent uses it for free and nothing leaves your machine, so there's no key and no account required. An account is only needed if you opt into the cloud dashboard via `browserbash connect` and `--upload`, which is entirely optional and off by default.

### Which model should I use for my first BrowserBash run?

If you're staying local and free, use a mid-size model in the Qwen3 or Llama 3.3 70B class — small models under about 8B tend to lose track of long, multi-step objectives. If your hardware can't run a mid-size model comfortably, set an Anthropic or OpenAI key and let `auto` resolve a capable hosted model for the harder flows. Leaving `--model` on the default `auto` picks the local path automatically when Ollama is available.

### How do I use BrowserBash output in a CI pipeline?

Add the `--agent` flag to emit NDJSON, one JSON object per line, with a terminal `run_end` event carrying the verdict and extracted values. The process also sets an exit code — 0 for passed, 1 for failed, 2 for error, 3 for timeout — so your CI step can gate on the exit code alone without parsing any prose. Most teams read the exit code to pass or fail the job and keep the NDJSON for logs.

---

Ready to run your own first objective? Install the CLI and point it at a page you care about:

```bash
npm install -g browserbash-cli
```

No account needed to run locally — but if you want the optional cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up). Now go write a sentence and watch a browser obey it.
