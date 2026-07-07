import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Memory-aware concurrency. Playwright and friends size the pool by CPU count
 * only; a 500-test AI suite each owning a headless Chromium is memory bound, so
 * the pool is clamped by available RAM too. cgroup memory.max wins over
 * os.totalmem() because the latter reports the host inside containers.
 */
export function effectiveTotalMemBytes(): number {
    const host = os.totalmem();
    for (const p of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
        try {
            const raw = fs.readFileSync(p, 'utf-8').trim();
            if (raw && raw !== 'max') {
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0 && n < host) return n;
            }
        } catch {
            // not in a cgroup-limited container, or unreadable
        }
    }
    return host;
}

export interface ConcurrencyInputs {
    requested?: number;
    memoryBudgetMb: number;
    cpuCount?: number;
    totalMemBytes?: number;
}

/** min(requested, cpus, floor((effectiveTotal - 2GB reserve) / budget)), >= 1. */
export function computeConcurrency(inp: ConcurrencyInputs): { concurrency: number; reason: string } {
    const cpus = inp.cpuCount ?? os.cpus().length;
    const total = inp.totalMemBytes ?? effectiveTotalMemBytes();
    const reserve = 2 * 1024 ** 3;
    const budgetBytes = inp.memoryBudgetMb * 1024 ** 2;
    const memCap = Math.max(1, Math.floor((total - reserve) / budgetBytes));
    const requested = inp.requested && inp.requested > 0 ? inp.requested : Infinity;
    const concurrency = Math.max(1, Math.min(requested, cpus, memCap));
    const parts = [
        inp.requested ? `requested ${inp.requested}` : 'requested auto',
        `cpus ${cpus}`,
        `mem-cap ${memCap} (budget ${inp.memoryBudgetMb}MB)`,
    ];
    return { concurrency, reason: `${parts.join(', ')} -> ${concurrency}` };
}

/**
 * Process-tree RSS, for the per-child hard memory cap. A test child is a Node
 * CLI that spawns a Chromium tree; the browser is where the memory goes, so
 * the cap must cover descendants, not just the direct child.
 */
export interface PsRow {
    pid: number;
    ppid: number;
    rssKb: number;
}

/** Parse `ps -axo pid=,ppid=,rss=` output (whitespace-separated, RSS in KB). */
export function parsePsTable(raw: string): PsRow[] {
    const rows: PsRow[] = [];
    for (const line of raw.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
        if (!m) continue;
        rows.push({ pid: Number(m[1]), ppid: Number(m[2]), rssKb: Number(m[3]) });
    }
    return rows;
}

/** Sum RSS (bytes) of a pid and all its descendants from one ps snapshot. */
export function sumTreeRssBytes(rootPid: number, rows: PsRow[]): number {
    const byParent = new Map<number, PsRow[]>();
    for (const r of rows) {
        const list = byParent.get(r.ppid) ?? [];
        list.push(r);
        byParent.set(r.ppid, list);
    }
    const self = rows.find((r) => r.pid === rootPid);
    let total = self ? self.rssKb : 0;
    const queue = [rootPid];
    while (queue.length > 0) {
        const pid = queue.pop()!;
        for (const child of byParent.get(pid) ?? []) {
            total += child.rssKb;
            queue.push(child.pid);
        }
    }
    return total * 1024;
}

/** Discover *_test.md under a directory (recursive) or accept a single file. */
export function discoverTests(target: string): string[] {
    const abs = path.resolve(target);
    let stat: fs.Stats;
    try {
        stat = fs.statSync(abs);
    } catch {
        return [];
    }
    if (stat.isFile()) return abs.endsWith('_test.md') ? [abs] : [];
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.endsWith('_test.md')) out.push(full);
        }
    };
    walk(abs);
    return out.sort();
}

export type TestVerdict = 'passed' | 'failed' | 'infra' | 'timeout' | 'skipped';

export interface TestOutcome {
    file: string;
    verdict: TestVerdict;
    attempts: number;
    durationMs: number;
    summary: string;
    exitCode: number | null;
    /** true when a later attempt passed after an earlier non-pass. */
    flaky: boolean;
    /** Matrix cell label (e.g. "1280x720") when the suite ran a matrix. */
    label?: string;
}

/** Parse --shard "2/4" into a 1-based slice descriptor. */
export function parseShard(spec: string): { index: number; total: number } {
    const m = spec.match(/^(\d+)\/(\d+)$/);
    if (!m) throw new Error(`shard must look like 2/4, got '${spec}'`);
    const index = Number(m[1]);
    const total = Number(m[2]);
    if (total < 1 || index < 1 || index > total) {
        throw new Error(`shard index must be between 1 and ${total}, got ${index}`);
    }
    return { index, total };
}

/**
 * Deterministic shard slice. MUST be applied to the sorted discovery list
 * (before per-machine history ordering), so every CI machine agrees on the
 * partition without coordination.
 */
export function sliceShard<T>(items: T[], shard: { index: number; total: number }): T[] {
    return items.filter((_, i) => i % shard.total === shard.index - 1);
}

