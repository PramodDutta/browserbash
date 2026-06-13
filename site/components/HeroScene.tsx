'use client';

import { useEffect, useRef, useState } from 'react';
import { Bo, BrowserWindow } from './Bo';

/**
 * Bo + three floating browser windows. Bo bashes on click AND on an ambient
 * timer so the hero is always alive; each swing cracks the next window in line.
 */
export function HeroScene() {
    const [cracked, setCracked] = useState<boolean[]>([false, false, false]);
    const [signal, setSignal] = useState(0);
    const next = useRef(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    function bash() {
        setSignal((s) => s + 1); // tell Bo to swing
        const i = next.current % 3;
        next.current += 1;
        // crack lands mid-swing, clears a moment later
        timers.current.push(setTimeout(() => {
            setCracked((c) => c.map((v, j) => (j === i ? true : v)));
        }, 280));
        timers.current.push(setTimeout(() => {
            setCracked((c) => c.map((v, j) => (j === i ? false : v)));
        }, 1600));
    }

    // Ambient: Bo bashes a window on his own every few seconds.
    useEffect(() => {
        const id = setInterval(bash, 3600);
        return () => {
            clearInterval(id);
            timers.current.forEach(clearTimeout);
        };
    }, []);

    return (
        <div className="hero-scene" onClick={bash} role="presentation">
            <div className="hero-scene__win hero-scene__win--1"><BrowserWindow cracked={cracked[0]} size={64} /></div>
            <div className="hero-scene__win hero-scene__win--2"><BrowserWindow cracked={cracked[1]} size={84} /></div>
            <div className="hero-scene__win hero-scene__win--3"><BrowserWindow cracked={cracked[2]} size={56} /></div>
            <div className="hero-scene__bo">
                <Bo pose="idle" size={150} bashSignal={signal} />
            </div>
            <p className="hero-scene__hint">click Bo · he bashes browsers</p>
        </div>
    );
}
