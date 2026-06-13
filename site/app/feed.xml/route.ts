import { getPosts } from '@/lib/blog';

const SITE = 'https://browserbash.com';

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** RSS 2.0 feed of all blog posts — a discovery/syndication surface for readers
 * and AI aggregators. Linked from the layout (<link rel=alternate>) and llms.txt. */
export function GET(): Response {
    const posts = getPosts();
    const items = posts
        .map((p) => {
            const url = `${SITE}/blog/${p.slug}`;
            return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <category>${esc(p.category)}</category>
      <description>${esc(p.description)}</description>
    </item>`;
        })
        .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BrowserBash Blog</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Guides, comparisons and use-cases for free, open-source natural-language browser automation.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
