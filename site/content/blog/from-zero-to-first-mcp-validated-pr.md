---
title: Zero to a Browser-Validated PR in 10 Minutes
description: "A hands-on browser validated pull request tutorial: install BrowserBash, connect it over MCP, write a test, and ship a PR with a real verdict."
date: 2026-07-31
category: tutorial
---

If you've ever merged a PR because "the build passed" and then watched a customer hit a broken checkout an hour later, you already know the gap this browser validated pull request tutorial is trying to close. Unit tests confirm a function returns the right value. They don't confirm that a real browser can click the button, submit the form, and land on the confirmation page. By the end of this walkthrough you'll have gone from an empty terminal to a pull request carrying a real pass/fail verdict comment, using a free CLI, one plain-English test file, and a GitHub Action. If you're copying commands as you go, expect this to take closer to ten minutes than an hour.

The tool doing the work is BrowserBash, a free, open-source CLI [published on npm](https://www.npmjs.com/package/browserbash-cli) that takes a plain-English objective and hands it to an AI agent that drives a real Chrome or Chromium browser step by step. No selectors to maintain, no page objects to hand-roll, nothing that snaps the moment a designer renames a CSS class. You describe the flow the way you'd describe it in a ticket, and the agent figures out how to execute it. What comes back isn't a paragraph you have to interpret, it's a structured verdict: status, summary, final state, assertions, cost, duration. That structure is what makes this usable as an actual merge gate instead of a demo.

## What a browser-validated pull request actually means

Most teams doing AI-assisted development have a gap between "the code compiles and the unit tests pass" and "the feature actually works when a person clicks through it." A type checker doesn't catch a modal that never opens because a transition got misconfigured. A unit test doesn't catch a form posting to the wrong endpoint. Someone, or something, still has to open the page and try it.

That's the whole idea behind a browser-validated PR: an agent, yours or one running in CI, opens a real browser, performs the objective you wrote in English, and reports back a verdict with evidence attached. It doesn't replace unit tests or a linter. It sits right before merge and answers one honest question: did the thing a user would actually do work?

This matters more now than it did a couple of years ago because a growing share of pull requests get opened by AI coding agents in the first place, not just humans. Claude Code, Cursor, and Codex can write a feature end to end, but they're notoriously bad at knowing when they're wrong, because a coding agent has no eyes. It can reason about a diff, but it can't watch a page render. BrowserBash exists specifically to hand agents, and the humans reviewing their work, the missing feedback loop: open the browser, try the thing, tell the truth about what happened.

## Install BrowserBash and take it for a smoke test

You need Node 18 through 22. Install is one line, then confirm it landed and run a throwaway objective to prove the browser, model, and CLI are all talking to each other:

```bash
npm install -g browserbash-cli
browserbash --version
browserbash run "Open https://example.com and confirm the heading says Example Domain" --headless
```

You should see `1.5.1` from the version check, and a printed verdict from the run. No API key is required to get this far. BrowserBash resolves models in order: local Ollama first if you have it running, then `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`, then OpenRouter. If none of those are configured it prints setup guidance instead of failing silently, so you're never left guessing why a run produced nothing.

One honest caveat before going further: small local models, roughly 8B parameters and under, can be flaky on longer multi-step objectives. They're fine for a one-off click, but for anything chaining several steps together, point at a mid-size local model in the Qwen3 or Llama 3.3 70B-class range, or use a hosted model for the harder flows. This isn't a BrowserBash quirk so much as a reflection of what small models are actually good at right now.

## Connect BrowserBash to your agent host over MCP

This is where the workflow gets interesting if you're building with an AI coding agent day to day. BrowserBash ships an MCP server as of version 1.5.0, which means your agent host, whether that's Claude Code, Cursor, Windsurf, Codex, or Zed, can call BrowserBash directly as a tool instead of you pasting terminal output back and forth between windows.

Adding it to Claude Code is one command: `claude mcp add browserbash -- browserbash mcp`.

The pattern is the same for other MCP-capable hosts: point the host's MCP config at the `browserbash mcp` command, which serves over stdio. Once connected, your agent gets three tools. `run_objective` fires a single plain-English objective at a real browser and returns the structured verdict. `run_test_file` runs a committed `*_test.md` file, same verdict shape. `run_suite` runs every test file in a folder, in parallel, and rolls the results up.

What actually changes how you work is the return shape. It's not prose the agent has to interpret loosely, it's JSON carrying `status`, `summary`, `final_state`, `assertions`, `cost_usd`, and `duration_ms`. A failed test is still a successful tool call: the agent reads `status: "fail"` and can act on it, retry a fix, flag it to you, whatever you've told it to do, instead of assuming everything's fine because the call itself didn't error out.

If you'd rather browse a registry than type a config path from memory, BrowserBash is also listed on the official MCP Registry as `io.github.PramodDutta/browserbash`, so any host with registry discovery will surface it by name. Once MCP is wired up, you can ask your coding agent directly: "implement this feature, then use BrowserBash to verify the signup flow before you open the PR." The agent writes the code, calls the tool, reads the verdict, and only proposes the PR once it's watched the feature actually work. That loop used to require a human standing in the middle of it.

## Write your first plain-English test file

Terminal one-liners are fine for smoke tests, but for anything worth keeping you want a committed test file. Create a directory for it with `mkdir -p .browserbash/tests`, then save the following as `.browserbash/tests/signup_test.md`:

```markdown
# Signup flow works end to end

- Open https://browserbash.com/sign-up
- Fill in the email field with {{TEST_EMAIL}}
- Click the "Create account" button
- Verify 'Welcome' heading visible
```

A few things worth understanding here. The `#` line is the title. Steps are a plain markdown list, `-` bullets or `1.` numbers, whichever reads more naturally to you. `{{TEST_EMAIL}}` is a variable, substituted at run time from a variables file or environment, and if you mark it as a secret it gets masked as `*****` in every log line automatically, so you can reference real credentials without leaking them into a CI log. The `Verify` line at the end deserves its own section, because it's the difference between a test that merely runs and one you can actually trust as a gate. Test files also support `@import` for pulling shared setup steps into multiple files, which keeps a growing suite from turning into copy-pasted boilerplate.

## Run it locally and read the deterministic verdict

Run the file you just wrote in agent-friendly output mode:

```bash
browserbash testmd run .browserbash/tests/signup_test.md --agent
```

The `--agent` flag switches output to NDJSON, one JSON event per line, which is what you want for anything programmatic and is worth getting used to reading even by eye, because it never leaves you parsing prose to figure out whether something passed. You'll see a stream of `step` events as the agent works through the objective, followed by a `run_end` event carrying the final verdict.

Exit codes follow a fixed contract you can build automation on without worrying about it changing under you: `0` for passed, `1` for failed, `2` for an error, including a budget stop if you've set one, and `3` for timeout. That's the entire surface a CI system needs to make a merge or no-merge decision. If this is your first real run, drop `--agent` and skip `--headless` too, and just watch the browser open and click through your own flow once. It's worth more than any documentation for building intuition on what the agent is actually doing under the hood.

After the run finishes, BrowserBash writes a human-readable `Result.md` next to your test file automatically, so teammates who never touch the CLI can open a markdown file and see exactly what happened, step by step, without parsing NDJSON.

## Tighten your browser-validated PR with Verify assertions and testmd v2

The single `Verify` line in the test above compiles to a real Playwright expectation, not a model's opinion. This landed in version 1.5.0 and it's the piece that turns BrowserBash from "an agent that clicks around and describes what it saw" into something you can actually gate a merge on. The supported grammar covers the checks that come up constantly in real suites: URL contains a substring, page title is or contains a string, specific text is visible, a named button, link, or heading is visible, an element count matches, or a previously stored value equals something.

When a `Verify` line matches that grammar, the check runs deterministically, no LLM judgment, just a Playwright assertion that either holds or doesn't. A failure comes back with expected-versus-actual evidence in `run_end.assertions` and in the assertion table inside `Result.md`. If a `Verify` line falls outside the built-in grammar, it still runs, just agent-judged instead, and it's flagged `judged: true` in the output so you always know which kind of check you're looking at.

If you want tighter control over ordering, or want to mix in real API calls to seed test data before the UI even loads, add `version: 2` to your test file's frontmatter:

```markdown
---
version: 2
---
# Signup flow with seeded state

- POST https://api.browserbash.com/test/reset with body {"seed": "signup-demo"}
- Expect status 200, store $.userId as 'seededUserId'
- Open https://browserbash.com/sign-up
- Fill in the email field with {{TEST_EMAIL}}
- Click the "Create account" button
- Verify 'Welcome' heading visible
```

Under `version: 2`, steps execute one at a time against a single browser session instead of getting joined into one big objective string. API steps like the `POST` and `Expect status` pair above never touch a model at all, they're pure HTTP calls, fast, free, and completely reproducible. Consecutive plain-English steps still get grouped and handed to the agent together, so you're not paying a model call per click. Worth flagging honestly: testmd v2 currently drives the builtin engine, which needs `ANTHROPIC_API_KEY` or a compatible `ANTHROPIC_BASE_URL` gateway. It doesn't run directly on Ollama or OpenRouter yet. If you're all-in on local models, stick with v1 files for now, they behave exactly as they always have.

## Wire the official GitHub Action into your repo

This step actually connects browser validation to your pull request lifecycle. BrowserBash ships a GitHub Action at the repo root. Drop a workflow file at `.github/workflows/browserbash.yml`:

```yaml
name: BrowserBash
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PramodDutta/browserbash@v1
        with:
          tests: .browserbash/tests
          budget-usd: "2.00"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The action installs the CLI, runs your suite, and uploads JUnit, NDJSON, and Result.md artifacts, so you've got a full audit trail attached to every workflow run, not just a pass/fail badge. Set `budget-usd` if you want a hard ceiling on spend for the suite; once a run crosses it, remaining tests are marked skipped rather than launched, the suite exits with code `2`, and the spend shows up in the results and in JUnit's `<properties>` block. Full setup detail lives in the [GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md), including matrix-viewport options if you want a suite to run once per screen size.

## Open a pull request and watch the verdict comment land

With the workflow file committed, open a real pull request against the branch it targets. The action fires on `pull_request`, runs your `.browserbash/tests` folder, and posts a self-updating PR comment with a verdict table: which tests passed, which failed, and links to any recordings or Result.md artifacts, plus total cost if you've set a budget. Push a new commit to the same PR and the comment updates in place instead of stacking a fresh one every time, so the thread stays readable instead of turning into a wall of bot comments.

This is the payoff of the whole tutorial. A reviewer opens the PR, sees the code changes on one side and a verdict table on the other, and doesn't have to pull the branch locally and click through the app themselves to know whether the signup flow still works. If you're pairing this with a coding agent that opened the PR in the first place, the loop closes tighter still: the agent wrote the code, ran BrowserBash via MCP before proposing the PR, and the same suite runs again in CI as an independent check, catching anything that only shows up in a clean environment, a missing env var, an unpinned dependency, whatever local state quietly papered over.

Be honest with yourself about what a green verdict means and doesn't mean. It means the specific objectives you wrote were satisfied by a real browser session. It doesn't mean your app has zero bugs, and it's not a substitute for a human reading the diff. Treat it as a strong signal that narrows what a reviewer needs to worry about, not a replacement for judgment.

## Beyond the first PR: auth, monitoring, and cost control

Once the PR-gate loop works, a few things come up fast in real usage. First, re-login. If your suite touches an authenticated area, save a session once instead of logging in on every run:

```bash
browserbash auth save qa-user --url https://browserbash.com/sign-in
browserbash monitor .browserbash/tests/signup_test.md --every 10m --notify https://hooks.slack.com/services/XXX
browserbash run-all .browserbash/tests --shard 2/4 --budget-usd 2 --junit out/junit.xml
```

The first line opens a browser, you log in by hand once, hit Enter, and it's saved as a Playwright storageState profile you can reuse with `--auth qa-user` on any run, testmd file, or run-all invocation, or via `auth:` frontmatter in the test file itself. The [learn section](https://browserbash.com/learn) covers auth profiles and the rest of the config surface in more depth than fits here. The second line checks your signup flow every ten minutes and alerts only when the result flips from pass to fail or back, never on every green run, so it doesn't become noise you learn to ignore. Slack incoming-webhook URLs get formatted automatically; other URLs get the raw JSON payload. Combined with the replay cache, which records a passing run's actions and replays them token-free the next time nothing on the page changed, an always-on monitor barely costs anything to keep running.

The third line shows sharding, useful once a suite is big enough to split across parallel CI jobs. It's computed deterministically from sorted discovery order, so four machines each running a different shard number always agree on who runs what, no coordination needed between them.

If you're migrating off an existing Playwright suite rather than starting from scratch, `browserbash import` converts specs to plain-English test files heuristically, no model involved, fully deterministic. Anything it can't safely translate lands in an `IMPORT-REPORT.md` instead of getting silently dropped or guessed at. And if you'd rather skip writing files by hand entirely, `browserbash record <url>` opens a visible browser, you click through the flow once, hit Ctrl-C, and it writes a plain-English test from what you did, with password fields never leaving the page during capture.

## Who this workflow fits (and who should look elsewhere)

This setup earns its keep fastest on teams where PRs come from a mix of humans and AI coding agents, where the app under test is a real browser-rendered UI rather than a headless API service, and where the cost of a broken flow reaching production is meaningfully higher than a few extra minutes on CI. QA-heavy teams shipping customer-facing flows, and teams leaning on Claude Code, Cursor, or Codex for feature work, are the clearest fit; a real example of that shape of team is in the [case study](https://browserbash.com/case-study). The Ollama-first, no-API-key-required default also makes it a reasonable starting point for teams that want to keep everything on their own infrastructure before deciding whether to bring in a hosted model. The full [feature list](https://browserbash.com/features) is worth a skim if you want the wider picture beyond what this tutorial covers.

It's a worse fit if your app has almost no browser surface, if your CI budget genuinely can't absorb even a modest per-PR model cost, though `--budget-usd` and the replay cache both exist to keep that cost small, or if you need pixel-perfect visual regression testing, which isn't what this tool is built for. If your entire QA problem is whether a component's snapshot changed by three pixels, a dedicated visual-diff tool is still the more direct answer. And if you already have a mature, fast Playwright suite everyone on the team understands well, there's no need to rip it out. Layer BrowserBash on top for the PR-comment verdict and the MCP-driven agent self-checks, or use `browserbash import` to bring the specs you care about most across, and keep the rest of your existing suite doing what it already does well.

## FAQ

### Do I need an API key to use BrowserBash?

No. BrowserBash defaults to local Ollama models first, and only falls back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or OpenRouter if you've set one of those up. For a first run, a local model is enough to see the workflow end to end, though larger multi-step tests benefit from a mid-size or hosted model for reliability.

### How is this different from just writing Playwright tests?

Playwright is the execution layer underneath BrowserBash's builtin engine, so it's not a replacement so much as a different authoring interface: you write plain-English steps instead of selectors and page objects, and an AI agent figures out how to execute them against the live DOM. If you already have a mature Playwright suite, `browserbash import` can convert it rather than asking you to start over.

### Does a failed BrowserBash run block my PR from merging?

That depends entirely on how you configure the GitHub Action and your branch protection rules. The action reports pass, fail, error, or timeout using standard exit codes, and you decide whether to make that a required check. BrowserBash doesn't force a merge policy on you, it gives you an honest verdict to build one around.

### What happens if my test suite starts costing too much to run on every PR?

Set a `budget-usd` cap on `run-all` or in the GitHub Action config. Once a suite crosses the budget, BrowserBash stops launching new tests, marks the rest skipped, exits with code `2`, and reports the actual spend in the results and JUnit output. The replay cache also helps here: a passing run's actions get recorded and replayed on subsequent identical runs without calling a model at all.

Getting from zero to a browser-validated PR really is a ten-minute exercise once you've done it once: install the CLI, wire the MCP server into your agent host, write one testmd file with a `Verify` line, drop in the GitHub Action, and open a PR. Start with `npm install -g browserbash-cli` and try it against your own staging URL, or [create a free account](https://browserbash.com/sign-up) later if you want the hosted dashboard, an account is entirely optional for everything covered here.
