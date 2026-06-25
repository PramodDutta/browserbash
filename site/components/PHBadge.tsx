/**
 * Official Product Hunt badge → the live BrowserBash listing. Uses PH's embed
 * image (product_id 1253854), so the badge state stays current. Rendered in the
 * landing hero and the site-wide footer.
 */
export function PHBadge() {
    return (
        <a
            href="https://www.producthunt.com/products/browserbash/reviews/new?utm_source=badge-product_review&utm_medium=badge&utm_source=badge-browserbash"
            target="_blank"
            rel="noopener noreferrer"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="https://api.producthunt.com/widgets/embed-image/v1/product_review.svg?product_id=1253854&theme=light"
                alt="BrowserBash - CLI that turns plain-English into real browser tests | Product Hunt"
                width={250}
                height={54}
                style={{ width: '250px', height: '54px' }}
            />
        </a>
    );
}
