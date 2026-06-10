# recreate.md — Build browserbash-cli from scratch

Complete specification to rebuild this project with zero prior context. Follow top to bottom. Every external API fact in here was verified against installed package type definitions or vendor docs — do not re-guess them.

---

## 1. What you are building

**browserbash-cli** — a vendor-independent, natural-language browser automation CLI, fully open-source-first.

A user types:

```bash
browserbash run "Log in to {{base_url}} as {{username}} and store the invoice total as 'total'"
```

An AI agent drives a **real browser** step by step and exits with a machine-readable verdict. Three independent, swappable layers:

| Layer | Question | Options |
|---|---|---|
| **Provider** | Where does the browser run? | `local` (default), `cdp`, `browserbase`, `lambdatest`, `browserstack` |
| **Engine** | Who interprets the English? | `stagehand` (default, MIT OSS), `builtin` (in-repo Anthropic tool-use loop) |
| **LLM** | Who does the thinking? | `auto` (default): Ollama-first → Anthropic → OpenAI; or explicit `--model` |

**Design north stars:**
1. The default path is 100% free and open source: Stagehand (MIT) + local Chromium + Ollama (MIT). No API keys, no cloud.
2. AI agents and CI consume it without parsing prose: `--agent` NDJSON + exit codes.
3. Adding a vendor = one file + one registry line. No vendor name appears outside `src/providers/`.
4. Do NOT mention or reference kane-cli anywhere in code, comments, or docs.

---

## 2. Stack & dependencies

- TypeScript 5.7, strict, ESM (`"type": "module"`), `module: NodeNext`, target ES2022, Node ≥ 18
- `tsconfig.compilerOptions.lib` MUST include `"DOM"` and `"DOM.Iterable"` (in-page `page.evaluate` code) — build fails without it
- 4-space indent, single quotes, semicolons, explicit return types

```json
"dependencies": {
    "@anthropic-ai/sdk": "^0.104.1",
    "@browserbasehq/stagehand": "^3.5.0",
    "commander": "^12.1.0",
    "playwright-core": "^1.49.0"
}
"devDependencies": { "@types/node", "tsx", "typescript" }
```

**Gotchas hit during original build (avoid repeating):**
- Use `playwright-core`, NOT `playwright` — the latter downloads browsers on install. Local provider uses `chromium.launch({ channel: 'chrome' })` (system Chrome).
- `@anthropic-ai/sdk` < 0.60 does not support `thinking: { type: 'adaptive' }` — use ^0.104.
- Stagehand types live at `node_modules/@browserbasehq/stagehand/dist/esm/lib/v3/types/public/*.d.ts` (no top-level index.d.ts).
- `bin: { "browserbash": "dist/index.js" }`, scripts: `build` = `tsc -p tsconfig.json`, `typecheck`, `check`.

---

## 3. File map

```text
src/
├── index.ts            # commander CLI — all commands
├── runner.ts           # engine routing + model resolution + provider session + vendor reporting
├── llm.ts              # 'auto' model resolution, Ollama-first
├── engine/
│   ├── stagehand.ts    # default engine (Stagehand agent)
│   ├── agent.ts        # builtin engine (manual Anthropic tool-use loop)
│   └── tools.ts        # builtin browser tools + ref-id snapshot system
├── providers/
│   ├── types.ts        # BrowserProvider / ProviderSession contracts
│   ├── local.ts cdp.ts browserbase.ts lambdatest.ts browserstack.ts
│   └── index.ts        # registry: getProvider(id), listProviders()
├── testmd/
│   ├── parser.ts       # *_test.md → { title, steps[] }, @import, cycle detection
│   └── runner.ts       # joins steps → objective, writes Result.md
├── config.ts           # ~/.browserbash/config.json, credential resolution
├── variables.ts        # {{var}} substitution + secret masking
├── output.ts           # Reporter: NDJSON (--agent) vs human; info() → stderr
└── types.ts            # RunStatus, EXIT_CODES, RunOptions, events, RunResult
docs/agents.md          # AI-agent integration guide
examples/hn_top_story_test.md
README.md  .gitignore(node_modules,dist,.browserbash,Result.md)  package.json  tsconfig.json
```

