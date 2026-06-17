---
title: Natural-Language Browser Testing on CircleCI: Step by Step
description: "Run natural language browser testing on CircleCI without an orb: install browserbash-cli, run Markdown tests, upload run history to a free dashboard."
date: 2026-03-18
category: ci
---

If you have ever maintained a Selenium grid inside CI, you know the tax. This guide walks through natural language browser testing on CircleCI using BrowserBash: an orb-free job that installs `browserbash-cli`, runs plain-English Markdown tests, and uploads run history to a free dashboard. No grid to babysit, no selectors to chase, no page objects to refactor every time a button moves. You write the objective in English, an AI agent drives a real Chrome browser, and CircleCI gets a clean pass/fail verdict from the exit code.

The promise is simple, but the details matter — model choice, headless config, caching, and how you handle the inevitable flaky run. Let's build the job from an empty `.circleci/config.yml` and fill in the parts that actually trip people up.

## Why natural-language browser testing changes the CI math

Traditional UI automation in CI is mostly plumbing. You provision browsers, match driver versions to browser versions, keep a Selenium Grid or a containerized Chrome alive, and write code that finds elements by CSS or XPath. Every one of those layers is a thing that breaks independently of your application. A driver bump, a grid node that runs out of memory, a `data-testid` that a frontend dev renamed — none of these are product bugs, but all of them turn your pipeline red and burn an afternoon.

BrowserBash collapses that stack. You describe what a user does — "log in, add the blue hoodie to the cart, check out, and confirm the order" — and the agent figures out the clicks. There is no locator file to maintain because there are no locators. When the checkout button moves from the header to a sticky footer, a selector-based test fails and a natural-language test keeps passing, because "check out" still means the same thing to a human and to the agent reading the page.

