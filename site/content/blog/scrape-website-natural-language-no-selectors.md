---
title: Scrape a Website With Natural Language and No CSS Selectors
description: "Scrape a website with natural language: describe the data in plain English, skip CSS selectors, and get clean structured JSON that survives redesigns."
date: 2026-02-06
category: use-case
---

The first time a redesign nuked one of my scrapers, I lost an afternoon to a single moved `<div>`. The selector chain that found the price had been correct on Monday and returned `undefined` on Thursday, and nothing in my code had changed. That afternoon is the whole reason people now want to scrape a website with natural language instead of CSS selectors — you describe the target in plain English ("get the product name, price, and star rating"), and an agent reads the rendered page the way a human would, then hands you structured data. No node paths to babysit, no XPath to re-tune every quarter.

I have shipped both styles of scraper: the hand-rolled BeautifulSoup-and-XPath pipelines that need a babysitter, and the newer agent-driven extractors that look at a page and return JSON. This is an honest tour of how the natural-language approach actually works, where it genuinely beats selector code, where it does not, and how BrowserBash — a free, open-source CLI that turns a plain-English objective into a verdict plus extracted values — fits next to hosted scraping platforms. I will name the real overlaps and say plainly when a different tool is the better pick.

## Why CSS selectors break and natural language doesn't

A CSS selector or XPath is an address. `div.product-grid > article:nth-child(2) .price-now` says "go to this exact spot in the DOM." It works perfectly until someone on the target team renames a class, wraps a section in a new container, or A/B-tests a layout. None of those changes affect what a human sees. All of them break your address.

That's the core problem with selector-based scraping: you're coupling your code to the *structure* of a page you don't control, when what you actually care about is the *meaning* of the content. A human looking at a product page doesn't parse `nth-child`. They see a price near a buy button and read it. Natural-language scraping tries to copy that behavior. You say what the data *is*, and a language model that can see the rendered page figures out where it lives this week.

The practical payoff shows up in maintenance hours. Selector pipelines fail silently — they return empty strings or `null` and your dashboard quietly fills with gaps until someone notices the numbers are wrong. A natural-language agent fails differently: it usually adapts to the new layout, and when it genuinely can't find something, it can tell you so in a verdict rather than handing back a confident blank.

### What "no selectors" really buys you

It's worth being precise here, because "no selectors" is easy to oversell. You're not eliminating the DOM. The agent still operates on a real page with real elements. What you're eliminating is the part where *you* write and maintain the address. The model resolves "the price" into an actual element at run time, every run, against whatever the page looks like right now. That's the trade: you give up deterministic, pinned targeting in exchange for resilience and far less upkeep.

For a lot of jobs — competitive price monitoring, lead lists, content aggregation, QA checks on your own staging site — that trade is a clear win. For a few jobs, it isn't, and I'll get to those.

## How natural-language scraping works under the hood

There are roughly three things people mean when they say "AI scraping," and conflating them is how teams buy the wrong tool.

**HTML parsing with an AI cleanup step.** You still fetch raw HTML the old way, then pass it to a model to tidy messy fields. The model helps with normalization, but you still own navigation, pagination, login, and the selectors that grab the right chunk of markup. When the page restructures, you're back to debugging.

**Agentic extraction**, where a language model drives a real browser. There are no selectors in your code. You give the agent a goal — "open the product page, read the title, price, and rating, return them as JSON" — and the model looks at the rendered page, decides what to read or click, and pulls the values. This is the category BrowserBash lives in.

**Managed data-as-a-service**, where you describe what you want through a dashboard or API and a vendor runs the browsers, proxies, and scaling for you. You trade control and cost for not operating anything.

The agentic path is the one that delivers the "describe it in English" experience while keeping the work on infrastructure you control. Here's the loop in practice: the agent navigates to a URL, the page renders in a real browser, the model receives a representation of what's on screen (an accessibility tree, visible text, or a screenshot depending on the engine), you've handed it an objective, and it reasons step by step — read this, scroll to that, extract these fields — until it can return a result. Because each step is decided against the live page, a layout change is just a different page to read, not a broken contract.

## Scrape a website with natural language using BrowserBash

BrowserBash is a free, open-source (Apache-2.0) command-line tool from The Testing Academy that does exactly this. You install it once and write an objective; an AI agent drives a real Chrome browser step by step — no selectors, no page objects — and returns a verdict plus the structured values it extracted.

