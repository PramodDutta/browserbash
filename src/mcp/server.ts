import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

/**
 * MCP (Model Context Protocol) server over stdio — `browserbash mcp`.
 *
 * Hand-rolled JSON-RPC 2.0 on purpose: the protocol surface we need
 * (initialize, tools/list, tools/call, ping) is ~200 lines, and zero new
 * runtime dependencies keeps the CLI's install honest.
 *
 * Every tools/call spawns the CLI as a CHILD process with --agent and reads
 * its NDJSON. That isolation is load-bearing: the parent's stdout is the MCP
 * channel, and a run's own step events must never interleave with JSON-RPC
 * frames. It also means a browser crash can never take the MCP server down.
 */

const PROTOCOL_VERSION = '2025-06-18';

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: number | string | null;
    method: string;
    params?: Record<string, unknown>;
}

interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

const COMMON_PROPS: Record<string, unknown> = {
    provider: { type: 'string', description: 'Browser provider: local | cdp | browserbase | lambdatest | browserstack (default: config)' },
    model: { type: 'string', description: 'Model id override (auto resolves Ollama first, then hosted keys)' },
    timeout_sec: { type: 'number', description: 'Hard timeout in seconds (default 300)' },
    variables: {
        type: 'object',
        description: 'Variables for {{key}} substitution. Secret values: {"password": {"value": "...", "secret": true}} — masked in all output.',
        additionalProperties: true,
    },
    auth: { type: 'string', description: 'Saved login session name (browserbash auth save <name>)' },
    viewport: { type: 'string', description: 'Viewport like 1280x720' },
};

export const TOOLS: ToolDef[] = [
    {
        name: 'run_objective',
        description:
            'Run a plain-English browser objective in a real browser and return the structured verdict. ' +
            'Use this to VALIDATE web work: navigate, interact, extract values ("store the heading as \'h1\'"). ' +
            'The result JSON has status (passed|failed|error|timeout), summary, final_state (extracted values), and duration_ms.',
        inputSchema: {
            type: 'object',
            properties: {
                objective: { type: 'string', description: 'Plain-English objective, e.g. "Open https://example.com and store the page heading as \'h1\'"' },
                start_url: { type: 'string', description: 'URL to open before the agent starts' },
                ...COMMON_PROPS,
            },
            required: ['objective'],
        },
    },
    {
        name: 'run_test_file',
        description:
            'Run one committable *_test.md file (plain-English steps) and return the structured verdict, ' +
            'including deterministic assertion results when the file uses Verify steps.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the *_test.md file' },
                ...COMMON_PROPS,
            },
            required: ['path'],
        },
    },
    {
        name: 'run_suite',
        description:
            'Run a folder of *_test.md files in parallel with memory-aware scheduling. Returns the suite tally ' +
            '(passed/failed/timeout/infra/skipped), per-test verdicts, and estimated cost.',
        inputSchema: {
            type: 'object',
            properties: {
                dir: { type: 'string', description: 'Directory containing *_test.md files (default .browserbash/tests)' },
                concurrency: { type: 'number', description: 'Max parallel runs (default: auto from CPU + memory)' },
                budget_usd: { type: 'number', description: 'Stop launching new tests once estimated spend reaches this' },
                ...COMMON_PROPS,
            },
        },
    },
];

interface ChildOutcome {
    events: Array<Record<string, unknown>>;
    exitCode: number | null;
    stderrTail: string;
}

export type SpawnRunner = (args: string[], timeoutMs: number) => Promise<ChildOutcome>;

