import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { persistRun, listRuns, getRun, artifactPath, clearRuns } from '../../dist/local-store.js';
import type { RunResult } from '../../dist/types.js';

let home: string;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-store-'));
    process.env.BROWSERBASH_HOME = home;
});

afterEach(() => {
    delete process.env.BROWSERBASH_HOME;
    fs.rmSync(home, { recursive: true, force: true });
});

const result = (over: Partial<RunResult> = {}): RunResult => ({
    status: 'passed', summary: 'ok', finalState: { h1: 'Example' },
    stepsExecuted: 3, durationMs: 1500, ...over,
});

describe('local-store', () => {
    it('persists a run and lists it back', () => {
        const id = persistRun({ objective: 'Open example.com', result: result(), provider: 'local', model: 'ollama/qwen3', variables: {} });
        expect(id).toBeTypeOf('string');
        const runs = listRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0].objective).toBe('Open example.com');
        expect(runs[0].status).toBe('passed');
        expect(runs[0].provider).toBe('local');
        expect(getRun(id!)?.id).toBe(id);
    });

    it('masks secret values before writing to disk', () => {
        const id = persistRun({
            objective: 'Log in with {{password}}',
            result: result({ finalState: { token: 'hunter2' } }),
            provider: 'local', model: 'm',
            variables: { password: { value: 'hunter2', secret: true } },
        });
        const onDisk = fs.readFileSync(path.join(home, 'runs', id!, 'meta.json'), 'utf-8');
        expect(onDisk).not.toContain('hunter2');
        expect(onDisk).toContain('*****');
    });

    it('copies artifacts and exposes their paths, guarding traversal', () => {
        const shot = path.join(home, 'shot.png');
        fs.writeFileSync(shot, 'PNGDATA');
        const id = persistRun({ objective: 'rec', result: result({ artifacts: { screenshot: shot } }), provider: 'local', model: 'm', variables: {} });
        expect(getRun(id!)?.artifacts.screenshot).toBe(true);
        expect(artifactPath(id!, 'screenshot')).toBeTruthy();
        expect(artifactPath('../../etc/passwd', 'screenshot')).toBeNull();
    });

    it('newest run sorts first and clear empties the store', () => {
        const a = persistRun({ objective: 'first', result: result(), provider: 'local', model: 'm', variables: {} });
        const b = persistRun({ objective: 'second', result: result(), provider: 'local', model: 'm', variables: {} });
        expect([a, b].every(Boolean)).toBe(true);
        expect(listRuns()[0].objective).toBe('second');
        expect(clearRuns()).toBe(2);
        expect(listRuns()).toHaveLength(0);
    });
});
