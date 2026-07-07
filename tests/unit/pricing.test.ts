import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from '../../src/pricing.js';

const PRICES = {
    'claude-opus-4': { in: 5, out: 25 },
    'claude-haiku': { in: 1, out: 5 },
    'claude-haiku-4-5-special': { in: 2, out: 10 },
    'ollama/': { in: 0, out: 0 },
};

describe('estimateCostUsd', () => {
    it('prices a known model per million tokens', () => {
        expect(estimateCostUsd('claude-opus-4-8', 1_000_000, 1_000_000, PRICES)).toBe(30);
    });

    it('prices small runs at 6-decimal precision', () => {
        expect(estimateCostUsd('claude-haiku-4-5', 10_000, 2_000, PRICES)).toBe(0.02);
        expect(estimateCostUsd('claude-haiku-4-5', 100, 20, PRICES)).toBe(0.0002);
    });

    it('prefers the longest matching prefix', () => {
        expect(estimateCostUsd('claude-haiku-4-5-special-x', 1_000_000, 0, PRICES)).toBe(2);
    });

    it('returns undefined for unknown models rather than guessing', () => {
        expect(estimateCostUsd('mystery/model', 1_000_000, 1_000_000, PRICES)).toBeUndefined();
    });

    it('treats local models as free', () => {
        expect(estimateCostUsd('ollama/qwen3', 5_000_000, 5_000_000, PRICES)).toBe(0);
    });
});
