import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Contact — BrowserBash',
    description:
        'Get in touch with the BrowserBash team at The Testing Academy. Email support, report a bug or request a feature on GitHub, find tutorials, or report a security issue.',
    alternates: { canonical: '/contact' },
    openGraph: {
        title: 'Contact — BrowserBash',
        description: 'Questions, feedback, bugs, or security reports — here is how to reach the BrowserBash team.',
        url: 'https://browserbash.com/contact',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function ContactPage() {
    return (
        <>
            <SiteNav />
            <main>
                <section className="mkt-hero">
                    <p className="section-tag">contact</p>
                    <h1>Get in touch</h1>
                    <p>
                        Questions about BrowserBash, stuck on a run, or have an idea to make it better? We&rsquo;d
                        genuinely love to hear from you. Pick the channel below that fits, and we&rsquo;ll take it from
                        there.
                    </p>
                </section>

                <div className="contact-grid">
                    <div className="pixel-card contact-card">
                        <h3>Email support</h3>
                        <p>
                            General questions, account help, billing, or anything that doesn&rsquo;t fit a box below.
                            Email us directly and we&rsquo;ll get back to you.
                        </p>
                        <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>
                    </div>

                    <div className="pixel-card contact-card">
                        <h3>Report a bug or request a feature</h3>
                        <p>
                            Found something broken, or want a capability the CLI doesn&rsquo;t have yet? The fastest path
                            is to open an issue on GitHub — it&rsquo;s public, searchable, and we triage there.
                        </p>
                        <a
                            href="https://github.com/PramodDutta/browserbash"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open an issue on GitHub
                        </a>
                    </div>

                    <div className="pixel-card contact-card">
                        <h3>Community &amp; tutorials</h3>
                        <p>
                            BrowserBash is built by The Testing Academy. Browse guides, courses, and walkthroughs on
                            testing and automation to get more out of the tool.
                        </p>
                        <a href="https://thetestingacademy.com" target="_blank" rel="noopener noreferrer">
                            Visit The Testing Academy
                        </a>
                    </div>

                    <div className="pixel-card contact-card">
                        <h3>Security</h3>
                        <p>
                            Think you&rsquo;ve found a vulnerability? Please don&rsquo;t open a public issue — report it
                            responsibly so we can fix it before it&rsquo;s disclosed.
                        </p>
                        <a href="/security">Report a vulnerability</a>
                    </div>

                    <div className="pixel-card contact-card">
                        <h3>Press &amp; brand</h3>
                        <p>
                            Writing about BrowserBash or need our logo and assets? Grab everything you need from the
                            brand kit, including usage guidelines.
                        </p>
                        <a href="/brand">View brand &amp; press kit</a>
                    </div>
                </div>

                <section className="mkt-hero">
                    <p>
                        We read everything that comes in. BrowserBash is a small, focused project, so a reply usually
                        lands within a few business days — bug reports and security notes get priority.
                    </p>
                </section>

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Ready to try it?</h2>
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
