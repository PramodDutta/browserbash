import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractFinalState, splitObjectiveVariables, toStagehandModel, unwrapCloseEcho } from '../../dist/engine/stagehand.js';

beforeEach(() => {
    vi.stubEnv('OLLAMA_BASE_URL', undefined);
    vi.stubEnv('OLLAMA_API_KEY', undefined);
    vi.stubEnv('OLLAMA_REASONING_EFFORT', undefined);
    vi.stubEnv('OPENROUTER_API_KEY', undefined);
    vi.stubEnv('OPENROUTER_BASE_URL', undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('toStagehandModel', () => {
    it('maps ollama/<m> to the local OpenAI-compatible endpoint with thinking off', () => {
        expect(toStagehandModel('ollama/qwen3')).toEqual({
            modelName: 'openai/qwen3',
            baseURL: 'http://localhost:11434/v1',
            apiKey: 'ollama',
            reasoningEffort: 'none',
        });
    });

    it('honors OLLAMA_REASONING_EFFORT override', () => {
        vi.stubEnv('OLLAMA_REASONING_EFFORT', 'low');
        expect(toStagehandModel('ollama/qwen3.5:4b')).toMatchObject({ reasoningEffort: 'low' });
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

    it('drops close-echo keys but keeps real values alongside them', () => {
        expect(extractFinalState('{"reasoning":"did the thing","taskComplete":true,"h1":"Example Domain"}')).toEqual({
            h1: 'Example Domain',
        });
    });

    it('close echo with no stored values never leaks reasoning/taskComplete keys', () => {
        const state = extractFinalState('{"reasoning":"All good.","taskComplete":true}', "store the title as 'title'");
        expect(state.reasoning).toBeUndefined();
        expect(state.taskComplete).toBeUndefined();
    });
});

describe('unwrapCloseEcho', () => {
    it('unwraps a pure close-echo message and honors taskComplete', () => {
        const r = unwrapCloseEcho('{\n  "reasoning": "Extracted the heading successfully.",\n  "taskComplete": true\n}');
        expect(r.success).toBe(true);
        expect(r.message).toBe('Extracted the heading successfully.');
    });

    it('keeps leading prose and appends reasoning', () => {
        const r = unwrapCloseEcho('All done.\n{"reasoning":"Stored h1.","taskComplete":true}');
        expect(r.success).toBe(true);
        expect(r.message).toBe('All done. Stored h1.');
    });

    it('propagates taskComplete=false', () => {
        expect(unwrapCloseEcho('{"reasoning":"Could not log in.","taskComplete":false}').success).toBe(false);
    });

    it('leaves normal messages untouched', () => {
        const r = unwrapCloseEcho('Stored the values. {"h1":"Example Domain"}');
        expect(r.success).toBeUndefined();
        expect(r.message).toBe('Stored the values. {"h1":"Example Domain"}');
    });
});

describe('splitObjectiveVariables', () => {
    const vars = {
        base_url: { value: 'https://the-internet.herokuapp.com' },
        username: { value: 'tomsmith' },
        password: { value: 'SuperSecretPassword!', secret: true },
    };

    it('inlines non-secrets and keeps secrets as %name% with a map', () => {
        const { instruction, secrets } = splitObjectiveVariables(
            'Open {{base_url}}/login, log in as {{username}} with {{password}}',
            vars,
        );
        expect(instruction).toBe('Open https://the-internet.herokuapp.com/login, log in as tomsmith with %password%');
        expect(secrets).toEqual({ password: 'SuperSecretPassword!' });
    });

    it('throws on unknown variables', () => {
        expect(() => splitObjectiveVariables('Open {{nope}}', {})).toThrow(/Unknown variable/);
    });

    it('returns text unchanged with no placeholders', () => {
        const { instruction, secrets } = splitObjectiveVariables('Open https://example.com', vars);
        expect(instruction).toBe('Open https://example.com');
        expect(secrets).toEqual({});
    });
});

describe('cache helpers', () => {
    it('rewrites {{var}} placeholders to %var%', async () => {
        const { toStagehandPlaceholders } = await import('../../dist/engine/stagehand.js');
        expect(toStagehandPlaceholders('type {{name}} then {{ email }} into {{form-field}}'))
            .toBe('type %name% then %email% into %form-field%');
        expect(toStagehandPlaceholders('no vars here')).toBe('no vars here');
    });

    it('cacheSlug: stable, readable, keyed on templated objective', async () => {
        const { cacheSlug } = await import('../../dist/engine/stagehand.js');
        const a = cacheSlug('Checkout Flow!', 'go to {{base}} and buy');
        expect(a).toMatch(/^checkout-flow-[0-9a-f]{8}$/);
        expect(cacheSlug('Checkout Flow!', 'go to {{base}} and buy')).toBe(a);
        expect(cacheSlug('Checkout Flow!', 'DIFFERENT objective')).not.toBe(a);
        expect(cacheSlug(undefined, 'x')).toMatch(/^run-[0-9a-f]{8}$/);
    });
});
