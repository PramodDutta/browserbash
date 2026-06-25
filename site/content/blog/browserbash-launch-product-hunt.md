---
title: BrowserBash is live on Product Hunt
description: "BrowserBash is live on Product Hunt: a free, open-source, local-first CLI that drives a real Chrome browser from plain-English objectives. No selectors."
date: 2026-06-24
category: guide
---

Today BrowserBash is live on Product Hunt, and I wanted to write the launch post myself rather than hand it to a marketing team I do not have. BrowserBash is a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) command-line tool that turns a plain-English objective into real browser actions. You write a sentence describing what you want done, and an AI agent drives an actual Chrome browser step by step to do it. No selectors, no page objects, no waiting code. Install it with `npm install -g browserbash-cli` and you are running in a minute.

I am Pramod Dutta, and I build BrowserBash at [The Testing Academy](https://browserbash.com). This is the version 1.3.1 release going up on Product Hunt, and the rest of this post is the honest tour: why it exists, what it actually does with a command you can paste and run, the parts I think matter, the one caveat I will not hide from you, and how you can help the launch if any of this resonates.

## Why I built it

I have spent years writing and teaching automated tests. The unglamorous truth of that work is that describing the behavior is the easy part. The grind is the locators, the explicit waits, and the constant patching when a frontend ships a redesign and forty `data-testid` references go stale overnight. You did not break the test. The product still works. But the suite is red because a class name moved, and now your afternoon belongs to maintenance.

That problem has a natural answer in 2026: let a model read the page the way a person does and act on intent instead of brittle selectors. Plenty of tools now promise some version of that. Here is what bothered me about most of them. They want a login. They want your credit card behind a meter that ticks on every run. They want your test data and your page snapshots flowing through somebody else's servers. The pitch is "AI-powered testing," and the fine print is a SaaS funnel.

BrowserBash is the opposite of that on purpose. It is free. It is open source under Apache-2.0, so you can read every line, fork it, and audit exactly what it does. And it is local-first in a way I mean literally: it is Ollama-first, so out of the box it prefers a free model running on your own hardware, with no API keys and nothing leaving your machine. The browser is yours, the model can be yours, and the only thing that travels is whatever you choose to send. That was the product I wanted to exist, so I built it.

## What it does, in one command

The fastest way to understand BrowserBash is to watch it do a full purchase flow from a single sentence. Install it, then run this against the standard Sauce Labs demo store:

```bash
npm install -g browserbash-cli

browserbash run "Open https://www.saucedemo.com, log in as standard_user with password secret_sauce, add the 'Sauce Labs Backpack' to the cart, open the cart, proceed to checkout, fill the form with first name Pramod, last name Dutta, postal code 560001, continue, finish the order, and verify the page shows 'Thank you for your order!'"
```

That command runs as printed. The demo credentials are published on the login page itself, so you can paste it and watch. The agent navigates, logs in, adds the backpack, opens the cart, walks the checkout form, places the order, and then checks for the confirmation text. The `verify` clause at the end is a hard assertion: if "Thank you for your order!" is not on the page when the agent looks, the run fails with a non-zero exit code.

Notice what is not in that command. There is no selector. No `#add-to-cart-sauce-labs-backpack`. No explicit wait. The agent re-reads the page at each step and decides the next action against whatever the screen actually looks like, which is exactly why a renamed class or a restructured DOM is usually a non-event instead of a broken build. You describe the goal; the agent figures out the steps. There is a fuller walkthrough of flows like this in the [tutorials](https://browserbash.com/tutorials), and a guided introduction on the [learn page](https://browserbash.com/learn).

## The pieces that matter

A one-liner is the demo. The parts that make BrowserBash useful past the demo are these.

**Markdown tests with masked secrets.** You do not have to keep everything in a shell string. You can write tests as Markdown files ending in `*_test.md`, with `{{variables}}` for the values that change between environments and masked secrets so passwords never get echoed into logs or recordings. The test, its inputs, and the steps are all plain text you can diff, review in a pull request, and comment on. After a run, BrowserBash also writes a human-readable result so a non-engineer can read what happened without opening a console. This is the bit that makes plain-English testing defensible in a review process. The migration path from page objects is covered on the [features page](https://browserbash.com/features).

**Agent mode for CI and coding agents.** Pass `--agent` and BrowserBash speaks NDJSON instead of pretty terminal output: one structured JSON event per line, easy for a script or an AI coding agent to parse as it streams. It pairs that with real exit codes, `0`, `1`, `2`, and `3`, so a CI pipeline can branch on the outcome instead of grepping text. That makes the same command you run by hand a clean gate in GitHub Actions, Jenkins, or whatever runs your builds, and it makes BrowserBash something an AI agent in your editor can call directly and understand the answer.

**Recording for evidence.** Add `--record` and you get a video, a screenshot, and, on the builtin engine, a full Playwright trace of the run. When something fails at 2 a.m., having the replay and the trace is the difference between "reproduce it tomorrow" and "watch exactly what happened right now."

**A free local dashboard.** Run `browserbash dashboard` and you get run history and replay on your own machine, no account required. There is an optional cloud dashboard if you want shared history across a team, but the local one is fully functional on its own and ships free.

**Providers, when you outgrow your laptop.** BrowserBash runs against your local Chrome by default, and you can point it elsewhere with `--provider`: `local`, `cdp` for any remote DevTools endpoint, or hosted grids like `browserbase`, `lambdatest`, and `browserstack`. The engine that drives the browser also flexes here, with `stagehand` (the MIT-licensed default) handling most local and DevTools runs and a `builtin` engine taking over for grids and trace capture. You scale out by changing a flag, not by rewriting tests.

**Ollama-first, which means a $0 model bill.** This is the design choice I am proudest of. BrowserBash auto-detects a local Ollama install before anything else, so the default path costs nothing and keeps your data on your hardware. The resolution order is Ollama, then Anthropic, then OpenRouter, so local wins by default and you only reach for a hosted key if you want one. OpenRouter gives you hundreds of models behind a single key, including genuinely free ones, and you can bring your own Anthropic key for a frontier model. The whole stack, browser plus tool plus model, can run on your laptop at a guaranteed zero model bill.

## The honest caveat

I am not going to oversell the local-model story, because the gap is real and you will hit it if I do not warn you. Tiny local models, roughly 8B parameters and under, get flaky on long multi-step objectives. They are fine for short, well-scoped tasks, but ask one to log in, add to cart, checkout, and verify across many turns and it will sometimes lose the thread or misread the page.

The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a hosted model when you want the ceiling raised. Those handle real flows reliably. So the free, fully local path is genuinely usable, but match the model to the job: small models for short tasks, a 70B-class local model or a hosted one for the long checkout-style journeys. That is the truth, and I would rather you know it before you run than feel misled after.

## How to support the launch

If anything above sounds like it would help your work, here is how you can pitch in today.

First, try it. `npm install -g browserbash-cli`, point it at a site you care about, and watch an agent drive Chrome from a sentence. You need Node 18 or newer and Chrome installed; that is the whole prerequisite list.

Second, leave honest feedback on [our Product Hunt page](https://www.producthunt.com/products/browserbash). I would genuinely rather have a sharp critical comment that tells me what is missing than a polite upvote. This is version 1.3.1, not a finished story, and the comments shape what I build next.

Third, if it earns it, star the repo on [GitHub](https://github.com/PramodDutta/browserbash). Stars are how an open-source project gets found by the next person with the same selector-maintenance headache, and the package itself lives on [npm](https://www.npmjs.com/package/browserbash-cli) if you want to point a teammate straight at it.

That is the ask. Try it, tell me the truth, and share it if it is worth sharing. You can read more launch notes and guides on the [blog](https://browserbash.com/blog), and if you want optional cloud run history you can grab a free account at [sign-up](https://browserbash.com/sign-up). The account is optional. Everything in this post runs locally without one.

## FAQ

### Is BrowserBash free?

Yes. BrowserBash is free and open source under the Apache-2.0 license, so you can read, fork, and audit the entire codebase. On the default Ollama-first path it runs on a free local model with no API keys, which means a zero model bill too. There is an optional cloud dashboard, but the CLI and the local dashboard cost nothing.

### Do I need an API key?

No. BrowserBash is Ollama-first and auto-detects a local Ollama install before anything else, so the default experience needs no API key and keeps your data on your own machine. If you want more capable hosted models, you can optionally add an OpenRouter or Anthropic key, but that is a choice, not a requirement. Local inference is the default, not a fallback.

### How is it different from Playwright?

Playwright is a code-first framework where you write the selectors, waits, and assertions yourself, which gives you precise, repeatable scripts at the cost of ongoing maintenance. BrowserBash flips that: you write a plain-English objective and an AI agent decides the steps by reading the page at run time, so a renamed class rarely breaks anything. The tradeoff is that it is goal-deterministic rather than path-deterministic, so you constrain it with explicit verify steps. They solve different problems, and many teams use both.

### Where can I try BrowserBash?

Install it with the npm command in this post and run it against any site in about a minute, with Node 18 or newer and Chrome as the only prerequisites. The package lives on npm and the source is on GitHub, both linked above. For a guided start, the tutorials and learn pages on the site walk you through your first runs.

Ready to try it? Install with `npm install -g browserbash-cli`, run a sentence against any site, and watch an AI agent drive a real Chrome browser. If you later want shared run history, grab a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up). An account is optional, and everything here runs locally without one.
