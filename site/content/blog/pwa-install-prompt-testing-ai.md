---
title: Test a PWA Install Prompt and Offline Mode With AI
description: "A practical guide to pwa install prompt testing with an AI agent that drives a real browser, verifies beforeinstallprompt, and checks offline mode."
date: 2026-08-07
category: guide
---

If you ship a progressive web app, two moments decide whether users actually keep it: the install prompt and the first time the app opens without a network. Both are notoriously hard to cover in a normal test suite, which is exactly why pwa install prompt testing gets skipped so often. The `beforeinstallprompt` event fires on Chromium's own schedule, the install UI is partly owned by the operating system, and offline behavior depends on a service worker that may or may not have finished caching. You can automate a lot of this with an AI agent that drives a real Chrome browser, reads the same page state a human would, and returns a deterministic verdict. This guide walks through what is genuinely testable, what is not, and how to wire it up honestly.

## Why PWA install and offline flows resist normal tests

A PWA earns its "installable" badge only when a checklist passes: a served-over-HTTPS origin, a valid web app manifest with the right icons and `display` value, and a registered service worker that handles a fetch event. Chromium evaluates all of that quietly, then fires `beforeinstallprompt` when it decides the user could reasonably install. Your JavaScript listens for that event, usually calls `preventDefault()` to stop the default mini-infobar, stashes the event object, and shows your own "Install app" button later.

The trouble for testing starts right there. The event is not deterministic across environments. It depends on engagement heuristics, whether the app is already installed, the platform, and the browser channel. Headless runs historically did not fire it at all, and even headed runs can vary. So a selector-based test that waits for a specific install button often flakes, because the button only appears after an event that your test cannot force on demand.

Offline mode adds a second layer. To test it properly you have to let the service worker install and activate, confirm it has cached the shell, then cut the network and reload. Timing matters. If you go offline before the worker finishes its first `install` and `activate` cycle, you get a false failure that has nothing to do with your caching logic. Traditional frameworks can do all of this, but you end up writing a lot of imperative glue: manual waits, CDP calls to toggle offline, and brittle assertions against DOM nodes that change with every redesign.

