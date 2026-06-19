---
title: Automate competitor price monitoring
description: "How to automate price monitoring on a schedule with a free, local-first browser agent that reads real rendered pages and returns structured prices."
date: 2026-05-15
category: use-case
---

If you sell anything online, somebody on your team has opened a competitor's product page, squinted at the price, and pasted it into a spreadsheet. Then done it again the next morning. The job to automate price monitoring is one of the most boring, most repeated tasks in any pricing or e-commerce role, and it's exactly the kind of thing that should run on a schedule without a human in the loop. The catch is that pricing pages have gotten harder to read with a script: prices render in JavaScript, sit behind cookie banners, change by geography, and sometimes only appear after you add an item to the cart.

This article walks through how to automate competitor price monitoring with a real browser instead of a brittle CSS selector — using BrowserBash, a free, open-source, natural-language browser automation CLI. You write a plain-English objective like "go to this product page and read the current price," an AI agent drives an actual Chrome browser step by step, and you get back a verdict plus the extracted number in a structured field you can store. No page objects, no XPath that breaks the next time the competitor ships a redesign.

I'll be honest about where this approach shines and where a dedicated scraping API is the better tool. Monitoring "every SKU on Amazon, refreshed hourly, behind residential proxies" is a different problem, and I'll say so plainly. But for the very common case — a few dozen competitor URLs, checked daily, prices logged somewhere you can diff — a scheduled browser agent is genuinely a good fit, and it costs nothing if you run a local model.

## Why price scraping is harder than it looks

The naive version of this task is `curl` plus a regex. That worked in 2015. In 2026, most retail pages that matter will not hand you a price in the raw HTML.

Here's what actually gets in the way:

- **JavaScript-rendered prices.** The number you see in the browser is often injected after the page loads, pulled from an API call the page makes to itself. A plain HTTP fetch returns a skeleton with a `$0.00` placeholder or no price at all. You need something that renders the page like a browser does.
- **Dynamic pricing by context.** The same product can show different prices depending on your location, whether you're logged in, your device type, and sometimes your browsing history. A single scrape captures one slice of that. If you care about the price a real shopper in a specific market sees, you have to load the page the way that shopper would.
- **Cookie walls and consent banners.** A surprising number of "the price isn't showing up" bugs come down to a GDPR consent overlay sitting on top of the page. A human clicks "Accept" without thinking. A selector-based scraper just sees an obscured price or times out.
- **Price-in-cart patterns.** Some sites — especially in B2B, travel, and MAP-restricted categories — only reveal the real price after you add the item to the cart or start a quote. That's a multi-step flow, not a single page read.
- **Layout churn.** Competitors redesign. The `div.price__amount` you pinned your scraper to last quarter is now `span.pdp-price-value`, and your job silently logs nulls until someone notices the dashboard went flat.

That last one is the quiet killer. Selector-based scrapers don't fail loudly — they return empty data while your cron job reports success. By the time a pricing analyst notices the chart is suspiciously flat, you've lost a week of data.

A browser agent working from a plain-English objective sidesteps the brittleness. You're not telling it *where* the price is in the DOM; you're telling it *what* you want ("the current displayed price of the product on this page"). It reads the rendered page the way a person would and reports what it found. When the layout changes, the instruction is still valid.

## What "on a schedule" really requires

To automate price monitoring properly, you need four things working together:

1. **A renderer that behaves like a browser** — handles JavaScript, cookies, and multi-step flows.
2. **An extractor that returns structured values** — not a screenshot you have to eyeball, an actual `{ "price": 49.99, "currency": "USD" }` you can store and compare.
3. **A scheduler** — cron, a CI pipeline, or a task runner that fires the job at the cadence you want.
4. **A diff and alert layer** — something that compares today's price to yesterday's and tells you when it moved.

BrowserBash gives you the first two directly. The third and fourth you wire up with tools you already have (cron, GitHub Actions, a database, Slack), because BrowserBash is designed to slot into automation rather than replace your whole stack. Its agent mode emits machine-readable output specifically so a scheduler or a script can consume the result without parsing prose.

The design goal is that you run the same command by hand to test it, then drop it into cron and trust it to behave the same way. No separate "production mode."

## Getting BrowserBash running

Installation is one command if you have Node 18 or newer and Chrome on the machine.

```bash
npm install -g browserbash-cli
browserbash run "go to https://example.com and confirm the page loads"
```

That second line is a smoke test. If it returns a passed verdict, your browser and model wiring are good.

