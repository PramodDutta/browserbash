import type { BrowserProvider, ProviderSession } from './types.js';

/**
 * Browserbase cloud provider — handled natively by the Stagehand engine
 * (env BROWSERBASE). Listed here so it shows up in `browserbash providers`;
 * the builtin engine cannot drive it.
 */
export const browserbaseProvider: BrowserProvider = {
    id: 'browserbase',
    description: 'Browserbase cloud browsers (Stagehand engine only; BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID)',

    connect(): Promise<ProviderSession> {
        return Promise.reject(
            new Error('browserbase provider requires the stagehand engine: --engine stagehand (default)'),
        );
    },
};
