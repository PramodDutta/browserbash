# Changelog

## 1.5.1

Registry metadata only, no code change: adds `mcpName` to `package.json` so the server can be verified and listed in the official MCP Registry (`io.github.PramodDutta/browserbash`).

## 1.5.0

The validation-layer release: BrowserBash becomes directly consumable by AI agents, and verdicts stop being model judgment.

### Added
- **MCP server.** `browserbash mcp` serves the CLI over the Model Context Protocol on stdio, zero new dependencies. Tools: `run_objective`, `run_test_file`, `run_suite`; each returns the structured `run_end` verdict. One-line install into Claude Code: `claude mcp add browserbash -- browserbash mcp` (same idea for Cursor, Windsurf, Codex, Zed). Tool calls spawn the CLI as child processes, so run events never interleave with protocol frames.
- **testmd v2: per-step execution.** Opt in with `version: 2` frontmatter. Steps execute in order against ONE browser session: deterministic API steps (`POST {{base_url}}/api/seed with body {...}`, `Expect status 201, store $.id as 'order_id'`) run as plain HTTP with no model, `Verify` steps run as real Playwright checks, and consecutive plain-English steps run as grouped agent blocks. Arrange-act-assert is now expressible. v1 files are untouched. v2 currently drives the builtin engine (Anthropic API or an `ANTHROPIC_BASE_URL` gateway).
- **Deterministic assertions.** Nine `Verify ...` forms (URL contains, title is/contains, text visible, role visible, element count, stored value equals) compile to real checks: a pass means the condition held, never "the agent felt it was fine". `run_end` gains an additive `assertions` block with per-assertion evidence (expected vs actual); `Result.md` gets an assertion table. Verify lines outside the grammar still run, agent-judged and flagged `judged: true`.
- **Saved login sessions.** `browserbash auth save <name> --url <login-page>` opens a browser, you log in once, Enter saves the session (Playwright storageState, mode 0600). Reuse with `--auth <name>` on run/testmd/run-all/monitor or `auth:` frontmatter. Builtin engine injects full storageState; stagehand gets cookies plus a localStorage init script. A profile whose saved origins do not cover the target start URL prints a warning.
- **Monitor mode.** `browserbash monitor <test|objective> --every 10m --notify <webhook>`: run on an interval, keep local history, and alert ONLY on pass<->fail state changes. Slack incoming-webhook URLs get Slack formatting automatically; anything else receives the raw JSON payload. Warm replay-cache runs make an always-on monitor nearly token-free.
- **Cost governance.** `run_end` now carries `cost_usd` (estimated from a bundled per-model price table, overridable at `~/.browserbash/pricing.json`; unknown models get NO estimate rather than a wrong one). `run-all --budget-usd` / `--budget-tokens` stop launching new tests once the suite crosses the budget: remaining tests are reported `skipped`, the suite exits 2, and spend lands in JUnit `<properties>` and `RunAll-Result.md`.
- **Sharding + viewport matrix.** `run-all --shard 2/4` runs a deterministic slice (computed on sorted discovery order, so parallel CI machines agree without coordination). `--matrix-viewport 1280x720,390x844` runs every test once per viewport, with per-cell labels in events, JUnit and results. A standalone `--viewport WxH` flag also works on single runs, both engines.
- **Playwright import.** `browserbash import <specs-or-dir>` converts Playwright specs to plain-English `*_test.md` heuristically (no model, reproducible): goto/click/fill/press/check/selectOption, getBy* locators, common expects (toHaveURL/Title, toBeVisible, toHaveText). `process.env.X` becomes `{{X}}` variables (secret-looking names pre-marked secret). Everything untranslatable lands in `IMPORT-REPORT.md` instead of being dropped or invented.
- **Recorder.** `browserbash record <url>` opens a visible browser; click through the flow once and Ctrl-C writes a plain-English test. Password fields never leave the page: the capture script sends only a secret marker, and the generated step reads `Type {{password}} into ...`.
- **GitHub Action.** `action.yml` at the repo root: installs the CLI, runs the suite, uploads JUnit/NDJSON/results artifacts, supports `shard:` matrix jobs and `budget-usd:`, and posts a self-updating PR comment with the verdict table. See `docs/github-action.md`.
- **Webhooks on suites.** `run-all --notify <url>` POSTs the suite verdict (tally, duration, spend) when the suite ends.

### Changed
- `run-all` verdicts gain a `skipped` state (budget stops); suite summary lines and `RunAll-Result.md` include skipped counts and estimated spend.
- NDJSON schema: additive fields only (`run_end.cost_usd`, `run_end.assertions`, `test_skipped` and `suite_end.cost_usd/tokens/budget_stopped` events, `cell` labels on matrix runs). Existing consumers are unaffected.

## 1.4.0

