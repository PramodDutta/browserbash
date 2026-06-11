'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './terminal.css';

export interface DemoEvent {
    t: number;
    line: string;
}

export interface DemoRecording {
    objective: string;
    command: string;
    recordedAt: string | null;
    simulated?: boolean;
    events: DemoEvent[];
}

interface StepJson {
    type: 'step' | 'run_end';
    step?: number;
    status: string;
    action?: string;
    remark?: string;
    summary?: string;
    final_state?: Record<string, string>;
    duration_ms?: number;
    steps_executed?: number;
}

function parse(line: string): StepJson | null {
    try {
        return JSON.parse(line) as StepJson;
    } catch {
        return null;
    }
}

function HumanLine({ ev }: { ev: StepJson }) {
    if (ev.type === 'step') {
        const icon = ev.status === 'passed' ? '✓' : ev.status === 'failed' ? '✗' : '→';
        const cls = ev.status === 'passed' ? 'ok' : ev.status === 'failed' ? 'err' : 'dim';
        return (
            <div className="t-line">
                <span className={`t-${cls}`}>{icon}</span> [{ev.step}] <span className="t-action">{ev.action}</span>: {ev.remark}
            </div>
        );
    }
    return (
        <div className="t-line t-end">
            <div className={ev.status === 'passed' ? 't-ok' : 't-err'}>
                {ev.status.toUpperCase()} in {((ev.duration_ms ?? 0) / 1000).toFixed(1)}s — {ev.summary}
            </div>
            {ev.final_state && Object.keys(ev.final_state).length > 0 && (
                <pre className="t-state">{JSON.stringify(ev.final_state, null, 2)}</pre>
            )}
        </div>
    );
}

const GAP_CAP_MS = 800;

export function Terminal({ demo, autoplay = true }: { demo: DemoRecording; autoplay?: boolean }) {
    const [shown, setShown] = useState(0);
    const [tab, setTab] = useState<'human' | 'ndjson'>('human');
    const [started, setStarted] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const play = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setShown(0);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
            setShown(demo.events.length);
            return;
        }
        let acc = 300;
        demo.events.forEach((ev, i) => {
            const prev = i === 0 ? 0 : demo.events[i - 1].t;
            acc += Math.min(ev.t - prev, GAP_CAP_MS);
            timers.current.push(setTimeout(() => setShown(i + 1), acc));
        });
    }, [demo]);

    // start on scroll into view
    useEffect(() => {
        if (!autoplay || started) return;
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setStarted(true);
                    play();
                    io.disconnect();
                }
            },
            { threshold: 0.35 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [autoplay, started, play]);

    // restart when the recording itself changes
    useEffect(() => {
        if (started) play();
        return () => timers.current.forEach(clearTimeout);
    }, [demo, started, play]);

    const visible = demo.events.slice(0, shown);
    const done = shown >= demo.events.length;

    return (
        <div className="terminal pixel-card" ref={ref}>
            <div className="terminal__chrome">
                <span className="terminal__dot terminal__dot--err" />
                <span className="terminal__dot terminal__dot--warn" />
                <span className="terminal__dot terminal__dot--ok" />
                <span className="terminal__title">browserbash</span>
                {demo.simulated && <span className="terminal__badge">preview</span>}
                <div className="terminal__tabs" role="tablist" aria-label="Output format">
                    <button role="tab" aria-selected={tab === 'human'} className={tab === 'human' ? 'on' : ''} onClick={() => setTab('human')}>
                        human
                    </button>
                    <button role="tab" aria-selected={tab === 'ndjson'} className={tab === 'ndjson' ? 'on' : ''} onClick={() => setTab('ndjson')}>
                        --agent NDJSON
                    </button>
                </div>
            </div>
            <div className="terminal__screen" aria-live="polite">
                <div className="t-line t-cmd">
                    <span className="t-prompt">$</span> {demo.command}
                </div>
                {tab === 'human'
                    ? visible.map((e, i) => {
                          const p = parse(e.line);
                          return p ? <HumanLine key={i} ev={p} /> : null;
                      })
                    : visible.map((e, i) => (
                          <div className="t-line t-raw" key={i}>{e.line}</div>
                      ))}
                {!done && <span className="t-cursor" aria-hidden="true" />}
                {done && (
                    <button className="t-replay" onClick={play} aria-label="Replay demo">
                        ↻ replay
                    </button>
                )}
            </div>
        </div>
    );
}
