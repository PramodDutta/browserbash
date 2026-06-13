---
title: Free AI Browser Automation: No API Keys, No Credit Card
description: "Free AI browser automation with no API keys and no credit card: drive a real browser from plain English using open-source tools and local models."
date: 2026-06-13
category: guide
---

Most "AI-powered" automation tools ask for a credit card before they do anything useful. You sign up, paste in an API key, watch a meter start ticking, and only then get to write your first test. This guide takes the opposite path. Free AI browser automation is genuinely achievable today — no API keys, no credit card, nothing leaving your machine — if you assemble the stack correctly. The catch is that "free" has two separate meanings in this space, and tools that nail one often quietly charge you on the other. Below is the fully-free stack, end to end, with real commands you can run tonight.

The premise is simple: you write a plain-English objective, an AI agent drives a real Chrome or Chromium browser, and you get back a verdict plus structured results. No selectors, no page objects, no Selenium grid to babysit. The question is whether you can do all of that without ever reaching for your wallet. You can — but only if every layer of the stack is free, and that takes a little deliberate assembly.

## The two costs hiding behind "free"

When people say they want free browser automation, they are almost never trying to escape a *license* fee. Playwright, Puppeteer, and Selenium are all open source and cost nothing to install. The costs that actually bite are different, and there are two of them.

**The first cost is authoring and maintenance.** Traditional automation is code. Someone writes the locators, stores them in page objects, and patches them every time the frontend changes. A renamed test id or a restructured DOM turns a green suite red for reasons that have nothing to do with the product being broken. That is engineering time, spent forever, and it is the cost AI automation is supposed to remove by letting you describe intent in plain English instead.

**The second cost is the AI bill.** Here is the trap. Many "AI testing" products replace your maintenance cost with a metered inference cost. You stop writing selectors, but now every run pings a hosted model and your invoice grows with your test count. If the entire reason you reached for AI was to reduce overhead, swapping engineer-hours for a per-run API charge can defeat the point — and a lot of tools in this category require a paid model and a credit card on file just to start.

So the only honest definition of *free* AI browser automation has two halves:

1. **An open-source tool** with a real open-source license, not a free trial that expires.
2. **The ability to run the underlying model locally for zero dollars**, with no API key required.

A tool that is open source but forces you onto a paid hosted model is only half-free. A tool that gives you a free model but is closed-source SaaS is the other half. You want both halves, and the rest of this guide is about getting them.

## The fully-free stack, layer by layer

Browser automation that uses AI has four moving parts, and each one is a place where a vendor can insert a charge. To stay at zero, every layer has to be free:

- **The tool** — the CLI or framework that turns your objective into browser actions. Must be open source.
- **The model (LLM)** — the brain that plans the steps. Must have a free option, ideally local.
- **The browser** — where pages actually load. Your own Chrome is free; hosted browser grids usually are not.
- **The reporting and storage** — where runs and recordings live. Local storage is free; cloud dashboards may not be.

The good news is that a fully-free configuration of all four exists and is the *default* for at least one tool. Let me walk through a concrete example with real commands, then zoom back out to the general principles so you can apply them to whatever you choose.

## A worked example: BrowserBash

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI, built by The Testing Academy. It fits the definition above because it satisfies both halves of "free": the tool itself is open source, and its default model path runs locally for zero dollars with no key. I am using it as the worked example because it is built specifically for the no-key, no-card workflow this guide is about — but the principles generalize to any tool you pick.

Installation is a single npm command:

```bash
npm install -g browserbash-cli
```

Your first automation is one line. You write what you want in English; the agent drives a real browser and returns a verdict:

```bash
browserbash run "Open https://example.com and confirm the page heading says 'Example Domain'"
```

No selectors. No config file. No API key prompt. If you have a local model running (more on that next), this command costs nothing and nothing leaves your machine.

### Layer 1: the tool is open source