The AI-agent approach flips the model. You describe the intent in plain English, the agent drives a real browser step by step, and you keep the deterministic checks for the things that must be exact. BrowserBash is built around exactly that split. It is a free, open-source (Apache-2.0) natural-language browser automation CLI, and its whole pitch is being the validation layer that sits between "the app looks done" and "the app actually works." You can read more about the philosophy on the [features page](https://browserbash.com/features).

## What is actually testable, and what is not

Honesty first, because this is where most PWA testing guides oversell. Some of the install flow lives inside the operating system, and no browser automation tool can click those pixels reliably.

Here is the split as it really stands:

| Surface | Owned by | Automatable with a browser agent? |
| --- | --- | --- |
| `beforeinstallprompt` event firing | Chromium engine + heuristics | Partial: observable via page hooks, not forced on demand |
| Your custom "Install app" button appearing | Your JavaScript | Yes, fully |
| Manifest correctness (name, icons, display) | Your server | Yes, via page evaluation |
| Service worker registration and activation | Your code + browser | Yes |
| Offline shell rendering after cache | Your service worker | Yes |
| The native OS install dialog | Operating system | No, not through the page |
| App icon landing on the home screen | Operating system | No |

The last two rows matter. When Chromium's own install confirmation dialog pops, or when Android or Windows drops an icon on the home screen, that surface is outside the web page. A page-driving agent cannot verify it because it never sees it. Anyone claiming to fully automate the OS-level install dialog through a web tool is stretching the truth. What you can do, and should do, is verify everything up to that boundary: the event fires, your button shows, clicking it calls `prompt()`, and the promise resolves. That covers the parts you actually own and can fix when they break.

So a sane pwa install prompt testing strategy is: automate the web-owned surface hard, and treat the OS dialog as a manual or platform-lab checkpoint. BrowserBash is deliberately clear about this kind of boundary, which is why it fits. It verifies intent and observable page state rather than pretending to click dialogs it cannot see.

## Setting up BrowserBash for PWA work

Installation is a single global npm command, and the default model story is local-first. BrowserBash defaults to free local models through Ollama, so nothing leaves your machine and you need no API keys to start. If you would rather bring a hosted model, it auto-resolves from local Ollama to `ANTHROPIC_API_KEY` to `OPENAI_API_KEY` to OpenRouter, in that order.

```bash
npm install -g browserbash-cli
browserbash run "Open https://your-pwa.example.com and store the document title as 'title'"
```

That first run confirms the browser drives and the agent reads page state. One honest caveat before you scale up: very small local models, roughly 8B parameters and under, can get flaky on long multi-step objectives like a full install-then-offline flow. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model when the flow is hard. For a smoke check of a manifest, a small model is fine. For a ten-step offline verification, size up.

The agent drives a real Chrome or Chromium instance through the default `local` provider, which is what you want for PWA testing since service workers and the manifest behave like they do for a real user. If you need a remote grid later, providers like `browserbase`, `lambdatest`, and `browserstack` are available, though the OS-dialog caveat still applies everywhere. The [tutorials](https://browserbash.com/tutorials) walk through provider setup in detail.

## Verifying the manifest and installability signals

Before you worry about the event, verify the preconditions, because a missing icon size or a wrong `display` value is the most common reason `beforeinstallprompt` never fires. You can express these as plain-English objectives and let the agent read the page.

```bash
browserbash run "Open https://your-pwa.example.com, then read the web app manifest linked in the page head and confirm it has a name, a start_url, a display value of standalone, and at least one icon that is 512x512" --agent
```

The `--agent` flag emits NDJSON, one JSON event per line, which is what you feed into CI or an AI coding agent rather than parsing prose. Each run ends with a `run_end` event carrying the verdict, and the exit codes are frozen contracts: 0 passed, 1 failed, 2 error, 3 timeout. That determinism is the point. A green here means the manifest genuinely met the conditions you named, not that a model felt good about it.

For the checks that must be exact, move them into a committable Markdown test with deterministic `Verify` steps. Verify lines compile to real Playwright assertions with no model judgment involved, so "the title contains X" or "the Install button is visible" is a hard check with expected-versus-actual evidence when it fails. This is the difference between an agent guessing and a compiled assertion holding.

### A manifest and service worker smoke test

```bash
browserbash run "Open https://your-pwa.example.com, wait until the service worker is registered and active, then confirm navigator.serviceWorker.controller is not null" --agent --headless --timeout 120
```

Running headless is fine for the registration and manifest layer. The nuance comes with the install event itself, which historically prefers a headed context. When you get to that step, drop `--headless` so Chromium behaves more like a real user session.

## Observing beforeinstallprompt without pretending to force it

You cannot summon `beforeinstallprompt` on command, but you can make its firing observable. The trick most PWA teams already use in production is to attach a listener early and record whether it fired. A test can lean on that same signal.

The cleanest pattern is to have your app expose the state it already tracks. Many PWAs set a flag or enable an install button when the event arrives. Your test then verifies the observable consequence rather than the raw event:

```bash
browserbash run "Open https://your-pwa.example.com in a headed browser, interact with the page by scrolling and clicking the main content once, wait up to 30 seconds, then check whether an Install app button has become visible. Store the result as 'installable'" --agent
```

This is where an intent-driven agent shines over a rigid selector script. The agent reads the page like a human, so if your button says "Add to home screen," "Install," or "Get the app," a plain-English objective still finds it. A brittle `page.locator('#install-btn')` breaks the moment a designer renames the id. You are testing the user-visible outcome, which is what you actually care about.

Be honest in your reporting about what a green means here. It means the installable path produced its visible affordance within the window you allowed. It does not mean the OS will definitely install the app, because that final step is out of the page's hands. Write your test names to reflect that boundary, something like `install_button_appears_when_installable` rather than `pwa_installs_successfully`. Never fabricate a PASS for a surface you cannot observe.

### Clicking your install button and checking prompt()

When your button calls the stored event's `prompt()` method, the browser takes over and shows its own confirmation. Your automation can confirm the click happened and that your code path ran up to the prompt call, which is the last thing you own:

```bash
browserbash run "On https://your-pwa.example.com, once the Install app button is visible, click it, then confirm the page shows the post-prompt state such as a hidden install button or a thank-you message" --agent --timeout 120
```

The verdict you get back tells you your handler wired up correctly. Beyond `prompt()`, you are into OS territory, and a good test suite is explicit about handing off there.

## Testing offline mode the way users hit it

Offline is more fully automatable than install, which makes it the higher-value target. The sequence that matters is: load online, let the service worker cache the shell, go offline, reload, and confirm the app still renders instead of showing the browser's dinosaur.

The timing discipline is everything. You must wait for the worker to reach `activated` before cutting the network, or you test nothing. Express that wait as intent so the agent holds until the condition is real, not just a fixed sleep.

```bash
browserbash run "Open https://your-pwa.example.com, wait until the service worker is active and has finished caching the app shell, then confirm the main navigation and app heading are visible" --agent --timeout 180
```

Once you have confirmed the cache is warm, the offline reload is the payoff. Because the flow has several ordered steps that each depend on the last, this is a perfect case for a versioned Markdown test where steps run one at a time against a single browser session.

## Building a repeatable offline test with testmd v2

BrowserBash's Markdown test format lets you commit a `*_test.md` file with `@import` composition and `{{variables}}` templating. Adding `version: 2` frontmatter switches it into per-step execution, where steps run one at a time against one browser session, and you get two deterministic step types that never touch a model: API steps for seeding data, and Verify steps for checking the UI.

Here is an offline flow expressed as a committable test:

```bash
# offline_shell_test.md
```

The file itself looks like this, and you run it with `browserbash testmd run ./offline_shell_test.md`:

```
---
version: 2
---
# PWA offline shell

- Open https://your-pwa.example.com and wait until the service worker is active
- Interact with the app so the shell finishes caching
Verify "Dashboard" heading visible
Verify text "Welcome back" visible
- Simulate going offline and reload the page
Verify "Dashboard" heading visible
Verify text "You are offline" visible
```

The plain-English lines run as grouped agent blocks on the same page, so the agent handles the fuzzy work of loading, interacting, and toggling network state. The `Verify` lines are compiled Playwright checks: "Dashboard heading visible" holds or it does not, and a failure lands in the `run_end.assertions` block and the human-readable Result.md assertion table with expected-versus-actual evidence. That mix is the sweet spot for PWA testing, agent flexibility for the messy steps and hard determinism for the claims that must be exact.

One honest constraint: testmd v2 currently drives the builtin engine, which speaks the Anthropic API, so it needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It does not yet run per-step execution directly on Ollama or OpenRouter. If you are strictly local-only today, keep your offline checks as single `browserbash run` objectives on a local model and use v2 once you have a hosted key wired up. The [learn section](https://browserbash.com/learn) tracks engine capabilities as they expand.

## Wiring PWA tests into CI and monitors

A PWA that installs and works offline today can quietly break tomorrow when someone bumps the service worker cache version or renames a manifest icon. Two BrowserBash features make that regression visible early.

First, the GitHub Action. The repo ships an `action.yml` that installs the CLI, runs your suite, uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with a verdict table. So every pull request that touches your service worker gets a fresh install-and-offline verdict right in the review. The setup is documented in the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

Second, monitor mode for production. An installable, offline-capable PWA is a promise to users, and monitor mode watches it on an interval and alerts only on state changes, both directions, never on every green run.

```bash
browserbash monitor ./offline_shell_test.md --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

Slack incoming-webhook URLs get Slack formatting automatically, and any other URL receives the raw JSON payload. The replay cache is what makes this affordable: a green run records its actions, and the next identical run replays them with zero model calls, stepping the agent back in only when the page actually changed. So an always-on offline monitor stays nearly token-free until something genuinely shifts, at which point you get one alert, not a flood.

If you run a broad suite across viewports, sharding and the viewport matrix help. You can split work across CI machines deterministically and run every test once per screen size, which matters for PWAs that adapt their install affordance to mobile versus desktop.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --matrix-viewport 1280x720,390x844 --budget-usd 2
```

The shard slice is computed on sorted discovery order, so four parallel machines agree on who runs what without any coordination. The `--budget-usd` cap stops launching new tests once the suite crosses the limit, reports the rest as skipped, and exits 2, which keeps a runaway agent from surprising you on the bill.

## Where a plain Playwright script is still the better call

Credibility matters more than a sales pitch, so here is where you should not reach for an AI agent. If your PWA test needs pixel-exact assertions, deep CDP control such as precise network throttling profiles, or you already have a mature Playwright suite with stable selectors, a hand-written script is faster and cheaper to run. Deterministic tooling with no model in the loop will always beat an agent on raw speed and cost for a well-understood, stable flow.

BrowserBash actually respects that. Its `browserbash import` command converts existing Playwright specs to plain-English tests heuristically, with no model involved, and anything it cannot translate lands in an `IMPORT-REPORT.md` rather than being silently dropped or invented. So the two approaches are not either-or. You can keep your rock-solid Playwright assertions and layer agent-driven intent tests on top for the flows that change often or resist stable selectors, like a redesigned install banner.

The honest rule of thumb: use the agent for flows described better in English than in selectors, for surfaces that change frequently, and for the validation layer in front of an AI coding agent that just changed your service worker. Use raw Playwright for tight, stable, performance-sensitive checks. PWA install and offline flows often land in the first bucket precisely because the UI shifts and the timing is fuzzy, but your millisecond-level cache-header assertions belong in the second.

## A realistic end-to-end plan

Putting it together, a mature PWA validation setup looks like this. Keep a fast manifest-and-service-worker smoke test on every commit, running headless on a local model, so a broken manifest fails in seconds. Keep a headed install-affordance test that confirms your Install button appears and your `prompt()` handler fires, clearly named so nobody mistakes it for OS-level verification. Keep a testmd v2 offline flow that seeds any needed state through API steps and verifies the offline shell through compiled `Verify` assertions. Gate pull requests with the GitHub Action so service-worker changes get a verdict in review. Watch production with a 10-minute monitor that alerts only on state flips.

That covers everything the web page owns, draws a clean line at the OS boundary, and stays cheap thanks to the replay cache. It is the kind of setup you can hand to a teammate or an AI agent and trust, because every green corresponds to a real observed condition and every failure comes with evidence. You can browse more end-to-end examples on the [BrowserBash blog](https://browserbash.com/blog).

## FAQ

### Can you fully automate a PWA install prompt with a browser tool?

Not entirely, and any tool that claims otherwise is overstating it. You can automate everything the web page owns: the manifest correctness, the service worker registration, whether `beforeinstallprompt` produced your custom install button, and whether clicking that button runs your `prompt()` handler. The native operating-system install dialog and the home-screen icon are outside the page, so a page-driving agent cannot verify them. Draw the line at the OS boundary and treat that final step as a manual or platform-lab check.

### How do you test that a PWA works offline?

Load the app online first and wait until the service worker reaches its active state and has finished caching the app shell, which is the step teams most often skip and then get false failures. Only then simulate going offline and reload the page. Confirm your shell renders instead of the browser's offline error page. Expressing the wait as intent rather than a fixed sleep is what keeps the test stable, since caching time varies between runs.

### Why does beforeinstallprompt not fire in my automated test?

The event depends on Chromium's own installability heuristics plus your app meeting every precondition: HTTPS, a valid manifest with the right icons and a standalone display value, and an active service worker with a fetch handler. Headless contexts historically suppress it, so run the install step in a headed browser. If it still never fires, verify the manifest and service worker first, because a single missing icon size is the most common cause. The app being already installed also stops the event from firing again.

### Is BrowserBash free to use for PWA testing?

Yes. BrowserBash is free and open-source under Apache-2.0, and it defaults to local models through Ollama, so you can run PWA install and offline tests with no API keys and nothing leaving your machine. Hosted models are optional if you want more power for long multi-step flows, and testmd v2 per-step execution currently needs a hosted Anthropic key or a compatible gateway. The local dashboard and CLI stay free regardless.

Ready to add real install and offline coverage to your PWA? Install the CLI with `npm install -g browserbash-cli` and write your first plain-English objective in under a minute. An account is optional, but you can create one at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want the free cloud dashboard and 15-day run history to track how your install and offline flows hold up over time.
