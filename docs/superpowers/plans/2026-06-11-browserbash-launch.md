# BrowserBash Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship browserbash.com (Next.js landing + waitlist on Neon + Clerk dashboard) and a tested, npm-published browserbash-cli by Monday 2026-06-15.

**Architecture:** Existing CLI repo becomes `PramodDutta/browserbash` monorepo: CLI at root (+ new `tests/` via vitest against built `dist/`), landing page in `site/` (Next.js 15 App Router, static landing, two API routes, Clerk-gated dashboard). Vercel project root = `site/`. Bo mascot is inline-SVG pixel sprite animated with CSS only.

**Tech Stack:** TypeScript, vitest, Next.js 15, vanilla CSS (no UI framework, no animation libs), `@neondatabase/serverless`, zod, `@clerk/nextjs`, `@playwright/test`, sharp (asset gen only).

**Spec:** `docs/superpowers/specs/2026-06-11-browserbash-landing-design.md`

**Conventions:** CLI tests import from `../../dist/*.js` (built output — avoids ESM/TS resolution friction; `npm test` builds first). Commits small + conventional. No Co-Authored-By trailers.

---

## Phase 1 — CLI hardening

### Task 1: Vitest setup

**Files:** Modify `package.json`; Create `vitest.config.ts`

- [ ] Step 1: `npm install -D vitest@^3`
- [ ] Step 2: Add scripts to package.json: `"test": "npm run build && vitest run", "test:watch": "vitest"`
- [ ] Step 3: Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        testTimeout: 20000,
    },
});
```

- [ ] Step 4: Create `tests/unit/smoke.test.ts` with `expect(1).toBe(1)`; run `npm test` → PASS; delete smoke file in Task 2's commit.
- [ ] Step 5: Commit `test: add vitest harness`

### Task 2: Unit tests — testmd parser

**Files:** Create `tests/unit/parser.test.ts`

- [ ] Step 1: Write tests (real code):

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTestMd } from '../../dist/testmd/parser.js';

function md(dir: string, name: string, content: string): string {
    const p = join(dir, name);
    writeFileSync(p, content);
    return p;
}

describe('parseTestMd', () => {
    it('parses title and ordered steps from -, *, 1. lists', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        const p = md(dir, 'a_test.md', '# Login\nprose ignored\n- one\n* two\n1. three\n');
        const r = parseTestMd(p);
        expect(r.title).toBe('Login');
        expect(r.steps).toEqual(['one', 'two', 'three']);
    });
    it('splices @import steps in place, recursively', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        md(dir, 'shared.md', '# Shared\n- s1\n- s2\n');
        const p = md(dir, 'main_test.md', '# Main\n- a\n@import ./shared.md\n- b\n');
        expect(parseTestMd(p).steps).toEqual(['a', 's1', 's2', 'b']);
    });
    it('throws on @import cycles', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        md(dir, 'x.md', '# X\n- x\n@import ./y.md\n');
        md(dir, 'y.md', '# Y\n@import ./x.md\n');
        expect(() => parseTestMd(join(dir, 'x.md'))).toThrow(/cycle|circular/i);
    });
    it('throws when no steps found', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        const p = md(dir, 'empty_test.md', '# Empty\njust prose\n');
        expect(() => parseTestMd(p)).toThrow(/no steps/i);
    });
});
```

- [ ] Step 2: `npm test` → all pass (parser already implemented; failures = real bugs, fix forward).
- [ ] Step 3: Commit `test: testmd parser unit coverage`

### Task 3: Unit tests — variables

**Files:** Create `tests/unit/variables.test.ts`

- [ ] Step 1:

```typescript
import { describe, it, expect } from 'vitest';
import { substitute, maskSecrets } from '../../dist/variables.js';

const vars = {
    user: { value: 'pramod' },
    pass: { value: 'hunter2', secret: true },
} as Record<string, { value: string; secret?: boolean }>;

describe('substitute', () => {
    it('replaces {{key}} placeholders', () => {
        expect(substitute('hi {{user}}', vars)).toBe('hi pramod');
    });
    it('throws on unknown key', () => {
        expect(() => substitute('{{nope}}', vars)).toThrow(/nope/);
    });
});

describe('maskSecrets', () => {
    it('masks secret values only', () => {
        const out = maskSecrets('login pramod with hunter2', vars);
        expect(out).toContain('pramod');
        expect(out).not.toContain('hunter2');
        expect(out).toContain('*****');
    });
});
```

