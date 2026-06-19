---
title: Fetch Any Web Page to Clean Markdown From the Command Line
description: "How to fetch a webpage to markdown from the CLI for agents and RAG, with a browser-render fallback when plain HTTP returns empty JavaScript shells."
date: 2026-02-03
category: use-case
---

If you have ever piped `curl` into a markdown converter and watched it spit out an empty shell, you already know the gap this article is about. The goal sounds simple: fetch a webpage to markdown from the CLI, get clean readable text, and hand it to an agent or drop it into a RAG pipeline. For a lot of pages that one-liner works. For the modern, JavaScript-heavy web, it quietly fails, and you do not always notice until the model starts hallucinating around content that never made it into the context window.

This is a practical walkthrough of how to pull page content as markdown from the terminal, why the curl-style path breaks on certain sites, and how a real browser fits in as a fallback when HTTP alone is not enough. I will name the tools that already do the "pure conversion" job well, be honest about where they win, and show where [BrowserBash](https://browserbash.com/features) earns its place: not as a markdown converter, but as the thing you reach for when the page only exists after JavaScript runs, or when "get the content" actually means "log in, click through, then get the content."

## Why fetch a web page to markdown at all

Raw HTML is a terrible input for a language model. It is full of `<div>` soup, inline styles, analytics tags, cookie banners, three navigation menus, and a footer with forty links. Every one of those tokens costs you money and dilutes the signal. When you feed an LLM clean markdown instead, you strip the boilerplate, keep the headings and lists and code blocks that carry meaning, and shrink the payload by an order of magnitude. The model reasons better over less noise.

The use cases stack up fast once you can do this reliably from a script:

- **Agent context.** An autonomous agent needs to "read" a documentation page, a changelog, or a competitor's pricing page before it decides what to do next. Markdown is the lingua franca it understands.
- **RAG ingestion.** You are building a retrieval index. You want the article body, not the chrome around it, chunked and embedded.
- **Research and summarization.** A nightly job that pulls a list of URLs, converts each to markdown, and asks a model to summarize the diff since yesterday.
- **Archiving readable copies.** You want a clean, version-controllable snapshot of a page, not a 2 MB HTML blob.

The phrase to keep in mind is "readable content." You almost never want the literal DOM. You want the part a human would actually read, expressed as text a machine can parse cheaply. That framing is what separates a good fetch-to-markdown setup from a dumb HTML dump.

## The curl-style baseline: fast, free, and right most of the time

Let me be fair to the simple path, because it is genuinely good and you should use it whenever it works. The classic Unix approach is to fetch the HTML and run it through a converter.

A bare conversion looks like this with [Pandoc](https://pandoc.org/MANUAL.html), the universal document converter:

```bash
curl -s https://example.com/article | pandoc -f html -t gfm --wrap=none -o article.md
```

Pandoc is excellent at the mechanical HTML-to-markdown transform. The catch is that it converts *everything* it receives, including the nav, the sidebar, and the cookie notice. So most people reach for a readability layer first. Mozilla's Readability algorithm (the same one behind Firefox Reader View) isolates the main article body before conversion, and several open-source CLIs wrap it: `readability-cli`, `url-to-markdown-cli-tool`, `fetch-md`, `percollate`, and `md-fetch` all do some version of fetch, extract the main content, convert to markdown, sometimes generate YAML frontmatter. Many require no API key and no LLM at all, which makes them cheap and private.

This whole family shares one architecture and therefore one blind spot. They do an **HTTP GET** and convert whatever bytes come back. That is the right tool when:

- The page renders its content server-side (most blogs, docs sites, news articles, Wikipedia).
- You do not need to be logged in.
- There is no bot wall, no consent gate, no "click to load more."

When those conditions hold, an HTTP-plus-Readability pipeline is faster and lighter than anything that boots a browser. It runs in milliseconds, uses almost no memory, and costs nothing. If that describes your target pages, stop reading the rest of this and go install `readability-cli`. I mean that. Reaching for a browser when `curl` would do is over-engineering.

## Where plain HTTP breaks: the empty-shell problem

Here is the failure that sends people looking for something heavier. You run your tidy one-liner against a modern web app and get back almost nothing. The title is there, maybe some meta tags, and then a couple of empty `<div id="root">` or `<div id="app">` elements. The actual content is missing.

That is because a huge share of today's sites are client-rendered. The server ships a near-empty HTML skeleton plus a JavaScript bundle, and the browser builds the visible page after executing that JavaScript, often after one or more network round-trips for data. A plain HTTP GET never runs the JavaScript, so it sees the skeleton and nothing else. Single-page apps built on React, Vue, Svelte, and friends are the obvious case, but plenty of "normal" marketing and docs sites now hydrate their main content client-side too.

The other category of failures is not about rendering at all:

- **Auth walls.** The content sits behind a login. A `curl` request without a valid session sees the sign-in page, and your markdown is a beautifully clean conversion of a login form.
- **Consent and region gates.** A cookie wall or "choose your country" interstitial stands between the fetch and the article.
- **Interaction-gated content.** The data only appears after you click a tab, expand an accordion, accept terms, or scroll to trigger lazy loading.
- **Bot defenses.** Some sites serve different (or no) content to non-browser user agents.

In every one of these cases the HTML you receive is technically valid and your converter does its job perfectly. The output is just wrong, because the input was wrong. And this is the insidious part: the pipeline does not error. It returns clean markdown of the *wrong page*. You can run a nightly RAG job for a week before someone notices the index is full of cookie banners.

The fix is conceptually simple. Use a real browser. Let it execute the JavaScript, settle the network, get past the gate, *then* read the content. The question is how much machinery that takes and how much control you get over the "get past the gate" step.

## Browser-render fallback: where BrowserBash fits

[BrowserBash](https://www.npmjs.com/package/browserbash-cli) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. It is worth being precise about what it is and is not, because it does not slot neatly into the "URL-to-markdown converter" bucket and I do not want to oversell it.

What it is: you write a plain-English objective, and an AI agent drives a **real Chrome browser** step by step — no selectors, no page objects — and returns a verdict plus structured extracted values. Install it and run a one-shot objective:

```bash
npm install -g browserbash-cli
browserbash run "Open https://example.com/pricing, accept the cookie banner if shown, and return the full pricing table text and every plan name and price"
```

What it is *not*: it is not a `curl | turndown` drop-in that emits a clean markdown file for any URL in 200 milliseconds. It boots a browser, an AI model interprets your objective, and the agent navigates. That is heavier and slower than an HTTP GET, by design. The payoff is that the heavy path handles exactly the cases where the light path fails: JavaScript rendering, consent gates, login flows, click-to-reveal content, and "scroll until the article loads." Because a real browser executes the page first, the agent reads what a human would see, not an empty shell.

The "extraction" framing matters here. Instead of converting a whole DOM and hoping Readability picked the right node, you tell the agent in English what you want — "the article body," "every product name and price," "the changelog entries since version 2.0" — and it returns those values as structured output. For agent and RAG use cases that is often more useful than a raw markdown dump, because you skip a parsing step. If you do want the readable body as text, ask for it: "return the main article content as plain text." The agent reads the rendered page and hands it back.

There is a real model story behind this, and it is the part that makes the tool usable without a credit card. The default model is `auto`, resolved in order: a local **Ollama** model first (free, no keys, nothing leaves your machine), then `ANTHROPIC_API_KEY` if set, then `OPENAI_API_KEY`, otherwise a clear error telling you what to configure. On local models the model bill is a guaranteed zero. You can read the full breakdown in the [model selection guide](https://browserbash.com/learn).

One honest caveat, because it will bite you otherwise: very small local models (8B and under) are flaky on long multi-step objectives. They lose the plot, repeat steps, or declare victory early. For a single "open this page and read it" task they are often fine, but the sweet spot for anything multi-step is a mid-size local model (Qwen3 or a Llama 3.3 70B-class model) or a capable hosted model. Pick the model to match the difficulty of the flow, not the other way around.

## A decision table: which tool for which job

There is no single winner here. The right answer depends entirely on the page and the task. This is the table I would actually use.

| Situation | Best fit | Why |
|---|---|---|
| Static blog, docs, news, server-rendered article | `readability-cli` / Pandoc / `percollate` | HTTP GET works; milliseconds, zero cost, no browser |
| Bulk-converting thousands of clean URLs to markdown | Pure converter or a hosted reader | Throughput matters more than rendering; browsers are slow per page |
| Want a hosted "prepend a prefix" API, no local setup | Jina Reader (`r.jina.ai`) / Firecrawl | Managed rendering and cleaning; you trade local control for convenience |
| JavaScript-rendered SPA returns an empty shell | BrowserBash (browser-render fallback) | Real Chrome executes JS before reading |
| Content behind a login or consent gate | BrowserBash | Agent can accept the banner / complete the sign-in, then read |
| Content gated behind a click, tab, or lazy scroll | BrowserBash | Agent performs the interaction first |
| Need structured values, not a raw markdown blob | BrowserBash | Ask in English; get extracted fields back |
| Air-gapped / privacy-strict, must stay local | BrowserBash on local Ollama, or a no-key converter | Nothing leaves the machine |

Two of those rows deserve an honest word. Hosted readers like **Jina Reader** and **Firecrawl** are genuinely strong at the rendering problem. Jina Reader runs headless Chrome, applies Readability, and converts with Turndown; you literally prepend `https://r.jina.ai/` to a URL and get markdown back. Firecrawl manages JavaScript rendering and boilerplate removal as a service. If you want a managed pipeline and you are comfortable sending URLs to a third party, those are excellent and I will not pretend BrowserBash converts cleaner markdown than a tool whose entire job is converting clean markdown. Their exact pricing and model details are theirs to publish and change; check their sites for current terms rather than trusting a number in a blog post.

Where BrowserBash differs is control and locality. The browser runs on *your* machine (or an endpoint you point at), the objective is arbitrary English rather than a fixed "convert this URL" contract, and on a local model nothing about the page or your prompt leaves your laptop. That last point matters a lot for internal tools, authenticated dashboards, and anything you are not allowed to route through an outside API.

## Walking through a real fallback flow

Let me make the fallback concrete with the kind of page that defeats `curl`: a SaaS app's billing page that only renders after login and a bit of JavaScript.

The naive approach fails twice over. An HTTP GET hits the login redirect, and even if you smuggled a session cookie in, the billing table is hydrated client-side, so you would still get an empty container. This is the textbook case for a real browser driven by an objective.

```bash
browserbash run "Go to https://app.example.com, log in with the email and password from the environment, navigate to Billing, and return the current plan name, the renewal date, and every line item with its amount" --record
```

A few things are happening that the simple path cannot do. The agent handles the login as a step, waits for the rendered billing view, and reads the values a human would see. The `--record` flag captures a screenshot and a `.webm` session video (the built-in engine also writes a Playwright trace), so when the extraction looks off you can watch exactly what the browser saw instead of guessing. That observability is the difference between "the markdown is wrong and I have no idea why" and "oh, there was a second consent modal."

For credentials, you do not paste secrets into the objective string. BrowserBash's [markdown tests](https://browserbash.com/tutorials) support `{{variables}}` templating with secret-marked values that are masked as `*****` in every log line, and every run is stored on disk at `~/.browserbash/runs` with those secrets masked. So a repeatable, committable version of this flow keeps the password out of your shell history and out of the logs.

If you are wiring this into an agent rather than running it by hand, switch on agent mode:

```bash
browserbash run "Open https://news.example.com/article/123, dismiss any consent banner, and return the full article body as plain text plus the author and publish date" --agent
```

With `--agent`, BrowserBash emits NDJSON — one JSON object per line — instead of prose. You get `{"type":"step",...}` progress events and a terminal `{"type":"run_end","status":"passed|failed|error|timeout","final_state":{...}}` object, plus exit codes (0 passed, 1 failed, 2 error, 3 timeout). Your orchestrator parses structured events, not English. That NDJSON contract is what makes the browser-render fallback safe to put inside a CI job or an AI coding agent's tool loop, where prose parsing would be a liability.

## Keeping the output clean and the run honest

A few habits separate a reliable fetch-to-markdown setup from one that silently rots.

**Ask for the content you actually want.** With a converter you take whatever Readability extracts. With an objective-driven run you can be specific: "the main article body, excluding related-posts widgets and newsletter signups." Specificity reduces noise at the source, which is cheaper than cleaning it afterward.

**Verify rendering, do not assume it.** The whole reason you reached for a browser is that you suspected the page was client-rendered. Use `--record` on the runs you are not sure about. A ten-second video answers the question definitively. The free local dashboard, `browserbash dashboard` on `localhost:4477`, gives you a UI over your run history without anything leaving the machine.

**Set sane timeouts.** Browser flows take seconds, not milliseconds, and a hung page should fail loudly rather than block a pipeline. The `--timeout <seconds>` flag and the timeout exit code (3) let your scheduler treat a stuck page as a distinct outcome from a genuine failure.

**Match the model to the job.** A single "open and read" objective is easy. A "log in, navigate three pages, expand each section, and extract a table" objective is not. Use a capable model for the hard flows and accept that an 8B local model will struggle past a couple of steps. This is the most common reason a browser-render fallback "doesn't work" — it is usually the model, not the browser.

**Stay local unless you choose otherwise.** By default nothing leaves your machine. There is an optional cloud dashboard via `browserbash connect --key bb_...` with opt-in `--upload` per run (free cloud runs kept 15 days), but you opt into that deliberately. For sensitive pages, the local-only default is the feature.

## When NOT to reach for a browser

I want to close the loop on honesty here, because the failure mode of articles like this is selling the heavy tool for every job. Do not boot a browser when an HTTP GET would do. If your target pages are server-rendered and public, a Readability CLI or Pandoc is faster, lighter, and cheaper, and you should use it. If you need to convert ten thousand clean URLs overnight, per-page browser startup is a tax you do not want to pay; a pure converter or a hosted batch reader is the right call. If you are happy handing URLs to a third-party API and want zero local setup, Jina Reader or Firecrawl will serve you well.

Reach for the browser-render path specifically when the simple path returns the wrong thing: empty shells from client rendering, login and consent walls, click-gated content, or anything where "fetch the page" really means "operate the page, then read it." That is a meaningful slice of the modern web, and it is exactly the slice where `curl | pandoc` gives you a clean conversion of nothing useful. You can see more worked examples of this kind of flow on the [BrowserBash blog](https://browserbash.com/blog) and in the [case studies](https://browserbash.com/case-study).

The mental model is a ladder. Start with HTTP plus Readability. If the output is empty or wrong, climb one rung to a real browser and describe what you want in English. Most of your URLs will never leave the bottom rung — and that is the point.

## FAQ

### How do I fetch a webpage to markdown from the CLI?

For static, server-rendered pages the fastest path is an HTTP fetch piped into a converter, for example `curl` into Pandoc, or a Readability-based tool like `readability-cli` that isolates the main content first. For JavaScript-rendered pages, login-gated content, or anything behind a consent banner, a plain HTTP fetch returns an empty or wrong page, and you need a real browser to render it before reading. BrowserBash handles that browser-render case from one command.

### Why does curl return an empty page when I convert it to markdown?

Many modern sites ship a near-empty HTML skeleton plus a JavaScript bundle, and the browser builds the visible content only after executing that JavaScript. A `curl` request never runs the JavaScript, so it sees the skeleton and nothing else, and your converter faithfully turns that empty shell into empty markdown. The fix is to render the page in a real browser first, then read the content, which is exactly the fallback BrowserBash provides.

### Is BrowserBash a markdown converter like Jina Reader or Firecrawl?

Not exactly. Jina Reader and Firecrawl are dedicated URL-to-markdown services that render a page and emit clean markdown, and they are excellent at that specific job. BrowserBash is a natural-language browser automation CLI that drives real Chrome to handle pages requiring login, clicks, or JavaScript rendering, and returns the content or structured values you ask for in plain English. Use a converter for clean public pages, and BrowserBash when the page only exists after interaction.

### Can I extract page content without sending it to a third-party API?

Yes. BrowserBash defaults to a local model story: it resolves to a local Ollama model first, which means the page content and your prompt never leave your machine, and the model bill is zero. Nothing is uploaded unless you explicitly run `browserbash connect` and pass `--upload` on a run. For internal tools, authenticated dashboards, or privacy-strict workflows, the local-only default is the main reason to use it.

Ready to handle the pages `curl` can't read? Install with `npm install -g browserbash-cli` and run your first objective in under a minute. No account needed to run it locally — and if you want the optional cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up).
