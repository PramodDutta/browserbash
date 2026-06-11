'use client';

import { useEffect, useState } from 'react';
import { Terminal, type DemoRecording } from './Terminal';
import { CopyButton } from './CopyButton';
import { DEMOS } from '@/lib/demos';

export function TryIt() {
    const [active, setActive] = useState(DEMOS[0]);
    const [recording, setRecording] = useState<DemoRecording | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        fetch(active.file)
            .then((r) => {
                if (!r.ok) throw new Error(String(r.status));
                return r.json();
            })
            .then((d: DemoRecording) => { if (alive) setRecording(d); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [active]);

    return (
        <div className="tryit">
            <div className="tryit__chips" role="tablist" aria-label="Pick an objective">
                {DEMOS.map((d) => (
                    <button
                        key={d.id}
                        role="tab"
                        aria-selected={active.id === d.id}
                        className={`tryit__chip ${active.id === d.id ? 'on' : ''}`}
                        onClick={() => setActive(d)}
                    >
                        {d.label}
                    </button>
                ))}
            </div>
            {recording && !failed && (
                <>
                    <Terminal demo={recording} autoplay />
                    <div className="tryit__run">
                        <code>{recording.command}</code>
                        <CopyButton text={recording.command} label="copy & run locally" />
                    </div>
                </>
            )}
            {failed && <p className="tryit__fail">Could not load this demo — try another.</p>}
        </div>
    );
}
