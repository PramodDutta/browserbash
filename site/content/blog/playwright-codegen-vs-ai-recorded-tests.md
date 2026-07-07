---
title: Playwright Codegen vs AI-Recorded Plain-English Tests
description: "Playwright codegen emits selector scripts; recording a flow once can yield a plain-English test plus a replay journal. When each approach wins."
date: 2026-07-05
category: comparison
---

Picture a normal Tuesday. You need a smoke test for a login-to-checkout flow on a staging build before end of day, and you don't want to hand-write forty lines of Playwright from a blank file. You know two shortcuts that both start the same way: click record, walk through the flow once, get a file out the other end. In one terminal you run `npx playwright codegen https://staging.example.com/login`. In another, `browserbash record https://staging.example.com/login`. Same flow both times: log in, add an item to the cart, go to the cart, check out. Five minutes later you have two files that could not look less alike. One is thirty-odd lines of TypeScript full of `.getByRole()` calls. The other is seven lines of plain English sitting in a Markdown file. Both technically "recorded" the same clicks. What you actually do with each of them six months from now is a different story, and that story, not which tool is smarter, is what this article is about.

## What Playwright codegen hands you

`npx playwright codegen <url>` opens two windows: a real browser and an Inspector panel that mirrors, line by line, the Playwright API calls your clicks and keystrokes are producing in real time. Pick a language with `--target` (TypeScript is the default; Python, Java, and .NET are one flag away), walk through the flow, close the recorder. What lands on disk is real, working test code, not a proprietary intermediate format you have to export first. Modern codegen also defaults to role- and text-based locators (`getByRole`, `getByLabel`) instead of raw CSS paths, which is a genuine improvement over older recorders and worth crediting on its own terms: those locators tolerate a fair amount of DOM reshuffling as long as the accessible name and role of the element don't change.

```ts
import { test, expect } from '@playwright/test';

test('checkout flow', async ({ page }) => {
  await page.goto('https://staging.example.com/login');
  await page.getByLabel('Email').fill('jane@example.com');
  await page.getByLabel('Password').fill('Sup3rSecret!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('link', { name: 'Cart' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
});
```

Two things about that file are worth sitting with before you commit it. First, it is yours now, in the fullest sense: it lives inside your Playwright project, imports `@playwright/test`, and runs under `npx playwright test` next to everything else your team already maintains by hand. Second, look at the password. Codegen has no concept of a secret field; it watches DOM events and writes down exactly what you typed, into whatever `.fill()` call that field produces. Whatever you type into a password box during a recording session is what ends up sitting in plaintext in a file you are about to `git add`. The usual mitigation, type a disposable test password while recording and scrub the file before committing, works, but it's a manual step you have to remember every single time, and it's easy to forget on the day you're in a hurry.

## What browserbash record hands you

