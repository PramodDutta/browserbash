'use client';

import { useEffect } from 'react';

/**
 * Lightweight A/B beacon for the hero test. The active variant is decided
 * before paint by the layout's inline script (html.ab-b for variant B); this
 * reads it, fires one impression, and a cta_click when a hero CTA marked
 * data-ab="cta" is clicked. Best-effort — never blocks navigation or throws.
 */
export function AbTrack() {
    useEffect(() => {
        const variant = document.documentElement.classList.contains('ab-b') ? 'b' : 'a';
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
    }, []);
    return null;
}