Caching, parallel suites, run history, and cheap-model routing. All local-first and on by default where safe.

### Added
- **Replay cache.** A green run records its actions; the next identical run replays them with zero model calls and heals only when the page changed. `run_end.cache` reports `hit` / `miss` / `off`. New flags `--no-cache` and `--refresh-cache`; config `cache.enabled` / `cache.dir` (default `.browserbash/cache`, gitignored by `init`). Works on both engines. Secrets never enter the cache: values travel through the variables channel (Stagehand) or are re-templatized to `{{name}}` tokens (builtin), and secret-carrying cached actions are origin-pinned (replay on a different origin fails closed).
- **`run-all` parallel suites.** Run a folder of `*_test.md` files with memory-aware concurrency (`min(requested, cpus, floor((mem - 2GB) / budget))`, cgroup-aware). Isolated child process per test, `--retries` (infra only), `--max-failures`, `--stagger`, merged NDJSON (`--events`), JUnit (`--junit`), and `RunAll-Result.md`. Exit codes `0/1/2/3`.
- **Run history.** `.browserbash/memory/history.json` orders the next `run-all` (previously-failed first, then slowest first) and flags flaky tests. `--no-memory` opts out.
- **Cheap-model routing.** `--model-exec <id>` / `routing.executionModel`: plan on the strong model, execute on a cheap one, escalate back after a failed step. `run_end` now reports `tokens_in` / `tokens_out` on the builtin engine.
- **`testmd run --result-path <file>`** to place `Result.md` outside the test directory (used by `run-all` to avoid clobbering under parallelism).
- **Playwright traces on the builtin engine.** `--record` now captures a native `trace.zip` (openable at trace.playwright.dev) plus a final screenshot on the builtin engine, alongside the existing screenshot + video on stagehand.
- **Per-test memory watchdog in `run-all`.** `--memory-cap <mb>` (default 2x `--memory-budget`, `0` disables) hard-kills any test whose whole process tree exceeds the cap, reporting an infra error plus a `test_kill` event instead of letting one ballooning page take down the host.
- **Signed action journals.** Builtin replay journals carry an HMAC-SHA256 signature under a per-machine key (`~/.browserbash/cache.key`, created `0600` on first use). An unsigned, edited, or foreign-machine journal is ignored (cache miss, warning printed) instead of driving the browser. Set the same `BROWSERBASH_CACHE_KEY` (64 hex chars) across CI runners to share committed caches deliberately.

### Fixed
- **`{{variable}}` URLs navigate correctly on Stagehand.** Non-secret variables are now inlined into the agent instruction (Stagehand only resolves `%name%` inside act/type arguments, never in navigation URLs), while secrets stay as placeholders backed by the variables channel. Also lets hosted-model runs with only non-secret variables use the cache.
- **Honest results from small local models.** Models that print the close tool's `{reasoning, taskComplete}` JSON as their final text (qwen2.5/llama3.2 class) no longer surface as `failed` with a raw JSON summary; the run unwraps the echo, honors `taskComplete`, and keeps those keys out of `final_state`.
- **Local models now work for interactive steps.** Ollama/OpenRouter models run on Stagehand's DOM agent mode with `reasoningEffort: none` and the screenshot tool excluded, so clicks and typing no longer time out or 400 on text-only models. A warning is printed when a known thinking model (qwen3.5, qwq, r1 family) is selected.
- **Per-model thinking config** on the builtin loop (adaptive for Opus/Sonnet/Fable, budgeted for Haiku, omitted otherwise) so cheap models can drive the agent at all.
- **Secret masking is case-insensitive**, closing a leak where a case-transformed secret (e.g. a DNS-lowercased hostname in an error) reached logs.
- **Path-traversal guard** on run lookups by id.
- **Stable run ordering** under same-millisecond and parallel persists.
- Error-path `run_end` now carries the `provider` field; config merge is one level deep so partial nested sections keep their defaults; `SIGTERM` is handled alongside `SIGINT` on dashboard-serving paths; `dashboard --clear` prints the real runs directory.

### Changed
- Upgraded `@browserbasehq/stagehand` to 3.6.0 and `playwright-core` to 1.61.1; pulls `form-data` 4.0.6 (fixes advisory GHSA-hmw2-7cc7-3qxx).
- `--record` copy now accurately reflects both paths: screenshot + video on stagehand, or a Playwright trace on the builtin engine.
- Added a `prepack` build so `npm pack` never ships a stale `dist/`.

## 1.3.1 and earlier

Initial public releases: natural-language `run` and `testmd run`, Stagehand and builtin engines, local/cdp/browserbase/lambdatest/browserstack providers, `--agent` NDJSON with `0/1/2/3` exit codes, `--record`, local + opt-in cloud dashboards, variables with secret masking.
