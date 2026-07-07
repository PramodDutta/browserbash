import { chromium } from 'playwright-core';
import { playwrightContextOptions, type BrowserProvider, type ProviderConnectOptions, type ProviderSession } from './types.js';

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
        // Auth/viewport require a FRESH context (storageState cannot be
        // applied to an existing one), so only reuse when nothing was asked.
        const wantsFresh = Boolean(options.context?.storageStatePath || options.context?.viewport);
        const context = wantsFresh
            ? await browser.newContext(playwrightContextOptions(options.context))
            : browser.contexts()[0] ?? (await browser.newContext());
        const page = (wantsFresh ? undefined : context.pages()[0]) ?? (await context.newPage());
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
