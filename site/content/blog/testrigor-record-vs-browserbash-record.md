---
title: "testRigor Recorder vs browserbash record: Free vs Paid Capture"
description: "testrigor recorder vs browserbash record compared: paid cloud capture vs a free, open-source CLI that writes plain-English tests you own."
date: 2026-07-11
category: comparison
---

If you have watched a testRigor demo, you have probably seen the same moment that sells most people on the product: click through a signup flow once, and the tool hands back a test written in plain English. That "record once, get English forever" idea is genuinely good, and it is the reason a lot of teams start evaluating testRigor recorder vs browserbash record in the first place. What often gets glossed over is that testRigor's recorder lives behind a paid plan and a hosted account, while browserbash record ships free inside an open-source CLI you install with one npm command. Both convert a click-through session into a readable test file. They differ in almost everything else: who owns the file, where it runs, what it costs at scale, and how much of the underlying engine you can actually see. This article walks through the real differences, not the marketing versions, so you can decide which one fits how your team actually tests.

## What testRigor Recorder Actually Does

testRigor is a commercial, AI-based test automation platform built around natural-language test steps: instead of writing Selenium-style code, you write instructions like "enter random email" or "click Submit" and testRigor's engine interprets them against the live page using its own vision and DOM analysis. The recorder extension is the on-ramp to that system. You install a browser extension or use their in-app recording mode, click through a user flow (sign up, add to cart, checkout, whatever you are validating), and stop the recording. testRigor converts the captured actions into its plain-English step syntax and drops the result into your test suite inside their web application.

The output reads close to a manual test case a QA analyst would write by hand: "Click 'Add to Cart'", "Click 'Checkout'", "Enter '4242 4242 4242 4242' into 'Card Number'". testRigor's pitch is that this readability means non-engineers, product managers, manual QA, even support staff, can maintain and extend tests without touching code. That is a real strength for organizations that want testing to sit closer to the business than to the engineering team. The tests execute on testRigor's own cloud infrastructure with their own AI models interpreting the natural-language steps at runtime, which is also where the format's flexibility ("robust" element matching independent of DOM structure) comes from: it is not fragile CSS selectors, it is the platform's own vision and text matching working against the rendered page.

The specifics of testRigor's current pricing tiers, seat limits, and exact plan names are not publicly specified in a way that is stable enough to quote reliably here, and they change. What is consistently true across every account tier is that the recorder, the execution engine, and the storage for your recorded tests live inside testRigor's paid, hosted product. There is no free, self-hosted way to run the testRigor engine against your own infrastructure.

## What browserbash record Actually Does

browserbash record does a similar job with a different execution model. `browserbash record <url>` opens a real, visible browser window on your machine. You click through the same kind of flow, whatever you would otherwise hand-write a test for, and when you are done you press Ctrl-C. The capture script converts what you did into a plain-English `*_test.md` file: a markdown document with numbered steps that reads like instructions you would give a human tester. It also pre-warms browserbash's replay cache for that flow, so the very first run after recording can execute deterministically without spending a model call.

```bash
browserbash record https://app.example.com/signup
```

The resulting file is not a proprietary format locked in a vendor's database. It is a `.md` file that lands wherever you point it, typically `.browserbash/tests/` in your project, and you commit it to your own git repository like any other test asset. There is no account required to record it, no seat to license, and no cloud dependency to make the capture happen. The whole flow, browser launch, click capture, and English generation, runs locally as part of the free, open-source `browserbash-cli` npm package.

One detail that matters more than it looks: password fields never leave the page during recording. The capture script sends only a secret marker back to the recorder, not the literal password you typed, and the generated step reads `Type {{password}} into ...` rather than embedding your credential in the test file. That is a deliberate design choice for a tool whose output is meant to be committed to a public or shared repository, which is a context testRigor's hosted, access-controlled test library was never built to satisfy in the same way.

## testrigor recorder vs browserbash record: The Core Difference

Strip away the UI and the pitch decks, and the testrigor recorder vs browserbash record comparison comes down to one axis: where does the "brain" live, and who owns the artifact it produces?

