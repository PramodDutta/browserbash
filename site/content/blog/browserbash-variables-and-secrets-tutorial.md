---
title: Variables and masked secrets in BrowserBash tests
description: "Hands-on guide to BrowserBash variables and secrets: use {{variables}} templating and secret-marked vars masked as ***** so credentials never leak."
date: 2026-03-06
category: tutorial
---

By the end of this tutorial you'll know exactly how **BrowserBash variables and secrets** work in a committable markdown test: how to inject values with `{{variables}}` templating, how to mark a variable as a secret so it renders as `*****` in every log line, and how to keep real credentials out of your repo, your terminal scrollback, and the on-disk run store. We'll build a login test from scratch, run it on the free local (Ollama) path, prove the masking actually happens, then wire the same test into CI without leaking a single password character. This is the senior-SDET way to test authenticated flows in plain English — no selectors, no page objects, and no secrets in your logs.

If you've never touched BrowserBash before: it's a free, open-source ([Apache-2.0](https://github.com/PramodDutta/browserbash)) natural-language browser automation CLI from The Testing Academy. You write a plain-English objective, an AI agent drives a real Chrome browser step by step, and you get back a verdict plus structured extracted values. The piece we're focused on today lives in its markdown test format (`*_test.md` files), where each list item is a step, `{{variables}}` get substituted at run time, and any variable you mark as secret is masked everywhere it would otherwise be printed.

## What you'll need

Before the first command, make sure you have the basics in place. Nothing here costs money if you stay on the local model path.

- **Node.js >= 18** — check with `node -v`.
- **Google Chrome** installed — the default `local` provider drives your real Chrome.
- **BrowserBash installed globally:**

```bash
npm install -g browserbash-cli
```

- **A model backend.** The default `auto` resolution prefers a local [Ollama](https://browserbash.com/learn) install (free, no keys, nothing leaves your machine). If you have Ollama running with a mid-size model like `qwen3`, you're set. Otherwise BrowserBash falls back to `ANTHROPIC_API_KEY` (Claude) or `OPENAI_API_KEY` (GPT). We'll use the local path for every example.
- **A site to log into.** Use your own staging app, or a public practice login like `https://practice.expandtesting.com/login` (username `practice`, password `SuperSecretPassword!`). We'll treat that password as a secret even though it's public — the whole point is the habit.

Confirm the install before moving on:

```bash
browserbash --version
```

You should see `1.3.1` (or newer). If the command isn't found, your npm global bin directory probably isn't on your `PATH` — see [Troubleshooting](#troubleshooting).

## Step 1 — Write your first markdown test with a plain variable

Let's start without secrets so you can see `{{variables}}` templating on its own. Create a file called `login_test.md`. The `_test.md` suffix is the convention BrowserBash looks for, and it makes these files greppable and committable.

```bash
touch login_test.md
```

Open it in your editor and add this:

```markdown
# Login smoke test

Variables:
- baseUrl: https://practice.expandtesting.com
- username: practice

Steps:
- Go to {{baseUrl}}/login
- Type {{username}} into the Username field
- Type the password into the Password field
- Click the Login button
- Confirm the page shows a "successfully logged in" message
```

Two things to notice. First, the `Variables:` block defines named values. Second, every step is a plain list item written the way you'd describe it to a teammate — `{{baseUrl}}` and `{{username}}` are placeholders that get swapped for their values before the AI agent ever sees the step. So `Go to {{baseUrl}}/login` becomes `Go to https://practice.expandtesting.com/login` at run time.

Run it:

```bash
browserbash testmd run ./login_test.md
```

Chrome launches, the agent works through each step, and you get a human-readable verdict in the terminal. BrowserBash also writes a `Result.md` next to your test summarizing what happened step by step. Right now the password step is incomplete — we hard-coded nothing for it on purpose. Let's fix that the right way.

## Step 2 — Add a variable and reference it in a step

Templating isn't only for URLs. You substitute any value the same way. Update the `Variables:` block and the password step to pull from a variable:

```markdown
Variables:
- baseUrl: https://practice.expandtesting.com
- username: practice
- password: SuperSecretPassword!

Steps:
- Go to {{baseUrl}}/login
- Type {{username}} into the Username field
- Type {{password}} into the Password field
- Click the Login button
- Confirm the page shows a "successfully logged in" message
```

Run it again:

```bash
browserbash testmd run ./login_test.md
```

This will pass — but stop and look at your terminal output and the generated `Result.md`. The line for the password step reads something like `Type SuperSecretPassword! into the Password field`. Your password is now sitting in plain text in your scrollback, in `Result.md`, and in the on-disk run store at `~/.browserbash/runs`. That's the problem we solve in the next step. Never commit a file in this state.

## Step 3 — Mark the variable as a secret so it masks to *****

This is the headline feature. A secret-marked variable behaves exactly like a normal `{{variable}}` — it's substituted into the step and handed to the browser so the login still works — but it is masked as `*****` in **every log line**: terminal output, `Result.md`, the run store, and agent-mode events. The real value reaches the browser; the printed value never does.

Mark `password` as secret by moving it into a `Secrets:` block:

```markdown
# Login smoke test

Variables:
- baseUrl: https://practice.expandtesting.com
- username: practice

Secrets:
- password: SuperSecretPassword!

Steps:
- Go to {{baseUrl}}/login
- Type {{username}} into the Username field
- Type {{password}} into the Password field
- Click the Login button
- Confirm the page shows a "successfully logged in" message
```

The step text doesn't change at all — you still reference `{{password}}`. The only difference is which block the value lives in. Run it once more:

```bash
browserbash testmd run ./login_test.md
```

Now the password step prints as `Type ***** into the Password field`. The login still succeeds because the agent typed the real value into Chrome; only the *printed* representation is masked. That's the contract: real value in the browser, `*****` in the logs.

### Confirm the mask actually held

Don't take my word for it — verify. Grep the run store and the result file for the raw secret. If masking is working, you get zero hits:

```bash
grep -r "SuperSecretPassword" ~/.browserbash/runs ./Result.md
```

An empty result is the pass condition. If that grep returns nothing, your secret never touched disk in cleartext. This is the check I'd run in a code review before approving any test that handles credentials.

## Step 4 — Keep the real secret out of the file entirely

Marking a variable as a secret stops it leaking into *logs*, but the value is still sitting in cleartext inside `login_test.md` — and that file is meant to be committed. The clean pattern is to keep the secret out of the committed file and supply it from the environment, then let the masking handle the logs.

Reference an environment variable in the `Secrets:` block:

```markdown
Secrets:
- password: ${LOGIN_PASSWORD}
```

Now the committed test contains no real credential — just the name of an env var. Provide the value at run time, scoped to the single command so it doesn't linger in your shell history as an `export`:

```bash
LOGIN_PASSWORD='SuperSecretPassword!' browserbash testmd run ./login_test.md
```

You now have the best of both worlds: the file is safe to commit, the value comes from the environment (or your CI secret store), and the password is still masked to `*****` in every log line because it's in the `Secrets:` block. This is the configuration I'd ship.

## Step 5 — Compose tests with @import and shared variables

Real suites repeat setup: every authenticated test needs the same login. Rather than copy-paste the login steps and re-declare the same secret in ten files, BrowserBash supports `@import` composition. Put the reusable login in one file and import it where needed.

Create `login_steps_test.md`:

```markdown
Secrets:
- password: ${LOGIN_PASSWORD}

Variables:
- baseUrl: https://practice.expandtesting.com
- username: practice

Steps:
- Go to {{baseUrl}}/login
- Type {{username}} into the Username field
- Type {{password}} into the Password field
- Click the Login button
```

Then in a higher-level test, `dashboard_test.md`, import it and add the assertions you care about:

```markdown
# Dashboard loads after login

@import ./login_steps_test.md

Steps:
- Confirm the page shows a "successfully logged in" message
- Confirm there is a "Logout" button visible
```

Run the composed test exactly like any other:

```bash
LOGIN_PASSWORD='SuperSecretPassword!' browserbash testmd run ./dashboard_test.md
```

The imported secret stays masked across the import boundary — `{{password}}` renders as `*****` whether the step lives in the imported file or the importing one. Define the credential once, reuse it everywhere, leak it nowhere.

## Variables and secrets at a glance

Here's the mental model for what each piece does. These are the building blocks of every committable BrowserBash test.

| Concept | Syntax | What it does |
| --- | --- | --- |
| Variable | `Variables:` block + `{{name}}` | Substitutes a plain value into steps at run time. Printed in logs as-is. |
| Secret | `Secrets:` block + `{{name}}` | Same substitution into the browser, but the value is masked as `*****` in every log line, `Result.md`, and the run store. |
| Env-sourced value | `${ENV_VAR}` in a block | Pulls the value from an environment variable so the committed file holds no cleartext. |
| Import | `@import ./other_test.md` | Composes a test from another file; variables and secrets carry across the boundary. |
| Run a markdown test | `browserbash testmd run ./file_test.md` | Executes the steps, writes `Result.md`, stores the run (secrets masked). |

A few flags that matter when you run these tests. They apply to both `run` and the runs that `testmd run` performs under the hood:

| Flag | Purpose |
| --- | --- |
| `--model <id>` | Pin the LLM backend, e.g. `ollama/qwen3`, instead of `auto`. |
| `--headless` | Run Chrome without a visible window (good for CI). |
| `--timeout <seconds>` | Cap how long a run may take before it returns a `timeout` verdict. |
| `--record` | Capture a screenshot plus a `.webm` session video (builtin engine also writes a Playwright trace). |
| `--agent` | Emit NDJSON, one JSON object per line — secrets stay masked in these events too. |
| `--dashboard` | Open the free local dashboard for this run at `localhost:4477`. |
| `--upload` | Push this run to the cloud (requires `browserbash connect` first). Off by default — without it, nothing leaves your machine. |

## Step 6 — Verify masking in agent (NDJSON) mode for CI

When you wire BrowserBash into CI or hand it to an AI coding agent, you'll use `--agent`, which emits NDJSON instead of prose. The masking guarantee holds here too — secrets are `*****` in the structured events, so your CI logs and any captured artifacts stay clean. Run your markdown test with the flag passed through:

```bash
LOGIN_PASSWORD='SuperSecretPassword!' browserbash testmd run ./dashboard_test.md --agent --headless
```

You'll get one JSON object per line. A passing run looks roughly like this — note the password step's `remark` shows `*****`, not the real value:

```text
{"type":"step","step":3,"status":"passed","action":"type","remark":"Typed ***** into the Password field"}
{"type":"step","step":4,"status":"passed","action":"click","remark":"Clicked the Login button"}
{"type":"run_end","status":"passed","summary":"Dashboard loaded after login","final_state":{},"duration_ms":18420}
```

The terminal `run_end` event carries the overall status, and the process exit code mirrors it: `0` passed, `1` failed, `2` error, `3` timeout. That's all your pipeline needs to gate a deploy — no prose parsing, no secrets in the build log. Pipe the stream to a file or `jq` and your masked credentials never surface.

```bash
LOGIN_PASSWORD='SuperSecretPassword!' browserbash testmd run ./dashboard_test.md --agent --headless > run.ndjson
echo "exit code: $?"
```

## Troubleshooting

Here are the failure modes you'll actually hit, and how to clear them.

**The secret still shows in cleartext in my logs.** Almost always the value is defined under `Variables:` instead of `Secrets:`. Only the `Secrets:` block triggers masking. Move it, re-run, and confirm with `grep -r "yourSecret" ~/.browserbash/runs` — an empty result means it's masked. Also double-check you didn't accidentally hard-code the password directly into a step instead of referencing `{{password}}`; literal text in a step is printed verbatim.

**A small local model keeps failing the multi-step login.** Very small local models (8B and under) are flaky on long multi-step objectives — they lose the thread halfway through a login-then-assert flow. The sweet spot is a mid-size local model like Qwen3 or a Llama 3.3 70B-class model, or a capable hosted model for the hardest flows. Pin one explicitly with `--model ollama/qwen3` (or set `ANTHROPIC_API_KEY` and let `auto` resolve to Claude) rather than relying on whatever tiny model `auto` found first.

**`--record` errors about ffmpeg.** The session video relies on bundled ffmpeg. If recording fails on your machine, drop `--record` to confirm the test itself passes, then check that your environment can run the bundled binary. You don't need `--record` to verify masking — the `grep` check in Step 3 is enough.

**The run returns a `timeout` verdict (exit code 3).** The login flow took longer than the default budget, common on slow staging environments or under-powered local models. Raise the ceiling with `--timeout 120` to give the agent two minutes, and run `--headless` in CI so rendering overhead doesn't eat into the budget.

**`browserbash: command not found` after install.** The global npm bin directory isn't on your `PATH`. Run `npm bin -g` to find it and add that directory to your shell profile, or reinstall with `npm install -g browserbash-cli` and restart your terminal. Confirm with `browserbash --version`.

**My env var isn't being picked up.** `${LOGIN_PASSWORD}` resolves from the environment of the process running the test. If you set it in a different shell, or used a regular `export` that a fresh CI shell doesn't inherit, the value will be empty and the login fails. Scope it to the command (`LOGIN_PASSWORD='...' browserbash testmd run ...`) or set it in your CI secret store so the runner injects it.

## When to use this

Reach for variables and secrets the moment a test needs a credential, an environment-specific URL, or any value you'd rather not hard-code — which is to say, almost every authenticated test. Plain `{{variables}}` keep one test file working across staging and prod; `Secrets:` keep passwords, API tokens, and OTP seeds out of your logs and your repo.

From here, a few natural next steps:

- Wire the `--agent` NDJSON output into a pipeline — the [agent mode write-ups on the blog](https://browserbash.com/blog) walk through parsing `run_end` and exit codes.
- Browse the full library of step-by-step guides on [BrowserBash tutorials](https://browserbash.com/tutorials).
- Get grounded on engines, providers, and models on the [learn](https://browserbash.com/learn) page before you scale to a multi-provider setup.
- See what else the CLI does on the [features](https://browserbash.com/features) page, including `--record` and the local dashboard.

## FAQ

### How do I hide a password in a BrowserBash test?

Put the value in a `Secrets:` block in your markdown test instead of the `Variables:` block, then reference it in a step with `{{password}}`. BrowserBash substitutes the real value into the browser so the login still works, but masks it as `*****` in every log line, in the `Result.md` it writes, and in the on-disk run store. For extra safety, source the value from an environment variable with `${ENV_VAR}` so the committed file holds no cleartext at all.

### What's the difference between a variable and a secret in BrowserBash?

A variable defined under `Variables:` is substituted into your steps and printed in logs exactly as written — good for non-sensitive things like base URLs and usernames. A secret defined under `Secrets:` is substituted into the browser the same way, but its printed representation is masked to `*****` everywhere it would otherwise appear. Both use the same `{{name}}` templating syntax in steps; only the block they live in differs.

### Are masked secrets safe in the BrowserBash run store?

Yes. Every run is kept on disk at `~/.browserbash/runs` with secrets masked, and the store is capped at 200 runs. The masking applies to the stored run record the same way it applies to terminal output and `Result.md`, so a value you marked as secret never lands there in cleartext. You can verify it yourself by grepping the run store for the raw value and confirming zero hits.

### Does anything leave my machine when I use secrets?

No, not unless you opt in. On the default local provider with a local Ollama model, the browser runs on your machine and nothing is uploaded — your model bill is $0 and your secrets stay local. A run is only sent to the cloud if you first run `browserbash connect` and then pass `--upload` on that specific run; without `--upload`, nothing leaves your machine, and even uploaded runs keep secrets masked.

Ready to test authenticated flows without leaking a single password? Install it and write your first secret-safe test:

```bash
npm install -g browserbash-cli
```

An account is optional — you can run everything above fully locally. When you want the cloud dashboard, [sign up here](https://browserbash.com/sign-up).
