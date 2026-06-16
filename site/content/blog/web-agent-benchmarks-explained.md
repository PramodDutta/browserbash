---
title: Web Agent Benchmarks Explained: WebVoyager and Beyond
description: "Web agent benchmarks explained: how WebVoyager scores browser agents, what browser-use and Agent-E report, and how BrowserBash turns the same approach into committable tests."
date: 2026-04-15
category: agents
---

If you have spent any time evaluating AI that drives a browser, you have run into web agent benchmarks. They are the leaderboards everyone cites when they claim an agent can "book a flight" or "complete a checkout" on its own. WebVoyager is the most famous of them, but it sits inside a whole family of evaluations that try to answer one deceptively simple question: given a plain-English goal and a real website, how often does the agent actually finish the task? This article walks through how those benchmarks work, what browser-use and Agent-E report against them, where the numbers mislead, and how BrowserBash takes the same agent-driven idea and pins it down into deterministic, committable test files you can run in CI.

A sourcing note up front, because benchmark articles attract fabricated stats. I won't quote a success-rate percentage for any tool unless it is genuinely published and stable — these numbers move fast, depend heavily on the model, and are easy to misreport. Where a figure is not publicly specified, I will say so and move on. Every BrowserBash claim maps to a real command you can run today.

## What a web agent benchmark actually measures

A web agent benchmark is a fixed set of tasks, each phrased as a natural-language objective, paired with a way to decide whether the agent succeeded. The agent gets a goal like "Find the cheapest direct flight from London to Tokyo next Friday and report the price," drives a browser through whatever steps it thinks are needed, and the benchmark records a verdict: success or failure.

That sounds trivial until you build one. Three hard problems sit under every serious benchmark:

1. **Task definition.** The objective has to be unambiguous enough to grade but open-ended enough to require real navigation. "Click the third link" is not an agent task. "Find the GitHub repo with the most stars for a Rust web framework" is.
2. **The environment.** Live internet, where prices and inventory change daily, or a frozen snapshot that never drifts? Live sites are realistic but non-reproducible. Snapshots are reproducible but go stale.
3. **Evaluation.** How do you know the agent succeeded? Some benchmarks check the final answer string, some check a specific DOM state, and increasingly a second model judges the trajectory and decides if the goal was met.

Every benchmark is a different set of trade-offs across those three axes. WebVoyager's choices turned out to be influential, so it is the right place to start.

## WebVoyager: the benchmark everyone cites

WebVoyager is an evaluation for end-to-end web agents introduced in academic work in 2024. Its design goal was to test agents on **real, live websites** rather than simplified sandboxes, because earlier benchmarks often ran against toy environments that did not capture how messy production sites actually are.

A few things define WebVoyager and explain why it became the reference point:

- **Live, popular sites.** The tasks span real services people use daily — search, shopping, maps, booking, reference sites. The agent handles real layouts, real popups, and real latency.
- **Multimodal agents.** WebVoyager was built around agents that see the page, not just read its HTML. Screenshots plus accessibility information let the agent reason about visual layout the way a person would.
- **Open-ended objectives.** Tasks are goals, not scripts. There is no "correct" sequence of clicks; many paths satisfy the goal, which is what makes it a real test of autonomy.
- **A model judge.** Because tasks are open-ended and run live, WebVoyager popularized using a strong model (a GPT-4-class vision model in the original work) as an automatic evaluator that reads the agent's final screenshots and trajectory to decide success.

That last point is the most underappreciated. WebVoyager's headline contribution was not just the task list — it was showing that an LLM-as-judge could grade open-ended web tasks at roughly human-level agreement, which made large-scale automatic evaluation feasible at all. Before that, grading a "did the agent really book the room" task meant a human watching a replay.

### Why live sites cut both ways

Running on live sites is WebVoyager's biggest strength and its biggest weakness. The strength: you test the agent on the actual web, with all its noise. The weakness: the web changes. A redesign, a new cookie banner, an A/B test, or a region-locked page can change an agent's score without the agent changing at all. Two people running "the WebVoyager benchmark" months apart, from different countries, are not always running the same thing. Treat any single published WebVoyager number as a snapshot, not a constant — and reproducibility is the recurring theme of everything that follows.

## The wider benchmark family: beyond WebVoyager

WebVoyager is the famous one, but not the only one. To read agent claims critically, it helps to know the neighbors, since tools often report against several. Here is what each is publicly known for, with no specific scores pinned to it.

