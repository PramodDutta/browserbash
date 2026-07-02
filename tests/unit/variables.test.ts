import { describe, it, expect } from 'vitest';
import { substitute, maskSecretRecord, maskSecrets } from '../../dist/variables.js';
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

    it('masks case-transformed secrets (DNS lowercasing in error messages)', () => {
        const v: Record<string, VariableValue> = { pw: { value: 'S3cretVal99', secret: true } };
        const out = maskSecrets('getaddrinfo ENOTFOUND s3cretval99.invalid', v);
        expect(out).not.toContain('s3cretval99');
        expect(out).toContain('*****');
        expect(maskSecrets('saw S3CRETVAL99 here', v)).toBe('saw ***** here');
    });

    it('masks secrets containing regex metacharacters literally', () => {
        const v: Record<string, VariableValue> = { pw: { value: 'a.b+c(d)', secret: true } };
        expect(maskSecrets('leak a.b+c(d) end', v)).toBe('leak ***** end');
        expect(maskSecrets('axbyczd unaffected', v)).toBe('axbyczd unaffected');
    });

    it('masks secrets inside record values', () => {
        expect(maskSecretRecord({ token: 'hunter2', user: 'pramod' }, vars)).toEqual({
            token: '*****',
            user: 'pramod',
        });
    });
});
