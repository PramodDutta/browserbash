'use client';

import { useState, type FormEvent } from 'react';

/**
 * Site-wide lead magnet: "Get the AI-testing playbook". Renders in the
 * footer on every marketing + blog page. Captures to the subscribers
 * table (no sending yet — see api/subscribe); on success it hands the
 * playbook over immediately so there is zero delivery friction.
 */
export function EmailCapture({ source = 'footer' }: { source?: string }) {
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState(''); // honeypot
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [error, setError] = useState('');

    async function onSubmit(e: FormEvent): Promise<void> {
        e.preventDefault();
        if (status === 'loading') return;
        setStatus('loading');
        setError('');
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, company, source }),
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
                setError(data.error ?? 'Something went wrong');
                setStatus('error');
                return;
            }
            setStatus('done');
        } catch {
            setError('Network error — try again');
            setStatus('error');
        }
    }

    if (status === 'done') {
        return (
            <div className="email-capture email-capture--done">
                <p>
                    ✓ You&rsquo;re in. <a href="/playbook">Open the playbook →</a>
                </p>
            </div>
        );
    }

    return (
        <form className="email-capture" onSubmit={onSubmit}>
            <h4>Get the AI-testing playbook</h4>
            <p>One free page: install to CI, every core pattern. No spam.</p>
            <div className="email-capture__row">
                <label className="email-capture__honeypot" aria-hidden="true">
                    Company
                    <input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                    />
                </label>
                <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === 'loading'}
                />
                <button type="submit" className="pixel-btn" disabled={status === 'loading'}>
                    {status === 'loading' ? '…' : 'Get it free'}
                </button>
            </div>
            {status === 'error' ? <p className="email-capture__error">{error}</p> : null}
        </form>
    );
}
