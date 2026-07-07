import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-auth-'));
    process.env.BROWSERBASH_HOME = dir;
});

afterEach(() => {
    delete process.env.BROWSERBASH_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
});

const STATE = {
    cookies: [{ name: 's', value: 'x', domain: '.app.example.com' }],
    origins: [{ origin: 'https://app.example.com', localStorage: [{ name: 'token', value: 't' }] }],
};

describe('auth-store', () => {
    it('saves, resolves and lists profiles with origins', async () => {
        const { saveAuthProfile, resolveAuthProfile, listAuthProfiles } = await import('../../src/auth-store.js');
        const saved = saveAuthProfile('staging', STATE, '2026-07-07T00:00:00Z');
        expect(saved.origins).toContain('https://app.example.com');

        const resolved = resolveAuthProfile('staging');
        expect(resolved.savedAt).toBe('2026-07-07T00:00:00Z');
        expect(listAuthProfiles().map((p) => p.name)).toEqual(['staging']);
    });

    it('writes the state file with owner-only permissions', async () => {
        const { saveAuthProfile } = await import('../../src/auth-store.js');
        const saved = saveAuthProfile('perm', STATE, '2026-07-07T00:00:00Z');
        const mode = fs.statSync(saved.file).mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it('rejects path-traversal profile names', async () => {
        const { saveAuthProfile } = await import('../../src/auth-store.js');
        expect(() => saveAuthProfile('../evil', STATE, 'now')).toThrow(/may only contain/);
    });

    it('gives a fix-forward error for unknown profiles', async () => {
        const { resolveAuthProfile } = await import('../../src/auth-store.js');
        expect(() => resolveAuthProfile('nope')).toThrow(/auth save nope/);
    });

    it('checks origin coverage including subdomains', async () => {
        const { saveAuthProfile, profileCoversOrigin } = await import('../../src/auth-store.js');
        const p = saveAuthProfile('cov', STATE, 'now');
        expect(profileCoversOrigin(p, 'https://app.example.com/dashboard')).toBe(true);
        expect(profileCoversOrigin(p, 'https://example.com/')).toBe(true);
        expect(profileCoversOrigin(p, 'https://other.com/')).toBe(false);
        expect(profileCoversOrigin(p, undefined)).toBe(true);
    });

    it('deletes profiles', async () => {
        const { saveAuthProfile, deleteAuthProfile, listAuthProfiles } = await import('../../src/auth-store.js');
        saveAuthProfile('gone', STATE, 'now');
        expect(deleteAuthProfile('gone')).toBe(true);
        expect(deleteAuthProfile('gone')).toBe(false);
        expect(listAuthProfiles()).toEqual([]);
    });
});
