import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './config.js';
import { maskSecretRecord, maskSecrets } from './variables.js';
import type { RunResult, VariableValue } from './types.js';

/**
 * On-disk store of runs under ~/.browserbash/runs/<id>/, powering the free,
 * fully-local `browserbash dashboard`. One directory per run holding meta.json
 * plus any recorded artifacts. Secrets are masked before they ever touch disk.
 * Capped at MAX_RUNS — oldest pruned — so it never grows without bound.
 */

const MAX_RUNS = 200;

const ARTIFACT_FILES: Record<'screenshot' | 'video' | 'trace', string> = {
    screenshot: 'screenshot.png',
    video: 'video.webm',
    trace: 'trace.zip',
};

export interface LocalRun {
    id: string;
    objective: string;
    status: string;
    durationMs: number;
    stepsExecuted: number;
    provider: string;
    model: string;
    finalState: Record<string, string>;
    testUrl?: string;
    startedAt: string;
    artifacts: { screenshot: boolean; video: boolean; trace: boolean };
}

export function runsDir(): string {
    return path.join(configDir(), 'runs');
}

function runDir(id: string): string {
    return path.join(runsDir(), id);
}

/** Same-millisecond runs need a monotonic tiebreaker so ids stay time-sortable. */
let runSeq = 0;

/** Persist a finished run. Returns the new run id, or null if writing failed
 * (a local-store hiccup must never fail a passing test). */
export function persistRun(input: {
    objective: string;
    result: RunResult;
    provider: string;
    model: string;
    variables: Record<string, VariableValue>;
}): string | null {
    try {
        const { objective, result, provider, model, variables } = input;
        runSeq = (runSeq + 1) % 46656; // 36^3, three base36 digits
        const seq = runSeq.toString(36).padStart(3, '0');
        const id = `${Date.now().toString().padStart(13, '0')}-${seq}${Math.random().toString(36).slice(2, 8)}`;
        const dir = runDir(id);
        fs.mkdirSync(dir, { recursive: true });

        const artifacts = { screenshot: false, video: false, trace: false };
        for (const kind of ['screenshot', 'video', 'trace'] as const) {
            const src = result.artifacts?.[kind];
            if (src && fs.existsSync(src)) {
                try {
                    fs.copyFileSync(src, path.join(dir, ARTIFACT_FILES[kind]));
                    artifacts[kind] = true;
                } catch {
                    // skip an unreadable artifact, keep the rest of the run
                }
            }
        }

        const meta: LocalRun = {
            id,
            objective: maskSecrets(objective, variables).slice(0, 2000),
            status: result.status,
            durationMs: result.durationMs,
            stepsExecuted: result.stepsExecuted,
            provider,
            model,
            finalState: maskSecretRecord(result.finalState, variables),
            testUrl: result.testUrl,
            startedAt: new Date().toISOString(),
            artifacts,
        };
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

        prune();
        return id;
    } catch {
        return null;
    }
}

function prune(): void {
    const ids = listIds();
    for (const id of ids.slice(MAX_RUNS)) {
        try {
            fs.rmSync(runDir(id), { recursive: true, force: true });
        } catch {
            // best-effort
        }
    }
}

/** Run ids, newest first (ids are time-sortable). */
function listIds(): string[] {
    try {
        return fs
            .readdirSync(runsDir(), { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

export function listRuns(): LocalRun[] {
    return listIds()
        .map((id) => getRun(id))
        .filter((r): r is LocalRun => r !== null);
}

export function getRun(id: string): LocalRun | null {
    try {
        const raw = fs.readFileSync(path.join(runDir(id), 'meta.json'), 'utf-8');
        return JSON.parse(raw) as LocalRun;
    } catch {
        return null;
    }
}

/** Absolute path to a stored artifact file, or null if absent. */
export function artifactPath(id: string, kind: 'screenshot' | 'video' | 'trace'): string | null {
    // Guard against path traversal in the id segment.
    if (!/^[0-9]{13}-[a-z0-9]{1,12}$/.test(id)) return null;
    const file = path.join(runDir(id), ARTIFACT_FILES[kind]);
    return fs.existsSync(file) ? file : null;
}

export function clearRuns(): number {
    const ids = listIds();
    for (const id of ids) {
        try {
            fs.rmSync(runDir(id), { recursive: true, force: true });
        } catch {
            // best-effort
        }
    }
    return ids.length;
}
