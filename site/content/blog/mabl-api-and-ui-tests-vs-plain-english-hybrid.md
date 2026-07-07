---
title: Mabl API + UI Tests vs Plain-English Hybrid Suites
description: "Mabl blends API and UI steps in its cloud; testmd can mix deterministic API steps with plain-English UI checks in one file. Compare hybrid suites."
date: 2026-07-05
category: comparison
---

A teammate invite is a small feature with an outsized blast radius on a B2B SaaS admin console. Get the role wrong and someone can't do their job, or worse, can see billing data they shouldn't. Say you own the regression test for exactly that screen. The invite itself is created by a `POST /api/invites` call your backend already covers at the unit level. What you actually need proven, on every change to the admin UI, is narrower: a freshly invited teammate shows up in the Pending Invites table with the right email and the right role badge, without your suite re-running the invite modal's own click-through-and-fill test every single time. That's a hybrid test: fast, deterministic setup through the API, then a check through the UI that only a rendered page can answer.

Both mabl and BrowserBash will tell you they support this pattern, mixing API calls and browser steps in one test. They mean two structurally different things by it. mabl blends them inside one visual flow that lives and runs in its cloud. BrowserBash's `testmd` format can mix a deterministic API call, a deterministic UI assertion, and a plain-English step in one committed Markdown file, and it tells you, per line, whether a pass came from code or from a model's judgment. If you're evaluating mabl specifically for how it handles API-plus-UI journeys, or looking for a **mabl api testing alternative** that keeps that logic in your repo, this is the axis that actually matters, not a generic pricing or SaaS-versus-CLI comparison.

## The hybrid problem both tools are chasing

Every mature regression suite eventually hits the same wall: driving the whole flow through the UI to reach the one screen you care about is slow and it manufactures flakiness you didn't ask for. Registering an account, confirming an email, logging in, and clicking through an invite modal just to check a table row multiplies your failure surface by every intermediate screen, and none of those screens is the thing under test. The fix is to separate concerns: seed state fast and deterministically (an API call either returns 201 or it doesn't), then verify meaning where only a rendered browser can tell you the truth (does the row actually show "Editor" and "Pending," not garbled text or a stale cache). Both mabl and BrowserBash have converged on that same shape. Where they diverge is what the hybrid test becomes as an artifact, and who or what is doing the judging on each half.

## How mabl blends API and UI steps in one cloud flow

mabl added API testing directly into its platform: you can create API test steps as HTTP requests and chain them into the same journey as your browser steps, inside the same visual trainer you use for UI flows. A value pulled from an API response can feed into a later UI step in that journey, and the whole thing runs, end to end, in mabl's managed cloud, under the same AI-assisted execution and self-healing that mabl applies to browser tests. That's a genuinely strong pitch for a team that wants one authoring surface: a QA engineer who has never opened a terminal can build "seed via API, then check the UI" without leaving the trainer, and the run lands in the same dashboards, history, and analytics as everything else in the workspace.

The trade-off comes with any platform feature: the API step, like the UI step, is a piece of mabl's workspace, executed in mabl's cloud, reported through mabl's dashboards. You get one unified pipeline, but it's a pipeline you rent rather than a text file you diff in a pull request. And because mabl builds its platform around AI-assisted maintenance, it's not always obvious which parts of a green run were a literal deterministic HTTP check and which leaned on the platform's own inference about what "looks right." Teams that want that abstracted away get exactly that; teams that want to audit what ran get friction instead.

## How testmd expresses the same flow as one committed file

BrowserBash takes the opposite bet: keep the hybrid test as plain text in your repo, and make the deterministic parts *provably* deterministic rather than abstracted into a platform's judgment. [BrowserBash](https://browserbash.com) is a free, open-source (Apache-2.0) CLI: `npm install -g browserbash-cli`, then either run a one-off plain-English objective or write a committable `*_test.md` file. Opting a test file into `version: 2` frontmatter turns on per-step execution, where every line is classified, before the run starts, into exactly one of three kinds: a deterministic API call, a deterministic `Verify` assertion, or a plain-English action for the agent. Only the third kind ever touches a model.

Here's the invite scenario as one file, `invite_teammate_test.md`:

```markdown
---
version: 2
---
# Invite a teammate and verify the pending row

- POST {{base_url}}/api/invites with body {"email": "morgan@example.com", "role": "editor"}
- Expect status 201, store $.id as 'invite_id'
- Open the team settings page
- Verify the text 'morgan@example.com' is visible
- Verify the text 'Pending' is visible
- Verify the invite row shows the Editor role with the correct badge color
```

