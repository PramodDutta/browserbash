---
title: Verify AI-Generated UI Before You Merge the PR
description: "Verify AI-generated UI before merge: gate the PR on a real browser verdict from the GitHub Action, not the coding agent's own summary."
date: 2026-07-22
category: use-case
---

An AI coding agent opens a pull request, writes a tidy summary of what it changed, and tells you the feature works. That summary is not evidence. It is the same model that wrote the code grading its own homework, and it has every incentive (context pressure, a half-finished tool call, an assumption baked into the prompt) to round "probably fine" up to "done." If you want to verify AI-generated UI before merge with anything more rigorous than trust, the check has to happen outside the agent, in a place it cannot talk its way past: a CI gate that drives a real browser and reports a real verdict.

This is the shape of the problem now facing every team that lets an agent touch the frontend. Claude, Cursor, Codex, Copilot Workspace: they all produce plausible-looking diffs fast, and they all occasionally produce a diff that renders a blank page, breaks a form submission, or silently drops a click handler while every unit test still passes. Unit tests check functions. They do not open Chrome, click the actual button, and watch the actual DOM update. This article walks through a concrete CI-gate pattern: the agent opens a PR, a GitHub Action runs the test file scoped to what changed, and the merge is blocked on a deterministic verdict rather than the agent's self-report.

## Why an agent's self-report is not verification

Ask an AI agent whether its own change works and you are asking it to reason about a browser it never opened. Most coding agents, even the good ones, finish a UI task by reading their own diff, maybe running a build, and generating a confident closing paragraph. Confidence is cheap to produce and expensive to earn. The agent has no eyes on the rendered page unless something explicitly puts a browser in front of it and reports back what actually happened.

This matters more for UI code than almost anywhere else in the stack. A broken API endpoint usually throws a loud 500 that shows up in logs immediately. A broken UI often fails quietly: a button that renders but has no click handler wired up, a modal that opens but never closes, a form that submits but the success state never displays because a conditional got flipped during a refactor. None of that trips a TypeScript compiler or a unit test mock. It only shows up when something clicks the actual element and inspects the actual resulting state, which is precisely what an AI coding agent's textual self-review cannot do.

There is also a structural incentive problem. An agent under time or token budget pressure that is asked "does this work" is being asked a question it can answer either by doing real verification work or by pattern-matching to "yes, this typically works when I write code like this." The second path is faster and, critically, indistinguishable from the first path in the agent's own output. You cannot tell from the PR description which one happened. The only way to separate "I checked" from "I assumed" is to force an independent check that does not run inside the same context that wrote the code.

## What a merge gate actually needs to prove

Before wiring anything up, it helps to be precise about what "verified" should mean at the PR stage. It is not "the code compiles." It is not "the unit tests are green," though both are useful and neither is sufficient on its own for UI changes. A merge gate for AI-generated UI needs to answer one narrow, concrete question: does the flow this PR touched still work when driven the way a real user drives it?

That means clicking the actual button, typing into the actual input, waiting for the actual network response, and checking the actual resulting DOM state or URL. It means the check runs against a real rendered page in a real browser, not a snapshot, not a mock, not a component test with a fake DOM. And critically, for a merge gate to be trustworthy, the pass/fail decision has to come from something deterministic, not from a second AI model looking at a screenshot and guessing whether it looks right. An LLM judging a screenshot is still a self-report, just laundered through a different model.

BrowserBash's Verify assertions exist for exactly this gap. A `Verify` step written in a `*_test.md` file (URL contains, a specific button or heading is visible, an element count, a stored value equals something) compiles to a real Playwright check, not an LLM judgment call. A pass means the condition held in the DOM. A fail comes back with expected-versus-actual evidence, not a hedge. Steps outside that grammar still run and get judged by the agent, but they are explicitly flagged `judged: true` in the output so you always know which parts of your verdict are deterministic and which are advisory.

## The CI-gate workflow, end to end

Here is the pattern this article is really about, laid out as a sequence rather than a feature list:

