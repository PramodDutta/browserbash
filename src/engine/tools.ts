import type Anthropic from '@anthropic-ai/sdk';
import type { Page } from 'playwright-core';

/** Tool surface the model drives the browser with. */
export const BROWSER_TOOLS: Anthropic.Tool[] = [
    {
        name: 'navigate',
        description: 'Navigate the browser to a URL. Call this first when the objective mentions a site.',
        input_schema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Absolute URL including protocol' } },
            required: ['url'],
        },
    },
    {
        name: 'snapshot',
        description: 'Get an accessibility-oriented snapshot of the current page: URL, title, and visible interactive elements (links, buttons, inputs) with stable ref ids. Call this before interacting so you know what is on screen.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'click',
        description: 'Click an element. Prefer the ref id from the latest snapshot; a CSS selector or exact visible text also works.',
        input_schema: {
            type: 'object',
            properties: { target: { type: 'string', description: 'ref:<id> from snapshot, a CSS selector, or text=<visible text>' } },
            required: ['target'],
        },
    },
    {
        name: 'type_text',
        description: 'Type text into an input element, replacing its current value. Optionally press Enter afterwards.',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'ref:<id> from snapshot, a CSS selector, or text=<label>' },
                text: { type: 'string' },
                press_enter: { type: 'boolean', description: 'Press Enter after typing' },
            },
            required: ['target', 'text'],
        },
    },
    {
        name: 'wait_for',
        description: 'Wait until an element matching the selector or text is visible (up to 15s). Use after navigation or actions that load content.',
        input_schema: {
            type: 'object',
            properties: { target: { type: 'string', description: 'CSS selector or text=<visible text>' } },
            required: ['target'],
        },
    },
    {
        name: 'extract',
        description: 'Read the text content of an element and store it under a variable name in final_state. Use when the objective says to extract, read, or "store as".',
        input_schema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'ref:<id>, CSS selector, or text=<visible text>' },
                store_as: { type: 'string', description: 'Key under which to store the value' },
            },
            required: ['target', 'store_as'],
        },
    },
    {
        name: 'done',
        description: 'Finish the run. Call when the objective is complete (status=passed) or cannot be completed (status=failed). Include a one-paragraph summary.',
        input_schema: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['passed', 'failed'] },
                summary: { type: 'string' },
            },
            required: ['status', 'summary'],
        },
    },
];

interface SnapshotElement {
    ref: number;
    role: string;
    name: string;
    selector: string;
}

/** Executes model tool calls against a Playwright page; keeps ref→selector map between snapshots. */
export class BrowserToolExecutor {
    private refs = new Map<number, string>();
    readonly finalState: Record<string, string> = {};

    constructor(private readonly page: Page) {}

    async execute(name: string, input: Record<string, unknown>): Promise<string> {
        switch (name) {
            case 'navigate': {
                await this.page.goto(String(input.url), { waitUntil: 'domcontentloaded', timeout: 60_000 });
                return `Navigated to ${this.page.url()}`;
            }
            case 'snapshot':
                return await this.snapshot();
            case 'click': {
                await this.locate(String(input.target)).first().click({ timeout: 15_000 });
                return `Clicked ${input.target}`;
            }
            case 'type_text': {
                const locator = this.locate(String(input.target)).first();
                await locator.fill(String(input.text), { timeout: 15_000 });
                if (input.press_enter === true) {
                    await locator.press('Enter');
                }
                return `Typed into ${input.target}${input.press_enter === true ? ' and pressed Enter' : ''}`;
            }
            case 'wait_for': {
                await this.locate(String(input.target)).first().waitFor({ state: 'visible', timeout: 15_000 });
                return `Element visible: ${input.target}`;
            }
            case 'extract': {
                const text = (await this.locate(String(input.target)).first().textContent({ timeout: 15_000 }))?.trim() ?? '';
                this.finalState[String(input.store_as)] = text;
                return `Stored ${input.store_as} = "${text}"`;
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    /** Current page URL (for the action journal's fingerprints). */
    currentUrl(): string {
        return this.page.url();
    }

    /**
     * Dehydrate a target for the action journal: refs are session-scoped and
     * worthless across runs, so ref:<n> becomes the concrete selector it
     * resolved to. Selectors and text= targets pass through unchanged.
     */
    resolveTarget(target: string): string {
        if (target.startsWith('ref:')) {
            return this.refs.get(Number(target.slice(4))) ?? target;
        }
        return target;
    }

    private locate(target: string): ReturnType<Page['locator']> {
        if (target.startsWith('ref:')) {
            const selector = this.refs.get(Number(target.slice(4)));
            if (!selector) {
                throw new Error(`Stale ref '${target}' — take a new snapshot first`);
            }
            return this.page.locator(selector);
        }
        if (target.startsWith('text=')) {
            return this.page.getByText(target.slice(5), { exact: false });
        }
        return this.page.locator(target);
    }

    private async snapshot(): Promise<string> {
        const elements = await this.page.evaluate((): SnapshotElement[] => {
            const out: SnapshotElement[] = [];
            const interactive = document.querySelectorAll<HTMLElement>(
                'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="textbox"], [onclick]',
            );
            let ref = 0;
            interactive.forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                ref += 1;
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${CSS.escape(el.id)}` : '';
                const testId = el.getAttribute('data-testid');
                const nameAttr = el.getAttribute('name');
                let selector: string;
                if (testId) selector = `[data-testid="${testId}"]`;
                else if (id) selector = id;
                else if (nameAttr) selector = `${tag}[name="${nameAttr}"]`;
                else {
                    const sameTag = Array.from(document.querySelectorAll(tag));
                    selector = `${tag} >> nth=${sameTag.indexOf(el)}`;
                }
                const label =
                    el.getAttribute('aria-label') ??
                    (el as HTMLInputElement).placeholder ??
                    el.textContent?.trim().slice(0, 80) ??
                    '';
                out.push({ ref, role: el.getAttribute('role') ?? tag, name: label, selector });
            });
            return out.slice(0, 120);
        });

        this.refs.clear();
        for (const el of elements) {
            this.refs.set(el.ref, el.selector);
        }

        const lines = elements.map((e) => `ref:${e.ref} [${e.role}] "${e.name}"`);
        return [
            `URL: ${this.page.url()}`,
            `Title: ${await this.page.title()}`,
            'Interactive elements:',
            ...lines,
        ].join('\n');
    }
}
