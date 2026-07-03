import Anthropic from '@anthropic-ai/sdk';
import type { Page } from 'playwright-core';
import type { Reporter } from '../output.js';
import type { RunResult, VariableValue } from '../types.js';
import { substitute } from '../variables.js';
import { normalizeUrl, retemplatizeInput, type RecordedAction } from '../cache-store.js';
import { BROWSER_TOOLS, BrowserToolExecutor } from './tools.js';

const SYSTEM_PROMPT = `You are a browser automation agent. You receive a plain-English objective and drive a real browser to complete it using the provided tools.

Rules:
- Take a snapshot before interacting with a page you have not seen yet.
- Prefer ref:<id> targets from the latest snapshot; fall back to CSS selectors or text=.
- When the objective says "store X as 'name'", use the extract tool with store_as.
- Be decisive: do not re-verify steps that already succeeded.
- When the objective is met, or clearly cannot be met, call the done tool. Always end with done.`;

export interface AgentRunOptions {
    objective: string;
    page: Page;
    reporter: Reporter;
    maxSteps: number;
    timeoutSec: number;
    variables: Record<string, VariableValue>;
    model: string;
    /** Successful browser actions are recorded here (journal recorder). */
    actionSink?: RecordedAction[];
    /** Seed extract values (a heal run inherits what replay collected). */
    initialFinalState?: Record<string, string>;
    /** Appended to the objective when healing after a partial replay. */
    resumeNote?: string;
}

const RECORDABLE = new Set(['navigate', 'click', 'type_text', 'wait_for', 'extract']);

/**
 * Manual tool-use loop (not the SDK tool runner) so every tool call can be
 * emitted as an NDJSON step event before and after execution.
 */
export async function runAgent(options: AgentRunOptions): Promise<RunResult> {
    const start = Date.now();
    const client = new Anthropic();
    const executor = new BrowserToolExecutor(options.page);
    if (options.initialFinalState) Object.assign(executor.finalState, options.initialFinalState);
    const objective =
        substitute(options.objective, options.variables) +
        (options.resumeNote ? `\n\n${options.resumeNote}` : '');

    const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: `Objective: ${objective}` },
    ];

    const deadline = start + options.timeoutSec * 1000;
    let step = 0;
    let doneStatus: 'passed' | 'failed' | null = null;
    let summary = '';

    while (step < options.maxSteps) {
        if (Date.now() > deadline) {
            return finish('timeout', `Timed out after ${options.timeoutSec}s at step ${step}`, executor, start, step);
        }

        const response = await client.messages.create({
            model: options.model,
            max_tokens: 16000,
            thinking: { type: 'adaptive' },
            system: SYSTEM_PROMPT,
            tools: BROWSER_TOOLS,
            messages,
        });

        const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        if (toolUses.length === 0) {
            const text = response.content
                .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                .map((b) => b.text)
                .join('\n');
            return finish('error', `Agent stopped without calling done: ${text.slice(0, 300)}`, executor, start, step);
        }

        messages.push({ role: 'assistant', content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUses) {
            const input = toolUse.input as Record<string, unknown>;

            if (toolUse.name === 'done') {
                doneStatus = input.status === 'passed' ? 'passed' : 'failed';
                summary = String(input.summary ?? '');
                toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: 'acknowledged' });
                break;
            }

            step += 1;
            options.reporter.step({
                type: 'step',
                step,
                status: 'running',
                action: toolUse.name,
                remark: describe(toolUse.name, input),
            });

            try {
                // Fingerprints must reflect the page BEFORE the action runs.
                const urlBefore = options.actionSink && RECORDABLE.has(toolUse.name)
                    ? executor.currentUrl()
                    : '';
                const result = await executor.execute(toolUse.name, input);
                if (options.actionSink && RECORDABLE.has(toolUse.name)) {
                    const dehydrated: Record<string, unknown> = { ...input };
                    if (typeof dehydrated.target === 'string') {
                        dehydrated.target = executor.resolveTarget(dehydrated.target);
                    }
                    const { input: templated, carriesVariables } = retemplatizeInput(dehydrated, options.variables);
                    const { origin, normalized } = normalizeUrl(urlBefore);
                    options.actionSink.push({
                        tool: toolUse.name as RecordedAction['tool'],
                        input: templated,
                        urlBefore: normalized,
                        origin,
                        carriesVariables,
                    });
                }
                options.reporter.step({ type: 'step', step, status: 'passed', action: toolUse.name, remark: result });
                toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
            } catch (err) {
                const message = (err as Error).message.split('\n')[0];
                options.reporter.step({ type: 'step', step, status: 'failed', action: toolUse.name, remark: message });
                toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: `Error: ${message}`, is_error: true });
            }
        }

        if (doneStatus !== null) {
            return finish(doneStatus, summary, executor, start, step);
        }
        messages.push({ role: 'user', content: toolResults });
    }

    return finish('failed', `Reached max steps (${options.maxSteps}) without completing the objective`, executor, start, step);
}

function finish(
    status: RunResult['status'],
    summary: string,
    executor: BrowserToolExecutor,
    start: number,
    steps: number,
): RunResult {
    return {
        status,
        summary,
        finalState: executor.finalState,
        stepsExecuted: steps,
        durationMs: Date.now() - start,
    };
}

function describe(name: string, input: Record<string, unknown>): string {
    switch (name) {
        case 'navigate': return `goto ${String(input.url)}`;
        case 'click': return `click ${String(input.target)}`;
        case 'type_text': return `type into ${String(input.target)}`;
        case 'wait_for': return `wait for ${String(input.target)}`;
        case 'extract': return `extract ${String(input.target)} as ${String(input.store_as)}`;
        case 'snapshot': return 'capture page snapshot';
        default: return name;
    }
}