Install it and run your first extraction:

```bash
npm install -g browserbash-cli
browserbash run "Go to example.com/products, read the name, price, and rating of the first 5 products, and return them as JSON"
```

That's the whole interface. No selector file, no scraper boilerplate. You need Node 18 or newer and Chrome installed for the local provider. The command is `browserbash`, latest version 1.3.1, and you don't need an account to run anything.

### Where the model comes from (and why it can cost $0)

This is the part most "AI scraper" pitches gloss over: which model interprets your English, and what it costs. BrowserBash is Ollama-first. The default model is `auto`, resolved in this order:

1. A **local Ollama** model if one is running — used as `ollama/<model>`, free, no API keys, and nothing leaves your machine.
2. `ANTHROPIC_API_KEY` if set — uses `claude-opus-4-8`.
3. `OPENAI_API_KEY` if set — uses `openai/gpt-4.1`.
4. Otherwise it errors with guidance on what to configure.

If you run on a local model, your model bill is genuinely $0 and your scraped pages never leave your laptop. That matters for two groups: people scraping data they'd rather not pipe through a third-party API, and people running this at volume who don't want a per-token surprise.

Here's the honest caveat, because it changes which model you should pick. Very small local models (8B parameters and under) get flaky on long, multi-step objectives — they lose the thread, skip a field, or hallucinate a value on page three of a paginated list. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. A tiny model is fine for "read one number off one page." It is not fine for "log in, paginate through 40 pages, and extract a nested table from each."

To pin a model explicitly instead of letting `auto` decide:

```bash
browserbash run "Extract every job title, company, and location from this listings page as JSON" --model ollama/qwen3
```

You can swap in `openrouter/meta-llama/llama-3.3-70b-instruct` (with `OPENROUTER_API_KEY`), `google/gemini-2.5-flash`, or `claude-opus-4-8` the same way. The objective doesn't change — only the brain behind it does.

## Getting structured output you can actually pipe somewhere

A scrape is only useful if the next tool in your pipeline can read it. BrowserBash has two output modes worth knowing.

By default, a run returns a human-readable verdict and the extracted values. For automation, add `--agent`, which emits NDJSON — one JSON object per line. You get progress events as the agent works:

```bash
browserbash run "Read the top 10 Hacker News story titles and their points, return as JSON" --agent
```

Each step arrives as a line like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the run ends with a terminal object: `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. The exit codes are scriptable too — `0` passed, `1` failed, `2` error, `3` timeout — so a cron job or CI step can branch on the result without parsing prose. The extracted data lands in `final_state`, ready to pipe into `jq`, a database loader, or whatever's next.

If you want a record of what happened, `--record` captures a screenshot plus a `.webm` session video (via bundled ffmpeg), and on the builtin engine it also writes a Playwright trace. Every run is also kept on-disk at `~/.browserbash/runs` with secrets masked, capped at the last 200 runs, so you can go back and see exactly what the agent read.

### Repeatable scrapes as committable markdown

If you're scraping the same targets on a schedule, you don't want to retype the objective. BrowserBash supports markdown tests — files like `catalog_test.md` where each list item is a step, with `{{variables}}` templating and `@import` for composition. Run one with:

```bash
browserbash testmd run ./catalog_test.md
```

These files commit to your repo like any other code, and secret-marked variables get masked as `*****` in every log line — useful when a scrape needs a login. After each run it writes a human-readable `Result.md`. It's a clean way to turn a one-off extraction into something a teammate can re-run without understanding the internals.

## Two engines: which interprets your English

BrowserBash gives you a choice of engine — the component that turns your sentence into browser actions.

**Stagehand** (the default, MIT-licensed, from Browserbase) exposes act/extract/observe/agent primitives and is self-healing, meaning it re-resolves targets when a page shifts. This is the one most people want for natural-language scraping.

**Builtin** is an in-repo Anthropic tool-use loop driving Playwright. It's used automatically when you point at LambdaTest or BrowserStack, and it writes a Playwright trace when you record.

Switch with `--engine stagehand` or `--engine builtin`. For pure extraction work on your own machine, Stagehand's `extract` primitive is the natural fit — it's built to pull structured values from a described target.

You also choose *where* the browser runs, via `--provider`:

| Provider | Where the browser runs | What it needs |
|---|---|---|
| `local` (default) | Your own Chrome | Nothing — just Chrome installed |
| `cdp` | Any DevTools endpoint | `--cdp-endpoint ws://...` |
| `browserbase` | Browserbase cloud | `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` |
| `lambdatest` | LambdaTest grid | `LT_USERNAME` + `LT_ACCESS_KEY` (auto builtin engine) |
| `browserstack` | BrowserStack grid | `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` (auto builtin engine) |

