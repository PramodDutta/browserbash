import { describe, expect, it } from 'vitest';
import { onTick, parseEvery, runMonitor, type MonitorState, type MonitorTick } from '../../src/monitor.js';

describe('parseEvery', () => {
    it('parses seconds, minutes, hours', () => {
        expect(parseEvery('30s')).toBe(30_000);
        expect(parseEvery('10m')).toBe(600_000);
        expect(parseEvery('1h')).toBe(3_600_000);
        expect(parseEvery('45')).toBe(45_000);
    });
    it('rejects nonsense and hammering intervals', () => {
        expect(() => parseEvery('soon')).toThrow(/30s, 10m or 1h/);
        expect(() => parseEvery('5s')).toThrow(/10s or more/);
    });
});

describe('onTick state machine', () => {
    const passed: MonitorTick = { status: 'passed', summary: 'ok', durationMs: 1 };
    const failed: MonitorTick = { status: 'failed', summary: 'broken', durationMs: 1 };

    it('never notifies on the first tick', () => {
        expect(onTick({ ticks: 0, changes: 0 }, failed).notify).toBe(false);
    });
    it('notifies only on state changes, both directions', () => {
        let state: MonitorState = { ticks: 0, changes: 0 };
        const seq = [passed, passed, failed, failed, passed];
        const notifications = seq.map((t) => {
            const r = onTick(state, t);
            state = r.next;
            return r.notify;
        });
        expect(notifications).toEqual([false, false, true, false, true]);
        expect(state.changes).toBe(2);
        expect(state.ticks).toBe(5);
    });
});

describe('runMonitor loop', () => {
    it('runs maxTicks checks, fires onNotify on changes, survives runOnce throwing', async () => {
        const results: MonitorTick[] = [
            { status: 'passed', summary: 'ok', durationMs: 10 },
            { status: 'failed', summary: 'nope', durationMs: 10 },
        ];
        let call = 0;
        const notified: string[] = [];
        const state = await runMonitor({
            title: 't',
            everyMs: 10_000,
            maxTicks: 3,
            log: () => {},
            sleep: async () => {},
            runOnce: async () => {
                call++;
                if (call === 3) throw new Error('engine crashed');
                return results[call - 1];
            },
            onNotify: async (tick) => {
                notified.push(tick.status);
            },
        });
        expect(state.ticks).toBe(3);
        // passed -> failed (notify), failed -> error (notify)
        expect(notified).toEqual(['failed', 'error']);
    });
});
