---
title: Get a Slack Alert the Moment a Production Flow Breaks
description: "Set up slack alerts production flow monitoring with BrowserBash: a login test, a webhook, and pass/fail pings the moment something breaks or recovers."
date: 2026-08-05
category: use-case
---

Nobody finds out their login form is broken from a dashboard. They find out from a support ticket, or a founder tweet, or a Slack message that says "hey is signup down for anyone else." By the time a human notices, the flow has usually been broken for twenty minutes, an hour, sometimes overnight. Slack alerts for production flow monitoring close that gap by putting a real browser in the loop on a timer, so the first one to know your login is broken is a bot, not a customer. This article walks through the whole setup: writing the login test, wiring `browserbash monitor` to a Slack incoming webhook, and what the alert actually looks like on both sides, the break and the recovery.

The pitch is simple. You already write plain-English browser checks with BrowserBash. Point one of those checks at a `--notify` webhook and an interval, and you've turned a one-off test into a synthetic monitor that pages your team the moment a critical flow stops working, with zero extra infrastructure.

## Why a browser check beats a status-code ping

Most teams start uptime monitoring with an HTTP ping: hit `/health` or the homepage every few minutes, alert if it's not a 200. That catches the server being down. It does not catch the server being up while the thing that matters is broken.

A login page that renders fine but throws a JavaScript error on submit still returns 200 for the page load. A checkout flow where the "Place Order" button silently stops firing after a frontend deploy still returns 200 for every asset it loads. A signup form where the email field lost its `name` attribute in a refactor and now submits nothing still returns 200. Status-code monitoring answers "is the server alive." It cannot answer "can a user actually log in," and that second question is the one that turns into support tickets.

The fix is to monitor the flow the way a user experiences it: open a browser, type into fields, click the real button, wait for the real result. That's expensive to build with a traditional test framework, because someone has to write and maintain selectors for a script that runs unattended forever, silently breaking every time a class name changes. It's a much smaller lift with a natural-language runner, because the check is written as an objective, not a script, and survives the kind of markup changes that would otherwise page you for no reason.

### The gap between "it built" and "it works"

CI already tells you the build didn't break. Deploy pipelines already tell you the container started. Neither one tells you that a real user, five minutes after your last deploy, can still finish the flow that makes you money. That's the specific gap production flow monitoring with real browser interaction is meant to fill, and it's a gap most teams leave open because building it themselves means owning a small test-automation project on top of their actual product.

## What you need before you start

Three things, all free:

1. **BrowserBash installed.** `npm install -g browserbash-cli`. It needs Node 18 through 22 and a Chrome or Chromium binary for the default local provider.
2. **A Slack incoming webhook URL.** Create one from your Slack workspace (Apps -> Incoming Webhooks, or a custom Slack app with the `incoming-webhook` scope), pick the channel it posts to, and copy the `https://hooks.slack.com/services/...` URL. Treat it like a secret: anyone with that URL can post to your channel.
3. **A login flow to check.** For this walkthrough it's a standard email-and-password login that lands on a dashboard, but the same pattern works for checkout, search, a signup form, or any flow where "broken" means lost revenue.

You do not need an API key to run this. BrowserBash resolves models automatically: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If you already have a local model pulled, the whole monitor loop can run without a single dollar leaving your machine.

## Step one: write the login test as a testmd file

Start by writing the check as a plain-English test file, not as a one-off `browserbash run` command. A saved file is what `monitor` will re-run on every interval, and it's what you'll commit next to your other tests so the whole team can see what's being watched.

Create `.browserbash/tests/login_flow_test.md`:

```markdown
# Production login smoke check

- Go to https://app.example.com/login
- Type {{TEST_EMAIL}} into the email field
- Type {{TEST_PASSWORD}} into the password field
- Click the "Log in" button
- Wait for the dashboard to load
- Verify 'Welcome back' text visible
- Verify URL contains "/dashboard"
```

Two things worth calling out here. First, the credentials are templated as `{{TEST_EMAIL}}` and `{{TEST_PASSWORD}}`, never hardcoded. BrowserBash masks secret-typed variables as `*****` in every log line, and the variables are passed as a map rather than pre-substituted into the objective, so a leaked log or a leaked webhook payload never leaks the password itself. Set them once in `.browserbash/variables/default.json` or pass them as environment variables at run time.

