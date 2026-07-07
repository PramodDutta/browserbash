---
title: Cypress Cloud vs Local-First AI Browser Testing
description: "Cypress Cloud stores runs and parallelization off-site; a local-first tool keeps history on your machine. Compare privacy, cost, and access."
date: 2026-07-05
category: comparison
---

Your team is renewing a security questionnaire and one line stalls the call: "list every third party that receives a copy of application data during testing, and how long they keep it." Someone opens the Cypress Cloud project to check, and the honest answer is longer than anyone expected. Every CI run for the past several months has quietly uploaded pass/fail results, stdout, screenshots on failure, and on the plans where Test Replay is turned on, a DOM-level recording of the whole session, into Cypress's own infrastructure. Nobody flipped that switch twice. It happened once, when a teammate wired a project ID and a record key into the pipeline months ago, and every run since has followed the same default.

That is not a bug. It is exactly what Cypress Cloud is built to do: continuous recording is what makes parallel orchestration, flaky-test detection, and historical trend dashboards possible in the first place. But it is also, for a lot of teams, the first time anyone actually looked at the data-residency question a testing tool answers on their behalf by default.

This article compares that default against a different one. [BrowserBash](https://browserbash.com) is a free, open-source, natural-language browser automation CLI that does roughly the same job (run browser checks, keep a record, look at results in a dashboard) with the opposite starting position on where that record ends up. If you're evaluating a Cypress Cloud alternative because of where your data lives rather than because of test syntax, this is the axis that matters, and it gets a lot less airtime than the usual "selectors vs plain English" framing.

## Two things with almost the same name

Cypress the test runner and Cypress Cloud the hosted dashboard are not the same product, and it's worth being precise about that before comparing anything. Plain `cypress run` executes specs in your terminal or CI with no account, no upload, and no third party involved. Nothing about writing or running a Cypress test requires Cypress Cloud at all.

Cypress Cloud is a separate, hosted service you opt into by adding a `projectId` to your config and a record key to CI, then running `cypress run --record --key $CYPRESS_RECORD_KEY`. From that point on, recording is a project-level switch, not a per-run decision. The moment that key is present in CI, every run uploads by default. That's the detail this whole comparison hinges on, so it's worth restating plainly: it isn't wrong or sloppy, it's the product working as designed. Parallelization across CI machines and month-over-month flaky-test trends both need every run's data, not a sample of it.

## What actually leaves your CI runner

Once Cypress Cloud is wired in, what ships off your runner is more than a pass/fail line. Typical captures include test results and timings, console/stdout output, screenshots on failure (often configurable to capture more), a video of the run, and on plans with Test Replay enabled, a DOM-level recording that lets a teammate scrub through the actual rendered application state after the fact rather than only watch pixels move in a video. That last one is a genuinely useful debugging feature: reproducing a flaky CI-only failure without re-running it locally is a real pain point Test Replay solves well.

It's also, structurally, a lot of surface area leaving the machine that ran the test. Whatever your staging environment renders on screen, real-looking seed data, an error message that echoes a customer record, a support ticket pasted in during manual QA, goes wherever the recording goes. None of that is a Cypress flaw specifically. Any tool that captures a screenshot, video, or DOM snapshot shows whatever the page actually put on screen. The question worth asking is simply: once that capture exists, where does it live, who can open it, and did anyone choose that on purpose for this run?

## The default that decides everything else

BrowserBash's answer to that question is architectural, not a settings toggle. Nothing about writing or running a test sends data anywhere:

```bash
browserbash run "Log in to https://app.example.com as qa@example.com with password hunter2 and verify the account dashboard shows the plan name" \
  --agent --headless --timeout 120

echo "exit code: $?"
```

That command drives a real Chrome, prints structured NDJSON on stdout for CI to consume, and exits `0`/`1`/`2`/`3` for passed/failed/error/timeout. It never touches a network endpoint of BrowserBash's own. The run, the transcript, and any extracted values live on disk at `~/.browserbash/runs` (secrets masked, capped at the 200 most recent runs) and nowhere else, whether you run it once or a thousand times in CI.

Getting a run anywhere else takes two separate, deliberate actions, not one project-level switch:

```bash
# 1. Link this machine to a cloud workspace. Uploads nothing by itself.
browserbash connect --key bb_your_key_here

# 2. Explicitly opt this ONE run into the cloud dashboard.
browserbash run "Complete checkout as a guest and verify the confirmation page shows an order number" \
  --record --upload
```

`connect` only stores a credential, comparable to registering a Cypress Cloud project ID. `--upload` is the part with no Cypress Cloud equivalent: it's a per-invocation flag, not a project-wide state. Run the exact same test again tomorrow without `--upload` and it stays fully local, even though the machine is still connected. There is no "recording is on for this project now" state to forget about eight months later. The opt-in is re-decided every single time, on purpose.

A committable `*_test.md` version of the same idea, so the objective and the residency decision live side by side in version control:

```markdown
# Checkout smoke

- Open {{base_url}}
- Log in as {{username}} with password {{password}}
- Add the first result to the cart and check out
- Verify the confirmation page shows an order number
```

```bash
browserbash testmd run checkout_test.md \
  --variables '{"base_url":"https://staging.shop.example","username":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

No `--upload` on that line means no upload happened, full stop, regardless of whether this machine has ever connected an account.

## Where the dashboard itself lives

Cypress Cloud's dashboard is `cloud.cypress.io`. Getting anything on screen requires a Cypress account, an organization, and a registered project, even if all you want is to look at your own solo test history. There's no local mode for it; the word "Cloud" in the name is doing literal work.

`browserbash dashboard` starts a server on `localhost:4477` that reads directly from `~/.browserbash/runs` on disk. No account, no sign-up, no network call out. It works the first time you install the CLI, before you've created anything or heard of BrowserBash's cloud product at all. Only when you want a link you can drop in Slack for someone who isn't at your keyboard do you create a free account and reach for `connect` plus `--upload` on that specific run, and even then the retention window is a short, deliberate 15 days on the free tier: a sharing surface, not an archive.

## Retention and cost follow the data model, not the other way around

Cypress Cloud's paid tiers meter usage by monthly recorded test results, so the bill scales with two things that grow together on purpose: how large your suite is and how often CI fires it. Exact tier limits move over time, so check Cypress's current pricing page rather than trust a number repeated here. That metering exists because the product's real value, cross-machine spec balancing and months of flaky-trend history across an org, requires ingesting and keeping essentially everything.

Running BrowserBash locally costs nothing regardless of volume: the CLI, both engines, the replay cache (a green run records its actions once, and the next identical run replays them with zero model calls), and the local dashboard are all free, because nothing is being metered or stored on anyone's infrastructure for a run that never left your machine. The cloud dashboard is free today too, 15-day retention included; an option to keep history longer than that is flagged as coming later on the [pricing page](https://browserbash.com/pricing), but nothing about using the CLI itself is gated behind it.

## Where Cypress Cloud is genuinely ahead

Credit where it's due, because pretending otherwise would make this a worse comparison. Smart orchestration that balances specs across many parallel CI machines using historical timing, months of org-wide flaky-test trend data, and SSO or audit logging on higher tiers are mature, valuable features, and a local-first CLI doesn't try to fake them.

`run-all` gives memory-aware concurrency on a single machine plus JUnit output, and `--shard 2/4` splits a suite into a deterministic slice so several CI machines can each run their share without a coordinator. That solves a similarly shaped scheduling problem, but it isn't the same thing as a hosted service that has watched your suite's timing for six months and rebalances automatically. If your team is at the scale where that maturity earns its cost today, that's a legitimate reason to keep or choose Cypress Cloud. No local-first argument should talk you out of a decision that months of your own data would validate.

## Secrets are a rendering problem before they're a storage problem

One nuance worth stating plainly, because it cuts against both tools equally. BrowserBash masks values you pass as secret variables in logs, console output, and recordings, and re-templatizes them in the replay cache so a credential never sits in a journal file in plaintext. That's the automation layer's own instrumentation being careful.

But no masking layer can hide what an application itself renders on screen. If a staging environment prints a real-looking record in an error message, or a form momentarily shows a value in plain text, a screenshot, video, or DOM snapshot from any tool, Cypress Cloud's Test Replay included, will show it, because the browser genuinely displayed it. The tool didn't leak it; the page did. That's why the actual residency question isn't only "does this tool mask my passwords" (both handle that reasonably), it's "am I comfortable with whatever my app renders leaving this machine at all, as a standing default." Only a local-first default changes the answer to that second question.

## Side by side, on the residency axis specifically

| Dimension | Cypress Cloud | BrowserBash (local-first) |
|---|---|---|
| Default for a wired-in CI run | Uploads automatically once the record key is present | Stays on the runner; nothing sent anywhere |
| What's captured | Results, stdout, screenshots, video, DOM-level Test Replay on supported plans | Nothing off-machine unless `--upload` is passed |
| Opt-in granularity | Project-level switch (record key present or absent) | Per-invocation flag, re-decided on every run |
| Account to run tests at all | Not required for plain `cypress run` | Not required for `browserbash run` or `testmd run` |
| Account for any dashboard | Yes, always, it's a hosted product | No, `browserbash dashboard` is local and account-free |
| Retention | Built for longer historical trend analysis on paid tiers | 15 days free; a short sharing window, not an archive |
| Cost driver | Metered by monthly recorded test results | $0 for local use; cloud dashboard currently free too |
| Cross-run orchestration | Mature: spec balancing, flaky trends, SSO | `run-all` + `--shard` on your own CI, no hosted trend warehouse |

Read it as a map of tradeoffs, not a scoreboard. The two products are optimizing for different defaults, and the table above is really describing one decision (where does the data live) with several downstream consequences.

## Picking the one that fits

**Choose Cypress Cloud** when cross-machine orchestration, months of flaky-trend history, and org-wide access controls are worth paying for today, and your team is comfortable with recordings living on a vendor's infrastructure as the cost of that maturity. It's a strong, well-tested answer to "how do we scale a large CI suite and see trends over time."

**Choose a local-first tool** when the honest answer to "who else has a copy of this" needs to be "no one, by default," when your staging or pre-production environments carry data you'd rather not hand a third party as a standing policy, or when you just want a dashboard and a run history without creating an account to get one. `browserbash dashboard` gives you that on day one, and every run stays put unless you explicitly say otherwise.

**Run both**, and plenty of teams do. Keep Cypress, with or without Cloud, for the deterministic regression suite where parallel orchestration earns its keep, and add BrowserBash's plain-English objectives or `*_test.md` files for smoke checks, exploratory flows, or anything where the residency question matters more than trend analytics. They're solving overlapping but not identical problems. For the fuller side-by-side on syntax, flakiness, and CI signal beyond the data question, see the wider [Cypress vs BrowserBash comparison](https://browserbash.com/blog/browserbash-vs-cypress) and the full [feature list](https://browserbash.com/features).

## FAQ

### Is Cypress Cloud required to use Cypress?

No. Plain `cypress run` executes specs entirely in your terminal or CI with no account and nothing uploaded. Cypress Cloud is a separate, opt-in hosted service you add by wiring a project ID and a record key into CI for parallelization, recordings, and analytics dashboards.

### Does BrowserBash upload my test runs automatically the way Cypress Cloud does once it's set up?

No. Every `browserbash run` and `browserbash testmd run` stays on your machine by default, saved only to `~/.browserbash/runs`. Getting a run into the cloud requires two separate, explicit steps every time: a prior `browserbash connect --key bb_...` and the `--upload` flag on that specific invocation. There's no project-level switch that silently applies to every future run.

### Can I use BrowserBash's dashboard without creating an account?

Yes. `browserbash dashboard` starts a local server on `localhost:4477` that reads straight from your on-disk run history. It never calls out to the internet and needs no sign-up. An account is only needed if you want the cloud dashboard's shareable links.

### How long are recordings actually kept in each tool?

Cypress Cloud's paid tiers are built around longer historical retention because trend analytics needs history to compare against; check current tier limits on their pricing page since they shift. BrowserBash's free cloud dashboard keeps uploaded runs for 15 days, then deletes them; local runs in `~/.browserbash/runs` persist on your own disk up to the most recent 200, independent of any cloud retention window.

### Is BrowserBash a real alternative to Cypress Cloud for parallelization, not just for dashboards?

Partially. `run-all` gives memory-aware concurrency on your own machine, and `--shard i/n` splits a suite deterministically across several CI machines. That covers a real chunk of the scheduling problem, but Cypress Cloud's cross-run historical analytics and automatic spec-balancing based on months of timing data are more mature. Be honest with yourself about which one your team actually needs before picking based on price alone.

### Does local-first mean my team loses visibility into what a run actually did?

No, it just changes who has to ask for it. The local dashboard shows every step, the verdict, and any extracted values in full detail on your own machine. When someone outside your terminal needs to see a specific run, you connect an account and add `--upload` to that one invocation, on purpose, rather than having every run land somewhere by default.

Install it and see which default fits your situation: `npm install -g browserbash-cli` gets you running locally in one line, no account and no billing anywhere near it. When you do want a shareable run page, an account is free at [browserbash.com/sign-up](https://browserbash.com/sign-up), and the choice to use it stays yours on every single run.
