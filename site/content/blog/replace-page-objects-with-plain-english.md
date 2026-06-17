---
title: Replace the Page Object Model With Plain English in 2026
description: "Replace page object model with plain English: why the POM selector tax is avoidable and how BrowserBash's objective-first Markdown tests work without locators."
date: 2026-03-06
category: guide
---

You can replace the page object model with plain English, and most teams who try it never go back to writing selector files. The Page Object Model earned its place in test automation a decade ago, but the thing it was invented to manage — locators — is exactly the thing that now costs you the most. Every page gets a class. Every class gets a pile of CSS or XPath strings. Every UI change quietly breaks a handful of them, and someone spends a Thursday afternoon hunting down which `data-testid` got renamed. This guide argues that the POM maintenance tax is avoidable in 2026, and shows how an objective-first approach — describe what you want, let an AI agent drive a real browser — removes the locator layer entirely.

I have built and maintained POM suites in Java, TypeScript, and Python. I am not here to tell you the pattern was wrong. It was the correct answer to a real problem. I am here to tell you the problem itself has a new solution, and that solution does not involve a `pages/` directory.

## What the Page Object Model actually buys you

Before you replace something, be honest about what it does well. The POM gives you three things:

1. **A single source of truth for selectors.** When the login button's locator changes, you fix it in `LoginPage` and every test that uses it keeps working. No hunting through 40 test files.
2. **Readable test bodies.** `loginPage.login(user, pass)` reads better than a wall of `page.locator('#email').fill(...)`.
3. **Reuse.** Common flows — login, search, add-to-cart — live in one method instead of being copy-pasted.

Those are genuine benefits, and any replacement has to deliver them or it is a downgrade. The catch is that all three exist to compensate for one underlying fact: your tests are coupled to the DOM. The DOM is an implementation detail. It changes when a designer reshuffles a layout, when a framework upgrade re-renders the markup, when an A/B test swaps a component. Every time it changes, your "single source of truth" needs a human to update it. The POM does not remove the coupling. It centralizes it. That is helpful, but it is not free.

### The hidden line items on the POM bill

The maintenance tax is more than the obvious "selector broke" repair. It includes:

- **Onboarding cost.** A new SDET has to learn your page object conventions, your base classes, your fixture wiring, and your locator strategy before writing a single useful test.
- **The abstraction tax.** Page objects breed inheritance hierarchies, base pages, component objects, and helper utilities. The pattern that started clean becomes its own small framework that needs maintaining.
- **Drift.** Page objects rot. A method is left behind when a flow is removed. A selector points at an element that no longer exists. Nobody notices until a test fails for the wrong reason.
- **The "who owns this" problem.** Product changes the UI on Tuesday. The test breaks Wednesday. The fix lands Friday. For two days your pipeline is red for a reason that has nothing to do with a real bug.

None of this means the POM is bad engineering. It means the POM is the cost of doing locator-based automation well. If you could do automation *without* locators, most of this bill would simply disappear.

## Why "plain English" is now a real option, not a gimmick

For years, "just write your tests in English" was a sales slide, not a working tool. The natural-language layer would generate brittle selectors under the hood, and you ended up debugging machine-written XPath instead of your own. That era is over for a specific reason: capable models can now look at a rendered page, reason about what is on it, and decide where to click — the same way a human tester does.

This is the shift that lets you replace the page object model with plain English in a way that actually holds up. Instead of mapping "the checkout button" to `button.checkout-cta[data-v-7f3a]`, you write the sentence "click the checkout button," and an agent inspects the live page, finds the element a human would call the checkout button, and clicks it. There is no stored locator to break, because there is no stored locator at all.

