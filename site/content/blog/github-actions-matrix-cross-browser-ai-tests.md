---
title: Cross-Browser AI Tests in a GitHub Actions Matrix
description: "Build a github actions matrix for cross browser ai tests that fans BrowserBash across providers and browsers, gated on exit codes with replayable history."
date: 2026-04-25
category: ci
---

If you want a single workflow that runs your end-to-end checks on Chrome locally, then again on a hosted Safari and a hosted Edge, the cleanest way to do it is a GitHub Actions matrix for cross-browser AI tests. You declare the combinations once, let Actions fan the job out, and each leg drives a real browser through a plain-English objective. No selectors, no page objects, no per-browser test code. The agent reads the screen, decides what to click, and returns an exit code your pipeline can trust. This guide builds that matrix from the ground up with BrowserBash, gates every leg on its process exit code, and uses `--upload` so each run leaves a replayable history you can open later.

I'll be specific about what's load-bearing and honest about what isn't. A matrix is cheap to write and easy to get subtly wrong — fail-fast semantics, secret handling, and how a flaky model interacts with required status checks all bite teams in the same predictable ways. We'll cover each one. Where GitHub's behavior is version- or plan-specific, I'll say so rather than pretend every runner is identical.

## Why a matrix is the right shape for cross-browser AI tests

The matrix strategy in GitHub Actions exists to run the same job across a set of variable combinations. Its original home was language versions: test on Node 18, 20, and 22 without copy-pasting three jobs. Browsers and execution providers fit that mold exactly. You have one objective — "log in, add an item to the cart, check out, confirm the order" — and you want it verified everywhere your users actually are.

The reason AI browser tests slot into this so well is that the objective stays constant across every leg. In a classic Selenium or Playwright matrix, you still ship the same selectors to every browser, and those selectors break for browser-specific reasons: a date picker renders differently in WebKit, a focus event fires in a different order on Firefox, an `:has()` selector behaves inconsistently across engines. Your matrix goes red, but the product works. With an agent driving from intent, the cross-browser surface that usually generates false failures shrinks. The agent looks at whatever the page actually renders and works toward the goal. When a button says "Buy now" on one engine and your CSS nudges it elsewhere on another, the agent does not care. A human tester wouldn't either.

That is the core trade. You move the fragile part — turning a DOM into stable assertions — out of your pipeline and into the model. In exchange you accept a small probabilistic tax: the agent occasionally misreads a screen. The matrix amplifies both sides. Run one objective across five legs and you get five times the cross-browser coverage, but also five chances for a model to wobble. Whether that math works out depends almost entirely on your model choice, which I'll get to before any YAML.

