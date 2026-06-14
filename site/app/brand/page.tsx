import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Brand & press kit — BrowserBash',
    description:
        'Everything you need to write about BrowserBash: ready-to-use boilerplate, fast facts, logo and mascot downloads, brand colors, usage guidelines, and press contact.',
    alternates: { canonical: '/brand' },
    openGraph: {
        title: 'Brand & press kit — BrowserBash',
        description: 'Boilerplate, fast facts, logos, mascot, colors, and usage guidelines for writing about BrowserBash.',
        url: 'https://browserbash.com/brand',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function BrandPage() {
    return (
        <>
            <SiteNav />
            <main>
                <section className="mkt-hero">
                    <p className="section-tag">brand &amp; press</p>
                    <h1>Brand &amp; press kit</h1>
                    <p>Everything you need to write about BrowserBash.</p>
                </section>

                <article className="doc">
                    <div className="doc__body">
                        <h2>About</h2>
                        <p>
                            Writing a piece, a launch post, or a review? Copy whichever boilerplate fits your word count.
                            Both are accurate and approved for press use.
                        </p>
                        <p>
                            <strong>Short (one sentence).</strong> BrowserBash is a free, open-source command-line tool
                            that turns a plain-English objective into real browser actions using an AI agent — no code,
                            no selectors, and no API keys required.
                        </p>
                        <p>
                            <strong>Long (two to three sentences).</strong> BrowserBash is a free, open-source
                            (Apache-2.0) natural-language browser automation CLI from The Testing Academy. You describe
                            what you want in plain English and an AI agent drives a real browser to do it — running on
                            free local models via Ollama or free OpenRouter models, with zero API keys and no credit
                            card. It writes Markdown test files, records sessions, returns CI-friendly exit codes, and
                            connects to an optional free cloud dashboard for run history and video replay.
                        </p>

                        <h2>Fast facts</h2>
                        <ul>
                            <li><strong>Name:</strong> BrowserBash (one word, capital B and B)</li>
                            <li><strong>Maker:</strong> The Testing Academy</li>
                            <li><strong>Founder:</strong> Pramod Dutta</li>
                            <li><strong>License:</strong> Apache-2.0 (free, open source)</li>
                            <li><strong>Category:</strong> AI browser automation / testing CLI</li>
                            <li><strong>Launched:</strong> June 2026</li>
                            <li><strong>Website:</strong> browserbash.com</li>
                        </ul>

                        <h2>Logo &amp; mascot</h2>
                        <p>
                            Our mascot is <strong>Bo</strong> — a friendly pixel-grid robot who carries a hammer and
                            cheerfully bashes browser bugs. Bo embodies what the tool does: take a messy, manual browser
                            task and hammer it into a clean, automated run. Bo renders crisp at any size and adapts to
                            light and dark themes, so feel free to show Bo alongside the wordmark.
                        </p>
                        <p>
                            Download the official assets below. Please use them as provided — see the usage guidelines
                            further down before editing anything.
                        </p>
                        <div className="brand-grid">
                            <div className="pixel-card contact-card">
                                <h3>Icon (SVG)</h3>
                                <p>Vector app icon — scales to any size without losing edges. Best for print and large displays.</p>
                                <a href="/icon.svg" download>Download icon.svg</a>
                            </div>
                            <div className="pixel-card contact-card">
                                <h3>Icon (PNG)</h3>
                                <p>Raster app icon for places that need a bitmap, such as social avatars or slide decks.</p>
                                <a href="/icon.png" download>Download icon.png</a>
                            </div>
                            <div className="pixel-card contact-card">
                                <h3>Apple touch icon</h3>
                                <p>Rounded icon used for home-screen bookmarks and Apple platforms.</p>
                                <a href="/apple-icon.png" download>Download apple-icon.png</a>
                            </div>
                            <div className="pixel-card contact-card">
                                <h3>Social card (OG image)</h3>
                                <p>1200&times;630 Open Graph image — handy as a ready-made header or link preview.</p>
                                <a href="/og.png" download>Download og.png</a>
                            </div>
                        </div>

                        <h2>Colors</h2>
                        <p>
                            BrowserBash uses a warm, high-contrast palette. Use these exact hex values when you need a
                            brand color — for example, an accent rule, a callout, or a chart.
                        </p>
                        <div className="brand-grid">
                            <div className="swatch" style={{ background: '#ff5c1a', color: '#fff' }}>Accent #ff5c1a</div>
                            <div className="swatch" style={{ background: '#d8430b', color: '#fff' }}>Accent deep #d8430b</div>
                            <div className="swatch" style={{ background: '#16130f', color: '#fff' }}>Ink #16130f</div>
                            <div className="swatch" style={{ background: '#fffdf9', color: '#16130f' }}>Paper #fffdf9</div>
                            <div className="swatch" style={{ background: '#2fbf71', color: '#fff' }}>Success #2fbf71</div>
                        </div>

                        <h2>Usage do&rsquo;s &amp; don&rsquo;ts</h2>
                        <p>A few simple rules keep the brand recognizable. Thank you for respecting them.</p>
                        <p><strong>Do</strong></p>
                        <ul>
                            <li>Write the name as one word, &ldquo;BrowserBash,&rdquo; with a capital B and B.</li>
                            <li>Keep clear space around the logo so nothing crowds it.</li>
                            <li>Use the official colors and the assets exactly as we provide them.</li>
                            <li>Place the logo on a background with enough contrast to stay legible.</li>
                        </ul>
                        <p><strong>Don&rsquo;t</strong></p>
                        <ul>
                            <li>Stretch, squash, rotate, or recolor the logo or mascot.</li>
                            <li>Add effects, outlines, or backgrounds that alter the mark.</li>
                            <li>Imply endorsement, partnership, or affiliation that doesn&rsquo;t exist.</li>
                            <li>Use the brand for anything misleading or unlawful.</li>
                        </ul>

                        <h2>Press contact</h2>
                        <p>
                            For interviews, quotes, review copies, or anything not covered here, email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> and we&rsquo;ll
                            get back to you quickly.
                        </p>
                    </div>
                </article>

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Try BrowserBash</h2>
                        <p>Install the free, open-source CLI and run your first browser objective in plain English.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">
                                Sign up free
                            </a>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
