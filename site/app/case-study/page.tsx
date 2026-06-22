import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { Bo } from '@/components/Bo';
import '../landing.css';
import '../marketing.css';

export const metadata: Metadata = {
    title: 'Case study: plain-English tests for a real Playwright suite (TTACart) — BrowserBash',
    description:
        'How we pointed BrowserBash at our own production Playwright + TypeScript suite — the open-source AdvancePlaywrightFramework1x that tests the TTACart store. The same login → cart → checkout journey, rewritten as one plain-English file, run with a single command on a free local model, recorded and replayable.',
    alternates: { canonical: '/case-study' },
    openGraph: {
        title: 'Case study: plain-English tests for a real Playwright suite',
        description:
            'A production Playwright suite (TTACart: login → cart → checkout) rewritten as one plain-English BrowserBash file. One command, free local model, recorded session, dashboard replay.',
        url: 'https://browserbash.com/case-study',
        siteName: 'BrowserBash',
        type: 'article',
        images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BrowserBash case study' }],
    },
};

const REPO = 'https://github.com/PramodDutta/AdvancePlaywrightFramework1x';

// Faithful excerpt of the real e2e-checkout.spec.ts (trimmed for the page).
const PLAYWRIGHT_SPEC = `// e2e-checkout.spec.ts  ·  AdvancePlaywrightFramework1x
test.beforeEach(async ({ loginPage }) => {
  await loginPage.open();
  await loginPage.loginAs(
    credentials.standardUser, credentials.password);
});

test('should complete checkout successfully', async ({
  inventoryPage, cartPage, checkoutStepOnePage,
  checkoutStepTwoPage, checkoutCompletePage,
}) => {
  const customer = DataGenerator.checkoutCustomer();
  await inventoryPage.open();
  await inventoryPage.addToCart('test-allthethings-tshirt-red');
  await cartPage.open();
  expect(await cartPage.rowCount()).toBe(1);
  await cartPage.checkout();
  await checkoutStepOnePage.fillGuest(customer);
  await checkoutStepOnePage.continue();
  await checkoutStepTwoPage.finish();
  await checkoutCompletePage.assertOrderComplete();
});

// + 6 page objects (Login, Inventory, Cart, CheckoutStepOne,
//   CheckoutStepTwo, CheckoutComplete), fixtures, BasePage,
//   UtilElementLocator, data-test selectors, Faker factories…`;

// The real plain-English twin shipped in examples/ttacart_checkout_test.md.
const BROWSERBASH_MD = `# TTACart end-to-end checkout

- Open the TTACart login page
- Log in as standard_user with the password tta_secret
- Go to the products inventory page
- Add the "Test.allTheThings() T-Shirt (Red)" to the cart
- Open the cart and verify it contains exactly 1 item
- Click Checkout
- Fill the checkout details: first name Pramod,
  last name Dutta, postal code 560001
- Continue to the order overview, then click Finish
- Verify the page shows "Thank you for your order!"`;

const RUN_CMD = `browserbash testmd run \\
  examples/ttacart_checkout_test.md --record --upload`;

const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'Case study: plain-English tests for a real Playwright suite (TTACart)',
    description:
        'A production Playwright + TypeScript suite rewritten as one plain-English BrowserBash file — same login → cart → checkout journey, one command, free local model, recorded and replayable.',
    datePublished: '2026-06-15',
    dateModified: '2026-06-15',
    author: { '@type': 'Organization', name: 'The Testing Academy', url: 'https://thetestingacademy.com', '@id': 'https://browserbash.com/#org' },
    publisher: { '@id': 'https://browserbash.com/#org' },
    mainEntityOfPage: 'https://browserbash.com/case-study',
    image: 'https://browserbash.com/og.png',
    about: ['Playwright', 'natural language test automation', 'end-to-end testing', 'BrowserBash'],
};
const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://browserbash.com' },
        { '@type': 'ListItem', position: 2, name: 'Case study', item: 'https://browserbash.com/case-study' },
    ],
};

