import type { MetadataRoute } from 'next';
import { getPosts } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
    const posts = getPosts().map((p) => ({
        url: `https://browserbash.com/blog/${p.slug}`,
        lastModified: new Date(p.date),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
    }));

    const updated = new Date('2026-06-14');
    const marketing: MetadataRoute.Sitemap = [
        { url: 'https://browserbash.com/features', priority: 0.8 },
        { url: 'https://browserbash.com/pricing', priority: 0.8 },
        { url: 'https://browserbash.com/about', priority: 0.7 },
        { url: 'https://browserbash.com/faq', priority: 0.7 },
        { url: 'https://browserbash.com/changelog', priority: 0.6 },
        { url: 'https://browserbash.com/contact', priority: 0.5 },
        { url: 'https://browserbash.com/brand', priority: 0.5 },
        { url: 'https://browserbash.com/math.html', priority: 0.6 },
    ].map((p) => ({ ...p, lastModified: updated, changeFrequency: 'monthly' as const }));

    const legal: MetadataRoute.Sitemap = ['privacy', 'terms', 'cookies', 'security', 'refunds'].map((slug) => ({
        url: `https://browserbash.com/${slug}`,
        lastModified: updated,
        changeFrequency: 'yearly' as const,
        priority: 0.3,
    }));

    return [
        {
            url: 'https://browserbash.com',
            lastModified: updated,
            changeFrequency: 'weekly',
            priority: 1,
        },
        {
            url: 'https://browserbash.com/learn',
            lastModified: updated,
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: 'https://browserbash.com/blog',
            lastModified: updated,
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        ...marketing,
        ...legal,
        ...posts,
    ];
}