---

## 4. Core contracts (exact)

### 4.1 Exit codes & statuses (types.ts)

```typescript
type RunStatus = 'passed' | 'failed' | 'error' | 'timeout';
EXIT_CODES = { passed: 0, failed: 1, error: 2, timeout: 3 }
```

`RunOptions`: objective, provider, engine? ('stagehand'|'builtin'), agent(bool), headless, maxSteps, timeoutSec, variables, name?, cdpEndpoint?, startUrl?, model?.
`RunResult`: status, summary, finalState (Record<string,string>), stepsExecuted, durationMs, testUrl?.

### 4.2 NDJSON schema (output.ts)

`--agent` → one JSON per line on **stdout**; `info()` always to **stderr**.

```json
{"type":"step","step":3,"status":"running|passed|failed","action":"click","remark":"..."}
{"type":"run_end","status":"passed","summary":"...","final_state":{"k":"v"},"duration_ms":1,"steps_executed":9,"provider":"local","test_url":"..."}
```

All remarks/summaries pass through `maskSecrets()` before emit.

### 4.3 Provider contract (providers/types.ts)

```typescript
interface ProviderSession {
    browser: Browser; page: Page;          // playwright-core types
    testUrl?: string;                      // vendor dashboard URL
    reportStatus?(status: 'passed'|'failed', remark: string): Promise<void>;
    close(): Promise<void>;
}
interface BrowserProvider {
    readonly id: string; readonly description: string;
    connect(options: { headless: boolean; name: string; cdpEndpoint?: string; config: BrowserBashConfig }): Promise<ProviderSession>;
}
```

### 4.4 Config (config.ts)

`~/.browserbash/config.json` (override dir with `BROWSERBASH_HOME`); project dir `./.browserbash/`.

```typescript
DEFAULTS = { defaultProvider: 'local', engine: 'stagehand', model: 'auto', headless: false, maxSteps: 30, timeoutSec: 300, credentials: {} }
```

`resolveCredentials(provider, config)`: env vars WIN over stored — lambdatest: `LT_USERNAME`/`LT_ACCESS_KEY`; browserstack: `BROWSERSTACK_USERNAME`/`BROWSERSTACK_ACCESS_KEY`.

### 4.5 Variables (variables.ts)

Load order (highest priority last): `~/.browserbash/variables/*.json` → `./.browserbash/variables/*.json` → `--variables-file` → `--variables '<json>'`. Value forms: `"v"` or `{ "value": "v", "secret": true }`. `substitute()` replaces `{{key}}`, **throws on unknown key**. `maskSecrets()` replaces secret values with `*****` in every outbound string.

---

## 5. LLM resolution — open source first (llm.ts)

`model === 'auto'` (the default) resolves:

1. Probe Ollama: GET `<root>/api/tags`, 1.5 s AbortController timeout, where root = `OLLAMA_BASE_URL` (default `http://localhost:11434/v1`) with trailing `/v1` stripped. If reachable → `ollama/<OLLAMA_MODEL env || first installed model>`.
2. `ANTHROPIC_API_KEY` set → `claude-opus-4-8`
3. `OPENAI_API_KEY` set → `openai/gpt-4.1`
4. Throw multi-line error suggesting `ollama pull qwen3`, API keys, or explicit `--model`.

Explicit model strings pass through untouched. Resolution happens ONCE in runner.ts before engine dispatch; log the choice via `reporter.info()`.

**Guard:** builtin engine + `ollama/*` model → throw (builtin speaks Anthropic API). Error must mention: use stagehand-capable provider, or set `ANTHROPIC_API_KEY`, or `ANTHROPIC_BASE_URL` Anthropic-compatible gateway (LiteLLM). Note: `@anthropic-ai/sdk` reads `ANTHROPIC_BASE_URL` env automatically — no code needed.

