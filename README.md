# browserbash-cli

Vendor-independent, natural-language browser automation CLI — inspired by [kane-cli](https://github.com/LambdaTest/kane-cli), but not tied to any one vendor.

Give it a plain-English objective. It drives a **real browser** with an AI agent loop and returns structured results. The browser can live anywhere:

| Provider | Where the browser runs | Auth |
|---|---|---|
| `local` (default) | System Google Chrome on your machine | none |
| `cdp` | Any Chrome DevTools Protocol endpoint (your grid, docker, Playwright MCP-managed browser) | none |
| `lambdatest` | LambdaTest / TestMu AI cloud grid | `LT_USERNAME` / `LT_ACCESS_KEY` |
| `browserstack` | BrowserStack Automate cloud grid | `BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY` |

The AI planning engine uses the Anthropic API (`ANTHROPIC_API_KEY` required, default model `claude-opus-4-8`).

## Install

```bash
npm install
npm run build
npm link        # exposes the `browserbash` command
```

Requires Node ≥ 18 and Google Chrome stable (for the `local` provider).

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# One-shot objective, local Chrome
browserbash run "Open https://news.ycombinator.com and store the top story title as 'top_story'"

# Same objective on a cloud grid
export LT_USERNAME=... LT_ACCESS_KEY=...
browserbash run "..." --provider lambdatest --headless

# Attach to an existing browser (CDP / Playwright MCP)
browserbash run "..." --cdp-endpoint ws://localhost:9222/devtools/browser/<id>
```

## Agent mode (for AI coding tools & CI)

`--agent` switches stdout to NDJSON — one JSON object per line, stable schema:

```bash
browserbash run "<objective>" --agent --headless --timeout 120
```

- Progress events: `{"type":"step","step":1,"status":"passed","action":"navigate","remark":"..."}`
- Terminal event: `{"type":"run_end","status":"passed|failed|error|timeout","summary":"...","final_state":{...},"duration_ms":...,"test_url":"..."}`

Exit codes: `0` passed · `1` failed · `2` error · `3` timeout.

Full agent integration guide: [docs/agents.md](docs/agents.md).

## Test files (`*_test.md`)

Committable, reviewable Markdown tests:

```markdown
# Login flow

- Open {{base_url}}/login
- Type {{username}} into the email field
- Type {{password}} into the password field and press Enter
- Verify the dashboard heading is visible
- Store the logged-in user name as 'user_name'
```

```bash
browserbash testmd run ./.browserbash/tests/login_test.md --provider browserstack
```

Composition via `@import ./helpers/login.md` (steps are spliced in place). After every run a `Result.md` is written next to the test file.

## Variables

`{{key}}` placeholders are substituted in objectives and test steps. Load order (highest priority last):

1. Global: `~/.browserbash/variables/*.json`
2. Project: `./.browserbash/variables/*.json`
3. `--variables-file <path>`
4. `--variables '<json>'`

Mark sensitive values `{"value": "...", "secret": true}` — they are masked as `*****` in all logs and NDJSON output.

## Configuration

```bash
browserbash init                          # scaffold ./.browserbash/
browserbash config show
browserbash config set defaultProvider lambdatest
browserbash providers                     # list providers
browserbash login --provider lambdatest --username "$USER" --access-key "$KEY"
browserbash whoami
```

Precedence: **flags > env vars > ~/.browserbash/config.json defaults**.

## CI recipe (GitHub Actions)

```yaml
- run: npm ci && npm run build
- run: |
    node dist/index.js login --provider lambdatest --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY"
    node dist/index.js testmd run .browserbash/tests/smoke_test.md --agent --headless --timeout 180
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    LT_USERNAME: ${{ secrets.LT_USERNAME }}
    LT_ACCESS_KEY: ${{ secrets.LT_ACCESS_KEY }}
```

The process exit code is the test verdict — no output parsing needed.

## Architecture

```
src/
├── index.ts            # CLI (commander): run, testmd, login, config, providers, init
├── runner.ts           # orchestrates provider session + agent loop + vendor status reporting
├── engine/
│   ├── agent.ts        # Anthropic tool-use loop (manual loop → NDJSON step events)
│   └── tools.ts        # browser tools: navigate, snapshot, click, type_text, wait_for, extract, done
├── providers/          # vendor abstraction — add a new vendor by implementing BrowserProvider
│   ├── types.ts        # BrowserProvider / ProviderSession interfaces
│   ├── local.ts        # system Chrome
│   ├── cdp.ts          # attach to any CDP endpoint (incl. Playwright MCP browsers)
│   ├── lambdatest.ts   # LambdaTest/TestMu grid + setTestStatus reporting
│   └── browserstack.ts # BrowserStack Automate grid + setSessionStatus reporting
├── testmd/             # *_test.md parser (@import, ordered steps) + Result.md writer
├── config.ts           # ~/.browserbash/config.json + credential resolution
├── variables.ts        # {{var}} substitution, secrets masking
└── output.ts           # NDJSON / human reporter
```

Adding a vendor = one file implementing `BrowserProvider` (`connect()` returning a Playwright `Browser`/`Page`) + one registry line in `providers/index.ts`.

## License

Apache-2.0
