import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractFinalState, toStagehandModel } from '../../dist/engine/stagehand.js';

beforeEach(() => {
    vi.stubEnv('OLLAMA_BASE_URL', undefined);
    vi.stubEnv('OLLAMA_API_KEY', undefined);
    vi.stubEnv('OPENROUTER_API_KEY', undefined);
    vi.stubEnv('OPENROUTER_BASE_URL', undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('toStagehandModel', () => {
    it('maps ollama/<m> to the local OpenAI-compatible endpoint', () => {
        expect(toStagehandModel('ollama/qwen3')).toEqual({
            modelName: 'openai/qwen3',
            baseURL: 'http://localhost:11434/v1',
            apiKey: 'ollama',
        });
    });

    it('maps openrouter/<vendor>/<m> through openrouter.ai with the key', () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
        expect(toStagehandModel('openrouter/anthropic/claude-sonnet-4-6')).toEqual({
            // groq prefix = OpenAI-compatible chat completions in Stagehand's
            // AI-SDK map; openai/ would hit the Responses API OpenRouter rejects.
            modelName: 'groq/anthropic/claude-sonnet-4-6',
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: 'sk-or-test',
        });
    });

    it('openrouter without key throws setup guidance', () => {
        expect(() => toStagehandModel('openrouter/meta-llama/llama-3.3-70b-instruct'))
            .toThrow(/OPENROUTER_API_KEY/);
    });

    it('passes provider-prefixed ids through and prefixes bare vendor ids', () => {
        expect(toStagehandModel('anthropic/claude-opus-4-8')).toBe('anthropic/claude-opus-4-8');
        expect(toStagehandModel('claude-opus-4-8')).toBe('anthropic/claude-opus-4-8');
        expect(toStagehandModel('gpt-4.1')).toBe('openai/gpt-4.1');
        expect(toStagehandModel('gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
    });
});

describe('extractFinalState', () => {
    it('extracts values from trailing JSON', () => {
        expect(extractFinalState('Done.\n{"top_story":"Launch HN"}')).toEqual({
            top_story: 'Launch HN',
        });
    });

    it('ignores placeholder JSON values', () => {
        expect(extractFinalState('Done.\n{"top_story":"..."}', 'store title as \'top_story\'')).toEqual({});
    });

    it('falls back to Stagehand summary parentheticals', () => {
        expect(extractFinalState(
            'Navigated to the page, extracted the first quote author (Albert Einstein) and stored as \'author\'.',
            'Open https://quotes.toscrape.com and store the first quote author as \'author\'',
        )).toEqual({ author: 'Albert Einstein' });
    });

    it('falls back when the key is mentioned after the parenthetical value', () => {
        expect(extractFinalState(
            'The assistant extracted the first quote author (Albert Einstein) and returned it. The required JSON with \'author\' was provided.',
            'Open https://quotes.toscrape.com and store the first quote author as \'author\'',
        )).toEqual({ author: 'Albert Einstein' });
    });
});
