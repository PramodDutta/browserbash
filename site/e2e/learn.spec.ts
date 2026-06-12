import { test, expect } from '@playwright/test';

test.describe('learn page', () => {
    test('renders tutorial and all scenarios', async ({ page }) => {
        await page.goto('/learn');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('From zero to bashing browsers');
        await expect(page.locator('.tut__step')).toHaveCount(7);
        await expect(page.locator('.ch__card')).toHaveCount(12);
        await expect(page.locator('#llm')).toContainText('OpenRouter');
    });

    test('difficulty filter narrows the grid', async ({ page }) => {
        await page.goto('/learn');
        await page.getByRole('tab', { name: /advanced/ }).click();
        await expect(page.locator('.ch__card')).toHaveCount(4);
        await expect(page.locator('.ch__badge--advanced').first()).toBeVisible();
    });

    test('hints toggle reveals expected outcome', async ({ page }) => {
        await page.goto('/learn');
        await page.locator('.ch__hints-toggle').first().click();
        await expect(page.locator('.ch__expected').first()).toContainText('Pass looks like');
    });

    test('nav links from landing to learn', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Learn' }).first().click();
        await expect(page).toHaveURL(/\/learn$/);
    });
});
