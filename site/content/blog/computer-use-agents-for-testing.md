---
title: Computer-Use Agents for Testing: Operator, Nova Act, and More
description: "Computer use agents testing in 2026: how Operator, Nova Act, Project Mariner, and Anthropic Computer Use stack up for QA — plus the CLI-first take."
date: 2026-02-17
category: agents
---

If you have watched a model take over a browser and click its way through a checkout, you have felt the pull. Computer use agents for testing promise the thing every QA team has wanted for a decade: write what you want in plain English, let an AI drive a real browser, and get a result back. Over the last year that promise stopped being a demo. Anthropic shipped Computer Use, OpenAI shipped Operator, Amazon shipped Nova Act, and Google has been running Project Mariner. Each one can, in principle, run a test. The harder question — the one this article is actually about — is which of them is built to give you a *verdict* you can trust in a pipeline, and which are research previews wearing a product costume.

I work on BrowserBash, so I have a horse in this race and I will say so plainly where it matters. But I have also spent real hours wiring these agents into test harnesses, and most of the honest answer is that the big computer-use agents are excellent *capabilities* and incomplete *test tools*. That gap is the whole story. Let me walk through what each one is, where it fits for QA, and what you have to build yourself before any of them can fail a build.

## What a computer-use agent actually is

A computer-use agent is a model loop that observes a screen, decides on an action, takes it, and observes again. The canonical loop: capture a screenshot, send the image plus your instruction to a vision-capable model, the model replies with something like `click(x, y)`, `type("hello")`, `scroll`, or `key("Return")`, your harness executes it, and you screenshot again. Repeat until the goal is met or you cut it off. That is the primitive behind every tool in this article, with variations in how much DOM context the model also gets and how much scaffolding the vendor wraps around it.

The appeal for testing is obvious. There are no selectors to maintain, no page objects to refactor when a designer moves a button, and no brittle XPath that snaps the moment the markup shifts. You describe the *intent* — "log in, add a laptop to the cart, complete checkout, confirm the thank-you message" — and the agent figures out the steps. For exploratory testing, smoke checks, and flows that change constantly, that is a genuinely different way to work.

The catch is also obvious once you have run a few hundred of these. A vision-first agent that reasons about pixels is slower and pricier than a DOM-aware one, and it re-finds everything on every layout change. More importantly for QA: an agent that *does* a task is not the same as a test that *checks* a task. A test needs a clear pass/fail, a stable exit code, a record of what happened, and the ability to run unattended a thousand times without a human babysitting it. Most computer-use agents nail the doing and leave the checking to you.

## Anthropic Computer Use: the capable primitive

Anthropic Computer Use is a model capability exposed through the Anthropic API, available on Claude models that support it. Anthropic publishes a reference agent loop — usually demonstrated in a Docker container with a virtual display — that screenshots, reasons, and acts. It is vision-first and coordinate-based at its core, though the surrounding tooling can feed the model more context.

For testing, Computer Use is the most "raw materials" of the bunch, and that is a compliment in one sense and a warning in another. Because it is a primitive, you can build exactly the harness you want around it: your own retry logic, your own assertions, your own CI plumbing. Because it is a primitive, you *have to*. There is no built-in test verdict, no committable test file format, no exit-code contract, and no session video out of the box. You are assembling a test framework, not adopting one.

The breadth is real, though. Computer Use can drive a browser, a spreadsheet app, a native installer, or a legacy desktop client — anything with a screen. If your "test" actually spans a desktop app and a browser, none of the browser-native tools replace it. For pure web testing, that breadth is mostly cost you do not need: every turn ships an image, long flows mean many turns, and there is no free local tier. It is the right call when you need genuine cross-application control and you are willing to own the harness.

## OpenAI Operator: agentic browsing, product-shaped

OpenAI's Operator is a computer-use agent that runs a browser in the cloud and completes tasks on your behalf — booking, ordering, filling forms, navigating sites. It was introduced as a research preview and is powered by what OpenAI has described as a Computer-Using Agent model. The exact model wiring, availability tiers, and pricing have shifted since launch and are best checked against OpenAI's current docs rather than taken from any article, this one included.

As a *product*, Operator is more polished than a bare API loop. It presents a browser, narrates its steps, and hands control back when it hits something it should not do alone (logins, payments, captchas). That hand-back behavior is excellent for a consumer assistant and awkward for an unattended test: a test that pauses to ask a human to log in is not a test you can run a thousand times overnight in CI.

