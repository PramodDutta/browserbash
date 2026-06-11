import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            // Everyone welcome, including AI crawlers (GPTBot, ClaudeBot, PerplexityBot).
            { userAgent: '*', allow: '/', disallow: ['/dashboard', '/api/'] },
        ],
        sitemap: 'https://browserbash.com/sitemap.xml',
    };
}
