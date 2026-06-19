---
title: Writing committable markdown tests with BrowserBash
description: "Hands-on tutorial on markdown browser tests: write a _test.md file, run testmd, read Result.md, and compose suites with @import — no selectors needed."
date: 2026-03-03
category: tutorial
---

By the end of this tutorial you'll be writing **markdown browser tests** you can commit to git, review in a pull request, and replay with a single command. We'll build a real `*_test.md` file where every list item is one step, run it with `browserbash testmd run`, read the human-readable `Result.md` it leaves behind, and then split a sprawling test into reusable fragments with `@import`. No selectors, no page objects, no step-definition glue code — just a plain-English checklist that an AI agent executes against a real Chrome window, plus an artifact your whole team can actually read.

I'm going to treat this like a pairing session. We'll start on the cheapest possible setup — a local model through Ollama, no API keys, no cloud, a guaranteed zero-dollar model bill — write a login-and-search test against a public demo site, and iterate until it goes green. Along the way you'll learn *why* the file format looks the way it does, how `{{variables}}` keep credentials out of the committed file, and how to wire the whole thing into CI. The format is deliberately boring to read, which is the entire point: a test nobody can read is a test nobody trusts.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You hand the `browserbash` command an English objective, an AI agent drives a real Chrome or Chromium browser through it, and you get back a pass/fail verdict plus any structured values it extracted. The `testmd` subcommand is what turns that one-shot magic into something a team can version, diff, and trust.

## What you'll need

Nothing exotic. Here's the checklist before we write a line:

- **Node.js 18 or newer.** Check with `node -v`. If you're behind, grab an LTS build from nodejs.org.
- **Google Chrome installed.** The default `local` provider drives the actual Chrome on your machine, so it needs to be there.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

That pulls down version 1.3.1 (or newer) and puts the `browserbash` command on your PATH. Confirm it:

```bash
browserbash --version
```

- **A model the agent can think with.** We'll use the free local path: [Ollama](https://ollama.com) plus a mid-size model. Install Ollama, then pull a model that's actually capable of multi-step reasoning:

```bash
ollama pull qwen3
```

A quick, honest word here, because it saves you an afternoon of confusion. Very small local models (8B parameters and under) are *flaky* on long, multi-step objectives — they lose the thread, hallucinate a button that isn't there, or declare victory early. The sweet spot for real test files is a mid-size local model (think Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model like Claude for the genuinely hard flows. Start with the best local model your machine can run; we'll cover how to switch later.

You do **not** need an account, an API key, or a credit card to follow along. With the local model path, nothing leaves your machine.

## Step 1 — Understand the `*_test.md` format

Before running anything, let's look at the format, because it's the whole idea. A BrowserBash markdown test is an ordinary Markdown file whose name ends in `_test.md`. That suffix is the contract — it's how `testmd` knows the file is a test and not a README.

The rules are small enough to hold in your head:

- **Each list item is one step.** The agent reads them top to bottom, in order.
- **`{{variables}}`** get substituted at run time, so the same file works against staging, prod, or a teammate's branch.
- **Secret-marked variables** are masked as `*****` in every line the tool logs, so a password never lands in your terminal scrollback or the on-disk run store.
- **`@import`** pulls in another markdown fragment, so you can share a login flow across twenty tests instead of copy-pasting it.

Here's a minimal example so the shape is concrete. Create a working folder and a file:

```bash
mkdir -p browserbash-tests && cd browserbash-tests
```

Then create `search_test.md` with this content:

```markdown
# Search the BrowserBash docs

- Go to https://www.saucedemo.com
- Log in with username "standard_user" and password "secret_sauce"
- Verify the page heading reads "Products"
- Sort the products from price high to low
- Confirm the first product shown is the most expensive item
```

Read it back. It's a checklist. Anyone on your team — including the non-engineers — can review that in a PR and tell you whether it describes the behavior they expect. There is no locator to go stale, no `data-testid` to argue about. The agent figures out *how*; you only ever describe *what*.

The `# heading` at the top is the test's human name and shows up in the report. Everything under it that's a list item is a step.

## Step 2 — Run your first markdown test

Time to actually drive a browser. From inside `browserbash-tests`, run:

```bash
browserbash testmd run ./search_test.md
```

Because the default model is `auto`, BrowserBash resolves a backend for you in this order: a local Ollama install first (free, no keys), then `ANTHROPIC_API_KEY` if it's set, then `OPENAI_API_KEY`, and otherwise it errors out with guidance. Since you pulled `qwen3` and Ollama is running, it picks the local model and your model bill stays at exactly $0.

A Chrome window pops up and starts moving on its own. In the terminal you'll see step-by-step progress — each list item printed as it's attempted, with a short remark about what the agent did, then a verdict. A passing run ends with something like:

```
PASSED  Search the BrowserBash docs  (5/5 steps)  in 41.2s
Result written to ./Result.md
```

If a step fails — say the heading didn't match — you'll get a `FAILED` line naming the step that broke and the agent's reasoning about why. That naming is the difference between "something's wrong" and "step 3 expected heading 'Products' but the page showed 'Login'."

