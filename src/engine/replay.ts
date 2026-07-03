import type { Page } from 'playwright-core';
import type { Reporter } from '../output.js';
import type { VariableValue } from '../types.js';
import { substitute } from '../variables.js';
import { normalizeUrl, type ActionJournal, type RecordedAction } from '../cache-store.js';

/** Replay stopped on a stale entry: heal from this point. */
export class ReplayMiss extends Error {
    constructor(
        message: string,
        /** Actions that replayed green before the miss. */
        readonly completedActions: RecordedAction[],
        /** extract values collected before the miss. */
        readonly finalStateSoFar: Record<string, string>,
    ) {
        super(message);
        this.name = 'ReplayMiss';
    }
}

/** Origin pin violated: fail closed, never heal, never substitute. */
export class ReplaySecurityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReplaySecurityError';
    }
}

const PRECHECK_TIMEOUT_MS = 5_000;
const ACTION_TIMEOUT_MS = 15_000;

function locate(page: Page, target: string): ReturnType<Page['locator']> {
    if (target.startsWith('text=')) return page.getByText(target.slice(5), { exact: false });
    return page.locator(target);
}

/**
 * Replay a recorded journal against a live page with zero model calls.
 * Returns the collected finalState on full success. Throws ReplayMiss when
 * the page no longer matches (caller heals with the agent), and
 * ReplaySecurityError when an origin pin fails (caller must NOT heal).
 */
export async function replayJournal(
    page: Page,
    journal: ActionJournal,
    variables: Record<string, VariableValue>,
    reporter: Reporter,
): Promise<Record<string, string>> {
    const finalState: Record<string, string> = {};
    const completed: RecordedAction[] = [];
    let step = 0;

    for (const action of journal.actions) {
        step += 1;

        // Origin pin: an action that will receive substituted variable values
        // must run on the origin it was recorded on. This holds even if a
        // tampered journal navigated elsewhere first, because the pin checks
        // the LIVE page origin immediately before substitution.
        if (action.carriesVariables) {
            const live = normalizeUrl(page.url()).origin;
            if (!action.origin || live !== action.origin) {
                throw new ReplaySecurityError(
                    `Replay blocked: cached action ${step} (${action.tool}) was recorded on ${action.origin || 'an unknown origin'} but the page is on ${live}. ` +
                    'The cache entry was not trusted with variable values. Delete it (--refresh-cache) to re-record.',
                );
            }
        }

        const input: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(action.input)) {
            input[k] = typeof v === 'string' ? substitute(v, variables) : v;
        }

        const emit = (status: 'running' | 'passed' | 'failed', remark: string): void => {
            reporter.step({ type: 'step', step, status, action: action.tool, remark, cached: true });
        };
        emit('running', describeReplay(action.tool, input));

        try {
            switch (action.tool) {
                case 'navigate': {
                    await page.goto(String(input.url), { waitUntil: 'domcontentloaded', timeout: 60_000 });
                    break;
                }
                case 'click': {
                    const target = locate(page, String(input.target)).first();
                    await target.waitFor({ state: 'visible', timeout: PRECHECK_TIMEOUT_MS });
                    await target.click({ timeout: ACTION_TIMEOUT_MS });
                    break;
                }
                case 'type_text': {
                    const target = locate(page, String(input.target)).first();
                    await target.waitFor({ state: 'visible', timeout: PRECHECK_TIMEOUT_MS });
                    await target.fill(String(input.text), { timeout: ACTION_TIMEOUT_MS });
                    if (input.press_enter === true) await target.press('Enter');
                    break;
                }
                case 'wait_for': {
                    await locate(page, String(input.target)).first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS });
                    break;
                }
                case 'extract': {
                    const target = locate(page, String(input.target)).first();
                    await target.waitFor({ state: 'visible', timeout: PRECHECK_TIMEOUT_MS });
                    const text = (await target.textContent({ timeout: ACTION_TIMEOUT_MS }))?.trim() ?? '';
                    finalState[String(input.store_as)] = text;
                    break;
                }
            }
        } catch (err) {
            const message = (err as Error).message.split('\n')[0];
            emit('failed', message);
            throw new ReplayMiss(
                `Cached action ${step} (${action.tool}) no longer matches the page: ${message}`,
                completed,
                finalState,
            );
        }

        emit('passed', describeReplay(action.tool, input));
        completed.push(action);
    }

    return finalState;
}

function describeReplay(tool: string, input: Record<string, unknown>): string {
    switch (tool) {
        case 'navigate': return `goto ${String(input.url)} (cached)`;
        case 'click': return `click ${String(input.target)} (cached)`;
        case 'type_text': return `type into ${String(input.target)} (cached)`;
        case 'wait_for': return `wait for ${String(input.target)} (cached)`;
        case 'extract': return `extract ${String(input.target)} as ${String(input.store_as)} (cached)`;
        default: return `${tool} (cached)`;
    }
}
