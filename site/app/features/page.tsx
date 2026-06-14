import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Features — BrowserBash',
    description:
        'Plain-English browser automation: write Markdown tests, run on real browsers and free local models, record sessions, and ship in CI — open source and zero API keys.',
    alternates: { canonical: '/features' },
    openGraph: {
        title: 'Features — BrowserBash',
        description:
            'Everything you need to test a browser in plain English — Markdown tests, free models, real browsers, recordings, dashboards, and CI.',
        url: 'https://browserbash.com/features',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function FeaturesPage() {
    return (
        <>
            <SiteNav />
            <main>
                <section className="mkt-hero">
                    <p className="section-tag">features</p>
                    <h1>
                        Everything you need to test a browser in <span className="hero__accent">plain English</span>
                    </h1>
                    <p>
                        BrowserBash turns a plain-English objective into real browser actions through an AI agent — no code,
                        no selectors. It runs on free local models with zero API keys, drives real browsers, and fits straight
                        into your test suite and CI.
                    </p>
                </section>

                <h2 style={{ textAlign: 'center' }}>Write tests the way you&rsquo;d describe them</h2>
                <div className="feature-grid">
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">💬</span>
                        <h3>Plain-English objectives</h3>
                        <p>
                            Describe what you want — &ldquo;log in and add the first product to the cart&rdquo; — and the agent
                            figures out the clicks and typing. No CSS selectors, no XPath, no code to maintain.
                        </p>
                    </article>
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">📝</span>
                        <h3>Markdown test files</h3>
                        <p>
                            Save your scenarios as readable <code>*_test.md</code> files and compose them with{' '}
                            <code>@import</code>, so shared setup and reusable flows stay in one place across your whole suite.
                        </p>
                    </article>
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">🔑</span>
                        <h3>Variables &amp; secret masking</h3>
                        <p>
                            Template values into your tests with variables, and pass credentials as secrets that are
                            automatically masked in logs and output — so nothing sensitive leaks into your run history.
                        </p>
                    </article>
                </div>

                <h2 style={{ textAlign: 'center' }}>Run it anywhere, for free</h2>
                <div className="feature-grid">
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">🆓</span>
                        <h3>Free models, zero keys</h3>
                        <p>
                            Run on free local models with Ollama or free models on OpenRouter — no API keys, no credit card.
                            Want more power? Bring your own Anthropic or OpenRouter key whenever you like.
                        </p>
                    </article>
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">🌐</span>
                        <h3>Real browsers &amp; providers</h3>
                        <p>
                            Drive a real local Chrome, any CDP endpoint, or cloud grids like Browserbase, LambdaTest, and
                            BrowserStack — the same test runs everywhere, from your laptop to a remote browser farm.
                        </p>
                    </article>
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">🔓</span>
                        <h3>Open source &amp; free</h3>
                        <p>
                            BrowserBash is free and open source under Apache-2.0. Install with{' '}
                            <code>npm install -g browserbash-cli</code>, read the source, and audit exactly what it does.
                        </p>
                    </article>
                </div>

                <h2 style={{ textAlign: 'center' }}>Ship it into CI and see every run</h2>
                <div className="feature-grid">
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">🤖</span>
                        <h3>Agent mode &amp; CI</h3>
                        <p>
                            Stream structured NDJSON output for tooling and agents, and rely on clean CI exit codes
                            (<code>0</code>/<code>1</code>/<code>2</code>/<code>3</code>) to gate your pipeline on real
                            pass/fail signals.
                        </p>
                    </article>
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">🎥</span>
                        <h3>Session recording</h3>
                        <p>
                            Add <code>--record</code> to capture video and screenshots of a run, so you can see exactly what
                            the agent did and share a clear repro when something breaks.
                        </p>
                    </article>
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">📊</span>
                        <h3>Local dashboard</h3>
                        <p>
                            Run the <code>dashboard</code> command to open a free, fully local web dashboard — browse your runs
                            on your own machine, no account and nothing uploaded.
                        </p>
                    </article>
                    <article className="pixel-card feature-card">
                        <span className="fc-ico" aria-hidden="true">☁️</span>
                        <h3>Cloud dashboard</h3>
                        <p>
                            Create a free account to keep run history, video recordings, and per-run replay in the cloud. Link
                            the CLI with <code>browserbash connect</code> and upload a run with <code>--upload</code>.
                        </p>
                    </article>
                </div>

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Start automating in plain English</h2>
                        <p>Install the open-source CLI and run your first test in minutes — no API keys, no credit card.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">Sign up free</a>
                            <a className="pixel-btn" href="/learn">Read the docs</a>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