BrowserBash ships under Apache-2.0, so the "tool" layer is free with no asterisk. It exposes two execution engines under the hood. The default, `stagehand`, is the MIT-licensed open-source engine from Browserbase. The second, `builtin`, is an in-repo Anthropic tool-use loop. You do not have to choose up front — the default works out of the box — but it is worth knowing both engines are open and you are never locked into a proprietary core.

### Layer 2: the model runs locally and free

This is the layer where most "free" claims fall apart, so it deserves the most attention. BrowserBash is **Ollama-first**: if [Ollama](https://ollama.com) is running on your machine, that is the brain it uses by default — free, local, no API keys, no data leaving your laptop. The model is auto-detected in a fixed order: it looks for a running Ollama first, then an Anthropic key, then an OpenRouter key. Reaching for a paid cloud model is therefore always an explicit, deliberate step, never a surprise on your next invoice.

The zero-config free path looks like this:

```bash
ollama pull qwen3
browserbash run "Open https://example.com and store the main heading as 'h1'"
```

That is the entire fully-free stack in two commands: the MIT Stagehand engine, your local Chromium, and a local Ollama model. No key, no card, no metered inference.

If you do not want to run a model locally — say you are on a thin laptop — there is still a no-credit-card option. BrowserBash supports **OpenRouter**, which offers genuinely free models such as `openai/gpt-oss-120b:free`. You bring an OpenRouter key, but you can point it at a free model and pay nothing for inference:

```bash
browserbash run "Search GitHub for 'browser automation' and report the top repository name" \
  --model openrouter/openai/gpt-oss-120b:free
```

Anthropic Claude is supported too, on a strict bring-your-own-key basis, for when you want a frontier model on a particularly gnarly flow. It is optional. The defaults never assume it.

A word of realism on local models: smaller models (roughly 8B parameters and under) tend to be flaky on long, multi-step objectives. They handle single-page work — open a page, store a heading, verify a banner — comfortably. For long end-to-end flows, the larger Qwen3 / Llama 3.3 70B class is the sweet spot. "Free" does not mean "magic," and matching model size to task length is the single biggest lever on reliability.

### Layer 3: the browser is your own Chrome

By default, BrowserBash drives the browser already on your machine — the `local` provider. That is free. It supports headless runs for speed and for CI, where there is no display:

```bash
browserbash run "Log in at {{base_url}} and verify the dashboard loads" --headless
```

The provider layer is also where you would *optionally* trade some money for scale or cross-browser coverage. One flag switches the execution target: `--provider cdp` for any DevTools endpoint, or `--provider browserbase`, `--provider lambdatest`, `--provider browserstack` for a hosted grid.

```bash
browserbash run "Open the pricing page and confirm three plan cards are visible" --provider lambdatest
```

Those hosted grids are not part of the free stack — but the point is that staying free is the default, and going to the cloud is a single, explicit flag you opt into only when you need it.

### Layer 4: reporting stays local unless you choose otherwise

The last place vendors charge is storage and dashboards. BrowserBash keeps this free by default too. Nothing leaves your machine unless you explicitly pass `--upload`.

You can capture rich artifacts locally at no cost. The `--record` flag captures a screenshot and a session video (a stitched `.webm`) on any engine; the `builtin` engine additionally captures a Playwright trace:

```bash
browserbash run "Complete checkout with the test card and confirm the order id appears" --record
```

For run history and replay, there is a free, private **local dashboard**:

```bash
browserbash dashboard
```

There is also an optional cloud dashboard. You create a free account, connect once, and add `--upload` to push a run to the cloud for history, recordings, and per-run replay:

```bash
browserbash connect --key bb_your_key_here
browserbash run "Verify the signup flow end to end" --record --upload
```

On the free tier, cloud runs are retained for 15 days. Crucially, this is opt-in. If you never pass `--upload`, your runs, recordings, and page data stay entirely on your machine.

## Committable tests in plain English

A pile of one-off commands is not a test suite. BrowserBash lets you commit tests as markdown `*_test.md` files, where each list item is a single step. This is where the plain-English model pays off for teams: a product manager can read the test, and a smaller local model stays on rails far better with explicit per-step instructions than with one sprawling sentence.

```markdown
# Signup smoke test

- Open {{base_url}}/signup
- Fill the email field with {{test_email}}
- Fill the password field with {{password}}
- Click the "Create account" button
- Confirm the welcome message is visible
```

You run it with:

```bash
browserbash testmd run signup_test.md
```

Each run writes a `Result.md` next to the test file. Variables use `{{...}}` syntax with secret masking — secrets show up as `*****` in output, so credentials never leak into logs or recordings. Shared steps compose with `@import`, so a login sequence written once can be reused across every test that needs it. None of this requires a key or a card; the markdown suite resolves its model the same Ollama-first way as everything else.

## Built for CI and AI coding agents

A free tool that only works in a human's terminal is half a tool. BrowserBash has an **agent mode** designed for machines: `browserbash run "..." --agent` emits NDJSON — one JSON event per line, on a stable schema — instead of prose you have to scrape. It pairs that with conventional exit codes:

| Exit code | Meaning |
| --------- | ------- |
| `0` | Passed |
| `1` | Failed |
| `2` | Error |
| `3` | Timeout |

```bash
browserbash run "Verify the login form rejects an empty password" --agent --headless
```

This matters for the free stack specifically. Because the output is structured and the exit codes are stable, you can wire BrowserBash into GitHub Actions, GitLab CI, or an AI coding agent's loop without paying for a proprietary reporting layer or writing a fragile prose parser. A CI gate is just a check on the exit code; an AI agent reads the NDJSON events directly. The machine-readable contract is part of what keeps the whole thing genuinely free to operate.

## How this compares to other "free" options

Not every tool that markets itself as free means the same thing, so here is an honest, high-level comparison of the common categories you will run into. This sticks to well-known facts about each category rather than vendor-specific claims.

| Approach | Tool license | Free model path | Plain English, no selectors | Runs locally / no card | Machine-readable output |
| --- | --- | --- | --- | --- | --- |
| BrowserBash (NL CLI) | Open source (Apache-2.0) | Yes — local Ollama or free OpenRouter model | Yes | Yes, by default | Yes — NDJSON + exit codes |
| Playwright / Puppeteer | Open source | N/A (no AI layer) | No — you write code and locators | Yes | Yes — via your own harness |
| AI agent frameworks (libraries) | Often open source | Varies by your model choice | Yes, in code | Depends on chosen model | You build it yourself |
| Self-healing locator engines | Mixed | Varies | Partial — code-first with AI targeting | Depends | Varies |
| Hosted AI testing SaaS | Usually closed | Usually metered/paid | Often yes | Usually no — account + card | Yes, in their UI |

A few honest caveats so this table is fair. Playwright and Puppeteer are superb and completely free — they simply are not AI tools, so "no selectors" does not apply; you trade authoring effort for total determinism. AI agent frameworks are powerful and frequently open source, but they are libraries, not runners: you own the harness, the reporting, and the CI wiring, and whether they are free depends entirely on the model you point them at. Hosted SaaS platforms are often the most polished experience, but "free" there usually means a trial or a capped tier, with your runs living on someone else's infrastructure.

## When to choose which

Free and open source does not mean "right for every job." Here is a balanced read on where each option earns its place.

**Choose a natural-language CLI like BrowserBash when** you want coverage today without writing or maintaining selectors, when non-engineers need to read or write tests, when the UI churns every sprint and brittle locators are pure overhead, or when you specifically need a $0 stack — open-source tool plus a local model — with nothing leaving your machine. It is also a strong fit for smoke tests, journey tests, and ad-hoc extraction jobs, and for AI coding agents that need a browser tool with structured output.

**Choose code-first Playwright or Puppeteer when** you need bit-for-bit deterministic behavior, microsecond-precise timing control, or a very large existing suite that is already stable. A mature Playwright suite is one of the best assets a QA team can own, and nothing here replaces it wholesale.

**Choose an AI agent framework when** you are building a custom product on top of browser automation and want library-level control over the agent loop, and you are comfortable owning the surrounding harness and CI plumbing yourself.

**Choose hosted SaaS when** budget is genuinely not the constraint, you want managed dashboards and test management out of the box, and you are comfortable with your data living on a vendor's servers.

In practice these mix well. A common pattern is a large, stable Playwright suite for the deterministic core, plus a natural-language CLI for the fast-moving surface — new coverage, churny UIs, and the plain-English smoke tests a PM should be able to read. The free stack shines brightest on exactly that fast-moving band, where the cost of maintaining selectors is highest and the value of describing intent in English is greatest.

## Putting the whole free stack together

Here is the entire no-key, no-card workflow in one place, from install to a recorded, committed test:

```bash
# 1. Install the open-source CLI
npm install -g browserbash-cli

# 2. Get a free local model (the brain)
ollama pull qwen3

# 3. Run your first automation — local browser, local model, $0
browserbash run "Open https://example.com and confirm the heading is visible"

# 4. Promote it to a committable markdown test
browserbash testmd run smoke_test.md

# 5. Capture a recording locally, still free
browserbash run "Verify the signup flow end to end" --record

# 6. Wire it into CI with structured output and exit codes
browserbash run "Verify checkout succeeds" --agent --headless
```

Every line above runs without an API key and without a credit card. The browser is yours, the model is local, the recordings sit on your disk, and the output is machine-readable for CI. The only time money enters the picture is when *you* decide to — a hosted grid via `--provider`, a frontier model via your own Anthropic key, or cloud history via `--upload`. The default is, and stays, free.

If you want to go deeper on any single layer — local models, markdown tests, CI exit codes, or recordings — the [BrowserBash Learn hub](https://browserbash.com/learn) walks through each one, and the [blog](https://browserbash.com/blog) has focused write-ups on the Ollama-first stack and CI integration.

## FAQ

### Is AI browser automation really free with no API key or credit card?

Yes, if you assemble the stack correctly. The fully-free path is an open-source tool plus a locally run model. With BrowserBash, that means installing the Apache-2.0 CLI and running a local Ollama model — the default configuration uses your own Chrome and a local model, so there is no API key to enter and no card on file. Nothing leaves your machine unless you explicitly opt in with a flag like `--upload`.

### What is the catch with running models locally instead of paying for a hosted one?

The honest tradeoff is hardware and model size, not money. Local models run on your own CPU or GPU, so very small models (around 8B parameters and under) can be flaky on long, multi-step flows, while the larger Qwen3 / Llama 3.3 70B class is far more reliable. The practical fix is to match model size to task length and split long flows into smaller, explicit steps. You pay in electricity and a bit of speed, not in API fees.

### Can I use BrowserBash in CI without paying for a reporting platform?

Yes. Agent mode (`--agent`) emits NDJSON — one JSON event per line on a stable schema — alongside conventional exit codes (0 passed, 1 failed, 2 error, 3 timeout). That means your CI gate is just a check on the exit code, and any tool or AI agent can read the structured events directly, with no proprietary dashboard and no prose parsing required. Combined with `--headless`, it drops straight into GitHub Actions or any other CI runner.

### Do I have to use a local model, or are there other free options?

You have a choice. The simplest fully-local path is Ollama, which needs no key at all. If you prefer not to run a model locally, OpenRouter offers genuinely free models such as `openai/gpt-oss-120b:free` — you bring an OpenRouter key but pay nothing for inference. Anthropic Claude is also supported on a bring-your-own-key basis when you want a frontier model, but it is entirely optional and the defaults never assume it.

---

Free AI browser automation is not a marketing slogan when the whole stack is open source and local: an Apache-2.0 CLI, a free model, your own browser, and machine-readable output for CI — no keys, no card. When you are ready to add run history and replay, [create a free account](https://browserbash.com/sign-up) and push a run with `--upload`. BrowserBash is free and open source, so you can read the code, run it entirely offline, and keep your data on your own machine for as long as you like.