Second, notice the last two lines start with `Verify`. Those aren't agent-judged opinions, they compile to real Playwright assertions: "text visible" and "URL contains" are both in BrowserBash's deterministic Verify grammar. That matters a lot for a monitor that's going to run unattended for months. A judged check ("does this page look like a successful login?") depends on a model's read of a screenshot every single run. A deterministic Verify step is a real DOM and URL check with no room for the model to be generous on a bad day. When it fails, `run_end.assertions` carries the expected value versus what the page actually had, so your Slack alert can say exactly what broke instead of a vague "looks wrong."

Run it once by hand to confirm it passes before you put it on a schedule:

```bash
browserbash testmd run .browserbash/tests/login_flow_test.md
```

If that comes back green, you're ready to automate it.

## Step two: point browserbash monitor at your Slack webhook

This is the entire monitoring setup, one command:

```bash
browserbash monitor .browserbash/tests/login_flow_test.md \
  --every 10m \
  --notify https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX
```

`--every 10m` runs the check on a ten-minute interval. Pick a cadence that matches how much downtime you're willing to tolerate before you find out about it: a five-minute interval for a checkout flow on launch day, thirty minutes for something lower-stakes. `--notify` takes the webhook URL and, because BrowserBash recognizes a Slack incoming-webhook URL by its shape, formats the payload as a proper Slack message automatically. Point `--notify` at any other URL and you get the raw JSON `run_end` payload instead, so the same flag works for a generic webhook receiver, a PagerDuty integration, or your own alerting service if Slack isn't where this particular team lives.

The behavior that makes this usable long-term is that monitor mode only alerts on a state change. It does not ping your channel every ten minutes to say "still fine." It runs quietly in the background and stays silent through every green run. The moment a run flips from pass to fail, you get one alert. The moment a later run flips back from fail to pass, you get one recovery alert. Nothing in between. That distinction is the difference between a monitor your team keeps and a monitor your team mutes within a week. A channel that pings every ten minutes regardless of outcome trains everyone to ignore it, and once a channel is ignored the alert that actually matters gets ignored right along with it.

### Running it as a long-lived process

`browserbash monitor` is a foreground process, so in production you want a process supervisor keeping it alive, not a terminal tab. A minimal systemd unit:

```bash
[Unit]
Description=BrowserBash production login monitor
After=network.target

[Service]
ExecStart=/usr/local/bin/browserbash monitor /opt/tests/login_flow_test.md --every 10m --notify https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX
Restart=always
Environment=TEST_EMAIL=monitor@example.com
Environment=TEST_PASSWORD=xxxxxxxxxx

[Install]
WantedBy=multi-user.target
```

The same pattern works as a long-running container in whatever orchestrator you already run, or as a background process under `pm2` on a small VPS if you don't want to stand up anything heavier just to keep one monitor alive. What you're running is a single always-on process, not a cron job, since `--every` handles the interval internally and a hard restart from `Restart=always` picks the loop back up if the box reboots.

### Why the replay cache matters for a monitor specifically

An always-on check that fires every ten minutes, forever, would normally mean a model call every ten minutes, forever, which adds up on a hosted model and adds latency even on a local one. BrowserBash's replay cache changes that math: the first green run records the exact sequence of actions it took, and every identical subsequent run replays those recorded actions directly against the DOM instead of asking a model to re-decide what to click. The model only steps back in when the page has actually changed, at which point it heals the flow and records a fresh journal for next time. For a monitor, that means the steady-state cost of running the same login check every ten minutes for a month is close to free, both in tokens and in wall-clock time, and the check that fires is still exercising a real browser against your real app, not a cached HTTP response.

## What the break alert looks like in Slack

When the login flow actually breaks, here's the shape of what lands in the channel. The exact fields come straight from the `run_end` NDJSON event, formatted for Slack:

```
BrowserBash monitor: FAILED
Test: Production login smoke check
Status: fail (was: pass)
Summary: Verify failed: expected URL to contain "/dashboard", got "/login?error=invalid_session"
Assertions: 1 passed, 1 failed
  PASS  'Welcome back' text visible
  FAIL  URL contains "/dashboard" -> expected: contains "/dashboard", actual: "/login?error=invalid_session"
Duration: 4.2s
Time: 2026-08-05 14:32:07 UTC
```

