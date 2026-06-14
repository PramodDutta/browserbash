import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Privacy Policy — BrowserBash',
    description:
        'How BrowserBash and The Testing Academy collect, use, and protect your data. What the open-source CLI sends (nothing by default), what the website and dashboard store, the third parties we use, and your privacy rights.',
    alternates: { canonical: '/privacy' },
    openGraph: {
        title: 'Privacy Policy — BrowserBash',
        description: 'What BrowserBash collects, why, and your rights. The CLI is local-first and sends nothing by default.',
        url: 'https://browserbash.com/privacy',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function PrivacyPage() {
    return (
        <>
            <SiteNav />
            <main>
                <article className="doc">
                    <header className="doc__head">
                        <p className="section-tag">legal</p>
                        <h1>Privacy Policy</h1>
                        <p className="doc__lede">
                            BrowserBash is built local-first. The open-source CLI sends nothing to us by default — your
                            objectives, pages, and credentials stay on your machine. This policy explains the limited data
                            the website and optional cloud dashboard collect, and the choices you have.
                        </p>
                        <p className="doc__updated">Last updated: 14 June 2026</p>
                    </header>

                    <nav className="doc__toc" aria-label="Table of contents">
                        <h2>On this page</h2>
                        <ul>
                            <li><a href="#who">Who we are</a></li>
                            <li><a href="#cli">The CLI is local-first</a></li>
                            <li><a href="#collect">What we collect</a></li>
                            <li><a href="#use">How we use it</a></li>
                            <li><a href="#legal-basis">Legal basis (GDPR)</a></li>
                            <li><a href="#processors">Third-party processors</a></li>
                            <li><a href="#cookies">Cookies &amp; analytics</a></li>
                            <li><a href="#retention">Data retention</a></li>
                            <li><a href="#sharing">Sharing &amp; selling</a></li>
                            <li><a href="#rights">Your rights</a></li>
                            <li><a href="#security">Security</a></li>
                            <li><a href="#children">Children</a></li>
                            <li><a href="#changes">Changes</a></li>
                            <li><a href="#contact">Contact</a></li>
                        </ul>
                    </nav>

                    <div className="doc__body">
                        <h2 id="who">Who we are</h2>
                        <p>
                            BrowserBash is a free, open-source project by <strong>The Testing Academy</strong> (&ldquo;we&rdquo;,
                            &ldquo;us&rdquo;). It has two parts: a command-line tool (the <strong>CLI</strong>) you install and run
                            on your own computer, and this website at <code>browserbash.com</code> including an optional
                            account-based <strong>dashboard</strong>. For privacy questions, contact{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>. The Testing Academy is
                            the data controller for personal data processed through the website and dashboard.
                        </p>

                        <h2 id="cli">The CLI is local-first</h2>
                        <p>
                            When you run the BrowserBash CLI, it operates entirely on your machine. Your{' '}
                            <strong>objectives, the web pages it visits, screenshots, recordings, variables, and any
                            credentials</strong> are processed locally and are <strong>not transmitted to us</strong>.
                        </p>
                        <ul>
                            <li>
                                <strong>Model calls.</strong> To turn your plain-English objective into browser actions, the CLI
                                sends prompts to the AI model <em>you choose</em> — a local model via Ollama (nothing leaves your
                                machine), or a provider you configure (OpenRouter, Anthropic, etc.). Those calls go directly from
                                your machine to that provider under <em>their</em> privacy policy. We are not in the path and never
                                see them.
                            </li>
                            <li>
                                <strong>Secrets stay masked.</strong> Values you pass as secrets are masked in logs and output by
                                design. We recommend never hard-coding credentials in test files — use environment variables or
                                secret variables.
                            </li>
                            <li>
                                <strong>You opt in to send anything.</strong> Data only reaches our servers if you create an account
                                and explicitly link the CLI (<code>browserbash connect</code>) or upload a run
                                (<code>--upload</code>). Nothing is uploaded silently.
                            </li>
                        </ul>

                        <h2 id="collect">What we collect</h2>
                        <p>We only collect what the website and optional dashboard need to work:</p>
                        <table>
                            <thead>
                                <tr><th>Category</th><th>Examples</th><th>When</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>Account data</td><td>Email, name, and authentication identifiers</td><td>When you sign up (via Clerk)</td></tr>
                                <tr><td>Run data</td><td>Run metadata, status, logs, and any video/screenshot recordings you upload</td><td>Only when you link the CLI or use <code>--upload</code></td></tr>
                                <tr><td>Billing data</td><td>Subscription status and customer ID (card data is handled by Stripe, never us)</td><td>If you buy optional data retention</td></tr>
                                <tr><td>Usage analytics</td><td>Page views, clicks, and events like sign-up and install-copy, with approximate location and device/browser type</td><td>While browsing the website</td></tr>
                                <tr><td>Technical logs</td><td>IP address, request metadata, error logs from our hosting provider</td><td>Automatically, to keep the service running and secure</td></tr>
                            </tbody>
                        </table>

                        <h2 id="use">How we use it</h2>
                        <ul>
                            <li>Provide and operate your account and dashboard (run history, recordings, replay).</li>
                            <li>Process the optional data-retention subscription, if you choose to buy it.</li>
                            <li>Understand which pages and features are useful, and improve the product and docs.</li>
                            <li>Keep the service secure, prevent abuse, and meet legal obligations.</li>
                            <li>Respond to your support requests.</li>
                        </ul>
                        <p>We do <strong>not</strong> use your run data or recordings to train AI models.</p>

                        <h2 id="legal-basis">Legal basis (GDPR)</h2>
                        <p>
                            Where the GDPR applies, we rely on: <strong>contract</strong> (to run your account and dashboard);
                            <strong> legitimate interests</strong> (to secure the service and understand aggregate usage);
                            <strong> consent</strong> (for non-essential analytics cookies, which you can decline); and
                            <strong> legal obligation</strong> (for records we must keep, e.g. tax for purchases).
                        </p>

                        <h2 id="processors">Third-party processors</h2>
                        <p>We use a small set of trusted providers to run the website and dashboard:</p>
                        <table>
                            <thead><tr><th>Provider</th><th>Purpose</th></tr></thead>
                            <tbody>
                                <tr><td>Vercel</td><td>Website &amp; app hosting, edge delivery, request logs</td></tr>
                                <tr><td>Clerk</td><td>Account sign-up, login, and session management</td></tr>
                                <tr><td>Neon</td><td>Managed Postgres database for account &amp; run metadata</td></tr>
                                <tr><td>Vercel Blob</td><td>Storage for run recordings/screenshots you upload</td></tr>
                                <tr><td>Stripe</td><td>Payment processing for optional data retention (PCI-compliant)</td></tr>
                                <tr><td>Google Analytics</td><td>Aggregate website usage analytics</td></tr>
                            </tbody>
                        </table>
                        <p>
                            Each processor handles your data under its own terms and only as needed to provide its service to us.
                            The AI model providers <em>you</em> configure in the CLI are not our processors — you choose and
                            contract with them directly.
                        </p>

                        <h2 id="cookies">Cookies &amp; analytics</h2>
                        <p>
                            The website uses a small number of cookies: essential cookies for login/session (Clerk) and a hero
                            A/B preference, plus Google Analytics cookies to measure aggregate usage. You can decline non-essential
                            cookies and still use the site. See our <a href="/cookies">Cookie Policy</a> for the full list and how
                            to opt out.
                        </p>

                        <h2 id="retention">Data retention</h2>
                        <ul>
                            <li><strong>Account data</strong> — kept while your account is active; deleted on request or after closure.</li>
                            <li><strong>Free run data</strong> — uploaded runs are retained for <strong>15 days</strong> by default, then automatically deleted.</li>
                            <li><strong>Paid retention</strong> — if you subscribe, runs are kept for the period described at checkout until you cancel.</li>
                            <li><strong>Analytics</strong> — retained in aggregate per Google Analytics&rsquo; default retention window.</li>
                            <li><strong>Billing records</strong> — kept as long as required by law.</li>
                        </ul>

                        <h2 id="sharing">Sharing &amp; selling</h2>
                        <p>
                            We do <strong>not sell your personal data</strong>, and we do not share it with advertisers. We share
                            data only with the processors listed above, or where required by law. Because BrowserBash is
                            open-source, anyone can audit exactly what the CLI does.
                        </p>

                        <h2 id="rights">Your rights</h2>
                        <p>
                            Depending on where you live (e.g. EEA/UK under GDPR, California under CCPA/CPRA), you may have the
                            right to access, correct, delete, export, or restrict use of your personal data, to object to certain
                            processing, and to withdraw consent. To exercise any of these, email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> and we&rsquo;ll respond
                            within the time the law requires. You also have the right to complain to your local data-protection
                            authority.
                        </p>

                        <h2 id="security">Security</h2>
                        <p>
                            We use encryption in transit (HTTPS), managed and access-controlled infrastructure, and secret masking
                            in the CLI. No system is perfectly secure, but we work to protect your data and to disclose any
                            material incident responsibly. See our <a href="/security">Security page</a> for details and how to
                            report a vulnerability.
                        </p>

                        <h2 id="children">Children</h2>
                        <p>
                            BrowserBash is a developer tool not directed at children. We do not knowingly collect personal data
                            from anyone under 16. If you believe a child has provided us data, contact us and we will delete it.
                        </p>

                        <h2 id="changes">Changes to this policy</h2>
                        <p>
                            We may update this policy as the product evolves. We&rsquo;ll revise the &ldquo;last updated&rdquo;
                            date above and, for material changes, give notice on the website or by email where appropriate.
                        </p>

                        <h2 id="contact">Contact</h2>
                        <p>
                            Questions or requests? Email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>. See also our{' '}
                            <a href="/terms">Terms of Service</a>, <a href="/cookies">Cookie Policy</a>, and{' '}
                            <a href="/security">Security</a> page.
                        </p>
                    </div>
                </article>
            </main>
            <SiteFooter />
        </>
    );
}