### Pinning the model explicitly

`auto` is convenient, but in a test file you usually want determinism. Pin the exact model with `--model` so a run on your laptop and a run in CI use the same brain:

```bash
browserbash testmd run ./search_test.md --model ollama/qwen3
```

If you'd rather use a hosted model for a hard flow, export the key and pin it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
browserbash testmd run ./search_test.md --model claude-opus-4-8
```

## Step 3 — Read the `Result.md` report

Every `testmd run` writes a `Result.md` next to wherever you ran it. This is the artifact that makes markdown tests worth using on a team. Open it:

```bash
open ./Result.md   # macOS; use 'xdg-open' on Linux or just open it in your editor
```

It's plain Markdown, structured roughly like this:

- The test name and an overall verdict (passed / failed) at the top.
- A per-step table: each step, its status, and the agent's remark.
- Any structured values the agent extracted along the way (for our test, the most-expensive product name).
- Total duration.

Because it's Markdown, it renders beautifully in a GitHub PR, a wiki, or a Slack snippet. I commit `Result.md` for important suites so reviewers can see the *evidence* a flow passed, not just a green check from CI. It doubles as living documentation: six months from now, `Result.md` tells a new hire exactly what "the search flow" means in human terms.

One thing to know: `Result.md` is overwritten on each run, so it always reflects the latest execution. If you need history, the run store has you covered (more on that in Step 6).

## Step 4 — Parameterize with `{{variables}}` and mask secrets

Hardcoding `standard_user` / `secret_sauce` into the file is fine for a demo, terrible for real life. You don't want a production password sitting in git, and you want one file to run against multiple environments. Both problems are solved by `{{variables}}`.

Rewrite `search_test.md` to use placeholders:

```markdown
# Log in and verify the inventory page

- Go to {{baseUrl}}
- Log in with username "{{username}}" and password "{{password}}"
- Verify the page heading reads "Products"
- Confirm at least one product is visible
```

Now supply the values at run time instead of baking them in. Pass them on the command line and mark the password as a secret so it gets masked:

```bash
browserbash testmd run ./search_test.md \
  --model ollama/qwen3 \
  --var baseUrl=https://www.saucedemo.com \
  --var username=standard_user \
  --secret password=secret_sauce
```

Two things just happened. First, the same file now runs against any environment — point `baseUrl` at staging tomorrow and nothing else changes. Second, because `password` was passed as a secret, every place the tool would have echoed it — the terminal, the step log, the `Result.md`, the on-disk run store — shows `*****` instead. The value lives only in memory for the duration of the run. That's what makes these files safe to commit *and* safe to run with real credentials.

In CI you'd source those values from your secret manager rather than typing them, but the masking behavior is identical: the credential never appears in any log line, so it can't leak into build output that the whole org can read.

## Step 5 — Compose tests with `@import`

Once you have more than a handful of tests, you'll notice every one of them starts with the same login dance. Copy-paste is how test suites rot. `@import` is the fix: pull a shared fragment into many files so the login flow lives in exactly one place.

Create a reusable login fragment, `login_steps.md`:

```markdown
- Go to {{baseUrl}}
- Log in with username "{{username}}" and password "{{password}}"
- Verify the page heading reads "Products"
```

Now any test can compose it in with `@import`:

```markdown
# Add an item to the cart

@import ./login_steps.md

- Add the first product on the page to the cart
- Open the shopping cart
- Confirm the cart shows exactly one item
- Verify the item name matches the product you added
```

When `testmd` runs this file, it expands the `@import` line into the login steps inline, then continues with the cart steps — as if you'd written them all in one file. The variables (`baseUrl`, `username`, `password`) flow straight through, so you still supply them once at the command line:

```bash
browserbash testmd run ./add_to_cart_test.md \
  --model ollama/qwen3 \
  --var baseUrl=https://www.saucedemo.com \
  --var username=standard_user \
  --secret password=secret_sauce
