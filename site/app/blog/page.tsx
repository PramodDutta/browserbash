import type { Metadata } from 'next';
import { Bo } from '@/components/Bo';
import { Reveal } from '@/components/Reveal';
import { getPosts, type BlogPost } from '@/lib/blog';
import '../landing.css';
import './blog.css';

export const metadata: Metadata = {
    title: 'Natural Language Browser Automation Blog — BrowserBash',
    description: 'Guides, comparisons and use-cases for natural-language browser automation and AI browser testing: BrowserBash vs Selenium, Playwright, Cypress, Kane CLI, browse.sh, and more.',
    alternates: { canonical: '/blog' },
    openGraph: {
        title: 'BrowserBash Blog — natural language browser automation',
        description: 'Comparisons, guides and use-cases for free, open-source AI browser automation and testing.',
        url: 'https://browserbash.com/blog',
        siteName: 'BrowserBash',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash blog' }],
        type: 'website',
    },
};

// Display order + human labels for category sections; anything else falls into "More".
const CATEGORY_ORDER: Array<{ key: string; label: string }> = [
    { key: 'comparison', label: 'Comparisons' },
    { key: 'alternatives', label: 'Alternatives' },
    { key: 'guide', label: 'Guides & tutorials' },
    { key: 'use-case', label: 'Use cases' },
    { key: 'agents', label: 'AI agents' },
    { key: 'ci', label: 'CI/CD' },
    { key: 'llm', label: 'LLMs & models' },
    { key: 'testing', label: 'Testing' },
    { key: 'security', label: 'Security' },
];

function groupByCategory(posts: BlogPost[]): Array<{ label: string; key: string; posts: BlogPost[] }> {
    const seen = new Set<string>();
    const sections: Array<{ label: string; key: string; posts: BlogPost[] }> = [];
    for (const { key, label } of CATEGORY_ORDER) {
        const inCat = posts.filter((p) => p.category === key);
        if (inCat.length) {
            sections.push({ key, label, posts: inCat });
            seen.add(key);
        }
    }
    const rest = posts.filter((p) => !seen.has(p.category));
    if (rest.length) sections.push({ key: 'more', label: 'More', posts: rest });
    return sections;
}

function Card({ p }: { p: BlogPost }) {
    return (
        <a className="pixel-card blog-card" href={`/blog/${p.slug}`}>
            <div className="blog-card__meta">
                <span className={`blog-card__cat blog-card__cat--${p.category}`}>{p.category}</span>
                <time dateTime={p.date}>{p.date}</time>
            </div>
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            <span className="blog-card__more">read →</span>
        </a>
    );
}

export default function BlogIndex() {
    const posts = getPosts();
    const sections = groupByCategory(posts);

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
                <div className="nav__auth">
                    <a className="pixel-btn ghost nav__login" href="/sign-in">Log in</a>
                    <a className="pixel-btn nav__signup" href="/sign-up">Sign up free</a>
                </div>
            </nav>

            <main>
            <header className="blog-hero container">
                <p className="section-tag">blog · {posts.length} articles</p>
                <h1>Natural language browser automation, in practice</h1>
                <p className="blog-hero__sub">
                    Guides, honest comparisons and real use-cases for <strong>free, open-source AI browser
                    automation and testing</strong> with BrowserBash. Every command is runnable — install the
                    CLI with <code>npm i -g browserbash-cli</code> and try it as you read. New to it?{' '}
                    <a href="/learn">Start with the tutorial →</a>
                </p>
            </header>

            <section className="section container blog-grid-wrap">
                {sections.map((sec) => (
                    <div className="blog-section" key={sec.key} id={sec.key}>
                        <h2 className="blog-section__title">{sec.label} <span>({sec.posts.length})</span></h2>
                        <div className="blog-grid">
                            {sec.posts.map((p, i) => (
                                <Reveal key={p.slug} delay={(i % 2) * 60}>
                                    <Card p={p} />
                                </Reveal>
                            ))}
                        </div>
                    </div>
                ))}
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
                        <a href="/sign-up">Sign up</a>
                        <a href="https://github.com/PramodDutta/browserbash" target="_blank" rel="noopener noreferrer">GitHub</a>
                    </div>
                    <p className="footer__credit">Built by The Testing Academy</p>
                </div>
            </footer>
        </>
    );
}
