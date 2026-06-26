import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'FAQ — BrowserBash',
    description:
        'Answers to common questions about BrowserBash: is it really free, do you need API keys, which AI models and browsers it supports, data privacy, open-source license, CI/CD, recordings, and the dashboard.',
    alternates: { canonical: '/faq' },
    openGraph: {
        title: 'FAQ — BrowserBash',
        description: 'Common questions about BrowserBash — pricing, AI models, privacy, browsers, CI/CD, recordings, and the dashboard.',
        url: 'https://browserbash.com/faq',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'Is BrowserBash really free?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. BrowserBash is free and open-source under the Apache-2.0 license. Install it with npm install -g browserbash-cli and run unlimited automations locally at no cost. There is an optional cloud dashboard with a free account, and an optional paid data-retention add-on if you want cloud runs kept longer than the free 15-day window — but the CLI itself is free forever.',
            },
        },
        {
            '@type': 'Question',
            name: 'Do I need an API key or a credit card?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. BrowserBash runs on free local models through Ollama or on free OpenRouter models with zero API keys and no credit card. If you prefer, you can optionally bring your own Anthropic or OpenRouter key for a different model — but it is never required to get started.',
            },
        },
        {
            '@type': 'Question',
            name: 'Which AI models can I use?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'You choose the model. BrowserBash works with free local models via Ollama (nothing leaves your machine), free models on OpenRouter, or — if you want — paid models from Anthropic or OpenRouter using your own key. The natural-language agent turns your plain-English objective into real browser actions regardless of which model you pick.',
            },
        },
        {
            '@type': 'Question',
            name: 'Does my data leave my machine?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'By default, no. The CLI is local-first: your objectives, the pages it visits, screenshots, recordings, variables, and credentials stay on your computer. The only outbound calls are the prompts sent directly to the AI model you choose, and those go straight to that provider — we are never in the path. Data only reaches our servers if you create a free account and explicitly link the CLI with browserbash connect or upload a run with --upload. We do not sell data and do not train models on your runs.',
            },
        },
        {
            '@type': 'Question',
            name: 'Is it open source? What license?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. BrowserBash is open source under the Apache-2.0 license, so anyone can read the code, audit exactly what the CLI does, and contribute. It is built by The Testing Academy.',
            },
        },
        {
            '@type': 'Question',
            name: 'Which browsers and cloud providers does it support?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'BrowserBash drives a real local Chrome out of the box, and can connect to any CDP (Chrome DevTools Protocol) endpoint. For cloud and cross-browser grids it also supports Browserbase, LambdaTest, and BrowserStack.',
            },
        },
        {
            '@type': 'Question',
            name: 'Do I need to know how to code?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. BrowserBash is natural-language automation — you describe your objective in plain English and the AI agent performs the browser actions. There is no code to write and no CSS or XPath selectors to maintain. When you want to save and version flows, you can write simple Markdown _test.md files, but writing real code is never required.',
            },
        },
        {
            '@type': 'Question',
            name: 'How is this different from Playwright or Selenium?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Playwright and Selenium require you to write code and brittle selectors that break when the UI changes. BrowserBash takes a plain-English objective and lets an AI agent figure out the actions on a real browser — no selectors, no code. You still get developer-grade controls: Markdown test files with @import composition, variable templating with secret masking, an NDJSON agent mode, CI exit codes, and session recording.',
            },
        },
        {
            '@type': 'Question',
            name: 'How does BrowserBash handle dynamic UIs that change between runs?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'It never stores a CSS or XPath selector in your test. You write each step as intent, like "click the submit button", and at run time the agent reads the live DOM and resolves the target against whatever is actually on the page that run. If the layout shifts between runs, there is no hardcoded path to miss. Late-loading elements are handled by Playwright built-in auto-wait (15s) instead of fixed sleeps, and multi-step flows live in committable _test.md files. The honest limit is model quality: tiny local models (8B and under) can fumble ambiguous targets on long flows, while a 70B-class local model or a hosted model handles changing UIs far more reliably.',
            },
        },
        {
            '@type': 'Question',
            name: 'Can I run it in CI/CD?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. BrowserBash is built for automation pipelines. It emits structured NDJSON in agent mode and returns standard CI exit codes (0/1/2/3) so your pipeline can pass or fail on the result. Markdown _test.md files with @import composition let you organize and reuse flows across a suite.',
            },
        },
        {
            '@type': 'Question',
            name: 'Is there a dashboard?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes — two options. The free local web dashboard runs entirely on your machine via the dashboard command. There is also an optional cloud dashboard, free with an account (sign-in via Clerk), that gives you run history, video recordings, and per-run replay. Link the CLI to the cloud with browserbash connect and upload a run with --upload.',
            },
        },
        {
            '@type': 'Question',
            name: 'How do session recordings work?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Add the --record flag to capture video and screenshots of a run. Recordings are saved locally by default. If you choose to upload a run to the cloud dashboard, the recordings are stored in Vercel Blob so you can watch the per-run replay from anywhere.',
            },
        },
        {
            '@type': 'Question',
            name: 'How long are my cloud runs kept?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Free cloud runs are retained for 15 days and then automatically deleted. If you need them kept longer, an optional paid data-retention add-on (billed via Stripe) extends retention. Runs you never upload stay only on your own machine for as long as you keep them.',
            },
        },
        {
            '@type': 'Question',
            name: 'Is it production-ready and stable?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'BrowserBash is at version 1.3.1 and is actively maintained by The Testing Academy. It ships the pieces you need for real automation work: CI exit codes, NDJSON agent output, secret masking, and session recording. Because it is open source under Apache-2.0, you can inspect the code, pin versions, and follow development directly.',
            },
        },
        {
            '@type': 'Question',
            name: 'How do I get help or report a bug?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Email thetestingacademy@gmail.com or head to our contact page. Because BrowserBash is open source, you can also browse the code and follow the project. Start with the Learn pages for guides on installing, writing test files, and running in CI.',
            },
        },
    ],
};