That's not a vague "something's wrong," it's a specific, evidence-backed failure: the "Welcome back" text check still passed, but the URL check failed because the app bounced back to `/login` with an `invalid_session` query param. Whoever's on call reads that and immediately knows to check session handling, not the login form's HTML. That specificity is the entire value of deterministic Verify assertions inside a monitor: a judged check might have just said "login looks broken," and someone would've had to go reproduce it by hand before knowing where to look.

If you're running with `--record`, add that flag to the monitor command and the failed run also captures a screenshot (and on the builtin engine, a full Playwright trace) that you can pull up alongside the alert to see exactly what the page looked like at the moment of failure, without waiting for someone to reproduce it.

## What the recovery alert looks like

Ten minutes later, after someone's rolled back the bad deploy or fixed the session bug, the next scheduled run passes again, and Slack gets exactly one more message:

```
BrowserBash monitor: RECOVERED
Test: Production login smoke check
Status: pass (was: fail)
Summary: All steps completed successfully
Assertions: 2 passed, 0 failed
Duration: 3.8s
Time: 2026-08-05 14:52:11 UTC
Downtime: approx 20m (2 failed runs)
```

That recovery message matters more than it looks like it should. Without it, "did we fix it" becomes a question someone has to answer by manually re-running the check or waiting to see if the alerts stop. With it, the channel has a closed loop: broke at 14:32, fixed by 14:52, twenty minutes of downtime, confirmed by an actual browser completing the flow, not by someone's guess that the fix probably worked. That closed loop is also your incident timeline, sitting in Slack, with no extra logging work.

## Handling flaky failures without crying wolf

Every monitoring system built on a real browser eventually hits a genuinely flaky run: a slow CDN edge, a transient network blip, a third-party script that took an extra second to load. If your interval is aggressive (say, every two minutes) and your app has any real-world flakiness, you can get a false "flip to fail" that self-corrects on the very next run.

Two practical mitigations. First, use a longer interval for less critical flows and a shorter one only where downtime is genuinely expensive, so you're not paying the flake tax on things that don't need five-minute granularity. Second, if you're building this into a broader run-all suite rather than a single monitor, BrowserBash's memory-aware orchestrator already tracks flaky flags from run history, a useful signal to review even outside monitor mode when deciding which checks deserve monitoring at all versus which ones are noisy by nature and better suited to a wider tolerance.

What you shouldn't do is loosen the Verify assertions to make flakiness go away. If "Welcome back" text visible is occasionally slow to render, the fix is a longer wait step in the test, not a vaguer assertion. Deterministic checks are only worth having if you trust a fail to mean something actually failed.

## Extending this to more than login

Login is the flow every team starts with because it gates everything else, but the same three-step pattern (write the objective, wrap it in Verify assertions, point monitor at a webhook) applies to any flow where downtime costs you money or trust:

- **Checkout**: add an item to cart, go to checkout, verify the total matches expected math, verify the "Place Order" button is present and enabled.
- **Search**: run a known query, verify at least one result renders, verify the result count is greater than zero.
- **Signup**: fill the form with a disposable test address, submit, verify the confirmation screen or email-sent message appears.
- **A paid API-gated feature**: if you're on testmd v2 (`version: 2` frontmatter), you can seed state with a deterministic API step, like a `POST` to create a test account, then verify the UI reflects it, all in one file, all without a model call for the setup half.

An example testmd v2 file for a signup-plus-verification flow looks like this:

```markdown
---
version: 2
---
# Seed and verify account creation

- POST https://api.example.com/test/accounts with body {"email": "{{unique.email}}"}
- Expect status 201, store $.id as 'account_id'
- Go to https://app.example.com/login
- Verify 'account_id' stored value equals {{account_id}}
```

Each of those is its own testmd file and its own `browserbash monitor` process, or you can point `run-all` at a `.browserbash/tests` folder and run several as a scheduled suite through your own CI cron if you'd rather centralize the scheduling outside of long-running monitor processes. Either way, the alerting shape is identical: silence while things work, one specific message when they don't, one closing message when they're fixed.

## What this setup doesn't cover

Worth being straight about the edges here, since overselling a monitoring setup is how teams end up trusting a gap they don't know exists.

