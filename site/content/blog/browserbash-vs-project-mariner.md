---
title: Google Project Mariner vs BrowserBash for Web Tasks
description: "A Google Project Mariner alternative for real web tasks: how BrowserBash's open-source CLI compares to Google's research agent for CI testing."
date: 2026-06-04
category: agents
---

If you have been searching for a Google Project Mariner alternative because you want to actually ship something this quarter, you have probably hit the same wall I did: Mariner is a fascinating research preview, but it is not a tool you can drop into a CI pipeline and trust to gate a deploy. Mariner is Google DeepMind's experimental web-browsing agent. BrowserBash is a free, open-source command-line tool that drives a real browser from a plain-English objective and returns a machine-readable verdict. They overlap in idea and diverge sharply in purpose, and this article is about exactly where that line falls.

The honest framing up front: these two things are not competing for the same slot, even though search engines keep putting them on the same results page. One is a glimpse of where general-purpose web agents are heading. The other is a tool you can `npm install` today and wire into GitHub Actions before lunch. If you are evaluating a Google Project Mariner alternative for repeatable web tasks, testing, or agent-driven QA, the comparison that matters is "research demo versus shippable CLI," and I will keep it grounded in what is publicly known about each.

## What Google Project Mariner actually is

Project Mariner is a research prototype from Google DeepMind, first shown in December 2024, built on the Gemini model family. It is an agent that operates inside the browser to complete web tasks on your behalf — reading a page, clicking, typing, navigating across sites, and chaining steps toward a goal you describe in natural language. Early demonstrations ran as a Chrome extension that took actions in your active tab, and Google has since folded Mariner-style capabilities into broader "agentic" efforts and made access available to a limited set of users, including some Google AI Ultra subscribers, as the program has evolved through 2025.

A few things are worth stating plainly, because the rest of this comparison depends on them:

- **It is positioned as research, not a stable product API.** Google has described Mariner as an early research prototype and gated access tightly. That is the right call for them — but it means you cannot build a dependable pipeline on a contract that may shift.
- **Many specifics are not publicly documented.** Exact pricing, rate limits, an official CLI, programmatic agent output formats, exit-code semantics, self-hosting options — as of 2026, these are not publicly specified in the way you would need to integrate against them. I am not going to invent them. Where Mariner's behavior is unknown, I will say so.
- **The target user is broad.** Mariner is aimed at general consumer and knowledge-work tasks — "find this, compare that, fill this out" — more than at the narrow, repeatable, pass/fail world of automated testing.

That last point is the crux. Mariner is built to do an open-ended task once, impressively. A testing tool is built to do a defined task a thousand times, identically, and tell a script whether it passed. Those are different machines even when they share a steering wheel.

## What BrowserBash actually is

