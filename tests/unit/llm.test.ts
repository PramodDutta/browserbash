import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isKnownThinkingModel, resolveModel, warnIfThinkingModel } from '../../dist/llm.js';

beforeEach(() => {
    // Dead port → instant connection refusal, deterministic "no Ollama".
    vi.stubEnv('OLLAMA_BASE_URL', 'http://127.0.0.1:9/v1');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_MODEL', '');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

const noop = (): void => {};

describe('resolveModel', () => {
    it('passes explicit model through untouched', async () => {
        expect(await resolveModel('ollama/qwen3', noop)).toBe('ollama/qwen3');
        expect(await resolveModel('claude-opus-4-8', noop)).toBe('claude-opus-4-8');
    });

    it('falls back to Anthropic when no Ollama', async () => {
        vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
        expect(await resolveModel('auto', noop)).toBe('claude-opus-4-8');
    });

    it('falls back to OpenAI when no Ollama/Anthropic', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test');
        expect(await resolveModel('auto', noop)).toBe('openai/gpt-4.1');
    });

    it('falls back to OpenRouter when only OPENROUTER_API_KEY is set', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
        expect(await resolveModel('auto', noop)).toBe('openrouter/openai/gpt-oss-120b:free');
    });

    it('honors OPENROUTER_MODEL for auto OpenRouter selection', async () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
        vi.stubEnv('OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free');
        expect(await resolveModel('auto', noop)).toBe('openrouter/meta-llama/llama-3.3-70b-instruct:free');
    });

    it('throws setup guidance when nothing available', async () => {
        await expect(resolveModel('auto', noop)).rejects.toThrow(/OPENROUTER_API_KEY/);
    });
});

describe('thinking-model warning', () => {
    it('flags known thinking families, passes instruct models', () => {
        expect(isKnownThinkingModel('ollama/qwen3.5:4b')).toBe(true);
        expect(isKnownThinkingModel('ollama/deepseek-r1:7b')).toBe(true);
        expect(isKnownThinkingModel('ollama/qwq:32b')).toBe(true);
        expect(isKnownThinkingModel('ollama/llama3.2:3b')).toBe(false);
        expect(isKnownThinkingModel('ollama/qwen2.5:7b-instruct')).toBe(false);
        expect(isKnownThinkingModel('ollama/gemma3:1b')).toBe(false);
    });

    it('warns only for ollama-prefixed thinking models', () => {
        const logs: string[] = [];
        const log = (m: string): void => { logs.push(m); };
        warnIfThinkingModel('ollama/qwen3.5:4b', log);
        expect(logs.some((l) => l.includes('thinking model'))).toBe(true);
        logs.length = 0;
        warnIfThinkingModel('ollama/llama3.2:3b', log);
        warnIfThinkingModel('claude-opus-4-8', log);
        expect(logs).toHaveLength(0);
    });

    it('explicit thinking model still resolves but logs the warning', async () => {
        const logs: string[] = [];
        const log = (m: string): void => { logs.push(m); };
        expect(await resolveModel('ollama/qwen3.5:4b', log)).toBe('ollama/qwen3.5:4b');
        expect(logs.some((l) => l.includes('thinking model'))).toBe(true);
    });
});
