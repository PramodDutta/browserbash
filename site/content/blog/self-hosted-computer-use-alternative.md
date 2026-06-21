---
title: A self-hosted alternative to computer use
description: "Self-hosted computer use for web tasks: run a local, free, deterministic AI browser agent on your own Chrome instead of paying for screenshot loops."
date: 2026-01-26
category: agents
---

If you have wired anything on top of Anthropic's Computer Use, you have probably had the same thought I did: this is brilliant, and it is also more machine than my task needs. Most of what teams point Computer Use at is a *web* task — log in, fill a form, walk a checkout, scrape a dashboard — and for those, a self-hosted computer use setup that runs a local model against the page's actual DOM is cheaper, faster, and far more deterministic than a frontier model squinting at screenshots and guessing pixel coordinates. This guide is for engineers who want to keep the "describe the task in plain English, let an agent do it" ergonomics without the cloud bill, the data exposure, or the pixel brittleness.

I will be honest about the boundary up front, because the term "computer use" carries a promise that a browser tool cannot keep. Computer Use controls a whole *computer* — native apps, installers, the file system, anything with a screen. A browser agent controls a *browser*. If your job genuinely lives outside the browser, the self-hosted options in this article are not your answer, and I will say so plainly in the decision section. But if your job lives in a browser, which most automation does, you can self-host the whole thing on your own hardware for a $0 model bill. I work on BrowserBash, so treat the BrowserBash section as the vendor talking; I have kept the rest grounded in what is publicly known as of early 2026, and I flag where competitor facts are not public rather than inventing them.

## What "computer use" actually means, and why it is hard to self-host

Computer Use is a model capability Anthropic exposes through the Claude API. As of early 2026 it runs through a beta tool header (`computer-use-2025-11-24`) against supported Claude 4.x models. You run an agent loop: capture a screenshot of a virtual display, send the image plus your instruction to the model, and the model replies with actions like `left_click(x, y)`, `type("...")`, `key("Return")`, or "take another screenshot." The loop repeats until the task finishes or you stop it. It is vision-first and coordinate-based; the model reasons about pixels, not page structure. Anthropic trained the model to count pixels from reference points to place the cursor, which is genuinely clever engineering.

That design buys generality. The same loop can drive a spreadsheet app, a native installer, a legacy enterprise client, or a browser, because everything is "just a screen." For real cross-application desktop work, that breadth is the entire point.

The trouble starts when you want to *self-host* it, and there are two separate questions hiding in that word.

The first is whether you can self-host the **model**. With Anthropic Computer Use, you cannot. The capability is a hosted, proprietary model behind an API; there is no weights download, so every turn ships a screenshot to Anthropic and bills you for it. Computer use follows standard tool-use token pricing, and a long multi-step web flow is many turns of image-in, tokens-out. For a frontier model like Claude Opus 4.x at roughly $5 input / $25 output per million tokens as of 2026, screenshots add up fast.

The second is whether you can self-host the **agent loop and the browser**. That part you can run anywhere. And for web tasks specifically, doing so unlocks a much cheaper substitution: swap the proprietary vision model for a local open-weight model, and swap pixel-guessing for reading the DOM. That is the move this whole article is about.

## Self-hosting the model versus self-hosting the loop

It is worth separating these cleanly, because the open-source projects in this space sit in different boxes and people conflate them constantly.

Some open-source frameworks reproduce the *OS-level* computer-use idea so you can run the harness yourself. Self-Operating Computer is a framework that lets a multimodal model drive your actual screen with the same mouse and keyboard a human uses; it supports several models (GPT-4o-class, Gemini Vision, Claude, and local vision models) and runs on macOS, Windows, and Linux with an X server. Open Interpreter's computer-use capabilities similarly let a vision model navigate GUIs that lack APIs, crossing the boundary between code, web, and desktop. These give you a self-hosted *loop*, but they still lean on a capable vision model, and the strongest of those are hosted and proprietary. You can point them at a local vision model, but small local vision models are weak at precise pixel grounding today, so you trade cost for reliability.

The other box is **browser-scoped** agents. Instead of screenshots and coordinates, they read the page's accessibility tree and DOM and act on elements directly. Because the hard "where is the button" problem is solved by structure rather than vision, you can run them on a *much* smaller model, including a local one, and still get reliable clicks. browser-use (Python), Stagehand (TypeScript), and Skyvern (a self-hostable platform) live here, and so does BrowserBash. This box is where genuinely free, fully local, deterministic self-hosted computer use for web tasks becomes practical, because a 70B-class local model reading a DOM is a very different proposition from an 8B vision model counting pixels.