testRigor's recorder feeds a proprietary AI engine that runs exclusively on testRigor's cloud. You get a readable test, but the interpretation logic that turns "click Submit" into actual browser actions at execution time is not something you can inspect, self-host, or run offline. Your recorded tests are assets inside a testRigor account, and if you ever want to leave the platform, you are exporting text out of someone else's system, not moving files that were already yours.

browserbash record produces a markdown file that behaves the same way whether you open it in VS Code, diff it in a pull request, or hand it to a different automation tool entirely. The engine that later executes the file (`stagehand` by default, or `builtin`, an in-repo Anthropic tool-use loop) is part of the same open-source package that recorded it. You can read the source. You can run it against a local Ollama model with nothing leaving your machine, or point it at a hosted model when you need more reasoning power for a hard flow.

Neither approach is objectively wrong. testRigor optimizes for a polished, all-in-one platform experience with execution infrastructure, reporting, and test management bundled together, aimed at teams who want a vendor to own the operational complexity. browserbash optimizes for ownership, transparency, and cost control, aimed at teams (and individual engineers, and AI coding agents) who want a CLI tool that behaves like the rest of their toolchain: files in git, no forced hosting, free by default.

## Pricing and Access: Free vs Paid Capture

This is the part of the comparison that is easiest to state plainly. testRigor's recorder and the platform around it require a paid subscription to access beyond whatever trial period they currently offer; exact tier pricing is not publicly specified here because it changes and varies by seat count and usage. browserbash is Apache-2.0 licensed and free, full stop, including the `record` command, the replay cache, the local dashboard, and the MCP server. There is no tier where recording or running tests locally requires payment.

| Dimension | testRigor Recorder | browserbash record |
|---|---|---|
| License / cost | Paid plans (trial available); pricing not publicly fixed here | Free, open-source (Apache-2.0) |
| Where it runs | testRigor's cloud only | Your machine (local Chrome/Chromium) |
| Output format | testRigor's plain-English steps, stored in their app | Plain-English `*_test.md` file you own |
| Execution engine visibility | Proprietary, not inspectable | Open source, `stagehand` or `builtin` |
| Model / AI dependency | testRigor's own hosted AI | Ollama-first (local, free), or bring-your-own Anthropic/OpenAI/OpenRouter key |
| Secret handling during capture | Not publicly detailed | Password fields captured as a marker only, never the literal value |
| CI/agent integration | Via testRigor's own CI hooks | NDJSON `--agent` mode, MCP server, GitHub Action |
| Test ownership after cancellation | Export required from vendor platform | Already a file in your repo |

The cost delta compounds with usage. A team running hundreds of recorded flows a month on testRigor is paying for seats and execution minutes on their infrastructure indefinitely. A team using browserbash record is paying nothing for the tool itself; the only recurring cost, if any, is optional API usage if you choose a hosted model instead of a local one, and the replay cache specifically exists to keep that cost near zero for stable flows because a green run replays its recorded actions instead of calling a model again.

## How the Generated Tests Look and Where They Live

testRigor's recorded steps live inside their web app's test editor. You can view and lightly edit them there, organize them into test suites within the platform, and attach them to their scheduling and CI integrations. The format is proprietary to testRigor: it is readable English, but the grammar and the runtime that interprets it are specific to their engine, so a testRigor test does not run anywhere except testRigor.

A browserbash-recorded file is a markdown document with a title, a numbered list of steps, and optional `{{variable}}` placeholders for anything the recorder marked as sensitive or reusable. Here is roughly what a recorded checkout flow looks like after you run `browserbash record`:

```markdown
# Checkout flow

1. Go to https://shop.example.com/cart
2. Click "Proceed to Checkout"
3. Type {{email}} into the Email field
4. Type {{password}} into the Password field
5. Click "Place Order"
6. Verify text "Order confirmed" is visible
```

That file runs the same way any hand-written browserbash test does: `browserbash testmd run ./.browserbash/tests/checkout_test.md`. You can `@import` shared steps into it, template it with variables for different environments, and add deterministic `Verify` assertions after the fact even if the recorder itself only captured navigation and clicks. If you opt into `version: 2` frontmatter, you can even mix recorded UI steps with deterministic API seeding steps in the same file, which the recorder alone will not generate for you but which you can hand-add:

```markdown
---
version: 2
---
# Checkout flow with seeded cart

1. POST https://api.example.com/cart/seed with body {"sku": "ABC123", "qty": 1}
   Expect status 201, store $.cartId as 'cartId'
2. Go to https://shop.example.com/cart/{{cartId}}
3. Click "Proceed to Checkout"
4. Verify 'Place Order' button visible
```

That kind of hybrid, API-plus-UI file is possible because the recorded output is just markdown text sitting next to hand-written steps in the same repo, not a record locked inside a vendor's editor.

## Model and Infrastructure: Cloud AI vs Local-First

testRigor's execution model routes every step through their hosted AI at runtime, which is consistent with the product being a fully managed platform: you are trusting their infrastructure and their model choices, and you are not expected to configure or swap the underlying engine.

browserbash inverts that by default. Its model resolution order tries a local Ollama model first, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, and only errors out with setup guidance if none are configured. That means a recorded test can, in principle, replay and even re-heal (when the page has drifted since recording and the cache needs the agent to step back in) entirely on your machine with a local model and zero API spend. The honest caveat here: very small local models, in the 8B-and-under range, get flaky on longer multi-step objectives. If your recorded flow is more than a few steps or has branching logic, a 70B-class local model (Qwen3 or Llama 3.3 class) or a capable hosted model handles it far more reliably. testmd v2's API-step grammar currently needs the builtin engine, which means an `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway rather than Ollama directly, at least for now.

The practical upshot is that testRigor gives you a single, predictable execution environment you never have to think about, while browserbash gives you a dial: free and private for straightforward flows, or a paid model for the flows that genuinely need more reasoning. Which one you want depends on whether you value predictability or control more.

## CI/CD and Automation Workflows

testRigor integrates with common CI systems through its own hooks and dashboard, letting you trigger recorded suites from your pipeline and pull results back into their reporting UI. That is a mature, purpose-built workflow if you are already standardized on their platform for reporting and test management.

browserbash was built with the assumption that the primary "user" running these tests might not be a person at all, it might be an AI coding agent or a CI runner. The `--agent` flag emits NDJSON, one JSON event per line, with `step` and `run_end` events and frozen exit codes (0 passed, 1 failed, 2 error, 3 timeout) that scripts can parse without touching prose output. The `browserbash mcp` command serves the CLI over the Model Context Protocol on stdio, so tools like Claude Code, Cursor, or Codex can call `run_test_file` on a recorded test directly and read back a structured verdict (status, summary, assertions, cost estimate) as part of their own workflow, no separate dashboard login required. There is also an official GitHub Action that installs the CLI, runs your suite (recorded or hand-written), uploads JUnit and NDJSON artifacts, and posts a self-updating PR comment with a verdict table, documented at the [BrowserBash GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md). For teams running many recorded flows at once, `run-all --shard 2/4 --budget-usd 2` splits a suite deterministically across CI machines and stops launching new tests once spend crosses a budget, which is the kind of cost governance a free, self-hosted tool needs and a fully managed platform handles differently by billing you for usage instead.

