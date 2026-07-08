---
title: Install BrowserBash From the Official MCP Registry
description: "Learn how to install BrowserBash from the official MCP registry, why the io.github.PramodDutta listing matters, and how any MCP client can pull it in."
date: 2026-07-11
category: tutorial
---

If you have spent any time wiring tools into Claude Code, Cursor, or another MCP-speaking agent, you already know the biggest friction point isn't the protocol, it's discovery. You hear about a useful server, you go dig up the right install string, you copy a config block from a README, and you hope the maintainer didn't change the binary name since the docs were written. The browserbash official mcp registry listing exists to fix exactly that problem: BrowserBash is now indexed as `io.github.PramodDutta/browserbash`. This post walks through what the official MCP registry actually is, why being listed there matters for a tool like BrowserBash, and how you install and use it from any compliant MCP client.

## What the Model Context Protocol Actually Solves

Before the registry conversation makes sense, it helps to restate what MCP is for. The Model Context Protocol is an open standard that lets an AI agent talk to external tools and data sources through a common interface instead of a pile of one-off integrations. Before MCP, every agent framework invented its own plugin format: one framework had its own tool spec, another had function-calling schemas, and each IDE assistant had a bespoke extension API. If you built a browser automation tool, you'd have to write and maintain a separate adapter for every host that wanted to call it.

MCP collapses that to one adapter. A server exposes a set of tools (structured functions with typed inputs and outputs) over stdio or HTTP, and any MCP-compliant client, whether that's Claude Code, Cursor, Windsurf, Zed, or a custom agent runtime, can call those tools the same way. BrowserBash shipped its MCP server in v1.5.0 specifically so that "run a browser check" becomes a first-class tool call for any agent, not a shell command the agent has to invoke and then parse the output of.

## What the Official MCP Registry Is

The MCP ecosystem grew fast enough that a registry became necessary almost immediately. Dozens of servers appeared within months of the spec stabilizing, and there was no canonical place to look them up, no namespace convention, and no way to verify that the server you were installing actually belonged to the project it claimed to represent. The official MCP registry is the answer: a central, spec-maintained index of MCP servers, each identified by a namespaced ID tied to a verifiable source, most commonly a GitHub repository.

BrowserBash's entry is `io.github.PramodDutta/browserbash`. Read that ID literally and it tells you three things at once: the reverse-DNS-style namespace (`io.github`) proves the listing is tied to a GitHub account, the account is `PramodDutta`, and the server name is `browserbash`. That's not cosmetic. A registry entry namespaced to a GitHub account is much harder to spoof than an arbitrary package name on an open registry, because claiming the namespace requires proving control of the underlying GitHub identity. If you're an agent builder deciding whether to let a tool touch a real browser session on your machine, that provenance check matters more than it does for, say, a text formatter.

Compare this to how MCP discovery worked before a registry existed. You'd find a server mentioned in a blog post, a chat thread, or a hand-curated "awesome MCP servers" list, copy a JSON config snippet by hand, and trust that the snippet was current and that whoever wrote it wasn't typosquatting a similarly-named tool. The official MCP registry replaces that trust-a-stranger's-README workflow with a queryable index that MCP-aware clients and package managers can hit programmatically.

## Why the BrowserBash Registry Listing Actually Matters

It's fair to ask whether a registry listing is just a badge, the software equivalent of a "featured" sticker. For BrowserBash specifically, there are three concrete, practical reasons it matters beyond vanity.

**First, discoverability inside the tools people already use.** As MCP clients build in registry search, being listed means BrowserBash shows up when someone searches for "browser testing" or "browser automation" inside their agent's tool picker, without them needing to have already heard of the project by name. That's a fundamentally different acquisition channel than blog SEO or GitHub stars; it puts the tool in front of people at the exact moment they're deciding what to wire into their agent.

**Second, install consistency.** A registry entry pins a canonical install path. Instead of several different community-written install snippets floating around with slightly different flags, there's one entry that any registry-aware tooling can resolve to the correct command. For a CLI like BrowserBash that ships an MCP server as one of several subcommands (`browserbash mcp`, alongside `run`, `testmd`, `run-all`), that canonical resolution avoids the failure mode where someone installs an old version, or the wrong package, and reports a bug that's actually a stale install.

