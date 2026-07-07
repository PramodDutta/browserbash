import type { Browser, Page } from 'playwright-core';
import type { BrowserBashConfig } from '../config.js';

export interface ProviderSession {
    browser: Browser;
    page: Page;
    /** Vendor dashboard / report URL, if the provider has one. */
    testUrl?: string;
    /** Report pass/fail back to vendor (LambdaTest/BrowserStack status APIs). */
    reportStatus?(status: 'passed' | 'failed', remark: string): Promise<void>;
    close(): Promise<void>;
}

export interface ProviderContextOptions {
    /** Path to a Playwright storageState JSON (saved login session). */
    storageStatePath?: string;
    viewport?: { width: number; height: number };
}

export interface ProviderConnectOptions {
    headless: boolean;
    name: string;
    cdpEndpoint?: string;
    config: BrowserBashConfig;
    /** Options applied when the provider creates a fresh browser context. */
    context?: ProviderContextOptions;
}

export interface BrowserProvider {
    readonly id: string;
    readonly description: string;
    connect(options: ProviderConnectOptions): Promise<ProviderSession>;
}

/** Playwright newContext() options derived from the requested context options. */
export function playwrightContextOptions(context?: ProviderContextOptions): {
    storageState?: string;
    viewport?: { width: number; height: number };
} {
    return {
        ...(context?.storageStatePath ? { storageState: context.storageStatePath } : {}),
        ...(context?.viewport ? { viewport: context.viewport } : {}),
    };
}
