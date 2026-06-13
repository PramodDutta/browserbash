'use client';

import { useEffect, useState } from 'react';

interface Run {
    id: number;
    objective: string;
    status: 'passed' | 'failed' | 'error' | 'timeout';
    duration_ms: number;
    steps_executed: number;
    provider: string | null;
    model: string | null;
    final_state: Record<string, string>;
    cli_version: string | null;
    created_at: string;
    screenshot_url: string | null;
    video_url: string | null;
    trace_url: string | null;
    expires_at: string | null;
    days_left: number | null;
}

export function RunsTable() {
    const [runs, setRuns] = useState<Run[] | null>(null);

    useEffect(() => {
        fetch('/api/runs')
            .then((r) => r.json())
            .then((d: { runs?: Run[] }) => setRuns(d.runs ?? []))
            .catch(() => setRuns([]));
    }, []);

    if (runs === null) return <p className="runs__empty">Loading runs…</p>;

    if (runs.length === 0) {
        return (
            <div className="runs__empty pixel-card">
                <strong>No runs yet.</strong>
                <p>Connect your CLI above, then any run shows up here within seconds:</p>
                <code>browserbash run &quot;Open https://example.com and store the main heading text as &apos;h1&apos;&quot; --headless</code>
            </div>
        );
    }

    return (
        <table className="dash__table pixel-card runs__table">
            <thead>
                <tr><th>When</th><th>Objective</th><th>Verdict</th><th>Steps</th><th>Time</th><th>Rec</th><th>Kept</th><th></th></tr>
            </thead>
            <tbody>
                {runs.map((r) => {
                    const kept = r.days_left === null
                        ? '∞'
                        : r.days_left <= 0 ? 'today' : `${r.days_left}d`;
                    return (
                        <tr key={r.id} className="runs__row" onClick={() => { window.location.href = `/dashboard/runs/${r.id}`; }}>
                            <td className="runs__when">{r.created_at}</td>
                            <td className="runs__obj">{r.objective}</td>
                            <td><span className={`runs__badge runs__badge--${r.status}`}>{r.status}</span></td>
                            <td>{r.steps_executed}</td>
                            <td>{(r.duration_ms / 1000).toFixed(1)}s</td>
                            <td className="runs__rec">{r.video_url ? '📹' : r.screenshot_url ? '🖼' : r.trace_url ? '◈' : '—'}</td>
                            <td className={`runs__kept ${r.days_left !== null && r.days_left <= 3 ? 'runs__kept--low' : ''}`} title={r.days_left === null ? 'Retention extended — kept' : `Deleted in ${r.days_left} day(s)`}>{kept}</td>
                            <td className="runs__open"><a href={`/dashboard/runs/${r.id}`}>view →</a></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
