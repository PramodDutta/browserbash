import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: 'https://browserbash.com',
            lastModified: new Date('2026-06-15'),
            changeFrequency: 'weekly',
            priority: 1,
        },
    ];
}
