import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {
    classifyChild,
    computeConcurrency,
    discoverTests,
    parsePsTable,
    runPool,
    sumTreeRssBytes,
    toJUnitXml,
    type TestOutcome,
} from './scheduler.js';
import {
    flakyReport,
    loadMemory,
    memoryPath,
    orderTests,
    recordOutcome,
    saveMemory,
} from '../memory-store.js';

export interface RunAllOptions {
    target: string;
    concurrency?: number;
    memoryBudgetMb: number;
    /** Hard RSS cap (MB) per test's process tree; 0 disables the watchdog. */
    memoryCapMb: number;
    retries: number;
    maxFailures: number; // 0 = run all
    junitPath?: string;
    eventsPath: string;
    agent: boolean;
    staggerMs: number;
    /** Flags passed through to each child (already sanitized by the caller). */
    childFlags: string[];
    /** Variables JSON written to a mode-0600 temp file, never on argv. */
    variablesJson?: string;
    cliBin: string;
    resultsDir: string;
    /** Memory root for run history (ordering + flaky report). Undefined = off. */
    memoryDir?: string;
    /** ISO timestamp source for history writes (Date-free in tests). */
    nowIso?: () => string;
    /** Injectable for tests. */
    now?: () => number;
    log?: (msg: string) => void;
}

export interface SuiteResult {
    outcomes: TestOutcome[];
    passed: number;
    failed: number;
    infra: number;
    timeout: number;
    flaky: number;
    exitCode: 0 | 1 | 2 | 3;
    durationMs: number;
}

const CHILD_TERMINATED = -1;
const RSS_POLL_MS = 1500;
const KILL_ESCALATE_MS = 4000;

/** One ps snapshot -> RSS bytes of the child's whole process tree (null off-platform). */
function treeRssBytes(rootPid: number): Promise<number | null> {
    return new Promise((resolve) => {
        execFile('ps', ['-axo', 'pid=,ppid=,rss='], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
            if (err) return resolve(null);
            resolve(sumTreeRssBytes(rootPid, parsePsTable(stdout)));
        });
    });
}

interface ChildResult {
    exitCode: number | null;
    sawRunEnd: boolean;
    runEndStatus?: string;
    summary: string;
    /** Set when the memory watchdog killed the child's tree. */
    memKill?: { rssMb: number; capMb: number };
}

/** Spawn one child CLI for a test file and resolve its verdict from the NDJSON + exit code. */
function runChild(
    file: string,
    opts: RunAllOptions,
    variablesFile: string | undefined,
    emit: (event: Record<string, unknown>) => void,
    children: Set<ChildProcess>,
): Promise<ChildResult> {
    const resultPath = path.join(opts.resultsDir, `${path.basename(file).replace(/_test\.md$/, '')}.md`);
    const args = [
        opts.cliBin, 'testmd', 'run', file,
        '--agent', '--headless',
        '--result-path', resultPath,
        ...opts.childFlags,
    ];
    if (variablesFile) args.push('--variables-file', variablesFile);

    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child); // register at spawn so a suite SIGINT/SIGTERM can reap it
    let sawRunEnd = false;
    let runEndStatus: string | undefined;
    let summary = '';

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
            const event = JSON.parse(trimmed) as Record<string, unknown>;
            emit({ ...event, test: path.basename(file) });
            if (event.type === 'run_end') {
                sawRunEnd = true;
                runEndStatus = String(event.status);
                summary = String(event.summary ?? '');
            }
        } catch {
            // Non-JSON noise on a child's stdout is ignored, never fatal.
        }
    });
    // Drain stderr so the child never blocks on a full pipe.
    child.stderr.resume();

    // Hard RSS watchdog over the child's whole process tree (Node + Chromium).
    // The admission gate plans by budget; this backstops the plan when one
    // test balloons past it, so a single heavy page cannot take out the host.
    let memKill: ChildResult['memKill'];
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let escalate: ReturnType<typeof setTimeout> | undefined;
    if (opts.memoryCapMb > 0 && child.pid) {
        const capBytes = opts.memoryCapMb * 1024 ** 2;
        let checking = false;
        watchdog = setInterval(async () => {
            if (checking || memKill) return;
            checking = true;
            const rss = await treeRssBytes(child.pid!);
            checking = false;
            if (rss === null || rss <= capBytes || memKill) return;
            memKill = { rssMb: Math.round(rss / 1024 ** 2), capMb: opts.memoryCapMb };
            emit({ type: 'test_kill', test: path.basename(file), reason: 'memory', rss_mb: memKill.rssMb, cap_mb: memKill.capMb });
            child.kill('SIGTERM');
            escalate = setTimeout(() => child.kill('SIGKILL'), KILL_ESCALATE_MS);
        }, RSS_POLL_MS);
    }

    return new Promise((resolve) => {
        const cleanup = (): void => {
            if (watchdog) clearInterval(watchdog);
            if (escalate) clearTimeout(escalate);
            children.delete(child);
            rl.close();
        };
        child.on('close', (code) => {
            cleanup();
            resolve({ exitCode: code, sawRunEnd, runEndStatus, summary, memKill });
        });
        child.on('error', () => {
            cleanup();
            resolve({ exitCode: CHILD_TERMINATED, sawRunEnd: false, summary: 'spawn error', memKill });
        });
    });
}

