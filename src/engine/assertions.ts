import type { AssertionResult } from '../types.js';

/**
 * Deterministic `Verify ...` assertions (testmd v2). A matched Verify step is
 * executed as a real Playwright check with NO model in the loop, so a pass
 * means the condition held and a fail means it did not — never "the agent
 * felt it was fine". Unmatched Verify lines fall back to the agent and are
 * flagged `judged: true` so consumers can tell the difference.
 *
 * Grammar (case-insensitive; quotes may be ' or "):
 *   Verify the URL contains '<text>'
 *   Verify the title is '<text>'          | Verify the title contains '<text>'
 *   Verify the text '<text>' is visible   | Verify '<text>' is visible
 *   Verify the '<name>' <button|link|heading|checkbox|textbox> is visible
 *   Verify <N> elements match `<css>`     | Verify `<css>` count is <N>
 *   Verify stored '<key>' equals '<value>'
 */

export type ParsedAssertion =
    | { kind: 'url_contains'; text: string }
    | { kind: 'title_is'; text: string }
    | { kind: 'title_contains'; text: string }
    | { kind: 'text_visible'; text: string }
    | { kind: 'role_visible'; role: string; name: string }
    | { kind: 'count'; selector: string; expected: number }
    | { kind: 'stored_equals'; key: string; value: string };

const Q = `['"]`; // quote class

function rx(pattern: string): RegExp {
    return new RegExp(`^${pattern}$`, 'i');
}

const ROLES = 'button|link|heading|checkbox|textbox|tab|dialog|menuitem|option|row';

const GRAMMAR: Array<{ re: RegExp; build: (m: RegExpMatchArray) => ParsedAssertion }> = [
    { re: rx(`Verify (?:that )?(?:the )?URL contains ${Q}(.+?)${Q}`), build: (m) => ({ kind: 'url_contains', text: m[1] }) },
    { re: rx(`Verify (?:that )?(?:the )?(?:page )?title is ${Q}(.+?)${Q}`), build: (m) => ({ kind: 'title_is', text: m[1] }) },
    { re: rx(`Verify (?:that )?(?:the )?(?:page )?title contains ${Q}(.+?)${Q}`), build: (m) => ({ kind: 'title_contains', text: m[1] }) },
    { re: rx(`Verify (?:that )?(?:the )?text ${Q}(.+?)${Q} is visible`), build: (m) => ({ kind: 'text_visible', text: m[1] }) },
    { re: rx(`Verify (?:that )?${Q}(.+?)${Q} is visible`), build: (m) => ({ kind: 'text_visible', text: m[1] }) },
    {
        re: rx(`Verify (?:that )?(?:the )?${Q}(.+?)${Q} (${ROLES}) is visible`),
        build: (m) => ({ kind: 'role_visible', role: m[2].toLowerCase(), name: m[1] }),
    },
    { re: rx('Verify (?:that )?(\\d+) elements? match `(.+?)`'), build: (m) => ({ kind: 'count', selector: m[2], expected: Number(m[1]) }) },
    { re: rx('Verify (?:that )?`(.+?)` count is (\\d+)'), build: (m) => ({ kind: 'count', selector: m[1], expected: Number(m[2]) }) },
    {
        re: rx(`Verify (?:that )?stored ${Q}([\\w.-]+)${Q} equals ${Q}(.*?)${Q}`),
        build: (m) => ({ kind: 'stored_equals', key: m[1], value: m[2] }),
    },
];

/** null = not a Verify step at all; undefined = Verify, but no grammar match (agent judges it). */
export function parseAssertion(step: string): ParsedAssertion | null | undefined {
    const trimmed = step.trim();
    if (!/^verify\b/i.test(trimmed)) return null;
    for (const { re, build } of GRAMMAR) {
        const m = trimmed.match(re);
        if (m) return build(m);
    }
    return undefined;
}

/**
 * The slice of Playwright's Page the executor needs — narrow on purpose so
 * tests can drive it with a fake and the executor stays engine-agnostic.
 */
export interface AssertablePage {
    url(): string;
    title(): Promise<string>;
    getByText(text: string, options?: { exact?: boolean }): AssertableLocator;
    getByRole(role: string, options?: { name?: string }): AssertableLocator;
    locator(selector: string): AssertableLocator;
}

export interface AssertableLocator {
    first(): AssertableLocator;
    waitFor(options: { state: 'visible'; timeout: number }): Promise<void>;
    count(): Promise<number>;
}

const POLL_MS = 200;

async function pollUntil(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return true;
        if (Date.now() >= deadline) return false;
        await new Promise((r) => setTimeout(r, POLL_MS));
    }
}

/** Execute one parsed assertion against the live page. Never throws. */
export async function executeAssertion(
    page: AssertablePage,
    assertion: ParsedAssertion,
    step: string,
    storedState: Record<string, string>,
    timeoutMs = 5000,
): Promise<AssertionResult> {
    try {
        switch (assertion.kind) {
            case 'url_contains': {
                const ok = await pollUntil(async () => page.url().includes(assertion.text), timeoutMs);
                return { step, passed: ok, expected: `URL contains '${assertion.text}'`, actual: page.url() };
            }
            case 'title_is': {
                let last = '';
                const ok = await pollUntil(async () => {
                    last = await page.title();
                    return last === assertion.text;
                }, timeoutMs);
                return { step, passed: ok, expected: `title is '${assertion.text}'`, actual: last };
            }
            case 'title_contains': {
                let last = '';
                const ok = await pollUntil(async () => {
                    last = await page.title();
                    return last.includes(assertion.text);
                }, timeoutMs);
                return { step, passed: ok, expected: `title contains '${assertion.text}'`, actual: last };
            }
            case 'text_visible': {
                try {
                    await page.getByText(assertion.text, { exact: false }).first().waitFor({ state: 'visible', timeout: timeoutMs });
                    return { step, passed: true, expected: `text '${assertion.text}' visible` };
                } catch {
                    return { step, passed: false, expected: `text '${assertion.text}' visible`, actual: 'not visible within timeout' };
                }
            }
            case 'role_visible': {
                try {
                    await page.getByRole(assertion.role, { name: assertion.name }).first().waitFor({ state: 'visible', timeout: timeoutMs });
                    return { step, passed: true, expected: `${assertion.role} '${assertion.name}' visible` };
                } catch {
                    return { step, passed: false, expected: `${assertion.role} '${assertion.name}' visible`, actual: 'not visible within timeout' };
                }
            }
            case 'count': {
                let last = -1;
                const ok = await pollUntil(async () => {
                    last = await page.locator(assertion.selector).count();
                    return last === assertion.expected;
                }, timeoutMs);
                return { step, passed: ok, expected: `${assertion.expected} elements match ${assertion.selector}`, actual: String(last) };
            }
            case 'stored_equals': {
                const actual = storedState[assertion.key];
                return {
                    step,
                    passed: actual === assertion.value,
                    expected: `stored '${assertion.key}' equals '${assertion.value}'`,
                    actual: actual === undefined ? '(never stored)' : actual,
                };
            }
        }
    } catch (err) {
        return { step, passed: false, expected: step, actual: `assertion crashed: ${(err as Error).message}` };
    }
}
