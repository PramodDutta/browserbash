import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    loadMemory,
    saveMemory,
    recordOutcome,
    orderTests,
    flakyReport,
    testKey,
    type MemoryFile,
} from '../../dist/memory-store.js';

const ISO = '2026-07-03T00:00:00.000Z';
const empty: MemoryFile = { v: 1, tests: {} };

describe('recordOutcome', () => {
    it('accumulates runs/passes and seeds then smooths EWMA duration', () => {
        let m = recordOutcome(empty, { testPath: '/t/a_test.md', verdict: 'passed', durationMs: 1000, nowIso: ISO });
        expect(m.tests[testKey('/t/a_test.md')]).toMatchObject({ runs: 1, passes: 1, ewmaDurationMs: 1000, lastStatus: 'passed' });
        m = recordOutcome(m, { testPath: '/t/a_test.md', verdict: 'failed', durationMs: 3000, nowIso: ISO });
        const h = m.tests[testKey('/t/a_test.md')];
        // EWMA: 0.3*3000 + 0.7*1000 = 1600
        expect(h).toMatchObject({ runs: 2, passes: 1, ewmaDurationMs: 1600, lastStatus: 'failed' });
    });

    it('counts flaky and heals', () => {
        let m = recordOutcome(empty, { testPath: '/t/b_test.md', verdict: 'passed', durationMs: 500, flaky: true, healed: true, nowIso: ISO });
        m = recordOutcome(m, { testPath: '/t/b_test.md', verdict: 'passed', durationMs: 500, nowIso: ISO });
        expect(m.tests[testKey('/t/b_test.md')]).toMatchObject({ flaky: 1, heals: 1, runs: 2 });
    });
});

describe('orderTests', () => {
    it('previously-failed first, then slowest, unknowns middle, name tiebreak', () => {
        let m = empty;
        m = recordOutcome(m, { testPath: '/t/fast_test.md', verdict: 'passed', durationMs: 100, nowIso: ISO });
        m = recordOutcome(m, { testPath: '/t/slow_test.md', verdict: 'passed', durationMs: 9000, nowIso: ISO });
        m = recordOutcome(m, { testPath: '/t/broken_test.md', verdict: 'failed', durationMs: 200, nowIso: ISO });
        const ordered = orderTests(
            ['/t/fast_test.md', '/t/slow_test.md', '/t/broken_test.md', '/t/new_test.md'],
            m,
        ).map((f) => path.basename(f));
        // broken (failed) first, then unknown new, then slow before fast among passed
        expect(ordered).toEqual(['broken_test.md', 'new_test.md', 'slow_test.md', 'fast_test.md']);
    });

    it('is a no-op ordering when memory is empty (name sort)', () => {
        const ordered = orderTests(['/t/b_test.md', '/t/a_test.md'], empty).map((f) => path.basename(f));
        expect(ordered).toEqual(['a_test.md', 'b_test.md']);
    });
});

describe('flakyReport', () => {
    it('lists flaky tests most-flaky first', () => {
        let m = empty;
        m = recordOutcome(m, { testPath: '/t/x_test.md', verdict: 'passed', durationMs: 1, flaky: true, nowIso: ISO });
        m = recordOutcome(m, { testPath: '/t/y_test.md', verdict: 'passed', durationMs: 1, flaky: true, nowIso: ISO });
        m = recordOutcome(m, { testPath: '/t/y_test.md', verdict: 'passed', durationMs: 1, flaky: true, nowIso: ISO });
        m = recordOutcome(m, { testPath: '/t/z_test.md', verdict: 'passed', durationMs: 1, nowIso: ISO });
        const rep = flakyReport(m).map((t) => path.basename(t.path));
        expect(rep).toEqual(['y_test.md', 'x_test.md']);
    });
});

describe('persistence', () => {
    it('round-trips and ignores a wrong-schema file', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-mem-'));
        const file = path.join(dir, 'history.json');
        const m = recordOutcome(empty, { testPath: '/t/a_test.md', verdict: 'passed', durationMs: 1, nowIso: ISO });
        saveMemory(file, m);
        expect(Object.keys(loadMemory(file).tests)).toHaveLength(1);
        fs.writeFileSync(file, JSON.stringify({ v: 99, tests: {} }));
        expect(loadMemory(file).tests).toEqual({});
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
