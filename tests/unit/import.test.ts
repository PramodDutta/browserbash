import { describe, expect, it } from 'vitest';
import { convertPlaywrightSpec, renderImportReport, renderTestMd, testFileName } from '../../src/import/playwright.js';

const SPEC = `
import { test, expect } from '@playwright/test';

test.describe('TTACart checkout', () => {
  test('logs in and buys a shirt', async ({ page }) => {
    await page.goto('https://app.example.com/login');
    await page.getByLabel('Email').fill(process.env.TTA_USER);
    await page.getByPlaceholder('Password').fill(process.env.TTA_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/inventory/);
    await page.getByText('Add to cart').click();
    await page.getByRole('link', { name: 'Cart' }).click();
    await expect(page.getByRole('heading', { name: 'Your Cart' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 999));
  });

  test('legacy selectors still convert', async ({ page }) => {
    await page.click('#submit');
    await page.fill('#qty', '2');
    await page.getByLabel('Country').selectOption('India');
    await page.getByRole('textbox', { name: 'Search' }).press('Enter');
  });
});
`;

describe('convertPlaywrightSpec', () => {
    const result = convertPlaywrightSpec(SPEC, 'e2e/checkout.spec.ts');

    it('extracts describe, tests and ordered steps', () => {
        expect(result.describe).toBe('TTACart checkout');
        expect(result.tests).toHaveLength(2);
        expect(result.tests[0].steps).toEqual([
            'Open https://app.example.com/login',
            "Type '{{TTA_USER}}' into the 'Email' field",
            "Type '{{TTA_PASSWORD}}' into the field with placeholder 'Password'",
            "Click the 'Sign in' button",
            "Verify the URL contains 'inventory'",
            "Click 'Add to cart'",
            "Click the 'Cart' link",
            "Verify the 'Your Cart' heading is visible",
        ]);
    });

    it('converts legacy selector calls and key presses', () => {
        expect(result.tests[1].steps).toEqual([
            'Click the element matching `#submit`',
            "Type '2' into the element matching `#qty`",
            "Select 'India' in the 'Country' field",
            "Press Enter in the 'Search' textbox",
        ]);
    });

    it('reports untranslatable lines instead of dropping them', () => {
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].code).toContain('page.evaluate');
    });

    it('collects env vars as variables', () => {
        expect(result.variables).toEqual(['TTA_PASSWORD', 'TTA_USER']);
    });
});

describe('rendering', () => {
    it('renders a runnable test file with provenance comment', () => {
        const md = renderTestMd({ title: 'Login', steps: ['Open https://x.dev', 'Click the button'] }, 'a.spec.ts');
        expect(md).toContain('# Login');
        expect(md).toContain('- Open https://x.dev');
        expect(md).toContain('browserbash import');
    });

    it('marks secret-looking variables secret in the report', () => {
        const report = renderImportReport([convertPlaywrightSpec(SPEC, 'a.spec.ts')]);
        expect(report).toContain('"TTA_PASSWORD": {');
        expect(report).toContain('"secret": true');
        expect(report).toContain('"TTA_USER": "change-me"');
    });

    it('slugs filenames', () => {
        expect(testFileName('Logs in & buys a shirt!')).toBe('logs_in_buys_a_shirt_test.md');
    });
});
