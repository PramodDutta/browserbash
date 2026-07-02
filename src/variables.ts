import fs from 'node:fs';
import path from 'node:path';
import { configDir, projectDir } from './config.js';
import type { VariableValue } from './types.js';

/**
 * Variable load order (highest priority last):
 *   1. Global:  ~/.browserbash/variables/*.json
 *   2. Project: ./.browserbash/variables/*.json
 *   3. --variables-file <path>
 *   4. --variables '<json>'
 *
 * File format: { "key": "value" } or { "key": { "value": "v", "secret": true } }
 */
export function loadVariables(varsFlag?: string, varsFile?: string): Record<string, VariableValue> {
    const merged: Record<string, VariableValue> = {};

    const dirs = [
        path.join(configDir(), 'variables'),
        path.join(projectDir(), 'variables'),
    ];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
            Object.assign(merged, parseVarFile(path.join(dir, f)));
        }
    }

    if (varsFile) {
        Object.assign(merged, parseVarFile(varsFile));
    }
    if (varsFlag) {
        Object.assign(merged, normalize(JSON.parse(varsFlag) as Record<string, unknown>));
    }
    return merged;
}

function parseVarFile(file: string): Record<string, VariableValue> {
    try {
        return normalize(JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>);
    } catch (err) {
        throw new Error(`Failed to parse variables file ${file}: ${(err as Error).message}`);
    }
}

function normalize(raw: Record<string, unknown>): Record<string, VariableValue> {
    const out: Record<string, VariableValue> = {};
    for (const [key, val] of Object.entries(raw)) {
        if (val !== null && typeof val === 'object' && 'value' in (val as object)) {
            const obj = val as { value: unknown; secret?: boolean };
            out[key] = { value: String(obj.value), secret: obj.secret === true };
        } else {
            out[key] = { value: String(val) };
        }
    }
    return out;
}

/** Substitute {{key}} placeholders. Throws on unknown keys so typos fail fast. */
export function substitute(text: string, vars: Record<string, VariableValue>): string {
    return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
        const found = vars[key];
        if (found === undefined) {
            throw new Error(`Unknown variable {{${key}}} — define it in variables or pass --variables`);
        }
        return found.value;
    });
}

/** Mask secret values in any outbound string (logs, NDJSON remarks).
 * Case-insensitive: error paths can case-transform secrets (e.g. DNS lowercases
 * hostnames in getaddrinfo messages), and a case-shifted leak is still a leak. */
export function maskSecrets(text: string, vars: Record<string, VariableValue>): string {
    let masked = text;
    for (const v of Object.values(vars)) {
        if (v.secret && v.value.length > 0) {
            const escaped = v.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            masked = masked.replace(new RegExp(escaped, 'gi'), '*****');
        }
    }
    return masked;
}

export function maskSecretRecord(
    record: Record<string, string>,
    vars: Record<string, VariableValue>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, maskSecrets(value, vars)]),
    );
}