/** Default child runner: spawn this CLI, parse NDJSON lines from stdout. */
export function cliSpawnRunner(cliBin: string): SpawnRunner {
    return (args, timeoutMs) =>
        new Promise((resolve) => {
            const child = spawn(process.execPath, [cliBin, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
            const events: Array<Record<string, unknown>> = [];
            let stderrTail = '';
            const rl = readline.createInterface({ input: child.stdout });
            rl.on('line', (line) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                try {
                    events.push(JSON.parse(trimmed) as Record<string, unknown>);
                } catch {
                    // non-JSON noise
                }
            });
            child.stderr.on('data', (chunk: Buffer) => {
                stderrTail = (stderrTail + chunk.toString()).slice(-2000);
            });
            const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
            child.on('close', (code) => {
                clearTimeout(timer);
                resolve({ events, exitCode: code, stderrTail });
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                resolve({ events, exitCode: null, stderrTail: err.message });
            });
        });
}

/** Serialize a variables object into a mode-0600 temp file (never argv). */
function writeVariablesFile(variables: Record<string, unknown>): string {
    const file = path.join(os.tmpdir(), `bb-mcp-vars-${process.pid}-${Math.floor(Math.random() * 1e9)}.json`);
    fs.writeFileSync(file, JSON.stringify(variables), { mode: 0o600 });
    return file;
}

function commonArgs(params: Record<string, unknown>): { args: string[]; cleanup: () => void } {
    const args: string[] = [];
    let varsFile: string | undefined;
    if (typeof params.provider === 'string') args.push('--provider', params.provider);
    if (typeof params.model === 'string') args.push('--model', params.model);
    if (typeof params.timeout_sec === 'number') args.push('--timeout', String(Math.floor(params.timeout_sec)));
    if (typeof params.auth === 'string') args.push('--auth', params.auth);
    if (typeof params.viewport === 'string') args.push('--viewport', params.viewport);
    if (params.variables && typeof params.variables === 'object') {
        varsFile = writeVariablesFile(params.variables as Record<string, unknown>);
        args.push('--variables-file', varsFile);
    }
    return {
        args,
        cleanup: () => {
            if (varsFile) fs.rmSync(varsFile, { force: true });
        },
    };
}

const HARD_CAP_MS = 15 * 60_000;

function timeoutMsFor(params: Record<string, unknown>, fallbackSec: number): number {
    const sec = typeof params.timeout_sec === 'number' ? params.timeout_sec : fallbackSec;
    // Child gets its own --timeout; the spawn cap only backstops a hung child.
    return Math.min(sec * 1000 + 60_000, HARD_CAP_MS);
}

/** Execute one MCP tool call. Exported for tests (spawn injected). */
export async function callTool(
    name: string,
    params: Record<string, unknown>,
    runner: SpawnRunner,
): Promise<{ content: Array<{ type: 'text'; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }> {
    const { args: common, cleanup } = commonArgs(params);
    try {
        let args: string[];
        let terminal: 'run_end' | 'suite_end';
        if (name === 'run_objective') {
            if (typeof params.objective !== 'string' || params.objective.length === 0) {
                return errorResult('objective is required');
            }
            args = ['run', params.objective, '--agent', '--headless', ...common];
            if (typeof params.start_url === 'string') args.push('--url', params.start_url);
            terminal = 'run_end';
        } else if (name === 'run_test_file') {
            if (typeof params.path !== 'string' || params.path.length === 0) {
                return errorResult('path is required');
            }
            args = ['testmd', 'run', params.path, '--agent', '--headless', ...common];
            terminal = 'run_end';
        } else if (name === 'run_suite') {
            const eventsFile = path.join(os.tmpdir(), `bb-mcp-events-${process.pid}-${Math.floor(Math.random() * 1e9)}.ndjson`);
            args = ['run-all', ...(typeof params.dir === 'string' ? [params.dir] : []), '--agent', '--events', eventsFile, ...common];
            if (typeof params.concurrency === 'number') args.push('--concurrency', String(Math.floor(params.concurrency)));
            if (typeof params.budget_usd === 'number') args.push('--budget-usd', String(params.budget_usd));
            terminal = 'suite_end';
        } else {
            return errorResult(`Unknown tool: ${name}`);
        }

        const outcome = await runner(args, timeoutMsFor(params, terminal === 'suite_end' ? 1800 : 300));
        const terminalEvent = [...outcome.events].reverse().find((e) => e.type === terminal);
        if (!terminalEvent) {
            return errorResult(
                `The run produced no ${terminal} event (exit ${outcome.exitCode}). ` +
                (outcome.stderrTail ? `stderr: ${outcome.stderrTail.slice(-500)}` : ''),
            );
        }

        const result: Record<string, unknown> = { ...terminalEvent, exit_code: outcome.exitCode };
        if (terminal === 'suite_end') {
            result.tests = outcome.events
                .filter((e) => e.type === 'test_end')
                .map((e) => ({ test: e.test, verdict: e.verdict, cell: e.cell, flaky: e.flaky }));
        }
        // A failed TEST is a successful VALIDATION — the agent needs the
        // verdict, so isError stays false unless the tool itself broke.
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    } finally {
        cleanup();
    }
}

function errorResult(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
    return { content: [{ type: 'text', text: message }], isError: true };
}

/** Handle one JSON-RPC request object; null = notification (no response). */
export async function handleMessage(
    msg: JsonRpcRequest,
    runner: SpawnRunner,
    serverVersion: string,
): Promise<Record<string, unknown> | null> {
    const reply = (result: unknown): Record<string, unknown> => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
    const fail = (code: number, message: string): Record<string, unknown> => ({
        jsonrpc: '2.0',
        id: msg.id ?? null,
        error: { code, message },
    });

    switch (msg.method) {
        case 'initialize':
            return reply({
                protocolVersion:
                    typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: 'browserbash', version: serverVersion },
            });
        case 'notifications/initialized':
        case 'notifications/cancelled':
            return null;
        case 'ping':
            return reply({});
        case 'tools/list':
            return reply({ tools: TOOLS });
        case 'tools/call': {
            const name = String(msg.params?.name ?? '');
            const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
            try {
                return reply(await callTool(name, args, runner));
            } catch (err) {
                return fail(-32603, (err as Error).message);
            }
        }
        default:
            // Notifications must not get responses; unknown requests must.
            if (msg.id === undefined) return null;
            return fail(-32601, `Method not found: ${msg.method}`);
    }
}

/** Serve MCP over stdio until stdin closes. */
export async function serveMcp(cliBin: string, serverVersion: string): Promise<void> {
    const runner = cliSpawnRunner(cliBin);
    const rl = readline.createInterface({ input: process.stdin });
    process.stderr.write('browserbash MCP server on stdio (tools: run_objective, run_test_file, run_suite)\n');
    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg: JsonRpcRequest;
        try {
            msg = JSON.parse(trimmed) as JsonRpcRequest;
        } catch {
            process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
            continue;
        }
        const response = await handleMessage(msg, runner, serverVersion);
        if (response) process.stdout.write(JSON.stringify(response) + '\n');
    }
}
