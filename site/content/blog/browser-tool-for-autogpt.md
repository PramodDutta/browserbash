---
title: A browser tool for AutoGPT-style agents
description: "An AutoGPT browser tool that returns deterministic NDJSON instead of screen-scraped text, so autonomous agents can act on web verdicts, not parse prose."
date: 2026-03-27
category: agents
---

If you have ever watched an AutoGPT-style agent try to "use the web," you know the failure mode. The agent calls its browse command, gets back a wall of scraped text and links, feeds that back into the model, and then guesses what happened. An AutoGPT browser tool that works this way is fragile by construction: the page rendered differently than the model expected, a cookie banner ate the content, JavaScript never resolved, and the agent confidently reports a result that is half-hallucinated. The fix is not a smarter prompt. It is a different contract between the agent and the browser — one where the browser does the acting and hands back a structured, machine-readable verdict instead of a text dump to re-interpret.

That is the design BrowserBash leans into. It is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You give it a plain-English objective, an AI agent drives a real Chrome browser step by step, and in agent mode it emits NDJSON — one JSON object per line — ending in a verdict with a clean exit code. For an autonomous planner like AutoGPT, that is the difference between "scrape and hope" and "call a function and branch on the result."

## The problem with screen-scraping as a browser tool

AutoGPT's classic web access has always been a scraping tool at heart. The historical implementation (`web_selenium.py`, exposed to the agent as a `browse_website` command) drives a Selenium-controlled Chromium, then extracts text and links from the page and returns them to the model as context. That is genuinely useful for read-only research — "summarize this article," "find the pricing on this page" — but it has well-documented limits that show up the moment an agent needs to *do* something rather than *read* something.

Three problems recur:

**JavaScript-heavy pages return noise.** A famous early AutoGPT issue was that browsing a Twitter profile returned nothing but "enable JavaScript to use Twitter." Single-page apps, infinite scroll, lazy-loaded dashboards, and anything behind a client-side router routinely hand the scraper an empty shell or a loading spinner. The agent then reasons over garbage.

**Scraped text is not an action surface.** The original `web_selenium` could read text and links, but not reliably click a specific button, fill a specific field, or confirm that a submit actually went through. So "log in and check the order status" becomes a guessing game: the model invents a plausible next step from the scraped DOM and frequently gets it wrong.

**The output format is unstable.** Even when scraping works, the agent receives prose. Prose is exactly what you do not want a downstream program to parse. The model has to re-read the page on every loop, token costs balloon, and there is no clean signal for "this succeeded" versus "this failed" that your orchestration code can branch on without another LLM call.

The modern hosted AutoGPT Platform improved the developer experience with a visual Agent Builder and composable blocks, including web-search and web-scraping blocks that pass page content into an LLM block for analysis. That is a real step up for building flows. But notice the shape is the same: scrape the page, dump the content into the model, let the model decide what happened. The contract is still "text in, interpretation out." For research that is fine. For acting on a live web app and getting a trustworthy yes/no back, you want something deterministic at the boundary.

## What "deterministic NDJSON over screen-scraping" actually means

The angle here is not "BrowserBash is a better scraper." It is that the right primitive for an autonomous agent is not scraped HTML at all — it is a *typed result of an attempted task*. You hand the browser tool an objective, it runs the steps, and it returns a small, predictable object:

- a final **status**: `passed`, `failed`, `error`, or `timeout`
- a one-line **summary** of what happened
- a **final_state** map carrying any values you asked it to extract
- timing and step metadata

The agent never re-reads a DOM. It reads one JSON line. That line tells it whether to proceed, retry, or escalate. The browser did the interpretation work *inside* the run, where a vision-and-DOM-aware loop belongs, and exported only the conclusion.

Here is the minimal call:

```bash
browserbash run "Open https://app.example.com, log in as demo@example.com, open the latest invoice, and store its total as 'invoice_total'" \
  --agent --headless --timeout 120
```

