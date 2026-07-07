---
title: Rainforest On-Demand Runs vs Inline CI Testing
description: "Rainforest triggers runs on its platform; plain-English tests run inline in your pipeline with exit codes per PR. Compare feedback loops and cost."
date: 2026-07-05
category: comparison
---

A B2B project-management app ships a small permissions refactor on a Wednesday morning: the "invite teammate" modal gets a redesigned role dropdown, and new invites are supposed to default to Viewer unless the inviter explicitly picks Editor. The pull request is nine files, two approvals, a green CI badge for unit tests, lint, and a type check, and it merges at 11:14 a.m. Nobody on that review can say whether the invite flow itself still works, because the functional regression check for team management doesn't live in that pipeline. It lives in Rainforest, queued as an on-demand run whenever the QA lead gets to her afternoon pass, usually around 5 or 6 p.m.

That evening's run comes back red: new invites are landing as Editor by default, a permission escalation, not the intended Viewer. By the time anyone notices, two more pull requests have merged on top of the offending one, both touching the same settings page, so someone has to work backward through three commits to find which one flipped the default, while the bad build has sat in production, quietly over-provisioning new teammates, since a little after 11 a.m.

Nothing about that story is exotic. It's what happens whenever the system that decides "is this safe to ship" and the system that decides "does this pull request merge" are two different systems, connected by nothing more than a person opening a dashboard. That gap, not raw tool capability, separates a platform you trigger runs against from a check that lives inside your pipeline and hands back an exit code. Rainforest QA and a CI-native CLI like BrowserBash can test the exact same invite flow. Where they differ is when you find out, and what "found out" is attached to.

## Two shapes of feedback loop

There are only two shapes this can take, and it's worth naming them before comparing tools.

A **platform-triggered** loop runs the check somewhere other than your pipeline, on its own timing, decoupled from any single commit: a button, a schedule, or an API call starts it, it runs at the platform's pace, and it reports to its own dashboard. Turning that report into a merge gate is a second integration you build on top.

An **inline** loop makes the check itself a pipeline step. It runs against the exact commit under review, and its own exit status is the merge gate. There's no second system to consult, because there's no second system.

Rainforest QA is built around the first shape. BrowserBash is built around the second. Neither is automatically the better engineering choice, but they produce very different failure timelines when a regression actually ships, which is the story above.

## What an on-demand run on Rainforest actually closes the loop with

Rainforest's exact API surface, current pricing, and the present mix of crowd execution versus its AI-assisted no-code builder aren't fully public and have shifted across the product's life, so this sticks to the shape that's stable enough to reason about: Rainforest is a hosted, vendor-cloud platform where you author test cases in its system, and execution, human, AI-assisted, or a blend, happens against Rainforest's own queue rather than inside your build.

"On-demand" describes how you kick that off outside the regular schedule: instead of waiting for the nightly or weekly pass, someone tells the platform to run a specific suite right now, a genuine improvement over "wait until Tuesday." But it's still a trigger into a separate system. The run executes at whatever pace the crowd or the AI-assisted builder completes it, and the result lands in Rainforest's dashboard first, not as a status check on your pull request.

If you want that on-demand run to gate a merge rather than just inform someone later, you build the bridge yourself: call Rainforest's API or a webhook to start the run, hold the pipeline open, poll a status endpoint until it reaches a terminal state, then translate whatever state model Rainforest exposes, queued, running, reviewed, complete, into the boolean your branch protection rule understands. That's a real integration you own and maintain on both ends, for as long as you depend on it.

## What "inline" means for BrowserBash

