import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTestMd } from '../../dist/testmd/parser.js';

function md(dir: string, name: string, content: string): string {
    const p = join(dir, name);
    writeFileSync(p, content);
    return p;
}

describe('parseTestMd', () => {
    it('parses title and ordered steps from -, *, 1. lists', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        const p = md(dir, 'a_test.md', '# Login\nprose ignored\n- one\n* two\n1. three\n');
        const r = parseTestMd(p);
        expect(r.title).toBe('Login');
        expect(r.steps).toEqual(['one', 'two', 'three']);
    });

    it('splices @import steps in place, recursively', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        md(dir, 'shared.md', '# Shared\n- s1\n- s2\n');
        const p = md(dir, 'main_test.md', '# Main\n- a\n@import ./shared.md\n- b\n');
        expect(parseTestMd(p).steps).toEqual(['a', 's1', 's2', 'b']);
    });

    it('throws on @import cycles', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        md(dir, 'x.md', '# X\n- x\n@import ./y.md\n');
        md(dir, 'y.md', '# Y\n@import ./x.md\n');
        expect(() => parseTestMd(join(dir, 'x.md'))).toThrow(/cycle|circular/i);
    });

    it('throws when no steps found', () => {
        const dir = mkdtempSync(join(tmpdir(), 'bb-'));
        const p = md(dir, 'empty_test.md', '# Empty\njust prose\n');
        expect(() => parseTestMd(p)).toThrow(/no steps/i);
    });
});
