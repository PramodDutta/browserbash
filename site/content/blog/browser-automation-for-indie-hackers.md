---
title: Browser Automation for Indie Hackers: Free & No Selectors
description: "Browser automation for indie hackers that costs $0: a free Apache-2.0 CLI that runs local models and smoke-tests your whole funnel with no selectors."
date: 2026-04-29
category: use-case
---

You ship alone. There is no QA team behind you, no dedicated automation engineer, and definitely no budget line for a Sauce Labs or BrowserStack seat. So browser automation for indie hackers ends up being whatever you can stand up in an evening between building the actual product and answering support tickets. Most of the time that means nothing automated at all — you click through the signup, the checkout, and the dashboard by hand before every deploy, and you hope you remembered every path. This article is about getting a real safety net for $0, without writing a single CSS selector, using a free open-source CLI that drives a real browser from plain English.

The pitch is deliberately narrow. You are not trying to build a 2,000-test enterprise regression suite. You want to know that your funnel — landing page to signup to first paid action — still works after the change you just pushed. That is a smoke test, and as a solo founder it is the single highest-leverage thing you can automate. The trick is doing it without the two things that usually stop indie hackers cold: a per-seat SaaS bill and the hours it takes to write and maintain locator code.

## Why the usual tools don't fit a one-person team

The browser automation market is built for teams that have people. Cloud grids like Sauce Labs and BrowserStack are excellent at what they do — parallel runs across hundreds of OS/browser combinations, real device farms, enterprise support. But the pricing model assumes you have several engineers running thousands of tests a month and a manager who signs off on a four-figure annual contract. As a solo founder, you are paying for a fleet when you need a bicycle.

The code-first open-source tools — Selenium, Playwright, Cypress, Puppeteer — solve the license cost. They are genuinely free to install and they are the right answer for many teams. The problem for a one-person shop is the *other* cost: authoring and maintenance. Every test is code. You write the locators, you store them in page objects, and you patch them every single time you rename a button or restructure a form. When you are the only person on the project, the frontend changes constantly, which means your test suite is perpetually red for reasons that have nothing to do with a real bug. A lot of indie hackers write a Playwright suite in month one and quietly abandon it by month three because keeping the selectors current costs more attention than they have to give.

So the gap is specific. You want something that:

- Costs nothing to install and nothing to run.
- Doesn't make you write or maintain selectors.
- Can verify a multi-step flow end to end, not just load a page.
- Runs locally so you can use it tonight without a sales call.

That is exactly the slot BrowserBash is built for.

## What "no selectors" actually buys a solo founder

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You install it with one npm command, you write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — clicking, typing, scrolling, reading the page — and hands back a verdict plus structured results. There are no selectors, no page objects, and no `data-testid` attributes to maintain.

Here is what that means in practice. A traditional test for your signup flow contains lines like `page.locator('#email-input').fill(...)` and `page.getByRole('button', { name: 'Create account' }).click()`. The moment you redesign that form, those lines break. With BrowserBash, you write the *intent*:

```bash
npm install -g browserbash-cli

browserbash run "Go to myapp.com, click Get Started, sign up with email founder+test@myapp.com and password Hunter2!, and confirm you land on the onboarding screen"
```

The agent figures out which element is the email field and which button says "Get Started" by looking at the actual rendered page, the way a human would. When you rename "Get Started" to "Start free trial," a selector-based test fails; the agent just reads the new label and keeps going. For a solo founder who refactors UI on a whim, that resilience is the whole point — it removes the maintenance tax that kills most one-person test suites.

The honest tradeoff: an AI agent reading the page is slower per step than a hard-coded selector, and it is not deterministic in the way `#email-input` is. For a smoke test you run on deploy, that is a fine trade. For a 5,000-case suite that runs on every commit, you would feel the latency. Know which job you are doing.

### Plain English is also documentation

