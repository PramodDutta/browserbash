'use client';

import { sendGAEvent } from '@next/third-parties/google';

const COURSE_URL = 'https://class.thetestingacademy.com/ai-powered-testing-mastery';

/**
 * Education upsell: the free CLI is the tool, the AI Tester Blueprint course
 * is the optional deep-dive. Rendered on warm surfaces (the playbook the reader
 * just claimed, the pricing page). Kept honest: the product stays free, this is
 * a paid course from The Testing Academy for people who want the full craft.
 *
 * `variant="band"` is the wide standalone section; `variant="card"` slots into
 * a pixel-card grid next to the pricing tiers.
 */
export function CourseCTA({ variant = 'band', source = 'playbook' }: { variant?: 'band' | 'card'; source?: string }) {
    const track = () => {
        try {
            sendGAEvent('event', 'select_promotion', {
                promotion_name: 'ai_tester_blueprint',
                creative_slot: source,
            });
        } catch {
            // analytics must never affect the page
        }
    };

    if (variant === 'card') {
        return (
            <article className="pixel-card price-card course-card">
                <p className="course-card__eyebrow">Go deeper</p>
                <h3>AI Tester Blueprint</h3>
                <div className="price-amt">Course</div>
                <p>
                    The tool is free forever. This is the optional next step: a hands-on course from The Testing
                    Academy on building an AI-powered testing practice end to end, from first run to CI gates and
                    real agent workflows.
                </p>
                <ul>
                    <li>Design plain-English suites that hold up in CI</li>
                    <li>Wire agents and MCP into a real validation loop</li>
                    <li>Taught by Pramod Dutta, creator of BrowserBash</li>
                </ul>
                <a className="pixel-btn" href={COURSE_URL} target="_blank" rel="noopener" onClick={track}>
                    View the Blueprint &rarr;
                </a>
            </article>
        );
    }

    return (
        <section className="course-band">
            <div className="course-band__in">
                <p className="course-band__eyebrow">Ready to go from tool to craft?</p>
                <h2>The AI Tester Blueprint</h2>
                <p>
                    You have the free tool and the playbook. The Blueprint is the optional deep-dive: a full course
                    from The Testing Academy on running an AI-powered testing practice, from your first plain-English
                    test to agent-driven CI gates. Taught by the person who built BrowserBash.
                </p>
                <div className="mkt-cta">
                    <a className="pixel-btn pixel-btn--primary" href={COURSE_URL} target="_blank" rel="noopener" onClick={track}>
                        View the Blueprint &rarr;
                    </a>
                    <a className="pixel-btn" href="/learn">
                        Keep learning free
                    </a>
                </div>
            </div>
        </section>
    );
}