---

## 6. Engines

### 6.1 Stagehand engine (engine/stagehand.ts) — DEFAULT

Stagehand = open-source (MIT) AI browser automation by Browserbase, npm `@browserbasehq/stagehand` v3.5.0, https://www.stagehand.dev. Verified v3 API:

```typescript
import { Stagehand } from '@browserbasehq/stagehand';
new Stagehand({
    env: 'LOCAL' | 'BROWSERBASE',
    model: string | { modelName: string; apiKey?: string; baseURL?: string },  // 'anthropic/claude-opus-4-8' format
    verbose: 0, disablePino: true,
    localBrowserLaunchOptions: { headless?: boolean; cdpUrl?: string },         // cdpUrl = attach to existing CDP browser
    apiKey, projectId,                                                          // BROWSERBASE env only
});
await stagehand.init();
const agent = stagehand.agent();
const result = await agent.execute({ instruction, maxSteps });
// AgentResult: { success: boolean; message: string; actions: AgentAction[]; completed: boolean; usage? }
// AgentAction: { type: string; action?: string; instruction?: string; reasoning?: string; ... }
await stagehand.close();
```

Engine behavior:
- `STAGEHAND_PROVIDERS = ['local', 'cdp', 'browserbase']`; export `stagehandSupports(provider)`.
- Provider mapping: `local` → env LOCAL; `cdp` → env LOCAL + `localBrowserLaunchOptions.cdpUrl` (require `--cdp-endpoint`); `browserbase` → env BROWSERBASE + `BROWSERBASE_API_KEY`/`BROWSERBASE_PROJECT_ID` (throw early if missing).
- Model mapping `toStagehandModel(model)`:
  - `ollama/<m>` → `{ modelName: 'openai/<m>', baseURL: OLLAMA_BASE_URL ?? 'http://localhost:11434/v1', apiKey: OLLAMA_API_KEY ?? 'ollama' }` (Ollama is OpenAI-compatible; same shape covers vLLM/LM Studio/llama.cpp)
  - contains `/` → pass through; `claude*` → `anthropic/<m>`; `gpt*|o*` → `openai/<m>`; `gemini*` → `google/<m>`.
- Instruction = `[startUrl ? 'Start by navigating to <url>.' : '', substitutedObjective, 'If the objective asks to store or extract values, end your final message with a JSON object mapping each requested name to its value.']`.
- Timeout: `Promise.race` against `timeoutSec`; on timeout return status `'timeout'`.
- After execute: replay `result.actions` as passed step events (Stagehand runs autonomously; no live step hook in this integration). status = success ? passed : failed; summary = result.message.
- `extractFinalState(message)`: regex last `{...}` block → JSON.parse → keep scalar entries as strings; `{}` on any failure.
- Always `stagehand.close()` in finally.

### 6.2 Builtin engine (engine/agent.ts + tools.ts)

Manual Anthropic tool-use loop (NOT the SDK tool runner — needed for live NDJSON per tool call). Exists because Stagehand only attaches over CDP, while LambdaTest/BrowserStack expose **Playwright-protocol** WebSockets.

API call shape (verified on sdk ^0.104):

```typescript
client.messages.create({
    model, max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT, tools: BROWSER_TOOLS, messages,
});
```

Loop: while step < maxSteps → call API → if no tool_use blocks: status error ("stopped without calling done") → push assistant content → execute each tool_use → on `done` tool: status = input.status, summary = input.summary, break → else execute via `BrowserToolExecutor`, emit running/passed/failed step events, collect `tool_result` blocks (`is_error: true` on throw, first line of error message only) → push user message with results. Deadline check each iteration → `timeout`. Max steps exhausted → `failed`.

System prompt rules: snapshot before interacting with unseen page; prefer ref targets; "store X as 'name'" → extract tool; be decisive; always end with done.

