---
title: Writing reliable plain-English objectives for BrowserBash
description: "Hands-on tutorial on writing natural language test objectives for BrowserBash: be specific, store values, verify, and break long flows into reliable steps."
date: 2026-03-31
category: tutorial
---

By the end of this tutorial you'll be able to take a vague, hand-wavy instruction and turn it into a **natural language test objective** that an AI agent executes the same way on Tuesday as it did on Monday. We're going to treat the English you write as the source code of your test — because with BrowserBash, it is. There are no selectors to maintain and no page objects to keep in sync; there's just the objective. So the entire reliability of your run lives in how clearly you phrase that one paragraph. Get the phrasing right and you get a green verdict and clean extracted values. Get it sloppy and the agent wanders.

I'm going to pair-program this with you. We'll start from a terrible objective, watch why it's flaky, and rewrite it through four concrete prompt patterns: **be specific**, **store the values you care about**, **verify before you declare success**, and **break up long flows**. We'll run everything on the free local path first — a model served by Ollama, no API keys, no cloud, a guaranteed zero-dollar model bill — and only reach for a hosted model when the flow gets genuinely hard. You'll come away with a phrasing checklist you can paste above any objective.

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You hand the `browserbash` command an English objective, an AI agent drives a real Chrome or Chromium browser through it step by step, and you get back a pass/fail verdict plus any structured values it extracted along the way. Nothing about that magic is automatic, though — the agent is only as good as the instructions you give it, and that's exactly the skill this lesson builds.

## What you'll need

Nothing exotic. Here's the checklist before we write our first objective:

- **Node.js 18 or newer.** Check with `node -v`. If you're on an older line, install an LTS build from nodejs.org first.
- **Google Chrome installed.** The default `local` provider drives the real Chrome on your machine, so it has to be present.
- **A local model via Ollama (recommended for this lesson).** Install Ollama, then pull a mid-size model — `ollama pull qwen3` is a good default. Small models work for the warm-up, but we'll talk about their limits below.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

That pulls version 1.3.1 (or newer) and puts `browserbash` on your PATH. Confirm it:

```bash
browserbash --version
```

You'll see the version print. No account, no login, no API key is required to run locally — BrowserBash defaults to the `local` provider (your Chrome) and the `auto` model, which resolves to your local Ollama first. If you'd rather use a hosted model for the harder flows later, export an `ANTHROPIC_API_KEY` and `auto` will pick up `claude-opus-4-8`; we'll flag exactly where that helps.

## Step 1 — Run a deliberately bad objective and watch it wobble

Let's earn the lesson the honest way: by feeling the pain first. Here's an objective written the way most people write their first one — fast, vague, optimistic:

```bash
browserbash run "go to the saucedemo site and log in and check it works"
```

The agent will open Chrome, navigate somewhere reasonable, and try. But look at everything we left undefined: *which* site exactly, *which* credentials, and — the killer — what "check it works" actually means. The agent has to guess all three. On one run it might land on the inventory page and call that success; on another it might stall on the login form because it invented a username that doesn't exist. You'll get a verdict, but it won't mean the same thing twice.

When the run finishes you'll see a plain-English summary and a verdict line — something like `Verdict: PASSED` or `Verdict: FAILED` — followed by a short remark describing what the agent believes it accomplished. Read that remark closely. With a vague objective, the remark is where the guessing leaks out: "Logged in and reached a page that appears to be the product listing." *Appears to be* is the sound of an unreliable test.

Every run is also saved on disk under `~/.browserbash/runs` (secrets masked, capped at the most recent 200), so you can compare two runs of the same bad objective and watch them disagree. That disagreement is the problem we're about to engineer away.

## Step 2 — Pattern one: be specific

The single biggest reliability win is replacing every "go to the site" with an exact URL, exact field values, and an exact success condition. Vagueness forces the model to fill gaps from training-data assumptions, and assumptions drift between runs. Specificity removes the gaps.

Here's the same intent, rewritten to leave nothing to interpretation:

```bash
browserbash run "Navigate to https://www.saucedemo.com. In the Username field type standard_user. In the Password field type secret_sauce. Click the Login button. Confirm the page now shows the 'Products' heading."
```

