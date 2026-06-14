import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Terms of Service — BrowserBash',
    description:
        'The terms that govern your use of the BrowserBash website and optional cloud dashboard. Acceptable use, third-party models, the open-source CLI license, disclaimers, liability, and governing law.',
    alternates: { canonical: '/terms' },
    openGraph: {
        title: 'Terms of Service — BrowserBash',
        description: 'The rules for using the BrowserBash website and cloud dashboard. The CLI itself is licensed under Apache-2.0.',
        url: 'https://browserbash.com/terms',
        siteName: 'BrowserBash',
        type: 'website',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash' }],
    },
};

export default function TermsPage() {
    return (
        <>
            <SiteNav />
            <main>
                <article className="doc">
                    <header className="doc__head">
                        <p className="section-tag">legal</p>
                        <h1>Terms of Service</h1>
                        <p className="doc__lede">
                            These terms govern your use of the BrowserBash website and the optional cloud dashboard. The
                            open-source CLI is a separate thing &mdash; it&rsquo;s licensed under Apache-2.0, and that license, not
                            these terms, governs the code you run on your own machine.
                        </p>
                        <p className="doc__updated">Last updated: 14 June 2026</p>
                    </header>

                    <nav className="doc__toc" aria-label="Table of contents">
                        <h2>On this page</h2>
                        <ul>
                            <li><a href="#agreement">Agreement to terms</a></li>
                            <li><a href="#service">The service</a></li>
                            <li><a href="#eligibility">Eligibility</a></li>
                            <li><a href="#account">Your account</a></li>
                            <li><a href="#acceptable-use">Acceptable use</a></li>
                            <li><a href="#third-party">Third-party models &amp; providers</a></li>
                            <li><a href="#subscription">Optional paid subscription</a></li>
                            <li><a href="#ip">Intellectual property</a></li>
                            <li><a href="#disclaimers">Disclaimers</a></li>
                            <li><a href="#liability">Limitation of liability</a></li>
                            <li><a href="#indemnification">Indemnification</a></li>
                            <li><a href="#termination">Termination</a></li>
                            <li><a href="#changes">Changes to terms</a></li>
                            <li><a href="#governing-law">Governing law</a></li>
                            <li><a href="#contact">Contact</a></li>
                        </ul>
                    </nav>

                    <div className="doc__body">
                        <h2 id="agreement">Agreement to terms</h2>
                        <p>
                            These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between you and{' '}
                            <strong>The Testing Academy</strong> (&ldquo;BrowserBash&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
                            covering your use of the website at <code>browserbash.com</code> and the optional account-based cloud
                            dashboard (together, the &ldquo;Service&rdquo;). By accessing the website, creating an account, or
                            connecting the CLI to the cloud, you agree to these Terms and to our{' '}
                            <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use the Service.
                        </p>

                        <h2 id="service">The service</h2>
                        <p>
                            BrowserBash is a free, open-source natural-language browser-automation tool. It has two distinct parts,
                            governed by two distinct sets of rules:
                        </p>
                        <ul>
                            <li>
                                <strong>The CLI</strong> &mdash; the command-line tool you install with{' '}
                                <code>npm install -g browserbash-cli</code> and run on your own computer. The CLI is{' '}
                                <strong>open-source software licensed under the Apache License 2.0</strong>. Your use of the CLI is
                                governed by that license (its <code>LICENSE</code> file), <em>not</em> by these Terms. These Terms do
                                not restrict any right the Apache-2.0 license grants you.
                            </li>
                            <li>
                                <strong>The Service</strong> &mdash; this website and the optional hosted cloud dashboard (run
                                history, video recordings, per-run replay). These Terms govern only the Service. You can use the CLI
                                fully, for free, with local models, without ever touching the Service.
                            </li>
                        </ul>

                        <h2 id="eligibility">Eligibility</h2>
                        <p>
                            You must be at least <strong>16 years old</strong> to use the Service. By using it, you represent that you
                            meet this requirement and that you have the authority to enter into these Terms (on your own behalf, or on
                            behalf of an organization you represent). The Service is a developer tool and is not directed at children.
                        </p>

                        <h2 id="account">Your account</h2>
                        <p>
                            The cloud dashboard requires an account, created through our authentication provider (Clerk). You are
                            responsible for keeping your login credentials and any API or connection tokens secure, and for all
                            activity that happens under your account. Do not share your credentials. Notify us promptly at{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a> if you suspect any
                            unauthorized access. You are responsible for the accuracy of the information you provide.
                        </p>

                        <h2 id="acceptable-use">Acceptable use</h2>
                        <p>
                            BrowserBash drives a real browser to do whatever you instruct. That power comes with responsibility.{' '}
                            <strong>You are solely responsible for what you instruct the agent to do.</strong> You agree that:
                        </p>
                        <ul>
                            <li>
                                <strong>You only automate sites you are authorized to use.</strong> You will automate only websites and
                                systems that you own or have explicit permission to access and automate.
                            </li>
                            <li>
                                <strong>You respect target sites&rsquo; rules.</strong> You will comply with the terms of service,{' '}
                                <code>robots.txt</code>, rate limits, and any other policies of the websites you automate, as well as all
                                applicable laws. You will not scrape or collect data in a way that violates a site&rsquo;s terms.
                            </li>
                            <li>
                                <strong>No illegal or abusive automation.</strong> You will not use BrowserBash for anything illegal,
                                fraudulent, deceptive, or abusive &mdash; including denial-of-service attacks, credential stuffing, spam,
                                or high-volume automation designed to harm a target site or its users.
                            </li>
                            <li>
                                <strong>No attacks on the Service.</strong> You will not attempt to break, overload, reverse-engineer for
                                a harmful purpose, probe, or gain unauthorized access to the Service, our infrastructure, or other
                                users&rsquo; accounts or data.
                            </li>
                            <li>
                                <strong>You own the consequences.</strong> Because the agent acts on your instructions, you are solely
                                responsible for the objectives you write, the actions the agent takes, and their effect on any third-party
                                site or system.
                            </li>
                        </ul>
                        <p>
                            We may suspend or terminate access for conduct that violates this section, or that we reasonably believe
                            puts the Service, target sites, or other users at risk.
                        </p>

                        <h2 id="third-party">Third-party models &amp; providers</h2>
                        <p>
                            BrowserBash is designed to let you bring your own model and your own browser backend. You choose which
                            third-party services to use, and you do so under <em>their</em> terms:
                        </p>
                        <ul>
                            <li>
                                <strong>AI models</strong> &mdash; you decide whether to run a local model via Ollama, a free or paid
                                OpenRouter model, an Anthropic model, or another provider. When you supply a key or call a hosted model,
                                you accept that provider&rsquo;s terms and any charges they bill you.
                            </li>
                            <li>
                                <strong>Browser backends</strong> &mdash; you may drive a local Chrome, any CDP endpoint, or a hosted grid
                                such as Browserbase, LambdaTest, or BrowserStack. Each is governed by that provider&rsquo;s own terms and
                                pricing.
                            </li>
                        </ul>
                        <p>
                            We do not control these providers and are <strong>not responsible for their output, availability, or any
                            charges they impose on you</strong>. Critically, <strong>AI output can be wrong</strong>: the agent may
                            misread a page, take an unintended action, or produce an incorrect result. Always review and verify before
                            relying on anything BrowserBash produces, especially in production or for consequential actions.
                        </p>

                        <h2 id="subscription">Optional paid subscription</h2>
                        <p>
                            The Service is free to use, including the local dashboard and a free cloud account. Cloud runs you upload
                            are retained for <strong>15 days</strong> by default and then automatically deleted. If you want runs kept
                            longer, you can subscribe to optional <strong>data retention</strong>, billed through Stripe. Subscription
                            pricing, billing cycle, cancellation, and refunds are described at checkout and on our{' '}
                            <a href="/refunds">Refunds &amp; Cancellation</a> page, which is incorporated into these Terms by reference.
                            You authorize us and Stripe to charge your chosen payment method for the subscription you select.
                        </p>

                        <h2 id="ip">Intellectual property</h2>
                        <p>
                            The <strong>BrowserBash name, logo, and other brand marks</strong> are owned by The Testing Academy. These
                            Terms do not grant you any right to use our marks except as permitted by our{' '}
                            <a href="/brand">brand guidelines</a> or with our written permission. The website, dashboard, and their
                            content remain our property or that of our licensors.
                        </p>
                        <p>
                            The <strong>CLI source code is open source, licensed under the Apache License 2.0</strong>. You are free to
                            use, modify, and redistribute it under the terms of that license. Your test files, objectives, recordings,
                            and any other content you create remain yours &mdash; we claim no ownership over them, and we do not use your
                            run data or recordings to train AI models.
                        </p>

                        <h2 id="disclaimers">Disclaimers</h2>
                        <p>
                            The Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>, without
                            warranties of any kind, whether express or implied, including any implied warranties of merchantability,
                            fitness for a particular purpose, non-infringement, or uninterrupted or error-free operation. We do not
                            warrant that the Service or the AI agent will be accurate, reliable, or available at any given time.
                        </p>
                        <p>
                            <strong>The AI agent may produce incorrect actions.</strong> You acknowledge that automated browser actions
                            driven by AI carry inherent risk, and that you are responsible for what your automation does to any
                            third-party website or system. We are not liable for the consequences of actions you instruct the agent to
                            take, including any damage to, or claims arising from, the sites you automate.
                        </p>

                        <h2 id="liability">Limitation of liability</h2>
                        <p>
                            To the maximum extent permitted by applicable law, The Testing Academy and its contributors will not be
                            liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss
                            of profits, data, goodwill, or business, arising out of or related to your use of (or inability to use) the
                            Service &mdash; even if we have been advised of the possibility of such damages.
                        </p>
                        <p>
                            To the maximum extent permitted by law, our total aggregate liability for all claims relating to the Service
                            is limited to the greater of (a) the total amounts you paid us for the Service in the three (3) months before
                            the event giving rise to the claim, or (b) a nominal amount of <strong>INR 1,000</strong>. Some jurisdictions
                            do not allow certain limitations, so some of the above may not apply to you.
                        </p>

                        <h2 id="indemnification">Indemnification</h2>
                        <p>
                            You agree to indemnify, defend, and hold harmless The Testing Academy and its contributors from and against
                            any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or
                            connected with: (a) your use of the Service or the CLI; (b) the objectives and actions you instruct the agent
                            to perform; (c) your violation of these Terms or of any third party&rsquo;s rights, terms, or applicable law;
                            or (d) the effect of your automation on any third-party website or system.
                        </p>

                        <h2 id="termination">Termination</h2>
                        <p>
                            You may stop using the Service at any time and close your account by contacting us. We may suspend or
                            terminate your access to the Service, with or without notice, if you breach these Terms, if we are required to
                            by law, or if we reasonably believe your use harms the Service, target sites, or other users. On termination,
                            your right to use the Service ends; sections that by their nature should survive (such as Intellectual
                            property, Disclaimers, Limitation of liability, and Indemnification) will continue to apply. Because the CLI is
                            open source, termination of the Service does not affect your rights under the Apache-2.0 license.
                        </p>

                        <h2 id="changes">Changes to terms</h2>
                        <p>
                            We may update these Terms as the Service evolves. When we do, we&rsquo;ll revise the &ldquo;last
                            updated&rdquo; date above and, for material changes, give reasonable notice on the website or by email where
                            appropriate. Your continued use of the Service after changes take effect means you accept the revised Terms.
                        </p>

                        <h2 id="governing-law">Governing law</h2>
                        <p>
                            These Terms are governed by the laws of <strong>India</strong>, without regard to conflict-of-law rules. The
                            courts located in India will have exclusive jurisdiction over any dispute arising out of or relating to these
                            Terms or the Service, subject to any mandatory consumer-protection rights you may have in your own country of
                            residence.
                        </p>

                        <h2 id="contact">Contact</h2>
                        <p>
                            Questions about these Terms? Email{' '}
                            <a href="mailto:thetestingacademy@gmail.com">thetestingacademy@gmail.com</a>. See also our{' '}
                            <a href="/privacy">Privacy Policy</a>, <a href="/refunds">Refunds &amp; Cancellation</a> page, and{' '}
                            <a href="/security">Security</a> page.
                        </p>
                    </div>
                </article>

                <section className="doc-cta">
                    <div className="doc-cta__in">
                        <h2>Start automating in plain English</h2>
                        <p>Free, open-source, zero API keys. Run it locally, or sign up free for the cloud dashboard.</p>
                        <code>npm install -g browserbash-cli</code>
                        <div className="mkt-cta">
                            <a className="pixel-btn pixel-btn--primary" href="/sign-up">Sign up free</a>
                            <a className="pixel-btn" href="/docs">Read the docs</a>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </>
    );
}