export async function runAll(opts: RunAllOptions): Promise<SuiteResult> {
    const now = opts.now ?? Date.now;
    const log = opts.log ?? (() => {});
    const started = now();

    const discovered = discoverTests(opts.target);
    if (discovered.length === 0) {
        return { outcomes: [], passed: 0, failed: 0, infra: 0, timeout: 0, flaky: 0, exitCode: 2, durationMs: 0 };
    }

    // Run history informs ordering: previously-failed first, then slowest first.
    const memFile = opts.memoryDir ? memoryPath(opts.memoryDir) : undefined;
    const memory = memFile ? loadMemory(memFile) : undefined;
    const files = memory ? orderTests(discovered, memory) : discovered;

    const { concurrency, reason } = computeConcurrency({
        requested: opts.concurrency,
        memoryBudgetMb: opts.memoryBudgetMb,
    });
    log(`Discovered ${files.length} tests${memory ? ' (ordered by run history)' : ''}. Concurrency: ${reason}.`);

    fs.mkdirSync(opts.resultsDir, { recursive: true });
    fs.mkdirSync(path.dirname(path.resolve(opts.eventsPath)), { recursive: true });
    const eventsStream = fs.createWriteStream(opts.eventsPath, { flags: 'w' });
    const emit = (event: Record<string, unknown>): void => {
        const line = JSON.stringify(event);
        eventsStream.write(line + '\n');
        if (opts.agent) process.stdout.write(line + '\n');
    };

    // Secrets travel via a mode-0600 temp file, never argv (ps would leak them).
    let variablesFile: string | undefined;
    if (opts.variablesJson) {
        variablesFile = path.join(os.tmpdir(), `bb-vars-${process.pid}-${files.length}.json`);
        fs.writeFileSync(variablesFile, opts.variablesJson, { mode: 0o600 });
    }

    emit({ type: 'suite_start', tests: files.length, concurrency, ts: now() });

    const children = new Set<ChildProcess>();
    let stopping = false;
    const stop = (): void => {
        stopping = true;
        for (const c of children) c.kill('SIGTERM');
    };
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, stop);

    let firstLaunch = true;
    const outcomes: TestOutcome[] = [];
    let failureCount = 0;

    const tasks = files.map((file) => async (): Promise<void> => {
        if (stopping) return;
        if (opts.maxFailures > 0 && failureCount >= opts.maxFailures) return;
        if (opts.staggerMs > 0 && !firstLaunch) await new Promise((r) => setTimeout(r, opts.staggerMs));
        firstLaunch = false;

        const tStart = now();
        emit({ type: 'test_start', test: path.basename(file), ts: tStart });

        let attempt = 0;
        let verdict = classifyChild(null, false);
        let summary = '';
        let exitCode: number | null = null;
        const maxAttempts = opts.retries + 1;
        while (attempt < maxAttempts) {
            attempt++;
            const res = await runChild(file, opts, variablesFile, emit, children);
            if (res.memKill) {
                verdict = 'infra';
                summary = `killed: process tree RSS ${res.memKill.rssMb}MB exceeded --memory-cap ${res.memKill.capMb}MB`;
            } else {
                verdict = classifyChild(res.exitCode, res.sawRunEnd, res.runEndStatus);
                summary = res.summary;
            }
            exitCode = res.exitCode;
            // Only infra errors are worth a retry; a real fail/timeout is a result.
            if (verdict !== 'infra' || stopping) break;
        }

        const flaky = attempt > 1 && verdict === 'passed';
        if (verdict === 'failed' || verdict === 'timeout' || verdict === 'infra') failureCount++;

        const outcome: TestOutcome = {
            file, verdict, attempts: attempt, durationMs: now() - tStart, summary, exitCode, flaky,
        };
        outcomes.push(outcome);
        emit({ type: 'test_end', test: path.basename(file), verdict, attempts: attempt, flaky, ts: now() });
    });

    await runPool(tasks, { concurrency });

    emit({ type: 'suite_end', ...tally(outcomes), duration_ms: now() - started, ts: now() });
    eventsStream.end();
    if (variablesFile) fs.rmSync(variablesFile, { force: true });

    const t = tally(outcomes);
    const exitCode: SuiteResult['exitCode'] =
        stopping ? 2 : t.infra > 0 ? 2 : t.timeout > 0 ? 3 : t.failed > 0 ? 1 : 0;

    if (opts.junitPath) {
        fs.mkdirSync(path.dirname(path.resolve(opts.junitPath)), { recursive: true });
        fs.writeFileSync(opts.junitPath, toJUnitXml(outcomes));
    }

    // Single-writer: the orchestrator folds every outcome into history once,
    // here, after the suite. Children never touch the file.
    if (memFile && memory) {
        const nowIso = opts.nowIso ?? (() => new Date().toISOString());
        let next = memory;
        for (const o of outcomes) {
            next = recordOutcome(next, {
                testPath: o.file,
                verdict: o.verdict,
                durationMs: o.durationMs,
                flaky: o.flaky,
                nowIso: nowIso(),
            });
        }
        saveMemory(memFile, next);
        const flaky = flakyReport(next);
        if (flaky.length > 0) {
            log(`Flaky tests (passed on retry historically): ${flaky.map((f) => path.basename(f.path)).join(', ')}`);
        }
    }

    writeSummary(opts.resultsDir, outcomes, now() - started);

    return { outcomes, ...t, exitCode, durationMs: now() - started };
}

