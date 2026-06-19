---
title: Nightly AI regression tests with BrowserBash
description: "Run nightly regression tests ai-first: cron-triggered English suites that drive a real Chrome browser and keep video recordings of every run."
date: 2026-04-28
category: ci
---

A regression suite earns its keep at 2 a.m. That is when nobody is watching, when yesterday's merges have piled up, and when a slow leak in your checkout flow either gets caught or ships to customers at breakfast. Nightly regression tests ai teams lean on are usually the heaviest, slowest, most comprehensive jobs in the pipeline — the ones too expensive to gate every pull request but too important to skip. This guide is about building that nightly job with BrowserBash: a cron trigger, a committed suite of plain-English objectives, an AI agent that drives a real Chrome browser through each one, and a `.webm` recording of every single run so the morning triage takes minutes instead of hours.

I'll use BrowserBash as the runner because it was designed for unattended CI: it returns disciplined exit codes, emits machine-readable NDJSON, and records video on any engine without extra plumbing. The cron and recording patterns here transfer to other tools too, but where a detail is BrowserBash-specific I'll say so, and where a competitor is the better fit I'll say that too.

## Why nightly is the right cadence for AI regression tests

Not every test belongs in a nightly job, and not every test belongs on the pull request. Getting the split wrong is how teams end up with either a slow merge queue or a regression net full of holes.

Per-PR checks should be fast and risk-weighted — a handful of smoke flows that prove the change didn't break login, navigation, or the critical path. Anything that takes more than a few minutes, hits third-party sandboxes, or exercises long multi-step journeys belongs in the nightly run. The industry consensus in 2026 lands in the same place: gate a risk-weighted subset per PR, gate the full suite nightly, and keep the slow edge-case tier (localization, cross-browser, long data flows) on a cron with a target runtime under 90 minutes. That tiering keeps developers fast during the day and the safety net wide overnight.

AI-driven regression tests fit the nightly slot especially well because they trade a fixed maintenance tax for a small probabilistic one. A classic Selenium or Playwright suite ships hundreds of locators that snap when a designer renames a CSS class. Your nightly job goes red, the product is fine, and the on-call engineer learns to distrust red. An agent that works from intent — "log in, add a laptop to the cart, check out with the saved card, and confirm the order number appears" — does not care that the button text changed from "Buy now" to "Purchase." Over a 30-flow nightly suite, that resilience is the difference between triaging two real bugs and triaging two real bugs buried under eighteen selector-drift false alarms.

The honest counterweight: the agent occasionally misreads a screen, and that probability compounds across a long objective. I'll come back to how model choice controls that, because it's the single biggest lever on nightly reliability.

## How BrowserBash runs an unattended suite

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command an objective in English, and an AI agent drives a real Chrome or Chromium browser step by step before returning a verdict plus structured extracted values. No account is needed to run it, there are no selectors to write, and nothing leaves your machine unless you explicitly opt in.

