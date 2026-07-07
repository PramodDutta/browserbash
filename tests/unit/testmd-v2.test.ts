import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Reporter } from '../../src/output.js';
import { parseFrontmatter, parseTestMd } from '../../src/testmd/parser.js';
import { classifySteps, readJsonPath, toExecutionUnits } from '../../src/testmd/steps.js';
import { executeV2, type AgentBlockResult } from '../../src/testmd/v2-runner.js';
import type { AssertablePage } from '../../src/engine/assertions.js';

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-v2-'));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('frontmatter parsing', () => {
    it('reads version and auth, leaves body intact', () => {
        const { meta, body } = parseFrontmatter('---\nversion: 2\nauth: admin\n---\n# T\n- step\n');
        expect(meta).toEqual({ version: '2', auth: 'admin' });
        expect(body).toContain('# T');
    });
    it('files without frontmatter stay version 1', () => {
        const f = path.join(dir, 'a_test.md');
        fs.writeFileSync(f, '# A\n- Open https://x.dev\n');
        expect(parseTestMd(f).version).toBe(1);
    });
    it('files with version 2 parse steps normally', () => {
        const f = path.join(dir, 'b_test.md');
        fs.writeFileSync(f, '---\nversion: 2\nauth: staging\n---\n# B\n- Open https://x.dev\n- Verify the title is \'X\'\n');
        const parsed = parseTestMd(f);
        expect(parsed.version).toBe(2);
        expect(parsed.auth).toBe('staging');
        expect(parsed.steps).toHaveLength(2);
    });
    it('rejects unknown versions with the fix', () => {
        const f = path.join(dir, 'c_test.md');
        fs.writeFileSync(f, '---\nversion: 3\n---\n# C\n- x\n');
        expect(() => parseTestMd(f)).toThrow(/use 1 or 2/);
    });
});

describe('step classification', () => {
    it('classifies api + expect, verify, and groups consecutive actions', () => {
        const classified = classifySteps([
            'POST {{base_url}}/api/seed with body {"sku": "tshirt"}',
            "Expect status 201, store $.id as 'order_id'",
            'Open {{base_url}}/cart',
            'Click the checkout button',
            "Verify the URL contains 'checkout'",
            'Verify the page vibe is good',
        ]);
        expect(classified.map((c) => c.type)).toEqual(['api', 'action', 'action', 'verify', 'verify-judged']);
        const units = toExecutionUnits(classified);
        expect(units.map((u) => u.type)).toEqual(['api', 'agent', 'verify', 'agent']);
        expect(units[1].type === 'agent' && units[1].steps).toEqual(['Open {{base_url}}/cart', 'Click the checkout button']);
    });

    it('rejects orphan Expect lines', () => {
        expect(() => classifySteps(['Expect status 200'])).toThrow(/directly follow an API step/);
    });

    it('reads json dot-paths', () => {
        expect(readJsonPath({ data: { id: 7, items: [{ sku: 'a' }] } }, '$.data.id')).toBe(7);
        expect(readJsonPath({ data: { items: [{ sku: 'a' }] } }, 'data.items.0.sku')).toBe('a');
        expect(readJsonPath({ a: 1 }, '$.missing.deep')).toBeUndefined();
    });
});

function page(state: { url?: string; visibleTexts?: string[] }): AssertablePage {
    const loc = (visible: boolean) => ({
        first: () => loc(visible),
        waitFor: async () => {
            if (!visible) throw new Error('not visible');
        },
        count: async () => 0,
    });
    return {
        url: () => state.url ?? 'https://x.dev/',
        title: async () => 'T',
        getByText: (t) => loc(Boolean(state.visibleTexts?.includes(t))),
        getByRole: () => loc(false),
        locator: () => loc(false),
    };
}

const reporter = new Reporter(true); // NDJSON to stdout; harmless in tests

