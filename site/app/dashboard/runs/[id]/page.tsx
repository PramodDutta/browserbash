import { notFound } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { Bo } from '@/components/Bo';
import { sql } from '@/lib/db';
import '../../../landing.css';
import '../../dashboard.css';
import './run.css';

export const dynamic = 'force-dynamic';

interface RunRow {
    id: number;
    objective: string;
    status: string;
    duration_ms: number;
    steps_executed: number;
    provider: string | null;
    model: string | null;
    final_state: Record<string, string>;
    cli_version: string | null;
    screenshot_url: string | null;
    video_url: string | null;
    trace_url: string | null;
    created_at: string;
    expires_at: string | null;
    days_left: number | null;
}

export default async function RunDetail({ params }: { params: Promise<{ id: string }> }) {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) notFound();
    const user = await currentUser();
    if (!user) notFound();

    const { id } = await params;
    const runId = Number(id);
    if (!Number.isInteger(runId)) notFound();

    const rows = (await sql()`
        SELECT id, objective, status, duration_ms, steps_executed, provider, model, final_state, cli_version,
               screenshot_url, video_url, trace_url,
               to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
               to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
               CASE WHEN expires_at IS NULL THEN NULL
                    ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - now())) / 86400))::int END AS days_left
        FROM runs WHERE id = ${runId} AND user_id = ${user.id}`) as unknown as RunRow[];
    if (rows.length === 0) notFound();
    const run = rows[0];

    const hasArtifacts = run.screenshot_url || run.video_url || run.trace_url;
    const stateKeys = Object.keys(run.final_state ?? {});

    return (
        <>
            <nav className="nav container">
                <a href="/" className="nav__brand">
                    <Bo size={26} interactive={false} pose="idle" />
                    <span>BrowserBash</span>
                </a>
                <div className="nav__links">
                    <a href="/dashboard">Dashboard</a>
                    <a href="/learn">Learn</a>
                </div>
            </nav>

            <main className="container run">
                <a className="run__back" href="/dashboard">← all runs</a>
                <header className="run__head">
                    <span className={`runs__badge runs__badge--${run.status}`}>{run.status}</span>
                    <h1>Run #{run.id}</h1>
                    <p className="run__time">{run.created_at} · {(run.duration_ms / 1000).toFixed(1)}s · {run.steps_executed} steps</p>
                    {run.days_left === null ? (
                        <p className="run__retention">Kept — retention extended</p>
                    ) : (
                        <p className="run__retention run__retention--free">
                            This run and its recording are deleted on {run.expires_at} ({run.days_left} day{run.days_left === 1 ? '' : 's'} left).
                        </p>
                    )}
                </header>

                <section className="run__objective pixel-card">
                    <span className="dash__lbl">objective</span>
                    <p>&ldquo;{run.objective}&rdquo;</p>
                    <div className="run__meta">
                        <span>provider: <strong>{run.provider ?? '—'}</strong></span>
                        <span>model: <strong>{run.model ?? '—'}</strong></span>
                        {run.cli_version && <span>CLI: <strong>v{run.cli_version}</strong></span>}
                    </div>
                </section>

                {stateKeys.length > 0 && (
                    <section className="run__state pixel-card">
                        <span className="dash__lbl">extracted values</span>
                        <pre>{JSON.stringify(run.final_state, null, 2)}</pre>
                    </section>
                )}

                <section className="run__artifacts">
                    <p className="section-tag">session recording</p>
                    {!hasArtifacts && (
                        <div className="run__noart pixel-card">
                            <strong>No recording for this run.</strong>
                            <p>Re-run with <code>--record</code> to capture a screenshot (and video + trace on the builtin engine):</p>
                            <code className="run__cmd">browserbash run &quot;{run.objective.slice(0, 60)}…&quot; --record</code>
                        </div>
                    )}
                    {run.video_url && (
                        <div className="run__art pixel-card">
                            <span className="dash__lbl">video</span>
                            <video controls src={run.video_url} className="run__video" />
                        </div>
                    )}
                    {run.screenshot_url && (
                        <div className="run__art pixel-card">
                            <span className="dash__lbl">final screenshot</span>
                            <a href={run.screenshot_url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={run.screenshot_url} alt={`Final screenshot of run ${run.id}`} className="run__shot" />
                            </a>
                        </div>
                    )}
                    {run.trace_url && (
                        <div className="run__art pixel-card run__trace">
                            <span className="dash__lbl">playwright trace</span>
                            <p>Download and open at <a href="https://trace.playwright.dev" target="_blank" rel="noopener noreferrer">trace.playwright.dev</a> for a step-by-step timeline.</p>
                            <a className="pixel-btn ghost" href={run.trace_url} download>Download trace.zip</a>
                        </div>
                    )}
                </section>
            </main>
        </>
    );
}