Run it the same way you'd run any test file:

```bash
browserbash testmd run ./.browserbash/tests/invite_teammate_test.md \
  --variables '{"base_url":"https://staging.example.com"}' \
  --agent --headless
```

Six lines, one committed Markdown file, sitting in your repo next to the code that changes the admin UI. No trainer, no workspace to log into, nothing to export if you ever want to stop paying for anything.

## What actually happens when that file runs

This is where the two approaches stop looking similar. The `POST` line runs as a plain `fetch()` call: no browser, no model, and it either returns 201 or the test stops right there with the real status code, arrange-act-assert style, because a failed setup makes every later check meaningless. `Expect status 201, store $.id as 'invite_id'` reads the response and stores the ID for reuse, still zero model calls. "Open the team settings page" is the one plain-English line in that stretch, so it becomes a single agent objective. The next two `Verify` lines compile to real Playwright checks (`getByText(...).waitFor({ state: 'visible' })` under the hood), polled until they pass or time out, no model involved. The last line doesn't match any of BrowserBash's nine deterministic `Verify` phrasings, so it falls back to the agent to judge, and it's flagged as such rather than counted the same as the checks above it.

In this six-line file, exactly two lines ever reach a model: the navigation step and the free-form badge-color judgment at the end. They run as two separate objectives, not one, because the deterministic `Verify` lines in between each close out the current agent block. The resulting `run_end.assertions` array makes that distinction explicit and machine-readable:

```json
{
  "assertions": {
    "passed": 3,
    "failed": 0,
    "details": [
      { "step": "Verify the text 'morgan@example.com' is visible", "passed": true, "expected": "text 'morgan@example.com' visible" },
      { "step": "Verify the text 'Pending' is visible", "passed": true, "expected": "text 'Pending' visible" },
      { "step": "Verify the invite row shows the Editor role with the correct badge color", "passed": true, "judged": true }
    ]
  }
}
```

`judged: true` on that last line is the whole point. Nothing upstream of it in the file carries that flag, because nothing upstream of it needed a model to decide pass or fail.

## Rented judgment vs owned determinism

This is the real axis behind a **mabl api testing alternative** search, more than price or hosting. In mabl, the API step and the UI step both run inside one AI-assisted execution engine the platform owns; you get a unified pipeline, but you're trusting its judgment across the whole flow and can't easily pull that judgment apart from the vendor's cloud to inspect it. In BrowserBash, the API step is a literal HTTP request with no model in the loop. The `Verify` lines that match the grammar are literal Playwright waits and counts, also model-free. Only the plain-English lines you deliberately leave in the file cost a model call, and the file states, per line, which category each one fell into. You aren't getting less AI than mabl by making fewer model calls; you're getting a test where any single assertion tells you, unambiguously, whether it's a hard check or an opinion.

That distinction compounds at scale. A suite of a hundred hybrid tests in mabl is a hundred flows the platform's AI is responsible for keeping green. A suite of a hundred `version: 2` testmd files is mostly deterministic checks with a thin, visible layer of agent-judged lines you can count, review, and tighten over time by rewriting fuzzy `Verify` lines into one of the nine grammar forms once you know what "correct" looks like on that screen.

## Where mabl's blended approach still wins

