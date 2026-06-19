---
title: When NOT to Use Playwright (and What to Use Instead)
description: "When not to use Playwright: an honest look at the gaps — non-coder QA, brittle maintenance, mobile-native, codeless — and the better fit for each."
date: 2026-01-06
category: guide
---

Playwright is one of the best things to happen to web testing in the last decade, and I will fight anyone who says otherwise. But knowing when not to use Playwright is just as valuable as knowing how to use it. I have shipped suites in it, mentored teams onto it, and also watched it quietly fail the people it was never designed to serve. This is the contrarian piece I wish someone had handed me earlier: a clear-eyed map of where Playwright stops being the right answer, who it leaves behind, and which tool actually fits the job instead.

None of this is anti-Playwright. It is anti-mismatch. A framework that assumes a TypeScript-comfortable engineer, a CI pipeline, and a maintained selector strategy is a wonderful framework — for teams that have all three. When one of those assumptions breaks, the tool that looked unbeatable on the demo starts costing you sprints. Let's go gap by gap.

## The one-line test: is Playwright actually wrong here?

Before the deep dive, here is the quick gut-check I use. Playwright is probably the right call when all of these are true: the thing under test runs in a browser, at least one person on the team writes code, that code lives in version control and runs in CI, and the team can absorb the maintenance of selectors and fixtures over time. Knock out any one of those, and you are in the zone where another tool likely wins.

The mistake teams make is treating Playwright as a default rather than a fit. It became the default in a lot of orgs because it is genuinely excellent for the engineer-owned, browser-based, CI-driven case. That case is huge. It is just not the only case, and the marketing momentum makes people forget that.

| If your blocker is… | Playwright pain | Likely better fit |
| --- | --- | --- |
| Non-coders own QA | Tests are code; manual testers can't author or maintain them | Natural-language or codeless tools |
| Selector and fixture maintenance | DOM churn breaks tests; upkeep eats sprint time | Self-healing or AI-driven runners |
| Native mobile apps | No native automation at all | Appium, Espresso, XCUITest |
| One-off checks / exploration | Project scaffold, deps, config overhead | A CLI you can run in one line |
| Codeless requirement (policy/skill) | Requires a codebase by design | Codeless platforms or NL CLIs |
| Truly no-budget, no-cloud | Free, but you still pay in engineer time | Local, open-source, $0-model tooling |

Keep that table in mind. The rest of the article is the honest reasoning behind each row, including where Playwright is still the better tool and you should ignore the alternatives.

## Gap 1: Your QA team doesn't write code

This is the biggest one, and the one Playwright advocates dodge the hardest. Playwright tests are software. Real `.ts` or `.py` files, with imports, async/await, fixtures, and a config that assumes you understand Node or Python tooling. That is a feature for an SDET. It is a wall for a manual QA analyst, a product manager, a support lead who knows the product cold, or a domain expert who can spot a broken checkout flow in two seconds but has never opened a terminal.

I have sat in rooms where a brilliant manual tester described a bug in perfect detail and then had to wait three days for an engineer to encode that scenario into Playwright. The knowledge was in the room. The bottleneck was the syntax. When the people who understand the product best can't author the tests, you get a translation layer that is slow, lossy, and resented on both sides.

You can paper over this with the codegen recorder. It records clicks and spits out a script. But recorded scripts are notoriously brittle — they capture one happy path with literal selectors, and they break the moment the DOM shifts or the data changes. More importantly, codegen does not let a non-coder *maintain* the test afterward. The moment something fails, you are back to needing an engineer to read a stack trace.

### What to use instead

