import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Cookie Policy — BrowserBash',
    description:
        'The cookies BrowserBash uses, why, and how to control them. Essential cookies for login and the site, plus optional Google Analytics you can decline and still use the site.',
    alternates: { canonical: '/cookies' },
    openGraph: {
        title: 'Cookie Policy — BrowserBash',
        description: 'Which cookies BrowserBash sets, why, and how to decline non-essential analytics.',
        url: 'https://browserbash.com/cookies',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function CookiesPage() {
    return (
        <>
            <SiteNav />
            <main>
                <article className="doc">
                    <header className="doc__head">
                        <p className="section-tag">legal</p>
                        <h1>Cookie Policy</h1>
                        <p className="doc__lede">
                            BrowserBash keeps cookies to a minimum. We use a handful of essential cookies so login and the
                            site work, plus optional Google Analytics cookies you can decline. The open-source CLI you run
                            on your own machine does not use cookies at all.
                        </p>
                        <p className="doc__updated">Last updated: 14 June 2026</p>
                    </header>

                    <nav className="doc__toc" aria-label="Table of contents">
                        <h2>On this page</h2>
                        <ul>
                            <li><a href="#what">What cookies are</a></li>
                            <li><a href="#how">How we use them</a></li>
                            <li><a href="#list">Cookies we set</a></li>
                            <li><a href="#categories">Cookie categories</a></li>
                            <li><a href="#manage">Managing &amp; declining cookies</a></li>
                            <li><a href="#dnt">Do Not Track</a></li>
                            <li><a href="#changes">Changes</a></li>
                            <li><a href="#contact">Contact</a></li>
                        </ul>
                    </nav>

                    <div className="doc__body">
                        <h2 id="what">What cookies are</h2>
                        <p>
                            Cookies are small text files a website stores in your browser when you visit. On each later
                            request, your browser sends them back, which lets the site remember things between page loads —
                            for example, that you are signed in. We also use closely related browser storage technologies
                            (such as <code>localStorage</code>) for similar purposes; we refer to all of them as
                            &ldquo;cookies&rdquo; in this policy for simplicity.
                        </p>
                        <p>
                            Cookies can be <strong>first-party</strong> (set by <code>browserbash.com</code>) or
                            <strong> third-party</strong> (set by a provider we use, such as Clerk or Google Analytics).
                            They can also be <strong>session</strong> cookies (deleted when you close your browser) or
                            <strong> persistent</strong> cookies (kept for a set period). This policy covers the cookies
                            used on this website and the optional cloud dashboard only — the BrowserBash CLI runs locally
                            and sets no cookies.
                        </p>

                        <h2 id="how">How we use them</h2>
                        <p>We use cookies for a small set of clear purposes:</p>
                        <ul>
                            <li>
                                <strong>Keep you signed in.</strong> Authentication and session cookies (set by Clerk) let you
                                log in to the dashboard and stay logged in securely as you move between pages.
                            </li>
                            <li>
                                <strong>Remember a site preference.</strong> A small first-party cookie remembers which
                                variant of the homepage hero you were shown so the page stays consistent on repeat visits.
                            </li>
                            <li>
                                <strong>Process payments securely.</strong> If you buy optional data retention, Stripe sets
                                cookies during checkout to complete the payment and help prevent fraud.
                            </li>
                            <li>
                                <strong>Understand aggregate usage.</strong> With your consent, Google Analytics cookies help
                                us see which pages and features are useful so we can improve the product and docs. These are
                                non-essential and you can decline them.
                            </li>
                        </ul>
                        <p>
                            We do <strong>not</strong> use cookies for advertising, we do not sell data, and we do not use
                            your activity to train AI models.
                        </p>

                        <h2 id="list">Cookies we set</h2>
                        <p>
                            The table below lists the cookies you may encounter. Exact names, additional helper cookies, and
                            durations set by our providers (Clerk, Stripe, Google) can vary as those services update; the
                            entries below describe the categories and typical lifetimes.
                        </p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Provider</th>
                                    <th>Purpose</th>
                                    <th>Type</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><code>__session</code> &amp; Clerk auth cookies</td>
                                    <td>Clerk</td>
                                    <td>Authenticate you and keep your dashboard session signed in and secure.</td>
                                    <td>Essential</td>
                                    <td>Session</td>
                                </tr>
                                <tr>
                                    <td><code>bb_hero</code></td>
                                    <td>BrowserBash (first-party)</td>
                                    <td>Remembers which A/B homepage hero variant you were shown so the page stays consistent.</td>
                                    <td>Essential / Functional</td>
                                    <td>~30 days</td>
                                </tr>
                                <tr>
                                    <td><code>_ga</code></td>
                                    <td>Google Analytics</td>
                                    <td>Distinguishes visitors to measure aggregate, anonymous website usage.</td>
                                    <td>Analytics</td>
                                    <td>Up to 2 years</td>
                                </tr>
                                <tr>
                                    <td><code>_ga_*</code></td>
                                    <td>Google Analytics</td>
                                    <td>Persists session state for a specific Analytics property (GA4).</td>
                                    <td>Analytics</td>
                                    <td>Up to 2 years</td>
                                </tr>
                                <tr>
                                    <td>Stripe checkout cookies (e.g. <code>__stripe_mid</code>, <code>__stripe_sid</code>)</td>
                                    <td>Stripe</td>
                                    <td>Process payment and help prevent fraud during checkout. Set only if you buy optional data retention.</td>
                                    <td>Essential</td>
                                    <td>Session to ~1 year</td>
                                </tr>
                            </tbody>
                        </table>

                        <h2 id="categories">Cookie categories</h2>
                        <p>We group the cookies above into two categories:</p>
                        <ul>
                            <li>
                                <strong>Essential cookies.</strong> Needed for the site and dashboard to function — logging in,
                                keeping your session, remembering a basic site preference, and completing a payment. Because
                                the site cannot work properly without them, they are not subject to consent and cannot be
                                switched off through a cookie banner. You can still block them in your browser, but parts of
                                the site (such as the dashboard) may stop working.
                            </li>
                            <li>
                                <strong>Analytics cookies.</strong> Optional, non-essential cookies (Google Analytics) that
                                help us understand aggregate usage. They are not required to use the site, and you can decline
                                them and still browse and use BrowserBash normally.
                            </li>
                        </ul>

                        <h2 id="manage">Managing &amp; declining cookies</h2>
                        <p>
                            You are in control. You can <strong>decline non-essential analytics cookies and still use the
                            entire site</strong> — nothing on BrowserBash is gated behind analytics. There are a few ways to
                            manage cookies:
                        </p>
                        <ul>
                            <li>
                                <strong>Browser settings.</strong> Every major browser lets you view, block, and delete
                                cookies. Look under Privacy or Cookies in Chrome, Firefox, Safari, or Edge settings. You can
                                block third-party cookies, clear cookies on exit, or remove individual cookies set by{' '}
                                <code>browserbash.com</code>.
                            </li>
                            <li>
                                <strong>Opt out of Google Analytics.</strong> You can install Google&rsquo;s official browser
                                add-on to opt out of Analytics across all sites:{' '}
                                <a
                                    href="https://tools.google.com/dlpage/gaoptout"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Google Analytics Opt-out Browser Add-on
                                </a>
                                .
                            </li>
                            <li>
                                <strong>Decline at the banner.</strong> Where we ask for consent to non-essential cookies, you
                                can decline; we will then not set Analytics cookies for you.
                            </li>
                        </ul>
                        <p>
                            Note that blocking <em>essential</em> cookies — for example, Clerk&rsquo;s session cookies — will
                            prevent you from signing in to or using the cloud dashboard.
                        </p>

                        <h2 id="dnt">Do Not Track</h2>
                        <p>
                            Some browsers can send a &ldquo;Do Not Track&rdquo; (DNT) signal. There is no industry-wide
                            standard for how sites must respond to DNT, so we do not currently change our behaviour based on
                            it. Instead, you can rely on the controls above — declining analytics at the banner or using the
                            Google opt-out add-on — to limit non-essential tracking.
                        </p>

                        <h2 id="changes">Changes to this policy</h2>
                        <p>
                            We may update this Cookie Policy as the product and our providers evolve. When we do, we&rsquo;ll
                            revise the &ldquo;last updated&rdquo; date above. Material changes will be highlighted on the
                            website where appropriate.
                        </p>

                        <h2 id="contact">Contact</h2>
                        <p>
                            Questions about cookies? Email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>. For the full picture
                            of how we handle your data, see our <a href="/privacy">Privacy Policy</a>.
                        </p>
                    </div>
                </article>

                <section className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Start automating in plain English</h2>
                        <p>Free, open-source, and local-first. No API keys, no credit card.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">Sign up free</a>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </>
    );
}