**Tools** (`Anthropic.Tool[]`): `navigate{url}`, `snapshot{}`, `click{target}`, `type_text{target,text,press_enter?}`, `wait_for{target}`, `extract{target,store_as}`, `done{status:enum[passed,failed],summary}`.

**Target grammar:** `ref:<n>` (from latest snapshot) | `text=<visible text>` (→ `getByText(..., {exact:false})`) | raw CSS selector. Stale ref → throw "take a new snapshot first".

**Snapshot** (in-page evaluate): query `a[href], button, input, textarea, select, [role=button|link|textbox], [onclick]`; skip zero-size rects; cap 120 elements; per element assign incrementing ref + best selector — priority `[data-testid="..."]` → `#id` (CSS.escape) → `tag[name="..."]` → `tag >> nth=<index among same tag>`; label = aria-label ?? placeholder ?? textContent.slice(0,80). Return `URL / Title / ref:N [role] "label"` lines; store ref→selector map; timeouts 15 s actions, 60 s navigation.

`executor.finalState` accumulates extract results → `RunResult.finalState`.

---

## 7. Providers (exact connection recipes)

- **local**: `chromium.launch({ channel: 'chrome', headless })` → newContext → newPage. close() = browser.close().
- **cdp**: `chromium.connectOverCDP(cdpEndpoint)`; reuse `contexts()[0]`/`pages()[0]` else create. Throw if no `--cdp-endpoint`. (Also the path for Playwright-MCP-managed browsers.)
- **browserbase**: registry stub whose `connect()` rejects with "requires the stagehand engine" — real handling lives inside stagehand engine. Listed for `browserbash providers`.
- **lambdatest**: `chromium.connect('wss://cdp.lambdatest.com/playwright?capabilities=' + encodeURIComponent(JSON.stringify(caps)))` with caps `{ browserName:'Chrome', browserVersion:'latest', 'LT:Options': { platform:'Windows 11', build:'browserbash-cli', name, user, accessKey, network:true, video:true, console:true, headless } }`. testUrl `https://automation.lambdatest.com/build`. reportStatus: `page.evaluate((_arg) => undefined, 'lambdatest_action: ' + JSON.stringify({action:'setTestStatus',arguments:{status,remark}}))`, swallow errors.
- **browserstack**: `chromium.connect('wss://cdp.browserstack.com/playwright?caps=' + encodeURIComponent(JSON.stringify(caps)))` with caps `{ browser:'chrome', browser_version:'latest', os:'Windows', os_version:'11', name, build:'browserbash-cli', 'browserstack.username':u, 'browserstack.accessKey':k }`. testUrl `https://automate.browserstack.com/dashboard`. reportStatus via `browserstack_executor: {"action":"setSessionStatus","arguments":{status,reason}}` same evaluate trick.
- Missing creds → throw with both env-var and `browserbash login` remedies.

---

## 8. Runner (runner.ts)

```text
executeRun(options):
  engine = options.engine ?? config.engine
  if engine==stagehand && !stagehandSupports(provider): info("...switching automatically"); engine = builtin
  model = await resolveModel(options.model ?? config.model, reporter.info)
  if engine==builtin && model.startsWith('ollama/'): throw guard error (§5)
  result = stagehand ? runStagehandAgent(...) : runWithBuiltin(...)
  // builtin path: provider.connect → optional startUrl goto → runAgent → result.testUrl = session.testUrl
  //               → session.reportStatus?(passed|failed, summary) → finally session.close()
  reporter.runEnd({...})   // single place that emits run_end
```

---

## 9. testmd (parser.ts + runner.ts)

Format: first `# heading` = title; steps = `- item` / `* item` / `1. item` lines; `@import ./relative.md` splices imported file's steps in place (recursive, `Set` of absolute paths → throw on cycle); all other prose ignored; throw if zero steps.

Runner: objective = `Execute this test: "<title>". Perform the following steps in order and verify each succeeds:\n1. ...\n2. ...`; call executeRun with name=title; write `Result.md` next to the test file: status, duration, steps executed, optional report URL, summary, extracted values as JSON block.