1. An AI coding agent (Claude Code, Cursor, Codex, whatever your team uses) makes a UI change and opens a PR.
2. A GitHub Action triggers on that PR, using BrowserBash's official Action.
3. The Action runs only the test file (or files) mapped to what the PR touched, not the entire suite, keeping the gate fast and the CI bill sane.
4. BrowserBash drives a real Chrome instance through the plain-English steps and any Verify assertions in that file.
5. The Action posts a self-updating comment on the PR with a verdict table: pass, fail, duration, cost.
6. The merge is blocked (via a required status check) until the verdict is green.

Nothing here asks the coding agent whether it thinks the change works. The question gets answered by a process the agent does not control and cannot talk its way around. If the button doesn't do what the plain-English step said it should do, the check fails, the status goes red, and the PR sits until a human (or another agent pass) actually fixes it.

### Setting up the Action

The official GitHub Action installs the CLI, runs your suite, and uploads JUnit, NDJSON, and Result.md artifacts automatically. A minimal workflow that gates on a PR-affected test file looks like this:

```bash
# .github/workflows/verify-ui.yml (conceptual steps, see the Action docs for full YAML)
# 1. checkout PR branch
# 2. run the BrowserBash action against the affected test file
#    - uses: PramodDutta/browserbash-action@v1
#      with:
#        tests: .browserbash/tests/checkout_test.md
#        budget-usd: 2
```

You can also invoke it directly if you are wiring your own job step rather than using the composite action:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md --agent --headless --timeout 120
```

The `--agent` flag emits NDJSON, one event per step plus a final `run_end` event, so your CI parser (or the Action itself) never has to scrape prose. Exit codes are frozen and predictable: `0` passed, `1` failed, `2` error or budget-stop, `3` timeout. That is the contract your required status check actually reads.

### Scoping the check to what the PR touched

Running your entire regression suite on every PR is a good way to make developers hate the gate, and an AI agent iterating quickly on a PR will hit it dozens of times before merge. The practical move is to maintain a lightweight mapping between source paths and `*_test.md` files, either a naming convention (`src/checkout/` maps to `.browserbash/tests/checkout_test.md`) or a small JSON manifest your workflow reads to decide which tests to run based on the PR's changed files. This keeps the gate fast (seconds to low minutes for a single flow) and keeps the feedback loop tight enough that an agent, or a human reviewer, gets a verdict before context is lost.

For PRs that touch shared components used across many flows, you widen the scope deliberately with `run-all` against a folder of related tests, sharded if the suite has grown:

```bash
browserbash run-all .browserbash/tests/checkout --shard 1/2 --budget-usd 3
```

Sharding computes a deterministic slice from sorted discovery order, so two parallel CI jobs (`--shard 1/2` and `--shard 2/2`) agree on which tests each one owns without any coordination between them. Pair that with `--budget-usd` and a runaway PR that keeps regenerating flaky UI can't quietly burn your CI budget: the suite stops launching new tests once it crosses the threshold, remaining tests report `skipped`, and the run exits `2` so the gate fails loudly instead of silently under-testing.

## Deterministic assertions versus a self-report, side by side

The core distinction this whole workflow rests on is deterministic assertion versus agent self-report. It is worth being explicit about what changes between the two, because "AI verified it" gets used loosely in a lot of tooling marketing right now.

| | Agent self-report | BrowserBash Verify assertion |
|---|---|---|
| What produces the verdict | The same model that wrote the code, reasoning about its own diff | A real Playwright check against the live DOM |
| Failure mode | Confidently wrong, looks identical to a correct "it works" | Fails loudly with expected-vs-actual evidence |
| Reproducible across runs | Not guaranteed, depends on model mood and context | Yes, same DOM state produces same result every time |
| Can a CI gate trust it | No, it is not independent of the thing being checked | Yes, it is an external, deterministic process |
| Cost model | Free but worthless as a gate | Small, quantified per run via `cost_usd` |
| Where it belongs | Fine as a first-pass sanity note in the PR description | The actual required status check |

Neither replaces the other entirely. A quick agent self-report is still useful as a first line of triage, faster than waiting on CI, and it's fine for the agent to say "I believe this works" in a PR description. The mistake is letting that self-report be the thing that gates the merge button. Verify assertions and the CI Action are what turn "I believe" into "confirmed."

## Wiring per-step precision with testmd v2

A single-objective test file (the default `*_test.md` format) treats your whole flow as one instruction, which is fine for a straightforward click-through but gets vague fast when a PR only touches one step in a longer flow. testmd v2, enabled with `version: 2` in the frontmatter, breaks a file into explicit steps that run one at a time against a single browser session, and it adds two step types that never touch a model at all: API steps for seeding state and Verify steps for checking it.

A realistic gate for a PR that changes a checkout summary component might look like this:

```bash
# .browserbash/tests/checkout_summary_test.md
---
version: 2
---
# Checkout summary reflects seeded cart

