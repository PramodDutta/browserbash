import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: 'https://browserbash.com',
            lastModified: new Date('2026-06-15'),
            changeFrequency: 'weekly',
            priority: 1,
        },
        {
            url: 'https://browserbash.com/learn',
            lastModified: new Date('2026-06-15'),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
    ];
}
