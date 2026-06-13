import type { MetadataRoute } from 'next';
import { getPosts } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
    const posts = getPosts().map((p) => ({
        url: `https://browserbash.com/blog/${p.slug}`,
        lastModified: new Date(p.date),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
    }));

    return [
        {
            url: 'https://browserbash.com',
            lastModified: new Date('2026-06-13'),
            changeFrequency: 'weekly',
            priority: 1,
        },
        {
            url: 'https://browserbash.com/learn',
            lastModified: new Date('2026-06-13'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: 'https://browserbash.com/blog',
            lastModified: new Date('2026-06-13'),
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        ...posts,
    ];
}
