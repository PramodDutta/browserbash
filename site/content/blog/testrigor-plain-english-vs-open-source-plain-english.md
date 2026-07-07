---
title: testRigor Plain-English vs Open-Source Plain-English Tests
description: "Both write tests in English: one is a paid cloud platform, the other a free local CLI with git-committed tests. Compare syntax, cost, and control."
date: 2026-07-05
category: comparison
---

Two testers on the same QA team get handed an identical ticket: turn "log in, add a product to the cart, complete checkout, verify the thank-you message" into a regression test a pipeline can run on every pull request. Priya writes it inside her company's testRigor workspace, against a seat the company pays for every year. Marcus writes the same flow as a file named `checkout_test.md` and commits it next to the code it tests. Both finish in about the same time. Both tests read like the same paragraph of English. That is exactly where the resemblance ends.

Everything that happens next, where the test lives, who can read it without logging in, what it costs to run ten thousand times a month, and whether it still runs the day the company cancels a subscription, depends on which flavor of "plain English testing" it was born into. This is not another full feature bake-off between the two products. It stays narrow on purpose, on the three things that actually decide a renewal or a migration: **hosting** (whose infrastructure the test runs on), **cost** (what the bill looks like past the demo), and **control** (who owns the artifact, and what "leaving" involves). testRigor and BrowserBash agree on the premise: selectors are a maintenance tax and English is a better interface for intent. They disagree about almost everything downstream of that sentence.

## Same premise, opposite delivery mechanism

testRigor is a commercial test automation platform built around plain-English authoring. You write steps like "click on 'Login'", "enter stored value 'email' into 'Email'", or "check that page contains 'Order confirmed'", and its own inference layer turns that into browser, mobile, or desktop actions. It is a hosted product: your test definitions live inside testRigor's application, and runs execute on infrastructure testRigor operates. That is a reasonable design for a company that wants one vendor accountable for uptime and model behavior, and a real reason testRigor has traction with QA organizations that would rather not run any of that themselves.

