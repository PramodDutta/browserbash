import type { Metadata } from 'next';
import { Bo } from '@/components/Bo';
import { RETENTION_DAYS } from '@/lib/plans';
import '../landing.css';
import './pricing.css';

const GITHUB = 'https://github.com/PramodDutta/browserbash';
const UPGRADE_MAILTO =
    'mailto:thetestingacademy@gmail.com?subject=BrowserBash%20Pro&body=I%27d%20like%20to%20upgrade%20to%20BrowserBash%20Pro%20and%20keep%20my%20run%20data.';

export const metadata: Metadata = {
    title: 'Pricing — BrowserBash',
    description:
        'BrowserBash is free and open source. The CLI runs fully local with zero signup. The optional cloud dashboard keeps your runs and recordings 15 days on Free; upgrade to Pro to keep them forever.',
    alternates: { canonical: '/pricing' },
    openGraph: {
        title: 'Pricing — BrowserBash',
        description: 'Free CLI, free local dashboard. Cloud dashboard keeps runs 15 days on Free, forever on Pro.',
        url: 'https://browserbash.com/pricing',
        siteName: 'BrowserBash',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash pricing' }],
        type: 'website',
    },
};

export default function Pricing() {
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
                    <a href="/pricing">Pricing</a>
                </div>
                <a className="pixel-btn ghost nav__gh" href={GITHUB} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            </nav>

            <main className="container pricing">
                <header className="pricing__head">
                    <p className="section-tag">pricing</p>
                    <h1>Free to run. Pay only to keep your data.</h1>
                    <p className="pricing__sub">
                        The CLI is open source (Apache-2.0) and runs fully local with no account. The{' '}
                        <strong>local dashboard is always free</strong>. You only ever pay to keep your runs in the
                        cloud past {RETENTION_DAYS} days.
                    </p>
                </header>

                <div className="pricing__grid">
                    <section className="pixel-card pricing__plan">
                        <h2>Free</h2>
                        <p className="pricing__price">$0<span>/forever</span></p>
                        <ul className="pricing__feats">
                            <li>✓ Full CLI — every provider, engine and model</li>
                            <li>✓ Run fully local, <strong>zero signup</strong></li>
                            <li>✓ <code>browserbash dashboard</code> — free local dashboard, private</li>
                            <li>✓ Cloud dashboard: run history + recordings</li>
                            <li>✓ Screenshot, video &amp; trace per run</li>
                            <li className="pricing__limit">⏳ Cloud runs kept <strong>{RETENTION_DAYS} days</strong>, then deleted</li>
                        </ul>
                        <a className="pixel-btn pricing__cta" href="/dashboard">Create free account →</a>
                    </section>

                    <section className="pixel-card pricing__plan pricing__plan--pro">
                        <span className="pricing__badge">keep your data</span>
                        <h2>Pro</h2>
                        <p className="pricing__price">Founder pricing<span>· early access</span></p>
                        <ul className="pricing__feats">
                            <li>✓ Everything in Free</li>
                            <li>✓ Cloud runs &amp; recordings <strong>kept forever</strong></li>
                            <li>✓ Full searchable run history</li>
                            <li>✓ Priority on new dashboard features</li>
                            <li>✓ Support an open-source project</li>
                        </ul>
                        <a className="pixel-btn pricing__cta" href={UPGRADE_MAILTO}>Upgrade to Pro →</a>
                        <p className="pricing__note">
                            Self-serve checkout is landing soon. Email us now and we&apos;ll switch your account to Pro
                            and lock in founder pricing.
                        </p>
                    </section>
                </div>

                <section className="pricing__faq">
                    <h2>The short version</h2>
                    <div className="pricing__faq-grid">
                        <div>
                            <strong>Do I need to pay to use BrowserBash?</strong>
                            <p>No. The CLI and the local dashboard are free forever. Payment only keeps your cloud run data past {RETENTION_DAYS} days.</p>
                        </div>
                        <div>
                            <strong>What happens after {RETENTION_DAYS} days on Free?</strong>
                            <p>Each cloud run — and its screenshot, video and trace — is deleted {RETENTION_DAYS} days after it ran. Your local runs are never touched.</p>
                        </div>
                        <div>
                            <strong>Can I keep everything locally instead?</strong>
                            <p>Yes. Run without <code>--upload</code> and nothing leaves your machine. <code>browserbash dashboard</code> shows your local runs and recordings, free and private.</p>
                        </div>
                        <div>
                            <strong>Is the CLI really open source?</strong>
                            <p>Yes — Apache-2.0, the full agent loop is in the <a href={GITHUB}>repo</a>. Pro funds the hosted dashboard, not the CLI.</p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="footer">
                <div className="container footer__in">
                    <div className="footer__brand">
                        <Bo size={32} interactive={false} />
                        <span>BrowserBash</span>
                    </div>
                    <div className="footer__links">
                        <a href="/learn">Learn</a>
                        <a href="/blog">Blog</a>
                        <a href="/pricing">Pricing</a>
                        <a href={GITHUB} target="_blank" rel="noopener noreferrer">GitHub</a>
                    </div>
                    <p className="footer__credit">Built by The Testing Academy</p>
                </div>
            </footer>
        </>
    );
}
