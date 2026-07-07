---
title: Testim Cloud Tests vs Git-Committed Plain-English Tests
description: "Testim tests live in its editor and cloud; testmd files live in your repo and diff in review. Compare ownership, portability, and PR workflow."
date: 2026-07-05
category: comparison
---

It is 4:40pm on a Thursday, and a frontend engineer is finishing a pull request that changes one sentence: the checkout confirmation page used to read "Thank you for your order!" and now reads "Your order is on its way!" A smoke test asserts on that exact sentence, and it will fail on the next run unless someone updates it too. What happens next depends entirely on where that test lives, a question most teams never examine until it matters.

If it is a Testim flow, the assertion sits inside a validation step of a recorded journey, stored in Testim's hosted editor under a project in your account. Updating it means opening the platform, finding the flow, opening the failing step, and retyping the expected text. None of that happens inside the pull request, so whoever reviews the component change has no visibility into whether the test was touched, unless someone mentions it in a comment or pastes a screenshot of a passing run.

If it is a `checkout_test.md` file committed next to the component, updating it means changing one line in the same editor window the engineer already has open, as part of the same commit, inside the same pull request. The reviewer sees both changes in one diff: the copy changed here, and three lines later, the test that checks for it changed too. That is the subject of this article: not whether an AI agent beats a recorded, self-healing flow (a real debate, covered elsewhere on this site), but what happens to a test's storage, diffability, and portability once you choose a platform over a plain-text file in your own repository.

## Where the test itself actually lives

Testim's flows are an artifact inside the vendor's own database, scoped to a project in your account. There is no local file on your machine that "is" the test; to see what a step checks, you open the web app and navigate to it, the same way you would look up a record in any hosted SaaS product. That is a reasonable design for a visual recorder and low-code editor, genuinely convenient for anyone who does not want a code editor just to build a test.

A BrowserBash `testmd` file is the opposite by construction: it is a text file that sits inside your repository, typically under `.browserbash/tests/`, tracked by git exactly like a source file.

```markdown
# Checkout confirmation

- Open {{base_url}}/cart
- Add one item to the cart and proceed to checkout
- Fill in the shipping details as {{first_name}} {{last_name}}, zip {{zip}}
- Complete the order
- Verify the confirmation page shows 'Your order is on its way!'
```

Run it directly:

```bash
browserbash testmd run ./.browserbash/tests/checkout_test.md --agent --headless --timeout 120
```

There is no separate system holding this file: it shows up in `git status` the moment you save it, travels with `git clone`, and opens in whatever editor you already have open for the component you are changing. The test is not "connected to" your repository through an integration; it is part of the repository.

## What "diff" actually means in each world

A pull request lives and dies by its diff, and the two storage models produce a genuinely different diff experience for the exact same one-sentence change.

```bash
git diff HEAD~1 -- .browserbash/tests/checkout_test.md
```

```diff
- Verify the confirmation page shows 'Thank you for your order!'
+ Verify the confirmation page shows 'Your order is on its way!'
```

That is the whole change, rendered by the same diff engine your code host already uses, in the same pull request, reviewable by the same person reviewing the component change. There is no second tool to open, no second login to remember.

A Testim flow has no equivalent single command, because there is no local file to point a diff tool at. Seeing what changed in a step's validation means relying on whatever change-history view the platform's editor exposes at the time (mechanics are vendor-defined and change release to release), and that view lives inside the vendor's UI, not the pull request your teammate is already looking at. The information is not unavailable, it just sits one context-switch away, in a system your reviewer may not have open or have access to.

## Code review: one system of record, or two

This is where the storage question stops being academic. A pull request is supposed to show a reviewer everything relevant to a change before approving it. When the test lives in the same repo as a plain-English file, the reviewer gets that for free: the copy change and the test change arrive in the same diff, and approving the PR means approving both at once.

When the test lives in a separate, hosted platform, you end up with two systems of record for one release: your code host tracks the component change, the vendor's platform tracks the test change, each on its own timeline and access list. Keeping the two in sync becomes a manual process, a Slack convention, a linked ticket, a screenshot in the PR description, none of it enforced by either tool. It depends on people remembering.

Branch scoping compounds this. A `testmd` file changed on a feature branch only affects that branch until merged, same as a code change; a colleague running the suite on `main` never sees your in-progress wording. A flow in a shared hosted project is, by default, one shared mutable resource unless the platform's own branching structure isolates work in progress deliberately, and how well that works is a question for current vendor documentation, not something to take on faith.

## What travels with the repo, and what deliberately does not

Cloning a repository is the honest test of portability. `git clone` gets every `testmd` file back to the day it was first committed, readable offline, with no account or seat required. `git blame` answers "who wrote this assertion, and why" with the same authority it answers that question for application code:

```bash
git blame .browserbash/tests/checkout_test.md
git log --follow -- .browserbash/tests/checkout_test.md
```

A flow stored in a proprietary hosted format is not something `git clone` reaches. Leaving a platform means re-authoring the checks you care about somewhere else, not checking out a folder, a widely reported friction point across hosted, low-code test platforms generally, not unique to Testim. The platform's format is the price of its authoring speed.

BrowserBash draws its own line here too. The test file is meant to be committed: it is the plain-English intent that travels with the repo. The replay cache that lets a rerun skip the model entirely lives in `.browserbash/cache/`, gitignored by convention, because a recorded action journal reflects one run against one environment, and committing one person's cached clicks into a shared repo risks a stale recording quietly "passing" a page that has genuinely changed for everyone else. The intent is portable by default; a specific recording of it succeeding is not, unless a team shares the same signing key (`BROWSERBASH_CACHE_KEY`) across CI runners on purpose to warm a shared cache. Builtin-engine journals are HMAC-signed against a local `cache.key`, so an edited journal is ignored and re-recorded rather than trusted, the same instinct applied to caches instead of tests.

