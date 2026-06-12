import { test, expect, type Page } from '@playwright/test';

/**
 * The Counter fetches /api/stats on mount, which makes it a reliable
 * "React has hydrated" signal — interacting earlier loses input to the
 * hydration swap.
 */
async function gotoHydrated(page: Page): Promise<void> {
    const mounted = page.waitForRequest('**/api/stats', { timeout: 15000 });
    await page.goto('/');
    await mounted;
}

test.describe('landing page', () => {
    test('renders hero, demo terminal and sections', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Plain English in');
        await expect(page.locator('.hero__install code')).toContainText('npm install -g browserbash-cli');
        await expect(page.locator('#demo .terminal')).toBeVisible();
        await expect(page.locator('#features .feature')).toHaveCount(6);
    });

    test('waitlist submit success shows position', async ({ page }) => {
        await page.route('**/api/waitlist', (route) =>
            route.fulfill({ json: { position: 42, already: false } }),
        );
        await gotoHydrated(page);
        await page.getByLabel('Email address').fill('qa@example.com');
        await page.getByRole('button', { name: 'Join waitlist' }).click();
        await expect(page.locator('.wl--success')).toContainText('#42');
    });

    test('duplicate email shows already-on-list state', async ({ page }) => {
        await page.route('**/api/waitlist', (route) =>
            route.fulfill({ json: { position: 7, already: true } }),
        );
        await gotoHydrated(page);
        await page.getByLabel('Email address').fill('dup@example.com');
        await page.getByRole('button', { name: 'Join waitlist' }).click();
        await expect(page.locator('.wl--success')).toContainText('Already on the list');
    });

    test('API error shows retry message', async ({ page }) => {
        await page.route('**/api/waitlist', (route) =>
            route.fulfill({ status: 503, json: { error: 'Could not save right now — please retry.' } }),
        );
        await gotoHydrated(page);
        await page.getByLabel('Email address').fill('err@example.com');
        await page.getByRole('button', { name: 'Join waitlist' }).click();
        await expect(page.locator('.wl__error')).toContainText('retry');
    });

    test('counter shows when stats available, hides when null', async ({ page }) => {
        await page.route('**/api/stats', (route) => route.fulfill({ json: { count: 128 } }));
        await gotoHydrated(page);
        await expect(page.locator('.counter')).toContainText('128');

        await page.unroute('**/api/stats');
        await page.route('**/api/stats', (route) => route.fulfill({ json: { count: null } }));
        await gotoHydrated(page);
        await expect(page.locator('.counter')).toHaveCount(0);
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
        // Without Clerk keys: 404. With keys: redirected to the Clerk sign-in page.
        const status = res?.status() ?? 0;
        const onClerkSignIn = /accounts\.dev|clerk/.test(page.url());
        expect(status === 404 || onClerkSignIn).toBe(true);
        await expect(page.locator('.dash__table')).toHaveCount(0);
    });

    test('SEO artifacts respond', async ({ request }) => {
        for (const p of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/og.png']) {
            const r = await request.get(p);
            expect(r.status(), p).toBe(200);
        }
    });
});
