import { chromium } from 'playwright-core';
import type { BrowserProvider, ProviderConnectOptions, ProviderSession } from './types.js';

/**
 * Local provider — launches the system-installed Chrome stable channel
 * (no bundled browser download needed).
 */
export const localProvider: BrowserProvider = {
    id: 'local',
    description: 'System Google Chrome (stable channel) on this machine',

    async connect(options: ProviderConnectOptions): Promise<ProviderSession> {
        const browser = await chromium.launch({
            channel: 'chrome',
            headless: options.headless,
        });
        const context = await browser.newContext({
            ...(options.context?.storageStatePath ? { storageState: options.context.storageStatePath } : {}),
            ...(options.context?.viewport ? { viewport: options.context.viewport } : {}),
        });
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
