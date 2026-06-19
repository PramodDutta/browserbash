---
title: The free local BrowserBash dashboard
description: "A hands-on browserbash dashboard tutorial: open the local dashboard at localhost:4477, inspect the on-disk run store, use --dashboard on a run, and --clear it."
date: 2026-03-13
category: tutorial
---

By the end of this tutorial you'll be able to open the **browserbash dashboard** on your own machine, read every run you've executed from a clean on-disk store, pop a fresh run straight into that dashboard with a single flag, and wipe the whole thing when you want a blank slate. No account, no cloud, no API key for the dashboard itself — it runs at `localhost:4477` and never phones home. If you've been squinting at scrollback to remember whether last Tuesday's checkout run passed, this is the fix.

I'm going to pair with you the way I would at a desk: small steps, the exact command each time, and an honest read on what the output means. We'll stay on the free local path the whole way — the Ollama-first model story means a $0 model bill — and lean on the run store that BrowserBash already keeps for you at `~/.browserbash/runs`. [BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source CLI under Apache-2.0 from The Testing Academy, so everything below is runnable today on version 1.3.1.

## What you'll need

A short checklist before we touch the keyboard. Most of this you probably already have.

- **Node.js 18 or newer.** Check with `node -v`. BrowserBash ships as an npm package and needs a modern runtime.
- **Google Chrome** installed locally. The default `local` provider drives your own Chrome, and that's all this lesson uses.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

- **A free local model (recommended).** If you have [Ollama](https://ollama.com) running, BrowserBash picks it up first and nothing leaves your machine for the model call. A mid-size model like `qwen3` or a Llama 3.3 70B-class model is the sweet spot for multi-step flows. Very small local models (8B and under) get flaky on long objectives — fine for a two-step smoke test, shaky for a ten-step checkout.

That's it. The dashboard is fully local: no `bb_...` key, no `browserbash connect`, no account. The cloud dashboard is a separate, opt-in thing we'll point at but not need. Let's build.

## Step 1 — Confirm the install and the model path

First, make sure the CLI is on your PATH and check the version.

```bash
browserbash --version
```

You should see `1.3.1` or newer printed back. If the command isn't found, your global npm bin directory probably isn't on your PATH — jump to [Troubleshooting](#troubleshooting), then come back.

BrowserBash's default model is `auto`. It resolves in a fixed order: a local Ollama install wins first (free, no keys), then `ANTHROPIC_API_KEY` (Claude Opus), then `OPENAI_API_KEY` (GPT-4.1). If none of those is present you get a clear error telling you what to set. For this tutorial I want the free local path, so confirm Ollama is up:

```bash
ollama list
```

If you see a model listed — `qwen3`, a Llama 3.3 variant, whatever you pulled — you're set. If Ollama isn't installed, you can still follow along by exporting an `ANTHROPIC_API_KEY` and letting `auto` resolve to Claude; the dashboard behaves identically no matter which backend drove the run. The store, the port, and the flags are the same.

## Step 2 — Produce a couple of runs to look at

The dashboard reads from the run store, so before we open it, let's give it something to show. Every `browserbash run` you execute is recorded to disk automatically — you don't opt in, it just happens. Let's do two so the dashboard isn't lonely.

The first one is a plain smoke check on a stable public site:

```bash
browserbash run "Go to example.com and confirm the heading says 'Example Domain'"
```

You'll watch Chrome open, the agent navigate, and a verdict print at the end. Expect something like a `passed` status with a one-line summary — *"Heading 'Example Domain' is present on example.com"* — plus the structured final state the agent extracted. The exact wording varies by model, but the shape is consistent: a status, a human summary, and extracted values.

Now a second run that does a touch more, so the dashboard has variety:

```bash
browserbash run "On wikipedia.org, search for 'browser automation' and report the title of the first result"
```

This one navigates, types into the search box, submits, and reads back a title. On a mid-size local model it should land `passed` with the first result's title in the final state. If you're on a very small model and it wanders, that's expected — note the verdict either way, because seeing a `failed` run in the dashboard is genuinely useful for the next step.

Both runs are now sitting in your store whether they passed or failed. We didn't pass any special flag — recording is the default.

## Step 3 — Open the local dashboard

Here's the headline command. Start the dashboard:

```bash
browserbash dashboard
```

The CLI boots a small local web server and prints the URL. Open it in any browser:

```
http://localhost:4477
```

What you'll see is a list of your recent runs — the two you just executed at the top — each with its objective, status (passed / failed / error / timeout), a timestamp, and the duration. Click into a run and you get the detail view: the step-by-step actions the agent took, its remarks, the final extracted state, and any artifacts that run produced. This is the same data the CLI printed to your terminal, just persisted and browsable instead of scrolled past.

A few things worth internalizing about the dashboard:

- **It's fully local.** Port `4477`, your machine, no network calls out. Nothing about opening the dashboard uploads anything.
- **It reads the store, it isn't the store.** The dashboard is a viewer over `~/.browserbash/runs`. Close it and the data stays; reopen it and the data is still there.
- **It's live to new runs.** Leave it open, run another objective in a second terminal, refresh — the new run shows up.

Leave the dashboard running and open a second terminal for the next step. To stop the server later, `Ctrl+C` in the terminal where it's running.

## Step 4 — Send a run straight to the dashboard with `--dashboard`

Switching terminals to start the dashboard, then switching back, gets old fast. The `--dashboard` flag on `run` collapses that: it executes the objective and opens the local dashboard on that run in one shot. In your second terminal:

```bash
browserbash run "Go to news.ycombinator.com and report the title of the top story" --dashboard
```

The run executes as normal — Chrome opens, the agent works, the verdict prints — and then the local dashboard comes up focused on this run, so you land directly on its detail view instead of scanning a list. It's the fastest way to go from "did that work?" to "let me actually look at what it did," and it's the flag I reach for during development when I'm iterating on a tricky objective.

`--dashboard` and the standalone `browserbash dashboard` command point at the same `localhost:4477` and the same store. The difference is purely ergonomic: one is "run, then show me this run," the other is "just show me everything."

### Pairing `--dashboard` with `--record`

A run is more inspectable when there's something to watch. Add `--record` and BrowserBash captures a screenshot plus a `.webm` session video using its bundled ffmpeg (and on the `builtin` engine, a Playwright trace too). Combine the two:

```bash
browserbash run "Log in at the demo site with the test account and confirm the dashboard loads" --record --dashboard
```

Now the dashboard entry for this run has artifacts attached — you can replay exactly what the agent saw. This is the combination I use when a flow fails intermittently and I need eyes on the actual pixels, not just the agent's text remarks. If `--record` errors about ffmpeg, see [Troubleshooting](#troubleshooting).

## Step 5 — Understand the run store on disk

The dashboard is a window; the run store is the house. Knowing where it lives makes everything else make sense.

Every run is kept on-disk at `~/.browserbash/runs`. Have a peek:

```bash
ls -lt ~/.browserbash/runs
```

You'll see one entry per run, newest first. Three properties matter:

- **Secrets are masked.** Any value you marked as a secret in a markdown test, or that the CLI recognizes as sensitive, is stored as `*****` — never in the clear. The store is safe to glance at without leaking credentials.
- **It's capped at 200 runs.** BrowserBash keeps your most recent 200 and rolls off the oldest beyond that, so the store can't grow without bound. The dashboard shows whatever's currently in the cap.
- **It's plain on-disk data.** This is why the dashboard can be a thin local viewer with no database and no account: the source of truth is already sitting in your home directory.

This local store is also what the optional cloud path builds on. If you ever run `browserbash connect --key bb_...` and add `--upload` to a specific run, *that one run* gets promoted to a shareable cloud page (free cloud runs are kept 15 days). Without `--upload`, nothing leaves your machine — the cloud and the local dashboard are completely independent, and this entire tutorial never needs the cloud at all. If you want the team-sharing angle later, the [cloud dashboard upload walkthrough](https://browserbash.com/tutorials) covers it.

## Step 6 — Wipe the store with `--clear`

Sometimes you want a clean slate — before a demo, before recording a screencast, or just to drop a pile of throwaway experiments. The `dashboard` command takes a `--clear` flag that wipes the run store:

```bash
browserbash dashboard --clear
```

This empties `~/.browserbash/runs`. Run it, then reopen the dashboard, and you'll see an empty list — every prior run is gone. It's a deliberate, manual action: BrowserBash never clears the store on its own beyond the 200-run cap, so your history sticks around until you decide otherwise.

A word of caution, since this is destructive: `--clear` wipes *everything* in the store, not a single run. There's no per-run delete and no undo. If a run is one you want to keep beyond the local cap, that's exactly the case where the opt-in `--upload` cloud page earns its place — promote it before you clear. For day-to-day local work, though, `--clear` is the reset button you'll use without thinking twice.

## The dashboard flags at a glance

Here's the full surface this tutorial touched, accurate to the CLI. These are the only dashboard-related flags that exist — there's no `--port`, no `--export`, no invented options.

| Command / flag | What it does |
| --- | --- |
| `browserbash dashboard` | Starts the fully local dashboard server at `localhost:4477`, reading from the on-disk run store. |
| `browserbash dashboard --clear` | Wipes the entire local run store at `~/.browserbash/runs`. Destructive, manual, no undo. |
| `browserbash run "<objective>" --dashboard` | Executes the objective, then opens the local dashboard focused on that run. |
| `browserbash run "<objective>" --record` | Captures a screenshot + `.webm` session video (builtin engine also writes a Playwright trace) — artifacts then show in the dashboard run detail. |
| `browserbash connect --key bb_...` | Links your machine to the optional cloud dashboard. Not needed for the local dashboard. |
| `browserbash run "<objective>" --upload` | Pushes that single run to a cloud page (requires `connect`). Without it, nothing leaves your machine. |

The run store itself sits at `~/.browserbash/runs`: secrets masked, capped at 200 runs, populated automatically by every `run` whether or not you ever open the dashboard.

## Troubleshooting

Real failure modes I've hit, and the fixes.

### `browserbash: command not found`

The package installed but its global bin directory isn't on your PATH. Confirm where npm puts globals with `npm bin -g`, then add that directory to your PATH in your shell profile. As a quick check that the package is actually present, `npm ls -g browserbash-cli` should list `1.3.1` or newer. Reinstalling with `npm install -g browserbash-cli` is the fast path if the listing is empty.

### The dashboard opens but the run list is empty

You haven't recorded any runs yet, or you just ran `--clear`. The dashboard only shows what's in `~/.browserbash/runs`. Execute a `browserbash run "..."` first — recording is automatic — then refresh `localhost:4477`. If you're certain you've run things and the list is still empty, check you're looking at the same home directory user that executed the runs (running under `sudo` writes to root's home, not yours).

### `--record` fails or produces no video

`--record` relies on the ffmpeg binary that BrowserBash bundles. If recording errors, the run itself still completes and is stored — you just lose the artifacts. Re-run without `--record` to confirm the objective is fine, then reinstall the CLI so the bundled ffmpeg is freshly unpacked. The dashboard will still show the run; it just won't have a video attached.

### A small local model keeps producing `failed` or `error` runs

This is the honest caveat with local models. Very small models (8B and under) are flaky on long, multi-step objectives — they lose the thread halfway through a checkout. The run still lands in the dashboard with its `failed`/`error` status, which is useful diagnostic data. The fix is model choice, not the dashboard: step up to a mid-size local model (Qwen3 or a Llama 3.3 70B-class) via `--model ollama/qwen3`, or pin a capable hosted model for the hard flows. The [choosing a model guide](https://browserbash.com/learn) walks through the trade-offs.

### Runs you expected are missing from the dashboard

Remember the store is capped at 200 runs. If you've blasted through hundreds of quick experiments, the oldest have rolled off — that's by design, not a bug. Anything you need to keep past the cap should be promoted with the opt-in `--upload` flow before it ages out, since the local store doesn't archive beyond 200.

## When to use this

Reach for the local dashboard whenever you're iterating and want to *see* what the agent did rather than re-reading terminal scrollback. It's perfect for local development, debugging a flaky objective with `--record`, or giving yourself a tidy history of what you've tried. Because it's fully local and free, there's zero reason not to leave `browserbash dashboard` running in a spare terminal while you work.

Once you're comfortable here, a few natural next steps:

- New to the CLI entirely? Start with the [BrowserBash tutorials hub](https://browserbash.com/tutorials) and the [Learn center](https://browserbash.com/learn) for the fundamentals.
- Want to turn these ad-hoc runs into committable, repeatable tests? Markdown tests (`browserbash testmd run ./flow_test.md`) give you `{{variables}}`, `@import` composition, and masked secrets — a great companion to the dashboard.
- Ready to share a run with a teammate? The opt-in cloud path (`browserbash connect` then `--upload`) promotes a single run to a shareable page. Browse more walkthroughs on the [BrowserBash blog](https://browserbash.com/blog).

## FAQ

### What is the BrowserBash dashboard?

The BrowserBash dashboard is a free, fully local web view of your run history. You start it with `browserbash dashboard`, open `localhost:4477` in any browser, and browse every run you've executed — objective, status, steps, and extracted state. It reads from the on-disk run store and never sends data anywhere, so no account or API key is required to use it.

### Where does BrowserBash store its runs?

Every run is kept on disk at `~/.browserbash/runs`, written automatically whether or not you ever open the dashboard. Secrets are masked as `*****`, and the store is capped at the 200 most recent runs, with older ones rolling off. The dashboard is simply a viewer over this folder, which is why it needs no database or login.

### How do I clear the BrowserBash run history?

Run `browserbash dashboard --clear` to wipe the entire local run store at `~/.browserbash/runs`. It's a deliberate, manual action with no undo and no per-run option — it clears everything. If a run matters beyond the local 200-run cap, promote it with the opt-in `--upload` flow before clearing.

### Is the BrowserBash dashboard free and does it need an account?

Yes, the local dashboard is completely free and needs no account, no key, and no internet connection. It runs on your machine at `localhost:4477` and reads only your local run store. The separate cloud dashboard is opt-in and only activates when you run `browserbash connect` and add `--upload` to a specific run.

---

That's the whole local loop: run, inspect at `localhost:4477`, `--dashboard` for the fast path, and `--clear` for a reset — all free and all on your machine. Install it and try the two runs above:

```bash
npm install -g browserbash-cli
```

No account needed to run anything, but if you want the optional cloud page for sharing later, grab a free key at [browserbash.com/sign-up](https://browserbash.com/sign-up).
