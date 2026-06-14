'use client';

import { useEffect } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

/**
 * Global GA4 event tracking. page_view is handled automatically by the
 * <GoogleAnalytics> component (incl. client-side route changes). This adds a
 * delegated listener that fires structured events for every link/button click,
 * plus named conversions for the funnel (sign-up, login, install copy, CTAs).
 * Best-effort — never throws, no-ops if gtag isn't loaded.
 */
export function Analytics() {
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const el = (e.target as HTMLElement | null)?.closest('a,button') as HTMLElement | null;
            if (!el) return;
            const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
            const href = el.getAttribute('href') || '';
            const page = location.pathname;
            try {
                sendGAEvent('event', 'click', { link_text: text, link_url: href, page_path: page });
                if (el.matches('[data-ab="cta"]')) sendGAEvent('event', 'cta_click', { link_text: text, page_path: page });
                if (href.includes('/sign-up')) sendGAEvent('event', 'sign_up_click', { page_path: page });
                else if (href.includes('/sign-in') || href === '/dashboard') sendGAEvent('event', 'login_click', { page_path: page });
                if (el.classList.contains('copy-btn') || /npm i(nstall)? -g browserbash/i.test(text)) {
                    sendGAEvent('event', 'install_copy', { page_path: page });
                }
                if (href.includes('npmjs.com')) sendGAEvent('event', 'npm_click', { page_path: page });
                if (href.includes('github.com')) sendGAEvent('event', 'github_click', { page_path: page });
            } catch {
                // analytics must never affect the page
            }
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, []);
    return null;
}