export interface WorkCell {
    file: string;
    /** Viewport label like "1280x720"; absent = engine default. */
    viewport?: string;
}

/** Cartesian expansion of files x viewports (no viewports = one cell per file). */
export function expandMatrix(files: string[], viewports: string[]): WorkCell[] {
    if (viewports.length === 0) return files.map((file) => ({ file }));
    const cells: WorkCell[] = [];
    for (const file of files) {
        for (const viewport of viewports) {
            cells.push({ file, viewport });
        }
    }
    return cells;
}

/**
 * Map a child's (exit code, saw run_end) to a suite verdict. EPIPE makes a
 * dead-pipe run exit 0 without a run_end, so a pass REQUIRES both exit 0 and a
 * terminal event. Exit 2 (error) is infra, exit 3 is timeout.
 */
export function classifyChild(exitCode: number | null, sawRunEnd: boolean, runEndStatus?: string): TestVerdict {
    if (exitCode === 1 || runEndStatus === 'failed') return 'failed';
    if (exitCode === 3 || runEndStatus === 'timeout') return 'timeout';
    if (exitCode === 0 && sawRunEnd && runEndStatus === 'passed') return 'passed';
    // exit 0 without a run_end (EPIPE), exit 2, null exit, or any mismatch.
    return 'infra';
}

export interface PoolTask<T> {
    run(): Promise<T>;
}

/**
 * Run tasks with a bounded pool, admitting the next only when a slot is free
 * AND free memory sits above the low watermark (hysteresis: pause below `low`,
 * resume above `resume`). Pure scheduling: memory sampling is injected so it
 * stays unit-testable.
 */
export async function runPool<T>(
    tasks: Array<() => Promise<T>>,
    opts: {
        concurrency: number;
        freeMemBytes?: () => number;
        lowWatermark?: number; // fraction of total
        resumeWatermark?: number;
        totalMemBytes?: number;
        pollMs?: number;
        sleep?: (ms: number) => Promise<void>;
    },
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let next = 0;
    let active = 0;
    let paused = false;
    const total = opts.totalMemBytes ?? effectiveTotalMemBytes();
    const low = (opts.lowWatermark ?? 0.15) * total;
    const resume = (opts.resumeWatermark ?? 0.20) * total;
    const freeMem = opts.freeMemBytes ?? os.freemem;
    const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const pollMs = opts.pollMs ?? 500;

    async function worker(): Promise<void> {
        for (;;) {
            // Admission control: wait for memory headroom before claiming work.
            // Never block when nothing is running: that would deadlock the
            // whole suite on a machine whose free-memory reading sits below the
            // watermark (macOS reports reclaimable cache as used, so freemem is
            // chronically low). The watermark is backpressure between running
            // tasks, not a cold-start gate.
            for (;;) {
                if (active === 0) { paused = false; break; }
                const free = freeMem();
                if (paused) {
                    if (free >= resume) paused = false;
                } else if (free < low) {
                    paused = true;
                }
                if (!paused) break;
                await sleep(pollMs);
            }
            const i = next++;
            if (i >= tasks.length) return;
            active++;
            try {
                results[i] = await tasks[i]();
            } finally {
                active--;
            }
        }
    }

    const workers = Array.from({ length: Math.max(1, opts.concurrency) }, () => worker());
    await Promise.all(workers);
    return results;
}

/** JUnit XML from outcomes: one testcase per cell, failures/errors/skips tagged. */
export function toJUnitXml(
    outcomes: TestOutcome[],
    suiteName = 'browserbash',
    properties: Record<string, string> = {},
): string {
    const esc = (s: string): string =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const failures = outcomes.filter((o) => o.verdict === 'failed' || o.verdict === 'timeout').length;
    const errors = outcomes.filter((o) => o.verdict === 'infra').length;
    const skipped = outcomes.filter((o) => o.verdict === 'skipped').length;
    const time = outcomes.reduce((s, o) => s + o.durationMs, 0) / 1000;
    const cases = outcomes.map((o) => {
        const name = esc(path.basename(o.file) + (o.label ? ` [${o.label}]` : ''));
        const t = (o.durationMs / 1000).toFixed(3);
        if (o.verdict === 'passed') return `    <testcase name="${name}" time="${t}"/>`;
        if (o.verdict === 'skipped') {
            return `    <testcase name="${name}" time="0.000">\n      <skipped message="${esc(o.summary).slice(0, 400)}"/>\n    </testcase>`;
        }
        const tag = o.verdict === 'infra' ? 'error' : 'failure';
        return `    <testcase name="${name}" time="${t}">\n      <${tag} message="${esc(o.summary).slice(0, 400)}"/>\n    </testcase>`;
    });
    const propKeys = Object.entries(properties);
    const propsBlock = propKeys.length > 0
        ? [
              '  <properties>',
              ...propKeys.map(([k, v]) => `    <property name="${esc(k)}" value="${esc(v)}"/>`),
              '  </properties>',
          ]
        : [];
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<testsuite name="${esc(suiteName)}" tests="${outcomes.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${time.toFixed(3)}">`,
        ...propsBlock,
        ...cases,
        '</testsuite>',
        '',
    ].join('\n');
}
