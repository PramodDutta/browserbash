import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncRun, CLI_VERSION } from '../../dist/sync.js';
import type { BrowserBashConfig } from '../../dist/config.js';
import type { RunResult } from '../../dist/types.js';

const baseConfig: BrowserBashConfig = {
    defaultProvider: 'local', engine: 'stagehand', model: 'auto',
    headless: true, maxSteps: 30, timeoutSec: 300, credentials: {},
};

const result: RunResult = {
    status: 'passed', summary: 'ok', finalState: { h1: 'Example' },
    stepsExecuted: 3, durationMs: 1500,
};

afterEach(() => vi.restoreAllMocks());

describe('syncRun', () => {
    it('is a no-op without an apiKey (privacy default)', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        await syncRun(baseConfig, 'obj', result, {}, 'local', 'auto', () => {});
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('posts masked objective with bearer key when connected', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        const logs: string[] = [];
        await syncRun(
            { ...baseConfig, apiKey: 'bb_' + 'a'.repeat(40), apiBase: 'https://example.test' },
            'login with hunter2',
            result,
            { pw: { value: 'hunter2', secret: true } },
            'local',
            'ollama/qwen3',
            (m) => logs.push(m),
        );
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://example.test/api/runs');
        expect((init.headers as Record<string, string>).Authorization).toContain('Bearer bb_');
        const body = JSON.parse(init.body as string);
        expect(body.objective).not.toContain('hunter2');
        expect(body.objective).toContain('*****');
        expect(body.status).toBe('passed');
        expect(body.cli_version).toBe(CLI_VERSION);
        expect(logs.some((l) => l.includes('synced'))).toBe(true);
    });

    it('never throws on network failure', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
        const logs: string[] = [];
        await expect(
            syncRun({ ...baseConfig, apiKey: 'bb_' + 'b'.repeat(40) }, 'obj', result, {}, 'local', 'auto', (m) => logs.push(m)),
        ).resolves.toBeUndefined();
        expect(logs.some((l) => l.includes('skipped'))).toBe(true);
    });
});
