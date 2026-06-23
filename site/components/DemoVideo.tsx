'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lazy, autoplaying product-demo video for the #demo section.
 *
 * The <video> element (and its network request) is only mounted once the card
 * scrolls into view, so it never blocks first paint or competes with the hero
 * for LCP. Until then we render the poster still as a plain <img> placeholder.
 * Honors prefers-reduced-motion by not autoplaying.
 */
export function DemoVideo({
    src,
    poster,
    className = '',
}: {
    src: string;
    poster: string;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setActive(true);
                    io.disconnect();
                }
            },
            { threshold: 0.25, rootMargin: '200px 0px' },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    return (
        <div className={`demo-video pixel-card ${className}`} ref={ref}>
            {active ? (
                <video
                    className="demo-video__el"
                    src={src}
                    poster={poster}
                    muted
                    loop
                    autoPlay={!reduced}
                    playsInline
                    controls={reduced}
                    preload="metadata"
                    aria-label="BrowserBash demo: one plain-English objective drives a real browser to a passing run."
                />
            ) : (
                <img
                    className="demo-video__el"
                    src={poster}
                    alt="BrowserBash demo — a branded terminal running a plain-English browser test to a green PASSED verdict."
                    loading="lazy"
                    decoding="async"
                    width={1280}
                    height={720}
                />
            )}
        </div>
    );
}
