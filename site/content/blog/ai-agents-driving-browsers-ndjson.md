---
title: Wire Your AI Agent to a Real Browser With NDJSON
description: "A platform team lets its AI coding agent call browserbash --agent and consume NDJSON: stable schema, step events, exit-code verdicts, bash and jq."
date: 2026-06-12
category: agents
---

AI coding agents have a verification problem. They can write the React fix, but they cannot see whether the login form still renders — so they either declare victory blind or scrape human-readable test logs that change format every release. BrowserBash's answer is the `--agent` flag: a mode built for machine callers, where stdout is NDJSON with a stable schema, the exit code is the verdict, and a browser run becomes something an agent can call like a function.

## An illustrative platform team

The team is illustrative — a composite of internal-platform setups — but every command and schema below is real. Picture the platform group at a 40-engineer company. An internal AI coding agent opens pull requests; a human used to click through the preview deployment for every UI change, bouncing back around six PRs a week for breakage the agent could have caught itself. The goal: let the coding agent verify its own work in a real browser, without teaching it to parse prose.

## The contract: NDJSON on stdout

```bash
browserbash run "<objective>" --agent --headless --timeout 120
```

With `--agent`, every line on stdout is one JSON object; everything human-readable goes to stderr. While the run executes, step events stream:

```json
{"type":"step","step":3,"status":"passed","action":"click","remark":"Clicked ref:12"}
```

`status` is `running`, `passed`, or `failed`, and `action` names what the agent did — `navigate`, `click`, `type_text`, `extract`, and friends. The final line is always a single `run_end` event:

```json
{
  "type": "run_end",
  "status": "passed",
  "summary": "Logged in and stored the user name.",
  "final_state": {"user_name": "Q. Tester"},
  "duration_ms": 48211,
  "steps_executed": 9,
  "provider": "lambdatest",
  "test_url": "https://automation.lambdatest.com/build"
}
```

`status` is one of `passed | failed | error | timeout`, `final_state` carries everything the objective phrased as `store ... as 'name'`, and `test_url` links to the grid session when a cloud provider ran the browser.

## Exit codes are the API

The process exit code mirrors the verdict: `0` passed, `1` failed, `2` error, `3` timeout. That one decision is what makes the integration robust — the coding agent never infers success from prose. The team's policy: exit 1 means the app is broken, investigate the diff; exit 2 means infrastructure or agent error, retry once (possibly on a different provider); exit 3 means raise `--timeout` or split the objective.

## The bash + jq loop

The minimal integration is three lines:

```bash
out=$(browserbash run "Open $URL and store the page title as 'title'" --agent --headless)
code=$?
title=$(echo "$out" | tail -1 | jq -r '.final_state.title')
```

The team's wrapper, near-verbatim:

```bash
out=$(browserbash run "Open {{base_url}}/login, log in as {{username}} with password {{password}}, and store the logged-in user name as 'user_name'" \
  --agent --headless --timeout 120 \
  --variables '{"base_url":"https://staging.example.com","username":"qa@example.com","password":{"value":"hunter2","secret":true}}')
code=$?

echo "$out" | jq -c 'select(.type=="step")'   # step-by-step trail for the agent log
summary=$(echo "$out" | tail -1 | jq -r '.summary')

case $code in
  0) echo "PASS: $summary" ;;
  1) echo "FAIL: $summary — attach run_end to the PR" ;;
  2) echo "INFRA: $summary — retrying once" ;;
  3) echo "TIMEOUT: $summary — splitting the objective" ;;
esac
```

Note the credentials: they ride in `--variables` with `"secret": true`, never inline in the objective — and they are masked as `*****` in the NDJSON too, which matters when agent transcripts get logged verbatim.

## House rules for agent callers

The team adopted BrowserBash's agent guide as-is. Always pass `--agent`. Phrase every extraction as `store ... as 'name'` so values land in `run_end.final_state`. Split anything needing more than ~15 steps into multiple parallelizable `browserbash run` calls or a `*_test.md` file. Trust the exit code, never the prose. And pick the provider explicitly in CI — `--provider lambdatest` or `--provider browserstack` with `--headless` for cloud grids, or `--cdp-endpoint ws://localhost:9222/devtools/browser/<id>` to attach to a browser the agent already manages, such as one launched by Playwright MCP.

Illustrative outcome after a month: the coding agent runs about 30 verification runs a day and attaches the `run_end` line to every UI pull request. Preview-deployment bounce-backs dropped from six a week to the occasional genuinely novel failure — the kind a human should be looking at anyway.

## FAQ

### Why NDJSON instead of one JSON document?

Streaming. Step events arrive as they happen, so a supervising agent can log progress, detect stalls, and kill runaway runs early — and because the terminal event is always the last line, `tail -1 | jq` gets the verdict without buffering or parsing the whole stream.

### How does an agent tell "the test failed" from "the tooling failed"?

By exit code. `1` is a real assertion failure in the app — go investigate the change. `2` is an infrastructure or agent error — retry, possibly on another provider. `3` is a timeout — raise `--timeout` or split the objective into smaller runs.

### Can the agent attach to a browser it already controls?

Yes. Pass `--cdp-endpoint ws://localhost:9222/devtools/browser/<id>` and BrowserBash drives that existing Chrome DevTools Protocol endpoint instead of launching its own — exactly the pattern for browsers managed by Playwright MCP or a Docker grid.
