import type { Metadata } from 'next';
import { Bricolage_Grotesque, Silkscreen, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const body = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const pixel = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-pixel', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
    metadataBase: new URL('https://browserbash.com'),
    title: 'BrowserBash — plain-English browser automation CLI',
    description:
        'Open-source CLI that turns plain English into real browser automation. Local Chrome, LambdaTest, BrowserStack, Browserbase or any CDP endpoint. Ollama-first — no API keys required.',
    alternates: { canonical: '/' },
    openGraph: {
        title: 'BrowserBash',
        description: 'Plain English in. Real browser out.',
        url: 'https://browserbash.com',
        siteName: 'BrowserBash',
        images: ['/og.png'],
        type: 'website',
    },
    twitter: { card: 'summary_large_image', images: ['/og.png'] },
    keywords: ['browser automation', 'AI testing', 'CLI', 'playwright', 'natural language testing', 'open source'],
};

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BrowserBash',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    description: 'Vendor-independent natural-language browser automation CLI. An AI agent drives a real browser from a plain-English objective.',
    url: 'https://browserbash.com',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    sameAs: ['https://github.com/PramodDutta/browserbash'],
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
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
}
