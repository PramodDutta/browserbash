---
title: "Debugging a Failed Run: Reading the Playwright Trace"
description: "To debug an AI browser test, read the Playwright trace from BrowserBash plus the video and Result.md. A practical artifact-by-artifact debugging walkthrough."
date: 2026-06-26
category: guide
---

When a BrowserBash run fails, you do not have to guess what happened. Every run leaves artifacts that show you exactly where the agent went and where it stopped. On the builtin engine you get a native Playwright trace you can open in the Playwright trace viewer, with a full action timeline, before and after DOM snapshots, console output, and network activity. On any engine, adding `--record` captures a webm video plus screenshots. And every run, on every engine, writes a human-readable `Result.md` that summarizes in plain English what the agent did and where it stopped. To debug an AI browser test, you read those artifacts in order, from the cheapest summary to the deepest trace, until the failure mode is obvious.

This guide walks you through that order. It is written for SDETs who already have a red run in front of them and want to know why, not for someone deciding whether to adopt the tool. We will start with `Result.md`, move to the recorded video, then open the Playwright trace and work through the timeline, snapshots, console, and network tabs. After that we will name the failure modes you will actually hit and how to fix each one, hand you a checklist, and be honest about what these artifacts cannot tell you.

[BrowserBash](https://browserbash.com/features) is a free, open-source, Apache-2.0 natural-language browser-automation and testing CLI from The Testing Academy. You install it with `npm install -g browserbash-cli` and drive it with plain-English objectives. A typical run that produces all the artifacts in this article looks like this:

```bash
browserbash run "log in as the demo user and confirm the dashboard shows a balance" --record
```

## Start with Result.md, not the trace

The instinct after a failed run is to open the heaviest tool first. Resist it. The Playwright trace is the most detailed artifact, but detail is not the same as a fast answer, and most failures are explained by the one-page summary the run already wrote for you.

Every run writes a `Result.md` into its output directory. It is a plain-English account of what the agent set out to do, the steps it actually took, and the state it was in when the run ended. Read it first because it tells you, in seconds, which of two very different problems you have: the agent did the wrong thing, or the agent did the right thing and the application did not respond as expected. Those two lead to completely different fixes, and `Result.md` usually separates them without you opening anything else.

When you read it, look for three things. First, the final status and where in the sequence it stopped, so you know whether the agent got most of the way through or fell over on the first step. Second, the last action the agent reported taking, which is your anchor for everything you look at afterward. Third, any assertion or expectation the agent was checking when it stopped, because a run that ends on a failed assertion is a different investigation from one that ends on a click that went nowhere.

If `Result.md` makes the cause obvious, for example the objective was ambiguous and the agent clearly targeted the wrong thing, you may be done. Sharpen the objective and rerun. If it narrows the problem but does not close it, you now know exactly what to look for in the video and the trace, which makes both of those far faster to read.

## Watch the --record video to see it happen

The video is the second stop because it answers "what did the user-visible page actually look like" faster than any other artifact. `--record` captures a webm video of the whole run along with screenshots, and this works on both engines, so it is the one visual artifact you can always count on.

Play it back with the timeline from `Result.md` in mind. You are watching for the moment the run diverged from what you expected. A few patterns are recognizable on sight: a cookie banner or modal that covered the control the agent needed, a page that was still rendering a spinner when the agent acted, a redirect to a login or error page that should not have appeared, or a layout that shifted under the agent. The screenshots `--record` saves alongside the video give you still frames at key moments, which is handy when you want to point at one exact state in a bug report without scrubbing.

The video tells you what happened with high confidence. What it often does not tell you is why. You can see the agent click the wrong button, but the video will not tell you which element it resolved or what the DOM looked like at that instant. For that, on the builtin engine, you open the trace.

## Open the Playwright trace for deep inspection

The builtin engine runs an Anthropic tool-use loop and captures a native Playwright trace. That trace is a real Playwright artifact, so you open it in the standard Playwright trace viewer:

```bash
npx playwright show-trace path/to/trace.zip
```

The viewer is where surface-level "it clicked the wrong thing" becomes a root cause you can fix. It has four areas worth your attention, and you generally read them in this order.

### The action timeline

The timeline across the top is the spine of the trace. Each action the agent took is a segment, and the failing run almost always has a visible inflection point: a long stall, an action that ends in red, or a place where the sequence stops earlier than the objective required. Click the last meaningful action before the failure. That single selection drives the snapshot, console, and network panels to that exact moment, which is what makes the trace viewer so much more precise than scrubbing a video. Hover across actions to see how long each took. A step that took most of the run's wall-clock time is a strong hint that the agent was waiting on something that never arrived.

### Before and after DOM snapshots

For each action the viewer holds two DOM snapshots, the page state immediately before the action and immediately after. This is the single most useful feature for AI browser debugging, because it lets you see the page exactly as the agent saw it when it decided what to do.

Use the "before" snapshot to answer the question the video cannot: was the element the agent needed actually present and unambiguous at that moment? Hover the targeted element in the snapshot to confirm it is the one you intended. If two buttons share the same accessible name, or the real target had not rendered yet, you will see it here. Then compare the "after" snapshot to confirm whether the action changed the page the way you expected. A click whose before and after snapshots are identical did not do what the agent thought it did, and that is your bug.

### Console and network

The console tab collects everything the page logged during the run. A client-side exception thrown right before the agent stalled is often the whole story: the app errored, the control never became interactive, and the agent could not proceed. The network tab is the companion to it. Select the action where things went wrong and look at the requests in that window. A failed XHR, a 500 on the form submit, a redirect to an unexpected URL, or a request that simply never returned will explain a "navigation that did not happen" far more reliably than staring at the page. When the objective involved data appearing on screen, the network tab tells you whether the data ever arrived.

## Diagnose the common failure modes

Across the artifacts above, BrowserBash failures cluster into a handful of recognizable shapes. Knowing the shape tells you both where it shows up and how to fix it.

**Wrong element targeted (ambiguous intent).** The agent acted on a plausible but incorrect element because your objective allowed more than one reading. You see it in the trace's before-snapshot: the targeted element is not the one you meant, often one of several matching the same description. Fix it by sharpening the objective so only one element can satisfy it. "Click Submit" becomes "click the Submit button in the payment form."

**Element not ready (timing).** The agent acted before the page finished settling. This is the rarest of the list because Playwright's auto-waiting already holds for actionability for up to 15 seconds before acting, so most timing races never surface. When it does survive that, the video shows a spinner or a half-rendered page at the moment of action, and the before-snapshot confirms the control was absent or not yet interactive. The fix is usually to give the agent an explicit thing to wait on, by phrasing the objective so it must confirm a settled state before proceeding, for example "wait for the dashboard heading to appear, then read the balance."

**An assertion that did not hold.** The agent reached the right place but the condition it was checking was false. `Result.md` names the assertion and its outcome, and that is usually enough. This is frequently a real finding rather than a test defect: the page genuinely did not show what you expected. Confirm against the after-snapshot and the network tab before you blame the test.

**A navigation that did not happen.** The agent clicked something that should have moved the page and it did not. The network tab is decisive here. Either the request failed, or it returned but the app handled it as an error, or no request fired at all because the click landed on the wrong element. The video shows the page sitting still while the agent expected motion.

**A model misread.** The agent misinterpreted the page or the objective and made a decision a human would not. The before-snapshot shows a page where the right action was available and the agent chose otherwise. This is where a more capable model earns its keep, and it is also a prompt that the objective may be leaving too much to interpretation.

## Fix it: sharpen, assert, or upgrade

Three levers cover almost every fix.

Sharpen the objective. Most wrong-element and misread failures come from objectives that admit more than one interpretation. Add the qualifiers that pin the agent to exactly one target and one success condition. Name the form, the region, the label, the expected end state. The before-snapshots from your failed run tell you precisely which ambiguity to remove.

Add an explicit assertion. If the run "passed" while doing the wrong thing, or you want a navigation or a piece of data to be a hard requirement, state it in the objective. Make the agent confirm the dashboard shows a balance, confirm the URL changed, confirm the confirmation message appears. An explicit assertion converts a silent wrong-path into a clean, debuggable failure with a named cause in `Result.md`.

Move to a more capable model. When the page is genuinely hard, dense, dynamic, or visually ambiguous, and the before-snapshots show the agent repeatedly misreading a state a human would get right, a stronger model is the correct fix, not more prompt gymnastics. Reserve this for the cases the first two levers do not solve, since it is the most expensive lever to pull.

## A practical debugging checklist

Work this top to bottom and stop as soon as the cause is clear.

- [ ] Read `Result.md`. Note the final status, where it stopped, the last action, and any assertion it was checking.
- [ ] Decide which problem you have: wrong action by the agent, or correct action and wrong app response.
- [ ] Watch the `--record` video with that timeline in mind. Look for modals, spinners, redirects, and layout shifts at the failure point.
- [ ] Skim the saved screenshots for a clean still of the failing state.
- [ ] On the builtin engine, open the trace with `npx playwright show-trace`.
- [ ] Click the last meaningful action before the failure on the timeline.
- [ ] Read the "before" snapshot: was the target present and unambiguous?
- [ ] Compare the "after" snapshot: did the action actually change the page?
- [ ] Check the console for an exception thrown right before the stall.
- [ ] Check the network tab for failed, missing, or unexpected requests at that step.
- [ ] Match the symptom to a failure mode, then apply the right lever: sharpen, assert, or upgrade.
- [ ] Rerun and confirm the artifacts now show the path you intended.

## Which engine gives you what

BrowserBash ships two engines, and they leave different evidence, so pick based on how deep you expect to dig.

The builtin engine runs an Anthropic tool-use loop and captures a native Playwright trace. Choose it when you need deep inspection: the action timeline, before and after DOM snapshots, console, and network are exactly the tools for diagnosing wrong-element, navigation, and misread failures down to the DOM. This is the engine to reach for when a video is not enough.

The stagehand engine is the default. For debugging it gives you the `--record` webm video plus screenshots and the run log, which together tell you what happened and the sequence of steps the agent reported. It does not produce a Playwright trace. When you need that level of inspection, run the same objective on the builtin engine and open the trace there. For a fuller side-by-side, see the [stagehand vs builtin engine guide](https://browserbash.com/blog/browserbash-stagehand-vs-builtin-engine-tutorial), and for everything `--record` captures, the [recording video and traces tutorial](https://browserbash.com/blog/browserbash-recording-video-and-traces-tutorial).

A quick word on exit codes, because they drive your CI logic before you ever open an artifact. BrowserBash uses 0, 1, 2, and 3, so your pipeline can branch on the kind of outcome and surface the right artifacts automatically. Wire your CI to publish `Result.md`, the trace, the video, and screenshots on a non-zero exit, and your future self gets the full evidence bundle attached to the failed job instead of an unreproducible red check.

## Honest limits

These artifacts are powerful, but they are not magic, and pretending otherwise wastes your time.

The stagehand engine does not produce a Playwright trace. If you have only run on stagehand, the action timeline and DOM snapshots simply are not available, and no amount of digging in the output directory will surface them. When you need that depth, rerun the objective on the builtin engine. Plan for this: if a flow is one you expect to debug often, run it on the builtin engine so the trace is always there when you need it.

A video tells you what happened, not always why. You can watch the agent click the wrong button or stall on a spinner, but the webm alone will not tell you which element resolved, what the DOM held at that instant, or what the network was doing. That is precisely the gap the Playwright trace fills, which is why the workflow pairs them rather than relying on either alone. When you only have the video, lean harder on `Result.md` and on your own objective: read what the agent said it was trying to do, compare it to what you asked, and the mismatch is often the answer even without a trace.

And the artifacts describe the run, they do not judge it. A green run that did the wrong thing looks fine in every artifact until you add the assertion that would have caught it. The trace will faithfully show you a confident, wrong path. Determinism and correctness are your responsibility to encode in the objective; the tooling's job is to make whatever happened fully visible, which it does. If you want to go deeper on why a passing-but-wrong run is its own category of bug, the [flaky test root cause analysis guide](https://browserbash.com/blog/flaky-test-root-cause-analysis) and the piece on [agentic test determinism](https://browserbash.com/blog/ai-agent-test-determinism-benchmarks) both pick up that thread.

## FAQ

### Which BrowserBash engine produces the Playwright trace?

The builtin engine. It runs an Anthropic tool-use loop and captures a native Playwright trace you can open with `npx playwright show-trace`. The stagehand engine, which is the default, does not produce a trace. It gives you a `--record` webm video, screenshots, the run log, and `Result.md`. If you need the trace's action timeline and DOM snapshots, run your objective on the builtin engine.

### Where do I find Result.md and the recorded video?

Both land in the run's output directory. `Result.md` is written for every run on every engine, so it is always there. The webm video and screenshots are written only when you pass `--record`, which works on both engines. In CI, publish all of them as artifacts on a non-zero exit code so a failed job carries its own evidence bundle.

### My run passed but did the wrong thing. How do I debug that?

That is a missing-assertion problem, not a trace-reading problem, and no artifact will flag it until you encode the requirement. Add an explicit assertion to the objective, for example confirm the dashboard shows a balance or confirm the URL changed, so the wrong path becomes a clean failure with a named cause in `Result.md`. Then debug it like any other red run, starting from the summary.

### The agent keeps clicking the wrong element. What is the fix?

Open the builtin-engine trace and read the "before" snapshot at that action. If two elements match the same description, or the real target had not rendered, you have ambiguous intent. Sharpen the objective so exactly one element can satisfy it: name the form, the region, or the surrounding label. Reserve switching to a more capable model for genuinely hard pages where the snapshot shows the agent misreading a state a human would get right.

Ready to put this into practice? Install with `npm install -g browserbash-cli`, run any objective with `--record` to capture the full artifact set, and browse the rest of the guides in [/learn](https://browserbash.com/learn).