For most scraping, `local` is all you need and keeps everything on your machine. Reach for a cloud provider when you need a clean IP, a specific OS/browser combo, or parallel scale you don't want to run yourself.

## How BrowserBash compares to hosted natural-language scrapers

The natural-language scraping space has real, capable products, and BrowserBash isn't trying to be all of them. Here's an honest read of where it sits. Where a competitor's internals or pricing aren't public, I'll say so rather than guess.

| Tool | Model | License / cost | Natural-language input | Where it runs |
|---|---|---|---|---|
| **BrowserBash** | CLI driving a real browser; you bring the model (local Ollama free, or hosted) | Free, open-source (Apache-2.0); $0 model bill on local models | Yes — plain-English objective | Your machine by default; cloud providers optional |
| **Firecrawl** | Hosted API; crawl + extract endpoints | Commercial with a free tier; paid plans as of 2026 | Yes — prompt-based extraction | Hosted infrastructure |
| **Apify (AI Web Scraper)** | Hosted Actor that takes a prompt and returns JSON | Commercial, usage-based pricing as of 2026 | Yes — natural-language prompt | Apify cloud |
| **Diffbot** | Vision + NLP that classifies page types into JSON | Commercial; pricing not fully public, tiered as of 2026 | Partial — automatic page understanding, less free-form | Hosted infrastructure |
| **ScrapeGraphAI** | Open-source library using LLM-guided extraction | Open-source library; you pay for the model you plug in | Yes — prompt-based | Wherever you run it |

A few honest takeaways from that table.

**Firecrawl and Apify are the better fit when you want zero infrastructure.** If you'd rather hit an API, get rows back, and never think about browsers, proxies, or rotating IPs, a hosted platform earns its price. BrowserBash deliberately runs on your machine by default; that's a feature if you care about privacy and cost, and a chore if you wanted someone else to operate it.

**Diffbot is the better fit for large-scale, page-type classification** — turning the open web's articles, products, and discussions into JSON at volume with its own crawl infrastructure. That's a different shape of problem than "drive this specific flow and extract these fields."

**ScrapeGraphAI overlaps most directly** as an open-source, LLM-driven extractor. The honest distinction: ScrapeGraphAI is a Python library you compose into your own code, while BrowserBash is a CLI you can run in one line and a step-by-step browser agent rather than a library API. If you want code-level control inside a Python app, the library may suit you better. If you want a command you can run, script with NDJSON, and commit as markdown tests, the CLI fits.

Where BrowserBash wins cleanly: it's free and open-source, it can run with a genuine $0 model bill on local models, nothing leaves your machine unless you opt in, and the same tool that scrapes also verifies flows and runs in CI. If those four things matter to you, it's hard to beat. If they don't, one of the hosted players above may save you setup time.

## When to choose natural-language scraping — and when not to

I'd be doing you a disservice if I pretended this approach is always right. Here's the balanced version.

**Choose natural-language scraping when:**

- The target site changes often and your selector scrapers keep breaking. Resilience is the whole point.
- The data is *semantic* — "the price," "the author," "the in-stock status" — rather than positional. Models are good at meaning.
- You're scraping a handful of sites deeply (login, navigation, pagination) rather than a million URLs shallowly.
- You want the same tool to also do QA and verification on your own apps.
- Privacy or model cost rules out piping pages through a third-party API — local models keep both at zero.

**Stick with selector-based or hosted scraping when:**

- You need millions of pages at maximum throughput and minimum per-page cost. A tuned `cheerio`/`scrapy` pipeline or a hosted DaaS platform will out-scale an agent loop.
- The site is stable and simple, and a five-line selector script just works. Don't bring a language model to a `querySelector` problem.
- You need byte-for-byte deterministic output every run for compliance reasons. Agents are resilient but not perfectly deterministic; a model can phrase a field two ways across runs.
- Your budget is on a tiny local model and your flow is long and multi-step — that combination is where small models get flaky. Either size up the model or simplify the objective.

