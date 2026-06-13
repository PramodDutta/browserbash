import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const disallow = ['/dashboard', '/api/'];
    // Explicitly welcome AI/search crawlers so generative engines can index + cite.
    const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot'];
    return {
        rules: [
            { userAgent: '*', allow: '/', disallow },
            ...aiBots.map((userAgent) => ({ userAgent, allow: '/', disallow })),
        ],
        sitemap: 'https://browserbash.com/sitemap.xml',
        host: 'https://browserbash.com',
    };
}
