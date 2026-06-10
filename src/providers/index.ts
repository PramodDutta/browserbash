import { browserstackProvider } from './browserstack.js';
import { cdpProvider } from './cdp.js';
import { lambdatestProvider } from './lambdatest.js';
import { localProvider } from './local.js';
import type { BrowserProvider } from './types.js';

const REGISTRY: Record<string, BrowserProvider> = {
    [localProvider.id]: localProvider,
    [cdpProvider.id]: cdpProvider,
    [lambdatestProvider.id]: lambdatestProvider,
    [browserstackProvider.id]: browserstackProvider,
};

export function getProvider(id: string): BrowserProvider {
    const provider = REGISTRY[id];
    if (!provider) {
        throw new Error(`Unknown provider '${id}'. Available: ${listProviders().map((p) => p.id).join(', ')}`);
    }
    return provider;
}

export function listProviders(): BrowserProvider[] {
    return Object.values(REGISTRY);
}