The middle path a lot of teams land on: use natural-language scraping for the gnarly, frequently-changing, login-gated targets where selectors die, and keep a lightweight selector script for the handful of stable, high-volume sources where it's cheaper. Use each where it's strong.

### A realistic first project

If you want to feel the difference, pick a single product or listings page you already scrape with selectors and re-do it as an objective. Something like:

```bash
browserbash run "Open this category page, extract every product's name, price, and availability into a JSON array, then go to page 2 and do the same" --record
```

Run it once, watch the recording, and look at the `final_state` in the run store. Then ask how much selector code that just replaced — and how it'll behave next quarter when the site ships a redesign. That comparison, on your own data, beats any benchmark I could quote. There are more walkthroughs in the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections.

## Keeping scrapes honest, repeatable, and visible

Scraping responsibly is partly about respecting the sites you hit — honor robots directives, don't hammer servers, and stay inside terms you're allowed to operate under — and partly about keeping your own pipeline trustworthy.

On the trust side, the local dashboard helps. Run `browserbash dashboard` to open a fully local dashboard at `localhost:4477` where you can browse past runs, see what the agent read, and replay recordings. It's free and entirely on your machine; `--clear` wipes the store if you want a clean slate. For teams that want to share runs, there's an opt-in cloud path: `browserbash connect --key bb_...` links your cloud account, and then `--upload` on a run pushes that one run up (free cloud runs are kept 15 days). Without `--upload`, nothing leaves your machine — the opt-in is explicit, not a default.

The markdown-test format is what makes a scrape *repeatable* rather than a one-off command someone ran from their terminal history. Commit the test, template the URLs as `{{variables}}`, mask any credentials as secrets, and now the scrape is reviewable in a pull request like any other code. That's a meaningful upgrade over a pile of selector scripts nobody fully understands. You can read more about the design on the [features](https://browserbash.com/features) page, and there are write-ups of real flows on the [blog](https://browserbash.com/blog) and the [case study](https://browserbash.com/case-study) page.

A last note on reliability: when an agentic scrape misbehaves, the fix is usually one of three things — a clearer objective ("return *exactly* these fields as JSON" beats "get the product info"), a bigger model for a long flow, or `--record` plus the dashboard to see where it went sideways. Vague objectives and undersized models cause most of the flakiness people blame on "AI scraping."

## FAQ

### Can I really scrape a website with natural language and no CSS selectors?

Yes. With an agentic tool like BrowserBash you write a plain-English objective such as "read the name, price, and rating of each product and return JSON," and a language model drives a real browser to find and extract those values against the live page. You never write or maintain a selector or XPath, which is what makes the approach survive redesigns that would break selector-based scrapers.

### Is natural-language web scraping free?

It can be. BrowserBash itself is free and open-source under Apache-2.0, and if you run it against a local Ollama model your model bill is genuinely $0 with no API keys, since nothing leaves your machine. You only start paying if you choose a hosted model like Claude or GPT, or a cloud browser provider. Hosted scraping platforms such as Firecrawl and Apify are commercial with their own pricing as of 2026.

### How is this different from traditional scrapers like Scrapy or BeautifulSoup?

Traditional scrapers target exact DOM locations with CSS selectors or XPath, so they're fast and cheap at huge volume but break whenever the page structure changes. Natural-language scraping targets the *meaning* of content, so it adapts to layout changes and needs far less maintenance, but it's better suited to scraping a few sites deeply than millions of pages at maximum throughput. Many teams use both — agents for fragile, changing sites and selector scripts for stable high-volume ones.

### Do small local models work for scraping, or do I need a big one?

It depends on the job. A small local model (8B and under) is fine for reading one or two fields off a single page, but it gets flaky on long, multi-step objectives like paginating through dozens of pages or extracting nested tables. For those, a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model, is far more reliable.

Stop maintaining selectors that die on the next redesign. Describe the data you want in plain English and let an agent read the page for you:

```bash
npm install -g browserbash-cli
```

It's free, open-source, and runs on your machine with no account required. If you want the optional cloud dashboard, sign up at [browserbash.com/sign-up](https://browserbash.com/sign-up) — but you can scrape your first page without it.
