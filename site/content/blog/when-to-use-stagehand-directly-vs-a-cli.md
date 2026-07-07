---
title: When to Use Stagehand Directly vs a Ready-Made CLI
description: "BrowserBash runs on Stagehand, so when should you code against Stagehand yourself? Compare control, CI wiring, and time to a first passing test."
date: 2026-07-05
category: comparison
---

Your team's checkout flow just shipped a redesign, and your manager wants a smoke test in the PR pipeline before Monday: log in, add an item to the cart, pay, confirm the receipt page still says "Thank you for your order!" You have used Stagehand before, on a scraping project last quarter, and your first instinct is reasonable: spin up a small TypeScript project, `npm install @browserbasehq/stagehand`, call its `agent()` primitive against the flow, wrap the result in a script that exits non-zero on failure, point CI at it. By Thursday you could have something working.

That instinct is not wrong. It is also not obviously right, because the same afternoon you could run `npm install -g browserbash-cli`, write the identical flow as one English sentence, and get a pass/fail verdict with a real exit code before your coffee gets cold. Here is the detail that makes this different from the usual "which library wins" post: BrowserBash's default engine is Stagehand. When it drives your browser, it calls the same `agent()` method you were about to call by hand. This is not a contest between two automation architectures, for the common case they are the same architecture. The real question is what you want to own for the next twelve months: a program you wrote, or a CLI someone else maintains.

## This is build-vs-buy, not an internals comparison

It is tempting to write this as "Stagehand vs BrowserBash," the way you'd compare two competing frameworks. That framing does not hold up: BrowserBash is not a competing framework, it is an operational layer on top of Stagehand (MIT, built by Browserbase), plus a second, in-repo engine called `builtin` used automatically when you point at a grid Stagehand cannot attach to, like LambdaTest or BrowserStack. For the default path, local Chrome or a CDP endpoint, BrowserBash's "engine" is Stagehand's own agent mode, unmodified.

So the real decision is not "which one drives a browser better." It's the older engineering question: build or buy. Do you write and maintain the harness yourself, model client, CI contract, secrets, artifacts, caching, or install something that already made those calls for you? Both are legitimate, depending on what you're building. The rest of this article is about picking correctly, not which side is "better."

## The two ways to write Stagehand yourself

Going direct actually means choosing between two different postures.

**Autonomous, via `agent()`.** This is the closest analog to what BrowserBash does. You hand Stagehand a natural-language goal and let its agent loop decide what to click, type, and read, across as many steps as it needs:

```typescript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({ env: "LOCAL", model: "claude-opus-4-8" });
await stagehand.init();

const agent = stagehand.agent();
const result = await agent.execute(
  "Log in at https://shop.example.com as standard_user, add the first " +
  "product to the cart, complete checkout, and verify the page shows " +
  "'Thank you for your order!'"
);

await stagehand.close();
```

That is close to line-for-line what BrowserBash's own Stagehand engine does under the hood. If this is the shape of code you were about to write, you were about to reimplement a chunk of BrowserBash, without the parts described below.

**Control-first, via `act()` / `extract()` / `observe()`.** This is a genuinely different posture: you script the deterministic parts yourself and only call the model at the one step where a selector would be brittle.

```typescript
const page = stagehand.page;
await page.goto("https://shop.example.com/login");
await page.act("log in as standard_user");
await page.act("add the first product to the cart");

const { total } = await page.extract({
  instruction: "read the cart subtotal",
  schema: z.object({ total: z.string() }),
});
```

