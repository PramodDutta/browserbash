import { chromium } from 'playwright-core';
import type { BrowserProvider, ProviderConnectOptions, ProviderSession } from './types.js';

/**
 * CDP provider — attaches to any already-running Chrome DevTools Protocol
 * endpoint (your own grid, a docker container, `chrome --remote-debugging-port`,
 * or a Playwright MCP-managed browser).
 */
export const cdpProvider: BrowserProvider = {
    id: 'cdp',
    description: 'Attach to an existing Chrome via --cdp-endpoint <ws:// or http:// url>',

    async connect(options: ProviderConnectOptions): Promise<ProviderSession> {
        if (!options.cdpEndpoint) {
            throw new Error('cdp provider requires --cdp-endpoint <url>');
        }
        const browser = await chromium.connectOverCDP(options.cdpEndpoint);
        const context = browser.contexts()[0] ?? (await browser.newContext());
        const page = context.pages()[0] ?? (await context.newPage());
        return {
            browser,
            page,
            close: async (): Promise<void> => {
                // Attached browser belongs to someone else — disconnect, don't kill.
                await browser.close();
            },
        };
    },
};
