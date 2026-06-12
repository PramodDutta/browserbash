'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from './CopyButton';
import { ONBOARDING_STEPS } from '@/lib/onboarding-steps';

export function Onboarding({ initialDone }: { initialDone: string[] }) {
    const [done, setDone] = useState<Set<string>>(new Set(initialDone));
    const [busy, setBusy] = useState<string | null>(null);

    async function toggle(step: string) {
        if (busy) return;
        const isDone = done.has(step);
        setBusy(step);
        // optimistic
        setDone((d) => {
            const n = new Set(d);
            if (isDone) n.delete(step); else n.add(step);
            return n;
        });
        try {
            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step, done: !isDone }),
            });
            const data = (await res.json()) as { done?: string[] };
            if (res.ok && data.done) setDone(new Set(data.done));
        } catch {
            setDone((d) => {
                const n = new Set(d);
                if (isDone) n.add(step); else n.delete(step);
                return n;
            });
        } finally {
            setBusy(null);
        }
    }

    const completed = ONBOARDING_STEPS.filter((s) => done.has(s.id)).length;
    const pct = Math.round((completed / ONBOARDING_STEPS.length) * 100);

    return (
        <div className="ob pixel-card">
            <header className="ob__head">
                <h2>Bash-readiness checklist</h2>
                <div className="ob__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="ob__bar"><div className="ob__fill" style={{ width: `${pct}%` }} /></div>
                    <span className="ob__pct">{completed}/{ONBOARDING_STEPS.length}</span>
                </div>
            </header>
            <ul className="ob__list">
                {ONBOARDING_STEPS.map((s) => (
                    <li key={s.id} className={done.has(s.id) ? 'done' : ''}>
                        <button
                            className="ob__check"
                            aria-pressed={done.has(s.id)}
                            aria-label={`Mark "${s.title}" ${done.has(s.id) ? 'not done' : 'done'}`}
                            onClick={() => toggle(s.id)}
                            disabled={busy === s.id}
                        >
                            {done.has(s.id) ? '✓' : ''}
                        </button>
                        <div className="ob__body">
                            <strong>{s.title}</strong>
                            <p>{s.detail}</p>
                            {s.command && (
                                <div className="ob__cmd">
                                    <code>{s.command}</code>
                                    <CopyButton text={s.command} />
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
            {pct === 100 && <p className="ob__done-msg">Fully operational. Bo salutes you. 🔨</p>}
        </div>
    );
}
