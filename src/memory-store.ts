import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Cross-run memory: a local history of how each test behaves. Deliberately
 * thin. The action cache is the memory that saves work; this is the memory
 * that informs scheduling. The competitor scan is clear that site graphs and
 * embedding memories are unshipped everywhere, while duration-ordering and
 * flaky tracking are what production runners actually use.
 *
 * Single-writer discipline: in suite mode the orchestrator (parent) is the
 * only writer. A single `run` updates it directly. Children never touch it.
 */

export const MEMORY_SCHEMA_VERSION = 1;

export type TestVerdict = 'passed' | 'failed' | 'infra' | 'timeout';

export interface TestHistory {
    path: string;
    runs: number;
    passes: number;
    heals: number;
    flaky: number;
    ewmaDurationMs: number;
    lastStatus: TestVerdict;
    lastRunAt: string;
}

export interface MemoryFile {
    v: number;
    tests: Record<string, TestHistory>;
}

const EWMA_ALPHA = 0.3;

export function memoryPath(dir: string): string {
    return path.resolve(dir, 'memory', 'history.json');
}

/** Stable per-test key: hash of the repo-relative-ish path (basename kept readable). */
export function testKey(testPath: string): string {
    return createHash('sha256').update(path.resolve(testPath)).digest('hex').slice(0, 16);
}

export function loadMemory(file: string): MemoryFile {
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as MemoryFile;
        if (raw.v === MEMORY_SCHEMA_VERSION && raw.tests && typeof raw.tests === 'object') return raw;
    } catch {
        // fresh or unreadable
    }
    return { v: MEMORY_SCHEMA_VERSION, tests: {} };
}

export function saveMemory(file: string, mem: MemoryFile): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(mem, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, file);
}

export interface RecordInput {
    testPath: string;
    verdict: TestVerdict;
    durationMs: number;
    flaky?: boolean;
    healed?: boolean;
    nowIso: string;
}

/** Fold one outcome into the history (pure: returns a new file object). */
export function recordOutcome(mem: MemoryFile, input: RecordInput): MemoryFile {
    const key = testKey(input.testPath);
    const prev = mem.tests[key];
    const runs = (prev?.runs ?? 0) + 1;
    const passes = (prev?.passes ?? 0) + (input.verdict === 'passed' ? 1 : 0);
    const ewma = prev
        ? Math.round(EWMA_ALPHA * input.durationMs + (1 - EWMA_ALPHA) * prev.ewmaDurationMs)
        : input.durationMs;
    const next: TestHistory = {
        path: input.testPath,
        runs,
        passes,
        heals: (prev?.heals ?? 0) + (input.healed ? 1 : 0),
        flaky: (prev?.flaky ?? 0) + (input.flaky ? 1 : 0),
        ewmaDurationMs: ewma,
        lastStatus: input.verdict,
        lastRunAt: input.nowIso,
    };
    return { ...mem, tests: { ...mem.tests, [key]: next } };
}

/**
 * Order test files for the next run: previously-failed first (fail fast on the
 * known-bad), then longest-average duration first (so the slow ones start
 * early and do not tail the suite), then unknown tests, then the rest by name.
 */
export function orderTests(files: string[], mem: MemoryFile): string[] {
    const rank = (f: string): [number, number] => {
        const h = mem.tests[testKey(f)];
        if (!h) return [1, 0]; // unknown: middle band, after known-failed
        const failedLast = h.lastStatus !== 'passed' ? 0 : 2;
        return [failedLast, -h.ewmaDurationMs];
    };
    return [...files].sort((a, b) => {
        const [ra, da] = rank(a);
        const [rb, db] = rank(b);
        if (ra !== rb) return ra - rb;
        if (da !== db) return da - db;
        return path.basename(a).localeCompare(path.basename(b));
    });
}

/** Tests that have flaked at least once, most-flaky first (quarantine report). */
export function flakyReport(mem: MemoryFile): TestHistory[] {
    return Object.values(mem.tests)
        .filter((t) => t.flaky > 0)
        .sort((a, b) => b.flaky - a.flaky);
}
