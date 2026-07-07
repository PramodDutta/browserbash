---
title: OpenAI Agents SDK Browser Tool vs a Test CLI
description: "The OpenAI Agents SDK can drive a browser as a tool; a test CLI adds verdicts, exit codes, and replay for CI. Compare building versus running tests."
date: 2026-07-05
category: comparison
---

Say your team already ships an OpenAI Agents SDK app in production: a small roster of agents that triages support tickets, drafts replies, and hands the gnarly ones to a human. Product ships a signup-flow redesign, and someone asks the obvious next question: we already have an agent runtime with tools and handoffs wired up, so can't we just give one of these agents a browser and have it check that signup still works after every deploy? It is a reasonable question. Thirty minutes into answering it, the honest answer turns out to be: yes, but you are about to build a QA tool from scratch to get there, because the Agents SDK does not ship one. It ships the substrate you would build one on top of.

That is the actual comparison worth making here, and it is a different one from "which browsing agent should replace Operator for testing." The OpenAI Agents SDK is not a browser automation library the way Stagehand is. Browser control is one tool you bolt onto a general multi-agent framework, not the framework's reason for existing. This piece compares that specific axis: writing your own browser-testing agent on top of a general-purpose orchestration SDK, versus installing a CLI that already returns a pass/fail verdict, an exit code, and a replay cache.

## What the OpenAI Agents SDK actually is

The Agents SDK (`openai-agents` on PyPI, imported as `agents`; `@openai/agents` on npm for the TypeScript version) is a lightweight, MIT-licensed framework for building multi-agent workflows, positioned as the production successor to OpenAI's earlier, experimental Swarm project. Its core primitives are all about orchestration, not browsers: an `Agent` is an LLM configured with instructions and tools, `Runner.run()` executes it, `handoffs` let one agent delegate to another, `guardrails` validate input and output, `sessions` carry conversation history across runs, and built-in tracing lets you inspect what an agent did afterward in a dashboard. The SDK is also model-agnostic in principle, it talks to OpenAI's Responses and Chat Completions APIs plus a range of other providers, though in practice most teams pair it with OpenAI's own models.

None of that is browser-specific. A minimal agent looks like this:

```python
from agents import Agent, Runner

agent = Agent(
    name="Support Agent",
    instructions="Triage tickets and draft a reply for each one.",
)
```

Nowhere in that shape is a concept of "open a page" or "click this." You add that yourself, and there are three real ways to do it.

## Three real ways to give an agent a browser

The most literal option is `ComputerTool`, paired with a `Computer` or `AsyncComputer` interface you implement. This is the SDK's version of a vision-driven, screenshot-and-coordinate loop: you declare an `environment` and `dimensions`, then write async methods for `screenshot`, `click`, `double_click`, `scroll`, `type`, `keypress`, `move`, `wait`, and `drag`, and wire each one to a real browser underneath, typically Playwright. The SDK's own examples folder ships a reference Playwright harness for this, but it is a starting point you copy into your codebase and maintain, not a dependency you install and forget.

```python
from agents import Agent, ComputerTool
from agents.computer import AsyncComputer

class PlaywrightComputer(AsyncComputer):
    environment = "browser"
    dimensions = (1280, 800)

    async def screenshot(self) -> str:
        return await self.page.screenshot()  # you decide the encoding
    async def click(self, x, y, button):
        await self.page.mouse.click(x, y)
    # ...type, keypress, scroll, wait, move, drag: same story, all yours to write

agent = Agent(name="Browser operator", tools=[ComputerTool(PlaywrightComputer())])
```

The second option skips the vision loop entirely: write a plain `function_tool` for each action you need, `goto(url)`, `click(selector)`, `read_text(selector)`, backed directly by Playwright calls. That is less infrastructure than `ComputerTool`, but it puts you back in selector-maintenance territory, which is precisely the brittleness plain-English tools exist to avoid.

The third option is the least code: attach an existing browser-capable MCP server with `MCPServerStdio`, and its tools show up on the agent automatically, no interface to implement at all.

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="Playwright MCP",
    params={"command": "npx", "args": ["-y", "@playwright/mcp"]},
) as server:
    agent = Agent(name="Browser agent", mcp_servers=[server])
