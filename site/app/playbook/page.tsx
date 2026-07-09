import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { TUTORIAL } from '@/lib/learn-data';
import { CourseCTA } from '@/components/CourseCTA';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'The AI Testing Playbook — BrowserBash',
    description:
        'A free, one-page reference for AI browser testing: install, first run, LLM backends, agent mode, Markdown tests, variables, CI, recording, and caching — everything to go from zero to a real test suite.',
    alternates: { canonical: '/playbook' },
    openGraph: {
        title: 'The AI Testing Playbook — BrowserBash',
        description: 'Free one-page reference: plain-English browser testing, from install to CI.',
        url: 'https://browserbash.com/playbook',
        siteName: 'BrowserBash',
        type: 'article',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'The AI Testing Playbook' }],
    },
};

export default function PlaybookPage() {
    return (
        <>
            <SiteNav />
            <main>
                <section className="mkt-hero">
                    <p className="section-tag">free playbook</p>
                    <h1>
                        The <span className="hero__accent">AI Testing Playbook</span>
                    </h1>
                    <p>
                        Every core BrowserBash pattern on one page: install, first run, LLM backends, agent mode,
                        Markdown tests, variables, CI, recording, caching. Save it, print it, or keep this tab open —
                        no signup, no gate, just genuinely useful reference.
                    </p>
                </section>

                <article className="playbook">
                    {TUTORIAL.map((section, i) => (
                        <section key={section.id} className="playbook__section pixel-card">
                            <h2>
                                <span className="playbook__n">{i + 1}</span>
                                {section.title}
                            </h2>
                            <p>{section.body}</p>
                            {section.code ? (
                                <pre className="playbook__code">
                                    <code>{section.code}</code>
                                </pre>
                            ) : null}
                        </section>
                    ))}
                </article>

                <CourseCTA variant="band" source="playbook" />

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Try it yourself</h2>
                        <p>Install the CLI and run your first test in the next 60 seconds — free, no API keys.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/learn">Full guided tutorial</a>
                            <a className="pixel-btn" href="/sign-up">Sign up free</a>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