| Benchmark | Environment | What it stresses | Grading style |
|---|---|---|---|
| **WebVoyager** | Live, real websites | End-to-end, multimodal, open-ended goals | LLM-as-judge on trajectory + screenshots |
| **Mind2Web** | Snapshotted real sites | Generalization across many sites/domains | Step + task-level action matching |
| **WebArena** | Self-hosted, reproducible clones | Realistic multi-step tasks, reproducibility | Programmatic functional checks |
| **MiniWoB / MiniWoB++** | Tiny synthetic web tasks | Low-level UI primitives (click, type, drag) | Exact reward signal |
| **GAIA** (web portions) | Live web + reasoning | Multi-hop tasks needing tool use and reasoning | Exact-match final answer |

The pattern is a spectrum from **synthetic and perfectly reproducible** (MiniWoB) to **live and realistic but drifty** (WebVoyager, GAIA's web tasks). WebArena is the interesting middle: it ships self-hosted clones of site types (an e-commerce store, a forum, a CMS, a code host) so every run hits the same environment, with programmatic checks instead of a model judge. If you care about reproducibility, WebArena's design is closer to what you want from a test suite — and that idea matters when we get to BrowserBash.

None of these is "the" benchmark. A tool that tops MiniWoB might struggle on WebVoyager because the skills differ: MiniWoB rewards precise low-level control, WebVoyager rewards long-horizon planning and recovery. When someone says their agent "beats the benchmark," your first question should be *which one, against which model, in what month*.

## How browser-use uses benchmarks

[browser-use](https://browserbash.com/blog) is one of the most widely adopted open-source libraries for letting an LLM drive a browser. You give it a task and a model, and it runs an agent loop: observe the page, decide an action, act, repeat. It is a library you build on, not a finished product, and it has been popular partly because it publishes and competes on web agent benchmarks — WebVoyager being the headline one.

The way browser-use (and projects like it) approach benchmarks is instructive. The agent extracts a compact, structured representation of the page's interactive elements — buttons, links, inputs — often indexed so the model can refer to "element 14" instead of pasting raw HTML, and pairs that with the screenshot for multimodal models. Then the loop plans against the goal and the judge grades the result.

The honest takeaway from browser-use's benchmark posture: **the framework and the model are separable, and the model dominates the score.** The same browser-use code posts very different WebVoyager numbers driving a frontier vision model versus a small local one. The framework provides the scaffolding — DOM extraction, the action space, retries, the loop — and the model provides the intelligence. When a published number looks impressive, check which model produced it before you assume the framework will get you there with your own.

That is why benchmark numbers should never be read as a property of the tool alone. A library can be excellent and score modestly on a weak model, and a mediocre harness can ride a strong model to a good-looking result.

## How Agent-E approaches the same problem

[Agent-E](https://browserbash.com/blog) is a research-grade autonomous web agent that came out of work associated with Emergence AI. Where browser-use is a general library, Agent-E is more of a reference architecture, and it is frequently cited for two ideas that directly shape its benchmark behavior.

The first is a **hierarchical, multi-agent design**. Rather than one model both planning a multi-step task and wrangling the page, Agent-E splits the work: a planner-style agent decides what to do next, and a browser-navigation agent executes concrete actions. Each agent has a tighter job, which helps on long-horizon tasks where a single model tends to lose the thread.

The second is **DOM distillation**. Real pages are enormous and noisy, and feeding a raw DOM to a model burns tokens and buries the relevant controls. Agent-E processes the page into a compact, model-friendly representation so the planner reasons over the elements that matter. That is one reason it shows up when people discuss what makes web agents work on hard, real-world flows. Agent-E reported strong results on evaluations like WebVoyager when it was published.

Treat Agent-E the way you treat any research artifact: a foundation and a benchmark contender, not a turnkey QA tool. As of 2026, details like maintenance cadence, any hosted offering, or a commercial SLA are not publicly specified in a way I would quote — check the project's own repository before depending on it. The point here is the shape of the idea: a planner plus a browser executor, fed a distilled view of the page, graded on open-ended goals. Hold that shape in mind, because it is almost exactly what a natural-language testing CLI does, just aimed at a different outcome.

### The common thread across all three

WebVoyager, browser-use, and Agent-E share one mental model: **a plain-English objective drives an agent that perceives a real page, plans, acts, and is graded on the goal rather than the steps.** That is a powerful idea — and almost word for word what you want when writing a test: "Log in, add a laptop to the cart, check out, and confirm the order went through." The gap between a benchmark agent and a useful test is not the idea; it is everything around it: reproducibility, a clear pass/fail signal, secrets handling, recordings, and a committable file.

## Why benchmark scores rarely survive contact with CI

Here is the uncomfortable truth leaderboards hide. A high success rate on WebVoyager does not mean the same pass rate on *your* checkout flow. Benchmarks and test suites optimize for different things, and the mismatch shows up immediately.

- **Benchmarks tolerate non-determinism; CI does not.** A benchmark happily reports "succeeded on 87 of 100 tasks." A pipeline needs a specific flow to pass *every* time, or it is a flaky test you end up ignoring.
- **Benchmarks grade loosely; tests assert precisely.** An LLM judge deciding "looks booked" is fine for research. A regression test must assert the confirmation text appeared, the secret coupon applied, and the total matched.
- **Benchmarks run once; tests run forever.** A benchmark is a measurement. A test is an asset you keep, version, and re-run for months — so the artifact matters as much as the run.
- **Benchmarks ignore secrets and replay; CI lives and dies by them.** No benchmark cares about masking a password or producing a video your teammate can watch on a failure. Every QA workflow does.

So the agent-driven approach is right, but the packaging that makes it a benchmark is wrong for testing. You want the same "describe the goal, let an agent drive a real browser" model, wrapped so the result is deterministic enough to gate a deploy, committable enough to review in a pull request, and observable enough to debug when it breaks. That is the gap BrowserBash is built for.

## How BrowserBash applies the agent approach to real tests

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) command-line tool from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and you get back a verdict plus structured results. If that sounds like the WebVoyager loop, that is the point: BrowserBash takes the agent-driven idea those benchmarks proved out and aims it at deterministic, committable test files instead of a leaderboard.

A first run looks like this:

```bash
npm install -g browserbash-cli

browserbash run "Log in to the demo store, add a laptop to the cart, \
complete checkout, and verify the page shows 'Thank you for your order!'"
```

The agent perceives the page, plans, acts, and reports whether it reached the goal — the same observe-plan-act loop a benchmark agent uses. The difference is what happens around it.

### Local-first models, so your benchmark of one costs nothing

Benchmark numbers are dominated by the model, and so is the cost of running an agent. BrowserBash is **Ollama-first**: it defaults to free local models, needs no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so you can stay entirely local or bring a key when you want a stronger model. OpenRouter support includes genuinely free hosted models such as `openai/gpt-oss-120b:free`, and Anthropic Claude works with your own key.

The honest caveat ties straight back to the benchmark discussion: **very small local models (around 8B and under) get flaky on long, multi-step objectives** — exactly the long-horizon tasks WebVoyager stresses. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. That is the "model dominates the score" lesson the benchmarks teach, applied to your own laptop. If a flow fails on a tiny model, it is usually the model, not the tool.

### Deterministic, committable tests instead of a one-off run

This is where BrowserBash diverges hardest from a benchmark. You promote an ad-hoc objective into a committable Markdown test — a `*_test.md` file where each list item is a step. It supports `@import` for composing shared flows and `{{variables}}` for templating, and any variable you mark as secret is masked as `*****` in every log line. After each run it writes a human-readable `Result.md`.

```bash
browserbash testmd run ./checkout_test.md
```

A test file might read:

```
# Checkout smoke test
- Go to {{baseUrl}} and log in as {{username}} / {{password}}
- Add the first laptop on the catalog page to the cart
- Open the cart and proceed to checkout
- Fill shipping with the saved test address and place the order
- Verify the page shows "Thank you for your order!"
```

That file is the asset benchmarks never produce. It lives in your repo, diffs cleanly in code review, runs the same way on every machine, and keeps your password out of the logs. You get the agent's flexibility — no brittle selectors to maintain when the UI shifts — with the determinism a test suite needs. The [BrowserBash learn docs](https://browserbash.com/learn) walk through the full `testmd` format.

### Built for CI and AI coding agents, not prose parsing

Benchmarks lean on an LLM judge to interpret fuzzy output. A pipeline cannot afford that ambiguity, so BrowserBash has an agent mode built for machines. `--agent` emits NDJSON — one JSON event per line on stdout — and the process exits with a clear code: `0` passed, `1` failed, `2` error, `3` timeout. No prose to parse, no summary to scrape, no second model needed to tell you what happened.

```bash
browserbash run "Sign in and confirm the dashboard loads" \
  --agent --headless \
  --record \
  --upload
```

`--record` captures a screenshot and a full `.webm` session video via ffmpeg on any engine; on the builtin engine it also captures a Playwright trace you can open in the trace viewer. When a benchmark task fails you get a number. When a BrowserBash test fails you get a video, a trace, and an exit code your CI already understands — which is the entire reason this approach survives contact with a real pipeline.

### Where the browser runs, and where results land

BrowserBash separates the agent from the runtime. The `--provider` flag chooses where the browser runs: `local` (the default, your own Chrome), `cdp` (any DevTools endpoint), or a cloud grid like `browserbase`, `lambdatest`, or `browserstack`. So you can prototype against local Chrome, then fan the same objective across real browser/OS combinations on a grid:

```bash
browserbash run "Complete the signup flow and verify the welcome email banner" \
  --provider lambdatest --record
```

Under the hood, the default engine is Stagehand (MIT, by Browserbase); there is also a builtin engine that runs an in-repo Anthropic tool-use loop. No account is needed to run anything. There is a fully local dashboard via `browserbash dashboard`, plus an optional, strictly opt-in free cloud dashboard you reach with `browserbash connect` and `--upload` for run history, video recordings, and per-run replay. Free uploaded runs are kept 15 days. The [pricing page](https://browserbash.com/pricing) has the full breakdown.

## When to lean on benchmarks vs when to write tests

These are different jobs, and the honest answer is you often want both. Here is how I'd split it.

**Reach for web agent benchmarks when you are choosing or building the agent itself.** If you are evaluating which framework or model to bet on — comparing browser-use against Agent-E against a hosted agent, or deciding whether a 70B local model is good enough — WebVoyager and its siblings are the right yardstick. They tell you how capably a system navigates the open web on hard, varied tasks. That is a research question, and benchmarks are the right tool for it.

**Reach for a committable test tool like BrowserBash when you need a specific flow to pass repeatedly.** If the question is "does *our* checkout still work after this PR," a benchmark score is useless and a deterministic test is everything. You want a file in the repo, masked secrets, a video on failure, and an exit code.

**Who BrowserBash is genuinely not for:** if you need a hosted, fully autonomous agent that completes arbitrary open-web tasks with a commercial SLA, a managed agent platform fits better than a CLI you run yourself. And if you are doing pure agent research to push WebVoyager numbers, you want the research frameworks and their evaluation harnesses, not a test runner.

A reasonable workflow uses both: benchmark the agent stack to pick your model and framework, then write BrowserBash tests for the handful of flows that actually have to pass before you ship. The [case studies](https://browserbash.com/case-study) show what that second half looks like in practice.

## A practical checklist for reading any agent benchmark claim

Before you believe a web agent benchmark number, run it through the same questions a skeptical SDET asks about any test result:

- **Which benchmark, exactly?** MiniWoB and WebVoyager measure different skills. A number without a named benchmark is marketing.
- **Which model produced it?** The model dominates the score, so a framework's number is really a framework-plus-model number.
- **Live or snapshotted?** Live-site scores drift; treat them as a snapshot, not a constant.
- **How was success graded?** LLM-as-judge, exact match, and programmatic check have different failure modes and generosity.
- **Does it translate to your flow?** Benchmark success on generic tasks says little about your specific, secret-laden, must-pass checkout.

Keep that checklist handy and you will read leaderboards the way they deserve — as signal about agent capability, not a promise about your pipeline.

## FAQ

### What is WebVoyager and why is it important?

WebVoyager is a benchmark introduced in 2024 for evaluating end-to-end web agents on real, live websites rather than simplified sandboxes. It is important because it tests multimodal agents on open-ended, goal-based tasks and popularized using a strong model as an automatic judge of success. That LLM-as-judge approach made large-scale, automatic grading of fuzzy web tasks practical for the first time, which is why so many agents now report against it.

### Are web agent benchmark scores a reliable measure of a tool?

Only partly, and you should read them carefully. A benchmark score reflects the framework and the model together, and the model usually dominates, so the same library can post very different numbers depending on what you point it at. Live-site benchmarks like WebVoyager also drift as websites change, so any single published figure is a snapshot rather than a constant. Treat scores as a signal about agent capability, not a guarantee about how a specific flow will behave in your pipeline.

### How is BrowserBash different from a benchmark agent like browser-use or Agent-E?

BrowserBash uses the same agent-driven idea — a plain-English objective drives an agent that perceives a real browser, plans, and acts — but it is built for deterministic, repeatable tests instead of a leaderboard. It produces committable Markdown test files, masks secrets in logs, emits machine-readable NDJSON with clear exit codes, and records video and traces for debugging. browser-use is a library you build on and Agent-E is a research architecture, whereas BrowserBash is a finished CLI aimed squarely at QA and CI.

### Can I run a browser agent locally for free?

Yes. BrowserBash is Ollama-first, so it defaults to free local models with no API keys, and nothing leaves your machine, which can give you a genuine zero-dollar model bill. The honest caveat is that very small local models around 8B and under get flaky on long, multi-step tasks, so the sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. You can also bring an Anthropic or OpenRouter key, including genuinely free hosted models, whenever you want more capability.

## Get started

The agent-driven approach WebVoyager proved out is genuinely powerful; the trick is wrapping it so the result is deterministic, committable, and observable enough to gate a real deploy. That is what BrowserBash does. Install it with `npm install -g browserbash-cli`, write your first objective against a local model, and promote the flows that matter into `*_test.md` files you commit. When you want run history and replays, the optional dashboard is one [sign-up](https://browserbash.com/sign-up) away — and an account is entirely optional, since everything core runs locally without one.
