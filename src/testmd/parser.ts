import fs from 'node:fs';
import path from 'node:path';

export interface TestMdFile {
    title: string;
    steps: string[];
    sourcePath: string;
    /** 1 = classic whole-objective execution; 2 = per-step execution. */
    version: 1 | 2;
    /** Saved auth profile name from frontmatter (overridden by --auth). */
    auth?: string;
}

/**
 * Optional YAML-lite frontmatter between --- fences at the very top:
 *   ---
 *   version: 2
 *   auth: admin
 *   ---
 * Only flat `key: value` lines are read — this is deliberately not YAML.
 */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
    if (!raw.startsWith('---')) return { meta: {}, body: raw };
    const end = raw.indexOf('\n---', 3);
    if (end === -1) return { meta: {}, body: raw };
    const meta: Record<string, string> = {};
    for (const line of raw.slice(3, end).split('\n')) {
        const m = line.match(/^\s*([\w.-]+)\s*:\s*(.+?)\s*$/);
        if (m) meta[m[1]] = m[2];
    }
    return { meta, body: raw.slice(end + 4) };
}

/**
 * Parse a *_test.md file:
 *   ---frontmatter---     → version / auth (optional)
 *   # Title               → test name
 *   - step text           → ordered plain-English steps (also supports 1. lists)
 *   @import ./helper.md   → splice steps from another file (relative path)
 *
 * Everything else (prose, headings below h1) is ignored, so files stay
 * readable / reviewable as normal Markdown.
 */
export function parseTestMd(filePath: string, seen: Set<string> = new Set()): TestMdFile {
    const absolute = path.resolve(filePath);
    if (seen.has(absolute)) {
        throw new Error(`Circular @import detected: ${absolute}`);
    }
    seen.add(absolute);

    if (!fs.existsSync(absolute)) {
        throw new Error(`Test file not found: ${absolute}`);
    }
    const raw = fs.readFileSync(absolute, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);

    const version = meta.version === '2' ? 2 : 1;
    if (meta.version !== undefined && meta.version !== '1' && meta.version !== '2') {
        throw new Error(`Unsupported testmd version '${meta.version}' in ${absolute} — use 1 or 2`);
    }

    let title = path.basename(absolute).replace(/_test\.md$/, '');
    const steps: string[] = [];

    for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ') && title === path.basename(absolute).replace(/_test\.md$/, '')) {
            title = trimmed.slice(2).trim();
            continue;
        }
        const importMatch = trimmed.match(/^@import\s+(.+)$/);
        if (importMatch) {
            const importedPath = path.resolve(path.dirname(absolute), importMatch[1].trim());
            steps.push(...parseTestMd(importedPath, seen).steps);
            continue;
        }
        const stepMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
        if (stepMatch) {
            steps.push(stepMatch[1].trim());
        }
    }

    if (steps.length === 0) {
        throw new Error(`No steps found in ${absolute} — add "- <step>" list items`);
    }
    return { title, steps, sourcePath: absolute, version, auth: meta.auth };
}
