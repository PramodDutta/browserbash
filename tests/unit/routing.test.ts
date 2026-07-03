import { describe, it, expect } from 'vitest';
import {
    thinkingConfigFor,
    pickModel,
    addUsage,
    ESCALATION_TURNS,
    type RoutingConfig,
} from '../../dist/engine/routing.js';

describe('thinkingConfigFor', () => {
    it('adaptive for reasoning-first families', () => {
        expect(thinkingConfigFor('claude-opus-4-8')).toEqual({ type: 'adaptive' });
        expect(thinkingConfigFor('claude-sonnet-5')).toEqual({ type: 'adaptive' });
        expect(thinkingConfigFor('claude-fable-5')).toEqual({ type: 'adaptive' });
    });
    it('enabled+budget for Haiku (adaptive would 400)', () => {
        expect(thinkingConfigFor('claude-haiku-4-5')).toEqual({ type: 'enabled', budget_tokens: 4000 });
    });
    it('omitted for unknown / gateway ids', () => {
        expect(thinkingConfigFor('some-gateway/llama-3.3-70b')).toBeUndefined();
        expect(thinkingConfigFor('gpt-4.1')).toBeUndefined();
    });
});

describe('pickModel', () => {
    const off: RoutingConfig = { executionModel: '', escalateOnFailure: true };
    const on: RoutingConfig = { executionModel: 'claude-haiku-4-5', escalateOnFailure: true };

    it('no exec model => strong everywhere', () => {
        expect(pickModel('claude-opus-4-8', off, 1, 0)).toBe('claude-opus-4-8');
        expect(pickModel('claude-opus-4-8', off, 5, 0)).toBe('claude-opus-4-8');
    });
    it('turn 1 plans on the strong model, later turns run on exec', () => {
        expect(pickModel('claude-opus-4-8', on, 1, 0)).toBe('claude-opus-4-8');
        expect(pickModel('claude-opus-4-8', on, 2, 0)).toBe('claude-haiku-4-5');
    });
    it('escalation window forces the strong model back', () => {
        expect(pickModel('claude-opus-4-8', on, 4, ESCALATION_TURNS)).toBe('claude-opus-4-8');
        expect(pickModel('claude-opus-4-8', on, 4, 0)).toBe('claude-haiku-4-5');
    });
    it('escalation ignored when disabled', () => {
        const noEsc: RoutingConfig = { executionModel: 'claude-haiku-4-5', escalateOnFailure: false };
        expect(pickModel('claude-opus-4-8', noEsc, 4, 2)).toBe('claude-haiku-4-5');
    });
});

describe('addUsage', () => {
    it('sums input + cache-read into input, output into output', () => {
        let u = { input: 0, output: 0 };
        u = addUsage(u, { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50 } as never);
        u = addUsage(u, { input_tokens: 10, output_tokens: 5 } as never);
        expect(u).toEqual({ input: 160, output: 25 });
    });
    it('tolerates missing usage', () => {
        expect(addUsage({ input: 1, output: 2 }, undefined)).toEqual({ input: 1, output: 2 });
    });
});
