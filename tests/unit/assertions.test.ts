import { describe, expect, it } from 'vitest';
import { executeAssertion, parseAssertion, type AssertableLocator, type AssertablePage } from '../../src/engine/assertions.js';

describe('parseAssertion grammar', () => {
    it('parses every documented form', () => {
        expect(parseAssertion("Verify the URL contains 'inventory'")).toEqual({ kind: 'url_contains', text: 'inventory' });
        expect(parseAssertion('Verify the title is "TTACart"')).toEqual({ kind: 'title_is', text: 'TTACart' });
        expect(parseAssertion("Verify the title contains 'Cart'")).toEqual({ kind: 'title_contains', text: 'Cart' });
        expect(parseAssertion("Verify the text 'Thank you for your order!' is visible")).toEqual({ kind: 'text_visible', text: 'Thank you for your order!' });
        expect(parseAssertion("Verify 'Add to cart' is visible")).toEqual({ kind: 'text_visible', text: 'Add to cart' });
        expect(parseAssertion("Verify the 'Your Cart' heading is visible")).toEqual({ kind: 'role_visible', role: 'heading', name: 'Your Cart' });
        expect(parseAssertion('Verify 3 elements match `.cart-item`')).toEqual({ kind: 'count', selector: '.cart-item', expected: 3 });
        expect(parseAssertion('Verify `.cart-item` count is 3')).toEqual({ kind: 'count', selector: '.cart-item', expected: 3 });
        expect(parseAssertion("Verify stored 'order_id' equals '12345'")).toEqual({ kind: 'stored_equals', key: 'order_id', value: '12345' });
    });

    it('is case-insensitive and tolerates that/the', () => {
        expect(parseAssertion("verify that the url contains 'x'")).toEqual({ kind: 'url_contains', text: 'x' });
    });

    it('returns null for non-Verify steps and undefined for unparseable Verify steps', () => {
        expect(parseAssertion('Click the button')).toBeNull();
        expect(parseAssertion('Verify the page generally looks okay')).toBeUndefined();
    });
});

function fakeLocator(opts: { visible?: boolean; count?: number }): AssertableLocator {
    return {
        first: () => fakeLocator(opts),
        waitFor: async () => {
            if (!opts.visible) throw new Error('not visible');
        },
        count: async () => opts.count ?? 0,
    };
}

function fakePage(state: { url?: string; title?: string; visibleTexts?: string[]; roles?: string[]; counts?: Record<string, number> }): AssertablePage {
    return {
        url: () => state.url ?? 'https://x.dev/',
        title: async () => state.title ?? '',
        getByText: (text) => fakeLocator({ visible: state.visibleTexts?.includes(text) }),
        getByRole: (role, o) => fakeLocator({ visible: state.roles?.includes(`${role}:${o?.name ?? ''}`) }),
        locator: (sel) => fakeLocator({ count: state.counts?.[sel] ?? 0 }),
    };
}

describe('executeAssertion', () => {
    it('passes and fails url_contains with actual evidence', async () => {
        const page = fakePage({ url: 'https://x.dev/inventory.html' });
        const pass = await executeAssertion(page, { kind: 'url_contains', text: 'inventory' }, 's', {}, 300);
        expect(pass.passed).toBe(true);
        const fail = await executeAssertion(page, { kind: 'url_contains', text: 'checkout' }, 's', {}, 300);
        expect(fail.passed).toBe(false);
        expect(fail.actual).toBe('https://x.dev/inventory.html');
    });

    it('checks text and role visibility', async () => {
        const page = fakePage({ visibleTexts: ['Thank you'], roles: ['heading:Your Cart'] });
        expect((await executeAssertion(page, { kind: 'text_visible', text: 'Thank you' }, 's', {}, 300)).passed).toBe(true);
        expect((await executeAssertion(page, { kind: 'text_visible', text: 'Missing' }, 's', {}, 300)).passed).toBe(false);
        expect((await executeAssertion(page, { kind: 'role_visible', role: 'heading', name: 'Your Cart' }, 's', {}, 300)).passed).toBe(true);
    });

    it('checks element counts and stored values', async () => {
        const page = fakePage({ counts: { '.item': 3 } });
        expect((await executeAssertion(page, { kind: 'count', selector: '.item', expected: 3 }, 's', {}, 300)).passed).toBe(true);
        const stored = await executeAssertion(page, { kind: 'stored_equals', key: 'id', value: '42' }, 's', { id: '42' }, 300);
        expect(stored.passed).toBe(true);
        const missing = await executeAssertion(page, { kind: 'stored_equals', key: 'nope', value: 'x' }, 's', {}, 300);
        expect(missing.passed).toBe(false);
        expect(missing.actual).toBe('(never stored)');
    });
});
