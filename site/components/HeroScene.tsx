'use client';

import { useEffect, useRef, useState } from 'react';
import { Bo, BrowserWindow } from './Bo';

/**
 * Bo + three floating browser windows, animated as a tiny product demo:
 * a terminal types a plain-English objective, Bo bashes the target window,
 * and it flashes "PASSED" — plain English in, real browser out. Clicking Bo
 * also triggers a bash. All motion is reduced-motion friendly.
 */

const OBJECTIVES = [
    'Log in and verify the dashboard',
    'Add the backpack to the cart',
    'Search and store the first result',
    'Fill the form and submit',
];

const SIZES = [64, 84, 56];

export function HeroScene() {
    const [signal, setSignal] = useState(0);
    const [typed, setTyped] = useState('');
    const [cracked, setCracked] = useState([false, false, false]);
    const [passed, setPassed] = useState([false, false, false]);
    const objRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));

        async function loop() {
            // small initial beat so the hero paints first
            await wait(600);
            while (!cancelled) {
                const obj = OBJECTIVES[objRef.current % OBJECTIVES.length];
                const target = objRef.current % 3;

                setTyped('');
                for (let i = 1; i <= obj.length && !cancelled; i++) {
                    setTyped(obj.slice(0, i));
                    await wait(36);
                }
                if (cancelled) break;
                await wait(380);

                // run: Bo swings, target window cracks
                setSignal((s) => s + 1);
                setCracked((p) => p.map((v, j) => (j === target ? true : v)));
                await wait(640);

                // verdict: stop the crack, flash PASSED
                setCracked((p) => p.map((v, j) => (j === target ? false : v)));
                setPassed((p) => p.map((v, j) => (j === target ? true : v)));
                await wait(1400);

                setPassed((p) => p.map((v, j) => (j === target ? false : v)));
                setTyped('');
                objRef.current += 1;
                await wait(500);
            }
        }
        void loop();
        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
    }, []);

    return (
        <div className="hero-scene" onClick={() => setSignal((s) => s + 1)} role="presentation">
            <div className="hero-scene__cmd" aria-hidden="true">
                <span className="hero-scene__prompt">$ browserbash run</span>
                <span className="hero-scene__type">
                    &quot;{typed}<span className="hero-scene__caret" />&quot;
                </span>
            </div>

            {[0, 1, 2].map((i) => (
                <div key={i} className={`hero-scene__win hero-scene__win--${i + 1}`}>
                    <BrowserWindow cracked={cracked[i]} size={SIZES[i]} />
                    {passed[i] && <span className="hero-scene__pass">✓ PASSED</span>}
                </div>
            ))}

            <div className="hero-scene__bo">
                <Bo pose="idle" size={150} bashSignal={signal} />
            </div>
            <p className="hero-scene__hint">plain English in · real browser out</p>
        </div>
    );
}
