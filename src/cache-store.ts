import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { VariableValue } from './types.js';

/**
 * Builtin-engine action journal: the replay-first cache. A green run records
 * its resolved actions; the next identical run replays them with no model.
 *
 * Security model (v1), layered:
 * - Journals are local-only by default (`.browserbash/cache` is gitignored by
 *   `init`) and regenerated per machine, so the "malicious committed blob"
 *   vector is out of scope unless a user opts into committing the cache.
 * - Values that came from variables are re-templatized to {{name}} before they
 *   touch disk, so journals never contain secret values.
 * - Every action records the origin it ran on. At replay, any action whose
 *   input carries a variable token is origin-pinned: if the live page origin
 *   differs from the recorded one, replay fails closed with no heal and no
 *   substitution. This stops app redirects, environment drift, and partial
 *   tampering (e.g. editing only a navigate URL) from steering a substituted
 *   secret onto an unexpected origin.
 * - Not yet covered: a fully rewritten journal (attacker edits the navigate
 *   AND every recorded origin to match) would pass the pin. Signing journals
 *   with a per-machine/CI HMAC is the tracked follow-up before committing
 *   caches is recommended.
 */

export const JOURNAL_SCHEMA_VERSION = 1;

export interface RecordedAction {
    tool: 'navigate' | 'click' | 'type_text' | 'wait_for' | 'extract';
    /** Tool input with concrete selectors and {{name}} tokens, never values. */
    input: Record<string, unknown>;
    /** Normalized URL (origin + pathname) the page showed before the action. */
    urlBefore: string;
    /** Page origin before the action; pin for secret-carrying inputs. */
    origin: string;
    /** True when any input string contains a {{variable}} token. */
    carriesVariables: boolean;
}

export interface ActionJournal {
    v: number;
    engine: 'builtin';
    recordedModel: string;
    variableKeys: string[];
    startUrl?: string;
    actions: RecordedAction[];
    stats: { hits: number; heals: number };
}

/** Cache key: templated objective + sorted variable KEYS + startUrl. */
export function journalKey(templatedObjective: string, variables: Record<string, VariableValue>, startUrl?: string): string {
    const material = [
        'builtin',
        templatedObjective,
        Object.keys(variables).sort().join(','),
        startUrl ?? '',
        `v${JOURNAL_SCHEMA_VERSION}`,
    ].join('\n');
    return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

export function journalPath(cacheDir: string, key: string): string {
    return path.resolve(cacheDir, 'builtin', `${key}.json`);
}

export function loadJournal(file: string): ActionJournal | null {
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as ActionJournal;
        if (raw.v !== JOURNAL_SCHEMA_VERSION || raw.engine !== 'builtin' || !Array.isArray(raw.actions)) return null;
        return raw;
    } catch {
        return null;
    }
}

export function saveJournal(file: string, journal: ActionJournal): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(journal, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, file);
}

export function deleteJournal(file: string): void {
    try {
        fs.rmSync(file, { force: true });
    } catch {
        // best-effort
    }
}

/**
 * Replace every variable VALUE in a string with its {{name}} token, longest
 * value first so overlapping values cannot leave fragments behind. This is
 * what keeps secrets out of journals.
 */
export function retemplatize(text: string, variables: Record<string, VariableValue>): string {
    let out = text;
    const entries = Object.entries(variables)
        .filter(([, v]) => v.value.length > 0)
        .sort((a, b) => b[1].value.length - a[1].value.length);
    for (const [name, v] of entries) {
        out = out.split(v.value).join(`{{${name}}}`);
    }
    return out;
}

export function retemplatizeInput(
    input: Record<string, unknown>,
    variables: Record<string, VariableValue>,
): { input: Record<string, unknown>; carriesVariables: boolean } {
    let carries = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
        if (typeof v === 'string') {
            const t = retemplatize(v, variables);
            if (/\{\{\s*[\w.-]+\s*\}\}/.test(t)) carries = true;
            out[k] = t;
        } else {
            out[k] = v;
        }
    }
    return { input: out, carriesVariables: carries };
}

/** Origin + normalized path for URL fingerprints; never query strings. */
export function normalizeUrl(url: string): { origin: string; normalized: string } {
    try {
        const u = new URL(url);
        return { origin: u.origin, normalized: `${u.origin}${u.pathname.replace(/\/$/, '') || '/'}` };
    } catch {
        return { origin: '', normalized: url };
    }
}