Three features make it a clean fit for a cron-triggered job. First, `browserbash testmd run` executes committed Markdown test files, so your nightly suite lives in the repo and reviews like code. Second, `--record` captures a screenshot plus a full `.webm` session video on any engine — the artifact your morning triage actually reads. Third, every run is exit-code disciplined and self-storing: results land in `~/.browserbash/runs` with secrets masked. The [features page](https://browserbash.com/features) covers the rest, and there's a catalog of walkthroughs in the [tutorials](https://browserbash.com/tutorials).

Under the hood you choose an engine — the part that interprets your English. The default is `stagehand` (MIT, by Browserbase), which exposes act/extract/observe/agent primitives and self-heals around minor UI changes. The alternative is `builtin`, an in-repo Anthropic tool-use loop driving Playwright; it's selected automatically for LambdaTest or BrowserStack grids and additionally writes a Playwright trace alongside the recording. For most nightly suites the default engine is fine.

## The model decision controls nightly reliability

Before you write a single cron line, decide where the AI inference runs. On a nightly suite this choice matters more than anywhere else, because errors compound across long objectives run while you sleep.

BrowserBash is Ollama-first. The default model is `auto`, and it resolves in a fixed order: a local Ollama instance first (`ollama/<model>`, free, no keys, nothing leaves the box), then `ANTHROPIC_API_KEY` (`claude-opus-4-8`), then `OPENAI_API_KEY` (`openai/gpt-4.1`), otherwise it errors with guidance. If your test node has a decent GPU, you can run the entire nightly suite at a guaranteed $0 model bill with no data ever leaving the machine — which privacy-sensitive shops care about a great deal.

Here is the caveat that bites nightly jobs specifically. Very small local models, roughly 8B parameters and under, are flaky on long multi-step objectives — and a nightly suite is nothing but long multi-step objectives stacked thirty deep. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows. Do not run a nightly suite of complex journeys against an 8B model and then file bug reports about "flaky tests" — that's a model problem wearing a test problem's clothes.

| Setup | Where inference runs | Cost | Best for nightly |
|---|---|---|---|
| Local Ollama, mid-size model (Qwen3 / Llama 3.3 70B) | On the test node | $0 | GPU node, privacy-sensitive shops |
| Hosted Claude (`ANTHROPIC_API_KEY`) | Hosted | Per-token | Hard multi-step journeys, highest reliability |
| OpenRouter 70B (`OPENROUTER_API_KEY`) | Hosted | Per-token | Modest VMs without a GPU |

You can pin any of these with `--model` — for example `--model ollama/qwen3`, `--model claude-opus-4-8`, or `--model openrouter/meta-llama/llama-3.3-70b-instruct`. Store hosted keys as secrets in your scheduler, never as plaintext in a crontab or a committed script. If you're weighing the running cost of a hosted model against a local GPU node, the [pricing page](https://browserbash.com/pricing) lays out where money is and isn't involved (the CLI itself is free).

## Writing the suite as committed Markdown tests

The cron job is the easy part. The asset that pays off for years is a committed suite of Markdown test files, because those review like code, diff cleanly, and don't rot the way recorded selectors do.

A BrowserBash Markdown test (`*_test.md`) is a plain file where each list item is a step. It supports `{{variables}}` templating, `@import` for composing shared setup, and secret-marked variables that get masked as `*****` in every log line. After each run it writes a human-readable `Result.md` next to the test. Here's a small but realistic regression file:

```markdown
# Checkout regression

- Go to https://shop.example.com
- Log in as {{username}} with password {{password}}
- Search for "wireless keyboard" and open the first result
- Add it to the cart and proceed to checkout
- Pay with the saved card ending in 4242
- Confirm an order number is shown and extract it as order_id
```

That file is the entire test. There is no page object, no locator file, no wait logic. The keyboard model can change, the checkout can get a new step, the "Add to cart" button can move, and the objective still describes what a human would do. Run it with:

```bash
browserbash testmd run ./checkout_regression_test.md \
  --headless \
  --record \
  --timeout 180
```

For the nightly job you'll have a directory of these — checkout, account settings, search, password reset, a couple of edge-case localization flows. Keep each file focused on one journey so that when one goes red, the recording you open is short and the failure is obvious. The [learn hub](https://browserbash.com/learn) has deeper material on structuring objectives the agent follows reliably.

### Templating environments and secrets

The `{{variables}}` mechanism is what lets the same suite run against staging tonight and a release candidate next week. Pass values at invocation, mark the password as a secret, and it never appears in plaintext in your logs or the stored run. Because secrets are masked in `~/.browserbash/runs` as well as in live output, an engineer can open last night's run during triage without staring at a live credential — and nightly artifacts get shared widely the next morning.

## Cron-triggering the suite

Now the scheduling. The shape is identical whether you use a raw Unix crontab, a CI scheduler like GitHub Actions or GitLab's `schedule` rule, or a Jenkins `cron` trigger: at a fixed time, run the suite headless, record everything, and let the exit code decide the verdict.

A bare crontab entry on a Linux test node looks like this:

```bash
# Run the regression suite every night at 02:00
0 2 * * * cd /opt/regression && \
  browserbash testmd run ./suite/checkout_regression_test.md \
  --headless --record --timeout 240 \
  >> /var/log/browserbash/nightly.log 2>&1
```

For a real suite you'd loop over the `suite/` directory rather than naming one file, collecting exit codes as you go so a single failure doesn't stop the rest of the run. The key flags are stable across every scheduler: `--headless` because there's no display at 2 a.m., `--record` because the recording is the whole point of an unattended job, and `--timeout` set generously since nightly flows are longer and the node may be busy. If you'd rather see this wired into a hosted CI pipeline with stages and artifacts, the [BrowserBash blog](https://browserbash.com/blog) has step-by-step pipeline guides for the common platforms.

Three operational rules I'd treat as non-negotiable. Set the timeout high enough that a slow-but-correct run isn't killed mid-checkout — a false timeout is as damaging as a false failure. Append to a dated log so you can correlate a red run with what else the node was doing. And keep the suite small enough to finish inside your maintenance window; a nightly job that bleeds into business hours stops being nightly.

### Parsing the verdict in CI without reading English

A nightly job needs a machine to decide pass or fail, not a human reading prose at 8 a.m. BrowserBash gives you two clean mechanisms.

The first is exit codes. Every run returns `0` for passed, `1` for failed, `2` for error, and `3` for timeout. Your cron wrapper can branch on those directly — collect non-zero exits across the suite, and if the count is greater than zero, send the alert. That's the entire CI contract, no log scraping required.

The second is `--agent` mode, which emits NDJSON: one JSON object per line. Progress events look like `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`, and the terminal event looks like `{"type":"run_end","status":"passed","summary":"...","final_state":{...},"duration_ms":...}`. A nightly job that pipes `--agent` output into a small script can build a structured report — which flows passed, which failed, how long each took, and what each one extracted — and post it to Slack or a dashboard. This is also exactly the format an AI coding agent consumes when you want the failure analysis automated rather than manual.

## Recordings: the artifact that makes morning triage fast

Here's the part teams underrate until their first red nightly run. When a flow fails at 2 a.m., the question at 8 a.m. is always the same: *what did the agent actually see?* Without a recording you're guessing from a stack trace. With one you watch the thirty-second clip and the answer is obvious — a modal blocked the button, a third-party widget didn't load, the staging environment was down, the price changed and broke the assertion.

`--record` captures a screenshot plus a full `.webm` session video using a bundled ffmpeg, on either engine. When you're on the `builtin` engine it additionally writes a Playwright trace, which you can open in the Playwright trace viewer for a step-by-step, network-and-DOM-level reconstruction. For a nightly suite I treat the `.webm` as the primary triage artifact and the trace as the deep-dive tool for the cases the video doesn't fully explain.

The single highest-leverage habit: archive recordings only for failed runs, or archive all but prune aggressively. A 30-flow suite generates a lot of video, and you do not need last Tuesday's passing checkout. Keep failures long enough to fix the bug, keep a rolling few days of passes for flake investigation, and delete the rest. BrowserBash's run store already caps itself at 200 runs on disk with secrets masked, but your CI artifact retention is a separate decision to make deliberately.

### Local dashboard vs. cloud dashboard

Two optional dashboards exist, and both are genuinely opt-in. `browserbash dashboard` opens a fully local dashboard at `localhost:4477` — nothing leaves the machine, and `--clear` wipes the store. For a nightly suite this is the natural home base: point a teammate at it during triage and they can scrub through last night's recordings without any cloud account. You can also pass `--dashboard` on a single run to open it for that run.

If you want recordings reachable from anywhere — useful when triage happens across a distributed team — there's an optional cloud path. You link once with `browserbash connect --key bb_...`, then add `--upload` per run to push that specific run to the cloud, where free runs are kept for 15 days. The important honesty here: without `--upload`, nothing leaves your machine, full stop. The cloud is a deliberate per-run choice, not a default. If a hosted dashboard fits your team, you can [sign up](https://browserbash.com/sign-up) for a free key, but a purely local nightly setup never needs one.

## Triaging a red nightly run

A good nightly process is mostly about what happens when it goes red. Here's the loop I'd run, and it leans on the 2026 consensus that governing flake beats debugging individual flakes one at a time.

When the morning alert fires, open the recording first, not the log. The `.webm` answers "what happened" in seconds. Classify the failure into one of a few buckets: a real regression, an environment issue (staging was down, a sandbox 500'd), a genuine flake (the agent misread a screen it usually reads fine), or an assertion that needs updating because the product legitimately changed. That classification is the whole job.

For real regressions, file the bug with the recording attached — the video is better repro evidence than any reproduction steps you'd type. For environment issues, the fix is infrastructure, not the test. For genuine flakes, resist the urge to immediately "fix" the objective; quarantine the flow into a separate file that still runs nightly but gates nothing, give it an owner, and set a deadline. Research on flaky tests is blunt about why this works: flakes reproduce only between 17% and 43% of the time, so chasing each one interactively is a losing game compared to governing them as a category. For assertion drift, update the objective and move on — that's the suite doing its job.

| Failure bucket | Triage signal | Action |
|---|---|---|
| Real regression | Recording shows a genuine product break | File bug with `.webm` attached |
| Environment issue | Recording shows a 500, downtime, blank page | Fix infra; re-run, don't touch the test |
| Genuine flake | Agent misread a normally-fine screen | Quarantine, assign owner, set a deadline |
| Assertion drift | Product changed on purpose | Update the objective |

The one model-specific note: if your flake rate is high across many unrelated flows, that's rarely thirty bad tests — it's usually one undersized model. Bump from an 8B local model to a 70B-class one or a hosted model and watch the flake count collapse. Distinguishing "the test is flaky" from "the model is undersized" is the most valuable skill in running an AI regression suite.

## When a nightly AI suite is the right call — and when it isn't

This approach is not the answer to every testing problem, and pretending otherwise would waste your time.

Choose a nightly AI regression suite when your flows are high-level user journeys that a human could describe in a sentence, when selector maintenance has become a real tax on your team, and when you want a wide safety net overnight rather than exhaustive coverage on every commit. It shines for checkout, onboarding, search, account management, and the cross-cutting journeys that span many pages — exactly the flows where traditional locator-based suites flake the hardest. It's also a strong fit when data residency matters, because the local-model path keeps everything on your hardware.

Lean elsewhere in a few cases, honestly. If you need pixel-exact visual regression — catching a two-pixel shift in a button — a dedicated visual-diff tool with golden-image baselines is the better instrument; intent-based agents check behavior, not pixels. If your assertions are deep API or database state rather than what's visible in a browser, an API test harness is more direct. And if you need deterministic, millisecond-stable replays for a flow you already understand perfectly, a hand-written Playwright script with explicit selectors is faster and cheaper than any agent — the agent's value is resilience to change, and a frozen flow doesn't change. A mature pipeline usually runs all three: fast deterministic checks per-PR, a visual-diff job on main, and an AI regression suite nightly for the broad behavioral net. They're complements, not competitors. The [case studies](https://browserbash.com/case-study) show where teams have drawn that line.

## A realistic end-to-end nightly setup

Pulling the pieces together: you have a `suite/` directory of focused `*_test.md` files, one per journey, committed and reviewed like code. A cron trigger fires at 2 a.m. and runs each file headless with `--record` and a generous `--timeout`. Inference points at a mid-size local model on a GPU node, or a hosted model via `ANTHROPIC_API_KEY` on a modest VM. Each run's exit code feeds a wrapper that tallies failures; `--agent` NDJSON feeds a structured Slack summary. Recordings for failed runs are archived, passes pruned after a few days, and the local dashboard at `localhost:4477` is where triage happens the next morning.

```bash
browserbash testmd run ./suite/checkout_regression_test.md \
  --model claude-opus-4-8 \
  --headless \
  --record \
  --timeout 240 \
  --agent
```

That single command — multiplied across your suite directory and wrapped in a cron loop — is the whole nightly job. No grid to provision, no selector library to maintain, no log-scraping to decide the verdict. The agent reads the screen, the exit code reports the result, and the recording explains the failure. For the npm package details and version history, see the [BrowserBash package on npm](https://www.npmjs.com/package/browserbash-cli), and the source lives on [GitHub](https://github.com/PramodDutta/browserbash) if you want to read exactly how the run loop and recording work.

## FAQ

### What is the best schedule for AI regression tests?

For most teams a nightly cron at low-traffic hours (commonly 1–3 a.m. local time) is the right cadence for the full regression suite, paired with a fast risk-weighted subset that runs on every pull request. The nightly slot gives slow, comprehensive journeys room to run without blocking developers during the day. Keep the whole suite short enough to finish inside your maintenance window so it never bleeds into business hours.

### How do AI regression tests handle flaky failures?

The most effective approach in 2026 is governance rather than per-flake debugging, because flaky tests reproduce only a fraction of the time. Quarantine a flaky flow into a separate file that still runs nightly but gates nothing, assign it an owner, and set a deadline to resolve it. With BrowserBash, a high flake rate across many unrelated flows usually points at an undersized model rather than thirty bad tests — moving from an 8B local model to a 70B-class or hosted model typically collapses the flake count.

### Do I need a cloud account to run a nightly BrowserBash suite?

No. BrowserBash runs entirely locally with no account, and on a local Ollama model nothing leaves your machine and there's no model bill. The local dashboard at localhost:4477 gives you a place to review recordings without any cloud. A cloud dashboard exists for distributed triage, but it's strictly opt-in — you only push a run with `--upload` after linking a key, and free cloud runs are kept for 15 days.

### Why keep video recordings of every regression run?

Because the recording answers the only question that matters during morning triage: what did the agent actually see when the flow failed? A thirty-second `.webm` shows a blocking modal, a failed third-party widget, or a downed environment far faster than reading a stack trace. The `--record` flag captures a screenshot plus a `.webm` on any engine, and on the builtin engine it also writes a Playwright trace for deeper debugging. Archiving recordings for failed runs turns triage from an investigation into a quick watch-and-classify.

Ready to build your nightly suite? Install the CLI with `npm install -g browserbash-cli`, point a cron at a directory of Markdown tests, and you have a recording-backed regression net by morning. No account is required to run it — grab a free key at [browserbash.com/sign-up](https://browserbash.com/sign-up) only if you want the optional cloud dashboard.
