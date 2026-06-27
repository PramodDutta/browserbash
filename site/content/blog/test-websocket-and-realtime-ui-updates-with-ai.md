---
title: Testing WebSocket and Realtime UI Updates With an AI Agent
description: "Test websocket realtime ui updates with an AI agent: wait for pushed content to appear, assert the new state, and the honest limits on timing and multi-client."
date: 2026-06-27
category: testing
---

To test a WebSocket or realtime UI update with an AI agent, you describe the pushed change in plain English ("wait until a new message from Maria appears in the chat") and let the agent poll the live DOM until that content shows up, then assert on it. There is no reload and no manual sleep. The agent reads the accessibility tree on each step and proceeds the instant the pushed element is actionable, so a message arriving over a socket, a notification badge incrementing, or a dashboard tile updating its number all become things you can wait for and check the same way a human watching the screen would. The catch, covered honestly below, is timing and multi-client coordination: a single agent watching a single page is great at "did the new state arrive," and clumsy at "did two browsers see each other in the right order."

This post shows how to do it with BrowserBash, the free open-source natural-language browser-automation and testing CLI, and where it genuinely struggles.

## Why realtime UIs break normal tests

A live chat, a notifications bell, a price ticker, a collaborative document, an order-status board: these all share one property that wrecks selector-based scripts. The thing you want to assert on does not exist when the page loads. It arrives later, pushed by the server over a WebSocket or Server-Sent Events (SSE) connection, and it arrives at a time you do not control.

Scripted tests handle this badly in two predictable ways:

- **They assert too early.** The script navigates, immediately looks for "new message," finds nothing, and fails. The message was real; it just had not landed yet.
- **They paper over it with sleeps.** You add `sleep(3)` before the assertion. Now the test is slow on every run and still flaky, because sometimes the push takes 3.2 seconds and sometimes the socket reconnects and it takes 6.

