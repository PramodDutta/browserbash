---
title: Keep Passwords Out of Test Logs with secret:true
description: A fintech QA team passes credentials via {{vars}} with secret:true — auditors grep 90 days of logs and find only *****. Files, precedence, guarantees.
date: 2026-06-12
category: security
---

Test logs outlive test runs. They get shipped to log aggregators, retained for compliance, attached to tickets, and — eventually — read by auditors. Which is exactly when a staging password pasted into a CI log three months ago stops being a shortcut and becomes a finding. This post shows how BrowserBash keeps credentials out of every log line it produces, told through an illustrative fintech scenario — a composite of common audit-prep situations, not a real customer account. The commands are real and runnable.

## An audit-prep story (illustrative)

Picture the QA lead at a small lending fintech, eight weeks out from a SOC 2 Type II audit. As part of readiness, the security engineer greps 90 days of retained CI logs for the staging admin password. It appears 14 times: echoed shell commands, a verbose test runner, one debug dump somebody forgot to remove. Nothing malicious — and every single occurrence is a finding. The remediation plan has two halves: rotate the credentials, and make recurrence structurally impossible in the test stack.

The second half is where BrowserBash's variables system comes in.

## Step 1: credentials become {{variables}}

Objective text shows up in logs and events, so the documented rule is absolute: never inline credentials in the objective — always pass them through `{{vars}}`. BrowserBash substitutes `{{key}}` placeholders at run time, in both one-shot objectives and `*_test.md` steps:

```bash
browserbash run "Log in to {{base_url}} as {{username}} with password {{password}}" \
  --variables '{"base_url":"https://app.example.com","username":"qa@example.com","password":{"value":"hunter2","secret":true}}'
```

The password is wrapped as `{"value": "...", "secret": true}`. Values marked secret are masked as `*****` in all logs and NDJSON output. What the log actually shows:

```text
Type ***** into the password field
```

## Step 2: four variable layers, one precedence rule

Variables load from four places, highest priority last:

1. Global: `~/.browserbash/variables/*.json`
2. Project: `./.browserbash/variables/*.json`
3. `--variables-file <path>`
4. `--variables '<json>'`

The fintech team splits them deliberately:

- **Project directory (committed):** non-secret defaults — `base_url`, seeded customer names. Reviewable and shareable, with no secrets in git.
- **Global directory (per workstation):** each engineer's personal staging credentials. Never committed.
- **CI:** an ephemeral file written from the secret store, passed with `--variables-file`.
- **Inline `--variables`:** ad-hoc overrides; wins over everything else.

A CI-injected `staging.vars.json`:

```json
{
  "base_url": "https://staging.lender.example",
  "username": "qa-runner@lender.example",
  "password": { "value": "FROM_SECRET_STORE", "secret": true }
}
```

```bash
browserbash testmd run .browserbash/tests/login_test.md --agent --headless --timeout 180 \
  --variables-file ./staging.vars.json > login.ndjson
```

In GitHub Actions, the file never exists outside the job:

```yaml
- run: |
    printf '%s' "$STAGING_VARS" > staging.vars.json
    browserbash testmd run .browserbash/tests/login_test.md --agent --headless --timeout 180 \
      --variables-file staging.vars.json > login.ndjson
  env:
    STAGING_VARS: ${{ secrets.STAGING_VARS_JSON }}
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

One nuance worth copying: in CI the team prefers `--variables-file` over inline `--variables`, because some runners echo the command line itself — a secret inside a flag would bypass everything. The file comes from the secret store and dies with the job.

## The grep test

Audit fieldwork, eight weeks later — still illustrative. The auditor asks the standard question: how do you know test credentials don't appear in logs? The QA lead answers with a live demo over 30 days of retained job logs and NDJSON artifacts:

```bash
# 1. the actual password value: zero hits expected
grep -rF 'the-rotated-password' ./retained-logs/ ./ndjson-artifacts/ || echo "no matches"

# 2. the mask, everywhere a credential was typed
grep -rcF '*****' ./ndjson-artifacts/login.ndjson
```

The first command returns nothing — not in step remarks, not in summaries, not in the `run_end` event. The second shows the mask wherever a credential was used. The only trace of the password anywhere in BrowserBash output is `*****`. That terminal capture goes into the evidence folder, and the standing control is one sentence: credentials enter tests only through secret-marked variables.

## What masking does — and deliberately doesn't — cover

The guarantee: values marked `"secret": true` are masked as `*****` in all BrowserBash logs and NDJSON output. Just as important is what it cannot do:

- It can't scrub a password you type into the objective text as a literal. The `{{vars}}` rule has to hold.
- It can't clean your shell history or a CI runner that echoes commands. Keep secrets in files or secret stores, not hand-typed flags.
- It can't stop your application under test from printing a secret on the page.

Masking is one layer. Rotation, secret stores, and short log retention stay in the picture — but the test tooling stops being the leak.

## FAQ

### Is the secret masked in NDJSON too, or just the human-readable logs?

Both. Marked values are masked as `*****` in all logs and NDJSON output — step `remark` fields, the `run_end` summary, everything BrowserBash emits. Your stored artifacts are as clean as your console.

### What if the same key is defined in two layers?

The later layer wins: global directory, then project directory, then `--variables-file`, then inline `--variables`. In practice that means you commit non-secret defaults in the project directory and let CI override secret values with `--variables-file`.

### Can secret and non-secret values live in the same file?

Yes. Plain values stay plain (`"base_url": "https://staging.lender.example"`) and sensitive ones use the `{"value": "...", "secret": true}` shape — only the marked ones are masked, so your logs stay debuggable everywhere else.
