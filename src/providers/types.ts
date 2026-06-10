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

export interface ProviderConnectOptions {
    headless: boolean;
    name: string;
    cdpEndpoint?: string;
    config: BrowserBashConfig;
}

export interface BrowserProvider {
    readonly id: string;
    readonly description: string;
    connect(options: ProviderConnectOptions): Promise<ProviderSession>;
}