It would be dishonest to stop there. mabl's authoring model has a real advantage BrowserBash doesn't try to match: a non-technical tester builds an API-plus-UI journey by pointing and clicking in the trainer, with no need to learn a `Verify` sentence grammar or write a JSON body by hand. The platform also bundles API, UI, and (per mabl's own positioning) performance testing into one managed service with one set of dashboards, and you never have to decide which engine or model runs your test, because mabl owns that decision. For a team that wants a single vendor relationship, a supported product, and a visual surface for testers who don't want to touch a terminal, that's not a compromise, it's the product working as designed.

## The honest limits of testmd v2 today

BrowserBash's hybrid format has real, current constraints worth stating plainly. `version: 2` files drive the builtin engine only, switching to it automatically even if `stagehand` is your configured default; that engine speaks the Anthropic API, so the plain-English lines need a real Anthropic key or an `ANTHROPIC_BASE_URL` gateway, not a local Ollama model directly. The replay cache, which normally lets a green run replay its recorded actions with no model calls at all, does not apply here: per-step execution reports `cache: "off"`, since the whole-run journal it relies on doesn't map onto a file mixing HTTP calls, deterministic checks, and agent blocks. And the nine `Verify` grammar forms cover URL, title, visible text, named roles, element counts, and stored-value equality, real coverage for what most regression suites write, but genuinely fuzzy conditions ("verify the page feels trustworthy") still fall through to the agent. None of this is a footnote to bury; it's what "own the file, keep the model out of the deterministic half" costs today.

## What lands in CI and what it costs

Both approaches gate a merge. mabl's value here is the platform: dashboards, history, and notifications, managed for you, with a run that passes or fails inside mabl's own reporting. BrowserBash's contract is self-contained: add `--agent` and the run emits NDJSON with a stable `run_end` event carrying `status`, the `assertions` breakdown, and `cost_usd` (estimated from a bundled price table, present only for recognized models), plus the standard exit codes, `0` passed, `1` failed, `2` error, `3` timeout, that a CI step branches on without parsing prose. Running a folder of hybrid tests through `run-all` adds `--budget-usd` as a hard spend stop across the suite, plus JUnit output and a merged NDJSON stream. Full command surface: [BrowserBash features](https://browserbash.com/features).

## Choosing between the two

Choose mabl's blended flows when your testers are non-technical and a visual trainer is how your team authors, when you want API, UI, and broader quality testing inside one managed platform, or when a supported vendor relationship matters more than owning the artifact. Choose BrowserBash's `testmd` hybrid files when you want the deterministic half of a test provably deterministic rather than abstracted into a platform's AI, when tests need to live in git and get reviewed in a pull request, or when you want to know, per assertion, whether a pass came from a real check or a model's judgment. Plenty of teams run both: a managed platform for the team-wide program, and a handful of `version: 2` files for the hybrid checks a developer wants sitting next to the code they touch.

## Try it on your own hybrid flow

The fastest way to feel the difference is to take one flow you'd normally seed by clicking through screens and write it as a six-line file instead:

```bash
npm install -g browserbash-cli
browserbash testmd run ./invite_teammate_test.md --variables '{"base_url":"https://staging.example.com"}'
```

You don't need an account to run it, and nothing leaves your machine unless you explicitly connect one. Compare the file itself, sitting in your repo, diffable and reviewable, against the equivalent flow in whatever platform you're currently paying for, and decide from there which half of your suite belongs in each.

## FAQ

### Is BrowserBash a real alternative to mabl for API-plus-UI testing?

For the specific pattern of seeding state via API and verifying it in the UI, yes: BrowserBash's `testmd` v2 format lets you write deterministic API steps, deterministic `Verify` assertions, and plain-English UI steps in one committed file, and it's free and open source. It isn't a feature-for-feature swap for mabl's whole platform: there's no visual trainer, no built-in performance testing, and no team-wide managed dashboard by default. If the goal is specifically hybrid API-plus-UI regression checks that live in your repo, it covers that ground directly.

### Can a testmd file really mix API calls with plain-English UI checks in one file?

Yes. With `version: 2` in the frontmatter, each line is classified as an API call (`POST/GET/PUT/DELETE/PATCH <url> with body {...}`, optionally followed by `Expect status <n>, store $.path as 'name'`), a deterministic `Verify` assertion, or a plain-English action. They execute in order against one browser session, so a value stored from an API step is available to later steps via `{{name}}`.

### Do BrowserBash's API and Verify steps use an AI model at all?

No. API steps run as plain HTTP requests with no model involved, and `Verify` lines that match one of the nine deterministic grammar forms compile to real Playwright checks (visibility waits, element counts, URL and title reads, stored-value comparisons). Only plain-English action lines, and any `Verify` line that doesn't match the grammar, are handed to the agent.

### What happens if a Verify line doesn't match the deterministic grammar?

It still runs, just judged by the agent instead of compiled into a hard check, and the result is flagged `judged: true` in the `run_end.assertions` output and marked as agent-judged in `Result.md`. Nothing fails silently or gets skipped; you can always tell, per line, whether a pass was a real check or a model's opinion.

### Does the replay cache work with these hybrid version 2 files?

Not currently. `version: 2` runs execute step by step and report `cache: "off"`, because the whole-run replay journal is built around a single recorded objective, not a file that mixes HTTP calls, deterministic assertions, and grouped agent blocks. Regular `version: 1` tests and one-off `browserbash run` objectives still get the replay-first cache.

### Do I need a specific model to run a hybrid testmd v2 file?

The plain-English lines in a `version: 2` file run on BrowserBash's builtin engine, which speaks the Anthropic API, so you need `ANTHROPIC_API_KEY` set (or an `ANTHROPIC_BASE_URL` gateway pointed at a Claude-compatible endpoint) rather than a local Ollama model directly. The API and `Verify` steps in the same file don't need a model at all, regardless of what's configured.