- [ ] Step 2: `npm test` → pass. Commit `test: variables substitution + secret masking`

### Task 4: Unit tests — config & credentials

**Files:** Create `tests/unit/config.test.ts`

- [ ] Step 1:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let home: string;
beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'bbh-'));
    vi.stubEnv('BROWSERBASH_HOME', home);
    vi.stubEnv('LT_USERNAME', '');
    vi.stubEnv('LT_ACCESS_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('config', () => {
    it('returns defaults when no file exists', async () => {
        const { loadConfig } = await import('../../dist/config.js');
        const c = loadConfig();
        expect(c.defaultProvider).toBe('local');
        expect(c.engine).toBe('stagehand');
        expect(c.model).toBe('auto');
        expect(c.maxSteps).toBe(30);
        expect(c.timeoutSec).toBe(300);
    });
    it('persists via saveConfig and respects BROWSERBASH_HOME', async () => {
        const { loadConfig, saveConfig, configPath } = await import('../../dist/config.js');
        const c = loadConfig();
        c.defaultProvider = 'lambdatest';
        saveConfig(c);
        expect(configPath().startsWith(home)).toBe(true);
        expect(loadConfig().defaultProvider).toBe('lambdatest');
    });
    it('env credentials win over stored ones', async () => {
        const { loadConfig, saveConfig, resolveCredentials } = await import('../../dist/config.js');
        const c = loadConfig();
        c.credentials.lambdatest = { username: 'stored', accessKey: 'storedkey' };
        saveConfig(c);
        vi.stubEnv('LT_USERNAME', 'envuser');
        vi.stubEnv('LT_ACCESS_KEY', 'envkey');
        const creds = resolveCredentials('lambdatest', loadConfig());
        expect(creds.username).toBe('envuser');
        expect(creds.accessKey).toBe('envkey');
    });
});
```

- [ ] Step 2: `npm test` → pass. Commit `test: config defaults, persistence, env credential precedence`

### Task 5: Unit tests — LLM auto-resolution

**Files:** Create `tests/unit/llm.test.ts`

- [ ] Step 1 (Ollama made deterministically unreachable via dead port):

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveModel } from '../../dist/llm.js';

beforeEach(() => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://127.0.0.1:9/v1'); // unreachable → instant refuse
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());
const noop = () => {};

describe('resolveModel', () => {
    it('passes explicit model through untouched', async () => {
        expect(await resolveModel('ollama/qwen3', noop)).toBe('ollama/qwen3');
        expect(await resolveModel('claude-opus-4-8', noop)).toBe('claude-opus-4-8');
    });
    it('falls back to Anthropic when no Ollama', async () => {
        vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
        expect(await resolveModel('auto', noop)).toBe('claude-opus-4-8');
    });
    it('falls back to OpenAI when no Ollama/Anthropic', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test');
        expect(await resolveModel('auto', noop)).toBe('openai/gpt-4.1');
    });
    it('throws setup guidance when nothing available', async () => {
        await expect(resolveModel('auto', noop)).rejects.toThrow(/No LLM backend/);
    });
});
```

- [ ] Step 2: `npm test` → pass. Commit `test: llm auto-resolution order + guidance error`

### Task 6: Unit tests — Reporter NDJSON & providers registry

**Files:** Create `tests/unit/output.test.ts`, `tests/unit/providers.test.ts`

- [ ] Step 1 `output.test.ts` (capture stdout/stderr writes):

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Reporter } from '../../dist/output.js';

function capture(stream: NodeJS.WriteStream): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const spy = vi.spyOn(stream, 'write').mockImplementation(((s: string) => {
        lines.push(String(s));
        return true;
    }) as never);
    return { lines, restore: () => spy.mockRestore() };
}
afterEach(() => vi.restoreAllMocks());

