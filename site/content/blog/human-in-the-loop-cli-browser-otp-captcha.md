---
title: "Human-in-the-Loop CLI Browser Automation: Handling OTP and CAPTCHA"
description: "Human in the loop browser automation captcha otp from the terminal: how an AI agent pauses for a one-time code or challenge, then resumes the run cleanly."
date: 2026-06-09
category: guide
---

Every serious login or checkout flow eventually hits a wall that was built to stop a robot. A one-time passcode lands on a phone the script can't read. A CAPTCHA appears under load and waits for a click no headless loop can fake. This is where human in the loop browser automation captcha otp handling stops being a nice-to-have and becomes the difference between a run that finishes and one that hangs forever. The honest answer to "how does an AI agent get past an SMS code?" is that it shouldn't try — it should pause, hand control to a person for a few seconds, and pick up exactly where it left off. That is the pattern this guide is about, built around [BrowserBash](https://browserbash.com), a free, open-source CLI that drives a real Chrome browser from plain-English objectives.

The instinct of a lot of automation engineers is to defeat these walls — pipe the OTP out of a Twilio webhook, wire in a paid CAPTCHA-solving service, spoof a fingerprint. Sometimes that's the right call. Often it's fragile, expensive, and quietly against the terms of the site you're testing. The alternative is structurally simpler: design the run so a human is *expected* to step in at the one or two moments that genuinely need a human, and design the agent so it waits gracefully instead of failing. The rest of this article walks through how to think about that ask-style flow, where BrowserBash fits, where it honestly doesn't, and how to wire the whole thing into CI without pretending a machine can read a text message.

## Why OTP and CAPTCHA break ordinary automation

A traditional Playwright or Selenium script is a sequence of deterministic steps. It clicks the field it was told about, types the value it was handed, and asserts the result. That model assumes every input is known at authoring time. An OTP violates that assumption by design: the code does not exist until the server generates it, and it arrives on a channel — SMS, an authenticator app, an email inbox — that the browser session has no claim on. So the script reaches the "enter your code" screen with nothing to type, and either times out or fills in garbage.

CAPTCHA breaks automation a different way. It is not a missing value; it is an adversarial test specifically engineered to distinguish a human from a script. Modern challenges look at mouse movement, timing, device fingerprint, and IP reputation before they even show you a puzzle. A behavioral reCAPTCHA v3 score can fail your session silently with no visible widget at all. These systems are a moving target, and the entire industry built around beating them is in a permanent arms race. As a 2026 CAPTCHA landscape review put it bluntly, certain walls — OTPs, behavioral CAPTCHAs, security questions, document uploads — were built to require a real human, and automating around them is both fragile and increasingly detectable.

That framing matters because it changes the goal. You are not trying to make the agent superhuman. You are trying to make it *interruptible*. A good automation for a flow with an OTP or a CAPTCHA is one that knows the difference between "I can do this step" and "this step needs a person," and behaves well in both cases.

## The ask-style flow: pause, hand off, resume

The pattern that's emerged across the agent ecosystem in 2026 is human-in-the-loop, and its shape is consistent no matter which tool you use. The agent runs autonomously until it hits a step it can't or shouldn't complete on its own. At that point it pauses, surfaces the situation to a human, and waits. The human resolves the wall — reads the OTP off their phone and types it, clicks through the image grid, answers the security question — and the agent resumes mid-task with clean state, no restart from step one.

Browserbase ships a [human-in-the-loop template](https://www.browserbase.com/templates/agent-with-human-in-loop) built on Stagehand that does exactly this: when the agent hits something it can't answer, it pauses and asks the human via a custom `askHuman` tool, then picks up where it left off. Cloudflare's Browser Run has its own [human-in-the-loop mode](https://developers.cloudflare.com/browser-run/features/human-in-the-loop/) where a person can take control of a live browser session, handle what the automation cannot, and let the session continue. The vocabulary differs; the choreography is identical.

What makes this work is that the *browser is real and persistent*. The session keeps its cookies, its DOM, its scroll position, its half-filled form. When the human acts, they're acting on the same live page the agent was driving. There's no serialization gap where state gets lost. This is why a headless-only, fire-and-forget architecture struggles with OTP: there's no window for a person to look at and no live session for them to touch.

BrowserBash leans into this by defaulting to your own local Chrome. The `local` provider launches a visible browser on your machine, which means when the run reaches an OTP screen, you are looking at the actual page. You can read the prompt, glance at your phone, and type the code into the field the agent just navigated to. The browser you supervise is the browser the agent drives — there's no remote handoff to coordinate.

## How BrowserBash handles the wait

Here's the part to be precise about, because honesty matters more than marketing. BrowserBash does not ship a magic OTP reader or a bundled CAPTCHA solver, and it never will pretend to. What it gives you is a real browser, a generous timeout, and an objective written in plain English that tells the agent what to do *around* the human step. You compose the ask-style flow yourself out of those primitives.

Concretely, a flow that includes an OTP looks like this. You write an objective that takes the agent up to and through the code-entry screen. You run it with `--headless` off (the default), so the browser is visible. You set a `--timeout` long enough that the agent's wait for the page to settle gives you room to type the code. And because the agent re-reads the live page on every step rather than following a recorded script, when you manually type the OTP and the page advances, the agent sees the new state and continues toward the objective.

```bash
browserbash run "Go to the staging login page, enter the email \
qa@example.com, click Send Code, then wait for the dashboard to \
load and confirm the account name is visible" \
  --timeout 180
```

In practice you watch the visible Chrome window. The agent navigates, fills the email, clicks the button that triggers the code, and reaches the OTP field. You read the code off your phone, type it, and the page moves to the dashboard. The agent, on its next observation, sees the dashboard and closes out the objective as passed. The 180-second timeout is your buffer — it's the window in which a human can act without the run giving up.

For a CAPTCHA, the same shape applies. The objective describes the journey; when a challenge widget appears, you solve it in the live window; the agent continues once the page clears it. You are the loop. BrowserBash is the harness that keeps the browser alive and the agent patient enough to let you close it.

### Recording the handoff for evidence

When a human touches the session, you usually want proof of what happened — for a bug report, a flaky-test triage, or a compliance trail. The `--record` flag captures a screenshot plus a `.webm` session video through bundled ffmpeg, and on the `builtin` engine it also writes a Playwright trace. That video shows the OTP screen, the human typing, and the resumption, all in one artifact you can attach to a ticket.

```bash
browserbash run "Log in to the billing portal as the finance user \
and download the latest invoice PDF" \
  --record --timeout 240
```

Every run is also kept on disk at `~/.browserbash/runs`, with secrets masked and the store capped at the last 200 runs. So even without the video flag, you have a local history of what the agent did and where the human stepped in.

## A markdown test that bakes in the human step

For flows you run repeatedly, retyping a long objective gets old, and you lose the ability to version-control the test. BrowserBash markdown tests solve this. A `*_test.md` file is a committable list where each item is a step, `{{variables}}` are templated in, and any variable you mark as secret is masked as `*****` in every log line. You can write a login test that explicitly includes a manual OTP beat as one of its steps.

```markdown
# Checkout with OTP confirmation

- Go to {{store_url}} and add the Standard Plan to the cart
- Proceed to checkout and enter the email {{email}}
- Enter the card number {{card}} (secret) and complete payment
- When the one-time code screen appears, wait for the code to be
  entered and the order confirmation page to load
- Confirm the order number is shown and capture it
```

Run it with the `testmd` command:

```bash
browserbash testmd run ./checkout_otp_test.md
```

The step that says "wait for the code to be entered" is the human-in-the-loop seam. The agent drives everything around it; you supply the OTP when the visible browser reaches that screen. After the run, BrowserBash writes a human-readable `Result.md` next to the test so you have a clean record of pass/fail and the captured order number — with the card number shown only as `*****`. That secret-masking is not optional decoration; for any checkout flow with a card or a credential, it's the thing that keeps a sensitive value out of your shell history and your CI logs.

If you want to compose larger suites, `@import` lets you pull shared steps (a login fragment, a teardown) into multiple test files so the OTP-aware login lives in one place. The full markdown-test reference is on the [tutorials page](https://browserbash.com/tutorials), and the broader concept library sits under [learn](https://browserbash.com/learn).

## Which model to put behind the agent

The agent is only as good as the model interpreting the page, and this is the single biggest factor in whether your OTP and CAPTCHA flows feel reliable. BrowserBash is Ollama-first: the default model is `auto`, which resolves to a local Ollama install if you have one (free, no keys, nothing leaves your machine), then to `claude-opus-4-8` if you have an `ANTHROPIC_API_KEY`, then to OpenAI's `gpt-4.1` if you have that key instead.

Local-first is genuinely appealing for these flows, because OTP and checkout journeys touch sensitive data, and a local model means that data never leaves your laptop. The `$0` model bill is a bonus. But here's the honest caveat: very small local models, the 8B-and-under class, get flaky on long multi-step objectives. A login-plus-OTP flow is exactly the kind of long, branching task where a tiny model loses the thread — it'll misread which field is the code input, or declare victory before the dashboard loads. The sweet spot for self-hosted is a mid-size model, a Qwen3 or a Llama 3.3 70B-class, which has enough reasoning headroom to stay on task. For the hardest flows — a multi-redirect SSO with a CAPTCHA in the middle — a capable hosted model like Claude is the most reliable choice, and it's worth the per-run cost when a flaky run wastes a human's time.

```bash
# Free and private: pin a capable local model via Ollama
browserbash run "Sign in to the partner portal and reach the \
two-factor code screen" --model ollama/qwen3 --timeout 200

# Maximum reliability for a hard SSO + challenge flow
browserbash run "Complete the SSO login and reach the dashboard" \
  --model claude-opus-4-8 --timeout 300
```

You can also point at OpenRouter models (for example `openrouter/meta-llama/llama-3.3-70b-instruct`) or any Anthropic-compatible gateway via `ANTHROPIC_BASE_URL`. The model choice doesn't change the human-in-the-loop pattern — it changes how often the agent gets the *non-human* steps right on the first try.

## Engines and where the browser runs

Two more knobs matter for these flows. The **engine** decides who interprets your English. The default is `stagehand` (MIT-licensed, from Browserbase), which gives the agent act/extract/observe/agent primitives and self-healing behavior. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright, which is what you get automatically when you target LambdaTest or BrowserStack. For an OTP flow, `stagehand` is a fine default; the `builtin` engine's Playwright trace is a reason to prefer it when you want maximum debugging detail on a handoff.

The **provider** decides where the browser actually runs, and this one interacts directly with the human-in-the-loop question.

| Provider | Where the browser runs | Good fit for OTP/CAPTCHA handoff? |
|---|---|---|
| `local` (default) | Your own Chrome, visible on your machine | Best — you watch and type directly into the live window |
| `cdp` | Any DevTools endpoint via `--cdp-endpoint ws://...` | Works if you can see and reach that browser session |
| `browserbase` | Browserbase cloud (needs API key + project ID) | Possible, but the human handoff happens through their live-view, not your desktop |
| `lambdatest` | LambdaTest grid (auto `builtin` engine) | Better suited to fully automated runs |
| `browserstack` | BrowserStack grid (auto `builtin` engine) | Better suited to fully automated runs |

For a person-in-the-seat OTP flow on your own machine, `local` is the obvious choice and the default — there's nothing to configure. The cloud grids shine for unattended automation; they're a worse fit when the whole point is that a human needs to glance at a screen and type a code. There's a fuller breakdown of providers and engines on the [features page](https://browserbash.com/features).

## When to choose human-in-the-loop vs. fully automated

Not every flow with an OTP needs a person. The decision comes down to how the second factor is delivered and whether you control it.

**Choose the human-in-the-loop, ask-style flow when:**

- The OTP arrives on a channel you can't programmatically read in your test environment — a real SMS to a real phone, an authenticator app, a push notification.
- The CAPTCHA is behavioral or adversarial and you're unwilling to pay a solving service or risk the terms of service.
- The flow is run interactively — a QA engineer validating a release, a one-off data pull, a supervised checkout — where a human is present anyway.
- You're testing the *real* security wall and want to confirm it actually stops automation, not bypass it.

**Lean toward full automation (and accept it has limits) when:**

- The OTP is delivered to a channel your test harness owns — a Mailosaur or test-inbox API, a Twilio number you read via API, a staging bypass code your own team controls. In that case you can feed the code in as a `{{variable}}` and skip the human entirely.
- The environment has a documented test-mode that disables the second factor or accepts a fixed code (many staging environments do).
- You genuinely need unattended, scheduled runs and your security team has signed off on a test bypass.

Be clear-eyed about the third-party option too. Services like CapSolver, 2Captcha, and Browserbase's own CAPTCHA-solving (enabled by default on its cloud sessions, per Browserbase's docs, and which can take up to 30 seconds per challenge) exist and work for many sites. They are the right tool when you're scraping at scale or testing a flow you're authorized to automate end to end. They are the wrong tool when you're validating that a security control works, or when the channel is a genuine SMS that no service can read for you. BrowserBash doesn't bundle a solver because its default posture is local, private, and honest about what a machine can and can't do — but nothing stops you from solving a challenge yourself in the live window, which is the whole point of the human-in-the-loop seam.

## Wiring the handoff into CI and AI coding agents

A human-in-the-loop step seems at odds with CI, which is supposed to run unattended. The reconciliation is to split your suite. The flows that genuinely need a person — the real-SMS OTP, the behavioral CAPTCHA — run interactively or on a release-validation checklist, not in the merge gate. The flows where you control the second factor, or where staging disables it, run fully automated in CI. BrowserBash supports both halves cleanly.

For the automated half, `--agent` mode emits NDJSON — one JSON object per line — which is built for CI and AI coding agents rather than humans reading prose. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the terminal event is a `run_end` with a status of `passed`, `failed`, `error`, or `timeout`. Exit codes map straight to those: 0 passed, 1 failed, 2 error, 3 timeout. A `timeout` exit on an OTP-bearing flow in CI is your signal that the human-in-the-loop seam was reached and nobody was there to fill it — which is exactly the right thing to flag rather than hide.

```bash
browserbash run "Run the test-mode login using the fixed staging \
OTP and confirm the dashboard loads" \
  --agent --timeout 120
```

Because the output is structured, an AI coding agent orchestrating BrowserBash can read the `run_end` status and decide what to do next — retry, escalate to a human, or open a ticket — without parsing English. That's the same reason the NDJSON format exists: machines downstream shouldn't have to guess.

For visibility into either half, `browserbash dashboard` opens a fully local dashboard on `localhost:4477` — no account, nothing uploaded. If you want a shareable record of a specific run, an opt-in cloud dashboard exists: link it once with `browserbash connect --key bb_...`, then add `--upload` to the runs you want to push (free cloud runs are kept 15 days). Without `--upload`, nothing leaves your machine, which is the right default for anything touching an OTP or a card number. Pricing and the cloud tiers are on the [pricing page](https://browserbash.com/pricing), and worked examples live under [case studies](https://browserbash.com/case-study).

## A realistic end-to-end example

Pull it together with a checkout that includes both a card entry (secret) and an OTP confirmation. You run it locally, you watch the visible browser, and you type the code when prompted. The agent does everything else.

```bash
browserbash run "Open shop.example.com, add the Pro subscription \
to the cart, go to checkout, fill the email buyer@example.com, \
enter the test card, place the order, then wait for the SMS code \
screen and confirm the order confirmation page appears" \
  --record --timeout 300
```

The run launches Chrome, walks the cart-to-checkout journey, and pauses naturally at the SMS-code screen because that's where the page is waiting on input it can't generate. You glance at your phone, type the code into the field the agent has already focused for you, and the order confirmation loads. The agent observes the confirmation page and reports the run as passed, with the order number extracted into its structured output. The `--record` video gives you the whole sequence — including your handoff — as a `.webm` you can attach to a release note. The card number never appears in any log because, if you'd run this as a markdown test, you'd have marked it secret.

That's the entire pattern. No solver, no spoofing, no pretending. A real browser, a patient agent, and a human stepping in for the five seconds that actually need a human.

## FAQ

### Can BrowserBash automatically read an OTP from SMS or email?

No, and it doesn't claim to. BrowserBash drives a real browser and waits patiently at the code-entry screen so you can type the OTP yourself in the visible window. If your OTP is delivered to a test inbox or a phone-number API your harness already controls, you can feed the code in as a templated variable and automate it fully — but reading a genuine SMS to a personal phone is a human-in-the-loop step by design.

### How does the agent resume after I solve a CAPTCHA or enter a code?

The agent re-reads the live page on every step instead of following a recorded script. When you solve the challenge or type the code in the same browser window the agent is driving, the page advances, and on its next observation the agent sees the new state and continues toward your objective. Keep the `--timeout` generous enough to give yourself room to act before the run gives up.

### Is human-in-the-loop compatible with CI pipelines?

Yes, if you split the suite. Flows that need a real person run interactively or on a release checklist, while flows where you control the second factor (a staging bypass or a test-inbox API) run unattended in CI. In agent mode, BrowserBash returns a timeout exit code when a human seam is reached and nobody fills it, so an unattended run fails loudly rather than hanging silently.

### Should I use a paid CAPTCHA-solving service instead?

It depends on what you're doing. Solving services like CapSolver or 2Captcha, and the CAPTCHA-solving built into some cloud browser providers, are reasonable when you're authorized to automate a flow end to end at scale. They're the wrong choice when you're validating that a security control actually stops bots, or when the wall is a genuine SMS no service can read. The human-in-the-loop seam lets you solve the challenge yourself, keeping the run local and honest.

Stop fighting the walls that were built for humans, and let a human handle them in the two seconds it takes. Install the CLI and try an ask-style flow on your own login screen today:

```bash
npm install -g browserbash-cli
```

No account needed to run — but if you want the optional cloud dashboard later, [sign up here](https://browserbash.com/sign-up).