There is a second, quieter benefit. The objective you write *is* the spec. "Sign up, add a paid plan, confirm the receipt email shows the right amount" reads like a sentence a non-engineer could understand, because it is one. Six months from now when you have forgotten how the flow works, the test still tells you. Selector code never does that.

## The $0 model bill: Ollama-first, no API keys

This is the part that makes "free" honest rather than a free trial. Every AI browser tool needs a model to do the reasoning, and most of them route that reasoning through a hosted API that charges per run. You stop paying for selector maintenance and start paying an inference meter instead. If the whole reason you reached for AI was to cut overhead, swapping engineer-hours for a per-run API charge can defeat the point.

BrowserBash is Ollama-first. By default it talks to a free local model running on your own machine through [Ollama](https://browserbash.com/learn) — no API keys, no account, and nothing leaving your laptop. It auto-resolves a provider in this order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. If you have Ollama running, you never touch a key and you never see a bill. You can guarantee a $0 model cost on local models. For an indie hacker watching every dollar of runway, that is the difference between "I'll set up testing later" and "I set it up tonight."

You have three model paths, and they map cleanly to budget:

| Model path | Cost | API key needed | Best for |
| --- | --- | --- | --- |
| Local Ollama (default) | $0, guaranteed | No | Smoke-testing your funnel for free, privacy-sensitive flows |
| OpenRouter free models | $0 (e.g. `openai/gpt-oss-120b:free`) | OpenRouter key | Hard flows when your laptop can't run a big local model |
| Anthropic Claude | Pay-as-you-go | Your own Anthropic key | The most reliable runs on long, tricky objectives |

The genuinely free OpenRouter option matters because of an honest caveat: very small local models — roughly 8B parameters and under — get flaky on long multi-step objectives. They lose the thread halfway through a checkout, click the wrong thing, or hallucinate that they succeeded. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If your machine can run a 70B-class model, your local runs will be solid and free. If it can't, a free hosted model like `openai/gpt-oss-120b:free` on OpenRouter gives you a stronger brain at still-zero cost. You are not stuck choosing between "free but flaky" and "reliable but paid" — there is a free-and-capable lane.

```bash
# Point BrowserBash at a free hosted model on OpenRouter
export OPENROUTER_API_KEY=sk-or-...
browserbash run "Log in at app.example.com with the test account and confirm the dashboard shows my project list" \
  --model "openai/gpt-oss-120b:free"
```

## Smoke-testing your whole funnel for free

Here is the workflow I'd actually recommend for a solo founder. Pick the three or four flows that, if they broke silently, would cost you money or signups. For most SaaS and e-commerce indie projects that is: the landing-page CTA, the signup, the login, and the paid conversion. Then write one plain-English objective per flow and run them all before every deploy.

A real example BrowserBash can run end to end: log in to a store, add an item to the cart, complete checkout, and verify the page shows "Thank you for your order!" That single objective exercises auth, the cart, payment, and the confirmation — the entire money path — in one command.

```bash
browserbash run "Log in to shop.example.com as test@example.com / TestPass123, \
add the first product to the cart, go to checkout, fill the test card 4242 4242 4242 4242, \
place the order, and verify the page says 'Thank you for your order!'" \
  --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg, so when something fails you can watch exactly where the agent got stuck instead of squinting at a stack trace. On the builtin engine it also captures a Playwright trace you can open in the trace viewer. For a debugging-alone founder, a video of the failure is worth a lot more than a log line.

### Run it headless and on a schedule

Once your objectives are stable, run them headless so they don't pop a browser window while you work, and wire them into a cron job or a GitHub Action. The default `local` provider uses your own Chrome, so you can run the whole thing on your laptop or a cheap VPS for free.

```bash
browserbash run "Visit example.com, click 'Start free trial', and confirm the signup form loads" --headless
```

If you'd rather keep your authored flows in version control, BrowserBash supports committable Markdown tests. A `*_test.md` file lists each step as a list item, supports `@import` composition so you can reuse a login flow across tests, and `{{variables}}` templating. Variables you mark as secret get masked to `*****` in every log line, which means you can keep credentials out of your terminal scrollback and out of CI logs.

```bash
browserbash testmd run ./checkout_test.md
```

Each run writes a human-readable `Result.md` next to the test, so you get a plain-English record of what happened without parsing anything. For a primer on writing these, the [BrowserBash learn pages](https://browserbash.com/learn) walk through the format.

## Where it runs: your Chrome by default, cloud grids when you need them

The model is the *brain*; the provider is *where the browser actually runs*. BrowserBash switches providers with a single `--provider` flag, and the default keeps you free:

| Provider | What it is | Cost posture for a solo founder |
| --- | --- | --- |
| `local` (default) | Your own Chrome/Chromium | Free — the everyday choice |
| `cdp` | Any DevTools endpoint | Free if you self-host the browser |
| `browserbase` | Hosted browser infra | Paid third-party |
| `lambdatest` | Cloud grid, cross-browser | Paid third-party |
| `browserstack` | Cloud grid, real devices | Paid third-party |

The point of this design is that you start free and local, and the day you genuinely need to verify your app on Safari on a real iPhone — say, a paying customer reports a bug you can't reproduce — you flip one flag instead of rewriting your tests.

```bash
browserbash run "Open the pricing page and confirm the annual toggle updates every plan price" \
  --provider lambdatest
```

You bring your own grid account for that; BrowserBash doesn't resell those minutes. But the workflow, the objectives, and the no-selectors authoring all stay identical whether the browser is on your laptop or in someone's cloud. That continuity is rare and it matters: you don't have to throw away your free local tests to scale up later.

## Honest limits: when an indie hacker should reach for something else

Credibility beats hype, so here is where BrowserBash is *not* the right call.

**You need massive parallel cross-browser coverage as a core requirement.** If your business genuinely depends on being verified across 50 browser/OS combinations on every commit, a dedicated cloud grid like Sauce Labs or BrowserStack is built for exactly that, and the per-seat cost is the price of a capability you actually use. BrowserBash can drive those grids, but it is not itself a device farm.

**You're running thousands of deterministic tests on every commit.** An AI agent reading the page is slower and less deterministic than compiled selector code. For a huge, mature suite where milliseconds and exact repeatability matter, a Playwright or Cypress suite maintained by an engineer is the better engine. The honest framing: BrowserBash shines for smoke and exploratory flows where authoring speed and resilience matter more than raw throughput.

**You only have a tiny local model and no internet.** If your laptop can't run a 70B-class model and you can't reach a free hosted model, a sub-8B local model will be flaky on long flows. In that situation, keep your objectives short — one or two steps each — or borrow a free OpenRouter model when you're online.

For most solo founders, none of these are dealbreakers, because the job is smoke-testing a handful of critical flows, not running an enterprise regression farm. But you should know the edges. If you want the longer comparison against a managed-grid approach, the [Sauce Labs comparison on the blog](https://browserbash.com/blog) lays it out flow by flow.

### A quick decision guide

- **Solo founder, want a free funnel smoke test tonight, no budget:** BrowserBash on local Ollama. This is the home run.
- **Same, but your laptop is underpowered:** BrowserBash pointed at a free OpenRouter model.
- **You hit a customer-reported bug on a browser you don't own:** BrowserBash with `--provider lambdatest` or `browserstack`.
- **You're now a funded team running thousands of deterministic tests per commit:** keep a Playwright suite for the bulk, use BrowserBash for the exploratory and smoke layer.

## Plugging it into the rest of your stack

Most indie hackers are already deep in AI coding tools — Cursor, Claude Code, Aider, whatever drives your editor. BrowserBash was built to be called by those agents, not just by humans. Run it with `--agent` and it emits NDJSON: one clean JSON event per line on stdout, no prose to parse. The exit codes are explicit — `0` passed, `1` failed, `2` error, `3` timeout — so a CI step or a coding agent can branch on the result without reading English.

```bash
browserbash run "Sign up, verify the welcome email link works, and confirm the account is active" \
  --agent
```

That makes a tidy loop: your AI coding agent writes a feature, then calls BrowserBash to actually drive the browser and confirm the feature works in a real Chrome, then reads the structured verdict and keeps going or fixes itself. For a one-person team, having the verification step be machine-readable means you can automate the "did it actually work?" question instead of clicking through manually every time.

When you do want a human view of what happened, you have two free dashboards. `browserbash dashboard` gives you a fully local dashboard — nothing uploaded, everything on your machine. If you want run history, video recordings, and per-run replay you can share, the optional cloud dashboard is strictly opt-in: you run `browserbash connect` once and add `--upload` to the runs you want stored. Free uploaded runs are kept for 15 days. No account is required to *run* BrowserBash at all — the dashboard is a convenience, not a gate. You can read more about the hosted side on the [pricing page](https://browserbash.com/pricing).

```bash
browserbash run "Complete the full checkout flow and verify the order confirmation" --upload --record
```

## A realistic first week with BrowserBash

If you're convinced enough to try it, here's a sequence that won't eat your weekend.

**Day one:** install with `npm install -g browserbash-cli`, make sure Ollama is running with a decent model, and write a single objective for your most important flow — usually signup or checkout. Run it locally, watch it drive your real browser, fix the wording until it passes reliably. That's an hour, maybe less.

**Day two:** add objectives for your other two or three money paths. Move them into `*_test.md` files so they live in your repo, use `@import` to share the login step, and mark your test password as a secret variable so it's masked in logs. Run `browserbash testmd run` and read the `Result.md` it writes.

**Day three:** wire `--agent` and `--headless` into a GitHub Action or a pre-deploy hook so the funnel gets checked automatically before anything ships. Branch on the exit code. Now you have a real safety net that cost you zero dollars and a few hours, and that keeps working even when you forget it exists.

The version to install is 1.3.1, the command is `browserbash`, and the whole thing is Apache-2.0 on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read the source or open an issue. You can also grab it straight from [npm](https://www.npmjs.com/package/browserbash-cli).

## FAQ

### Is browser automation actually free for indie hackers, or is there a hidden bill?

It can be genuinely free if every layer is free. BrowserBash itself is open-source under Apache-2.0, so there's no license cost, and it defaults to a local Ollama model, so there's no per-run API charge and no API key. As long as you run on the default local provider with a local model, your model bill is $0 and nothing leaves your machine. The only paid paths are optional third-party cloud grids you choose to add.

### Do I need to write CSS selectors or page objects to use it?

No. You write a plain-English objective describing what you want to verify, and the AI agent reads the actual rendered page to find the right elements, the way a person would. When you rename a button or redesign a form, a selector-based test breaks but the agent simply reads the new label and continues. That removes the ongoing maintenance work that usually makes solo founders abandon their test suites.

### Can a small local model handle a full checkout flow, or do I need a paid model?

Very small local models, around 8B parameters and under, tend to get flaky on long multi-step flows like checkout — they can lose track or report false success. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, which stays free if your machine can run it. If it can't, you can point BrowserBash at a capable free hosted model such as `openai/gpt-oss-120b:free` on OpenRouter and still pay nothing.

### When should an indie hacker pick a cloud grid like Sauce Labs instead?

Reach for a managed grid when massive parallel cross-browser or real-device coverage is a core requirement — for example, you must verify every commit across dozens of OS and browser combinations, or reproduce a bug on a real iPhone you don't own. For that job, dedicated grids are purpose-built and worth the seat cost. For everyday smoke-testing of your funnel before a deploy, a free local tool is the better fit, and BrowserBash can still drive those grids with one flag when you do need them.

Browser automation for indie hackers doesn't have to mean a sales call and a credit card. Install it with `npm install -g browserbash-cli`, run your first plain-English smoke test on a free local model tonight, and keep your funnel honest for $0. When you want shareable run history and video replay, [sign up here](https://browserbash.com/sign-up) — though an account is entirely optional, since everything runs without one.