`browserbash record <url>` skips the code-generation step entirely. It launches a real, visible Chrome window (it ships its own `playwright-core` dependency, so there's nothing extra to install beyond the CLI itself) and injects a small capture script that listens for clicks, field changes, and Enter presses. Instead of writing down a CSS path or a DOM index for whatever you interacted with, it describes the target the way a person reading the page would: an `aria-label` if one exists, the text of the associated `<label>` for a form field, a placeholder, or the element's own visible text. Typing three characters and then two more into the same field collapses into a single step carrying the final value, not five separate ones. You interact with the page for as long as you need, then hit Ctrl-C (or pass `--seconds` to auto-stop), and the captured event log turns into an ordered list of plain-English steps in a `*_test.md` file, ready for [BrowserBash](https://browserbash.com) to run.

```markdown
# Recorded flow (staging.example.com)

<!-- Recorded with `browserbash record`. Review the steps, then run: browserbash testmd run <this file> -->

- Open https://staging.example.com/login
- Type 'jane@example.com' into the 'Email' field
- Type {{password}} into the 'Password' field
- Click the 'Sign in' button
- Click the 'Add to cart' button
- Click the 'Cart' link
- Click the 'Checkout' button

<!--
Secret values were NOT captured. Define them before running:
  .browserbash/variables/default.json -> {"password":{"value":"change-me","secret":true}}
-->
```

Notice what isn't in that file: no selector, no DOM path, no password. Password fields are special-cased at the point of capture, inside the browser, before the event ever crosses back into the recorder process. The literal characters never enter the event log; only a `secret: true` marker does. The generated file references `{{password}}` and leaves a comment telling you exactly where to define the real value, in a variables file marked secret, so every later log line masks it as `*****` instead of printing it. Where the codegen file needed a human to remember to scrub a password by hand, this file structurally cannot contain one in the first place.

The CLI tells you what to do next in the same breath it finishes recording: `Recorded 7 steps -> .browserbash/tests/recorded_test.md`, followed by `Run it (records the replay journal too): browserbash testmd run .browserbash/tests/recorded_test.md`. That second line is the whole point of the next section.

## The real difference: what happens the first time you press run

A Playwright spec generated by codegen behaves identically on run 1 and run 1,001. There's no model anywhere in that execution path: Playwright resolves `getByRole('button', { name: 'Add to cart' })` against the live DOM and either finds it or throws. That's fast, free, and perfectly deterministic from the very first execution, and it's the strongest honest argument for codegen: nothing about running the test depends on an AI model being available, correct, or paid for.

The recorded `*_test.md` does not start there. The first time you run `browserbash testmd run recorded_test.md`, there is no cache yet, so each English line is handed to an AI agent, the same engine that powers `browserbash run`, which reads the live page and decides what to click or type to satisfy that line. That first run is slower than a compiled Playwright script, and if you're pointed at a hosted model it costs API tokens; on a local Ollama model, which is BrowserBash's default whenever one is running, it costs nothing, but you still pay in wall-clock time compared to a pre-compiled script.

What happens next is the part codegen has no equivalent for. On a passing run, BrowserBash writes down the concrete actions the agent actually took, which tool, which target, which input, into a local action journal signed with an HMAC key, so a tampered or foreign journal gets ignored rather than trusted. Run the same test again and the runner replays that journal directly: zero model calls, the same locator-level determinism a compiled script gives you, and step events come back tagged `"cached":true` so you can see exactly which steps ran from cache versus which ones needed the agent. The journal itself is gitignored on purpose; it's a derived performance artifact, not something you hand-maintain. The `*_test.md` file is the thing you actually commit, review, and diff.

The interesting case is what happens when a cached step no longer matches, say a button moved or its container got restructured. A frozen Playwright locator call has exactly one strategy: match or throw. A replay miss instead falls back to the agent for that one step, which re-reads the English instruction, not the stale cached target, against whatever the page looks like right now. If it can still satisfy the instruction, the run passes and the journal quietly gets rewritten for next time; if it genuinely can't find anything matching, it fails, the same way a script would. This isn't self-repairing magic that survives any change you throw at it, it's a second, slower strategy sitting behind the fast one, and a compiled script simply doesn't have a second strategy at all.

## Where the two artifacts diverge on maintenance

Say the redesign ships and "Add to cart" becomes "Add to bag," with the underlying markup otherwise untouched. The codegen spec's `getByRole('button', { name: 'Add to cart' })` now matches nothing; Playwright throws a timeout, CI goes red, and a developer has to open the `.ts` file, find the string, and fix it. That's a small, normal fix, but it is a code change: someone with Playwright and TypeScript context has to make it, in a pull request that only they can meaningfully review.

The recorded step, `Click the 'Add to cart' button`, quotes the same literal text, so it isn't immune to the rename either, and it would be dishonest to claim otherwise. The difference is who can fix it and how. Opening a Markdown file and changing four words is not a code change; a manual tester or a product manager reviewing the file in a pull request can make that edit without touching TypeScript, a test runner, or a CI config. If you'd rather the step survive a wording-only change without any edit at all, you loosen the phrasing when you first review the recording, "add the item to the cart" instead of quoting the button's exact label, so the agent judges the intent instead of matching a string. That's the same "review your first draft" discipline codegen expects of you too, just applied to a sentence instead of a locator chain.

Stepping back, the two artifacts differ on more than just what happens after a rename:

| Aspect | Playwright codegen | `browserbash record` |
|---|---|---|
| Output | Real TS/Python/Java/.NET test code | Plain-English `*_test.md` |
| Runs via | Your Playwright project + test runner | `browserbash testmd run`, no test project needed |
| Password handling | Types exactly what you typed, in plaintext | Never captured; becomes `{{password}}` plus a masked value |
| First-run cost | Deterministic, $0, from run one | Model-driven; free on a local Ollama model, token cost on a hosted one |
| Repeat-run cost | Same execution every time | Cached replay, zero model calls, until a step misses |
| On a UI rename | A manual code edit | A Markdown edit, or loosen the wording once |
| Who can review it | Needs Playwright and TypeScript literacy | Anyone who can read English |
| Runs against other providers | Wherever that language toolchain runs | Same file, `--provider local\|cdp\|browserbase\|lambdatest\|browserstack` |

Neither column is strictly better. It's a genuine trade of guaranteed determinism-from-run-one against an artifact more people on the team can actually read and fix themselves.

## When to reach for which

Reach for Playwright codegen when you already have a mature Playwright suite and engineers who own it, when you need bit-for-bit deterministic assertions with zero AI involvement anywhere in the pipeline, or when you're scaffolding a test you plan to hand-refine into a proper Page Object Model. It's free, open source, and genuinely one of the better first-draft generators available; nothing here argues you should stop using it for that job.

Reach for `browserbash record` when the test itself needs to survive a wording-only UI change without a code redeploy, when you want a manual tester or a PM to review and tweak a test without learning Playwright's locator API, when you don't want to stand up a whole Node and Playwright project just to smoke-test one flow, or when you want the "free after the first green run" economics of a local model. Plenty of teams reasonably run both at once: codegen feeding the suite engineers already own, `browserbash record` feeding the smoke checks everyone else on the team needs to be able to read.

## Putting the recorded test into CI

Once a recorded test is reviewed and trimmed, wiring it into a pipeline is two commands: record once locally, then run it headless with structured output everywhere else.

```bash
browserbash record https://staging.example.com/login --out .browserbash/tests/checkout_test.md
browserbash testmd run .browserbash/tests/checkout_test.md --agent --headless
```

`--agent` emits NDJSON, one JSON object per line, so a pipeline (or a coding agent watching the build) parses structured events instead of scraping prose: a step line per action, like `{"type":"step","step":4,"status":"passed","action":"click","remark":"...","cached":true}` once the journal exists, and a terminal `run_end` object summarizing the whole run. Exit codes are the actual gate: `0` passed, `1` failed, `2` error, `3` timeout, the same contract whether you're running a single `testmd run` or a whole directory through `run-all` with JUnit output for your CI dashboard. That's the piece a raw codegen script doesn't give you by default: BrowserBash's own [feature set](https://browserbash.com/features) treats the exit code and the event stream as first-class citizens, so a test you recorded once and a CI gate you wrote later speak the same contract from day one.

## FAQ

### Is Playwright codegen still worth using in 2026?

Yes. It remains a free, open-source, actively maintained way to scaffold real Playwright code fast, and its default role- and text-based locators are a real improvement over older CSS-based recorders. None of that changes because AI-recorded tests exist; codegen is still the right call when you want code your team owns outright and can hand-tune.

### Does browserbash record replace Playwright codegen?

Not exactly, they produce different kinds of artifacts for different jobs. Codegen hands you Playwright source code that runs inside your existing test project. `browserbash record` hands you a plain-English `*_test.md` file that runs through the BrowserBash CLI directly, with no Playwright project required. Some teams keep both: codegen for the suite engineers maintain by hand, recorded tests for flows anyone on the team should be able to read and adjust.

### Does browserbash record capture my password?

No. Password fields are special-cased in the browser at the moment of capture: the actual characters never leave the page, only a `secret: true` marker crosses back to the recorder process. The generated test references `{{password}}` and points you to define the real value in a variables file marked secret, which then gets masked as `*****` in every log line afterward. Compare that to a raw codegen recording, where whatever you type into a password field is written to disk exactly as typed unless you remember to scrub it before committing.

### What happens when the replay cache goes stale?

The runner tries the cached action first. If a step no longer resolves against the live page, it falls back to the agent for that one step, which re-reads the plain-English instruction against the current page rather than the stale cached target. If that still satisfies the instruction, the run passes and the journal gets rewritten for next time. If nothing on the page matches the instruction anymore, the run fails, the same way a codegen script would on a broken locator, just one step later in the process.

### Do I need Playwright installed separately to use browserbash record?

No. BrowserBash ships its own browser automation dependency, so `npm install -g browserbash-cli` is the only setup step for both recording and running plain-English tests. You do still need Google Chrome on the machine, since `record` launches your local Chrome directly rather than downloading a separate Playwright-managed browser binary.

### Can a recorded test run somewhere other than my own laptop?

Yes, without touching the test file at all. `browserbash testmd run` and `run-all` take a `--provider` flag: `local` (your own Chrome), `cdp` (any DevTools endpoint), `browserbase`, `lambdatest`, or `browserstack`. A codegen script is tied to whatever language toolchain generated it; the recorded English steps move between providers with a single flag change.

Recording a flow is the easy five minutes either way. What you're actually choosing is what ends up sitting in your repo six months from now: a `.ts` file only a developer can safely edit, or a Markdown file anyone on the team can read, tweak, and re-run. Install BrowserBash with `npm install -g browserbash-cli` and record your own comparison against a real flow before you decide which one earns a permanent place in your suite.