For QA specifically, Operator's strengths are exploratory. Point it at a flow, watch it reason through your UI, and you will surface usability snags and dead ends fast. Where it gets thin is the test-shaped requirements: there is no first-class committable test file, no documented exit-code contract for pipelines, and the cloud-only execution model means you are not running against your own local Chrome with your own cookies and your own network conditions unless you arrange that. Operator is built to *accomplish tasks for a person*. A CI system is not a person.

## Amazon Nova Act: an SDK aimed at developers

Amazon Nova Act is the most developer-shaped entry. Amazon released it as an SDK (with a research preview around the Nova Act model) explicitly aimed at building agents that take actions in a web browser. The pitch — break a workflow into smaller, reliable commands and call them from code — is closer to how an SDET actually thinks than a chat box is. You write `act("click the search box")`, `act("type 'laptop'")`, and so on, composing reliability out of small steps rather than betting everything on one giant instruction.

That decomposition is genuinely smart for testing, because the failure mode of long-horizon agents is exactly the long horizon. The shorter and more checkable each step, the less the agent drifts. Nova Act also leans toward letting you mix natural-language actions with conventional automation, which is the pragmatic middle ground a lot of teams want.

What Nova Act is *not*, as of 2026, is a finished test runner. It is an SDK for building browser agents, not a CLI that emits pass/fail verdicts and exit codes for your pipeline. The model and SDK details, regional availability, and pricing are Amazon's to specify and have moved since the preview, so verify them directly. If you are a team that wants to *build* your own testing layer in Python on top of a capable action model, Nova Act is a strong foundation. If you want to *adopt* a test tool today, you still have assembly ahead of you.

## Google Project Mariner: research-grade browsing

Google's Project Mariner is a research prototype built to explore agentic browsing — navigating sites, filling forms, and completing tasks within the browser, with roots in Google's Gemini work. It has been gated behind limited access and positioned explicitly as research, with availability and capabilities that Google has rolled out gradually. Treat anything specific about its model, limits, or pricing as subject to change and check Google's current statements.

For testing, the honest read is that Mariner is the least "grab it and put it in CI" of the four. It is a window into where Google thinks agentic browsing is going, not a published exit-code-and-verdict test runner. That is not a knock — research previews are how this whole field advances — but if your goal this quarter is to fail a build when checkout breaks, Mariner is not the tool you reach for. Watch it; do not block your release pipeline on it.

## The comparison table

Here is the at-a-glance version. I have kept this to what is publicly known or clearly stated by each vendor as of early 2026; where something is not public or has shifted, I mark it "not publicly specified" rather than invent a number. Do not quote pricing or model internals from this table — verify against each vendor's live docs.

| Tool | Primary shape | Where the browser runs | Built for unattended CI? | Test verdict + exit codes | Free local model path |
| --- | --- | --- | --- | --- | --- |
| Anthropic Computer Use | Model capability / API primitive | Your harness (often Docker) | You build it | No (you build it) | No |
| OpenAI Operator | Consumer-shaped agent product | Cloud browser | Not its design (hands back to human) | Not publicly specified | No |
| Amazon Nova Act | Developer SDK | Your code drives a browser | You build it | No (SDK, not a runner) | Not publicly specified |
| Google Project Mariner | Research prototype | Google-managed (limited access) | No (research preview) | No | No |
| BrowserBash | CLI test runner | Local Chrome by default, or remote grids | Yes (built for it) | Yes (exit 0/1/2/3, NDJSON) | Yes (Ollama-first, $0 local) |

The pattern in that table is the whole argument of this article. The four big agents are powerful and, in three of four cases, genuinely product-grade for their *intended* job — accomplishing tasks for a user or giving developers an action primitive. None of them ships as a test runner with a documented exit-code contract you can drop into a pipeline today. That last column and the CI column are where a test-shaped tool earns its keep.

## What testing actually demands (and where the gap is)

Step back from the model and think about what a test is. A test is a *claim* — "this flow works" — plus a *machine-readable answer* about whether the claim holds, plus *evidence* you can review when it does not. Computer-use agents give you the first part beautifully. The second and third parts are where most of them leave you holding the bag.

### A verdict, not a transcript

