import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {
    classifyChild,
    computeConcurrency,
    discoverTests,
    expandMatrix,
    parsePsTable,
    runPool,
    sliceShard,
    sumTreeRssBytes,
    toJUnitXml,
    type TestOutcome,
    type WorkCell,
} from './scheduler.js';
import { sendNotification } from '../notify.js';
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
    /** Deterministic suite slice for split CI machines (--shard 2/4). */
    shard?: { index: number; total: number };
    /** Viewport labels ("1280x720") — each test runs once per viewport. */
    matrixViewports?: string[];
    /** Stop launching new tests once estimated spend crosses this (USD). */
    budgetUsd?: number;
    /** Stop launching new tests once total tokens cross this. */
    budgetTokens?: number;
    /** Webhook to POST the suite verdict to (--notify). */
    notifyUrl?: string;
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
    skipped: number;
    /** Estimated model spend across all children (USD, when reported). */
    costUsd: number;
    /** True when the token/USD budget stopped the suite early. */
    budgetStopped: boolean;
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

/** Spawn one child CLI for a work cell and resolve its verdict from the NDJSON + exit code. */
function runChild(
    cell: WorkCell,
    opts: RunAllOptions,
    variablesFile: string | undefined,
    emit: (event: Record<string, unknown>) => void,
    children: Set<ChildProcess>,
): Promise<ChildResult> {
    const file = cell.file;
    const cellSuffix = cell.viewport ? `.${cell.viewport}` : '';
    const resultPath = path.join(opts.resultsDir, `${path.basename(file).replace(/_test\.md$/, '')}${cellSuffix}.md`);
    const args = [
        opts.cliBin, 'testmd', 'run', file,
        '--agent', '--headless',
        '--result-path', resultPath,
        ...(cell.viewport ? ['--viewport', cell.viewport] : []),
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
            emit({ ...event, test: path.basename(file), ...(cell.viewport ? { cell: cell.viewport } : {}) });
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

    let discovered = discoverTests(opts.target);
    if (discovered.length === 0) {
        return { outcomes: [], passed: 0, failed: 0, infra: 0, timeout: 0, flaky: 0, skipped: 0, costUsd: 0, budgetStopped: false, exitCode: 2, durationMs: 0 };
    }

    // Shard BEFORE history ordering: discovery is sorted, so every machine
    // computes the same partition; ordering below is per-machine and may not.
    if (opts.shard) {
        const before = discovered.length;
        discovered = sliceShard(discovered, opts.shard);
        log(`Shard ${opts.shard.index}/${opts.shard.total}: ${discovered.length} of ${before} tests on this machine.`);
        if (discovered.length === 0) {
            return { outcomes: [], passed: 0, failed: 0, infra: 0, timeout: 0, flaky: 0, skipped: 0, costUsd: 0, budgetStopped: false, exitCode: 0, durationMs: 0 };
        }
    }

    // Run history informs ordering: previously-failed first, then slowest first.
    const memFile = opts.memoryDir ? memoryPath(opts.memoryDir) : undefined;
    const memory = memFile ? loadMemory(memFile) : undefined;
    const files = memory ? orderTests(discovered, memory) : discovered;
    const cells = expandMatrix(files, opts.matrixViewports ?? []);

    const { concurrency, reason } = computeConcurrency({
        requested: opts.concurrency,
        memoryBudgetMb: opts.memoryBudgetMb,
    });
    log(
        `Discovered ${files.length} tests${memory ? ' (ordered by run history)' : ''}` +
        `${cells.length !== files.length ? `, ${cells.length} matrix cells` : ''}. Concurrency: ${reason}.`,
    );

    fs.mkdirSync(opts.resultsDir, { recursive: true });
    fs.mkdirSync(path.dirname(path.resolve(opts.eventsPath)), { recursive: true });
    const eventsStream = fs.createWriteStream(opts.eventsPath, { flags: 'w' });
    // Suite-level spend accounting, fed by every child's run_end. The budget
    // gate reads these BEFORE launching the next cell: it stops new launches,
    // it never kills work already in flight.
    let spentUsd = 0;
    let spentTokens = 0;
    let budgetStopped = false;
    const emit = (event: Record<string, unknown>): void => {
        if (event.type === 'run_end') {
            if (typeof event.cost_usd === 'number') spentUsd += event.cost_usd;
            if (typeof event.tokens_in === 'number') spentTokens += event.tokens_in;
            if (typeof event.tokens_out === 'number') spentTokens += event.tokens_out;
        }
        const line = JSON.stringify(event);
        eventsStream.write(line + '\n');
        if (opts.agent) process.stdout.write(line + '\n');
    };
    const overBudget = (): string | null => {
        if (opts.budgetUsd !== undefined && spentUsd >= opts.budgetUsd) {
            return `estimated spend $${spentUsd.toFixed(4)} reached --budget-usd ${opts.budgetUsd}`;
        }
        if (opts.budgetTokens !== undefined && spentTokens >= opts.budgetTokens) {
            return `${spentTokens} tokens reached --budget-tokens ${opts.budgetTokens}`;
        }
        return null;
    };

    // Secrets travel via a mode-0600 temp file, never argv (ps would leak them).
    let variablesFile: string | undefined;
    if (opts.variablesJson) {
        variablesFile = path.join(os.tmpdir(), `bb-vars-${process.pid}-${files.length}.json`);
        fs.writeFileSync(variablesFile, opts.variablesJson, { mode: 0o600 });
    }

    emit({
        type: 'suite_start',
        tests: files.length,
        ...(cells.length !== files.length ? { cells: cells.length } : {}),
        ...(opts.shard ? { shard: `${opts.shard.index}/${opts.shard.total}` } : {}),
        concurrency,
        ts: now(),
    });

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

    const tasks = cells.map((cell) => async (): Promise<void> => {
        if (stopping) return;
        if (opts.maxFailures > 0 && failureCount >= opts.maxFailures) return;
        const file = cell.file;

        // Budget gate: once the suite crossed --budget-usd / --budget-tokens,
        // remaining cells are reported as skipped instead of silently dropped.
        const budgetReason = overBudget();
        if (budgetReason) {
            budgetStopped = true;
            outcomes.push({
                file, verdict: 'skipped', attempts: 0, durationMs: 0,
                summary: `skipped: ${budgetReason}`, exitCode: null, flaky: false, label: cell.viewport,
            });
            emit({ type: 'test_skipped', test: path.basename(file), ...(cell.viewport ? { cell: cell.viewport } : {}), reason: budgetReason, ts: now() });
            return;
        }

        if (opts.staggerMs > 0 && !firstLaunch) await new Promise((r) => setTimeout(r, opts.staggerMs));
        firstLaunch = false;

        const tStart = now();
        emit({ type: 'test_start', test: path.basename(file), ...(cell.viewport ? { cell: cell.viewport } : {}), ts: tStart });

        let attempt = 0;
        let verdict = classifyChild(null, false);
        let summary = '';
        let exitCode: number | null = null;
        const maxAttempts = opts.retries + 1;
        while (attempt < maxAttempts) {
            attempt++;
            const res = await runChild(cell, opts, variablesFile, emit, children);
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
            file, verdict, attempts: attempt, durationMs: now() - tStart, summary, exitCode, flaky, label: cell.viewport,
        };
        outcomes.push(outcome);
        emit({ type: 'test_end', test: path.basename(file), ...(cell.viewport ? { cell: cell.viewport } : {}), verdict, attempts: attempt, flaky, ts: now() });
    });

    await runPool(tasks, { concurrency });

    emit({
        type: 'suite_end',
        ...tally(outcomes),
        ...(spentUsd > 0 ? { cost_usd: Math.round(spentUsd * 1e6) / 1e6 } : {}),
        ...(spentTokens > 0 ? { tokens: spentTokens } : {}),
        ...(budgetStopped ? { budget_stopped: true } : {}),
        duration_ms: now() - started,
        ts: now(),
    });
    eventsStream.end();
    if (variablesFile) fs.rmSync(variablesFile, { force: true });

    const t = tally(outcomes);
    // A budget stop is an incomplete suite, not a pass — surface as infra (2).
    const exitCode: SuiteResult['exitCode'] =
        stopping ? 2 : budgetStopped ? 2 : t.infra > 0 ? 2 : t.timeout > 0 ? 3 : t.failed > 0 ? 1 : 0;

    if (opts.junitPath) {
        fs.mkdirSync(path.dirname(path.resolve(opts.junitPath)), { recursive: true });
        const props: Record<string, string> = {};
        if (spentUsd > 0) props.cost_usd = spentUsd.toFixed(6);
        if (spentTokens > 0) props.tokens = String(spentTokens);
        if (opts.shard) props.shard = `${opts.shard.index}/${opts.shard.total}`;
        fs.writeFileSync(opts.junitPath, toJUnitXml(outcomes, 'browserbash', props));
    }

    // Single-writer: the orchestrator folds every outcome into history once,
    // here, after the suite. Children never touch the file.
    if (memFile && memory) {
        const nowIso = opts.nowIso ?? (() => new Date().toISOString());
        let next = memory;
        // Skipped cells never ran — recording them would poison the
        // failed-first ordering and the flaky stats.
        const ran = outcomes.filter(
            (o): o is TestOutcome & { verdict: 'passed' | 'failed' | 'infra' | 'timeout' } => o.verdict !== 'skipped',
        );
        for (const o of ran) {
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

    writeSummary(opts.resultsDir, outcomes, now() - started, spentUsd);

    const result: SuiteResult = {
        outcomes, ...t, costUsd: Math.round(spentUsd * 1e6) / 1e6, budgetStopped, exitCode, durationMs: now() - started,
    };

    if (opts.notifyUrl) {
        const status = exitCode === 0 ? 'passed' : 'failed';
        await sendNotification(opts.notifyUrl, {
            event: 'suite_end',
            status,
            title: `browserbash suite (${outcomes.length} cells)`,
            summary:
                `${t.passed} passed, ${t.failed} failed, ${t.timeout} timed out, ${t.infra} infra, ` +
                `${t.skipped} skipped in ${(result.durationMs / 1000).toFixed(1)}s` +
                (spentUsd > 0 ? ` (~$${spentUsd.toFixed(4)})` : ''),
            data: { ...t, exit_code: exitCode, duration_ms: result.durationMs, budget_stopped: budgetStopped },
        }, log);
    }

    return result;
}

function tally(outcomes: TestOutcome[]): { passed: number; failed: number; infra: number; timeout: number; flaky: number; skipped: number } {
    return {
        passed: outcomes.filter((o) => o.verdict === 'passed').length,
        failed: outcomes.filter((o) => o.verdict === 'failed').length,
        infra: outcomes.filter((o) => o.verdict === 'infra').length,
        timeout: outcomes.filter((o) => o.verdict === 'timeout').length,
        flaky: outcomes.filter((o) => o.flaky).length,
        skipped: outcomes.filter((o) => o.verdict === 'skipped').length,
    };
}

function writeSummary(dir: string, outcomes: TestOutcome[], durationMs: number, spentUsd = 0): void {
    const t = tally(outcomes);
    const icon = (v: string): string =>
        v === 'passed' ? 'PASS' : v === 'failed' ? 'FAIL' : v === 'timeout' ? 'TIMEOUT' : v === 'skipped' ? 'SKIP' : 'ERROR';
    const lines = [
        '# Suite result',
        '',
        `- Total: ${outcomes.length}`,
        `- Passed: ${t.passed}`,
        `- Failed: ${t.failed}`,
        `- Timed out: ${t.timeout}`,
        `- Infra errors: ${t.infra}`,
        `- Skipped: ${t.skipped}`,
        `- Flaky (passed on retry): ${t.flaky}`,
        `- Duration: ${(durationMs / 1000).toFixed(1)}s`,
        ...(spentUsd > 0 ? [`- Estimated model spend: $${spentUsd.toFixed(4)}`] : []),
        '',
        '## Tests',
        '',
        ...outcomes.map((o) => `- ${icon(o.verdict)}  ${path.basename(o.file)}${o.label ? ` [${o.label}]` : ''}${o.flaky ? '  (flaky)' : ''}`),
        '',
    ];
    fs.writeFileSync(path.join(dir, 'RunAll-Result.md'), lines.join('\n'));
}