---

## 10. CLI surface (index.ts, commander)

Shared run flags: `-p/--provider`, `-e/--engine stagehand|builtin`, `--agent`, `--headless`, `--max-steps` (def '30'), `--timeout` (def '300'), `--variables <json>`, `--variables-file <path>`, `--cdp-endpoint <url>` (presence forces provider=cdp), `--url <start url>`, `--model <id>`.

| Command | Behavior |
|---|---|
| `run <objective>` (+`--name`) | executeRun; `process.exit(EXIT_CODES[status])` |
| `testmd run <path>` | runTestMd; same exit mapping |
| `login -p <id> --username --access-key` | store creds in config (CI-friendly, non-interactive) |
| `logout -p <id>` / `whoami` | remove / list (username only) |
| `providers` | list registry, mark default |
| `config show` | JSON with accessKey → `*****` |
| `config set <k> <v>` | defaultProvider, engine (validate stagehand|builtin), model, headless, maxSteps, timeoutSec; unknown key → exit 2 |
| `init` | scaffold `./.browserbash/{variables/default.json,tests/smoke_test.md}` (don't overwrite) |

Error path: catch around run/testmd — `--agent` → emit `run_end` with status error on stdout; else stderr; exit 2.

---

## 11. Docs to write

- **README.md**: what it is; Engines table (stagehand default MIT / builtin); Providers table (5, with engine column + auth); LLM backends section with auto-resolution order, Ollama-first, fully-free-stack recipe (`ollama pull qwen3` then just run), small-model flakiness tip, cloud-grid-needs-Anthropic note; install (npm install/build/link); quick start incl. browserbase + `--engine builtin`; agent mode NDJSON + exit codes; testmd; variables; config precedence (flags > env > config); GitHub Actions recipe (login + testmd run --agent, exit code = verdict); architecture tree; "adding a vendor = one file + registry line". Apache-2.0. Use `| --- |` table separators and language tags on all fences (markdownlint).
- **docs/agents.md**: 5 rules (always --agent; store-as pattern; split >15-step flows; trust exit code; explicit provider in CI), NDJSON schema examples, secrets-via-variables example, bash + jq pseudo-loop.
- **examples/hn_top_story_test.md**: HN top story 4-step test.

---

## 12. Verification checklist (all must pass)

```bash
npm install && npm run build                      # clean tsc
node dist/index.js --help                         # 9 commands listed
node dist/index.js providers                      # 5 providers, local (default)
BROWSERBASH_HOME=/tmp/h node dist/index.js init && config set defaultProvider lambdatest \
  && login --provider lambdatest --username demo --access-key secret123 \
  && config show   # accessKey shows *****
node -e "import('./dist/testmd/parser.js').then(({parseTestMd})=>console.log(parseTestMd('examples/hn_top_story_test.md')))"
# error paths (no creds/keys):
node dist/index.js run x --agent --provider browserstack          # NDJSON run_end error, exit 1? no → exit 2
env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY node dist/index.js run x --agent --provider lambdatest
#   → "No LLM backend available" guidance (when no local Ollama)
env -u ANTHROPIC_API_KEY node dist/index.js run x --agent --provider browserstack --model ollama/qwen3
#   → builtin+ollama guard error
# live (needs key or Ollama):
node dist/index.js run "Open https://news.ycombinator.com and store the top story title as 'top_story'"
```

---

## 13. Known gaps / future work (do not block initial build)

- Live cloud-grid connects (LambdaTest/BrowserStack WS) written to documented endpoints, unverified without accounts.
- Dedicated `mcp` provider (spawn `npx @playwright/mcp`, attach via CDP) — today done manually with `--cdp-endpoint`.
- Stagehand stream mode for live step events (currently replayed post-hoc).
- testmd replay cache (skip previously-passed steps).
- ESLint config (`npm run check` = typecheck only).
- Builtin engine OpenAI-protocol support (would remove the builtin+ollama guard).
