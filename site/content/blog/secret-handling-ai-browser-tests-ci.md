---
title: Secret Handling for AI Browser Tests in CI: 2026 Guide
description: "A security-first guide to secrets in ci browser testing: pass credentials as masked {{variables}} and map them to GitHub, GitLab, and Jenkins stores."
date: 2026-04-11
category: security
---

The fastest way to leak a production password is to run a browser test in CI without thinking about secrets first. Handling secrets in CI browser testing is its own discipline, separate from writing the test itself, and it is the part most teams skip until an audit or a public log forces the issue. This guide is the security-focused version of that conversation: how to feed credentials into an AI-driven browser test without those credentials ending up in your build logs, your dashboard output, or a screenshot artifact that lives in object storage for the next 90 days.

I'll use BrowserBash as the concrete runner because its `{{variables}}` templating and secret masking were designed for exactly this problem, and then map the pattern onto the three CI secret stores most readers actually use: GitHub Actions encrypted secrets, GitLab CI/CD variables, and Jenkins credentials. Where a platform behaves in a version-specific or non-obvious way, I'll flag it rather than pretend every runner is identical.

## Why secrets in CI browser testing are uniquely risky

Most CI jobs that touch secrets — deploying a container, calling an API, signing an artifact — hand the secret to a single process that uses it once and discards it. A browser test is different. It takes a credential and types it, character by character, into a live web page. That credential now has more places to escape than a normal job, and each one is easy to miss.

Think about the surfaces. The agent that drives the browser logs its reasoning ("filling the password field with..."). The browser itself can echo form values into console logs or network traces. A screenshot taken at the wrong moment captures a half-filled login form. A session video records the keystrokes. And if your run uploads to a dashboard for later replay, every one of those artifacts travels off the build machine. A traditional Selenium suite has the same exposure, but teams have spent years building muscle memory around it. AI browser tests are new enough that the muscle memory doesn't exist yet, and the natural-language interface tempts people to paste a real password straight into an objective string. That string then shows up verbatim in the job log.

So the goal of good secret handling in CI browser testing is narrow and specific: the secret value should exist in exactly two places — the CI platform's encrypted store, and the live process's memory for the moment it types the field — and **nowhere** in any durable text or media artifact. Everything below is in service of that one rule.

### The three exposure points to design around

Before any tooling, it helps to name the three places a credential leaks in practice, because every mitigation maps back to one of them:

1. **The objective or test definition.** If you write the password directly into the command or the test file, it's in your shell history, your git diff, and the CI log the moment the step starts.
2. **The runtime logs.** The agent narrates what it's doing, and the browser engine emits its own diagnostics. Either can echo a value you fed it.
3. **The artifacts.** Screenshots, `.webm` session videos, and uploaded dashboard runs persist long after the job ends and are often readable by more people than the CI logs are.

A real solution has an answer for all three. Masking the logs but leaving the password in a committed test file solves nothing.

## How BrowserBash handles secrets: masked {{variables}}

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command a plain-English objective, and an AI agent drives a real Chrome or Chromium browser through it before returning a verdict plus structured results. No selectors, no page objects. The relevant feature for this article is its Markdown test format and its `{{variables}}` templating with explicit secret marking.

A Markdown test is a committable `*_test.md` file where each list item is a single step. You can compose files with `@import` and parameterize them with `{{variables}}`. The security property that matters: a variable you mark as secret is masked as `*****` in every log line the tool emits. The credential flows from your CI secret store into the variable at runtime, gets typed into the page, and never appears as plaintext in the run log or the human-readable `Result.md` that BrowserBash writes after each run.

Here's the shape of a login-and-checkout test that keeps the password out of every durable surface:

```bash
# Mark the password as a secret so it's masked as ***** in logs
browserbash testmd run ./checkout_test.md \
  --var USERNAME="$STORE_USER" \
  --secret PASSWORD="$STORE_PASS" \
  --agent \
  --record
```

The `--var` flag injects a normal templated value; `--secret` injects one that gets masked everywhere the tool prints. Inside `checkout_test.md`, you reference them with the same `{{VARIABLE}}` syntax — the test file itself never contains a real credential, which means it's safe to commit:

```markdown
# Checkout smoke test

- Go to https://shop.example.com/login
- Type {{USERNAME}} into the email field
- Type {{PASSWORD}} into the password field
- Click "Sign in"
- Add the first product to the cart
- Complete checkout
- Verify the page shows "Thank you for your order!"
```

Because the value of `PASSWORD` arrives from an environment variable that your CI platform populated from its encrypted store, the plaintext exists only in the runner's memory for the lifetime of the job. The committed file is a template. The log shows `*****`. That's the whole pattern, and the rest of this guide is just mapping `$STORE_PASS` to where each CI platform actually keeps it.

