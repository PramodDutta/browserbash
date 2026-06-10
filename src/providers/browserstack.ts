import { chromium } from 'playwright-core';
import { resolveCredentials } from '../config.js';
import type { BrowserProvider, ProviderConnectOptions, ProviderSession } from './types.js';

/**
 * BrowserStack Automate provider.
 * Auth: BROWSERSTACK_USERNAME + BROWSERSTACK_ACCESS_KEY env vars,
 * or `browserbash login --provider browserstack`.
 */
export const browserstackProvider: BrowserProvider = {
    id: 'browserstack',
    description: 'BrowserStack Automate cloud browser grid',

    async connect(options: ProviderConnectOptions): Promise<ProviderSession> {
        const creds = resolveCredentials('browserstack', options.config);
        if (!creds.username || !creds.accessKey) {
            throw new Error('BrowserStack credentials missing. Set BROWSERSTACK_USERNAME/BROWSERSTACK_ACCESS_KEY or run: browserbash login --provider browserstack');
        }

        const caps = {
            browser: 'chrome',
            browser_version: 'latest',
            os: 'Windows',
            os_version: '11',
            name: options.name,
            build: 'browserbash-cli',
            'browserstack.username': creds.username,
            'browserstack.accessKey': creds.accessKey,
        };

        const wsEndpoint = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
        const browser = await chromium.connect(wsEndpoint);
        const context = await browser.newContext();
        const page = await context.newPage();

        return {
            browser,
            page,
            testUrl: 'https://automate.browserstack.com/dashboard',
            reportStatus: async (status, remark): Promise<void> => {
                // BrowserStack executor protocol — JS sentinel evaluated by their proxy.
                const executor = JSON.stringify({
                    action: 'setSessionStatus',
                    arguments: { status, reason: remark },
                });
                await page
                    .evaluate((_arg) => undefined, `browserstack_executor: ${executor}`)
                    .catch(() => undefined);
            },
            close: async (): Promise<void> => {
                await browser.close();
            },
        };
    },
};
