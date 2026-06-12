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
            images: [{ url: '/og.png', width: 1200, height: 630, alt: post.title }],
            type: 'article',
            publishedTime: post.date,
        },
    };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = getPost(slug);
    if (!post) notFound();

    const html = await marked.parse(post.content);
    const faqs = extractFaqs(post.content);
    const related = getPosts().filter((p) => p.slug !== post.slug && p.category === post.category).slice(0, 3);

    const articleLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        author: { '@type': 'Organization', name: 'The Testing Academy' },
        publisher: { '@type': 'Organization', name: 'The Testing Academy' },
        mainEntityOfPage: `https://browserbash.com/blog/${post.slug}`,
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
                <header className="post__head">
                    <div className="blog-card__meta">
                        <span className={`blog-card__cat blog-card__cat--${post.category}`}>{post.category}</span>
                        <time dateTime={post.date}>{post.date}</time>
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
