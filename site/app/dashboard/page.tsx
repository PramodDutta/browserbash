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
import { getPlan, RETENTION_DAYS } from '@/lib/plans';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import '../landing.css';
import './dashboard.css';

export const dynamic = 'force-dynamic';

const INSTALL = 'npm install -g browserbash-cli';

export default async function Dashboard() {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) notFound();

    const user = await currentUser();
    if (!user) notFound(); // proxy redirects first; belt-and-braces
    const email = (user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? '').toLowerCase();
    const firstName = user.firstName ?? email.split('@')[0] ?? 'tester';

    const db = sql();
    const plan = await getPlan(user.id);
    const doneSteps = ((await db`SELECT step FROM onboarding WHERE user_id = ${user.id}`) as Array<{ step: string }>).map((r) => r.step);

    const demoRaw = await fs.readFile(path.join(process.cwd(), 'public/demos/login.json'), 'utf8');
    const demo = JSON.parse(demoRaw) as DemoRecording;

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
                        <span className="dash__num">{plan === 'pro' ? 'Pro' : 'Free'}</span>
                        <span className="dash__lbl">your plan</span>
                        {plan === 'pro' ? (
                            <p className="dash__join">Cloud runs kept forever. Thanks for supporting BrowserBash 🔨</p>
                        ) : (
                            <p className="dash__join">
                                Cloud runs kept {RETENTION_DAYS} days. <a href="/pricing">Upgrade to keep them →</a>
                            </p>
                        )}
                    </div>
                    <div className="pixel-card dash__stat">
                        <span className="dash__num">v1.3.0</span>
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
                            <a className="pixel-btn ghost" href="/learn#challenges">all 14 scenarios →</a>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}
