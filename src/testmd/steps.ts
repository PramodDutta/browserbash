import { parseAssertion, type ParsedAssertion } from '../engine/assertions.js';

/**
 * testmd v2 step classification. Each step is exactly one of:
 *  - api:    deterministic HTTP call, no model
 *            "POST {{base_url}}/api/seed with body {\"sku\": \"tshirt\"}"
 *            followed optionally by "Expect status 201, store $.id as 'order_id'"
 *  - verify: deterministic assertion, no model (see engine/assertions.ts)
 *  - action: plain English for the browser agent; CONSECUTIVE actions are
 *            grouped into one agent objective to keep model calls low.
 */

export interface ApiExpectation {
    status?: number;
    /** Dot-path into the response JSON, stored under storeAs. */
    storePath?: string;
    storeAs?: string;
}

export type ClassifiedStep =
    | { type: 'api'; method: string; url: string; body?: string; expect: ApiExpectation[]; step: string }
    | { type: 'verify'; assertion: ParsedAssertion; step: string }
    | { type: 'verify-judged'; step: string }
    | { type: 'action'; step: string };

const API_RE = /^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)(?:\s+with\s+body\s+(.+))?$/i;
const EXPECT_RE = /^Expect\s+status\s+(\d+)(?:\s*,\s*store\s+(\S+)\s+as\s+['"]([\w.-]+)['"])?$/i;

export function classifySteps(steps: string[]): ClassifiedStep[] {
    const out: ClassifiedStep[] = [];
    for (const step of steps) {
        const api = step.match(API_RE);
        if (api) {
            out.push({ type: 'api', method: api[1].toUpperCase(), url: api[2], body: api[3], expect: [], step });
            continue;
        }
        const expect = step.match(EXPECT_RE);
        if (expect) {
            const prev = out[out.length - 1];
            if (!prev || prev.type !== 'api') {
                throw new Error(`"${step}" must directly follow an API step (GET/POST/... line)`);
            }
            prev.expect.push({
                status: Number(expect[1]),
                storePath: expect[2],
                storeAs: expect[3],
            });
            continue;
        }
        const assertion = parseAssertion(step);
        if (assertion) {
            out.push({ type: 'verify', assertion, step });
            continue;
        }
        if (assertion === undefined) {
            // A Verify line no deterministic grammar matched: the agent judges
            // it, and the result is flagged so consumers can tell.
            out.push({ type: 'verify-judged', step });
            continue;
        }
        out.push({ type: 'action', step });
    }
    return out;
}

/** Group consecutive agent-bound steps (action + verify-judged) into blocks. */
export type ExecutionUnit =
    | { type: 'api'; step: Extract<ClassifiedStep, { type: 'api' }> }
    | { type: 'verify'; step: Extract<ClassifiedStep, { type: 'verify' }> }
    | { type: 'agent'; steps: string[]; judged: boolean[] };

export function toExecutionUnits(classified: ClassifiedStep[]): ExecutionUnit[] {
    const units: ExecutionUnit[] = [];
    for (const c of classified) {
        if (c.type === 'api') {
            units.push({ type: 'api', step: c });
        } else if (c.type === 'verify') {
            units.push({ type: 'verify', step: c });
        } else {
            const last = units[units.length - 1];
            if (last && last.type === 'agent') {
                last.steps.push(c.step);
                last.judged.push(c.type === 'verify-judged');
            } else {
                units.push({ type: 'agent', steps: [c.step], judged: [c.type === 'verify-judged'] });
            }
        }
    }
    return units;
}

/** Read a dot-path ("$.data.id" or "data.id") out of parsed JSON. */
export function readJsonPath(value: unknown, pathExpr: string): unknown {
    const parts = pathExpr.replace(/^\$\.?/, '').split('.').filter(Boolean);
    let current: unknown = value;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') return undefined;
        const key: string | number = /^\d+$/.test(part) ? Number(part) : part;
        current = (current as Record<string | number, unknown>)[key];
    }
    return current;
}