### What BrowserBash contributes to the matrix

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command an objective in English, and an AI agent drives a real Chrome or Chromium browser step by step, returning a verdict plus structured results. No account is required to run it, and there are no selectors to write. The deeper background lives in the [BrowserBash learn hub](https://browserbash.com/learn) if you want the conceptual tour first.

Three features make it fit a matrix cleanly. First, `--agent` mode emits NDJSON — one JSON event per line on stdout — so CI never parses prose. Second, it returns disciplined exit codes (0 passed, 1 failed, 2 error, 3 timeout) that map straight onto GitHub Actions job status. Third, `--provider` switches where the browser actually runs with a single flag, which is precisely the axis a cross-browser matrix needs to vary.

## The model decision before you touch the YAML

Decide where inference runs before you write a line of workflow, because it changes your networking, your cost, and your reliability.

BrowserBash is Ollama-first. By default it looks for a local Ollama instance and uses free local models, so no API keys are needed and nothing leaves the machine. The CLI auto-resolves in this order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. It also supports OpenRouter — including genuinely free hosted models such as `openai/gpt-oss-120b:free` — and Anthropic Claude if you bring your own key.

Here is the honest caveat, and it matters more in a matrix than anywhere else. Very small local models (roughly 8B parameters and under) can be flaky on long, multi-step objectives. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for genuinely hard flows. In a matrix that runs five legs, a wobbly small model doesn't just flake once — it flakes statistically across all five, and now you're re-running the whole grid chasing a model problem you'd have caught immediately with a single representative leg. Pick the model first, prove the objective is stable on one provider, then fan it out. Do not debug a matrix and a model at the same time.

A practical pattern: standard GitHub-hosted runners do not ship GPUs and won't run a 70B local model at a reasonable speed. So in CI you have two sane options. Use a hosted model via `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` (stored as repository secrets), or run the browser on a remote provider that handles its own infrastructure while your model call goes out to a hosted endpoint. For local-model runs at a guaranteed $0 model bill, point your workflow at a self-hosted runner with a GPU. Each is legitimate; they just have different cost and privacy profiles, which the [pricing page](https://browserbash.com/pricing) lays out alongside the dashboard tiers.

## Mapping the two axes: providers and browsers

A cross-browser AI test matrix varies along two axes. The first is the provider — where the browser process actually runs. BrowserBash switches this with `--provider`:

- `local` (default) — your own Chrome, on the runner.
- `cdp` — any Chrome DevTools Protocol endpoint you point it at.
- `browserbase` — Browserbase's hosted browser cloud.
- `lambdatest` — LambdaTest's grid.
- `browserstack` — BrowserStack's grid.

The second axis is the browser and platform itself. Local and `cdp` give you Chrome or Chromium on whatever the runner provides. The hosted grids — LambdaTest and BrowserStack — are where you reach genuinely different engines and operating systems: Safari on macOS, Edge and Firefox on Windows, older browser versions for regression coverage. That distinction matters when you design the matrix. If your goal is "does this flow work in three real engines," the provider axis is the one doing the heavy lifting, because that's where WebKit and Gecko actually live.

Here's a quick reference for how the two axes combine in practice:

| Provider flag | Where the browser runs | Cross-engine reach | Best for |
|---|---|---|---|
| `local` | The GitHub runner's own Chrome | Chrome/Chromium only | Fast baseline leg, $0 if model is local |
| `cdp` | Any DevTools endpoint you host | Whatever you connect | Custom infra, container browsers |
| `browserbase` | Browserbase cloud | Chromium-class hosted | Offloading browser infra from runners |
| `lambdatest` | LambdaTest grid | Safari, Edge, Firefox, older versions | True cross-browser/OS coverage |
| `browserstack` | BrowserStack grid | Safari, Edge, Firefox, older versions | True cross-browser/OS coverage |

A word of honesty about the grids. The exact catalog of browser versions, OS images, session limits, and concurrency on Browserbase, LambdaTest, and BrowserStack is set by those vendors and changes over time, so treat their current docs as the source of truth rather than anything I assert here. BrowserBash's job is to drive the session through `--provider`; the grid decides what hardware and engines are on the menu. Plan your matrix legs around what your grid plan actually includes.

## Building the workflow: a minimal matrix that fans out

Start with the smallest matrix that proves the shape: one objective, two legs. The job below installs the CLI, runs the same objective on the `local` provider and on the `lambdatest` provider, and lets each leg report its own status. The objective is the e-commerce checkout flow BrowserBash is built to run end to end.

```bash
name: cross-browser-ai-tests
on: [push, workflow_dispatch]

jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - provider: local
          - provider: lambdatest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install BrowserBash
        run: npm install -g browserbash-cli
      - name: Run checkout objective
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          LT_USERNAME: ${{ secrets.LT_USERNAME }}
          LT_ACCESS_KEY: ${{ secrets.LT_ACCESS_KEY }}
        run: |
          browserbash run "Log in to the demo store, add a laptop to the cart, \
            complete checkout, and verify the page shows 'Thank you for your order!'" \
            --provider ${{ matrix.provider }} \
            --agent \
            --upload
```

Two lines in that file do most of the work, so let me be explicit about them.

`fail-fast: false` is not optional for this use case — it's the single most important setting in the whole workflow. By default a GitHub Actions matrix is fail-fast: the moment one leg fails, Actions cancels every other in-flight leg. That is exactly wrong for cross-browser testing. If the flow breaks on Safari, you still want to know whether it broke on Chrome and Edge too. Setting `fail-fast: false` lets every leg run to completion so you get the full cross-browser picture in one push instead of fixing one engine, re-running, and discovering the next.

The `matrix.include` list defines the legs. Using `include` with named entries (rather than a bare list) scales well: when you later add per-leg variables — a specific browser name for the grid, a different timeout, a region — each entry holds its own keys without combinatorial blow-up. We'll expand it shortly.

### Why `--agent` and exit codes carry the status

Notice the workflow never greps a log to decide pass or fail. That's the point of `--agent`. In agent mode BrowserBash emits NDJSON on stdout — structured events, one per line — and sets a process exit code on completion: 0 for passed, 1 for failed, 2 for an error, 3 for a timeout. GitHub Actions treats any non-zero exit from a `run` step as a failed step, which fails that matrix leg, which marks that leg red in the checks UI.

So the chain is clean: agent verdict to exit code to step status to job status to commit check. No prose parsing anywhere. This is the same design that makes BrowserBash comfortable to drive from AI coding agents, and it's covered more fully under [agent mode in the features overview](https://browserbash.com/features). If you ever do want to inspect the events — to surface a summary in the job log or post a comment — you parse the NDJSON, which is stable and machine-readable, not the human verdict text.

One nuance worth knowing: exit code 2 (error) and 3 (timeout) are distinct from 1 (failed) on purpose. A failed test means the agent ran and the objective wasn't met — a real product signal. An error or timeout often means infrastructure: the grid didn't allocate a session, the model endpoint hiccuped, the runner ran out of time. Both fail the matrix leg, but if you want to treat them differently — say, auto-retry on 3 but never on 1 — you can branch on the exact code in a shell step, because the codes are documented and consistent.

## Adding the cross-browser dimension properly

The two-leg version proves the wiring. Now make it earn the word "cross-browser" by varying the actual engine on the grid legs. You do that by attaching grid-specific variables to each matrix entry and passing them through. The local leg stays as a fast Chrome baseline; the grid legs target real engines.

```bash
strategy:
  fail-fast: false
  matrix:
    include:
      - name: chrome-local
        provider: local
      - name: safari-mac
        provider: lambdatest
        browser: safari
      - name: edge-win
        provider: lambdatest
        browser: edge
      - name: firefox-win
        provider: lambdatest
        browser: firefox
```

With named legs, the GitHub checks UI shows `e2e (chrome-local)`, `e2e (safari-mac)`, and so on — readable status lines that tell you at a glance which engine broke. That readability pays off every time someone opens a red build at 2 a.m. and needs to know in one glance whether this is a Safari-only problem or a real regression.

How you pass `browser` to the grid depends on the provider's session configuration, and that's vendor-specific. The reliable, portable pattern is to surface it as an environment variable the provider reads, or to fold the browser choice into the objective and capabilities your provider integration expects. Keep the objective itself identical across legs — that's the discipline that makes the matrix meaningful. If you change the wording per browser, you're no longer testing the same thing five ways; you're running five different tests that happen to share a workflow.

### Handling secrets without leaking them

Grid credentials and hosted-model keys are secrets, and a matrix multiplies the places they appear in logs. BrowserBash helps here in two ways. First, in `--agent` mode the output is structured NDJSON, not a free-text transcript that might echo a credential. Second, if you drive flows through committable Markdown tests instead of inline objectives, secret-marked `{{variables}}` are masked as `*****` in every log line the tool writes.

That second point is worth a short detour because it's the cleaner pattern for anything involving a password. BrowserBash supports committable `*_test.md` files where each list item is a step, with `@import` for composition and `{{variables}}` for templating. Mark a variable as secret and it never appears in plaintext in the logs or the written `Result.md`. Here's the same checkout flow as a Markdown test with a masked password:

```bash
# login_checkout_test.md
# vars: STORE_USER, STORE_PASS (secret)

- Go to https://demo.store.example and click "Sign in"
- Log in as {{STORE_USER}} with password {{STORE_PASS}}
- Search for "laptop" and add the first result to the cart
- Open the cart and complete checkout with the saved address
- Verify the page shows "Thank you for your order!"
```

Run it in CI with:

```bash
browserbash testmd run ./login_checkout_test.md \
  --provider lambdatest \
  --agent \
  --upload
```

The `STORE_PASS` value comes from a GitHub secret, gets injected as a variable, and shows up as `*****` everywhere the tool logs it. You commit the test file, not the password. That's the right boundary for a public repo or any pipeline where logs are visible to people who shouldn't see production credentials. The [learn hub](https://browserbash.com/learn) goes deeper on Markdown test composition if you want to factor shared login steps into one imported file.

## Using `--upload` for replayable run history

Exit codes tell you that a leg failed. They don't tell you *why*. For that you want to watch what the agent saw. This is where `--upload` earns its place in the matrix.

`--upload` sends the run to the free cloud dashboard, which is strictly opt-in. You connect once with `browserbash connect`, then any run with `--upload` lands in your history with video recordings and per-run replay. In a matrix, this is the difference between "Safari leg is red, good luck" and "open the Safari run, watch the recording, and see the agent stall on a cookie banner that only renders in WebKit." Free uploaded runs are kept for 15 days, which comfortably covers the window where you're actually triaging a recent failure.

A few honest notes so you set this up with eyes open. The dashboard is opt-in and requires `browserbash connect` plus an account — no account is needed to *run* tests, only to upload them. If you'd rather keep everything on your own infrastructure, there's a fully local dashboard via `browserbash dashboard` that gives you run history without anything leaving your machine; the trade-off is that it's local to wherever it runs, so it's less convenient for a CI runner that's torn down after each job. For ephemeral GitHub runners, the cloud upload is usually the pragmatic choice because the artifacts outlive the runner. Pricing and retention specifics live on the [pricing page](https://browserbash.com/pricing).

### Recording artifacts you keep in the repo too

`--upload` and local artifacts aren't mutually exclusive. The `--record` flag captures a screenshot and a full `.webm` session video on any engine, and on the builtin engine it additionally captures a Playwright trace you can open in the trace viewer. You can combine `--record` with the standard `actions/upload-artifact` step to attach those videos to the GitHub run itself, so even teams who don't use the cloud dashboard get a visual record:

```bash
- name: Run with recording
  run: |
    browserbash run "Log in, add a laptop to the cart, check out, \
      and verify 'Thank you for your order!'" \
      --provider ${{ matrix.provider }} \
      --agent --record --upload
- name: Save recordings
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: recording-${{ matrix.name }}
    path: ./recordings/
```

The `if: always()` is deliberate. You want the video most when the leg failed, and without `always()` the upload step is skipped on failure — exactly when you need it. Name the artifact per leg (`recording-${{ matrix.name }}`) so the four legs don't overwrite each other.

## When a matrix is the right call — and when it isn't

A cross-browser AI test matrix is genuinely useful, but it's not free, and pretending otherwise would be the kind of hype this blog tries to avoid.

**Reach for the matrix when** your users actually span multiple engines and you've had cross-browser bugs before. A B2B dashboard whose customers are all on managed Chrome does not need a five-engine grid; one solid Chrome leg covers reality. A consumer storefront with heavy Safari/iOS traffic absolutely does, because WebKit quirks are real and they cost sales. The matrix earns its keep proportional to how diverse your real traffic is.

**Be careful when** your model is small or your objective is long and brittle. As noted, a flaky 8B local model flaking across five legs will make the matrix look unreliable when the real fix is a better model. Prove stability on one leg first. Likewise, every grid leg consumes paid grid minutes and possibly hosted-model tokens; a matrix that runs on every push to every branch can get expensive fast. Gate the full grid to pull requests against main, or to a nightly schedule, and keep a single fast local Chrome leg on every push for quick signal.

**Consider a simpler setup when** you're early. If you don't yet have a stable objective that passes reliably on one browser, a matrix is premature — you'll spend your time fixing the model and the flow, not the cross-browser surface. Get one green leg first. The matrix is an amplifier; amplify something that works. There's a worked progression from single runs to CI in the [BrowserBash blog](https://browserbash.com/blog) and concrete outcomes in the [case study](https://browserbash.com/case-study) if you want to see the staged approach.

### A pragmatic split that most teams land on

In practice the configuration that holds up over months tends to look like this. On every push, run one `local` Chrome leg with `--agent` so developers get a fast pass/fail. On pull requests targeting your release branch, expand to the full grid matrix with `--agent --upload` so reviewers can replay any failure. On a nightly schedule, run the widest matrix you can afford, including older browser versions for regression coverage. This keeps fast feedback cheap and reserves the expensive, comprehensive cross-browser sweep for the moments it actually changes a decision.

## Putting it together

The whole approach rests on three primitives working in concert. The matrix `include` list fans one objective across providers and browsers with `fail-fast: false` so you see every engine's result. The `--agent` exit codes carry the verdict from agent to commit check with zero prose parsing. And `--upload` (optionally with `--record`) leaves a replayable trail so a red leg is a thing you can watch, not a mystery you guess at. Add masked `{{variables}}` in Markdown tests for credentials, and you have a cross-browser AI testing pipeline that's honest about pass/fail, debuggable after the fact, and safe to run in a public repo.

The part that surprises people is how little there is. There's no per-browser test code, no selector maintenance, no page-object refactor when the UI shifts. You maintain one English objective and a short matrix definition. The agent and the grid do the rest. That's the trade at the heart of it — a small probabilistic tax for a large maintenance saving — and a matrix is simply the mechanism that spreads that trade across every browser your users live in.

## FAQ

### How do GitHub Actions exit codes determine pass or fail for AI tests?

GitHub Actions treats any non-zero exit from a `run` step as a step failure, which fails the matrix leg. BrowserBash returns 0 for passed, 1 for failed, 2 for error, and 3 for timeout, so the agent's verdict maps directly onto job status with no log parsing. Use `--agent` mode so the tool emits structured NDJSON and sets these codes deterministically. You can branch on the exact code in a shell step if you want to retry timeouts but never retry real failures.

### Why should I set fail-fast to false in a cross-browser matrix?

By default a GitHub Actions matrix cancels all in-flight legs the moment one fails, which hides whether the same flow also broke on other browsers. Setting `fail-fast: false` lets every leg run to completion so you get the full cross-browser picture in a single push. That saves you from the fix-one, re-run, find-the-next loop. It's the single most important setting in a cross-browser AI test matrix.

### Do I need a cloud account to run BrowserBash in CI?

No. You can run any objective with no account, fully locally, and decide pass or fail purely from exit codes. An account is only needed for the optional cloud dashboard that you opt into with `browserbash connect` plus `--upload`, which adds video recordings and per-run replay kept for 15 days. If you prefer to keep everything local, `browserbash dashboard` gives you run history on your own machine instead.

### Can I run real Safari and Edge through BrowserBash in a matrix?

Yes, by switching the `--provider` flag to a hosted grid such as `lambdatest` or `browserstack`, which is where engines like WebKit Safari and Edge actually live. The local and `cdp` providers give you Chrome or Chromium; the grids reach other engines and operating systems. The exact browser versions and OS images come from the grid vendor and change over time, so plan your matrix legs around what your grid plan includes.

Ready to build your own cross-browser matrix? Install the CLI with `npm install -g browserbash-cli`, get one local Chrome leg green, then fan it out across providers. An account is optional — you only need one if you want the replayable cloud history, which you can [sign up](https://browserbash.com/sign-up) for when you're ready.
