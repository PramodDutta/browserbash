import { describe, it, expect } from 'vitest';
import { substitute, maskSecrets } from '../../dist/variables.js';
import type { VariableValue } from '../../dist/types.js';

const vars: Record<string, VariableValue> = {
    user: { value: 'pramod' },
    pass: { value: 'hunter2', secret: true },
};

describe('substitute', () => {
    it('replaces {{key}} placeholders', () => {
        expect(substitute('hi {{user}}', vars)).toBe('hi pramod');
    });

    it('replaces multiple occurrences', () => {
        expect(substitute('{{user}} and {{user}}', vars)).toBe('pramod and pramod');
    });

    it('throws on unknown key', () => {
        expect(() => substitute('{{nope}}', vars)).toThrow(/nope/);
    });
});

describe('maskSecrets', () => {
    it('masks secret values only', () => {
        const out = maskSecrets('login pramod with hunter2', vars);
        expect(out).toContain('pramod');
        expect(out).not.toContain('hunter2');
        expect(out).toContain('*****');
    });

    it('leaves text without secrets untouched', () => {
        expect(maskSecrets('nothing here', vars)).toBe('nothing here');
    });
});
