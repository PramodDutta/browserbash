import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Security — BrowserBash',
    description:
        'How BrowserBash keeps you safe: local-first by design, secret masking, HTTPS everywhere, access-controlled managed infrastructure, scoped API keys, and how to responsibly report a vulnerability.',
    alternates: { canonical: '/security' },
    openGraph: {
        title: 'Security — BrowserBash',
        description:
            'Local-first by design, secret masking, HTTPS everywhere, and a clear responsible-disclosure process. Here is how we protect your data.',
        url: 'https://browserbash.com/security',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function SecurityPage() {
    return (
        <>
            <SiteNav />
            <main>
                <article className="doc">
                    <header className="doc__head">
                        <p className="section-tag">security</p>
                        <h1>Security</h1>
                        <p className="doc__lede">
                            BrowserBash is built security-first and local-first. The open-source CLI processes your pages
                            and credentials on your own machine and sends nothing to us by default. This page explains how
                            we protect your data, how the optional cloud is locked down, and how to report a vulnerability.
                        </p>
                        <p className="doc__updated">Last updated: 14 June 2026</p>
                    </header>

                    <nav className="doc__toc" aria-label="Table of contents">
                        <h2>On this page</h2>
                        <ul>
                            <li><a href="#approach">Our approach</a></li>
                            <li><a href="#secrets">Secret masking</a></li>
                            <li><a href="#transit-rest">Data in transit &amp; at rest</a></li>
                            <li><a href="#infra">Infrastructure &amp; processors</a></li>
                            <li><a href="#auth">Authentication &amp; API keys</a></li>
                            <li><a href="#least-privilege">Least privilege</a></li>
                            <li><a href="#open-source">Open source &amp; auditability</a></li>
                            <li><a href="#disclosure">Responsible disclosure</a></li>
                            <li><a href="#scope">Scope</a></li>
                            <li><a href="#deletion">Data deletion</a></li>
                            <li><a href="#contact">Contact</a></li>
                        </ul>
                    </nav>

                    <div className="doc__body">
                        <h2 id="approach">Our approach</h2>
                        <p>
                            Security is a design constraint for BrowserBash, not an afterthought. The core principle is
                            <strong> local-first</strong>: when you run the CLI, it drives a browser and reasons about your
                            pages entirely on your machine. Your objectives, the web pages it visits, screenshots,
                            recordings, variables, and any credentials are processed locally and are{' '}
                            <strong>not transmitted to us by default</strong>.
                        </p>
                        <p>
                            Data only reaches our servers if you deliberately opt in — by creating an account and linking
                            the CLI with <code>browserbash connect</code>, or uploading a single run with{' '}
                            <code>--upload</code>. Nothing is sent silently. Model calls go directly from your machine to
                            the AI provider <em>you</em> choose (a local Ollama model where nothing leaves your computer, a
                            free OpenRouter model, or a key you bring) — we are never in that path.
                        </p>

                        <h2 id="secrets">Secret masking</h2>
                        <p>
                            Credentials are sensitive, so BrowserBash treats them carefully by design. Values you pass as
                            <strong> secret variables</strong> are <strong>masked in logs, console output, and recordings</strong>{' '}
                            so they do not leak into artifacts you might share or store.
                        </p>
                        <ul>
                            <li>
                                <strong>Never hard-code credentials</strong> in your <code>*_test.md</code> files. Reference
                                them through variables instead so they can be supplied at run time.
                            </li>
                            <li>
                                <strong>Use environment variables</strong> or secret variables for passwords, tokens, and
                                API keys. Secret values are masked wherever output is produced.
                            </li>
                            <li>
                                <strong>Keep secrets out of version control.</strong> Because test files are plain Markdown,
                                it is easy to commit them — so keep real credentials in your environment, not in the file.
                            </li>
                        </ul>

                        <h2 id="transit-rest">Data in transit &amp; at rest</h2>
                        <p>
                            All traffic to <code>browserbash.com</code>, the cloud dashboard, and our APIs is served over
                            <strong> HTTPS</strong>, so data is encrypted in transit. Anything you choose to upload — run
                            metadata and video/screenshot recordings — is stored on <strong>managed, access-controlled
                            infrastructure</strong> operated by the providers below. Recordings live in Vercel Blob and
                            account and run metadata live in a managed Postgres database, each reachable only through
                            authenticated, scoped access.
                        </p>

                        <h2 id="infra">Infrastructure &amp; processors</h2>
                        <p>
                            We run the website and optional dashboard on a small set of trusted, industry-standard
                            providers. Each is access-controlled and used only for its stated purpose:
                        </p>
                        <table>
                            <thead><tr><th>Provider</th><th>Purpose</th><th>Security note</th></tr></thead>
                            <tbody>
                                <tr><td>Vercel</td><td>Website &amp; app hosting, edge delivery</td><td>HTTPS by default; access-controlled deploys</td></tr>
                                <tr><td>Clerk</td><td>Account sign-up, login, sessions</td><td>Managed authentication; we never store raw passwords</td></tr>
                                <tr><td>Neon</td><td>Managed Postgres for account &amp; run metadata</td><td>Encrypted, authenticated, scoped access</td></tr>
                                <tr><td>Vercel Blob</td><td>Storage for uploaded recordings/screenshots</td><td>Access-controlled object storage</td></tr>
                                <tr><td>Stripe</td><td>Payments for optional data retention</td><td>Stripe handles card data — <strong>we never see it</strong></td></tr>
                            </tbody>
                        </table>
                        <p>
                            Card details for the optional paid data-retention plan are entered directly with Stripe, a
                            PCI-compliant processor. We receive only a subscription status and customer reference — full
                            card numbers never touch our systems.
                        </p>

                        <h2 id="auth">Authentication &amp; API keys</h2>
                        <p>
                            Cloud accounts are handled by <strong>Clerk</strong>, which manages sign-up, login, and session
                            security so we never store raw passwords. The API keys the CLI uses to link to your account
                            (via <code>browserbash connect</code>) are designed to limit blast radius:
                        </p>
                        <ul>
                            <li><strong>Scoped</strong> — a linking key grants only the access the CLI needs to push your runs, nothing more.</li>
                            <li><strong>Expiring</strong> — keys automatically <strong>expire after 30 days</strong>, so a leaked key has a short, bounded lifetime.</li>
                            <li><strong>Rate-capped</strong> — each account has a per-account rate cap to prevent abuse and to limit the impact of a compromised key.</li>
                        </ul>

                        <h2 id="least-privilege">Least privilege &amp; data minimization</h2>
                        <p>
                            We apply <strong>least privilege</strong> and <strong>data minimization</strong> throughout. The
                            CLI sends nothing unless you ask it to, and when you do upload a run we collect only what the
                            dashboard needs to show your run history, recordings, and per-run replay. Access to managed
                            infrastructure is restricted, and each processor receives only the data required to perform its
                            specific function. We do <strong>not sell your data</strong> and we do <strong>not train AI
                            models on your runs</strong>.
                        </p>

                        <h2 id="open-source">Open source &amp; auditability</h2>
                        <p>
                            BrowserBash is open source under the Apache-2.0 licence. You do not have to take our word for
                            what the CLI does — you can read the code and verify exactly how it handles your pages,
                            credentials, and network calls. The package is published openly on npm:
                        </p>
                        <p>
                            <a href="https://www.npmjs.com/package/browserbash-cli" target="_blank" rel="noopener noreferrer">
                                npmjs.com/package/browserbash-cli
                            </a>
                            {' '}— install with <code>npm install -g browserbash-cli</code> (current version v1.3.1).
                        </p>

                        <h2 id="disclosure">Responsible disclosure</h2>
                        <p>
                            We welcome reports from security researchers and treat good-faith disclosures as a gift. If you
                            believe you have found a vulnerability, please email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> with clear{' '}
                            <strong>steps to reproduce</strong>, the affected URL or command, and any proof-of-concept that
                            helps us understand the issue.
                        </p>
                        <p>While investigating and reporting, we ask that you:</p>
                        <ul>
                            <li>Give us reasonable time to fix the issue before any <strong>public disclosure</strong>.</li>
                            <li>Do <strong>not access, modify, or exfiltrate other users&rsquo; data</strong>.</li>
                            <li>Do <strong>not run denial-of-service</strong> attacks, spam, or social-engineering against our users or staff.</li>
                            <li>Act in good faith and avoid privacy violations or service disruption.</li>
                        </ul>
                        <p>
                            In return, we will acknowledge your report, keep you updated as we work on a fix, and{' '}
                            <strong>credit good-faith researchers</strong> who report responsibly. Please note there is{' '}
                            <strong>no paid bug bounty</strong> at this time — we recognise researchers with credit rather
                            than cash.
                        </p>

                        <h2 id="scope">Scope</h2>
                        <p>The following are <strong>in scope</strong> for responsible disclosure:</p>
                        <ul>
                            <li>The BrowserBash website at <code>browserbash.com</code> and the cloud dashboard.</li>
                            <li>Our APIs used for CLI linking, run upload, and account management.</li>
                            <li>The open-source <code>browserbash-cli</code> package itself.</li>
                        </ul>
                        <p>The following are <strong>out of scope</strong>:</p>
                        <ul>
                            <li>
                                Vulnerabilities in our third-party providers (Vercel, Clerk, Neon, Vercel Blob, Stripe,
                                Google Analytics) — please report those to the provider directly.
                            </li>
                            <li>Issues in the AI model providers you configure (Ollama, OpenRouter, Anthropic), which you choose and contract with directly.</li>
                            <li>Reports requiring physical access to a user&rsquo;s machine, or attacks based on social engineering and outdated browsers.</li>
                            <li>Findings with no realistic security impact, such as missing best-practice headers without a demonstrable exploit.</li>
                        </ul>

                        <h2 id="deletion">Data deletion</h2>
                        <p>
                            You stay in control of your data. Uploaded free runs are automatically deleted after{' '}
                            <strong>15 days</strong>. To delete your account or any data you have uploaded at any time,
                            email <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> and we will
                            remove it. See our <a href="/privacy">Privacy Policy</a> for full details on retention and your
                            rights.
                        </p>

                        <h2 id="contact">Contact</h2>
                        <p>
                            Security questions, vulnerability reports, or deletion requests? Email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>. See also our{' '}
                            <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.
                        </p>
                    </div>
                </article>

                <section className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Local-first, by default</h2>
                        <p>Run real browser automation on your own machine. Free, open-source, zero API keys.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">Sign up free</a>
                            <a
                                className="pixel-btn"
                                href="https://www.npmjs.com/package/browserbash-cli"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View on npm
                            </a>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </>
    );
}
