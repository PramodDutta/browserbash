'use client';

import { useState } from 'react';
import { CopyButton } from './CopyButton';

const BACKENDS = [
    {
        id: 'ollama',
        label: 'Ollama (free)',
        note: 'Local, private, unmetered. Best with Qwen3 / 70B-class models.',
        code: 'ollama pull qwen3\nbrowserbash run "..." ',
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        note: 'Hundreds of models, one key — free tier includes tool-capable models.',
        code: 'export OPENROUTER_API_KEY=sk-or-...\nbrowserbash run "..." --model openrouter/openai/gpt-oss-120b:free',
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        note: 'Highest reliability on long multi-step flows.',
        code: 'export ANTHROPIC_API_KEY=sk-ant-...\nbrowserbash run "..."',
    },
] as const;

export function BackendPicker() {
    const [active, setActive] = useState<(typeof BACKENDS)[number]['id']>('ollama');
    const current = BACKENDS.find((b) => b.id === active)!;

    return (
        <div className="bp">
            <div className="bp__tabs" role="tablist" aria-label="LLM backend">
                {BACKENDS.map((b) => (
                    <button key={b.id} role="tab" aria-selected={active === b.id}
                        className={`bp__tab ${active === b.id ? 'on' : ''}`} onClick={() => setActive(b.id)}>
                        {b.label}
                    </button>
                ))}
            </div>
            <p className="bp__note">{current.note}</p>
            <div className="bp__code">
                <pre>{current.code}</pre>
                <CopyButton text={current.code} />
            </div>
        </div>
    );
}