**Third, it signals a maturity bar.** Getting listed on the official registry means the server metadata, the namespace claim, and the tool description had to be correct and verifiable. For an open-source project like BrowserBash (Apache-2.0, built by The Testing Academy) that positions itself as the open-source validation layer for AI agents, that's a meaningful trust signal for teams evaluating whether to let an agent drive a real browser inside CI or on a developer machine. You can read more about the project's overall approach on the [BrowserBash features page](https://browserbash.com/features).

None of this is about self-healing magic or benchmark claims, BrowserBash doesn't market itself that way. It's a much more mundane but genuinely useful thing: a piece of infrastructure got easier to find and easier to trust because it's now indexed in the place the ecosystem agreed to index things.

## What BrowserBash Actually Does, Briefly

If you're arriving at this post from an MCP registry search and haven't used BrowserBash before, here's the short version. BrowserBash is a free, open-source, natural-language browser automation CLI. You write a plain-English objective, something like "go to the pricing page and verify the Pro plan shows $49/month", and an AI agent drives a real Chrome or Chromium browser step by step, no selectors, no page objects, and returns a deterministic verdict: pass, fail, error, or timeout, plus structured results.

The model story is deliberately Ollama-first. BrowserBash defaults to free local models with no API keys and nothing leaving your machine; it auto-resolves a local Ollama model first, then falls back to `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. It also supports bringing your own Anthropic or OpenRouter key if you want a stronger hosted model for harder flows. Under the hood there are two swappable engines (Stagehand, the default, and a builtin Anthropic tool-use loop) and five browser providers (local Chrome, any CDP endpoint, Browserbase, LambdaTest, BrowserStack).

The MCP server, added in v1.5.0, is what makes BrowserBash usable as a tool an agent calls, rather than a CLI a human runs by hand. That's the piece the official registry listing is surfacing.

## Installing BrowserBash From the Official MCP Registry

There are two layers to "installing BrowserBash from the registry": getting the CLI itself onto your machine, and pointing your MCP client at it. You need both, because the registry entry describes how to reach the server, but the server itself is the `browserbash mcp` subcommand inside the npm package.

### Step 1: install the CLI

```bash
npm install -g browserbash-cli
```

This installs the `browserbash` binary globally. Confirm the version with `browserbash --version`; you want 1.5.1 or later for the MCP server and everything else referenced in this post. The package is public on npm at [npmjs.com/package/browserbash-cli](https://www.npmjs.com/package/browserbash-cli) if you want to check current version numbers before installing.

### Step 2: add the server to your MCP client

For Claude Code, the one-line install is:

```bash
claude mcp add browserbash -- browserbash mcp
```

That command registers `browserbash mcp` as an MCP server that Claude Code spawns over stdio whenever it needs to call a BrowserBash tool. The same pattern works for other MCP hosts: Cursor, Windsurf, and Zed all accept a comparable "run this command as an MCP server" configuration, pointing at `browserbash mcp` as the executable. If your client resolves servers directly from the registry rather than a manual command, it looks up `io.github.PramodDutta/browserbash`, reads the metadata, and configures the same underlying stdio server for you, so the end state is identical either way.

### Step 3: verify the tools are visible

Once registered, ask your agent to list its available tools, or check your client's MCP panel. You should see three BrowserBash tools:

- `run_objective`: runs a single plain-English objective, the MCP equivalent of `browserbash run "<objective>"`.
- `run_test_file`: runs a `*_test.md` file, the equivalent of `browserbash testmd run <file>`.
- `run_suite`: runs every test file in a folder in parallel, the equivalent of `browserbash run-all <dir>`.

If none of those show up, the most common cause is that the client cached an old tool list from before the server was registered; restarting the client's MCP connection usually fixes it. The second most common cause is a stale global install, so re-run `npm install -g browserbash-cli` to pick up 1.5.1.

## What the MCP Tools Return

This is the part that matters most for anyone building an agent workflow around BrowserBash rather than just running it by hand. Every one of the three tools returns the same structured verdict JSON shape: `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. That consistency is deliberate. A failed test is a successful validation from the tool's point of view: the tool call itself succeeds, and it's the agent's job to read `status: "failed"` and act on it, the same way it would read any other structured tool output.

This matters because it changes what "the agent tests its own work" looks like in practice. An agent that just edited a signup form doesn't need to shell out to a CLI and scrape stdout for a pass/fail string. It calls `run_objective` with something like "fill the signup form with a test email and verify the confirmation banner appears", gets back structured JSON, and can branch on `assertions` directly. If you want deterministic checks rather than agent judgment calls, pair this with BrowserBash's `Verify` step grammar, covered next.

## Deterministic Verification, Not Just Agent Judgment

One thing worth being explicit about: not every check inside a BrowserBash run is an LLM judgment call. Since v1.5.0, `Verify` steps in a testmd file compile to real Playwright assertions, URL contains, title is or contains, text visible, `'name' button|link|heading` visible, element counts, or a stored value equals check, with zero LLM involvement in deciding pass or fail. A pass means the condition literally held; a fail comes back with expected-versus-actual evidence in `run_end.assertions` and in the generated `Result.md` table. If you write a `Verify` line outside that grammar, it still runs, but it's agent-judged and flagged `judged: true` in the output, so you can always tell which assertions were deterministic and which were a model's call.

This is also where testmd v2 comes in for anyone building more elaborate suites through the MCP tools. Add `version: 2` to a test file's frontmatter and steps execute one at a time against a single browser session, with two step types that never touch a model at all:

```
---
version: 2
---
# Checkout smoke test

1. POST https://api.example.com/cart with body {"sku": "widget-1", "qty": 2}
   Expect status 201, store $.cartId as 'cartId'
2. Go to the checkout page for cart {{cartId}} and verify the total shows $39.98
   Verify 'Place order' button visible
```

The API step seeds state deterministically, no agent guesswork on how to fill a form to create a cart, and the Verify step checks the resulting UI. Consecutive plain-English steps between deterministic ones still run as grouped agent blocks on the same page. Worth flagging honestly: testmd v2 currently drives the builtin engine only, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway, it doesn't run directly on Ollama or OpenRouter yet. If you're running fully local-model-first, stick to v1 test files for now: they behave exactly as before, with no frontmatter required.

## MCP Tool Calls vs. Manual CLI Runs

Both surfaces exist for good reasons, and they're not competing so much as serving different callers. Here's how they actually differ in practice:

| | MCP tools (`run_objective`, `run_test_file`, `run_suite`) | Manual CLI (`browserbash run`, `testmd run`, `run-all`) |
|---|---|---|
| Caller | An AI agent inside Claude Code, Cursor, etc. | You, in a terminal, or a CI job |
| Output | Structured JSON verdict returned as a tool result | Human text by default, or NDJSON with `--agent` |
| Typical trigger | The agent decides mid-task that it needs to verify something | You explicitly run a test or suite |
| Session lifetime | Spawned per MCP connection, stdio | One-shot process per invocation |
| Best for | In-loop self-verification while an agent is coding | CI pipelines, scheduled monitors, ad hoc debugging |

If you're setting up CI, you still want the CLI directly, with `--agent` for NDJSON output and the frozen exit codes (0 passed, 1 failed, 2 error, 3 timeout) that scripts and GitHub Actions can branch on. If you're building or using an agent that edits code and wants to check its own work without a human in the loop, the MCP tools are the natural fit: they hand back the same verdict shape without any stdout parsing. Both paths hit the identical runner underneath, so a test that passes through `run_test_file` behaves the same as one run through `testmd run` from a terminal.

## A Realistic Workflow: Agent-Driven Self-Verification

Here's a workflow that the MCP install actually unlocks, and it's worth walking through concretely because it's the whole point of the registry listing existing.

Say you're using Claude Code to build a checkout flow. You ask it to add a discount code field to the cart page. Without BrowserBash wired in, the agent edits the code, maybe runs a unit test if one exists, and tells you it's done; you're the one who opens a browser and checks whether the field actually renders and works. With BrowserBash registered as an MCP server, the agent can call `run_objective` with "go to the cart page, enter promo code SAVE10, and verify the total drops by 10 percent" as its very last step before reporting back to you. It gets a real verdict from a real browser, not a guess based on reading its own diff.

Scaled up, the same idea works for `run_suite`: an agent working through a larger refactor can point `run_suite` at your `.browserbash/tests` folder and get a parallel run across every test file, with the same cost governance and budget stops that apply to `run-all --budget-usd` on the CLI side. That's meaningfully different from an agent that just trusts its own code review, it's closer to how a careful engineer works: make the change, then go check it against something outside your own head.

You can find a walkthrough of building your first suite on the [BrowserBash learn page](https://browserbash.com/learn), and step-by-step tutorials for specific frameworks and CI setups at [browserbash.com/tutorials](https://browserbash.com/tutorials).

## Where the CI Version of This Story Fits

If your team already runs BrowserBash test files locally or in CI via the official GitHub Action, the MCP server is the same validation logic exposed to your coding agent directly, so a Claude Code or Cursor session can run the exact same `*_test.md` files your pipeline runs, without anyone copying commands back and forth between a terminal and an agent chat. The Action posts a self-updating PR comment with the verdict table and uploads JUnit and NDJSON artifacts, so a human reviewing the PR sees the same pass/fail picture the agent already saw mid-task through the MCP tool call. That symmetry, same test files, same verdict shape, same assertions grammar, whether triggered by an agent locally or by a CI job on a pull request, is a big part of why the registry listing is worth the five minutes it takes to wire up: one validation layer, reachable from everywhere.

## Honest Limits Worth Knowing Before You Wire This In

Being straightforward about limits matters more than sounding impressive, so a few things worth knowing before you lean on the MCP server heavily:

- **Small local models get flaky on multi-step objectives.** If you're running Ollama-first with an 8B-class model or smaller, expect occasional missteps on longer flows through `run_objective`. The sweet spot is a Qwen3 or Llama 3.3 70B-class local model, or a capable hosted model, for anything with more than a couple of steps.
- **testmd v2's deterministic API and Verify steps need the builtin engine**, which means an Anthropic API key or a compatible gateway right now, not a pure local-Ollama setup.
- **The MCP server doesn't add new capabilities beyond what the CLI already does.** It's a different transport and output shape for the same runner, not a superset. Monitor mode, sharding, auth profiles, and matrix viewport runs aren't exposed as MCP tools yet, they still require the terminal.
- **A registry listing is a discovery and provenance mechanism, not a quality certification.** It confirms the namespace claim is legitimate and the server metadata is correct; it doesn't mean every tool listed is production-grade for every use case. Evaluate BrowserBash the way you'd evaluate any dependency you're adding to an agent's toolset, on its own merits, which you can dig into on the [BrowserBash GitHub repository](https://github.com/PramodDutta/browserbash).

None of that is a reason to avoid the MCP server, it's the same honesty BrowserBash applies everywhere else: a failed test is useful information, and a documented limit is more useful than a vague promise.

## FAQ

### What is the official MCP registry?

The official MCP registry is a centralized, spec-maintained index of Model Context Protocol servers, each identified by a namespaced ID tied to a verifiable source such as a GitHub account. It replaces the earlier pattern of discovering MCP servers through blog posts and hand-copied config snippets with a queryable, provenance-backed listing that MCP clients can resolve directly.

### How do I install BrowserBash from the official MCP registry?

Install the CLI globally with `npm install -g browserbash-cli`, then register the MCP server with your client; for Claude Code that's `claude mcp add browserbash -- browserbash mcp`. Registry-aware clients can also resolve the server directly from the `io.github.PramodDutta/browserbash` listing, which points to the same underlying command.

### What MCP tools does BrowserBash expose?

Three tools: `run_objective` for a single plain-English objective, `run_test_file` for a `*_test.md` file, and `run_suite` for running every test in a folder in parallel. Each returns a structured verdict with status, summary, final_state, assertions, cost_usd, and duration_ms so an agent can branch on the result programmatically.

### Does the BrowserBash MCP server require an API key?

No, it follows the same Ollama-first resolution as the rest of BrowserBash: it tries a local Ollama model first, then falls back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or OpenRouter if configured. One exception is testmd v2's deterministic API and Verify steps, which currently require the builtin engine and therefore an Anthropic API key or compatible gateway.

Getting BrowserBash onto the official MCP registry means any agent you're building or using can find and install a real browser-verification tool without you hand-writing a config block from a README. Install it with `npm install -g browserbash-cli`, wire it into your MCP client of choice, and let your agent check its own work against a real browser instead of its own assumptions. No account is required to use the CLI or the MCP server; if you want the optional free cloud dashboard later, you can [sign up here](https://browserbash.com/sign-up).