The honest framing: you cannot self-host Anthropic's exact model. But for web tasks you usually do not need to. You need the *outcome* — an agent that takes a plain-English objective and drives a browser — and that outcome is fully self-hostable on open weights.

## Why DOM-based beats pixel-based for deterministic web tasks

"Deterministic" is doing a lot of work in this article's angle, so let me be precise about what it means and does not mean. No LLM-driven agent is bit-for-bit deterministic; sampling and model nondeterminism are real. What changes between approaches is the *variance*, and the source of that variance.

A pixel-coordinate agent re-derives the world from an image every turn. A layout shift, a different viewport, a DPI change, a moved button, a slow-loading image that nudges everything down ten pixels — any of these can throw off the coordinate math and send a click into empty space. The same task on two machines with different screen scaling can behave differently. You are stacking model nondeterminism on top of visual-grounding nondeterminism.

A DOM-based agent asks the page what is there. "The login button" resolves through the accessibility tree and element semantics, not a pixel offset, so it survives layout shifts, viewport changes, and DPI scaling that would break a coordinate-based run. You still have model nondeterminism in *which* action the agent chooses, but you have removed an entire independent source of flakiness. For CI, where you want a check to pass or fail for the right reason rather than because a banner pushed the layout, that reduction is the difference between a green pipeline and a babysitting job.

DOM-based also tends to be faster and cheaper per step, because a structured page representation is smaller and more legible to the model than a full screenshot, and you are not paying frontier-vision rates to OCR your own UI. Speed and cost are not the headline here, but they ride along with the determinism win.

## A self-hosted, browser-scoped alternative: BrowserBash

Here is the vendor section, stated plainly. BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, write a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — then returns a verdict plus structured values. It is browser-scoped on purpose. It does not control your desktop, and it will not pretend to. What it gives you is the self-hostable, local, deterministic-leaning half of the computer-use idea, packaged as a command you can run today.

Three properties make it a natural landing spot if you came to self-hosted computer use from the web-task direction.

### Ollama-first, so the model bill is $0 and nothing leaves your machine

This is the sharpest contrast with hosted Computer Use. BrowserBash defaults to free local models through Ollama — no API keys, no network egress of your page contents. It resolves the model in order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, with OpenRouter and Anthropic also supported. So you can run a flow entirely on local weights for a guaranteed $0 model bill and full data locality, then point the same objective at Claude with your own key when a task is genuinely hard. For a privacy-sensitive flow that Computer Use would force through a hosted API, running on your own hardware is the whole reason to read an article like this.

The honest caveat, because skipping it would be dishonest: very small local models, roughly 8B and under, get flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. A fifteen-step branchy checkout on a tiny model will need babysitting. This is the same model-quality reality that governs browser-use, Stagehand, and Skyvern; output is only as good as the model you feed in.

```bash
# Fully local, self-hosted run on your own Chrome via Ollama — $0, no egress
browserbash run "Open the login page, sign in as standard_user, and \
  confirm the dashboard shows 'Welcome back'" --headless
```

### A real CI contract, not a primitive you have to wrap

Computer Use is a capability, not a product: no built-in verdict, no exit code, no committable test, no session video unless you build it. BrowserBash ships the runner layer that the model gives you raw. Pass `--agent` and it emits NDJSON — one JSON event per line on stdout, no prose to parse — and the exit codes are a contract: `0` passed, `1` failed, `2` error, `3` timeout. That is the missing piece when you try to put any agent into a pipeline.

```bash
# Machine-readable run for CI or an orchestrating agent
browserbash run "Search for 'wireless mouse' and confirm at least 5 results" \
  --agent --headless
echo "exit code: $?"   # 0 pass, 1 fail, 2 error, 3 timeout
```

Under the hood it ships two engines, switched with a flag. The default is `stagehand` (MIT, by Browserbase), the DOM-aware automation discussed above. The other is `builtin`, an in-repo Anthropic tool-use loop. If you came from Computer Use because you liked the Claude-driving-the-browser model, the builtin engine gives you that loop in a finished tool, with a Playwright trace captured per run.

### Committable tests, recordings, and a one-flag browser location

You can turn an objective into a committed `*_test.md` file where each list item is a step, template it with `{{variables}}`, and mark secrets so they render as `*****` in every log line. Your QA team reviews a test in a pull request like any other diff, and it runs the same locally and in CI.

