/**
 * "Featured on Product Hunt" badge → the live PH listing. Styled to match the
 * official badge (PH coral, P mark, upvote chevron). No hardcoded vote count so
 * it never goes stale — swap this for PH's official embed-image SVG (needs the
 * launch's numeric post_id) if you want the live count rendered.
 */
const PH_URL = 'https://www.producthunt.com/products/browserbash';
const PH_CORAL = '#ff6154';

export function PHBadge() {
    return (
        <a
            href={PH_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="BrowserBash — featured on Product Hunt"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: '#ffffff',
                border: `1.5px solid ${PH_CORAL}`,
                borderRadius: '10px',
                padding: '7px 14px',
                textDecoration: 'none',
                fontFamily: 'var(--font-body, sans-serif)',
                lineHeight: 1,
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: PH_CORAL,
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px',
                }}
            >
                P
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '9px', letterSpacing: '1.2px', color: PH_CORAL, fontWeight: 600 }}>
                    FEATURED ON
                </span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: PH_CORAL }}>Product Hunt</span>
            </span>
            <span aria-hidden="true" style={{ marginLeft: '4px', fontSize: '12px', color: PH_CORAL }}>
                ▲
            </span>
        </a>
    );
}