With `--agent`, stdout is NDJSON. Progress streams as it happens:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened app.example.com"}
{"type":"step","step":2,"status":"passed","action":"type_text","remark":"Entered email"}
{"type":"step","step":4,"status":"passed","action":"click","remark":"Submitted login"}
```

And the final line is always a single terminal event:

```json
{"type":"run_end","status":"passed","summary":"Logged in and read the latest invoice total.","final_state":{"invoice_total":"$420.00"},"duration_ms":38211,"steps_executed":7}
```

The agent does not parse the steps unless it wants a trail for its own logs. It reads the last line, pulls `final_state.invoice_total`, and moves on. There is nothing to "interpret." That is the whole point.

## Wiring it into an AutoGPT-style loop

AutoGPT executes a think → act → observe loop. The "act" step calls a tool; the "observe" step feeds the tool's output back into the model. A scraping browser tool makes "observe" expensive and unreliable, because the observation is a page of text the model must re-digest. A verdict-returning browser tool makes "observe" trivial: the observation is one JSON object with a known schema.

The cleanest integration is to register BrowserBash as a shell tool and consume the last NDJSON line. In a bash-shaped tool wrapper:

```bash
out=$(browserbash run "$OBJECTIVE" --agent --headless --timeout 120)
code=$?
verdict=$(echo "$out" | tail -1)

case $code in
  0) echo "PASS $(echo "$verdict" | jq -r '.summary')" ;;
  1) echo "FAIL $(echo "$verdict" | jq -r '.summary')" ;;
  2) echo "ERROR — tooling problem, retry once" ;;
  3) echo "TIMEOUT — raise --timeout or split the objective" ;;
esac
```

The exit code *is* the observation your orchestration code branches on, before any LLM is involved. `0` passed, `1` failed, `2` error, `3` timeout. That mapping is stable across versions, which is exactly what you cannot say about scraped-text formats that shift every time a site redesigns.

Extracted values flow back through `final_state`. Phrase any data you need as "store X as 'name'" in the objective, and it lands in `run_end.final_state` under that key. The agent gets typed data — a string, a number it can coerce, a list — not a paragraph it has to mine for the number.

If your agent already manages its own Chrome (say it launched one via a DevTools endpoint), you do not have to spin up a second browser. Attach to the existing one:

```bash
browserbash run "On the open tab, accept the cookie banner and store the H1 text as 'headline'" \
  --agent --cdp-endpoint ws://localhost:9222/devtools/browser/<id>
```

That `--cdp-endpoint` path is the bridge between BrowserBash and any browser your stack already controls, which keeps a single session and a single set of cookies in play.

## NDJSON vs scraped text: a direct comparison

The two approaches sound similar — "the agent uses a browser" — but the contract is fundamentally different. Here is the honest side-by-side.

| Dimension | Screen-scraping browser tool (classic AutoGPT `browse_website`) | NDJSON verdict tool (BrowserBash `--agent`) |
| --- | --- | --- |
| What the agent receives | Raw page text + links, as prose | One JSON object per line; final verdict object |
| Who interprets the page | The LLM, on every loop, from scraped text | The browser-driving loop, once, inside the run |
| Acting on the page | Limited; reliable read, shaky click/fill | Click, type, navigate, submit as part of the objective |
| Success signal | Inferred by the model from text | Explicit `status` + process exit code |
| JS-heavy / SPA pages | Often returns empty shells or "enable JS" | Drives a real Chrome that renders the app |
| Token cost per observation | High — full page re-fed to the model | Low — one small JSON line |
| Parseability for code | Poor; format drifts with site changes | Stable schema; `tail -1 \| jq` |
| Determinism at the boundary | Low | High (verdict + exit code are fixed contract) |

Read the table honestly: scraping is not useless. If your agent's job is genuinely "go read these ten pages and summarize them," a scraping tool is the right tool and adds a verdict layer you may not need. The NDJSON contract earns its keep specifically when the agent must *act* — log in, click through a flow, submit a form, confirm a state change — and then make a programmatic decision based on whether that worked. For more on the agent-facing surface, the [BrowserBash features page](https://browserbash.com/features) lays out what each mode emits.

## The model story: Ollama-first, no keys, no data leaving the box

A real concern for anyone running autonomous agents over the web: where does the page content go? With a hosted scraping tool, the page text travels to whatever model the platform calls. BrowserBash defaults to a local-first model resolution that keeps this fully on your machine when you want it.

The default model is `auto`. It resolves in order: a local **Ollama** install first (`ollama/<model>`, free, no API keys, nothing leaves your machine); then `ANTHROPIC_API_KEY` if present (`claude-opus-4-8`); then `OPENAI_API_KEY` (`openai/gpt-4.1`); otherwise it errors with guidance. So an agent builder who already runs Ollama gets a guaranteed $0 model bill and a guarantee that no page content is shipped to a third party.

```bash
browserbash run "Open the staging dashboard and store the active-user count as 'active_users'" \
  --agent --headless --model ollama/qwen3
