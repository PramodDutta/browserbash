import type { BrowserBashConfig } from './config.js';
import type { RunResult, VariableValue } from './types.js';
import { maskSecrets } from './variables.js';

export const CLI_VERSION = '1.1.0';

/**
 * Pushes a finished run to the BrowserBash dashboard. Strictly opt-in:
 * does nothing unless the user stored an API key via `browserbash connect`.
 * Never throws and never delays exit by more than the timeout — a failed
 * sync must not fail a passing test.
 */
export async function syncRun(
    config: BrowserBashConfig,
    objective: string,
    result: RunResult,
    vars: Record<string, VariableValue>,
    provider: string,
    model: string,
    log: (msg: string) => void,
): Promise<void> {
    const apiKey = config.apiKey;
    if (!apiKey) return;
    const base = (config.apiBase ?? 'https://browserbash.com').replace(/\/$/, '');

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${base}/api/runs`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                objective: maskSecrets(objective, vars).slice(0, 2000),
                status: result.status,
                duration_ms: result.durationMs,
                steps_executed: result.stepsExecuted,
                provider,
                model,
                final_state: result.finalState,
                cli_version: CLI_VERSION,
            }),
        });
        clearTimeout(timer);
        if (res.ok) {
            log(`Run synced to dashboard (${base}/dashboard)`);
        } else {
            log(`Dashboard sync skipped: ${res.status} — check 'browserbash connect'`);
        }
    } catch {
        log('Dashboard sync skipped (network) — run result unaffected');
    }
}
