import { describe, it, expect, vi, afterEach } from 'vitest';
import { Reporter } from '../../dist/output.js';

function capture(stream: NodeJS.WriteStream): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const spy = vi.spyOn(stream, 'write').mockImplementation(((s: string) => {
        lines.push(String(s));
        return true;
    }) as never);
    return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Reporter agent mode', () => {
    it('emits step + run_end as NDJSON on stdout, secrets masked', () => {
        const out = capture(process.stdout);
        const r = new Reporter(true, { pw: { value: 's3cret', secret: true } });
        r.step({ type: 'step', step: 1, status: 'passed', action: 'type_text', remark: 'typed s3cret' });
        r.runEnd({
            type: 'run_end', status: 'passed', summary: 'done s3cret',
            final_state: { password: 's3cret' }, duration_ms: 5, steps_executed: 1, provider: 'local',
        });
        out.restore();

        const step = JSON.parse(out.lines[0]);
        const end = JSON.parse(out.lines[1]);
        expect(step).toMatchObject({ type: 'step', step: 1, status: 'passed', action: 'type_text' });
        expect(step.remark).not.toContain('s3cret');
        expect(step.remark).toContain('*****');
        expect(end).toMatchObject({ type: 'run_end', status: 'passed', steps_executed: 1 });
        expect(end.summary).not.toContain('s3cret');
        expect(end.final_state.password).toBe('*****');
    });

    it('info() writes nothing to stdout in agent mode', () => {
        const out = capture(process.stdout);
        new Reporter(true).info('noise');
        out.restore();
        expect(out.lines).toHaveLength(0);
    });

    it('human mode prints icons, not JSON', () => {
        const out = capture(process.stdout);
        const r = new Reporter(false);
        r.step({ type: 'step', step: 2, status: 'passed', action: 'click', remark: 'clicked login' });
        out.restore();
        expect(out.lines[0]).toContain('✓');
        expect(() => JSON.parse(out.lines[0])).toThrow();
    });
});
