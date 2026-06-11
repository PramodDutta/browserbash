import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveModel } from '../../dist/llm.js';

beforeEach(() => {
    // Dead port → instant connection refusal, deterministic "no Ollama".
    vi.stubEnv('OLLAMA_BASE_URL', 'http://127.0.0.1:9/v1');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
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

    it('throws setup guidance when nothing available', async () => {
        await expect(resolveModel('auto', noop)).rejects.toThrow(/No LLM backend/);
    });
});