The model story matters for a scheduled job, because cost compounds when something runs every day. BrowserBash is Ollama-first. The default model is `auto`, which resolves in order: if you have a local Ollama instance running, it uses `ollama/<model>` — free, no API keys, and nothing leaves your machine. If not, it falls back to `ANTHROPIC_API_KEY` (Claude), then `OPENAI_API_KEY` (GPT). On a local model, your model bill for a daily price check is exactly zero, forever.

One honest caveat about local models: very small ones (8B parameters and under) get flaky on long multi-step objectives. For a single "read the price on this page" task they're often fine. For a "navigate, accept cookies, add to cart, then read the price" flow, you want a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model. If your price checks are simple page reads, start small and only reach for a bigger model when you see the agent losing track mid-flow. There's more on model selection in the [BrowserBash features overview](https://browserbash.com/features) and the [pricing page](https://browserbash.com/pricing), which is worth reading before you commit to a hosted model for a high-frequency schedule.

## Your first price extraction

Let's read one price. The objective is plain English, and the key is to ask for the value explicitly so the agent returns it as a structured field.

```bash
browserbash run "Go to https://www.example-store.com/products/wireless-headphones. Accept the cookie banner if one appears. Read the current displayed price of the product and report it as a number with its currency." --record
```

A few things are happening here worth calling out:

- **"Accept the cookie banner if one appears"** handles the consent-wall problem inline. You don't have to know whether this particular site shows one; the agent deals with it if it's there.
- **"report it as a number with its currency"** nudges the agent toward structured extraction rather than a vague sentence. You want `49.99` and `USD`, not "it looks like about fifty dollars."
- **`--record`** captures a screenshot and a `.webm` session video via the bundled ffmpeg. For price monitoring this is your evidence trail — when a price looks wrong, you can watch exactly what the agent saw. It's also your proof that the price was real and not a placeholder.

The run returns a verdict (passed/failed) and the extracted values. Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at the most recent 200), so you have a local history without setting up any storage.

If you prefer to watch it work the first few times, drop `--headless` so you can literally see Chrome navigate. Once you trust the objective, add `--headless` back for the scheduled version so it runs without a visible window.

### Handling price-in-cart flows

When the price only shows after adding to cart, you extend the objective with the extra steps:

```bash
browserbash run "Go to https://www.example-b2b.com/products/industrial-valve. Accept any cookie prompt. Click 'Add to cart', then open the cart. Read the unit price shown in the cart and report it as a number with currency." --timeout 120
```

The `--timeout` flag (in seconds) gives a multi-step flow more room. This is also where model choice starts to matter — a multi-step navigation like this is exactly the kind of objective where a tiny local model will wander and a mid-size or hosted one stays on track. If your competitor set includes a lot of these gated-price flows, budget for a capable model.

## From one URL to a scheduled job

A single command is a demo. A monitoring system runs many URLs on a cadence and does something with the results. The piece that makes this practical is **agent mode**.

Adding `--agent` switches the output to NDJSON — newline-delimited JSON, one object per line. You get progress events as the agent works:

```
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"loaded product page"}
```

And a terminal event when it finishes:

```
{"type":"run_end","status":"passed","summary":"price extracted","final_state":{...},"duration_ms":4210}
```

Exit codes are meaningful too: `0` passed, `1` failed, `2` error, `3` timeout. That means a shell loop or a CI step can branch on the result without reading a word of English. This is the contract that makes BrowserBash safe to put in a `cron` job — it's built for machines to consume, not just humans to read.

A minimal daily monitor is a list of URLs and a loop:

```bash
browserbash run "Go to https://store-a.com/p/widget, accept cookies if shown, and read the current price as a number with currency." --agent --headless
```

Wrap that in a script that iterates over your competitor URLs, parses the `final_state` from the `run_end` line, appends `{date, url, price}` to a CSV or a database, and you have a price history. Point your system `crontab` at the script to run it every morning at 6 a.m. The scheduler is just cron; BrowserBash is the part that reliably turns a URL into a number.

For diff-and-alert, you compare each new price against the last stored value for that URL. If it moved beyond a threshold you care about, post to Slack or send an email. None of that is BrowserBash-specific — it's the same alerting plumbing you'd build around any data source, and that's the point. BrowserBash does the hard part (reading the real page) and stays out of your way for the rest.

