---
title: testRigor Cloud vs Local, Bring-Your-Own-Model Testing
description: "testRigor runs in its cloud on its models; a local CLI runs on your machine with Claude, OpenAI, or free Ollama. Compare data flow and model choice."
date: 2026-07-05
category: comparison
---

Your security team just asked a question nobody on the QA side can fully answer: when testRigor's AI looks at your staging checkout page to decide what to click next, which model is doing the looking, and where does that screenshot go before an answer comes back? For a hosted platform, the honest answer is "into our cloud, and something in our stack reasons about it," because the vendor owns both halves of that sentence: where the browser executes, and which model interprets what it sees. That unanswered line in a security review is usually the real moment a team stops treating "cloud test tool" as one decision and starts treating it as two: execution location, and model choice. Split them apart and the comparison between a hosted platform like testRigor and a local, bring-your-own-model CLI gets a lot more precise than "SaaS vs open source."

## Two decisions bundled into one purchase

Most testRigor comparisons argue about syntax (plain English vs code) or price. There is a more consequential axis sitting underneath both, and it rarely gets named directly: where does the browser run, and whose model reasons about what it sees while it runs?

testRigor bundles both answers into a single purchase. The browser executes on testRigor's managed cloud infrastructure, and the AI that interprets the page, decides what "the login button" means, and judges whether a check passed is baked into that platform. You do not choose the model, are not told which vendor built it, and cannot swap it. That is not a criticism so much as the nature of a managed SaaS: one vendor, one stack, one bill.

BrowserBash keeps the two decisions separate. You choose where the browser runs (your own Chrome by default, or a cloud grid), and independently you choose which model reasons about it (a free model on your own hardware through Ollama, or your own Claude, OpenAI, or OpenRouter key). Neither choice implies the other, and that independence is the subject of this article.

## Inside testRigor's cloud

testRigor is a commercial, AI-powered test automation platform built around plain-English steps: "click on 'Login'", "enter stored value 'email' into 'Email'", "check that page contains 'Order confirmed'". You write something close to natural language, and the platform's cloud infrastructure executes the browser session and evaluates each step. It is a mature, well-funded product with real strengths: web, mobile, and desktop coverage in one place, managed execution across browser and device combinations, and dashboards a QA manager can use without touching a terminal.

What you cannot see is the part relevant to this article. Which model interprets the page, how often it changes versions, and what happens to your screenshots once a run finishes are not questions with a specific, public answer, and any number claiming otherwise should be treated as unverified. What is true by construction is that the browser and the model both live inside the vendor's infrastructure, because that is what "cloud platform" means here. You are buying a verdict, not a set of levers you can pull yourself.

## Inside BrowserBash's local, bring-your-own-model design

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) CLI. Install it, write a plain-English objective, and an AI agent drives a real Chrome step by step to accomplish it. Two things make its shape different from a hosted platform: where the browser session lives, and which model does the reasoning, and neither is fixed.

Execution location is a flag: `--provider local` (your own Chrome, the default), `cdp` (any DevTools Protocol endpoint), or `browserbase`, `lambdatest`, `browserstack` for a managed cloud grid when a suite needs device or browser coverage a laptop cannot give you.

Model choice is independent of that flag entirely. Leave `--model` on its default `auto` and BrowserBash resolves in a fixed order: a locally running Ollama model first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then `OPENROUTER_API_KEY`, with a clear setup error if none of those exist. Or skip the resolution and name a model explicitly:

```bash
# Free, fully local model: nothing leaves this machine
browserbash run "open the staging login page and verify the dashboard heading says 'Welcome back'" \
  --model ollama/qwen3 --headless

# Your own Claude key, for a flow worth paying a few cents to get right
browserbash run "complete the checkout flow and verify the order confirmation text" \
  --model claude-opus-4-8 --headless
```

The two flags never fight each other. You can point `--provider` at a LambdaTest grid for cross-browser coverage while `--model` still resolves to your local Ollama instance or your own Anthropic key, because the model call happens from wherever the `browserbash` process itself runs, your laptop or your CI runner, not from inside the remote browser session. The browser is one network hop; the model is a separate one, and you control both independently.

## What "self-hosted" means when there is no server to stand up

