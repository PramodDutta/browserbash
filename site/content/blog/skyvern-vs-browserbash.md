---
title: Skyvern vs BrowserBash: Hosted Vision Agent vs Free OSS CLI
description: "Skyvern vs BrowserBash compared honestly: a vision-based hosted automation platform vs a free, local-first, model-agnostic CLI. Pick by use case."
date: 2026-04-17
category: comparison
---

If you are weighing Skyvern vs BrowserBash, you are really weighing two different bets on what AI browser automation should feel like. Skyvern is a vision-first platform: it screenshots a page, asks a vision-capable LLM what to click, and runs that as a hosted workflow with a builder, an API, and a managed cloud. BrowserBash is a free, open-source command-line tool that drives your own real Chrome from a plain-English objective and hands you a verdict plus structured values. Both let you skip CSS selectors. They diverge hard on where your data lives, what you pay, and who the tool is built for. This piece walks the honest trade-offs so you pick the right one instead of the louder one.

I have spent enough time wiring browser agents into CI to know the marketing-page version of these tools rarely survives contact with a flaky checkout flow. So this is a working-engineer comparison, not a feature-grid beauty contest. Where I do not have a public fact about Skyvern, I say so rather than guessing.

## What Skyvern actually is

Skyvern is an AI browser automation platform from Skyvern-AI, open-sourced under AGPL-3.0 and also offered as a hosted cloud product. Its headline idea is visual reasoning. Instead of hunting for `#checkout-button`, Skyvern takes a screenshot, sends it to a vision-capable model, and decides what to interact with based on what the page *looks* like. That approach is genuinely good at one thing: running on a site it has never seen before without you writing or maintaining selectors. When a layout shifts, a pixel-and-text agent often shrugs and keeps going where a brittle XPath would have snapped.

Around that core, Skyvern wraps a fair amount of platform. As of 2026, the public picture includes:

- **SDKs** in Python (`pip install skyvern`) and TypeScript, plus a REST API and Model Context Protocol (MCP) support.
- **A workflow builder** so you can compose multi-step automations, not just one-shot tasks. You can describe tasks in English, record actions, or build flows visually.
- **Deployment both ways**: a managed cloud, and self-hosting via Docker Compose so data stays in your infrastructure.
- **Bring-your-own LLM** for self-hosted setups, with documented support for OpenAI, Anthropic, Google Gemini, and Ollama (and OpenAI-compatible endpoints via LiteLLM).
- **Native handling of CAPTCHAs and 2FA flows**, proxy/geo-targeting, and compliance posture (SOC 2 Type II and HIPAA are referenced on their site).

That last cluster matters. Skyvern is positioning as an automation *product* for businesses that want invoice processing, lead-gen scraping, accounts-payable flows, and form filling at scale, with the operational scaffolding to match. That is a different job than "let me check this login works before I push."

