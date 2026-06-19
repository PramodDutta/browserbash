---
title: Connect and upload runs to the BrowserBash cloud dashboard
description: "A hands-on browserbash connect upload tutorial: link a key, push runs with --upload, keep privacy opt-in, and share 15-day run pages."
date: 2026-03-17
category: tutorial
---

By the end of this browserbash connect upload tutorial you'll be able to link your laptop to a BrowserBash cloud workspace, push a single run to the cloud with one flag, and hand a teammate a shareable URL of exactly what the agent saw and did. The important word is *opt-in*: nothing leaves your machine until you both connect a key **and** pass `--upload` on a specific run. No connect, no upload. No `--upload`, no upload. That's the whole privacy contract, and we'll prove it as we go.

This is the same `browserbash` CLI you already use to drive a real Chrome with a plain-English objective. Connecting to the cloud doesn't change how runs work — the agent still reads the page, acts, and returns a verdict locally. Uploading just copies the *result* of a run you choose to a hosted dashboard so it survives past your terminal scrollback and can be opened by someone who isn't sitting at your keyboard. Free cloud runs are kept for 15 days, which is plenty for a "did staging break overnight?" link in Slack without turning into a data-retention liability.

We'll go from a clean install to a connected workspace, push a run, read the shareable page, wire `--upload` into a CI job, and pull the cord back out when you want everything local again. Every command below is copy-paste runnable.

## What you'll need

A short checklist before the first command:

- **Node.js >= 18.** Check with `node --version`. BrowserBash is an npm global.
- **Google Chrome installed.** The default `local` provider drives your real Chrome. Cloud upload does **not** require a cloud *browser* — your browser still runs locally; only the run record is pushed.
- **The CLI installed:** `npm install -g browserbash-cli` (latest is 1.3.1).
- **A model the agent can think with.** The default `--model auto` resolves in order: a local **Ollama** model first (free, nothing leaves your machine), then `ANTHROPIC_API_KEY` (Claude), then `OPENAI_API_KEY`. We'll use the free Ollama path in examples. A mid-size local model (Qwen3 or a Llama 3.3 70B-class model) is the sweet spot; very small models (<=8B) get flaky on long multi-step objectives.
- **A connect key** in the form `bb_...`. You get this from your BrowserBash account at [browserbash.com/sign-up](https://browserbash.com/sign-up) (creating an account is only needed for the *cloud* dashboard — running BrowserBash never requires one).

Install and sanity-check in one go:

```bash
npm install -g browserbash-cli
browserbash --version
```

You should see `1.3.1` printed. If `browserbash: command not found` shows instead, your npm global bin directory isn't on `PATH` — jump to Troubleshooting.

## Step 1 — Run something locally first (the baseline)

Before touching the cloud, confirm a normal local run works and produces a record. This is the thing we'll later push.

```bash
browserbash run "go to example.com and confirm the page heading says 'Example Domain'"
```

The agent launches your Chrome, navigates, reads the heading, and prints a human-readable verdict — something like `PASSED — heading text matched "Example Domain"` plus any structured values it extracted. Whether it passes or fails, the run is saved on disk at `~/.browserbash/runs` (secrets masked, store capped at 200 runs). Nothing has gone to the cloud. There's no connect key set, no `--upload` flag — so this run is 100% local, which is exactly the default.

Open the local dashboard to see it if you like — this is the free, fully-local viewer:

```bash
browserbash dashboard
```

That serves on `localhost:4477` and reads straight from `~/.browserbash/runs`. It never calls out to the internet. Keep this in mind: the *local* dashboard and the *cloud* dashboard are different things. The local one is always free and always private; the cloud one is the opt-in service we connect next.

## Step 2 — Connect your cloud key

Grab your key from the account dashboard. It looks like `bb_live_xxx`. Link this machine to your workspace:

```bash
browserbash connect --key bb_live_REPLACE_WITH_YOUR_KEY
```

On success you'll see a confirmation that the machine is linked to your workspace (the key is stored in your BrowserBash config so you don't pass it on every run). This step **does not upload anything** — it only registers the credential. Think of `connect` as plugging in the cable; no data flows until you actually send a run.

A couple of things worth knowing:

- Run `connect` once per machine. It persists, so a fresh terminal tomorrow is still connected.
- The key is a workspace credential — treat it like any secret. Don't commit it. In CI, inject it from a secrets store (we do this in Step 6).
- Connecting changes nothing about *how* runs execute. Same engine, same provider, same model resolution. You've only earned the *right* to upload.

## Step 3 — Upload a single run with `--upload`

Now the payoff. Re-run an objective and add `--upload`:

```bash
browserbash run "go to example.com and confirm the page heading says 'Example Domain'" --upload
```

The run executes locally exactly as before. When it finishes, the CLI pushes that one run's record — steps, verdict, extracted values, and any captured artifacts — to your cloud workspace and prints a shareable URL back in the terminal. Open it in any browser and you'll see the run page: the objective, each step the agent took, the final pass/fail status, and the structured `final_state` it returned.

The mental model to lock in:

