/**
 * Open-source-first model resolution.
 *
 * model = 'auto' (the default) resolves in this order:
 *   1. Ollama running locally → ollama/<OLLAMA_MODEL or first installed model>
 *   2. ANTHROPIC_API_KEY set  → claude-opus-4-8
 *   3. OPENAI_API_KEY set     → openai/gpt-4.1
 *   4. OPENROUTER_API_KEY set → openrouter/<OPENROUTER_MODEL or openai/gpt-oss-120b:free>
 *   5. error with setup guidance
 *
 * Any explicit model string is passed through untouched.
 */

export function ollamaRoot(): string {
    const base = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
    return base.replace(/\/v1\/?$/, '');
}

async function detectOllamaModel(): Promise<string | null> {
    const envModel = process.env.OLLAMA_MODEL;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${ollamaRoot()}/api/tags`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        const installed = data.models?.map((m) => m.name) ?? [];
        if (envModel) return envModel;
        return installed[0] ?? null;
    } catch {
        return null;
    }
}

export async function resolveModel(model: string, log: (msg: string) => void): Promise<string> {
    if (model !== 'auto') return model;

    const ollamaModel = await detectOllamaModel();
    if (ollamaModel) {
        log(`Model: ollama/${ollamaModel} (local, open source — override with --model or OLLAMA_MODEL)`);
        return `ollama/${ollamaModel}`;
    }
    if (process.env.ANTHROPIC_API_KEY) {
        log('Model: claude-opus-4-8 (no local Ollama found, using ANTHROPIC_API_KEY)');
        return 'claude-opus-4-8';
    }
    if (process.env.OPENAI_API_KEY) {
        log('Model: openai/gpt-4.1 (no local Ollama found, using OPENAI_API_KEY)');
        return 'openai/gpt-4.1';
    }
    if (process.env.OPENROUTER_API_KEY) {
        // || not ?? — an env var set to '' must fall back to the default.
        const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:free';
        log(`Model: openrouter/${model} (no local Ollama found, using OPENROUTER_API_KEY)`);
        return `openrouter/${model}`;
    }
    throw new Error(
        'No LLM backend available. Either:\n' +
        '  - install Ollama and pull a tool-capable model:  ollama pull qwen3   (https://ollama.com — free, open source)\n' +
        '  - or set ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY\n' +
        '  - or pass --model explicitly (e.g. --model ollama/qwen3 or --model openrouter/openai/gpt-oss-120b:free)',
    );
}
