import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'About — BrowserBash',
    description:
        'Why we built BrowserBash: free, open-source natural-language browser automation by The Testing Academy. Built by testers, for testers — no API keys, no credit card, local-first.',
    alternates: { canonical: '/about' },
    openGraph: {
        title: 'About — BrowserBash',
        description: 'Free, open-source, natural-language browser automation built by testers, for testers.',
        url: 'https://browserbash.com/about',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function AboutPage() {
    return (
        <>
            <SiteNav />
            <main>
                <section className="mkt-hero">
                    <p className="section-tag">our story</p>
                    <h1>Browser tests should be <span className="hero__accent">this simple</span></h1>
                    <p>
                        BrowserBash turns a plain-English objective into real browser actions — no selectors, no code, no
                        flaky locators. It&rsquo;s free, open-source, and runs on models you already have. Here&rsquo;s why
                        we built it.
                    </p>
                </section>

                <article className="doc">
                    <div className="doc__body">
                        <p>
                            If you&rsquo;ve ever written an end-to-end test, you know the feeling. The flow works perfectly
                            by hand, but the moment you try to automate it you&rsquo;re three layers deep in CSS selectors,
                            XPath, and explicit waits — and a week later a designer renames a class and the whole suite goes
                            red. QA engineers and SDETs spend an enormous share of their lives not testing software, but
                            babysitting brittle locators and chasing flaky failures that have nothing to do with the product.
                        </p>
                        <p>
                            Modern AI changed what&rsquo;s possible. An agent can now look at a page the way a person does,
                            reason about it, and drive the browser straight from a sentence like &ldquo;log in, add the blue
                            running shoes to the cart, and check the total is correct.&rdquo; No selectors to maintain. When
                            the page changes, the agent adapts the way a human tester would. That capability shouldn&rsquo;t
                            be a luxury — and it absolutely shouldn&rsquo;t be locked behind API keys, credit cards, and
                            per-token bills that scare teams away before they&rsquo;ve run a single test. So we built
                            BrowserBash to be free and open, and to run with <strong>zero</strong> keys out of the box.
                        </p>

                        <h2>Who&rsquo;s behind it</h2>
                        <p>
                            BrowserBash is made by <strong>The Testing Academy</strong> — a QA and test-automation education
                            community founded by <strong>Pramod Dutta</strong>. For years The Testing Academy has taught
                            testers how to automate the right way: Selenium, Playwright, API testing, CI pipelines, the whole
                            craft. BrowserBash grew directly out of that teaching. We kept watching capable testers lose days
                            to selector churn and environment setup, and we wanted to put something genuinely better in their
                            hands. So we built BrowserBash for the exact people we teach — and released it as free,
                            open-source software under the <strong>Apache-2.0</strong> license so anyone can read it, trust
                            it, and build on it.
                        </p>

                        <h2>What makes it different</h2>
                        <ul>
                            <li>
                                <strong>Free forever, open source.</strong> The CLI is Apache-2.0 licensed. Install it with{' '}
                                <code>npm install -g browserbash-cli</code> and you&rsquo;re running — no trial, no paywall on
                                the core tool.
                            </li>
                            <li>
                                <strong>No keys, no credit card.</strong> BrowserBash runs on free local models through Ollama,
                                or free models via OpenRouter — with zero API keys required. Already have an Anthropic or
                                OpenRouter key? Bring it. You&rsquo;re never forced to.
                            </li>
                            <li>
                                <strong>Built by testers, for testers.</strong> Plain-English objectives, Markdown{' '}
                                <code>*_test.md</code> test files with <code>@import</code> composition, variable templating
                                with secret masking, an NDJSON agent mode, and clean CI exit codes — the things real test
                                suites actually need.
                            </li>
                            <li>
                                <strong>Works with the tools you already use.</strong> Drive a real local Chrome, any CDP
                                endpoint, or cloud grids like LambdaTest, BrowserStack, and Browserbase. Record runs with{' '}
                                <code>--record</code>, and review them in a free local dashboard or an optional cloud one.
                            </li>
                        </ul>

                        <h2>Our principles</h2>
                        <p>A few beliefs shape every decision we make:</p>
                        <ul>
                            <li>
                                <strong>Local-first and private.</strong> By default the CLI runs entirely on your machine.
                                Your objectives, the pages it visits, your recordings, and your credentials stay with you.
                                Nothing reaches our servers unless you choose to sign in and upload a run.
                            </li>
                            <li>
                                <strong>Free and open.</strong> The tool that does the work is open source and costs nothing.
                                We don&rsquo;t sell your data and we don&rsquo;t train models on your runs. If we ever charge,
                                it&rsquo;s for an optional convenience like longer cloud retention — never for the ability to
                                test your own software.
                            </li>
                            <li>
                                <strong>Meet testers where they are.</strong> No new ecosystem to adopt. BrowserBash plugs
                                into the browsers, grids, and CI pipelines teams already run, so adopting it is a small step,
                                not a migration.
                            </li>
                        </ul>

                        <p>
                            We&rsquo;re building BrowserBash in the open and shipping fast — the CLI is currently at{' '}
                            <strong>v1.3.1</strong>. If it saves you from one more afternoon lost to a flaky locator,
                            it&rsquo;s doing its job. Got feedback, found a bug, or want to contribute? Reach us anytime at{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>.
                        </p>
                    </div>
                </article>

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Try it in under a minute</h2>
                        <p>Free, open-source, and no API key required to start.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">Sign up free</a>
                            <a className="pixel-btn" href="/features">Explore the features</a>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