- `--upload` is **per run**. It uploads *this* invocation and nothing else. The next run with no flag stays local.
- `--upload` **requires** a prior `connect`. If you pass it without connecting, the CLI errors and tells you to run `browserbash connect --key bb_...` first. It will not silently send anything.
- Without `--upload`, **nothing leaves your machine** — the run record lives only in `~/.browserbash/runs`.

That's the opt-in privacy contract in three bullets. You can run a hundred sensitive flows locally and upload only the one safe smoke test you want to share.

### Upload a richer run with artifacts

A shareable page is far more useful with a screenshot and a session video attached. Add `--record`:

```bash
browserbash run "log in at staging.example.com with the demo account and confirm the dashboard loads" \
  --record \
  --upload
```

`--record` captures a screenshot plus a `.webm` session video via the bundled ffmpeg (on the `builtin` engine it also writes a Playwright trace). With `--upload`, those artifacts ride along to the cloud run page, so the teammate you send the link to can actually *watch* what happened rather than read a transcript. Realistic verdict on success: `PASSED — dashboard heading "Welcome back" visible after login`, with the video embedded on the run page.

## Step 4 — Read the shareable run page

Open the URL the CLI printed. A cloud run page typically shows:

- The **objective** you wrote, verbatim.
- An ordered list of **steps** with each action and a short remark (navigate, click, type, extract, and so on).
- The **final verdict**: `passed`, `failed`, `error`, or `timeout`.
- The **extracted values** (`final_state`) — the structured data the agent pulled out, like an order number or a displayed total.
- **Artifacts** when you ran with `--record`: the screenshot and the `.webm` video.

This is the bit that makes async debugging humane. Instead of pasting a wall of log text into Slack, you drop one link. Whoever opens it sees the same thing you saw. Free cloud runs are retained for **15 days** — after that the page expires and the record ages out, which is the point: it's a sharing surface, not an archive. If you need a run forever, the on-disk copy in `~/.browserbash/runs` is still yours and is unaffected by cloud retention.

## Step 5 — Know exactly what travels (and what doesn't)

Here's the upload behavior matrix, because "what leaves my machine" is the whole reason this feature is opt-in:

| Situation | Connected? | `--upload` passed? | Result |
| --- | --- | --- | --- |
| Plain `run` | No | No | Fully local. Saved to `~/.browserbash/runs` only. |
| Plain `run` after connecting | Yes | No | Still fully local. Connecting alone uploads nothing. |
| `run --upload` without connecting | No | Yes | Error — CLI tells you to `connect` first. Nothing sent. |
| `run --upload` after connecting | Yes | Yes | This run's record (and `--record` artifacts) pushed to cloud; URL printed. |
| `dashboard` | n/a | n/a | Local viewer on `localhost:4477`. Never calls the cloud. |

And the flags that matter for this lesson, accurate to the CLI surface:

| Flag / command | What it does |
| --- | --- |
| `browserbash connect --key bb_...` | Links this machine to your cloud workspace. Uploads nothing by itself. |
| `--upload` (on `run`) | Pushes **this one run** to the cloud. Requires a prior `connect`. |
| `--record` | Captures a screenshot + `.webm` video (builtin engine also writes a Playwright trace). Artifacts upload when combined with `--upload`. |
| `--dashboard` | Opens the **local** dashboard on this run. Separate from cloud upload. |
| `--agent` | Emits NDJSON (one JSON object per line) for CI and AI coding agents. Composes with `--upload`. |
| `--headless` | Runs Chrome without a visible window. Common in CI. |
| `--timeout <seconds>` | Caps the run. On overrun the run ends with status `timeout` (exit code 3). |

Secrets are masked in the run store and in logs. If you use markdown tests, secret-marked `{{variables}}` show as `*****` in every log line, so a credential never appears in an uploaded record.

## Step 6 — Wire `--upload` into CI

The most useful place for upload is an automated job: a smoke test runs on a schedule, and when it fails you want a link you can click, not a log file you have to reconstruct. Combine `--agent` (machine-readable output and clean exit codes) with `--upload` (the shareable page).

A minimal CI step:

```bash
# In CI: connect once using a secret, then run with --upload
browserbash connect --key "$BROWSERBASH_KEY"

browserbash run "open https://staging.example.com and confirm the pricing page lists the Pro plan" \
  --headless \
  --record \
  --agent \
  --upload
```

`--agent` makes the CLI emit NDJSON — progress lines like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"opened staging.example.com"}` followed by a terminal `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":18243}`. Your pipeline reads exit codes directly: `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing. Meanwhile `--upload` posts the run so the failure notification can carry the run-page URL.