```

One honest caveat, because it matters for autonomous loops: very small local models (8B and under) get flaky on long, multi-step objectives. They lose the thread around step eight, mis-click, or hallucinate a completed step. The sweet spot is a mid-size local model — Qwen3 or a Llama 3.3 70B-class model — or a capable hosted model for the genuinely hard flows. If you are pinning a hosted or routed model, you can point at OpenRouter, an OpenAI model, a Google model through Stagehand, or an Anthropic-compatible gateway. The [pricing page](https://browserbash.com/pricing) spells out that the CLI itself is free and open source; the cost question is purely which model you choose to run.

## Engines and providers: who interprets, where it runs

Two knobs matter when you wire a browser tool into an agent, and BrowserBash keeps them separate.

The **engine** is who interprets your English. The default is `stagehand` (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals when a page shifts. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright, which is auto-selected for the LambdaTest and BrowserStack providers. Switch with `--engine stagehand|builtin`.

The **provider** is where the browser actually runs (`--provider`):

- `local` (default) — your own Chrome on the machine
- `cdp` — any DevTools endpoint via `--cdp-endpoint ws://...`
- `browserbase` — cloud browsers (needs `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`)
- `lambdatest` — cloud grid (needs `LT_USERNAME` + `LT_ACCESS_KEY`, auto builtin engine)
- `browserstack` — cloud grid (needs `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`, auto builtin engine)

For most AutoGPT-style use, `local` with `--headless` is the right default — the agent drives Chrome on the same box, no cloud account, no per-run egress. When you need scale or cross-browser coverage, the cloud providers are a flag away. The same NDJSON contract holds across every provider, so your agent's parsing code never changes when you move where the browser runs. The [tutorials](https://browserbash.com/tutorials) walk through each provider end to end if you want a concrete setup.

## Keeping the agent honest: secrets, records, and a run store

Autonomous agents that touch the web are a security surface. Two things make BrowserBash easier to trust inside a loop you are not babysitting.

First, secrets. When you template variables into an objective, mark sensitive ones as secret and they are masked as `*****` in every log line — including the NDJSON. That matters specifically because agent transcripts get logged verbatim, and you do not want a password sitting in plaintext in a step event your orchestrator dumped to disk.

Second, an audit trail. Every run is kept on-disk at `~/.browserbash/runs` (secrets masked, capped at the last 200 runs). When an agent makes a decision based on a verdict, you can go back and see exactly which steps produced it. Add `--record` and the run captures a screenshot plus a `.webm` session video via bundled ffmpeg; the builtin engine also writes a Playwright trace. So when an autonomous agent reports "the checkout flow passed," you have a video to confirm it actually did.

```bash
browserbash run "Add the first product to cart, go to checkout, and store the cart total as 'cart_total'" \
  --agent --headless --record
```

Nothing leaves your machine unless you opt in. There is an optional free local dashboard (`browserbash dashboard`, served at localhost:4477, fully local) to browse runs visually, and an optional cloud dashboard via `browserbash connect --key bb_...` plus `--upload` per run — but without `--upload`, every byte stays local. The opt-in design is deliberate for agent workloads, where you may be driving internal apps you do not want mirrored anywhere.

## Committable agent objectives with markdown tests

There is a second pattern that fits autonomous agents especially well: instead of generating a fresh objective every loop, give the agent a library of *committed* tasks it can run by name. BrowserBash markdown tests (`*_test.md`) are exactly that — a checked-in file where each list item is a step, `{{variables}}` get templated in, and `@import` lets you compose shared setup like login.

