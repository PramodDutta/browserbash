---
title: "AI Test Case Generation: From User Story to Running Test"
description: "A practical guide to AI test case generation: turn user stories into test cases with LLMs, compare testRigor and Testsigma, and run them in real Chrome."
date: 2026-02-07
category: llm
---

AI test case generation is the part of the workflow that finally feels like magic and then quietly breaks your heart. You paste a Jira story, an LLM hands back twelve neatly numbered test cases in seconds, and for a moment it looks like the whole QA backlog just evaporated. Then you try to actually run one of them and discover the gap nobody warns you about: generating a test case and executing a test case are two completely different problems. This guide walks the full path — from a one-line user story to a verdict in a real browser — and is honest about where the AI helps, where it bluffs, and where you still need a human or a runner to close the loop.

I have spent enough time with generative testing tools to have opinions, and the most useful one is this: the value of AI test case generation is not the prose it produces. It is how cheaply that prose turns into something a machine can run and re-run. So I will spend the first half on how large language models turn requirements into test cases — and contrast how testRigor and Testsigma approach it — and the second half on the execution layer, where [BrowserBash](https://browserbash.com/features) comes in: you take those generated plain-English steps, drop them in a committable `*_test.md` file, and run them against real Chrome with no selectors and no page objects.

## What "AI test case generation" actually means

The phrase gets stretched to cover several distinct things, and you will save yourself confusion by separating them up front:

- **Test idea generation.** Given a feature, the model brainstorms scenarios: happy path, boundary values, negative inputs, permission edge cases. This is where LLMs shine, because it is fundamentally a creativity-and-recall task.
- **Test case authoring.** The model writes structured cases — preconditions, steps, expected results — in a format a human or tool can read. Still mostly a language task.
- **Test script generation.** The model emits runnable code (Playwright, Selenium, Cypress) or tool-specific steps that can be executed. This is where hallucinated selectors and wishful assertions start to bite.
- **Test execution.** Something drives the browser, observes the result, and returns pass or fail. No language model "does" this by talking; it needs an agent wired to a real browser.

When a vendor says "AI test case generation," they usually mean the first three. The fourth — turning a generated case into a green or red verdict — is the one teams underestimate, and it is exactly where most of the wasted effort lives. A model can confidently write `click the "Checkout" button` whether or not such a button exists. Only execution tells you the truth.

### Why LLMs are good at the requirements-to-cases step

Reading a user story and enumerating what could go wrong is pattern-matching over an enormous corpus of bug reports, test plans, and spec discussions. That is squarely in an LLM's wheelhouse. Hand a capable model an acceptance criterion like "users can reset their password via emailed link" and it will reliably surface the expired-token case, the already-used-link case, the wrong-email case, and the password-policy-rejection case. A junior tester might miss two of those on a tired afternoon. The model does not get tired.

The weakness is the inverse: the model has no idea what your app actually looks like. It does not know your reset link is a magic code, not a URL, or that your policy quietly allows passwords that match the username. Generated cases are a strong first draft of *intent*, never a verified description of *behavior*. Keep that line bright in your head and the rest of this gets much easier.

## From user story to test case: the LLM pipeline

Here is the pipeline I actually use, broken into the stages where each tool — generic LLM, testRigor, Testsigma, BrowserBash — plays a different role.

**1. Start with a real story, not a sanitized one.** Feed the model the messy original: the ticket title, the acceptance criteria, and any inline comments from the PM. The richer the input, the fewer generic "verify the page loads" cases you get back.

**2. Ask for cases in a structured, neutral format.** Request a table or a numbered list with explicit preconditions, steps, and expected results. Neutral structure matters because you will hand these steps to an executor later, and plain imperative steps ("Click Sign in", "Enter the email", "Verify the dashboard shows the user's name") port cleanly between tools.

**3. Prune ruthlessly.** The model over-generates. For a login form it will happily propose fifteen cases, of which six are genuinely worth automating and the rest are duplicates or theoretical. A human read here costs five minutes and saves an hour of running junk.

**4. Make the survivors executable.** This is the handoff. testRigor and Testsigma keep the steps inside their own platforms; BrowserBash lets you paste them into a Markdown file and run them locally against your own Chrome. More on that split below.

**5. Run, observe, and feed failures back.** The first run is where intent meets reality. Steps that referenced a button that does not exist fail loudly, and you correct the case — usually a one-word edit — until it passes against the real app.

### A worked example

Take this story: *"As a returning shopper, I can log in, add a product to my cart, and complete checkout, and I should see a confirmation."* A good prompt produces something like this generated case:

1. Go to the store and open the login page.
2. Sign in with a valid account.
3. Search for "wireless mouse" and open the first result.
4. Add the item to the cart.
5. Proceed to checkout and complete the order.
6. Verify the page shows "Thank you for your order!"

Notice that every line is a plain-English instruction with an observable outcome on the last line. That is the format that travels. You can read it to a stakeholder, and — critically — you can hand it to an agent that drives a browser without rewriting it into selectors. That property is the whole reason this article exists.

## How testRigor approaches generation

testRigor is a mature, commercial, cloud-hosted platform built around plain-English test authoring. Its core idea is that you describe tests in readable English commands — `click "Cart"`, `check that page contains "Order confirmed"` — and the platform resolves those to actions against the UI, leaning on AI to keep them stable as the app changes. Over time it has added generative features that take a description of a feature and produce candidate test steps in that same English syntax.

What testRigor does genuinely well is the *whole lifecycle* inside one product: generation, execution on managed infrastructure, scheduling, reporting, and a serious push on stability so suites do not rot the moment a class name changes. It covers web, mobile, and desktop, which is broader than most of the tools in this space. If you are an enterprise QA org that wants generation and execution welded together with support and governance, testRigor is a credible, well-trodden choice, and I am not going to pretend otherwise.

The trade-offs are the usual ones for a commercial SaaS platform. It is seat-priced and cloud-bound (exact current pricing is not something I will quote — check their site, as plans change), which scales awkwardly if you want PMs and manual testers all authoring, and it is a poor fit when your page content cannot leave your own infrastructure for compliance reasons. The English-like syntax is also still a proprietary DSL: powerful, but you are authoring inside testRigor's grammar and platform, not in a plain file you fully own.

## How Testsigma approaches generation

Testsigma is the closest like-for-like to testRigor in spirit: a low-code, cloud-native platform built around natural-language test steps with AI-assisted authoring, healing, and maintenance, spanning web, mobile, and API testing in one place. You write steps in readable English, it maps them to actions, and AI suggests and repairs cases as the app drifts. Testsigma also has an open-source community edition, which is a real differentiator if self-hosting matters to you, though the fuller feature set tends to live in the paid cloud tiers.

For AI test case generation specifically, Testsigma's pitch is similar to testRigor's: describe the scenario, get steps, refine, run on managed grids, and get test-management-grade reporting that QA leads expect. If your reason for evaluating these tools is "I want the plain-English authoring model but want to compare vendors and maybe self-host the community edition," Testsigma belongs on the shortlist right next to testRigor.

The honest read is that testRigor and Testsigma are *more alike than different* on generation. Both keep the generated steps inside their platform, both bet on AI healing for stability, both are cloud-first commercial products with broad coverage. Your choice between them comes down to pricing fit, the exact authoring ergonomics, and whether the community edition matters. Neither is trying to be a free, local, file-based CLI — which is precisely the gap the next section is about.

## Where BrowserBash fits: the executable layer

[BrowserBash](https://github.com/PramodDutta/browserbash) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. It is deliberately *not* a generation platform — it does not try to brainstorm your test cases. It owns the step everyone underestimates: taking plain-English steps and actually running them against a real Chrome/Chromium browser, step by step, with an AI agent driving and returning a verdict plus structured results. No selectors. No page objects.

That focus is exactly what makes it a clean partner to a generation step. You can use any LLM — or testRigor, or Testsigma — to produce candidate steps, then keep the survivors in a committable file and execute them locally. The generated plain English does not need translation; BrowserBash reads imperative instructions and an observable expectation and goes.

### The Ollama-first model story

The detail that changes the economics: BrowserBash is **Ollama-first**. It defaults to free local models, so there are no API keys to manage and nothing leaves your machine. It auto-resolves in order — local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` — so on a laptop with Ollama running you get a guaranteed $0 model bill. If you need more horsepower it supports OpenRouter (including genuinely free hosted models such as `openai/gpt-oss-120b:free`) and Anthropic Claude with your own key.

An honest caveat, because it matters for generated multi-step flows: very small local models (roughly 8B and under) get flaky on long objectives. They lose the thread on step seven of a checkout. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. Generated test cases tend to be multi-step by nature, so size your model to the flow, not the other way around.

### Markdown tests: where generated steps go to live

The bridge between generation and execution is the `*_test.md` file. Each list item is a step, the file is committable alongside your code, and it supports `@import` composition and `{{variables}}` templating. Secret-marked variables are masked as `*****` in every log line, so a generated login case with credentials does not leak them into your CI logs. After each run BrowserBash writes a human-readable `Result.md`.

Here is the worked example from earlier, dropped straight into a test file with almost no editing:

```bash
# checkout_test.md
# Log in to the store, add an item, and complete checkout

- Go to {{store_url}} and open the login page
- Sign in with email {{email}} and password {{password}}
- Search for "wireless mouse" and open the first result
- Add the item to the cart
- Proceed to checkout and complete the order
- Verify the page shows "Thank you for your order!"
```

And you run it like this:

```bash
npm install -g browserbash-cli
browserbash testmd run ./checkout_test.md \
  --var store_url=https://shop.example.com \
  --var email=buyer@example.com \
  --secret password=hunter2
```

The generated case became a runnable, version-controlled artifact in about the time it took to copy and paste. That is the loop this whole article is building toward — and there is a fuller walkthrough on the [BrowserBash learn pages](https://browserbash.com/learn) if you want to go deeper.

## Generation vs execution: a side-by-side

To make the division of labor concrete, here is how the tools line up on the axes that actually matter when you are turning a story into a running test. I am only stating what is publicly known; where a vendor detail is not public I say so rather than invent it.

| Capability | Generic LLM (ChatGPT/Claude) | testRigor | Testsigma | BrowserBash |
| --- | --- | --- | --- | --- |
| Brainstorm test ideas from a story | Excellent | Built-in generation | Built-in generation | Not its job |
| Authoring format | Free text you copy out | Proprietary English DSL | Proprietary English steps | Plain-English `*_test.md` you own |
| Executes against a real browser | No | Yes, managed cloud | Yes, managed cloud | Yes, your local Chrome (and remote providers) |
| Runs fully offline / no API keys | No | No | No | Yes, Ollama-first local models |
| Pricing shape | Per-token | Commercial, seat-priced | Commercial cloud + OSS community edition | Free, open-source (Apache-2.0) |
| Machine-readable CI output | No | Platform reports | Platform reports | NDJSON via `--agent`, stable exit codes |
| Artifacts | None | Cloud reports/video | Cloud reports/video | Screenshot, `.webm` video, trace, `Result.md` |

The pattern is clear: the generation step and the execution step are different products with different strengths. testRigor and Testsigma bundle both inside a commercial cloud; BrowserBash unbundles execution into a free, local, file-based tool you can point at output from *any* generator.

## Running generated cases in CI

A generated test case that only runs on your laptop is a curiosity. The point is to wire it into a pipeline so it gates merges. BrowserBash was built for this: `--agent` emits NDJSON — one JSON event per line on stdout — so an AI coding agent or a CI job can branch on structured events instead of scraping prose. The exit codes are stable and meaningful: `0` passed, `1` failed, `2` error, `3` timeout.

```bash
browserbash run "log in, add a wireless mouse to the cart, \
  complete checkout, and verify 'Thank you for your order!'" \
  --agent --headless --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg on any engine; the builtin engine additionally captures a Playwright trace you can open in the trace viewer. When a generated case fails in CI at 2 a.m., a video and a trace are the difference between a five-minute diagnosis and an hour of guessing. Pair that with the masked-secret handling and your generated login flows run in CI without dribbling credentials into the logs.

If you want run history, per-run replay, and video recordings centralized for the team, there is an optional free cloud dashboard that is strictly opt-in via `browserbash connect` and `--upload` (free uploaded runs are kept 15 days). Prefer to keep everything on your machine? There is also a fully local dashboard via `browserbash dashboard`. No account is required to run anything — the dashboards are conveniences, not gates.

### Choosing the engine and where the browser runs

BrowserBash ships two engines: `stagehand` (the default, MIT-licensed, by Browserbase) and `builtin` (an in-repo Anthropic tool-use loop). And it separates *which engine drives* from *where the browser runs*, switched with a single `--provider` flag: `local` (the default, your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, and `browserstack`. So you can author and debug a generated case locally against your Chrome, then fan the same file out across a cloud grid for cross-browser coverage:

```bash
browserbash testmd run ./checkout_test.md --provider lambdatest --record --upload
```

Same generated steps, same file, different execution surface. Nothing about the test case changes.

## When to choose which tool

Be honest about your constraints and the choice gets easy.

**Choose testRigor or Testsigma when** you want generation and execution welded into one commercial platform with support, governance, scheduling, and broad web/mobile/desktop coverage — and seat-priced cloud SaaS fits your budget and compliance posture. If a vendor managing the whole lifecycle for you is worth real money, these are the better fit, full stop. testRigor leans enterprise-broad; Testsigma's community edition is the lever to pull if self-hosting is a hard requirement. For more on the tradeoffs, the [BrowserBash case study](https://browserbash.com/case-study) covers a real migration.

**Choose a generic LLM for the generation step when** you just need test *ideas* and structured cases and you already have an executor. ChatGPT or Claude will out-brainstorm any platform's built-in generator and cost you nothing but tokens. Just do not trust the steps until something has run them.

**Choose BrowserBash for the execution layer when** you want the generated steps to live in plain, committable files you own; when you need a guaranteed $0 model bill on local models or a hard "nothing leaves my machine" guarantee; when you want NDJSON and clean exit codes for CI; or when you simply do not want to pay per seat to run a test. It is the strongest fit as the *executable layer under* a generation step, whatever produced that step. Pricing details — there basically aren't any — are on the [pricing page](https://browserbash.com/pricing).

The combination most teams land on is pragmatic: an LLM (or your existing platform) to generate, a human to prune, and BrowserBash to run the survivors locally and in CI for free.

## A realistic workflow, end to end

Putting it together, here is the loop I would run on a Monday with a fresh batch of stories:

1. Paste each story into a capable LLM and ask for cases in a neutral numbered format with explicit expected results.
2. Prune to the cases that are worth automating — usually a third of what came back.
3. Drop the survivors into `*_test.md` files, parameterizing data with `{{variables}}` and marking credentials as secrets.
4. Run them locally with `browserbash testmd run` against your own Chrome on a mid-size local model to keep the bill at zero.
5. Fix the cases that fail because they assumed UI that does not exist — usually trivial edits.
6. Commit the passing files and wire them into CI with `--agent --headless --record`, branching on exit codes.
7. Optionally `--upload` runs to the free dashboard so the team can replay failures.

Every step that involves *language* is where the LLM earns its keep. Every step that involves *truth* is where execution earns its keep. Keeping those separated — and using a free, local tool for the truth half — is what turns AI test case generation from a demo into a habit. You can browse more end-to-end patterns on the [BrowserBash blog](https://browserbash.com/blog).

## FAQ

### Can AI really generate test cases from a user story?

Yes, and it does it well for the brainstorming and authoring stages. A capable LLM reads a user story and reliably enumerates happy-path, boundary, and negative scenarios, then writes them as structured cases with steps and expected results. The catch is that it generates against assumed behavior, not your actual app, so the cases are a strong first draft that still needs a human to prune and a real run to validate.

### What is the difference between AI test case generation and AI test execution?

Generation is a language task: turning requirements into readable test cases. Execution is an action task: driving a real browser, observing the result, and returning pass or fail. Tools like testRigor and Testsigma bundle both in a commercial cloud, while BrowserBash focuses on the execution layer by running plain-English steps against your own Chrome for free. You usually want a generator for the first half and an executor for the second.

### Do I need API keys or a paid plan to run generated test cases in BrowserBash?

No. BrowserBash is Ollama-first, so it defaults to free local models with no API keys and nothing leaving your machine, giving you a guaranteed $0 model bill. If you want more capable models it can use OpenRouter free hosted models or your own Anthropic key, but that is optional. No account is needed to run tests; the cloud dashboard is strictly opt-in.

### How do I turn generated plain-English steps into a runnable test?

Put each step as a list item in a committable `*_test.md` file, use `{{variables}}` for data and secret-marked variables for credentials, then run it with `browserbash testmd run ./yourfile_test.md`. An AI agent drives a real Chrome browser through the steps, returns a verdict, and writes a human-readable `Result.md`. The generated plain English ports in with little or no editing because BrowserBash reads imperative steps directly.

Generation gives you the draft; execution gives you the truth. The cheapest way to close that gap is to keep your test cases in plain files you own and run them against a real browser for free. Install with `npm install -g browserbash-cli`, point it at your generated steps, and watch a user story become a running test. An account is entirely optional — but if you want centralized run history and replay, you can [sign up here](https://browserbash.com/sign-up).