export default function CaseStudyPage() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
            <SiteNav />
            <main>
                <article className="cs-wrap">
                    {/* hero */}
                    <header className="doc__head cs-section--lead" style={{ paddingTop: 48 }}>
                        <p className="section-tag">case study · the testing academy</p>
                        <h1>We pointed BrowserBash at our own Playwright suite</h1>
                        <p className="cs-lede">
                            The Testing Academy maintains a production Playwright&nbsp;+&nbsp;TypeScript framework that tests{' '}
                            <strong>TTACart</strong>, our demo store — login, add to cart, full checkout, order confirmation.
                            We took that exact end-to-end journey and rewrote it as <strong>one plain-English file</strong>,
                            then ran it with a <strong>single command</strong> on a <strong>free local model</strong> — driving
                            a real browser against the live app, the whole session recorded for replay.
                        </p>
                        <div className="cs-verdict">
                            <span className="cs-chip">Real repo, open source</span>
                            <span className="cs-chip">Playwright 1.60 + TS</span>
                            <span className="cs-chip cs-chip--ok">Same journey, plain English</span>
                            <span className="cs-chip cs-chip--ok">$0 local model</span>
                        </div>
                    </header>

                    {/* stats */}
                    <section className="cs-section cs-section--lead">
                        <div className="cs-stats">
                            <div className="pixel-card cs-stat">
                                <span className="cs-stat__n">6 → 1</span>
                                <span className="cs-stat__l">Six page-object classes replaced by one plain-English file</span>
                            </div>
                            <div className="pixel-card cs-stat">
                                <span className="cs-stat__n">0</span>
                                <span className="cs-stat__l">CSS / <code>data-test</code> selectors to write or maintain</span>
                            </div>
                            <div className="pixel-card cs-stat">
                                <span className="cs-stat__n">1</span>
                                <span className="cs-stat__l">Command runs the whole login → checkout journey</span>
                            </div>
                            <div className="pixel-card cs-stat">
                                <span className="cs-stat__n">$0</span>
                                <span className="cs-stat__l">Cost on a local Ollama model — no API key, no grid</span>
                            </div>
                        </div>
                    </section>

                    {/* the framework */}
                    <section className="cs-section">
                        <p className="section-tag">the suite under test</p>
                        <h2>A real, production Playwright framework</h2>
                        <p className="cs-body">
                            <a href={REPO} target="_blank" rel="noopener noreferrer">AdvancePlaywrightFramework1x</a> is our
                            open-source, batteries-included Playwright&nbsp;+&nbsp;TypeScript suite: the Page Object Model,
                            custom fixtures, Faker data factories, a Winston logger, Allure plus a custom TTA-branded HTML
                            reporter, and a GitHub Actions pipeline. It exercises <strong>TTACart</strong> — a SauceDemo-style
                            store at <code>app.thetestingacademy.com/playwright/ttacart</code> — across login, inventory, cart
                            and a three-step checkout.
                        </p>
                        <ul className="cs-list">
                            <li><strong>login.spec.ts</strong> — signs in as <code>standard_user</code> and asserts the form is gone.</li>
                            <li><strong>e2e-checkout.spec.ts</strong> — the flagship: login → add item → cart → checkout → &ldquo;Thank you for your order!&rdquo;</li>
                            <li><strong>apiTests/</strong> — a serial CRUD flow (token → create → update) that runs green in CI.</li>
                            <li><strong>Recorded by design</strong> — Playwright video on, per-step screenshots, traces on retry.</li>
                        </ul>
                        <div className="cs-note pixel-card">
                            <Bo size={44} interactive={false} />
                            <div>
                                <strong>The point of the case study</strong>
                                <p>
                                    This isn&rsquo;t a toy. It&rsquo;s a maintained suite that passes in CI. We wanted to know:
                                    could the same coverage be written by anyone on the team in plain English — and still drive
                                    the real browser? It can.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* before / after */}
                    <section className="cs-section">
                        <p className="section-tag">the transformation</p>
                        <h2>From six page objects to one paragraph</h2>
                        <p className="cs-body">
                            Left: the real <code>e2e-checkout.spec.ts</code> — page objects, fixtures, selectors, assertions.
                            Right: the exact same journey as <code>examples/ttacart_checkout_test.md</code>, shipped in the
                            BrowserBash repo. No selectors. No page objects. Just intent.
                        </p>
                        <div className="cs-split">
                            <div className="cs-col cs-col--before">
                                <span className="cs-col__tag">before · playwright + typescript</span>
                                <div className="cs-window">
                                    <div className="cs-window__bar"><i className="d1" /><i className="d2" /><i className="d3" /><span className="cs-window__title">e2e-checkout.spec.ts</span></div>
                                    <pre className="cs-code">{PLAYWRIGHT_SPEC}</pre>
                                </div>
                            </div>
                            <div className="cs-col cs-col--after">
                                <span className="cs-col__tag">after · browserbash markdown</span>
                                <div className="cs-window">
                                    <div className="cs-window__bar"><i className="d1" /><i className="d2" /><i className="d3" /><span className="cs-window__title">ttacart_checkout_test.md</span></div>
                                    <pre className="cs-code">{BROWSERBASH_MD}</pre>
                                </div>
                            </div>
                        </div>
                        <div className="cs-note pixel-card">
                            <Bo size={44} interactive={false} pose="idle" />
                            <div>
                                <strong>Same intent, masked secrets</strong>
                                <p>
                                    Credentials shown here are TTACart&rsquo;s public demo creds. For real apps, pass values as{' '}
                                    <code>{'{{variables}}'}</code> — BrowserBash masks them as <code>*****</code> in every log line,
                                    event and summary.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* one command */}
                    <section className="cs-section">
                        <p className="section-tag">how we ran it</p>
                        <h2>One command runs the whole journey</h2>
                        <p className="cs-body">
                            No build step, no <code>page.locator</code>, no waiting code. The AI agent reads each line, finds the
                            element on the live page, acts, and keeps the logged-in session alive from the first step to the
                            confirmation screen.
                        </p>
                        <div className="cs-window cs-window--solo">
                            <div className="cs-window__bar"><i className="d1" /><i className="d2" /><i className="d3" /><span className="cs-window__title">zsh — the whole run</span></div>
                            <pre className="cs-code"><span className="c-dim">$ </span>{RUN_CMD}{'\n'}<span className="c-dim">Engine: stagehand (MIT, stagehand.dev)</span>{'\n'}<span className="c-dim">Recording session video (--record)</span>{'\n'}<span className="c-go">→</span> opening <span className="c-str">app.thetestingacademy.com/playwright/ttacart</span> in local Chromium{'\n'}<span className="c-go">→</span> login · inventory · add to cart · checkout · finish{'\n'}<span className="c-go">→</span> one browser context across every step · recorded with <span className="c-str">--record</span></pre>
                        </div>
                        <div className="cs-flow">
                            <div className="pixel-card cs-flow__step">
                                <div className="cs-flow__n">1</div>
                                <h3>Write the intent</h3>
                                <p>Plain-English steps in a committable <code>*_test.md</code> — or generate them from an existing spec.</p>
                            </div>
                            <div className="pixel-card cs-flow__step">
                                <div className="cs-flow__n">2</div>
                                <h3>Run one command</h3>
                                <p>Local Chrome by default. Add <code>--provider lambdatest</code> or <code>browserstack</code> for a grid.</p>
                            </div>
                            <div className="pixel-card cs-flow__step">
                                <div className="cs-flow__n">3</div>
                                <h3>Drive a real browser</h3>
                                <p>The agent finds elements live — the session stays logged in through checkout.</p>
                            </div>
                            <div className="pixel-card cs-flow__step">
                                <div className="cs-flow__n">4</div>
                                <h3>Get a verdict + replay</h3>
                                <p>An exit code, a <code>Result.md</code>, and a recorded video — uploaded to your dashboard.</p>
                            </div>
                        </div>
                    </section>

                    {/* recorded session */}
                    <section className="cs-section">
                        <p className="section-tag">recorded, on a real browser</p>
                        <h2>Plain English in, real TTACart out</h2>
                        <p className="cs-body">
                            With <code>--record</code>, BrowserBash captures a session video and a screenshot on every engine
                            (the builtin engine also saves a Playwright trace). Below is the actual frame BrowserBash captured
                            driving a local Chromium against the live TTACart — not a mockup, the real app.
                        </p>
                        <figure className="cs-figure">
                            <div className="cs-window cs-window--solo">
                                <div className="cs-window__bar">
                                    <i className="d1" /><i className="d2" /><i className="d3" />
                                    <span className="cs-window__url">app.thetestingacademy.com/playwright/ttacart/index.html</span>
                                </div>
                                <video
                                    className="cs-shot"
                                    controls
                                    playsInline
                                    preload="metadata"
                                    poster="/case-study/ttacart-login-final.png"
                                >
                                    <source src="/case-study/ttacart-login.webm" type="video/webm" />
                                </video>
                            </div>
                            <figcaption className="cs-figcap">
                                Real <code>--record</code> capture: BrowserBash opening TTACart in a local Chromium. The CLI keeps
                                everything on your machine until you add <code>--upload</code>.
                            </figcaption>
                        </figure>
                    </section>

                    {/* dashboard */}
                    <section className="cs-section">
                        <p className="section-tag">the dashboard</p>
                        <h2>Every run, recorded and replayable</h2>
                        <p className="cs-body">
                            Add <code>--upload</code> (after a one-time <code>browserbash connect</code>) and the run streams to
                            your free BrowserBash dashboard: run history, status, the video replay, and a per-run page you can
                            share with the team. This is the &ldquo;showcase in a dashboard&rdquo; part — a living record of every
                            TTACart journey, not a wall of CI logs.
                        </p>
                        <ul className="cs-list">
                            <li><strong>Run history</strong> — every objective, with pass / fail and duration.</li>
                            <li><strong>Video replay</strong> — watch exactly what the agent saw, step by step.</li>
                            <li><strong>Per-run share link</strong> — send a teammate the replay, not a stack trace.</li>
                            <li><strong>Free tier</strong> — uploaded runs kept 15 days; optional retention for longer.</li>
                        </ul>
                        <div className="mkt-cta" style={{ justifyContent: 'flex-start', marginTop: 22 }}>
                            <a className="pixel-btn" href="/sign-up">Create a free dashboard account →</a>
                            <a className="pixel-btn ghost" href="/dashboard">See the dashboard</a>
                        </div>
                    </section>

                    {/* bug highlighting */}
                    <section className="cs-section">
                        <p className="section-tag">when something breaks</p>
                        <h2>A failure tells you exactly where</h2>
                        <p className="cs-body">
                            Tests exist to catch regressions, so the failure path matters as much as the happy path. If TTACart
                            ever stopped saying &ldquo;Thank you for your order!&rdquo;, BrowserBash marks that step failed,
                            captures a screenshot at the point of failure, writes the reason to <code>Result.md</code>, and exits
                            non-zero so CI goes red — no prose to parse.
                        </p>
                        <div className="cs-window cs-window--solo">
                            <div className="cs-window__bar"><i className="d1" /><i className="d2" /><i className="d3" /><span className="cs-window__title">a failed verdict</span></div>
                            <pre className="cs-code"><span className="c-ok">  ✓ [5]</span> act: click Finish{'\n'}<span className="c-err">  ✗ [6]</span> verify the page shows &quot;Thank you for your order!&quot;{'\n'}<span className="c-err">FAILED</span> — expected text not found · screenshot saved{'\n'}<span className="c-dim">exit code 1 · Result.md written · CI fails the build</span></pre>
                        </div>
                        <table className="cs-exit">
                            <thead><tr><th>Exit code</th><th>Meaning</th></tr></thead>
                            <tbody>
                                <tr><td><code>0</code></td><td>Passed — every step succeeded</td></tr>
                                <tr><td><code>1</code></td><td>Failed — an assertion or step did not pass</td></tr>
                                <tr><td><code>2</code></td><td>Error — the run could not execute</td></tr>
                                <tr><td><code>3</code></td><td>Timeout — the run exceeded its budget</td></tr>
                            </tbody>
                        </table>
                    </section>

                    {/* model / cost */}
                    <section className="cs-section">
                        <p className="section-tag">the model &amp; the cost</p>
                        <h2>Free locally — or pennies on a hosted model</h2>
                        <p className="cs-body">
                            BrowserBash is model-agnostic and resolves in this order: a local Ollama model first, then your
                            Anthropic or OpenRouter key if set. For TTACart we ran a local model — <code>$0</code>, fully
                            private, nothing leaving the machine.
                        </p>
                        <ul className="cs-list">
                            <li><strong>Free &amp; local</strong> — <code>ollama pull qwen3</code>, then run. Best for short, direct flows; no keys, no cost.</li>
                            <li><strong>Cheap &amp; hosted</strong> — long multi-step journeys are most reliable on a stronger model. A budget OpenRouter model like <code>deepseek/deepseek-chat</code> or a Qwen model costs a few cents per run.</li>
                            <li><strong>One flag to switch</strong> — <code>--model openrouter/deepseek/deepseek-chat</code> or <code>--model ollama/qwen3</code>. Same test file, your choice of brain.</li>
                            <li><strong>No lock-in</strong> — swap models or grids without touching the test.</li>
                        </ul>
                        <div className="cs-note pixel-card">
                            <Bo size={44} interactive={false} />
                            <div>
                                <strong>Honest note</strong>
                                <p>
                                    Tiny local models are great for simple objectives; a full login-to-checkout journey is more
                                    reliable on a stronger (still cheap) hosted model. BrowserBash lets you pick per run — start
                                    free, scale up only when the flow demands it.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* CTA */}
                    <div className="doc-cta">
                        <div className="doc-cta__in">
                            <h2>Run it on your own app</h2>
                            <p>Install the CLI and turn your next test into a sentence.</p>
                            <code>npm install -g browserbash-cli</code>
                            <div className="mkt-cta">
                                <a className="pixel-btn" href="/learn">Start the tutorial →</a>
                                <a className="pixel-btn ghost" href={REPO} target="_blank" rel="noopener noreferrer">See the Playwright suite ↗</a>
                            </div>
                        </div>
                    </div>
                </article>
            </main>
            <SiteFooter />
        </>
    );
}
