import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { CopyButton } from '@/components/CopyButton';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Pricing — BrowserBash',
    description:
        'BrowserBash is free, forever. The open-source CLI, the local dashboard, and a cloud account are all $0. You only ever optionally pay to keep cloud run history longer.',
    alternates: { canonical: '/pricing' },
    openGraph: {
        title: 'Pricing — BrowserBash',
        description: 'Free, forever. CLI, local dashboard, and a cloud account at $0. Optional paid retention keeps cloud runs longer.',
        url: 'https://browserbash.com/pricing',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function Page() {
    return (
        <>
            <SiteNav />
            <main>
                <section className="mkt-hero">
                    <p className="section-tag">pricing</p>
                    <h1>
                        Free. <span className="hero__accent">Forever.</span>
                    </h1>
                    <p>
                        The BrowserBash CLI, the local dashboard, and a cloud account are all free &mdash; no credit card,
                        no API keys, no trial clock. The only thing you can ever <em>optionally</em> pay for is keeping your
                        cloud run history longer than the free 15 days.
                    </p>
                </section>

                <div className="price-wrap">
                    <article className="pixel-card price-card price-card--feature">
                        <h3>Free</h3>
                        <div className="price-amt">
                            $0 <small>/ forever</small>
                        </div>
                        <ul>
                            <li>The full open-source CLI &mdash; every command, no locked features</li>
                            <li>Plain-English automation: an objective in, real browser actions out</li>
                            <li>All browser providers: local Chrome, any CDP endpoint, Browserbase, LambdaTest, BrowserStack</li>
                            <li>Free local models via Ollama or free OpenRouter models &mdash; zero API keys</li>
                            <li>Markdown <code>*_test.md</code> tests with <code>@import</code> composition and variable templating</li>
                            <li>NDJSON agent mode and CI exit codes for pipelines</li>
                            <li>Session recording with <code>--record</code> (video &amp; screenshots)</li>
                            <li>Free local web dashboard via the <code>dashboard</code> command</li>
                            <li>Free cloud account: 15-day run history, recordings &amp; per-run replay</li>
                            <li>Open source under Apache-2.0 &mdash; audit it, fork it, ship it</li>
                        </ul>
                        <a className="pixel-btn" href="/sign-up">
                            Get started free &rarr;
                        </a>
                    </article>

                    <article className="pixel-card price-card">
                        <h3>Supporter</h3>
                        <div className="price-amt">Optional</div>
                        <p>
                            For people and teams who want their cloud history kept past the free 15-day window &mdash; and who
                            want to back ongoing open-source development. It adds extended data retention to your account and
                            nothing else changes. Pricing is shown at checkout.
                        </p>
                        <ul>
                            <li>Everything in Free</li>
                            <li>Extended cloud run retention beyond 15 days</li>
                            <li>Directly supports ongoing development of the project</li>
                        </ul>
                        <a className="pixel-btn ghost" href="/sign-up">
                            Keep my data &rarr;
                        </a>
                    </article>
                </div>

                <div className="faq-list">
                    <div className="faq-item">
                        <h3>Is it really free?</h3>
                        <p>
                            Yes. The CLI, the local dashboard, and a cloud account cost nothing, and there&rsquo;s no credit
                            card required to install or sign up. Free isn&rsquo;t a trial that expires &mdash; it&rsquo;s the
                            product.
                        </p>
                    </div>
                    <div className="faq-item">
                        <h3>Do I need an API key?</h3>
                        <p>
                            No. BrowserBash runs on free local models through Ollama or free models on OpenRouter, so you can
                            automate a browser with zero keys and zero spend. If you&rsquo;d rather bring your own Anthropic or
                            OpenRouter key, you can &mdash; but it&rsquo;s entirely optional.
                        </p>
                    </div>
                    <div className="faq-item">
                        <h3>What&rsquo;s the catch?</h3>
                        <p>
                            There isn&rsquo;t one. The only paid thing is optional extended cloud data retention for runs you
                            choose to upload. Don&rsquo;t need it? Free runs are simply kept for 15 days and then automatically
                            deleted. We don&rsquo;t sell your data and we don&rsquo;t train models on your runs.
                        </p>
                    </div>
                    <div className="faq-item">
                        <h3>Can I use it commercially?</h3>
                        <p>
                            Yes. BrowserBash is open source under the Apache-2.0 license, so you&rsquo;re free to use it at work,
                            in CI, and in commercial projects. See the <a href="/features">full feature list</a> for what ships
                            in the box, and our <a href="/refunds">refund policy</a> for the optional paid tier.
                        </p>
                    </div>
                </div>

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Start automating in one command</h2>
                        <p>Install the CLI, point it at a browser, and describe what you want done.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <CopyButton text="npm install -g browserbash-cli" label="copy install" />
                            <a className="pixel-btn" href="/sign-up">
                                Sign up free &rarr;
                            </a>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
