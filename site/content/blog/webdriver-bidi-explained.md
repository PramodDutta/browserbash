---
title: WebDriver BiDi Explained: The New Protocol Behind Selenium and WebdriverIO
description: "WebDriver BiDi explained in plain English: WebSockets, network interception, console logs, and how it narrows the gap with CDP and Playwright."
date: 2026-06-09
category: comparison
---

If you have written browser tests for more than a couple of years, you have lived through a quiet protocol war. Selenium and the classic WebDriver standard sat on one side. Puppeteer, Playwright, and Chrome's DevTools Protocol sat on the other. WebDriver BiDi is the W3C's answer to that split: a bidirectional, WebSocket-based protocol that keeps the cross-browser guarantees of WebDriver while adding the real-time powers people defected to CDP for. This article is a plain-English walkthrough of what `webdriver bidi` actually is, what it lets your tools do, and how much of the Playwright-versus-Selenium gap it really closes.

I will keep this honest. WebDriver BiDi is genuinely exciting, but it is still an Editor's Draft, browser support is uneven, and "Playwright parity" is more of a direction than a finished destination. By the end you should be able to decide whether BiDi changes your tool choice today or whether it is a thing to plan around for next year.

## What WebDriver BiDi Actually Is

WebDriver BiDi is a browser automation protocol standardized by the W3C, the same body that owns the original WebDriver spec. The "BiDi" stands for bidirectional, and that single word is the whole point.

Classic WebDriver, the protocol behind Selenium since it became a W3C standard in 2018, is built on HTTP and JSON. Your test sends a request ("click this element"), the driver does the work, and you get a response back. It is a request/response model: the client always speaks first, and the browser only answers. That design is rock solid and works in every browser, but it cannot push anything to you. If a console error fires or a network request fails while your script is between commands, classic WebDriver has no native way to tell you about it. You poll, or you miss it.

WebDriver BiDi replaces that one-way pipe with a persistent WebSocket connection carrying JSON messages in both directions. You can still send commands like `browsingContext.navigate` and get a result. But now the browser can also push events to you the moment they happen — a console log, a network response, a new browsing context opening — without you asking. That is the same model Chrome DevTools Protocol pioneered, recast as a vendor-neutral standard.

A BiDi command on the wire looks like this:

```json
{ "id": 1, "method": "browsingContext.navigate", "params": { "url": "https://example.com" } }
```

The browser answers with a matching `id`:

```json
{ "id": 1, "result": { "navigation": "123", "url": "https://example.com" } }
```

And it can volunteer events with no `id` at all, because you never requested them:

```json
{ "method": "log.entryAdded", "params": { "level": "error", "text": "Uncaught TypeError..." } }
```

That third message is the part classic WebDriver could never send. It is why people keep calling BiDi the child of WebDriver Classic and CDP — it inherits cross-browser standardization from one parent and event streaming from the other.

## Why the Old Split Existed: WebDriver vs CDP

To understand why BiDi matters, you have to remember why teams abandoned WebDriver for CDP in the first place.

Chrome DevTools Protocol arrived around 2017 as the engine behind Puppeteer, and later Playwright in 2020. It runs over WebSockets, so it was bidirectional from day one. That unlocked things WebDriver simply could not do: intercept and modify network requests, stream console and JavaScript exceptions in real time, capture performance traces, emulate devices, and read coverage data. For a developer building flaky-resistant, fast, instrumented tests, CDP felt like a generation ahead.

But CDP has two structural problems. First, it is Chrome's internal protocol. Google can and does change it between versions with no stability promise, because it was built for DevTools, not for third parties. Second, it is Chromium-specific. Firefox added a partial CDP shim, and Microsoft Edge inherits Chrome's because it is Chromium-based, but Safari never did, and Firefox has since announced it is deprecating its CDP support. So "use CDP" quietly meant "test mostly in Chrome and hope." That is a poor foundation for a cross-browser testing strategy.

WebDriver, meanwhile, had the opposite trade-off: every major browser ships a conformant driver (chromedriver, geckodriver, and so on), the protocol is a stable standard, but it is stuck in request/response and cannot stream events. You got portability at the cost of capability.

The table below is the mental model I use when explaining this to a team.