[BrowserBash](https://browserbash.com/learn) is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it with `npm install -g browserbash-cli`, you write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects, no recorded scripts. It reads the page the way a person would, takes actions, and returns a verdict plus structured results. The current release is 1.3.1.

The part that makes it a genuine Google Project Mariner alternative for engineers, rather than a toy, is the surrounding machinery:

- **It runs locally and account-free.** No login, no key to paste, no provisioning. Clone a repo, install, run.
- **It is Ollama-first.** By default it prefers a free local model on your own hardware — no API keys, nothing leaving your machine. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so you can also bring a hosted model when you want one.
- **It is built for automation, not just for humans watching.** Agent mode emits NDJSON, one JSON event per line, with stable exit codes. That is the difference between "a cool demo" and "a CI gate."

So the surface idea — describe a web task in English, let an agent do it in a real browser — is shared with Mariner. Everything underneath is oriented toward the unglamorous reality of running web tasks in a pipeline, on a schedule, with artifacts and a pass/fail you can act on.

## The honest overlap, and where it ends

It would be dishonest to pretend these tools share nothing. They share the most important conceptual leap of the last few years: you no longer have to encode every click as a brittle CSS or XPath selector. Both Mariner and BrowserBash let you state intent and let a model figure out the mechanics. If you have spent years patching tests that broke because a `div` moved, that shared idea is the headline.

The overlap ends at intent. Mariner's intent is to be a capable, general assistant that browses for you. BrowserBash's intent is to be a deterministic-enough, scriptable verification tool that fits into engineering workflows. Read that sentence twice, because every concrete difference below flows from it — the licensing, the output format, the cost model, the artifacts, the self-hosting story. None of those are accidents. They are what you build when "shippable in CI today" is the requirement instead of "show the future of agents."

## Side-by-side: research agent vs CI-ready CLI

Here is the comparison at a glance. Where a Mariner detail is not publicly documented, the cell says so rather than guessing.

| Dimension | Google Project Mariner | BrowserBash |
|---|---|---|
| What it is | Research prototype / experimental web agent | Shippable open-source CLI |
| Availability | Gated/limited access, evolving through 2025–2026 | Public on npm, install today |
| License | Proprietary (Google) | Apache-2.0, open source |
| Account required | Yes (Google access, gated) | No — runs account-free |
| Where the browser runs | Google-managed / your active tab (as demoed) | Local Chrome by default; CDP, Browserbase, LambdaTest, BrowserStack via one flag |
| Model | Gemini family | Ollama-first local; OpenRouter; Anthropic Claude (BYO key) |
| Model cost control | Not publicly specified as a self-managed dial | You hold the lever; $0 on local models |
| Data residency | Runs through Google's stack | Can stay fully on your machine |
| Programmatic output | No public NDJSON/agent contract documented | NDJSON in `--agent` mode |
| Exit codes for CI | Not publicly specified | 0 pass, 1 fail, 2 error, 3 timeout |
| Committable tests | Not publicly specified | `*_test.md` with `@import` + `{{variables}}` |
| Recordings/artifacts | Not publicly specified | Screenshot, `.webm` video, Playwright trace (builtin engine) |
| Self-host / air-gap | Not available | Yes — local models, local dashboard |

Read that table as a map of *purpose*, not a scoreboard. Several Mariner cells say "not publicly specified" because Google has not published that surface — which is exactly what you would expect from a research preview and exactly why it is hard to build on.

## The CI question is the whole question

If you take one thing from this comparison, take this: a testing tool lives or dies by whether a script can read its result without parsing prose. This is where BrowserBash is in a different category from a research agent.

Run BrowserBash with `--agent` and it emits NDJSON on stdout — one JSON event per line — so a parent program (your CI runner, or an AI coding agent orchestrating tests) consumes events directly, no regex over English. The exit codes are stable and boring in the best way: `0` passed, `1` failed, `2` error, `3` timeout. That is the entire contract a CI gate needs.

```bash
# Headless, machine-readable run in CI — branch on the exit code
browserbash run "log in, add the blue hoodie to the cart, \
  complete checkout, and verify the page shows 'Thank you for your order!'" \
  --agent --headless

echo "exit code: $?"   # 0 pass / 1 fail / 2 error / 3 timeout
```

A research agent like Mariner is built for a human in the loop watching it work, or for an assistant surface inside Google's products. As of 2026 there is no publicly documented agent-output contract or exit-code semantics you could gate a build on. That is not a knock on Mariner — it is simply not what it was built for. But it does mean that if your actual job is "fail the PR when checkout breaks," Mariner does not give you the hook and BrowserBash does. You can read more about how agents consume that stream on the [BrowserBash features page](https://browserbash.com/features).

### Committable tests that live in your repo

CI integration is more than an exit code. BrowserBash lets you commit `*_test.md` files where each list item is a step, compose shared flows with `@import`, and parameterize with `{{variables}}`. Secret-marked variables are masked as `*****` in every log line, so a password never lands in your CI logs. After each run it writes a human-readable `Result.md` you can attach to a build.

```bash
# checkout_test.md, version-controlled alongside your code
browserbash testmd run ./checkout_test.md \
  --var BASE_URL=https://staging.shop.example \
  --secret PASSWORD=$STAGING_PW
```

That workflow — tests as reviewable, diffable files next to the code they cover — is table stakes for a testing tool and is simply not part of a general web-agent research preview's remit.

## Models, cost, and data residency

This is where the philosophical gap becomes a budget line. BrowserBash is Ollama-first: the default brain is a free local model on your own hardware. No API keys, no per-token meter, no page content leaving your machine. It auto-resolves a local Ollama install first, then falls back to `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. You can also point it at OpenRouter — including genuinely free hosted models such as `openai/gpt-oss-120b:free` — or bring your own Anthropic Claude key for the hard flows.

The consequences are concrete:

- **You can guarantee a $0 model bill** by staying on local models. For a high-volume suite that runs on every PR, that is the difference between a free pipeline and a metered one.
- **Prompts and page content can stay entirely on your machine.** For a regulated app, a privacy-sensitive client, or an air-gapped runner, that is not a nice-to-have; it is the requirement.

Mariner runs on the Gemini family through Google's stack. Pricing and any self-managed model controls are not publicly specified in a way you could plan a budget against, and by design your task runs through Google's infrastructure rather than on hardware you control. If centralized, Google-managed inference is fine for your use case, that is a perfectly reasonable trade — you get a frontier model with zero GPU ops on your side. If data residency or a predictable $0 floor matters, the local-first design is the one that fits.

One honest caveat on the BrowserBash side, because the cheap path has a catch: very small local models (roughly 8B parameters and under) can be flaky on long, multi-step objectives. The free route is real, but the sweet spot is a mid-size local model — Qwen3 or a Llama 3.3 70B-class model — or a capable hosted model when a flow is genuinely hard. The lever is yours; you just have to pull it with judgment. A frontier hosted model like Gemini (the kind powering Mariner) will, all else equal, handle a gnarly multi-page flow more reliably than a tiny local one. That is the real trade behind "free."

## Where the browser runs, and recordings

BrowserBash runs your local Chrome by default, but the provider is one flag away. `--provider cdp` attaches to any DevTools endpoint; `--provider browserbase`, `--provider lambdatest`, and `--provider browserstack` push the run onto a cloud grid when you need scale or a browser matrix you do not have locally. The agent logic does not change — only where the pixels live.

```bash
# Same objective, run on a LambdaTest cloud browser, with a video recording
browserbash run "search for 'noise-cancelling headphones', open the first result, \
  and confirm the product page loads with a price" \
  --provider lambdatest --record --upload
```

On artifacts, BrowserBash captures a screenshot and a full `.webm` session video (via ffmpeg) on any engine when you pass `--record`. Its two engines are `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin` (an in-repo Anthropic tool-use loop); the builtin engine additionally records a Playwright trace you can open in the trace viewer to step through exactly what the agent saw and did. That trace is gold when a flaky run needs a post-mortem.

Mariner's recording, replay, and artifact story is not publicly specified in the detail you would need to integrate against, so I will not characterize it. The relevant point for a testing workflow is that BrowserBash treats artifacts as first-class CI outputs — things you attach to a build, replay in a dashboard, and hand to a developer — rather than as a UI nicety.

### The optional dashboards

There are two dashboards, both free, both optional. `browserbash dashboard` is fully local: run history and replay with no cloud at all. The cloud dashboard is strictly opt-in — you only touch it if you run `browserbash connect` and pass `--upload` on a run, which gets you run history, video recordings, and per-run replay; free uploaded runs are kept 15 days. Nothing uploads unless you ask. You can compare the tiers on the [pricing page](https://browserbash.com/pricing).

## When to choose Project Mariner

I told you this comparison would sometimes favor the other side, so here it is, plainly. Choose Mariner — or wait for its broader release — when:

- **You want a general-purpose assistant**, not a test runner. If the job is "go research five vendors, fill out three forms, and summarize," that open-ended, do-it-once-impressively work is exactly Mariner's lane.
- **You are comfortable inside Google's ecosystem** and want frontier Gemini reasoning with no model ops on your end.
- **You are exploring where web agents are heading.** As a research preview, Mariner is a genuinely valuable lens on the near future. If your goal is to learn and experiment rather than to gate a deploy, it is worth your time.
- **Determinism and CI hooks are not requirements.** If no script needs to read the result, the lack of a documented NDJSON contract and exit codes does not cost you anything.

A research prototype from one of the strongest AI labs in the world is not a thing to dismiss. It is just not a thing to put on the critical path of your release pipeline yet.

## When to choose BrowserBash

Choose BrowserBash when the work is repeatable and the result has to be actionable:

- **You need CI gating today.** NDJSON plus `0/1/2/3` exit codes means a pipeline can pass or fail a build on a real browser flow this afternoon. See the [agent NDJSON walkthrough](https://browserbash.com/blog) for the wiring.
- **Cost or data residency is a constraint.** Local Ollama models give you a $0 floor and keep page content on your machine — useful for high-volume suites and regulated apps alike.
- **You want tests in version control.** Committable `*_test.md` files with `@import` and `{{variables}}`, masked secrets, and a `Result.md` per run fit how engineering teams already work.
- **You need artifacts for debugging.** Screenshots, `.webm` videos, and a Playwright trace turn a red build into a five-minute diagnosis instead of a guessing game.
- **You want zero lock-in.** Apache-2.0, no account, runs on your hardware, swap models and providers with a flag.

In short, if your sentence ends in "...and fail the build when it breaks," BrowserBash is the tool that has the hook. Teams that have made this switch describe the wins on the [case study page](https://browserbash.com/case-study).

## A realistic migration path

You do not have to pick a side philosophically. A pragmatic team can use both: experiment with Mariner (or any frontier agent) to understand what general web agents can do, and use BrowserBash to lock the flows you care about into a pipeline that runs on every commit.

The path looks like this. Start by installing BrowserBash and running one objective interactively against a staging environment — no account, no config — to confirm the agent can complete your flow at all. Pick the model deliberately: try a mid-size local model first, and only reach for a hosted model if the flow is long or fiddly. Once a flow passes reliably, freeze it into a `*_test.md` file, parameterize the URL and credentials with `{{variables}}` and a masked secret, and commit it. Then add the `--agent --headless` invocation to CI and branch on the exit code. Turn on `--record` so every failure ships a video. If you need a browser matrix you do not have locally, flip `--provider` to a cloud grid for those jobs. That is the whole loop, and none of it depends on access to a gated research preview.

The deeper point: a research agent answers "what is possible?" A CI-ready CLI answers "what can I depend on?" You want both questions answered, but only one of them belongs in your deploy gate. You can start the dependable half from the [sign-up page](https://browserbash.com/sign-up) — though, to be clear, an account is optional and the CLI runs without one.

## FAQ

### Is there a free Google Project Mariner alternative for automated testing?

Yes. BrowserBash is a free, open-source (Apache-2.0) CLI that drives a real browser from a plain-English objective, and it is built for testing rather than open-ended assistance. It is Ollama-first, so you can run it at zero model cost on local models, and it emits NDJSON with stable exit codes so CI can gate on the result. Install it with `npm install -g browserbash-cli` and it runs with no account.

### Can I use Project Mariner in a CI/CD pipeline?

As of 2026, Project Mariner is a gated research prototype, and Google has not publicly documented an agent-output format, exit-code semantics, or a stable API you could integrate into a CI/CD pipeline. That makes it hard to gate a build on its results today. If CI gating is your goal, a tool with a documented NDJSON contract and `0/1/2/3` exit codes, like BrowserBash, is a better fit for the pipeline itself.

### Does BrowserBash send my data to the cloud like a hosted agent?

No, not by default. BrowserBash is Ollama-first, so it can run entirely on local models with nothing leaving your machine, and it works with no account. There is an optional cloud dashboard, but it is strictly opt-in — data only uploads if you run `browserbash connect` and pass `--upload`. There is also a fully local dashboard if you want run history and replay with no cloud at all.

### Which is better for general web tasks versus testing?

It depends on the job. For open-ended, general web tasks done once — research, form-filling, comparing options across sites — a general-purpose research agent like Mariner is squarely aimed at that work. For repeatable, pass/fail web tasks that need to run in CI with artifacts and an actionable verdict, BrowserBash is the better fit because it was designed for that exact loop. Many teams use a frontier agent to explore and BrowserBash to lock flows into their pipeline.

Ready to put a real browser flow under test today? Install with `npm install -g browserbash-cli`, write your first plain-English objective, and wire the exit code into CI. When you want run history and video replay, create a free account at [browserbash.com/sign-up](https://browserbash.com/sign-up) — though the CLI runs perfectly well without one.