That shift has a direct effect on CircleCI specifically. The thing you spend the most effort on in a grid-based setup — keeping the browser infrastructure healthy — mostly disappears. BrowserBash defaults to driving your own local Chrome/Chromium right inside the CircleCI executor. There is no remote grid in the default path, which means there is no grid to scale, secure, or pay for. You can read more about how the agent approach works on the [BrowserBash learn pages](https://browserbash.com/learn) before you wire it into a pipeline.

### What "orb-free" means and why we're doing it

CircleCI orbs are reusable config packages. They are convenient, but they also add a dependency you do not control, a version to track, and occasionally a layer of magic that makes debugging harder. For a tool that installs with a single `npm install -g`, an orb buys you almost nothing. This guide deliberately uses no orb. Everything is plain shell steps you can read, copy, and reason about. If your security team reviews every third-party orb, that review just got shorter.

## The CircleCI setup at a glance: BrowserBash vs a Selenium grid

Before the config, here is the honest comparison. Selenium and Selenium Grid are mature, battle-tested, and the right tool for plenty of teams. This table is about the specific cost of running browser tests in CI, not a claim that one tool is universally better.

| Concern in CI | Selenium grid | BrowserBash on CircleCI |
|---|---|---|
| Browser infrastructure | Grid hub + nodes to provision and keep alive | Local Chrome in the executor (default `local` provider) |
| Driver/browser version drift | You match chromedriver to Chrome | Agent drives the installed browser; no driver matching |
| Test authoring | Code + locators + page objects | Plain-English steps in `*_test.md` files |
| Maintenance when UI changes | Update selectors/page objects | Often nothing; intent is unchanged |
| Parallelism cost | More grid nodes = more infra | CircleCI parallelism over executors |
| Verdict for CI | Test framework reporter | Process exit code (0/1/2/3) |
| Model/API cost | None (no LLM) | $0 on local models; hosted models optional |
| Run history / video | Bring your own reporting | Optional free dashboard with replay |

The trade is real and worth naming. Selenium gives you deterministic, millisecond-precise control and zero LLM in the loop — if you need to assert exact pixel positions or drive a thousand identical iterations, a coded framework is more predictable. BrowserBash gives you tests that survive UI churn and cost almost nothing to maintain, at the price of an agent that occasionally needs a clearer instruction. Pick based on which cost hurts your team more. The [BrowserBash features overview](https://browserbash.com/features) lays out where the agent approach fits best.

## Step 1: Pick where the browser and the model run

Two decisions shape the whole job. First, where does the browser run? BrowserBash's default `--provider local` runs Chrome inside the CircleCI executor, which is what we want for a self-contained, grid-free pipeline. You can switch to `cdp`, `browserbase`, `lambdatest`, or `browserstack` with a single `--provider` flag later if you need a managed device cloud, but start local.

Second, which model drives the agent? BrowserBash is Ollama-first: it defaults to free local models and resolves the model in this order — local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. On local models nothing leaves the machine and your model bill is genuinely $0.

Here is the honest caveat, and it matters most in CI. Very small local models (roughly 8B parameters and under) can be flaky on long, multi-step objectives — exactly the kind of checkout flow you want to test. Running a 70B-class model inside a standard CircleCI container is usually not practical. So in practice you have two sensible CI choices:

- A capable hosted model via `OPENROUTER_API_KEY` (OpenRouter even offers genuinely free hosted models such as `openai/gpt-oss-120b:free`) or `ANTHROPIC_API_KEY` for hard flows.
- A self-hosted Ollama runner with a mid-size model (Qwen3 or Llama 3.3 70B-class) if you want to keep everything in-house and have the hardware.

For most teams getting started, a hosted key stored as a CircleCI environment variable is the path of least resistance and keeps the executor small. Set it once in **Project Settings → Environment Variables** and never put it in the config file.

## Step 2: Write the test in plain English

BrowserBash tests live in committable `*_test.md` files. Each list item is one step. You compose files with `@import` and parameterize with `{{variables}}`, and any variable you mark as a secret is masked as `*****` in every log line — which is exactly what you want when CI logs are visible to a whole team.

Create `.browserbash/tests/checkout_test.md`:

```markdown
# Checkout smoke test

- Go to {{baseUrl}}
- Log in with email {{user}} and password {{password}}
- Search for "blue hoodie" and open the first result
- Add the item to the cart
- Proceed to checkout and complete the order with the saved address
- Verify the page shows "Thank you for your order!"
```

That is the entire test. No selectors, no waits, no page object. The `{{password}}` variable will be passed in as a secret at runtime and never printed. After each run BrowserBash writes a human-readable `Result.md` next to your test, so a reviewer can read what the agent did in prose without opening NDJSON. If you are new to this format, the worked examples on the [BrowserBash blog](https://browserbash.com/blog) are a good companion.

### Composing larger suites with @import

You do not want one giant file. A common pattern is a `login_test.md` that other tests import, so the login steps live in exactly one place:

```markdown
# Smoke suite

- @import ./login_test.md
- Open the account dashboard
- Verify the welcome banner shows the user's first name
```

When your login form changes, you edit one file. Every test that imports it inherits the fix. This is the natural-language equivalent of a shared fixture, and it is the closest thing the format has to a page object — except it reads like documentation.

## Step 3: The orb-free CircleCI config

Now the config itself. Create `.circleci/config.yml`. We use a Node image (BrowserBash is an npm package), install Chrome via CircleCI's browser-tools approach, install the CLI globally, and run the Markdown test headless in agent mode so the job's pass/fail comes straight from the exit code.

```yaml
version: 2.1

jobs:
  browser-tests:
    docker:
      - image: cimg/node:20.11-browsers
    steps:
      - checkout
      - run:
          name: Install browserbash-cli
          command: npm install -g browserbash-cli
      - run:
          name: Run natural-language browser tests
          command: |
            browserbash testmd run .browserbash/tests/checkout_test.md \
              --agent --headless --timeout 180 \
              --var baseUrl="$BASE_URL" \
              --var user="$TEST_USER" \
              --secret password="$TEST_PASSWORD" \
              > run.ndjson
      - store_artifacts:
          path: run.ndjson
          destination: browserbash-run

workflows:
  test:
    jobs:
      - browser-tests
```

A few details worth understanding rather than copy-pasting blindly:

- `cimg/node:20.11-browsers` is CircleCI's convenience image that ships with Chrome already installed, so you skip a separate browser-install step. That is the single biggest setup simplification versus standing up a grid.
- `--agent` emits NDJSON (one JSON event per line) on stdout. This is the machine interface: stable schema, one event per step, no prose to parse. We redirect it to `run.ndjson` and archive it as an artifact.
- `--headless` is non-negotiable in CI — there is no display.
- `--timeout 180` caps the run at 180 seconds so a stuck flow fails fast instead of eating your CircleCI minutes.
- `--secret password=...` marks the password as secret, so it shows as `*****` in logs. `--var` is for non-sensitive values.

The model is resolved from environment variables you set in project settings (for example `OPENROUTER_API_KEY`). Nothing about the key appears in the config.

## Step 4: Let the exit code be the verdict

This is where the grid-free approach pays off operationally. BrowserBash's agent mode is built for CI and AI coding agents — there is no prose to grep. The exit code carries the result:

- `0` — passed
- `1` — failed (the objective or a verify step did not hold)
- `2` — error (infrastructure or agent problem)
- `3` — timeout

CircleCI fails the job automatically on any non-zero exit, so the basic config already does the right thing. But the granularity lets you be smarter. A `1` is a product signal — a human should look, and auto-retrying it just trains your team to ignore red. A `2` or `3` is an environment signal worth one retry before failing the build:

```bash
browserbash testmd run .browserbash/tests/checkout_test.md \
  --agent --headless --timeout 180 \
  --var baseUrl="$BASE_URL" --secret password="$TEST_PASSWORD" > run.ndjson
code=$?
if [ "$code" -eq 2 ] || [ "$code" -eq 3 ]; then
  echo "infra-flavored exit ($code) - retrying once" >&2
  browserbash testmd run .browserbash/tests/checkout_test.md \
    --agent --headless --timeout 180 \
    --var baseUrl="$BASE_URL" --secret password="$TEST_PASSWORD" > run.ndjson
  code=$?
fi
exit $code
```

Drop that into a shell script in your repo and call it from the `command` block. You now retry only the failures that deserve a retry, and you never silently swallow a real product bug. Compare that to a grid setup where a flaky node and a real failure can look identical in the reporter — the exit-code contract removes that ambiguity.

## Step 5: Upload run history to the free dashboard

Local NDJSON artifacts are fine for debugging, but they are awkward for trend-watching. Did checkout get slower this week? Which run actually recorded the failure? BrowserBash has an optional, strictly opt-in cloud dashboard with run history, video recordings, and per-run replay. It is free, and free uploaded runs are kept for 15 days.

You opt in with `browserbash connect` (once, to associate the machine) and then add `--upload` to the run. In CI you authenticate via an environment variable rather than an interactive login. The flow looks like this:

```bash
# One-time, interactively on your laptop or via a CI-friendly token:
browserbash connect

# In the CircleCI job, add --upload (and --record for video):
browserbash testmd run .browserbash/tests/checkout_test.md \
  --agent --headless --record --upload --timeout 180 \
  --var baseUrl="$BASE_URL" --secret password="$TEST_PASSWORD"
```

`--record` captures a screenshot plus a full `.webm` session video via ffmpeg, on any engine. When a checkout flow fails at 2 a.m. on the nightly job, you open the dashboard, watch the replay, and see exactly where the agent got stuck — no re-running locally, no guessing from a stack trace. That replay-on-failure loop is the single biggest debugging win over a headless grid run that produces only a log line.

If you would rather keep everything on your own machine, there is also a fully local dashboard: run `browserbash dashboard` and nothing is uploaded anywhere. The cloud option is purely additive. Either way, no account is needed just to run tests — the dashboard is opt-in, and you can compare what each tier includes on the [BrowserBash pricing page](https://browserbash.com/pricing).

### Recording and the builtin engine

BrowserBash ships two engines. The default `stagehand` engine (MIT, by Browserbase) is what most people use. The in-repo `builtin` engine is an Anthropic tool-use loop, and it adds one nice CI artifact: alongside the screenshot and video, it captures a Playwright trace you can open in the trace viewer. If your team already lives in the Playwright ecosystem, that trace file slots right into existing debugging habits. You select it per run, so you can keep `stagehand` as the default and reach for `builtin` only when you want the trace.

## Step 6: Parallelism and caching without a grid

A grid scales by adding nodes. CircleCI scales by adding parallelism over executors, and BrowserBash rides that for free. Split your suite into multiple `*_test.md` files — `checkout_test.md`, `login_test.md`, `search_test.md` — and run them across parallel containers using CircleCI's `parallelism` and `circleci tests split`. Each container installs the CLI once and runs its slice. There is no shared grid to become a bottleneck, and no node pool to size.

Caching is mostly about the npm global install. Because `browserbash-cli` installs globally, the cleanest pattern is to bake it into a small custom Docker image your jobs pull, so you skip the install step entirely on every run. If you would rather not maintain an image, the plain `npm install -g browserbash-cli` step on `cimg/node:*-browsers` is fast enough for most pipelines and keeps the config self-contained. Measure before you optimize — for many teams the install is a rounding error next to the actual browser run.

## Step 7: Keep CI honest about flakiness

Natural-language tests are not magic, and pretending otherwise would be dishonest. An LLM-driven agent introduces a different flakiness profile than a coded test: instead of brittle selectors, you get occasional misreadings of an ambiguous instruction. The fixes are practical.

Write unambiguous steps. "Click the primary checkout button" beats "click checkout" when a page has both a mini-cart and a main checkout. Treat your test prose like a spec for a careful but literal new hire. Second, use a capable enough model for the hardest flows — a long, multi-step checkout is where small local models wobble, so reserve a hosted or 70B-class model for those suites and let trivial smoke checks run on whatever is cheapest. Third, lean on the exit-code distinction so a `2`/`3` retries and a `1` does not, which keeps genuine product failures visible. The [BrowserBash case studies](https://browserbash.com/case-study) show how teams tune this balance in practice.

The honest bottom line: if your application demands frame-perfect, deterministic assertions across thousands of identical iterations, a coded Selenium or Playwright suite is still the better fit, and you should keep it. BrowserBash shines for the broad, UI-churn-heavy end-to-end flows where maintenance — not raw determinism — is the dominant cost.

## When to choose this approach

Reach for natural-language browser testing on CircleCI when:

- Your UI changes often and selector maintenance is eating real engineering hours.
- You want CI browser tests without provisioning or paying for a grid.
- You need readable tests that a PM or new hire can understand and even author.
- You want a $0 model bill (local models) or a tiny one (free hosted models).
- You value replay-on-failure video over re-running flaky tests locally.

Stick with a coded grid-based framework when you need millisecond-deterministic control, exact pixel assertions, massive identical-iteration load tests, or you have an existing, healthy Selenium investment that is not actually costing you maintenance pain. The two approaches also coexist well: many teams run BrowserBash for fast-moving end-to-end journeys and keep a smaller coded suite for the handful of deterministic checks that need it.

## Putting it together

Start small. Wire one `checkout_test.md` into one CircleCI job with `--agent --headless`, let the exit code drive pass/fail, and archive the NDJSON. Once that is green, add `--record --upload` so failures come with video, split into parallel containers as your suite grows, and pick the model tier that matches each flow's difficulty. You will have meaningful end-to-end coverage in CI without a single grid node, driver-version pin, or page-object refactor. The full command reference and source live on [npm](https://www.npmjs.com/package/browserbash-cli) and [GitHub](https://github.com/PramodDutta/browserbash) if you want to go deeper.

## FAQ

### Do I need a CircleCI orb to run BrowserBash?

No. BrowserBash installs with a single `npm install -g browserbash-cli`, so plain shell steps in your `.circleci/config.yml` are enough. Skipping the orb means one fewer third-party dependency to track and an easier security review, with no loss of functionality.

### Does natural-language browser testing on CircleCI cost money for the model?

Not necessarily. BrowserBash is Ollama-first and defaults to free local models, so the model bill can be $0. In CI most teams use a capable hosted model via an environment variable for hard multi-step flows, and OpenRouter even offers genuinely free hosted models. You set the key in CircleCI project settings, never in the config file.

### How does CircleCI know whether the test passed?

The process exit code is the verdict: 0 is passed, 1 is a real failure, 2 is an error, and 3 is a timeout. CircleCI fails the job automatically on any non-zero exit, and you can retry only the infrastructure-flavored 2 and 3 codes while letting genuine 1 failures stay red. There is no log parsing involved.

### Can I see video recordings of CI runs?

Yes. Add `--record` to capture a screenshot and a full `.webm` session video, and `--upload` to send the run to the free opt-in cloud dashboard with per-run replay, where uploaded runs are kept for 15 days. If you prefer to keep everything local, run `browserbash dashboard` instead and nothing leaves your infrastructure.

Natural-language browser testing turns a brittle, grid-heavy CircleCI pipeline into a handful of readable steps and a clean exit code. Install the CLI with `npm install -g browserbash-cli`, point it at a `*_test.md` file, and let the agent drive a real browser — then [sign up](https://browserbash.com/sign-up) for the free dashboard when you want replay and history (an account is entirely optional; the CLI runs fine without one).
