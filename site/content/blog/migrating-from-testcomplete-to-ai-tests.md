---
title: Migrating From TestComplete to Plain-English AI Tests
description: "How to migrate from TestComplete to free, plain-English AI tests with BrowserBash: rebuild GUI cases, keep CI exit codes, and record runs."
date: 2026-04-15
category: guide
---

If your team is ready to migrate from TestComplete, you are usually solving two problems at once: an annual license that keeps climbing, and an object repository that keeps breaking every time the UI moves. This guide walks through that migration in practice — how to take the GUI test cases you already have in TestComplete and rebuild them as plain-English BrowserBash tests that run for free, exit CI with proper status codes, and record a video of every run. No NameMapping, no per-seat license, no Windows-only IDE.

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, write an objective in plain English, and an AI agent drives a real Chrome browser step by step until the objective is met. There is no recorder, no object map, and no account required to run. This is not a "rip and replace everything tomorrow" pitch. TestComplete is a mature tool that does things BrowserBash deliberately does not, and I will be honest about where it stays the better fit. But for web end-to-end coverage, the migration is more straightforward than most people expect.

## Why teams decide to migrate from TestComplete

TestComplete is a commercial GUI automation IDE from SmartBear that has been shipping since the early 2000s. Its defining idea is *object recognition*: the tool inspects your running application, builds a model of its UI controls, and lets you address those controls by their mapped properties through a feature called NameMapping. You record or script interactions against those mapped objects, then replay them.

That model is powerful and, for a while, comfortable. The trouble shows up over time. Three pressures usually push a team to look elsewhere.

**License cost.** TestComplete is licensed per seat, and the specific list price tiers are negotiated and not always public, so I won't quote a number you can't verify. What is not in dispute is that it is a paid commercial product, often bundled with other SmartBear tools, and the renewal lands every year whether or not your suite grew. For a small team or an open-source project, that recurring line item is hard to justify.

**Maintenance of the object repository.** NameMapping stores property-based identifiers — control type, name, index, sometimes XPath or CSS for web — under aliases you reference in tests. SmartBear has added AI-assisted self-healing locators to reduce breakage, and they help at the margins. But the underlying artifact is still a stored map of the UI that you own, curate, and repair every time a component is renamed or a framework upgrade reshuffles the DOM. That repair work is the recurring tax that scripted tools quietly charge.

**Platform lock-in.** TestComplete is a Windows desktop application. If your engineers work on macOS or Linux, you are running it in a VM or on a dedicated Windows box, and your CI needs a Windows agent. For a web-only test suite, that is a lot of operating system to drag around.

If any of those three is your reason, a migration to plain-English AI tests is worth a serious look. If none of them is — if you are happily on Windows automating desktop apps under a license you don't mind paying — you probably should not migrate, and I'll come back to that.

## What changes when you migrate to plain-English AI tests

The mental model is the part that changes most. In TestComplete you describe *which control* to act on and *how*. In BrowserBash you describe *what should happen*, and the agent figures out the controls by reading the live page the way a person would.

Here is the same login-and-checkout case in both worlds, conceptually.

In TestComplete, you would map the username field, password field, and login button into the object repository, then write a script (in JavaScript, Python, VBScript, or one of the supported languages) that sets the text on each mapped object and clicks the mapped button. If the login button later gets relabeled or restructured, the mapped alias can stop resolving and the test fails until you re-map it.

In BrowserBash, you write the objective in English:

```bash
browserbash run "Go to the store, log in as standard_user, add a backpack to the cart, complete checkout, and verify the page shows 'Thank you for your order!'"
```

There is no object to map. The agent reads the page on every run and decides what to click. Rename the login button from "Login" to "Sign in" and the objective still passes, because the agent reads the new label rather than a stored alias. The page is re-read each run, so there is no repository to drift out of date.

That is the core trade. TestComplete's reliability comes from a *stored* model — once an object is mapped, replay is fast and deterministic. BrowserBash's resilience comes from having *no* stored model — there is nothing to maintain across UI changes, at the cost of running model inference on every run and accepting a small amount of nondeterminism. For most web E2E suites, swapping maintenance work for per-run inference is a good deal. For a 5,000-case desktop regression pack that must execute identically every night, it may not be.

### A side-by-side of the two approaches

