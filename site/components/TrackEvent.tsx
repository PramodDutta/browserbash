'use client';

import { useEffect } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

/**
 * Fires a single named GA4 event on mount. Drop on a page to mark a
 * conversion/landing (e.g. login on the dashboard, sign-up page view).
 */
export function TrackEvent({ name, params }: { name: string; params?: Record<string, string | number> }) {
    useEffect(() => {
        try {
            sendGAEvent('event', name, params ?? {});
        } catch {
            // best-effort
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name]);
    return null;
}