### Why the agent-mode and exit-code design helps security

Two other BrowserBash features quietly improve your secret posture. First, `--agent` mode emits NDJSON — one structured JSON event per line on stdout — instead of free-form prose. Structured output is easier to scrub and audit than narrative text, because you control which fields you log downstream and you're not regex-hunting through paragraphs for a leaked token. Second, the disciplined exit codes (0 passed, 1 failed, 2 error, 3 timeout) mean your pipeline decides pass/fail from a number, not from grepping the log for a success string. You never have to print or parse sensitive output to make a build decision, which removes a whole category of accidental logging.

## Mapping {{variables}} to GitHub Actions secrets

GitHub Actions stores encrypted secrets at the repository, environment, or organization level. They're encrypted at rest, decrypted only inside the runner, and GitHub automatically redacts any registered secret value that appears in logs — a useful backstop, though you should never rely on it as your only defense, because redaction only matches exact string values and misses transformed ones (base64-encoded, URL-escaped, split across lines).

The flow is straightforward. Define `STORE_USER` and `STORE_PASS` under **Settings → Secrets and variables → Actions**, then surface them as environment variables in the step that runs the test:

```yaml
name: e2e-browser
on: [push]
jobs:
  checkout-flow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g browserbash-cli
      - name: Run masked browser test
        env:
          STORE_USER: ${{ secrets.STORE_USER }}
          STORE_PASS: ${{ secrets.STORE_PASS }}
        run: |
          browserbash testmd run ./checkout_test.md \
            --var USERNAME="$STORE_USER" \
            --secret PASSWORD="$STORE_PASS" \
            --agent
```

A few security details that bite people. Use the `env:` block scoped to the step rather than passing secrets as inline command arguments, because arguments can land in process listings and some logging modes echo the full command line. Prefer GitHub **environment** secrets over repository secrets for production credentials so you can attach required reviewers and branch protection — that turns "anyone who can push can read prod creds via a workflow" into a gated action. And remember that pull requests from forks do not receive your secrets by default; that's a feature, not a bug, because it stops a malicious PR from exfiltrating them. If you need login tests on PRs, run them against a staging account with throwaway credentials, which is good hygiene regardless.