[BrowserBash](https://browserbash.com), a free, open-source (Apache-2.0) project from The Testing Academy, starts from the same sentence, write the test in English, and makes the opposite call on almost every axis after that. There is no hosted editor. Install it with `npm install -g browserbash-cli` and it drives a real Chrome or Chromium browser on whatever machine you run the command from. You choose the model that reasons about each step (local Ollama, your own Anthropic key, OpenAI, or OpenRouter), you choose where the browser executes, and the resulting test is a plain text file that never touches a server you do not control unless you ask it to.

Neither approach is a strictly better version of the other, they answer different questions. testRigor answers "how do I get a managed platform a non-technical tester can use without touching a terminal." BrowserBash answers "how do I get plain-English testing without handing my suite, my page content, and my recurring budget to someone else's cloud." Once you see it as two answers to two different questions, the rest of this comparison is just about which question is actually yours.

## The same test, written three ways

Before a file exists at all, there is a faster path from a sentence to a verdict: a one-shot objective, nothing to name and nothing to save.

```bash
browserbash run "Open https://shop.example.com, add the first product to the cart, complete checkout, and verify the page shows 'Thank you for your order'" --headless
```

That is the fastest path from English to a pass or fail. The moment you want the flow to run again next week, checked into source control, you save it as a file instead. Here is the BrowserBash version of Marcus's test:

```markdown
---
auth: shopper
---
# Checkout smoke test

- Open https://shop.example.com
- Add the first product on the page to the cart
- Complete checkout
- Verify: the page shows "Thank you for your order"
```

```bash
browserbash testmd run checkout_test.md --headless --agent
echo "exit: $?"   # 0 passed, 1 failed, 2 error, 3 timeout
```

The `auth: shopper` frontmatter line reuses a login session saved once with `browserbash auth save shopper --url https://shop.example.com/login`, so this test never types a password (more on why that matters below). Here is a testRigor-style script for the same flow, representative of its plain-English syntax rather than a literal export:

```
click on "Log In"
enter stored value "username" into "Username"
enter stored value "password" into "Password"
click on "Sign In"
click on the first product image
click on "Add to Cart"
click on "Checkout"
check that page contains "Thank you for your order"
```

That script lives inside testRigor's editor, tied to your account and workspace. The `checkout_test.md` file lives in your repository, next to the code it exercises. All three describe the same intent in roughly the same number of lines. The difference is not the vocabulary, it is what each becomes the moment you save it: a row in a vendor's database, or a text file `git log` can show you the entire history of.

## Hosting: whose infrastructure is your test actually on

testRigor executes on testRigor's cloud, a managed grid of browsers, mobile devices, and desktop environments you never provision, patch, or scale. Your page content, screenshots, and run history live on infrastructure you do not operate. For a team that wants zero infrastructure ownership, that's a feature, not a compromise.

BrowserBash's default is the opposite. `--provider local` runs on the Chrome already installed on the machine you invoked the command from, your laptop or your CI runner. Nothing about the file changes when you want more scale; one flag retargets it:

```bash
# Same checkout_test.md, four different places to actually run it
browserbash testmd run checkout_test.md --provider local                        # your machine (default)
browserbash testmd run checkout_test.md --provider cdp --cdp-endpoint ws://...  # any CDP endpoint
browserbash testmd run checkout_test.md --provider lambdatest                   # LambdaTest's cloud grid
browserbash testmd run checkout_test.md --provider browserstack                 # BrowserStack's cloud grid
```

That is "hosting" as a decision axis: with testRigor it was decided for you the day you signed up, with BrowserBash it is a flag you set per run, and the default costs nothing because it is hardware you already own. If your compliance posture requires that pre-production page content never leaves a machine you control, that difference alone can be the entire decision.

## Cost: seat math versus a dial you hold yourself

testRigor, like the rest of the enterprise plain-English category, is sold seat- or plan-based, quoted on a sales call. Current numbers are not worth quoting here because they move and get negotiated, but the shape is predictable: it scales with people and plan tier, it is a recurring line item, and the model inference that reads your pages is bundled into that fee, so you never see it as a separate number.

BrowserBash's cost model is structurally different: the CLI is free and the model is a choice you make. Point it at a local Ollama model and the marginal cost of running the same test a thousand times a day is your own electricity. Point it at a hosted model instead and you pay only for the tokens that specific run consumes, on your own key, with no seat count on top. Two mechanisms narrow the cost further on repeated suites: the replay cache, where a green run records its resolved actions and the next replays them with zero model calls, near-free until the page changes enough to need re-resolving, and `--budget-usd`, a hard spending ceiling on an entire suite:

```bash
# Stop launching new tests once the suite's estimated spend hits $2; exit code 2 on whatever is left
browserbash run-all .browserbash/tests --budget-usd 2 --junit out/junit.xml
```

That is a cost governance primitive most plain-English SaaS tools have no reason to expose, since their pricing is not metered per model call. The honest caveat: very small local models, roughly 8B parameters and under, get flaky on long, multi-step flows like a full checkout, they lose the thread halfway through. The free path is real, but the model you point at it still matters, a mid-size local model or a capable hosted model is the realistic floor for anything longer than a handful of steps.

## Control: who owns the file when you want to leave

This is the axis the other two roll up into, and the one people underestimate until they need it. A testRigor test is a row in testRigor's database, rendered through its editor. You can export a report or a recording, but the test as an executable object lives inside the platform. Cancel the seat and you are not left holding a file to hand a colleague or run elsewhere, you are left rebuilding the suite from whatever notes you kept on the side. That is a normal SaaS trade-off, one most teams accept happily in exchange for never operating infrastructure, but it is a real cost, and it shows up specifically at renewal time or during a vendor evaluation.

A BrowserBash `*_test.md` file is plain text, not an export format, it's the thing that ran. It diffs in a pull request, a reviewer reads the intent in the same review as the feature it tests, `git blame` shows who added a step and when, and `git revert` undoes a bad change to it the way it undoes one to the application. Leaving the tool requires nothing, the file was never inside it: `browserbash` reads a text file, it doesn't own one. Because the project is Apache-2.0, you can also read the code deciding what "click the login button" means on a page, a different kind of control than trusting a vendor's next model upgrade to behave the way it did last quarter.

Control cuts the other way too. A text file in a repository is only inspectable by people with repo access and a terminal. A manual tester or product manager who has never opened a Git client will find testRigor's hosted editor and visual run history a genuinely friendlier home for a test than a Markdown file and a command line. If the person editing the test is not an engineer, "it's a portable text file" is not an advantage, it is simply the wrong shape.

## What stays true no matter which one you pick

A few things hold for both approaches, worth naming so this stays honest rather than one-sided. Both are non-deterministic in that an AI decides, at run time, how to interpret a step against whatever the page looks like that day, so both benefit from an explicit assertion rather than the agent's general impression. BrowserBash's answer is a `Verify:` step, compiled into a real, deterministic check rather than a model's opinion of whether things "looked fine," returning expected-versus-actual evidence on failure:

```markdown
- Log in as {{user}} with {{password}}
- Add the featured product to the cart and check out
- Verify: the order confirmation banner reads "Thank you for your order"
```

testRigor's "check that page contains" steps sit inside the same tension: the more of a flow left to the model's judgment, the more you are trusting inference, and the more you pin down with explicit checks, the closer you get to a deterministic test wearing an English skin. Neither tool escapes that trade-off, they just hand you the dial in a different place: one inside a hosted editor, one inside a text file you already control.

## testRigor vs BrowserBash: hosting, cost, and control at a glance

| | testRigor | BrowserBash |
| --- | --- | --- |
| Hosting default | Vendor-managed cloud grid | Your own machine (`--provider local`) |
| Change where it runs | Not user-configurable | One flag: `cdp`, `browserbase`, `lambdatest`, `browserstack` |
| Base cost | Seat or plan, sales-quoted | Free, open source (Apache-2.0) |
| Model cost | Bundled into the platform fee | Free on local Ollama, or metered on your own key |
| Cost ceiling you set | Not applicable | `--budget-usd` hard stop on a suite |
| Repeat-run cost | Same as any other run | Replay cache: near-zero on a stable, green flow |
| Test artifact | Row in the vendor's database | Plain-text `*_test.md` file |
| Version control | Not the primary workflow | Native: commit, diff, review, `git revert` |
| Leaving the platform | Rebuild the suite elsewhere | Nothing to migrate, the file already runs anywhere |
| Best-fit author | Non-technical tester, hosted editor | Engineer or AI agent, repo and terminal |

## Which one is actually yours to choose

If your testers do not use a terminal, want one vendor accountable for uptime and model behavior, or need native mobile and desktop coverage alongside web, testRigor's managed platform is doing what it's built for, and the seat cost is the price of not operating any of that yourself.

If your constraint is closer to "I do not want page content leaving this machine," "I cannot justify a seat-priced tool for a five-person team," or "I want the test to be a file my CI pipeline and reviewers already understand," BrowserBash is built for that gap. It's also the shape an AI coding agent wants: `claude mcp add browserbash -- browserbash mcp` exposes `run_objective`, `run_test_file`, and `run_suite` as callable tools, each returning the same structured `run_end` verdict, including `assertions` and `cost_usd`, so [Claude Code, Cursor, or Codex can validate their own UI changes](https://browserbash.com/features) without a seat, an account, or a network call to a third party.

## FAQ

### Is BrowserBash a real alternative to testRigor, or just a smaller clone?

It's not a clone in the "same product, fewer features" sense, it's a different architecture for the same idea. testRigor is a hosted platform spanning web, mobile, and desktop. BrowserBash is a single-purpose, open-source CLI for browser automation, local by default, moving to a cloud grid only when a flag asks it to. If you need managed mobile and desktop testing in one product, testRigor covers ground BrowserBash doesn't attempt; if you need a free, portable, git-native way to test a web app, BrowserBash is a complete answer, not a partial one.

### Can I export my tests out of testRigor and run them in BrowserBash?

No, there's no automated converter from testRigor's hosted format into `*_test.md`. BrowserBash ships `browserbash import`, which turns existing Playwright specs (`*.spec.ts` / `*.test.ts`) into plain-English test files, a practical path for teams coming from a code-based framework rather than another plain-English SaaS. Moving off testRigor specifically means re-authoring the flows by hand, same as moving off any hosted test format.

### Does BrowserBash have the same assertion strength as testRigor's "check that" steps?

Both let you write a hard, explicit check instead of relying on general model judgment. BrowserBash's `Verify:` steps compile to real, deterministic assertions that return expected-versus-actual evidence on failure, driving the exit code the same way any other failed step would. The philosophy is shared: the more you pin down with an explicit assertion, the less the result depends on the model's interpretation of "looks right."

### Which one is cheaper for a small team?

For a small team, BrowserBash is close to strictly cheaper. The CLI is free, and a local Ollama model keeps the model cost at zero too, so the only real spend is your time and hardware. testRigor's seat-based pricing suits teams that want a managed platform and are willing to pay for it. It's not meant to be the cheapest option for a five-person team running a handful of smoke tests, a fair trade for what the platform takes off your plate.

### Does either tool keep my data private by default?

BrowserBash does, by construction. On a local model, the browser, the tool, and the model all run on your machine, nothing transmitted unless you explicitly run `browserbash connect` and pass `--upload`. testRigor's execution happens in its managed cloud by design, so your page content and run history live there as normal operation. Neither is wrong, they're different defaults for different risk tolerances.

### Can BrowserBash run in CI the same way testRigor does?

Yes, though the contract differs. BrowserBash emits NDJSON events in `--agent` mode and exits with a stable code (0 passed, 1 failed, 2 error, 3 timeout), so a pipeline gates on a shell exit code rather than a hosted dashboard's report. testRigor integrates with CI/CD through its own plugins and a hosted runner. If your pipeline already thinks in exit codes and would rather not add a network dependency to your gate, the CLI contract is simpler to reason about.

---

Written and run with `browserbash testmd run`, not a hosted editor: install with `npm install -g browserbash-cli` and write your first plain-English test as a file you actually own.