| Dimension | WebDriver Classic | Chrome DevTools Protocol (CDP) | WebDriver BiDi |
| --- | --- | --- | --- |
| Transport | HTTP + JSON | WebSocket + JSON | WebSocket + JSON |
| Direction | One-way (request/response) | Bidirectional | Bidirectional |
| Governance | W3C standard | Google / Chromium internal | W3C standard (Editor's Draft) |
| Cross-browser | Yes, all major browsers | Chromium-centric, partial elsewhere | Designed cross-browser; rolling out |
| Real-time events | No | Yes | Yes |
| Network interception | No | Yes | Yes (per spec, support maturing) |
| Console / JS logs | Polling workarounds | Yes | Yes |
| Stability promise | High (frozen standard) | None (changes per version) | Improving as spec stabilizes |

The whole reason WebDriver BiDi exists is to occupy the rightmost column: take CDP's capabilities and put them behind a standard that all the browser vendors agreed to and help maintain.

## The Big Three Features in Plain English

People throw around "bidirectional" a lot, but it is worth being concrete about what you actually get. Three capabilities matter most for everyday testing.

### Console logs and JavaScript errors, pushed live

With BiDi you subscribe to the `log.entryAdded` event once, and from then on every `console.log`, warning, and uncaught exception streams to your test as it happens, with the level, the message text, and a stack trace. No more sprinkling `driver.manage().logs()` polling between steps and praying you caught the error in the right window. This is the single most requested thing classic Selenium users wanted for a decade, and it is now a first-class event.

For a real test, that means you can assert "this page produced zero console errors during checkout" cleanly, or fail fast the instant a JavaScript exception fires instead of discovering it three steps later when a button is mysteriously dead.

### Network interception and inspection

BiDi defines a `network` module that lets you observe requests and responses as events, and also pause a request so you can inspect, modify, mock, or block it before it continues. This is the feature that made Playwright and Puppeteer so good for testing edge cases: you can stub a slow third-party API, force a 500 to test your error UI, strip out analytics calls, or inject auth headers, all without a separate proxy.

Both Selenium and WebdriverIO now expose this through BiDi. Selenium has shipped BiDi network features, and WebdriverIO v9 leaned heavily into BiDi for exactly this kind of real-time interception. The capability that used to require a Chrome-only CDP escape hatch is becoming a standard module.

### Real-time browsing context and DOM events

The third pillar is awareness of what the browser is doing structurally: new tabs and windows (browsing contexts) opening, navigations starting and finishing, dialogs appearing, frames attaching. Instead of polling "is the new tab there yet," your tooling gets told. This is what makes modern auto-waiting and self-healing behavior feel less like guesswork — the framework reacts to events rather than racing the browser on a timer.

Put together, these three remove the main reasons a team would say "we had to drop down to CDP." That is the gap-narrowing story in one sentence.

## How BiDi Narrows the Gap with CDP and Playwright

Let me be precise about "narrows the gap," because hype usually overshoots here.

Playwright's appeal was never one feature. It was the combination of speed, reliable auto-waiting, network mocking, multi-tab handling, tracing, and a clean API — all built on a fast bidirectional channel. Selenium users looked at that and felt the protocol underneath them was the bottleneck. WebDriver BiDi attacks that bottleneck directly. Once Selenium and WebdriverIO speak BiDi, they get the same class of primitives Playwright built its reputation on: live logs, network control, event-driven waits.

What does that mean concretely?

- **Selenium** has integrated BiDi capabilities into Selenium 4, exposing real-time network interception, console and JavaScript log streaming, and performance signals that previously required CDP. The Selenium docs now have dedicated BiDi network sections.
- **WebdriverIO v9** made BiDi a central part of the release, using it to intercept network requests, capture console logs, and react to DOM changes without constant polling, while keeping cross-browser compatibility.
- **Puppeteer**, which started life as a CDP tool, added a BiDi backend so it can drive Firefox over the standard protocol — a notable signal that even CDP-native tools see BiDi as the portable future.

So the gap narrows in two directions at once. Selenium and WebdriverIO gain CDP-class powers through a standard, and CDP-native tools start speaking BiDi for portability. The protocol layer is converging even while the high-level APIs stay different.

Here is the honest hedge. As of 2026, WebDriver BiDi is still an Editor's Draft, not a finished W3C Recommendation. Browser support is real but uneven: Chrome, Edge, and Firefox have meaningful BiDi support, and Firefox in particular has gone all-in on it while deprecating its old CDP shim. Safari is actively contributing to the standard but has not shipped a BiDi implementation yet, so true four-browser parity is not here today. And not every CDP feature has a BiDi equivalent yet, which is exactly why Puppeteer still defaults to CDP for Chrome. BiDi closes most of the everyday gap; it does not erase the last mile of advanced, Chrome-only instrumentation.

## What This Means for Tool Choice

If the protocol is converging, does the tool you pick still matter? Yes, just for different reasons than before. The protocol is becoming a commodity; the developer experience, language support, and ecosystem on top of it are where tools still differ a lot.

| If you are... | Lean toward | Why |
| --- | --- | --- |
| A team standardized on Selenium with Java/C#/Python | Selenium 4 + BiDi | You keep your stack and gain live logs and network control without rewriting to a new framework |
| A JavaScript/TypeScript team wanting modern DX | WebdriverIO v9 or Playwright | Both give event-driven, real-time automation; WebdriverIO now does it over BiDi natively |
| Building a brand-new Chrome-first suite with maximum polish | Playwright | Mature tracing, auto-wait, and tooling today, with BiDi support arriving incrementally |
| Needing genuine Safari/WebKit coverage now | Playwright (WebKit) or classic WebDriver | BiDi in Safari is not shipped yet, so do not pick a tool for its BiDi-on-Safari story in 2026 |
| Driving the browser from an AI agent or natural language | A natural-language layer like BrowserBash | The protocol details get abstracted away; you describe the goal, the agent drives a real browser |

The key takeaway: do not switch frameworks *because of* BiDi alone. If Selenium already fits your team, BiDi makes Selenium better in place. If you are greenfield in TypeScript, the choice between Playwright and WebdriverIO is about API taste and ecosystem, not protocol capability, since both are heading to the same place. Pick the tool whose language bindings, reporting, and community fit your team, and treat BiDi as a rising tide that lifts whichever boat you are in.

If you want a deeper, framework-specific comparison of how these tools handle waits and flakiness, our [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) sections go hands-on with examples you can run.

## Where Natural-Language Automation Fits

There is a layer above all of this that the protocol war tends to ignore: the test author still has to write and maintain selectors, page objects, and step logic. BiDi makes the *engine* better. It does nothing about the *authoring* burden.

This is where BrowserBash takes a different angle. BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. Instead of choosing a protocol and hand-writing selectors, you write a plain-English objective and an AI agent drives a real Chrome or Chromium browser step by step — no selectors, no page objects — then returns a verdict plus structured extracted values. You install it once and run a goal:

```bash
npm install -g browserbash-cli
browserbash run "go to the demo store, add the cheapest item to the cart, and confirm the cart subtotal updates"
```

Under the hood BrowserBash drives a genuine browser through its engines. The default engine is Stagehand (MIT, by Browserbase), which provides act/extract/observe primitives and self-healing behavior; there is also a built-in engine that runs an Anthropic tool-use loop over Playwright. You can switch with `--engine stagehand|builtin`. Where the browser actually runs is controlled separately by `--provider`, which defaults to your local Chrome but can also attach to any DevTools endpoint over a WebSocket with `--cdp-endpoint ws://...`. That CDP-endpoint option is the practical bridge to the protocol world this article is about: if you already have a remote debuggable browser, BrowserBash can attach to it.

The model story is deliberately Ollama-first. The default model is `auto`, which resolves to a local Ollama model if one is present — free, no API keys, and nothing leaves your machine, so your model bill is a guaranteed zero. If no local model is found it falls back to a hosted Claude or OpenAI model when you have set the relevant key. Honest caveat: very small local models (8B and under) get flaky on long multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. For CI, `--agent` emits NDJSON — one JSON object per line with step events and a terminal `run_end` — and clean exit codes (0 passed, 1 failed, 2 error, 3 timeout) so coding agents and pipelines never have to parse prose.

This is not a replacement for understanding BiDi; it is a different abstraction level. If your goal is "verify this checkout flow works," describing it in English and letting an agent drive can be faster than wiring up either protocol by hand. You can read more on the [features](https://browserbash.com/features) page or browse real runs in our [case studies](https://browserbash.com/case-study).

## A Practical Way to Try BiDi Concepts Without the Plumbing

You do not have to build a raw WebSocket client to feel what bidirectional automation is like. If you want to see real-time, event-driven browser behavior in action, you can record a full session and inspect what happened, including the console and network activity the agent observed.

```bash
browserbash run "open the login page, submit empty credentials, and report the validation error text" --record
```

The `--record` flag captures a screenshot plus a `.webm` session video through bundled ffmpeg, and on the built-in engine it also writes a Playwright trace. Every run is also kept on disk at `~/.browserbash/runs` (capped at 200, secrets masked), and you can open a fully local dashboard with `browserbash dashboard` on localhost to browse them. Nothing is uploaded unless you explicitly opt in with `--upload` after linking a cloud key — without that flag, everything stays on your machine.

For repeatable, committable tests, BrowserBash also supports markdown test files where each list item is a step, with `{{variables}}` templating and `@import` composition, and secret-marked variables masked as `*****` in every log line:

```bash
browserbash testmd run ./checkout_test.md
```

The point of showing these is not that BrowserBash speaks BiDi directly — it abstracts the transport away — but that the *experience* BiDi enables (live logs, network visibility, event-driven steps) is exactly the kind of feedback an AI-driven runner thrives on. The protocol and the abstraction layer are complementary, not competing. You can dig into more workflows on the [blog](https://browserbash.com/blog) or check what is free versus optional on the [pricing](https://browserbash.com/pricing) page.

## Migration and Adoption: What to Do This Year

So what is the actionable plan for a real team in 2026? A few concrete moves.

First, if you are on Selenium 4 already, you do not need to migrate anything to start benefiting. Adopt BiDi features incrementally — wire up console-log capture and network assertions on your flakiest specs first, where live error visibility pays for itself immediately. You keep your existing suite and your team's language.

Second, if you are evaluating a fresh JavaScript stack, try WebdriverIO v9 and Playwright side by side on a representative flow. Judge them on reporting, debugging, parallelization, and how your team feels writing them — not on protocol bullet points, because the protocol floor is rising for everyone.

Third, treat Safari/WebKit as the asterisk it is. If real Safari coverage is a hard requirement this year, plan around the fact that BiDi is not shipped there yet. Use Playwright's WebKit engine or classic WebDriver for that lane, and let BiDi handle Chrome, Edge, and Firefox.

Fourth, do not over-rotate on the "Editor's Draft" label as a reason to wait. The spec is stable enough that shipping browsers and major frameworks already depend on it. The risk is not that BiDi disappears; it is that specific advanced features land on different browser timelines. Build with that unevenness in mind and you will be fine.

Finally, if a chunk of your testing is really just "confirm this user journey works" rather than fine-grained instrumentation, consider letting a natural-language agent handle those flows so your engineers spend their protocol-level effort where it matters. That is the lane BrowserBash is built for, and it costs nothing to try.

## FAQ

### What is WebDriver BiDi in simple terms?

WebDriver BiDi is a W3C browser automation protocol that uses a two-way WebSocket connection so the browser can push events to your test in real time, not just answer commands. It combines the cross-browser standardization of classic WebDriver with the live event streaming that Chrome DevTools Protocol made popular. In practice it means your automation can receive console logs, network activity, and page changes the moment they happen.

### Does Selenium support WebDriver BiDi?

Yes. Selenium 4 integrated BiDi support, giving you real-time network interception, console and JavaScript log streaming, and performance signals that previously required dropping down to the Chrome-only DevTools Protocol. You do not need to leave Selenium or rewrite your suite to use it; you can adopt BiDi features on individual tests. The Selenium documentation has dedicated sections covering its BiDi network capabilities.

### Is WebDriver BiDi the same as Chrome DevTools Protocol?

No, though they are closely related. CDP is Chrome's internal protocol, controlled by Google, can change between browser versions, and is only fully supported in Chromium-based browsers. WebDriver BiDi is a vendor-neutral W3C standard designed for all major browsers, with input from multiple vendors. BiDi borrows CDP's bidirectional, event-driven design but wraps it in a stable, cross-browser specification.

### Should I switch from Playwright to Selenium because of BiDi?

Not on the basis of BiDi alone. The protocol layer is converging, so both Selenium and Playwright are gaining the same class of real-time capabilities, which means your decision should hinge on language bindings, developer experience, reporting, and ecosystem rather than protocol features. If Selenium already fits your stack, BiDi makes it better in place; if you are greenfield in TypeScript, pick the tool whose API and tooling your team prefers. As of 2026, Safari does not ship BiDi yet, so factor that in if WebKit coverage is critical.

WebDriver BiDi will not make your tool choice for you, but it does remove the protocol as a tiebreaker. Whatever framework you are on, the floor is rising — and if you would rather skip selectors entirely and just describe what you want tested, give the natural-language route a try.

```bash
npm install -g browserbash-cli
```

No account is required to run BrowserBash locally. If you want the optional free cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up) — but everything in this article works fully offline on your own machine first.
