# Changelog

## 1.4.0

Caching, parallel suites, run history, and cheap-model routing. All local-first and on by default where safe.

### Added
- **Replay cache.** A green run records its actions; the next identical run replays them with zero model calls and heals only when the page changed. `run_end.cache` reports `hit` / `miss` / `off`. New flags `--no-cache` and `--refresh-cache`; config `cache.enabled` / `cache.dir` (default `.browserbash/cache`, gitignored by `init`). Works on both engines. Secrets never enter the cache: values travel through the variables channel (Stagehand) or are re-templatized to `{{name}}` tokens (builtin), and secret-carrying cached actions are origin-pinned (replay on a different origin fails closed).
- **`run-all` parallel suites.** Run a folder of `*_test.md` files with memory-aware concurrency (`min(requested, cpus, floor((mem - 2GB) / budget))`, cgroup-aware). Isolated child process per test, `--retries` (infra only), `--max-failures`, `--stagger`, merged NDJSON (`--events`), JUnit (`--junit`), and `RunAll-Result.md`. Exit codes `0/1/2/3`.
- **Run history.** `.browserbash/memory/history.json` orders the next `run-all` (previously-failed first, then slowest first) and flags flaky tests. `--no-memory` opts out.
- **Cheap-model routing.** `--model-exec <id>` / `routing.executionModel`: plan on the strong model, execute on a cheap one, escalate back after a failed step. `run_end` now reports `tokens_in` / `tokens_out` on the builtin engine.
- **`testmd run --result-path <file>`** to place `Result.md` outside the test directory (used by `run-all` to avoid clobbering under parallelism).
- **Playwright traces on the builtin engine.** `--record` now captures a native `trace.zip` (openable at trace.playwright.dev) plus a final screenshot on the builtin engine, alongside the existing screenshot + video on stagehand.

### Fixed
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