function tally(outcomes: TestOutcome[]): { passed: number; failed: number; infra: number; timeout: number; flaky: number } {
    return {
        passed: outcomes.filter((o) => o.verdict === 'passed').length,
        failed: outcomes.filter((o) => o.verdict === 'failed').length,
        infra: outcomes.filter((o) => o.verdict === 'infra').length,
        timeout: outcomes.filter((o) => o.verdict === 'timeout').length,
        flaky: outcomes.filter((o) => o.flaky).length,
    };
}

function writeSummary(dir: string, outcomes: TestOutcome[], durationMs: number): void {
    const t = tally(outcomes);
    const icon = (v: string): string =>
        v === 'passed' ? 'PASS' : v === 'failed' ? 'FAIL' : v === 'timeout' ? 'TIMEOUT' : 'ERROR';
    const lines = [
        '# Suite result',
        '',
        `- Total: ${outcomes.length}`,
        `- Passed: ${t.passed}`,
        `- Failed: ${t.failed}`,
        `- Timed out: ${t.timeout}`,
        `- Infra errors: ${t.infra}`,
        `- Flaky (passed on retry): ${t.flaky}`,
        `- Duration: ${(durationMs / 1000).toFixed(1)}s`,
        '',
        '## Tests',
        '',
        ...outcomes.map((o) => `- ${icon(o.verdict)}  ${path.basename(o.file)}${o.flaky ? '  (flaky)' : ''}`),
        '',
    ];
    fs.writeFileSync(path.join(dir, 'RunAll-Result.md'), lines.join('\n'));
}
