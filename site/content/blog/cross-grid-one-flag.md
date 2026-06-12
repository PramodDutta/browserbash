---
title: Local Chrome to Cloud Grids by Changing One Flag
description: How an agency QA team runs one markdown suite on local Chrome in dev and on LambdaTest or BrowserStack grids in CI by changing only --provider.
date: 2026-06-12
category: ci
---

Every test suite eventually gets married to its infrastructure. The assertions are portable in theory, but the capability files, vendor SDKs, and tunnel scripts pile up until "run it somewhere else" becomes a sprint of its own. BrowserBash takes a different position: a test is plain English in a markdown file, and where the browser runs is a runtime decision. This post walks through how an agency team can run the exact same suite on local Chrome during development and on LambdaTest or BrowserStack in CI — changing nothing but a `--provider` flag.

## An illustrative agency, two grids, one suite

The team in this story is illustrative — a composite of how small-agency QA setups commonly look — but every command is real and runnable. Picture a six-person web agency with one QA lead and a dozen client projects. Three constraints pull in different directions:

- Client A's contract requires test evidence from BrowserStack Automate sessions.
- Client B arrived with a prepaid LambdaTest plan the team is expected to use.
- The developers iterate locally and will not queue on a cloud grid to check a login form.

The old answer was three slightly different configs and a capabilities file nobody dared touch. The new answer is a folder of `*_test.md` files that do not know or care where the browser lives.

## The suite is just markdown

```markdown
# Checkout smoke

- Open {{base_url}}
- Log in as {{username}} with password {{password}}
- Add the Sauce Labs Backpack to the cart
- Go to checkout and fill first name 'Bo', last name 'Basher', postal code '94016'
- Finish the order
- Verify the page says 'Thank you for your order!'
```

Each list item is one verified step. The `{{placeholders}}` are substituted from JSON files in `./.browserbash/variables/` (project) or `~/.browserbash/variables/` (global), so dev and CI can point at different environments without touching the test. Mark the password `{"value":"...","secret":true}` and it appears as `*****` in every log and NDJSON line.

## Same file, three targets

```bash
# Dev laptop: local Chrome, default provider, watch it run
browserbash testmd run .browserbash/tests/checkout_test.md

# CI for client B: LambdaTest grid
browserbash testmd run .browserbash/tests/checkout_test.md --provider lambdatest --headless

# CI for client A: BrowserStack Automate
browserbash testmd run .browserbash/tests/checkout_test.md --provider browserstack --headless
```

That is the entire migration story. No test edits, no capability blocks. After every run a `Result.md` report is written next to the test file, and the process exit code is the verdict: `0` passed, `1` failed, `2` error, `3` timeout.

## What flips under the hood

Locally, BrowserBash uses its default engine, Stagehand — the MIT-licensed AI browser automation framework from Browserbase. Stagehand cannot attach to LambdaTest or BrowserStack sessions, so the moment you pass `--provider lambdatest` or `--provider browserstack`, BrowserBash automatically switches to its builtin engine: an Anthropic tool-use loop driving Playwright. You never pass `--engine builtin` yourself; the switch is automatic.

One practical consequence: the builtin engine speaks the Anthropic API, so grid runs need `ANTHROPIC_API_KEY` set — or `ANTHROPIC_BASE_URL` pointed at any Anthropic-compatible gateway, such as a LiteLLM proxy fronting local models.

The grids stay in the loop, too. BrowserBash reports the verdict back to the vendor (LambdaTest test status, BrowserStack session status), and the final `run_end` event includes a `test_url` linking straight to the build in the vendor dashboard — exactly the evidence client A's contract asks for.

## Credentials once, with login

```bash
browserbash login --provider lambdatest --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY"
browserbash login --provider browserstack --username "$BROWSERSTACK_USERNAME" --access-key "$BROWSERSTACK_ACCESS_KEY"
browserbash whoami
```

`login` stores credentials in `~/.browserbash/config.json`, `whoami` lists the stored accounts, and `browserbash logout --provider <id>` removes them. In CI you can skip `login` entirely and rely on env vars (`LT_USERNAME`/`LT_ACCESS_KEY`, `BROWSERSTACK_USERNAME`/`BROWSERSTACK_ACCESS_KEY`). Precedence is flags > env vars > config defaults, so a one-off `--provider` always wins. If most runs target one grid, pin it once with `browserbash config set defaultProvider lambdatest`, and run `browserbash providers` to see every available target.

## The CI wiring

```yaml
- run: npm install -g browserbash-cli
- run: |
    browserbash login --provider lambdatest --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY"
    browserbash testmd run .browserbash/tests/checkout_test.md --provider lambdatest --agent --headless --timeout 180
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    LT_USERNAME: ${{ secrets.LT_USERNAME }}
    LT_ACCESS_KEY: ${{ secrets.LT_ACCESS_KEY }}
```

`--agent` switches stdout to NDJSON for clean build logs, and the exit code fails the job exactly when the test fails — no output parsing. In the illustrative setup, the agency's nightly pipeline runs nine markdown files twice, once per grid, by looping the same command with two `--provider` values. When client A asked mid-project for proof on real BrowserStack sessions, the change was one word in the pipeline — minutes, not a sprint.

## FAQ

### Do I need different test files for different providers?

No. The markdown never references a provider. Point `{{base_url}}` and credentials at the right environment with variables files, and choose the grid at run time with `--provider`. The same file runs on local Chrome, LambdaTest, and BrowserStack unchanged.

### Why do grid runs need an Anthropic key when local runs don't?

Local runs use the default Stagehand engine, and the default `auto` model resolution prefers a local Ollama model — free, open source, no keys. LambdaTest and BrowserStack force the builtin engine, which speaks the Anthropic API, so set `ANTHROPIC_API_KEY` or route through an Anthropic-compatible gateway with `ANTHROPIC_BASE_URL`.

### Where do stored credentials live, and what wins when both are present?

`browserbash login` writes them to `~/.browserbash/config.json` (access keys are redacted when you run `browserbash config show`). Resolution order is flags > env vars > config defaults, so CI env vars override stored defaults, and explicit flags override everything.
