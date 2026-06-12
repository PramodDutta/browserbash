import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, maskKey, bearerFrom } from './apikeys';

describe('api keys', () => {
    it('generates bb_<40 hex> keys whose hash round-trips', () => {
        const { key, hash } = generateApiKey();
        expect(key).toMatch(/^bb_[a-f0-9]{40}$/);
        expect(hashApiKey(key)).toBe(hash);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('masks hashes for display', () => {
        expect(maskKey('abcdef123456')).toBe('bb_…abcdef');
    });

    it('parses well-formed bearer headers only', () => {
        const { key } = generateApiKey();
        expect(bearerFrom(`Bearer ${key}`)).toBe(key);
        expect(bearerFrom(`bearer ${key}`)).toBe(key);
        expect(bearerFrom('Bearer nope')).toBeNull();
        expect(bearerFrom(null)).toBeNull();
        expect(bearerFrom(`Bearer bb_short`)).toBeNull();
    });
});
