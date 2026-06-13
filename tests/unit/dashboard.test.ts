import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDashboard } from '../../dist/dashboard/server.js';
import { persistRun } from '../../dist/local-store.js';
import type { RunResult } from '../../dist/types.js';

let home: string;
let handle: { url: string; close: () => Promise<void> } | null = null;

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-dash-'));
    process.env.BROWSERBASH_HOME = home;
});

afterEach(async () => {
    if (handle) await handle.close();
    handle = null;
    delete process.env.BROWSERBASH_HOME;
    fs.rmSync(home, { recursive: true, force: true });
});

const result: RunResult = { status: 'failed', summary: 'x', finalState: {}, stepsExecuted: 1, durationMs: 900 };

describe('dashboard server', () => {
    it('serves the HTML shell and the runs API', async () => {
        persistRun({ objective: 'Visit the grid', result, provider: 'lambdatest', model: 'm', variables: {} });
        handle = await startDashboard(4790);

        const html = await fetch('http://localhost:4790/').then((r) => r.text());
        expect(html).toContain('BrowserBash');
        expect(html).toContain('local dashboard');

        const api = await fetch('http://localhost:4790/api/runs').then((r) => r.json());
        expect(api.runs).toHaveLength(1);
        expect(api.runs[0].provider).toBe('lambdatest');

        const missing = await fetch('http://localhost:4790/api/runs/nope');
        expect(missing.status).toBe(404);
    });
});