export default function FaqPage() {
    return (
        <>
            <SiteNav />
            <main>
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

                <section className="mkt-hero">
                    <p className="section-tag">faq</p>
                    <h1>Frequently asked questions</h1>
                    <p>
                        Everything you might want to know before you install BrowserBash &mdash; what it costs, which AI
                        models and browsers it runs, where your data goes, and how it fits into CI. Still stuck? We&rsquo;re
                        one <a href="/contact">email</a> away.
                    </p>
                </section>

                <div className="faq-list">
                    <div className="faq-item">
                        <h3>Is BrowserBash really free?</h3>
                        <p>
                            Yes. BrowserBash is free and open-source under the Apache-2.0 license. Install it with{' '}
                            <code>npm install -g browserbash-cli</code> and run unlimited automations locally at no cost.
                            There&rsquo;s an optional cloud dashboard (free with an account) and an optional paid
                            data-retention add-on if you want cloud runs kept beyond the free 15-day window &mdash; but the
                            CLI itself is free forever.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Do I need an API key or a credit card?</h3>
                        <p>
                            No. BrowserBash runs on <strong>free local models</strong> through Ollama or on{' '}
                            <strong>free OpenRouter models</strong> with zero API keys and no credit card. If you prefer,
                            you can optionally bring your own Anthropic or OpenRouter key for a different model &mdash; but
                            it&rsquo;s never required to get started.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Which AI models can I use?</h3>
                        <p>
                            You choose the model. BrowserBash works with free local models via Ollama (nothing leaves your
                            machine), free models on OpenRouter, or &mdash; if you want &mdash; paid models from Anthropic or
                            OpenRouter using your own key. The natural-language agent turns your plain-English objective into
                            real browser actions no matter which model you pick.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Does my data leave my machine?</h3>
                        <p>
                            By default, no. The CLI is <strong>local-first</strong>: your objectives, the pages it visits,
                            screenshots, recordings, variables, and credentials stay on your computer. The only outbound
                            calls are the prompts sent directly to the AI model you choose, and those go straight to that
                            provider &mdash; we&rsquo;re never in the path. Data only reaches our servers if you create a free
                            account and explicitly link the CLI (<code>browserbash connect</code>) or upload a run
                            (<code>--upload</code>). We do <strong>not</strong> sell data and do <strong>not</strong> train
                            models on your runs.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Is it open source? What license?</h3>
                        <p>
                            Yes. BrowserBash is open source under the <strong>Apache-2.0</strong> license, so anyone can read
                            the code, audit exactly what the CLI does, and contribute. It&rsquo;s built by The Testing
                            Academy.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Which browsers and cloud providers does it support?</h3>
                        <p>
                            BrowserBash drives a real local <strong>Chrome</strong> out of the box, and can connect to any{' '}
                            <strong>CDP</strong> (Chrome DevTools Protocol) endpoint. For cloud and cross-browser grids it
                            also supports <strong>Browserbase</strong>, <strong>LambdaTest</strong>, and{' '}
                            <strong>BrowserStack</strong>.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Do I need to know how to code?</h3>
                        <p>
                            No. BrowserBash is natural-language automation &mdash; you describe your objective in plain
                            English and the AI agent performs the browser actions. There&rsquo;s no code to write and no CSS
                            or XPath selectors to maintain. When you want to save and version flows, you can write simple
                            Markdown <code>_test.md</code> files, but writing real code is never required.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>How is this different from Playwright or Selenium?</h3>
                        <p>
                            Playwright and Selenium make you write code and brittle selectors that break when the UI changes.
                            BrowserBash takes a plain-English objective and lets an AI agent figure out the actions on a real
                            browser &mdash; no selectors, no code. You still get developer-grade controls: Markdown test files
                            with <code>@import</code> composition, variable templating with secret masking, an NDJSON agent
                            mode, CI exit codes, and session recording.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>How does BrowserBash handle dynamic UIs that change between runs?</h3>
                        <p>
                            It never stores a CSS or XPath selector in your test. You write each step as{' '}
                            <strong>intent</strong> (&ldquo;click the submit button&rdquo;), and at run time the agent reads
                            the <strong>live DOM</strong> and resolves the target against whatever is actually on the page
                            that run. If the layout shifts between runs, there&rsquo;s no hardcoded path to miss.
                            Late-loading elements are handled by Playwright auto-wait (15s) instead of fixed sleeps, and
                            multi-step flows live in committable <code>_test.md</code> files. The honest limit is{' '}
                            <strong>model quality</strong>: tiny local models (8B and under) can fumble ambiguous targets on
                            long flows, while a 70B-class local model or a hosted model handles changing UIs far more
                            reliably.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Can I run it in CI/CD?</h3>
                        <p>
                            Yes. BrowserBash is built for automation pipelines. It emits structured <strong>NDJSON</strong> in
                            agent mode and returns standard CI <strong>exit codes (0/1/2/3)</strong> so your pipeline can pass
                            or fail on the result. Markdown <code>_test.md</code> files with <code>@import</code> composition
                            let you organize and reuse flows across a suite.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Is there a dashboard?</h3>
                        <p>
                            Yes &mdash; two options. The <strong>free local</strong> web dashboard runs entirely on your
                            machine via the <code>dashboard</code> command. There&rsquo;s also an optional{' '}
                            <strong>cloud dashboard</strong>, free with an account (sign-in via Clerk), that adds run history,
                            video recordings, and per-run replay. Link the CLI with <code>browserbash connect</code> and push
                            a run up with <code>--upload</code>.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>How do session recordings work?</h3>
                        <p>
                            Add the <code>--record</code> flag to capture video and screenshots of a run. Recordings are saved
                            locally by default. If you choose to upload a run to the cloud dashboard, the recordings are stored
                            in Vercel Blob so you can watch the per-run replay from anywhere.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>How long are my cloud runs kept?</h3>
                        <p>
                            Free cloud runs are retained for <strong>15 days</strong> and then automatically deleted. If you
                            need them kept longer, an optional paid <strong>data-retention</strong> add-on (billed via Stripe)
                            extends retention. Runs you never upload stay only on your own machine for as long as you keep
                            them.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>Is it production-ready and stable?</h3>
                        <p>
                            BrowserBash is at version <strong>v1.3.1</strong> and is actively maintained by The Testing
                            Academy. It ships the pieces you need for real automation work: CI exit codes, NDJSON agent
                            output, secret masking, and session recording. Because it&rsquo;s open source under Apache-2.0,
                            you can inspect the code, pin versions, and follow development directly.
                        </p>
                    </div>

                    <div className="faq-item">
                        <h3>How do I get help or report a bug?</h3>
                        <p>
                            Email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> or visit our{' '}
                            <a href="/contact">contact page</a>. Because BrowserBash is open source, you can also browse the
                            code and follow the project. New here? Start with the <a href="/learn">Learn</a> pages for guides
                            on installing, writing test files, and running in CI.
                        </p>
                    </div>
                </div>

                <div className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Try it in two minutes</h2>
                        <p>Free, open-source, no API key, no credit card. Install and describe your first objective.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">Sign up free</a>
                            <a className="pixel-btn" href="/learn">Read the guides</a>
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
