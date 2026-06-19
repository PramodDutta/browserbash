import type { Metadata } from 'next';
import { Bo } from '@/components/Bo';
import { Reveal } from '@/components/Reveal';
import { getPosts, type BlogPost } from '@/lib/blog';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';
import '../blog/blog.css';

export const metadata: Metadata = {
    title: 'BrowserBash Tutorials — learn natural language browser automation',
    description:
        'In-depth, hands-on BrowserBash tutorials: every command, flag, engine, provider and model explained. Run a real browser from plain English — free and open source.',
    alternates: { canonical: '/tutorials' },
    openGraph: {
        title: 'BrowserBash Tutorials — step-by-step browser automation in plain English',
        description:
            'Deep, runnable tutorials covering every BrowserBash option: run, testmd, agent mode, recording, dashboards, providers, engines and local models.',
        url: 'https://browserbash.com/tutorials',
        siteName: 'BrowserBash',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash tutorials' }],
        type: 'website',
    },
};

function Card({ p, n }: { p: BlogPost; n: number }) {
    return (
        <a className="pixel-card blog-card" href={`/blog/${p.slug}`}>
            <div className="blog-card__meta">
                <span className="blog-card__cat blog-card__cat--tutorial">tutorial {n}</span>
                <time dateTime={p.date}>{p.date}</time>
            </div>
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            <span className="blog-card__more">start →</span>
        </a>
    );
}

export default function TutorialsIndex() {
    // Tutorials are blog posts tagged `category: tutorial`. Render them in an
    // ascending learning sequence (oldest dated = first lesson) so the page
    // reads like a curriculum, not a reverse-chron feed.
    const tutorials = getPosts()
        .filter((p) => p.category === 'tutorial')
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));

    const itemListLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'BrowserBash Tutorials',
        description: 'Step-by-step tutorials for natural-language browser automation with BrowserBash.',
        itemListElement: tutorials.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `https://browserbash.com/blog/${p.slug}`,
            name: p.title,
        })),
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

            <nav className="nav container">
                <a href="/" className="nav__brand">
                    <Bo size={26} interactive={false} pose="idle" />
                    <span>BrowserBash</span>
                </a>
                <div className="nav__links">
                    <a href="/tutorials">Tutorials</a>
                    <a href="/blog">Blog</a>
                    <a href="/learn">Learn</a>
                    <a href="/#demo">Demo</a>
                </div>
                <div className="nav__auth">
                    <a className="pixel-btn ghost nav__login" href="/sign-in">Log in</a>
                    <a className="pixel-btn nav__signup" href="/sign-up">Sign up free</a>
                </div>
            </nav>

            <main>
                <header className="blog-hero container">
                    <p className="section-tag">tutorials · {tutorials.length} lessons</p>
                    <h1>Learn BrowserBash, one runnable lesson at a time</h1>
                    <p className="blog-hero__sub">
                        Hands-on, in-depth tutorials for <strong>natural-language browser automation</strong>.
                        Every flag, engine, provider and local-model option, explained with commands you can run as
                        you read. Install once with <code>npm i -g browserbash-cli</code> and follow along — no
                        account needed. Prefer prose? <a href="/blog">Browse the blog →</a>
                    </p>
                </header>

                <section className="section container blog-grid-wrap">
                    {tutorials.length === 0 ? (
                        <p className="blog-hero__sub container">Tutorials are publishing now — check back shortly.</p>
                    ) : (
                        <div className="blog-section" id="tutorial">
                            <div className="blog-grid">
                                {tutorials.map((p, i) => (
                                    <Reveal key={p.slug} delay={(i % 2) * 60}>
                                        <Card p={p} n={i + 1} />
                                    </Reveal>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </main>

            <SiteFooter />
        </>
    );
}
