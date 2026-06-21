'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { Bo } from '@/components/Bo';
import '../landing.css';

/**
 * Dashboard error boundary. Without this, any throw in the server render of
 * /dashboard (a DB hiccup, a not-yet-migrated table for a brand-new user)
 * produced a blank white page after login. Now it degrades to a branded,
 * recoverable screen and surfaces the error digest for debugging.
 */
export default function DashboardError({
    error,
    unstable_retry,
}: {
    error: Error & { digest?: string };
    unstable_retry: () => void;
}) {
    useEffect(() => {
        console.error('[dashboard] render error:', error);
    }, [error]);

    return (
        <main className="container" style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1rem', textAlign: 'center' }}>
            <Bo size={64} interactive={false} pose="idle" />
            <h1 style={{ marginTop: '1rem' }}>Your dashboard hit a snag</h1>
            <p style={{ color: 'var(--muted, #888)', marginTop: '0.5rem' }}>
                You&apos;re logged in fine — this panel just failed to load. It&apos;s usually transient. Try again, or
                head back home.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                <button className="pixel-btn" onClick={() => unstable_retry()}>Try again</button>
                <a className="pixel-btn ghost" href="/">Back home</a>
            </div>
            {error?.digest && (
                <p style={{ marginTop: '1.5rem', fontSize: 12, color: 'var(--muted, #888)' }}>
                    Reference: <code>{error.digest}</code>
                </p>
            )}
        </main>
    );
}