On pricing, Skyvern publishes tiered plans plus a usage-based cloud option (a per-step price has been quoted publicly), alongside the free open-source path. Exact numbers move, so treat any specific figure as point-in-time and check [skyvern.com/pricing](https://www.skyvern.com/pricing) before you budget against it. The self-hosted, BYO-key route is the way to run Skyvern without paying for managed credits — you then pay your model provider instead.

## What BrowserBash actually is

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy, built by Pramod Dutta. You install it once and run it from your terminal:

```bash
npm install -g browserbash-cli
browserbash run "Go to the staging site, log in as a standard user, add the cheapest in-stock item to the cart, and confirm the cart subtotal updates"
```

You write a plain-English objective. An AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — and returns a pass/fail verdict plus any structured values it extracted along the way. It runs locally by default. Nothing leaves your machine unless you explicitly opt in. The latest version is 1.3.1; it needs Node 18+ and Chrome for the default local provider.

The defining design choice is the model story, and it is the opposite of cloud-first. BrowserBash is **Ollama-first**. The default `auto` model resolves in this order:

1. A local Ollama install, used as `ollama/<model>` — free, no API keys, nothing leaves the box.
2. `ANTHROPIC_API_KEY` if set, mapping to `claude-opus-4-8`.
3. `OPENAI_API_KEY` if set, mapping to `openai/gpt-4.1`.
4. Otherwise it errors with guidance instead of silently calling a paid API.

So out of the box, on a machine with Ollama, BrowserBash gives you a guaranteed $0 model bill and a guaranteed-private run. That is a hard guarantee about *where the inference happens*, which is a different kind of promise than "we are SOC 2 compliant." Both have value; they answer different questions.

One honest caveat I will repeat because it matters: very small local models (roughly 8B and under) get flaky on long, multi-step objectives. They lose the thread, misread a confirmation, or declare victory early. The sweet spot is a mid-size local model in the Qwen3 / Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. BrowserBash does not magic away the fact that the reasoning quality of your model is the reasoning quality of your automation.

## Architecture: vision-first platform vs engine-and-provider CLI

The two tools are built around different primitives, and that is the cleanest way to understand them.

Skyvern's primitive is the **vision loop**: screenshot, reason, act, repeat, with a workflow layer on top for orchestration and a hosted control plane for scheduling, retries, and observability. It is a system you log into and operate.

BrowserBash's primitive is the **engine + provider split**, which is worth understanding because it is how you tune the tool:

- **Engines** decide *who interprets the English*. The default is `stagehand` (MIT, by Browserbase) with act/extract/observe/agent primitives and self-healing behavior. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright (and the one auto-selected for LambdaTest/BrowserStack). You switch with `--engine stagehand|builtin`.
- **Providers** decide *where the browser runs*, via `--provider`: `local` (your own Chrome, the default), `cdp` (any DevTools endpoint via `--cdp-endpoint ws://...`), `browserbase`, `lambdatest`, and `browserstack`. The grid providers need their respective credentials and auto-switch to the builtin engine.
- **LLM backends** are picked with `--model` or left on `auto`. You can pin `ollama/qwen3`, `claude-opus-4-8`, `openai/gpt-4.1`, `google/gemini-2.5-flash`, an `openrouter/<vendor>/<model>` route, or an Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`.

Notice the overlap: both tools are model-agnostic and both can run on local models via Ollama. The honest difference is *posture*. Skyvern hosts the loop and the orchestration for you (or you stand up the whole Docker stack yourself). BrowserBash ships as a single CLI you already know how to put in a script, a Makefile, or a CI job, and the "platform" parts (dashboard, cloud) are optional add-ons rather than the center of gravity.

## Head-to-head comparison

Here is the side-by-side, with hedges where Skyvern's specifics are not something I can state as fact.

| Dimension | Skyvern | BrowserBash |
| --- | --- | --- |
| Core form factor | Hosted platform + self-hostable server (Docker) | Single open-source CLI you run locally |
| License | AGPL-3.0 (cloud product also offered) | Apache-2.0 |
| Primary interaction | Workflow builder, SDKs (Python/TS), REST API, MCP | `browserbash run "<objective>"` from the terminal |
| How it sees the page | Vision-first: screenshot + vision LLM | Engine-driven (Stagehand or builtin tool-use) on real Chrome via Playwright/CDP |
| Default privacy posture | Cloud by default; self-host keeps data in-house | Local by default; nothing leaves the machine unless `--upload` |
| Model choice | BYO LLM on self-host (OpenAI, Anthropic, Gemini, Ollama) | `auto` (Ollama-first) or pin any of Ollama/Anthropic/OpenAI/Gemini/OpenRouter |
| Guaranteed $0 model bill | Possible via self-host + local model | Yes, default path on local Ollama |
| Output for automation/CI | REST/webhooks; SDK responses | NDJSON via `--agent`, exit codes 0/1/2/3 |
| Committable test format | Workflows in the platform | Markdown `*_test.md` tests with `{{variables}}`, `@import`, secret masking |
| CAPTCHA / 2FA handling | Native handling advertised | Not a built-in feature; you script around it |
| Compliance posture | SOC 2 Type II, HIPAA referenced | Local-by-default; you own the environment |
| Best fit | Business automation at scale, RPA-style ops | SDET/dev test checks, CI gates, local-first runs |
| Pricing | Tiered + usage-based cloud; free OSS path (verify current) | Free and open source; you only pay your own model if you use a paid one |

A note on the compliance and CAPTCHA rows: those are real Skyvern strengths and I am not going to pretend BrowserBash competes there. If your automation has to clear CAPTCHAs unattended or carry a SOC 2 / HIPAA story for an auditor, Skyvern's managed posture is doing work that a local CLI simply is not designed to do.

## Where each tool genuinely wins

### Skyvern is the better fit when

You are building *operational* automation, not test checks. Think recurring back-office jobs: pull invoices from a vendor portal every morning, fill the same insurance-quote form across fifty carriers, scrape leads on a schedule. The workflow builder, the hosted scheduler, the native CAPTCHA/2FA handling, and the compliance certifications are exactly the things you want when an unattended bot runs in production against sites you do not control.

You also want the vision-first approach when the target sites are genuinely unknown and wildly varied. A pure screenshot-reasoning loop has a real edge on a long tail of sites you will never see twice, because there is nothing to maintain — no selectors, no page model, no per-site config. If "works on a site we have never seen, with zero setup" is your top requirement, that is Skyvern's home turf.

And if you want a managed product with a UI your non-engineer teammates can operate, Skyvern is a platform; BrowserBash is a CLI. That is a real difference for some teams.

### BrowserBash is the better fit when

You are an SDET or developer who wants automation that lives *in the repo and in CI*, not in a separate hosted control plane. BrowserBash is a one-line install and a single command. The `--agent` flag emits NDJSON — one JSON object per line — so a CI job or an AI coding agent consumes structured progress and a terminal `run_end` event without parsing prose. Exit codes map cleanly: `0` passed, `1` failed, `2` error, `3` timeout. That is built for pipelines.

You care about data never leaving your machine. On the default local provider with a local Ollama model, nothing is uploaded — there is no cloud round-trip to opt out of, because the opt-in (`--upload`, which requires `browserbash connect --key bb_...`) is the only path that sends anything out. For regulated codebases or pre-release products you do not want screenshotted into a vendor's cloud, local-first is the whole point.

You want committable, reviewable tests. BrowserBash's markdown tests (`*_test.md`) are plain files: each list item is a step, `{{variables}}` template values, `@import` composes shared flows, and secret-marked variables are masked as `*****` in every log line. They live in version control next to your code, get reviewed in PRs, and write a human-readable `Result.md` after each run. A hosted workflow builder cannot give you a git diff.

You want zero ongoing cost and full model control. With `auto` on local Ollama, the model bill is $0 and provably so. When a flow gets hard, you flip a flag to a stronger model for that one run instead of re-platforming. Here is what tuning per run looks like:

```bash
# Local, free, private — default auto picks your Ollama model
browserbash run "Verify the pricing page lists three plans and extract each plan name and monthly price"

# Hard multi-step flow: pin a stronger hosted model just for this run, record video + trace
browserbash run "Complete the full signup, verify the welcome email screen, and report the account ID" \
  --model claude-opus-4-8 --record --timeout 180
```

If you are deciding by use case, a lot of teams will end up using both: Skyvern for unattended production RPA against third-party portals, BrowserBash for the test gates and local dev verification that should never leave the building. They are not really fighting over the same hour of your day.

## Running it in CI: the practical difference

This is where the form-factor gap shows up most. A hosted platform integrates with CI through its API and webhooks — you trigger a run, poll or receive a callback, and interpret the response. That works, and for scheduled production jobs it is arguably the right model.

For a per-PR test gate, though, a local CLI is hard to beat on simplicity. There is no service to authenticate against, no run to schedule, no result to fetch — the command *is* the gate, and its exit code *is* the verdict:

```bash
browserbash run "Log in with {{user}}/{{pass}} and confirm the dashboard loads without errors" \
  --agent --headless --timeout 120
```

With `--agent`, you get NDJSON your pipeline can stream: `{"type":"step","step":1,"status":"passed","action":"navigate",...}` for progress and a final `{"type":"run_end","status":"passed",...}`. If the run fails, the exit code fails the job. No glue code parsing human-readable logs. For markdown suites, `browserbash testmd run ./checkout_test.md` runs a committed test file and writes a `Result.md` artifact you can upload from CI.

Every run is also kept on disk at `~/.browserbash/runs` (secrets masked, capped at 200), so you have a local audit trail without standing up anything. If you want a UI, `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — no account, no upload. The cloud dashboard exists too, but it is strictly opt-in per run via `--upload`, and free cloud runs are kept 15 days. The defaults respect the "stays on my machine" promise.

If you are coming from a traditional stack, the [Appium and Selenium alternatives angle](https://browserbash.com/blog) and the broader [tutorials](https://browserbash.com/tutorials) walk through more of these CI patterns end to end.

## Honest limitations of each

No tool is free of sharp edges, and pretending otherwise helps nobody.

**Skyvern's trade-offs.** The vision-first loop is powerful but it is also the expensive part — every step can mean a screenshot plus a vision-model call, and on the cloud that is metered. AGPL-3.0 is a copyleft license; if you are embedding the self-hosted server into a product you distribute, talk to whoever owns licensing before you ship. Self-hosting the full stack is more than a one-line install — it is Docker Compose, model keys, and the operational care any service needs. And like every screenshot-reasoning agent, it inherits the failure mode of the model behind it: a weak model produces confidently wrong clicks.

**BrowserBash's trade-offs.** I already named the big one — small local models are unreliable on long objectives, so the free-and-private path has a real quality floor you have to respect by choosing a mid-size-or-better model. It is a CLI, so there is no point-and-click workflow builder for non-engineers; the audience is people comfortable in a terminal and a git repo. It does not ship native CAPTCHA-solving or a managed 2FA flow, so unattended automation against hostile sites is not its lane. And the cloud dashboard is intentionally minimal and opt-in, not a full RPA control plane.

If your honest requirement is "a managed product my ops team operates with native CAPTCHA handling and a compliance certificate," buy the platform. If it is "a fast, free, private, scriptable check I can drop into CI and review in a PR," install the CLI. You can read more about the model and engine choices on the [features page](https://browserbash.com/features) and see real flows on the [case studies](https://browserbash.com/case-study).

## A migration-free way to try both

Because both tools are model-agnostic and both can drive local models, you do not have to commit to one to evaluate them. Stand up Skyvern's self-hosted Docker stack with your own keys for the unattended-RPA experiments, and install BrowserBash for the test-gate and local-verification experiments — they will not step on each other.

For BrowserBash specifically, the lowest-friction evaluation is genuinely two commands and no account:

```bash
npm install -g browserbash-cli
browserbash run "Open example.com, confirm the page heading is visible, and report the exact heading text"
```

If you have Ollama running, that command costs nothing and uploads nothing. If you do not, set one API key and `auto` picks it up. When you want to learn the prompt patterns that make agents reliable — being specific about success criteria, asking for explicit verification, keeping objectives bounded — the [learn hub](https://browserbash.com/learn) collects the practical playbook. The full command surface lives in the [npm package readme](https://www.npmjs.com/package/browserbash-cli) and the [GitHub repo](https://github.com/PramodDutta/browserbash).

## FAQ

### Is Skyvern or BrowserBash better for testing?

For test gates that live in your repo and CI, BrowserBash fits better: it is a one-line CLI install, emits NDJSON and clean exit codes for pipelines, and supports committable markdown tests you review in PRs. Skyvern leans toward operational RPA and unattended workflow automation rather than developer-owned test suites. Many teams use BrowserBash for testing and Skyvern for production automation jobs.

### Does BrowserBash use computer vision like Skyvern?

Not as its core mechanism. Skyvern is vision-first — it screenshots a page and asks a vision LLM what to click. BrowserBash drives a real Chrome through an engine (Stagehand by default, or a built-in Anthropic tool-use loop) and uses its model to reason over the page and act, and it can capture screenshots and video with `--record`. Both let you skip CSS selectors, but the underlying approach differs.

### Can I run either tool completely free?

Yes, both have a free path. Skyvern is open source under AGPL-3.0 and self-hostable, where you bring your own model keys. BrowserBash is free and open source under Apache-2.0, and on its default Ollama-first local setup it has no model bill at all because inference runs on your machine. With paid hosted models, you pay only your own provider in either case.

### Is BrowserBash data sent to the cloud?

No, not by default. BrowserBash runs locally and nothing leaves your machine unless you explicitly opt in with `--upload`, which itself requires linking an account via `browserbash connect`. Runs are stored locally at `~/.browserbash/runs` with secrets masked, and the optional `browserbash dashboard` is fully local on localhost:4477. The cloud dashboard is opt-in, and free cloud runs are kept for 15 days.

Both of these tools earn their place — Skyvern for managed, vision-first automation at scale, and BrowserBash for free, private, scriptable checks you own end to end. If the second one sounds like your lane, it is one command away:

```bash
npm install -g browserbash-cli
```

No account required to run it. When you want the optional cloud dashboard, you can [sign up here](https://browserbash.com/sign-up).
