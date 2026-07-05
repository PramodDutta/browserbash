import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    computeConcurrency,
    classifyChild,
    discoverTests,
    parsePsTable,
    runPool,
    sumTreeRssBytes,
    toJUnitXml,
    type TestOutcome,
} from '../../dist/orchestrator/scheduler.js';

describe('process-tree RSS', () => {
    const table = parsePsTable([
        '  100     1   5000',
        '  200   100  10000',   // child of 100
        '  201   200  20000',   // grandchild (Chromium)
        '  300     1  99999',   // unrelated
        'garbage line',
    ].join('\n'));

    it('parses pid/ppid/rss rows and skips noise', () => {
        expect(table).toHaveLength(4);
        expect(table[1]).toEqual({ pid: 200, ppid: 100, rssKb: 10000 });
    });

    it('sums the root and every descendant, ignores strangers', () => {
        expect(sumTreeRssBytes(100, table)).toBe((5000 + 10000 + 20000) * 1024);
        expect(sumTreeRssBytes(200, table)).toBe((10000 + 20000) * 1024);
        expect(sumTreeRssBytes(300, table)).toBe(99999 * 1024);
    });

    it('returns 0 for an unknown pid with no children', () => {
        expect(sumTreeRssBytes(4242, table)).toBe(0);
    });
});

describe('computeConcurrency', () => {
    const GB = 1024 ** 3;
    it('clamps to the memory cap when RAM is tight', () => {
        // 8GB total, 2GB reserve, 700MB budget -> floor(6144/700) = 8
        const { concurrency } = computeConcurrency({ requested: 20, memoryBudgetMb: 700, cpuCount: 32, totalMemBytes: 8 * GB });
        expect(concurrency).toBe(8);
    });
    it('clamps to CPU count when RAM is plentiful', () => {
        const { concurrency } = computeConcurrency({ requested: 50, memoryBudgetMb: 700, cpuCount: 10, totalMemBytes: 64 * GB });
        expect(concurrency).toBe(10);
    });
    it('honors an explicit lower request', () => {
        const { concurrency } = computeConcurrency({ requested: 3, memoryBudgetMb: 700, cpuCount: 32, totalMemBytes: 64 * GB });
        expect(concurrency).toBe(3);
    });
    it('never returns below 1', () => {
        const { concurrency } = computeConcurrency({ memoryBudgetMb: 100000, cpuCount: 8, totalMemBytes: 4 * GB });
        expect(concurrency).toBe(1);
    });
});

describe('classifyChild (EPIPE-safe verdict)', () => {
    it('pass requires exit 0 AND a run_end', () => {
        expect(classifyChild(0, true, 'passed')).toBe('passed');
        expect(classifyChild(0, false)).toBe('infra'); // EPIPE: exit 0, no run_end
        expect(classifyChild(0, true, 'failed')).toBe('failed');
    });
    it('maps exit codes to verdicts', () => {
        expect(classifyChild(1, true, 'failed')).toBe('failed');
        expect(classifyChild(2, false)).toBe('infra');
        expect(classifyChild(3, true, 'timeout')).toBe('timeout');
        expect(classifyChild(null, false)).toBe('infra');
    });
});

describe('discoverTests', () => {
    it('finds *_test.md recursively, skips dotdirs and non-tests', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-disc-'));
        fs.mkdirSync(path.join(dir, 'sub'));
        fs.mkdirSync(path.join(dir, '.hidden'));
        fs.writeFileSync(path.join(dir, 'a_test.md'), '# a');
        fs.writeFileSync(path.join(dir, 'sub', 'b_test.md'), '# b');
        fs.writeFileSync(path.join(dir, 'notes.md'), '# not a test');
        fs.writeFileSync(path.join(dir, '.hidden', 'c_test.md'), '# hidden');
        const found = discoverTests(dir).map((f) => path.basename(f));
        expect(found).toEqual(['a_test.md', 'b_test.md']);
        fs.rmSync(dir, { recursive: true, force: true });
    });
    it('accepts a single test file, rejects a single non-test', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-disc2-'));
        const t = path.join(dir, 'x_test.md');
        fs.writeFileSync(t, '# x');
        expect(discoverTests(t)).toEqual([t]);
        const n = path.join(dir, 'plain.md');
        fs.writeFileSync(n, '# n');
        expect(discoverTests(n)).toEqual([]);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('runPool', () => {
    it('runs all tasks, never exceeds concurrency', async () => {
        let active = 0;
        let peak = 0;
        const order: number[] = [];
        const tasks = Array.from({ length: 20 }, (_, i) => async () => {
            active++; peak = Math.max(peak, active);
            await new Promise((r) => setTimeout(r, 5));
            active--; order.push(i);
            return i;
        });
        const out = await runPool(tasks, { concurrency: 4, freeMemBytes: () => 100, totalMemBytes: 100, lowWatermark: 0, resumeWatermark: 0 });
        expect(out.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
        expect(peak).toBeLessThanOrEqual(4);
        expect(order).toHaveLength(20);
    });

    it('always admits when nothing is running (deadlock guard) then backpressures', async () => {
        let free = 5; // below low (10) the whole time task 0 holds
        let started = 0;
        let release!: () => void;
        const hold = new Promise<void>((r) => { release = r; });
        const tasks = [
            async () => { started++; await hold; return 0 as const },  // holds the slot open
            async () => { started++; return 1 as const },
            async () => { started++; return 2 as const },
        ];
        const p = runPool(tasks, {
            concurrency: 3, totalMemBytes: 100, lowWatermark: 0.1, resumeWatermark: 0.2,
            freeMemBytes: () => free, pollMs: 1, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        });
        await new Promise((r) => setTimeout(r, 10));
        // Task 0 admitted (active was 0), but with it running and memory low the
        // others are held back.
        expect(started).toBe(1);
        free = 30; // above resume
        release();
        await p;
        expect(started).toBe(3);
    });
});

describe('toJUnitXml', () => {
    it('emits testcases with failures and errors tagged', () => {
        const outcomes: TestOutcome[] = [
            { file: '/t/a_test.md', verdict: 'passed', attempts: 1, durationMs: 1000, summary: 'ok', exitCode: 0, flaky: false },
            { file: '/t/b_test.md', verdict: 'failed', attempts: 1, durationMs: 2000, summary: 'bad & <ugly>', exitCode: 1, flaky: false },
            { file: '/t/c_test.md', verdict: 'infra', attempts: 2, durationMs: 500, summary: 'boom', exitCode: 2, flaky: false },
        ];
        const xml = toJUnitXml(outcomes);
        expect(xml).toContain('tests="3" failures="1" errors="1"');
        expect(xml).toContain('name="a_test.md"');
        expect(xml).toContain('<failure message="bad &amp; &lt;ugly&gt;"');
        expect(xml).toContain('<error message="boom"');
    });
});
