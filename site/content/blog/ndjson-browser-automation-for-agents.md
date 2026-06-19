---
title: "NDJSON Browser Automation: Machine-Readable Output for AI Agents"
description: "Why streaming NDJSON browser automation beats scraping logs, and the run_end status line pattern AI agents can parse reliably for verdicts and data."
date: 2026-05-08
category: llm
---

When an AI agent drives a browser, the hard part is rarely clicking the button. The hard part is the agent knowing, with certainty, what happened after it clicked. NDJSON browser automation solves exactly that: instead of handing your agent a wall of colored terminal text and hoping it parses the right line, you hand it a stream of newline-delimited JSON objects with a stable schema and a single terminal verdict. This article is not a field-by-field tour of one tool's flags. It is a design argument — why streaming machine-readable output is the right interface between a long-running browser run and the LLM or script consuming it, and how to build an agent that consumes it without ever scraping a log.

I have written enough brittle `grep "PASS"` checks to know how they fail: silently, six months later, when someone reworded a summary line and the green build was lying the whole time. The point of an agent-facing output contract is to make that class of bug impossible. By the end you will understand the consumption design — what an agent should branch on, what it should ignore, and why the `run_end` status line is the only piece of the stream that belongs in your control flow.

## Why log scraping is the wrong interface for an agent

Most browser automation tools were designed for a human watching a terminal. The output is optimized for a person: spinners, colors, a friendly summary at the end. That is genuinely good UX for interactive use. It is a terrible API.

Consider what an agent has to do to consume human-readable output. It has to find the verdict somewhere in a multi-line blob, distinguish the real summary from incidental log lines that happen to contain the word "passed," and extract any captured data — a price, an order ID, a confirmation number — from prose written for eyeballs, not parsers. Every one of those steps is a guess, and LLMs are extremely good at producing confident guesses that are wrong.

Three failure modes show up again and again when an agent scrapes logs:

- **Format drift.** Log output is not a contract. A maintainer rewords a line, adds an emoji, changes "Test passed" to "All checks green," and every regex downstream silently falls through. Nothing errors; the agent just reads the wrong thing.
- **Ambiguous verdicts.** A log might say "1 of 3 steps failed, retrying" and then "completed." Did it pass? A regex matching `/failed/` flags a false negative; one matching `/completed/` flags a false positive. There is no robust pattern over prose.
- **Buffering and interleaving.** Colored output mixes progress, warnings, and the result into one stream with ANSI escape codes woven through. An agent that waits for the whole blob loses the ability to react mid-run; one that reads incrementally has to strip control characters before it can even tokenize.