describe('Reporter agent mode', () => {
    it('emits step + run_end as NDJSON on stdout, masked', () => {
        const out = capture(process.stdout);
        const r = new Reporter(true, { pw: { value: 's3cret', secret: true } });
        r.step({ type: 'step', step: 1, status: 'passed', action: 'type_text', remark: 'typed s3cret' });
        r.runEnd({ type: 'run_end', status: 'passed', summary: 'done s3cret', final_state: {}, duration_ms: 5, steps_executed: 1, provider: 'local' });
        out.restore();
        const step = JSON.parse(out.lines[0]);
        const end = JSON.parse(out.lines[1]);
        expect(step).toMatchObject({ type: 'step', step: 1, status: 'passed', action: 'type_text' });
        expect(step.remark).not.toContain('s3cret');
        expect(end).toMatchObject({ type: 'run_end', status: 'passed', steps_executed: 1 });
        expect(end.summary).not.toContain('s3cret');
    });
    it('info() is silent on stdout in agent mode', () => {
        const out = capture(process.stdout);
        new Reporter(true).info('noise');
        out.restore();
        expect(out.lines).toHaveLength(0);
    });
});
```

- [ ] Step 2 `providers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getProvider, listProviders } from '../../dist/providers/index.js';

describe('provider registry', () => {
    it('lists exactly the 5 documented providers', () => {
        expect(listProviders().map((p) => p.id).sort()).toEqual(
            ['browserbase', 'browserstack', 'cdp', 'lambdatest', 'local'],
        );
    });
    it('getProvider throws helpfully on unknown id', () => {
        expect(() => getProvider('nope')).toThrow(/nope|unknown/i);
    });
});
```

- [ ] Step 3: `npm test` → pass. Commit `test: reporter NDJSON schema + provider registry`

### Task 7: CLI e2e (spawned process)

**Files:** Create `tests/e2e/cli.test.ts`

- [ ] Step 1:

```typescript
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const CLI = join(process.cwd(), 'dist/index.js');
const cleanEnv = { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', OLLAMA_BASE_URL: 'http://127.0.0.1:9/v1' };

describe('browserbash CLI', () => {
    it('--help lists all commands', async () => {
        const { stdout } = await run('node', [CLI, '--help']);
        for (const c of ['run', 'testmd', 'login', 'logout', 'whoami', 'providers', 'config', 'init']) {
            expect(stdout).toContain(c);
        }
    });
    it('providers lists 5 with local default', async () => {
        const { stdout } = await run('node', [CLI, 'providers']);
        expect(stdout).toContain('local (default)');
        expect(stdout.trim().split('\n')).toHaveLength(5);
    });
    it('init scaffolds project files', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'bbe2e-'));
        await run('node', [CLI, 'init'], { cwd: dir });
        expect(existsSync(join(dir, '.browserbash/variables/default.json'))).toBe(true);
        expect(existsSync(join(dir, '.browserbash/tests/smoke_test.md'))).toBe(true);
    });
    it('login + config show masks accessKey', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const env = { ...cleanEnv, BROWSERBASH_HOME: home };
        await run('node', [CLI, 'login', '--provider', 'lambdatest', '--username', 'demo', '--access-key', 'secret123'], { env });
        const { stdout } = await run('node', [CLI, 'config', 'show'], { env });
        expect(stdout).toContain('*****');
        expect(stdout).not.toContain('secret123');
    });
    it('missing creds in --agent mode → NDJSON run_end error, exit 2', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const env = { ...cleanEnv, BROWSERBASH_HOME: home, ANTHROPIC_API_KEY: 'sk-test' };
        const r = await run('node', [CLI, 'run', 'x', '--agent', '--provider', 'browserstack'], { env }).catch((e) => e);
        expect(r.code).toBe(2);
        const end = JSON.parse(r.stdout.trim().split('\n').pop()!);
        expect(end.type).toBe('run_end');
        expect(end.status).toBe('error');
    });
    it('builtin engine + ollama model → guard error, exit 2', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const env = { ...cleanEnv, BROWSERBASH_HOME: home };
        const r = await run('node', [CLI, 'run', 'x', '--agent', '--provider', 'browserstack', '--model', 'ollama/qwen3'], { env }).catch((e) => e);
        expect(r.code).toBe(2);
        expect(r.stdout).toMatch(/ANTHROPIC|stagehand/i);
    });
    it('config set rejects unknown key with exit 2', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const r = await run('node', [CLI, 'config', 'set', 'bogus', '1'], { env: { ...cleanEnv, BROWSERBASH_HOME: home } }).catch((e) => e);
        expect(r.code).toBe(2);
    });
});
```

- [ ] Step 2: `npm test` → pass (fix forward any real bugs surfaced; document in commit).
- [ ] Step 3: Commit `test: CLI e2e — commands, scaffolding, masking, error exit codes`

### Task 8: Live smoke + publishability

**Files:** Create `tests/e2e/live.test.ts`, `scripts/verify-pack.sh`; Modify `package.json` (repository/homepage fields)

- [ ] Step 1 `live.test.ts` — env-gated real browser run:

```typescript
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const run = promisify(execFile);
const hasBackend = !!process.env.ANTHROPIC_API_KEY || !!process.env.BB_LIVE;

