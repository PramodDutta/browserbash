# browserbash for AI agents

Rules for AI coding tools (Claude Code, Cursor, Copilot) driving browserbash:

1. **Always pass `--agent`.** stdout becomes NDJSON with a stable schema; everything human-readable goes to stderr.
2. **Use the `store as` pattern for extraction.** Phrase objectives like: `"...store the order id as 'order_id'"`. Values land in `run_end.final_state`.
3. **Split long flows.** Objectives needing more than ~15 steps should become multiple `browserbash run` calls (parallelizable) or a `*_test.md` file.
4. **Trust the exit code.** `0` passed, `1` failed, `2` error (infra/agent), `3` timeout. Don't parse prose to decide success.
5. **Pick the provider explicitly in CI.** `--provider lambdatest|browserstack --headless` for cloud, `--cdp-endpoint <url>` to attach to a browser you already manage (e.g. one launched by Playwright MCP).

## NDJSON schema

Step event:

```json
{"type":"step","step":3,"status":"running|passed|failed","action":"click","remark":"Clicked ref:12"}
```

Terminal event (always last line):

```json
{
  "type": "run_end",
  "status": "passed|failed|error|timeout",
  "summary": "one-paragraph outcome",
  "final_state": {"order_id": "12345"},
  "duration_ms": 48211,
  "steps_executed": 9,
  "provider": "lambdatest",
  "test_url": "https://automation.lambdatest.com/build"
}
```

## Secrets

Never inline credentials in the objective. Put them in variables with `"secret": true` and reference `{{password}}` — masked in all output:

```bash
browserbash run "Log in to {{base_url}} as {{username}} with password {{password}}" \
  --agent --variables '{"username":"qa@x.com","password":{"value":"s3cret","secret":true},"base_url":"https://app.example.com"}'
```

## Example loop (pseudo)

```bash
out=$(browserbash run "Open $URL and store the page title as 'title'" --agent --headless)
code=$?
title=$(echo "$out" | tail -1 | jq -r '.final_state.title')
```