| Dimension | TestComplete | BrowserBash |
| --- | --- | --- |
| Licensing | Commercial, per-seat (paid) | Free, open-source (Apache-2.0) |
| How you express a test | Mapped objects + scripted steps | Plain-English objective |
| UI element handling | NameMapping object repository | Agent reads the live page each run |
| Platform | Windows desktop IDE | Any OS with Node + Chrome |
| Coverage | Web, desktop, mobile, legacy | Web browser automation |
| Where it runs | Local Windows / SmartBear ecosystem | Local Chrome, CDP, or cloud grids |
| Models / AI | Self-healing locators | Local Ollama, OpenRouter, or Anthropic |
| Account required | Vendor licensing | None to run; dashboard is opt-in |
| CI signal | Exit codes / reports | Exit codes + NDJSON agent mode |

The honest read on that table: TestComplete wins on coverage breadth and on deterministic replay of a stored map. BrowserBash wins on cost, on cross-platform reach, and on not maintaining a repository. Neither is "better" in the abstract — they are tuned for different jobs.

## Step 1: Inventory your TestComplete suite before you migrate

Do not start by translating tests. Start by sorting them. Open your TestComplete project and bucket every test into three groups.

**Group A — web end-to-end flows.** Logins, signups, search, add-to-cart, checkout, form submissions, dashboard verifications. These are the cases BrowserBash is built for, and they migrate cleanly. Most teams find this is the largest bucket.

**Group B — desktop or mobile cases.** Anything that drives a Windows desktop application, an Electron app via its native layer, or a mobile device through TestComplete's mobile support. BrowserBash does not do these. It is a browser automation tool. Keep these in TestComplete, or another tool, and do not pretend otherwise.

**Group C — data-driven matrices and API checks.** Cases that loop a script over a spreadsheet of inputs, or that hit ReadyAPI-style API endpoints. Some of these have a web-UI equivalent worth rebuilding with BrowserBash variables; others are genuinely API tests that belong in an API tool.

The migration plan writes itself from this inventory. Group A moves to BrowserBash. Group B stays put. Group C gets evaluated case by case. The mistake to avoid is trying to move everything at once and then concluding "the AI tool can't do desktop" — of course it can't; that was never the claim. A clean inventory keeps the comparison fair and your migration on track.

## Step 2: Rebuild one GUI test case as a plain-English test

Pick the simplest Group A case for your first rebuild — usually a login. You will translate a mapped, scripted test into a single sentence and watch it pass.

The translation pattern is consistent. Take each meaningful user action your TestComplete script performs, drop the object-mapping and the property assertions, and write the *intent* as a sentence. "Set text on mapped Username object, set text on mapped Password object, click mapped Login button, verify mapped Welcome label is visible" becomes:

```bash
browserbash run "Log in at https://example.com/login with username standard_user and password secret_sauce, then verify the dashboard greeting is visible" --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg, so you have visual proof the run did what it claimed — the same audit trail TestComplete's run logs give you, in a portable video file. On the builtin engine, BrowserBash additionally captures a Playwright trace you can open in the trace viewer for step-by-step debugging.

A few practical notes from doing this on real suites:

- **Be specific about the verification.** A vague objective like "log in and check it works" gives the agent too much latitude. Name the concrete signal — a heading, a URL, a confirmation string — exactly as you would assert it in TestComplete.
- **One objective per logical flow.** Don't cram login, profile edit, and logout into one giant sentence. Keep each test focused, the way you would keep each TestComplete test focused.
- **Model choice matters here.** BrowserBash is Ollama-first and defaults to free local models with no API keys, so nothing leaves your machine. That is great for cost and privacy. But very small local models — roughly 8B parameters and under — can be flaky on long multi-step objectives; they lose the thread or declare victory early. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the hardest flows. If your first checkout rebuild wobbles on a tiny model, that is the model, not the approach. You can read more on the trade-offs on the [BrowserBash learn page](https://browserbash.com/learn).

Run the rebuilt test, watch the agent drive your real Chrome, and confirm the verdict. When that one passes, you have validated the whole pattern and the rest of Group A is mechanical.

## Step 3: Make the tests committable with Markdown test files

A single `run` command is great for spiking a case, but a migrated suite needs the tests to live in version control, the way your TestComplete project files did. BrowserBash handles this with Markdown test files: committable `*_test.md` files where each list item is a step.

A migrated checkout test looks like this:

```markdown
# Checkout smoke test