- GET https://api.example.com/cart/seed-demo
  Expect status 200, store $.cartId as 'cartId'
- Go to https://app.example.com/checkout?cart={{cartId}}
- Click the "Review order" button
- Verify text "Subtotal" visible
- Verify 'Place order' button visible
```

The API step seeds a known cart state deterministically before the browser ever opens, so the test isn't relying on whatever demo data happens to exist in staging that day. The Verify steps check the actual rendered result with a real Playwright assertion, not a model's opinion of a screenshot. The plain-English "Click" step in between still runs through the agent, because navigating a real UI interaction benefits from the agent's flexibility, but the parts of the check that matter for a pass/fail gate are pinned to something deterministic. Note that v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` set or an `ANTHROPIC_BASE_URL` gateway pointed at a compatible model, it doesn't yet run directly on Ollama or OpenRouter.

## Letting the agent verify itself before it even opens the PR

The CI gate is the backstop, but the cheaper fix is catching the failure before the PR exists at all. This is where the MCP server angle matters. `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, and a one-line install (`claude mcp add browserbash -- browserbash mcp`, the same idea for Cursor, Windsurf, Codex, or Zed) gives the coding agent direct access to `run_objective`, `run_test_file`, and `run_suite` as native tool calls. Instead of the agent guessing whether its change works, it can call `run_test_file` against the exact test the PR gate will run, get back the structured verdict JSON (`status`, `summary`, `final_state`, `assertions`, `cost_usd`, `duration_ms`), and iterate locally before ever pushing.

This is a subtle but important shift: a failed test through the MCP tool is a successful validation call. The tool doesn't error out, it returns a clean verdict the agent can read and act on, fix the code, and re-run. By the time the PR opens, the agent has already seen the same check the CI gate will run, which means fewer red status checks in the first place and a tighter loop overall. The CI gate stops being the first time anyone finds out the change is broken, it becomes confirmation of something the agent already knows.

## Handling the messy parts: flakiness, auth, and cost

A merge gate that flakes is worse than no gate, because engineers learn to click "re-run" without reading why, which quietly recreates the exact self-report problem you were trying to eliminate. A few practical notes from running this pattern in real pipelines:

**Auth.** Most UI flows worth gating sit behind a login. Re-authenticating on every PR run wastes time and adds a failure surface unrelated to the actual PR. `browserbash auth save <name> --url <login-url>` opens a browser once, you log in, and Enter saves the session as a Playwright storageState profile. CI jobs then run with `--auth <name>` (or `auth:` frontmatter in the test file) instead of re-logging in on every gate check. If the saved profile's origins don't cover the target URL, BrowserBash prints a warning rather than silently doing nothing, which is the failure mode you actually want on a CI gate: loud, not silent.

**Cost.** Every gate run against a hosted model costs something, and an agent that opens ten PR revisions in an afternoon multiplies that fast. `run_end` carries a `cost_usd` estimate from a bundled per-model price table, and `run-all --budget-usd` stops the suite once spend crosses a threshold rather than letting a runaway loop burn the CI budget silently. The replay cache also helps here materially: a green run records its actions, and an identical subsequent run replays them with close to zero model calls, only stepping the agent back in when the page actually changed. For a gate that runs on every push to a PR branch, that's the difference between a check that costs cents and one that costs dollars per iteration.

**Flakiness from the model side, not the app side.** If your gate uses a small local model (roughly 8B parameters and under) via Ollama, expect more flakiness on multi-step flows, not because the app is broken but because the model itself loses track of state partway through. For a CI gate specifically, where a false failure blocks a merge and wastes a reviewer's attention, a mid-size local model (Qwen3 or Llama-3.3 70B-class) or a capable hosted model is the safer default. Deterministic Verify and API steps sidestep this concern entirely for the parts of the check that matter most, which is another reason to lean on them at the gate layer.

A merge gate answers the question at the moment of merge, not what happens two weeks later when a backend dependency quietly changes shape. That's a job for `browserbash monitor <test|objective> --every 10m --notify <webhook>`, which reruns the same test file on an interval and alerts only on pass-to-fail state changes, never on every green run. It closes the loop: the gate catches the regression before merge, the monitor catches the one that slips through anyway.

## Who this pattern is for, and where it isn't the right fit

This CI-gate pattern earns its keep on teams where an AI agent is regularly opening PRs against user-facing UI: a startup running Claude Code or Cursor as a primary contributor to the frontend, a team using an agent for high-volume UI maintenance (copy changes, component swaps, dependency bumps that touch rendering), or anyone who has already been burned once by a merge that looked clean in the diff and broke in production. If an agent's UI PRs are rare or low-stakes, a lighter gate (a human smoke-test, or just the unit suite) may be all you need, and standing up a full BrowserBash gate for one PR a month is more process than the risk warrants.

It's also worth being honest about what this doesn't replace. A merge gate scoped to the affected flow catches regressions in that flow. It does not replace a broader regression suite, and it does not replace code review, a check that says "the button still works" says nothing about whether the underlying logic is correct, secure, or maintainable. Treat it as a floor, not a ceiling: the minimum bar an AI-authored UI change has to clear before a human even looks at it, freeing reviewer attention for the things a browser check can't see.

## Getting started with the gate

The fastest path to trying this on a real repo is to pick one flow you'd actually be nervous about an agent breaking (checkout, login, a settings save) and wire a single test file to the Action before expanding further. Start narrow, watch it catch a real regression once, and the case for widening coverage makes itself. The full Action reference, including matrix and sharding options for larger suites, is documented at the [GitHub Action guide](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), and worked examples of testmd files with Verify steps are in the [tutorials](https://browserbash.com/tutorials).

If your team is deciding between a self-report and a real gate, the [case study](https://browserbash.com/case-study) page has a longer look at how this plays out over time, and the [features](https://browserbash.com/features) page covers the rest of the CLI (replay cache, cost governance, sharding) that makes running this on every PR practical rather than expensive. The [learn](https://browserbash.com/learn) section covers writing your first `*_test.md` file if you're starting from zero.

## FAQ

### How do I stop an AI coding agent from merging its own broken UI changes?

Add a required CI status check that runs an independent, deterministic browser test against the flow the PR touched, rather than trusting the agent's own summary of the change. BrowserBash's GitHub Action does this by running a scoped `*_test.md` file and posting a pass/fail verdict as a PR comment tied to a required status check, so the merge button stays blocked until a real browser confirms the flow works.

### What's the difference between an AI self-report and a deterministic UI verification?

An AI self-report is the same model that wrote the code describing whether it thinks the change works, based on reading its own diff. A deterministic verification, like a BrowserBash Verify assertion, is a real Playwright check against the live DOM (URL, visible text, element counts, stored values) that returns pass or fail with expected-versus-actual evidence, independent of any model's opinion.

### Can I run this verification before opening the PR, not just in CI?

Yes. Installing `browserbash mcp` into your coding agent's tool list (`claude mcp add browserbash -- browserbash mcp` for Claude Code, similarly for Cursor, Windsurf, or Codex) gives the agent direct access to `run_test_file` and `run_objective` as native tool calls, so it can check its own work against the same test the CI gate will run before it ever pushes.

### Does this replace unit tests or code review?

No. It fills a specific gap: unit tests check functions and rarely open a real browser, and code review checks logic and design but can't observe rendered DOM behavior. A CI-gate browser check confirms the actual user-facing flow still works after the change, and it's meant to sit alongside both, not instead of either.

Add it to a repo where an agent already opens PRs and you'll know within one real regression whether it earns a permanent spot in the pipeline. Install with `npm install -g browserbash-cli` and wire the Action into your first workflow, or start at [browserbash.com/sign-up](https://browserbash.com/sign-up) if you want the optional hosted dashboard alongside it (an account is not required to use any of this).