[BrowserBash](https://browserbash.com/features) skips the bridge because there's nothing to bridge. Install it with `npm install -g browserbash-cli`, write the check as a plain-English objective, and an AI agent drives a real Chrome or Chromium browser step by step to satisfy it, no selectors, no page objects, no separate platform. The process that runs the check is the same process whose exit code your CI already reads.

```bash
browserbash run "Go to the app, invite teammate qa+invite@example.com without explicitly selecting a role, and confirm the pending invite row shows the role as Viewer" \
  --agent --headless --timeout 120
echo "exit code: $?"   # 0 passed, 1 failed, 2 error, 3 timeout
```

Run that on a laptop and it behaves identically on a GitHub Actions runner: navigate, act, decide, exit. `0` means the invite really did default to Viewer. `1` means it didn't, which is exactly the regression from the opening scenario, caught on the pull request that introduced it instead of on that evening's on-demand pass. There's no dashboard to open for the common case and no run ID to chase down. The pipeline log already contains the whole story.

## A gate attached to the exact commit that could break it

The more durable version of that check isn't a one-off objective typed on the command line, it's a committed test file that lives next to the code it protects.

```markdown
---
version: 2
auth: admin
---

# Team invites default to Viewer

- Open the team settings page and click "Invite teammate"
- Enter {{invite_email}} and submit without selecting a role
- Verify the pending invite row shows role "Viewer"
- Verify the invite row does not show role "Editor"
```

`auth: admin` replays a session saved once with `browserbash auth save admin --url https://app.example.com/login`, so the check doesn't burn a step re-authenticating on every run. The two `Verify` lines aren't the agent's opinion: testmd compiles a `Verify` line into a real, deterministic check against the page, so a role string that's off by one word fails the same way every time.

```bash
browserbash testmd run .browserbash/tests/invite_default_role_test.md \
  --variables-file .browserbash/variables/invite.json \
  --agent --headless
```

Wired into a pull request as a required status check, that's the whole gate:

```yaml
name: browser regression
on: [pull_request]
jobs:
  browserbash:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-chrome@v1
      - uses: PramodDutta/browserbash@main
        with:
          tests: .browserbash/tests/invite_default_role_test.md
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

That workflow runs against the exact diff that touched the invite modal. A red check here isn't "something regressed this week," it's "this pull request regressed it," attached to the one diff a reviewer already has open.

## The bridge is itself a place to fail

"Just poll the platform's API" is a bigger commitment than it sounds like, and it's the part teams tend to underestimate. A pipeline that greps prose logs for a pass or fail marker is famously fragile: one log-format change and a real failure slips through as a false green, which is exactly why exit codes exist in the first place. A trigger-and-poll bridge into a platform like Rainforest is the same failure mode moved up a layer. Instead of parsing prose, you're parsing a vendor's status enum through a polling script you wrote, and every assumption in it is somewhere a false result can hide: does it handle a run stuck in a "reviewing" state past your poll timeout, and does a webhook that fires twice ever post two conflicting statuses to the same commit? None of that is hypothetical, it's the ordinary shape of wiring two systems together over a network, and the maintenance burden sits on your side even though the platform did the actual testing.

An inline check doesn't remove all risk. An agent can still misjudge a page, and a selector-free approach still depends on the model reading the screen correctly. But it removes this entire category of failure. There's one process, one exit code, and the thing that decides pass or fail is the same thing your CI already trusts for every other job in the pipeline.

## Frequency: the loop is only as tight as the cost of running it again

Feedback-loop tightness and marginal cost are the same variable wearing two names. A check that costs real money or ties up a human tester every time it runs will, rationally, get scheduled: nightly, a few times a day, on-demand when someone remembers, because running it on every commit would be expensive at scale. A check with near-zero marginal cost has no reason not to run on every push.

BrowserBash defaults to local Ollama models, so the marginal model cost of running the invite check above on every pull request is a genuine $0. Layer in the replay cache: once a flow like this has run and passed, later runs replay the recorded actions directly and only fall back to full model reasoning once the underlying page changes. A stable check settles into cheap and fast within its first few green runs, which is what makes "gate every merge" a realistic default rather than an aspiration nobody can afford to enforce.

None of this means the scheduled shape disappears. If what you actually want is a synthetic check of your live production environment rather than a merge gate, BrowserBash covers that pattern too:

```bash
browserbash monitor .browserbash/tests/invite_default_role_test.md \
  --every 10m --notify https://hooks.slack.com/services/your/webhook/url
```

That's structurally the same idea as an on-demand or scheduled Rainforest run: check on an interval, alert on a state change. It's an additional mode of the same tool, not the only one, so you pick per check whether it gates a pull request or watches production.

## What you don't get by going inline

Fairness matters here. An inline, agent-driven check has real limits, and pretending otherwise would undercut everything above.

There's no human in the loop. Rainforest's crowd, when a team leans on it, catches things an objective-driven agent won't: a layout that's technically clickable but looks broken, a confusing flow, a genuinely novel interface a script has never seen. An agent checking whether an invite defaults to Viewer has no opinion on whether the modal is well designed. It only knows whether the objective held.

There's also a model-sizing reality worth stating plainly. Small local models, roughly 8B parameters and under, can lose the thread on long, branchy objectives. A short check like the invite-role test above sits comfortably within reach of most local models; a fifteen-step approval workflow with conditional branches deserves a mid-size local model (Qwen3 or Llama 3.3 70B class) or a capable hosted model instead. Size the model to the flow, not the other way around.

## The feedback loop, compared directly

| Axis | Rainforest on-demand run | BrowserBash inline CI |
|---|---|---|
| Where the check executes | Rainforest's platform (crowd, AI builder, or both) | Your CI runner or machine, as one pipeline step |
| What starts it | A dashboard trigger, a schedule, or an API call | A `git push` / pull request event |
| Where the result lands first | Rainforest's dashboard | The same job log as your other CI steps |
| Turning it into a merge gate | A bridge you build: trigger, poll, translate status | Nothing extra, the exit code is the status |
| What a red result is attached to | Whatever's currently live, not necessarily one PR | The exact commit / pull request that triggered it |
| Marginal cost of running more often | Scales with crowd time or plan usage | Near $0 on local models, cheaper again once cached |
| Scheduled or synthetic monitoring | Native mode | Available via `browserbash monitor`, opt-in |
| Human judgment available | Yes, via the crowd | No, model-driven only |

## When the platform-triggered shape is the right call

Choose Rainforest's model when you need a human somewhere in the loop: exploratory checks, subjective UX calls, flows that resist scripting, or QA fully decoupled from engineering so a non-technical team can own it end to end. A scheduled or on-demand cadence also suits broad regression sweeps that don't need to block any single merge.

Choose the inline shape when the check needs to be a required status on the pull request that could break it, not a report reviewed hours later; when the people writing the check are the ones reviewing the diff; or when an AI coding agent needs to validate its own change before opening a pull request, a loop a dashboard checked that evening can't close.

## A workable middle path

You don't have to pick one system for everything. Keep Rainforest, or its crowd, for the exploratory and judgment-heavy testing it's genuinely good at, and move the handful of flows that should block a merge outright, login, invites, billing, checkout, into committed BrowserBash tests wired to the same pull request event that already triggers your CI. Start with the one flow that would have caught a regression like the invite-role bug above, wire it in with the GitHub Action, and let it run for a sprint before deciding whether the next flow moves inline too. Compare the rest of what's available on the [BrowserBash pricing page](https://browserbash.com/pricing); the CLI itself carries no charge either way.

## FAQ

### Can Rainforest QA gate a pull request the same way an inline CI check does?

It can be wired to try, through its API or webhook integrations, triggering a run and polling for a result. What you're integrating with is different, though: a vendor's status model and timing, translated by a script you write and maintain, rather than a process exit code your CI already understands. Both can end in a red or green check; only one requires you to build and keep patching the translation layer.

### Why does it matter which commit a failing run is attached to?

Because that's what turns a red result into an action. A scheduled or on-demand run reports against whatever's currently live, so a failure means "a regression exists somewhere recent" and someone has to bisect to find it. An inline check runs against the exact pull request, so the failing check and the diff that caused it are the same artifact, already open in the same review.

### Does moving to inline CI mean giving up human judgment on QA entirely?

Not if you don't want it to. The realistic pattern is hybrid: keep a crowd or a manual QA pass for exploratory and subjective checks that benefit from a person's taste, and use an inline, agent-driven check for the flows that need to block a merge on every push. Nothing stops both from running against the same application.

### Do I need an API key to run BrowserBash checks inline?

No. BrowserBash is Ollama-first: it resolves a local model first, then an `ANTHROPIC_API_KEY`, then an `OPENROUTER_API_KEY`. On local models the check above runs with no API key at all and a $0 model bill. Hosted keys are optional, useful mainly for longer or harder flows.

### Can I get a scheduled, platform-style run out of BrowserBash too?

Yes, via `browserbash monitor <test-or-objective> --every <interval> --notify <webhook>`, which checks on an interval and posts on a pass or fail state change, the same shape as an on-demand or scheduled Rainforest run. It's an additional mode alongside the inline one, so you choose per check which loop shape fits.

---

Ready to attach a real regression check to the next pull request instead of the next on-demand pass? Install it with `npm install -g browserbash-cli`, write the check as a plain-English objective, and wire it in with the official GitHub Action so the exit code becomes the gate, not a dashboard someone opens later.