```bash
# login_test.md is a committed file; the secret is masked in all logs
browserbash testmd run ./login_test.md \
  --var username=standard_user \
  --secret password=correct-horse-battery-staple
```

The `--record` flag captures a `.webm` session video plus a screenshot on any engine (and on the builtin engine, that Playwright trace), so you get an audit artifact without building a recorder. And `--provider` decides where the browser runs: `local` (default, your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, or `browserstack`. A flow you wrote and self-hosted locally on a free model can fan out to a cloud grid for cross-browser coverage without a rewrite. No account is needed to run anything; the cloud dashboard is strictly opt-in, and there is a fully local `browserbash dashboard` if you want the UI without uploading. The [features page](https://browserbash.com/features) and the [learn hub](https://browserbash.com/learn) go deeper.

## Self-hosted computer-use options compared

Here is the at-a-glance map before the decision section. I have kept it to what is publicly known as of early 2026; where something is not publicly specified, I say so rather than guess. "Scope" is the most important column, because it is the honest dividing line.

| Tool | Scope | Self-host model | DOM or pixel | Local-model path | CI verdict built in |
|------|-------|-----------------|--------------|------------------|---------------------|
| Anthropic Computer Use | OS-level (whole desktop) | No (hosted, proprietary) | Pixel / vision | No local path | No (you build it) |
| Self-Operating Computer | OS-level (whole desktop) | Loop yes; model varies | Pixel / vision | Possible, weak on small vision models | No |
| Open Interpreter | OS-level + code + web | Loop yes; model varies | Pixel / vision | Possible, model-dependent | No |
| browser-use | Browser only | Loop yes; bring a model | DOM + screenshots | Yes, via any LLM you wire | No (you build it) |
| Skyvern | Browser only | Yes (self-hostable platform) | DOM + vision | Depends on configured model | Workflow runs, not exit codes |
| BrowserBash | Browser only | Yes (local-first, your Chrome) | Engine-dependent (DOM default) | Yes (Ollama-first, $0) | Yes (exit codes 0/1/2/3) |

Read that as a starting map, not a verdict. The OS-level tools win where the task is not a browser task; the browser-scoped tools win where it is. None of them is strictly better than the others.

## How the substitution looks on a real web task

Concretely, picture a recurring check: log into a billing portal, confirm this month's invoice total matches an expected value, and flag it if not. On Computer Use you stand up the reference agent container, it screenshots the portal, the model reasons over pixels to find the login fields and the invoice cell, and you write your own success check on top. Every run ships images to a hosted frontier model and bills accordingly. It works, and it costs real money per run, and a portal redesign that moves the invoice cell forces the model to re-find everything visually.

Self-hosted and browser-scoped, the same task is a single objective string against your own Chrome, resolved through the DOM. The model can be a local Qwen3 or Llama 3.3 70B-class model, so the run is free and your invoice data never leaves the building. The verdict is an exit code, so "did it pass" is `$?` rather than custom parsing. And because element resolution is structural, a layout tweak that would derail a coordinate run is usually a non-event.

```bash
# Self-hosted recurring check: local model, your browser, committed test, masked secret
browserbash testmd run ./invoice_check_test.md \
  --var expected_total="$EXPECTED_TOTAL" \
  --secret portal_password="$PORTAL_PASSWORD" \
  --record
```

That is the practical shape of the trade: you give up genuine desktop generality, which this task never needed, and you gain locality, cost, and a CI contract. If your task did need the desktop — say it also has to rename a downloaded PDF in Finder and drop it into a native accounting app — then you are back in OS-level territory and a browser tool is the wrong choice. Be honest with yourself about which world your task lives in before you pick.

## When to choose each, honestly

Let me be genuinely useful here, including against my own tool. The first question is not "which tool," it is "is this a browser task or a computer task." Get that right and the rest is easy.

**Keep Anthropic Computer Use** when you need real cross-application desktop control and you are fine with a hosted, proprietary model. Native apps, installers, non-browser software, workflows that span a browser and the file system and a desktop client — this is the job the pixel-based, full-desktop approach is built for, and no browser-scoped tool replaces it. The cost is that you cannot self-host the model and your screens leave your machine.

**Choose Self-Operating Computer or Open Interpreter** when you want OS-level, self-hosted *loops* and you are willing to own reliability. If you must run the desktop-control harness on your own infrastructure and you can supply a capable vision model — accepting that small local vision models are weak at pixel grounding today — these give you the self-hosted version of the computer-use idea. They are the right answer when the task is desktop-wide and self-hosting the harness is non-negotiable. Pricing for any managed offerings and exact model defaults are best checked on their own pages rather than assumed.

**Choose browser-use** when you are building a Python application and want an autonomous, DOM-aware browser agent as a component you fully control. It self-hosts cleanly, takes any model you wire in including local ones, and is excellent when the browser automation is *part of a larger Python system* rather than the deliverable. You own the loop, retries, and CI glue.

**Choose Skyvern** when you have recurring business workflows across many similar sites and want a self-hostable platform with a UI and workflow definitions, especially under strict data-residency rules. It is the most product-like option for operations-style automation. Note the license terms before embedding it in closed-source software, and check current model defaults on their site.

**Choose BrowserBash** when the task is a browser task, you want to *run* it from a terminal or CI today without building a harness, you want the model bill at $0 on local weights with nothing leaving your machine, and you want committable tests a QA team can review. It is the better fit when the deliverable is the automation itself — a deploy gate, a nightly check, a scriptable job — and you would rather not assemble exit codes, NDJSON, recording, and a cloud-grid switch by hand. If what you actually wanted from Computer Use was "an agent drives a browser and tells me pass or fail," the [tutorials](https://browserbash.com/tutorials) walk the shortest path. It is the wrong tool the moment the task leaves the browser.

## A realistic migration path off hosted computer use

If you have a working Computer Use script for a web task and want to bring it in-house, the migration is usually smaller than you fear, because the hard part — describing the task — is already done.

Start by lifting your objective verbatim. The instruction you fed Computer Use ("log in, open the invoice, confirm the total, flag mismatches") is the same objective a browser-scoped agent takes. You are not rewriting logic into selectors; staying in natural language is the entire point.

Next, pick the model deliberately instead of reflexively. Computer Use forced a frontier model on every turn. A DOM-aware run is far lighter, so try a local Qwen3 or Llama 3.3 70B-class model first and only reach for Claude or a hosted OpenRouter model when a flow is long, branchy, or genuinely hard. This is where the cost difference shows up: many flows that cost real money on Computer Use cost nothing self-hosted.

Then wire the verdict and commit the test. With an exit-code contract, "did it pass" is `$?`, and the NDJSON stream hands an orchestrating agent structured events instead of prose to scrape. Turn the objective into a `*_test.md` file with `{{variables}}` and secret masking so it lives in your repo, gets reviewed in pull requests, and runs identically locally and in CI. At that point the automation is a versioned, self-hosted artifact rather than a hosted one-off. See it on a real flow in the [case study](https://browserbash.com/case-study), or browse more comparisons on the [blog](https://browserbash.com/blog).

## FAQ

### Can you self-host Anthropic's computer use model?

No. As of 2026 Anthropic's Computer Use is a hosted, proprietary capability behind the Claude API, with no downloadable weights, so the model itself cannot run on your own hardware. You can self-host an *agent loop* with open-source frameworks like Self-Operating Computer or Open Interpreter, but the strongest vision models they target are still hosted. For web tasks specifically, a DOM-based browser agent on a local open-weight model is the practical way to get a fully self-hosted, $0 result.

### Is a local computer-use agent actually free?

The model bill can be genuinely $0 if you run a local open-weight model through something like Ollama, since nothing is sent to a paid API and nothing leaves your machine. You still pay for your own hardware and electricity, and capable models in the 70B class want a decent GPU or a fast Apple Silicon machine to run comfortably. Tiny models are free too but get unreliable on long multi-step tasks, so "free and reliable" usually points at a mid-size local model.

### Why is DOM-based automation more deterministic than screenshots?

A pixel-coordinate agent re-derives the page from an image every turn, so layout shifts, viewport changes, and DPI scaling can move a target and send a click into the wrong place. A DOM-based agent resolves elements through the page's structure and accessibility tree, which survives those visual changes and removes a whole independent source of flakiness. No LLM agent is perfectly deterministic, but cutting visual-grounding variance makes CI runs pass or fail for the right reasons.

### Is BrowserBash a full computer-use replacement?

No, and it does not claim to be. BrowserBash is browser-scoped: it drives a real Chrome or Chromium browser and does not control native desktop apps, the file system, or anything outside the browser. For true OS-level automation you want a general computer-use model or an RPA tool. For tasks that live in a browser, BrowserBash is the cheaper, faster, more deterministic, self-hostable option.

Ready to keep your web automation local and free? Install it and point it at your own Chrome:

```bash
npm install -g browserbash-cli
```

An account is optional — everything runs locally out of the box. If you want the opt-in cloud dashboard later, sign up at https://browserbash.com/sign-up.
