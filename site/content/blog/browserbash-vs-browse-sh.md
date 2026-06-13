---
title: browse.sh vs BrowserBash: Which AI Browser CLI Should You Use?
description: "browse.sh vs BrowserBash compared for devs and QA: skills catalog vs plain-English tests, NDJSON, free local models, recordings, and CI exit codes."
date: 2026-06-13
category: comparison
---

If you have spent any time wiring an AI agent to a browser this year, you have probably hit both ends of the same problem: agents waste tokens re-learning the same website on every run, and there is no clean way to turn "did the checkout actually work?" into a pass or fail your CI can gate on. The **browse.sh vs BrowserBash** question maps almost exactly onto those two pains, because the tools attack different halves of it. browse.sh, from Browserbase, is a CLI plus a catalog of reusable browser *skills* that make agents cheaper and more reliable at navigating known sites. [BrowserBash](https://browserbash.com) is a free, open-source CLI that takes a plain-English objective, drives a real Chrome browser through an AI agent, and hands you back a verdict plus structured results you can act on.

Both are command-line tools, both are open source, and both are aimed at the agentic future. But they are not really competitors in the head-to-head sense — they are closer to complementary layers. This article lays out what each one actually does, where they overlap, where they don't, and how to decide which belongs in your stack. No fabricated benchmarks, no invented pricing; just the shape of each tool and an honest call on fit.

## What browse.sh is

browse.sh is a project from Browserbase, the team behind the Browserbase cloud browser platform and the Stagehand library. It launched in mid-2026 with two pieces that ship together.

The first is the **Browse CLI**, installed with `npm i -g browse`. It gives an agent low-level browser primitives — click, scroll, type, hover, press — against either local Chromium or a Browserbase cloud session (you switch to the cloud by prefixing commands with `cloud`). That part is conventional: it is the steering wheel an agent uses to actually move a page.

The second piece is the part that makes browse.sh distinctive: an **open catalog of browser skills**. A skill is a `SKILL.md` markdown file — plus any helper scripts — that captures exactly how to accomplish one task on one site: the steps, the API endpoints, the CSS selectors, the gotchas, and the workarounds that someone already figured out. Instead of your agent re-discovering how Zillow's listing page works on every single run, it loads the published skill and follows a battle-tested playbook. Browserbase frames the problem it solves as the "discovery tax" — the tokens and time agents burn relearning the same sites — and the catalog shipped with a hundred-plus verified skills across marketplaces, travel, government portals, and SaaS apps, with a system to auto-generate more.

So the mental model for browse.sh is: **a token-efficiency and reliability layer for agents that browse known websites.** It is less a test runner and more a shared memory of how the web works, packaged so any agent — in Claude Code, Cursor, or your own harness — can install a site's playbook on demand and stop paying the discovery tax.

## What BrowserBash is

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI built by The Testing Academy. You install it with `npm install -g browserbash-cli`. The premise is different in an important way: you do not write skills, selectors, or page objects at all. You write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser to accomplish it, then returns a **verdict** — passed or failed — alongside structured results.

```bash
browserbash run "Go to the demo store, add the cheapest item to the cart, \
proceed to checkout, and verify the order summary shows one item" --headless
```

That command launches a real browser, plans the steps at run time, reads the page the way a person would, and the `verify` clause becomes the assertion. If the order summary is wrong, the run fails. There is no selector to maintain and nothing to update when the markup shifts, because the agent re-reads the page on every run.

Under the hood, BrowserBash gives you two engines. The default is **stagehand** — the same open-source, self-healing automation library from Browserbase, which means BrowserBash and browse.sh actually share DNA at the driving layer. The second is **builtin**, an in-repo Anthropic tool-use loop that adds a Playwright trace when you record. For the brain, BrowserBash is **Ollama-first**: it auto-detects a local Ollama model so you can run entirely free, locally, with no API keys. It also supports OpenRouter — including genuinely free hosted models like `openai/gpt-oss-120b:free` — and Anthropic Claude if you bring your own key. The auto-detection order is Ollama, then Anthropic, then OpenRouter.

The mental model for BrowserBash is: **describe an outcome, get a pass/fail verdict and evidence, with the model and the browser location both swappable by a flag.** It is built to be a test runner and an agent tool, not a catalog.

## Where they actually differ

The cleanest way to see the difference is to notice what each tool optimizes for. browse.sh optimizes for an agent that already knows *what* it wants to do and needs to do it cheaply and repeatably on a specific site — it hands the agent a vetted route. BrowserBash optimizes for a human or agent that has an *outcome* in mind and wants a real browser to go achieve it and report whether it worked, without anyone writing the route at all.

That difference radiates into everything else. browse.sh's value compounds as the skill catalog grows and as your agents lean on shared playbooks. BrowserBash's value shows up the moment you have a flow you want verified — a login, a signup, a checkout, a journey — and no appetite to author or maintain the mechanics. One reduces the cost of *doing* known web work; the other reduces the cost of *checking* that web work succeeded.

A few capabilities are squarely BrowserBash's lane and worth calling out, because they matter most to QA and CI:

- **A machine-readable agent contract.** `browserbash run "..." --agent` emits NDJSON — one JSON event per line, stable schema — and the process exits with a meaningful code: `0` passed, `1` failed, `2` error, `3` timeout. There is no prose to parse, which is exactly what a CI step or an AI coding agent wants. The deeper rationale for that design lives in the [BrowserBash blog](https://browserbash.com/blog).
- **Committable markdown tests.** You can drop steps into a `*_test.md` file where each list item is a step, compose shared steps with `@import`, and use `{{variables}}` with secret masking that renders as `*****` in logs. Run them with `browserbash testmd run file_test.md`, and a `Result.md` report lands next to the file.
- **Recordings as evidence.** Pass `--record` and BrowserBash captures a screenshot plus a stitched `.webm` session video on any engine; the builtin engine also captures a Playwright trace.
- **A free, private dashboard.** Run `browserbash dashboard` for a local, private run history, or create a free account and push runs to the cloud with `--upload` for replay and history.

browse.sh has its own clear lane in return: a curated, shareable library of site-specific know-how, an `llms.txt` discovery surface so agents can find skills, and the discovery-tax savings that come from not relearning a site every run. If your problem is "my agent is expensive and flaky on the same twenty sites," that is precisely the gap browse.sh was built to close.

## browse.sh vs BrowserBash: feature comparison

The table below sticks to well-known, public facts about each tool. Where a detail about browse.sh is not publicly documented, it is marked as such rather than guessed.

| Dimension | browse.sh | BrowserBash |
| --- | --- | --- |
| Primary purpose | Catalog of reusable browser *skills* + CLI primitives for agents | Plain-English objective → browser run → pass/fail verdict |
| Install | `npm i -g browse` | `npm install -g browserbash-cli` |
| Maker | Browserbase | The Testing Academy |
| Open source | Yes (Browse CLI) | Yes, Apache-2.0 |
| Cost | Free CLI | Free |
| How you express work | Install/compose `SKILL.md` playbooks; drive with primitives | Write a sentence; agent plans steps at run time |
| Selectors required | Skills encapsulate selectors/endpoints | None — agent re-reads the page each run |
| Driving engine | Browser primitives (click, type, scroll, hover, press) | stagehand (default) or builtin Anthropic tool-use loop |
| LLM / brain | Used by your agent; provider not the product's focus | Ollama-first (free, local); OpenRouter incl. free models; Anthropic optional |
| Browser location | Local Chromium or Browserbase cloud (`cloud` prefix) | local Chrome (default), cdp, browserbase, lambdatest, browserstack via `--provider` |
| CI contract | Not its core focus | NDJSON via `--agent`; exit codes 0/1/2/3 |
| Committable tests | Skills are markdown playbooks | `*_test.md` with `@import`, `{{variables}}`, secret masking |
| Recordings | Not documented as a core feature | `--record`: screenshot + `.webm` video; trace on builtin |
| Dashboard | Public skill catalog UI | Free local dashboard; optional cloud via `--upload` |
| Best fit | Agents doing repeatable work on known sites | Verifying flows; CI gates; QA without page objects |

The single most useful row to internalize is the first one. browse.sh is a *library and toolkit*; BrowserBash is a *verifier*. Almost every other difference is downstream of that.

## A realistic BrowserBash workflow

To make the contrast concrete, here is the kind of end-to-end loop BrowserBash is built for — the part browse.sh deliberately does not try to be.

Start with a quick local check using a free local model, recording the run so you have a video if it fails:

```bash
browserbash run "Open https://the-internet.herokuapp.com/login, \
log in as {{username}} with password {{password}}, \
and verify the page says 'You logged into a secure area'" \
  --headless --record \
  --variables '{"username":"tomsmith","password":{"value":"SuperSecretPassword!","secret":true}}'
```

The password is marked `"secret": true`, so every log line shows `*****` instead of the value. With Ollama detected, that run costs nothing in API fees. Once it is stable, make it a committable test by moving the steps into `login_test.md` and running:

```bash
browserbash testmd run ./login_test.md --headless
```

A `Result.md` lands next to the file, readable by any teammate in review. Then wire it into CI in agent mode so the pipeline reads structured events and gates on the exit code, not on prose:

```bash
browserbash run "Open the login page, sign in, and verify the secure-area banner" \
  --agent --headless
```

Need to confirm the same flow on real Safari or a specific mobile profile before release? One flag changes where the browser runs — no rewrite:

```bash
browserbash run "Open the login page, sign in, and verify the secure-area banner" \
  --provider lambdatest
```

Nothing leaves your machine unless you add `--upload`; do that when you want the run pushed to the free cloud dashboard for replay and history (cloud runs are kept fifteen days on the free tier). The fuller version of this pattern, including how the NDJSON schema looks to a CI consumer, is walked through in the [BrowserBash learn docs](https://browserbash.com/learn).

## When to choose which

Be honest with yourself about which problem you are actually solving, because that single decision settles it.

**Reach for browse.sh when** your agents repeatedly operate on a known set of real-world sites and the pain is cost and flakiness from rediscovery. If you are building an agent that scrapes the same marketplaces, books the same kinds of travel, or fills the same government and SaaS forms, a shared catalog of vetted playbooks is exactly the leverage you want. browse.sh is also the natural fit when you already live in the Browserbase ecosystem and want cloud sessions and skills under one roof, or when the deliverable is the *action itself* rather than a verdict about it.

**Reach for BrowserBash when** the deliverable is a *judgment*: did this flow work, yes or no, and prove it. That covers smoke tests in plain English, journey tests across signup and checkout, exploratory passes on a UI that churns weekly, and any check a product manager should be able to read in review. It is the better fit when you need a hard CI contract — NDJSON plus exit codes — when you want to run entirely free and local on Ollama with no API keys, when you need recordings and traces as evidence, or when you want committable markdown tests with secret masking instead of code. If "no selectors, no page objects, just describe it and get a pass/fail" is the headline feature you need, that is BrowserBash.

And it is worth saying plainly: **these tools can coexist.** They share the Stagehand driving layer, so they are philosophically aligned. A team could use browse.sh skills to make an agent efficient at operating known sites, and use BrowserBash to verify that the resulting flows actually succeed and to gate merges on the outcome. One makes the doing cheaper; the other makes the checking trustworthy. You are rarely forced to pick exactly one.

If you are new to plain-English browser testing and want to compare BrowserBash against more tools before deciding, the [BrowserBash blog](https://browserbash.com/blog) covers head-to-heads with Selenium page objects, framework runners, and other AI CLIs, and the package itself is on the [npm registry](https://www.npmjs.com/package/browserbash-cli) if you want to install and try it in the next two minutes.

## FAQ

### Are browse.sh and BrowserBash direct competitors?

Not really. browse.sh is a CLI plus a catalog of reusable site-specific *skills* that make agents cheaper and more reliable at navigating known websites, while BrowserBash is a CLI that takes a plain-English objective, drives a real browser, and returns a pass/fail verdict for CI. They solve different halves of agentic browsing and even share the Stagehand driving layer, so many teams could reasonably run both.

### Can BrowserBash run for free without any API keys?

Yes. BrowserBash is Ollama-first: it auto-detects a local Ollama model and runs entirely on your hardware with no API keys and no usage fees. If you prefer hosted models, OpenRouter offers free options such as `openai/gpt-oss-120b:free`, and you can bring an Anthropic key for Claude — but none of that is required to get started.

### Do I have to write selectors or skills to use BrowserBash?

No. That is the core difference from selector-based or skill-based tooling. You write a plain-English objective, and the agent reads the live page and plans its own steps each run, so there are no CSS selectors, page objects, or `SKILL.md` files to author or maintain. You can still make tests committable as `*_test.md` files, but those are plain-English steps, not code.

### How does BrowserBash fit into a CI pipeline?

Run it in agent mode with `--agent`, which emits NDJSON — one stable JSON event per line — so there is no prose to parse. The process exits with a meaningful code: `0` for passed, `1` for failed, `2` for error, and `3` for timeout, which your pipeline can gate on directly. Add `--record` for a video and screenshot on failure, and `--upload` if you want the run pushed to the free cloud dashboard for replay.

---

Ready to try the plain-English approach? BrowserBash is free and open source — [create a free account](https://browserbash.com/sign-up) to unlock the cloud dashboard, run `npm install -g browserbash-cli`, and verify your first flow in a single sentence. No selectors, no page objects, no credit card.
