---
title: Automate a login-to-checkout flow with BrowserBash
description: "Automate login and checkout as one markdown test with BrowserBash. Drive real Chrome, mask secrets, and verify Thank you for your order on the local model path."
date: 2026-04-07
category: tutorial
---

By the end of this tutorial you'll be able to automate login and checkout as a single, committable markdown test that drives a real Chrome browser, keeps your password out of every log line, and ends by verifying the page actually says "Thank you for your order!" — no selectors, no page objects, no flaky CSS paths. You write the journey in plain English, an AI agent carries it out step by step, and you get back a clean pass/fail verdict plus the values it extracted along the way. We'll build the whole thing on the free, local Ollama path first, so your model bill is exactly $0, then show you the one flag to flip when a flow gets hard enough to want a bigger model.

The tool is [BrowserBash](https://browserbash.com/features), a free, open-source (Apache-2.0) CLI from The Testing Academy. Everything below is real and runnable — every command, every flag. I'm going to pair-program this with you the way I'd onboard a new SDET on my team: small steps, run it, read the output, then add the next thing.

## What you'll need

Before we automate anything, get these in place:

- **Node.js >= 18.** Check with `node -v`. BrowserBash is a CLI distributed on npm.
- **Google Chrome** installed locally. The default `local` provider drives your actual Chrome install.
- **The CLI installed globally:**

```bash
npm install -g browserbash-cli
```

That gives you the `browserbash` command (this tutorial targets version 1.3.1). Confirm it's on your PATH:

```bash
browserbash --version
```

- **A model backend.** The default model is `auto`, which resolves in this order: a local **Ollama** server first (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`. For this lesson I'll assume the free local path. If you have Ollama, pull a mid-size model:

```bash
ollama pull qwen3
```

A quick honesty note up front, because it will save you a headache: very small local models (8B and under) are flaky on long multi-step objectives, and login-to-checkout is exactly the kind of long objective that exposes them. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model. Start local; if the agent loses the thread halfway through checkout, that's your cue to size up, and I'll show you how in Troubleshooting.

- **A site to test.** Use your own staging app, or a public demo like `https://www.saucedemo.com`, which has a login form, a cart, and a checkout that finishes on a "Thank you for your order!" confirmation. Substitute your own URL and credentials throughout.

## Step 1 — Smoke-test login as a one-shot run

Never write the full journey first. Prove the agent can get past the front door, then build on a foundation you trust. The `run` command takes a single English objective and executes it immediately.

```bash
browserbash run "Go to https://www.saucedemo.com, log in with username standard_user and password secret_sauce, and confirm the products page loads."
```

A real Chrome window opens, the agent navigates, types the credentials, clicks the login button, and waits for the inventory page. When it finishes you'll see a verdict line summarizing what happened — a passed run reads roughly like `verdict: passed — logged in; products page visible` along with any values it pulled off the page. If it fails, the summary tells you why (wrong field, button not found, page never loaded), which is your first debugging signal.

This first run is doing double duty: it confirms your install works, your model backend resolved, and the site behaves the way you think it does. Don't move on until login passes consistently.

### Watch what the agent does

If you want eyes on every move — handy the first few times — add `--record` to capture a screenshot and a `.webm` session video (BrowserBash bundles ffmpeg for this):

```bash
browserbash run "Go to https://www.saucedemo.com, log in with username standard_user and password secret_sauce, and confirm the products page loads." --record
```

The run and its artifacts also land in your on-disk run store at `~/.browserbash/runs` (secrets masked, capped at the last 200 runs), so you can review it later without re-running.

## Step 2 — Turn the journey into a markdown test

One-shot runs are great for exploration, but a checkout flow is something you'll run again and again — in code review, in CI, after every dependency bump. That's what **markdown tests** are for. They're committable files (named `*_test.md`) where each list item is a step, and you can template values with `{{variables}}`. After every run, BrowserBash writes a human-readable `Result.md` next to it.

Create a file called `checkout_test.md`:

```markdown
# Login to checkout

Variables:
- base_url: https://www.saucedemo.com
- username: standard_user
- password: secret_sauce (secret)
- product: Sauce Labs Backpack
- first_name: Ada
- last_name: Lovelace
- zip: 94016

Steps:
- Go to {{base_url}} and log in with username {{username}} and password {{password}}.
- Confirm the products page is visible.
- Add the "{{product}}" to the cart.
- Open the shopping cart and confirm "{{product}}" is listed.
- Proceed to checkout, then fill the form with first name {{first_name}}, last name {{last_name}}, and zip code {{zip}}.
- Continue to the order overview and finish the purchase.
- Verify the page shows the text "Thank you for your order!".
```

Two things to notice. First, the journey reads like instructions you'd give a human tester — that's the whole point, and it's why a redesign that renames a button won't break it. Second, the last step is an explicit assertion. BrowserBash returns a verdict based on whether the agent achieved the objective, so spelling out the success condition — "Thank you for your order!" — makes the pass/fail unambiguous instead of leaving it to interpretation.

### Run the markdown test

```bash
browserbash testmd run ./checkout_test.md
```

Chrome opens once and the agent walks the steps top to bottom. When it lands on the confirmation page and finds the thank-you text, the run passes. Open the generated `Result.md` to read a step-by-step account of what happened, including the values it extracted (order confirmation text, cart contents) in a structured block you can eyeball or diff.

## Step 3 — Mask the password with a secret variable

Look back at the variable list — `password: secret_sauce (secret)`. That trailing `(secret)` marks the variable as a secret, and it matters more than it looks. Secret-marked variables are masked as `*****` in **every log line**, in the `Result.md`, and in the on-disk run store. The agent still types the real value into the browser; it just never gets printed anywhere you might paste into a ticket, a CI log, or a screen-share.

This is the difference between a checkout test you can commit to a public repo and one that leaks a credential the first time it runs in a pipeline. Mark anything sensitive — passwords, API tokens, coupon codes, test card numbers — as secret. In your terminal and in `Result.md`, the login step will read like "log in with username standard_user and password *****" while the browser receives the genuine password.

For a deeper treatment of secrets and credential handling, the [tutorials hub](https://browserbash.com/tutorials) has a dedicated walkthrough, and the [learn section](https://browserbash.com/learn) covers the variable and `@import` system in full.

### Compose flows with @import

Once you have more than one journey, you'll notice the login steps repeat. BrowserBash supports `@import` composition so you can factor shared steps into one file and pull them into many. Put your login steps and variables in a `login_test.md`, then start `checkout_test.md` with an import of it and continue with checkout-only steps. You write the login once, fix it once, and every flow that imports it inherits the fix.

## Step 4 — Run it headless for CI

On your laptop, watching Chrome do the work is reassuring. In CI it's a waste — there's no display, and you want speed. Add `--headless`:

```bash
browserbash testmd run ./checkout_test.md --headless
```

Same journey, same verdict, no visible window. Pair it with `--timeout` to cap how long the run may take (in seconds) so a hung page fails fast instead of stalling your pipeline:

```bash
browserbash testmd run ./checkout_test.md --headless --timeout 180
```

If the flow doesn't reach "Thank you for your order!" within 180 seconds, the run ends as a timeout rather than hanging your build agent.

## Step 5 — Wire it into a pipeline with agent mode

CI doesn't want prose — it wants exit codes and machine-readable events. That's `--agent`. It emits NDJSON: one JSON object per line, no decorative output to parse.

```bash
browserbash testmd run ./checkout_test.md --headless --agent
```

You'll get a stream of progress events as the agent works, each on its own line, shaped like:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"opened saucedemo and submitted login"}
```

and a single terminal event when it's done:

```
{"type":"run_end","status":"passed","summary":"order confirmed: Thank you for your order!","final_state":{"confirmation":"Thank you for your order!"},"duration_ms":41200}
```

The exit code mirrors the status, so your CI step branches without reading a single word of prose:

| Exit code | Meaning |
| --- | --- |
| 0 | passed |
| 1 | failed (objective not met) |
| 2 | error (something broke) |
| 3 | timeout |

A GitHub Actions or Jenkins step that runs the command above will fail the build automatically on exit code 1, 2, or 3, and pass on 0. No grep, no brittle log scraping. If you want a fuller CI walkthrough, the [BrowserBash blog](https://browserbash.com/blog) has end-to-end pipeline examples.

## The flags that matter for this flow

Here are the `run` / `testmd run` flags you'll actually reach for on a login-to-checkout journey, all accurate to the current CLI:

| Flag | What it does |
| --- | --- |
| `--provider` | Where the browser runs: `local` (default, your Chrome), `cdp`, `browserbase`, `lambdatest`, `browserstack`. |
| `--engine` | Who interprets the English: `stagehand` (default) or `builtin`. Switch with `--engine builtin`. |
| `--model` | Pin the LLM instead of `auto`, e.g. `ollama/qwen3` or `claude-opus-4-8`. |
| `--headless` | Run without a visible browser window — what you want in CI. |
| `--timeout <seconds>` | Cap the total run time; exceeding it ends as a timeout (exit 3). |
| `--record` | Capture a screenshot + `.webm` session video (builtin engine also writes a Playwright trace). |
| `--agent` | Emit NDJSON for CI and AI coding agents — no prose. |
| `--cdp-endpoint <ws-url>` | Attach to any DevTools endpoint when using `--provider cdp`. |
| `--dashboard` | Open the local dashboard for this run. |
| `--upload` | Push this run to the cloud (requires `connect` first; opt-in). |

A word on engines: the default `stagehand` engine (MIT, by Browserbase) gives you self-healing act/extract/observe/agent primitives and is the right default for most flows. The `builtin` engine is an in-repo Anthropic tool-use loop driving Playwright, and it's selected automatically when you target LambdaTest or BrowserStack. For a local login-to-checkout, leave the engine alone.

### Pinning the model when auto isn't enough

If `auto` keeps resolving to a model that struggles with the full journey, pin a stronger one explicitly:

```bash
browserbash testmd run ./checkout_test.md --headless --model ollama/qwen3
```

Or reach for a hosted model on the hard flows by exporting a key and pinning it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
browserbash testmd run ./checkout_test.md --headless --model claude-opus-4-8
```

You can also route through OpenRouter (`openrouter/meta-llama/llama-3.3-70b-instruct` with `OPENROUTER_API_KEY`) if you want a 70B-class model without running it locally. The journey file doesn't change — only the brain behind it does.

## Step 6 — Review the run locally

BrowserBash ships a fully local dashboard at `localhost:4477`. Nothing is uploaded; it reads your on-disk run store. Launch it:

```bash
browserbash dashboard
```

Or open it for a single run as you go:

```bash
browserbash testmd run ./checkout_test.md --dashboard
```

You'll see each step, its status, and any recorded screenshots or video — useful when a step failed and you want to see exactly where the agent went sideways. If you ever want to wipe the store, `browserbash dashboard --clear` empties it.

Want to share runs with teammates or keep a history beyond your laptop? There's an optional cloud dashboard. Link it once with `browserbash connect --key bb_...`, then add `--upload` to the runs you want pushed (free cloud runs are kept 15 days). It's strictly opt-in — without `--upload`, nothing leaves your machine. You can grab a key from the [sign-up page](https://browserbash.com/sign-up); an account is optional and the local path needs none.

## Troubleshooting

Real failure modes I've hit on this exact flow, and how to fix each.

**The agent logs in fine but loses the thread during checkout.** This is the classic small-model symptom: it nails the first two steps, then forgets it's mid-purchase. The model is too small for a long objective. Pin a mid-size local model with `--model ollama/qwen3`, or switch to a hosted model like `--model claude-opus-4-8`. Splitting the journey into a login file and a checkout file via `@import` also shortens each objective the agent has to hold in its head.

**`--record` runs but produces no video.** The `.webm` capture relies on the bundled ffmpeg. If your environment strips it or PATH is unusual, the screenshot still saves but the video won't. Confirm ffmpeg is reachable (`ffmpeg -version`), and on a headless CI box make sure the run is actually using `--headless` so there's something coherent to record.

**A provider run errors immediately with a credentials message.** Cloud providers need their keys in the environment before the run. `browserbase` needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`; `lambdatest` needs `LT_USERNAME` and `LT_ACCESS_KEY`; `browserstack` needs `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`. Export them, then re-run. Note that LambdaTest and BrowserStack auto-switch to the `builtin` engine — that's expected, not an error.

**The run ends as a timeout (exit 3).** Either the site is genuinely slow or the agent is stuck retrying a step. Bump `--timeout` to give a slow checkout room, but if it's stuck, raising the limit just delays the failure. Re-run with `--record` or `--dashboard` and watch where it loops — usually a modal, a cookie banner, or an unexpected interstitial the objective didn't mention. Add a step telling the agent to dismiss it.

**The verdict is "passed" but checkout didn't really complete.** This happens when your final step is vague. Make the assertion literal: verify the exact text "Thank you for your order!" rather than "confirm the order went through." A precise success condition is what makes the verdict trustworthy.

## When to use this

Reach for an automated login-to-checkout test when the flow is business-critical and the UI changes often enough that selector-based tests keep breaking — e-commerce checkout, SaaS trial sign-up to paid upgrade, any multi-step funnel where a broken step costs revenue. It's also a great smoke test to run on every deploy: if a real browser can't get from login to "Thank you for your order!", something important broke.

From here, a few sibling tutorials build naturally on what you just did:

- [Testing login flows and keeping secrets safe](https://browserbash.com/tutorials) — go deeper on the secret-variable masking we used in Step 3.
- [The learn hub](https://browserbash.com/learn) — the full reference on markdown tests, `{{variables}}`, and `@import` composition.
- [Case studies](https://browserbash.com/case-study) — see how teams run these flows in real pipelines, and check [pricing](https://browserbash.com/pricing) if you're weighing the optional cloud dashboard.

## FAQ

### How do I automate login and checkout without writing selectors?

Write the journey as plain English steps in a markdown test, where each list item is one action like "log in with username X" or "finish the purchase." BrowserBash hands those steps to an AI agent that drives a real Chrome browser, reading the page and deciding what to click — so there are no CSS selectors or page objects to maintain. When the UI changes, the test usually keeps working because the agent re-reads the page each run.

### How do I keep my password out of the logs during a checkout test?

Mark the variable as a secret by adding `(secret)` after its value in the markdown test's variable list. Secret-marked variables are masked as `*****` in every log line, in the generated `Result.md`, and in the on-disk run store, while the agent still types the real value into the browser. That lets you commit the test and run it in CI without leaking a credential.

### Can I run a login-to-checkout flow for free without any API keys?

Yes. The default model is `auto`, which resolves to a local Ollama model first, meaning nothing leaves your machine and your model bill is $0. You only need Node 18+, Chrome, and the `browserbash-cli` package — no account and no keys for the local path. The one caveat is that very small local models can be flaky on long flows, so use a mid-size model like Qwen3 for best results.

### How do I make a checkout test pass or fail correctly in CI?

Run the test with `--agent` to get NDJSON output and rely on the exit code: 0 means passed, 1 failed, 2 error, and 3 timeout. Make your final step a literal assertion — verify the exact text "Thank you for your order!" — so the verdict reflects whether checkout truly completed. Your CI step then branches on the exit code with no log parsing required.

Ready to automate login and checkout end to end? Install the CLI and run your first journey today:

```bash
npm install -g browserbash-cli
```

Then grab an optional cloud key (account optional, local path needs none) at [browserbash.com/sign-up](https://browserbash.com/sign-up).
