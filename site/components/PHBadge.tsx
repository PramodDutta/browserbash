/**
 * Official Product Hunt "Featured" badge → the live BrowserBash launch
 * (post_id 1178826). Renders PH's embed image with the live upvote count, in
 * the landing hero and the site-wide footer.
 */
export function PHBadge() {
    return (
        <a
            href="https://www.producthunt.com/products/browserbash?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-browserbash"
            target="_blank"
            rel="noopener noreferrer"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1178826&theme=light"
                alt="BrowserBash - CLI that turns plain-English into real browser tests | Product Hunt"
                width={250}
                height={54}
                style={{ width: '250px', height: '54px' }}
            />
        </a>
    );
}
