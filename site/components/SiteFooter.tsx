import { Bo } from '@/components/Bo';
import { PHBadge } from '@/components/PHBadge';

/**
 * Site-wide footer with full Product / Resources / Company / Legal columns.
 * Used on every marketing + legal page so launch trust links (privacy, terms,
 * security) and conversion links (pricing, sign up) are reachable everywhere.
 */
export function SiteFooter() {
    const year = 2026;
    return (
        <footer className="footer footer--big">
            <div className="container footer__grid">
                <div className="footer__col footer__col--brand">
                    <div className="footer__brand">
                        <Bo size={32} interactive={false} />
                        <span>BrowserBash</span>
                    </div>
                    <p className="footer__tag">
                        Plain English in. Real browser out. Free, open-source AI browser automation — no API keys, no credit card.
                    </p>
                    <p className="footer__credit">Built by The Testing Academy · Apache-2.0</p>
                    <div style={{ marginTop: '14px' }}>
                        <PHBadge />
                    </div>
                </div>

                <nav className="footer__col" aria-label="Product">
                    <h4>Product</h4>
                    <a href="/features">Features</a>
                    <a href="/pricing">Pricing</a>
                    <a href="/learn">Learn</a>
                    <a href="/math.html">Cost calculator</a>
                    <a href="/dashboard">Dashboard</a>
                </nav>

                <nav className="footer__col" aria-label="Resources">
                    <h4>Resources</h4>
                    <a href="/case-study">Case study</a>
                    <a href="/blog">Blog</a>
                    <a href="/faq">FAQ</a>
                    <a href="/changelog">Changelog</a>
                    <a href="https://www.npmjs.com/package/browserbash-cli" target="_blank" rel="noopener noreferrer">npm</a>
                    <a href="https://www.producthunt.com/products/browserbash" target="_blank" rel="noopener noreferrer">Product Hunt ↗</a>
                    <a href="/feed.xml">RSS</a>
                </nav>

                <nav className="footer__col" aria-label="Company">
                    <h4>Company</h4>
                    <a href="/about">About</a>
                    <a href="/contact">Contact</a>
                    <a href="/brand">Brand &amp; press</a>
                    <a href="https://thetestingacademy.com" target="_blank" rel="noopener noreferrer">The Testing Academy</a>
                </nav>

                <nav className="footer__col" aria-label="Legal">
                    <h4>Legal</h4>
                    <a href="/privacy">Privacy</a>
                    <a href="/terms">Terms</a>
                    <a href="/cookies">Cookies</a>
                    <a href="/security">Security</a>
                    <a href="/refunds">Refunds</a>
                </nav>
            </div>
            <div className="container footer__bar">
                <span>© {year} BrowserBash · The Testing Academy</span>
                <span className="footer__bar-links">
                    <a href="/privacy">Privacy</a>
                    <a href="/terms">Terms</a>
                    <a href="/security">Security</a>
                </span>
            </div>
        </footer>
    );
}