Store `BROWSERBASH_KEY` in your CI provider's secrets — never in the YAML. For the model in CI, pin it explicitly so a runner without Ollama doesn't fall through to an error; for example add `--model claude-opus-4-8` with `ANTHROPIC_API_KEY` set, or point at a hosted Ollama with `OLLAMA_BASE_URL`. If you want the full CI walkthrough, the [BrowserBash tutorials hub](https://browserbash.com/tutorials) has provider-specific guides.

## Step 7 — Disconnect when you want everything local again

Cloud upload is opt-in and reversible. If you stop passing `--upload`, you're already back to fully-local behavior — the connect key sits idle and does nothing on its own. There is no background sync; the CLI only ever uploads on a run you explicitly flag. So "going local" is as simple as dropping the flag.

If you want to verify you're not uploading, run any objective without `--upload` and confirm the terminal prints a verdict but **no** cloud URL. Then open `browserbash dashboard` and you'll see the run sitting in the local store — present locally, absent from the cloud. That's the contract holding.

## Troubleshooting

Real failure modes you'll hit, and the fix for each.

### `--upload` errors with "not connected"

You passed `--upload` before ever running `connect` on this machine (or on a fresh CI runner that doesn't share your laptop's config). Run `browserbash connect --key bb_...` first, then re-run with `--upload`. In CI, make `connect` its own step before any uploading run, and pull the key from a secret. The CLI fails loud here on purpose — it would rather error than guess that you wanted to send data.

### The shareable link 404s or looks empty

Two common causes. First, **retention**: free cloud runs expire after 15 days, so an old link will eventually stop resolving — that's expected, re-run and upload fresh. Second, **missing artifacts**: if the page has steps but no video, you uploaded without `--record`. Re-run with `--record --upload` to attach the screenshot and `.webm`.

### `--record` produces no video / ffmpeg error

`--record` uses a bundled ffmpeg to write the `.webm` session video. If your environment strips bundled binaries (some locked-down CI images do) or a sandbox blocks the encoder, the video step can fail while the run itself still passes. Confirm the run works without `--record` first, then ensure ffmpeg can execute in that environment. On the `builtin` engine you also get a Playwright trace, which is a useful fallback when video won't encode.

### The agent flails on a long flow before there's anything worth uploading

This is almost always the model, not the upload path. Very small local models (<=8B) lose the plot on long multi-step objectives — they'll wander, and you'll upload a `failed` run that isn't your app's fault. Switch to a mid-size local model (Qwen3 / Llama 3.3 70B-class) with `--model ollama/qwen3`, or pin a capable hosted model like `--model claude-opus-4-8` for hard flows. Then upload. See the [learn hub](https://browserbash.com/learn) if you're unsure what your machine can run.

### Runs end in `timeout` (exit code 3) in CI

Headless CI runners are slower than your laptop, and a default timeout that's fine locally can clip a real flow. Raise it with `--timeout 180` (seconds) for heavier objectives, and keep objectives tight — one clear goal per run uploads cleaner than a sprawling ten-step epic. A `timeout` status still uploads, so you'll at least get a run page showing how far the agent got.

## When to use this

Reach for connect + `--upload` when a run needs an audience beyond your terminal: a scheduled smoke test whose failures should land as a clickable link, a "here's exactly what broke" handoff to a teammate, or a quick proof-of-life you want to drop in a channel. Keep everything local (no `--upload`) when you're iterating on a flow, working with sensitive data, or simply don't need the share surface — the local `browserbash dashboard` covers private review.

Good next steps:

- [Record screenshots and session video](https://browserbash.com/tutorials) — get the most out of `--record` before you upload.
- [Agent mode and NDJSON for CI](https://browserbash.com/blog) — pair `--agent` with `--upload` for pipelines that emit links on failure.
- [Pick the right model](https://browserbash.com/learn) — avoid uploading junk runs from an under-powered local model.
- Compare plans and retention on the [pricing page](https://browserbash.com/pricing), and skim what the agent can do on the [features page](https://browserbash.com/features).

## FAQ

### What does browserbash connect do, and does it upload my runs automatically?

`browserbash connect --key bb_...` only links your machine to a cloud workspace by storing the credential. It uploads nothing on its own and does not enable any background sync. Runs are pushed only when you explicitly add `--upload` to a specific `run` command, which keeps the whole feature opt-in.

### Does using --upload send my data to the cloud by default?

No. Upload is strictly per-run and opt-in. A normal `browserbash run` stays entirely on your machine and is saved only to `~/.browserbash/runs`. Data travels to the cloud only when you have connected a key and pass `--upload` on that exact invocation; drop the flag and you are back to fully local.

### How long are BrowserBash cloud runs kept?

Free cloud runs are retained for 15 days, then the shareable page expires and the record ages out. That window is meant for sharing and short-term debugging rather than long-term archival. The on-disk copy of every run in `~/.browserbash/runs` is independent of cloud retention and stays until the local store hits its 200-run cap.

### Can I share a run with someone who does not have BrowserBash installed?

Yes. When a run uploads, the CLI prints a shareable URL that opens in any browser, showing the objective, each step, the final verdict, extracted values, and any recorded screenshot or video. The person you send it to needs only the link, not the CLI or an account, for the 15 days the run is retained.

Install once and try it:

```bash
npm install -g browserbash-cli
```

Then connect a key from [browserbash.com/sign-up](https://browserbash.com/sign-up) (an account is only needed for the cloud dashboard — running BrowserBash never requires one) and push your first run with `--upload`.
