import { describe, expect, it } from 'vitest';
import { callTool, handleMessage, TOOLS, type SpawnRunner } from '../../src/mcp/server.js';

const RUN_END = { type: 'run_end', status: 'passed', summary: 'ok', final_state: { h1: 'Example' }, duration_ms: 1200, steps_executed: 2, provider: 'local' };

function fakeRunner(capture: { args?: string[] }, events: Array<Record<string, unknown>>, exitCode = 0): SpawnRunner {
    return async (args) => {
        capture.args = args;
        return { events, exitCode, stderrTail: '' };
    };
}

describe('MCP protocol', () => {
    it('answers initialize with capabilities and server info', async () => {
        const res = await handleMessage(
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
            fakeRunner({}, []),
            '9.9.9',
        );
        const result = res?.result as { serverInfo: { name: string; version: string }; capabilities: { tools: object } };
        expect(result.serverInfo).toEqual({ name: 'browserbash', version: '9.9.9' });
        expect(result.capabilities.tools).toBeDefined();
    });

    it('stays silent on notifications, errors on unknown requests', async () => {
        expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, fakeRunner({}, []), 'v')).toBeNull();
        const res = await handleMessage({ jsonrpc: '2.0', id: 7, method: 'nope' }, fakeRunner({}, []), 'v');
        expect((res?.error as { code: number }).code).toBe(-32601);
    });

    it('lists the three validation tools with schemas', async () => {
        const res = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, fakeRunner({}, []), 'v');
        const tools = (res?.result as { tools: typeof TOOLS }).tools;
        expect(tools.map((t) => t.name)).toEqual(['run_objective', 'run_test_file', 'run_suite']);
        for (const t of tools) expect(t.inputSchema).toHaveProperty('type', 'object');
    });
});

describe('MCP tools/call dispatch', () => {
    it('run_objective spawns the CLI in agent mode and returns the run_end', async () => {
        const capture: { args?: string[] } = {};
        const res = await callTool('run_objective', { objective: 'Open example.com', provider: 'local' }, fakeRunner(capture, [RUN_END]));
        expect(capture.args).toContain('run');
        expect(capture.args).toContain('--agent');
        expect(capture.args).toContain('--headless');
        expect(capture.args).toContain('--provider');
        expect(res.isError).toBeUndefined();
        expect((res.structuredContent as { status: string }).status).toBe('passed');
        expect((res.structuredContent as { exit_code: number }).exit_code).toBe(0);
    });

    it('a FAILED test is a successful validation, not a tool error', async () => {
        const res = await callTool(
            'run_test_file',
            { path: 'x_test.md' },
            fakeRunner({}, [{ ...RUN_END, status: 'failed' }], 1),
        );
        expect(res.isError).toBeUndefined();
        expect((res.structuredContent as { status: string }).status).toBe('failed');
    });

    it('run_suite aggregates test_end events under the suite_end', async () => {
        const events = [
            { type: 'test_end', test: 'a_test.md', verdict: 'passed', flaky: false },
            { type: 'test_end', test: 'b_test.md', verdict: 'failed', flaky: false },
            { type: 'suite_end', passed: 1, failed: 1, infra: 0, timeout: 0, skipped: 0, duration_ms: 5000 },
        ];
        const res = await callTool('run_suite', { dir: 'tests' }, fakeRunner({}, events, 1));
        const sc = res.structuredContent as { tests: Array<{ verdict: string }>; passed: number };
        expect(sc.passed).toBe(1);
        expect(sc.tests).toHaveLength(2);
    });

    it('missing terminal event surfaces as a tool error with stderr context', async () => {
        const runner: SpawnRunner = async () => ({ events: [], exitCode: 2, stderrTail: 'ANTHROPIC_API_KEY missing' });
        const res = await callTool('run_objective', { objective: 'x' }, runner);
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('ANTHROPIC_API_KEY missing');
    });

    it('validates required params without spawning', async () => {
        const res = await callTool('run_objective', {}, fakeRunner({}, [RUN_END]));
        expect(res.isError).toBe(true);
    });
});
