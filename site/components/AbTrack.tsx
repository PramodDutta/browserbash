'use client';

import { useEffect } from 'react';

/**
 * Lightweight A/B beacon for the hero test. Fires one impression on mount and
 * a cta_click when a hero CTA marked data-ab="cta" is clicked. Best-effort —
 * uses sendBeacon and never blocks navigation or throws.
 */
export function AbTrack({ variant }: { variant: 'a' | 'b' }) {
    useEffect(() => {
        const send = (event: string) => {
            try {
                navigator.sendBeacon?.('/api/ab', JSON.stringify({ variant, event }));
            } catch {
                // ignore — analytics must never affect the page
            }
        };
        send('impression');
        const onClick = (e: MouseEvent) => {
            const el = (e.target as HTMLElement | null)?.closest('[data-ab="cta"]');
            if (el) send('cta_click');
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [variant]);
    return null;
}
