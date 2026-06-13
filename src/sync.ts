import { readFile } from 'node:fs/promises';
import type { BrowserBashConfig } from './config.js';
import type { RunArtifacts, RunResult, VariableValue } from './types.js';
import { maskSecretRecord, maskSecrets } from './variables.js';

export const CLI_VERSION = '1.3.0';

const ARTIFACT_TYPES: Array<{ kind: 'screenshot' | 'video' | 'trace'; contentType: string }> = [
    { kind: 'screenshot', contentType: 'image/png' },
    { kind: 'video', contentType: 'video/webm' },
    { kind: 'trace', contentType: 'application/zip' },
];

async function uploadArtifacts(
    base: string,
    apiKey: string,
    runId: number,
    artifacts: RunArtifacts,
    log: (msg: string) => void,
): Promise<void> {
    for (const { kind, contentType } of ARTIFACT_TYPES) {
        const path = artifacts[kind];
        if (!path) continue;
        try {
            const data = await readFile(path);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30_000);
            const res = await fetch(`${base}/api/runs/${runId}/artifacts?kind=${kind}`, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': contentType, Authorization: `Bearer ${apiKey}` },
                body: data,
            });
            clearTimeout(timer);
            if (res.ok) log(`Uploaded ${kind} to dashboard`);
            else log(`${kind} upload skipped: ${res.status}`);
        } catch {
            log(`${kind} upload skipped (network/file)`);
        }
    }
}

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
        // 10s, not 4s: a fresh CLI process hits cold TLS + a serverless cold
        // start. Still fire-and-forget — a slow sync never blocks the verdict.
        const timer = setTimeout(() => controller.abort(), 10_000);
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
                final_state: maskSecretRecord(result.finalState, vars),
                cli_version: CLI_VERSION,
            }),
        });
        clearTimeout(timer);
        if (res.ok) {
            log(`Run synced to dashboard (${base}/dashboard)`);
            const data = (await res.json().catch(() => ({}))) as { runId?: number };
            if (data.runId && result.artifacts) {
                await uploadArtifacts(base, apiKey, data.runId, result.artifacts, log);
            }
        } else if (res.status === 401) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            log(`Dashboard sync skipped: ${body.error ?? 'key rejected — reconnect with a fresh key'}`);
        } else {
            log(`Dashboard sync skipped: ${res.status} — check 'browserbash connect'`);
        }
    } catch {
        log('Dashboard sync skipped (network) — run result unaffected');
    }
}
