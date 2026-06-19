---
title: Broken link checking with an AI browser
description: "A broken link checker ai approach that crawls your site and verifies each link in a real browser, so you catch dead links humans actually hit."
date: 2026-05-26
category: use-case
---

A dead link is a small thing that does big damage. A 404 on your pricing page, a docs link pointing at a renamed page, a "Download" button that resolves to a server error — each one quietly costs you trust, conversions, and crawl budget. The classic fix is a crawler that fans out across your URLs and fires an HTTP request at every link it finds. That catches a lot. But a request-based crawler and a real visitor see different webs, and the gap between them is exactly where the embarrassing breakage lives. A broken link checker ai that drives an actual browser closes that gap: it crawls like a crawler, then verifies like a human, clicking through and reading the page that actually loads.

I have run link audits both ways — the fast HTTP sweep and the slow, browser-real walk — and they disagree more than you would expect. This article is a practical, honest look at how to do crawl-plus-verify link checking with an AI browser, where it beats a traditional checker, and where a plain crawler is still the smarter, cheaper tool. I will use BrowserBash, the free open-source CLI from The Testing Academy, for the concrete examples, and I will tell you plainly when not to reach for it.

## What a broken link checker actually has to do

"Find broken links" sounds like one job. It is at least four, and most tools are good at the first one and weak at the rest.

**Discover the links.** Crawl the site, follow internal links, build the graph of every URL that is reachable. This is the part every checker does. Screaming Frog, Ahrefs Site Audit, Semrush, Sitebulb, and the free web tools all crawl well, some across hundreds of thousands of URLs.

**Check the status.** For each discovered link, find out whether it works. The common method is an HTTP `HEAD` or `GET` request and a look at the status code. 200 is fine, 404 and 410 are dead, 5xx is a server problem, 3xx is a redirect to follow.

**Verify what a user actually gets.** This is the step that separates a request from a visit. A link can return `200 OK` and still be broken from a human's point of view: a soft 404 ("Sorry, this page no longer exists" served with a 200 status), a page that renders a JavaScript error, a redirect chain that lands somewhere unrelated, a "page not found" inside a single-page app where the server never sees the route at all. A status code alone misses every one of these.

**Report what to fix.** Group the failures, show where each dead link lives (which page links to it), and give you enough to act — the source page, the anchor text, the destination, the status, and ideally a screenshot.

A traditional checker nails discovery and status. An AI browser earns its keep on verification — the third job — because it loads the page in real Chrome, runs the JavaScript, and then *reads* the result the way a person would, instead of trusting a number.

## Where a plain HTTP link checker quietly lies to you

Request-based crawlers are fast and cheap, and for most of a site they are correct. The problem is the minority of cases where the HTTP response and the human experience diverge. Those are also, annoyingly, the cases users notice most.

**Soft 404s.** A surprising number of CMSes and frameworks serve their "not found" page with a `200 OK` status. The crawler sees 200, marks the link healthy, and moves on. The visitor sees "This article has been removed." Your link checker reported a clean bill of health on a page that is, to a human, broken.

**JavaScript-rendered links and pages.** If links are injected by client-side JS, or the destination page only assembles its real content after hydration, a checker that reads raw HTML never sees them. Single-page apps are the worst offenders: the server returns the same shell for `/docs/install` and `/docs/this-page-was-deleted`, both 200, and only the client-side router decides one of them is a dead end.

**Auth walls and bot blocks.** Links behind a login, or pages that serve a CAPTCHA / "are you a robot" interstitial to non-browser clients, confuse status-only checkers. A 403 might mean the link is broken, or it might mean the crawler got blocked while a logged-in user sails through. You cannot tell from the code alone.

**Redirect chains that end somewhere wrong.** A 301 to a 302 to a 200 looks fine in the status column. But if that chain ends on the homepage instead of the article it promised, the link is functionally broken — the user did not get what the anchor text said they would.

**Cookie banners, age gates, and region redirects.** A real browser hits the consent wall, the geo-redirect, the interstitial. A bare HTTP request sails past them and reports a reality your visitors never see.

None of this makes HTTP checkers bad. They are the right first pass — fast, broad, cheap. But for the links that matter most (top nav, pricing CTAs, docs, checkout), a browser-real verification pass catches the failures a status code cannot describe.

## Crawl, then verify: the two-pass model

The approach I recommend is not "replace your crawler with an AI." It is two passes, each doing what it is best at.

**Pass one — crawl wide with a fast tool.** Let a request-based crawler enumerate your URLs and flag the obvious dead ones: the hard 404s, the 500s, the timeouts. This is cheap and you should run it often. Screaming Frog's free tier handles up to 500 URLs; the paid tools and free web checkers scale further. Use this to get the inventory and kill the easy failures.

**Pass two — verify the links that matter in a real browser.** Take the high-value links — the ones in your global nav, your pricing and signup CTAs, your top docs pages, your marketing landing pages — and have an AI browser actually visit each one, load it fully, and judge in plain English whether the page is what the link promised. This is where a broken link checker ai earns its place, because the judgment ("is this a real page or a disguised error?") is exactly the fuzzy call that defeats a status code.