The fix is not a better regex. The fix is to stop treating output meant for humans as an interface for machines — a separate, stable, structured stream that exists specifically so software does not have to parse prose. [BrowserBash](https://www.npmjs.com/package/browserbash-cli) — a free, open-source natural-language browser automation CLI from The Testing Academy — exposes this through a single `--agent` flag that switches stdout from friendly text to NDJSON. The human-readable stream still exists; it just moves to stderr where parsers never look.

## What NDJSON actually buys you over a single JSON blob

NDJSON — newline-delimited JSON — is one complete JSON object per line, each terminated by a newline. It is deliberately not a single JSON document wrapping an array, and that distinction is the whole reason it fits agent consumption.

A single JSON document is only valid once the closing bracket arrives. You cannot parse `{"steps":[{...},{...` — it is a syntax error until the run finishes and the array closes. So a consumer of one big JSON blob must wait for the entire run before it can read anything. For a run that takes 40 seconds and walks a multi-step checkout, that means 40 seconds of blindness followed by one giant parse.

NDJSON inverts that. Each line is independently valid the instant the newline lands, so a supervising agent or script can:

- **React to progress as it streams.** When a step event arrives, the agent already knows what the browser is doing — navigating, clicking, extracting — without waiting for the run to end.
- **Detect a stall and intervene.** If no line has arrived in N seconds, the agent can kill a stuck run early rather than burn the full timeout.
- **Bound its own memory.** A long run produces many lines, but the consumer holds one at a time to parse it. There is no megabyte-sized document to buffer.

Here is the shape of the stream. Zero or more progress events while the run is in flight, then exactly one terminal event:

```json
{"type":"step","step":1,"status":"passed","action":"navigate","remark":"Opened the login page"}
{"type":"step","step":2,"status":"passed","action":"type_text","remark":"Entered the username"}
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked Sign in"}
{"type":"run_end","status":"passed","summary":"Logged in and captured the display name.","final_state":{"user_name":"Q. Tester"},"duration_ms":48211}
```

Every line carries a `type` field, so a consumer branches on `type` and never guesses. The `step` events are observability — a live trail of what the agent did. The `run_end` event is the verdict, and it is always last, which is the property the entire consumption pattern hangs on.

## The run_end status line pattern agents can parse

If you take one design idea from this article, take this: **an agent's control flow should depend on exactly one line of the stream — the `run_end` event — and on the process exit code that mirrors it.** Everything else is telemetry.

The `run_end` line is the terminal event, emitted exactly once, always last. That guarantee is what makes it parseable without reading the whole stream. You do not iterate the NDJSON looking for the verdict; you take the last line — `tail -1` in a shell, the last non-empty line of stdout in code. Either way you isolate the one object that matters in O(1) attention.

The terminal event looks like this:

```json
{
  "type": "run_end",
  "status": "passed",
  "summary": "Logged in successfully and captured the display name.",
  "final_state": {"user_name": "Q. Tester"},
  "duration_ms": 48211
}
```

Now the design discipline, which is the part teams get wrong:

- **Branch on `status`, never on `summary`.** `status` is one of `passed | failed | error | timeout` — a closed, stable vocabulary. `summary` is natural-language prose that exists for a human reading a notification. The moment an agent makes a decision based on the wording of `summary`, you have reintroduced log scraping through the back door. Read `summary` to display it; never to decide.
- **Read data only from `final_state`.** Anything the objective asked to capture — phrased as `store ... as 'name'` — lands in `final_state` under that key. This is the typed channel back to your agent. It is not buried in prose; it is a JSON object keyed exactly as you named it.
- **Use `duration_ms` as a flakiness signal, not a verdict.** A run can pass and still be quietly degrading. Tracking `duration_ms` across runs surfaces a page getting slower long before it starts timing out.

A second copy of the verdict matters just as much: the process exit code. BrowserBash exits `0` for passed, `1` for failed, `2` for error, and `3` for timeout. For a script that is the cleanest possible interface — no parsing, just `$?`. For an agent calling the CLI as a tool, the exit code and `run_end.status` agree by construction, so the agent trusts whichever is easier to read in its harness.

The reason to keep `error` and `timeout` distinct from `failed` is behavioral, and it is the single most useful thing the status vocabulary gives an agent:

| Status | Exit code | What it means | Correct agent reaction |
|---|---|---|---|
| `passed` | 0 | The objective held | Proceed |
| `failed` | 1 | The app or the expectation is genuinely broken | Surface to a human; do not auto-retry |
| `error` | 2 | Infrastructure or agent problem (bad endpoint, missing key) | One retry is reasonable |
| `timeout` | 3 | The run exceeded its `--timeout` budget | Raise the timeout or split the objective |

Collapsing all of these into a boolean "did it work" is the mistake that trains a team to rerun real product failures as if they were flakes. An agent that respects the distinction retries the environment and pages a human for the product.

## Designing objectives so the data lands where the agent looks

A machine-readable output contract is only as useful as the data flowing through it. If your objective does not explicitly capture the values the agent needs, `final_state` comes back empty and the agent is back to scraping the summary for a number. So the consumption design starts upstream, in how you phrase the objective.

The rule is simple: **every value the agent will use must be captured with `store ... as 'some_name'`.** That phrasing is the contract that populates `final_state`. Phrasing an objective as "check that my latest order shows as shipped" yields a verdict but no usable data; if the agent needs the tracking number, it has nothing structured to read. Rephrasing to capture the data turns the run into a function that returns a value:

```bash
browserbash run "Open the orders page, confirm the latest order shows as shipped, and store the tracking number as 'tracking' and the carrier as 'carrier'" \
  --agent --headless --timeout 120
```

Now `run_end.final_state.tracking` and `run_end.final_state.carrier` are populated, and the consuming agent reads them by key — the difference between a run that answers a yes/no question and one that hands back a typed result the next step can act on.

A practical heuristic: name keys the way you would name function return values. `order_id`, `user_name`, `error_banner_text` — descriptive, stable, snake_case. The agent's code references those keys directly, so treat them like an API surface, because that is what they are. The [BrowserBash learn pages](https://browserbash.com/learn) go deeper on the objective-and-variables model.

## A worked agent loop: parse, branch, react

Putting the pattern together the way an actual agent harness would: the agent calls the CLI as a tool, captures stdout and the exit code, isolates `run_end`, branches on `status`, and pulls data from `final_state`. Here is the shell version of that logic, which doubles as the contract any language binding would follow:

```bash
out=$(browserbash run "Open https://app.example.com/login, log in as {{user}} with {{pass}}, then open billing and store the plan name as 'plan' and the next invoice date as 'next_invoice'" \
  --agent --headless --timeout 120 \
  --variables '{"user":"qa@example.com","pass":{"value":"hunter2","secret":true}}')
code=$?

# Telemetry: a structured trail of every action the agent took.
echo "$out" | jq -c 'select(.type=="step")'

# The verdict and the data both come from exactly one line: the last one.
verdict=$(echo "$out" | tail -1)
status=$(echo "$verdict" | jq -r '.status')
plan=$(echo "$verdict" | jq -r '.final_state.plan')

case $code in
  0) echo "PASS — plan=$plan" ;;
  1) echo "FAIL — product issue, paging a human" ;;
  2) echo "ERROR — environment, retrying once" ;;
  3) echo "TIMEOUT — raising budget or splitting the objective" ;;
esac
```

Three design choices in that snippet generalize to any agent in any language:

1. **The exit code drives control flow.** `$?` is read first and the `case` branches on it. No string matching decides what happens next.
2. **`tail -1` isolates the verdict.** Because `run_end` is guaranteed last, one line gives both the status and every captured value. The agent never iterates the stream hunting for the right object.
3. **Secrets ride in `--variables` with `"secret": true`.** They are masked as `*****` everywhere in the NDJSON stream and in any written log, which matters the instant an agent transcript gets archived verbatim. Never interpolate a credential directly into the objective string.

That last point deserves emphasis for agent builders. An LLM agent's entire context — including the objective it constructed — is frequently logged, replayed, and sometimes shipped to a third-party model. Keeping secrets in the masked variables channel rather than the objective text is the difference between a credential that stays hidden and one that leaks into a transcript you forgot existed.

## Streaming step events: observability without prose parsing

The `run_end` line is the verdict, but the `step` events are not wasted bandwidth. They are the agent's observability layer — and because they are structured, an agent can use them without the prose-parsing problems that motivated this whole approach.

A step event looks like this:

```json
{"type":"step","step":4,"status":"passed","action":"extract","remark":"Read the order total"}
```

The `action` field draws from a small, stable vocabulary — `navigate`, `click`, `type_text`, `extract`, and similar verbs. That stability is what makes step events useful to a machine: an agent can build a live progress view keyed on `action` ("currently: clicking") without ever interpreting the free-text `remark`. The `remark` is for a human reading the trail later; the `action` is for the machine reacting now.

Two consumption patterns make step events earn their place in an agent design:

- **Stall detection.** Track the timestamp of the last line. If too long passes with no new step, the agent can conclude the run is wedged and terminate it before the full timeout elapses — a faster failure than waiting out the budget.
- **Audit trails.** When a run fails and a teammate later asks "what did the bot actually click?", the sequence of step events is a complete, structured answer the agent can staple to a pull request or an incident note.

The discipline carries over from the verdict: read `action` and `status` for logic, read `remark` only to show a human. The moment your stall detector starts matching substrings in `remark`, you have smuggled log scraping back into a stream designed to eliminate it.

## How agent-mode output compares to the alternatives

It helps to place NDJSON agent output against the other ways teams wire browser runs into automation. None of these are strawmen — each is genuinely the right call in some context.

| Approach | Streams live | Stable to parse | Carries typed data | Best fit |
|---|---|---|---|---|
| Scraping human logs | Partially | No | No | Quick interactive checks by a person |
| Single JSON blob | No | Yes | Yes | Short runs where waiting to the end is fine |
| Exit code only | No | Yes | No | Pure pass/fail gates with no data needed |
| NDJSON + exit code | Yes | Yes | Yes | Long runs consumed by scripts or AI agents |

The honest read on the table: if a person is running an ad-hoc check, the friendly human log is fine. If you have a short run and do not care about progress, a single JSON document is simpler than streaming. And if all you need is a pass/fail gate with no data, the exit code alone is the leanest interface. NDJSON earns its keep specifically when runs are long-lived, when something automated is consuming them, and when you need both live progress and structured data out the other side — the agent and CI case it was built for.

One caveat on the broader landscape: other browser-automation tools also offer structured or streaming output, and the specifics of any given competitor's format, schema stability, and pricing are not always publicly documented — treat vendor claims as of 2026 and verify against their current docs. The design principles here are tool-agnostic: stream line-delimited objects, put the verdict in one terminal line plus an exit code, and route data through a typed channel. Whatever tool you pick, hold it to that bar.

## The model still has to be good enough

A machine-readable transport does not make the run smart. This is the honest caveat agent builders must internalize, because it is where the disappointment usually comes from.

The `--agent` flag changes the shape of the output, not the quality of the reasoning behind it. The verdict in `run_end.status` is only as trustworthy as the model driving the browser. BrowserBash is Ollama-first — its default `auto` model resolves to a local Ollama model when one is available, which means zero keys, zero cost, and nothing leaving your machine. That is a genuinely good default for privacy and price. But very small local models, roughly 8B parameters and under, get flaky on long multi-step objectives: they lose the thread halfway through a checkout and report a confident `failed` that says more about the model than the app.

The sweet spot for unattended agent runs is a mid-size local model — Qwen3 or a Llama 3.3 70B-class model — or a capable hosted model for the genuinely hard flows. Pin the model explicitly when the default is not enough:

```bash
browserbash run "Open https://example.com/checkout and complete a guest purchase, then store the confirmation number as 'order_id'" \
  --agent --headless --timeout 180 \
  --model ollama/qwen3
```

Or point at a hosted model for a flow you cannot afford to get wrong — export `ANTHROPIC_API_KEY` so `auto` resolves to `claude-opus-4-8`, or pin an OpenRouter model. The transport stays byte-for-byte identical; only the brain changes. That separation is itself a useful design property: you can swap models without touching a line of the consuming agent's parsing code, because the schema never moves. The [features overview](https://browserbash.com/features) lays out the engine and provider matrix.

## Committable tests and where to run the browser

NDJSON agent mode is not limited to one-line objectives. BrowserBash also runs markdown tests — committable `*_test.md` files where each list item is a step, `{{variables}}` interpolate with the same secret masking, and `@import` composes shared steps. Run one with `--agent` and you get the identical NDJSON schema, the same four exit codes, plus a human-readable `Result.md` written after the run:

```bash
browserbash testmd run checkout_test.md --agent --headless --timeout 180 > checkout.ndjson
code=$?
tail -1 checkout.ndjson | jq -r '.status, .duration_ms, .final_state.order_id'
exit $code
```

This is the natural unit for a CI pipeline an agent contributes to: a reviewable test file lives next to the code, and the run emits a machine stream plus an exit-code verdict with no parsing step in between. Because the artifact is plain NDJSON, you can keep every run and mine `duration_ms` later to catch flakiness before it ever turns a build red. The [BrowserBash tutorials](https://browserbash.com/tutorials) walk through markdown tests end to end.

Where the browser runs is orthogonal to the output contract, which is the point. The default `local` provider drives your own Chrome. Point at a remote DevTools endpoint with `--provider cdp --cdp-endpoint ws://...` to drive a browser your agent already launched and authenticated. Switch to a cloud grid with `--provider lambdatest` or `--provider browserstack` for real device coverage and session replays. In every case the NDJSON schema and exit codes are identical; only the `provider` field and an optional cloud session link change. Your agent's parsing code does not move when the infrastructure does.

Every run is also kept on disk at `~/.browserbash/runs`, secrets masked, capped at the most recent 200, so an agent can inspect a prior run's stream without re-executing it. For a visual history there is a free, fully local dashboard via `browserbash dashboard`, running entirely on localhost. If you want cloud run history and shareable replays, opt in by connecting once with `browserbash connect --key bb_...` and adding `--upload` per run; without `--upload`, nothing is transmitted. The free cloud tier keeps uploaded runs for 15 days — the [pricing page](https://browserbash.com/pricing) has the details, and the account is optional.

## When to reach for NDJSON browser automation

Be honest with yourself about whether you need this. NDJSON browser automation is the right tool when:

- **An AI agent or script is the consumer**, not a person watching a terminal. The whole value proposition is removing prose from the loop.
- **Runs are long enough that live progress matters.** Short, fast runs do not benefit much from streaming; the win grows with run length.
- **You need structured data back**, not just pass/fail. If the next step in an agent workflow needs an order ID or a price, `final_state` is the clean channel.
- **You want a verdict you can trust in CI.** The exit code as a gate means there is no "parse results" step to write or maintain.

And reach for something simpler when a human is running an ad-hoc check, when a run is trivially short, or when all you need is a one-bit pass/fail and the exit code alone covers it. The design honesty matters: a structured streaming contract is overhead you do not need until a machine is on the receiving end. The instant one is, it stops being overhead and becomes the only sane interface.

## FAQ

### What is NDJSON browser automation and why do AI agents need it?

NDJSON browser automation streams the output of a browser run as newline-delimited JSON — one complete JSON object per line — instead of human-readable terminal text. AI agents need it because parsing prose logs is unreliable: log formats drift, verdicts are ambiguous, and captured data is buried in text written for humans. With NDJSON, an agent reads a stable schema, branches on a typed status field, and pulls structured data from a dedicated object, with no regex against free text.

### How does an agent parse the run_end status line reliably?

The `run_end` event is always the last line of the stream, so an agent isolates it with `tail -1` in a shell or by taking the last non-empty line of stdout in code. It then reads the `status` field, which is one of `passed`, `failed`, `error`, or `timeout` — a closed vocabulary safe to branch on. The process exit code (0 to 3) mirrors that status, so a script can simply read `$?` and never touch the stream at all.

### Why is NDJSON better than a single JSON document for browser runs?

A single JSON document is only valid once it is complete, so a consumer must wait for the entire run to finish before parsing anything. NDJSON makes each line independently valid the moment it arrives, which lets an agent react to progress live, detect a stall and kill a stuck run early, and bound its own memory to one line at a time. For long-running browser flows, that streaming property is the difference between blindness and live awareness.

### Does machine-readable output guarantee the browser run is correct?

No. The `--agent` flag changes the output format, not the reasoning behind it. The verdict is only as trustworthy as the model driving the browser, and very small local models under about 8B parameters get flaky on long multi-step objectives. For reliable unattended runs, use a mid-size local model such as Qwen3 or a Llama 3.3 70B-class model, or a capable hosted model for the hardest flows, while keeping the same NDJSON output contract.

## Get started for free

BrowserBash is free and open source (Apache-2.0). Install it with `npm install -g browserbash-cli`, add `--agent` to any run, and a browser run becomes something your scripts and AI agents can call like a function — stable schema, one verdict line, four exit codes. To keep run history and shareable replays in the cloud, [create a free account at browserbash.com/sign-up](https://browserbash.com/sign-up); the account is optional and nothing leaves your machine until you choose to upload.
