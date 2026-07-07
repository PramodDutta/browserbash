import { describe, expect, it } from 'vitest';
import { expandMatrix, parseShard, sliceShard, toJUnitXml, type TestOutcome } from '../../src/orchestrator/scheduler.js';

describe('parseShard', () => {
    it('parses i/n', () => {
        expect(parseShard('2/4')).toEqual({ index: 2, total: 4 });
    });
    it('rejects malformed and out-of-range specs', () => {
        expect(() => parseShard('4')).toThrow(/look like 2\/4/);
        expect(() => parseShard('0/4')).toThrow(/between 1 and 4/);
        expect(() => parseShard('5/4')).toThrow(/between 1 and 4/);
    });
});

describe('sliceShard', () => {
    const files = ['a', 'b', 'c', 'd', 'e'];
    it('partitions without overlap and covers everything', () => {
        const s1 = sliceShard(files, { index: 1, total: 2 });
        const s2 = sliceShard(files, { index: 2, total: 2 });
        expect(s1).toEqual(['a', 'c', 'e']);
        expect(s2).toEqual(['b', 'd']);
        expect([...s1, ...s2].sort()).toEqual(files);
    });
    it('is a no-op for 1/1', () => {
        expect(sliceShard(files, { index: 1, total: 1 })).toEqual(files);
    });
});

describe('expandMatrix', () => {
    it('returns bare cells without viewports', () => {
        expect(expandMatrix(['t1'], [])).toEqual([{ file: 't1' }]);
    });
    it('expands files x viewports in order', () => {
        expect(expandMatrix(['t1', 't2'], ['1280x720', '390x844'])).toEqual([
            { file: 't1', viewport: '1280x720' },
            { file: 't1', viewport: '390x844' },
            { file: 't2', viewport: '1280x720' },
            { file: 't2', viewport: '390x844' },
        ]);
    });
});

describe('toJUnitXml with cells, skips and properties', () => {
    const outcomes: TestOutcome[] = [
        { file: '/x/login_test.md', verdict: 'passed', attempts: 1, durationMs: 1000, summary: '', exitCode: 0, flaky: false, label: '390x844' },
        { file: '/x/cart_test.md', verdict: 'skipped', attempts: 0, durationMs: 0, summary: 'skipped: budget', exitCode: null, flaky: false },
    ];
    it('labels matrix cells, tags skips, and writes properties', () => {
        const xml = toJUnitXml(outcomes, 'browserbash', { cost_usd: '0.42', shard: '1/2' });
        expect(xml).toContain('login_test.md [390x844]');
        expect(xml).toContain('<skipped message="skipped: budget"/>');
        expect(xml).toContain('skipped="1"');
        expect(xml).toContain('<property name="cost_usd" value="0.42"/>');
        expect(xml).toContain('<property name="shard" value="1/2"/>');
    });
});
