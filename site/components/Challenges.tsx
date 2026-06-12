'use client';

import { useState } from 'react';
import { CopyButton } from './CopyButton';
import type { Scenario } from '@/lib/learn-types';
import './challenges.css';

const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'] as const;

export function Challenges({ scenarios }: { scenarios: Scenario[] }) {
    const [level, setLevel] = useState<(typeof LEVELS)[number]>('all');
    const [open, setOpen] = useState<string | null>(null);

    const shown = level === 'all' ? scenarios : scenarios.filter((s) => s.difficulty === level);

    return (
        <div className="ch">
            <div className="ch__filters" role="tablist" aria-label="Filter by difficulty">
                {LEVELS.map((l) => (
                    <button
                        key={l}
                        role="tab"
                        aria-selected={level === l}
                        className={`ch__filter ${level === l ? 'on' : ''}`}
                        onClick={() => setLevel(l)}
                    >
                        {l}
                        {l !== 'all' && <span className="ch__count">{scenarios.filter((s) => s.difficulty === l).length}</span>}
                    </button>
                ))}
            </div>

            <div className="ch__grid">
                {shown.map((s, i) => (
                    <article className={`pixel-card ch__card ch__card--${s.difficulty}`} key={s.id}>
                        <header className="ch__head">
                            <span className="ch__num">{String(i + 1).padStart(2, '0')}</span>
                            <span className={`ch__badge ch__badge--${s.difficulty}`}>{s.difficulty}</span>
                            <span className="ch__cat">{s.category}</span>
                        </header>
                        <h3>{s.title}</h3>
                        <p className="ch__objective">&ldquo;{s.objective}&rdquo;</p>
                        <p className="ch__learns">{s.learns}</p>
                        <div className="ch__cmd">
                            <code>{s.command}</code>
                            <CopyButton text={s.command} label="copy & run" />
                        </div>
                        <div className="ch__meta">
                            <a href={s.targetUrl} target="_blank" rel="noopener noreferrer">target site ↗</a>
                            <button className="ch__hints-toggle" onClick={() => setOpen(open === s.id ? null : s.id)}>
                                {open === s.id ? 'hide hints' : `hints (${s.hints.length})`}
                            </button>
                        </div>
                        {open === s.id && (
                            <div className="ch__hints">
                                <ul>
                                    {s.hints.map((h, j) => <li key={j}>{h}</li>)}
                                </ul>
                                <p className="ch__expected"><strong>Pass looks like:</strong> {s.expected}</p>
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
}
