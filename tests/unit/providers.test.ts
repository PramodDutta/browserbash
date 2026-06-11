import { describe, it, expect } from 'vitest';
import { getProvider, listProviders } from '../../dist/providers/index.js';

describe('provider registry', () => {
    it('lists exactly the 5 documented providers', () => {
        expect(listProviders().map((p) => p.id).sort()).toEqual(
            ['browserbase', 'browserstack', 'cdp', 'lambdatest', 'local'],
        );
    });

    it('every provider has a description', () => {
        for (const p of listProviders()) {
            expect(p.description.length).toBeGreaterThan(10);
        }
    });

    it('getProvider throws helpfully on unknown id', () => {
        expect(() => getProvider('nope')).toThrow(/nope|unknown/i);
    });
});
