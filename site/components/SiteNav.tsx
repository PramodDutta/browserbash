import { Bo } from '@/components/Bo';

/**
 * Shared top nav for marketing + legal pages (the landing keeps its own A/B
 * variant nav). Brand → home, key product links, and the auth CTAs so every
 * page can convert.
 */
export function SiteNav() {
    return (
        <nav className="nav container">
            <a href="/" className="nav__brand">
                <Bo size={26} interactive={false} pose="idle" />
                <span>BrowserBash</span>
            </a>
            <div className="nav__links">
                <a href="/features">Features</a>
                <a href="/pricing">Pricing</a>
                <a href="/case-study">Case study</a>
                <a href="/learn">Learn</a>
                <a href="/blog">Blog</a>
                <a href="/math.html">Cost</a>
            </div>
            <div className="nav__auth">
                <a className="pixel-btn ghost nav__login" href="/sign-in">Log in</a>
                <a className="pixel-btn nav__signup" href="/sign-up">Sign up free</a>
            </div>
        </nav>
    );
}
