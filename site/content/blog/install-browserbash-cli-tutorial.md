---
title: Install BrowserBash CLI: the complete setup guide
description: "Install BrowserBash CLI on macOS, Linux, or Windows: Node and Chrome prerequisites, npm global install, verifying, a first sanity run, and uninstall."
date: 2026-01-06
category: tutorial
---

By the end of this guide you will install BrowserBash CLI, confirm it runs, drive a real Chrome browser with a single plain-English objective, and know how to remove it cleanly if you ever need to. To **install BrowserBash CLI** you run one npm command, but a setup that works on the first try depends on two things being in place first: a current Node.js and a real Chrome (or Chromium) on the machine. We will get both sorted, then run a sanity check that proves the whole pipeline — CLI, browser, and model — is wired up correctly.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from [The Testing Academy](https://browserbash.com). You write a plain-English objective — "go to the login page, sign in with these credentials, and confirm the dashboard loads" — and an AI agent drives an actual Chrome browser step by step. No selectors, no page objects, no waiting on `data-testid` attributes. The agent reads the live page on each step, decides what to do, and hands you back a pass/fail verdict plus any structured values it extracted. This tutorial is the front door: the thing you do once before any of the other workflows make sense.

A senior-SDET note up front, because it will save you a confused half-hour later: BrowserBash is **Ollama-first**. The default model setting is `auto`, and on a machine with a local Ollama running, it uses that — free, no API keys, and nothing leaves your laptop. That is the path we will take in the examples below, because it is the one with a $0 model bill. If you do not run a local model, BrowserBash falls back to a hosted key if you have one. Either way, the install is identical; only the model resolution differs.

## What you'll need

Before the `npm install`, line up the prerequisites. None of this is exotic — if you have done any Node work you probably have most of it already.

| Requirement | Minimum | Why it's needed |
| --- | --- | --- |
| Node.js | 18 or newer | The CLI is a Node package; older runtimes will not load it. |
| npm | Ships with Node | Installs the global `browserbash` command. |
| Google Chrome or Chromium | Any recent stable | The default `local` provider drives your real Chrome. |
| A model backend | Ollama (free) *or* an API key | Something has to interpret your English. Ollama is the zero-cost default. |
| Disk + RAM for a local model | ~8 GB+ free, 16 GB RAM ideal | Only if you run Ollama locally. Skip if you use a hosted key. |

The examples in this guide use the free local path: your own Chrome as the browser, and a local Ollama model as the brain. You do not need a BrowserBash account, a credit card, or any provider keys to complete every step here.

### Check Node first

Run this before anything else:

```bash
node --version
```

You want `v18.x` or higher — `v20` or `v22` is ideal. If you see `v16` or lower, or "command not found," install or upgrade Node first. On macOS the cleanest route is `nvm`:

```bash
nvm install 20
nvm use 20
```

On Windows, grab the LTS installer from nodejs.org; on Debian/Ubuntu, use NodeSource or `nvm` rather than the distro's stale `apt` package, which often lags well behind 18.

### Confirm Chrome is present

The default provider, `local`, launches the Chrome already installed on your machine. On macOS and Windows, if you can open Chrome by hand, you are set. On a headless Linux box or a CI runner you may have Chromium instead of Chrome — that is fine; either works. If you have neither, install Google Chrome or `chromium-browser` before continuing, because the local provider has no browser to drive without one.

## Step 1 — Install BrowserBash CLI globally

This is the line everyone comes for. Install the package globally so the `browserbash` command lands on your PATH:

```bash
npm install -g browserbash-cli
```

npm downloads [browserbash-cli](https://www.npmjs.com/package/browserbash-cli) and its dependencies, links the binary, and prints a short tree ending in something like `+ browserbash-cli@1.3.1`. The current version is **1.3.1**. If npm warns about your global prefix needing elevated permissions, do *not* reflexively reach for `sudo`. The cleaner fix is to point npm's global prefix at a directory you own — or just use `nvm`, which sidesteps the whole permissions question by keeping Node and its globals in your home folder.

### Verify the binary resolved

Confirm the shell can actually find the command:

```bash
browserbash --version
```

You should see `1.3.1` printed back. If instead you get "command not found," your npm global `bin` directory is not on your PATH. Find where npm put it with `npm bin -g`, then add that directory to your shell profile's PATH and open a new terminal. This is the single most common install hiccup, and it is a PATH problem, not a BrowserBash problem.

## Step 2 — See the available commands

Before running anything, get oriented. The help output lists every command and is the fastest way to confirm the install is healthy:

```bash
browserbash --help
```

You will see the core commands. Here is the full surface so you know what each one is for:

| Command | What it does |
| --- | --- |
| `browserbash run "<objective>"` | One-shot: run a single plain-English objective and print a verdict. |
| `browserbash testmd run ./file_test.md` | Run a committable Markdown test file, step by step. |
| `browserbash dashboard` | Open the local, fully offline dashboard at localhost:4477. |
| `browserbash connect --key bb_...` | Link the optional cloud dashboard (opt-in, free runs kept 15 days). |

We will use `run` for the sanity check, because it is the smallest possible end-to-end exercise of the whole stack.

## Step 3 — Set up a model (the free local path)

Something has to interpret your English and decide what to click. BrowserBash resolves the model in a fixed order when the setting is `auto` (the default):

1. A local **Ollama** install → `ollama/<model>`. Free, no keys, nothing leaves your machine.
2. An `ANTHROPIC_API_KEY` in the environment → `claude-opus-4-8`.
3. An `OPENAI_API_KEY` in the environment → `openai/gpt-4.1`.
4. None of the above → an error that tells you how to fix it.

For the zero-cost path, install Ollama and pull a model. The honest caveat: very small local models (8B and under) are flaky on long, multi-step objectives — they lose the plot halfway through a flow. The sweet spot for reliable runs is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. For a first sanity run, a smaller model is fine because the objective is trivial.

```bash
ollama pull qwen3
```

That is all the model setup you need. You did not touch a BrowserBash config file, and you set no API keys. With Ollama running, `auto` will find it.

### If you'd rather use a hosted model

Prefer not to run anything locally? Export one key and `auto` picks it up — no flag needed:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Now `auto` resolves to `claude-opus-4-8`. You can also pin any backend explicitly per run with `--model`, which we cover in Step 5.

## Step 4 — Your first sanity run

Time to prove the pipeline end to end. This single command launches your Chrome, navigates, reads the page, and returns a verdict:

```bash
browserbash run "Go to https://example.com and confirm the page heading says 'Example Domain'"
```

Watch what happens. A Chrome window opens (this is the default `local` provider). The agent navigates to the URL, reads the rendered page, checks the heading against your objective, and closes out. In your terminal you get a human-readable summary — a passed verdict, the steps the agent took, and any values it pulled out. For this objective the verdict reads as passed with a remark confirming the heading matched. That round trip — CLI → real Chrome → model → verdict — is the entire product in miniature. If this works, your install is genuinely done.

### Watch it run, then run it headless

By default the run is visible, which is exactly what you want the first time — seeing Chrome actually drive itself is the moment it clicks. Once you trust it, run headless for speed and for CI, where there is no display:

```bash
browserbash run "Go to https://example.com and confirm the page heading says 'Example Domain'" --headless
```

Same verdict, no visible window. On a CI runner, `--headless` is mandatory because there is no screen to draw on.

### Capture evidence of the run

When you want proof of what happened — for a bug report, a flaky-test investigation, or just a record — add `--record`:

```bash
browserbash run "Go to https://example.com and confirm the page heading says 'Example Domain'" --record
```

This writes a screenshot and a `.webm` session video using the bundled ffmpeg. (With the `builtin` engine, `--record` also writes a Playwright trace you can open in the trace viewer.) Every run is also saved on disk regardless, at `~/.browserbash/runs`, with secrets masked and the store capped at the 200 most recent runs — so you always have a history to look back on even without `--record`.

## Step 5 — Know your flags

The `run` command takes a small, sharp set of flags. You do not need most of them for local work, but knowing they exist saves you from inventing workarounds. These are the real flags — there are no others:

| Flag | Purpose |
| --- | --- |
| `--provider` | Where the browser runs: `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack`. |
| `--engine` | Who interprets the English: `stagehand` (default) or `builtin`. |
| `--model` | Pin a backend, e.g. `ollama/qwen3`, `claude-opus-4-8`, `openai/gpt-4.1`. |
| `--headless` | Run without a visible browser window. |
| `--timeout <seconds>` | Cap the run; useful when a slow page or model could hang. |
| `--cdp-endpoint <ws-url>` | DevTools endpoint for the `cdp` provider. |
| `--record` | Save a screenshot and `.webm` video (and a trace on the builtin engine). |
| `--dashboard` | Open the local dashboard for this run. |
| `--upload` | Push this run to the cloud (requires `connect` first; otherwise nothing leaves your machine). |
| `--agent` | Emit NDJSON — one JSON object per line — for CI and AI coding agents. |

A worked example pinning the model explicitly, so there is no ambiguity about what drove the run:

```bash
browserbash run "Open https://example.com and read the first paragraph" --model ollama/qwen3
```

The two engines are worth a sentence each. `stagehand` (the default, MIT, by Browserbase) uses act/extract/observe/agent primitives and self-heals as pages change. `builtin` is an in-repo Anthropic tool-use loop driving Playwright, and it is selected automatically for the LambdaTest and BrowserStack providers. For local work, the default is the right call — leave `--engine` alone until you have a reason.

## Step 6 — Optional: open the local dashboard

Everything above is terminal-only, and stays on your machine. If you would rather see your runs in a UI, BrowserBash ships a fully local dashboard — no account, no network:

```bash
browserbash dashboard
```

This serves a dashboard at `localhost:4477`, reading from the same on-disk run store. It is entirely offline. If you ever want a clean slate, `browserbash dashboard --clear` wipes the store. There is also an *optional* cloud dashboard for sharing runs with a team — you link it with `browserbash connect --key bb_...` and then pass `--upload` on the runs you choose to push. That is strictly opt-in: without `connect` and `--upload`, nothing ever leaves your machine. Free cloud runs are retained for 15 days.

## Troubleshooting

Most install problems fall into a handful of buckets. Here are the ones you are most likely to hit, with the actual fix.

**`browserbash: command not found` after a clean install.** The package installed, but its binary directory is not on your PATH. Run `npm bin -g` to see where npm puts global binaries, add that path to your shell profile (`.zshrc`, `.bashrc`, or the Windows PATH), and open a new terminal. If you used `nvm`, make sure the same Node version is active in the new shell — switching versions hides globals installed under a different one.

**An error about no model being configured.** This means `auto` found nothing to resolve to: no Ollama running, and no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the environment. Either start Ollama and pull a model (`ollama pull qwen3`), or export a hosted key. The error message itself tells you which keys it looked for — read it; it is guidance, not just a failure.

**The agent wanders or gives up on a multi-step objective.** Nine times out of ten this is a too-small local model. Models at 8B and under are unreliable on long flows — they forget earlier steps and loop. Switch to a mid-size local model (Qwen3 or Llama 3.3 70B-class) with `--model`, or use a capable hosted model for the hard flows. The install is fine; the brain is too small for the task.

**`--record` produces nothing or errors about ffmpeg.** Recording uses the bundled ffmpeg to write the `.webm` video. If your environment strips or blocks it, fix ffmpeg availability on the box, or drop `--record` and rely on the always-on run store at `~/.browserbash/runs` plus a `--headless`-off visual run for evidence.

**A run hangs on a slow page or a slow model.** Add `--timeout <seconds>` so a stuck run fails cleanly instead of blocking forever. In CI especially, always set a timeout — combined with `--agent`, a timeout produces exit code 3, which your pipeline can branch on without parsing any prose.

## When to use this

You install once; you use it everywhere after. Now that the CLI is working, here is where to go next depending on what you are trying to do:

- Want committable, reviewable tests instead of one-off commands? Read the [Markdown test files tutorial](https://browserbash.com/tutorials) and start writing `*_test.md` files your whole team can diff in a pull request.
- Wiring this into CI or an AI coding agent? The `--agent` NDJSON mode and exit codes (0 passed, 1 failed, 2 error, 3 timeout) are built for exactly that — no prose parsing required.
- Curious what else the agent can do beyond a sanity check? Browse the [Learn hub](https://browserbash.com/learn) for the concepts, and the [features overview](https://browserbash.com/features) for the full capability map.
- Want more worked examples? The [BrowserBash blog](https://browserbash.com/blog) has end-to-end walkthroughs for login flows, data extraction, and synthetic monitoring.

The whole point of getting the install right is that none of those next steps fight you — you have already proven Chrome, the CLI, and a model all talk to each other.

## FAQ

### How do I install BrowserBash CLI?

Run `npm install -g browserbash-cli` with Node 18 or newer already on your machine. That puts the `browserbash` command on your PATH globally. You also need Chrome or Chromium installed for the default local provider, and a model backend — a local Ollama install works for free with no keys.

### Do I need an API key or account to use BrowserBash?

No. There is no account required to run, and on a machine with a local Ollama model nothing leaves your laptop and there is no model bill. An API key (Anthropic or OpenAI) is only needed if you prefer a hosted model over a local one. The optional cloud dashboard needs a key, but the CLI and the local dashboard do not.

### What are the prerequisites for installing BrowserBash CLI?

You need Node.js version 18 or higher with npm, and Google Chrome or Chromium for the default local provider that drives your real browser. You also need a model to interpret your English — either a local Ollama install for the free path, or a hosted API key. That is the entire list; there is no separate runtime or service to stand up.

### How do I uninstall BrowserBash CLI?

Run `npm uninstall -g browserbash-cli` to remove the global command. If you also want to clear local data, the run store lives at `~/.browserbash/runs`, and `browserbash dashboard --clear` wipes the dashboard store before you uninstall. Removing the npm package leaves your Node, Chrome, and Ollama untouched.

Ready to set it up? Install with `npm install -g browserbash-cli`, run your first objective, and you are done. An account is optional and only needed for the cloud dashboard — [sign up here](https://browserbash.com/sign-up) if and when you want it.
