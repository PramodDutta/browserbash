---
title: BrowserBash GitHub Action vs a Custom CircleCI Orb
description: "BrowserBash GitHub Action vs CircleCI orb: what the zero-config action gives you free, and what a hand-rolled orb still has to build itself."
date: 2026-07-10
category: ci
---

If you run browser checks in CI, you eventually face a build-versus-buy decision, and the BrowserBash GitHub Action vs a CircleCI orb question is a clean version of it. On GitHub Actions, `browserbash-action@v1` gives you a working PR-comment verdict, sharded matrix jobs, and a budget cap in about ten lines of YAML. On CircleCI, there is no equivalent published orb, so the same outcome means writing your own orb, wiring your own comment poster, and maintaining the whole thing yourself. Neither path is wrong. This article walks through exactly what each one costs you in setup time, ongoing maintenance, and hidden edge cases, so you can pick correctly for your stack instead of guessing.

## Why this comparison matters more than it looks

Most CI comparisons for browser testing focus on the test runner itself: does it click things reliably, does it handle flaky selectors, does it produce a trustworthy pass or fail. That is a real question and BrowserBash answers it with a natural-language objective driving a real Chrome browser instead of hand-maintained selectors and page objects. But the question in this article is one layer up. Once you have a runner that produces a verdict, how much work does it take to get that verdict into your pull request, split across parallel workers, and capped so a runaway suite does not burn your CI budget or your LLM spend?

That wiring work is invisible until you have to build it. A team on GitHub Actions can lean on a published, versioned action that already solved artifact upload, PR comment formatting, and matrix sharding. A team on CircleCI, as of this writing, cannot point to an equivalent published orb for BrowserBash, which means every piece of that wiring is a DIY project: a custom orb definition, a script to call the GitHub or GitLab API for comments, your own sharding math, your own budget guardrail. The CLI itself works identically on both platforms because it is just a Node binary, but the glue around it is where the effort difference actually lives.

## What the BrowserBash GitHub Action gives you out of the box