```bash
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

## Security and Secret Handling During Recording

This is worth calling out on its own because recorder tools, by nature, watch you type into forms, and login flows are exactly the kind of thing teams need to record. testRigor's specific handling of credentials captured during recording is not publicly detailed in a way this article can responsibly quote, so if that matters for your compliance posture, ask their sales team directly before you record a production login flow through their extension.

browserbash's approach is explicit and verifiable because the code is open: password fields never leave the page during capture. The recorder script sends only a secret marker back, never the literal value, and the generated test reads `Type {{password}} into ...`, a variable reference rather than a hardcoded string. That variable then gets resolved from your own `variables/*.json` file or environment at run time, and every log line masks secret-typed variables as `*****`. Because you can read the actual `browserbash-cli` source on [GitHub](https://github.com/PramodDutta/browserbash), you are not taking a vendor's word for how secrets are handled during recording, you can verify it yourself, which matters a lot more once a recorded login flow gets committed to a shared repository.

## When to Choose testRigor

testRigor makes sense when your organization wants a single managed platform and is willing to pay for it: hosted execution, a built-in test management UI, non-engineers authoring and maintaining tests without ever opening a terminal, and a vendor relationship for support when something breaks. If your team's QA function is largely manual testers transitioning toward automation, and you want the recorder to be the entire authoring interface with minimal CLI or git involvement, testRigor's all-in-one product removes friction that a CLI tool inherently has. It is also a reasonable fit if you specifically need testRigor's broader feature set beyond recording (their generative testing, mobile support, or specific reporting integrations) and the recorder is just the entry point into a platform you were already going to adopt.

## When to Choose browserbash record

browserbash record fits teams and individual engineers who want the recorded-test convenience without giving up ownership of the output or committing to a recurring platform bill. It is a strong fit if you already keep tests in git alongside application code and want recorded flows to slot into that same repo as markdown files, reviewable in pull requests like everything else. It is also the more natural choice if AI coding agents are part of your workflow already, since the [BrowserBash MCP server](https://browserbash.com/features) lets an agent record, run, and verify a flow as part of its own loop, not through a separate web dashboard a human has to check. And if API cost or vendor lock-in worries you, the Ollama-first model resolution means a recorded flow can run entirely offline with zero per-run cost for straightforward cases, while still letting you point at a hosted model when a flow genuinely needs stronger reasoning.

## Making Them Work Together (or Choosing One)

Some teams will run both, at least temporarily: testRigor for a broader test management initiative where non-engineers need a UI, and browserbash for the tests that live in the engineering repo and need to run as part of CI or an agent's own validation loop. That is a reasonable hybrid if your organization has both audiences. But if you are choosing one tool to standardize on, the deciding question is usually not "which recorder captures actions more accurately" (both do a competent job at that), it is "do we want our tests to live as files we own, or as records inside a vendor's platform." That answer usually settles the rest of the decision for you.

If you are still evaluating, the lowest-risk way to find out which model fits is to try recording the same flow both ways. Because browserbash is free and installs in one command, there is no real cost to running that comparison yourself before committing to a paid testRigor seat. Check the [BrowserBash learn docs](https://browserbash.com/learn) and the [tutorials](https://browserbash.com/tutorials) for a walkthrough of recording, running, and wiring a test into CI, and browse the [BrowserBash blog](https://browserbash.com/blog) for more head-to-head comparisons like this one.

## FAQ

### Does browserbash record require an account or API key?

No. Recording, running, and the local dashboard all work with just the free `browserbash-cli` npm package installed. If you want stronger reasoning for complex flows you can add an Anthropic, OpenAI, or OpenRouter API key, and browserbash will also try a local Ollama model automatically before asking for any key at all.

### Can I edit a browserbash-recorded test after it is generated?

Yes. The output is a plain markdown `*_test.md` file, so you can open it in any editor, add or remove steps, insert `{{variables}}` for reusable values, add deterministic `Verify` assertions, or `@import` shared step blocks from other test files, exactly like a test you wrote by hand.

### Is testRigor's recorded test format compatible with browserbash or other tools?

Not directly. testRigor's plain-English steps are proprietary to its execution engine and are stored and run inside their platform. browserbash's `*_test.md` format is an open markdown grammar that runs against browserbash's own engine (stagehand or builtin), so a test recorded in one tool is not portable into the other without rewriting it.

### Does browserbash record capture passwords in plain text?

No. Password fields are never captured as literal values during recording. The capture script sends only a secret marker, and the generated test step reads `Type {{password}} into ...`, a variable reference that gets resolved at run time and masked as `*****` in every log line.

If you want to see the difference for yourself, `npm install -g browserbash-cli` and run `browserbash record` against a flow you already test manually. It takes a few minutes, it is free, and you can compare the output directly against whatever your current recorder produces. Sign-up at [browserbash.com/sign-up](https://browserbash.com/sign-up) is optional and only needed if you want the hosted dashboard later.
