import type { Metadata } from 'next';
import { Bricolage_Grotesque, Silkscreen, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { GoogleAnalytics } from '@next/third-parties/google';
import { Analytics } from '@/components/Analytics';
import './globals.css';

// Only the body font (LCP text) is preloaded; the pixel + mono faces are used
// below/beside the fold, so skip their preload to free first-paint bandwidth.
const body = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const pixel = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-pixel', display: 'swap', preload: false });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', preload: false });

export const metadata: Metadata = {
    metadataBase: new URL('https://browserbash.com'),
    title: 'BrowserBash — free, open-source plain-English browser automation CLI',
    description:
        'Free, open-source CLI that turns plain English into real browser automation. Runs on free local (Ollama) or free OpenRouter models — no API keys, no credit card. Local Chrome, LambdaTest, BrowserStack, Browserbase or any CDP endpoint.',
    alternates: { canonical: '/', types: { 'application/rss+xml': '/feed.xml' } },
    openGraph: {
        title: 'BrowserBash — natural language browser automation CLI',
        description: 'Plain English in. Real browser out. Free, open-source AI browser testing CLI — no API keys needed to run, no credit card.',
        url: 'https://browserbash.com',
        siteName: 'BrowserBash',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash — plain English in, real browser out' }],
        type: 'website',
    },
    twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BrowserBash',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    softwareVersion: '1.3.1',
    datePublished: '2026-06-12',
    description: 'Free, open-source natural language browser automation CLI. An AI agent drives a real browser from a plain-English objective — Ollama-first and free OpenRouter models, no API keys needed to run.',
    url: 'https://browserbash.com',
    downloadUrl: 'https://www.npmjs.com/package/browserbash-cli',
    installUrl: 'https://www.npmjs.com/package/browserbash-cli',
    featureList: [
        'Plain-English objectives drive a real Chrome browser',
        'Markdown *_test.md test files with @import composition',
        'NDJSON agent mode with CI exit codes 0/1/2/3',
        'Local Chrome, CDP, Browserbase, LambdaTest, BrowserStack providers',
        'Ollama-first local LLMs, Anthropic and OpenRouter support',
        'Variable templating with secret masking',
        'Free local web dashboard of your runs and recordings',
        'Optional cloud dashboard with per-run video, trace and screenshot',
    ],
    author: { '@type': 'Organization', name: 'The Testing Academy', url: 'https://thetestingacademy.com' },
    publisher: { '@type': 'Organization', name: 'The Testing Academy' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    sameAs: ['https://github.com/PramodDutta/browserbash', 'https://www.npmjs.com/package/browserbash-cli'],
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
};

// Site-wide brand graph: Organization + WebSite so search + AI engines can
// anchor the brand entity (logo, sameAs, publisher) on every page.
const orgLd = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'Organization',
            '@id': 'https://browserbash.com/#org',
            name: 'BrowserBash',
            url: 'https://browserbash.com',
            logo: 'https://browserbash.com/icon.png',
            description: 'Free, open-source natural language browser automation CLI by The Testing Academy.',
            founder: { '@id': 'https://browserbash.com/#pramod' },
            sameAs: [
                'https://github.com/PramodDutta/browserbash',
                'https://www.npmjs.com/package/browserbash-cli',
                'https://thetestingacademy.com',
            ],
        },
        {
            // Author/expert entity — bound to every article (BlogPosting.author)
            // and the Organization founder via @id, so AI engines can resolve a
            // verifiable human expert behind the content (E-E-A-T / GEO).
            '@type': 'Person',
            '@id': 'https://browserbash.com/#pramod',
            name: 'Pramod Dutta',
            url: 'https://thetestingacademy.com',
            jobTitle: 'Software Development Engineer in Test (SDET)',
            description:
                'SDET and test-automation engineer with 10+ years of experience. Founder of The Testing Academy and creator of BrowserBash.',
            worksFor: { '@id': 'https://browserbash.com/#org' },
            knowsAbout: [
                'Browser automation',
                'Test automation',
                'SDET',
                'Playwright',
                'Selenium',
                'AI agents',
                'CI/CD',
            ],
            sameAs: ['https://github.com/PramodDutta', 'https://thetestingacademy.com'],
        },
        {
            '@type': 'WebSite',
            '@id': 'https://browserbash.com/#website',
            name: 'BrowserBash',
            url: 'https://browserbash.com',
            publisher: { '@id': 'https://browserbash.com/#org' },
            inLanguage: 'en',
        },
    ],
};

// Pick the A/B hero variant before paint (cookie or ?v=), with no flicker, so
// the landing can stay statically rendered + CDN-cached.
const AB_SCRIPT =
    "document.documentElement.classList.add('js');" +
    "(function(){try{var p=new URLSearchParams(location.search).get('v');" +
    "var c=document.cookie.match(/(?:^|; )bb_hero=([ab])/);" +
    "var v=(p==='a'||p==='b')?p:(c?c[1]:'a');" +
    "if(v==='b')document.documentElement.classList.add('ab-b');}catch(e){}})();";

export default function RootLayout({ children }: { children: React.ReactNode }) {
    const gaId = process.env.NEXT_PUBLIC_GA_ID;
    const page = (
        <html lang="en" className={`${body.variable} ${pixel.variable} ${mono.variable}`}>
            <body>
                <script dangerouslySetInnerHTML={{ __html: AB_SCRIPT }} />
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
                {/* aleeup chat widget (third-party). embed.js eagerly loads a ~94KB
                    chat iframe + a long-lived connection for EVERY visitor, but only
                    a few ever open chat. So: (1) never load it on the auth/dashboard
                    pages (they load Clerk and don't need sales chat), and (2) defer
                    the load until the first real user interaction (with an idle
                    fallback), so bounce visitors never pay the cost. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html:
                            "(function(){if(/^\\/(sign-in|sign-up|dashboard)(\\/|$)/.test(location.pathname))return;" +
                            "var done=false;function l(){if(done)return;done=true;" +
                            "['scroll','pointerdown','keydown','touchstart','mousemove'].forEach(function(e){window.removeEventListener(e,l)});" +
                            "var s=document.createElement('script');s.src='https://aleeup.com/embed.js';s.async=true;" +
                            "s.setAttribute('data-bot','NqLIxxNfaoPeChEFeF8nj');" +
                            "s.setAttribute('data-color','#eb0000');document.body.appendChild(s);}" +
                            "['scroll','pointerdown','keydown','touchstart','mousemove'].forEach(function(e){window.addEventListener(e,l,{once:true,passive:true})});" +
                            "var fb=function(){setTimeout(l,4000);};" +
                            "if('requestIdleCallback' in window){requestIdleCallback(fb,{timeout:3000});}else{window.addEventListener('load',fb);}})();",
                    }}
                />
                {children}
                {gaId && <Analytics />}
                {gaId && <GoogleAnalytics gaId={gaId} />}
            </body>
        </html>
    );
    // Site must keep building (and prerendering) without Clerk keys.
    return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <ClerkProvider
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/dashboard"
            signUpFallbackRedirectUrl="/dashboard"
        >
            {page}
        </ClerkProvider>
    ) : (
        page
    );
}
