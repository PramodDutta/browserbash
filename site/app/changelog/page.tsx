import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Changelog — BrowserBash',
    description:
        'Every BrowserBash release, newest first. From the first public v1.0.0 to local and cloud dashboards, session recording, run sync, and more.',
    alternates: { canonical: '/changelog' },
    openGraph: {
        title: 'Changelog — BrowserBash',
        description: 'Every BrowserBash release, newest first.',
        url: 'https://browserbash.com/changelog',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function ChangelogPage() {
    return (
        <>
            <SiteNav />
            <main>
                <section className="mkt-hero">
                    <p className="section-tag">changelog</p>
                    <h1>What&rsquo;s new</h1>
                    <p>Every release, newest first.</p>
                </section>

                <div className="log-list">
                    <p>
                        BrowserBash follows{' '}
                        <a href="https://semver.org" target="_blank" rel="noopener noreferrer">
                            semantic versioning
                        </a>
                        : <code>MAJOR.MINOR.PATCH</code>. The latest release is tagged{' '}
                        <strong>current</strong> below.
                    </p>

                    <article className="log-entry">
                        <div className="log-entry__v">
                            <span className="log-entry__tag">v1.3.1</span>
                            <span className="log-entry__date">12 Jun 2026 &middot; current</span>
                        </div>
                        <ul>
                            <li>
                                New local <code>dashboard</code> command &mdash; a free web dashboard that runs
                                entirely on your machine to browse your runs.
                            </li>
                            <li>
                                Added <code>--upload</code> to push a single run to the cloud dashboard on demand.
                            </li>
                            <li>Free cloud run retention is now set to 15 days, after which runs auto-delete.</li>
                            <li>Documentation refreshed across install, recording, and dashboard guides.</li>
                        </ul>
                    </article>

                    <article className="log-entry">
                        <div className="log-entry__v">
                            <span className="log-entry__tag">v1.3.0</span>
                            <span className="log-entry__date">10 Jun 2026</span>
                        </div>
                        <ul>
                            <li>
                                Expiring API keys (30-day) for linking the CLI to your account, so stale credentials
                                roll over automatically.
                            </li>
                            <li>Per-account rate cap to keep cloud usage fair and predictable.</li>
                            <li>Health verification for the connection between the CLI and the cloud.</li>
                        </ul>
                    </article>

                    <article className="log-entry">
                        <div className="log-entry__v">
                            <span className="log-entry__tag">v1.2.0</span>
                            <span className="log-entry__date">6 Jun 2026</span>
                        </div>
                        <ul>
                            <li>
                                Session recording via <code>--record</code> &mdash; capture video and screenshots of a
                                run.
                            </li>
                            <li>Video and screenshot artifacts are stored in the cloud when you upload a run.</li>
                            <li>Per-run replay in the dashboard so you can step through what the agent did.</li>
                        </ul>
                    </article>

                    <article className="log-entry">
                        <div className="log-entry__v">
                            <span className="log-entry__tag">v1.1.0</span>
                            <span className="log-entry__date">3 Jun 2026</span>
                        </div>
                        <ul>
                            <li>
                                Run sync: link the CLI with <code>browserbash connect</code> to send runs to your
                                account.
                            </li>
                            <li>New runs API powering the sync flow.</li>
                            <li>A runs view in the cloud dashboard to see your synced run history.</li>
                        </ul>
                    </article>

                    <article className="log-entry">
                        <div className="log-entry__v">
                            <span className="log-entry__tag">v1.0.0</span>
                            <span className="log-entry__date">1 Jun 2026</span>
                        </div>
                        <ul>
                            <li>
                                First public release. Plain-English objectives drive a real local Chrome &mdash; no
                                code, no selectors.
                            </li>
                            <li>
                                Markdown <code>*_test.md</code> test files with <code>@import</code> composition.
                            </li>
                            <li>
                                Ollama, OpenRouter, and Anthropic backends &mdash; run on free local or free hosted
                                models with zero API keys.
                            </li>
                            <li>NDJSON agent mode with CI-friendly exit codes (0/1/2/3).</li>
                            <li>Free local web dashboard for browsing your runs.</li>
                        </ul>
                    </article>
                </div>

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Start automating in one line</h2>
                        <p>Free, open-source, and no API keys to begin. See everything it can do.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/features">
                                Explore features
                            </a>
                            <a
                                className="pixel-btn"
                                href="https://www.npmjs.com/package/browserbash-cli"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View on npm
                            </a>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
