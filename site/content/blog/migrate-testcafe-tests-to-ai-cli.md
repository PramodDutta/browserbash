---
title: Migrate TestCafe Tests to an AI Browser Automation CLI
description: "How to migrate TestCafe to AI automation: replace Selector and ClientFunction code with plain-English objectives, port auth flows, and handle the proxy"
date: 2026-04-22
category: guide
---

If you have a TestCafe suite that has quietly grown to a few hundred `Selector` calls, a pile of `ClientFunction` helpers, and a `roles` file nobody wants to touch, you have probably wondered whether there is a less brittle way to do this. This guide is about exactly that path: how to migrate TestCafe to AI automation, where instead of hand-writing selectors and waits you describe each test as a plain-English objective and an AI agent drives a real Chrome browser to carry it out. I will use [BrowserBash](https://browserbash.com/features), a free, open-source CLI from The Testing Academy, as the concrete target, and I will be honest about the places where TestCafe's design — especially its proxy model — does something genuinely different from an agent driving Chrome directly.

I have shipped and maintained TestCafe suites. It is a good tool with a clever architecture, and this is not a hit piece. The goal here is a clear-eyed migration plan: what ports cleanly, what changes shape, what you should keep in TestCafe, and how to run both side by side while you move.

## Why teams look past TestCafe in 2026

TestCafe earned its place by removing WebDriver from the equation. It runs tests through a Node.js proxy that injects a driver script into the page, so you never install browser-specific drivers and you get automatic waiting for the most part. For years that was a real advantage over Selenium. The DevExpress team open-sourced it, the API is clean, and `await t.click(Selector('.btn'))` reads nicely.

The reasons teams start looking elsewhere are not really about TestCafe being bad. They are about maintenance gravity. Three patterns show up again and again:

- **Selector churn.** Every `Selector('[data-testid="submit"]')` is a contract with the DOM. Redesign the page, rename a test id, swap a component library, and a chunk of your suite goes red even though the user-facing behavior is identical.
- **The proxy boundary.** TestCafe's URL-rewriting proxy is brilliant until it is not. Sites with strict Content Security Policy, aggressive Service Workers, certain SSO redirects, or anti-bot fingerprinting can behave differently behind the proxy than in a plain browser. You end up debugging the proxy instead of your app.
- **Project momentum.** TestCafe development slowed noticeably after the team's focus shifted, and `testcafe` open-source releases are less frequent than they once were. That is not a death sentence, but it changes the calculus when you are betting a suite on a tool's next five years.

An AI-driven CLI attacks the first problem directly — there are no selectors to churn — and sidesteps the second by driving a real browser instead of proxying one. It does not magically solve everything, and I will get to the trade-offs. But for a lot of end-to-end flows, the migration is worth it.

## What "migrate TestCafe to AI automation" actually means

Let me be precise, because "AI testing" is a loaded phrase. When you migrate TestCafe to AI automation with BrowserBash, you are not feeding your old test files into a converter. You are rewriting each test as an *objective* — a short paragraph of plain English that states what the user is trying to do and what success looks like. An AI agent reads that objective, looks at the live page, decides the next action (click, type, scroll, navigate), executes it in a real Chrome or Chromium instance, observes the result, and repeats until it reaches a verdict.

So this TestCafe test:

```javascript
import { Selector } from 'testcafe';

fixture`Checkout`.page`https://shop.example.com`;

test('completes a purchase', async t => {
  await t
    .click(Selector('a').withText('Wireless Mouse'))
    .click(Selector('[data-testid="add-to-cart"]'))
    .click(Selector('#cart-icon'))
    .click(Selector('button').withText('Checkout'))
    .typeText('#card-number', '4242424242424242')
    .click(Selector('[data-testid="place-order"]'))
    .expect(Selector('h1').innerText).contains('Thank you for your order!');
});
```

Becomes a single objective handed to BrowserBash:

```bash
browserbash run "On shop.example.com, search for 'Wireless Mouse', add it to the cart, go to checkout, pay with test card 4242 4242 4242 4242, and confirm the page shows 'Thank you for your order!'"
```

The agent figures out the clicks and the waits. There is no `Selector`, no `withText`, no explicit `.expect()` chain — the assertion lives in the sentence ("confirm the page shows..."). That is the whole shift in one example. The rest of this guide is about doing it for real, across an actual suite, including the parts that are not this tidy.

### Install and a first run

Getting to that first command is two steps:

```bash
npm install -g browserbash-cli
browserbash run "Go to the BrowserBash blog and confirm the latest post loads"
```

BrowserBash is Ollama-first. By default it looks for a local Ollama install and uses free local models, so nothing leaves your machine and there is no API key. If it does not find Ollama it falls back to `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. You can run an entire suite at a $0 model bill on local models. The honest caveat: very small local models, roughly 8B parameters and under, get flaky on long multi-step objectives. For real checkout-and-login flows, use a mid-size local model in the Qwen3 or Llama 3.3 70B class, or point it at a capable hosted model. The [Learn section](https://browserbash.com/learn) walks through model setup if you want the details.

## Mapping TestCafe concepts to objectives

The fastest way to plan a migration is a translation table. Here is how the core TestCafe primitives map onto the BrowserBash model.

| TestCafe construct | What it does | BrowserBash equivalent |
| --- | --- | --- |
| `Selector('...')` | Locate a DOM element | Described in the objective ("the Sign in button"); no selector code |
| `t.click` / `t.typeText` | Discrete actions | The agent infers actions from the objective |
| `t.expect(...).eql(...)` | Assertion | A success condition stated in plain English |
| `ClientFunction` | Run JS in the page to read state | Ask the agent to read and report what is on screen |
| `Role` | Reusable login | A login objective, often a Markdown test with secret variables |
| `fixture` / `test` | Test grouping | One objective per check, or a Markdown test with steps |
| `--reporter xunit` | CI output | `--agent` NDJSON plus exit codes |
| `t.takeScreenshot()` | Capture evidence | `--record` (screenshot + `.webm` video) |

The conceptual leap is the `Selector` and `ClientFunction` rows. In TestCafe you spend most of your authoring time telling the framework *how* to find and read things. In BrowserBash you spend it telling the agent *what* you want. That is less code and far less DOM coupling, but it does mean your tests read more like acceptance criteria than scripts — which is usually a feature, occasionally a constraint.

### Replacing Selector chains

A long `Selector` chain like `Selector('.product-card').withText('Wireless Mouse').find('button').withAttribute('data-testid', 'add-to-cart')` exists because the DOM is ambiguous and you are disambiguating it by hand. The agent does that disambiguation visually and semantically at runtime. So you delete the chain and write "add the Wireless Mouse to the cart." If two products share a name and the agent could pick wrong, you add the detail a human would use: "the Wireless Mouse priced at $19, not the bundle." You are describing intent the way you would to a new QA hire, not encoding a DOM path.

### Replacing ClientFunction

`ClientFunction` is the one people worry about, because it reaches into page internals — reading `window.dataLayer`, checking a computed style, pulling a value out of `localStorage`. Some of those are presentation concerns the agent can verify by looking ("confirm the cart badge shows 2"). Others are genuinely about internal state that is not visible on screen. Be honest with yourself about which is which. If a `ClientFunction` checks something a user can see, it becomes part of the objective. If it asserts on a JavaScript variable no user ever observes, that is arguably a unit or integration concern, and you may want to keep it in TestCafe or move it to an API test rather than force it into a browser-agent objective.

## Porting authentication flows

Auth is where most TestCafe suites concentrate their cleverness, so it deserves its own section. TestCafe's `Role` feature logs in once and reuses the authenticated state across tests, which is efficient and a genuinely nice piece of design.

Here is a typical TestCafe role:

```javascript
import { Role, Selector } from 'testcafe';

const regularUser = Role('https://app.example.com/login', async t => {
  await t
    .typeText('#email', 'qa@example.com')
    .typeText('#password', process.env.TEST_PASSWORD)
    .click('#sign-in');
});
```

In BrowserBash the login itself becomes an objective, and the right home for it is a committable Markdown test. Markdown tests are `*_test.md` files where each list item is a step, with `{{variables}}` templating and secret-marked variables that get masked as `*****` in every log line. That last part matters for auth: your password never shows up in console output or uploaded run history.

A `login_test.md` might look like this:

```markdown
# Log in as a standard user

- Go to https://app.example.com/login
- Type {{email}} into the email field
- Type {{password}} into the password field
- Click the Sign in button
- Confirm the dashboard greeting "Welcome back" is visible
```

Run it with variables, marking the password secret so it is masked:

```bash
browserbash testmd run ./login_test.md \
  --var email=qa@example.com \
  --secret password=$TEST_PASSWORD
```

The bigger win is `@import` composition. You write the login flow once and import it at the top of every other Markdown test, which is the direct analog of reusing a `Role`. The difference is that your imported login is a plain-English file your whole team can read in code review, not a function buried in a fixtures module.

### Sessions, cookies, and SSO

This is one of the honest gaps. TestCafe's `Role` caches the authenticated browser state and swaps it in fast between tests. With an agent driving a fresh browser, the straightforward approach is to run the login objective at the start of each test or each suite. That is slower than a cached role. There are two practical mitigations: keep login as a fast, deterministic Markdown test so it is cheap and reliable, and group several checks into one objective so you log in once and do five things. If your suite is hundreds of tests that each need a fresh authenticated session, factor that into your timing expectations — you are trading a little speed for zero selector maintenance.

For SSO and OAuth redirects, there is actually good news, and it leads straight into the proxy discussion.

## Where TestCafe's proxy model differs from agent-driven Chrome

This is the architectural heart of the migration, and it cuts both ways. Understand it and you will know which tests port cleanly and which need care.

TestCafe does not drive the browser through a debugging protocol. It runs a **reverse proxy in Node.js**, rewrites the URLs of the page under test to point at itself, injects its driver script, and serves the modified page to the browser. The browser thinks it is talking to your app; it is really talking to TestCafe, which relays to your app. That design is why TestCafe needs no WebDriver and works across many browsers with one mechanism.

BrowserBash takes the opposite approach. With the default `local` provider it drives **your real Chrome or Chromium** directly — no URL rewriting, no injected proxy between the browser and your server. The page loads exactly as a user's would. The engine underneath is Stagehand by default (MIT-licensed, from Browserbase), with an in-repo `builtin` Anthropic tool-use loop as an alternative.

Here is the practical difference, laid out plainly:

| Scenario | TestCafe proxy | Agent-driven Chrome (BrowserBash) |
| --- | --- | --- |
| Strict Content-Security-Policy | Proxy can require CSP relaxation or break injection | Loads natively; CSP behaves as in production |
| Service Workers / offline | Historically tricky through the proxy | Runs as the real browser does |
| SSO / OAuth cross-origin redirects | Sometimes fragile across rewritten origins | Real navigation; redirects work normally |
| Anti-bot fingerprinting | Proxy fingerprint can differ from a real browser | Real Chrome fingerprint |
| Reading raw network traffic | Proxy sits in the path, easy to inspect | Use `--record` for evidence; not a network inspector |
| `RequestMock` / request interception | First-class in TestCafe | Not the model — agent reacts to the rendered page |

Read that table the right way. The first four rows are reasons the migration *helps*: pages that misbehaved behind the proxy tend to behave normally when a real browser loads them. CSP-heavy apps and SSO redirects, two classic TestCafe headaches, often just work. The last two rows are reasons to **keep some tests in TestCafe**. If your suite leans hard on `RequestMock` to stub API responses, or on the proxy as a network inspection point, that is not what an agent driving a rendered page is for. Do not try to force it.

### A rule of thumb for what ports

Tests that describe **user behavior** — log in, search, filter, add to cart, check out, confirm a message — port beautifully, and usually get shorter and less brittle. Tests that assert on **wire-level mechanics** — this exact request fired with this header, this response was mocked, this CSP directive is present — should stay in TestCafe, or move to a dedicated API test layer where they belong. A clean migration is not all-or-nothing. It is moving the brittle, DOM-coupled UI journeys to objectives and leaving the protocol-level checks where they are strong.

## A realistic migration plan

You do not rewrite three hundred tests in a weekend. Here is the sequence I would actually run.

### 1. Inventory and sort

List your TestCafe tests and bucket them: *user journeys* (port these first), *mock-heavy / network tests* (keep in TestCafe), and *flaky maintenance sinks* (port these eagerly — they are the ones bleeding you). The flaky journeys are where AI objectives pay off fastest, because their flakiness is usually selector or timing churn, which the agent removes.

### 2. Stand up a parallel suite

Create a `browserbash/` directory next to your TestCafe tests. Do not delete anything yet. You want both green before you cut over. Start with one smoke flow:

```bash
browserbash run "Log in to staging.example.com as qa@example.com, confirm the dashboard loads, then log out" \
  --record
```

The `--record` flag captures a screenshot and a full `.webm` session video via ffmpeg, so when a run fails you watch it instead of reading a stack trace. On the `builtin` engine you also get a Playwright trace you can open in the trace viewer.

### 3. Port the journeys

Convert each user-journey test to an objective or a Markdown test. Keep them small. One objective per acceptance criterion reads better and fails more precisely than one giant objective that does ten things. Use `@import` for shared login so you are not repeating yourself.

### 4. Wire up CI

This is where the migration has to prove it belongs in your pipeline. TestCafe gives you xUnit reporters; BrowserBash gives you a machine-readable agent mode. The `--agent` flag emits NDJSON — one JSON event per line on stdout — and sets exit codes you can branch on: `0` passed, `1` failed, `2` error, `3` timeout. No prose parsing, no scraping a human report.

```bash
browserbash run "Complete a checkout on staging.example.com and verify the order confirmation page appears" \
  --agent --headless
```

In a CI step, exit code `1` fails the build the same way a failed `testcafe` run does. If you want run history, video replay, and per-run screenshots in a dashboard, `browserbash connect` plus `--upload` sends results to the free opt-in cloud dashboard (uploaded runs are kept 15 days). It is strictly opt-in; nothing uploads unless you ask. If you would rather keep everything local, `browserbash dashboard` gives you a fully local dashboard with no account at all. The [pricing page](https://browserbash.com/pricing) lays out exactly what is free.

### 5. Run both, then retire

Keep the TestCafe journeys running alongside the new objectives for a sprint or two. When the BrowserBash suite has caught the same regressions and you trust it, retire the duplicated TestCafe tests. Keep the mock-heavy ones. You will likely end with a smaller TestCafe suite focused on what its proxy does best, plus an AI suite covering the user journeys.

## Honest trade-offs before you commit

A migration guide that only lists upsides is marketing. Here is the balanced view.

**Determinism.** A `Selector` either matches or it does not. An agent makes judgment calls, and on an ambiguous page two runs can take slightly different paths to the same goal. For most end-to-end checks that is fine — you care about the outcome. For a test that must do an exact sequence in an exact order, a scripted tool is more predictable. Write objectives with clear success conditions and the variance stays low; vague objectives invite vague behavior.

**Speed and cost.** TestCafe executes a fixed script fast. An agent reasons between steps, which is slower per run, and if you use a hosted model there is a per-run cost. Local models keep the bill at zero but need decent hardware to run the mid-size models that handle long flows well. Be realistic about your machine and your model choice.

**The small-model caveat, again.** It bears repeating because it is the single most common reason a migration disappoints. An 8B local model will stumble on a ten-step checkout. A 70B-class local model or a capable hosted model will not. If your first runs feel flaky, the model is usually the variable to change before you blame the approach.

**What you give up.** `RequestMock`, fine-grained request interception, and the proxy as a network inspector. If those are load-bearing in your suite, keep that part in TestCafe. There is no shame in a hybrid setup; it is the correct setup.

## When to migrate and when to stay

Here is the decision, stated plainly.

**Migrate to AI objectives when:** your suite is dominated by user-journey tests, selector and timing maintenance is eating your week, your app fights the TestCafe proxy (CSP, Service Workers, SSO redirects), and you want tests that read like acceptance criteria your whole team can review. This is the sweet spot, and it is a large chunk of most suites.

**Stay on TestCafe — or run a hybrid — when:** you depend heavily on `RequestMock` and request interception, you need exact deterministic step sequences for compliance, your tests assert on wire-level mechanics rather than visible behavior, or your team is happy and your suite is stable. A working suite that nobody is fighting does not need a migration. The [case studies](https://browserbash.com/case-study) show the kinds of flows where teams found the switch paid off, which can help you judge your own.

The honest summary: BrowserBash is the better fit for behavior-level UI journeys and for apps that the proxy model fights. TestCafe remains a strong, well-designed tool for mock-heavy and protocol-level testing. Most mature teams will run both for a while, and some will keep both permanently. That is a healthy outcome, not a failure of either tool.

## FAQ

### Can I automatically convert TestCafe tests to BrowserBash?

There is no mechanical transpiler, and that is by design. TestCafe tests encode *how* to find and act on elements through selectors, while BrowserBash objectives describe *what* outcome you want. You rewrite each test as a plain-English objective or a Markdown test, which is usually shorter than the original. Start with your flakiest user journeys, since those are where the selector-free approach pays off fastest.

### Does BrowserBash work without the proxy that TestCafe uses?

Yes. BrowserBash drives a real Chrome or Chromium browser directly on the default local provider, with no URL-rewriting proxy in the path. That means pages with strict CSP, Service Workers, or SSO redirects — classic TestCafe proxy pain points — generally load and behave exactly as they do in production. The trade-off is that you lose the proxy as a network inspection and request-mocking layer.

### How do I handle login and authentication after migrating?

Write the login flow once as a Markdown test using `{{variables}}` for credentials, and mark the password as a secret so it is masked as asterisks in every log line. Then reuse it across other tests with `@import`, which is the analog of a TestCafe `Role`. The main difference is that a fresh agent-driven browser usually re-runs login per suite rather than caching a role, so group related checks together to log in less often.

### Is migrating to an AI automation CLI free?

The BrowserBash CLI is free and open-source under Apache-2.0, and it is Ollama-first, so it defaults to free local models with no API key and no data leaving your machine. You can run an entire migrated suite at a zero model bill on local models. Hosted models like Anthropic Claude or OpenRouter are optional if you want them, and the optional cloud dashboard with run history and video replay is free and opt-in.

Ready to start the migration? Install the CLI with `npm install -g browserbash-cli`, port one flaky user journey to a plain-English objective, and run it against your staging environment. No account is required to run anything locally; if you later want the free cloud dashboard for run history and video replay, you can [sign up](https://browserbash.com/sign-up) at any time.