```

All three genuinely work. None of them, on their own, gives you anything that looks like a QA result.

## What the SDK still doesn't give you

Whichever of the three you pick, here is the gap. `Runner.run()` returns a result whose `final_output` is free text the model composed; there is no `status: passed | failed` field, so "did the signup flow actually work" is a sentence you have to parse, or a structured `output_type` schema you hope the model fills in correctly every single run. Nothing sets a process exit code either. Your calling script inspects `final_output`, decides for itself, and exits accordingly. Tracing exists, but it is a dashboard you open after the fact to see what an agent did, not stdout NDJSON a CI job can read line by line while a run is happening.

The test itself is also Python or TypeScript source, so a product manager reviewing a pull request cannot read a `Computer` implementation the way they can read a sentence. Every assertion the agent makes about the page is a model's judgment call unless you separately write Playwright assertions next to the agent code, at which point you are, notably, building your own version of a deterministic test format. And nobody scrubs a password out of a screenshot or a trace for you; if a `type` call submits a real secret, masking it is your problem, tool by tool.

None of this is a flaw in the Agents SDK. It was never trying to be a test runner. It is trying to be the substrate you build one on, alongside a support bot, a coding assistant, or anything else that needs tools and handoffs.

## What a ready-made CLI hands you instead

[BrowserBash](https://browserbash.com) starts from the opposite direction: install it, describe the check in English, get a verdict back. No `Computer` interface, no selectors, no output schema to design.

```bash
browserbash run "Open https://app.example.com/signup, create an account with a test email, and verify the page shows 'Check your inbox to confirm'" \
  --agent --headless
```

With `--agent`, stdout is NDJSON, one event per step, ending in a `run_end` line that carries the verdict:

```json
{"type":"step","step":3,"status":"passed","action":"type","remark":"Typed into ref:7"}
{"type":"run_end","status":"passed","summary":"Account created, confirmation text shown","final_state":{},"duration_ms":18420}
```

The process exit code follows that same verdict: `0` passed, `1` failed, `2` error, `3` timeout. No parsing prose to find out.

For a check you commit rather than paste into a terminal, the same objective becomes a `*_test.md` file with `{{variables}}` and secret masking:

```markdown
# Signup smoke test
- Open {{base_url}}/signup
- Create an account with email {{test_email}} and password {{password}}
- Verify the text "Check your inbox to confirm" is visible
```

```bash
browserbash testmd run ./signup_test.md --agent --headless \
  --variables '{"base_url":"https://app.example.com","test_email":"qa+1@example.com","password":{"value":"s3cret","secret":true}}'
```

That `Verify` line is not a suggestion the model interprets loosely. It matches a deterministic grammar compiled to a real Playwright check, so the verdict reflects an actual assertion, not the model's opinion of what it saw, and `password` is masked as `*****` in every log line, stdout, NDJSON, and the written `Result.md`, because it was marked `secret: true` rather than typed inline. Run the same file again after it has passed once, and BrowserBash's replay cache replays the recorded actions with no model calls at all, which is the difference between a nightly suite that burns fresh inference every night and one that mostly does not. The full flag and command reference is on the [features page](https://browserbash.com/features).

## The two actually compose

Here is the part worth not missing: you do not have to pick one framework forever. Because the Agents SDK treats any MCP server as a source of tools, and BrowserBash ships its own MCP server (`browserbash mcp`, exposing `run_objective`, `run_test_file`, and `run_suite`, each returning a structured `status`, `summary`, `final_state`, `assertions`, and `cost_usd`), you can attach BrowserBash to an Agents SDK agent the same way you would attach Playwright MCP, and get a deterministic verdict tool instead of a screenshot-guessing loop:

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async def main():
    async with MCPServerStdio(
        name="BrowserBash",
        params={"command": "browserbash", "args": ["mcp"]},
    ) as server:
        agent = Agent(
            name="Deploy verifier",
            instructions=(
                "After each deploy, call run_objective to verify the signup flow. "
                "Report pass or fail from the tool's status field, never your own guess."
            ),
            mcp_servers=[server],
        )
        result = await Runner.run(agent, "Verify signup on https://app.example.com")
        print(result.final_output)
```

The Agents SDK still does what it is good at here: deciding whether to retry, escalate to a human, or post to Slack. The "did the page actually do the right thing" answer comes from a tool built to answer exactly that question, deterministically, instead of an agent's own coordinate-clicking guesswork.

Worth naming the limit of that composition honestly, too. `run_objective` hands back a completed verdict at the end of a call, not a live value your agent's own reasoning can branch on mid-click the way an in-process `function_tool` result can. If a check needs to interleave a browser action with a database lookup with another browser action, all inside one continuous decision, calling `run_objective` twice with the branching logic in your own agent code between calls is the honest pattern, not one giant embedded browser session.

## Side by side