A ten-minute interval means up to ten minutes of undetected downtime by design, this is synthetic monitoring on a schedule, not real-user monitoring that would catch every affected session instantly. If you need second-by-second detection across your actual user base, you want a real-user monitoring product alongside this, not instead of it. BrowserBash's monitor mode is best understood as a cheap, honest backstop: it tells you the core flow is broken well before support tickets pile up, not the instant the first user hits the bug.

It's also worth being honest about model reliability if your flow is judged rather than Verify-driven, or if you're running it on a very small local model. Models under about 8B parameters can be flaky on longer multi-step objectives, which is a bad trait to introduce into something that's supposed to be your source of truth for "is this broken." For a monitor specifically, lean on Verify assertions wherever the check can be phrased that way (URL, text, element counts, stored values), since those bypass model judgment entirely, and reserve agent-judged Verify lines for the parts of a flow that genuinely need visual or semantic interpretation. If you're running a hosted model instead of local, the replay cache keeps steady-state cost low, but the first run after any real page change still costs a model call to heal the flow, so budget for that.

None of that makes the setup less worth having. It just means the honest framing is "we'll know within ten minutes instead of finding out from a customer," not "we'll never have downtime again."

## Putting it together

The full loop, start to finish, is four things: a plain-English test file with Verify assertions for the parts that matter, a Slack incoming webhook, one `browserbash monitor` command with `--every` and `--notify`, and a process supervisor keeping it alive. There's no dashboard to build, no alerting service to integrate, no cron job juggling state between runs to figure out if this is a new failure or a repeat. The state-change logic (only alert on pass-to-fail and fail-to-pass) is built into monitor mode itself, and the replay cache keeps a check running every ten minutes for months from becoming a meaningful bill.

If you want to see the full command surface before you commit to a monitor running in production, the [learn section](https://browserbash.com/learn) walks through testmd syntax and Verify assertions in more depth, and the [tutorials](https://browserbash.com/tutorials) page has more end-to-end examples beyond login. For teams weighing this against a hosted synthetic-monitoring product, the [pricing](https://browserbash.com/pricing) page is worth a look since the CLI, the monitor loop, and the local dashboard are free forever, monetization only comes in on hosted retention and team features you don't need to run this yourself. You can also browse [case studies](https://browserbash.com/case-study) for how other teams have wired checks like this one into their release process, and the full CLI reference lives on [npm](https://www.npmjs.com/package/browserbash-cli) and [GitHub](https://github.com/PramodDutta/browserbash) if you'd rather read the source than take this article's word for it.

## FAQ

### How is browserbash monitor different from a regular uptime checker like UptimeRobot or Pingdom?

Traditional uptime checkers ping a URL and check the HTTP status code, which confirms the server responded but says nothing about whether the page actually works. BrowserBash monitor drives a real browser through your flow: it types into fields, clicks buttons, and waits for real page state, so it catches a broken login form or checkout button even when every underlying request still returns 200.

### Will I get spammed with Slack messages every time the monitor runs?

No. Monitor mode only sends a Slack message when the result changes from the previous run, pass to fail or fail to pass. A check that stays green for a month sends zero messages during that stretch, and you get exactly one alert when it breaks and one when it recovers.

### Do I need an Anthropic or OpenAI API key to run a Slack-connected monitor?

Not necessarily. BrowserBash resolves models in order: local Ollama first, then ANTHROPIC_API_KEY, then OPENAI_API_KEY, then OpenRouter. If you have a local model available, the entire monitor loop, including the Slack notification, can run without any hosted API key or per-run cost.

### What happens if my Slack webhook URL is wrong or the request fails?

The `browserbash monitor` process keeps running and keeps checking your flow on schedule regardless of whether the notification delivery succeeds, a bad webhook URL affects only the alert delivery, not the underlying check. It's worth testing the webhook once with a deliberately broken test step before relying on it, so you confirm the Slack message arrives before you need it for a real incident.

Once the webhook is talking to Slack and the test is passing on its own, installing the whole thing is `npm install -g browserbash-cli`. You can start from there without creating an account: an account only becomes useful later if you want the optional hosted dashboard, which you can set up any time at [browserbash.com/sign-up](https://browserbash.com/sign-up).
