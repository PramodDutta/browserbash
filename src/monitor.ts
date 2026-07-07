import { sendNotification } from './notify.js';
import type { RunResult, RunStatus } from './types.js';

/**
 * Monitor mode: run one test (or objective) on an interval and alert on
 * STATE CHANGES only — a webhook fires when a passing check starts failing
 * and when it recovers, never on every green run. Warm replay-cache runs
 * make an always-on monitor nearly token-free.
 */

/** Parse --every values: "30s", "10m", "1h" (or bare seconds). */
export function parseEvery(value: string): number {
    const m = value.trim().match(/^(\d+)\s*(s|m|h)?$/i);
    if (!m) throw new Error(`--every must look like 30s, 10m or 1h, got '${value}'`);
    const n = Number(m[1]);
    if (n <= 0) throw new Error('--every must be positive');
    const unit = (m[2] ?? 's').toLowerCase();
    const ms = unit === 'h' ? n * 3_600_000 : unit === 'm' ? n * 60_000 : n * 1000;
    if (ms < 10_000) throw new Error('--every below 10s would hammer the target — use 10s or more');
    return ms;
}

export interface MonitorTick {
    status: RunStatus;
    summary: string;
    durationMs: number;
}

export interface MonitorState {
    lastStatus?: RunStatus;
    ticks: number;
    changes: number;
}

/** Pure state machine: should this tick fire a notification? */
export function onTick(state: MonitorState, tick: MonitorTick): { next: MonitorState; notify: boolean } {
    const changed = state.lastStatus !== undefined && state.lastStatus !== tick.status;
    return {
        next: { lastStatus: tick.status, ticks: state.ticks + 1, changes: state.changes + (changed ? 1 : 0) },
        notify: changed,
    };
}

export interface MonitorOptions {
    title: string;
    everyMs: number;
    notifyUrl?: string;
    /** One check execution — injected so the loop is unit-testable. */
    runOnce: () => Promise<MonitorTick>;
    log: (msg: string) => void;
    /** Injectable for tests. */
    sleep?: (ms: number) => Promise<void>;
    /** Stop after N ticks (tests / --ticks); 0 = run until killed. */
    maxTicks?: number;
    onNotify?: (tick: MonitorTick, state: MonitorState) => Promise<void>;
}

export async function runMonitor(options: MonitorOptions): Promise<MonitorState> {
    const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    let state: MonitorState = { ticks: 0, changes: 0 };

    for (;;) {
        let tick: MonitorTick;
        try {
            tick = await options.runOnce();
        } catch (err) {
            // An engine/infra crash is a failing check, not a dead monitor.
            tick = { status: 'error', summary: (err as Error).message, durationMs: 0 };
        }

        const { next, notify } = onTick(state, tick);
        const prev = state.lastStatus;
        state = next;
        options.log(
            `[monitor] ${options.title}: ${tick.status} (${(tick.durationMs / 1000).toFixed(1)}s)` +
            (notify ? ` — CHANGED from ${prev}` : ''),
        );

        if (notify) {
            if (options.onNotify) await options.onNotify(tick, state);
            if (options.notifyUrl) {
                await sendNotification(options.notifyUrl, {
                    event: 'monitor_change',
                    status: tick.status,
                    title: options.title,
                    summary: `${prev} -> ${tick.status}: ${tick.summary}`,
                    data: { duration_ms: tick.durationMs, ticks: state.ticks },
                }, options.log);
            }
        }

        if (options.maxTicks && state.ticks >= options.maxTicks) return state;
        await sleep(options.everyMs);
    }
}

/** Adapt a RunResult into a monitor tick. */
export function tickFromResult(result: RunResult): MonitorTick {
    return { status: result.status, summary: result.summary, durationMs: result.durationMs };
}