For deeper command patterns and the full flag reference, the [BrowserBash learn pages](https://browserbash.com/learn) walk through `testmd` and the variable system step by step.

## Mapping {{variables}} to GitLab CI/CD variables

GitLab keeps secrets as CI/CD variables defined under **Settings → CI/CD → Variables**, at the project, group, or instance level. Two checkboxes there are your security controls and you should understand both before storing a password.

**Masked** tells GitLab to replace the value with `[masked]` in job logs. It only works if the value meets GitLab's masking rules (a minimum length and a restricted character set as of 2026 — short or symbol-heavy secrets may be rejected as un-maskable), so generate credentials that satisfy them. **Protected** restricts the variable to pipelines running on protected branches and tags, which keeps production secrets out of feature-branch pipelines. For a real login credential you usually want both checked.

The mapping into a BrowserBash run looks like this:

```yaml
checkout-flow:
  image: node:20
  script:
    - npm install -g browserbash-cli
    - >
      browserbash testmd run ./checkout_test.md
      --var USERNAME="$STORE_USER"
      --secret PASSWORD="$STORE_PASS"
      --agent
```

Here `$STORE_USER` and `$STORE_PASS` are the variable keys you defined in the GitLab UI; the runner injects them into the job environment automatically. Note that GitLab's own masking and BrowserBash's `--secret` masking are independent layers — the platform scrubs its log view, and the tool scrubs its own emitted output. Defense in depth is exactly what you want here, because the two masks cover different surfaces and neither is a single point of failure. If you run your own GitLab Runner rather than shared runners, also confirm that job artifacts and the runner's local cache aren't persisting anything sensitive between jobs; a self-hosted runner with a dirty cache is a classic slow leak.

## Mapping {{variables}} to Jenkins credentials

Jenkins handles secrets through its Credentials plugin, which stores them encrypted and exposes them to a pipeline via the `withCredentials` block. The block binds a stored credential to an environment variable for a limited scope, and Jenkins masks the bound value in the console log automatically. That scoping is the security win: the secret only exists in the environment for the lines inside the block, not for the whole build.

A declarative `Jenkinsfile` stage that runs a masked browser test:

```groovy
pipeline {
  agent any
  stages {
    stage('Browser test') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'store-login',
          usernameVariable: 'STORE_USER',
          passwordVariable: 'STORE_PASS')]) {
          sh '''
            npm install -g browserbash-cli
            browserbash testmd run ./checkout_test.md \
              --var USERNAME="$STORE_USER" \
              --secret PASSWORD="$STORE_PASS" \
              --agent
          '''
        }
      }
    }
  }
}
```

The `usernamePassword` binding type is a natural fit for login tests because it surfaces both halves of the credential at once. Two cautions specific to Jenkins. First, its console masking matches the exact secret string, so if your test transforms the value (encodes it, concatenates it) the masking can miss the transformed form — another reason to lean on BrowserBash's own `--secret` masking rather than the platform's alone. Second, be careful with `set -x` or verbose shell tracing inside the `sh` step; trace output prints expanded commands and can blow straight past masking. Keep the shell quiet. If you're standing up the whole pipeline from scratch, the companion walkthrough on [AI browser tests in a Jenkins pipeline](https://browserbash.com/blog) covers the stage structure and artifact handling in more depth.

## A side-by-side of the three platforms

The mechanics differ but the model is identical: the platform stores the secret encrypted, injects it as an environment variable for a scoped step, and BrowserBash's `--secret` flag masks it in the tool's own output on top of whatever the platform masks in its logs.

| Concern | GitHub Actions | GitLab CI/CD | Jenkins |
| --- | --- | --- | --- |
| Where secrets live | Encrypted secrets (repo / env / org) | CI/CD variables (project / group / instance) | Credentials plugin store |
| Injection mechanism | `env:` block with `${{ secrets.X }}` | Variable keys auto-injected into job env | `withCredentials` binding |
| Platform-side log masking | Auto-redacts exact registered values | "Masked" checkbox (rules apply) | Auto-masks bound credential values |
| Scope control | Environment + required reviewers | "Protected" branches/tags | Block-scoped to `withCredentials` |
| Fork/branch protection | No secrets to fork PRs by default | Protected vars skip unprotected branches | Folder/job-level credential scoping |
| BrowserBash masking | `--secret` masks tool output `*****` | `--secret` masks tool output `*****` | `--secret` masks tool output `*****` |

The bottom row is the constant. Whatever platform you're on, marking the variable as a secret in BrowserBash gives you a second, tool-owned mask that covers the agent's narration and the `Result.md` file — surfaces the CI platform never sees because they're produced inside the tool, not by the runner's shell.

## Artifacts: the leak nobody checks until it's too late

Logs get attention because everyone reads them. Artifacts are where secrets actually survive, because they outlive the job and are shared more widely. If you use `--record`, BrowserBash captures a screenshot and a full `.webm` session video; on the builtin engine it also captures a Playwright trace. Those are fantastic for debugging a flaky checkout and dangerous if they catch a credential.

Masked `{{variables}}` protect your text logs, but they do not retroactively blur pixels in a video or a screenshot. If the agent types into a password field, most sites mask it to dots client-side, but not all do, and a username or a one-time code can sit in plain view. Treat recorded media as sensitive by default. Concretely: gate `--record` behind a condition so you only capture video on failure, store artifacts in access-controlled locations with short retention, and never attach raw session videos to a public issue tracker. The same goes for the optional cloud dashboard.

### The dashboard is opt-in, and that matters

BrowserBash needs no account to run, and uploading to the cloud dashboard is strictly opt-in via `browserbash connect` plus an explicit `--upload` flag. Nothing leaves your machine unless you ask it to. There's also a fully local option — `browserbash dashboard` — that gives you run history and replay without anything crossing the network, which is the right default for any flow touching real credentials.

If you do upload, free runs are retained for 15 days, so a captured artifact has a bounded life rather than living forever. Still, apply the same rule: upload runs from staging environments with disposable credentials, and keep production-credentialed runs local. The opt-in design means the secure choice is also the default choice — you have to deliberately add `--upload` to send anything anywhere.

```bash
# Local-only: nothing leaves the machine, video captured for debugging
browserbash testmd run ./checkout_test.md \
  --secret PASSWORD="$STORE_PASS" \
  --record \
  --headless

# Opt-in upload (only for staging/disposable creds)
browserbash testmd run ./staging_test.md \
  --secret PASSWORD="$STAGING_PASS" \
  --record \
  --upload
```

## The model decision is also a secrecy decision

Where the AI inference runs is a security choice, not just a cost one, and it deserves a paragraph of its own because it surprises people. BrowserBash is Ollama-first: by default it uses free local models, so no API keys are needed and nothing — including the text of your objective — leaves your machine. It auto-resolves a provider in order: local Ollama, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY`. It also supports OpenRouter, including genuinely free hosted models such as `openai/gpt-oss-120b:free`, and Anthropic Claude if you bring your own key.

For secret-sensitive flows this matters because a hosted model sees the page content the agent reasons over. If a login page or a post-login screen contains sensitive data, that context is sent to whoever hosts the model. Running locally keeps everything on the build machine and gives you a guaranteed $0 model bill as a bonus. The honest caveat: very small local models (roughly 8B and under) can get flaky on long multi-step objectives like a full checkout. The sweet spot is a mid-size local model in the Qwen3 or Llama 3.3 70B class, or a capable hosted model for the genuinely hard flows — with the understanding that the hosted route trades some data locality for reliability. For credentialed production tests, I lean local and accept a slightly higher model spec on the runner.

## When to choose which approach

No single configuration is right for every team, so here's how I'd decide.

**Choose fully local (local Ollama + `browserbash dashboard`, no upload) when** you're testing flows that touch real production credentials or regulated data, or when policy forbids third-party model providers seeing your screens. You give up nothing on functionality and you keep every artifact and every prompt on hardware you control. This is the default I'd reach for in fintech, healthcare, or any internal tool with real customer data behind the login.

**Choose hosted models with masked secrets when** your test targets a staging environment with disposable credentials and you need the extra reliability of a frontier model on a long, fiddly objective. The credential is throwaway, the data is synthetic, and the masking still keeps it out of logs — so the blast radius of any leak is near zero.

**Choose the cloud dashboard with `--upload` when** you want shareable replay videos for a team debugging session and the run used staging credentials. The 15-day retention bounds your exposure, and the opt-in flag means you're making a deliberate, reviewable decision each time rather than uploading by accident.

The thing not to do, on any platform: paste a real password into an objective string, run it without `--secret`, and ship the artifact to a place more people can read than should. Everything in this guide exists to make that mistake hard. If you're comparing tools, the honest take is that any mature browser-testing tool can be made secure with discipline; BrowserBash just makes the secure path the short one. You can see how the pieces fit on the [features page](https://browserbash.com/features), and the [pricing page](https://browserbash.com/pricing) lays out what the free tier and optional dashboard actually include.

## A pre-flight security checklist

Before you merge a CI job that runs a credentialed browser test, walk this list:

- Credentials live only in the platform's encrypted store, never in a committed file or inline argument.
- The test file uses `{{variables}}` and is safe to commit because it contains no real values.
- Every credential variable is passed with `--secret`, not `--var`, so it's masked as `*****`.
- The CI platform's own masking (GitHub redaction, GitLab "Masked", Jenkins binding) is enabled as a second layer.
- Production credentials are scoped to protected branches / gated environments, not feature branches or fork PRs.
- `--record` is gated to failure-only or staging-only, and artifacts have short retention and access control.
- Uploads (`--upload`) are reserved for staging runs with disposable credentials; production runs stay local.
- The model runs locally for any flow whose screens contain sensitive data.

If you can check all eight, your handling of secrets in CI browser testing is in good shape, and you've closed all three exposure points — definition, logs, and artifacts — rather than just the obvious one. Real-world examples of these flows are written up in the [BrowserBash case studies](https://browserbash.com/case-study).

## FAQ

### How do I keep passwords out of CI logs in browser tests?

Store the password in your CI platform's encrypted secret store, inject it into the test as a variable, and mark that variable as a secret so the tool masks it. In BrowserBash you pass it with the `--secret` flag, which renders the value as `*****` in every log line and in the generated `Result.md`. Layer the platform's own log masking on top, and never write the real password into a committed test file or an inline command argument.

### Does masking a variable also hide it in screenshots and videos?

No, and this is the most common misunderstanding. Masking covers text logs and the tool's own output, but it cannot blur pixels in a screenshot or a `.webm` session video after the fact. Most websites mask password fields client-side, but usernames and one-time codes can still be visible, so treat recorded artifacts as sensitive, gate `--record` to failure-only runs, and keep retention short with access control.

### Is it safe to use a hosted AI model for credentialed tests?

It depends on what your screens contain. A hosted model sees the page content the agent reasons over, so if a post-login page shows sensitive data, that context leaves your machine. For production credentials and regulated data, run a local model so nothing crosses the network. Reserve hosted models for staging environments with disposable credentials, where the reliability gain outweighs the data-locality tradeoff.

### What's the difference between --var and --secret in BrowserBash?

Both inject a value into a `{{variable}}` in your Markdown test, but `--var` passes a normal templated value that appears in logs, while `--secret` passes one that is masked as `*****` everywhere the tool prints. Use `--var` for non-sensitive data like a base URL or a product name, and `--secret` for anything you'd be unhappy to see in a build log — passwords, tokens, API keys, or one-time codes.

Ready to run a credentialed browser test without leaking the credential? Install with `npm install -g browserbash-cli`, write a `*_test.md` file that references `{{variables}}`, and pass your password with `--secret`. No account is required to run locally — and if you later want shareable replay for staging runs, you can opt in at [browserbash.com/sign-up](https://browserbash.com/sign-up).
