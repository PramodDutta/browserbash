import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Refund & Cancellation Policy — BrowserBash',
    description:
        'BrowserBash — the CLI, local dashboard, and a free cloud account — is free, so there is nothing to refund. The only paid item is the optional cloud data-retention subscription. Here is how cancellations and refunds work.',
    alternates: { canonical: '/refunds' },
    openGraph: {
        title: 'Refund & Cancellation Policy — BrowserBash',
        description: 'BrowserBash is free. The only paid item is optional cloud data retention — here is how to cancel and request a refund.',
        url: 'https://browserbash.com/refunds',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function RefundsPage() {
    return (
        <>
            <SiteNav />
            <main>
                <article className="doc">
                    <header className="doc__head">
                        <p className="section-tag">legal</p>
                        <h1>Refund &amp; Cancellation Policy</h1>
                        <p className="doc__lede">
                            BrowserBash itself is free. The command-line tool, the local dashboard, and a cloud account all
                            cost nothing — so there is nothing to refund there. The <strong>only</strong> paid item is the
                            optional cloud data-retention subscription, and this page explains exactly how cancellations and
                            refunds work for it.
                        </p>
                        <p className="doc__updated">Last updated: 14 June 2026</p>
                    </header>

                    <nav className="doc__toc" aria-label="Table of contents">
                        <h2>On this page</h2>
                        <ul>
                            <li><a href="#free-vs-paid">What&rsquo;s free vs paid</a></li>
                            <li><a href="#subscription">The optional data-retention subscription</a></li>
                            <li><a href="#cancellation">Cancellation</a></li>
                            <li><a href="#refunds">Refunds</a></li>
                            <li><a href="#request">How to request a refund</a></li>
                            <li><a href="#billing">Billing questions</a></li>
                            <li><a href="#changes">Changes to this policy</a></li>
                        </ul>
                    </nav>

                    <div className="doc__body">
                        <h2 id="free-vs-paid">What&rsquo;s free vs paid</h2>
                        <p>
                            We want this to be unambiguous, because it shapes the whole policy: nearly everything BrowserBash
                            offers is free, and only one thing is paid.
                        </p>
                        <table>
                            <thead>
                                <tr><th>What you get</th><th>Cost</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>The open-source CLI (<code>browserbash-cli</code>, Apache-2.0)</td><td>Free, forever</td></tr>
                                <tr><td>The local web dashboard (the <code>dashboard</code> command)</td><td>Free, runs on your machine</td></tr>
                                <tr><td>A cloud account — run history, video recordings, per-run replay</td><td>Free</td></tr>
                                <tr><td>Cloud run retention</td><td>Free for 15 days, then auto-deleted</td></tr>
                                <tr><td>Optional cloud data-retention subscription</td><td><strong>Paid</strong> (keeps cloud runs beyond 15 days)</td></tr>
                            </tbody>
                        </table>
                        <p>
                            Because the CLI, the local dashboard, and a free cloud account never charge you, there is no payment
                            to reverse for any of them. The rest of this policy is about the single paid product:
                            <strong> cloud data retention</strong>.
                        </p>

                        <h2 id="subscription">The optional data-retention subscription</h2>
                        <p>
                            Every run you upload to the cloud is kept <strong>free for 15 days</strong>, after which it is
                            automatically deleted. If you want your cloud runs — including their video recordings and replay
                            data — to be kept longer than that window, you can subscribe to optional{' '}
                            <strong>data retention</strong>. It is a recurring subscription, billed securely through{' '}
                            <strong>Stripe</strong>, and it is entirely your choice: you can use BrowserBash forever without
                            ever buying it. See the <a href="/pricing">pricing page</a> for current details, and our{' '}
                            <a href="/terms">Terms of Service</a> for the full agreement that governs it.
                        </p>

                        <h2 id="cancellation">Cancellation</h2>
                        <p>You can cancel the data-retention subscription at any time, with no cancellation fee:</p>
                        <ul>
                            <li>
                                <strong>From your dashboard.</strong> Open your account billing settings in the cloud dashboard
                                and cancel the subscription there.
                            </li>
                            <li>
                                <strong>By email.</strong> Or simply email{' '}
                                <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> from the address on
                                your account and ask us to cancel it for you.
                            </li>
                        </ul>
                        <p>What happens when you cancel:</p>
                        <ul>
                            <li>
                                <strong>You keep access until the end of the current billing period.</strong> Cancelling stops
                                the next renewal — it does not cut you off mid-period.
                            </li>
                            <li>
                                <strong>Your account drops back to the free plan</strong> when the period ends, which means cloud
                                runs return to the standard <strong>15-day</strong> retention window.
                            </li>
                            <li>
                                <strong>Older runs may be deleted.</strong> Once you are back on the free plan, any cloud runs
                                older than 15 days may be automatically removed. If you want to keep recordings beyond that, export
                                or download them before cancellation takes effect.
                            </li>
                        </ul>

                        <h2 id="refunds">Refunds</h2>
                        <p>
                            If something went wrong — the service did not work as described, or you were billed in error (for
                            example, charged after cancelling, or charged twice) — email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> within{' '}
                            <strong>7 days</strong> of the charge and we will issue a <strong>full refund</strong> for that
                            payment.
                        </p>
                        <p>
                            Outside of that, subscription payments are <strong>non-refundable for partial periods</strong>. If
                            you cancel partway through a billing period, you keep access until the end of that period but we do
                            not pro-rate or refund the remainder. We do not provide refunds for time you simply did not use the
                            subscription.
                        </p>

                        <h2 id="request">How to request a refund</h2>
                        <p>To request a refund, email us with a couple of details so we can find your payment quickly:</p>
                        <ul>
                            <li>Send your message to <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>.</li>
                            <li>Use (or include) the <strong>email address on your BrowserBash account</strong>.</li>
                            <li>Tell us roughly <strong>when you were charged</strong> and what went wrong, if anything.</li>
                        </ul>
                        <p>
                            Approved refunds are returned to your original payment method through Stripe. The exact time it takes
                            to appear depends on your bank or card issuer.
                        </p>

                        <h2 id="billing">Billing questions</h2>
                        <p>
                            Payments are processed by <strong>Stripe</strong>; we never see or store your full card details. For
                            anything about a charge, an invoice, a renewal date, or updating your payment method, email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> and we will help. For how
                            we handle the limited billing data we do hold, see our <a href="/privacy">Privacy Policy</a>.
                        </p>

                        <h2 id="changes">Changes to this policy</h2>
                        <p>
                            We may update this policy as the product evolves. We&rsquo;ll revise the &ldquo;last updated&rdquo;
                            date above and, for material changes, give notice on the website or by email where appropriate. This
                            policy works alongside our <a href="/terms">Terms of Service</a>.
                        </p>
                    </div>
                </article>

                <section className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Start free — nothing to refund</h2>
                        <p>The CLI, the local dashboard, and a cloud account are all free. Install and run it now.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">Sign up free</a>
                            <a className="pixel-btn" href="/pricing">See pricing</a>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </>
    );
}
