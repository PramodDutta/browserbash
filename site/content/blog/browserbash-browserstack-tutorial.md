---
title: Run AI browser tests on BrowserStack with BrowserBash
description: "A hands-on browserstack ai testing tutorial: wire your BrowserStack keys, run --provider browserstack, and drive cross-browser AI tests with BrowserBash."
date: 2026-02-06
category: tutorial
---

By the end of this tutorial you will have a real browserstack ai testing workflow running: a plain-English objective driven by an AI agent on the BrowserStack cloud, with the session waiting for you in the BrowserStack Automate dashboard. The tool doing the driving is [BrowserBash](https://browserbash.com), a free and open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You will not write a single selector, capability block, or page object. You write a sentence describing what should happen, point BrowserBash at the grid with `--provider browserstack`, and the agent reads the live page and steps a real Chrome session through your flow.

I am going to run this like a pairing session. We start by getting a flow green locally on your own Chrome — where you can watch it and fix the wording in seconds — then promote the *exact same objective* to BrowserStack by flipping one flag. Along the way you will wire your BrowserStack credentials safely, run headless, capture artifacts, and learn where the honest trade-offs live. Every command here is real and runnable today against BrowserBash 1.3.1.

## What you'll need

Before we touch the grid, get the basics in place. None of this requires a BrowserBash account — the CLI runs entirely from your terminal.

- **Node.js >= 18.** Check with `node --version`. BrowserBash ships on npm and needs a modern runtime.
- **Google Chrome** installed locally. The default `local` provider drives your own Chrome, and we use it to develop the flow before going remote.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

- **A BrowserStack account** with an active Automate plan that includes the cloud grid. You only need this for the remote half of the tutorial; the local half is free and keyless.
- **Your BrowserStack credentials** — a username and an access key. You will find both in your BrowserStack account settings under the Automate section (the "Username" and "Access Key" fields). We will export them as `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`.
- **A model backend.** BrowserBash defaults to `auto`, which prefers a local [Ollama](https://browserbash.com/learn) model first (free, nothing leaves your machine), then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. For the local development step, a mid-size local model or any hosted key works. For the BrowserStack runs specifically, read the model note in Step 4 — the grid uses the builtin engine, which expects a capable model.

Confirm the install before continuing:

```bash
browserbash --version
```

You should see `1.3.1` printed back. If the command is not found, your global npm bin directory may not be on your `PATH`; re-open the terminal or check `npm bin -g`.

## Step 1 — Get the flow green locally first

Resist the urge to jump straight to the grid. The fastest way to land a *reliable* BrowserStack run is to nail the wording on local Chrome, where you can watch the browser and iterate in seconds. The provider and the engine are independent of the objective, so whatever passes locally will run unchanged on BrowserStack.

Run a one-shot objective against a public demo site:

```bash
browserbash run "Open https://www.saucedemo.com, log in with username standard_user and password secret_sauce, then verify the products page is shown" --provider local
```

A Chrome window opens, the agent navigates, types the credentials, clicks the login button, and checks the result. In the terminal you get a step-by-step trace as the agent reasons, followed by a verdict block — a clear **passed** with a short summary like "Logged in and the inventory page rendered with products visible," plus any structured values it extracted. If the objective is ambiguous, the verdict tells you why, and you tighten the sentence and rerun. That loop is the entire reason we develop locally first.

### Make it a committable test

A one-liner is fine for a smoke check, but the format you actually want in a repo is a markdown test. Create `login_test.md`:

```markdown
# SauceDemo login

- Open https://www.saucedemo.com
- Log in with username standard_user and password secret_sauce
- Verify the inventory page lists at least one product
```

Run it locally:

```bash
browserbash testmd run ./login_test.md
```

Each list item is a step. BrowserBash executes them in order and writes a human-readable `Result.md` next to the file after the run, so you have an evidence trail. This is the same file we push to BrowserStack in Step 5 — no rewrite, no second format.

## Step 2 — Understand provider vs. engine

This is the one concept that makes everything else click, so let's be precise about it before adding credentials.

- **The provider** is *where the browser physically runs*. The default is `local` (your Chrome). The others are `cdp`, `browserbase`, `lambdatest`, and `browserstack`. You switch with `--provider`.
- **The engine** is *how the agent interprets your English and acts on the page*. BrowserBash ships `stagehand` (the default, MIT-licensed, by Browserbase — act/extract/observe/agent primitives with self-healing) and `builtin` (an in-repo Anthropic tool-use loop driving Playwright).

Here is the part specific to this tutorial: **`--provider browserstack` automatically uses the `builtin` engine.** You do not pass `--engine` yourself; selecting BrowserStack as the provider switches the agent to the builtin tool-use loop, which is the path wired for the grid. So when you flip the provider flag, you are also implicitly changing how the agent thinks — which is exactly why developing locally on Stagehand first, then validating once on BrowserStack, is the safe order.

The objective and your assertions stay byte-for-byte identical across both. Only the provider flag moves.

## Step 3 — Wire your BrowserStack credentials

BrowserBash reads your BrowserStack credentials from two environment variables. It never wants them on the command line, where they would land in your shell history.

```bash
export BROWSERSTACK_USERNAME="your-browserstack-username"
export BROWSERSTACK_ACCESS_KEY="your-browserstack-access-key"
```

Run those in the same terminal session you will launch the test from. To confirm they are set without printing the secret value, check that both variables are non-empty:

```bash
test -n "$BROWSERSTACK_USERNAME" && test -n "$BROWSERSTACK_ACCESS_KEY" && echo "BrowserStack credentials present"
```

If that prints `BrowserStack credentials present`, you are wired up. In CI you would set these as masked secrets rather than exporting them by hand — more on that in the next-steps section. Both variables are required; if either is missing when you select the BrowserStack provider, the run fails fast with a message telling you which key it could not find.

## Step 4 — Run the same objective on BrowserStack

Now the payoff. Take the objective you proved locally and change exactly one thing — the provider:

```bash
browserbash run "Open https://www.saucedemo.com, log in with username standard_user and password secret_sauce, then verify the products page is shown" --provider browserstack --headless
```

What happens under the hood: BrowserBash authenticates to BrowserStack with your two environment variables, provisions a remote Chrome session on the cloud grid, switches to the builtin engine automatically, and runs your objective there. The `--headless` flag tells the run not to expect a visible local window, which is correct for a remote grid session and for CI — there is no display on your side to render anyway. In the terminal you get the same shape of output as before: a step trace, then a **passed** or **failed** verdict with a summary. The difference is purely *where* the browser lived.

### A note on the model — read this

The builtin engine that BrowserStack uses is an Anthropic tool-use loop, so the cleanest path is a capable hosted model. Set `ANTHROPIC_API_KEY` and the `auto` resolver will pick `claude-opus-4-8`:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

You *can* pin a different backend with `--model`, but be honest with yourself about capability. Very small local models (8B and under) are flaky on long, multi-step objectives — they lose the thread halfway through a checkout. For grid runs you want either a capable hosted model or a mid-size local model (Qwen3 or a Llama 3.3 70B-class model). If a BrowserStack run wanders or stalls on a hard flow, the model is the first thing to upgrade, not the wording.

### The flags that matter for this run

| Flag | What it does |
|---|---|
| `--provider browserstack` | Runs the browser on the BrowserStack grid; auto-selects the builtin engine. Needs `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`. |
| `--headless` | No visible local browser window; correct for remote grid sessions and CI. |
| `--model <id>` | Pin the LLM backend, e.g. `claude-opus-4-8` or `ollama/qwen3`. Default is `auto`. |
| `--timeout <seconds>` | Cap the whole run. Grid sessions add network latency, so give long flows room. |
| `--record` | Capture a local screenshot + `.webm` session video (builtin engine also writes a Playwright trace). |
| `--agent` | Emit machine-readable NDJSON instead of prose — for CI and AI coding agents. |
| `--upload` | Opt-in push of this run to the free cloud dashboard (requires `browserbash connect` first). |

You do not pass `--engine` for BrowserStack; the provider sets it for you. And you never invent capability JSON — there is no such thing in this CLI.

## Step 5 — Run your markdown test on the grid

The one-liner proves the wiring. The thing you actually keep is the markdown test from Step 1, now run on the grid:

```bash
browserbash testmd run ./login_test.md --provider browserstack --headless
```

Same file, same steps, now executing on BrowserStack. BrowserBash writes a fresh `Result.md` documenting what happened, and because the test is just a markdown list, a teammate can review the diff in a pull request without reading a line of code. This is the "develop locally, run on the grid" pattern in its final form: one committed artifact, two providers, zero rewrites.

### Handling secrets in the test file

Real flows have passwords. In a `*_test.md` file you template values with `{{variables}}`, and any variable you mark as secret is masked as `*****` in every log line, in `Result.md`, and in the on-disk run store. So your committed test never contains a raw credential, and neither do your logs. That matters even more on a shared grid, where evidence is more visible. You can also compose tests with `@import` to share a login fragment across many flows without copy-pasting steps.

## Step 6 — Cross-browser is just another sentence

The reason teams pay for BrowserStack is cross-browser, cross-OS coverage, and the natural-language model makes that surprisingly clean. Because the agent reads the live page rather than relying on hardcoded selectors, the *same objective* tends to hold up across rendering differences that would shatter a brittle CSS-selector script.

In practice you run the flow on BrowserStack, confirm it is green, and then widen coverage by treating each target browser as its own run in your matrix — same committed `login_test.md`, same `--provider browserstack --headless`, kicked off once per target in CI. The objective is the contract; the grid supplies the browser. If a flow passes on one engine but fails on another, that is a real cross-browser bug surfacing, not a flaky locator — which is the whole point of running on a grid in the first place.

A small but important habit: keep the assertion in your final step concrete ("verify the inventory page lists at least one product") rather than vague ("verify it worked"). Concrete assertions give the agent an unambiguous pass/fail target on every browser, and that is what keeps a cross-browser matrix trustworthy.

## Step 7 — Capture recordings and find them in the dashboard

There are two layers of evidence here, and it is worth being clear about which is which.

**On the BrowserStack side**, every Automate session you run shows up in the **BrowserStack dashboard** with its own session video, text logs, and metadata, exactly as it would for a scripted Selenium job. Because `--provider browserstack` runs the browser on their infrastructure, those grid-side recordings are produced by BrowserStack, not by BrowserBash. After a run, open your BrowserStack Automate dashboard, find the most recent session, and you will see the video of the agent driving your flow. That recording lives in the BrowserStack dashboard.

**On the BrowserBash side**, you can additionally capture local artifacts with `--record`:

```bash
browserbash run "Open https://www.saucedemo.com, log in with username standard_user and password secret_sauce, then verify the products page is shown" --provider browserstack --headless --record
```

`--record` writes a screenshot and a `.webm` session video using BrowserBash's bundled ffmpeg, and because BrowserStack runs on the builtin engine, it also writes a Playwright trace you can open later. So you end up with grid-side evidence in the BrowserStack dashboard and a local copy on your own disk. Every run is also kept on-disk at `~/.browserbash/runs` (secrets masked, capped at the 200 most recent), so even without `--record` you have a history to look back on.

### The free local dashboard (optional)

If you want a browseable view of your runs without sending anything anywhere, spin up the fully local dashboard:

```bash
browserbash dashboard
```

It serves at `http://localhost:4477` and reads from your local run store — nothing leaves your machine. Pass `--dashboard` on a run to open it for that specific run, or `--clear` to wipe the store. There is also an opt-in cloud dashboard (`browserbash connect --key bb_...` then `--upload` per run, free cloud runs kept 15 days), but you never need it for BrowserStack; the grid recordings already live in the BrowserStack dashboard.

## Step 8 — Wire it for CI with NDJSON

Once a flow is green on the grid, the last step is making a machine read the result. Add `--agent` and BrowserBash emits NDJSON — one JSON object per line — instead of prose:

```bash
browserbash testmd run ./login_test.md --provider browserstack --headless --agent
```

Progress lines look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal object such as `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. There is no prose to parse and no log scraping. Exit codes carry the verdict too: **0** passed, **1** failed, **2** error, **3** timeout. A CI job can branch on the exit code alone and attach the BrowserStack session link from the dashboard as the failure evidence. Set both BrowserStack credentials as masked CI secrets, and you have an end-to-end cross-browser check that needs no display and no babysitting.

## Troubleshooting

Real runs fail in boring, fixable ways. Here are the ones you will actually hit on BrowserStack.

- **"Missing BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY."** The provider could not find one or both credentials. Re-export them in the *same* terminal session you launch from (env vars do not survive a new shell), and confirm with the `test -n` check from Step 3. In CI, make sure they are configured as secrets and actually injected into the job's environment.
- **A small local model wanders or stalls.** If you pinned `--model ollama/<small-model>` and the agent loops, misclicks, or gives up mid-flow, the model is the cause, not the grid. Sub-8B models are unreliable on long objectives. Switch to a capable hosted model (set `ANTHROPIC_API_KEY` and let `auto` pick `claude-opus-4-8`) or a mid-size local model like Qwen3.
- **The run times out.** Grid sessions add network round-trips that a local browser does not, so a flow that finishes in 30 seconds locally may need more headroom remotely. Raise the cap with `--timeout 180` (seconds) for long multi-step flows, and tighten any vague step that makes the agent hunt.
- **`--record` produces no video.** The session video relies on the bundled ffmpeg. If the `.webm` is missing or empty, your environment may be blocking the bundled binary; the screenshot and (on the builtin engine) the Playwright trace are still written, and the grid-side recording in the BrowserStack dashboard is unaffected because BrowserStack produces that independently.
- **It passes locally but fails on BrowserStack.** Remember the engine swap: local defaults to Stagehand, while BrowserStack forces the builtin engine. A wording that leaned on Stagehand's self-healing may need to be a touch more explicit for builtin. Validate the objective once on BrowserStack while iterating, not just locally.

## When to use this

Reach for `--provider browserstack` when you want real cross-browser, cross-OS coverage on infrastructure you already pay for, when your CI runners have no display, or when you need session recordings sitting in a shared dashboard your whole team can open. For day-to-day authoring and debugging, stay on `local` — it is free, fast, and you can watch the browser.

If you want to go deeper, these sibling tutorials build on the same model:

- [BrowserBash tutorials](https://browserbash.com/tutorials) — the full hands-on index, from first run to CI.
- [BrowserBash learn pages](https://browserbash.com/learn) — how the AI agent drives any browser, conceptually.
- The [BrowserBash blog](https://browserbash.com/blog) has companion walkthroughs for the other cloud providers and for running fully free on local Ollama models.
- See real outcomes on the [case study page](https://browserbash.com/case-study) and compare plans on the [pricing page](https://browserbash.com/pricing).

## FAQ

### How do I run BrowserBash tests on BrowserStack?

Export your `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` environment variables, then add `--provider browserstack` to any `run` or `testmd run` command. That single flag sends the browser to the BrowserStack cloud and automatically switches BrowserBash to its builtin engine. Your plain-English objective and assertions stay exactly the same as they were locally.

### Do I need to write Selenium or capability JSON to use BrowserStack with BrowserBash?

No. BrowserBash is a natural-language CLI, so you describe what should happen in a sentence and the AI agent reads the live page to decide how to act. There are no selectors, no page objects, and no capabilities JSON to maintain. The grid runs a real Chrome session for you while you keep your tests as plain English or as committable markdown files.

### Where do I find the session recording after a BrowserStack run?

Because the browser runs on BrowserStack's infrastructure, each session appears in your BrowserStack Automate dashboard with its own video recording and text logs, just like a scripted job. Open the dashboard, find the most recent session, and play the recording there. You can also add the `--record` flag to capture a local screenshot, a .webm video, and a Playwright trace on your own machine.

### Which model should I use for BrowserStack runs?

The BrowserStack provider uses the builtin Anthropic tool-use engine, so a capable model matters. The simplest path is setting ANTHROPIC_API_KEY and letting the default auto resolver pick claude-opus-4-8. Very small local models under 8B tend to be flaky on long multi-step flows, so prefer a capable hosted model or a mid-size local model like Qwen3 or a Llama 3.3 70B-class model for hard objectives.

---

Ready to run your first AI browser test on BrowserStack? Install the CLI and point it at the cloud:

```bash
npm install -g browserbash-cli
```

An account is optional — the CLI runs entirely from your terminal — but if you want the cloud dashboard you can [sign up here](https://browserbash.com/sign-up).