If your testers think in plain English, give them a tool that takes plain English. This is exactly the niche [BrowserBash](https://browserbash.com/features) was built for: you write an objective like "log in, add the blue running shoes to the cart, and confirm the total updates" and an AI agent drives a real Chrome browser step by step, no selectors, no page objects. The verdict comes back as pass or fail with structured extracted values, so a non-coder authors and reads the test without touching code.

```bash
npm install -g browserbash-cli
browserbash run "Go to the staging store, add any in-stock item to the cart, proceed to checkout, and confirm the order summary shows the correct subtotal"
```

That is the whole test. Codeless commercial platforms (testRigor, Testim, Mabl and similar) occupy nearby territory and are worth evaluating too — their feature sets, pricing, and AI capabilities vary and are not always publicly detailed, so check current docs before committing. The common thread: when the author is not an engineer, the test should not be engineering.

When you genuinely have SDETs who *want* to own code, ignore all of this and use Playwright. Codeless tools trade flexibility for accessibility, and an engineer-owned suite will usually be more precise. The deciding question is who holds the pen.

## Gap 2: Selector maintenance is eating your team alive

Here is the dirty secret of every code-based automation framework, Playwright included: the test is only as stable as its selectors. You write `page.getByRole('button', { name: 'Submit' })` and it works beautifully — until a designer renames the button to "Place Order," or a component library bumps a version and restructures the DOM, or an A/B test swaps the layout for half your users. Then the test goes red, and it is not a real bug. It is maintenance.

Playwright's auto-waiting and role-based locators make it far less flaky than Selenium ever was. Credit where it is due. But "less flaky" is not "self-healing." When the underlying element actually changes, Playwright cannot reason about intent. It knows the selector you gave it, and the selector is gone. Somebody has to open the file, figure out the new locator, and push a fix. Multiply that across a few hundred tests and a fast-moving frontend, and your QA team spends more time fixing tests than finding bugs. I have seen suites where 40% of "failures" in a given week were selector drift, not product defects.

### What to use instead

Two directions help here. The first is AI-driven runners that interpret intent instead of literal selectors. BrowserBash's default engine, Stagehand (MIT, by Browserbase), is built around act/extract/observe primitives that are self-healing by design — the agent looks at the live page and decides how to accomplish the step, so a renamed button does not automatically break the run. Because you describe the goal rather than the path, there is no selector file to maintain in the first place. There is an honest caveat: very small local models (8B and under) get flaky on long multi-step objectives, so the sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hard flows. You can read more on how this plays out in real suites in the [BrowserBash tutorials](https://browserbash.com/tutorials).

The second direction is to keep Playwright but invest hard in test IDs (`data-testid`) and a disciplined Page Object Model so selectors live in one place. That genuinely works, and for a mature engineering org it is often the right answer. The catch is that it requires frontend cooperation and ongoing discipline — exactly the things short-staffed teams lack. If you can fund the discipline, Playwright plus stable test IDs is hard to beat. If you can't, an intent-based runner absorbs the churn for you.

| Maintenance model | How it handles DOM change | Best for |
| --- | --- | --- |
| Literal selectors (raw Playwright) | Breaks; manual fix required | Stable apps, small suites |
| Test IDs + Page Objects | One-place fix, still manual | Mature eng teams with frontend buy-in |
| AI/self-healing (Stagehand-style) | Agent re-resolves intent at runtime | Fast-moving UIs, lean teams |

## Gap 3: You're testing a native mobile app

This one is not a judgment call. It is a hard boundary. Playwright drives web browsers — Chromium, Firefox, and WebKit. It does not automate native iOS or Android applications. There is no native driver, no XCUITest bridge, no UiAutomator hook. If "the app" is something your users install from the App Store or Google Play, Playwright simply cannot reach the native UI.

People get confused because Playwright can emulate mobile *viewports* and device characteristics for responsive web testing. That is real and useful — it sets the screen size, user agent, and touch emulation for your mobile *website*. But emulating a phone-sized browser is not the same as automating a native app's buttons, gestures, and platform widgets. If your test needs to tap a native date picker, trigger a push notification, or verify behavior inside a native shell, Playwright is the wrong tool by design.

### What to use instead

For native and hybrid mobile, the established answers are [Appium](https://browserbash.com/blog) (open-source, WebDriver-based, cross-platform, governed under the OpenJS Foundation), Espresso for native Android, and XCUITest for native iOS. Appium is the generalist; the platform-native frameworks are faster and more reliable inside their own ecosystem if you are willing to maintain two suites.

Where the line blurs is mobile *web* — your responsive site loaded in a phone browser. That is web, not native, so browser-driving tools apply. BrowserBash, for instance, drives a real Chrome instance and can verify responsive web flows in plain English, which covers the mobile-web slice without the heavyweight Appium setup. But to be completely clear: the moment you need to automate inside a native app shell, reach for Appium or the platform frameworks, not Playwright and not any browser-only tool.

## Gap 4: You need a one-off check, not a test project

Playwright is built for suites. Spinning it up means `npm init`, installing the framework, downloading browser binaries, writing a config, scaffolding a spec file, and wiring a runner. For a maintained regression suite that runs every PR, that overhead amortizes to nothing — you do it once and reap value for years. It is the correct investment for ongoing coverage.

But a lot of real testing work is not a suite. It is "does the login still work on staging right now," "did the pricing page deploy correctly," "extract the current prices from these three competitor pages." For those, standing up a whole Playwright project is using a freight train to deliver a pizza. You will spend more time on scaffolding than on the actual check, and you will probably delete the project afterward.

### What to use instead

A single-command CLI fits this far better than a framework. BrowserBash runs one objective and exits, no project required:

```bash
browserbash run "Open https://staging.example.com/pricing and confirm the Pro plan shows $49 per month" --record
```

The `--record` flag captures a screenshot plus a `.webm` session video via bundled ffmpeg, so you get evidence without configuring anything. Every run is also kept on-disk at `~/.browserbash/runs` (secrets masked, capped at 200), so you have a history of your ad-hoc checks for free. For exploratory and one-off work, that single-line ergonomics beats a scaffolded project every time. When the same check becomes something you want to run on every deploy, you can graduate it into a committable markdown test or a proper Playwright spec — but you don't pay the project tax just to answer a question once. There is more on the one-shot-versus-suite tradeoff in the [BrowserBash learn hub](https://browserbash.com/learn).

If you are already deep in a Playwright codebase, of course, adding one more spec is trivial and you should just do that. The one-off argument only bites when you would otherwise be creating a project *from scratch* for a throwaway check.

## Gap 5: "Codeless" is a hard requirement, not a preference

Sometimes codeless is not about skill. It is policy. Some organizations want test assets that a business analyst can audit without reading code. Some teams want every test reviewable by a compliance person. Some agencies hand testing to clients who will never open an IDE. In those situations, "just learn TypeScript" is not on the table, and Playwright's code-first nature is a structural mismatch no amount of training fixes.

Playwright has no codeless authoring mode that a non-engineer can own end to end. Codegen records, but the output is still code that needs an engineer to maintain. If your requirement is that the *test artifact itself* is human-readable and editable by non-coders, you need a tool whose native format is not a programming language.

### What to use instead

Two flavors fit. Pure codeless commercial platforms give you a visual or natural-language authoring experience with dashboards and team features baked in; evaluate them on current pricing and capabilities, which are not always publicly specified and shift release to release. The other flavor is a natural-language CLI that still produces committable, reviewable artifacts. BrowserBash markdown tests (`*_test.md`) are a nice middle ground here: each list item is a plain-English step, you get `{{variables}}` templating and `@import` composition, secret-marked variables are masked as `*****` in every log line, and a human-readable `Result.md` is written after each run.

```bash
browserbash testmd run ./checkout_test.md
```

That file is readable by anyone, lives in version control like code, and runs in CI like code — but nobody had to write code. For a compliance-sensitive or client-facing team, a test you can hand to a non-engineer and still diff in Git is the best of both worlds. The honest tradeoff: natural-language steps are less precise than handwritten assertions, so for pixel-exact or timing-sensitive checks, code still wins.

## Gap 6: Cost — but read this one carefully

This is the gap people get wrong in both directions. Playwright is free and open-source (Apache-2.0). There is no license fee, no per-seat charge, no metered runs. On paper it is the cheapest option on this list, and if someone tells you to drop Playwright purely to save money on the *framework*, they are confused.

The real cost of Playwright is not the license. It is engineer time: writing tests, maintaining selectors, debugging flakiness, keeping CI green. That cost is invisible on the invoice and very visible in the sprint. So "Playwright is free" is true and also misleading — the framework is free, the labor is not.

Where the cost conversation actually matters is when you add AI to the loop. Many AI testing tools route every step through a hosted model, and those API bills add up fast across a large suite. BrowserBash is deliberately Ollama-first to sidestep this: the default model is `auto`, which resolves to a local Ollama model first (free, no keys, nothing leaves your machine), then falls back to `ANTHROPIC_API_KEY` (claude-opus-4-8) or `OPENAI_API_KEY` (openai/gpt-4.1) only if you have set them. Run it on a local model and your model bill is a guaranteed $0. The whole tool is free and open-source (Apache-2.0), and you can see the model and provider matrix on the [pricing page](https://browserbash.com/pricing).

```bash
browserbash run "Verify the homepage hero loads and the Sign Up button is clickable" --model ollama/qwen3
```

The honest caveat stands: small local models struggle on long flows, so budget-zero testing works best on a mid-size local model or by reserving a hosted model for the genuinely hard cases. If you have a capable GPU and a mid-size model, you get AI-driven, selector-free testing for literally no recurring cost — which is a different and better cost story than either paid AI platforms or the hidden-labor cost of hand-maintained Playwright.

## So when SHOULD you still use Playwright?

I want to be fair, because the contrarian framing can read as a takedown and it isn't one. Playwright is the right tool, and often the best tool, in a large set of situations. Reach for it when:

- **Engineers own the suite.** You have SDETs or developers who write and maintain tests as code, and they *want* that control.
- **You need cross-browser precision.** Playwright drives Chromium, Firefox, and WebKit with the same API, including real WebKit, which most alternatives can't touch.
- **The app is stable enough to maintain selectors.** With `data-testid` discipline and Page Objects, selector drift is manageable.
- **You need deep, deterministic control.** Network interception, request mocking, fine-grained waits, trace viewing, parallel sharding — Playwright's tooling here is genuinely best-in-class.
- **CI is the home base.** A maintained regression suite running on every PR is exactly what Playwright was designed for.

If that is your situation, the alternatives in this article are a downgrade, not an upgrade. Natural-language and codeless tools trade determinism and precision for accessibility and speed-to-first-test. That trade is brilliant when you need it and wasteful when you don't.

The mature move is to stop treating this as a single-tool decision. Lots of strong teams run Playwright for the engineer-owned regression suite *and* a natural-language tool for the checks that non-coders own, the one-off verifications, and the exploratory passes. They are not competitors so much as different layers of the same testing strategy. You can see how teams combine them in the [BrowserBash case studies](https://browserbash.com/case-study).

## A quick decision checklist

Run your situation through these and the answer usually falls out:

1. **Is it a native mobile app?** If yes, Playwright is out — use Appium, Espresso, or XCUITest. No further debate.
2. **Will the author write and maintain code?** If no, lean toward natural-language or codeless tooling. If yes, Playwright is in play.
3. **Is selector maintenance already hurting?** If yes and you can't fund test-ID discipline, an intent-based runner will absorb the churn.
4. **Is this a one-off or a maintained suite?** One-off favors a single-command CLI; a maintained PR-gating suite favors Playwright.
5. **Is codeless a policy requirement?** If yes, you need a tool whose native artifact is human-readable, not a `.ts` file.
6. **Do you need zero recurring model cost?** A local-model, open-source runner gets you AI testing at $0; hand-maintained Playwright is free in license but expensive in labor.

Notice none of these say "Playwright is bad." They say "Playwright assumes things, and when those assumptions don't hold, something else fits better." That is the entire thesis. Knowing when not to use Playwright makes you better at knowing when to use it.

## FAQ

### Is Playwright good for non-technical testers?

Not really on its own. Playwright tests are code in TypeScript or Python, and even the codegen recorder produces scripts that need an engineer to maintain. A manual tester or domain expert who can spot bugs instantly will hit a wall at the syntax. For non-coders, a natural-language or codeless tool lets them author and maintain tests without touching code, which removes the translation bottleneck between the people who know the product and the people who write the tests.

### Can Playwright test native mobile apps?

No. Playwright automates web browsers — Chromium, Firefox, and WebKit — and has no native iOS or Android automation. It can emulate a mobile-sized viewport for responsive web testing, but that is your mobile website, not a native app installed from the App Store or Google Play. For native or hybrid mobile apps you need Appium, Espresso, or XCUITest. For mobile-web flows, any browser-driving tool, including a natural-language CLI, will work.

### Why are my Playwright tests so flaky and high-maintenance?

Most "flakiness" in a Playwright suite is actually selector drift: a button gets renamed, a component library restructures the DOM, or an A/B test changes the layout, and your literal locators break even though nothing is genuinely wrong. Playwright's auto-waiting reduces timing flakiness but cannot self-heal when an element truly changes. You fix this either with disciplined `data-testid` selectors and Page Objects, or by switching to an intent-based AI runner that re-resolves the goal against the live page at runtime.

### What is the best free alternative to Playwright for AI browser testing?

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI built for exactly this. You write a plain-English objective, an AI agent drives a real Chrome browser with no selectors, and it returns a pass/fail verdict plus extracted values. It is Ollama-first, so running on a local model means a guaranteed $0 model bill with nothing leaving your machine. Note that very small local models can be flaky on long flows, so a mid-size local model or a capable hosted model is the sweet spot for hard cases.

Playwright is excellent — for engineer-owned, browser-based, CI-driven suites. When the author isn't a coder, the app is native mobile, the maintenance is crushing you, or you just need a one-line check, reach for something that fits instead. BrowserBash is free, open-source, and runs in one command:

```bash
npm install -g browserbash-cli
```

No account required to run it. If you want the optional cloud dashboard later, you can [sign up](https://browserbash.com/sign-up) — but the whole thing works locally, for free, today.
