import { test, expect, type Page } from '@playwright/test';

/**
 * The landing page is mostly server-rendered; the interactive bits (TryIt
 * tabs, Terminal autoplay) need React to hydrate first. Waiting for the demo
 * terminal to paint plus a network-idle settle is a reliable "hydrated" proxy
 * now that the waitlist Counter (which used to fetch /api/stats) is gone.
 */
async function gotoHydrated(page: Page): Promise<void> {
    await page.goto('/');
    await page.locator('#demo .terminal').waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
}

test.describe('landing page', () => {
    test('renders hero, demo terminal and sections', async ({ page }) => {
        await page.goto('/');
        // Both A/B variants are in the static DOM; assert against the visible control (A).
        await expect(page.locator('.hero__copy--a h1')).toContainText('Plain English in');
        await expect(page.locator('.hero__copy--a .hero__install code')).toContainText('npm install -g browserbash-cli');
        await expect(page.locator('#demo .terminal')).toBeVisible();
        await expect(page.locator('#features .feature')).toHaveCount(6);
    });

    test('hero CTA and nav route to the free sign-up / log-in', async ({ page }) => {
        await page.goto('/');
        // Both A/B variants are in the static DOM; A (control) is visible by default.
        const cta = page.locator('.hero__copy--a .hero__cta-go');
        await expect(cta).toContainText('Create your free account');
        await expect(cta).toHaveAttribute('href', /\/sign-up/);
        // Sign up + Log in are clearly visible in the nav.
        await expect(page.locator('.nav__signup')).toHaveAttribute('href', '/sign-up');
        await expect(page.locator('.nav__login')).toHaveAttribute('href', '/sign-in');
        // No waitlist form remains; pricing is a normal nav destination now.
        await expect(page.locator('.wl, .counter')).toHaveCount(0);
        await expect(page.locator('.nav__links a[href="/pricing"]')).toHaveCount(1);
    });

    test('sign-up and sign-in pages render', async ({ page }) => {
        await page.goto('/sign-up');
        await expect(page.locator('.authpage__title')).toContainText('Create your free account');
        await page.goto('/sign-in');
        await expect(page.locator('.authpage__title')).toContainText('Welcome back');
    });

    test('try-it switches recordings', async ({ page }) => {
        await gotoHydrated(page);
        await page.getByRole('tab', { name: 'Extract a heading' }).click();
        await expect(page.locator('#try .terminal')).toContainText('example.com', { timeout: 10000 });
    });

    test('terminal NDJSON tab shows raw events', async ({ page }) => {
        await gotoHydrated(page);
        const demo = page.locator('#demo .terminal');
        await demo.scrollIntoViewIfNeeded();
        await demo.getByRole('tab', { name: '--agent NDJSON' }).click();
        await expect(demo.locator('.t-raw').first()).toContainText('"type":"step"', { timeout: 15000 });
    });

    test('dashboard is never exposed to anonymous visitors', async ({ page }) => {
        const res = await page.goto('/dashboard');
        // Without Clerk keys: 404. With keys: proxy.ts redirects logged-out
        // visitors to the sign-in page (local /sign-in or a Clerk domain).
        const status = res?.status() ?? 0;
        const onSignIn = /\/sign-in|accounts\.dev|clerk/.test(page.url());
        expect(status === 404 || onSignIn).toBe(true);
        await expect(page.locator('.dash__runs')).toHaveCount(0);
    });

    test('SEO artifacts respond', async ({ request }) => {
        for (const p of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/og.png']) {
            const r = await request.get(p);
            expect(r.status(), p).toBe(200);
        }
    });
});