describe.skipIf(!hasBackend)('live run', () => {
    it('opens example.com and extracts the heading', async () => {
        const { stdout } = await run('node', [join(process.cwd(), 'dist/index.js'), 'run',
            "Open https://example.com and store the main heading text as 'h1'",
            '--agent', '--headless', '--timeout', '120'], { timeout: 180000 });
        const end = JSON.parse(stdout.trim().split('\n').pop()!);
        expect(end.status).toBe('passed');
        expect(JSON.stringify(end.final_state).toLowerCase()).toContain('example');
    }, 180000);
});
```

- [ ] Step 2 `scripts/verify-pack.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
TARBALL=$(npm pack --silent)
DIR=$(mktemp -d)
( cd "$DIR" && npm init -y >/dev/null && npm install --silent "$OLDPWD/$TARBALL" \
  && ./node_modules/.bin/browserbash --help >/dev/null \
  && ./node_modules/.bin/browserbash providers | grep -q 'local (default)' )
rm -rf "$DIR" "$TARBALL"
echo "PACK OK"
```

- [ ] Step 3: `chmod +x scripts/verify-pack.sh && ./scripts/verify-pack.sh` → `PACK OK`
- [ ] Step 4: Add to package.json: `"repository": {"type":"git","url":"git+https://github.com/PramodDutta/browserbash.git"}, "homepage": "https://browserbash.com", "bugs": "https://github.com/PramodDutta/browserbash/issues"`
- [ ] Step 5: Commit `test: live smoke (env-gated) + npm pack verification; package metadata`

## Phase 2 — Site

### Task 9: Scaffold Next.js app

**Files:** Create `site/` via create-next-app

- [ ] Step 1: From repo root: `npx create-next-app@latest site --ts --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-npm --turbopack`
- [ ] Step 2: `cd site && npm install @neondatabase/serverless zod @clerk/nextjs && npm install -D vitest @playwright/test sharp`
- [ ] Step 3: Add `site/.env.local.example` documenting `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_EMAILS`. Append `site/.env*.local` + `site/.next` to root `.gitignore`.
- [ ] Step 4: `npm run build` inside site → clean. Commit `feat(site): scaffold Next.js app`

### Task 10: Design tokens, layout, SEO skeleton

**Files:** Modify `site/app/layout.tsx`, `site/app/globals.css`; Create `site/app/sitemap.ts`, `site/app/robots.ts`, `site/public/llms.txt`

- [ ] Step 1 `globals.css` — light theme tokens (final values tuned during frontend-design pass; these are the contract):

```css
:root {
    --bg: #ffffff; --bg-soft: #f6f8fa; --ink: #111418; --ink-soft: #57606a;
    --accent: #ff5c1a;            /* Bo orange */
    --accent-ink: #ffffff;
    --terminal-bg: #0d1117; --terminal-ink: #e6edf3; --ok: #2da44e; --err: #cf222e;
    --mono: ui-monospace, 'SF Mono', Menlo, monospace;
    --sans: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```

- [ ] Step 2 `layout.tsx` metadata (exact):

```typescript
export const metadata: Metadata = {
    metadataBase: new URL('https://browserbash.com'),
    title: 'BrowserBash — plain-English browser automation CLI',
    description: 'Open-source CLI that turns plain English into real browser automation. Local Chrome, LambdaTest, BrowserStack, Browserbase or any CDP endpoint. Ollama-first, no keys required.',
    alternates: { canonical: '/' },
    openGraph: { title: 'BrowserBash', description: 'Plain English in. Real browser out.', url: 'https://browserbash.com', siteName: 'BrowserBash', images: ['/og.png'], type: 'website' },
    twitter: { card: 'summary_large_image', images: ['/og.png'] },
};
```

- [ ] Step 3: `sitemap.ts` (routes `/`), `robots.ts` (allow all incl. GPTBot/ClaudeBot; sitemap link), `public/llms.txt` (one-paragraph product description + install command + GitHub link).
- [ ] Step 4: JSON-LD `SoftwareApplication` script tag in layout (name BrowserBash, applicationCategory DeveloperApplication, OS cross-platform, offers price 0 USD, url, sameAs GitHub).
- [ ] Step 5: `npm run build` clean. Commit `feat(site): theme tokens, metadata, sitemap/robots/llms.txt, JSON-LD`

### Task 11: Bo mascot component + assets

**Files:** Create `site/components/Bo.tsx`, `site/components/bo.css`, `site/scripts/render-assets.mjs`; outputs `site/public/og.png`, `site/app/icon.png`

- [ ] Step 1: `Bo.tsx` — inline SVG pixel sprite on 16×16 grid scaled up (`shape-rendering: crispEdges`, `image-rendering: pixelated`). Frame groups `#idle-1 #idle-2 #walk-1..4 #bash-1..3 #happy`; orange body (`--accent`), hammer, browser-window target sprite with crack overlay. Props: `pose: 'idle' | 'walk' | 'bash' | 'happy'`, `size: number`. Pixel grid authored during frontend-design pass — behavior contract: CSS `steps()` frame cycling, click toggles `.bashing` class for 600 ms, window sprite gains `.cracked`.
- [ ] Step 2: `bo.css` — `@keyframes` per pose using visibility toggling between frame groups; honors reduced-motion globally.
- [ ] Step 3: `render-assets.mjs` — playwright-core + system Chrome: render Bo SVG inside branded 1200×630 HTML → screenshot `public/og.png`; 512×512 → `app/icon.png` (Next serves as favicon). Run + verify both files exist.
- [ ] Step 4: Commit `feat(site): Bo pixel mascot, ambient/bash animations, og + favicon assets`

### Task 12: Neon db lib + waitlist API

**Files:** Create `site/lib/db.ts`, `site/lib/waitlist.ts`, `site/app/api/waitlist/route.ts`, `site/app/api/stats/route.ts`, `site/scripts/db-init.mjs`

- [ ] Step 1 `lib/db.ts`:

```typescript
import { neon } from '@neondatabase/serverless';

export function sql(): ReturnType<typeof neon> {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    return neon(url);
}
```

- [ ] Step 2 `lib/waitlist.ts` — validation + insert logic (unit-testable, no Next deps):

```typescript
import { z } from 'zod';

export const WaitlistInput = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().max(100).optional(),
    useCase: z.string().trim().max(500).optional(),
    website: z.string().max(0).optional(),   // honeypot — any content = bot
});
export type WaitlistInputT = z.infer<typeof WaitlistInput>;

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export async function addToWaitlist(db: Sql, input: WaitlistInputT): Promise<{ position: number; already: boolean }> {
    const inserted = await db`
        INSERT INTO waitlist (email, name, use_case)
        VALUES (${input.email}, ${input.name ?? null}, ${input.useCase ?? null})
        ON CONFLICT (email) DO NOTHING RETURNING id`;
    const [{ count }] = await db`SELECT COUNT(*)::int AS count FROM waitlist`;
    return { position: Number(count), already: inserted.length === 0 };
}
```

- [ ] Step 3 `app/api/waitlist/route.ts` — POST handler: parse JSON → honeypot filled → fake 200; zod fail → 400 with first issue message; per-IP throttle (in-memory Map, 5/min — per-instance only, layered with honeypot + unique email constraint); DB error → 503; success → `{ position, already }`.
- [ ] Step 4 `app/api/stats/route.ts` — `SELECT COUNT(*)` → `{ count }` with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`; DB error → `{ count: null }` 200 (counter hides itself).
- [ ] Step 5 `scripts/db-init.mjs` — runs spec's `CREATE TABLE IF NOT EXISTS waitlist (...)` via `@neondatabase/serverless` using `DATABASE_URL`.
- [ ] Step 6: Commit `feat(site): Neon waitlist + stats APIs, db init script`

### Task 13: API unit tests

**Files:** Create `site/lib/waitlist.test.ts`, `site/vitest.config.ts`; Modify `site/package.json` (`"test": "vitest run"`)

- [ ] Step 1 — test validation + insert logic with stub db:

```typescript
import { describe, it, expect } from 'vitest';
import { WaitlistInput, addToWaitlist } from './waitlist';

function stubDb(existing: Set<string>) {
    const rows: string[] = [...existing];
    return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const q = strings.join('?');
        if (q.includes('INSERT')) {
            const email = String(values[0]);
            if (rows.includes(email)) return [];
            rows.push(email);
            return [{ id: rows.length }];
        }
        return [{ count: rows.length }];
    }) as never;
}

