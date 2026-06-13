import type { Metadata } from 'next';
import { Bricolage_Grotesque, Silkscreen, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const body = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const pixel = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-pixel', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
    metadataBase: new URL('https://browserbash.com'),
    title: 'BrowserBash — free, open-source plain-English browser automation CLI',
    description:
        'Free, open-source CLI that turns plain English into real browser automation. Runs on free local (Ollama) or free OpenRouter models — no API keys, no credit card. Local Chrome, LambdaTest, BrowserStack, Browserbase or any CDP endpoint.',
    alternates: { canonical: '/' },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
    const page = (
        <html lang="en" className={`${body.variable} ${pixel.variable} ${mono.variable}`}>
            <body>
                <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
                {children}
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
