---
title: browser-use Token Costs vs a Replay Cache Approach
description: "Every browser-use run calls the model. Compare that recurring token spend with a replay cache that reruns a green flow using zero model calls."
date: 2026-07-05
category: comparison
---

Picture a login smoke test that runs every 15 minutes, all day, forever. It is the same nine steps every time: open the app, fill username, fill password, click sign in, wait for the dashboard, verify the welcome text. Nothing about this flow is exploratory. It passed an hour ago, and if the deploy didn't touch auth, it will pass again in fifteen minutes. Now run that check with a browser-use style agent for a month: four times an hour, 24 hours a day, roughly 2,900 runs. Every one of those runs calls the model again, from scratch, to re-derive the same nine actions it already figured out the first time. That is the problem this article is about: not "is the model expensive per token," but "why are we paying inference on a flow the machine has already solved."

This is not a knock on [Browser Use](https://github.com/browser-use/browser-use) as a project. It is a well-built Python framework, and the agent-loop shape it popularized (observe the page, ask the model what to do next, execute, repeat) is a genuinely good way to automate a browser without hand-written selectors. The point here is narrower: that loop has no concept of "I've seen this exact flow succeed before, let me just do that again without asking anyone." Every run is a cold start. That's a deliberate design choice, not a bug, and it carries a recurring cost that compounds with run frequency in a way most teams don't model until the invoice shows up.

## The agent loop, and where the meter runs

Strip away framework-specific detail and every browser-use style agent does the same thing on every step: capture the current page state (DOM, accessibility tree, sometimes a screenshot), send it plus the task and history to the model, get back a decision (click this, type that, or declare done), execute it, repeat.

Every one of those steps is a model call, and every model call is priced in tokens: the page representation going in, plus the reasoning and action coming back. A nine-step login flow is roughly nine calls, each re-reading a chunk of page state that, for a stable flow, looks almost identical to what it looked like the last thousand times. The agent has no memory across runs. It doesn't know it already solved this exact puzzle; it re-solves it, patiently, every time, because that's the only mode the architecture has.

That's fine, even necessary, the first time you run a new flow, or any time the page might have changed. It's wasted work on a flow you already know is stable, run after run, which is most of what a CI or monitoring suite actually does.

## The real cost driver is frequency, not price per call

A single run of a short flow is cheap in isolation; nobody's budget gets flagged by one login check. The cost that shows up in a review is recurring inference on a repeated flow, driven by a variable that has nothing to do with the model's per-token price:

```
recurring_cost = tokens_per_step  x  steps_per_run  x  price_per_token  x  runs_per_period
```

The first three terms are the familiar per-run cost math for any agent-driven browser run. The fourth term, `runs_per_period`, is what turns a rounding error into a line item, and it's exactly the term that climbs in the use cases people actually want: monitors firing every few minutes, a smoke suite on every commit, a regression pass on every pull request. None of those get cheaper by picking a smaller model alone. They get cheaper by not re-deriving the same actions for the thousandth time.

That's a different axis from "which model should I run this on." A smaller or local model can get per-call cost near zero, and that's a legitimate strategy on its own. But if you're still re-calling a model on every run, you're paying the frequency tax regardless: even a free local model burns GPU time and latency per run, and a rate-limited free hosted tier throttles you right when you need to run something often. Cheaper tokens and fewer calls are separate levers. This piece is about the second one.

## What a replay cache actually does

[BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) natural-language browser automation CLI that takes the same "write English, an agent drives Chrome" shape as browser-use, but adds a cache in front of the model call. The first time a flow runs and passes, it records exactly what happened. The next time you run the identical flow, it replays those recorded actions directly against the live page with Playwright, no model involved. If the recording still matches the page, the run finishes having made zero model calls. If it doesn't, the cache falls back to the agent for that step and re-records.

Each recorded action is a structured tool call, not raw text: a `navigate`, `click`, `type_text`, `wait_for`, or `extract`, the target it resolved to, and the origin it ran on.

```bash
browserbash run "Open https://app.example.com/login, log in as {{username}} with password {{password}}, and verify the dashboard shows 'Welcome back'" \
  --headless
```

Run that once and it costs whatever the model call costs (steps times tokens times price, same as any agent-driven run). Run it again unchanged, and it replays the cached journal: same actions, same assertions, zero model calls. You're not making the model cheaper. You're making most runs not need the model at all.

## What gets cached, and the honest limits

Two design choices make this trustworthy rather than reckless. Secrets never touch the cache file: if an objective includes `{{password}}`, the recorded journal stores the token `{{password}}`, never the value that was typed, because BrowserBash re-templatizes every recorded input before it writes anything to disk. And replays are origin-pinned: any cached action carrying a variable only replays if the live page's origin matches the origin it was recorded on, so a tampered or copied cache can't be used to steer a real credential somewhere it wasn't recorded to go. Every journal is also signed with a per-machine key, so a hand-edited or foreign-machine cache file fails its check and is ignored rather than trusted.

The honest limit: this only pays off for flows that are actually stable. A flow whose UI changes weekly will cache-miss constantly, and you pay full model cost anyway, plus a small lookup overhead. It wins on the boring, repetitive share of a suite (smoke checks, logins, "is the page even up" probes) and is roughly a wash, not a loss, for flows still in flux. It's also exact, not fuzzy: change the objective, variables, or start URL and that's a new cache key and a fresh recording, so it can't quietly paper over a real change. And it's a replay of a known-good recording, not a semantic memory of the site; it doesn't generalize to a similar-but-different flow.

## Two cost curves, not two prices

The clearest way to see the difference is to hold the flow constant and compare the shape of the cost curve as run count grows, not one price against another.

| | browser-use style agent (every run) | BrowserBash with replay cache |
| --- | --- | --- |
| Run 1 | Full model cost: steps x tokens x price | Full model cost (same), plus the journal gets recorded |
| Run 2, page unchanged | Full model cost again | Zero model calls, cached actions replay directly |
| Run 1,000, same flow | Full model cost, 1,000th time | Zero model calls, if the flow is still stable |
| Trend as run frequency grows | Scales linearly, no ceiling | Flattens after the first successful recording |
| When the page changes | Agent adapts on its own, every time | Cache misses that step, agent heals, journal re-records |

A framework with no cache draws a straight line through the origin: run count times per-run cost. A replay-first approach draws a small upfront bump, then a flat line near zero, with occasional small bumps when the UI actually changes. For a flow you run once, the curves are identical. For a flow you run four times an hour for a year, they diverge enormously, and the gap has nothing to do with token pricing. It's a "did you call the model" story.

## Where the model still runs

A cache doesn't eliminate model calls entirely: they still happen on the first pass, on any cache miss, and whenever you force a fresh run. `--refresh-cache` wipes a test's cache entry before running, useful right after you know the UI changed and want a clean re-recording. `--no-cache` disables the cache for a run, useful while you're actively rewording an objective and don't want a stale recording answering for you.

```bash
browserbash run "Open https://app.example.com/login, log in as {{username}} with password {{password}}, and verify the dashboard shows 'Welcome back'" \
  --refresh-cache --headless
```

When a cached flow's page has genuinely changed partway through, replay doesn't just fail outright, it heals: the steps that still match replay normally at zero cost, only the diverging step falls back to the agent, and it finishes the objective and re-records the updated journal. A real UI change usually costs one agent-priced run to re-establish a green baseline, not a permanent return to full price forever; the next run after a heal is free again. That's a mechanical replay, not a self-healing model of the site, so the cache has its own small maintenance cost, but only on the runs where something actually changed.

## A committable test that benefits on every CI run

This compounds hardest on a suite that runs on every pull request. A plain-English test file, committed next to the code it covers:

```markdown
# Login smoke test

- Open {{base_url}}/login
- Log in as {{username}} with password {{password}}
- Verify the dashboard shows 'Welcome back'
- Verify the account menu shows {{username}}
```

Run it in CI with the cache on, which is the default:

```bash
browserbash testmd run ./login_test.md --agent --headless
```

The first PR after this test lands pays full model cost to establish a green run and record the journal. Every following PR, as long as login hasn't changed, replays those actions with zero model calls, `"cache":"hit"` shows up in the NDJSON `run_end` event, and the CI step finishes in roughly the time Playwright itself takes. A gate that runs forty times a day would otherwise call a model forty times a day on an unchanged login flow; instead it calls it once, the day the flow last changed.

## Where this doesn't apply

If your objective is genuinely different every run (unique data on a page that renders differently each time, an open-ended "find and summarize" task with no fixed action sequence) there's nothing stable to record, and you pay full model cost regardless of tooling. That's real browser-agent work, and a code-first, general-purpose framework like browser-use is arguably a better fit for it than a cache-first CLI, precisely because you're not trying to replay a fixed sequence in the first place.

There's also a real constraint on the hosted-model side: when a run's instruction would need to carry secret values directly to a hosted-model agent rather than as structured, re-templatized tool calls, BrowserBash disables the cache for that run instead of writing a secret-bearing instruction to disk. That's a deliberate fail-safe, and it means the strongest cache guarantees apply most fully to flows run through the builtin engine's structured action journal. And obviously, the cache doesn't make your first run of anything free; it changes the shape of the curve for the runs after that. If your workload never repeats a flow, there's no curve to bend.

## The actual decision

Building a general-purpose agent as a Python component where every task genuinely differs from the last: a code-first framework like browser-use is a reasonable choice, and a cache built for repeated flows won't buy you much because you don't have repeated flows.

Running a test suite: the same flow, scheduled, run on every commit, run every fifteen minutes as a monitor: the frequency term in the cost formula is the one worth attacking, and that's a caching problem, not a token-pricing problem. Record a flow once when it's green, replay it for as long as it stays green, and only pay the model again when the page truly changes. See the full feature set on the [features page](https://browserbash.com/features). The two levers stack, too: a cheap or local model for the first recording, plus a replay cache for every run after, compounds both savings rather than forcing a choice between them.

```bash
npm install -g browserbash-cli
browserbash run "Open https://example.com and verify the page title contains 'Example Domain'"
```

Run that twice unchanged, in `--agent` mode, and check the `cache` field in the second run's `run_end` event. That's the whole claim, and it's one you can verify on your own machine in under a minute.

## FAQ

### Does browser-use have a replay cache or similar mechanism?

Browser-use's core agent loop calls the model on every step of every run; it doesn't ship a built-in way to record a successful run's actions and replay them model-free later. That's reasonable for a general-purpose framework meant to handle novel tasks, but it means cost scales linearly with how often you re-run the same flow. You'd have to build that layer yourself on top of the library.

### How does BrowserBash's replay cache actually save money?

The first time a flow runs and passes, BrowserBash records the resolved actions as a signed local journal. The next run of the same objective and variables replays those actions directly against the live page with Playwright and makes zero model calls, as long as the page still matches. You pay the model cost once, at recording time, rather than once per run forever.

### Is a replay cache the same thing as a smaller or local model?

No, they're different levers on the same cost formula. A smaller or free local model lowers the price of each call. A replay cache lowers how often the model gets called at all. Use both together: run the first recording on a cheap or local model, then let the cache skip the model entirely on every unchanged run after.

### What happens when the page changes and cached actions no longer match?

The cache fails closed on the specific step that no longer matches, not the whole run. Steps before that point still replay for free, the agent takes over to finish the objective, and the journal re-records with the updated actions. The next run after that heal replays with zero model calls again. A real UI change costs one agent-priced run to re-establish, not a permanent return to paying on every run.

### Are secrets ever written into the cache file on disk?

No. Values from `{{variable}}` substitution are re-templatized back to their `{{name}}` token before anything is written, so the file never contains a literal password. Any cached action carrying a variable is also origin-pinned: it only replays if the live page's origin matches where it was recorded, so a tampered or copied cache file can't redirect a real credential.

### Does this only matter for large suites, or does it help a single test too?

It helps in proportion to how many times you re-run the same flow. A test run exactly once gets no benefit, since there's no "again" to make cheaper. A login smoke test on every commit, or a monitor firing every few minutes, is where the recurring cost actually lives, and that's exactly where a replay cache turns a linearly growing bill into a flat one after the first green run.