describe('WaitlistInput', () => {
    it('normalizes email to lowercase', () => {
        expect(WaitlistInput.parse({ email: ' Pramod@X.COM ' }).email).toBe('pramod@x.com');
    });
    it('rejects invalid email', () => {
        expect(() => WaitlistInput.parse({ email: 'nope' })).toThrow();
    });
    it('rejects filled honeypot', () => {
        expect(() => WaitlistInput.parse({ email: 'a@b.co', website: 'spam' })).toThrow();
    });
});

describe('addToWaitlist', () => {
    it('inserts and returns position', async () => {
        const r = await addToWaitlist(stubDb(new Set()), { email: 'a@b.co' });
        expect(r).toEqual({ position: 1, already: false });
    });
    it('duplicate email is idempotent', async () => {
        const r = await addToWaitlist(stubDb(new Set(['a@b.co'])), { email: 'a@b.co' });
        expect(r.already).toBe(true);
    });
});
```

- [ ] Step 2: `cd site && npm test` → pass. Commit `test(site): waitlist validation + insert logic`

### Task 14: Demo recordings

**Files:** Create `site/scripts/record-demo.mjs`, `site/public/demos/*.json` (5 recordings)

- [ ] Step 1 `record-demo.mjs` — spawns `node ../dist/index.js run "<objective>" --agent --headless`, captures each stdout line with a relative timestamp → writes `{ objective, command, events: [{ t, line }] }` JSON. Human-mode view is derived client-side from the same NDJSON (single honest source).
- [ ] Step 2: Record 5 objectives (requires LLM backend — Ollama or `ANTHROPIC_API_KEY`; if neither on this machine, get key from Pramod first): HN top story · example.com heading · GitHub repo star count · Wikipedia search · form fill on a demo site.
- [ ] Step 3: Spot-check JSONs replay sensibly (timestamps monotonic, run_end last). Commit `feat(site): real recorded demo runs for replay terminal`

### Task 15: Terminal replay component

**Files:** Create `site/components/Terminal.tsx`, `site/components/terminal.css`

- [ ] Step 1: `Terminal.tsx` — props `{ demo: DemoRecording; autoplay?: boolean }`. Renders macOS-style chrome (dots, title `browserbash run …`), replays `events` honoring `t` (capped at 800 ms/gap), blinking block cursor, tabs **Human** (NDJSON → `✓ [n] action: remark` lines, verdict line colored `--ok`/`--err`) and **NDJSON** (raw lines). Replay driven by `setTimeout` chain; restart button; starts when scrolled into view (`IntersectionObserver`) if `autoplay`.
- [ ] Step 2: Render with one recording on a scratch page, verify both tabs + reduced-motion (instant render, no typewriter).
- [ ] Step 3: Commit `feat(site): terminal replay component with human/NDJSON tabs`

### Task 16: Landing page assembly

**Files:** Create `site/components/{Nav,Hero,WaitlistForm,TryIt,HowItWorks,Features,QuickStart,Footer}.tsx` + co-located CSS; Modify `site/app/page.tsx`

Content contract (visual polish via frontend-design skill at execution):

- [ ] Step 1 **Nav** — Bo 24 px + "BrowserBash" wordmark; anchors Demo · How it works · Features · Quick start; GitHub button (`github.com/PramodDutta/browserbash`).
- [ ] Step 2 **Hero** — h1 "Plain English in. Real browser out."; sub "BrowserBash is an open-source CLI where an AI agent drives a real browser from a plain-English objective. Local Chrome, LambdaTest, BrowserStack, Browserbase or any CDP endpoint — Ollama-first, zero keys required."; copyable `npm install -g browserbash-cli` block; `WaitlistForm`; live counter ("Join N others…", hidden when `count: null`); Bo ambient idle/walk + click-to-bash with window-crack.
- [ ] Step 3 **WaitlistForm** — email (required) + optional "What do you want to automate?" expander + hidden `website` honeypot; states: idle/loading/success ("You're #N on the list 🔨")/duplicate ("Already on the list — see you Monday")/error (retry). POSTs `/api/waitlist`.
- [ ] Step 4 **Demo section** — `<Terminal autoplay demo={hn}/>`.
- [ ] Step 5 **TryIt** — 5 objective chips → swaps Terminal recording; caption "These are real recorded runs — install and run the same command yourself"; copy-command button per demo.
- [ ] Step 6 **HowItWorks** — 3 columns Provider/Engine/LLM (exact rows from CLI README tables); free-stack callout: `ollama pull qwen3` → `browserbash run "..."` — no API keys.
- [ ] Step 7 **Features** — 6 cards: OSS-first (Apache-2.0/MIT) · `--agent` NDJSON + exit codes · markdown tests with `@import` · 5 providers, one flag · secrets masked `*****` · CI-ready (exit code = verdict).
- [ ] Step 8 **QuickStart** — install, first run, testmd snippet, GitHub Actions YAML (from README).
- [ ] Step 9 **Footer** — GitHub · npm · Apache-2.0 · "Built by The Testing Academy" · tiny Bo.
- [ ] Step 10: Assemble in `page.tsx` (static, no client fetch except counter + form), `npm run build` clean, Lighthouse local ≥ 95 perf/SEO/a11y/best-practices. Commit `feat(site): landing page sections`

### Task 17: Clerk + dashboard

**Files:** Create `site/middleware.ts`, `site/app/dashboard/page.tsx`, `site/app/api/export/route.ts`, `site/lib/admin.ts`

- [ ] Step 1 `middleware.ts` — `clerkMiddleware` + `createRouteMatcher(['/dashboard(.*)', '/api/export'])` → `auth.protect()`.
- [ ] Step 2 `lib/admin.ts` — `isAdmin(email?)`: lowercase membership check in `ADMIN_EMAILS` (comma-separated env).
- [ ] Step 3 `dashboard/page.tsx` (server component) — `currentUser()` → `!isAdmin(primaryEmail)` → `notFound()`; else query Neon: total count, last-7-day daily counts (CSS bar chart), latest 50 rows table (email/name/use-case/date), link to `/api/export`.
- [ ] Step 4 `api/export/route.ts` — same admin check → all rows as `text/csv` attachment.
- [ ] Step 5: Works keyless in dev (Clerk dev instance); real keys at deploy. Commit `feat(site): Clerk-protected admin dashboard + CSV export`

### Task 18: Site e2e (Playwright)

**Files:** Create `site/playwright.config.ts`, `site/e2e/landing.spec.ts`

- [ ] Step 1: Config with `webServer: { command: 'npm run dev', port: 3000 }`, chromium only.
- [ ] Step 2 `landing.spec.ts` — route-mock `/api/waitlist` + `/api/stats`:
  - submit valid email → success state shows position
  - duplicate response → duplicate message
  - stats 42 → counter shows 42; stats `null` → counter hidden
  - `/dashboard` unauthenticated → redirected off-page (Clerk sign-in)
  - demo terminal renders + tab switch works
- [ ] Step 3: `npx playwright test` → pass. Commit `test(site): Playwright e2e for waitlist, counter, dashboard gate`

## Phase 3 — Ship

### Task 19: Push GitHub

- [ ] Step 1: `git remote add origin git@github.com:PramodDutta/browserbash.git`
- [ ] Step 2: `git push --force origin main` (placeholder README confirmed disposable — only auto-generated file in repo)
- [ ] Step 3: Verify on GitHub; root README renders. Update README top with site link + waitlist line. Commit + push.

### Task 20: Vercel + Neon + Clerk wiring (needs Pramod's creds)

- [ ] Step 1: Neon — get `DATABASE_URL` (or `npm i -g neonctl && neonctl auth` → create project `browserbash`); run `node site/scripts/db-init.mjs`.
- [ ] Step 2: Clerk — get publishable + secret keys + admin email.
- [ ] Step 3: `cd site && vercel link` (scope luckydutta96, new project `browserbash`, root = site/ via dashboard since repo-root ≠ app), `vercel env add` for all 4 vars (production + preview), `vercel deploy` → preview smoke (submit waitlist → row in Neon → dashboard shows), `vercel --prod`.
- [ ] Step 4: GitHub integration: connect repo in Vercel dashboard, root directory `site/`, so pushes auto-deploy.

### Task 21: Domain

- [ ] Step 1: `vercel domains add browserbash.com` (project browserbash).
- [ ] Step 2: At registrar (name from Pramod): apex `A 76.76.21.21` (or Vercel-shown value), `www` `CNAME cname.vercel-dns.com`. www → apex redirect in Vercel.
- [ ] Step 3: Wait DNS + HTTPS cert green; `curl -I https://browserbash.com` → 200.

### Task 22: npm publish (Monday)

- [ ] Step 1: `npm whoami` (login if needed); confirm name free: `npm view browserbash-cli` → 404 expected.
- [ ] Step 2: `./scripts/verify-pack.sh` → PACK OK.
- [ ] Step 3: `npm publish --access public`; verify `npx browserbash-cli@latest --help` from clean dir... (bin name is `browserbash`; package name `browserbash-cli`).
- [ ] Step 4: Tag `v0.1.0`, push tag; GitHub release notes.

### Task 23: Post-deploy verification

- [ ] Step 1: Real submit on https://browserbash.com → row in Neon (`SELECT`) → visible in /dashboard → CSV export contains it.
- [ ] Step 2: Lighthouse prod run ≥ 95 ×4; fix regressions.
- [ ] Step 3: OG preview check (opengraph.xyz), favicon, llms.txt/robots/sitemap reachable.
- [ ] Step 4: Full CLI test suite green (`npm test`), live smoke with backend (`BB_LIVE=1`).

## Self-review notes

- Spec coverage: sections 1–8 of spec map to Tasks 9–18; CLI matrix → Tasks 1–8; ship → 19–23. ✔
- UI component internals intentionally specified as content/behavior contracts; pixel-level work happens at execution with the frontend-design skill (this is a decision, not a placeholder).
- Type consistency: `WaitlistInput`/`addToWaitlist` used identically in Tasks 12/13; `DemoRecording` shape defined Task 14, consumed Task 15. ✔
