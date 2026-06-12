'use client';

import { useState } from 'react';

type Phase = 'idle' | 'loading' | 'done' | 'dup' | 'error';

export function WaitlistForm() {
    const [phase, setPhase] = useState<Phase>('idle');
    const [email, setEmail] = useState('');
    const [useCase, setUseCase] = useState('');
    const [showMore, setShowMore] = useState(false);
    const [position, setPosition] = useState<number | null>(null);
    const [error, setError] = useState('');

    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (phase === 'loading') return;
        setPhase('loading');
        setError('');
        const honeypot = (new FormData(e.currentTarget).get('website') as string) ?? '';
        try {
            const res = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, useCase: useCase || undefined, website: honeypot || undefined }),
            });
            const data = (await res.json()) as { position?: number; already?: boolean; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Something went wrong — please retry.');
                setPhase('error');
                return;
            }
            setPosition(data.position ?? null);
            setPhase(data.already ? 'dup' : 'done');
        } catch {
            setError('Network hiccup — please retry.');
            setPhase('error');
        }
    }

    if (phase === 'done') {
        return (
            <div className="wl wl--success" role="status">
                <strong>You&apos;re {position ? `#${position}` : 'in'} on the list 🔨</strong>
                <span>Watch your inbox — launch news lands there first.</span>
            </div>
        );
    }

    if (phase === 'dup') {
        return (
            <div className="wl wl--success" role="status">
                <strong>Already on the list ✓</strong>
                <span>You&apos;re all set.</span>
            </div>
        );
    }

    return (
        <form className="wl" onSubmit={submit}>
            <div className="wl__row">
                <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email address"
                    disabled={phase === 'loading'}
                />
                <button type="submit" className="pixel-btn" disabled={phase === 'loading'}>
                    {phase === 'loading' ? '…' : 'Join waitlist'}
                </button>
            </div>
            {/* honeypot — hidden from real users */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="wl__hp" aria-hidden="true" />
            {showMore ? (
                <textarea
                    placeholder="What do you want to automate? (optional)"
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    maxLength={500}
                    rows={2}
                    aria-label="What do you want to automate?"
                />
            ) : (
                <button type="button" className="wl__more" onClick={() => setShowMore(true)}>
                    + tell us what you&apos;ll automate
                </button>
            )}
            {phase === 'error' && <p className="wl__error" role="alert">{error}</p>}
        </form>
    );
}