- Go to {{baseUrl}}
- Log in with username {{user}} and password {{password}}
- Add the Sauce Labs Backpack to the cart
- Open the cart and click Checkout
- Fill in first name "Pat", last name "Lee", and zip "94016"
- Continue and finish the order
- Verify the page shows "Thank you for your order!"
```

You run it with:

```bash
browserbash testmd run ./checkout_test.md
```

This is where the migration starts to feel better than what you left. Those files support `@import` composition, so a shared login flow can be written once and pulled into every test that needs it — your own reusable building blocks, without a NameMapping layer. They support `{{variables}}` templating for environments and credentials, and any variable marked as a secret is masked as `*****` in every log line, so passwords never leak into CI output. After each run, BrowserBash writes a human-readable `Result.md` you can attach to a ticket or skim in review.

The `{{password}}` above would be supplied as a secret-marked variable, so it shows up as `*****` in logs while still driving the real login. That covers the credential-safety requirement that every serious suite has, without you building masking yourself. For deeper patterns on structuring these files, the [feature overview](https://browserbash.com/features) walks through composition and templating.

### Organizing the migrated suite

Treat the `*_test.md` files like source. One file per flow, grouped in folders that mirror your TestComplete test tree, with shared steps factored into imported partials. Because they are plain Markdown, a reviewer who has never touched the tooling can read a test in a pull request and understand exactly what it checks — which is rarely true of a property-mapped TestComplete script. The living-documentation effect is a real, if quiet, benefit of the migration.

## Step 4: Wire CI exit codes so the build fails when a test fails

This is the part most migrations get wrong, and it is the part TestComplete users care about most: the suite has to *fail the build* when a test fails, cleanly, without scraping prose out of logs.

BrowserBash has an agent mode built for exactly this. Add `--agent` and it emits NDJSON — one JSON event per line — on stdout, and it sets a real process exit code:

- `0` — passed
- `1` — failed
- `2` — error
- `3` — timeout

Your CI step is then just a command whose exit status the runner already understands:

```bash
browserbash testmd run ./checkout_test.md --agent --headless
```

If the test passes, the process exits `0` and the pipeline goes green. If the agent can't complete the objective, it exits `1` and the build goes red. No log parsing, no custom result adapter, no "grep for the word PASSED" hack. GitHub Actions, GitLab CI, Jenkins, or a coding agent in a loop all read exit codes natively, so the integration is trivial. The NDJSON stream gives you structured per-step events if you want to feed run data into a dashboard or another tool.

Because BrowserBash runs anywhere Node and Chrome run, this works on the Linux runners you already have — no Windows agent required just to host the test tool. That alone simplifies a lot of CI setups that previously existed only to keep TestComplete fed. The `--headless` flag drops the visible browser window for CI, while you keep `--record` available for the runs where you want video evidence.

## Step 5: Keep recordings and run history for audits

Losing your run logs is a real fear when leaving a mature tool, so address it head-on. Every BrowserBash run with `--record` produces a screenshot and a `.webm` video on any engine. That is your per-run evidence, stored as portable files you can archive however you like.

For history across many runs, you have two options, both free:

- **Fully local dashboard.** Run `browserbash dashboard` and browse run history on your own machine, with nothing leaving it. This is the natural fit for teams that migrated partly to keep test data in-house.
- **Optional cloud dashboard.** If you want shareable run history, video recordings, and per-run replay in a hosted view, it is strictly opt-in via `browserbash connect` plus the `--upload` flag. Free uploaded runs are kept for 15 days.

```bash
browserbash testmd run ./checkout_test.md --record --upload
```

The cloud dashboard is genuinely optional — you never need an account to run a test or fail a build. It exists for when a manager wants to click "replay" on last night's failed checkout and watch the video, which is a nicer experience than digging through a TestComplete log. Pricing for the hosted side is on the [pricing page](https://browserbash.com/pricing), and you only need to [sign up](https://browserbash.com/sign-up) if you want the cloud features.

## Step 6: Scale runs across browsers and grids with one flag

TestComplete teams often run cross-browser through the SmartBear ecosystem or a connected grid. BrowserBash keeps that option open without rewriting tests. The `--provider` flag switches *where the browser runs* while your plain-English tests stay identical:

- `local` (default) — your own Chrome
- `cdp` — any DevTools endpoint you control
- `browserbase`, `lambdatest`, `browserstack` — hosted grids

```bash
browserbash testmd run ./checkout_test.md --provider lambdatest --record
```

The same `checkout_test.md` you committed in Step 3 now runs on a LambdaTest grid instead of your laptop, no test changes. That separation — objective in the test file, execution target on the command line — is one of the cleaner parts of the migration, and it means you are never locked to a single vendor's grid. The [features page](https://browserbash.com/features) lists the full provider matrix.

## When to stay on TestComplete

A guide that only sells the migration is not trustworthy, so here is the honest other side. Do not migrate, or only partially migrate, if:

- **You automate Windows desktop or mobile applications.** This is the clearest line. TestComplete genuinely automates desktop, mobile, Electron native layers, and some legacy frameworks that browser tools simply cannot reach. BrowserBash is web-only. Group B from your inventory stays in TestComplete, full stop.
- **You need bit-for-bit deterministic replay at huge scale.** A stored object map replays the same way every time. An LLM agent re-reading the page has a small amount of nondeterminism by design. For a 5,000-case nightly regression pack where any variance is unacceptable, the scripted model is the safer bet.
- **You are deep in the SmartBear stack.** If your team relies on tight integration with Zephyr, the BitBar device cloud, and ReadyAPI as one coordinated toolchain, the value of staying in that ecosystem can outweigh the license cost.
- **Your testers are non-programmers tied to keyword-driven testing.** TestComplete's keyword-driven mode is mature and purpose-built for that audience.

The realistic outcome for many teams is not "delete TestComplete." It is "move the web E2E suite — usually the biggest, most license-hungry, most maintenance-heavy bucket — to free plain-English tests, and keep TestComplete for the desktop and mobile cases that actually need it." That hybrid is a perfectly good destination, and it shrinks both your license footprint and your repository-maintenance load. If you want a head-to-head of the two tools rather than a migration path, the [BrowserBash blog](https://browserbash.com/blog) has a dedicated comparison.

## A realistic migration timeline

For a typical mid-size web suite, the migration tends to land in a week or two of focused work, not a quarter.

- **Day 1–2:** Inventory and bucket every TestComplete case into Groups A, B, and C. Install BrowserBash, run one login objective by hand, confirm the model setup you want (local Ollama for $0, or a hosted key for hard flows).
- **Day 3–5:** Rebuild Group A cases as `*_test.md` files, factor shared logins into imported partials, mark credentials as secrets.
- **Day 6–7:** Wire `--agent` exit codes into CI, add `--record` for evidence, and run the whole Group A suite green on a Linux runner.
- **Ongoing:** Decide Group C case by case; leave Group B in TestComplete. Re-evaluate your license seat count once the web suite is off it.

The cost curve is the headline. The web suite that was driving most of your TestComplete seats now runs on free, open-source tooling with a $0 model bill on local models, and your remaining license covers only the desktop and mobile cases that genuinely need it.

## FAQ

### Can BrowserBash fully replace TestComplete?

For web end-to-end testing, yes — that is exactly what it is built for. For desktop, mobile, and legacy GUI automation, no. BrowserBash drives a real browser and does not automate native Windows or mobile applications, so those cases should stay in TestComplete. Most teams migrate the web suite and keep TestComplete only for the cases that truly need it.

### Do I need to rewrite my TestComplete scripts to migrate?

You don't translate scripts line by line. You discard the object mapping and the scripted steps and re-express each test as a plain-English objective or a Markdown test file where each list item is a step. The agent reads the live page on every run, so there is no object repository to recreate, which usually makes the rebuild faster than porting the original script.

### Will my CI pipeline still fail correctly after migrating?

Yes. BrowserBash agent mode sets standard process exit codes — 0 for passed, 1 for failed, 2 for error, 3 for timeout — and emits NDJSON for structured results. Any CI runner reads those exit codes natively, so a failed test fails the build with no log parsing. Because it runs anywhere Node and Chrome run, you no longer need a Windows agent just to host the test tool.

### Is BrowserBash actually free compared to a TestComplete license?

The CLI is free and open-source under Apache-2.0, with no per-seat license and no account required to run. Because it defaults to free local models through Ollama, you can run a genuine $0 model bill on your own hardware. The only optional paid surface is the hosted cloud dashboard, and even that has a free tier; the fully local dashboard costs nothing.

Ready to migrate from TestComplete to plain-English AI tests? Install the CLI with `npm install -g browserbash-cli`, rebuild one login flow as a sentence, and watch a real Chrome browser drive it. No account needed to run — the optional free dashboard is there if you want recordings and run history, and you can [sign up](https://browserbash.com/sign-up) whenever you're ready.
