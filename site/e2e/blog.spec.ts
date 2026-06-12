import { test, expect } from '@playwright/test';

test.describe('blog', () => {
    test('index lists all 10 posts', async ({ page }) => {
        await page.goto('/blog');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Field notes');
        await expect(page.locator('.blog-card')).toHaveCount(10);
    });

    test('post renders markdown, FAQ schema and related links', async ({ page }) => {
        await page.goto('/blog/smoke-tests-in-plain-english');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Smoke Tests in Plain English');
        await expect(page.locator('.post__body pre').first()).toBeVisible();
        const faqLd = await page.locator('script[type="application/ld+json"]').allTextContents();
        expect(faqLd.some((s) => s.includes('FAQPage'))).toBe(true);
        await expect(page.locator('.post__cta')).toContainText('npm install -g browserbash-cli');
    });

    test('unknown slug 404s', async ({ page }) => {
        const res = await page.goto('/blog/not-a-real-post');
        expect(res?.status()).toBe(404);
    });

    test('landing links to blog', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Blog' }).first().click();
        await expect(page).toHaveURL(/\/blog$/);
    });
});