Notice four upgrades. We named the **exact URL** instead of a fuzzy "saucedemo site." We named the **exact fields** ("Username field", "Password field") so the agent doesn't have to infer which input is which. We supplied the **exact values** rather than letting the model invent credentials. And we ended with a **concrete success condition** — the literal "Products" heading — instead of "check it works."

Run it. The verdict should come back `PASSED`, and the remark should now read like a fact, not a hope: "Logged in as standard_user; the Products heading is visible." That's a sentence you can trust, because there's only one way to satisfy it.

A few specificity habits worth burning in:

- **Quote literal UI text.** If the button says "Sign In", write `Sign In`, not "the login button." The agent matches what it sees on the page.
- **Spell out the order.** "Type the username, then the password, then click Login" beats "log in." Sequence ambiguity is a top cause of skipped steps.
- **Anchor your success on something visible.** A heading, a URL fragment, a confirmation toast — name a thing the agent can actually observe, not an abstract notion of correctness.

## Step 3 — Pattern two: store the values you care about

BrowserBash doesn't just pass or fail — it returns **structured extracted values** in the run's final state. That's the part teams underuse. If your objective asks the agent to *capture* specific facts, you turn a yes/no test into a data probe you can assert on later. Don't just verify the cart total looks right; tell the agent to extract it and hand it back.

Phrase extraction as an explicit instruction with a clear name for each value:

```bash
browserbash run "Navigate to https://www.saucedemo.com and log in with username standard_user and password secret_sauce. Open the product 'Sauce Labs Backpack'. Extract and return the product name as 'product_name' and its price as 'price'. Confirm the price is shown in US dollars."
```

When this finishes, the agent's final state carries `product_name` and `price` as named fields. To see that machine-readable structure clearly, add `--agent`, which switches output to NDJSON — one JSON object per line, no prose to parse:

```bash
browserbash run "Navigate to https://www.saucedemo.com and log in with username standard_user and password secret_sauce. Open the product 'Sauce Labs Backpack'. Extract and return the product name as 'product_name' and its price as 'price'." --agent
```

You'll get a stream of progress events shaped like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and a final terminal line shaped like `{"type":"run_end","status":"passed","summary":"...","final_state":{"product_name":"Sauce Labs Backpack","price":"$29.99"},"duration_ms":...}`. That `final_state` object is your assertion surface — pipe it into `jq`, feed it to a CI gate, or hand it to an AI coding agent that consumes the run.

Two phrasing rules make stored values reliable:

- **Name each value explicitly.** "Extract the price as 'price'" gives you a stable key. "Note the price" gives you something buried in prose.
- **Describe the shape you expect.** "as a number" or "in US dollars" or "as an ISO date" nudges the model toward a consistent format across runs, which is what makes downstream assertions stop flaking.

## Step 4 — Pattern three: verify before you declare success

An agent that *believes* it succeeded is not the same as one that *checked*. The third pattern is to bake an explicit verification step into the objective so the agent has to observe a result, not just perform an action. This is the difference between "click Add to Cart" and "click Add to Cart, then confirm the cart badge shows 1."

Compare these two. The first acts and assumes; the second acts and checks:

```bash
browserbash run "Log in to https://www.saucedemo.com as standard_user / secret_sauce, add 'Sauce Labs Backpack' to the cart. Then verify the cart icon badge shows the number 1, and verify the cart page lists exactly one item named 'Sauce Labs Backpack'. Fail if the badge is missing or the count is not 1."
```

That trailing "Fail if…" clause is doing real work. It gives the agent a clear failure condition, so a missing badge produces an honest `FAILED` instead of a cheerful `PASSED` that papered over a broken cart. You're effectively writing the assertion into the prose.

Good verification phrasing tends to follow a do-then-check rhythm:

- **State the observable, not the intent.** "Confirm the URL contains `/cart.html`" is checkable; "confirm checkout works" is not.
- **Give an explicit fail condition.** "Fail if the total is not $32.39" tells the agent the run is invalid otherwise, instead of letting it rationalize a near-miss into a pass.
- **Verify the negative when it matters.** "Confirm no error toast is shown" catches the silent breakages that a happy-path check sails right past.

To keep evidence of what the agent actually saw, add `--record`. It captures a screenshot plus a `.webm` session video using a bundled ffmpeg, and on the `builtin` engine it also writes a Playwright trace:

```bash
browserbash run "Log in to https://www.saucedemo.com as standard_user / secret_sauce, add 'Sauce Labs Backpack' to the cart, and verify the cart badge shows 1. Fail if the badge is missing." --record
```

Now when a verification clause fails, you have a video and screenshot to see *why* — not just a red verdict.

## Step 5 — Pattern four: break up long flows

Here's the honest caveat that shapes this whole pattern: very small local models (8B and under) get flaky on long, multi-step objectives. They lose the thread around step five or six, forget an earlier value, or skip a verification. Mid-size local models in the Qwen3 / Llama 3.3 70B class hold up much better, and a capable hosted model holds up best of all. But regardless of model, **a shorter objective is a more reliable objective.** The fix is to stop writing one giant paragraph that does login *and* search *and* cart *and* checkout *and* logout, and split it into focused runs.

Take a sprawling flow like this — login, browse, add two items, check the total, check out, confirm the order — and break it at the natural seams. Run the login-and-add portion first:

```bash
browserbash run "Navigate to https://www.saucedemo.com and log in with standard_user / secret_sauce. Add 'Sauce Labs Backpack' and 'Sauce Labs Bike Light' to the cart. Verify the cart badge shows 2. Extract the cart subtotal as 'subtotal'." --agent
```

Then run the checkout portion as its own objective, so the agent starts fresh and focused instead of carrying six steps of context:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user / secret_sauce, go to the cart and click Checkout. Fill First Name 'Pat', Last Name 'Lee', Zip '94016'. Click Continue, then Finish. Confirm the page shows 'Thank you for your order!'."
```

Each run is short enough that even a modest model can stay coherent end to end, and each produces its own verdict and its own artifacts. When something breaks, you know precisely which segment failed instead of bisecting a ten-step monolith.

### Make the split committable with markdown tests

Splitting into ad-hoc `run` commands is great for exploring, but for a flow you'll repeat, promote it to a markdown test. In a `*_test.md` file, **each list item is one step**, you template values with `{{variables}}`, and you can compose files with `@import`. Secret-marked variables are masked as `*****` in every log line, and the run writes a human-readable `Result.md` afterward. Run one with:

```bash
browserbash testmd run ./checkout_test.md
```

This is the natural home for "break up long flows": each step is already its own line, so the model reads them one at a time, and the file is something your whole team can review in a pull request. The [markdown tests tutorial](https://browserbash.com/tutorials) walks through the full file format.

### The phrasing patterns at a glance

| Pattern | Weak objective | Reliable objective | Why it helps |
| --- | --- | --- | --- |
| Be specific | "log in and check it works" | "Type `standard_user` / `secret_sauce`, click Login, confirm the 'Products' heading" | Removes gaps the model would otherwise guess |
| Store values | "note the price" | "Extract the price as `price` in US dollars" | Turns a verdict into an assertable named field in `final_state` |
| Verify | "add it to the cart" | "Add it, then confirm the cart badge shows 1. Fail if missing." | Forces an observation, not an assumption |
| Break up flows | one 10-step paragraph | two or three focused runs / one step per markdown line | Keeps the model coherent; isolates failures |

And the flags that support these patterns, all accurate to the CLI surface:

| Flag | What it does |
| --- | --- |
| `--agent` | Emits NDJSON — progress `step` events plus a terminal `run_end` with `final_state`. Built for CI and AI coding agents. |
| `--record` | Captures a screenshot and a `.webm` video (bundled ffmpeg); the `builtin` engine also writes a Playwright trace. |
| `--model` | Pins the LLM, e.g. `ollama/qwen3`, `claude-opus-4-8`, `openai/gpt-4.1`, or `openrouter/<vendor>/<model>`. Default is `auto`. |
| `--engine` | Chooses the interpreter: `stagehand` (default) or `builtin`. |
| `--provider` | Chooses where the browser runs: `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack`. |
| `--headless` | Runs Chrome without a visible window. |
| `--timeout <seconds>` | Caps how long the run may take before it ends as a timeout. |
| `--dashboard` | Opens the local dashboard for this run. |

## Troubleshooting

**The verdict flips between PASSED and FAILED on the same objective.** That's the small-model-on-a-long-flow problem. First, apply pattern four and split the objective into shorter runs. If it's already short, pin a more capable model with `--model ollama/qwen3` (or a 70B-class model), or for a genuinely hard flow export an `ANTHROPIC_API_KEY` and run with `--model claude-opus-4-8`. Reliability is mostly a function of objective length times model capability.

**`--record` errors out or produces no video.** The video capture relies on the bundled ffmpeg. If the `.webm` never appears, the screenshot and (on the `builtin` engine) the Playwright trace should still be written, so check those. Re-running without `--record` confirms whether the recording itself is the issue versus the objective; if recording is the only thing failing, that points at ffmpeg in your environment rather than your prompt.

**The agent invents a value or success condition you didn't ask for.** This is almost always under-specified prose. Go back to pattern one: replace fuzzy nouns with literal UI text, supply exact field values, and end with a concrete, observable success condition. If you need a value back, name it explicitly ("extract the order number as `order_id`") rather than hoping it surfaces in the summary.

**The run ends as a timeout (exit code 3).** Long objectives on slow models can blow the default window. Shorten the objective first, then raise the ceiling with `--timeout 180` if the flow legitimately needs more time. In `--agent` mode the terminal line will read `"status":"timeout"`, and the process exit code is `3` — handy for distinguishing a slow run from a real failure (`1`) or an error (`2`) in CI.

**A hosted provider run fails immediately with a key error.** Pinning a model or a remote provider needs its credentials in the environment. `claude-opus-4-8` needs `ANTHROPIC_API_KEY`; `openai/gpt-4.1` and `google/gemini-2.5-flash` go through Stagehand; `openrouter/...` needs `OPENROUTER_API_KEY`. The default `auto` path sidesteps all of this by resolving to local Ollama first, which is why we kept the lesson there.

## When to use this

Reach for these patterns the moment an objective starts feeling unreliable, or before you commit any flow you intend to run more than once. The "be specific" and "verify" patterns pay off even on a one-line smoke test; "store values" and "break up flows" earn their keep on multi-step journeys like checkout, onboarding, or a settings change you need to confirm stuck.

From here, three good next steps:

- The [markdown tests tutorial](https://browserbash.com/tutorials) — promote your best objectives into committable `*_test.md` files with one step per line.
- The [agent mode and NDJSON guide](https://browserbash.com/blog) — go deeper on `--agent`, `final_state`, and exit codes for CI.
- The [Learn hub](https://browserbash.com/learn) for the conceptual background on how the agent interprets your English, and the [features overview](https://browserbash.com/features) for the full command surface.

## FAQ

### What makes a natural language test objective reliable in BrowserBash?

Reliability comes from specificity and verification. Name the exact URL, the exact fields, and the exact values, then end with a concrete success condition the agent can actually observe — a visible heading, a URL fragment, or a confirmation message. Vague phrasing forces the model to guess, and guesses drift between runs, so the more you pin down, the more repeatable your verdict becomes.

### How do I get structured data back from a BrowserBash run?

Ask for it explicitly in the objective and give each value a name, like "extract the price as price." The agent returns those values in the run's final state, and adding the `--agent` flag prints them as NDJSON with a final `run_end` line containing a `final_state` object. That object is machine-readable, so you can pipe it into a CI gate or hand it to another tool without parsing any prose.

### Why does my objective work sometimes but not others?

The most common cause is a long, multi-step objective running on a small local model. Models of 8B parameters and under tend to lose the thread on long flows, so they skip steps or forget earlier values. Break the objective into shorter focused runs, or pin a mid-size model such as Qwen3 or a 70B-class model with the `--model` flag, and the run-to-run consistency improves sharply.

### Do I need an API key to write and test objectives?

No. BrowserBash defaults to the local provider driving your own Chrome and the `auto` model, which resolves to a local Ollama install first — no keys, nothing leaves your machine, and a guaranteed zero-dollar model bill. You only need a key when you choose to pin a hosted model like Claude or a remote provider, which is optional and reserved for genuinely hard flows.

Ready to write objectives that hold up? Install the CLI and start phrasing:

```bash
npm install -g browserbash-cli
```

Then run your first specific, verified objective locally — no account needed. When you want optional free cloud runs or a team dashboard, [sign up here](https://browserbash.com/sign-up) (account optional).
