import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const CLI = join(process.cwd(), 'dist/index.js');

// No LLM backends, no Ollama: deterministic error paths.
const cleanEnv = {
    ...process.env,
    ANTHROPIC_API_KEY: '',
    OPENAI_API_KEY: '',
    OLLAMA_BASE_URL: 'http://127.0.0.1:9/v1',
};

interface ExecError extends Error {
    code: number;
    stdout: string;
    stderr: string;
}

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

    it('login/connect + config show mask secrets', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const env = { ...cleanEnv, BROWSERBASH_HOME: home };
        await run('node', [CLI, 'login', '--provider', 'lambdatest', '--username', 'demo', '--access-key', 'secret123'], { env });
        await run('node', [CLI, 'connect', '--key', `bb_${'a'.repeat(40)}`], { env });
        const { stdout } = await run('node', [CLI, 'config', 'show'], { env });
        expect(stdout).toContain('*****');
        expect(stdout).not.toContain('secret123');
        expect(stdout).not.toContain(`bb_${'a'.repeat(40)}`);
    });

    it('missing creds in --agent mode → NDJSON run_end error, exit 2', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const env = { ...cleanEnv, BROWSERBASH_HOME: home, ANTHROPIC_API_KEY: 'sk-test' };
        const r = (await run('node', [CLI, 'run', 'x', '--agent', '--provider', 'browserstack'], { env })
            .catch((e: ExecError) => e)) as ExecError;
        expect(r.code).toBe(2);
        const end = JSON.parse(r.stdout.trim().split('\n').pop()!);
        expect(end.type).toBe('run_end');
        expect(end.status).toBe('error');
    });

    it('builtin engine + ollama model → guard error, exit 2', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const env = { ...cleanEnv, BROWSERBASH_HOME: home };
        const r = (await run('node', [CLI, 'run', 'x', '--agent', '--provider', 'browserstack', '--model', 'ollama/qwen3'], { env })
            .catch((e: ExecError) => e)) as ExecError;
        expect(r.code).toBe(2);
        expect(r.stdout).toMatch(/ANTHROPIC|stagehand/i);
    });

    it('config set rejects unknown key with exit 2', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const r = (await run('node', [CLI, 'config', 'set', 'bogus', '1'], { env: { ...cleanEnv, BROWSERBASH_HOME: home } })
            .catch((e: ExecError) => e)) as ExecError;
        expect(r.code).toBe(2);
    });

    it('invalid numeric run flags fail before backend detection', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const r = (await run('node', [CLI, 'run', 'x', '--agent', '--max-steps', 'nope'], { env: { ...cleanEnv, BROWSERBASH_HOME: home } })
            .catch((e: ExecError) => e)) as ExecError;
        expect(r.code).toBe(2);
        const end = JSON.parse(r.stdout.trim());
        expect(end.status).toBe('error');
        expect(end.summary).toMatch(/max-steps must be a positive integer/);
    });

    it('config set validates provider and numeric values', async () => {
        const home = mkdtempSync(join(tmpdir(), 'bbh-'));
        const env = { ...cleanEnv, BROWSERBASH_HOME: home };
        const badProvider = (await run('node', [CLI, 'config', 'set', 'defaultProvider', 'nope'], { env })
            .catch((e: ExecError) => e)) as ExecError;
        expect(badProvider.code).toBe(2);
        expect(badProvider.stderr).toContain('Unknown provider');

        const badSteps = (await run('node', [CLI, 'config', 'set', 'maxSteps', 'nan'], { env })
            .catch((e: ExecError) => e)) as ExecError;
        expect(badSteps.code).toBe(2);
        expect(badSteps.stderr).toContain('maxSteps must be a positive integer');
    });
});
