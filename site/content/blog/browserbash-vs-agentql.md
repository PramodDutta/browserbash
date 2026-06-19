---
title: BrowserBash vs AgentQL
description: "BrowserBash vs AgentQL compared honestly: objective-driven browser runs versus AgentQL's semantic query language for scraping and automation."
date: 2026-01-16
category: comparison
---

If you have been picking a tool to let AI touch the web, the BrowserBash vs AgentQL question comes up fast, because the two land on opposite sides of one design decision. AgentQL hands you a query language: you write a JSON-like query describing the elements or data you want, and an AI-fine-tuned parser resolves it to Playwright locators. BrowserBash skips the query entirely. You write one plain-English objective, an AI agent drives a real Chrome browser step by step, and you get back a pass/fail verdict plus the structured values it pulled out. Same problem space, very different ergonomics. This article compares them the way a senior SDET would after living with both, and it is honest about where AgentQL is the better fit.

## The core difference: objectives vs queries

The fastest way to understand these tools is to look at what you actually type.

With AgentQL, you write a query that describes a *shape*. Say you want product data off a listing page. You write something like:

```
{
    products[] {
      name
      description
      price(integer)
    }
}
```

AgentQL constructs a simplified semantic representation of the page, feeds it plus your query to an AI model, gets back a mapping, and resolves that mapping to Playwright locators. Element queries (as opposed to data queries) return locators you then drive yourself — click them, fill them, assert on them. The query is the contract. You think in terms of "what do I want off this page" and AgentQL figures out where it lives in the DOM.

With BrowserBash, you write an *intent*. No shape, no field list, no locator vocabulary:

```bash
browserbash run "Go to the products page, open the first item under $50, and confirm it shows an Add to Cart button"
```

An AI agent reads that sentence, then drives a real Chrome browser one action at a time — navigate, look at the rendered page, decide the next move, repeat — until the objective is met or it gives up. It returns a verdict (passed, failed, error, or timeout) and a `final_state` with whatever structured values it extracted along the way. You never name an element. You never declare a schema. You describe the goal, the agent improvises the path.

That is the whole split. AgentQL is a declarative locator/extraction layer you compose into your own automation. BrowserBash is an autonomous run: one objective in, one verdict and a data payload out. Neither is "better" in the abstract — they optimise for different jobs, which is exactly what the rest of this comparison digs into.

## What AgentQL actually is

Let me be precise, because a fair comparison depends on getting the competitor right.

AgentQL is a suite of tools from TinyFish (the `tinyfish-io` org on GitHub) for extracting data and automating workflows on live websites. It is MIT-licensed and ships a Python SDK, a JavaScript SDK, and a REST API, plus a browser-extension debugger and a web playground for authoring queries. Its headline feature is the **AgentQL query language**: natural-language-flavoured selectors that find elements by meaning instead of by CSS path or XPath.

Two query modes matter. A **data query** returns structured JSON shaped exactly like your query — you define the output structure in the query itself, which removes a post-processing step. An **element query** returns Playwright locators so you can interact with the page in your own code. Because queries describe meaning rather than DOM position, AgentQL markets them as self-healing across UI changes and reusable across similar sites, and queries are said to work on public, private, and authenticated pages. AgentQL also integrates with agent frameworks (Langchain, Zapier) and ships an MCP server.

On pricing, as of 2026 AgentQL publishes a Starter tier at $0/month, a Professional tier at $99/month, and custom Enterprise pricing. The model that powers the query parser is a hosted, fine-tuned service; the exact model is not publicly specified, and the free tier carries usage limits typical of a hosted API. The important architectural fact: AgentQL's query resolution runs through TinyFish's hosted service. The SDKs and the language are open source, but the intelligence resolving your queries is a cloud API by default.

That last point is the cleanest line between the two tools, and we will come back to it.

## What BrowserBash actually is

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, created by Pramod Dutta. You install it with one command:

```bash
npm install -g browserbash-cli
```

It needs Node 18+ and Chrome for the default local provider. The latest version is 1.3.1. There is no account required to run anything.