(Stagehand's API moves fairly often, treat exact signatures as directional and check current docs.) This posture is where writing Stagehand directly earns its keep: real branching, real loops, a model call scoped to exactly one line, none of which a plain-English CLI expresses as cleanly.

## What you sign up to build if you go direct

None of the following is hard in isolation. Added up, it is the difference between a script and a tool your team can trust in CI for a year.

- **A model client.** SDK wiring, API keys in a secrets manager, a decision for when that provider has an outage.
- **A pass/fail contract.** What exit code does a timeout get versus an assertion failure versus a browser crash? Skip this and the first outage becomes an argument about definitions, not the bug.
- **Secret handling.** Nothing in a raw `act("log in with password hunter2")` call stops that password landing in a log line. You build the masking yourself.
- **Artifacts on failure.** A screenshot, ideally a video or trace, uploaded somewhere your team actually looks.
- **A cache.** Nothing stops `agent.execute()` from re-planning, and re-billing, the whole flow on every CI run. A green run replaying deterministically next time is a feature you build.
- **A suite runner.** Parallelism that won't exhaust the CI box's memory, retries scoped to infra flake only, a JUnit report your dashboard understands.
- **An interface for other tools.** Want Claude Code or Cursor to call your harness as a tool instead of a shell command? That's an MCP server you write and maintain.

Each is a modest task. Together they're the actual cost of "just write it in Stagehand," and the reason a checkout smoke test that looked like a Thursday-afternoon script is still getting patched eight months later.

## Where writing Stagehand directly is the right call

To be fair to the other side: there are real situations where a CLI is the wrong abstraction and reaching for the library is correct.

- **Automation is embedded inside a larger application.** A backend job that logs into a vendor portal and pulls a report as one step in a bigger pipeline wants a library call, not a subprocess.
- **The flow needs real control flow.** Loops, conditionals, "retry with a different strategy if it fails twice", anything that can't be a flat list of English steps belongs in code.
- **You already have a mature Playwright suite.** If most of the test is fast, deterministic Playwright and you want AI at one brittle step, `act()` dropped into an existing spec beats replacing the whole test.
- **You're building your own tool on top.** For a framework or product, not a test, you want the clean primitives underneath, not an opinionated CLI layered on them.
- **You need runtime control over the model.** Per-request provider switching, custom backoff, streaming output into your own UI: programmatic control a CLI flag interface won't fully expose.

If any of those are your actual problem, writing Stagehand directly is the right call, and the "hidden plumbing" above is simply the cost of doing that job properly.

## Where a ready-made CLI is the right call

The mirror case is at least as common: you need a verdict, not a program.

[BrowserBash](https://browserbash.com/features) is a free, open-source (Apache-2.0) CLI from The Testing Academy, running on Stagehand by default. Install it once and describe the flow instead of coding it:

```bash
npm install -g browserbash-cli

browserbash run "Log in at https://shop.example.com as standard_user, add \
the first product to the cart, complete checkout, and verify the page \
shows 'Thank you for your order!'" --agent --headless
```

`--agent` puts the run into machine mode: stdout becomes NDJSON, one JSON event per step plus a terminal `run_end` event, and the process exits `0` on pass, `1` on fail, `2` on error, `3` on timeout. That is the entire CI contract, already frozen, already documented, already something your pipeline can branch on without parsing prose.

For flows you want under version control and reviewed like code, BrowserBash has a committable test format:

```markdown
---
version: 2
auth: staging
---
# Checkout with seeded data

- POST {{base_url}}/api/seed with body {"sku": "tshirt-red"}
- Expect status 201, store $.order.id as 'order_id'
- Open {{base_url}}/cart
- Click the checkout button
- Verify the URL contains 'checkout'
- Verify the 'Thank you for your order!' heading is visible
- Verify stored 'order_id' equals '{{expected_id}}'
```

That's a `testmd` v2 file (opt in with `version: 2` frontmatter; v1 files stay a single joined objective, and v2 currently runs on the `builtin` engine rather than the default `stagehand` engine, worth knowing before you commit to it). The `POST`/`Expect` lines run as plain HTTP with no model involved, and the `Verify` lines compile to real Playwright checks, not agent judgment: a pass means the condition actually held, and a fail comes back with expected-versus-actual evidence in `run_end.assertions`. That's the "but I need real control" objection answered better than it first looks: a chunk of the control you'd reach for raw Stagehand to get is already a deterministic step inside the CLI.

The rest of the plumbing from the section above is already wired up: `auth save <name>` for a reusable login session instead of re-authenticating every run, a replay cache so a passing test replays with no model call next time, `--budget-usd` to hard-stop a suite before it overspends, `--shard i/n` and `--matrix-viewport` for parallel CI and cross-viewport coverage, an official GitHub Action with a PR-comment verdict table, and `browserbash mcp` so an AI coding agent can call the whole thing as a tool (`claude mcp add browserbash -- browserbash mcp`, and Claude Code, Cursor, or Codex can validate their own UI changes without you writing an MCP server by hand). That's the exact list from "what you sign up to build if you go direct," already built and free.

## What you don't lose by starting with the CLI

This decision is not permanent. Because BrowserBash's default engine is literally Stagehand's `agent()` primitive, choosing the CLI first does not strand you on a dead-end abstraction. If a flow outgrows what a CLI can express, needs real loops, needs to be one call inside a bigger service, you already understand the engine underneath it. Graduating to raw Stagehand is "keep the mental model, drop the wrapper," not "start over."

Two honest caveats for either path. Model size matters regardless of who is calling Stagehand: very small local models (roughly 8B parameters and under) get flaky on long, multi-step objectives whether you drive them yourself or through a CLI. A mid-size local model (Qwen3 or Llama 3.3 70B-class) or a capable hosted model earns its keep past a handful of steps. And BrowserBash's model resolution for `auto` tries a local Ollama install first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter, so the whole comparison above can run at a genuine $0 model bill; writing Stagehand directly needs the same model access, you're just the one wiring the fallback order.

## A decision checklist

| If this describes your situation | Reach for |
| --- | --- |
| Automation is one feature inside a bigger app or service | Stagehand directly |
| The flow needs loops, conditionals, or custom retry logic | Stagehand (`act`/`extract`/`observe`) |
| Mature Playwright suite, want AI at one brittle step | Stagehand, dropped into the existing spec |
| Building your own testing tool or product on top | Stagehand directly |
| Want a pass/fail verdict from English, today, no Node project | BrowserBash |
| Team writing tests is QA/SDET, not TypeScript engineers | BrowserBash |
| Need CI contract, budgets, sharding, or MCP access now | BrowserBash |
| Want tests reviewable in a PR by anyone on the team | BrowserBash (`testmd`) |

## FAQ

### Is BrowserBash a replacement for Stagehand?

No. BrowserBash is built on Stagehand and its default engine calls Stagehand's own `agent()` primitive, so it's a batteries-included wrapper, not a competing framework. Embedding automation inside a larger TypeScript application still calls for the Stagehand library directly. Wanting a runnable verdict from a plain-English flow without writing or maintaining a program is the specific gap BrowserBash closes.

### Can I use BrowserBash and my own Stagehand code together?

Not in the same process, BrowserBash is a CLI and test runner, not an importable library. But `--cdp-endpoint` lets it attach to any browser you already manage over the Chrome DevTools Protocol, including one launched by your own Playwright or Stagehand code, so the two can share a session where that matters.

### Do I lose Stagehand's reliability model by using a CLI instead of the library?

No. BrowserBash's default engine is Stagehand's own agent mode, so the underlying run characteristics match calling Stagehand yourself. What you gain on top is a frozen CI contract, secret masking, a replay cache, and a committable test format, none of which changes how the automation itself behaves.

### When does writing Stagehand directly actually save time over a CLI?

When the flow needs real control flow, loops, conditionals, retry strategies that can't be phrased as a flat list of English steps or deterministic `Verify` assertions, or when the automation is one feature inside a bigger application rather than a standalone test. In those cases a CLI fights you; a library gets out of the way. For a standalone flow you just need a verdict on, the CLI tends to be faster to a first passing test in our experience, though the exact time saved varies by team and flow.

### Does BrowserBash require an API key to try?

No. It resolves models in order: local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter if configured, so it can run entirely on free local models with nothing sent to a third party. Stagehand used directly needs the same kind of model access, you're just the one wiring the client and the fallback order.

Whichever side you land on, the underlying engine is the same, so decide by the shape of your job, not by which name sounds more sophisticated. If the job is "verify this flow and give me a verdict in CI," install BrowserBash and write the objective in English. If the job is "this automation is one part of a bigger program I'm building," open an editor and call Stagehand yourself. Both are the right answer to a different question.