The split keeps cost sane. You are not paying to render every image and tracking pixel on a 200,000-URL site in a real browser — that would be slow and pointless. You are spending the browser-real budget only where the difference between 200 and "actually broken" costs you money.

## Doing crawl-plus-verify with BrowserBash

BrowserBash is a natural-language browser automation CLI. You write a plain-English objective, and an AI agent drives a real Chrome browser step by step — no selectors, no page objects — then returns a verdict plus structured extracted values. For link verification that maps cleanly: you describe the page and ask the agent whether the links work and lead somewhere sensible, and it reads the rendered result the way a person would.

Install it once:

```bash
npm install -g browserbash-cli
```

It needs Node 18 or newer and Chrome for the default local provider. There is no account and no signup to run it. On the model side it is Ollama-first: the default `auto` setting looks for a local Ollama install and uses it (free, nothing leaves your machine, a guaranteed $0 model bill), then falls back to an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` if you have one set.

A single verification run looks like this:

```bash
browserbash run "Open https://example.com/pricing, find every link and button in the main content and footer, click or follow each one, and report any that lead to a 404, an error page, a 'page not found' message, or a destination that does not match the link text. List the broken ones with their anchor text and destination URL."
```

The agent opens the page in real Chrome, enumerates the links it can see after the page renders, follows them, reads each destination, and gives you a verdict plus the structured list of failures. Because it is reading the *rendered* page, a soft 404 served with a 200 status still gets caught — the agent sees the "this page no longer exists" text and calls it broken, which is the whole point.

For pages that need a login first, you describe the login as part of the objective and pass credentials as variables rather than hard-coding them. Keep secrets out of the objective string and out of your shell history.

### When you want it committed and repeatable

One-shot `run` is great for ad-hoc checks. For a link audit you run on a schedule, use a markdown test you can commit to the repo:

```bash
browserbash testmd run ./link_audit_test.md
```

Each list item in the markdown file is a step, you can template values with `{{variables}}`, secret-marked variables are masked as `*****` in every log line, and BrowserBash writes a human-readable `Result.md` after each run. That turns "go check the important links" into a reviewable, version-controlled artifact your team can read in a pull request. The [tutorials](https://browserbash.com/tutorials) walk through the markdown test format in more depth.

### Wiring it into CI

The point of catching dead links is to catch them before users do, which means running the check in CI on every deploy. BrowserBash has an agent mode built for exactly this:

```bash
browserbash run "Visit the homepage of https://staging.example.com and verify every link in the top navigation and footer loads a working page, not a 404 or error." --agent
```

`--agent` emits NDJSON — one JSON object per line — instead of prose, so a pipeline or an AI coding agent can parse it without scraping human text. You get `step` events as it works and a terminal `run_end` event with a status. The exit codes are the part CI cares about: `0` passed, `1` failed, `2` error, `3` timeout. Wire that into your deploy gate and a newly-broken nav link fails the build. Add `--record` and you get a screenshot plus a `.webm` video of the session, which is the difference between "a link is broken" and "here is exactly what the user saw." The [features page](https://browserbash.com/features) covers recording and agent mode in detail.

## A comparison that is honest about the trade-offs

No tool is the right answer for the whole job. Here is how the browser-real approach stacks up against the checkers most teams already use. Competitor details below are general and current as of 2026; pricing and feature specifics change, so verify against each vendor before you buy.

| Approach | Discovery scale | Catches soft 404s / JS errors | Verifies redirect *destination* | Cost model | Best at |
| --- | --- | --- | --- | --- | --- |
| Free web checkers (Dead Link Checker, etc.) | Moderate | No (status-based) | Partial | Free | A quick, no-signup sweep |
| Screaming Frog SEO Spider | Very large (500 URLs free; paid scales) | No (status-based) | Yes, shows chains | Free tier + paid license | Deep technical crawl of a whole site |
| Ahrefs / Semrush Site Audit | Very large | Limited | Yes | Subscription | Ongoing SEO monitoring + reporting |
| BrowserBash (AI browser) | Targeted, not bulk | Yes — reads the rendered page | Yes — judges if destination matches intent | Free, open-source; $0 on local models | Browser-real verification of high-value links |

Read that table the right way. For enumerating every URL on a large site and pulling the status of all of them, a dedicated crawler like Screaming Frog or a site-audit suite is the better tool — it is built for breadth and it is fast. BrowserBash is not trying to crawl 200,000 URLs in a browser, and you should not ask it to. Its advantage is the verification pass: the rendered-page judgment that a status code cannot make. Use the crawler for the inventory and the easy kills, and the AI browser for the links where "200 OK" is a lie.

## The honest caveats

I would rather you go in clear-eyed than disappointed.

**It is slower per link.** Rendering a real browser, running JavaScript, and reading the page takes seconds per link, not milliseconds. That is fine for a few hundred important links and wrong for a few hundred thousand. Scope the verification pass deliberately.

**Local model size matters.** BrowserBash runs free on a local Ollama model, but very small models (8B and under) get flaky on long, multi-step objectives — they lose the thread halfway through a list of links. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the hardest flows. If your link-check objective is a long one, do not run it on a tiny model and conclude the approach does not work; the model was the bottleneck, not the idea. The [learn section](https://browserbash.com/learn) has guidance on picking a model.

**Non-determinism is real.** An AI agent driving a browser can phrase a verdict differently run to run, or take a slightly different path. For link checking the *outcome* (broken vs. fine) is usually stable, but if you need byte-identical, perfectly reproducible reports across runs, a deterministic crawler is the safer choice. Lean on agent mode's exit codes and structured output rather than parsing prose, and the variance mostly stops mattering for CI.

**It is verification, not a sitemap generator.** BrowserBash will not hand you a tidy XML report of all 50,000 URLs and their statuses. Pair it with a crawler that does that well. The two-pass model exists precisely because neither tool is the whole answer.

## Who this is for

Reach for an AI browser link checker if you have a site where the *rendered* experience diverges from the raw HTML — a JavaScript-heavy app, a single-page app, a CMS that serves soft 404s, content behind a login or a consent wall. Reach for it when the cost of a specific broken link is high: a dead checkout CTA, a broken docs link your sales team sends to prospects, a 404 in your top navigation. And reach for it when you want the check to live in CI and fail a deploy, with a screenshot and a video of exactly what broke, rather than a weekly email you skim and forget.

Stick with a traditional crawler if your main need is breadth — enumerate every URL, get every status, generate the report — and your site is mostly server-rendered HTML where a 200 genuinely means a working page. In that world a status-based checker is faster, cheaper, and entirely sufficient. The honest answer for most teams is *both*: a crawler for the wide sweep, an AI browser for the verification pass on the links you cannot afford to have broken. The [case study](https://browserbash.com/case-study) shows how teams combine fast checks with browser-real verification in practice.

If you want to keep the whole thing local and free, that is the default path: install the CLI, run a local model through Ollama, and nothing leaves your machine. You can spin up the optional local dashboard with `browserbash dashboard` (it runs at localhost:4477, fully local) to browse past runs, screenshots, and verdicts. Cloud upload exists and is strictly opt-in — without `--upload` after linking, every run stays on your disk. Pricing for the optional hosted pieces is on the [pricing page](https://browserbash.com/pricing).

## A practical starting recipe

If you are setting this up for the first time, here is the sequence I would follow.

Start by listing your high-value link sets: global nav, footer, pricing/signup CTAs, the top ten docs pages, your most-linked blog posts. That is your verification scope — the links where a status code is not enough.

Run a fast crawler first to clear the obvious dead links and get an inventory. Fix the hard 404s and 500s there; they do not need a browser.

Then write a BrowserBash markdown test that walks the high-value link sets in a real browser and asserts each destination is a real page, not a disguised error or a wrong redirect. Commit it. Run it in CI on every deploy with `--agent` so a newly-broken important link fails the build, and add `--record` so when something breaks you have the video. Over a few weeks you will tune which links belong in the browser-real pass and which are fine left to the crawler — and that boundary is the actual skill here.

The result is a link-checking setup that matches how your site really behaves: broad and cheap where breadth is what you need, deep and human-real where a wrong answer costs you a customer.

## FAQ

### What is a broken link checker AI?

It is a link checker that uses an AI agent driving a real browser to verify links, instead of only firing HTTP requests and reading status codes. Because it loads the page like a human and reads the rendered result, it catches failures a status-based checker misses — soft 404s served with a 200, JavaScript errors, single-page-app dead ends, and redirects that land on the wrong page.

### Can an AI browser find broken links that Screaming Frog misses?

Yes, specifically the ones where the HTTP response disagrees with the human experience. Screaming Frog and similar crawlers are excellent at breadth and status checking, but a soft 404 returning a 200 status, or a JavaScript-rendered page that fails after hydration, looks healthy to a status-based crawler. An AI browser reads the rendered page and judges whether it is really a working destination, so it catches those disguised failures.

### How do I check for broken links in CI on every deploy?

Run BrowserBash in agent mode with the `--agent` flag, which emits NDJSON and returns exit code 0 for passed, 1 for failed, 2 for error, and 3 for timeout. Wire that exit code into your deploy gate so a newly-broken important link fails the build. Add the `--record` flag to capture a screenshot and a video of exactly what the broken link did.

### Is browser-based link checking free?

The BrowserBash CLI is free and open-source under Apache-2.0, and it runs on a local Ollama model by default, so nothing leaves your machine and there is no model bill. You only pay if you opt into a capable hosted model via your own API key, or use the optional cloud dashboard. For local runs the cost is your own compute and time.

Crawl wide, verify where it matters. Start with one command:

```bash
npm install -g browserbash-cli
```

No account is needed to run it locally — but if you want the optional cloud dashboard, you can [sign up here](https://browserbash.com/sign-up).