You give it an English objective and an AI agent drives a real Chrome or Chromium browser through it — no selectors, no page objects, no query language. Under the hood, two **engines** can interpret the English. The default is `stagehand` (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals against DOM drift. The second is `builtin`, an in-repo Anthropic tool-use loop driving Playwright, used automatically for the LambdaTest and BrowserStack providers. You switch with `--engine`.

The **provider** decides where the browser actually runs. `local` (default) uses your own Chrome. `cdp` attaches to any DevTools endpoint. `browserbase`, `lambdatest`, and `browserstack` run the browser on those clouds. So you can prototype on your laptop and run the same objective on a grid later by changing one flag.

The model story is the part that matters most against a hosted competitor. BrowserBash is **Ollama-first**. The default model is `auto`, resolved in this order: a local Ollama install first (`ollama/<model>`, free, no keys, nothing leaves your machine); then `ANTHROPIC_API_KEY` (`claude-opus-4-8`); then `OPENAI_API_KEY` (`openai/gpt-4.1`); otherwise it errors with guidance. You can pin any of these with `--model`, including OpenRouter models and an Anthropic-compatible gateway. Run on local Ollama and your model bill is a guaranteed $0, with no page content leaving your box.

Honest caveat, because it changes how you should use it: very small local models (8B and under) get flaky on long multi-step objectives. The sweet spot for hard flows is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. On a tiny model, keep objectives short and concrete. You can read the [features](https://browserbash.com/features) page for the full surface.

## Side-by-side comparison

| Dimension | BrowserBash | AgentQL |
| --- | --- | --- |
| Core abstraction | Plain-English objective, agent improvises the steps | JSON-like query describing elements/data |
| What you write | One sentence | A query schema (fields, type hints) |
| What you get back | Verdict + `final_state` structured values | Structured JSON (data query) or Playwright locators (element query) |
| License | Apache-2.0 (CLI) | MIT (SDKs + language) |
| Form factor | CLI (`browserbash`) | Python SDK, JS SDK, REST API |
| Intelligence location | Local Ollama by default ($0, nothing leaves machine); hosted optional | Hosted query parser (cloud) by default |
| Account required | No | Yes for the hosted API / higher tiers |
| Browser driver | Real Chrome via Stagehand or builtin Playwright loop | Playwright (via SDK integration) |
| Self-healing | Yes (Stagehand primitives) | Yes (semantic selectors) |
| Where browser runs | local / cdp / browserbase / lambdatest / browserstack | Your own Playwright runtime |
| Pricing | Free, open source | $0 Starter / $99 Pro / custom Enterprise (2026) |
| CI integration | `--agent` NDJSON, exit codes 0/1/2/3 | Build your own around the SDK |
| Committable tests | Markdown `*_test.md` with variables + secret masking | Queries live in your code |

A few cells deserve unpacking, which the next sections do. Treat the table as a map, not the territory.

## Where AgentQL wins

I want to be straight about this, because a comparison that pretends one tool dominates everything is useless.

**High-volume, schema-shaped extraction.** If your real job is "pull the same five fields off ten thousand product pages and give me clean JSON," AgentQL's data query is purpose-built for it. You define the output shape once, run it across similar pages, and the query is the only contract you maintain. That is genuinely elegant for scraping at scale, and the data-query-returns-typed-JSON design removes a parsing layer you would otherwise hand-write.

**You already live in Python or JavaScript.** AgentQL is an SDK. If your pipeline is a Python service that already orchestrates Playwright, dropping in AgentQL queries is a natural fit — you stay in your language, your control flow, your error handling. BrowserBash is a CLI; you shell out to it or parse its NDJSON. For a team building a long-lived scraping product in code, the SDK ergonomics are a real advantage.

**Reusing one query across many similar sites.** Because AgentQL selectors are semantic, the same query can target structurally different but semantically similar pages. If you crawl fifty competitor catalogs that all have "a product name, a price, a description" but wildly different markup, one query that generalises is a strong tool.

**Determinism on a defined shape.** When you know exactly what fields you want and the page is stable in meaning, a query is more predictable than an autonomous agent deciding its own steps. Fewer degrees of freedom means fewer surprises. For data extraction where the schema is fixed, that predictability is worth a lot.

If those describe your work, AgentQL is likely the better pick and you should try it. BrowserBash is not a scraping framework with typed output schemas, and pretending otherwise would not help you.

## Where BrowserBash wins

The flip side is just as real.

**Verification and end-to-end flows, not just extraction.** AgentQL is built around "find these elements / pull this data." BrowserBash is built around "did this *work*." When the question is "can a user log in, add the cheapest item, reach checkout, and see the right total," you do not want to write a query for each element and assemble the click sequence yourself. You want to state the goal and get a verdict. That is the agentic-run model, and it is why BrowserBash returns `passed | failed | error | timeout` rather than a data blob. For QA, smoke tests, and release gates, that framing fits the actual question. The [tutorials](https://browserbash.com/tutorials) walk through several of these flows.

**Zero cost and zero data egress.** This is the sharpest difference. AgentQL's query parser is a hosted service — your page representation goes to TinyFish's cloud to be resolved. BrowserBash on local Ollama keeps everything on your machine: no API key, no per-call billing, no page content leaving the box. For a regulated codebase, an internal admin tool behind a VPN, or anything where the page contents are sensitive, "nothing leaves your machine" is not a nice-to-have. Run `--upload` and a run goes to the optional cloud dashboard, but without that flag, nothing leaves. You control egress at the flag level. See [pricing](https://browserbash.com/pricing) for the (short) money story.

**No selectors and no schema at all.** AgentQL is lighter than CSS/XPath, but you still author a query and maintain it. BrowserBash asks for an English sentence. For exploratory testing, one-off checks, or flows that change weekly, not having to author or maintain *any* selector vocabulary is a meaningful speed-up. You describe the goal; the agent finds its own way there.

**Built for CI and AI coding agents.** Add `--agent` and BrowserBash emits NDJSON — one JSON object per line, a `step` event per action and a terminal `run_end` with status, summary, `final_state`, and duration. Exit codes are unix-clean: 0 passed, 1 failed, 2 error, 3 timeout. No prose to parse, no scraping of stdout. Drop it into a pipeline or hand it to a coding agent and the contract is machine-readable from the first line.

**Committable, human-readable tests.** BrowserBash markdown tests (`*_test.md`) are plain files you commit. Each list item is a step, `{{variables}}` template values in, `@import` composes shared fragments, and secret-marked variables are masked as `*****` in every log line. After each run it writes a readable `Result.md`. That review-in-a-PR workflow is a different shape from queries embedded in application code.

## A real-feeling example, both ways

Say the task is: confirm the pricing page shows three plans and grab their prices.

With AgentQL, you would write a data query naming the fields you want — a `plans[]` array with `name` and `price(integer)` — run it through the SDK, and post-process the JSON (count the plans, assert there are three). The query gives you clean data; the "are there exactly three and is that correct" logic is yours to write around it.

With BrowserBash, you state the whole thing as the objective and let the run carry the assertion:

```bash
browserbash run "Open the pricing page, confirm exactly three plans are shown, and extract each plan's name and monthly price" --record
```

It drives Chrome, checks the count itself, returns `passed` or `failed`, and puts the three name/price pairs in `final_state`. The `--record` flag captures a screenshot and a `.webm` session video (the builtin engine also writes a Playwright trace) so you have evidence when it fails. Two valid philosophies: AgentQL gives you the data and you assert; BrowserBash folds the assertion into the run and hands you a verdict plus the data. Pick based on whether your output is a dataset or a pass/fail gate.

## Models, privacy, and who pays

This is where the two diverge most, and it deserves its own section because it drives real decisions.

AgentQL's intelligence is a hosted, fine-tuned parser. That is a strength — it is tuned for exactly this job and you do not manage a model — but it means two things. First, your page's semantic representation travels to TinyFish's cloud to be resolved. Second, past the free Starter tier, you are on a $99/month Professional plan or custom Enterprise, with usage limits. None of that is a knock; it is a normal hosted-SaaS shape, and the free tier is real. But it is a different trust and cost model from running locally.

BrowserBash defaults to local Ollama, which means $0 and no egress, then falls back to your Anthropic or OpenAI key if you have one, and lets you pin OpenRouter or a custom gateway. The honest trade is model quality: a hosted, purpose-tuned parser like AgentQL's may resolve a tricky extraction more reliably than a small local model. If you run BrowserBash on an 8B model against a hard multi-step flow, expect flakiness; move to a 70B-class local model or a hosted model for those. You are trading some out-of-the-box reliability for cost and privacy control, and you get to set that dial per run with `--model`. The [learn](https://browserbash.com/learn) hub covers model selection in depth.

For inspecting runs, BrowserBash ships a fully local dashboard (`browserbash dashboard` on localhost:4477) that reads from the on-disk run store at `~/.browserbash/runs` — every run kept locally with secrets masked, capped at 200. The optional cloud dashboard (`browserbash connect --key bb_...` then `--upload` per run) is strictly opt-in, and free cloud runs are kept 15 days. Nothing is uploaded unless you ask.

## When to choose which

Here is the decision in plain terms.

**Choose AgentQL when:**

- Your output is a *dataset*. You want clean, typed JSON off many pages and the schema is known.
- You are building inside Python or JavaScript and want to stay in your own control flow.
- You crawl many structurally different but semantically similar pages with one reusable query.
- A hosted, purpose-tuned parser and a $0–$99 SaaS plan fit your budget and data-handling rules.

**Choose BrowserBash when:**

- Your output is a *verdict*. You are verifying flows — login, checkout, smoke tests, release gates — not just scraping fields.
- Cost and data egress matter and you want local Ollama with a guaranteed $0 model bill and nothing leaving your machine.
- You want to skip schemas and selectors entirely and just describe the goal in English.
- You live in CI or drive things from an AI coding agent and want clean NDJSON plus unix exit codes.
- You want committable, reviewable markdown tests with secret masking.

And a real answer many teams land on: use both. AgentQL for the bulk-extraction service in your codebase, BrowserBash for the English-objective verification runs in CI. They are not mutually exclusive, and the lines above tell you which job goes where. Read a worked [case study](https://browserbash.com/case-study) for how an objective-driven run looks end to end, or browse the [blog](https://browserbash.com/blog) for more comparisons.

## Getting started with BrowserBash

If the objective-driven model fits your work, the on-ramp is short. Install the CLI, make sure you have Chrome and either a local Ollama model or an API key, and run an objective:

```bash
npm install -g browserbash-cli
browserbash run "Open example.com and confirm the page heading says Example Domain" --record
```

No account, no signup, no key if you are on local Ollama. Add `--agent` when you wire it into CI, `--engine builtin` if you want the Playwright tool-use loop and a trace, and `--provider lambdatest` (or `browserstack`) when you need a cloud grid. The package lives on [npm](https://www.npmjs.com/package/browserbash-cli) and the source is on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly how the engines and providers work before you trust them.

## FAQ

### Is BrowserBash a drop-in replacement for AgentQL?

Not exactly — they optimise for different jobs. AgentQL is a query language for extracting structured data and locators from pages, ideal when your output is a dataset you process in Python or JavaScript. BrowserBash is an objective-driven CLI that drives a real browser and returns a pass/fail verdict plus extracted values, ideal for verifying flows. If your job is bulk scraping with a fixed schema, AgentQL fits better; if it is end-to-end verification, BrowserBash does.

### Does BrowserBash require sending my page data to the cloud like AgentQL's hosted parser?

No. AgentQL resolves queries through TinyFish's hosted service by default, so the page representation travels to their cloud. BrowserBash defaults to local Ollama, where nothing leaves your machine and the model bill is $0. You only upload a run if you explicitly pass `--upload` after connecting the optional cloud dashboard; without that flag, everything stays local.

### How much does each tool cost in 2026?

BrowserBash is free and open source (Apache-2.0); on local Ollama there is no model cost either. AgentQL publishes a $0 Starter tier, a $99/month Professional tier, and custom Enterprise pricing as of 2026, with usage limits on the lower tiers since the query parser is a hosted service. The exact model behind AgentQL's parser is not publicly specified.

### Can I use BrowserBash for data extraction like AgentQL?

Yes, within an objective. You can ask BrowserBash to extract values as part of a run, and they come back in the `final_state` of the result (or per-step in NDJSON with `--agent`). The difference is framing: AgentQL is built around a typed data-query schema for high-volume scraping, while BrowserBash extracts as a side effect of completing an English objective. For pure large-scale schema-shaped scraping, AgentQL's data query is the more specialised tool.

Install and try the objective-driven model yourself:

```bash
npm install -g browserbash-cli
```

It is free, no account needed to run. If you want the optional cloud dashboard later, [sign up here](https://browserbash.com/sign-up) — but the local CLI works fully on its own.
