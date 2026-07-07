import { executeAssertion, type AssertablePage } from '../engine/assertions.js';
import type { Reporter } from '../output.js';
import type { AssertionResult, AssertionsSummary, RunResult, RunStatus, VariableValue } from '../types.js';
import { substitute } from '../variables.js';
import { readJsonPath, toExecutionUnits, type ClassifiedStep, type ExecutionUnit } from './steps.js';

/**
 * testmd v2 execution: one browser session, steps executed in order.
 *  - API steps run as plain fetch() — no model, results feed {{variables}}.
 *  - Verify steps run as deterministic Playwright checks — no model.
 *  - Consecutive plain-English steps run as ONE agent objective against the
 *    SAME page, so context (login state, cart, navigation) carries through.
 *
 * The first failing unit stops the test (arrange-act-assert semantics: a
 * failed arrange makes every later verdict meaningless).
 */

export interface AgentBlockResult {
    status: RunStatus;
    summary: string;
    finalState: Record<string, string>;
    stepsExecuted: number;
    tokensIn?: number;
    tokensOut?: number;
}

export interface V2Deps {
    /** Run one agent block against the persistent page. */
    runAgentBlock(objective: string, seedState: Record<string, string>, remainingSec: number): Promise<AgentBlockResult>;
    page: AssertablePage;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

export interface V2RunInput {
    title: string;
    units: ExecutionUnit[];
    variables: Record<string, VariableValue>;
    timeoutSec: number;
    reporter: Reporter;
}

function agentObjective(title: string, steps: string[], isFirstUnit: boolean): string {
    return [
        `You are executing part of the test "${title}". Perform the following steps in order and verify each succeeds:`,
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        ...(isFirstUnit ? [] : ['The browser is already mid-test: continue from the page as it is now. Do not navigate away unless a step says so.']),
    ].join('\n');
}

export async function executeV2(input: V2RunInput, deps: V2Deps): Promise<RunResult> {
    const now = deps.now ?? Date.now;
    const fetchImpl = deps.fetchImpl ?? fetch;
    const start = now();
    const deadline = start + input.timeoutSec * 1000;

    const state: Record<string, string> = {};
    const assertions: AssertionResult[] = [];
    let stepNumber = 0;
    let stepsExecuted = 0;
    let tokensIn = 0;
    let tokensOut = 0;

    /** Variables + values stored by earlier steps, later wins. */
    const varsForSubstitute = (): Record<string, VariableValue> => ({
        ...input.variables,
        ...Object.fromEntries(Object.entries(state).map(([k, v]) => [k, { value: v }])),
    });

    const finish = (status: RunStatus, summary: string): RunResult => {
        const failedAssertions = assertions.filter((a) => !a.passed).length;
        const summaryFull = assertions.length > 0
            ? `${summary} Assertions: ${assertions.length - failedAssertions}/${assertions.length} passed.`
            : summary;
        const assertionsSummary: AssertionsSummary | undefined = assertions.length > 0
            ? { passed: assertions.length - failedAssertions, failed: failedAssertions, details: assertions }
            : undefined;
        return {
            status,
            summary: summaryFull,
            finalState: state,
            stepsExecuted,
            durationMs: now() - start,
            ...(assertionsSummary ? { assertions: assertionsSummary } : {}),
            ...(tokensIn > 0 ? { tokensIn } : {}),
            ...(tokensOut > 0 ? { tokensOut } : {}),
        };
    };

    for (let u = 0; u < input.units.length; u++) {
        if (now() > deadline) {
            return finish('timeout', `Timed out after ${input.timeoutSec}s at step ${stepNumber + 1}.`);
        }
        const unit = input.units[u];

        if (unit.type === 'api') {
            stepNumber += 1;
            const api = unit.step;
            const url = substitute(api.url, varsForSubstitute());
            const body = api.body ? substitute(api.body, varsForSubstitute()) : undefined;
            input.reporter.step({ type: 'step', step: stepNumber, status: 'running', action: 'api', remark: `${api.method} ${url}` });
            let response: Response;
            let responseText = '';
            try {
                response = await fetchImpl(url, {
                    method: api.method,
                    ...(body !== undefined
                        ? { body, headers: { 'content-type': 'application/json' } }
                        : {}),
                });
                responseText = await response.text();
            } catch (err) {
                input.reporter.step({ type: 'step', step: stepNumber, status: 'failed', action: 'api', remark: `${api.method} ${url} unreachable: ${(err as Error).message}` });
                return finish('failed', `API step failed: ${api.method} ${url} unreachable (${(err as Error).message}).`);
            }
            stepsExecuted += 1;

            let parsedJson: unknown;
            const json = (): unknown => {
                if (parsedJson === undefined) {
                    try {
                        parsedJson = JSON.parse(responseText);
                    } catch {
                        parsedJson = null;
                    }
                }
                return parsedJson;
            };

            for (const exp of api.expect) {
                if (exp.status !== undefined && response.status !== exp.status) {
                    const remark = `expected status ${exp.status}, got ${response.status}`;
                    input.reporter.step({ type: 'step', step: stepNumber, status: 'failed', action: 'api', remark });
                    assertions.push({ step: `${api.step} -> Expect status ${exp.status}`, passed: false, expected: `status ${exp.status}`, actual: String(response.status) });
                    return finish('failed', `API step failed: ${api.method} ${url}: ${remark}.`);
                }
                if (exp.status !== undefined) {
                    assertions.push({ step: `${api.step} -> Expect status ${exp.status}`, passed: true, expected: `status ${exp.status}`, actual: String(response.status) });
                }
                if (exp.storePath && exp.storeAs) {
                    const value = readJsonPath(json(), exp.storePath);
                    if (value === undefined) {
                        const remark = `response has no value at ${exp.storePath}`;
                        input.reporter.step({ type: 'step', step: stepNumber, status: 'failed', action: 'api', remark });
                        return finish('failed', `API step failed: ${remark} (${api.method} ${url}).`);
                    }
                    state[exp.storeAs] = typeof value === 'string' ? value : JSON.stringify(value);
                }
            }
            input.reporter.step({ type: 'step', step: stepNumber, status: 'passed', action: 'api', remark: `${api.method} ${url} -> ${response.status}` });
            continue;
        }

        if (unit.type === 'verify') {
            stepNumber += 1;
            input.reporter.step({ type: 'step', step: stepNumber, status: 'running', action: 'verify', remark: unit.step.step });
            const result = await executeAssertion(deps.page, unit.step.assertion, unit.step.step, state);
            assertions.push(result);
            stepsExecuted += 1;
            input.reporter.step({
                type: 'step',
                step: stepNumber,
                status: result.passed ? 'passed' : 'failed',
                action: 'verify',
                remark: result.passed ? unit.step.step : `${unit.step.step} — expected ${result.expected}, got ${result.actual}`,
            });
            if (!result.passed) {
                return finish('failed', `Assertion failed: ${unit.step.step} (expected ${result.expected}, got ${result.actual}).`);
            }
            continue;
        }

        // Agent block: consecutive plain-English steps as one objective.
        const remainingSec = Math.max(1, Math.floor((deadline - now()) / 1000));
        const objective = agentObjective(input.title, unit.steps, u === 0);
        const block = await deps.runAgentBlock(objective, { ...state }, remainingSec);
        stepsExecuted += block.stepsExecuted;
        stepNumber += unit.steps.length;
        tokensIn += block.tokensIn ?? 0;
        tokensOut += block.tokensOut ?? 0;
        Object.assign(state, block.finalState);
        for (let j = 0; j < unit.steps.length; j++) {
            if (unit.judged[j]) {
                assertions.push({ step: unit.steps[j], passed: block.status === 'passed', judged: true });
            }
        }
        if (block.status !== 'passed') {
            return finish(block.status, block.summary);
        }
    }

    return finish('passed', `All ${stepNumber} steps completed.`);
}

export { toExecutionUnits };
export type { ClassifiedStep };
