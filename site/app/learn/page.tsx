import type { Metadata } from 'next';
import { Bo } from '@/components/Bo';
import { CopyButton } from '@/components/CopyButton';
import { Challenges } from '@/components/Challenges';
import { Reveal } from '@/components/Reveal';
import { TUTORIAL, SCENARIOS } from '@/lib/learn-data';
import '../landing.css';
import './learn.css';

export const metadata: Metadata = {
    title: 'Learn BrowserBash — getting started + 14 practice scenarios',
    description:
        'Install BrowserBash, run your first plain-English browser test, wire up Ollama / Anthropic / OpenRouter, run on LambdaTest or BrowserStack with cloud video recordings, and practice on 14 real-site scenarios.',
    alternates: { canonical: '/learn' },
    openGraph: {
        title: 'Learn BrowserBash — tutorial + 14 practice scenarios',
        description: 'Guided tour of the natural language browser automation CLI, plus 14 hands-on challenges against real sites and cloud grids.',
        url: 'https://browserbash.com/learn',
        siteName: 'BrowserBash',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Learn BrowserBash' }],
        type: 'article',
    },
};

export default function LearnPage() {
    return (
        <>
            <nav className="nav container">
                <a href="/" className="nav__brand">
                    <Bo size={26} interactive={false} pose="idle" />
                    <span>BrowserBash</span>
                </a>
                <div className="nav__links">
                    <a href="#start">Get started</a>
                    <a href="#challenges">Challenges</a>
                    <a href="/blog">Blog</a>
                    <a href="/#demo">Demo</a>
                </div>
                <a className="pixel-btn ghost nav__gh" href="https://github.com/PramodDutta/browserbash" target="_blank" rel="noopener noreferrer">
                    GitHub ↗
                </a>
            </nav>

            <main>
            <header className="learn-hero container">
                <Bo size={84} />
                <div>
                    <p className="section-tag">learn</p>
                    <h1>From zero to bashing browsers</h1>
                    <p className="learn-hero__sub">
                        A ten-minute tour of the CLI, then {SCENARIOS.length} hands-on scenarios against real
                        public sites — beginner to advanced. Every command is copy-paste runnable.
                    </p>
                </div>
            </header>

            <section className="section container" id="start">
                <Reveal>
                    <p className="section-tag">get started</p>
                    <h2>The guided tour</h2>
                </Reveal>
                <div className="tut">
                    {TUTORIAL.map((t, i) => (
                        <Reveal key={t.id} delay={(i % 2) * 80}>
                            <article className="pixel-card tut__step" id={t.id}>
                                <header>
                                    <span className="tut__num">{i + 1}</span>
                                    <h3>{t.title}</h3>
                                </header>
                                <p>{t.body}</p>
                                <div className="tut__code">
                                    <pre>{t.code}</pre>
                                    <CopyButton text={t.code} />
                                </div>
                            </article>
                        </Reveal>
                    ))}
                </div>
            </section>

            <section className="section container" id="challenges">
                <Reveal>
                    <p className="section-tag">practice</p>
                    <h2>{SCENARIOS.length} scenarios, real sites, real verdicts</h2>
                    <p className="section__sub">
                        Each card is a complete exercise: an objective, the exact command, hints if you&apos;re stuck,
                        and what a passing run looks like. The exit code is your scoreboard — <code>0</code> means Bo approves.
                    </p>
                </Reveal>
                <Challenges scenarios={SCENARIOS} />
            </section>

            </main>

            <footer className="footer">
                <div className="container footer__in">
                    <div className="footer__brand">
                        <Bo size={32} interactive={false} />
                        <span>BrowserBash</span>
                    </div>
                    <div className="footer__links">
                        <a href="/">Home</a>
                        <a href="https://github.com/PramodDutta/browserbash" target="_blank" rel="noopener noreferrer">GitHub</a>
                        <a href="https://www.npmjs.com/package/browserbash-cli" target="_blank" rel="noopener noreferrer">npm</a>
                    </div>
                    <p className="footer__credit">Built by The Testing Academy</p>
                </div>
            </footer>
        </>
    );
}
