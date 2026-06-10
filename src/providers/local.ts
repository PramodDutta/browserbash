import { chromium } from 'playwright-core';
import type { BrowserProvider, ProviderConnectOptions, ProviderSession } from './types.js';

/**
 * Local provider — launches the system-installed Chrome stable channel
 * (no bundled browser download needed, same requirement as kane-cli).
 */
export const localProvider: BrowserProvider = {
    id: 'local',
    description: 'System Google Chrome (stable channel) on this machine',

    async connect(options: ProviderConnectOptions): Promise<ProviderSession> {
        const browser = await chromium.launch({
            channel: 'chrome',
            headless: options.headless,
        });
        const context = await browser.newContext();
        const page = await context.newPage();
        return {
            browser,
            page,
            close: async (): Promise<void> => {
                await browser.close();
            },
        };
    },
};