```

Now when the login UI changes, you edit `login_steps.md` once and every test that imports it is fixed. That's the page-object benefit — shared, reusable building blocks — without writing a single page object. You compose flows the same way you'd compose a checklist: by reference, in plain English.

A practical tip: keep fragments small and single-purpose (`login_steps.md`, `accept_cookies.md`, `open_dashboard.md`). Big imported blobs are as hard to reason about as big functions.

## The flags you'll actually use

`testmd run` shares the core run flags. Here are the ones that matter for markdown tests, all accurate to the current CLI — there are no hidden flags beyond these:

| Flag | What it does |
| --- | --- |
| `--model <id>` | Pins the LLM backend. `auto` (default), `ollama/<model>`, `claude-opus-4-8`, `openai/gpt-4.1`, `google/gemini-2.5-flash`, or `openrouter/<vendor>/<model>`. |
| `--var name=value` | Substitutes a `{{name}}` placeholder. Repeat for multiple variables. |
| `--secret name=value` | Same as `--var`, but the value is masked as `*****` in every log, the report, and the run store. |
| `--provider <name>` | Where the browser runs: `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack`. |
| `--engine <name>` | Who interprets the English: `stagehand` (default) or `builtin`. |
| `--headless` | Runs without a visible browser window — what you want in CI. |
| `--timeout <seconds>` | Caps how long the run may take before it's killed as a timeout. |
| `--record` | Captures a screenshot plus a `.webm` session video (via bundled ffmpeg); the `builtin` engine also writes a Playwright trace. |
| `--dashboard` | Opens the free local dashboard for this run (localhost:4477). |
| `--upload` | Pushes this run to the cloud dashboard — requires `browserbash connect` first. Without it, nothing leaves your machine. |
| `--agent` | Emits NDJSON (one JSON object per line) instead of prose — built for CI and AI coding agents. |

A combination I reach for constantly when a markdown test is misbehaving: `--record` to get a video of exactly what the browser did, so I can watch where the agent went off the rails instead of guessing from logs.

## Troubleshooting

Real failure modes you'll hit, and how to get unstuck.

**A small local model flakes on long tests.** This is the single most common issue. If a sub-8B model passes step 1 then invents a button that doesn't exist, the model is the problem, not your file. Switch to a mid-size local model (`--model ollama/qwen3` or a 70B-class model) or a hosted model for that suite (`--model claude-opus-4-8` with `ANTHROPIC_API_KEY` set). Keep individual steps small and unambiguous, too — "Log in and then go to settings and change the email and save" is three steps crammed into one list item; split it.

**`--record` produces no video.** The recording uses a bundled ffmpeg. If the `.webm` is missing or zero bytes, the bundled binary couldn't start in your environment (common in stripped-down Docker images). Install a system ffmpeg, or drop `--record` and rely on the step log and `Result.md` instead. The screenshot still works in most cases.

**"No model available" or a key error.** With `--model auto` and no Ollama running, BrowserBash falls through to looking for `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then errors with guidance. Either start Ollama (`ollama serve`) and pull a model, or export one of those keys. Pinning `--model ollama/qwen3` and getting a connection error usually means Ollama isn't running — check `OLLAMA_BASE_URL` if you've moved it off the default port.

**The run hangs and gets killed.** A long flow on a slow local model can blow past the default timeout. Raise it with `--timeout 240` (seconds) for genuinely long suites. If it still hangs, watch the run with `--record` or drop `--headless` so you can see *where* it's stuck — usually a modal, a cookie banner, or a login that silently failed.

**A step "passes" but did the wrong thing.** Vague steps invite the agent to interpret loosely. Tighten the assertion: instead of "check the cart," write "confirm the cart shows exactly one item and its name matches the product you added." Specific, verifiable steps produce trustworthy verdicts.

## When to use this

Reach for markdown tests when you want browser checks that live in your repo, survive code review, and read like documentation — smoke tests for a deploy, regression checks for a critical flow, or a shared login fragment every test imports. They're the committable counterpart to a quick `browserbash run "..."` one-shot.

From here, a few natural next steps:

- Browse the full library of [BrowserBash tutorials](https://browserbash.com/tutorials) for end-to-end walkthroughs.
- Work through the fundamentals over on [BrowserBash Learn](https://browserbash.com/learn) if you're new to natural-language testing.
- Read more deep dives on the [BrowserBash blog](https://browserbash.com/blog), and check the [features overview](https://browserbash.com/features) to see what else the engine and providers can do.

Once your markdown tests are green locally, the obvious next move is CI: run them with `--headless --agent` and let the NDJSON stream and exit codes drive your pipeline, no prose parsing required.

## FAQ

### What is a markdown browser test in BrowserBash?

It's a committable `*_test.md` file where every list item is one plain-English step the AI agent executes against a real Chrome browser. You run it with `browserbash testmd run ./file_test.md`, and it writes a human-readable `Result.md` report afterward. There are no selectors or page objects — you describe what should happen, and the agent figures out how.

### How do I keep passwords out of my committed test files?

Use `{{variables}}` placeholders in the file and pass real values at run time. Mark sensitive ones with `--secret name=value` instead of `--var`, and BrowserBash masks them as `*****` in every log line, the `Result.md` report, and the on-disk run store. The actual credential lives only in memory for the duration of the run, so it never lands in git or your build output.

### What does `@import` do in a BrowserBash markdown test?

`@import ./fragment.md` pulls another markdown fragment inline at run time, so a shared flow like login can live in one file and be reused across many tests. Variables flow through the import, so you still supply them once on the command line. It gives you the reuse benefit of page objects without writing any code — edit the fragment once and every test that imports it updates.

### Can I run markdown tests for free without an API key?

Yes. With the default `auto` model and a local Ollama install, BrowserBash uses your local model first, so no keys are needed and nothing leaves your machine — your model bill is exactly zero. Just note that very small local models can be flaky on long multi-step tests; a mid-size model like Qwen3 or a 70B-class model is the reliable sweet spot.

Ready to write your first one? Install the CLI and go:

```bash
npm install -g browserbash-cli
```

No account required to run locally — but if you want the optional cloud dashboard and shareable runs, you can [sign up here](https://browserbash.com/sign-up).
