import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { eventsToSteps, renderRecordedTestMd, type RecordedEvent } from './events.js';

/**
 * Interactive recorder (`browserbash record <url>`): a visible Chrome window
 * captures the human's clicks and typing via an injected capture script, and
 * Ctrl-C (or --seconds) turns the log into a plain-English *_test.md.
 *
 * Password fields are special-cased IN THE BROWSER: their values never cross
 * the binding, only a secret marker does.
 */

const CAPTURE_SCRIPT = `
(() => {
    if (window.__bbRecordInstalled) return;
    window.__bbRecordInstalled = true;

    function describe(el) {
        if (!el || !el.tagName) return 'the element';
        const tag = el.tagName.toLowerCase();
        const aria = el.getAttribute && el.getAttribute('aria-label');
        if (aria) return "the '" + aria.slice(0, 40) + "' " + (tag === 'a' ? 'link' : tag === 'button' ? 'button' : 'element');
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            const label = el.labels && el.labels[0] && el.labels[0].textContent && el.labels[0].textContent.trim();
            if (label) return "the '" + label.slice(0, 40) + "' field";
            if (el.placeholder) return "the field with placeholder '" + el.placeholder.slice(0, 40) + "'";
            if (el.name) return "the '" + el.name + "' field";
            return 'the ' + (el.type || tag) + ' field';
        }
        const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
        if (tag === 'button' || (el.getAttribute && el.getAttribute('role')) === 'button') return text ? "the '" + text + "' button" : 'the button';
        if (tag === 'a') return text ? "the '" + text + "' link" : 'the link';
        if (text) return "'" + text + "'";
        return 'the ' + tag + ' element';
    }

    function interactive(el) {
        while (el && el !== document.body) {
            const tag = (el.tagName || '').toLowerCase();
            if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') return el;
            if (el.getAttribute && (el.getAttribute('role') === 'button' || el.getAttribute('onclick'))) return el;
            el = el.parentElement;
        }
        return null;
    }

    function emit(event) {
        try { window.__bbRecordEmit(JSON.stringify(Object.assign({ ts: Date.now() }, event))); } catch (e) {}
    }

    document.addEventListener('click', (e) => {
        const el = interactive(e.target) || e.target;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
            emit({ kind: 'check', target: describe(el) });
            return;
        }
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return; // focus, not action
        emit({ kind: 'click', target: describe(el) });
    }, true);

    document.addEventListener('change', (e) => {
        const el = e.target;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'select') {
            const opt = el.selectedOptions && el.selectedOptions[0];
            emit({ kind: 'select', target: describe(el), value: opt ? opt.textContent.trim() : el.value });
        } else if (tag === 'input' || tag === 'textarea') {
            if (el.type === 'checkbox' || el.type === 'radio') return; // click handler covers it
            if (el.type === 'password') {
                emit({ kind: 'input', target: describe(el), secret: true });
            } else {
                emit({ kind: 'input', target: describe(el), value: String(el.value).slice(0, 200) });
            }
        }
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const el = e.target;
        const tag = (el && el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') {
            if (el.type === 'password') emit({ kind: 'input', target: describe(el), secret: true });
            else if (tag === 'input') emit({ kind: 'input', target: describe(el), value: String(el.value).slice(0, 200) });
            emit({ kind: 'enter', target: describe(el) });
        }
    }, true);
})();
`;

export interface RecordOptions {
    url: string;
    outFile: string;
    title?: string;
    /** Auto-stop after N seconds; 0 = wait for Ctrl-C. */
    seconds?: number;
    log: (msg: string) => void;
}

export async function recordSession(options: RecordOptions): Promise<{ file: string; steps: number }> {
    const events: RecordedEvent[] = [];
    const browser = await chromium.launch({ channel: 'chrome', headless: false });
    const context = await browser.newContext();

    await context.exposeBinding('__bbRecordEmit', (_source, payload: string) => {
        try {
            events.push(JSON.parse(payload) as RecordedEvent);
        } catch {
            // malformed page payloads are dropped
        }
    });
    await context.addInitScript({ content: CAPTURE_SCRIPT });

    const page = await context.newPage();
    page.on('framenavigated', (frame) => {
        if (frame.parentFrame() !== null) return;
        const url = frame.url();
        if (url === 'about:blank') return;
        events.push({ kind: 'navigate', ts: Date.now(), url });
    });

    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    options.log('Recording. Interact with the browser window; every click and keystroke becomes a step.');
    options.log(options.seconds ? `Auto-stops in ${options.seconds}s.` : 'Press Ctrl-C here when you are done.');

    await new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
            if (!done) {
                done = true;
                resolve();
            }
        };
        process.once('SIGINT', finish);
        page.on('close', finish);
        if (options.seconds && options.seconds > 0) setTimeout(finish, options.seconds * 1000);
    });

    await browser.close().catch(() => undefined);

    const { steps, secretVars } = eventsToSteps(events);
    if (steps.length === 0) {
        throw new Error('Nothing was recorded — no interactions captured before the session ended.');
    }
    const title = options.title ?? `Recorded flow (${new URL(options.url).hostname})`;
    fs.mkdirSync(path.dirname(path.resolve(options.outFile)), { recursive: true });
    fs.writeFileSync(options.outFile, renderRecordedTestMd(title, steps, secretVars));
    return { file: options.outFile, steps: steps.length };
}
