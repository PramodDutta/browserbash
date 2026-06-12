import { notFound } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { Bo } from '@/components/Bo';
import { Onboarding } from '@/components/Onboarding';
import { BackendPicker } from '@/components/BackendPicker';
import { ConnectCard } from '@/components/ConnectCard';
import { RunsTable } from '@/components/RunsTable';
import { CopyButton } from '@/components/CopyButton';
import { Terminal, type DemoRecording } from '@/components/Terminal';
import { sql } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import '../landing.css';
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

const INSTALL = 'npm install -g browserbash-cli';

export default async function Dashboard() {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) notFound();

    const user = await currentUser();
    if (!user) notFound(); // proxy redirects first; belt-and-braces
    const email = (user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? '').toLowerCase();
    const firstName = user.firstName ?? email.split('@')[0] ?? 'tester';
    const admin = isAdmin(email);

    const db = sql();

    // user data
    const wl = (await db`SELECT id FROM waitlist WHERE email = ${email} LIMIT 1`) as Array<{ id: number }>;
    const position = wl.length > 0
        ? Number(((await db`SELECT COUNT(*)::int AS pos FROM waitlist WHERE id <= ${wl[0].id}`) as Array<{ pos: number }>)[0].pos)
        : null;
    const doneSteps = ((await db`SELECT step FROM onboarding WHERE user_id = ${user.id}`) as Array<{ step: string }>).map((r) => r.step);

    const demoRaw = await fs.readFile(path.join(process.cwd(), 'public/demos/login.json'), 'utf8');
    const demo = JSON.parse(demoRaw) as DemoRecording;

    // admin data
    let total = 0;
    let days: DayCount[] = [];
    let rows: Row[] = [];
    if (admin) {
        total = Number(((await db`SELECT COUNT(*)::int AS total FROM waitlist`) as Array<{ total: number }>)[0].total);
        days = (await db`
            SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
            FROM waitlist WHERE created_at > now() - interval '7 days'
            GROUP BY 1 ORDER BY 1`) as unknown as DayCount[];
        rows = (await db`
            SELECT id, email, name, use_case, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
            FROM waitlist ORDER BY id DESC LIMIT 50`) as unknown as Row[];
    }
    const max = Math.max(1, ...days.map((d) => d.count));

    return (
        <>
            <nav className="nav container">
                <a href="/" className="nav__brand">
                    <Bo size={26} interactive={false} pose="idle" />
                    <span>BrowserBash</span>
                </a>
                <div className="nav__links">
                    <a href="/learn">Learn</a>
                    <a href="/blog">Blog</a>
                </div>
                <div className="dash-userbtn"><UserButton /></div>
            </nav>

            <main className="dash container">
                <header className="dash__hello">
                    <Bo size={56} />
                    <div>
                        <p className="section-tag">mission control</p>
                        <h1>Ready to bash, {firstName}?</h1>
                    </div>
                </header>

                <section className="dash__cards">
                    <div className="pixel-card dash__stat">
                        {position !== null ? (
                            <>
                                <span className="dash__num">#{position}</span>
                                <span className="dash__lbl">your waitlist spot</span>
                            </>
                        ) : (
                            <>
                                <span className="dash__num">—</span>
                                <span className="dash__lbl">not on the waitlist yet</span>
                                <a href="/#top" className="dash__join">join with {email} →</a>
                            </>
                        )}
                    </div>
                    <div className="pixel-card dash__stat">
                        <span className="dash__num">v1.0.1</span>
                        <span className="dash__lbl">latest CLI on npm</span>
                        <div className="dash__install">
                            <code>{INSTALL}</code>
                            <CopyButton text={INSTALL} />
                        </div>
                    </div>
                    <ConnectCard />
                </section>

                <section className="dash__runs">
                    <p className="section-tag">your runs</p>
                    <h2>Every verdict, synced from your terminal</h2>
                    <RunsTable />
                </section>

                <section className="dash__cards dash__cards--two">
                    <div className="pixel-card dash__backend">
                        <span className="dash__lbl">pick your brain</span>
                        <BackendPicker />
                    </div>
                </section>

                <section className="dash__row">
                    <Onboarding initialDone={doneSteps} />
                    <div className="dash__demo">
                        <p className="section-tag">your first scenario</p>
                        <h2>Secret Agent Login — real recorded run</h2>
                        <Terminal demo={demo} autoplay />
                        <div className="dash__demo-cta">
                            <a className="pixel-btn ghost" href="/learn#challenges">all 12 scenarios →</a>
                        </div>
                    </div>
                </section>

                {admin && (
                    <section className="dash__admin">
                        <header className="dash__head">
                            <h2>Admin — waitlist</h2>
                            <a className="pixel-btn ghost" href="/api/export">Export CSV</a>
                        </header>
                        <div className="dash__cards">
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
                        </div>
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
                    </section>
                )}
            </main>
        </>
    );
}