When checkout breaks at 2 a.m., your pipeline needs a boolean, not a paragraph. "I clicked the button and the page seemed to load, though I noticed the cart total looked slightly different" is a wonderful thing for an exploratory session and a terrible thing for a gate. Parsing prose to decide pass/fail is exactly the brittleness you were trying to escape. A test tool has to commit to a verdict and an exit code so `if [ $? -ne 0 ]` just works.

### Determinism enough to run unattended

You cannot have a human approving logins and dismissing captchas every run. A test agent has to run start-to-finish on its own, with secrets injected safely and no hand-back-to-human step in the critical path. The consumer-grade hand-back that makes Operator safe for shopping is the same behavior that makes it awkward as an unattended gate.

### Evidence on failure

When a run fails you want a screenshot, a video, and ideally a trace — not a re-run and a shrug. "It worked on my machine, run it again" is not a debugging strategy. The evidence has to be captured automatically, every run, so a flaky failure is investigable after the fact.

### A committable artifact

Tests live in your repo, get reviewed in pull requests, and version with your code. An agent you prompt in a chat window or a cloud console is not that. You want a file your team can diff, comment on, and trust.

## Where BrowserBash fits: the test-shaped take

This is the vendor talking, so weigh it accordingly. BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. It is built around the same core idea as the agents above — you write a plain-English objective, an AI agent drives a *real* Chrome step by step with no selectors and no page objects — but it is shaped from the start as a test runner rather than a general assistant or a raw primitive.

The first practical difference is the model story. BrowserBash is **Ollama-first**: it defaults to free local models, needs no API keys, and nothing leaves your machine. It auto-resolves a local Ollama install, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`, so you can run a genuine $0 model bill on local hardware and only reach for a hosted model when a flow is hard. OpenRouter support includes genuinely free hosted models such as `openai/gpt-oss-120b:free`, and you can bring your own Anthropic Claude key when you want a frontier model on a tough flow. None of the four big agents above has a free, fully-local default path the way this does.

Here is the honest caveat I tell everyone, because it matters more for unattended testing than for a person watching: very small local models (roughly 8B and under) get flaky on long multi-step objectives. They lose the thread, repeat a step, or declare victory early. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. If you try to run a fifteen-step checkout on a tiny model and it wobbles, that is expected — size up the model, do not blame the idea.

The second difference is the part the big agents leave to you: the test contract. Run with `--agent` and BrowserBash emits NDJSON, one JSON event per line on stdout, and returns honest exit codes — `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, no LLM-judging your logs. A CI step or an AI coding agent reads structured events and a real exit code. That is the missing column from the comparison table, shipped by default.

```bash
# Install once
npm install -g browserbash-cli

# Run a real checkout as a gated CI check — structured output, real exit code
browserbash run "log in to the demo store, add a laptop to the cart, \
  complete checkout, and verify the page shows 'Thank you for your order!'" \
  --agent --headless --record
# exit 0 = passed, 1 = failed, 2 = error, 3 = timeout
```

The third difference is that the test is a committable artifact. BrowserBash supports Markdown tests — `*_test.md` files where each list item is a step — with `@import` composition for sharing logins across suites and `{{variables}}` templating. Variables you mark as secret are masked as `*****` in every log line, which is the difference between a usable CI log and one you have to scrub before sharing. After each run it writes a human-readable `Result.md`.

```bash
# checkout_test.md is committed to your repo and reviewed in PRs
browserbash testmd run ./checkout_test.md \
  --var store_user="qa@demo.test" \
  --secret store_pass="$STORE_PASS"
```

Evidence is built in too. `--record` captures a screenshot and a full `.webm` session video via ffmpeg on any engine, and the builtin engine additionally captures a Playwright trace you can open in the trace viewer. When a 2 a.m. run fails, you have the video and the trace waiting, not a re-run and a guess. If you want run history, per-run replay, and video across a team, there is an optional free cloud dashboard — strictly opt-in via `browserbash connect` and `--upload`, with free uploaded runs kept 15 days — plus a fully local `browserbash dashboard` if you would rather keep everything on your machine.

There are two engines under the hood: `stagehand` (the default, MIT-licensed, from Browserbase) and `builtin`, an in-repo Anthropic tool-use loop. And because *where* the browser runs is a flag, not a rewrite, you can keep your local Chrome for dev and point the same objective at a cloud grid for scale with `--provider`: `local` (default), `cdp` for any DevTools endpoint, or `browserbase`, `lambdatest`, and `browserstack` for managed browsers.

