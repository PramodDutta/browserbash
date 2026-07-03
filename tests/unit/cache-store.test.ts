import { describe, it, expect } from 'vitest';
import {
    journalKey,
    journalPath,
    loadJournal,
    saveJournal,
    deleteJournal,
    retemplatize,
    retemplatizeInput,
    normalizeUrl,
    type ActionJournal,
} from '../../dist/cache-store.js';
import { replayJournal, ReplayMiss, ReplaySecurityError } from '../../dist/engine/replay.js';
import { Reporter } from '../../dist/output.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { VariableValue } from '../../dist/types.js';

const vars: Record<string, VariableValue> = {
    name: { value: 'PramodSecret77', secret: true },
    base: { value: 'http://127.0.0.1:9999' },
};

describe('journalKey', () => {
    it('stable for same inputs, changes with objective/keys/startUrl', () => {
        const a = journalKey('do the thing with {{name}}', vars, 'http://x');
        expect(a).toMatch(/^[0-9a-f]{16}$/);
        expect(journalKey('do the thing with {{name}}', vars, 'http://x')).toBe(a);
        expect(journalKey('DIFFERENT', vars, 'http://x')).not.toBe(a);
        expect(journalKey('do the thing with {{name}}', {}, 'http://x')).not.toBe(a);
        expect(journalKey('do the thing with {{name}}', vars, 'http://y')).not.toBe(a);
    });

    it('keys on variable NAMES, not values', () => {
        const other: Record<string, VariableValue> = {
            name: { value: 'CompletelyDifferent', secret: true },
            base: { value: 'http://elsewhere' },
        };
        expect(journalKey('obj', vars)).toBe(journalKey('obj', other));
    });
});

describe('retemplatize', () => {
    it('replaces values with {{name}} tokens, longest first', () => {
        expect(retemplatize('typed PramodSecret77 at http://127.0.0.1:9999/form', vars))
            .toBe('typed {{name}} at {{base}}/form');
    });

    it('flags inputs that carry variables', () => {
        const r = retemplatizeInput({ target: '#name', text: 'PramodSecret77' }, vars);
        expect(r.input).toEqual({ target: '#name', text: '{{name}}' });
        expect(r.carriesVariables).toBe(true);
        const clean = retemplatizeInput({ target: '#other', text: 'hello' }, vars);
        expect(clean.carriesVariables).toBe(false);
    });
});

describe('normalizeUrl', () => {
    it('keeps origin + path, drops query and trailing slash', () => {
        expect(normalizeUrl('http://a.com/x/?q=1')).toEqual({ origin: 'http://a.com', normalized: 'http://a.com/x' });
        expect(normalizeUrl('http://a.com')).toEqual({ origin: 'http://a.com', normalized: 'http://a.com/' });
    });
});

describe('journal persistence', () => {
    it('save/load/delete round-trip, rejects wrong schema', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-cache-'));
        const file = journalPath(dir, 'abc123');
        const j: ActionJournal = {
            v: 1, engine: 'builtin', recordedModel: 'm', variableKeys: ['name'],
            actions: [{ tool: 'navigate', input: { url: '{{base}}/x' }, urlBefore: 'null/', origin: 'null', carriesVariables: true }],
            stats: { hits: 0, heals: 0 },
        };
        saveJournal(file, j);
        expect(loadJournal(file)?.actions).toHaveLength(1);
        fs.writeFileSync(file, JSON.stringify({ ...j, v: 99 }));
        expect(loadJournal(file)).toBeNull();
        deleteJournal(file);
        expect(loadJournal(file)).toBeNull();
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

/** Minimal Page shim for replay tests: scripted behaviors per selector. */
function pageShim(state: { url: string; failSelectors?: Set<string>; texts?: Record<string, string> }) {
    const locator = (sel: string) => ({
        first: () => ({
            waitFor: async () => {
                if (state.failSelectors?.has(sel)) throw new Error(`Timeout waiting for ${sel}`);
            },
            click: async () => {
                if (state.failSelectors?.has(sel)) throw new Error(`Timeout clicking ${sel}`);
            },
            fill: async (_v: string) => {
                if (state.failSelectors?.has(sel)) throw new Error(`Timeout filling ${sel}`);
            },
            press: async () => {},
            textContent: async () => state.texts?.[sel] ?? 'shim-text',
        }),
    });
    return {
        url: () => state.url,
        goto: async (u: string) => { state.url = u; },
        locator,
        getByText: (t: string) => locator(`text=${t}`),
    };
}

const silentReporter = new Reporter(true, {});
const origWrite = process.stdout.write.bind(process.stdout);
function muted<T>(fn: () => Promise<T>): Promise<T> {
    process.stdout.write = (() => true) as never;
    return fn().finally(() => { (process.stdout as { write: unknown }).write = origWrite; });
}

describe('replayJournal', () => {
    const journal: ActionJournal = {
        v: 1, engine: 'builtin', recordedModel: 'm', variableKeys: ['name', 'base'],
        actions: [
            { tool: 'navigate', input: { url: '{{base}}/form.html' }, urlBefore: 'null/', origin: 'null', carriesVariables: true },
            { tool: 'type_text', input: { target: '#name', text: '{{name}}' }, urlBefore: 'http://127.0.0.1:9999/form.html', origin: 'http://127.0.0.1:9999', carriesVariables: true },
            { tool: 'extract', input: { target: '#greeting', store_as: 'greet' }, urlBefore: 'http://127.0.0.1:9999/form.html', origin: 'http://127.0.0.1:9999', carriesVariables: false },
        ],
        stats: { hits: 0, heals: 0 },
    };

    it('replays green and substitutes fresh values, collects extracts', async () => {
        const page = pageShim({ url: 'about:blank', texts: { '#greeting': 'Hello!' } });
        const state = await muted(() => replayJournal(page as never, journal, vars, silentReporter));
        expect(state).toEqual({ greet: 'Hello!' });
        expect(page.url()).toBe('http://127.0.0.1:9999/form.html');
    });

    it('origin pin blocks secret-carrying action on the wrong origin', async () => {
        const tampered: ActionJournal = {
            ...journal,
            actions: [
                { tool: 'navigate', input: { url: 'http://evil.example/login' }, urlBefore: 'null/', origin: 'null', carriesVariables: false },
                journal.actions[1],
            ],
        };
        const page = pageShim({ url: 'about:blank' });
        await expect(muted(() => replayJournal(page as never, tampered, vars, silentReporter)))
            .rejects.toBeInstanceOf(ReplaySecurityError);
    });

    it('throws ReplayMiss with the green prefix and collected state', async () => {
        const page = pageShim({ url: 'about:blank', failSelectors: new Set(['#name']), texts: {} });
        try {
            await muted(() => replayJournal(page as never, journal, vars, silentReporter));
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(ReplayMiss);
            const miss = err as ReplayMiss;
            expect(miss.completedActions).toHaveLength(1);
            expect(miss.completedActions[0].tool).toBe('navigate');
        }
    });
});
