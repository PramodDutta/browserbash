'use client';

import { useRef, useState } from 'react';
import { Bo, BrowserWindow } from './Bo';

/**
 * Bo + three floating browser windows. Clicking Bo (or a window)
 * swings the hammer and cracks the next window in line.
 */
export function HeroScene() {
    const [cracked, setCracked] = useState<boolean[]>([false, false, false]);
    const next = useRef(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    function bash() {
        const i = next.current % 3;
        next.current += 1;
        // crack lands mid-swing
        timers.current.push(setTimeout(() => {
            setCracked((c) => c.map((v, j) => (j === i ? true : v)));
        }, 280));
        timers.current.push(setTimeout(() => {
            setCracked((c) => c.map((v, j) => (j === i ? false : v)));
        }, 2200));
    }

    return (
        <div className="hero-scene" onClick={bash} role="presentation">
            <div className="hero-scene__win hero-scene__win--1"><BrowserWindow cracked={cracked[0]} size={64} /></div>
            <div className="hero-scene__win hero-scene__win--2"><BrowserWindow cracked={cracked[1]} size={84} /></div>
            <div className="hero-scene__win hero-scene__win--3"><BrowserWindow cracked={cracked[2]} size={56} /></div>
            <div className="hero-scene__bo">
                <Bo pose="idle" size={150} />
            </div>
            <p className="hero-scene__hint">click Bo · he bashes browsers</p>
        </div>
    );
}