The same discipline applies to secrets: a `{{password}}` in a committed test file stays literally the text `{{password}}` on disk, whether checked into git or read from a teammate's clone a year later. The real value comes from a separate `--variables` payload or a CI secret store at run time, masked as `*****` in any log or NDJSON event. Committing a test is safe precisely because it never contains the thing that would make committing it dangerous.

## Where hosted, cloud-stored tests genuinely win

None of this makes a hosted platform the wrong choice for every team, and it would be dishonest to pretend otherwise.

A visual editor lets someone who does not write code, and never will, build and adjust a test without touching git or a terminal, a real advantage where manual QA staff maintain flows day to day; a markdown file assumes a comfort with git not every valuable tester has. A hosted platform is also a single, centralized place for run history, screenshots, and dashboards without anyone needing repository access, which matters where "who can see application source" and "who can see test results" are deliberately different people. Managed grid execution and vendor support arrive bundled too; a git-first team assembles some of that infrastructure itself, or leans on a lighter equivalent.

## The honest limits on the git-committed side

The reverse is just as true. A `.md` test file has no visual editor. Changing it means opening a code editor and knowing enough git to commit, push, and open a pull request, a real barrier for a team without engineers comfortable in that workflow, and softening it with tooling is its own project.

Merge conflicts are possible, if rare for prose: two people rewriting the same sentence in one review window is narrower odds than two people editing the same generated JSON or XML block, but not zero, and git surfaces the conflict explicitly at merge time rather than silently. How a hosted platform handles two people touching the same flow at once is worth checking against current vendor documentation.

Committing a test file gets you exactly that: a committed test file, not a dashboard, a screenshot history, or a run timeline. BrowserBash's answer is a free local dashboard (`browserbash dashboard` on `localhost:4477`, nothing leaves your machine) or an opt-in cloud upload once you `connect` an account, but either is a lighter surface than a mature test-management product with years of reporting and team-collaboration features built around that job.

## A pragmatic way to split the two

You do not have to pick one storage model for an entire organization on day one. A team already invested in Testim can keep the flows that genuinely benefit from a visual editor and non-engineer maintenance where they are, and route a different category of check toward a committed `testmd` file: anything a reviewer should sanity-check in the same diff as the change that motivated it, anything a new engineer should read on day one without a seat license, and anything that needs to survive a vendor contract lapsing without becoming unreadable.

That second category is most of what a developer actually wants during feature work: a smoke check on the flow they just touched, run from a terminal they already have open, reviewed by the same person reviewing the code. See the full command surface on the [features page](https://browserbash.com/features), and install it directly to try the pattern on your own repository:

```bash
npm install -g browserbash-cli
browserbash run "Open https://example.com and verify the page title contains 'Example Domain'"
```

That command is free to run, and the exit code is the verdict: `0` passed, `1` failed, `2` error, `3` timeout, the same contract whether you invoke it locally or from a CI job. Committing the same steps as a `.md` file next to your application code is the difference between a test that lives in your history and one that lives in someone else's.

Back to that Thursday-afternoon pull request: the honest answer is not that one storage model beats the other categorically. It is that the model you pick decides, in advance, whether your reviewer sees the whole change or half of it, whether a new hire can read your test suite before getting an account anywhere, and whether your tests survive you leaving the vendor that currently holds them. Pick based on which of those properties your team actually needs, not on which one demoed better. More patterns for writing these files are on the [BrowserBash blog](https://browserbash.com), and the CLI costs nothing to try.

## FAQ

### Can I diff a BrowserBash test the same way I diff application code?

Yes. A `testmd` file is a plain-text markdown file tracked by git like any other file in your repository, so `git diff`, `git blame`, and `git log --follow` all work on it directly, and the change shows up in the same pull request as whatever code change motivated it.

### Does Testim store tests as files I can check into my own git repository?

No, not natively. A Testim flow is an artifact inside the vendor's hosted platform, tied to a project in your account, with no local file on disk for git to track. Auditing a change happens inside the platform's own interface, on its own history model, separate from your code host.

### What happens to my tests if I stop paying for a hosted platform, or stop using BrowserBash?

If your tests live in a hosted, proprietary format, losing account access generally means losing convenient access to the tests too, and moving elsewhere means re-authoring them rather than exporting a folder. A `testmd` file has no such dependency: it is text in a git repository you already own, readable and runnable with the free CLI for as long as you keep the file, no account required.

### Do non-engineers lose the ability to edit tests if they are committed as plain-English markdown?

Largely, yes, compared to a visual recorder. Editing a `.md` file assumes comfort with a code editor and basic git operations such as commit, push, and pull request, a real barrier for QA staff who do not work that way day to day. A hosted platform's visual editor better fits a team built around non-engineers authoring tests directly.

### Is the replay cache portable along with the test file when I commit it?

No, and that is intentional. `.browserbash/cache/` holds recorded action journals and is gitignored by convention, separate from the committed test, because a recording reflects one run against one environment and can go stale in a way a shared repository should not blindly trust. Teams that want a shared warm cache across CI runners distribute the same `BROWSERBASH_CACHE_KEY` to every machine on purpose, rather than committing the cache folder.

### Does committing tests to git replace the need for any dashboard or run history?

Not on its own. A committed `.md` file gives you the test's intent and its history, but screenshots, run timelines, and pass/fail trends still need a viewer. BrowserBash's own answer is a free local dashboard (`browserbash dashboard`) for anyone who wants that without an account, plus an optional cloud upload per run, but neither is a substitute for a mature, purpose-built test-management product if that is what your organization actually needs.