Realtime features also tend to update *in place*. No navigation event fires, no URL changes, the DOM just mutates. A test built around page loads has nothing to hang a wait on. This is the same class of problem covered in [how BrowserBash handles dynamic UIs](https://browserbash.com/blog/how-browserbash-handles-dynamic-uis), pushed to its hardest case: not "the element moved between runs" but "the element did not exist yet and then it appeared mid-run."

## The core idea: wait for the pushed content, then assert

BrowserBash does not store selectors. You write the test as intent, and the agent resolves that intent against the page as it exists right now. For realtime UIs, the important consequence is that "wait for the message to appear" is a first-class step, not a hack.

Here is the smallest useful example, a single objective run:

```bash
browserbash run "open the support chat, wait until a reply from the agent appears, and verify the reply contains an order number"
```

What happens under the hood is the part that matters for realtime. BrowserBash uses Playwright's built-in auto-waiting. When the step needs an element that is not on the page yet, it polls the live DOM, finds the element via the accessibility tree (roles, accessible names, states) the instant it is rendered, and proceeds. There is a 15 second ceiling and no manual sleeps. So the WebSocket-pushed reply lands, the agent sees a new element that means "agent reply," and the run moves on. If the reply never arrives within the ceiling, the step fails, which is the correct outcome: the realtime delivery is broken and you want to know.

The default engine, **stagehand** (MIT, by Browserbase), observes the live DOM each step and decides the next action from what is rendered right then. The alternative **builtin** engine (an Anthropic tool-use loop) takes a fresh snapshot and re-derives the selector on every action, never cached across runs, and captures native Playwright traces. For realtime work either is fine; the builtin traces are handy when you need to see exactly when the pushed element appeared.

## A realtime chat test in a Markdown file

For anything past a one-liner you commit a Markdown `*_test.md` file. Steps are plain English list items, `@import` pulls in shared setup, and `{{variables}}` carry data with secret masking in the logs. A live-chat test reads like a description of what a person would watch for:

```markdown
# Live chat realtime test

@import ./login_test.md

- Go to {{baseUrl}}/messages
- Open the conversation with "Support"
- Type "What is the status of order {{orderId}}?" and send it
- Wait until a new reply from Support appears in the thread
- Verify the newest message mentions order {{orderId}}
- Verify the unread badge on the conversation has cleared
```

Run it with:

```bash
browserbash testmd run ./live_chat_test.md
```

Two of those steps are pure realtime assertions. "Wait until a new reply from Support appears" is the agent watching for a DOM mutation that was never going to come from a navigation. "Verify the unread badge has cleared" checks a second pushed state change, the kind of secondary side effect that selector tests usually skip because wiring up the wait is tedious.

The reason this stays readable is that you are testing intent, not clicks. The [testing user intent, not clicks](https://browserbash.com/blog/testing-user-intent-not-clicks-invariants) piece goes deeper on why an invariant like "a reply arrives and the badge clears" survives redesigns that would shatter a `data-testid` chain.

### Asserting on the *new* state, not just presence

A common realtime bug is not "nothing arrived" but "the wrong thing arrived" or "it arrived but the surrounding state did not update." Natural-language assertions let you pin the specific new state:

```markdown
- Wait for a new notification to appear in the bell menu
- Verify the notification text says a comment was added to "Q3 Roadmap"
- Verify the bell badge count increased by one
- Open the notification and verify it marks itself read and the badge decreases
```

Each line is checked by reading the rendered page, not by matching a brittle string in markup. How that judgment actually works, and how to keep it from being vague, is covered in [natural-language assertions, how they work](https://browserbash.com/blog/natural-language-assertions-how-they-work). The practical rule for realtime: assert on observable, human-visible facts (text content, counts, badge states) rather than implementation details like a specific socket frame, which the UI layer never exposes anyway.

## Testing dashboards and live counters

Realtime dashboards (order volume, active users, a metrics tile that updates every few seconds) are a slightly different shape. The element already exists; its *value* changes via push. You test the change, not the appearance:

```markdown
# Realtime dashboard tile

@import ./login_test.md

- Go to {{baseUrl}}/ops/dashboard
- Read and remember the value of the "Orders today" tile
- In a separate step, place a test order via {{apiHelperUrl}}
- Return to the dashboard
- Wait until the "Orders today" tile shows a higher number than before
- Verify the "Last updated" timestamp is within the last minute
```

This pattern (capture, trigger, wait for the pushed change) is the honest way to test that a socket actually updates the view. It is also exactly the shape of a synthetic production check. If you want this running on a schedule against the live site, [monitoring production flows with synthetic checks](https://browserbash.com/blog/monitor-production-flows-synthetic-checks) shows how the same test file becomes a heartbeat that catches a dead WebSocket before users complain.

## Running realtime tests in CI

Realtime tests earn their keep in a pipeline, where a silently broken push connection would otherwise ship. BrowserBash is built for that:

```bash
browserbash testmd run ./live_chat_test.md --agent --headless --record
```

- `--agent` emits NDJSON, so each step and assertion is a machine-readable line your pipeline can parse.
- Exit codes are unambiguous: 0 pass, 1 fail, 2 error, 3 timeout. A realtime push that never arrives surfaces as a timeout (3) or a failed assertion (1), not a vague stack trace.
- `--record` captures webm plus screenshots, which is the single most useful artifact when a realtime test goes red. You watch the recording and see whether the message simply never came, came late, or came garbled.
- A `Result.md` is written per run. Add `--upload` to opt into the free cloud dashboard (runs kept 15 days), or run `browserbash dashboard` for a local one.

Because the test waits up to the 15 second ceiling and proceeds the moment the pushed element is actionable, a fast push does not waste time and a slow one still gets a fair chance before failing. That is strictly better than a fixed `sleep` tuned to your worst observed latency.

A note on models. The default is auto: it resolves Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free models exist). Local means nothing leaves the machine, which matters if your chat content is sensitive. But small local models (8B and under) get flaky on long, stateful realtime flows where the agent has to remember "the value was 41 before." For those, a 70B-class local model (Qwen3, Llama 3.3) or a hosted model is the honest recommendation.

## Honest limits: where this struggles on realtime

This is the part most write-ups skip. A single agent watching a single page is genuinely good at realtime, but it is not magic, and pretending otherwise wastes your time.

**Sub-second timing assertions are out of scope.** If your requirement is "the tick must render within 200ms of the socket frame," BrowserBash is the wrong tool. It tells you the pushed state *eventually* arrived and is correct; it does not give you frame-accurate latency. For hard timing SLAs you want a protocol-level test against the WebSocket directly, or browser performance instrumentation. Use the agent for "does it work," not "is it fast to the millisecond."

**Multi-client coordination is awkward.** True realtime apps are about two or more users seeing each other: user A sends, user B receives. A single agent run drives one browser context. You can test the receive side by triggering the send through a separate channel (an API helper, a fixture), as in the dashboard example above, and that covers most regressions. But a genuine two-browser, who-saw-what-when test (presence indicators, typing indicators, concurrent edits in a collaborative doc) is something the agent does not orchestrate across two live sessions for you today. You would script the second client separately.

**Ordering and race conditions are hard to pin.** "Messages must appear in the order sent, even out of order on the wire" is a precise concurrency property. The agent verifies the final rendered order it observes, which catches gross failures, but it is not a deterministic race-condition harness. Do not rely on it to reproduce a one-in-a-thousand interleaving.

**Flaky networks need realistic ceilings.** The 15 second auto-wait ceiling is generous for most pushes but not infinite. A reconnect storm, a cold serverless socket, or a backgrounded tab throttling timers can push delivery past the window and produce a failure that is about your environment, not your code. When you see realtime timeouts in CI, check the recording before blaming the test: often the push really was late, which is itself worth knowing.

**It is not "self-healing" and does not save a script.** BrowserBash re-derives everything from the live state on each run. That is what makes it tolerant of UI change, but it also means there is no cached fast path: every run re-reads the page. For a tight realtime polling loop this is fine; just know you are paying for fresh observation each time rather than replaying a recorded selector. More on the engine internals at [BrowserBash features](https://browserbash.com/features) and the hands-on guides at [BrowserBash learn](https://browserbash.com/learn).

**Be fair about the alternatives.** Playwright and Selenium can absolutely test realtime UIs, and for protocol-level WebSocket assertions or precise multi-client choreography they are arguably the better fit because you control everything explicitly. Playwright's `expect(...).toHaveText` with auto-retry handles "wait for pushed content" well once you have written the selector. What BrowserBash trades is that explicit control for not having to write or maintain the selector, and for tests that read like the feature spec. Pick the agent when the value is in resilience and readability; reach for raw Playwright when the value is in deterministic, low-level timing and coordination.

## A practical recipe to copy

If you take one pattern from this post, take this three-beat structure for any realtime test:

1. **Capture the baseline.** Read and remember the current state (message count, badge number, tile value). Without a baseline you cannot prove the push changed anything.
2. **Trigger the push.** Send the message, fire the event, place the order, ideally through a separate channel so you are testing the receive path honestly.
3. **Wait for the new state, then assert on it.** Use a plain-English wait for the specific pushed change, then verify the exact new value, not just that *something* appeared.

In a test file:

```markdown
# Realtime notification, capture-trigger-assert

@import ./login_test.md

- Go to {{baseUrl}}/app
- Read and remember the bell badge count
- Trigger a test notification via {{notifyHelperUrl}}
- Wait until the bell badge count is higher than the remembered value
- Open the bell menu and verify the newest notification matches the test payload
```

That is the whole discipline. Baseline, trigger, wait, assert on the specific new state.

## FAQ

### How does an AI agent wait for a WebSocket message without a sleep?

It polls the live DOM using Playwright's built-in auto-waiting. You write a step like "wait until a new reply appears," and the agent re-reads the accessibility tree on each cycle, finds the pushed element the instant it is rendered and actionable, then proceeds. There is a 15 second ceiling and no manual `sleep`. A fast push does not waste time; a push that never lands fails the step, which is the correct signal that realtime delivery is broken.

### Can BrowserBash test SSE and long-polling, not just WebSockets?

Yes, because it tests the *rendered result*, not the transport. Whether the new content arrived over a WebSocket, Server-Sent Events, or long-polling, the agent only cares that the DOM updated in place with the expected new state. You write the same "wait for the new content, then assert" steps regardless of the underlying protocol. The transport is invisible at the level the agent operates.

### Can it test two users seeing each other in realtime?

Partially, and this is the main honest limit. A single run drives one browser context, so it tests the receive side well: trigger the send through a separate channel (API helper or fixture) and assert the live page updates. A genuine two-browser, who-saw-what-when test (presence, typing indicators, concurrent collaborative edits) is not orchestrated across two live sessions for you. For that, script the second client separately or use raw Playwright with two contexts.

### What happens in CI when a realtime push is just slow?

If delivery exceeds the 15 second auto-wait ceiling, the step fails with exit code 3 (timeout) or 1 (failed assertion), and `--record` gives you a webm plus screenshots to review. Before treating it as a flaky test, watch the recording: often the push genuinely was late due to a reconnect, a cold socket, or a throttled background tab, which is a real finding about your environment. The NDJSON from `--agent` pinpoints which step timed out.

## The short version

To test websocket and realtime UI updates with an AI agent: skip the sleeps, write a plain-English wait for the specific pushed content, and assert on the exact new state. Capture a baseline, trigger the push, wait, verify. BrowserBash makes the receive path readable and resilient with no selectors to maintain, and it is honest about its edges: it is not a millisecond-latency harness and it does not choreograph two live clients for you. For "did the new state arrive and is it correct," it fits the job cleanly. Install with `npm install -g browserbash-cli` and point a `*_test.md` at your liveliest screen.
