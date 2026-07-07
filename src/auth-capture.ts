import readline from 'node:readline';
import { chromium } from 'playwright-core';
import { saveAuthProfile, type AuthProfile } from './auth-store.js';

/**
 * Interactive login capture for `browserbash auth save <name>`:
 * open a visible browser, let the human log in, then persist the
 * context's storageState as a reusable profile.
 */
export async function captureAuthProfile(name: string, startUrl: string | undefined): Promise<AuthProfile> {
    const browser = await chromium.launch({ channel: 'chrome', headless: false });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        if (startUrl) {
            await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        }
        process.stderr.write(
            '\nA browser window is open. Log in to the app there.\n' +
            'When you are logged in, come back here and press Enter to save the session.\n',
        );
        await waitForEnter();
        const state = await context.storageState();
        return saveAuthProfile(name, state, new Date().toISOString());
    } finally {
        await browser.close().catch(() => undefined);
    }
}

function waitForEnter(): Promise<void> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
        rl.question('', () => {
            rl.close();
            resolve();
        });
    });
}
