import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BlogPost {
    slug: string;
    title: string;
    description: string;
    date: string;
    category: string;
    content: string; // markdown body
}

export interface Faq {
    question: string;
    answer: string;
}

const BLOG_DIR = join(process.cwd(), 'content', 'blog');

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m) return { meta: {}, body: raw };
    const meta: Record<string, string> = {};
    for (const line of m[1].split('\n')) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        const key = line.slice(0, i).trim();
        let value = line.slice(i + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        meta[key] = value;
    }
    return { meta, body: raw.slice(m[0].length) };
}

export function getPosts(): BlogPost[] {
    const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
    const posts = files.map((f) => {
        const { meta, body } = parseFrontmatter(readFileSync(join(BLOG_DIR, f), 'utf8'));
        return {
            slug: f.replace(/\.md$/, ''),
            title: meta.title ?? f,
            description: meta.description ?? '',
            date: meta.date ?? '2026-06-12',
            category: meta.category ?? 'general',
            content: body,
        };
    });
    return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));
}

export function getPost(slug: string): BlogPost | undefined {
    return getPosts().find((p) => p.slug === slug);
}

/** Pulls H3 question / answer pairs out of the trailing "## FAQ" section for FAQPage JSON-LD. */
export function extractFaqs(markdown: string): Faq[] {
    const faqIdx = markdown.search(/^## FAQ\s*$/m);
    if (faqIdx < 0) return [];
    const section = markdown.slice(faqIdx);
    const parts = section.split(/^### /m).slice(1);
    return parts.map((part) => {
        const nl = part.indexOf('\n');
        return {
            question: part.slice(0, nl).trim(),
            answer: part.slice(nl + 1).replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim(),
        };
    }).filter((f) => f.question && f.answer);
}
