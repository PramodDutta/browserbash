import type { Metadata } from 'next';
import { Bo } from '@/components/Bo';
import { Reveal } from '@/components/Reveal';
import { getPosts } from '@/lib/blog';
import '../landing.css';
import './blog.css';

export const metadata: Metadata = {
    title: 'BrowserBash Blog — natural language test automation in practice',
    description: 'Case studies and field guides for QA engineers and SDETs: markdown smoke tests, CI exit codes, secrets masking, local Ollama stacks, OpenRouter model A/B tests.',
    alternates: { canonical: '/blog' },
    openGraph: {
        title: 'BrowserBash Blog',
        description: 'Natural language browser automation in practice — case studies for QA and SDET teams.',
        url: 'https://browserbash.com/blog',
        siteName: 'BrowserBash',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash blog' }],
        type: 'website',
    },
};

export default function BlogIndex() {
    const posts = getPosts();
    return (
        <>
            <nav className="nav container">
                <a href="/" className="nav__brand">
                    <Bo size={26} interactive={false} pose="idle" />
                    <span>BrowserBash</span>
                </a>
                <div className="nav__links">
                    <a href="/learn">Learn</a>
                    <a href="/#demo">Demo</a>
                    <a href="/#features">Features</a>
                </div>
                <a className="pixel-btn ghost nav__gh" href="https://github.com/PramodDutta/browserbash" target="_blank" rel="noopener noreferrer">
                    GitHub ↗
                </a>
            </nav>

            <main>
            <header className="blog-hero container">
                <p className="section-tag">blog</p>
                <h1>Field notes from the browser-bashing trenches</h1>
                <p className="blog-hero__sub">
                    Case studies and playbooks for QA engineers and SDETs — every command runnable, every tradeoff stated honestly.
                </p>
            </header>

            <section className="section container blog-grid-wrap">
                <div className="blog-grid">
                    {posts.map((p, i) => (
                        <Reveal key={p.slug} delay={(i % 2) * 80}>
                            <a className="pixel-card blog-card" href={`/blog/${p.slug}`}>
                                <div className="blog-card__meta">
                                    <span className={`blog-card__cat blog-card__cat--${p.category}`}>{p.category}</span>
                                    <time dateTime={p.date}>{p.date}</time>
                                </div>
                                <h2>{p.title}</h2>
                                <p>{p.description}</p>
                                <span className="blog-card__more">read →</span>
                            </a>
                        </Reveal>
                    ))}
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
                        <a href="/">Home</a>
                        <a href="/learn">Learn</a>
                        <a href="https://github.com/PramodDutta/browserbash" target="_blank" rel="noopener noreferrer">GitHub</a>
                    </div>
                    <p className="footer__credit">Built by The Testing Academy</p>
                </div>
            </footer>
        </>
    );
}