The action lives at the root of the [BrowserBash repository](https://github.com/PramodDutta/browserbash) as `action.yml`, and it does four things without any custom scripting:

1. Installs the CLI (`npm install -g browserbash-cli`) at a pinned version so your pipeline is reproducible.
2. Runs your suite with `run-all`, `run`, or `testmd run` depending on the inputs you pass.
3. Uploads JUnit XML, NDJSON events, and human-readable `Result.md` files as build artifacts automatically.
4. Posts a self-updating pull request comment with a verdict table: which tests passed, which failed, duration, and cost where available.

A minimal workflow looks like this:

```bash
# .github/workflows/browserbash.yml
name: BrowserBash
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PramodDutta/browserbash-action@v1
        with:
          tests: ./.browserbash/tests
          budget-usd: 2
```

That is the whole pipeline. No custom script writes to the PR, no separate step parses JUnit into a table, no manual artifact upload block. The action also supports sharded matrix jobs natively, so splitting a large suite across parallel runners is a `strategy.matrix` block plus a `shard:` input, not a homegrown partitioning script:

```bash
jobs:
  e2e:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PramodDutta/browserbash-action@v1
        with:
          tests: ./.browserbash/tests
          shard: ${{ matrix.shard }}/4
          budget-usd: 2
```

Under the hood this is the same sharding behavior the CLI exposes directly, `run-all --shard i/n`, computed on sorted discovery order so every parallel machine agrees on which tests it owns without any coordination service. The action just wires that flag to your matrix variable and merges the per-shard results back into one PR comment. Full details, including the artifact names and comment format, are documented in [`docs/github-action.md`](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

## What a CircleCI orb would need to replicate this

CircleCI orbs are reusable packages of jobs, commands, and executors, published to the CircleCI orb registry and versioned like any other dependency. In principle, an equivalent BrowserBash orb is buildable, the CLI itself has no GitHub-specific dependency, it is a plain Node binary that reads flags and env vars and writes NDJSON to stdout. The problem is that nobody has published one, and as of this writing there is not an official `browserbash` orb in the CircleCI registry. If you want the GitHub Action's convenience on CircleCI, you are writing it yourself, and that means several separate pieces of work:

**Orb scaffolding.** You need a `.circleci/orb.yml` (or a source-controlled orb project) defining a job that installs Node, installs `browserbash-cli`, and runs your test command. This part is mechanical but not zero effort: parameterizing it well (test path, budget, model, provider) so it is actually reusable across repos takes a few iterations.

**PR comment posting.** CircleCI does not have a first-class "post a comment on this PR" primitive the way GitHub Actions does with `actions/github-script` or comment actions in the marketplace. You would call the GitHub REST API yourself, likely with `curl` and a personal access token or GitHub App token stored as a CircleCI context variable, then format the verdict table from the NDJSON or JUnit output before posting. This is not hard, but it is code you own, test, and maintain, and it is code specific to whichever git host you use, since CircleCI pipelines commonly sit behind GitHub, GitLab, or Bitbucket triggers with different comment APIs each.

**Sharding math.** CircleCI supports parallelism natively (`parallelism: 4` on a job, with `CIRCLE_NODE_INDEX` and `CIRCLE_NODE_TOTAL` env vars), which is actually a decent primitive to build on. But you still have to translate those into the CLI's `--shard i/n` flag yourself, something like `--shard $((CIRCLE_NODE_INDEX + 1))/$CIRCLE_NODE_TOTAL`, and you have to write the step that merges per-node JUnit or Result.md output back into a single readable artifact, since CircleCI does not do that merge for you the way the BrowserBash action does across a GitHub Actions matrix.

**Budget enforcement and exit code handling.** The CLI already stops launching new tests once a suite crosses `--budget-usd` and exits with code 2, reporting remaining tests as skipped in JUnit properties. Wiring that exit code into a CircleCI job that fails loudly and cleanly, rather than looking like a generic script error, needs a small amount of shell around the CLI invocation to interpret exit codes 0/1/2/3 and set the job status and a human-readable summary correctly.

None of this is exotic engineering. A capable DevOps engineer can build a working version of all four pieces in a day or two. The honest point is that "a day or two of DevOps engineering" is exactly the cost the GitHub Action removes for you, and that cost recurs every time the CLI adds a new flag or output field you want reflected in your comment format.

## Feature-by-feature comparison

| Capability | BrowserBash GitHub Action | Hand-rolled CircleCI orb |
|---|---|---|
| CLI install and pinning | Built in, one `uses:` line | You write the install step |
| Test execution (`run-all`, `run`, `testmd run`) | Built in via `with:` inputs | You write the job command |
| JUnit / NDJSON / Result.md artifact upload | Automatic | You add `store_artifacts` steps yourself |
| PR comment with verdict table | Automatic, self-updating | You script it against a git host API |
| Sharded matrix jobs | `shard:` input + GitHub matrix | You translate CircleCI `parallelism` env vars yourself |
| Budget cap (`--budget-usd`) enforcement | Native, exit code 2 handled | You interpret exit codes in shell |
| Maintenance as BrowserBash adds features | Pramod Dutta maintains the action | You maintain the orb |
| Works on non-GitHub git hosts | No, GitHub-specific | Yes, once you build it for your host |
| Time to first working pipeline | Minutes | Hours to a couple of days |

The row worth sitting with is the last one on the GitHub side: the action is GitHub-specific. If your repository lives on GitLab or Bitbucket and you run CircleCI, you were never going to use `browserbash-action@v1` anyway, and the honest comparison for you is CircleCI (or GitLab CI) glue code either way, BrowserBash-specific or otherwise. This article's "vs a custom orb" framing matters most for teams who are on CircleCI by platform choice but would take a pre-built integration if one existed for their host, the same way GitHub users get one today.

## Where the CircleCI DIY path actually wins

It would be dishonest to frame this as the GitHub Action being strictly better. A hand-rolled orb has real advantages once it exists:

**You own the comment format.** The BrowserBash action's PR comment is opinionated: a verdict table with status, duration, and cost where available. If your team wants a different layout, links to internal dashboards, or a Slack post instead of a PR comment, a custom orb lets you build exactly that from day one instead of working around a fixed template.

**You are not tied to GitHub Actions syntax or GitHub's marketplace release cadence.** If BrowserBash ships a new flag and the action has not been updated yet to expose it as a `with:` input, GitHub Actions users wait or fall back to calling the CLI directly in a `run:` step (which always works, since the action is just a convenience wrapper around the same CLI). A custom CircleCI job calling the CLI directly never has that lag, because you wrote it to call whatever flags you want from the start.

**Multi-host support.** As noted above, once you have built the comment-posting logic yourself, extending it to GitLab or Bitbucket is a matter of swapping the API call, not rebuilding the pipeline. The GitHub Action is locked to GitHub by design.

**Existing CircleCI investment.** If your org has years of CircleCI config, contexts, orbs, and institutional knowledge, introducing GitHub Actions just for one integration is its own migration cost, arguably larger than writing the orb glue. Staying on your existing platform and building the wiring in familiar territory is often the pragmatic call, even if it takes a bit longer up front.

None of this requires abandoning BrowserBash's zero-model, deterministic parts. `Verify` steps in a testmd file compile to real Playwright checks, not agent judgment, and that behavior is identical whether the CLI is invoked from a GitHub Action or a raw CircleCI job step. The comparison in this article is entirely about the CI wiring layer, not about the reliability of the underlying test runs.

## A realistic CircleCI config, built from scratch

Here is roughly what the DIY path looks like in practice, condensed. This is not a published orb, it is what you would write directly in `.circleci/config.yml` to approximate what the GitHub Action gives you automatically:

```bash
# .circleci/config.yml (illustrative, not a published orb)
version: 2.1
jobs:
  browserbash-e2e:
    docker:
      - image: cimg/node:20.11
    parallelism: 4
    steps:
      - checkout
      - run: npm install -g browserbash-cli
      - run:
          name: Run sharded suite with budget cap
          command: |
            SHARD_INDEX=$((CIRCLE_NODE_INDEX + 1))
            browserbash run-all ./.browserbash/tests \
              --shard $SHARD_INDEX/$CIRCLE_NODE_TOTAL \
              --budget-usd 2 \
              --junit out/junit-$SHARD_INDEX.xml
      - store_artifacts:
          path: out
      - store_test_results:
          path: out
      # A separate step, not shown, would call the GitHub API
      # to post or update a PR comment from the merged JUnit output.
```

That last comment is doing a lot of quiet work. Merging four shards' worth of JUnit into one coherent PR comment, handling the case where one shard hit the budget cap and skipped tests, and making the comment idempotent across re-runs (so you get one updating comment, not four new ones per push) is exactly the kind of detail the BrowserBash action already handles and a hand-rolled version has to get right through trial and error.

## Cost and maintenance, honestly

The GitHub Action costs you nothing extra to adopt beyond the ten-minute setup: it is free, open source under the same Apache-2.0 license as the CLI, and maintained alongside BrowserBash itself. Your ongoing cost is whatever the CLI itself costs to run: nothing if you are using the default local Ollama models, or your own API spend if you are pointing at a hosted model, capped by `--budget-usd` either way.

The custom orb path costs you build time up front (realistically a day for a solid first version, more if you want polish like idempotent comments and clean multi-shard merging) and then ongoing maintenance every time you want a new BrowserBash capability reflected in your pipeline. That is not a knock on CircleCI, it is just what "no published integration exists yet" means in practice. If a `browserbash` orb does get published to the CircleCI registry in the future, most of this section becomes moot, but as of this writing, it has not been.

## Who should choose which

**Choose the GitHub Action if:** you are already on GitHub Actions, you want a PR comment with a verdict table without writing glue code, you want sharding and budget caps working in minutes rather than days, and the action's opinionated comment format is fine for your team (or you are happy to fall back to raw CLI calls for anything it does not yet expose).

**Choose the DIY CircleCI path if:** your org runs CircleCI and migrating to GitHub Actions is not on the table, you need a non-GitHub comment target (GitLab, Bitbucket, Slack), you want full control over the verdict format from day one, or you are comfortable investing a day of engineering time to own the integration long-term instead of depending on someone else's action version.

**A middle path exists too:** you do not have to choose an all-or-nothing integration. Nothing stops you from running BrowserBash directly inside a CircleCI job with `--agent` for NDJSON output, parsing that yourself into whatever minimal comment or Slack alert you need, without building a full general-purpose orb. If you only need a pass/fail signal on the branch and do not care about a rich PR comment table, that is a far smaller lift than replicating the GitHub Action feature for feature.

## What stays the same regardless of CI platform

It is worth separating what changes between the two paths from what does not. The actual test authoring, the plain-English objectives, the `*_test.md` files with `@import` and `{{variables}}`, the deterministic `Verify:` assertions, the replay cache that makes a stable suite nearly free to re-run, none of that cares which CI system invokes it. A `testmd` file using `version: 2` frontmatter with an API step to seed data and a Verify step to check the UI runs identically whether the calling job is a GitHub Actions step or a CircleCI job step:

```bash
---
version: 2
---
# Checkout confirms order total

1. GET https://api.example.com/cart/42 with body {}
   Expect status 200, store $.total as 'expectedTotal'
2. Go to https://shop.example.com/checkout/42
3. Verify 'Order total' text visible
4. Verify stored value 'expectedTotal' equals text on page
```

That portability is the actual point of BrowserBash as a validation layer: the CI wiring (GitHub Action, CircleCI orb, raw shell script) is a thin, swappable shell around a CLI that behaves the same everywhere, agent-driven or LLM-free where it counts, so switching CI platforms later does not mean rewriting your tests. Your suite in `./.browserbash/tests` moves with you; only the wiring around it changes.

## Deciding without overthinking it

If you are on GitHub Actions today, there is not much of a decision to make: the action exists, it is free, and it saves real setup time with no lock-in beyond GitHub itself, since every input maps to a CLI flag you can always run directly. If you are on CircleCI, the honest state of things as of this writing is that you are building the wiring yourself, and that is a reasonable trade if you value staying on your existing platform or want a non-GitHub comment target. What you should not do is assume feature parity exists somewhere it does not; check [the GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md) for exactly what is automated today, and treat everything else as a build task with a day-or-two budget attached.

Either way, the underlying CLI, the [MCP server](https://browserbash.com/features), the replay cache, and the deterministic Verify assertions are the same regardless of which CI system triggers them, so the CI choice is genuinely just about pipeline convenience, not test quality. You can read more real-world patterns in the [BrowserBash blog](https://browserbash.com/blog) or work through a hands-on example in the [tutorials](https://browserbash.com/tutorials) section before committing to either wiring path.

## FAQ

### Is there an official BrowserBash orb for CircleCI?

Not as of this writing. BrowserBash ships an official GitHub Action (`browserbash-action@v1`) with PR comments, sharding, and budget caps built in, but there is no equivalent published orb in the CircleCI registry, so CircleCI users need to call the CLI directly in their own job steps and build any comment-posting or sharding wiring themselves.

### Can I still use BrowserBash on CircleCI without an orb?

Yes. BrowserBash is a plain Node CLI (`npm install -g browserbash-cli`), so it runs in any CI environment including CircleCI, GitLab CI, Jenkins, or a bare shell script. You lose the automatic PR comment and pre-built sharding wiring that the GitHub Action provides, but every underlying feature, including `run-all --shard i/n`, `--budget-usd`, and `--agent` NDJSON output, works identically from a raw CircleCI job.

### Does the BrowserBash GitHub Action require an API key?

No, if your suite runs on the default local Ollama models, nothing leaves the CI runner beyond what your test objectives navigate to on the web, and no API key is required. If you configure a hosted model (Anthropic, OpenAI, or OpenRouter) for harder flows, you supply that key as a CI secret and the action passes it through to the CLI the same way a manual invocation would.

### How does sharding work in the BrowserBash GitHub Action compared to CircleCI's parallelism?

Both platforms let you split a suite across parallel workers, but the mechanics differ. The GitHub Action maps a `shard:` input directly to the CLI's `--shard i/n` flag inside a GitHub Actions matrix job, and BrowserBash computes each shard's test slice deterministically from sorted discovery order, so machines agree without coordination. On CircleCI, you get native `parallelism` with `CIRCLE_NODE_INDEX` and `CIRCLE_NODE_TOTAL` env vars, but you have to translate those into the same `--shard` flag yourself and merge the resulting JUnit files, since there is no pre-built orb doing that translation for you today.

Getting started with either path takes the same first step: `npm install -g browserbash-cli`. From there, wire it into a GitHub Actions workflow with `browserbash-action@v1` in minutes, or start scripting your own CircleCI job around the CLI directly. An account is entirely optional for either approach, but if you want the free cloud dashboard for run history across both, you can [sign up here](https://browserbash.com/sign-up).