People searching for a testRigor self-hosted alternative often picture a Docker image and a login page. BrowserBash is not that, and it is worth being precise about why. There is no BrowserBash server to run: the CLI is a local process, the browser it drives is your own Chrome, and the model, if you choose Ollama, is a local inference process too. "Self-hosted" here means something more literal than usual: nothing is hosted at all, by anyone, unless you deliberately point `--provider` at a cloud grid or `--model` at a hosted API. No vendor infrastructure stands between your test and your application, which is what most teams actually mean when they ask for a self-hosted option.

## Four combinations, not two

Once execution location and model choice are separate levers, the real comparison space is not "cloud vs local," it is four cells:

- **Cloud browser, vendor's model.** testRigor's default and only mode: one managed system, no levers, nothing for you to run.
- **Local browser, local model.** BrowserBash with Ollama and `--provider local`, its default posture: zero marginal model cost, nothing leaves the machine.
- **Local browser, hosted model.** BrowserBash with `--provider local` and `--model claude-opus-4-8` or an OpenAI/OpenRouter id: the browser stays local, only the reasoning calls travel, only to the vendor you picked.
- **Cloud browser, your model.** BrowserBash with `--provider lambdatest`, `browserbase`, or `browserstack` for coverage, while `--model` still points at whatever you chose.

testRigor occupies exactly one of those cells and cannot move. BrowserBash can occupy any of the four, often within the same test file, by changing a single flag.

## What actually changes when the browser runs on your machine

**Network dependency.** A cloud-executed suite depends on the vendor's infrastructure being reachable and healthy, because the browser and the platform are one system. A local-provider BrowserBash run with a local Ollama model has no external network dependency at all: it behaves the same on a flight, in an air-gapped CI runner, or during a vendor outage, because there is no vendor in the loop to have an outage.

**What leaves the building.** Whatever the browser renders, DOM content, screenshots, page text, has to reach whatever is doing the reasoning. On testRigor's cloud that destination is always the vendor's infrastructure, by design. On BrowserBash it is a per-run choice: it stays inside your machine's process boundary with a local Ollama model, or it goes to Anthropic, OpenAI, or OpenRouter's API only when you deliberately set `--model` or export an API key. It never happens by default, and never silently.

## What actually changes when you pick the model

**Cost becomes a lever, not a black box.** testRigor is priced per seat or per plan, quoted commercially, and the model inference is bundled into that fee with no separate line item you can inspect. BrowserBash's local-model path is a guaranteed $0 in model spend; its hosted-model path is metered per call, on your own key, for exactly the runs where the extra reasoning quality is worth paying for. A `run-all` suite can set `--budget-usd` to hard-stop launching new tests once estimated spend hits a ceiling, something you cannot do to a per-seat contract.

**Reasoning quality becomes tunable per flow.** A trivial "does this heading say X" check does not need the same model as a ten-step checkout with conditional branches. With BrowserBash you route easy checks to a free local model and hard ones to a stronger hosted model; `--model-exec` even lets a cheap model handle routine execution turns while a stronger model plans. testRigor gives every check the same model tier, because there is no dial for you to turn.

**The model becomes a named thing in your compliance doc, not a mystery.** If a review needs a sentence stating exactly which model, if any, ever sees production-adjacent data, "we run `ollama/qwen3` locally, nothing leaves the VPC" is a claim you can write and defend. "The vendor's platform handles it" is not.

## The same login check, run three ways

Here is one committable test, `login_test.md`, using testmd v2's deterministic `Verify:` steps (compiled to real checks, not model judgment) with a saved auth profile so you are not re-logging in on every run:

```markdown
---
version: 2
auth: staging_qa
---
# Staging login smoke test

- Open https://staging.example.com/login
- Log in with {{user}} and {{password}}
- Verify the URL contains '/dashboard'
- Verify the text 'Welcome back' is visible
- Verify the 'Sign out' link is visible
```

Save the login once, then run the same file three different ways depending on what the moment calls for:

```bash
# Save the session once (interactive): opens a browser, you log in, press Enter
browserbash auth save staging_qa --url https://staging.example.com/login

# 1. Free local model, local Chrome: the default posture, nothing leaves the laptop
browserbash testmd run login_test.md --auth staging_qa \
  --variables "{\"user\":\"qa@example.com\",\"password\":{\"value\":\"$STAGING_PW\",\"secret\":true}}"

# 2. Escalate to a hosted model for one release-day run you want maximum confidence on
browserbash testmd run login_test.md --auth staging_qa --model claude-opus-4-8 \
  --variables "{\"user\":\"qa@example.com\",\"password\":{\"value\":\"$STAGING_PW\",\"secret\":true}}"

# 3. Same file, on a LambdaTest cloud browser for a Safari/Windows check: model choice unchanged
browserbash testmd run login_test.md --auth staging_qa --provider lambdatest \
  --variables "{\"user\":\"qa@example.com\",\"password\":{\"value\":\"$STAGING_PW\",\"secret\":true}}"
```

Same test file, same repo, same `Result.md` output each time. What changed was a single flag, not a different product with a different vendor contract behind it.

## The replay cache changes the cost math after the first pass

The cost comparison above actually understates BrowserBash's advantage, because after a run passes once it does not need the model again for the same flow. The replay-first cache records the actions a successful run took and, on the next run, replays them directly against the browser, origin-pinned, with zero model calls, as long as the page has not meaningfully changed. Secrets are never written into the cache in plaintext, either because the objective never contained the literal value to begin with, or because it is re-templatized back to `{{name}}` before saving. Only when a replay misses, because something on the page genuinely changed, does the agent fall back to reasoning about it fresh and re-record. In practice a suite you run on every commit pays the model cost once, then runs close to free until the UI actually changes, a lever with no equivalent on a platform where a model call is bundled into every execution by design.

## When testRigor's cloud is the right call

Be honest about your own team. testRigor is the better fit when your authors are non-technical testers who will never open a terminal, when you want one vendor accountable for web, mobile, and desktop coverage under a single support contract, or when your organization would genuinely rather pay a platform to make the model decision than have an engineer own it. Not wanting to think about model choice is a legitimate preference, and a managed platform is built for exactly that.

## When local, bring-your-own-model wins

BrowserBash is the better fit when a compliance review needs a concrete answer about where data goes and which model touches it, when CI runs often enough that a bundled-in model cost adds up in a way a local or self-selected model does not, or when your team already lives in Git and terminals and would rather own the lever than hand it to a vendor. It is also the natural choice when an AI coding agent, not a human, needs to validate its own UI work: `claude mcp add browserbash` gives Claude Code or another MCP-capable agent a real verification step it can run and read structured NDJSON output from, on whatever model you configured. See the [features page](https://browserbash.com/features) for the full list of engines, providers, and flags.

## FAQ

### Is there a self-hosted alternative to testRigor?

BrowserBash is the closest thing to a self-hosted testRigor alternative, though the framing differs slightly: there is no server to install, because the CLI, the browser, and, with Ollama, the model all run as local processes on your own machine. Install it with `npm install -g browserbash-cli` and nothing is hosted anywhere unless you deliberately point it at a cloud provider or a hosted model API.

### Can BrowserBash run with zero cloud dependency at all?

Yes. Use `--provider local` (the default) with a locally installed Ollama model, and the entire run, browser, agent, and model, executes on your machine with no outbound calls required. The optional cloud dashboard is strictly opt-in through `browserbash connect` and `--upload`.

### Do I have to manage a GPU to bring my own model?

No, though it helps for larger local models. Start with a modest local Ollama model for simple checks, or skip local inference and point `--model` at your own Claude, OpenAI, or OpenRouter key for anything more demanding. The honest caveat: very small local models, roughly 8B parameters and under, can lose the thread on long, multi-step flows like a full checkout, so match the model to the flow.

### Can I use a cloud browser grid and still choose my own model?

Yes. `--provider` and `--model` are independent flags. Run on `browserbase`, `lambdatest`, or `browserstack` for device and browser coverage while `--model` still points at your local Ollama instance or your own hosted key, because the model call originates from wherever the `browserbash` process runs, not from inside the remote browser session.

### How does the cost actually compare to testRigor's pricing?

testRigor is priced per seat or per plan, quoted commercially, with model inference bundled into that fee. BrowserBash's model cost is either $0 on a local Ollama model or metered per call on your own key, and the replay cache further reduces model calls to near zero after a flow's first successful run. There is no seat count either way: a team of two and a team of fifty pay the same for the CLI itself, which is free.
