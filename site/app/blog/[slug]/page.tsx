import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { Bo } from '@/components/Bo';
import { getPost, getPosts, extractFaqs } from '@/lib/blog';
import '../../landing.css';
import '../blog.css';

export function generateStaticParams() {
    return getPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const post = getPost(slug);
    if (!post) return {};
    return {
        title: `${post.title} — BrowserBash Blog`,
        description: post.description,
        alternates: { canonical: `/blog/${post.slug}` },
        openGraph: {
            title: post.title,
            description: post.description,
            url: `https://browserbash.com/blog/${post.slug}`,
            siteName: 'BrowserBash',
            type: 'article',
            publishedTime: post.date,
            authors: ['Pramod Dutta'],
        },
    };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = getPost(slug);
    if (!post) notFound();

    const html = await marked.parse(post.content);
    const faqs = extractFaqs(post.content);
    const minutes = Math.max(1, Math.round(post.content.split(/\s+/).filter(Boolean).length / 220));

    // Related: prefer same category, then fill with most-recent others so every post links out.
    // Related: same-category first, then the pillar guides, then anything — 6 links
    // so no article is an internal dead-end (helps crawl depth + link equity).
    const PILLARS = ['natural-language-browser-automation', 'ai-browser-testing-cli', 'free-ai-browser-automation'];
    const others = getPosts().filter((p) => p.slug !== post.slug);
    const sameCat = others.filter((p) => p.category === post.category);
    const pillars = others.filter((p) => PILLARS.includes(p.slug));
    const seen = new Set<string>();
    const related = [...sameCat, ...pillars, ...others]
        .filter((p) => !seen.has(p.slug) && (seen.add(p.slug), true))
        .slice(0, 6);

    const articleLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        articleSection: post.category,
        wordCount: post.content.split(/\s+/).filter(Boolean).length,
        author: { '@type': 'Person', name: 'Pramod Dutta', url: 'https://thetestingacademy.com' },
        publisher: { '@type': 'Organization', name: 'The Testing Academy', '@id': 'https://browserbash.com/#org' },
        image: `https://browserbash.com/blog/${post.slug}/opengraph-image`,
        mainEntityOfPage: `https://browserbash.com/blog/${post.slug}`,
    };
    const breadcrumbLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://browserbash.com' },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://browserbash.com/blog' },
            { '@type': 'ListItem', position: 3, name: post.title, item: `https://browserbash.com/blog/${post.slug}` },
        ],
    };
    const faqLd = faqs.length > 0 ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
    } : null;

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
            {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

            <nav className="nav container">
                <a href="/" className="nav__brand">
                    <Bo size={26} interactive={false} pose="idle" />
                    <span>BrowserBash</span>
                </a>
                <div className="nav__links">
                    <a href="/blog">Blog</a>
                    <a href="/learn">Learn</a>
                    <a href="/#demo">Demo</a>
                </div>
                <a className="pixel-btn ghost nav__gh" href="https://github.com/PramodDutta/browserbash" target="_blank" rel="noopener noreferrer">
                    GitHub ↗
                </a>
            </nav>

            <main className="container post">
                <nav className="post__crumbs" aria-label="Breadcrumb">
                    <a href="/">Home</a> <span>›</span> <a href="/blog">Blog</a> <span>›</span>{' '}
                    <span className="post__crumbs-current">{post.title}</span>
                </nav>
                <header className="post__head">
                    <div className="blog-card__meta">
                        <span className={`blog-card__cat blog-card__cat--${post.category}`}>{post.category}</span>
                        <time dateTime={post.date}>{post.date}</time>
                        <span>· {minutes} min read</span>
                        <span>· by Pramod Dutta</span>
                    </div>
                    <h1>{post.title}</h1>
                    <p className="post__desc">{post.description}</p>
                </header>
                <article className="post__body" dangerouslySetInnerHTML={{ __html: html }} />

                {related.length > 0 && (
                    <aside className="post__related">
                        <p className="section-tag">related</p>
                        <ul>
                            {related.map((r) => (
                                <li key={r.slug}><a href={`/blog/${r.slug}`}>{r.title}</a></li>
                            ))}
                        </ul>
                    </aside>
                )}

                <div className="post__cta pixel-card">
                    <Bo size={48} interactive={false} />
                    <div>
                        <strong>Try it on your own app</strong>
                        <code>npm install -g browserbash-cli</code>
                    </div>
                    <a className="pixel-btn" href="/learn">Start learning</a>
                </div>
            </main>

            <footer className="footer">
                <div className="container footer__in">
                    <div className="footer__brand">
                        <Bo size={32} interactive={false} />
                        <span>BrowserBash</span>
                    </div>
                    <div className="footer__links">
                        <a href="/">Home</a>
                        <a href="/blog">Blog</a>
                        <a href="/learn">Learn</a>
                    </div>
                    <p className="footer__credit">Built by The Testing Academy</p>
                </div>
            </footer>
        </>
    );
}
