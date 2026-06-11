import { notFound } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import './dashboard.css';

export const dynamic = 'force-dynamic';

interface Row {
    id: number;
    email: string;
    name: string | null;
    use_case: string | null;
    created_at: string;
}

interface DayCount {
    day: string;
    count: number;
}

export default async function Dashboard() {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) notFound();

    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;
    if (!isAdmin(email)) notFound();

    const db = sql();
    const [{ total }] = (await db`SELECT COUNT(*)::int AS total FROM waitlist`) as Array<{ total: number }>;
    const days = (await db`
        SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM waitlist
        WHERE created_at > now() - interval '7 days'
        GROUP BY 1 ORDER BY 1`) as unknown as DayCount[];
    const rows = (await db`
        SELECT id, email, name, use_case, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
        FROM waitlist ORDER BY id DESC LIMIT 50`) as unknown as Row[];

    const max = Math.max(1, ...days.map((d) => d.count));

    return (
        <main className="dash container">
            <header className="dash__head">
                <h1>Waitlist</h1>
                <a className="pixel-btn ghost" href="/api/export">Export CSV</a>
            </header>

            <section className="dash__cards">
                <div className="pixel-card dash__stat">
                    <span className="dash__num">{total.toLocaleString()}</span>
                    <span className="dash__lbl">total signups</span>
                </div>
                <div className="pixel-card dash__stat">
                    <span className="dash__num">{days.reduce((a, d) => a + d.count, 0)}</span>
                    <span className="dash__lbl">last 7 days</span>
                </div>
                <div className="pixel-card dash__chart" aria-label="Signups per day, last 7 days">
                    {days.length === 0 && <span className="dash__lbl">no signups yet</span>}
                    {days.map((d) => (
                        <div className="dash__bar" key={d.day} title={`${d.day}: ${d.count}`}>
                            <div className="dash__bar-fill" style={{ height: `${(d.count / max) * 100}%` }} />
                            <span>{d.day.slice(5)}</span>
                        </div>
                    ))}
                </div>
            </section>

            <table className="dash__table pixel-card">
                <thead>
                    <tr><th>#</th><th>Email</th><th>Name</th><th>Use case</th><th>When</th></tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.id}>
                            <td>{r.id}</td>
                            <td>{r.email}</td>
                            <td>{r.name ?? '—'}</td>
                            <td>{r.use_case ?? '—'}</td>
                            <td>{r.created_at}</td>
                        </tr>
                    ))}
                    {rows.length === 0 && (
                        <tr><td colSpan={5}>Nobody yet — share the link.</td></tr>
                    )}
                </tbody>
            </table>
        </main>
    );
}