```bash
# Same objective, run on a LambdaTest grid for cross-browser coverage
browserbash run "search for 'wireless mouse' and confirm at least one result" \
  --provider lambdatest --agent
```

If you want to go deeper on the command surface, the [features page](https://browserbash.com/features) lists the flags, the [learn hub](https://browserbash.com/learn) walks through writing your first objective, and the [case study](https://browserbash.com/case-study) shows a real flow end to end.

## When to choose what

Let me be balanced, because the right answer genuinely depends on your job to be done.

**Choose Anthropic Computer Use** when your automation spans beyond the browser — a desktop app, an installer, a legacy client — and you are happy to own the harness, the retries, and the CI plumbing yourself. It is the most flexible primitive and the right base when you truly need cross-application control. For pure web testing it is more cost and more assembly than you need.

**Choose OpenAI Operator** when you want a polished agent to *accomplish web tasks for a person* — research, booking, exploratory walkthroughs of your own product to surface UX problems. Its hand-back-to-human safety is a feature for assistance and a friction point for unattended gates. Verify its current availability and pricing before you plan around it.

**Choose Amazon Nova Act** when you are a developer who wants to *build* your own browser-agent layer in code, decomposing flows into small reliable actions. It is the most SDET-friendly mental model of the big four. You will still build the verdict-and-evidence layer on top.

**Choose Google Project Mariner** to learn where agentic browsing is heading. Do not gate a release pipeline on a research preview.

**Choose BrowserBash** when the job is *testing a web app*, you want a $0 local default, and you need a real exit code, structured NDJSON, committable `*_test.md` files, masked secrets, and automatic video/trace evidence without building any of it. If you need full desktop control, it is the wrong tool — that is Computer Use's territory, and I will say so. For browser test automation that fails a build honestly, it is exactly the shape you want.

A reasonable hybrid exists, too: use a capable hosted model *through* BrowserBash for your hardest flows while keeping local models for the fast majority, so you get frontier reasoning where it pays and a $0 bill everywhere else. You can read more on the [pricing page](https://browserbash.com/pricing) (the CLI itself is free and open source) and browse other deep-dives on the [blog](https://browserbash.com/blog).

## FAQ

### What is the best computer use agent for testing in 2026?

There is no single winner — it depends on whether you want a primitive, an SDK, a consumer assistant, or a test runner. For genuine cross-application desktop control, Anthropic Computer Use is the most flexible base. For unattended browser test automation with real exit codes and committable tests, a test-shaped CLI like BrowserBash is built for the job, while Operator, Nova Act, and Mariner are better at accomplishing tasks or providing developer primitives than at gating a CI pipeline today.

### Can OpenAI Operator run automated tests in CI?

Operator is designed as a consumer-shaped agent that accomplishes web tasks and hands control back to a human for sensitive steps like logins and payments, which is awkward for unattended CI. It does not publish a first-class exit-code-and-verdict contract for pipelines as of 2026, so using it as an automated gate means building your own harness. Verify its current capabilities and availability against OpenAI's live documentation before planning around it.

### Do computer use agents replace Selenium and Playwright for testing?

Not entirely, and often you will run both. Computer-use agents shine for flows that change constantly and for exploratory testing where maintaining selectors is the real cost. Deterministic, high-volume regression suites where you need millisecond-stable selectors are still well served by Playwright or Selenium, and many teams use an AI agent for the fragile or fast-changing flows while keeping coded tests for the stable core.

### Is there a free way to run computer use agents for testing?

Yes. BrowserBash is free and open source under Apache-2.0 and is Ollama-first, defaulting to free local models with no API keys and nothing leaving your machine, so you can run a genuine $0 model bill on local hardware. It also supports genuinely free hosted models through OpenRouter. Note that very small local models can be flaky on long multi-step flows, so a mid-size local model or a capable hosted model is the sweet spot for hard objectives.

Ready to put a verdict and an exit code behind your browser flows? Install with `npm install -g browserbash-cli`, write your first plain-English objective, and run it against your own Chrome in minutes. No account is required to run it locally; the optional free dashboard is there if you want it — [sign up here](https://browserbash.com/sign-up).
