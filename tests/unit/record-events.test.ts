import { describe, expect, it } from 'vitest';
import { eventsToSteps, renderRecordedTestMd, type RecordedEvent } from '../../src/record/events.js';

const t0 = 1_000_000;

describe('eventsToSteps', () => {
    it('keeps the first navigation, drops click-caused ones, keeps address-bar navs', () => {
        const events: RecordedEvent[] = [
            { kind: 'navigate', ts: t0, url: 'https://shop.dev/' },
            { kind: 'click', ts: t0 + 1000, target: "the 'Cart' link" },
            { kind: 'navigate', ts: t0 + 1500, url: 'https://shop.dev/cart' }, // caused by click
            { kind: 'navigate', ts: t0 + 60_000, url: 'https://shop.dev/help' }, // typed later
        ];
        expect(eventsToSteps(events).steps).toEqual([
            'Open https://shop.dev/',
            "Click the 'Cart' link",
            'Open https://shop.dev/help',
        ]);
    });

    it('collapses repeated inputs on the same field to the final value', () => {
        const events: RecordedEvent[] = [
            { kind: 'navigate', ts: t0, url: 'https://x.dev' },
            { kind: 'input', ts: t0 + 100, target: "the 'Email' field", value: 'a' },
            { kind: 'input', ts: t0 + 200, target: "the 'Email' field", value: 'a@b.co' },
        ];
        expect(eventsToSteps(events).steps).toEqual([
            'Open https://x.dev',
            "Type 'a@b.co' into the 'Email' field",
        ]);
    });

    it('collapses redirect chains to the landing URL', () => {
        const events: RecordedEvent[] = [
            { kind: 'navigate', ts: t0, url: 'https://x.dev/login' },
            { kind: 'navigate', ts: t0 + 50, url: 'https://x.dev/login?redirected=1' },
        ];
        expect(eventsToSteps(events).steps).toEqual(['Open https://x.dev/login?redirected=1']);
    });

    it('turns password inputs into secret variables, never values', () => {
        const events: RecordedEvent[] = [
            { kind: 'navigate', ts: t0, url: 'https://x.dev' },
            { kind: 'input', ts: t0 + 100, target: "the 'Password' field", secret: true },
        ];
        const { steps, secretVars } = eventsToSteps(events);
        expect(steps[1]).toBe("Type {{password}} into the 'Password' field");
        expect(secretVars).toEqual(['password']);
    });

    it('renders enter, select and check steps', () => {
        const events: RecordedEvent[] = [
            { kind: 'navigate', ts: t0, url: 'https://x.dev' },
            { kind: 'select', ts: t0 + 1, target: "the 'Country' field", value: 'India' },
            { kind: 'check', ts: t0 + 2, target: "the 'Terms' field" },
            { kind: 'enter', ts: t0 + 3, target: "the 'Search' field" },
        ];
        expect(eventsToSteps(events).steps.slice(1)).toEqual([
            "Select 'India' in the 'Country' field",
            "Check the 'Terms' field",
            "Press Enter in the 'Search' field",
        ]);
    });
});

describe('renderRecordedTestMd', () => {
    it('includes provenance and secret setup instructions', () => {
        const md = renderRecordedTestMd('Login flow', ['Open https://x.dev', 'Type {{password}} into the field'], ['password']);
        expect(md).toContain('# Login flow');
        expect(md).toContain('browserbash record');
        expect(md).toContain('"secret":true');
        expect(md).not.toContain('change-me"}}'); // valid JSON hint, not mangled
    });
});
