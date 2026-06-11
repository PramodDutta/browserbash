import { describe, it, expect } from 'vitest';
import { WaitlistInput, addToWaitlist, type QueryFn } from './waitlist';
import { throttled } from './throttle';

function stubDb(existing: string[]): QueryFn {
    const rows = [...existing];
    return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const q = strings.join('?');
        if (q.includes('INSERT')) {
            const email = String(values[0]);
            if (rows.includes(email)) return [];
            rows.push(email);
            return [{ id: rows.length }];
        }
        return [{ count: rows.length }];
    }) as QueryFn;
}

describe('WaitlistInput', () => {
    it('normalizes email to lowercase + trimmed', () => {
        expect(WaitlistInput.parse({ email: ' Pramod@X.COM ' }).email).toBe('pramod@x.com');
    });

    it('rejects invalid email', () => {
        expect(() => WaitlistInput.parse({ email: 'nope' })).toThrow();
    });

    it('rejects filled honeypot', () => {
        expect(() => WaitlistInput.parse({ email: 'a@b.co', website: 'spam' })).toThrow();
    });

    it('accepts optional name and useCase', () => {
        const p = WaitlistInput.parse({ email: 'a@b.co', name: 'Bo', useCase: 'smash flaky tests' });
        expect(p.name).toBe('Bo');
        expect(p.useCase).toBe('smash flaky tests');
    });
});

describe('addToWaitlist', () => {
    it('inserts and returns position', async () => {
        const r = await addToWaitlist(stubDb([]), { email: 'a@b.co' });
        expect(r).toEqual({ position: 1, already: false });
    });

    it('duplicate email is idempotent', async () => {
        const r = await addToWaitlist(stubDb(['a@b.co']), { email: 'a@b.co' });
        expect(r.already).toBe(true);
        expect(r.position).toBe(1);
    });
});

describe('throttled', () => {
    it('allows up to the limit then blocks', () => {
        const ip = `ip-${Math.random()}`;
        for (let i = 0; i < 5; i++) expect(throttled(ip)).toBe(false);
        expect(throttled(ip)).toBe(true);
    });
});