[BrowserBash](https://browserbash.com/features) is a free, open-source CLI built on exactly this idea. You write a plain-English objective. An AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and returns a verdict plus structured results. The mental model is closer to handing a manual tester a written script than to writing code.

Here is the simplest possible example of the new shape:

```bash
browserbash run "Go to the demo store, log in as standard_user, add the first product to the cart, complete checkout, and confirm the page says 'Thank you for your order!'"
```

There is no `LoginPage`, no `CartPage`, no `CheckoutPage`. There is one sentence that reads like an acceptance criterion, because it basically is one.

## The honest comparison: POM vs objective-first tests

Let me lay this out plainly, because a fair comparison is more useful than a sales pitch. Both approaches have real strengths and real weak spots.

| Dimension | Page Object Model | Objective-first (plain English) |
|---|---|---|
| Selectors to maintain | One file per page, ongoing | None |
| Breaks when DOM changes | Yes, predictably | Usually self-heals; agent re-finds the element |
| Determinism / repeatability | High — same code, same path | Lower — agent may take a slightly different path |
| Speed per run | Fast (milliseconds per action) | Slower (model reasoning per step) |
| Readable by non-engineers | Method names, somewhat | Yes — it is English |
| Onboarding time | Days (learn the framework) | Minutes (write a sentence) |
| Best for | Large, stable regression suites | Churning UIs, new coverage, smoke tests |
| Cost model | Engineer time | Engineer time saved; compute/model time spent |
| Debuggability | Stack traces, line numbers | Verdict + step log + optional video |

Read that table honestly and you will see the trade is not "new thing wins." It is a trade. A mature 4,000-test regression suite that runs in eight minutes on every commit is a genuine asset, and you should not rewrite it as English prompts because a blog post told you to. Deterministic, fast, and cheap-per-run matters at that scale.

The objective-first approach wins decisively in a different band: UIs that change weekly, coverage you need *today*, tests a product manager should be able to read, and flows where the selector churn is the entire cost. That is where the POM tax is highest and where plain English pays for itself fastest.

## What replacing the POM actually looks like in practice

"Plain English" alone is not a test strategy. A one-off command in your terminal is a spike, not a suite. The reason teams could not commit to natural-language testing before is that there was nothing to *commit* — nothing to put in version control, review in a PR, or run in CI. BrowserBash closes that gap with Markdown tests.

A Markdown test is a committable `*_test.md` file where each list item is a step. It lives in your repo next to your code, goes through code review like anything else, and produces a human-readable `Result.md` after each run. This is the artifact that replaces your page object directory.

```markdown
# Checkout smoke test

- Go to {{baseUrl}}
- Log in as {{username}} with password {{password}}
- Add the first product on the catalog page to the cart
- Open the cart and proceed to checkout
- Fill shipping with a valid test address
- Place the order
- Confirm the page shows "Thank you for your order!"
```

Run it:

```bash
browserbash testmd run ./checkout_test.md
```

Notice what is and is not in that file. There are no selectors. There is no setup boilerplate. A product owner can read it, a new hire can read it, and an auditor can read it. The `{{variables}}` are templated, so the same file runs against staging, a preview deploy, or production by swapping values. Variables you mark as secret are masked to `*****` in every log line, so a password never leaks into your CI output or your `Result.md`.

### Composition replaces inheritance

The POM uses class inheritance and component objects to avoid repetition. Markdown tests use `@import`. You write the login flow once in `login_test.md`, then pull it into every test that needs an authenticated session:

```markdown
# Account settings test

- @import ./flows/login_test.md
- Go to the account settings page
- Change the display name to "QA Bot"
- Save and confirm a success message appears
```

This gives you the reuse benefit of the POM — define a flow once, use it everywhere — without a base class, a fixture, or a single line of selector code. When the login UI changes, you do not update a `LoginPage` class. You change nothing, because there is no stored locator to update. The agent re-finds the fields on the next run.

## The honest caveats, because credibility matters

If I only told you the upside, you would rightly stop trusting me. Here are the real limits.

**Non-determinism is a property, not a bug to ignore.** An agent reasons about the page each run, so it can take a slightly different path to the same goal. For most end-to-end flows this is fine — and arguably more resilient, since it adapts to small UI changes that would break a hardcoded selector. But it means you should not use objective-first tests for cases where you need to assert an exact DOM structure or pixel-precise behavior. Keep those in code.

**Model size matters a lot.** BrowserBash is Ollama-first: it defaults to free local models, needs no API keys, and nothing leaves your machine. That is excellent for privacy and cost. But very small local models — roughly 8B parameters and under — can get flaky on long, multi-step objectives. They lose the plot on step nine of a twelve-step checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If a complex objective is misbehaving, the first thing to try is a bigger brain, not a longer prompt.

**Speed and cost shift, not vanish.** A POM test runs in milliseconds per action because it is just executing code. An agent thinks between steps, so each run is slower and consumes model compute. On local models your model bill is genuinely $0, but wall-clock time is higher. For a 4,000-case regression run on every commit, that math may not favor plain English. For a 30-case smoke suite on the flows that change constantly, it favors it heavily.

**Debugging is different, not necessarily worse.** You do not get a Java stack trace pointing at line 214. You get a verdict, a structured step log, and — if you ask for it — a screenshot and a full `.webm` session video. The builtin engine additionally captures a Playwright trace you can open in the trace viewer. Add recording with a flag:

```bash
browserbash testmd run ./checkout_test.md --record --upload
```

The `--record` flag captures the screenshot and the session video on any engine. The optional `--upload` pushes the run to a free cloud dashboard with run history and per-run replay — strictly opt-in, and only after you run `browserbash connect`. If you would rather keep everything on your own machine, `browserbash dashboard` gives you a fully local dashboard instead.

## Fitting plain-English tests into CI without prose-parsing

A test format that cannot run unattended in a pipeline is a toy. The objection most senior engineers raise about natural-language tests is, fairly: "How does my CI know if it passed?" The answer is structured output, not screen-scraping a log.

BrowserBash has an agent mode designed for machines. Pass `--agent` and it emits NDJSON — one JSON event per line on stdout — so your pipeline reads structured events instead of parsing English prose. The exit codes are unambiguous: `0` passed, `1` failed, `2` error, `3` timeout. That is everything a CI gate needs.

```bash
browserbash testmd run ./checkout_test.md --agent --headless
```

Wire that into a GitHub Actions step, check the exit code, and you have a plain-English test that fails the build when the checkout flow breaks — with no selectors to maintain and no flaky parsing of human-readable output. The same NDJSON stream is what makes BrowserBash a clean fit for AI coding agents that generate, run, and read tests as part of a larger loop. If you are building an autonomous QA step into a coding agent, this is the seam it plugs into.

## Where the browser runs is a one-flag decision

One concern with abandoning the POM is losing the cross-environment flexibility your framework gave you. You do not lose it. BrowserBash separates *what* you are testing (the plain-English objective) from *where* the browser runs (the provider), and you switch providers with a single `--provider` flag.

By default the agent drives your local Chrome. When you need a grid — real device coverage, parallel browsers, a specific OS/browser matrix — you point the same Markdown test at a cloud provider without rewriting a thing:

```bash
browserbash testmd run ./checkout_test.md --provider lambdatest
```

The options are `local` (default, your Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. The test file does not change. This is the same portability promise a well-built POM gives you across environments, except the test itself stays selector-free regardless of where it runs. There are also two engines under the hood — `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin` (an in-repo Anthropic tool-use loop) — but you rarely need to think about them.

## A migration path that does not require a big-bang rewrite

You should not delete your POM suite this quarter. The smart migration is additive and risk-free, because the two systems run independently.

1. **Start with the flakiest flows.** Find the page objects that break most often — usually the ones tied to UIs your design team touches every sprint. Rewrite just those as Markdown tests. You will feel the maintenance relief immediately and risk nothing else.
2. **Add coverage you never had time to script.** There is always a backlog of "we should test that" flows nobody wrote because the selector work was not worth it. These are free wins. A plain-English file takes minutes.
3. **Use it for executable documentation.** A Markdown test doubles as a spec a product owner can read and approve. Pair it with your acceptance criteria so the test *is* the criterion.
4. **Keep the deterministic core in code.** Your stable, fast, high-volume regression suite stays exactly where it is. Plain English augments it; it does not have to replace all of it on day one.

This is the same advice I give about any tool that claims to replace a pattern: prove it on the painful 20% first, measure the time you got back, then decide how far to push it. There are deeper walkthroughs of this approach in the [BrowserBash learn hub](https://browserbash.com/learn) and on the [blog](https://browserbash.com/blog), and the GitHub repo at [github.com/PramodDutta/browserbash](https://github.com/PramodDutta/browserbash) has runnable examples.

## Who should replace the POM, and who should keep it

Let me be direct about fit, because the wrong tool in the wrong place is how teams lose trust in good ideas.

**Replace (or heavily augment) the POM if you:**

- Test UIs that change weekly and you are tired of selector churn.
- Need new coverage faster than you can write and maintain page objects.
- Want tests non-engineers can read, review, and approve.
- Are running smoke and critical-path checks rather than exhaustive regression.
- Care about privacy and want tests that run locally at $0 model cost.

**Keep the POM (and reach for it first) if you:**

- Own a large, stable regression suite that runs fast on every commit.
- Need strict, repeatable determinism and exact DOM assertions.
- Run thousands of cases where per-run model latency would blow your CI budget.
- Have a team already fluent in the pattern with low maintenance pain today.

If you live in the first list, the POM tax is real money you are paying every sprint, and an objective-first approach is the obvious move. If you live firmly in the second, keep your suite and use plain English only for the new, churny edges. Most teams are a blend, which is exactly why the migration is additive rather than a rewrite. You can see how teams have split the two in the [case studies](https://browserbash.com/case-study), and the [pricing page](https://browserbash.com/pricing) lays out what stays free.

## FAQ

### Can plain-English tests really replace the Page Object Model?

For a large share of end-to-end work, yes. An AI agent that reads the live page and clicks the right element removes the stored-locator layer the POM exists to manage, which eliminates most selector-maintenance work. The exception is a large, fast, deterministic regression suite where exact repeatability and per-run speed matter more than maintenance savings — keep that in code and use plain English for the churny edges.

### Do natural-language tests still break when the UI changes?

Far less often than page objects do. Because there is no hardcoded selector, an agent re-finds elements on each run and adapts to small layout or markup changes that would break a CSS or XPath locator. They are not magic, though: a major redesign that removes or renames a whole flow will still require you to update the plain-English steps to match the new reality.

### How do plain-English tests run in CI if there is no code?

You run them with `--agent`, which emits NDJSON — one structured JSON event per line — instead of human prose, and the process returns clear exit codes (0 passed, 1 failed, 2 error, 3 timeout). Your pipeline reads the exit code or parses the event stream to gate the build, exactly as it would for a code-based suite. No screen-scraping of log text is involved.

### Is the page object model dead in 2026?

No, and anyone who tells you it is dead is selling something. The POM is still the right pattern for large, stable, high-volume regression suites that need strict determinism and speed. What has changed is that you no longer need it for *everything* — objective-first tests are a better fit for fast-moving UIs, new coverage, and readable smoke tests, so the POM's territory has shrunk rather than vanished.

Ready to see how few selectors you actually need? Install the CLI with `npm install -g browserbash-cli`, point it at a flow that keeps breaking, and write the test as a sentence. An account is optional — everything runs locally first — but if you want run history and replays you can grab a free one at [browserbash.com/sign-up](https://browserbash.com/sign-up).
