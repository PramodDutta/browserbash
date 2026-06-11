'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <button
            className="copy-btn"
            aria-label={`Copy: ${text}`}
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                } catch {
                    /* clipboard unavailable — nothing sensible to do */
                }
            }}
        >
            {copied ? '✓ copied' : label}
        </button>
    );
}
