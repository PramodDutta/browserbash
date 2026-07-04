import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright-core';

/**
 * Native Playwright tracing for the builtin engine. Best-effort: if a provider
 * (e.g. a bare CDP attach) does not support context tracing, we skip it rather
 * than fail the run. The saved trace.zip opens at trace.playwright.dev.
 */
export interface TraceHandle {
    stop(): Promise<{ trace?: string; screenshot?: string }>;
}

export async function startTrace(page: Page): Promise<TraceHandle | undefined> {
    try {
        const context = page.context();
        await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    } catch {
        return undefined; // tracing unsupported on this context
    }
    return {
        async stop() {
            const dir = mkdtempSync(join(tmpdir(), 'bb-trace-'));
            const out: { trace?: string; screenshot?: string } = {};
            try {
                const tracePath = join(dir, 'trace.zip');
                await page.context().tracing.stop({ path: tracePath });
                out.trace = tracePath;
            } catch {
                // tracing.stop can throw if the context is already closing
            }
            try {
                const shot = join(dir, 'screenshot.png');
                await page.screenshot({ path: shot });
                out.screenshot = shot;
            } catch {
                // page may be gone; a missing screenshot is not fatal
            }
            return out;
        },
    };
}