| | Agents SDK + your own browser tool | BrowserBash |
|---|---|---|
| What it fundamentally is | General multi-agent orchestration framework | Purpose-built browser test CLI |
| Browser control | Implement `ComputerTool`/`AsyncComputer`, write `function_tool`s, or attach an MCP server | Built in; plain-English objectives, two swappable engines |
| Pass/fail verdict | Free-text `final_output`; you define what "pass" means | `status: passed\|failed\|error\|timeout` on every run |
| CI contract | None; you write the exit-code logic yourself | Exit codes 0/1/2/3, `--agent` NDJSON |
| Committable test artifact | Python or TypeScript source | `*_test.md`, plain English, `@import`, `{{variables}}` |
| Deterministic assertions | Hand-rolled Playwright asserts, if you add them | `Verify` steps compiled to real checks, no model judgment |
| Secret handling | Your responsibility, tool by tool | `secret: true` variables masked in every log line |
| Repeat-run cost | Fresh model calls (and screenshots) every run, unless you build caching | Replay cache: a green run replays with zero model calls |
| License | MIT (Python and JS) | Apache-2.0 |

## When building on the Agents SDK is the right call

Reach for the Agents SDK directly when the browser step is one tool inside a bigger agent product you are actually building: a support-triage agent that occasionally needs to click through a form, a research agent that needs a web-search tool and a browser action in the same run, or anything where the next step genuinely depends on business logic mid-run, "if the inventory API says out of stock, escalate to a human instead of attempting checkout." That branching belongs in your own agent code, not in a test file, and the SDK's handoffs and guardrails are the right tool for exactly that kind of decision-making.

## When installing a CLI is the right call

Reach for a ready-made CLI when the question is "did my app break, yes or no, and can a pipeline act on the answer without anyone reading a transcript." That covers nightly regression suites, PR-gating smoke tests, and the increasingly common case of an AI coding agent that wants to check its own UI work before calling itself done. That last case is exactly why BrowserBash ships its own MCP server rather than only a CLI: an agent built on the Agents SDK, or on anything else that speaks MCP, can call `run_objective` the way it calls any other tool and get back a verdict it did not have to invent a schema for.

Building the QA layer yourself on the Agents SDK is not wrong. It is a real amount of work: a `Computer` implementation or a pile of `function_tool`s, a pass/fail schema, exit-code plumbing, secret scrubbing, and a caching layer, none of which the SDK sets out to provide. Installing a CLI that already did that work is the shortcut, and it is a shortcut you can still call from inside an Agents SDK agent the moment you want to.

## FAQ

### Does the OpenAI Agents SDK include a browser tool out of the box?

Not really. `ComputerTool` is the closest built-in hook, but it requires you to implement a `Computer` or `AsyncComputer` interface yourself: screenshot, click, type, keypress, and the rest, wired to a real browser underneath. The SDK's examples folder ships a reference Playwright harness, but it is a starting point to copy and maintain, not a shipped feature.

### What is the easiest way to give an Agents SDK agent browser control?

Attach an existing MCP server with `MCPServerStdio`. Point it at a browser-capable server, Playwright MCP or BrowserBash's own `browserbash mcp`, and its tools appear on the agent automatically. That is less code than implementing `ComputerTool` or writing your own `function_tool`s for every action.

### Can I use BrowserBash and the OpenAI Agents SDK together?

Yes. BrowserBash ships an MCP server (`browserbash mcp`) exposing `run_objective`, `run_test_file`, and `run_suite`. Attach it to an Agents SDK agent with `MCPServerStdio` and the agent gets a deterministic verdict tool, `status`, `assertions`, `cost_usd`, without you writing a browser interface at all.

### Does the Agents SDK give me exit codes or a pass/fail verdict for CI?

No. `Runner.run()` returns a result with a free-text `final_output`; there is no exit code and no `status` field built in. You would parse the output yourself, or define a structured `output_type` and write the CI logic around it. BrowserBash sets process exit codes (0 passed, 1 failed, 2 error, 3 timeout) automatically on every run.

### Is the OpenAI Agents SDK open source?

Yes. Both the Python package (published as `openai-agents`, from the `openai-agents-python` GitHub repo) and the JavaScript/TypeScript package (`@openai/agents`, from `openai-agents-js`) are MIT-licensed, positioned as the production successor to OpenAI's earlier Swarm project.

### Should I use ComputerTool or write my own function tools for browser QA?

It depends on what you're testing, and honestly, neither one solves the QA part. `function_tool`s wrapping specific Playwright calls need selectors: familiar, but brittle when a page changes. `ComputerTool` is closer to how a person clicks, screenshots and coordinates, but is heavier per step and still needs a `Computer` implementation you maintain. Either way, you still have to separately decide what "pass" means, mask secrets, and wire up CI, the parts a purpose-built CLI already handles.
