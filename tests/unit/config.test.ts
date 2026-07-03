import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

afterEach(() => {
    vi.unstubAllEnvs();
});

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

describe('mergeConfig', () => {
    it('partial nested section keeps sibling defaults', async () => {
        const { mergeConfig } = await import('../../dist/config.js');
        const defaults = { a: 1, nested: { x: 1, y: 2 } };
        const merged = mergeConfig(defaults, { nested: { x: 9 } } as never);
        expect(merged).toEqual({ a: 1, nested: { x: 9, y: 2 } });
    });

    it('scalar and array values replace, undefined ignored', async () => {
        const { mergeConfig } = await import('../../dist/config.js');
        const defaults = { a: 1, list: [1, 2], nested: { x: 1 } };
        const merged = mergeConfig(defaults, { a: 5, list: [9], nested: undefined } as never);
        expect(merged).toEqual({ a: 5, list: [9], nested: { x: 1 } });
    });
});

describe('cache config', () => {
    it('defaults on with project-local dir', async () => {
        const { loadConfig } = await import('../../dist/config.js');
        const c = loadConfig();
        expect(c.cache).toEqual({ enabled: true, dir: '.browserbash/cache' });
    });
});