describe('executeV2', () => {
    const fetchOk = (status: number, body: unknown): typeof fetch =>
        (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

    it('runs api -> agent -> verify, threading stored state through', async () => {
        const agentCalls: string[] = [];
        const result = await executeV2(
            {
                title: 'Checkout',
                units: toExecutionUnits(classifySteps([
                    'POST https://api.x.dev/seed with body {"sku": "tshirt"}',
                    "Expect status 201, store $.id as 'order_id'",
                    'Open https://x.dev/cart',
                    "Verify the URL contains 'cart'",
                    "Verify stored 'order_id' equals '42'",
                ])),
                variables: {},
                timeoutSec: 60,
                reporter,
            },
            {
                page: page({ url: 'https://x.dev/cart' }),
                fetchImpl: fetchOk(201, { id: 42 }),
                runAgentBlock: async (objective): Promise<AgentBlockResult> => {
                    agentCalls.push(objective);
                    return { status: 'passed', summary: 'done', finalState: { heading: 'Cart' }, stepsExecuted: 2, tokensIn: 100, tokensOut: 20 };
                },
            },
        );
        expect(result.status).toBe('passed');
        expect(result.finalState.order_id).toBe('42');
        expect(result.finalState.heading).toBe('Cart');
        expect(result.assertions?.passed).toBe(3); // status expect + 2 verifies
        expect(result.tokensIn).toBe(100);
        expect(agentCalls).toHaveLength(1);
        expect(agentCalls[0]).toContain('Open https://x.dev/cart');
    });

    it('fails fast on a wrong API status', async () => {
        const result = await executeV2(
            {
                title: 'Seed',
                units: toExecutionUnits(classifySteps(['POST https://api.x.dev/seed', 'Expect status 201'])),
                variables: {},
                timeoutSec: 60,
                reporter,
            },
            {
                page: page({}),
                fetchImpl: fetchOk(500, { error: 'boom' }),
                runAgentBlock: async () => {
                    throw new Error('agent must not run');
                },
            },
        );
        expect(result.status).toBe('failed');
        expect(result.summary).toContain('expected status 201, got 500');
        expect(result.assertions?.failed).toBe(1);
    });

    it('fails on a deterministic assertion with evidence and stops', async () => {
        let agentRan = 0;
        const result = await executeV2(
            {
                title: 'V',
                units: toExecutionUnits(classifySteps([
                    "Verify the URL contains 'checkout'",
                    'Click something',
                ])),
                variables: {},
                timeoutSec: 60,
                reporter,
            },
            {
                page: page({ url: 'https://x.dev/cart' }),
                runAgentBlock: async () => {
                    agentRan++;
                    return { status: 'passed', summary: '', finalState: {}, stepsExecuted: 1 };
                },
            },
        );
        expect(result.status).toBe('failed');
        expect(result.summary).toContain("Verify the URL contains 'checkout'");
        expect(agentRan).toBe(0);
    });

    it('marks judged verifies in the assertion summary', async () => {
        const result = await executeV2(
            {
                title: 'J',
                units: toExecutionUnits(classifySteps(['Verify the page vibe is good'])),
                variables: {},
                timeoutSec: 60,
                reporter,
            },
            {
                page: page({}),
                runAgentBlock: async () => ({ status: 'passed', summary: 'looks fine', finalState: {}, stepsExecuted: 1 }),
            },
        );
        expect(result.status).toBe('passed');
        expect(result.assertions?.details[0]).toMatchObject({ judged: true, passed: true });
    });

    it('substitutes variables and stored values into API urls and bodies', async () => {
        let seenUrl = '';
        let seenBody = '';
        const fetchSpy: typeof fetch = (async (url: string, init?: RequestInit) => {
            seenUrl = String(url);
            seenBody = String(init?.body ?? '');
            return new Response('{}', { status: 200 });
        }) as unknown as typeof fetch;
        await executeV2(
            {
                title: 'S',
                units: toExecutionUnits(classifySteps([
                    'GET {{base_url}}/api/orders',
                    'Expect status 200',
                    'POST {{base_url}}/api/orders with body {"user": "{{user}}"}',
                ])),
                variables: { base_url: { value: 'https://api.x.dev' }, user: { value: 'pramod' } },
                timeoutSec: 60,
                reporter,
            },
            { page: page({}), fetchImpl: fetchSpy, runAgentBlock: async () => ({ status: 'passed', summary: '', finalState: {}, stepsExecuted: 0 }) },
        );
        expect(seenUrl).toBe('https://api.x.dev/api/orders');
        expect(seenBody).toBe('{"user": "pramod"}');
    });
});