The same pattern drops straight into CI. Because agent mode uses exit codes, a GitHub Actions or Jenkins step can run the price checks on a schedule (cron triggers exist in both) and fail loudly if a competitor's page structure changed enough that the agent couldn't find a price at all. That failure signal is something selector scrapers don't give you. There's a deeper walkthrough of CI patterns in the [BrowserBash tutorials](https://browserbash.com/tutorials).

## Committing your monitors as markdown tests

For a price-monitoring setup that more than one person maintains, the run-a-shell-command approach gets messy. BrowserBash has a more durable option: markdown tests.

A `*_test.md` file is a committable, human-readable list where each list item is a step. You can template values with `{{variables}}` and compose files with `@import`. So a competitor monitor becomes a file you check into your repo:

```bash
browserbash testmd run ./competitor_prices_test.md
```

Inside that file, each competitor is a step in plain English, and shared setup (accept cookies, set region) can live in an imported fragment. Variables let you parameterize the product or the market without copy-pasting the whole flow. After each run it writes a human-readable `Result.md`, which is a clean artifact to drop into a shared drive or attach to a report.

The advantage over a shell script is reviewability. A pricing analyst who can't write Playwright can read a markdown monitor, suggest a change in a pull request, and understand exactly what's being checked. That's the same property that makes [AI-driven web data extraction](https://browserbash.com/blog) approachable for non-engineers — the instruction is the documentation.

If any step needs a secret (a login to see member pricing, say), mark the variable as secret and BrowserBash masks it as `*****` in every log line, including the on-disk run history. You don't leak a credential into your price archive.

## Where this fits — and where it doesn't

I want to be straight about scope, because "use a browser agent for price monitoring" is not the right answer for every situation. Here's an honest comparison against the main alternatives.

| Approach | Best for | Trade-offs |
| --- | --- | --- |
| **BrowserBash (browser agent)** | Dozens of URLs, daily/hourly cadence, JS-heavy pages, gated/in-cart prices, teams that want plain-English monitors | Not built for massive-scale crawling or rotating residential proxy pools; per-page cost on hosted models adds up at very high frequency |
| **Managed scraping API** (e.g. ScrapingBee, Bright Data) | Thousands–millions of pages, aggressive anti-bot targets, residential proxy rotation needed | Paid per request/credit; you still write extraction logic; less natural-language, more engineering |
| **Turn-key price SaaS** (e.g. Prisync, Price2Spy) | Non-technical teams wanting dashboards, product matching, repricing built in | Subscription cost; locked into their model and supported sites; less flexible for odd flows |
| **DIY selectors** (Playwright/Puppeteer scripts) | Full control, one or two stable sites you own the relationship with | Brittle to redesigns, you maintain every selector, fails silently |

Note: pricing and feature details for the third-party tools above are as published as of 2026 and change often — check the vendor directly before deciding. I'm not going to invent benchmarks comparing them.

### When BrowserBash is the right call

Reach for a scheduled browser agent when:

- Your competitor set is in the **tens, not the millions** of URLs.
- The pages are **JavaScript-heavy** or have **cookie walls** that defeat simple fetchers.
- Some prices are **gated behind add-to-cart or login** flows.
- You want **non-engineers to read and edit** the monitors.
- You care about **zero model cost** and **data staying on your machine** — local Ollama means nothing about your competitor research leaves your laptop.
- You want **video and screenshot evidence** of what the price actually was on a given day.

### When to use something else

Be honest with yourself and pick a dedicated tool when:

- You need to monitor **thousands of products refreshed every few minutes** — that's a scraping-API or enterprise-data-vendor job, and they've built the proxy infrastructure for it.
- Your targets have **hostile anti-bot systems** (some large marketplaces actively fight automation; a meaningful share of automated traffic gets blocked by modern bot management). A managed API with residential proxy rotation is purpose-built for that fight; a single local Chrome is not.
- You want **repricing and product matching out of the box** — a turn-key SaaS will get you there faster than wiring it yourself.

BrowserBash is the better fit for the long tail of "I have a real but modest monitoring need and I don't want to pay a SaaS subscription or babysit selectors." That covers a lot of real teams. It is not trying to be Bright Data, and pretending otherwise would do you a disservice.

## Keeping a scheduled monitor reliable

A monitor that runs unattended needs to fail in ways you'll notice. A few practices that pay off:

- **Treat a missing price as a failure, not a null.** Phrase your objective so the agent reports a clear failure verdict if it genuinely can't find a price, and check the exit code in your script. A `3` (timeout) on a site that used to work fast is an early warning that the page changed or added a challenge.
- **Record on the runs that matter.** You don't need `--record` on every successful daily check, but keeping it on — or turning it on for failures — gives you a video to review when a price looks wrong. The on-disk run store at `~/.browserbash/runs` already keeps the last 200 runs, so you have recent history for free.
- **Pin your model for predictability.** `--model` lets you lock to a specific backend so a scheduled job doesn't silently switch behavior. If you're running locally, pin `ollama/qwen3` (or whatever mid-size model you validated). If hosted, pin the exact model so cost and behavior stay stable.
- **Stagger and throttle.** Don't hammer one competitor with rapid-fire requests. Space your checks out across the schedule. Reading a price once a day per URL is courteous and far less likely to trip rate limits than scraping the same page every minute.
- **Watch for dynamic pricing drift.** If a competitor personalizes prices, a single check captures one context. Decide whether you care about the logged-out, default-region price (usually the public list price) or a specific shopper context, and write the objective to match. Be consistent so your day-over-day diffs are comparing like with like.

If you want to see runs in a UI instead of reading NDJSON, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — nothing uploaded, no account. For sharing results with a distributed team you can opt into the free cloud dashboard with `browserbash connect --key bb_...` and add `--upload` per run; without `--upload`, nothing leaves your machine. Free cloud runs are kept for 15 days. The local dashboard is enough for most price-monitoring setups, and it's the path I'd start with. You can read more about the project, including the [case studies](https://browserbash.com/case-study) and the [learn hub](https://browserbash.com/learn), to see how teams wire it into existing workflows.

## A realistic end-to-end shape

Putting it together, a working competitor price monitor looks like this:

- A markdown test (committed to your repo) listing each competitor product URL as a plain-English step, with shared cookie-acceptance and region setup imported once.
- A cron entry that runs `browserbash testmd run ./competitor_prices_test.md` every morning, headless, on a machine with a mid-size local Ollama model so the model bill is zero.
- A small post-processing script that reads the `Result.md` (or the NDJSON from `--agent` mode if you want to parse programmatically), appends each price to a database keyed by URL and date, diffs against yesterday, and pings Slack on a move past your threshold.
- Recordings retained for any run that failed, so a human can review what the agent saw when a price didn't extract.

That's a complete, low-cost, low-maintenance system built mostly from tools you already run, with BrowserBash doing the one genuinely hard part: reliably reading a real, rendered, possibly-gated price page and handing you back a clean number. You can extend it later — more URLs, a second daily run, member-pricing behind a masked login — without rearchitecting anything.

The point of choosing to automate price monitoring with a browser agent is that the instruction survives the chaos of the modern web. Competitors will keep redesigning, adding consent walls, and rendering prices in JavaScript. Your objective — "read the current price and report it as a number" — stays true through all of it.

## FAQ

### Is it legal to scrape competitor prices?

Publicly displayed prices are generally accessible, but legality depends on the site's terms of service, your jurisdiction, and how you collect the data. Reading public list prices at a courteous frequency is very different from high-volume scraping behind a login. Check each target's terms and consult counsel for anything at scale or behind authentication. This article is about the technical "how," not legal advice.

### How often should I check competitor prices?

For most retail and B2B use cases, once a day captures real pricing moves without hammering competitor servers or tripping rate limits. Fast-moving categories like electronics or travel may justify a few times a day. Sub-minute monitoring of thousands of SKUs is a different scale of problem better served by a dedicated scraping API with proxy infrastructure, not a single local browser.

### Can BrowserBash read prices that only show in JavaScript or after adding to cart?

Yes. Because BrowserBash drives a real Chrome browser rather than fetching raw HTML, JavaScript-rendered prices load the same way they do for a human visitor. For prices gated behind add-to-cart or login flows, you write those extra steps into the plain-English objective, and the agent performs them before reading the price. Multi-step flows are where a mid-size or hosted model is more reliable than a very small local one.

### Does monitoring prices with a local model really cost nothing?

The model bill is zero when you run a local Ollama model, because the language model runs on your own machine and BrowserBash itself is free and open-source under Apache-2.0. You only pay for compute if you choose a hosted model like Claude or GPT for harder multi-step flows. Running everything locally also means your competitor research never leaves your computer.

Ready to automate your price monitoring on a schedule? Install with `npm install -g browserbash-cli` and run your first check in minutes. Create an optional free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) — though you don't need one to run anything locally.
