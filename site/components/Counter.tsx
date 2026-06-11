'use client';

import { useEffect, useState } from 'react';

/** "N on the waitlist" — hides itself entirely when stats are unavailable. */
export function Counter() {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/stats')
            .then((r) => r.json())
            .then((d: { count: number | null }) => setCount(d.count))
            .catch(() => setCount(null));
    }, []);

    if (count === null || count < 1) return null;

    return (
        <p className="counter" aria-live="off">
            <span className="counter__dot" /> {count.toLocaleString()} {count === 1 ? 'person' : 'people'} on the waitlist
        </p>
    );
}