```bash
browserbash testmd run ./checkout_test.md \
  --agent \
  --variables '{"base_url":"https://staging.example.com","email":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

Secret-marked variables are masked as `*****` in every log line, and each run writes a human-readable `Result.md` alongside the NDJSON. For an agent, the value is that the *what* is reviewable by humans in version control while the *result* is still machine-parseable. A planner can pick a test by filename, run it with `--agent`, and branch on the exit code — getting the determinism of a written script with the flexibility of natural-language steps. The [learn section](https://browserbash.com/learn) goes deeper on markdown tests and templating.

## When to choose a verdict tool, and when scraping is genuinely fine

Be balanced here, because the wrong tool wastes everyone's time.

**Choose an NDJSON verdict tool (BrowserBash `--agent`) when:**

- Your agent must *act* on a live web app — log in, click through a flow, submit a form — not just read.
- You need a programmatic success/failure signal your orchestration code can branch on without an extra LLM call.
- The target is a JavaScript-heavy SPA or dashboard where scrapers return empty shells.
- You want extracted values as typed `final_state`, not prose to re-parse.
- You care about keeping page content local (Ollama-first) and want a masked, recorded audit trail.

**A classic scraping browser tool is genuinely the better fit when:**

- The job is pure read-only research over many pages and you just want their text summarized.
- You are already inside the hosted AutoGPT Platform and a web-scraping block plus an LLM block covers your flow.
- You do not need a deterministic verdict, just content for the model to reason over.
- The pages are mostly static and render fine without JavaScript.

The two are not mutually exclusive. A common, sane architecture: use a scraping tool for the "go research" legs of a plan, and a verdict-returning browser tool for the "now go do it and confirm it worked" legs. They optimize for different halves of an autonomous workflow. If you want to see a worked example of the acting half, the [case study](https://browserbash.com/case-study) shows the verdict pattern in a real flow.

## A realistic end-to-end shape

Putting it together, here is what an AutoGPT-style agent's browser leg looks like with a verdict tool in place. The planner decides it needs to confirm a user can complete signup on the staging build. It does not scrape the signup page and guess. It calls:

```bash
browserbash run "Open https://staging.example.com/signup, register a new account with a random email and password, confirm you reach the dashboard, and store the welcome message as 'welcome'" \
  --agent --headless --timeout 180 --record
```

The agent reads the exit code. If it is `0`, it pulls `final_state.welcome` and reports signup healthy with the exact message it saw. If it is `1`, it has a failed verdict with a summary and a recorded video to attach to whatever it does next — open an issue, alert a human, retry on a cloud provider. If it is `3`, the flow timed out and the planner splits the objective or raises the timeout. At no point did the model re-read a page of scraped HTML. The observation was one JSON line with a known shape.

That is the whole argument for deterministic NDJSON over screen-scraping. It is not that scraping is bad — it is that an autonomous agent acting on the web needs a result it can *trust and branch on*, and a typed verdict is a far better primitive for that than a text dump it has to interpret. You can browse the source and the agent guide on [GitHub](https://github.com/PramodDutta/browserbash), or grab the package from [npm](https://www.npmjs.com/package/browserbash-cli).

## FAQ

### How do I give AutoGPT a browser tool that returns structured data instead of scraped text?

Register BrowserBash as a shell tool and call it with the `--agent` flag. Instead of returning a page of scraped HTML, the run emits NDJSON ending in a single `run_end` object with a `status`, a `summary`, and a `final_state` map of any values you asked it to extract. Your agent reads the last line and the process exit code, then branches on a typed result rather than re-interpreting prose every loop.

### Why is NDJSON better than scraped page text for an autonomous agent?

Scraped text forces the model to re-read and re-interpret a page on every loop, which is expensive, format-unstable, and unreliable on JavaScript-heavy pages that return empty shells. NDJSON gives the agent a small object with a stable schema and a clean exit code, so your orchestration logic can decide pass, fail, retry, or escalate without another LLM call. The browser does the interpretation once, inside the run, and exports only the conclusion.

### Does BrowserBash send the page content to a cloud model?

Not unless you choose to. The default `auto` model resolves to a local Ollama install first, so page content and prompts stay entirely on your machine with no API keys and a $0 model bill. It only falls back to a hosted model like Claude or GPT if you have those API keys set, and cloud upload of runs is opt-in via a separate `--upload` flag.

### Can the agent act on a page, or only read it?

It can act. You write a plain-English objective that includes clicking, typing, navigating, and submitting, and the engine drives a real Chrome browser through those steps before returning a verdict. This is the key difference from a classic read-only scraping tool, which reliably reads text and links but cannot dependably click a specific button or confirm a form actually submitted.

Install it and wire it into your agent loop:

```bash
npm install -g browserbash-cli
```

An account is optional — the CLI runs fully local. If you want the cloud dashboard later, [sign up here](https://browserbash.com/sign-up).
