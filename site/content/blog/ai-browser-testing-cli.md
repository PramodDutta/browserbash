---
title: AI Browser Testing From the Command Line: The Complete Guide
description: "How an AI browser testing CLI works end to end: plain-English objectives, a real Chrome agent, NDJSON verdicts, recordings, and CI exit codes."
date: 2026-06-13
category: guide
---

An AI browser testing CLI lets you describe what a test should do in plain English, then hands the typing and clicking to an AI agent that drives a real Chrome browser and reports back a pass/fail verdict with structured results. No selectors, no page objects, no waiting code. You write the intent; the agent figures out the steps. This guide walks the whole pipeline end to end — how the objective becomes browser actions, which engine and model interpret it, where the browser actually runs, how results come back as machine-readable NDJSON with exit codes, and how the same command slots into CI and into AI coding agents. Every command here is real and runnable, and the tool doing the work — [BrowserBash](https://www.npmjs.com/package/browserbash-cli) — is free and open source under Apache-2.0.

If you have ever written a Selenium or Playwright test, you know the unglamorous truth: most of the effort is not describing the behavior, it is wiring the locators, tuning the waits, and patching everything when the frontend shifts a class name. An AI browser testing CLI moves that work to the machine. The point of this article is not to sell you on magic — it is to show you exactly what happens at each stage so you can decide where the approach fits and run it yourself in five minutes.

## What "AI browser testing from the command line" actually means

Strip away the buzzwords and the model is simple. There are four moving parts, and understanding them is the whole game:

1. **An objective** — a sentence (or a list of sentences) describing what to do and what to verify, written the way you would brief a colleague.
2. **An engine** — the loop that turns that objective into concrete browser actions: read the page, decide the next action, do it, repeat until the goal is met or a step fails.
3. **An LLM backend** — the model that does the reasoning inside the engine. This can run entirely on your own machine.
4. **A provider** — where the browser physically runs: your local Chrome, a cloud grid, or any remote DevTools endpoint.

The CLI's job is to bolt these together behind one command and then return a result that a human can read and a machine can act on. That dual audience — human-legible and machine-parseable — is the through-line of everything below.

Here is the smallest possible end-to-end example. Install the CLI and run a single objective against a live demo site:

```bash
npm install -g browserbash-cli

browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the 'Sauce Labs Backpack' to the cart, open the cart, and verify the backpack is listed" \
  --headless
```

That command runs as printed — the demo credentials are published on the login page itself. The `verify` clause is the assertion. If the backpack is not in the cart when the agent looks, the run fails with a non-zero exit code. There is no locator to write, no `data-testid` to chase, and no explicit wait to tune. The agent re-reads the page at each step and acts the way a person scanning the screen would.

## Stage one: the objective becomes a plan

When you pass an objective, the engine does not blindly execute a fixed script. It enters a loop. On each turn it captures the current state of the page — an accessibility-oriented snapshot of what is visible and interactive — feeds that to the model alongside the goal, and asks for the next action. The model replies with something concrete: navigate to a URL, click a referenced element, type into a field, wait for a condition, extract a value, or declare the objective done.

This is why the approach tolerates UI churn. A traditional script says "click the element matching `#add-to-cart-sauce-labs-backpack`." If that id changes, the script breaks even though the product works perfectly. The agent instead reasons "find the add-to-cart control for the Sauce Labs Backpack and click it," resolving the target against whatever the page looks like right now. A renamed class or a restructured DOM is usually a non-event.

The honest tradeoff lives here too. Because the model plans at run time, two runs can take slightly different paths to the same destination. The approach is **goal-deterministic, not path-deterministic**. You constrain it with explicit `verify` steps that act as hard assertions, a step cap, and a timeout — but if you need bit-identical execution traces for a compliance audit, a code-first framework is the better fit. More on that in the comparison section.

## Stage two: the engine and the model behind it

A capable AI browser testing CLI separates "the loop that drives the browser" from "the model that thinks," so you can swap either independently. BrowserBash ships two engines:

- **stagehand** (the default) is the MIT-licensed, open-source engine from Browserbase. It is built around resilient, self-healing automation with act/extract/observe primitives, and it adapts well to pages that change between runs.
- **builtin** is an in-repo Anthropic tool-use loop driving Playwright underneath. It is used automatically for cloud grids the default engine cannot attach to, and it has a bonus: when you record, it captures a full Playwright trace in addition to the screenshot and video.

You usually do not think about engines at all — the default handles local and DevTools-endpoint runs, and the CLI auto-switches to the builtin engine when a grid requires it. You can force one explicitly with `--engine builtin` if you want the trace artifact.

The model is the more interesting choice, because it determines both capability and cost. BrowserBash is **Ollama-first**: it auto-detects a local Ollama install before anything else, which means free, local inference with no API keys and nothing leaving your machine. The resolution order is Ollama, then Anthropic, then OpenRouter, so the default experience costs nothing. The fully free stack is two lines:

```bash
ollama pull qwen3                 # any tool-capable local model works
browserbash run "Open https://example.com and store the page heading as 'h1'"
```

If you want more horsepower, you have options without changing how you write tests. OpenRouter exposes hundreds of models behind one key — including genuinely free ones such as `openai/gpt-oss-120b:free` — and you can bring your own Anthropic key when you want a frontier model. One practical note that will save you debugging time: very small local models (roughly 8B parameters and under) get unreliable on long multi-step objectives. A model in the Qwen3 or Llama 3.3 70B class behaves far better for real flows. This is a genuine operational consideration, not a footnote.

## Stage three: where the browser runs

The same objective can drive a browser in several places, and switching between them is a single flag — the test prose never changes. This is one of the quiet superpowers of a CLI-shaped tool: the interface stays identical whether the browser is on your laptop or in a data center.

| Provider | Where the browser runs | Switch with |
|---|---|---|
| `local` (default) | Chrome/Chromium on your machine | nothing — it is the default |
| `cdp` | Any Chrome DevTools Protocol endpoint (your grid, a Docker container, a Playwright MCP-managed browser) | `--cdp-endpoint ws://...` |
| `browserbase` | Browserbase cloud browsers | `--provider browserbase` |
| `lambdatest` | LambdaTest cloud grid | `--provider lambdatest` |
| `browserstack` | BrowserStack Automate grid | `--provider browserstack` |

So a test you authored against your local Chrome runs unchanged on a cloud grid:

```bash
browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, and verify the inventory page is shown" \
  --provider lambdatest --headless
```

Cloud providers need their own credentials (set once via environment variables or `browserbash login`), and the cloud-grid providers use the builtin engine, which speaks the Anthropic API — so pair them with an Anthropic key or an Anthropic-compatible gateway. Locally, none of that applies: it is your Chrome and your local model, free.

## Stage four: results a machine can act on

This is where a CLI built for testing pulls ahead of a chat-style demo. A run produces two outputs at once.

For a human, there is a readable verdict: what the agent did, what it found, and whether the objective held. For a machine, there is **agent mode**. Add `--agent` and stdout becomes NDJSON — one JSON object per line, with a stable schema — while all human-readable text moves to stderr. Step events stream as the run executes:

```json
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked ref:12"}
```

The final line is always a single terminal event carrying the verdict and any structured data the objective asked it to capture:

```json
{"type":"run_end","status":"passed","summary":"Login flow verified","final_state":{"order_id":"12345"},"duration_ms":48211,"steps_executed":9,"provider":"local"}
```

Anything you phrase as "store ... as 'name'" lands in `final_state`, so you can pull it downstream without scraping prose. And because the terminal event is always the last line, the verdict is one `tail -1 | jq` away:

```bash
out=$(browserbash run "Open https://example.com and store the page title as 'title'" --agent --headless)
title=$(echo "$out" | tail -1 | jq -r '.final_state.title')
```

Underpinning all of it are **exit codes as the contract**: `0` passed, `1` failed, `2` error, `3` timeout. This is the part that makes the tool trustworthy in automation. A machine never has to infer success from a sentence. `1` is a real product or assertion failure that a human should investigate. `2` and `3` are environment signals — a grid hiccup, a dead endpoint, a run that outlived its budget — where one automatic retry is reasonable before failing the build. Pipelines that collapse those two categories train teams to rerun real failures until they accidentally pass.

## Committable tests in markdown

One-liners are perfect for quick checks, but real suites need to live in the repository, get reviewed in pull requests, and be readable by people who do not write code. For that, BrowserBash uses markdown test files where each list item is a step:

```markdown
# Checkout smoke test

- Open https://www.saucedemo.com
- Log in as {{user}} with password {{password}}
- Add the "Sauce Labs Backpack" to the cart
- Open the cart and proceed to checkout
- Fill first name "Ada", last name "Lovelace", zip "94016"
- Continue and finish the order
- Verify the page shows "Thank you for your order!"
- Store the order confirmation text as 'confirmation'
```

Run it, and a `Result.md` report lands next to the file:

```bash
browserbash testmd run ./checkout_test.md --headless \
  --variables '{"user":"standard_user","password":{"value":"secret_sauce","secret":true}}'
```

Three features make this production-grade. The `@import ./helpers/login.md` directive composes shared steps, so a reusable login block lives in one place. The `{{variables}}` keep environments and credentials out of the committed file. And anything marked `{"value": "...", "secret": true}` is masked as `*****` everywhere it would otherwise print — including the NDJSON — which matters because agent transcripts get logged verbatim. A non-engineer can read the diff of a `*_test.md` file in review and actually understand what changed, which is something a page-object-heavy test suite cannot claim.

## Recordings: a replay for the 2 a.m. failure

When a smoke test fails on a server you cannot see, you want a replay. Add `--record` to any run and BrowserBash captures a screenshot and a stitched `.webm` session video on either engine (video uses ffmpeg, which is bundled). The builtin engine additionally captures a Playwright trace, giving you the same time-travel debugging artifact Playwright users already know.

```bash
browserbash run "Open https://www.saucedemo.com and verify the login form is visible" \
  --record --engine builtin
```

Every run is also kept in a private on-disk store with secrets masked. You have two ways to browse that history, and both can be entirely local and private:

```bash
browserbash dashboard          # free, no account, serves a local dashboard you own
```

That opens a local view listing your runs, each with its verdict, extracted values, and recording. Nothing leaves your machine. If you want history across machines and shareable per-run pages, there is an optional cloud dashboard — opt-in per run:

```bash
browserbash connect --key bb_...                 # one-time, after creating a free account
browserbash run "..." --record --upload          # push THIS run to the cloud
```

Without `--upload`, nothing is sent anywhere. This is the privacy default worth underlining: an AI browser testing CLI that runs the model and the browser locally means your pages, your credentials, and your run data stay on your hardware unless you explicitly choose otherwise. On the free tier, cloud runs are kept for 15 days.

## Wiring it into CI

Because the interface is exit codes plus NDJSON — not prose you have to grep — the CLI drops into CI cleanly. Here is a complete GitHub Actions job:

```yaml
name: smoke
on: [push]
jobs:
  browser-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g browserbash-cli
      - run: browserbash testmd run ./tests/checkout_test.md --agent --headless --timeout 180 > smoke.ndjson
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: smoke-ndjson
          path: smoke.ndjson
```

There is no "parse results" step. The run fails exactly when the test fails, because the exit code is the verdict. Note the redirect: with `--agent`, NDJSON goes to stdout and human-readable logs go to stderr, so `smoke.ndjson` stays clean while the Actions log stays readable. A common refinement is to auto-retry only the environment-flavored exits:

```bash
browserbash testmd run ./tests/checkout_test.md --agent --headless --timeout 180 > smoke.ndjson
code=$?
if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
  echo "infra-flavored exit ($code) - retrying once" >&2
  browserbash testmd run ./tests/checkout_test.md --agent --headless --timeout 180 > smoke.ndjson
  code=$?
fi
exit $code
```

The same NDJSON-and-exit-code contract is exactly what an AI coding agent needs to verify its own work. An agent that just wrote a frontend fix can call `browserbash run "..." --agent`, read the verdict from the exit code, and attach the `run_end` line to its pull request — no prose parsing, no brittle log scraping. That is the difference between a tool built for chat and one built for automation.

## How the CLI approach compares to code-first frameworks

An AI browser testing CLI is not a drop-in replacement for everything. The honest framing is that plain-English AI tests and code-first frameworks like Playwright, Cypress, or Selenium occupy different bands of work, and most teams benefit from running both. Here is a fair, high-level comparison using only well-known facts about the established tools.

| Dimension | AI browser testing CLI (BrowserBash) | Code-first framework (Playwright / Cypress / Selenium) |
|---|---|---|
| Test authoring | Plain-English objective or markdown steps | Code with explicit locators and assertions |
| Element targeting | Agent resolves elements at run time, no selectors | You write and maintain selectors / page objects |
| Execution model | LLM plans steps per run; goal-deterministic | Same instructions every run; path-deterministic |
| Speed per action | Seconds (includes model inference) | Milliseconds (direct protocol commands) |
| Maintenance on UI change | Often none — the agent adapts | Update locators when the DOM shifts |
| Flakiness model | Self-healing; re-reads the page each run | Auto-waiting (framework-dependent) reduces timing flakes |
| Debugging artifacts | Screenshot + `.webm` video; trace on builtin engine | Mature trace/video tooling (framework-dependent) |
| CI contract | Exit codes 0/1/2/3 + NDJSON events | Test-runner exit status + reporters |
| LLM / model cost | Free with local Ollama; paid models optional | None |
| Readable by non-engineers | Yes | No |
| Best fit | New coverage, churny UIs, smoke and journey tests | Large stable regression suites, sub-second budgets |

A couple of cells deserve a footnote. "Goal-deterministic" is the key honest caveat on the AI side: the agent reaches the same verdict but may take a slightly different path each run. And the speed gap is decisive at scale — a twelve-test smoke suite will not notice per-step inference, but an 800-test regression wall absolutely will. Keep the big deterministic suite where it is; that is what it is for.

### When to choose which

Reach for a **code-first framework** when you have a large, stable regression suite, when per-test budgets are sub-second, when you need pixel-precise interactions or low-level network interception, when a fully deterministic, network-free execution trace is mandatory for compliance, and when your test authors are engineers who live in the codebase.

Reach for an **AI browser testing CLI** when you need new coverage today and cannot afford to write locators first, when the UI churns weekly and selector maintenance is eating your time, for smoke tests and happy-path journeys and post-deploy sanity checks, when you want a test a product manager can read and approve in review, and when you want to run everything locally and for free before any model bill exists.

The realistic pattern is coexistence. Keep the deterministic regression wall in your existing framework, and move the handful of flows that break most often for selector reasons (not product reasons) into plain-English tests. Both run in the same pipeline; both gate merges through the same exit-code contract, so your CI configuration does not care which tool produced the verdict. There is a deeper, tool-by-tool breakdown of this on the [BrowserBash blog](https://browserbash.com/blog), and the [docs](https://browserbash.com/learn) cover engines, providers, and the markdown test format in full.

## A five-minute starter path

If you want to try the whole pipeline yourself, here is the shortest route from zero to a passing test, entirely free and local:

1. Install Ollama and pull a capable model: `ollama pull qwen3` (or a 70B-class model if your hardware allows).
2. Install the CLI: `npm install -g browserbash-cli`.
3. Run a one-liner against the demo site (the `browserbash run` command from the top of this guide) and watch the agent log its steps.
4. Add `--record` and then `browserbash dashboard` to replay the run in a local, private dashboard.
5. Move the flow into a `checkout_test.md` file, parameterize secrets with `{{variables}}`, and run it with `browserbash testmd run`.
6. Drop the markdown test into a CI job with `--agent --headless` and let the exit code gate your merges.

By step six you have a committable, reviewable, plain-English test that runs locally for free, records its own replay, and reports a machine-readable verdict to CI — without a single selector or wait in sight.

## FAQ

### Do I need API keys or a paid model to use an AI browser testing CLI?

No. BrowserBash is Ollama-first, so the default path runs a model locally with no API keys and no per-run cost. The tool itself is free and open source under Apache-2.0. You can optionally add OpenRouter (which includes free models) or your own Anthropic key when you want more capability, but nothing about the core workflow requires payment, and nothing is uploaded anywhere unless you explicitly pass `--upload`.

### How does the agent click elements without selectors?

It re-reads the page at each step. The engine captures an accessibility-oriented snapshot of what is currently visible and interactive, gives that to the model along with your objective, and the model decides the next concrete action — click this control, type into that field, verify this text. Because the target is resolved against the live page every run, a renamed class or restructured DOM that would break a hardcoded selector is usually a non-event.

### Is the result reliable enough for CI gates?

Yes, when you use it for the right band of work. The verdict arrives as a process exit code — `0` passed, `1` failed, `2` error, `3` timeout — so CI never infers success from prose. You bound runs with explicit `verify` steps, a step cap, and a `--timeout`, and you pair them with a capable model (Qwen3 or Llama 3.3 70B class) for long flows. For smoke tests, journeys, and fast-moving coverage this is solid; for an 800-test deterministic regression wall, keep a code-first framework.

### Can my AI coding agent call it directly?

That is a primary use case. Run with `--agent` and stdout becomes NDJSON with a stable schema while the exit code carries the verdict, so an AI coding agent can invoke `browserbash run "..."` like a function, read pass/fail from the exit code, and attach the terminal `run_end` line to a pull request. There is no prose to parse and no log format that a tooling upgrade might silently change.

---

Ready to try AI browser testing from your terminal? It is free and open source — install with `npm install -g browserbash-cli`, run your first test locally against Ollama in minutes, and [create a free account](https://browserbash.com/sign-up) when you want cloud run history and shareable per-run replays.
