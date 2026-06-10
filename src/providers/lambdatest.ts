import { chromium } from 'playwright-core';
import { resolveCredentials } from '../config.js';
import type { BrowserProvider, ProviderConnectOptions, ProviderSession } from './types.js';

/**
 * LambdaTest / TestMu AI cloud grid provider.
 * Auth: LT_USERNAME + LT_ACCESS_KEY env vars, or `browserbash login --provider lambdatest`.
 */
export const lambdatestProvider: BrowserProvider = {
    id: 'lambdatest',
    description: 'LambdaTest (TestMu AI) cloud browser grid',

    async connect(options: ProviderConnectOptions): Promise<ProviderSession> {
        const creds = resolveCredentials('lambdatest', options.config);
        if (!creds.username || !creds.accessKey) {
            throw new Error('LambdaTest credentials missing. Set LT_USERNAME/LT_ACCESS_KEY or run: browserbash login --provider lambdatest');
        }

        const capabilities = {
            browserName: 'Chrome',
            browserVersion: 'latest',
            'LT:Options': {
                platform: 'Windows 11',
                build: 'browserbash-cli',
                name: options.name,
                user: creds.username,
                accessKey: creds.accessKey,
                network: true,
                video: true,
                console: true,
                headless: options.headless,
            },
        };

        const wsEndpoint = `wss://cdp.lambdatest.com/playwright?capabilities=${encodeURIComponent(JSON.stringify(capabilities))}`;
        const browser = await chromium.connect(wsEndpoint);
        const context = await browser.newContext();
        const page = await context.newPage();

        return {
            browser,
            page,
            testUrl: 'https://automation.lambdatest.com/build',
            reportStatus: async (status, remark): Promise<void> => {
                // LambdaTest in-session status hook (documented lambdatest_action protocol).
                const action = JSON.stringify({ action: 'setTestStatus', arguments: { status, remark } });
                await page
                    .evaluate((_arg) => undefined, `lambdatest_action: ${action}`)
                    .catch(() => undefined);
            },
            close: async (): Promise<void> => {
                await browser.close();
            },
        };
    },
};
